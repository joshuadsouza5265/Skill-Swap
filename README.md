# SkillSwap — Simple Firebase Demo

This version intentionally uses only:

- Firebase Authentication
- Firestore
- The browser frontend (`public/app.js`)

It does **not** use Cloud Functions, Firebase Hosting, or the Blaze plan.

## Demo flow

1. Create two accounts.
2. User A finds User B and sends a session request.
3. User B sees the request in the dashboard and gets an approval reminder.
4. User B approves and enters their contact details.
5. The session becomes scheduled.
6. Clicking a session opens its details, including both users' contact details after approval.
7. Around 15 minutes before the session, the app shows a reminder while the dashboard is open.
8. After the session end time, the app asks both users to confirm.
9. Each user selects **Yes** or **No**. These are stored as `true` / `false`.
10. Points are added only when **both confirmation values are true**. Each user receives +100 once.

## Firebase setup — no CLI required

In Firebase Console:

### Authentication

Enable:

- Authentication → Sign-in method → Email/Password

### Firestore

Create the Firestore database.

### Firestore Rules

Open:

Firestore Database → Rules

Copy the contents of `firestore.rules` into the Firebase Console and click **Publish**.

### Firebase config

Put your Firebase web app configuration in:

`public/firebase-config.js`

## Running the website

You can run the `public` folder with the same local server you were already using.

No `firebase deploy` command is required for this version.

## Important demo limitation

Because this version deliberately avoids Cloud Functions, the session reward logic runs in the client. It is suitable for a college demonstration and keeps the database simple, but it is not intended as production-grade reward security.
