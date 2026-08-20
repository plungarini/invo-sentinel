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
REM Usage: start.bat [minMarginPct] [maxMarginPct] [--dry-run]
REM        start.bat --background   - launch detached, free this window immediately
setlocal
cd /d "%~dp0"

if "%~1"=="--background" (
	start "Invo Sentinel" /MIN cmd /c "%~dpnx0" %2 %3 %4 %5
	exit /b 0
)

if not exist bin\logs mkdir bin\logs

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

set RESTART_DELAY=5

:loop
echo [start] starting %date% %time%
bin\invo-sentinel.exe %*
echo [start] exited with code %errorlevel%, restarting in %RESTART_DELAY%s
timeout /t %RESTART_DELAY% /nobreak >nul
goto loop
