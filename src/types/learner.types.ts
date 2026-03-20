// src/types/types.ts

export interface Qualification {
  name: string;
  saqaId: string;
  credits: string;
  nqfLevel: string;
  dateAssessed: string;
}

export interface IssuedBy {
  name: string;
  title: string;
}

// --- Specific Module Types ---

export interface KnowledgeModule {
  name: string;
  credits: number;
  dateAssessed: string;
  status: "Competent" | "Not Competent";
}

export interface PracticalModule {
  name: string;
  credits: number;
  dateAssessed: string;
  status: "Pass" | "Fail";
}

export interface WorkExperienceModule {
  name: string;
  credits: number;
  dateSignedOff: string;
  status: "Competent" | "Not Competent";
}

// A Union Type so the generic table component can accept any of the three module types
export type AnyAssessmentModule =
  | KnowledgeModule
  | PracticalModule
  | WorkExperienceModule;

export interface SoRModule {
  name: string;
  credits: number;
  dateAssessed?: string;
  dateSignedOff?: string;
  status: string;
}

export interface LearnerData {
  id: string;
  learnerId?: string;
  fullName: string;
  idNumber: string;
  dateOfBirth?: string;
  isOffline: boolean;
  qualification: {
    name: string;
    saqaId: string;
    credits: string | number;
    nqfLevel: string | number;
    dateAssessed: string;
  };
  knowledgeModules: SoRModule[];
  practicalModules: SoRModule[];
  workExperienceModules: SoRModule[];
  eisaAdmission: boolean;
  verificationCode: string;
  issueDate: string;
  nextEISADate: string;
  ipfsHash?: string;
  issuedBy: {
    name: string;
    title: string;
  };
  isBlockchainVerified?: boolean;
  blockchainFingerprint?: string;
}

// --- Component Props Interfaces ---

export interface AssessmentCategoryProps {
  title: string;
  totalCredits: number;
  modules: AnyAssessmentModule[];
  dateLabel: string;
  getStatusClass: (status: string) => string;
}

// export interface ProgrammeModule {
//   moduleId: string;
//   moduleTitle?: string; // Add your standard module fields here
//   qualificationTitle: string;
//   saqaQualId: number;
//   occupationalCode: string;
//   nqfLevel: number;
//   credits: number;
//   notionalHours: number;
// }

// export interface ProgrammeTemplate {
//   programmeTemplateId: string;
//   programmeTitle: string;
//   totalCredits?: number;
//   // This ensures the template MUST include modules with the new SAQA/NQF data
//   modules: ProgrammeModule[];
// }

// export interface ProgrammeTemplate {
//   id: string;
//   name: string;
//   saqaId: string;
//   credits: number;
//   nqfLevel: number; // The overall qualification level
//   knowledgeModules: { name: string; credits: number; nqfLevel: number }[];
//   practicalModules: { name: string; credits: number; nqfLevel: number }[];
//   workExperienceModules: { name: string; credits: number; nqfLevel: number }[];
//   isArchived?: boolean;
// }

// // Optional: Define an enum for the status to keep data clean
// export enum ProgrammeStatus {
//   DRAFT = "Draft",
//   ACTIVE = "Active",
//   ARCHIVED = "Archived",
// }

// 1. The Module Interface
export interface ProgrammeModule {
  moduleId: string; // e.g., "251201-005-00-KM-01"
  moduleTitle: string; // e.g., "Intro to Software Development"
  qualificationTitle: string; // e.g., "Occupational Certificate: Software Developer"
  saqaQualId: number; // e.g., 118707
  occupationalCode: string; // e.g., "251201005"
  nqfLevel: number; // e.g., 4
  credits: number; // e.g., 12
  notionalHours: number; // e.g., 120
}

// // 2. The Create Template Interface
// export interface ProgrammeTemplate {
//   programmeTemplateId: string; // e.g., "PROG-SD-001"
//   programmeTitle: string; // e.g., "Software Development Occupational Programme"
//   saqaQualId: number; // e.g., 118707
//   occupationalCode: string; // e.g., "251201005"
//   nqfLevel: number; // e.g., 4
//   totalCredits: number; // Captured at creation: e.g., 120
//   totalNotionalHours: number; // Captured at creation: e.g., 1200
//   status: ProgrammeStatus | string;
//   modules: ProgrammeModule[]; // The array of modules that belong to this template
// }
