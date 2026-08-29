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
  getDocs,
  serverTimestamp,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let unsubscribeProfile = null;
let sessionTimer = null;
let sessionCheckRunning = false;

const $ = (selector) => document.querySelector(selector);

const getValue = (selector, fallback = "") => {
  const element = $(selector);
  if (!element) return fallback;
  return element.value ?? fallback;
};

const esc = (value) => {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  };

  return String(value ?? "").replace(
    /[&<>'"]/g,
    (char) => replacements[char] ?? char
  );
};

const split = (value) =>
  String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const initials = (name) => {
  const result = String(name || "User")
    .trim()
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return result || "U";
};

function toast(message) {
  const element = $("#toast");
  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  setTimeout(() => {
    element.classList.remove("show");
  }, 2800);
}

function firebaseError(error) {
  const messages = {
    "auth/invalid-credential":
      "Incorrect email or password.",

    "auth/invalid-login-credentials":
      "Incorrect email or password.",

    "auth/email-already-in-use":
      "That email is already registered.",

    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/weak-password":
      "Password must be at least 6 characters.",

    "auth/user-not-found":
      "No account exists with that email.",

    "auth/wrong-password":
      "Incorrect password.",

    "auth/too-many-requests":
      "Too many attempts. Please try again later.",

    "auth/network-request-failed":
      "Network error. Check your internet connection.",

    "permission-denied":
      "Firebase denied this action. Check your Firestore rules.",

    "failed-precondition":
      "Firebase needs an index or configuration is incomplete."
  };

  if (error?.code && messages[error.code]) {
    return messages[error.code];
  }

  return error?.message ||
    "Something went wrong. Please try again.";
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


/* =====================================================
   MODAL SYSTEM
===================================================== */

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

$("#modalClose")?.addEventListener(
  "click",
  closeModal
);

$("#modalBackdrop")?.addEventListener(
  "click",
  (event) => {
    if (event.target.id === "modalBackdrop") {
      closeModal();
    }
  }
);


/* =====================================================
   MODAL RENDER
===================================================== */

function renderModal(type, data = {}) {

  const container = $("#modalContent");

  if (!container) return;


  /* LOGIN */

  if (type === "login") {

    container.innerHTML = `
      <h2>Welcome back</h2>

      <p>
        Sign in to manage your SkillSwap profile.
      </p>

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

        <button
          class="btn primary"
          type="submit"
        >
          Log in
        </button>

        <div class="helper">
          New here?
          <a href="#" id="switchAuth">
            Create an account
          </a>
        </div>

      </form>
    `;
  }


  /* SIGNUP */

  if (type === "signup") {

    container.innerHTML = `
      <h2>Create your profile</h2>

      <p>
        Tell the community what you can teach
        and what you want to learn.
      </p>

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

              <option>
                Weekday mornings
              </option>

              <option>
                Weekday evenings
              </option>

              <option>
                Weekends
              </option>

              <option>
                Flexible
              </option>

            </select>
          </div>

        </div>

        <div class="form-grid">

          <div class="field">
            <label>
              Skills you can teach
            </label>

            <input
              id="teach"
              placeholder="Java, Excel, Figma"
              required
            >
          </div>

          <div class="field">
            <label>
              Skills you want to learn
            </label>

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

        <button
          class="btn primary"
          type="submit"
        >
          Create free profile
        </button>

        <div class="helper">

          Already have an account?

          <a href="#" id="switchAuth">
            Log in
          </a>

        </div>

      </form>
    `;
  }


  /* PROFILE */

  if (type === "profile") {

    const profile =
      currentUser?.profile || {};

    container.innerHTML = `

      <h2>Edit profile</h2>

      <p>
        Keep your information up to date.
      </p>

      <form
        class="form"
        id="profileForm"
      >

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

              <option
                ${
                  profile.availability ===
                  "Weekday mornings"
                    ? "selected"
                    : ""
                }
              >
                Weekday mornings
              </option>

              <option
                ${
                  profile.availability ===
                  "Weekday evenings"
                    ? "selected"
                    : ""
                }
              >
                Weekday evenings
              </option>

              <option
                ${
                  profile.availability ===
                  "Weekends"
                    ? "selected"
                    : ""
                }
              >
                Weekends
              </option>

              <option
                ${
                  profile.availability ===
                  "Flexible"
                    ? "selected"
                    : ""
                }
              >
                Flexible
              </option>

            </select>

          </div>

        </div>

        <div class="form-grid">

          <div class="field">

            <label>
              Skills you can teach
            </label>

            <input
              id="teach"
              value="${esc(
                (profile.teach || []).join(", ")
              )}"
              required
            >

          </div>

          <div class="field">

            <label>
              Skills you want to learn
            </label>

            <input
              id="learn"
              value="${esc(
                (profile.learn || []).join(", ")
              )}"
              required
            >

          </div>

        </div>

        <div class="field">

          <label>About you</label>

          <textarea id="bio">${esc(
            profile.bio || ""
          )}</textarea>

        </div>

        <div id="formError"></div>

        <button
          class="btn primary"
          type="submit"
        >
          Save changes
        </button>

      </form>
    `;
  }


  /* CREATE SESSION */

  if (type === "session") {

    container.innerHTML = `

      <h2>Schedule a session</h2>

      <p>
        Create a session request with your
        SkillSwap partner.
      </p>

      <form
        class="form"
        id="sessionForm"
      >

        <div class="field">

          <label>Date and time</label>

          <input
            id="scheduledAt"
            type="datetime-local"
            required
          >

        </div>

        <div class="field">

          <label>Duration</label>

          <select id="duration">

            <option value="30">
              30 minutes
            </option>

            <option
              value="60"
              selected
            >
              60 minutes
            </option>

            <option value="90">
              90 minutes
            </option>

            <option value="120">
              120 minutes
            </option>

          </select>

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

          <label>
            Assignment for next session
          </label>

          <input
            id="assignmentTitle"
            placeholder="Optional task"
          >

        </div>

        <div class="field">

          <label>
            Your contact details
          </label>

          <textarea
            id="ContactDetails"
            placeholder="Email, phone number, Instagram, etc."
          ></textarea>

        </div>

        <div id="formError"></div>

        <button
          class="btn primary"
          type="submit"
        >
          Send session request
        </button>

      </form>
    `;
  }


  /* SESSION REQUEST */

  if (type === "sessionRequest") {

    container.innerHTML = `

      <div class="session-popup">

        <div
          style="
            font-size:42px;
            margin-bottom:10px;
          "
        >
          🤝
        </div>

        <h2>
          Approve Session?
        </h2>

        <p>

          <strong>
            ${esc(
              data.requesterName ||
              "A SkillSwap member"
            )}
          </strong>

          wants to schedule a session
          with you.

        </p>

        <div
          class="state-card"
          style="
            margin:20px 0;
            text-align:left;
          "
        >

          <strong>
            ${esc(
              data.topicA ||
              "Skill exchange"
            )}
          </strong>

          <br><br>

          <small>
            📅
            ${esc(
              formatSessionDate(
                data.scheduledAt
              )
            )}
          </small>

          <br>

          <small>
            ⏱
            ${Number(
              data.duration || 60
            )}
            minutes
          </small>

          <br><br>

          <small>
            ${esc(
              data.topicB || ""
            )}
          </small>

        </div>

        <div
          style="
            display:grid;
            grid-template-columns:
              1fr 1fr;
            gap:12px;
          "
        >

          <button
            class="btn primary"
            id="approveSession"
          >
            ✓ Approve
          </button>

          <button
            class="btn outline"
            id="rejectSession"
          >
            ✕ Reject
          </button>

        </div>

      </div>
    `;
  }


  /* SESSION DETAILS */

  if (type === "sessionDetails") {

    container.innerHTML = `

      <div class="session-popup">

        <div
          style="
            font-size:42px;
            margin-bottom:10px;
          "
        >
          👤
        </div>

        <h2>
          Session Details
        </h2>

        <p>

          Session with

          <strong>
            ${esc(
              data.partnerName ||
              "SkillSwap member"
            )}
          </strong>

        </p>

        <div
          class="state-card"
          style="
            margin:20px 0;
            text-align:left;
          "
        >

          <strong>
            ${esc(
              data.topicA ||
              "Skill exchange"
            )}
          </strong>

          <br><br>

          <small>
            📅
            ${esc(
              formatSessionDate(
                data.scheduledAt
              )
            )}
          </small>

          <br>

          <small>
            ⏱
            ${Number(
              data.duration || 60
            )}
            minutes
          </small>

          <br><br>

          <strong>
            Contact Information
          </strong>

          <br><br>

          <div
            style="
              white-space:pre-wrap;
            "
          >
            ${esc(
              data.contactDetails ||
              "No contact information was provided."
            )}
          </div>

        </div>

        <button
          class="btn primary"
          id="closeSessionDetails"
        >
          Close
        </button>

      </div>
    `;
  }


  /* SESSION START */

  if (type === "sessionStart") {

    container.innerHTML = `

      <div class="session-popup">

        <div
          style="
            font-size:42px;
            margin-bottom:10px;
          "
        >
          🔔
        </div>

        <h2>
          Your session is starting!
        </h2>

        <p>
          It's time to contact your
          SkillSwap partner.
        </p>

        <div
          class="state-card"
          style="
            margin:20px 0;
            text-align:left;
          "
        >

          <strong>
            ${esc(
              data.topicA ||
              "Skill exchange"
            )}
          </strong>

          <br><br>

          <small>
            📅
            ${esc(
              formatSessionDate(
                data.scheduledAt
              )
            )}
          </small>

          <br>

          <small>
            ⏱
            ${Number(
              data.duration || 60
            )}
            minutes
          </small>

          <br><br>

          <strong>
            Contact information
          </strong>

          <br><br>

          <div
            style="
              white-space:pre-wrap;
            "
          >
            ${esc(
              data.contactDetails ||
              "No contact information was provided."
            )}
          </div>

        </div>

        <button
          class="btn primary"
          id="sessionStartDone"
        >
          Got it — contact my partner
        </button>

      </div>
    `;
  }


  /* SESSION COMPLETION */

  if (type === "sessionComplete") {

    const uid =
      auth.currentUser?.uid;

    const myConfirmation =
      data.confirmations?.[uid];

    const partnerId =
      data.userIds?.find(
        (id) => id !== uid
      );

    const partnerConfirmation =
      partnerId
        ? data.confirmations?.[partnerId]
        : null;

    container.innerHTML = `

      <div class="session-popup">

        <div
          style="
            font-size:42px;
            margin-bottom:10px;
          "
        >
          ⏰
        </div>

        <h2>
          Did you complete the session?
        </h2>

        <p>
          Your SkillSwap session has ended.
        </p>

        <div
          class="state-card"
          style="
            margin:20px 0;
            text-align:left;
          "
        >

          <strong>
            ${esc(
              data.topicA ||
              "Skill exchange"
            )}
          </strong>

          <br><br>

          <small>

            Your confirmation:

            ${
              myConfirmation === true
                ? "✓ Completed"
                : myConfirmation === false
                  ? "✕ Not completed"
                  : "Waiting"
            }

          </small>

          <br>

          <small>

            Partner:

            ${
              partnerConfirmation === true
                ? "✓ Confirmed"
                : partnerConfirmation === false
                  ? "✕ Did not complete"
                  : "Waiting"
            }

          </small>

          <br><br>

          <small>
            Points are awarded only when
            <strong>
              both users confirm completion.
            </strong>
          </small>

        </div>

        <div
          style="
            display:grid;
            grid-template-columns:
              1fr 1fr;
            gap:12px;
          "
        >

          <button
            class="btn primary"
            id="sessionYes"
          >
            ✓ Yes, completed
          </button>

          <button
            class="btn outline"
            id="sessionNo"
          >
            ✕ No
          </button>

        </div>

      </div>
    `;
  }


  /* REDEEM */

  if (type === "redeem") {

    container.innerHTML = `

      <h2>
        Reward milestone
      </h2>

      <p>
        Once your wallet reaches
        1,000 points, you can record
        a redemption request.
      </p>

      <div class="form">

        <button
          class="btn primary"
          data-redeem="cash"
        >
          Request cash redemption
        </button>

        <button
          class="btn outline"
          data-redeem="course"
        >
          Use as course discount
        </button>

      </div>
    `;
  }


  /* ACTIVITY */

  if (type === "activity") {

    container.innerHTML = `

      <h2>
        Reward activity
      </h2>

      <p>
        Your latest point events.
      </p>

      <div
        id="activityList"
        class="list"
      >
        Loading…
      </div>

    `;
  }


  bindModal(type, data);
}


/* =====================================================
   MODAL BINDINGS
===================================================== */

function bindModal(type, data) {

  $("#switchAuth")?.addEventListener(
    "click",
    (event) => {

      event.preventDefault();

      openModal(
        type === "login"
          ? "signup"
          : "login"
      );

    }
  );


  /* AUTH */

  $("#authForm")?.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      const errorElement =
        $("#formError");

      if (errorElement) {
        errorElement.innerHTML = "";
      }

      try {

        if (type === "login") {

          const email =
            getValue("#email").trim();

          const password =
            getValue("#password");

          await signInWithEmailAndPassword(
            auth,
            email,
            password
          );

          closeModal();

          toast(
            "Signed in successfully."
          );

        } else {

          const name =
            getValue("#name").trim();

          const email =
            getValue("#email").trim();

          const password =
            getValue("#password");

          const teach =
            split(
              getValue("#teach")
            );

          const learn =
            split(
              getValue("#learn")
            );

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
            doc(
              db,
              "users",
              credential.user.uid
            ),
            {

              name,

              email:
                credential.user.email,

              teach,

              learn,

              availability:
                getValue("#availability"),

              bio:
                getValue("#bio").trim(),

              points: 0,

              streak: 0,

              lastActivity: null,

              createdAt:
                serverTimestamp()

            }
          );

          closeModal();

          toast(
            "Profile created successfully."
          );
        }

      } catch (error) {

        showError(
          errorElement,
          error
        );

      }

    }
  );


  /* PROFILE */

  $("#profileForm")?.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      const errorElement =
        $("#formError");

      if (errorElement) {
        errorElement.innerHTML = "";
      }

      if (!auth.currentUser) {

        toast(
          "Please log in first."
        );

        closeModal();

        return;
      }

      try {

        const uid =
          auth.currentUser.uid;

        const name =
          getValue("#name").trim();

        await updateDoc(
          doc(
            db,
            "users",
            uid
          ),
          {

            name,

            teach:
              split(
                getValue("#teach")
              ),

            learn:
              split(
                getValue("#learn")
              ),

            availability:
              getValue("#availability"),

            bio:
              getValue("#bio").trim()

          }
        );

        await updateProfile(
          auth.currentUser,
          {
            displayName: name
          }
        );

        closeModal();

        toast(
          "Profile updated successfully."
        );

      } catch (error) {

        showError(
          errorElement,
          error
        );

      }

    }
  );


  /* CREATE SESSION */

  $("#sessionForm")?.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      const errorElement =
        $("#formError");

      if (errorElement) {
        errorElement.innerHTML = "";
      }

      if (!auth.currentUser) {

        toast(
          "Please log in first."
        );

        return;
      }

      try {

        const scheduledAt =
          getValue(
            "#scheduledAt"
          ).trim();

        const duration =
          Number(
            getValue(
              "#duration",
              "60"
            )
          );

        const topicA =
          getValue(
            "#topicA"
          ).trim();

        const topicB =
          getValue(
            "#topicB"
          ).trim();

        const assignmentTitle =
          getValue(
            "#assignmentTitle"
          ).trim();

        const contactDetails =
          getValue(
            "#ContactDetails"
          ).trim();


        if (!scheduledAt) {

          toast(
            "Please choose a date and time."
          );

          return;
        }

        if (!topicA) {

          toast(
            "Please enter your topic."
          );

          return;
        }

        if (!topicB) {

          toast(
            "Please enter your partner's topic."
          );

          return;
        }

        if (!data?.id) {

          toast(
            "The selected partner could not be found."
          );

          return;
        }


        const sessionReference =
          await addDoc(
            collection(
              db,
              "sessions"
            ),
            {

              userIds: [
                auth.currentUser.uid,
                data.id
              ],

              createdBy:
                auth.currentUser.uid,

              partnerId:
                data.id,

              scheduledAt,

              duration,

              topicA,

              topicB,

              contactDetails,

              status:
                "pending",

              confirmations: {

                [auth.currentUser.uid]:
                  null,

                [data.id]:
                  null

              },

              startNotifications: {

                [auth.currentUser.uid]:
                  false,

                [data.id]:
                  false

              },

              rewardStatus:
                "waiting",

              pointsAwarded:
                false,

              createdAt:
                serverTimestamp()

            }
          );


        if (assignmentTitle) {

          await addDoc(
            collection(
              db,
              "assignments"
            ),
            {

              sessionId:
                sessionReference.id,

              userId:
                auth.currentUser.uid,

              partnerId:
                data.id,

              title:
                assignmentTitle,

              description:
                "",

              completed:
                false,

              createdAt:
                serverTimestamp()

            }
          );
        }


        closeModal();

        toast(
          "Session request sent."
        );

        await loadDashboard();

      } catch (error) {

        console.error(
          "Create session error:",
          error
        );

        showError(
          errorElement,
          error
        );

      }

    }
  );


  /* APPROVE */

  $("#approveSession")?.addEventListener(
    "click",
    async () => {

      await respondToSessionRequest(
        data.id,
        true
      );

    }
  );


  /* REJECT */

  $("#rejectSession")?.addEventListener(
    "click",
    async () => {

      await respondToSessionRequest(
        data.id,
        false
      );

    }
  );


  $("#closeSessionDetails")?.addEventListener(
    "click",
    closeModal
  );


  $("#sessionStartDone")?.addEventListener(
    "click",
    () => {

      closeModal();

      toast(
        "Good luck with your SkillSwap session!"
      );

    }
  );


  $("#sessionYes")?.addEventListener(
    "click",
    async () => {

      await confirmSession(
        data.id,
        true
      );

    }
  );


  $("#sessionNo")?.addEventListener(
    "click",
    async () => {

      await confirmSession(
        data.id,
        false
      );

    }
  );


  if (type === "activity") {
    loadActivity();
  }


  document
    .querySelectorAll(
      "[data-redeem]"
    )
    .forEach(
      (button) => {

        button.onclick = () => {

          toast(
            "Redemption is available at the 1,000-point milestone."
          );

        };

      }
    );
}


/* =====================================================
   SESSION REQUEST RESPONSE
===================================================== */

async function respondToSessionRequest(
  sessionId,
  approved
) {

  if (!auth.currentUser) {

    closeModal();

    openModal("login");

    return;
  }

  try {

    const sessionReference =
      doc(
        db,
        "sessions",
        sessionId
      );

    const snapshot =
      await getDoc(
        sessionReference
      );

    if (!snapshot.exists()) {

      closeModal();

      toast(
        "This session no longer exists."
      );

      return;
    }

    const session =
      snapshot.data();

    const uid =
      auth.currentUser.uid;


    if (
      !Array.isArray(
        session.userIds
      ) ||
      !session.userIds.includes(uid)
    ) {

      closeModal();

      toast(
        "You are not part of this session."
      );

      return;
    }


    if (
      session.createdBy === uid
    ) {

      closeModal();

      toast(
        "You cannot approve your own request."
      );

      return;
    }


    if (
      session.status !== "pending"
    ) {

      closeModal();

      toast(
        "This session has already been processed."
      );

      return;
    }


    await updateDoc(
      sessionReference,
      {

        status:
          approved
            ? "scheduled"
            : "rejected",

        approvedBy:
          approved
            ? uid
            : null,

        approvedAt:
          approved
            ? serverTimestamp()
            : null

      }
    );


    closeModal();

    toast(
      approved
        ? "Session approved!"
        : "Session request rejected."
    );

    await loadDashboard();

  } catch (error) {

    console.error(
      "Session approval error:",
      error
    );

    toast(
      firebaseError(error)
    );
  }
}


/* =====================================================
   PROFILE
===================================================== */

async function getProfile(uid) {

  if (!uid) return null;

  try {

    const snapshot =
      await getDoc(
        doc(
          db,
          "users",
          uid
        )
      );

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data();

  } catch (error) {

    console.error(
      "Get profile error:",
      error
    );

    return null;
  }
}


/* =====================================================
   DATE FUNCTIONS
===================================================== */

function parseScheduledDate(value) {

  if (!value) {
    return null;
  }

  if (
    typeof value.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function formatSessionDate(value) {

  const date =
    parseScheduledDate(value);

  if (!date) {
    return "Unknown time";
  }

  return date.toLocaleString();
}


/* =====================================================
   INCOMING SESSION REQUESTS
===================================================== */

async function checkIncomingSessionRequests() {

  if (!auth.currentUser) {
    return;
  }

  try {

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "sessions"
          ),

          where(
            "userIds",
            "array-contains",
            auth.currentUser.uid
          )
        )
      );


    for (
      const document
      of snapshot.docs
    ) {

      const session = {

        id:
          document.id,

        ...document.data()

      };


      if (
        session.status !==
        "pending"
      ) {
        continue;
      }


      if (
        session.createdBy ===
        auth.currentUser.uid
      ) {
        continue;
      }


      const requester =
        await getProfile(
          session.createdBy
        );


      const backdrop =
        $("#modalBackdrop");


      if (
        backdrop?.classList.contains(
          "open"
        )
      ) {
        return;
      }


      openModal(
        "sessionRequest",
        {

          ...session,

          requesterName:
            requester?.name ||
            "A SkillSwap member"

        }
      );

      return;
    }

  } catch (error) {

    console.error(
      "Incoming request error:",
      error
    );
  }
}


/* =====================================================
   SESSION CONFIRMATION
===================================================== */

async function confirmSession(
  sessionId,
  completed
) {

  if (!auth.currentUser) {

    closeModal();

    openModal("login");

    return;
  }

  try {

    const sessionReference =
      doc(
        db,
        "sessions",
        sessionId
      );

    const snapshot =
      await getDoc(
        sessionReference
      );

    if (!snapshot.exists()) {

      closeModal();

      toast(
        "This session could not be found."
      );

      return;
    }

    const session =
      snapshot.data();

    const uid =
      auth.currentUser.uid;


    if (
      !Array.isArray(
        session.userIds
      ) ||
      !session.userIds.includes(uid)
    ) {

      closeModal();

      toast(
        "You are not a participant."
      );

      return;
    }


    const start =
      parseScheduledDate(
        session.scheduledAt
      );


    if (start) {

      const endTime =
        start.getTime() +
        Number(
          session.duration || 60
        ) *
        60 *
        1000;


      if (
        Date.now() <
        endTime
      ) {

        closeModal();

        toast(
          "You can confirm after the session ends."
        );

        return;
      }
    }


    const confirmations =
      session.confirmations || {};


    const updatedConfirmations = {

      ...confirmations,

      [uid]:
        completed

    };


    const participants =
      session.userIds || [];


    const bothConfirmed =
      participants.length === 2 &&
      participants.every(
        (participantId) =>
          updatedConfirmations[
            participantId
          ] === true
      );


    const someoneSaidNo =
      participants.some(
        (participantId) =>
          updatedConfirmations[
            participantId
          ] === false
      );


    let rewardStatus =
      "waiting";


    if (someoneSaidNo) {

      rewardStatus =
        "not_eligible";

    } else if (bothConfirmed) {

      rewardStatus =
        "eligible";

    }


    await updateDoc(
      sessionReference,
      {

        [`confirmations.${uid}`]:
          completed,

        rewardStatus,

        status:
          "completed",

        completedAt:
          session.completedAt ||
          serverTimestamp()

      }
    );


    /*
     IMPORTANT:

     If both users say YES,
     we now directly award points
     using a Firestore transaction.

     No Cloud Functions required.
    */

    if (
      bothConfirmed &&
      !session.pointsAwarded
    ) {

      await awardSessionPoints(
        sessionId
      );

    }


    closeModal();


    if (!completed) {

      toast(
        "Confirmation saved. No points will be awarded."
      );

    } else if (bothConfirmed) {

      toast(
        "Both confirmed! Points awarded."
      );

    } else {

      toast(
        "Confirmation saved. Waiting for your partner."
      );
    }


    await loadDashboard();

    await loadWallet();

  } catch (error) {

    console.error(
      "Session confirmation error:",
      error
    );

    toast(
      firebaseError(error)
    );
  }
}


/* =====================================================
   SIMPLE POINT REWARD SYSTEM
===================================================== */

async function awardSessionPoints(
  sessionId
) {

  if (!auth.currentUser) {
    return;
  }


  const sessionReference =
    doc(
      db,
      "sessions",
      sessionId
    );


  await runTransaction(
    db,
    async (transaction) => {

      const sessionSnapshot =
        await transaction.get(
          sessionReference
        );


      if (!sessionSnapshot.exists()) {
        throw new Error(
          "Session does not exist."
        );
      }


      const session =
        sessionSnapshot.data();


      if (
        session.pointsAwarded === true
      ) {
        return;
      }


      const confirmations =
        session.confirmations || {};


      const participants =
        session.userIds || [];


      const bothConfirmed =
        participants.length === 2 &&
        participants.every(
          (uid) =>
            confirmations[uid] === true
        );


      if (!bothConfirmed) {
        return;
      }


      const POINTS =
        100;


      for (
        const uid
        of participants
      ) {

        const userReference =
          doc(
            db,
            "users",
            uid
          );


        const userSnapshot =
          await transaction.get(
            userReference
          );


        const currentPoints =
          Number(
            userSnapshot.data()?.points ||
            0
          );


        transaction.update(
          userReference,
          {

            points:
              currentPoints +
              POINTS,

            lastActivity:
              serverTimestamp()

          }
        );
      }


      transaction.update(
        sessionReference,
        {

          pointsAwarded:
            true,

          rewardStatus:
            "awarded",

          points:
            POINTS,

          pointsAwardedAt:
            serverTimestamp()

        }
      );
    }
  );
}


/* =====================================================
   SESSION CHECK
===================================================== */

async function checkSessions() {

  if (
    !auth.currentUser ||
    !currentUser ||
    sessionCheckRunning
  ) {
    return;
  }

  sessionCheckRunning = true;

  try {

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "sessions"
          ),

          where(
            "userIds",
            "array-contains",
            auth.currentUser.uid
          )
        )
      );


    const sessions =
      snapshot.docs.map(
        (document) => ({

          id:
            document.id,

          ...document.data()

        })
      );


    const now =
      Date.now();


    for (
      const session
      of sessions
    ) {

      if (
        session.status !==
          "scheduled" &&

        session.status !==
          "in_progress" &&

        session.status !==
          "completed"
      ) {
        continue;
      }


      const start =
        parseScheduledDate(
          session.scheduledAt
        );


      if (!start) {
        continue;
      }


      const startTime =
        start.getTime();


      const endTime =
        startTime +

        Number(
          session.duration ||
          60
        ) *

        60 *

        1000;


      /*
      SESSION START
      */

      if (
        now >= startTime &&
        now < endTime &&
        session.status !==
          "completed"
      ) {

        const notifications =
          session.startNotifications ||
          {};


        const alreadyShown =
          notifications[
            auth.currentUser.uid
          ] === true;


        if (!alreadyShown) {

          await updateDoc(
            doc(
              db,
              "sessions",
              session.id
            ),
            {

              [`startNotifications.${auth.currentUser.uid}`]:
                true,

              status:
                "in_progress"

            }
          );


          openModal(
            "sessionStart",
            session
          );

          break;
        }
      }


      /*
      SESSION ENDED
      */

      if (
        now >= endTime
      ) {

        const confirmations =
          session.confirmations ||
          {};


        const myAnswer =
          confirmations[
            auth.currentUser.uid
          ];


        if (
          myAnswer === undefined ||
          myAnswer === null
        ) {

          const backdrop =
            $("#modalBackdrop");


          if (
            backdrop?.classList.contains(
              "open"
            )
          ) {
            continue;
          }


          openModal(
            "sessionComplete",
            session
          );

          break;
        }
      }
    }

  } catch (error) {

    console.error(
      "Session check error:",
      error
    );

  } finally {

    sessionCheckRunning =
      false;
  }
}


/* =====================================================
   SESSION TIMER
===================================================== */

function startSessionTimer() {

  stopSessionTimer();

  checkSessions();

  checkIncomingSessionRequests();


  sessionTimer =
    setInterval(
      () => {

        checkSessions();

        checkIncomingSessionRequests();

        loadDashboard();

      },
      10000
    );
}


function stopSessionTimer() {

  if (sessionTimer) {

    clearInterval(
      sessionTimer
    );

    sessionTimer =
      null;
  }
}


/* =====================================================
   THEME
===================================================== */

function themeInit() {

  const saved =
    localStorage.getItem(
      "skillswap-theme"
    );


  if (
    saved === "light"
  ) {

    document.body.classList.add(
      "light"
    );
  }


  updateThemeIcon();
}


function updateThemeIcon() {

  const button =
    $("#themeToggle");

  if (!button) return;


  button.textContent =
    document.body.classList.contains(
      "light"
    )
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

      document.body.classList.contains(
        "light"
      )
        ? "light"
        : "dark"
    );


    updateThemeIcon();

  }
);


themeInit();


/* =====================================================
   NAVIGATION
===================================================== */

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
  () =>
    loadSkills()
);


document
  .querySelectorAll(
    "[data-scroll]"
  )
  .forEach(
    (button) => {

      button.onclick = () => {

        const target =
          document.querySelector(
            button.dataset.scroll
          );


        target?.scrollIntoView({
          behavior: "smooth"
        });

      };

    }
  );


/* =====================================================
   NAVIGATION AUTH UI
===================================================== */

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


  loginButtons.forEach(
    (button) => {

      if (!button) return;

      button.textContent =
        user
          ? "Log out"
          : "Log in";

    }
  );


  signupButtons.forEach(
    (button) => {

      if (!button) return;


      if (user) {

        button.textContent =
          button.id ===
          "ctaSignup"

            ? "Open dashboard"

            : "My dashboard";

      } else {

        button.textContent =
          button.id ===
          "ctaSignup"

            ? "Join SkillSwap"

            : button.id ===
              "heroSignup"

              ? "Create your profile"

              : "Join free";

      }

    }
  );


  $("#loginBtn").onclick =
    async () => {

      if (auth.currentUser) {

        await signOut(auth);

      } else {

        openModal("login");

      }

    };


  $("#mobileLogin").onclick =
    async () => {

      if (auth.currentUser) {

        await signOut(auth);

      } else {

        openModal("login");

      }

    };


  [

    $("#signupBtn"),

    $("#mobileSignup"),

    $("#heroSignup"),

    $("#ctaSignup")

  ]

    .filter(Boolean)

    .forEach(
      (button) => {

        button.onclick = () => {

          if (auth.currentUser) {

            $("#dashboard")?.scrollIntoView({
              behavior: "smooth"
            });

          } else {

            openModal("signup");

          }

        };

      }
    );
}


/* =====================================================
   AUTH STATE
===================================================== */

onAuthStateChanged(
  auth,
  async (user) => {

    console.log(
      "Firebase auth state:",
      user
        ? `Logged in as ${user.email}`
        : "Logged out"
    );


    currentUser =
      user;


    updateNavigation(
      user
    );


    if (unsubscribeProfile) {

      unsubscribeProfile();

      unsubscribeProfile =
        null;
    }


    if (!user) {

      currentUser =
        null;

      stopSessionTimer();

      await loadSkills();

      await loadDashboard();

      await loadWallet();

      return;
    }


    try {

      const profileReference =
        doc(
          db,
          "users",
          user.uid
        );


      unsubscribeProfile =
        onSnapshot(
          profileReference,

          async (snapshot) => {

            if (snapshot.exists()) {

              currentUser = {

                ...user,

                profile:
                  snapshot.data()

              };

            } else {

              currentUser = {

                ...user,

                profile: {}

              };

            }


            await loadSkills();

            await loadDashboard();

            await loadWallet();


            startSessionTimer();

          },

          (error) => {

            console.error(
              "Profile listener error:",
              error
            );

            toast(
              `Profile error: ${
                firebaseError(error)
              }`
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
/*
=========================================================
CONTINUED — DASHBOARD / SKILLS / WALLET / ACTIVITY
=========================================================
*/

async function loadSkills() {
  const container = $("#skillsGrid");

  if (!container) return;

  try {
    const search =
      getValue("#skillSearch")
        .trim()
        .toLowerCase();

    const snapshot =
      await getDocs(
        collection(db, "users")
      );

    const users = [];

    snapshot.forEach((document) => {
      if (
        auth.currentUser &&
        document.id === auth.currentUser.uid
      ) {
        return;
      }

      const profile = document.data();

      const teach =
        Array.isArray(profile.teach)
          ? profile.teach
          : [];

      const learn =
        Array.isArray(profile.learn)
          ? profile.learn
          : [];

      const searchable = [
        profile.name || "",
        profile.bio || "",
        ...teach,
        ...learn
      ]
        .join(" ")
        .toLowerCase();

      if (
        search &&
        !searchable.includes(search)
      ) {
        return;
      }

      users.push({
        id: document.id,
        ...profile
      });
    });

    if (!users.length) {
      container.innerHTML = `
        <div class="empty">
          No matching SkillSwap members found.
        </div>
      `;
      return;
    }

    container.innerHTML =
      users
        .map((profile) => {
          const teach =
            Array.isArray(profile.teach)
              ? profile.teach
              : [];

          const learn =
            Array.isArray(profile.learn)
              ? profile.learn
              : [];

          return `
            <article class="skill-card">

              <div class="avatar">
                ${esc(
                  initials(
                    profile.name
                  )
                )}
              </div>

              <h3>
                ${esc(
                  profile.name ||
                  "SkillSwap Member"
                )}
              </h3>

              <p>
                ${esc(
                  profile.bio ||
                  "Ready to exchange skills."
                )}
              </p>

              <div class="skill-tags">
                ${teach
                  .map(
                    (skill) =>
                      `<span class="tag">
                        Can teach: ${esc(skill)}
                      </span>`
                  )
                  .join("")}
              </div>

              <div class="skill-tags">
                ${learn
                  .map(
                    (skill) =>
                      `<span class="tag">
                        Wants to learn: ${esc(skill)}
                      </span>`
                  )
                  .join("")}
              </div>

              <p>
                <small>
                  Availability:
                  ${esc(
                    profile.availability ||
                    "Flexible"
                  )}
                </small>
              </p>

              ${
                auth.currentUser
                  ? `
                    <button
                      class="btn primary"
                      data-session-user="${esc(
                        profile.id
                      )}"
                    >
                      Request Session
                    </button>
                  `
                  : `
                    <button
                      class="btn primary"
                      data-login-required
                    >
                      Log in to connect
                    </button>
                  `
              }

            </article>
          `;
        })
        .join("");

    container
      .querySelectorAll(
        "[data-session-user]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const uid =
              button.dataset.sessionUser;

            const profile =
              await getProfile(uid);

            if (!profile) {
              toast(
                "That profile could not be found."
              );
              return;
            }

            openModal(
              "session",
              {
                id: uid,
                ...profile
              }
            );
          }
        );
      });

    container
      .querySelectorAll(
        "[data-login-required]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            openModal("login");
          }
        );
      });

  } catch (error) {
    console.error(
      "Load skills error:",
      error
    );

    showError(
      container,
      error
    );
  }
}


/*
=========================================================
LOAD DASHBOARD
=========================================================
*/

async function loadDashboard() {

  const dashboard =
    $("#dashboard");

  if (!dashboard) return;

  const loggedOut =
    dashboard.querySelector(
      "[data-logged-out]"
    );

  const loggedIn =
    dashboard.querySelector(
      "[data-logged-in]"
    );

  if (!auth.currentUser) {

    if (loggedOut) {
      loggedOut.style.display =
        "";
    }

    if (loggedIn) {
      loggedIn.style.display =
        "none";
    }

    return;
  }

  if (loggedOut) {
    loggedOut.style.display =
      "none";
  }

  if (loggedIn) {
    loggedIn.style.display =
      "";
  }

  try {

    const uid =
      auth.currentUser.uid;

    const profile =
      await getProfile(uid);

    const name =
      profile?.name ||
      auth.currentUser.displayName ||
      "User";

    /*
    -------------------------------------------------------
    BASIC PROFILE UI
    -------------------------------------------------------
    */

    document
      .querySelectorAll(
        "[data-user-name]"
      )
      .forEach(
        (element) => {
          element.textContent =
            name;
        }
      );

    document
      .querySelectorAll(
        "[data-user-points]"
      )
      .forEach(
        (element) => {
          element.textContent =
            Number(
              profile?.points || 0
            );
        }
      );

    document
      .querySelectorAll(
        "[data-user-streak]"
      )
      .forEach(
        (element) => {
          element.textContent =
            Number(
              profile?.streak || 0
            );
        }
      );


    /*
    -------------------------------------------------------
    LOAD SESSIONS
    -------------------------------------------------------
    */

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "sessions"
          ),
          where(
            "userIds",
            "array-contains",
            uid
          )
        )
      );

    const sessions =
      snapshot.docs
        .map(
          (document) => ({
            id:
              document.id,

            ...document.data()
          })
        )
        .sort(
          (a, b) => {

            const dateA =
              parseScheduledDate(
                a.scheduledAt
              )?.getTime() || 0;

            const dateB =
              parseScheduledDate(
                b.scheduledAt
              )?.getTime() || 0;

            return dateB - dateA;
          }
        );


    /*
    -------------------------------------------------------
    PENDING REQUESTS
    -------------------------------------------------------
    */

    const incoming =
      sessions.filter(
        (session) =>
          session.status ===
            "pending" &&
          session.createdBy !== uid
      );

    document
      .querySelectorAll(
        "[data-pending-count]"
      )
      .forEach(
        (element) => {
          element.textContent =
            incoming.length;
        }
      );


    /*
    -------------------------------------------------------
    SESSION LIST
    -------------------------------------------------------
    */

    const list =
      $("#sessionList") ||
      $("#sessionsList");

    if (list) {

      if (!sessions.length) {

        list.innerHTML = `
          <div class="empty">
            No sessions yet.
          </div>
        `;

      } else {

        list.innerHTML =
          sessions
            .map(
              (session) => {

                const partnerId =
                  session.userIds?.find(
                    (id) =>
                      id !== uid
                  );

                const isMine =
                  session.createdBy ===
                  uid;

                const partner =
                  session.partnerName ||
                  "SkillSwap Partner";

                const confirmations =
                  session.confirmations ||
                  {};

                const myConfirmation =
                  confirmations[uid];

                const start =
                  parseScheduledDate(
                    session.scheduledAt
                  );

                const ended =
                  start &&
                  Date.now() >=
                    start.getTime() +
                    Number(
                      session.duration ||
                      60
                    ) *
                    60 *
                    1000;

                let statusText =
                  session.status ||
                  "pending";

                if (
                  session.status ===
                  "pending"
                ) {
                  statusText =
                    isMine
                      ? "Waiting for approval"
                      : "Approval needed";
                }

                if (
                  session.status ===
                  "scheduled"
                ) {
                  statusText =
                    "Scheduled";
                }

                if (
                  session.status ===
                  "in_progress"
                ) {
                  statusText =
                    "In progress";
                }

                if (
                  session.status ===
                  "completed"
                ) {
                  statusText =
                    "Completed";
                }

                if (
                  session.status ===
                  "rejected"
                ) {
                  statusText =
                    "Rejected";
                }

                return `
                  <div
                    class="session-card"
                    data-session-card="${esc(
                      session.id
                    )}"
                    style="cursor:pointer;"
                  >

                    <div>

                      <h3>
                        ${esc(
                          session.topicA ||
                          "Skill exchange"
                        )}
                      </h3>

                      <p>
                        ${esc(
                          formatSessionDate(
                            session.scheduledAt
                          )
                        )}
                      </p>

                      <small>
                        ${Number(
                          session.duration ||
                          60
                        )} minutes
                      </small>

                    </div>

                    <div>

                      <span class="tag">
                        ${esc(
                          statusText
                        )}
                      </span>

                      ${
                        session.status ===
                          "completed"
                          ? `
                            <br>
                            <small>
                              ${
                                myConfirmation ===
                                true
                                  ? "You confirmed"
                                  : myConfirmation ===
                                    false
                                    ? "You declined"
                                    : "Confirmation pending"
                              }
                            </small>
                          `
                          : ""
                      }

                    </div>

                  </div>
                `;
              }
            )
            .join("");


        /*
        -----------------------------------------------------
        SESSION CLICK
        -----------------------------------------------------
        */

        list
          .querySelectorAll(
            "[data-session-card]"
          )
          .forEach(
            (card) => {

              card.addEventListener(
                "click",
                async () => {

                  const sessionId =
                    card.dataset
                      .sessionCard;

                  const session =
                    sessions.find(
                      (item) =>
                        item.id ===
                        sessionId
                    );

                  if (!session) {
                    return;
                  }

                  const partnerId =
                    session.userIds?.find(
                      (id) =>
                        id !== uid
                    );

                  const partnerProfile =
                    partnerId
                      ? await getProfile(
                          partnerId
                        )
                      : null;

                  /*
                  The contact information
                  belongs only to this session.
                  */

                  openModal(
                    "sessionDetails",
                    {
                      ...session,

                      partnerName:
                        partnerProfile?.name ||
                        "SkillSwap Partner"
                    }
                  );

                }
              );

            }
          );

      }

    }


    /*
    -------------------------------------------------------
    QUICK ACTIONS / STATS
    -------------------------------------------------------
    */

    const activeSessions =
      sessions.filter(
        (session) =>
          session.status ===
            "scheduled" ||
          session.status ===
            "in_progress"
      );

    document
      .querySelectorAll(
        "[data-active-sessions]"
      )
      .forEach(
        (element) => {
          element.textContent =
            activeSessions.length;
        }
      );

    document
      .querySelectorAll(
        "[data-completed-sessions]"
      )
      .forEach(
        (element) => {
          element.textContent =
            sessions.filter(
              (session) =>
                session.status ===
                "completed"
            ).length;
        }
      );

  } catch (error) {

    console.error(
      "Load dashboard error:",
      error
    );

  }

}


/*
=========================================================
LOAD WALLET
=========================================================
*/

async function loadWallet() {

  if (!auth.currentUser) {
    return;
  }

  try {

    const profile =
      await getProfile(
        auth.currentUser.uid
      );

    const points =
      Number(
        profile?.points || 0
      );

    document
      .querySelectorAll(
        "[data-wallet-points]"
      )
      .forEach(
        (element) => {
          element.textContent =
            points;
        }
      );

    document
      .querySelectorAll(
        "[data-user-points]"
      )
      .forEach(
        (element) => {
          element.textContent =
            points;
        }
      );

  } catch (error) {

    console.error(
      "Wallet error:",
      error
    );

  }

}


/*
=========================================================
LOAD ACTIVITY
=========================================================
*/

async function loadActivity() {

  const container =
    $("#activityList");

  if (!container) {
    return;
  }

  if (!auth.currentUser) {

    container.innerHTML = `
      <div class="empty">
        Please log in to see your activity.
      </div>
    `;

    return;
  }

  try {

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "pointActivity"
          ),
          where(
            "userId",
            "==",
            auth.currentUser.uid
          )
        )
      );

    const activity =
      snapshot.docs
        .map(
          (document) => ({
            id:
              document.id,

            ...document.data()
          })
        )
        .sort(
          (a, b) => {

            const aTime =
              a.createdAt?.toMillis?.() ||
              0;

            const bTime =
              b.createdAt?.toMillis?.() ||
              0;

            return bTime - aTime;
          }
        );

    if (!activity.length) {

      container.innerHTML = `
        <div class="empty">
          No reward activity yet.
        </div>
      `;

      return;
    }

    container.innerHTML =
      activity
        .map(
          (item) => `
            <div class="activity-item">

              <strong>
                ${esc(
                  item.description ||
                  "SkillSwap reward"
                )}
              </strong>

              <span>
                +${Number(
                  item.points || 0
                )} points
              </span>

            </div>
          `
        )
        .join("");

  } catch (error) {

    console.error(
      "Activity error:",
      error
    );

    container.innerHTML = `
      <div class="error">
        ${esc(
          firebaseError(error)
        )}
      </div>
    `;

  }

}


/*
=========================================================
OPEN PROFILE / WALLET / ACTIVITY BUTTONS
=========================================================
*/

document
  .querySelectorAll(
    "[data-open-profile]"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          if (!auth.currentUser) {
            openModal("login");
            return;
          }

          openModal("profile");

        }
      );

    }
  );


document
  .querySelectorAll(
    "[data-open-activity]"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          if (!auth.currentUser) {
            openModal("login");
            return;
          }

          openModal("activity");

        }
      );

    }
  );


document
  .querySelectorAll(
    "[data-open-redeem]"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          if (!auth.currentUser) {
            openModal("login");
            return;
          }

          openModal("redeem");

        }
      );

    }
  );


/*
=========================================================
GENERAL SESSION BUTTON
=========================================================
*/

document
  .querySelectorAll(
    "[data-create-session]"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          if (!auth.currentUser) {

            openModal("login");

            return;

          }

          const partnerId =
            button.dataset
              .partnerId;

          if (!partnerId) {

            toast(
              "Please select a SkillSwap partner first."
            );

            return;

          }

          getProfile(
            partnerId
          ).then(
            (profile) => {

              if (!profile) {

                toast(
                  "Partner not found."
                );

                return;

              }

              openModal(
                "session",
                {
                  id:
                    partnerId,

                  ...profile
                }
              );

            }
          );

        }
      );

    }
  );


/*
=========================================================
AUTO REFRESH
=========================================================
*/

let dashboardRefreshTimer =
  null;

function startDashboardRefresh() {

  if (dashboardRefreshTimer) {
    clearInterval(
      dashboardRefreshTimer
    );
  }

  dashboardRefreshTimer =
    setInterval(
      async () => {

        if (!auth.currentUser) {
          return;
        }

        await loadDashboard();
        await loadWallet();

      },
      30000
    );

}

function stopDashboardRefresh() {

  if (
    dashboardRefreshTimer
  ) {

    clearInterval(
      dashboardRefreshTimer
    );

    dashboardRefreshTimer =
      null;

  }

}


/*
=========================================================
FINAL AUTH INITIALIZATION
=========================================================
*/

onAuthStateChanged(
  auth,
  async (user) => {

    /*
    The listener above handles the profile.
    This second listener keeps the dashboard
    refresh state synchronized.
    */

    if (user) {

      startDashboardRefresh();

    } else {

      stopDashboardRefresh();

    }

  }
);


/*
=========================================================
CLEANUP
=========================================================
*/

window.addEventListener(
  "beforeunload",
  () => {

    stopSessionTimer();
    stopDashboardRefresh();

    if (unsubscribeProfile) {

      unsubscribeProfile();

      unsubscribeProfile =
        null;

    }

  }
);


/*
=========================================================
GLOBAL HELPERS
=========================================================
*/

window.SkillSwap = {

  openLogin: () =>
    openModal("login"),

  openSignup: () =>
    openModal("signup"),

  openProfile: () =>
    openModal("profile"),

  openActivity: () =>
    openModal("activity"),

  refresh: async () => {

    await loadSkills();
    await loadDashboard();
    await loadWallet();

  }

};


/*
=========================================================
INITIAL PAGE LOAD
=========================================================
*/

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    await loadSkills();

    if (auth.currentUser) {

      await loadDashboard();
      await loadWallet();

    }

  }
);