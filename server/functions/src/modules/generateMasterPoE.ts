// functions/src/generateMasterPoE.ts
// mLab Assessment Platform — Master Portfolio of Evidence Generator
// Brand: mLab Corporate Identity 2019
//   Midnight Blue #073f4e · Green #94c73d · Trebuchet MS / Oswald

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
import * as nodemailer from "nodemailer";

// ─── TYPES & INTERFACES ──────────────────────────────────────────────────────

interface UploadedDoc {
  id: string;
  name: string;
  url: string;
}
interface EvidenceFile {
  index: number;
  url: string;
  label: string;
}

interface Submission {
  id: string;
  assessmentId: string;
  title?: string;
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
  learnerDeclaration?: any;
  grading?: {
    facilitatorName?: string;
    facilitatorOverallFeedback?: string;
    facilitatorReviewedAt?: string;
    facilitatorId?: string;
    assessorName?: string;
    assessorOverallFeedback?: string;
    assessorRegNumber?: string;
    assessorId?: string;
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
    resolvedAt?: string;
    resolutionNotes?: string;
  };
  latestCoachingLog?: {
    date?: string;
    notes?: string;
    facilitatorId?: string;
    facilitatorName?: string;
    acknowledged?: boolean;
    acknowledgedAt?: string;
  };
  [key: string]: any; // Fixes ts(7053)
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const fetchFileBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    // @ts-ignore - Bypasses ts(7016)
    const fetch = (await import("node-fetch")).default;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.error("Buffer fetch error:", error);
    return null;
  }
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "brndkt@gmail.com",
    pass: "gwjy wcin rdpl lovi", // Generated App Password
  },
});

// ─── HTML DESIGN SYSTEM & STYLES ──────────────────────────────────────────────

const POE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap');

  /* ── PAGE SETUP ── */
  @page { size: A4; margin: 15mm 16mm 22mm; }
  @page :first { margin-top: 0; }

  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: 'Trebuchet MS', 'Lucida Grande', Arial, sans-serif;
    font-size: 11px;
    color: #1a2e35;
    line-height: 1.5;
    margin: 0; padding: 0;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── PAGE BREAK ── */
  .pb { page-break-after: always; }
  .pbi { page-break-inside: avoid; }

  /* ═══════════════════════════════
     COVER PAGE
  ═══════════════════════════════ */
  .cover {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #073f4e;
    overflow: hidden;
    position: relative;
  }
  .cover__pattern {
    position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(-45deg, transparent, transparent 32px, rgba(148,199,61,0.05) 32px, rgba(148,199,61,0.05) 33px),
      repeating-linear-gradient(45deg, transparent, transparent 32px, rgba(255,255,255,0.02) 32px, rgba(255,255,255,0.02) 33px);
    pointer-events: none;
  }
  .cover__accent { display: flex; height: 8px; flex-shrink: 0; }
  .cover__accent-blue  { flex: 1; background: #052e3a; }
  .cover__accent-green { width: 100px; background: #94c73d; }

  .cover__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 28px 40px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
    position: relative;
  }
  .cover__logo { height: 52px; object-fit: contain; }
  .cover__org { text-align: right; }
  .cover__org-name {
    font-family: 'Oswald', sans-serif;
    font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ffffff; display: block;
  }
  .cover__org-tag { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); display: block; margin-top: 3px; }

  .cover__body {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; position: relative;
  }

  .cover__doc-type {
    font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #94c73d; margin: 0 0 16px; display: flex; align-items: center; justify-content: center; gap: 10px;
  }
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

  /* ═══════════════════════════════
     DIVIDER PAGE
  ═══════════════════════════════ */
  .divider { height: 100vh; background: #073f4e; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .divider__pattern { position: absolute; inset: 0; background-image: repeating-linear-gradient(-45deg, transparent, transparent 32px, rgba(255,255,255,0.02) 32px, rgba(255,255,255,0.02) 33px); pointer-events: none; }
  .divider__accent { display: flex; height: 6px; flex-shrink: 0; }
  .divider__accent-blue  { flex: 1; background: #052e3a; }
  .divider__accent-green { width: 80px; background: #94c73d; }
  .divider__body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 80px; text-align: center; position: relative; }
  .divider__num { font-family: 'Oswald', sans-serif; font-size: 100px; font-weight: 700; color: rgba(255,255,255,0.06); line-height: 1; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -54%); user-select: none; pointer-events: none; }
  .divider__section-label { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #94c73d; margin: 0 0 14px; }
  .divider__title { font-family: 'Oswald', sans-serif; font-size: 36px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff; margin: 0 0 16px; line-height: 1.1; position: relative; }
  .divider__desc { font-size: 12px; color: rgba(255,255,255,0.4); max-width: 440px; line-height: 1.7; position: relative; }
  .divider__accent-bottom { display: flex; height: 6px; flex-shrink: 0; }
  .divider__accent-bottom-green { width: 80px; background: #94c73d; }
  .divider__accent-bottom-blue  { flex: 1; background: #052e3a; }

  /* ═══════════════════════════════
     SECTION HEADER
  ═══════════════════════════════ */
  .sec-header { display: flex; align-items: stretch; margin: 0 0 20px; border-top: 4px solid #073f4e; background: #073f4e; }
  .sec-header__num { width: 48px; flex-shrink: 0; background: #94c73d; display: flex; align-items: center; justify-content: center; font-family: 'Oswald', sans-serif; font-size: 18px; font-weight: 700; color: #073f4e; }
  .sec-header__text { padding: 10px 16px; flex: 1; }
  .sec-header__title { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; margin: 0; line-height: 1.1; }
  .sec-header__sub { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin: 3px 0 0; }
  
  .sub-heading { font-family: 'Oswald', sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #073f4e; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #073f4e; display: flex; align-items: center; gap: 6px; }
  .sub-heading::after { content: ''; display: block; height: 2px; flex: 1; background: #94c73d; margin-left: 6px; }

  /* ═══════════════════════════════
     DATA GRID
  ═══════════════════════════════ */
  .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #dde4e8; border: 1px solid #dde4e8; margin-bottom: 18px; }
  .data-grid--1col { grid-template-columns: 1fr; }
  .data-cell { background: #ffffff; padding: 9px 12px; }
  .data-cell--span2 { grid-column: span 2; }
  .data-cell__label { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #9b9b9b; display: block; margin-bottom: 3px; }
  .data-cell__value { font-size: 11.5px; font-weight: 600; color: #073f4e; }

  /* ═══════════════════════════════
     TABLES
  ═══════════════════════════════ */
  .poe-table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 10.5px; }
  .poe-table thead tr { background: #073f4e; }
  .poe-table th { padding: 8px 10px; text-align: left; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.85); border-right: 1px solid rgba(255,255,255,0.08); }
  .poe-table td { padding: 7px 10px; border-bottom: 1px solid #e8eef1; border-right: 1px solid #e8eef1; color: #1a2e35; vertical-align: top; }
  .poe-table tbody tr:nth-child(even) td { background: #f8fafb; }
  .poe-table--accented td:first-child { border-left: 3px solid #94c73d; }
  .poe-table--checklist td:nth-child(3) { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }

  /* ═══════════════════════════════
     BADGES
  ═══════════════════════════════ */
  .badge { display: inline-block; padding: 2px 8px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .badge--c   { background: rgba(148,199,61,0.15); color: #3d6b0f; border: 1px solid rgba(148,199,61,0.4); }
  .badge--nyc { background: rgba(239,68,68,0.1);   color: #b91c1c; border: 1px solid rgba(239,68,68,0.3); }
  .badge--p   { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }
  .badge--attempt { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .badge--attempt1 { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }

  /* ═══════════════════════════════
     MODULE TRANSCRIPT 
  ═══════════════════════════════ */
  .module-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #e4edf0; border-left: 5px solid #073f4e; margin-bottom: 12px; }
  .module-header__title { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #073f4e; margin: 0; }
  
  .eval-box { border: 1px solid #dde4e8; border-top: 3px solid #073f4e; margin-bottom: 16px; page-break-inside: avoid; }
  .eval-box__row { display: flex; align-items: flex-start; border-bottom: 1px solid #eef0f2; min-height: 32px; }
  .eval-box__label { width: 150px; flex-shrink: 0; padding: 8px 12px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9b9b9b; background: #f8fafb; border-right: 1px solid #eef0f2; }
  .eval-box__value { padding: 8px 14px; font-size: 11px; color: #1a2e35; flex: 1; }
  .eval-box__divider { height: 1px; background: #dde4e8; margin: 0; }

  /* 🚀 OFFICIAL QCTO INK COLORS */
  .ink-fac { color: #1d4ed8 !important; } /* Facilitator — blue ink */
  .ink-ass { color: #b91c1c !important; } /* Assessor — red ink     */
  .ink-mod { color: #15803d !important; } /* Moderator — green ink  */

  .q-block { margin-bottom: 16px; border-bottom: 1px solid #eef0f2; padding-bottom: 14px; page-break-inside: avoid; }
  .q-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #073f4e; color: #ffffff; font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; flex-shrink: 0; margin-right: 8px; }
  .q-text { font-family: 'Oswald', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: #073f4e; margin: 0 0 8px; display: flex; }
  .a-text { background: #f8fafb; border: 1px solid #e4edf0; border-left: 4px solid #9b9b9b; padding: 9px 12px; font-size: 11px; white-space: pre-wrap; overflow-wrap: break-word; color: #1a2e35; }
  .a-link { color: #0a5266; text-decoration: underline; font-weight: 600; }
  .a-annex { margin-top: 6px; padding: 7px 10px; background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; font-size: 10px; }
  
  .f-block { margin-top: 7px; border: 1px solid #e4edf0; border-top: 2px solid #dde4e8; font-size: 10px; }
  .f-row { display: flex; align-items: flex-start; padding: 5px 10px; border-bottom: 1px solid #f0f4f6; gap: 6px; }
  .f-role { font-family: 'Oswald', sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; width: 90px; flex-shrink: 0; padding-top: 1px; }
  .f-comment { line-height: 1.5; flex: 1; }

  .openbook-notice { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; margin-bottom: 14px; font-size: 11px; page-break-inside: avoid; }
  .openbook-notice__icon { font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; color: #0369a1; }

  /* ═══════════════════════════════
     SIGNATURE BLOCKS
  ═══════════════════════════════ */
  .sig-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; background: #f4f7f9; border: 1px solid #dde4e8; border-top: 3px solid #94c73d; margin: 16px 0 0; page-break-inside: avoid; }
  .sig-bar__label { font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6b6b; }
  .sig-bar__img { max-height: 36px; max-width: 120px; object-fit: contain; mix-blend-mode: multiply; }
  .sig-bar__pending { font-size: 9px; color: #9b9b9b; font-style: italic; }
  .sig-bar__date { font-size: 9px; color: #6b6b6b; }

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

  /* ═══════════════════════════════
     CARDS & NOTICES
  ═══════════════════════════════ */
  .notice { padding: 12px 14px; margin: 0 0 14px; page-break-inside: avoid; }
  .notice--green { background: rgba(148,199,61,0.07); border: 1px solid rgba(148,199,61,0.3); border-left: 5px solid #94c73d; }
  .notice--grey { background: #f4f7f9; border: 1px solid #dde4e8; border-left: 5px solid #9b9b9b; }
  .notice__title { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 5px; }
  
  .coaching-card { border: 1px solid #dde4e8; border-left: 5px solid #d97706; background: #fffbeb; margin-bottom: 14px; page-break-inside: avoid; }
  .coaching-card__head { display: flex; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid #fde68a; background: rgba(217,119,6,0.06); }
  .coaching-card__title { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #92400e; margin: 0; }
  .coaching-card__body { padding: 12px 14px; }

  .appeal-card { border: 1px solid #fecaca; border-left: 5px solid #ef4444; background: #fef2f2; margin-bottom: 14px; page-break-inside: avoid; }
  .appeal-card__head { display: flex; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid #fecaca; background: rgba(239,68,68,0.06); }
  .appeal-card__title { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #b91c1c; margin: 0; }
  .appeal-card__body { padding: 12px 14px; }

  .history-box { border: 1px solid #fecaca; border-top: 3px solid #ef4444; margin-top: 18px; padding: 15px; background: #fef2f2; border-radius: 6px; page-break-inside: avoid; }
  .history-box__header { padding-bottom: 8px; border-bottom: 1px solid #fecaca; font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #b91c1c; text-transform: uppercase; margin-bottom: 12px; }
  .history-attempt { padding-bottom: 10px; border-bottom: 1px dashed #fecaca; margin-bottom: 12px; }
  .history-attempt:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .history-attempt__title { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; color: #991b1b; margin: 0 0 4px; }
  .history-files { margin-top: 8px; padding: 8px; background: #ffffff; border: 1px solid #fecaca; border-radius: 4px; font-size: 10px; }

  .declaration { background: #f4f7f9; border: 1px solid #dde4e8; border-top: 3px solid #073f4e; padding: 16px; font-size: 11px; margin-bottom: 16px; }
  .letter-body { border: 1px solid #dde4e8; padding: 24px 28px; font-size: 11.5px; background: #ffffff; margin-bottom: 20px; }
  
  .text-center { text-align: center; }
`;

// ─── HTML GENERATION HELPERS ──────────────────────────────────────────────────

const sigCell = (
  role: string,
  cls: string,
  sigUrl: string | null,
  name: string,
  detail: string,
  date: string,
) => {
  let ink = "";
  if (cls === "fac") ink = "ink-fac";
  if (cls === "assessor") ink = "ink-ass";
  if (cls === "mod") ink = "ink-mod";

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

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export const generateMasterPoE = onDocumentCreated(
  {
    document: "poe_export_requests/{requestId}",
    timeoutSeconds: 540,
    memory: "2GiB",
    region: "us-central1",
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
          console.error("Auth fetch failed", e);
        }
      }

      const learnerSnap = await admin
        .firestore()
        .collection("learners")
        .doc(learnerId)
        .get();
      const learner = learnerSnap.data() || {};
      const userDocSnap = await admin
        .firestore()
        .collection("users")
        .doc(learner.authUid || learnerId)
        .get();
      const learnerUserDoc = userDocSnap.data() || {};

      let enrollment: any = {};
      if (learner.enrollmentId) {
        const enrolSnap = await admin
          .firestore()
          .collection("enrollments")
          .doc(learner.enrollmentId)
          .get();
        if (enrolSnap.exists) enrollment = enrolSnap.data() || {};
      }

      await updateProgress(15, "Fetching all evidence modules…");
      const subsSnap = await admin
        .firestore()
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
            admin.firestore().collection("users").doc(uid).get(),
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

      const learnerSigUrl = learner.authUid
        ? signaturesMap[learner.authUid]
        : null;
      const primaryFacSigUrl = primaryFacilitatorId
        ? signaturesMap[primaryFacilitatorId]
        : null;
      const primaryGradedSub = submissions.find((s) => s.assessorId);
      const assessorSigUrl = primaryGradedSub?.assessorId
        ? signaturesMap[primaryGradedSub.assessorId]
        : null;

      await updateProgress(30, "Building QCTO compliance document…");

      const companyLogoUrl =
        "https://firebasestorage.googleapis.com/v0/b/testpro-8f08c.appspot.com/o/Mlab-Grey-variation-1.png?alt=media&token=e85e0473-97cc-431d-8c08-7a3445806983";
      const offlineEvidenceFiles: EvidenceFile[] = [];

      const progressRows = (subs: Submission[]) => {
        if (!subs.length)
          return `<tr><td colspan="4" class="empty-state">No modules mapped for this component.</td></tr>`;
        return subs
          .map((s) => {
            const att = s.attemptNumber || 1;
            const attBadge =
              att > 1
                ? `<span class="badge badge--attempt">Attempt ${att}</span>`
                : `<span class="badge badge--attempt1">1st</span>`;
            const compBadge = outcomeBadge(s.competency);
            return `<tr>
            <td style="font-family:'Oswald',sans-serif; font-weight:700; font-size:10px; color:#073f4e;">${s.moduleNumber || "N/A"}</td>
            <td>${s.title || "Untitled"}</td>
            <td class="text-center">${attBadge}</td>
            <td class="text-center">${compBadge}</td>
          </tr>`;
          })
          .join("");
      };

      const learningPlanRows = (subs: Submission[]) => {
        if (!subs.length)
          return `<tr><td colspan="8" class="empty-state">No modules mapped.</td></tr>`;
        return subs
          .map((s) => {
            const facName =
              s.grading?.facilitatorName || s.facilitatorName || "Pending";
            const dateRange = `${fmt(s.assignedAt)} – ${fmt(s.gradedAt)}`;
            const compBadge = outcomeBadge(s.competency);
            return `<tr>
            <td style="font-family:'Oswald',sans-serif; font-weight:700; font-size:9.5px; color:#073f4e;">${s.moduleNumber || "N/A"}</td>
            <td><span class="ink-fac">${facName}</span></td>
            <td style="font-size:10px;">${dateRange}</td>
            <td class="text-center font-bold">${s.moduleType === "knowledge" ? "✓" : ""}</td>
            <td class="text-center font-bold">${s.moduleType === "practical" ? "✓" : ""}</td>
            <td class="text-center font-bold">${s.moduleType === "workplace" ? "✓" : ""}</td>
            <td class="text-center">${s.competency === "C" ? compBadge : ""}</td>
            <td class="text-center">${s.competency === "NYC" ? compBadge : ""}</td>
          </tr>`;
          })
          .join("");
      };

      // ══════════════════════════════════════════════════════════════════
      //   BUILD HTML DOCUMENT
      // ══════════════════════════════════════════════════════════════════
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
  <div class="cover__accent">
    <div class="cover__accent-blue"></div>
    <div class="cover__accent-green"></div>
  </div>
  <div class="cover__header">
    <img src="${companyLogoUrl}" alt="mLab" class="cover__logo" />
    <div class="cover__org">
      <span class="cover__org-name">mLab Southern Africa</span>
      <span class="cover__org-tag">QCTO Accredited Training Provider</span>
    </div>
  </div>
  <div class="cover__body">
    <p class="cover__doc-type">QCTO Qualification Compliance Record</p>
    <h1 class="cover__title">Master Portfolio<br>of Evidence</h1>
    <p class="cover__subtitle">Official Assessment Archive</p>
    <div class="cover__id-card">
      <div class="cover__id-row">
        <div class="cover__id-label">Full Name</div>
        <div class="cover__id-value">${learner.fullName || "N/A"}</div>
      </div>
      <div class="cover__id-row">
        <div class="cover__id-label">Identity Number</div>
        <div class="cover__id-value">${learner.idNumber || "N/A"}</div>
      </div>
      <div class="cover__id-row">
        <div class="cover__id-label">Email Address</div>
        <div class="cover__id-value">${learner.email || "N/A"}</div>
      </div>
      <div class="cover__id-row">
        <div class="cover__id-label">Programme</div>
        <div class="cover__id-value">${learner.qualification?.name || enrollment.qualificationName || "N/A"}</div>
      </div>
      <div class="cover__id-row">
        <div class="cover__id-label">Date Generated</div>
        <div class="cover__id-value">${fmt(new Date())}</div>
      </div>
    </div>
  </div>
  <div class="cover__footer">
    <span class="cover__footer-ref">Ref: ${requestId}</span>
    <span class="cover__footer-date">Generated ${fmt(new Date())}</span>
  </div>
  <div class="cover__accent-bottom">
    <div class="cover__accent-bottom-green"></div>
    <div class="cover__accent-bottom-blue"></div>
  </div>
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
  ${assessorSigUrl ? `<img src="${assessorSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(new Date())}</div>
</div>
<div class="pb"></div>`;

      // ══════════════════════════════════════════════════════════════════
      //   SECTION 2: ASSESSMENT TRANSCRIPTS (per module)
      // ══════════════════════════════════════════════════════════════════
      html += `
${dividerPage("2", "Competence Record & Final Assessment Report", "Official system-generated transcripts, grading evidence, and signed evaluations for every module assessed.")}
<div class="pb"></div>`;

      let moduleIndex = 0;
      for (const sub of submissions) {
        moduleIndex++;
        await updateProgress(
          30 + Math.floor((moduleIndex / submissions.length) * 35),
          `Compiling transcript: ${sub.title || "Module"}…`,
        );

        const assessmentSnap = await admin
          .firestore()
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

        const facSigUrl = sub.facilitatorId
          ? signaturesMap[sub.facilitatorId]
          : null;
        const assSigUrl = sub.assessorId ? signaturesMap[sub.assessorId] : null;
        const modSigUrl = sub.moderatorId
          ? signaturesMap[sub.moderatorId]
          : null;

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
        const moduleBc = sub.moduleNumber || sub.title || "Module";

        // Extract metadata cleanly
        const modInfo = assessmentData.moduleInfo || assessmentData || {};
        const nqfLevel = modInfo.nqfLevel ? `Level ${modInfo.nqfLevel}` : "N/A";
        const notionalHours = modInfo.notionalHours || "N/A";
        const credits = modInfo.credits ? `Cr ${modInfo.credits}` : "N/A";

        // 🚀 DATES
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
  </div>
  <div class="module-header__badges">
    ${outcomeBadge(sub.competency)}
    ${isReassess ? `<span class="badge badge--attempt">Attempt ${att}</span>` : `<span class="badge badge--attempt1">Attempt 1</span>`}
  </div>
</div>

<table class="poe-table" style="margin-top:-12px; margin-bottom:16px;">
  <thead>
    <tr>
      <th>Module #</th>
      <th>NQF Level</th>
      <th>Notional hours</th>
      <th>Credit(s)</th>
    </tr>
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
    ? `
<div class="openbook-notice pbi">
  <span class="openbook-notice__icon">Open Book</span>
  <div>
    Learner was provided an official reference manual during this assessment.
    Archived reference: <a href="${assessmentData.referenceManualUrl}" class="a-link">${assessmentData.referenceManualUrl}</a>
  </div>
</div>`
    : ""
}

<div class="eval-box pbi">
  <div class="eval-box__row">
    <div class="eval-box__label">Final Outcome</div>
    <div class="eval-box__value">${outcomeBadge(sub.competency)}</div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Assessment Score</div>
    <div class="eval-box__value"><strong>${sub.marks !== undefined ? sub.marks : "–"} / ${sub.totalMarks || "–"}</strong></div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Submission Attempt</div>
    <div class="eval-box__value">${att}${isReassess ? ' <span class="badge badge--attempt" style="margin-left:8px;">Reassessment</span>' : ""}</div>
  </div>
  <div class="eval-box__divider"></div>
  <div class="eval-box__row">
    <div class="eval-box__label">Facilitator Note</div>
    <div class="eval-box__value ink-fac">${facFeedback}</div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Assessor Feedback</div>
    <div class="eval-box__value ink-ass">${assFeedback}</div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Moderator Review</div>
    <div class="eval-box__value ink-mod">${modFeedback}</div>
  </div>
</div>`;

        // Evidence blocks
        if (blocks.length > 0) {
          let qNum = 1;
          blocks.forEach((block: any) => {
            if (block.type === "section") {
              html += `<div class="sub-heading">${block.title}</div>`;
              return;
            }
            if (block.type === "info") return;

            const blockBc =
              block.weCode || block.code || block.title || `Q${qNum}`;
            const ans =
              answers[block.id] !== undefined
                ? answers[block.id]
                : sub[block.id];
            let formattedAnswer = "";

            if (ans !== undefined && ans !== null) {
              if (typeof ans === "string" || typeof ans === "number") {
                if (
                  block.type === "mcq" &&
                  typeof ans === "number" &&
                  block.options
                ) {
                  formattedAnswer = block.options[ans] || String(ans);
                } else {
                  formattedAnswer = String(ans);
                }
              } else if (typeof ans === "object") {
                if (ans.text && ans.text !== "<p></p>")
                  formattedAnswer += `<div>${ans.text}</div>`;
                if (ans.url)
                  formattedAnswer += `<div>&#x1F517; <a class="a-link" href="${ans.url}">External Link</a></div>`;
                if (ans.code)
                  formattedAnswer += `<pre style="background:#f4f7f9; padding:10px; border:1px solid #dde4e8; font-size:10px; overflow-wrap:break-word;">${ans.code}</pre>`;

                if (ans.uploadUrl) {
                  const annIdx = offlineEvidenceFiles.length + 1;
                  const annLabel = `${moduleBc} | ${blockBc}`;
                  offlineEvidenceFiles.push({
                    index: annIdx,
                    url: ans.uploadUrl,
                    label: annLabel,
                  });
                  formattedAnswer += `<div class="a-annex">&#x1F4CE; <a class="a-link" href="${ans.uploadUrl}"><strong>Appended as Annexure ${annIdx}</strong></a> — ${annLabel}</div>`;
                }

                Object.keys(ans).forEach((k) => {
                  const subAns = ans[k];
                  if (subAns && typeof subAns === "object") {
                    let subHtml = "";
                    if (subAns.text && subAns.text !== "<p></p>")
                      subHtml += `<div>${subAns.text}</div>`;
                    if (subAns.url)
                      subHtml += `<div><a class="a-link" href="${subAns.url}">External Link</a></div>`;
                    if (subAns.code)
                      subHtml += `<pre style="background:#f4f7f9; padding:8px;">${subAns.code}</pre>`;
                    if (subAns.uploadUrl) {
                      const annIdx = offlineEvidenceFiles.length + 1;
                      const annLabel = `${moduleBc} | ${blockBc} | ${k.replace(/_/g, " ").toUpperCase()}`;
                      offlineEvidenceFiles.push({
                        index: annIdx,
                        url: subAns.uploadUrl,
                        label: annLabel,
                      });
                      subHtml += `<div class="a-annex">&#x1F4CE; <a class="a-link" href="${subAns.uploadUrl}"><strong>Annexure ${annIdx}</strong></a> — ${annLabel}</div>`;
                    }
                    if (subHtml)
                      formattedAnswer += `<div style="margin-top:8px; padding:8px; border-left:3px solid #dde4e8; background:#f4f7f9;"><strong style="font-family:'Oswald',sans-serif;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;">${k.replace(/_/g, " ")}</strong>${subHtml}</div>`;
                  } else if (
                    typeof subAns === "string" &&
                    subAns.trim() &&
                    !["text", "url", "uploadUrl", "code"].includes(k)
                  ) {
                    formattedAnswer += `<div><strong>${k.replace(/_/g, " ")}:</strong> ${subAns}</div>`;
                  }
                });
              }
            }
            if (!formattedAnswer)
              formattedAnswer =
                '<em class="text-muted">No evidence provided for this item.</em>';

            // Per-item feedback
            const fLayer = grading.facilitatorBreakdown?.[block.id] || {};
            const aLayer = grading.assessorBreakdown?.[block.id] || {};
            const mLayer = moderation.breakdown?.[block.id] || {};

            const feedbackRows: string[] = [];
            const seenComments = new Set<string>();
            const addFb = (role: string, inkClass: string, text: string) => {
              const clean = text?.trim();
              if (!clean) return;
              const key = `${role}:${clean}`;
              if (!seenComments.has(key)) {
                seenComments.add(key);
                feedbackRows.push(
                  `<div class="f-row"><span class="f-role ${inkClass}">${role}</span><span class="f-comment ${inkClass}">${clean}</span></div>`,
                );
              }
            };
            addFb("Facilitator", "ink-fac", fLayer.feedback);
            addFb("Assessor", "ink-ass", aLayer.feedback);
            addFb("Moderator", "ink-mod", mLayer.feedback);
            if (Array.isArray(fLayer.criteriaResults))
              fLayer.criteriaResults.forEach((c: any) =>
                addFb("Facilitator", "ink-fac", c.comment),
              );
            if (Array.isArray(aLayer.criteriaResults))
              aLayer.criteriaResults.forEach((c: any) =>
                addFb("Assessor", "ink-ass", c.comment),
              );
            if (Array.isArray(mLayer.criteriaResults))
              mLayer.criteriaResults.forEach((c: any) =>
                addFb("Moderator", "ink-mod", c.comment),
              );

            html += `
<div class="q-block">
  <div class="q-text"><span class="q-num">${qNum++}</span>${block.question || block.title || "Checkpoint"}</div>
  <div class="a-text">${formattedAnswer}</div>
  ${feedbackRows.length ? `<div class="f-block">${feedbackRows.join("")}</div>` : ""}
</div>`;
          });
        } else {
          html += `<div class="empty-state">Assessment template is empty — evidence blocks not mapped.</div>`;
        }

        // 🚀 SMART ARCHIVE LOGIC: Fixes the "No files found" bug by showing legacy message if PDF is absent.
        try {
          const historySnap = await admin
            .firestore()
            .collection("learner_submissions")
            .doc(sub.id)
            .collection("history")
            .get();
          if (!historySnap.empty) {
            const pastAttempts = historySnap.docs
              .map((d) => d.data())
              .sort((a, b) => (a.attemptNumber || 1) - (b.attemptNumber || 1));

            html += `
<div class="history-box pbi">
  <div class="history-box__header">NYC Audit Trail — Previous Attempt Archive (${pastAttempts.length} attempt${pastAttempts.length !== 1 ? "s" : ""})</div>
`;
            pastAttempts.forEach((past, hi) => {
              const pastAtt = past.attemptNumber || hi + 1;
              const pastDate = fmt(past.submittedAt || past.assignedAt);
              const pastFeedback =
                past.grading?.assessorOverallFeedback ||
                past.facilitatorOverallFeedback ||
                "No feedback recorded.";

              let archiveLinkHtml = "";

              if (past.historyPdfUrl) {
                archiveLinkHtml = `
                  <div style="margin-top:10px; padding:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px;">
                    <a href="${past.historyPdfUrl}" target="_blank" style="color:#1d4ed8; text-decoration:none; font-weight:bold; font-family:'Oswald',sans-serif; font-size:12px;">
                      📄 DOWNLOAD FULL ARCHIVED ATTEMPT PDF
                    </a>
                    <div style="font-size:9px; color:#64748b; margin-top:3px;">Contains all learner answers, rich text, and feedback for this attempt.</div>
                  </div>
                `;
              } else {
                // If it's an old record without a PDF
                archiveLinkHtml = `
                  <div style="margin-top:10px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
                    <div style="font-size:11px; color:#475569; font-style:italic;">Legacy attempt. Full PDF snapshot is not available for this record.</div>
                  </div>
                `;
              }

              html += `<div class="history-attempt">
      <div class="history-attempt__title">Attempt ${pastAtt} — Submitted ${pastDate}</div>
      <div style="font-size:10.5px; margin:4px 0 6px; display:flex; gap:16px;">
        <span><strong>Outcome:</strong> <span class="ink-ass">${past.competency || "NYC"}</span></span>
        <span><strong>Score:</strong> ${past.marks !== undefined ? past.marks : 0} / ${past.totalMarks || 0}</span>
      </div>
      <div style="font-size:10.5px;"><strong>Assessor Feedback:</strong> <span class="ink-ass">${pastFeedback}</span></div>
      ${archiveLinkHtml}
    </div>`;
            });
            html += `</div>`;
          }
        } catch (err) {
          console.error(`History fetch failed for ${sub.id}`, err);
        }

        // Signature row
        html += `
<div class="sig-row">
  ${sigCell("Learner Declaration", "learner", learnerSigUrl, learner.fullName || "Unknown", "", learnerDate)}
  ${sigCell("Facilitator Review", "fac", facSigUrl, facName, "", facDate)}
  ${sigCell("Assessor Endorsement", "assessor", assSigUrl, assessorName, assessorReg, assDate)}
  ${sigCell("Moderator Verification", "mod", modSigUrl, modName, modReg, modDate)}
</div>
<div class="pb"></div>`;
      } // end for each submission

      // ══════════════════════════════════════════════════════════════════
      //   SECTIONS 3–8
      // ══════════════════════════════════════════════════════════════════
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
  <p>I understand and agree that:</p>
  <ol style="margin-top:0; padding-left:20px;">
    <li style="margin-bottom:8px;">My personal information will be processed solely for the purposes of enrollment, assessment, moderation, certification, and reporting to relevant statutory bodies (e.g., QCTO, SETAs, SAQA).</li>
    <li style="margin-bottom:8px;">My data will be stored securely and will not be shared with unauthorized third parties without my explicit consent.</li>
    <li style="margin-bottom:8px;">I have the right to access, update, or request the deletion of my personal information, subject to statutory record-keeping requirements.</li>
  </ol>
  <p style="margin-bottom:0;">By signing this document, I acknowledge that I have read, understood, and accept the terms regarding the processing of my personal data.</p>
</div>

<div class="sig-bar">
  <div class="sig-bar__label">Learner Signature (Registration & POPIA)</div>
  ${learnerSigUrl ? `<img src="${learnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(learner.createdAt || new Date())}</div>
</div>
<div class="pb"></div>

${dividerPage("4", "Letter of Commitment", "Learner declaration of authenticity and commitment to programme requirements.")}
<div class="pb"></div>
${sectionHeader("4", "Letter of Commitment from Learner", "Declaration of Authenticity and Programme Commitment")}
<div class="letter-body">
  <p>I, <strong>${learner.fullName || "___________________"}</strong>, hereby undertake to fulfil all the requirements of the assessment and training practices as specified by the assessor and the service provider, Mobile Applications Laboratory NPC.</p>
  <p>I declare that all work submitted — including assignments, assessments, and case studies — is authentic and represents my own current work. I understand that submission of work that is not my own constitutes academic misconduct and may result in disqualification.</p>
  <p>I am aware that in order to graduate from this programme I need to meet all compulsory requirements, including being declared Competent on all components that form the basis of this qualification.</p>
  <p>I understand and accept the appeals and grievance procedures available to me, and commit to engaging with the process constructively and professionally.</p>
</div>
<div class="sig-bar">
  <div class="sig-bar__label">Learner Sign-Off</div>
  ${learnerSigUrl ? `<img src="${learnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(submissions[0]?.assignedAt || new Date())}</div>
</div>
<div class="pb"></div>

${dividerPage("5", "Programme Induction", "Confirmation that the learner received a comprehensive induction prior to assessment commencement.")}
<div class="pb"></div>
${sectionHeader("5", "Programme Induction", "Formal Acknowledgement of Induction Completion")}
<div class="declaration">
  <p>This confirms that the learner named herein received a comprehensive induction into the programme, covering:</p>
  <p><strong>1. Curriculum Overview</strong> — Programme structure, module breakdown, notional hours, and credit values.</p>
  <p><strong>2. Assessment Methodology</strong> — QCTO assessment types (Knowledge, Practical, Workplace), submission formats, and grading criteria.</p>
  <p><strong>3. Appeals and Grievance Procedures</strong> — Learner rights, remediation pathways, and formal appeals process.</p>
  <p><strong>4. Workplace and Ethical Expectations</strong> — Professional conduct, attendance requirements, and submission authenticity standards.</p>
</div>
<div class="sig-row" style="grid-template-columns: 1fr 1fr;">
  ${sigCell("Learner Acknowledgement", "learner", learnerSigUrl, learner.fullName || "Learner", "", fmt(submissions[0]?.assignedAt || new Date()))}
  ${sigCell("Facilitator Sign-Off", "fac", primaryFacSigUrl, "Programme Facilitator", "", fmt(submissions[0]?.assignedAt || new Date()))}
</div>
<div class="pb"></div>

${dividerPage("6", "Appeals & Complaint Records", "Formal records of any grievances, disputes, or appeal proceedings lodged during this programme.")}
<div class="pb"></div>
${sectionHeader("6", "Appeals & Complaint Records", "Formal Grievance and Appeal Log")}
`;

      if (appealedSubs.length > 0) {
        appealedSubs.forEach((s) => {
          const revBy =
            s.appeal?.resolvedBy || s.appeal?.reviewedBy || s.moderatorId;
          const revSig = revBy ? signaturesMap[revBy] : null;
          const revName =
            s.appeal?.resolvedByName ||
            s.appeal?.reviewedByName ||
            s.moderation?.moderatorName ||
            "Pending";
          const revDate = fmt(
            s.appeal?.resolvedAt || s.appeal?.reviewedAt || s.appeal?.date,
          );

          html += `
<div class="appeal-card pbi">
  <div class="appeal-card__head">
    <h4 class="appeal-card__title">Appeal: ${s.moduleNumber || ""} ${s.title}</h4>
    <span class="badge badge--nyc">${(s.appeal?.status || "Pending").toUpperCase()}</span>
  </div>
  <div class="appeal-card__body">
    <div class="data-grid data-grid--1col" style="margin-bottom:10px;">
      ${dc("Date of Appeal", fmt(s.appeal?.date))}
      ${dc("Reason for Appeal", s.appeal?.reason || "Not specified")}
      ${dc("Appeal Status", (s.appeal?.status || "Pending").toUpperCase())}
      ${s.appeal?.resolutionNotes ? dc("Board Resolution", s.appeal.resolutionNotes) : ""}
    </div>
    <div style="border-top: 1px dashed #fecaca; padding-top: 10px; margin-top: 10px;">
      <div class="data-cell__label" style="color: #b91c1c;">Resolved By / Signature</div>
      ${revSig ? `<img src="${revSig}" style="max-height: 35px; mix-blend-mode: multiply; margin: 4px 0;" />` : `<div style="height:35px; font-style:italic; font-size:10px; color:#b91c1c; display:flex; align-items:center;">Pending Signature</div>`}
      <div class="ink-mod" style="font-weight: 700; font-size: 11px; font-family: 'Oswald', sans-serif;">${revName}</div>
      <div class="ink-mod" style="font-size: 9px;">Date: ${revDate}</div>
    </div>
  </div>
</div>`;
        });
      } else {
        html += `
<div class="notice notice--grey pbi">
  <div class="notice__title">Status: No Appeals Lodged</div>
  <div class="notice__body">No formal appeals or complaints were registered by the learner for any module in this programme.</div>
</div>`;
      }

      html += `
<div class="pb"></div>

${dividerPage("7", "Actual Learning Plan & Evidence Control Sheet", "Full audit trail mapping all modules to facilitators, date ranges, evidence types, and competency outcomes.")}
<div class="pb"></div>
${sectionHeader("7", "Actual Learning Plan & Evidence Control Sheet", "Evidence Type Matrix and Outcome Register")}

<table class="poe-table">
  <thead>
    <tr>
      <th rowspan="2">Module Code</th>
      <th rowspan="2">Facilitator</th>
      <th rowspan="2">Assessment Period</th>
      <th colspan="3" style="text-align:center; border-bottom:1px solid rgba(255,255,255,0.15);">Evidence Type</th>
      <th colspan="2" style="text-align:center; border-bottom:1px solid rgba(255,255,255,0.15);">Outcome</th>
    </tr>
    <tr>
      <th style="text-align:center; font-size:8px;">Knowledge</th>
      <th style="text-align:center; font-size:8px;">Practical</th>
      <th style="text-align:center; font-size:8px;">Workplace</th>
      <th style="text-align:center; font-size:8px; color:#94c73d;">C</th>
      <th style="text-align:center; font-size:8px; color:#fca5a5;">NYC</th>
    </tr>
  </thead>
  <tbody>${learningPlanRows(submissions)}</tbody>
</table>

<div class="sub-heading mt-8">Evidence Judging Principles</div>
<table class="poe-table">
  <thead><tr><th>Assessment Principle</th><th width="90" style="text-align:center;">Knowledge</th><th width="120" style="text-align:center;">Practical / Workplace</th></tr></thead>
  <tbody>
    <tr><td><strong>Relevant</strong> — Evidence relates directly to specific programme learning outcomes.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Valid</strong> — Evidence demonstrates the learner can perform the required function.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Authentic</strong> — Evidence is confirmed as the learner's own work.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Consistent</strong> — Evidence demonstrates repeatable performance to the required standard.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Current</strong> — Evidence reflects learner's current level of competence.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Sufficient</strong> — Adequate evidence has been collected to support a judgement.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
  </tbody>
</table>

<div class="sig-row" style="grid-template-columns: 1fr;">
  ${sigCell("Assessor Endorsement", "assessor", assessorSigUrl, primaryAssessor, "", fmt(new Date()))}
</div>
<div class="pb"></div>

${dividerPage("8", "Learner Coaching Record", "Formal documentation of all coaching, remediation sessions, and intervention records for Not Yet Competent modules.")}
<div class="pb"></div>
${sectionHeader("8", "Learner Coaching Record (Remediation)", "Intervention Log for NYC Modules")}
`;

      if (remediatedSubs.length > 0) {
        remediatedSubs.forEach((s) => {
          const log = s.latestCoachingLog || {};
          const facId =
            log.facilitatorId || s.grading?.facilitatorId || s.facilitatorId;
          const facSig = facId ? signaturesMap[facId] : null;
          const facName =
            log.facilitatorName ||
            s.grading?.facilitatorName ||
            s.facilitatorName ||
            "Assigned Facilitator";
          const facDate = fmt(log.date || s.assignedAt);

          const learnerAckSig = log.acknowledged ? learnerSigUrl : null;
          const learnerAckDate = fmt(log.acknowledgedAt);

          html += `
<div class="coaching-card pbi">
  <div class="coaching-card__head">
    <h4 class="coaching-card__title">Remediation Log: ${s.moduleNumber || ""} ${s.title}</h4>
    <span class="badge badge--attempt">Attempt ${s.attemptNumber}</span>
  </div>
  <div class="coaching-card__body">
    <div class="data-grid">
      ${dc("Max Attempts Allowed", "3")}
      ${dc("Current Attempt", `Attempt ${s.attemptNumber}`)}
      ${dc("Coaching Facilitator", facName)}
      ${dc("Date of Intervention", fmt(log.date || s.assignedAt))}
    </div>
    <div class="data-cell" style="background:#fffbeb; border:1px solid #fde68a; padding:10px 12px; margin-bottom: 10px;">
      <span class="data-cell__label">Academic Intervention Notes</span>
      <span class="data-cell__value ink-fac" style="display:block; margin-top:4px; font-weight:400; font-size:11px; line-height:1.6;">${log.notes || "Coaching session conducted to address NYC competency gaps and unlock learner for reassessment."}</span>
    </div>
    
    <div class="sig-row" style="grid-template-columns: 1fr 1fr; margin-top: 15px;">
      ${sigCell("Facilitator Signature", "fac", facSig, facName, "", facDate)}
      ${sigCell("Learner Acknowledgement", "learner", learnerAckSig, learner.fullName || "Learner", log.acknowledged ? "Acknowledged" : "Pending", learnerAckDate)}
    </div>
  </div>
</div>`;
        });
      } else {
        html += `
<div class="notice notice--green pbi">
  <div class="notice__title">No Remediation Required</div>
  <div class="notice__body">No coaching or remediation sessions were required during this programme. All modules were completed competently on the first attempt.</div>
</div>`;
      }

      // SECTION 9 DIVIDER (Annexures appended via pdf-lib after render)
      html += `
<div class="pb"></div>
${dividerPage("9", "Annexures", "Identity documents, supporting compliance files, and evidence submissions uploaded by the learner — appended on the following pages.")}
</body></html>`;

      // ══════════════════════════════════════════════════════════════════
      //   RENDER WITH PUPPETEER
      // ══════════════════════════════════════════════════════════════════
      await updateProgress(70, "Rendering assessment layout…");
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(120000);
      page.setDefaultTimeout(120000);
      await page.setContent(html, {
        waitUntil: ["load", "networkidle2"],
        timeout: 120000,
      });

      const puppeteerPdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `
          <div style="font-size:8px; font-family:'Trebuchet MS',sans-serif; color:#9b9b9b; padding:0 16mm; width:100%; display:flex; justify-content:space-between; box-sizing:border-box;">
            <span>Mobile Applications Laboratory NPC — Master Portfolio of Evidence</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>`,
        margin: { top: "15mm", right: "16mm", bottom: "22mm", left: "16mm" },
        timeout: 120000,
      });
      await browser.close();

      // ══════════════════════════════════════════════════════════════════
      //   MERGE ANNEXURES WITH PDF-LIB
      // ══════════════════════════════════════════════════════════════════
      await updateProgress(85, "Merging annexures (identity & evidence)…");
      const masterPdf = await PDFDocument.create();
      const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);
      const basePdfDoc = await PDFDocument.load(puppeteerPdfBuffer);
      const basePages = await masterPdf.copyPages(
        basePdfDoc,
        basePdfDoc.getPageIndices(),
      );
      basePages.forEach((p) => masterPdf.addPage(p));

      // Collect uploaded docs as annexures
      const uploadedDocs: UploadedDoc[] =
        learnerUserDoc?.uploadedDocuments || learner?.uploadedDocuments || [];
      uploadedDocs.forEach((d) => {
        offlineEvidenceFiles.push({
          index: offlineEvidenceFiles.length + 1,
          url: d.url,
          label: `9. Annexure: ${d.name || "Compliance Document"}`,
        });
      });

      if (offlineEvidenceFiles.length > 0) {
        await updateProgress(90, "Stamping and merging annexures…");
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
              let image;
              try {
                image = await masterPdf.embedPng(buffer);
              } catch {
                try {
                  image = await masterPdf.embedJpg(buffer);
                } catch {}
              }
              if (image) {
                const pg = masterPdf.addPage();
                const { width, height } = pg.getSize();
                pg.drawText(stampText, {
                  x: 20,
                  y: height - 30,
                  size: 9,
                  color: rgb(0.86, 0.15, 0.15),
                  font: fontBold,
                });
                const dims = image.scaleToFit(width - 40, height - 80);
                pg.drawImage(image, {
                  x: width / 2 - dims.width / 2,
                  y: height / 2 - dims.height / 2 - 20,
                  ...dims,
                });
              }
            }
          } catch (err) {
            console.warn(`Annexure failed: ${evidence.url}`, err);
          }
        }
      }

      // ══════════════════════════════════════════════════════════════════
      //   SAVE & NOTIFY
      // ══════════════════════════════════════════════════════════════════
      await updateProgress(95, "Uploading to secure vault…");
      const finalPdfBuffer = Buffer.from(await masterPdf.save());
      const bucket = admin.storage().bucket();
      const dirPrefix = `poe_exports/${learnerId}/`;
      try {
        await bucket.deleteFiles({ prefix: dirPrefix });
      } catch {}

      const filePath = `${dirPrefix}Master_PoE_${requestId}.pdf`;
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
        await transporter
          .sendMail({
            from: '"mLab Compliance" <noreply@mlab.co.za>',
            to: requesterEmail,
            subject: `Master PoE Ready — ${learner.fullName}`,
            html: `
            <div style="font-family:'Trebuchet MS',sans-serif; max-width:560px; margin:0 auto; border-top:4px solid #073f4e;">
              <div style="background:#073f4e; padding:20px 24px;">
                <span style="font-family:'Oswald',sans-serif; font-size:18px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#ffffff;">Mobile Applications Laboratory NPC</span>
              </div>
              <div style="padding:28px 24px; background:#ffffff;">
                <p style="font-size:15px; color:#1a2e35;">The Master Portfolio of Evidence for <strong>${learner.fullName}</strong> has been generated successfully.</p>
                <p style="font-size:13px; color:#6b6b6b;">All sections, transcripts, and annexures have been compiled into a single QCTO-compliant PDF.</p>
                <div style="margin:24px 0;">
                  <a href="${downloadUrl}" style="display:inline-block; background:#073f4e; color:#ffffff; padding:13px 32px; text-decoration:none; font-family:'Oswald',sans-serif; font-weight:700; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
                    &#x2193;&nbsp; Download Master PoE PDF
                  </a>
                </div>
                <p style="font-size:11px; color:#9b9b9b;">Reference: ${requestId}</p>
              </div>
              <div style="background:#f4f7f9; padding:14px 24px; border-top:1px solid #dde4e8;">
                <p style="font-size:10px; color:#9b9b9b; margin:0;">&#169; ${new Date().getFullYear()} Mobile Applications Laboratory NPC. Automated message — do not reply.</p>
              </div>
            </div>`,
          })
          .catch((err) => {
            console.warn(
              "Email failed to send, but PoE was generated. Check your secrets.",
              err,
            );
          });
      }
    } catch (error: any) {
      console.error("Master PoE Generation Failed:", error);
      await snap.ref.update({
        status: "error",
        progressMessage: "Generation failed",
        errorMessage: error.message,
      });
    }
  },
);
