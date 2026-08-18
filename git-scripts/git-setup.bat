@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-setup.ps1" %*
set EXITCODE=%ERRORLEVEL%
echo.
if %EXITCODE% neq 0 (
  echo git-setup failed with exit code %EXITCODE%.
) else (
  echo git-setup finished.
)
pause
exit /b %EXITCODE%
