const {
  onDocumentUpdated
} = require("firebase-functions/v2/firestore");

const {
  initializeApp
} = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue
} = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();


/*
=========================================================
REWARD CONFIG
=========================================================
*/

const POINTS_PER_SESSION = 100;


/*
=========================================================
HELPER
=========================================================
*/

function getSessionEndTime(session) {

  if (!session?.scheduledAt) {
    return null;
  }

  let startTime;

  if (
    typeof session.scheduledAt.toMillis ===
    "function"
  ) {

    startTime =
      session.scheduledAt.toMillis();

  } else {

    startTime =
      new Date(
        session.scheduledAt
      ).getTime();

  }

  if (
    !Number.isFinite(startTime)
  ) {
    return null;
  }

  const duration =
    Number(
      session.duration || 60
    );

  return (
    startTime +
    duration *
    60 *
    1000
  );

}


/*
=========================================================
PROCESS SESSION REWARD
=========================================================
*/

exports.processSessionReward =
  onDocumentUpdated(
    "sessions/{sessionId}",

    async (event) => {

      const before =
        event.data?.before?.data();

      const after =
        event.data?.after?.data();


      if (
        !before ||
        !after
      ) {
        return;
      }


      /*
      =====================================================
      BASIC SESSION CHECKS
      =====================================================
      */

      const userIds =
        Array.isArray(after.userIds)
          ? after.userIds
          : [];


      if (
        userIds.length !== 2
      ) {
        return;
      }


      const confirmations =
        after.confirmations ||
        {};


      const firstUserConfirmed =
        confirmations[
          userIds[0]
        ] === true;


      const secondUserConfirmed =
        confirmations[
          userIds[1]
        ] === true;


      /*
      =====================================================
      BOTH MUST CONFIRM YES
      =====================================================
      */

      if (
        !firstUserConfirmed ||
        !secondUserConfirmed
      ) {

        /*
        If either user said NO,
        this session can never receive
        a reward.
        */

        if (
          confirmations[userIds[0]] === false ||
          confirmations[userIds[1]] === false
        ) {

          if (
            after.rewardStatus !==
            "not_eligible"
          ) {

            await event.data.after.ref.update(
              {
                rewardStatus:
                  "not_eligible"
              }
            );

          }

        }

        return;

      }


      /*
      =====================================================
      ALREADY REWARDED
      =====================================================
      */

      if (
        after.pointsAwarded === true ||
        after.rewardStatus === "awarded"
      ) {

        return;

      }


      /*
      =====================================================
      SESSION MUST ACTUALLY BE OVER
      =====================================================
      */

      const endTime =
        getSessionEndTime(
          after
        );


      if (
        !endTime ||
        Date.now() < endTime
      ) {

        return;

      }


      /*
      =====================================================
      TRANSACTION
      =====================================================
      */

      const sessionRef =
        event.data.after.ref;


      await db.runTransaction(
        async (transaction) => {

          const freshSnapshot =
            await transaction.get(
              sessionRef
            );


          if (
            !freshSnapshot.exists
          ) {
            return;
          }


          const session =
            freshSnapshot.data();


          const ids =
            Array.isArray(
              session.userIds
            )
              ? session.userIds
              : [];


          const confirms =
            session.confirmations ||
            {};


          /*
          Re-check everything inside
          the transaction.
          */

          if (
            ids.length !== 2
          ) {
            return;
          }


          if (
            confirms[ids[0]] !== true ||
            confirms[ids[1]] !== true
          ) {
            return;
          }


          if (
            session.pointsAwarded === true ||
            session.rewardStatus === "awarded"
          ) {
            return;
          }


          const freshEndTime =
            getSessionEndTime(
              session
            );


          if (
            !freshEndTime ||
            Date.now() < freshEndTime
          ) {
            return;
          }


          /*
          =================================================
          USER REFERENCES
          =================================================
          */

          const userRefs =
            ids.map(
              (uid) =>
                db
                  .collection("users")
                  .doc(uid)
            );


          /*
          =================================================
          POINT EVENT REFERENCES
          =================================================
          */

          const pointEventRefs =
            ids.map(
              () =>
                db
                  .collection("pointEvents")
                  .doc()
            );


          /*
          =================================================
          GIVE POINTS TO BOTH USERS
          =================================================
          */

          for (
            let i = 0;
            i < userRefs.length;
            i++
          ) {

            transaction.update(
              userRefs[i],
              {

                points:
                  FieldValue.increment(
                    POINTS_PER_SESSION
                  ),

                lastActivity:
                  FieldValue.serverTimestamp()

              }
            );


            transaction.set(
              pointEventRefs[i],
              {

                userId:
                  ids[i],

                sessionId:
                  event.data.after.id,

                points:
                  POINTS_PER_SESSION,

                reason:
                  "Completed SkillSwap session",

                createdAt:
                  FieldValue.serverTimestamp()

              }
            );

          }


          /*
          =================================================
          MARK SESSION AS REWARDED
          =================================================
          */

          transaction.update(
            sessionRef,
            {

              rewardStatus:
                "awarded",

              pointsAwarded:
                true,

              pointsAwardedAt:
                FieldValue.serverTimestamp()

            }
          );

        }
      );

    }
  );