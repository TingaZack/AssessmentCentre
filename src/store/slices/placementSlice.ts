// src/store/slices/placementSlice.ts

import {
  collection,
  getDocs,
  writeBatch,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { StateCreator } from "zustand";

export interface PlacementRecord {
  id: string;
  institutionId: string;
  learnerId: string;
  employerId: string;
  mentorId: string;
  placementType: "QCTO Workplace Module" | "Alumni Internship" | "External WIL";
  status: "pending_signatures" | "active" | "completed" | "terminated";
  startDate: string;
  endDate: string;
  compliance: {
    wblpaAgreementUrl: string;
    isAgreementFullyExecuted: boolean;
    bbbeeSpendCategory:
      | "Category B"
      | "Category C"
      | "Category D"
      | "Category E";
    fundingSource: "SETA Funded" | "Corporate Funded" | "Unfunded";
  };
  createdAt: string;
  updatedAt: string;
}

export interface PlacementSliceState {
  placements: PlacementRecord[];
  placementsLoading: boolean;
  placementsError: string | null;
  placementsLastFetched: number | null;

  fetchPlacements: (force?: boolean) => Promise<void>;
  createPlacement: (
    placementData: Omit<
      PlacementRecord,
      "id" | "createdAt" | "updatedAt" | "institutionId"
    >,
  ) => Promise<void>;
  updatePlacementStatus: (
    placementId: string,
    status: PlacementRecord["status"],
  ) => Promise<void>;
}

export const createPlacementSlice: StateCreator<
  PlacementSliceState,
  [],
  [],
  PlacementSliceState
> = (set, get) => ({
  placements: [],
  placementsLoading: false,
  placementsError: null,
  placementsLastFetched: null,

  fetchPlacements: async (force = false) => {
    const { placementsLastFetched, placementsLoading } = get();

    // Cache shield: prevent rapid re-fetching within 5 minutes
    if (
      !force &&
      placementsLastFetched &&
      Date.now() - placementsLastFetched < 5 * 60 * 1000
    )
      return;
    if (placementsLoading) return;

    set({ placementsLoading: true, placementsError: null });
    try {
      const snap = await getDocs(collection(db, "placements"));
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as PlacementRecord,
      );

      set({
        placements: list,
        placementsLoading: false,
        placementsLastFetched: Date.now(),
      });
    } catch (err: any) {
      console.error("Failed to fetch placements:", err);
      set({ placementsError: err.message, placementsLoading: false });
    }
  },

  createPlacement: async (placementData) => {
    set({ placementsLoading: true, placementsError: null });
    try {
      const batch = writeBatch(db);
      const placementId = `place_${Date.now()}`;
      const timestamp = new Date().toISOString();

      // Hardcode institution ID for now, can be dynamic later for multi-tenant
      const institutionId =
        import.meta.env.VITE_SDP_CODE || "default_institution";

      const newPlacement: PlacementRecord = {
        ...placementData,
        id: placementId,
        institutionId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      // 1. Atomic write to the placements collection
      batch.set(doc(db, "placements", placementId), newPlacement);

      // 2. Safely sync the legacy pointers onto the root profile to maintain backward-compatibility
      // with any older components that expect employerId on the learner doc.
      batch.set(
        doc(db, "learners", placementData.learnerId),
        {
          employerId: placementData.employerId,
          mentorId: placementData.mentorId,
          updatedAt: timestamp,
        },
        { merge: true },
      );

      await batch.commit();

      // 🚀 THE FIX: Use standard immutable update
      set((state) => ({
        placements: [...state.placements, newPlacement],
        placementsLoading: false,
      }));

      console.log(`✅ Successfully created placement ${placementId}`);
    } catch (err: any) {
      console.error("Failed to create placement:", err);
      set({ placementsError: err.message, placementsLoading: false });
      throw err;
    }
  },

  updatePlacementStatus: async (placementId, status) => {
    try {
      const targetRef = doc(db, "placements", placementId);
      const timestamp = new Date().toISOString();

      await updateDoc(targetRef, { status, updatedAt: timestamp });

      // 🚀 THE FIX: Use standard immutable array mapping
      set((state) => ({
        placements: state.placements.map((p) =>
          p.id === placementId
            ? { ...p, status: status, updatedAt: timestamp }
            : p,
        ),
      }));
    } catch (err: any) {
      console.error("Failed to update placement status:", err);
      throw new Error(
        `Failed to alter structural placement track: ${err.message}`,
      );
    }
  },
});
