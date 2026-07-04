// src/types/index.ts

// ═════════════════════════════════════════════════════════════════════════════
// ECOSYSTEM & FORM BUILDER TYPES
// ═════════════════════════════════════════════════════════════════════════════

export interface CustomFieldBlueprint {
  id: string;
  label: string;
  type: "text" | "dropdown" | "checkbox";
  required: boolean;
  options?: string[];
}

export interface EmployerFormBlueprint {
  coreFieldVisibility: Record<string, boolean>;
  customFields: CustomFieldBlueprint[];
}

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
  ecosystem?: {
    eventTypes?: string[];
  };

  // The Dynamic Blueprint for your Public Form!
  employerFormBlueprint?: EmployerFormBlueprint;

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

export interface LearnerEnrollment {
  id: string;
  learnerId: string;
  cohortId: string;

  status:
    | "active"
    | "completed"
    | "dropped"
    | "in-progress"
    | "pending"
    | "archived";
  isDraft: boolean;
  isArchived: boolean;

  trainingStartDate: string;
  exitDate?: string;
  exitReason?: string;

  qualification: Qualification;
  knowledgeModules: KnowledgeModule[];
  practicalModules: PracticalModule[];
  workExperienceModules: WorkExperienceModule[];

  eisaAdmission: boolean;
  verificationCode: string;
  issueDate: string | null;

  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

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
  id: string;
  learnerId: string;
  enrollmentId: string;

  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  nextEisaDate?: string;
  updatedBy?: string;
  isBootcamp?: boolean;

  campusId?: string;
  certificates?: CertificateRecord[];
  trainingEndDate?: string;
  ipfsHash?: string;
  blockchainFingerprint?: string;
  isBlockchainVerified?: boolean;
  isOffline?: boolean;
  enrollmentHistory?: EnrollmentRecord[];
  employerId?: string;
  mentorId?: string;
}

export interface ProgrammeModule {
  name: string;
  credits: number;
  notionalHours: number;
  nqfLevel: number;
}

export interface ProgrammeTemplate {
  id: string;
  name: string;
  saqaId: string;
  credits: number;
  totalNotionalHours: number;
  nqfLevel: number;
  knowledgeModules: ProgrammeModule[];
  practicalModules: ProgrammeModule[];
  workExperienceModules: ProgrammeModule[];
  isArchived?: boolean;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type ModuleCategory = "knowledge" | "practical" | "workExperience";

export interface IssuedBy {
  name: string;
  title: string;
}

export interface RecessPeriod {
  start: string;
  end: string;
  reason: string;
}

export interface Cohort {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  programmeId: string;
  campusId: string;

  facilitatorId: string;
  supportFacilitatorId?: string;
  assessorId: string;
  moderatorId: string;

  assessorEmail?: string;
  moderatorEmail?: string;
  qualificationId: string;

  learnerIds: string[];
  recessPeriods?: RecessPeriod[];
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
  changeReason?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// SME / EMPLOYER PARTNER ECOSYSTEM (Unified Master Interface)
// ═════════════════════════════════════════════════════════════════════════════

export type WorkArrangement = "On-site" | "Remote" | "Hybrid";
export type ComplianceStatus = "Yes" | "No" | "In progress" | "Somewhat";
export type RiskRating = "Low" | "Medium" | "High" | "Critical" | "Pending";
export type SMETier =
  | "Tier 1 (Enterprise)"
  | "Tier 2 (Established SME)"
  | "Tier 3 (Startup/Micro)"
  | "Pending Assessment";

export interface Employer {
  id: string;

  // Core Identifiers
  name: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  mentorId: string;

  // System Metadata
  status:
    | "active"
    | "archived"
    | "Pending Review"
    | "Approved"
    | "Rejected"
    | "Inactive";
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;

  // Extended Ecosystem Fields (Optional so legacy data doesn't break)
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  bbbeeLevel?: string;
  industrySector?: string[];
  website?: string;
  yearEstablished?: string;
  alternativeContact?: string;

  // Location
  physicalAddress?: string;
  province?: string;
  lat?: number | null;
  lng?: number | null;

  // Capacity & Environment
  employeeCount?: number;
  internCapacity?: number;
  workArrangement?: WorkArrangement | string;
  hasDedicatedMentors?: string;
  workEnvironmentDesc?: string;
  techStack?: string[];

  // Hosting Intent
  hostingMotivations?: string[];
  preferredLearnerLevel?: string[];
  preferredDisciplines?: string[];
  expectedStartDate?: string;
  expectedDuration?: string;

  // Mentorship & Projects
  supervisorName?: string;
  mentorExperienceLevel?: string;
  weeklyCheckIns?: string;
  projectTypes?: string;
  productionAccess?: string;
  contributionAreas?: string[];

  // Compliance & Incentives
  willingToSignWBL?: boolean;
  taxCompliant?: ComplianceStatus | string;
  hasHRPolicies?: boolean;
  bbbeeAwareness?: ComplianceStatus | string;
  interestedInBbbee?: boolean;
  etiAwareness?: boolean;
  requiresAdvisory?: boolean;
  dataConsent?: boolean;
  setaReportingConsent?: boolean;

  // Internal mLab Evaluation
  mlabTier?: SMETier | string;
  mlabRiskRating?: RiskRating | string;
  placementSuitability?: string;
  recommendedLearnerCount?: number;
  matchingPriorityScore?: number;
  internalNotes?: string;

  // Dynamic public form responses mapping
  customResponses?: Record<string, unknown>;
}

// ═════════════════════════════════════════════════════════════════════════════
// PLACEMENT ENGINE (The Matchmaker)
// ═════════════════════════════════════════════════════════════════════════════

export interface PlacementContract {
  id: string;
  learnerId: string;
  employerId: string;
  cohortId: string;

  status:
    | "Pending Match"
    | "Interviewing"
    | "Active Placement"
    | "Completed"
    | "Terminated"
    | "absorbed_permanently";
  workArrangement: WorkArrangement;

  assignedMentorName?: string;
  assignedMentorEmail?: string;

  stipendAmount?: number;
  fundedBy: "SETA" | "mLab" | "Host Employer" | "Unfunded";

  startDate: string;
  endDate: string;

  wblAgreementSigned: boolean;
  wblAgreementUrl?: string; // Link to uploaded PDF

  learnerRating?: number;
  employerRating?: number;
  isAbsorbedPostPlacement: boolean;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// The supported StackBlitz environments
export type StackBlitzTemplate =
  | "create-react-app"
  | "node"
  | "javascript"
  | "typescript"
  | "html"
  | "angular-cli"
  | "python"; // Note: Python requires WebContainers enabled in your StackBlitz account

// The configuration set by the Facilitator
export interface CodeSandboxConfig {
  // The engine to boot up
  template: StackBlitzTemplate;

  // Key-Value pair of file paths to raw code strings.
  // If blank slate, this might just be { "src/index.js": "// Start coding..." }
  initialFiles: Record<string, string>;

  // Optional: Pre-install specific NPM packages (e.g., { "axios": "^1.6.0" })
  dependencies?: Record<string, string>;
}

// How it fits into your existing block schema
export interface CodeSandboxBlock {
  id: string;
  type: "code_sandbox";
  title: string;
  instructions?: string; // e.g., "Build a calculator app with React"
  marks: number;
  config: CodeSandboxConfig;
}
