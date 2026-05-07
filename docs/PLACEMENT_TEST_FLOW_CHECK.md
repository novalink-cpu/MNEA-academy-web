# Placement Test Flow –  vs  Flow

## ✅  ( )

| # |  Flow |  |  |
|---|-------------------|---------------------|-----------|
| 1 | **Homepage** – Take Placement Test, Free Level Test, Instant Result | `index.html` – "Level Test " / "Take Level Test"  | CTA  "Learn English With Us" + ✔     |
| 2 | **Student Information Form** – Name, Phone, Email, Age, Education, Continue to Test | `placement-test.html` Step 1 –   Email   | **Age, Education**    |
| 4 | **Test Sections** – Listening (Audio + A–D), Reading (passage + A–D), Writing (text box), Speaking | Step 2–5 – Listening, Reading, Writing, Speaking  | Listening/Reading  Writing textarea Speaking Record  |
| 6 | **System Calculates Score** – L/R/W/S, Total, Suggested Level | `placement-test.js` – `computeScores()`  L/R/W/S + Total (0–100) + Suggested Level |  backend / Admin   |
| 8 | **Admin Dashboard** – Placement Test Results (No, Name, Phone, Total, Level, Action View) | `admin/admissions.html` – Placement Test Results  View  |  |
| 9 | **Admin Detail View** – View → Student Test Detail (scores) + Assign Level | Test Detail modal – Name, Phone, L/R/W/S, Total, Suggested Level, Assign Level |  |
| 10 | **Assign Course** – Admin assign level (Elementary, Pre-Int, …) | Assign Level modal – Final Level, Batch, Teacher, Schedule, Save & Enroll |  |
| 11 | **Contact Student** – Call / Message | Admin  Phone/Email   (detail ) |  Call/Message    |

---

## ❌  ()

| # |  Flow |  |  |
|---|-------------------|---------------------|----------------|
| 3 | **Test Instructions Page** – Duration 25 min, Sections (L/R/W/S), Total 25 questions, "Start Test" |  Student Info   Listening   | **Instructions step**   (Duration, Sections, Total Questions, Start Test) |
| 5 | **Test Submission** – "Are you sure you want to submit?" → [Submit Test] |  Speaking  ""   submit  | **Submit confirmation**  dialog/step  |
| 7 | **Result Page (Student)** – Listening: 18, Reading: 20, Writing: 17, Speaking: 15, Total: 70, Suggested Level: Pre-Intermediate, "Our team will contact you soon." | Step 6     ** + Suggested Level ** | Step 6  **Result Page**   – L/R/W/S/Total/Suggested Level  "Our team will contact you soon."  |

---

## 📄     

 "Total = 10 pages"  :

| # |  |  |  |
|---|-------------|---------|-----------|
| 1 | Homepage | ✅ `index.html` | Take Placement Test  |
| 2 | Registration Form | ✅ Step 1 (placement-test.html) | Age, Education   |
| 3 | Test Instructions | ❌ |  |
| 4 | Listening Test | ✅ Step 2 | |
| 5 | Reading Test | ✅ Step 3 | |
| 6 | Writing Test | ✅ Step 4 | |
| 7 | Speaking Test | ✅ Step 5 | |
| 8 | Result Page | ⚠️ Step 6   | Result    |
| 9 | Admin Dashboard | ✅ `admin/admissions.html` | Placement Test Results  |
| 10 | Student Detail (Admin View) | ✅ Test Detail modal | View → detail + Assign Level |

---

## 🎯 

- **** –   flow   **** (Homepage → Info → Listening → Reading → Writing → Speaking → Submit → Admin Results → View Detail → Assign Level).
- ****     :
  1. **Test Instructions** – Test  Duration / Sections / Total Questions / Start Test   ( step) 
  2. **Submit confirmation** – "Are you sure you want to submit?"  [Submit Test] 
  3. **Result Page** –   Listening/Reading/Writing/Speaking/Total/Suggested Level  "Our team will contact you soon." 

     flow      ** **
