import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAseT-WZw9ZbFQ8hifu9OTuxe93V45sTA0",
  authDomain: "stat-deck.firebaseapp.com",
  projectId: "stat-deck",
  storageBucket: "stat-deck.firebasestorage.app",
  messagingSenderId: "220415349874",
  appId: "1:220415349874:web:c49337d47f8e5dff379eeb"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);


