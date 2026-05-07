"""
Entry point for the standalone auth module.

Usage (from this folder):
    pip install -r requirements.txt
    copy .env.example .env   # then edit MySQL + mail settings
    mysql < migrations/000_full_setup.sql
    python migrations/seed_admin.py
    python run.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from auth_app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=app.config.get("DEBUG", False))
