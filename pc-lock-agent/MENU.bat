@echo off
REM Double-click this to open the PC Lock menu.
REM
REM Exists so nothing needs typing into a terminal: PowerShell scripts cannot be
REM double-clicked to run, and Windows blocks .ps1 files by default. This works
REM around both.

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0menu.ps1"
