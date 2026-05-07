# System Requirements vs  MNEA 

##  

**System Requirements   ?**  
****  **School Management System + Website Hybrid**    MNEA  **Static Website + Admin Panel + () localStorage / () Firebase**    

** Requirements   ?**  
- **** (/   +  content + placement test)  **** localStorage / Firebase     
- **** (/  attendance, exam, SMS, multi-user )  ****   PostgreSQL, Backend API, React/Vue  

---

##   — System Requirements vs 

| Feature | System Requirements () |  MNEA  |  |
|--------|--------------------------------------|-----------------------------|------------|
| **Database** | PostgreSQL / MySQL (student, teachers, classes, attendance, SMS logs) | **Firebase Realtime Database** (NoSQL) + **localStorage** (content  ) |  DB  Structured data  PostgreSQL/MySQL  |
| **Backend** | Supabase / Node.js / Django / Laravel API | **Backend server ** Firebase SDK (client-side) + static HTML | API server  |
| **Frontend** | React / Next.js / Vue / Flutter Web | **HTML + CSS + Vanilla JavaScript** | React/Vue  |
| **Storage** | Media files (profile pics, PDFs, documents) | **Local paths** (photo/, assets/) + Firebase config  storageBucket    |  server/cloud storage    |
| **SMS Integration** | Twilio / Local SMS Gateway | **** Placement test  **Telegram** (optional)   | SMS   |
| **Users** | 500–5000 concurrent users | **** (static site + Firebase/localStorage) | Scale  server + DB + CDN  |
| **Security** | SSL, daily backups, GDPR/PDPA | **SSL** (hosting ), backup/ GDPR  **** | Production  backup + policy  |

---

##  

|  | System Requirements |  |
|--------|---------------------|---------------------|
| Database | PostgreSQL / MySQL | Firebase Realtime DB + localStorage |
| Backend API | Supabase / Node / Django / Laravel |  (Firebase client-only) |
| Frontend | React / Next.js / Vue / Flutter | HTML + CSS + JS (static) |
| Storage | Dedicated media storage | Local paths + (Firebase storage ) |
| SMS | Twilio / Local Gateway |  (Telegram optional) |
| Scale | 500–5000 users |  |
| Security | SSL, backup, GDPR/PDPA | SSL  ( ) |

---

##  

- **:**  + Admin  content + Placement Test + () Firebase  ** ** System Requirements   ** Hybrid School System**   
- ** :**  **localStorage  **      
- ** scale / features** (/ , attendance, exam, SMS)  ** Requirements ** (PostgreSQL, Backend API, React/Vue, Storage, SMS) 

---

##    +  — Recommended Setup vs  MNEA

### User Scale ( users )

|  |  Users Recommended |  MNEA |
|--------|------------------------|--------------|
| Students | 200 |  (design   ) |
| Teachers/Admin | 10–20 | Admin panel  role  |
| Concurrent users | 10–20 () |  |
| System load | Low | Low |

### Component 

| Component |  Users Recommendation |  MNEA  |  /  |
|-----------|----------------------------|-----------------------------|------------------------------|
| **Database** | Supabase PostgreSQL **** Firebase Realtime DB | Firebase Realtime DB + **localStorage** (content ) | **** —  Firebase/localStorage     Supabase/PostgreSQL  **optional upgrade** |
| **Backend API** | Supabase functions **** Node.js server (optional) | **** — Firebase client SDK  | **** — client-only   low concurrency  Scale  API  |
| **Frontend** | Static + JS **** React/Vue | **HTML + CSS + Vanilla JS** (static) | **** —  static site   users   React/Vue  **future scale**  |
| **Storage** | Firebase Storage / Supabase Storage (profile, PDF) | **Local paths** (photo/, assets/)  Firebase Storage  | **** — profile pics, PDFs  Firebase/Supabase Storage     |
| **SMS** | Optional: Twilio (attendance / exam reminder) | **** (Telegram optional ) | **** — SMS    Attendance/reminder  Twilio  |
| **Security** | SSL + basic auth | SSL (hosting ) | **** — Production  **SSL**  **backup**     |

### Hosting ( users)

| Option |  Users Recommendation |  MNEA   |
|--------|----------------------------|---------------------------|
| Supabase Cloud | Free/Paid — PostgreSQL + Auth + Storage |     |
| Firebase | Free/Blaze — Realtime DB + Auth + Storage | **** ( content  local )   free tier  |
| VPS (DigitalOcean/Linode) | 1–2 vCPU, 2–4GB RAM — self-host |   Managed cloud (Firebase/Supabase)  |

---

##   —  Users   

|  |  |
|-----------|--------|
| ** project   users recommendation  ?** | ** ** — Static site + Firebase/localStorage    low concurrency    " "   |
| **?** | **** —  MNEA  Firebase  () Supabase   users   |
| ** ?** | **() SSL + backup**  **() Profile/PDF ** Firebase Storage () Supabase Storage  **() Attendance / SMS reminder**  Twilio () local SMS  |
| ** ?** | **PostgreSQL, Backend API, React/Vue, VPS** —  users   setup    optional upgrade  |

**:**   +   ** MNEA   ** Recommendation  **Database, Backend, Frontend, SMS**   **** **** — **SSL + backup**   **Storage (profile/PDF)** **SMS (optional)**  
