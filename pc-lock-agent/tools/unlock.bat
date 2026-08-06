@echo off
REM Sends an unlock command to the local station, as the backend eventually will.
REM Run this while the agent is already running and connected to the broker.

set MOSQUITTO=C:\Program Files\mosquitto\mosquitto_pub.exe
set STATION=pc-01
set BROKER=127.0.0.1

"%MOSQUITTO%" -h %BROKER% -t "cafe/station/%STATION%/command" -m "{\"action\":\"unlock\",\"duration_seconds\":3600,\"session_id\":\"test-1\"}"

if errorlevel 1 (
  echo.
  echo Failed. Check that Mosquitto is installed at %MOSQUITTO% and the broker is running.
) else (
  echo Unlock sent to %STATION%.
)

pause
