@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable.
  echo Installez Node.js depuis https://nodejs.org/ puis relancez ce fichier.
  pause
  exit /b 1
)

node server.js
pause
