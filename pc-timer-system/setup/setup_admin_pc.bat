@echo off
:: ============================================================
::  GAMING CAFE — Admin PC Setup Script  v2.0
::
::  WHAT THIS DOES:
::  Run this ONCE on the ADMIN PC as Administrator.
::  Creates C:\CafeManager\, copies admin_panel.ps1 and config,
::  creates a desktop shortcut, opens firewall, and stores
::  network credentials for the gaming PCs.
::
::  RUN AS: Right-click → Run as Administrator
:: ============================================================

title Gaming Cafe — Admin PC Setup
color 0B
echo.
echo  ==========================================
echo   Gaming Cafe Control Panel — Admin Setup
echo  ==========================================
echo.

net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo  [ERROR] Run as Administrator!
    pause
    exit /b 1
)

:: ---- 1. Create folder structure ----
echo  [1/7] Creating C:\CafeManager folder structure...
if not exist "C:\CafeManager\config"  mkdir "C:\CafeManager\config"
if not exist "C:\CafeManager\logs"    mkdir "C:\CafeManager\logs"
if not exist "C:\CafeManager\tools"   mkdir "C:\CafeManager\tools"
if not exist "C:\Tools"               mkdir "C:\Tools"
echo        Folders created.

:: ---- 2. Copy admin panel and config ----
echo  [2/7] Copying admin panel files...
set SRC=%~dp0..
if exist "%SRC%\admin_panel.ps1" (
    copy /Y "%SRC%\admin_panel.ps1"        "C:\CafeManager\admin_panel.ps1"  >nul
    echo        Copied admin_panel.ps1
)
if exist "%SRC%\config\pcs.txt" (
    copy /Y "%SRC%\config\pcs.txt"         "C:\CafeManager\config\pcs.txt"   >nul
    echo        Copied config\pcs.txt
) else (
    echo PC01 > "C:\CafeManager\config\pcs.txt"
    echo PC02 >> "C:\CafeManager\config\pcs.txt"
    echo PC03 >> "C:\CafeManager\config\pcs.txt"
    echo PC04 >> "C:\CafeManager\config\pcs.txt"
    echo        Created default pcs.txt (edit to add your PC names)
)

:: ---- 3. PowerShell execution policy ----
echo  [3/7] Setting PowerShell execution policy...
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force" >nul 2>&1
echo        Done.

:: ---- 4. Create desktop shortcut ----
echo  [4/7] Creating desktop shortcut...
set SHORTCUT=%USERPROFILE%\Desktop\Cafe Control Panel.lnk
powershell -Command ^
  "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT%');$s.TargetPath='powershell.exe';$s.Arguments='-WindowStyle Hidden -ExecutionPolicy Bypass -File C:\CafeManager\admin_panel.ps1';$s.WorkingDirectory='C:\CafeManager';$s.IconLocation='%SystemRoot%\System32\imageres.dll,109';$s.Save()" >nul 2>&1
echo        Shortcut created on Desktop: "Cafe Control Panel"

:: ---- 5. Store network credentials for gaming PCs ----
echo  [5/7] Storing network credentials...
echo.
echo  Enter the Windows admin password for all gaming PCs.
echo  (All gaming PCs should have the same admin password)
echo.
set /p "PCPASS=  Admin password: "
echo.

:: Store credentials for each PC so Windows doesn't prompt every time
:: Edit the PC names in pcs.txt to match your actual PC hostnames
for /f "tokens=*" %%P in ("C:\CafeManager\config\pcs.txt") do (
    if not "%%P"=="" (
        cmdkey /add:%%P /user:Administrator /pass:%PCPASS% >nul 2>&1
        echo        Stored credentials for: %%P
    )
)

:: ---- 6. Open port 5000 for optional web panel ----
echo  [6/7] Opening firewall port 5000 (optional web panel)...
netsh advfirewall firewall add rule name="CafeWebPanel" dir=in action=allow protocol=TCP localport=5000 >nul 2>&1
echo        Port 5000 opened.

:: ---- 7. Remind about PsExec ----
echo  [7/7] PsExec check...
if exist "C:\Tools\PsExec.exe" (
    echo        PsExec.exe found at C:\Tools\PsExec.exe — OK!
) else (
    echo.
    echo  [ACTION REQUIRED] PsExec not found!
    echo  Download from:  https://learn.microsoft.com/sysinternals/downloads/psexec
    echo  Extract PsExec.exe to:  C:\Tools\PsExec.exe
    echo.
)

echo.
echo  ==========================================
echo   Admin PC setup complete!
echo.
echo   To start the control panel:
echo   Double-click "Cafe Control Panel" on Desktop
echo   Default PIN: 1234
echo.
echo   IMPORTANT: Edit C:\CafeManager\config\pcs.txt
echo   to list your actual PC names (one per line).
echo.
echo   IMPORTANT: Open admin_panel.ps1 in Notepad and
echo   update the CONFIGURATION section with your
echo   admin password.
echo  ==========================================
echo.
pause
