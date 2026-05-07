-- =============================================================================
-- Myanmar New Era — Auth module (MySQL)
-- Run AFTER you have a `users` table or adjust foreign keys to match your schema.
-- This file assumes a standalone `users` table as defined in 002_seed_notes.sql
-- =============================================================================

-- If your existing `users` table uses a different name/structure, create a new
-- table `app_users` and change FKs in password_history / audit_log / tokens.

-- -----------------------------------------------------------------------------
-- 1) Add columns to users (run each statement only if column missing)
-- -----------------------------------------------------------------------------

-- MySQL 8+: you can check INFORMATION_SCHEMA before ALTER in a stored proc;
-- here we use simple ALTERs — remove lines that fail if column already exists.

ALTER TABLE users
  ADD COLUMN email VARCHAR(255) NULL AFTER password_hash;

ALTER TABLE users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1 AFTER email;

-- If your legacy column was `password` plain text, we add password_hash separately
-- in migration script; see migrate_plain_passwords.py

-- -----------------------------------------------------------------------------
-- 2) password_history — last hashes for reuse prevention
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_created (user_id, created_at),
  CONSTRAINT fk_pwh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3) audit_log — security events
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id INT UNSIGNED NULL COMMENT 'Admin/user who performed action',
  target_user_id INT UNSIGNED NULL COMMENT 'Affected account',
  action VARCHAR(64) NOT NULL,
  details TEXT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_created_at (created_at),
  KEY idx_action (action),
  KEY idx_target (target_user_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4) password_reset_tokens
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_token (token),
  KEY idx_user_exp (user_id, expires_at),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5) Optional: track hourly reset counts (alternative: count audit_log rows)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_reset_rate (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  window_start DATETIME NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_window (user_id, window_start),
  CONSTRAINT fk_prr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- NOTE: Plain-text → bcrypt is done in Python (migrate_plain_passwords.py),
-- not in SQL, because MySQL cannot bcrypt-hash natively.
-- -----------------------------------------------------------------------------
