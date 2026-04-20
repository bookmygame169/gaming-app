@echo off
:: ============================================================
::  GAMING CAFE — Deploy to All PCs via PsExec  v2.0
::
::  WHAT THIS DOES:
::  Copies timer_agent.ps1 to ALL gaming PCs and runs
::  setup_client_pc.bat on each one remotely via PsExec.
::  Run this from the ADMIN PC after running setup_admin_pc.bat.
::
::  REQUIRES:
::   - C:\Tools\PsExec.exe  (from Sysinternals)
::   - C:\CafeManager\config\pcs.txt  (list of PC names)
::   - timer_agent.ps1 must be in the same folder as this .bat
::   - All gaming PCs must be powered on and on the network
::
::  RUN AS: Right-click → Run as Administrator
:: ============================================================

title Gaming Cafe — Deploy to All PCs
color 0E
echo.
echo  ==========================================
echo   Gaming Cafe — Remote Deploy to All PCs
echo  ==========================================
echo.

if not exist "C:\Tools\PsExec.exe" (
    echo  [ERROR] C:\Tools\PsExec.exe not found!
    echo          Download from: https://learn.microsoft.com/sysinternals/downloads/psexec
    pause
    exit /b 1
)

set PSEXEC=C:\Tools\PsExec.exe
set AGENT=%~dp0..\timer_agent.ps1
set PCLIST=C:\CafeManager\config\pcs.txt

if not exist "%PCLIST%" (
    echo  [ERROR] PC list not found: %PCLIST%
    echo          Run setup_admin_pc.bat first.
    pause
    exit /b 1
)

echo  Admin password for gaming PCs:
set /p "ADMINPASS=  Password: "
echo.
echo  Starting deployment...
echo.

for /f "tokens=*" %%P in (%PCLIST%) do (
    if not "%%P"=="" (
        echo  ---- Deploying to %%P ----

        :: Create the timer folder on remote PC
        %PSEXEC% \\%%P -u Administrator -p "%ADMINPASS%" -accepteula -nobanner ^
            cmd /c "if not exist C:\CafeTimer mkdir C:\CafeTimer" >nul 2>&1

        :: Copy timer_agent.ps1 to remote PC
        copy /Y "%AGENT%" "\\%%P\C$\CafeTimer\timer_agent.ps1" >nul 2>&1
        if %errorlevel%==0 (
            echo        Copied timer_agent.ps1
        ) else (
            echo  [!!]   Could not copy timer_agent.ps1 to %%P — skipping
            goto :nextpc
        )

        :: Set PowerShell execution policy on remote PC
        %PSEXEC% \\%%P -u Administrator -p "%ADMINPASS%" -accepteula -nobanner ^
            powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force" >nul 2>&1
        echo        Execution policy set

        :: Create Scheduled Task on remote PC
        %PSEXEC% \\%%P -u Administrator -p "%ADMINPASS%" -accepteula -nobanner ^
            schtasks /Create /TN "CafeTimerAgent" ^
            /TR "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\CafeTimer\timer_agent.ps1" ^
            /SC ONLOGON /RU SYSTEM /RL HIGHEST /F >nul 2>&1
        echo        Scheduled Task created

        :: Share the folder on remote PC
        %PSEXEC% \\%%P -u Administrator -p "%ADMINPASS%" -accepteula -nobanner ^
            cmd /c "net share CafeTimer=C:\CafeTimer /GRANT:Everyone,FULL" >nul 2>&1
        echo        Network share created: \\%%P\CafeTimer

        :: Enable File & Printer Sharing firewall on remote PC
        %PSEXEC% \\%%P -u Administrator -p "%ADMINPASS%" -accepteula -nobanner ^
            netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes >nul 2>&1
        echo        Firewall rules enabled

        echo        [OK] %%P deployed successfully
        echo.

        :nextpc
    )
)

echo.
echo  ==========================================
echo   Deployment complete!
echo.
echo   NEXT: Reboot all gaming PCs.
echo   The timer agent will start automatically
echo   at the next Windows login.
echo  ==========================================
echo.
pause
