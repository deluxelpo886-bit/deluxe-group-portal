// -----------------------------------------------------------------------------
// Firebase configuration for the "deluxego-17b2a" project.
//
// These values come from the Firebase console (Project settings > Your apps >
// Web app). They are NOT secret — they ship inside every client app — so it is
// normal for them to live in the repository.
//
// Console: https://console.firebase.google.com/project/deluxego-17b2a/settings/general
// -----------------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: 'AIzaSyCQRYWoMKk8UpLCuhG7npnbzEvgq1T8CcI',
  authDomain: 'deluxego-17b2a.firebaseapp.com',
  projectId: 'deluxego-17b2a',
  storageBucket: 'deluxego-17b2a.firebasestorage.app',
  messagingSenderId: '697935424437',
  appId: '1:697935424437:web:1e56ca815b6b188228c7fc',
  measurementId: 'G-1GTQWHGZ9Y',
};

// True once the placeholders above have been replaced with real values.
export const firebaseConfigured =
  !Object.values(firebaseConfig).some((v) => String(v).includes('PASTE_FROM_CONSOLE'));
