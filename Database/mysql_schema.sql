-- MNEA school management + auth — full MySQL schema (run once)
-- App portal users: school_users (auth login users: users)

CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT '',
  admin_username VARCHAR(191) NOT NULL DEFAULT 'admin',
  admin_password VARCHAR(255) NOT NULL DEFAULT '',
  logo LONGTEXT,
  primary_color VARCHAR(32) NOT NULL DEFAULT '#27ae60',
  bg_color VARCHAR(32) NOT NULL DEFAULT '#ffffff',
  sidebar_bg VARCHAR(32) NOT NULL DEFAULT '#ffffff',
  bg_image LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_config (
  `key` VARCHAR(191) NOT NULL PRIMARY KEY,
  value LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS superadmin (
  password VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  school_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(191) NOT NULL,
  data_json LONGTEXT,
  PRIMARY KEY (school_id, student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exams (
  school_id VARCHAR(64) NOT NULL,
  exam_name VARCHAR(255) NOT NULL,
  category VARCHAR(128) NOT NULL DEFAULT 'Final Test',
  PRIMARY KEY (school_id, exam_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grades_config (
  school_id VARCHAR(64) NOT NULL PRIMARY KEY,
  data_json LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exams_by_grade (
  school_id VARCHAR(64) NOT NULL PRIMARY KEY,
  data_json LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_sections (
  school_id VARCHAR(64) NOT NULL PRIMARY KEY,
  data_json LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_users (
  school_id VARCHAR(64) NOT NULL,
  username VARCHAR(191) NOT NULL,
  data_json LONGTEXT,
  PRIMARY KEY (school_id, username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS web_extra (
  school_id VARCHAR(64) NOT NULL,
  data_key VARCHAR(191) NOT NULL,
  data_json LONGTEXT,
  PRIMARY KEY (school_id, data_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects (
  school_id VARCHAR(64) NOT NULL,
  data_key VARCHAR(64) NOT NULL DEFAULT 'subjects',
  data_json LONGTEXT,
  PRIMARY KEY (school_id, data_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courses (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  duration VARCHAR(128) NOT NULL DEFAULT '',
  fee DOUBLE NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  start_date VARCHAR(32) NOT NULL DEFAULT '',
  end_date VARCHAR(32) NOT NULL DEFAULT '',
  capacity INT NOT NULL DEFAULT 0,
  current_enrollment INT NOT NULL DEFAULT 0,
  locations VARCHAR(255) NOT NULL DEFAULT '',
  age_group VARCHAR(128) NOT NULL DEFAULT '',
  schedule VARCHAR(255) NOT NULL DEFAULT '',
  instructor VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_courses_school_name (school_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS levels (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL,
  course_id INT NULL,
  name VARCHAR(255) NOT NULL,
  min_score INT NOT NULL DEFAULT 0,
  max_score INT NOT NULL DEFAULT 100,
  cefr VARCHAR(32) NOT NULL DEFAULT '',
  locations VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  duration VARCHAR(128) NOT NULL DEFAULT '',
  UNIQUE KEY idx_levels_school_course_name (school_id, course_id, name),
  CONSTRAINT fk_levels_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS batches (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  course_id INT NOT NULL,
  level_id INT NOT NULL,
  teacher_name VARCHAR(255) NOT NULL DEFAULT '',
  teacher_username VARCHAR(191) NOT NULL DEFAULT '',
  schedule VARCHAR(255) NOT NULL DEFAULT '',
  start_date VARCHAR(32) NOT NULL DEFAULT '',
  end_date VARCHAR(32) NOT NULL DEFAULT '',
  max_students INT NOT NULL DEFAULT 0,
  location VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_batches_school_name (school_id, name),
  CONSTRAINT fk_batches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_batches_level FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS batch_timetables (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL,
  batch_id INT NOT NULL,
  day VARCHAR(32) NOT NULL,
  time VARCHAR(32) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  teacher_name VARCHAR(255) NOT NULL DEFAULT '',
  room_location VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_batch_timetables_slot (school_id, batch_id, day, time, subject),
  CONSTRAINT fk_timetables_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(191) NOT NULL,
  batch_id INT NOT NULL,
  date VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  remark VARCHAR(512) NOT NULL DEFAULT '',
  taken_by VARCHAR(191) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance (school_id, student_id, batch_id, date),
  KEY idx_attendance_school_batch_date (school_id, batch_id, date),
  KEY idx_attendance_school_student (school_id, student_id),
  CONSTRAINT fk_attendance_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_session_lock (
  school_id VARCHAR(64) NOT NULL,
  batch_id INT NOT NULL,
  date VARCHAR(32) NOT NULL,
  locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  taken_by VARCHAR(191) NOT NULL DEFAULT '',
  PRIMARY KEY (school_id, batch_id, date),
  CONSTRAINT fk_lock_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Auth module tables (login / audit / reset)
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role ENUM('admin', 'teacher', 'student') NOT NULL,
  username VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  full_name VARCHAR(255) NOT NULL DEFAULT '',
  batch_name VARCHAR(255) NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_username (username),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_created (user_id, created_at),
  CONSTRAINT fk_pwh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id INT UNSIGNED NULL,
  target_user_id INT UNSIGNED NULL,
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
