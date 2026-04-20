@echo off
:: Double-click this to start the Gaming Cafe Control Server
title Gaming Cafe Control Server

echo.
echo  Starting Gaming Cafe Control Server...
echo.

:: Find this script's folder (where control_server.py lives)
cd /d "%~dp0"

:: Print the local IP so you know what to type on your phone
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%

echo  Open on your phone:  http://%IP%:5000
echo  Password:            cafe1234   (change in config.json)
echo.
echo  Press Ctrl+C to stop the server.
echo.

python control_server.py
pause
