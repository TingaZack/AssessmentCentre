// src/types/ecosystem.types.ts

export type GuestIdRequirement = "hidden" | "optional" | "mandatory";

export interface GuestFormCustomField {
  id: string;
  label: string;
  type: "text" | "dropdown" | "checkbox";
  options?: string[]; // Only used if type is 'dropdown'
  required: boolean;
}

export interface EcosystemEvent {
  id: string;
  eventName: string;
  eventType: string;
  location: string;

  dateOfBirth?: string; // YYYY-MM-DD
  age?: number;
  isYouth?: boolean; // true if age is between 18 and 35

  locationDetails: {
    lat: number;
    lng: number;
    streetAddress: string;
    city: string;
    provinceCode: string;
    postalCode: string;
    formattedAddress?: string;
  };

  date: string; // ISO String
  endDate: string;
  maxCapacity: number;
  currentCheckIns: number;
  createdBy: string; // Admin/Facilitator UID

  linkedTargets?: string[]; // Array of KPI Target IDs this event contributes to

  // Array of names/IDs of people managing the event
  responsiblePersons?: string[];

  settings: {
    requireIdPassport: GuestIdRequirement;
    allowedProgrammes: string[]; // Deprecated in favor of eventType, but kept for legacy
    wifiSsid?: string;
    wifiPassword?: string;
  };

  guestFormBlueprint: GuestFormCustomField[];

  status: "active" | "completed" | "cancelled";
  createdAt: string;
  updatedAt?: string;
}

export interface EcosystemGuest {
  email: string; // Document ID in Firestore
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  idNumber?: string;
  preferredCity: string;
  persistentToken: string; // The UUID stored in their browser
  marketingOptIn: boolean;

  // History of every event they've checked into
  attendanceHistory: {
    eventId: string;
    attendedAt: string;
    responses: Record<string, any>;
  }[];

  totalEventsAttended: number;
  lastSeenAt: string;

  // Added for extended demographics flexibility
  customFields?: Record<string, any>;
  race?: string;
  disability?: string;
}

export interface EventCheckIn {
  id: string;
  eventId: string;
  guestEmail: string;
  guestPhone: any;
  guestName: string;
  guestIdNumber: string;
  timestamp: string;
  responses: Record<string, any>;
}

// ═════════════════════════════════════════════════════════════════════════════
// KPI TARGETS & STATE MANAGEMENT INTERFACES
// ═════════════════════════════════════════════════════════════════════════════

export interface EcosystemTarget {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  targetAmount: number;
  offlineCarryover: number;
  isArchived: boolean;
  linkedEvents: string[];
  // Computed fields added at runtime by React components
  kpiTotalProgress?: number;
  targetGoal?: number;
  progressPercent?: number;
  isStrictMode?: boolean;
}

export interface EcosystemSliceState {
  events: EcosystemEvent[];
  guests: EcosystemGuest[];
  checkins: EventCheckIn[];
  targets: EcosystemTarget[];
  ecosystemLoading: boolean;
  ecosystemError: string | null;

  // Core Synchronizers
  fetchEcosystemData: () => Promise<void>;
  saveEcosystemEvent: (
    eventData: Partial<EcosystemEvent>,
    selectedEventId?: string,
  ) => Promise<void>;
  saveKpiTarget: (targetForm: EcosystemTarget) => Promise<void>;
  archiveKpiTarget: (targetId: string) => Promise<void>;
  deleteKpiTarget: (targetId: string) => Promise<void>;
}
