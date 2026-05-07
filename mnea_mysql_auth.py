"""
MySQL + bcrypt login helper for app.py /api/login.

- If MYSQL_DATABASE is not set → returns skip (SQLite login in app.py).
- If username is not in MySQL → returns skip.
- If username is in MySQL → bcrypt verification only (no SQLite fallback for that user).

Dependencies: mysql-connector-python, bcrypt, python-dotenv (optional).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

import bcrypt


def _mysql_config() -> dict[str, Any]:
    return {
        "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("MYSQL_PORT", "3306")),
        "user": os.environ.get("MYSQL_USER", "root"),
        "password": os.environ.get("MYSQL_PASSWORD", ""),
        "database": (os.environ.get("MYSQL_DATABASE") or "").strip(),
    }


def _connect():
    import mysql.connector

    c = _mysql_config()
    return mysql.connector.connect(
        host=c["host"],
        port=c["port"],
        user=c["user"],
        password=c["password"],
        database=c["database"],
        autocommit=False,
    )


def _audit(conn, request, action: str, *, actor_id=None, target_id=None, details=""):
    """Best-effort audit row (ignore if table missing)."""
    try:
        cur = conn.cursor(dictionary=True)
        ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "")[:45]
        ua = (request.headers.get("User-Agent") or "")[:512]
        cur.execute(
            """
            INSERT INTO audit_log
              (actor_user_id, target_user_id, action, details, ip_address, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (actor_id, target_id, action, (details or "")[:65000], ip, ua),
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def mysql_api_login(username: str, password: str, request, school_id: str, school_name: str):
    """
    Returns:
      None  → caller should continue with SQLite login.
      dict  → final JSON payload for client (always includes 'ok' key).
    """
    cfg = _mysql_config()
    if not cfg["database"]:
        return None

    try:
        conn = _connect()
    except Exception as e:
        print("[MNEA-AUTH] MySQL connect failed:", e)
        return None

    cur = conn.cursor(dictionary=True)
    max_attempts = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
    lock_mins = int(os.environ.get("LOGIN_LOCK_MINUTES", "15"))

    try:
        cur.execute(
            """
            SELECT id, role, username, password_hash, must_change_password,
                   failed_login_attempts, locked_until, full_name, email
            FROM users WHERE username = %s
            """,
            (username,),
        )
        user = cur.fetchone()
        if not user:
            cur.close()
            conn.close()
            return None

        locked_until = user.get("locked_until")
        if locked_until and isinstance(locked_until, datetime):
            if locked_until.replace(tzinfo=None) > datetime.utcnow():
                _audit(conn, request, "login_failed", target_id=user["id"], details="locked")
                cur.close()
                conn.close()
                return {
                    "ok": False,
                    "error": "Account is temporarily locked. Try again later.",
                    "auth_source": "mysql",
                }

        stored_hash = (user.get("password_hash") or "").encode("utf-8")
        try:
            ok_pw = bcrypt.checkpw((password or "").encode("utf-8"), stored_hash)
        except Exception:
            ok_pw = False

        if not ok_pw:
            attempts = int(user.get("failed_login_attempts") or 0) + 1
            locked_until = None
            details = f"bad_password attempts={attempts}"
            if attempts >= max_attempts:
                locked_until = datetime.utcnow() + timedelta(minutes=lock_mins)
                attempts = 0
                _audit(
                    conn,
                    request,
                    "account_locked",
                    target_id=user["id"],
                    details=f"minutes={lock_mins}",
                )
                details = "bad_password account_locked"
            cur.execute(
                """
                UPDATE users SET failed_login_attempts = %s, locked_until = %s WHERE id = %s
                """,
                (attempts, locked_until, user["id"]),
            )
            _audit(conn, request, "login_failed", target_id=user["id"], details=details)
            conn.commit()
            cur.close()
            conn.close()
            return {"ok": False, "error": "Invalid username or password", "auth_source": "mysql"}

        cur.execute(
            """
            UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = %s
            """,
            (user["id"],),
        )
        _audit(
            conn,
            request,
            "login_success",
            actor_id=user["id"],
            target_id=user["id"],
            details=f"role={user['role']}",
        )
        conn.commit()
        cur.close()
        conn.close()

        role = user["role"]
        # Align with website: teacher dashboard expects "teacher", not "class".
        if role == "class":
            role = "teacher"

        display = (user.get("full_name") or "").strip() or user["username"]
        return {
            "ok": True,
            "role": role,
            "school_id": school_id,
            "school_name": school_name,
            "username": user["username"],
            "display_name": display,
            "user_id": user["username"],
            "mysql_user_id": user["id"],
            "must_change_password": bool(user.get("must_change_password")),
            "auth_source": "mysql",
            "email": user.get("email") or "",
        }
    except Exception as e:
        print("[MNEA-AUTH] MySQL login error:", e)
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return None


def mysql_api_change_password(username: str, current_password: str, new_password: str, request):
    """
    Update password for a row in MySQL `users`.

    Returns:
        None  → no MySQL database configured, or no user with this username (try SQLite).
        dict  → { ok, message?, error?, auth_source: 'mysql' }
    """
    cfg = _mysql_config()
    if not cfg["database"]:
        return None

    uname = (username or "").strip()
    if not uname:
        return None

    np = new_password or ""
    if len(np) < 6:
        return {"ok": False, "error": "New password must be at least 6 characters", "auth_source": "mysql"}

    conn = None
    try:
        conn = _connect()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT id, username, password_hash FROM users WHERE username = %s",
            (uname,),
        )
        user = cur.fetchone()
        if not user:
            cur.close()
            conn.close()
            return None

        stored_hash = user.get("password_hash") or ""
        if isinstance(stored_hash, bytes):
            stored_b = stored_hash
        else:
            stored_b = str(stored_hash).encode("utf-8")

        try:
            ok_pw = bcrypt.checkpw((current_password or "").encode("utf-8"), stored_b)
        except Exception:
            ok_pw = False

        if not ok_pw:
            _audit(conn, request, "password_change_failed", actor_id=user["id"], details="bad_current")
            conn.commit()
            cur.close()
            conn.close()
            return {"ok": False, "error": "Current password is incorrect", "auth_source": "mysql"}

        new_hash = bcrypt.hashpw(np.encode("utf-8"), bcrypt.gensalt())
        new_hash_s = new_hash.decode("utf-8") if isinstance(new_hash, bytes) else str(new_hash)

        cur.execute(
            "UPDATE users SET password_hash = %s, must_change_password = 0 WHERE id = %s",
            (new_hash_s, user["id"]),
        )
        _audit(
            conn,
            request,
            "password_change",
            actor_id=user["id"],
            target_id=user["id"],
            details="api_change_password",
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"ok": True, "message": "Password updated", "auth_source": "mysql"}
    except Exception as e:
        print("[MNEA-AUTH] MySQL change-password error:", e)
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass
        return {"ok": False, "error": str(e), "auth_source": "mysql"}
