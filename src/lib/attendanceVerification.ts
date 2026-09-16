// src/lib/attendanceVerification.ts

import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";

export interface AttendanceVerificationResult {
  hasScan: boolean;
  status: "Present" | "Partial" | "Excused_Absent" | "Absent" | "Unverified";
  checkInTime?: string;
  source: "kiosk" | "register" | "none";
}

export const verifyLearnerAttendanceForDate = async (
  learnerId: string,
  cohortId: string,
  dateString: string,
): Promise<AttendanceVerificationResult> => {
  try {
    // 1. Check digital attendance_records (kiosk / Zoom scans)
    const recsQ = query(
      collection(db, "attendance_records"),
      where("cohortId", "==", cohortId),
      where("sessionDate", "==", dateString),
    );
    const recsSnap = await getDocs(recsQ);

    let matchedRec = recsSnap.docs.find((d) => {
      const data = d.data();
      return data.learnerId === learnerId || data.idNumber === learnerId;
    });

    if (matchedRec) {
      const data = matchedRec.data();
      return {
        hasScan:
          data.status === "Present" ||
          data.status === "Partial" ||
          data.status === "Excused_Absent",
        status: data.status || "Present",
        checkInTime: data.checkInTime || data.timestamp || undefined,
        source: "kiosk",
      };
    }

    // 2. Fallback to QCTO register collection ('attendance')
    const attQ = query(
      collection(db, "attendance"),
      where("cohortId", "==", cohortId),
      where("date", "==", dateString),
    );
    const attSnap = await getDocs(attQ);

    if (!attSnap.empty) {
      const attData = attSnap.docs[0].data();
      const isPresent =
        Array.isArray(attData.presentLearners) &&
        attData.presentLearners.includes(learnerId);
      const isPartial =
        Array.isArray(attData.partialLearners) &&
        attData.partialLearners.includes(learnerId);
      const isExcused =
        Array.isArray(attData.excusedLearners) &&
        attData.excusedLearners.includes(learnerId);

      let status: "Present" | "Partial" | "Excused_Absent" | "Absent" =
        "Absent";
      if (isPresent) status = "Present";
      else if (isPartial) status = "Partial";
      else if (isExcused) status = "Excused_Absent";

      return {
        hasScan: status !== "Absent",
        status,
        source: "register",
      };
    }

    return { hasScan: false, status: "Unverified", source: "none" };
  } catch (err) {
    console.error("Error verifying attendance scan:", err);
    return { hasScan: false, status: "Unverified", source: "none" };
  }
};
