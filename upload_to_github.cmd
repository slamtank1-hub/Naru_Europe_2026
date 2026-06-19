@echo off
chcp 65001 > nul
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upload_to_github.ps1" %*
