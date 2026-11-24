import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { collection, doc, getDocs, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase";
import { isTutorEmail } from "../config/roles";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // "tutor" | "student" | "unlinked" | null
  const [studentProfile, setStudentProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let unsubStudent = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthError("");
      if (unsubStudent) {
        unsubStudent();
        unsubStudent = null;
      }

      if (!firebaseUser) {
        setUser(null);
        setRole(null);
        setStudentProfile(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      if (isTutorEmail(firebaseUser.email)) {
        setRole("tutor");
        setStudentProfile(null);
        setLoading(false);
        return;
      }

      try {
        const studentsRef = collection(db, "students");
        const byUid = query(studentsRef, where("authUid", "==", firebaseUser.uid));
        let snap = await getDocs(byUid);

        if (snap.empty && firebaseUser.email) {
          const byEmail = query(
            studentsRef,
            where("email", "==", firebaseUser.email.toLowerCase())
          );
          snap = await getDocs(byEmail);
        }

        if (!snap.empty) {
          const docRef = doc(db, "students", snap.docs[0].id);
          setRole("student");
          unsubStudent = onSnapshot(docRef, (d) => {
            if (d.exists()) setStudentProfile({ id: d.id, ...d.data() });
            setLoading(false);
          });
        } else {
          setRole("unlinked");
          setStudentProfile(null);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        setAuthError("Could not load user profile.");
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubStudent) unsubStudent();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err.message || "Sign-in failed.");
      setLoading(false);
    }
  };

  const linkStudentWithInviteCode = async (rawCode) => {
    setAuthError("");
    if (!user) return { ok: false, message: "Sign in first." };
    const code = rawCode.trim().toUpperCase();
    if (!code) return { ok: false, message: "Enter your invite code." };

    try {
      const q = query(collection(db, "students"), where("inviteCode", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) return { ok: false, message: "Invalid invite code." };

      await updateDoc(doc(db, "students", snap.docs[0].id), {
        authUid: user.uid,
        email: (user.email || "").toLowerCase()
      });
      setRole("student");
      return { ok: true };
    } catch (err) {
      console.error(err);
      return { ok: false, message: "Failed to link profile." };
    }
  };

  const signOut = () => firebaseSignOut(auth);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        studentProfile,
        loading,
        authError,
        signInWithGoogle,
        linkStudentWithInviteCode,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);