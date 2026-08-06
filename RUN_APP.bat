@echo off
title MADEC KPI Analytics Dashboard 2027
color 0B
cls

echo ========================================================
echo         MADEC KPI ANALYTICS DASHBOARD 2027
echo ========================================================
echo.
echo  [+] Lancement du serveur d'application Flask...
echo  [+] Ouverture automatique de http://127.0.0.1:5000 dans votre navigateur...
echo.

cd /d "%~dp0"

timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:5000

python -u run_app.py

pause
