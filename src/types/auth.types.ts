// export type UserRole =
//   | "admin"
//   | "learner"
//   | "facilitator"
//   | "assessor"
//   | "moderator"
//   | "mentor";

// export interface UserProfile {
//   uid: string;
//   email: string;
//   fullName: string;
//   role: UserRole;
//   signatureUrl?: string; // If missing, the user is blocked
//   cohortId?: string; // Links learners/facilitators to a class
//   createdAt?: string;
//   authUid?: string;
//   profileCompleted?: boolean;
//   profilePhotoUrl: string;
// }

export type UserRole =
  | "admin"
  | "learner"
  | "facilitator"
  | "assessor"
  | "moderator"
  | "mentor";

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  signatureUrl?: string;
  profilePhotoUrl: string; // Ensure this is present in DB or default it
  cohortId?: string;
  createdAt?: string;
  authUid?: string;
  profileCompleted?: boolean;

  // 🚀 Add these Practitioner-specific fields:
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
