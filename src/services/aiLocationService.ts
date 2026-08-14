// src/services/aiLocationService.ts

import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export interface AIResolvedMunicipality {
  localMunicipality: string;
  districtOrMetro: string;
  province: string;
  municipalityCode: string;
  mainPlace: string;
  coords: [number, number];
  economicHubs: string[];
  transitTrails: string[];
  placementInsight: string;
}

export const resolveLearnerMunicipalityWithAI = async (learnerData: {
  statsSaAreaCode?: string;
  streetAddress?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}): Promise<AIResolvedMunicipality | null> => {
  try {
    const resolveFunc = httpsCallable<
      any,
      { success: boolean; data: AIResolvedMunicipality }
    >(functions, "resolveLearnerMunicipalityAI");

    const response = await resolveFunc({
      statsSaAreaCode: learnerData.statsSaAreaCode,
      streetAddress: learnerData.streetAddress,
      city: learnerData.city,
      province: learnerData.province,
      postalCode: learnerData.postalCode,
    });

    if (response.data?.success) {
      return response.data.data;
    }

    return null;
  } catch (error) {
    console.error("Failed to resolve municipality via AI callable:", error);
    return null;
  }
};
