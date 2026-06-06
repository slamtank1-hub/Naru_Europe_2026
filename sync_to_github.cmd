@echo off
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"
echo Current folder: %CD%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync_to_github.ps1" %*
