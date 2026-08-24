@echo off
cd /d "%~dp0.."
node scripts/check-ip-db-integrity.mjs %*
exit /b %ERRORLEVEL%
