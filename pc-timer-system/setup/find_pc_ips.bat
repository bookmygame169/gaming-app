@echo off
:: Run this on each PC to find its IP address.
:: Then update config.json with the right IPs.

echo.
echo  === IP Address of THIS PC ===
echo.
ipconfig | findstr /c:"IPv4"
echo.
echo  Also check PC name:
hostname
echo.
pause
