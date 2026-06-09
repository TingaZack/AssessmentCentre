// src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

import React, { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import {
    ArrowLeft, MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, AlertCircle, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
    ShieldCheck, ChevronRight, Activity, RefreshCw
} from "lucide-react";
import moment from "moment";
import * as XLSX from "xlsx";

// Modularized components
import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
import { LogbookAuditModal } from "./LogbookAuditModal";
import type { DashboardLearner, Employer, PlacementContract } from "../../../../types";
import { useStore, type StaffMember } from "../../../../store/useStore";

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
    // 🚀 DAILY PAYROLL VARIABLES
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

// 🚀 HELPER: Calculate expected standard working days for SA (excluding weekends & 2026 public holidays)
const getSAWorkingDaysInMonth = (year: number, month: number) => {
    const start = moment([year, month, 1]);
    const end = moment(start).endOf('month');
    let days = 0;
    
    // South African 2026 Public Holidays Array
    const holidays = [
        '2026-01-01', '2026-03-21', '2026-04-03', '2026-04-06', '2026-04-27', 
        '2026-05-01', '2026-06-16', '2026-08-09', '2026-08-10', '2026-09-24', 
        '2026-12-16', '2026-12-25', '2026-12-26'
    ];

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
const EtiBreakdownModal: React.FC<{
    learner: EnrichedPlacement;
    onClose: () => void;
}> = ({ learner, onClose }) => {
    const formatCurrency = (val: any) =>
        new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);

    const wage = Number(learner.stipendAmount) || 0;
    const eti = Number(learner.etiMonthlyValue) || 0;
    const annualEti = eti * 12;

    let mathString = "";
    if (wage < 2000) {
        mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
    } else if (wage >= 2000 && wage <= 4499) {
        mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
    } else if (wage >= 4500 && wage < 6500) {
        mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
    } else {
        mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;
    }

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
const PlacementDetailsDrawer: React.FC<{
    placement: EnrichedPlacement;
    onClose: () => void;
    onOpenEti: (p: EnrichedPlacement) => void;
    onOpenLogs: (p: EnrichedPlacement) => void;
}> = ({ placement, onClose, onOpenEti, onOpenLogs }) => {
    const formatCurrency = (val: any) => 
        new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
    
    const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

    const isAuditReady = placement.hasMentor && placement.compliance.isAgreementFullyExecuted;
    const missingItems = [];
    if (!placement.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
    if (!placement.hasMentor) missingItems.push("Workplace Mentor");

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99990, display: "flex", justifyContent: "flex-end" }}>
            <div 
                onClick={(e) => e.stopPropagation()} 
                style={{ width: "450px", maxWidth: "100%", height: "100%", background: "#f8fafc", display: "flex", flexDirection: "column", boxShadow: "-10px 0 25px rgba(0,0,0,0.1)", animation: "slideInRight 0.3s ease-out" }}
            >
                <div style={{ padding: "1.5rem", background: "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <div className="cdp-learner-avatar">{placement.learnerName.charAt(0)}</div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>{placement.learnerName}</h3>
                                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>ID: {placement.idNumber}</p>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}><X size={20} /></button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    
                    <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} /> Master Audit Status</h4>
                        {isAuditReady ? (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: '#15803d', fontSize: '0.85rem', fontWeight: 700 }}>
                                <CheckCircle size={18} /> Ready for SETA/SARS Verification
                            </div>
                        ) : (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
                                    <AlertTriangle size={18} /> Non-Compliant Risks Detected
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {missingItems.map(m => (
                                        <div key={m} style={{ fontSize: '0.75rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}><X size={12}/> Missing {m}</div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Briefcase size={14} /> Placement Trajectory</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                            <div>
                                <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Start Date</div>
                                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.startDate)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Expected End</div>
                                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.endDate)}</div>
                            </div>
                            <div style={{ gridColumn: "1 / -1", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}>
                                <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "4px" }}>Workplace Supervisor</div>
                                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: placement.hasMentor ? "var(--mlab-midnight)" : "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>
                                    {placement.hasMentor ? <><User size={14} /> {placement.mentorName}</> : <><AlertTriangle size={14} /> Unassigned</>}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Landmark size={14} /> Finance & Contracts</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "0.8rem", color: "#475569" }}>Monthly Base Stipend</span>
                                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-midnight)", textDecoration: placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) ? 'line-through' : 'none' }}>
                                    {formatCurrency(placement.stipendAmount)} /mo
                                </span>
                            </div>

                            {/* 🚀 PAYROLL DEDUCTION WARNING */}
                            {placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) && (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: "6px" }}>
                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                        <span style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700 }}>EARNED THIS MONTH</span>
                                        <span style={{ fontSize: "0.65rem", color: "#991b1b" }}>Based on {placement.currentMonthApprovedDays} / {placement.expectedWorkingDaysThisMonth} expected days</span>
                                    </div>
                                    <span style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626" }}>{formatCurrency(placement.currentMonthEarnedStipend)}</span>
                                </div>
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}>
                                <span style={{ fontSize: "0.8rem", color: "#475569" }}>SARS ETI Claim</span>
                                {placement.isEtiEligible && placement.etiMonthlyValue > 0 ? (
                                    <button onClick={() => onOpenEti(placement)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", color: "#166534", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                                        <Coins size={12} /> {formatCurrency(placement.etiMonthlyValue)} /mo
                                    </button>
                                ) : (
                                    <span style={{ fontSize: "0.75rem", color: "#64748b", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>Ineligible</span>
                                )}
                            </div>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}>
                                <span style={{ fontSize: "0.8rem", color: "#475569" }}>WBLPA Contract</span>
                                {placement.compliance.isAgreementFullyExecuted ? (
                                    placement.compliance.wblpaAgreementUrl ? (
                                        <a href={placement.compliance.wblpaAgreementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#166534", background: "#dcfce7", padding: "4px 8px", borderRadius: "4px", border: "1px solid #bbf7d0", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}>
                                            <FileText size={12} /> View Document
                                        </a>
                                    ) : (
                                        <span style={{ fontSize: "0.75rem", color: "#166534", background: "#dcfce7", padding: "4px 8px", borderRadius: "4px", border: "1px solid #bbf7d0", fontWeight: 700 }}>Signed (No Link)</span>
                                    )
                                ) : (
                                    <span style={{ fontSize: "0.75rem", color: "#dc2626", background: "#fef2f2", padding: "4px 8px", borderRadius: "4px", border: "1px solid #fecaca", fontWeight: 700 }}>Not Uploaded</span>
                                )}
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
                                <div>
                                    <div style={{ fontSize: "0.7rem", color: "#16a34a", fontWeight: 700 }}>✅ MENTOR APPROVED HOURS</div>
                                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#15803d" }}>{Number(placement.approvedWpHours || 0).toFixed(1)} <span style={{fontSize: '0.75rem', fontWeight: 500}}>hrs</span></div>
                                </div>
                                <div>
                                    <div style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 700 }}>⏳ WAITING FOR MENTOR</div>
                                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#b45309" }}>{Number(placement.pendingWpHours || 0).toFixed(1)} <span style={{fontSize: '0.75rem', fontWeight: 500}}>hrs</span></div>
                                </div>
                                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                                    <div style={{ fontSize: "0.7rem", color: "#dc2626", fontWeight: 700 }}>❌ REJECTED LOGS</div>
                                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c2410c" }}>{Number(placement.rejectedWpHours || 0).toFixed(1)} <span style={{fontSize: '0.75rem', fontWeight: 500}}>hrs</span></div>
                                </div>
                                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                                    <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>📝 DRAFT (NOT SUBMITTED)</div>
                                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#475569" }}>{Number(placement.draftWpHours || 0).toFixed(1)} <span style={{fontSize: '0.75rem', fontWeight: 500}}>hrs</span></div>
                                </div>
                            </div>

                            <button onClick={() => onOpenLogs(placement)} style={{ width: "100%", padding: "10px", background: "white", border: "1px solid var(--mlab-blue)", color: "var(--mlab-blue)", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.background = "#eff6ff"; }} onMouseOut={(e) => { e.currentTarget.style.background = "white"; }}>
                                <FileText size={16} /> Open Complete Logbook Audit
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{__html:`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}}/>
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

    const [activeTab, setActiveTab] = useState<"active" | "history" | "all" | "action_required">("active");
    const [searchQuery, setSearchQuery] = useState("");
    const [showExportMenu, setShowExportMenu] = useState(false);
    
    const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);
    const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(null);
    const [drawerPlacement, setDrawerPlacement] = useState<EnrichedPlacement | null>(null);

    const menuRef = useRef<HTMLDivElement>(null);

    const companyPlacements = useMemo(() => placements.filter((p) => p.employerId === company.id), [placements, company.id]);
    const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

    const placementLearnerIdsStr = useMemo(() => companyPlacements.map(p => p.learnerId).sort().join(","), [companyPlacements]);

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

                // ALL-TIME HOURS TALLIES
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

                // 🚀 STIPEND PRO-RATA CALCULATION ENGINE (DAILY BASIS)
                const currentYear = moment().year();
                const currentMonth = moment().month(); // 0-indexed
                const currentMonthStr = moment().format('YYYY-MM');

                const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth);

                const currentMonthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr));
                
                // Track UNIQUE dates worked to prevent multi-log duplication
                const approvedDatesThisMonth = new Set(
                    currentMonthWpLogs
                        .filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved")
                        .map((l: any) => l.dateString)
                );
                const currentMonthApprovedDays = approvedDatesThisMonth.size;

                let currentMonthEarnedStipend = wage; // Default to full pay
                if (expectedWorkingDaysThisMonth > 0 && wage > 0) {
                    const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * wage;
                    // Cap at base wage (no overtime stipend padding automatically unless explicitly built for overtime)
                    currentMonthEarnedStipend = Math.min(calculatedProRata, wage); 
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
    }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs]);

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
            "Monthly Stipend": p.stipendAmount || 0,
            "Earned This Month (Pro-Rata)": p.currentMonthEarnedStipend || 0,
            "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
            "Section 12H Value": p.s12hAllowanceTotal,
            "Campus Attendance %": `${p.attendancePercentage}%`,
            "Approved Logbook Hours": p.approvedWpHours,
            "Pending Mentor Hours": p.pendingWpHours,
            "Rejected Hours": p.rejectedWpHours,
            "Draft Hours": p.draftWpHours,
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

    return (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "2rem" }}>
            
            {/* ACTION MODALS */}
            {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
            {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}
            {drawerPlacement && <PlacementDetailsDrawer placement={drawerPlacement} onClose={() => setDrawerPlacement(null)} onOpenEti={setEtiBreakdownLearner} onOpenLogs={setAuditLearner} />}

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

            {/* ── ALERTS SECTION FOR QUALITY SIGNALS ── */}
            {complianceMetrics.overloadedMentors > 0 && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", color: "#991b1b", fontSize: "0.8rem", fontWeight: 600 }}>
                    <ShieldAlert size={16} />
                    <span><strong>SETA Quality Warning:</strong> {complianceMetrics.overloadedMentors} assigned mentor(s) currently exceed the recommended 1:4 supervisor-to-learner load constraint.</span>
                </div>
            )}

            {/* ── OPERATIONAL KPI RIBBON ── */}
            <div className="cdp-stat-row">
                <div className="cdp-stat-card cdp-stat-card--blue">
                    <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{activeCount}</span>
                        <span className="cdp-stat-card__label">Active Interns</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--green">
                    <div className="cdp-stat-card__icon"><Award size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{completedCount}</span>
                        <span className="cdp-stat-card__label">Completed Programs</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--amber">
                    <div className="cdp-stat-card__icon"><FileText size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit" }}>{missingContracts}</span>
                        <span className="cdp-stat-card__label">Missing Contracts</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--grey">
                    <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? "var(--mlab-red)" : "inherit" }}>{droppedCount}</span>
                        <span className="cdp-stat-card__label">Dropped / Terminated</span>
                    </div>
                </div>
            </div>

            {/* ── IMPORTED MODULAR COMPLIANCE GRID ── */}
            <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />

            {/* ── PLACEMENT LEDGER DATA GRID ── */}
            <div className="cdp-panel">
                <div className="vp-card" style={{ marginBottom: 0 }}>
                    <div className="vp-card-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
                        <div className="vp-card-title-group">
                            <Users size={18} color="var(--mlab-blue)" />
                            <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--mlab-blue)", textTransform: "uppercase" }}>Placement Ledger</h3>
                        </div>
                    </div>

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
                                    <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 50, minWidth: "180px", overflow: "hidden" }} className="animate-fade-in">
                                        <button type="button" onClick={handleExportCSV} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download as CSV</button>
                                        <button type="button" onClick={handleExportExcel} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)</button>
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
                                                        background: "white", 
                                                        border: "1px solid #cbd5e1", 
                                                        padding: "6px 12px", 
                                                        borderRadius: "6px", 
                                                        cursor: "pointer", 
                                                        color: "var(--mlab-blue)", 
                                                        fontSize: "0.75rem", 
                                                        fontWeight: 600, 
                                                        display: "inline-flex", 
                                                        alignItems: "center", 
                                                        gap: "6px",
                                                        transition: "all 0.2s"
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



// // src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

// import React, { useMemo, useState, useRef, useEffect } from "react";
// import { createPortal } from "react-dom";
// import { collection, query, where, getDocs } from "firebase/firestore";
// import {
//     ArrowLeft, MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, AlertCircle, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
//     ShieldCheck
// } from "lucide-react";
// import moment from "moment";
// import * as XLSX from "xlsx";

// // Import our newly modularized components!
// import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
// import { LogbookAuditModal } from "./LogbookAuditModal";
// import type { DashboardLearner, Employer, PlacementContract } from "../../../../types";
// import { useStore, type StaffMember } from "../../../../store/useStore";
// import { db } from "../../../../lib/firebase";

// export interface CompanyInsightsViewProps {
//     company: Employer;
//     onBack: () => void;
// }

// export interface EnrichedPlacement extends PlacementContract {
//     placementType: string;
//     bbbeeSpendCategory: string;
//     compliance: {
//         isAgreementFullyExecuted: boolean;
//         wblpaAgreementUrl?: string;
//     };
//     learnerName: string;
//     idNumber: string;
//     equityGroup: string;
//     hasDisability: boolean;
//     isFemale: boolean;
//     isYouth: boolean;
//     mentorName: string;
//     hasMentor: boolean;
//     isEtiEligible: boolean;
//     etiMonthlyValue: number;
//     projectedStipendSpend: number;
//     s12hAllowanceTotal: number;
//     attendancePercentage: number;
//     approvedWpHours: number;
//     pendingWpHours: number;
// }

// /* ─── ETI BREAKDOWN MODAL ─── */
// const EtiBreakdownModal: React.FC<{
//     learner: EnrichedPlacement;
//     onClose: () => void;
// }> = ({ learner, onClose }) => {
//     const formatCurrency = (val: number) =>
//         new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(val);

//     const wage = Number(learner.stipendAmount) || 0;
//     const eti = learner.etiMonthlyValue;
//     const annualEti = eti * 12;

//     let mathString = "";
//     if (wage < 2000) {
//         mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
//     } else if (wage >= 2000 && wage <= 4499) {
//         mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
//     } else if (wage >= 4500 && wage < 6500) {
//         mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
//     } else {
//         mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;
//     }

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}>
//             <div className="wm-modal" onClick={(e) => e.stopPropagation()} style={{ width: "480px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
//                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
//                     <div>
//                         <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#16a34a", fontWeight: 800, fontSize: "1.1rem" }}><Landmark size={20} /> SARS ETI Tax Rebate Audit</div>
//                         <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>Calculated for {learner.learnerName}</div>
//                     </div>
//                     <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
//                 </div>

//                 <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
//                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
//                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Database Stipend Value:</span>
//                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(wage)}</strong>
//                     </div>
//                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
//                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Official ETI Calculation:</span>
//                         <strong style={{ fontSize: "1.1rem", color: "#16a34a" }}>{formatCurrency(eti)} /mo</strong>
//                     </div>
//                     <div style={{ display: "flex", justifyContent: "space-between" }}>
//                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Annualized Projection:</span>
//                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(annualEti)}</strong>
//                     </div>
//                 </div>

//                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>Mathematical Formula Check:</div>
//                 <div style={{ background: "#e0e7ff", padding: "12px", borderRadius: "6px", fontSize: "0.85rem", color: "#3730a3", fontFamily: "monospace", fontWeight: 600, marginBottom: "1rem" }}>{mathString}</div>

//                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>The SARS Rules (Ages 18-29):</div>
//                 <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem", color: "#475569", display: "flex", flexDirection: "column", gap: "6px" }}>
//                     <li style={{ color: wage > 0 && wage < 2000 ? "#16a34a" : "inherit", fontWeight: wage > 0 && wage < 2000 ? 700 : 400 }}>If stipend is R0 – R1,999: ETI = 75% of stipend</li>
//                     <li style={{ color: wage >= 2000 && wage <= 4499 ? "#16a34a" : "inherit", fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400 }}>If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)</li>
//                     <li style={{ color: wage >= 4500 && wage < 6500 ? "#16a34a" : "inherit", fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400 }}>If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend - R4,500])</li>
//                     <li style={{ color: wage >= 6500 ? "#dc2626" : "inherit", fontWeight: wage >= 6500 ? 700 : 400 }}>If stipend is R6,500 or more: ETI = R0</li>
//                 </ul>

//                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: "100%", marginTop: "1.5rem", justifyContent: "center" }}>Close Audit Trail</button>
//             </div>
//         </div>,
//         document.body
//     );
// };

// export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
//     const { learners, staff } = useStore() as any;
//     const placements = useStore((s) => (s as unknown as { placements?: PlacementContract[] }).placements) || [];

//     const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
//     const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
//     const [workplaceLogs, setWorkplaceLogs] = useState<any[]>([]);
//     const [isComplianceLoading, setIsComplianceLoading] = useState(true);

//     const [activeTab, setActiveTab] = useState<"active" | "history" | "all">("active");
//     const [searchQuery, setSearchQuery] = useState("");
//     const [showExportMenu, setShowExportMenu] = useState(false);
    
//     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);
//     const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(null);

//     const menuRef = useRef<HTMLDivElement>(null);

//     const companyPlacements = useMemo(() => placements.filter((p) => p.employerId === company.id), [placements, company.id]);
//     const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

//     useEffect(() => {
//         const fetchDeepComplianceData = async () => {
//             if (companyPlacements.length === 0) {
//                 setIsComplianceLoading(false);
//                 return;
//             }

//             setIsComplianceLoading(true);
//             try {
//                 const wpQuery = query(collection(db, "workplace_logs"), where("employerId", "==", company.id));
//                 const wpSnap = await getDocs(wpQuery);
//                 const fetchedWpLogs = wpSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
//                 setWorkplaceLogs(fetchedWpLogs);

//                 const relevantCohortIds = new Set<string>();
//                 companyPlacements.forEach((p) => {
//                     const l = learners.find((x: any) => x.id === p.learnerId);
//                     if (p.cohortId) relevantCohortIds.add(p.cohortId);
//                     if (l && l.cohortId) relevantCohortIds.add(l.cohortId);
//                 });

//                 const cohortIdsArray = Array.from(relevantCohortIds);
//                 let fetchedAttLogs: any[] = [];
//                 let fetchedAttRecords: any[] = [];

//                 for (const cId of cohortIdsArray) {
//                     if (!cId) continue;
//                     const logsQ = query(collection(db, "attendance_logs"), where("cohortId", "==", cId));
//                     const recsQ = query(collection(db, "attendance_records"), where("cohortId", "==", cId));
//                     const [lSnap, rSnap] = await Promise.all([getDocs(logsQ), getDocs(recsQ)]);

//                     fetchedAttLogs.push(...lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
//                     fetchedAttRecords.push(...rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
//                 }

//                 setAttendanceLogs(fetchedAttLogs);
//                 setAttendanceRecords(fetchedAttRecords);
//             } catch (error) {
//                 console.error("Deep compliance fetch error:", error);
//             } finally {
//                 setIsComplianceLoading(false);
//             }
//         };

//         fetchDeepComplianceData();
//     }, [companyPlacements.length, company.id, learners]);

//     useEffect(() => {
//         const handleClickOutside = (event: MouseEvent) => {
//             if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowExportMenu(false);
//         };
//         document.addEventListener("mousedown", handleClickOutside);
//         return () => document.removeEventListener("mousedown", handleClickOutside);
//     }, []);

//     const { activeCount, completedCount, droppedCount, missingContracts } = useMemo(() => {
//         let active = 0, completed = 0, dropped = 0, missing = 0;

//         companyPlacements.forEach((p) => {
//             const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean } };
//             const statusLower = p.status.toLowerCase();

//             if (statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview")) {
//                 active++;
//                 const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
//                 if (!isFullySigned) missing++;
//             }
//             if (p.status === "Completed" || p.status === "absorbed_permanently") completed++;
//             if (p.status === "Terminated") dropped++;
//         });
//         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing };
//     }, [companyPlacements]);

//     const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
//         return companyPlacements
//             .map((p) => {
//                 const learner = learners.find((l: any) => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
//                 const placementRecord = p as PlacementContract & {
//                     placementType?: string;
//                     compliance?: { isAgreementFullyExecuted?: boolean; wblpaAgreementUrl?: string; bbbeeSpendCategory?: string; };
//                     bbbeeSpendCategory?: string;
//                     mentorId?: string;
//                     cohortId?: string;
//                 };

//                 const mentor = companyMentors.find((m: any) => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);

//                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string; disabilityStatus?: string; };
//                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || "Unknown";
//                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || "No Disability";

//                 let isEtiEligible = false;
//                 let isFemale = false;
//                 let isYouth = true;

//                 if (learner.idNumber && learner.idNumber.length >= 13) {
//                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
//                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
//                     const age = new Date().getFullYear() - birthYear;

//                     if (age >= 18 && age <= 29) isEtiEligible = true;
//                     if (age > 35) isYouth = false;

//                     const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
//                     if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
//                 } else if ((learner.demographics as any)?.genderCode === "F" || (extendedLearner as any).gender === "Female") {
//                     isFemale = true;
//                 }

//                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), "months", true);
//                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

//                 let etiMonthlyValue = 0;
//                 const wage = Number(p.stipendAmount) || 0;

//                 if (isEtiEligible && wage > 0) {
//                     if (wage < 2000) etiMonthlyValue = wage * 0.75;
//                     else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
//                     else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - 0.75 * (wage - 4500), 0);
//                 }

//                 const hasDisability = disability !== "No Disability" && disability !== "None" && disability !== "N/A" && disability !== "No" && disability !== "N";
//                 const s12hAllowanceTotal = hasDisability ? 120000 : 80000;

//                 const cohortId = learner.cohortId || placementRecord.cohortId;
//                 const safeLearnerId = p.learnerId;
//                 const safeIdNumber = learner.idNumber || "";

//                 let attendancePercentage = 0;
//                 if (cohortId) {
//                     const learnerAttRecords = attendanceRecords.filter((r: any) => r.cohortId === cohortId && (r.learnerId === safeLearnerId || r.learnerId === safeIdNumber));
//                     const learnerAttPresent = learnerAttRecords.filter((r: any) => r.status === "Present" || r.status === "Partial").length;
//                     const cohortTotalSessions = attendanceLogs.filter((l: any) => l.cohortId === cohortId).length;
//                     attendancePercentage = cohortTotalSessions > 0 ? Math.round((learnerAttPresent / cohortTotalSessions) * 100) : 0;
//                 }

//                 const learnerWpLogs = workplaceLogs.filter((l: any) => l.learnerId === safeLearnerId || l.learnerId === safeIdNumber);
//                 const approvedWpHours = learnerWpLogs.filter((l: any) => l.status === "Approved").reduce((sum: number, l: any) => sum + (Number(l.totalHours) || 0), 0);
//                 const pendingWpHours = learnerWpLogs.filter((l: any) => l.status === "Pending_Mentor_Approval").reduce((sum: number, l: any) => sum + (Number(l.totalHours) || 0), 0);

//                 return {
//                     ...p,
//                     placementType: placementRecord.placementType || "QCTO Workplace Module",
//                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || "Uncategorized",
//                     compliance: {
//                         isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === "boolean" ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
//                         wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl,
//                     },
//                     learnerName: learner.fullName || "Unknown Learner",
//                     idNumber: learner.idNumber || "—",
//                     equityGroup: equity,
//                     isFemale,
//                     isYouth,
//                     hasDisability,
//                     mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
//                     hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id),
//                     isEtiEligible,
//                     etiMonthlyValue,
//                     projectedStipendSpend: wage * verifiedTimeline,
//                     s12hAllowanceTotal,
//                     attendancePercentage,
//                     approvedWpHours,
//                     pendingWpHours,
//                 };
//             })
//             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
//     }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs]);

//     const complianceMetrics = useMemo(() => {
//         let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
//         let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
//         let totalFemale = 0, totalMale = 0, absorbedFemale = 0, absorbedMale = 0;
//         let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
//         let mentorLoad: Record<string, number> = {};

//         enrichedPlacements.forEach((p) => {
//             const statusLower = p.status.toLowerCase();
//             const isLive = statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview");
//             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes("absorb") || (p as any).isAbsorbed;

//             if (isLive && p.hasMentor) mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;

//             const eq = p.equityGroup.trim().toLowerCase();
//             if (eq.includes("african") || eq === "black" || eq === "ba") { raceCounts.African++; blackACI++; if (p.isFemale) blackFemale++; }
//             else if (eq.includes("coloured") || eq === "bc") { raceCounts.Coloured++; blackACI++; if (p.isFemale) blackFemale++; }
//             else if (eq.includes("indian") || eq === "bi") { raceCounts.Indian++; blackACI++; if (p.isFemale) blackFemale++; }
//             else if (eq.includes("white") || eq === "w") { raceCounts.White++; }
//             else { raceCounts.Other++; }

//             if (p.isFemale) totalFemale++; else totalMale++;
//             if (p.isYouth) youthCount++;
//             if (isAbsorbed) { if (p.isFemale) absorbedFemale++; else absorbedMale++; }
//             if (p.hasDisability) disabilityCount++;

//             if (isLive) {
//                 if (p.etiMonthlyValue > 0) activeEtiYielders++;
//                 monthlyEtiSum += p.etiMonthlyValue;
//                 accumulatedSpend += p.projectedStipendSpend;
//             }

//             if (isLive || statusLower.includes("complete") || statusLower.includes("absorb")) {
//                 totalS12hProjected += p.s12hAllowanceTotal;
//             }
//         });

//         const overloadedMentors = Object.entries(mentorLoad).filter(([_, count]) => count > 4).length;

//         return {
//             transformationPercentage: enrichedPlacements.length > 0 ? Math.round((blackACI / enrichedPlacements.length) * 100) : 0,
//             disabilityPercentage: enrichedPlacements.length > 0 ? Math.round((disabilityCount / enrichedPlacements.length) * 100) : 0,
//             disabilityCount,
//             youthPercentage: enrichedPlacements.length > 0 ? Math.round((youthCount / enrichedPlacements.length) * 100) : 0,
//             youthCount,
//             etiYieldPercentage: activeCount > 0 ? Math.round((activeEtiYielders / activeCount) * 100) : 0,
//             monthlyETITotal: monthlyEtiSum,
//             annualizedETIEstimate: monthlyEtiSum * 12,
//             absorptionRate: completedCount > 0 ? Math.round(((absorbedFemale + absorbedMale) / completedCount) * 100) : 0,
//             totalProjectedSpend: accumulatedSpend,
//             totalS12hProjected,
//             totalFemale,
//             totalMale,
//             absorbedFemale,
//             absorbedMale,
//             raceCounts,
//             overloadedMentors,
//         };
//     }, [enrichedPlacements, activeCount, completedCount]);

//     const formatCurrency = (val: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(val);

//     const displayedPlacements = useMemo(() => {
//         return enrichedPlacements.filter((p) => {
//             const sLower = p.status.toLowerCase();
//             if (activeTab === "active" && !sLower.includes("active") && !sLower.includes("pending") && !sLower.includes("interview")) return false;
//             if (activeTab === "history" && !sLower.includes("complete") && !sLower.includes("terminate") && !sLower.includes("absorb")) return false;
//             if (searchQuery) {
//                 const q = searchQuery.toLowerCase();
//                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
//             }
//             return true;
//         });
//     }, [enrichedPlacements, activeTab, searchQuery]);

//     const formatDate = (dateStr: string) => moment(dateStr).format("DD MMM YYYY");

//     const getExportData = () => {
//         return displayedPlacements.map((p) => ({
//             "Learner Name": p.learnerName,
//             "ID Number": p.idNumber,
//             "Race (EE Code)": p.equityGroup,
//             Gender: p.isFemale ? "Female" : "Male",
//             "Youth Status": p.isYouth ? "Youth (Under 35)" : "Non-Youth",
//             "Disability Status": p.hasDisability ? "Yes" : "No",
//             "Placement Type": p.placementType,
//             "B-BBEE Category": p.bbbeeSpendCategory,
//             "Monthly Stipend": p.stipendAmount || 0,
//             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
//             "Section 12H Value": p.s12hAllowanceTotal,
//             "Campus Attendance %": `${p.attendancePercentage}%`,
//             "Approved Logbook Hours": p.approvedWpHours,
//             "Pending Logbook Hours": p.pendingWpHours,
//             "Start Date": moment(p.startDate).format("YYYY-MM-DD"),
//             "Expected End Date": moment(p.endDate).format("YYYY-MM-DD"),
//             "Assigned Mentor": p.mentorName,
//             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
//             "Operational Status": p.status.toUpperCase(),
//         }));
//     };

//     const handleExportExcel = () => {
//         const data = getExportData();
//         if (data.length === 0) return;
//         const worksheet = XLSX.utils.json_to_sheet(data);
//         const workbook = XLSX.utils.book_new();
//         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
//         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, "_");
//         XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
//         setShowExportMenu(false);
//     };

//     const handleExportCSV = () => {
//         const data = getExportData();
//         if (data.length === 0) return;
//         const headers = Object.keys(data[0]);
//         const csvRows = data.map((row) => headers.map((header) => `"${(row as Record<string, unknown>)[header]}"`).join(","));
//         const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
//         const link = document.createElement("a");
//         link.href = URL.createObjectURL(blob);
//         link.setAttribute("download", `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`);
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//         setShowExportMenu(false);
//     };

//     return (
//         <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "2rem" }}>
            
//             {/* 🚀 MODAL MOUNT POINTS */}
//             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
//             {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}

//             {/* ── BREADCRUMB & HEADER ── */}
//             <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
//                 <button onClick={onBack} style={{ background: "white", border: "1px solid var(--mlab-border)", borderRadius: "8px", padding: "8px", cursor: "pointer", color: "var(--mlab-midnight)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "4px" }}>
//                     <ArrowLeft size={18} />
//                 </button>
//                 <div>
//                     <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Host Company Profile</div>
//                     <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
//                         <h1 style={{ margin: 0, fontSize: "1.8rem", fontFamily: "var(--font-heading)", color: "var(--mlab-midnight)", lineHeight: 1.2 }}>{company.name}</h1>
//                         {isComplianceLoading && <Loader2 size={20} className="wm-spin" color="var(--mlab-blue)" />}
//                     </div>

//                     <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", fontSize: "0.85rem", color: "#475569" }}>
//                         {company.registrationNumber && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Hash size={13} /> {company.registrationNumber}</span>}
//                         {company.physicalAddress && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={13} /> {company.physicalAddress}</span>}
//                         {company.contactPerson && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Mail size={13} /> {company.contactEmail}</span>}
//                     </div>
//                 </div>
//             </div>

//             {/* ── ALERTS SECTION FOR QUALITY SIGNALS ── */}
//             {complianceMetrics.overloadedMentors > 0 && (
//                 <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", color: "#991b1b", fontSize: "0.8rem", fontWeight: 600 }}>
//                     <ShieldAlert size={16} />
//                     <span><strong>SETA Quality Warning:</strong> {complianceMetrics.overloadedMentors} assigned mentor(s) currently exceed the recommended 1:4 supervisor-to-learner load constraint.</span>
//                 </div>
//             )}

//             {/* ── OPERATIONAL KPI RIBBON ── */}
//             <div className="cdp-stat-row">
//                 <div className="cdp-stat-card cdp-stat-card--blue">
//                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value">{activeCount}</span>
//                         <span className="cdp-stat-card__label">Active Interns</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--green">
//                     <div className="cdp-stat-card__icon"><Award size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value">{completedCount}</span>
//                         <span className="cdp-stat-card__label">Completed Programs</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--amber">
//                     <div className="cdp-stat-card__icon"><FileText size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit" }}>{missingContracts}</span>
//                         <span className="cdp-stat-card__label">Missing Contracts</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--grey">
//                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? "var(--mlab-red)" : "inherit" }}>{droppedCount}</span>
//                         <span className="cdp-stat-card__label">Dropped / Terminated</span>
//                     </div>
//                 </div>
//             </div>

//             {/* ── IMPORTED MODULAR COMPLIANCE GRID ── */}
//             <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />

//             {/* ── PLACEMENT LEDGER DATA GRID ── */}
//             <div className="cdp-panel">
//                 <div className="vp-card" style={{ marginBottom: 0 }}>
//                     <div className="vp-card-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
//                         <div className="vp-card-title-group">
//                             <Users size={18} color="var(--mlab-blue)" />
//                             <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--mlab-blue)", textTransform: "uppercase" }}>Placement Ledger</h3>
//                         </div>
//                     </div>

//                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 1.5rem", borderBottom: "1px solid var(--mlab-border)", marginTop: "1rem", background: "#f8fafc", flexWrap: "wrap", gap: "1rem" }}>
//                         <div style={{ display: "flex", gap: "1.5rem" }}>
//                             <button onClick={() => setActiveTab("active")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "active" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "active" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "active" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
//                                 Active Interns <span style={{ background: activeTab === "active" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "active" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{activeCount}</span>
//                             </button>
//                             <button onClick={() => setActiveTab("history")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "history" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "history" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "history" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
//                                 History (Completed / Dropped) <span style={{ background: activeTab === "history" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "history" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{completedCount + droppedCount}</span>
//                             </button>
//                             <button onClick={() => setActiveTab("all")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "all" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "all" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "all" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
//                                 All Records <span style={{ background: activeTab === "all" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "all" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{enrichedPlacements.length}</span>
//                             </button>
//                         </div>

//                         <div style={{ display: "flex", gap: "8px", paddingBottom: "8px" }}>
//                             <div style={{ position: "relative", display: "flex", alignItems: "center", background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "0 8px" }}>
//                                 <Search size={14} color="#64748b" />
//                                 <input type="text" placeholder="Search ledger..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: "none", padding: "8px", outline: "none", background: "transparent", fontSize: "0.8rem", width: "200px" }} />
//                                 {searchQuery && <button type="button" onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex" }}><X size={12} /></button>}
//                             </div>

//                             <div style={{ position: "relative" }} ref={menuRef}>
//                                 <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={displayedPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: "white", fontSize: "0.8rem", padding: "6px 12px", opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? "not-allowed" : "pointer" }}>
//                                     <DownloadCloud size={14} /> Export Options
//                                 </button>
//                                 {showExportMenu && displayedPlacements.length > 0 && (
//                                     <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 50, minWidth: "180px", overflow: "hidden" }} className="animate-fade-in">
//                                         <button type="button" onClick={handleExportCSV} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download as CSV</button>
//                                         <button type="button" onClick={handleExportExcel} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)</button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     </div>

//                     <div className="mlab-table-wrap">
//                         {isComplianceLoading && <div style={{ padding: "1rem", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} className="wm-spin" /> Verifying deep compliance logs...</div>}
//                         <table className="mlab-table">
//                             <colgroup>
//                                 <col style={{ width: "22%" }} />
//                                 <col style={{ width: "15%" }} />
//                                 <col style={{ width: "15%" }} />
//                                 <col style={{ width: "18%" }} />
//                                 <col style={{ width: "20%" }} />
//                                 <col style={{ width: "10%" }} />
//                             </colgroup>
//                             <thead>
//                                 <tr>
//                                     <th>Learner Profile</th>
//                                     <th>Placement Timeline</th>
//                                     <th>Assigned Mentor</th>
//                                     <th>Finance & Contracts</th>
//                                     <th>Audit & Logbook</th>
//                                     <th style={{ textAlign: "right" }}>Actions</th>
//                                 </tr>
//                             </thead>
//                             <tbody>
//                                 {displayedPlacements.length > 0 ? (
//                                     displayedPlacements.map((p) => {
//                                         const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
//                                         const missingItems = [];
//                                         if (!p.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
//                                         if (!p.hasMentor) missingItems.push("Workplace Mentor");

//                                         return (
//                                         <tr key={p.id}>
//                                             <td>
//                                                 <div className="cdp-learner-cell">
//                                                     <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
//                                                     <div className="cdp-learner-cell__info">
//                                                         <span className="cdp-learner-cell__name">{p.learnerName}</span>
//                                                         <span className="cdp-learner-cell__id">{p.idNumber}</span>
//                                                     </div>
//                                                 </div>
//                                             </td>

//                                             <td>
//                                                 <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 500 }}>
//                                                     {formatDate(p.startDate)} <span style={{ color: "#94a3b8", margin: "0 4px" }}>→</span> {formatDate(p.endDate)}
//                                                 </div>
//                                                 <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>{p.placementType}</div>
//                                             </td>

//                                             <td>
//                                                 <div style={{ fontSize: "0.8rem", color: p.hasMentor ? "var(--mlab-midnight)" : "#dc2626", fontWeight: p.hasMentor ? 500 : 700, display: "flex", alignItems: "center", gap: "4px" }}>
//                                                     {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> No Mentor Assigned</>}
//                                                 </div>
//                                             </td>

//                                             <td>
//                                                 <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
//                                                     <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
//                                                         <span className="cdp-chip cdp-chip--k" style={{ width: "fit-content", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}>{p.bbbeeSpendCategory}</span>
//                                                         {p.stipendAmount && p.stipendAmount > 0 && <span className="cdp-chip cdp-chip--w" style={{ width: "fit-content" }}>Wage: R{p.stipendAmount}/mo</span>}
//                                                     </div>

//                                                     {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
//                                                         <button type="button" onClick={() => setEtiBreakdownLearner(p)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "2px 6px", borderRadius: "4px", fontSize: "0.65rem", color: "#166534", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600, cursor: "pointer" }} title="Click to view exact SARS mathematical breakdown">
//                                                             <Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo
//                                                         </button>
//                                                     ) : (
//                                                         <span style={{ fontSize: "0.65rem", color: "#64748b", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600, width: "fit-content" }}><AlertCircle size={10} /> Ineligible for ETI</span>
//                                                     )}

//                                                     {p.compliance.isAgreementFullyExecuted ? (
//                                                         p.compliance.wblpaAgreementUrl ? (
//                                                             <a href={p.compliance.wblpaAgreementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.65rem", color: "#166534", background: "#dcfce7", padding: "2px 6px", borderRadius: "4px", border: "1px solid #bbf7d0", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600, textDecoration: "none" }} title="Click to view signed contract document">
//                                                                 <FileText size={10} /> View WBLPA Contract
//                                                             </a>
//                                                         ) : (
//                                                             <span style={{ fontSize: "0.65rem", color: "#166534", background: "#dcfce7", padding: "2px 6px", borderRadius: "4px", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}><CheckCircle size={10} /> Signed & On File</span>
//                                                         )
//                                                     ) : (
//                                                         <span style={{ fontSize: "0.65rem", color: "#dc2626", background: "#fef2f2", padding: "2px 6px", borderRadius: "4px", border: "1px solid #fecaca", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}><AlertCircle size={10} /> Missing WBLPA Document</span>
//                                                     )}
//                                                 </div>
//                                             </td>

//                                             <td>
//                                                 <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
//                                                     <div style={{ width: "100%", opacity: isComplianceLoading ? 0.3 : 1 }}>
//                                                         <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
//                                                             <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={12} color="#94a3b8" /> Campus Ratio</span>
//                                                             <span style={{ color: p.attendancePercentage >= 80 ? "#16a34a" : p.attendancePercentage >= 50 ? "#d97706" : "#dc2626" }}>{p.attendancePercentage}%</span>
//                                                         </div>
//                                                         <div style={{ width: "100%", background: "#e2e8f0", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
//                                                             <div style={{ width: `${p.attendancePercentage}%`, background: p.attendancePercentage >= 80 ? "#16a34a" : p.attendancePercentage >= 50 ? "#f59e0b" : "#ef4444", height: "100%" }} />
//                                                         </div>
//                                                     </div>

//                                                     <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginTop: "2px", opacity: isComplianceLoading ? 0.3 : 1 }}>
//                                                         <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Briefcase size={12} color="#94a3b8" /> Verified Logs</span>
//                                                         <span style={{ color: p.approvedWpHours > 0 ? "#16a34a" : "#64748b" }}>{p.approvedWpHours.toFixed(1)} hrs</span>
//                                                     </div>

//                                                     {p.pendingWpHours > 0 && !isComplianceLoading && (
//                                                         <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", padding: "2px 6px", borderRadius: "4px", fontSize: "0.65rem", fontWeight: 700, cursor: "pointer" }} onClick={() => setAuditLearner(p)}>
//                                                             <AlertTriangle size={10} /> {p.pendingWpHours.toFixed(1)} hrs pending
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             </td>

//                                             <td style={{ textAlign: "right" }}>
//                                                 <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
//                                                     <span className={`cdp-status-badge ${p.status.toLowerCase().includes("active") ? "cdp-status-badge--active" : p.status.toLowerCase().includes("terminate") ? "cdp-status-badge--dropped" : ""}`} style={p.status.toLowerCase().includes("pending") ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" } : p.status.toLowerCase().includes("complete") || p.status.toLowerCase().includes("absorb") ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } : {}}>
//                                                         {p.status.replace("_", " ")}
//                                                     </span>

//                                                     {isAuditReady ? (
//                                                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: '6px', width: 'fit-content' }}>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                                                 <ShieldCheck size={14} /> Audit Ready
//                                                             </div>
//                                                         </div>
//                                                     ) : (
//                                                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: '6px', width: 'fit-content', textAlign: 'left' }}>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
//                                                                 <AlertTriangle size={14} /> Non-Compliant
//                                                             </div>
//                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                                                 {missingItems.map(m => (
//                                                                     <span key={m} style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><X size={10}/> Missing {m}</span>
//                                                                 ))}
//                                                             </div>
//                                                         </div>
//                                                     )}

//                                                     {(p.approvedWpHours > 0 || p.pendingWpHours > 0) && (
//                                                         <button type="button" onClick={() => setAuditLearner(p)} style={{ background: "white", border: "1px solid #cbd5e1", padding: "4px 8px", borderRadius: "4px", cursor: "pointer", color: "var(--mlab-blue)", fontSize: "0.7rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }} title="View Workplace Log Audits">
//                                                             <FileText size={10} /> View Logbook Audits
//                                                         </button>
//                                                     )}
//                                                 </div>
//                                             </td>
//                                         </tr>
//                                     );
//                                 })
//                                 ) : (
//                                     <tr>
//                                         <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
//                                             {searchQuery ? `No records matched your search query for "${searchQuery}".` : `No placement history matches found for this host company configuration.`}
//                                         </td>
//                                     </tr>
//                                 )}
//                             </tbody>
//                         </table>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };


// // // src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

// // import React, { useMemo, useState, useRef, useEffect } from "react";
// // import { createPortal } from "react-dom";
// // import { collection, query, where, getDocs } from "firebase/firestore";
// // import { db } from "../../../lib/firebase";
// // import {
// //     ArrowLeft,
// //     MapPin,
// //     Mail,
// //     Hash,
// //     Briefcase,
// //     CheckCircle,
// //     AlertTriangle,
// //     Users,
// //     Award,
// //     FileText,
// //     Search,
// //     X,
// //     DownloadCloud,
// //     AlertCircle,
// //     User,
// //     FileSpreadsheet,
// //     Landmark,
// //     Calculator,
// //     Coins,
// //     Accessibility,
// //     Wallet,
// //     Info,
// //     Activity,
// //     Receipt,
// //     ShieldAlert,
// //     Calendar,
// //     Loader2,
// //     Eye,
// //     EyeOff,
// //     ExternalLink,
// //     ChevronDown,
// //     ChevronUp,
// //     Clock,
// //     History,
// // } from "lucide-react";
// // import moment from "moment";
// // import * as XLSX from "xlsx";
// // import { useStore, type StaffMember } from "../../../store/useStore";
// // import type {
// //     Employer,
// //     DashboardLearner,
// //     PlacementContract,
// // } from "../../../types";

// // interface CompanyInsightsViewProps {
// //     company: Employer;
// //     onBack: () => void;
// // }

// // interface EnrichedPlacement extends PlacementContract {
// //     placementType: string;
// //     bbbeeSpendCategory: string;
// //     compliance: {
// //         isAgreementFullyExecuted: boolean;
// //         wblpaAgreementUrl?: string;
// //     };
// //     learnerName: string;
// //     idNumber: string;
// //     equityGroup: string;
// //     hasDisability: boolean;
// //     isFemale: boolean;
// //     isYouth: boolean;
// //     mentorName: string;
// //     hasMentor: boolean;
// //     isEtiEligible: boolean;
// //     etiMonthlyValue: number;
// //     projectedStipendSpend: number;
// //     s12hAllowanceTotal: number;
// //     attendancePercentage: number;
// //     approvedWpHours: number;
// //     pendingWpHours: number;
// // }

// // /* ─── REUSABLE UI COMPONENTS ─── */
// // const InsightPopup = ({
// //     title,
// //     currentValue,
// //     actionSteps,
// //     onClose,
// // }: {
// //     title: string;
// //     currentValue: string;
// //     actionSteps: React.ReactNode[];
// //     onClose: () => void;
// // }) => (
// //     <div
// //         style={{
// //             position: "absolute",
// //             top: "100%",
// //             left: 0,
// //             marginTop: "8px",
// //             background: "white",
// //             border: "1px solid #cbd5e1",
// //             borderRadius: "8px",
// //             padding: "1rem",
// //             width: "360px",
// //             zIndex: 100,
// //             boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
// //         }}
// //         className="animate-fade-in"
// //     >
// //         <div
// //             style={{
// //                 display: "flex",
// //                 justifyContent: "space-between",
// //                 alignItems: "center",
// //                 marginBottom: "12px",
// //                 paddingBottom: "8px",
// //                 borderBottom: "1px solid #f1f5f9",
// //             }}
// //         >
// //             <div
// //                 style={{
// //                     display: "flex",
// //                     alignItems: "center",
// //                     gap: "6px",
// //                     color: "var(--mlab-midnight)",
// //                     fontWeight: 800,
// //                     fontSize: "0.85rem",
// //                 }}
// //             >
// //                 <Activity size={16} color="#d97706" /> {title}
// //             </div>
// //             <button
// //                 type="button"
// //                 onClick={onClose}
// //                 style={{
// //                     background: "none",
// //                     border: "none",
// //                     cursor: "pointer",
// //                     color: "#64748b",
// //                     padding: 0,
// //                 }}
// //             >
// //                 <X size={14} />
// //             </button>
// //         </div>
// //         <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
// //             {actionSteps.map((step, i) => (
// //                 <div
// //                     key={i}
// //                     style={{ fontSize: "0.75rem", color: "#475569", lineHeight: 1.4 }}
// //                 >
// //                     {step}
// //                 </div>
// //             ))}
// //         </div>
// //     </div>
// // );

// // const RingGauge = ({
// //     percentage,
// //     color,
// // }: {
// //     percentage: number;
// //     color: string;
// // }) => {
// //     const size = 52;
// //     const stroke = 5;
// //     const radius = (size - stroke) / 2;
// //     const circum = radius * 2 * Math.PI;
// //     const offset = circum - (Math.min(percentage, 100) / 100) * circum;

// //     return (
// //         <div
// //             style={{
// //                 position: "relative",
// //                 width: size,
// //                 height: size,
// //                 display: "flex",
// //                 alignItems: "center",
// //                 justifyContent: "center",
// //                 flexShrink: 0,
// //             }}
// //         >
// //             <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
// //                 <circle
// //                     cx={size / 2}
// //                     cy={size / 2}
// //                     r={radius}
// //                     fill="none"
// //                     stroke="#f1f5f9"
// //                     strokeWidth={stroke}
// //                 />
// //                 <circle
// //                     cx={size / 2}
// //                     cy={size / 2}
// //                     r={radius}
// //                     fill="none"
// //                     stroke={color}
// //                     strokeWidth={stroke}
// //                     strokeDasharray={circum}
// //                     strokeDashoffset={offset}
// //                     strokeLinecap="round"
// //                     style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
// //                 />
// //             </svg>
// //             <div
// //                 style={{
// //                     position: "absolute",
// //                     fontSize: "0.7rem",
// //                     fontWeight: 800,
// //                     color: "var(--mlab-midnight)",
// //                 }}
// //             >
// //                 {percentage}%
// //             </div>
// //         </div>
// //     );
// // };

// // export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({
// //     company,
// //     onBack,
// // }) => {
// //     const { learners, staff } = useStore() as any;
// //     const placements =
// //         useStore(
// //             (s) => (s as unknown as { placements?: PlacementContract[] }).placements,
// //         ) || [];

// //     const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
// //     const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
// //     const [workplaceLogs, setWorkplaceLogs] = useState<any[]>([]);
// //     const [isComplianceLoading, setIsComplianceLoading] = useState(true);

// //     const [activeTab, setActiveTab] = useState<"active" | "history" | "all">(
// //         "active",
// //     );
// //     const [searchQuery, setSearchQuery] = useState("");
// //     const [showExportMenu, setShowExportMenu] = useState(false);

// //     const [activeInsight, setActiveInsight] = useState<
// //         | "transformation"
// //         | "absorption"
// //         | "eti"
// //         | "disability"
// //         | "spend"
// //         | "s12h"
// //         | "youth"
// //         | null
// //     >(null);
// //     const [etiBreakdownLearner, setEtiBreakdownLearner] =
// //         useState<EnrichedPlacement | null>(null);

// //     const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(
// //         null,
// //     );
// //     const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(
// //         new Set(),
// //     );
// //     const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

// //     const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(
// //         null,
// //     );

// //     const menuRef = useRef<HTMLDivElement>(null);

// //     const isImageFile = (url: string) => {
// //         if (!url) return false;
// //         return (
// //             /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(url) ||
// //             url.toLowerCase().includes(".png") ||
// //             url.toLowerCase().includes(".jpg") ||
// //             url.toLowerCase().includes(".jpeg")
// //         );
// //     };

// //     const companyPlacements = useMemo(
// //         () => placements.filter((p) => p.employerId === company.id),
// //         [placements, company.id],
// //     );
// //     const companyMentors = useMemo(
// //         () =>
// //             staff.filter(
// //                 (s: any) =>
// //                     s.role === "mentor" &&
// //                     s.employerId === company.id &&
// //                     s.status !== "archived",
// //             ),
// //         [staff, company.id],
// //     );

// //     useEffect(() => {
// //         const fetchDeepComplianceData = async () => {
// //             if (companyPlacements.length === 0) {
// //                 setIsComplianceLoading(false);
// //                 return;
// //             }

// //             setIsComplianceLoading(true);
// //             try {
// //                 const wpQuery = query(
// //                     collection(db, "workplace_logs"),
// //                     where("employerId", "==", company.id),
// //                 );
// //                 const wpSnap = await getDocs(wpQuery);
// //                 const fetchedWpLogs = wpSnap.docs.map((d) => ({
// //                     id: d.id,
// //                     ...d.data(),
// //                 }));
// //                 setWorkplaceLogs(fetchedWpLogs);

// //                 const relevantCohortIds = new Set<string>();
// //                 companyPlacements.forEach((p) => {
// //                     const l = learners.find((x: any) => x.id === p.learnerId);
// //                     if (p.cohortId) relevantCohortIds.add(p.cohortId);
// //                     if (l && l.cohortId) relevantCohortIds.add(l.cohortId);
// //                 });

// //                 const cohortIdsArray = Array.from(relevantCohortIds);
// //                 let fetchedAttLogs: any[] = [];
// //                 let fetchedAttRecords: any[] = [];

// //                 for (const cId of cohortIdsArray) {
// //                     if (!cId) continue;
// //                     const logsQ = query(
// //                         collection(db, "attendance_logs"),
// //                         where("cohortId", "==", cId),
// //                     );
// //                     const recsQ = query(
// //                         collection(db, "attendance_records"),
// //                         where("cohortId", "==", cId),
// //                     );

// //                     const [lSnap, rSnap] = await Promise.all([
// //                         getDocs(logsQ),
// //                         getDocs(recsQ),
// //                     ]);

// //                     fetchedAttLogs.push(
// //                         ...lSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
// //                     );
// //                     fetchedAttRecords.push(
// //                         ...rSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
// //                     );
// //                 }

// //                 setAttendanceLogs(fetchedAttLogs);
// //                 setAttendanceRecords(fetchedAttRecords);
// //             } catch (error) {
// //                 console.error("Deep compliance fetch error:", error);
// //             } finally {
// //                 setIsComplianceLoading(false);
// //             }
// //         };

// //         fetchDeepComplianceData();
// //     }, [companyPlacements.length, company.id, learners]);

// //     useEffect(() => {
// //         const handleClickOutside = (event: MouseEvent) => {
// //             if (menuRef.current && !menuRef.current.contains(event.target as Node))
// //                 setShowExportMenu(false);
// //         };
// //         document.addEventListener("mousedown", handleClickOutside);
// //         return () => document.removeEventListener("mousedown", handleClickOutside);
// //     }, []);

// //     const {
// //         activeCount,
// //         completedCount,
// //         droppedCount,
// //         missingContracts,
// //         absorbedCount,
// //     } = useMemo(() => {
// //         let active = 0,
// //             completed = 0,
// //             dropped = 0,
// //             missing = 0,
// //             absorbed = 0;

// //         companyPlacements.forEach((p) => {
// //             const placementRecord = p as PlacementContract & {
// //                 compliance?: { isAgreementFullyExecuted?: boolean };
// //                 isAbsorbed?: boolean;
// //             };
// //             const statusLower = p.status.toLowerCase();

// //             if (
// //                 statusLower.includes("active") ||
// //                 statusLower.includes("pending") ||
// //                 statusLower.includes("interview")
// //             ) {
// //                 active++;
// //                 const isFullySigned =
// //                     p.wblAgreementSigned ||
// //                     placementRecord.compliance?.isAgreementFullyExecuted;
// //                 if (!isFullySigned) missing++;
// //             }
// //             if (p.status === "Completed" || p.status === "absorbed_permanently")
// //                 completed++;
// //             if (p.status === "Terminated") dropped++;
// //             if (
// //                 p.isAbsorbedPostPlacement ||
// //                 p.status === "absorbed_permanently" ||
// //                 placementRecord.isAbsorbed
// //             )
// //                 absorbed++;
// //         });
// //         return {
// //             activeCount: active,
// //             completedCount: completed,
// //             droppedCount: dropped,
// //             missingContracts: missing,
// //             absorbedCount: absorbed,
// //         };
// //     }, [companyPlacements]);

// //     const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
// //         return companyPlacements
// //             .map((p) => {
// //                 const learner =
// //                     learners.find((l: any) => l.id === p.learnerId) ||
// //                     ({} as Partial<DashboardLearner>);

// //                 const placementRecord = p as PlacementContract & {
// //                     placementType?: string;
// //                     compliance?: {
// //                         isAgreementFullyExecuted?: boolean;
// //                         wblpaAgreementUrl?: string;
// //                         bbbeeSpendCategory?: string;
// //                     };
// //                     bbbeeSpendCategory?: string;
// //                     mentorId?: string;
// //                     cohortId?: string;
// //                 };

// //                 const mentor =
// //                     companyMentors.find(
// //                         (m: any) =>
// //                             (p.assignedMentorName && m.fullName === p.assignedMentorName) ||
// //                             (placementRecord.mentorId && m.id === placementRecord.mentorId),
// //                     ) || ({} as Partial<StaffMember>);

// //                 const extendedLearner = learner as Partial<DashboardLearner> & {
// //                     equityGroup?: string;
// //                     disabilityStatus?: string;
// //                 };
// //                 const equity =
// //                     learner.demographics?.equityCode ||
// //                     extendedLearner.equityGroup ||
// //                     "Unknown";
// //                 const disability =
// //                     learner.demographics?.disabilityStatusCode ||
// //                     extendedLearner.disabilityStatus ||
// //                     "No Disability";

// //                 let isEtiEligible = false;
// //                 let isFemale = false;
// //                 let isYouth = true;

// //                 if (learner.idNumber && learner.idNumber.length >= 13) {
// //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// //                     const age = new Date().getFullYear() - birthYear;

// //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// //                     if (age > 35) isYouth = false;

// //                     const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
// //                     if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
// //                 } else if (
// //                     (learner.demographics as any)?.genderCode === "F" ||
// //                     (extendedLearner as any).gender === "Female"
// //                 ) {
// //                     isFemale = true;
// //                 }

// //                 const monthsDuration = moment(p.endDate).diff(
// //                     moment(p.startDate),
// //                     "months",
// //                     true,
// //                 );
// //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

// //                 let etiMonthlyValue = 0;
// //                 const wage = Number(p.stipendAmount) || 0;

// //                 if (isEtiEligible && wage > 0) {
// //                     if (wage < 2000) etiMonthlyValue = wage * 0.75;
// //                     else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
// //                     else if (wage >= 4500 && wage < 6500)
// //                         etiMonthlyValue = Math.max(1500 - 0.75 * (wage - 4500), 0);
// //                 }

// //                 const hasDisability =
// //                     disability !== "No Disability" &&
// //                     disability !== "None" &&
// //                     disability !== "N/A" &&
// //                     disability !== "No" &&
// //                     disability !== "N";
// //                 const s12hAllowanceTotal = hasDisability ? 120000 : 80000;

// //                 const cohortId = learner.cohortId || placementRecord.cohortId;
// //                 const safeLearnerId = p.learnerId;
// //                 const safeIdNumber = learner.idNumber || "";

// //                 let attendancePercentage = 0;
// //                 if (cohortId) {
// //                     const learnerAttRecords = attendanceRecords.filter((r: any) =>
// //                         r.cohortId === cohortId && (r.learnerId === safeLearnerId || r.learnerId === safeIdNumber)
// //                     );
// //                     // const learnerAttRecords = attendanceRecords.filter(
// //                     //     (r) =>
// //                     //         r.cohortId === p.cohortId &&
// //                     //         (r.learnerId === p.learnerId || r.learnerId === p.idNumber),
// //                     // );
// //                     const learnerAttPresent = learnerAttRecords.filter(
// //                         (r: any) => r.status === "Present" || r.status === "Partial",
// //                     ).length;
// //                     const cohortTotalSessions = attendanceLogs.filter(
// //                         (l: any) => l.cohortId === cohortId,
// //                     ).length;

// //                     attendancePercentage =
// //                         cohortTotalSessions > 0
// //                             ? Math.round((learnerAttPresent / cohortTotalSessions) * 100)
// //                             : 0;
// //                 }

// //                 const learnerWpLogs = workplaceLogs.filter(
// //                     (l: any) =>
// //                         l.learnerId === safeLearnerId || l.learnerId === safeIdNumber,
// //                 );

// //                 const approvedWpHours = learnerWpLogs
// //                     .filter((l: any) => l.status === "Approved")
// //                     .reduce(
// //                         (sum: number, l: any) => sum + (Number(l.totalHours) || 0),
// //                         0,
// //                     );
// //                 const pendingWpHours = learnerWpLogs
// //                     .filter((l: any) => l.status === "Pending_Mentor_Approval")
// //                     .reduce(
// //                         (sum: number, l: any) => sum + (Number(l.totalHours) || 0),
// //                         0,
// //                     );

// //                 return {
// //                     ...p,
// //                     placementType:
// //                         placementRecord.placementType || "QCTO Workplace Module",
// //                     bbbeeSpendCategory:
// //                         placementRecord.compliance?.bbbeeSpendCategory ||
// //                         placementRecord.bbbeeSpendCategory ||
// //                         "Uncategorized",
// //                     compliance: {
// //                         isAgreementFullyExecuted:
// //                             typeof placementRecord.compliance?.isAgreementFullyExecuted ===
// //                                 "boolean"
// //                                 ? placementRecord.compliance.isAgreementFullyExecuted
// //                                 : p.wblAgreementSigned,
// //                         wblpaAgreementUrl:
// //                             placementRecord.compliance?.wblpaAgreementUrl ||
// //                             p.wblAgreementUrl,
// //                     },
// //                     learnerName: learner.fullName || "Unknown Learner",
// //                     idNumber: learner.idNumber || "—",
// //                     equityGroup: equity,
// //                     isFemale,
// //                     isYouth,
// //                     hasDisability,
// //                     mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
// //                     hasMentor: !!(
// //                         p.assignedMentorName ||
// //                         placementRecord.mentorId ||
// //                         mentor.id
// //                     ),
// //                     isEtiEligible,
// //                     etiMonthlyValue,
// //                     projectedStipendSpend: wage * verifiedTimeline,
// //                     s12hAllowanceTotal,
// //                     attendancePercentage,
// //                     approvedWpHours,
// //                     pendingWpHours,
// //                 };
// //             })
// //             .sort(
// //                 (a, b) =>
// //                     new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
// //             );
// //     }, [
// //         companyPlacements,
// //         learners,
// //         companyMentors,
// //         attendanceRecords,
// //         attendanceLogs,
// //         workplaceLogs,
// //     ]);

// //     const complianceMetrics = useMemo(() => {
// //         let blackACI = 0,
// //             blackFemale = 0,
// //             disabilityCount = 0,
// //             youthCount = 0;
// //         let monthlyEtiSum = 0,
// //             accumulatedSpend = 0,
// //             totalS12hProjected = 0,
// //             activeEtiYielders = 0;
// //         let totalFemale = 0,
// //             totalMale = 0;
// //         let absorbedFemale = 0,
// //             absorbedMale = 0;

// //         let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
// //         let mentorLoad: Record<string, number> = {};

// //         enrichedPlacements.forEach((p) => {
// //             const statusLower = p.status.toLowerCase();
// //             const isLive =
// //                 statusLower.includes("active") ||
// //                 statusLower.includes("pending") ||
// //                 statusLower.includes("interview");
// //             const isAbsorbed =
// //                 p.isAbsorbedPostPlacement ||
// //                 statusLower.includes("absorb") ||
// //                 (p as any).isAbsorbed;

// //             if (isLive && p.hasMentor) {
// //                 mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;
// //             }

// //             const eq = p.equityGroup.trim().toLowerCase();
// //             if (eq.includes("african") || eq === "black" || eq === "ba") {
// //                 raceCounts.African++;
// //                 blackACI++;
// //                 if (p.isFemale) blackFemale++;
// //             } else if (eq.includes("coloured") || eq === "bc") {
// //                 raceCounts.Coloured++;
// //                 blackACI++;
// //                 if (p.isFemale) blackFemale++;
// //             } else if (eq.includes("indian") || eq === "bi") {
// //                 raceCounts.Indian++;
// //                 blackACI++;
// //                 if (p.isFemale) blackFemale++;
// //             } else if (eq.includes("white") || eq === "w") {
// //                 raceCounts.White++;
// //             } else {
// //                 raceCounts.Other++;
// //             }

// //             if (p.isFemale) totalFemale++;
// //             else totalMale++;
// //             if (p.isYouth) youthCount++;
// //             if (isAbsorbed) {
// //                 if (p.isFemale) absorbedFemale++;
// //                 else absorbedMale++;
// //             }
// //             if (p.hasDisability) disabilityCount++;

// //             if (isLive) {
// //                 if (p.etiMonthlyValue > 0) activeEtiYielders++;
// //                 monthlyEtiSum += p.etiMonthlyValue;
// //                 accumulatedSpend += p.projectedStipendSpend;
// //             }

// //             if (
// //                 isLive ||
// //                 statusLower.includes("complete") ||
// //                 statusLower.includes("absorb")
// //             ) {
// //                 totalS12hProjected += p.s12hAllowanceTotal;
// //             }
// //         });

// //         const maxMentorLoad =
// //             Object.values(mentorLoad).length > 0
// //                 ? Math.max(...Object.values(mentorLoad))
// //                 : 0;
// //         const overloadedMentors = Object.entries(mentorLoad).filter(
// //             ([_, count]) => count > 4,
// //         ).length;

// //         return {
// //             transformationPercentage:
// //                 enrichedPlacements.length > 0
// //                     ? Math.round((blackACI / enrichedPlacements.length) * 100)
// //                     : 0,
// //             blackFemalePercentage:
// //                 enrichedPlacements.length > 0
// //                     ? Math.round((blackFemale / enrichedPlacements.length) * 100)
// //                     : 0,
// //             disabilityPercentage:
// //                 enrichedPlacements.length > 0
// //                     ? Math.round((disabilityCount / enrichedPlacements.length) * 100)
// //                     : 0,
// //             disabilityCount,
// //             youthPercentage:
// //                 enrichedPlacements.length > 0
// //                     ? Math.round((youthCount / enrichedPlacements.length) * 100)
// //                     : 0,
// //             youthCount,
// //             etiYieldPercentage:
// //                 activeCount > 0
// //                     ? Math.round((activeEtiYielders / activeCount) * 100)
// //                     : 0,
// //             monthlyETITotal: monthlyEtiSum,
// //             annualizedETIEstimate: monthlyEtiSum * 12,
// //             absorptionRate:
// //                 completedCount > 0
// //                     ? Math.round((absorbedCount / completedCount) * 100)
// //                     : 0,
// //             totalProjectedSpend: accumulatedSpend,
// //             totalS12hProjected,
// //             totalFemale,
// //             totalMale,
// //             absorbedFemale,
// //             absorbedMale,
// //             raceCounts,
// //             maxMentorLoad,
// //             overloadedMentors,
// //         };
// //     }, [enrichedPlacements, activeCount, completedCount, absorbedCount]);

// //     const formatCurrency = (val: number) =>
// //         new Intl.NumberFormat("en-ZA", {
// //             style: "currency",
// //             currency: "ZAR",
// //             maximumFractionDigits: 0,
// //         }).format(val);

// //     const displayedPlacements = useMemo(() => {
// //         return enrichedPlacements.filter((p) => {
// //             const sLower = p.status.toLowerCase();
// //             if (
// //                 activeTab === "active" &&
// //                 !sLower.includes("active") &&
// //                 !sLower.includes("pending") &&
// //                 !sLower.includes("interview")
// //             )
// //                 return false;
// //             if (
// //                 activeTab === "history" &&
// //                 !sLower.includes("complete") &&
// //                 !sLower.includes("terminate") &&
// //                 !sLower.includes("absorb")
// //             )
// //                 return false;
// //             if (searchQuery) {
// //                 const q = searchQuery.toLowerCase();
// //                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q))
// //                     return false;
// //             }
// //             return true;
// //         });
// //     }, [enrichedPlacements, activeTab, searchQuery]);

// //     const formatDate = (dateStr: string) => moment(dateStr).format("DD MMM YYYY");

// //     const getExportData = () => {
// //         return displayedPlacements.map((p) => ({
// //             "Learner Name": p.learnerName,
// //             "ID Number": p.idNumber,
// //             "Race (EE Code)": p.equityGroup,
// //             Gender: p.isFemale ? "Female" : "Male",
// //             "Youth Status": p.isYouth ? "Youth (Under 35)" : "Non-Youth",
// //             "Disability Status": p.hasDisability ? "Yes" : "No",
// //             "Placement Type": p.placementType,
// //             "B-BBEE Category": p.bbbeeSpendCategory,
// //             "Monthly Stipend": p.stipendAmount || 0,
// //             "ETI Claim Value":
// //                 p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
// //             "Section 12H Value": p.s12hAllowanceTotal,
// //             "Campus Attendance %": `${p.attendancePercentage}%`,
// //             "Approved Logbook Hours": p.approvedWpHours,
// //             "Pending Logbook Hours": p.pendingWpHours,
// //             "Start Date": moment(p.startDate).format("YYYY-MM-DD"),
// //             "Expected End Date": moment(p.endDate).format("YYYY-MM-DD"),
// //             "Assigned Mentor": p.mentorName,
// //             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted
// //                 ? "Signed & On File"
// //                 : "Missing Contract",
// //             "Operational Status": p.status.toUpperCase(),
// //         }));
// //     };

// //     const handleExportExcel = () => {
// //         const data = getExportData();
// //         if (data.length === 0) return;
// //         const worksheet = XLSX.utils.json_to_sheet(data);
// //         const workbook = XLSX.utils.book_new();
// //         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
// //         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, "_");
// //         XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
// //         setShowExportMenu(false);
// //     };

// //     const handleExportCSV = () => {
// //         const data = getExportData();
// //         if (data.length === 0) return;
// //         const headers = Object.keys(data[0]);
// //         const csvRows = data.map((row) =>
// //             headers
// //                 .map((header) => `"${(row as Record<string, unknown>)[header]}"`)
// //                 .join(","),
// //         );
// //         const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], {
// //             type: "text/csv;charset=utf-8;",
// //         });
// //         const link = document.createElement("a");
// //         link.href = URL.createObjectURL(blob);
// //         link.setAttribute(
// //             "download",
// //             `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`,
// //         );
// //         document.body.appendChild(link);
// //         link.click();
// //         document.body.removeChild(link);
// //         setShowExportMenu(false);
// //     };

// //     const toggleHistoryAccordion = (logId: string) => {
// //         setExpandedHistoryIds((prev) => {
// //             const next = new Set(prev);
// //             if (next.has(logId)) next.delete(logId);
// //             else next.add(logId);
// //             return next;
// //         });
// //     };

// //     const toggleLogAccordion = (logId: string) => {
// //         setExpandedLogIds((prev) => {
// //             const next = new Set(prev);
// //             if (next.has(logId)) next.delete(logId);
// //             else next.add(logId);
// //             return next;
// //         });
// //     };

// //     const EtiBreakdownModal = () => {
// //         if (!etiBreakdownLearner) return null;
// //         const wage = Number(etiBreakdownLearner.stipendAmount) || 0;
// //         const eti = etiBreakdownLearner.etiMonthlyValue;
// //         const annualEti = eti * 12;

// //         let mathString = "";
// //         if (wage < 2000) {
// //             mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
// //         } else if (wage >= 2000 && wage <= 4499) {
// //             mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// //         } else if (wage >= 4500 && wage < 6500) {
// //             mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
// //         } else {
// //             mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;
// //         }

// //         return createPortal(
// //             <div
// //                 className="wm-overlay animate-fade-in"
// //                 onClick={() => setEtiBreakdownLearner(null)}
// //                 style={{
// //                     zIndex: 10000,
// //                     display: "flex",
// //                     alignItems: "center",
// //                     justifyContent: "center",
// //                 }}
// //             >
// //                 <div
// //                     className="wm-modal"
// //                     onClick={(e) => e.stopPropagation()}
// //                     style={{
// //                         width: "480px",
// //                         background: "white",
// //                         borderRadius: "12px",
// //                         padding: "1.5rem",
// //                         boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
// //                     }}
// //                 >
// //                     <div
// //                         style={{
// //                             display: "flex",
// //                             justifyContent: "space-between",
// //                             alignItems: "flex-start",
// //                             marginBottom: "1rem",
// //                         }}
// //                     >
// //                         <div>
// //                             <div
// //                                 style={{
// //                                     display: "flex",
// //                                     alignItems: "center",
// //                                     gap: "8px",
// //                                     color: "#16a34a",
// //                                     fontWeight: 800,
// //                                     fontSize: "1.1rem",
// //                                 }}
// //                             >
// //                                 <Landmark size={20} /> SARS ETI Tax Rebate Audit
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     fontSize: "0.8rem",
// //                                     color: "#64748b",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 Calculated for {etiBreakdownLearner.learnerName}
// //                             </div>
// //                         </div>
// //                         <button
// //                             type="button"
// //                             onClick={() => setEtiBreakdownLearner(null)}
// //                             style={{
// //                                 background: "none",
// //                                 border: "none",
// //                                 cursor: "pointer",
// //                                 color: "#94a3b8",
// //                             }}
// //                         >
// //                             <X size={18} />
// //                         </button>
// //                     </div>

// //                     <div
// //                         style={{
// //                             background: "#f8fafc",
// //                             border: "1px solid #e2e8f0",
// //                             borderRadius: "8px",
// //                             padding: "1rem",
// //                             marginBottom: "1rem",
// //                         }}
// //                     >
// //                         <div
// //                             style={{
// //                                 display: "flex",
// //                                 justifyContent: "space-between",
// //                                 borderBottom: "1px solid #cbd5e1",
// //                                 paddingBottom: "8px",
// //                                 marginBottom: "8px",
// //                             }}
// //                         >
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.8rem",
// //                                     color: "#475569",
// //                                     fontWeight: 600,
// //                                 }}
// //                             >
// //                                 Database Stipend Value:
// //                             </span>
// //                             <strong
// //                                 style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}
// //                             >
// //                                 {formatCurrency(wage)}
// //                             </strong>
// //                         </div>
// //                         <div
// //                             style={{
// //                                 display: "flex",
// //                                 justifyContent: "space-between",
// //                                 borderBottom: "1px solid #cbd5e1",
// //                                 paddingBottom: "8px",
// //                                 marginBottom: "8px",
// //                             }}
// //                         >
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.8rem",
// //                                     color: "#475569",
// //                                     fontWeight: 600,
// //                                 }}
// //                             >
// //                                 Official ETI Calculation:
// //                             </span>
// //                             <strong style={{ fontSize: "1.1rem", color: "#16a34a" }}>
// //                                 {formatCurrency(eti)} /mo
// //                             </strong>
// //                         </div>
// //                         <div style={{ display: "flex", justifyContent: "space-between" }}>
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.8rem",
// //                                     color: "#475569",
// //                                     fontWeight: 600,
// //                                 }}
// //                             >
// //                                 Annualized Projection:
// //                             </span>
// //                             <strong
// //                                 style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}
// //                             >
// //                                 {formatCurrency(annualEti)}
// //                             </strong>
// //                         </div>
// //                     </div>

// //                     <div
// //                         style={{
// //                             fontSize: "0.8rem",
// //                             color: "var(--mlab-midnight)",
// //                             fontWeight: 700,
// //                             marginBottom: "8px",
// //                         }}
// //                     >
// //                         Mathematical Formula Check:
// //                     </div>
// //                     <div
// //                         style={{
// //                             background: "#e0e7ff",
// //                             padding: "12px",
// //                             borderRadius: "6px",
// //                             fontSize: "0.85rem",
// //                             color: "#3730a3",
// //                             fontFamily: "monospace",
// //                             fontWeight: 600,
// //                             marginBottom: "1rem",
// //                         }}
// //                     >
// //                         {mathString}
// //                     </div>

// //                     <div
// //                         style={{
// //                             fontSize: "0.8rem",
// //                             color: "var(--mlab-midnight)",
// //                             fontWeight: 700,
// //                             marginBottom: "8px",
// //                         }}
// //                     >
// //                         The SARS Rules (Ages 18-29):
// //                     </div>
// //                     <ul
// //                         style={{
// //                             margin: 0,
// //                             paddingLeft: "1.2rem",
// //                             fontSize: "0.75rem",
// //                             color: "#475569",
// //                             display: "flex",
// //                             flexDirection: "column",
// //                             gap: "6px",
// //                         }}
// //                     >
// //                         <li
// //                             style={{
// //                                 color: wage > 0 && wage < 2000 ? "#16a34a" : "inherit",
// //                                 fontWeight: wage > 0 && wage < 2000 ? 700 : 400,
// //                             }}
// //                         >
// //                             If stipend is R0 – R1,999: ETI = 75% of stipend
// //                         </li>
// //                         <li
// //                             style={{
// //                                 color: wage >= 2000 && wage <= 4499 ? "#16a34a" : "inherit",
// //                                 fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400,
// //                             }}
// //                         >
// //                             If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)
// //                         </li>
// //                         <li
// //                             style={{
// //                                 color: wage >= 4500 && wage < 6500 ? "#16a34a" : "inherit",
// //                                 fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400,
// //                             }}
// //                         >
// //                             If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend -
// //                             R4,500])
// //                         </li>
// //                         <li
// //                             style={{
// //                                 color: wage >= 6500 ? "#dc2626" : "inherit",
// //                                 fontWeight: wage >= 6500 ? 700 : 400,
// //                             }}
// //                         >
// //                             If stipend is R6,500 or more: ETI = R0
// //                         </li>
// //                     </ul>

// //                     <button
// //                         type="button"
// //                         onClick={() => setEtiBreakdownLearner(null)}
// //                         className="wm-btn wm-btn--outline"
// //                         style={{
// //                             width: "100%",
// //                             marginTop: "1.5rem",
// //                             justifyContent: "center",
// //                         }}
// //                     >
// //                         Close Audit Trail
// //                     </button>
// //                 </div>
// //             </div>,
// //             document.body,
// //         );
// //     };

// //     return (
// //         <div
// //             className="animate-fade-in"
// //             style={{
// //                 display: "flex",
// //                 flexDirection: "column",
// //                 gap: "1.5rem",
// //                 paddingBottom: "2rem",
// //             }}
// //         >
// //             {etiBreakdownLearner && <EtiBreakdownModal />}

// //             <style
// //                 dangerouslySetInnerHTML={{
// //                     __html: `
// //                 .quill-content-display { word-wrap: break-word !important; overflow-wrap: break-word !important; max-width: 100% !important; }
// //                 .quill-content-display *, .quill-content-display p, .quill-content-display span, .quill-content-display li { word-wrap: break-word !important; overflow-wrap: break-word !important; line-break: anywhere !important; }
// //                 .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 8px 0 !important; }
// //                 .quill-content-display li { margin-bottom: 4px !important; }
                
// //                 .quill-content-display a { color: #2563eb !important; text-decoration: underline !important; font-weight: 600 !important; cursor: pointer !important; transition: color 0.15s ease !important; }
// //                 .quill-content-display a:hover { color: #1d4ed8 !important; }
// //                 .quill-content-display code { background-color: #f1f5f9 !important; color: #0f172a !important; padding: 3px 6px !important; borderRadius: 4px !important; font-family: monospace !important; font-size: 0.85em !important; }
// //                 .quill-content-display pre { background-color: #1e293b !important; color: #f8fafc !important; padding: 12px 16px !important; borderRadius: 6px !important; font-family: monospace !important; font-size: 0.85rem !important; line-height: 1.5 !important; overflow-x: auto !important; margin: 10px 0 !important; border: 1px solid #334155 !important; white-space: pre-wrap !important; }
// //                 .quill-content-display blockquote { border-left: 4px solid #94a3b8 !important; padding-left: 12px !important; margin: 12px 0 !important; color: #475569 !important; font-style: italic !important; }
// //                 .quill-content-display table { border-collapse: collapse !important; width: 100% !important; margin: 12px 0 !important; font-size: 0.85rem !important; }
// //                 .quill-content-display table th, .quill-content-display table td { border: 1px solid #cbd5e1 !important; padding: 8px 12px !important; text-align: left !important; }
// //                 .quill-content-display table th { background-color: #f8fafc !important; font-weight: 700 !important; color: #0f172a !important; }
// //                 .quill-content-display table tr:nth-child(even) { background-color: #f8fafc !important; }
// //             `,
// //                 }}
// //             />

// //             {/* 🚀 MODAL: VIEW ALL LEARNER LOGS (MAPPED AND LOOPED) */}
// //             {auditLearner &&
// //                 createPortal(
// //                     <div
// //                         className="lfm-overlay"
// //                         onClick={() => setAuditLearner(null)}
// //                         style={{
// //                             zIndex: 999999,
// //                             display: "flex",
// //                             alignItems: "center",
// //                             justifyContent: "center",
// //                             position: "fixed",
// //                             top: 0,
// //                             left: 0,
// //                             right: 0,
// //                             bottom: 0,
// //                             padding: "1.5rem",
// //                             background: "rgba(15, 23, 42, 0.6)",
// //                             backdropFilter: "blur(4px)",
// //                         }}
// //                     >
// //                         {/* 🚀 FIXED SCROLL BOUNDARIES: strict height on the modal wrapper */}
// //                         <div
// //                             className="lfm-modal animate-fade-in"
// //                             onClick={(e) => e.stopPropagation()}
// //                             style={{
// //                                 width: "100%",
// //                                 maxWidth: "800px",
// //                                 height: "90vh",
// //                                 display: "flex",
// //                                 flexDirection: "column",
// //                                 background: "white",
// //                                 borderRadius: "12px",
// //                                 overflow: "hidden",
// //                                 boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
// //                             }}
// //                         >
// //                             <div
// //                                 className="lfm-header"
// //                                 style={{
// //                                     flex: "0 0 auto",
// //                                     padding: "1.25rem 1.5rem",
// //                                     borderBottom: "1px solid #e2e8f0",
// //                                     display: "flex",
// //                                     justifyContent: "space-between",
// //                                     alignItems: "center",
// //                                 }}
// //                             >
// //                                 <h2
// //                                     className="lfm-header__title"
// //                                     style={{
// //                                         display: "flex",
// //                                         alignItems: "center",
// //                                         gap: "8px",
// //                                         margin: 0,
// //                                         fontSize: "1.2rem",
// //                                         color: "var(--mlab-white)",
// //                                     }}
// //                                 >
// //                                     <FileText size={18} /> Workplace Log Audits -{" "}
// //                                     {auditLearner.learnerName}
// //                                 </h2>
// //                                 <button
// //                                     className="lfm-close-btn"
// //                                     onClick={() => setAuditLearner(null)}
// //                                     style={{
// //                                         background: "none",
// //                                         border: "none",
// //                                         cursor: "pointer",
// //                                         color: "#64748b",
// //                                     }}
// //                                 >
// //                                     <X size={20} />
// //                                 </button>
// //                             </div>

// //                             {/* 🚀 FIXED SCROLL BODY: display block, auto scroll, flex-items handled internally */}
// //                             <div
// //                                 className="lfm-body"
// //                                 style={{
// //                                     flex: "1 1 auto",
// //                                     overflowY: "auto",
// //                                     padding: "1.5rem",
// //                                     background: "#f8fafc",
// //                                 }}
// //                             >
// //                                 <div
// //                                     style={{
// //                                         display: "flex",
// //                                         flexDirection: "column",
// //                                         gap: "1rem",
// //                                     }}
// //                                 >
// //                                     {workplaceLogs
// //                                         .filter(
// //                                             (l) =>
// //                                                 l.learnerId === auditLearner.learnerId ||
// //                                                 l.learnerId === auditLearner.idNumber,
// //                                         )
// //                                         .sort(
// //                                             (a, b) =>
// //                                                 new Date(b.dateString).getTime() -
// //                                                 new Date(a.dateString).getTime(),
// //                                         )
// //                                         .map((log) => {
// //                                             const logVersions =
// //                                                 log.history && log.history.length > 0
// //                                                     ? [...log.history, log].sort(
// //                                                         (a, b) =>
// //                                                             new Date(
// //                                                                 b.updatedAt || b.createdAt || 0,
// //                                                             ).getTime() -
// //                                                             new Date(
// //                                                                 a.updatedAt || a.createdAt || 0,
// //                                                             ).getTime(),
// //                                                     )
// //                                                     : [log];

// //                                             const isLogExpanded = expandedLogIds.has(log.id);

// //                                             return (
// //                                                 <div
// //                                                     key={log.id}
// //                                                     style={{
// //                                                         background: "white",
// //                                                         border: "1px solid var(--mlab-border)",
// //                                                         borderRadius: "12px",
// //                                                         overflow: "hidden",
// //                                                         boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
// //                                                     }}
// //                                                 >
// //                                                     {/* Clickable Log Header */}
// //                                                     <div
// //                                                         onClick={() => toggleLogAccordion(log.id)}
// //                                                         style={{
// //                                                             display: "flex",
// //                                                             justifyContent: "space-between",
// //                                                             alignItems: "center",
// //                                                             padding: "1.25rem",
// //                                                             background: isLogExpanded ? "#f8fafc" : "white",
// //                                                             borderBottom: isLogExpanded
// //                                                                 ? "1px solid #f1f5f9"
// //                                                                 : "none",
// //                                                             cursor: "pointer",
// //                                                             transition: "background 0.2s ease",
// //                                                         }}
// //                                                     >
// //                                                         <div
// //                                                             style={{
// //                                                                 display: "flex",
// //                                                                 alignItems: "center",
// //                                                                 gap: "12px",
// //                                                             }}
// //                                                         >
// //                                                             <div
// //                                                                 style={{
// //                                                                     background: "var(--mlab-midnight)",
// //                                                                     width: 36,
// //                                                                     height: 36,
// //                                                                     borderRadius: "8px",
// //                                                                     display: "flex",
// //                                                                     alignItems: "center",
// //                                                                     justifyContent: "center",
// //                                                                     color: "white",
// //                                                                 }}
// //                                                             >
// //                                                                 <Calendar size={16} />
// //                                                             </div>
// //                                                             <div>
// //                                                                 <div
// //                                                                     style={{
// //                                                                         fontWeight: 700,
// //                                                                         color: "var(--mlab-midnight)",
// //                                                                         fontSize: "1rem",
// //                                                                     }}
// //                                                                 >
// //                                                                     {moment(log.dateString).format(
// //                                                                         "dddd, DD MMM YYYY",
// //                                                                     )}
// //                                                                 </div>
// //                                                                 <div
// //                                                                     style={{
// //                                                                         color: "var(--mlab-grey)",
// //                                                                         fontSize: "0.8rem",
// //                                                                         fontWeight: 600,
// //                                                                         display: "flex",
// //                                                                         alignItems: "center",
// //                                                                         gap: "6px",
// //                                                                     }}
// //                                                                 >
// //                                                                     <Clock size={12} /> {log.startTime} -{" "}
// //                                                                     {log.endTime}{" "}
// //                                                                     <span style={{ color: "#ea580c" }}>
// //                                                                         ({log.totalHours} hrs)
// //                                                                     </span>
// //                                                                 </div>
// //                                                             </div>
// //                                                         </div>
// //                                                         <div
// //                                                             style={{
// //                                                                 display: "flex",
// //                                                                 alignItems: "center",
// //                                                                 gap: "12px",
// //                                                             }}
// //                                                         >
// //                                                             {log.status === "Approved" && (
// //                                                                 <span
// //                                                                     style={{
// //                                                                         background: "#dcfce7",
// //                                                                         color: "#166534",
// //                                                                         padding: "4px 10px",
// //                                                                         borderRadius: "6px",
// //                                                                         fontSize: "0.7rem",
// //                                                                         fontWeight: 700,
// //                                                                         textTransform: "uppercase",
// //                                                                         border: "1px solid #bbf7d0",
// //                                                                     }}
// //                                                                 >
// //                                                                     <CheckCircle
// //                                                                         size={12}
// //                                                                         style={{
// //                                                                             display: "inline",
// //                                                                             marginBottom: "-2px",
// //                                                                         }}
// //                                                                     />{" "}
// //                                                                     Approved
// //                                                                 </span>
// //                                                             )}
// //                                                             {log.status === "Pending_Mentor_Approval" && (
// //                                                                 <span
// //                                                                     style={{
// //                                                                         background: "#fef3c7",
// //                                                                         color: "#b45309",
// //                                                                         padding: "4px 10px",
// //                                                                         borderRadius: "6px",
// //                                                                         fontSize: "0.7rem",
// //                                                                         fontWeight: 700,
// //                                                                         textTransform: "uppercase",
// //                                                                         border: "1px solid #fde68a",
// //                                                                     }}
// //                                                                 >
// //                                                                     Pending Review
// //                                                                 </span>
// //                                                             )}
// //                                                             {log.status === "Rejected" && (
// //                                                                 <span
// //                                                                     style={{
// //                                                                         background: "#fee2e2",
// //                                                                         color: "#991b1b",
// //                                                                         padding: "4px 10px",
// //                                                                         borderRadius: "6px",
// //                                                                         fontSize: "0.7rem",
// //                                                                         fontWeight: 700,
// //                                                                         textTransform: "uppercase",
// //                                                                         border: "1px solid #fecaca",
// //                                                                     }}
// //                                                                 >
// //                                                                     Rejected
// //                                                                 </span>
// //                                                             )}
// //                                                             {log.status === "Draft" && (
// //                                                                 <span
// //                                                                     style={{
// //                                                                         background: "#f1f5f9",
// //                                                                         color: "#475569",
// //                                                                         padding: "4px 10px",
// //                                                                         borderRadius: "6px",
// //                                                                         fontSize: "0.7rem",
// //                                                                         fontWeight: 700,
// //                                                                         textTransform: "uppercase",
// //                                                                         border: "1px solid #cbd5e1",
// //                                                                     }}
// //                                                                 >
// //                                                                     Draft
// //                                                                 </span>
// //                                                             )}

// //                                                             <div
// //                                                                 style={{
// //                                                                     color: "#94a3b8",
// //                                                                     display: "flex",
// //                                                                     alignItems: "center",
// //                                                                 }}
// //                                                             >
// //                                                                 {isLogExpanded ? (
// //                                                                     <ChevronUp size={20} />
// //                                                                 ) : (
// //                                                                     <ChevronDown size={20} />
// //                                                                 )}
// //                                                             </div>
// //                                                         </div>
// //                                                     </div>

// //                                                     {/* Collapsible Log Body */}
// //                                                     {isLogExpanded && (
// //                                                         <div
// //                                                             className="animate-fade-in"
// //                                                             style={{ padding: "1.25rem" }}
// //                                                         >
// //                                                             {/* QCTO Alignment Badge */}
// //                                                             {log.isQctoAligned && (
// //                                                                 <div
// //                                                                     style={{
// //                                                                         background: "#f8fafc",
// //                                                                         padding: "10px 12px",
// //                                                                         borderRadius: "8px",
// //                                                                         border: "1px solid #e2e8f0",
// //                                                                         marginBottom: "16px",
// //                                                                     }}
// //                                                                 >
// //                                                                     <div
// //                                                                         style={{
// //                                                                             color: "var(--mlab-midnight)",
// //                                                                             fontWeight: 700,
// //                                                                             fontSize: "0.85rem",
// //                                                                         }}
// //                                                                     >
// //                                                                         {log.workActivityCode}:{" "}
// //                                                                         {log.workActivityLabel}
// //                                                                     </div>
// //                                                                     <div
// //                                                                         style={{
// //                                                                             color: "#475569",
// //                                                                             fontSize: "0.8rem",
// //                                                                             marginTop: "2px",
// //                                                                         }}
// //                                                                     >
// //                                                                         <strong>Topic:</strong> {log.topicTitle}
// //                                                                     </div>
// //                                                                 </div>
// //                                                             )}

// //                                                             {/* Auditing Trail Toggle (If history exists) */}
// //                                                             {log.history && log.history.length > 0 && (
// //                                                                 <div style={{ marginBottom: "16px" }}>
// //                                                                     <button
// //                                                                         type="button"
// //                                                                         onClick={() =>
// //                                                                             toggleHistoryAccordion(log.id)
// //                                                                         }
// //                                                                         style={{
// //                                                                             background: "#f1f5f9",
// //                                                                             border: "1px solid #cbd5e1",
// //                                                                             borderRadius: "6px",
// //                                                                             padding: "4px 10px",
// //                                                                             fontSize: "0.75rem",
// //                                                                             fontWeight: 700,
// //                                                                             color: "#475569",
// //                                                                             display: "flex",
// //                                                                             alignItems: "center",
// //                                                                             gap: "6px",
// //                                                                             cursor: "pointer",
// //                                                                         }}
// //                                                                     >
// //                                                                         <History size={12} />{" "}
// //                                                                         {expandedHistoryIds.has(log.id)
// //                                                                             ? "Hide Full Audit History"
// //                                                                             : `View Full Audit History Trail (${logVersions.length} Versions)`}
// //                                                                     </button>
// //                                                                 </div>
// //                                                             )}

// //                                                             {/* Dynamic Versions Mapper */}
// //                                                             <div
// //                                                                 style={{
// //                                                                     display: "flex",
// //                                                                     flexDirection: "column",
// //                                                                     gap: "1.5rem",
// //                                                                 }}
// //                                                             >
// //                                                                 {(expandedHistoryIds.has(log.id)
// //                                                                     ? logVersions
// //                                                                     : [logVersions[0]]
// //                                                                 ).map((version: any, idx: number) => {
// //                                                                     const isLatest = idx === 0;
// //                                                                     const versionNumber =
// //                                                                         logVersions.length - idx;

// //                                                                     return (
// //                                                                         <div
// //                                                                             key={version.updatedAt || idx}
// //                                                                             style={{
// //                                                                                 position: "relative",
// //                                                                                 paddingLeft: "20px",
// //                                                                                 borderLeft:
// //                                                                                     "2px solid var(--mlab-border)",
// //                                                                             }}
// //                                                                         >
// //                                                                             <div
// //                                                                                 style={{
// //                                                                                     position: "absolute",
// //                                                                                     left: "-8px",
// //                                                                                     top: "0px",
// //                                                                                     width: "14px",
// //                                                                                     height: "14px",
// //                                                                                     borderRadius: "50%",
// //                                                                                     background: isLatest
// //                                                                                         ? "var(--mlab-blue)"
// //                                                                                         : "#cbd5e1",
// //                                                                                     border: "3px solid white",
// //                                                                                 }}
// //                                                                             />

// //                                                                             {/* Version Sub-header */}
// //                                                                             <div
// //                                                                                 style={{
// //                                                                                     display: "flex",
// //                                                                                     justifyContent: "space-between",
// //                                                                                     alignItems: "center",
// //                                                                                     marginBottom: "12px",
// //                                                                                 }}
// //                                                                             >
// //                                                                                 <div
// //                                                                                     style={{
// //                                                                                         margin: 0,
// //                                                                                         fontSize: "0.9rem",
// //                                                                                         fontWeight: 700,
// //                                                                                         color: "var(--mlab-midnight)",
// //                                                                                         display: "flex",
// //                                                                                         alignItems: "center",
// //                                                                                         gap: "8px",
// //                                                                                     }}
// //                                                                                 >
// //                                                                                     Version {versionNumber}
// //                                                                                     {isLatest && (
// //                                                                                         <span
// //                                                                                             style={{
// //                                                                                                 fontSize: "0.65rem",
// //                                                                                                 background: "#e0e7ff",
// //                                                                                                 color: "#3730a3",
// //                                                                                                 padding: "2px 8px",
// //                                                                                                 borderRadius: "12px",
// //                                                                                                 textTransform: "uppercase",
// //                                                                                             }}
// //                                                                                         >
// //                                                                                             Latest
// //                                                                                         </span>
// //                                                                                     )}
// //                                                                                 </div>
// //                                                                                 <div
// //                                                                                     style={{
// //                                                                                         fontSize: "0.75rem",
// //                                                                                         color: "#64748b",
// //                                                                                     }}
// //                                                                                 >
// //                                                                                     {moment(version.updatedAt).format(
// //                                                                                         "DD MMM YYYY, HH:mm",
// //                                                                                     )}
// //                                                                                 </div>
// //                                                                             </div>

// //                                                                             {/* Render Tasks */}
// //                                                                             <div style={{ marginBottom: "1rem" }}>
// //                                                                                 <h4
// //                                                                                     style={{
// //                                                                                         fontSize: "0.7rem",
// //                                                                                         textTransform: "uppercase",
// //                                                                                         color: "var(--mlab-grey)",
// //                                                                                         margin: "0 0 6px 0",
// //                                                                                         letterSpacing: "0.05em",
// //                                                                                     }}
// //                                                                                 >
// //                                                                                     Tasks Performed
// //                                                                                 </h4>
// //                                                                                 <div
// //                                                                                     style={{
// //                                                                                         background: "#f8fafc",
// //                                                                                         padding: "12px",
// //                                                                                         borderRadius: "6px",
// //                                                                                         border: "1px solid #e2e8f0",
// //                                                                                         color: "#334155",
// //                                                                                         fontSize: "0.85rem",
// //                                                                                         lineHeight: 1.6,
// //                                                                                     }}
// //                                                                                     className="quill-content-display"
// //                                                                                     dangerouslySetInnerHTML={{
// //                                                                                         __html:
// //                                                                                             version.tasksPerformed ||
// //                                                                                             '<span style="font-style:italic; color:#94a3b8">No description provided...</span>',
// //                                                                                     }}
// //                                                                                 />
// //                                                                             </div>

// //                                                                             {/* Render Attachments */}
// //                                                                             {version.evidenceUrl && (
// //                                                                                 <div style={{ marginBottom: "1rem" }}>
// //                                                                                     <div
// //                                                                                         style={{
// //                                                                                             display: "flex",
// //                                                                                             alignItems: "center",
// //                                                                                             justifyContent: "space-between",
// //                                                                                             marginBottom: "6px",
// //                                                                                         }}
// //                                                                                     >
// //                                                                                         <h4
// //                                                                                             style={{
// //                                                                                                 fontSize: "0.7rem",
// //                                                                                                 textTransform: "uppercase",
// //                                                                                                 color: "var(--mlab-grey)",
// //                                                                                                 margin: 0,
// //                                                                                                 letterSpacing: "0.05em",
// //                                                                                             }}
// //                                                                                         >
// //                                                                                             Attached Evidence
// //                                                                                         </h4>
// //                                                                                         <button
// //                                                                                             onClick={() =>
// //                                                                                                 setPreviewEvidenceId(
// //                                                                                                     previewEvidenceId ===
// //                                                                                                         version.evidenceUrl
// //                                                                                                         ? null
// //                                                                                                         : version.evidenceUrl,
// //                                                                                                 )
// //                                                                                             }
// //                                                                                             style={{
// //                                                                                                 background: "none",
// //                                                                                                 border: "none",
// //                                                                                                 color: "var(--mlab-blue)",
// //                                                                                                 fontSize: "0.75rem",
// //                                                                                                 fontWeight: 600,
// //                                                                                                 cursor: "pointer",
// //                                                                                                 display: "flex",
// //                                                                                                 alignItems: "center",
// //                                                                                                 gap: "4px",
// //                                                                                             }}
// //                                                                                         >
// //                                                                                             {previewEvidenceId ===
// //                                                                                                 version.evidenceUrl ? (
// //                                                                                                 <EyeOff size={12} />
// //                                                                                             ) : (
// //                                                                                                 <Eye size={12} />
// //                                                                                             )}{" "}
// //                                                                                             {previewEvidenceId ===
// //                                                                                                 version.evidenceUrl
// //                                                                                                 ? "Close File"
// //                                                                                                 : "Preview File"}
// //                                                                                         </button>
// //                                                                                     </div>

// //                                                                                     {previewEvidenceId ===
// //                                                                                         version.evidenceUrl && (
// //                                                                                             <div
// //                                                                                                 className="animate-fade-in"
// //                                                                                                 style={{
// //                                                                                                     padding: "8px",
// //                                                                                                     border:
// //                                                                                                         "1px solid var(--mlab-border)",
// //                                                                                                     borderRadius: "8px",
// //                                                                                                     background: "#f1f5f9",
// //                                                                                                 }}
// //                                                                                             >
// //                                                                                                 <div
// //                                                                                                     style={{
// //                                                                                                         display: "flex",
// //                                                                                                         justifyContent: "flex-end",
// //                                                                                                         marginBottom: "8px",
// //                                                                                                     }}
// //                                                                                                 >
// //                                                                                                     <a
// //                                                                                                         href={version.evidenceUrl}
// //                                                                                                         target="_blank"
// //                                                                                                         rel="noopener noreferrer"
// //                                                                                                         style={{
// //                                                                                                             display: "inline-flex",
// //                                                                                                             alignItems: "center",
// //                                                                                                             gap: "6px",
// //                                                                                                             fontSize: "0.75rem",
// //                                                                                                             fontWeight: 600,
// //                                                                                                             color: "#475569",
// //                                                                                                             background: "white",
// //                                                                                                             padding: "4px 10px",
// //                                                                                                             borderRadius: "4px",
// //                                                                                                             textDecoration: "none",
// //                                                                                                             border: "1px solid #cbd5e1",
// //                                                                                                         }}
// //                                                                                                     >
// //                                                                                                         <ExternalLink size={12} />{" "}
// //                                                                                                         Open Full Screen
// //                                                                                                     </a>
// //                                                                                                 </div>
// //                                                                                                 <div
// //                                                                                                     style={{
// //                                                                                                         width: "100%",
// //                                                                                                         minHeight: "200px",
// //                                                                                                         background: "white",
// //                                                                                                         borderRadius: "4px",
// //                                                                                                         display: "flex",
// //                                                                                                         alignItems: "center",
// //                                                                                                         justifyContent: "center",
// //                                                                                                         overflow: "hidden",
// //                                                                                                     }}
// //                                                                                                 >
// //                                                                                                     {isImageFile(
// //                                                                                                         version.evidenceUrl,
// //                                                                                                     ) ? (
// //                                                                                                         <img
// //                                                                                                             src={version.evidenceUrl}
// //                                                                                                             alt="Evidence Render inline"
// //                                                                                                             style={{
// //                                                                                                                 maxWidth: "100%",
// //                                                                                                                 maxHeight: "400px",
// //                                                                                                                 objectFit: "contain",
// //                                                                                                             }}
// //                                                                                                         />
// //                                                                                                     ) : (
// //                                                                                                         <iframe
// //                                                                                                             src={version.evidenceUrl}
// //                                                                                                             title="Evidence Preview Frame"
// //                                                                                                             style={{
// //                                                                                                                 width: "100%",
// //                                                                                                                 height: "350px",
// //                                                                                                                 border: "none",
// //                                                                                                             }}
// //                                                                                                         />
// //                                                                                                     )}
// //                                                                                                 </div>
// //                                                                                             </div>
// //                                                                                         )}
// //                                                                                 </div>
// //                                                                             )}

// //                                                                             {/* Render Rejection Note if applicable */}
// //                                                                             {version.rejectionReason &&
// //                                                                                 version.status !== "Approved" && (
// //                                                                                     <div
// //                                                                                         style={{
// //                                                                                             background:
// //                                                                                                 version.status === "Rejected"
// //                                                                                                     ? "#fff1f2"
// //                                                                                                     : "#f8fafc",
// //                                                                                             border: `1px dashed ${version.status === "Rejected" ? "#fca5a5" : "#cbd5e1"}`,
// //                                                                                             padding: "12px",
// //                                                                                             borderRadius: "6px",
// //                                                                                             display: "flex",
// //                                                                                             gap: "8px",
// //                                                                                             alignItems: "flex-start",
// //                                                                                         }}
// //                                                                                     >
// //                                                                                         <AlertTriangle
// //                                                                                             size={16}
// //                                                                                             color={
// //                                                                                                 version.status === "Rejected"
// //                                                                                                     ? "#be123c"
// //                                                                                                     : "#475569"
// //                                                                                             }
// //                                                                                             style={{
// //                                                                                                 marginTop: "2px",
// //                                                                                                 flexShrink: 0,
// //                                                                                             }}
// //                                                                                         />
// //                                                                                         <div style={{ width: "100%" }}>
// //                                                                                             <strong
// //                                                                                                 style={{
// //                                                                                                     fontSize: "0.75rem",
// //                                                                                                     textTransform: "uppercase",
// //                                                                                                     color:
// //                                                                                                         version.status ===
// //                                                                                                             "Rejected"
// //                                                                                                             ? "#be123c"
// //                                                                                                             : "#475569",
// //                                                                                                     display: "block",
// //                                                                                                     marginBottom: "4px",
// //                                                                                                     letterSpacing: "0.05em",
// //                                                                                                 }}
// //                                                                                             >
// //                                                                                                 {version.status === "Rejected"
// //                                                                                                     ? "Mentor's Correction Notice"
// //                                                                                                     : "Resolved Revision Notes"}
// //                                                                                             </strong>
// //                                                                                             <div
// //                                                                                                 className="quill-content-display"
// //                                                                                                 style={{
// //                                                                                                     color:
// //                                                                                                         version.status ===
// //                                                                                                             "Rejected"
// //                                                                                                             ? "#9f1239"
// //                                                                                                             : "#334155",
// //                                                                                                     fontSize: "0.85rem",
// //                                                                                                     lineHeight: 1.5,
// //                                                                                                 }}
// //                                                                                                 dangerouslySetInnerHTML={{
// //                                                                                                     __html:
// //                                                                                                         version.rejectionReason,
// //                                                                                                 }}
// //                                                                                             />
// //                                                                                         </div>
// //                                                                                     </div>
// //                                                                                 )}
// //                                                                         </div>
// //                                                                     );
// //                                                                 })}
// //                                                             </div>
// //                                                         </div>
// //                                                     )}
// //                                                 </div>
// //                                             );
// //                                         })}
// //                                 </div>
// //                             </div>

// //                             <div
// //                                 className="lfm-footer"
// //                                 style={{
// //                                     flex: "0 0 auto",
// //                                     display: "flex",
// //                                     justifyContent: "flex-end",
// //                                     padding: "1rem 1.5rem",
// //                                     background: "white",
// //                                     borderTop: "1px solid #e2e8f0",
// //                                 }}
// //                             >
// //                                 <button
// //                                     className="mlab-btn mlab-btn--ghost"
// //                                     onClick={() => setAuditLearner(null)}
// //                                     style={{
// //                                         background: "#f1f5f9",
// //                                         color: "#475569",
// //                                         border: "none",
// //                                         padding: "8px 16px",
// //                                         borderRadius: "6px",
// //                                         fontWeight: 600,
// //                                         cursor: "pointer",
// //                                     }}
// //                                 >
// //                                     Close Audit Window
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     </div>,
// //                     document.body,
// //                 )}

// //             {/* ── BREADCRUMB & HEADER ── */}
// //             <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
// //                 <button
// //                     onClick={onBack}
// //                     style={{
// //                         background: "white",
// //                         border: "1px solid var(--mlab-border)",
// //                         borderRadius: "8px",
// //                         padding: "8px",
// //                         cursor: "pointer",
// //                         color: "var(--mlab-midnight)",
// //                         display: "flex",
// //                         alignItems: "center",
// //                         justifyContent: "center",
// //                         marginTop: "4px",
// //                     }}
// //                 >
// //                     <ArrowLeft size={18} />
// //                 </button>
// //                 <div>
// //                     <div
// //                         style={{
// //                             fontSize: "0.8rem",
// //                             color: "#64748b",
// //                             fontWeight: 600,
// //                             marginBottom: "4px",
// //                             textTransform: "uppercase",
// //                             letterSpacing: "0.05em",
// //                         }}
// //                     >
// //                         Host Company Profile
// //                     </div>
// //                     <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
// //                         <h1
// //                             style={{
// //                                 margin: 0,
// //                                 fontSize: "1.8rem",
// //                                 fontFamily: "var(--font-heading)",
// //                                 color: "var(--mlab-midnight)",
// //                                 lineHeight: 1.2,
// //                             }}
// //                         >
// //                             {company.name}
// //                         </h1>
// //                         {isComplianceLoading && (
// //                             <Loader2 size={20} className="wm-spin" color="var(--mlab-blue)" />
// //                         )}
// //                     </div>

// //                     <div
// //                         style={{
// //                             display: "flex",
// //                             flexWrap: "wrap",
// //                             gap: "12px",
// //                             marginTop: "8px",
// //                             fontSize: "0.85rem",
// //                             color: "#475569",
// //                         }}
// //                     >
// //                         {company.registrationNumber && (
// //                             <span
// //                                 style={{ display: "flex", alignItems: "center", gap: "4px" }}
// //                             >
// //                                 <Hash size={13} /> {company.registrationNumber}
// //                             </span>
// //                         )}
// //                         {company.physicalAddress && (
// //                             <span
// //                                 style={{ display: "flex", alignItems: "center", gap: "4px" }}
// //                             >
// //                                 <MapPin size={13} /> {company.physicalAddress}
// //                             </span>
// //                         )}
// //                         {company.contactPerson && (
// //                             <span
// //                                 style={{ display: "flex", alignItems: "center", gap: "4px" }}
// //                             >
// //                                 <Mail size={13} /> {company.contactEmail}
// //                             </span>
// //                         )}
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* ── ALERTS SECTION FOR QUALITY SIGNALS ── */}
// //             {complianceMetrics.overloadedMentors > 0 && (
// //                 <div
// //                     style={{
// //                         background: "#fef2f2",
// //                         border: "1px solid #fecaca",
// //                         borderRadius: "8px",
// //                         padding: "12px 16px",
// //                         display: "flex",
// //                         alignItems: "center",
// //                         gap: "10px",
// //                         color: "#991b1b",
// //                         fontSize: "0.8rem",
// //                         fontWeight: 600,
// //                     }}
// //                 >
// //                     <ShieldAlert size={16} />
// //                     <span>
// //                         <strong>SETA Quality Warning:</strong>{" "}
// //                         {complianceMetrics.overloadedMentors} assigned mentor(s) currently
// //                         exceed the recommended 1:4 supervisor-to-learner load constraint.
// //                     </span>
// //                 </div>
// //             )}

// //             {/* ── OPERATIONAL KPI RIBBON ── */}
// //             <div className="cdp-stat-row">
// //                 <div className="cdp-stat-card cdp-stat-card--blue">
// //                     <div className="cdp-stat-card__icon">
// //                         <Briefcase size={20} />
// //                     </div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value">{activeCount}</span>
// //                         <span className="cdp-stat-card__label">Active Interns</span>
// //                     </div>
// //                 </div>
// //                 <div className="cdp-stat-card cdp-stat-card--green">
// //                     <div className="cdp-stat-card__icon">
// //                         <Award size={20} />
// //                     </div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value">{completedCount}</span>
// //                         <span className="cdp-stat-card__label">Completed Programs</span>
// //                     </div>
// //                 </div>
// //                 <div className="cdp-stat-card cdp-stat-card--amber">
// //                     <div className="cdp-stat-card__icon">
// //                         <FileText size={20} />
// //                     </div>
// //                     <div className="cdp-stat-card__body">
// //                         <span
// //                             className="cdp-stat-card__value"
// //                             style={{
// //                                 color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit",
// //                             }}
// //                         >
// //                             {missingContracts}
// //                         </span>
// //                         <span className="cdp-stat-card__label">Missing Contracts</span>
// //                     </div>
// //                 </div>
// //                 <div className="cdp-stat-card cdp-stat-card--grey">
// //                     <div className="cdp-stat-card__icon">
// //                         <AlertTriangle size={20} color="var(--mlab-red)" />
// //                     </div>
// //                     <div className="cdp-stat-card__body">
// //                         <span
// //                             className="cdp-stat-card__value"
// //                             style={{
// //                                 color: droppedCount > 0 ? "var(--mlab-red)" : "inherit",
// //                             }}
// //                         >
// //                             {droppedCount}
// //                         </span>
// //                         <span className="cdp-stat-card__label">Dropped / Terminated</span>
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* ── COMPLIANCE & REBATE INTELLIGENCE GRID ── */}
// //             <div
// //                 style={{
// //                     background: "#fffbeb",
// //                     border: "1px solid #fde68a",
// //                     borderRadius: "12px",
// //                     padding: "1.5rem",
// //                     display: "flex",
// //                     flexDirection: "column",
// //                     gap: "1.5rem",
// //                     boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
// //                 }}
// //             >
// //                 <div
// //                     style={{
// //                         display: "flex",
// //                         alignItems: "center",
// //                         gap: "8px",
// //                         color: "#92400e",
// //                         fontWeight: 800,
// //                         fontSize: "0.9rem",
// //                         textTransform: "uppercase",
// //                         letterSpacing: "0.05em",
// //                     }}
// //                 >
// //                     <Calculator size={18} /> Strategic Employment Equity & Scorecard
// //                     Auditor
// //                 </div>

// //                 <div
// //                     style={{
// //                         display: "grid",
// //                         gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
// //                         gap: "1.25rem",
// //                     }}
// //                 >
// //                     {/* SARS ETI Yield Framework with Ring */}
// //                     <div
// //                         style={{
// //                             position: "relative",
// //                             background: "white",
// //                             padding: "1.25rem",
// //                             borderRadius: "8px",
// //                             border: "1px solid #fcd34d",
// //                             display: "flex",
// //                             gap: "1rem",
// //                             alignItems: "center",
// //                         }}
// //                     >
// //                         <RingGauge
// //                             percentage={complianceMetrics.etiYieldPercentage}
// //                             color="#16a34a"
// //                         />
// //                         <div style={{ flex: 1 }}>
// //                             <div
// //                                 style={{
// //                                     display: "flex",
// //                                     justifyContent: "space-between",
// //                                     alignItems: "center",
// //                                 }}
// //                             >
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.75rem",
// //                                         color: "#92400e",
// //                                         fontWeight: 700,
// //                                         textTransform: "uppercase",
// //                                     }}
// //                                 >
// //                                     SARS ETI Opt. Yield
// //                                 </span>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() =>
// //                                         setActiveInsight(activeInsight === "eti" ? null : "eti")
// //                                     }
// //                                     style={{
// //                                         background: "none",
// //                                         border: "none",
// //                                         cursor: "pointer",
// //                                         color: "#b45309",
// //                                         display: "flex",
// //                                     }}
// //                                 >
// //                                     <Info size={14} />
// //                                 </button>
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     fontSize: "1.3rem",
// //                                     fontWeight: 900,
// //                                     color: "var(--mlab-midnight)",
// //                                     fontFamily: "var(--font-heading)",
// //                                     marginTop: "2px",
// //                                 }}
// //                             >
// //                                 {formatCurrency(complianceMetrics.monthlyETITotal)}
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.8rem",
// //                                         color: "#64748b",
// //                                         fontWeight: 500,
// //                                     }}
// //                                 >
// //                                     {" "}
// //                                     /mo
// //                                 </span>
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     background: "#f1f5f9",
// //                                     padding: "2px 6px",
// //                                     borderRadius: "4px",
// //                                     fontSize: "0.65rem",
// //                                     color: "#475569",
// //                                     fontWeight: 700,
// //                                     display: "inline-block",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 Annually:{" "}
// //                                 {formatCurrency(complianceMetrics.annualizedETIEstimate)}
// //                             </div>
// //                             {activeInsight === "eti" && (
// //                                 <InsightPopup
// //                                     title="SARS Employment Tax Incentive"
// //                                     currentValue={`${complianceMetrics.etiYieldPercentage}% of Active Interns are ETI-Optimized`}
// //                                     actionSteps={[
// //                                         <span key="1">
// //                                             <strong>Live Calculation:</strong> Value is compiled
// //                                             dynamically by evaluating every active learner's recorded
// //                                             stipend against the official SARS ETI sliding scale.
// //                                         </span>,
// //                                         <span key="2">
// //                                             <strong>To Optimize:</strong> Ensure interns fall within
// //                                             the 18-29 age bracket and earn between R2,000 and R6,500
// //                                             to max the algorithm.
// //                                         </span>,
// //                                         <span key="3">
// //                                             <strong>View Math:</strong> Scroll down to the placement
// //                                             ledger and click on any green ETI button to view the exact
// //                                             math breakdown.
// //                                         </span>,
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     {/* SECTION 12H TAX ALLOWANCE */}
// //                     <div
// //                         style={{
// //                             position: "relative",
// //                             background: "white",
// //                             padding: "1.25rem",
// //                             borderRadius: "8px",
// //                             border: "1px solid #fcd34d",
// //                             display: "flex",
// //                             gap: "1rem",
// //                             alignItems: "center",
// //                         }}
// //                     >
// //                         <div
// //                             style={{
// //                                 background: "#e0e7ff",
// //                                 padding: "12px",
// //                                 borderRadius: "50%",
// //                                 color: "#4338ca",
// //                                 height: "fit-content",
// //                             }}
// //                         >
// //                             <Receipt size={24} />
// //                         </div>
// //                         <div style={{ flex: 1 }}>
// //                             <div
// //                                 style={{
// //                                     display: "flex",
// //                                     justifyContent: "space-between",
// //                                     alignItems: "center",
// //                                 }}
// //                             >
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.75rem",
// //                                         color: "#3730a3",
// //                                         fontWeight: 700,
// //                                         textTransform: "uppercase",
// //                                     }}
// //                                 >
// //                                     Sec. 12H Tax Rebates
// //                                 </span>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() =>
// //                                         setActiveInsight(activeInsight === "s12h" ? null : "s12h")
// //                                     }
// //                                     style={{
// //                                         background: "none",
// //                                         border: "none",
// //                                         cursor: "pointer",
// //                                         color: "#4338ca",
// //                                         display: "flex",
// //                                     }}
// //                                 >
// //                                     <Info size={14} />
// //                                 </button>
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     fontSize: "1.3rem",
// //                                     fontWeight: 900,
// //                                     color: "var(--mlab-midnight)",
// //                                     fontFamily: "var(--font-heading)",
// //                                     marginTop: "2px",
// //                                 }}
// //                             >
// //                                 {formatCurrency(complianceMetrics.totalS12hProjected)}
// //                             </div>
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.65rem",
// //                                     color: "#64748b",
// //                                     display: "block",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 Projected total cycle deduction allowance.
// //                             </span>
// //                             {activeInsight === "s12h" && (
// //                                 <InsightPopup
// //                                     title="Section 12H Tax Deductions"
// //                                     currentValue={formatCurrency(
// //                                         complianceMetrics.totalS12hProjected,
// //                                     )}
// //                                     actionSteps={[
// //                                         <span key="1">
// //                                             <strong>Live Calculation:</strong> R80,000 (Commencement +
// //                                             Completion) per able-bodied learner. R120,000 per learner
// //                                             with an uploaded Disability Code.
// //                                         </span>,
// //                                         <span key="2">
// //                                             <strong>To Optimize:</strong> This allowance is claimed
// //                                             against taxable income. Terminated/Dropped learners do not
// //                                             qualify for the completion allowance portion.
// //                                         </span>,
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     {/* B-BBEE Skills Development Spend Tracker */}
// //                     <div
// //                         style={{
// //                             position: "relative",
// //                             background: "white",
// //                             padding: "1.25rem",
// //                             borderRadius: "8px",
// //                             border: "1px solid #fcd34d",
// //                             display: "flex",
// //                             gap: "1rem",
// //                             alignItems: "center",
// //                         }}
// //                     >
// //                         <div
// //                             style={{
// //                                 background: "#f1f5f9",
// //                                 padding: "12px",
// //                                 borderRadius: "50%",
// //                                 color: "#475569",
// //                                 height: "fit-content",
// //                             }}
// //                         >
// //                             <Wallet size={24} />
// //                         </div>
// //                         <div style={{ flex: 1 }}>
// //                             <div
// //                                 style={{
// //                                     display: "flex",
// //                                     justifyContent: "space-between",
// //                                     alignItems: "center",
// //                                 }}
// //                             >
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.75rem",
// //                                         color: "#475569",
// //                                         fontWeight: 700,
// //                                         textTransform: "uppercase",
// //                                     }}
// //                                 >
// //                                     Recognized Spend
// //                                 </span>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() =>
// //                                         setActiveInsight(activeInsight === "spend" ? null : "spend")
// //                                     }
// //                                     style={{
// //                                         background: "none",
// //                                         border: "none",
// //                                         cursor: "pointer",
// //                                         color: "#64748b",
// //                                         display: "flex",
// //                                     }}
// //                                 >
// //                                     <Info size={14} />
// //                                 </button>
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     fontSize: "1.3rem",
// //                                     fontWeight: 900,
// //                                     color: "var(--mlab-midnight)",
// //                                     fontFamily: "var(--font-heading)",
// //                                     marginTop: "2px",
// //                                 }}
// //                             >
// //                                 {formatCurrency(complianceMetrics.totalProjectedSpend)}
// //                             </div>
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.65rem",
// //                                     color: "#64748b",
// //                                     display: "block",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 Projected stipend capital applied to training elements.
// //                             </span>
// //                             {activeInsight === "spend" && (
// //                                 <InsightPopup
// //                                     title="Skills Target Spend"
// //                                     currentValue={formatCurrency(
// //                                         complianceMetrics.totalProjectedSpend,
// //                                     )}
// //                                     actionSteps={[
// //                                         <span key="1">
// //                                             <strong>Live Calculation:</strong> Multiplying recorded
// //                                             stipends by duration timelines.
// //                                         </span>,
// //                                         <span key="2">
// //                                             <strong>To Optimize:</strong> Ensure all placements have
// //                                             an accurate Stipend Amount logged in the ledger, as this
// //                                             counts directly toward your B-BBEE 3-6% payroll skills
// //                                             target.
// //                                         </span>,
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     {/* RACIAL AND GENDER DEMOGRAPHICS */}
// //                     <div
// //                         style={{
// //                             position: "relative",
// //                             background: "white",
// //                             padding: "1.25rem",
// //                             borderRadius: "8px",
// //                             border: "1px solid #fcd34d",
// //                             display: "flex",
// //                             gap: "1rem",
// //                             alignItems: "center",
// //                         }}
// //                     >
// //                         <RingGauge
// //                             percentage={complianceMetrics.transformationPercentage}
// //                             color="#b45309"
// //                         />
// //                         <div style={{ flex: 1 }}>
// //                             <div
// //                                 style={{
// //                                     display: "flex",
// //                                     justifyContent: "space-between",
// //                                     alignItems: "center",
// //                                 }}
// //                             >
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.75rem",
// //                                         color: "#92400e",
// //                                         fontWeight: 700,
// //                                         textTransform: "uppercase",
// //                                     }}
// //                                 >
// //                                     Race & Gender Split
// //                                 </span>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() =>
// //                                         setActiveInsight(
// //                                             activeInsight === "transformation"
// //                                                 ? null
// //                                                 : "transformation",
// //                                         )
// //                                     }
// //                                     style={{
// //                                         background: "none",
// //                                         border: "none",
// //                                         cursor: "pointer",
// //                                         color: "#b45309",
// //                                         display: "flex",
// //                                     }}
// //                                 >
// //                                     <Info size={14} />
// //                                 </button>
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     fontSize: "1.1rem",
// //                                     fontWeight: 900,
// //                                     color: "var(--mlab-midnight)",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 {complianceMetrics.raceCounts.African}A |{" "}
// //                                 {complianceMetrics.raceCounts.Coloured}C |{" "}
// //                                 {complianceMetrics.raceCounts.Indian}I |{" "}
// //                                 {complianceMetrics.raceCounts.White}W
// //                             </div>
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.65rem",
// //                                     color: "#64748b",
// //                                     display: "block",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 Gender:{" "}
// //                                 <strong style={{ color: "var(--mlab-blue)" }}>
// //                                     {complianceMetrics.totalFemale} Female /{" "}
// //                                     {complianceMetrics.totalMale} Male
// //                                 </strong>
// //                             </span>
// //                             {activeInsight === "transformation" && (
// //                                 <InsightPopup
// //                                     title="EEA2 Alignment Breakdown"
// //                                     currentValue="Total Demographics Ledger"
// //                                     actionSteps={[
// //                                         <span key="1">
// //                                             <strong>Headcounts:</strong> African (
// //                                             {complianceMetrics.raceCounts.African}), Coloured (
// //                                             {complianceMetrics.raceCounts.Coloured}), Indian (
// //                                             {complianceMetrics.raceCounts.Indian}), White (
// //                                             {complianceMetrics.raceCounts.White}).
// //                                         </span>,
// //                                         <span key="2">
// //                                             <strong>B-BBEE Focus:</strong> Under Code Series 300,
// //                                             Skills Development sub-minimum calculations exclude White
// //                                             candidates from positive point matrices.
// //                                         </span>,
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     {/* DISABILITY INDEX CHECK */}
// //                     <div
// //                         style={{
// //                             position: "relative",
// //                             background: "white",
// //                             padding: "1.25rem",
// //                             borderRadius: "8px",
// //                             border: "1px solid #fcd34d",
// //                             display: "flex",
// //                             gap: "1rem",
// //                             alignItems: "center",
// //                         }}
// //                     >
// //                         <RingGauge
// //                             percentage={complianceMetrics.disabilityPercentage}
// //                             color="#7c3aed"
// //                         />
// //                         <div style={{ flex: 1 }}>
// //                             <div
// //                                 style={{
// //                                     display: "flex",
// //                                     justifyContent: "space-between",
// //                                     alignItems: "center",
// //                                 }}
// //                             >
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.75rem",
// //                                         color: "#6d28d9",
// //                                         fontWeight: 700,
// //                                         textTransform: "uppercase",
// //                                     }}
// //                                 >
// //                                     Disability Framework
// //                                 </span>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() =>
// //                                         setActiveInsight(
// //                                             activeInsight === "disability" ? null : "disability",
// //                                         )
// //                                     }
// //                                     style={{
// //                                         background: "none",
// //                                         border: "none",
// //                                         cursor: "pointer",
// //                                         color: "#6d28d9",
// //                                         display: "flex",
// //                                     }}
// //                                 >
// //                                     <Info size={14} />
// //                                 </button>
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     fontSize: "1.3rem",
// //                                     fontWeight: 900,
// //                                     color: "var(--mlab-midnight)",
// //                                     fontFamily: "var(--font-heading)",
// //                                     marginTop: "2px",
// //                                 }}
// //                             >
// //                                 {complianceMetrics.disabilityCount}{" "}
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.8rem",
// //                                         color: "#64748b",
// //                                         fontWeight: 500,
// //                                     }}
// //                                 >
// //                                     Learners
// //                                 </span>
// //                             </div>
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.65rem",
// //                                     color: "#64748b",
// //                                     display: "block",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 Reflects a ratio of{" "}
// //                                 <strong>{complianceMetrics.disabilityPercentage}%</strong> of
// //                                 total context.
// //                             </span>
// //                             {activeInsight === "disability" && (
// //                                 <InsightPopup
// //                                     title="Disability Compliance Target"
// //                                     currentValue={`${complianceMetrics.disabilityCount} Headcount`}
// //                                     actionSteps={[
// //                                         <span key="1">
// //                                             <strong>Audit Rule:</strong> Each instance listed here
// //                                             must maintain a verified medical certificate signed by an
// //                                             operating practitioner to claim Section 12H bonus
// //                                             deductions (R120k vs R80k).
// //                                         </span>,
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     {/* YOUTH DEVELOPMENT PROFILES */}
// //                     <div
// //                         style={{
// //                             position: "relative",
// //                             background: "white",
// //                             padding: "1.25rem",
// //                             borderRadius: "8px",
// //                             border: "1px solid #fcd34d",
// //                             display: "flex",
// //                             gap: "1rem",
// //                             alignItems: "center",
// //                         }}
// //                     >
// //                         <RingGauge
// //                             percentage={complianceMetrics.youthPercentage}
// //                             color="#059669"
// //                         />
// //                         <div style={{ flex: 1 }}>
// //                             <div
// //                                 style={{
// //                                     display: "flex",
// //                                     justifyContent: "space-between",
// //                                     alignItems: "center",
// //                                 }}
// //                             >
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.75rem",
// //                                         color: "#047857",
// //                                         fontWeight: 700,
// //                                         textTransform: "uppercase",
// //                                     }}
// //                                 >
// //                                     Youth Demographics
// //                                 </span>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() =>
// //                                         setActiveInsight(activeInsight === "youth" ? null : "youth")
// //                                     }
// //                                     style={{
// //                                         background: "none",
// //                                         border: "none",
// //                                         cursor: "pointer",
// //                                         color: "#047857",
// //                                         display: "flex",
// //                                     }}
// //                                 >
// //                                     <Info size={14} />
// //                                 </button>
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     fontSize: "1.3rem",
// //                                     fontWeight: 900,
// //                                     color: "var(--mlab-midnight)",
// //                                     fontFamily: "var(--font-heading)",
// //                                     marginTop: "2px",
// //                                 }}
// //                             >
// //                                 {complianceMetrics.youthCount}{" "}
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.8rem",
// //                                         color: "#64748b",
// //                                         fontWeight: 500,
// //                                     }}
// //                                 >
// //                                     under 35
// //                                 </span>
// //                             </div>
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.65rem",
// //                                     color: "#64748b",
// //                                     display: "block",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 <strong>{complianceMetrics.youthPercentage}%</strong> match for
// //                                 South African Youth initiatives.
// //                             </span>
// //                             {activeInsight === "youth" && (
// //                                 <InsightPopup
// //                                     title="National Youth Framework Alignment"
// //                                     currentValue={`${complianceMetrics.youthPercentage}% of candidates are under 35`}
// //                                     actionSteps={[
// //                                         <span key="1">
// //                                             <strong>Eligibility:</strong> Validates candidates under
// //                                             the age of 35 per the National Youth Development Agency
// //                                             framework.
// //                                         </span>,
// //                                         <span key="2">
// //                                             <strong>Impact:</strong> Drives specific reporting metrics
// //                                             for state-sponsored skills funding elements.
// //                                         </span>,
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     {/* ABSORPTION AND PERMANENT PLACEMENT */}
// //                     <div
// //                         style={{
// //                             position: "relative",
// //                             background: "white",
// //                             padding: "1.25rem",
// //                             borderRadius: "8px",
// //                             border: "1px solid #fcd34d",
// //                             display: "flex",
// //                             gap: "1rem",
// //                             alignItems: "center",
// //                         }}
// //                     >
// //                         <RingGauge
// //                             percentage={complianceMetrics.absorptionRate}
// //                             color="#0ea5e9"
// //                         />
// //                         <div style={{ flex: 1 }}>
// //                             <div
// //                                 style={{
// //                                     display: "flex",
// //                                     justifyContent: "space-between",
// //                                     alignItems: "center",
// //                                 }}
// //                             >
// //                                 <span
// //                                     style={{
// //                                         fontSize: "0.75rem",
// //                                         color: "#0369a1",
// //                                         fontWeight: 700,
// //                                         textTransform: "uppercase",
// //                                     }}
// //                                 >
// //                                     Absorption Rate
// //                                 </span>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() =>
// //                                         setActiveInsight(
// //                                             activeInsight === "absorption" ? null : "absorption",
// //                                         )
// //                                     }
// //                                     style={{
// //                                         background: "none",
// //                                         border: "none",
// //                                         cursor: "pointer",
// //                                         color: "#0284c7",
// //                                         display: "flex",
// //                                     }}
// //                                 >
// //                                     <Info size={14} />
// //                                 </button>
// //                             </div>
// //                             <div
// //                                 style={{
// //                                     fontSize: "1.3rem",
// //                                     fontWeight: 900,
// //                                     color: "var(--mlab-midnight)",
// //                                     fontFamily: "var(--font-heading)",
// //                                     marginTop: "2px",
// //                                 }}
// //                             >
// //                                 {complianceMetrics.absorptionRate}% Absorbed
// //                             </div>
// //                             <span
// //                                 style={{
// //                                     fontSize: "0.65rem",
// //                                     color: "#64748b",
// //                                     display: "block",
// //                                     marginTop: "4px",
// //                                 }}
// //                             >
// //                                 Gender Split:{" "}
// //                                 <strong style={{ color: "var(--mlab-blue)" }}>
// //                                     {complianceMetrics.absorbedFemale}F /{" "}
// //                                     {complianceMetrics.absorbedMale}M
// //                                 </strong>
// //                             </span>
// //                             {activeInsight === "absorption" && (
// //                                 <InsightPopup
// //                                     title="B-BBEE Scorecard Absorption"
// //                                     currentValue={`${complianceMetrics.absorptionRate}% Total | ${complianceMetrics.absorbedFemale}F / ${complianceMetrics.absorbedMale}M Split`}
// //                                     actionSteps={[
// //                                         <span key="1">
// //                                             <strong>Target:</strong> 100% absorption unlocks 5 B-BBEE
// //                                             Bonus Points under Code Series 300.
// //                                         </span>,
// //                                         <span key="2">
// //                                             <strong>To Optimize:</strong> Secure key scorecard bonus
// //                                             allocations by confirming permanent transitions upon
// //                                             program completion. Ensure status is set to "Absorbed".
// //                                         </span>,
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* ── PLACEMENT LEDGER DATA GRID ── */}
// //             <div className="cdp-panel">
// //                 <div className="vp-card" style={{ marginBottom: 0 }}>
// //                     <div
// //                         className="vp-card-header"
// //                         style={{ borderBottom: "none", paddingBottom: 0 }}
// //                     >
// //                         <div className="vp-card-title-group">
// //                             <Users size={18} color="var(--mlab-blue)" />
// //                             <h3
// //                                 style={{
// //                                     margin: 0,
// //                                     fontFamily: "var(--font-heading)",
// //                                     color: "var(--mlab-blue)",
// //                                     textTransform: "uppercase",
// //                                 }}
// //                             >
// //                                 Placement Ledger
// //                             </h3>
// //                         </div>
// //                     </div>

// //                     <div
// //                         style={{
// //                             display: "flex",
// //                             justifyContent: "space-between",
// //                             alignItems: "flex-end",
// //                             padding: "0 1.5rem",
// //                             borderBottom: "1px solid var(--mlab-border)",
// //                             marginTop: "1rem",
// //                             background: "#f8fafc",
// //                             flexWrap: "wrap",
// //                             gap: "1rem",
// //                         }}
// //                     >
// //                         <div style={{ display: "flex", gap: "1.5rem" }}>
// //                             <button
// //                                 onClick={() => setActiveTab("active")}
// //                                 style={{
// //                                     padding: "12px 0",
// //                                     border: "none",
// //                                     background: "none",
// //                                     color:
// //                                         activeTab === "active" ? "var(--mlab-blue)" : "#64748b",
// //                                     fontWeight: activeTab === "active" ? 700 : 500,
// //                                     fontSize: "0.85rem",
// //                                     cursor: "pointer",
// //                                     borderBottom:
// //                                         activeTab === "active"
// //                                             ? "2px solid var(--mlab-blue)"
// //                                             : "2px solid transparent",
// //                                     display: "flex",
// //                                     alignItems: "center",
// //                                     gap: "6px",
// //                                 }}
// //                             >
// //                                 Active Interns{" "}
// //                                 <span
// //                                     style={{
// //                                         background: activeTab === "active" ? "#e0e7ff" : "#f1f5f9",
// //                                         color:
// //                                             activeTab === "active" ? "var(--mlab-blue)" : "#94a3b8",
// //                                         padding: "2px 6px",
// //                                         borderRadius: "12px",
// //                                         fontSize: "0.7rem",
// //                                     }}
// //                                 >
// //                                     {activeCount}
// //                                 </span>
// //                             </button>
// //                             <button
// //                                 onClick={() => setActiveTab("history")}
// //                                 style={{
// //                                     padding: "12px 0",
// //                                     border: "none",
// //                                     background: "none",
// //                                     color:
// //                                         activeTab === "history" ? "var(--mlab-blue)" : "#64748b",
// //                                     fontWeight: activeTab === "history" ? 700 : 500,
// //                                     fontSize: "0.85rem",
// //                                     cursor: "pointer",
// //                                     borderBottom:
// //                                         activeTab === "history"
// //                                             ? "2px solid var(--mlab-blue)"
// //                                             : "2px solid transparent",
// //                                     display: "flex",
// //                                     alignItems: "center",
// //                                     gap: "6px",
// //                                 }}
// //                             >
// //                                 History (Completed / Dropped){" "}
// //                                 <span
// //                                     style={{
// //                                         background: activeTab === "history" ? "#e0e7ff" : "#f1f5f9",
// //                                         color:
// //                                             activeTab === "history" ? "var(--mlab-blue)" : "#94a3b8",
// //                                         padding: "2px 6px",
// //                                         borderRadius: "12px",
// //                                         fontSize: "0.7rem",
// //                                     }}
// //                                 >
// //                                     {completedCount + droppedCount}
// //                                 </span>
// //                             </button>
// //                             <button
// //                                 onClick={() => setActiveTab("all")}
// //                                 style={{
// //                                     padding: "12px 0",
// //                                     border: "none",
// //                                     background: "none",
// //                                     color: activeTab === "all" ? "var(--mlab-blue)" : "#64748b",
// //                                     fontWeight: activeTab === "all" ? 700 : 500,
// //                                     fontSize: "0.85rem",
// //                                     cursor: "pointer",
// //                                     borderBottom:
// //                                         activeTab === "all"
// //                                             ? "2px solid var(--mlab-blue)"
// //                                             : "2px solid transparent",
// //                                     display: "flex",
// //                                     alignItems: "center",
// //                                     gap: "6px",
// //                                 }}
// //                             >
// //                                 All Records{" "}
// //                                 <span
// //                                     style={{
// //                                         background: activeTab === "all" ? "#e0e7ff" : "#f1f5f9",
// //                                         color: activeTab === "all" ? "var(--mlab-blue)" : "#94a3b8",
// //                                         padding: "2px 6px",
// //                                         borderRadius: "12px",
// //                                         fontSize: "0.7rem",
// //                                     }}
// //                                 >
// //                                     {enrichedPlacements.length}
// //                                 </span>
// //                             </button>
// //                         </div>

// //                         <div style={{ display: "flex", gap: "8px", paddingBottom: "8px" }}>
// //                             <div
// //                                 style={{
// //                                     position: "relative",
// //                                     display: "flex",
// //                                     alignItems: "center",
// //                                     background: "white",
// //                                     border: "1px solid #cbd5e1",
// //                                     borderRadius: "6px",
// //                                     padding: "0 8px",
// //                                 }}
// //                             >
// //                                 <Search size={14} color="#64748b" />
// //                                 <input
// //                                     type="text"
// //                                     placeholder="Search ledger..."
// //                                     value={searchQuery}
// //                                     onChange={(e) => setSearchQuery(e.target.value)}
// //                                     style={{
// //                                         border: "none",
// //                                         padding: "8px",
// //                                         outline: "none",
// //                                         background: "transparent",
// //                                         fontSize: "0.8rem",
// //                                         width: "200px",
// //                                     }}
// //                                 />
// //                                 {searchQuery && (
// //                                     <button
// //                                         type="button"
// //                                         onClick={() => setSearchQuery("")}
// //                                         style={{
// //                                             background: "none",
// //                                             border: "none",
// //                                             cursor: "pointer",
// //                                             color: "#64748b",
// //                                             display: "flex",
// //                                         }}
// //                                     >
// //                                         <X size={12} />
// //                                     </button>
// //                                 )}
// //                             </div>

// //                             <div style={{ position: "relative" }} ref={menuRef}>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() => setShowExportMenu(!showExportMenu)}
// //                                     disabled={displayedPlacements.length === 0}
// //                                     className="cdp-btn cdp-btn--outline"
// //                                     style={{
// //                                         background: "white",
// //                                         fontSize: "0.8rem",
// //                                         padding: "6px 12px",
// //                                         opacity: displayedPlacements.length === 0 ? 0.5 : 1,
// //                                         cursor:
// //                                             displayedPlacements.length === 0
// //                                                 ? "not-allowed"
// //                                                 : "pointer",
// //                                     }}
// //                                 >
// //                                     <DownloadCloud size={14} /> Export Options
// //                                 </button>

// //                                 {showExportMenu && displayedPlacements.length > 0 && (
// //                                     <div
// //                                         style={{
// //                                             position: "absolute",
// //                                             top: "calc(100% + 4px)",
// //                                             right: 0,
// //                                             background: "white",
// //                                             border: "1px solid #cbd5e1",
// //                                             borderRadius: "6px",
// //                                             boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
// //                                             zIndex: 50,
// //                                             minWidth: "180px",
// //                                             overflow: "hidden",
// //                                         }}
// //                                         className="animate-fade-in"
// //                                     >
// //                                         <button
// //                                             type="button"
// //                                             onClick={handleExportCSV}
// //                                             style={{
// //                                                 width: "100%",
// //                                                 textAlign: "left",
// //                                                 padding: "10px 12px",
// //                                                 background: "none",
// //                                                 border: "none",
// //                                                 borderBottom: "1px solid #f1f5f9",
// //                                                 cursor: "pointer",
// //                                                 display: "flex",
// //                                                 alignItems: "center",
// //                                                 gap: "8px",
// //                                                 fontSize: "0.75rem",
// //                                                 color: "var(--mlab-midnight)",
// //                                                 fontWeight: 500,
// //                                             }}
// //                                         >
// //                                             <FileText size={14} color="#0ea5e9" /> Download as CSV
// //                                         </button>
// //                                         <button
// //                                             type="button"
// //                                             onClick={handleExportExcel}
// //                                             style={{
// //                                                 width: "100%",
// //                                                 textAlign: "left",
// //                                                 padding: "10px 12px",
// //                                                 background: "none",
// //                                                 border: "none",
// //                                                 cursor: "pointer",
// //                                                 display: "flex",
// //                                                 alignItems: "center",
// //                                                 gap: "8px",
// //                                                 fontSize: "0.75rem",
// //                                                 color: "var(--mlab-midnight)",
// //                                                 fontWeight: 500,
// //                                             }}
// //                                         >
// //                                             <FileSpreadsheet size={14} color="#16a34a" /> Download as
// //                                             Excel (.xlsx)
// //                                         </button>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <div className="mlab-table-wrap">
// //                         {isComplianceLoading && (
// //                             <div
// //                                 style={{
// //                                     padding: "1rem",
// //                                     background: "#eff6ff",
// //                                     color: "#1d4ed8",
// //                                     fontSize: "0.8rem",
// //                                     display: "flex",
// //                                     alignItems: "center",
// //                                     gap: "8px",
// //                                 }}
// //                             >
// //                                 <Loader2 size={14} className="wm-spin" /> Verifying deep
// //                                 compliance logs...
// //                             </div>
// //                         )}
// //                         <table className="mlab-table">
// //                             <colgroup>
// //                                 <col style={{ width: "22%" }} />
// //                                 <col style={{ width: "15%" }} />
// //                                 <col style={{ width: "15%" }} />
// //                                 <col style={{ width: "18%" }} />
// //                                 <col style={{ width: "20%" }} />
// //                                 <col style={{ width: "10%" }} />
// //                             </colgroup>
// //                             <thead>
// //                                 <tr>
// //                                     <th>Learner Profile</th>
// //                                     <th>Placement Timeline</th>
// //                                     <th>Assigned Mentor</th>
// //                                     <th>Finance & Contracts</th>
// //                                     <th>Audit & Logbook</th>
// //                                     <th style={{ textAlign: "right" }}>Actions</th>
// //                                 </tr>
// //                             </thead>
// //                             <tbody>
// //                                 {displayedPlacements.length > 0 ? (
// //                                     displayedPlacements.map((p) => (
// //                                         <tr key={p.id}>
// //                                             {/* Learner Name & ID */}
// //                                             <td>
// //                                                 <div className="cdp-learner-cell">
// //                                                     <div className="cdp-learner-avatar">
// //                                                         {p.learnerName.charAt(0)}
// //                                                     </div>
// //                                                     <div className="cdp-learner-cell__info">
// //                                                         <span className="cdp-learner-cell__name">
// //                                                             {p.learnerName}
// //                                                         </span>
// //                                                         <span className="cdp-learner-cell__id">
// //                                                             {p.idNumber}
// //                                                         </span>
// //                                                     </div>
// //                                                 </div>
// //                                             </td>

// //                                             {/* Timeline */}
// //                                             <td>
// //                                                 <div
// //                                                     style={{
// //                                                         fontSize: "0.85rem",
// //                                                         color: "var(--mlab-midnight)",
// //                                                         fontWeight: 500,
// //                                                     }}
// //                                                 >
// //                                                     {formatDate(p.startDate)}{" "}
// //                                                     <span style={{ color: "#94a3b8", margin: "0 4px" }}>
// //                                                         →
// //                                                     </span>{" "}
// //                                                     {formatDate(p.endDate)}
// //                                                 </div>
// //                                                 <div
// //                                                     style={{
// //                                                         fontSize: "0.75rem",
// //                                                         color: "#64748b",
// //                                                         marginTop: "2px",
// //                                                     }}
// //                                                 >
// //                                                     {p.placementType}
// //                                                 </div>
// //                                             </td>

// //                                             {/* Mentor Cell */}
// //                                             <td>
// //                                                 <div
// //                                                     style={{
// //                                                         fontSize: "0.8rem",
// //                                                         color: p.hasMentor
// //                                                             ? "var(--mlab-midnight)"
// //                                                             : "#dc2626",
// //                                                         fontWeight: p.hasMentor ? 500 : 700,
// //                                                         display: "flex",
// //                                                         alignItems: "center",
// //                                                         gap: "4px",
// //                                                     }}
// //                                                 >
// //                                                     {p.hasMentor ? (
// //                                                         <>
// //                                                             <User size={12} /> {p.mentorName}
// //                                                         </>
// //                                                     ) : (
// //                                                         <>
// //                                                             <AlertTriangle size={12} /> No Mentor Assigned
// //                                                         </>
// //                                                     )}
// //                                                 </div>
// //                                             </td>

// //                                             {/* Finance & Compliance Cell */}
// //                                             <td>
// //                                                 <div
// //                                                     style={{
// //                                                         display: "flex",
// //                                                         flexDirection: "column",
// //                                                         gap: "6px",
// //                                                         alignItems: "flex-start",
// //                                                     }}
// //                                                 >
// //                                                     <div
// //                                                         style={{
// //                                                             display: "flex",
// //                                                             gap: "6px",
// //                                                             flexWrap: "wrap",
// //                                                         }}
// //                                                     >
// //                                                         <span
// //                                                             className="cdp-chip cdp-chip--k"
// //                                                             style={{
// //                                                                 width: "fit-content",
// //                                                                 background: "#f8fafc",
// //                                                                 border: "1px solid #e2e8f0",
// //                                                                 color: "#64748b",
// //                                                             }}
// //                                                         >
// //                                                             {p.bbbeeSpendCategory}
// //                                                         </span>

// //                                                         {/* Live Stipend Value */}
// //                                                         {p.stipendAmount && p.stipendAmount > 0 && (
// //                                                             <span
// //                                                                 className="cdp-chip cdp-chip--w"
// //                                                                 style={{ width: "fit-content" }}
// //                                                             >
// //                                                                 Wage: R{p.stipendAmount}/mo
// //                                                             </span>
// //                                                         )}
// //                                                     </div>

// //                                                     {/* 🚀 Dynamic ETI Value + Clickable Audit Trigger */}
// //                                                     {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
// //                                                         <button
// //                                                             type="button"
// //                                                             onClick={() => setEtiBreakdownLearner(p)}
// //                                                             style={{
// //                                                                 background: "#dcfce7",
// //                                                                 border: "1px solid #bbf7d0",
// //                                                                 padding: "2px 6px",
// //                                                                 borderRadius: "4px",
// //                                                                 fontSize: "0.65rem",
// //                                                                 color: "#166534",
// //                                                                 display: "flex",
// //                                                                 alignItems: "center",
// //                                                                 gap: "4px",
// //                                                                 fontWeight: 600,
// //                                                                 cursor: "pointer",
// //                                                             }}
// //                                                             title="Click to view exact SARS mathematical breakdown"
// //                                                         >
// //                                                             <Coins size={10} /> ETI:{" "}
// //                                                             {formatCurrency(p.etiMonthlyValue)}/mo
// //                                                         </button>
// //                                                     ) : (
// //                                                         <span
// //                                                             style={{
// //                                                                 fontSize: "0.65rem",
// //                                                                 color: "#64748b",
// //                                                                 background: "#f1f5f9",
// //                                                                 padding: "2px 6px",
// //                                                                 borderRadius: "4px",
// //                                                                 border: "1px solid #e2e8f0",
// //                                                                 display: "flex",
// //                                                                 alignItems: "center",
// //                                                                 gap: "4px",
// //                                                                 fontWeight: 600,
// //                                                                 width: "fit-content",
// //                                                             }}
// //                                                         >
// //                                                             <AlertCircle size={10} /> Ineligible for ETI
// //                                                         </span>
// //                                                     )}

// //                                                     {p.compliance.isAgreementFullyExecuted ? (
// //                                                         p.compliance.wblpaAgreementUrl ? (
// //                                                             <a
// //                                                                 href={p.compliance.wblpaAgreementUrl}
// //                                                                 target="_blank"
// //                                                                 rel="noopener noreferrer"
// //                                                                 style={{
// //                                                                     fontSize: "0.65rem",
// //                                                                     color: "#166534",
// //                                                                     background: "#dcfce7",
// //                                                                     padding: "2px 6px",
// //                                                                     borderRadius: "4px",
// //                                                                     border: "1px solid #bbf7d0",
// //                                                                     display: "inline-flex",
// //                                                                     alignItems: "center",
// //                                                                     gap: "4px",
// //                                                                     fontWeight: 600,
// //                                                                     textDecoration: "none",
// //                                                                 }}
// //                                                                 title="Click to view signed contract document"
// //                                                             >
// //                                                                 <FileText size={10} /> View WBLPA Contract
// //                                                             </a>
// //                                                         ) : (
// //                                                             <span
// //                                                                 style={{
// //                                                                     fontSize: "0.65rem",
// //                                                                     color: "#166534",
// //                                                                     background: "#dcfce7",
// //                                                                     padding: "2px 6px",
// //                                                                     borderRadius: "4px",
// //                                                                     border: "1px solid #bbf7d0",
// //                                                                     display: "flex",
// //                                                                     alignItems: "center",
// //                                                                     gap: "4px",
// //                                                                     fontWeight: 600,
// //                                                                 }}
// //                                                             >
// //                                                                 <CheckCircle size={10} /> Signed & On File
// //                                                             </span>
// //                                                         )
// //                                                     ) : (
// //                                                         <span
// //                                                             style={{
// //                                                                 fontSize: "0.65rem",
// //                                                                 color: "#dc2626",
// //                                                                 background: "#fef2f2",
// //                                                                 padding: "2px 6px",
// //                                                                 borderRadius: "4px",
// //                                                                 border: "1px solid #fecaca",
// //                                                                 display: "flex",
// //                                                                 alignItems: "center",
// //                                                                 gap: "4px",
// //                                                                 fontWeight: 600,
// //                                                             }}
// //                                                         >
// //                                                             <AlertCircle size={10} /> Missing WBLPA Document
// //                                                         </span>
// //                                                     )}
// //                                                 </div>
// //                                             </td>

// //                                             {/* 🚀 NEW: AUDIT & LOGBOOK METRICS */}
// //                                             <td>
// //                                                 <div
// //                                                     style={{
// //                                                         display: "flex",
// //                                                         flexDirection: "column",
// //                                                         gap: "8px",
// //                                                     }}
// //                                                 >
// //                                                     {/* Campus Attendance */}
// //                                                     <div
// //                                                         style={{
// //                                                             width: "100%",
// //                                                             opacity: isComplianceLoading ? 0.3 : 1,
// //                                                         }}
// //                                                     >
// //                                                         <div
// //                                                             style={{
// //                                                                 display: "flex",
// //                                                                 alignItems: "center",
// //                                                                 justifyContent: "space-between",
// //                                                                 fontSize: "0.75rem",
// //                                                                 fontWeight: 700,
// //                                                                 color: "#475569",
// //                                                                 marginBottom: "4px",
// //                                                             }}
// //                                                         >
// //                                                             <span
// //                                                                 style={{
// //                                                                     display: "flex",
// //                                                                     alignItems: "center",
// //                                                                     gap: "4px",
// //                                                                 }}
// //                                                             >
// //                                                                 <Calendar size={12} color="#94a3b8" /> Campus
// //                                                                 Ratio
// //                                                             </span>
// //                                                             <span
// //                                                                 style={{
// //                                                                     color:
// //                                                                         p.attendancePercentage >= 80
// //                                                                             ? "#16a34a"
// //                                                                             : p.attendancePercentage >= 50
// //                                                                                 ? "#d97706"
// //                                                                                 : "#dc2626",
// //                                                                 }}
// //                                                             >
// //                                                                 {p.attendancePercentage}%
// //                                                             </span>
// //                                                         </div>
// //                                                         <div
// //                                                             style={{
// //                                                                 width: "100%",
// //                                                                 background: "#e2e8f0",
// //                                                                 height: "6px",
// //                                                                 borderRadius: "3px",
// //                                                                 overflow: "hidden",
// //                                                             }}
// //                                                         >
// //                                                             <div
// //                                                                 style={{
// //                                                                     width: `${p.attendancePercentage}%`,
// //                                                                     background:
// //                                                                         p.attendancePercentage >= 80
// //                                                                             ? "#16a34a"
// //                                                                             : p.attendancePercentage >= 50
// //                                                                                 ? "#f59e0b"
// //                                                                                 : "#ef4444",
// //                                                                     height: "100%",
// //                                                                 }}
// //                                                             />
// //                                                         </div>
// //                                                     </div>

// //                                                     {/* Workplace Logs */}
// //                                                     <div
// //                                                         style={{
// //                                                             display: "flex",
// //                                                             alignItems: "center",
// //                                                             justifyContent: "space-between",
// //                                                             fontSize: "0.75rem",
// //                                                             fontWeight: 700,
// //                                                             color: "#475569",
// //                                                             marginTop: "2px",
// //                                                             opacity: isComplianceLoading ? 0.3 : 1,
// //                                                         }}
// //                                                     >
// //                                                         <span
// //                                                             style={{
// //                                                                 display: "flex",
// //                                                                 alignItems: "center",
// //                                                                 gap: "4px",
// //                                                             }}
// //                                                         >
// //                                                             <Briefcase size={12} color="#94a3b8" /> Verified
// //                                                             Logs
// //                                                         </span>
// //                                                         <span
// //                                                             style={{
// //                                                                 color:
// //                                                                     p.approvedWpHours > 0 ? "#16a34a" : "#64748b",
// //                                                             }}
// //                                                         >
// //                                                             {p.approvedWpHours.toFixed(1)} hrs
// //                                                         </span>
// //                                                     </div>

// //                                                     {p.pendingWpHours > 0 && !isComplianceLoading && (
// //                                                         <div
// //                                                             style={{
// //                                                                 display: "inline-flex",
// //                                                                 alignItems: "center",
// //                                                                 gap: "4px",
// //                                                                 background: "#fffbeb",
// //                                                                 color: "#b45309",
// //                                                                 border: "1px solid #fde68a",
// //                                                                 padding: "2px 6px",
// //                                                                 borderRadius: "4px",
// //                                                                 fontSize: "0.65rem",
// //                                                                 fontWeight: 700,
// //                                                                 cursor: "pointer",
// //                                                             }}
// //                                                             onClick={() => setAuditLearner(p)}
// //                                                         >
// //                                                             <AlertTriangle size={10} />{" "}
// //                                                             {p.pendingWpHours.toFixed(1)} hrs pending
// //                                                         </div>
// //                                                     )}
// //                                                 </div>
// //                                             </td>

// //                                             {/* Operational Status & Actions */}
// //                                             <td style={{ textAlign: "right" }}>
// //                                                 <div
// //                                                     style={{
// //                                                         display: "flex",
// //                                                         flexDirection: "column",
// //                                                         alignItems: "flex-end",
// //                                                         gap: "8px",
// //                                                     }}
// //                                                 >
// //                                                     <span
// //                                                         className={`cdp-status-badge ${p.status.toLowerCase().includes("active")
// //                                                             ? "cdp-status-badge--active"
// //                                                             : p.status.toLowerCase().includes("terminate")
// //                                                                 ? "cdp-status-badge--dropped"
// //                                                                 : ""
// //                                                             }`}
// //                                                         style={
// //                                                             p.status.toLowerCase().includes("pending")
// //                                                                 ? {
// //                                                                     background: "#fef3c7",
// //                                                                     color: "#b45309",
// //                                                                     border: "1px solid #fde68a",
// //                                                                 }
// //                                                                 : p.status.toLowerCase().includes("complete") ||
// //                                                                     p.status.toLowerCase().includes("absorb")
// //                                                                     ? {
// //                                                                         background: "#f1f5f9",
// //                                                                         color: "#475569",
// //                                                                         border: "1px solid #e2e8f0",
// //                                                                     }
// //                                                                     : {}
// //                                                         }
// //                                                     >
// //                                                         {p.status.replace("_", " ")}
// //                                                     </span>
// //                                                     {/* 🚀 QUICK PREVIEW: Opens the Log Details Modal if there's any log history */}
// //                                                     {(p.approvedWpHours > 0 || p.pendingWpHours > 0) && (
// //                                                         <button
// //                                                             type="button"
// //                                                             onClick={() => setAuditLearner(p)}
// //                                                             style={{
// //                                                                 background: "white",
// //                                                                 border: "1px solid #cbd5e1",
// //                                                                 padding: "4px 8px",
// //                                                                 borderRadius: "4px",
// //                                                                 cursor: "pointer",
// //                                                                 color: "var(--mlab-blue)",
// //                                                                 fontSize: "0.7rem",
// //                                                                 fontWeight: 600,
// //                                                                 display: "inline-flex",
// //                                                                 alignItems: "center",
// //                                                                 gap: "4px",
// //                                                             }}
// //                                                             title="View Workplace Log Audits"
// //                                                         >
// //                                                             <FileText size={10} /> View Logbook Audits
// //                                                         </button>
// //                                                     )}
// //                                                 </div>
// //                                             </td>
// //                                         </tr>
// //                                     ))
// //                                 ) : (
// //                                     <tr>
// //                                         <td
// //                                             colSpan={6}
// //                                             style={{
// //                                                 padding: "3rem",
// //                                                 textAlign: "center",
// //                                                 color: "#64748b",
// //                                             }}
// //                                         >
// //                                             {searchQuery
// //                                                 ? `No records matched your search query for "${searchQuery}".`
// //                                                 : `No placement history matches found for this host company configuration.`}
// //                                         </td>
// //                                     </tr>
// //                                 )}
// //                             </tbody>
// //                         </table>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };

// // // // src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

// // // import React, { useMemo, useState, useRef, useEffect } from 'react';
// // // import { createPortal } from 'react-dom';
// // // import {
// // //     ArrowLeft, MapPin, Mail, Hash,
// // //     Briefcase, CheckCircle, AlertTriangle, Users, Award,
// // //     FileText, Search, X, DownloadCloud, AlertCircle, User,
// // //     FileSpreadsheet, TrendingUp, Percent, Landmark, Calculator,
// // //     Coins, Accessibility, Wallet, Lightbulb, Info, Activity,
// // //     Receipt, ShieldAlert
// // // } from 'lucide-react';
// // // import moment from 'moment';
// // // import * as XLSX from 'xlsx';
// // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // import type { Employer, DashboardLearner, PlacementContract } from '../../../types';

// // // interface CompanyInsightsViewProps {
// // //     company: Employer;
// // //     onBack: () => void;
// // // }

// // // interface EnrichedPlacement extends PlacementContract {
// // //     placementType: string;
// // //     bbbeeSpendCategory: string;
// // //     compliance: {
// // //         isAgreementFullyExecuted: boolean;
// // //         wblpaAgreementUrl?: string;
// // //     };
// // //     learnerName: string;
// // //     idNumber: string;
// // //     equityGroup: string;
// // //     hasDisability: boolean;
// // //     isFemale: boolean;
// // //     isYouth: boolean;
// // //     mentorName: string;
// // //     hasMentor: boolean;
// // //     isEtiEligible: boolean;
// // //     etiMonthlyValue: number;
// // //     projectedStipendSpend: number;
// // //     s12hAllowanceTotal: number;
// // // }

// // // /* ─── REUSABLE UI COMPONENTS ─── */
// // // const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
// // //     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
// // //         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
// // //             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}>
// // //                 <Activity size={16} color="#d97706" /> {title}
// // //             </div>
// // //             <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
// // //         </div>
// // //         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
// // //             {actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}
// // //         </div>
// // //     </div>
// // // );

// // // const RingGauge = ({ percentage, color }: { percentage: number, color: string }) => {
// // //     const size = 52;
// // //     const stroke = 5;
// // //     const radius = (size - stroke) / 2;
// // //     const circum = radius * 2 * Math.PI;
// // //     const offset = circum - (Math.min(percentage, 100) / 100) * circum;

// // //     return (
// // //         <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
// // //             <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
// // //                 <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
// // //                 <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circum} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
// // //             </svg>
// // //             <div style={{ position: 'absolute', fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-midnight)' }}>{percentage}%</div>
// // //         </div>
// // //     );
// // // };

// // // export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
// // //     const { learners, staff } = useStore();

// // //     const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);

// // //     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');
// // //     const [searchQuery, setSearchQuery] = useState('');
// // //     const [showExportMenu, setShowExportMenu] = useState(false);

// // //     const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | 's12h' | 'mentor' | null>(null);
// // //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

// // //     const menuRef = useRef<HTMLDivElement>(null);

// // //     useEffect(() => {
// // //         const handleClickOutside = (event: MouseEvent) => {
// // //             if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowExportMenu(false);
// // //         };
// // //         document.addEventListener('mousedown', handleClickOutside);
// // //         return () => document.removeEventListener('mousedown', handleClickOutside);
// // //     }, []);

// // //     const companyPlacements = useMemo(() => placements.filter(p => p.employerId === company.id), [placements, company.id]);
// // //     const companyMentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.employerId === company.id && s.status !== 'archived'), [staff, company.id]);

// // //     const { activeCount, completedCount, droppedCount, missingContracts, absorbedCount } = useMemo(() => {
// // //         let active = 0, completed = 0, dropped = 0, missing = 0, absorbed = 0;

// // //         companyPlacements.forEach(p => {
// // //             const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean }, isAbsorbed?: boolean };
// // //             const statusLower = p.status.toLowerCase();

// // //             if (statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview')) {
// // //                 active++;
// // //                 const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
// // //                 if (!isFullySigned) missing++;
// // //             }
// // //             if (p.status === 'Completed' || p.status === 'absorbed_permanently') completed++;
// // //             if (p.status === 'Terminated') dropped++;
// // //             if (p.isAbsorbedPostPlacement || p.status === 'absorbed_permanently' || placementRecord.isAbsorbed) absorbed++;
// // //         });
// // //         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing, absorbedCount: absorbed };
// // //     }, [companyPlacements]);

// // //     const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
// // //         return companyPlacements.map(p => {
// // //             const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);

// // //             const placementRecord = p as PlacementContract & {
// // //                 placementType?: string,
// // //                 compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
// // //                 bbbeeSpendCategory?: string,
// // //                 mentorId?: string
// // //             };

// // //             const mentor = companyMentors.find(m =>
// // //                 (p.assignedMentorName && m.fullName === p.assignedMentorName) ||
// // //                 (placementRecord.mentorId && m.id === placementRecord.mentorId)
// // //             ) || ({} as Partial<StaffMember>);

// // //             const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
// // //             const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
// // //             const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

// // //             // 🚀 LIVE ID NUMBER RESOLUTION (Age & Gender)
// // //             let isEtiEligible = false;
// // //             let isFemale = false;
// // //             let isYouth = true; // Default to RSA youth framework standard (under 35)

// // //             if (learner.idNumber && learner.idNumber.length >= 13) {
// // //                 const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// // //                 const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // //                 const age = new Date().getFullYear() - birthYear;

// // //                 if (age >= 18 && age <= 29) isEtiEligible = true;
// // //                 if (age > 35) isYouth = false;

// // //                 const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
// // //                 if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
// // //             } else if ((learner.demographics as any)?.genderCode === 'F' || (extendedLearner as any).gender === 'Female') {
// // //                 isFemale = true;
// // //             }

// // //             const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
// // //             const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

// // //             let etiMonthlyValue = 0;
// // //             const wage = Number(p.stipendAmount) || 0;

// // //             if (isEtiEligible && wage > 0) {
// // //                 if (wage < 2000) etiMonthlyValue = wage * 0.75;
// // //                 else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
// // //                 else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 4500)), 0);
// // //             }

// // //             const hasDisability = disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No' && disability !== 'N';
// // //             const s12hAllowanceTotal = hasDisability ? 120000 : 80000;

// // //             return {
// // //                 ...p,
// // //                 placementType: placementRecord.placementType || 'QCTO Workplace Module',
// // //                 bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
// // //                 compliance: {
// // //                     isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean'
// // //                         ? placementRecord.compliance.isAgreementFullyExecuted
// // //                         : p.wblAgreementSigned,
// // //                     wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
// // //                 },
// // //                 learnerName: learner.fullName || 'Unknown Learner',
// // //                 idNumber: learner.idNumber || '—',
// // //                 equityGroup: equity,
// // //                 isFemale,
// // //                 isYouth,
// // //                 hasDisability,
// // //                 mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
// // //                 hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id),
// // //                 isEtiEligible,
// // //                 etiMonthlyValue,
// // //                 projectedStipendSpend: wage * verifiedTimeline,
// // //                 s12hAllowanceTotal
// // //             };
// // //         }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // //     }, [companyPlacements, learners, companyMentors]);

// // //     // ─── EXTENDED DEMOGRAPHIC AGGREGATION ───
// // //     const complianceMetrics = useMemo(() => {
// // //         let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
// // //         let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
// // //         let totalFemale = 0, totalMale = 0;
// // //         let absorbedFemale = 0, absorbedMale = 0;

// // //         let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
// // //         let mentorLoad: Record<string, number> = {};

// // //         enrichedPlacements.forEach(p => {
// // //             const statusLower = p.status.toLowerCase();
// // //             const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
// // //             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes('absorb') || (p as any).isAbsorbed;

// // //             if (isLive && p.hasMentor) {
// // //                 mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;
// // //             }

// // //             const eq = p.equityGroup.trim().toLowerCase();
// // //             if (eq.includes('african') || eq === 'black' || eq === 'ba') { raceCounts.African++; blackACI++; if (p.isFemale) blackFemale++; }
// // //             else if (eq.includes('coloured') || eq === 'bc') { raceCounts.Coloured++; blackACI++; if (p.isFemale) blackFemale++; }
// // //             else if (eq.includes('indian') || eq === 'bi') { raceCounts.Indian++; blackACI++; if (p.isFemale) blackFemale++; }
// // //             else if (eq.includes('white') || eq === 'w') { raceCounts.White++; }
// // //             else { raceCounts.Other++; }

// // //             if (p.isFemale) totalFemale++; else totalMale++;
// // //             if (p.isYouth) youthCount++;
// // //             if (isAbsorbed) { if (p.isFemale) absorbedFemale++; else absorbedMale++; }
// // //             if (p.hasDisability) disabilityCount++;

// // //             if (isLive) {
// // //                 if (p.etiMonthlyValue > 0) activeEtiYielders++;
// // //                 monthlyEtiSum += p.etiMonthlyValue;
// // //                 accumulatedSpend += p.projectedStipendSpend;
// // //             }

// // //             if (isLive || statusLower.includes('complete') || statusLower.includes('absorb')) {
// // //                 totalS12hProjected += p.s12hAllowanceTotal;
// // //             }
// // //         });

// // //         const maxMentorLoad = Object.values(mentorLoad).length > 0 ? Math.max(...Object.values(mentorLoad)) : 0;
// // //         const overloadedMentors = Object.entries(mentorLoad).filter(([_, count]) => count > 4).length;

// // //         return {
// // //             transformationPercentage: enrichedPlacements.length > 0 ? Math.round((blackACI / enrichedPlacements.length) * 100) : 0,
// // //             blackFemalePercentage: enrichedPlacements.length > 0 ? Math.round((blackFemale / enrichedPlacements.length) * 100) : 0,
// // //             disabilityPercentage: enrichedPlacements.length > 0 ? Math.round((disabilityCount / enrichedPlacements.length) * 100) : 0,
// // //             disabilityCount,
// // //             youthPercentage: enrichedPlacements.length > 0 ? Math.round((youthCount / enrichedPlacements.length) * 100) : 0,
// // //             youthCount,
// // //             etiYieldPercentage: activeCount > 0 ? Math.round((activeEtiYielders / activeCount) * 100) : 0,
// // //             monthlyETITotal: monthlyEtiSum,
// // //             annualizedETIEstimate: monthlyEtiSum * 12,
// // //             absorptionRate: completedCount > 0 ? Math.round((absorbedCount / completedCount) * 100) : 0,
// // //             totalProjectedSpend: accumulatedSpend,
// // //             totalS12hProjected,
// // //             totalFemale,
// // //             totalMale,
// // //             absorbedFemale,
// // //             absorbedMale,
// // //             raceCounts,
// // //             maxMentorLoad,
// // //             overloadedMentors
// // //         };
// // //     }, [enrichedPlacements, activeCount, completedCount, absorbedCount]);

// // //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// // //     const displayedPlacements = useMemo(() => {
// // //         return enrichedPlacements.filter(p => {
// // //             const sLower = p.status.toLowerCase();
// // //             if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
// // //             if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;
// // //             if (searchQuery) {
// // //                 const q = searchQuery.toLowerCase();
// // //                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
// // //             }
// // //             return true;
// // //         });
// // //     }, [enrichedPlacements, activeTab, searchQuery]);

// // //     const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

// // //     const getExportData = () => {
// // //         return displayedPlacements.map(p => ({
// // //             "Learner Name": p.learnerName,
// // //             "ID Number": p.idNumber,
// // //             "Race (EE Code)": p.equityGroup,
// // //             "Gender": p.isFemale ? "Female" : "Male",
// // //             "Youth Status": p.isYouth ? "Youth (Under 35)" : "Non-Youth",
// // //             "Disability Status": p.hasDisability ? "Yes" : "No",
// // //             "Placement Type": p.placementType,
// // //             "B-BBEE Category": p.bbbeeSpendCategory,
// // //             "Monthly Stipend": p.stipendAmount || 0,
// // //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
// // //             "Section 12H Value": p.s12hAllowanceTotal,
// // //             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
// // //             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
// // //             "Assigned Mentor": p.mentorName,
// // //             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// // //             "Operational Status": p.status.toUpperCase()
// // //         }));
// // //     };

// // //     const handleExportExcel = () => {
// // //         const data = getExportData();
// // //         if (data.length === 0) return;
// // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // //         const workbook = XLSX.utils.book_new();
// // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
// // //         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
// // //         XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
// // //         setShowExportMenu(false);
// // //     };

// // //     const handleExportCSV = () => {
// // //         const data = getExportData();
// // //         if (data.length === 0) return;
// // //         const headers = Object.keys(data[0]);
// // //         const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
// // //         const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
// // //         const link = document.createElement('a');
// // //         link.href = URL.createObjectURL(blob);
// // //         link.setAttribute('download', `${company.name.replace(/[^a-zA-Z0-9]/g, '_')}_${activeTab}_ledger.csv`);
// // //         document.body.appendChild(link);
// // //         link.click();
// // //         document.body.removeChild(link);
// // //         setShowExportMenu(false);
// // //     };

// // //     // 🚀 PORTALED SARS ETI BREAKDOWN MODAL
// // //     const EtiBreakdownModal = () => {
// // //         if (!etiBreakdownLearner) return null;
// // //         const wage = Number(etiBreakdownLearner.stipendAmount) || 0;
// // //         const eti = etiBreakdownLearner.etiMonthlyValue;
// // //         const annualEti = eti * 12;

// // //         let mathString = "";
// // //         if (wage < 2000) {
// // //             mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
// // //         } else if (wage >= 2000 && wage <= 4499) {
// // //             mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// // //         } else if (wage >= 4500 && wage < 6500) {
// // //             mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
// // //         } else {
// // //             mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;
// // //         }

// // //         return createPortal(
// // //             <div className="wm-overlay animate-fade-in" onClick={() => setEtiBreakdownLearner(null)} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //                 <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
// // //                         <div>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
// // //                                 <Landmark size={20} /> SARS ETI Tax Rebate Audit
// // //                             </div>
// // //                             <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {etiBreakdownLearner.learnerName}</div>
// // //                         </div>
// // //                         <button type="button" onClick={() => setEtiBreakdownLearner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
// // //                     </div>

// // //                     <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
// // //                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
// // //                             <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
// // //                         </div>
// // //                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
// // //                             <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
// // //                         </div>
// // //                         <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Projection:</span>
// // //                             <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
// // //                     <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
// // //                         {mathString}
// // //                     </div>

// // //                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS Rules (Ages 18-29):</div>
// // //                     <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                         <li style={{ color: wage > 0 && wage < 2000 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2000 ? 700 : 400 }}>
// // //                             If stipend is R0 – R1,999: ETI = 75% of stipend
// // //                         </li>
// // //                         <li style={{ color: wage >= 2000 && wage <= 4499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400 }}>
// // //                             If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)
// // //                         </li>
// // //                         <li style={{ color: wage >= 4500 && wage < 6500 ? '#16a34a' : 'inherit', fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400 }}>
// // //                             If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend - R4,500])
// // //                         </li>
// // //                         <li style={{ color: wage >= 6500 ? '#dc2626' : 'inherit', fontWeight: wage >= 6500 ? 700 : 400 }}>
// // //                             If stipend is R6,500 or more: ETI = R0
// // //                         </li>
// // //                     </ul>

// // //                     <button type="button" onClick={() => setEtiBreakdownLearner(null)} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center' }}>
// // //                         Close Audit Trail
// // //                     </button>
// // //                 </div>
// // //             </div>,
// // //             document.body
// // //         );
// // //     };

// // //     return (
// // //         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

// // //             {etiBreakdownLearner && <EtiBreakdownModal />}

// // //             {/* ── BREADCRUMB & HEADER ── */}
// // //             <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
// // //                 <button onClick={onBack} style={{ background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' }}>
// // //                     <ArrowLeft size={18} />
// // //                 </button>
// // //                 <div>
// // //                     <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // //                         Host Company Profile
// // //                     </div>
// // //                     <h1 style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', lineHeight: 1.2 }}>
// // //                         {company.name}
// // //                     </h1>
// // //                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '0.85rem', color: '#475569' }}>
// // //                         {company.registrationNumber && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={13} /> {company.registrationNumber}</span>}
// // //                         {company.physicalAddress && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={13} /> {company.physicalAddress}</span>}
// // //                         {company.contactPerson && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={13} /> {company.contactEmail}</span>}
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             {/* ── ALERTS SECTION FOR QUALITY SIGNALS ── */}
// // //             {complianceMetrics.overloadedMentors > 0 && (
// // //                 <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600 }}>
// // //                     <ShieldAlert size={16} />
// // //                     <span><strong>SETA Quality Warning:</strong> {complianceMetrics.overloadedMentors} assigned mentor(s) currently exceed the recommended 1:4 supervisor-to-learner load constraint.</span>
// // //                 </div>
// // //             )}

//             {/* ── OPERATIONAL KPI RIBBON ── */}
//             <div className="cdp-stat-row">
//                 <div className="cdp-stat-card cdp-stat-card--blue">
//                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value">{activeCount}</span>
//                         <span className="cdp-stat-card__label">Active Interns</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--green">
//                     <div className="cdp-stat-card__icon"><Award size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value">{completedCount}</span>
//                         <span className="cdp-stat-card__label">Completed Programs</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--amber">
//                     <div className="cdp-stat-card__icon"><FileText size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? 'var(--mlab-amber)' : 'inherit' }}>{missingContracts}</span>
//                         <span className="cdp-stat-card__label">Missing Contracts</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--grey">
//                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? 'var(--mlab-red)' : 'inherit' }}>{droppedCount}</span>
//                         <span className="cdp-stat-card__label">Dropped / Terminated</span>
//                     </div>
//                 </div>
//             </div>

//             {/* ── COMPLIANCE & REBATE INTELLIGENCE GRID ── */}
//             <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                     <Calculator size={18} /> Strategic Employment Equity & Scorecard Auditor
//                 </div>

//                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

//                     {/* SARS ETI Yield Framework with Ring */}
//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <RingGauge percentage={complianceMetrics.etiYieldPercentage} color="#16a34a" />
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Opt. Yield</span>
//                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
//                             </div>
//                             <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
//                                 {formatCurrency(complianceMetrics.monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span>
//                             </div>
//                             <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>
//                                 Annually: {formatCurrency(complianceMetrics.annualizedETIEstimate)}
//                             </div>
//                             {activeInsight === 'eti' && (
//                                 <InsightPopup
//                                     title="SARS Employment Tax Incentive"
//                                     currentValue={`${complianceMetrics.etiYieldPercentage}% of Active Interns are ETI-Optimized`}
//                                     actionSteps={[
//                                         <span key="1"><strong>Live Calculation:</strong> Value is compiled dynamically by evaluating every active learner's recorded stipend against the official SARS ETI sliding scale.</span>,
//                                         <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500 to max the algorithm.</span>,
//                                         <span key="3"><strong>View Math:</strong> Scroll down to the placement ledger and click on any green ETI button to view the exact math breakdown.</span>
//                                     ]}
//                                     onClose={() => setActiveInsight(null)}
//                                 />
//                             )}
//                         </div>
//                     </div>

//                     {/* NEW: SECTION 12H TAX ALLOWANCE */}
//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}>
//                             <Receipt size={24} />
//                         </div>
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Sec. 12H Tax Rebates</span>
//                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 's12h' ? null : 's12h')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button>
//                             </div>
//                             <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
//                                 {formatCurrency(complianceMetrics.totalS12hProjected)}
//                             </div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected total cycle deduction allowance.</span>
//                             {activeInsight === 's12h' && (
//                                 <InsightPopup
//                                     title="Section 12H Tax Deductions"
//                                     currentValue={formatCurrency(complianceMetrics.totalS12hProjected)}
//                                     actionSteps={[
//                                         <span key="1"><strong>Live Calculation:</strong> R80,000 (Commencement + Completion) per able-bodied learner. R120,000 per learner with an uploaded Disability Code.</span>,
//                                         <span key="2"><strong>To Optimize:</strong> This allowance is claimed against taxable income. Terminated/Dropped learners do not qualify for the completion allowance portion.</span>
//                                     ]}
//                                     onClose={() => setActiveInsight(null)}
//                                 />
//                             )}
//                         </div>
//                     </div>

//                     {/* B-BBEE Skills Development Spend Tracker */}
//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '50%', color: '#475569', height: 'fit-content' }}>
//                             <Wallet size={24} />
//                         </div>
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span>
//                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><Info size={14} /></button>
//                             </div>
//                             <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
//                                 {formatCurrency(complianceMetrics.totalProjectedSpend)}
//                             </div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
//                             {activeInsight === 'spend' && (
//                                 <InsightPopup
//                                     title="Skills Target Spend"
//                                     currentValue={formatCurrency(complianceMetrics.totalProjectedSpend)}
//                                     actionSteps={[
//                                         <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
//                                         <span key="2"><strong>To Optimize:</strong> Ensure all placements have an accurate Stipend Amount logged in the ledger, as this counts directly toward your B-BBEE 3-6% payroll skills target.</span>
//                                     ]}
//                                     onClose={() => setActiveInsight(null)}
//                                 />
//                             )}
//                         </div>
//                     </div>

//                     {/* RACIAL AND GENDER DEMOGRAPHICS */}
//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <RingGauge percentage={complianceMetrics.transformationPercentage} color="#b45309" />
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Race & Gender Split</span>
//                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
//                             </div>
//                             <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--mlab-midnight)', marginTop: '4px' }}>
//                                 {complianceMetrics.raceCounts.African}A | {complianceMetrics.raceCounts.Coloured}C | {complianceMetrics.raceCounts.Indian}I | {complianceMetrics.raceCounts.White}W
//                             </div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
//                                 Gender: <strong style={{ color: 'var(--mlab-blue)' }}>{complianceMetrics.totalFemale} Female / {complianceMetrics.totalMale} Male</strong>
//                             </span>
//                             {activeInsight === 'transformation' && (
//                                 <InsightPopup
//                                     title="EEA2 Alignment Breakdown"
//                                     currentValue="Total Demographics Ledger"
//                                     actionSteps={[
//                                         <span key="1"><strong>Headcounts:</strong> African ({complianceMetrics.raceCounts.African}), Coloured ({complianceMetrics.raceCounts.Coloured}), Indian ({complianceMetrics.raceCounts.Indian}), White ({complianceMetrics.raceCounts.White}).</span>,
//                                         <span key="2"><strong>B-BBEE Focus:</strong> Under Code Series 300, Skills Development sub-minimum calculations exclude White candidates from positive point matrices.</span>
//                                     ]}
//                                     onClose={() => setActiveInsight(null)}
//                                 />
//                             )}
//                         </div>
//                     </div>

//                     {/* DISABILITY INDEX CHECK */}
//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <RingGauge percentage={complianceMetrics.disabilityPercentage} color="#7c3aed" />
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#6d28d9', fontWeight: 700, textTransform: 'uppercase' }}>Disability Framework</span>
//                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'disability' ? null : 'disability')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6d28d9', display: 'flex' }}><Info size={14} /></button>
//                             </div>
//                             <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
//                                 {complianceMetrics.disabilityCount} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Learners</span>
//                             </div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
//                                 Reflects a ratio of <strong>{complianceMetrics.disabilityPercentage}%</strong> of total context.
//                             </span>
//                             {activeInsight === 'disability' && (
//                                 <InsightPopup
//                                     title="Disability Compliance Target"
//                                     currentValue={`${complianceMetrics.disabilityCount} Headcount`}
//                                     actionSteps={[
//                                         <span key="1"><strong>Audit Rule:</strong> Each instance listed here must maintain a verified medical certificate signed by an operating practitioner to claim Section 12H bonus deductions (R120k vs R80k).</span>
//                                     ]}
//                                     onClose={() => setActiveInsight(null)}
//                                 />
//                             )}
//                         </div>
//                     </div>

//                     {/* YOUTH DEVELOPMENT PROFILES */}
//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <RingGauge percentage={complianceMetrics.youthPercentage} color="#059669" />
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>Youth Demographics</span>
//                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'mentor' ? null : 'mentor')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#047857', display: 'flex' }}><Info size={14} /></button>
//                             </div>
//                             <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
//                                 {complianceMetrics.youthCount} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>under 35</span>
//                             </div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
//                                 <strong>{complianceMetrics.youthPercentage}%</strong> match for South African Youth initiatives.
//                             </span>
//                         </div>
//                     </div>

//                     {/* ABSORPTION AND PERMANENT PLACEMENT */}
//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <RingGauge percentage={complianceMetrics.absorptionRate} color="#0ea5e9" />
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Absorption Rate</span>
//                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'absorption' ? null : 'absorption')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', display: 'flex' }}><Info size={14} /></button>
//                             </div>
//                             <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
//                                 {complianceMetrics.absorptionRate}% Absorbed
//                             </div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
//                                 Gender Split: <strong style={{ color: 'var(--mlab-blue)' }}>{complianceMetrics.absorbedFemale}F / {complianceMetrics.absorbedMale}M</strong>
//                             </span>
//                             {activeInsight === 'absorption' && (
//                                 <InsightPopup
//                                     title="B-BBEE Scorecard Absorption"
//                                     currentValue={`${complianceMetrics.absorptionRate}% Total | ${complianceMetrics.absorbedFemale}F / ${complianceMetrics.absorbedMale}M Split`}
//                                     actionSteps={[
//                                         <span key="1"><strong>Target:</strong> 100% absorption unlocks 5 B-BBEE Bonus Points under Code Series 300.</span>,
//                                         <span key="2"><strong>To Optimize:</strong> Secure key scorecard bonus allocations by confirming permanent transitions upon program completion. Ensure status is set to "Absorbed".</span>
//                                     ]}
//                                     onClose={() => setActiveInsight(null)}
//                                 />
//                             )}
//                         </div>
//                     </div>

//                 </div>
//             </div>

// // //             {/* ── PLACEMENT LEDGER DATA GRID ── */}
// // //             <div className="cdp-panel">
// // //                 <div className="vp-card" style={{ marginBottom: 0 }}>
// // //                     <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
// // //                         <div className="vp-card-title-group">
// // //                             <Users size={18} color="var(--mlab-blue)" />
// // //                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// // //                                 Placement Ledger
// // //                             </h3>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc', flexWrap: 'wrap', gap: '1rem' }}>

// // //                         <div style={{ display: 'flex', gap: '1.5rem' }}>
// // //                             <button
// // //                                 onClick={() => setActiveTab('active')}
// // //                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // //                             >
// // //                                 Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
// // //                             </button>
// // //                             <button
// // //                                 onClick={() => setActiveTab('history')}
// // //                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // //                             >
// // //                                 History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
// // //                             </button>
// // //                             <button
// // //                                 onClick={() => setActiveTab('all')}
// // //                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // //                             >
// // //                                 All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{enrichedPlacements.length}</span>
// // //                             </button>
// // //                         </div>

// // //                         <div style={{ display: 'flex', gap: '8px', paddingBottom: '8px' }}>
// // //                             <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 8px' }}>
// // //                                 <Search size={14} color="#64748b" />
// // //                                 <input
// // //                                     type="text"
// // //                                     placeholder="Search ledger..."
// // //                                     value={searchQuery}
// // //                                     onChange={e => setSearchQuery(e.target.value)}
// // //                                     style={{ border: 'none', padding: '8px', outline: 'none', background: 'transparent', fontSize: '0.8rem', width: '200px' }}
// // //                                 />
// // //                                 {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={12} /></button>}
// // //                             </div>

// // //                             <div style={{ position: 'relative' }} ref={menuRef}>
// // //                                 <button
// // //                                     type="button"
// // //                                     onClick={() => setShowExportMenu(!showExportMenu)}
// // //                                     disabled={displayedPlacements.length === 0}
// // //                                     className="cdp-btn cdp-btn--outline"
// // //                                     style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
// // //                                 >
// // //                                     <DownloadCloud size={14} /> Export Options
// // //                                 </button>

// // //                                 {showExportMenu && displayedPlacements.length > 0 && (
// // //                                     <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
// // //                                         <button
// // //                                             type="button"
// // //                                             onClick={handleExportCSV}
// // //                                             style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // //                                         >
// // //                                             <FileText size={14} color="#0ea5e9" /> Download as CSV
// // //                                         </button>
// // //                                         <button
// // //                                             type="button"
// // //                                             onClick={handleExportExcel}
// // //                                             style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // //                                         >
// // //                                             <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
// // //                                         </button>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>

// // //                     </div>

// // //                     <div className="mlab-table-wrap">
// // //                         <table className="mlab-table">
// // //                             <thead>
// // //                                 <tr>
// // //                                     <th>Learner Profile</th>
// // //                                     <th>Placement Timeline</th>
// // //                                     <th>Assigned Mentor</th>
// // //                                     <th>Financials & Compliance</th>
// // //                                     <th>Operational Status</th>
// // //                                 </tr>
// // //                             </thead>
// // //                             <tbody>
// // //                                 {displayedPlacements.length > 0 ? displayedPlacements.map(p => (
// // //                                     <tr key={p.id}>
// // //                                         {/* Learner Name & Identity */}
// // //                                         <td>
// // //                                             <div className="cdp-learner-cell">
// // //                                                 <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // //                                                 <div className="cdp-learner-cell__info">
// // //                                                     <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // //                                                     <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // //                                                 </div>
// // //                                             </div>
// // //                                         </td>

// // //                                         {/* Schedule Limits */}
// // //                                         <td>
// // //                                             <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
// // //                                                 {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {formatDate(p.endDate)}
// // //                                             </div>
// // //                                             <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{p.placementType}</div>
// // //                                         </td>

// // //                                         {/* Workplace Mentor Connection */}
// // //                                         <td>
// // //                                             <div style={{ fontSize: '0.8rem', color: p.hasMentor ? 'var(--mlab-midnight)' : '#dc2626', fontWeight: p.hasMentor ? 500 : 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                 {p.hasMentor ? (
// // //                                                     <><User size={12} /> {p.mentorName}</>
// // //                                                 ) : (
// // //                                                     <><AlertTriangle size={12} /> No Mentor Assigned</>
// // //                                                 )}
// // //                                             </div>
// // //                                         </td>

// // //                                         {/* 🚀 FULLY DYNAMIC ETI BREAKDOWN BUTTON */}
// // //                                         <td>
// // //                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
// // //                                                 <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>

// // //                                                     <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
// // //                                                         {p.bbbeeSpendCategory}
// // //                                                     </span>

// // //                                                     {/* Live Stipend Value */}
// // //                                                     {p.stipendAmount && p.stipendAmount > 0 && (
// // //                                                         <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content' }}>
// // //                                                             Wage: R{p.stipendAmount}/mo
// // //                                                         </span>
// // //                                                     )}

// // //                                                     {/* 🚀 Dynamic ETI Value + Clickable Audit Trigger */}
// // //                                                     {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
// // //                                                         <button
// // //                                                             type="button"
// // //                                                             onClick={() => setEtiBreakdownLearner(p)}
// // //                                                             style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }}
// // //                                                             title="Click to view exact SARS mathematical breakdown"
// // //                                                         >
// // //                                                             <Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo
// // //                                                         </button>
// // //                                                     ) : (
// // //                                                         <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // //                                                             <AlertCircle size={10} /> Ineligible for ETI
// // //                                                         </span>
// // //                                                     )}
// // //                                                 </div>

// // //                                                 {p.wblAgreementSigned || p.compliance.isAgreementFullyExecuted ? (
// // //                                                     p.wblAgreementUrl || p.compliance.wblpaAgreementUrl ? (
// // //                                                         <a
// // //                                                             href={p.wblAgreementUrl || p.compliance.wblpaAgreementUrl}
// // //                                                             target="_blank"
// // //                                                             rel="noopener noreferrer"
// // //                                                             style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
// // //                                                             title="Click to view signed contract document"
// // //                                                         >
// // //                                                             <FileText size={10} /> View WBLPA Contract
// // //                                                         </a>
// // //                                                     ) : (
// // //                                                         <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // //                                                             <CheckCircle size={10} /> Signed & On File
// // //                                                         </span>
// // //                                                     )
// // //                                                 ) : (
// // //                                                     <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // //                                                         <AlertCircle size={10} /> Missing WBLPA Document
// // //                                                     </span>
// // //                                                 )}
// // //                                             </div>
// // //                                         </td>

// // //                                         {/* Status Parameters */}
// // //                                         <td>
// // //                                             <span
// // //                                                 className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' :
// // //                                                     p.status.toLowerCase().includes('terminate') ? 'cdp-status-badge--dropped' : ''
// // //                                                     }`}
// // //                                                 style={
// // //                                                     p.status.toLowerCase().includes('pending') ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } :
// // //                                                         p.status.toLowerCase().includes('complete') || p.status.toLowerCase().includes('absorb') ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}
// // //                                                 }
// // //                                             >
// // //                                                 {p.status.replace('_', ' ')}
// // //                                             </span>
// // //                                         </td>
// // //                                     </tr>
// // //                                 )) : (
// // //                                     <tr>
// // //                                         <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
// // //                                             {searchQuery ? `No records matched your search query for "${searchQuery}".` : `No placement history matches found for this host company configuration.`}
// // //                                         </td>
// // //                                     </tr>
// // //                                 )}
// // //                             </tbody>
// // //                         </table>
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // // // src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

// // // // import React, { useMemo, useState, useRef, useEffect } from 'react';
// // // // import {
// // // //     ArrowLeft, MapPin, Mail, Hash,
// // // //     Briefcase, CheckCircle, AlertTriangle, Users, Award,
// // // //     FileText, Search, X, DownloadCloud, AlertCircle, User,
// // // //     FileSpreadsheet
// // // // } from 'lucide-react';
// // // // import moment from 'moment';
// // // // import * as XLSX from 'xlsx';
// // // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // // import type { Employer, DashboardLearner } from '../../../types';

// // // // interface CompanyInsightsViewProps {
// // // //     company: Employer;
// // // //     onBack: () => void;
// // // // }

// // // // export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
// // // //     const { learners, staff } = useStore();
// // // //     const placements = (useStore(s => (s as any).placements) || []) as any[];

// // // //     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');
// // // //     const [searchQuery, setSearchQuery] = useState('');
// // // //     const [showExportMenu, setShowExportMenu] = useState(false);
// // // //     const menuRef = useRef<HTMLDivElement>(null);

// // // //     // Close export menu if clicked outside
// // // //     useEffect(() => {
// // // //         const handleClickOutside = (event: MouseEvent) => {
// // // //             if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
// // // //                 setShowExportMenu(false);
// // // //             }
// // // //         };
// // // //         document.addEventListener('mousedown', handleClickOutside);
// // // //         return () => document.removeEventListener('mousedown', handleClickOutside);
// // // //     }, []);

// // // //     // Filter Data for this specific company
// // // //     const companyPlacements = useMemo(() => placements.filter(p => p.employerId === company.id), [placements, company.id]);
// // // //     const companyMentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.employerId === company.id && s.status !== 'archived'), [staff, company.id]);

// // // //     // Calculate Metrics
// // // //     const { activeCount, completedCount, droppedCount, missingContracts } = useMemo(() => {
// // // //         let active = 0, completed = 0, dropped = 0, missing = 0;
// // // //         companyPlacements.forEach(p => {
// // // //             if (p.status === 'active' || p.status === 'pending_signatures') {
// // // //                 active++;
// // // //                 if (p.status === 'active' && !p.compliance?.isAgreementFullyExecuted) missing++;
// // // //             }
// // // //             if (p.status === 'completed') completed++;
// // // //             if (p.status === 'terminated') dropped++;
// // // //         });
// // // //         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing };
// // // //     }, [companyPlacements]);

// // // //     // Enriched Placement Data
// // // //     const enrichedPlacements = useMemo(() => {
// // // //         return companyPlacements.map(p => {
// // // //             const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// // // //             const mentor = companyMentors.find(m => m.id === p.mentorId) || ({} as Partial<StaffMember>);
// // // //             return {
// // // //                 ...p,
// // // //                 learnerName: learner.fullName || 'Unknown Learner',
// // // //                 idNumber: learner.idNumber || '—',
// // // //                 mentorName: mentor.fullName || 'Unassigned',
// // // //             };
// // // //         }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // // //     }, [companyPlacements, learners, companyMentors]);

// // // //     // Apply Tab Filters & Search Query
// // // //     const displayedPlacements = useMemo(() => {
// // // //         return enrichedPlacements.filter(p => {
// // // //             if (activeTab === 'active' && p.status !== 'active' && p.status !== 'pending_signatures') return false;
// // // //             if (activeTab === 'history' && p.status !== 'completed' && p.status !== 'terminated') return false;
// // // //             if (searchQuery) {
// // // //                 const q = searchQuery.toLowerCase();
// // // //                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
// // // //             }
// // // //             return true;
// // // //         });
// // // //     }, [enrichedPlacements, activeTab, searchQuery]);

// // // //     const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

// // // //     // EXPORT DATA PREPARATION
// // // //     const getExportData = () => {
// // // //         return displayedPlacements.map(p => ({
// // // //             "Learner Name": p.learnerName,
// // // //             "ID Number": p.idNumber,
// // // //             "Placement Type": p.placementType,
// // // //             "B-BBEE Category": p.compliance?.bbbeeSpendCategory || p.bbbeeSpendCategory || 'Uncategorized',
// // // //             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
// // // //             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
// // // //             "Assigned Mentor": p.mentorName,
// // // //             "WBLPA Contract Status": p.compliance?.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// // // //             "Contract Link": p.compliance?.wblpaAgreementUrl || 'Not Uploaded',
// // // //             "Operational Status": p.status.replace('_', ' ').toUpperCase()
// // // //         }));
// // // //     };

// // // //     const generateFileName = (extension: string) => {
// // // //         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
// // // //         return `${cleanCompanyName}_${activeTab}_placements_${moment().format('YYYYMMDD')}.${extension}`;
// // // //     };

// // // //     // EXPORT TO CSV
// // // //     const handleExportCSV = () => {
// // // //         const data = getExportData();
// // // //         if (data.length === 0) return;

// // // //         const headers = Object.keys(data[0]);
// // // //         const csvRows = data.map(row =>
// // // //             headers.map(header => `"${(row as any)[header]}"`).join(',')
// // // //         );
// // // //         const csvString = [headers.join(','), ...csvRows].join('\n');

// // // //         const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
// // // //         const link = document.createElement('a');
// // // //         link.href = URL.createObjectURL(blob);
// // // //         link.setAttribute('download', generateFileName('csv'));
// // // //         document.body.appendChild(link);
// // // //         link.click();
// // // //         document.body.removeChild(link);
// // // //         setShowExportMenu(false);
// // // //     };

// // // //     // EXPORT TO NATIVE EXCEL (.XLSX)
// // // //     const handleExportExcel = () => {
// // // //         const data = getExportData();
// // // //         if (data.length === 0) return;

// // // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // // //         const workbook = XLSX.utils.book_new();
// // // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");

// // // //         XLSX.writeFile(workbook, generateFileName('xlsx'));
// // // //         setShowExportMenu(false);
// // // //     };

// // // //     return (
// // // //         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

// // // //             {/* ── BREADCRUMB & HEADER ── */}
// // // //             <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
// // // //                 <button
// // // //                     onClick={onBack}
// // // //                     style={{ background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' }}
// // // //                 >
// // // //                     <ArrowLeft size={18} />
// // // //                 </button>
// // // //                 <div>
// // // //                     <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // //                         Host Company Profile
// // // //                     </div>
// // // //                     <h1 style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', lineHeight: 1.2 }}>
// // // //                         {company.name}
// // // //                     </h1>
// // // //                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '0.85rem', color: '#475569' }}>
// // // //                         {company.registrationNumber && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={13} /> {company.registrationNumber}</span>}
// // // //                         {company.physicalAddress && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={13} /> {company.physicalAddress}</span>}
// // // //                         {company.contactPerson && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={13} /> {company.contactEmail}</span>}
// // // //                     </div>
// // // //                 </div>
// // // //             </div>

// // // //             {/* ── METRICS RIBBON ── */}
// // // //             <div className="cdp-stat-row">
// // // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // // //                     <div className="cdp-stat-card__body">
// // // //                         <span className="cdp-stat-card__value">{activeCount}</span>
// // // //                         <span className="cdp-stat-card__label">Active Interns</span>
// // // //                     </div>
// // // //                 </div>
// // // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // // //                     <div className="cdp-stat-card__icon"><Award size={20} /></div>
// // // //                     <div className="cdp-stat-card__body">
// // // //                         <span className="cdp-stat-card__value">{completedCount}</span>
// // // //                         <span className="cdp-stat-card__label">Completed Programs</span>
// // // //                     </div>
// // // //                 </div>
// // // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // // //                     <div className="cdp-stat-card__icon"><FileText size={20} /></div>
// // // //                     <div className="cdp-stat-card__body">
// // // //                         <span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? 'var(--mlab-amber)' : 'inherit' }}>{missingContracts}</span>
// // // //                         <span className="cdp-stat-card__label">Missing Contracts</span>
// // // //                     </div>
// // // //                 </div>
// // // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // // //                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
// // // //                     <div className="cdp-stat-card__body">
// // // //                         <span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? 'var(--mlab-red)' : 'inherit' }}>{droppedCount}</span>
// // // //                         <span className="cdp-stat-card__label">Dropped / Terminated</span>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>

// // // //             {/* ── DATA GRID WITH TABS & SEARCH ── */}
// // // //             <div className="cdp-panel">
// // // //                 <div className="vp-card" style={{ marginBottom: 0 }}>
// // // //                     <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
// // // //                         <div className="vp-card-title-group">
// // // //                             <Users size={18} color="var(--mlab-blue)" />
// // // //                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// // // //                                 Placement Ledger
// // // //                             </h3>
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* TOOLBAR: TABS + SEARCH + DUAL EXPORT */}
// // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc', flexWrap: 'wrap', gap: '1rem' }}>

// // // //                         <div style={{ display: 'flex', gap: '1.5rem' }}>
// // // //                             <button
// // // //                                 onClick={() => setActiveTab('active')}
// // // //                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // //                             >
// // // //                                 Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
// // // //                             </button>
// // // //                             <button
// // // //                                 onClick={() => setActiveTab('history')}
// // // //                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // //                             >
// // // //                                 History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
// // // //                             </button>
// // // //                             <button
// // // //                                 onClick={() => setActiveTab('all')}
// // // //                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // //                             >
// // // //                                 All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{enrichedPlacements.length}</span>
// // // //                             </button>
// // // //                         </div>

// // // //                         <div style={{ display: 'flex', gap: '8px', paddingBottom: '8px' }}>
// // // //                             <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 8px' }}>
// // // //                                 <Search size={14} color="#64748b" />
// // // //                                 <input
// // // //                                     type="text"
// // // //                                     placeholder="Search by learner or ID..."
// // // //                                     value={searchQuery}
// // // //                                     onChange={e => setSearchQuery(e.target.value)}
// // // //                                     style={{ border: 'none', padding: '8px', outline: 'none', background: 'transparent', fontSize: '0.8rem', width: '200px' }}
// // // //                                 />
// // // //                                 {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={12} /></button>}
// // // //                             </div>

// // // //                             <div style={{ position: 'relative' }} ref={menuRef}>
// // // //                                 <button
// // // //                                     onClick={() => setShowExportMenu(!showExportMenu)}
// // // //                                     disabled={displayedPlacements.length === 0}
// // // //                                     className="cdp-btn cdp-btn--outline"
// // // //                                     style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
// // // //                                 >
// // // //                                     <DownloadCloud size={14} /> Export Ledger
// // // //                                 </button>

// // // //                                 {showExportMenu && displayedPlacements.length > 0 && (
// // // //                                     <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
// // // //                                         <button
// // // //                                             onClick={handleExportCSV}
// // // //                                             style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // //                                         >
// // // //                                             <FileText size={14} color="#0ea5e9" /> Download as CSV
// // // //                                         </button>
// // // //                                         <button
// // // //                                             onClick={handleExportExcel}
// // // //                                             style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // //                                         >
// // // //                                             <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
// // // //                                         </button>
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>

// // // //                     </div>

// // // //                     <div className="mlab-table-wrap">
// // // //                         <table className="mlab-table">
// // // //                             <thead>
// // // //                                 <tr>
// // // //                                     <th>Learner Profile</th>
// // // //                                     <th>Placement Timeline</th>
// // // //                                     <th>Assigned Mentor</th>
// // // //                                     <th>Compliance Track & Contracts</th>
// // // //                                     <th>Operational Status</th>
// // // //                                 </tr>
// // // //                             </thead>
// // // //                             <tbody>
// // // //                                 {displayedPlacements.length > 0 ? displayedPlacements.map(p => (
// // // //                                     <tr key={p.id}>
// // // //                                         {/* Learner Name & ID */}
// // // //                                         <td>
// // // //                                             <div className="cdp-learner-cell">
// // // //                                                 <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // // //                                                 <div className="cdp-learner-cell__info">
// // // //                                                     <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // // //                                                     <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // // //                                                 </div>
// // // //                                             </div>
// // // //                                         </td>

// // // //                                         {/* Timeline */}
// // // //                                         <td>
// // // //                                             <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
// // // //                                                 {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {formatDate(p.endDate)}
// // // //                                             </div>
// // // //                                             <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{p.placementType}</div>
// // // //                                         </td>

// // // //                                         {/* Mentor Cell */}
// // // //                                         <td>
// // // //                                             <div style={{ fontSize: '0.8rem', color: p.mentorId ? 'var(--mlab-midnight)' : '#dc2626', fontWeight: p.mentorId ? 500 : 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                 {p.mentorId ? (
// // // //                                                     <><User size={12} /> {p.mentorName}</>
// // // //                                                 ) : (
// // // //                                                     <><AlertTriangle size={12} /> No Mentor Assigned</>
// // // //                                                 )}
// // // //                                             </div>
// // // //                                         </td>

// // // //                                         {/* Compliance Cell */}
// // // //                                         <td>
// // // //                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
// // // //                                                 <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
// // // //                                                     {p.compliance?.bbbeeSpendCategory || p.bbbeeSpendCategory || 'Uncategorized'}
// // // //                                                 </span>

// // // //                                                 {p.compliance?.isAgreementFullyExecuted ? (
// // // //                                                     p.compliance?.wblpaAgreementUrl ? (
// // // //                                                         <a
// // // //                                                             href={p.compliance.wblpaAgreementUrl}
// // // //                                                             target="_blank"
// // // //                                                             rel="noopener noreferrer"
// // // //                                                             style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
// // // //                                                             title="Click to view signed contract document"
// // // //                                                         >
// // // //                                                             <FileText size={10} /> View WBLPA Contract
// // // //                                                         </a>
// // // //                                                     ) : (
// // // //                                                         <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // //                                                             <CheckCircle size={10} /> Signed (No File Link)
// // // //                                                         </span>
// // // //                                                     )
// // // //                                                 ) : (
// // // //                                                     <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // //                                                         <AlertCircle size={10} /> No WBLPA Uploaded
// // // //                                                     </span>
// // // //                                                 )}
// // // //                                             </div>
// // // //                                         </td>

// // // //                                         {/* Operational Status */}
// // // //                                         <td>
// // // //                                             <span className={`cdp-status-badge ${p.status === 'active' ? 'cdp-status-badge--active' : p.status === 'terminated' ? 'cdp-status-badge--dropped' : ''}`} style={p.status === 'pending_signatures' ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } : p.status === 'completed' ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}}>
// // // //                                                 {p.status.replace('_', ' ')}
// // // //                                             </span>
// // // //                                         </td>
// // // //                                     </tr>
// // // //                                 )) : (
// // // //                                     <tr>
// // // //                                         <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
// // // //                                             {searchQuery ? `No records matched your search for "${searchQuery}".` : `No ${activeTab === 'active' ? 'active' : activeTab === 'history' ? 'historical' : ''} placements found for this company.`}
// // // //                                         </td>
// // // //                                     </tr>
// // // //                                 )}
// // // //                             </tbody>
// // // //                         </table>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };
