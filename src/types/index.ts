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

// export interface CampusLocation {
//   id: string;
//   name: string;
//   type: "physical" | "online";
//   address: string;
//   siteAccreditationNumber: string;
//   isDefault: boolean;
// }

export interface CampusLocation {
  id: string;
  name: string;
  type: "physical" | "online";
  address: string;
  city: string;
  province: string;
  siteAccreditationNumber: string;
  isDefault: boolean;
}

// System Settings with CIPC instead of SDP
export interface SystemSettings {
  institutionName: string;
  companyRegistrationNumber: string; // CIPC Number
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
  // Brand Assets stored in Firebase
  logoUrl?: string;
  signatureUrl?: string;

  institutionAddress?: string;
  institutionCity?: string;
  institutionProvince?: string;
  institutionPostalCode?: string;
  institutionLat?: number;
  institutionLng?: number;

  contactNumber?: string; // Or 'institutionPhone'
  institutionEmail?: string;

  //Dynamic CSV Column Mappings
  csvMappings: {
    fullName: string;
    idNumber: string;
    email: string;
    phone: string;
    startDate: string;
    endDate: string;
    issueDate: string;
    cohort: string;
    sdpCode: string;
    qualificationTitle: string;
    saqaId: string;
    nqfLevel: string;
    credits: string;
  };
  // customCsvMappings?: CustomCsvMapping[];
}

export interface BaseModule {
  name: string;
  credits: number;
  notionalHours: number;
  nqfLevel: number;
  status: ModuleStatus;
  code?: string;
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
// RELATIONAL ARCHITECTURE: IDENTITY VS. ACADEMIC RECORD
// ============================================================================

//  IDENTITY: The Human Being (Stored in 'learners' DB collection)
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

// ACADEMIC RECORD: The Course Instance (Stored in 'enrollments' DB collection)
export interface LearnerEnrollment {
  id: string;
  learnerId: string;
  cohortId: string;

  // System Statuses
  status: "active" | "completed" | "dropped" | "in-progress" | "pending";
  isDraft: boolean;
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

// Create the new Enrollment Record Type
export interface EnrollmentRecord {
  cohortId: string;
  programmeId: string;
  status: "active" | "dropped" | "completed";
  dateAssigned: string;
  dateCompleted?: string;
  exitDate?: string | null;
  exitReason?: string;
}

export interface CertificateRecord {
  id: string;
  type: string;
  courseName: string;
  issueDate: string;
  pdfUrl: string;
}

// The Combined Table View
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
  certificates?: CertificateRecord[];

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
