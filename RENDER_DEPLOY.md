# Render Deploy (Quick Test)

This project is now configured to run on Render as one web service.

## 1) Push to GitHub

Push this repository to GitHub first.

## 2) Create service on Render

- Render dashboard -> New -> Blueprint
- Connect your GitHub repo
- Render will read `render.yaml` and create the web service

If you prefer manual setup:
- Runtime: Python
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120`

## 3) Set environment variables

Minimum:
- `FLASK_SECRET_KEY` = long random string
- `PUBLIC_BASE_URL` = `https://<your-service>.onrender.com`
- `FLASK_DEBUG` = `0`

Optional (only if you use them):
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USE_TLS`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_DEFAULT_SENDER`

## 4) Verify after deploy

- Open `https://<your-service>.onrender.com`
- Check public pages load
- Check admin/teacher/student pages
- Confirm API-backed actions work (save/load data)

## Notes

- `school-api.js` now prefers same-origin in deployed environments, so API calls work behind Render domain.
- Free tier may sleep when idle; first request can be slow.
