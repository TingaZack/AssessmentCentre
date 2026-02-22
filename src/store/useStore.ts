// src/store/useStore.ts

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { db } from "../lib/firebase";
import {
  getFunctions, // Needed to initialize functions
  httpsCallable, // Needed to call the backend
} from "firebase/functions";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  writeBatch,
  getDoc,
} from "firebase/firestore";
import Papa from "papaparse";
import type { Cohort, DashboardLearner, ProgrammeTemplate } from "../types";
import type { UserProfile, UserRole } from "../types/auth.types";

import { getAuth } from "firebase/auth";
import {
  createCohortSlice,
  type CohortSlice,
} from "./slices/cohortSlice.ts/cohortSlice";

const USER_ID = getAuth().currentUser?.uid || "UnknownUser";

// ---------- Helper to generate ISO timestamp ----------
const now = () => new Date().toISOString();

// ---------- New Interface for Staff ----------
export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  phone?: string;
  createdAt: string;
  authUid: string;
}

// Attendance interface for your types
export interface AttendanceRecord {
  id?: string;
  cohortId: string;
  date: string; // ISO Date
  facilitatorId: string;
  presentLearners: string[]; // Array of learner IDs
  notes?: string;
}

// ---------- Store State Interface ----------
// interface StoreState {
interface StoreState extends CohortSlice {
  // --- AUTH STATE ---
  user: UserProfile | null;
  loading: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;

  // --- LEARNERS SLICE ---
  learners: DashboardLearner[];
  stagingLearners: DashboardLearner[];
  learnersLoading: boolean;
  learnersError: string | null;
  learnersLastFetched: number | null;

  fetchLearners: (force?: boolean) => Promise<void>;
  fetchStagingLearners: () => Promise<void>;

  approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
  inviteLearner: (learner: DashboardLearner) => Promise<void>;
  discardStagingLearners: (ids: string[]) => Promise<void>;

  addLearner: (
    learner: Omit<
      DashboardLearner,
      "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
    >,
  ) => Promise<void>;
  updateLearner: (
    id: string,
    updates: Partial<DashboardLearner>,
  ) => Promise<void>;
  archiveCohort: (year: string) => Promise<void>;

  // --- PROGRAMMES SLICE ---
  programmes: ProgrammeTemplate[];
  programmesLoading: boolean;
  programmesError: string | null;
  programmesLastFetched: number | null;

  fetchProgrammes: (force?: boolean) => Promise<void>;
  addProgramme: (
    programme: Omit<
      ProgrammeTemplate,
      "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
    >,
  ) => Promise<void>;
  updateProgramme: (
    id: string,
    updates: Partial<ProgrammeTemplate>,
  ) => Promise<void>;
  archiveProgramme: (id: string) => Promise<void>;

  // --- STAFF SLICE ---
  staff: StaffMember[];
  staffLoading: boolean;
  staffError: string | null;
  fetchStaff: (force?: boolean) => Promise<void>;
  addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
  deleteStaff: (id: string) => Promise<void>;

  // --- BULK IMPORT ACTIONS ---
  importUnifiedLearners: (
    file: File,
  ) => Promise<{ success: number; errors: string[] }>;
  importProgrammesFromCSV: (
    file: File,
  ) => Promise<{ success: number; errors: string[] }>;

  // // --- COHORTS SLICE ---
  // cohorts: Cohort[];
  // cohortsLoading: boolean;
  // fetchCohorts: (force?: boolean) => Promise<void>;
  // addCohort: (cohort: Omit<Cohort, "id" | "createdAt">) => Promise<void>;
  // // UPDATED SIGNATURE HERE:
  // updateCohort: (
  //   id: string,
  //   updates: Partial<Cohort>,
  //   reasons?: { facilitator?: string; assessor?: string; moderator?: string },
  // ) => Promise<void>;

  // deleteCohort: (id: string) => Promise<void>;

  dropLearner: (id: string, reason: string) => Promise<void>;

  // --- ACTIONS ---
  archiveLearner: (id: string) => Promise<void>; // SOFT ARCHIVE
  restoreLearner: (id: string) => Promise<void>; // RESTORE

  refreshUser: () => Promise<void>;

  updateStaffProfile: (uid: string, updates: any) => Promise<void>;
}

// ---------- Create Store ----------
// export const useStore = create<StoreState>()(
//   immer((set, get) => ({
export const useStore = create<StoreState>()(
  immer((set, get, api) => ({
    // --- AUTH IMPLEMENTATION ---
    ...createCohortSlice(set, get, api),
    user: null,
    loading: true, // Start true to wait for Firebase check
    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),

    // REFRESH FUNCTION

    refreshUser: async () => {
      const currentUser = get().user;
      if (!currentUser?.uid) return;

      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();

          // We construct the updated profile carefully
          const updatedProfile: UserProfile = {
            ...currentUser,
            // We explicitly map the data from Firestore
            fullName: data.fullName || currentUser.fullName,
            role: data.role || currentUser.role,
            profileCompleted: data.profileCompleted === true,
          };

          set({ user: updatedProfile });
        }
      } catch (error) {
        console.error("Store: Failed to refresh user data", error);
      }
    },

    // ==================== LEARNERS SLICE ====================
    learners: [],
    learnersLoading: false,
    learnersError: null,
    learnersLastFetched: null,

    fetchLearners: async (force = false) => {
      const { learnersLastFetched, learnersLoading } = get();

      // 🛑 CACHE LOGIC: Only skip if force is FALSE and data is fresh
      if (
        !force &&
        learnersLastFetched &&
        Date.now() - learnersLastFetched < 5 * 60 * 1000
      ) {
        return;
      }

      if (learnersLoading) return;

      set({ learnersLoading: true, learnersError: null });
      try {
        // Fetch ALL learners (Drafts + Active)
        const q = query(collection(db, "learners"), orderBy("fullName"));
        const snapshot = await getDocs(q);

        const learners = snapshot.docs.map((doc) => {
          const data = doc.data();
          // Ensure ID is included
          return { ...data, id: doc.id } as DashboardLearner;
        });

        set({
          learners,
          learnersLoading: false,
          learnersLastFetched: Date.now(),
        });
      } catch (error) {
        console.error("Fetch error:", error);
        set({
          learnersError: (error as Error).message,
          learnersLoading: false,
        });
      }
    },

    addLearner: async (learner) => {
      try {
        const timestamp = now();
        const learnerWithAudit = {
          ...learner,
          isDraft: false,
          isArchived: false,
          status: "in-progress",
          createdAt: timestamp,
          createdBy: USER_ID,
          updatedAt: timestamp,
          updatedBy: USER_ID,
        };
        const docRef = await addDoc(
          collection(db, "learners"),
          learnerWithAudit,
        );
        const newLearner = {
          ...learnerWithAudit,
          id: docRef.id,
        } as DashboardLearner;
        set((state) => {
          state.learners.push(newLearner);
        });
      } catch (error) {
        console.error("Failed to add learner", error);
        throw error;
      }
    },

    updateLearner: async (id, updates) => {
      try {
        const learnerRef = doc(db, "learners", id);
        const updatePayload = {
          ...updates,
          updatedAt: now(),
          updatedBy: USER_ID,
        };
        await updateDoc(learnerRef, updatePayload);
        set((state) => {
          const index = state.learners.findIndex((l) => l.id === id);
          if (index !== -1) {
            state.learners[index] = {
              ...state.learners[index],
              ...updatePayload,
            };
          }
        });
      } catch (error) {
        console.error("Failed to update learner", error);
        throw error;
      }
    },

    // 🟡 SOFT ARCHIVE
    archiveLearner: async (id: string) => {
      try {
        await updateDoc(doc(db, "learners", id), {
          isArchived: true,
          updatedAt: now(),
        });
        set((state) => {
          const idx = state.learners.findIndex((l) => l.id === id);
          if (idx !== -1) state.learners[idx].isArchived = true;
        });
      } catch (error) {
        console.error(error);
      }
    },

    // 🟢 RESTORE
    restoreLearner: async (id: string) => {
      try {
        await updateDoc(doc(db, "learners", id), {
          isArchived: false,
          updatedAt: now(),
        });
        set((state) => {
          const idx = state.learners.findIndex((l) => l.id === id);
          if (idx !== -1) state.learners[idx].isArchived = false;
        });
      } catch (error) {
        console.error(error);
      }
    },

    archiveCohort: async (year: string) => {
      const { learners } = get();
      const batch = writeBatch(db);
      let count = 0;

      learners.forEach((l) => {
        const learnerYear = l.trainingStartDate
          ? l.trainingStartDate.substring(0, 4)
          : "";
        if (learnerYear === year && !l.isArchived) {
          const ref = doc(db, "learners", l.id);
          batch.update(ref, {
            isArchived: true,
            updatedAt: now(),
          });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        set((state) => {
          state.learners.forEach((l) => {
            if (l.trainingStartDate?.startsWith(year)) {
              l.isArchived = true;
            }
          });
        });
        alert(`Successfully archived ${count} learners.`);
      } else {
        alert(`No active learners found for ${year}.`);
      }
    },

    updateStaffProfile: async (uid: string, updates: any) => {
      try {
        const userRef = doc(db, "users", uid);

        // 1. Update the primary user document
        await updateDoc(userRef, {
          ...updates,
          updatedAt: new Date().toISOString(),
        });

        // 2. Local State Sync: Update the 'user' object in the store
        // so the UI reflects changes immediately without a page reload
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        }));

        console.log("Practitioner profile updated successfully");
      } catch (error) {
        console.error("Error updating practitioner profile:", error);
        throw error;
      }
    },

    // ==================== STAGING (DRAFTS) ====================
    stagingLearners: [],

    fetchStagingLearners: async () => {
      try {
        const q = query(
          collection(db, "staging_learners"),
          orderBy("fullName"),
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id }) as DashboardLearner,
        );

        set((state) => {
          state.stagingLearners = list;
        });
      } catch (error) {
        console.error("Failed to fetch staging:", error);
      }
    },

    approveStagingLearners: async (learnersToApprove) => {
      set((state) => {
        state.learnersLoading = true;
      });

      // 1. Initialize Cloud Function
      const functions = getFunctions();
      // Assuming you use the same function or a similar one for learners
      const createAccountFn = httpsCallable(functions, "createLearnerAccount");

      try {
        const batch = writeBatch(db);
        const approvedIds = new Set<string>();

        // 2. Process each learner (We use a loop to handle the async Cloud Function calls)
        // Note: We use Promise.all to run them in parallel for speed
        await Promise.all(
          learnersToApprove.map(async (l) => {
            try {
              console.log(`Creating auth account for: ${l.email}`);

              // A. Call Cloud Function to Create Auth User & Send Email
              // This creates the user in Firebase Auth and sends the invite
              const result = await createAccountFn({
                email: l.email,
                fullName: l.fullName,
                role: "learner", // Ensure your backend handles this role
                password: "TemporaryPassword123!", // Or let backend generate it
              });

              const data = result.data as any;
              const authUid = data.uid || l.id; // Use the real Auth UID if returned

              // B. Prepare Live Data
              const liveData = {
                ...l,
                id: authUid, // CRITICAL: Link Firestore ID to Auth UID
                isDraft: false,
                status: "active",
                authStatus: "active", // Mark as invited
                approvedAt: now(),
                approvedBy: USER_ID,
              };

              // C. Add to Batch: Write to 'learners' (Live)
              // We use the Auth UID as the document key to keep things linked
              const liveRef = doc(db, "learners", authUid);
              batch.set(liveRef, liveData, { merge: true });

              // D. Add to Batch: Delete from 'staging_learners' (using original draft ID)
              const stagingRef = doc(db, "staging_learners", l.id);
              batch.delete(stagingRef);

              approvedIds.add(l.id);
            } catch (err) {
              console.error(`Failed to create account for ${l.email}`, err);
              // You might want to skip adding this one to the batch if Auth fails
            }
          }),
        );

        // 3. Commit Firestore Changes
        await batch.commit();

        // 4. Update UI State
        set((state) => {
          // Remove approved items from staging
          state.stagingLearners = state.stagingLearners.filter(
            (l) => !approvedIds.has(l.id),
          );
          state.learnersLoading = false;
        });

        // 5. Refresh Live List
        await get().fetchLearners(true);

        alert(`Process Complete. Accounts created and emails sent.`);
      } catch (e) {
        console.error(e);
        set((state) => {
          state.learnersLoading = false;
        });
        alert("Error during approval process. Check console.");
      }
    },

    // Single Invite / Resend
    inviteLearner: async (learner: DashboardLearner) => {
      set((state) => {
        state.learnersLoading = true;
      });

      try {
        const functions = getFunctions();
        const createAccountFn = httpsCallable(
          functions,
          "createLearnerAccount",
        );

        // 1. Call Cloud Function
        const result = await createAccountFn({
          email: learner.email,
          fullName: learner.fullName,
          role: "learner",
          // password: 'TempPassword123!' // Optional: Let them set it via link
        });

        const data = result.data as any;

        if (data.success) {
          // 2. Update Firestore Status
          const learnerRef = doc(db, "learners", learner.id);
          await updateDoc(learnerRef, {
            authStatus: "active",
            invitedAt: now(),
            // If the cloud function returned a new UID, you might need to handle that here
            // e.g. uid: data.uid
          });

          // 3. Update UI
          set((state) => {
            const idx = state.learners.findIndex((l) => l.id === learner.id);
            if (idx !== -1) {
              state.learners[idx].authStatus = "active";
              // state.learners[idx].invitedAt = now();
            }
            state.learnersLoading = false;
          });

          alert(`Invite sent to ${learner.email}`);
        } else {
          throw new Error(data.message || "Unknown error");
        }
      } catch (error: any) {
        console.error(error);
        set((state) => {
          state.learnersLoading = false;
        });

        // Handle specific "Already Exists" error gracefully
        if (error.message.includes("already exists")) {
          alert(
            "This user is already registered. You might need to send a Password Reset instead.",
          );
        } else {
          alert(`Failed to invite: ${error.message}`);
        }
      }
    },

    // approveStagingLearners: async (learnersToApprove) => {
    //   set((state) => {
    //     state.learnersLoading = true;
    //   }); // Reusing loader

    //   try {
    //     const batch = writeBatch(db);

    //     learnersToApprove.forEach((l) => {
    //       // 1. Prepare for Live (Remove Draft Flag)
    //       const liveData = {
    //         ...l,
    //         isDraft: false,
    //         status: "active",
    //         approvedAt: now(),
    //         approvedBy: USER_ID,
    //       };

    //       // 2. Set in 'learners' (Live) using ID Number as Key
    //       // Note: using l.id which should be National ID from import logic
    //       const liveRef = doc(db, "learners", l.id);
    //       batch.set(liveRef, liveData, { merge: true });

    //       // 3. Delete from 'staging_learners'
    //       const stagingRef = doc(db, "staging_learners", l.id);
    //       batch.delete(stagingRef);
    //     });

    //     await batch.commit();

    //     // 4. Refresh both lists
    //     await get().fetchLearners(true);
    //     await get().fetchStagingLearners();

    //     set((state) => {
    //       state.learnersLoading = false;
    //     });
    //     alert(`Successfully activated ${learnersToApprove.length} learners.`);
    //   } catch (e) {
    //     console.error(e);
    //     set((state) => {
    //       state.learnersLoading = false;
    //     });
    //     alert("Failed to approve learners.");
    //   }
    // },

    discardStagingLearners: async (ids) => {
      try {
        const batch = writeBatch(db);
        ids.forEach((id) => {
          const ref = doc(db, "staging_learners", id);
          batch.delete(ref);
        });
        await batch.commit();
        await get().fetchStagingLearners();
      } catch (e) {
        console.error(e);
      }
    },

    // ==================== PROGRAMMES SLICE ====================
    programmes: [],
    programmesLoading: false,
    programmesError: null,
    programmesLastFetched: null,

    fetchProgrammes: async (force = false) => {
      const { programmesLastFetched, programmesLoading } = get();
      if (
        !force &&
        programmesLastFetched &&
        Date.now() - programmesLastFetched < 5 * 60 * 1000
      ) {
        return;
      }
      if (programmesLoading) return;

      set({ programmesLoading: true, programmesError: null });
      try {
        const q = query(collection(db, "programmes"), orderBy("name"));
        const snapshot = await getDocs(q);
        const programmes = snapshot.docs.map((doc) => {
          const data = doc.data();
          return { id: doc.id, ...data } as ProgrammeTemplate;
        });
        set({
          programmes,
          programmesLoading: false,
          programmesLastFetched: Date.now(),
        });
      } catch (error) {
        set({
          programmesError: (error as Error).message,
          programmesLoading: false,
        });
      }
    },

    addProgramme: async (programme) => {
      try {
        const timestamp = now();
        const programmeWithAudit = {
          ...programme,
          createdAt: timestamp,
          createdBy: USER_ID,
          updatedAt: timestamp,
          updatedBy: USER_ID,
        };
        const docRef = await addDoc(
          collection(db, "programmes"),
          programmeWithAudit,
        );
        const newProg = {
          ...programmeWithAudit,
          id: docRef.id,
        } as ProgrammeTemplate;
        set((state) => {
          state.programmes.push(newProg);
        });
      } catch (error) {
        console.error("Failed to add programme", error);
        throw error;
      }
    },

    updateProgramme: async (id, updates) => {
      try {
        const progRef = doc(db, "programmes", id);
        const updatePayload = {
          ...updates,
          updatedAt: now(),
          updatedBy: USER_ID,
        };
        await updateDoc(progRef, updatePayload);
        set((state) => {
          const index = state.programmes.findIndex((p) => p.id === id);
          if (index !== -1) {
            state.programmes[index] = {
              ...state.programmes[index],
              ...updatePayload,
            };
          }
        });
      } catch (error) {
        console.error("Failed to update programme", error);
        throw error;
      }
    },

    archiveProgramme: async (id) => {
      try {
        const progRef = doc(db, "programmes", id);
        await updateDoc(progRef, {
          isArchived: true,
          updatedAt: now(),
          updatedBy: USER_ID,
        });
        set((state) => {
          const index = state.programmes.findIndex((p) => p.id === id);
          if (index !== -1) {
            state.programmes[index].isArchived = true;
          }
        });
      } catch (error) {
        console.error("Failed to archive programme", error);
        throw error;
      }
    },

    // ==================== STAFF SLICE (NEW) ====================
    staff: [],
    staffLoading: false,
    staffError: null,

    fetchStaff: async (force = false) => {
      const { staff, staffLoading } = get();
      if (!force && staff.length > 0) return;
      if (staffLoading) return;

      set({ staffLoading: true, staffError: null });
      try {
        const q = query(
          collection(db, "users"),
          where("role", "in", ["facilitator", "assessor", "moderator"]),
        );
        const snapshot = await getDocs(q);
        const staffList = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            fullName: data.fullName || "Unknown Staff",
            email: data.email,
            role: data.role,
            phone: data.phone,
            createdAt: data.createdAt || now(),
          } as StaffMember;
        });
        set({ staff: staffList, staffLoading: false });
      } catch (error) {
        console.error("Failed to fetch staff", error);
        set({
          staffError: (error as Error).message,
          staffLoading: false,
        });
      }
    },

    // ---- THIS IS THE UPDATED FUNCTION USING CLOUD FUNCTIONS ----
    addStaff: async (newStaff) => {
      set({ staffLoading: true, staffError: null });

      try {
        // 1. Initialize the Callable Function
        const functions = getFunctions();
        const createStaffAccount = httpsCallable(
          functions,
          "createStaffAccount",
        );

        console.log("Calling Cloud Function: createStaffAccount...", newStaff);

        // 2. Execute the Function
        // The object inside () matches the 'request.data' in your backend code
        const result = await createStaffAccount({
          email: newStaff.email,
          fullName: newStaff.fullName,
          role: newStaff.role,
          phone: newStaff.phone || "",
        });

        const data = result.data as any;

        // 3. Handle Success
        if (data.success) {
          console.log("Success:", data.message);

          // Optimistically update the UI list so we don't need to re-fetch
          const timestamp = now();
          const createdStaff = {
            ...newStaff,
            id: data.uid || "temp-id-" + Date.now(),
            createdAt: timestamp,
            signatureUrl: "",
          } as StaffMember;

          set((state) => {
            state.staff.push(createdStaff);
            state.staffLoading = false;
          });

          alert(
            `Success! Account created for ${newStaff.fullName}.\nAn email has been sent to ${newStaff.email} with the setup link.`,
          );
        }
      } catch (error: any) {
        console.error("Failed to create staff account:", error);

        let errorMessage = "Failed to create account.";
        // Friendly Error Messages
        if (error.code === "functions/permission-denied") {
          errorMessage = "You do not have permission to create staff.";
        } else if (error.code === "functions/already-exists") {
          errorMessage = "A user with this email already exists.";
        } else if (error.message) {
          errorMessage = error.message;
        }

        set({
          staffLoading: false,
          staffError: errorMessage,
        });

        alert(errorMessage);
        throw new Error(errorMessage);
      }
    },

    deleteStaff: async (id) => {
      try {
        // Note: This only deletes the Firestore Doc.
        // Ideally, you should also have a cloud function to delete the Auth User.
        await deleteDoc(doc(db, "users", id));
        set((state) => {
          state.staff = state.staff.filter((s) => s.id !== id);
        });
      } catch (error) {
        console.error("Failed to delete staff", error);
        throw error;
      }
    },

    // ==================== IMPORTS ====================
    importUnifiedLearners: async (file: File) => {
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
          complete: async (results) => {
            const rawData = results.data as any[];
            const errors: string[] = [];
            const learnersMap = new Map<string, any>();

            if (rawData.length === 0) {
              resolve({
                success: 0,
                errors: ["CSV file is empty"],
              });
              return;
            }

            rawData.forEach((row, index) => {
              try {
                const getStr = (val: any): string =>
                  val !== null && val !== undefined ? String(val).trim() : "";
                const idNumber = getStr(row.NationalId || row.ID_Number);
                if (!idNumber) return;

                if (!learnersMap.has(idNumber)) {
                  const firstName = getStr(row.LearnerFirstName);
                  const lastName = getStr(row.LearnerLastName);
                  const middleName = getStr(row.LearnerMiddleName);
                  let fullName =
                    firstName || lastName
                      ? `${firstName} ${middleName} ${lastName}`
                          .replace(/\s+/g, " ")
                          .trim()
                      : getStr(row.Full_Name) || "Unknown Learner";

                  const parseYYYYMMDD = (val: string) => {
                    if (val.length === 8 && /^\d+$/.test(val)) {
                      return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
                    }
                    return val;
                  };

                  const dateOfBirth = parseYYYYMMDD(
                    getStr(row.LearnerBirthDate || row.Date_Of_Birth),
                  );
                  const rawStart = getStr(
                    row.TrainingStartDate || row.Training_Start_Date,
                  );
                  const trainingStartDate = rawStart
                    ? parseYYYYMMDD(rawStart)
                    : new Date().toISOString().split("T")[0];

                  const newLearner = {
                    fullName,
                    idNumber,
                    dateOfBirth,
                    email: getStr(row.LearnerEmailAddress || row.Email),
                    phone: getStr(
                      row.LearnerCellPhoneNumber ||
                        row.Phone ||
                        row.LearnerPhoneNumber,
                    ),
                    trainingStartDate,
                    isArchived: false,
                    isDraft: true, // legacy imports to go to Staging
                    qualification: {
                      name: getStr(
                        row.Programme_Name || row.Qualification_Name,
                      ),
                      saqaId: getStr(row.QualificationId || row.SAQA_ID),
                      credits:
                        parseInt(getStr(row.Total_Credits || row.Credits)) || 0,
                      totalNotionalHours:
                        (parseInt(getStr(row.Total_Credits || row.Credits)) ||
                          0) * 10,
                      nqfLevel: parseInt(getStr(row.NQF_Level)) || 0,
                      dateAssessed: "",
                    },
                    knowledgeModules: [],
                    practicalModules: [],
                    workExperienceModules: [],
                    eisaAdmission:
                      getStr(row.LearnerReadinessforEISATypeId) === "01" ||
                      getStr(row.EISA_Admission).toLowerCase() === "yes",
                    verificationCode:
                      getStr(row.Verification_Code) ||
                      `SOR-${Math.floor(Math.random() * 10000)}`,
                    issueDate:
                      getStr(row.StatementofResultsIssueDate) ||
                      now().split("T")[0],
                    status: "in-progress",
                    demographics: {
                      sdpCode: getStr(row.SDPCode),
                      qualificationId: getStr(
                        row.QualificationId || row.QualificationID,
                      ),
                      learnerAlternateId: getStr(row.LearnerAlternateId),
                      alternativeIdType: getStr(row.AlternativeIdType),
                      equityCode: getStr(row.EquityCode),
                      nationalityCode: getStr(row.NationalityCode),
                      homeLanguageCode: getStr(row.HomeLanguageCode),
                      genderCode: getStr(row.GenderCode),
                      citizenResidentStatusCode: getStr(
                        row.CitizenResidentStatusCode,
                      ),
                      socioeconomicStatusCode: getStr(
                        row.SocioeconomicStatusCode,
                      ),
                      disabilityStatusCode: getStr(row.DisabilityStatusCode),
                      disabilityRating: getStr(row.DisabilityRating),
                      immigrantStatus: getStr(row.ImmigrantStatus),
                      learnerMiddleName: getStr(row.LearnerMiddleName),
                      learnerTitle: getStr(row.LearnerTitle),
                      learnerHomeAddress1: getStr(row.LearnerHomeAddress1),
                      learnerHomeAddress2: getStr(row.LearnerHomeAddress2),
                      learnerHomeAddress3: getStr(row.LearnerHomeAddress3),
                      learnerPostalAddress1: getStr(row.LearnerPostalAddress1),
                      learnerPostalAddress2: getStr(row.LearnerPostalAddress2),
                      learnerPostalAddress3: getStr(row.LearnerPostalAddress3),
                      learnerHomeAddressPostalCode: getStr(
                        row.LearnerHomeAddressPostalCode,
                      ),
                      learnerPostalAddressPostCode: getStr(
                        row.LearnerPostalAddressPostCode,
                      ),
                      learnerPhoneNumber: getStr(row.LearnerPhoneNumber),
                      learnerFaxNumber: getStr(row.LearnerFaxNumber),
                      learnerEmailAddress: getStr(row.LearnerEmailAddress),
                      provinceCode: getStr(row.ProvinceCode),
                      statsaaAreaCode: getStr(row.STATSSAAreaCode),
                      popiActAgree: getStr(row.POPIActAgree),
                      popiActDate: getStr(row.POPIActDate),
                      expectedTrainingCompletionDate: getStr(
                        row.ExpectedTrainingCompletionDate,
                      ),
                      statementOfResultsStatus: getStr(
                        row.StatementOfResultsStatus,
                      ),
                      statementOfResultsIssueDate: getStr(
                        row.StatementOfResultsIssueDate,
                      ),
                      assessmentCentreCode: getStr(row.AssessmentCentreCode),
                      learnerReadinessForEISATypeId: getStr(
                        row.LearnerReadinessForEISATypeId,
                      ),
                      flc: getStr(row.FLC),
                      flcStatementOfResultNumber: getStr(
                        row.FLCStatementofresultnumber,
                      ),
                      dateStamp: getStr(row.DateStamp),
                    },
                    createdAt: now(),
                    createdBy: USER_ID,
                    updatedAt: now(),
                    updatedBy: USER_ID,
                  };
                  learnersMap.set(idNumber, newLearner);
                }

                // Module Parsing
                const moduleName = getStr(row.Module_Name);
                if (moduleName) {
                  const learner = learnersMap.get(idNumber);
                  const moduleType = getStr(row.Module_Type).toLowerCase();
                  const moduleCredits =
                    parseInt(getStr(row.Module_Credits)) || 0;
                  const moduleDate = getStr(row.Module_Date);
                  const moduleResult = getStr(row.Module_Result);

                  const moduleBase = {
                    name: moduleName,
                    credits: moduleCredits,
                    notionalHours: moduleCredits * 10,
                    nqfLevel: 5,
                  };

                  if (moduleType.includes("knowledge")) {
                    learner.knowledgeModules.push({
                      ...moduleBase,
                      dateAssessed: moduleDate,
                      status: moduleResult || "Competent",
                    });
                  } else if (moduleType.includes("practical")) {
                    learner.practicalModules.push({
                      ...moduleBase,
                      dateAssessed: moduleDate,
                      status: moduleResult || "Pass",
                    });
                  } else if (
                    moduleType.includes("work") ||
                    moduleType.includes("experience")
                  ) {
                    learner.workExperienceModules.push({
                      ...moduleBase,
                      dateSignedOff: moduleDate,
                      status: moduleResult || "Competent",
                    });
                  }
                }
              } catch (err) {
                errors.push(
                  `Row ${index + 2} Error: ${(err as Error).message}`,
                );
              }
            });

            if (learnersMap.size === 0) {
              resolve({
                success: 0,
                errors: errors.length ? errors : ["No valid learners found"],
              });
              return;
            }

            try {
              const batch = writeBatch(db);
              // learnersMap.forEach((learner) => {
              //   const docRef = doc(collection(db, "learners"));
              //   batch.set(docRef, learner);
              // });
              learnersMap.forEach((learner) => {
                // Use the learner.id (National ID) as the Document ID
                const docRef = doc(db, "learners", learner.id);
                batch.set(docRef, learner); // Use set() to overwrite/merge specific ID
              });
              await batch.commit();
              await get().fetchLearners(true);
              resolve({ success: learnersMap.size, errors });
            } catch (error) {
              reject(error);
            }
          },
          error: (error) => reject(error),
        });
      });
    },

    importProgrammesFromCSV: async (file: File) => {
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            const rawData = results.data as any[];
            const errors: string[] = [];
            const programmesToAdd: any[] = [];
            const groupedBySaqa = rawData.reduce((acc: any, row: any) => {
              if (!row.SAQA_ID) return acc;
              if (!acc[row.SAQA_ID]) acc[row.SAQA_ID] = [];
              acc[row.SAQA_ID].push(row);
              return acc;
            }, {});

            Object.keys(groupedBySaqa).forEach((saqaId) => {
              const rows = groupedBySaqa[saqaId];
              const baseInfo = rows[0];
              const timestamp = now();
              const programme = {
                name: baseInfo.Programme_Name || "Unknown Programme",
                saqaId,
                credits: parseInt(baseInfo.Total_Credits) || 0,
                totalNotionalHours:
                  (parseInt(baseInfo.Total_Credits) || 0) * 10,
                nqfLevel: parseInt(baseInfo.NQF_Level) || 0,
                knowledgeModules: [] as any[],
                practicalModules: [] as any[],
                workExperienceModules: [] as any[],
                isArchived: false,
                createdAt: timestamp,
                createdBy: USER_ID,
                updatedAt: timestamp,
                updatedBy: USER_ID,
              };

              rows.forEach((row: any) => {
                const moduleCredits = parseInt(row.Module_Credits) || 0;
                const moduleData = {
                  name: row.Module_Name || "Unnamed Module",
                  credits: moduleCredits,
                  notionalHours: moduleCredits * 10,
                  nqfLevel:
                    parseInt(row.Module_NQF_Level) || programme.nqfLevel,
                };
                const moduleType = row.Module_Type?.toLowerCase();

                if (moduleType === "knowledge")
                  programme.knowledgeModules.push(moduleData);
                else if (moduleType === "practical")
                  programme.practicalModules.push(moduleData);
                else if (moduleType?.includes("work"))
                  programme.workExperienceModules.push(moduleData);
              });

              if (
                programme.knowledgeModules.length ||
                programme.practicalModules.length ||
                programme.workExperienceModules.length
              ) {
                programmesToAdd.push(programme);
              }
            });

            if (programmesToAdd.length === 0) {
              resolve({
                success: 0,
                errors: ["No valid programmes found"],
              });
              return;
            }

            try {
              const batch = writeBatch(db);
              programmesToAdd.forEach((prog) => {
                const docRef = doc(collection(db, "programmes"));
                batch.set(docRef, prog);
              });
              await batch.commit();
              await get().fetchProgrammes(true);
              resolve({ success: programmesToAdd.length, errors });
            } catch (error) {
              reject(error);
            }
          },
          error: (error) => reject(error),
        });
      });
    },

    // // --- COHORTS SLICE ---
    // // ==================== COHORTS SLICE ====================
    // cohorts: [],
    // cohortsLoading: false,

    // fetchCohorts: async (force = false) => {
    //   const { cohorts, cohortsLoading } = get();
    //   if (!force && cohorts.length > 0) return;
    //   if (cohortsLoading) return;

    //   set({ cohortsLoading: true });
    //   try {
    //     const q = query(collection(db, "cohorts"), orderBy("name"));
    //     const snapshot = await getDocs(q);
    //     const list = snapshot.docs.map(
    //       (doc) => ({ id: doc.id, ...doc.data() }) as Cohort,
    //     );
    //     set({ cohorts: list, cohortsLoading: false });
    //   } catch (error) {
    //     console.error("Failed to fetch cohorts", error);
    //     set({ cohortsLoading: false });
    //   }
    // },

    // addCohort: async (newCohort) => {
    //   try {
    //     const timestamp = now();
    //     const cohortData = {
    //       ...newCohort,
    //       createdAt: timestamp,
    //       isArchived: false,
    //     };
    //     const docRef = await addDoc(collection(db, "cohorts"), cohortData);

    //     set((state) => {
    //       state.cohorts.push({ ...cohortData, id: docRef.id } as Cohort);
    //     });
    //   } catch (error) {
    //     console.error("Failed to add cohort", error);
    //     throw error;
    //   }
    // },

    // deleteCohort: async (id) => {
    //   try {
    //     await deleteDoc(doc(db, "cohorts", id));
    //     set((state) => {
    //       state.cohorts = state.cohorts.filter((c) => c.id !== id);
    //     });
    //   } catch (error) {
    //     console.error("Failed to delete cohort", error);
    //     throw error;
    //   }
    // },

    // updateCohort: async (id, updates, reasons) => {
    //   const { cohorts } = get();
    //   const currentCohort = cohorts.find((c) => c.id === id);

    //   // Safety check: if cohort isn't found locally, we can't calculate history
    //   if (!currentCohort) {
    //     console.error("Cohort not found in local state");
    //     return;
    //   }

    //   const timestamp = new Date().toISOString();
    //   const adminId = "admin-user-id"; // Replace with auth.currentUser.uid in production

    //   // 1. Clone the existing history (or create empty if missing)
    //   let newHistory = [...(currentCohort.staffHistory || [])];

    //   // 2. Helper function to handle the "Close Old / Open New" logic
    //   const handleRoleChange = (
    //     role: "facilitator" | "assessor" | "moderator",
    //     newId: string | undefined,
    //     oldId: string,
    //     reason?: string,
    //   ) => {
    //     // Only process if the ID actually changed and is defined
    //     if (newId && newId !== oldId) {
    //       console.log(`Processing ${role} change: ${oldId} -> ${newId}`);

    //       // A. Find the currently active entry for this role/staff and close it
    //       const activeEntryIndex = newHistory.findIndex(
    //         (h) =>
    //           h.role === role && h.staffId === oldId && h.removedAt === null,
    //       );

    //       if (activeEntryIndex !== -1) {
    //         newHistory[activeEntryIndex].removedAt = timestamp;
    //       }

    //       // B. Create the new entry with the QCTO reason
    //       newHistory.push({
    //         staffId: newId,
    //         role: role,
    //         assignedAt: timestamp,
    //         removedAt: null,
    //         assignedBy: adminId,
    //         changeReason: reason || "No reason provided (Initial/Update)",
    //       });
    //     }
    //   };

    //   // 3. Check for changes in all 3 roles
    //   if (updates.facilitatorId) {
    //     handleRoleChange(
    //       "facilitator",
    //       updates.facilitatorId,
    //       currentCohort.facilitatorId,
    //       reasons?.facilitator,
    //     );
    //   }

    //   if (updates.assessorId) {
    //     handleRoleChange(
    //       "assessor",
    //       updates.assessorId,
    //       currentCohort.assessorId,
    //       reasons?.assessor,
    //     );
    //   }

    //   if (updates.moderatorId) {
    //     handleRoleChange(
    //       "moderator",
    //       updates.moderatorId,
    //       currentCohort.moderatorId,
    //       reasons?.moderator,
    //     );
    //   }

    //   try {
    //     const cohortRef = doc(db, "cohorts", id);

    //     // 4. Prepare the final payload for Firestore
    //     // CRITICAL: We merge currentCohort with updates to ensure new IDs overwrite old ones
    //     const finalPayload = {
    //       ...currentCohort, // Start with existing data
    //       ...updates, // OVERWRITE with new IDs (Facilitator/Assessor/Moderator)
    //       staffHistory: newHistory,
    //       updatedAt: timestamp,
    //       updatedBy: adminId,
    //     };

    //     // Remove the 'id' field before saving to Firestore (Firestore doesn't store document ID inside data)
    //     // We use a temporary variable for destructuring to strip 'id'
    //     const { id: _, ...dataToSave } = finalPayload;

    //     // 5. Update Firestore
    //     await updateDoc(cohortRef, dataToSave);

    //     // 6. Optimistically update Local State
    //     set((state) => {
    //       const index = state.cohorts.findIndex((c) => c.id === id);
    //       if (index !== -1) {
    //         // Update local state fully with the final payload
    //         state.cohorts[index] = finalPayload;
    //       }
    //     });

    //     console.log("Cohort updated successfully with audit trail.");
    //   } catch (error) {
    //     console.error("Failed to update cohort", error);
    //     throw error;
    //   }
    // },

    dropLearner: async (id, reason) => {
      try {
        const learnerRef = doc(db, "learners", id);
        const timestamp = new Date().toISOString();

        // Update Firestore
        await updateDoc(learnerRef, {
          status: "dropped",
          exitReason: reason,
          exitDate: timestamp,
          updatedAt: timestamp,
        });

        // Update Local State
        set((state) => {
          const index = state.learners.findIndex((l) => l.id === id);
          if (index !== -1) {
            state.learners[index].status = "dropped";
            state.learners[index].exitReason = reason;
            state.learners[index].exitDate = timestamp;
          }
        });
      } catch (error) {
        console.error("Failed to drop learner", error);
        throw error;
      }
    },
  })),
);

// import { create } from "zustand";
// import { immer } from "zustand/middleware/immer";
// import { db } from "../lib/firebase";
// import {
//   collection,
//   doc,
//   getDocs,
//   addDoc,
//   updateDoc,
//   deleteDoc,
//   query,
//   orderBy,
//   where,
//   writeBatch,
// } from "firebase/firestore";
// import Papa from "papaparse";
// import type { DashboardLearner, ProgrammeTemplate } from "../types";
// import type { UserRole } from "../types/auth.types";

// // ---------- Test user ID (replace with actual auth later) ----------
// const TEST_USER_ID = "admin-user-id";

// // ---------- Helper to generate ISO timestamp ----------
// const now = () => new Date().toISOString();

// // ---------- New Interface for Staff ----------
// export interface StaffMember {
//   id: string;
//   fullName: string;
//   email: string;
//   role: UserRole;
//   phone?: string;
//   createdAt: string;
// }

// // ---------- Store State Interface ----------
// interface StoreState {
//   // --- LEARNERS SLICE ---
//   learners: DashboardLearner[];
//   learnersLoading: boolean;
//   learnersError: string | null;
//   learnersLastFetched: number | null;

//   fetchLearners: (force?: boolean) => Promise<void>;
//   addLearner: (
//     learner: Omit<
//       DashboardLearner,
//       "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
//     >,
//   ) => Promise<void>;
//   updateLearner: (
//     id: string,
//     updates: Partial<DashboardLearner>,
//   ) => Promise<void>;
//   deleteLearner: (id: string) => Promise<void>;
//   archiveCohort: (year: string) => Promise<void>;

//   // --- PROGRAMMES SLICE ---
//   programmes: ProgrammeTemplate[];
//   programmesLoading: boolean;
//   programmesError: string | null;
//   programmesLastFetched: number | null;

//   fetchProgrammes: (force?: boolean) => Promise<void>;
//   addProgramme: (
//     programme: Omit<
//       ProgrammeTemplate,
//       "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
//     >,
//   ) => Promise<void>;
//   updateProgramme: (
//     id: string,
//     updates: Partial<ProgrammeTemplate>,
//   ) => Promise<void>;
//   archiveProgramme: (id: string) => Promise<void>;

//   // --- STAFF SLICE (NEW) ---
//   staff: StaffMember[];
//   staffLoading: boolean;
//   staffError: string | null;
//   fetchStaff: (force?: boolean) => Promise<void>;
//   addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
//   deleteStaff: (id: string) => Promise<void>;

//   // --- BULK IMPORT ACTIONS ---
//   importUnifiedLearners: (
//     file: File,
//   ) => Promise<{ success: number; errors: string[] }>;
//   importProgrammesFromCSV: (
//     file: File,
//   ) => Promise<{ success: number; errors: string[] }>;
// }

// // ---------- Create Store ----------
// export const useStore = create<StoreState>()(
//   immer((set, get) => ({
//     // ==================== LEARNERS SLICE ====================
//     learners: [],
//     learnersLoading: false,
//     learnersError: null,
//     learnersLastFetched: null,

//     fetchLearners: async (force = false) => {
//       const { learnersLastFetched, learnersLoading } = get();
//       if (
//         !force &&
//         learnersLastFetched &&
//         Date.now() - learnersLastFetched < 5 * 60 * 1000
//       ) {
//         return;
//       }
//       if (learnersLoading) return;

//       set({ learnersLoading: true, learnersError: null });
//       try {
//         const q = query(collection(db, "learners"), orderBy("fullName"));
//         const snapshot = await getDocs(q);
//         const learners = snapshot.docs.map((doc) => {
//           const data = doc.data();
//           return { id: doc.id, ...data } as DashboardLearner;
//         });
//         set({
//           learners,
//           learnersLoading: false,
//           learnersLastFetched: Date.now(),
//         });
//       } catch (error) {
//         set({
//           learnersError: (error as Error).message,
//           learnersLoading: false,
//         });
//       }
//     },

//     addLearner: async (learner) => {
//       try {
//         const timestamp = now();
//         const learnerWithAudit = {
//           ...learner,
//           createdAt: timestamp,
//           createdBy: TEST_USER_ID,
//           updatedAt: timestamp,
//           updatedBy: TEST_USER_ID,
//         };
//         const docRef = await addDoc(
//           collection(db, "learners"),
//           learnerWithAudit,
//         );
//         const newLearner = {
//           ...learnerWithAudit,
//           id: docRef.id,
//         } as DashboardLearner;
//         set((state) => {
//           state.learners.push(newLearner);
//         });
//       } catch (error) {
//         console.error("Failed to add learner", error);
//         throw error;
//       }
//     },

//     updateLearner: async (id, updates) => {
//       try {
//         const learnerRef = doc(db, "learners", id);
//         const updatePayload = {
//           ...updates,
//           updatedAt: now(),
//           updatedBy: TEST_USER_ID,
//         };
//         await updateDoc(learnerRef, updatePayload);
//         set((state) => {
//           const index = state.learners.findIndex((l) => l.id === id);
//           if (index !== -1) {
//             state.learners[index] = {
//               ...state.learners[index],
//               ...updatePayload,
//             };
//           }
//         });
//       } catch (error) {
//         console.error("Failed to update learner", error);
//         throw error;
//       }
//     },

//     deleteLearner: async (id) => {
//       try {
//         await deleteDoc(doc(db, "learners", id));
//         set((state) => {
//           state.learners = state.learners.filter((l) => l.id !== id);
//         });
//       } catch (error) {
//         console.error("Failed to delete learner", error);
//         throw error;
//       }
//     },

//     archiveCohort: async (year: string) => {
//       const { learners } = get();
//       const batch = writeBatch(db);
//       let count = 0;

//       learners.forEach((l) => {
//         const learnerYear = l.trainingStartDate
//           ? l.trainingStartDate.substring(0, 4)
//           : "";
//         if (learnerYear === year && !l.isArchived) {
//           const ref = doc(db, "learners", l.id);
//           batch.update(ref, {
//             isArchived: true,
//             updatedAt: now(),
//           });
//           count++;
//         }
//       });

//       if (count > 0) {
//         await batch.commit();
//         set((state) => {
//           state.learners.forEach((l) => {
//             if (l.trainingStartDate?.startsWith(year)) {
//               l.isArchived = true;
//             }
//           });
//         });
//         alert(`Successfully archived ${count} learners.`);
//       } else {
//         alert(`No active learners found for ${year}.`);
//       }
//     },

//     // ==================== PROGRAMMES SLICE ====================
//     programmes: [],
//     programmesLoading: false,
//     programmesError: null,
//     programmesLastFetched: null,

//     fetchProgrammes: async (force = false) => {
//       const { programmesLastFetched, programmesLoading } = get();
//       if (
//         !force &&
//         programmesLastFetched &&
//         Date.now() - programmesLastFetched < 5 * 60 * 1000
//       ) {
//         return;
//       }
//       if (programmesLoading) return;

//       set({ programmesLoading: true, programmesError: null });
//       try {
//         const q = query(collection(db, "programmes"), orderBy("name"));
//         const snapshot = await getDocs(q);
//         const programmes = snapshot.docs.map((doc) => {
//           const data = doc.data();
//           return { id: doc.id, ...data } as ProgrammeTemplate;
//         });
//         set({
//           programmes,
//           programmesLoading: false,
//           programmesLastFetched: Date.now(),
//         });
//       } catch (error) {
//         set({
//           programmesError: (error as Error).message,
//           programmesLoading: false,
//         });
//       }
//     },

//     addProgramme: async (programme) => {
//       try {
//         const timestamp = now();
//         const programmeWithAudit = {
//           ...programme,
//           createdAt: timestamp,
//           createdBy: TEST_USER_ID,
//           updatedAt: timestamp,
//           updatedBy: TEST_USER_ID,
//         };
//         const docRef = await addDoc(
//           collection(db, "programmes"),
//           programmeWithAudit,
//         );
//         const newProg = {
//           ...programmeWithAudit,
//           id: docRef.id,
//         } as ProgrammeTemplate;
//         set((state) => {
//           state.programmes.push(newProg);
//         });
//       } catch (error) {
//         console.error("Failed to add programme", error);
//         throw error;
//       }
//     },

//     updateProgramme: async (id, updates) => {
//       try {
//         const progRef = doc(db, "programmes", id);
//         const updatePayload = {
//           ...updates,
//           updatedAt: now(),
//           updatedBy: TEST_USER_ID,
//         };
//         await updateDoc(progRef, updatePayload);
//         set((state) => {
//           const index = state.programmes.findIndex((p) => p.id === id);
//           if (index !== -1) {
//             state.programmes[index] = {
//               ...state.programmes[index],
//               ...updatePayload,
//             };
//           }
//         });
//       } catch (error) {
//         console.error("Failed to update programme", error);
//         throw error;
//       }
//     },

//     archiveProgramme: async (id) => {
//       try {
//         const progRef = doc(db, "programmes", id);
//         await updateDoc(progRef, {
//           isArchived: true,
//           updatedAt: now(),
//           updatedBy: TEST_USER_ID,
//         });
//         set((state) => {
//           const index = state.programmes.findIndex((p) => p.id === id);
//           if (index !== -1) {
//             state.programmes[index].isArchived = true;
//           }
//         });
//       } catch (error) {
//         console.error("Failed to archive programme", error);
//         throw error;
//       }
//     },

//     // ==================== STAFF SLICE (NEW) ====================
//     staff: [],
//     staffLoading: false,
//     staffError: null,

//     fetchStaff: async (force = false) => {
//       const { staff, staffLoading } = get();
//       if (!force && staff.length > 0) return;
//       if (staffLoading) return;

//       set({ staffLoading: true, staffError: null });
//       try {
//         const q = query(
//           collection(db, "users"),
//           where("role", "in", ["facilitator", "assessor", "moderator"]),
//         );
//         const snapshot = await getDocs(q);
//         const staffList = snapshot.docs.map((doc) => {
//           const data = doc.data();
//           return {
//             id: doc.id,
//             fullName: data.fullName || "Unknown Staff",
//             email: data.email,
//             role: data.role,
//             phone: data.phone,
//             createdAt: data.createdAt || now(),
//           } as StaffMember;
//         });
//         set({ staff: staffList, staffLoading: false });
//       } catch (error) {
//         console.error("Failed to fetch staff", error);
//         set({
//           staffError: (error as Error).message,
//           staffLoading: false,
//         });
//       }
//     },

//     addStaff: async (newStaff) => {
//       try {
//         const timestamp = now();
//         const staffData = {
//           ...newStaff,
//           createdAt: timestamp,
//           signatureUrl: "", // Init empty
//         };
//         const docRef = await addDoc(collection(db, "users"), staffData);
//         const createdStaff = { ...staffData, id: docRef.id } as StaffMember;
//         set((state) => {
//           state.staff.push(createdStaff);
//         });
//       } catch (error) {
//         console.error("Failed to add staff", error);
//         throw error;
//       }
//     },

//     deleteStaff: async (id) => {
//       try {
//         await deleteDoc(doc(db, "users", id));
//         set((state) => {
//           state.staff = state.staff.filter((s) => s.id !== id);
//         });
//       } catch (error) {
//         console.error("Failed to delete staff", error);
//         throw error;
//       }
//     },

//     // ==================== UNIFIED IMPORT (FULL) ====================
//     importUnifiedLearners: async (file: File) => {
//       return new Promise((resolve, reject) => {
//         Papa.parse(file, {
//           header: true,
//           skipEmptyLines: true,
//           transformHeader: (header) => header.trim(),
//           complete: async (results) => {
//             const rawData = results.data as any[];
//             const errors: string[] = [];
//             const learnersMap = new Map<string, any>();

//             if (rawData.length === 0) {
//               resolve({
//                 success: 0,
//                 errors: ["CSV file is empty or could not be parsed"],
//               });
//               return;
//             }

//             rawData.forEach((row, index) => {
//               try {
//                 const getStr = (val: any): string =>
//                   val !== null && val !== undefined ? String(val).trim() : "";

//                 // 1. Identification
//                 const idNumber = getStr(row.NationalId || row.ID_Number);
//                 if (!idNumber) return;

//                 // 2. Initialize Learner if not in Map
//                 if (!learnersMap.has(idNumber)) {
//                   // Name Parsing
//                   const firstName = getStr(row.LearnerFirstName);
//                   const lastName = getStr(row.LearnerLastName);
//                   const middleName = getStr(row.LearnerMiddleName);

//                   let fullName =
//                     firstName || lastName
//                       ? `${firstName} ${middleName} ${lastName}`
//                           .replace(/\s+/g, " ")
//                           .trim()
//                       : getStr(row.Full_Name) || "Unknown Learner";

//                   const parseYYYYMMDD = (val: string) => {
//                     if (val.length === 8 && /^\d+$/.test(val)) {
//                       return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
//                     }
//                     return val;
//                   };

//                   const dateOfBirth = parseYYYYMMDD(
//                     getStr(row.LearnerBirthDate || row.Date_Of_Birth),
//                   );
//                   const rawStart = getStr(
//                     row.TrainingStartDate || row.Training_Start_Date,
//                   );
//                   const trainingStartDate = rawStart
//                     ? parseYYYYMMDD(rawStart)
//                     : new Date().toISOString().split("T")[0];

//                   const timestamp = now();

//                   const newLearner = {
//                     fullName,
//                     idNumber,
//                     dateOfBirth,
//                     email: getStr(row.LearnerEmailAddress || row.Email),
//                     phone: getStr(
//                       row.LearnerCellPhoneNumber ||
//                         row.Phone ||
//                         row.LearnerPhoneNumber,
//                     ),

//                     trainingStartDate: trainingStartDate,
//                     isArchived: false,

//                     qualification: {
//                       name: getStr(
//                         row.Programme_Name || row.Qualification_Name,
//                       ),
//                       saqaId: getStr(row.QualificationId || row.SAQA_ID),
//                       credits:
//                         parseInt(getStr(row.Total_Credits || row.Credits)) || 0,
//                       totalNotionalHours:
//                         (parseInt(getStr(row.Total_Credits || row.Credits)) ||
//                           0) * 10,
//                       nqfLevel: parseInt(getStr(row.NQF_Level)) || 0,
//                       dateAssessed: "",
//                     },

//                     knowledgeModules: [],
//                     practicalModules: [],
//                     workExperienceModules: [],

//                     eisaAdmission:
//                       getStr(row.LearnerReadinessforEISATypeId) === "01" ||
//                       getStr(row.EISA_Admission).toLowerCase() === "yes",

//                     verificationCode:
//                       getStr(row.Verification_Code) ||
//                       `SOR-${Math.floor(Math.random() * 10000)}`,
//                     issueDate:
//                       getStr(row.StatementofResultsIssueDate) ||
//                       timestamp.split("T")[0],
//                     status: "in-progress",

//                     // --- FULL QCTO DEMOGRAPHICS MAPPING ---
//                     demographics: {
//                       sdpCode: getStr(row.SDPCode),
//                       qualificationId: getStr(
//                         row.QualificationId || row.QualificationID,
//                       ),
//                       learnerAlternateId: getStr(row.LearnerAlternateId),
//                       alternativeIdType: getStr(row.AlternativeIdType),
//                       equityCode: getStr(row.EquityCode),
//                       nationalityCode: getStr(row.NationalityCode),
//                       homeLanguageCode: getStr(row.HomeLanguageCode),
//                       genderCode: getStr(row.GenderCode),
//                       citizenResidentStatusCode: getStr(
//                         row.CitizenResidentStatusCode,
//                       ),
//                       socioeconomicStatusCode: getStr(
//                         row.SocioeconomicStatusCode,
//                       ),
//                       disabilityStatusCode: getStr(row.DisabilityStatusCode),
//                       disabilityRating: getStr(row.DisabilityRating),
//                       immigrantStatus: getStr(row.ImmigrantStatus),
//                       learnerMiddleName: getStr(row.LearnerMiddleName),
//                       learnerTitle: getStr(row.LearnerTitle),
//                       learnerHomeAddress1: getStr(row.LearnerHomeAddress1),
//                       learnerHomeAddress2: getStr(row.LearnerHomeAddress2),
//                       learnerHomeAddress3: getStr(row.LearnerHomeAddress3),
//                       learnerPostalAddress1: getStr(row.LearnerPostalAddress1),
//                       learnerPostalAddress2: getStr(row.LearnerPostalAddress2),
//                       learnerPostalAddress3: getStr(row.LearnerPostalAddress3),
//                       learnerHomeAddressPostalCode: getStr(
//                         row.LearnerHomeAddressPostalCode,
//                       ),
//                       learnerPostalAddressPostCode: getStr(
//                         row.LearnerPostalAddressPostCode,
//                       ),
//                       learnerPhoneNumber: getStr(row.LearnerPhoneNumber),
//                       learnerFaxNumber: getStr(row.LearnerFaxNumber),
//                       learnerEmailAddress: getStr(row.LearnerEmailAddress),
//                       provinceCode: getStr(row.ProvinceCode),
//                       statsaaAreaCode: getStr(row.STATSSAAreaCode),
//                       popiActAgree: getStr(row.POPIActAgree),
//                       popiActDate: getStr(row.POPIActDate),
//                       expectedTrainingCompletionDate: getStr(
//                         row.ExpectedTrainingCompletionDate,
//                       ),
//                       statementOfResultsStatus: getStr(
//                         row.StatementOfResultsStatus,
//                       ),
//                       statementOfResultsIssueDate: getStr(
//                         row.StatementOfResultsIssueDate,
//                       ),
//                       assessmentCentreCode: getStr(row.AssessmentCentreCode),
//                       learnerReadinessForEISATypeId: getStr(
//                         row.LearnerReadinessForEISATypeId,
//                       ),
//                       flc: getStr(row.FLC),
//                       flcStatementOfResultNumber: getStr(
//                         row.FLCStatementofresultnumber,
//                       ),
//                       dateStamp: getStr(row.DateStamp),
//                     },

//                     createdAt: timestamp,
//                     createdBy: TEST_USER_ID,
//                     updatedAt: timestamp,
//                     updatedBy: TEST_USER_ID,
//                   };

//                   learnersMap.set(idNumber, newLearner);
//                 }

//                 // 3. Process Modules
//                 const moduleName = getStr(row.Module_Name);
//                 if (moduleName) {
//                   const learner = learnersMap.get(idNumber);
//                   const moduleType = getStr(row.Module_Type).toLowerCase();
//                   const moduleCredits =
//                     parseInt(getStr(row.Module_Credits)) || 0;
//                   const moduleDate = getStr(row.Module_Date);
//                   const moduleResult = getStr(row.Module_Result);

//                   const moduleBase = {
//                     name: moduleName,
//                     credits: moduleCredits,
//                     notionalHours: moduleCredits * 10,
//                     nqfLevel:
//                       parseInt(getStr(row.Module_NQF_Level)) ||
//                       learner.qualification.nqfLevel ||
//                       5,
//                   };

//                   if (moduleType.includes("knowledge")) {
//                     learner.knowledgeModules.push({
//                       ...moduleBase,
//                       dateAssessed: moduleDate,
//                       status: moduleResult || "Competent",
//                     });
//                   } else if (moduleType.includes("practical")) {
//                     learner.practicalModules.push({
//                       ...moduleBase,
//                       dateAssessed: moduleDate,
//                       status: moduleResult || "Pass",
//                     });
//                   } else if (
//                     moduleType.includes("work") ||
//                     moduleType.includes("experience")
//                   ) {
//                     learner.workExperienceModules.push({
//                       ...moduleBase,
//                       dateSignedOff: moduleDate,
//                       status: moduleResult || "Competent",
//                     });
//                   }
//                 }
//               } catch (err) {
//                 errors.push(
//                   `Row ${index + 2} Error: ${(err as Error).message}`,
//                 );
//               }
//             });

//             if (learnersMap.size === 0) {
//               resolve({
//                 success: 0,
//                 errors: errors.length ? errors : ["No valid learners found"],
//               });
//               return;
//             }

//             try {
//               const batch = writeBatch(db);
//               learnersMap.forEach((learner) => {
//                 const docRef = doc(collection(db, "learners"));
//                 batch.set(docRef, learner);
//               });
//               await batch.commit();
//               await get().fetchLearners(true);
//               resolve({ success: learnersMap.size, errors });
//             } catch (error) {
//               reject(error);
//             }
//           },
//           error: (error) => reject(error),
//         });
//       });
//     },

//     // ==================== PROGRAMMES IMPORT ====================
//     importProgrammesFromCSV: async (file: File) => {
//       return new Promise((resolve, reject) => {
//         Papa.parse(file, {
//           header: true,
//           skipEmptyLines: true,
//           complete: async (results) => {
//             const rawData = results.data as any[];
//             const errors: string[] = [];
//             const programmesToAdd: any[] = [];
//             const groupedBySaqa = rawData.reduce((acc: any, row: any) => {
//               if (!row.SAQA_ID) return acc;
//               if (!acc[row.SAQA_ID]) acc[row.SAQA_ID] = [];
//               acc[row.SAQA_ID].push(row);
//               return acc;
//             }, {});

//             Object.keys(groupedBySaqa).forEach((saqaId) => {
//               const rows = groupedBySaqa[saqaId];
//               const baseInfo = rows[0];
//               const timestamp = now();
//               const programme = {
//                 name: baseInfo.Programme_Name || "Unknown Programme",
//                 saqaId,
//                 credits: parseInt(baseInfo.Total_Credits) || 0,
//                 totalNotionalHours:
//                   (parseInt(baseInfo.Total_Credits) || 0) * 10,
//                 nqfLevel: parseInt(baseInfo.NQF_Level) || 0,
//                 knowledgeModules: [] as any[],
//                 practicalModules: [] as any[],
//                 workExperienceModules: [] as any[],
//                 isArchived: false,
//                 createdAt: timestamp,
//                 createdBy: TEST_USER_ID,
//                 updatedAt: timestamp,
//                 updatedBy: TEST_USER_ID,
//               };

//               rows.forEach((row: any) => {
//                 const moduleCredits = parseInt(row.Module_Credits) || 0;
//                 const moduleData = {
//                   name: row.Module_Name || "Unnamed Module",
//                   credits: moduleCredits,
//                   notionalHours: moduleCredits * 10,
//                   nqfLevel:
//                     parseInt(row.Module_NQF_Level) || programme.nqfLevel,
//                 };
//                 const moduleType = row.Module_Type?.toLowerCase();

//                 if (moduleType === "knowledge")
//                   programme.knowledgeModules.push(moduleData);
//                 else if (moduleType === "practical")
//                   programme.practicalModules.push(moduleData);
//                 else if (moduleType?.includes("work"))
//                   programme.workExperienceModules.push(moduleData);
//               });

//               if (
//                 programme.knowledgeModules.length ||
//                 programme.practicalModules.length ||
//                 programme.workExperienceModules.length
//               ) {
//                 programmesToAdd.push(programme);
//               }
//             });

//             if (programmesToAdd.length === 0) {
//               resolve({
//                 success: 0,
//                 errors: ["No valid programmes found"],
//               });
//               return;
//             }

//             try {
//               const batch = writeBatch(db);
//               programmesToAdd.forEach((prog) => {
//                 const docRef = doc(collection(db, "programmes"));
//                 batch.set(docRef, prog);
//               });
//               await batch.commit();
//               await get().fetchProgrammes(true);
//               resolve({ success: programmesToAdd.length, errors });
//             } catch (error) {
//               reject(error);
//             }
//           },
//           error: (error) => reject(error),
//         });
//       });
//     },

//   })),
// );
