@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-pull.ps1" %*
set EXITCODE=%ERRORLEVEL%
echo.
if %EXITCODE% neq 0 (
  echo git-pull failed with exit code %EXITCODE%.
) else (
  echo git-pull finished.
)
pause
exit /b %EXITCODE%
