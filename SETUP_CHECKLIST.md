# Final Setup Checklist

- [ ] Firebase Authentication → Email/Password enabled
- [ ] Firestore database created
- [ ] `public/firebase-config.js` contains your Firebase web config
- [ ] Paste `firestore.rules` into Firebase Console → Firestore → Rules → Publish
- [ ] No Cloud Functions required
- [ ] No Firebase Hosting required
- [ ] No Blaze/payment upgrade required
- [ ] Create account A
- [ ] Create account B
- [ ] Send a session request from A to B
- [ ] Approve from B and enter B contact details
- [ ] Open session details and verify both contact details are visible
- [ ] Wait until after the session end time
- [ ] Confirm YES from both accounts
- [ ] Verify +100 points on each account
- [ ] Repeat with one NO and verify no session reward is added
