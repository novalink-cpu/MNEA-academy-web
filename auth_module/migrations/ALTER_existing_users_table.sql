-- -----------------------------------------------------------------------------
-- If you ALREADY have a `users` table, add missing columns (edit types if needed).
-- Run each statement once; ignore errors if column exists.
-- -----------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until DATETIME NULL;
ALTER TABLE users ADD COLUMN batch_name VARCHAR(255) NULL;

-- If passwords are still plain in column `password`:
--   1) Add password_hash:
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL;
--   2) Run:  python migrations/migrate_plain_passwords.py
--   3) Then (after verifying hashes work): ALTER TABLE users DROP COLUMN password;
