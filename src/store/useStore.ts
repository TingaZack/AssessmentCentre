// src/store/useStore.ts

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { db } from "../lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
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
  setDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import Papa from "papaparse";
import type {
  DashboardLearner,
  ProgrammeTemplate,
  Employer,
  SystemSettings,
} from "../types";
import type { UserProfile } from "../types/auth.types";
import { getAuth } from "firebase/auth";
import {
  createCohortSlice,
  type CohortSlice,
} from "./slices/cohortSlice.ts/cohortSlice";
import { generateSorId } from "../pages/utils/validation";

const now = () => new Date().toISOString();

export interface EnrollmentRecord {
  cohortId: string;
  programmeId: string;
  status: "active" | "dropped" | "completed";
  dateAssigned: string;
  exitDate?: string | null;
  exitReason?: string;
}

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "facilitator" | "assessor" | "moderator" | "mentor";
  phone?: string;
  authUid: string;
  assessorRegNumber?: string;
  employerId?: string;
  status?: "active" | "archived";
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id?: string;
  cohortId: string;
  date: string;
  facilitatorId: string;
  presentLearners: string[];
  notes?: string;
}

// const PROFILE_KEYS = [
//   "fullName",
//   "firstName",
//   "lastName",
//   "idNumber",
//   "dateOfBirth",
//   "email",
//   "phone",
//   "mobile",
//   "profilePhotoUrl",
//   "profileCompleted",
//   "authUid",
//   "uid",
//   "authStatus",
//   "demographics",
// ];

const PROFILE_KEYS = [
  "fullName",
  "firstName",
  "lastName",
  "idNumber",
  "dateOfBirth",
  "email",
  "phone",
  "mobile",
  "profilePhotoUrl",
  "profileCompleted",
  "authUid",
  "uid",
  "authStatus",
  "demographics",
  "cohortId",
  "campusId",
  "qualification",
];

// Helper to scrub undefined values before Firestore writes
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return "";
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj === "object") {
    const cleaned: any = {};
    for (const key in obj) {
      cleaned[key] =
        obj[key] === undefined ? "" : sanitizeForFirestore(obj[key]);
    }
    return cleaned;
  }
  return obj;
};

interface StoreState extends CohortSlice {
  user: UserProfile | null;
  loading: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  refreshUser: () => Promise<void>;

  // --- LEARNERS SLICE ---
  learners: DashboardLearner[];
  stagingLearners: DashboardLearner[];
  learnersLoading: boolean;
  learnersError: string | null;
  learnersLastFetched: number | null;

  clearUser: () => void;

  fetchLearners: (force?: boolean) => Promise<void>;
  fetchStagingLearners: () => Promise<void>;

  approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
  inviteLearner: (learner: DashboardLearner) => Promise<void>;
  discardStagingLearners: (ids: string[]) => Promise<void>;

  settings: SystemSettings | null;
  fetchSettings: () => Promise<void>;

  addLearner: (
    learner: Omit<
      DashboardLearner,
      | "id"
      | "learnerId"
      | "enrollmentId"
      | "createdAt"
      | "createdBy"
      | "updatedAt"
      | "updatedBy"
    >,
  ) => Promise<void>;
  updateLearner: (
    id: string,
    updates: Partial<DashboardLearner>,
  ) => Promise<void>;
  archiveLearner: (id: string) => Promise<void>;
  deleteLearnerPermanent: (
    id: string,
    audit: { reason: string; adminId: string; adminName: string },
  ) => Promise<void>;
  restoreLearner: (id: string) => Promise<void>;
  dropLearner: (id: string, reason: string) => Promise<void>;
  archiveCohort: (year: string) => Promise<{ count: number }>;

  // RELATIONAL ACTIONS
  enrollLearnerInCohort: (
    learnerId: string,
    cohortId: string,
    programmeId: string,
  ) => Promise<void>;
  dropLearnerFromCohort: (
    learnerId: string,
    cohortId: string,
    reason: string,
  ) => Promise<void>;

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
  updateStaff: (id: string, updates: Partial<StaffMember>) => Promise<void>;
  deleteStaff: (id: string) => Promise<void>;
  updateStaffProfile: (uid: string, updates: any) => Promise<void>;

  // --- BULK IMPORT ACTIONS ---
  importUnifiedLearners: (
    file: File,
  ) => Promise<{ success: number; errors: string[] }>;
  importProgrammesFromCSV: (
    file: File,
  ) => Promise<{ success: number; errors: string[] }>;

  assignAssessmentToLearner: (
    assessmentTemplate: any,
    learner: DashboardLearner,
  ) => Promise<string>;

  employers: Employer[];
  fetchEmployers: () => Promise<void>;

  updateLearnerPlacement: (
    enrollmentId: string,
    employerId: string,
    mentorId: string,
  ) => Promise<void>;

  // --- WORKPLACE MENTOR DATA ---
  assessments: any[];
  submissions: any[];
  enrollments: any[];
  fetchAssessments: () => Promise<void>;
  fetchSubmissions: () => Promise<void>;
  fetchEnrollments: () => Promise<void>;

  // AD-HOC CERTIFICATE STUDIO HISTORY
  adHocCertificates: any[];
  fetchAdHocCertificates: (force?: boolean) => Promise<void>;

  certificateGroups: any[];
  fetchCertificateGroups: (force?: boolean) => Promise<void>;
  createCertificateGroup: (name: string) => Promise<void>;

  renameCertificateGroup: (id: string, newName: string) => Promise<void>;
}

export const useStore = create<StoreState>()(
  immer((set, get, api) => ({
    ...createCohortSlice(set, get, api),

    user: null,
    loading: true,
    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),

    clearUser: () => set({ user: null }),

    refreshUser: async () => {
      const currentUser = get().user;
      if (!currentUser?.uid) return;
      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const updatedProfile: UserProfile = {
            ...currentUser,
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

    // AD-HOC CERTIFICATE STUDIO HISTORY FETCH
    adHocCertificates: [],
    fetchAdHocCertificates: async (force = false) => {
      const { adHocCertificates } = get();
      if (!force && adHocCertificates.length > 0) return;

      try {
        const q = query(
          collection(db, "ad_hoc_certificates"),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);
        const history = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        set({ adHocCertificates: history });
      } catch (error) {
        console.error("Failed to load ad-hoc certificates:", error);
      }
    },
    certificateGroups: [],
    fetchCertificateGroups: async (force = false) => {
      const { certificateGroups } = get();
      if (!force && certificateGroups.length > 0) return;

      try {
        const q = query(
          collection(db, "certificate_groups"),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);
        set({
          certificateGroups: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        });
      } catch (error) {
        console.error("Group Fetch Error:", error);
      }
    },
    createCertificateGroup: async (name: string) => {
      const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
      try {
        await addDoc(collection(db, "certificate_groups"), {
          name,
          createdBy: USER_ID,
          createdAt: new Date().toISOString(),
        });
        await get().fetchCertificateGroups(true);
      } catch (error) {
        console.error("Failed to create folder", error);
        throw error;
      }
    },
    renameCertificateGroup: async (id: string, newName: string) => {
      try {
        await updateDoc(doc(db, "certificate_groups", id), {
          name: newName,
          updatedAt: new Date().toISOString(),
        });
        await get().fetchCertificateGroups(true);
      } catch (error) {
        console.error("Failed to rename folder", error);
        throw error;
      }
    },

    // --- MENTOR DATA FETCHERS ---
    assessments: [],
    submissions: [],
    enrollments: [],

    fetchAssessments: async () => {
      try {
        const snap = await getDocs(collection(db, "assessments"));
        set({ assessments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      } catch (e) {
        console.error(e);
      }
    },

    fetchSubmissions: async () => {
      try {
        const snap = await getDocs(collection(db, "learner_submissions"));
        set({ submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      } catch (e) {
        console.error(e);
      }
    },

    fetchEnrollments: async () => {
      try {
        const snap = await getDocs(collection(db, "enrollments"));
        set({ enrollments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      } catch (e) {
        console.error(e);
      }
    },

    // ==================== EMPLOYERS SLICE ====================
    employers: [],
    fetchEmployers: async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "employers"));
        const employersData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Employer[];

        employersData.sort((a, b) => a.name.localeCompare(b.name));
        set({ employers: employersData });
      } catch (error) {
        console.error("Error fetching employers:", error);
      }
    },

    // ==================== LEARNERS SLICE ====================
    learners: [],
    learnersLoading: false,
    learnersError: null,
    learnersLastFetched: null,

    fetchLearners: async (force = false) => {
      const { learnersLastFetched, learnersLoading } = get();

      // 1. ⏱️ CACHE SHIELD
      // Prevent redundant network calls if data was fetched less than 5 minutes ago
      if (
        !force &&
        learnersLastFetched &&
        Date.now() - learnersLastFetched < 5 * 60 * 1000
      )
        return;

      if (learnersLoading) return;

      set({ learnersLoading: true, learnersError: null });

      try {
        // 2. 📡 PARALLEL FETCH
        // Get the entire Identity database and the entire Registration Ledger simultaneously
        const [profilesSnap, enrollmentsSnap] = await Promise.all([
          getDocs(query(collection(db, "learners"))),
          getDocs(query(collection(db, "enrollments"))),
        ]);

        const profilesMap = new Map<string, any>();
        const combinedLearners: DashboardLearner[] = [];
        const usedProfileIds = new Set<string>();

        // 3. 👤 MAP IDENTITIES
        // Every document ID in the 'learners' collection is strictly an idNumber
        profilesSnap.docs.forEach((doc) => {
          profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        // 4. 📑 PROCESS THE REGISTRATION LEDGER
        // Match every enrollment document to its physical human profile
        enrollmentsSnap.docs.forEach((docSnap) => {
          const enrollment = docSnap.data();
          const profile = profilesMap.get(enrollment.learnerId);

          // 🛡️ GHOST SHIELD: We only process the join if the Human Profile exists and is valid
          if (profile && (profile.fullName || profile.idNumber)) {
            usedProfileIds.add(profile.id);

            combinedLearners.push({
              ...profile, // Physical Identity
              ...enrollment, // Relational Ledger Data
              id: docSnap.id, // Use the unique Ledger ID (cohortId_idNumber)
              enrollmentId: docSnap.id,
              learnerId: profile.id,
            } as DashboardLearner);
          } else if (!profile) {
            // Log orphan records for system cleanup but do not show in UI
            console.warn(
              `⚠️ Orphaned Enrollment found: ${docSnap.id} points to missing idNumber ${enrollment.learnerId}`,
            );
          }
        });

        // 5. 💤 INJECT DORMANT PROFILES
        // Find Humans who exist in the 'learners' collection but are not currently enrolled in any class
        profilesMap.forEach((profile, profileId) => {
          if (!usedProfileIds.has(profileId)) {
            // Check for minimum data integrity before adding to the directory
            if (profile.fullName || profile.idNumber) {
              combinedLearners.push({
                ...profile,
                id: profileId, // Deterministic ID (idNumber)
                enrollmentId: "", // Explicitly empty: No active ledger record
                learnerId: profileId,
                cohortId: profile.cohortId || "", // Pointer to last known cohort or empty
              } as DashboardLearner);
            }
          }
        });

        // 6. 🔡 DETERMINISTIC SORT
        // Ensure the directory is always alphabetical for the UI
        combinedLearners.sort((a, b) => {
          const nameA = String(a.fullName || "").toLowerCase();
          const nameB = String(b.fullName || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });

        // 7. 💾 UPDATE GLOBAL STATE
        set({
          learners: combinedLearners,
          learnersLoading: false,
          learnersLastFetched: Date.now(),
        });
      } catch (systemError: any) {
        // 🚀 SYSTEM ERROR PROPAGATION
        console.error("Critical Fetch Failure in fetchLearners:", systemError);
        set({
          learnersError:
            systemError.message || "Failed to synchronize learner directory.",
          learnersLoading: false,
        });
        throw systemError; // Allow the calling component to handle the specific error
      }
    },

    addLearner: async (payload) => {
      const USER_ID = getAuth().currentUser?.uid || "System";

      // 1. 🛑 STRICT VALIDATION: No Fallbacks
      // We enforce the idNumber as the physical Document ID to prevent ghost duplicates.
      if (!payload.idNumber || payload.idNumber.trim() === "") {
        throw new Error(
          "Validation Error: Learner ID Number is strictly required to initialize a profile.",
        );
      }

      const learnerDocId = payload.idNumber.trim();

      try {
        const timestamp = now();
        const profileData: any = {};

        // 2. 🗄️ DATA SEPARATION
        // Extract only keys belonging to the physical Identity Profile
        Object.keys(payload).forEach((key) => {
          if (PROFILE_KEYS.includes(key)) {
            profileData[key] = (payload as any)[key];
          }
        });

        // 3. 🛠️ IDENTITY CONSTRUCTION
        // Anchor the identity with deterministic metadata
        profileData.id = learnerDocId;
        profileData.learnerId = learnerDocId;
        profileData.createdAt = timestamp;
        profileData.createdBy = USER_ID;
        profileData.updatedAt = timestamp;
        profileData.updatedBy = USER_ID;
        profileData.authStatus = "pending";
        profileData.isArchived = false;
        profileData.isDraft = false;

        // Ensure cohortId is strictly a real string or empty (Dormant state)
        // We do NOT use "Unassigned" as a fallback string.
        profileData.cohortId = payload.cohortId || "";

        // 4. 💾 PHYSICAL WRITE: Identity Profile
        // Using setDoc with the ID Number ensures we anchor to the Human Identity.
        // This prevents the creation of auto-generated "ghost" IDs.
        await setDoc(
          doc(db, "learners", learnerDocId),
          sanitizeForFirestore(profileData),
          { merge: true },
        );

        // 5. 🚀 RELATIONSHIP SYNC: The Registration Ledger
        // We only create an enrollment record if a valid cohortId is provided.
        // This implements the "Importing is not Enrolling" product rule.
        if (payload.cohortId && payload.cohortId !== "") {
          const batch = writeBatch(db);
          const enrollmentId = `${payload.cohortId}_${learnerDocId}`;

          const enrollmentData = {
            id: enrollmentId,
            learnerId: learnerDocId,
            cohortId: payload.cohortId,
            qualification: payload.qualification || {},
            status: "active",
            enrolledAt: timestamp,
            updatedAt: timestamp,
            assignedBy: USER_ID,
            isArchived: false,
            // Carry over academic requirements from payload
            practicalModules: payload.practicalModules || [],
            knowledgeModules: payload.knowledgeModules || [],
            workExperienceModules: payload.workExperienceModules || [],
          };

          // A. Create the Ledger Entry
          batch.set(
            doc(db, "enrollments", enrollmentId),
            sanitizeForFirestore(enrollmentData),
            { merge: true },
          );

          // B. Update the Cohort Register
          batch.update(doc(db, "cohorts", payload.cohortId), {
            learnerIds: arrayUnion(learnerDocId),
          });

          // C. Ghost Cleanup: Ensure no legacy "Unassigned" ledger exists for this ID
          batch.delete(doc(db, "enrollments", `Unassigned_${learnerDocId}`));

          await batch.commit();
        }

        // 6. 🔄 UI STATE REFRESH
        // Fetch fresh data from the server to ensure local state matches deterministic IDs.
        await get().fetchLearners(true);
        if ((get() as any).fetchCohorts) await (get() as any).fetchCohorts();

        console.log(
          `✅ System: Successfully initialized profile ${learnerDocId}`,
        );
      } catch (systemError: any) {
        // Log the raw system error and propagate it to the UI
        console.error("❌ Critical Failure in addLearner:", systemError);
        throw systemError;
      }
    },
    // addLearner: async (payload) => {
    //   const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
    //   try {
    //     const timestamp = now();
    //     const profileData: any = {};
    //     const enrollmentData: any = {};

    //     Object.keys(payload).forEach((key) => {
    //       if (PROFILE_KEYS.includes(key))
    //         profileData[key] = (payload as any)[key];
    //       else enrollmentData[key] = (payload as any)[key];
    //     });

    //     profileData.createdAt = timestamp;
    //     profileData.createdBy = USER_ID;
    //     // 🚀 Add cohort pointer for fast UI loading
    //     profileData.cohortId = enrollmentData.cohortId || "Unassigned";

    //     enrollmentData.createdAt = timestamp;
    //     enrollmentData.createdBy = USER_ID;
    //     enrollmentData.isDraft = false;
    //     enrollmentData.isArchived = false;
    //     enrollmentData.status = "in-progress";

    //     if (!enrollmentData.verificationCode) {
    //       const issueDate = enrollmentData.issueDate || timestamp.split("T")[0];
    //       const name = profileData.fullName || "Unknown Learner";
    //       const providerCode =
    //         import.meta.env.VITE_SDP_CODE || "SDP070824115131";

    //       enrollmentData.verificationCode = generateSorId(
    //         name,
    //         issueDate,
    //         providerCode,
    //       );
    //       enrollmentData.issueDate = issueDate;
    //     }

    //     let finalLearnerId = "";

    //     const q = query(
    //       collection(db, "learners"),
    //       where("idNumber", "==", profileData.idNumber),
    //     );
    //     const existingSnap = await getDocs(q);

    //     if (!existingSnap.empty) {
    //       finalLearnerId = existingSnap.docs[0].id;
    //       await updateDoc(doc(db, "learners", finalLearnerId), {
    //         ...profileData,
    //         updatedAt: timestamp,
    //       });
    //     } else {
    //       const newProfileRef = await addDoc(
    //         collection(db, "learners"),
    //         profileData,
    //       );
    //       finalLearnerId = newProfileRef.id;
    //     }

    //     enrollmentData.learnerId = finalLearnerId;

    //     // 🚀 FIX: Use Registration Ledger Pattern for manually added learners too!
    //     const enrollmentId = `${enrollmentData.cohortId || "Unassigned"}_${finalLearnerId}`;
    //     enrollmentData.id = enrollmentId;

    //     const newEnrollmentRef = doc(db, "enrollments", enrollmentId);
    //     await setDoc(newEnrollmentRef, enrollmentData, { merge: true });

    //     set((state) => {
    //       state.learners.push({
    //         ...profileData,
    //         ...enrollmentData,
    //         id: enrollmentId,
    //         enrollmentId: enrollmentId,
    //         learnerId: finalLearnerId,
    //       } as DashboardLearner);
    //     });
    //   } catch (error) {
    //     console.error("Failed to add learner", error);
    //     throw error;
    //   }
    // },

    updateLearner: async (id, updates) => {
      const CURRENT_USER_ID = getAuth().currentUser?.uid || "System";
      const timestamp = now();

      try {
        const state = get();
        const existingRow = state.learners.find((l) => l.id === id);

        // 🛑 STRICT VALIDATION: No fallbacks. Reject update if record is missing.
        if (!existingRow) {
          throw new ReferenceError(
            `Update Failed: Learner record with ID ${id} not found in local state.`,
          );
        }

        // 🚀 DETERMINISTIC ANCHOR: Use the physical ID Number for collection targeting.
        const learnerIdNumber = existingRow.idNumber;
        const oldCohortId = existingRow.cohortId || "";
        const newCohortId = updates.cohortId;

        const batch = writeBatch(db);

        // 1. 👤 PREPARE PROFILE UPDATES (Identity)
        const profileUpdates: any = {
          updatedAt: timestamp,
          updatedBy: CURRENT_USER_ID,
        };

        // Map updates to profile keys
        Object.keys(updates).forEach((key) => {
          if (PROFILE_KEYS.includes(key)) {
            profileUpdates[key] = (updates as any)[key];
          }
        });

        // Physical write to 'learners' collection using idNumber as key
        batch.set(
          doc(db, "learners", learnerIdNumber),
          sanitizeForFirestore(profileUpdates),
          { merge: true },
        );

        // 2. 📑 HANDLE RELATIONAL SYNC (The Ledger Logic)
        // Check if a cohort movement or assignment change is happening
        const isCohortChanging =
          newCohortId !== undefined && newCohortId !== oldCohortId;

        if (isCohortChanging) {
          // A. TRANSFER TO NEW CLASS (Create New Ledger)
          if (newCohortId && newCohortId !== "") {
            const newEnrollmentId = `${newCohortId}_${learnerIdNumber}`;

            const newEnrollmentData = {
              ...existingRow, // Maintain existing data
              ...updates, // Apply new changes (campus, qualification, etc)
              id: newEnrollmentId,
              learnerId: learnerIdNumber,
              cohortId: newCohortId,
              status: "active",
              enrolledAt: existingRow.createdAt || timestamp,
              updatedAt: timestamp,
              isArchived: false,
            };

            batch.set(
              doc(db, "enrollments", newEnrollmentId),
              sanitizeForFirestore(newEnrollmentData),
              { merge: true },
            );

            // Update New Cohort Class List
            batch.update(doc(db, "cohorts", newCohortId), {
              learnerIds: arrayUnion(learnerIdNumber),
            });
          }

          // B. REMOVE FROM OLD CLASS (Ledger Deletion)
          if (oldCohortId && oldCohortId !== "") {
            const oldEnrollmentId = `${oldCohortId}_${learnerIdNumber}`;
            batch.delete(doc(db, "enrollments", oldEnrollmentId));

            // Remove from Old Cohort Class List
            batch.update(doc(db, "cohorts", oldCohortId), {
              learnerIds: arrayRemove(learnerIdNumber),
            });
          }

          // C. GHOST PURGE: Delete any legacy "Unassigned" ledger docs for this human
          batch.delete(doc(db, "enrollments", `Unassigned_${learnerIdNumber}`));
        } else if (existingRow.enrollmentId) {
          // 3. 🛠️ STANDARD LEDGER UPDATE (No Class Change)
          // Update the existing ledger document if non-relational fields changed
          const enrollmentUpdates: any = {
            updatedAt: timestamp,
            updatedBy: CURRENT_USER_ID,
          };

          // Sync critical fields to the ledger even if cohort stayed the same
          if (updates.status) enrollmentUpdates.status = updates.status;
          if (updates.campusId) enrollmentUpdates.campusId = updates.campusId;
          if (updates.qualification)
            enrollmentUpdates.qualification = updates.qualification;

          batch.set(
            doc(db, "enrollments", existingRow.enrollmentId),
            sanitizeForFirestore(enrollmentUpdates),
            { merge: true },
          );
        }

        // 4. 🧨 ATOMIC COMMIT
        // batch.commit() will throw a system-defined error if security rules fail
        await batch.commit();

        // 5. 🔄 LOCAL STATE SYNCHRONIZATION
        set((state) => {
          const index = state.learners.findIndex((l) => l.id === id);
          if (index !== -1) {
            state.learners[index] = {
              ...state.learners[index],
              ...updates,
              // If cohort changed, update the pointer in local state
              enrollmentId:
                isCohortChanging && newCohortId !== ""
                  ? `${newCohortId}_${learnerIdNumber}`
                  : state.learners[index].enrollmentId,
            };
          }
          // Sync current user if they edited their own profile
          if (
            state.user &&
            (state.user.uid === learnerIdNumber ||
              state.user.uid === existingRow.authUid)
          ) {
            Object.assign(state.user, updates);
          }
        });

        // 6. 🚿 FRESH RE-FETCH
        await get().fetchLearners(true);
        if ((get() as any).fetchCohorts) await (get() as any).fetchCohorts();
      } catch (systemError: any) {
        // Log raw system details and propagate the actual Error object to the UI
        console.error("❌ updateLearner Sync Failure:", systemError);
        throw systemError;
      }
    },
    // updateLearner: async (id, updates) => {
    //   const CURRENT_USER_ID = getAuth().currentUser?.uid || "UnknownUser";
    //   try {
    //     const existingRow = get().learners.find((l) => l.id === id);

    //     const learnerId = existingRow?.learnerId || id;
    //     const enrollmentId = existingRow?.enrollmentId || null;

    //     const profileUpdates: any = {
    //       updatedAt: now(),
    //       updatedBy: CURRENT_USER_ID,
    //     };
    //     const enrollmentUpdates: any = {
    //       updatedAt: now(),
    //       updatedBy: CURRENT_USER_ID,
    //     };
    //     let hasProfileUpdate = false;
    //     let hasEnrollmentUpdate = false;

    //     Object.keys(updates).forEach((key) => {
    //       if (PROFILE_KEYS.includes(key)) {
    //         profileUpdates[key] = (updates as any)[key];
    //         hasProfileUpdate = true;
    //       } else {
    //         enrollmentUpdates[key] = (updates as any)[key];
    //         hasEnrollmentUpdate = true;
    //       }
    //     });

    //     // 🚀 ROOT FIX: Force synchronization of critical mapping fields to the Ledger too!
    //     if (updates.cohortId !== undefined) {
    //       enrollmentUpdates.cohortId = updates.cohortId;
    //       hasEnrollmentUpdate = true;
    //     }
    //     if (updates.campusId !== undefined) {
    //       enrollmentUpdates.campusId = updates.campusId;
    //       hasEnrollmentUpdate = true;
    //     }
    //     if (updates.qualification !== undefined) {
    //       enrollmentUpdates.qualification = updates.qualification;
    //       hasEnrollmentUpdate = true;
    //     }

    //     const batch = writeBatch(db);

    //     if (hasProfileUpdate && learnerId) {
    //       batch.set(doc(db, "learners", learnerId), profileUpdates, {
    //         merge: true,
    //       });
    //     }

    //     if (hasEnrollmentUpdate) {
    //       if (enrollmentId) {
    //         batch.set(doc(db, "enrollments", enrollmentId), enrollmentUpdates, {
    //           merge: true,
    //         });
    //       } else {
    //         // Fallback if ledger record somehow doesn't exist
    //         batch.set(doc(db, "learners", learnerId), enrollmentUpdates, {
    //           merge: true,
    //         });
    //       }
    //     }

    //     await batch.commit();

    //     set((state) => {
    //       const index = state.learners.findIndex((l) => l.id === id);
    //       if (index !== -1) {
    //         state.learners[index] = { ...state.learners[index], ...updates };
    //       }
    //       if (state.user && state.user.uid === learnerId) {
    //         state.user = { ...state.user, ...updates };
    //       }
    //     });
    //   } catch (error) {
    //     console.error("Failed to update learner", error);
    //     throw error;
    //   }
    // },

    // 🚀 STRICT ENROLLMENT GATEKEEPER (The Ledger Sync) 🚀
    enrollLearnerInCohort: async (
      learnerId: string,
      cohortId: string,
      programmeId: string,
    ) => {
      // 1. 🛑 STRICT VALIDATION: Reject invalid assignment attempts immediately
      // We do not allow the birth of "Unassigned" ghosts.
      // If the cohort is missing, the process must stop here.
      if (!cohortId || cohortId.trim() === "" || cohortId === "Unassigned") {
        throw new Error(
          "System Validation Error: A valid target Cohort Selection is strictly required for enrollment.",
        );
      }

      if (!learnerId || learnerId.trim() === "") {
        throw new Error(
          "System Validation Error: Learner Identity (learnerId) is missing.",
        );
      }

      const USER_ID = getAuth().currentUser?.uid || "System";

      try {
        const timestamp = now();
        const batch = writeBatch(db);

        // 🚀 DETERMINISTIC LEDGER ID: Unique composite key per enrollment
        const enrollmentId = `${cohortId}_${learnerId}`;

        // 2. 📑 STEP 1: INITIALIZE REGISTRATION LEDGER
        // This is the source of truth for the auditor/QCTO.
        const enrollmentData = {
          id: enrollmentId,
          learnerId: learnerId,
          cohortId: cohortId,
          programmeId: programmeId || "", // Strictly mapped
          status: "active",
          enrolledAt: timestamp,
          updatedAt: timestamp,
          assignedBy: USER_ID,
          isArchived: false,
        };

        batch.set(
          doc(db, "enrollments", enrollmentId),
          sanitizeForFirestore(enrollmentData),
          { merge: true },
        );

        // 3. 👤 STEP 2: UPDATE HUMAN PROFILE POINTER
        // We update the 'learners' collection so the profile knows which class it belongs to.
        batch.update(doc(db, "learners", learnerId), {
          cohortId: cohortId,
          updatedAt: timestamp,
          updatedBy: USER_ID,
        });

        // 4. 📋 STEP 3: UPDATE COHORT CLASS REGISTER
        // We ensure the cohort document itself has the learner's ID in its member list.
        batch.update(doc(db, "cohorts", cohortId), {
          learnerIds: arrayUnion(learnerId),
          updatedAt: timestamp,
        });

        // 5. 🧹 STEP 4: GHOST PURGE
        // If this learner previously had a placeholder "Unassigned" ledger entry,
        // we physically destroy it now to keep the database pristine.
        batch.delete(doc(db, "enrollments", `Unassigned_${learnerId}`));

        // 6. 🧨 ATOMIC COMMIT
        // All three collections are updated or the entire operation fails.
        await batch.commit();

        // 7. 🔄 SYNCHRONIZE LOCAL STATE
        // Fetch fresh data for both Learners and Cohorts to ensure the UI reflects the change.
        await get().fetchLearners(true);
        if ((get() as any).fetchCohorts) {
          await (get() as any).fetchCohorts();
        }

        console.log(
          `✅ Ledger Sync Complete: Learner ${learnerId} enrolled in ${cohortId}`,
        );
      } catch (systemError: any) {
        // 🚀 PROPAGATE SYSTEM ERROR: Log raw failure and throw to UI
        console.error("❌ Critical Enrollment Failure:", {
          code: systemError.code,
          message: systemError.message,
          learnerId,
          cohortId,
        });

        throw systemError;
      }
    },

    // enrollLearnerInCohort: async (
    //   learnerId: string,
    //   cohortId: string,
    //   programmeId: string,
    // ) => {
    //   try {
    //     const timestamp = now();
    //     const batch = writeBatch(db);

    //     // 🚀 UPGRADE: Official Ledger Pattern
    //     const enrollmentId = `${cohortId}_${learnerId}`;

    //     // Create formal enrollment record
    //     batch.set(
    //       doc(db, "enrollments", enrollmentId),
    //       {
    //         id: enrollmentId,
    //         learnerId: learnerId,
    //         cohortId: cohortId,
    //         programmeId: programmeId,
    //         status: "active",
    //         enrolledAt: timestamp,
    //         assignedBy: "Manual-UI",
    //       },
    //       { merge: true },
    //     );

    //     // Update Learner Pointer
    //     batch.set(
    //       doc(db, "learners", learnerId),
    //       {
    //         cohortId: cohortId,
    //         updatedAt: timestamp,
    //       },
    //       { merge: true },
    //     );

    //     // Update Cohort Member List
    //     batch.update(doc(db, "cohorts", cohortId), {
    //       learnerIds: arrayUnion(learnerId),
    //     });

    //     await batch.commit();

    //     await get().fetchLearners(true);
    //     if ((get() as any).fetchCohorts) {
    //       await (get() as any).fetchCohorts();
    //     }
    //   } catch (error) {
    //     console.error("Error enrolling learner:", error);
    //     throw error;
    //   }
    // },

    dropLearnerFromCohort: async (
      learnerId: string,
      cohortId: string,
      reason: string,
    ) => {
      try {
        const batch = writeBatch(db);
        const timestamp = now();

        // 🚀 UPGRADE: Official Ledger Pattern
        const enrollmentId = `${cohortId}_${learnerId}`;

        batch.set(
          doc(db, "enrollments", enrollmentId),
          {
            status: "dropped",
            exitDate: timestamp,
            exitReason: reason,
            updatedAt: timestamp,
          },
          { merge: true },
        );

        batch.set(
          doc(db, "learners", learnerId),
          {
            cohortId: "Unassigned", // Move them out of the active cohort UI
            status: "dropped",
            updatedAt: timestamp,
          },
          { merge: true },
        );

        await batch.commit();
        await get().fetchLearners(true);
      } catch (error) {
        console.error("Error dropping learner from cohort:", error);
        throw error;
      }
    },

    assignAssessmentToLearner: async (assessmentTemplate, learner) => {
      const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
      try {
        const timestamp = now();
        const targetCohortId = learner.cohortId || "Unassigned";
        const targetHumanId = learner.learnerId || learner.id;

        const submissionData: any = {
          assessmentId: assessmentTemplate.id,
          title: assessmentTemplate.title,
          type: assessmentTemplate.type,
          moduleType: assessmentTemplate.moduleType || "knowledge",
          moduleNumber: assessmentTemplate.moduleNumber || "",
          learnerId: targetHumanId,
          authUid: learner.authUid || targetHumanId, // 🚀 VERY IMPORTANT: Carry authUid into manual assignments
          enrollmentId: learner.enrollmentId || learner.id,
          cohortId: targetCohortId,
          qualificationName: learner.qualification?.name || "",
          status: "not_started",
          assignedAt: timestamp,
          marks: 0,
          totalMarks: assessmentTemplate.totalMarks || 0,
          createdAt: timestamp,
          createdBy: USER_ID,
        };

        if (
          assessmentTemplate.moduleType === "workplace" ||
          assessmentTemplate.moduleType === "qcto_workplace"
        ) {
          if (learner.mentorId) submissionData.mentorId = learner.mentorId;
          if (learner.employerId)
            submissionData.employerId = learner.employerId;
        }

        const customId = `${targetCohortId}_${targetHumanId}_${assessmentTemplate.id}`;

        await setDoc(doc(db, "learner_submissions", customId), submissionData, {
          merge: true,
        });

        return customId;
      } catch (error) {
        console.error("Assignment error:", error);
        throw error;
      }
    },

    archiveLearner: async (id: string) => {
      try {
        const existingRow = get().learners.find((l) => l.id === id);
        if (!existingRow) return;

        const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
        const enrolSnap = await getDoc(enrolRef);

        if (enrolSnap.exists()) {
          await updateDoc(enrolRef, { isArchived: true, updatedAt: now() });
        } else {
          await updateDoc(doc(db, "learners", existingRow.learnerId), {
            isArchived: true,
            updatedAt: now(),
          });
        }

        set((state) => {
          const idx = state.learners.findIndex((l) => l.id === id);
          if (idx !== -1) state.learners[idx].isArchived = true;
        });
      } catch (error) {
        console.error(error);
      }
    },

    deleteLearnerPermanent: async (id, audit) => {
      try {
        const existingRow = get().learners.find((l) => l.id === id);
        if (!existingRow)
          throw new Error("Learner record not found in local state.");

        const batch = writeBatch(db);
        const timestamp = new Date().toISOString();

        const auditRef = doc(collection(db, "audit_logs"));
        batch.set(auditRef, {
          action: "PERMANENT_DELETE",
          entityType: "LEARNER_ENROLLMENT",
          entityId: id,
          learnerName: existingRow.fullName,
          idNumber: existingRow.idNumber,
          cohortId: existingRow.cohortId,
          reason: audit.reason,
          deletedBy: audit.adminId,
          deletedByName: audit.adminName,
          deletedAt: timestamp,
          dataSnapshot: existingRow,
        });

        const enrolId = existingRow.enrollmentId || id;
        batch.delete(doc(db, "enrollments", enrolId));

        const humanId = existingRow.learnerId || id;
        batch.delete(doc(db, "learners", humanId));

        const subQ = query(
          collection(db, "learner_submissions"),
          where("enrollmentId", "==", enrolId),
        );
        const subSnap = await getDocs(subQ);
        subSnap.forEach((subDoc) => {
          batch.delete(subDoc.ref);
        });

        await batch.commit();

        set((state) => {
          state.learners = state.learners.filter((l) => l.id !== id);
        });
      } catch (error) {
        console.error("Failed to permanently delete learner:", error);
        throw error;
      }
    },

    restoreLearner: async (id: string) => {
      try {
        const existingRow = get().learners.find((l) => l.id === id);
        if (!existingRow) return;

        const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
        const enrolSnap = await getDoc(enrolRef);

        if (enrolSnap.exists()) {
          await updateDoc(enrolRef, { isArchived: false, updatedAt: now() });
        } else {
          await updateDoc(doc(db, "learners", existingRow.learnerId), {
            isArchived: false,
            updatedAt: now(),
          });
        }

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

      for (const l of learners) {
        const learnerYear = l.trainingStartDate
          ? l.trainingStartDate.substring(0, 4)
          : "";
        if (learnerYear === year && !l.isArchived) {
          const enrolRef = doc(db, "enrollments", l.enrollmentId);
          const enrolSnap = await getDoc(enrolRef);
          if (enrolSnap.exists()) {
            batch.update(enrolRef, { isArchived: true, updatedAt: now() });
          } else {
            batch.update(doc(db, "learners", l.learnerId), {
              isArchived: true,
              updatedAt: now(),
            });
          }
          count++;
        }
      }

      if (count > 0) {
        await batch.commit();
        set((state) => {
          state.learners.forEach((l) => {
            if (l.trainingStartDate?.startsWith(year)) l.isArchived = true;
          });
        });
        return { count };
      } else {
        return { count: 0 };
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

    // 🚀 BULLETPROOF APPROVAL LOGIC (Strict Identity Only) 🚀
    approveStagingLearners: async (learnersToApprove) => {
      set({ learnersLoading: true });
      const USER_ID = getAuth().currentUser?.uid || "System";
      const functions = getFunctions();
      const createAccountFn = httpsCallable(functions, "createLearnerAccount");

      try {
        const batch = writeBatch(db);
        const approvedIds = new Set<string>();

        for (const l of learnersToApprove) {
          try {
            // 1. STRICT VALIDATION: Reject corrupted staged data immediately
            if (
              !l.idNumber ||
              !l.fullName ||
              l.idNumber.trim() === "" ||
              l.fullName.trim() === ""
            ) {
              console.warn(
                "⚠️ Skipping invalid staged learner (missing ID or Name):",
                l.id,
              );
              continue;
            }

            // 🚀 DETERMINISTIC ANCHOR: The ID Number is the Document ID
            const profileId = l.idNumber.trim();
            let trueAuthUid = profileId; // Default to ID number if Auth is pending
            let isNewUser = true;

            // 2. CHECK IF HUMAN ALREADY EXISTS (Prevents duplicates)
            const existingRef = doc(db, "learners", profileId);
            const existingSnap = await getDoc(existingRef);

            if (existingSnap.exists()) {
              const existingData = existingSnap.data();
              trueAuthUid = existingData.authUid || profileId;
              isNewUser = false;
            }

            // 3. SECURE AUTHENTICATION CREATION
            if (isNewUser && l.email && l.email.trim() !== "") {
              try {
                const result = await createAccountFn({
                  email: l.email,
                  fullName: l.fullName,
                  role: "learner",
                  password: "TemporaryPassword123!",
                });
                const data = result.data as any;
                if (data.success && data.uid) {
                  trueAuthUid = data.uid;
                }
              } catch (authErr) {
                console.error(
                  `Auth creation failed for ${l.email}, continuing as pending.`,
                  authErr,
                );
              }
            }

            // 4. EXPLICIT PROFILE MAPPING (The Human Identity)
            // 🚀 We force cohortId to be empty. They are strictly Dormant upon import.
            const profileData: any = {
              ...l, // Spread imported demographics/data
              id: profileId,
              learnerId: profileId,
              authUid: trueAuthUid,
              cohortId: "", // strictly empty string, no fallbacks
              updatedAt: new Date().toISOString(),
              updatedBy: USER_ID,
            };

            if (isNewUser) {
              profileData.createdAt = new Date().toISOString();
              profileData.createdBy = USER_ID;
              profileData.authStatus =
                trueAuthUid !== profileId ? "active" : "pending";
            }

            const cleanProfile = sanitizeForFirestore(profileData);

            // Write to the Learners collection (Anchored to ID Number)
            batch.set(doc(db, "learners", profileId), cleanProfile, {
              merge: true,
            });

            // 🛑 STEP 5 ENROLLMENT LEDGER LOGIC HAS BEEN COMPLETELY REMOVED 🛑

            // 5. CLEANUP: Delete from Staging
            batch.delete(doc(db, "staging_learners", l.id));

            approvedIds.add(l.id);
          } catch (itemError) {
            // Log individual learner errors but continue the loop for others
            console.error(
              `Failed processing staged learner ${l.idNumber}:`,
              itemError,
            );
          }
        }

        // 6. COMMIT ALL CHANGES ATOMICALLY
        await batch.commit();

        // 7. UPDATE LOCAL STATE
        set((state) => {
          state.stagingLearners = state.stagingLearners.filter(
            (l) => !approvedIds.has(l.id),
          );
          state.learnersLoading = false;
        });

        // 8. REFRESH LIVE DATABASE VIEW
        await get().fetchLearners(true);
      } catch (systemError: any) {
        // 🚀 CATCH SYSTEM ERROR: Propagate the raw system-defined error object
        console.error("System Transaction Failed in approveStagingLearners:", {
          code: systemError.code,
          message: systemError.message,
        });

        set({ learnersLoading: false });

        // Propagate to the UI to handle specific error feedback
        throw systemError;
      }
    },

    // // 🚀 BULLETPROOF APPROVAL LOGIC (Registration Ledger Pattern) 🚀
    // // 🚀 BULLETPROOF APPROVAL LOGIC (Registration Ledger Pattern) 🚀
    // // 🚀 BULLETPROOF APPROVAL LOGIC (Registration Ledger Pattern) 🚀
    // approveStagingLearners: async (learnersToApprove) => {
    //   set({ learnersLoading: true });
    //   const USER_ID = getAuth().currentUser?.uid || "System";
    //   const functions = getFunctions();
    //   const createAccountFn = httpsCallable(functions, "createLearnerAccount");

    //   try {
    //     const batch = writeBatch(db);
    //     const approvedIds = new Set<string>();

    //     for (const l of learnersToApprove) {
    //       try {
    //         // 1. STRICT VALIDATION: Reject corrupted staged data immediately
    //         if (
    //           !l.idNumber ||
    //           !l.fullName ||
    //           l.idNumber.trim() === "" ||
    //           l.fullName.trim() === ""
    //         ) {
    //           console.warn(
    //             "⚠️ Skipping invalid staged learner (missing ID or Name):",
    //             l.id,
    //           );
    //           continue;
    //         }

    //         // 🚀 DETERMINISTIC ANCHOR: The ID Number is the Document ID
    //         const profileId = l.idNumber.trim();
    //         let trueAuthUid = profileId; // Default to ID number if Auth is pending
    //         let isNewUser = true;

    //         // 2. CHECK IF HUMAN ALREADY EXISTS (Prevents duplicates)
    //         const existingRef = doc(db, "learners", profileId);
    //         const existingSnap = await getDoc(existingRef);

    //         if (existingSnap.exists()) {
    //           const existingData = existingSnap.data();
    //           trueAuthUid = existingData.authUid || profileId;
    //           isNewUser = false;
    //         }

    //         // 3. SECURE AUTHENTICATION CREATION
    //         if (isNewUser && l.email && l.email.trim() !== "") {
    //           try {
    //             const result = await createAccountFn({
    //               email: l.email,
    //               fullName: l.fullName,
    //               role: "learner",
    //               password: "TemporaryPassword123!",
    //             });
    //             const data = result.data as any;
    //             if (data.success && data.uid) {
    //               trueAuthUid = data.uid;
    //             }
    //           } catch (authErr) {
    //             console.error(
    //               `Auth creation failed for ${l.email}, continuing as pending.`,
    //               authErr,
    //             );
    //           }
    //         }

    //         // 🚀 NO FALLBACKS: cohortId is either a real ID or an empty string (Dormant)
    //         const targetCohortId =
    //           l.cohortId && l.cohortId !== "Unassigned" ? l.cohortId : "";
    //         console.log("CHCHDHECKIGL )): ", targetCohortId);

    //         // 4. EXPLICIT PROFILE MAPPING (The Human Identity)
    //         const profileData: any = {
    //           ...l, // Spread imported demographics/data
    //           id: profileId,
    //           learnerId: profileId,
    //           authUid: trueAuthUid,
    //           cohortId: targetCohortId, // Pointer for UI filtering only
    //           updatedAt: new Date().toISOString(),
    //           updatedBy: USER_ID,
    //         };

    //         if (isNewUser) {
    //           profileData.createdAt = new Date().toISOString();
    //           profileData.createdBy = USER_ID;
    //           profileData.authStatus =
    //             trueAuthUid !== profileId ? "active" : "pending";
    //         }

    //         const cleanProfile = sanitizeForFirestore(profileData);

    //         // Write to the Learners collection (Anchored to ID Number)
    //         batch.set(doc(db, "learners", profileId), cleanProfile, {
    //           merge: true,
    //         });

    //         // 5. CONDITIONAL ENROLLMENT MAPPING (The Registration Ledger)
    //         // 🚀 THE CURE: Only create an enrollment document if they have a real cohortId
    //         if (targetCohortId !== "") {
    //           const enrollmentId = `${targetCohortId}_${profileId}`;
    //           console.log("CHCHDHECKIGL: ", enrollmentId);

    //           const enrollmentData: any = {
    //             id: enrollmentId,
    //             learnerId: profileId,
    //             cohortId: targetCohortId,
    //             qualification: l.qualification || {},
    //             practicalModules: l.practicalModules || [],
    //             knowledgeModules: l.knowledgeModules || [],
    //             workExperienceModules: l.workExperienceModules || [],
    //             trainingStartDate: l.trainingStartDate || "",
    //             eisaAdmission: l.eisaAdmission || false,
    //             issueDate: l.issueDate || "",
    //             verificationCode: l.verificationCode || "",
    //             status: "active",
    //             isDraft: false,
    //             isArchived: false,
    //             approvedAt: new Date().toISOString(),
    //             approvedBy: USER_ID,
    //             createdAt: new Date().toISOString(),
    //             createdBy: USER_ID,
    //           };

    //           const cleanEnrollment = sanitizeForFirestore(enrollmentData);
    //           const newEnrollmentRef = doc(db, "enrollments", enrollmentId);
    //           batch.set(newEnrollmentRef, cleanEnrollment, { merge: true });

    //           // Update Class Register in the cohorts collection
    //           batch.update(doc(db, "cohorts", targetCohortId), {
    //             learnerIds: arrayUnion(profileId),
    //           });
    //         }

    //         // 6. CLEANUP: Delete from Staging
    //         batch.delete(doc(db, "staging_learners", l.id));

    //         approvedIds.add(l.id);
    //       } catch (itemError) {
    //         // Log individual learner errors but continue the loop for others
    //         console.error(
    //           `Failed processing staged learner ${l.idNumber}:`,
    //           itemError,
    //         );
    //       }
    //     }

    //     // 7. COMMIT ALL CHANGES ATOMICALLY
    //     // This throws a system-defined error if security rules or connectivity fail
    //     await batch.commit();

    //     // 8. UPDATE LOCAL STATE
    //     set((state) => {
    //       state.stagingLearners = state.stagingLearners.filter(
    //         (l) => !approvedIds.has(l.id),
    //       );
    //       state.learnersLoading = false;
    //     });

    //     // 9. REFRESH LIVE DATABASE VIEW
    //     await get().fetchLearners(true);
    //     if ((get() as any).fetchCohorts) await (get() as any).fetchCohorts();
    //   } catch (systemError: any) {
    //     // 🚀 CATCH SYSTEM ERROR: Propagate the raw system-defined error object
    //     console.error("System Transaction Failed in approveStagingLearners:", {
    //       code: systemError.code,
    //       message: systemError.message,
    //     });

    //     set({ learnersLoading: false });

    //     // Propagate to the UI to handle specific error feedback
    //     throw systemError;
    //   }
    // },

    // // 🚀 BULLETPROOF APPROVAL LOGIC (Registration Ledger Pattern) 🚀
    // approveStagingLearners: async (learnersToApprove) => {
    //   set({ learnersLoading: true });
    //   const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
    //   const functions = getFunctions();
    //   const createAccountFn = httpsCallable(functions, "createLearnerAccount");

    //   try {
    //     const batch = writeBatch(db);
    //     const approvedIds = new Set<string>();

    //     for (const l of learnersToApprove) {
    //       try {
    //         // 1. STRICT GHOST SHIELD: Reject corrupted staged data immediately
    //         if (
    //           !l.idNumber ||
    //           !l.fullName ||
    //           l.idNumber.trim() === "" ||
    //           l.fullName.trim() === ""
    //         ) {
    //           console.warn(
    //             "⚠️ Skipping invalid staged learner (missing ID or Name):",
    //             l.id,
    //           );
    //           continue;
    //         }

    //         let profileId = l.idNumber; // Default to ID number if Auth fails
    //         let trueAuthUid = l.idNumber;
    //         let isNewUser = true;

    //         // 2. CHECK IF HUMAN ALREADY EXISTS
    //         const existingQ = query(
    //           collection(db, "learners"),
    //           where("idNumber", "==", l.idNumber),
    //         );
    //         const existingSnap = await getDocs(existingQ);

    //         if (!existingSnap.empty) {
    //           const existingData = existingSnap.docs[0].data();
    //           profileId = existingSnap.docs[0].id;
    //           trueAuthUid = existingData.authUid || profileId;
    //           isNewUser = false;
    //         }

    //         // 3. SECURE AUTHENTICATION CREATION
    //         if (isNewUser && l.email && l.email.trim() !== "") {
    //           try {
    //             const result = await createAccountFn({
    //               email: l.email,
    //               fullName: l.fullName,
    //               role: "learner",
    //               password: "TemporaryPassword123!",
    //             });
    //             const data = result.data as any;
    //             if (data.success && data.uid) {
    //               profileId = data.uid;
    //               trueAuthUid = data.uid;
    //             }
    //           } catch (authErr) {
    //             console.error(
    //               `Auth creation failed for ${l.email}, falling back to ID Number.`,
    //               authErr,
    //             );
    //           }
    //         }

    //         const targetCohortId = l.cohortId || "Unassigned";

    //         // 4. EXPLICIT PROFILE MAPPING
    //         const profileData: any = {
    //           id: profileId,
    //           authUid: trueAuthUid,
    //           idNumber: l.idNumber,
    //           fullName: l.fullName,
    //           firstName: l.firstName || "",
    //           lastName: l.lastName || "",
    //           email: l.email || "",
    //           phone: l.phone || l.mobile || "",
    //           mobile: l.mobile || l.phone || "",
    //           dateOfBirth: l.dateOfBirth || "",
    //           demographics: l.demographics || {},
    //           cohortId: targetCohortId, // UI Pointer
    //           updatedAt: new Date().toISOString(),
    //           updatedBy: USER_ID,
    //         };

    //         if (isNewUser) {
    //           profileData.createdAt = new Date().toISOString();
    //           profileData.createdBy = USER_ID;
    //           profileData.authStatus =
    //             profileId !== l.idNumber ? "active" : "pending";
    //         }

    //         // 5. EXPLICIT ENROLLMENT MAPPING (The Registration Ledger)
    //         const enrollmentId =
    //           targetCohortId !== "Unassigned"
    //             ? `${targetCohortId}_${profileId}`
    //             : `Unassigned_${profileId}`;

    //         const enrollmentData: any = {
    //           id: enrollmentId,
    //           learnerId: profileId,
    //           cohortId: targetCohortId,
    //           qualification: l.qualification || {},
    //           practicalModules: l.practicalModules || [],
    //           knowledgeModules: l.knowledgeModules || [],
    //           workExperienceModules: l.workExperienceModules || [],
    //           trainingStartDate: l.trainingStartDate || "",
    //           eisaAdmission: l.eisaAdmission || false,
    //           issueDate: l.issueDate || "",
    //           verificationCode: l.verificationCode || "",
    //           status: "active",
    //           isDraft: false,
    //           isArchived: false,
    //           approvedAt: new Date().toISOString(),
    //           approvedBy: USER_ID,
    //           createdAt: new Date().toISOString(),
    //           createdBy: USER_ID,
    //         };

    //         const cleanProfile = sanitizeForFirestore(profileData);
    //         const cleanEnrollment = sanitizeForFirestore(enrollmentData);

    //         // Write Profile
    //         batch.set(doc(db, "learners", profileId), cleanProfile, {
    //           merge: true,
    //         });

    //         // Write Enrollment Ledger
    //         const newEnrollmentRef = doc(db, "enrollments", enrollmentId);
    //         batch.set(newEnrollmentRef, cleanEnrollment, { merge: true });

    //         // Delete from Staging
    //         batch.delete(doc(db, "staging_learners", l.id));

    //         approvedIds.add(l.id);
    //       } catch (err) {
    //         console.error(
    //           `Failed processing staged learner ${l.idNumber}:`,
    //           err,
    //         );
    //       }
    //     }

    //     await batch.commit();

    //     set((state) => {
    //       state.stagingLearners = state.stagingLearners.filter(
    //         (l) => !approvedIds.has(l.id),
    //       );
    //       state.learnersLoading = false;
    //     });

    //     await get().fetchLearners(true);
    //   } catch (e) {
    //     console.error(e);
    //     set({ learnersLoading: false });
    //     throw new Error("Error during approval process.");
    //   }
    // },

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

        const result = await createAccountFn({
          email: learner.email,
          fullName: learner.fullName,
          role: "learner",
        });

        const data = result.data as any;

        if (data.success) {
          const learnerRef = doc(
            db,
            "learners",
            learner.learnerId || learner.id,
          );

          // 🚀 FIX: Update both authStatus and the actual authUid returned from Firebase
          await updateDoc(learnerRef, {
            authStatus: "active",
            authUid: data.uid || learner.authUid,
            invitedAt: now(),
          });

          set((state) => {
            const idx = state.learners.findIndex((l) => l.id === learner.id);
            if (idx !== -1) {
              state.learners[idx].authStatus = "active";
              if (data.uid) state.learners[idx].authUid = data.uid;
            }
            state.learnersLoading = false;
          });
        } else {
          throw new Error(data.message || "Unknown error");
        }
      } catch (error: any) {
        console.error(error);
        set((state) => {
          state.learnersLoading = false;
        });
        if (error.message.includes("already exists")) {
          throw new Error("This user is already registered.");
        } else {
          throw new Error(`Failed to invite: ${error.message}`);
        }
      }
    },

    discardStagingLearners: async (ids) => {
      try {
        const batch = writeBatch(db);
        ids.forEach((id) => batch.delete(doc(db, "staging_learners", id)));
        await batch.commit();
        await get().fetchStagingLearners();
      } catch (e) {
        console.error(e);
      }
    },

    settings: null,

    fetchSettings: async () => {
      try {
        const docRef = doc(db, "system_settings", "global");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          set({ settings: snap.data() as SystemSettings });
        }
      } catch (error) {
        console.error("Error fetching system settings:", error);
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
      )
        return;
      if (programmesLoading) return;

      set({ programmesLoading: true, programmesError: null });
      try {
        const q = query(collection(db, "programmes"), orderBy("name"));
        const snapshot = await getDocs(q);
        const programmes = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ProgrammeTemplate,
        );
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
      const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
      try {
        const timestamp = now();
        const pAudit = {
          ...programme,
          createdAt: timestamp,
          createdBy: USER_ID,
          updatedAt: timestamp,
          updatedBy: USER_ID,
        };
        const docRef = await addDoc(collection(db, "programmes"), pAudit);
        set((state) => {
          state.programmes.push({
            ...pAudit,
            id: docRef.id,
          } as ProgrammeTemplate);
        });
      } catch (error) {
        throw error;
      }
    },

    updateProgramme: async (id, updates) => {
      const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
      try {
        const updatePayload = {
          ...updates,
          updatedAt: now(),
          updatedBy: USER_ID,
        };
        await updateDoc(doc(db, "programmes", id), updatePayload);
        set((state) => {
          const index = state.programmes.findIndex((p) => p.id === id);
          if (index !== -1)
            state.programmes[index] = {
              ...state.programmes[index],
              ...updatePayload,
            };
        });
      } catch (error) {
        throw error;
      }
    },

    archiveProgramme: async (id) => {
      const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
      try {
        await updateDoc(doc(db, "programmes", id), {
          isArchived: true,
          updatedAt: now(),
          updatedBy: USER_ID,
        });
        set((state) => {
          const index = state.programmes.findIndex((p) => p.id === id);
          if (index !== -1) state.programmes[index].isArchived = true;
        });
      } catch (error) {
        throw error;
      }
    },

    // ==================== STAFF SLICE ====================
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
          where("role", "in", [
            "admin",
            "facilitator",
            "assessor",
            "moderator",
            "mentor",
          ]),
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
            createdAt: data.createdAt || new Date().toISOString(),
            employerId: data.employerId,
            assessorRegNumber: data.assessorRegNumber,
            status: data.status || "active",
          } as StaffMember;
        });
        set({ staff: staffList, staffLoading: false });
      } catch (error) {
        set({ staffError: (error as Error).message, staffLoading: false });
      }
    },

    addStaff: async (newStaff) => {
      set({ staffLoading: true, staffError: null });
      try {
        const functions = getFunctions();
        const createStaffAccount = httpsCallable(
          functions,
          "createStaffAccount",
        );

        const result = await createStaffAccount({
          email: newStaff.email,
          fullName: newStaff.fullName,
          role: newStaff.role,
          phone: newStaff.phone || "",
          employerId: newStaff.employerId || "",
          assessorRegNumber: newStaff.assessorRegNumber || "",
        });

        const data = result.data as any;

        if (data.success) {
          const createdStaff = {
            ...newStaff,
            id: data.uid || "temp-id-" + Date.now(),
            createdAt: new Date().toISOString(),
            signatureUrl: "",
          } as StaffMember;

          set((state) => {
            state.staff.push(createdStaff);
            state.staffLoading = false;
          });
        }
      } catch (error: any) {
        let errorMessage = "Failed to create account.";
        if (error.code === "functions/permission-denied")
          errorMessage = "You do not have permission to create staff.";
        else if (error.code === "functions/already-exists")
          errorMessage = "A user with this email already exists.";
        else if (error.message) errorMessage = error.message;

        set({ staffLoading: false, staffError: errorMessage });
        throw new Error(errorMessage);
      }
    },

    updateStaff: async (id: string, updates: Partial<StaffMember>) => {
      try {
        const payload = { ...updates, updatedAt: now() };
        await updateDoc(doc(db, "users", id), payload);

        set((state) => {
          const index = state.staff.findIndex((s) => s.id === id);
          if (index !== -1) {
            state.staff[index] = { ...state.staff[index], ...payload };
          }
        });
      } catch (error) {
        console.error("Failed to update staff member", error);
        throw error;
      }
    },

    deleteStaff: async (id) => {
      try {
        const functions = getFunctions();
        const deleteStaffAccount = httpsCallable(
          functions,
          "deleteStaffAccount",
        );

        // Call the secure Cloud Function
        await deleteStaffAccount({ uid: id });

        // Remove them from the local UI state
        set((state) => {
          state.staff = state.staff.filter((s) => s.id !== id);
        });
      } catch (error: any) {
        console.error("Failed to delete staff member:", error);
        throw new Error(error.message || "Failed to delete staff account.");
      }
    },

    updateStaffProfile: async (uid: string, updates: any) => {
      try {
        await updateDoc(doc(db, "users", uid), {
          ...updates,
          updatedAt: now(),
        });
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        }));
      } catch (error) {
        throw error;
      }
    },

    // 🚀 THE SMART IMPORT ENGINE 🚀
    // 🚀 STRICT MVP IMPORT ENGINE (Database-Enforced)
    importUnifiedLearners: async (file: File) => {
      const USER_ID = getAuth().currentUser?.uid || "System";

      // 1. GUARANTEED DATABASE CHECK: Do not trust local state, ask Firebase directly.
      const existingIds = new Set<string>();
      try {
        const learnersSnap = await getDocs(collection(db, "learners"));
        learnersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.idNumber) {
            existingIds.add(String(data.idNumber).trim());
          }
        });
      } catch (err) {
        console.error("Failed to fetch existing learners for validation", err);
      }

      const validSaqaIds = new Set<string>();
      const validProgNames = new Set<string>();
      try {
        const progSnap = await getDocs(collection(db, "programmes"));
        progSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
          if (data.name)
            validProgNames.add(String(data.name).toLowerCase().trim());
        });
      } catch (err) {
        console.error("Failed to fetch programmes for validation", err);
      }

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
              resolve({ success: 0, errors: ["CSV file is empty"] });
              return;
            }

            rawData.forEach((row, index) => {
              try {
                const getVal = (possibleKeys: string[]) => {
                  for (const key of possibleKeys) {
                    const normalizedTarget = key
                      .toLowerCase()
                      .replace(/[\s_*-]/g, "");
                    const exactKey = Object.keys(row).find(
                      (k) =>
                        k.toLowerCase().replace(/[\s_*-]/g, "") ===
                        normalizedTarget,
                    );
                    if (
                      exactKey &&
                      row[exactKey] !== undefined &&
                      row[exactKey] !== null &&
                      String(row[exactKey]).trim() !== ""
                    ) {
                      return String(row[exactKey]).trim();
                    }
                  }
                  return "";
                };

                // --- DATA EXTRACTION ---
                const idNumber = String(
                  getVal([
                    "nationalid",
                    "idnumber",
                    "learneralternateid",
                    "identitynumber",
                    "id",
                  ]),
                ).trim();
                const firstName = getVal([
                  "learnerfirstname",
                  "firstname",
                  "name",
                  "first",
                ]);
                const lastName = getVal([
                  "learnerlastname",
                  "lastname",
                  "surname",
                  "last",
                ]);
                let fullName = getVal(["fullname", "learnerfullname"]);
                if (!fullName && (firstName || lastName))
                  fullName = `${firstName} ${lastName}`.trim();

                const saqaId = String(
                  getVal(["qualificationid", "saqaid"]),
                ).trim();
                const progName = getVal([
                  "programmename",
                  "qualificationname",
                  "qualificationtitle",
                ]);

                // 🛑 MVP LOCK 1: STRICT DUPLICATE CHECK
                if (idNumber && existingIds.has(idNumber)) {
                  errors.push(
                    `Row ${index + 2}: Skipped (Learner with ID ${idNumber} already exists in the system)`,
                  );
                  return; // Stops this row from entering the Staging Area
                }

                // 🛑 MVP LOCK 2: QUALIFICATION VALIDATION
                const isSaqaMatch = saqaId !== "" && validSaqaIds.has(saqaId);
                const isNameMatch =
                  progName !== "" &&
                  validProgNames.has(progName.toLowerCase().trim());

                if (!isSaqaMatch && !isNameMatch) {
                  errors.push(
                    `Row ${index + 2}: Skipped (Qualification "${progName || saqaId}" not found in system)`,
                  );
                  return; // Stops this row from entering the Staging Area
                }

                // Basic validation for required fields
                if (!idNumber || !fullName) {
                  errors.push(
                    `Row ${index + 2}: Skipped (Missing critical data: ID or Full Name)`,
                  );
                  return;
                }

                const issueDateStr =
                  getVal(["statementofresultsissuedate", "issuedate"]) ||
                  now().split("T")[0];
                const providerCode =
                  getVal(["sdpcode", "providercode"]) ||
                  import.meta.env.VITE_SDP_CODE ||
                  "SDP070824115131";

                if (!learnersMap.has(idNumber)) {
                  learnersMap.set(idNumber, {
                    id: idNumber, // 🚀 DETERMINISTIC ID ANCHOR
                    fullName,
                    idNumber,
                    firstName: firstName || fullName.split(" ")[0],
                    lastName:
                      lastName || fullName.split(" ").slice(1).join(" "),
                    email: getVal([
                      "learneremailaddress",
                      "emailaddress",
                      "email",
                    ]),
                    phone: getVal([
                      "learnercellphonenumber",
                      "cellphonenumber",
                      "phone",
                      "mobile",
                    ]),
                    dateOfBirth: getVal([
                      "learnerbirthdate",
                      "dateofbirth",
                      "dob",
                    ]),
                    isArchived: false,
                    isDraft: true,
                    qualification: {
                      name: progName,
                      saqaId: saqaId,
                      credits:
                        parseInt(getVal(["totalcredits", "credits"])) || 0,
                      nqfLevel: parseInt(getVal(["nqflevel", "level"])) || 0,
                      dateAssessed: "",
                    },
                    verificationCode:
                      getVal(["verificationcode"]) ||
                      generateSorId(fullName, issueDateStr, providerCode),
                    issueDate: issueDateStr,
                    cohortId: "", // 🚀 NO FALLBACKS: Force empty string for Dormant state
                    status: "active",
                    createdAt: now(),
                    createdBy: USER_ID,
                  });
                }
              } catch (err: any) {
                errors.push(`Row ${index + 2} Error: ${err.message}`);
              }
            });

            // --- BATCH WRITE TO STAGING ---
            try {
              const batch = writeBatch(db);
              let batchCount = 0;

              learnersMap.forEach((learner) => {
                // 🚀 DETERMINISTIC KEY: Using idNumber as the physical Document ID in staging
                // This guarantees no duplicates even if a file is uploaded multiple times.
                const docRef = doc(db, "staging_learners", learner.idNumber);
                batch.set(docRef, sanitizeForFirestore(learner), {
                  merge: true,
                });
                batchCount++;
              });

              if (batchCount > 0) {
                await batch.commit();
                await get().fetchStagingLearners();
              }

              resolve({ success: batchCount, errors });
            } catch (systemError) {
              console.error("Batch Commit Failed:", systemError);
              reject(systemError);
            }
          },
          error: (error) => reject(error),
        });
      });
    },

    importProgrammesFromCSV: async (file: File) => {
      return { success: 0, errors: [] } as any;
    },

    dropLearner: async (id, reason) => {
      try {
        const existingRow = get().learners.find((l) => l.id === id);
        if (!existingRow) return;

        const timestamp = now();
        const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
        const enrolSnap = await getDoc(enrolRef);

        if (enrolSnap.exists()) {
          await updateDoc(enrolRef, {
            status: "dropped",
            exitReason: reason,
            exitDate: timestamp,
            updatedAt: timestamp,
          });
        } else {
          await updateDoc(doc(db, "learners", existingRow.learnerId), {
            status: "dropped",
            exitReason: reason,
            exitDate: timestamp,
            updatedAt: timestamp,
          });
        }

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

    // 🚀 FIXED: GHOST SPLIT PREVENTION 🚀
    // Correctly routes the update data to the correct profile and enrollment docs
    updateLearnerPlacement: async (enrollmentId, employerId, mentorId) => {
      try {
        const existingLearner = get().learners.find(
          (l) => l.enrollmentId === enrollmentId || l.id === enrollmentId,
        );

        if (!existingLearner) {
          throw new Error(
            "Cannot place learner: Enrollment record not found in local state.",
          );
        }

        const actualLearnerId = existingLearner.learnerId || existingLearner.id;
        const actualEnrollmentId =
          existingLearner.enrollmentId || existingLearner.id;

        const payload = {
          employerId,
          mentorId,
          placementDate: now(),
          updatedAt: now(),
        };

        const batch = writeBatch(db);

        batch.set(doc(db, "enrollments", actualEnrollmentId), payload, {
          merge: true,
        });
        batch.set(doc(db, "learners", actualLearnerId), payload, {
          merge: true,
        });

        const q = query(
          collection(db, "learner_submissions"),
          where("learnerId", "==", actualLearnerId),
          where("moduleType", "in", ["workplace", "qcto_workplace"]),
        );
        const submissionSnap = await getDocs(q);

        if (!submissionSnap.empty) {
          submissionSnap.forEach((docSnap) => {
            batch.update(docSnap.ref, {
              employerId: employerId,
              mentorId: mentorId,
              updatedAt: now(),
            });
          });
        }

        await batch.commit();

        await get().fetchLearners(true);
        if (get().fetchSubmissions) await get().fetchSubmissions();
      } catch (error: any) {
        console.error("Failed to update placement in Firebase:", error);
        throw error;
      }
    },
  })),
);

// // src/store/useStore.ts

// import { create } from "zustand";
// import { immer } from "zustand/middleware/immer";
// import { db } from "../lib/firebase";
// import { getFunctions, httpsCallable } from "firebase/functions";
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
//   getDoc,
//   setDoc,
//   arrayUnion,
// } from "firebase/firestore";
// import Papa from "papaparse";
// import type {
//   DashboardLearner,
//   ProgrammeTemplate,
//   Employer,
//   SystemSettings,
// } from "../types";
// import type { UserProfile } from "../types/auth.types";
// import { getAuth } from "firebase/auth";
// import {
//   createCohortSlice,
//   type CohortSlice,
// } from "./slices/cohortSlice.ts/cohortSlice";
// import { generateSorId } from "../pages/utils/validation";

// const now = () => new Date().toISOString();

// export interface EnrollmentRecord {
//   cohortId: string;
//   programmeId: string;
//   status: "active" | "dropped" | "completed";
//   dateAssigned: string;
//   exitDate?: string | null;
//   exitReason?: string;
// }

// export interface StaffMember {
//   id: string;
//   fullName: string;
//   email: string;
//   role: "admin" | "facilitator" | "assessor" | "moderator" | "mentor";
//   phone?: string;
//   authUid: string;
//   assessorRegNumber?: string;
//   employerId?: string;
//   status?: "active" | "archived";
//   createdAt?: string;
//   updatedAt?: string;
// }

// export interface AttendanceRecord {
//   id?: string;
//   cohortId: string;
//   date: string;
//   facilitatorId: string;
//   presentLearners: string[];
//   notes?: string;
// }

// const PROFILE_KEYS = [
//   "fullName",
//   "firstName",
//   "lastName",
//   "idNumber",
//   "dateOfBirth",
//   "email",
//   "phone",
//   "mobile",
//   "profilePhotoUrl",
//   "profileCompleted",
//   "authUid",
//   "uid",
//   "authStatus",
//   "demographics",
// ];

// // Helper to scrub undefined values before Firestore writes
// const sanitizeForFirestore = (obj: any): any => {
//   if (obj === undefined) return "";
//   if (obj === null) return null;
//   if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
//   if (typeof obj === "object") {
//     const cleaned: any = {};
//     for (const key in obj) {
//       cleaned[key] =
//         obj[key] === undefined ? "" : sanitizeForFirestore(obj[key]);
//     }
//     return cleaned;
//   }
//   return obj;
// };

// interface StoreState extends CohortSlice {
//   user: UserProfile | null;
//   loading: boolean;
//   setUser: (user: UserProfile | null) => void;
//   setLoading: (loading: boolean) => void;
//   refreshUser: () => Promise<void>;

//   // --- LEARNERS SLICE ---
//   learners: DashboardLearner[];
//   stagingLearners: DashboardLearner[];
//   learnersLoading: boolean;
//   learnersError: string | null;
//   learnersLastFetched: number | null;

//   clearUser: () => void;

//   fetchLearners: (force?: boolean) => Promise<void>;
//   fetchStagingLearners: () => Promise<void>;

//   approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
//   inviteLearner: (learner: DashboardLearner) => Promise<void>;
//   discardStagingLearners: (ids: string[]) => Promise<void>;

//   settings: SystemSettings | null;
//   fetchSettings: () => Promise<void>;

//   addLearner: (
//     learner: Omit<
//       DashboardLearner,
//       | "id"
//       | "learnerId"
//       | "enrollmentId"
//       | "createdAt"
//       | "createdBy"
//       | "updatedAt"
//       | "updatedBy"
//     >,
//   ) => Promise<void>;
//   updateLearner: (
//     id: string,
//     updates: Partial<DashboardLearner>,
//   ) => Promise<void>;
//   archiveLearner: (id: string) => Promise<void>;
//   deleteLearnerPermanent: (
//     id: string,
//     audit: { reason: string; adminId: string; adminName: string },
//   ) => Promise<void>;
//   restoreLearner: (id: string) => Promise<void>;
//   dropLearner: (id: string, reason: string) => Promise<void>;
//   archiveCohort: (year: string) => Promise<{ count: number }>;

//   // RELATIONAL ACTIONS
//   enrollLearnerInCohort: (
//     learnerId: string,
//     cohortId: string,
//     programmeId: string,
//   ) => Promise<void>;
//   dropLearnerFromCohort: (
//     learnerId: string,
//     cohortId: string,
//     reason: string,
//   ) => Promise<void>;

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

//   // --- STAFF SLICE ---
//   staff: StaffMember[];
//   staffLoading: boolean;
//   staffError: string | null;
//   fetchStaff: (force?: boolean) => Promise<void>;
//   addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
//   updateStaff: (id: string, updates: Partial<StaffMember>) => Promise<void>;
//   deleteStaff: (id: string) => Promise<void>;
//   updateStaffProfile: (uid: string, updates: any) => Promise<void>;

//   // --- BULK IMPORT ACTIONS ---
//   importUnifiedLearners: (
//     file: File,
//   ) => Promise<{ success: number; errors: string[] }>;
//   importProgrammesFromCSV: (
//     file: File,
//   ) => Promise<{ success: number; errors: string[] }>;

//   assignAssessmentToLearner: (
//     assessmentTemplate: any,
//     learner: DashboardLearner,
//   ) => Promise<string>;

//   employers: Employer[];
//   fetchEmployers: () => Promise<void>;

//   updateLearnerPlacement: (
//     enrollmentId: string,
//     employerId: string,
//     mentorId: string,
//   ) => Promise<void>;

//   // --- WORKPLACE MENTOR DATA ---
//   assessments: any[];
//   submissions: any[];
//   enrollments: any[];
//   fetchAssessments: () => Promise<void>;
//   fetchSubmissions: () => Promise<void>;
//   fetchEnrollments: () => Promise<void>;

//   // AD-HOC CERTIFICATE STUDIO HISTORY
//   adHocCertificates: any[];
//   fetchAdHocCertificates: (force?: boolean) => Promise<void>;

//   certificateGroups: any[];
//   fetchCertificateGroups: (force?: boolean) => Promise<void>;
//   createCertificateGroup: (name: string) => Promise<void>;

//   renameCertificateGroup: (id: string, newName: string) => Promise<void>;
// }

// export const useStore = create<StoreState>()(
//   immer((set, get, api) => ({
//     ...createCohortSlice(set, get, api),

//     user: null,
//     loading: true,
//     setUser: (user) => set({ user }),
//     setLoading: (loading) => set({ loading }),

//     clearUser: () => set({ user: null }),

//     refreshUser: async () => {
//       const currentUser = get().user;
//       if (!currentUser?.uid) return;
//       try {
//         const userDoc = await getDoc(doc(db, "users", currentUser.uid));
//         if (userDoc.exists()) {
//           const data = userDoc.data();
//           const updatedProfile: UserProfile = {
//             ...currentUser,
//             fullName: data.fullName || currentUser.fullName,
//             role: data.role || currentUser.role,
//             profileCompleted: data.profileCompleted === true,
//           };
//           set({ user: updatedProfile });
//         }
//       } catch (error) {
//         console.error("Store: Failed to refresh user data", error);
//       }
//     },

//     // AD-HOC CERTIFICATE STUDIO HISTORY FETCH
//     adHocCertificates: [],
//     fetchAdHocCertificates: async (force = false) => {
//       const { adHocCertificates } = get();
//       if (!force && adHocCertificates.length > 0) return;

//       try {
//         const q = query(
//           collection(db, "ad_hoc_certificates"),
//           orderBy("createdAt", "desc"),
//         );
//         const snap = await getDocs(q);
//         const history = snap.docs.map((doc) => ({
//           id: doc.id,
//           ...doc.data(),
//         }));
//         set({ adHocCertificates: history });
//       } catch (error) {
//         console.error("Failed to load ad-hoc certificates:", error);
//       }
//     },
//     certificateGroups: [],
//     fetchCertificateGroups: async (force = false) => {
//       const { certificateGroups } = get();
//       if (!force && certificateGroups.length > 0) return;

//       try {
//         const q = query(
//           collection(db, "certificate_groups"),
//           orderBy("createdAt", "desc"),
//         );
//         const snap = await getDocs(q);
//         set({
//           certificateGroups: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
//         });
//       } catch (error) {
//         console.error("Group Fetch Error:", error);
//       }
//     },
//     createCertificateGroup: async (name: string) => {
//       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
//       try {
//         await addDoc(collection(db, "certificate_groups"), {
//           name,
//           createdBy: USER_ID,
//           createdAt: new Date().toISOString(),
//         });
//         await get().fetchCertificateGroups(true);
//       } catch (error) {
//         console.error("Failed to create folder", error);
//         throw error;
//       }
//     },
//     renameCertificateGroup: async (id: string, newName: string) => {
//       try {
//         await updateDoc(doc(db, "certificate_groups", id), {
//           name: newName,
//           updatedAt: new Date().toISOString(),
//         });
//         await get().fetchCertificateGroups(true);
//       } catch (error) {
//         console.error("Failed to rename folder", error);
//         throw error;
//       }
//     },

//     // --- MENTOR DATA FETCHERS ---
//     assessments: [],
//     submissions: [],
//     enrollments: [],

//     fetchAssessments: async () => {
//       try {
//         const snap = await getDocs(collection(db, "assessments"));
//         set({ assessments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
//       } catch (e) {
//         console.error(e);
//       }
//     },

//     fetchSubmissions: async () => {
//       try {
//         const snap = await getDocs(collection(db, "learner_submissions"));
//         set({ submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
//       } catch (e) {
//         console.error(e);
//       }
//     },

//     fetchEnrollments: async () => {
//       try {
//         const snap = await getDocs(collection(db, "enrollments"));
//         set({ enrollments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
//       } catch (e) {
//         console.error(e);
//       }
//     },

//     // ==================== EMPLOYERS SLICE ====================
//     employers: [],
//     fetchEmployers: async () => {
//       try {
//         const querySnapshot = await getDocs(collection(db, "employers"));
//         const employersData = querySnapshot.docs.map((doc) => ({
//           id: doc.id,
//           ...doc.data(),
//         })) as Employer[];

//         employersData.sort((a, b) => a.name.localeCompare(b.name));
//         set({ employers: employersData });
//       } catch (error) {
//         console.error("Error fetching employers:", error);
//       }
//     },

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
//       )
//         return;
//       if (learnersLoading) return;

//       set({ learnersLoading: true, learnersError: null });
//       try {
//         const profilesSnap = await getDocs(query(collection(db, "learners")));
//         const profilesMap = new Map<string, any>();

//         profilesSnap.docs.forEach((doc) => {
//           profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
//         });

//         const enrollmentsSnap = await getDocs(
//           query(collection(db, "enrollments")),
//         );
//         const combinedLearners: DashboardLearner[] = [];
//         const usedProfileIds = new Set<string>();

//         enrollmentsSnap.docs.forEach((docSnap) => {
//           const enrollment = docSnap.data();
//           const profile = profilesMap.get(enrollment.learnerId);

//           // 🚀 GHOST SHIELD: We now strictly enforce that the profile MUST have a valid name or ID
//           if (profile && (profile.fullName || profile.idNumber)) {
//             usedProfileIds.add(profile.id);
//             combinedLearners.push({
//               ...profile,
//               ...enrollment,
//               id: docSnap.id,
//               enrollmentId: docSnap.id,
//               learnerId: profile.id,
//             } as DashboardLearner);
//           } else if (!profile) {
//             console.warn(
//               `Orphaned Enrollment ignored: ${docSnap.id} pointing to missing profile ${enrollment.learnerId}`,
//             );
//           }
//         });

//         profilesMap.forEach((profile, profileId) => {
//           if (
//             !usedProfileIds.has(profileId) &&
//             profile.cohortId &&
//             (profile.fullName || profile.idNumber)
//           ) {
//             combinedLearners.push({
//               ...profile,
//               id: profileId,
//               enrollmentId: profileId,
//               learnerId: profileId,
//             } as DashboardLearner);
//           }
//         });

//         combinedLearners.sort((a, b) => {
//           const nameA = String(a.fullName || "");
//           const nameB = String(b.fullName || "");
//           return nameA.localeCompare(nameB);
//         });

//         set({
//           learners: combinedLearners,
//           learnersLoading: false,
//           learnersLastFetched: Date.now(),
//         });
//       } catch (error) {
//         console.error("Fetch error:", error);
//         set({
//           learnersError: (error as Error).message,
//           learnersLoading: false,
//         });
//       }
//     },

//     addLearner: async (payload) => {
//       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
//       try {
//         const timestamp = now();
//         const profileData: any = {};
//         const enrollmentData: any = {};

//         Object.keys(payload).forEach((key) => {
//           if (PROFILE_KEYS.includes(key))
//             profileData[key] = (payload as any)[key];
//           else enrollmentData[key] = (payload as any)[key];
//         });

//         profileData.createdAt = timestamp;
//         profileData.createdBy = USER_ID;

//         enrollmentData.createdAt = timestamp;
//         enrollmentData.createdBy = USER_ID;
//         enrollmentData.isDraft = false;
//         enrollmentData.isArchived = false;
//         enrollmentData.status = "in-progress";

//         if (!enrollmentData.verificationCode) {
//           const issueDate = enrollmentData.issueDate || timestamp.split("T")[0];
//           const name = profileData.fullName || "Unknown Learner";
//           const providerCode =
//             import.meta.env.VITE_SDP_CODE || "SDP070824115131";

//           enrollmentData.verificationCode = generateSorId(
//             name,
//             issueDate,
//             providerCode,
//           );
//           enrollmentData.issueDate = issueDate;
//         }

//         let finalLearnerId = "";

//         const q = query(
//           collection(db, "learners"),
//           where("idNumber", "==", profileData.idNumber),
//         );
//         const existingSnap = await getDocs(q);

//         if (!existingSnap.empty) {
//           finalLearnerId = existingSnap.docs[0].id;
//           await updateDoc(doc(db, "learners", finalLearnerId), {
//             ...profileData,
//             updatedAt: timestamp,
//           });
//         } else {
//           const newProfileRef = await addDoc(
//             collection(db, "learners"),
//             profileData,
//           );
//           finalLearnerId = newProfileRef.id;
//         }

//         enrollmentData.learnerId = finalLearnerId;
//         const newEnrollmentRef = await addDoc(
//           collection(db, "enrollments"),
//           enrollmentData,
//         );

//         set((state) => {
//           state.learners.push({
//             ...profileData,
//             ...enrollmentData,
//             id: newEnrollmentRef.id,
//             enrollmentId: newEnrollmentRef.id,
//             learnerId: finalLearnerId,
//           } as DashboardLearner);
//         });
//       } catch (error) {
//         console.error("Failed to add learner", error);
//         throw error;
//       }
//     },

//     updateLearner: async (id, updates) => {
//       const CURRENT_USER_ID = getAuth().currentUser?.uid || "UnknownUser";
//       try {
//         const existingRow = get().learners.find((l) => l.id === id);

//         const learnerId = existingRow?.learnerId || id;
//         const enrollmentId = existingRow?.enrollmentId || null;

//         const profileUpdates: any = {
//           updatedAt: now(),
//           updatedBy: CURRENT_USER_ID,
//         };
//         const enrollmentUpdates: any = {
//           updatedAt: now(),
//           updatedBy: CURRENT_USER_ID,
//         };
//         let hasProfileUpdate = false;
//         let hasEnrollmentUpdate = false;

//         Object.keys(updates).forEach((key) => {
//           if (PROFILE_KEYS.includes(key)) {
//             profileUpdates[key] = (updates as any)[key];
//             hasProfileUpdate = true;
//           } else {
//             enrollmentUpdates[key] = (updates as any)[key];
//             hasEnrollmentUpdate = true;
//           }
//         });

//         const batch = writeBatch(db);

//         if (hasProfileUpdate && learnerId) {
//           batch.set(doc(db, "learners", learnerId), profileUpdates, {
//             merge: true,
//           });
//         }

//         if (hasEnrollmentUpdate) {
//           if (enrollmentId) {
//             batch.set(doc(db, "enrollments", enrollmentId), enrollmentUpdates, {
//               merge: true,
//             });
//           } else {
//             batch.set(doc(db, "learners", learnerId), enrollmentUpdates, {
//               merge: true,
//             });
//           }
//         }

//         await batch.commit();

//         set((state) => {
//           const index = state.learners.findIndex((l) => l.id === id);
//           if (index !== -1) {
//             state.learners[index] = { ...state.learners[index], ...updates };
//           }
//           if (state.user && state.user.uid === learnerId) {
//             state.user = { ...state.user, ...updates };
//           }
//         });
//       } catch (error) {
//         console.error("Failed to update learner", error);
//         throw error;
//       }
//     },

//     enrollLearnerInCohort: async (
//       learnerId: string,
//       cohortId: string,
//       programmeId: string,
//     ) => {
//       try {
//         const newEnrollment: EnrollmentRecord = {
//           cohortId,
//           programmeId,
//           status: "active",
//           dateAssigned: now(),
//         };

//         const learnerRef = doc(db, "learners", learnerId);
//         const learnerSnap = await getDoc(learnerRef);

//         if (learnerSnap.exists()) {
//           const data = learnerSnap.data();
//           const history = data.enrollmentHistory || [];

//           const filteredHistory = history.filter(
//             (h: any) => h.cohortId !== cohortId,
//           );
//           filteredHistory.push(newEnrollment);

//           await updateDoc(learnerRef, {
//             enrollmentHistory: filteredHistory,
//             cohortId: cohortId,
//             updatedAt: now(),
//           });
//         }

//         const cohortRef = doc(db, "cohorts", cohortId);
//         await updateDoc(cohortRef, {
//           learnerIds: arrayUnion(learnerId),
//         });

//         await get().fetchLearners(true);
//         if ((get() as any).fetchCohorts) {
//           await (get() as any).fetchCohorts();
//         }
//       } catch (error) {
//         console.error("Error enrolling learner:", error);
//         throw error;
//       }
//     },

//     dropLearnerFromCohort: async (
//       learnerId: string,
//       cohortId: string,
//       reason: string,
//     ) => {
//       try {
//         const learnerRef = doc(db, "learners", learnerId);
//         const learnerSnap = await getDoc(learnerRef);

//         if (learnerSnap.exists()) {
//           const data = learnerSnap.data();
//           const history = data.enrollmentHistory || [];

//           const updatedHistory = history.map((h: any) => {
//             if (h.cohortId === cohortId) {
//               return {
//                 ...h,
//                 status: "dropped",
//                 exitDate: now(),
//                 exitReason: reason,
//               };
//             }
//             return h;
//           });

//           await updateDoc(learnerRef, {
//             enrollmentHistory: updatedHistory,
//             status: "dropped",
//             updatedAt: now(),
//           });

//           await get().fetchLearners(true);
//         }
//       } catch (error) {
//         console.error("Error dropping learner from cohort:", error);
//         throw error;
//       }
//     },

//     assignAssessmentToLearner: async (assessmentTemplate, learner) => {
//       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
//       try {
//         const timestamp = now();
//         const targetCohortId = learner.cohortId || "Unassigned";
//         const targetHumanId = learner.learnerId || learner.id;

//         const submissionData: any = {
//           assessmentId: assessmentTemplate.id,
//           title: assessmentTemplate.title,
//           type: assessmentTemplate.type,
//           moduleType: assessmentTemplate.moduleType || "knowledge",
//           moduleNumber: assessmentTemplate.moduleNumber || "",
//           learnerId: targetHumanId,
//           enrollmentId: learner.enrollmentId || learner.id,
//           cohortId: targetCohortId,
//           qualificationName: learner.qualification?.name || "",
//           status: "not_started",
//           assignedAt: timestamp,
//           marks: 0,
//           totalMarks: assessmentTemplate.totalMarks || 0,
//           createdAt: timestamp,
//           createdBy: USER_ID,
//         };

//         if (
//           assessmentTemplate.moduleType === "workplace" ||
//           assessmentTemplate.moduleType === "qcto_workplace"
//         ) {
//           if (learner.mentorId) submissionData.mentorId = learner.mentorId;
//           if (learner.employerId)
//             submissionData.employerId = learner.employerId;
//         }

//         const customId = `${targetCohortId}_${targetHumanId}_${assessmentTemplate.id}`;

//         await setDoc(doc(db, "learner_submissions", customId), submissionData, {
//           merge: true,
//         });

//         return customId;
//       } catch (error) {
//         console.error("Assignment error:", error);
//         throw error;
//       }
//     },

//     archiveLearner: async (id: string) => {
//       try {
//         const existingRow = get().learners.find((l) => l.id === id);
//         if (!existingRow) return;

//         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
//         const enrolSnap = await getDoc(enrolRef);

//         if (enrolSnap.exists()) {
//           await updateDoc(enrolRef, { isArchived: true, updatedAt: now() });
//         } else {
//           await updateDoc(doc(db, "learners", existingRow.learnerId), {
//             isArchived: true,
//             updatedAt: now(),
//           });
//         }

//         set((state) => {
//           const idx = state.learners.findIndex((l) => l.id === id);
//           if (idx !== -1) state.learners[idx].isArchived = true;
//         });
//       } catch (error) {
//         console.error(error);
//       }
//     },

//     deleteLearnerPermanent: async (id, audit) => {
//       try {
//         const existingRow = get().learners.find((l) => l.id === id);
//         if (!existingRow)
//           throw new Error("Learner record not found in local state.");

//         const batch = writeBatch(db);
//         const timestamp = new Date().toISOString();

//         const auditRef = doc(collection(db, "audit_logs"));
//         batch.set(auditRef, {
//           action: "PERMANENT_DELETE",
//           entityType: "LEARNER_ENROLLMENT",
//           entityId: id,
//           learnerName: existingRow.fullName,
//           idNumber: existingRow.idNumber,
//           cohortId: existingRow.cohortId,
//           reason: audit.reason,
//           deletedBy: audit.adminId,
//           deletedByName: audit.adminName,
//           deletedAt: timestamp,
//           dataSnapshot: existingRow,
//         });

//         const enrolId = existingRow.enrollmentId || id;
//         batch.delete(doc(db, "enrollments", enrolId));

//         const humanId = existingRow.learnerId || id;
//         batch.delete(doc(db, "learners", humanId));

//         const subQ = query(
//           collection(db, "learner_submissions"),
//           where("enrollmentId", "==", enrolId),
//         );
//         const subSnap = await getDocs(subQ);
//         subSnap.forEach((subDoc) => {
//           batch.delete(subDoc.ref);
//         });

//         await batch.commit();

//         set((state) => {
//           state.learners = state.learners.filter((l) => l.id !== id);
//         });
//       } catch (error) {
//         console.error("Failed to permanently delete learner:", error);
//         throw error;
//       }
//     },

//     restoreLearner: async (id: string) => {
//       try {
//         const existingRow = get().learners.find((l) => l.id === id);
//         if (!existingRow) return;

//         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
//         const enrolSnap = await getDoc(enrolRef);

//         if (enrolSnap.exists()) {
//           await updateDoc(enrolRef, { isArchived: false, updatedAt: now() });
//         } else {
//           await updateDoc(doc(db, "learners", existingRow.learnerId), {
//             isArchived: false,
//             updatedAt: now(),
//           });
//         }

//         set((state) => {
//           const idx = state.learners.findIndex((l) => l.id === id);
//           if (idx !== -1) state.learners[idx].isArchived = false;
//         });
//       } catch (error) {
//         console.error(error);
//       }
//     },

//     archiveCohort: async (year: string) => {
//       const { learners } = get();
//       const batch = writeBatch(db);
//       let count = 0;

//       for (const l of learners) {
//         const learnerYear = l.trainingStartDate
//           ? l.trainingStartDate.substring(0, 4)
//           : "";
//         if (learnerYear === year && !l.isArchived) {
//           const enrolRef = doc(db, "enrollments", l.enrollmentId);
//           const enrolSnap = await getDoc(enrolRef);
//           if (enrolSnap.exists()) {
//             batch.update(enrolRef, { isArchived: true, updatedAt: now() });
//           } else {
//             batch.update(doc(db, "learners", l.learnerId), {
//               isArchived: true,
//               updatedAt: now(),
//             });
//           }
//           count++;
//         }
//       }

//       if (count > 0) {
//         await batch.commit();
//         set((state) => {
//           state.learners.forEach((l) => {
//             if (l.trainingStartDate?.startsWith(year)) l.isArchived = true;
//           });
//         });
//         return { count };
//       } else {
//         return { count: 0 };
//       }
//     },

//     // ==================== STAGING (DRAFTS) ====================
//     stagingLearners: [],

//     fetchStagingLearners: async () => {
//       try {
//         const q = query(
//           collection(db, "staging_learners"),
//           orderBy("fullName"),
//         );
//         const snapshot = await getDocs(q);
//         const list = snapshot.docs.map(
//           (doc) => ({ ...doc.data(), id: doc.id }) as DashboardLearner,
//         );
//         set((state) => {
//           state.stagingLearners = list;
//         });
//       } catch (error) {
//         console.error("Failed to fetch staging:", error);
//       }
//     },

//     // 🚀 BULLETPROOF APPROVAL LOGIC 🚀
//     approveStagingLearners: async (learnersToApprove) => {
//       set({ learnersLoading: true });
//       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
//       const functions = getFunctions();
//       const createAccountFn = httpsCallable(functions, "createLearnerAccount");

//       try {
//         const batch = writeBatch(db);
//         const approvedIds = new Set<string>();

//         for (const l of learnersToApprove) {
//           try {
//             // 1. STRICT GHOST SHIELD: Reject corrupted staged data immediately
//             if (
//               !l.idNumber ||
//               !l.fullName ||
//               l.idNumber.trim() === "" ||
//               l.fullName.trim() === ""
//             ) {
//               console.warn(
//                 "⚠️ Skipping invalid staged learner (missing ID or Name):",
//                 l.id,
//               );
//               continue;
//             }

//             let profileId = l.idNumber; // Default to ID number if Auth fails
//             let isNewUser = true;

//             // 2. CHECK IF HUMAN ALREADY EXISTS
//             const existingQ = query(
//               collection(db, "learners"),
//               where("idNumber", "==", l.idNumber),
//             );
//             const existingSnap = await getDocs(existingQ);

//             if (!existingSnap.empty) {
//               profileId = existingSnap.docs[0].id;
//               isNewUser = false;
//             }

//             // 3. SECURE AUTHENTICATION CREATION
//             if (isNewUser && l.email && l.email.trim() !== "") {
//               try {
//                 const result = await createAccountFn({
//                   email: l.email,
//                   fullName: l.fullName,
//                   role: "learner",
//                   password: "TemporaryPassword123!",
//                 });
//                 const data = result.data as any;
//                 if (data.success && data.uid) {
//                   profileId = data.uid;
//                 }
//               } catch (authErr) {
//                 console.error(
//                   `Auth creation failed for ${l.email}, falling back to ID Number.`,
//                   authErr,
//                 );
//               }
//             }

//             // 4. EXPLICIT PROFILE MAPPING
//             const profileData: any = {
//               id: profileId,
//               authUid: isNewUser
//                 ? profileId
//                 : existingSnap.docs[0]?.data()?.authUid || profileId,
//               idNumber: l.idNumber,
//               fullName: l.fullName,
//               firstName: l.firstName || "",
//               lastName: l.lastName || "",
//               email: l.email || "",
//               phone: l.phone || l.mobile || "",
//               mobile: l.mobile || l.phone || "",
//               dateOfBirth: l.dateOfBirth || "",
//               demographics: l.demographics || {},
//               updatedAt: new Date().toISOString(),
//               updatedBy: USER_ID,
//             };

//             if (isNewUser) {
//               profileData.createdAt = new Date().toISOString();
//               profileData.createdBy = USER_ID;
//               profileData.authStatus =
//                 profileId !== l.idNumber ? "active" : "pending";
//             }

//             // 5. EXPLICIT ENROLLMENT MAPPING
//             const enrollmentData: any = {
//               learnerId: profileId,
//               cohortId: l.cohortId || "Unassigned",
//               qualification: l.qualification || {},
//               practicalModules: l.practicalModules || [],
//               knowledgeModules: l.knowledgeModules || [],
//               workExperienceModules: l.workExperienceModules || [],
//               trainingStartDate: l.trainingStartDate || "",
//               eisaAdmission: l.eisaAdmission || false,
//               issueDate: l.issueDate || "",
//               verificationCode: l.verificationCode || "",
//               status: "active",
//               isDraft: false,
//               isArchived: false,
//               approvedAt: new Date().toISOString(),
//               approvedBy: USER_ID,
//               createdAt: new Date().toISOString(),
//               createdBy: USER_ID,
//             };

//             const cleanProfile = sanitizeForFirestore(profileData);
//             const cleanEnrollment = sanitizeForFirestore(enrollmentData);

//             batch.set(doc(db, "learners", profileId), cleanProfile, {
//               merge: true,
//             });

//             const newEnrollmentRef = doc(collection(db, "enrollments"));
//             batch.set(newEnrollmentRef, cleanEnrollment);
//             batch.delete(doc(db, "staging_learners", l.id));
//             approvedIds.add(l.id);
//           } catch (err) {
//             console.error(
//               `Failed processing staged learner ${l.idNumber}:`,
//               err,
//             );
//           }
//         }

//         await batch.commit();

//         set((state) => {
//           state.stagingLearners = state.stagingLearners.filter(
//             (l) => !approvedIds.has(l.id),
//           );
//           state.learnersLoading = false;
//         });

//         await get().fetchLearners(true);
//       } catch (e) {
//         console.error(e);
//         set({ learnersLoading: false });
//         throw new Error("Error during approval process.");
//       }
//     },

//     inviteLearner: async (learner: DashboardLearner) => {
//       set((state) => {
//         state.learnersLoading = true;
//       });

//       try {
//         const functions = getFunctions();
//         const createAccountFn = httpsCallable(
//           functions,
//           "createLearnerAccount",
//         );

//         const result = await createAccountFn({
//           email: learner.email,
//           fullName: learner.fullName,
//           role: "learner",
//         });

//         const data = result.data as any;

//         if (data.success) {
//           const learnerRef = doc(
//             db,
//             "learners",
//             learner.learnerId || learner.id,
//           );
//           await updateDoc(learnerRef, {
//             authStatus: "active",
//             invitedAt: now(),
//           });

//           set((state) => {
//             const idx = state.learners.findIndex((l) => l.id === learner.id);
//             if (idx !== -1) state.learners[idx].authStatus = "active";
//             state.learnersLoading = false;
//           });
//         } else {
//           throw new Error(data.message || "Unknown error");
//         }
//       } catch (error: any) {
//         console.error(error);
//         set((state) => {
//           state.learnersLoading = false;
//         });
//         if (error.message.includes("already exists")) {
//           throw new Error("This user is already registered.");
//         } else {
//           throw new Error(`Failed to invite: ${error.message}`);
//         }
//       }
//     },

//     discardStagingLearners: async (ids) => {
//       try {
//         const batch = writeBatch(db);
//         ids.forEach((id) => batch.delete(doc(db, "staging_learners", id)));
//         await batch.commit();
//         await get().fetchStagingLearners();
//       } catch (e) {
//         console.error(e);
//       }
//     },

//     settings: null,

//     fetchSettings: async () => {
//       try {
//         const docRef = doc(db, "system_settings", "global");
//         const snap = await getDoc(docRef);
//         if (snap.exists()) {
//           set({ settings: snap.data() as SystemSettings });
//         }
//       } catch (error) {
//         console.error("Error fetching system settings:", error);
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
//       )
//         return;
//       if (programmesLoading) return;

//       set({ programmesLoading: true, programmesError: null });
//       try {
//         const q = query(collection(db, "programmes"), orderBy("name"));
//         const snapshot = await getDocs(q);
//         const programmes = snapshot.docs.map(
//           (doc) => ({ id: doc.id, ...doc.data() }) as ProgrammeTemplate,
//         );
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
//       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
//       try {
//         const timestamp = now();
//         const pAudit = {
//           ...programme,
//           createdAt: timestamp,
//           createdBy: USER_ID,
//           updatedAt: timestamp,
//           updatedBy: USER_ID,
//         };
//         const docRef = await addDoc(collection(db, "programmes"), pAudit);
//         set((state) => {
//           state.programmes.push({
//             ...pAudit,
//             id: docRef.id,
//           } as ProgrammeTemplate);
//         });
//       } catch (error) {
//         throw error;
//       }
//     },

//     updateProgramme: async (id, updates) => {
//       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
//       try {
//         const updatePayload = {
//           ...updates,
//           updatedAt: now(),
//           updatedBy: USER_ID,
//         };
//         await updateDoc(doc(db, "programmes", id), updatePayload);
//         set((state) => {
//           const index = state.programmes.findIndex((p) => p.id === id);
//           if (index !== -1)
//             state.programmes[index] = {
//               ...state.programmes[index],
//               ...updatePayload,
//             };
//         });
//       } catch (error) {
//         throw error;
//       }
//     },

//     archiveProgramme: async (id) => {
//       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
//       try {
//         await updateDoc(doc(db, "programmes", id), {
//           isArchived: true,
//           updatedAt: now(),
//           updatedBy: USER_ID,
//         });
//         set((state) => {
//           const index = state.programmes.findIndex((p) => p.id === id);
//           if (index !== -1) state.programmes[index].isArchived = true;
//         });
//       } catch (error) {
//         throw error;
//       }
//     },

//     // ==================== STAFF SLICE ====================
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
//           where("role", "in", [
//             "admin",
//             "facilitator",
//             "assessor",
//             "moderator",
//             "mentor",
//           ]),
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
//             createdAt: data.createdAt || new Date().toISOString(),
//             employerId: data.employerId,
//             assessorRegNumber: data.assessorRegNumber,
//             status: data.status || "active",
//           } as StaffMember;
//         });
//         set({ staff: staffList, staffLoading: false });
//       } catch (error) {
//         set({ staffError: (error as Error).message, staffLoading: false });
//       }
//     },

//     addStaff: async (newStaff) => {
//       set({ staffLoading: true, staffError: null });
//       try {
//         const functions = getFunctions();
//         const createStaffAccount = httpsCallable(
//           functions,
//           "createStaffAccount",
//         );

//         const result = await createStaffAccount({
//           email: newStaff.email,
//           fullName: newStaff.fullName,
//           role: newStaff.role,
//           phone: newStaff.phone || "",
//           employerId: newStaff.employerId || "",
//           assessorRegNumber: newStaff.assessorRegNumber || "",
//         });

//         const data = result.data as any;

//         if (data.success) {
//           const createdStaff = {
//             ...newStaff,
//             id: data.uid || "temp-id-" + Date.now(),
//             createdAt: new Date().toISOString(),
//             signatureUrl: "",
//           } as StaffMember;

//           set((state) => {
//             state.staff.push(createdStaff);
//             state.staffLoading = false;
//           });
//         }
//       } catch (error: any) {
//         let errorMessage = "Failed to create account.";
//         if (error.code === "functions/permission-denied")
//           errorMessage = "You do not have permission to create staff.";
//         else if (error.code === "functions/already-exists")
//           errorMessage = "A user with this email already exists.";
//         else if (error.message) errorMessage = error.message;

//         set({ staffLoading: false, staffError: errorMessage });
//         throw new Error(errorMessage);
//       }
//     },

//     updateStaff: async (id: string, updates: Partial<StaffMember>) => {
//       try {
//         const payload = { ...updates, updatedAt: now() };
//         await updateDoc(doc(db, "users", id), payload);

//         set((state) => {
//           const index = state.staff.findIndex((s) => s.id === id);
//           if (index !== -1) {
//             state.staff[index] = { ...state.staff[index], ...payload };
//           }
//         });
//       } catch (error) {
//         console.error("Failed to update staff member", error);
//         throw error;
//       }
//     },

//     deleteStaff: async (id) => {
//       try {
//         const functions = getFunctions();
//         const deleteStaffAccount = httpsCallable(
//           functions,
//           "deleteStaffAccount",
//         );

//         // Call the secure Cloud Function
//         await deleteStaffAccount({ uid: id });

//         // Remove them from the local UI state
//         set((state) => {
//           state.staff = state.staff.filter((s) => s.id !== id);
//         });
//       } catch (error: any) {
//         console.error("Failed to delete staff member:", error);
//         throw new Error(error.message || "Failed to delete staff account.");
//       }
//     },

//     updateStaffProfile: async (uid: string, updates: any) => {
//       try {
//         await updateDoc(doc(db, "users", uid), {
//           ...updates,
//           updatedAt: now(),
//         });
//         set((state) => ({
//           user: state.user ? { ...state.user, ...updates } : null,
//         }));
//       } catch (error) {
//         throw error;
//       }
//     },

//     // 🚀 THE SMART IMPORT ENGINE 🚀
//     // Checks for existing users to flag them in the staging UI
//     // 🚀 STRICT MVP IMPORT ENGINE (Database-Enforced)
//     importUnifiedLearners: async (file: File) => {
//       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";

//       // 1. GUARANTEED DATABASE CHECK: Do not trust local state, ask Firebase directly.
//       const existingIds = new Set<string>();
//       try {
//         const learnersSnap = await getDocs(collection(db, "learners"));
//         learnersSnap.forEach((docSnap) => {
//           const data = docSnap.data();
//           if (data.idNumber) {
//             existingIds.add(String(data.idNumber).trim());
//           }
//         });
//       } catch (err) {
//         console.error("Failed to fetch existing learners for validation", err);
//       }

//       const validSaqaIds = new Set<string>();
//       const validProgNames = new Set<string>();
//       try {
//         const progSnap = await getDocs(collection(db, "programmes"));
//         progSnap.forEach((docSnap) => {
//           const data = docSnap.data();
//           if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
//           if (data.name)
//             validProgNames.add(String(data.name).toLowerCase().trim());
//         });
//       } catch (err) {
//         console.error("Failed to fetch programmes for validation", err);
//       }

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
//               resolve({ success: 0, errors: ["CSV file is empty"] });
//               return;
//             }

//             rawData.forEach((row, index) => {
//               try {
//                 const getVal = (possibleKeys: string[]) => {
//                   for (const key of possibleKeys) {
//                     const normalizedTarget = key
//                       .toLowerCase()
//                       .replace(/[\s_*-]/g, "");
//                     const exactKey = Object.keys(row).find(
//                       (k) =>
//                         k.toLowerCase().replace(/[\s_*-]/g, "") ===
//                         normalizedTarget,
//                     );
//                     if (
//                       exactKey &&
//                       row[exactKey] !== undefined &&
//                       row[exactKey] !== null &&
//                       String(row[exactKey]).trim() !== ""
//                     ) {
//                       return String(row[exactKey]).trim();
//                     }
//                   }
//                   return "";
//                 };

//                 // --- DATA EXTRACTION ---
//                 const idNumber = String(
//                   getVal([
//                     "nationalid",
//                     "idnumber",
//                     "learneralternateid",
//                     "identitynumber",
//                     "id",
//                   ]),
//                 ).trim();
//                 const firstName = getVal([
//                   "learnerfirstname",
//                   "firstname",
//                   "name",
//                   "first",
//                 ]);
//                 const lastName = getVal([
//                   "learnerlastname",
//                   "lastname",
//                   "surname",
//                   "last",
//                 ]);
//                 let fullName = getVal(["fullname", "learnerfullname"]);
//                 if (!fullName && (firstName || lastName))
//                   fullName = `${firstName} ${lastName}`.trim();

//                 const saqaId = String(
//                   getVal(["qualificationid", "saqaid"]),
//                 ).trim();
//                 const progName = getVal([
//                   "programmename",
//                   "qualificationname",
//                   "qualificationtitle",
//                 ]);

//                 // 🛑 MVP LOCK 1: STRICT DUPLICATE CHECK
//                 if (idNumber && existingIds.has(idNumber)) {
//                   errors.push(
//                     `Row ${index + 2}: Skipped (Learner with ID ${idNumber} already exists in the system)`,
//                   );
//                   return; // Stops this row from entering the Staging Area
//                 }

//                 // 🛑 MVP LOCK 2: QUALIFICATION VALIDATION
//                 const isSaqaMatch = saqaId !== "" && validSaqaIds.has(saqaId);
//                 const isNameMatch =
//                   progName !== "" &&
//                   validProgNames.has(progName.toLowerCase().trim());

//                 if (!isSaqaMatch && !isNameMatch) {
//                   errors.push(
//                     `Row ${index + 2}: Skipped (Qualification "${progName || saqaId}" not found in system)`,
//                   );
//                   return; // Stops this row from entering the Staging Area
//                 }

//                 // Basic validation for required fields
//                 if (!idNumber || !fullName) {
//                   errors.push(
//                     `Row ${index + 2}: Skipped (Missing critical data: ID or Full Name)`,
//                   );
//                   return;
//                 }

//                 const issueDateStr =
//                   getVal(["statementofresultsissuedate", "issuedate"]) ||
//                   new Date().toISOString().split("T")[0];
//                 const providerCode =
//                   getVal(["sdpcode", "providercode"]) ||
//                   import.meta.env.VITE_SDP_CODE ||
//                   "SDP070824115131";

//                 if (!learnersMap.has(idNumber)) {
//                   learnersMap.set(idNumber, {
//                     fullName,
//                     idNumber,
//                     firstName: firstName || fullName.split(" ")[0],
//                     lastName:
//                       lastName || fullName.split(" ").slice(1).join(" "),
//                     email: getVal([
//                       "learneremailaddress",
//                       "emailaddress",
//                       "email",
//                     ]),
//                     phone: getVal([
//                       "learnercellphonenumber",
//                       "cellphonenumber",
//                       "phone",
//                       "mobile",
//                     ]),
//                     dateOfBirth: getVal([
//                       "learnerbirthdate",
//                       "dateofbirth",
//                       "dob",
//                     ]),
//                     isArchived: false,
//                     isDraft: true,
//                     qualification: {
//                       name: progName,
//                       saqaId: saqaId,
//                       credits:
//                         parseInt(getVal(["totalcredits", "credits"])) || 0,
//                       nqfLevel: parseInt(getVal(["nqflevel", "level"])) || 0,
//                       dateAssessed: "",
//                     },
//                     verificationCode:
//                       getVal(["verificationcode"]) ||
//                       generateSorId(fullName, issueDateStr, providerCode),
//                     issueDate: issueDateStr,
//                     cohortId: "Unassigned",
//                     status: "active",
//                     createdAt: new Date().toISOString(),
//                     createdBy: USER_ID,
//                   });
//                 }
//               } catch (err) {
//                 errors.push(
//                   `Row ${index + 2} Error: ${(err as Error).message}`,
//                 );
//               }
//             });

//             // --- BATCH WRITE TO STAGING ---
//             try {
//               const batch = writeBatch(db);
//               let batchCount = 0;

//               learnersMap.forEach((learner) => {
//                 const docRef = doc(db, "staging_learners", learner.idNumber);
//                 batch.set(docRef, learner);
//                 batchCount++;
//               });

//               if (batchCount > 0) {
//                 await batch.commit();
//                 await get().fetchStagingLearners();
//               }

//               resolve({ success: batchCount, errors });
//             } catch (error) {
//               console.error("Batch Commit Failed:", error);
//               reject(error);
//             }
//           },
//           error: (error) => reject(error),
//         });
//       });
//     },

//     importProgrammesFromCSV: async (file: File) => {
//       return { success: 0, errors: [] } as any;
//     },

//     dropLearner: async (id, reason) => {
//       try {
//         const existingRow = get().learners.find((l) => l.id === id);
//         if (!existingRow) return;

//         const timestamp = now();
//         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
//         const enrolSnap = await getDoc(enrolRef);

//         if (enrolSnap.exists()) {
//           await updateDoc(enrolRef, {
//             status: "dropped",
//             exitReason: reason,
//             exitDate: timestamp,
//             updatedAt: timestamp,
//           });
//         } else {
//           await updateDoc(doc(db, "learners", existingRow.learnerId), {
//             status: "dropped",
//             exitReason: reason,
//             exitDate: timestamp,
//             updatedAt: timestamp,
//           });
//         }

//         set((state) => {
//           const index = state.learners.findIndex((l) => l.id === id);
//           if (index !== -1) {
//             state.learners[index].status = "dropped";
//             state.learners[index].exitReason = reason;
//             state.learners[index].exitDate = timestamp;
//           }
//         });
//       } catch (error) {
//         console.error("Failed to drop learner", error);
//         throw error;
//       }
//     },

//     // 🚀 FIXED: GHOST SPLIT PREVENTION 🚀
//     // Correctly routes the update data to the correct profile and enrollment docs
//     updateLearnerPlacement: async (enrollmentId, employerId, mentorId) => {
//       try {
//         const existingLearner = get().learners.find(
//           (l) => l.enrollmentId === enrollmentId || l.id === enrollmentId,
//         );

//         if (!existingLearner) {
//           throw new Error(
//             "Cannot place learner: Enrollment record not found in local state.",
//           );
//         }

//         const actualLearnerId = existingLearner.learnerId || existingLearner.id;
//         const actualEnrollmentId =
//           existingLearner.enrollmentId || existingLearner.id;

//         const payload = {
//           employerId,
//           mentorId,
//           placementDate: now(),
//           updatedAt: now(),
//         };

//         const batch = writeBatch(db);

//         batch.set(doc(db, "enrollments", actualEnrollmentId), payload, {
//           merge: true,
//         });
//         batch.set(doc(db, "learners", actualLearnerId), payload, {
//           merge: true,
//         });

//         const q = query(
//           collection(db, "learner_submissions"),
//           where("learnerId", "==", actualLearnerId),
//           where("moduleType", "in", ["workplace", "qcto_workplace"]),
//         );
//         const submissionSnap = await getDocs(q);

//         if (!submissionSnap.empty) {
//           submissionSnap.forEach((docSnap) => {
//             batch.update(docSnap.ref, {
//               employerId: employerId,
//               mentorId: mentorId,
//               updatedAt: now(),
//             });
//           });
//         }

//         await batch.commit();

//         await get().fetchLearners(true);
//         if (get().fetchSubmissions) await get().fetchSubmissions();
//       } catch (error: any) {
//         console.error("Failed to update placement in Firebase:", error);
//         throw error;
//       }
//     },
//   })),
// );

// // // src/store/useStore.ts

// // import { create } from "zustand";
// // import { immer } from "zustand/middleware/immer";
// // import { db } from "../lib/firebase";
// // import { getFunctions, httpsCallable } from "firebase/functions";
// // import {
// //   collection,
// //   doc,
// //   getDocs,
// //   addDoc,
// //   updateDoc,
// //   deleteDoc,
// //   query,
// //   orderBy,
// //   where,
// //   writeBatch,
// //   getDoc,
// //   setDoc,
// //   arrayUnion,
// // } from "firebase/firestore";
// // import Papa from "papaparse";
// // import type {
// //   DashboardLearner,
// //   ProgrammeTemplate,
// //   Employer,
// //   SystemSettings,
// // } from "../types";
// // import type { UserProfile } from "../types/auth.types";
// // import { getAuth } from "firebase/auth";
// // import {
// //   createCohortSlice,
// //   type CohortSlice,
// // } from "./slices/cohortSlice.ts/cohortSlice";
// // import { generateSorId } from "../pages/utils/validation";

// // const now = () => new Date().toISOString();

// // export interface EnrollmentRecord {
// //   cohortId: string;
// //   programmeId: string;
// //   status: "active" | "dropped" | "completed";
// //   dateAssigned: string;
// //   exitDate?: string | null;
// //   exitReason?: string;
// // }

// // export interface StaffMember {
// //   id: string;
// //   fullName: string;
// //   email: string;
// //   role: "admin" | "facilitator" | "assessor" | "moderator" | "mentor";
// //   phone?: string;
// //   authUid: string;
// //   assessorRegNumber?: string;
// //   employerId?: string;
// //   status?: "active" | "archived";
// //   createdAt?: string;
// //   updatedAt?: string;
// // }

// // export interface AttendanceRecord {
// //   id?: string;
// //   cohortId: string;
// //   date: string;
// //   facilitatorId: string;
// //   presentLearners: string[];
// //   notes?: string;
// // }

// // const PROFILE_KEYS = [
// //   "fullName",
// //   "firstName",
// //   "lastName",
// //   "idNumber",
// //   "dateOfBirth",
// //   "email",
// //   "phone",
// //   "mobile",
// //   "profilePhotoUrl",
// //   "profileCompleted",
// //   "authUid",
// //   "uid",
// //   "authStatus",
// //   "demographics",
// // ];

// // // Helper to scrub undefined values before Firestore writes
// // const sanitizeForFirestore = (obj: any): any => {
// //   if (obj === undefined) return "";
// //   if (obj === null) return null;
// //   if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
// //   if (typeof obj === "object") {
// //     const cleaned: any = {};
// //     for (const key in obj) {
// //       cleaned[key] =
// //         obj[key] === undefined ? "" : sanitizeForFirestore(obj[key]);
// //     }
// //     return cleaned;
// //   }
// //   return obj;
// // };

// // interface StoreState extends CohortSlice {
// //   user: UserProfile | null;
// //   loading: boolean;
// //   setUser: (user: UserProfile | null) => void;
// //   setLoading: (loading: boolean) => void;
// //   refreshUser: () => Promise<void>;

// //   // --- LEARNERS SLICE ---
// //   learners: DashboardLearner[];
// //   stagingLearners: DashboardLearner[];
// //   learnersLoading: boolean;
// //   learnersError: string | null;
// //   learnersLastFetched: number | null;

// //   clearUser: () => void;

// //   fetchLearners: (force?: boolean) => Promise<void>;
// //   fetchStagingLearners: () => Promise<void>;

// //   approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
// //   inviteLearner: (learner: DashboardLearner) => Promise<void>;
// //   discardStagingLearners: (ids: string[]) => Promise<void>;

// //   settings: SystemSettings | null;
// //   fetchSettings: () => Promise<void>;

// //   addLearner: (
// //     learner: Omit<
// //       DashboardLearner,
// //       | "id"
// //       | "learnerId"
// //       | "enrollmentId"
// //       | "createdAt"
// //       | "createdBy"
// //       | "updatedAt"
// //       | "updatedBy"
// //     >,
// //   ) => Promise<void>;
// //   updateLearner: (
// //     id: string,
// //     updates: Partial<DashboardLearner>,
// //   ) => Promise<void>;
// //   archiveLearner: (id: string) => Promise<void>;
// //   deleteLearnerPermanent: (
// //     id: string,
// //     audit: { reason: string; adminId: string; adminName: string },
// //   ) => Promise<void>;
// //   restoreLearner: (id: string) => Promise<void>;
// //   dropLearner: (id: string, reason: string) => Promise<void>;
// //   archiveCohort: (year: string) => Promise<{ count: number }>;

// //   // RELATIONAL ACTIONS
// //   enrollLearnerInCohort: (
// //     learnerId: string,
// //     cohortId: string,
// //     programmeId: string,
// //   ) => Promise<void>;
// //   dropLearnerFromCohort: (
// //     learnerId: string,
// //     cohortId: string,
// //     reason: string,
// //   ) => Promise<void>;

// //   // --- PROGRAMMES SLICE ---
// //   programmes: ProgrammeTemplate[];
// //   programmesLoading: boolean;
// //   programmesError: string | null;
// //   programmesLastFetched: number | null;
// //   fetchProgrammes: (force?: boolean) => Promise<void>;
// //   addProgramme: (
// //     programme: Omit<
// //       ProgrammeTemplate,
// //       "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
// //     >,
// //   ) => Promise<void>;
// //   updateProgramme: (
// //     id: string,
// //     updates: Partial<ProgrammeTemplate>,
// //   ) => Promise<void>;
// //   archiveProgramme: (id: string) => Promise<void>;

// //   // --- STAFF SLICE ---
// //   staff: StaffMember[];
// //   staffLoading: boolean;
// //   staffError: string | null;
// //   fetchStaff: (force?: boolean) => Promise<void>;
// //   addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
// //   updateStaff: (id: string, updates: Partial<StaffMember>) => Promise<void>;
// //   deleteStaff: (id: string) => Promise<void>;
// //   updateStaffProfile: (uid: string, updates: any) => Promise<void>;

// //   // --- BULK IMPORT ACTIONS ---
// //   importUnifiedLearners: (
// //     file: File,
// //   ) => Promise<{ success: number; errors: string[] }>;
// //   importProgrammesFromCSV: (
// //     file: File,
// //   ) => Promise<{ success: number; errors: string[] }>;

// //   assignAssessmentToLearner: (
// //     assessmentTemplate: any,
// //     learner: DashboardLearner,
// //   ) => Promise<string>;

// //   employers: Employer[];
// //   fetchEmployers: () => Promise<void>;

// //   updateLearnerPlacement: (
// //     enrollmentId: string,
// //     employerId: string,
// //     mentorId: string,
// //   ) => Promise<void>;

// //   // --- WORKPLACE MENTOR DATA ---
// //   assessments: any[];
// //   submissions: any[];
// //   enrollments: any[];
// //   fetchAssessments: () => Promise<void>;
// //   fetchSubmissions: () => Promise<void>;
// //   fetchEnrollments: () => Promise<void>;

// //   // AD-HOC CERTIFICATE STUDIO HISTORY
// //   adHocCertificates: any[];
// //   fetchAdHocCertificates: (force?: boolean) => Promise<void>;

// //   certificateGroups: any[];
// //   fetchCertificateGroups: (force?: boolean) => Promise<void>;
// //   createCertificateGroup: (name: string) => Promise<void>;

// //   renameCertificateGroup: (id: string, newName: string) => Promise<void>;
// // }

// // export const useStore = create<StoreState>()(
// //   immer((set, get, api) => ({
// //     ...createCohortSlice(set, get, api),

// //     user: null,
// //     loading: true,
// //     setUser: (user) => set({ user }),
// //     setLoading: (loading) => set({ loading }),

// //     clearUser: () => set({ user: null }),

// //     refreshUser: async () => {
// //       const currentUser = get().user;
// //       if (!currentUser?.uid) return;
// //       try {
// //         const userDoc = await getDoc(doc(db, "users", currentUser.uid));
// //         if (userDoc.exists()) {
// //           const data = userDoc.data();
// //           const updatedProfile: UserProfile = {
// //             ...currentUser,
// //             fullName: data.fullName || currentUser.fullName,
// //             role: data.role || currentUser.role,
// //             profileCompleted: data.profileCompleted === true,
// //           };
// //           set({ user: updatedProfile });
// //         }
// //       } catch (error) {
// //         console.error("Store: Failed to refresh user data", error);
// //       }
// //     },

// //     // AD-HOC CERTIFICATE STUDIO HISTORY FETCH
// //     adHocCertificates: [],
// //     fetchAdHocCertificates: async (force = false) => {
// //       const { adHocCertificates } = get();
// //       if (!force && adHocCertificates.length > 0) return;

// //       try {
// //         const q = query(
// //           collection(db, "ad_hoc_certificates"),
// //           orderBy("createdAt", "desc"),
// //         );
// //         const snap = await getDocs(q);
// //         const history = snap.docs.map((doc) => ({
// //           id: doc.id,
// //           ...doc.data(),
// //         }));
// //         set({ adHocCertificates: history });
// //       } catch (error) {
// //         console.error("Failed to load ad-hoc certificates:", error);
// //       }
// //     },
// //     certificateGroups: [],
// //     fetchCertificateGroups: async (force = false) => {
// //       const { certificateGroups } = get();
// //       if (!force && certificateGroups.length > 0) return;

// //       try {
// //         const q = query(
// //           collection(db, "certificate_groups"),
// //           orderBy("createdAt", "desc"),
// //         );
// //         const snap = await getDocs(q);
// //         set({
// //           certificateGroups: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
// //         });
// //       } catch (error) {
// //         console.error("Group Fetch Error:", error);
// //       }
// //     },
// //     createCertificateGroup: async (name: string) => {
// //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       try {
// //         await addDoc(collection(db, "certificate_groups"), {
// //           name,
// //           createdBy: USER_ID,
// //           createdAt: new Date().toISOString(),
// //         });
// //         await get().fetchCertificateGroups(true);
// //       } catch (error) {
// //         console.error("Failed to create folder", error);
// //         throw error;
// //       }
// //     },
// //     renameCertificateGroup: async (id: string, newName: string) => {
// //       try {
// //         await updateDoc(doc(db, "certificate_groups", id), {
// //           name: newName,
// //           updatedAt: new Date().toISOString(),
// //         });
// //         await get().fetchCertificateGroups(true);
// //       } catch (error) {
// //         console.error("Failed to rename folder", error);
// //         throw error;
// //       }
// //     },

// //     // --- MENTOR DATA FETCHERS ---
// //     assessments: [],
// //     submissions: [],
// //     enrollments: [],

// //     fetchAssessments: async () => {
// //       try {
// //         const snap = await getDocs(collection(db, "assessments"));
// //         set({ assessments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// //       } catch (e) {
// //         console.error(e);
// //       }
// //     },

// //     fetchSubmissions: async () => {
// //       try {
// //         const snap = await getDocs(collection(db, "learner_submissions"));
// //         set({ submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// //       } catch (e) {
// //         console.error(e);
// //       }
// //     },

// //     fetchEnrollments: async () => {
// //       try {
// //         const snap = await getDocs(collection(db, "enrollments"));
// //         set({ enrollments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// //       } catch (e) {
// //         console.error(e);
// //       }
// //     },

// //     // ==================== EMPLOYERS SLICE ====================
// //     employers: [],
// //     fetchEmployers: async () => {
// //       try {
// //         const querySnapshot = await getDocs(collection(db, "employers"));
// //         const employersData = querySnapshot.docs.map((doc) => ({
// //           id: doc.id,
// //           ...doc.data(),
// //         })) as Employer[];

// //         employersData.sort((a, b) => a.name.localeCompare(b.name));
// //         set({ employers: employersData });
// //       } catch (error) {
// //         console.error("Error fetching employers:", error);
// //       }
// //     },

// //     // ==================== LEARNERS SLICE ====================
// //     learners: [],
// //     learnersLoading: false,
// //     learnersError: null,
// //     learnersLastFetched: null,

// //     fetchLearners: async (force = false) => {
// //       const { learnersLastFetched, learnersLoading } = get();

// //       if (
// //         !force &&
// //         learnersLastFetched &&
// //         Date.now() - learnersLastFetched < 5 * 60 * 1000
// //       )
// //         return;
// //       if (learnersLoading) return;

// //       set({ learnersLoading: true, learnersError: null });
// //       try {
// //         const profilesSnap = await getDocs(query(collection(db, "learners")));
// //         const profilesMap = new Map<string, any>();

// //         profilesSnap.docs.forEach((doc) => {
// //           profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
// //         });

// //         const enrollmentsSnap = await getDocs(
// //           query(collection(db, "enrollments")),
// //         );
// //         const combinedLearners: DashboardLearner[] = [];
// //         const usedProfileIds = new Set<string>();

// //         enrollmentsSnap.docs.forEach((docSnap) => {
// //           const enrollment = docSnap.data();
// //           const profile = profilesMap.get(enrollment.learnerId);

// //           if (profile) {
// //             usedProfileIds.add(profile.id);
// //             combinedLearners.push({
// //               ...profile,
// //               ...enrollment,
// //               id: docSnap.id,
// //               enrollmentId: docSnap.id,
// //               learnerId: profile.id,
// //             } as DashboardLearner);
// //           }
// //         });

// //         profilesMap.forEach((profile, profileId) => {
// //           if (!usedProfileIds.has(profileId) && profile.cohortId) {
// //             combinedLearners.push({
// //               ...profile,
// //               id: profileId,
// //               enrollmentId: profileId,
// //               learnerId: profileId,
// //             } as DashboardLearner);
// //           }
// //         });

// //         combinedLearners.sort((a, b) =>
// //           (a.fullName || "").localeCompare(b.fullName || ""),
// //         );

// //         set({
// //           learners: combinedLearners,
// //           learnersLoading: false,
// //           learnersLastFetched: Date.now(),
// //         });
// //       } catch (error) {
// //         console.error("Fetch error:", error);
// //         set({
// //           learnersError: (error as Error).message,
// //           learnersLoading: false,
// //         });
// //       }
// //     },

// //     addLearner: async (payload) => {
// //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       try {
// //         const timestamp = now();
// //         const profileData: any = {};
// //         const enrollmentData: any = {};

// //         Object.keys(payload).forEach((key) => {
// //           if (PROFILE_KEYS.includes(key))
// //             profileData[key] = (payload as any)[key];
// //           else enrollmentData[key] = (payload as any)[key];
// //         });

// //         profileData.createdAt = timestamp;
// //         profileData.createdBy = USER_ID;

// //         enrollmentData.createdAt = timestamp;
// //         enrollmentData.createdBy = USER_ID;
// //         enrollmentData.isDraft = false;
// //         enrollmentData.isArchived = false;
// //         enrollmentData.status = "in-progress";

// //         if (!enrollmentData.verificationCode) {
// //           const issueDate = enrollmentData.issueDate || timestamp.split("T")[0];
// //           const name = profileData.fullName || "Unknown Learner";
// //           const providerCode =
// //             import.meta.env.VITE_SDP_CODE || "SDP070824115131";

// //           enrollmentData.verificationCode = generateSorId(
// //             name,
// //             issueDate,
// //             providerCode,
// //           );
// //           enrollmentData.issueDate = issueDate;
// //         }

// //         let finalLearnerId = "";

// //         const q = query(
// //           collection(db, "learners"),
// //           where("idNumber", "==", profileData.idNumber),
// //         );
// //         const existingSnap = await getDocs(q);

// //         if (!existingSnap.empty) {
// //           finalLearnerId = existingSnap.docs[0].id;
// //           await updateDoc(doc(db, "learners", finalLearnerId), {
// //             ...profileData,
// //             updatedAt: timestamp,
// //           });
// //         } else {
// //           const newProfileRef = await addDoc(
// //             collection(db, "learners"),
// //             profileData,
// //           );
// //           finalLearnerId = newProfileRef.id;
// //         }

// //         enrollmentData.learnerId = finalLearnerId;
// //         const newEnrollmentRef = await addDoc(
// //           collection(db, "enrollments"),
// //           enrollmentData,
// //         );

// //         set((state) => {
// //           state.learners.push({
// //             ...profileData,
// //             ...enrollmentData,
// //             id: newEnrollmentRef.id,
// //             enrollmentId: newEnrollmentRef.id,
// //             learnerId: finalLearnerId,
// //           } as DashboardLearner);
// //         });
// //       } catch (error) {
// //         console.error("Failed to add learner", error);
// //         throw error;
// //       }
// //     },

// //     updateLearner: async (id, updates) => {
// //       const CURRENT_USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       try {
// //         const existingRow = get().learners.find((l) => l.id === id);

// //         const learnerId = existingRow?.learnerId || id;
// //         const enrollmentId = existingRow?.enrollmentId || null;

// //         const profileUpdates: any = {
// //           updatedAt: now(),
// //           updatedBy: CURRENT_USER_ID,
// //         };
// //         const enrollmentUpdates: any = {
// //           updatedAt: now(),
// //           updatedBy: CURRENT_USER_ID,
// //         };
// //         let hasProfileUpdate = false;
// //         let hasEnrollmentUpdate = false;

// //         Object.keys(updates).forEach((key) => {
// //           if (PROFILE_KEYS.includes(key)) {
// //             profileUpdates[key] = (updates as any)[key];
// //             hasProfileUpdate = true;
// //           } else {
// //             enrollmentUpdates[key] = (updates as any)[key];
// //             hasEnrollmentUpdate = true;
// //           }
// //         });

// //         const batch = writeBatch(db);

// //         // SAFELY UPDATE PROFILE
// //         if (hasProfileUpdate && learnerId) {
// //           batch.set(doc(db, "learners", learnerId), profileUpdates, {
// //             merge: true,
// //           });
// //         }

// //         // SAFELY UPDATE ENROLLMENT
// //         if (hasEnrollmentUpdate) {
// //           if (enrollmentId) {
// //             batch.set(doc(db, "enrollments", enrollmentId), enrollmentUpdates, {
// //               merge: true,
// //             });
// //           } else {
// //             batch.set(doc(db, "learners", learnerId), enrollmentUpdates, {
// //               merge: true,
// //             });
// //           }
// //         }

// //         await batch.commit();

// //         set((state) => {
// //           const index = state.learners.findIndex((l) => l.id === id);
// //           if (index !== -1) {
// //             state.learners[index] = { ...state.learners[index], ...updates };
// //           }
// //           if (state.user && state.user.uid === learnerId) {
// //             state.user = { ...state.user, ...updates };
// //           }
// //         });
// //       } catch (error) {
// //         console.error("Failed to update learner", error);
// //         throw error;
// //       }
// //     },

// //     enrollLearnerInCohort: async (
// //       learnerId: string,
// //       cohortId: string,
// //       programmeId: string,
// //     ) => {
// //       try {
// //         const newEnrollment: EnrollmentRecord = {
// //           cohortId,
// //           programmeId,
// //           status: "active",
// //           dateAssigned: now(),
// //         };

// //         const learnerRef = doc(db, "learners", learnerId);
// //         const learnerSnap = await getDoc(learnerRef);

// //         if (learnerSnap.exists()) {
// //           const data = learnerSnap.data();
// //           const history = data.enrollmentHistory || [];

// //           const filteredHistory = history.filter(
// //             (h: any) => h.cohortId !== cohortId,
// //           );
// //           filteredHistory.push(newEnrollment);

// //           await updateDoc(learnerRef, {
// //             enrollmentHistory: filteredHistory,
// //             cohortId: cohortId,
// //             updatedAt: now(),
// //           });
// //         }

// //         const cohortRef = doc(db, "cohorts", cohortId);
// //         await updateDoc(cohortRef, {
// //           learnerIds: arrayUnion(learnerId),
// //         });

// //         await get().fetchLearners(true);
// //         if ((get() as any).fetchCohorts) {
// //           await (get() as any).fetchCohorts();
// //         }
// //       } catch (error) {
// //         console.error("Error enrolling learner:", error);
// //         throw error;
// //       }
// //     },

// //     dropLearnerFromCohort: async (
// //       learnerId: string,
// //       cohortId: string,
// //       reason: string,
// //     ) => {
// //       try {
// //         const learnerRef = doc(db, "learners", learnerId);
// //         const learnerSnap = await getDoc(learnerRef);

// //         if (learnerSnap.exists()) {
// //           const data = learnerSnap.data();
// //           const history = data.enrollmentHistory || [];

// //           const updatedHistory = history.map((h: any) => {
// //             if (h.cohortId === cohortId) {
// //               return {
// //                 ...h,
// //                 status: "dropped",
// //                 exitDate: now(),
// //                 exitReason: reason,
// //               };
// //             }
// //             return h;
// //           });

// //           await updateDoc(learnerRef, {
// //             enrollmentHistory: updatedHistory,
// //             status: "dropped",
// //             updatedAt: now(),
// //           });

// //           await get().fetchLearners(true);
// //         }
// //       } catch (error) {
// //         console.error("Error dropping learner from cohort:", error);
// //         throw error;
// //       }
// //     },

// //     assignAssessmentToLearner: async (assessmentTemplate, learner) => {
// //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       try {
// //         const timestamp = now();
// //         const targetCohortId = learner.cohortId || "Unassigned";
// //         const targetHumanId = learner.learnerId || learner.id;

// //         const submissionData: any = {
// //           assessmentId: assessmentTemplate.id,
// //           title: assessmentTemplate.title,
// //           type: assessmentTemplate.type,
// //           moduleType: assessmentTemplate.moduleType || "knowledge",
// //           moduleNumber: assessmentTemplate.moduleNumber || "",
// //           learnerId: targetHumanId,
// //           enrollmentId: learner.enrollmentId || learner.id,
// //           cohortId: targetCohortId,
// //           qualificationName: learner.qualification?.name || "",
// //           status: "not_started",
// //           assignedAt: timestamp,
// //           marks: 0,
// //           totalMarks: assessmentTemplate.totalMarks || 0,
// //           createdAt: timestamp,
// //           createdBy: USER_ID,
// //         };

// //         if (
// //           assessmentTemplate.moduleType === "workplace" ||
// //           assessmentTemplate.moduleType === "qcto_workplace"
// //         ) {
// //           if (learner.mentorId) submissionData.mentorId = learner.mentorId;
// //           if (learner.employerId)
// //             submissionData.employerId = learner.employerId;
// //         }

// //         const customId = `${targetCohortId}_${targetHumanId}_${assessmentTemplate.id}`;

// //         await setDoc(doc(db, "learner_submissions", customId), submissionData, {
// //           merge: true,
// //         });

// //         return customId;
// //       } catch (error) {
// //         console.error("Assignment error:", error);
// //         throw error;
// //       }
// //     },

// //     archiveLearner: async (id: string) => {
// //       try {
// //         const existingRow = get().learners.find((l) => l.id === id);
// //         if (!existingRow) return;

// //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// //         const enrolSnap = await getDoc(enrolRef);

// //         if (enrolSnap.exists()) {
// //           await updateDoc(enrolRef, { isArchived: true, updatedAt: now() });
// //         } else {
// //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// //             isArchived: true,
// //             updatedAt: now(),
// //           });
// //         }

// //         set((state) => {
// //           const idx = state.learners.findIndex((l) => l.id === id);
// //           if (idx !== -1) state.learners[idx].isArchived = true;
// //         });
// //       } catch (error) {
// //         console.error(error);
// //       }
// //     },

// //     deleteLearnerPermanent: async (id, audit) => {
// //       try {
// //         const existingRow = get().learners.find((l) => l.id === id);
// //         if (!existingRow)
// //           throw new Error("Learner record not found in local state.");

// //         const batch = writeBatch(db);
// //         const timestamp = new Date().toISOString();

// //         const auditRef = doc(collection(db, "audit_logs"));
// //         batch.set(auditRef, {
// //           action: "PERMANENT_DELETE",
// //           entityType: "LEARNER_ENROLLMENT",
// //           entityId: id,
// //           learnerName: existingRow.fullName,
// //           idNumber: existingRow.idNumber,
// //           cohortId: existingRow.cohortId,
// //           reason: audit.reason,
// //           deletedBy: audit.adminId,
// //           deletedByName: audit.adminName,
// //           deletedAt: timestamp,
// //           dataSnapshot: existingRow,
// //         });

// //         const enrolId = existingRow.enrollmentId || id;
// //         batch.delete(doc(db, "enrollments", enrolId));

// //         const humanId = existingRow.learnerId || id;
// //         batch.delete(doc(db, "learners", humanId));

// //         const subQ = query(
// //           collection(db, "learner_submissions"),
// //           where("enrollmentId", "==", enrolId),
// //         );
// //         const subSnap = await getDocs(subQ);
// //         subSnap.forEach((subDoc) => {
// //           batch.delete(subDoc.ref);
// //         });

// //         await batch.commit();

// //         set((state) => {
// //           state.learners = state.learners.filter((l) => l.id !== id);
// //         });
// //       } catch (error) {
// //         console.error("Failed to permanently delete learner:", error);
// //         throw error;
// //       }
// //     },

// //     restoreLearner: async (id: string) => {
// //       try {
// //         const existingRow = get().learners.find((l) => l.id === id);
// //         if (!existingRow) return;

// //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// //         const enrolSnap = await getDoc(enrolRef);

// //         if (enrolSnap.exists()) {
// //           await updateDoc(enrolRef, { isArchived: false, updatedAt: now() });
// //         } else {
// //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// //             isArchived: false,
// //             updatedAt: now(),
// //           });
// //         }

// //         set((state) => {
// //           const idx = state.learners.findIndex((l) => l.id === id);
// //           if (idx !== -1) state.learners[idx].isArchived = false;
// //         });
// //       } catch (error) {
// //         console.error(error);
// //       }
// //     },

// //     archiveCohort: async (year: string) => {
// //       const { learners } = get();
// //       const batch = writeBatch(db);
// //       let count = 0;

// //       for (const l of learners) {
// //         const learnerYear = l.trainingStartDate
// //           ? l.trainingStartDate.substring(0, 4)
// //           : "";
// //         if (learnerYear === year && !l.isArchived) {
// //           const enrolRef = doc(db, "enrollments", l.enrollmentId);
// //           const enrolSnap = await getDoc(enrolRef);
// //           if (enrolSnap.exists()) {
// //             batch.update(enrolRef, { isArchived: true, updatedAt: now() });
// //           } else {
// //             batch.update(doc(db, "learners", l.learnerId), {
// //               isArchived: true,
// //               updatedAt: now(),
// //             });
// //           }
// //           count++;
// //         }
// //       }

// //       if (count > 0) {
// //         await batch.commit();
// //         set((state) => {
// //           state.learners.forEach((l) => {
// //             if (l.trainingStartDate?.startsWith(year)) l.isArchived = true;
// //           });
// //         });
// //         return { count };
// //       } else {
// //         return { count: 0 };
// //       }
// //     },

// //     // ==================== STAGING (DRAFTS) ====================
// //     stagingLearners: [],

// //     fetchStagingLearners: async () => {
// //       try {
// //         const q = query(
// //           collection(db, "staging_learners"),
// //           orderBy("fullName"),
// //         );
// //         const snapshot = await getDocs(q);
// //         const list = snapshot.docs.map(
// //           (doc) => ({ ...doc.data(), id: doc.id }) as DashboardLearner,
// //         );
// //         set((state) => {
// //           state.stagingLearners = list;
// //         });
// //       } catch (error) {
// //         console.error("Failed to fetch staging:", error);
// //       }
// //     },

// //     approveStagingLearners: async (learnersToApprove) => {
// //       set((state) => {
// //         state.learnersLoading = true;
// //       });
// //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       const functions = getFunctions();
// //       const createAccountFn = httpsCallable(functions, "createLearnerAccount");

// //       try {
// //         const batch = writeBatch(db);
// //         const approvedIds = new Set<string>();

// //         await Promise.all(
// //           learnersToApprove.map(async (l) => {
// //             try {
// //               const result = await createAccountFn({
// //                 email: l.email,
// //                 fullName: l.fullName,
// //                 role: "learner",
// //                 password: "TemporaryPassword123!",
// //               });
// //               const data = result.data as any;
// //               const authUid = data.uid || l.id;

// //               const profileData: any = { id: authUid };
// //               const enrollmentData: any = {};

// //               Object.keys(l).forEach((key) => {
// //                 if (PROFILE_KEYS.includes(key))
// //                   profileData[key] = (l as any)[key];
// //                 else enrollmentData[key] = (l as any)[key];
// //               });

// //               profileData.authStatus = "active";
// //               profileData.updatedAt = now();

// //               enrollmentData.learnerId = authUid;
// //               enrollmentData.isDraft = false;
// //               enrollmentData.status = "active";
// //               enrollmentData.approvedAt = now();
// //               enrollmentData.approvedBy = USER_ID;

// //               // 🚀 FIX: SANITIZE TO PREVENT FIREBASE UNDEFINED CRASH 🚀
// //               const cleanProfileData = sanitizeForFirestore(profileData);
// //               const cleanEnrollmentData = sanitizeForFirestore(enrollmentData);

// //               const profileRef = doc(db, "learners", authUid);
// //               batch.set(profileRef, cleanProfileData, { merge: true });

// //               const enrollmentRef = doc(collection(db, "enrollments"));
// //               batch.set(enrollmentRef, cleanEnrollmentData);

// //               const stagingRef = doc(db, "staging_learners", l.id);
// //               batch.delete(stagingRef);

// //               approvedIds.add(l.id);
// //             } catch (err) {
// //               console.error(`Failed to create account for ${l.email}`, err);
// //             }
// //           }),
// //         );

// //         await batch.commit();

// //         set((state) => {
// //           state.stagingLearners = state.stagingLearners.filter(
// //             (l) => !approvedIds.has(l.id),
// //           );
// //           state.learnersLoading = false;
// //         });

// //         await get().fetchLearners(true);
// //       } catch (e) {
// //         console.error(e);
// //         set((state) => {
// //           state.learnersLoading = false;
// //         });
// //         throw new Error("Error during approval process.");
// //       }
// //     },

// //     inviteLearner: async (learner: DashboardLearner) => {
// //       set((state) => {
// //         state.learnersLoading = true;
// //       });

// //       try {
// //         const functions = getFunctions();
// //         const createAccountFn = httpsCallable(
// //           functions,
// //           "createLearnerAccount",
// //         );

// //         const result = await createAccountFn({
// //           email: learner.email,
// //           fullName: learner.fullName,
// //           role: "learner",
// //         });

// //         const data = result.data as any;

// //         if (data.success) {
// //           const learnerRef = doc(
// //             db,
// //             "learners",
// //             learner.learnerId || learner.id,
// //           );
// //           await updateDoc(learnerRef, {
// //             authStatus: "active",
// //             invitedAt: now(),
// //           });

// //           set((state) => {
// //             const idx = state.learners.findIndex((l) => l.id === learner.id);
// //             if (idx !== -1) state.learners[idx].authStatus = "active";
// //             state.learnersLoading = false;
// //           });
// //         } else {
// //           throw new Error(data.message || "Unknown error");
// //         }
// //       } catch (error: any) {
// //         console.error(error);
// //         set((state) => {
// //           state.learnersLoading = false;
// //         });
// //         if (error.message.includes("already exists")) {
// //           throw new Error("This user is already registered.");
// //         } else {
// //           throw new Error(`Failed to invite: ${error.message}`);
// //         }
// //       }
// //     },

// //     discardStagingLearners: async (ids) => {
// //       try {
// //         const batch = writeBatch(db);
// //         ids.forEach((id) => batch.delete(doc(db, "staging_learners", id)));
// //         await batch.commit();
// //         await get().fetchStagingLearners();
// //       } catch (e) {
// //         console.error(e);
// //       }
// //     },

// //     settings: null,

// //     fetchSettings: async () => {
// //       try {
// //         const docRef = doc(db, "system_settings", "global");
// //         const snap = await getDoc(docRef);
// //         if (snap.exists()) {
// //           set({ settings: snap.data() as SystemSettings });
// //         }
// //       } catch (error) {
// //         console.error("Error fetching system settings:", error);
// //       }
// //     },

// //     // ==================== PROGRAMMES SLICE ====================
// //     programmes: [],
// //     programmesLoading: false,
// //     programmesError: null,
// //     programmesLastFetched: null,

// //     fetchProgrammes: async (force = false) => {
// //       const { programmesLastFetched, programmesLoading } = get();
// //       if (
// //         !force &&
// //         programmesLastFetched &&
// //         Date.now() - programmesLastFetched < 5 * 60 * 1000
// //       )
// //         return;
// //       if (programmesLoading) return;

// //       set({ programmesLoading: true, programmesError: null });
// //       try {
// //         const q = query(collection(db, "programmes"), orderBy("name"));
// //         const snapshot = await getDocs(q);
// //         const programmes = snapshot.docs.map(
// //           (doc) => ({ id: doc.id, ...doc.data() }) as ProgrammeTemplate,
// //         );
// //         set({
// //           programmes,
// //           programmesLoading: false,
// //           programmesLastFetched: Date.now(),
// //         });
// //       } catch (error) {
// //         set({
// //           programmesError: (error as Error).message,
// //           programmesLoading: false,
// //         });
// //       }
// //     },

// //     addProgramme: async (programme) => {
// //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       try {
// //         const timestamp = now();
// //         const pAudit = {
// //           ...programme,
// //           createdAt: timestamp,
// //           createdBy: USER_ID,
// //           updatedAt: timestamp,
// //           updatedBy: USER_ID,
// //         };
// //         const docRef = await addDoc(collection(db, "programmes"), pAudit);
// //         set((state) => {
// //           state.programmes.push({
// //             ...pAudit,
// //             id: docRef.id,
// //           } as ProgrammeTemplate);
// //         });
// //       } catch (error) {
// //         throw error;
// //       }
// //     },

// //     updateProgramme: async (id, updates) => {
// //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       try {
// //         const updatePayload = {
// //           ...updates,
// //           updatedAt: now(),
// //           updatedBy: USER_ID,
// //         };
// //         await updateDoc(doc(db, "programmes", id), updatePayload);
// //         set((state) => {
// //           const index = state.programmes.findIndex((p) => p.id === id);
// //           if (index !== -1)
// //             state.programmes[index] = {
// //               ...state.programmes[index],
// //               ...updatePayload,
// //             };
// //         });
// //       } catch (error) {
// //         throw error;
// //       }
// //     },

// //     archiveProgramme: async (id) => {
// //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       try {
// //         await updateDoc(doc(db, "programmes", id), {
// //           isArchived: true,
// //           updatedAt: now(),
// //           updatedBy: USER_ID,
// //         });
// //         set((state) => {
// //           const index = state.programmes.findIndex((p) => p.id === id);
// //           if (index !== -1) state.programmes[index].isArchived = true;
// //         });
// //       } catch (error) {
// //         throw error;
// //       }
// //     },

// //     // ==================== STAFF SLICE ====================
// //     staff: [],
// //     staffLoading: false,
// //     staffError: null,

// //     fetchStaff: async (force = false) => {
// //       const { staff, staffLoading } = get();
// //       if (!force && staff.length > 0) return;
// //       if (staffLoading) return;

// //       set({ staffLoading: true, staffError: null });
// //       try {
// //         const q = query(
// //           collection(db, "users"),
// //           where("role", "in", [
// //             "admin",
// //             "facilitator",
// //             "assessor",
// //             "moderator",
// //             "mentor",
// //           ]),
// //         );
// //         const snapshot = await getDocs(q);
// //         const staffList = snapshot.docs.map((doc) => {
// //           const data = doc.data();
// //           return {
// //             id: doc.id,
// //             fullName: data.fullName || "Unknown Staff",
// //             email: data.email,
// //             role: data.role,
// //             phone: data.phone,
// //             createdAt: data.createdAt || new Date().toISOString(),
// //             employerId: data.employerId,
// //             assessorRegNumber: data.assessorRegNumber,
// //             status: data.status || "active",
// //           } as StaffMember;
// //         });
// //         set({ staff: staffList, staffLoading: false });
// //       } catch (error) {
// //         set({ staffError: (error as Error).message, staffLoading: false });
// //       }
// //     },

// //     addStaff: async (newStaff) => {
// //       set({ staffLoading: true, staffError: null });
// //       try {
// //         const functions = getFunctions();
// //         const createStaffAccount = httpsCallable(
// //           functions,
// //           "createStaffAccount",
// //         );

// //         const result = await createStaffAccount({
// //           email: newStaff.email,
// //           fullName: newStaff.fullName,
// //           role: newStaff.role,
// //           phone: newStaff.phone || "",
// //           employerId: newStaff.employerId || "",
// //           assessorRegNumber: newStaff.assessorRegNumber || "",
// //         });

// //         const data = result.data as any;

// //         if (data.success) {
// //           const createdStaff = {
// //             ...newStaff,
// //             id: data.uid || "temp-id-" + Date.now(),
// //             createdAt: new Date().toISOString(),
// //             signatureUrl: "",
// //           } as StaffMember;

// //           set((state) => {
// //             state.staff.push(createdStaff);
// //             state.staffLoading = false;
// //           });
// //         }
// //       } catch (error: any) {
// //         let errorMessage = "Failed to create account.";
// //         if (error.code === "functions/permission-denied")
// //           errorMessage = "You do not have permission to create staff.";
// //         else if (error.code === "functions/already-exists")
// //           errorMessage = "A user with this email already exists.";
// //         else if (error.message) errorMessage = error.message;

// //         set({ staffLoading: false, staffError: errorMessage });
// //         throw new Error(errorMessage);
// //       }
// //     },

// //     updateStaff: async (id: string, updates: Partial<StaffMember>) => {
// //       try {
// //         const payload = { ...updates, updatedAt: now() };
// //         await updateDoc(doc(db, "users", id), payload);

// //         set((state) => {
// //           const index = state.staff.findIndex((s) => s.id === id);
// //           if (index !== -1) {
// //             state.staff[index] = { ...state.staff[index], ...payload };
// //           }
// //         });
// //       } catch (error) {
// //         console.error("Failed to update staff member", error);
// //         throw error;
// //       }
// //     },

// //     deleteStaff: async (id) => {
// //       try {
// //         const functions = getFunctions();
// //         const deleteStaffAccount = httpsCallable(
// //           functions,
// //           "deleteStaffAccount",
// //         );

// //         // Call the secure Cloud Function
// //         await deleteStaffAccount({ uid: id });

// //         // Remove them from the local UI state
// //         set((state) => {
// //           state.staff = state.staff.filter((s) => s.id !== id);
// //         });
// //       } catch (error: any) {
// //         console.error("Failed to delete staff member:", error);
// //         throw new Error(error.message || "Failed to delete staff account.");
// //       }
// //     },

// //     updateStaffProfile: async (uid: string, updates: any) => {
// //       try {
// //         await updateDoc(doc(db, "users", uid), {
// //           ...updates,
// //           updatedAt: now(),
// //         });
// //         set((state) => ({
// //           user: state.user ? { ...state.user, ...updates } : null,
// //         }));
// //       } catch (error) {
// //         throw error;
// //       }
// //     },

// //     // ==================== IMPORTS ====================
// //     importUnifiedLearners: async (file: File) => {
// //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// //       return new Promise((resolve, reject) => {
// //         Papa.parse(file, {
// //           header: true,
// //           skipEmptyLines: true,
// //           transformHeader: (header) => header.trim(),
// //           complete: async (results) => {
// //             const rawData = results.data as any[];
// //             const errors: string[] = [];
// //             const learnersMap = new Map<string, any>();

// //             if (rawData.length === 0) {
// //               resolve({ success: 0, errors: ["CSV file is empty"] });
// //               return;
// //             }

// //             rawData.forEach((row, index) => {
// //               try {
// //                 const getStr = (val: any): string =>
// //                   val !== null && val !== undefined ? String(val).trim() : "";
// //                 const idNumber = getStr(row.NationalId || row.ID_Number);

// //                 const issueDateStr =
// //                   getStr(row.StatementofResultsIssueDate) ||
// //                   now().split("T")[0];
// //                 const providerCode =
// //                   getStr(row.SDPCode) ||
// //                   import.meta.env.VITE_SDP_CODE ||
// //                   "SDP070824115131";

// //                 if (!idNumber) return;

// //                 if (!learnersMap.has(idNumber)) {
// //                   const firstName = getStr(row.LearnerFirstName);
// //                   const lastName = getStr(row.LearnerLastName);
// //                   const middleName = getStr(row.LearnerMiddleName);
// //                   let fullName =
// //                     firstName || lastName
// //                       ? `${firstName} ${middleName} ${lastName}`
// //                           .replace(/\s+/g, " ")
// //                           .trim()
// //                       : getStr(row.Full_Name) || "Unknown Learner";

// //                   const parseYYYYMMDD = (val: string) => {
// //                     if (val.length === 8 && /^\d+$/.test(val)) {
// //                       return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
// //                     }
// //                     return val;
// //                   };

// //                   const newLearner = {
// //                     fullName,
// //                     idNumber,
// //                     dateOfBirth: parseYYYYMMDD(
// //                       getStr(row.LearnerBirthDate || row.Date_Of_Birth),
// //                     ),
// //                     email: getStr(row.LearnerEmailAddress || row.Email),
// //                     phone: getStr(
// //                       row.LearnerCellPhoneNumber ||
// //                         row.Phone ||
// //                         row.LearnerPhoneNumber,
// //                     ),
// //                     trainingStartDate: getStr(
// //                       row.TrainingStartDate || row.Training_Start_Date,
// //                     )
// //                       ? parseYYYYMMDD(
// //                           getStr(
// //                             row.TrainingStartDate || row.Training_Start_Date,
// //                           ),
// //                         )
// //                       : now().split("T")[0],
// //                     isArchived: false,
// //                     isDraft: true,
// //                     qualification: {
// //                       name: getStr(
// //                         row.Programme_Name || row.Qualification_Name,
// //                       ),
// //                       saqaId: getStr(row.QualificationId || row.SAQA_ID),
// //                       credits:
// //                         parseInt(getStr(row.Total_Credits || row.Credits)) || 0,
// //                       totalNotionalHours:
// //                         (parseInt(getStr(row.Total_Credits || row.Credits)) ||
// //                           0) * 10,
// //                       nqfLevel: parseInt(getStr(row.NQF_Level)) || 0,
// //                       dateAssessed: "",
// //                     },
// //                     knowledgeModules: [],
// //                     practicalModules: [],
// //                     workExperienceModules: [],
// //                     eisaAdmission:
// //                       getStr(row.LearnerReadinessforEISATypeId) === "01" ||
// //                       getStr(row.EISA_Admission).toLowerCase() === "yes",

// //                     verificationCode:
// //                       getStr(row.Verification_Code) ||
// //                       generateSorId(fullName, issueDateStr, providerCode),
// //                     issueDate: issueDateStr,

// //                     status: "in-progress",
// //                     demographics: {
// //                       sdpCode: getStr(row.SDPCode),
// //                     },
// //                     createdAt: now(),
// //                     createdBy: USER_ID,
// //                   };
// //                   learnersMap.set(idNumber, newLearner);
// //                 }
// //               } catch (err) {
// //                 errors.push(
// //                   `Row ${index + 2} Error: ${(err as Error).message}`,
// //                 );
// //               }
// //             });

// //             try {
// //               const batch = writeBatch(db);
// //               learnersMap.forEach((learner) => {
// //                 batch.set(
// //                   doc(db, "staging_learners", learner.idNumber),
// //                   learner,
// //                 );
// //               });
// //               await batch.commit();
// //               await get().fetchStagingLearners();
// //               resolve({ success: learnersMap.size, errors });
// //             } catch (error) {
// //               reject(error);
// //             }
// //           },
// //           error: (error) => reject(error),
// //         });
// //       });
// //     },

// //     importProgrammesFromCSV: async (file: File) => {
// //       return { success: 0, errors: [] } as any;
// //     },

// //     dropLearner: async (id, reason) => {
// //       try {
// //         const existingRow = get().learners.find((l) => l.id === id);
// //         if (!existingRow) return;

// //         const timestamp = now();
// //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// //         const enrolSnap = await getDoc(enrolRef);

// //         if (enrolSnap.exists()) {
// //           await updateDoc(enrolRef, {
// //             status: "dropped",
// //             exitReason: reason,
// //             exitDate: timestamp,
// //             updatedAt: timestamp,
// //           });
// //         } else {
// //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// //             status: "dropped",
// //             exitReason: reason,
// //             exitDate: timestamp,
// //             updatedAt: timestamp,
// //           });
// //         }

// //         set((state) => {
// //           const index = state.learners.findIndex((l) => l.id === id);
// //           if (index !== -1) {
// //             state.learners[index].status = "dropped";
// //             state.learners[index].exitReason = reason;
// //             state.learners[index].exitDate = timestamp;
// //           }
// //         });
// //       } catch (error) {
// //         console.error("Failed to drop learner", error);
// //         throw error;
// //       }
// //     },

// //     updateLearnerPlacement: async (targetId, employerId, mentorId) => {
// //       try {
// //         const payload = {
// //           employerId,
// //           mentorId,
// //           placementDate: now(),
// //           updatedAt: now(),
// //         };

// //         await setDoc(doc(db, "enrollments", targetId), payload, {
// //           merge: true,
// //         });
// //         await setDoc(doc(db, "learners", targetId), payload, { merge: true });

// //         const existingLearner = get().learners.find(
// //           (l) => l.enrollmentId === targetId || l.id === targetId,
// //         );
// //         const humanId =
// //           existingLearner?.learnerId || existingLearner?.id || targetId;

// //         const q = query(
// //           collection(db, "learner_submissions"),
// //           where("learnerId", "==", humanId),
// //           where("moduleType", "in", ["workplace", "qcto_workplace"]),
// //         );
// //         const submissionSnap = await getDocs(q);

// //         if (!submissionSnap.empty) {
// //           const batch = writeBatch(db);
// //           submissionSnap.forEach((docSnap) => {
// //             batch.update(docSnap.ref, {
// //               employerId: employerId,
// //               mentorId: mentorId,
// //               updatedAt: now(),
// //             });
// //           });
// //           await batch.commit();
// //         }

// //         await get().fetchLearners(true);
// //         if (get().fetchSubmissions) await get().fetchSubmissions();
// //       } catch (error: any) {
// //         console.error("Failed to update placement in Firebase:", error);
// //         throw error;
// //       }
// //     },
// //   })),
// // );

// // // // src/store/useStore.ts

// // // import { create } from "zustand";
// // // import { immer } from "zustand/middleware/immer";
// // // import { db } from "../lib/firebase";
// // // import { getFunctions, httpsCallable } from "firebase/functions";
// // // import {
// // //   collection,
// // //   doc,
// // //   getDocs,
// // //   addDoc,
// // //   updateDoc,
// // //   deleteDoc,
// // //   query,
// // //   orderBy,
// // //   where,
// // //   writeBatch,
// // //   getDoc,
// // //   setDoc,
// // //   arrayUnion,
// // // } from "firebase/firestore";
// // // import Papa from "papaparse";
// // // import type {
// // //   DashboardLearner,
// // //   ProgrammeTemplate,
// // //   Employer,
// // //   SystemSettings,
// // // } from "../types";
// // // import type { UserProfile } from "../types/auth.types";
// // // import { getAuth } from "firebase/auth";
// // // import {
// // //   createCohortSlice,
// // //   type CohortSlice,
// // // } from "./slices/cohortSlice.ts/cohortSlice";
// // // import { generateSorId } from "../pages/utils/validation";

// // // const now = () => new Date().toISOString();

// // // export interface EnrollmentRecord {
// // //   cohortId: string;
// // //   programmeId: string;
// // //   status: "active" | "dropped" | "completed";
// // //   dateAssigned: string;
// // //   exitDate?: string | null;
// // //   exitReason?: string;
// // // }

// // // export interface StaffMember {
// // //   id: string;
// // //   fullName: string;
// // //   email: string;
// // //   role: "admin" | "facilitator" | "assessor" | "moderator" | "mentor";
// // //   phone?: string;
// // //   authUid: string;
// // //   assessorRegNumber?: string;
// // //   employerId?: string;
// // //   status?: "active" | "archived";
// // //   createdAt?: string;
// // //   updatedAt?: string;
// // // }

// // // export interface AttendanceRecord {
// // //   id?: string;
// // //   cohortId: string;
// // //   date: string;
// // //   facilitatorId: string;
// // //   presentLearners: string[];
// // //   notes?: string;
// // // }

// // // const PROFILE_KEYS = [
// // //   "fullName",
// // //   "firstName",
// // //   "lastName",
// // //   "idNumber",
// // //   "dateOfBirth",
// // //   "email",
// // //   "phone",
// // //   "mobile",
// // //   "profilePhotoUrl",
// // //   "profileCompleted",
// // //   "authUid",
// // //   "uid",
// // //   "authStatus",
// // //   "demographics",
// // // ];

// // // interface StoreState extends CohortSlice {
// // //   user: UserProfile | null;
// // //   loading: boolean;
// // //   setUser: (user: UserProfile | null) => void;
// // //   setLoading: (loading: boolean) => void;
// // //   refreshUser: () => Promise<void>;

// // //   // --- LEARNERS SLICE ---
// // //   learners: DashboardLearner[];
// // //   stagingLearners: DashboardLearner[];
// // //   learnersLoading: boolean;
// // //   learnersError: string | null;
// // //   learnersLastFetched: number | null;

// // //   clearUser: () => void;

// // //   fetchLearners: (force?: boolean) => Promise<void>;
// // //   fetchStagingLearners: () => Promise<void>;

// // //   approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
// // //   inviteLearner: (learner: DashboardLearner) => Promise<void>;
// // //   discardStagingLearners: (ids: string[]) => Promise<void>;

// // //   settings: SystemSettings | null;
// // //   fetchSettings: () => Promise<void>;

// // //   addLearner: (
// // //     learner: Omit<
// // //       DashboardLearner,
// // //       | "id"
// // //       | "learnerId"
// // //       | "enrollmentId"
// // //       | "createdAt"
// // //       | "createdBy"
// // //       | "updatedAt"
// // //       | "updatedBy"
// // //     >,
// // //   ) => Promise<void>;
// // //   updateLearner: (
// // //     id: string,
// // //     updates: Partial<DashboardLearner>,
// // //   ) => Promise<void>;
// // //   archiveLearner: (id: string) => Promise<void>;
// // //   deleteLearnerPermanent: (
// // //     id: string,
// // //     audit: { reason: string; adminId: string; adminName: string },
// // //   ) => Promise<void>;
// // //   restoreLearner: (id: string) => Promise<void>;
// // //   dropLearner: (id: string, reason: string) => Promise<void>;
// // //   archiveCohort: (year: string) => Promise<{ count: number }>;

// // //   // RELATIONAL ACTIONS
// // //   enrollLearnerInCohort: (
// // //     learnerId: string,
// // //     cohortId: string,
// // //     programmeId: string,
// // //   ) => Promise<void>;
// // //   dropLearnerFromCohort: (
// // //     learnerId: string,
// // //     cohortId: string,
// // //     reason: string,
// // //   ) => Promise<void>;

// // //   // --- PROGRAMMES SLICE ---
// // //   programmes: ProgrammeTemplate[];
// // //   programmesLoading: boolean;
// // //   programmesError: string | null;
// // //   programmesLastFetched: number | null;
// // //   fetchProgrammes: (force?: boolean) => Promise<void>;
// // //   addProgramme: (
// // //     programme: Omit<
// // //       ProgrammeTemplate,
// // //       "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
// // //     >,
// // //   ) => Promise<void>;
// // //   updateProgramme: (
// // //     id: string,
// // //     updates: Partial<ProgrammeTemplate>,
// // //   ) => Promise<void>;
// // //   archiveProgramme: (id: string) => Promise<void>;

// // //   // --- STAFF SLICE ---
// // //   staff: StaffMember[];
// // //   staffLoading: boolean;
// // //   staffError: string | null;
// // //   fetchStaff: (force?: boolean) => Promise<void>;
// // //   addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
// // //   updateStaff: (id: string, updates: Partial<StaffMember>) => Promise<void>;
// // //   deleteStaff: (id: string) => Promise<void>;
// // //   updateStaffProfile: (uid: string, updates: any) => Promise<void>;

// // //   // --- BULK IMPORT ACTIONS ---
// // //   importUnifiedLearners: (
// // //     file: File,
// // //   ) => Promise<{ success: number; errors: string[] }>;
// // //   importProgrammesFromCSV: (
// // //     file: File,
// // //   ) => Promise<{ success: number; errors: string[] }>;

// // //   assignAssessmentToLearner: (
// // //     assessmentTemplate: any,
// // //     learner: DashboardLearner,
// // //   ) => Promise<string>;

// // //   employers: Employer[];
// // //   fetchEmployers: () => Promise<void>;

// // //   updateLearnerPlacement: (
// // //     enrollmentId: string,
// // //     employerId: string,
// // //     mentorId: string,
// // //   ) => Promise<void>;

// // //   // --- WORKPLACE MENTOR DATA ---
// // //   assessments: any[];
// // //   submissions: any[];
// // //   enrollments: any[];
// // //   fetchAssessments: () => Promise<void>;
// // //   fetchSubmissions: () => Promise<void>;
// // //   fetchEnrollments: () => Promise<void>;

// // //   // AD-HOC CERTIFICATE STUDIO HISTORY
// // //   adHocCertificates: any[];
// // //   fetchAdHocCertificates: (force?: boolean) => Promise<void>;

// // //   certificateGroups: any[];
// // //   fetchCertificateGroups: (force?: boolean) => Promise<void>;
// // //   createCertificateGroup: (name: string) => Promise<void>;

// // //   renameCertificateGroup: (id: string, newName: string) => Promise<void>;
// // // }

// // // export const useStore = create<StoreState>()(
// // //   immer((set, get, api) => ({
// // //     ...createCohortSlice(set, get, api),

// // //     user: null,
// // //     loading: true,
// // //     setUser: (user) => set({ user }),
// // //     setLoading: (loading) => set({ loading }),

// // //     clearUser: () => set({ user: null }),

// // //     refreshUser: async () => {
// // //       const currentUser = get().user;
// // //       if (!currentUser?.uid) return;
// // //       try {
// // //         const userDoc = await getDoc(doc(db, "users", currentUser.uid));
// // //         if (userDoc.exists()) {
// // //           const data = userDoc.data();
// // //           const updatedProfile: UserProfile = {
// // //             ...currentUser,
// // //             fullName: data.fullName || currentUser.fullName,
// // //             role: data.role || currentUser.role,
// // //             profileCompleted: data.profileCompleted === true,
// // //           };
// // //           set({ user: updatedProfile });
// // //         }
// // //       } catch (error) {
// // //         console.error("Store: Failed to refresh user data", error);
// // //       }
// // //     },

// // //     // AD-HOC CERTIFICATE STUDIO HISTORY FETCH
// // //     adHocCertificates: [],
// // //     fetchAdHocCertificates: async (force = false) => {
// // //       const { adHocCertificates } = get();
// // //       if (!force && adHocCertificates.length > 0) return;

// // //       try {
// // //         const q = query(
// // //           collection(db, "ad_hoc_certificates"),
// // //           orderBy("createdAt", "desc"),
// // //         );
// // //         const snap = await getDocs(q);
// // //         const history = snap.docs.map((doc) => ({
// // //           id: doc.id,
// // //           ...doc.data(),
// // //         }));
// // //         set({ adHocCertificates: history });
// // //       } catch (error) {
// // //         console.error("Failed to load ad-hoc certificates:", error);
// // //       }
// // //     },
// // //     certificateGroups: [],
// // //     fetchCertificateGroups: async (force = false) => {
// // //       const { certificateGroups } = get();
// // //       if (!force && certificateGroups.length > 0) return;

// // //       try {
// // //         const q = query(
// // //           collection(db, "certificate_groups"),
// // //           orderBy("createdAt", "desc"),
// // //         );
// // //         const snap = await getDocs(q);
// // //         set({
// // //           certificateGroups: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
// // //         });
// // //       } catch (error) {
// // //         console.error("Group Fetch Error:", error);
// // //       }
// // //     },
// // //     createCertificateGroup: async (name: string) => {
// // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       try {
// // //         await addDoc(collection(db, "certificate_groups"), {
// // //           name,
// // //           createdBy: USER_ID,
// // //           createdAt: new Date().toISOString(),
// // //         });
// // //         await get().fetchCertificateGroups(true);
// // //       } catch (error) {
// // //         console.error("Failed to create folder", error);
// // //         throw error;
// // //       }
// // //     },
// // //     renameCertificateGroup: async (id: string, newName: string) => {
// // //       try {
// // //         await updateDoc(doc(db, "certificate_groups", id), {
// // //           name: newName,
// // //           updatedAt: new Date().toISOString(),
// // //         });
// // //         await get().fetchCertificateGroups(true);
// // //       } catch (error) {
// // //         console.error("Failed to rename folder", error);
// // //         throw error;
// // //       }
// // //     },

// // //     // --- MENTOR DATA FETCHERS ---
// // //     assessments: [],
// // //     submissions: [],
// // //     enrollments: [],

// // //     fetchAssessments: async () => {
// // //       try {
// // //         const snap = await getDocs(collection(db, "assessments"));
// // //         set({ assessments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // //       } catch (e) {
// // //         console.error(e);
// // //       }
// // //     },

// // //     fetchSubmissions: async () => {
// // //       try {
// // //         const snap = await getDocs(collection(db, "learner_submissions"));
// // //         set({ submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // //       } catch (e) {
// // //         console.error(e);
// // //       }
// // //     },

// // //     fetchEnrollments: async () => {
// // //       try {
// // //         const snap = await getDocs(collection(db, "enrollments"));
// // //         set({ enrollments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // //       } catch (e) {
// // //         console.error(e);
// // //       }
// // //     },

// // //     // ==================== EMPLOYERS SLICE ====================
// // //     employers: [],
// // //     fetchEmployers: async () => {
// // //       try {
// // //         const querySnapshot = await getDocs(collection(db, "employers"));
// // //         const employersData = querySnapshot.docs.map((doc) => ({
// // //           id: doc.id,
// // //           ...doc.data(),
// // //         })) as Employer[];

// // //         employersData.sort((a, b) => a.name.localeCompare(b.name));
// // //         set({ employers: employersData });
// // //       } catch (error) {
// // //         console.error("Error fetching employers:", error);
// // //       }
// // //     },

// // //     // ==================== LEARNERS SLICE ====================
// // //     learners: [],
// // //     learnersLoading: false,
// // //     learnersError: null,
// // //     learnersLastFetched: null,

// // //     fetchLearners: async (force = false) => {
// // //       const { learnersLastFetched, learnersLoading } = get();

// // //       if (
// // //         !force &&
// // //         learnersLastFetched &&
// // //         Date.now() - learnersLastFetched < 5 * 60 * 1000
// // //       )
// // //         return;
// // //       if (learnersLoading) return;

// // //       set({ learnersLoading: true, learnersError: null });
// // //       try {
// // //         const profilesSnap = await getDocs(query(collection(db, "learners")));
// // //         const profilesMap = new Map<string, any>();

// // //         profilesSnap.docs.forEach((doc) => {
// // //           profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
// // //         });

// // //         const enrollmentsSnap = await getDocs(
// // //           query(collection(db, "enrollments")),
// // //         );
// // //         const combinedLearners: DashboardLearner[] = [];
// // //         const usedProfileIds = new Set<string>();

// // //         enrollmentsSnap.docs.forEach((docSnap) => {
// // //           const enrollment = docSnap.data();
// // //           const profile = profilesMap.get(enrollment.learnerId);

// // //           if (profile) {
// // //             usedProfileIds.add(profile.id);
// // //             combinedLearners.push({
// // //               ...profile,
// // //               ...enrollment,
// // //               id: docSnap.id,
// // //               enrollmentId: docSnap.id,
// // //               learnerId: profile.id,
// // //             } as DashboardLearner);
// // //           }
// // //         });

// // //         profilesMap.forEach((profile, profileId) => {
// // //           if (!usedProfileIds.has(profileId) && profile.cohortId) {
// // //             combinedLearners.push({
// // //               ...profile,
// // //               id: profileId,
// // //               enrollmentId: profileId,
// // //               learnerId: profileId,
// // //             } as DashboardLearner);
// // //           }
// // //         });

// // //         combinedLearners.sort((a, b) =>
// // //           (a.fullName || "").localeCompare(b.fullName || ""),
// // //         );

// // //         set({
// // //           learners: combinedLearners,
// // //           learnersLoading: false,
// // //           learnersLastFetched: Date.now(),
// // //         });
// // //       } catch (error) {
// // //         console.error("Fetch error:", error);
// // //         set({
// // //           learnersError: (error as Error).message,
// // //           learnersLoading: false,
// // //         });
// // //       }
// // //     },

// // //     addLearner: async (payload) => {
// // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       try {
// // //         const timestamp = now();
// // //         const profileData: any = {};
// // //         const enrollmentData: any = {};

// // //         Object.keys(payload).forEach((key) => {
// // //           if (PROFILE_KEYS.includes(key))
// // //             profileData[key] = (payload as any)[key];
// // //           else enrollmentData[key] = (payload as any)[key];
// // //         });

// // //         profileData.createdAt = timestamp;
// // //         profileData.createdBy = USER_ID;

// // //         enrollmentData.createdAt = timestamp;
// // //         enrollmentData.createdBy = USER_ID;
// // //         enrollmentData.isDraft = false;
// // //         enrollmentData.isArchived = false;
// // //         enrollmentData.status = "in-progress";

// // //         if (!enrollmentData.verificationCode) {
// // //           const issueDate = enrollmentData.issueDate || timestamp.split("T")[0];
// // //           const name = profileData.fullName || "Unknown Learner";
// // //           const providerCode =
// // //             import.meta.env.VITE_SDP_CODE || "SDP070824115131";

// // //           enrollmentData.verificationCode = generateSorId(
// // //             name,
// // //             issueDate,
// // //             providerCode,
// // //           );
// // //           enrollmentData.issueDate = issueDate;
// // //         }

// // //         let finalLearnerId = "";

// // //         const q = query(
// // //           collection(db, "learners"),
// // //           where("idNumber", "==", profileData.idNumber),
// // //         );
// // //         const existingSnap = await getDocs(q);

// // //         if (!existingSnap.empty) {
// // //           finalLearnerId = existingSnap.docs[0].id;
// // //           await updateDoc(doc(db, "learners", finalLearnerId), {
// // //             ...profileData,
// // //             updatedAt: timestamp,
// // //           });
// // //         } else {
// // //           const newProfileRef = await addDoc(
// // //             collection(db, "learners"),
// // //             profileData,
// // //           );
// // //           finalLearnerId = newProfileRef.id;
// // //         }

// // //         enrollmentData.learnerId = finalLearnerId;
// // //         const newEnrollmentRef = await addDoc(
// // //           collection(db, "enrollments"),
// // //           enrollmentData,
// // //         );

// // //         set((state) => {
// // //           state.learners.push({
// // //             ...profileData,
// // //             ...enrollmentData,
// // //             id: newEnrollmentRef.id,
// // //             enrollmentId: newEnrollmentRef.id,
// // //             learnerId: finalLearnerId,
// // //           } as DashboardLearner);
// // //         });
// // //       } catch (error) {
// // //         console.error("Failed to add learner", error);
// // //         throw error;
// // //       }
// // //     },

// // //     updateLearner: async (id, updates) => {
// // //       const CURRENT_USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       try {
// // //         const existingRow = get().learners.find((l) => l.id === id);

// // //         const learnerId = existingRow?.learnerId || id;
// // //         const enrollmentId = existingRow?.enrollmentId || null;

// // //         const profileUpdates: any = {
// // //           updatedAt: now(),
// // //           updatedBy: CURRENT_USER_ID,
// // //         };
// // //         const enrollmentUpdates: any = {
// // //           updatedAt: now(),
// // //           updatedBy: CURRENT_USER_ID,
// // //         };
// // //         let hasProfileUpdate = false;
// // //         let hasEnrollmentUpdate = false;

// // //         Object.keys(updates).forEach((key) => {
// // //           if (PROFILE_KEYS.includes(key)) {
// // //             profileUpdates[key] = (updates as any)[key];
// // //             hasProfileUpdate = true;
// // //           } else {
// // //             enrollmentUpdates[key] = (updates as any)[key];
// // //             hasEnrollmentUpdate = true;
// // //           }
// // //         });

// // //         const batch = writeBatch(db);

// // //         // SAFELY UPDATE PROFILE
// // //         if (hasProfileUpdate && learnerId) {
// // //           // Use setDoc with merge instead of updateDoc
// // //           batch.set(doc(db, "learners", learnerId), profileUpdates, {
// // //             merge: true,
// // //           });
// // //         }

// // //         // SAFELY UPDATE ENROLLMENT
// // //         if (hasEnrollmentUpdate) {
// // //           if (enrollmentId) {
// // //             batch.set(doc(db, "enrollments", enrollmentId), enrollmentUpdates, {
// // //               merge: true,
// // //             });
// // //           } else {
// // //             // Fallback if somehow there's no enrollment ID
// // //             batch.set(doc(db, "learners", learnerId), enrollmentUpdates, {
// // //               merge: true,
// // //             });
// // //           }
// // //         }

// // //         await batch.commit();

// // //         set((state) => {
// // //           const index = state.learners.findIndex((l) => l.id === id);
// // //           if (index !== -1) {
// // //             state.learners[index] = { ...state.learners[index], ...updates };
// // //           }
// // //           if (state.user && state.user.uid === learnerId) {
// // //             state.user = { ...state.user, ...updates };
// // //           }
// // //         });
// // //       } catch (error) {
// // //         console.error("Failed to update learner", error);
// // //         throw error;
// // //       }
// // //     },

// // //     enrollLearnerInCohort: async (
// // //       learnerId: string,
// // //       cohortId: string,
// // //       programmeId: string,
// // //     ) => {
// // //       try {
// // //         const newEnrollment: EnrollmentRecord = {
// // //           cohortId,
// // //           programmeId,
// // //           status: "active",
// // //           dateAssigned: now(),
// // //         };

// // //         const learnerRef = doc(db, "learners", learnerId);
// // //         const learnerSnap = await getDoc(learnerRef);

// // //         if (learnerSnap.exists()) {
// // //           const data = learnerSnap.data();
// // //           const history = data.enrollmentHistory || [];

// // //           const filteredHistory = history.filter(
// // //             (h: any) => h.cohortId !== cohortId,
// // //           );
// // //           filteredHistory.push(newEnrollment);

// // //           await updateDoc(learnerRef, {
// // //             enrollmentHistory: filteredHistory,
// // //             cohortId: cohortId,
// // //             updatedAt: now(),
// // //           });
// // //         }

// // //         const cohortRef = doc(db, "cohorts", cohortId);
// // //         await updateDoc(cohortRef, {
// // //           learnerIds: arrayUnion(learnerId),
// // //         });

// // //         await get().fetchLearners(true);
// // //         if ((get() as any).fetchCohorts) {
// // //           await (get() as any).fetchCohorts();
// // //         }
// // //       } catch (error) {
// // //         console.error("Error enrolling learner:", error);
// // //         throw error;
// // //       }
// // //     },

// // //     dropLearnerFromCohort: async (
// // //       learnerId: string,
// // //       cohortId: string,
// // //       reason: string,
// // //     ) => {
// // //       try {
// // //         const learnerRef = doc(db, "learners", learnerId);
// // //         const learnerSnap = await getDoc(learnerRef);

// // //         if (learnerSnap.exists()) {
// // //           const data = learnerSnap.data();
// // //           const history = data.enrollmentHistory || [];

// // //           const updatedHistory = history.map((h: any) => {
// // //             if (h.cohortId === cohortId) {
// // //               return {
// // //                 ...h,
// // //                 status: "dropped",
// // //                 exitDate: now(),
// // //                 exitReason: reason,
// // //               };
// // //             }
// // //             return h;
// // //           });

// // //           await updateDoc(learnerRef, {
// // //             enrollmentHistory: updatedHistory,
// // //             status: "dropped",
// // //             updatedAt: now(),
// // //           });

// // //           await get().fetchLearners(true);
// // //         }
// // //       } catch (error) {
// // //         console.error("Error dropping learner from cohort:", error);
// // //         throw error;
// // //       }
// // //     },

// // //     assignAssessmentToLearner: async (assessmentTemplate, learner) => {
// // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       try {
// // //         const timestamp = now();
// // //         const targetCohortId = learner.cohortId || "Unassigned";
// // //         const targetHumanId = learner.learnerId || learner.id;

// // //         const submissionData: any = {
// // //           assessmentId: assessmentTemplate.id,
// // //           title: assessmentTemplate.title,
// // //           type: assessmentTemplate.type,
// // //           moduleType: assessmentTemplate.moduleType || "knowledge",
// // //           moduleNumber: assessmentTemplate.moduleNumber || "",
// // //           learnerId: targetHumanId,
// // //           enrollmentId: learner.enrollmentId || learner.id,
// // //           cohortId: targetCohortId,
// // //           qualificationName: learner.qualification?.name || "",
// // //           status: "not_started",
// // //           assignedAt: timestamp,
// // //           marks: 0,
// // //           totalMarks: assessmentTemplate.totalMarks || 0,
// // //           createdAt: timestamp,
// // //           createdBy: USER_ID,
// // //         };

// // //         if (
// // //           assessmentTemplate.moduleType === "workplace" ||
// // //           assessmentTemplate.moduleType === "qcto_workplace"
// // //         ) {
// // //           if (learner.mentorId) submissionData.mentorId = learner.mentorId;
// // //           if (learner.employerId)
// // //             submissionData.employerId = learner.employerId;
// // //         }

// // //         const customId = `${targetCohortId}_${targetHumanId}_${assessmentTemplate.id}`;

// // //         await setDoc(doc(db, "learner_submissions", customId), submissionData, {
// // //           merge: true,
// // //         });

// // //         return customId;
// // //       } catch (error) {
// // //         console.error("Assignment error:", error);
// // //         throw error;
// // //       }
// // //     },

// // //     archiveLearner: async (id: string) => {
// // //       try {
// // //         const existingRow = get().learners.find((l) => l.id === id);
// // //         if (!existingRow) return;

// // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // //         const enrolSnap = await getDoc(enrolRef);

// // //         if (enrolSnap.exists()) {
// // //           await updateDoc(enrolRef, { isArchived: true, updatedAt: now() });
// // //         } else {
// // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // //             isArchived: true,
// // //             updatedAt: now(),
// // //           });
// // //         }

// // //         set((state) => {
// // //           const idx = state.learners.findIndex((l) => l.id === id);
// // //           if (idx !== -1) state.learners[idx].isArchived = true;
// // //         });
// // //       } catch (error) {
// // //         console.error(error);
// // //       }
// // //     },

// // //     deleteLearnerPermanent: async (id, audit) => {
// // //       try {
// // //         const existingRow = get().learners.find((l) => l.id === id);
// // //         if (!existingRow)
// // //           throw new Error("Learner record not found in local state.");

// // //         const batch = writeBatch(db);
// // //         const timestamp = new Date().toISOString();

// // //         const auditRef = doc(collection(db, "audit_logs"));
// // //         batch.set(auditRef, {
// // //           action: "PERMANENT_DELETE",
// // //           entityType: "LEARNER_ENROLLMENT",
// // //           entityId: id,
// // //           learnerName: existingRow.fullName,
// // //           idNumber: existingRow.idNumber,
// // //           cohortId: existingRow.cohortId,
// // //           reason: audit.reason,
// // //           deletedBy: audit.adminId,
// // //           deletedByName: audit.adminName,
// // //           deletedAt: timestamp,
// // //           dataSnapshot: existingRow,
// // //         });

// // //         const enrolId = existingRow.enrollmentId || id;
// // //         batch.delete(doc(db, "enrollments", enrolId));

// // //         const humanId = existingRow.learnerId || id;
// // //         batch.delete(doc(db, "learners", humanId));

// // //         const subQ = query(
// // //           collection(db, "learner_submissions"),
// // //           where("enrollmentId", "==", enrolId),
// // //         );
// // //         const subSnap = await getDocs(subQ);
// // //         subSnap.forEach((subDoc) => {
// // //           batch.delete(subDoc.ref);
// // //         });

// // //         await batch.commit();

// // //         set((state) => {
// // //           state.learners = state.learners.filter((l) => l.id !== id);
// // //         });
// // //       } catch (error) {
// // //         console.error("Failed to permanently delete learner:", error);
// // //         throw error;
// // //       }
// // //     },

// // //     restoreLearner: async (id: string) => {
// // //       try {
// // //         const existingRow = get().learners.find((l) => l.id === id);
// // //         if (!existingRow) return;

// // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // //         const enrolSnap = await getDoc(enrolRef);

// // //         if (enrolSnap.exists()) {
// // //           await updateDoc(enrolRef, { isArchived: false, updatedAt: now() });
// // //         } else {
// // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // //             isArchived: false,
// // //             updatedAt: now(),
// // //           });
// // //         }

// // //         set((state) => {
// // //           const idx = state.learners.findIndex((l) => l.id === id);
// // //           if (idx !== -1) state.learners[idx].isArchived = false;
// // //         });
// // //       } catch (error) {
// // //         console.error(error);
// // //       }
// // //     },

// // //     archiveCohort: async (year: string) => {
// // //       const { learners } = get();
// // //       const batch = writeBatch(db);
// // //       let count = 0;

// // //       for (const l of learners) {
// // //         const learnerYear = l.trainingStartDate
// // //           ? l.trainingStartDate.substring(0, 4)
// // //           : "";
// // //         if (learnerYear === year && !l.isArchived) {
// // //           const enrolRef = doc(db, "enrollments", l.enrollmentId);
// // //           const enrolSnap = await getDoc(enrolRef);
// // //           if (enrolSnap.exists()) {
// // //             batch.update(enrolRef, { isArchived: true, updatedAt: now() });
// // //           } else {
// // //             batch.update(doc(db, "learners", l.learnerId), {
// // //               isArchived: true,
// // //               updatedAt: now(),
// // //             });
// // //           }
// // //           count++;
// // //         }
// // //       }

// // //       if (count > 0) {
// // //         await batch.commit();
// // //         set((state) => {
// // //           state.learners.forEach((l) => {
// // //             if (l.trainingStartDate?.startsWith(year)) l.isArchived = true;
// // //           });
// // //         });
// // //         return { count };
// // //       } else {
// // //         return { count: 0 };
// // //       }
// // //     },

// // //     // ==================== STAGING (DRAFTS) ====================
// // //     stagingLearners: [],

// // //     fetchStagingLearners: async () => {
// // //       try {
// // //         const q = query(
// // //           collection(db, "staging_learners"),
// // //           orderBy("fullName"),
// // //         );
// // //         const snapshot = await getDocs(q);
// // //         const list = snapshot.docs.map(
// // //           (doc) => ({ ...doc.data(), id: doc.id }) as DashboardLearner,
// // //         );
// // //         set((state) => {
// // //           state.stagingLearners = list;
// // //         });
// // //       } catch (error) {
// // //         console.error("Failed to fetch staging:", error);
// // //       }
// // //     },

// // //     approveStagingLearners: async (learnersToApprove) => {
// // //       set((state) => {
// // //         state.learnersLoading = true;
// // //       });
// // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       const functions = getFunctions();
// // //       const createAccountFn = httpsCallable(functions, "createLearnerAccount");

// // //       try {
// // //         const batch = writeBatch(db);
// // //         const approvedIds = new Set<string>();

// // //         await Promise.all(
// // //           learnersToApprove.map(async (l) => {
// // //             try {
// // //               const result = await createAccountFn({
// // //                 email: l.email,
// // //                 fullName: l.fullName,
// // //                 role: "learner",
// // //                 password: "TemporaryPassword123!",
// // //               });
// // //               const data = result.data as any;
// // //               const authUid = data.uid || l.id;

// // //               const profileData: any = { id: authUid };
// // //               const enrollmentData: any = {};

// // //               Object.keys(l).forEach((key) => {
// // //                 if (PROFILE_KEYS.includes(key))
// // //                   profileData[key] = (l as any)[key];
// // //                 else enrollmentData[key] = (l as any)[key];
// // //               });

// // //               profileData.authStatus = "active";
// // //               profileData.updatedAt = now();

// // //               enrollmentData.learnerId = authUid;
// // //               enrollmentData.isDraft = false;
// // //               enrollmentData.status = "active";
// // //               enrollmentData.approvedAt = now();
// // //               enrollmentData.approvedBy = USER_ID;

// // //               const profileRef = doc(db, "learners", authUid);
// // //               batch.set(profileRef, profileData, { merge: true });

// // //               const enrollmentRef = doc(collection(db, "enrollments"));
// // //               batch.set(enrollmentRef, enrollmentData);

// // //               const stagingRef = doc(db, "staging_learners", l.id);
// // //               batch.delete(stagingRef);

// // //               approvedIds.add(l.id);
// // //             } catch (err) {
// // //               console.error(`Failed to create account for ${l.email}`, err);
// // //             }
// // //           }),
// // //         );

// // //         await batch.commit();

// // //         set((state) => {
// // //           state.stagingLearners = state.stagingLearners.filter(
// // //             (l) => !approvedIds.has(l.id),
// // //           );
// // //           state.learnersLoading = false;
// // //         });

// // //         await get().fetchLearners(true);
// // //         // Note: The UI component calling this should show a success toast here!
// // //       } catch (e) {
// // //         console.error(e);
// // //         set((state) => {
// // //           state.learnersLoading = false;
// // //         });
// // //         throw new Error("Error during approval process.");
// // //       }
// // //     },

// // //     inviteLearner: async (learner: DashboardLearner) => {
// // //       set((state) => {
// // //         state.learnersLoading = true;
// // //       });

// // //       try {
// // //         const functions = getFunctions();
// // //         const createAccountFn = httpsCallable(
// // //           functions,
// // //           "createLearnerAccount",
// // //         );

// // //         const result = await createAccountFn({
// // //           email: learner.email,
// // //           fullName: learner.fullName,
// // //           role: "learner",
// // //         });

// // //         const data = result.data as any;

// // //         if (data.success) {
// // //           const learnerRef = doc(
// // //             db,
// // //             "learners",
// // //             learner.learnerId || learner.id,
// // //           );
// // //           await updateDoc(learnerRef, {
// // //             authStatus: "active",
// // //             invitedAt: now(),
// // //           });

// // //           set((state) => {
// // //             const idx = state.learners.findIndex((l) => l.id === learner.id);
// // //             if (idx !== -1) state.learners[idx].authStatus = "active";
// // //             state.learnersLoading = false;
// // //           });
// // //         } else {
// // //           throw new Error(data.message || "Unknown error");
// // //         }
// // //       } catch (error: any) {
// // //         console.error(error);
// // //         set((state) => {
// // //           state.learnersLoading = false;
// // //         });
// // //         if (error.message.includes("already exists")) {
// // //           throw new Error("This user is already registered.");
// // //         } else {
// // //           throw new Error(`Failed to invite: ${error.message}`);
// // //         }
// // //       }
// // //     },

// // //     discardStagingLearners: async (ids) => {
// // //       try {
// // //         const batch = writeBatch(db);
// // //         ids.forEach((id) => batch.delete(doc(db, "staging_learners", id)));
// // //         await batch.commit();
// // //         await get().fetchStagingLearners();
// // //       } catch (e) {
// // //         console.error(e);
// // //       }
// // //     },

// // //     settings: null,

// // //     fetchSettings: async () => {
// // //       try {
// // //         const docRef = doc(db, "system_settings", "global");
// // //         const snap = await getDoc(docRef);
// // //         if (snap.exists()) {
// // //           set({ settings: snap.data() as SystemSettings });
// // //         }
// // //       } catch (error) {
// // //         console.error("Error fetching system settings:", error);
// // //       }
// // //     },

// // //     // ==================== PROGRAMMES SLICE ====================
// // //     programmes: [],
// // //     programmesLoading: false,
// // //     programmesError: null,
// // //     programmesLastFetched: null,

// // //     fetchProgrammes: async (force = false) => {
// // //       const { programmesLastFetched, programmesLoading } = get();
// // //       if (
// // //         !force &&
// // //         programmesLastFetched &&
// // //         Date.now() - programmesLastFetched < 5 * 60 * 1000
// // //       )
// // //         return;
// // //       if (programmesLoading) return;

// // //       set({ programmesLoading: true, programmesError: null });
// // //       try {
// // //         const q = query(collection(db, "programmes"), orderBy("name"));
// // //         const snapshot = await getDocs(q);
// // //         const programmes = snapshot.docs.map(
// // //           (doc) => ({ id: doc.id, ...doc.data() }) as ProgrammeTemplate,
// // //         );
// // //         set({
// // //           programmes,
// // //           programmesLoading: false,
// // //           programmesLastFetched: Date.now(),
// // //         });
// // //       } catch (error) {
// // //         set({
// // //           programmesError: (error as Error).message,
// // //           programmesLoading: false,
// // //         });
// // //       }
// // //     },

// // //     addProgramme: async (programme) => {
// // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       try {
// // //         const timestamp = now();
// // //         const pAudit = {
// // //           ...programme,
// // //           createdAt: timestamp,
// // //           createdBy: USER_ID,
// // //           updatedAt: timestamp,
// // //           updatedBy: USER_ID,
// // //         };
// // //         const docRef = await addDoc(collection(db, "programmes"), pAudit);
// // //         set((state) => {
// // //           state.programmes.push({
// // //             ...pAudit,
// // //             id: docRef.id,
// // //           } as ProgrammeTemplate);
// // //         });
// // //       } catch (error) {
// // //         throw error;
// // //       }
// // //     },

// // //     updateProgramme: async (id, updates) => {
// // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       try {
// // //         const updatePayload = {
// // //           ...updates,
// // //           updatedAt: now(),
// // //           updatedBy: USER_ID,
// // //         };
// // //         await updateDoc(doc(db, "programmes", id), updatePayload);
// // //         set((state) => {
// // //           const index = state.programmes.findIndex((p) => p.id === id);
// // //           if (index !== -1)
// // //             state.programmes[index] = {
// // //               ...state.programmes[index],
// // //               ...updatePayload,
// // //             };
// // //         });
// // //       } catch (error) {
// // //         throw error;
// // //       }
// // //     },

// // //     archiveProgramme: async (id) => {
// // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       try {
// // //         await updateDoc(doc(db, "programmes", id), {
// // //           isArchived: true,
// // //           updatedAt: now(),
// // //           updatedBy: USER_ID,
// // //         });
// // //         set((state) => {
// // //           const index = state.programmes.findIndex((p) => p.id === id);
// // //           if (index !== -1) state.programmes[index].isArchived = true;
// // //         });
// // //       } catch (error) {
// // //         throw error;
// // //       }
// // //     },

// // //     // ==================== STAFF SLICE ====================
// // //     staff: [],
// // //     staffLoading: false,
// // //     staffError: null,

// // //     fetchStaff: async (force = false) => {
// // //       const { staff, staffLoading } = get();
// // //       if (!force && staff.length > 0) return;
// // //       if (staffLoading) return;

// // //       set({ staffLoading: true, staffError: null });
// // //       try {
// // //         const q = query(
// // //           collection(db, "users"),
// // //           where("role", "in", [
// // //             "admin",
// // //             "facilitator",
// // //             "assessor",
// // //             "moderator",
// // //             "mentor",
// // //           ]),
// // //         );
// // //         const snapshot = await getDocs(q);
// // //         const staffList = snapshot.docs.map((doc) => {
// // //           const data = doc.data();
// // //           return {
// // //             id: doc.id,
// // //             fullName: data.fullName || "Unknown Staff",
// // //             email: data.email,
// // //             role: data.role,
// // //             phone: data.phone,
// // //             createdAt: data.createdAt || new Date().toISOString(),
// // //             employerId: data.employerId,
// // //             assessorRegNumber: data.assessorRegNumber,
// // //             status: data.status || "active",
// // //           } as StaffMember;
// // //         });
// // //         set({ staff: staffList, staffLoading: false });
// // //       } catch (error) {
// // //         set({ staffError: (error as Error).message, staffLoading: false });
// // //       }
// // //     },

// // //     addStaff: async (newStaff) => {
// // //       set({ staffLoading: true, staffError: null });
// // //       try {
// // //         const functions = getFunctions();
// // //         const createStaffAccount = httpsCallable(
// // //           functions,
// // //           "createStaffAccount",
// // //         );

// // //         const result = await createStaffAccount({
// // //           email: newStaff.email,
// // //           fullName: newStaff.fullName,
// // //           role: newStaff.role,
// // //           phone: newStaff.phone || "",
// // //           employerId: newStaff.employerId || "",
// // //           assessorRegNumber: newStaff.assessorRegNumber || "",
// // //         });

// // //         const data = result.data as any;

// // //         if (data.success) {
// // //           const createdStaff = {
// // //             ...newStaff,
// // //             id: data.uid || "temp-id-" + Date.now(),
// // //             createdAt: new Date().toISOString(),
// // //             signatureUrl: "",
// // //           } as StaffMember;

// // //           set((state) => {
// // //             state.staff.push(createdStaff);
// // //             state.staffLoading = false;
// // //           });
// // //         }
// // //       } catch (error: any) {
// // //         let errorMessage = "Failed to create account.";
// // //         if (error.code === "functions/permission-denied")
// // //           errorMessage = "You do not have permission to create staff.";
// // //         else if (error.code === "functions/already-exists")
// // //           errorMessage = "A user with this email already exists.";
// // //         else if (error.message) errorMessage = error.message;

// // //         set({ staffLoading: false, staffError: errorMessage });
// // //         throw new Error(errorMessage);
// // //       }
// // //     },

// // //     updateStaff: async (id: string, updates: Partial<StaffMember>) => {
// // //       try {
// // //         const payload = { ...updates, updatedAt: now() };
// // //         await updateDoc(doc(db, "users", id), payload);

// // //         set((state) => {
// // //           const index = state.staff.findIndex((s) => s.id === id);
// // //           if (index !== -1) {
// // //             state.staff[index] = { ...state.staff[index], ...payload };
// // //           }
// // //         });
// // //       } catch (error) {
// // //         console.error("Failed to update staff member", error);
// // //         throw error;
// // //       }
// // //     },

// // //     // deleteStaff: async (id) => {
// // //     //   try {
// // //     //     await deleteDoc(doc(db, "users", id));
// // //     //     set((state) => {
// // //     //       state.staff = state.staff.filter((s) => s.id !== id);
// // //     //     });
// // //     //   } catch (error) {
// // //     //     throw error;
// // //     //   }
// // //     // },
// // //     deleteStaff: async (id) => {
// // //       try {
// // //         const functions = getFunctions();
// // //         const deleteStaffAccount = httpsCallable(
// // //           functions,
// // //           "deleteStaffAccount",
// // //         );

// // //         // Call the secure Cloud Function
// // //         await deleteStaffAccount({ uid: id });

// // //         // Remove them from the local UI state
// // //         set((state) => {
// // //           state.staff = state.staff.filter((s) => s.id !== id);
// // //         });
// // //       } catch (error: any) {
// // //         console.error("Failed to delete staff member:", error);
// // //         throw new Error(error.message || "Failed to delete staff account.");
// // //       }
// // //     },

// // //     updateStaffProfile: async (uid: string, updates: any) => {
// // //       try {
// // //         await updateDoc(doc(db, "users", uid), {
// // //           ...updates,
// // //           updatedAt: now(),
// // //         });
// // //         set((state) => ({
// // //           user: state.user ? { ...state.user, ...updates } : null,
// // //         }));
// // //       } catch (error) {
// // //         throw error;
// // //       }
// // //     },

// // //     // ==================== IMPORTS ====================
// // //     importUnifiedLearners: async (file: File) => {
// // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // //       return new Promise((resolve, reject) => {
// // //         Papa.parse(file, {
// // //           header: true,
// // //           skipEmptyLines: true,
// // //           transformHeader: (header) => header.trim(),
// // //           complete: async (results) => {
// // //             const rawData = results.data as any[];
// // //             const errors: string[] = [];
// // //             const learnersMap = new Map<string, any>();

// // //             if (rawData.length === 0) {
// // //               resolve({ success: 0, errors: ["CSV file is empty"] });
// // //               return;
// // //             }

// // //             rawData.forEach((row, index) => {
// // //               try {
// // //                 const getStr = (val: any): string =>
// // //                   val !== null && val !== undefined ? String(val).trim() : "";
// // //                 const idNumber = getStr(row.NationalId || row.ID_Number);

// // //                 const issueDateStr =
// // //                   getStr(row.StatementofResultsIssueDate) ||
// // //                   now().split("T")[0];
// // //                 const providerCode =
// // //                   getStr(row.SDPCode) ||
// // //                   import.meta.env.VITE_SDP_CODE ||
// // //                   "SDP070824115131";

// // //                 if (!idNumber) return;

// // //                 if (!learnersMap.has(idNumber)) {
// // //                   const firstName = getStr(row.LearnerFirstName);
// // //                   const lastName = getStr(row.LearnerLastName);
// // //                   const middleName = getStr(row.LearnerMiddleName);
// // //                   let fullName =
// // //                     firstName || lastName
// // //                       ? `${firstName} ${middleName} ${lastName}`
// // //                           .replace(/\s+/g, " ")
// // //                           .trim()
// // //                       : getStr(row.Full_Name) || "Unknown Learner";

// // //                   const parseYYYYMMDD = (val: string) => {
// // //                     if (val.length === 8 && /^\d+$/.test(val)) {
// // //                       return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
// // //                     }
// // //                     return val;
// // //                   };

// // //                   const newLearner = {
// // //                     fullName,
// // //                     idNumber,
// // //                     dateOfBirth: parseYYYYMMDD(
// // //                       getStr(row.LearnerBirthDate || row.Date_Of_Birth),
// // //                     ),
// // //                     email: getStr(row.LearnerEmailAddress || row.Email),
// // //                     phone: getStr(
// // //                       row.LearnerCellPhoneNumber ||
// // //                         row.Phone ||
// // //                         row.LearnerPhoneNumber,
// // //                     ),
// // //                     trainingStartDate: getStr(
// // //                       row.TrainingStartDate || row.Training_Start_Date,
// // //                     )
// // //                       ? parseYYYYMMDD(
// // //                           getStr(
// // //                             row.TrainingStartDate || row.Training_Start_Date,
// // //                           ),
// // //                         )
// // //                       : now().split("T")[0],
// // //                     isArchived: false,
// // //                     isDraft: true,
// // //                     qualification: {
// // //                       name: getStr(
// // //                         row.Programme_Name || row.Qualification_Name,
// // //                       ),
// // //                       saqaId: getStr(row.QualificationId || row.SAQA_ID),
// // //                       credits:
// // //                         parseInt(getStr(row.Total_Credits || row.Credits)) || 0,
// // //                       totalNotionalHours:
// // //                         (parseInt(getStr(row.Total_Credits || row.Credits)) ||
// // //                           0) * 10,
// // //                       nqfLevel: parseInt(getStr(row.NQF_Level)) || 0,
// // //                       dateAssessed: "",
// // //                     },
// // //                     knowledgeModules: [],
// // //                     practicalModules: [],
// // //                     workExperienceModules: [],
// // //                     eisaAdmission:
// // //                       getStr(row.LearnerReadinessforEISATypeId) === "01" ||
// // //                       getStr(row.EISA_Admission).toLowerCase() === "yes",

// // //                     verificationCode:
// // //                       getStr(row.Verification_Code) ||
// // //                       generateSorId(fullName, issueDateStr, providerCode),
// // //                     issueDate: issueDateStr,

// // //                     status: "in-progress",
// // //                     demographics: {
// // //                       sdpCode: getStr(row.SDPCode),
// // //                     },
// // //                     createdAt: now(),
// // //                     createdBy: USER_ID,
// // //                   };
// // //                   learnersMap.set(idNumber, newLearner);
// // //                 }
// // //               } catch (err) {
// // //                 errors.push(
// // //                   `Row ${index + 2} Error: ${(err as Error).message}`,
// // //                 );
// // //               }
// // //             });

// // //             try {
// // //               const batch = writeBatch(db);
// // //               learnersMap.forEach((learner) => {
// // //                 batch.set(
// // //                   doc(db, "staging_learners", learner.idNumber),
// // //                   learner,
// // //                 );
// // //               });
// // //               await batch.commit();
// // //               await get().fetchStagingLearners();
// // //               resolve({ success: learnersMap.size, errors });
// // //             } catch (error) {
// // //               reject(error);
// // //             }
// // //           },
// // //           error: (error) => reject(error),
// // //         });
// // //       });
// // //     },

// // //     importProgrammesFromCSV: async (file: File) => {
// // //       return { success: 0, errors: [] } as any;
// // //     },

// // //     dropLearner: async (id, reason) => {
// // //       try {
// // //         const existingRow = get().learners.find((l) => l.id === id);
// // //         if (!existingRow) return;

// // //         const timestamp = now();
// // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // //         const enrolSnap = await getDoc(enrolRef);

// // //         if (enrolSnap.exists()) {
// // //           await updateDoc(enrolRef, {
// // //             status: "dropped",
// // //             exitReason: reason,
// // //             exitDate: timestamp,
// // //             updatedAt: timestamp,
// // //           });
// // //         } else {
// // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // //             status: "dropped",
// // //             exitReason: reason,
// // //             exitDate: timestamp,
// // //             updatedAt: timestamp,
// // //           });
// // //         }

// // //         set((state) => {
// // //           const index = state.learners.findIndex((l) => l.id === id);
// // //           if (index !== -1) {
// // //             state.learners[index].status = "dropped";
// // //             state.learners[index].exitReason = reason;
// // //             state.learners[index].exitDate = timestamp;
// // //           }
// // //         });
// // //       } catch (error) {
// // //         console.error("Failed to drop learner", error);
// // //         throw error;
// // //       }
// // //     },

// // //     updateLearnerPlacement: async (targetId, employerId, mentorId) => {
// // //       try {
// // //         const payload = {
// // //           employerId,
// // //           mentorId,
// // //           placementDate: now(),
// // //           updatedAt: now(),
// // //         };

// // //         await setDoc(doc(db, "enrollments", targetId), payload, {
// // //           merge: true,
// // //         });
// // //         await setDoc(doc(db, "learners", targetId), payload, { merge: true });

// // //         const existingLearner = get().learners.find(
// // //           (l) => l.enrollmentId === targetId || l.id === targetId,
// // //         );
// // //         const humanId =
// // //           existingLearner?.learnerId || existingLearner?.id || targetId;

// // //         const q = query(
// // //           collection(db, "learner_submissions"),
// // //           where("learnerId", "==", humanId),
// // //           where("moduleType", "in", ["workplace", "qcto_workplace"]),
// // //         );
// // //         const submissionSnap = await getDocs(q);

// // //         if (!submissionSnap.empty) {
// // //           const batch = writeBatch(db);
// // //           submissionSnap.forEach((docSnap) => {
// // //             batch.update(docSnap.ref, {
// // //               employerId: employerId,
// // //               mentorId: mentorId,
// // //               updatedAt: now(),
// // //             });
// // //           });
// // //           await batch.commit();
// // //         }

// // //         await get().fetchLearners(true);
// // //         if (get().fetchSubmissions) await get().fetchSubmissions();
// // //       } catch (error: any) {
// // //         console.error("Failed to update placement in Firebase:", error);
// // //         throw new Error(error.message);
// // //       }
// // //     },
// // //   })),
// // // );

// // // // // src/store/useStore.ts

// // // // import { create } from "zustand";
// // // // import { immer } from "zustand/middleware/immer";
// // // // import { db } from "../lib/firebase";
// // // // import { getFunctions, httpsCallable } from "firebase/functions";
// // // // import {
// // // //   collection,
// // // //   doc,
// // // //   getDocs,
// // // //   addDoc,
// // // //   updateDoc,
// // // //   deleteDoc,
// // // //   query,
// // // //   orderBy,
// // // //   where,
// // // //   writeBatch,
// // // //   getDoc,
// // // //   setDoc,
// // // //   arrayUnion,
// // // // } from "firebase/firestore";
// // // // import Papa from "papaparse";
// // // // import type {
// // // //   DashboardLearner,
// // // //   ProgrammeTemplate,
// // // //   Employer,
// // // //   SystemSettings,
// // // // } from "../types";
// // // // import type { UserProfile } from "../types/auth.types";
// // // // import { getAuth } from "firebase/auth";
// // // // import {
// // // //   createCohortSlice,
// // // //   type CohortSlice,
// // // // } from "./slices/cohortSlice.ts/cohortSlice";
// // // // import { generateSorId } from "../pages/utils/validation";

// // // // const now = () => new Date().toISOString();

// // // // export interface EnrollmentRecord {
// // // //   cohortId: string;
// // // //   programmeId: string;
// // // //   status: "active" | "dropped" | "completed";
// // // //   dateAssigned: string;
// // // //   exitDate?: string | null;
// // // //   exitReason?: string;
// // // // }

// // // // export interface StaffMember {
// // // //   id: string;
// // // //   fullName: string;
// // // //   email: string;
// // // //   role: "admin" | "facilitator" | "assessor" | "moderator" | "mentor";
// // // //   phone?: string;
// // // //   authUid: string;
// // // //   assessorRegNumber?: string;
// // // //   employerId?: string;
// // // //   status?: "active" | "archived";
// // // //   createdAt?: string;
// // // //   updatedAt?: string;
// // // // }

// // // // export interface AttendanceRecord {
// // // //   id?: string;
// // // //   cohortId: string;
// // // //   date: string;
// // // //   facilitatorId: string;
// // // //   presentLearners: string[];
// // // //   notes?: string;
// // // // }

// // // // const PROFILE_KEYS = [
// // // //   "fullName",
// // // //   "firstName",
// // // //   "lastName",
// // // //   "idNumber",
// // // //   "dateOfBirth",
// // // //   "email",
// // // //   "phone",
// // // //   "mobile",
// // // //   "profilePhotoUrl",
// // // //   "profileCompleted",
// // // //   "authUid",
// // // //   "uid",
// // // //   "authStatus",
// // // //   "demographics",
// // // // ];

// // // // interface StoreState extends CohortSlice {
// // // //   user: UserProfile | null;
// // // //   loading: boolean;
// // // //   setUser: (user: UserProfile | null) => void;
// // // //   setLoading: (loading: boolean) => void;
// // // //   refreshUser: () => Promise<void>;

// // // //   // --- LEARNERS SLICE ---
// // // //   learners: DashboardLearner[];
// // // //   stagingLearners: DashboardLearner[];
// // // //   learnersLoading: boolean;
// // // //   learnersError: string | null;
// // // //   learnersLastFetched: number | null;

// // // //   clearUser: () => void;

// // // //   fetchLearners: (force?: boolean) => Promise<void>;
// // // //   fetchStagingLearners: () => Promise<void>;

// // // //   approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
// // // //   inviteLearner: (learner: DashboardLearner) => Promise<void>;
// // // //   discardStagingLearners: (ids: string[]) => Promise<void>;

// // // //   settings: SystemSettings | null;
// // // //   fetchSettings: () => Promise<void>;

// // // //   addLearner: (
// // // //     learner: Omit<
// // // //       DashboardLearner,
// // // //       | "id"
// // // //       | "learnerId"
// // // //       | "enrollmentId"
// // // //       | "createdAt"
// // // //       | "createdBy"
// // // //       | "updatedAt"
// // // //       | "updatedBy"
// // // //     >,
// // // //   ) => Promise<void>;
// // // //   updateLearner: (
// // // //     id: string,
// // // //     updates: Partial<DashboardLearner>,
// // // //   ) => Promise<void>;
// // // //   archiveLearner: (id: string) => Promise<void>;
// // // //   deleteLearnerPermanent: (
// // // //     id: string,
// // // //     audit: { reason: string; adminId: string; adminName: string },
// // // //   ) => Promise<void>;
// // // //   restoreLearner: (id: string) => Promise<void>;
// // // //   dropLearner: (id: string, reason: string) => Promise<void>;
// // // //   archiveCohort: (year: string) => Promise<{ count: number }>;

// // // //   // RELATIONAL ACTIONS
// // // //   enrollLearnerInCohort: (
// // // //     learnerId: string,
// // // //     cohortId: string,
// // // //     programmeId: string,
// // // //   ) => Promise<void>;
// // // //   dropLearnerFromCohort: (
// // // //     learnerId: string,
// // // //     cohortId: string,
// // // //     reason: string,
// // // //   ) => Promise<void>;

// // // //   // --- PROGRAMMES SLICE ---
// // // //   programmes: ProgrammeTemplate[];
// // // //   programmesLoading: boolean;
// // // //   programmesError: string | null;
// // // //   programmesLastFetched: number | null;
// // // //   fetchProgrammes: (force?: boolean) => Promise<void>;
// // // //   addProgramme: (
// // // //     programme: Omit<
// // // //       ProgrammeTemplate,
// // // //       "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
// // // //     >,
// // // //   ) => Promise<void>;
// // // //   updateProgramme: (
// // // //     id: string,
// // // //     updates: Partial<ProgrammeTemplate>,
// // // //   ) => Promise<void>;
// // // //   archiveProgramme: (id: string) => Promise<void>;

// // // //   // --- STAFF SLICE ---
// // // //   staff: StaffMember[];
// // // //   staffLoading: boolean;
// // // //   staffError: string | null;
// // // //   fetchStaff: (force?: boolean) => Promise<void>;
// // // //   addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
// // // //   updateStaff: (id: string, updates: Partial<StaffMember>) => Promise<void>;
// // // //   deleteStaff: (id: string) => Promise<void>;
// // // //   updateStaffProfile: (uid: string, updates: any) => Promise<void>;

// // // //   // --- BULK IMPORT ACTIONS ---
// // // //   importUnifiedLearners: (
// // // //     file: File,
// // // //   ) => Promise<{ success: number; errors: string[] }>;
// // // //   importProgrammesFromCSV: (
// // // //     file: File,
// // // //   ) => Promise<{ success: number; errors: string[] }>;

// // // //   assignAssessmentToLearner: (
// // // //     assessmentTemplate: any,
// // // //     learner: DashboardLearner,
// // // //   ) => Promise<string>;

// // // //   employers: Employer[];
// // // //   fetchEmployers: () => Promise<void>;

// // // //   updateLearnerPlacement: (
// // // //     enrollmentId: string,
// // // //     employerId: string,
// // // //     mentorId: string,
// // // //   ) => Promise<void>;

// // // //   // --- WORKPLACE MENTOR DATA ---
// // // //   assessments: any[];
// // // //   submissions: any[];
// // // //   enrollments: any[];
// // // //   fetchAssessments: () => Promise<void>;
// // // //   fetchSubmissions: () => Promise<void>;
// // // //   fetchEnrollments: () => Promise<void>;

// // // //   // AD-HOC CERTIFICATE STUDIO HISTORY
// // // //   adHocCertificates: any[];
// // // //   fetchAdHocCertificates: (force?: boolean) => Promise<void>;

// // // //   certificateGroups: any[];
// // // //   fetchCertificateGroups: (force?: boolean) => Promise<void>;
// // // //   createCertificateGroup: (name: string) => Promise<void>;

// // // //   renameCertificateGroup: (id: string, newName: string) => Promise<void>;
// // // // }

// // // // export const useStore = create<StoreState>()(
// // // //   immer((set, get, api) => ({
// // // //     ...createCohortSlice(set, get, api),

// // // //     user: null,
// // // //     loading: true,
// // // //     setUser: (user) => set({ user }),
// // // //     setLoading: (loading) => set({ loading }),

// // // //     clearUser: () => set({ user: null }),

// // // //     refreshUser: async () => {
// // // //       const currentUser = get().user;
// // // //       if (!currentUser?.uid) return;
// // // //       try {
// // // //         const userDoc = await getDoc(doc(db, "users", currentUser.uid));
// // // //         if (userDoc.exists()) {
// // // //           const data = userDoc.data();
// // // //           const updatedProfile: UserProfile = {
// // // //             ...currentUser,
// // // //             fullName: data.fullName || currentUser.fullName,
// // // //             role: data.role || currentUser.role,
// // // //             profileCompleted: data.profileCompleted === true,
// // // //           };
// // // //           set({ user: updatedProfile });
// // // //         }
// // // //       } catch (error) {
// // // //         console.error("Store: Failed to refresh user data", error);
// // // //       }
// // // //     },

// // // //     // AD-HOC CERTIFICATE STUDIO HISTORY FETCH
// // // //     adHocCertificates: [],
// // // //     fetchAdHocCertificates: async (force = false) => {
// // // //       const { adHocCertificates } = get();
// // // //       if (!force && adHocCertificates.length > 0) return;

// // // //       try {
// // // //         const q = query(
// // // //           collection(db, "ad_hoc_certificates"),
// // // //           orderBy("createdAt", "desc"),
// // // //         );
// // // //         const snap = await getDocs(q);
// // // //         const history = snap.docs.map((doc) => ({
// // // //           id: doc.id,
// // // //           ...doc.data(),
// // // //         }));
// // // //         set({ adHocCertificates: history });
// // // //       } catch (error) {
// // // //         console.error("Failed to load ad-hoc certificates:", error);
// // // //       }
// // // //     },
// // // //     certificateGroups: [],
// // // //     fetchCertificateGroups: async (force = false) => {
// // // //       const { certificateGroups } = get();
// // // //       if (!force && certificateGroups.length > 0) return;

// // // //       try {
// // // //         const q = query(
// // // //           collection(db, "certificate_groups"),
// // // //           orderBy("createdAt", "desc"),
// // // //         );
// // // //         const snap = await getDocs(q);
// // // //         set({
// // // //           certificateGroups: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
// // // //         });
// // // //       } catch (error) {
// // // //         console.error("Group Fetch Error:", error);
// // // //       }
// // // //     },
// // // //     createCertificateGroup: async (name: string) => {
// // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       try {
// // // //         await addDoc(collection(db, "certificate_groups"), {
// // // //           name,
// // // //           createdBy: USER_ID,
// // // //           createdAt: new Date().toISOString(),
// // // //         });
// // // //         await get().fetchCertificateGroups(true);
// // // //       } catch (error) {
// // // //         console.error("Failed to create folder", error);
// // // //         throw error;
// // // //       }
// // // //     },
// // // //     renameCertificateGroup: async (id: string, newName: string) => {
// // // //       try {
// // // //         await updateDoc(doc(db, "certificate_groups", id), {
// // // //           name: newName,
// // // //           updatedAt: new Date().toISOString(),
// // // //         });
// // // //         await get().fetchCertificateGroups(true);
// // // //       } catch (error) {
// // // //         console.error("Failed to rename folder", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     // --- MENTOR DATA FETCHERS ---
// // // //     assessments: [],
// // // //     submissions: [],
// // // //     enrollments: [],

// // // //     fetchAssessments: async () => {
// // // //       try {
// // // //         const snap = await getDocs(collection(db, "assessments"));
// // // //         set({ assessments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // //       } catch (e) {
// // // //         console.error(e);
// // // //       }
// // // //     },

// // // //     fetchSubmissions: async () => {
// // // //       try {
// // // //         const snap = await getDocs(collection(db, "learner_submissions"));
// // // //         set({ submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // //       } catch (e) {
// // // //         console.error(e);
// // // //       }
// // // //     },

// // // //     fetchEnrollments: async () => {
// // // //       try {
// // // //         const snap = await getDocs(collection(db, "enrollments"));
// // // //         set({ enrollments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // //       } catch (e) {
// // // //         console.error(e);
// // // //       }
// // // //     },

// // // //     // ==================== EMPLOYERS SLICE ====================
// // // //     employers: [],
// // // //     fetchEmployers: async () => {
// // // //       try {
// // // //         const querySnapshot = await getDocs(collection(db, "employers"));
// // // //         const employersData = querySnapshot.docs.map((doc) => ({
// // // //           id: doc.id,
// // // //           ...doc.data(),
// // // //         })) as Employer[];

// // // //         employersData.sort((a, b) => a.name.localeCompare(b.name));
// // // //         set({ employers: employersData });
// // // //       } catch (error) {
// // // //         console.error("Error fetching employers:", error);
// // // //       }
// // // //     },

// // // //     // ==================== LEARNERS SLICE ====================
// // // //     learners: [],
// // // //     learnersLoading: false,
// // // //     learnersError: null,
// // // //     learnersLastFetched: null,

// // // //     fetchLearners: async (force = false) => {
// // // //       const { learnersLastFetched, learnersLoading } = get();

// // // //       if (
// // // //         !force &&
// // // //         learnersLastFetched &&
// // // //         Date.now() - learnersLastFetched < 5 * 60 * 1000
// // // //       )
// // // //         return;
// // // //       if (learnersLoading) return;

// // // //       set({ learnersLoading: true, learnersError: null });
// // // //       try {
// // // //         const profilesSnap = await getDocs(query(collection(db, "learners")));
// // // //         const profilesMap = new Map<string, any>();

// // // //         profilesSnap.docs.forEach((doc) => {
// // // //           profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
// // // //         });

// // // //         const enrollmentsSnap = await getDocs(
// // // //           query(collection(db, "enrollments")),
// // // //         );
// // // //         const combinedLearners: DashboardLearner[] = [];
// // // //         const usedProfileIds = new Set<string>();

// // // //         enrollmentsSnap.docs.forEach((docSnap) => {
// // // //           const enrollment = docSnap.data();
// // // //           const profile = profilesMap.get(enrollment.learnerId);

// // // //           if (profile) {
// // // //             usedProfileIds.add(profile.id);
// // // //             combinedLearners.push({
// // // //               ...profile,
// // // //               ...enrollment,
// // // //               id: docSnap.id,
// // // //               enrollmentId: docSnap.id,
// // // //               learnerId: profile.id,
// // // //             } as DashboardLearner);
// // // //           }
// // // //         });

// // // //         profilesMap.forEach((profile, profileId) => {
// // // //           if (!usedProfileIds.has(profileId) && profile.cohortId) {
// // // //             combinedLearners.push({
// // // //               ...profile,
// // // //               id: profileId,
// // // //               enrollmentId: profileId,
// // // //               learnerId: profileId,
// // // //             } as DashboardLearner);
// // // //           }
// // // //         });

// // // //         combinedLearners.sort((a, b) =>
// // // //           (a.fullName || "").localeCompare(b.fullName || ""),
// // // //         );

// // // //         set({
// // // //           learners: combinedLearners,
// // // //           learnersLoading: false,
// // // //           learnersLastFetched: Date.now(),
// // // //         });
// // // //       } catch (error) {
// // // //         console.error("Fetch error:", error);
// // // //         set({
// // // //           learnersError: (error as Error).message,
// // // //           learnersLoading: false,
// // // //         });
// // // //       }
// // // //     },

// // // //     addLearner: async (payload) => {
// // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       try {
// // // //         const timestamp = now();
// // // //         const profileData: any = {};
// // // //         const enrollmentData: any = {};

// // // //         Object.keys(payload).forEach((key) => {
// // // //           if (PROFILE_KEYS.includes(key))
// // // //             profileData[key] = (payload as any)[key];
// // // //           else enrollmentData[key] = (payload as any)[key];
// // // //         });

// // // //         profileData.createdAt = timestamp;
// // // //         profileData.createdBy = USER_ID;

// // // //         enrollmentData.createdAt = timestamp;
// // // //         enrollmentData.createdBy = USER_ID;
// // // //         enrollmentData.isDraft = false;
// // // //         enrollmentData.isArchived = false;
// // // //         enrollmentData.status = "in-progress";

// // // //         if (!enrollmentData.verificationCode) {
// // // //           const issueDate = enrollmentData.issueDate || timestamp.split("T")[0];
// // // //           const name = profileData.fullName || "Unknown Learner";
// // // //           const providerCode =
// // // //             import.meta.env.VITE_SDP_CODE || "SDP070824115131";

// // // //           enrollmentData.verificationCode = generateSorId(
// // // //             name,
// // // //             issueDate,
// // // //             providerCode,
// // // //           );
// // // //           enrollmentData.issueDate = issueDate;
// // // //         }

// // // //         let finalLearnerId = "";

// // // //         const q = query(
// // // //           collection(db, "learners"),
// // // //           where("idNumber", "==", profileData.idNumber),
// // // //         );
// // // //         const existingSnap = await getDocs(q);

// // // //         if (!existingSnap.empty) {
// // // //           finalLearnerId = existingSnap.docs[0].id;
// // // //           await updateDoc(doc(db, "learners", finalLearnerId), {
// // // //             ...profileData,
// // // //             updatedAt: timestamp,
// // // //           });
// // // //         } else {
// // // //           const newProfileRef = await addDoc(
// // // //             collection(db, "learners"),
// // // //             profileData,
// // // //           );
// // // //           finalLearnerId = newProfileRef.id;
// // // //         }

// // // //         enrollmentData.learnerId = finalLearnerId;
// // // //         const newEnrollmentRef = await addDoc(
// // // //           collection(db, "enrollments"),
// // // //           enrollmentData,
// // // //         );

// // // //         set((state) => {
// // // //           state.learners.push({
// // // //             ...profileData,
// // // //             ...enrollmentData,
// // // //             id: newEnrollmentRef.id,
// // // //             enrollmentId: newEnrollmentRef.id,
// // // //             learnerId: finalLearnerId,
// // // //           } as DashboardLearner);
// // // //         });
// // // //       } catch (error) {
// // // //         console.error("Failed to add learner", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     updateLearner: async (id, updates) => {
// // // //       const CURRENT_USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       try {
// // // //         const existingRow = get().learners.find((l) => l.id === id);

// // // //         const learnerId = existingRow?.learnerId || id;
// // // //         const enrollmentId = existingRow?.enrollmentId || null;

// // // //         const profileUpdates: any = {
// // // //           updatedAt: now(),
// // // //           updatedBy: CURRENT_USER_ID,
// // // //         };
// // // //         const enrollmentUpdates: any = {
// // // //           updatedAt: now(),
// // // //           updatedBy: CURRENT_USER_ID,
// // // //         };
// // // //         let hasProfileUpdate = false;
// // // //         let hasEnrollmentUpdate = false;

// // // //         Object.keys(updates).forEach((key) => {
// // // //           if (PROFILE_KEYS.includes(key)) {
// // // //             profileUpdates[key] = (updates as any)[key];
// // // //             hasProfileUpdate = true;
// // // //           } else {
// // // //             enrollmentUpdates[key] = (updates as any)[key];
// // // //             hasEnrollmentUpdate = true;
// // // //           }
// // // //         });

// // // //         const batch = writeBatch(db);

// // // //         if (hasProfileUpdate && learnerId) {
// // // //           batch.update(doc(db, "learners", learnerId), profileUpdates);
// // // //         }

// // // //         if (hasEnrollmentUpdate) {
// // // //           if (enrollmentId) {
// // // //             const enrolRef = doc(db, "enrollments", enrollmentId);
// // // //             const enrolSnap = await getDoc(enrolRef);
// // // //             if (enrolSnap.exists()) {
// // // //               batch.update(enrolRef, enrollmentUpdates);
// // // //             } else {
// // // //               batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
// // // //             }
// // // //           } else {
// // // //             batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
// // // //           }
// // // //         }

// // // //         await batch.commit();

// // // //         set((state) => {
// // // //           const index = state.learners.findIndex((l) => l.id === id);
// // // //           if (index !== -1) {
// // // //             state.learners[index] = { ...state.learners[index], ...updates };
// // // //           }
// // // //           if (state.user && state.user.uid === learnerId) {
// // // //             state.user = { ...state.user, ...updates };
// // // //           }
// // // //         });
// // // //       } catch (error) {
// // // //         console.error("Failed to update learner", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     enrollLearnerInCohort: async (
// // // //       learnerId: string,
// // // //       cohortId: string,
// // // //       programmeId: string,
// // // //     ) => {
// // // //       try {
// // // //         const newEnrollment: EnrollmentRecord = {
// // // //           cohortId,
// // // //           programmeId,
// // // //           status: "active",
// // // //           dateAssigned: now(),
// // // //         };

// // // //         const learnerRef = doc(db, "learners", learnerId);
// // // //         const learnerSnap = await getDoc(learnerRef);

// // // //         if (learnerSnap.exists()) {
// // // //           const data = learnerSnap.data();
// // // //           const history = data.enrollmentHistory || [];

// // // //           const filteredHistory = history.filter(
// // // //             (h: any) => h.cohortId !== cohortId,
// // // //           );
// // // //           filteredHistory.push(newEnrollment);

// // // //           await updateDoc(learnerRef, {
// // // //             enrollmentHistory: filteredHistory,
// // // //             cohortId: cohortId,
// // // //             updatedAt: now(),
// // // //           });
// // // //         }

// // // //         const cohortRef = doc(db, "cohorts", cohortId);
// // // //         await updateDoc(cohortRef, {
// // // //           learnerIds: arrayUnion(learnerId),
// // // //         });

// // // //         await get().fetchLearners(true);
// // // //         if ((get() as any).fetchCohorts) {
// // // //           await (get() as any).fetchCohorts();
// // // //         }
// // // //       } catch (error) {
// // // //         console.error("Error enrolling learner:", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     dropLearnerFromCohort: async (
// // // //       learnerId: string,
// // // //       cohortId: string,
// // // //       reason: string,
// // // //     ) => {
// // // //       try {
// // // //         const learnerRef = doc(db, "learners", learnerId);
// // // //         const learnerSnap = await getDoc(learnerRef);

// // // //         if (learnerSnap.exists()) {
// // // //           const data = learnerSnap.data();
// // // //           const history = data.enrollmentHistory || [];

// // // //           const updatedHistory = history.map((h: any) => {
// // // //             if (h.cohortId === cohortId) {
// // // //               return {
// // // //                 ...h,
// // // //                 status: "dropped",
// // // //                 exitDate: now(),
// // // //                 exitReason: reason,
// // // //               };
// // // //             }
// // // //             return h;
// // // //           });

// // // //           await updateDoc(learnerRef, {
// // // //             enrollmentHistory: updatedHistory,
// // // //             status: "dropped",
// // // //             updatedAt: now(),
// // // //           });

// // // //           await get().fetchLearners(true);
// // // //         }
// // // //       } catch (error) {
// // // //         console.error("Error dropping learner from cohort:", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     assignAssessmentToLearner: async (assessmentTemplate, learner) => {
// // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       try {
// // // //         const timestamp = now();
// // // //         const targetCohortId = learner.cohortId || "Unassigned";
// // // //         const targetHumanId = learner.learnerId || learner.id;

// // // //         const submissionData: any = {
// // // //           assessmentId: assessmentTemplate.id,
// // // //           title: assessmentTemplate.title,
// // // //           type: assessmentTemplate.type,
// // // //           moduleType: assessmentTemplate.moduleType || "knowledge",
// // // //           moduleNumber: assessmentTemplate.moduleNumber || "",
// // // //           learnerId: targetHumanId,
// // // //           enrollmentId: learner.enrollmentId || learner.id,
// // // //           cohortId: targetCohortId,
// // // //           qualificationName: learner.qualification?.name || "",
// // // //           status: "not_started",
// // // //           assignedAt: timestamp,
// // // //           marks: 0,
// // // //           totalMarks: assessmentTemplate.totalMarks || 0,
// // // //           createdAt: timestamp,
// // // //           createdBy: USER_ID,
// // // //         };

// // // //         if (
// // // //           assessmentTemplate.moduleType === "workplace" ||
// // // //           assessmentTemplate.moduleType === "qcto_workplace"
// // // //         ) {
// // // //           if (learner.mentorId) submissionData.mentorId = learner.mentorId;
// // // //           if (learner.employerId)
// // // //             submissionData.employerId = learner.employerId;
// // // //         }

// // // //         const customId = `${targetCohortId}_${targetHumanId}_${assessmentTemplate.id}`;

// // // //         await setDoc(doc(db, "learner_submissions", customId), submissionData, {
// // // //           merge: true,
// // // //         });

// // // //         return customId;
// // // //       } catch (error) {
// // // //         console.error("Assignment error:", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     archiveLearner: async (id: string) => {
// // // //       try {
// // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // //         if (!existingRow) return;

// // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // //         const enrolSnap = await getDoc(enrolRef);

// // // //         if (enrolSnap.exists()) {
// // // //           await updateDoc(enrolRef, { isArchived: true, updatedAt: now() });
// // // //         } else {
// // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // //             isArchived: true,
// // // //             updatedAt: now(),
// // // //           });
// // // //         }

// // // //         set((state) => {
// // // //           const idx = state.learners.findIndex((l) => l.id === id);
// // // //           if (idx !== -1) state.learners[idx].isArchived = true;
// // // //         });
// // // //       } catch (error) {
// // // //         console.error(error);
// // // //       }
// // // //     },

// // // //     deleteLearnerPermanent: async (id, audit) => {
// // // //       try {
// // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // //         if (!existingRow)
// // // //           throw new Error("Learner record not found in local state.");

// // // //         const batch = writeBatch(db);
// // // //         const timestamp = new Date().toISOString();

// // // //         const auditRef = doc(collection(db, "audit_logs"));
// // // //         batch.set(auditRef, {
// // // //           action: "PERMANENT_DELETE",
// // // //           entityType: "LEARNER_ENROLLMENT",
// // // //           entityId: id,
// // // //           learnerName: existingRow.fullName,
// // // //           idNumber: existingRow.idNumber,
// // // //           cohortId: existingRow.cohortId,
// // // //           reason: audit.reason,
// // // //           deletedBy: audit.adminId,
// // // //           deletedByName: audit.adminName,
// // // //           deletedAt: timestamp,
// // // //           dataSnapshot: existingRow,
// // // //         });

// // // //         const enrolId = existingRow.enrollmentId || id;
// // // //         batch.delete(doc(db, "enrollments", enrolId));

// // // //         const humanId = existingRow.learnerId || id;
// // // //         batch.delete(doc(db, "learners", humanId));

// // // //         const subQ = query(
// // // //           collection(db, "learner_submissions"),
// // // //           where("enrollmentId", "==", enrolId),
// // // //         );
// // // //         const subSnap = await getDocs(subQ);
// // // //         subSnap.forEach((subDoc) => {
// // // //           batch.delete(subDoc.ref);
// // // //         });

// // // //         await batch.commit();

// // // //         set((state) => {
// // // //           state.learners = state.learners.filter((l) => l.id !== id);
// // // //         });
// // // //       } catch (error) {
// // // //         console.error("Failed to permanently delete learner:", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     restoreLearner: async (id: string) => {
// // // //       try {
// // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // //         if (!existingRow) return;

// // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // //         const enrolSnap = await getDoc(enrolRef);

// // // //         if (enrolSnap.exists()) {
// // // //           await updateDoc(enrolRef, { isArchived: false, updatedAt: now() });
// // // //         } else {
// // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // //             isArchived: false,
// // // //             updatedAt: now(),
// // // //           });
// // // //         }

// // // //         set((state) => {
// // // //           const idx = state.learners.findIndex((l) => l.id === id);
// // // //           if (idx !== -1) state.learners[idx].isArchived = false;
// // // //         });
// // // //       } catch (error) {
// // // //         console.error(error);
// // // //       }
// // // //     },

// // // //     archiveCohort: async (year: string) => {
// // // //       const { learners } = get();
// // // //       const batch = writeBatch(db);
// // // //       let count = 0;

// // // //       for (const l of learners) {
// // // //         const learnerYear = l.trainingStartDate
// // // //           ? l.trainingStartDate.substring(0, 4)
// // // //           : "";
// // // //         if (learnerYear === year && !l.isArchived) {
// // // //           const enrolRef = doc(db, "enrollments", l.enrollmentId);
// // // //           const enrolSnap = await getDoc(enrolRef);
// // // //           if (enrolSnap.exists()) {
// // // //             batch.update(enrolRef, { isArchived: true, updatedAt: now() });
// // // //           } else {
// // // //             batch.update(doc(db, "learners", l.learnerId), {
// // // //               isArchived: true,
// // // //               updatedAt: now(),
// // // //             });
// // // //           }
// // // //           count++;
// // // //         }
// // // //       }

// // // //       if (count > 0) {
// // // //         await batch.commit();
// // // //         set((state) => {
// // // //           state.learners.forEach((l) => {
// // // //             if (l.trainingStartDate?.startsWith(year)) l.isArchived = true;
// // // //           });
// // // //         });
// // // //         return { count };
// // // //       } else {
// // // //         return { count: 0 };
// // // //       }
// // // //     },

// // // //     // ==================== STAGING (DRAFTS) ====================
// // // //     stagingLearners: [],

// // // //     fetchStagingLearners: async () => {
// // // //       try {
// // // //         const q = query(
// // // //           collection(db, "staging_learners"),
// // // //           orderBy("fullName"),
// // // //         );
// // // //         const snapshot = await getDocs(q);
// // // //         const list = snapshot.docs.map(
// // // //           (doc) => ({ ...doc.data(), id: doc.id }) as DashboardLearner,
// // // //         );
// // // //         set((state) => {
// // // //           state.stagingLearners = list;
// // // //         });
// // // //       } catch (error) {
// // // //         console.error("Failed to fetch staging:", error);
// // // //       }
// // // //     },

// // // //     approveStagingLearners: async (learnersToApprove) => {
// // // //       set((state) => {
// // // //         state.learnersLoading = true;
// // // //       });
// // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       const functions = getFunctions();
// // // //       const createAccountFn = httpsCallable(functions, "createLearnerAccount");

// // // //       try {
// // // //         const batch = writeBatch(db);
// // // //         const approvedIds = new Set<string>();

// // // //         await Promise.all(
// // // //           learnersToApprove.map(async (l) => {
// // // //             try {
// // // //               const result = await createAccountFn({
// // // //                 email: l.email,
// // // //                 fullName: l.fullName,
// // // //                 role: "learner",
// // // //                 password: "TemporaryPassword123!",
// // // //               });
// // // //               const data = result.data as any;
// // // //               const authUid = data.uid || l.id;

// // // //               const profileData: any = { id: authUid };
// // // //               const enrollmentData: any = {};

// // // //               Object.keys(l).forEach((key) => {
// // // //                 if (PROFILE_KEYS.includes(key))
// // // //                   profileData[key] = (l as any)[key];
// // // //                 else enrollmentData[key] = (l as any)[key];
// // // //               });

// // // //               profileData.authStatus = "active";
// // // //               profileData.updatedAt = now();

// // // //               enrollmentData.learnerId = authUid;
// // // //               enrollmentData.isDraft = false;
// // // //               enrollmentData.status = "active";
// // // //               enrollmentData.approvedAt = now();
// // // //               enrollmentData.approvedBy = USER_ID;

// // // //               const profileRef = doc(db, "learners", authUid);
// // // //               batch.set(profileRef, profileData, { merge: true });

// // // //               const enrollmentRef = doc(collection(db, "enrollments"));
// // // //               batch.set(enrollmentRef, enrollmentData);

// // // //               const stagingRef = doc(db, "staging_learners", l.id);
// // // //               batch.delete(stagingRef);

// // // //               approvedIds.add(l.id);
// // // //             } catch (err) {
// // // //               console.error(`Failed to create account for ${l.email}`, err);
// // // //             }
// // // //           }),
// // // //         );

// // // //         await batch.commit();

// // // //         set((state) => {
// // // //           state.stagingLearners = state.stagingLearners.filter(
// // // //             (l) => !approvedIds.has(l.id),
// // // //           );
// // // //           state.learnersLoading = false;
// // // //         });

// // // //         await get().fetchLearners(true);
// // // //         // Note: The UI component calling this should show a success toast here!
// // // //       } catch (e) {
// // // //         console.error(e);
// // // //         set((state) => {
// // // //           state.learnersLoading = false;
// // // //         });
// // // //         throw new Error("Error during approval process.");
// // // //       }
// // // //     },

// // // //     inviteLearner: async (learner: DashboardLearner) => {
// // // //       set((state) => {
// // // //         state.learnersLoading = true;
// // // //       });

// // // //       try {
// // // //         const functions = getFunctions();
// // // //         const createAccountFn = httpsCallable(
// // // //           functions,
// // // //           "createLearnerAccount",
// // // //         );

// // // //         const result = await createAccountFn({
// // // //           email: learner.email,
// // // //           fullName: learner.fullName,
// // // //           role: "learner",
// // // //         });

// // // //         const data = result.data as any;

// // // //         if (data.success) {
// // // //           const learnerRef = doc(
// // // //             db,
// // // //             "learners",
// // // //             learner.learnerId || learner.id,
// // // //           );
// // // //           await updateDoc(learnerRef, {
// // // //             authStatus: "active",
// // // //             invitedAt: now(),
// // // //           });

// // // //           set((state) => {
// // // //             const idx = state.learners.findIndex((l) => l.id === learner.id);
// // // //             if (idx !== -1) state.learners[idx].authStatus = "active";
// // // //             state.learnersLoading = false;
// // // //           });
// // // //         } else {
// // // //           throw new Error(data.message || "Unknown error");
// // // //         }
// // // //       } catch (error: any) {
// // // //         console.error(error);
// // // //         set((state) => {
// // // //           state.learnersLoading = false;
// // // //         });
// // // //         if (error.message.includes("already exists")) {
// // // //           throw new Error("This user is already registered.");
// // // //         } else {
// // // //           throw new Error(`Failed to invite: ${error.message}`);
// // // //         }
// // // //       }
// // // //     },

// // // //     discardStagingLearners: async (ids) => {
// // // //       try {
// // // //         const batch = writeBatch(db);
// // // //         ids.forEach((id) => batch.delete(doc(db, "staging_learners", id)));
// // // //         await batch.commit();
// // // //         await get().fetchStagingLearners();
// // // //       } catch (e) {
// // // //         console.error(e);
// // // //       }
// // // //     },

// // // //     settings: null,

// // // //     fetchSettings: async () => {
// // // //       try {
// // // //         const docRef = doc(db, "system_settings", "global");
// // // //         const snap = await getDoc(docRef);
// // // //         if (snap.exists()) {
// // // //           set({ settings: snap.data() as SystemSettings });
// // // //         }
// // // //       } catch (error) {
// // // //         console.error("Error fetching system settings:", error);
// // // //       }
// // // //     },

// // // //     // ==================== PROGRAMMES SLICE ====================
// // // //     programmes: [],
// // // //     programmesLoading: false,
// // // //     programmesError: null,
// // // //     programmesLastFetched: null,

// // // //     fetchProgrammes: async (force = false) => {
// // // //       const { programmesLastFetched, programmesLoading } = get();
// // // //       if (
// // // //         !force &&
// // // //         programmesLastFetched &&
// // // //         Date.now() - programmesLastFetched < 5 * 60 * 1000
// // // //       )
// // // //         return;
// // // //       if (programmesLoading) return;

// // // //       set({ programmesLoading: true, programmesError: null });
// // // //       try {
// // // //         const q = query(collection(db, "programmes"), orderBy("name"));
// // // //         const snapshot = await getDocs(q);
// // // //         const programmes = snapshot.docs.map(
// // // //           (doc) => ({ id: doc.id, ...doc.data() }) as ProgrammeTemplate,
// // // //         );
// // // //         set({
// // // //           programmes,
// // // //           programmesLoading: false,
// // // //           programmesLastFetched: Date.now(),
// // // //         });
// // // //       } catch (error) {
// // // //         set({
// // // //           programmesError: (error as Error).message,
// // // //           programmesLoading: false,
// // // //         });
// // // //       }
// // // //     },

// // // //     addProgramme: async (programme) => {
// // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       try {
// // // //         const timestamp = now();
// // // //         const pAudit = {
// // // //           ...programme,
// // // //           createdAt: timestamp,
// // // //           createdBy: USER_ID,
// // // //           updatedAt: timestamp,
// // // //           updatedBy: USER_ID,
// // // //         };
// // // //         const docRef = await addDoc(collection(db, "programmes"), pAudit);
// // // //         set((state) => {
// // // //           state.programmes.push({
// // // //             ...pAudit,
// // // //             id: docRef.id,
// // // //           } as ProgrammeTemplate);
// // // //         });
// // // //       } catch (error) {
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     updateProgramme: async (id, updates) => {
// // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       try {
// // // //         const updatePayload = {
// // // //           ...updates,
// // // //           updatedAt: now(),
// // // //           updatedBy: USER_ID,
// // // //         };
// // // //         await updateDoc(doc(db, "programmes", id), updatePayload);
// // // //         set((state) => {
// // // //           const index = state.programmes.findIndex((p) => p.id === id);
// // // //           if (index !== -1)
// // // //             state.programmes[index] = {
// // // //               ...state.programmes[index],
// // // //               ...updatePayload,
// // // //             };
// // // //         });
// // // //       } catch (error) {
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     archiveProgramme: async (id) => {
// // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       try {
// // // //         await updateDoc(doc(db, "programmes", id), {
// // // //           isArchived: true,
// // // //           updatedAt: now(),
// // // //           updatedBy: USER_ID,
// // // //         });
// // // //         set((state) => {
// // // //           const index = state.programmes.findIndex((p) => p.id === id);
// // // //           if (index !== -1) state.programmes[index].isArchived = true;
// // // //         });
// // // //       } catch (error) {
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     // ==================== STAFF SLICE ====================
// // // //     staff: [],
// // // //     staffLoading: false,
// // // //     staffError: null,

// // // //     fetchStaff: async (force = false) => {
// // // //       const { staff, staffLoading } = get();
// // // //       if (!force && staff.length > 0) return;
// // // //       if (staffLoading) return;

// // // //       set({ staffLoading: true, staffError: null });
// // // //       try {
// // // //         const q = query(
// // // //           collection(db, "users"),
// // // //           where("role", "in", [
// // // //             "admin",
// // // //             "facilitator",
// // // //             "assessor",
// // // //             "moderator",
// // // //             "mentor",
// // // //           ]),
// // // //         );
// // // //         const snapshot = await getDocs(q);
// // // //         const staffList = snapshot.docs.map((doc) => {
// // // //           const data = doc.data();
// // // //           return {
// // // //             id: doc.id,
// // // //             fullName: data.fullName || "Unknown Staff",
// // // //             email: data.email,
// // // //             role: data.role,
// // // //             phone: data.phone,
// // // //             createdAt: data.createdAt || new Date().toISOString(),
// // // //             employerId: data.employerId,
// // // //             assessorRegNumber: data.assessorRegNumber,
// // // //             status: data.status || "active",
// // // //           } as StaffMember;
// // // //         });
// // // //         set({ staff: staffList, staffLoading: false });
// // // //       } catch (error) {
// // // //         set({ staffError: (error as Error).message, staffLoading: false });
// // // //       }
// // // //     },

// // // //     addStaff: async (newStaff) => {
// // // //       set({ staffLoading: true, staffError: null });
// // // //       try {
// // // //         const functions = getFunctions();
// // // //         const createStaffAccount = httpsCallable(
// // // //           functions,
// // // //           "createStaffAccount",
// // // //         );

// // // //         const result = await createStaffAccount({
// // // //           email: newStaff.email,
// // // //           fullName: newStaff.fullName,
// // // //           role: newStaff.role,
// // // //           phone: newStaff.phone || "",
// // // //           employerId: newStaff.employerId || "",
// // // //           assessorRegNumber: newStaff.assessorRegNumber || "",
// // // //         });

// // // //         const data = result.data as any;

// // // //         if (data.success) {
// // // //           const createdStaff = {
// // // //             ...newStaff,
// // // //             id: data.uid || "temp-id-" + Date.now(),
// // // //             createdAt: new Date().toISOString(),
// // // //             signatureUrl: "",
// // // //           } as StaffMember;

// // // //           set((state) => {
// // // //             state.staff.push(createdStaff);
// // // //             state.staffLoading = false;
// // // //           });
// // // //         }
// // // //       } catch (error: any) {
// // // //         let errorMessage = "Failed to create account.";
// // // //         if (error.code === "functions/permission-denied")
// // // //           errorMessage = "You do not have permission to create staff.";
// // // //         else if (error.code === "functions/already-exists")
// // // //           errorMessage = "A user with this email already exists.";
// // // //         else if (error.message) errorMessage = error.message;

// // // //         set({ staffLoading: false, staffError: errorMessage });
// // // //         throw new Error(errorMessage);
// // // //       }
// // // //     },

// // // //     updateStaff: async (id: string, updates: Partial<StaffMember>) => {
// // // //       try {
// // // //         const payload = { ...updates, updatedAt: now() };
// // // //         await updateDoc(doc(db, "users", id), payload);

// // // //         set((state) => {
// // // //           const index = state.staff.findIndex((s) => s.id === id);
// // // //           if (index !== -1) {
// // // //             state.staff[index] = { ...state.staff[index], ...payload };
// // // //           }
// // // //         });
// // // //       } catch (error) {
// // // //         console.error("Failed to update staff member", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     // deleteStaff: async (id) => {
// // // //     //   try {
// // // //     //     await deleteDoc(doc(db, "users", id));
// // // //     //     set((state) => {
// // // //     //       state.staff = state.staff.filter((s) => s.id !== id);
// // // //     //     });
// // // //     //   } catch (error) {
// // // //     //     throw error;
// // // //     //   }
// // // //     // },
// // // //     deleteStaff: async (id) => {
// // // //       try {
// // // //         const functions = getFunctions();
// // // //         const deleteStaffAccount = httpsCallable(
// // // //           functions,
// // // //           "deleteStaffAccount",
// // // //         );

// // // //         // Call the secure Cloud Function
// // // //         await deleteStaffAccount({ uid: id });

// // // //         // Remove them from the local UI state
// // // //         set((state) => {
// // // //           state.staff = state.staff.filter((s) => s.id !== id);
// // // //         });
// // // //       } catch (error: any) {
// // // //         console.error("Failed to delete staff member:", error);
// // // //         throw new Error(error.message || "Failed to delete staff account.");
// // // //       }
// // // //     },

// // // //     updateStaffProfile: async (uid: string, updates: any) => {
// // // //       try {
// // // //         await updateDoc(doc(db, "users", uid), {
// // // //           ...updates,
// // // //           updatedAt: now(),
// // // //         });
// // // //         set((state) => ({
// // // //           user: state.user ? { ...state.user, ...updates } : null,
// // // //         }));
// // // //       } catch (error) {
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     // ==================== IMPORTS ====================
// // // //     importUnifiedLearners: async (file: File) => {
// // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // //       return new Promise((resolve, reject) => {
// // // //         Papa.parse(file, {
// // // //           header: true,
// // // //           skipEmptyLines: true,
// // // //           transformHeader: (header) => header.trim(),
// // // //           complete: async (results) => {
// // // //             const rawData = results.data as any[];
// // // //             const errors: string[] = [];
// // // //             const learnersMap = new Map<string, any>();

// // // //             if (rawData.length === 0) {
// // // //               resolve({ success: 0, errors: ["CSV file is empty"] });
// // // //               return;
// // // //             }

// // // //             rawData.forEach((row, index) => {
// // // //               try {
// // // //                 const getStr = (val: any): string =>
// // // //                   val !== null && val !== undefined ? String(val).trim() : "";
// // // //                 const idNumber = getStr(row.NationalId || row.ID_Number);

// // // //                 const issueDateStr =
// // // //                   getStr(row.StatementofResultsIssueDate) ||
// // // //                   now().split("T")[0];
// // // //                 const providerCode =
// // // //                   getStr(row.SDPCode) ||
// // // //                   import.meta.env.VITE_SDP_CODE ||
// // // //                   "SDP070824115131";

// // // //                 if (!idNumber) return;

// // // //                 if (!learnersMap.has(idNumber)) {
// // // //                   const firstName = getStr(row.LearnerFirstName);
// // // //                   const lastName = getStr(row.LearnerLastName);
// // // //                   const middleName = getStr(row.LearnerMiddleName);
// // // //                   let fullName =
// // // //                     firstName || lastName
// // // //                       ? `${firstName} ${middleName} ${lastName}`
// // // //                           .replace(/\s+/g, " ")
// // // //                           .trim()
// // // //                       : getStr(row.Full_Name) || "Unknown Learner";

// // // //                   const parseYYYYMMDD = (val: string) => {
// // // //                     if (val.length === 8 && /^\d+$/.test(val)) {
// // // //                       return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
// // // //                     }
// // // //                     return val;
// // // //                   };

// // // //                   const newLearner = {
// // // //                     fullName,
// // // //                     idNumber,
// // // //                     dateOfBirth: parseYYYYMMDD(
// // // //                       getStr(row.LearnerBirthDate || row.Date_Of_Birth),
// // // //                     ),
// // // //                     email: getStr(row.LearnerEmailAddress || row.Email),
// // // //                     phone: getStr(
// // // //                       row.LearnerCellPhoneNumber ||
// // // //                         row.Phone ||
// // // //                         row.LearnerPhoneNumber,
// // // //                     ),
// // // //                     trainingStartDate: getStr(
// // // //                       row.TrainingStartDate || row.Training_Start_Date,
// // // //                     )
// // // //                       ? parseYYYYMMDD(
// // // //                           getStr(
// // // //                             row.TrainingStartDate || row.Training_Start_Date,
// // // //                           ),
// // // //                         )
// // // //                       : now().split("T")[0],
// // // //                     isArchived: false,
// // // //                     isDraft: true,
// // // //                     qualification: {
// // // //                       name: getStr(
// // // //                         row.Programme_Name || row.Qualification_Name,
// // // //                       ),
// // // //                       saqaId: getStr(row.QualificationId || row.SAQA_ID),
// // // //                       credits:
// // // //                         parseInt(getStr(row.Total_Credits || row.Credits)) || 0,
// // // //                       totalNotionalHours:
// // // //                         (parseInt(getStr(row.Total_Credits || row.Credits)) ||
// // // //                           0) * 10,
// // // //                       nqfLevel: parseInt(getStr(row.NQF_Level)) || 0,
// // // //                       dateAssessed: "",
// // // //                     },
// // // //                     knowledgeModules: [],
// // // //                     practicalModules: [],
// // // //                     workExperienceModules: [],
// // // //                     eisaAdmission:
// // // //                       getStr(row.LearnerReadinessforEISATypeId) === "01" ||
// // // //                       getStr(row.EISA_Admission).toLowerCase() === "yes",

// // // //                     verificationCode:
// // // //                       getStr(row.Verification_Code) ||
// // // //                       generateSorId(fullName, issueDateStr, providerCode),
// // // //                     issueDate: issueDateStr,

// // // //                     status: "in-progress",
// // // //                     demographics: {
// // // //                       sdpCode: getStr(row.SDPCode),
// // // //                     },
// // // //                     createdAt: now(),
// // // //                     createdBy: USER_ID,
// // // //                   };
// // // //                   learnersMap.set(idNumber, newLearner);
// // // //                 }
// // // //               } catch (err) {
// // // //                 errors.push(
// // // //                   `Row ${index + 2} Error: ${(err as Error).message}`,
// // // //                 );
// // // //               }
// // // //             });

// // // //             try {
// // // //               const batch = writeBatch(db);
// // // //               learnersMap.forEach((learner) => {
// // // //                 batch.set(
// // // //                   doc(db, "staging_learners", learner.idNumber),
// // // //                   learner,
// // // //                 );
// // // //               });
// // // //               await batch.commit();
// // // //               await get().fetchStagingLearners();
// // // //               resolve({ success: learnersMap.size, errors });
// // // //             } catch (error) {
// // // //               reject(error);
// // // //             }
// // // //           },
// // // //           error: (error) => reject(error),
// // // //         });
// // // //       });
// // // //     },

// // // //     importProgrammesFromCSV: async (file: File) => {
// // // //       return { success: 0, errors: [] } as any;
// // // //     },

// // // //     dropLearner: async (id, reason) => {
// // // //       try {
// // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // //         if (!existingRow) return;

// // // //         const timestamp = now();
// // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // //         const enrolSnap = await getDoc(enrolRef);

// // // //         if (enrolSnap.exists()) {
// // // //           await updateDoc(enrolRef, {
// // // //             status: "dropped",
// // // //             exitReason: reason,
// // // //             exitDate: timestamp,
// // // //             updatedAt: timestamp,
// // // //           });
// // // //         } else {
// // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // //             status: "dropped",
// // // //             exitReason: reason,
// // // //             exitDate: timestamp,
// // // //             updatedAt: timestamp,
// // // //           });
// // // //         }

// // // //         set((state) => {
// // // //           const index = state.learners.findIndex((l) => l.id === id);
// // // //           if (index !== -1) {
// // // //             state.learners[index].status = "dropped";
// // // //             state.learners[index].exitReason = reason;
// // // //             state.learners[index].exitDate = timestamp;
// // // //           }
// // // //         });
// // // //       } catch (error) {
// // // //         console.error("Failed to drop learner", error);
// // // //         throw error;
// // // //       }
// // // //     },

// // // //     updateLearnerPlacement: async (targetId, employerId, mentorId) => {
// // // //       try {
// // // //         const payload = {
// // // //           employerId,
// // // //           mentorId,
// // // //           placementDate: now(),
// // // //           updatedAt: now(),
// // // //         };

// // // //         await setDoc(doc(db, "enrollments", targetId), payload, {
// // // //           merge: true,
// // // //         });
// // // //         await setDoc(doc(db, "learners", targetId), payload, { merge: true });

// // // //         const existingLearner = get().learners.find(
// // // //           (l) => l.enrollmentId === targetId || l.id === targetId,
// // // //         );
// // // //         const humanId =
// // // //           existingLearner?.learnerId || existingLearner?.id || targetId;

// // // //         const q = query(
// // // //           collection(db, "learner_submissions"),
// // // //           where("learnerId", "==", humanId),
// // // //           where("moduleType", "in", ["workplace", "qcto_workplace"]),
// // // //         );
// // // //         const submissionSnap = await getDocs(q);

// // // //         if (!submissionSnap.empty) {
// // // //           const batch = writeBatch(db);
// // // //           submissionSnap.forEach((docSnap) => {
// // // //             batch.update(docSnap.ref, {
// // // //               employerId: employerId,
// // // //               mentorId: mentorId,
// // // //               updatedAt: now(),
// // // //             });
// // // //           });
// // // //           await batch.commit();
// // // //         }

// // // //         await get().fetchLearners(true);
// // // //         if (get().fetchSubmissions) await get().fetchSubmissions();
// // // //       } catch (error: any) {
// // // //         console.error("Failed to update placement in Firebase:", error);
// // // //         throw new Error(error.message);
// // // //       }
// // // //     },
// // // //   })),
// // // // );

// // // // // // src/store/useStore.ts

// // // // // import { create } from "zustand";
// // // // // import { immer } from "zustand/middleware/immer";
// // // // // import { db } from "../lib/firebase";
// // // // // import { getFunctions, httpsCallable } from "firebase/functions";
// // // // // import {
// // // // //   collection,
// // // // //   doc,
// // // // //   getDocs,
// // // // //   addDoc,
// // // // //   updateDoc,
// // // // //   deleteDoc,
// // // // //   query,
// // // // //   orderBy,
// // // // //   where,
// // // // //   writeBatch,
// // // // //   getDoc,
// // // // //   setDoc,
// // // // //   arrayUnion,
// // // // // } from "firebase/firestore";
// // // // // import Papa from "papaparse";
// // // // // import type {
// // // // //   DashboardLearner,
// // // // //   ProgrammeTemplate,
// // // // //   Employer,
// // // // //   SystemSettings,
// // // // // } from "../types";
// // // // // import type { UserProfile } from "../types/auth.types";
// // // // // import { getAuth } from "firebase/auth";
// // // // // import {
// // // // //   createCohortSlice,
// // // // //   type CohortSlice,
// // // // // } from "./slices/cohortSlice.ts/cohortSlice";
// // // // // import { generateSorId } from "../pages/utils/validation";

// // // // // const now = () => new Date().toISOString();

// // // // // export interface EnrollmentRecord {
// // // // //   cohortId: string;
// // // // //   programmeId: string;
// // // // //   status: "active" | "dropped" | "completed";
// // // // //   dateAssigned: string;
// // // // //   exitDate?: string | null;
// // // // //   exitReason?: string;
// // // // // }

// // // // // export interface StaffMember {
// // // // //   id: string;
// // // // //   fullName: string;
// // // // //   email: string;
// // // // //   role: "admin" | "facilitator" | "assessor" | "moderator" | "mentor";
// // // // //   phone?: string;
// // // // //   authUid: string;
// // // // //   assessorRegNumber?: string;
// // // // //   employerId?: string;
// // // // //   status?: "active" | "archived";
// // // // //   createdAt?: string;
// // // // //   updatedAt?: string;
// // // // // }

// // // // // export interface AttendanceRecord {
// // // // //   id?: string;
// // // // //   cohortId: string;
// // // // //   date: string;
// // // // //   facilitatorId: string;
// // // // //   presentLearners: string[];
// // // // //   notes?: string;
// // // // // }

// // // // // const PROFILE_KEYS = [
// // // // //   "fullName",
// // // // //   "firstName",
// // // // //   "lastName",
// // // // //   "idNumber",
// // // // //   "dateOfBirth",
// // // // //   "email",
// // // // //   "phone",
// // // // //   "mobile",
// // // // //   "profilePhotoUrl",
// // // // //   "profileCompleted",
// // // // //   "authUid",
// // // // //   "uid",
// // // // //   "authStatus",
// // // // //   "demographics",
// // // // // ];

// // // // // interface StoreState extends CohortSlice {
// // // // //   user: UserProfile | null;
// // // // //   loading: boolean;
// // // // //   setUser: (user: UserProfile | null) => void;
// // // // //   setLoading: (loading: boolean) => void;
// // // // //   refreshUser: () => Promise<void>;

// // // // //   // --- LEARNERS SLICE ---
// // // // //   learners: DashboardLearner[];
// // // // //   stagingLearners: DashboardLearner[];
// // // // //   learnersLoading: boolean;
// // // // //   learnersError: string | null;
// // // // //   learnersLastFetched: number | null;

// // // // //   clearUser: () => void;

// // // // //   fetchLearners: (force?: boolean) => Promise<void>;
// // // // //   fetchStagingLearners: () => Promise<void>;

// // // // //   approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
// // // // //   inviteLearner: (learner: DashboardLearner) => Promise<void>;
// // // // //   discardStagingLearners: (ids: string[]) => Promise<void>;

// // // // //   settings: SystemSettings | null;
// // // // //   fetchSettings: () => Promise<void>;

// // // // //   addLearner: (
// // // // //     learner: Omit<
// // // // //       DashboardLearner,
// // // // //       | "id"
// // // // //       | "learnerId"
// // // // //       | "enrollmentId"
// // // // //       | "createdAt"
// // // // //       | "createdBy"
// // // // //       | "updatedAt"
// // // // //       | "updatedBy"
// // // // //     >,
// // // // //   ) => Promise<void>;
// // // // //   updateLearner: (
// // // // //     id: string,
// // // // //     updates: Partial<DashboardLearner>,
// // // // //   ) => Promise<void>;
// // // // //   archiveLearner: (id: string) => Promise<void>;
// // // // //   deleteLearnerPermanent: (
// // // // //     id: string,
// // // // //     audit: { reason: string; adminId: string; adminName: string },
// // // // //   ) => Promise<void>;
// // // // //   restoreLearner: (id: string) => Promise<void>;
// // // // //   dropLearner: (id: string, reason: string) => Promise<void>;
// // // // //   archiveCohort: (year: string) => Promise<void>;

// // // // //   // RELATIONAL ACTIONS
// // // // //   enrollLearnerInCohort: (
// // // // //     learnerId: string,
// // // // //     cohortId: string,
// // // // //     programmeId: string,
// // // // //   ) => Promise<void>;
// // // // //   dropLearnerFromCohort: (
// // // // //     learnerId: string,
// // // // //     cohortId: string,
// // // // //     reason: string,
// // // // //   ) => Promise<void>;

// // // // //   // --- PROGRAMMES SLICE ---
// // // // //   programmes: ProgrammeTemplate[];
// // // // //   programmesLoading: boolean;
// // // // //   programmesError: string | null;
// // // // //   programmesLastFetched: number | null;
// // // // //   fetchProgrammes: (force?: boolean) => Promise<void>;
// // // // //   addProgramme: (
// // // // //     programme: Omit<
// // // // //       ProgrammeTemplate,
// // // // //       "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
// // // // //     >,
// // // // //   ) => Promise<void>;
// // // // //   updateProgramme: (
// // // // //     id: string,
// // // // //     updates: Partial<ProgrammeTemplate>,
// // // // //   ) => Promise<void>;
// // // // //   archiveProgramme: (id: string) => Promise<void>;

// // // // //   // --- STAFF SLICE ---
// // // // //   staff: StaffMember[];
// // // // //   staffLoading: boolean;
// // // // //   staffError: string | null;
// // // // //   fetchStaff: (force?: boolean) => Promise<void>;
// // // // //   addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
// // // // //   updateStaff: (id: string, updates: Partial<StaffMember>) => Promise<void>; // 🚀 Added missing interface
// // // // //   deleteStaff: (id: string) => Promise<void>;
// // // // //   updateStaffProfile: (uid: string, updates: any) => Promise<void>;

// // // // //   // --- BULK IMPORT ACTIONS ---
// // // // //   importUnifiedLearners: (
// // // // //     file: File,
// // // // //   ) => Promise<{ success: number; errors: string[] }>;
// // // // //   importProgrammesFromCSV: (
// // // // //     file: File,
// // // // //   ) => Promise<{ success: number; errors: string[] }>;

// // // // //   assignAssessmentToLearner: (
// // // // //     assessmentTemplate: any,
// // // // //     learner: DashboardLearner,
// // // // //   ) => Promise<string>;

// // // // //   employers: Employer[];
// // // // //   fetchEmployers: () => Promise<void>;

// // // // //   updateLearnerPlacement: (
// // // // //     enrollmentId: string,
// // // // //     employerId: string,
// // // // //     mentorId: string,
// // // // //   ) => Promise<void>;

// // // // //   // --- WORKPLACE MENTOR DATA ---
// // // // //   assessments: any[];
// // // // //   submissions: any[];
// // // // //   enrollments: any[];
// // // // //   fetchAssessments: () => Promise<void>;
// // // // //   fetchSubmissions: () => Promise<void>;
// // // // //   fetchEnrollments: () => Promise<void>;

// // // // //   // AD-HOC CERTIFICATE STUDIO HISTORY
// // // // //   adHocCertificates: any[];
// // // // //   fetchAdHocCertificates: (force?: boolean) => Promise<void>;

// // // // //   certificateGroups: any[];
// // // // //   fetchCertificateGroups: (force?: boolean) => Promise<void>;
// // // // //   createCertificateGroup: (name: string) => Promise<void>;

// // // // //   renameCertificateGroup: (id: string, newName: string) => Promise<void>;
// // // // // }

// // // // // export const useStore = create<StoreState>()(
// // // // //   immer((set, get, api) => ({
// // // // //     ...createCohortSlice(set, get, api),

// // // // //     user: null,
// // // // //     loading: true,
// // // // //     setUser: (user) => set({ user }),
// // // // //     setLoading: (loading) => set({ loading }),

// // // // //     clearUser: () => set({ user: null }),

// // // // //     refreshUser: async () => {
// // // // //       const currentUser = get().user;
// // // // //       if (!currentUser?.uid) return;
// // // // //       try {
// // // // //         const userDoc = await getDoc(doc(db, "users", currentUser.uid));
// // // // //         if (userDoc.exists()) {
// // // // //           const data = userDoc.data();
// // // // //           const updatedProfile: UserProfile = {
// // // // //             ...currentUser,
// // // // //             fullName: data.fullName || currentUser.fullName,
// // // // //             role: data.role || currentUser.role,
// // // // //             profileCompleted: data.profileCompleted === true,
// // // // //           };
// // // // //           set({ user: updatedProfile });
// // // // //         }
// // // // //       } catch (error) {
// // // // //         console.error("Store: Failed to refresh user data", error);
// // // // //       }
// // // // //     },

// // // // //     // AD-HOC CERTIFICATE STUDIO HISTORY FETCH
// // // // //     adHocCertificates: [],
// // // // //     fetchAdHocCertificates: async (force = false) => {
// // // // //       const { adHocCertificates } = get();
// // // // //       if (!force && adHocCertificates.length > 0) return;

// // // // //       try {
// // // // //         const q = query(
// // // // //           collection(db, "ad_hoc_certificates"),
// // // // //           orderBy("createdAt", "desc"),
// // // // //         );
// // // // //         const snap = await getDocs(q);
// // // // //         const history = snap.docs.map((doc) => ({
// // // // //           id: doc.id,
// // // // //           ...doc.data(),
// // // // //         }));
// // // // //         set({ adHocCertificates: history });
// // // // //       } catch (error) {
// // // // //         console.error("Failed to load ad-hoc certificates:", error);
// // // // //       }
// // // // //     },
// // // // //     certificateGroups: [],
// // // // //     fetchCertificateGroups: async (force = false) => {
// // // // //       const { certificateGroups } = get();
// // // // //       if (!force && certificateGroups.length > 0) return;

// // // // //       try {
// // // // //         const q = query(
// // // // //           collection(db, "certificate_groups"),
// // // // //           orderBy("createdAt", "desc"),
// // // // //         );
// // // // //         const snap = await getDocs(q);
// // // // //         set({
// // // // //           certificateGroups: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error("Group Fetch Error:", error);
// // // // //       }
// // // // //     },
// // // // //     createCertificateGroup: async (name: string) => {
// // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       try {
// // // // //         await addDoc(collection(db, "certificate_groups"), {
// // // // //           name,
// // // // //           createdBy: USER_ID,
// // // // //           createdAt: new Date().toISOString(),
// // // // //         });
// // // // //         await get().fetchCertificateGroups(true);
// // // // //       } catch (error) {
// // // // //         console.error("Failed to create folder", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },
// // // // //     renameCertificateGroup: async (id: string, newName: string) => {
// // // // //       try {
// // // // //         await updateDoc(doc(db, "certificate_groups", id), {
// // // // //           name: newName,
// // // // //           updatedAt: new Date().toISOString(),
// // // // //         });
// // // // //         await get().fetchCertificateGroups(true);
// // // // //       } catch (error) {
// // // // //         console.error("Failed to rename folder", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     // --- MENTOR DATA FETCHERS ---
// // // // //     assessments: [],
// // // // //     submissions: [],
// // // // //     enrollments: [],

// // // // //     fetchAssessments: async () => {
// // // // //       try {
// // // // //         const snap = await getDocs(collection(db, "assessments"));
// // // // //         set({ assessments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // // //       } catch (e) {
// // // // //         console.error(e);
// // // // //       }
// // // // //     },

// // // // //     fetchSubmissions: async () => {
// // // // //       try {
// // // // //         const snap = await getDocs(collection(db, "learner_submissions"));
// // // // //         set({ submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // // //       } catch (e) {
// // // // //         console.error(e);
// // // // //       }
// // // // //     },

// // // // //     fetchEnrollments: async () => {
// // // // //       try {
// // // // //         const snap = await getDocs(collection(db, "enrollments"));
// // // // //         set({ enrollments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // // //       } catch (e) {
// // // // //         console.error(e);
// // // // //       }
// // // // //     },

// // // // //     // ==================== EMPLOYERS SLICE ====================
// // // // //     employers: [],
// // // // //     fetchEmployers: async () => {
// // // // //       try {
// // // // //         const querySnapshot = await getDocs(collection(db, "employers"));
// // // // //         const employersData = querySnapshot.docs.map((doc) => ({
// // // // //           id: doc.id,
// // // // //           ...doc.data(),
// // // // //         })) as Employer[];

// // // // //         employersData.sort((a, b) => a.name.localeCompare(b.name));
// // // // //         set({ employers: employersData });
// // // // //       } catch (error) {
// // // // //         console.error("Error fetching employers:", error);
// // // // //       }
// // // // //     },

// // // // //     // ==================== LEARNERS SLICE ====================
// // // // //     learners: [],
// // // // //     learnersLoading: false,
// // // // //     learnersError: null,
// // // // //     learnersLastFetched: null,

// // // // //     fetchLearners: async (force = false) => {
// // // // //       const { learnersLastFetched, learnersLoading } = get();

// // // // //       if (
// // // // //         !force &&
// // // // //         learnersLastFetched &&
// // // // //         Date.now() - learnersLastFetched < 5 * 60 * 1000
// // // // //       )
// // // // //         return;
// // // // //       if (learnersLoading) return;

// // // // //       set({ learnersLoading: true, learnersError: null });
// // // // //       try {
// // // // //         const profilesSnap = await getDocs(query(collection(db, "learners")));
// // // // //         const profilesMap = new Map<string, any>();

// // // // //         profilesSnap.docs.forEach((doc) => {
// // // // //           profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
// // // // //         });

// // // // //         const enrollmentsSnap = await getDocs(
// // // // //           query(collection(db, "enrollments")),
// // // // //         );
// // // // //         const combinedLearners: DashboardLearner[] = [];
// // // // //         const usedProfileIds = new Set<string>();

// // // // //         enrollmentsSnap.docs.forEach((docSnap) => {
// // // // //           const enrollment = docSnap.data();
// // // // //           const profile = profilesMap.get(enrollment.learnerId);

// // // // //           if (profile) {
// // // // //             usedProfileIds.add(profile.id);
// // // // //             combinedLearners.push({
// // // // //               ...profile,
// // // // //               ...enrollment,
// // // // //               id: docSnap.id,
// // // // //               enrollmentId: docSnap.id,
// // // // //               learnerId: profile.id,
// // // // //             } as DashboardLearner);
// // // // //           }
// // // // //         });

// // // // //         profilesMap.forEach((profile, profileId) => {
// // // // //           if (!usedProfileIds.has(profileId) && profile.cohortId) {
// // // // //             combinedLearners.push({
// // // // //               ...profile,
// // // // //               id: profileId,
// // // // //               enrollmentId: profileId,
// // // // //               learnerId: profileId,
// // // // //             } as DashboardLearner);
// // // // //           }
// // // // //         });

// // // // //         combinedLearners.sort((a, b) =>
// // // // //           (a.fullName || "").localeCompare(b.fullName || ""),
// // // // //         );

// // // // //         set({
// // // // //           learners: combinedLearners,
// // // // //           learnersLoading: false,
// // // // //           learnersLastFetched: Date.now(),
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error("Fetch error:", error);
// // // // //         set({
// // // // //           learnersError: (error as Error).message,
// // // // //           learnersLoading: false,
// // // // //         });
// // // // //       }
// // // // //     },

// // // // //     addLearner: async (payload) => {
// // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       try {
// // // // //         const timestamp = now();
// // // // //         const profileData: any = {};
// // // // //         const enrollmentData: any = {};

// // // // //         Object.keys(payload).forEach((key) => {
// // // // //           if (PROFILE_KEYS.includes(key))
// // // // //             profileData[key] = (payload as any)[key];
// // // // //           else enrollmentData[key] = (payload as any)[key];
// // // // //         });

// // // // //         profileData.createdAt = timestamp;
// // // // //         profileData.createdBy = USER_ID;

// // // // //         enrollmentData.createdAt = timestamp;
// // // // //         enrollmentData.createdBy = USER_ID;
// // // // //         enrollmentData.isDraft = false;
// // // // //         enrollmentData.isArchived = false;
// // // // //         enrollmentData.status = "in-progress";

// // // // //         if (!enrollmentData.verificationCode) {
// // // // //           const issueDate = enrollmentData.issueDate || timestamp.split("T")[0];
// // // // //           const name = profileData.fullName || "Unknown Learner";
// // // // //           const providerCode =
// // // // //             import.meta.env.VITE_SDP_CODE || "SDP070824115131";

// // // // //           enrollmentData.verificationCode = generateSorId(
// // // // //             name,
// // // // //             issueDate,
// // // // //             providerCode,
// // // // //           );
// // // // //           enrollmentData.issueDate = issueDate;
// // // // //         }

// // // // //         let finalLearnerId = "";

// // // // //         const q = query(
// // // // //           collection(db, "learners"),
// // // // //           where("idNumber", "==", profileData.idNumber),
// // // // //         );
// // // // //         const existingSnap = await getDocs(q);

// // // // //         if (!existingSnap.empty) {
// // // // //           finalLearnerId = existingSnap.docs[0].id;
// // // // //           await updateDoc(doc(db, "learners", finalLearnerId), {
// // // // //             ...profileData,
// // // // //             updatedAt: timestamp,
// // // // //           });
// // // // //         } else {
// // // // //           const newProfileRef = await addDoc(
// // // // //             collection(db, "learners"),
// // // // //             profileData,
// // // // //           );
// // // // //           finalLearnerId = newProfileRef.id;
// // // // //         }

// // // // //         enrollmentData.learnerId = finalLearnerId;
// // // // //         const newEnrollmentRef = await addDoc(
// // // // //           collection(db, "enrollments"),
// // // // //           enrollmentData,
// // // // //         );

// // // // //         set((state) => {
// // // // //           state.learners.push({
// // // // //             ...profileData,
// // // // //             ...enrollmentData,
// // // // //             id: newEnrollmentRef.id,
// // // // //             enrollmentId: newEnrollmentRef.id,
// // // // //             learnerId: finalLearnerId,
// // // // //           } as DashboardLearner);
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error("Failed to add learner", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     updateLearner: async (id, updates) => {
// // // // //       const CURRENT_USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       try {
// // // // //         const existingRow = get().learners.find((l) => l.id === id);

// // // // //         // BYPASS: If no record in local array (e.g. Learner portal), default to provided id
// // // // //         const learnerId = existingRow?.learnerId || id;
// // // // //         const enrollmentId = existingRow?.enrollmentId || null;

// // // // //         const profileUpdates: any = {
// // // // //           updatedAt: now(),
// // // // //           updatedBy: CURRENT_USER_ID,
// // // // //         };
// // // // //         const enrollmentUpdates: any = {
// // // // //           updatedAt: now(),
// // // // //           updatedBy: CURRENT_USER_ID,
// // // // //         };
// // // // //         let hasProfileUpdate = false;
// // // // //         let hasEnrollmentUpdate = false;

// // // // //         Object.keys(updates).forEach((key) => {
// // // // //           if (PROFILE_KEYS.includes(key)) {
// // // // //             profileUpdates[key] = (updates as any)[key];
// // // // //             hasProfileUpdate = true;
// // // // //           } else {
// // // // //             enrollmentUpdates[key] = (updates as any)[key];
// // // // //             hasEnrollmentUpdate = true;
// // // // //           }
// // // // //         });

// // // // //         const batch = writeBatch(db);

// // // // //         if (hasProfileUpdate && learnerId) {
// // // // //           batch.update(doc(db, "learners", learnerId), profileUpdates);
// // // // //         }

// // // // //         if (hasEnrollmentUpdate) {
// // // // //           if (enrollmentId) {
// // // // //             const enrolRef = doc(db, "enrollments", enrollmentId);
// // // // //             const enrolSnap = await getDoc(enrolRef);
// // // // //             if (enrolSnap.exists()) {
// // // // //               batch.update(enrolRef, enrollmentUpdates);
// // // // //             } else {
// // // // //               batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
// // // // //             }
// // // // //           } else {
// // // // //             // Fallback for learners updating their own profile without local enrollment mapping
// // // // //             batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
// // // // //           }
// // // // //         }

// // // // //         await batch.commit();

// // // // //         set((state) => {
// // // // //           // Attempt to update the array if they exist in it
// // // // //           const index = state.learners.findIndex((l) => l.id === id);
// // // // //           if (index !== -1) {
// // // // //             state.learners[index] = { ...state.learners[index], ...updates };
// // // // //           }
// // // // //           // Also update the global user object if the person editing is themselves
// // // // //           if (state.user && state.user.uid === learnerId) {
// // // // //             state.user = { ...state.user, ...updates };
// // // // //           }
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error("Failed to update learner", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     enrollLearnerInCohort: async (
// // // // //       learnerId: string,
// // // // //       cohortId: string,
// // // // //       programmeId: string,
// // // // //     ) => {
// // // // //       try {
// // // // //         const newEnrollment: EnrollmentRecord = {
// // // // //           cohortId,
// // // // //           programmeId,
// // // // //           status: "active",
// // // // //           dateAssigned: now(),
// // // // //         };

// // // // //         const learnerRef = doc(db, "learners", learnerId);
// // // // //         const learnerSnap = await getDoc(learnerRef);

// // // // //         if (learnerSnap.exists()) {
// // // // //           const data = learnerSnap.data();
// // // // //           const history = data.enrollmentHistory || [];

// // // // //           const filteredHistory = history.filter(
// // // // //             (h: any) => h.cohortId !== cohortId,
// // // // //           );
// // // // //           filteredHistory.push(newEnrollment);

// // // // //           await updateDoc(learnerRef, {
// // // // //             enrollmentHistory: filteredHistory,
// // // // //             cohortId: cohortId,
// // // // //             updatedAt: now(),
// // // // //           });
// // // // //         }

// // // // //         const cohortRef = doc(db, "cohorts", cohortId);
// // // // //         await updateDoc(cohortRef, {
// // // // //           learnerIds: arrayUnion(learnerId),
// // // // //         });

// // // // //         await get().fetchLearners(true);
// // // // //         if ((get() as any).fetchCohorts) {
// // // // //           await (get() as any).fetchCohorts();
// // // // //         }
// // // // //       } catch (error) {
// // // // //         console.error("Error enrolling learner:", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     dropLearnerFromCohort: async (
// // // // //       learnerId: string,
// // // // //       cohortId: string,
// // // // //       reason: string,
// // // // //     ) => {
// // // // //       try {
// // // // //         const learnerRef = doc(db, "learners", learnerId);
// // // // //         const learnerSnap = await getDoc(learnerRef);

// // // // //         if (learnerSnap.exists()) {
// // // // //           const data = learnerSnap.data();
// // // // //           const history = data.enrollmentHistory || [];

// // // // //           const updatedHistory = history.map((h: any) => {
// // // // //             if (h.cohortId === cohortId) {
// // // // //               return {
// // // // //                 ...h,
// // // // //                 status: "dropped",
// // // // //                 exitDate: now(),
// // // // //                 exitReason: reason,
// // // // //               };
// // // // //             }
// // // // //             return h;
// // // // //           });

// // // // //           await updateDoc(learnerRef, {
// // // // //             enrollmentHistory: updatedHistory,
// // // // //             status: "dropped",
// // // // //             updatedAt: now(),
// // // // //           });

// // // // //           await get().fetchLearners(true);
// // // // //         }
// // // // //       } catch (error) {
// // // // //         console.error("Error dropping learner from cohort:", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     assignAssessmentToLearner: async (assessmentTemplate, learner) => {
// // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       try {
// // // // //         const timestamp = now();
// // // // //         const targetCohortId = learner.cohortId || "Unassigned";
// // // // //         const targetHumanId = learner.learnerId || learner.id;

// // // // //         const submissionData: any = {
// // // // //           assessmentId: assessmentTemplate.id,
// // // // //           title: assessmentTemplate.title,
// // // // //           type: assessmentTemplate.type,
// // // // //           moduleType: assessmentTemplate.moduleType || "knowledge",
// // // // //           moduleNumber: assessmentTemplate.moduleNumber || "",
// // // // //           learnerId: targetHumanId,
// // // // //           enrollmentId: learner.enrollmentId || learner.id,
// // // // //           cohortId: targetCohortId,
// // // // //           qualificationName: learner.qualification?.name || "",
// // // // //           status: "not_started",
// // // // //           assignedAt: timestamp,
// // // // //           marks: 0,
// // // // //           totalMarks: assessmentTemplate.totalMarks || 0,
// // // // //           createdAt: timestamp,
// // // // //           createdBy: USER_ID,
// // // // //         };

// // // // //         if (
// // // // //           assessmentTemplate.moduleType === "workplace" ||
// // // // //           assessmentTemplate.moduleType === "qcto_workplace"
// // // // //         ) {
// // // // //           if (learner.mentorId) submissionData.mentorId = learner.mentorId;
// // // // //           if (learner.employerId)
// // // // //             submissionData.employerId = learner.employerId;
// // // // //         }

// // // // //         const customId = `${targetCohortId}_${targetHumanId}_${assessmentTemplate.id}`;

// // // // //         await setDoc(doc(db, "learner_submissions", customId), submissionData, {
// // // // //           merge: true,
// // // // //         });

// // // // //         return customId;
// // // // //       } catch (error) {
// // // // //         console.error("Assignment error:", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     archiveLearner: async (id: string) => {
// // // // //       try {
// // // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // // //         if (!existingRow) return;

// // // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // // //         const enrolSnap = await getDoc(enrolRef);

// // // // //         if (enrolSnap.exists()) {
// // // // //           await updateDoc(enrolRef, { isArchived: true, updatedAt: now() });
// // // // //         } else {
// // // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // // //             isArchived: true,
// // // // //             updatedAt: now(),
// // // // //           });
// // // // //         }

// // // // //         set((state) => {
// // // // //           const idx = state.learners.findIndex((l) => l.id === id);
// // // // //           if (idx !== -1) state.learners[idx].isArchived = true;
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error(error);
// // // // //       }
// // // // //     },

// // // // //     deleteLearnerPermanent: async (id, audit) => {
// // // // //       try {
// // // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // // //         if (!existingRow)
// // // // //           throw new Error("Learner record not found in local state.");

// // // // //         const batch = writeBatch(db);
// // // // //         const timestamp = new Date().toISOString();

// // // // //         const auditRef = doc(collection(db, "audit_logs"));
// // // // //         batch.set(auditRef, {
// // // // //           action: "PERMANENT_DELETE",
// // // // //           entityType: "LEARNER_ENROLLMENT",
// // // // //           entityId: id,
// // // // //           learnerName: existingRow.fullName,
// // // // //           idNumber: existingRow.idNumber,
// // // // //           cohortId: existingRow.cohortId,
// // // // //           reason: audit.reason,
// // // // //           deletedBy: audit.adminId,
// // // // //           deletedByName: audit.adminName,
// // // // //           deletedAt: timestamp,
// // // // //           dataSnapshot: existingRow,
// // // // //         });

// // // // //         const enrolId = existingRow.enrollmentId || id;
// // // // //         batch.delete(doc(db, "enrollments", enrolId));

// // // // //         const humanId = existingRow.learnerId || id;
// // // // //         batch.delete(doc(db, "learners", humanId));

// // // // //         const subQ = query(
// // // // //           collection(db, "learner_submissions"),
// // // // //           where("enrollmentId", "==", enrolId),
// // // // //         );
// // // // //         const subSnap = await getDocs(subQ);
// // // // //         subSnap.forEach((subDoc) => {
// // // // //           batch.delete(subDoc.ref);
// // // // //         });

// // // // //         await batch.commit();

// // // // //         set((state) => {
// // // // //           state.learners = state.learners.filter((l) => l.id !== id);
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error("Failed to permanently delete learner:", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     restoreLearner: async (id: string) => {
// // // // //       try {
// // // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // // //         if (!existingRow) return;

// // // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // // //         const enrolSnap = await getDoc(enrolRef);

// // // // //         if (enrolSnap.exists()) {
// // // // //           await updateDoc(enrolRef, { isArchived: false, updatedAt: now() });
// // // // //         } else {
// // // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // // //             isArchived: false,
// // // // //             updatedAt: now(),
// // // // //           });
// // // // //         }

// // // // //         set((state) => {
// // // // //           const idx = state.learners.findIndex((l) => l.id === id);
// // // // //           if (idx !== -1) state.learners[idx].isArchived = false;
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error(error);
// // // // //       }
// // // // //     },

// // // // //     archiveCohort: async (year: string) => {
// // // // //       const { learners } = get();
// // // // //       const batch = writeBatch(db);
// // // // //       let count = 0;

// // // // //       for (const l of learners) {
// // // // //         const learnerYear = l.trainingStartDate
// // // // //           ? l.trainingStartDate.substring(0, 4)
// // // // //           : "";
// // // // //         if (learnerYear === year && !l.isArchived) {
// // // // //           const enrolRef = doc(db, "enrollments", l.enrollmentId);
// // // // //           const enrolSnap = await getDoc(enrolRef);
// // // // //           if (enrolSnap.exists()) {
// // // // //             batch.update(enrolRef, { isArchived: true, updatedAt: now() });
// // // // //           } else {
// // // // //             batch.update(doc(db, "learners", l.learnerId), {
// // // // //               isArchived: true,
// // // // //               updatedAt: now(),
// // // // //             });
// // // // //           }
// // // // //           count++;
// // // // //         }
// // // // //       }

// // // // //       if (count > 0) {
// // // // //         await batch.commit();
// // // // //         set((state) => {
// // // // //           state.learners.forEach((l) => {
// // // // //             if (l.trainingStartDate?.startsWith(year)) l.isArchived = true;
// // // // //           });
// // // // //         });
// // // // //         alert(`Successfully archived ${count} enrollments.`);
// // // // //       } else {
// // // // //         alert(`No active enrollments found for ${year}.`);
// // // // //       }
// // // // //     },

// // // // //     // ==================== STAGING (DRAFTS) ====================
// // // // //     stagingLearners: [],

// // // // //     fetchStagingLearners: async () => {
// // // // //       try {
// // // // //         const q = query(
// // // // //           collection(db, "staging_learners"),
// // // // //           orderBy("fullName"),
// // // // //         );
// // // // //         const snapshot = await getDocs(q);
// // // // //         const list = snapshot.docs.map(
// // // // //           (doc) => ({ ...doc.data(), id: doc.id }) as DashboardLearner,
// // // // //         );
// // // // //         set((state) => {
// // // // //           state.stagingLearners = list;
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error("Failed to fetch staging:", error);
// // // // //       }
// // // // //     },

// // // // //     approveStagingLearners: async (learnersToApprove) => {
// // // // //       set((state) => {
// // // // //         state.learnersLoading = true;
// // // // //       });
// // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       const functions = getFunctions();
// // // // //       const createAccountFn = httpsCallable(functions, "createLearnerAccount");

// // // // //       try {
// // // // //         const batch = writeBatch(db);
// // // // //         const approvedIds = new Set<string>();

// // // // //         await Promise.all(
// // // // //           learnersToApprove.map(async (l) => {
// // // // //             try {
// // // // //               const result = await createAccountFn({
// // // // //                 email: l.email,
// // // // //                 fullName: l.fullName,
// // // // //                 role: "learner",
// // // // //                 password: "TemporaryPassword123!",
// // // // //               });
// // // // //               const data = result.data as any;
// // // // //               const authUid = data.uid || l.id;

// // // // //               const profileData: any = { id: authUid };
// // // // //               const enrollmentData: any = {};

// // // // //               Object.keys(l).forEach((key) => {
// // // // //                 if (PROFILE_KEYS.includes(key))
// // // // //                   profileData[key] = (l as any)[key];
// // // // //                 else enrollmentData[key] = (l as any)[key];
// // // // //               });

// // // // //               profileData.authStatus = "active";
// // // // //               profileData.updatedAt = now();

// // // // //               enrollmentData.learnerId = authUid;
// // // // //               enrollmentData.isDraft = false;
// // // // //               enrollmentData.status = "active";
// // // // //               enrollmentData.approvedAt = now();
// // // // //               enrollmentData.approvedBy = USER_ID;

// // // // //               const profileRef = doc(db, "learners", authUid);
// // // // //               batch.set(profileRef, profileData, { merge: true });

// // // // //               const enrollmentRef = doc(collection(db, "enrollments"));
// // // // //               batch.set(enrollmentRef, enrollmentData);

// // // // //               const stagingRef = doc(db, "staging_learners", l.id);
// // // // //               batch.delete(stagingRef);

// // // // //               approvedIds.add(l.id);
// // // // //             } catch (err) {
// // // // //               console.error(`Failed to create account for ${l.email}`, err);
// // // // //             }
// // // // //           }),
// // // // //         );

// // // // //         await batch.commit();

// // // // //         set((state) => {
// // // // //           state.stagingLearners = state.stagingLearners.filter(
// // // // //             (l) => !approvedIds.has(l.id),
// // // // //           );
// // // // //           state.learnersLoading = false;
// // // // //         });

// // // // //         await get().fetchLearners(true);
// // // // //         alert(`Process Complete. Accounts created and enrollments mapped.`);
// // // // //       } catch (e) {
// // // // //         console.error(e);
// // // // //         set((state) => {
// // // // //           state.learnersLoading = false;
// // // // //         });
// // // // //         alert("Error during approval process.");
// // // // //       }
// // // // //     },

// // // // //     inviteLearner: async (learner: DashboardLearner) => {
// // // // //       set((state) => {
// // // // //         state.learnersLoading = true;
// // // // //       });

// // // // //       try {
// // // // //         const functions = getFunctions();
// // // // //         const createAccountFn = httpsCallable(
// // // // //           functions,
// // // // //           "createLearnerAccount",
// // // // //         );

// // // // //         const result = await createAccountFn({
// // // // //           email: learner.email,
// // // // //           fullName: learner.fullName,
// // // // //           role: "learner",
// // // // //         });

// // // // //         const data = result.data as any;

// // // // //         if (data.success) {
// // // // //           const learnerRef = doc(
// // // // //             db,
// // // // //             "learners",
// // // // //             learner.learnerId || learner.id,
// // // // //           );
// // // // //           await updateDoc(learnerRef, {
// // // // //             authStatus: "active",
// // // // //             invitedAt: now(),
// // // // //           });

// // // // //           set((state) => {
// // // // //             const idx = state.learners.findIndex((l) => l.id === learner.id);
// // // // //             if (idx !== -1) state.learners[idx].authStatus = "active";
// // // // //             state.learnersLoading = false;
// // // // //           });

// // // // //           alert(`Invite sent to ${learner.email}`);
// // // // //         } else {
// // // // //           throw new Error(data.message || "Unknown error");
// // // // //         }
// // // // //       } catch (error: any) {
// // // // //         console.error(error);
// // // // //         set((state) => {
// // // // //           state.learnersLoading = false;
// // // // //         });
// // // // //         if (error.message.includes("already exists")) {
// // // // //           alert("This user is already registered.");
// // // // //         } else {
// // // // //           alert(`Failed to invite: ${error.message}`);
// // // // //         }
// // // // //       }
// // // // //     },

// // // // //     discardStagingLearners: async (ids) => {
// // // // //       try {
// // // // //         const batch = writeBatch(db);
// // // // //         ids.forEach((id) => batch.delete(doc(db, "staging_learners", id)));
// // // // //         await batch.commit();
// // // // //         await get().fetchStagingLearners();
// // // // //       } catch (e) {
// // // // //         console.error(e);
// // // // //       }
// // // // //     },

// // // // //     settings: null,

// // // // //     fetchSettings: async () => {
// // // // //       try {
// // // // //         const docRef = doc(db, "system_settings", "global");
// // // // //         const snap = await getDoc(docRef);
// // // // //         if (snap.exists()) {
// // // // //           set({ settings: snap.data() as SystemSettings });
// // // // //         }
// // // // //       } catch (error) {
// // // // //         console.error("Error fetching system settings:", error);
// // // // //       }
// // // // //     },

// // // // //     // ==================== PROGRAMMES SLICE ====================
// // // // //     programmes: [],
// // // // //     programmesLoading: false,
// // // // //     programmesError: null,
// // // // //     programmesLastFetched: null,

// // // // //     fetchProgrammes: async (force = false) => {
// // // // //       const { programmesLastFetched, programmesLoading } = get();
// // // // //       if (
// // // // //         !force &&
// // // // //         programmesLastFetched &&
// // // // //         Date.now() - programmesLastFetched < 5 * 60 * 1000
// // // // //       )
// // // // //         return;
// // // // //       if (programmesLoading) return;

// // // // //       set({ programmesLoading: true, programmesError: null });
// // // // //       try {
// // // // //         const q = query(collection(db, "programmes"), orderBy("name"));
// // // // //         const snapshot = await getDocs(q);
// // // // //         const programmes = snapshot.docs.map(
// // // // //           (doc) => ({ id: doc.id, ...doc.data() }) as ProgrammeTemplate,
// // // // //         );
// // // // //         set({
// // // // //           programmes,
// // // // //           programmesLoading: false,
// // // // //           programmesLastFetched: Date.now(),
// // // // //         });
// // // // //       } catch (error) {
// // // // //         set({
// // // // //           programmesError: (error as Error).message,
// // // // //           programmesLoading: false,
// // // // //         });
// // // // //       }
// // // // //     },

// // // // //     addProgramme: async (programme) => {
// // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       try {
// // // // //         const timestamp = now();
// // // // //         const pAudit = {
// // // // //           ...programme,
// // // // //           createdAt: timestamp,
// // // // //           createdBy: USER_ID,
// // // // //           updatedAt: timestamp,
// // // // //           updatedBy: USER_ID,
// // // // //         };
// // // // //         const docRef = await addDoc(collection(db, "programmes"), pAudit);
// // // // //         set((state) => {
// // // // //           state.programmes.push({
// // // // //             ...pAudit,
// // // // //             id: docRef.id,
// // // // //           } as ProgrammeTemplate);
// // // // //         });
// // // // //       } catch (error) {
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     updateProgramme: async (id, updates) => {
// // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       try {
// // // // //         const updatePayload = {
// // // // //           ...updates,
// // // // //           updatedAt: now(),
// // // // //           updatedBy: USER_ID,
// // // // //         };
// // // // //         await updateDoc(doc(db, "programmes", id), updatePayload);
// // // // //         set((state) => {
// // // // //           const index = state.programmes.findIndex((p) => p.id === id);
// // // // //           if (index !== -1)
// // // // //             state.programmes[index] = {
// // // // //               ...state.programmes[index],
// // // // //               ...updatePayload,
// // // // //             };
// // // // //         });
// // // // //       } catch (error) {
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     archiveProgramme: async (id) => {
// // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       try {
// // // // //         await updateDoc(doc(db, "programmes", id), {
// // // // //           isArchived: true,
// // // // //           updatedAt: now(),
// // // // //           updatedBy: USER_ID,
// // // // //         });
// // // // //         set((state) => {
// // // // //           const index = state.programmes.findIndex((p) => p.id === id);
// // // // //           if (index !== -1) state.programmes[index].isArchived = true;
// // // // //         });
// // // // //       } catch (error) {
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     // ==================== STAFF SLICE ====================
// // // // //     staff: [],
// // // // //     staffLoading: false,
// // // // //     staffError: null,

// // // // //     fetchStaff: async (force = false) => {
// // // // //       const { staff, staffLoading } = get();
// // // // //       if (!force && staff.length > 0) return;
// // // // //       if (staffLoading) return;

// // // // //       set({ staffLoading: true, staffError: null });
// // // // //       try {
// // // // //         const q = query(
// // // // //           collection(db, "users"),
// // // // //           where("role", "in", [
// // // // //             "admin",
// // // // //             "facilitator",
// // // // //             "assessor",
// // // // //             "moderator",
// // // // //             "mentor",
// // // // //           ]),
// // // // //         );
// // // // //         const snapshot = await getDocs(q);
// // // // //         const staffList = snapshot.docs.map((doc) => {
// // // // //           const data = doc.data();
// // // // //           return {
// // // // //             id: doc.id,
// // // // //             fullName: data.fullName || "Unknown Staff",
// // // // //             email: data.email,
// // // // //             role: data.role,
// // // // //             phone: data.phone,
// // // // //             createdAt: data.createdAt || new Date().toISOString(),
// // // // //             employerId: data.employerId,
// // // // //             assessorRegNumber: data.assessorRegNumber,
// // // // //             status: data.status || "active",
// // // // //           } as StaffMember;
// // // // //         });
// // // // //         set({ staff: staffList, staffLoading: false });
// // // // //       } catch (error) {
// // // // //         set({ staffError: (error as Error).message, staffLoading: false });
// // // // //       }
// // // // //     },
// // // // //     addStaff: async (newStaff) => {
// // // // //       set({ staffLoading: true, staffError: null });
// // // // //       try {
// // // // //         const functions = getFunctions();
// // // // //         const createStaffAccount = httpsCallable(
// // // // //           functions,
// // // // //           "createStaffAccount",
// // // // //         );

// // // // //         const result = await createStaffAccount({
// // // // //           email: newStaff.email,
// // // // //           fullName: newStaff.fullName,
// // // // //           role: newStaff.role,
// // // // //           phone: newStaff.phone || "",
// // // // //           employerId: newStaff.employerId || "",
// // // // //           assessorRegNumber: newStaff.assessorRegNumber || "",
// // // // //         });

// // // // //         const data = result.data as any;

// // // // //         if (data.success) {
// // // // //           const createdStaff = {
// // // // //             ...newStaff,
// // // // //             id: data.uid || "temp-id-" + Date.now(),
// // // // //             createdAt: new Date().toISOString(),
// // // // //             signatureUrl: "",
// // // // //           } as StaffMember;

// // // // //           set((state) => {
// // // // //             state.staff.push(createdStaff);
// // // // //             state.staffLoading = false;
// // // // //           });

// // // // //           alert(`Success! Account created for ${newStaff.fullName}.`);
// // // // //         }
// // // // //       } catch (error: any) {
// // // // //         let errorMessage = "Failed to create account.";
// // // // //         if (error.code === "functions/permission-denied")
// // // // //           errorMessage = "You do not have permission to create staff.";
// // // // //         else if (error.code === "functions/already-exists")
// // // // //           errorMessage = "A user with this email already exists.";
// // // // //         else if (error.message) errorMessage = error.message;

// // // // //         set({ staffLoading: false, staffError: errorMessage });
// // // // //         alert(errorMessage);
// // // // //         throw new Error(errorMessage);
// // // // //       }
// // // // //     },

// // // // //     // updateStaff
// // // // //     updateStaff: async (id: string, updates: Partial<StaffMember>) => {
// // // // //       try {
// // // // //         const payload = { ...updates, updatedAt: now() };
// // // // //         await updateDoc(doc(db, "users", id), payload);

// // // // //         set((state) => {
// // // // //           const index = state.staff.findIndex((s) => s.id === id);
// // // // //           if (index !== -1) {
// // // // //             state.staff[index] = { ...state.staff[index], ...payload };
// // // // //           }
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error("Failed to update staff member", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     deleteStaff: async (id) => {
// // // // //       try {
// // // // //         await deleteDoc(doc(db, "users", id));
// // // // //         set((state) => {
// // // // //           state.staff = state.staff.filter((s) => s.id !== id);
// // // // //         });
// // // // //       } catch (error) {
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     updateStaffProfile: async (uid: string, updates: any) => {
// // // // //       try {
// // // // //         await updateDoc(doc(db, "users", uid), {
// // // // //           ...updates,
// // // // //           updatedAt: now(),
// // // // //         });
// // // // //         set((state) => ({
// // // // //           user: state.user ? { ...state.user, ...updates } : null,
// // // // //         }));
// // // // //       } catch (error) {
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     // ==================== IMPORTS ====================
// // // // //     importUnifiedLearners: async (file: File) => {
// // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // //       return new Promise((resolve, reject) => {
// // // // //         Papa.parse(file, {
// // // // //           header: true,
// // // // //           skipEmptyLines: true,
// // // // //           transformHeader: (header) => header.trim(),
// // // // //           complete: async (results) => {
// // // // //             const rawData = results.data as any[];
// // // // //             const errors: string[] = [];
// // // // //             const learnersMap = new Map<string, any>();

// // // // //             if (rawData.length === 0) {
// // // // //               resolve({ success: 0, errors: ["CSV file is empty"] });
// // // // //               return;
// // // // //             }

// // // // //             rawData.forEach((row, index) => {
// // // // //               try {
// // // // //                 const getStr = (val: any): string =>
// // // // //                   val !== null && val !== undefined ? String(val).trim() : "";
// // // // //                 const idNumber = getStr(row.NationalId || row.ID_Number);

// // // // //                 const issueDateStr =
// // // // //                   getStr(row.StatementofResultsIssueDate) ||
// // // // //                   now().split("T")[0];
// // // // //                 const providerCode =
// // // // //                   getStr(row.SDPCode) ||
// // // // //                   import.meta.env.VITE_SDP_CODE ||
// // // // //                   "SDP070824115131";

// // // // //                 if (!idNumber) return;

// // // // //                 if (!learnersMap.has(idNumber)) {
// // // // //                   const firstName = getStr(row.LearnerFirstName);
// // // // //                   const lastName = getStr(row.LearnerLastName);
// // // // //                   const middleName = getStr(row.LearnerMiddleName);
// // // // //                   let fullName =
// // // // //                     firstName || lastName
// // // // //                       ? `${firstName} ${middleName} ${lastName}`
// // // // //                           .replace(/\s+/g, " ")
// // // // //                           .trim()
// // // // //                       : getStr(row.Full_Name) || "Unknown Learner";

// // // // //                   const parseYYYYMMDD = (val: string) => {
// // // // //                     if (val.length === 8 && /^\d+$/.test(val)) {
// // // // //                       return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
// // // // //                     }
// // // // //                     return val;
// // // // //                   };

// // // // //                   const newLearner = {
// // // // //                     fullName,
// // // // //                     idNumber,
// // // // //                     dateOfBirth: parseYYYYMMDD(
// // // // //                       getStr(row.LearnerBirthDate || row.Date_Of_Birth),
// // // // //                     ),
// // // // //                     email: getStr(row.LearnerEmailAddress || row.Email),
// // // // //                     phone: getStr(
// // // // //                       row.LearnerCellPhoneNumber ||
// // // // //                         row.Phone ||
// // // // //                         row.LearnerPhoneNumber,
// // // // //                     ),
// // // // //                     trainingStartDate: getStr(
// // // // //                       row.TrainingStartDate || row.Training_Start_Date,
// // // // //                     )
// // // // //                       ? parseYYYYMMDD(
// // // // //                           getStr(
// // // // //                             row.TrainingStartDate || row.Training_Start_Date,
// // // // //                           ),
// // // // //                         )
// // // // //                       : now().split("T")[0],
// // // // //                     isArchived: false,
// // // // //                     isDraft: true,
// // // // //                     qualification: {
// // // // //                       name: getStr(
// // // // //                         row.Programme_Name || row.Qualification_Name,
// // // // //                       ),
// // // // //                       saqaId: getStr(row.QualificationId || row.SAQA_ID),
// // // // //                       credits:
// // // // //                         parseInt(getStr(row.Total_Credits || row.Credits)) || 0,
// // // // //                       totalNotionalHours:
// // // // //                         (parseInt(getStr(row.Total_Credits || row.Credits)) ||
// // // // //                           0) * 10,
// // // // //                       nqfLevel: parseInt(getStr(row.NQF_Level)) || 0,
// // // // //                       dateAssessed: "",
// // // // //                     },
// // // // //                     knowledgeModules: [],
// // // // //                     practicalModules: [],
// // // // //                     workExperienceModules: [],
// // // // //                     eisaAdmission:
// // // // //                       getStr(row.LearnerReadinessforEISATypeId) === "01" ||
// // // // //                       getStr(row.EISA_Admission).toLowerCase() === "yes",

// // // // //                     verificationCode:
// // // // //                       getStr(row.Verification_Code) ||
// // // // //                       generateSorId(fullName, issueDateStr, providerCode),
// // // // //                     issueDate: issueDateStr,

// // // // //                     status: "in-progress",
// // // // //                     demographics: {
// // // // //                       sdpCode: getStr(row.SDPCode),
// // // // //                     },
// // // // //                     createdAt: now(),
// // // // //                     createdBy: USER_ID,
// // // // //                   };
// // // // //                   learnersMap.set(idNumber, newLearner);
// // // // //                 }
// // // // //               } catch (err) {
// // // // //                 errors.push(
// // // // //                   `Row ${index + 2} Error: ${(err as Error).message}`,
// // // // //                 );
// // // // //               }
// // // // //             });

// // // // //             try {
// // // // //               const batch = writeBatch(db);
// // // // //               learnersMap.forEach((learner) => {
// // // // //                 batch.set(
// // // // //                   doc(db, "staging_learners", learner.idNumber),
// // // // //                   learner,
// // // // //                 );
// // // // //               });
// // // // //               await batch.commit();
// // // // //               await get().fetchStagingLearners();
// // // // //               resolve({ success: learnersMap.size, errors });
// // // // //             } catch (error) {
// // // // //               reject(error);
// // // // //             }
// // // // //           },
// // // // //           error: (error) => reject(error),
// // // // //         });
// // // // //       });
// // // // //     },

// // // // //     importProgrammesFromCSV: async (file: File) => {
// // // // //       return { success: 0, errors: [] } as any;
// // // // //     },

// // // // //     dropLearner: async (id, reason) => {
// // // // //       try {
// // // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // // //         if (!existingRow) return;

// // // // //         const timestamp = now();
// // // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // // //         const enrolSnap = await getDoc(enrolRef);

// // // // //         if (enrolSnap.exists()) {
// // // // //           await updateDoc(enrolRef, {
// // // // //             status: "dropped",
// // // // //             exitReason: reason,
// // // // //             exitDate: timestamp,
// // // // //             updatedAt: timestamp,
// // // // //           });
// // // // //         } else {
// // // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // // //             status: "dropped",
// // // // //             exitReason: reason,
// // // // //             exitDate: timestamp,
// // // // //             updatedAt: timestamp,
// // // // //           });
// // // // //         }

// // // // //         set((state) => {
// // // // //           const index = state.learners.findIndex((l) => l.id === id);
// // // // //           if (index !== -1) {
// // // // //             state.learners[index].status = "dropped";
// // // // //             state.learners[index].exitReason = reason;
// // // // //             state.learners[index].exitDate = timestamp;
// // // // //           }
// // // // //         });
// // // // //       } catch (error) {
// // // // //         console.error("Failed to drop learner", error);
// // // // //         throw error;
// // // // //       }
// // // // //     },

// // // // //     updateLearnerPlacement: async (targetId, employerId, mentorId) => {
// // // // //       try {
// // // // //         const payload = {
// // // // //           employerId,
// // // // //           mentorId,
// // // // //           placementDate: now(),
// // // // //           updatedAt: now(),
// // // // //         };

// // // // //         await setDoc(doc(db, "enrollments", targetId), payload, {
// // // // //           merge: true,
// // // // //         });
// // // // //         await setDoc(doc(db, "learners", targetId), payload, { merge: true });

// // // // //         const existingLearner = get().learners.find(
// // // // //           (l) => l.enrollmentId === targetId || l.id === targetId,
// // // // //         );
// // // // //         const humanId =
// // // // //           existingLearner?.learnerId || existingLearner?.id || targetId;

// // // // //         const q = query(
// // // // //           collection(db, "learner_submissions"),
// // // // //           where("learnerId", "==", humanId),
// // // // //           where("moduleType", "in", ["workplace", "qcto_workplace"]),
// // // // //         );
// // // // //         const submissionSnap = await getDocs(q);

// // // // //         if (!submissionSnap.empty) {
// // // // //           const batch = writeBatch(db);
// // // // //           submissionSnap.forEach((docSnap) => {
// // // // //             batch.update(docSnap.ref, {
// // // // //               employerId: employerId,
// // // // //               mentorId: mentorId,
// // // // //               updatedAt: now(),
// // // // //             });
// // // // //           });
// // // // //           await batch.commit();
// // // // //         }

// // // // //         await get().fetchLearners(true);
// // // // //         if (get().fetchSubmissions) await get().fetchSubmissions();
// // // // //       } catch (error: any) {
// // // // //         console.error("Failed to update placement in Firebase:", error);
// // // // //         throw new Error(error.message);
// // // // //       }
// // // // //     },
// // // // //   })),
// // // // // );

// // // // // // // src/store/useStore.ts

// // // // // // import { create } from "zustand";
// // // // // // import { immer } from "zustand/middleware/immer";
// // // // // // import { db } from "../lib/firebase";
// // // // // // import { getFunctions, httpsCallable } from "firebase/functions";
// // // // // // import {
// // // // // //   collection,
// // // // // //   doc,
// // // // // //   getDocs,
// // // // // //   addDoc,
// // // // // //   updateDoc,
// // // // // //   deleteDoc,
// // // // // //   query,
// // // // // //   orderBy,
// // // // // //   where,
// // // // // //   writeBatch,
// // // // // //   getDoc,
// // // // // //   setDoc,
// // // // // //   arrayUnion,
// // // // // // } from "firebase/firestore";
// // // // // // import Papa from "papaparse";
// // // // // // import type {
// // // // // //   DashboardLearner,
// // // // // //   ProgrammeTemplate,
// // // // // //   Employer,
// // // // // //   SystemSettings,
// // // // // // } from "../types";
// // // // // // import type { UserProfile } from "../types/auth.types";
// // // // // // import { getAuth } from "firebase/auth";
// // // // // // import {
// // // // // //   createCohortSlice,
// // // // // //   type CohortSlice,
// // // // // // } from "./slices/cohortSlice.ts/cohortSlice";
// // // // // // import { generateSorId } from "../pages/utils/validation";

// // // // // // const now = () => new Date().toISOString();

// // // // // // export interface EnrollmentRecord {
// // // // // //   cohortId: string;
// // // // // //   programmeId: string;
// // // // // //   status: "active" | "dropped" | "completed";
// // // // // //   dateAssigned: string;
// // // // // //   exitDate?: string | null;
// // // // // //   exitReason?: string;
// // // // // // }

// // // // // // export interface StaffMember {
// // // // // //   id: string;
// // // // // //   fullName: string;
// // // // // //   email: string;
// // // // // //   role: "admin" | "facilitator" | "assessor" | "moderator" | "mentor";
// // // // // //   phone?: string;
// // // // // //   authUid: string;
// // // // // //   assessorRegNumber?: string;
// // // // // //   employerId?: string;
// // // // // //   status?: "active" | "archived";
// // // // // //   createdAt?: string;
// // // // // //   updatedAt?: string;
// // // // // // }

// // // // // // export interface AttendanceRecord {
// // // // // //   id?: string;
// // // // // //   cohortId: string;
// // // // // //   date: string;
// // // // // //   facilitatorId: string;
// // // // // //   presentLearners: string[];
// // // // // //   notes?: string;
// // // // // // }

// // // // // // const PROFILE_KEYS = [
// // // // // //   "fullName",
// // // // // //   "firstName",
// // // // // //   "lastName",
// // // // // //   "idNumber",
// // // // // //   "dateOfBirth",
// // // // // //   "email",
// // // // // //   "phone",
// // // // // //   "mobile",
// // // // // //   "profilePhotoUrl",
// // // // // //   "profileCompleted",
// // // // // //   "authUid",
// // // // // //   "uid",
// // // // // //   "authStatus",
// // // // // //   "demographics",
// // // // // // ];

// // // // // // interface StoreState extends CohortSlice {
// // // // // //   user: UserProfile | null;
// // // // // //   loading: boolean;
// // // // // //   setUser: (user: UserProfile | null) => void;
// // // // // //   setLoading: (loading: boolean) => void;
// // // // // //   refreshUser: () => Promise<void>;

// // // // // //   // --- LEARNERS SLICE ---
// // // // // //   learners: DashboardLearner[];
// // // // // //   stagingLearners: DashboardLearner[];
// // // // // //   learnersLoading: boolean;
// // // // // //   learnersError: string | null;
// // // // // //   learnersLastFetched: number | null;

// // // // // //   clearUser: () => void;

// // // // // //   fetchLearners: (force?: boolean) => Promise<void>;
// // // // // //   fetchStagingLearners: () => Promise<void>;

// // // // // //   approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
// // // // // //   inviteLearner: (learner: DashboardLearner) => Promise<void>;
// // // // // //   discardStagingLearners: (ids: string[]) => Promise<void>;

// // // // // //   settings: SystemSettings | null;
// // // // // //   fetchSettings: () => Promise<void>;

// // // // // //   addLearner: (
// // // // // //     learner: Omit<
// // // // // //       DashboardLearner,
// // // // // //       | "id"
// // // // // //       | "learnerId"
// // // // // //       | "enrollmentId"
// // // // // //       | "createdAt"
// // // // // //       | "createdBy"
// // // // // //       | "updatedAt"
// // // // // //       | "updatedBy"
// // // // // //     >,
// // // // // //   ) => Promise<void>;
// // // // // //   updateLearner: (
// // // // // //     id: string,
// // // // // //     updates: Partial<DashboardLearner>,
// // // // // //   ) => Promise<void>;
// // // // // //   archiveLearner: (id: string) => Promise<void>;
// // // // // //   deleteLearnerPermanent: (
// // // // // //     id: string,
// // // // // //     audit: { reason: string; adminId: string; adminName: string },
// // // // // //   ) => Promise<void>;
// // // // // //   restoreLearner: (id: string) => Promise<void>;
// // // // // //   dropLearner: (id: string, reason: string) => Promise<void>;
// // // // // //   archiveCohort: (year: string) => Promise<void>;

// // // // // //   // RELATIONAL ACTIONS
// // // // // //   enrollLearnerInCohort: (
// // // // // //     learnerId: string,
// // // // // //     cohortId: string,
// // // // // //     programmeId: string,
// // // // // //   ) => Promise<void>;
// // // // // //   dropLearnerFromCohort: (
// // // // // //     learnerId: string,
// // // // // //     cohortId: string,
// // // // // //     reason: string,
// // // // // //   ) => Promise<void>;

// // // // // //   // --- PROGRAMMES SLICE ---
// // // // // //   programmes: ProgrammeTemplate[];
// // // // // //   programmesLoading: boolean;
// // // // // //   programmesError: string | null;
// // // // // //   programmesLastFetched: number | null;
// // // // // //   fetchProgrammes: (force?: boolean) => Promise<void>;
// // // // // //   addProgramme: (
// // // // // //     programme: Omit<
// // // // // //       ProgrammeTemplate,
// // // // // //       "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
// // // // // //     >,
// // // // // //   ) => Promise<void>;
// // // // // //   updateProgramme: (
// // // // // //     id: string,
// // // // // //     updates: Partial<ProgrammeTemplate>,
// // // // // //   ) => Promise<void>;
// // // // // //   archiveProgramme: (id: string) => Promise<void>;

// // // // // //   // --- STAFF SLICE ---
// // // // // //   staff: StaffMember[];
// // // // // //   staffLoading: boolean;
// // // // // //   staffError: string | null;
// // // // // //   fetchStaff: (force?: boolean) => Promise<void>;
// // // // // //   addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
// // // // // //   deleteStaff: (id: string) => Promise<void>;
// // // // // //   updateStaffProfile: (uid: string, updates: any) => Promise<void>;

// // // // // //   // --- BULK IMPORT ACTIONS ---
// // // // // //   importUnifiedLearners: (
// // // // // //     file: File,
// // // // // //   ) => Promise<{ success: number; errors: string[] }>;
// // // // // //   importProgrammesFromCSV: (
// // // // // //     file: File,
// // // // // //   ) => Promise<{ success: number; errors: string[] }>;

// // // // // //   assignAssessmentToLearner: (
// // // // // //     assessmentTemplate: any,
// // // // // //     learner: DashboardLearner,
// // // // // //   ) => Promise<string>;

// // // // // //   employers: Employer[];
// // // // // //   fetchEmployers: () => Promise<void>;

// // // // // //   updateLearnerPlacement: (
// // // // // //     enrollmentId: string,
// // // // // //     employerId: string,
// // // // // //     mentorId: string,
// // // // // //   ) => Promise<void>;

// // // // // //   // --- WORKPLACE MENTOR DATA ---
// // // // // //   assessments: any[];
// // // // // //   submissions: any[];
// // // // // //   enrollments: any[];
// // // // // //   fetchAssessments: () => Promise<void>;
// // // // // //   fetchSubmissions: () => Promise<void>;
// // // // // //   fetchEnrollments: () => Promise<void>;

// // // // // //   // AD-HOC CERTIFICATE STUDIO HISTORY
// // // // // //   adHocCertificates: any[];
// // // // // //   fetchAdHocCertificates: (force?: boolean) => Promise<void>;

// // // // // //   certificateGroups: any[];
// // // // // //   fetchCertificateGroups: (force?: boolean) => Promise<void>;
// // // // // //   createCertificateGroup: (name: string) => Promise<void>;

// // // // // //   renameCertificateGroup: (id: string, newName: string) => Promise<void>;
// // // // // // }

// // // // // // export const useStore = create<StoreState>()(
// // // // // //   immer((set, get, api) => ({
// // // // // //     ...createCohortSlice(set, get, api),

// // // // // //     user: null,
// // // // // //     loading: true,
// // // // // //     setUser: (user) => set({ user }),
// // // // // //     setLoading: (loading) => set({ loading }),

// // // // // //     clearUser: () => set({ user: null }),

// // // // // //     refreshUser: async () => {
// // // // // //       const currentUser = get().user;
// // // // // //       if (!currentUser?.uid) return;
// // // // // //       try {
// // // // // //         const userDoc = await getDoc(doc(db, "users", currentUser.uid));
// // // // // //         if (userDoc.exists()) {
// // // // // //           const data = userDoc.data();
// // // // // //           const updatedProfile: UserProfile = {
// // // // // //             ...currentUser,
// // // // // //             fullName: data.fullName || currentUser.fullName,
// // // // // //             role: data.role || currentUser.role,
// // // // // //             profileCompleted: data.profileCompleted === true,
// // // // // //           };
// // // // // //           set({ user: updatedProfile });
// // // // // //         }
// // // // // //       } catch (error) {
// // // // // //         console.error("Store: Failed to refresh user data", error);
// // // // // //       }
// // // // // //     },

// // // // // //     // AD-HOC CERTIFICATE STUDIO HISTORY FETCH
// // // // // //     adHocCertificates: [],
// // // // // //     fetchAdHocCertificates: async (force = false) => {
// // // // // //       const { adHocCertificates } = get();
// // // // // //       if (!force && adHocCertificates.length > 0) return;

// // // // // //       try {
// // // // // //         const q = query(
// // // // // //           collection(db, "ad_hoc_certificates"),
// // // // // //           orderBy("createdAt", "desc"),
// // // // // //         );
// // // // // //         const snap = await getDocs(q);
// // // // // //         const history = snap.docs.map((doc) => ({
// // // // // //           id: doc.id,
// // // // // //           ...doc.data(),
// // // // // //         }));
// // // // // //         set({ adHocCertificates: history });
// // // // // //       } catch (error) {
// // // // // //         console.error("Failed to load ad-hoc certificates:", error);
// // // // // //       }
// // // // // //     },
// // // // // //     certificateGroups: [],
// // // // // //     fetchCertificateGroups: async (force = false) => {
// // // // // //       const { certificateGroups } = get();
// // // // // //       if (!force && certificateGroups.length > 0) return;

// // // // // //       try {
// // // // // //         const q = query(
// // // // // //           collection(db, "certificate_groups"),
// // // // // //           orderBy("createdAt", "desc"),
// // // // // //         );
// // // // // //         const snap = await getDocs(q);
// // // // // //         set({
// // // // // //           certificateGroups: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error("Group Fetch Error:", error);
// // // // // //       }
// // // // // //     },
// // // // // //     createCertificateGroup: async (name: string) => {
// // // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       try {
// // // // // //         await addDoc(collection(db, "certificate_groups"), {
// // // // // //           name,
// // // // // //           createdBy: USER_ID,
// // // // // //           createdAt: new Date().toISOString(),
// // // // // //         });
// // // // // //         await get().fetchCertificateGroups(true);
// // // // // //       } catch (error) {
// // // // // //         console.error("Failed to create folder", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },
// // // // // //     renameCertificateGroup: async (id: string, newName: string) => {
// // // // // //       try {
// // // // // //         await updateDoc(doc(db, "certificate_groups", id), {
// // // // // //           name: newName,
// // // // // //           updatedAt: new Date().toISOString(),
// // // // // //         });
// // // // // //         await get().fetchCertificateGroups(true);
// // // // // //       } catch (error) {
// // // // // //         console.error("Failed to rename folder", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     // --- MENTOR DATA FETCHERS ---
// // // // // //     assessments: [],
// // // // // //     submissions: [],
// // // // // //     enrollments: [],

// // // // // //     fetchAssessments: async () => {
// // // // // //       try {
// // // // // //         const snap = await getDocs(collection(db, "assessments"));
// // // // // //         set({ assessments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // // // //       } catch (e) {
// // // // // //         console.error(e);
// // // // // //       }
// // // // // //     },

// // // // // //     fetchSubmissions: async () => {
// // // // // //       try {
// // // // // //         const snap = await getDocs(collection(db, "learner_submissions"));
// // // // // //         set({ submissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // // // //       } catch (e) {
// // // // // //         console.error(e);
// // // // // //       }
// // // // // //     },

// // // // // //     fetchEnrollments: async () => {
// // // // // //       try {
// // // // // //         const snap = await getDocs(collection(db, "enrollments"));
// // // // // //         set({ enrollments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
// // // // // //       } catch (e) {
// // // // // //         console.error(e);
// // // // // //       }
// // // // // //     },

// // // // // //     // ==================== EMPLOYERS SLICE ====================
// // // // // //     employers: [],
// // // // // //     fetchEmployers: async () => {
// // // // // //       try {
// // // // // //         const querySnapshot = await getDocs(collection(db, "employers"));
// // // // // //         const employersData = querySnapshot.docs.map((doc) => ({
// // // // // //           id: doc.id,
// // // // // //           ...doc.data(),
// // // // // //         })) as Employer[];

// // // // // //         employersData.sort((a, b) => a.name.localeCompare(b.name));
// // // // // //         set({ employers: employersData });
// // // // // //       } catch (error) {
// // // // // //         console.error("Error fetching employers:", error);
// // // // // //       }
// // // // // //     },

// // // // // //     // ==================== LEARNERS SLICE ====================
// // // // // //     learners: [],
// // // // // //     learnersLoading: false,
// // // // // //     learnersError: null,
// // // // // //     learnersLastFetched: null,

// // // // // //     fetchLearners: async (force = false) => {
// // // // // //       const { learnersLastFetched, learnersLoading } = get();

// // // // // //       if (
// // // // // //         !force &&
// // // // // //         learnersLastFetched &&
// // // // // //         Date.now() - learnersLastFetched < 5 * 60 * 1000
// // // // // //       )
// // // // // //         return;
// // // // // //       if (learnersLoading) return;

// // // // // //       set({ learnersLoading: true, learnersError: null });
// // // // // //       try {
// // // // // //         const profilesSnap = await getDocs(query(collection(db, "learners")));
// // // // // //         const profilesMap = new Map<string, any>();

// // // // // //         profilesSnap.docs.forEach((doc) => {
// // // // // //           profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
// // // // // //         });

// // // // // //         const enrollmentsSnap = await getDocs(
// // // // // //           query(collection(db, "enrollments")),
// // // // // //         );
// // // // // //         const combinedLearners: DashboardLearner[] = [];
// // // // // //         const usedProfileIds = new Set<string>();

// // // // // //         enrollmentsSnap.docs.forEach((docSnap) => {
// // // // // //           const enrollment = docSnap.data();
// // // // // //           const profile = profilesMap.get(enrollment.learnerId);

// // // // // //           if (profile) {
// // // // // //             usedProfileIds.add(profile.id);
// // // // // //             combinedLearners.push({
// // // // // //               ...profile,
// // // // // //               ...enrollment,
// // // // // //               id: docSnap.id,
// // // // // //               enrollmentId: docSnap.id,
// // // // // //               learnerId: profile.id,
// // // // // //             } as DashboardLearner);
// // // // // //           }
// // // // // //         });

// // // // // //         profilesMap.forEach((profile, profileId) => {
// // // // // //           if (!usedProfileIds.has(profileId) && profile.cohortId) {
// // // // // //             combinedLearners.push({
// // // // // //               ...profile,
// // // // // //               id: profileId,
// // // // // //               enrollmentId: profileId,
// // // // // //               learnerId: profileId,
// // // // // //             } as DashboardLearner);
// // // // // //           }
// // // // // //         });

// // // // // //         combinedLearners.sort((a, b) =>
// // // // // //           (a.fullName || "").localeCompare(b.fullName || ""),
// // // // // //         );

// // // // // //         set({
// // // // // //           learners: combinedLearners,
// // // // // //           learnersLoading: false,
// // // // // //           learnersLastFetched: Date.now(),
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error("Fetch error:", error);
// // // // // //         set({
// // // // // //           learnersError: (error as Error).message,
// // // // // //           learnersLoading: false,
// // // // // //         });
// // // // // //       }
// // // // // //     },

// // // // // //     addLearner: async (payload) => {
// // // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       try {
// // // // // //         const timestamp = now();
// // // // // //         const profileData: any = {};
// // // // // //         const enrollmentData: any = {};

// // // // // //         Object.keys(payload).forEach((key) => {
// // // // // //           if (PROFILE_KEYS.includes(key))
// // // // // //             profileData[key] = (payload as any)[key];
// // // // // //           else enrollmentData[key] = (payload as any)[key];
// // // // // //         });

// // // // // //         profileData.createdAt = timestamp;
// // // // // //         profileData.createdBy = USER_ID;

// // // // // //         enrollmentData.createdAt = timestamp;
// // // // // //         enrollmentData.createdBy = USER_ID;
// // // // // //         enrollmentData.isDraft = false;
// // // // // //         enrollmentData.isArchived = false;
// // // // // //         enrollmentData.status = "in-progress";

// // // // // //         if (!enrollmentData.verificationCode) {
// // // // // //           const issueDate = enrollmentData.issueDate || timestamp.split("T")[0];
// // // // // //           const name = profileData.fullName || "Unknown Learner";
// // // // // //           const providerCode =
// // // // // //             import.meta.env.VITE_SDP_CODE || "SDP070824115131";

// // // // // //           enrollmentData.verificationCode = generateSorId(
// // // // // //             name,
// // // // // //             issueDate,
// // // // // //             providerCode,
// // // // // //           );
// // // // // //           enrollmentData.issueDate = issueDate;
// // // // // //         }

// // // // // //         let finalLearnerId = "";

// // // // // //         const q = query(
// // // // // //           collection(db, "learners"),
// // // // // //           where("idNumber", "==", profileData.idNumber),
// // // // // //         );
// // // // // //         const existingSnap = await getDocs(q);

// // // // // //         if (!existingSnap.empty) {
// // // // // //           finalLearnerId = existingSnap.docs[0].id;
// // // // // //           await updateDoc(doc(db, "learners", finalLearnerId), {
// // // // // //             ...profileData,
// // // // // //             updatedAt: timestamp,
// // // // // //           });
// // // // // //         } else {
// // // // // //           const newProfileRef = await addDoc(
// // // // // //             collection(db, "learners"),
// // // // // //             profileData,
// // // // // //           );
// // // // // //           finalLearnerId = newProfileRef.id;
// // // // // //         }

// // // // // //         enrollmentData.learnerId = finalLearnerId;
// // // // // //         const newEnrollmentRef = await addDoc(
// // // // // //           collection(db, "enrollments"),
// // // // // //           enrollmentData,
// // // // // //         );

// // // // // //         set((state) => {
// // // // // //           state.learners.push({
// // // // // //             ...profileData,
// // // // // //             ...enrollmentData,
// // // // // //             id: newEnrollmentRef.id,
// // // // // //             enrollmentId: newEnrollmentRef.id,
// // // // // //             learnerId: finalLearnerId,
// // // // // //           } as DashboardLearner);
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error("Failed to add learner", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     updateLearner: async (id, updates) => {
// // // // // //       const CURRENT_USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       try {
// // // // // //         const existingRow = get().learners.find((l) => l.id === id);

// // // // // //         // BYPASS: If no record in local array (e.g. Learner portal), default to provided id
// // // // // //         const learnerId = existingRow?.learnerId || id;
// // // // // //         const enrollmentId = existingRow?.enrollmentId || null;

// // // // // //         const profileUpdates: any = {
// // // // // //           updatedAt: now(),
// // // // // //           updatedBy: CURRENT_USER_ID,
// // // // // //         };
// // // // // //         const enrollmentUpdates: any = {
// // // // // //           updatedAt: now(),
// // // // // //           updatedBy: CURRENT_USER_ID,
// // // // // //         };
// // // // // //         let hasProfileUpdate = false;
// // // // // //         let hasEnrollmentUpdate = false;

// // // // // //         Object.keys(updates).forEach((key) => {
// // // // // //           if (PROFILE_KEYS.includes(key)) {
// // // // // //             profileUpdates[key] = (updates as any)[key];
// // // // // //             hasProfileUpdate = true;
// // // // // //           } else {
// // // // // //             enrollmentUpdates[key] = (updates as any)[key];
// // // // // //             hasEnrollmentUpdate = true;
// // // // // //           }
// // // // // //         });

// // // // // //         const batch = writeBatch(db);

// // // // // //         if (hasProfileUpdate && learnerId) {
// // // // // //           batch.update(doc(db, "learners", learnerId), profileUpdates);
// // // // // //         }

// // // // // //         if (hasEnrollmentUpdate) {
// // // // // //           if (enrollmentId) {
// // // // // //             const enrolRef = doc(db, "enrollments", enrollmentId);
// // // // // //             const enrolSnap = await getDoc(enrolRef);
// // // // // //             if (enrolSnap.exists()) {
// // // // // //               batch.update(enrolRef, enrollmentUpdates);
// // // // // //             } else {
// // // // // //               batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
// // // // // //             }
// // // // // //           } else {
// // // // // //             // Fallback for learners updating their own profile without local enrollment mapping
// // // // // //             batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
// // // // // //           }
// // // // // //         }

// // // // // //         await batch.commit();

// // // // // //         set((state) => {
// // // // // //           // Attempt to update the array if they exist in it
// // // // // //           const index = state.learners.findIndex((l) => l.id === id);
// // // // // //           if (index !== -1) {
// // // // // //             state.learners[index] = { ...state.learners[index], ...updates };
// // // // // //           }
// // // // // //           // Also update the global user object if the person editing is themselves
// // // // // //           if (state.user && state.user.uid === learnerId) {
// // // // // //             state.user = { ...state.user, ...updates };
// // // // // //           }
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error("Failed to update learner", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     enrollLearnerInCohort: async (
// // // // // //       learnerId: string,
// // // // // //       cohortId: string,
// // // // // //       programmeId: string,
// // // // // //     ) => {
// // // // // //       try {
// // // // // //         const newEnrollment: EnrollmentRecord = {
// // // // // //           cohortId,
// // // // // //           programmeId,
// // // // // //           status: "active",
// // // // // //           dateAssigned: now(),
// // // // // //         };

// // // // // //         const learnerRef = doc(db, "learners", learnerId);
// // // // // //         const learnerSnap = await getDoc(learnerRef);

// // // // // //         if (learnerSnap.exists()) {
// // // // // //           const data = learnerSnap.data();
// // // // // //           const history = data.enrollmentHistory || [];

// // // // // //           const filteredHistory = history.filter(
// // // // // //             (h: any) => h.cohortId !== cohortId,
// // // // // //           );
// // // // // //           filteredHistory.push(newEnrollment);

// // // // // //           await updateDoc(learnerRef, {
// // // // // //             enrollmentHistory: filteredHistory,
// // // // // //             cohortId: cohortId,
// // // // // //             updatedAt: now(),
// // // // // //           });
// // // // // //         }

// // // // // //         const cohortRef = doc(db, "cohorts", cohortId);
// // // // // //         await updateDoc(cohortRef, {
// // // // // //           learnerIds: arrayUnion(learnerId),
// // // // // //         });

// // // // // //         await get().fetchLearners(true);
// // // // // //         if ((get() as any).fetchCohorts) {
// // // // // //           await (get() as any).fetchCohorts();
// // // // // //         }
// // // // // //       } catch (error) {
// // // // // //         console.error("Error enrolling learner:", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     dropLearnerFromCohort: async (
// // // // // //       learnerId: string,
// // // // // //       cohortId: string,
// // // // // //       reason: string,
// // // // // //     ) => {
// // // // // //       try {
// // // // // //         const learnerRef = doc(db, "learners", learnerId);
// // // // // //         const learnerSnap = await getDoc(learnerRef);

// // // // // //         if (learnerSnap.exists()) {
// // // // // //           const data = learnerSnap.data();
// // // // // //           const history = data.enrollmentHistory || [];

// // // // // //           const updatedHistory = history.map((h: any) => {
// // // // // //             if (h.cohortId === cohortId) {
// // // // // //               return {
// // // // // //                 ...h,
// // // // // //                 status: "dropped",
// // // // // //                 exitDate: now(),
// // // // // //                 exitReason: reason,
// // // // // //               };
// // // // // //             }
// // // // // //             return h;
// // // // // //           });

// // // // // //           await updateDoc(learnerRef, {
// // // // // //             enrollmentHistory: updatedHistory,
// // // // // //             status: "dropped",
// // // // // //             updatedAt: now(),
// // // // // //           });

// // // // // //           await get().fetchLearners(true);
// // // // // //         }
// // // // // //       } catch (error) {
// // // // // //         console.error("Error dropping learner from cohort:", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     assignAssessmentToLearner: async (assessmentTemplate, learner) => {
// // // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       try {
// // // // // //         const timestamp = now();
// // // // // //         const targetCohortId = learner.cohortId || "Unassigned";
// // // // // //         const targetHumanId = learner.learnerId || learner.id;

// // // // // //         const submissionData: any = {
// // // // // //           assessmentId: assessmentTemplate.id,
// // // // // //           title: assessmentTemplate.title,
// // // // // //           type: assessmentTemplate.type,
// // // // // //           moduleType: assessmentTemplate.moduleType || "knowledge",
// // // // // //           moduleNumber: assessmentTemplate.moduleNumber || "",
// // // // // //           learnerId: targetHumanId,
// // // // // //           enrollmentId: learner.enrollmentId || learner.id,
// // // // // //           cohortId: targetCohortId,
// // // // // //           qualificationName: learner.qualification?.name || "",
// // // // // //           status: "not_started",
// // // // // //           assignedAt: timestamp,
// // // // // //           marks: 0,
// // // // // //           totalMarks: assessmentTemplate.totalMarks || 0,
// // // // // //           createdAt: timestamp,
// // // // // //           createdBy: USER_ID,
// // // // // //         };

// // // // // //         if (
// // // // // //           assessmentTemplate.moduleType === "workplace" ||
// // // // // //           assessmentTemplate.moduleType === "qcto_workplace"
// // // // // //         ) {
// // // // // //           if (learner.mentorId) submissionData.mentorId = learner.mentorId;
// // // // // //           if (learner.employerId)
// // // // // //             submissionData.employerId = learner.employerId;
// // // // // //         }

// // // // // //         const customId = `${targetCohortId}_${targetHumanId}_${assessmentTemplate.id}`;

// // // // // //         await setDoc(doc(db, "learner_submissions", customId), submissionData, {
// // // // // //           merge: true,
// // // // // //         });

// // // // // //         return customId;
// // // // // //       } catch (error) {
// // // // // //         console.error("Assignment error:", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     archiveLearner: async (id: string) => {
// // // // // //       try {
// // // // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // // // //         if (!existingRow) return;

// // // // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // // // //         const enrolSnap = await getDoc(enrolRef);

// // // // // //         if (enrolSnap.exists()) {
// // // // // //           await updateDoc(enrolRef, { isArchived: true, updatedAt: now() });
// // // // // //         } else {
// // // // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // // // //             isArchived: true,
// // // // // //             updatedAt: now(),
// // // // // //           });
// // // // // //         }

// // // // // //         set((state) => {
// // // // // //           const idx = state.learners.findIndex((l) => l.id === id);
// // // // // //           if (idx !== -1) state.learners[idx].isArchived = true;
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error(error);
// // // // // //       }
// // // // // //     },

// // // // // //     deleteLearnerPermanent: async (id, audit) => {
// // // // // //       try {
// // // // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // // // //         if (!existingRow)
// // // // // //           throw new Error("Learner record not found in local state.");

// // // // // //         const batch = writeBatch(db);
// // // // // //         const timestamp = new Date().toISOString();

// // // // // //         const auditRef = doc(collection(db, "audit_logs"));
// // // // // //         batch.set(auditRef, {
// // // // // //           action: "PERMANENT_DELETE",
// // // // // //           entityType: "LEARNER_ENROLLMENT",
// // // // // //           entityId: id,
// // // // // //           learnerName: existingRow.fullName,
// // // // // //           idNumber: existingRow.idNumber,
// // // // // //           cohortId: existingRow.cohortId,
// // // // // //           reason: audit.reason,
// // // // // //           deletedBy: audit.adminId,
// // // // // //           deletedByName: audit.adminName,
// // // // // //           deletedAt: timestamp,
// // // // // //           dataSnapshot: existingRow,
// // // // // //         });

// // // // // //         const enrolId = existingRow.enrollmentId || id;
// // // // // //         batch.delete(doc(db, "enrollments", enrolId));

// // // // // //         const humanId = existingRow.learnerId || id;
// // // // // //         batch.delete(doc(db, "learners", humanId));

// // // // // //         const subQ = query(
// // // // // //           collection(db, "learner_submissions"),
// // // // // //           where("enrollmentId", "==", enrolId),
// // // // // //         );
// // // // // //         const subSnap = await getDocs(subQ);
// // // // // //         subSnap.forEach((subDoc) => {
// // // // // //           batch.delete(subDoc.ref);
// // // // // //         });

// // // // // //         await batch.commit();

// // // // // //         set((state) => {
// // // // // //           state.learners = state.learners.filter((l) => l.id !== id);
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error("Failed to permanently delete learner:", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     restoreLearner: async (id: string) => {
// // // // // //       try {
// // // // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // // // //         if (!existingRow) return;

// // // // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // // // //         const enrolSnap = await getDoc(enrolRef);

// // // // // //         if (enrolSnap.exists()) {
// // // // // //           await updateDoc(enrolRef, { isArchived: false, updatedAt: now() });
// // // // // //         } else {
// // // // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // // // //             isArchived: false,
// // // // // //             updatedAt: now(),
// // // // // //           });
// // // // // //         }

// // // // // //         set((state) => {
// // // // // //           const idx = state.learners.findIndex((l) => l.id === id);
// // // // // //           if (idx !== -1) state.learners[idx].isArchived = false;
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error(error);
// // // // // //       }
// // // // // //     },

// // // // // //     archiveCohort: async (year: string) => {
// // // // // //       const { learners } = get();
// // // // // //       const batch = writeBatch(db);
// // // // // //       let count = 0;

// // // // // //       for (const l of learners) {
// // // // // //         const learnerYear = l.trainingStartDate
// // // // // //           ? l.trainingStartDate.substring(0, 4)
// // // // // //           : "";
// // // // // //         if (learnerYear === year && !l.isArchived) {
// // // // // //           const enrolRef = doc(db, "enrollments", l.enrollmentId);
// // // // // //           const enrolSnap = await getDoc(enrolRef);
// // // // // //           if (enrolSnap.exists()) {
// // // // // //             batch.update(enrolRef, { isArchived: true, updatedAt: now() });
// // // // // //           } else {
// // // // // //             batch.update(doc(db, "learners", l.learnerId), {
// // // // // //               isArchived: true,
// // // // // //               updatedAt: now(),
// // // // // //             });
// // // // // //           }
// // // // // //           count++;
// // // // // //         }
// // // // // //       }

// // // // // //       if (count > 0) {
// // // // // //         await batch.commit();
// // // // // //         set((state) => {
// // // // // //           state.learners.forEach((l) => {
// // // // // //             if (l.trainingStartDate?.startsWith(year)) l.isArchived = true;
// // // // // //           });
// // // // // //         });
// // // // // //         alert(`Successfully archived ${count} enrollments.`);
// // // // // //       } else {
// // // // // //         alert(`No active enrollments found for ${year}.`);
// // // // // //       }
// // // // // //     },

// // // // // //     // ==================== STAGING (DRAFTS) ====================
// // // // // //     stagingLearners: [],

// // // // // //     fetchStagingLearners: async () => {
// // // // // //       try {
// // // // // //         const q = query(
// // // // // //           collection(db, "staging_learners"),
// // // // // //           orderBy("fullName"),
// // // // // //         );
// // // // // //         const snapshot = await getDocs(q);
// // // // // //         const list = snapshot.docs.map(
// // // // // //           (doc) => ({ ...doc.data(), id: doc.id }) as DashboardLearner,
// // // // // //         );
// // // // // //         set((state) => {
// // // // // //           state.stagingLearners = list;
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error("Failed to fetch staging:", error);
// // // // // //       }
// // // // // //     },

// // // // // //     approveStagingLearners: async (learnersToApprove) => {
// // // // // //       set((state) => {
// // // // // //         state.learnersLoading = true;
// // // // // //       });
// // // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       const functions = getFunctions();
// // // // // //       const createAccountFn = httpsCallable(functions, "createLearnerAccount");

// // // // // //       try {
// // // // // //         const batch = writeBatch(db);
// // // // // //         const approvedIds = new Set<string>();

// // // // // //         await Promise.all(
// // // // // //           learnersToApprove.map(async (l) => {
// // // // // //             try {
// // // // // //               const result = await createAccountFn({
// // // // // //                 email: l.email,
// // // // // //                 fullName: l.fullName,
// // // // // //                 role: "learner",
// // // // // //                 password: "TemporaryPassword123!",
// // // // // //               });
// // // // // //               const data = result.data as any;
// // // // // //               const authUid = data.uid || l.id;

// // // // // //               const profileData: any = { id: authUid };
// // // // // //               const enrollmentData: any = {};

// // // // // //               Object.keys(l).forEach((key) => {
// // // // // //                 if (PROFILE_KEYS.includes(key))
// // // // // //                   profileData[key] = (l as any)[key];
// // // // // //                 else enrollmentData[key] = (l as any)[key];
// // // // // //               });

// // // // // //               profileData.authStatus = "active";
// // // // // //               profileData.updatedAt = now();

// // // // // //               enrollmentData.learnerId = authUid;
// // // // // //               enrollmentData.isDraft = false;
// // // // // //               enrollmentData.status = "active";
// // // // // //               enrollmentData.approvedAt = now();
// // // // // //               enrollmentData.approvedBy = USER_ID;

// // // // // //               const profileRef = doc(db, "learners", authUid);
// // // // // //               batch.set(profileRef, profileData, { merge: true });

// // // // // //               const enrollmentRef = doc(collection(db, "enrollments"));
// // // // // //               batch.set(enrollmentRef, enrollmentData);

// // // // // //               const stagingRef = doc(db, "staging_learners", l.id);
// // // // // //               batch.delete(stagingRef);

// // // // // //               approvedIds.add(l.id);
// // // // // //             } catch (err) {
// // // // // //               console.error(`Failed to create account for ${l.email}`, err);
// // // // // //             }
// // // // // //           }),
// // // // // //         );

// // // // // //         await batch.commit();

// // // // // //         set((state) => {
// // // // // //           state.stagingLearners = state.stagingLearners.filter(
// // // // // //             (l) => !approvedIds.has(l.id),
// // // // // //           );
// // // // // //           state.learnersLoading = false;
// // // // // //         });

// // // // // //         await get().fetchLearners(true);
// // // // // //         alert(`Process Complete. Accounts created and enrollments mapped.`);
// // // // // //       } catch (e) {
// // // // // //         console.error(e);
// // // // // //         set((state) => {
// // // // // //           state.learnersLoading = false;
// // // // // //         });
// // // // // //         alert("Error during approval process.");
// // // // // //       }
// // // // // //     },

// // // // // //     inviteLearner: async (learner: DashboardLearner) => {
// // // // // //       set((state) => {
// // // // // //         state.learnersLoading = true;
// // // // // //       });

// // // // // //       try {
// // // // // //         const functions = getFunctions();
// // // // // //         const createAccountFn = httpsCallable(
// // // // // //           functions,
// // // // // //           "createLearnerAccount",
// // // // // //         );

// // // // // //         const result = await createAccountFn({
// // // // // //           email: learner.email,
// // // // // //           fullName: learner.fullName,
// // // // // //           role: "learner",
// // // // // //         });

// // // // // //         const data = result.data as any;

// // // // // //         if (data.success) {
// // // // // //           const learnerRef = doc(
// // // // // //             db,
// // // // // //             "learners",
// // // // // //             learner.learnerId || learner.id,
// // // // // //           );
// // // // // //           await updateDoc(learnerRef, {
// // // // // //             authStatus: "active",
// // // // // //             invitedAt: now(),
// // // // // //           });

// // // // // //           set((state) => {
// // // // // //             const idx = state.learners.findIndex((l) => l.id === learner.id);
// // // // // //             if (idx !== -1) state.learners[idx].authStatus = "active";
// // // // // //             state.learnersLoading = false;
// // // // // //           });

// // // // // //           alert(`Invite sent to ${learner.email}`);
// // // // // //         } else {
// // // // // //           throw new Error(data.message || "Unknown error");
// // // // // //         }
// // // // // //       } catch (error: any) {
// // // // // //         console.error(error);
// // // // // //         set((state) => {
// // // // // //           state.learnersLoading = false;
// // // // // //         });
// // // // // //         if (error.message.includes("already exists")) {
// // // // // //           alert("This user is already registered.");
// // // // // //         } else {
// // // // // //           alert(`Failed to invite: ${error.message}`);
// // // // // //         }
// // // // // //       }
// // // // // //     },

// // // // // //     discardStagingLearners: async (ids) => {
// // // // // //       try {
// // // // // //         const batch = writeBatch(db);
// // // // // //         ids.forEach((id) => batch.delete(doc(db, "staging_learners", id)));
// // // // // //         await batch.commit();
// // // // // //         await get().fetchStagingLearners();
// // // // // //       } catch (e) {
// // // // // //         console.error(e);
// // // // // //       }
// // // // // //     },

// // // // // //     settings: null,

// // // // // //     fetchSettings: async () => {
// // // // // //       try {
// // // // // //         const docRef = doc(db, "system_settings", "global");
// // // // // //         const snap = await getDoc(docRef);
// // // // // //         if (snap.exists()) {
// // // // // //           set({ settings: snap.data() as SystemSettings });
// // // // // //         }
// // // // // //       } catch (error) {
// // // // // //         console.error("Error fetching system settings:", error);
// // // // // //       }
// // // // // //     },

// // // // // //     // ==================== PROGRAMMES SLICE ====================
// // // // // //     programmes: [],
// // // // // //     programmesLoading: false,
// // // // // //     programmesError: null,
// // // // // //     programmesLastFetched: null,

// // // // // //     fetchProgrammes: async (force = false) => {
// // // // // //       const { programmesLastFetched, programmesLoading } = get();
// // // // // //       if (
// // // // // //         !force &&
// // // // // //         programmesLastFetched &&
// // // // // //         Date.now() - programmesLastFetched < 5 * 60 * 1000
// // // // // //       )
// // // // // //         return;
// // // // // //       if (programmesLoading) return;

// // // // // //       set({ programmesLoading: true, programmesError: null });
// // // // // //       try {
// // // // // //         const q = query(collection(db, "programmes"), orderBy("name"));
// // // // // //         const snapshot = await getDocs(q);
// // // // // //         const programmes = snapshot.docs.map(
// // // // // //           (doc) => ({ id: doc.id, ...doc.data() }) as ProgrammeTemplate,
// // // // // //         );
// // // // // //         set({
// // // // // //           programmes,
// // // // // //           programmesLoading: false,
// // // // // //           programmesLastFetched: Date.now(),
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         set({
// // // // // //           programmesError: (error as Error).message,
// // // // // //           programmesLoading: false,
// // // // // //         });
// // // // // //       }
// // // // // //     },

// // // // // //     addProgramme: async (programme) => {
// // // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       try {
// // // // // //         const timestamp = now();
// // // // // //         const pAudit = {
// // // // // //           ...programme,
// // // // // //           createdAt: timestamp,
// // // // // //           createdBy: USER_ID,
// // // // // //           updatedAt: timestamp,
// // // // // //           updatedBy: USER_ID,
// // // // // //         };
// // // // // //         const docRef = await addDoc(collection(db, "programmes"), pAudit);
// // // // // //         set((state) => {
// // // // // //           state.programmes.push({
// // // // // //             ...pAudit,
// // // // // //             id: docRef.id,
// // // // // //           } as ProgrammeTemplate);
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     updateProgramme: async (id, updates) => {
// // // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       try {
// // // // // //         const updatePayload = {
// // // // // //           ...updates,
// // // // // //           updatedAt: now(),
// // // // // //           updatedBy: USER_ID,
// // // // // //         };
// // // // // //         await updateDoc(doc(db, "programmes", id), updatePayload);
// // // // // //         set((state) => {
// // // // // //           const index = state.programmes.findIndex((p) => p.id === id);
// // // // // //           if (index !== -1)
// // // // // //             state.programmes[index] = {
// // // // // //               ...state.programmes[index],
// // // // // //               ...updatePayload,
// // // // // //             };
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     archiveProgramme: async (id) => {
// // // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       try {
// // // // // //         await updateDoc(doc(db, "programmes", id), {
// // // // // //           isArchived: true,
// // // // // //           updatedAt: now(),
// // // // // //           updatedBy: USER_ID,
// // // // // //         });
// // // // // //         set((state) => {
// // // // // //           const index = state.programmes.findIndex((p) => p.id === id);
// // // // // //           if (index !== -1) state.programmes[index].isArchived = true;
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     // ==================== STAFF SLICE ====================
// // // // // //     staff: [],
// // // // // //     staffLoading: false,
// // // // // //     staffError: null,

// // // // // //     fetchStaff: async (force = false) => {
// // // // // //       const { staff, staffLoading } = get();
// // // // // //       if (!force && staff.length > 0) return;
// // // // // //       if (staffLoading) return;

// // // // // //       set({ staffLoading: true, staffError: null });
// // // // // //       try {
// // // // // //         const q = query(
// // // // // //           collection(db, "users"),
// // // // // //           where("role", "in", [
// // // // // //             "admin",
// // // // // //             "facilitator",
// // // // // //             "assessor",
// // // // // //             "moderator",
// // // // // //             "mentor",
// // // // // //           ]),
// // // // // //         );
// // // // // //         const snapshot = await getDocs(q);
// // // // // //         const staffList = snapshot.docs.map((doc) => {
// // // // // //           const data = doc.data();
// // // // // //           return {
// // // // // //             id: doc.id,
// // // // // //             fullName: data.fullName || "Unknown Staff",
// // // // // //             email: data.email,
// // // // // //             role: data.role,
// // // // // //             phone: data.phone,
// // // // // //             createdAt: data.createdAt || new Date().toISOString(),
// // // // // //             employerId: data.employerId,
// // // // // //             assessorRegNumber: data.assessorRegNumber,
// // // // // //             status: data.status || "active",
// // // // // //           } as StaffMember;
// // // // // //         });
// // // // // //         set({ staff: staffList, staffLoading: false });
// // // // // //       } catch (error) {
// // // // // //         set({ staffError: (error as Error).message, staffLoading: false });
// // // // // //       }
// // // // // //     },
// // // // // //     addStaff: async (newStaff) => {
// // // // // //       set({ staffLoading: true, staffError: null });
// // // // // //       try {
// // // // // //         const functions = getFunctions();
// // // // // //         const createStaffAccount = httpsCallable(
// // // // // //           functions,
// // // // // //           "createStaffAccount",
// // // // // //         );

// // // // // //         const result = await createStaffAccount({
// // // // // //           email: newStaff.email,
// // // // // //           fullName: newStaff.fullName,
// // // // // //           role: newStaff.role,
// // // // // //           phone: newStaff.phone || "",
// // // // // //           employerId: newStaff.employerId || "",
// // // // // //           assessorRegNumber: newStaff.assessorRegNumber || "",
// // // // // //         });

// // // // // //         const data = result.data as any;

// // // // // //         if (data.success) {
// // // // // //           const createdStaff = {
// // // // // //             ...newStaff,
// // // // // //             id: data.uid || "temp-id-" + Date.now(),
// // // // // //             createdAt: new Date().toISOString(),
// // // // // //             signatureUrl: "",
// // // // // //           } as StaffMember;

// // // // // //           set((state) => {
// // // // // //             state.staff.push(createdStaff);
// // // // // //             state.staffLoading = false;
// // // // // //           });

// // // // // //           alert(`Success! Account created for ${newStaff.fullName}.`);
// // // // // //         }
// // // // // //       } catch (error: any) {
// // // // // //         let errorMessage = "Failed to create account.";
// // // // // //         if (error.code === "functions/permission-denied")
// // // // // //           errorMessage = "You do not have permission to create staff.";
// // // // // //         else if (error.code === "functions/already-exists")
// // // // // //           errorMessage = "A user with this email already exists.";
// // // // // //         else if (error.message) errorMessage = error.message;

// // // // // //         set({ staffLoading: false, staffError: errorMessage });
// // // // // //         alert(errorMessage);
// // // // // //         throw new Error(errorMessage);
// // // // // //       }
// // // // // //     },

// // // // // //     deleteStaff: async (id) => {
// // // // // //       try {
// // // // // //         await deleteDoc(doc(db, "users", id));
// // // // // //         set((state) => {
// // // // // //           state.staff = state.staff.filter((s) => s.id !== id);
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     updateStaffProfile: async (uid: string, updates: any) => {
// // // // // //       try {
// // // // // //         await updateDoc(doc(db, "users", uid), {
// // // // // //           ...updates,
// // // // // //           updatedAt: now(),
// // // // // //         });
// // // // // //         set((state) => ({
// // // // // //           user: state.user ? { ...state.user, ...updates } : null,
// // // // // //         }));
// // // // // //       } catch (error) {
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     // ==================== IMPORTS ====================
// // // // // //     importUnifiedLearners: async (file: File) => {
// // // // // //       const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // // // // //       return new Promise((resolve, reject) => {
// // // // // //         Papa.parse(file, {
// // // // // //           header: true,
// // // // // //           skipEmptyLines: true,
// // // // // //           transformHeader: (header) => header.trim(),
// // // // // //           complete: async (results) => {
// // // // // //             const rawData = results.data as any[];
// // // // // //             const errors: string[] = [];
// // // // // //             const learnersMap = new Map<string, any>();

// // // // // //             if (rawData.length === 0) {
// // // // // //               resolve({ success: 0, errors: ["CSV file is empty"] });
// // // // // //               return;
// // // // // //             }

// // // // // //             rawData.forEach((row, index) => {
// // // // // //               try {
// // // // // //                 const getStr = (val: any): string =>
// // // // // //                   val !== null && val !== undefined ? String(val).trim() : "";
// // // // // //                 const idNumber = getStr(row.NationalId || row.ID_Number);

// // // // // //                 const issueDateStr =
// // // // // //                   getStr(row.StatementofResultsIssueDate) ||
// // // // // //                   now().split("T")[0];
// // // // // //                 const providerCode =
// // // // // //                   getStr(row.SDPCode) ||
// // // // // //                   import.meta.env.VITE_SDP_CODE ||
// // // // // //                   "SDP070824115131";

// // // // // //                 if (!idNumber) return;

// // // // // //                 if (!learnersMap.has(idNumber)) {
// // // // // //                   const firstName = getStr(row.LearnerFirstName);
// // // // // //                   const lastName = getStr(row.LearnerLastName);
// // // // // //                   const middleName = getStr(row.LearnerMiddleName);
// // // // // //                   let fullName =
// // // // // //                     firstName || lastName
// // // // // //                       ? `${firstName} ${middleName} ${lastName}`
// // // // // //                           .replace(/\s+/g, " ")
// // // // // //                           .trim()
// // // // // //                       : getStr(row.Full_Name) || "Unknown Learner";

// // // // // //                   const parseYYYYMMDD = (val: string) => {
// // // // // //                     if (val.length === 8 && /^\d+$/.test(val)) {
// // // // // //                       return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
// // // // // //                     }
// // // // // //                     return val;
// // // // // //                   };

// // // // // //                   const newLearner = {
// // // // // //                     fullName,
// // // // // //                     idNumber,
// // // // // //                     dateOfBirth: parseYYYYMMDD(
// // // // // //                       getStr(row.LearnerBirthDate || row.Date_Of_Birth),
// // // // // //                     ),
// // // // // //                     email: getStr(row.LearnerEmailAddress || row.Email),
// // // // // //                     phone: getStr(
// // // // // //                       row.LearnerCellPhoneNumber ||
// // // // // //                         row.Phone ||
// // // // // //                         row.LearnerPhoneNumber,
// // // // // //                     ),
// // // // // //                     trainingStartDate: getStr(
// // // // // //                       row.TrainingStartDate || row.Training_Start_Date,
// // // // // //                     )
// // // // // //                       ? parseYYYYMMDD(
// // // // // //                           getStr(
// // // // // //                             row.TrainingStartDate || row.Training_Start_Date,
// // // // // //                           ),
// // // // // //                         )
// // // // // //                       : now().split("T")[0],
// // // // // //                     isArchived: false,
// // // // // //                     isDraft: true,
// // // // // //                     qualification: {
// // // // // //                       name: getStr(
// // // // // //                         row.Programme_Name || row.Qualification_Name,
// // // // // //                       ),
// // // // // //                       saqaId: getStr(row.QualificationId || row.SAQA_ID),
// // // // // //                       credits:
// // // // // //                         parseInt(getStr(row.Total_Credits || row.Credits)) || 0,
// // // // // //                       totalNotionalHours:
// // // // // //                         (parseInt(getStr(row.Total_Credits || row.Credits)) ||
// // // // // //                           0) * 10,
// // // // // //                       nqfLevel: parseInt(getStr(row.NQF_Level)) || 0,
// // // // // //                       dateAssessed: "",
// // // // // //                     },
// // // // // //                     knowledgeModules: [],
// // // // // //                     practicalModules: [],
// // // // // //                     workExperienceModules: [],
// // // // // //                     eisaAdmission:
// // // // // //                       getStr(row.LearnerReadinessforEISATypeId) === "01" ||
// // // // // //                       getStr(row.EISA_Admission).toLowerCase() === "yes",

// // // // // //                     verificationCode:
// // // // // //                       getStr(row.Verification_Code) ||
// // // // // //                       generateSorId(fullName, issueDateStr, providerCode),
// // // // // //                     issueDate: issueDateStr,

// // // // // //                     status: "in-progress",
// // // // // //                     demographics: {
// // // // // //                       sdpCode: getStr(row.SDPCode),
// // // // // //                     },
// // // // // //                     createdAt: now(),
// // // // // //                     createdBy: USER_ID,
// // // // // //                   };
// // // // // //                   learnersMap.set(idNumber, newLearner);
// // // // // //                 }
// // // // // //               } catch (err) {
// // // // // //                 errors.push(
// // // // // //                   `Row ${index + 2} Error: ${(err as Error).message}`,
// // // // // //                 );
// // // // // //               }
// // // // // //             });

// // // // // //             try {
// // // // // //               const batch = writeBatch(db);
// // // // // //               learnersMap.forEach((learner) => {
// // // // // //                 batch.set(
// // // // // //                   doc(db, "staging_learners", learner.idNumber),
// // // // // //                   learner,
// // // // // //                 );
// // // // // //               });
// // // // // //               await batch.commit();
// // // // // //               await get().fetchStagingLearners();
// // // // // //               resolve({ success: learnersMap.size, errors });
// // // // // //             } catch (error) {
// // // // // //               reject(error);
// // // // // //             }
// // // // // //           },
// // // // // //           error: (error) => reject(error),
// // // // // //         });
// // // // // //       });
// // // // // //     },

// // // // // //     importProgrammesFromCSV: async (file: File) => {
// // // // // //       return { success: 0, errors: [] } as any;
// // // // // //     },

// // // // // //     dropLearner: async (id, reason) => {
// // // // // //       try {
// // // // // //         const existingRow = get().learners.find((l) => l.id === id);
// // // // // //         if (!existingRow) return;

// // // // // //         const timestamp = now();
// // // // // //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// // // // // //         const enrolSnap = await getDoc(enrolRef);

// // // // // //         if (enrolSnap.exists()) {
// // // // // //           await updateDoc(enrolRef, {
// // // // // //             status: "dropped",
// // // // // //             exitReason: reason,
// // // // // //             exitDate: timestamp,
// // // // // //             updatedAt: timestamp,
// // // // // //           });
// // // // // //         } else {
// // // // // //           await updateDoc(doc(db, "learners", existingRow.learnerId), {
// // // // // //             status: "dropped",
// // // // // //             exitReason: reason,
// // // // // //             exitDate: timestamp,
// // // // // //             updatedAt: timestamp,
// // // // // //           });
// // // // // //         }

// // // // // //         set((state) => {
// // // // // //           const index = state.learners.findIndex((l) => l.id === id);
// // // // // //           if (index !== -1) {
// // // // // //             state.learners[index].status = "dropped";
// // // // // //             state.learners[index].exitReason = reason;
// // // // // //             state.learners[index].exitDate = timestamp;
// // // // // //           }
// // // // // //         });
// // // // // //       } catch (error) {
// // // // // //         console.error("Failed to drop learner", error);
// // // // // //         throw error;
// // // // // //       }
// // // // // //     },

// // // // // //     updateLearnerPlacement: async (targetId, employerId, mentorId) => {
// // // // // //       try {
// // // // // //         const payload = {
// // // // // //           employerId,
// // // // // //           mentorId,
// // // // // //           placementDate: now(),
// // // // // //           updatedAt: now(),
// // // // // //         };

// // // // // //         await setDoc(doc(db, "enrollments", targetId), payload, {
// // // // // //           merge: true,
// // // // // //         });
// // // // // //         await setDoc(doc(db, "learners", targetId), payload, { merge: true });

// // // // // //         const existingLearner = get().learners.find(
// // // // // //           (l) => l.enrollmentId === targetId || l.id === targetId,
// // // // // //         );
// // // // // //         const humanId =
// // // // // //           existingLearner?.learnerId || existingLearner?.id || targetId;

// // // // // //         const q = query(
// // // // // //           collection(db, "learner_submissions"),
// // // // // //           where("learnerId", "==", humanId),
// // // // // //           where("moduleType", "in", ["workplace", "qcto_workplace"]),
// // // // // //         );
// // // // // //         const submissionSnap = await getDocs(q);

// // // // // //         if (!submissionSnap.empty) {
// // // // // //           const batch = writeBatch(db);
// // // // // //           submissionSnap.forEach((docSnap) => {
// // // // // //             batch.update(docSnap.ref, {
// // // // // //               employerId: employerId,
// // // // // //               mentorId: mentorId,
// // // // // //               updatedAt: now(),
// // // // // //             });
// // // // // //           });
// // // // // //           await batch.commit();
// // // // // //         }

// // // // // //         await get().fetchLearners(true);
// // // // // //         if (get().fetchSubmissions) await get().fetchSubmissions();
// // // // // //       } catch (error: any) {
// // // // // //         console.error("Failed to update placement in Firebase:", error);
// // // // // //         throw new Error(error.message);
// // // // // //       }
// // // // // //     },
// // // // // //   })),
// // // // // // );
