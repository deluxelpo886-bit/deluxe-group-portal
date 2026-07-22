# Deluxe Admin Portal (web)

A **staff-only** web app for running the Deluxe service operation, connected to
the **same** Firebase project as the mobile app (`deluxego-17b2a`). Built with
Vite + React + the Firebase JS SDK. Designed for a computer or tablet.

## Screens

1. **Staff login** — email/password only, no public sign-up.
2. **Requests dashboard** — every customer service request with search + status
   filters, and a detail view where staff can:
   - build and **send a quote** (line items, VAT 5%, subtotal / VAT / total),
   - **mark a request for inspection** with a zone-based fee,
   - move the job through its stages: **New → Quoted / Inspection → Approved →
     Technician En Route → In Progress → Completed** (plus Declined / Cancelled).
3. **Zones** — add / edit zones and their inspection fees.
4. **Customers** — registered customers (derived from their requests); for
   companies, record the Trade License / VAT details and mark them **Verified**.

## How staff access works (important)

Firebase has a single user pool, and the mobile app lets customers sign
themselves up. To keep staff separate, this portal only lets someone in if
their email is listed in a **`staff`** collection in Firestore. The security
rules also stop non-staff from reading admin data. So a customer can never get
into the back office, even with a valid Firebase login.

### Create a staff member (console, ~1 minute)

1. **Create the login:** Firebase console → **Authentication → Users → Add user**
   → enter the staff email + a password → **Add user**.
   https://console.firebase.google.com/project/deluxego-17b2a/authentication/users
2. **Grant staff access:** Firebase console → **Firestore → Data** →
   collection **`staff`** → **Add document**:
   - **Document ID:** the staff email **in lowercase** (e.g. `ops@deluxe.com`)
   - Fields (optional but nice): `name` (string), `role` (string, e.g. `admin`)
   https://console.firebase.google.com/project/deluxego-17b2a/firestore

   Repeat step 1–2 for each staff member. To revoke access, delete their
   `staff` document (and/or disable the Authentication user).

## Publish the updated security rules (required, once)

This portal needs staff to read **all** requests, manage zones, and verify
customers, so the Firestore rules were extended. Publish them:

1. Open **Firestore → Rules**:
   https://console.firebase.google.com/project/deluxego-17b2a/firestore/rules
2. Replace the contents with the rules in **`mobile/firestore.rules`** (that
   file is the single source of truth for the whole project — mobile + admin).
3. Click **Publish**.

## Data model (Firestore)

| Collection | Written by | Notes |
|---|---|---|
| `serviceRequests` | mobile app (create) + admin (quote/inspection/status) | shared |
| `zones` | admin | `{ name, inspectionFee }` |
| `customers` | admin | `{ type, companyName, tradeLicenseNo, vatNo, verified, … }` keyed by uid |
| `staff` | you (console) | doc id = lowercase email; gates admin access |

## Run it locally (needs a terminal)

```bash
cd admin
npm install
npm run dev      # opens a local dev server
npm run build    # production build into admin/dist/
```

## Hosting

`npm run build` produces a static site in `admin/dist/` that can be hosted
anywhere (Firebase Hosting, GitHub Pages, etc.). If you host it on a domain
other than the project's own `*.web.app` / `*.firebaseapp.com`, add that domain
under **Authentication → Settings → Authorized domains** in the Firebase console
so login works there.
