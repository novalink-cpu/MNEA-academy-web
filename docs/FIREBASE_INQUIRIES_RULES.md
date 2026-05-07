# Firebase: Contact Form (Inquiries) Admin   

**:** Contact form  "Could not send (server or permission)"  Admin → Communication → Inquiries  message  **Firebase Realtime Database Security Rules**  `/inquiries`  **guest ()**      DB  Admin panel  

---

##  (Rules )

###   – Project  rules  

1.  project  **`database.rules.json`**    **rules**  copy 
2. **Firebase Console** : https://console.firebase.google.com/
3.  project  ( **school-management-system-a8208**)
4.  **Build** → **Realtime Database** 
5.  **Rules** tab 
6.  editor   rules    **`inquiries`**    
   -  rules  `"rules": { }`  **`inquiries`** block   
   -  path  ( `submissions`, `siteContent`)    **`inquiries`**  

** `inquiries` rules:**

```json
"inquiries": {
  ".read": "auth != null",
  ".write": "true"
}
```

7. **Publish**  

###   – Rules  

 rules  path   `database.rules.json`  **rules **  Firebase Console → Realtime Database → Rules  paste  **Publish** 

---

##   

| Path        | Read              | Write     |  |
|------------|-------------------|-----------|----------------|
| **inquiries** |  (Admin) | **** (guest ) | Contact form    Admin  Communication   |

- **`.write": "true"`** = guest  contact form   ( Admin  )
- **`.read": "auth != null"`** =  (Admin)  

---

## 

1. Contact page  form  **Send**  Success message   
2. Admin panel  **Communication** → **Inquiries / Contact Messages**   message  
