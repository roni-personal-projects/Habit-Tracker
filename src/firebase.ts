import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ──────────────────────────────────────────────────────────────
//  🔑  Replace these placeholder values with your own Firebase
//      project credentials from https://console.firebase.google.com
//
//  Steps:
//    1. Go to Firebase Console → Your project → Project settings
//    2. Under "Your apps", click the web icon (</>)
//    3. Register the app (any nickname is fine)
//    4. Copy the firebaseConfig object values here
//    5. Enable **Authentication → Anonymous** sign-in method
//    6. Enable **Firestore Database** (start in test mode for now)
// ──────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyATtuO0wyyhvLNkV1EF0w5dPaNAvFSOWho",
  authDomain: "habit-tracker-7a180.firebaseapp.com",
  projectId: "habit-tracker-7a180",
  storageBucket: "habit-tracker-7a180.firebasestorage.app",
  messagingSenderId: "904699014507",
  appId: "1:904699014507:web:41d06b34e62ec09e94b02e",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
