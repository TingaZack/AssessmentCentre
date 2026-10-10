// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/types.ts

import type { QuizAttemptDoc } from "../../../LearnerPortal/LearnerContentHub/types";
import type { ExtendedCohortRun } from "../LaunchCohortModal";

export type RiskLevel = "high_risk" | "moderate_risk" | "on_track";
export type FirestoreTs = { toDate?: () => Date; seconds?: number } | string;

export type StepState = "done" | "active" | "fail" | "todo" | "na";
export type Stage = "all" | "watch" | "quiz" | "discussion";

export interface EnrollmentDoc {
  id?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  cohortId?: string;
  cohortName?: string;
  containerId?: string;
  cohortRunId?: string;
  courseId?: string;
  status?: string;
}

export interface ProgressDoc {
  id?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  containerId?: string;
  cohortRunId?: string;
  cohortId?: string;
  cohortName?: string;
  unitId?: string;
  watchPct?: number;
  watchedMins?: number;
  isCompleted?: boolean;
  score?: number;
  passed?: boolean;
  attempts?: number;
  submittedAnswer?: string;
  updatedAt?: FirestoreTs;
}

export interface LessonComment {
  id: string;
  unitId: string;
  containerId?: string;
  timelineId?: string;
  cohortRunId?: string;
  userId: string;
  userName: string;
  userInitials?: string;
  text: string;
  createdAt?: FirestoreTs;
  isStaff?: boolean;
  isFlagged?: boolean;
  flagReason?: string | null;
}

export interface LessonQuestion {
  id: string;
  unitId: string;
  containerId?: string;
  timelineId?: string;
  cohortRunId?: string;
  userId: string;
  userName: string;
  title: string;
  contentHtml: string;
  answersCount?: number;
  createdAt?: FirestoreTs;
}

export interface LessonAnswer {
  id: string;
  questionId: string;
  unitId: string;
  containerId?: string;
  userId: string;
  userName: string;
  userInitials?: string;
  contentHtml: string;
  createdAt?: FirestoreTs;
  isStaff?: boolean;
}

export interface LearnerRow {
  learnerId: string;
  aliases: string[];
  name: string;
  email: string;
  cohortName: string;
  isBlockedFromForum: boolean;

  watchPct: number;
  watchedMins: number;
  durationMins: number;
  started: boolean;
  completed: boolean;

  hasCheck: boolean;
  checkType: string;
  attempts: number;
  score: number;
  passed: boolean;
  awaitingReview: boolean;
  attemptHistory: QuizAttemptDoc[];

  commentCount: number;
  questionCount: number;
  unansweredQuestions: number;

  steps: StepState[];
  risk: RiskLevel;
  riskReason: string;
  lastActivity: Date | null;
}

export interface CohortRunStats extends ExtendedCohortRun {
  enrolledCount: number;
  completionRate: number;
  passRate: number | null;
  avgTimeSpentMins: number;
  riskStatus: RiskLevel | null;
}
