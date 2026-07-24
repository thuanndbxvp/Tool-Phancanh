@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-pipeline.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Health Check failed with code %ERRORLEVEL%.
    pause
)
