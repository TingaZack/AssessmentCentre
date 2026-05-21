// src/store/slices/ecosystemSlice.ts

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type {
  EcosystemSliceState,
  EcosystemEvent,
  EcosystemGuest,
  EventCheckIn,
} from "../../types/ecosystem.types";
import type { StateCreator } from "zustand";

export const createEcosystemSlice: StateCreator<
  EcosystemSliceState,
  [],
  [],
  EcosystemSliceState
> = (set, get) => {
  // Hold reference cleanups for active unsubscriptions to prevent memory leaks
  let unsubEvents: (() => void) | null = null;
  let unsubGuests: (() => void) | null = null;
  let unsubCheckins: (() => void) | null = null;
  let unsubTargets: (() => void) | null = null;

  return {
    events: [],
    guests: [],
    checkins: [],
    targets: [],
    ecosystemLoading: false,
    ecosystemError: null,

    fetchEcosystemData: async () => {
      // Avoid duplicate listener attachments if already connected
      if (unsubEvents && unsubGuests && unsubCheckins && unsubTargets) return;

      set({ ecosystemLoading: true, ecosystemError: null });

      try {
        // 1. Fetch Events
        const eventsQuery = query(
          collection(db, "events"),
          orderBy("date", "desc"),
        );
        unsubEvents = onSnapshot(
          eventsQuery,
          (snapshot) => {
            const fetchedEvents = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as EcosystemEvent[];
            set({ events: fetchedEvents, ecosystemLoading: false });
          },
          (error) => {
            set({ ecosystemError: error.message, ecosystemLoading: false });
          },
        );

        // 2. Fetch Guests
        const guestsQuery = query(
          collection(db, "ecosystem_guests"),
          orderBy("lastSeenAt", "desc"),
        );
        unsubGuests = onSnapshot(guestsQuery, (snapshot) => {
          const fetchedGuests = snapshot.docs.map((doc) => ({
            email: doc.id,
            ...doc.data(),
          })) as EcosystemGuest[];
          set({ guests: fetchedGuests });
        });

        // 3. Fetch Check-ins
        const checkinsQuery = query(
          collection(db, "event_checkins"),
          orderBy("timestamp", "desc"),
        );
        unsubCheckins = onSnapshot(checkinsQuery, (snapshot) => {
          const fetchedCheckins = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as EventCheckIn[];
          set({ checkins: fetchedCheckins });
        });

        // 4. Fetch KPI Targets from Global Settings
        unsubTargets = onSnapshot(
          doc(db, "system_settings", "ecosystem_kpi"),
          (docSnap) => {
            if (docSnap.exists()) {
              set({ targets: docSnap.data().targets || [] });
            } else {
              set({ targets: [] });
            }
          },
        );
      } catch (err: any) {
        set({ ecosystemError: err.message, ecosystemLoading: false });
      }
    },

    saveEcosystemEvent: async (eventData, selectedEventId) => {
      const isEdit = !!selectedEventId;
      const eventRef = isEdit
        ? doc(db, "events", selectedEventId)
        : doc(collection(db, "events"));
      const payload = { ...eventData, updatedAt: new Date().toISOString() };

      if (isEdit) {
        await updateDoc(eventRef, payload);
      } else {
        payload.id = eventRef.id;
        payload.currentCheckIns = 0;
        payload.status = "active";
        payload.createdAt = new Date().toISOString();
        await setDoc(eventRef, payload);
      }
    },

    saveKpiTarget: async (targetForm) => {
      const { targets } = get();
      const existingIndex = targets.findIndex((t) => t.id === targetForm.id);
      const updatedTargets = [...targets];

      if (existingIndex >= 0) {
        updatedTargets[existingIndex] = targetForm;
      } else {
        updatedTargets.push(targetForm);
      }

      await setDoc(
        doc(db, "system_settings", "ecosystem_kpi"),
        { targets: updatedTargets },
        { merge: true },
      );
    },

    archiveKpiTarget: async (targetId) => {
      const { targets } = get();
      const updatedTargets = targets.map((t) =>
        t.id === targetId ? { ...t, isArchived: true } : t,
      );
      await setDoc(
        doc(db, "system_settings", "ecosystem_kpi"),
        { targets: updatedTargets },
        { merge: true },
      );
    },

    deleteKpiTarget: async (targetId) => {
      const { targets } = get();
      const updatedTargets = targets.filter((t) => t.id !== targetId);
      await setDoc(
        doc(db, "system_settings", "ecosystem_kpi"),
        { targets: updatedTargets },
        { merge: true },
      );
    },
  };
};
