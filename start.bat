@echo off
echo ==========================================
echo   Aqua Music - 水滴玻璃音乐播放器
echo ==========================================
echo.

:: Start backend
echo [1/2] 启动后端服务 (port 3200)...
cd /d "%~dp0server"
start "Aqua Music Server" cmd /c "node src/index.js"

:: Wait for backend
timeout /t 2 /nobreak >nul

:: Start frontend
echo [2/2] 启动前端界面 (port 5173)...
cd /d "%~dp0client"
start "Aqua Music Client" cmd /c "npx vite --host"

echo.
echo ==========================================
echo   启动完成！
echo   前端: http://localhost:5173
echo   后端: http://localhost:3200/api
echo ==========================================
