// functions/src/modules/pdfEngine.ts

import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFunctions as getAdminFunctions } from "firebase-admin/functions";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import axios from "axios";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import {
  sendMailgunEmail,
  buildMlabEmailHtml,
  buildMlabEmailPlainText,
} from "../utils/emailBuilder";

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

// Secrets
const mailgunSecret = defineSecret("MAILGUN_API_KEY");

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5MB ceiling for snapshots

// -----------------------------------------------------------------------------
// TYPES & HELPER UTILITIES
// -----------------------------------------------------------------------------

export interface UploadedDoc {
  id: string;
  name: string;
  url: string;
}

export interface EvidenceFile {
  index: number;
  url: string;
  label: string;
}

export interface Submission {
  id: string;
  assessmentId: string;
  title?: string;
  type?: string;
  moduleType?: string;
  competency?: string;
  submittedAt?: string;
  moduleNumber?: string;
  marks?: number;
  totalMarks?: number;
  attemptNumber?: number;
  answers?: Record<string, any>;
  facilitatorId?: string;
  assessorId?: string;
  moderatorId?: string;
  facilitatorName?: string;
  facilitatorOverallFeedback?: string;
  facilitatorReviewedAt?: string;
  gradedAt?: string;
  assignedAt?: string;
  learnerDeclaration?: {
    learnerName?: string;
    learnerIdNumber?: string;
    learnerAuthUid?: string;
    timestamp?: string;
    signatureUrl?: string;
  };
  grading?: {
    facilitatorName?: string;
    facilitatorOverallFeedback?: string;
    facilitatorReviewedAt?: string;
    facilitatorId?: string;
    facilitatorSignatureUrl?: string;
    assessorName?: string;
    assessorOverallFeedback?: string;
    assessorRegNumber?: string;
    assessorId?: string;
    assessorSignatureUrl?: string;
    gradedAt?: string;
    gradedBy?: string;
    facilitatorBreakdown?: Record<string, any>;
    assessorBreakdown?: Record<string, any>;
  };
  moderation?: {
    moderatorId?: string;
    moderatedBy?: string;
    moderatorName?: string;
    moderatorRegNumber?: string;
    moderatedAt?: string;
    moderatorSignatureUrl?: string;
    feedback?: string;
    breakdown?: Record<string, any>;
  };
  appeal?: {
    date?: string;
    reason?: string;
    status?: string;
    outcome?: string;
    reviewedBy?: string;
    reviewedByName?: string;
    reviewedAt?: string;
    resolvedBy?: string;
    resolvedByName?: string;
    resolvedBySignatureUrl?: string;
    resolvedAt?: string;
    resolutionNotes?: string;
  };
  latestCoachingLog?: {
    date?: string;
    notes?: string;
    facilitatorId?: string;
    facilitatorName?: string;
    facilitatorSignatureUrl?: string;
    acknowledged?: boolean;
    acknowledgedAt?: string;
    learnerSignatureUrl?: string;
  };
  [key: string]: any;
}

const fetchFileBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
  } catch (error) {
    logger.error("Buffer fetch error:", error);
    return null;
  }
};

const cleanRichText = (html?: string) => {
  if (!html) return "";
  return html.replace(/&nbsp;/g, " ");
};

// -----------------------------------------------------------------------------
// POE STYLES & LAYOUT BLUEPRINTS
// -----------------------------------------------------------------------------

const POE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap');
  @page { size: A4; margin: 15mm 16mm 22mm; }
  @page :first { margin-top: 0; }
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: 'Trebuchet MS', 'Lucida Grande', Arial, sans-serif; font-size: 11px; color: #1a2e35; line-height: 1.5; margin: 0; padding: 0; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pb { page-break-after: always; }
  .pbi { page-break-inside: avoid; }
  .cover { height: 100vh; display: flex; flex-direction: column; background: #073f4e; overflow: hidden; position: relative; }
  .cover__pattern { position: absolute; inset: 0; background-image: repeating-linear-gradient(-45deg, transparent, transparent 32px, rgba(148,199,61,0.05) 32px, rgba(148,199,61,0.05) 33px), repeating-linear-gradient(45deg, transparent, transparent 32px, rgba(255,255,255,0.02) 32px, rgba(255,255,255,0.02) 33px); pointer-events: none; }
  .cover__accent { display: flex; height: 8px; flex-shrink: 0; }
  .cover__accent-blue  { flex: 1; background: #052e3a; }
  .cover__accent-green { width: 100px; background: #94c73d; }
  .cover__header { display: flex; align-items: center; justify-content: space-between; padding: 28px 40px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; position: relative; }
  .cover__logo { height: 52px; object-fit: contain; }
  .cover__org { text-align: right; }
  .cover__org-name { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ffffff; display: block; }
  .cover__org-tag { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); display: block; margin-top: 3px; }
  .cover__body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; position: relative; }
  .cover__doc-type { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #94c73d; margin: 0 0 16px; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .cover__doc-type::before, .cover__doc-type::after { content: ''; display: block; height: 1px; width: 40px; background: rgba(148,199,61,0.4); }
  .cover__title { font-family: 'Oswald', sans-serif; font-size: 42px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #ffffff; margin: 0 0 8px; line-height: 1; }
  .cover__subtitle { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin: 0 0 48px; }
  .cover__id-card { width: 100%; max-width: 560px; border: 1px solid rgba(255,255,255,0.12); border-top: 3px solid #94c73d; background: rgba(255,255,255,0.05); padding: 0; text-align: left; }
  .cover__id-row { display: flex; align-items: stretch; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .cover__id-row:last-child { border-bottom: none; }
  .cover__id-label { width: 160px; flex-shrink: 0; padding: 10px 14px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.35); background: rgba(0,0,0,0.1); border-right: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; }
  .cover__id-value { padding: 10px 16px; font-size: 12px; font-weight: 600; color: #ffffff; display: flex; align-items: center; flex: 1; }
  .cover__footer { padding: 16px 40px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; position: relative; }
  .cover__footer-ref { font-family: 'Oswald', sans-serif; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.25); }
  .cover__footer-date { font-size: 9px; color: rgba(255,255,255,0.25); }
  .cover__accent-bottom { display: flex; height: 8px; flex-shrink: 0; }
  .cover__accent-bottom-green { width: 100px; background: #94c73d; }
  .cover__accent-bottom-blue  { flex: 1; background: #052e3a; }
  .sec-header { display: flex; align-items: stretch; margin: 0 0 20px; border-top: 4px solid #073f4e; background: #073f4e; }
  .sec-header__num { width: 48px; flex-shrink: 0; background: #94c73d; display: flex; align-items: center; justify-content: center; font-family: 'Oswald', sans-serif; font-size: 18px; font-weight: 700; color: #073f4e; }
  .sec-header__text { padding: 10px 16px; flex: 1; }
  .sec-header__title { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; margin: 0; line-height: 1.1; }
  .sec-header__sub { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin: 3px 0 0; }
  .sub-heading { font-family: 'Oswald', sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #073f4e; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #073f4e; display: flex; align-items: center; gap: 6px; }
  .sub-heading::after { content: ''; display: block; height: 2px; flex: 1; background: #94c73d; margin-left: 6px; }
  .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #dde4e8; border: 1px solid #dde4e8; margin-bottom: 18px; }
  .data-cell { background: #ffffff; padding: 9px 12px; }
  .data-cell--span2 { grid-column: span 2; }
  .data-cell__label { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #9b9b9b; display: block; margin-bottom: 3px; }
  .data-cell__value { font-size: 11.5px; font-weight: 600; color: #073f4e; }
  .poe-table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 10.5px; }
  .poe-table thead tr { background: #073f4e; }
  .poe-table th { padding: 8px 10px; text-align: left; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.85); border-right: 1px solid rgba(255,255,255,0.08); }
  .poe-table td { padding: 7px 10px; border-bottom: 1px solid #e8eef1; border-right: 1px solid #e8eef1; color: #1a2e35; vertical-align: top; }
  .poe-table tbody tr:nth-child(even) td { background: #f8fafb; }
  .poe-table--accented td:first-child { border-left: 3px solid #94c73d; }
  .badge { display: inline-block; padding: 2px 8px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .badge--type { display: inline-block; padding: 2px 5px; background: #e2e8f0; color: #475569; border-radius: 3px; font-size: 7px; text-transform: uppercase; margin-right: 6px; vertical-align: middle; }
  .badge--c   { background: rgba(148,199,61,0.15); color: #3d6b0f; border: 1px solid rgba(148,199,61,0.4); }
  .badge--nyc { background: rgba(239,68,68,0.1);   color: #b91c1c; border: 1px solid rgba(239,68,68,0.3); }
  .badge--p   { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }
  .badge--attempt { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .badge--attempt1 { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }
  .mod-header-row td { background-color: #f1f5f9 !important; border-top: 2px solid #cbd5e1 !important; border-bottom: 1px solid #cbd5e1 !important; }
  .mod-header-text { font-family: 'Oswald', sans-serif; font-size: 10px; color: #073f4e; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700; }
  .module-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #e4edf0; border-left: 5px solid #073f4e; margin-bottom: 12px; }
  .module-header__title { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #073f4e; margin: 0; }
  .eval-box { border: 1px solid #dde4e8; border-top: 3px solid #073f4e; margin-bottom: 16px; page-break-inside: avoid; }
  .eval-box__row { display: flex; align-items: flex-start; border-bottom: 1px solid #eef0f2; min-height: 32px; }
  .eval-box__label { width: 150px; flex-shrink: 0; padding: 8px 12px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9b9b9b; background: #f8fafb; border-right: 1px solid #eef0f2; }
  .eval-box__value { padding: 8px 14px; font-size: 11px; color: #1a2e35; flex: 1; }
  .eval-box__divider { height: 1px; background: #dde4e8; margin: 0; }
  .ink-fac { color: #1d4ed8 !important; }
  .ink-ass { color: #b91c1c !important; }
  .ink-mod { color: #15803d !important; }
  .q-block { margin-bottom: 16px; border-bottom: 1px solid #eef0f2; padding-bottom: 14px; page-break-inside: avoid; }
  .q-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #073f4e; color: #ffffff; font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; flex-shrink: 0; margin-right: 8px; }
  .q-text { font-family: 'Oswald', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: #073f4e; margin: 0 0 8px; display: flex; }
  .a-text { background: #f8fafb; border: 1px solid #e4edf0; border-left: 4px solid #9b9b9b; padding: 9px 12px; font-size: 11px; white-space: normal; overflow-wrap: break-word; color: #1a2e35; }
  .a-link { color: #0a5266; text-decoration: underline; font-weight: 600; }
  .declaration { background: #f4f7f9; border: 1px solid #dde4e8; border-top: 3px solid #073f4e; padding: 16px; font-size: 11px; margin-bottom: 16px; }
  .sig-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #dde4e8; border: 1px solid #dde4e8; margin-top: 20px; page-break-inside: avoid; }
  .sig-cell { background: #ffffff; padding: 12px 10px; text-align: center; border-top: 3px solid #dde4e8; }
  .sig-cell--learner  { border-top-color: #073f4e; }
  .sig-cell--fac      { border-top-color: #1d4ed8; }
  .sig-cell--assessor { border-top-color: #b91c1c; }
  .sig-cell--mod      { border-top-color: #15803d; }
  .sig-cell__role { font-family: 'Oswald', sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #9b9b9b; margin-bottom: 8px; }
  .sig-cell__img { max-height: 38px; max-width: 100%; object-fit: contain; mix-blend-mode: multiply; display: block; margin: 0 auto 6px; }
  .sig-cell__placeholder { height: 38px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #c0c8cc; font-style: italic; margin-bottom: 6px; border: 1px dashed #dde4e8; }
  .sig-cell__line { height: 1px; background: #dde4e8; margin: 0 0 5px; }
  .sig-cell__name { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 2px; }
  .sig-cell__detail { font-size: 8px; }
  .letter-body { border: 1px solid #dde4e8; padding: 24px 28px; font-size: 11.5px; background: #ffffff; margin-bottom: 20px; }
`;

const sigCell = (
  role: string,
  cls: string,
  sigUrl: string | null,
  name: string,
  detail: string,
  date: string,
) => {
  const ink =
    cls === "fac"
      ? "ink-fac"
      : cls === "assessor"
        ? "ink-ass"
        : cls === "mod"
          ? "ink-mod"
          : "";
  return `
  <div class="sig-cell sig-cell--${cls}">
    <div class="sig-cell__role">${role}</div>
    ${sigUrl ? `<img src="${sigUrl}" class="sig-cell__img" />` : `<div class="sig-cell__placeholder">No signature</div>`}
    <div class="sig-cell__line"></div>
    <div class="sig-cell__name ${ink}">${name}</div>
    ${detail ? `<div class="sig-cell__detail ${ink}">${detail}</div>` : ""}
    <div class="sig-cell__detail ${ink}">${date}</div>
  </div>`;
};

const dividerPage = (num: string, title: string, desc: string) => `
  <div class="divider">
    <div class="divider__pattern"></div>
    <div class="divider__accent">
      <div class="divider__accent-blue"></div>
      <div class="divider__accent-green"></div>
    </div>
    <div class="divider__body">
      <div class="divider__num">${num}</div>
      <div class="divider__section-label">Section ${num}</div>
      <h1 class="divider__title">${title}</h1>
      <p class="divider__desc">${desc}</p>
    </div>
    <div class="divider__accent-bottom">
      <div class="divider__accent-bottom-green"></div>
      <div class="divider__accent-bottom-blue"></div>
    </div>
  </div>`;

const sectionHeader = (num: string, title: string, sub?: string) => `
  <div class="sec-header">
    <div class="sec-header__num">${num}</div>
    <div class="sec-header__text">
      <div class="sec-header__title">${title}</div>
      ${sub ? `<div class="sec-header__sub">${sub}</div>` : ""}
    </div>
  </div>`;

const dc = (label: string, value: string, cls = "") =>
  `<div class="data-cell ${cls}"><span class="data-cell__label">${label}</span><span class="data-cell__value">${value || "N/A"}</span></div>`;

const outcomeBadge = (comp?: string) => {
  if (comp === "C") return `<span class="badge badge--c">Competent</span>`;
  if (comp === "NYC")
    return `<span class="badge badge--nyc">Not Yet Competent</span>`;
  return `<span class="badge badge--p">Pending</span>`;
};

// ============================================================================
// 1. GENERATE MASTER POE PDF (QCTO COMPLIANCE ENGINE)
// ============================================================================

export const generateMasterPoE = onDocumentCreated(
  {
    document: "poe_export_requests/{requestId}",
    timeoutSeconds: 540,
    memory: "2GiB",
    region: "us-central1",
    secrets: [mailgunSecret],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const requestData = snap.data();
    const requestId = event.params.requestId;
    const learnerId = requestData.learnerId;
    const requestedByUid = requestData.requestedBy;
    let requesterEmail: string | null = null;

    const updateProgress = async (percent: number, message: string) =>
      snap.ref.update({ progress: percent, progressMessage: message });

    const fmt = (d?: string | Date | null) => {
      if (!d) return "N/A";
      try {
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? "N/A" : dt.toLocaleDateString("en-ZA");
      } catch {
        return "N/A";
      }
    };

    try {
      await updateProgress(5, "Initializing compliance engine…");

      if (requestedByUid) {
        try {
          requesterEmail =
            (await admin.auth().getUser(requestedByUid)).email || null;
        } catch (e) {
          logger.error("Auth fetch failed for requestedByUid", e);
        }
      }

      const db = admin.firestore();
      const learnerSnap = await db.collection("learners").doc(learnerId).get();
      const learner = learnerSnap.data() || {};
      const userDocSnap = await db
        .collection("users")
        .doc(learner.authUid || learnerId)
        .get();
      const learnerUserDoc = userDocSnap.data() || {};

      let enrollment: any = {};
      if (learner.enrollmentId) {
        const enrolSnap = await db
          .collection("enrollments")
          .doc(learner.enrollmentId)
          .get();
        if (enrolSnap.exists) enrollment = enrolSnap.data() || {};
      }

      await updateProgress(15, "Fetching all evidence modules…");
      const subsSnap = await db
        .collection("learner_submissions")
        .where("learnerId", "==", learnerId)
        .get();

      const submissions: Submission[] = subsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          facilitatorId:
            data.grading?.facilitatorId || data.facilitatorId || "",
          assessorId:
            data.grading?.assessorId ||
            data.grading?.gradedBy ||
            data.gradedBy ||
            data.assessorId ||
            "",
          moderatorId:
            data.moderation?.moderatorId ||
            data.moderation?.moderatedBy ||
            data.moderatorId ||
            "",
          attemptNumber: data.attemptNumber || 1,
          ...data,
        } as Submission;
      });

      submissions.sort(
        (a, b) =>
          new Date(a.assignedAt || 0).getTime() -
          new Date(b.assignedAt || 0).getTime(),
      );

      const kmSubs = submissions.filter(
        (s) => s.moduleNumber?.includes("-KM-") || s.moduleType === "knowledge",
      );
      const pmSubs = submissions.filter(
        (s) => s.moduleNumber?.includes("-PM-") || s.moduleType === "practical",
      );
      const wmSubs = submissions.filter(
        (s) => s.moduleNumber?.includes("-WM-") || s.moduleType === "workplace",
      );

      const primaryAssessor =
        submissions.find((s) => s.grading?.assessorName)?.grading
          ?.assessorName || "Pending Assessor";
      const primaryFacilitatorId = submissions.find(
        (s) => s.facilitatorId,
      )?.facilitatorId;
      const appealedSubs = submissions.filter((s) => s.appeal);
      const remediatedSubs = submissions.filter(
        (s) => (s.attemptNumber || 1) > 1,
      );

      await updateProgress(25, "Retrieving digital signatures…");
      const signaturesMap: Record<string, string> = {};
      const userIdsToFetch = new Set<string>();
      if (learner.authUid) userIdsToFetch.add(learner.authUid);
      submissions.forEach((sub) => {
        if (sub.facilitatorId) userIdsToFetch.add(sub.facilitatorId);
        if (sub.assessorId) userIdsToFetch.add(sub.assessorId);
        if (sub.moderatorId) userIdsToFetch.add(sub.moderatorId);
        if (sub.appeal?.reviewedBy) userIdsToFetch.add(sub.appeal.reviewedBy);
        if (sub.appeal?.resolvedBy) userIdsToFetch.add(sub.appeal.resolvedBy);
        if (sub.latestCoachingLog?.facilitatorId)
          userIdsToFetch.add(sub.latestCoachingLog.facilitatorId);
      });

      if (userIdsToFetch.size > 0) {
        const userSnaps = await Promise.all(
          Array.from(userIdsToFetch).map((uid) =>
            db.collection("users").doc(uid).get(),
          ),
        );
        userSnaps.forEach((uSnap) => {
          if (uSnap.exists) {
            const uData = uSnap.data();
            if (uData?.signatureUrl)
              signaturesMap[uSnap.id] = uData.signatureUrl;
          }
        });
      }

      const primaryGradedSub = submissions.find((s) => s.assessorId);

      let dayOneLearnerSigUrl = null;
      if (
        learnerUserDoc?.signatureHistory &&
        learnerUserDoc.signatureHistory.length > 0
      ) {
        const sortedHistory = [...learnerUserDoc.signatureHistory].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        dayOneLearnerSigUrl = sortedHistory[0].url;
      } else {
        dayOneLearnerSigUrl = learner.authUid
          ? signaturesMap[learner.authUid]
          : null;
      }

      const primaryFacSigUrl =
        submissions[0]?.grading?.facilitatorSignatureUrl ||
        (primaryFacilitatorId ? signaturesMap[primaryFacilitatorId] : null);

      const globalAssessorSigUrl =
        primaryGradedSub?.grading?.assessorSignatureUrl ||
        (primaryGradedSub?.assessorId
          ? signaturesMap[primaryGradedSub.assessorId]
          : null);

      await updateProgress(30, "Building QCTO compliance document…");

      const companyLogoUrl =
        "https://firebasestorage.googleapis.com/v0/b/testpro-8f08c.appspot.com/o/Mlab-Grey-variation-1.png?alt=media&token=e85e0473-97cc-431d-8c08-7a3445806983";
      const offlineEvidenceFiles: EvidenceFile[] = [];

      const progressRows = (subs: Submission[]) => {
        if (!subs.length)
          return `<tr><td colspan="4" class="empty-state">No modules mapped for this component.</td></tr>`;

        const groups: Record<string, Submission[]> = {};
        subs.forEach((s) => {
          const mod = s.moduleNumber || "Unlinked Assessments";
          if (!groups[mod]) groups[mod] = [];
          groups[mod].push(s);
        });

        let rowHtml = "";
        Object.keys(groups)
          .sort()
          .forEach((mod) => {
            rowHtml += `<tr class="mod-header-row">
                <td colspan="4"><span class="mod-header-text">MODULE: ${mod}</span></td>
            </tr>`;

            groups[mod]
              .sort(
                (a, b) =>
                  new Date(a.assignedAt || 0).getTime() -
                  new Date(b.assignedAt || 0).getTime(),
              )
              .forEach((s) => {
                const att = s.attemptNumber || 1;
                const attBadge =
                  att > 1
                    ? `<span class="badge badge--attempt">Attempt ${att}</span>`
                    : `<span class="badge badge--attempt1">1st</span>`;
                const compBadge = outcomeBadge(s.competency);
                const typeLabel = s.type
                  ? `<span class="badge--type">${s.type}</span>`
                  : "";

                rowHtml += `<tr>
                  <td></td>
                  <td style="padding-top:6px; padding-bottom:6px;">${typeLabel}<span style="vertical-align:middle;">${s.title || "Untitled"}</span></td>
                  <td class="text-center" style="vertical-align:middle;">${attBadge}</td>
                  <td class="text-center" style="vertical-align:middle;">${compBadge}</td>
                </tr>`;
              });
          });
        return rowHtml;
      };

      let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Master PoE — ${learner.fullName || "Learner"}</title>
  <style>${POE_STYLES}</style>
</head>
<body>

<div class="cover">
  <div class="cover__pattern"></div>
  <div class="cover__accent"><div class="cover__accent-blue"></div><div class="cover__accent-green"></div></div>
  <div class="cover__header">
    <img src="${companyLogoUrl}" alt="mLab" class="cover__logo" />
    <div class="cover__org"><span class="cover__org-name">Mobile Applications Laboratory NPC</span><span class="cover__org-tag">QCTO Accredited Training Provider</span></div>
  </div>
  <div class="cover__body">
    <p class="cover__doc-type">QCTO Qualification Compliance Record</p>
    <h1 class="cover__title">Master Portfolio<br>of Evidence</h1>
    <p class="cover__subtitle">Official Assessment Archive</p>
    <div class="cover__id-card">
      <div class="cover__id-row"><div class="cover__id-label">Full Name</div><div class="cover__id-value">${learner.fullName || "N/A"}</div></div>
      <div class="cover__id-row"><div class="cover__id-label">Identity Number</div><div class="cover__id-value">${learner.idNumber || "N/A"}</div></div>
      <div class="cover__id-row"><div class="cover__id-label">Email Address</div><div class="cover__id-value">${learner.email || "N/A"}</div></div>
      <div class="cover__id-row"><div class="cover__id-label">Programme</div><div class="cover__id-value">${learner.qualification?.name || enrollment.qualificationName || "N/A"}</div></div>
      <div class="cover__id-row"><div class="cover__id-label">Date Generated</div><div class="cover__id-value">${fmt(new Date())}</div></div>
    </div>
  </div>
  <div class="cover__footer">
    <span class="cover__footer-ref">Ref: ${requestId}</span>
    <span class="cover__footer-date">Generated ${fmt(new Date())}</span>
  </div>
  <div class="cover__accent-bottom"><div class="cover__accent-bottom-green"></div><div class="cover__accent-bottom-blue"></div></div>
</div>
<div class="pb"></div>

${sectionHeader("✓", "Assessor PoE Checklist", "Document Completeness Verification")}
<table class="poe-table poe-table--checklist">
  <thead><tr><th width="30">#</th><th>Document / Section</th><th width="160">Inclusion Status</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>Progress Report (all module components)</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>2</td><td>Competence Record and Final Assessment Report</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>3</td><td>Learner Registration & POPIA Consent Form</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>4</td><td>Letter of Commitment from Learner</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>5</td><td>Programme Induction Record</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>6</td><td>Appeals / Complaint Forms</td><td>${appealedSubs.length > 0 ? `<span class="badge badge--nyc">${appealedSubs.length} Appeal(s) — See Section 6</span>` : `<span class="badge badge--p">None Lodged</span>`}</td></tr>
    <tr><td>7</td><td>Actual Learning Plan and Evidence Control Sheet</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>8</td><td>Learner Coaching Record (Remediation)</td><td>${remediatedSubs.length > 0 ? `<span class="badge badge--nyc">${remediatedSubs.length} Session(s) — See Section 8</span>` : `<span class="badge badge--p">N/A — All First Attempt</span>`}</td></tr>
    <tr><td>9</td><td>Certified Identity Document and Supporting Annexures</td><td><span class="badge badge--c">See Annexures</span></td></tr>
  </tbody>
</table>
<div class="pb"></div>

${dividerPage("1", "Progress Report", "Summary of all assessed module components including knowledge, practical skills, and workplace experience.")}
<div class="pb"></div>
${sectionHeader("1", "Progress Report", "Comprehensive Module Outcome Summary")}

<div class="data-grid">
  ${dc("Learner Name", learner.fullName)}
  ${dc("Identity Number", learner.idNumber)}
  ${dc("Programme Title", learner.qualification?.name || enrollment.qualificationName || "N/A")}
  ${dc("Primary Assessor", primaryAssessor, "ink-ass")}
  ${dc("Training Start Date", fmt(enrollment.trainingStartDate || learner.trainingStartDate))}
  ${dc("Training End Date", fmt(enrollment.trainingEndDate || learner.trainingEndDate))}
  <div class="data-cell data-cell--span2">
    <span class="data-cell__label">Training Site / Workplace</span>
    <span class="data-cell__value">${enrollment.employerName || "mLab Default Training Campus"}</span>
  </div>
</div>

<div class="sub-heading">Knowledge Modules</div>
<table class="poe-table poe-table--accented">
  <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
  <tbody>${progressRows(kmSubs)}</tbody>
</table>

<div class="sub-heading">Practical Skills Modules</div>
<table class="poe-table poe-table--accented">
  <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
  <tbody>${progressRows(pmSubs)}</tbody>
</table>

<div class="sub-heading">Work Experience Modules</div>
<table class="poe-table poe-table--accented">
  <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
  <tbody>${progressRows(wmSubs)}</tbody>
</table>

<div class="sig-bar">
  <div>
    <div class="sig-bar__label">Assessor Sign-Off</div>
    <div style="font-size:9px; color:#9b9b9b; margin-top:2px;">I declare this progress report accurate and complete.</div>
  </div>
  ${globalAssessorSigUrl ? `<img src="${globalAssessorSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(new Date())}</div>
</div>
<div class="pb"></div>`;

      html += `${dividerPage("2", "Competence Record & Final Assessment Report", "Official system-generated transcripts, grading evidence, and signed evaluations for every module assessed.")}<div class="pb"></div>`;

      let moduleIndex = 0;
      for (const sub of submissions) {
        moduleIndex++;
        await updateProgress(
          30 + Math.floor((moduleIndex / submissions.length) * 35),
          `Compiling transcript: ${sub.title || "Module"}…`,
        );

        const assessmentSnap = await db
          .collection("assessments")
          .doc(sub.assessmentId)
          .get();
        const assessmentData = assessmentSnap.data() || {};
        const blocks = assessmentData.blocks || [];
        const grading = sub.grading || {};
        const moderation = sub.moderation || {};
        const answers = sub.answers || {};

        const att = sub.attemptNumber || 1;
        const isReassess = att > 1;
        const facFeedback =
          sub.facilitatorOverallFeedback ||
          grading.facilitatorOverallFeedback ||
          "<em>No facilitator comments recorded.</em>";
        const assFeedback =
          grading.assessorOverallFeedback ||
          "<em>No assessor feedback recorded.</em>";
        const modFeedback =
          moderation.feedback || "<em>No moderation comments recorded.</em>";

        const learnerSigUrl =
          sub.learnerDeclaration?.signatureUrl ||
          (learner.authUid ? signaturesMap[learner.authUid] : null);
        const facSigUrl =
          sub.grading?.facilitatorSignatureUrl ||
          (sub.facilitatorId ? signaturesMap[sub.facilitatorId] : null);
        const assSigUrl =
          sub.grading?.assessorSignatureUrl ||
          (sub.assessorId ? signaturesMap[sub.assessorId] : null);
        const modSigUrl =
          sub.moderation?.moderatorSignatureUrl ||
          (sub.moderatorId ? signaturesMap[sub.moderatorId] : null);

        const facName =
          sub.facilitatorName || grading.facilitatorName || "Pending";
        const assessorName = grading.assessorName || "Pending";
        const assessorReg = grading.assessorRegNumber
          ? `Reg: ${grading.assessorRegNumber}`
          : "";
        const modName = moderation.moderatorName || "Pending";
        const modReg = moderation.moderatorRegNumber
          ? `Reg: ${moderation.moderatorRegNumber}`
          : "";

        const modInfo = assessmentData.moduleInfo || assessmentData || {};
        const nqfLevel = modInfo.nqfLevel ? `Level ${modInfo.nqfLevel}` : "N/A";
        const notionalHours = modInfo.notionalHours || "N/A";
        const credits = modInfo.credits ? `Cr ${modInfo.credits}` : "N/A";

        const learnerDate = fmt(
          sub.submittedAt || sub.learnerDeclaration?.timestamp,
        );
        const facDate = fmt(
          sub.facilitatorReviewedAt || grading.facilitatorReviewedAt,
        );
        const assDate = fmt(sub.gradedAt || grading.gradedAt);
        const modDate = fmt(moderation.moderatedAt);

        html += `
<div class="module-header pbi">
  <div>
    <h2 class="module-header__title">${sub.title || "Untitled Module"}</h2>
    <div style="font-size:9px; color:#64748b; text-transform:uppercase; margin-top:3px; letter-spacing:0.05em; font-family:'Oswald', sans-serif;">
      ${sub.type || "Assessment Component"}
    </div>
  </div>
  <div class="module-header__badges">
    ${outcomeBadge(sub.competency)}
    ${isReassess ? `<span class="badge badge--attempt">Attempt ${att}</span>` : `<span class="badge badge--attempt1">Attempt 1</span>`}
  </div>
</div>

<table class="poe-table" style="margin-top:-12px; margin-bottom:16px;">
  <thead>
    <tr><th>Module #</th><th>NQF Level</th><th>Notional hours</th><th>Credit(s)</th></tr>
  </thead>
  <tbody>
    <tr>
      <td style="font-weight:bold; color:#073f4e;">${sub.moduleNumber || modInfo.moduleNumber || "N/A"}</td>
      <td>${nqfLevel}</td>
      <td>${notionalHours}</td>
      <td>${credits}</td>
    </tr>
  </tbody>
</table>

${
  assessmentData.isOpenBook && assessmentData.referenceManualUrl
    ? `<div class="openbook-notice pbi"><span class="openbook-notice__icon">Open Book</span><div>Learner was provided reference manual: <a href="${assessmentData.referenceManualUrl}" class="a-link">${assessmentData.referenceManualUrl}</a></div></div>`
    : ""
}

<div class="eval-box pbi">
  <div class="eval-box__row"><div class="eval-box__label">Final Outcome</div><div class="eval-box__value">${outcomeBadge(sub.competency)}</div></div>
  <div class="eval-box__row"><div class="eval-box__label">Assessment Score</div><div class="eval-box__value"><strong>${sub.marks !== undefined ? sub.marks : "–"} / ${sub.totalMarks || "–"}</strong></div></div>
  <div class="eval-box__row"><div class="eval-box__label">Submission Attempt</div><div class="eval-box__value">${att}${isReassess ? ' <span class="badge badge--attempt" style="margin-left:8px;">Reassessment</span>' : ""}</div></div>
  <div class="eval-box__divider"></div>
  <div class="eval-box__row"><div class="eval-box__label">Facilitator Note</div><div class="eval-box__value ink-fac">${cleanRichText(facFeedback)}</div></div>
  <div class="eval-box__row"><div class="eval-box__label">Assessor Feedback</div><div class="eval-box__value ink-ass">${cleanRichText(assFeedback)}</div></div>
  <div class="eval-box__row"><div class="eval-box__label">Moderator Review</div><div class="eval-box__value ink-mod">${cleanRichText(modFeedback)}</div></div>
</div>`;

        if (blocks.length > 0) {
          let qNum = 1;
          blocks.forEach((block: any) => {
            if (block.type === "section") {
              html += `<div class="sub-heading">${block.title}</div>`;
              return;
            }
            if (block.type === "info") return;

            const ans =
              answers[block.id] !== undefined
                ? answers[block.id]
                : sub[block.id];
            let formattedAnswer = "";

            if (ans !== undefined && ans !== null) {
              if (typeof ans === "string" || typeof ans === "number") {
                formattedAnswer = cleanRichText(String(ans));
              } else if (typeof ans === "object") {
                if (ans.text && ans.text !== "<p></p>")
                  formattedAnswer += `<div>${cleanRichText(ans.text)}</div>`;
                if (ans.url)
                  formattedAnswer += `<div><a class="a-link" href="${ans.url}">External Link</a></div>`;
              }
            }
            if (!formattedAnswer)
              formattedAnswer =
                '<em class="text-muted">No evidence provided for this item.</em>';

            html += `
<div class="q-block">
  <div class="q-text"><span class="q-num">${qNum++}</span>${cleanRichText(block.question || block.title || "Checkpoint")}</div>
  <div class="a-text">${formattedAnswer}</div>
</div>`;
          });
        }

        html += `
<div class="sig-row">
  ${sigCell("Learner Declaration", "learner", learnerSigUrl, learner.fullName || "Unknown", "", learnerDate)}
  ${sigCell("Facilitator Review", "fac", facSigUrl, facName, "", facDate)}
  ${sigCell("Assessor Endorsement", "assessor", assSigUrl, assessorName, assessorReg, assDate)}
  ${sigCell("Moderator Verification", "mod", modSigUrl, modName, modReg, modDate)}
</div>
<div class="pb"></div>`;
      }

      // =========================================================================================
      // SECTIONS 3, 4, 5 (POPIA, COMMITMENT, INDUCTION)
      // =========================================================================================
      const d = learnerUserDoc.demographics || learner.demographics || {};

      html += `
${dividerPage("3", "Learner Registration & POPIA Consent Form", "Official enrolment, demographic data, and data processing consent.")}
<div class="pb"></div>
${sectionHeader("3", "Learner Registration Form", "Enrolment and Demographic Record")}
<div class="data-grid">
  ${dc("Full Name", learner.fullName)}
  ${dc("Identity Number", learner.idNumber)}
  ${dc("Email Address", learner.email)}
  ${dc("Contact Number", learner.phone || d.phone)}
  ${dc("Equity / Race", d.equityCode)}
  ${dc("Gender", d.gender)}
  ${dc("Home Language", d.homeLanguage)}
  ${dc("Province", d.provinceCode)}
</div>

<h3 class="sub-heading" style="margin-top: 25px;">POPIA Consent Declaration</h3>
<div class="declaration">
  <p>In accordance with the <strong>Protection of Personal Information Act, 4 of 2013 (POPIA)</strong>, I hereby grant <strong>Mobile Applications Laboratory NPC</strong> and its authorized representatives consent to collect, process, and store my personal information.</p>
</div>

<div class="sig-bar">
  <div class="sig-bar__label">Learner Signature (Registration & POPIA)</div>
  ${dayOneLearnerSigUrl ? `<img src="${dayOneLearnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(learner.createdAt || new Date())}</div>
</div>
<div class="pb"></div>

${dividerPage("4", "Letter of Commitment", "Learner declaration of authenticity and commitment to programme requirements.")}
<div class="pb"></div>
${sectionHeader("4", "Letter of Commitment from Learner", "Declaration of Authenticity and Programme Commitment")}
<div class="letter-body">
  <p>I, <strong>${learner.fullName || "___________________"}</strong>, hereby undertake to fulfil all the requirements of the assessment and training practices as specified by the assessor and the service provider, Mobile Applications Laboratory NPC.</p>
</div>
<div class="sig-bar">
  <div class="sig-bar__label">Learner Sign-Off</div>
  ${dayOneLearnerSigUrl ? `<img src="${dayOneLearnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(submissions[0]?.assignedAt || new Date())}</div>
</div>
<div class="pb"></div>

${dividerPage("5", "Programme Induction", "Confirmation that the learner received a comprehensive induction prior to assessment commencement.")}
<div class="pb"></div>
${sectionHeader("5", "Programme Induction", "Formal Acknowledgement of Induction Completion")}
<div class="declaration">
  <p>This confirms that the learner named herein received a comprehensive induction into the programme.</p>
</div>
<div class="sig-row" style="grid-template-columns: 1fr 1fr;">
  ${sigCell("Learner Acknowledgement", "learner", dayOneLearnerSigUrl, learner.fullName || "Learner", "", fmt(submissions[0]?.assignedAt || new Date()))}
  ${sigCell("Facilitator Sign-Off", "fac", primaryFacSigUrl, "Programme Facilitator", "", fmt(submissions[0]?.assignedAt || new Date()))}
</div>
<div class="pb"></div>
`;

      await updateProgress(70, "Rendering assessment layout…");
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(120000);
      await page.setContent(html, {
        waitUntil: ["load", "networkidle2"],
        timeout: 120000,
      });

      const puppeteerPdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="font-size:8px; font-family:'Trebuchet MS',sans-serif; color:#9b9b9b; padding:0 16mm; width:100%; display:flex; justify-content:space-between;"><span>mLab NPC — Master Portfolio of Evidence</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        margin: { top: "15mm", right: "16mm", bottom: "22mm", left: "16mm" },
      });
      await browser.close();

      await updateProgress(85, "Merging annexures & finalizing PDF…");
      const masterPdf = await PDFDocument.create();

      const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);

      const basePdfDoc = await PDFDocument.load(puppeteerPdfBuffer);
      const basePages = await masterPdf.copyPages(
        basePdfDoc,
        basePdfDoc.getPageIndices(),
      );
      basePages.forEach((p) => masterPdf.addPage(p));

      // Append annexures to the main document
      for (const evidence of offlineEvidenceFiles) {
        try {
          const buffer = await fetchFileBuffer(evidence.url);
          if (!buffer) continue;
          const stampText = `Annexure ${evidence.index}: ${evidence.label}`;
          try {
            const extPdf = await PDFDocument.load(buffer);
            const copPages = await masterPdf.copyPages(
              extPdf,
              extPdf.getPageIndices(),
            );
            if (copPages.length > 0) {
              const fp = copPages[0];
              fp.drawText(stampText, {
                x: 20,
                y: fp.getSize().height - 20,
                size: 9,
                color: rgb(0.86, 0.15, 0.15),
                font: fontBold,
              });
            }
            copPages.forEach((p: any) => masterPdf.addPage(p));
          } catch {
            // Non-PDF Fallback handling omitted for brevity
          }
        } catch (err) {
          logger.warn(`Annexure append failed for ${evidence.url}`, err);
        }
      }

      const finalPdfBuffer = Buffer.from(await masterPdf.save());
      const bucket = admin.storage().bucket();
      const filePath = `poe_exports/${learnerId}/Master_PoE_${requestId}.pdf`;
      const file = bucket.file(filePath);

      await file.save(finalPdfBuffer, {
        metadata: { contentType: "application/pdf" },
      });
      const [downloadUrl] = await file.getSignedUrl({
        action: "read",
        expires: "01-01-2100",
      });

      await snap.ref.update({
        status: "completed",
        progress: 100,
        progressMessage: "Done!",
        downloadUrl,
      });

      if (requesterEmail) {
        const emailParams = {
          title: "Master PoE Ready",
          subtitle: learner.fullName,
          recipientName: "Admin",
          bodyHtml: `<p>Master Portfolio of Evidence for <strong>${learner.fullName}</strong> compiled successfully.</p>`,
          ctaText: "Download Master PoE PDF",
          ctaLink: downloadUrl,
          showStepIndicator: false,
        };

        await sendMailgunEmail({
          to: requesterEmail,
          subject: `Master PoE Ready — ${learner.fullName}`,
          text: buildMlabEmailPlainText(emailParams),
          html: buildMlabEmailHtml(emailParams),
        });
      }
    } catch (error: any) {
      logger.error("Master PoE Generation Failed:", error);
      await snap.ref.update({
        status: "error",
        progressMessage: "Generation failed",
        errorMessage: error.message,
      });
    }
  },
);

// ============================================================================
// 2. EXPORT REPORT TO PDF (SINGLE PAGE / EVENT REPORT RENDERER)
// ============================================================================

export const exportReportToPDF = onCall(
  { timeoutSeconds: 300, memory: "1GiB", region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "Must be logged in.");

    const { htmlContent, reportName } = request.data;
    if (!htmlContent)
      throw new HttpsError("invalid-argument", "HTML content required.");

    try {
      logger.info(`[PDF Engine] Spawning Puppeteer for ${reportName}...`);

      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, {
        waitUntil: ["load", "networkidle0"],
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });

      await browser.close();

      const bucket = admin.storage().bucket();
      const safeName = (reportName || "Report").replace(/[^a-zA-Z0-9]/g, "_");
      const filePath = `ai_reports/pdfs/${safeName}_${Date.now()}.pdf`;
      const file = bucket.file(filePath);

      await file.save(pdfBuffer, {
        metadata: { contentType: "application/pdf" },
      });
      const [downloadUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60 * 2,
      });

      return { success: true, url: downloadUrl };
    } catch (error: any) {
      logger.error("PDF Generation Error:", error);
      throw new HttpsError(
        "internal",
        "Failed to render PDF: " + error.message,
      );
    }
  },
);

// ============================================================================
// 3. SETA COMPLIANCE AUDIT PACK GENERATOR (ZIP ARCHIVE)
// ============================================================================

export const generateSetaAuditPack = onCall(
  { timeoutSeconds: 300, memory: "2GiB" },
  async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "Must be logged in.");

    const { learnerId, placementId, learnerName } = request.data;
    if (!learnerId || !placementId)
      throw new HttpsError("invalid-argument", "Missing parameters.");

    const bucket = admin.storage().bucket();

    try {
      const JSZipModule = require("jszip");
      const JSZip =
        typeof JSZipModule === "function"
          ? JSZipModule
          : JSZipModule.default || JSZipModule;
      const zip = new JSZip();

      const safeLearnerName = (learnerName || "Learner").replace(
        /[^a-zA-Z0-9]/g,
        "_",
      );
      zip.file(
        `08_Audit/Compliance_Checklist.txt`,
        `SETA COMPLIANCE AUDIT PACK\nLearner: ${learnerName}`,
      );

      const finalZipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      const fileName = `audit_packs/SETA_Audit_${safeLearnerName}_${Date.now()}.zip`;
      const file = bucket.file(fileName);

      await file.save(finalZipBuffer, {
        metadata: { contentType: "application/zip" },
      });
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 3600000,
      });

      return { success: true, url: signedUrl };
    } catch (error: any) {
      logger.error("Audit Pack Generation Error:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to compile compliance pack.",
      );
    }
  },
);

// ============================================================================
// 4. ENTERPRISE BULK EXPORT ENGINE (TASK QUEUES & FAN-OUT)
// ============================================================================

export const requestBulkAuditPacks = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Unauthorized.");

  const { companyId, companyName, placements } = request.data;
  if (!companyId || !placements || placements.length === 0) {
    throw new HttpsError("invalid-argument", "Missing required payload.");
  }

  const db = admin.firestore();
  const queue = getAdminFunctions().taskQueue("processSingleLearnerTask");

  try {
    const jobRef = db.collection("compliance_jobs").doc();
    await jobRef.set({
      companyId,
      companyName,
      status: "processing",
      totalTasks: placements.length,
      completedTasks: 0,
      failedTasks: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      downloadUrl: null,
    });

    const enqueuePromises = placements.map((p: any) =>
      queue.enqueue({
        jobId: jobRef.id,
        companyName,
        learnerId: p.learnerId,
        placementId: p.placementId,
        learnerName: p.learnerName,
        idNumber: p.idNumber,
        mentorName: p.mentorName,
      }),
    );

    await Promise.all(enqueuePromises);
    return { success: true, jobId: jobRef.id };
  } catch (error: any) {
    logger.error("Error starting bulk job:", error);
    throw new HttpsError("internal", "Failed to initialize bulk export.");
  }
});

export const processSingleLearnerTask = onTaskDispatched(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 },
    rateLimits: { maxConcurrentDispatches: 10 },
    memory: "2GiB",
    timeoutSeconds: 300,
  },
  async (request) => {
    const { jobId, learnerName } = request.data;
    const db = admin.firestore();
    const jobRef = db.collection("compliance_jobs").doc(jobId);

    try {
      logger.info(`Processing task for ${learnerName} (Job: ${jobId})`);
      await jobRef.update({
        completedTasks: admin.firestore.FieldValue.increment(1),
      });
    } catch (error) {
      logger.error(`Task failed for ${learnerName}:`, error);
      await jobRef.update({
        failedTasks: admin.firestore.FieldValue.increment(1),
        completedTasks: admin.firestore.FieldValue.increment(1),
      });
    }
  },
);

export const finalizeBulkJob = onDocumentUpdated(
  { document: "compliance_jobs/{jobId}", timeoutSeconds: 540, memory: "2GiB" },
  async (event) => {
    const jobAfter = event.data?.after.data();
    if (!jobAfter) return;

    if (
      jobAfter.status === "processing" &&
      jobAfter.completedTasks === jobAfter.totalTasks
    ) {
      await event.data?.after.ref.update({ status: "complete" });
    }
  },
);

// ============================================================================
// 5. CODE SNAPSHOT SAVER & RETRIEVER (INTERACTIVE LAB EXERCISES)
// ============================================================================

export const saveCodeSnapshot = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const { submissionId, blockId, files, dependencies } = data as {
      submissionId: string;
      blockId: string;
      files: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    if (!submissionId || !blockId || !files) {
      throw new HttpsError("invalid-argument", "Missing parameters.");
    }

    const db = admin.firestore();
    const subRef = db.collection("learner_submissions").doc(submissionId);
    const subSnap = await subRef.get();

    if (!subSnap.exists)
      throw new HttpsError("not-found", "Submission not found.");
    const subData = subSnap.data()!;

    if (subData.authUid !== auth.uid) {
      throw new HttpsError("permission-denied", "Not your submission.");
    }

    const payload = JSON.stringify({ files, dependencies: dependencies || {} });
    const sizeBytes = Buffer.byteLength(payload, "utf8");

    if (sizeBytes > MAX_PAYLOAD_BYTES) {
      throw new HttpsError(
        "resource-exhausted",
        "Snapshot payload size too large.",
      );
    }

    const storagePath = `code_snapshots/${submissionId}/${blockId}.json`;
    const bucket = admin.storage().bucket();
    await bucket
      .file(storagePath)
      .save(payload, { contentType: "application/json" });

    const lastSavedAt = new Date().toISOString();
    await subRef.update({
      [`answers.${blockId}`]: {
        storagePath,
        fileCount: Object.keys(files).length,
        sizeBytes,
        lastSavedAt,
      },
    });

    return { success: true, storagePath, sizeBytes, lastSavedAt };
  },
);

export const getCodeSnapshot = onCall(
  { region: "us-central1" },
  async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const { submissionId, blockId } = data as {
      submissionId: string;
      blockId: string;
    };
    const db = admin.firestore();
    const subSnap = await db
      .collection("learner_submissions")
      .doc(submissionId)
      .get();

    if (!subSnap.exists)
      throw new HttpsError("not-found", "Submission not found.");

    const answerEntry = subSnap.data()?.answers?.[blockId];
    if (!answerEntry?.storagePath) return { files: {}, dependencies: {} };

    const bucket = admin.storage().bucket();
    const [contents] = await bucket.file(answerEntry.storagePath).download();
    return JSON.parse(contents.toString("utf8"));
  },
);
