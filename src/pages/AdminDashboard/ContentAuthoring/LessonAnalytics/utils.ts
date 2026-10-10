// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/utils.ts

import type {
  FirestoreTs,
  ProgressDoc,
  QuizAttemptDoc,
  RiskLevel,
  StepState,
} from "./types";

// ── Dates ────────────────────────────────────────────────────────────────────
export const toDate = (ts?: FirestoreTs | null): Date | null => {
  if (!ts) return null;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
};

export const fmtDateTime = (d: Date | null) =>
  d
    ? d.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Time unknown";

export const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—";

// ── Misc ─────────────────────────────────────────────────────────────────────
export const chunk = <T>(arr: T[], size = 30): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : `${n}%`;

/** Doc belongs to one of the selected runs. Docs without any container key are excluded. */
export const inScope = (
  keys: string[],
  d: { containerId?: string; timelineId?: string; cohortRunId?: string },
) => {
  const k = d.containerId || d.timelineId || d.cohortRunId;
  return k ? keys.includes(k) : false;
};

export const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob(
    ["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Checks & grading ─────────────────────────────────────────────────────────
export const MANUAL_CHECK_TYPES = ["oral_defense", "socratic_dialogue"];
export const isManualCheck = (t?: string) =>
  !!t && MANUAL_CHECK_TYPES.includes(t);

export const checkTypeLabel = (t: string) => {
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Single place that decides "this attempt is waiting for a facilitator".
 * Uses an explicit `needsReview` flag if the attempt has one, otherwise:
 * manual check types that haven't been graded by a human and aren't passed.
 */
export const attemptNeedsReview = (a: QuizAttemptDoc, checkType?: string) =>
  a.needsReview ??
  (isManualCheck(checkType ?? a.checkType) && !a.gradedBy && !a.passed);

// ── Progress ─────────────────────────────────────────────────────────────────
export const isDone = (p?: ProgressDoc) =>
  Boolean(p?.isCompleted) || (p?.watchPct || 0) >= 90;

/** A learner can have a doc per container; collapse them into one. */
export function mergeProgress(docs: ProgressDoc[]): ProgressDoc | undefined {
  if (docs.length === 0) return undefined;
  return docs.reduce((a, b) => ({
    ...((b.watchPct || 0) > (a.watchPct || 0) ? b : a),
    isCompleted: Boolean(a.isCompleted || b.isCompleted),
    passed: Boolean(a.passed || b.passed),
    attempts: Math.max(a.attempts || 0, b.attempts || 0),
    watchedMins: Math.max(a.watchedMins || 0, b.watchedMins || 0),
  }));
}

// ── Risk ─────────────────────────────────────────────────────────────────────
export const RISK_LABEL: Record<RiskLevel, string> = {
  high_risk: "High risk",
  moderate_risk: "Needs attention",
  on_track: "On track",
};

export const RISK_RANK: Record<RiskLevel, number> = {
  high_risk: 0,
  moderate_risk: 1,
  on_track: 2,
};

export const RISK_HELP =
  "High risk: 3+ attempts without passing, or a score under 50%. " +
  "Needs attention: not started, watched under 80%, or a score under 75%. " +
  "Passed learners and learners waiting for a grade are on track.";

export function assessRisk(r: {
  started: boolean;
  watchPct: number;
  attempts: number;
  score: number;
  passed: boolean;
  awaitingReview: boolean;
}): { level: RiskLevel; reason: string } {
  if (r.passed) return { level: "on_track", reason: "Passed" };
  if (r.awaitingReview)
    return { level: "on_track", reason: "Waiting for your grade" };
  if (r.attempts >= 3)
    return { level: "high_risk", reason: `${r.attempts} attempts, not passed` };
  if (r.attempts > 0 && r.score < 50)
    return { level: "high_risk", reason: `Scored ${r.score}%` };
  if (!r.started) return { level: "moderate_risk", reason: "Not started" };
  if (r.attempts > 0 && r.score < 75)
    return { level: "moderate_risk", reason: `Scored ${r.score}%` };
  if (r.watchPct < 80)
    return { level: "moderate_risk", reason: `Watched ${r.watchPct}%` };
  return {
    level: "on_track",
    reason: r.attempts > 0 ? "Retrying" : "Ready for quiz",
  };
}

// ── Journey stepper: Watch → Quiz → Grade → Done ─────────────────────────────
export function buildSteps(r: {
  hasCheck: boolean;
  manual: boolean;
  completed: boolean;
  watchPct: number;
  attempts: number;
  passed: boolean;
  awaitingReview: boolean;
}): StepState[] {
  const watch: StepState = r.completed
    ? "done"
    : r.watchPct > 0
      ? "active"
      : "todo";
  if (!r.hasCheck) return [watch, "na", "na", r.completed ? "done" : "todo"];

  let quiz: StepState = "todo";
  let grade: StepState = r.manual ? "todo" : "na";
  const failed = r.attempts > 0 && !r.passed && !r.awaitingReview;

  if (r.passed) {
    quiz = "done";
    if (r.manual) grade = "done";
  } else if (r.awaitingReview) {
    quiz = "done";
    grade = "active";
  } else if (failed) {
    if (r.manual) {
      quiz = "done";
      grade = "fail";
    } else quiz = "fail";
  } else if (r.completed) {
    quiz = "active";
  }
  return [watch, quiz, grade, r.passed ? "done" : "todo"];
}
