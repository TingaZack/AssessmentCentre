// src/types/index.ts

// ---------- Common Types ----------
export type ModuleStatus = "Competent" | "Not Competent" | "Pass" | "Fail";

export interface BaseModule {
  name: string;
  credits: number;
  notionalHours: number;
  nqfLevel: number;
  status: ModuleStatus;
}

// ---------- Learner‑Specific Module Types ----------
export interface KnowledgeModule extends BaseModule {
  dateAssessed: string;
  status: "Competent" | "Not Competent";
}

export interface PracticalModule extends BaseModule {
  dateAssessed: string;
  status: "Pass" | "Fail";
}

export interface WorkExperienceModule extends BaseModule {
  dateSignedOff: string;
  status: "Competent" | "Not Competent";
}

// Union type for any learner module (used in StatementOfResults)
export type AnyAssessmentModule =
  | KnowledgeModule
  | PracticalModule
  | WorkExperienceModule;

// ---------- Qualification (embedded in learner) ----------
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
  qualificationId?: string; // Added
  learnerAlternateId?: string; // Added
  alternativeIdType?: string; // Added
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
  learnerPhoneNumber?: string; // Added
  learnerFaxNumber?: string;
  learnerEmailAddress?: string; // Store raw if needed
  provinceCode?: string;
  statsaaAreaCode?: string;
  popiActAgree?: string;
  popiActDate?: string;
  expectedTrainingCompletionDate?: string;
  statementOfResultsStatus?: string; // Added
  statementOfResultsIssueDate?: string; // Added
  assessmentCentreCode?: string;
  learnerReadinessForEISATypeId?: string;
  flc?: string;
  flcStatementOfResultNumber?: string;
  dateStamp?: string;
}

// ---------- Learner ----------
// src/types/index.ts

// ... keep your Module interfaces (KnowledgeModule, PracticalModule, etc.) ...

export interface DashboardLearner {
  // Database ID
  id: string;

  // Identity & Contact
  fullName: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  dateOfBirth: string;
  email: string;
  phone: string; // (General contact)
  mobile?: string; // (Cell specific)

  profileCompleted?: boolean;

  authUid?: string;
  uid?: string;

  // Cohort Management
  cohortId: string;
  trainingStartDate: string;

  // System Statuses
  status: "active" | "completed" | "dropped" | "in-progress" | "pending";
  isDraft: boolean; // New flag to indicate imported but not yet active learners
  authStatus: "pending" | "invited" | "active";
  isArchived: boolean;

  // Educational Data
  qualification: Qualification;
  knowledgeModules: KnowledgeModule[];
  practicalModules: PracticalModule[];
  workExperienceModules: WorkExperienceModule[];

  // Certification
  eisaAdmission: boolean;
  verificationCode: string;
  issueDate: string | null;
  exitDate?: string;

  // Optional QCTO Data
  demographics?: LearnerDemographics;

  // Audit Trail
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;

  exitReason?: string; // e.g. "Found Employment", "Deceased", "Unknown"
}

// export interface DashboardLearner {
//   id: string; // Firestore document ID (string)
//   fullName: string;
//   idNumber: string;
//   dateOfBirth: string;
//   email: string;
//   phone: string;
//   qualification: Qualification;
//   knowledgeModules: KnowledgeModule[];
//   practicalModules: PracticalModule[];
//   workExperienceModules: WorkExperienceModule[];
//   eisaAdmission: boolean;
//   verificationCode: string;
//   issueDate: string | null;
//   status: "active" | "completed" | "dropped" | "in-progress";

//   // QCTO demographics (optional)
//   demographics?: LearnerDemographics;

//   trainingStartDate: string; // ISO Date YYYY-MM-DD
//   isArchived: boolean; // True if the cohort is closed

//   // Audit fields
//   createdAt: string; // ISO date string
//   createdBy: string; // User UID
//   updatedAt: string;
//   updatedBy: string;

//   exitReason?: string; // e.g. "Found Employment", "Deceased", "Unknown"
//   exitDate?: string; // ISO Date
// }

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

// ---------- Statement of Results Types (if needed) ----------
export interface IssuedBy {
  name: string;
  title: string;
}

export interface Cohort {
  id: string;
  name: string; //
  startDate: string;
  endDate: string;
  programmeId: string; // Links to the Qualification Template

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
