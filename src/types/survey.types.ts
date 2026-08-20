// src/types/survey.types.ts

export type QuestionType =
  | "rating"
  | "single_choice"
  | "nps"
  | "text"
  | "address";

export interface AddressAnswer {
  formattedAddress: string;
  suburb?: string;
  city: string;
  localMunicipality?: string;
  districtOrMetro?: string;
  province: string;
  postalCode: string;
  lat: number;
  lng: number;
}

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options?: string[];
  maxStars?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}

export interface SurveyTemplate {
  id: string;
  title: string;
  description?: string;
  targetType?: "assessment" | "cohort" | "general" | "exit";
  assessmentId?: string;
  cohortIds?: string[];
  isActive: boolean;
  allowMultipleResponses?: boolean;
  questions: SurveyQuestion[];
  createdAt: string;
  updatedAt?: string;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  assessmentId?: string;
  cohortId?: string;
  learnerId: string;
  authUid?: string;
  learnerName?: string;
  learnerEmail?: string;
  learnerPhone?: string;
  isVerifiedRespondent?: boolean;
  isExternalResponse?: boolean;
  answers: Record<string, any>;
  submittedAt: string;
}
