// src/stores/useCourseStore.ts

import { create } from "zustand";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import type {
  CoursePackage,
  LearnerUnitProgress,
  CohortRunStatus,
  HubView,
} from "../pages/LearnerPortal/LearnerContentHub/types";

interface CourseStoreState {
  // Live Firestore Entities
  containersMap: Record<string, any>;
  cohortRuns: any[];
  allUnits: LearnerUnitProgress[];
  progressMap: Record<
    string,
    {
      completedUnitIds: string[];
      unitProgress: Record<string, number>; // FRACTIONAL PROGRESS TRACKING
      lastActiveUnitId?: string;
      lastActiveAt?: string;
    }
  >;
  savedCourseIds: Set<string>;

  // Computed Entities
  courses: CoursePackage[];
  loading: boolean;

  // View & Navigation State
  view: HubView;
  selectedCourse: CoursePackage | null;
  selectedUnit: LearnerUnitProgress | null;

  // Catalog Filter Controls
  activeTabFilter: "all" | "secam" | "qcto" | "applications" | "bookmarked";
  searchTerm: string;
  selectedLevel: string;
  durationFilter: "any" | "short" | "long";

  // Actions
  setView: (view: HubView) => void;
  setSelectedCourse: (course: CoursePackage | null) => void;
  setSelectedUnit: (unit: LearnerUnitProgress | null) => void;
  setActiveTabFilter: (
    tab: "all" | "secam" | "qcto" | "applications" | "bookmarked",
  ) => void;
  setSearchTerm: (term: string) => void;
  setSelectedLevel: (level: string) => void;
  setDurationFilter: (duration: "any" | "short" | "long") => void;

  // Subscription Action
  initializeCourseSubscriptions: (userId?: string) => () => void;
  recomputeCourses: () => void;
}

export const useCourseStore = create<CourseStoreState>((set, get) => ({
  containersMap: {},
  cohortRuns: [],
  allUnits: [],
  progressMap: {},
  savedCourseIds: new Set(),
  courses: [],
  loading: true,

  view: "catalog",
  selectedCourse: null,
  selectedUnit: null,

  activeTabFilter: "all",
  searchTerm: "",
  selectedLevel: "all",
  durationFilter: "any",

  setView: (view) => set({ view }),
  setSelectedCourse: (selectedCourse) => set({ selectedCourse }),
  setSelectedUnit: (selectedUnit) => set({ selectedUnit }),
  setActiveTabFilter: (activeTabFilter) => set({ activeTabFilter }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setSelectedLevel: (selectedLevel) => set({ selectedLevel }),
  setDurationFilter: (durationFilter) => set({ durationFilter }),

  recomputeCourses: () => {
    const { containersMap, cohortRuns, progressMap, allUnits, savedCourseIds } =
      get();
    const now = new Date();

    const computedCourses: CoursePackage[] = cohortRuns.map((runData) => {
      const runId = runData.id;
      const containerId = runData.containerId || runData.courseId || runId;
      const containerData =
        containersMap[containerId] || containersMap[runId] || {};

      // Determine strictly which IDs this course is allowed to read.
      const primaryRunForContainer = cohortRuns.find(
        (r) => (r.containerId || r.courseId) === containerId,
      )?.id;
      const isPrimaryRun = primaryRunForContainer === runId;

      // Generate unique target keys preventing cross-cohort data leaks
      const allowedProgressKeys = Array.from(
        new Set(isPrimaryRun ? [runId, containerId] : [runId]),
      );

      let progress: {
        completedUnitIds: string[];
        unitProgress: Record<string, number>;
        lastActiveUnitId?: string;
        lastActiveAt?: string;
      } = {
        completedUnitIds: [],
        unitProgress: {},
      };

      for (const key of allowedProgressKeys) {
        if (
          progressMap[key] &&
          (progressMap[key].completedUnitIds.length > 0 ||
            Object.keys(progressMap[key].unitProgress).length > 0)
        ) {
          progress = progressMap[key];
          break;
        }
      }

      const courseUnitsList = allUnits.filter(
        (u) => u.containerId === containerId || u.containerId === runId,
      );

      // WEIGHTED FRACTIONAL PROGRESS CALCULATOR
      const effectiveCompletedUnits = courseUnitsList.reduce((sum, u) => {
        const watchPct = progress.unitProgress?.[u.id] ?? 0;
        if (progress.completedUnitIds.includes(u.id) || watchPct >= 100) {
          return sum + 1;
        }
        return sum + watchPct / 100;
      }, 0);

      const hasRealProgress = effectiveCompletedUnits > 0;

      const timelineBlueprintName =
        runData.name ||
        runData.runName ||
        runData.cohortName ||
        runData.blueprintName ||
        runData.timelineName ||
        containerData.title ||
        "Untitled Cohort Run";

      // 🚀 EXTRACT NESTED TIMBOUNDCONFIG DATES AND PACING
      const timeConfig =
        runData.timeBoundConfig ||
        containerData.checkpointMetadata?.defaultTimeBoundConfig ||
        {};

      const startDate =
        timeConfig.startDate ||
        runData.startDate ||
        runData.runStartDate ||
        runData.timelineStartDate ||
        runData.applicationStartDate ||
        null;

      const endDate =
        timeConfig.endDate ||
        runData.endDate ||
        runData.runEndDate ||
        runData.timelineEndDate ||
        runData.applicationEndDate ||
        null;

      const applicationStartDate =
        runData.applicationStartDate || timeConfig.applicationStartDate || null;

      const applicationEndDate =
        runData.applicationEndDate || timeConfig.applicationEndDate || null;

      const isTimeBound =
        timeConfig.isTimeBound !== undefined
          ? timeConfig.isTimeBound
          : startDate || endDate
            ? true
            : false;

      const pacingModel = isTimeBound
        ? "cohort_scheduled"
        : "individual_self_paced";

      const startObj = startDate ? new Date(startDate) : null;
      const endObj = endDate ? new Date(endDate) : null;
      const appStartObj = applicationStartDate
        ? new Date(applicationStartDate)
        : null;
      const appEndObj = applicationEndDate
        ? new Date(applicationEndDate)
        : null;

      let runStatus: CohortRunStatus = "active";
      let statusLabel = "ACTIVE BATCH";
      let openingDateLabel = "";

      if (startObj && !isNaN(startObj.getTime())) {
        openingDateLabel = startObj.toLocaleDateString("en-ZA", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }

      if (runData.status === "draft" || containerData.status === "draft") {
        runStatus = "draft";
        statusLabel = "DRAFT BLUEPRINT";
      } else if (endObj && !isNaN(endObj.getTime()) && now > endObj) {
        runStatus = "ended";
        statusLabel = `ENDED ${endObj.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}`;
      } else if (startObj && !isNaN(startObj.getTime()) && now >= startObj) {
        runStatus = "active";
        statusLabel = "ACTIVE BATCH";
      } else if (
        appStartObj &&
        appEndObj &&
        !isNaN(appStartObj.getTime()) &&
        !isNaN(appEndObj.getTime()) &&
        now >= appStartObj &&
        now <= appEndObj
      ) {
        runStatus = "open_for_applications";
        statusLabel = `APPLY NOW (Closes ${appEndObj.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })})`;
      } else if (
        appEndObj &&
        !isNaN(appEndObj.getTime()) &&
        startObj &&
        now > appEndObj &&
        now < startObj
      ) {
        runStatus = "applications_closed";
        statusLabel = `APPLICATIONS CLOSED (Starts ${startObj.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })})`;
      } else if (startObj && !isNaN(startObj.getTime()) && now < startObj) {
        runStatus = "upcoming";
        statusLabel = `STARTS ${openingDateLabel || "SOON"}`;
      }

      const courseworkHours =
        runData.courseworkHours ??
        containerData.courseworkHours ??
        containerData.checkpointMetadata?.courseworkHours ??
        0;

      const computedContentMinutes = courseUnitsList.reduce(
        (acc, u) => acc + (u.estimatedMinutes || 0),
        0,
      );

      const contentHours =
        computedContentMinutes > 0
          ? Math.round((computedContentMinutes / 60) * 10) / 10
          : (runData.contentHours ??
            containerData.contentHours ??
            containerData.checkpointMetadata?.contentHours ??
            0);

      const estimatedTotalHours =
        Math.round((contentHours + courseworkHours) * 10) / 10;

      let isEvergreen = !isTimeBound;
      let cohortDurationLabel = "1 Week";

      // 🚀 ACCURATE POSITIVE WEEK CALCULATION
      if (
        startObj &&
        endObj &&
        !isNaN(startObj.getTime()) &&
        !isNaN(endObj.getTime()) &&
        endObj > startObj
      ) {
        const diffTime = Math.abs(endObj.getTime() - startObj.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.max(1, Math.round(diffDays / 7));
        cohortDurationLabel = `${diffWeeks} Week${diffWeeks > 1 ? "s" : ""}`;
      } else if (estimatedTotalHours > 0) {
        const estimatedWeeks = Math.max(1, Math.ceil(estimatedTotalHours / 10));
        cohortDurationLabel = `~${estimatedWeeks} Weeks`;
      }

      const isBookmarked =
        savedCourseIds.has(runId) || savedCourseIds.has(containerId);

      return {
        id: containerId,
        title: timelineBlueprintName,
        parentCourseTitle: containerData.title || "",
        description:
          runData.description ||
          containerData.description ||
          containerData.checkpointMetadata?.courseDescription ||
          "",
        framework:
          containerData.framework ||
          (containerData.checkpointMetadata?.secamStructure ? "secam" : "qcto"),
        referenceId:
          runData.code ||
          containerData.code ||
          containerData.referenceId ||
          `CR-${runId.substring(0, 4).toUpperCase()}`,
        level:
          runData.level ||
          containerData.level ||
          containerData.checkpointMetadata?.courseLevel ||
          "beginner",
        tags:
          runData.tags ||
          containerData.tags ||
          containerData.checkpointMetadata?.courseTags ||
          [],

        contentHours,
        courseworkHours,
        estimatedTotalHours,

        cohortRunId: runId,
        cohortRunName: runData.name || runData.cohortName || null,
        runStatus,
        startDate,
        endDate,
        pacingModel,
        timeBoundConfig: timeConfig,
        pacingScheduleBreakdown:
          runData.pacingScheduleBreakdown ||
          containerData.checkpointMetadata?.pacingScheduleBreakdown ||
          [],
        applicationStartDate,
        applicationEndDate,
        openingDateLabel: openingDateLabel || "01 Oct 2026",
        statusLabel,
        isEvergreen,
        cohortDurationLabel,

        totalUnitsCount: containerData.unitCount || courseUnitsList.length,
        completedUnitsCount: effectiveCompletedUnits,
        lastActiveUnitId: hasRealProgress
          ? progress.lastActiveUnitId
          : undefined,
        hasStarted: hasRealProgress,

        allowedProgressKeys,

        isBookmarked,
        isComingSoon:
          runStatus === "upcoming" ||
          runStatus === "draft" ||
          runStatus === "open_for_applications" ||
          runStatus === "applications_closed",

        illustrationType:
          runData.illustrationType ||
          containerData.illustrationType ||
          containerData.checkpointMetadata?.illustrationType ||
          "code",
        themeColor:
          runData.themeColor ||
          containerData.themeColor ||
          containerData.checkpointMetadata?.themeColor ||
          (containerData.framework === "qcto" ? "#059669" : "#0284c7"),

        rating: containerData.rating || 4.9,
        enrolledCount:
          runData.enrolledCount || containerData.enrolledCount || 0,
        previewVideoUrl:
          containerData.promoVideoUrl || containerData.previewVideoUrl,
        hasCertificate:
          runData.isCertificateAwarded ??
          containerData.isCertificateAwarded ??
          true,
        instructors: runData.instructors ||
          containerData.instructors ||
          containerData.checkpointMetadata?.instructors || [
            {
              name: "mLab Facilitator",
              role: "Lead Facilitator",
              avatarUrl: "",
            },
          ],
        attachments:
          runData.attachments ||
          containerData.attachments ||
          containerData.checkpointMetadata?.attachments ||
          [],
        whatYouWillLearn:
          runData.learningOutcomes ||
          containerData.learningOutcomes ||
          containerData.checkpointMetadata?.learningOutcomes ||
          [],
        prerequisites:
          runData.prerequisites ||
          containerData.prerequisites ||
          containerData.checkpointMetadata?.prerequisites ||
          [],
        requirements:
          runData.prerequisites ||
          containerData.prerequisites ||
          containerData.checkpointMetadata?.prerequisites ||
          [],
        targetAudience:
          runData.targetAudience ||
          containerData.targetAudience ||
          containerData.checkpointMetadata?.targetAudience ||
          [],
      } as unknown as CoursePackage;
    });

    set({ courses: computedCourses, loading: false });
  },

  initializeCourseSubscriptions: (userId?: string) => {
    set({ loading: true });

    // 1. Subscribe to Content Containers
    const unsubContainers = onSnapshot(
      collection(db, "content_containers"),
      (snapshot) => {
        const map: Record<string, any> = {};
        snapshot.docs.forEach((docSnap) => {
          map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        set({ containersMap: map });
        get().recomputeCourses();
      },
      (error) => {
        console.warn(
          "[useCourseStore] Content containers listener notice:",
          error.message,
        );
      },
    );

    // 2. Subscribe to Cohort Runs
    const unsubRuns = onSnapshot(
      collection(db, "cohort_runs"),
      (snapshot) => {
        const runs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        set({ cohortRuns: runs });
        get().recomputeCourses();
      },
      (error) => {
        console.warn(
          "[useCourseStore] Cohort runs listener notice:",
          error.message,
        );
      },
    );

    // 3. Subscribe to Learning Units
    const unsubUnits = onSnapshot(
      collection(db, "learning_units"),
      (snapshot) => {
        const fetchedUnits: LearnerUnitProgress[] = snapshot.docs.map(
          (docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              containerId: data.containerId,
              framework: data.framework || "secam",
              title: data.title || "Untitled Lesson",
              unitType: data.unitType || "video",
              estimatedMinutes: data.estimatedMinutes || 15,
              isRequired: data.isRequired ?? true,
              orderIndex: data.orderIndex || 1,
              sprintTitle: data.sprintTitle,
              dayOrLessonTitle: data.dayOrLessonTitle,
              moduleCode: data.moduleCode,
              moduleType: data.moduleType,
              videoUrl: data.videoUrl,
              contentHtml: data.contentHtml,
              requiredWatchPercentage: data.requiredWatchPercentage || 90,
              interactiveCheck: data.interactiveCheck || null,
              attachments: Array.isArray(data.attachments)
                ? data.attachments
                : [],
              tags: Array.isArray(data.tags) ? data.tags : [],
              isRequiredForNextUnit: data.isRequiredForNextUnit || false,
              isCompleted: false,
              isLocked: false,
            };
          },
        );
        set({ allUnits: fetchedUnits });
        get().recomputeCourses();
      },
      (error) => {
        console.warn(
          "[useCourseStore] Learning units listener notice:",
          error.message,
        );
      },
    );

    // 4. Subscribe to Learner Content Progress & Bookmarks
    let unsubProgress = () => {};
    let unsubBookmarks = () => {};
    const activeUid = userId || auth.currentUser?.uid;

    if (activeUid && auth.currentUser) {
      const qProgress = query(
        collection(db, "learner_content_progress"),
        where("userId", "==", activeUid),
      );

      unsubProgress = onSnapshot(
        qProgress,
        (snapshot) => {
          const map: Record<
            string,
            {
              completedUnitIds: string[];
              unitProgress: Record<string, number>;
              lastActiveUnitId?: string;
              lastActiveAt?: string;
            }
          > = {};

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const instanceKey =
              data.cohortRunId ||
              data.timelineId ||
              data.placementId ||
              data.containerId ||
              data.courseId;

            if (!instanceKey || !data.unitId) return;

            if (!map[instanceKey]) {
              map[instanceKey] = { completedUnitIds: [], unitProgress: {} };
            }

            const watchPct = data.watchPct || (data.isCompleted ? 100 : 0);
            const isDone = Boolean(data.isCompleted);

            map[instanceKey].unitProgress[data.unitId] = isDone
              ? 100
              : watchPct;

            if (
              isDone &&
              !map[instanceKey].completedUnitIds.includes(data.unitId)
            ) {
              map[instanceKey].completedUnitIds.push(data.unitId);
            }

            if (data.updatedAt) {
              if (
                !map[instanceKey].lastActiveAt ||
                data.updatedAt > (map[instanceKey].lastActiveAt || "")
              ) {
                map[instanceKey].lastActiveUnitId = data.unitId;
                map[instanceKey].lastActiveAt = data.updatedAt;
              }
            }
          });

          set({ progressMap: map });
          get().recomputeCourses();
        },
        (error) => {
          console.warn(
            "[useCourseStore] Learner content progress listener notice:",
            error.message,
          );
        },
      );

      const qBookmarks = query(
        collection(db, "learnerBookmarks"),
        where("userId", "==", activeUid),
      );

      unsubBookmarks = onSnapshot(
        qBookmarks,
        (snapshot) => {
          const ids = new Set<string>();
          const prefix = `${activeUid}_`;

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.targetId) ids.add(data.targetId);
            if (data.courseId) ids.add(data.courseId);
            if (data.cohortRunId) ids.add(data.cohortRunId);

            if (docSnap.id.startsWith(prefix)) {
              ids.add(docSnap.id.substring(prefix.length));
            }
          });

          set({ savedCourseIds: ids });
          get().recomputeCourses();
        },
        (error) => {
          console.warn(
            "[useCourseStore] Learner bookmarks listener notice:",
            error.message,
          );
        },
      );
    }

    return () => {
      unsubContainers();
      unsubRuns();
      unsubUnits();
      unsubProgress();
      unsubBookmarks();
    };
  },
}));
