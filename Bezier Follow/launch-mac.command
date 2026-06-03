#!/bin/bash
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est introuvable."
  echo "Installez Node.js depuis https://nodejs.org/ puis relancez ce fichier."
  read -r -p "Appuyez sur Entree pour fermer..."
  exit 1
fi

node server.js
read -r -p "Appuyez sur Entree pour fermer..."
