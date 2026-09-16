// src/types/cohortContent.types.ts

export type PacingStrategy =
  | "all_unlocked"
  | "drip_by_date"
  | "milestone_unlocked";

export interface CohortContentAssignment {
  id: string;
  cohortId: string; // Target Cohort (e.g. "cohort_dbn_2026_01")
  containerId: string; // Root Content Package (e.g. "container_cta_01")
  assignedAt: string;
  assignedBy: string; // Admin user ID

  // Release & Pacing Controls
  pacingStrategy: PacingStrategy;
  cohortStartDate: string; // Anchor date for relative drip release

  // Granular Schedule Unlocks (Sprint/Module level overrides)
  unlockedSprints?: string[]; // e.g. ["Sprint 1: Frontend Engineering"]
  unlockedModuleCodes?: string[]; // e.g. ["KM-01", "PM-01"]

  // Custom Cohort Overrides (Optional)
  dueDateOverrides?: Record<string, string>; // unitId -> ISO Date
}
