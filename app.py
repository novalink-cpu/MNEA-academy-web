# EGMS Web App —  sms.py    
import os
import sys
import json
import mnea_db as sqlite3
from mnea_db import ensure_schema, table_exists, table_has_column
import shutil
import threading
import webbrowser
import smtplib
from email.message import EmailMessage
from datetime import datetime, date, timedelta
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, send_file, Response, redirect, session, g, url_for, flash
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except Exception:
    pass

try:
    from mnea_mysql_auth import mysql_api_change_password, mysql_api_login
except ImportError:
    mysql_api_login = None
    mysql_api_change_password = None

# Base dir (script / exe)
if getattr(sys, "frozen", False):
    _BASE_DIR = os.path.dirname(sys.executable)
else:
    _BASE_DIR = os.path.dirname(os.path.abspath(__file__))

WEB_ROOT = os.path.join(_BASE_DIR, "website")
if not os.path.isdir(WEB_ROOT):
    WEB_ROOT = _BASE_DIR

app = Flask(__name__, static_folder=None)
# Session cookie (used by /auth/* MySQL pages + server-side login state)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "egms-dev-key-change-in-production")
app.config.setdefault("PERMANENT_SESSION_LIFETIME", timedelta(minutes=30))
CORS(app)

# --- Optional: MySQL auth UI (/auth/*) + bcrypt /api/login (see mnea_mysql_auth.py) ---
_AUTH_DIR = os.path.join(_BASE_DIR, "auth_module")
_MNEA_AUTH = os.path.isdir(_AUTH_DIR)
if _MNEA_AUTH and _AUTH_DIR not in sys.path:
    sys.path.insert(0, _AUTH_DIR)
try:
    if _MNEA_AUTH:
        from auth_app.config import Config as _MneaAuthConfig
        from auth_app.extensions import bcrypt as _mnea_bcrypt
        from auth_app.extensions import csrf as _mnea_csrf
        from auth_app.extensions import limiter as _mnea_limiter
        from auth_app.extensions import mail as _mnea_mail
        from auth_app.routes import bp as _mnea_auth_bp

        app.config.from_object(_MneaAuthConfig)
        app.config["WTF_CSRF_CHECK_DEFAULT"] = False
        _mnea_bcrypt.init_app(app)
        _mnea_mail.init_app(app)
        _mnea_csrf.init_app(app)
        _mnea_limiter.init_app(app)
        app.register_blueprint(_mnea_auth_bp, url_prefix="/auth")

        def _mnea_auth_mysql_conn():
            if not (os.environ.get("MYSQL_DATABASE") or "").strip():
                return None
            try:
                import mysql.connector

                return mysql.connector.connect(
                    host=app.config["MYSQL_HOST"],
                    port=app.config["MYSQL_PORT"],
                    user=app.config["MYSQL_USER"],
                    password=app.config["MYSQL_PASSWORD"],
                    database=app.config["MYSQL_DATABASE"],
                    autocommit=False,
                )
            except Exception as ex:
                print("[MNEA-AUTH] MySQL unavailable for /auth:", ex)
                return None

        @app.before_request
        def _mnea_open_mysql_for_auth_pages():
            if not request.path.startswith("/auth"):
                return None
            if getattr(g, "db", None) is None:
                g.db = _mnea_auth_mysql_conn()

        @app.teardown_request
        def _mnea_close_auth_mysql(_exc):
            db = getattr(g, "db", None)
            if db is not None:
                try:
                    db.close()
                except Exception:
                    pass
                g.db = None

        @app.before_request
        def _mnea_auth_session_guard():
            """Idle timeout + force password change — only for /auth/*."""
            path = request.path or ""
            if not path.startswith("/auth"):
                return None
            if path.startswith("/auth/static"):
                return None
            uid = session.get("user_id")
            if not uid:
                return None
            try:
                max_idle = float(app.config["PERMANENT_SESSION_LIFETIME"].total_seconds())
            except Exception:
                max_idle = 1800.0
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
                    allow = False
                if not allow:
                    return redirect(url_for("auth.change_password"))
            session["last_seen"] = datetime.utcnow().isoformat()
            session.permanent = True
            return None

        print("[MNEA-AUTH] Loaded: /auth/* (MySQL) + CSRF (forms only). API routes unchanged.")
except Exception as _mnea_auth_ex:
    print("[MNEA-AUTH] Skipped (install auth_module deps or fix .env):", _mnea_auth_ex)

CONFIG_FILE = os.path.join(_BASE_DIR, "egms_config.json")
BUILD_CONFIG = os.path.join(_BASE_DIR, "school_build_config.json")
DEFAULT_YEAR = "2026-2027"
MYSQL_SCHEMA = os.path.join(_BASE_DIR, "Database", "mysql_schema.sql")
# Public-site branding; used for new DB rows, API fallbacks, and one-time fix of EMS demo name.
DEFAULT_SCHOOL_DISPLAY_NAME = "Myanmar New Era International Education Centre"
_LEGACY_TEMPLATE_SCHOOL_NAME = "Myanmar International School"


def get_data_dir():
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            d = (cfg.get("data_dir") or "").strip()
            if d and os.path.isdir(d):
                return d
        except Exception:
            pass
    return _BASE_DIR


def get_school_id():
    for path in [BUILD_CONFIG, os.path.join(get_data_dir(), "school_build_config.json")]:
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8-sig") as f:
                    d = json.load(f)
                sid = (d.get("school_id") or "").strip()
                if sid:
                    return sid
            except Exception:
                pass
    return "School_0001"


def safe_basename(s):
    if not s or not isinstance(s, str):
        return "ems_data"
    out = "".join(c for c in s.strip() if c.isalnum() or c in "-_")
    return out if out else "ems_data"


def get_db_path(academic_year=None):
    """Display label for current database (MySQL). Legacy name kept for API compatibility."""
    db = (os.environ.get("MYSQL_DATABASE") or "").strip() or "MYSQL_DATABASE"
    year = academic_year or DEFAULT_YEAR
    return f"mysql:{db} (academic_year={year})"


def get_app_config_from_default_db():
    """Read app_config from MySQL. Current academic_year selection is stored in app_config."""
    out = {"academic_year": DEFAULT_YEAR, "academic_years": [DEFAULT_YEAR]}
    try:
        conn = sqlite3.connect()
        conn.row_factory = sqlite3.Row
        db_init(conn)
        ensure_app_config(conn)
        cur = conn.cursor()
        cur.execute("SELECT `key`, value FROM app_config")
        for row in cur.fetchall():
            k, v = row["key"], row["value"]
            if v is None:
                continue
            try:
                out[k] = json.loads(v) if v.strip().startswith(("[", "{")) else v
            except Exception:
                out[k] = v
        conn.close()
    except Exception:
        pass
    if not isinstance(out.get("academic_years"), list):
        out["academic_years"] = [out.get("academic_year") or DEFAULT_YEAR]
    if not out.get("academic_year"):
        out["academic_year"] = DEFAULT_YEAR
    return out


def ensure_app_config(conn):
    """Insert default academic_year and academic_years into app_config if missing (same defaults as sms.py)."""
    cur = conn.cursor()
    cur.execute("SELECT value FROM app_config WHERE `key` = ?", ("academic_year",))
    if cur.fetchone():
        return
    cur.execute("INSERT OR IGNORE INTO app_config (`key`, value) VALUES (?, ?)", ("academic_year", DEFAULT_YEAR))
    cur.execute("INSERT OR IGNORE INTO app_config (`key`, value) VALUES (?, ?)", ("academic_years", json.dumps([DEFAULT_YEAR])))
    conn.commit()


def db_init(conn):
    ensure_schema(conn, MYSQL_SCHEMA)
    cur = conn.cursor()
    level_extra_columns = [
        ("course_id", "INT NULL"),
        ("cefr", "VARCHAR(32) NOT NULL DEFAULT ''"),
        ("locations", "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("description", "TEXT NOT NULL"),
        ("duration", "VARCHAR(128) NOT NULL DEFAULT ''"),
    ]
    for col_name, col_sql in level_extra_columns:
        if table_exists(conn, "levels") and not table_has_column(conn, "levels", col_name):
            cur.execute(f"ALTER TABLE levels ADD COLUMN {col_name} {col_sql}")
    course_extra_columns = [
        ("start_date", "VARCHAR(32) NOT NULL DEFAULT ''"),
        ("end_date", "VARCHAR(32) NOT NULL DEFAULT ''"),
        ("capacity", "INT NOT NULL DEFAULT 0"),
        ("current_enrollment", "INT NOT NULL DEFAULT 0"),
        ("locations", "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("age_group", "VARCHAR(128) NOT NULL DEFAULT ''"),
        ("schedule", "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("instructor", "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("status", "VARCHAR(32) NOT NULL DEFAULT 'active'"),
    ]
    for col_name, col_sql in course_extra_columns:
        if table_exists(conn, "courses") and not table_has_column(conn, "courses", col_name):
            cur.execute(f"ALTER TABLE courses ADD COLUMN {col_name} {col_sql}")
    if table_exists(conn, "batch_timetables"):
        if not table_has_column(conn, "batch_timetables", "teacher_name"):
            cur.execute("ALTER TABLE batch_timetables ADD COLUMN teacher_name VARCHAR(255) NOT NULL DEFAULT ''")
        if not table_has_column(conn, "batch_timetables", "room_location"):
            cur.execute("ALTER TABLE batch_timetables ADD COLUMN room_location VARCHAR(255) NOT NULL DEFAULT ''")
    if table_exists(conn, "batches"):
        if not table_has_column(conn, "batches", "teacher_username"):
            cur.execute("ALTER TABLE batches ADD COLUMN teacher_username VARCHAR(191) NOT NULL DEFAULT ''")
        if not table_has_column(conn, "batches", "location"):
            cur.execute("ALTER TABLE batches ADD COLUMN location VARCHAR(255) NOT NULL DEFAULT ''")
    conn.commit()


def _hash_password(password):
    """Return hashed password for storage (never store plain text)."""
    return generate_password_hash(password or "", method="scrypt:32768:8:1")

def _is_hashed(value):
    """Return True if value looks like a stored hash (scrypt/pbkdf2)."""
    if not value or not isinstance(value, str):
        return False
    return value.startswith("scrypt:") or value.startswith("pbkdf2:")

def _check_admin_password(stored, plain):
    """Verify plain password against stored (hash or legacy plain)."""
    if not stored:
        return False
    if _is_hashed(stored):
        return check_password_hash(stored, plain or "")
    return (stored or "") == (plain or "")


def _sqlite_user_expected_password(ud, row_username):
    """
    Teachers are often stored without a 'password' key; default login password = teacher_id (or row username).
    Same idea for role=student rows in users (rare).
    """
    role = (ud.get("role") or "").strip()
    if role in ("class", "teacher"):
        explicit = (ud.get("password") or "").strip()
        if explicit:
            return explicit
        return (ud.get("teacher_id") or row_username or "").strip()
    if role == "student":
        explicit = (ud.get("password") or "").strip()
        if explicit:
            return explicit
        return (ud.get("student_id") or row_username or "").strip()
    return (ud.get("password") or "").strip()


def _sqlite_find_teacher_row(cur, school_id, login_username):
    """Find teacher row when login name is teacher_id but PK username differs, or matches either."""
    login_l = (login_username or "").strip()
    cur.execute("SELECT username, data_json FROM school_users WHERE school_id = ?", (school_id,))
    for r in cur.fetchall():
        uname = r["username"]
        try:
            ud = json.loads(r["data_json"] or "{}")
        except Exception:
            continue
        if (ud.get("role") or "") not in ("class", "teacher"):
            continue
        tid = (ud.get("teacher_id") or uname or "").strip()
        if tid and login_l in (uname.strip(), tid):
            return uname, ud
    return None, None


def align_legacy_school_branding(conn):
    """If the only school row still uses the old EMS demo name, rename to this deployment default."""
    sid = get_school_id()
    cur = conn.cursor()
    cur.execute("SELECT name FROM schools WHERE id = ?", (sid,))
    row = cur.fetchone()
    if not row:
        return
    if (row["name"] or "").strip() != _LEGACY_TEMPLATE_SCHOOL_NAME:
        return
    cur.execute(
        "UPDATE schools SET name = ? WHERE id = ?",
        (DEFAULT_SCHOOL_DISPLAY_NAME, sid),
    )
    conn.commit()


def ensure_school(conn):
    """ school_build_config / default   """
    cur = conn.cursor()
    cur.execute("SELECT id FROM schools LIMIT 1")
    if cur.fetchone():
        return
    sid = get_school_id()
    name = DEFAULT_SCHOOL_DISPLAY_NAME
    try:
        if os.path.isfile(BUILD_CONFIG):
            with open(BUILD_CONFIG, "r", encoding="utf-8-sig") as f:
                d = json.load(f)
                if d.get("school_name"):
                    name = d["school_name"]
    except Exception:
        pass
    admin_password_hashed = _hash_password("admin")
    cur.execute("""INSERT INTO schools (id, name, admin_username, admin_password, logo, primary_color, bg_color, sidebar_bg, bg_image)
                   VALUES (?, ?, 'admin', ?, '', '#27ae60', '#ffffff', '#ffffff', '')""",
                (sid, name, admin_password_hashed))
    conn.commit()


def get_conn(academic_year=None):
    """Open MySQL connection. academic_year is kept for API compatibility (stored in app_config)."""
    if academic_year is None:
        cfg = get_app_config_from_default_db()
        academic_year = (cfg.get("academic_year") or "").strip() or DEFAULT_YEAR
    conn = sqlite3.connect()
    conn.row_factory = sqlite3.Row
    db_init(conn)
    ensure_school(conn)
    align_legacy_school_branding(conn)
    if (academic_year or "").strip() == DEFAULT_YEAR:
        ensure_app_config(conn)
    return conn


def load_school_data(conn, school_id):
    cur = conn.cursor()
    cur.execute("SELECT student_id, data_json FROM students WHERE school_id = ?", (school_id,))
    students = {}
    for row in cur.fetchall():
        try:
            students[row["student_id"]] = json.loads(row["data_json"] or "{}")
        except Exception:
            students[row["student_id"]] = {}
    cur.execute("SELECT exam_name, category FROM exams WHERE school_id = ?", (school_id,))
    exams = []
    exam_category = {}
    for row in cur.fetchall():
        exams.append(row["exam_name"])
        exam_category[row["exam_name"]] = row["category"] or "Final Test"
    cur.execute(
        "SELECT data_json FROM subjects WHERE school_id = ? AND data_key = 'subjects'",
        (school_id,),
    )
    r = cur.fetchone()
    raw = json.loads(r["data_json"]) if r and r["data_json"] else []
    if isinstance(raw, dict):
        subjects_by_class = raw
        subjects = sorted(set(v for v in subjects_by_class.values() for v in v))
    else:
        subjects_by_class = {}
        subjects = list(raw) if isinstance(raw, list) else []
    cur.execute("SELECT data_json FROM grades_config WHERE school_id = ?", (school_id,))
    r = cur.fetchone()
    grades_config = json.loads(r["data_json"]) if r and r["data_json"] else {}
    cur.execute("SELECT data_json FROM exams_by_grade WHERE school_id = ?", (school_id,))
    r = cur.fetchone()
    exams_by_grade = json.loads(r["data_json"]) if r and r["data_json"] else {}
    cur.execute("SELECT data_json FROM exam_sections WHERE school_id = ?", (school_id,))
    r = cur.fetchone()
    exam_sections = json.loads(r["data_json"]) if r and r["data_json"] else {}
    cur.execute("SELECT username, data_json FROM school_users WHERE school_id = ?", (school_id,))
    users = {}
    for row in cur.fetchall():
        try:
            users[row["username"]] = json.loads(row["data_json"] or "{}")
        except Exception:
            users[row["username"]] = {}
    return {
        "students": students, "exams": exams, "exam_category": exam_category,
        "exams_by_grade": exams_by_grade, "exam_sections": exam_sections,
        "subjects": subjects, "subjects_by_class": subjects_by_class,
        "grades_config": grades_config, "users": users,
    }


def _row_to_dict(row):
    return dict(row) if row is not None else None


def _clean_text(value):
    if value is None:
        return ""
    return str(value).strip()


def _required_text(data, key, label=None):
    value = _clean_text((data or {}).get(key))
    if not value:
        raise ValueError((label or key) + " is required")
    return value


def _optional_int(value, label):
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(label + " must be a whole number")


def _required_int(data, key, label=None):
    value = _optional_int((data or {}).get(key), label or key)
    if value is None:
        raise ValueError((label or key) + " is required")
    return value


def _optional_float(value, label):
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(label + " must be a number")


def _student_score(student):
    if not isinstance(student, dict):
        return None
    for key in ("placement_score", "total_score", "score", "placement_test_score"):
        raw = student.get(key)
        if raw is None or str(raw).strip() == "":
            continue
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            continue
    return None


def _fetch_course(conn, school_id, course_id):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            id, school_id, name, duration, fee, description,
            start_date, end_date, capacity, current_enrollment,
            locations, age_group, schedule, instructor, status, created_at
        FROM courses
        WHERE school_id = ? AND id = ?
        """,
        (school_id, course_id),
    )
    return _row_to_dict(cur.fetchone())


def _fetch_level(conn, school_id, level_id):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            l.id,
            l.school_id,
            l.course_id,
            l.name,
            l.min_score,
            l.max_score,
            l.cefr,
            l.locations,
            l.description,
            l.duration,
            c.name AS course_name
        FROM levels l
        LEFT JOIN courses c ON c.id = l.course_id
        WHERE l.school_id = ? AND l.id = ?
        """,
        (school_id, level_id),
    )
    return _row_to_dict(cur.fetchone())


def _fetch_batch(conn, school_id, batch_id):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            b.id,
            b.school_id,
            b.name,
            b.course_id,
            b.level_id,
            b.teacher_name,
            b.teacher_username,
            b.schedule,
            b.start_date,
            b.end_date,
            b.max_students,
            b.location,
            b.created_at,
            c.name AS course_name,
            l.name AS level_name,
            l.min_score,
            l.max_score
        FROM batches b
        JOIN courses c ON c.id = b.course_id
        JOIN levels l ON l.id = b.level_id
        WHERE b.school_id = ? AND b.id = ?
        """,
        (school_id, batch_id),
    )
    return _row_to_dict(cur.fetchone())


def _fetch_batch_timetable(conn, school_id, timetable_id):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            t.id,
            t.school_id,
            t.batch_id,
            t.day,
            t.time,
            t.subject,
            t.teacher_name,
            t.room_location AS location,
            t.created_at,
            b.name AS batch_name,
            c.name AS course_name,
            l.name AS level_name
        FROM batch_timetables t
        JOIN batches b ON b.id = t.batch_id
        JOIN courses c ON c.id = b.course_id
        JOIN levels l ON l.id = b.level_id
        WHERE t.school_id = ? AND t.id = ?
        """,
        (school_id, timetable_id),
    )
    return _row_to_dict(cur.fetchone())


def _students_in_batch(conn, school_id, batch_id, exclude_student_id=None):
    cur = conn.cursor()
    cur.execute("SELECT student_id, data_json FROM students WHERE school_id = ?", (school_id,))
    out = []
    for row in cur.fetchall():
        sid = row["student_id"]
        if exclude_student_id and sid == exclude_student_id:
            continue
        try:
            data = json.loads(row["data_json"] or "{}")
        except Exception:
            data = {}
        raw_batch_id = data.get("batch_id")
        try:
            current_batch_id = int(raw_batch_id) if raw_batch_id is not None and str(raw_batch_id).strip() != "" else None
        except (TypeError, ValueError):
            current_batch_id = None
        if current_batch_id == batch_id:
            out.append({"student_id": sid, **data})
    return out


def _sync_student_academic_fields(conn, school_id, student, student_id=None):
    normalized = dict(student or {})
    batch_id = _optional_int(normalized.get("batch_id"), "batch_id")
    course_id = _optional_int(normalized.get("course_id"), "course_id")
    level_id = _optional_int(normalized.get("level_id"), "level_id")
    score = _student_score(normalized)

    if "batch_id" in normalized and batch_id is None:
        normalized["batch_id"] = ""
        normalized["batch_name"] = ""
        normalized["class"] = normalized.get("class") or ""

    if batch_id is not None:
        batch = _fetch_batch(conn, school_id, batch_id)
        if not batch:
            raise ValueError("Selected batch was not found")
        if batch["max_students"] and len(_students_in_batch(conn, school_id, batch_id, exclude_student_id=student_id)) >= int(batch["max_students"]):
            raise ValueError("Selected batch is already full")
        if score is not None and not (int(batch["min_score"]) <= score <= int(batch["max_score"])):
            raise ValueError(
                "Student score "
                + str(score)
                + " does not match level range "
                + str(batch["min_score"])
                + "-"
                + str(batch["max_score"])
            )
        normalized["batch_id"] = batch["id"]
        normalized["batch_name"] = batch["name"]
        normalized["class"] = batch["name"]
        normalized["course_id"] = batch["course_id"]
        normalized["course"] = batch["course_name"]
        normalized["grade"] = batch["course_name"]
        normalized["level_id"] = batch["level_id"]
        normalized["level"] = batch["level_name"]
        normalized["teacher_name"] = batch["teacher_name"]
        return normalized

    if course_id is not None:
        course = _fetch_course(conn, school_id, course_id)
        if not course:
            raise ValueError("Selected course was not found")
        normalized["course_id"] = course["id"]
        normalized["course"] = course["name"]
        normalized["grade"] = course["name"]

    if level_id is not None:
        level = _fetch_level(conn, school_id, level_id)
        if not level:
            raise ValueError("Selected level was not found")
        if score is not None and not (int(level["min_score"]) <= score <= int(level["max_score"])):
            raise ValueError(
                "Student score "
                + str(score)
                + " does not match level range "
                + str(level["min_score"])
                + "-"
                + str(level["max_score"])
            )
        normalized["level_id"] = level["id"]
        normalized["level"] = level["name"]

    return normalized


def _serialize_course_payload(payload):
    name = _required_text(payload, "name", "Course name")
    duration = _required_text(payload, "duration", "Duration")
    fee = _optional_float((payload or {}).get("fee"), "Fee")
    capacity = _optional_int((payload or {}).get("capacity"), "Capacity")
    current_enrollment = _optional_int((payload or {}).get("current_enrollment"), "Current enrollment")
    if capacity is not None and capacity < 0:
        raise ValueError("Capacity cannot be negative")
    if current_enrollment is not None and current_enrollment < 0:
        raise ValueError("Current enrollment cannot be negative")
    if capacity is not None and current_enrollment is not None and current_enrollment > capacity:
        raise ValueError("Current enrollment cannot exceed capacity")
    status = _clean_text((payload or {}).get("status")).lower() or "active"
    if status not in ("active", "inactive"):
        status = "active"
    return {
        "name": name,
        "duration": duration,
        "fee": 0 if fee is None else fee,
        "description": _clean_text((payload or {}).get("description")),
        "start_date": _clean_text((payload or {}).get("start_date")),
        "end_date": _clean_text((payload or {}).get("end_date")),
        "capacity": 0 if capacity is None else capacity,
        "current_enrollment": 0 if current_enrollment is None else current_enrollment,
        "locations": _clean_text((payload or {}).get("locations")),
        "age_group": _clean_text((payload or {}).get("age_group")),
        "schedule": _clean_text((payload or {}).get("schedule")),
        "instructor": _clean_text((payload or {}).get("instructor")),
        "status": status,
    }


def _serialize_level_payload(payload):
    course_id = _required_int(payload, "course_id", "Course")
    conn = payload.get("_conn")
    school_id = payload.get("_school_id")
    course = _fetch_course(conn, school_id, course_id) if conn and school_id else None
    if not course:
        raise ValueError("Selected course was not found")
    name = _required_text(payload, "name", "Level name")
    cefr = _required_text(payload, "cefr", "CEFR level")
    locations = _required_text(payload, "locations", "Locations")
    description = _clean_text((payload or {}).get("description"))
    duration = _clean_text((payload or {}).get("duration"))
    min_score = _optional_int((payload or {}).get("min_score"), "Minimum score")
    max_score = _optional_int((payload or {}).get("max_score"), "Maximum score")
    if min_score is None:
        min_score = 0
    if max_score is None:
        max_score = 100
    if min_score < 0 or max_score > 100 or min_score > max_score:
        raise ValueError("Level score range must be between 0 and 100 and min_score cannot exceed max_score")
    return {
        "course_id": course_id,
        "name": name,
        "min_score": min_score,
        "max_score": max_score,
        "cefr": cefr,
        "locations": locations,
        "description": description,
        "duration": duration,
    }


def _serialize_batch_payload(conn, school_id, payload):
    name = _required_text(payload, "name", "Batch name")
    course_id = _required_int(payload, "course_id", "Course")
    level_id = _required_int(payload, "level_id", "Level")
    course = _fetch_course(conn, school_id, course_id)
    if not course:
        raise ValueError("Selected course was not found")
    level = _fetch_level(conn, school_id, level_id)
    if not level:
        raise ValueError("Selected level was not found")
    if _optional_int(level.get("course_id"), "course_id") != course_id:
        raise ValueError("Selected level does not belong to the chosen course")
    max_students = _required_int(payload, "max_students", "Max students")
    if max_students <= 0:
        raise ValueError("Max students must be greater than zero")
    start_date = _clean_text((payload or {}).get("start_date"))
    if not start_date:
        start_date = datetime.now().strftime("%Y-%m-%d")
    teacher_name = _required_text(payload, "teacher_name", "Teacher name")
    teacher_username = _clean_text((payload or {}).get("teacher_username"))
    schedule = _required_text(payload, "schedule", "Schedule")
    location = _required_text(payload, "location", "Location")
    end_date = _clean_text((payload or {}).get("end_date"))
    if end_date and end_date < start_date:
        raise ValueError("End date cannot be earlier than start date")
    return {
        "name": name,
        "course_id": course_id,
        "level_id": level_id,
        "teacher_name": teacher_name,
        "teacher_username": teacher_username or "",
        "schedule": schedule,
        "start_date": start_date,
        "end_date": end_date,
        "max_students": max_students,
        "location": location,
    }


def _serialize_batch_timetable_payload(conn, school_id, payload):
    batch_id = _required_int(payload, "batch_id", "Batch")
    batch = _fetch_batch(conn, school_id, batch_id)
    if not batch:
        raise ValueError("Selected batch was not found")
    day = _required_text(payload, "day", "Day")
    time = _required_text(payload, "time", "Time")
    subject = _required_text(payload, "subject", "Subject")
    teacher_name = _clean_text((payload or {}).get("teacher_name"))
    room_location = _clean_text((payload or {}).get("location"))
    if not teacher_name:
        teacher_name = _clean_text(batch.get("teacher_name"))
    if not room_location:
        room_location = _clean_text(batch.get("location"))
    return {
        "batch_id": batch_id,
        "day": day,
        "time": time,
        "subject": subject,
        "teacher_name": teacher_name or "",
        "room_location": room_location or "",
    }


def _teacher_display_name(conn, school_id, username):
    if not username:
        return ""
    cur = conn.cursor()
    cur.execute("SELECT data_json FROM school_users WHERE school_id = ? AND username = ?", (school_id, username))
    row = cur.fetchone()
    if not row:
        return ""
    try:
        d = json.loads(row["data_json"] or "{}")
        return (d.get("name") or "").strip()
    except Exception:
        return ""


def _batch_visible_to_teacher(conn, school_id, batch_row, teacher_username):
    """Teacher sees batch if teacher_username matches account, or legacy match on teacher_name vs account name."""
    if not teacher_username:
        return True
    tu = (batch_row.get("teacher_username") or "").strip()
    if tu:
        return tu == teacher_username
    t_display = _teacher_display_name(conn, school_id, teacher_username)
    b_tn = (batch_row.get("teacher_name") or "").strip()
    if not t_display or not b_tn:
        return False
    return t_display.lower() == b_tn.lower()


def _date_to_timetable_day(date_str):
    """Map YYYY-MM-DD to batch_timetables day label (Mon..Sun)."""
    try:
        d = datetime.strptime((date_str or "").strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.weekday()]


def _batch_has_timetable_on_date(conn, school_id, batch_id, date_str):
    day = _date_to_timetable_day(date_str)
    if not day:
        return False
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM batch_timetables WHERE school_id = ? AND batch_id = ? AND day = ? LIMIT 1",
        (school_id, int(batch_id), day),
    )
    return cur.fetchone() is not None


def _attendance_status_ok(s):
    return (s or "").strip().lower() in ("present", "absent", "late")


def _attendance_session_locked(conn, school_id, batch_id, date_str):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT 1 FROM attendance_session_lock
        WHERE school_id = ? AND batch_id = ? AND date = ?
        LIMIT 1
        """,
        (school_id, int(batch_id), (date_str or "").strip()[:10]),
    )
    return cur.fetchone() is not None


def _lock_attendance_session(conn, school_id, batch_id, date_str, taken_by):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO attendance_session_lock (school_id, batch_id, date, locked_at, taken_by)
        VALUES (?, ?, ?, datetime('now'), ?)
        ON CONFLICT(school_id, batch_id, date) DO UPDATE SET
            locked_at = excluded.locked_at,
            taken_by = excluded.taken_by
        """,
        (school_id, int(batch_id), (date_str or "").strip()[:10], (taken_by or "").strip()),
    )


def _timetable_slots_for_date(conn, school_id, batch_id, date_str):
    day = _date_to_timetable_day(date_str)
    if not day:
        return []
    cur = conn.cursor()
    cur.execute(
        """
        SELECT time, subject, day
      FROM batch_timetables
        WHERE school_id = ? AND batch_id = ? AND day = ?
        ORDER BY time COLLATE NOCASE, subject COLLATE NOCASE
        """,
        (school_id, int(batch_id), day),
    )
    return [_row_to_dict(row) for row in cur.fetchall()]


def _primary_subject_for_batch_date(conn, school_id, batch_id, date_str):
    """First timetable subject for that calendar day's weekday (matches take-attendance primary slot)."""
    slots = _timetable_slots_for_date(conn, school_id, batch_id, date_str)
    if not slots:
        return ""
    return (slots[0].get("subject") or "").strip()


def _attendance_recent_for_students(conn, school_id, batch_id, date_str, student_ids, limit=3):
    """For each student_id, up to `limit` most recent statuses strictly before date_str."""
    date_str = (date_str or "").strip()[:10]
    buckets = {sid: [] for sid in student_ids}
    if not student_ids or not date_str:
        return buckets
    placeholders = ",".join("?" * len(student_ids))
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT student_id, status, date
        FROM attendance
        WHERE school_id = ? AND batch_id = ? AND date < ?
          AND student_id IN ({placeholders})
        ORDER BY student_id, date DESC
        """,
        [school_id, int(batch_id), date_str] + list(student_ids),
    )
    for row in cur.fetchall():
        sid = row["student_id"]
        if len(buckets[sid]) >= limit:
            continue
        buckets[sid].append((row["status"] or "").lower())
    return buckets


# ——— API ———

@app.route("/")
def index():
    return redirect("/public-page/index.html")


@app.route("/robots.txt")
def serve_robots_txt():
    return send_from_directory(WEB_ROOT, "robots.txt", mimetype="text/plain; charset=utf-8")


@app.route("/sitemap.xml")
def serve_sitemap_xml():
    return send_from_directory(WEB_ROOT, "sitemap.xml", mimetype="application/xml; charset=utf-8")


@app.route("/school_background.png")
def login_background():
    """Serve login background image from project root."""
    r = send_from_directory(WEB_ROOT, "school_background.png")
    r.headers["Cache-Control"] = "public, max-age=3600"
    return r


@app.route("/logo.png")
def logo():
    """Serve school logo from project root."""
    r = send_from_directory(WEB_ROOT, "logo.png")
    r.headers["Cache-Control"] = "public, max-age=3600"
    return r


@app.route("/favicon.ico")
def favicon():
    """Serve logo as favicon to avoid 404."""
    r = send_from_directory(WEB_ROOT, "logo.png", mimetype="image/png")
    r.headers["Cache-Control"] = "public, max-age=3600"
    return r


@app.route("/api/ping", methods=["GET"])
def api_ping():
    """Test that server is reachable."""
    return jsonify({"ok": True, "message": "pong"})


@app.route("/api/config", methods=["GET"])
def api_config():
    """Data dir, school id, academic year and list (same logic as sms.py)."""
    data_dir = get_data_dir()
    school_id = get_school_id()
    cfg = get_app_config_from_default_db()
    year = (cfg.get("academic_year") or "").strip() or DEFAULT_YEAR
    academic_years = cfg.get("academic_years")
    if not isinstance(academic_years, list):
        academic_years = [year]
    academic_years = [str(y).strip() for y in academic_years if y and str(y).strip()]
    if not academic_years:
        academic_years = [DEFAULT_YEAR]
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, name, admin_username, primary_color FROM schools")
        schools = [{"id": row["id"], "name": row["name"], "admin_username": row["admin_username"], "primary_color": row["primary_color"] or "#27ae60"} for row in cur.fetchall()]
        if not schools:
            schools = [{"id": school_id, "name": DEFAULT_SCHOOL_DISPLAY_NAME, "admin_username": "admin", "primary_color": "#27ae60"}]
        conn.close()
    except Exception:
        schools = [{"id": school_id, "name": DEFAULT_SCHOOL_DISPLAY_NAME, "admin_username": "admin", "primary_color": "#27ae60"}]
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            file_cfg = json.load(f)
        sync_server_url = (file_cfg.get("sync_server_url") or "").strip()
    except Exception:
        sync_server_url = ""
    db_path = get_db_path(year)
    return jsonify({
        "data_dir": data_dir,
        "school_id": school_id,
        "academic_year": year,
        "academic_years": academic_years,
        "schools": schools,
        "sync_server_url": sync_server_url,
        "db_path": db_path,
    })


@app.route("/api/config", methods=["POST"])
def api_config_set():
    """Set current academic year (and optionally add to list). Same logic as sms.py _set_academic_year / Settings save."""
    data = request.get_json() or {}
    new_year = (data.get("academic_year") or "").strip()
    if not new_year:
        return jsonify({"ok": False, "error": "academic_year required"}), 400
    try:
        conn = get_conn(DEFAULT_YEAR)
        ensure_app_config(conn)
        cur = conn.cursor()
        cur.execute("SELECT `key`, value FROM app_config")
        app_config = {}
        for row in cur.fetchall():
            k, v = row["key"], row["value"]
            if v is None:
                continue
            try:
                app_config[k] = json.loads(v) if v.strip().startswith(("[", "{")) else v
            except Exception:
                app_config[k] = v
        years_list = app_config.get("academic_years") or []
        if not isinstance(years_list, list):
            years_list = [app_config.get("academic_year") or DEFAULT_YEAR]
        if new_year not in years_list:
            years_list.append(new_year)
            years_list.sort()
        app_config["academic_years"] = years_list
        app_config["academic_year"] = new_year
        cur.execute("DELETE FROM app_config")
        for k, v in app_config.items():
            cur.execute("INSERT INTO app_config (`key`, value) VALUES (?, ?)",
                        (k, v if isinstance(v, str) else json.dumps(v)))
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "academic_year": new_year, "academic_years": years_list})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    school_id = (data.get("school_id") or "").strip() or get_school_id()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "")
    print("[LOGIN] school_id=%r username=%r password_len=%d" % (school_id, username, len(password)))
    if not username:
        return jsonify({"ok": False, "error": "Username required"}), 400

    # MySQL bcrypt account (if MYSQL_DATABASE set + row exists) — sets Flask session for /auth/* pages
    if mysql_api_login:
        try:
            conn_s = get_conn()
            cur_s = conn_s.cursor()
            cur_s.execute("SELECT id, name, admin_username, admin_password FROM schools WHERE id = ?", (school_id,))
            srow = cur_s.fetchone()
            if not srow:
                ensure_school(conn_s)
                conn_s.commit()
                cur_s.execute("SELECT id, name, admin_username, admin_password FROM schools WHERE id = ?", (school_id,))
                srow = cur_s.fetchone()
            school_name = (srow["name"] if srow else "School") or "School"
            conn_s.close()
            my = mysql_api_login(username, password, request, school_id, school_name)
            if my is not None:
                if not my.get("ok"):
                    return jsonify(my), 401
                session.clear()
                session["user_id"] = my.get("mysql_user_id")
                session["role"] = my.get("role")
                session["username"] = my.get("username")
                session["must_change_password"] = bool(my.get("must_change_password"))
                session["last_seen"] = datetime.utcnow().isoformat()
                session.permanent = True
                public = {k: v for k, v in my.items() if k != "mysql_user_id"}
                print("[LOGIN] OK: mysql role=%s" % my.get("role"))
                return jsonify(public)
        except Exception as e:
            print("[LOGIN] MySQL branch error (falling back to SQLite):", e)

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, name, admin_username, admin_password FROM schools WHERE id = ?", (school_id,))
        row = cur.fetchone()
        if not row:
            print("[LOGIN] School not in DB, running ensure_school...")
            ensure_school(conn)
            conn.commit()
            cur.execute("SELECT id, name, admin_username, admin_password FROM schools WHERE id = ?", (school_id,))
            row = cur.fetchone()
        if not row:
            conn.close()
            print("[LOGIN] FAIL: School not found")
            return jsonify({"ok": False, "error": "School not found. Use default: admin / admin"}), 401
        if row["admin_username"] == username and _check_admin_password(row["admin_password"], password):
            if not _is_hashed(row["admin_password"]):
                try:
                    cur.execute("UPDATE schools SET admin_password = ? WHERE id = ?", (_hash_password(password), school_id))
                    conn.commit()
                except Exception:
                    pass
            conn.close()
            print("[LOGIN] OK: admin")
            session.clear()
            return jsonify({"ok": True, "role": "admin", "school_id": school_id, "school_name": row["name"], "username": username, "must_change_password": False})
        cur.execute("SELECT data_json FROM school_users WHERE school_id = ? AND username = ?", (school_id, username))
        u = cur.fetchone()
        matched_ud = None
        matched_row_username = username
        if u:
            ud = json.loads(u["data_json"] or "{}")
            exp = _sqlite_user_expected_password(ud, username)
            if exp and exp == password:
                matched_ud = ud
        if matched_ud is None:
            tuname, tud = _sqlite_find_teacher_row(cur, school_id, username)
            if tud is not None:
                exp = _sqlite_user_expected_password(tud, tuname)
                if exp and exp == password:
                    matched_ud = tud
                    matched_row_username = tuname
        if matched_ud is not None:
            conn.close()
            print("[LOGIN] OK: user (sqlite)")
            session.clear()
            rrole = matched_ud.get("role", "class")
            if rrole == "class":
                rrole = "teacher"
            disp = (matched_ud.get("name") or "").strip() or matched_row_username
            uid_out = (matched_ud.get("teacher_id") or matched_ud.get("student_id") or matched_row_username or username).strip()
            return jsonify(
                {
                    "ok": True,
                    "role": rrole,
                    "school_id": school_id,
                    "school_name": row["name"],
                    "username": matched_row_username,
                    "user_id": uid_out,
                    "class": matched_ud.get("class"),
                    "must_change_password": False,
                    "display_name": disp,
                }
            )

        # Students live in `students` table (often no users row) — allow student_id + default password = ID
        cur.execute(
            "SELECT data_json FROM students WHERE school_id = ? AND student_id = ?",
            (school_id, username),
        )
        srow = cur.fetchone()
        if srow:
            try:
                sd = json.loads(srow["data_json"] or "{}")
            except Exception:
                sd = {}
            s_expected = (sd.get("password") or username or "").strip()
            if s_expected and s_expected == password:
                conn.close()
                print("[LOGIN] OK: student (sqlite students table)")
                session.clear()
                disp = (sd.get("name") or "").strip() or username
                return jsonify(
                    {
                        "ok": True,
                        "role": "student",
                        "school_id": school_id,
                        "school_name": row["name"],
                        "username": username,
                        "user_id": username,
                        "must_change_password": False,
                        "display_name": disp,
                    }
                )

        conn.close()
        print("[LOGIN] FAIL: Invalid username or password")
    except Exception as e:
        print("[LOGIN] EXCEPTION:", e)
        return jsonify({"ok": False, "error": "Server error: " + str(e)}), 500
    return jsonify({"ok": False, "error": "Invalid username or password"}), 401


@app.route("/api/change-password", methods=["POST"])
def api_change_password():
    """Change password for current user (admin or regular user). Requires current password."""
    data = request.get_json(silent=True) or {}
    school_id = (data.get("school_id") or "").strip() or get_school_id()
    username = (data.get("username") or "").strip()
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""
    if not username:
        return jsonify({"ok": False, "error": "Username required"}), 400
    if not current_password:
        return jsonify({"ok": False, "error": "Current password required"}), 400
    if not new_password or len(new_password) < 6:
        return jsonify({"ok": False, "error": "New password must be at least 6 characters"}), 400

    if mysql_api_change_password:
        my_cp = mysql_api_change_password(username, current_password, new_password, request)
        if my_cp is not None:
            if my_cp.get("ok"):
                return jsonify(my_cp), 200
            err = (my_cp.get("error") or "").lower()
            status = 401 if "incorrect" in err else 400
            return jsonify(my_cp), status

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, name, admin_username, admin_password FROM schools WHERE id = ?", (school_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return jsonify({"ok": False, "error": "School not found"}), 404
        # Admin user
        if row["admin_username"] == username:
            if not _check_admin_password(row["admin_password"], current_password):
                conn.close()
                return jsonify({"ok": False, "error": "Current password is incorrect"}), 401
            cur.execute("UPDATE schools SET admin_password = ? WHERE id = ?", (_hash_password(new_password), school_id))
            conn.commit()
            conn.close()
            return jsonify({"ok": True, "message": "Password updated"})
        # Regular user (users table)
        cur.execute("SELECT data_json FROM school_users WHERE school_id = ? AND username = ?", (school_id, username))
        u = cur.fetchone()
        if not u:
            conn.close()
            return jsonify({"ok": False, "error": "User not found"}), 404
        ud = json.loads(u["data_json"] or "{}")
        if ud.get("password") != current_password:
            conn.close()
            return jsonify({"ok": False, "error": "Current password is incorrect"}), 401
        ud["password"] = new_password
        cur.execute("UPDATE school_users SET data_json = ? WHERE school_id = ? AND username = ?",
                    (json.dumps(ud, ensure_ascii=False), school_id, username))
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "message": "Password updated"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


def _load_web_extra_list(cur, school_id, data_key):
    out = []
    try:
        cur.execute("SELECT data_json FROM web_extra WHERE school_id = ? AND data_key = ?", (school_id, data_key))
        row = cur.fetchone()
        if row and row["data_json"]:
            out = json.loads(row["data_json"])
            if not isinstance(out, list):
                out = []
    except Exception:
        pass
    return out


@app.route("/api/dashboard", methods=["GET"])
def api_dashboard():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        cur = conn.cursor()
        staff_list = _load_web_extra_list(cur, school_id, "staff")
        attendance_list = _load_web_extra_list(cur, school_id, "attendance")
        fees_list = _load_web_extra_list(cur, school_id, "fees")
        notices_list = _load_web_extra_list(cur, school_id, "notices")
        conn.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    students = data["students"]
    total = len(students)
    male = sum(1 for s in students.values() if s.get("gender") == "Male")
    female = sum(1 for s in students.values() if s.get("gender") == "Female")
    grades_config = data["grades_config"] or {}
    users = data["users"] or {}
    total_teachers = sum(1 for u in users.values() if (u or {}).get("role") in ("class", "teacher"))
    total_staff = len(staff_list)

    today_str = date.today().isoformat()
    todays_attendance = sum(
        int((a.get("present") or 0))
        for a in attendance_list
        if (a.get("date") or "").strip() == today_str
    )

    now = datetime.now()
    monthly_fee_collection = 0
    for f in fees_list:
        if not f.get("paid"):
            continue
        due = f.get("due_date") or ""
        try:
            if len(due) >= 7:
                y, m = int(due[:4]), int(due[5:7])
                if y == now.year and m == now.month:
                    monthly_fee_collection += int(f.get("amount") or 0)
        except (ValueError, TypeError):
            pass

    recent_notices = len(notices_list)
    upcoming_events = 0  # placeholder until events module exists

    def _parse_date_safe(raw):
        s = str(raw or "").strip()
        if not s:
            return None
        core = s[:10]
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(core, fmt).date()
            except ValueError:
                continue
        return None

    priority_alerts = []

    unpaid_fees = [f for f in fees_list if not f.get("paid")]
    if unpaid_fees:
        soonest_days = None
        soonest_date = None
        for f in unpaid_fees:
            due_date = _parse_date_safe(f.get("due_date"))
            if not due_date:
                continue
            days_left = (due_date - date.today()).days
            if soonest_days is None or days_left < soonest_days:
                soonest_days = days_left
                soonest_date = due_date
        level = "warning"
        suffix = ""
        if soonest_days is not None:
            if soonest_days <= 1:
                level = "urgent"
            if soonest_days < 0:
                suffix = f" (overdue by {abs(soonest_days)} day(s))"
            elif soonest_days == 0:
                suffix = " (deadline: today)"
            elif soonest_days == 1:
                suffix = " (deadline: tomorrow)"
            else:
                suffix = f" (deadline: {soonest_date.isoformat()})"
        priority_alerts.append({
            "level": level,
            "message": f"{len(unpaid_fees)} students pending fee payment{suffix}"
        })

    if total > 0:
        attendance_pct = int(round((todays_attendance * 100.0) / max(total, 1)))
        if attendance_pct < 85:
            priority_alerts.append({
                "level": "warning",
                "message": f"Today's attendance is low ({attendance_pct}%)"
            })
        else:
            priority_alerts.append({
                "level": "success",
                "message": f"Today's attendance is healthy ({attendance_pct}%)"
            })

    if recent_notices > 0:
        priority_alerts.append({
            "level": "info",
            "message": f"{recent_notices} notice(s) currently published"
        })

    new_admissions_this_month = 0
    for s in students.values():
        admitted_on = _parse_date_safe(
            s.get("enrollment_date") or s.get("admission_date") or s.get("created_at")
        )
        if admitted_on and admitted_on.year == now.year and admitted_on.month == now.month:
            new_admissions_this_month += 1
    if new_admissions_this_month > 0:
        priority_alerts.append({
            "level": "success",
            "message": f"{new_admissions_this_month} new admission(s) this month"
        })

    if not priority_alerts:
        priority_alerts.append({"level": "info", "message": "No priority alerts right now"})

    def _month_day(raw):
        d = _parse_date_safe(raw)
        if d:
            return d.month, d.day
        s = str(raw or "").strip()
        if not s:
            return None
        for fmt in ("%d-%m", "%d/%m", "%m-%d", "%m/%d"):
            try:
                tmp = datetime.strptime(s, fmt)
                return tmp.month, tmp.day
            except ValueError:
                continue
        return None

    birthdays_today = 0
    today_md = (date.today().month, date.today().day)
    for s in students.values():
        md = _month_day(s.get("dob") or s.get("date_of_birth"))
        if md == today_md:
            birthdays_today += 1
    for st in staff_list:
        md = _month_day(st.get("dob") or st.get("date_of_birth"))
        if md == today_md:
            birthdays_today += 1

    alerts_notifications = sum(
        1 for a in priority_alerts if (a.get("level") in ("urgent", "warning"))
    )

    return jsonify({
        "ok": True,
        "total_students": total,
        "male": male,
        "female": female,
        "total_teachers": total_teachers,
        "total_staff": total_staff,
        "todays_attendance": todays_attendance,
        "monthly_fee_collection": monthly_fee_collection,
        "recent_notices": recent_notices,
        "upcoming_events": upcoming_events,
        "alerts_notifications": alerts_notifications,
        "priority_alerts": priority_alerts,
        "new_admissions_this_month": new_admissions_this_month,
        "birthdays_today": birthdays_today,
        "grade_distribution": _grade_distribution(students),
    })


def _normalize_grade(grade_str):
    if not grade_str or not isinstance(grade_str, str):
        return ""
    s = grade_str.strip().lower().replace("  ", " ")
    if not s:
        return ""
    if s == "kg":
        return "kg"
    if s.isdigit():
        n = int(s)
        if 1 <= n <= 12:
            return "grade " + s
    return s


def _grade_distribution(students):
    fixed = ("KG", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12")
    out = []
    for g in fixed:
        norm = _normalize_grade(g)
        male = sum(1 for s in students.values() if _normalize_grade(s.get("grade") or "") == norm and (s.get("gender") or "").strip() == "Male")
        female = sum(1 for s in students.values() if _normalize_grade(s.get("grade") or "") == norm and (s.get("gender") or "").strip() == "Female")
        out.append({"grade": g, "male": male, "female": female})
    return out


@app.route("/api/students", methods=["GET"])
def api_students_list():
    school_id = request.args.get("school_id") or get_school_id()
    grade = request.args.get("grade")
    class_name = request.args.get("class")
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        conn.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    students = data["students"]
    if grade:
        students = {k: v for k, v in students.items() if (v.get("grade") or "").strip() == grade}
    if class_name:
        students = {k: v for k, v in students.items() if (v.get("class") or "").strip() == class_name}
    list_ = [{"student_id": k, **v} for k, v in students.items()]
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM batches WHERE school_id = ?", (school_id,))
        batch_names = {row["id"]: row["name"] for row in cur.fetchall()}
        conn.close()
    except Exception:
        batch_names = {}
    for item in list_:
        batch_id = _optional_int(item.get("batch_id"), "batch_id")
        if batch_id is not None:
            item["batch_id"] = batch_id
            item["batch_name"] = item.get("batch_name") or batch_names.get(batch_id) or ""
    list_.sort(key=lambda x: (x.get("name") or "").lower())
    return jsonify({"ok": True, "students": list_})


@app.route("/api/students/<student_id>", methods=["GET"])
def api_student_get(student_id):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT data_json FROM students WHERE school_id = ? AND student_id = ?", (school_id, student_id))
        row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify({"ok": False, "error": "Not found"}), 404
        return jsonify({"ok": True, "student": json.loads(row["data_json"] or "{}"), "student_id": student_id})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/students", methods=["POST"])
def api_student_add():
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    student = request.get_json() or {}
    student_id = (student.get("student_id") or "").strip()
    if not student_id:
        return jsonify({"ok": False, "error": "student_id required"}), 400
    if not (student.get("password") or "").strip():
        student["password"] = student_id
    try:
        conn = get_conn()
        student = _sync_student_academic_fields(conn, school_id, student, student_id=student_id)
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO students (school_id, student_id, data_json) VALUES (?, ?, ?)",
                    (school_id, student_id, json.dumps(student, ensure_ascii=False)))
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "student_id": student_id})
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/students/<student_id>", methods=["PUT"])
def api_student_update(student_id):
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    student = request.get_json() or {}
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT data_json FROM students WHERE school_id = ? AND student_id = ?", (school_id, student_id))
        row = cur.fetchone()
        if not row:
            conn.close()
            return jsonify({"ok": False, "error": "Not found"}), 404
        existing = json.loads(row["data_json"] or "{}")
        existing.update(student)
        existing["student_id"] = student_id
        existing = _sync_student_academic_fields(conn, school_id, existing, student_id=student_id)
        cur.execute("UPDATE students SET data_json = ? WHERE school_id = ? AND student_id = ?",
                    (json.dumps(existing, ensure_ascii=False), school_id, student_id))
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "student_id": student_id})
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/students/<student_id>", methods=["DELETE"])
def api_student_delete(student_id):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM students WHERE school_id = ? AND student_id = ?", (school_id, student_id))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/courses", methods=["GET"])
def api_courses_list():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                id, name, duration, fee, description,
                start_date, end_date, capacity, current_enrollment,
                locations, age_group, schedule, instructor, status, created_at
            FROM courses
            WHERE school_id = ?
            ORDER BY name COLLATE NOCASE
            """,
            (school_id,),
        )
        courses = [_row_to_dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({"ok": True, "courses": courses})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/courses", methods=["POST"])
def api_course_add():
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    payload = request.get_json() or {}
    try:
        data = _serialize_course_payload(payload)
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO courses (
                school_id, name, duration, fee, description,
                start_date, end_date, capacity, current_enrollment,
                locations, age_group, schedule, instructor, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id, data["name"], data["duration"], data["fee"], data["description"],
                data["start_date"], data["end_date"], data["capacity"], data["current_enrollment"],
                data["locations"], data["age_group"], data["schedule"], data["instructor"], data["status"],
            ),
        )
        course_id = cur.lastrowid
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "id": course_id})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "Course name already exists"}), 400
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/courses/<int:course_id>", methods=["PUT"])
def api_course_update(course_id):
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    payload = request.get_json() or {}
    try:
        data = _serialize_course_payload(payload)
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE courses
            SET name = ?, duration = ?, fee = ?, description = ?,
                start_date = ?, end_date = ?, capacity = ?, current_enrollment = ?,
                locations = ?, age_group = ?, schedule = ?, instructor = ?, status = ?
            WHERE school_id = ? AND id = ?
            """,
            (
                data["name"], data["duration"], data["fee"], data["description"],
                data["start_date"], data["end_date"], data["capacity"], data["current_enrollment"],
                data["locations"], data["age_group"], data["schedule"], data["instructor"], data["status"],
                school_id, course_id,
            ),
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"ok": False, "error": "Course not found"}), 404
        cur.execute("SELECT student_id, data_json FROM students WHERE school_id = ?", (school_id,))
        for row in cur.fetchall():
            try:
                student = json.loads(row["data_json"] or "{}")
            except Exception:
                student = {}
            if _optional_int(student.get("course_id"), "course_id") == course_id:
                student["course"] = data["name"]
                student["grade"] = data["name"]
                cur.execute(
                    "UPDATE students SET data_json = ? WHERE school_id = ? AND student_id = ?",
                    (json.dumps(student, ensure_ascii=False), school_id, row["student_id"]),
                )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "id": course_id})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "Course name already exists"}), 400
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/courses/<int:course_id>", methods=["DELETE"])
def api_course_delete(course_id):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id FROM levels WHERE school_id = ? AND course_id = ?", (school_id, course_id))
        level_ids = [int(row["id"]) for row in cur.fetchall()]
        cur.execute("SELECT id FROM batches WHERE school_id = ? AND course_id = ?", (school_id, course_id))
        batch_ids = [int(row["id"]) for row in cur.fetchall()]
        cur.execute("SELECT student_id, data_json FROM students WHERE school_id = ?", (school_id,))
        for row in cur.fetchall():
            try:
                student = json.loads(row["data_json"] or "{}")
            except Exception:
                student = {}
            sid = row["student_id"]
            changed = False
            student_course_id = _optional_int(student.get("course_id"), "course_id")
            student_level_id = _optional_int(student.get("level_id"), "level_id")
            student_batch_id = _optional_int(student.get("batch_id"), "batch_id")
            if student_course_id == course_id:
                student["course_id"] = ""
                student["course"] = ""
                student["grade"] = ""
                changed = True
            if student_level_id is not None and student_level_id in level_ids:
                student["level_id"] = ""
                student["level"] = ""
                changed = True
            if student_batch_id is not None and student_batch_id in batch_ids:
                student["batch_id"] = ""
                student["batch_name"] = ""
                student["class"] = ""
                changed = True
            if changed:
                cur.execute(
                    "UPDATE students SET data_json = ? WHERE school_id = ? AND student_id = ?",
                    (json.dumps(student, ensure_ascii=False), school_id, sid),
                )
        if batch_ids:
            marks = ",".join(["?"] * len(batch_ids))
            cur.execute(
                f"DELETE FROM batch_timetables WHERE school_id = ? AND batch_id IN ({marks})",
                tuple([school_id] + batch_ids),
            )
            cur.execute(
                f"DELETE FROM batches WHERE school_id = ? AND id IN ({marks})",
                tuple([school_id] + batch_ids),
            )
        if level_ids:
            marks = ",".join(["?"] * len(level_ids))
            cur.execute(
                f"DELETE FROM levels WHERE school_id = ? AND id IN ({marks})",
                tuple([school_id] + level_ids),
            )
        cur.execute("DELETE FROM courses WHERE school_id = ? AND id = ?", (school_id, course_id))
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"ok": False, "error": "Course not found"}), 404
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/levels", methods=["GET"])
def api_levels_list():
    school_id = request.args.get("school_id") or get_school_id()
    course_id = request.args.get("course_id")
    try:
        conn = get_conn()
        cur = conn.cursor()
        params = [school_id]
        where_sql = "WHERE l.school_id = ?"
        if course_id is not None and str(course_id).strip() != "":
            where_sql += " AND l.course_id = ?"
            params.append(int(course_id))
        cur.execute(
            f"""
            SELECT
                l.id,
                l.course_id,
                l.name,
                l.min_score,
                l.max_score,
                l.cefr,
                l.locations,
                l.description,
                l.duration,
                c.name AS course_name
            FROM levels l
            LEFT JOIN courses c ON c.id = l.course_id
            {where_sql}
            ORDER BY c.name COLLATE NOCASE, l.min_score ASC, l.max_score ASC, l.name COLLATE NOCASE
            """,
            tuple(params),
        )
        levels = [_row_to_dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({"ok": True, "levels": levels})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/levels", methods=["POST"])
def api_level_add():
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    payload = request.get_json() or {}
    try:
        conn = get_conn()
        payload["_conn"] = conn
        payload["_school_id"] = school_id
        data = _serialize_level_payload(payload)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO levels (
                school_id, course_id, name, min_score, max_score,
                cefr, locations, description, duration
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                data["course_id"],
                data["name"],
                data["min_score"],
                data["max_score"],
                data["cefr"],
                data["locations"],
                data["description"],
                data["duration"],
            ),
        )
        level_id = cur.lastrowid
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "id": level_id})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "Level name already exists"}), 400
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/levels/<int:level_id>", methods=["PUT"])
def api_level_update(level_id):
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    payload = request.get_json() or {}
    try:
        conn = get_conn()
        payload["_conn"] = conn
        payload["_school_id"] = school_id
        data = _serialize_level_payload(payload)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM batches WHERE school_id = ? AND level_id = ? AND course_id != ? LIMIT 1", (school_id, level_id, data["course_id"]))
        if cur.fetchone():
            conn.close()
            return jsonify({"ok": False, "error": "This level is already linked to batches from a different course"}), 400
        cur.execute(
            """
            UPDATE levels SET
                course_id = ?, name = ?, min_score = ?, max_score = ?,
                cefr = ?, locations = ?, description = ?, duration = ?
            WHERE school_id = ? AND id = ?
            """,
            (
                data["course_id"],
                data["name"],
                data["min_score"],
                data["max_score"],
                data["cefr"],
                data["locations"],
                data["description"],
                data["duration"],
                school_id,
                level_id,
            ),
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"ok": False, "error": "Level not found"}), 404
        cur.execute("SELECT student_id, data_json FROM students WHERE school_id = ?", (school_id,))
        for row in cur.fetchall():
            try:
                student = json.loads(row["data_json"] or "{}")
            except Exception:
                student = {}
            if _optional_int(student.get("level_id"), "level_id") == level_id:
                score = _student_score(student)
                if score is not None and not (data["min_score"] <= score <= data["max_score"]):
                    conn.close()
                    return jsonify({"ok": False, "error": "Existing assigned students fall outside the new score range"}), 400
                student["level"] = data["name"]
                cur.execute(
                    "UPDATE students SET data_json = ? WHERE school_id = ? AND student_id = ?",
                    (json.dumps(student, ensure_ascii=False), school_id, row["student_id"]),
                )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "id": level_id})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "Level name already exists"}), 400
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/levels/<int:level_id>", methods=["DELETE"])
def api_level_delete(level_id):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id FROM batches WHERE school_id = ? AND level_id = ?", (school_id, level_id))
        batch_ids = [int(row["id"]) for row in cur.fetchall()]
        cur.execute("SELECT student_id, data_json FROM students WHERE school_id = ?", (school_id,))
        for row in cur.fetchall():
            try:
                student = json.loads(row["data_json"] or "{}")
            except Exception:
                student = {}
            sid = row["student_id"]
            changed = False
            student_level_id = _optional_int(student.get("level_id"), "level_id")
            student_batch_id = _optional_int(student.get("batch_id"), "batch_id")
            if student_level_id == level_id:
                student["level_id"] = ""
                student["level"] = ""
                changed = True
            if student_batch_id is not None and student_batch_id in batch_ids:
                student["batch_id"] = ""
                student["batch_name"] = ""
                student["class"] = ""
                changed = True
            if changed:
                cur.execute(
                    "UPDATE students SET data_json = ? WHERE school_id = ? AND student_id = ?",
                    (json.dumps(student, ensure_ascii=False), school_id, sid),
                )
        if batch_ids:
            marks = ",".join(["?"] * len(batch_ids))
            cur.execute(
                f"DELETE FROM batch_timetables WHERE school_id = ? AND batch_id IN ({marks})",
                tuple([school_id] + batch_ids),
            )
            cur.execute(
                f"DELETE FROM batches WHERE school_id = ? AND id IN ({marks})",
                tuple([school_id] + batch_ids),
            )
        cur.execute("DELETE FROM levels WHERE school_id = ? AND id = ?", (school_id, level_id))
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"ok": False, "error": "Level not found"}), 404
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batches", methods=["GET"])
def api_batches_list():
    school_id = request.args.get("school_id") or get_school_id()
    assigned_teacher = (request.args.get("assigned_teacher") or "").strip()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                b.id,
                b.name,
                b.course_id,
                b.level_id,
                b.teacher_name,
                b.teacher_username,
                b.schedule,
                b.start_date,
                b.end_date,
                b.max_students,
                b.location,
                b.created_at,
                c.name AS course_name,
                l.name AS level_name
            FROM batches b
            JOIN courses c ON c.id = b.course_id
            JOIN levels l ON l.id = b.level_id
            WHERE b.school_id = ?
            ORDER BY b.start_date DESC, b.name COLLATE NOCASE
            """,
            (school_id,),
        )
        rows = [_row_to_dict(row) for row in cur.fetchall()]
        if assigned_teacher:
            rows = [r for r in rows if _batch_visible_to_teacher(conn, school_id, r, assigned_teacher)]
        students = load_school_data(conn, school_id)["students"]
        conn.close()
        counts = {}
        for student in students.values():
            batch_id = _optional_int(student.get("batch_id"), "batch_id")
            if batch_id is None:
                continue
            counts[batch_id] = counts.get(batch_id, 0) + 1
        for row in rows:
            row["students_count"] = counts.get(row["id"], 0)
        return jsonify({"ok": True, "batches": rows})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batches", methods=["POST"])
def api_batch_add():
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    payload = request.get_json() or {}
    try:
        conn = get_conn()
        data = _serialize_batch_payload(conn, school_id, payload)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO batches (school_id, name, course_id, level_id, teacher_name, teacher_username, schedule, start_date, end_date, max_students, location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                data["name"],
                data["course_id"],
                data["level_id"],
                data["teacher_name"],
                data["teacher_username"],
                data["schedule"],
                data["start_date"],
                data["end_date"],
                data["max_students"],
                data["location"],
            ),
        )
        batch_id = cur.lastrowid
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "id": batch_id})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "Batch name already exists"}), 400
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batches/<int:batch_id>", methods=["PUT"])
def api_batch_update(batch_id):
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    payload = request.get_json() or {}
    try:
        conn = get_conn()
        data = _serialize_batch_payload(conn, school_id, payload)
        assigned_students = _students_in_batch(conn, school_id, batch_id)
        if len(assigned_students) > data["max_students"]:
            conn.close()
            return jsonify({"ok": False, "error": "Max students is lower than currently assigned students"}), 400
        level = _fetch_level(conn, school_id, data["level_id"])
        for student in assigned_students:
            score = _student_score(student)
            if score is not None and not (int(level["min_score"]) <= score <= int(level["max_score"])):
                conn.close()
                return jsonify({"ok": False, "error": "Assigned students do not match the selected level score range"}), 400
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE batches
            SET name = ?, course_id = ?, level_id = ?, teacher_name = ?, teacher_username = ?, schedule = ?, start_date = ?, end_date = ?, max_students = ?, location = ?
            WHERE school_id = ? AND id = ?
            """,
            (
                data["name"],
                data["course_id"],
                data["level_id"],
                data["teacher_name"],
                data["teacher_username"],
                data["schedule"],
                data["start_date"],
                data["end_date"],
                data["max_students"],
                data["location"],
                school_id,
                batch_id,
            ),
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"ok": False, "error": "Batch not found"}), 404
        batch = _fetch_batch(conn, school_id, batch_id)
        cur.execute("SELECT student_id, data_json FROM students WHERE school_id = ?", (school_id,))
        for row in cur.fetchall():
            try:
                student = json.loads(row["data_json"] or "{}")
            except Exception:
                student = {}
            if _optional_int(student.get("batch_id"), "batch_id") == batch_id:
                student = _sync_student_academic_fields(conn, school_id, student, student_id=row["student_id"])
                cur.execute(
                    "UPDATE students SET data_json = ? WHERE school_id = ? AND student_id = ?",
                    (json.dumps(student, ensure_ascii=False), school_id, row["student_id"]),
                )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "id": batch_id, "batch": batch})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "Batch name already exists"}), 400
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batches/<int:batch_id>", methods=["DELETE"])
def api_batch_delete(batch_id):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT student_id, data_json FROM students WHERE school_id = ?", (school_id,))
        for row in cur.fetchall():
            try:
                student = json.loads(row["data_json"] or "{}")
            except Exception:
                student = {}
            sid = row["student_id"]
            student_batch_id = _optional_int(student.get("batch_id"), "batch_id")
            if student_batch_id != batch_id:
                continue
            student["batch_id"] = ""
            student["batch_name"] = ""
            student["class"] = ""
            cur.execute(
                "UPDATE students SET data_json = ? WHERE school_id = ? AND student_id = ?",
                (json.dumps(student, ensure_ascii=False), school_id, sid),
            )
        cur.execute("DELETE FROM batch_timetables WHERE school_id = ? AND batch_id = ?", (school_id, batch_id))
        cur.execute("DELETE FROM batches WHERE school_id = ? AND id = ?", (school_id, batch_id))
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"ok": False, "error": "Batch not found"}), 404
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batches/<int:batch_id>/students", methods=["GET"])
def api_batch_students(batch_id):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        batch = _fetch_batch(conn, school_id, batch_id)
        if not batch:
            conn.close()
            return jsonify({"ok": False, "error": "Batch not found"}), 404
        students = _students_in_batch(conn, school_id, batch_id)
        conn.close()
        students.sort(key=lambda x: (x.get("name") or x.get("student_name") or "").lower())
        return jsonify({"ok": True, "batch": batch, "students": students})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/attendance", methods=["GET"])
def api_attendance_get_session():
    school_id = request.args.get("school_id") or get_school_id()
    batch_id = request.args.get("batch_id")
    date_str = (request.args.get("date") or "").strip()
    assigned_teacher = (request.args.get("assigned_teacher") or "").strip()
    if not batch_id or not date_str:
        return jsonify({"ok": False, "error": "batch_id and date required"}), 400
    try:
        batch_id = int(batch_id)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid batch_id"}), 400
    try:
        conn = get_conn()
        batch = _fetch_batch(conn, school_id, batch_id)
        if not batch:
            conn.close()
            return jsonify({"ok": False, "error": "Batch not found"}), 404
        if assigned_teacher and not _batch_visible_to_teacher(conn, school_id, batch, assigned_teacher):
            conn.close()
            return jsonify({"ok": False, "error": "Not allowed for this batch"}), 403
        timetable_ok = _batch_has_timetable_on_date(conn, school_id, batch_id, date_str)
        tt_slots = _timetable_slots_for_date(conn, school_id, batch_id, date_str)
        locked = _attendance_session_locked(conn, school_id, batch_id, date_str)
        students = _students_in_batch(conn, school_id, batch_id)
        students.sort(key=lambda x: (x.get("name") or x.get("student_name") or "").lower())
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, student_id, status, remark, taken_by, updated_at
            FROM attendance
            WHERE school_id = ? AND batch_id = ? AND date = ?
            """,
            (school_id, batch_id, date_str),
        )
        by_sid = {}
        for r in cur.fetchall():
            by_sid[r["student_id"]] = _row_to_dict(r)
        sids = [s.get("student_id") for s in students if s.get("student_id")]
        recent_map = _attendance_recent_for_students(conn, school_id, batch_id, date_str, sids, 3)
        rows_out = []
        for s in students:
            sid = s.get("student_id")
            name = s.get("name") or s.get("student_name") or sid
            roll_disp = (
                (s.get("roll_no") or s.get("roll_number") or s.get("class_roll") or "")
                .strip()
            )
            name_myanmar = (
                s.get("name_myanmar")
                or s.get("myanmar_name")
                or s.get("name_mm")
                or s.get("burmese_name")
                or ""
            )
            name_myanmar = (name_myanmar if isinstance(name_myanmar, str) else str(name_myanmar or "")).strip()
            rec = by_sid.get(sid)
            rec_dict = rec or {}
            if rec:
                st = (rec_dict.get("status") or "present").strip().lower()
                if st not in ("present", "absent", "late"):
                    st = "present"
            else:
                # No saved row: UI must not show fake "present" or a recorded time.
                st = ""
            rows_out.append(
                {
                    "student_id": sid,
                    "name": name,
                    "roll_no": roll_disp,
                    "name_myanmar": name_myanmar,
                    "status": st,
                    "remark": (rec_dict.get("remark") if rec else "") or "",
                    "record_id": rec_dict.get("id") if rec else None,
                    "taken_by": (rec_dict.get("taken_by") if rec else "") or "",
                    "updated_at": rec_dict.get("updated_at") if rec else None,
                    "recent_statuses": recent_map.get(sid) if sid else [],
                }
            )
        summary = {"present": 0, "absent": 0, "late": 0}
        for r in rows_out:
            st = r["status"]
            if st in summary:
                summary[st] += 1
        primary_slot = tt_slots[0] if tt_slots else None
        cur.execute(
            """
            SELECT MAX(updated_at) AS mx FROM attendance
            WHERE school_id = ? AND batch_id = ? AND date = ?
            """,
            (school_id, batch_id, date_str),
        )
        mx_row = cur.fetchone()
        session_recorded_at = mx_row["mx"] if mx_row and mx_row["mx"] else None
        cur.execute(
            """
            SELECT locked_at, taken_by FROM attendance_session_lock
            WHERE school_id = ? AND batch_id = ? AND date = ?
            """,
            (school_id, batch_id, date_str),
        )
        lk = cur.fetchone()
        lock_meta = _row_to_dict(lk) if lk else None
        conn.close()
        return jsonify(
            {
                "ok": True,
                "batch": batch,
                "date": date_str,
                "timetable_ok": timetable_ok,
                "timetable_slots": tt_slots,
                "timetable_primary": primary_slot,
                "locked": locked,
                "session_recorded_at": session_recorded_at,
                "lock_meta": lock_meta,
                "students": rows_out,
                "summary": summary,
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/attendance/save", methods=["POST"])
def api_attendance_save():
    payload = request.get_json(silent=True) or {}
    school_id = payload.get("school_id") or get_school_id()
    assigned_teacher = (payload.get("assigned_teacher") or "").strip()
    batch_id = payload.get("batch_id")
    date_str = (payload.get("date") or "").strip()
    entries = payload.get("entries")
    taken_by = (payload.get("taken_by") or "").strip()
    require_timetable = bool(payload.get("require_timetable"))
    if batch_id is None or not date_str or not isinstance(entries, list):
        return jsonify({"ok": False, "error": "batch_id, date, and entries[] required"}), 400
    try:
        batch_id = int(batch_id)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid batch_id"}), 400
    try:
        if not assigned_teacher:
            return jsonify(
                {
                    "ok": False,
                    "error": "Only assigned teachers can save attendance. Use the teacher portal with your school username.",
                }
            ), 403
        conn = get_conn()
        batch = _fetch_batch(conn, school_id, batch_id)
        if not batch:
            conn.close()
            return jsonify({"ok": False, "error": "Batch not found"}), 404
        if not _batch_visible_to_teacher(conn, school_id, batch, assigned_teacher):
            conn.close()
            return jsonify({"ok": False, "error": "Not allowed for this batch"}), 403
        if _attendance_session_locked(conn, school_id, batch_id, date_str):
            conn.close()
            return jsonify(
                {
                    "ok": False,
                    "error": "Attendance is finalized for this date. Contact an administrator to unlock if a correction is needed.",
                }
            ), 409
        if require_timetable and not _batch_has_timetable_on_date(conn, school_id, batch_id, date_str):
            conn.close()
            return jsonify({"ok": False, "error": "No timetable entry for this day; attendance disabled."}), 400
        allowed_ids = {s["student_id"] for s in _students_in_batch(conn, school_id, batch_id)}
        cur = conn.cursor()
        applied = 0
        tb_save = (taken_by or assigned_teacher or "").strip()
        for e in entries:
            sid = (e.get("student_id") or "").strip()
            if not sid or sid not in allowed_ids:
                continue
            st = (e.get("status") or "present").strip().lower()
            if not _attendance_status_ok(st):
                st = "present"
            remark = (e.get("remark") or "").strip()
            cur.execute(
                """
                INSERT INTO attendance (school_id, student_id, batch_id, date, status, remark, taken_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(school_id, student_id, batch_id, date) DO UPDATE SET
                    status = excluded.status,
                    remark = excluded.remark,
                    taken_by = excluded.taken_by,
                    updated_at = datetime('now')
                """,
                (school_id, sid, batch_id, date_str, st, remark, tb_save),
            )
            applied += 1
        if applied > 0:
            _lock_attendance_session(conn, school_id, batch_id, date_str, tb_save)
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "finalized": applied > 0})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


def _batch_ids_for_teacher(conn, school_id, teacher_username):
    ids = []
    cur = conn.cursor()
    cur.execute(
        "SELECT id, teacher_username, teacher_name FROM batches WHERE school_id = ?",
        (school_id,),
    )
    for row in cur.fetchall():
        b = _row_to_dict(row)
        if _batch_visible_to_teacher(conn, school_id, b, teacher_username):
            ids.append(int(b["id"]))
    return ids


def _batch_title_parts(batch):
    """Human-readable batch header (matches teacher UI batch lines)."""
    if not batch:
        return "", ""
    name = (batch.get("name") or "").strip() or str(batch.get("id") or "")
    sched = (batch.get("schedule") or "").strip()
    course = (batch.get("course_name") or "").strip()
    title = f"{name} — {course}" if course else name
    if sched:
        title = f"{title} ({sched})"
    return name, title


@app.route("/api/attendance/teacher-students-summary", methods=["GET"])
def api_attendance_teacher_students_summary():
    """Per-batch student list with attendance rate and last 3 session statuses (teacher's batches only)."""
    school_id = request.args.get("school_id") or get_school_id()
    assigned_teacher = (request.args.get("assigned_teacher") or "").strip()
    if not assigned_teacher:
        return jsonify({"ok": False, "error": "assigned_teacher required"}), 400
    try:
        conn = get_conn()
        batch_ids = _batch_ids_for_teacher(conn, school_id, assigned_teacher)
        if not batch_ids:
            conn.close()
            return jsonify({"ok": True, "batches": [], "total_students": 0, "average_attendance": None})
        cur = conn.cursor()
        batches_out = []
        all_rates = []
        total_students = 0
        for bid in sorted(batch_ids):
            batch = _fetch_batch(conn, school_id, bid)
            if not batch:
                continue
            bname, btitle = _batch_title_parts(batch)
            title = btitle or bname or str(bid)
            students = _students_in_batch(conn, school_id, bid)
            students.sort(key=lambda x: (x.get("name") or x.get("student_name") or "").lower())
            sids = [s.get("student_id") for s in students if s.get("student_id")]
            by_sid = {sid: [] for sid in sids}
            if sids:
                ph = ",".join("?" * len(sids))
                cur.execute(
                    f"""
                    SELECT student_id, status, date
                    FROM attendance
                    WHERE school_id = ? AND batch_id = ? AND student_id IN ({ph})
                    ORDER BY student_id, date DESC
                    """,
                    [school_id, bid] + sids,
                )
                for row in cur.fetchall():
                    sid = row["student_id"]
                    if sid in by_sid:
                        by_sid[sid].append(((row["status"] or "").lower(), row["date"]))
            studs_out = []
            for s in students:
                sid = s.get("student_id")
                name = s.get("name") or s.get("student_name") or sid
                arr = by_sid.get(sid, [])
                total = len(arr)
                if total == 0:
                    rate = None
                    last3 = []
                else:
                    pres = sum(1 for st, _d in arr if st in ("present", "late"))
                    rate = round(pres * 100.0 / total, 1)
                    all_rates.append(rate)
                    st_only = [st for st, _d in arr[:3]]
                    last3 = list(reversed(st_only))
                studs_out.append(
                    {
                        "student_id": sid,
                        "name": name,
                        "attendance_rate": rate,
                        "last_3_statuses": last3,
                        "sessions_marked": total,
                    }
                )
                total_students += 1
            batches_out.append(
                {
                    "batch_id": bid,
                    "batch_name": bname,
                    "batch_title": title,
                    "students": studs_out,
                }
            )
        conn.close()
        avg_att = round(sum(all_rates) / len(all_rates), 1) if all_rates else None
        return jsonify({"ok": True, "batches": batches_out, "total_students": total_students, "average_attendance": avg_att})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/attendance/records", methods=["GET"])
def api_attendance_records():
    school_id = request.args.get("school_id") or get_school_id()
    batch_id_raw = (request.args.get("batch_id") or "").strip()
    date_from = (request.args.get("from") or "").strip()
    date_to = (request.args.get("to") or "").strip()
    assigned_teacher = (request.args.get("assigned_teacher") or "").strip()
    teacher_username = (request.args.get("teacher_username") or "").strip()
    status_filter = (request.args.get("status_filter") or "all").strip().lower()
    batch_id = None
    if batch_id_raw:
        try:
            batch_id = int(batch_id_raw)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "Invalid batch_id"}), 400
    try:
        conn = get_conn()
        cur = conn.cursor()
        if batch_id is not None:
            batch_row = _fetch_batch(conn, school_id, batch_id)
            if not batch_row:
                conn.close()
                return jsonify({"ok": False, "error": "Batch not found"}), 404
            if assigned_teacher and not _batch_visible_to_teacher(conn, school_id, batch_row, assigned_teacher):
                conn.close()
                return jsonify({"ok": False, "error": "Not allowed for this batch"}), 403

        batch_filter_ids = None
        if batch_id is not None:
            batch_filter_ids = [batch_id]
        elif assigned_teacher:
            batch_filter_ids = _batch_ids_for_teacher(conn, school_id, assigned_teacher)
            if not batch_filter_ids:
                conn.close()
                return jsonify({"ok": True, "batch": None, "days": []})
        sql = """
            SELECT a.date,
                a.batch_id,
                b.name AS batch_name,
                b.teacher_username,
                b.teacher_name,
                SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
                COUNT(*) AS total,
                MAX(CASE WHEN lk.batch_id IS NOT NULL THEN 1 ELSE 0 END) AS locked
            FROM attendance a
            JOIN batches b ON b.school_id = a.school_id AND b.id = a.batch_id
            LEFT JOIN attendance_session_lock lk
              ON lk.school_id = a.school_id AND lk.batch_id = a.batch_id AND lk.date = a.date
            WHERE a.school_id = ?
        """
        params = [school_id]
        if batch_filter_ids is not None:
            placeholders = ",".join("?" * len(batch_filter_ids))
            sql += f" AND a.batch_id IN ({placeholders})"
            params.extend(batch_filter_ids)
        if teacher_username:
            sql += " AND TRIM(COALESCE(b.teacher_username, '')) = ?"
            params.append(teacher_username)
        if date_from:
            sql += " AND a.date >= ?"
            params.append(date_from)
        if date_to:
            sql += " AND a.date <= ?"
            params.append(date_to)
        sql += " GROUP BY a.date, a.batch_id"
        if status_filter == "has_absent":
            sql += " HAVING SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) > 0"
        elif status_filter == "has_late":
            sql += " HAVING SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) > 0"
        sql += " ORDER BY a.date DESC, batch_name COLLATE NOCASE"
        cur.execute(sql, tuple(params))
        days = []
        for row in cur.fetchall():
            p = int(row["present"] or 0)
            al = int(row["absent"] or 0)
            lt = int(row["late"] or 0)
            tot = int(row["total"] or 0)
            rate = round((p + lt) * 100.0 / tot, 1) if tot else 0.0
            bid = int(row["batch_id"])
            subj = _primary_subject_for_batch_date(conn, school_id, bid, row["date"])
            days.append(
                {
                    "date": row["date"],
                    "batch_id": bid,
                    "batch_name": row["batch_name"],
                    "subject": subj,
                    "teacher_username": (row["teacher_username"] or "").strip(),
                    "teacher_name": (row["teacher_name"] or "").strip(),
                    "present": p,
                    "absent": al,
                    "late": lt,
                    "total": tot,
                    "rate": rate,
                    "locked": bool(row["locked"]),
                }
            )
        out_batch = None
        if batch_id is not None:
            out_batch = _fetch_batch(conn, school_id, batch_id)
        conn.close()
        return jsonify({"ok": True, "batch": out_batch, "days": days})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/attendance/today-overview", methods=["GET"])
def api_attendance_today_overview():
    school_id = request.args.get("school_id") or get_school_id()
    date_str = (request.args.get("date") or "").strip()[:10] or date.today().isoformat()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT a.batch_id,
                b.name AS batch_name,
                b.teacher_username,
                b.teacher_name,
                SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
                COUNT(*) AS total
            FROM attendance a
            JOIN batches b ON b.school_id = a.school_id AND b.id = a.batch_id
            WHERE a.school_id = ? AND a.date = ?
            GROUP BY a.batch_id
            ORDER BY batch_name COLLATE NOCASE
            """,
            (school_id, date_str),
        )
        rows = []
        for row in cur.fetchall():
            rows.append(
                {
                    "batch_id": int(row["batch_id"]),
                    "batch_name": row["batch_name"],
                    "teacher_username": (row["teacher_username"] or "").strip(),
                    "teacher_name": (row["teacher_name"] or "").strip(),
                    "present": int(row["present"] or 0),
                    "absent": int(row["absent"] or 0),
                    "late": int(row["late"] or 0),
                    "total": int(row["total"] or 0),
                }
            )
        conn.close()
        return jsonify({"ok": True, "date": date_str, "rows": rows})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/attendance/session-lock", methods=["POST", "DELETE"])
def api_attendance_session_lock():
    """POST: admin lock session. DELETE: unlock so teacher can resave."""
    if request.method == "DELETE":
        school_id = (request.args.get("school_id") or get_school_id()).strip()
        batch_id = request.args.get("batch_id")
        date_str = (request.args.get("date") or "").strip()[:10]
        try:
            batch_id = int(batch_id)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "batch_id and date required"}), 400
        if not date_str:
            return jsonify({"ok": False, "error": "batch_id and date required"}), 400
        try:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                DELETE FROM attendance_session_lock
                WHERE school_id = ? AND batch_id = ? AND date = ?
                """,
                (school_id, batch_id, date_str),
            )
            conn.commit()
            conn.close()
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500

    payload = request.get_json(silent=True) or {}
    school_id = payload.get("school_id") or get_school_id()
    batch_id = payload.get("batch_id")
    date_str = (payload.get("date") or "").strip()[:10]
    taken_by = (payload.get("taken_by") or "admin").strip() or "admin"
    try:
        batch_id = int(batch_id)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "batch_id and date required"}), 400
    if not date_str:
        return jsonify({"ok": False, "error": "batch_id and date required"}), 400
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*) AS n FROM attendance
            WHERE school_id = ? AND batch_id = ? AND date = ?
            """,
            (school_id, batch_id, date_str),
        )
        n = int(cur.fetchone()["n"] or 0)
        if n == 0:
            conn.close()
            return jsonify({"ok": False, "error": "No attendance rows for this batch and date; nothing to lock."}), 400
        _lock_attendance_session(conn, school_id, batch_id, date_str, taken_by)
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


def _trend_emojis(status_list, max_icons=5):
    icons = []
    m = {"present": "🟢", "absent": "🔴", "late": "🟡"}
    for st in status_list[:max_icons]:
        icons.append(m.get((st or "").lower(), "⬜"))
    return "".join(icons)


@app.route("/api/attendance/student-report", methods=["GET"])
def api_attendance_student_report():
    school_id = request.args.get("school_id") or get_school_id()
    student_id = (request.args.get("student_id") or "").strip()
    date_from = (request.args.get("from") or "").strip()
    date_to = (request.args.get("to") or "").strip()
    focus_batch = (request.args.get("batch_id") or "").strip()
    if not student_id:
        return jsonify({"ok": False, "error": "student_id required"}), 400
    focus_batch_id = None
    if focus_batch:
        try:
            focus_batch_id = int(focus_batch)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "Invalid batch_id"}), 400
    try:
        conn = get_conn()
        cur = conn.cursor()
        sql = """
            SELECT a.status, a.batch_id, a.date, a.remark, b.name AS batch_name
            FROM attendance a
            JOIN batches b ON b.school_id = a.school_id AND b.id = a.batch_id
            WHERE a.school_id = ? AND a.student_id = ?
        """
        params = [school_id, student_id]
        if date_from:
            sql += " AND a.date >= ?"
            params.append(date_from)
        if date_to:
            sql += " AND a.date <= ?"
            params.append(date_to)
        if focus_batch_id is not None:
            sql += " AND a.batch_id = ?"
            params.append(focus_batch_id)
        sql += " ORDER BY a.date DESC, a.batch_id"
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        present = absent = late = 0
        keys = set()
        by_batch = {}
        logs = []
        for row in rows:
            bid = int(row["batch_id"])
            st = (row["status"] or "").lower()
            if st == "present":
                present += 1
            elif st == "absent":
                absent += 1
            elif st == "late":
                late += 1
            keys.add((bid, row["date"]))
            bname = row["batch_name"] or ""
            if bid not in by_batch:
                by_batch[bid] = {
                    "batch_id": bid,
                    "batch_name": bname,
                    "present": 0,
                    "absent": 0,
                    "late": 0,
                    "_chronological": [],
                }
            bb = by_batch[bid]
            if st == "present":
                bb["present"] += 1
            elif st == "absent":
                bb["absent"] += 1
            elif st == "late":
                bb["late"] += 1
            bb["_chronological"].append(st)
            logs.append(
                {
                    "date": row["date"],
                    "batch_id": bid,
                    "batch_name": bname,
                    "status": st,
                    "remark": (row["remark"] or "").strip(),
                }
            )
        by_batch_list = []
        for bid, bb in sorted(by_batch.items(), key=lambda x: (x[1]["batch_name"] or "").lower()):
            tot = bb["present"] + bb["absent"] + bb["late"]
            rate = round((bb["present"] + bb["late"]) * 100.0 / tot, 1) if tot else 0.0
            chron = list(reversed(bb["_chronological"]))
            by_batch_list.append(
                {
                    "batch_id": bb["batch_id"],
                    "batch_name": bb["batch_name"],
                    "present": bb["present"],
                    "absent": bb["absent"],
                    "late": bb["late"],
                    "total": tot,
                    "rate": rate,
                    "trend": _trend_emojis(chron[-5:]),
                }
            )
        total = present + absent + late
        denom = total if total else 0
        pct = round((present + late) * 100.0 / denom, 1) if denom else 0.0
        cur.execute("SELECT data_json FROM students WHERE school_id = ? AND student_id = ?", (school_id, student_id))
        r = cur.fetchone()
        student = {}
        if r:
            try:
                student = json.loads(r["data_json"] or "{}")
            except Exception:
                student = {}
        conn.close()
        return jsonify(
            {
                "ok": True,
                "student_id": student_id,
                "name": student.get("name") or student.get("student_name") or student_id,
                "batch_id": student.get("batch_id"),
                "total_records": total,
                "distinct_sessions": len(keys),
                "present": present,
                "absent": absent,
                "late": late,
                "attendance_percentage": pct,
                "by_batch": by_batch_list,
                "logs": logs,
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batch-timetables", methods=["GET"])
def api_batch_timetables_list():
    school_id = request.args.get("school_id") or get_school_id()
    batch_id = request.args.get("batch_id")
    try:
        conn = get_conn()
        cur = conn.cursor()
        params = [school_id]
        where_sql = "WHERE t.school_id = ?"
        if batch_id is not None and str(batch_id).strip() != "":
            where_sql += " AND t.batch_id = ?"
            params.append(int(batch_id))
        cur.execute(
            f"""
            SELECT
                t.id,
                t.batch_id,
                t.day,
                t.time,
                t.subject,
                t.teacher_name,
                t.room_location AS location,
                t.created_at,
                b.name AS batch_name,
                c.name AS course_name,
                l.name AS level_name
            FROM batch_timetables t
            JOIN batches b ON b.id = t.batch_id
            JOIN courses c ON c.id = b.course_id
            JOIN levels l ON l.id = b.level_id
            {where_sql}
            ORDER BY b.name COLLATE NOCASE, t.day COLLATE NOCASE, t.time COLLATE NOCASE, t.subject COLLATE NOCASE
            """,
            tuple(params),
        )
        rows = [_row_to_dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({"ok": True, "timetables": rows})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batch-timetables", methods=["POST"])
def api_batch_timetable_add():
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    payload = request.get_json() or {}
    try:
        conn = get_conn()
        data = _serialize_batch_timetable_payload(conn, school_id, payload)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO batch_timetables (school_id, batch_id, day, time, subject, teacher_name, room_location)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                data["batch_id"],
                data["day"],
                data["time"],
                data["subject"],
                data["teacher_name"],
                data["room_location"],
            ),
        )
        timetable_id = cur.lastrowid
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "id": timetable_id})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "This timetable slot already exists"}), 400
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batch-timetables/<int:timetable_id>", methods=["PUT"])
def api_batch_timetable_update(timetable_id):
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    payload = request.get_json() or {}
    try:
        conn = get_conn()
        data = _serialize_batch_timetable_payload(conn, school_id, payload)
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE batch_timetables
            SET batch_id = ?, day = ?, time = ?, subject = ?, teacher_name = ?, room_location = ?
            WHERE school_id = ? AND id = ?
            """,
            (
                data["batch_id"],
                data["day"],
                data["time"],
                data["subject"],
                data["teacher_name"],
                data["room_location"],
                school_id,
                timetable_id,
            ),
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"ok": False, "error": "Timetable not found"}), 404
        conn.commit()
        row = _fetch_batch_timetable(conn, school_id, timetable_id)
        conn.close()
        return jsonify({"ok": True, "id": timetable_id, "timetable": row})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "This timetable slot already exists"}), 400
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/batch-timetables/<int:timetable_id>", methods=["DELETE"])
def api_batch_timetable_delete(timetable_id):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM batch_timetables WHERE school_id = ? AND id = ?", (school_id, timetable_id))
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"ok": False, "error": "Timetable not found"}), 404
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/classes", methods=["GET"])
def api_classes():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        conn.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    grades_config = data["grades_config"] or {}
    classes = []
    for grade_name, num_rooms in grades_config.items():
        try:
            n = int(num_rooms) if isinstance(num_rooms, (int, float)) else 1
        except (TypeError, ValueError):
            n = 1
        prefix = "KG" if (grade_name or "").strip().upper() == "KG" else (grade_name or "").strip()[:2].upper()
        if len((grade_name or "").strip()) >= 2:
            prefix = (grade_name or "").strip()[:2].upper()
        for i in range(n):
            cls = f"{prefix}-{chr(65 + i)}"
            count = sum(1 for s in data["students"].values() if (s.get("class") or "").strip() == cls)
            classes.append({"grade": grade_name, "class": cls, "count": count})
    return jsonify({"ok": True, "classes": classes, "grades_config": grades_config})


# Standard designations for teachers
TEACHER_DESIGNATIONS = [
    {"id": "principal", "label_en": "Principal", "label_mm": ""},
    {"id": "vice_principal", "label_en": "Vice Principal", "label_mm": "-"},
    {"id": "head_of_dept", "label_en": "Head of Department", "label_mm": ""},
    {"id": "senior_teacher", "label_en": "Senior Teacher", "label_mm": ""},
    {"id": "junior_teacher", "label_en": "Junior Teacher", "label_mm": "/"},
    {"id": "guest_teacher", "label_en": "Guest Teacher", "label_mm": ""},
]


@app.route("/api/designations", methods=["GET"])
def api_designations():
    return jsonify({"ok": True, "designations": TEACHER_DESIGNATIONS})


@app.route("/api/teachers", methods=["GET"])
def api_teachers():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        conn.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    users = data["users"] or {}
    # Include both role "class" (legacy) and "teacher"
    teachers = [{"username": k, **(v or {})} for k, v in users.items() if (v or {}).get("role") in ("class", "teacher")]
    return jsonify({"ok": True, "teachers": teachers})


@app.route("/api/teachers/<username>", methods=["GET"])
def api_teacher_get(username):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        conn.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    users = data["users"] or {}
    if username not in users:
        return jsonify({"ok": False, "error": "Teacher not found"}), 404
    u = users[username]
    if (u or {}).get("role") not in ("class", "teacher"):
        return jsonify({"ok": False, "error": "Not a teacher"}), 404
    return jsonify({"ok": True, "teacher": {"username": username, **(u or {})}})


@app.route("/api/teachers", methods=["POST"])
def api_teacher_add():
    body = request.get_json() or {}
    school_id = body.get("school_id") or get_school_id()
    username = (body.get("username") or "").strip() or (body.get("name") or "").strip().replace(" ", "_")[:50]
    if not username:
        return jsonify({"ok": False, "error": "Username or name required"}), 400
    # Build data_json: role=teacher + personal, contact, professional, etc.
    data = {
        "role": "teacher",
        "teacher_id": body.get("teacher_id") or username,
        "name": body.get("name") or username,
        "date_of_birth": body.get("date_of_birth") or body.get("dob") or "",
        "dob": body.get("dob") or "",
        "age": body.get("age") or "",
        "gender": body.get("gender") or "",
        "blood_group": body.get("blood_group") or body.get("blood_type") or "",
        "blood_type": body.get("blood_type") or "",
        "nrc": body.get("nrc") or "",
        "ethnicity": body.get("ethnicity") or "",
        "religion": body.get("religion") or "",
        "address": body.get("address") or "",
        "phone": body.get("phone") or "",
        "email": body.get("email") or "",
        "course": body.get("course") or "",
        "level": body.get("level") or "",
        "batch": body.get("batch") or "",
        "joining_date": body.get("joining_date") or "",
        "department": body.get("department") or "",
        "position": body.get("position") or "",
        "salary": body.get("salary") or "",
        "degree": body.get("degree") or "",
        "university": body.get("university") or "",
        "year_obtained": body.get("year_obtained") or "",
        "certificates_diplomas": body.get("certificates_diplomas") or "",
        "completion_date": body.get("completion_date") or "",
        "specialized_subject": body.get("specialized_subject") or [],
        "assigned_classes": body.get("assigned_classes") or [],
        "weekly_hours": body.get("weekly_hours") or "",
        "qualification": body.get("qualification") or "",
        "experience": body.get("experience") or "",
        "designation": body.get("designation") or "junior_teacher",
        "photo_note": body.get("photo_note") or "",
        "photo_data": body.get("photo_data") or "",
        "documents_note": body.get("documents_note") or "",
        "status": body.get("status") or "Active",
        "class": body.get("assigned_class") or body.get("class") or "",
        "assigned_subject": body.get("assigned_subject") or "",
        "timetable": body.get("timetable") or [],
        "permissions": body.get("permissions") or {},
        # Login: /api/login expects this; default = teacher ID (same as username when created from admin UI)
        "password": (body.get("password") or body.get("teacher_id") or username or "").strip(),
    }
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM school_users WHERE school_id = ? AND username = ?", (school_id, username))
        if cur.fetchone():
            conn.close()
            return jsonify({"ok": False, "error": "Username already exists"}), 400
        cur.execute("INSERT INTO school_users (school_id, username, data_json) VALUES (?, ?, ?)",
                    (school_id, username, json.dumps(data, ensure_ascii=False)))
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "username": username})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/teachers/<username>", methods=["PUT"])
def api_teacher_update(username):
    body = request.get_json() or {}
    school_id = body.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        if username not in (data["users"] or {}):
            conn.close()
            return jsonify({"ok": False, "error": "Teacher not found"}), 404
        existing = (data["users"] or {}).get(username) or {}
        if existing.get("role") not in ("class", "teacher"):
            conn.close()
            return jsonify({"ok": False, "error": "Not a teacher"}), 400
        merged = {**existing, "role": existing.get("role") or "teacher"}
        for key in ("name", "date_of_birth", "dob", "age", "gender", "nrc", "blood_group", "blood_type", "phone", "email", "address",
                    "course", "level", "batch",
                    "joining_date", "qualification", "experience", "designation", "photo_note", "documents_note",
                    "status", "timetable", "permissions", "teacher_id", "ethnicity", "religion", "department",
                    "position", "salary", "degree", "university", "year_obtained", "certificates_diplomas",
                    "completion_date", "weekly_hours", "photo_data"):
            if key in body:
                merged[key] = body[key]
        if "assigned_class" in body or "class" in body:
            merged["class"] = body.get("assigned_class") or body.get("class") or ""
        if "assigned_subject" in body:
            merged["assigned_subject"] = body["assigned_subject"]
        if "specialized_subject" in body:
            merged["specialized_subject"] = body["specialized_subject"] if isinstance(body["specialized_subject"], list) else []
        if "assigned_classes" in body:
            merged["assigned_classes"] = body["assigned_classes"] if isinstance(body["assigned_classes"], list) else []
        cur = conn.cursor()
        cur.execute("UPDATE school_users SET data_json = ? WHERE school_id = ? AND username = ?",
                    (json.dumps(merged, ensure_ascii=False), school_id, username))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/teachers/<username>", methods=["DELETE"])
def api_teacher_delete(username):
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM school_users WHERE school_id = ? AND username = ?", (school_id, username))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/exams", methods=["GET"])
def api_exams():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        conn.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": True, "exams": data["exams"] or [], "exam_category": data["exam_category"] or {}, "exams_by_grade": data["exams_by_grade"] or {}})


@app.route("/api/subjects", methods=["GET"])
def api_subjects():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        conn.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": True, "subjects": data["subjects"] or [], "subjects_by_class": data["subjects_by_class"] or {}})


@app.route("/api/grades_config", methods=["GET"])
def api_grades_config():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        data = load_school_data(conn, school_id)
        conn.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": True, "grades_config": data["grades_config"] or {}})


@app.route("/api/grades_config", methods=["POST"])
def api_grades_config_save():
    school_id = (request.get_json() or {}).get("school_id") or get_school_id()
    grades_config = (request.get_json() or {}).get("grades_config")
    if grades_config is None:
        return jsonify({"ok": False, "error": "grades_config required"}), 400
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO grades_config (school_id, data_json) VALUES (?, ?)", (school_id, json.dumps(grades_config, ensure_ascii=False)))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


_BACKUP_TABLES = (
    "schools", "app_config", "students", "exams", "grades_config", "exams_by_grade",
    "exam_sections", "school_users", "web_extra", "subjects", "courses", "levels",
    "batches", "batch_timetables", "attendance", "attendance_session_lock",
)


@app.route("/api/backup", methods=["POST"])
def api_backup():
    try:
        data_dir = get_data_dir()
        backup_dir = os.path.join(data_dir, "backups")
        os.makedirs(backup_dir, exist_ok=True)
        conn = get_conn()
        cur = conn.cursor()
        export = {
            "format": "mnea_mysql_json_v1",
            "exported_at": datetime.now().isoformat(),
            "mysql_database": (os.environ.get("MYSQL_DATABASE") or "").strip(),
            "tables": {},
        }
        for table in _BACKUP_TABLES:
            cur.execute(f"SELECT * FROM {table}")
            export["tables"][table] = [dict(row) for row in cur.fetchall()]
        conn.close()
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"ems_web_{ts}.json"
        dest = os.path.join(backup_dir, filename)
        with open(dest, "w", encoding="utf-8") as f:
            json.dump(export, f, ensure_ascii=False, indent=2, default=str)
        return jsonify({"ok": True, "path": dest, "filename": filename})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/restore", methods=["POST"])
def api_restore():
    f = request.files.get("file")
    if not f:
        return jsonify({"ok": False, "error": "No file"}), 400
    if not f.filename or not f.filename.lower().endswith(".json"):
        return jsonify({
            "ok": False,
            "error": "Upload a .json backup from /api/backup. SQLite .db restore is no longer supported.",
        }), 400
    try:
        payload = json.loads(f.read().decode("utf-8"))
        if payload.get("format") != "mnea_mysql_json_v1":
            return jsonify({"ok": False, "error": "Invalid backup format"}), 400
        conn = get_conn()
        cur = conn.cursor()
        for table, rows in (payload.get("tables") or {}).items():
            if table not in _BACKUP_TABLES or not isinstance(rows, list):
                continue
            cur.execute(f"DELETE FROM {table}")
            if not rows:
                continue
            cols = list(rows[0].keys())
            placeholders = ", ".join(["?"] * len(cols))
            col_sql = ", ".join(f"`{c}`" if c == "key" else c for c in cols)
            for row in rows:
                cur.execute(
                    f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders})",
                    tuple(row.get(c) for c in cols),
                )
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/email-config/status", methods=["GET"])
def api_email_config_status():
    """Report whether outbound SMTP is configured (environment variables only)."""
    smtp_host = (os.environ.get("SMTP_HOST") or "").strip()
    smtp_user = (os.environ.get("SMTP_USER") or "").strip()
    smtp_pass = os.environ.get("SMTP_PASS") or ""
    smtp_from = (os.environ.get("SMTP_FROM") or smtp_user or "").strip()
    try:
        smtp_port = int(os.environ.get("SMTP_PORT") or 587)
    except ValueError:
        smtp_port = 587
    use_tls = str(os.environ.get("SMTP_USE_TLS") or "1").strip().lower() not in ("0", "false", "no")
    return jsonify({
        "ok": True,
        "configured": bool(smtp_host),
        "smtp_port": smtp_port,
        "use_tls": use_tls,
        "has_user": bool(smtp_user),
        "has_password": bool(smtp_pass),
        "from_configured": bool(smtp_from),
    })


@app.route("/api/email-config/test", methods=["POST"])
def api_email_config_test():
    """Send a simple test message using the same SMTP_* environment variables as placement emails."""
    body = request.get_json() or {}
    to_email = (body.get("to") or "").strip()
    if not to_email:
        return jsonify({"ok": False, "error": "to required"}), 400
    smtp_host = (os.environ.get("SMTP_HOST") or "").strip()
    try:
        smtp_port = int(os.environ.get("SMTP_PORT") or 587)
    except ValueError:
        smtp_port = 587
    smtp_user = (os.environ.get("SMTP_USER") or "").strip()
    smtp_pass = os.environ.get("SMTP_PASS") or ""
    smtp_from = (os.environ.get("SMTP_FROM") or smtp_user or "no-reply@localhost").strip()
    use_tls = str(os.environ.get("SMTP_USE_TLS") or "1").strip().lower() not in ("0", "false", "no")
    if not smtp_host:
        return jsonify({"ok": False, "error": "SMTP_HOST is not configured"}), 400
    subject = "Test email — Myanmar New Era"
    body_text = (
        "This is a test message from the school management server.\n\n"
        "If you received this, SMTP_HOST / SMTP_USER / SMTP_PASS (and TLS) are working."
    )
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg.set_content(body_text)
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            if use_tls:
                server.starttls()
            if smtp_user:
                server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        return jsonify({"ok": True, "message": "Test email sent."})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/settings", methods=["GET"])
def api_settings_get():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM app_config")
        cfg = {row["key"]: row["value"] for row in cur.fetchall()}
        cur.execute(
            "SELECT id, name, primary_color, bg_color, sidebar_bg, logo FROM schools WHERE id = ?",
            (school_id,),
        )
        row = cur.fetchone()
        if not row:
            cur.execute("SELECT id, name, primary_color, bg_color, sidebar_bg, logo FROM schools LIMIT 1")
            row = cur.fetchone()
        conn.close()
        if row:
            cfg["school_id"] = row["id"]
            cfg["school_name"] = row["name"]
            cfg["primary_color"] = row["primary_color"] or "#27ae60"
            cfg["school_logo"] = (row["logo"] or "").strip()
        return jsonify({"ok": True, "config": cfg})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/settings", methods=["POST"])
def api_settings_save():
    data = request.get_json() or {}
    try:
        conn = get_conn()
        cur = conn.cursor()
        school_id = get_school_id()
        for k, v in data.items():
            if k in ("school_id", "ok", "config"):
                continue
            if k == "school_name":
                cur.execute("UPDATE schools SET name = ? WHERE id = ?", (v, school_id))
            elif k in ("school_logo", "logo"):
                cur.execute("UPDATE schools SET logo = ? WHERE id = ?", ((v or "").strip() if isinstance(v, str) else "", school_id))
            elif k == "primary_color":
                cur.execute("UPDATE schools SET primary_color = ? WHERE id = ?", (v, school_id))
            elif k == "bg_color":
                cur.execute("UPDATE schools SET bg_color = ? WHERE id = ?", (v, school_id))
            elif k == "sidebar_bg":
                cur.execute("UPDATE schools SET sidebar_bg = ? WHERE id = ?", (v, school_id))
            else:
                cur.execute("INSERT OR REPLACE INTO app_config (`key`, value) VALUES (?, ?)", (k, v if isinstance(v, str) else json.dumps(v)))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


_WEB_EXTRA_KEYS = ("notices", "contact_inquiries", "attendance", "parents", "staff", "fees", "teacher_attendance", "teacher_payroll",
                   "teacher_schedule", "teacher_leave", "staff_attendance", "staff_leave", "staff_payroll",
                   "teacher_recruitment", "staff_recruitment", "lesson_plans", "academic_calendar",
                   "attendance_entries", "attendance_sms_log",
                   "exam_schedule", "exam_online", "question_bank", "exam_marks", "exam_results", "marksheet_design",
                   "gpa_transcript_records",
                   "promotion_rules", "promotion_actions", "graduation_records",
                   "fee_structure", "fee_types", "fee_concessions", "fee_payments", "fee_sms_log",
                   "reports_custom", "reports_import_log", "reports_export_log",
                   "comm_sms_log", "comm_email_log",
                   "system_users", "system_role_permissions", "system_audit_log", "system_profiles",
                   "class_list", "sections", "subject_allocation",
                   "class_teacher_assign", "timetable", "syllabus", "student_documents", "teacher_documents",
                   "admission_applications", "placement_test_results", "placement_test_audio", "placement_test_attempts", "placement_question_bank",
                   "level_assignments", "accepted_students", "student_activity_log",
                   "teacher_materials", "teacher_profiles",
                   "student_assignments", "student_leave_requests", "student_profiles",
                   "site_content_bundle")

_SITE_VISIT_DAILY_KEY = "site_visit_daily"
_SITE_VISIT_JSON_PATH = os.path.join(_BASE_DIR, "data", "site_visit_stats.json")
_site_visit_file_lock = threading.Lock()


def _mysql_configured():
    return bool((os.environ.get("MYSQL_DATABASE") or "").strip())


def _normalize_site_visit_stats(parsed):
    stats = {"by_date": {}}
    if not isinstance(parsed, dict):
        return stats
    by_date = parsed.get("by_date")
    if not isinstance(by_date, dict):
        return stats
    cleaned = {}
    for k, v in by_date.items():
        key = str(k).strip()
        if not key:
            continue
        try:
            cleaned[key] = int(v)
        except (TypeError, ValueError):
            continue
    stats["by_date"] = cleaned
    return stats


def _load_site_visit_stats_mysql(cur, school_id):
    stats = {"by_date": {}}
    try:
        cur.execute(
            "SELECT data_json FROM web_extra WHERE school_id = ? AND data_key = ?",
            (school_id, _SITE_VISIT_DAILY_KEY),
        )
        row = cur.fetchone()
        if row and row["data_json"]:
            stats = _normalize_site_visit_stats(json.loads(row["data_json"]))
    except Exception:
        pass
    return stats


def _save_site_visit_stats_mysql(cur, school_id, stats):
    cur.execute(
        "INSERT OR REPLACE INTO web_extra (school_id, data_key, data_json) VALUES (?, ?, ?)",
        (school_id, _SITE_VISIT_DAILY_KEY, json.dumps(stats, ensure_ascii=False)),
    )


def _load_site_visit_stats_json():
    with _site_visit_file_lock:
        if not os.path.isfile(_SITE_VISIT_JSON_PATH):
            return {"by_date": {}}
        try:
            with open(_SITE_VISIT_JSON_PATH, "r", encoding="utf-8") as f:
                return _normalize_site_visit_stats(json.load(f))
        except Exception:
            return {"by_date": {}}


def _save_site_visit_stats_json(stats):
    data_dir = os.path.dirname(_SITE_VISIT_JSON_PATH)
    os.makedirs(data_dir, exist_ok=True)
    tmp_path = _SITE_VISIT_JSON_PATH + ".tmp"
    with _site_visit_file_lock:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, _SITE_VISIT_JSON_PATH)


def _load_site_visit_stats_data(school_id):
    if _mysql_configured():
        conn = get_conn()
        cur = conn.cursor()
        stats = _load_site_visit_stats_mysql(cur, school_id)
        conn.close()
        return stats
    return _load_site_visit_stats_json()


def _save_site_visit_stats_data(school_id, stats):
    if _mysql_configured():
        conn = get_conn()
        cur = conn.cursor()
        _save_site_visit_stats_mysql(cur, school_id, stats)
        conn.commit()
        conn.close()
        return
    _save_site_visit_stats_json(stats)


def _prune_site_visit_stats(stats, keep_days=90):
    by_date = stats.get("by_date") or {}
    if not isinstance(by_date, dict):
        by_date = {}
    cutoff = (date.today() - timedelta(days=keep_days)).isoformat()
    stats["by_date"] = {k: int(v) for k, v in by_date.items() if str(k) >= cutoff}
    return stats


def _site_visit_today_count(stats):
    by_date = stats.get("by_date") or {}
    return int(by_date.get(date.today().isoformat(), 0))


@app.route("/api/site/visits/today", methods=["GET"])
def api_site_visits_today():
    school_id = request.args.get("school_id") or get_school_id()
    try:
        stats = _load_site_visit_stats_data(school_id)
        return jsonify({"ok": True, "today": _site_visit_today_count(stats), "date": date.today().isoformat()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/site/visits/hit", methods=["POST"])
def api_site_visits_hit():
    school_id = get_school_id()
    try:
        stats = _load_site_visit_stats_data(school_id)
        today_key = date.today().isoformat()
        by_date = stats.setdefault("by_date", {})
        by_date[today_key] = int(by_date.get(today_key, 0)) + 1
        stats = _prune_site_visit_stats(stats)
        _save_site_visit_stats_data(school_id, stats)
        return jsonify({"ok": True, "today": _site_visit_today_count(stats), "date": today_key})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/web_extra/<key>", methods=["GET"])
def api_web_extra_get(key):
    if key not in _WEB_EXTRA_KEYS:
        return jsonify({"ok": False, "error": "Invalid key"}), 400
    school_id = request.args.get("school_id") or get_school_id()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT data_json FROM web_extra WHERE school_id = ? AND data_key = ?", (school_id, key))
        row = cur.fetchone()
        conn.close()
        data = []
        if row and row["data_json"]:
            try:
                data = json.loads(row["data_json"])
            except Exception:
                data = []
        if not isinstance(data, list):
            data = [data] if data else []
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/web_extra/<key>", methods=["POST"])
def api_web_extra_save(key):
    if key not in _WEB_EXTRA_KEYS:
        return jsonify({"ok": False, "error": "Invalid key"}), 400
    body = request.get_json() or {}
    school_id = body.get("school_id") or get_school_id()
    data = body.get("data")
    if data is None:
        return jsonify({"ok": False, "error": "data required"}), 400
    if not isinstance(data, list):
        data = [data]
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO web_extra (school_id, data_key, data_json) VALUES (?, ?, ?)",
                    (school_id, key, json.dumps(data, ensure_ascii=False)))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


def _ensure_db_and_school():
    """Create MySQL schema and default school on startup so first login works."""
    try:
        conn = get_conn()
        conn.close()
        db_label = get_db_path()
        print("[EGMS] MySQL database:", db_label)
    except Exception as e:
        import traceback
        print("[_ensure_db_and_school] Error:", e)
        traceback.print_exc()


def _print_startup_health():
    """Lightweight startup checks for key web routes/assets."""
    checks = [
        ("/", "public-page/index.html"),
        ("/public-page/index.html", "public-page/index.html"),
        ("/admin/dashboard.html", "admin/dashboard.html"),
        ("/public-page/placement-test.html", "public-page/placement-test.html"),
        ("/assets/js/placement-test.js", "assets/js/placement-test.js"),
    ]
    print("[EGMS] Web root:", os.path.abspath(WEB_ROOT))
    with app.test_client() as c:
        for route, rel in checks:
            fs_ok = os.path.isfile(os.path.join(WEB_ROOT, rel))
            try:
                res = c.get(route)
                status = res.status_code
            except Exception:
                status = "ERR"
            print(f"[EGMS] Check {route:<34} status={status} file={'OK' if fs_ok else 'MISSING'}")


def _maybe_open_browser(url):
    """Open browser once when Flask server starts."""
    # Avoid duplicate tabs in debug reloader mode.
    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return

    def _open():
        try:
            webbrowser.open(url)
            print("[EGMS] Opened browser:", url)
        except Exception as e:
            print("[EGMS] Browser auto-open failed:", e)
            print("[EGMS] Open manually:", url)

    threading.Timer(1.0, _open).start()


@app.route("/api/init", methods=["GET"])
def api_init():
    """Force DB + school creation. Call from frontend on login page load."""
    try:
        _ensure_db_and_school()
        return jsonify({"ok": True, "school_id": get_school_id(), "message": "ready"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/admission_application", methods=["POST"])
def api_admission_application_add():
    """Append one application to admission_applications (for public form or admin)."""
    body = request.get_json() or {}
    school_id = body.get("school_id") or get_school_id()
    phone = (body.get("phone") or "").strip()
    suffix = phone[-4:] if len(phone) >= 4 else str(len(phone)).zfill(4)
    app_id = body.get("application_id") or ("APP" + datetime.now().strftime("%Y%m%d") + "_" + suffix)
    entry = {
        "application_id": app_id,
        "student_name": body.get("student_name") or body.get("name", ""),
        "name": body.get("name") or body.get("student_name", ""),
        "phone": phone,
        "email": (body.get("email") or "").strip(),
        "date_of_birth": body.get("date_of_birth", ""),
        "age": body.get("age"),
        "education": body.get("education", ""),
        "parent_name": body.get("parent_name", ""),
        "course": body.get("course", "4 Skills"),
        "applied_date": body.get("applied_date") or datetime.now().strftime("%Y-%m-%d"),
        "status": "Pending",
    }
    try:
        conn = get_conn()
        cur = conn.cursor()
        data = _load_web_extra_list(cur, school_id, "admission_applications") or []
        data.append(entry)
        cur.execute(
            "INSERT OR REPLACE INTO web_extra (school_id, data_key, data_json) VALUES (?, ?, ?)",
            (school_id, "admission_applications", json.dumps(data, ensure_ascii=False)),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "application_id": entry["application_id"]})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


PLACEMENT_RETAKE_DAYS_DEFAULT = 7
PLACEMENT_IDENTITY_ERROR = (
    "date_of_birth, parent_name, and phone (or device_id) are required for placement retake rules"
)


def _placement_test_from_site_bundle(bundle):
    """Extract placementTest dict from site_content_bundle (list or legacy shapes)."""
    if isinstance(bundle, dict):
        pt = bundle.get("placementTest")
        return pt if isinstance(pt, dict) else {}
    if isinstance(bundle, list):
        for item in bundle:
            if not isinstance(item, dict):
                continue
            pt = item.get("placementTest")
            if isinstance(pt, dict):
                return pt
    return {}


def _load_placement_retake_days(cur, school_id):
    """CMS: placementTest.retakeDays in site_content_bundle (default 7 = once per week)."""
    days = PLACEMENT_RETAKE_DAYS_DEFAULT
    try:
        cur.execute(
            "SELECT data_json FROM web_extra WHERE school_id = ? AND data_key = ?",
            (school_id, "site_content_bundle"),
        )
        row = cur.fetchone()
        if row and row["data_json"]:
            bundle = json.loads(row["data_json"])
            pt = _placement_test_from_site_bundle(bundle)
            raw = pt.get("retakeDays")
            if raw is None:
                raw = pt.get("retake_days")
            if raw is not None and str(raw).strip() != "":
                days = int(float(str(raw).strip()))
    except Exception:
        days = PLACEMENT_RETAKE_DAYS_DEFAULT
    return max(1, min(365, int(days)))


def _placement_retake_period_label(retake_days):
    retake_days = int(retake_days or PLACEMENT_RETAKE_DAYS_DEFAULT)
    if retake_days == 7:
        return "once per week"
    if retake_days == 1:
        return "once per day"
    return f"once every {retake_days} days"


def _placement_retake_blocked_message(retake_days, remaining_days):
    return (
        f"You can take this test {_placement_retake_period_label(retake_days)} "
        f"(same date of birth, parent name, and phone or device). "
        f"Please try again in {remaining_days} day(s)."
    )


def _norm_placement_phone(phone):
    return "".join(c for c in str(phone or "").strip() if c.isdigit())


def _norm_placement_parent(parent):
    return str(parent or "").strip().lower()


def _norm_placement_dob(dob):
    return str(dob or "").strip()


def _placement_identity(body):
    """
  Weekly retake: same person if (dob + phone + parent) OR (dob + device_id + parent).
  Name is stored for display but not used for matching.
    """
    email = (body.get("email") or "").strip().lower()
    phone_display = (body.get("phone") or "").strip()
    phone = _norm_placement_phone(phone_display)
    name = (body.get("name") or body.get("student_name") or "").strip()
    date_of_birth = _norm_placement_dob(body.get("date_of_birth"))
    parent_name = _norm_placement_parent(body.get("parent_name"))
    device_id = (body.get("device_id") or "").strip()
    keys = []
    if date_of_birth and parent_name and phone:
        keys.append(f"dob:{date_of_birth}|phone:{phone}|parent:{parent_name}")
    if date_of_birth and parent_name and device_id:
        keys.append(f"dob:{date_of_birth}|device:{device_id}|parent:{parent_name}")
    primary_key = keys[0] if keys else ""
    if keys:
        phone_keys = [k for k in keys if "|phone:" in k]
        if phone_keys:
            primary_key = phone_keys[0]
    return {
        "ok": bool(keys),
        "keys": keys,
        "primary_key": primary_key,
        "email": email,
        "phone": phone_display,
        "phone_norm": phone,
        "name": name,
        "date_of_birth": date_of_birth,
        "parent_name": parent_name,
        "device_id": device_id,
    }


def _attempt_components_match(rec, dob, phone_norm, parent_name, device_id):
    """Match stored attempt by dob+parent and (phone OR device_id)."""
    if not dob or not parent_name:
        return False
    rd = _norm_placement_dob((rec or {}).get("date_of_birth"))
    rpar = _norm_placement_parent((rec or {}).get("parent_name"))
    if rd != dob or rpar != parent_name:
        return False
    rp = _norm_placement_phone((rec or {}).get("phone"))
    rdev = str((rec or {}).get("device_id") or "").strip()
    if phone_norm and rp and phone_norm == rp:
        return True
    if device_id and rdev and device_id == rdev:
        return True
    return False


def _record_identity_keys(rec, keys):
    merged = set(keys or [])
    pk = str((rec or {}).get("identity_key") or "")
    if pk:
        merged.add(pk)
    for k in (rec or {}).get("identity_keys") or []:
        if k:
            merged.add(str(k))
    all_keys = sorted(merged)
    phone_keys = [k for k in all_keys if "|phone:" in k]
    rec["identity_keys"] = all_keys
    rec["identity_key"] = phone_keys[0] if phone_keys else (all_keys[0] if all_keys else "")


def _parse_iso_datetime(value):
    try:
        txt = str(value or "").strip()
        if not txt:
            return None
        # Support both "...Z" and plain ISO strings.
        if txt.endswith("Z"):
            txt = txt[:-1] + "+00:00"
        return datetime.fromisoformat(txt)
    except Exception:
        return None


def _retake_window_status(last_attempt_at_iso, retake_days=None):
    retake_days = max(1, int(retake_days or PLACEMENT_RETAKE_DAYS_DEFAULT))
    last_dt = _parse_iso_datetime(last_attempt_at_iso)
    if not last_dt:
        return True, None, 0
    now_dt = datetime.now(last_dt.tzinfo) if last_dt.tzinfo else datetime.now()
    next_allowed_dt = last_dt + timedelta(days=retake_days)
    if now_dt >= next_allowed_dt:
        return True, next_allowed_dt, 0
    remaining_days = (next_allowed_dt - now_dt).days
    if (next_allowed_dt - now_dt).seconds > 0:
        remaining_days += 1
    return False, next_allowed_dt, max(1, remaining_days)


def _load_placement_attempts(cur, school_id):
    items = _load_web_extra_list(cur, school_id, "placement_test_attempts") or []
    return items if isinstance(items, list) else []


def _save_placement_attempts(cur, school_id, attempts):
    cur.execute(
        "INSERT OR REPLACE INTO web_extra (school_id, data_key, data_json) VALUES (?, ?, ?)",
        (school_id, "placement_test_attempts", json.dumps(attempts if isinstance(attempts, list) else [], ensure_ascii=False)),
    )


def _find_attempt_index(attempts, id_info):
    """Find attempt by identity key(s) or dob+parent+(phone|device)."""
    keys = set(id_info.get("keys") or [])
    dob = id_info.get("date_of_birth") or ""
    phone_norm = id_info.get("phone_norm") or _norm_placement_phone(id_info.get("phone"))
    parent_name = id_info.get("parent_name") or ""
    device_id = id_info.get("device_id") or ""
    for i, it in enumerate(attempts or []):
        stored = set()
        pk = str((it or {}).get("identity_key") or "")
        if pk:
            stored.add(pk)
        for k in (it or {}).get("identity_keys") or []:
            if k:
                stored.add(str(k))
        if keys & stored:
            return i
        if _attempt_components_match(it, dob, phone_norm, parent_name, device_id):
            return i
    return -1


@app.route("/api/placement/attempts/check", methods=["POST"])
def api_placement_attempts_check():
    body = request.get_json() or {}
    school_id = body.get("school_id") or get_school_id()
    id_info = _placement_identity(body)
    if not id_info.get("ok"):
        return jsonify({"ok": False, "error": PLACEMENT_IDENTITY_ERROR}), 400
    try:
        conn = get_conn()
        cur = conn.cursor()
        retake_days = _load_placement_retake_days(cur, school_id)
        attempts = _load_placement_attempts(cur, school_id)
        conn.close()
        idx = _find_attempt_index(attempts, id_info)
        rec = attempts[idx] if idx >= 0 else {}
        attempt_count = int(rec.get("attempt_count") or 0)
        has_passed = bool(rec.get("has_passed"))
        can_take_by_window, next_allowed_dt, remaining_days = _retake_window_status(rec.get("last_attempt_at"), retake_days)
        can_take = can_take_by_window
        if not can_take_by_window:
            message = _placement_retake_blocked_message(retake_days, remaining_days)
        else:
            message = "Eligible to take the test."
        return jsonify({
            "ok": True,
            "identity_key": id_info.get("primary_key") or "",
            "identity_keys": id_info.get("keys") or [],
            "name": rec.get("name") or id_info.get("name"),
            "email": rec.get("email") or id_info.get("email"),
            "phone": rec.get("phone") or id_info.get("phone"),
            "date_of_birth": rec.get("date_of_birth") or id_info.get("date_of_birth"),
            "parent_name": rec.get("parent_name") or id_info.get("parent_name"),
            "device_id": rec.get("device_id") or id_info.get("device_id"),
            "attempt_count": attempt_count,
            "has_passed": has_passed,
            "can_take_test": can_take,
            "retake_days": retake_days,
            "days_until_next_attempt": remaining_days,
            "next_allowed_at": (next_allowed_dt.isoformat() if next_allowed_dt else ""),
            "message": message,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/placement/attempts/submit", methods=["POST"])
def api_placement_attempts_submit():
    body = request.get_json() or {}
    school_id = body.get("school_id") or get_school_id()
    id_info = _placement_identity(body)
    if not id_info.get("ok"):
        return jsonify({"ok": False, "error": PLACEMENT_IDENTITY_ERROR}), 400
    total_score = int(body.get("total_score") or 0)
    result_status = (body.get("result_status") or "").strip().upper()
    if result_status not in ("PASS", "FAIL"):
        result_status = "PASS" if bool(body.get("isPassed")) else "FAIL"
    is_passed = result_status == "PASS"
    try:
        conn = get_conn()
        cur = conn.cursor()
        retake_days = _load_placement_retake_days(cur, school_id)
        attempts = _load_placement_attempts(cur, school_id)
        idx = _find_attempt_index(attempts, id_info)
        now_iso = datetime.now().isoformat()
        if idx >= 0:
            rec = attempts[idx] or {}
        else:
            rec = {"attempt_count": 0, "has_passed": False}
        can_take_by_window, next_allowed_dt, remaining_days = _retake_window_status(rec.get("last_attempt_at"), retake_days)
        if not can_take_by_window:
            conn.close()
            return jsonify({
                "ok": False,
                "can_take_test": False,
                "retake_days": retake_days,
                "days_until_next_attempt": remaining_days,
                "next_allowed_at": (next_allowed_dt.isoformat() if next_allowed_dt else ""),
                "message": _placement_retake_blocked_message(retake_days, remaining_days),
            }), 429
        _record_identity_keys(rec, id_info.get("keys") or [])
        rec["name"] = id_info.get("name") or rec.get("name") or ""
        rec["email"] = id_info.get("email") or rec.get("email") or ""
        rec["phone"] = id_info.get("phone") or rec.get("phone") or ""
        rec["date_of_birth"] = id_info.get("date_of_birth") or rec.get("date_of_birth") or ""
        rec["parent_name"] = id_info.get("parent_name") or rec.get("parent_name") or ""
        rec["device_id"] = id_info.get("device_id") or rec.get("device_id") or ""
        rec["attempt_count"] = int(rec.get("attempt_count") or 0) + 1
        rec["has_passed"] = bool(rec.get("has_passed")) or is_passed
        rec["last_result_status"] = result_status
        rec["last_total_score"] = total_score
        rec["last_suggested_level"] = body.get("suggested_level") or ""
        rec["last_submission_id"] = body.get("client_submission_id") or body.get("submission_id") or ""
        rec["last_attempt_at"] = now_iso
        if idx >= 0:
            attempts[idx] = rec
        else:
            attempts.append(rec)
        _save_placement_attempts(cur, school_id, attempts)
        conn.commit()
        conn.close()
        return jsonify({
            "ok": True,
            "attempt_count": rec["attempt_count"],
            "has_passed": rec["has_passed"],
            "can_take_test": False,
            "retake_days": retake_days,
            "identity_key": rec.get("identity_key") or "",
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/placement/attempts/reset", methods=["POST"])
def api_placement_attempts_reset():
    body = request.get_json() or {}
    school_id = body.get("school_id") or get_school_id()
    id_info = _placement_identity(body)
    if not id_info.get("ok"):
        return jsonify({"ok": False, "error": PLACEMENT_IDENTITY_ERROR}), 400
    try:
        conn = get_conn()
        cur = conn.cursor()
        attempts = _load_placement_attempts(cur, school_id)
        idx = _find_attempt_index(attempts, id_info)
        if idx < 0:
            conn.close()
            return jsonify({"ok": True, "message": "No attempt record found", "attempt_count": 0, "has_passed": False})
        rec = attempts[idx] or {}
        _record_identity_keys(rec, id_info.get("keys") or [])
        rec["name"] = id_info.get("name") or rec.get("name") or ""
        rec["email"] = id_info.get("email") or rec.get("email") or ""
        rec["phone"] = id_info.get("phone") or rec.get("phone") or ""
        rec["date_of_birth"] = id_info.get("date_of_birth") or rec.get("date_of_birth") or ""
        rec["parent_name"] = id_info.get("parent_name") or rec.get("parent_name") or ""
        rec["device_id"] = id_info.get("device_id") or rec.get("device_id") or ""
        rec["attempt_count"] = 0
        rec["has_passed"] = False
        rec["last_result_status"] = ""
        rec["last_attempt_at"] = ""
        rec["reset_at"] = datetime.now().isoformat()
        attempts[idx] = rec
        _save_placement_attempts(cur, school_id, attempts)
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "attempt_count": 0, "has_passed": False, "can_take_test": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/send-result-email", methods=["POST"])
def api_send_result_email():
    body = request.get_json() or {}
    school_id = body.get("school_id") or get_school_id()
    to_email = (body.get("email") or "").strip()
    if not to_email:
        return jsonify({"ok": False, "error": "email required"}), 400
    student_name = (body.get("student_name") or body.get("name") or "Student").strip()
    total_score = int(body.get("total_score") or 0)
    suggested_level = (body.get("suggested_level") or "").strip()
    pass_fail_status = (body.get("pass_fail_status") or body.get("result_status") or "").strip().upper()
    if pass_fail_status not in ("PASS", "FAIL"):
        pass_fail_status = "PASS" if bool(body.get("isPassed")) else "FAIL"
    certificate_url = (body.get("certificate_url") or "").strip()

    subject = "Your Placement Test Result - Myanmar New Era"
    lines = [
        f"Dear {student_name},",
        "",
        "Your placement test has been reviewed by our teachers.",
        f"Student Name: {student_name}",
        f"Total Score: {total_score}/100",
        f"Suggested Level: {suggested_level}",
        f"Pass/Fail Status: {pass_fail_status}",
    ]
    if certificate_url:
        lines.extend(["", f"View or download your certificate: {certificate_url}"])
    lines.extend(["", "Thank you,", "Myanmar New Era International Education Centre"])
    body_text = "\n".join(lines)

    smtp_host = (os.environ.get("SMTP_HOST") or "").strip()
    smtp_port = int(os.environ.get("SMTP_PORT") or 587)
    smtp_user = (os.environ.get("SMTP_USER") or "").strip()
    smtp_pass = os.environ.get("SMTP_PASS") or ""
    smtp_from = (os.environ.get("SMTP_FROM") or smtp_user or "no-reply@localhost").strip()
    use_tls = str(os.environ.get("SMTP_USE_TLS") or "1").strip().lower() not in ("0", "false", "no")

    if not smtp_host:
        return jsonify({"ok": False, "error": "SMTP_HOST is not configured"}), 400

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg.set_content(body_text)

    status = "failed"
    error_text = ""
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            if use_tls:
                server.starttls()
            if smtp_user:
                server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        status = "sent"
    except Exception as e:
        error_text = str(e)

    try:
        conn = get_conn()
        cur = conn.cursor()
        logs = _load_web_extra_list(cur, school_id, "comm_email_log") or []
        logs.append({
            "sent_at": datetime.now().isoformat(),
            "to": to_email,
            "subject": subject,
            "student_name": student_name,
            "total_score": total_score,
            "suggested_level": suggested_level,
            "pass_fail_status": pass_fail_status,
            "certificate_url": certificate_url,
            "status": status,
            "error": error_text,
            "client_submission_id": body.get("client_submission_id") or "",
            "submission_id": body.get("submission_id") or "",
        })
        cur.execute(
            "INSERT OR REPLACE INTO web_extra (school_id, data_key, data_json) VALUES (?, ?, ?)",
            (school_id, "comm_email_log", json.dumps(logs, ensure_ascii=False)),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

    if status == "sent":
        return jsonify({"ok": True, "message": "Email sent"})
    return jsonify({"ok": False, "error": error_text or "Failed to send email"}), 500


@app.route("/<path:path>")
def serve_static(path):
    """Serve UI files (admin/, teacher/, student/, assets/) from project root."""
    if path.startswith("api/"):
        return jsonify({"ok": False, "error": "Not found"}), 404
    primary = os.path.join(WEB_ROOT, path)
    if os.path.isfile(primary):
        return send_from_directory(WEB_ROOT, path)

    # Compatibility: pages under /public-page/* may still reference "photo/*", "assets/*", "p.png"
    # as relative paths, which become /public-page/photo/* etc.
    if path.startswith("public-page/"):
        stripped = path[len("public-page/"):]
        stripped_file = os.path.join(WEB_ROOT, stripped)
        if os.path.isfile(stripped_file):
            return send_from_directory(WEB_ROOT, stripped)

    # Backward compatibility for old public URLs like /about.html, /courses.html
    fallback = os.path.join(WEB_ROOT, "public-page", path)
    if os.path.isfile(fallback):
        return send_from_directory(os.path.join(WEB_ROOT, "public-page"), path)

    return send_from_directory(WEB_ROOT, path)


if __name__ == "__main__":
    _ensure_db_and_school()
    _print_startup_health()
    _port = int(os.environ.get("PORT", "5001"))
    _debug = str(os.environ.get("FLASK_DEBUG", "")).strip().lower() in ("1", "true", "yes", "on")
    if str(os.environ.get("RENDER", "")).strip().lower() != "true":
        _maybe_open_browser(f"http://127.0.0.1:{_port}/")
    app.run(host="0.0.0.0", port=_port, debug=_debug)
