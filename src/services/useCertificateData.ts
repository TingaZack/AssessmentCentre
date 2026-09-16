import { useState, useEffect } from "react";
import { useStore } from "../store/useStore";
import {
  buildAccreditationRegistry,
  type AccreditationSpec,
} from "../types/accreditation.types";

export interface CertificatePayload {
  recipientName: string;
  recipientEmail: string;
  courseName: string;
  issueDate: string;
  accreditationKey: string;
  spec: AccreditationSpec;
  signatoryName: string;
  signatoryTitle: string;
  logoUrl: string;
}

export const useCertificateData = (learner?: any, container?: any) => {
  const { settings } = useStore();
  const registry = buildAccreditationRegistry(settings?.accreditationBodies);

  const accreditationKey =
    container?.accreditationBody || learner?.accreditationBody || "qcto";
  const spec = registry[accreditationKey] || registry["qcto"];

  const [payload, setPayload] = useState<CertificatePayload>({
    recipientName: learner?.fullName || "",
    recipientEmail: learner?.email || "",
    courseName: container?.title || learner?.qualification?.name || "",
    issueDate: new Date().toISOString().split("T")[0],
    accreditationKey,
    spec,
    signatoryName: spec?.defaultSignatoryName || "",
    signatoryTitle: spec?.defaultSignatoryTitle || "",
    logoUrl: spec?.logoUrl || settings?.logoUrl || "",
  });

  useEffect(() => {
    if (spec) {
      setPayload((prev) => ({
        ...prev,
        spec,
        signatoryName: prev.signatoryName || spec.defaultSignatoryName,
        signatoryTitle: prev.signatoryTitle || spec.defaultSignatoryTitle,
        logoUrl: spec.logoUrl || settings?.logoUrl || "",
      }));
    }
  }, [accreditationKey, settings]);

  return { payload, setPayload, registry };
};
