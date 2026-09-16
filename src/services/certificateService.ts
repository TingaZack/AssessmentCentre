import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CertificatePayload } from "./useCertificateData";

export const issueCertificate = async (
  payload: CertificatePayload,
  templateUsed: "luxury" | "official" | "modern" = "official",
  groupId?: string,
) => {
  const certId = `cert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const certRecord = {
    id: certId,
    recipientName: payload.recipientName,
    recipientEmail: payload.recipientEmail,
    courseName: payload.courseName,
    issueDate: payload.issueDate,
    accreditationBodyKey: payload.accreditationKey,
    saqaQualificationId: payload.spec?.saqaQualificationId || "",
    issuerName: payload.spec?.issuerName || "",
    signatoryName: payload.signatoryName,
    signatoryTitle: payload.signatoryTitle,
    logoUrl: payload.logoUrl,
    templateUsed,
    groupId: groupId || "general",
    createdAt: serverTimestamp(),
  };

  // Write to unified issued_certificates collection
  await setDoc(doc(db, "issued_certificates", certId), certRecord);

  return certRecord;
};
