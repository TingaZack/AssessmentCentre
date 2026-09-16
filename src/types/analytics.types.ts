// src/types/analytics.types.ts

export interface LearnerLessonProgress {
  id: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  avatarUrl?: string;
  cohortId: string;
  cohortName: string;
  unitId: string;

  // Video Engagement
  watchPercentage: number; // e.g., 95%
  totalSecondsWatched: number;
  completedVideo: boolean;

  // Assessment & Verification Check
  interactiveCheckPassed: boolean;
  lessonScore: number; // Score for this specific lesson (0 - 100)
  cumulativeQuizScore: number; // Average score across ALL completed lessons in course
  checkAttemptCount: number;
  lastAttemptAt?: string;
  submittedCodeOrAnswer?: string; // Solution submitted for Spot-the-Bug or Socratic AI

  // Account Status
  isBlockedFromForum: boolean;
  flaggedCount: number;
}

export interface LessonComment {
  id: string;
  unitId: string;
  cohortId: string;
  authorId: string;
  authorName: string;
  authorRole: "student" | "instructor" | "admin";
  content: string;
  createdAt: string;
  isFlagged: boolean;
  flagReason?: string;
  parentId?: string | null; // Null for top-level questions, commentId for replies
  replies?: LessonComment[];
}
