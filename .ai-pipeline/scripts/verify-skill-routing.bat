@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-skill-routing.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING/ERROR] Skill Routing Check failed with code %ERRORLEVEL%.
    pause
)
