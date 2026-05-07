-- =============================================================================
-- Standalone `users` table if you are starting fresh (no existing users table)
-- Teacher/Student: username = their ID (e.g. TCH_1426, STD_3369)
-- Admin: username = 'admin'
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role ENUM('admin', 'teacher', 'student') NOT NULL,
  username VARCHAR(191) NOT NULL COMMENT 'Login: admin or staff/student ID',
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  full_name VARCHAR(255) NOT NULL DEFAULT '',
  batch_name VARCHAR(255) NULL COMMENT 'Used for duplicate display names / future',
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_username (username),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default admin (password MUST be re-hashed by Python on first deploy — use seed script)
-- Do NOT insert plain passwords in production DB; see seed_admin.py
