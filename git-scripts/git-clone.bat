@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-clone.ps1" %*
set EXITCODE=%ERRORLEVEL%
echo.
if %EXITCODE% neq 0 (
  echo git-clone failed with exit code %EXITCODE%.
) else (
  echo git-clone finished.
)
pause
exit /b %EXITCODE%
