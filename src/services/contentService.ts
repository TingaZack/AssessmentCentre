// src/services/contentService.ts

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  AccreditationConfig,
  CohortRun,
  LearnerContentProgress,
  LearningUnit,
  RunScheduleEntry,
  VerificationReceipt,
} from "../types/content.types";

// ─── LEARNING UNIT CRUD OPERATIONS ───

export const fetchUnitsByContainer = async (
  containerId: string,
): Promise<LearningUnit[]> => {
  const q = query(
    collection(db, "learning_units"),
    where("containerId", "==", containerId),
  );
  const snap = await getDocs(q);
  const units = snap.docs.map(
    (d) =>
      ({
        id: d.id,
        attachments: d.data().attachments || [],
        ...d.data(),
      }) as LearningUnit,
  );
  return units.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
};

export const fetchUnitsByProgramme = async (
  programmeId: string,
): Promise<LearningUnit[]> => {
  const q = query(
    collection(db, "learning_units"),
    where("containerId", "==", programmeId),
  );
  const snap = await getDocs(q);
  const units = snap.docs.map(
    (d) =>
      ({
        id: d.id,
        attachments: d.data().attachments || [],
        ...d.data(),
      }) as LearningUnit,
  );
  return units.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
};

export const saveLearningUnit = async (
  unitData: Omit<LearningUnit, "id">,
  unitId?: string,
): Promise<string> => {
  const ref = unitId
    ? doc(db, "learning_units", unitId)
    : doc(collection(db, "learning_units"));
  const payload = {
    ...unitData,
    attachments: unitData.attachments || [],
    updatedAt: new Date().toISOString(),
    ...(unitId ? {} : { createdAt: new Date().toISOString() }),
  };
  await setDoc(ref, payload, { merge: true });
  return ref.id;
};

export const deleteLearningUnit = async (unitId: string): Promise<void> => {
  await deleteDoc(doc(db, "learning_units", unitId));
};

// ─── LEARNER PROGRESS & HEARTBEAT ENGINE ───

export const recordContentHeartbeat = async (params: {
  cohortId: string;
  learnerId: string;
  authUid: string;
  programmeId: string;
  unit: LearningUnit;
  additionalSeconds: number;
  currentVideoTime?: number;
  totalVideoDuration?: number;
}): Promise<void> => {
  const {
    cohortId,
    learnerId,
    authUid,
    programmeId,
    unit,
    additionalSeconds,
    currentVideoTime = 0,
    totalVideoDuration = 0,
  } = params;

  const progressDocId = `${cohortId}_${learnerId}_${unit.id}`;
  const ref = doc(db, "learner_content_progress", progressDocId);

  let currentWatchPct = 0;
  if (totalVideoDuration > 0) {
    currentWatchPct = Math.min(
      100,
      Math.round((currentVideoTime / totalVideoDuration) * 100),
    );
  }

  const existingSnap = await getDoc(ref);

  if (existingSnap.exists()) {
    const prev = existingSnap.data() as LearnerContentProgress;
    const newTotalSeconds = (prev.timeSpentSeconds || 0) + additionalSeconds;
    const newMaxWatchPct = Math.max(
      prev.maxWatchPercentageReached || 0,
      currentWatchPct,
    );

    // Auto-complete videos if watch threshold is met and no dynamic check is configured
    let newStatus = prev.status;
    if (
      unit.unitType === "video" &&
      unit.requiredWatchPercentage &&
      newMaxWatchPct >= unit.requiredWatchPercentage &&
      (!unit.interactiveCheck || unit.interactiveCheck.checkType === "none")
    ) {
      newStatus = "completed";
    } else if (prev.status === "not_started") {
      newStatus = "in_progress";
    }

    await updateDoc(ref, {
      timeSpentSeconds: newTotalSeconds,
      lastWatchPositionSeconds: currentVideoTime,
      maxWatchPercentageReached: newMaxWatchPct,
      status: newStatus,
      lastAccessedAt: new Date().toISOString(),
      ...(newStatus === "completed" && !prev.completedAt
        ? { completedAt: new Date().toISOString() }
        : {}),
    });
  } else {
    const initialPayload: LearnerContentProgress = {
      id: progressDocId,
      learnerId,
      authUid,
      cohortId,
      programmeId,
      unitId: unit.id,
      framework: unit.framework,
      moduleCode: unit.moduleCode,
      topicId: unit.topicId,
      sprintTitle: unit.sprintTitle,
      status: "in_progress",
      timeSpentSeconds: additionalSeconds,
      lastWatchPositionSeconds: currentVideoTime,
      maxWatchPercentageReached: currentWatchPct,
      lastAccessedAt: new Date().toISOString(),
    };
    await setDoc(ref, initialPayload);
  }
};

export const completeLearningUnit = async (params: {
  cohortId: string;
  learnerId: string;
  authUid: string;
  programmeId: string;
  unit: LearningUnit;
  receipt?: VerificationReceipt;
}): Promise<void> => {
  const { cohortId, learnerId, authUid, programmeId, unit, receipt } = params;
  const progressDocId = `${cohortId}_${learnerId}_${unit.id}`;
  const ref = doc(db, "learner_content_progress", progressDocId);

  const payload = {
    learnerId,
    authUid,
    cohortId,
    programmeId,
    unitId: unit.id,
    framework: unit.framework,
    moduleCode: unit.moduleCode,
    topicId: unit.topicId,
    sprintTitle: unit.sprintTitle,
    status: "completed",
    verificationReceipt: receipt || null,
    lastAccessedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  await setDoc(ref, payload, { merge: true });
};

// ─── ASSESSMENT PREREQUISITE GATE VERIFIER ───

export const verifyModulePrerequisites = async (
  cohortId: string,
  learnerId: string,
  containerId: string,
  targetModuleOrSprint: string,
  framework: "qcto" | "secam",
): Promise<{
  isUnlocked: boolean;
  totalUnits: number;
  completedUnits: number;
  missingUnits: LearningUnit[];
}> => {
  // 1. Fetch mandatory units for the target module/sprint
  const unitsQuery = query(
    collection(db, "learning_units"),
    where("containerId", "==", containerId),
    where(
      framework === "qcto" ? "moduleCode" : "sprintTitle",
      "==",
      targetModuleOrSprint,
    ),
  );
  const unitsSnap = await getDocs(unitsQuery);
  const allUnits = unitsSnap.docs.map(
    (d) =>
      ({
        id: d.id,
        attachments: d.data().attachments || [],
        ...d.data(),
      }) as LearningUnit,
  );
  const mandatoryUnits = allUnits.filter((u) => u.isRequired !== false);

  if (mandatoryUnits.length === 0) {
    return {
      isUnlocked: true,
      totalUnits: 0,
      completedUnits: 0,
      missingUnits: [],
    };
  }

  // 2. Query completed progress receipts
  const progressQuery = query(
    collection(db, "learner_content_progress"),
    where("cohortId", "==", cohortId),
    where("learnerId", "==", learnerId),
    where("status", "==", "completed"),
  );
  const progressSnap = await getDocs(progressQuery);
  const completedUnitIds = new Set(
    progressSnap.docs.map((d) => (d.data() as LearnerContentProgress).unitId),
  );

  // 3. Evaluate completion deficit
  const missingUnits = mandatoryUnits.filter(
    (u) => !completedUnitIds.has(u.id),
  );

  return {
    isUnlocked: missingUnits.length === 0,
    totalUnits: mandatoryUnits.length,
    completedUnits: mandatoryUnits.length - missingUnits.length,
    missingUnits,
  };
};

// ─── COHORT RUN TIMELINE MANAGEMENT ───

export async function createDraftCohortRun(
  containerId: string,
  cohortName: string,
): Promise<string> {
  const ref = doc(collection(db, "cohort_runs"));
  const newRun: Omit<CohortRun, "id"> = {
    containerId,
    cohortId: null,
    cohortName,
    status: "draft",
    timeBoundConfig: {
      isTimeBound: true,
      startDate: "",
      endDate: "",
      enforceStrictDeadline: false,
      pacingStrategy: "even",
    },
    generatedSchedule: [],
    createdAt: new Date().toISOString(),
    createdBy: "Admin Content Author",
  };
  await setDoc(ref, { id: ref.id, ...newRun });
  return ref.id;
}

export async function updateCohortRunDates(
  runId: string,
  isTimeBound: boolean,
  startDate: string,
  endDate: string,
): Promise<void> {
  if (
    isTimeBound &&
    startDate &&
    endDate &&
    new Date(endDate).getTime() <= new Date(startDate).getTime()
  ) {
    throw new Error("End date must be after start date.");
  }

  await updateDoc(doc(db, "cohort_runs", runId), {
    "timeBoundConfig.isTimeBound": isTimeBound,
    "timeBoundConfig.startDate": isTimeBound ? startDate : "",
    "timeBoundConfig.endDate": isTimeBound ? endDate : "",
    generatedSchedule: [],
  });
}

export async function updateCohortRunSettings(
  runId: string,
  payload: {
    isTimeBound: boolean;
    startDate: string;
    endDate: string;
    cohortIds: string[];
  },
): Promise<void> {
  if (
    payload.isTimeBound &&
    payload.startDate &&
    payload.endDate &&
    new Date(payload.endDate).getTime() <= new Date(payload.startDate).getTime()
  ) {
    throw new Error("End date must be after start date.");
  }

  await updateDoc(doc(db, "cohort_runs", runId), {
    "timeBoundConfig.isTimeBound": payload.isTimeBound,
    "timeBoundConfig.startDate": payload.isTimeBound ? payload.startDate : "",
    "timeBoundConfig.endDate": payload.isTimeBound ? payload.endDate : "",
    cohortIds: payload.cohortIds,
    cohortId: payload.cohortIds.length > 0 ? payload.cohortIds[0] : null,
    generatedSchedule: [],
  });
}

export async function updateCohortRunStatus(
  runId: string,
  status: CohortRun["status"],
): Promise<void> {
  await updateDoc(doc(db, "cohort_runs", runId), { status });
}

export async function deleteCohortRun(runId: string): Promise<void> {
  await deleteDoc(doc(db, "cohort_runs", runId));
}

export async function getCohortRunsForContainer(
  containerId: string,
): Promise<CohortRun[]> {
  const q = query(
    collection(db, "cohort_runs"),
    where("containerId", "==", containerId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CohortRun);
}

export interface FinalizeCohortRunLaunchOptions {
  name: string;
  description?: string;
  themeColor?: string;
  illustrationType?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  cohortIds: string[];
  isTimeBound: boolean;
  startDate?: string;
  endDate?: string;
  accreditation?: AccreditationConfig;
  enforceStrictDeadline?: boolean;
  schedule: RunScheduleEntry[];

  isCertificateAwarded?: boolean;
  certificateIssuerMode?: "mlab_internal" | "external_authority";
  certificateTemplateId?: string;
  externalIssuerName?: string;
  awaitingExternalNotice?: string;
}

export async function finalizeCohortRunLaunch(
  runId: string,
  payload: FinalizeCohortRunLaunchOptions,
): Promise<void> {
  if (payload.isTimeBound) {
    if (
      payload.startDate &&
      payload.endDate &&
      new Date(payload.endDate).getTime() <=
        new Date(payload.startDate).getTime()
    ) {
      throw new Error("End date must be after start date.");
    }
    if (payload.schedule.length === 0) {
      throw new Error(
        "Generate a pacing schedule before launching a time-bound run.",
      );
    }
  }

  if (payload.cohortIds.length === 0) {
    throw new Error(
      "At least one target cohort must be selected before launching.",
    );
  }

  const updateData: Record<string, any> = {
    cohortIds: payload.cohortIds,
    cohortId: payload.cohortIds[0],
    "timeBoundConfig.isTimeBound": payload.isTimeBound,
    "timeBoundConfig.startDate": payload.isTimeBound ? payload.startDate : "",
    "timeBoundConfig.endDate": payload.isTimeBound ? payload.endDate : "",
    "timeBoundConfig.enforceStrictDeadline": payload.isTimeBound
      ? payload.enforceStrictDeadline
      : false,
    accreditation: payload.accreditation,
    generatedSchedule: payload.isTimeBound ? payload.schedule : [],
    status: "active",

    // SAVE CERTIFICATE STUDIO SETTINGS
    isCertificateAwarded: payload.isCertificateAwarded ?? true,
    certificateIssuerMode: payload.certificateIssuerMode || "mlab_internal",
    certificateTemplateId: payload.certificateTemplateId || null,
    externalIssuerName: payload.externalIssuerName || "",
    awaitingExternalNotice: payload.awaitingExternalNotice || "",
  };

  if (payload.name) {
    updateData.name = payload.name;
    updateData.cohortName = payload.name;
  }
  if (payload.description !== undefined) {
    updateData.description = payload.description;
  }
  if (payload.themeColor !== undefined) {
    updateData.themeColor = payload.themeColor;
  }
  if (payload.illustrationType !== undefined) {
    updateData.illustrationType = payload.illustrationType;
  }
  if (payload.applicationStartDate !== undefined) {
    updateData.applicationStartDate = payload.applicationStartDate;
  }
  if (payload.applicationEndDate !== undefined) {
    updateData.applicationEndDate = payload.applicationEndDate;
  }

  await updateDoc(doc(db, "cohort_runs", runId), updateData);
}
