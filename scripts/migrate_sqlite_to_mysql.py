#!/usr/bin/env python3
"""
Import data from a legacy SQLite School_*.db file into MySQL.

Usage (from project root, with .env configured):
  python scripts/migrate_sqlite_to_mysql.py Database/School_0001_2026-2027.db
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from dotenv import load_dotenv

load_dotenv(os.path.join(ROOT, ".env"))

import mnea_db
from mnea_db import ensure_schema

MYSQL_SCHEMA = os.path.join(ROOT, "Database", "mysql_schema.sql")

TABLE_MAP = {
    "schools": "schools",
    "app_config": "app_config",
    "superadmin": "superadmin",
    "students": "students",
    "exams": "exams",
    "grades_config": "grades_config",
    "exams_by_grade": "exams_by_grade",
    "exam_sections": "exam_sections",
    "users": "school_users",
    "web_extra": "web_extra",
    "subjects": "subjects",
    "courses": "courses",
    "levels": "levels",
    "batches": "batches",
    "batch_timetables": "batch_timetables",
    "attendance": "attendance",
    "attendance_session_lock": "attendance_session_lock",
}


def _sqlite_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cur.fetchall()]


def _import_table(sqlite_conn, mysql_conn, sqlite_table: str, mysql_table: str) -> int:
    cols = _sqlite_columns(sqlite_conn, sqlite_table)
    if not cols:
        return 0
    rows = sqlite_conn.execute(f"SELECT * FROM {sqlite_table}").fetchall()
    if not rows:
        return 0
    cur = mysql_conn.cursor()
    cur.execute(f"DELETE FROM {mysql_table}")
    col_sql = ", ".join(f"`{c}`" if c == "key" else c for c in cols)
    placeholders = ", ".join(["%s"] * len(cols))
    sql = f"INSERT INTO {mysql_table} ({col_sql}) VALUES ({placeholders})"
    for row in rows:
        cur.execute(sql, tuple(row))
    mysql_conn.commit()
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate SQLite school DB to MySQL")
    parser.add_argument("sqlite_path", help="Path to School_*.db file")
    parser.add_argument(
        "--skip-auth",
        action="store_true",
        help="Do not touch auth tables (users/password_history/audit_log)",
    )
    args = parser.parse_args()
    sqlite_path = os.path.abspath(args.sqlite_path)
    if not os.path.isfile(sqlite_path):
        print("File not found:", sqlite_path, file=sys.stderr)
        return 1

    sqlite_conn = sqlite3.connect(sqlite_path)
    mysql_conn = mnea_db.connect()
    ensure_schema(mysql_conn, MYSQL_SCHEMA)

    total = 0
    for sqlite_table, mysql_table in TABLE_MAP.items():
        try:
            n = _import_table(sqlite_conn, mysql_conn, sqlite_table, mysql_table)
            if n:
                print(f"  {sqlite_table} -> {mysql_table}: {n} rows")
                total += n
        except sqlite3.OperationalError as e:
            if "no such table" in str(e).lower():
                continue
            raise

    sqlite_conn.close()
    mysql_conn.close()
    print(f"Done. Imported {total} rows into MySQL ({os.environ.get('MYSQL_DATABASE', '')}).")
    if not args.skip_auth:
        print("Auth users: create via /auth/admin or existing MySQL users table.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
