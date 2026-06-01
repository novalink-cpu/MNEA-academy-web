"""
MySQL database layer for app.py (SQLite-compatible API).

Set MYSQL_* in .env. All app data is stored in one MySQL database.
"""
from __future__ import annotations

import os
import re
from typing import Any, Optional

import mysql.connector
from mysql.connector import errors as mysql_errors

IntegrityError = mysql_errors.IntegrityError


class Row(dict):
    """Dict row with optional index access (SQLite Row compatibility)."""

    def __getitem__(self, key):  # type: ignore[override]
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def _mysql_config() -> dict[str, Any]:
    db = (os.environ.get("MYSQL_DATABASE") or "").strip()
    if not db:
        raise RuntimeError(
            "MYSQL_DATABASE is not set. Copy env.example to .env and configure MySQL."
        )
    return {
        "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("MYSQL_PORT", "3306")),
        "user": os.environ.get("MYSQL_USER", "root"),
        "password": os.environ.get("MYSQL_PASSWORD", ""),
        "database": db,
        "autocommit": False,
    }


def _translate_sql(sql: str) -> str:
    s = sql
    s = re.sub(r"INSERT\s+OR\s+IGNORE\s+INTO", "INSERT IGNORE INTO", s, flags=re.I)
    s = re.sub(r"INSERT\s+OR\s+REPLACE\s+INTO", "REPLACE INTO", s, flags=re.I)
    s = s.replace("datetime('now')", "CURRENT_TIMESTAMP")
    if "?" in s:
        s = s.replace("?", "%s")
    return s


class CursorWrapper:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, sql: str, params: Optional[tuple | list] = None):
        sql = _translate_sql(sql)
        if params is None:
            self._cursor.execute(sql)
        else:
            self._cursor.execute(sql, params)

    def executemany(self, sql: str, params):
        self._cursor.executemany(_translate_sql(sql), params)

    def fetchone(self):
        row = self._cursor.fetchone()
        return Row(row) if row else None

    def fetchall(self):
        return [Row(r) for r in self._cursor.fetchall()]

    @property
    def lastrowid(self):
        return self._cursor.lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount


class ConnectionWrapper:
    def __init__(self, conn):
        self._conn = conn
        self.row_factory = Row

    def cursor(self):
        return CursorWrapper(self._conn.cursor(dictionary=True))

    def execute(self, sql: str, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        try:
            self._conn.close()
        except Exception:
            pass

    def executescript(self, script: str):
        buf = []
        for line in script.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("--"):
                continue
            buf.append(line)
        text = "\n".join(buf)
        for stmt in text.split(";"):
            stmt = stmt.strip()
            if not stmt:
                continue
            cur = self._conn.cursor()
            cur.execute(_translate_sql(stmt))
            cur.close()


def connect(database: Optional[str] = None, **kwargs):
    """Connect to MySQL (path/database arg ignored — uses MYSQL_DATABASE from env)."""
    cfg = _mysql_config()
    if database:
        cfg["database"] = database
    raw = mysql.connector.connect(**cfg)
    return ConnectionWrapper(raw)


def ensure_schema(conn: ConnectionWrapper, schema_path: str) -> None:
    """Run mysql_schema.sql once if core tables are missing."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools'
        """
    )
    if cur.fetchone():
        return
    if not os.path.isfile(schema_path):
        raise FileNotFoundError(f"MySQL schema not found: {schema_path}")
    with open(schema_path, "r", encoding="utf-8") as f:
        script = f.read()
    conn.executescript(script)
    conn.commit()


def table_has_column(conn, table_name: str, column_name: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
        """,
        (table_name, column_name),
    )
    return cur.fetchone() is not None


def table_exists(conn, table_name: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
        """,
        (table_name,),
    )
    return cur.fetchone() is not None
