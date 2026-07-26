import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEMO_EMAIL } from '../demo/demoStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [staff, setStaff] = useState(null); // staff profile doc, or null if not staff
  const [isDemo, setIsDemo] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      const email = u?.email?.toLowerCase();
      if (email === DEMO_EMAIL) {
        // Sample-data mode: this account explores the UI with demo data and
        // never touches real customer records.
        setIsDemo(true);
        setStaff({ id: email, name: 'Demo Staff', role: 'demo (sample data)' });
      } else if (email) {
        setIsDemo(false);
        try {
          const snap = await getDoc(doc(db, 'staff', email));
          setStaff(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        } catch (e) {
          // Firestore rules only permit reading your own staff doc; any error
          // here means "not staff" for gating purposes.
          setStaff(null);
        }
      } else {
        setIsDemo(false);
        setStaff(null);
      }
      setInitializing(false);
    });
  }, []);

  const signIn = (email, password) =>
    signInWithEmailAndPassword(auth, email.trim(), password);

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, staff, isDemo, initializing, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
