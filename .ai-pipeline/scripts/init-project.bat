@echo off
:: Wrapper chạy PowerShell script vượt Execution Policy
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0init-project.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Pipeline init failed with code %ERRORLEVEL%.
    pause
)
