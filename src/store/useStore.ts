import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import Papa from "papaparse";
import type { DashboardLearner, ProgrammeTemplate } from "../types";

// ---------- Test user ID (replace with actual auth later) ----------
const TEST_USER_ID = "test-user-123";

// ---------- Helper to generate ISO timestamp ----------
const now = () => new Date().toISOString();

// ---------- Store State Interface ----------
interface StoreState {
  // Learners
  learners: DashboardLearner[];
  learnersLoading: boolean;
  learnersError: string | null;
  learnersLastFetched: number | null;

  fetchLearners: (force?: boolean) => Promise<void>;
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
  deleteLearner: (id: string) => Promise<void>;

  // Unified Import (Handles both Registration & Results in one file)
  importUnifiedLearners: (
    file: File,
  ) => Promise<{ success: number; errors: string[] }>;

  // Programmes
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
  importProgrammesFromCSV: (
    file: File,
  ) => Promise<{ success: number; errors: string[] }>;
  archiveCohort: (year: string) => Promise<void>;
}

// ---------- Create Store ----------
export const useStore = create<StoreState>()(
  immer((set, get) => ({
    // ==================== LEARNERS ====================
    learners: [],
    learnersLoading: false,
    learnersError: null,
    learnersLastFetched: null,

    fetchLearners: async (force = false) => {
      const { learnersLastFetched, learnersLoading } = get();
      // Cache for 5 minutes unless forced
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
        const q = query(collection(db, "learners"), orderBy("fullName"));
        const snapshot = await getDocs(q);
        const learners = snapshot.docs.map((doc) => {
          const data = doc.data();
          return { id: doc.id, ...data } as DashboardLearner;
        });
        set({
          learners,
          learnersLoading: false,
          learnersLastFetched: Date.now(),
        });
      } catch (error) {
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
          createdAt: timestamp,
          createdBy: TEST_USER_ID,
          updatedAt: timestamp,
          updatedBy: TEST_USER_ID,
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
          updatedBy: TEST_USER_ID,
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

    deleteLearner: async (id) => {
      try {
        await deleteDoc(doc(db, "learners", id));
        set((state) => {
          state.learners = state.learners.filter((l) => l.id !== id);
        });
      } catch (error) {
        console.error("Failed to delete learner", error);
        throw error;
      }
    },

    archiveCohort: async (year: string) => {
      const { learners } = get();
      const batch = writeBatch(db);
      let count = 0;

      learners.forEach((l) => {
        // Extract year from trainingStartDate (YYYY-MM-DD)
        const learnerYear = l.trainingStartDate
          ? l.trainingStartDate.substring(0, 4)
          : "";

        // If matches year and not already archived
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
        // Refresh local state
        set((state) => {
          state.learners.forEach((l) => {
            if (l.trainingStartDate?.startsWith(year)) {
              l.isArchived = true;
            }
          });
        });
        alert(
          `Successfully archived ${count} learners from the ${year} cohort.`,
        );
      } else {
        alert(`No active learners found for the ${year} cohort.`);
      }
    },

    // Unified Import: Handles QCTO Registration + Assessment Results + Training Start Date
    // Unified Import: Handles QCTO Registration + Assessment Results + Training Start Date
    importUnifiedLearners: async (file: File) => {
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(), // Clean whitespace from headers
          complete: async (results) => {
            const rawData = results.data as any[];
            const errors: string[] = [];

            // Map to group rows by ID (one learner, multiple module rows)
            const learnersMap = new Map<string, any>();

            if (rawData.length === 0) {
              resolve({
                success: 0,
                errors: ["CSV file is empty or could not be parsed"],
              });
              return;
            }

            // --- PROCESSING LOOP ---
            rawData.forEach((row, index) => {
              try {
                const getStr = (val: any): string =>
                  val !== null && val !== undefined ? String(val).trim() : "";

                // 1. Identification
                const idNumber = getStr(row.NationalId || row.ID_Number);
                if (!idNumber) return;

                // 2. Initialize Learner if not in Map
                if (!learnersMap.has(idNumber)) {
                  // Name Parsing
                  const firstName = getStr(row.LearnerFirstName);
                  const lastName = getStr(row.LearnerLastName);
                  const middleName = getStr(row.LearnerMiddleName);

                  let fullName =
                    firstName || lastName
                      ? `${firstName} ${middleName} ${lastName}`
                          .replace(/\s+/g, " ")
                          .trim()
                      : getStr(row.Full_Name) || "Unknown Learner";

                  // --- DATE PARSING LOGIC ---
                  const parseYYYYMMDD = (val: string) => {
                    if (val.length === 8 && /^\d+$/.test(val)) {
                      return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
                    }
                    return val;
                  };

                  const dateOfBirth = parseYYYYMMDD(
                    getStr(row.LearnerBirthDate || row.Date_Of_Birth),
                  );

                  // Handle Training Start Date specifically
                  const rawStart = getStr(
                    row.TrainingStartDate || row.Training_Start_Date,
                  );
                  const trainingStartDate = rawStart
                    ? parseYYYYMMDD(rawStart)
                    : new Date().toISOString().split("T")[0];

                  const timestamp = now();

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

                    // Essential for Year Filtering
                    trainingStartDate: trainingStartDate,
                    isArchived: false,

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
                      timestamp.split("T")[0],
                    status: "in-progress",

                    demographics: {
                      sdpCode: getStr(row.SDPCode),
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
                      provinceCode: getStr(row.ProvinceCode),
                      statsaaAreaCode: getStr(row.STATSSAAreaCode),
                      popiActAgree: getStr(row.POPIActAgree),
                      popiActDate: getStr(row.POPIActDate),
                      expectedTrainingCompletionDate: getStr(
                        row.ExpectedTrainingCompletionDate,
                      ),
                      assessmentCentreCode: getStr(row.AssessmentCentreCode),
                      flc: getStr(row.FLC),
                      flcStatementOfResultNumber: getStr(
                        row.FLCStatementofresultnumber,
                      ),
                      dateStamp: getStr(row.DateStamp),
                    },

                    createdAt: timestamp,
                    createdBy: TEST_USER_ID,
                    updatedAt: timestamp,
                    updatedBy: TEST_USER_ID,
                  };

                  learnersMap.set(idNumber, newLearner);
                }

                // 3. Process Modules
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
                    nqfLevel:
                      parseInt(getStr(row.Module_NQF_Level)) ||
                      learner.qualification.nqfLevel ||
                      5,
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
              learnersMap.forEach((learner) => {
                const docRef = doc(collection(db, "learners"));
                batch.set(docRef, learner);
              });
              await batch.commit();
              await get().fetchLearners(true);
              resolve({ success: learnersMap.size, errors });
            } catch (error) {
              reject(error);
            }
          },
          error: (error) => {
            reject(error);
          },
        });
      });
    },

    // // Unified Import: Handles QCTO Registration + Assessment Results in one file
    // importUnifiedLearners: async (file) => {
    //   return new Promise((resolve, reject) => {
    //     Papa.parse(file, {
    //       header: true,
    //       skipEmptyLines: true,
    //       transformHeader: (header) => header.trim(),
    //       complete: async (results) => {
    //         const rawData = results.data as any[];
    //         const errors: string[] = [];
    //         const learnersMap = new Map<string, any>();

    //         if (rawData.length === 0) {
    //           resolve({
    //             success: 0,
    //             errors: ["CSV file is empty or could not be parsed"],
    //           });
    //           return;
    //         }

    //         rawData.forEach((row, index) => {
    //           try {
    //             const getStr = (val: any): string =>
    //               val !== null && val !== undefined ? String(val).trim() : "";

    //             // 1. Identify the Learner
    //             const idNumber = getStr(row.NationalId || row.ID_Number);

    //             if (!idNumber) return; // Skip empty rows

    //             // 2. Initialize Learner if not in Map
    //             if (!learnersMap.has(idNumber)) {
    //               // Name Parsing
    //               const firstName = getStr(row.LearnerFirstName);
    //               const lastName = getStr(row.LearnerLastName);
    //               const middleName = getStr(row.LearnerMiddleName);

    //               let fullName = "";
    //               if (firstName || lastName) {
    //                 fullName = middleName
    //                   ? `${firstName} ${middleName} ${lastName}`.trim()
    //                   : `${firstName} ${lastName}`.trim();
    //               } else {
    //                 fullName = getStr(row.Full_Name) || "Unknown Learner";
    //               }

    //               // Date Parsing (YYYYMMDD -> YYYY-MM-DD)
    //               let dateOfBirth = "";
    //               const rawDob = getStr(
    //                 row.LearnerBirthDate || row.Date_Of_Birth,
    //               );
    //               if (rawDob.length === 8 && /^\d+$/.test(rawDob)) {
    //                 const y = rawDob.substring(0, 4);
    //                 const m = rawDob.substring(4, 6);
    //                 const d = rawDob.substring(6, 8);
    //                 dateOfBirth = `${y}-${m}-${d}`;
    //               } else {
    //                 dateOfBirth = rawDob;
    //               }

    //               const timestamp = now();

    //               const newLearner = {
    //                 fullName,
    //                 idNumber,
    //                 dateOfBirth,
    //                 email: getStr(row.LearnerEmailAddress || row.Email),
    //                 phone: getStr(
    //                   row.LearnerCellPhoneNumber ||
    //                     row.Phone ||
    //                     row.LearnerPhoneNumber,
    //                 ),

    //                 qualification: {
    //                   name: "", // Usually not in QCTO Reg file, fill via UI later
    //                   saqaId: getStr(row.QualificationId || row.SAQA_ID),
    //                   credits: parseInt(getStr(row.Credits)) || 0,
    //                   totalNotionalHours:
    //                     (parseInt(getStr(row.Credits)) || 0) * 10,
    //                   nqfLevel: parseInt(getStr(row.NQF_Level)) || 0,
    //                   dateAssessed: "",
    //                 },

    //                 knowledgeModules: [],
    //                 practicalModules: [],
    //                 workExperienceModules: [],

    //                 // EISA Logic: If "LearnerReadiness" is "01" OR explicit Yes
    //                 eisaAdmission:
    //                   getStr(row.LearnerReadinessforEISATypeId) === "01" ||
    //                   getStr(row.EISA_Admission).toLowerCase() === "yes",

    //                 verificationCode: `SOR-${Math.floor(Math.random() * 10000)}`,
    //                 // Use IssueDate from CSV or Today
    //                 issueDate:
    //                   getStr(row.StatementofResultsIssueDate) ||
    //                   timestamp.split("T")[0],
    //                 status: "in-progress",

    //                 // --- COMPLETE QCTO DEMOGRAPHICS MAPPING ---
    //                 demographics: {
    //                   sdpCode: getStr(row.SDPCode),
    //                   qualificationId: getStr(row.QualificationId),
    //                   learnerAlternateId: getStr(row.LearnerAlternateID),
    //                   alternativeIdType: getStr(row.AlternativeIdType),
    //                   equityCode: getStr(row.EquityCode),
    //                   nationalityCode: getStr(row.NationalityCode),
    //                   homeLanguageCode: getStr(row.HomeLanguageCode),
    //                   genderCode: getStr(row.GenderCode),
    //                   citizenResidentStatusCode: getStr(
    //                     row.CitizenResidentStatusCode,
    //                   ),
    //                   socioeconomicStatusCode: getStr(
    //                     row.SocioeconomicStatusCode,
    //                   ),
    //                   disabilityStatusCode: getStr(row.DisabilityStatusCode),
    //                   disabilityRating: getStr(row.DisabilityRating),
    //                   immigrantStatus: getStr(row.ImmigrantStatus),
    //                   learnerLastName: getStr(row.LearnerLastName),
    //                   learnerFirstName: getStr(row.LearnerFirstName),
    //                   learnerMiddleName: getStr(row.LearnerMiddleName),
    //                   learnerTitle: getStr(row.LearnerTitle),
    //                   learnerHomeAddress1: getStr(row.LearnerHomeAddress1),
    //                   learnerHomeAddress2: getStr(row.LearnerHomeAddress2),
    //                   learnerHomeAddress3: getStr(row.LearnerHomeAddress3),
    //                   learnerPostalAddress1: getStr(row.LearnerPostalAddress1),
    //                   learnerPostalAddress2: getStr(row.LearnerPostalAddress2),
    //                   learnerPostalAddress3: getStr(row.LearnerPostalAddress3),
    //                   learnerHomeAddressPostalCode: getStr(
    //                     row.LearnerHomeAddressPostalCode,
    //                   ),
    //                   learnerPostalAddressPostCode: getStr(
    //                     row.LearnerPostalAddressPostCode,
    //                   ),
    //                   learnerPhoneNumber: getStr(row.LearnerPhoneNumber),
    //                   learnerFaxNumber: getStr(row.LearnerFaxNumber),
    //                   provinceCode: getStr(row.ProvinceCode),
    //                   statsaaAreaCode: getStr(row.STATSSAAreaCode),
    //                   popiActAgree: getStr(row.POPIActAgree),
    //                   popiActDate: getStr(row.POPIActDate),
    //                   expectedTrainingCompletionDate: getStr(
    //                     row.ExpectedTrainingCompletionDate,
    //                   ),
    //                   statementOfResultsStatus: getStr(
    //                     row.StatementofResultsStatus,
    //                   ),
    //                   statementOfResultsIssueDate: getStr(
    //                     row.StatementofResultsIssueDate,
    //                   ),
    //                   assessmentCentreCode: getStr(row.AssessmentCentreCode),
    //                   learnerReadinessForEISATypeId: getStr(
    //                     row.LearnerReadinessforEISATypeId,
    //                   ),
    //                   flc: getStr(row.FLC),
    //                   flcStatementOfResultNumber: getStr(
    //                     row.FLCStatementofresultnumber,
    //                   ),
    //                   dateStamp: getStr(row.DateStamp),
    //                 },

    //                 createdAt: timestamp,
    //                 createdBy: TEST_USER_ID,
    //                 updatedAt: timestamp,
    //                 updatedBy: TEST_USER_ID,
    //               };

    //               learnersMap.set(idNumber, newLearner);
    //             }

    //             // 3. Process Modules
    //             const moduleName = getStr(row.Module_Name);

    //             if (moduleName) {
    //               const learner = learnersMap.get(idNumber);
    //               const moduleType = getStr(row.Module_Type).toLowerCase();
    //               const moduleCredits =
    //                 parseInt(getStr(row.Module_Credits)) || 0;
    //               const moduleDate = getStr(row.Module_Date);
    //               const moduleResult = getStr(row.Module_Result);
    //               const nqfLevel =
    //                 parseInt(getStr(row.Module_NQF_Level)) ||
    //                 learner.qualification.nqfLevel ||
    //                 5;

    //               const moduleBase = {
    //                 name: moduleName,
    //                 credits: moduleCredits,
    //                 notionalHours: moduleCredits * 10,
    //                 nqfLevel: nqfLevel,
    //               };

    //               if (moduleType.includes("knowledge")) {
    //                 learner.knowledgeModules.push({
    //                   ...moduleBase,
    //                   dateAssessed: moduleDate,
    //                   status: moduleResult || "Competent",
    //                 });
    //               } else if (moduleType.includes("practical")) {
    //                 learner.practicalModules.push({
    //                   ...moduleBase,
    //                   dateAssessed: moduleDate,
    //                   status: moduleResult || "Pass",
    //                 });
    //               } else if (
    //                 moduleType.includes("work") ||
    //                 moduleType.includes("experience")
    //               ) {
    //                 learner.workExperienceModules.push({
    //                   ...moduleBase,
    //                   dateSignedOff: moduleDate,
    //                   status: moduleResult || "Competent",
    //                 });
    //               }
    //             }
    //           } catch (err) {
    //             errors.push(
    //               `Row ${index + 2} Error: ${(err as Error).message}`,
    //             );
    //           }
    //         });

    //         if (learnersMap.size === 0) {
    //           resolve({
    //             success: 0,
    //             errors: errors.length ? errors : ["No valid learners found"],
    //           });
    //           return;
    //         }

    //         try {
    //           const batch = writeBatch(db);
    //           learnersMap.forEach((learner) => {
    //             const docRef = doc(collection(db, "learners"));
    //             batch.set(docRef, learner);
    //           });

    //           await batch.commit();
    //           await get().fetchLearners(true);
    //           resolve({ success: learnersMap.size, errors });
    //         } catch (error) {
    //           reject(error);
    //         }
    //       },
    //       error: (error) => {
    //         reject(error);
    //       },
    //     });
    //   });
    // },

    // ==================== PROGRAMMES ====================
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
          createdBy: TEST_USER_ID,
          updatedAt: timestamp,
          updatedBy: TEST_USER_ID,
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
          updatedBy: TEST_USER_ID,
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
        const updatePayload = {
          isArchived: true,
          updatedAt: now(),
          updatedBy: TEST_USER_ID,
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
        console.error("Failed to archive programme", error);
        throw error;
      }
    },

    importProgrammesFromCSV: async (file) => {
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            const rawData = results.data as any[];
            const errors: string[] = [];
            const programmesToAdd: Omit<ProgrammeTemplate, "id">[] = [];

            // Group by SAQA_ID
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
              const programme: Omit<ProgrammeTemplate, "id"> = {
                name: baseInfo.Programme_Name || "Unknown Programme",
                saqaId,
                credits: parseInt(baseInfo.Total_Credits) || 0,
                totalNotionalHours:
                  (parseInt(baseInfo.Total_Credits) || 0) * 10,
                nqfLevel: parseInt(baseInfo.NQF_Level) || 0,
                knowledgeModules: [],
                practicalModules: [],
                workExperienceModules: [],
                isArchived: false,
                createdAt: timestamp,
                createdBy: TEST_USER_ID,
                updatedAt: timestamp,
                updatedBy: TEST_USER_ID,
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
                if (moduleType === "knowledge") {
                  programme.knowledgeModules.push(moduleData);
                } else if (moduleType === "practical") {
                  programme.practicalModules.push(moduleData);
                } else if (
                  moduleType === "workexperience" ||
                  moduleType === "work experience"
                ) {
                  programme.workExperienceModules.push(moduleData);
                } else {
                  errors.push(
                    `Unknown module type "${row.Module_Type}" for SAQA ID ${saqaId}`,
                  );
                }
              });

              if (
                programme.knowledgeModules.length > 0 ||
                programme.practicalModules.length > 0 ||
                programme.workExperienceModules.length > 0
              ) {
                programmesToAdd.push(programme);
              } else {
                errors.push(
                  `Programme with SAQA ID ${saqaId} has no valid modules.`,
                );
              }
            });

            if (programmesToAdd.length === 0) {
              resolve({
                success: 0,
                errors: errors.length ? errors : ["No valid programmes found"],
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
          error: (error) => {
            reject(error);
          },
        });
      });
    },
  })),
);
