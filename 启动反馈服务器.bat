@echo off
chcp 65001 >nul
setlocal
title 世界大战 1936 · 本机反馈服务器（保存到 D:\Qst）
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [x] 没有找到 Node.js，反馈服务器无法启动。
  echo       请先安装 Node.js ^(https://nodejs.org^)，然后重新双击本文件。
  echo       不装也能玩：游戏里提交反馈时会让你选一次文件夹，同样存到 D:\Qst。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动本机反馈服务器 ...
echo   游戏会自动在浏览器里打开（http://127.0.0.1:8765/）
echo   反馈文件直接写进 D:\Qst
echo.
echo   提示：这个黑窗口不要关，关掉就等于服务器停止。
echo         关掉后游戏仍可玩，只是提交反馈时会退回「选一次文件夹」模式。
echo.

rem 等 1 秒让 node 先把端口监听起来，再开浏览器，避免首次打开时白屏/拒绝连接
ping -n 2 127.0.0.1 >nul
start "" "http://127.0.0.1:8765/"

node "%~dp0feedback-server.js"
echo.
echo   反馈服务器已停止。按任意键关闭窗口。
pause >nul
