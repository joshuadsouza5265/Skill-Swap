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
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let unsubscribeProfile = null;

const $ = (selector) => document.querySelector(selector);

const esc = (value) =>
  String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));

const split = (value) =>
  String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const initials = (name) =>
  String(name || "User")
    .trim()
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

function toast(message) {
  const element = $("#toast");
  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  setTimeout(() => {
    element.classList.remove("show");
  }, 2800);
}

function showError(element, error) {
  if (!element) return;

  console.error(error);

  element.innerHTML = `
    <div class="error">
      ${esc(firebaseError(error))}
    </div>
  `;
}

function firebaseError(error) {
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
    "failed-precondition": "Firebase needs an index or configuration is incomplete."
  };

  if (error?.code && messages[error.code]) {
    return messages[error.code];
  }

  if (error?.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
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
  if (event.target.id === "modalBackdrop") {
    closeModal();
  }
});

function renderModal(type, data = {}) {
  const container = $("#modalContent");

  if (!container) return;

  if (type === "login") {
    container.innerHTML = `
      <h2>Welcome back</h2>
      <p>Sign in to manage your SkillSwap profile and learning activity.</p>

      <form class="form" id="authForm">

        <div class="field">
          <label>Email</label>
          <input
            id="email"
            type="email"
            required
            autocomplete="email"
          >
        </div>

        <div class="field">
          <label>Password</label>
          <input
            id="password"
            type="password"
            required
            autocomplete="current-password"
          >
        </div>

        <div id="formError"></div>

        <button class="btn primary" type="submit">
          Log in
        </button>

        <div class="helper">
          New here?
          <a href="#" id="switchAuth">Create an account</a>
        </div>

      </form>
    `;
  }

  if (type === "signup") {
    container.innerHTML = `
      <h2>Create your profile</h2>
      <p>Tell the community what you can teach and what you want to learn.</p>

      <form class="form" id="authForm">

        <div class="form-grid">

          <div class="field">
            <label>Name</label>
            <input
              id="name"
              required
              autocomplete="name"
            >
          </div>

          <div class="field">
            <label>Email</label>
            <input
              id="email"
              type="email"
              required
              autocomplete="email"
            >
          </div>

        </div>

        <div class="form-grid">

          <div class="field">
            <label>Password</label>
            <input
              id="password"
              type="password"
              minlength="6"
              required
              autocomplete="new-password"
            >
          </div>

          <div class="field">
            <label>Availability</label>
            <select id="availability">
              <option>Weekday mornings</option>
              <option>Weekday evenings</option>
              <option>Weekends</option>
              <option>Flexible</option>
            </select>
          </div>

        </div>

        <div class="form-grid">

          <div class="field">
            <label>Skills you can teach</label>
            <input
              id="teach"
              placeholder="Java, Excel, Figma"
              required
            >
          </div>

          <div class="field">
            <label>Skills you want to learn</label>
            <input
              id="learn"
              placeholder="Python, UI/UX"
              required
            >
          </div>

        </div>

        <div class="field">
          <label>About you</label>
          <textarea
            id="bio"
            placeholder="A short introduction..."
          ></textarea>
        </div>

        <div id="formError"></div>

        <button class="btn primary" type="submit">
          Create free profile
        </button>

        <div class="helper">
          Already have an account?
          <a href="#" id="switchAuth">Log in</a>
        </div>

      </form>
    `;
  }

  if (type === "profile") {
    const profile = currentUser?.profile || {};

    container.innerHTML = `
      <h2>Edit profile</h2>
      <p>Keep your availability and skill exchange preferences current.</p>

      <form class="form" id="profileForm">

        <div class="form-grid">

          <div class="field">
            <label>Name</label>
            <input
              id="name"
              value="${esc(profile.name)}"
              required
            >
          </div>

          <div class="field">
            <label>Availability</label>
            <select id="availability">

              <option ${
                profile.availability === "Weekday mornings"
                  ? "selected"
                  : ""
              }>
                Weekday mornings
              </option>

              <option ${
                profile.availability === "Weekday evenings"
                  ? "selected"
                  : ""
              }>
                Weekday evenings
              </option>

              <option ${
                profile.availability === "Weekends"
                  ? "selected"
                  : ""
              }>
                Weekends
              </option>

              <option ${
                profile.availability === "Flexible"
                  ? "selected"
                  : ""
              }>
                Flexible
              </option>

            </select>
          </div>

        </div>

        <div class="form-grid">

          <div class="field">
            <label>Skills you can teach</label>
            <input
              id="teach"
              value="${esc((profile.teach || []).join(", "))}"
              required
            >
          </div>

          <div class="field">
            <label>Skills you want to learn</label>
            <input
              id="learn"
              value="${esc((profile.learn || []).join(", "))}"
              required
            >
          </div>

        </div>

        <div class="field">
          <label>About you</label>
          <textarea id="bio">${esc(profile.bio || "")}</textarea>
        </div>

        <div id="formError"></div>

        <button class="btn primary" type="submit">
          Save changes
        </button>

      </form>
    `;
  }

  if (type === "session") {
    container.innerHTML = `
      <h2>Schedule a session</h2>

      <p>
        Set a clear topic and leave enough detail for both people to prepare.
      </p>

      <form class="form" id="sessionForm">

        <div class="profile-preview">

          <div class="member-avatar">
            ${initials(data.name)}
          </div>

          <div>
            <strong>${esc(data.name)}</strong>
            <small>
              ${esc((data.teach || []).join(" · "))}
            </small>
          </div>

        </div>

        <div class="form-grid">

          <div class="field">
            <label>Date & time</label>
            <input
              id="scheduledAt"
              type="datetime-local"
              required
            >
          </div>

          <div class="field">
            <label>Duration</label>
            <select id="duration">
              <option value="30">30 minutes</option>
              <option value="60" selected>60 minutes</option>
              <option value="90">90 minutes</option>
              <option value="120">120 minutes</option>
            </select>
          </div>

        </div>

        <div class="form-grid">

          <div class="field">
            <label>Your topic</label>
            <input
              id="topicA"
              required
              placeholder="What will you teach?"
            >
          </div>

          <div class="field">
            <label>Partner topic</label>
            <input
              id="topicB"
              required
              placeholder="What will they teach?"
            >
          </div>

        </div>

        <div class="field">
          <label>Assignment for next session</label>
          <input
            id="assignmentTitle"
            placeholder="Optional task"
          >
        </div>

        <div class="field">
          <label>Contact Details</label>
          <textarea
            id="ContactDetails"
            placeholder="Please Type in you contact details here, such as your email or phone number, so your partner can reach you."
          ></textarea>
        </div>

        <div id="formError"></div>

        <button class="btn primary" type="submit">
          Create session
        </button>

      </form>
    `;
  }

  if (type === "redeem") {
    container.innerHTML = `
      <h2>Reward milestone</h2>

      <p>
        Once your wallet reaches 1,000 points, you can record
        a redemption request.
      </p>

      <div class="form">

        <button class="btn primary" data-redeem="cash">
          Request cash redemption
        </button>

        <button class="btn outline" data-redeem="course">
          Use as course discount
        </button>

      </div>
    `;
  }

  if (type === "activity") {
    container.innerHTML = `
      <h2>Reward activity</h2>
      <p>Your latest point events.</p>

      <div id="activityList" class="list">
        Loading…
      </div>
    `;
  }

  bindModal(type, data);
}

function bindModal(type, data) {

  $("#switchAuth")?.addEventListener("click", (event) => {
    event.preventDefault();

    openModal(
      type === "login"
        ? "signup"
        : "login"
    );
  });

  $("#authForm")?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const errorElement = $("#formError");

    if (errorElement) {
      errorElement.innerHTML = "";
    }

    try {

      if (type === "login") {

        await signInWithEmailAndPassword(
          auth,
          $("#email").value.trim(),
          $("#password").value
        );

        closeModal();
        toast("Signed in successfully.");

      } else {

        const name = $("#name").value.trim();
        const email = $("#email").value.trim();
        const password = $("#password").value;

        const teach = split($("#teach").value);
        const learn = split($("#learn").value);

        const credential =
          await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );

        await updateProfile(
          credential.user,
          {
            displayName: name
          }
        );

        await setDoc(
          doc(db, "users", credential.user.uid),
          {
            name,
            email: credential.user.email,
            teach,
            learn,
            availability: $("#availability").value,
            bio: $("#bio").value.trim(),

            points: 0,
            streak: 0,
            lastActivity: null,

            createdAt: serverTimestamp()
          }
        );

        closeModal();
        toast("Profile created successfully.");
      }

    } catch (error) {

      showError(errorElement, error);

    }

  });

  $("#profileForm")?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const errorElement = $("#formError");

    if (errorElement) {
      errorElement.innerHTML = "";
    }

    if (!auth.currentUser) {
      toast("Please log in first.");
      closeModal();
      return;
    }

    try {

      const uid = auth.currentUser.uid;

      await updateDoc(
        doc(db, "users", uid),
        {
          name: $("#name").value.trim(),
          teach: split($("#teach").value),
          learn: split($("#learn").value),
          availability: $("#availability").value,
          bio: $("#bio").value.trim()
        }
      );

      await updateProfile(
        auth.currentUser,
        {
          displayName: $("#name").value.trim()
        }
      );

      closeModal();

      toast("Profile updated successfully.");

      await refreshLoggedInUser();

    } catch (error) {

      showError(errorElement, error);

    }

  });

  $("#sessionForm")?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const errorElement = $("#formError");

    if (errorElement) {
      errorElement.innerHTML = "";
    }

    if (!auth.currentUser) {
      toast("Please log in first.");
      return;
    }

    try {

      const sessionReference = await addDoc(
        collection(db, "sessions"),
        {
          userIds: [
            auth.currentUser.uid,
            data.id
          ],

          createdBy: auth.currentUser.uid,

          scheduledAt: $("#scheduledAt").value,

          duration: Number(
            $("#duration").value
          ),

          topicA: $("#topicA").value.trim(),
          topicB: $("#topicB").value.trim(),

          status: "scheduled",

          createdAt: serverTimestamp()
        }
      );

      const assignmentTitle =
        $("#assignmentTitle").value.trim();

      if (assignmentTitle) {

        await addDoc(
          collection(db, "assignments"),
          {
            sessionId: sessionReference.id,
            userId: auth.currentUser.uid,
            partnerId: data.id,

            title: assignmentTitle,

            description:
              $("#assignmentDescription").value.trim(),

            completed: false,

            createdAt: serverTimestamp()
          }
        );
      }

      closeModal();

      toast("Session scheduled successfully.");

      await loadDashboard();

    } catch (error) {

      showError(errorElement, error);

    }

  });

  if (type === "activity") {
    loadActivity();
  }

  document
    .querySelectorAll("[data-redeem]")
    .forEach((button) => {

      button.onclick = () => {
        toast(
          "Redemption is available at the 1,000-point milestone."
        );
      };

    });
}


/* =========================================================
   AUTH UI
========================================================= */

function updateNavigation(user) {

  const loginButtons = [
    $("#loginBtn"),
    $("#mobileLogin")
  ];

  const signupButtons = [
    $("#signupBtn"),
    $("#mobileSignup"),
    $("#heroSignup"),
    $("#ctaSignup")
  ];

  loginButtons.forEach((button) => {
    if (!button) return;

    button.textContent = user
      ? "Log out"
      : "Log in";
  });

  signupButtons.forEach((button) => {

    if (!button) return;

    if (user) {

      button.textContent =
        button.id === "ctaSignup"
          ? "Open dashboard"
          : "My dashboard";

    } else {

      button.textContent =
        button.id === "ctaSignup"
          ? "Join SkillSwap"
          : button.id === "heroSignup"
            ? "Create your profile"
            : "Join free";
    }

  });

  // Change the desktop login button into logout.
  $("#loginBtn").onclick = async () => {

    if (auth.currentUser) {

      await logout();

    } else {

      openModal("login");

    }

  };

  // Change the mobile login button into logout.
  $("#mobileLogin").onclick = async () => {

    if (auth.currentUser) {

      await logout();

    } else {

      openModal("login");

    }

  };

  // Dashboard behavior for signup buttons after login.
  [
    $("#signupBtn"),
    $("#mobileSignup"),
    $("#heroSignup"),
    $("#ctaSignup")
  ]
    .filter(Boolean)
    .forEach((button) => {

      button.onclick = () => {

        if (auth.currentUser) {

          $("#dashboard")?.scrollIntoView({
            behavior: "smooth"
          });

        } else {

          openModal("signup");

        }

      };

    });

}

async function logout() {

  try {

    await signOut(auth);

    closeModal();

    toast("You have been logged out.");

  } catch (error) {

    console.error("Logout error:", error);

    toast("Could not log out. Please try again.");

  }

}


/* =========================================================
   PROFILE
========================================================= */

async function getProfile(uid) {

  const snapshot = await getDoc(
    doc(db, "users", uid)
  );

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data();
}

async function refreshLoggedInUser() {

  if (!auth.currentUser) {
    return;
  }

  try {

    const profile =
      await getProfile(auth.currentUser.uid);

    currentUser = {
      ...auth.currentUser,
      profile: profile || {}
    };

    await loadSkills();
    await loadDashboard();
    await loadWallet();

  } catch (error) {

    console.error(
      "Could not refresh profile:",
      error
    );

    toast(
      "Could not load your profile. Check Firestore permissions."
    );

  }

}


/* =========================================================
   SKILL SEARCH
========================================================= */

async function loadSkills() {

  const search =
    ($("#skillSearch")?.value || "")
      .trim()
      .toLowerCase();

  const state = $("#skillsState");
  const grid = $("#skillGrid");

  if (!state || !grid) {
    return;
  }

  if (!currentUser) {

    state.textContent =
      "Create an account to explore members and skills.";

    state.style.display = "block";
    grid.innerHTML = "";

    return;
  }

  try {

    const snapshot = await getDocs(
      query(
        collection(db, "users"),
        orderBy("name")
      )
    );

    const users =
      snapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data()
        }))
        .filter(
          (user) =>
            user.id !== currentUser.uid
        )
        .filter((user) => {

          const searchable = `
            ${user.name || ""}
            ${(user.teach || []).join(" ")}
            ${(user.learn || []).join(" ")}
            ${user.bio || ""}
          `.toLowerCase();

          return !search ||
            searchable.includes(search);
        });

    if (!users.length) {

      state.style.display = "block";

      state.textContent = search
        ? "No members match that search yet."
        : "No other members have joined yet — invite a friend to create the first profile.";

      grid.innerHTML = "";

      return;
    }

    state.style.display = "none";

    grid.innerHTML =
      users
        .map((user) => `
          <article class="skill-card">

            <div class="skill-card-top">

              <div class="member">

                <div class="member-avatar">
                  ${initials(user.name)}
                </div>

                <div class="member-info">

                  <strong>
                    ${esc(user.name || "Member")}
                  </strong>

                  <small>
                    Wants to learn
                    ${
                      (user.learn || [])
                        .slice(0, 2)
                        .map(esc)
                        .join(" · ")
                      || "new skills"
                    }
                  </small>

                </div>

              </div>

              <span class="availability">
                ${esc(user.availability || "Flexible")}
              </span>

            </div>

            <h3>
              ${esc(
                (user.teach || [])[0]
                || "Skills to share"
              )}
            </h3>

            <p>
              ${esc(
                user.bio
                || "Ready to exchange knowledge one-on-one."
              )}
            </p>

            <div class="chips">

              ${(user.teach || [])
                .slice(0, 4)
                .map(
                  (skill) =>
                    `<span class="chip">${esc(skill)}</span>`
                )
                .join("")}

            </div>

            <button
              class="btn outline"
              data-connect="${user.id}"
            >
              View & connect
            </button>

          </article>
        `)
        .join("");

    document
      .querySelectorAll("[data-connect]")
      .forEach((button) => {

        button.onclick = async () => {

          const user =
            users.find(
              (item) =>
                item.id === button.dataset.connect
            );

          if (!user) {
            return;
          }

          await connectAndSchedule(user);

        };

      });

  } catch (error) {

    console.error(
      "Could not load users:",
      error
    );

    state.style.display = "block";

    state.textContent =
      "Could not load members. Check your Firestore rules.";

    grid.innerHTML = "";

    toast(firebaseError(error));

  }

}


/* =========================================================
   CONNECTIONS
========================================================= */

async function connectAndSchedule(user) {

  if (!auth.currentUser) {

    openModal("login");

    return;
  }

  try {

    // Check whether a connection already exists.
    const existingSnapshot =
      await getDocs(
        query(
          collection(db, "connections"),
          where(
            "userIds",
            "array-contains",
            auth.currentUser.uid
          )
        )
      );

    const alreadyConnected =
      existingSnapshot.docs.some((document) => {

        const data = document.data();

        return (
          Array.isArray(data.userIds) &&
          data.userIds.includes(user.id)
        );

      });

    if (!alreadyConnected) {

      await addDoc(
        collection(db, "connections"),
        {
          userIds: [
            auth.currentUser.uid,
            user.id
          ],

          initiator:
            auth.currentUser.uid,

          status: "pending",

          createdAt:
            serverTimestamp()
        }
      );

      toast("Connection request sent.");

    } else {

      toast("You are already connected with this member.");

    }

    openModal("session", user);

  } catch (error) {

    console.error(
      "Connection error:",
      error
    );

    toast(firebaseError(error));

  }

}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  const dashboard =
    $("#dashboardContent");

  if (!dashboard) {
    return;
  }

  if (!currentUser) {

    dashboard.innerHTML = `
      <div class="state-card">
        Your dashboard will appear here after you sign in.
      </div>
    `;

    if ($("#profileBtn")) {
      $("#profileBtn").style.display = "none";
    }

    if ($("#dashboardSubtitle")) {
      $("#dashboardSubtitle").textContent =
        "Sign in to manage your profile, connections and sessions.";
    }

    return;
  }

  if ($("#profileBtn")) {
    $("#profileBtn").style.display = "block";
  }

  const profile =
    currentUser.profile || {};

  try {

    const [
      sessionsSnapshot,
      assignmentsSnapshot,
      connectionsSnapshot
    ] = await Promise.all([

      getDocs(
        query(
          collection(db, "sessions"),
          where(
            "userIds",
            "array-contains",
            currentUser.uid
          )
        )
      ),

      getDocs(
        query(
          collection(db, "assignments"),
          where(
            "userId",
            "==",
            currentUser.uid
          )
        )
      ),

      getDocs(
        query(
          collection(db, "connections"),
          where(
            "userIds",
            "array-contains",
            currentUser.uid
          )
        )
      )

    ]);

    const sessions =
      sessionsSnapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data()
        }));

    const assignments =
      assignmentsSnapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data()
        }));

    const connections =
      connectionsSnapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data()
        }));

    const upcoming =
      sessions
        .filter(
          (session) =>
            session.status !== "completed"
        )
        .sort(
          (a, b) =>
            String(a.scheduledAt || "")
              .localeCompare(
                String(b.scheduledAt || "")
              )
        )
        .slice(0, 4);

    const pendingAssignments =
      assignments
        .filter(
          (assignment) =>
            !assignment.completed
        )
        .slice(0, 4);

    if ($("#dashboardSubtitle")) {
      $("#dashboardSubtitle").textContent =
        `Welcome, ${
          profile.name ||
          auth.currentUser.displayName ||
          auth.currentUser.email
        }. Manage your exchange from one place.`;
    }

    dashboard.innerHTML = `

      <div class="dash-card">

        <h3>Progress</h3>

        <div class="stat-row">

          <div class="stat-box">
            <strong>
              ${Number(profile.points || 0)}
            </strong>
            <small>Points</small>
          </div>

          <div class="stat-box">
            <strong>
              ${Number(profile.streak || 0)}
            </strong>
            <small>Day streak</small>
          </div>

          <div class="stat-box">
            <strong>
              ${connections.length}
            </strong>
            <small>Connections</small>
          </div>

        </div>

        <div
          class="chips"
          style="margin-top:15px"
        >

          ${(profile.teach || [])
            .slice(0, 6)
            .map(
              (skill) =>
                `<span class="chip">Teach: ${esc(skill)}</span>`
            )
            .join("")}

          ${(profile.learn || [])
            .slice(0, 6)
            .map(
              (skill) =>
                `<span class="chip">Learn: ${esc(skill)}</span>`
            )
            .join("")}

        </div>

      </div>


      <div class="dash-card">

        <h3>Upcoming sessions</h3>

        <div class="list">

          ${
            upcoming.length
              ? upcoming
                  .map(
                    (session) => `
                      <div class="list-item">

                        <strong>
                          ${esc(session.topicA)}
                          ↔
                          ${esc(session.topicB)}
                        </strong>

                        <small>
                          ${esc(session.scheduledAt)}
                          ·
                          ${session.duration} min

                          <button
                            class="small-complete"
                            data-session="${session.id}"
                          >
                            Mark complete
                          </button>

                        </small>

                      </div>
                    `
                  )
                  .join("")
              : `
                <div class="list-item">
                  <small>
                    No sessions scheduled yet.
                  </small>
                </div>
              `
          }

        </div>

      </div>


      <div class="dash-card">

        <h3>Assignments</h3>

        <div class="list">

          ${
            pendingAssignments.length
              ? pendingAssignments
                  .map(
                    (assignment) => `
                      <div class="list-item">

                        <strong>
                          ${esc(assignment.title)}
                        </strong>

                        <small>
                          ${esc(
                            assignment.description || ""
                          )}

                          <button
                            class="small-complete"
                            data-assignment="${assignment.id}"
                          >
                            Complete
                          </button>

                        </small>

                      </div>
                    `
                  )
                  .join("")
              : `
                <div class="list-item">
                  <small>
                    No pending assignments.
                  </small>
                </div>
              `
          }

        </div>

      </div>

    `;

    document
      .querySelectorAll("[data-session]")
      .forEach((button) => {

        button.onclick = () =>
          completeSession(
            button.dataset.session
          );

      });

    document
      .querySelectorAll("[data-assignment]")
      .forEach((button) => {

        button.onclick = () =>
          completeAssignment(
            button.dataset.assignment
          );

      });

  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );

    dashboard.innerHTML = `
      <div class="state-card">
        <strong>Dashboard could not load.</strong>
        <br><br>
        ${esc(firebaseError(error))}
      </div>
    `;

    toast(firebaseError(error));

  }

}


/* =========================================================
   SESSIONS / ASSIGNMENTS
========================================================= */

async function completeSession(id) {

  try {

    await updateDoc(
      doc(db, "sessions", id),
      {
        status: "completed",
        completedAt: serverTimestamp()
      }
    );

    toast(
      "Session completed. Reward points are processed by the backend."
    );

    await loadDashboard();
    await loadWallet();

  } catch (error) {

    console.error(
      "Complete session error:",
      error
    );

    toast(firebaseError(error));

  }

}

async function completeAssignment(id) {

  try {

    await updateDoc(
      doc(db, "assignments", id),
      {
        completed: true,
        completedAt: serverTimestamp()
      }
    );

    toast(
      "Assignment completed. Reward points are processed by the backend."
    );

    await loadDashboard();
    await loadWallet();

  } catch (error) {

    console.error(
      "Complete assignment error:",
      error
    );

    toast(firebaseError(error));

  }

}


/* =========================================================
   WALLET
========================================================= */

async function loadWallet() {

  if (!currentUser) {

    if ($("#walletPoints"))
      $("#walletPoints").textContent = "0";

    if ($("#walletRemaining"))
      $("#walletRemaining").textContent =
        "Sign in to track rewards";

    if ($("#walletStreak"))
      $("#walletStreak").textContent =
        "— day streak";

    if ($("#walletStatus"))
      $("#walletStatus").textContent =
        "Not signed in";

    if ($("#walletProgress"))
      $("#walletProgress").style.width = "0%";

    return;
  }

  const profile =
    currentUser.profile || {};

  const points =
    Number(profile.points || 0);

  if ($("#walletPoints"))
    $("#walletPoints").textContent =
      points.toLocaleString();

  if ($("#walletRemaining")) {

    $("#walletRemaining").textContent =
      points >= 1000
        ? "Milestone unlocked"
        : `${(
            1000 - points
          ).toLocaleString()} points to 1,000`;

  }

  if ($("#walletStreak")) {

    $("#walletStreak").textContent =
      `${profile.streak || 0} day streak`;

  }

  if ($("#walletStatus"))
    $("#walletStatus").textContent =
      "Active";

  if ($("#walletProgress"))
    $("#walletProgress").style.width =
      `${Math.min(100, points / 10)}%`;

}


/* =========================================================
   ACTIVITY
========================================================= */

async function loadActivity() {

  const container =
    $("#activityList");

  if (!container || !currentUser) {
    return;
  }

  try {

    const snapshot =
      await getDocs(
        query(
          collection(db, "pointEvents"),
          where(
            "userId",
            "==",
            currentUser.uid
          ),
          orderBy(
            "createdAt",
            "desc"
          )
        )
      );

    if (!snapshot.docs.length) {

      container.innerHTML = `
        <div class="list-item">
          <small>
            No reward activity yet.
          </small>
        </div>
      `;

      return;
    }

    container.innerHTML =
      snapshot.docs
        .slice(0, 12)
        .map((document) => {

          const event =
            document.data();

          return `
            <div class="list-item">

              <strong>
                ${esc(
                  event.reason ||
                  "Point activity"
                )}
              </strong>

              <small>
                +${Number(event.points || 0)}
                points
              </small>

            </div>
          `;

        })
        .join("");

  } catch (error) {

    console.error(
      "Activity error:",
      error
    );

    container.innerHTML = `
      <div class="list-item">
        <small>
          Could not load reward activity.
        </small>
      </div>
    `;

  }

}


/* =========================================================
   THEME
========================================================= */

function themeInit() {

  const saved =
    localStorage.getItem(
      "skillswap-theme"
    );

  if (saved === "light") {
    document.body.classList.add("light");
  }

  updateThemeIcon();

}

function updateThemeIcon() {

  const button =
    $("#themeToggle");

  if (!button) return;

  button.textContent =
    document.body.classList.contains("light")
      ? "☾"
      : "☀";

}

$("#themeToggle")?.addEventListener(
  "click",
  () => {

    document.body.classList.toggle(
      "light"
    );

    localStorage.setItem(
      "skillswap-theme",
      document.body.classList.contains("light")
        ? "light"
        : "dark"
    );

    updateThemeIcon();

  }
);

themeInit();


/* =========================================================
   NAVIGATION
========================================================= */

$("#menuBtn")?.addEventListener(
  "click",
  () => {
    $("#mobileNav")?.classList.toggle(
      "open"
    );
  }
);

$("#profileBtn")?.addEventListener(
  "click",
  () => {

    if (!auth.currentUser) {

      openModal("login");

      return;
    }

    openModal("profile");

  }
);

$("#walletAction")?.addEventListener(
  "click",
  () => {

    if (auth.currentUser) {

      $("#dashboard")?.scrollIntoView({
        behavior: "smooth"
      });

    } else {

      openModal("login");

    }

  }
);

$("#skillSearch")?.addEventListener(
  "input",
  () => loadSkills()
);

document
  .querySelectorAll("[data-scroll]")
  .forEach((button) => {

    button.onclick = () => {

      const target =
        document.querySelector(
          button.dataset.scroll
        );

      target?.scrollIntoView({
        behavior: "smooth"
      });

    };

  });


/* =========================================================
   AUTH STATE — MOST IMPORTANT PART
========================================================= */

onAuthStateChanged(
  auth,
  async (user) => {

    console.log(
      "Firebase auth state:",
      user
        ? `Logged in as ${user.email}`
        : "Logged out"
    );

    currentUser = user;

    updateNavigation(user);

    if (unsubscribeProfile) {

      unsubscribeProfile();

      unsubscribeProfile = null;

    }

    if (!user) {

      currentUser = null;

      await loadSkills();
      await loadDashboard();
      await loadWallet();

      return;

    }

    try {

      const profileReference =
        doc(db, "users", user.uid);

      unsubscribeProfile =
        onSnapshot(
          profileReference,

          async (snapshot) => {

            if (snapshot.exists()) {

              currentUser = {
                ...user,
                profile: snapshot.data()
              };

              console.log(
                "Firestore profile loaded:",
                currentUser.profile
              );

            } else {

              console.warn(
                "Firebase Auth user exists, but Firestore profile does not exist."
              );

              currentUser = {
                ...user,
                profile: {}
              };

            }

            await loadSkills();
            await loadDashboard();
            await loadWallet();

          },

          (error) => {

            console.error(
              "Profile listener error:",
              error
            );

            toast(
              `Profile error: ${firebaseError(error)}`
            );

          }
        );

    } catch (error) {

      console.error(
        "Authentication initialization error:",
        error
      );

      toast(
        firebaseError(error)
      );

    }

  }
);