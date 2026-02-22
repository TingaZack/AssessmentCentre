// src/types/assessment.types.ts

// --- ROLES & USERS ---
export type UserRole =
  | "admin"
  | "learner"
  | "facilitator"
  | "assessor"
  | "moderator"
  | "mentor";

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  signatureUrl?: string; // Mandatory for all roles
  cohortId?: string; // Links learner to a class
  lastLogin?: string;
}

// --- ASSESSMENT CONTENT (The "Question Paper") ---
export type AssessmentType =
  | "formative"
  | "summative"
  | "practical"
  | "logbook";

export interface AssessmentTask {
  id: string;
  moduleId: string; // e.g. "KM-01"
  topicCode: string; // e.g. "KM-01-KT01"
  title: string;
  type: AssessmentType;
  description: string;
  totalMarks: number;
  weighting: number; // e.g. 5%
  rubric?: RubricItem[];
}

export interface RubricItem {
  criteria: string;
  maxMarks: number;
}

// --- SUBMISSIONS (The "Answer Sheet") ---
export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "verified"
  | "graded"
  | "moderated";

export interface Submission {
  id: string;
  assessmentId: string;
  learnerId: string;
  cohortId: string;
  status: SubmissionStatus;
  submittedAt?: string;

  // EVIDENCE
  textAnswers?: Record<string, string>; // For workbook questions
  artifacts?: Artifact[]; // For PM modules (files/links)
  logEntries?: LogEntry[]; // For WM modules

  // LAYERS (The "Pens")
  facilitatorSignOff?: {
    signed: boolean;
    date: string;
    signatureUrl: string;
  };
  assessorMarks?: {
    score: number;
    feedback: string;
    outcome: "Competent" | "NYC";
    redPenData?: string; // JSON string for canvas annotations
    date: string;
    assessorId: string;
  };
  moderatorReview?: {
    sampled: boolean;
    decision: "Uphold" | "Overturn";
    greenPenData?: string;
    date: string;
    moderatorId: string;
  };
}

export interface Artifact {
  id: string;
  type: "file" | "link" | "code";
  url: string;
  label: string;
}

export interface LogEntry {
  id: string;
  date: string;
  activityCode: string; // e.g. "WA0101"
  description: string;
  hours: number;
  mentorSigned: boolean;
}
