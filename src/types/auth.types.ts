export type UserRole =
  | "admin"
  | "learner"
  | "facilitator"
  | "assessor"
  | "moderator"
  | "mentor"
  | "assistant_facilitator"
  | "assistant_admin";

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;

  // UPDATED SYSTEM & PERMISSION FIELDS
  isSuperAdmin?: boolean;
  secondaryRoles?: UserRole[]; // Or string[] depending on how UserRole is defined
  canMarkAssessments?: boolean;
  canFacilitateCohorts?: boolean;
  assignedCohortIds?: string[]; // Ensures the scoping logic works perfectly

  signatureUrl?: string;
  profilePhotoUrl: string;
  cohortId?: string;
  createdAt?: string;
  authUid?: string;
  profileCompleted?: boolean;

  companyName?: string;
  employerId: string;

  // Practitioner-specific fields:
  assessorRegNumber?: string;
  assessorRegistrationNumber?: string; // Added to support legacy code references
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

// export type UserRole =
//   | "admin"
//   | "learner"
//   | "facilitator"
//   | "assessor"
//   | "moderator"
//   | "mentor"
//   | "assistant_facilitator"
//   | "assistant_admin";

// export interface UserProfile {
//   uid: string;
//   email: string;
//   fullName: string;
//   role: UserRole;
//   signatureUrl?: string;
//   profilePhotoUrl: string;
//   cohortId?: string;
//   createdAt?: string;
//   authUid?: string;
//   profileCompleted?: boolean;

//   companyName?: string;
//   employerId: string;

//   // these Practitioner-specific fields:
//   assessorRegNumber?: string;
//   bio?: string;
//   primarySeta?: string;
//   specializationScope?: string;
//   registrationExpiry?: string;
//   yearsExperience?: number;
//   highestQualification?: string;
//   nationalityType?: "South African" | "Foreign National";
//   idNumber?: string;
//   passportNumber?: string;
//   dateOfBirth?: string;
//   complianceDocs?: {
//     identificationUrl?: string;
//     assessorCertUrl?: string;
//     regLetterUrl?: string;
//     cvUrl?: string;
//     workPermitUrl?: string;
//   };
// }
