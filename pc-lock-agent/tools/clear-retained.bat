@echo off
REM Clears a retained command left on the station's command topic.
REM
REM Publishing with -r makes the broker keep the message and hand it to the
REM agent every time it connects. That is handy for testing (start the agent and
REM it unlocks immediately, no second terminal needed) but means the station will
REM keep unlocking on every start until the retained message is cleared.
REM
REM The real backend must never publish commands retained: a stale unlock would
REM replay on every station reconnect and open a PC nobody paid for.

set MOSQUITTO=C:\Program Files\mosquitto\mosquitto_pub.exe
set STATION=PC-01
set BROKER=127.0.0.1

"%MOSQUITTO%" -h %BROKER% -t "cafe/station/%STATION%/command" -r -n

if errorlevel 1 (
  echo.
  echo Failed. Check that Mosquitto is installed at %MOSQUITTO% and the broker is running.
) else (
  echo Retained command cleared for %STATION%.
)

pause
