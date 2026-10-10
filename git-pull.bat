@echo off
setlocal
REM Pull origin main into this intern safar clone.

cd /d "%~dp0"
if not exist ".git" (
  echo Not a git repository.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-pull.ps1"
set ERR=%ERRORLEVEL%
echo.
pause
exit /b %ERR%
