"""
Myanmar New Era — Flask authentication module (MySQL).

Run:
    cd auth_module && python run.py
"""
import os
from datetime import datetime

from dotenv import load_dotenv
from flask import Flask, session, request, redirect, url_for, g, flash

from auth_app.config import Config
from auth_app.db import get_conn
from auth_app import routes
from auth_app.extensions import bcrypt, mail, csrf, limiter

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def create_app(config_class=Config):
    load_dotenv(os.path.join(_ROOT, ".env"))
    app = Flask(
        __name__,
        template_folder=os.path.join(_ROOT, "templates"),
        static_folder=os.path.join(_ROOT, "static"),
        static_url_path="/static",
    )
    app.config.from_object(config_class)

    bcrypt.init_app(app)
    mail.init_app(app)
    csrf.init_app(app)
    limiter.init_app(app)

    @app.before_request
    def _open_db():
        if "db" not in g:
            g.db = get_conn()

    @app.teardown_request
    def _close_db(_exc):
        db = g.pop("db", None)
        if db is not None:
            try:
                db.close()
            except Exception:
                pass

    @app.before_request
    def _session_security():
        path = request.path or ""
        if path.startswith("/static"):
            return None

        uid = session.get("user_id")
        if not uid:
            return None

        max_idle = app.config["PERMANENT_SESSION_LIFETIME"].total_seconds()
        last = session.get("last_seen")
        if last:
            try:
                last_dt = datetime.fromisoformat(last)
                if (datetime.utcnow() - last_dt.replace(tzinfo=None)).total_seconds() > max_idle:
                    session.clear()
                    flash("Session expired due to inactivity.", "warning")
                    return redirect(url_for("auth.login"))
            except Exception:
                pass

        must = session.get("must_change_password")
        if must:
            try:
                allow = path.startswith(url_for("auth.change_password")) or path.startswith(
                    url_for("auth.logout")
                )
            except Exception:
                allow = "/change-password" in path or "/logout" in path
            if not allow:
                return redirect(url_for("auth.change_password"))

        session["last_seen"] = datetime.utcnow().isoformat()
        return None

    app.register_blueprint(routes.bp)
    return app
