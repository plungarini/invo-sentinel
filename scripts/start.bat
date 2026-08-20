@echo off
REM Starts everything - the daemon AND the dashboard UI (if this release
REM includes one and Node.js is available) - from a single double-click.
REM The actual daemon binary lives in bin\ (not next to this script)
REM specifically so there's only one obvious thing to double-click at the
REM top level - see GETTING-STARTED.txt. The daemon itself logs fatal errors
REM and exits non-zero rather than dying silently; that's what actually
REM brings it back up here. State (bin\data\sentinel.db) and bin\logs\ both
REM live inside bin\, alongside the binary that owns them, and persist
REM across restarts.
REM
REM Also owns the auto-update swap (src/services/self-updater.ts stages a
REM new release under bin\.update\ and exits; this loop does the actual file
REM swap with the daemon fully exited, then relaunches) and a crash-loop
REM rollback: if the daemon crashes quickly right after a swap, twice in a
REM row, the previous version is restored and that release is blacklisted
REM (bin\.update\rollback-blocked-<version>.json) so it's never auto-retried.
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

call :start_ui

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

:start_ui
REM The dashboard UI is a separate Node.js process (ui\server.js, present
REM only if this release includes it) - started alongside the daemon, not
REM instead of it. Node itself isn't bundled (unlike the daemon, which is a
REM self-contained .exe), so this is skipped with a clear message if it's
REM missing rather than failing silently.
if exist ui\server.js (
	where node >nul 2>nul
	if errorlevel 1 (
		echo [start] Node.js not found - the dashboard UI needs it, the daemon does not.
		echo [start] Install Node from https://nodejs.org, then re-run start.bat for the UI too.
	) else (
		start "Invo Sentinel UI" /MIN cmd /c "cd /d "%~dp0ui" && set PORT=4400 && node server.js >> "%~dp0bin\logs\ui.log" 2>&1"
		start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:4400"
	)
)
exit /b 0

:stop_ui
taskkill /FI "WINDOWTITLE eq Invo Sentinel UI*" /T /F >nul 2>nul
exit /b 0

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

call :stop_ui

if exist bin\invo-sentinel.exe.prev (
	del /q bin\invo-sentinel.exe 2>nul
	move /y bin\invo-sentinel.exe.prev bin\invo-sentinel.exe >nul
)
if exist ui.prev (
	rd /s /q ui 2>nul
	move /y ui.prev ui >nul
)
if exist node_modules.prev (
	rd /s /q node_modules 2>nul
	move /y node_modules.prev node_modules >nul
)

if defined BAD_VERSION type nul > "bin\.update\rollback-blocked-!BAD_VERSION!.json"

del /q bin\.update\just-updated 2>nul
del /q bin\.update\crash-count 2>nul
del /q bin\.update\pending-version-applied 2>nul

call :start_ui
exit /b 0

REM The actual file swap for a staged update (src/services/self-updater.ts
REM downloads+verifies+extracts to bin\.update\staging\ and exits; this runs
REM with the daemon fully exited, so there's no self-file-lock hazard).
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

call :stop_ui

if exist bin\invo-sentinel.exe.prev del /q bin\invo-sentinel.exe.prev
move /y bin\invo-sentinel.exe bin\invo-sentinel.exe.prev >nul
move /y bin\.update\staging\bin\invo-sentinel.exe bin\invo-sentinel.exe >nul

if exist ui.prev rd /s /q ui.prev
if exist ui move /y ui ui.prev >nul
if exist bin\.update\staging\ui move /y bin\.update\staging\ui ui >nul

if exist node_modules.prev rd /s /q node_modules.prev
if exist node_modules move /y node_modules node_modules.prev >nul
if exist bin\.update\staging\node_modules move /y bin\.update\staging\node_modules node_modules >nul

echo !NEW_VERSION! > bin\.update\pending-version-applied
type nul > bin\.update\just-updated
del /q bin\.update\pending.json 2>nul
del /q bin\.update\pending-version.txt 2>nul
rd /s /q bin\.update\staging 2>nul

call :start_ui
echo [start] update to !NEW_VERSION! applied
exit /b 0
