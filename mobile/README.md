# Deluxe Go — mobile app

An Expo (React Native) app for **Deluxe** customers to browse services and submit
service requests on their phone, backed by the Firebase project
**`deluxego-17b2a`**.

It shares the industrial cream / navy / gold identity of the Deluxe Service
Portal web app and the same service catalogue (Repair & Rewinding, Marine,
Testing, Rental, Fleet).

## What's built

- **Login screen** — email/password (with sign-up) **and** phone number / SMS OTP,
  via Firebase Authentication.
- **Home screen** — greeting plus a grid of the five service categories, a
  shortcut to "My service requests", and a "Submit a service request" button.
- **New request screen** — pick a category and service, fill in equipment
  details, site, preferred date, urgency and description; writes to the
  `serviceRequests` collection in Firestore.
- **My requests screen** — live list of the signed-in user's requests with
  colour-coded status badges (New, Approved, Completed, …).

## Project layout

```
mobile/
  App.js                     # navigation + auth-gated routing
  app.json                   # Expo config (app name "Deluxe Go")
  src/
    firebaseConfig.js        # Firebase web config for deluxego-17b2a (filled in)
    firebase.js              # Firebase app / auth / firestore init
    theme.js                 # shared colours
    data/services.js         # categories + services catalogue
    context/AuthContext.js   # auth state provider
    components/ui.js         # Field / Button / Card
    screens/                 # Login, Home, NewRequest, MyRequests
  .firebaserc                # pins the Firebase CLI to project deluxego-17b2a
  firebase.json              # Firestore rules + indexes config
  firestore.rules            # per-user access rules for serviceRequests
```

## Firebase setup status

- ✅ **Connection keys** — already filled into `src/firebaseConfig.js`
  (project `deluxego-17b2a`).
- ⏳ **Sign-in methods** — enable **Email/Password** and **Phone** in the
  console (see below).
- ⏳ **Firestore security rules** — publish the rules from `firestore.rules`
  (see below).

These last two are done with clicks in the [Firebase
console](https://console.firebase.google.com/project/deluxego-17b2a) — no
terminal required.

### Enable the sign-in methods (console)

1. Open **Authentication → Sign-in method**:
   https://console.firebase.google.com/project/deluxego-17b2a/authentication/providers
2. Enable **Email/Password**, then **Save**.
3. Enable **Phone**, then **Save**. (Phone/SMS sign-in requires the project to
   be on the **Blaze** pay-as-you-go plan; the free tier includes a monthly SMS
   allowance.)

### Publish the Firestore security rules (console)

1. Open **Firestore Database → Rules**:
   https://console.firebase.google.com/project/deluxego-17b2a/firestore/rules
2. Replace the contents with the rules in `mobile/firestore.rules`.
3. Click **Publish**.

*(If you ever do get access to a terminal, `firebase deploy --only
firestore:rules` from the `mobile/` folder does the same thing — `.firebaserc`
already points at `deluxego-17b2a`.)*

## Run the app

```bash
cd mobile
npm install        # already run once in this repo
npm start          # then press i / a, or scan the QR with Expo Go
```

## Notes

- Phone/OTP uses `expo-firebase-recaptcha`, which shows an invisible reCAPTCHA
  in **Expo Go / the managed workflow**. For a production standalone build you
  may switch to the native `@react-native-firebase/auth` phone flow.
- Firestore security rules currently scope each request to its creator
  (`uid`). Add staff/admin roles when you build the back-office side.
