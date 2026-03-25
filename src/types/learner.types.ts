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
