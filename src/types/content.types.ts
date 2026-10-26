export type FrameworkType = "qcto" | "secam";

export type UnitFormatType =
  | "reading"
  | "video"
  | "interactive_code"
  | "resource_download";

export type CheckType =
  | "none"
  | "mcq"
  | "spot_the_bug"
  | "unit_test"
  | "socratic_dialogue"
  | "oral_defense";

export type CheckTriggerScope = "per_lesson" | "end_of_day" | "end_of_sprint";

export type AccreditationBody =
  | "qcto"
  | "mict_seta"
  | "iitpsa"
  | "mlab"
  | "iitpsa_mlab"
  | "other"
  | "none";

export type DripPacingMode = "all_at_once" | "weekly_drip" | "fixed_dates";

export type DueDateType = "hard" | "soft";

export type LateSubmissionPolicy = "block" | "flag_late";

// ─── ACCREDITATION & PACING CONFIGURATIONS ───

export interface AccreditationConfig {
  body: AccreditationBody;
  customText?: string | null;
  saqaId?: string | null;
  nqfLevel?: string | number | null;
  isAccredited?: boolean;
  credits?: number | null;
  certificateTemplateId?: string | null;
  coBrandingLogos?: string[];
}

export interface TimeBoundConfig {
  isTimeBound: boolean;
  startDate?: string;
  endDate?: string;
  enforceStrictDeadline?: boolean;
  pacingStrategy?: "even" | "manual";
}

export interface DueDateConfig {
  type: DueDateType;
  offsetDays?: number;
  dueDateIso?: string;
  latePolicy?: LateSubmissionPolicy;
}

export interface LessonAttachment {
  id: string;
  name: string;
  url: string;
  fileType: string;
  uploadedAt: string;
  description?: string;
  fileSize?: number;
  sizeBytes?: number;
}

// ─── MULTI-SLOT ASSESSMENT GATING CONFIGURATIONS ───

export type AssessmentUnlockTrigger = "submission" | "grading";

export interface GateSlot {
  enabled: boolean;
  assessmentId: string | null;
  requirePassToUnlockSummative?: boolean; // For formative slots: passing score required before attempting summative
  unlockNextOn?: AssessmentUnlockTrigger; // 'submission' unlocks next lesson immediately; 'grading' waits for assessor verdict
}

export interface AssessmentGatesConfig {
  formative?: GateSlot;
  summative?: GateSlot;
  other?: GateSlot;
}

// ─── MASTER CONTAINER DATA MODEL ───

export interface ContentContainer {
  id: string;
  title: string;
  referenceId: string;
  framework: FrameworkType;
  triggerScope?: CheckTriggerScope;
  programmeTemplateId?: string;
  description?: string;
  instructors?: any[];
  attachments?: LessonAttachment[];
  createdAt?: string;
  updatedAt?: string;

  // Visual & Presentation Metadata
  illustrationType?: string;
  themeColor?: string;
  level?: string;
  tags?: string[];
  courseworkHours?: number;
  contentHours?: number;
  estimatedTotalHours?: number;
  materialIncludes?: string[];
  previewVideoUrl?: string;
  isCertificateAwarded?: boolean;
  checkpointScope?: "per_lesson" | "per_day" | "per_sprint";

  // Defaults for newly launched Cohort Runs
  defaultAccreditation?: AccreditationConfig;
  defaultTimeBoundConfig?: TimeBoundConfig;

  // Backward Compatibility & Migration Metadata
  accreditationBody?: AccreditationBody;
  customAccreditationText?: string;
  timeBoundConfig?: TimeBoundConfig;
  checkpointMetadata?: any;
}

// ─── COHORT RUNS (TIME-BOUND DELIVERIES OF MASTER BLUEPRINTS) ───

export interface RunScheduleEntry {
  unitId: string;
  dueDate: string;
  availableFromDate?: string;
  linkedAssessmentId?: string | null;
  assessmentGates?: AssessmentGatesConfig;
  dueDateConfig?: DueDateConfig;
}

export interface CohortRun {
  id: string;
  containerId: string;
  cohortId: string | null;
  cohortName: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  timeBoundConfig: TimeBoundConfig;
  accreditation?: AccreditationConfig;
  generatedSchedule: RunScheduleEntry[];
  status: "draft" | "active" | "paused" | "completed" | "archived";
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

// ─── INTERACTIVE CHECKS & LEARNING UNITS ───

export interface MCQOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface MCQQuestion {
  id: string;
  question: string;
  options: MCQOption[];
  explanation?: string;
}

export interface InteractiveCheckConfig {
  checkType: CheckType;
  instructions: string;
  isRequiredForCompletion: boolean;
  triggerScope?: CheckTriggerScope;
  buggyCode?: string;
  solutionCode?: string;
  diagnosticHint?: string;
  timeLimitSeconds?: number;
  aiPersonaRole?: "junior_dev" | "client" | "qa_auditor" | "architect";
  conversationGoal?: string;
  defenseQuestion?: string;

  // Multi-Question MCQ Quiz Configuration
  mcqQuestions?: MCQQuestion[];

  // Legacy single-question properties for backward compatibility
  mcqQuestion?: string;
  mcqOptions?: MCQOption[];
}

export interface LearningUnit {
  id: string;
  containerId: string;
  programmeTemplateId?: string;
  framework: FrameworkType;
  title: string;
  unitType: UnitFormatType;
  estimatedMinutes: number;
  isRequired: boolean;
  orderIndex: number;

  // Rich Text / Video Assets
  contentHtml?: string;
  videoUrl?: string;
  requiredWatchPercentage?: number;

  // QCTO Blueprint Metadata
  moduleType?: "knowledge" | "practical" | "workplace";
  moduleCode?: string;
  topicId?: string;

  // SECAM Bootcamp Metadata
  sprintTitle?: string;
  dayOrLessonTitle?: string;

  // Verification Check (In-Lesson interactive check)
  interactiveCheck?: InteractiveCheckConfig | null;

  // Multi-Slot Assessment Gating Matrix
  assessmentGates?: AssessmentGatesConfig;

  // Legacy Single Assessment Properties (Retained for Backward Compatibility)
  linkedAssessmentId?: string | null;
  unlinkedPolicy?: "soft_gate" | "hard_gate";
  passingCompetencyRequired?: boolean;

  // Pacing & Due Date Configurations
  dueDateConfig?: DueDateConfig;

  // Supplementary & Gating Extensions
  attachments?: LessonAttachment[];
  isRequiredForNextUnit?: boolean;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── VERIFICATION & LEARNER PROGRESS ───

export interface VerificationReceipt {
  verificationId?: string;
  passed: boolean;
  score?: number;
  feedback?: string;
  attemptedAt: string;
  checkType?: CheckType;
  userResponse?: string;
  selectedMcqOptionId?: string;
  selectedMcqOptionIds?: Record<string, string>;
}

export interface LearnerContentProgress {
  id: string;
  learnerId: string;
  authUid: string;
  cohortId: string;
  containerId?: string;
  cohortRunId?: string;
  programmeId?: string;
  unitId: string;
  framework: FrameworkType;
  moduleCode?: string;
  topicId?: string;
  sprintTitle?: string;
  status: "not_started" | "in_progress" | "completed";
  isCompleted?: boolean;
  timeSpentSeconds: number;
  watchedMins?: number;
  watchPct?: number;
  lastWatchPositionSeconds?: number;
  maxWatchPercentageReached?: number;
  score?: number;
  passed?: boolean;
  attempts?: number;
  submittedAnswer?: string;
  verificationReceipt?: VerificationReceipt | null;
  lastAccessedAt: string;
  completedAt?: string;
  updatedAt?: any;
}

// ─── REVISIONS & AUDIT SNAPSHOTS ───

export interface CurriculumRevisionSnapshot {
  id: string;
  containerId: string;
  committedBy: string;
  committedAt: string;
  snapshotNote?: string;
  unitCount: number;
  illustrationType?: string;
  themeColor?: string;
  level?: string;
  description?: string;
  prerequisites?: string[];
  learningOutcomes?: string[];
  targetAudience?: string[];
  isCertificateAwarded?: boolean;
  tags?: string[];
  instructors?: any[];
  contentHours?: number;
  courseworkHours?: number;
  estimatedTotalHours?: number;
  materialIncludes?: string[];
  previewVideoUrl?: string;
  checkpointScope?: string;
  secamStructure?: any[];
  qctoModuleCheckpoints?: Record<string, any>;
  qctoTopicCheckpoints?: Record<string, any>;
  defaultAccreditation?: AccreditationConfig;
  accreditationBody?: string;
  customAccreditationText?: string;
}
