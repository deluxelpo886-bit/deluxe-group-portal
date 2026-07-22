import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [staff, setStaff] = useState(null); // staff profile doc, or null if not staff
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && u.email) {
        try {
          const snap = await getDoc(doc(db, 'staff', u.email.toLowerCase()));
          setStaff(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        } catch (e) {
          // Firestore rules only permit reading your own staff doc; any error
          // here means "not staff" for gating purposes.
          setStaff(null);
        }
      } else {
        setStaff(null);
      }
      setInitializing(false);
    });
  }, []);

  const signIn = (email, password) =>
    signInWithEmailAndPassword(auth, email.trim(), password);

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, staff, initializing, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
