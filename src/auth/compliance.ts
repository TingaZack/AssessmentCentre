import type { UserProfile, UserRole } from "../types/auth.types";

const STAFF_SETUP_PATHS: Partial<Record<UserRole, string>> = {
  admin: "/setup-admin",
  facilitator: "/setup-facilitator",
  assessor: "/setup-assessor",
  moderator: "/setup-moderator",
  mentor: "/setup-mentor",
};

const hasUploadedDocument = (
  user: UserProfile,
  documentId: string,
): boolean =>
  (user.uploadedDocuments ?? []).some(
    (document) =>
      document.id === documentId &&
      typeof document.url === "string" &&
      document.url.trim() !== "",
  );

const isLearnerCompliant = (user: UserProfile): boolean => {
  if (user.role !== "learner") return true;

  const demographics = user.demographics;
  const hasDemographics =
    !!demographics?.equityCode &&
    !!demographics.provinceCode &&
    (!!demographics.statssaAreaCode || !!demographics.statsaaAreaCode) &&
    !!demographics.learnerTitle;

  return (
    user.profileCompleted === true &&
    hasDemographics &&
    hasUploadedDocument(user, "id") &&
    hasUploadedDocument(user, "qual")
  );
};

const isStaffCompliant = (user: UserProfile): boolean => {
  if (user.role === "learner") return true;
  if (user.profileCompleted !== true) return false;

  const hasStaffProvince = !!user.province;
  const hasPermit = user.nationalityType === "Foreign National"
    ? hasUploadedDocument(user, "permit")
    : true;

  switch (user.role) {
    case "facilitator":
      return hasStaffProvince && hasUploadedDocument(user, "id") && hasUploadedDocument(user, "cv") && hasPermit;
    case "assessor":
      return hasStaffProvince && hasUploadedDocument(user, "id") && hasUploadedDocument(user, "assessor_cert") && hasUploadedDocument(user, "reg_letter") && hasPermit;
    case "moderator":
      return hasStaffProvince && hasUploadedDocument(user, "id") && hasUploadedDocument(user, "moderator_cert") && hasUploadedDocument(user, "reg_letter") && hasPermit;
    case "admin":
      return user.isSuperAdmin === true
        ? true
        : hasStaffProvince && hasUploadedDocument(user, "id") && hasUploadedDocument(user, "appointment") && hasPermit;
    case "mentor":
      return hasStaffProvince;
    default:
      return true;
  }
};

export const getRequiredSetupPath = (user: UserProfile): string | null => {
  if (user.role === "learner") {
    return isLearnerCompliant(user) ? null : "/setup-profile";
  }

  return isStaffCompliant(user) ? null : STAFF_SETUP_PATHS[user.role] ?? null;
};

export const getHomePathForRole = (role: UserRole): string => {
  switch (role) {
    case "admin":
      return "/admin";
    case "facilitator":
      return "/facilitator";
    case "assessor":
      return "/marking";
    case "moderator":
      return "/moderation";
    case "mentor":
      return "/mentor";
    case "learner":
      return "/portal";
    default:
      return "/login";
  }
};
