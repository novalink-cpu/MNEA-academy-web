#!/usr/bin/env python3
"""Create default admin user with bcrypt hash (admin / admin123)."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from dotenv import load_dotenv

load_dotenv(os.path.join(ROOT, ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

import mysql.connector
from flask import Flask
from flask_bcrypt import Bcrypt

app = Flask(__name__)
app.config["BCRYPT_LOG_ROUNDS"] = int(os.environ.get("BCRYPT_LOG_ROUNDS", "12"))
bcrypt = Bcrypt(app)


def main():
    conn = mysql.connector.connect(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DATABASE", "mnea_auth"),
    )
    cur = conn.cursor()
    h = bcrypt.generate_password_hash("admin123")
    if isinstance(h, bytes):
        h = h.decode("utf-8")
    cur.execute(
        """
        INSERT INTO users (role, username, password_hash, email, full_name, must_change_password,
          failed_login_attempts, locked_until)
        VALUES ('admin', 'admin', %s, NULL, 'Administrator', 1, 0, NULL)
        ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
        """,
        (h,),
    )
    conn.commit()
    cur.close()
    conn.close()
    print("Admin user ensured: username=admin password=admin123 (change immediately in production).")


if __name__ == "__main__":
    main()
