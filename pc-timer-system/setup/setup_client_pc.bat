@echo off
:: ============================================================
::  GAMING CAFE — Client PC Setup Script  v2.0
::
::  WHAT THIS DOES:
::  Run this ONCE on each GAMING PC as Administrator.
::  Creates C:\CafeTimer\, copies the timer agent, creates a
::  startup Task Scheduler entry, shares the folder on the
::  network, and hardens permissions so gamers can't tamper.
::
::  RUN AS: Right-click → Run as Administrator
::  COPY:   timer_agent.ps1 must be in the same folder as this .bat
:: ============================================================

title Gaming Cafe — Client PC Setup
color 0A
echo.
echo  ==========================================
echo   Gaming Cafe Timer Agent  —  Client Setup
echo  ==========================================
echo.
echo  PC Name: %COMPUTERNAME%
echo.

:: Check admin rights
net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo  [ERROR] Please run this script as Administrator!
    echo          Right-click → Run as Administrator
    pause
    exit /b 1
)

:: ---- 1. Create timer folder ----
echo  [1/8] Creating C:\CafeTimer...
if not exist "C:\CafeTimer" (
    mkdir "C:\CafeTimer"
    echo        Created.
) else (
    echo        Already exists — OK.
)

:: ---- 2. Copy timer_agent.ps1 ----
echo  [2/8] Copying timer_agent.ps1...
set AGENT_SOURCE=%~dp0..\timer_agent.ps1
if exist "%AGENT_SOURCE%" (
    copy /Y "%AGENT_SOURCE%" "C:\CafeTimer\timer_agent.ps1" >nul
    echo        Copied to C:\CafeTimer\timer_agent.ps1
) else (
    echo  [!!]   timer_agent.ps1 not found at: %AGENT_SOURCE%
    echo         Please copy it manually to C:\CafeTimer\timer_agent.ps1
)

:: ---- 3. Set PowerShell execution policy ----
echo  [3/8] Setting PowerShell execution policy...
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force" >nul 2>&1
echo        Done (RemoteSigned).

:: ---- 4. Create Scheduled Task (runs at every user login as SYSTEM) ----
echo  [4/8] Creating Scheduled Task "CafeTimerAgent"...
schtasks /Delete /TN "CafeTimerAgent" /F >nul 2>&1
schtasks /Create ^
    /TN "CafeTimerAgent" ^
    /TR "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\CafeTimer\timer_agent.ps1" ^
    /SC ONLOGON ^
    /RU SYSTEM ^
    /RL HIGHEST ^
    /F >nul 2>&1
if %errorlevel%==0 (
    echo        Task created. Runs as SYSTEM at every logon.
) else (
    echo  [!!]   Failed to create task. Are you running as Admin?
)

:: ---- 5. Share C:\CafeTimer on the network ----
echo  [5/8] Creating network share \\%COMPUTERNAME%\CafeTimer...
net share CafeTimer /Delete >nul 2>&1
net share CafeTimer=C:\CafeTimer /GRANT:Everyone,FULL >nul 2>&1
if %errorlevel%==0 (
    echo        Share created: \\%COMPUTERNAME%\CafeTimer
) else (
    echo  [!!]   Could not create share. Check if folder exists.
)

:: ---- 6. Harden folder permissions (gamers cannot modify or delete files) ----
echo  [6/8] Hardening C:\CafeTimer permissions...
:: Remove inherited permissions
icacls "C:\CafeTimer" /inheritance:r >nul 2>&1
:: SYSTEM and Administrators: Full control
icacls "C:\CafeTimer" /grant "SYSTEM:(OI)(CI)F"         >nul 2>&1
icacls "C:\CafeTimer" /grant "Administrators:(OI)(CI)F" >nul 2>&1
:: Users (gamers): Read + Execute only — cannot delete or write
icacls "C:\CafeTimer" /grant "Users:(OI)(CI)RX"         >nul 2>&1
echo        Permissions set. Gamers cannot tamper with timer files.

:: ---- 7. Open firewall for File & Printer Sharing (needed for network share) ----
echo  [7/8] Enabling firewall rules...
netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes >nul 2>&1
netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes >nul 2>&1
echo        Firewall: File & Printer Sharing enabled.

:: ---- 8. Enable Remote Registry (needed for PsExec) ----
echo  [8/8] Enabling RemoteRegistry service...
sc config RemoteRegistry start= auto >nul 2>&1
sc start  RemoteRegistry             >nul 2>&1
echo        RemoteRegistry enabled.

echo.
echo  ==========================================
echo   Setup complete on %COMPUTERNAME%!
echo.
echo   NEXT STEP: Reboot this PC.
echo   After reboot the timer agent starts
echo   automatically and waits for sessions.
echo  ==========================================
echo.
pause
