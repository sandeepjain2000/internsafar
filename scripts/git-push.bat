@echo off
setlocal
REM Commit tracked changes and push to origin main.
REM Usage:
REM   scripts\git-push.bat
REM   scripts\git-push.bat "Your commit message"

cd /d "%~dp0.."
if not exist ".git" (
  echo Not a git repository.
  exit /b 1
)

if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-push.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-push.ps1" -Message "%*"
)
exit /b %ERRORLEVEL%
