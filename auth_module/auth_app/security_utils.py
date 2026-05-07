"""
Password policy, reuse checks, temporary password generation, duplicate login names.
"""
from __future__ import annotations

import re
import secrets
import string


def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Returns (True, '') if valid, else (False, error message).
    Rules: min 8, uppercase, lowercase, digit, special character.
    """
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters."
    if len(password) > 128:
        return False, "Password is too long."
    if not re.search(r"[A-Z]", password):
        return False, "Include at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Include at least one lowercase letter."
    if not re.search(r"\d", password):
        return False, "Include at least one number."
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]", password):
        return False, "Include at least one special character."
    return True, ""


def generate_temporary_password(length: int = 12) -> str:
    """
    Cryptographically strong temp password with upper, lower, digit, symbol.
    Guarantees at least one of each class.
    """
    if length < 8:
        length = 8
    alphabet = string.ascii_letters + string.digits + "!@#$%&*-_=+"
    while True:
        chars = [secrets.choice(string.ascii_uppercase), secrets.choice(string.ascii_lowercase)]
        chars += [secrets.choice(string.digits), secrets.choice("!@#$%&*-_=+")]
        remaining = length - len(chars)
        chars += [secrets.choice(alphabet) for _ in range(remaining)]
        secrets.SystemRandom().shuffle(chars)
        pw = "".join(chars)
        ok, _ = validate_password_strength(pw)
        if ok:
            return pw


def password_in_history(bcrypt, plain_password: str, history_hashes: list[str]) -> bool:
    """Return True if plain_password matches any bcrypt hash in history."""
    for h in history_hashes:
        if not h:
            continue
        try:
            if bcrypt.check_password_hash(h, plain_password):
                return True
        except Exception:
            continue
    return False


def fetch_recent_password_hashes(cursor, user_id: int, limit: int = 3) -> list[str]:
    """Current hash + last (limit-1) from password_history, for reuse check."""
    cursor.execute(
        "SELECT password_hash FROM users WHERE id = %s",
        (user_id,),
    )
    row = cursor.fetchone()
    out = []
    if row and row.get("password_hash"):
        out.append(row["password_hash"])
    cursor.execute(
        """
        SELECT password_hash FROM password_history
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (user_id, int(max(0, limit - 1))),
    )
    for r in cursor.fetchall():
        if r.get("password_hash"):
            out.append(r["password_hash"])
    return out[:limit]


def append_password_history(cursor, user_id: int, old_hash: str) -> None:
    """Store previous hash after successful change."""
    if not old_hash:
        return
    cursor.execute(
        """
        INSERT INTO password_history (user_id, password_hash) VALUES (%s, %s)
        """,
        (user_id, old_hash),
    )


def prune_password_history(cursor, user_id: int, keep: int = 10) -> None:
    """Optional: keep DB small — delete older than last `keep` entries."""
    cursor.execute(
        """
        DELETE FROM password_history
        WHERE user_id = %s AND id NOT IN (
          SELECT id FROM (
            SELECT id FROM password_history
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s
          ) t
        )
        """,
        (user_id, user_id, keep),
    )


def suggest_unique_username(
    cursor,
    base_username: str,
    batch_name: str | None = None,
) -> str:
    """
    If `base_username` (e.g. full name) is taken, append ' (Batch)'.
    For ID-based login, usually `base_username` is already unique (TCH_xxx).
    """
    candidate = base_username.strip()
    if batch_name:
        candidate_with_batch = f"{base_username.strip()} ({batch_name.strip()})"
    else:
        candidate_with_batch = candidate

    def exists(u: str) -> bool:
        cursor.execute("SELECT 1 FROM users WHERE username = %s LIMIT 1", (u,))
        return cursor.fetchone() is not None

    if not exists(candidate):
        return candidate
    if batch_name and not exists(candidate_with_batch):
        return candidate_with_batch
    # Fallback: append short random suffix
    return f"{candidate_with_batch}_{secrets.token_hex(3)}"


def client_ip(request) -> str:
    """Best-effort client IP for audit."""
    if request.headers.get("X-Forwarded-For"):
        return request.headers.get("X-Forwarded-For").split(",")[0].strip()
    return request.remote_addr or ""
