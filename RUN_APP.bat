@echo off
title MADEC KPI Analytics Dashboard 2027
color 0B
cls

echo ========================================================
echo         MADEC KPI ANALYTICS DASHBOARD 2027
echo ========================================================
echo.
echo  [+] Démarrage du serveur d'application...
echo  [+] Le navigateur s'ouvrira automatiquement dès que le serveur est prêt.
echo.

cd /d "%~dp0"

python run_app.py

pause
