@echo off
:: ============================================================
::  Run this ONCE on each GAMING PC (PC1, PC2, PC3, PC4)
::  as Administrator.
::  It sets up C:\GameTimer\ and a startup Task.
:: ============================================================

echo.
echo  =========================================
echo   Gaming Cafe Timer -- PC Setup Script
echo  =========================================
echo.

:: 1. Create timer folder
if not exist "C:\GameTimer" (
    mkdir "C:\GameTimer"
    echo [OK] Created C:\GameTimer
) else (
    echo [OK] C:\GameTimer already exists
)

:: 2. Copy timer.ps1 to C:\GameTimer\
:: (Run this batch from the same folder as timer.ps1, OR update the path below)
set SCRIPT_SOURCE=%~dp0..\timer.ps1
if exist "%SCRIPT_SOURCE%" (
    copy /Y "%SCRIPT_SOURCE%" "C:\GameTimer\timer.ps1" >nul
    echo [OK] Copied timer.ps1 to C:\GameTimer\
) else (
    echo [!!] Could not find timer.ps1 at: %SCRIPT_SOURCE%
    echo      Manually copy timer.ps1 to C:\GameTimer\timer.ps1
)

:: 3. Allow PowerShell scripts to run (RemoteSigned)
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force"
echo [OK] PowerShell execution policy set to RemoteSigned

:: 4. Create a Scheduled Task that runs timer.ps1 at EVERY login (all users)
schtasks /Create /TN "GamingCafeTimer" /TR "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\GameTimer\timer.ps1" /SC ONLOGON /RU SYSTEM /RL HIGHEST /F >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Scheduled Task "GamingCafeTimer" created ^(runs at logon^)
) else (
    echo [!!] Failed to create task. Try running this script as Administrator.
)

:: 5. Share C:\GameTimer\ over the network so the control server can reach it
::    (Needed if you use SMB instead of PsExec for file writes)
net share GameTimer=C:\GameTimer /GRANT:Everyone,FULL >nul 2>&1
echo [OK] Network share \\%COMPUTERNAME%\GameTimer created

:: 6. Open Windows Firewall for PsExec (File & Printer Sharing)
netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes >nul 2>&1
echo [OK] Firewall: File and Printer Sharing enabled

:: 7. Enable Remote Registry (needed for PsExec)
sc config RemoteRegistry start= auto >nul 2>&1
sc start  RemoteRegistry            >nul 2>&1
echo [OK] RemoteRegistry service enabled

echo.
echo  =========================================
echo   Setup complete on this PC!
echo   Reboot so the timer starts at next login.
echo  =========================================
echo.
pause
