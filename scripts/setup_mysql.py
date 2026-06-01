#!/usr/bin/env python3
"""
First-time MySQL setup: create schema, default school row, and auth admin user.

Usage (from project root, .env configured):
  python scripts/setup_mysql.py
  python scripts/setup_mysql.py --migrate Database/School_0001_2026-2027.db
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from dotenv import load_dotenv

load_dotenv(os.path.join(ROOT, ".env"))

import mnea_db
from mnea_db import ensure_schema

MYSQL_SCHEMA = os.path.join(ROOT, "Database", "mysql_schema.sql")


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize MySQL for MNEA app")
    parser.add_argument(
        "--migrate",
        metavar="SQLITE.db",
        help="Import legacy SQLite school database after schema creation",
    )
    args = parser.parse_args()

    db_name = (os.environ.get("MYSQL_DATABASE") or "").strip()
    if not db_name:
        print("ERROR: Set MYSQL_DATABASE in .env before running setup.", file=sys.stderr)
        return 1

    print("Connecting to MySQL:", db_name)
    conn = mnea_db.connect()
    ensure_schema(conn, MYSQL_SCHEMA)
    conn.close()
    print("Schema OK (Database/mysql_schema.sql)")

    from app import get_conn

    c = get_conn()
    c.close()
    print("Default school + app_config OK")

    seed = os.path.join(ROOT, "auth_module", "migrations", "seed_admin.py")
    print("Seeding auth admin (admin / admin123)…")
    rc = subprocess.call([sys.executable, seed], cwd=ROOT)
    if rc != 0:
        return rc

    if args.migrate:
        mig = os.path.join(ROOT, "scripts", "migrate_sqlite_to_mysql.py")
        print("Migrating SQLite:", args.migrate)
        rc = subprocess.call([sys.executable, mig, args.migrate], cwd=ROOT)
        if rc != 0:
            return rc

    print("Setup complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
