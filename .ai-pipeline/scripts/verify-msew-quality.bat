@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-msew-quality.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING/ERROR] MSEW Quality Check failed with code %ERRORLEVEL%.
    pause
)
