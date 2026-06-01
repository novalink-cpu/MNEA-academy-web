#!/bin/bash
# Run on PythonAnywhere Bash console after git pull:
#   cd ~/MNEA_pythonanywhere && bash scripts/pa_deploy.sh

set -e
cd "$(dirname "$0")/.."
echo "==> Project: $(pwd)"
echo "==> Git pull..."
git pull origin main
echo "==> pip install..."
pip install --user -r requirements.txt
echo "==> MySQL setup (schema + admin user)..."
python3.10 scripts/setup_mysql.py || python3 scripts/setup_mysql.py
echo "==> Done. Reload web app from PythonAnywhere Web tab."
echo "    WSGI: from wsgi import application  (path: ~/MNEA_pythonanywhere)"
