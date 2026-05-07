# Myanmar New Era Academy - Website (Hybrid)

   Level Test  Hybrid  Login  Student / Admin view 

##   (Project Structure)

```
/ (root)
│
├── index.html
├── about.html
├── courses.html
├── course-detail.html
├── blog.html
├── contact.html
├── placement-test.html
├── login.html
├── privacy.html
├── terms.html
│
├── /admin
│   ├── dashboard.html
│   ├── admissions.html
│   ├── students.html
│   ├── teachers.html
│   ├── academic.html
│   ├── attendance.html
│   ├── exams.html
│   ├── reports.html
│   └── settings.html
│
├── /student
│   ├── dashboard.html
│   ├── placement-test.html   (redirects to root placement-test)
│   ├── progress.html
│   └── profile.html
│
├── /assets
│   ├── /css       (main.css, dashboard.css, placement-test.css)
│   ├── /js        (firebase-config, auth, content-firebase, placement-test, etc.)
│   └── /images    (flag-us.svg, flag-mm.svg)
│
└── README.md
```

##  (Sitemap)

|  |  |
|----------------|------------------|
| **index.html** |  – Hero, ,  |
| **about.html**, **courses.html**, **course-detail.html**, **blog.html**, **contact.html** |   |
| **placement-test.html** |  4-Skill Level Test  |
| **login.html** |  /  |
| **admin/dashboard.html** | Admin Dashboard – , Quick Links |
| **admin/admissions.html** |  Form, Payment Guide |
| **admin/students.html** … **admin/settings.html** | Admin   |
| **student/dashboard.html** |  Dashboard – CEFR Level, , Progress |
| **student/placement-test.html** | Level Test   |
| **student/progress.html**, **student/profile.html** |  Progress  Profile |

## Login  View

- ****: Nav  Login / Register  Level Test  placement-test.html  
- **Student Login**: **student/dashboard.html**   CEFR Level  Level Test 
- **Admin Login**: **admin/dashboard.html**    Admissions Reports 

**Admin **: Firebase Console → Authentication  Email/Password  User  Register  UID  Realtime Database → `users/{uid}`  `{ "displayName": "...", "email": "...", "role": "admin" }` 

## 

`index.html`    CSS/JS/Images  **assets/**  
