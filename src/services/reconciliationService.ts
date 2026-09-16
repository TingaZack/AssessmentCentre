import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

interface ReconcileParams {
  eventId: string;
  eventTitle: string;
  eventDate: string; // "YYYY-MM-DD"
  cohortIds: string[];
}

export async function reconcilePastEventAttendance({
  eventId,
  eventTitle,
  eventDate,
  cohortIds,
}: ReconcileParams) {
  // 1. Fetch all confirmed guests / learners for this ecosystem event
  const guestsRef = collection(db, "ecosystem_events", eventId, "guests");
  const guestQuery = query(
    guestsRef,
    where("status", "in", ["attended", "checked_in"]),
  );
  const guestSnap = await getDocs(guestQuery);

  if (guestSnap.empty) {
    return {
      updatedCount: 0,
      message: "No attended guests found for this event.",
    };
  }

  // Extract learner IDs or email addresses associated with guests
  const attendedEmails = new Set<string>();
  const attendedLearnerIds = new Set<string>();

  guestSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.learnerId) attendedLearnerIds.add(data.learnerId);
    if (data.email) attendedEmails.add(data.email.toLowerCase());
  });

  // 2. Fetch enrolled learners across target cohorts to map emails -> learner IDs
  const batch = writeBatch(db);
  let reconcileCount = 0;

  for (const cohortId of cohortIds) {
    const learnersRef = collection(db, "cohorts", cohortId, "learners");
    const learnersSnap = await getDocs(learnersRef);

    learnersSnap.docs.forEach((learnerDoc) => {
      const learner = learnerDoc.data();
      const learnerId = learnerDoc.id;
      const learnerEmail = learner.email?.toLowerCase();

      // Check if learner attended either by explicit learnerId or matching email
      const didAttend =
        attendedLearnerIds.has(learnerId) ||
        (learnerEmail && attendedEmails.has(learnerEmail));

      if (didAttend) {
        // Doc ID format: {cohortId}_{YYYY-MM-DD}_{learnerId}
        const dailyRecordRef = doc(
          db,
          "attendance",
          `${cohortId}_${eventDate}_${learnerId}`,
        );

        batch.set(
          dailyRecordRef,
          {
            cohortId,
            learnerId,
            date: eventDate,
            status: "Present - Workshop",
            notes: `Attended Curriculum Workshop: ${eventTitle}`,
            syncedFromEventId: eventId,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        reconcileCount++;
      }
    });
  }

  // 3. Commit the batch update
  if (reconcileCount > 0) {
    await batch.commit();
  }

  return {
    updatedCount: reconcileCount,
    message: `Successfully credited ${reconcileCount} learners in daily logbooks.`,
  };
}
