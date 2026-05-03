import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Konfigurasi Firebase dari console kamu
const firebaseConfig = {
  apiKey: "AIzaSyAYQ5iMHHCyz0Kr2QtdumNw3W7clS19OFg",
  authDomain: "learnpath-9ce0d.firebaseapp.com",
  projectId: "learnpath-9ce0d",
  storageBucket: "learnpath-9ce0d.firebasestorage.app",
  messagingSenderId: "1033210283172",
  appId: "1:1033210283172:web:a8a72156d61632d36a1231"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

