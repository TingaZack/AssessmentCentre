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

  fetchCohorts: async (force = false) => {
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
    } catch (systemError: any) {
      console.error("Failed to fetch cohorts:", systemError);
      set((state: any) => {
        state.cohortsLoading = false;
        state.cohortsError = systemError.message;
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

    // 2. THE HANDSHAKE: Sync Learners & Create Enrollment Ledger
    if (newCohort.learnerIds && newCohort.learnerIds.length > 0) {
      newCohort.learnerIds.forEach((learnerId: string) => {
        // A. Update the learner profile pointer (fast UI loading)
        // learnerId is now strictly their idNumber
        const learnerRef = doc(db, "learners", learnerId);
        batch.set(
          learnerRef,
          { cohortId: cohortId, updatedAt: timestamp },
          { merge: true },
        );

        // B. Create the official Enrollment Ledger document
        // Composite ID guarantees no double-enrollment in the same exact class
        const enrollmentId = `${cohortId}_${learnerId}`;
        const enrollmentRef = doc(db, "enrollments", enrollmentId);
        batch.set(
          enrollmentRef,
          {
            id: enrollmentId,
            learnerId: learnerId,
            cohortId: cohortId,
            programmeId: newCohort.programmeId || "", // Strict validation mapping
            status: "active",
            enrolledAt: timestamp,
            assignedBy: "System",
            isArchived: false,
          },
          { merge: true },
        );

        // C. Clean up any corrupted legacy "Unassigned" records
        batch.delete(doc(db, "enrollments", `Unassigned_${learnerId}`));
      });
    }

    try {
      await batch.commit();

      set((state: any) => {
        state.cohorts.push(cohortData);
        if (state.learners) {
          state.learners.forEach((l: any) => {
            if (newCohort.learnerIds?.includes(l.id)) {
              l.cohortId = cohortId;
            }
          });
        }
      });
    } catch (systemError) {
      console.error("Failed to add cohort and sync learners:", systemError);
      throw systemError;
    }
  },

  updateCohort: async (id, updates, reasons) => {
    const { cohorts } = get();
    const currentCohort = cohorts.find((c: any) => c.id === id);

    // 🛑 VALIDATION: Prevent acting on non-existent data
    if (!currentCohort) {
      throw new ReferenceError(
        "Update Failed: Target Cohort not found in local state.",
      );
    }

    const batch = writeBatch(db);
    const timestamp = new Date().toISOString();
    const adminId = "System";

    const oldIds = currentCohort.learnerIds || [];

    // --- 1. QCTO STAFF HISTORY LOGIC (Audit Trail) ---
    let newHistory = [...(currentCohort.staffHistory || [])];

    const handleRoleChange = (
      role: "facilitator" | "assessor" | "moderator",
      newId: string | undefined,
      oldId: string,
      reason?: string,
    ) => {
      if (newId && newId !== oldId) {
        newHistory = newHistory.map((h) => {
          if (h.role === role && h.staffId === oldId && h.removedAt === null) {
            return { ...h, removedAt: timestamp };
          }
          return h;
        });

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

    // --- 2. LEARNER SYNC LOGIC (The Ledger Handshake) ---
    if (updates.learnerIds) {
      const newIds = updates.learnerIds;

      const added = newIds.filter((lid: string) => !oldIds.includes(lid));
      const removed = oldIds.filter((lid: string) => !newIds.includes(lid));

      added.forEach((lid: string) => {
        // A. Set fast-pointer on Learner profile to active class
        batch.set(
          doc(db, "learners", lid),
          { cohortId: id, updatedAt: timestamp },
          { merge: true },
        );

        // B. Create the new active Enrollment Ledger entry
        const enrollmentId = `${id}_${lid}`;
        batch.set(
          doc(db, "enrollments", enrollmentId),
          {
            id: enrollmentId,
            learnerId: lid,
            cohortId: id,
            programmeId: currentCohort.programmeId || "",
            status: "active",
            enrolledAt: timestamp,
            assignedBy: "System",
            isArchived: false,
          },
          { merge: true },
        );

        // Clean up legacy ghost
        batch.delete(doc(db, "enrollments", `Unassigned_${lid}`));
      });

      removed.forEach((lid: string) => {
        // A. Remove fast-pointer from Learner profile (Move to Dormant State)
        batch.set(
          doc(db, "learners", lid),
          { cohortId: "", status: "dropped", updatedAt: timestamp }, // 🚀 STRICT EMPTY STRING
          { merge: true },
        );

        // B. Close out the Enrollment Ledger entry (DO NOT DELETE!)
        // Marks them as dropped so we maintain an audit trail
        const enrollmentId = `${id}_${lid}`;
        batch.set(
          doc(db, "enrollments", enrollmentId),
          {
            status: "dropped",
            exitDate: timestamp,
            exitReason: "Removed via Class Roster Management",
            updatedAt: timestamp,
          },
          { merge: true },
        );
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

    const { id: _, ...dataToSave } = finalPayload;

    batch.set(cohortRef, dataToSave, { merge: true });

    try {
      await batch.commit();

      // --- 4. LOCAL STATE UPDATE ---
      set((state: any) => {
        const idx = state.cohorts.findIndex((c: any) => c.id === id);
        if (idx !== -1) {
          state.cohorts[idx] = finalPayload;
        }

        if (state.learners && updates.learnerIds) {
          state.learners.forEach((l: any) => {
            if (updates.learnerIds?.includes(l.id)) {
              l.cohortId = id;
              l.status = "active";
            } else if (oldIds.includes(l.id)) {
              // 🚀 NO FALLBACKS: Force them into Dormant status
              l.cohortId = "";
              l.status = "dropped";
            }
          });
        }
      });
    } catch (systemError) {
      console.error("Critical Sync Failure on Cohort Update:", systemError);
      throw systemError;
    }
  },

  deleteCohort: async (id) => {
    try {
      await deleteDoc(doc(db, "cohorts", id));
      set((state: any) => {
        state.cohorts = state.cohorts.filter((c: Cohort) => c.id !== id);
      });
    } catch (systemError) {
      console.error("Failed to delete cohort", systemError);
      throw systemError;
    }
  },
});

// // src/store/slices/cohortSlice.ts

// import {
//   collection,
//   getDocs,
//   deleteDoc,
//   query,
//   orderBy,
//   doc,
//   writeBatch,
// } from "firebase/firestore";
// import { db } from "../../../lib/firebase";
// import type { Cohort } from "../../../types";
// import type { StateCreator } from "zustand";

// // ─── TYPES ────────────────────────────────────────────────────────────────────

// export interface CohortSlice {
//   cohorts: Cohort[];
//   cohortsLoading: boolean;
//   cohortsError: string | null;
//   fetchCohorts: (force?: boolean) => Promise<void>;
//   addCohort: (cohort: Omit<Cohort, "id" | "createdAt">) => Promise<void>;
//   updateCohort: (
//     id: string,
//     updates: Partial<Cohort>,
//     reasons?: { facilitator?: string; assessor?: string; moderator?: string },
//   ) => Promise<void>;
//   deleteCohort: (id: string) => Promise<void>;
// }

// // ─── IMPLEMENTATION ───────────────────────────────────────────────────────────

// export const createCohortSlice: StateCreator<
//   any,
//   [["zustand/immer", never]],
//   [],
//   CohortSlice
// > = (set, get, _) => ({
//   cohorts: [],
//   cohortsLoading: false,
//   cohortsError: null,

//   fetchCohorts: async (force = false) => {
//     const { cohorts } = get();
//     if (!force && cohorts.length > 0) return;

//     set((state: any) => {
//       state.cohortsLoading = true;
//       state.cohortsError = null;
//     });

//     try {
//       const q = query(collection(db, "cohorts"), orderBy("name"));
//       const snapshot = await getDocs(q);
//       const list = snapshot.docs.map(
//         (doc) => ({ id: doc.id, ...doc.data() }) as Cohort,
//       );

//       set((state: any) => {
//         state.cohorts = list;
//         state.cohortsLoading = false;
//       });
//     } catch (error: any) {
//       console.error("Failed to fetch cohorts:", error);
//       set((state: any) => {
//         state.cohortsLoading = false;
//         state.cohortsError = error.message;
//       });
//     }
//   },

//   addCohort: async (newCohort) => {
//     const batch = writeBatch(db);
//     const timestamp = new Date().toISOString();

//     // 1. Setup Cohort Document
//     const cohortRef = doc(collection(db, "cohorts"));
//     const cohortId = cohortRef.id;
//     const cohortData = {
//       ...newCohort,
//       id: cohortId,
//       createdAt: timestamp,
//       isArchived: false,
//     };

//     batch.set(cohortRef, cohortData);

//     // 2. THE HANDSHAKE: Sync Learners to this new Cohort
//     if (newCohort.learnerIds && newCohort.learnerIds.length > 0) {
//       newCohort.learnerIds.forEach((learnerId: string) => {
//         const learnerRef = doc(db, "learners", learnerId);
//         // 🚀 BULLETPROOF UPSERT: Use set with merge instead of update
//         batch.set(
//           learnerRef,
//           {
//             cohortId: cohortId,
//             updatedAt: timestamp,
//           },
//           { merge: true },
//         );
//       });
//     }

//     try {
//       await batch.commit();

//       set((state: any) => {
//         state.cohorts.push(cohortData);
//         // Optimistically update local learners if they exist in the state
//         if (state.learners) {
//           state.learners.forEach((l: any) => {
//             if (newCohort.learnerIds.includes(l.id)) {
//               l.cohortId = cohortId;
//             }
//           });
//         }
//       });
//     } catch (error) {
//       console.error("Failed to add cohort and sync learners:", error);
//       throw error;
//     }
//   },

//   updateCohort: async (id, updates, reasons) => {
//     const { cohorts } = get();
//     const currentCohort = cohorts.find((c: any) => c.id === id);

//     if (!currentCohort) {
//       console.error("Cohort not found in local state");
//       return;
//     }

//     const batch = writeBatch(db);
//     const timestamp = new Date().toISOString();
//     const adminId = "admin-user-id";

//     const oldIds = currentCohort.learnerIds || [];

//     // --- 1. QCTO STAFF HISTORY LOGIC (Audit Trail) ---
//     let newHistory = [...(currentCohort.staffHistory || [])];

//     const handleRoleChange = (
//       role: "facilitator" | "assessor" | "moderator",
//       newId: string | undefined,
//       oldId: string,
//       reason?: string,
//     ) => {
//       if (newId && newId !== oldId) {
//         newHistory = newHistory.map((h) => {
//           if (h.role === role && h.staffId === oldId && h.removedAt === null) {
//             return { ...h, removedAt: timestamp };
//           }
//           return h;
//         });

//         newHistory.push({
//           staffId: newId,
//           role: role,
//           assignedAt: timestamp,
//           removedAt: null,
//           assignedBy: adminId,
//           changeReason: reason || "Role Update",
//         });
//       }
//     };

//     if (updates.facilitatorId)
//       handleRoleChange(
//         "facilitator",
//         updates.facilitatorId,
//         currentCohort.facilitatorId,
//         reasons?.facilitator,
//       );
//     if (updates.assessorId)
//       handleRoleChange(
//         "assessor",
//         updates.assessorId,
//         currentCohort.assessorId,
//         reasons?.assessor,
//       );
//     if (updates.moderatorId)
//       handleRoleChange(
//         "moderator",
//         updates.moderatorId,
//         currentCohort.moderatorId,
//         reasons?.moderator,
//       );

//     // --- 2. LEARNER SYNC LOGIC (The "Handshake") ---
//     if (updates.learnerIds) {
//       const newIds = updates.learnerIds;

//       const added = newIds.filter((lid: string) => !oldIds.includes(lid));
//       const removed = oldIds.filter((lid: string) => !newIds.includes(lid));

//       added.forEach((lid: string) => {
//         // 🚀 BULLETPROOF UPSERT: Use set with merge instead of update
//         batch.set(
//           doc(db, "learners", lid),
//           {
//             cohortId: id,
//             updatedAt: timestamp,
//           },
//           { merge: true },
//         );
//       });

//       removed.forEach((lid: string) => {
//         // 🚀 BULLETPROOF UPSERT: Use set with merge instead of update
//         batch.set(
//           doc(db, "learners", lid),
//           {
//             cohortId: "Unassigned",
//             updatedAt: timestamp,
//           },
//           { merge: true },
//         );
//       });
//     }

//     // --- 3. DATABASE UPDATE ---
//     const cohortRef = doc(db, "cohorts", id);
//     const finalPayload = {
//       ...currentCohort,
//       ...updates,
//       staffHistory: newHistory,
//       updatedAt: timestamp,
//     };

//     // Strip ID before saving to document body
//     const { id: _, ...dataToSave } = finalPayload;

//     // We can also make this a safe upsert just in case the cohort doc is somehow missing
//     batch.set(cohortRef, dataToSave, { merge: true });

//     try {
//       await batch.commit();

//       // --- 4. LOCAL STATE UPDATE ---
//       set((state: any) => {
//         const idx = state.cohorts.findIndex((c: any) => c.id === id);
//         if (idx !== -1) {
//           state.cohorts[idx] = finalPayload;
//         }

//         // Sync local learners slice so UI updates instantly
//         if (state.learners && updates.learnerIds) {
//           state.learners.forEach((l: any) => {
//             if (updates.learnerIds?.includes(l.id)) {
//               l.cohortId = id;
//             } else if (oldIds.includes(l.id)) {
//               l.cohortId = "Unassigned";
//             }
//           });
//         }
//       });
//     } catch (error) {
//       console.error("Critical Sync Failure:", error);
//       throw error;
//     }
//   },

//   deleteCohort: async (id) => {
//     try {
//       await deleteDoc(doc(db, "cohorts", id));
//       set((state: any) => {
//         state.cohorts = state.cohorts.filter((c: Cohort) => c.id !== id);
//       });
//     } catch (error) {
//       console.error("Failed to delete cohort", error);
//       throw error;
//     }
//   },
// });

// // // src/store/slices/cohortSlice.ts

// // import {
// //   collection,
// //   getDocs,
// //   deleteDoc,
// //   query,
// //   orderBy,
// //   doc,
// //   writeBatch,
// // } from "firebase/firestore";
// // import { db } from "../../../lib/firebase";
// // import type { Cohort } from "../../../types";
// // import type { StateCreator } from "zustand";

// // // ─── TYPES ────────────────────────────────────────────────────────────────────

// // export interface CohortSlice {
// //   cohorts: Cohort[];
// //   cohortsLoading: boolean;
// //   cohortsError: string | null;
// //   fetchCohorts: (force?: boolean) => Promise<void>;
// //   addCohort: (cohort: Omit<Cohort, "id" | "createdAt">) => Promise<void>;
// //   updateCohort: (
// //     id: string,
// //     updates: Partial<Cohort>,
// //     reasons?: { facilitator?: string; assessor?: string; moderator?: string },
// //   ) => Promise<void>;
// //   deleteCohort: (id: string) => Promise<void>;
// // }

// // // ─── IMPLEMENTATION ───────────────────────────────────────────────────────────

// // export const createCohortSlice: StateCreator<
// //   any,
// //   [["zustand/immer", never]],
// //   [],
// //   CohortSlice
// // > = (set, get, _) => ({
// //   cohorts: [],
// //   cohortsLoading: false,
// //   cohortsError: null,

// //   // fetchCohorts: async (force = false) => {
// //   //   const { cohorts, cohortsLoading } = get();
// //   //   if (!force && cohorts.length > 0) return;
// //   //   if (cohortsLoading) return;

// //   //   set({ cohortsLoading: true, cohortsError: null });
// //   //   try {
// //   //     const q = query(collection(db, "cohorts"), orderBy("name"));
// //   //     const snapshot = await getDocs(q);
// //   //     const list = snapshot.docs.map(
// //   //       (doc) => ({ id: doc.id, ...doc.data() }) as Cohort,
// //   //     );

// //   //     set({ cohorts: list, cohortsLoading: false });
// //   //   } catch (error: any) {
// //   //     console.error("Failed to fetch cohorts:", error);
// //   //     set({ cohortsLoading: false, cohortsError: error.message });
// //   //   }
// //   // },

// //   fetchCohorts: async (force = false) => {
// //     // We remove the strict `if (cohortsLoading) return;` to prevent the race condition abort.
// //     // We still respect the cache if force is false.
// //     const { cohorts } = get();
// //     if (!force && cohorts.length > 0) return;

// //     set((state: any) => {
// //       state.cohortsLoading = true;
// //       state.cohortsError = null;
// //     });

// //     try {
// //       const q = query(collection(db, "cohorts"), orderBy("name"));
// //       const snapshot = await getDocs(q);
// //       const list = snapshot.docs.map(
// //         (doc) => ({ id: doc.id, ...doc.data() }) as Cohort,
// //       );

// //       set((state: any) => {
// //         state.cohorts = list;
// //         state.cohortsLoading = false;
// //       });
// //     } catch (error: any) {
// //       console.error("Failed to fetch cohorts:", error);
// //       set((state: any) => {
// //         state.cohortsLoading = false;
// //         state.cohortsError = error.message;
// //       });
// //     }
// //   },

// //   addCohort: async (newCohort) => {
// //     const batch = writeBatch(db);
// //     const timestamp = new Date().toISOString();

// //     // 1. Setup Cohort Document
// //     const cohortRef = doc(collection(db, "cohorts"));
// //     const cohortId = cohortRef.id;
// //     const cohortData = {
// //       ...newCohort,
// //       id: cohortId,
// //       createdAt: timestamp,
// //       isArchived: false,
// //     };

// //     batch.set(cohortRef, cohortData);

// //     // 2. THE HANDSHAKE: Sync Learners to this new Cohort
// //     if (newCohort.learnerIds && newCohort.learnerIds.length > 0) {
// //       newCohort.learnerIds.forEach((learnerId: string) => {
// //         const learnerRef = doc(db, "learners", learnerId);
// //         batch.update(learnerRef, {
// //           cohortId: cohortId,
// //           updatedAt: timestamp,
// //         });
// //       });
// //     }

// //     try {
// //       await batch.commit();

// //       set((state: any) => {
// //         state.cohorts.push(cohortData);
// //         // Optimistically update local learners if they exist in the state
// //         if (state.learners) {
// //           state.learners.forEach((l: any) => {
// //             if (newCohort.learnerIds.includes(l.id)) {
// //               l.cohortId = cohortId;
// //             }
// //           });
// //         }
// //       });
// //     } catch (error) {
// //       console.error("Failed to add cohort and sync learners:", error);
// //       throw error;
// //     }
// //   },

// //   updateCohort: async (id, updates, reasons) => {
// //     const { cohorts } = get();
// //     const currentCohort = cohorts.find((c: any) => c.id === id);

// //     if (!currentCohort) {
// //       console.error("Cohort not found in local state");
// //       return;
// //     }

// //     const batch = writeBatch(db);
// //     const timestamp = new Date().toISOString();
// //     const adminId = "admin-user-id";

// //     const oldIds = currentCohort.learnerIds || [];

// //     // --- 1. QCTO STAFF HISTORY LOGIC (Audit Trail) ---
// //     // Create a shallow copy of the history array
// //     let newHistory = [...(currentCohort.staffHistory || [])];

// //     const handleRoleChange = (
// //       role: "facilitator" | "assessor" | "moderator",
// //       newId: string | undefined,
// //       oldId: string,
// //       reason?: string,
// //     ) => {
// //       if (newId && newId !== oldId) {
// //         // ✅ IMMUTABLE UPDATE: Use .map to find the entry and return a NEW object
// //         newHistory = newHistory.map((h) => {
// //           if (h.role === role && h.staffId === oldId && h.removedAt === null) {
// //             // Return a new object with the removedAt timestamp
// //             return { ...h, removedAt: timestamp };
// //           }
// //           return h;
// //         });

// //         // Push the new assignment entry
// //         newHistory.push({
// //           staffId: newId,
// //           role: role,
// //           assignedAt: timestamp,
// //           removedAt: null,
// //           assignedBy: adminId,
// //           changeReason: reason || "Role Update",
// //         });
// //       }
// //     };

// //     if (updates.facilitatorId)
// //       handleRoleChange(
// //         "facilitator",
// //         updates.facilitatorId,
// //         currentCohort.facilitatorId,
// //         reasons?.facilitator,
// //       );
// //     if (updates.assessorId)
// //       handleRoleChange(
// //         "assessor",
// //         updates.assessorId,
// //         currentCohort.assessorId,
// //         reasons?.assessor,
// //       );
// //     if (updates.moderatorId)
// //       handleRoleChange(
// //         "moderator",
// //         updates.moderatorId,
// //         currentCohort.moderatorId,
// //         reasons?.moderator,
// //       );

// //     // --- 2. LEARNER SYNC LOGIC (The "Handshake") ---
// //     if (updates.learnerIds) {
// //       const newIds = updates.learnerIds;

// //       const added = newIds.filter((lid: string) => !oldIds.includes(lid));
// //       const removed = oldIds.filter((lid: string) => !newIds.includes(lid));

// //       added.forEach((lid: string) => {
// //         batch.update(doc(db, "learners", lid), {
// //           cohortId: id,
// //           updatedAt: timestamp,
// //         });
// //       });

// //       removed.forEach((lid: string) => {
// //         batch.update(doc(db, "learners", lid), {
// //           cohortId: "Unassigned",
// //           updatedAt: timestamp,
// //         });
// //       });
// //     }

// //     // --- 3. DATABASE UPDATE ---
// //     const cohortRef = doc(db, "cohorts", id);
// //     const finalPayload = {
// //       ...currentCohort,
// //       ...updates,
// //       staffHistory: newHistory,
// //       updatedAt: timestamp,
// //     };

// //     // Strip ID before saving to document body
// //     const { id: _, ...dataToSave } = finalPayload;
// //     batch.update(cohortRef, dataToSave);

// //     try {
// //       await batch.commit();

// //       // --- 4. LOCAL STATE UPDATE ---
// //       set((state: any) => {
// //         const idx = state.cohorts.findIndex((c: any) => c.id === id);
// //         // Note: If you are using Zustand with Immer, direct mutation is fine.
// //         // If not, you should return a new state object.
// //         if (idx !== -1) {
// //           state.cohorts[idx] = finalPayload;
// //         }

// //         // Sync local learners slice so UI updates instantly
// //         if (state.learners && updates.learnerIds) {
// //           state.learners.forEach((l: any) => {
// //             if (updates.learnerIds?.includes(l.id)) {
// //               l.cohortId = id;
// //             } else if (oldIds.includes(l.id)) {
// //               l.cohortId = "Unassigned";
// //             }
// //           });
// //         }
// //       });
// //     } catch (error) {
// //       console.error("Critical Sync Failure:", error);
// //       throw error;
// //     }
// //   },

// //   deleteCohort: async (id) => {
// //     try {
// //       await deleteDoc(doc(db, "cohorts", id));
// //       set((state: any) => {
// //         state.cohorts = state.cohorts.filter((c: Cohort) => c.id !== id);
// //       });
// //     } catch (error) {
// //       console.error("Failed to delete cohort", error);
// //       throw error;
// //     }
// //   },
// // });
