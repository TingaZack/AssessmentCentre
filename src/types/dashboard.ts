export type ModuleStatus = "Competent" | "Not Competent" | "Pass" | "Fail";
export type ModuleCategory = "knowledge" | "practical" | "workExperience";

export interface BaseModule {
  name: string;
  credits: number;
  notionalHours: number;
  nqfLevel: number;
}

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

export interface Qualification {
  name: string;
  saqaId: string;
  credits: number;
  totalNotionalHours: number;
  nqfLevel: number;
  dateAssessed: string;
}

// export interface DashboardLearner {
//   id: number;
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
//   status: "completed" | "in-progress" | "pending";

// }
export interface DashboardLearner {
  // Existing Base Fields
  id: string | number; // 🔥 Updated to support Firebase string IDs
  fullName: string;
  idNumber: string;
  dateOfBirth: string;
  email: string;
  phone: string;

  // Web3 / Blockchain properties
  ipfsHash?: string;
  blockchainFingerprint?: string;
  isBlockchainVerified?: boolean;

  // Existing Academic Fields
  qualification: Qualification;
  knowledgeModules: KnowledgeModule[];
  practicalModules: PracticalModule[];
  workExperienceModules: WorkExperienceModule[];
  eisaAdmission: boolean;
  nextEisaDate?: string;
  verificationCode: string;
  issueDate: string | null;

  // Expanded Status to support both legacy and new Cohort logic
  status:
    | "completed"
    | "in-progress"
    | "pending"
    | "active"
    | "dropped"
    | "archived";

  // Fields used for Cohorts & Auth Routing
  enrollmentId?: string;
  learnerId?: string;
  authStatus?: "pending" | "active";
  cohortId?: string;
  programmeId?: string;

  // Fields used for Exits/Dropouts
  exitReason?: string;
  exitDate?: string;
  isArchived?: boolean;

  // Workplace Placements (The magic link!)
  employerId?: string;
  mentorId?: string;
}

export interface ProgrammeTemplate {
  id: string;
  name: string;
  saqaId: string;
  credits: number;
  totalNotionalHours: number;
  nqfLevel: number;
  knowledgeModules: BaseModule[];
  practicalModules: BaseModule[];
  workExperienceModules: BaseModule[];
  isArchived?: boolean;
}
