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
  arrayUnion, // 🚀 Added for Cohort updates
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

// const GLOBAL_SDP_CODE = import.meta.env.VITE_SDP_CODE || "SDP070824115131";

const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
const now = () => new Date().toISOString();

// 🚀 NEW: The Enrollment Record Type for the Learner "Backpack"
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
  role: "admin" | "facilitator" | "assessor" | "moderator" | "mentor"; // Added 'mentor'
  phone?: string;
  assessorRegNumber?: string; // New field for SETA registration
  employerId?: string; // New field for Mentor workplace linking
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

// Helper to determine which fields belong to the Profile (Human) vs Enrollment (Course)
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
];

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
  archiveCohort: (year: string) => Promise<void>;

  // 🚀 NEW RELATIONAL ACTIONS
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
}

export const useStore = create<StoreState>()(
  immer((set, get, api) => ({
    ...createCohortSlice(set, get, api),

    user: null,
    loading: true,
    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),

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
    // ==================== 🚀 EMPLOYERS SLICE (RELATIONAL UPDATE) 🚀 ====================

    employers: [],
    fetchEmployers: async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "employers"));
        const employersData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Employer[];

        // Sort alphabetically by name
        employersData.sort((a, b) => a.name.localeCompare(b.name));
        set({ employers: employersData });
      } catch (error) {
        console.error("Error fetching employers:", error);
      }
    },

    // ==================== 🚀 LEARNERS SLICE (RELATIONAL UPDATE) 🚀 ====================
    learners: [],
    learnersLoading: false,
    learnersError: null,
    learnersLastFetched: null,

    fetchLearners: async (force = false) => {
      const { learnersLastFetched, learnersLoading } = get();

      if (
        !force &&
        learnersLastFetched &&
        Date.now() - learnersLastFetched < 5 * 60 * 1000
      )
        return;
      if (learnersLoading) return;

      set({ learnersLoading: true, learnersError: null });
      try {
        // 1. Fetch Profiles (The Humans)
        const profilesSnap = await getDocs(query(collection(db, "learners")));
        const profilesMap = new Map<string, any>();

        profilesSnap.docs.forEach((doc) => {
          profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        // 2. Fetch Enrollments (The Academic Records)
        const enrollmentsSnap = await getDocs(
          query(collection(db, "enrollments")),
        );
        const combinedLearners: DashboardLearner[] = [];

        // Track which profiles have been mapped to an enrollment
        const usedProfileIds = new Set<string>();

        // Step A: Map New Relational Data
        enrollmentsSnap.docs.forEach((docSnap) => {
          const enrollment = docSnap.data();
          const profile = profilesMap.get(enrollment.learnerId);

          if (profile) {
            usedProfileIds.add(profile.id);
            combinedLearners.push({
              ...profile,
              ...enrollment,
              id: docSnap.id, // Unique Row ID
              enrollmentId: docSnap.id, // Academic Record ID
              learnerId: profile.id, // Human Identity ID
            } as DashboardLearner);
          }
        });

        // Step B: Map Legacy Flat Data
        profilesMap.forEach((profile, profileId) => {
          if (!usedProfileIds.has(profileId) && profile.cohortId) {
            combinedLearners.push({
              ...profile,
              id: profileId,
              enrollmentId: profileId,
              learnerId: profileId,
            } as DashboardLearner);
          }
        });

        combinedLearners.sort((a, b) =>
          (a.fullName || "").localeCompare(b.fullName || ""),
        );

        set({
          learners: combinedLearners,
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

    addLearner: async (payload) => {
      try {
        const timestamp = now();
        const profileData: any = {};
        const enrollmentData: any = {};

        // 1. Split payload into Profile (Human) vs Enrollment (Academic)
        Object.keys(payload).forEach((key) => {
          if (PROFILE_KEYS.includes(key))
            profileData[key] = (payload as any)[key];
          else enrollmentData[key] = (payload as any)[key];
        });

        profileData.createdAt = timestamp;
        profileData.createdBy = USER_ID;

        enrollmentData.createdAt = timestamp;
        enrollmentData.createdBy = USER_ID;
        enrollmentData.isDraft = false;
        enrollmentData.isArchived = false;
        enrollmentData.status = "in-progress";

        // 🚀 CRITICAL FIX: Generate SoR ID and permanently lock the issueDate
        if (!enrollmentData.verificationCode) {
          const issueDate = enrollmentData.issueDate || timestamp.split("T")[0];
          const name = profileData.fullName || "Unknown Learner";
          const providerCode =
            import.meta.env.VITE_SDP_CODE || "SDP070824115131";

          enrollmentData.verificationCode = generateSorId(
            name,
            issueDate,
            providerCode,
          );
          enrollmentData.issueDate = issueDate; // 👈 LOCK THE DATE FOREVER
        }

        let finalLearnerId = "";

        // 2. Check if this human already exists
        const q = query(
          collection(db, "learners"),
          where("idNumber", "==", profileData.idNumber),
        );
        const existingSnap = await getDocs(q);

        if (!existingSnap.empty) {
          finalLearnerId = existingSnap.docs[0].id;
          await updateDoc(doc(db, "learners", finalLearnerId), {
            ...profileData,
            updatedAt: timestamp,
          });
        } else {
          const newProfileRef = await addDoc(
            collection(db, "learners"),
            profileData,
          );
          finalLearnerId = newProfileRef.id;
        }

        // 3. Save the new Enrollment record
        enrollmentData.learnerId = finalLearnerId;
        const newEnrollmentRef = await addDoc(
          collection(db, "enrollments"),
          enrollmentData,
        );

        // 4. Update local state
        set((state) => {
          state.learners.push({
            ...profileData,
            ...enrollmentData,
            id: newEnrollmentRef.id,
            enrollmentId: newEnrollmentRef.id,
            learnerId: finalLearnerId,
          } as DashboardLearner);
        });
      } catch (error) {
        console.error("Failed to add learner", error);
        throw error;
      }
    },

    updateLearner: async (id, updates) => {
      try {
        const existingRow = get().learners.find((l) => l.id === id);
        if (!existingRow) throw new Error("Record not found in local state");

        const learnerId = existingRow.learnerId;
        const enrollmentId = existingRow.enrollmentId;

        const profileUpdates: any = { updatedAt: now(), updatedBy: USER_ID };
        const enrollmentUpdates: any = { updatedAt: now(), updatedBy: USER_ID };
        let hasProfileUpdate = false;
        let hasEnrollmentUpdate = false;

        Object.keys(updates).forEach((key) => {
          if (PROFILE_KEYS.includes(key)) {
            profileUpdates[key] = (updates as any)[key];
            hasProfileUpdate = true;
          } else {
            enrollmentUpdates[key] = (updates as any)[key];
            hasEnrollmentUpdate = true;
          }
        });

        const batch = writeBatch(db);

        if (hasProfileUpdate && learnerId) {
          batch.update(doc(db, "learners", learnerId), profileUpdates);
        }

        if (hasEnrollmentUpdate && enrollmentId) {
          const enrolRef = doc(db, "enrollments", enrollmentId);
          const enrolSnap = await getDoc(enrolRef);
          if (enrolSnap.exists()) {
            batch.update(enrolRef, enrollmentUpdates);
          } else {
            batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
          }
        }

        await batch.commit();

        set((state) => {
          const index = state.learners.findIndex((l) => l.id === id);
          if (index !== -1) {
            state.learners[index] = { ...state.learners[index], ...updates };
          }
        });
      } catch (error) {
        console.error("Failed to update learner", error);
        throw error;
      }
    },

    // ════════════════════════════════════════════════════════════════
    // 🚀 NEW: RELATIONAL ENROLLMENT ACTIONS 🚀
    // ════════════════════════════════════════════════════════════════

    enrollLearnerInCohort: async (
      learnerId: string,
      cohortId: string,
      programmeId: string,
    ) => {
      try {
        const newEnrollment: EnrollmentRecord = {
          cohortId,
          programmeId,
          status: "active",
          dateAssigned: now(),
        };

        const learnerRef = doc(db, "learners", learnerId);
        const learnerSnap = await getDoc(learnerRef);

        if (learnerSnap.exists()) {
          const data = learnerSnap.data();
          const history = data.enrollmentHistory || [];

          // Remove existing entry for this specific class to cleanly overwrite
          const filteredHistory = history.filter(
            (h: any) => h.cohortId !== cohortId,
          );
          filteredHistory.push(newEnrollment);

          await updateDoc(learnerRef, {
            enrollmentHistory: filteredHistory,
            cohortId: cohortId, // Keep legacy field updated for older views
            updatedAt: now(),
          });
        }

        // Add learner to the Cohort's roster
        const cohortRef = doc(db, "cohorts", cohortId);
        await updateDoc(cohortRef, {
          learnerIds: arrayUnion(learnerId),
        });

        await get().fetchLearners(true);
        if ((get() as any).fetchCohorts) {
          await (get() as any).fetchCohorts();
        }
      } catch (error) {
        console.error("Error enrolling learner:", error);
        throw error;
      }
    },

    dropLearnerFromCohort: async (
      learnerId: string,
      cohortId: string,
      reason: string,
    ) => {
      try {
        const learnerRef = doc(db, "learners", learnerId);
        const learnerSnap = await getDoc(learnerRef);

        if (learnerSnap.exists()) {
          const data = learnerSnap.data();
          const history = data.enrollmentHistory || [];

          // Find specific class and mark as dropped
          const updatedHistory = history.map((h: any) => {
            if (h.cohortId === cohortId) {
              return {
                ...h,
                status: "dropped",
                exitDate: now(),
                exitReason: reason,
              };
            }
            return h;
          });

          await updateDoc(learnerRef, {
            enrollmentHistory: updatedHistory,
            status: "dropped", // Legacy fallback
            updatedAt: now(),
          });

          await get().fetchLearners(true);
        }
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

        // Auto-stamp Mentor ID if it's a workplace module
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

        // 1. CREATE THE AUDIT LOG (Acts as a backup and accountability trail)
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
          dataSnapshot: existingRow, // 🚀 Saves a snapshot of the learner just in case you ever need to restore them manually!
        });

        // 2. DELETE THE ENROLLMENT (The Academic Record)
        const enrolId = existingRow.enrollmentId || id;
        batch.delete(doc(db, "enrollments", enrolId));

        // 3. DELETE THE PROFILE (The Human Record)
        const humanId = existingRow.learnerId || id;
        batch.delete(doc(db, "learners", humanId));

        // 4. FIND AND DELETE ALL LINKED ASSESSMENTS/SUBMISSIONS
        const subQ = query(
          collection(db, "learner_submissions"),
          where("enrollmentId", "==", enrolId),
        );
        const subSnap = await getDocs(subQ);
        subSnap.forEach((subDoc) => {
          batch.delete(subDoc.ref);
        });

        // 5. EXECUTE ALL DELETES AND LOGS AT ONCE
        await batch.commit();

        // 6. UPDATE LOCAL UI STATE INSTANTLY
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
        alert(`Successfully archived ${count} enrollments.`);
      } else {
        alert(`No active enrollments found for ${year}.`);
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
      const functions = getFunctions();
      const createAccountFn = httpsCallable(functions, "createLearnerAccount");

      try {
        const batch = writeBatch(db);
        const approvedIds = new Set<string>();

        await Promise.all(
          learnersToApprove.map(async (l) => {
            try {
              const result = await createAccountFn({
                email: l.email,
                fullName: l.fullName,
                role: "learner",
                password: "TemporaryPassword123!",
              });
              const data = result.data as any;
              const authUid = data.uid || l.id;

              const profileData: any = { id: authUid };
              const enrollmentData: any = {};

              Object.keys(l).forEach((key) => {
                if (PROFILE_KEYS.includes(key))
                  profileData[key] = (l as any)[key];
                else enrollmentData[key] = (l as any)[key];
              });

              profileData.authStatus = "active";
              profileData.updatedAt = now();

              enrollmentData.learnerId = authUid;
              enrollmentData.isDraft = false;
              enrollmentData.status = "active";
              enrollmentData.approvedAt = now();
              enrollmentData.approvedBy = USER_ID;

              const profileRef = doc(db, "learners", authUid);
              batch.set(profileRef, profileData, { merge: true });

              const enrollmentRef = doc(collection(db, "enrollments"));
              batch.set(enrollmentRef, enrollmentData);

              const stagingRef = doc(db, "staging_learners", l.id);
              batch.delete(stagingRef);

              approvedIds.add(l.id);
            } catch (err) {
              console.error(`Failed to create account for ${l.email}`, err);
            }
          }),
        );

        await batch.commit();

        set((state) => {
          state.stagingLearners = state.stagingLearners.filter(
            (l) => !approvedIds.has(l.id),
          );
          state.learnersLoading = false;
        });

        await get().fetchLearners(true);
        alert(`Process Complete. Accounts created and enrollments mapped.`);
      } catch (e) {
        console.error(e);
        set((state) => {
          state.learnersLoading = false;
        });
        alert("Error during approval process.");
      }
    },

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
          await updateDoc(learnerRef, {
            authStatus: "active",
            invitedAt: now(),
          });

          set((state) => {
            const idx = state.learners.findIndex((l) => l.id === learner.id);
            if (idx !== -1) state.learners[idx].authStatus = "active";
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
        if (error.message.includes("already exists")) {
          alert("This user is already registered.");
        } else {
          alert(`Failed to invite: ${error.message}`);
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

    // Fetch settings from Firebase
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

          alert(`Success! Account created for ${newStaff.fullName}.`);
        }
      } catch (error: any) {
        let errorMessage = "Failed to create account.";
        if (error.code === "functions/permission-denied")
          errorMessage = "You do not have permission to create staff.";
        else if (error.code === "functions/already-exists")
          errorMessage = "A user with this email already exists.";
        else if (error.message) errorMessage = error.message;

        set({ staffLoading: false, staffError: errorMessage });
        alert(errorMessage);
        throw new Error(errorMessage);
      }
    },

    deleteStaff: async (id) => {
      try {
        await deleteDoc(doc(db, "users", id));
        set((state) => {
          state.staff = state.staff.filter((s) => s.id !== id);
        });
      } catch (error) {
        throw error;
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
              resolve({ success: 0, errors: ["CSV file is empty"] });
              return;
            }

            rawData.forEach((row, index) => {
              try {
                const getStr = (val: any): string =>
                  val !== null && val !== undefined ? String(val).trim() : "";
                const idNumber = getStr(row.NationalId || row.ID_Number);

                // 🚀 Extract the issueDate right away, fallback to today if missing
                const issueDateStr =
                  getStr(row.StatementofResultsIssueDate) ||
                  now().split("T")[0];
                const providerCode =
                  getStr(row.SDPCode) ||
                  import.meta.env.VITE_SDP_CODE ||
                  "SDP070824115131";

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

                  const newLearner = {
                    fullName,
                    idNumber,
                    dateOfBirth: parseYYYYMMDD(
                      getStr(row.LearnerBirthDate || row.Date_Of_Birth),
                    ),
                    email: getStr(row.LearnerEmailAddress || row.Email),
                    phone: getStr(
                      row.LearnerCellPhoneNumber ||
                        row.Phone ||
                        row.LearnerPhoneNumber,
                    ),
                    trainingStartDate: getStr(
                      row.TrainingStartDate || row.Training_Start_Date,
                    )
                      ? parseYYYYMMDD(
                          getStr(
                            row.TrainingStartDate || row.Training_Start_Date,
                          ),
                        )
                      : now().split("T")[0],
                    isArchived: false,
                    isDraft: true,
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

                    // 🚀 CRITICAL: Bind the generated ID to the extracted date, and save that date!
                    verificationCode:
                      getStr(row.Verification_Code) ||
                      generateSorId(fullName, issueDateStr, providerCode),
                    issueDate: issueDateStr, // 👈 LOCK THE DATE FOREVER

                    status: "in-progress",
                    demographics: {
                      sdpCode: getStr(row.SDPCode),
                    },
                    createdAt: now(),
                    createdBy: USER_ID,
                  };
                  learnersMap.set(idNumber, newLearner);
                }
              } catch (err) {
                errors.push(
                  `Row ${index + 2} Error: ${(err as Error).message}`,
                );
              }
            });

            try {
              const batch = writeBatch(db);
              learnersMap.forEach((learner) => {
                batch.set(
                  doc(db, "staging_learners", learner.idNumber),
                  learner,
                );
              });
              await batch.commit();
              await get().fetchStagingLearners();
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

    updateLearnerPlacement: async (targetId, employerId, mentorId) => {
      try {
        const payload = {
          employerId,
          mentorId,
          placementDate: now(),
          updatedAt: now(),
        };

        // 1. Save to Enrollment and Profile
        await setDoc(doc(db, "enrollments", targetId), payload, {
          merge: true,
        });
        await setDoc(doc(db, "learners", targetId), payload, { merge: true });

        // 2. Find this learner's human ID
        const existingLearner = get().learners.find(
          (l) => l.enrollmentId === targetId || l.id === targetId,
        );
        const humanId =
          existingLearner?.learnerId || existingLearner?.id || targetId;

        // Find all their Workplace Submissions and stamp the Mentor ID!
        const q = query(
          collection(db, "learner_submissions"),
          where("learnerId", "==", humanId),
          where("moduleType", "in", ["workplace", "qcto_workplace"]), // Catch workplace modules
        );
        const submissionSnap = await getDocs(q);

        if (!submissionSnap.empty) {
          const batch = writeBatch(db);
          submissionSnap.forEach((docSnap) => {
            batch.update(docSnap.ref, {
              employerId: employerId,
              mentorId: mentorId, // 👈 Stamping it directly on the document
              updatedAt: now(),
            });
          });
          await batch.commit();
        }

        await get().fetchLearners(true);
        if (get().fetchSubmissions) await get().fetchSubmissions();
      } catch (error: any) {
        console.error("Failed to update placement in Firebase:", error);
        throw new Error(error.message);
      }
    },
  })),
);

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
// } from "firebase/firestore";
// import Papa from "papaparse";
// import type {
//   Cohort,
//   DashboardLearner,
//   ProgrammeTemplate,
//   LearnerProfile,
//   LearnerEnrollment,
// } from "../types";
// import type { UserProfile, UserRole } from "../types/auth.types";
// import { getAuth } from "firebase/auth";
// import {
//   createCohortSlice,
//   type CohortSlice,
// } from "./slices/cohortSlice.ts/cohortSlice";

// const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// const now = () => new Date().toISOString();

// export interface StaffMember {
//   id: string;
//   fullName: string;
//   email: string;
//   role: UserRole;
//   phone?: string;
//   createdAt: string;
//   authUid: string;
// }

// export interface AttendanceRecord {
//   id?: string;
//   cohortId: string;
//   date: string;
//   facilitatorId: string;
//   presentLearners: string[];
//   notes?: string;
// }

// // Helper to determine which fields belong to the Profile (Human) vs Enrollment (Course)
// const PROFILE_KEYS = [
//   "fullName",
//   "firstName",
//   "lastName",
//   "idNumber",
//   "dateOfBirth",
//   "email",
//   "phone",
//   "mobile",
//   "profilePhotoUrl", // 🚀 Included for completeness
//   "profileCompleted",
//   "authUid",
//   "uid",
//   "authStatus",
//   "demographics",
// ];

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

//   fetchLearners: (force?: boolean) => Promise<void>;
//   fetchStagingLearners: () => Promise<void>;

//   approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
//   inviteLearner: (learner: DashboardLearner) => Promise<void>;
//   discardStagingLearners: (ids: string[]) => Promise<void>;

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
//   restoreLearner: (id: string) => Promise<void>;
//   dropLearner: (id: string, reason: string) => Promise<void>;
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

//   // --- STAFF SLICE ---
//   staff: StaffMember[];
//   staffLoading: boolean;
//   staffError: string | null;
//   fetchStaff: (force?: boolean) => Promise<void>;
//   addStaff: (staff: Omit<StaffMember, "id" | "createdAt">) => Promise<void>;
//   deleteStaff: (id: string) => Promise<void>;
//   updateStaffProfile: (uid: string, updates: any) => Promise<void>;

//   // --- BULK IMPORT ACTIONS ---
//   importUnifiedLearners: (
//     file: File,
//   ) => Promise<{ success: number; errors: string[] }>;
//   importProgrammesFromCSV: (
//     file: File,
//   ) => Promise<{ success: number; errors: string[] }>;

//   // 🚀 CRITICAL NEW FUNCTION: Used to safely assign assessments to specific enrollments
//   assignAssessmentToLearner: (
//     assessmentTemplate: any,
//     learner: DashboardLearner,
//   ) => Promise<string>;
// }

// export const useStore = create<StoreState>()(
//   immer((set, get, api) => ({
//     ...createCohortSlice(set, get, api),

//     user: null,
//     loading: true,
//     setUser: (user) => set({ user }),
//     setLoading: (loading) => set({ loading }),

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

//     // ==================== 🚀 LEARNERS SLICE (RELATIONAL UPDATE) 🚀 ====================
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
//         // 1. Fetch Profiles (The Humans)
//         const profilesSnap = await getDocs(query(collection(db, "learners")));
//         const profilesMap = new Map<string, any>();

//         profilesSnap.docs.forEach((doc) => {
//           profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
//         });

//         // 2. Fetch Enrollments (The Academic Records)
//         const enrollmentsSnap = await getDocs(
//           query(collection(db, "enrollments")),
//         );
//         const combinedLearners: DashboardLearner[] = [];

//         // Track which profiles have been mapped to an enrollment
//         const usedProfileIds = new Set<string>();

//         // Step A: Map New Relational Data
//         enrollmentsSnap.docs.forEach((docSnap) => {
//           const enrollment = docSnap.data();
//           const profile = profilesMap.get(enrollment.learnerId);

//           if (profile) {
//             usedProfileIds.add(profile.id);
//             combinedLearners.push({
//               ...profile,
//               ...enrollment,
//               id: docSnap.id, // Unique Row ID
//               enrollmentId: docSnap.id, // Academic Record ID
//               learnerId: profile.id, // Human Identity ID
//             } as DashboardLearner);
//           }
//         });

//         // Step B: Map Legacy Flat Data
//         // If a profile wasn't used above, BUT it has a cohortId, it's a legacy flat record that needs to be displayed.
//         profilesMap.forEach((profile, profileId) => {
//           if (!usedProfileIds.has(profileId) && profile.cohortId) {
//             combinedLearners.push({
//               ...profile,
//               id: profileId,
//               enrollmentId: profileId,
//               learnerId: profileId,
//             } as DashboardLearner);
//           }
//         });

//         combinedLearners.sort((a, b) =>
//           (a.fullName || "").localeCompare(b.fullName || ""),
//         );

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
//       try {
//         const timestamp = now();

//         // 1. SPLIT DATA
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

//         let finalLearnerId = "";

//         // 2. CHECK IF HUMAN EXISTS (By ID Number)
//         const q = query(
//           collection(db, "learners"),
//           where("idNumber", "==", profileData.idNumber),
//         );
//         const existingSnap = await getDocs(q);

//         if (!existingSnap.empty) {
//           // Use existing human
//           finalLearnerId = existingSnap.docs[0].id;
//           await updateDoc(doc(db, "learners", finalLearnerId), {
//             ...profileData,
//             updatedAt: timestamp,
//           });
//         } else {
//           // Create new human
//           const newProfileRef = await addDoc(
//             collection(db, "learners"),
//             profileData,
//           );
//           finalLearnerId = newProfileRef.id;
//         }

//         // 3. CREATE ENROLLMENT RECORD
//         enrollmentData.learnerId = finalLearnerId;
//         const newEnrollmentRef = await addDoc(
//           collection(db, "enrollments"),
//           enrollmentData,
//         );

//         // 4. UPDATE UI
//         const newDashboardRow = {
//           ...profileData,
//           ...enrollmentData,
//           id: newEnrollmentRef.id,
//           enrollmentId: newEnrollmentRef.id,
//           learnerId: finalLearnerId,
//         } as DashboardLearner;

//         set((state) => {
//           state.learners.push(newDashboardRow);
//         });
//       } catch (error) {
//         console.error("Failed to add learner", error);
//         throw error;
//       }
//     },

//     updateLearner: async (id, updates) => {
//       try {
//         // Find the record to know the actual LearnerId and EnrollmentId
//         const existingRow = get().learners.find((l) => l.id === id);
//         if (!existingRow) throw new Error("Record not found in local state");

//         const learnerId = existingRow.learnerId;
//         const enrollmentId = existingRow.enrollmentId;

//         const profileUpdates: any = { updatedAt: now(), updatedBy: USER_ID };
//         const enrollmentUpdates: any = { updatedAt: now(), updatedBy: USER_ID };
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

//         // Update Profile
//         if (hasProfileUpdate && learnerId) {
//           batch.update(doc(db, "learners", learnerId), profileUpdates);
//         }

//         // Update Academic Record (Enrollment)
//         if (hasEnrollmentUpdate && enrollmentId) {
//           const enrolRef = doc(db, "enrollments", enrollmentId);
//           const enrolSnap = await getDoc(enrolRef);
//           if (enrolSnap.exists()) {
//             batch.update(enrolRef, enrollmentUpdates);
//           } else {
//             batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
//           }
//         }

//         await batch.commit();

//         set((state) => {
//           const index = state.learners.findIndex((l) => l.id === id);
//           if (index !== -1) {
//             state.learners[index] = { ...state.learners[index], ...updates };
//           }
//         });
//       } catch (error) {
//         console.error("Failed to update learner", error);
//         throw error;
//       }
//     },

//     // 🚀 NEW ASSIGNMENT LOGIC FOR PORTFOLIOS 🚀
//     assignAssessmentToLearner: async (assessmentTemplate, learner) => {
//       try {
//         const timestamp = now();
//         // ENSURE WE ARE TARGETING THE SPECIFIC ENROLLMENT
//         const submissionData = {
//           assessmentId: assessmentTemplate.id,
//           title: assessmentTemplate.title,
//           type: assessmentTemplate.type,
//           moduleType: assessmentTemplate.moduleType || "knowledge",
//           moduleNumber: assessmentTemplate.moduleNumber || "",

//           learnerId: learner.learnerId || learner.id,
//           enrollmentId: learner.enrollmentId || learner.id,
//           qualificationName: learner.qualification?.name || "",

//           status: "not_started",
//           assignedAt: timestamp,
//           marks: 0,
//           totalMarks: assessmentTemplate.totalMarks || 0,
//           createdAt: timestamp,
//           createdBy: USER_ID,
//         };

//         const docRef = await addDoc(
//           collection(db, "learner_submissions"),
//           submissionData,
//         );
//         return docRef.id;
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
//         alert(`Successfully archived ${count} enrollments.`);
//       } else {
//         alert(`No active enrollments found for ${year}.`);
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

//     approveStagingLearners: async (learnersToApprove) => {
//       set((state) => {
//         state.learnersLoading = true;
//       });
//       const functions = getFunctions();
//       const createAccountFn = httpsCallable(functions, "createLearnerAccount");

//       try {
//         const batch = writeBatch(db);
//         const approvedIds = new Set<string>();

//         await Promise.all(
//           learnersToApprove.map(async (l) => {
//             try {
//               // 1. Create Auth Account
//               const result = await createAccountFn({
//                 email: l.email,
//                 fullName: l.fullName,
//                 role: "learner",
//                 password: "TemporaryPassword123!",
//               });
//               const data = result.data as any;
//               const authUid = data.uid || l.id;

//               // 2. Split Data
//               const profileData: any = { id: authUid };
//               const enrollmentData: any = {};

//               Object.keys(l).forEach((key) => {
//                 if (PROFILE_KEYS.includes(key))
//                   profileData[key] = (l as any)[key];
//                 else enrollmentData[key] = (l as any)[key];
//               });

//               profileData.authStatus = "active";
//               profileData.updatedAt = now();

//               enrollmentData.learnerId = authUid;
//               enrollmentData.isDraft = false;
//               enrollmentData.status = "active";
//               enrollmentData.approvedAt = now();
//               enrollmentData.approvedBy = USER_ID;

//               // 3. Add to batch (Profile)
//               const profileRef = doc(db, "learners", authUid);
//               batch.set(profileRef, profileData, { merge: true });

//               // 4. Add to batch (Enrollment)
//               const enrollmentRef = doc(collection(db, "enrollments"));
//               batch.set(enrollmentRef, enrollmentData);

//               // 5. Delete staging
//               const stagingRef = doc(db, "staging_learners", l.id);
//               batch.delete(stagingRef);

//               approvedIds.add(l.id);
//             } catch (err) {
//               console.error(`Failed to create account for ${l.email}`, err);
//             }
//           }),
//         );

//         await batch.commit();

//         set((state) => {
//           state.stagingLearners = state.stagingLearners.filter(
//             (l) => !approvedIds.has(l.id),
//           );
//           state.learnersLoading = false;
//         });

//         await get().fetchLearners(true);
//         alert(`Process Complete. Accounts created and enrollments mapped.`);
//       } catch (e) {
//         console.error(e);
//         set((state) => {
//           state.learnersLoading = false;
//         });
//         alert("Error during approval process.");
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

//           alert(`Invite sent to ${learner.email}`);
//         } else {
//           throw new Error(data.message || "Unknown error");
//         }
//       } catch (error: any) {
//         console.error(error);
//         set((state) => {
//           state.learnersLoading = false;
//         });
//         if (error.message.includes("already exists")) {
//           alert("This user is already registered.");
//         } else {
//           alert(`Failed to invite: ${error.message}`);
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
//         });
//         const data = result.data as any;
//         if (data.success) {
//           const createdStaff = {
//             ...newStaff,
//             id: data.uid || "temp-id-" + Date.now(),
//             createdAt: now(),
//             signatureUrl: "",
//           } as StaffMember;
//           set((state) => {
//             state.staff.push(createdStaff);
//             state.staffLoading = false;
//           });
//           alert(`Success! Account created for ${newStaff.fullName}.`);
//         }
//       } catch (error: any) {
//         let errorMessage = "Failed to create account.";
//         if (error.code === "functions/permission-denied")
//           errorMessage = "You do not have permission to create staff.";
//         else if (error.code === "functions/already-exists")
//           errorMessage = "A user with this email already exists.";
//         else if (error.message) errorMessage = error.message;

//         set({ staffLoading: false, staffError: errorMessage });
//         alert(errorMessage);
//         throw new Error(errorMessage);
//       }
//     },

//     deleteStaff: async (id) => {
//       try {
//         await deleteDoc(doc(db, "users", id));
//         set((state) => {
//           state.staff = state.staff.filter((s) => s.id !== id);
//         });
//       } catch (error) {
//         throw error;
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

//     // ==================== IMPORTS ====================
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
//               resolve({ success: 0, errors: ["CSV file is empty"] });
//               return;
//             }

//             rawData.forEach((row, index) => {
//               try {
//                 const getStr = (val: any): string =>
//                   val !== null && val !== undefined ? String(val).trim() : "";
//                 const idNumber = getStr(row.NationalId || row.ID_Number);
//                 if (!idNumber) return;

//                 if (!learnersMap.has(idNumber)) {
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

//                   const newLearner = {
//                     fullName,
//                     idNumber,
//                     dateOfBirth: parseYYYYMMDD(
//                       getStr(row.LearnerBirthDate || row.Date_Of_Birth),
//                     ),
//                     email: getStr(row.LearnerEmailAddress || row.Email),
//                     phone: getStr(
//                       row.LearnerCellPhoneNumber ||
//                         row.Phone ||
//                         row.LearnerPhoneNumber,
//                     ),
//                     trainingStartDate: getStr(
//                       row.TrainingStartDate || row.Training_Start_Date,
//                     )
//                       ? parseYYYYMMDD(
//                           getStr(
//                             row.TrainingStartDate || row.Training_Start_Date,
//                           ),
//                         )
//                       : now().split("T")[0],
//                     isArchived: false,
//                     isDraft: true,
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
//                       now().split("T")[0],
//                     status: "in-progress",
//                     demographics: {
//                       sdpCode: getStr(row.SDPCode),
//                     },
//                     createdAt: now(),
//                     createdBy: USER_ID,
//                   };
//                   learnersMap.set(idNumber, newLearner);
//                 }
//               } catch (err) {
//                 errors.push(
//                   `Row ${index + 2} Error: ${(err as Error).message}`,
//                 );
//               }
//             });

//             try {
//               const batch = writeBatch(db);
//               learnersMap.forEach((learner) => {
//                 batch.set(
//                   doc(db, "staging_learners", learner.idNumber),
//                   learner,
//                 );
//               });
//               await batch.commit();
//               await get().fetchStagingLearners();
//               resolve({ success: learnersMap.size, errors });
//             } catch (error) {
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
//   })),
// );

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
// // } from "firebase/firestore";
// // import Papa from "papaparse";
// // import type {
// //   Cohort,
// //   DashboardLearner,
// //   ProgrammeTemplate,
// //   LearnerProfile,
// //   LearnerEnrollment,
// // } from "../types";
// // import type { UserProfile, UserRole } from "../types/auth.types";
// // import { getAuth } from "firebase/auth";
// // import {
// //   createCohortSlice,
// //   type CohortSlice,
// // } from "./slices/cohortSlice.ts/cohortSlice";

// // const USER_ID = getAuth().currentUser?.uid || "UnknownUser";
// // const now = () => new Date().toISOString();

// // export interface StaffMember {
// //   id: string;
// //   fullName: string;
// //   email: string;
// //   role: UserRole;
// //   phone?: string;
// //   createdAt: string;
// //   authUid: string;
// // }

// // export interface AttendanceRecord {
// //   id?: string;
// //   cohortId: string;
// //   date: string;
// //   facilitatorId: string;
// //   presentLearners: string[];
// //   notes?: string;
// // }

// // // Helper to determine which fields belong to the Profile (Human) vs Enrollment (Course)
// // const PROFILE_KEYS = [
// //   "fullName",
// //   "firstName",
// //   "lastName",
// //   "idNumber",
// //   "dateOfBirth",
// //   "email",
// //   "phone",
// //   "mobile",
// //   "profileCompleted",
// //   "authUid",
// //   "uid",
// //   "authStatus",
// //   "demographics",
// // ];

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

// //   fetchLearners: (force?: boolean) => Promise<void>;
// //   fetchStagingLearners: () => Promise<void>;

// //   approveStagingLearners: (learners: DashboardLearner[]) => Promise<void>;
// //   inviteLearner: (learner: DashboardLearner) => Promise<void>;
// //   discardStagingLearners: (ids: string[]) => Promise<void>;

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
// //   restoreLearner: (id: string) => Promise<void>;
// //   dropLearner: (id: string, reason: string) => Promise<void>;
// //   archiveCohort: (year: string) => Promise<void>;

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
// //   deleteStaff: (id: string) => Promise<void>;
// //   updateStaffProfile: (uid: string, updates: any) => Promise<void>;

// //   // --- BULK IMPORT ACTIONS ---
// //   importUnifiedLearners: (
// //     file: File,
// //   ) => Promise<{ success: number; errors: string[] }>;
// //   importProgrammesFromCSV: (
// //     file: File,
// //   ) => Promise<{ success: number; errors: string[] }>;
// // }

// // export const useStore = create<StoreState>()(
// //   immer((set, get, api) => ({
// //     ...createCohortSlice(set, get, api),

// //     user: null,
// //     loading: true,
// //     setUser: (user) => set({ user }),
// //     setLoading: (loading) => set({ loading }),

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

// //     // ==================== 🚀 LEARNERS SLICE (RELATIONAL UPDATE) 🚀 ====================
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
// //         // 1. Fetch Profiles (The Humans)
// //         const profilesSnap = await getDocs(query(collection(db, "learners")));
// //         const profilesMap = new Map<string, any>();

// //         profilesSnap.docs.forEach((doc) => {
// //           profilesMap.set(doc.id, { id: doc.id, ...doc.data() });
// //         });

// //         // 2. Fetch Enrollments (The Academic Records)
// //         const enrollmentsSnap = await getDocs(
// //           query(collection(db, "enrollments")),
// //         );
// //         const combinedLearners: DashboardLearner[] = [];

// //         // Track which profiles have been mapped to an enrollment
// //         const usedProfileIds = new Set<string>();

// //         // Step A: Map New Relational Data
// //         enrollmentsSnap.docs.forEach((docSnap) => {
// //           const enrollment = docSnap.data();
// //           const profile = profilesMap.get(enrollment.learnerId);

// //           if (profile) {
// //             usedProfileIds.add(profile.id);
// //             combinedLearners.push({
// //               ...profile,
// //               ...enrollment,
// //               id: docSnap.id, // Unique Row ID
// //               enrollmentId: docSnap.id, // Academic Record ID
// //               learnerId: profile.id, // Human Identity ID
// //             } as DashboardLearner);
// //           }
// //         });

// //         // Step B: Map Legacy Flat Data (The fix!)
// //         // If a profile wasn't used above, BUT it has a cohortId, it's a legacy flat record that needs to be displayed.
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

// //     // fetchLearners: async (force = false) => {
// //     //   const { learnersLastFetched, learnersLoading } = get();

// //     //   if (
// //     //     !force &&
// //     //     learnersLastFetched &&
// //     //     Date.now() - learnersLastFetched < 5 * 60 * 1000
// //     //   )
// //     //     return;
// //     //   if (learnersLoading) return;

// //     //   set({ learnersLoading: true, learnersError: null });
// //     //   try {
// //     //     // 1. Fetch Profiles (The Humans)
// //     //     const profilesSnap = await getDocs(query(collection(db, "learners")));
// //     //     const profilesMap = new Map<string, any>();

// //     //     profilesSnap.docs.forEach((doc) => {
// //     //       const data = doc.data();
// //     //       profilesMap.set(doc.id, { id: doc.id, ...data });
// //     //     });

// //     //     // 2. Fetch Enrollments (The Academic Records)
// //     //     const enrollmentsSnap = await getDocs(
// //     //       query(collection(db, "enrollments")),
// //     //     );
// //     //     const combinedLearners: DashboardLearner[] = [];

// //     //     enrollmentsSnap.docs.forEach((docSnap) => {
// //     //       const enrollment = docSnap.data();
// //     //       const profile = profilesMap.get(enrollment.learnerId);

// //     //       if (profile) {
// //     //         // JOIN Data: The UI expects `id` to be unique per row, so we use enrollmentId
// //     //         combinedLearners.push({
// //     //           ...profile,
// //     //           ...enrollment,
// //     //           id: docSnap.id, // Unique Row ID
// //     //           enrollmentId: docSnap.id, // Academic Record ID
// //     //           learnerId: profile.id, // Human Identity ID
// //     //         } as DashboardLearner);
// //     //       }
// //     //     });

// //     //     // Fallback for Legacy Flat Data (If enrollments collection is empty during migration)
// //     //     if (combinedLearners.length === 0 && profilesSnap.docs.length > 0) {
// //     //       profilesSnap.docs.forEach((doc) => {
// //     //         const data = doc.data();
// //     //         if (data.cohortId) {
// //     //           // It's a legacy flat record
// //     //           combinedLearners.push({
// //     //             ...data,
// //     //             id: doc.id,
// //     //             enrollmentId: doc.id,
// //     //             learnerId: doc.id,
// //     //           } as DashboardLearner);
// //     //         }
// //     //       });
// //     //     }

// //     //     combinedLearners.sort((a, b) => a.fullName.localeCompare(b.fullName));

// //     //     set({
// //     //       learners: combinedLearners,
// //     //       learnersLoading: false,
// //     //       learnersLastFetched: Date.now(),
// //     //     });
// //     //   } catch (error) {
// //     //     console.error("Fetch error:", error);
// //     //     set({
// //     //       learnersError: (error as Error).message,
// //     //       learnersLoading: false,
// //     //     });
// //     //   }
// //     // },

// //     addLearner: async (payload) => {
// //       try {
// //         const timestamp = now();

// //         // 1. SPLIT DATA
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

// //         let finalLearnerId = "";

// //         // 2. CHECK IF HUMAN EXISTS (By ID Number)
// //         const q = query(
// //           collection(db, "learners"),
// //           where("idNumber", "==", profileData.idNumber),
// //         );
// //         const existingSnap = await getDocs(q);

// //         if (!existingSnap.empty) {
// //           // Use existing human
// //           finalLearnerId = existingSnap.docs[0].id;
// //           await updateDoc(doc(db, "learners", finalLearnerId), {
// //             ...profileData,
// //             updatedAt: timestamp,
// //           });
// //         } else {
// //           // Create new human
// //           const newProfileRef = await addDoc(
// //             collection(db, "learners"),
// //             profileData,
// //           );
// //           finalLearnerId = newProfileRef.id;
// //         }

// //         // 3. CREATE ENROLLMENT RECORD
// //         enrollmentData.learnerId = finalLearnerId;
// //         const newEnrollmentRef = await addDoc(
// //           collection(db, "enrollments"),
// //           enrollmentData,
// //         );

// //         // 4. UPDATE UI
// //         const newDashboardRow = {
// //           ...profileData,
// //           ...enrollmentData,
// //           id: newEnrollmentRef.id,
// //           enrollmentId: newEnrollmentRef.id,
// //           learnerId: finalLearnerId,
// //         } as DashboardLearner;

// //         set((state) => {
// //           state.learners.push(newDashboardRow);
// //         });
// //       } catch (error) {
// //         console.error("Failed to add learner", error);
// //         throw error;
// //       }
// //     },

// //     updateLearner: async (id, updates) => {
// //       try {
// //         // Find the record to know the actual LearnerId and EnrollmentId
// //         const existingRow = get().learners.find((l) => l.id === id);
// //         if (!existingRow) throw new Error("Record not found in local state");

// //         const learnerId = existingRow.learnerId;
// //         const enrollmentId = existingRow.enrollmentId;

// //         const profileUpdates: any = { updatedAt: now(), updatedBy: USER_ID };
// //         const enrollmentUpdates: any = { updatedAt: now(), updatedBy: USER_ID };
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

// //         // Update Profile
// //         if (hasProfileUpdate && learnerId) {
// //           batch.update(doc(db, "learners", learnerId), profileUpdates);
// //         }

// //         // Update Academic Record (Enrollment)
// //         if (hasEnrollmentUpdate && enrollmentId) {
// //           // Fallback for legacy architecture (if enrollmentId is same as learnerId and not in enrollments collection)
// //           const enrolRef = doc(db, "enrollments", enrollmentId);
// //           const enrolSnap = await getDoc(enrolRef);
// //           if (enrolSnap.exists()) {
// //             batch.update(enrolRef, enrollmentUpdates);
// //           } else {
// //             // It's legacy flat structure, update the learner doc directly
// //             batch.update(doc(db, "learners", learnerId), enrollmentUpdates);
// //           }
// //         }

// //         await batch.commit();

// //         set((state) => {
// //           const index = state.learners.findIndex((l) => l.id === id);
// //           if (index !== -1) {
// //             state.learners[index] = { ...state.learners[index], ...updates };
// //           }
// //         });
// //       } catch (error) {
// //         console.error("Failed to update learner", error);
// //         throw error;
// //       }
// //     },

// //     archiveLearner: async (id: string) => {
// //       try {
// //         const existingRow = get().learners.find((l) => l.id === id);
// //         if (!existingRow) return;

// //         // Archive applies to the Enrollment, not the human (they might have other active courses)
// //         const enrolRef = doc(db, "enrollments", existingRow.enrollmentId);
// //         const enrolSnap = await getDoc(enrolRef);

// //         if (enrolSnap.exists()) {
// //           await updateDoc(enrolRef, { isArchived: true, updatedAt: now() });
// //         } else {
// //           // Legacy flat record
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
// //         alert(`Successfully archived ${count} enrollments.`);
// //       } else {
// //         alert(`No active enrollments found for ${year}.`);
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
// //       const functions = getFunctions();
// //       const createAccountFn = httpsCallable(functions, "createLearnerAccount");

// //       try {
// //         const batch = writeBatch(db);
// //         const approvedIds = new Set<string>();

// //         await Promise.all(
// //           learnersToApprove.map(async (l) => {
// //             try {
// //               // 1. Create Auth Account
// //               const result = await createAccountFn({
// //                 email: l.email,
// //                 fullName: l.fullName,
// //                 role: "learner",
// //                 password: "TemporaryPassword123!",
// //               });
// //               const data = result.data as any;
// //               const authUid = data.uid || l.id;

// //               // 2. Split Data
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

// //               // 3. Add to batch (Profile)
// //               const profileRef = doc(db, "learners", authUid);
// //               batch.set(profileRef, profileData, { merge: true });

// //               // 4. Add to batch (Enrollment)
// //               const enrollmentRef = doc(collection(db, "enrollments"));
// //               batch.set(enrollmentRef, enrollmentData);

// //               // 5. Delete staging
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
// //         alert(`Process Complete. Accounts created and enrollments mapped.`);
// //       } catch (e) {
// //         console.error(e);
// //         set((state) => {
// //           state.learnersLoading = false;
// //         });
// //         alert("Error during approval process.");
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

// //           alert(`Invite sent to ${learner.email}`);
// //         } else {
// //           throw new Error(data.message || "Unknown error");
// //         }
// //       } catch (error: any) {
// //         console.error(error);
// //         set((state) => {
// //           state.learnersLoading = false;
// //         });
// //         if (error.message.includes("already exists")) {
// //           alert("This user is already registered.");
// //         } else {
// //           alert(`Failed to invite: ${error.message}`);
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
// //           where("role", "in", ["facilitator", "assessor", "moderator"]),
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
// //             createdAt: data.createdAt || now(),
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
// //         });
// //         const data = result.data as any;
// //         if (data.success) {
// //           const createdStaff = {
// //             ...newStaff,
// //             id: data.uid || "temp-id-" + Date.now(),
// //             createdAt: now(),
// //             signatureUrl: "",
// //           } as StaffMember;
// //           set((state) => {
// //             state.staff.push(createdStaff);
// //             state.staffLoading = false;
// //           });
// //           alert(`Success! Account created for ${newStaff.fullName}.`);
// //         }
// //       } catch (error: any) {
// //         let errorMessage = "Failed to create account.";
// //         if (error.code === "functions/permission-denied")
// //           errorMessage = "You do not have permission to create staff.";
// //         else if (error.code === "functions/already-exists")
// //           errorMessage = "A user with this email already exists.";
// //         else if (error.message) errorMessage = error.message;

// //         set({ staffLoading: false, staffError: errorMessage });
// //         alert(errorMessage);
// //         throw new Error(errorMessage);
// //       }
// //     },

// //     deleteStaff: async (id) => {
// //       try {
// //         await deleteDoc(doc(db, "users", id));
// //         set((state) => {
// //           state.staff = state.staff.filter((s) => s.id !== id);
// //         });
// //       } catch (error) {
// //         throw error;
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
// //       return new Promise((resolve, reject) => {
// //         Papa.parse(file, {
// //           header: true,
// //           skipEmptyLines: true,
// //           transformHeader: (header) => header.trim(),
// //           complete: async (results) => {
// //             // ... (Import logic remains largely the same, writing to staging_learners)
// //             // It gets converted to relational data during approveStagingLearners
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
// //                       `SOR-${Math.floor(Math.random() * 10000)}`,
// //                     issueDate:
// //                       getStr(row.StatementofResultsIssueDate) ||
// //                       now().split("T")[0],
// //                     status: "in-progress",
// //                     demographics: {
// //                       sdpCode: getStr(
// //                         row.SDPCode,
// //                       ) /* ... truncated for brevity, same as before ... */,
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
// //       // ... (Keep existing implementation)
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
// //   })),
// // );
