import type { LearnerDemographics } from "./index";

export type UserRole =
  | "admin"
  | "learner"
  | "facilitator"
  | "assessor"
  | "moderator"
  | "mentor";

interface UploadedDocument {
  id: string;
  name?: string;
  url: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  signatureUrl?: string;
  profilePhotoUrl: string;
  cohortId?: string;
  createdAt?: string;
  authUid?: string;
  profileCompleted?: boolean;
  hasSeenOnboarding?: boolean;
  uploadedDocuments?: UploadedDocument[];
  demographics?: LearnerDemographics;
  province?: string;
  isSuperAdmin?: boolean;

  companyName?: string;
  employerId: string;

  // these Practitioner-specific fields:
  assessorRegNumber?: string;
  bio?: string;
  primarySeta?: string;
  specializationScope?: string;
  registrationExpiry?: string;
  yearsExperience?: number;
  highestQualification?: string;
  nationalityType?: "South African" | "Foreign National";
  idNumber?: string;
  passportNumber?: string;
  dateOfBirth?: string;
  complianceDocs?: {
    identificationUrl?: string;
    assessorCertUrl?: string;
    regLetterUrl?: string;
    cvUrl?: string;
    workPermitUrl?: string;
  };
}
