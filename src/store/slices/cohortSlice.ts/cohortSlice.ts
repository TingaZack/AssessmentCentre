// src/store/slices/cohortSlice.ts

import {
  collection,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import type { Cohort } from "../../../types";
import type { StateCreator } from "zustand";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface CohortSlice {
  cohorts: Cohort[];
  cohortsLoading: boolean;
  cohortsError: string | null;
  fetchCohorts: (force?: boolean) => Promise<void>;
  addCohort: (cohort: Omit<Cohort, "id" | "createdAt">) => Promise<void>;
  updateCohort: (
    id: string,
    updates: Partial<Cohort>,
    reasons?: { facilitator?: string; assessor?: string; moderator?: string },
  ) => Promise<void>;
  deleteCohort: (id: string) => Promise<void>;
}

// ─── IMPLEMENTATION ───────────────────────────────────────────────────────────

export const createCohortSlice: StateCreator<
  any,
  [["zustand/immer", never]],
  [],
  CohortSlice
> = (set, get, _) => ({
  cohorts: [],
  cohortsLoading: false,
  cohortsError: null,

  // fetchCohorts: async (force = false) => {
  //   const { cohorts, cohortsLoading } = get();
  //   if (!force && cohorts.length > 0) return;
  //   if (cohortsLoading) return;

  //   set({ cohortsLoading: true, cohortsError: null });
  //   try {
  //     const q = query(collection(db, "cohorts"), orderBy("name"));
  //     const snapshot = await getDocs(q);
  //     const list = snapshot.docs.map(
  //       (doc) => ({ id: doc.id, ...doc.data() }) as Cohort,
  //     );

  //     set({ cohorts: list, cohortsLoading: false });
  //   } catch (error: any) {
  //     console.error("Failed to fetch cohorts:", error);
  //     set({ cohortsLoading: false, cohortsError: error.message });
  //   }
  // },

  fetchCohorts: async (force = false) => {
    // We remove the strict `if (cohortsLoading) return;` to prevent the race condition abort.
    // We still respect the cache if force is false.
    const { cohorts } = get();
    if (!force && cohorts.length > 0) return;

    set((state: any) => {
      state.cohortsLoading = true;
      state.cohortsError = null;
    });

    try {
      const q = query(collection(db, "cohorts"), orderBy("name"));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as Cohort,
      );

      set((state: any) => {
        state.cohorts = list;
        state.cohortsLoading = false;
      });
    } catch (error: any) {
      console.error("Failed to fetch cohorts:", error);
      set((state: any) => {
        state.cohortsLoading = false;
        state.cohortsError = error.message;
      });
    }
  },

  addCohort: async (newCohort) => {
    const batch = writeBatch(db);
    const timestamp = new Date().toISOString();

    // 1. Setup Cohort Document
    const cohortRef = doc(collection(db, "cohorts"));
    const cohortId = cohortRef.id;
    const cohortData = {
      ...newCohort,
      id: cohortId,
      createdAt: timestamp,
      isArchived: false,
    };

    batch.set(cohortRef, cohortData);

    // 2. THE HANDSHAKE: Sync Learners to this new Cohort
    if (newCohort.learnerIds && newCohort.learnerIds.length > 0) {
      newCohort.learnerIds.forEach((learnerId: string) => {
        const learnerRef = doc(db, "learners", learnerId);
        batch.update(learnerRef, {
          cohortId: cohortId,
          updatedAt: timestamp,
        });
      });
    }

    try {
      await batch.commit();

      set((state: any) => {
        state.cohorts.push(cohortData);
        // Optimistically update local learners if they exist in the state
        if (state.learners) {
          state.learners.forEach((l: any) => {
            if (newCohort.learnerIds.includes(l.id)) {
              l.cohortId = cohortId;
            }
          });
        }
      });
    } catch (error) {
      console.error("Failed to add cohort and sync learners:", error);
      throw error;
    }
  },

  updateCohort: async (id, updates, reasons) => {
    const { cohorts } = get();
    const currentCohort = cohorts.find((c: any) => c.id === id);

    if (!currentCohort) {
      console.error("Cohort not found in local state");
      return;
    }

    const batch = writeBatch(db);
    const timestamp = new Date().toISOString();
    const adminId = "admin-user-id";

    const oldIds = currentCohort.learnerIds || [];

    // --- 1. QCTO STAFF HISTORY LOGIC (Audit Trail) ---
    // Create a shallow copy of the history array
    let newHistory = [...(currentCohort.staffHistory || [])];

    const handleRoleChange = (
      role: "facilitator" | "assessor" | "moderator",
      newId: string | undefined,
      oldId: string,
      reason?: string,
    ) => {
      if (newId && newId !== oldId) {
        // ✅ IMMUTABLE UPDATE: Use .map to find the entry and return a NEW object
        newHistory = newHistory.map((h) => {
          if (h.role === role && h.staffId === oldId && h.removedAt === null) {
            // Return a new object with the removedAt timestamp
            return { ...h, removedAt: timestamp };
          }
          return h;
        });

        // Push the new assignment entry
        newHistory.push({
          staffId: newId,
          role: role,
          assignedAt: timestamp,
          removedAt: null,
          assignedBy: adminId,
          changeReason: reason || "Role Update",
        });
      }
    };

    if (updates.facilitatorId)
      handleRoleChange(
        "facilitator",
        updates.facilitatorId,
        currentCohort.facilitatorId,
        reasons?.facilitator,
      );
    if (updates.assessorId)
      handleRoleChange(
        "assessor",
        updates.assessorId,
        currentCohort.assessorId,
        reasons?.assessor,
      );
    if (updates.moderatorId)
      handleRoleChange(
        "moderator",
        updates.moderatorId,
        currentCohort.moderatorId,
        reasons?.moderator,
      );

    // --- 2. LEARNER SYNC LOGIC (The "Handshake") ---
    if (updates.learnerIds) {
      const newIds = updates.learnerIds;

      const added = newIds.filter((lid: string) => !oldIds.includes(lid));
      const removed = oldIds.filter((lid: string) => !newIds.includes(lid));

      added.forEach((lid: string) => {
        batch.update(doc(db, "learners", lid), {
          cohortId: id,
          updatedAt: timestamp,
        });
      });

      removed.forEach((lid: string) => {
        batch.update(doc(db, "learners", lid), {
          cohortId: "Unassigned",
          updatedAt: timestamp,
        });
      });
    }

    // --- 3. DATABASE UPDATE ---
    const cohortRef = doc(db, "cohorts", id);
    const finalPayload = {
      ...currentCohort,
      ...updates,
      staffHistory: newHistory,
      updatedAt: timestamp,
    };

    // Strip ID before saving to document body
    const { id: _, ...dataToSave } = finalPayload;
    batch.update(cohortRef, dataToSave);

    try {
      await batch.commit();

      // --- 4. LOCAL STATE UPDATE ---
      set((state: any) => {
        const idx = state.cohorts.findIndex((c: any) => c.id === id);
        // Note: If you are using Zustand with Immer, direct mutation is fine.
        // If not, you should return a new state object.
        if (idx !== -1) {
          state.cohorts[idx] = finalPayload;
        }

        // Sync local learners slice so UI updates instantly
        if (state.learners && updates.learnerIds) {
          state.learners.forEach((l: any) => {
            if (updates.learnerIds?.includes(l.id)) {
              l.cohortId = id;
            } else if (oldIds.includes(l.id)) {
              l.cohortId = "Unassigned";
            }
          });
        }
      });
    } catch (error) {
      console.error("Critical Sync Failure:", error);
      throw error;
    }
  },

  deleteCohort: async (id) => {
    try {
      await deleteDoc(doc(db, "cohorts", id));
      set((state: any) => {
        state.cohorts = state.cohorts.filter((c: Cohort) => c.id !== id);
      });
    } catch (error) {
      console.error("Failed to delete cohort", error);
      throw error;
    }
  },
});
