#!/usr/bin/env python3
"""
One-off migration: hash existing plain-text passwords with bcrypt.
- Reads users where password_plain column exists OR legacy `password` column.
Adjust column names below to match your database.

Run:  python migrations/migrate_plain_passwords.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

import mysql.connector
from flask_bcrypt import Bcrypt
from flask import Flask

# Minimal Flask app so Flask-Bcrypt can read BCRYPT_LOG_ROUNDS
_bapp = Flask(__name__)
_bapp.config["BCRYPT_LOG_ROUNDS"] = int(os.environ.get("BCRYPT_LOG_ROUNDS", "12"))
_bcrypt = Bcrypt()
_bcrypt.init_app(_bapp)


def get_conn():
    return mysql.connector.connect(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DATABASE", "mnea_auth"),
    )


def main():
    """
    Expects either:
      - column `password` VARCHAR plain (will be migrated to password_hash)
      - or password already hashed — script skips rows that look like bcrypt ($2b$)
    """
    conn = get_conn()
    cur = conn.cursor(dictionary=True)

    # Detect columns
    cur.execute(
        """
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
        """
    )
    cols = {r["COLUMN_NAME"] for r in cur.fetchall()}

    if "password_hash" not in cols:
        print("Adding password_hash column...")
        cur.execute(
            "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER username"
        )
        conn.commit()
        cols.add("password_hash")

    plain_col = None
    if "password" in cols:
        plain_col = "password"
    elif "password_plain" in cols:
        plain_col = "password_plain"

    if not plain_col:
        print("No plain password column found (password / password_plain). Nothing to migrate.")
        cur.close()
        conn.close()
        return

    cur.execute(f"SELECT id, username, {plain_col} AS pw FROM users WHERE {plain_col} IS NOT NULL AND TRIM({plain_col}) <> ''")
    rows = cur.fetchall()
    updated = 0
    for row in rows:
        pw = row["pw"]
        if isinstance(pw, bytes):
            pw = pw.decode("utf-8", errors="ignore")
        if pw.startswith("$2b$") or pw.startswith("$2a$"):
            # Already bcrypt
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s AND (password_hash IS NULL OR password_hash = '')",
                (pw, row["id"]),
            )
            updated += cur.rowcount
            continue
        with _bapp.app_context():
            h = _bcrypt.generate_password_hash(pw)
        if isinstance(h, bytes):
            h = h.decode("utf-8")
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (h, row["id"]))
        updated += 1

    conn.commit()
    print(f"Migrated / updated {updated} user password hashes.")

    # Optional: drop plain column after backup
    # cur.execute(f"ALTER TABLE users DROP COLUMN {plain_col}")
    # conn.commit()

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
