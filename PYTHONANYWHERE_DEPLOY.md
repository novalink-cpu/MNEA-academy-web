# PythonAnywhere Deploy — MNEA (MySQL)

Project path on PA: `/home/khakha/MNEA_pythonanywhere`  
GitHub: `https://github.com/novalink-cpu/MNEA-academy-web.git` (branch `main`)

## 1. Local — commit & push

```bash
cd MNEA_pythonanywhere
git add -A
git status
git commit -m "Your message here"
git push origin main
```

Example (website/CMS only):

```bash
git add website/
git commit -m "Update CMS, gallery, programs, and website settings"
git push origin main
```

## 2. PythonAnywhere — MySQL database

1. **Databases** tab → create database (e.g. `khakha$mnea`).
2. Note: host `khakha.mysql.pythonanywhere-services.com`, user `khakha`, password, database name.

## 3. PythonAnywhere — `.env`

Edit `/home/khakha/MNEA_pythonanywhere/.env`:

```env
FLASK_SECRET_KEY=your-long-random-secret

MYSQL_HOST=khakha.mysql.pythonanywhere-services.com
MYSQL_PORT=3306
MYSQL_USER=khakha
MYSQL_PASSWORD=your-mysql-password
MYSQL_DATABASE=khakha$mnea

PUBLIC_BASE_URL=https://yourusername.pythonanywhere.com
```

## 4. Pull code & install packages

### Routine update (HTML/CSS/JS/CMS only)

PythonAnywhere **Bash** console:

```bash
cd ~/MNEA_pythonanywhere
git pull origin main
```

Then **Web** tab → **Reload** your app (green button).

No need to re-run MySQL setup for content-only changes.

### Full deploy (first time or after `requirements.txt` / DB changes)

Bash console:

```bash
cd ~/MNEA_pythonanywhere
bash scripts/pa_deploy.sh
```

Or manually:

```bash
cd ~/MNEA_pythonanywhere
git pull origin main
pip install --user -r requirements.txt
python scripts/setup_mysql.py
```

`setup_mysql.py` creates tables, default school, and auth user **admin / admin123** (change immediately).

Optional SQLite import:

```bash
python scripts/setup_mysql.py --migrate Database/School_0001_2026-2027.db
```

## 5. WSGI configuration

**Web** tab → WSGI file (example):

```python
import sys
sys.path.insert(0, '/home/khakha/MNEA_pythonanywhere')
from wsgi import application
```

Then **Reload**.

## 6. Migrate old SQLite data only (if skipped setup)

If you have `Database/School_0001_2026-2027.db` from the old setup:

```bash
cd ~/MNEA_pythonanywhere
python scripts/migrate_sqlite_to_mysql.py Database/School_0001_2026-2027.db
```

Portal teachers/students move to `school_users`. Auth login accounts stay in MySQL `users` (create via `/auth/admin` if needed).

## 7. Verify

- Open site → login as admin.
- **Admin → Page Content** → edit & save → refresh (content stored in MySQL `web_extra`).
- **Settings → Backup** exports `.json` (not `.db`).

## Notes

- All app data uses **one MySQL database** (no per-year `.db` files). Academic year is stored in `app_config` only.
- Full MySQL backup: PythonAnywhere **Databases** tab → backup, or use Admin **Backup** (JSON export).
