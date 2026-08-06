@echo off
REM Sends a lock command to the local station. Any running game is closed and
REM the lock screen returns.

set MOSQUITTO=C:\Program Files\mosquitto\mosquitto_pub.exe
set STATION=pc-01
set BROKER=127.0.0.1

"%MOSQUITTO%" -h %BROKER% -t "cafe/station/%STATION%/command" -m "{\"action\":\"lock\"}"

if errorlevel 1 (
  echo.
  echo Failed. Check that Mosquitto is installed at %MOSQUITTO% and the broker is running.
) else (
  echo Lock sent to %STATION%.
)

pause
