// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/hooks.ts
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { chunk } from "./utils";

/**
 * Live `where(field, 'in', values)` query that:
 *  - splits into chunks of 30 (Firestore limit) instead of silently dropping extras
 *  - subscribes ONCE per value-set, so derived data can be merged in useMemo without re-subscribing
 * Every doc is returned as { id, ...data }.
 */
export function useChunkedQuery<T>(
  collectionName: string,
  field: string,
  values: string[],
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const key = values.join("|");

  useEffect(() => {
    if (values.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const groups = chunk(values, 30);
    const buckets: T[][] = groups.map(() => []);
    const ready = new Set<number>();
    const markReady = (i: number) => {
      ready.add(i);
      if (ready.size === groups.length) setLoading(false);
    };

    const unsubs = groups.map((ids, i) =>
      onSnapshot(
        query(collection(db, collectionName), where(field, "in", ids)),
        (snap) => {
          buckets[i] = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as unknown as T,
          );
          setData(buckets.flat());
          markReady(i);
        },
        (err) => {
          console.warn(
            `[LessonAnalytics] ${collectionName} query failed:`,
            err,
          );
          markReady(i);
        },
      ),
    );

    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, field, key]);

  return { data, loading };
}
