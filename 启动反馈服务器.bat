@echo off
rem ---------------------------------------------------------------------------
rem  WW1936 local feedback server launcher.
rem  NOTE: this file must stay PURE ASCII. cmd.exe parses batch files in byte
rem  offsets and a UTF-8 Chinese line gets split mid-sequence -> "xxx is not
rem  recognized as an internal or external command". All Chinese wording lives
rem  in feedback-server.js (which prints UTF-8 correctly after chcp 65001).
rem ---------------------------------------------------------------------------
chcp 65001 >nul
setlocal
title WW1936 Feedback Server - writes to D:\Qst
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [x] Node.js not found. Install it first: https://nodejs.org/
  echo       The game still works without it ^(feedback will ask for a folder once^).
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting local feedback server ...
echo   Game page : http://127.0.0.1:8765/
echo   Feedback  : D:\Qst\feedback_YYYYMMDD-HHMMSS.txt
echo.
echo   Keep this window open - closing it stops the server.
echo.

rem wait 1s so the port is listening before the browser opens
ping -n 2 127.0.0.1 >nul
start "" "http://127.0.0.1:8765/"

node "%~dp0feedback-server.js"
echo.
echo   Server stopped. Press any key to close.
pause >nul
