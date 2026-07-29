// src/components/admin/WorkplacesManager/LogSiteVisitModal.tsx

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, writeBatch, collection, addDoc } from "firebase/firestore";
import {
    X, Loader2, CheckCircle2, Plus, Trash2, Calendar, User,
    FileText, ShieldAlert, Camera, ClipboardCheck, BarChart2, Target,
    Building, Home, Laptop, Info, ChevronDown, ChevronUp, AlertCircle
} from "lucide-react";
import { useToast } from "../../common/Toast/Toast";
import { useStore } from "../../../store/useStore";
import { db, storage } from "../../../lib/firebase";

interface LogSiteVisitModalProps {
    placementId: string;
    learnerId: string;
    learnerName: string;
    employerId: string;
    employerName: string;
    mentorName?: string;
    trancheId?: string;
    requirementId?: string;
    approvedWpHours?: number;
    targetWpHours?: number;
    onClose: () => void;
    onSaved: () => void;
}

export const LogSiteVisitModal: React.FC<LogSiteVisitModalProps> = ({
    placementId,
    learnerId,
    learnerName,
    employerId,
    employerName,
    mentorName = "Unassigned",
    trancheId,
    requirementId,
    approvedWpHours = 0,
    targetWpHours = 1600,
    onClose,
    onSaved,
}) => {
    const toast = useToast();
    const { user } = useStore() as any;
    const [submitting, setSubmitting] = useState(false);

    // ── Explainer Banner State ──
    const [showGuide, setShowGuide] = useState(true);

    // ── Workplace Model Setup ──
    const [workplaceModel, setWorkplaceModel] = useState<"On-Site" | "Hybrid" | "Remote">("On-Site");
    const isRemote = workplaceModel === "Remote";

    // ── 1. Admin Info ──
    const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0]);
    const [visitNumber, setVisitNumber] = useState(1);
    const [visitorName, setVisitorName] = useState(user?.fullName || user?.displayName || "Internal Assessor");
    const [visitType, setVisitType] = useState("Routine Monitoring");
    const [nextVisitDate, setNextVisitDate] = useState("");

    // ── 2. Compliance Verification ──
    const initialCompliance = {
        learnerAttRegister: false,
        learnerLogbookUpdated: false,
        learnerTimesheets: false,
        learnerAgreementOnFile: false,
        employerMentorAssigned: false,
        employerWorkspaceOk: false,
        employerEquipmentProvided: false,
        employerTasksMeaningful: false,
        programEvidenceAvail: false,
        programWblAgreement: false,
        programReportingUpToDate: false,
    };
    type ComplianceKey = keyof typeof initialCompliance;
    const [compliance, setCompliance] = useState<Record<ComplianceKey, boolean>>(initialCompliance);
    const toggleCompliance = (key: ComplianceKey) => setCompliance((p) => ({ ...p, [key]: !p[key] }));

    // ── 3. Workplace Learning Review (Competency Matrix 1-5) ──
    const initialCompetencies = {
        Technical: 3,
        Communication: 3,
        Teamwork: 3,
        Professionalism: 3,
        ProblemSolving: 3,
        Initiative: 3,
        Innovation: 3,
        TimeManagement: 3,
    };
    type CompetencyKey = keyof typeof initialCompetencies;
    const [competencies, setCompetencies] = useState<Record<CompetencyKey, number>>(initialCompetencies);

    // ── 4. Learner Interview ──
    const [interviewProjects, setInterviewProjects] = useState("");
    const [interviewLearnings, setInterviewLearnings] = useState("");
    const [interviewChallenges, setInterviewChallenges] = useState("");

    // ── 5. Mentor Feedback ──
    const [mentorStrengths, setMentorStrengths] = useState("");
    const [mentorImprovements, setMentorImprovements] = useState("");
    const [mentorEmployability, setMentorEmployability] = useState("Yes");

    // ── 6. Logbook & Automated Completion ──
    const calculatedCompletion = useMemo(() => {
        if (!targetWpHours || targetWpHours === 0) return 0;
        return Math.min(100, Math.round((approvedWpHours / targetWpHours) * 100));
    }, [approvedWpHours, targetWpHours]);

    const [logbookCompletion, setLogbookCompletion] = useState<number>(calculatedCompletion);
    const [isManualOverride, setIsManualOverride] = useState(false);
    const [evidenceVerified, setEvidenceVerified] = useState(true);
    const [portfolioUpdated, setPortfolioUpdated] = useState(true);

    useEffect(() => {
        if (!isManualOverride) setLogbookCompletion(calculatedCompletion);
    }, [calculatedCompletion, isManualOverride]);

    // ── 7. Risk Matrix ──
    const initialRisks = {
        Attendance: "Low",
        Performance: "Low",
        MentorSupport: "Low",
        Compliance: "Low",
        PlacementStability: "Low",
    };
    type RiskKey = keyof typeof initialRisks;
    const [risks, setRisks] = useState<Record<RiskKey, string>>(initialRisks);

    // ── 8. Corrective Action Plan ──
    const [actionItems, setActionItems] = useState([
        { action: "", owner: "Learner", dueDate: "", status: "Pending" },
    ]);
    const updateActionItem = (i: number, field: string, val: string) =>
        setActionItems((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: val } : a)));

    // ── 9. Overall Assessment ──
    const [overallStatus, setOverallStatus] = useState<"Green" | "Amber" | "Red">("Green");
    const [recommendation, setRecommendation] = useState("Continue placement");

    // ── 10. Evidence Files ──
    const [visitPhotoFile, setVisitPhotoFile] = useState<File | null>(null);

    // ── 🧮 DYNAMIC WEIGHTED SCORING ENGINE ──
    const siteVisitScore = useMemo(() => {
        let compKeys = Object.keys(compliance) as ComplianceKey[];
        let totalCompChecks = compKeys.length;
        let checkedCount = compKeys.filter((k) => compliance[k]).length;

        if (isRemote && !compliance.employerWorkspaceOk) totalCompChecks -= 1;

        const compScore = totalCompChecks > 0 ? (checkedCount / totalCompChecks) * 20 : 20; // 20%
        const compVals = Object.values(competencies);
        const learningScore = (compVals.reduce((a, b) => a + b, 0) / (compVals.length * 5)) * 30; // 30%
        const mentorScore = (mentorEmployability === "Yes" ? 100 : mentorEmployability === "Maybe" ? 50 : 0) * 0.15; // 15%
        const progressScore = ((logbookCompletion + (evidenceVerified ? 100 : 0) + (portfolioUpdated ? 100 : 0)) / 300) * 20; // 20%
        const docScore = ((evidenceVerified ? 50 : 0) + (portfolioUpdated ? 50 : 0)) * 0.15; // 15%

        return Math.round(compScore + learningScore + mentorScore + progressScore + docScore);
    }, [compliance, competencies, mentorEmployability, logbookCompletion, evidenceVerified, portfolioUpdated, isRemote]);

    useEffect(() => {
        if (siteVisitScore >= 85) setOverallStatus("Green");
        else if (siteVisitScore >= 65) setOverallStatus("Amber");
        else setOverallStatus("Red");
    }, [siteVisitScore]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            let photoUrl = "";
            if (visitPhotoFile) {
                const photoRef = ref(storage, `site_visits/${placementId}/photo_${Date.now()}_${visitPhotoFile.name.replace(/[^a-zA-Z0-9.]/g, "_")}`);
                await uploadBytes(photoRef, visitPhotoFile);
                photoUrl = await getDownloadURL(photoRef);
            }

            const compositeKey = trancheId && requirementId ? `${trancheId}_${requirementId}` : `visit_${Date.now()}`;

            const visitData = {
                placementId, learnerId, learnerName, employerId, employerName, mentorName,
                adminInfo: { visitDate, visitNumber, visitorName, visitType, nextVisitDate, workplaceModel },
                compliance, competencies,
                learnerInterview: { interviewProjects, interviewLearnings, interviewChallenges },
                mentorFeedback: { mentorStrengths, mentorImprovements, mentorEmployability },
                logbookAudit: { logbookCompletion, evidenceVerified, portfolioUpdated },
                riskMatrix: risks,
                actionPlan: actionItems.filter((a) => a.action.trim() !== ""),
                overallAssessment: { overallStatus, recommendation, siteVisitScore },
                evidence: { photoUrl },
                createdAt: new Date().toISOString(),
            };

            const batch = writeBatch(db);
            const placementRef = doc(db, "placements", placementId);

            batch.update(placementRef, {
                [`evidenceMap.${compositeKey}`]: {
                    url: photoUrl || "logged_site_visit",
                    uploadedAt: new Date().toISOString(),
                    fileName: `Site_Visit_${visitNumber}_${visitDate}.pdf`,
                    visitDate, riskFlag: overallStatus, visitorName, siteVisitScore, isSiteVisit: true,
                },
                lastVisitScore: siteVisitScore,
                lastVisitDate: visitDate,
                updatedAt: new Date().toISOString(),
            });

            await batch.commit();
            await addDoc(collection(db, "site_visits"), visitData);

            toast.success(`Site Visit Report Logged! Score: ${siteVisitScore}%`);
            onSaved();
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Failed to log site visit report.");
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="lfm-overlay animate-fade-in" style={{ zIndex: 1000000 }} onClick={onClose}>
            <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "880px", maxHeight: "92vh" }}>

                {/* ── HEADER ── */}
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <ClipboardCheck size={18} /> Workplace Monitoring Report
                    </h2>

                    <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "0.6rem", color: "var(--mlab-green)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em" }}>Audit Score</div>
                            <div style={{ fontSize: "1.6rem", fontFamily: "var(--font-heading)", fontWeight: 800, color: siteVisitScore >= 85 ? "var(--mlab-green)" : siteVisitScore >= 65 ? "#f59e0b" : "#ef4444", lineHeight: 1 }}>
                                {siteVisitScore}%
                            </div>
                        </div>
                        <button className="lfm-close-btn" type="button" onClick={onClose} disabled={submitting}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                    <div className="lfm-body">

                        {/* SUBTITLE & QUICK SUMMARY BAR */}
                        <div style={{ background: "var(--mlab-light-blue)", padding: "0.75rem 1rem", border: "1px solid var(--mlab-border)", borderLeft: "4px solid var(--mlab-blue)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-blue)" }}>
                                Learner: <strong>{learnerName}</strong> @ <strong>{employerName}</strong>
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                                Supervisor: {mentorName}
                            </span>
                        </div>

                        {/* ── 🚀 EXPLAINER & ASSESSOR SOP BANNER ── */}
                        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderLeft: "4px solid #0ea5e9" }}>
                            <button
                                type="button"
                                onClick={() => setShowGuide(!showGuide)}
                                style={{
                                    width: "100%", padding: "0.65rem 1rem", background: "none", border: "none",
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    cursor: "pointer", color: "#0369a1", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em"
                                }}
                            >
                                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <Info size={15} color="#0ea5e9" /> Assessor Guidance & Inspection Criteria
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "#0284c7" }}>
                                    {showGuide ? "Hide Guide" : "Show Guide"} {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </span>
                            </button>

                            {showGuide && (
                                <div style={{ padding: "0 1rem 0.85rem 1rem", fontSize: "0.78rem", color: "#334155", lineHeight: 1.5, borderTop: "1px solid #e0f2fe", paddingTop: "0.65rem" }} className="animate-fade-in">
                                    <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>
                                        This audit establishes official quality proof required for SETA Tranche Disbursements and QCTO accreditation compliance. Please inspect and verify the following:
                                    </p>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                        <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "4px" }}>
                                            <li><strong>1. Workstation & OHS:</strong> Ensure the intern has a dedicated, safe desk, computer, and required tools of trade.</li>
                                            <li><strong>2. Logbook Currency:</strong> Cross-check logbook tasks against actual practical activities. Verify weekly supervisor sign-offs.</li>
                                        </ul>
                                        <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "4px" }}>
                                            <li><strong>3. Task Relevance:</strong> Confirm tasks align strictly with the qualification curriculum (no trivial non-learning tasks).</li>
                                            <li><strong>4. Mentor Support:</strong> Interview the supervisor to confirm active mentorship and gauge post-internship absorption/employment willingness.</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 1. VISIT LOGISTICS */}
                        <div>
                            <div className="lfm-section-hdr">
                                <Calendar size={13} /> 1. Visit Logistics & Metadata
                            </div>
                            <div className="lfm-grid">
                                <div className="lfm-fg">
                                    <label>Visit Date *</label>
                                    <input className="lfm-input" type="date" required value={visitDate} onChange={(e) => setVisitDate(e.target.value)} disabled={submitting} />
                                </div>
                                <div className="lfm-fg">
                                    <label>Visit Number #</label>
                                    <input className="lfm-input" type="number" min="1" required value={visitNumber} onChange={(e) => setVisitNumber(Number(e.target.value))} disabled={submitting} />
                                </div>
                                <div className="lfm-fg">
                                    <label>Monitoring Officer Name *</label>
                                    <input className="lfm-input" type="text" required value={visitorName} onChange={(e) => setVisitorName(e.target.value)} disabled={submitting} />
                                </div>
                                <div className="lfm-fg">
                                    <label>Visit Type</label>
                                    <select className="lfm-input lfm-select" value={visitType} onChange={(e) => setVisitType(e.target.value)} disabled={submitting}>
                                        <option value="Routine Monitoring">Routine Monitoring</option>
                                        <option value="Initial Onboarding Visit">Initial Onboarding Visit</option>
                                        <option value="Risk Follow-up Audit">Risk Follow-up Audit</option>
                                        <option value="Final Exit Assessment">Final Exit Assessment</option>
                                    </select>
                                </div>
                                <div className="lfm-fg">
                                    <label>Workplace Setup Model</label>
                                    <select className="lfm-input lfm-select" value={workplaceModel} onChange={(e) => setWorkplaceModel(e.target.value as any)} disabled={submitting}>
                                        <option value="On-Site">On-Site Physical Office</option>
                                        <option value="Hybrid">Hybrid Office / WFH</option>
                                        <option value="Remote">Fully Remote / Virtual</option>
                                    </select>
                                </div>
                                <div className="lfm-fg">
                                    <label>Next Scheduled Visit</label>
                                    <input className="lfm-input" type="date" value={nextVisitDate} onChange={(e) => setNextVisitDate(e.target.value)} disabled={submitting} />
                                </div>
                            </div>
                        </div>

                        {/* 2. COMPLIANCE VERIFICATION */}
                        <div>
                            <div className="lfm-section-hdr">
                                <ShieldAlert size={13} /> 2. SETA Quality & Compliance Verification
                            </div>
                            <p style={{ fontSize: "0.72rem", color: "var(--mlab-grey)", marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
                                💡 <em>Check all items physically verified on site or during the virtual interview call.</em>
                            </p>
                            <div className="lfm-flags-panel" style={{ background: "white", padding: "1rem" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>

                                    {/* Learner Compliance */}
                                    <div>
                                        <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.7rem", fontWeight: 700, color: "var(--mlab-blue)", textTransform: "uppercase", marginBottom: "0.5rem", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "2px" }}>
                                            Learner Proofs
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                            {(Object.keys(compliance) as ComplianceKey[]).filter((k) => k.startsWith("learner")).map((k) => (
                                                <label key={k} className="lfm-checkbox-row" style={{ fontSize: "0.8rem" }}>
                                                    <input type="checkbox" checked={compliance[k]} onChange={() => toggleCompliance(k)} disabled={submitting} />
                                                    {k.replace("learner", "").replace(/([A-Z])/g, " $1").trim()}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Employer Compliance */}
                                    <div>
                                        <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.7rem", fontWeight: 700, color: "var(--mlab-blue)", textTransform: "uppercase", marginBottom: "0.5rem", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "2px" }}>
                                            Employer Setup
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                            {(Object.keys(compliance) as ComplianceKey[]).filter((k) => k.startsWith("employer")).map((k) => (
                                                <label key={k} className="lfm-checkbox-row" style={{ fontSize: "0.8rem", opacity: isRemote && k === "employerWorkspaceOk" ? 0.6 : 1 }}>
                                                    <input type="checkbox" checked={compliance[k]} onChange={() => toggleCompliance(k)} disabled={submitting} />
                                                    {k.replace("employer", "").replace(/([A-Z])/g, " $1").trim()}
                                                    {isRemote && k === "employerWorkspaceOk" && " (Bypassed Remote)"}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Programme Compliance */}
                                    <div>
                                        <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.7rem", fontWeight: 700, color: "var(--mlab-blue)", textTransform: "uppercase", marginBottom: "0.5rem", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "2px" }}>
                                            Programme Governance
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                            {(Object.keys(compliance) as ComplianceKey[]).filter((k) => k.startsWith("program")).map((k) => (
                                                <label key={k} className="lfm-checkbox-row" style={{ fontSize: "0.8rem" }}>
                                                    <input type="checkbox" checked={compliance[k]} onChange={() => toggleCompliance(k)} disabled={submitting} />
                                                    {k.replace("program", "").replace(/([A-Z])/g, " $1").trim()}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>

                        {/* 3. COMPETENCY MATRIX */}
                        <div>
                            <div className="lfm-section-hdr">
                                <BarChart2 size={13} /> 3. Workplace Learning Review (Competency Ratings 1 - 5)
                            </div>
                            <p style={{ fontSize: "0.72rem", color: "var(--mlab-grey)", marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
                                💡 <em>Rate soft and hard skills observed directly or reported by the workplace supervisor.</em>
                            </p>
                            <div className="lfm-grid">
                                {(Object.keys(competencies) as CompetencyKey[]).map((comp) => (
                                    <div key={comp} className="lfm-fg">
                                        <label>{comp.replace(/([A-Z])/g, " $1").trim()}</label>
                                        <select
                                            className="lfm-input lfm-select"
                                            value={competencies[comp]}
                                            onChange={(e) => setCompetencies((p) => ({ ...p, [comp]: Number(e.target.value) }))}
                                            disabled={submitting}
                                        >
                                            <option value={1}>1 - Poor / Unsatisfactory</option>
                                            <option value={2}>2 - Below Expectation</option>
                                            <option value={3}>3 - Competent / Meets Standard</option>
                                            <option value={4}>4 - Above Expectation</option>
                                            <option value={5}>5 - Excellent / Mastered</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4 & 5. INTERVIEWS */}
                        <div className="lfm-grid">
                            <div className="lfm-fg">
                                <div className="lfm-section-hdr"><User size={13} /> 4. Learner Interview Notes</div>
                                <p style={{ fontSize: "0.72rem", color: "var(--mlab-grey)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                                    💡 <em>Private interview notes with learner regarding tasks, learnings, and any workplace grievances.</em>
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    <textarea className="lfm-input" style={{ height: "65px", resize: "vertical" }} placeholder="Current projects/tasks working on..." value={interviewProjects} onChange={(e) => setInterviewProjects(e.target.value)} disabled={submitting} />
                                    <textarea className="lfm-input" style={{ height: "65px", resize: "vertical" }} placeholder="Key learnings & practical experience gained..." value={interviewLearnings} onChange={(e) => setInterviewLearnings(e.target.value)} disabled={submitting} />
                                    <textarea className="lfm-input" style={{ height: "65px", resize: "vertical" }} placeholder="Challenges, stipend issues, or workplace grievances..." value={interviewChallenges} onChange={(e) => setInterviewChallenges(e.target.value)} disabled={submitting} />
                                </div>
                            </div>

                            <div className="lfm-fg">
                                <div className="lfm-section-hdr"><User size={13} /> 5. Mentor Feedback</div>
                                <p style={{ fontSize: "0.72rem", color: "var(--mlab-grey)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                                    💡 <em>Supervisor feedback regarding intern performance, work ethic, and future employment prospects.</em>
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    <textarea className="lfm-input" style={{ height: "65px", resize: "vertical" }} placeholder="Observed strengths & initiative..." value={mentorStrengths} onChange={(e) => setMentorStrengths(e.target.value)} disabled={submitting} />
                                    <textarea className="lfm-input" style={{ height: "65px", resize: "vertical" }} placeholder="Areas requiring improvement or coaching..." value={mentorImprovements} onChange={(e) => setMentorImprovements(e.target.value)} disabled={submitting} />
                                    <div className="lfm-fg" style={{ marginTop: "4px" }}>
                                        <label>Absorption / Employment Potential Post-Placement</label>
                                        <select className="lfm-input lfm-select" value={mentorEmployability} onChange={(e) => setMentorEmployability(e.target.value)} disabled={submitting}>
                                            <option value="Yes">Yes (High Potential for Absorption)</option>
                                            <option value="Maybe">Maybe (Needs Development)</option>
                                            <option value="No">No (Unlikely to Absorbed)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 6 & 7. LOGBOOK AUDIT & RISK MATRIX */}
                        <div className="lfm-grid">
                            <div className="lfm-fg">
                                <div className="lfm-section-hdr"><FileText size={13} /> 6. Logbook & Portfolio Audit</div>
                                <p style={{ fontSize: "0.72rem", color: "var(--mlab-grey)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                                    💡 <em>Cross-check system-logged hours against actual practical output, and confirm mentor sign-offs on physical or digital Portfolio of Evidence (PoE) items.</em>
                                </p>
                                <div className="lfm-flags-panel" style={{ background: "white" }}>
                                    <div className="lfm-fg">
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <label style={{ margin: 0 }}>System Verified Logbook Completion</label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsManualOverride(!isManualOverride);
                                                    if (isManualOverride) setLogbookCompletion(calculatedCompletion);
                                                }}
                                                style={{ background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                                            >
                                                {isManualOverride ? "Reset to System Calculation" : "Override with Paper Book Count"}
                                            </button>
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "4px" }}>
                                            <div style={{ flex: 1, background: "#e2e8f0", height: "10px", borderRadius: 0, overflow: "hidden" }}>
                                                <div style={{ width: `${logbookCompletion}%`, background: logbookCompletion >= 80 ? "var(--mlab-green)" : logbookCompletion >= 50 ? "#f59e0b" : "#ef4444", height: "100%", transition: "width 0.3s ease" }} />
                                            </div>
                                            <strong style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", color: "var(--mlab-midnight)", minWidth: "45px" }}>
                                                {logbookCompletion}%
                                            </strong>
                                        </div>

                                        <div style={{ fontSize: "0.68rem", color: "var(--mlab-grey)", marginTop: "4px" }}>
                                            {isManualOverride ? (
                                                <span style={{ color: "#d97706", fontWeight: 700 }}>⚠️ Manual Override Active (Inspecting Physical Paper Logbook)</span>
                                            ) : (
                                                <span>Logged in System: <strong>{approvedWpHours.toFixed(1)} hrs</strong> / {targetWpHours} hrs required</span>
                                            )}
                                        </div>

                                        {isManualOverride && (
                                            <div style={{ marginTop: "8px" }} className="animate-fade-in">
                                                <label style={{ fontSize: "0.65rem" }}>Enter Audited Logbook Percentage (%)</label>
                                                <input
                                                    className="lfm-input"
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={logbookCompletion}
                                                    onChange={(e) => setLogbookCompletion(Math.min(100, Math.max(0, Number(e.target.value))))}
                                                    disabled={submitting}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <label className="lfm-checkbox-row" style={{ marginTop: "0.5rem" }}>
                                        <input type="checkbox" checked={evidenceVerified} onChange={(e) => setEvidenceVerified(e.target.checked)} disabled={submitting} />
                                        Workplace Evidence Verified & Signed Off
                                    </label>
                                    <label className="lfm-checkbox-row">
                                        <input type="checkbox" checked={portfolioUpdated} onChange={(e) => setPortfolioUpdated(e.target.checked)} disabled={submitting} />
                                        Portfolio of Evidence (PoE) Up To Date
                                    </label>
                                </div>
                            </div>

                            <div className="lfm-fg">
                                <div className="lfm-section-hdr"><ShieldAlert size={13} /> 7. Risk Assessment Matrix</div>
                                <p style={{ fontSize: "0.72rem", color: "var(--mlab-grey)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                                    💡 <em>Flag elevated risk indicators that require intervention prior to next visit.</em>
                                </p>
                                <div className="lfm-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                                    {(Object.keys(risks) as RiskKey[]).map((r) => (
                                        <div key={r} className="lfm-fg">
                                            <label style={{ fontSize: "0.62rem" }}>{r.replace(/([A-Z])/g, " $1").trim()}</label>
                                            <select
                                                className="lfm-input lfm-select"
                                                style={{ padding: "0.4rem 0.5rem", fontSize: "0.8rem", color: risks[r] === "High" ? "#dc2626" : risks[r] === "Medium" ? "#d97706" : "#16a34a", fontWeight: 700 }}
                                                value={risks[r]}
                                                onChange={(e) => setRisks((p) => ({ ...p, [r]: e.target.value }))}
                                                disabled={submitting}
                                            >
                                                <option value="Low">Low Risk</option>
                                                <option value="Medium">Medium Risk</option>
                                                <option value="High">High Risk</option>
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 8. CORRECTIVE ACTION PLAN */}
                        <div>
                            <div className="lfm-section-hdr" style={{ justifyContent: "space-between" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <Target size={13} /> 8. Corrective Action Plan
                                </span>
                                <button
                                    type="button"
                                    className="lfm-btn"
                                    onClick={() => setActionItems((p) => [...p, { action: "", owner: "mLab", dueDate: "", status: "Pending" }])}
                                    style={{ background: "var(--mlab-light-blue)", border: "1px solid var(--mlab-border)", padding: "0.25rem 0.65rem", fontSize: "0.68rem" }}
                                >
                                    <Plus size={12} /> Add Action
                                </button>
                            </div>
                            <p style={{ fontSize: "0.72rem", color: "var(--mlab-grey)", marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
                                💡 <em>Document specific remediation steps for any identified gaps or risks. Assign clear ownership (Learner, Mentor, Employer, mLab) with enforceable deadline dates.</em>
                            </p>

                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                {actionItems.map((item, i) => (
                                    <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1.2fr 1fr auto", gap: "0.5rem", alignItems: "center", background: "#f8fafc", padding: "0.5rem", border: "1px solid var(--mlab-border)" }}>
                                        <input className="lfm-input" placeholder="Required corrective action..." value={item.action} onChange={(e) => updateActionItem(i, "action", e.target.value)} disabled={submitting} />
                                        <select className="lfm-input lfm-select" style={{ padding: "0.4rem" }} value={item.owner} onChange={(e) => updateActionItem(i, "owner", e.target.value)} disabled={submitting}>
                                            <option>Learner</option>
                                            <option>Mentor</option>
                                            <option>mLab</option>
                                            <option>Employer</option>
                                        </select>
                                        <input className="lfm-input" type="date" value={item.dueDate} onChange={(e) => updateActionItem(i, "dueDate", e.target.value)} disabled={submitting} />
                                        <select className="lfm-input lfm-select" style={{ padding: "0.4rem" }} value={item.status} onChange={(e) => updateActionItem(i, "status", e.target.value)} disabled={submitting}>
                                            <option>Pending</option>
                                            <option>Done</option>
                                        </select>
                                        <button type="button" onClick={() => setActionItems((p) => p.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "var(--mlab-red)", cursor: "pointer", padding: "4px" }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 9 & 10. OVERALL ASSESSMENT & EVIDENCE UPLOAD */}
                        <div className="lfm-grid">
                            <div className="lfm-fg">
                                <div className="lfm-section-hdr"><ClipboardCheck size={13} /> 9. Overall Assessment</div>
                                <div className="lfm-flags-panel" style={{ background: "white" }}>
                                    <div className="lfm-fg">
                                        <label>Auto-Calculated Placement Status</label>
                                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.1rem", color: overallStatus === "Green" ? "#16a34a" : overallStatus === "Amber" ? "#d97706" : "#dc2626" }}>
                                            {overallStatus === "Green" ? "🟢 ON TRACK (COMPLIANT)" : overallStatus === "Amber" ? "🟡 REQUIRES SUPPORT" : "🔴 CRITICAL BREACH"}
                                        </div>
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Recommendation</label>
                                        <select className="lfm-input lfm-select" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} disabled={submitting}>
                                            <option>Continue placement</option>
                                            <option>Increase monitoring frequency</option>
                                            <option>Provide targeted coaching</option>
                                            <option>Escalate to Programme Manager</option>
                                            <option>Initiate placement review / transfer</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="lfm-fg">
                                <div className="lfm-section-hdr"><Camera size={13} /> 10. Photo & Document Proof</div>
                                <div className="lfm-fg">
                                    <label>Workstation Photo / Virtual Call Screenshot</label>
                                    <input className="lfm-input" type="file" accept="image/*,.pdf" onChange={(e) => e.target.files && setVisitPhotoFile(e.target.files[0])} disabled={submitting} />
                                </div>
                                <div style={{ fontSize: "0.72rem", color: "var(--mlab-grey)", marginTop: "0.5rem", lineHeight: 1.4 }}>
                                    <strong>Audit Sign-off:</strong> Submitting this report locks the verification timestamp in the permanent database log for SETA verification.
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* ── FOOTER ── */}
                    <div className="lfm-footer">
                        <div style={{ marginRight: "auto", fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--mlab-grey)" }}>
                            Calculated Health Score: <strong style={{ color: "var(--mlab-blue)", fontSize: "1rem" }}>{siteVisitScore}%</strong>
                        </div>
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={submitting}>
                            Cancel
                        </button>
                        <button type="submit" className="lfm-btn lfm-btn--primary" disabled={submitting}>
                            {submitting ? (
                                <><Loader2 size={13} className="lfm-spin" /> Submitting Report…</>
                            ) : (
                                <><CheckCircle2 size={13} /> Submit Official Report</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};