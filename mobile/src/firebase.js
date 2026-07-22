import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfig } from './firebaseConfig';

// Initialize once (Fast Refresh can re-run this module).
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth with AsyncStorage persistence keeps the user signed in
// across app restarts on React Native.
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // Already initialized (Fast Refresh) — fall back to the existing instance.
  const { getAuth } = require('firebase/auth');
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
