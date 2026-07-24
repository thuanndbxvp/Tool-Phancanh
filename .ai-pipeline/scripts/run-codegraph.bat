@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-codegraph.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] CodeGraph failed with code %ERRORLEVEL%.
    pause
)
