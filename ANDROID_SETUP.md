# Android (Capacitor) & PC (Electron) setup

## Android — camera + storage permissions
After running `npx cap add android`, edit `android/app/src/main/AndroidManifest.xml`
and add these inside the `<manifest>` tag:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

Then install the community barcode plugin (recommended for reliable Android
scanning; the built-in `BarcodeDetector` fallback is used when the plugin is
absent). It is already a project dependency and is wired into the POS "Scan"
button via `src/lib/scanner.ts` (`scanBarcode()`): on native Android it opens
the device camera through MLKit and waits for a barcode; on the web it falls
back to the `BarcodeDetector` camera overlay.

After running `npx cap add android` for the first time, bundle the plugin into
the native project:

```bash
npx cap sync android
```

The plugin requires the `CAMERA` permission (already listed below) and Google
Play services on the device for MLKit scanning.

## PC — USB / Bluetooth barcode scanners
Any HID scanner (keyboard-emulation mode, which is the default) works out of
the box: it types the code into the focused search field and hits Enter, and
the app also captures fast keystrokes globally when nothing is focused (see
`src/lib/scanner.ts`, `attachGlobalScanner`).

## Firebase Realtime Database — Security Rules (REQUIRED)

The app uses Firebase Realtime Database in two ways: **live sync** (PC → Android)
and **cloud backups**. Both are locked down with Firebase Security Rules so that
only **ADMIN** accounts can read the business data, while every authenticated
user (including employees) can still push their local changes.

> ⚠️ The rules in `database.rules.json` must be deployed, or the sync engine will
> be unable to read/write and backups will not work.

### Firebase paths
| Path | Who can read | Who can write | Purpose |
| --- | --- | --- | --- |
| `app_data/{storeId}/products/*` (and every collection) | **ADMIN only** | any authenticated user | Live sync of POS data (PC → Firebase → Android) |
| `app_data/{storeId}/settings` | **ADMIN only** | any authenticated user | Shared store settings |
| `app_data/{storeId}/activity/*` | **ADMIN only** | any authenticated user | Activity log |
| `app_data/{storeId}/presence/{uid}` | **ADMIN only** | that user | Online status |
| `app_data/{storeId}/backups/{pushId}` | **ADMIN only** | **ADMIN only** | Cloud backups (PC → Phone) — multiple, never overwritten |
| `sync_rooms/{roomId}/ops/{opId}` | **ADMIN only** | any authenticated user | Idempotent op queue |
| `app_data/{storeId}/_` (placeholder) | owner (uid==storeId) | owner | Lets the first admin claim the node |

`{storeId}` comes from `storeId` in `localStorage` (key `stock-manager-store-id-v1`,
default `abdou-cosmetics`). `{uid}` is the Firebase Auth user id.

### Deploy the rules
1. Install the Firebase CLI: `npm i -g firebase-tools`
2. Login: `firebase login`
3. Set your project in `.firebaserc` (`projects.default`) — the repo default is
   `abdou-cosmetics`.
4. Deploy only the RTDB rules:
   ```bash
   firebase deploy --only database
   ```
   (The `firebase.json` in the repo already points `database.rules` at
   `database.rules.json`.)

### Admin gating notes
- The authenticated user's **role** is stored locally (`localStorage` key
  `stock-manager-users-v1`). For the Security Rules, "admin" is enforced through
  the `customClaims.admin === true` claim — set it once with the Admin SDK:
  ```js
  // Node (Admin SDK) — run once per admin
  const admin = require("firebase-admin");
  admin.auth().setCustomUserClaims(uid, { admin: true });
  ```
- **Android admin app**: only sign in with an account that has the `admin` claim.
  Once the claim is set, the Android app can read all data and download/restore
  cloud backups.
- **Employee devices**: they can still create sales etc. (writes are allowed),
  but they cannot read the business collections and the PC sync engine does not
  attach inbound listeners for them (avoids console permission errors).

## Cloud backups (PC ↔ Phone) — how it works
- On the PC app → Settings → **Firebase** → "Backup PC data to cloud": pushes a
  full snapshot to `app_data/{storeId}/backups/{pushId}`. Each backup is a new
  push id, so **nothing is ever overwritten** and multiple backups accumulate.
- On the Android admin app: sign in as the admin, then download the **latest**
  backup (or a chosen one) and restore it. Restoring only **merges** records
  that don't already exist locally and fills missing settings — your current
  data is always preserved and a safety backup is taken first.
- Backups are **never auto-restored**; an admin always confirms the restore.

