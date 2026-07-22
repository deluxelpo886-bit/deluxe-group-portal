// -----------------------------------------------------------------------------
// Firebase configuration for the "deluxe-go" project.
//
// The three values marked PASTE_FROM_CONSOLE below come from the Firebase
// console and are NOT secret (they ship inside every client app), but they are
// specific to your project. To get them:
//
//   1. Go to https://console.firebase.google.com/project/deluxe-go/settings/general
//   2. Under "Your apps", add (or open) a Web app (</> icon).
//   3. Copy apiKey, messagingSenderId and appId from the shown config object.
//
// The other fields are derived from the project id and are already filled in.
// -----------------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: 'PASTE_FROM_CONSOLE',
  authDomain: 'deluxe-go.firebaseapp.com',
  projectId: 'deluxe-go',
  storageBucket: 'deluxe-go.appspot.com',
  messagingSenderId: 'PASTE_FROM_CONSOLE',
  appId: 'PASTE_FROM_CONSOLE',
};

// True once the placeholders above have been replaced with real values.
export const firebaseConfigured =
  !Object.values(firebaseConfig).some((v) => String(v).includes('PASTE_FROM_CONSOLE'));
