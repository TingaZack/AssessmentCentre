// src/utils/pacingSchedule.ts

import type { RunScheduleEntry } from "../../types/content.types";
import type { ExtendedLearningUnit } from "../AdminDashboard/ContentAuthoring/ContentAuthoring";

export type PacingGranularity = "lesson" | "group";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toIsoDate = (d: Date) => d.toISOString().split("T")[0];

export function generatePacingSchedule(
  units: ExtendedLearningUnit[],
  startDate: string,
  endDate: string,
  granularity: PacingGranularity = "group",
): RunScheduleEntry[] {
  if (!startDate || !endDate) {
    throw new Error(
      "Both a start date and end date are required to generate a schedule.",
    );
  }
  if (units.length === 0) {
    return [];
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Start date or end date is not a valid date.");
  }
  if (end.getTime() <= start.getTime()) {
    throw new Error("End date must be after start date.");
  }

  const sortedUnits = [...units].sort(
    (a, b) =>
      (parseFloat(a.orderIndex as any) || 0) -
      (parseFloat(b.orderIndex as any) || 0),
  );

  const totalMs = end.getTime() - start.getTime();

  const buildEntries = (
    bucketCount: number,
    bucketOfUnit: (idx: number) => number,
  ): RunScheduleEntry[] => {
    const dueDatesByBucket: string[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const fraction = bucketCount === 1 ? 1 : i / (bucketCount - 1);
      dueDatesByBucket.push(
        toIsoDate(new Date(start.getTime() + fraction * totalMs)),
      );
    }

    return sortedUnits.map((unit, idx) => {
      const bucketIdx = bucketOfUnit(idx);
      const dueDate = dueDatesByBucket[bucketIdx];
      const availableFromDate =
        bucketIdx === 0
          ? toIsoDate(start)
          : toIsoDate(
              new Date(
                new Date(dueDatesByBucket[bucketIdx - 1]).getTime() +
                  MS_PER_DAY,
              ),
            );

      return { unitId: unit.id, dueDate, availableFromDate };
    });
  };

  if (granularity === "lesson") {
    return buildEntries(sortedUnits.length, (idx) => idx);
  }

  // Group units by day/topic, preserving first-seen order.
  const groupKeyForUnit = (u: ExtendedLearningUnit) =>
    u.moduleCode
      ? `${u.moduleCode}::${u.topicId}`
      : `${u.sprintTitle}::${u.dayOrLessonTitle}`;

  const groupOrder: string[] = [];
  const groupIndexByKey = new Map<string, number>();
  sortedUnits.forEach((u) => {
    const key = groupKeyForUnit(u);
    if (!groupIndexByKey.has(key)) {
      groupIndexByKey.set(key, groupOrder.length);
      groupOrder.push(key);
    }
  });

  return buildEntries(
    groupOrder.length,
    (idx) => groupIndexByKey.get(groupKeyForUnit(sortedUnits[idx]))!,
  );
}

export function countDistinctDueDates(schedule: RunScheduleEntry[]): number {
  return new Set(schedule.map((e) => e.dueDate)).size;
}
