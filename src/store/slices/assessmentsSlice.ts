// src/store/slices/assessmentsSlice.ts

import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { StateCreator } from "zustand";

export interface Assessment {
  id: string;
  title: string;
  type: "formative" | "summative";
  cohortId: string;
  status: "draft" | "upcoming" | "scheduled" | "active" | "completed";
  scheduledDate?: string;
  durationMinutes: number;
  questionCount: number;
  pendingMarkingCount?: number;
  requiresInvigilation?: boolean;
  moduleInfo?: {
    qualificationTitle?: string;
    moduleNumber?: string;
  };
  createdAt?: string;
  lastUpdated?: string;
  createdBy?: string;
  facilitatorId?: string;
  collaboratorIds?: string[];
  blocks?: any[];
}

export interface AssessmentsSlice {
  assessments: Assessment[];
  isFetchingAssessments: boolean;
  fetchAssessments: (force?: boolean) => Promise<void>;
  duplicateAssessment: (id: string, userUid: string) => Promise<string>;
  deleteAssessment: (id: string) => Promise<void>;
}

// Helper to scrub all undefined values recursively across nested objects and arrays
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj === "object" && !(obj instanceof Date)) {
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cleaned[key] =
          obj[key] === undefined ? null : sanitizeForFirestore(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
};

// We use `any` for the overall store state type so it plugs easily into your main useStore
export const createAssessmentsSlice: StateCreator<
  any,
  [],
  [],
  AssessmentsSlice
> = (set, get) => ({
  assessments: [],
  isFetchingAssessments: false,

  fetchAssessments: async (force = false) => {
    const state = get();
    const user = state.user; // Pulling the user from your main store

    if (!user?.uid) return;

    // 🚀 CACHE LOGIC: If we already have data and aren't forcing a refresh, skip loading!
    if (state.assessments.length > 0 && !force) return;

    set({ isFetchingAssessments: true });

    try {
      let docsToProcess = [];

      if (user.role === "admin") {
        const q = query(collection(db, "assessments"));
        const snap = await getDocs(q);
        // Ensure id is forced to the exact document reference key
        docsToProcess = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      } else {
        // Fetch all relevant assessments concurrently
        const [q1Snap, q2Snap, q3Snap] = await Promise.all([
          getDocs(
            query(
              collection(db, "assessments"),
              where("createdBy", "==", user.uid),
            ),
          ),
          getDocs(
            query(
              collection(db, "assessments"),
              where("facilitatorId", "==", user.uid),
            ),
          ),
          getDocs(
            query(
              collection(db, "assessments"),
              where("collaboratorIds", "array-contains", user.uid),
            ),
          ),
        ]);

        // Merge and deduplicate using a Map
        const map = new Map();
        [...q1Snap.docs, ...q2Snap.docs, ...q3Snap.docs].forEach((d) => {
          map.set(d.id, { ...d.data(), id: d.id });
        });
        docsToProcess = Array.from(map.values());
      }

      // Fetch pending submission counts concurrently
      const finalData = await Promise.all(
        docsToProcess.map(async (test: any) => {
          const subQ = query(
            collection(db, "learner_submissions"),
            where("assessmentId", "==", test.id),
            where("status", "==", "submitted"),
          );
          const subSnap = await getDocs(subQ);
          return { ...test, pendingMarkingCount: subSnap.size };
        }),
      );

      // Sort newest first
      finalData.sort(
        (a, b) =>
          new Date(b.lastUpdated || b.createdAt || 0).getTime() -
          new Date(a.lastUpdated || a.createdAt || 0).getTime(),
      );

      set({ assessments: finalData });
    } catch (error) {
      console.error("[Store] Error fetching assessments:", error);
    } finally {
      set({ isFetchingAssessments: false });
    }
  },

  duplicateAssessment: async (id: string, userUid: string) => {
    const { assessments } = get();

    // 🚀 Clone directly from the local cache! No server fetch needed!
    const original = assessments.find((a: Assessment) => a.id === id);

    if (!original) {
      console.error(
        `[Store] Assessment ${id} not found in cache. Valid keys:`,
        assessments.map((a: Assessment) => a.id),
      );
      throw new Error("Original assessment not found in local cache.");
    }

    const newRef = doc(collection(db, "assessments"));
    const activeUid = userUid || null;

    const rawAssessment = {
      ...original,
      title: `${original.title || "Untitled"} (Copy)`,
      status: "draft",
      cohortIds: [],
      cohortId: null,
      scheduledDate: null,
      isScheduled: false,
      collaboratorIds: [],
      autoCloseTaskId: null,
      requiresInvigilation: original.requiresInvigilation ?? false,
      createdBy: activeUid || original.createdBy || null,
      facilitatorId: activeUid || original.facilitatorId || null,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    // Strip the old ID before pushing to DB to prevent internal conflicts
    delete (rawAssessment as any).id;

    // Clean all undefined values recursively across the entire document payload
    const cleanedAssessment = sanitizeForFirestore(rawAssessment);

    await setDoc(newRef, cleanedAssessment);
    console.log(`[Store] Duplication successful. New ID: ${newRef.id}`);

    // Optimistically update the UI instantly
    const finalizedCopy = { ...cleanedAssessment, id: newRef.id } as Assessment;
    set({ assessments: [finalizedCopy, ...assessments] });

    return newRef.id;
  },

  deleteAssessment: async (id: string) => {
    await deleteDoc(doc(db, "assessments", id));
    // Remove from local cache instantly
    set((state: any) => ({
      assessments: state.assessments.filter((a: Assessment) => a.id !== id),
    }));
  },
});
