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

export interface DashboardLearner {
  id: number;
  fullName: string;
  idNumber: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  qualification: Qualification;
  knowledgeModules: KnowledgeModule[];
  practicalModules: PracticalModule[];
  workExperienceModules: WorkExperienceModule[];
  eisaAdmission: boolean;
  verificationCode: string;
  issueDate: string | null;
  status: "completed" | "in-progress" | "pending";
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
