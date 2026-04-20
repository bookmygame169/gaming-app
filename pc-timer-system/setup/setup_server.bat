@echo off
:: ============================================================
::  Run this ONCE on the SERVER PC (the one running the
::  web control panel).  Requires internet to download Python.
:: ============================================================

echo.
echo  =========================================
echo   Gaming Cafe -- Control Server Setup
echo  =========================================
echo.

:: 1. Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!!] Python not found.
    echo      Download and install Python 3.11+ from:
    echo      https://www.python.org/downloads/
    echo      Make sure to check "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)
echo [OK] Python found

:: 2. Install Flask
pip install flask --quiet
echo [OK] Flask installed

:: 3. Create Tools folder and remind about PsExec
if not exist "C:\Tools" mkdir "C:\Tools"
echo.
echo  [ACTION REQUIRED]
echo  Download PsExec from:
echo    https://learn.microsoft.com/en-us/sysinternals/downloads/psexec
echo  Extract PsExec.exe to:  C:\Tools\PsExec.exe
echo.

:: 4. Open port 5000 in firewall
netsh advfirewall firewall add rule name="GamingCafeControlPanel" dir=in action=allow protocol=TCP localport=5000 >nul 2>&1
echo [OK] Firewall port 5000 opened

:: 5. Create desktop shortcut to start server
set SHORTCUT_TARGET=%~dp0..\start_server.bat
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\mklink.vbs"
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\Start Gaming Cafe Server.lnk" >> "%TEMP%\mklink.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\mklink.vbs"
echo oLink.TargetPath = "%SHORTCUT_TARGET%" >> "%TEMP%\mklink.vbs"
echo oLink.WindowStyle = 1 >> "%TEMP%\mklink.vbs"
echo oLink.Save >> "%TEMP%\mklink.vbs"
cscript //nologo "%TEMP%\mklink.vbs"
echo [OK] Desktop shortcut created: "Start Gaming Cafe Server"

echo.
echo  =========================================
echo   Server setup done!
echo   Next:
echo   1. Edit config.json with your PC IPs and passwords
echo   2. Copy PsExec.exe to C:\Tools\
echo   3. Double-click "Start Gaming Cafe Server" on Desktop
echo  =========================================
echo.
pause
