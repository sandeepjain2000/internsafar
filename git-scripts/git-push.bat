@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-push.ps1" %*
set EXITCODE=%ERRORLEVEL%
echo.
if %EXITCODE% neq 0 (
  echo git-push failed with exit code %EXITCODE%.
) else (
  echo git-push finished.
)
pause
exit /b %EXITCODE%
