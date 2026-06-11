// src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

import React, { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { collection, query, where, getDocs, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import {
    ArrowLeft, MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
    ShieldCheck, ChevronRight, Activity, RefreshCw, UploadCloud, ChevronDown, ChevronUp, Archive
} from "lucide-react";
import moment from "moment";
import * as XLSX from "xlsx";

// Modularized components
import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
import { LogbookAuditModal } from "./LogbookAuditModal";
import { StipendDisbursementModal } from "./StipendDisbursementModal";
import { BulkStipendUploader } from "./BulkStipendUploader";

import type { DashboardLearner, Employer, PlacementContract } from "../../../../types";
import { useStore, type StaffMember } from "../../../../store/useStore";
import { getFunctions, httpsCallable } from "firebase/functions";

export interface CompanyInsightsViewProps {
    company: Employer;
    onBack: () => void;
}

export interface EnrichedPlacement extends PlacementContract {
    placementType: string;
    bbbeeSpendCategory: string;
    compliance: {
        isAgreementFullyExecuted: boolean;
        wblpaAgreementUrl?: string;
    };
    learnerName: string;
    idNumber: string;
    equityGroup: string;
    hasDisability: boolean;
    isFemale: boolean;
    isYouth: boolean;
    mentorName: string;
    hasMentor: boolean;
    isEtiEligible: boolean;
    etiMonthlyValue: number;
    projectedStipendSpend: number;
    s12hAllowanceTotal: number;
    attendancePercentage: number;
    approvedWpHours: number;
    pendingWpHours: number;
    draftWpHours: number;
    rejectedWpHours: number;
    currentMonthApprovedDays: number;
    expectedWorkingDaysThisMonth: number;
    currentMonthEarnedStipend: number;
}

interface PlacementStats {
    activeCount: number;
    completedCount: number;
    droppedCount: number;
    missingContracts: number;
    nonCompliantCount: number;
}

interface ComplianceMetricsData {
    transformationPercentage: number;
    disabilityPercentage: number;
    disabilityCount: number;
    youthPercentage: number;
    youthCount: number;
    etiYieldPercentage: number;
    monthlyETITotal: number;
    annualizedETIEstimate: number;
    absorptionRate: number;
    totalProjectedSpend: number;
    totalS12hProjected: number;
    totalFemale: number;
    totalMale: number;
    absorbedFemale: number;
    absorbedMale: number;
    raceCounts: { African: number; Coloured: number; Indian: number; White: number; Other: number };
    overloadedMentors: number;
}

const getSAWorkingDaysInMonth = (year: number, month: number, holidays: string[]) => {
    const start = moment([year, month, 1]);
    const end = moment(start).endOf('month');
    let days = 0;

    let current = start.clone();
    while (current.isSameOrBefore(end)) {
        if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
            if (!holidays.includes(current.format('YYYY-MM-DD'))) {
                days++;
            }
        }
        current.add(1, 'days');
    }
    return days;
};

/* ─── ETI BREAKDOWN MODAL ─── */
const EtiBreakdownModal: React.FC<{ learner: EnrichedPlacement; onClose: () => void; }> = ({ learner, onClose }) => {
    const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
    const wage = Number(learner.stipendAmount) || 0;
    const eti = Number(learner.etiMonthlyValue) || 0;
    const annualEti = eti * 12;

    let mathString = "";
    if (wage < 2000) mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
    else if (wage >= 2000 && wage <= 4499) mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
    else if (wage >= 4500 && wage < 6500) mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
    else mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="wm-modal" onClick={(e) => e.stopPropagation()} style={{ width: "480px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#16a34a", fontWeight: 800, fontSize: "1.1rem" }}><Landmark size={20} /> SARS ETI Tax Rebate Audit</div>
                        <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>Calculated for {learner.learnerName}</div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
                </div>

                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Database Stipend Value:</span>
                        <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(wage)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Official ETI Calculation:</span>
                        <strong style={{ fontSize: "1.1rem", color: "#16a34a" }}>{formatCurrency(eti)} /mo</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Annualized Projection:</span>
                        <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(annualEti)}</strong>
                    </div>
                </div>

                <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>Mathematical Formula Check:</div>
                <div style={{ background: "#e0e7ff", padding: "12px", borderRadius: "6px", fontSize: "0.85rem", color: "#3730a3", fontFamily: "monospace", fontWeight: 600, marginBottom: "1rem" }}>{mathString}</div>

                <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>The SARS Rules (Ages 18-29):</div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem", color: "#475569", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <li style={{ color: wage > 0 && wage < 2000 ? "#16a34a" : "inherit", fontWeight: wage > 0 && wage < 2000 ? 700 : 400 }}>If stipend is R0 – R1,999: ETI = 75% of stipend</li>
                    <li style={{ color: wage >= 2000 && wage <= 4499 ? "#16a34a" : "inherit", fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400 }}>If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)</li>
                    <li style={{ color: wage >= 4500 && wage < 6500 ? "#16a34a" : "inherit", fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400 }}>If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend - R4,500])</li>
                    <li style={{ color: wage >= 6500 ? "#dc2626" : "inherit", fontWeight: wage >= 6500 ? 700 : 400 }}>If stipend is R6,500 or more: ETI = R0</li>
                </ul>

                <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: "100%", marginTop: "1.5rem", justifyContent: "center" }}>Close Audit Trail</button>
            </div>
        </div>,
        document.body
    );
};

/* ─── PLACEMENT DETAILS SLIDE-OVER DRAWER ─── */
interface PlacementDetailsDrawerProps {
    placement: EnrichedPlacement;
    companyName: string;
    workplaceLogs: any[];
    saHolidays: string[];
    onClose: () => void;
    onOpenEti: (p: EnrichedPlacement) => void;
    onOpenLogs: (p: EnrichedPlacement) => void;
}

export const PlacementDetailsDrawer: React.FC<PlacementDetailsDrawerProps> = ({ placement, companyName, workplaceLogs, saHolidays, onClose, onOpenEti, onOpenLogs }) => {
    const [isGeneratingPack, setIsGeneratingPack] = useState(false);
    const [auditPackError, setAuditPackError] = useState<string | null>(null);
    const [showDisbursementModal, setShowDisbursementModal] = useState(false);

    const [disbursements, setDisbursements] = useState<any[]>([]);
    const [isLoadingLedger, setIsLoadingLedger] = useState(true);
    const [isLedgerExpanded, setIsLedgerExpanded] = useState(false);

    const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
    const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

    const isAuditReady = placement.hasMentor && placement.compliance.isAgreementFullyExecuted;
    const missingItems = [];
    if (!placement.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
    if (!placement.hasMentor) missingItems.push("Workplace Mentor");

    useEffect(() => {
        const fetchLedger = async () => {
            setIsLoadingLedger(true);
            try {
                const snap = await getDocs(collection(db, `placements/${placement.id}/disbursements`));
                const list = snap.docs.map(doc => doc.data()).sort((a, b) => String(b.monthYear).localeCompare(String(a.monthYear)));
                setDisbursements(list);
            } catch (error) {
                console.error("Failed to load ledger", error);
            } finally {
                setIsLoadingLedger(false);
            }
        };
        fetchLedger();
    }, [placement.id, showDisbursementModal]);

    const handleDownloadAuditPack = async () => {
        setIsGeneratingPack(true);
        setAuditPackError(null);
        try {
            const functions = getFunctions();
            const generateSetaAuditPack = httpsCallable(functions, "generateSetaAuditPack");
            const response = await generateSetaAuditPack({
                learnerId: placement.learnerId, placementId: placement.id, employerName: companyName,
                learnerName: placement.learnerName, idNumber: placement.idNumber, mentorName: placement.mentorName
            });
            const data = response.data as { success: boolean; url: string };
            if (data.success && data.url) window.location.href = data.url;
            else setAuditPackError("Server failed to supply a valid download path.");
        } catch (error: any) {
            setAuditPackError(error.message || "Failed to generate the compliance audit pack.");
        } finally {
            setIsGeneratingPack(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99990, display: "flex", justifyContent: "flex-end", position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.3)", backdropFilter: "blur(2px)" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "450px", maxWidth: "100%", height: "100%", background: "#f8fafc", display: "flex", flexDirection: "column", boxShadow: "-10px 0 25px rgba(0,0,0,0.1)", animation: "slideInRight 0.3s ease-out" }}>
                <div style={{ padding: "1.5rem", background: "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <div className="cdp-learner-avatar">{placement.learnerName.charAt(0)}</div>
                            <div><h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>{placement.learnerName}</h3><p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>ID: {placement.idNumber}</p></div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}><X size={20} /></button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} /> Master Audit Status</h4>
                        {isAuditReady ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: '#15803d', fontSize: '0.85rem', fontWeight: 700 }}><CheckCircle size={18} /> Ready for SETA/SARS Verification</div>
                                <button onClick={handleDownloadAuditPack} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "var(--mlab-blue)", color: "white", border: "none", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s" }}>
                                    {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
                                    {isGeneratingPack ? "Compiling Cloud Zip..." : "Download SETA Audit Pack (.zip)"}
                                </button>
                            </div>
                        ) : (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}><AlertTriangle size={18} /> Non-Compliant Risks Detected</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{missingItems.map(m => (<div key={m} style={{ fontSize: '0.75rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}><X size={12} /> Missing {m}</div>))}</div>
                            </div>
                        )}
                        {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
                    </div>

                    <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Briefcase size={14} /> Placement Trajectory</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                            <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Start Date</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.startDate)}</div></div>
                            <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Expected End</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.endDate)}</div></div>
                            <div style={{ gridColumn: "1 / -1", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}><div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "4px" }}>Workplace Supervisor</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: placement.hasMentor ? "var(--mlab-midnight)" : "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>{placement.hasMentor ? <><User size={14} /> {placement.mentorName}</> : <><AlertTriangle size={14} /> Unassigned</>}</div></div>
                        </div>
                    </div>

                    <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Landmark size={14} /> Finance & Contracts</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>Monthly Base Stipend</span><span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-midnight)", textDecoration: placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) ? 'line-through' : 'none' }}>{formatCurrency(placement.stipendAmount)} /mo</span></div>
                            {placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) && (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: "6px" }}>
                                    <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700 }}>EARNED THIS MONTH</span><span style={{ fontSize: "0.65rem", color: "#991b1b" }}>Based on {placement.currentMonthApprovedDays} / {placement.expectedWorkingDaysThisMonth} expected days</span></div>
                                    <span style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626" }}>{formatCurrency(placement.currentMonthEarnedStipend)}</span>
                                </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>SARS ETI Claim</span>{placement.isEtiEligible && placement.etiMonthlyValue > 0 ? (<button onClick={() => onOpenEti(placement)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", color: "#166534", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Coins size={12} /> {formatCurrency(placement.etiMonthlyValue)} /mo</button>) : (<span style={{ fontSize: "0.75rem", color: "#64748b", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>Ineligible</span>)}</div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>WBLPA Contract</span>{placement.compliance.isAgreementFullyExecuted ? (placement.compliance.wblpaAgreementUrl ? (<a href={placement.compliance.wblpaAgreementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#166534", background: "#dcfce7", padding: "4px 8px", borderRadius: "4px", border: "1px solid #bbf7d0", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}><FileText size={12} /> View Document</a>) : (<span style={{ fontSize: "0.75rem", color: "#166534", background: "#dcfce7", padding: "4px 8px", borderRadius: "4px", border: "1px solid #bbf7d0", fontWeight: 700 }}>Signed (No Link)</span>)) : (<span style={{ fontSize: "0.75rem", color: "#dc2626", background: "#fef2f2", padding: "4px 8px", borderRadius: "4px", border: "1px solid #fecaca", fontWeight: 700 }}>Not Uploaded</span>)}</div>

                            {/* ACCORDION HISTORY LEDGER */}
                            <div style={{ paddingTop: "10px", borderTop: "1px solid #f1f5f9", marginTop: "4px" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Historical Payments Ledger</div>
                                {isLoadingLedger ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}><Loader2 size={12} className="wm-spin" /> Loading records...</div>) : disbursements.length === 0 ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>No disbursements logged yet.</div>) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{disbursements[0].monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{disbursements[0].bankReference}</div></div>
                                            <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(disbursements[0].netPayment)}</div>{disbursements[0].payslipEftUrl ? (<a href={disbursements[0].payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
                                        </div>
                                        {disbursements.length > 1 && (
                                            <div style={{ marginTop: "4px" }}>
                                                <button onClick={() => setIsLedgerExpanded(!isLedgerExpanded)} style={{ width: "100%", background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}>
                                                    <span>{isLedgerExpanded ? "Hide older payments" : `View ${disbursements.length - 1} older payment(s)`}</span>{isLedgerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                                {isLedgerExpanded && (
                                                    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
                                                        {disbursements.slice(1).map((d, i) => (
                                                            <div key={i} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.85 }}>
                                                                <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{d.monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{d.bankReference}</div></div>
                                                                <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(d.netPayment)}</div>{d.payslipEftUrl ? (<a href={d.payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}>
                                <span style={{ fontSize: "0.8rem", color: "#475569" }}>Monthly Disbursment Logic</span>
                                <button onClick={() => setShowDisbursementModal(true)} style={{ fontSize: "0.75rem", color: "var(--mlab-blue)", background: "#eff6ff", padding: "4px 10px", borderRadius: "4px", border: "1px solid #bfdbfe", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><UploadCloud size={12} /> Log Payment & PoP</button>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Activity size={14} /> Audit & Logbook Activity</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#475569", marginBottom: "6px", fontWeight: 600 }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> Campus Attendance Ratio</span>
                                    <span style={{ color: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#d97706" : "#dc2626" }}>{placement.attendancePercentage}%</span>
                                </div>
                                <div style={{ width: "100%", background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                                    <div style={{ width: `${placement.attendancePercentage}%`, background: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#f59e0b" : "#ef4444", height: "100%" }} />
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                <div><div style={{ fontSize: "0.7rem", color: "#16a34a", fontWeight: 700 }}>✅ MENTOR APPROVED HOURS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#15803d" }}>{Number(placement.approvedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
                                <div><div style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 700 }}>⏳ WAITING FOR MENTOR</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#b45309" }}>{Number(placement.pendingWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
                                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#dc2626", fontWeight: 700 }}>❌ REJECTED LOGS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c2410c" }}>{Number(placement.rejectedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
                                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>📝 DRAFT (NOT SUBMITTED)</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#475569" }}>{Number(placement.draftWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
                            </div>
                            <button onClick={() => onOpenLogs(placement)} style={{ width: "100%", padding: "10px", background: "white", border: "1px solid var(--mlab-blue)", color: "var(--mlab-blue)", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.background = "#eff6ff"; }} onMouseOut={(e) => { e.currentTarget.style.background = "white"; }}>
                                <FileText size={16} /> Open Complete Logbook Audit
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showDisbursementModal && (
                <StipendDisbursementModal placement={placement} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setShowDisbursementModal(false)} />
            )}
        </div>,
        document.body
    );
};

export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
    const { learners, staff } = useStore() as any;
    const placements = useStore((s) => (s as unknown as { placements?: PlacementContract[] }).placements) || [];

    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
    const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
    const [workplaceLogs, setWorkplaceLogs] = useState<any[]>([]);
    const [isComplianceLoading, setIsComplianceLoading] = useState(true);
    const [saHolidays, setSaHolidays] = useState<string[]>([]);

    const [activeTab, setActiveTab] = useState<"active" | "history" | "all" | "action_required">("active");
    const [searchQuery, setSearchQuery] = useState("");
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);
    const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(null);
    const [drawerPlacement, setDrawerPlacement] = useState<EnrichedPlacement | null>(null);

    const menuRef = useRef<HTMLDivElement>(null);

    // 🚀 NEW STATE: Bulk Job Monitoring
    const [bulkJobId, setBulkJobId] = useState<string | null>(null);
    const [bulkJobStatus, setBulkJobStatus] = useState<{ status: string, completedTasks: number, totalTasks: number, downloadUrl?: string | null } | null>(null);
    const [isRequestingBulk, setIsRequestingBulk] = useState(false);

    const companyPlacements = useMemo(() => placements.filter((p) => p.employerId === company.id), [placements, company.id]);
    const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

    const placementLearnerIdsStr = useMemo(() => companyPlacements.map(p => p.learnerId).sort().join(","), [companyPlacements]);

    useEffect(() => {
        const fetchHolidays = async () => {
            try {
                const year = new Date().getFullYear();
                const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`);
                if (res.ok) {
                    const data = await res.json();
                    setSaHolidays(data.map((h: any) => h.date));
                }
            } catch (error) {
                console.error("Error fetching SA holidays:", error);
            }
        };
        fetchHolidays();
    }, []);

    const fetchDeepComplianceData = async () => {
        setIsComplianceLoading(true);
        try {
            const logsUnifiedMap = new Map<string, any>();
            const wpQueryEmp = query(collection(db, "workplace_logs"), where("employerId", "==", company.id));
            const wpSnapEmp = await getDocs(wpQueryEmp);
            wpSnapEmp.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));

            const relevantLearnerIds = new Set<string>();
            companyPlacements.forEach(p => {
                if (p.learnerId) relevantLearnerIds.add(String(p.learnerId).trim());
                const l = learners.find((x: any) => x.id === p.learnerId);
                if (l && l.idNumber && String(l.idNumber).trim() !== "") {
                    relevantLearnerIds.add(String(l.idNumber).trim());
                }
            });

            const placementStudentPool = Array.from(relevantLearnerIds).filter(Boolean);

            for (let i = 0; i < placementStudentPool.length; i += 10) {
                const studentChunk = placementStudentPool.slice(i, i + 10);
                if (studentChunk.length === 0) continue;
                const wpQueryLearner = query(collection(db, "workplace_logs"), where("learnerId", "in", studentChunk));
                const wpSnapLearner = await getDocs(wpQueryLearner);
                wpSnapLearner.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));
            }

            const compiledWpLogs = Array.from(logsUnifiedMap.values());
            setWorkplaceLogs(compiledWpLogs);

            const relevantCohortIds = new Set<string>();
            companyPlacements.forEach((p) => { if (p.cohortId) relevantCohortIds.add(p.cohortId); });
            const cohortIdsArray = Array.from(relevantCohortIds);
            let fetchedAttLogs: any[] = [];
            let fetchedAttRecords: any[] = [];
            for (const cId of cohortIdsArray) {
                if (!cId) continue;
                const logsQ = query(collection(db, "attendance_logs"), where("cohortId", "==", cId));
                const recsQ = query(collection(db, "attendance_records"), where("cohortId", "==", cId));
                const [lSnap, rSnap] = await Promise.all([getDocs(logsQ), getDocs(recsQ)]);
                fetchedAttLogs.push(...lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                fetchedAttRecords.push(...rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
            }

            setAttendanceLogs(fetchedAttLogs);
            setAttendanceRecords(fetchedAttRecords);
        } catch (error) {
            console.error("Deep compliance fetch error:", error);
        } finally {
            setIsComplianceLoading(false);
        }
    };

    useEffect(() => {
        if (placementLearnerIdsStr.length > 0) {
            fetchDeepComplianceData();
        } else {
            setIsComplianceLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [company.id, placementLearnerIdsStr]);

    const { activeCount, completedCount, droppedCount, missingContracts, nonCompliantCount } = useMemo<PlacementStats>(() => {
        let active = 0, completed = 0, dropped = 0, missing = 0, nonCompliant = 0;
        companyPlacements.forEach((p) => {
            const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean } };
            const statusLower = p.status.toLowerCase();
            if (statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview")) {
                active++;
                const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
                const hasMentor = !!(p.assignedMentorName || (placementRecord as any).mentorId);
                if (!isFullySigned) missing++;
                if (!isFullySigned || !hasMentor) nonCompliant++;
            }
            if (p.status === "Completed" || p.status === "absorbed_permanently") completed++;
            if (p.status === "Terminated") dropped++;
        });
        return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing, nonCompliantCount: nonCompliant };
    }, [companyPlacements]);

    const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
        return companyPlacements
            .map((p) => {
                const learner = learners.find((l: any) => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
                const placementRecord = p as PlacementContract & {
                    placementType?: string;
                    compliance?: { isAgreementFullyExecuted?: boolean; wblpaAgreementUrl?: string; bbbeeSpendCategory?: string; };
                    bbbeeSpendCategory?: string;
                    mentorId?: string;
                    cohortId?: string;
                };

                const mentor = companyMentors.find((m: any) => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);
                const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string; disabilityStatus?: string; };
                const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || "Unknown";
                const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || "No Disability";

                let isEtiEligible = false;
                let isFemale = false;
                let isYouth = true;

                if (learner.idNumber && learner.idNumber.length >= 13) {
                    const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
                    const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
                    const age = new Date().getFullYear() - birthYear;
                    if (age >= 18 && age <= 29) isEtiEligible = true;
                    if (age > 35) isYouth = false;
                    const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
                    if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
                } else if ((learner.demographics as any)?.genderCode === "F" || (extendedLearner as any).gender === "Female") {
                    isFemale = true;
                }

                const monthsDuration = moment(p.endDate).diff(moment(p.startDate), "months", true);
                const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

                let etiMonthlyValue = 0;
                const wage = Number(p.stipendAmount) || 0;
                if (isEtiEligible && wage > 0) {
                    if (wage < 2000) etiMonthlyValue = wage * 0.75;
                    else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
                    else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - 0.75 * (wage - 4500), 0);
                }

                const hasDisability = disability !== "No Disability" && disability !== "None" && disability !== "N/A" && disability !== "No" && disability !== "N";
                const s12hAllowanceTotal = hasDisability ? 120000 : 80000;
                const cohortId = learner.cohortId || placementRecord.cohortId;
                const safeLearnerId = String(p.learnerId || "").trim().toLowerCase();
                const safeIdNumber = String(learner.idNumber || "").trim().toLowerCase();

                let attendancePercentage = 0;
                if (cohortId) {
                    const learnerAttRecords = attendanceRecords.filter((r: any) => r.cohortId === cohortId && (String(r.learnerId).trim().toLowerCase() === safeLearnerId || String(r.learnerId).trim().toLowerCase() === safeIdNumber));
                    const learnerAttPresent = learnerAttRecords.filter((r: any) => r.status === "Present" || r.status === "Partial").length;
                    const cohortTotalSessions = attendanceLogs.filter((l: any) => l.cohortId === cohortId).length;
                    attendancePercentage = cohortTotalSessions > 0 ? Math.round((learnerAttPresent / cohortTotalSessions) * 100) : 0;
                }

                const learnerWpLogs = workplaceLogs.filter((l: any) => {
                    const logLId = String(l.learnerId || "").trim().toLowerCase();
                    return (safeLearnerId !== "" && logLId === safeLearnerId) || (safeIdNumber !== "" && logLId === safeIdNumber);
                });

                const approvedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
                    const stat = String(l.status || "").trim().toLowerCase();
                    return stat === "approved" ? sum + (Number(l.totalHours) || 0) : sum;
                }, 0);

                const pendingWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
                    const stat = String(l.status || "").trim().toLowerCase();
                    return (stat === "pending_mentor_approval" || stat === "pending") ? sum + (Number(l.totalHours) || 0) : sum;
                }, 0);

                const rejectedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
                    const stat = String(l.status || "").trim().toLowerCase();
                    return stat === "rejected" ? sum + (Number(l.totalHours) || 0) : sum;
                }, 0);

                const draftWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
                    const stat = String(l.status || "").trim().toLowerCase();
                    return (stat === "draft" || stat === "") ? sum + (Number(l.totalHours) || 0) : sum;
                }, 0);

                const currentYear = moment().year();
                const currentMonth = moment().month();
                const currentMonthStr = moment().format('YYYY-MM');
                const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, saHolidays);

                const currentMonthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr));
                const approvedDatesThisMonth = new Set(
                    currentMonthWpLogs.filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved").map((l: any) => l.dateString)
                );
                const currentMonthApprovedDays = approvedDatesThisMonth.size;

                let currentMonthEarnedStipend = wage;
                if (expectedWorkingDaysThisMonth > 0 && wage > 0) {
                    const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * wage;
                    currentMonthEarnedStipend = Math.round(Math.min(calculatedProRata, wage) * 100) / 100;
                }

                return {
                    ...p,
                    placementType: placementRecord.placementType || "QCTO Workplace Module",
                    bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || "Uncategorized",
                    compliance: {
                        isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === "boolean" ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
                        wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl,
                    },
                    learnerName: learner.fullName || "Unknown Learner",
                    idNumber: learner.idNumber || "—",
                    equityGroup: equity,
                    isFemale,
                    isYouth,
                    hasDisability,
                    mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
                    hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id),
                    isEtiEligible,
                    etiMonthlyValue,
                    projectedStipendSpend: wage * verifiedTimeline,
                    s12hAllowanceTotal,
                    attendancePercentage,
                    approvedWpHours,
                    pendingWpHours,
                    rejectedWpHours,
                    draftWpHours,
                    currentMonthApprovedDays,
                    expectedWorkingDaysThisMonth,
                    currentMonthEarnedStipend
                };
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs, saHolidays]);

    useEffect(() => {
        if (drawerPlacement) {
            const updatedMatch = enrichedPlacements.find(x => x.id === drawerPlacement.id);
            if (updatedMatch) setDrawerPlacement(updatedMatch);
        }
    }, [enrichedPlacements]);

    const complianceMetrics = useMemo<ComplianceMetricsData>(() => {
        let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
        let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
        let totalFemale = 0, totalMale = 0, absorbedFemale = 0, absorbedMale = 0;
        let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
        let mentorLoad: Record<string, number> = {};

        enrichedPlacements.forEach((p) => {
            const statusLower = p.status.toLowerCase();
            const isLive = statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview");
            const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes("absorb") || (p as any).isAbsorbed;

            if (isLive && p.hasMentor) mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;

            const eq = p.equityGroup.trim().toLowerCase();
            if (eq.includes("african") || eq === "black" || eq === "ba") { raceCounts.African++; blackACI++; if (p.isFemale) blackFemale++; }
            else if (eq.includes("coloured") || eq === "bc") { raceCounts.Coloured++; blackACI++; if (p.isFemale) blackFemale++; }
            else if (eq.includes("indian") || eq === "bi") { raceCounts.Indian++; blackACI++; if (p.isFemale) blackFemale++; }
            else if (eq.includes("white") || eq === "w") { raceCounts.White++; }
            else { raceCounts.Other++; }

            if (p.isFemale) totalFemale++; else totalMale++;
            if (p.isYouth) youthCount++;
            if (isAbsorbed) { if (p.isFemale) absorbedFemale++; else absorbedMale++; }
            if (p.hasDisability) disabilityCount++;

            if (isLive) {
                if (p.etiMonthlyValue > 0) activeEtiYielders++;
                monthlyEtiSum += p.etiMonthlyValue;
                accumulatedSpend += p.projectedStipendSpend;
            }

            if (isLive || statusLower.includes("complete") || statusLower.includes("absorb")) {
                totalS12hProjected += p.s12hAllowanceTotal;
            }
        });

        const overloadedMentors = Object.entries(mentorLoad).filter(([_, count]) => count > 4).length;

        return {
            transformationPercentage: enrichedPlacements.length > 0 ? Math.round((blackACI / enrichedPlacements.length) * 100) : 0,
            disabilityPercentage: enrichedPlacements.length > 0 ? Math.round((disabilityCount / enrichedPlacements.length) * 100) : 0,
            disabilityCount,
            youthPercentage: enrichedPlacements.length > 0 ? Math.round((youthCount / enrichedPlacements.length) * 100) : 0,
            youthCount,
            etiYieldPercentage: activeCount > 0 ? Math.round((activeEtiYielders / activeCount) * 100) : 0,
            monthlyETITotal: monthlyEtiSum,
            annualizedETIEstimate: monthlyEtiSum * 12,
            absorptionRate: completedCount > 0 ? Math.round(((absorbedFemale + absorbedMale) / completedCount) * 100) : 0,
            totalProjectedSpend: accumulatedSpend,
            totalS12hProjected,
            totalFemale,
            totalMale,
            absorbedFemale,
            absorbedMale,
            raceCounts,
            overloadedMentors,
        };
    }, [enrichedPlacements, activeCount, completedCount]);

    const formatCurrency = (val?: number | string | null) =>
        new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);

    const displayedPlacements = useMemo(() => {
        return enrichedPlacements.filter((p) => {
            const sLower = p.status.toLowerCase();
            if (activeTab === "action_required") {
                const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
                if (isAuditReady) return false;
            }
            if (activeTab === "active" && !sLower.includes("active") && !sLower.includes("pending") && !sLower.includes("interview")) return false;
            if (activeTab === "history" && !sLower.includes("complete") && !sLower.includes("terminate") && !sLower.includes("absorb")) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
            }
            return true;
        });
    }, [enrichedPlacements, activeTab, searchQuery]);

    const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

    const getExportData = () => {
        return displayedPlacements.map((p) => ({
            "Learner Name": p.learnerName,
            "ID Number": p.idNumber,
            "Race (EE Code)": p.equityGroup,
            Gender: p.isFemale ? "Female" : "Male",
            "Youth Status": p.isYouth ? "Youth (Under 35)" : "Non-Youth",
            "Disability Status": p.hasDisability ? "Yes" : "No",
            "Placement Type": p.placementType,
            "B-BBEE Category": p.bbbeeSpendCategory,
            "Monthly Stipend": Number(p.stipendAmount || 0).toFixed(2),
            "Earned This Month (Pro-Rata)": Number(p.currentMonthEarnedStipend || 0).toFixed(2),
            "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${Number(p.etiMonthlyValue).toFixed(2)}/mo)` : "No",
            "Section 12H Value": Number(p.s12hAllowanceTotal || 0).toFixed(2),
            "Campus Attendance %": `${p.attendancePercentage}%`,
            "Approved Logbook Hours": Number(p.approvedWpHours || 0).toFixed(1),
            "Pending Mentor Hours": Number(p.pendingWpHours || 0).toFixed(1),
            "Rejected Hours": Number(p.rejectedWpHours || 0).toFixed(1),
            "Draft Hours": Number(p.draftWpHours || 0).toFixed(1),
            "Start Date": p.startDate ? moment(p.startDate).format("YYYY-MM-DD") : "—",
            "Expected End Date": p.endDate ? moment(p.endDate).format("YYYY-MM-DD") : "—",
            "Assigned Mentor": p.mentorName,
            "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
            "Operational Status": p.status.toUpperCase(),
        }));
    };

    const handleExportExcel = () => {
        const data = getExportData();
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
        const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, "_");
        XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
        setShowExportMenu(false);
    };

    const handleExportCSV = () => {
        const data = getExportData();
        if (data.length === 0) return;
        const headers = Object.keys(data[0]);
        const csvRows = data.map((row) => headers.map((header) => `"${(row as Record<string, unknown>)[header]}"`).join(","));
        const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportMenu(false);
    };

    // 🚀 NEW: BULK BACKGROUND EXPORT TRIGGER
    const handleTriggerBulkExport = async () => {
        if (displayedPlacements.length === 0) return;
        setIsRequestingBulk(true);
        setShowExportMenu(false);

        try {
            const fns = getFunctions();
            const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");

            const payloadPlacements = displayedPlacements.map(p => ({
                learnerId: p.learnerId,
                placementId: p.id,
                learnerName: p.learnerName,
                idNumber: p.idNumber,
                mentorName: p.mentorName
            }));

            const response = await requestBulkAuditPacks({
                companyId: company.id,
                companyName: company.name,
                placements: payloadPlacements
            });

            const data = response.data as { success: boolean, jobId: string };
            if (data.success && data.jobId) {
                setBulkJobId(data.jobId);
            }
        } catch (error) {
            console.error("Failed to start bulk export:", error);
            alert("Failed to start bulk export process. Check console for details.");
        } finally {
            setIsRequestingBulk(false);
        }
    };

    // 🚀 NEW: FIRESTORE LISTENER FOR LIVE BULK EXPORT PROGRESS
    useEffect(() => {
        if (!bulkJobId) return;

        const unsubscribe = onSnapshot(doc(db, "compliance_jobs", bulkJobId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as any;
                setBulkJobStatus({
                    status: data.status,
                    completedTasks: data.completedTasks || 0,
                    totalTasks: data.totalTasks || 0,
                    downloadUrl: data.downloadUrl || null
                });

                // Auto-download when complete!
                if (data.status === "complete" && data.downloadUrl) {
                    window.location.href = data.downloadUrl;
                    // Keep the banner up for a few seconds so they see "Complete", then clear it
                    setTimeout(() => {
                        setBulkJobId(null);
                        setBulkJobStatus(null);
                    }, 8000);
                }
            }
        });

        return () => unsubscribe();
    }, [bulkJobId]);

    return (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "2rem" }}>
            {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
            {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}
            {drawerPlacement && <PlacementDetailsDrawer placement={drawerPlacement} companyName={company.name} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setDrawerPlacement(null)} onOpenEti={setEtiBreakdownLearner} onOpenLogs={setAuditLearner} />}

            {/* ── BREADCRUMB & HEADER ── */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                <button onClick={onBack} style={{ background: "white", border: "1px solid var(--mlab-border)", borderRadius: "8px", padding: "8px", cursor: "pointer", color: "var(--mlab-midnight)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "4px" }}>
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Host Company Profile</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <h1 style={{ margin: 0, fontSize: "1.8rem", fontFamily: "var(--font-heading)", color: "var(--mlab-midnight)", lineHeight: 1.2 }}>{company.name}</h1>
                        {isComplianceLoading && <Loader2 size={20} className="wm-spin" color="var(--mlab-blue)" />}
                        <button onClick={fetchDeepComplianceData} disabled={isComplianceLoading} style={{ background: "var(--mlab-blue)", color: "white", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", marginLeft: "1rem" }}>
                            <RefreshCw size={12} className={isComplianceLoading ? "wm-spin" : ""} /> Sync Database
                        </button>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", fontSize: "0.85rem", color: "#475569" }}>
                        {company.registrationNumber && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Hash size={13} /> {company.registrationNumber}</span>}
                        {company.physicalAddress && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={13} /> {company.physicalAddress}</span>}
                        {company.contactPerson && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Mail size={13} /> {company.contactEmail}</span>}
                    </div>
                </div>
            </div>

            {complianceMetrics.overloadedMentors > 0 && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", color: "#991b1b", fontSize: "0.8rem", fontWeight: 600 }}>
                    <ShieldAlert size={16} />
                    <span><strong>SETA Quality Warning:</strong> {complianceMetrics.overloadedMentors} assigned mentor(s) currently exceed the recommended 1:4 supervisor-to-learner load constraint.</span>
                </div>
            )}

            <div className="cdp-stat-row">
                <div className="cdp-stat-card cdp-stat-card--blue">
                    <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
                    <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Interns</span></div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--green">
                    <div className="cdp-stat-card__icon"><Award size={20} /></div>
                    <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{completedCount}</span><span className="cdp-stat-card__label">Completed Programs</span></div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--amber">
                    <div className="cdp-stat-card__icon"><FileText size={20} /></div>
                    <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit" }}>{missingContracts}</span><span className="cdp-stat-card__label">Missing Contracts</span></div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--grey">
                    <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
                    <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? "var(--mlab-red)" : "inherit" }}>{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Terminated</span></div>
                </div>
            </div>

            <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />

            <div className="cdp-panel">
                <div className="vp-card" style={{ marginBottom: 0 }}>
                    <div className="vp-card-header" style={{ borderBottom: "none", flexDirection: "row", display: "flex", justifyContent: "space-between", paddingBottom: 0 }}>
                        <div className="vp-card-title-group">
                            <Users size={18} color="var(--mlab-blue)" />
                            <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--mlab-blue)", textTransform: "uppercase" }}>Placement Ledger</h3>
                        </div>
                        <div>
                            <BulkStipendUploader
                                placements={displayedPlacements}
                                saHolidays={saHolidays}
                                onSuccess={() => { fetchDeepComplianceData(); }}
                            />
                        </div>
                    </div>

                    {/* 🚀 LIVE PROGRESS BANNER FOR BULK EXPORT */}
                    {bulkJobStatus && (
                        <div style={{ margin: "1rem 1.5rem 0", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }} className="animate-fade-in">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--mlab-blue)", fontWeight: 700, fontSize: "0.85rem" }}>
                                    {bulkJobStatus.status === "processing" ? <Loader2 size={16} className="wm-spin" /> : <Archive size={16} color="#16a34a" />}
                                    {bulkJobStatus.status === "processing" ? "Compiling Bulk Audit Packs..." : bulkJobStatus.status === "zipping" ? "Merging Cloud Stream..." : "Download Ready!"}
                                </div>
                                <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>
                                    {bulkJobStatus.completedTasks} / {bulkJobStatus.totalTasks} Processed
                                </div>
                            </div>

                            <div style={{ width: "100%", background: "#e0f2fe", height: "10px", borderRadius: "5px", overflow: "hidden" }}>
                                <div style={{
                                    width: `${bulkJobStatus.totalTasks > 0 ? (bulkJobStatus.completedTasks / bulkJobStatus.totalTasks) * 100 : 0}%`,
                                    background: bulkJobStatus.status === "complete" ? "#16a34a" : "var(--mlab-blue)",
                                    height: "100%",
                                    transition: "width 0.3s ease-out"
                                }} />
                            </div>

                            {bulkJobStatus.status === "complete" && bulkJobStatus.downloadUrl && (
                                <a href={bulkJobStatus.downloadUrl} style={{ background: "#16a34a", color: "white", padding: "8px", borderRadius: "6px", textDecoration: "none", fontSize: "0.8rem", fontWeight: 700, textAlign: "center", marginTop: "8px", display: "inline-block" }}>
                                    Click here if your download doesn't start automatically
                                </a>
                            )}
                        </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 1.5rem", borderBottom: "1px solid var(--mlab-border)", marginTop: "1rem", background: "#f8fafc", flexWrap: "wrap", gap: "1rem" }}>
                        <div style={{ display: "flex", gap: "1.5rem" }}>
                            <button onClick={() => setActiveTab("active")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "active" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "active" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "active" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
                                Active Interns <span style={{ background: activeTab === "active" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "active" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{activeCount}</span>
                            </button>

                            <button onClick={() => setActiveTab("action_required")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "action_required" ? "#b91c1c" : "#64748b", fontWeight: activeTab === "action_required" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "action_required" ? "2px solid #b91c1c" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
                                Action Required <span style={{ background: activeTab === "action_required" ? "#fee2e2" : "#f1f5f9", color: activeTab === "action_required" ? "#b91c1c" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{nonCompliantCount}</span>
                            </button>

                            <button onClick={() => setActiveTab("history")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "history" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "history" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "history" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
                                History <span style={{ background: activeTab === "history" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "history" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{completedCount + droppedCount}</span>
                            </button>
                            <button onClick={() => setActiveTab("all")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "all" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "all" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "all" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
                                All Records <span style={{ background: activeTab === "all" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "all" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{enrichedPlacements.length}</span>
                            </button>
                        </div>

                        <div style={{ display: "flex", gap: "8px", paddingBottom: "8px" }}>
                            <div style={{ position: "relative", display: "flex", alignItems: "center", background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "0 8px" }}>
                                <Search size={14} color="#64748b" />
                                <input type="text" placeholder="Search ledger..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: "none", padding: "8px", outline: "none", background: "transparent", fontSize: "0.8rem", width: "200px" }} />
                                {searchQuery && <button type="button" onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex" }}><X size={12} /></button>}
                            </div>

                            <div style={{ position: "relative" }} ref={menuRef}>
                                <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={displayedPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: "white", fontSize: "0.8rem", padding: "6px 12px", opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? "not-allowed" : "pointer" }}>
                                    <DownloadCloud size={14} /> Export
                                </button>
                                {showExportMenu && displayedPlacements.length > 0 && (
                                    <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 50, minWidth: "220px", overflow: "hidden" }} className="animate-fade-in">
                                        <button type="button" onClick={handleExportCSV} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download Data as CSV</button>
                                        <button type="button" onClick={handleExportExcel} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download Data as Excel</button>
                                        {/* 🚀 NEW BULK EXPORT BUTTON IN THE DROPDOWN */}
                                        <button
                                            type="button"
                                            onClick={handleTriggerBulkExport}
                                            disabled={isRequestingBulk || !!bulkJobId}
                                            style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "#f8fafc", border: "none", cursor: (isRequestingBulk || !!bulkJobId) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 600, opacity: (isRequestingBulk || !!bulkJobId) ? 0.5 : 1 }}
                                        >
                                            <Archive size={14} color="#073f4e" />
                                            {isRequestingBulk ? "Starting Job..." : "Generate Bulk SETA Pack (.zip)"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mlab-table-wrap">
                        {isComplianceLoading && <div style={{ padding: "1rem", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} className="wm-spin" /> Verifying deep compliance logs...</div>}

                        <table className="mlab-table">
                            <colgroup>
                                <col style={{ width: "20%" }} />
                                <col style={{ width: "20%" }} />
                                <col style={{ width: "15%" }} />
                                <col style={{ width: "15%" }} />
                                <col style={{ width: "20%" }} />
                                <col style={{ width: "10%" }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Learner Profile</th>
                                    <th>Placement Scope</th>
                                    <th>Assigned Mentor</th>
                                    <th>Status</th>
                                    <th>Compliance</th>
                                    <th style={{ textAlign: "right" }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedPlacements.length > 0 ? (
                                    displayedPlacements.map((p) => {
                                        const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
                                        return (
                                            <tr key={p.id}>
                                                <td>
                                                    <div className="cdp-learner-cell">
                                                        <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
                                                        <div className="cdp-learner-cell__info">
                                                            <span className="cdp-learner-cell__name">{p.learnerName}</span>
                                                            <span className="cdp-learner-cell__id">{p.idNumber}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 500 }}>
                                                        {formatDate(p.startDate)} <span style={{ color: "#94a3b8", margin: "0 4px" }}>→</span> {formatDate(p.endDate)}
                                                    </div>
                                                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>{p.placementType}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: "0.8rem", color: p.hasMentor ? "var(--mlab-midnight)" : "#dc2626", fontWeight: p.hasMentor ? 500 : 700, display: "flex", alignItems: "center", gap: "4px" }}>
                                                        {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> Unassigned</>}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`cdp-status-badge ${p.status.toLowerCase().includes("active") ? "cdp-status-badge--active" : p.status.toLowerCase().includes("terminate") ? "cdp-status-badge--dropped" : ""}`} style={p.status.toLowerCase().includes("pending") ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" } : p.status.toLowerCase().includes("complete") || p.status.toLowerCase().includes("absorb") ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } : {}}>
                                                        {p.status.replace("_", " ")}
                                                    </span>
                                                </td>
                                                <td>
                                                    {isAuditReady ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#15803d', fontSize: '0.7rem', fontWeight: 700 }}>
                                                            <ShieldCheck size={12} /> Audit Ready
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontSize: '0.7rem', fontWeight: 700 }}>
                                                                <AlertTriangle size={12} /> Non-Compliant
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: "right" }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDrawerPlacement(p)}
                                                        style={{
                                                            background: "white", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
                                                            color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px", transition: "all 0.2s"
                                                        }}
                                                    >
                                                        View <ChevronRight size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
                                            {searchQuery ? `No records matched your search query for "${searchQuery}".` : `No placement history matches found for this host company configuration.`}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};