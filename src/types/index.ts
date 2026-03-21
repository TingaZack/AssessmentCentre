// src/types/index.ts

// ---------- Common Types ----------
export type ModuleStatus =
  | "Competent"
  | "Not Competent"
  | "Not Yet Competent"
  | "Pass"
  | "Fail"
  | "Not Started"
  | "Pending Grading";

export interface CampusLocation {
  id: string;
  name: string;
  type: "physical" | "online";
  address: string;
  siteAccreditationNumber: string;
  isDefault: boolean;
}

export interface SystemSettings {
  institutionName: string;
  companyRegistrationNumber: string;
  phone: string;
  email: string;
  campuses: CampusLocation[];
  passMarkThreshold: number;
  attendanceRequirement: number;
  defaultCohortMonths: number;
  eisaLockEnabled: boolean;
  contractAddress: string;
  blockchainNetwork: string;
  rpcUrl: string;
  ipfsGateway: string;
}
export interface BaseModule {
  name: string;
  credits: number;
  notionalHours: number;
  nqfLevel: number;
  status: ModuleStatus;
  code?: string; // Included as it's heavily used for QCTO mapping
}

// ---------- Learner‑Specific Module Types ----------
export interface KnowledgeModule extends BaseModule {
  dateAssessed: string;
  status: "Competent" | "Not Yet Competent" | "Not Started" | "Pending Grading";
}

export interface PracticalModule extends BaseModule {
  dateAssessed: string;
  status: "Pass" | "Fail" | "Not Started" | "Pending Grading";
}

export interface WorkExperienceModule extends BaseModule {
  dateSignedOff: string;
  status: "Competent" | "Not Yet Competent" | "Not Started" | "Pending Grading";
}

// Union type for any learner module (used in StatementOfResults)
export type AnyAssessmentModule =
  | KnowledgeModule
  | PracticalModule
  | WorkExperienceModule;

// ---------- Qualification (embedded in enrollment) ----------
export interface Qualification {
  name: string;
  saqaId: string;
  credits: number;
  totalNotionalHours: number;
  nqfLevel: number;
  dateAssessed: string;
}

// ---------- QCTO Demographics (optional) ----------
export interface LearnerDemographics {
  sdpCode?: string;
  qualificationId?: string;
  learnerAlternateId?: string;
  alternativeIdType?: string;
  equityCode?: string;
  nationalityCode?: string;
  homeLanguageCode?: string;
  genderCode?: string;
  citizenResidentStatusCode?: string;
  socioeconomicStatusCode?: string;
  disabilityStatusCode?: string;
  disabilityRating?: string;
  immigrantStatus?: string;
  learnerMiddleName?: string;
  learnerTitle?: string;
  learnerHomeAddress1?: string;
  learnerHomeAddress2?: string;
  learnerHomeAddress3?: string;
  learnerPostalAddress1?: string;
  learnerPostalAddress2?: string;
  learnerPostalAddress3?: string;
  learnerHomeAddressPostalCode?: string;
  learnerPostalAddressPostCode?: string;
  learnerPhoneNumber?: string;
  learnerFaxNumber?: string;
  learnerEmailAddress?: string;
  provinceCode?: string;
  statsaaAreaCode?: string;
  popiActAgree?: string;
  popiActDate?: string;
  expectedTrainingCompletionDate?: string;
  statementOfResultsStatus?: string;
  statementOfResultsIssueDate?: string;
  assessmentCentreCode?: string;
  learnerReadinessForEISATypeId?: string;
  flc?: string;
  flcStatementOfResultNumber?: string;
  dateStamp?: string;
}

// ============================================================================
// 🚀 NEW RELATIONAL ARCHITECTURE: IDENTITY VS. ACADEMIC RECORD 🚀
// ============================================================================

// 1. IDENTITY: The Human Being (Stored in 'learners' DB collection)
export interface LearnerProfile {
  id: string; // Global Learner ID
  fullName: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  mobile?: string;
  profilePhotoUrl?: string;

  profileCompleted?: boolean;
  authUid?: string;
  uid?: string;
  authStatus: "pending" | "invited" | "active";

  demographics?: LearnerDemographics;

  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

// 2. ACADEMIC RECORD: The Course Instance (Stored in 'enrollments' DB collection)
export interface LearnerEnrollment {
  id: string; // Unique Enrollment ID
  learnerId: string; // Links back to the LearnerProfile
  cohortId: string; // Links to the Cohort / Class

  // System Statuses
  status: "active" | "completed" | "dropped" | "in-progress" | "pending";
  isDraft: boolean; // Indicates imported but not yet active
  isArchived: boolean;

  trainingStartDate: string;
  exitDate?: string;
  exitReason?: string;

  // Educational Data (Snapshotted to protect historical records)
  qualification: Qualification;
  knowledgeModules: KnowledgeModule[];
  practicalModules: PracticalModule[];
  workExperienceModules: WorkExperienceModule[];

  // Certification
  eisaAdmission: boolean;
  verificationCode: string;
  issueDate: string | null;

  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

// 🚀 1. Create the new Enrollment Record Type
export interface EnrollmentRecord {
  cohortId: string;
  programmeId: string;
  status: "active" | "dropped" | "completed";
  dateAssigned: string;
  dateCompleted?: string;
  exitDate?: string | null;
  exitReason?: string;
}

// 3. FRONTEND DTO: The Combined Table View
// We merge Profile and Enrollment here so your UI components (like LearnersView)
// don't break while we migrate the backend.
export interface DashboardLearner
  extends
    Omit<
      LearnerProfile,
      "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
    >,
    Omit<
      LearnerEnrollment,
      "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
    > {
  id: string; // In the UI, this maps to the Enrollment ID (so every row is unique)
  learnerId: string; // The actual human's profile ID
  enrollmentId: string; // The academic record's ID

  // Shared Audit Trail
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  nextEisaDate?: string;
  updatedBy?: string;

  campusId?: string;

  trainingEndDate?: string;

  // these Web3 / Blockchain properties:
  ipfsHash?: string;
  blockchainFingerprint?: string;
  isBlockchainVerified?: boolean;

  isOffline?: boolean;

  enrollmentHistory?: EnrollmentRecord[];

  // Workplace Placements linked to this specific enrollment
  employerId?: string;
  mentorId?: string;
}

// ============================================================================

// ---------- Programme Module (embedded) ----------
export interface ProgrammeModule {
  name: string;
  credits: number;
  notionalHours: number;
  nqfLevel: number;
}

// ---------- Programme Template (with embedded modules) ----------
export interface ProgrammeTemplate {
  id: string; // Firestore document ID
  name: string;
  saqaId: string;
  credits: number;
  totalNotionalHours: number;
  nqfLevel: number;
  knowledgeModules: ProgrammeModule[];
  practicalModules: ProgrammeModule[];
  workExperienceModules: ProgrammeModule[];
  isArchived?: boolean;

  // Audit fields
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

// ---------- UI / Form Categories ----------
export type ModuleCategory = "knowledge" | "practical" | "workExperience";

// ---------- Statement of Results Types ----------
export interface IssuedBy {
  name: string;
  title: string;
}

export interface Cohort {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  programmeId: string; // Links to the Qualification Template

  campusId: string; // Links to settings.campuses[].id

  // The "Triangle of Support" (Staff IDs)
  facilitatorId: string;
  assessorId: string;
  moderatorId: string;

  assessorEmail?: string;
  moderatorEmail?: string;

  qualificationId: string;

  // The Students
  learnerIds: string[]; // Array of Learner IDs

  staffHistory?: StaffHistoryEntry[];

  isArchived: boolean;
  createdAt: string;
}

export interface StaffHistoryEntry {
  staffId: string;
  role: "facilitator" | "assessor" | "moderator";
  assignedAt: string;
  removedAt: string | null;
  assignedBy: string;

  //Strict Audit Requirement
  changeReason?: string;
}

export interface Employer {
  id: string;
  name: string;
  registrationNumber: string;
  physicalAddress: string;
  lat?: number | null;
  lng?: number | null;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  status: "active" | "archived";
  createdAt: string;
}

// // ---------- Common Types ----------
// export type ModuleStatus = "Competent" | "Not Competent" | "Pass" | "Fail";

// export interface BaseModule {
//   name: string;
//   credits: number;
//   notionalHours: number;
//   nqfLevel: number;
//   status: ModuleStatus;
// }

// // ---------- Learner‑Specific Module Types ----------
// export interface KnowledgeModule extends BaseModule {
//   dateAssessed: string;
//   status: "Competent" | "Not Competent";
// }

// export interface PracticalModule extends BaseModule {
//   dateAssessed: string;
//   status: "Pass" | "Fail";
// }

// export interface WorkExperienceModule extends BaseModule {
//   dateSignedOff: string;
//   status: "Competent" | "Not Competent";
// }

// // Union type for any learner module (used in StatementOfResults)
// export type AnyAssessmentModule =
//   | KnowledgeModule
//   | PracticalModule
//   | WorkExperienceModule;

// // ---------- Qualification (embedded in learner) ----------
// export interface Qualification {
//   name: string;
//   saqaId: string;
//   credits: number;
//   totalNotionalHours: number;
//   nqfLevel: number;
//   dateAssessed: string;
// }

// // ---------- QCTO Demographics (optional) ----------
// export interface LearnerDemographics {
//   sdpCode?: string;
//   qualificationId?: string; // Added
//   learnerAlternateId?: string; // Added
//   alternativeIdType?: string; // Added
//   equityCode?: string;
//   nationalityCode?: string;
//   homeLanguageCode?: string;
//   genderCode?: string;
//   citizenResidentStatusCode?: string;
//   socioeconomicStatusCode?: string;
//   disabilityStatusCode?: string;
//   disabilityRating?: string;
//   immigrantStatus?: string;
//   learnerMiddleName?: string;
//   learnerTitle?: string;
//   learnerHomeAddress1?: string;
//   learnerHomeAddress2?: string;
//   learnerHomeAddress3?: string;
//   learnerPostalAddress1?: string;
//   learnerPostalAddress2?: string;
//   learnerPostalAddress3?: string;
//   learnerHomeAddressPostalCode?: string;
//   learnerPostalAddressPostCode?: string;
//   learnerPhoneNumber?: string; // Added
//   learnerFaxNumber?: string;
//   learnerEmailAddress?: string; // Store raw if needed
//   provinceCode?: string;
//   statsaaAreaCode?: string;
//   popiActAgree?: string;
//   popiActDate?: string;
//   expectedTrainingCompletionDate?: string;
//   statementOfResultsStatus?: string; // Added
//   statementOfResultsIssueDate?: string; // Added
//   assessmentCentreCode?: string;
//   learnerReadinessForEISATypeId?: string;
//   flc?: string;
//   flcStatementOfResultNumber?: string;
//   dateStamp?: string;
// }

// // ---------- Learner ----------
// // src/types/index.ts

// // ... keep your Module interfaces (KnowledgeModule, PracticalModule, etc.) ...

// export interface DashboardLearner {
//   // Database ID
//   id: string;

//   // Identity & Contact
//   fullName: string;
//   firstName: string;
//   lastName: string;
//   idNumber: string;
//   dateOfBirth: string;
//   email: string;
//   phone: string; // (General contact)
//   mobile?: string; // (Cell specific)

//   profileCompleted?: boolean;

//   authUid?: string;
//   uid?: string;

//   // Cohort Management
//   cohortId: string;
//   trainingStartDate: string;

//   // System Statuses
//   status: "active" | "completed" | "dropped" | "in-progress" | "pending";
//   isDraft: boolean; // New flag to indicate imported but not yet active learners
//   authStatus: "pending" | "invited" | "active";
//   isArchived: boolean;

//   // Educational Data
//   qualification: Qualification;
//   knowledgeModules: KnowledgeModule[];
//   practicalModules: PracticalModule[];
//   workExperienceModules: WorkExperienceModule[];

//   // Certification
//   eisaAdmission: boolean;
//   verificationCode: string;
//   issueDate: string | null;
//   exitDate?: string;

//   // Optional QCTO Data
//   demographics?: LearnerDemographics;

//   // Audit Trail
//   createdAt: string;
//   createdBy: string;
//   updatedAt?: string;
//   updatedBy?: string;

//   exitReason?: string; // e.g. "Found Employment", "Deceased", "Unknown"
// }

// // export interface DashboardLearner {
// //   id: string; // Firestore document ID (string)
// //   fullName: string;
// //   idNumber: string;
// //   dateOfBirth: string;
// //   email: string;
// //   phone: string;
// //   qualification: Qualification;
// //   knowledgeModules: KnowledgeModule[];
// //   practicalModules: PracticalModule[];
// //   workExperienceModules: WorkExperienceModule[];
// //   eisaAdmission: boolean;
// //   verificationCode: string;
// //   issueDate: string | null;
// //   status: "active" | "completed" | "dropped" | "in-progress";

// //   // QCTO demographics (optional)
// //   demographics?: LearnerDemographics;

// //   trainingStartDate: string; // ISO Date YYYY-MM-DD
// //   isArchived: boolean; // True if the cohort is closed

// //   // Audit fields
// //   createdAt: string; // ISO date string
// //   createdBy: string; // User UID
// //   updatedAt: string;
// //   updatedBy: string;

// //   exitReason?: string; // e.g. "Found Employment", "Deceased", "Unknown"
// //   exitDate?: string; // ISO Date
// // }

// // ---------- Programme Module (embedded) ----------
// export interface ProgrammeModule {
//   name: string;
//   credits: number;
//   notionalHours: number;
//   nqfLevel: number;
// }

// // ---------- Programme Template (with embedded modules) ----------
// export interface ProgrammeTemplate {
//   id: string; // Firestore document ID
//   name: string;
//   saqaId: string;
//   credits: number;
//   totalNotionalHours: number;
//   nqfLevel: number;
//   knowledgeModules: ProgrammeModule[];
//   practicalModules: ProgrammeModule[];
//   workExperienceModules: ProgrammeModule[];
//   isArchived?: boolean;

//   // Audit fields
//   createdAt: string;
//   createdBy: string;
//   updatedAt: string;
//   updatedBy: string;
// }

// // ---------- UI / Form Categories ----------
// export type ModuleCategory = "knowledge" | "practical" | "workExperience";

// // ---------- Statement of Results Types (if needed) ----------
// export interface IssuedBy {
//   name: string;
//   title: string;
// }

// export interface Cohort {
//   id: string;
//   name: string; //
//   startDate: string;
//   endDate: string;
//   programmeId: string; // Links to the Qualification Template

//   // The "Triangle of Support" (Staff IDs)
//   facilitatorId: string;
//   assessorId: string;
//   moderatorId: string;

//   assessorEmail?: string;
//   moderatorEmail?: string;

//   qualificationId: string;
//   // The Students
//   learnerIds: string[]; // Array of Learner IDs

//   staffHistory?: StaffHistoryEntry[];

//   isArchived: boolean;
//   createdAt: string;
// }

// export interface StaffHistoryEntry {
//   staffId: string;
//   role: "facilitator" | "assessor" | "moderator";
//   assignedAt: string;
//   removedAt: string | null;
//   assignedBy: string;

//   //Strict Audit Requirement
//   changeReason?: string;
// }
