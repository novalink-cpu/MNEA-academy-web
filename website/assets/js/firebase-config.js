/**
 * Firebase configuration for:
 * - Site content (Home + Placement Test): admin-content.html saves to Firebase; public pages load from Firebase.
 * - Placement Test submissions: saved to Firebase → Realtime Database → /submissions.
 *
 * Get these values from Firebase Console: Project Settings > General > Your apps.
 * If you leave this empty: site content uses localStorage only.
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAc7W3RoNSAzgGGu7hlLeOqss62_GRFDXY",
  authDomain: "school-management-system-a8208.firebaseapp.com",
  projectId: "school-management-system-a8208",
  storageBucket: "school-management-system-a8208.firebasestorage.app",
  messagingSenderId: "25571182802",
  appId: "1:25571182802:web:f494d0e7c46ed480f7050b",
  measurementId: "G-17FZB6KMSF",
  databaseURL: "https://school-management-system-a8208-default-rtdb.asia-southeast1.firebasedatabase.app"
};

