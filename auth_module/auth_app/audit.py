"""Centralized audit logging to MySQL."""
from auth_app.security_utils import client_ip


def write_audit(conn, request, action: str, *, actor_user_id=None, target_user_id=None, details: str | None = None):
    """
    Insert one audit row using the given DB connection (same request transaction).
    Call conn.commit() in app code after business logic succeeds, or commit immediately
    for failed-login attempts where you still want the row persisted.
    """
    cur = conn.cursor(dictionary=True)
    ua = (request.headers.get("User-Agent") or "")[:512]
    ip = (client_ip(request) or "")[:45]
    cur.execute(
        """
        INSERT INTO audit_log
          (actor_user_id, target_user_id, action, details, ip_address, user_agent)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (actor_user_id, target_user_id, action, details, ip, ua),
    )
