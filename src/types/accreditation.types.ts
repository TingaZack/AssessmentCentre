export interface AccreditationSpec {
  id: string;
  label: string;
  issuerName: string;
  logoUrl: string;
  saqaQualificationId?: string;
  defaultSignatoryName: string;
  defaultSignatoryTitle: string;
}

export const DEFAULT_ACCREDITATION_BODIES: AccreditationSpec[] = [
  {
    id: "qcto",
    label: "QCTO Qualification",
    issuerName: "Quality Council for Trades and Occupations",
    logoUrl: "/assets/logos/qcto_logo.png",
    saqaQualificationId: "",
    defaultSignatoryName: "Academic Director",
    defaultSignatoryTitle: "QCTO Principal Officer",
  },
  {
    id: "iitpsa_mlab",
    label: "IITPSA + mLab Dual Endorsed",
    issuerName: "IITPSA & mLab Southern Africa",
    logoUrl: "/assets/logos/iitpsa_mlab_combined.png",
    saqaQualificationId: "",
    defaultSignatoryName: "Zakhele Tinga",
    defaultSignatoryTitle: "Academic Manager",
  },
  {
    id: "mict_seta",
    label: "MICT SETA Accredited",
    issuerName: "Media, Information and Communication Technologies SETA",
    logoUrl: "/assets/logos/mict_seta.png",
    saqaQualificationId: "",
    defaultSignatoryName: "ETQA Manager",
    defaultSignatoryTitle: "SETA Assessor",
  },
];

/**
 * Converts dynamic accreditation array from Firestore into a keyed dictionary
 */
export const buildAccreditationRegistry = (
  bodies?: AccreditationSpec[],
): Record<string, AccreditationSpec> => {
  const list =
    bodies && bodies.length > 0 ? bodies : DEFAULT_ACCREDITATION_BODIES;
  return list.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<string, AccreditationSpec>,
  );
};
