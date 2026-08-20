@echo off
REM Starts the daemon - from a single double-click. Everything internal -
REM the daemon binary, the dashboard UI's own files, its node_modules, and
REM all runtime state (data\, logs\) - lives inside bin\, so this top-level
REM folder only ever holds this script plus the docs a user actually reads
REM - see GETTING-STARTED.txt. The daemon itself logs fatal errors and
REM exits non-zero rather than dying silently; that's what actually brings
REM it back up here. State (bin\data\sentinel.db) and bin\logs\ persist
REM across restarts.
REM
REM The dashboard UI is started and supervised by the daemon itself
REM (src/services/ui-supervisor.ts, via Node's own child_process - hidden
REM on Windows via `windowsHide`, no separate console window and no
REM OS-specific script needed here), not by this wrapper - this script only
REM ever runs the one daemon process.
REM
REM Also owns the auto-update swap (src/services/self-updater.ts stages a
REM new release under bin\.update\ and exits; this loop does the actual file
REM swap with the daemon fully exited - which by then has already stopped
REM its own UI child, see ui-supervisor.ts - then relaunches) and a
REM crash-loop rollback: if the daemon crashes quickly right after a swap,
REM twice in a row, the previous version is restored and that release is
REM blacklisted (bin\.update\rollback-blocked-<version>.json) so it's never
REM auto-retried.
REM
REM Usage: start.bat [minMarginPct] [maxMarginPct] [--dry-run]
REM        start.bat --background   - launch detached, free this window immediately
setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%~1"=="--background" (
	start "Invo Sentinel" /MIN cmd /c "%~dpnx0" %2 %3 %4 %5
	exit /b 0
)

if not exist bin\logs mkdir bin\logs
if not exist bin\.update mkdir bin\.update

set RESTART_DELAY=5
set HEALTHY_RUN_SECONDS=20
set MAX_CRASH_RETRIES=2

:loop
call :apply_pending_update

for /f %%T in ('powershell -NoProfile -Command "Get-Date -UFormat %%s"') do set START_EPOCH=%%T

echo [start] starting %date% %time%
bin\invo-sentinel.exe %*
set EXIT_CODE=%errorlevel%

for /f %%T in ('powershell -NoProfile -Command "Get-Date -UFormat %%s"') do set END_EPOCH=%%T
set /a RUN_SECONDS=%END_EPOCH% - %START_EPOCH%
echo [start] exited with code %EXIT_CODE% after %RUN_SECONDS%s

if exist bin\.update\just-updated (
	if !RUN_SECONDS! GEQ %HEALTHY_RUN_SECONDS% (
		echo [start] new version ran cleanly for %RUN_SECONDS%s - update confirmed healthy
		del /q bin\.update\just-updated 2>nul
		del /q bin\.update\crash-count 2>nul
		del /q bin\.update\pending-version-applied 2>nul
	) else (
		call :record_update_crash
	)
)

echo [start] restarting in %RESTART_DELAY%s
timeout /t %RESTART_DELAY% /nobreak >nul
goto loop

:record_update_crash
set CRASH_COUNT=0
if exist bin\.update\crash-count (
	set /p CRASH_COUNT=<bin\.update\crash-count
)
set /a CRASH_COUNT+=1
echo !CRASH_COUNT! > bin\.update\crash-count
echo [start] new version crashed quickly (attempt !CRASH_COUNT!/%MAX_CRASH_RETRIES%)
if !CRASH_COUNT! GEQ %MAX_CRASH_RETRIES% call :rollback_update
exit /b 0

REM Restores the previous version's exe/ui/node_modules from the .prev
REM copies apply_pending_update always leaves behind, and permanently
REM blocks the crashing version from being auto-retried - the user has to
REM delete the rollback-blocked-<version>.json marker by hand to try it again.
:rollback_update
echo [start] rolling back to previous version - new build crash-looped
set BAD_VERSION=
if exist bin\.update\pending-version-applied set /p BAD_VERSION=<bin\.update\pending-version-applied

if exist bin\invo-sentinel.exe.prev (
	del /q bin\invo-sentinel.exe 2>nul
	move /y bin\invo-sentinel.exe.prev bin\invo-sentinel.exe >nul
)
if exist bin\ui.prev (
	rd /s /q bin\ui 2>nul
	move /y bin\ui.prev bin\ui >nul
)
if exist bin\node_modules.prev (
	rd /s /q bin\node_modules 2>nul
	move /y bin\node_modules.prev bin\node_modules >nul
)

if defined BAD_VERSION type nul > "bin\.update\rollback-blocked-!BAD_VERSION!.json"

del /q bin\.update\just-updated 2>nul
del /q bin\.update\crash-count 2>nul
del /q bin\.update\pending-version-applied 2>nul
exit /b 0

REM The actual file swap for a staged update (src/services/self-updater.ts
REM downloads+verifies+extracts to bin\.update\staging\ and exits; this runs
REM with the daemon fully exited - which by then has already stopped its
REM own UI child process - so there's no self-file-lock hazard).
REM Previous exe/ui/node_modules are kept as .prev for one run in case the
REM new version crash-loops (see :rollback_update above).
:apply_pending_update
if not exist bin\.update\pending.json exit /b 0
if not exist bin\.update\staging\bin\invo-sentinel.exe (
	echo [start] update marker present but staging incomplete - skipping, will retry next check
	del /q bin\.update\pending.json 2>nul
	exit /b 0
)

set NEW_VERSION=unknown
if exist bin\.update\pending-version.txt set /p NEW_VERSION=<bin\.update\pending-version.txt
echo [start] applying staged update to !NEW_VERSION!...

if exist bin\invo-sentinel.exe.prev del /q bin\invo-sentinel.exe.prev
move /y bin\invo-sentinel.exe bin\invo-sentinel.exe.prev >nul
move /y bin\.update\staging\bin\invo-sentinel.exe bin\invo-sentinel.exe >nul

if exist bin\ui.prev rd /s /q bin\ui.prev
if exist bin\ui move /y bin\ui bin\ui.prev >nul
if exist bin\.update\staging\bin\ui move /y bin\.update\staging\bin\ui bin\ui >nul

if exist bin\node_modules.prev rd /s /q bin\node_modules.prev
if exist bin\node_modules move /y bin\node_modules bin\node_modules.prev >nul
if exist bin\.update\staging\bin\node_modules move /y bin\.update\staging\bin\node_modules bin\node_modules >nul

echo !NEW_VERSION! > bin\.update\pending-version-applied
type nul > bin\.update\just-updated
del /q bin\.update\pending.json 2>nul
del /q bin\.update\pending-version.txt 2>nul
rd /s /q bin\.update\staging 2>nul

echo [start] update to !NEW_VERSION! applied
exit /b 0
