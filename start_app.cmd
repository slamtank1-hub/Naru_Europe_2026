@echo off
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_app.ps1"
