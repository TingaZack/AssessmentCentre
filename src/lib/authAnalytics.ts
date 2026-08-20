// src/lib/authAnalytics.ts

import {
  doc,
  updateDoc,
  increment,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";

export const recordUserLogin = async (uid: string) => {
  try {
    // console.log(`🚀 [Analytics] Updating lastLoginAt for UID: ${uid}...`);

    // 1. Update the 'users' document
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
      loginCount: increment(1),
      updatedAt: new Date().toISOString(),
    });

    // 2. Also update the corresponding 'learners' document if one exists
    const learnersQ = query(
      collection(db, "learners"),
      where("authUid", "==", uid),
    );
    const snap = await getDocs(learnersQ);

    if (!snap.empty) {
      const batchPromises = snap.docs.map((learnerDoc) =>
        updateDoc(doc(db, "learners", learnerDoc.id), {
          lastLoginAt: serverTimestamp(),
          updatedAt: new Date().toISOString(),
        }),
      );
      await Promise.all(batchPromises);
      //   console.log(
      //     `✅ [Analytics] Updated 'learners' collection for ${snap.docs.length} enrollment record(s).`,
      //   );
    }

    // console.log(`✅ [Analytics] Login recording complete.`);
  } catch (error: any) {
    console.error("[Analytics Error]:", error.message);
  }
};

export const recordDailyActivityIfNeeded = async (uid: string) => {
  if (!uid) return;

  const todayStr = new Date().toISOString().split("T")[0];
  const sessionKey = `active_date_${uid}`;
  const lastRecordedDate = sessionStorage.getItem(sessionKey);

  //   console.log(
  //     `🔍 [Analytics] Checking daily login status for UID ${uid}. Last recorded today: ${lastRecordedDate === todayStr}`,
  //   );

  if (lastRecordedDate !== todayStr) {
    sessionStorage.setItem(sessionKey, todayStr);
    await recordUserLogin(uid);
  }
};
