import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let unsubscribeProfile = null;
let reminderTimer = null;
const $ = (selector) => document.querySelector(selector);

const getValue = (selector, fallback = "") => {
  const element = $(selector);
  return element ? element.value ?? fallback : fallback;
};

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[char]));

const split = (value) => String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
const initials = (name) => String(name || "User").trim().split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "U";

function toast(message) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
}

function showError(element, error) {
  if (!element) return;
  console.error(error);
  element.innerHTML = `<div class="error">${esc(firebaseError(error))}</div>`;
}

function firebaseError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/invalid-login-credentials": "Incorrect email or password.",
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/user-not-found": "No account exists with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "permission-denied": "Firebase denied this action. Check your Firestore rules.",
  };
  return messages[code] || error?.message || "Something went wrong. Please try again.";
}

function formatDate(value) {
  if (!value) return "Date not set";
  let date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function toDateTimeLocal(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function currentUid() {
  return auth.currentUser?.uid || currentUser?.uid || null;
}

function partnerId(session) {
  const uid = currentUid();
  return Array.isArray(session.userIds) ? session.userIds.find((id) => id !== uid) : null;
}

function statusLabel(status) {
  return ({
    pending_approval: "Awaiting approval",
    scheduled: "Scheduled",
    in_progress: "In progress",
    awaiting_confirmation: "Confirm session",
    completed: "Completed",
    rejected: "Rejected"
  })[status] || status || "Unknown";
}

function contactFor(session, uid) {
  return session.contactDetailsByUser?.[uid] || "Not provided";
}

function sessionEnd(session) {
  const start = session.scheduledAt?.toDate ? session.scheduledAt.toDate() : new Date(session.scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + Number(session.duration || 60) * 60000);
}

function sessionHasEnded(session) {
  const end = sessionEnd(session);
  return !!end && new Date() >= end;
}

function reminderKey(sessionId, type) {
  return `skillswap-reminder-${sessionId}-${type}`;
}

function showReminderOnce(session, type, message) {
  const key = reminderKey(session.id, type);
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");
  toast(message);
}

/* =========================================================
   MODALS
========================================================= */
function openModal(type, data = {}) {
  const backdrop = $("#modalBackdrop");
  if (!backdrop) return;
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  renderModal(type, data);
}

function closeModal() {
  const backdrop = $("#modalBackdrop");
  if (!backdrop) return;
  backdrop.classList.remove("open");
  backdrop.setAttribute("aria-hidden", "true");
}

window.openModal = openModal;
window.closeModal = closeModal;

$("#modalClose")?.addEventListener("click", closeModal);
$("#modalBackdrop")?.addEventListener("click", (event) => {
  if (event.target.id === "modalBackdrop") closeModal();
});

function renderModal(type, data = {}) {
  const container = $("#modalContent");
  if (!container) return;

  if (type === "login") {
    container.innerHTML = `
      <h2>Welcome back</h2>
      <p>Sign in to manage your SkillSwap profile and learning activity.</p>
      <form class="form" id="authForm">
        <div class="field"><label>Email</label><input id="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>Password</label><input id="password" type="password" required autocomplete="current-password"></div>
        <div id="formError"></div>
        <button class="btn primary" type="submit">Log in</button>
        <div class="helper">New here? <a href="#" id="switchAuth">Create an account</a></div>
      </form>`;
  }

  if (type === "signup") {
    container.innerHTML = `
      <h2>Create your profile</h2>
      <p>Tell the community what you can teach and what you want to learn.</p>
      <form class="form" id="authForm">
        <div class="form-grid">
          <div class="field"><label>Name</label><input id="name" required autocomplete="name"></div>
          <div class="field"><label>Email</label><input id="email" type="email" required autocomplete="email"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Password</label><input id="password" type="password" minlength="6" required autocomplete="new-password"></div>
          <div class="field"><label>Availability</label><select id="availability"><option>Weekday mornings</option><option>Weekday evenings</option><option>Weekends</option><option>Flexible</option></select></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Skills you can teach</label><input id="teach" placeholder="Java, Excel, Figma" required></div>
          <div class="field"><label>Skills you want to learn</label><input id="learn" placeholder="Python, UI/UX" required></div>
        </div>
        <div class="field"><label>About you</label><textarea id="bio" placeholder="A short introduction..."></textarea></div>
        <div id="formError"></div>
        <button class="btn primary" type="submit">Create free profile</button>
        <div class="helper">Already have an account? <a href="#" id="switchAuth">Log in</a></div>
      </form>`;
  }

  if (type === "profile") {
    const profile = currentUser?.profile || {};
    container.innerHTML = `
      <h2>Edit profile</h2>
      <p>Keep your availability and skill exchange preferences current.</p>
      <form class="form" id="profileForm">
        <div class="form-grid">
          <div class="field"><label>Name</label><input id="name" value="${esc(profile.name)}" required></div>
          <div class="field"><label>Availability</label><select id="availability">
            ${["Weekday mornings", "Weekday evenings", "Weekends", "Flexible"].map((x) => `<option ${profile.availability === x ? "selected" : ""}>${x}</option>`).join("")}
          </select></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Skills you can teach</label><input id="teach" value="${esc((profile.teach || []).join(", "))}" required></div>
          <div class="field"><label>Skills you want to learn</label><input id="learn" value="${esc((profile.learn || []).join(", "))}" required></div>
        </div>
        <div class="field"><label>About you</label><textarea id="bio">${esc(profile.bio || "")}</textarea></div>
        <div id="formError"></div>
        <button class="btn primary" type="submit">Save changes</button>
      </form>`;
  }

  if (type === "session") {
    container.innerHTML = `
      <h2>Schedule a session</h2>
      <p>This will send a session request to ${esc(data.name)}. They must approve it before the session can start.</p>
      <form class="form" id="sessionForm">
        <div class="profile-preview"><div class="member-avatar">${initials(data.name)}</div><div><strong>${esc(data.name)}</strong><small>${esc((data.teach || []).join(" · "))}</small></div></div>
        <div class="form-grid">
          <div class="field"><label>Date & time</label><input id="scheduledAt" type="datetime-local" required></div>
          <div class="field"><label>Duration</label><select id="duration"><option value="30">30 minutes</option><option value="60" selected>60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Your topic</label><input id="topicA" required placeholder="What will you teach?"></div>
          <div class="field"><label>Partner topic</label><input id="topicB" required placeholder="What will they teach?"></div>
        </div>
        <div class="field"><label>Assignment for next session</label><input id="assignmentTitle" placeholder="Optional task"></div>
        <div class="field"><label>Your contact details</label><textarea id="contactDetails" placeholder="Email or phone number for your partner"></textarea></div>
        <div id="formError"></div>
        <button class="btn primary" type="submit">Send session request</button>
      </form>`;
  }

  if (type === "approval") {
    container.innerHTML = `
      <h2>Session request</h2>
      <p>${esc(data.requesterName || "A member")} wants to schedule a session with you.</p>
      <div class="list">
        <div class="list-item"><strong>${esc(data.topicA || "Skill exchange")}</strong><small>${esc(data.topicB || "")}</small></div>
        <div class="list-item"><strong>When</strong><small>${esc(formatDate(data.scheduledAt))} · ${Number(data.duration || 60)} min</small></div>
        <div class="list-item"><strong>Their contact details</strong><small>${esc(contactFor(data, data.createdBy))}</small></div>
      </div>
      <form class="form" id="approvalForm">
        <div class="field"><label>Your contact details</label><textarea id="approvalContact" required placeholder="Email or phone number so your partner can reach you"></textarea></div>
        <div id="formError"></div>
        <div class="form-grid">
          <button class="btn primary" type="submit">Approve session</button>
          <button class="btn outline" type="button" id="rejectSessionBtn">Reject</button>
        </div>
      </form>`;
  }

  if (type === "sessionDetails") {
    const uid = currentUid();
    const partner = data.partnerProfile || {};
    const partnerUid = partner.id || partnerId(data);
    const mine = contactFor(data, uid);
    const theirs = contactFor(data, partnerUid);
    container.innerHTML = `
      <h2>Session details</h2>
      <p>${esc(statusLabel(data.status))}</p>
      <div class="list">
        <div class="list-item"><strong>Date & time</strong><small>${esc(formatDate(data.scheduledAt))}</small></div>
        <div class="list-item"><strong>Duration</strong><small>${Number(data.duration || 60)} minutes</small></div>
        <div class="list-item"><strong>Your topic</strong><small>${esc(uid === data.createdBy ? data.topicA : data.topicB)}</small></div>
        <div class="list-item"><strong>Partner's topic</strong><small>${esc(uid === data.createdBy ? data.topicB : data.topicA)}</small></div>
        <div class="list-item"><strong>Partner</strong><small>${esc(partner.name || "SkillSwap member")}</small></div>
        <div class="list-item"><strong>Your contact</strong><small>${esc(mine)}</small></div>
        <div class="list-item"><strong>Partner contact</strong><small>${esc(theirs)}</small></div>
        ${data.assignmentTitle ? `<div class="list-item"><strong>Next assignment</strong><small>${esc(data.assignmentTitle)}</small></div>` : ""}
      </div>
      ${data.status === "awaiting_confirmation" ? `<button class="btn primary full" id="confirmFromDetails">Confirm session</button>` : ""}`;
  }

  if (type === "confirm") {
    container.innerHTML = `
      <h2>Did the session happen?</h2>
      <p>Both participants must answer <strong>Yes</strong> before either person receives points.</p>
      <div class="form-grid">
        <button class="btn primary" id="confirmYes">Yes, we completed it</button>
        <button class="btn outline" id="confirmNo">No</button>
      </div>
      <div id="formError"></div>`;
  }

  if (type === "redeem") {
    container.innerHTML = `<h2>Reward milestone</h2><p>Once your wallet reaches 1,000 points, you can record a redemption request.</p><div class="form"><button class="btn primary" data-redeem="cash">Request cash redemption</button><button class="btn outline" data-redeem="course">Use as course discount</button></div>`;
  }

  if (type === "activity") {
    container.innerHTML = `<h2>Reward activity</h2><p>Your latest point events.</p><div id="activityList" class="list">Loading…</div>`;
  }

  bindModal(type, data);
}

function bindModal(type, data) {
  $("#switchAuth")?.addEventListener("click", (event) => {
    event.preventDefault();
    openModal(type === "login" ? "signup" : "login");
  });

  $("#authForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = $("#formError");
    if (errorElement) errorElement.innerHTML = "";
    try {
      if (type === "login") {
        await signInWithEmailAndPassword(auth, getValue("#email").trim(), getValue("#password"));
        closeModal();
        toast("Signed in successfully.");
      } else {
        const name = getValue("#name").trim();
        const email = getValue("#email").trim();
        const password = getValue("#password");
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: name });
        await setDoc(doc(db, "users", credential.user.uid), {
          name,
          email: credential.user.email,
          teach: split(getValue("#teach")),
          learn: split(getValue("#learn")),
          availability: getValue("#availability"),
          bio: getValue("#bio").trim(),
          points: 0,
          streak: 0,
          lastActivity: null,
          createdAt: serverTimestamp()
        });
        closeModal();
        toast("Profile created successfully.");
      }
    } catch (error) { showError(errorElement, error); }
  });

  $("#profileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = $("#formError");
    if (errorElement) errorElement.innerHTML = "";
    if (!auth.currentUser) return;
    try {
      const uid = auth.currentUser.uid;
      const name = getValue("#name").trim();
      await updateDoc(doc(db, "users", uid), {
        name,
        teach: split(getValue("#teach")),
        learn: split(getValue("#learn")),
        availability: getValue("#availability"),
        bio: getValue("#bio").trim()
      });
      await updateProfile(auth.currentUser, { displayName: name });
      closeModal();
      toast("Profile updated successfully.");
    } catch (error) { showError(errorElement, error); }
  });

  $("#sessionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = $("#formError");
    if (errorElement) errorElement.innerHTML = "";
    if (!auth.currentUser) return;
    try {
      const scheduledAt = parseDateTimeLocal(getValue("#scheduledAt"));
      const duration = Number(getValue("#duration", "60"));
      const topicA = getValue("#topicA").trim();
      const topicB = getValue("#topicB").trim();
      const assignmentTitle = getValue("#assignmentTitle").trim();
      const contactDetails = getValue("#contactDetails").trim();

      if (!scheduledAt || scheduledAt <= new Date()) throw new Error("Please choose a future date and time.");
      if (!topicA || !topicB) throw new Error("Please enter both session topics.");
      if (!contactDetails) throw new Error("Please enter your contact details.");
      if (!data?.id) throw new Error("The selected partner could not be found.");

      const sessionReference = await addDoc(collection(db, "sessions"), {
        userIds: [auth.currentUser.uid, data.id],
        createdBy: auth.currentUser.uid,
        scheduledAt: Timestamp.fromDate(scheduledAt),
        duration,
        topicA,
        topicB,
        contactDetailsByUser: { [auth.currentUser.uid]: contactDetails },
        status: "pending_approval",
        approvalRequired: true,
        confirmationRequired: false,
        confirmations: { [auth.currentUser.uid]: null, [data.id]: null },
        rewardEligible: false,
        pointsAwarded: false,
        reminderBefore: false,
        reminderAfter: false,
        assignmentTitle: assignmentTitle || "",
        createdAt: serverTimestamp()
      });

      if (assignmentTitle) {
        await addDoc(collection(db, "assignments"), {
          sessionId: sessionReference.id,
          userId: auth.currentUser.uid,
          partnerId: data.id,
          title: assignmentTitle,
          description: "",
          completed: false,
          createdAt: serverTimestamp()
        });
      }

      closeModal();
      toast("Session request sent. They must approve it before the session starts.");
      await loadDashboard();
    } catch (error) { showError(errorElement, error); }
  });

  $("#approvalForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = $("#formError");
    if (errorElement) errorElement.innerHTML = "";
    try {
      const contactDetails = getValue("#approvalContact").trim();
      if (!contactDetails) throw new Error("Please enter your contact details.");
      const sessionRef = doc(db, "sessions", data.id);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) throw new Error("Session not found.");
      const session = snap.data();
      if (!Array.isArray(session.userIds) || !session.userIds.includes(currentUid())) throw new Error("You are not part of this session.");
      if (session.createdBy === currentUid()) throw new Error("Only the person receiving the request can approve it.");
      if (session.status !== "pending_approval") throw new Error("This session request is no longer waiting for approval.");
      const contacts = { ...(session.contactDetailsByUser || {}) };
      contacts[currentUid()] = contactDetails;
      await updateDoc(sessionRef, {
        contactDetailsByUser: contacts,
        status: "scheduled",
        approvalRequired: false,
        approved: true,
        approvedAt: serverTimestamp(),
        confirmationRequired: false,
        confirmations: { [session.userIds[0]]: null, [session.userIds[1]]: null },
        reminderBefore: false,
        reminderAfter: false
      });
      closeModal();
      toast("Session approved. Your contact details were shared with your partner.");
      await loadDashboard();
    } catch (error) { showError(errorElement, error); }
  });

  $("#rejectSessionBtn")?.addEventListener("click", async () => {
    try {
      const sessionRef = doc(db, "sessions", data.id);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) throw new Error("Session not found.");
      const session = snap.data();
      if (session.createdBy === currentUid()) throw new Error("You cannot reject your own request.");
      await updateDoc(sessionRef, { status: "rejected", approvalRequired: false });
      closeModal();
      toast("Session request rejected.");
      await loadDashboard();
    } catch (error) { toast(firebaseError(error)); }
  });

  $("#confirmFromDetails")?.addEventListener("click", () => {
    closeModal();
    openModal("confirm", data);
  });

  $("#confirmYes")?.addEventListener("click", () => submitConfirmation(data.id, true));
  $("#confirmNo")?.addEventListener("click", () => submitConfirmation(data.id, false));

  if (type === "activity") loadActivity();
  document.querySelectorAll("[data-redeem]").forEach((button) => {
    button.onclick = () => toast("Redemption is available at the 1,000-point milestone.");
  });
}

async function submitConfirmation(sessionId, completed) {
  const errorElement = $("#formError");
  try {
    const uid = currentUid();
    if (!uid) throw new Error("Please log in first.");

    const sessionRef = doc(db, "sessions", sessionId);
    const userRef = doc(db, "users", uid);

    const result = await runSimpleRewardTransaction(sessionRef, userRef, uid, completed);

    closeModal();
    if (result.rewardedNow) {
      toast("Both users said YES. 100 points have been added to your wallet.");
    } else if (result.bothNoReward) {
      toast("The session is complete, but no points were awarded because both users did not say YES.");
    } else if (result.waitingForPartner) {
      toast("Your answer is saved. Waiting for your partner to confirm.");
    } else {
      toast("Your confirmation was saved.");
    }

    await loadDashboard();
    await loadWallet();
  } catch (error) {
    showError(errorElement, error);
  }
}

async function runSimpleRewardTransaction(sessionRef, userRef, uid, completed) {
  return runTransaction(db, async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists()) throw new Error("Session not found.");

    const session = sessionSnapshot.data();
    if (!Array.isArray(session.userIds) || session.userIds.length !== 2 || !session.userIds.includes(uid)) {
      throw new Error("You are not a participant in this session.");
    }
    if (session.status === "pending_approval") throw new Error("The other participant must approve the session first.");
    if (session.status === "rejected") throw new Error("This session was rejected.");

    const end = sessionEnd(session);
    if (!end || new Date() < end) throw new Error("You can confirm the session after its scheduled time has ended.");

    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists()) throw new Error("Your profile could not be found.");

    const confirmations = { ...(session.confirmations || {}) };
    if (confirmations[uid] !== null && confirmations[uid] !== undefined) {
      return {
        alreadyAnswered: true,
        waitingForPartner: !(confirmations[session.userIds.find((id) => id !== uid)] !== null && confirmations[session.userIds.find((id) => id !== uid)] !== undefined),
        bothNoReward: confirmations[session.userIds[0]] === false || confirmations[session.userIds[1]] === false,
        rewardedNow: false
      };
    }

    confirmations[uid] = completed;
    const userA = session.userIds[0];
    const userB = session.userIds[1];
    const bothAnswered = confirmations[userA] !== null && confirmations[userA] !== undefined && confirmations[userB] !== null && confirmations[userB] !== undefined;
    const bothYes = confirmations[userA] === true && confirmations[userB] === true;
    const rewardGiven = { ...(session.rewardGivenByUser || {}) };

    if (bothAnswered && bothYes && !rewardGiven[uid]) {
      const userData = userSnapshot.data();
      const points = Number(userData.points || 0);
      transaction.update(userRef, {
        points: points + 100,
        lastActivity: serverTimestamp()
      });
      rewardGiven[uid] = true;
    }

    transaction.update(sessionRef, {
      confirmations,
      rewardGivenByUser: rewardGiven,
      confirmationRequired: !bothAnswered,
      rewardEligible: bothAnswered && bothYes,
      rewarded: rewardGiven[userA] === true && rewardGiven[userB] === true,
      status: bothAnswered ? "completed" : "awaiting_confirmation",
      completedAt: bothAnswered ? serverTimestamp() : (session.completedAt || null)
    });

    return {
      rewardedNow: bothAnswered && bothYes && !session.rewardGivenByUser?.[uid],
      waitingForPartner: !bothAnswered,
      bothNoReward: bothAnswered && !bothYes
    };
  });
}

/* =========================================================
   NAVIGATION / AUTH
========================================================= */
function updateNavigation(user) {
  const loginButtons = [$("#loginBtn"), $("#mobileLogin")];
  const signupButtons = [$("#signupBtn"), $("#mobileSignup"), $("#heroSignup"), $("#ctaSignup")];

  loginButtons.forEach((button) => { if (button) button.textContent = user ? "Log out" : "Log in"; });
  signupButtons.forEach((button) => {
    if (!button) return;
    button.textContent = user
      ? (button.id === "ctaSignup" ? "Open dashboard" : "My dashboard")
      : (button.id === "ctaSignup" ? "Join SkillSwap" : button.id === "heroSignup" ? "Create your profile" : "Join free");
  });

  [$("#loginBtn"), $("#mobileLogin")].filter(Boolean).forEach((button) => {
    button.onclick = () => auth.currentUser ? logout() : openModal("login");
  });

  signupButtons.filter(Boolean).forEach((button) => {
    button.onclick = () => auth.currentUser
      ? $("#dashboard")?.scrollIntoView({ behavior: "smooth" })
      : openModal("signup");
  });
}

async function logout() {
  try { await signOut(auth); closeModal(); toast("You have been logged out."); }
  catch (error) { toast(firebaseError(error)); }
}

async function getProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? { id: uid, ...snapshot.data() } : null;
}

/* =========================================================
   SKILL SEARCH
========================================================= */
async function loadSkills() {
  const search = getValue("#skillSearch").trim().toLowerCase();
  const state = $("#skillsState");
  const grid = $("#skillGrid");
  if (!state || !grid) return;

  if (!currentUser) {
    state.textContent = "Create an account to explore members and skills.";
    state.style.display = "block";
    grid.innerHTML = "";
    return;
  }

  try {
    const snapshot = await getDocs(query(collection(db, "users"), orderBy("name")));
    const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((user) => user.id !== currentUid())
      .filter((user) => {
        const searchable = `${user.name || ""} ${(user.teach || []).join(" ")} ${(user.learn || []).join(" ")} ${user.bio || ""}`.toLowerCase();
        return !search || searchable.includes(search);
      });

    if (!users.length) {
      state.style.display = "block";
      state.textContent = search ? "No members match that search yet." : "No other members have joined yet — invite a friend to create the first profile.";
      grid.innerHTML = "";
      return;
    }

    state.style.display = "none";
    grid.innerHTML = users.map((user) => `
      <article class="skill-card">
        <div class="skill-card-top"><div class="member"><div class="member-avatar">${initials(user.name)}</div><div class="member-info"><strong>${esc(user.name || "Member")}</strong><small>Wants to learn ${(user.learn || []).slice(0, 2).map(esc).join(" · ") || "new skills"}</small></div></div><span class="availability">${esc(user.availability || "Flexible")}</span></div>
        <h3>${esc((user.teach || [])[0] || "Skills to share")}</h3>
        <p>${esc(user.bio || "Ready to exchange knowledge one-on-one.")}</p>
        <div class="chips">${(user.teach || []).slice(0, 4).map((skill) => `<span class="chip">${esc(skill)}</span>`).join("")}</div>
        <button class="btn outline" data-connect="${user.id}">View & connect</button>
      </article>`).join("");

    document.querySelectorAll("[data-connect]").forEach((button) => {
      button.onclick = () => {
        const user = users.find((item) => item.id === button.dataset.connect);
        if (user) openModal("session", user);
      };
    });
  } catch (error) {
    console.error("Could not load users:", error);
    state.style.display = "block";
    state.textContent = "Could not load members. Check your Firestore rules.";
    grid.innerHTML = "";
    toast(firebaseError(error));
  }
}

/* =========================================================
   DASHBOARD
========================================================= */
async function loadDashboard() {
  const dashboard = $("#dashboardContent");
  if (!dashboard) return;

  if (!currentUser) {
    dashboard.innerHTML = `<div class="state-card">Your dashboard will appear here after you sign in.</div>`;
    if ($("#profileBtn")) $("#profileBtn").style.display = "none";
    if ($("#dashboardSubtitle")) $("#dashboardSubtitle").textContent = "Sign in to manage your profile, connections and sessions.";
    return;
  }

  if ($("#profileBtn")) $("#profileBtn").style.display = "block";
  const profile = currentUser.profile || {};

  try {
    const [sessionsSnapshot, assignmentsSnapshot, connectionsSnapshot] = await Promise.all([
      getDocs(query(collection(db, "sessions"), where("userIds", "array-contains", currentUid()))),
      getDocs(query(collection(db, "assignments"), where("userId", "==", currentUid()))),
      getDocs(query(collection(db, "connections"), where("userIds", "array-contains", currentUid())))
    ]);

    const sessions = sessionsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const assignments = assignmentsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const connections = connectionsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    const pendingIncoming = sessions.filter((s) => s.status === "pending_approval" && s.createdBy !== currentUid());
    const pendingOutgoing = sessions.filter((s) => s.status === "pending_approval" && s.createdBy === currentUid());
    const now = new Date();
    const upcoming = sessions.filter((s) => !["completed", "rejected"].includes(s.status)).map((s) => ({
      ...s,
      displayStatus: s.status === "pending_approval" ? s.status : (sessionHasEnded(s) ? "awaiting_confirmation" : s.status)
    })).sort((a, b) => {
      const da = a.scheduledAt?.toDate ? a.scheduledAt.toDate() : new Date(a.scheduledAt);
      const dbb = b.scheduledAt?.toDate ? b.scheduledAt.toDate() : new Date(b.scheduledAt);
      return da - dbb;
    }).slice(0, 6);
    const pendingAssignments = assignments.filter((a) => !a.completed).slice(0, 4);

    if ($("#dashboardSubtitle")) $("#dashboardSubtitle").textContent = `Welcome, ${profile.name || auth.currentUser.displayName || auth.currentUser.email}. Manage your exchange from one place.`;

    const pendingHtml = (pendingIncoming.length || pendingOutgoing.length) ? `
      <div class="dash-card">
        <h3>Session requests</h3>
        <div class="list">
          ${pendingIncoming.map((session) => `
            <div class="list-item">
              <strong>${esc(session.topicA)} ↔ ${esc(session.topicB)}</strong>
              <small>${esc(formatDate(session.scheduledAt))} · ${Number(session.duration || 60)} min
                <button class="small-complete" data-approve-session="${session.id}">Review & approve</button>
              </small>
            </div>`).join("")}
          ${pendingOutgoing.map((session) => `
            <div class="list-item session-clickable" data-session-details="${session.id}">
              <strong>${esc(session.topicA)} ↔ ${esc(session.topicB)}</strong>
              <small>${esc(formatDate(session.scheduledAt))} · Waiting for partner approval</small>
            </div>`).join("")}
        </div>
      </div>` : "";

    const upcomingHtml = `
      <div class="dash-card">
        <h3>Upcoming sessions</h3>
        <div class="list">${upcoming.length ? upcoming.map((session) => `
          <div class="list-item session-clickable" data-session-details="${session.id}">
            <strong>${esc(session.topicA)} ↔ ${esc(session.topicB)}</strong>
            <small>${esc(formatDate(session.scheduledAt))} · ${Number(session.duration || 60)} min · ${esc(statusLabel(session.displayStatus || session.status))}
              ${(session.displayStatus || session.status) === "awaiting_confirmation" ? `<button class="small-complete" data-confirm-session="${session.id}">Confirm</button>` : ""}
            </small>
          </div>`).join("") : `<div class="list-item"><small>No sessions scheduled yet.</small></div>`}</div>
      </div>`;

    dashboard.innerHTML = `
      <div class="dash-card">
        <h3>Progress</h3>
        <div class="stat-row">
          <div class="stat-box"><strong>${Number(profile.points || 0)}</strong><small>Points</small></div>
          <div class="stat-box"><strong>${Number(profile.streak || 0)}</strong><small>Day streak</small></div>
          <div class="stat-box"><strong>${connections.length}</strong><small>Connections</small></div>
        </div>
        <div class="chips" style="margin-top:15px">
          ${(profile.teach || []).slice(0, 6).map((skill) => `<span class="chip">Teach: ${esc(skill)}</span>`).join("")}
          ${(profile.learn || []).slice(0, 6).map((skill) => `<span class="chip">Learn: ${esc(skill)}</span>`).join("")}
        </div>
      </div>
      ${pendingHtml}
      ${upcomingHtml}
      <div class="dash-card">
        <h3>Assignments</h3>
        <div class="list">${pendingAssignments.length ? pendingAssignments.map((assignment) => `
          <div class="list-item"><strong>${esc(assignment.title)}</strong><small>${esc(assignment.description || "")} <button class="small-complete" data-assignment="${assignment.id}">Complete</button></small></div>`).join("") : `<div class="list-item"><small>No pending assignments.</small></div>`}</div>
      </div>`;

    document.querySelectorAll("[data-approve-session]").forEach((button) => {
      button.onclick = async () => {
        const session = sessions.find((s) => s.id === button.dataset.approveSession);
        if (!session) return;
        const requester = await getProfile(session.createdBy);
        openModal("approval", { ...session, requesterName: requester?.name || "A member" });
      };
    });

    document.querySelectorAll("[data-session-details]").forEach((element) => {
      element.onclick = async (event) => {
        if (event.target.closest("button")) return;
        const session = sessions.find((s) => s.id === element.dataset.sessionDetails);
        if (!session) return;
        const partner = await getProfile(partnerId(session));
        openModal("sessionDetails", { ...session, partnerProfile: partner || {} });
      };
    });

    document.querySelectorAll("[data-confirm-session]").forEach((button) => {
      button.onclick = () => openModal("confirm", sessions.find((s) => s.id === button.dataset.confirmSession));
    });

    document.querySelectorAll("[data-assignment]").forEach((button) => {
      button.onclick = () => completeAssignment(button.dataset.assignment);
    });

    processFrontendReminders(sessions);
  } catch (error) {
    console.error("Dashboard error:", error);
    dashboard.innerHTML = `<div class="state-card"><strong>Dashboard could not load.</strong><br><br>${esc(firebaseError(error))}</div>`;
    toast(firebaseError(error));
  }
}

function processFrontendReminders(sessions) {
  const now = new Date();
  sessions.forEach((session) => {
    if (session.status === "pending_approval" && session.createdBy !== currentUid()) {
      showReminderOnce(session, "approval", "You have a new SkillSwap session request waiting for approval.");
      return;
    }
    if (session.status === "rejected" || session.status === "completed") return;

    const start = session.scheduledAt?.toDate ? session.scheduledAt.toDate() : new Date(session.scheduledAt);
    const end = sessionEnd(session);
    if (!start || Number.isNaN(start.getTime()) || !end) return;

    const minutesUntilStart = (start.getTime() - now.getTime()) / 60000;
    if (minutesUntilStart <= 15 && minutesUntilStart > 0) {
      showReminderOnce(session, "before", `Reminder: your SkillSwap session starts at ${formatDate(session.scheduledAt)}.`);
    }
    if (now >= end) {
      showReminderOnce(session, "after", "Your SkillSwap session has finished. Please confirm whether it was completed.");
    }
  });
}

async function completeAssignment(id) {
  try {
    await updateDoc(doc(db, "assignments", id), { completed: true, completedAt: serverTimestamp() });
    toast("Assignment completed.");
    await loadDashboard();
  } catch (error) { toast(firebaseError(error)); }
}

/* =========================================================
   WALLET / ACTIVITY
========================================================= */
async function loadWallet() {
  if (!currentUser) {
    if ($("#walletPoints")) $("#walletPoints").textContent = "0";
    if ($("#walletRemaining")) $("#walletRemaining").textContent = "Sign in to track rewards";
    if ($("#walletStreak")) $("#walletStreak").textContent = "— day streak";
    if ($("#walletStatus")) $("#walletStatus").textContent = "Not signed in";
    if ($("#walletProgress")) $("#walletProgress").style.width = "0%";
    return;
  }
  const profile = currentUser.profile || {};
  const points = Number(profile.points || 0);
  if ($("#walletPoints")) $("#walletPoints").textContent = points.toLocaleString();
  if ($("#walletRemaining")) $("#walletRemaining").textContent = points >= 1000 ? "Milestone unlocked" : `${(1000 - points).toLocaleString()} points to 1,000`;
  if ($("#walletStreak")) $("#walletStreak").textContent = `${profile.streak || 0} day streak`;
  if ($("#walletStatus")) $("#walletStatus").textContent = "Active";
  if ($("#walletProgress")) $("#walletProgress").style.width = `${Math.min(100, points / 10)}%`;
}

async function loadActivity() {
  const container = $("#activityList");
  if (!container || !currentUser) return;
  try {
    const snapshot = await getDocs(query(collection(db, "pointEvents"), where("userId", "==", currentUid()), orderBy("createdAt", "desc")));
    if (!snapshot.docs.length) {
      container.innerHTML = `<div class="list-item"><small>No reward activity yet.</small></div>`;
      return;
    }
    container.innerHTML = snapshot.docs.slice(0, 12).map((d) => {
      const event = d.data();
      return `<div class="list-item"><strong>${esc(event.reason || "Point activity")}</strong><small>+${Number(event.points || 0)} points</small></div>`;
    }).join("");
  } catch (error) {
    console.error("Activity error:", error);
    container.innerHTML = `<div class="list-item"><small>Could not load reward activity.</small></div>`;
  }
}

/* =========================================================
   THEME / NAVIGATION
========================================================= */
function themeInit() {
  if (localStorage.getItem("skillswap-theme") === "light") document.body.classList.add("light");
  updateThemeIcon();
}
function updateThemeIcon() {
  const button = $("#themeToggle");
  if (button) button.textContent = document.body.classList.contains("light") ? "☾" : "☀";
}

$("#themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("skillswap-theme", document.body.classList.contains("light") ? "light" : "dark");
  updateThemeIcon();
});

themeInit();

$("#menuBtn")?.addEventListener("click", () => $("#mobileNav")?.classList.toggle("open"));
$("#profileBtn")?.addEventListener("click", () => auth.currentUser ? openModal("profile") : openModal("login"));
$("#walletAction")?.addEventListener("click", () => auth.currentUser ? $("#dashboard")?.scrollIntoView({ behavior: "smooth" }) : openModal("login"));
$("#skillSearch")?.addEventListener("input", () => loadSkills());
document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.onclick = () => document.querySelector(button.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
});

/* =========================================================
   AUTH STATE + LIVE PROFILE
========================================================= */
onAuthStateChanged(auth, async (user) => {
  console.log("Firebase auth state:", user ? `Logged in as ${user.email}` : "Logged out");
  currentUser = user;
  updateNavigation(user);
  if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null; }
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }

  if (!user) {
    currentUser = null;
    await loadSkills();
    await loadDashboard();
    await loadWallet();
    return;
  }

  try {
    const profileReference = doc(db, "users", user.uid);
    unsubscribeProfile = onSnapshot(profileReference, async (snapshot) => {
      currentUser = { ...user, profile: snapshot.exists() ? snapshot.data() : {} };
      await loadSkills();
      await loadDashboard();
      await loadWallet();
    }, (error) => toast(`Profile error: ${firebaseError(error)}`));

    // Re-check reminders while the page is open. Backend flags remain the source of truth.
    reminderTimer = setInterval(() => loadDashboard(), 60000);
  } catch (error) {
    console.error("Authentication initialization error:", error);
    toast(firebaseError(error));
  }
});
