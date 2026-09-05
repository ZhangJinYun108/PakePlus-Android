@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   个人管理 App - 本地预览
echo   ------------------------
echo   地址: http://127.0.0.1:5180/index.html
echo   关闭此窗口即停止服务
echo.
start "" "http://127.0.0.1:5180/index.html"
"%USERPROFILE%\.workbuddy\binaries\python\versions\3.13.12\python.exe" -m http.server 5180 --bind 127.0.0.1
pause
