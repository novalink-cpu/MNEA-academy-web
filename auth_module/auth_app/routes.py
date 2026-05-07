"""
HTTP routes: login, logout, password change, reset, admin tools, audit log.

Login (current school rule): Teacher/Student — username = staff/student ID,
password = same ID until first successful change to a strong password.
Admin — username `admin`, password set via seed (never stored plain).
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta

from flask import (
    Blueprint,
    render_template,
    request,
    redirect,
    url_for,
    session,
    flash,
    abort,
    jsonify,
    g,
    current_app,
)
from flask_mail import Message

from auth_app.forms import (
    LoginForm,
    ChangePasswordForm,
    ForgotPasswordForm,
    ResetPasswordForm,
    AuditFilterForm,
)
from auth_app.audit import write_audit
from auth_app.extensions import bcrypt, mail, limiter
from auth_app.security_utils import (
    validate_password_strength,
    generate_temporary_password,
    password_in_history,
    fetch_recent_password_hashes,
    append_password_history,
)

_AUTH_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bp = Blueprint(
    "auth",
    __name__,
    template_folder=os.path.join(_AUTH_ROOT, "templates"),
    static_folder=os.path.join(_AUTH_ROOT, "static"),
    static_url_path="static",
)


@bp.route("/")
def home():
    if not session.get("user_id"):
        return redirect(url_for("auth.login"))
    role = session.get("role")
    if role == "admin":
        return redirect(url_for("auth.audit_log"))
    return render_template("home.html", role=role, username=session.get("username"))


@bp.route("/login", methods=["GET", "POST"])
@limiter.limit("20 per minute")
def login():
    if session.get("user_id"):
        return redirect(url_for("auth.home"))

    form = LoginForm()
    cfg = current_app.config
    max_attempts = cfg["LOGIN_MAX_ATTEMPTS"]
    lock_mins = cfg["LOGIN_LOCK_MINUTES"]

    if form.validate_on_submit():
        username = (form.username.data or "").strip()
        password = form.password.data or ""
        cur = g.db.cursor(dictionary=True)
        cur.execute(
            """
            SELECT id, role, username, password_hash, must_change_password,
                   failed_login_attempts, locked_until, email, full_name
            FROM users WHERE username = %s
            """,
            (username,),
        )
        user = cur.fetchone()

        if not user:
            write_audit(
                g.db,
                request,
                "login_failed",
                actor_user_id=None,
                target_user_id=None,
                details="unknown_user",
            )
            g.db.commit()
            flash("Invalid username or password.", "error")
            return render_template("login.html", form=form)

        locked_until = user.get("locked_until")
        if locked_until and isinstance(locked_until, datetime):
            if locked_until.replace(tzinfo=None) > datetime.utcnow():
                write_audit(
                    g.db,
                    request,
                    "login_failed",
                    target_user_id=user["id"],
                    details="locked",
                )
                g.db.commit()
                flash("Account is temporarily locked. Try again later.", "error")
                return render_template("login.html", form=form)

        if not user.get("password_hash") or not bcrypt.check_password_hash(user["password_hash"], password):
            attempts = int(user.get("failed_login_attempts") or 0) + 1
            locked_until = None
            details = f"bad_password attempts={attempts}"
            if attempts >= max_attempts:
                locked_until = datetime.utcnow() + timedelta(minutes=lock_mins)
                attempts = 0
                write_audit(
                    g.db,
                    request,
                    "account_locked",
                    target_user_id=user["id"],
                    details=f"minutes={lock_mins}",
                )
                details = "bad_password account_locked"
            cur.execute(
                """
                UPDATE users SET failed_login_attempts = %s, locked_until = %s WHERE id = %s
                """,
                (attempts, locked_until, user["id"]),
            )
            write_audit(
                g.db,
                request,
                "login_failed",
                target_user_id=user["id"],
                details=details,
            )
            g.db.commit()
            flash("Invalid username or password.", "error")
            return render_template("login.html", form=form)

        cur.execute(
            """
            UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = %s
            """,
            (user["id"],),
        )
        write_audit(
            g.db,
            request,
            "login_success",
            actor_user_id=user["id"],
            target_user_id=user["id"],
            details=f"role={user['role']}",
        )
        g.db.commit()

        session.clear()
        session["user_id"] = user["id"]
        session["role"] = user["role"]
        session["username"] = user["username"]
        session["must_change_password"] = bool(user.get("must_change_password"))
        session["last_seen"] = datetime.utcnow().isoformat()
        session.permanent = True

        if session["must_change_password"]:
            flash("You must set a new password before continuing.", "warning")
            return redirect(url_for("auth.change_password"))

        return redirect(url_for("auth.home"))

    return render_template("login.html", form=form)


@bp.route("/logout", methods=["GET", "POST"])
def logout():
    uid = session.get("user_id")
    if uid:
        write_audit(g.db, request, "logout", actor_user_id=uid, target_user_id=uid, details="")
        g.db.commit()
    session.clear()
    flash("You have been logged out.", "info")
    return redirect(url_for("auth.login"))


@bp.route("/change-password", methods=["GET", "POST"])
def change_password():
    if not session.get("user_id"):
        return redirect(url_for("auth.login"))

    form = ChangePasswordForm()
    uid = session["user_id"]
    cur = g.db.cursor(dictionary=True)

    if form.validate_on_submit():
        cur.execute(
            "SELECT password_hash, must_change_password FROM users WHERE id = %s",
            (uid,),
        )
        row = cur.fetchone()
        if not row:
            abort(401)

        if not bcrypt.check_password_hash(row["password_hash"], form.current_password.data):
            flash("Current password is incorrect.", "error")
            return render_template("change-password.html", form=form, must_force=session.get("must_change_password"))

        new_pw = form.new_password.data
        ok, msg = validate_password_strength(new_pw)
        if not ok:
            flash(msg, "error")
            return render_template("change-password.html", form=form, must_force=session.get("must_change_password"))

        old_hashes = fetch_recent_password_hashes(cur, uid, limit=current_app.config["PASSWORD_HISTORY_COUNT"])
        if password_in_history(bcrypt, new_pw, old_hashes):
            flash("You cannot reuse one of your last few passwords.", "error")
            return render_template("change-password.html", form=form, must_force=session.get("must_change_password"))

        new_hash = bcrypt.generate_password_hash(new_pw).decode("utf-8")
        append_password_history(cur, uid, row["password_hash"])
        cur.execute(
            """
            UPDATE users SET password_hash = %s, must_change_password = 0 WHERE id = %s
            """,
            (new_hash, uid),
        )
        write_audit(
            g.db,
            request,
            "password_change",
            actor_user_id=uid,
            target_user_id=uid,
            details="self_serve",
        )
        g.db.commit()
        session["must_change_password"] = False
        flash("Password updated successfully.", "success")
        return redirect(url_for("auth.home"))

    return render_template(
        "change-password.html",
        form=form,
        must_force=session.get("must_change_password"),
    )


@bp.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    """Step 1: user submits their ID; email sent if account has email."""
    form = ForgotPasswordForm()
    cfg = current_app.config
    max_per_hour = cfg["RESET_MAX_PER_HOUR"]

    if request.method == "POST" and form.validate():
        user_login = (form.user_id.data or "").strip()
        cur = g.db.cursor(dictionary=True)
        cur.execute(
            """
            SELECT id, username, email, full_name, role FROM users WHERE username = %s
            """,
            (user_login,),
        )
        user = cur.fetchone()

        if not user or not user.get("email"):
            flash(
                "If an account exists with that ID and a registered email, a reset link has been sent.",
                "info",
            )
            return redirect(url_for("auth.login"))

        cur.execute(
            """
            SELECT COUNT(*) AS c FROM audit_log
            WHERE action = %s AND target_user_id = %s
              AND created_at >= (NOW() - INTERVAL 1 HOUR)
            """,
            ("password_reset_request", user["id"]),
        )
        cnt = int(cur.fetchone()["c"])
        if cnt >= max_per_hour:
            flash("Too many reset requests. Try again in an hour.", "error")
            return render_template("forgot_password_page.html", form=form)

        token = secrets.token_urlsafe(48)
        expires = datetime.utcnow() + timedelta(hours=1)
        cur.execute(
            """
            INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
            VALUES (%s, %s, %s, 0)
            """,
            (user["id"], token, expires),
        )
        write_audit(
            g.db,
            request,
            "password_reset_request",
            target_user_id=user["id"],
            details="email_queued",
        )
        g.db.commit()

        reset_url = f"{cfg['PUBLIC_BASE_URL']}/reset-password?token={token}"
        body = (
            f"Hello {user.get('full_name') or user['username']},\n\n"
            f"Reset your password using this link (valid 1 hour):\n{reset_url}\n\n"
            "If you did not request this, ignore this email.\n"
        )
        try:
            msg = Message(
                subject="Password reset",
                recipients=[user["email"]],
                body=body,
            )
            mail.send(msg)
        except Exception as ex:
            current_app.logger.exception("mail send failed")
            flash(f"Could not send email: {ex}", "error")
            return render_template("forgot_password_page.html", form=form)

        flash("Check your email for the reset link.", "success")
        return redirect(url_for("auth.login"))

    return render_template("forgot_password_page.html", form=form)


@bp.route("/reset-password", methods=["GET", "POST"])
def reset_password():
    token = (request.values.get("token") or "").strip()
    form = ResetPasswordForm()
    if request.method == "GET" and token:
        form.token.data = token

    if form.validate_on_submit():
        token = form.token.data
        cur = g.db.cursor(dictionary=True)
        cur.execute(
            """
            SELECT id, user_id, expires_at, used
            FROM password_reset_tokens WHERE token = %s
            """,
            (token,),
        )
        row = cur.fetchone()
        if (
            not row
            or row["used"]
            or not isinstance(row["expires_at"], datetime)
            or row["expires_at"].replace(tzinfo=None) < datetime.utcnow()
        ):
            flash("This reset link is invalid or expired.", "error")
            return redirect(url_for("auth.forgot_password"))

        new_pw = form.new_password.data
        ok, msg = validate_password_strength(new_pw)
        if not ok:
            flash(msg, "error")
            return render_template("reset_password_form.html", form=form)

        uid = row["user_id"]
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (uid,))
        u = cur.fetchone()
        old_hashes = fetch_recent_password_hashes(cur, uid, limit=current_app.config["PASSWORD_HISTORY_COUNT"])
        if password_in_history(bcrypt, new_pw, old_hashes):
            flash("You cannot reuse a recent password.", "error")
            return render_template("reset_password_form.html", form=form)

        new_hash = bcrypt.generate_password_hash(new_pw).decode("utf-8")
        append_password_history(cur, uid, u["password_hash"])
        cur.execute(
            """
            UPDATE users SET password_hash = %s, must_change_password = 0 WHERE id = %s
            """,
            (new_hash, uid),
        )
        cur.execute(
            "UPDATE password_reset_tokens SET used = 1 WHERE id = %s",
            (row["id"],),
        )
        write_audit(
            g.db,
            request,
            "password_reset_self",
            target_user_id=uid,
            details="token_ok",
        )
        g.db.commit()
        flash("Password updated. You can log in.", "success")
        return redirect(url_for("auth.login"))

    if request.method == "GET" and not token:
        flash("Missing token.", "error")
        return redirect(url_for("auth.forgot_password"))

    return render_template("reset_password_form.html", form=form)


@bp.route("/admin/reset-password/<int:user_id>", methods=["POST"])
def admin_reset_password(user_id: int):
    """Admin-only: sets random temp password; user must change on login."""
    if session.get("role") != "admin":
        abort(403)

    from flask_wtf.csrf import validate_csrf, CSRFError

    token = request.headers.get("X-CSRFToken") or request.form.get("csrf_token")
    try:
        validate_csrf(token)
    except CSRFError:
        return jsonify(ok=False, message="Invalid CSRF token."), 400

    cur = g.db.cursor(dictionary=True)
    cur.execute(
        "SELECT id, username, role FROM users WHERE id = %s",
        (user_id,),
    )
    target = cur.fetchone()
    if not target or target["role"] == "admin":
        abort(404)

    temp = generate_temporary_password(12)
    new_hash = bcrypt.generate_password_hash(temp).decode("utf-8")
    cur.execute(
        """
        SELECT password_hash FROM users WHERE id = %s
        """,
        (user_id,),
    )
    prev = cur.fetchone()
    append_password_history(cur, user_id, prev["password_hash"])
    cur.execute(
        """
        UPDATE users SET password_hash = %s, must_change_password = 1,
          failed_login_attempts = 0, locked_until = NULL
        WHERE id = %s
        """,
        (new_hash, user_id),
    )
    actor = session.get("user_id")
    write_audit(
        g.db,
        request,
        "password_reset_admin",
        actor_user_id=actor,
        target_user_id=user_id,
        details=f"target_username={target['username']}",
    )
    g.db.commit()

    return jsonify(
        {
            "ok": True,
            "username": target["username"],
            "temporary_password": temp,
            "message": "Give this password to the user once; it will not be shown again.",
        }
    )


@bp.route("/admin/audit-log", methods=["GET"])
def audit_log():
    if session.get("role") != "admin":
        abort(403)

    form = AuditFilterForm(data=request.args)
    clauses = []
    params = []

    if form.validate():
        if form.date_from.data:
            clauses.append("DATE(created_at) >= %s")
            params.append(form.date_from.data)
        if form.date_to.data:
            clauses.append("DATE(created_at) <= %s")
            params.append(form.date_to.data)
        if form.action.data:
            clauses.append("action = %s")
            params.append(form.action.data)
        if form.username_search.data:
            like = f"%{(form.username_search.data or '').strip()}%"
            clauses.append(
                "(u1.username LIKE %s OR u2.username LIKE %s OR a.details LIKE %s)"
            )
            params.extend([like, like, like])

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT a.*, u1.username AS actor_username, u2.username AS target_username
        FROM audit_log a
        LEFT JOIN users u1 ON u1.id = a.actor_user_id
        LEFT JOIN users u2 ON u2.id = a.target_user_id
        {where}
        ORDER BY a.created_at DESC
        LIMIT 500
    """
    cur = g.db.cursor(dictionary=True)
    cur.execute(sql, tuple(params))
    rows = cur.fetchall()

    return render_template("admin_audit_log.html", form=form, rows=rows)


@bp.route("/admin/users", methods=["GET"])
def admin_users():
    """Simple user list with reset-password UI (demo admin panel)."""
    if session.get("role") != "admin":
        abort(403)
    cur = g.db.cursor(dictionary=True)
    cur.execute(
        """
        SELECT id, role, username, full_name, email, must_change_password
        FROM users ORDER BY role, username
        """
    )
    users = cur.fetchall()
    return render_template("admin_users.html", users=users)
