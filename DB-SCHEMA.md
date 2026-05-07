# Complete Database Design (School Management System)

## System Architecture
```
        LOGIN
           │
    Check User Role
           │
   ┌───────┼───────┐
   ▼       ▼       ▼
 ADMIN  TEACHER  STUDENT
   │       │       │
 Manage   Attendance  View Result
 View     Enter Marks View Attendance
 Reports  Manage      View Courses
 Manage   Students
 Users
```

## Firebase Realtime Database Paths (Mapping to Logical Tables)

### users (auth / role)
- **Path**: Use Firebase Auth + `localStorage` role for demo; or `profiles/{uid}`: `{ name, email, role }`
- **role**: `admin` | `teacher` | `student`

### students
- **Path**: `students/{studentId}` or embed in marks/attendance
- **Fields**: id, name, class, dob, parent_name, phone, address

### teachers
- **Path**: `teachers/{teacherId}` (optional)
- **Fields**: id, name, subject, phone, email

### classes
- **Path**: `classes/{classId}` (optional)
- **Fields**: id, class_name, teacher_id

### subjects
- **Path**: `subjects/{subjectId}` or use fixed list (Myanmar, English, Math, Science)

### attendance
- **Path**: `attendance/{classId}/{date}`
- **Value**: `{ [studentId]: "present" | "absent" }`
- Teacher: click ✔ Present / ✖ Absent → auto save.

### marks
- **Path**: `marks/{classId}_{examKey}`
- **Value**: `{ [studentId]: { name, myanmar, english, math, science, total, average, grade, rank } }`
- Grade: 90+ A+, 80+ A, 70+ B, 60+ C, 50+ D, <50 F.
- System auto-calculates Total, Average, Grade, Rank.

### results (derived from marks)
- Student result = one row from marks by studentId. Total, Average, Grade, Rank shown on Student Panel.

### notices
- **Path**: `notices/{id}`
- **Value**: `{ title, body, date }`

---

## Project Folder Structure (Final)

```
MNEA/
├── index.html
├── login.html
├── DB-SCHEMA.md
│
├── admin/
│   ├── dashboard.html   (Stats: Students, Teachers, Classes, Admissions | Recent Admissions table | System Notifications)
│   ├── admissions.html  (Admission Management)
│   ├── students.html    (Student Management)
│   ├── teachers.html    (Teacher Management)
│   ├── academic.html    (Academic Management)
│   ├── reports.html     (Reports & Analytics)
│   ├── settings.html    (Settings)
│   ├── attendance.html  (View attendance – optional)
│   └── exams.html       (View exams – optional)
│
├── teacher/
│   ├── dashboard.html
│   ├── students.html    (My Students)
│   ├── attendance.html  (Present ✔ | Absent ✖ → auto save)
│   ├── marks.html       (Myanmar, English, Math, Science → Total, Average, Grade, Rank)
│   └── materials.html   (Lesson Materials)
│
├── student/
│   ├── dashboard.html
│   ├── courses.html     (My Courses)
│   ├── attendance.html  (View attendance)
│   ├── exam-results.html (Subject | Marks | Grade + Total, Average, Rank)
│   ├── notice-board.html
│   ├── placement-test.html
│   ├── progress.html
│   └── profile.html
│
├── assets/
│   ├── css/
│   │   ├── main.css
│   │   └── dashboard.css
│   └── js/
│       ├── auth.js
│       ├── firebase-config.js
│       ├── content-firebase.js
│       ├── lang-switcher.js
│       └── ...
└── ...
```

## Real Workflow
- **Teacher**: Take Attendance (✔/✖) → Enter Marks → System **auto save** & **auto calculate** Grade/Rank.
- **Admin**: View Reports, Manage School (Students, Teachers, Settings).
- **Student**: View Attendance, View Results (Total, Average, Rank).
