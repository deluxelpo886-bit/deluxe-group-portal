# Deluxe Go — mobile app

An Expo (React Native) app for **Deluxe** customers to browse services and submit
service requests on their phone, backed by the Firebase project **`deluxe-go`**.

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
  app.json                   # Expo config (name "Deluxe Go", project deluxe-go)
  src/
    firebaseConfig.js        # <-- paste your Firebase web config here
    firebase.js              # Firebase app / auth / firestore init
    theme.js                 # shared colours
    data/services.js         # categories + services catalogue
    context/AuthContext.js   # auth state provider
    components/ui.js         # Field / Button / Card
    screens/                 # Login, Home, NewRequest, MyRequests
  .firebaserc                # pins the CLI to project "deluxe-go"
  firebase.json              # Firestore rules + indexes config
  firestore.rules            # per-user access rules for serviceRequests
```

## Finish the Firebase connection (3 steps, done on your machine)

The Firebase CLI and all project files are already set up. Two things need
**your** Google login, which can only be done interactively:

### 1. Log in to the Firebase CLI

```bash
firebase login
```

This opens a browser to authenticate with the Google account that owns the
`deluxe-go` project. (The project is already selected — see `.firebaserc`.)
Verify with:

```bash
cd mobile
firebase use          # should print: Now using project deluxe-go
```

### 2. Add your Firebase web config

In the [Firebase console](https://console.firebase.google.com/project/deluxe-go/settings/general)
→ **Your apps** → add/open a **Web app**, then copy `apiKey`,
`messagingSenderId` and `appId` into **`src/firebaseConfig.js`** (the other
fields are already filled in for the `deluxe-go` project).

### 3. Enable the sign-in methods & deploy rules

In the console → **Authentication → Sign-in method**, enable:
- **Email/Password**
- **Phone**

Then deploy the Firestore security rules:

```bash
cd mobile
firebase deploy --only firestore:rules
```

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
