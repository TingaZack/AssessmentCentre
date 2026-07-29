// src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

import React, { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { collection, query, where, getDocs, doc, onSnapshot, updateDoc, writeBatch } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../../../lib/firebase";
import {
    MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
    ShieldCheck, ChevronRight, Activity, RefreshCw, UploadCloud, ChevronDown, ChevronUp, Archive,
    CheckSquare, Square, Edit, Link as LinkIcon, Save, ChevronLeft, History, Wallet, Info, BarChart3, Filter
} from "lucide-react";
import moment from "moment";
import * as XLSX from "xlsx";

// Modularized components
import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
import { LogbookAuditModal } from "./LogbookAuditModal";
import { StipendDisbursementModal } from "./StipendDisbursementModal";
import { BulkStipendUploader } from "./BulkStipendUploader";
import { UnclaimedEtiBanner } from "./UnclaimedEtiBanner";
import { TaxAdvisoryModal } from "./TaxAdvisoryModal";
import { LogSiteVisitModal } from "../LogSiteVisitModal";

import type { ComplianceSchema, DashboardLearner, Employer, PlacementContract } from "../../../../types";
import { useStore, type StaffMember } from "../../../../store/useStore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { EvidenceExportModal } from "../../PlacementsDashboard/EvidenceExportModal";
import { useNavigate } from "react-router-dom";
import { ToastContainer, useToast } from "../../../common/Toast/Toast";
import type { UploadedEvidence } from "../../PlacementsDashboard/PlacementsDashboard";
import { StatusModal } from "../../../common/StatusModal/StatusModal";
import { PlacementMasterModal } from "./PlacementMasterModal";
import MentorModal from "../MentorModal";

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
        employmentContractUrl?: string;
        slaUrl?: string;
        smeAgreementUrl?: string;
        dueDiligenceUrl?: string;
    };
    complianceScore: number;
    complianceItems: {
        key: string;
        label: string;
        isComplete: boolean;
        isRequired: boolean;
        url?: string;
        actionType: 'upload' | 'assign' | 'none';
        dbTarget: 'learner' | 'placement';
    }[];
    learnerName: string;
    idNumber: string;
    equityGroup: string;
    hasDisability: boolean;
    isFemale: boolean;
    isYouth: boolean;
    employerName: string;
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
    complianceSchema?: ComplianceSchema; 
    evidenceMap?: Record<string, UploadedEvidence>; 
    
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
            if (!holidays.includes(current.format('YYYY-MM-DD'))) days++;
        }
        current.add(1, 'days');
    }
    return days;
};

// ─── ETI BREAKDOWN MODAL ───
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
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: 0, border: '2px solid var(--mlab-border)' }}>
                <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', borderRadius: 0, border: '1px solid var(--mlab-border)' }}><Landmark size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">SARS ETI Tax Rebate Audit</h2>
                        <p className="wm-modal__subtitle">Calculated for {learner.learnerName}</p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '1rem', borderRadius: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "8px", marginBottom: "8px" }}>
                            <span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)", fontWeight: 600 }}>Database Stipend Value:</span>
                            <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(wage)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "8px", marginBottom: "8px" }}>
                            <span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)", fontWeight: 600 }}>Official ETI Calculation:</span>
                            <strong style={{ fontSize: "1.1rem", color: "var(--mlab-green-dark)" }}>{formatCurrency(eti)} /mo</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)", fontWeight: 600 }}>Annualized Projection:</span>
                            <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(annualEti)}</strong>
                        </div>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>Mathematical Formula Check:</div>
                    <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: 0, fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600 }}>{mathString}</div>
                </div>
                <div className="wm-modal__footer" style={{ borderTop: '1px solid var(--mlab-border)' }}>
                    <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: 0 }} onClick={onClose}>Close Audit Trail</button>
                </div>
            </div>
        </div>,
        document.body
    );
};


// ─── PLACEMENT DETAILS DRAWER ───
interface PlacementDetailsDrawerProps {
    placement: EnrichedPlacement;
    companyName: string;
    workplaceLogs: any[];
    saHolidays: string[];
    onClose: () => void;
    onOpenEti: (p: EnrichedPlacement) => void;
    onOpenLogs: (p: EnrichedPlacement) => void;
    onEditPlacement: (p: EnrichedPlacement) => void;
}

export const PlacementDetailsDrawer: React.FC<PlacementDetailsDrawerProps> = ({ placement, companyName, workplaceLogs, saHolidays, onClose, onOpenEti, onOpenLogs, onEditPlacement }) => {
    const toast = useToast();
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isGeneratingPack, setIsGeneratingPack] = useState(false);
    const [auditPackError, setAuditPackError] = useState<string | null>(null);
    const [showDisbursementModal, setShowDisbursementModal] = useState(false);

    const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);
    const [uploadingTrancheKey, setUploadingTrancheKey] = useState<string | null>(null);
    const [linkingReq, setLinkingReq] = useState<{ trancheId: string, req: any } | null>(null);

    const [disbursements, setDisbursements] = useState<any[]>([]);
    const [isLoadingLedger, setIsLoadingLedger] = useState(true);
    const [isLedgerExpanded, setIsLedgerExpanded] = useState(false);

    const [siteVisitTarget, setSiteVisitTarget] = useState<{ trancheId: string, req: any } | null>(null);
    const [pendingUpload, setPendingUpload] = useState<{ file: File; trancheId: string; req: any } | null>(null);
    const { user } = useStore() as any;

    const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
    const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

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

    const handleUploadComplianceDoc = async (e: React.ChangeEvent<HTMLInputElement>, item: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingDocKey(item.key);
        try {
            const fileRef = ref(storage, `compliance/${placement.id}/${item.key}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);
            if (item.dbTarget === 'learner') {
                await updateDoc(doc(db, 'learners', placement.learnerId), {
                    [`documents.${item.key}`]: downloadUrl,
                    idDocumentUrl: item.key === 'idDoc' ? downloadUrl : undefined,
                    updatedAt: new Date().toISOString()
                });
            } else {
                let docField = `${item.key}Url`;
                if (item.key === 'wblpa') docField = 'wblpaAgreementUrl';
                if (item.key === 'empContract') docField = 'employmentContractUrl';
                await updateDoc(doc(db, 'placements', placement.id), {
                    [`compliance.${docField}`]: downloadUrl,
                    updatedAt: new Date().toISOString()
                });
            }
            toast.success(`${item.label} uploaded successfully!`);
        } catch (err: any) {
            toast.error("Failed to upload document.");
        } finally {
            setUploadingDocKey(null);
            if (e.target) e.target.value = '';
        }
    };

 // ─── 🚀 ADMIN COMPLIANCE VAULT: TRIGGER UPLOAD ALERT ───
    const triggerTrancheUpload = (e: React.ChangeEvent<HTMLInputElement>, trancheId: string, req: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPendingUpload({ file, trancheId, req });
        if (e.target) e.target.value = '';
    };

    // ─── 🚀 ADMIN COMPLIANCE VAULT: EXECUTE VERSION-CONTROLLED UPLOAD ───
    const executeTrancheUpload = async () => {
        if (!pendingUpload) return;
        const { file, trancheId, req } = pendingUpload;
        const compositeKey = `${trancheId}_${req.id}`;
        setUploadingTrancheKey(compositeKey);
        setPendingUpload(null);

        try {
            const existingEvidence = placement.evidenceMap?.[compositeKey];
            const fileRef = ref(storage, `compliance/${placement.id}/${compositeKey}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);

            // 3. Bundle up the old version into the history array
            const pastRecord: UploadedEvidence | null = existingEvidence ? {
                url: existingEvidence.url,
                uploadedAt: existingEvidence.uploadedAt,
                fileName: existingEvidence.fileName,
                uploadedByUid: existingEvidence.uploadedByUid || (existingEvidence as any).uploadedBy || 'Admin',
                uploadedByName: existingEvidence.uploadedByName || 'System Admin'
            } : null;

            // 4. Create the new root payload
            const evidencePayload: UploadedEvidence = {
                url: downloadUrl,
                uploadedAt: new Date().toISOString(),
                fileName: file.name,
                uploadedByUid: user?.uid || 'Admin',
                uploadedByName: user?.fullName || 'System Admin',
                history: existingEvidence ? [...(existingEvidence.history || []), pastRecord as UploadedEvidence] : []
            };

            const batch = writeBatch(db);
            const placementRef = doc(db, 'placements', placement.id);

            batch.update(placementRef, {
                [`evidenceMap.${compositeKey}`]: evidencePayload,
                updatedAt: new Date().toISOString()
            });

            if (req.systemTag) {
                batch.update(placementRef, {
                    [`compliance.${req.systemTag}`]: downloadUrl
                });
            }

            await batch.commit();
            toast.success(`${req.label} saved to Tranche log!`);
        } catch (err: any) {
            console.error(err);
            toast.error("Failed to process tranche evidence.");
        } finally {
            setUploadingTrancheKey(null);
        }
    };

    const handleLinkExistingEvidence = async (sourceEvidence: any) => {
        if (!linkingReq) return;

        const compositeKey = `${linkingReq.trancheId}_${linkingReq.req.id}`;
        try {
            const batch = writeBatch(db);
            const placementRef = doc(db, 'placements', placement.id);

            batch.update(placementRef, {
                [`evidenceMap.${compositeKey}`]: {
                    ...sourceEvidence,
                    linkedAt: new Date().toISOString(),
                    isLinked: true
                },
                updatedAt: new Date().toISOString()
            });

            if (linkingReq.req.systemTag) {
                batch.update(placementRef, {
                    [`compliance.${linkingReq.req.systemTag}`]: sourceEvidence.url
                });
            }

            await batch.commit();
            toast.success(`${linkingReq.req.label} successfully linked from vault!`);
            setLinkingReq(null);
        } catch (err: any) {
            toast.error("Failed to link evidence.");
        }
    };

    const handleDownloadAuditPack = async (selectedFolders: string[]) => {
        setIsGeneratingPack(true);
        setAuditPackError(null);
        try {
            const functions = getFunctions();
            const generateSetaAuditPack = httpsCallable(functions, "generateSetaAuditPack");
            const response = await generateSetaAuditPack({
                learnerId: placement.learnerId, placementId: placement.id, employerName: companyName,
                learnerName: placement.learnerName, idNumber: placement.idNumber, mentorName: placement.mentorName,
                selectedFolders: selectedFolders
            });
            const data = response.data as { success: boolean; url: string };
            if (data.success && data.url) {
                window.location.href = data.url;
                setIsExportModalOpen(false);
            } else setAuditPackError("Server failed to supply a valid download path.");
        } catch (error: any) {
            setAuditPackError(error.message || "Failed to generate the compliance audit pack.");
        } finally {
            setIsGeneratingPack(false);
        }
    };

    const hasSchema = placement.complianceSchema && placement.complianceSchema.tranches && placement.complianceSchema.tranches.length > 0;
    const evidenceMap = placement.evidenceMap || {};

 return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99990, display: "flex", justifyContent: "flex-end", position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.3)", backdropFilter: "blur(2px)" }}>

            {/* 🚀 FIXED: Added stopPropagation wrapper so this doesn't close the drawer */}
            {isExportModalOpen && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 100000 }} onClick={(e) => e.stopPropagation()}>
                    <EvidenceExportModal learnerName={placement.learnerName} onClose={() => setIsExportModalOpen(false)} onGenerate={handleDownloadAuditPack} isGenerating={isGeneratingPack} />
                </div>
            )}

            {/* 🚀 FIXED: Added stopPropagation so clicking the overlay only closes the linking modal, not the drawer */}
            {linkingReq && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => { e.stopPropagation(); setLinkingReq(null); }}>
                    <div style={{ width: '400px', background: 'white', borderRadius: '0', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '6px' }}><LinkIcon size={16} /> Link File from Vault</h3>
                            <button onClick={() => setLinkingReq(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={16} /></button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>Select an existing file to link as your <strong>{linkingReq.req.label}</strong>.</p>

                        <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {Object.keys(evidenceMap).length > 0 ? Object.entries(evidenceMap).map(([key, ev]: [string, any]) => {
                                if (key === `${linkingReq.trancheId}_${linkingReq.req.id}`) return null;
                                return (
                                    <div key={key} onClick={() => handleLinkExistingEvidence(ev)} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#e0f2fe'} onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FileText size={14} color="var(--mlab-blue)" />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{ev.fileName || 'Uploaded Document'}</span>
                                                <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{moment(ev.uploadedAt).format('DD MMM YYYY')}</span>
                                            </div>
                                        </div>
                                        <ChevronRight size={14} color="#94a3b8" />
                                    </div>
                                );
                            }) : (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', background: '#f1f5f9', borderRadius: '4px' }}>
                                    Vault is empty. You haven't uploaded any files yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Added stopPropagation wrapper so clicking Cancel doesn't bubble up to the drawer overlay */}
            {pendingUpload && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 100000 }} onClick={(e) => e.stopPropagation()}>
                    <StatusModal
                        type="info"
                        title={placement.evidenceMap?.[`${pendingUpload.trancheId}_${pendingUpload.req.id}`] ? "Update Document" : "Confirm Upload"}
                        message={
                            placement.evidenceMap?.[`${pendingUpload.trancheId}_${pendingUpload.req.id}`]
                                ? `You are about to upload a new version ("${pendingUpload.file.name}") for ${pendingUpload.req.label}. The previous document will be securely archived. Do you want to proceed?`
                                : `You are about to upload "${pendingUpload.file.name}" for ${pendingUpload.req.label}. Please ensure this is the correct document before confirming.`
                        }
                        onCancel={() => setPendingUpload(null)}
                        onClose={executeTrancheUpload}
                        confirmText="Yes, Upload File"
                    />
                </div>
            )}

            <div onClick={e => e.stopPropagation()} style={{ width: "450px", maxWidth: "100%", height: "100%", background: "var(--mlab-bg)", display: "flex", flexDirection: "column", boxShadow: "-10px 0 25px rgba(0,0,0,0.1)", animation: "slideInRight 0.3s ease-out" }}>

                <div style={{ padding: "1.5rem", background: "var(--mlab-white)", borderBottom: "1px solid var(--mlab-border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <div className="cdp-learner-avatar" style={{ borderRadius: 0, background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)' }}>{placement.learnerName.charAt(0)}</div>
                            <div><h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>{placement.learnerName}</h3><p style={{ margin: 0, fontSize: "0.8rem", color: "var(--mlab-grey)" }}>ID: {placement.idNumber}</p></div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--mlab-grey)", padding: "4px" }}><X size={20} /></button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

                    {hasSchema ? (
                        <div style={{ background: "white", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)", display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", color: "var(--mlab-midnight)", fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={16} color="var(--mlab-blue)" /> Funding & Disbursement Timeline</h4>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.65rem', color: '#64748b' }}>Schema: {placement.complianceSchema?.schemaName}</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: placement.complianceScore === 100 ? "var(--mlab-green-dark)" : "var(--mlab-amber)", fontFamily: "var(--font-heading)" }}>{placement.complianceScore}%</span>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Core Compliance</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {placement.complianceSchema?.tranches.map((tranche: any, index: number) => {
                                    const dueDate = moment(placement.startDate).add(tranche.dueAtMonth, 'months');
                                    const isOverdue = moment().isAfter(dueDate) && tranche.requirements.some((r: any) => r.required && !evidenceMap[`${tranche.trancheId}_${r.id}`]);

                                    return (
                                        <div key={tranche.trancheId} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: isOverdue ? '#fef2f2' : '#e0f2fe', color: isOverdue ? '#dc2626' : '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, border: `1px solid ${isOverdue ? '#fecaca' : '#bae6fd'}` }}>
                                                        {index + 1}
                                                    </div>
                                                    <h5 style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700 }}>{tranche.title}</h5>
                                                </div>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: isOverdue ? '#fef2f2' : '#f8fafc', color: isOverdue ? '#dc2626' : '#64748b', border: `1px solid ${isOverdue ? '#fecaca' : '#e2e8f0'}` }}>
                                                    Due: {dueDate.format('DD MMM YYYY')}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '14px', borderLeft: `2px solid ${isOverdue ? '#fca5a5' : '#cbd5e1'}`, marginLeft: '9px' }}>
                                                {tranche.requirements.map((req: any) => {
                                                    const compositeKey = `${tranche.trancheId}_${req.id}`;
                                                    const evidence = evidenceMap[compositeKey];
                                                    const isComplete = !!evidence;
                                                    const isUploading = uploadingTrancheKey === compositeKey;

                                                    return (
                                                        <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
                                                                {isComplete ? <CheckSquare size={13} color="#16a34a" /> : <Square size={13} color="#94a3b8" />}
                                                                {req.label}
                                                                {!req.required && <span style={{ fontSize: '0.55rem', background: '#e2e8f0', color: '#64748b', padding: '2px 4px', borderRadius: '2px', textTransform: 'uppercase' }}>Optional</span>}
                                                            </div>

<div>
                                                                {isComplete ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        {evidence.history && evidence.history.length > 0 && (
                                                                            <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                                                v{evidence.history.length + 1}
                                                                            </span>
                                                                        )}
                                                                        {evidence?.isLinked && <span title="Linked from vault" style={{ display: 'flex' }}><LinkIcon size={10} color="#94a3b8" /></span>}
                                                                        
                                                                        <a href={evidence.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
<FileText size={10} /> {evidence.history && evidence.history.length > 0 ? "View Latest" : "View"}
                                                                        </a>
                                                                        
                                                                        <label style={{ fontSize: '0.65rem', color: '#475569', background: 'white', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '0', fontWeight: 700, cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                                                            {isUploading ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
                                                                            {isUploading ? 'Uploading...' : 'Update'}
                                                                            <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => triggerTrancheUpload(e, tranche.trancheId, req)} disabled={isUploading} />
                                                                        </label>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        {req.type === 'site_visit' ? (
                                                                            <button onClick={() => setSiteVisitTarget({ trancheId: tranche.trancheId, req })} style={{ fontSize: '0.65rem', color: 'white', background: '#d97706', border: 'none', padding: '4px 8px', borderRadius: '0', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <Activity size={10} /> Log Visit
                                                                            </button>
                                                                        ) : req.type === 'report' ? (
                                                                            <span style={{ fontSize: '0.6rem', color: '#16a34a', fontStyle: 'italic', fontWeight: 600 }}>Auto-Generated</span>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <button type="button" onClick={() => setLinkingReq({ trancheId: tranche.trancheId, req })} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Link existing file from vault">
                                                                                    <LinkIcon size={12} />
                                                                                </button>
                                                                                <label style={{ fontSize: '0.65rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '0', fontWeight: 700, cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    {isUploading ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
                                                                                    {req.type === 'pop' ? 'Upload PoP' : 'Upload'}
                                                                                    <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => triggerTrancheUpload(e, tranche.trancheId, req)} disabled={isUploading} />
                                                                                </label>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* <div>
                                                                {isComplete ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        {evidence?.isLinked && <span title="Linked from vault" style={{ display: 'flex' }}><LinkIcon size={10} color="#94a3b8" /></span>}
                                                                        <a href={evidence.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <FileText size={10} /> View
                                                                        </a>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        {req.type === 'site_visit' ? (
                                                                            <button onClick={() => setSiteVisitTarget({ trancheId: tranche.trancheId, req })} style={{ fontSize: '0.65rem', color: 'white', background: '#d97706', border: 'none', padding: '4px 8px', borderRadius: '2px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <Activity size={10} /> Log Visit
                                                                            </button>
                                                                        ) : req.type === 'report' ? (
                                                                            <span style={{ fontSize: '0.6rem', color: '#16a34a', fontStyle: 'italic', fontWeight: 600 }}>Auto-Generated</span>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <button type="button" onClick={() => setLinkingReq({ trancheId: tranche.trancheId, req })} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Link existing file from vault">
                                                                                    <LinkIcon size={12} />
                                                                                </button>
                                                                                <label style={{ fontSize: '0.65rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '2px', fontWeight: 700, cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    {isUploading ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
                                                                                    {req.type === 'pop' ? 'Upload PoP' : 'Upload'}
                                                                                    <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => handleTrancheUpload(e, tranche.trancheId, req)} disabled={isUploading} />
                                                                                </label>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div> */}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {placement.complianceScore === 100 && (
                                <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 0, fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s", marginTop: '0.5rem' }}>
                                    {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
                                    {isGeneratingPack ? "Compiling Cloud Zip..." : "Download Completed Audit Pack"}
                                </button>
                            )}
                            {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
                        </div>
                    ) : (
                        <div style={{ background: "var(--mlab-white)", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                <h4 style={{ margin: 0, fontSize: "0.75rem", textTransform: "uppercase", color: "var(--mlab-grey)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} /> Legacy Compliance Vault</h4>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: placement.complianceScore === 100 ? "var(--mlab-green-dark)" : "var(--mlab-amber)", fontFamily: "var(--font-heading)" }}>{placement.complianceScore}%</span>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Core Met</div>
                                </div>
                            </div>
                            <div style={{ width: "100%", background: "#e2e8f0", height: "6px", borderRadius: 0, overflow: "hidden", marginBottom: "1rem" }}>
                                <div style={{ width: `${placement.complianceScore}%`, background: placement.complianceScore === 100 ? "var(--mlab-green)" : "var(--mlab-amber)", height: "100%", transition: "width 0.3s ease-out" }} />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem" }}>
                                {placement.complianceItems.map((item: any) => (
                                    <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '8px 12px', borderRadius: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
                                            {item.isComplete ? <CheckSquare size={14} color="var(--mlab-green)" /> : <Square size={14} color="var(--mlab-grey)" />}
                                            {item.label}
                                            {!item.isRequired && <span style={{ fontSize: '0.6rem', background: '#e2e8f0', color: 'var(--mlab-grey)', padding: '2px 6px', borderRadius: 0, textTransform: 'uppercase' }}>Optional</span>}
                                        </div>
                                        <div>
                                            {item.isComplete ? (
                                                item.url ? (
                                                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={12} /> View</a>
                                                ) : (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--mlab-green-dark)', fontWeight: 700 }}>VERIFIED</span>
                                                )
                                            ) : (
                                                item.actionType === 'upload' ? (
                                                    <label style={{ fontSize: '0.7rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: 0, fontWeight: 700, cursor: uploadingDocKey === item.key ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {uploadingDocKey === item.key ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
                                                        {uploadingDocKey === item.key ? 'Uploading...' : 'Upload'}
                                                        <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={e => handleUploadComplianceDoc(e, item)} disabled={uploadingDocKey === item.key} />
                                                    </label>
                                                ) : item.actionType === 'assign' ? (
                                                    <button onClick={() => onEditPlacement(placement)} style={{ fontSize: '0.7rem', color: 'white', background: '#d97706', border: 'none', padding: '4px 8px', borderRadius: 0, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><User size={10} /> Assign</button>
                                                ) : null
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {placement.complianceScore === 100 && (
                                <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 0, fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s" }}>
                                    {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
                                    {isGeneratingPack ? "Compiling Cloud Zip..." : "Download SETA Audit Pack (.zip)"}
                                </button>
                            )}
                            {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
                        </div>
                    )}

                    <div style={{ background: "var(--mlab-white)", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--mlab-grey)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Briefcase size={14} /> Placement Trajectory</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                            <div><div style={{ fontSize: "0.7rem", color: "var(--mlab-grey)" }}>Start Date</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.startDate)}</div></div>
                            <div><div style={{ fontSize: "0.7rem", color: "var(--mlab-grey)" }}>Expected End</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.endDate)}</div></div>
                            <div style={{ gridColumn: "1 / -1", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}><div style={{ fontSize: "0.7rem", color: "var(--mlab-grey)", marginBottom: "4px" }}>Workplace Supervisor</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: placement.hasMentor ? "var(--mlab-midnight)" : "var(--mlab-red)", display: "flex", alignItems: "center", gap: "6px" }}>{placement.hasMentor ? <><User size={14} /> {placement.mentorName}</> : <><AlertTriangle size={14} /> Unassigned</>}</div></div>
                        </div>
                    </div>

                    <div style={{ background: "var(--mlab-white)", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--mlab-grey)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Landmark size={14} /> Finance & Rebates</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)" }}>Monthly Base Stipend</span><span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-midnight)", textDecoration: placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) ? 'line-through' : 'none' }}>{formatCurrency(placement.stipendAmount)} /mo</span></div>
                            {placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) && (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: 0 }}>
                                    <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: "0.75rem", color: "var(--mlab-red)", fontWeight: 700 }}>EARNED THIS MONTH</span><span style={{ fontSize: "0.65rem", color: "#991b1b" }}>Based on {placement.currentMonthApprovedDays} / {placement.expectedWorkingDaysThisMonth} expected days</span></div>
                                    <span style={{ fontSize: "1rem", fontWeight: 800, color: "var(--mlab-red)" }}>{formatCurrency(placement.currentMonthEarnedStipend)}</span>
                                </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}><span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)" }}>SARS ETI Claim</span>{placement.isEtiEligible && placement.etiMonthlyValue > 0 ? (<button onClick={() => onOpenEti(placement)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: 0, fontSize: "0.75rem", color: "#166534", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Coins size={12} /> {formatCurrency(placement.etiMonthlyValue)} /mo</button>) : (<span style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", background: "#f1f5f9", padding: "4px 8px", borderRadius: 0, border: "1px solid #e2e8f0", fontWeight: 600 }}>Ineligible</span>)}</div>
                            <div style={{ paddingTop: "10px", borderTop: "1px solid #f1f5f9", marginTop: "4px" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-grey)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Historical Payments Ledger</div>
                                {isLoadingLedger ? (<div style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", display: "flex", alignItems: "center", gap: "6px" }}><Loader2 size={12} className="wm-spin" /> Loading records...</div>) : disbursements.length === 0 ? (<div style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", fontStyle: "italic" }}>No disbursements logged yet.</div>) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                        <div style={{ background: "var(--mlab-bg)", border: "1px solid var(--mlab-border)", borderRadius: 0, padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{disbursements[0].monthYear}</div><div style={{ fontSize: "0.65rem", color: "var(--mlab-grey)", fontFamily: "monospace" }}>{disbursements[0].bankReference}</div></div>
                                            <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-green-dark)" }}>{formatCurrency(disbursements[0].netPayment)}</div>{disbursements[0].payslipEftUrl ? (<a href={disbursements[0].payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "var(--mlab-grey)" }}>Bulk Sync</span>)}</div>
                                        </div>
                                        {disbursements.length > 1 && (
                                            <div style={{ marginTop: "4px" }}>
                                                <button onClick={() => setIsLedgerExpanded(!isLedgerExpanded)} style={{ width: "100%", background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}>
                                                    <span>{isLedgerExpanded ? "Hide older payments" : `View ${disbursements.length - 1} older payment(s)`}</span>{isLedgerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                                {isLedgerExpanded && (
                                                    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
                                                        {disbursements.slice(1).map((d, i) => (
                                                            <div key={i} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 0, padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.85 }}>
                                                                <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{d.monthYear}</div><div style={{ fontSize: "0.65rem", color: "var(--mlab-grey)", fontFamily: "monospace" }}>{d.bankReference}</div></div>
                                                                <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-green-dark)" }}>{formatCurrency(d.netPayment)}</div>{disbursements[0].payslipEftUrl ? (<a href={d.payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "var(--mlab-grey)" }}>Bulk Sync</span>)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ background: "var(--mlab-white)", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--mlab-grey)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Activity size={14} /> Audit & Logbook Activity</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--mlab-grey)", marginBottom: "6px", fontWeight: 600 }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> Campus Attendance Ratio</span>
                                    <span style={{ color: placement.attendancePercentage >= 80 ? "var(--mlab-green-dark)" : placement.attendancePercentage >= 50 ? "#d97706" : "var(--mlab-red)" }}>{placement.attendancePercentage}%</span>
                                </div>
                                <div style={{ width: "100%", background: "#e2e8f0", height: "8px", borderRadius: 0, overflow: "hidden" }}>
                                    <div style={{ width: `${placement.attendancePercentage}%`, background: placement.attendancePercentage >= 80 ? "var(--mlab-green)" : placement.attendancePercentage >= 50 ? "#f59e0b" : "#ef4444", height: "100%" }} />
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "var(--mlab-bg)", padding: "10px", borderRadius: 0, border: "1px solid var(--mlab-border)" }}>
                                <div><div style={{ fontSize: "0.7rem", color: "var(--mlab-green-dark)", fontWeight: 700 }}>✅ MENTOR APPROVED HOURS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#15803d" }}>{Number(placement.approvedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
                                <div><div style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 700 }}>⏳ WAITING FOR MENTOR</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#b45309" }}>{Number(placement.pendingWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
                                <div style={{ borderTop: "1px solid var(--mlab-border)", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "var(--mlab-red)", fontWeight: 700 }}>❌ REJECTED LOGS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c2410c" }}>{Number(placement.rejectedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
                                <div style={{ borderTop: "1px solid var(--mlab-border)", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "var(--mlab-grey)", fontWeight: 700 }}>📝 DRAFT (NOT SUBMITTED)</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>{Number(placement.draftWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
                            </div>
                            <button onClick={() => onOpenLogs(placement)} style={{ width: "100%", padding: "10px", background: "var(--mlab-white)", border: "1px solid var(--mlab-blue)", color: "var(--mlab-blue)", borderRadius: 0, fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={e => { e.currentTarget.style.background = "#eff6ff"; }} onMouseOut={e => { e.currentTarget.style.background = "var(--mlab-white)"; }}>
                                <FileText size={16} /> Open Complete Logbook Audit
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            {showDisbursementModal && (
                <StipendDisbursementModal placement={placement} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setShowDisbursementModal(false)} />
            )}
            
            {siteVisitTarget && (
                <LogSiteVisitModal
                    placementId={placement.id}
                    learnerId={placement.learnerId}
                    learnerName={placement.learnerName}
                    employerId={placement.employerId} 
                    employerName={companyName}       
                    mentorName={placement.mentorName}
                    trancheId={siteVisitTarget.trancheId}
                    requirementId={siteVisitTarget.req.id}
                    approvedWpHours={placement.approvedWpHours}
                    targetWpHours={1600}
                    onClose={() => setSiteVisitTarget(null)}
                    onSaved={() => {
                        toast.success("Site Visit Report Logged!");
                        setSiteVisitTarget(null);
                    }}
                />
            )}
        </div>,
        document.body
    );
};

export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
    const navigate = useNavigate();
    const { user, learners, staff, employers = [], cohorts = [], programmes = [], addStaff, fetchStaff } = useStore() as any;
    const placements = useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || [];

    const toast = useToast();

    // ── 🚀 ARCHITECTURAL TOGGLE STATES FOR HEAVY INSIGHTS ──
    const [showTaxBanner, setShowTaxBanner] = useState(false);
    const [showScorecardGrid, setShowScorecardGrid] = useState(false);
    const [showTaxGuideModal, setShowTaxGuideModal] = useState(false);

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
    const [editingPlacement, setEditingPlacement] = useState<any | null>(null);

    const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
    const [activeMentorEmpId, setActiveMentorEmpId] = useState('');

    const menuRef = useRef<HTMLDivElement>(null);
    const [bulkJobId, setBulkJobId] = useState<string | null>(null);
    const [bulkJobStatus, setBulkJobStatus] = useState<{ status: string, completedTasks: number, totalTasks: number, downloadUrl?: string | null } | null>(null);
    const [isRequestingBulk, setIsRequestingBulk] = useState(false);
    const [hasAutoDownloaded, setHasAutoDownloaded] = useState(false);

    // ── 🚀 NEW: ANALYTICS SCOPE DROPDOWN STATE ──
    const [analyticsIntakeFilter, setAnalyticsIntakeFilter] = useState<string>("all");

    // Reset scope filter when tab or search changes
    useEffect(() => {
        setAnalyticsIntakeFilter("all");
    }, [activeTab, searchQuery]);

    const companyPlacements = useMemo(() => placements.filter(p => p.employerId === company.id), [placements, company.id]);
    const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

    const placementLearnerIdsStr = useMemo(() => companyPlacements.map(p => p.learnerId).sort().join(","), [companyPlacements]);

    useEffect(() => {
        const fetchHolidays = async () => {
            try {
                const year = new Date().getFullYear();
                const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`);
                if (res.ok) setSaHolidays((await res.json()).map((h: any) => h.date));
            } catch (error) { console.error("Error fetching SA holidays:", error); }
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
                if (l && l.idNumber && String(l.idNumber).trim() !== "") relevantLearnerIds.add(String(l.idNumber).trim());
            });

            const placementStudentPool = Array.from(relevantLearnerIds).filter(Boolean);
            for (let i = 0; i < placementStudentPool.length; i += 10) {
                const studentChunk = placementStudentPool.slice(i, i + 10);
                if (studentChunk.length === 0) continue;
                const wpQueryLearner = query(collection(db, "workplace_logs"), where("learnerId", "in", studentChunk));
                const wpSnapLearner = await getDocs(wpQueryLearner);
                wpSnapLearner.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));
            }
            setWorkplaceLogs(Array.from(logsUnifiedMap.values()));

            const relevantCohortIds = new Set<string>();
            companyPlacements.forEach(p => { if (p.cohortId) relevantCohortIds.add(p.cohortId); });
            const cohortIdsArray = Array.from(relevantCohortIds);
            let fetchedAttLogs: any[] = [];
            let fetchedAttRecords: any[] = [];
            for (const cId of cohortIdsArray) {
                if (!cId) continue;
                const logsQ = query(collection(db, "attendance_logs"), where("cohortId", "==", cId));
                const recsQ = query(collection(db, "attendance_records"), where("cohortId", "==", cId));
                const [lSnap, rSnap] = await Promise.all([getDocs(logsQ), getDocs(recsQ)]);
                fetchedAttLogs.push(...lSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                fetchedAttRecords.push(...rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
        if (placementLearnerIdsStr.length > 0) fetchDeepComplianceData();
        else setIsComplianceLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [company.id, placementLearnerIdsStr]);

    const { activeCount, completedCount, droppedCount, missingContracts, nonCompliantCount } = useMemo<PlacementStats>(() => {
        let active = 0, completed = 0, dropped = 0, missing = 0, nonCompliant = 0;
        companyPlacements.forEach(p => {
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
        return companyPlacements.map(p => {
            const learner = learners.find((l: any) => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
            const placementRecord = p as PlacementContract & {
                placementType?: string;
                compliance?: { isAgreementFullyExecuted?: boolean; wblpaAgreementUrl?: string; employmentContractUrl?: string; slaUrl?: string; smeAgreementUrl?: string; dueDiligenceUrl?: string; bbbeeSpendCategory?: string; };
                bbbeeSpendCategory?: string; mentorId?: string; cohortId?: string;
            };

            const mentor = companyMentors.find((m: any) => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);
            const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string; disabilityStatus?: string; };
            const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || "Unknown";
            const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || "No Disability";

            let isEtiEligible = false, isFemale = false, isYouth = true;
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

            const approvedWpHours = learnerWpLogs.reduce((sum: number, l: any) => String(l.status || "").trim().toLowerCase() === "approved" ? sum + (Number(l.totalHours) || 0) : sum, 0);
            const pendingWpHours = learnerWpLogs.reduce((sum: number, l: any) => (String(l.status || "").trim().toLowerCase() === "pending_mentor_approval" || String(l.status || "").trim().toLowerCase() === "pending") ? sum + (Number(l.totalHours) || 0) : sum, 0);
            const rejectedWpHours = learnerWpLogs.reduce((sum: number, l: any) => String(l.status || "").trim().toLowerCase() === "rejected" ? sum + (Number(l.totalHours) || 0) : sum, 0);
            const draftWpHours = learnerWpLogs.reduce((sum: number, l: any) => (String(l.status || "").trim().toLowerCase() === "draft" || String(l.status || "").trim().toLowerCase() === "") ? sum + (Number(l.totalHours) || 0) : sum, 0);

            const currentYear = moment().year();
            const currentMonth = moment().month();
            const currentMonthStr = moment().format('YYYY-MM');
            const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, saHolidays);
            const currentMonthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr));
            const approvedDatesThisMonth = new Set(currentMonthWpLogs.filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved").map((l: any) => l.dateString));
            const currentMonthApprovedDays = approvedDatesThisMonth.size;

            let currentMonthEarnedStipend = wage;
            if (expectedWorkingDaysThisMonth > 0 && wage > 0) {
                const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * wage;
                currentMonthEarnedStipend = Math.round(Math.min(calculatedProRata, wage) * 100) / 100;
            }

            let idUrl = learner.documents?.idDocument || learner.idUrl || learner.idDocumentUrl || "";
            let wblpaUrl = placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl || "";
            let empContractUrl = placementRecord.compliance?.employmentContractUrl || "";
            let slaUrl = placementRecord.compliance?.slaUrl || "";
            let qualUrl = learner.documents?.qualification || "";
            let affidavitUrl = learner.documents?.affidavit || "";
            let smeAgreUrl = placementRecord.compliance?.smeAgreementUrl || "";
            let dueDilUrl = placementRecord.compliance?.dueDiligenceUrl || "";
            let bankUrl = learner.documents?.bankLetter || "";

            const learnerUserDoc = (useStore.getState() as any).users?.find((u: any) => u.id === learner.authUid) || {};
            const arraysToScan = [...(learner.uploadedDocuments || []), ...((p as any).uploadedDocuments || []), ...(learnerUserDoc?.uploadedDocuments || [])];
            arraysToScan.forEach((doc: any) => {
                const docId = String(doc.id || "").toLowerCase();
                const name = String(doc.name || "").toLowerCase();
                if (!idUrl && (docId === "id" || name.includes("id") || name.includes("identity") || name.includes("passport"))) idUrl = doc.url;
                if (!wblpaUrl && (docId === "wblpa" || docId === "contract" || name.includes("contract") || name.includes("wblpa") || name.includes("agreement"))) wblpaUrl = doc.url;
                if (!empContractUrl && (docId === "emp_contract" || name.includes("employment"))) empContractUrl = doc.url;
                if (!slaUrl && (docId === "sla" || name.includes("sla"))) slaUrl = doc.url;
                if (!qualUrl && (docId === "qualification" || name.includes("qualification") || name.includes("certificate"))) qualUrl = doc.url;
                if (!affidavitUrl && (docId === "affidavit" || name.includes("affidavit"))) affidavitUrl = doc.url;
                if (!smeAgreUrl && (docId === "sme_agreement" || name.includes("host") || name.includes("sme"))) smeAgreUrl = doc.url;
                if (!dueDilUrl && (docId === "due_diligence" || name.includes("diligence"))) dueDilUrl = doc.url;
                if (!bankUrl && (docId === "bank" || name.includes("bank"))) bankUrl = doc.url;
            });

            const hasMentorAssigned = !!(p.assignedMentorName || placementRecord.mentorId || mentor.id);
            const complianceItems: EnrichedPlacement["complianceItems"] = [
                { key: 'idDoc', label: 'Certified ID Document', isComplete: !!idUrl, isRequired: true, url: idUrl, actionType: 'upload', dbTarget: 'learner' },
                { key: 'wblpa', label: 'WBLPA Contract', isComplete: !!wblpaUrl, isRequired: true, url: wblpaUrl, actionType: 'upload', dbTarget: 'placement' },
                { key: 'empContract', label: 'Employment Contract', isComplete: !!empContractUrl, isRequired: true, url: empContractUrl, actionType: 'upload', dbTarget: 'placement' },
                { key: 'mentor', label: 'Workplace Mentor Assigned', isComplete: hasMentorAssigned, isRequired: true, actionType: 'assign', dbTarget: 'placement' },
                { key: 'sla', label: 'Service Level Agreement (SLA)', isComplete: !!slaUrl, isRequired: false, url: slaUrl, actionType: 'upload', dbTarget: 'placement' },
                { key: 'qualification', label: 'Highest Qualification', isComplete: !!qualUrl, isRequired: false, url: qualUrl, actionType: 'upload', dbTarget: 'learner' },
                { key: 'affidavit', label: 'Sworn Affidavit', isComplete: !!affidavitUrl, isRequired: false, url: affidavitUrl, actionType: 'upload', dbTarget: 'learner' },
                { key: 'smeAgreement', label: 'Host Company Agreement', isComplete: !!smeAgreUrl, isRequired: false, url: smeAgreUrl, actionType: 'upload', dbTarget: 'placement' },
                { key: 'dueDiligence', label: 'SME Due Diligence Report', isComplete: !!dueDilUrl, isRequired: false, url: dueDilUrl, actionType: 'upload', dbTarget: 'placement' },
                { key: 'bankLetter', label: 'Bank Confirmation Letter', isComplete: !!bankUrl, isRequired: false, url: bankUrl, actionType: 'upload', dbTarget: 'learner' }
            ];

            const requiredItems = complianceItems.filter(i => i.isRequired);
            const completedRequiredCount = requiredItems.filter(i => i.isComplete).length;
            const complianceScore = Math.round((completedRequiredCount / requiredItems.length) * 100);

         return {
                ...p,
                placementType: placementRecord.placementType || "QCTO Workplace Module",
                bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || "Uncategorized",
                compliance: {
                    isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === "boolean" ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
                    wblpaAgreementUrl: wblpaUrl, employmentContractUrl: empContractUrl, slaUrl: slaUrl, smeAgreementUrl: smeAgreUrl, dueDiligenceUrl: dueDilUrl
                },
                complianceScore,
                complianceItems,
                
                employerName: company.name, 

                learnerName: learner.fullName || "Unknown Learner",
                idNumber: learner.idNumber || "—",
                equityGroup: equity,
                isFemale,
                isYouth,
                hasDisability,
                mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
                hasMentor: hasMentorAssigned,
                isEtiEligible,
                etiMonthlyValue,
                complianceSchema: placementRecord.complianceSchema,
                evidenceMap: placementRecord.evidenceMap,
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
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs, saHolidays, company.name]);

    const displayedPlacements = useMemo(() => {
        return enrichedPlacements.filter(p => {
            const sLower = p.status.toLowerCase();
            if (activeTab === "action_required" && p.complianceScore === 100) return false;
            if (activeTab === "active" && !sLower.includes("active") && !sLower.includes("pending") && !sLower.includes("interview")) return false;
            if (activeTab === "history" && !sLower.includes("complete") && !sLower.includes("terminate") && !sLower.includes("absorb")) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
            }
            return true;
        });
    }, [enrichedPlacements, activeTab, searchQuery]);

    const groupedPlacements = useMemo(() => {
        const groups: Record<string, EnrichedPlacement[]> = {};
        displayedPlacements.forEach(p => {
            const schemaName = p.complianceSchema?.schemaName || p.placementType || "Uncategorized Placement";
            const intake = p.startDate ? moment(p.startDate).format("MMMM YYYY") : "Unknown Intake";
            const key = `${schemaName} - Intake: ${intake}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        return groups;
    }, [displayedPlacements]);

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const toggleGroup = (key: string) => setExpandedGroups(prev => ({ ...prev, [key]: prev[key] === undefined ? false : !prev[key] }));
    const isGroupExpanded = (key: string) => expandedGroups[key] !== false;

    // ─── 🚀 ANALYTICS SCOPE ENGINE (Filters Scorecard & Tax Banner) ───
    const analyticsPlacements = useMemo(() => {
        if (analyticsIntakeFilter === "all") return displayedPlacements;
        return displayedPlacements.filter(p => {
            const schemaName = p.complianceSchema?.schemaName || p.placementType || "Uncategorized Placement";
            const intake = p.startDate ? moment(p.startDate).format("MMMM YYYY") : "Unknown Intake";
            const key = `${schemaName} - Intake: ${intake}`;
            return key === analyticsIntakeFilter;
        });
    }, [displayedPlacements, analyticsIntakeFilter]);

    const cohortTranches = useMemo(() => {
        const groups: Record<string, { key: string, title: string, intake: string, schema: ComplianceSchema, placements: EnrichedPlacement[], tranchesProgress: any[] }> = {};

        displayedPlacements.forEach(p => {
            const statusLower = p.status.toLowerCase();
            const isLive = statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview");
            if (!isLive || !p.complianceSchema || !p.complianceSchema.tranches) return;

            const schemaName = p.complianceSchema.schemaName || p.placementType || "Unnamed Protocol";
            const intakeStr = p.startDate ? moment(p.startDate).format("MMMM YYYY") : "Unknown Intake";
            const groupKey = `${schemaName}_${intakeStr}`;

            if (!groups[groupKey]) {
                groups[groupKey] = {
                    key: groupKey,
                    title: schemaName,
                    intake: intakeStr,
                    schema: p.complianceSchema,
                    placements: [],
                    tranchesProgress: []
                };
            }
            groups[groupKey].placements.push(p);
        });

        Object.values(groups).forEach(group => {
            const totalLearners = group.placements.length;
            group.tranchesProgress = group.schema.tranches.map(tranche => {
                let completedCount = 0;
                group.placements.forEach(ep => {
                    const em = ep.evidenceMap || {};
                    const isComplete = tranche.requirements.every((req: any) => {
                        if (!req.required) return true;
                        return !!em[`${tranche.trancheId}_${req.id}`];
                    });
                    if (isComplete) completedCount++;
                });

                return {
                    ...tranche,
                    completedCount,
                    totalLearners,
                    isReady: completedCount === totalLearners && totalLearners > 0
                };
            });
        });

        return Object.values(groups).sort((a, b) => new Date(b.placements[0]?.createdAt).getTime() - new Date(a.placements[0]?.createdAt).getTime());
    }, [displayedPlacements]);

    const complianceMetrics = useMemo<ComplianceMetricsData>(() => {
        let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
        let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
        let totalFemale = 0, totalMale = 0, absorbedFemale = 0, absorbedMale = 0;
        let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
        let mentorLoad: Record<string, number> = {};
        
        let localActiveCount = 0;
        let localCompletedCount = 0;

        analyticsPlacements.forEach(p => {
            const statusLower = p.status.toLowerCase();
            const isLive = statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview");
            const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes("absorb") || (p as any).isAbsorbed;

            if (isLive) localActiveCount++;
            if (statusLower.includes("complete") || isAbsorbed) localCompletedCount++;

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
        const baseLength = analyticsPlacements.length;

        return {
            transformationPercentage: baseLength > 0 ? Math.round((blackACI / baseLength) * 100) : 0,
            disabilityPercentage: baseLength > 0 ? Math.round((disabilityCount / baseLength) * 100) : 0,
            disabilityCount,
            youthPercentage: baseLength > 0 ? Math.round((youthCount / baseLength) * 100) : 0,
            youthCount,
            etiYieldPercentage: localActiveCount > 0 ? Math.round((activeEtiYielders / localActiveCount) * 100) : 0,
            monthlyETITotal: monthlyEtiSum,
            annualizedETIEstimate: monthlyEtiSum * 12,
            absorptionRate: localCompletedCount > 0 ? Math.round(((absorbedFemale + absorbedMale) / localCompletedCount) * 100) : 0,
            totalProjectedSpend: accumulatedSpend,
            totalS12hProjected,
            totalFemale,
            totalMale,
            absorbedFemale,
            absorbedMale,
            raceCounts,
            overloadedMentors,
        };
    }, [analyticsPlacements]);

    const formatCurrency = (val?: number | string | null) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
    const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

    const handleExportExcel = () => {
        const data = displayedPlacements.map(p => ({
            "Learner Name": p.learnerName, "ID Number": p.idNumber, "Race (EE Code)": p.equityGroup,
            Gender: p.isFemale ? "Female" : "Male", "Placement Type": p.placementType,
            "Monthly Stipend": Number(p.stipendAmount || 0).toFixed(2),
            "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${Number(p.etiMonthlyValue).toFixed(2)}/mo)` : "No",
            "Compliance Score": `${p.complianceScore}%`,
            "Start Date": p.startDate ? moment(p.startDate).format("YYYY-MM-DD") : "—",
            "Expected End Date": p.endDate ? moment(p.endDate).format("YYYY-MM-DD") : "—",
            "Assigned Mentor": p.mentorName, "Operational Status": p.status.toUpperCase(),
        }));
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
        XLSX.writeFile(workbook, `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.xlsx`);
        setShowExportMenu(false);
    };

    const handleExportCSV = () => {
        const data = displayedPlacements.map(p => ({
            "Learner Name": p.learnerName, "ID Number": p.idNumber, "Placement Type": p.placementType,
            "Compliance Score": `${p.complianceScore}%`, "Operational Status": p.status.toUpperCase(),
        }));
        if (data.length === 0) return;
        const headers = Object.keys(data[0]);
        const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(","));
        const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportMenu(false);
    };

    const handleTriggerBulkExport = async () => {
        if (displayedPlacements.length === 0) return;
        setIsRequestingBulk(true);
        setShowExportMenu(false);
        try {
            const fns = getFunctions();
            const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");
            const payloadPlacements = displayedPlacements.map(p => ({ learnerId: p.learnerId, placementId: p.id, learnerName: p.learnerName, idNumber: p.idNumber, mentorName: p.mentorName }));
            const response = await requestBulkAuditPacks({ companyId: company.id, companyName: company.name, placements: payloadPlacements });
            const data = response.data as { success: boolean, jobId: string };
            if (data.success && data.jobId) setBulkJobId(data.jobId);
        } catch (error) {
            console.error("Failed to start bulk export:", error);
            toast.error("Failed to start bulk export process. Check console for details.");
        } finally {
            setIsRequestingBulk(false);
        }
    };

    const handleTriggerTrancheClaim = async (group: any, tranche: any) => {
        if (!tranche.isReady) {
            toast.error("Cannot claim until all active learners have completed the requirements.");
            return;
        }
        setIsRequestingBulk(true);
        try {
            const fns = getFunctions();
            const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");
            const payloadPlacements = group.placements.map((p: any) => ({
                learnerId: p.learnerId, placementId: p.id, learnerName: p.learnerName, idNumber: p.idNumber, mentorName: p.mentorName
            }));

            const response = await requestBulkAuditPacks({
                companyId: company.id,
                companyName: company.name,
                placements: payloadPlacements,
                trancheFilter: {
                    schemaId: group.schema.schemaId,
                    trancheId: tranche.trancheId,
                    trancheTitle: tranche.title
                }
            });
            const data = response.data as { success: boolean, jobId: string };
            if (data.success && data.jobId) {
                setBulkJobId(data.jobId);
                toast.success("Master Tranche Claim compilation started!");
            }
        } catch (error) {
            console.error("Bulk Tranche Claim failed:", error);
            toast.error("Failed to start Master Tranche Claim process.");
        } finally {
            setIsRequestingBulk(false);
        }
    };

    const handleTriggerFullCohortClaim = async (group: any) => {
        setIsRequestingBulk(true);
        try {
            const fns = getFunctions();
            const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");
            const payloadPlacements = group.placements.map((p: any) => ({
                learnerId: p.learnerId, placementId: p.id, learnerName: p.learnerName, idNumber: p.idNumber, mentorName: p.mentorName
            }));

            const response = await requestBulkAuditPacks({
                companyId: company.id,
                companyName: company.name,
                placements: payloadPlacements
            });
            const data = response.data as { success: boolean, jobId: string };
            if (data.success && data.jobId) {
                setBulkJobId(data.jobId);
                toast.success("Complete Cohort Portfolio compilation started!");
            }
        } catch (error) {
            console.error("Bulk Complete Claim failed:", error);
            toast.error("Failed to start Complete Cohort Claim process.");
        } finally {
            setIsRequestingBulk(false);
        }
    };

    useEffect(() => {
        if (!bulkJobId) return;
        const unsubscribe = onSnapshot(doc(db, "compliance_jobs", bulkJobId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as any;
                setBulkJobStatus({ status: data.status, completedTasks: data.completedTasks || 0, totalTasks: data.totalTasks || 0, downloadUrl: data.downloadUrl || null });
                if (data.status === "complete" && data.downloadUrl && !hasAutoDownloaded) {
                    setHasAutoDownloaded(true);
                    const link = document.createElement("a");
                    link.href = data.downloadUrl;
                    link.target = "_blank";
                    link.download = "Audit_Pack.zip";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }
        });
        return () => unsubscribe();
    }, [bulkJobId, hasAutoDownloaded]);

    const totalTaxPotential = useMemo(() => {
        const activePlacements = analyticsPlacements.filter(p => {
            const s = p.status.toLowerCase();
            return s.includes("active") || s.includes("pending") || s.includes("interview");
        });
        const eligibleEtiLearners = activePlacements.filter(p => p.isEtiEligible && (Number(p.stipendAmount) || 0) > 0);
        const monthlyEti = eligibleEtiLearners.reduce((sum, p) => sum + (p.etiMonthlyValue || 0), 0);
        const annualEti = monthlyEti * 12;
        const totalS12h = analyticsPlacements.reduce((sum, p) => sum + (p.s12hAllowanceTotal || 0), 0);
        return annualEti + totalS12h;
    }, [analyticsPlacements]);

    return (
        <div className="cdp-layout">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {showTaxGuideModal && <TaxAdvisoryModal companyName={company.name} onClose={() => setShowTaxGuideModal(false)} />}
            
            {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
            {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}
            {drawerPlacement && (
                <PlacementDetailsDrawer placement={drawerPlacement} companyName={company.name} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setDrawerPlacement(null)} onOpenEti={setEtiBreakdownLearner} onOpenLogs={setAuditLearner} onEditPlacement={p => setEditingPlacement(p)} />
            )}
{/* 🚀 FIXED: Correct prop bindings for PlacementMasterModal */}
            {editingPlacement && (
                <PlacementMasterModal
                    editPlacement={editingPlacement}
                    employers={employers.length > 0 ? employers : [company]}
                    mentors={companyMentors}
                    learners={learners}
                    placements={placements}
                    cohorts={cohorts}
                    programmes={programmes}
                    onClose={() => setEditingPlacement(null)}
                    onSaved={() => fetchDeepComplianceData()}
                    onAddNewMentor={(empId) => {
                        setActiveMentorEmpId(empId);
                        setIsMentorModalOpen(true);
                    }}
                />
            )}

            {isMentorModalOpen && (
            <MentorModal
    employerId={activeMentorEmpId}
    editing={null} 
    onClose={() => setIsMentorModalOpen(false)}
    onSaved={async () => { if (fetchStaff) await fetchStaff(true); }}
    addStaff={addStaff}
/>
            )}
            <main className="cdp-main">
                
                <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)', padding: '1rem 1.5rem' }}>
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={onBack} style={{ borderRadius: 0 }}>
                            <ChevronLeft size={14} /> Back to Partners
                        </button>
                        <div className="cdp-header__eyebrow"><Briefcase size={12} /> Host Company Profile</div>
                        <h1 className="cdp-header__title">{company.name}</h1>
                        <p className="cdp-header__sub">
                            <MapPin size={12} className="cdp-header__sub-icon" /> {company.physicalAddress || "Address not on file"}
                            <span className="cdp-header__status cdp-header__status--active" style={{ borderRadius: 0 }}>{activeCount} Active Interns</span>
                        </p>
                    </div>

                    <div className="cdp-header__right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        
                        {totalTaxPotential > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowTaxBanner(!showTaxBanner)}
                                style={{
                                    background: showTaxBanner ? "var(--mlab-green)" : "rgba(148, 199, 61, 0.15)",
                                    color: showTaxBanner ? "var(--mlab-white)" : "var(--mlab-green)",
                                    border: "1px solid var(--mlab-green)",
                                    padding: "6px 12px",
                                    fontSize: "0.75rem",
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px"
                                }}
                                title="Click to toggle SARS Tax Rebate Engine"
                            >
                                <Coins size={14} />
                                {formatCurrency(totalTaxPotential)} Tax Savings
                                {showTaxBanner ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowScorecardGrid(!showScorecardGrid)}
                            style={{
                                background: showScorecardGrid ? "var(--mlab-blue)" : "white",
                                color: showScorecardGrid ? "white" : "var(--mlab-blue)",
                                border: "1px solid var(--mlab-blue)",
                                padding: "6px 12px",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}
                            title="Click to toggle Strategic Scorecard & Demographics"
                        >
                            <BarChart3 size={14} />
                            Scorecard Analytics
                            {showScorecardGrid ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        <button className="cdp-btn cdp-btn--outline" style={{ borderRadius: 0, padding: "6px 12px", fontSize: "0.75rem" }} onClick={fetchDeepComplianceData} disabled={isComplianceLoading}>
                            <RefreshCw size={13} className={isComplianceLoading ? 'spin' : ''} /> Sync
                        </button>
                    </div>
                </header>

                <div className="cdp-content">
                    
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

                    {(showTaxBanner || showScorecardGrid) && (
                        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '8px 16px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)' }}>
                                <Filter size={14} color="var(--mlab-grey)" />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Analytics Scope:</span>
                                <select 
                                    style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 800, cursor: 'pointer', maxWidth: '400px', textOverflow: 'ellipsis' }}
                                    value={analyticsIntakeFilter}
                                    onChange={(e) => setAnalyticsIntakeFilter(e.target.value)}
                                >
                                    <option value="all">Total Combined View ({displayedPlacements.length} Learners)</option>
                                    {Object.entries(groupedPlacements).map(([key, group]) => (
                                        <option key={key} value={key}>{key} ({group.length} Learners)</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {showTaxBanner && (
                        <div className="animate-fade-in">
                            <UnclaimedEtiBanner
                                placements={analyticsPlacements}
                                companyName={company.name}
                                isSarsCompliant={(company as any).isSarsCompliant ?? false}
                                isClaimingEti={(company as any).isClaimingEti ?? false}
                                onFixComplianceClick={() => setShowTaxGuideModal(true)}
                            />
                        </div>
                    )}

                    {showScorecardGrid && (
                        <div className="animate-fade-in" style={{ marginBottom: "1.5rem" }}>
                            <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />
                        </div>
                    )}

                    {cohortTranches.length > 0 && (
                        <div className="cdp-panel animate-fade-in" style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
                            <div style={{ background: "white", borderRadius: "0", border: "1px solid var(--mlab-border)" }}>
                                <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--mlab-border)", display: "flex", flexDirection: "column", gap: "8px", background: "#f8fafc" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <Wallet size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--mlab-midnight)", fontWeight: 800, textTransform: "uppercase" }}>Master Tranche Console</h3>
                                    </div>
                                    <p style={{ margin: "4px 0 0 26px", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.4, maxWidth: "800px" }}>
                                        <strong>Automated bulk claim compiler.</strong> This console dynamically groups learners by their exact programme and intake date to ensure specific placement cycles are isolated. When all active learners in a specific intake complete their required evidence for a tranche, the system unlocks the ability to generate a consolidated, SETA-ready ZIP file.
                                    </p>
                                </div>

                                <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                    {cohortTranches.map((group, idx) => (
                                        <div key={idx} style={{ border: "1px solid #e2e8f0", borderRadius: "0" }}>
                                            <div style={{ background: "#f1f5f9", padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: "0.9rem", color: "var(--mlab-midnight)", fontWeight: 800 }}>{group.title}</h4>
                                                    <div style={{ fontSize: "0.75rem", color: "var(--mlab-blue)", marginTop: "4px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                                                        <Calendar size={12} /> Intake: {group.intake}
                                                    </div>
                                                </div>
                                                
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--mlab-blue)", background: "#e0f2fe", padding: "4px 10px", borderRadius: "12px" }}>
                                                        {group.placements.length} Learners in Intake
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleTriggerFullCohortClaim(group)}
                                                        disabled={isRequestingBulk}
                                                        style={{
                                                            background: "white", border: "1px solid #cbd5e1", color: "var(--mlab-midnight)",
                                                            fontSize: "0.75rem", fontWeight: 600, padding: "6px 12px", borderRadius: "4px",
                                                            cursor: isRequestingBulk ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px",
                                                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                                                        }}
                                                    >
                                                        {isRequestingBulk ? <Loader2 size={14} className="wm-spin" /> : <Archive size={14} color="var(--mlab-blue)" />}
                                                        Export Full Portfolio (All Tranches)
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", padding: "15px" }}>
                                                {group.tranchesProgress.map((tranche: any, tIdx: number) => {
                                                    const pendingLearners = tranche.totalLearners - tranche.completedCount;
                                                    return (
                                                        <div key={tIdx} style={{ background: tranche.isReady ? "#f0fdf4" : "white", border: `1px solid ${tranche.isReady ? "#bbf7d0" : "#e2e8f0"}`, padding: "12px", borderRadius: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                                <div>
                                                                    <div style={{ fontSize: "0.7rem", color: tranche.isReady ? "#166534" : "#64748b", fontWeight: 800, marginBottom: "2px" }}>TRANCHE {tIdx + 1}</div>
                                                                    <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 600 }}>{tranche.title}</div>
                                                                </div>
                                                                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: tranche.isReady ? "#16a34a" : "var(--mlab-amber)" }}>
                                                                    {tranche.completedCount}<span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>/{tranche.totalLearners}</span>
                                                                </div>
                                                            </div>

                                                            <div style={{ width: "100%", background: tranche.isReady ? "#bbf7d0" : "#f1f5f9", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
                                                                <div style={{ width: `${(tranche.completedCount / tranche.totalLearners) * 100}%`, background: tranche.isReady ? "#16a34a" : "var(--mlab-amber)", height: "100%", transition: "width 0.3s ease-out" }} />
                                                            </div>

                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleTriggerTrancheClaim(group, tranche)}
                                                                    disabled={!tranche.isReady || isRequestingBulk}
                                                                    style={{
                                                                        width: "100%", padding: "8px", border: "none", borderRadius: "0", cursor: tranche.isReady && !isRequestingBulk ? "pointer" : "not-allowed",
                                                                        background: tranche.isReady ? "var(--mlab-green)" : "#f1f5f9", color: tranche.isReady ? "white" : "#64748b", fontWeight: 700, fontSize: "0.75rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s"
                                                                    }}
                                                                >
                                                                    {isRequestingBulk ? <Loader2 size={12} className="wm-spin" /> : tranche.isReady ? <DownloadCloud size={12} /> : <AlertTriangle size={12} />}
                                                                    {tranche.isReady ? "Generate Master Claim (.zip)" : `Waiting on ${pendingLearners} Learner(s)`}
                                                                </button>
                                                                
                                                                {!tranche.isReady && (
                                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                        <Info size={10} /> Requires all {tranche.totalLearners} learners to upload evidence.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
                        <button className={`lfm-tab ${activeTab === "active" ? "active" : ""}`} onClick={() => setActiveTab("active")}>
                            <Users size={16} /> Active Interns <span className="lfm-tab__badge">{activeCount}</span>
                        </button>
                        <button className={`lfm-tab ${activeTab === "action_required" ? "active" : ""}`} onClick={() => setActiveTab("action_required")}>
                            <AlertTriangle size={16} /> Action Required <span className="lfm-tab__badge" style={{ background: activeTab === "action_required" ? '#fee2e2' : 'var(--mlab-bg)', color: activeTab === "action_required" ? 'var(--mlab-red)' : 'var(--mlab-grey)' }}>{nonCompliantCount}</span>
                        </button>
                        <button className={`lfm-tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>
                            <History size={16} /> History <span className="lfm-tab__badge">{completedCount + droppedCount}</span>
                        </button>
                        <button className={`lfm-tab ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
                            <Briefcase size={16} /> All Records <span className="lfm-tab__badge">{enrichedPlacements.length}</span>
                        </button>
                    </div>

                    <div style={{ border: '1px solid var(--mlab-border)', background: 'var(--mlab-white)', borderRadius: 0 }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><Users size={16} /> Placement Ledger</h2>
                            <BulkStipendUploader placements={displayedPlacements} saHolidays={saHolidays} onSuccess={() => { fetchDeepComplianceData(); }} />
                        </div>

                        {bulkJobStatus && (
                            <div style={{ margin: "1rem 1.5rem 0", background: "#f0f9ff", border: "1px solid #bae6fd", marginBottom: 16, borderRadius: 0, padding: "16px", display: "flex", flexDirection: "column", gap: "8px", position: "relative" }} className="animate-fade-in">
                                <button onClick={() => { setBulkJobId(null); setBulkJobStatus(null); setHasAutoDownloaded(false); }} style={{ position: "absolute", top: "0px", right: "0px", background: "none", border: "none", cursor: "pointer", color: "var(--mlab-grey)" }}><X size={16} /></button>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: "24px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--mlab-blue)", fontWeight: 700, fontSize: "0.85rem" }}>
                                        {bulkJobStatus.status === "processing" || bulkJobStatus.status === "zipping" ? <Loader2 size={16} className="wm-spin" /> : <Archive size={16} color="#16a34a" />}
                                        {bulkJobStatus.status === "processing" ? "Compiling Bulk Audit Packs..." : bulkJobStatus.status === "zipping" ? "Merging Cloud Stream..." : bulkJobStatus.status === "failed" ? "Job Failed" : "Download Ready!"}
                                    </div>
                                    <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>{bulkJobStatus.completedTasks} / {bulkJobStatus.totalTasks} Processed</div>
                                </div>
                                <div style={{ width: "100%", background: "#e0f2fe", height: "10px", borderRadius: 0, overflow: "hidden" }}>
                                    <div style={{ width: `${bulkJobStatus.totalTasks > 0 ? (bulkJobStatus.completedTasks / bulkJobStatus.totalTasks) * 100 : 0}%`, background: bulkJobStatus.status === "complete" ? "#16a34a" : bulkJobStatus.status === "failed" ? "#dc2626" : "var(--mlab-blue)", height: "100%", transition: "width 0.3s ease-out" }} />
                                </div>
                                {bulkJobStatus.status === "complete" && (
                                    bulkJobStatus.downloadUrl ? (
                                        <a href={bulkJobStatus.downloadUrl} target="_blank" rel="noreferrer" style={{ background: "#16a34a", color: "white", padding: "8px", borderRadius: 0, textDecoration: "none", fontSize: "0.8rem", fontWeight: 700, textAlign: "center", marginTop: "8px", display: "inline-block" }}>Click here to download the ZIP file</a>
                                    ) : (
                                        <div style={{ color: "#d97706", fontSize: "0.8rem", fontWeight: 600, marginTop: "8px", textAlign: "center" }}>Waiting for secure download link from server...</div>
                                    )
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
                                <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input type="text" className="lfm-input" placeholder="Search ledger..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '36px', borderRadius: 0 }} />
                            </div>
                            <div style={{ position: 'relative' }} ref={menuRef}>
                                <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={displayedPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: 'var(--mlab-white)', fontSize: '0.8rem', padding: '6px 12px', borderRadius: 0, opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? "not-allowed" : "pointer" }}>
                                    <DownloadCloud size={14} /> Export
                                </button>
                                {showExportMenu && displayedPlacements.length > 0 && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '220px', overflow: 'hidden' }} className="animate-fade-in">
                                        <button type="button" onClick={handleExportCSV} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--mlab-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download Data as CSV</button>
                                        <button type="button" onClick={handleExportExcel} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--mlab-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download Data as Excel</button>
                                        <button type="button" onClick={handleTriggerBulkExport} disabled={isRequestingBulk || !!bulkJobId} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'var(--mlab-bg)', border: 'none', cursor: (isRequestingBulk || !!bulkJobId) ? "not-allowed" : "pointer", display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 600, opacity: (isRequestingBulk || !!bulkJobId) ? 0.5 : 1 }}>
                                            <Archive size={14} color="#073f4e" /> {isRequestingBulk ? "Starting Job..." : "Generate Bulk SETA Pack (.zip)"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="lfm-body" style={{ padding: 0 }}>
                            <div className="mlab-table-wrap">
                                {isComplianceLoading && <div style={{ padding: "1rem", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} className="wm-spin" /> Verifying deep compliance logs...</div>}
                                <table className="mlab-table" style={{ margin: 0 }}>
                                    <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                        <tr>
                                            <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Learner Profile</th>
                                            <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Placement Scope</th>
                                            <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Assigned Mentor</th>
                                            <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Status</th>
                                            <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Compliance Progress</th>
                                            <th style={{ textAlign: 'right', color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayedPlacements.length > 0 ? (
                                            Object.entries(groupedPlacements).map(([groupName, groupPlacements]) => (
                                                <React.Fragment key={groupName}>
                                                    {/* 🚀 ACCORDION HEADER FOR SPECIFIC PLACEMENT INTAKE */}
                                                    <tr style={{ cursor: "pointer", background: "#f8fafc", borderTop: "3px solid #e2e8f0" }} onClick={() => toggleGroup(groupName)}>
                                                        <td colSpan={6} style={{ padding: "12px 16px" }}>
                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--mlab-midnight)", fontSize: "0.85rem" }}>
                                                                    {isGroupExpanded(groupName) ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
                                                                    {groupName} 
                                                                    <span style={{ background: "#e0e7ff", color: "var(--mlab-blue)", padding: "2px 8px", borderRadius: "12px", fontSize: "0.7rem", marginLeft: "8px" }}>
                                                                        {groupPlacements.length} Learner(s)
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {/* 🚀 PLACEMENT ROWS (COLLAPSIBLE) */}
                                                    {isGroupExpanded(groupName) && groupPlacements.map(p => (
                                                        <tr key={p.id}>
                                                            <td style={{ paddingLeft: '24px' }}>
                                                                <div className="cdp-learner-cell">
                                                                    <div className="cdp-learner-avatar" style={{ borderRadius: 0, background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)' }}>{p.learnerName.charAt(0)}</div>
                                                                    <div className="cdp-learner-cell__info">
                                                                        <span className="cdp-learner-cell__name" style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>{p.learnerName}</span>
                                                                        <span className="cdp-learner-cell__id" style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{p.idNumber}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 500 }}>{formatDate(p.startDate)} <span style={{ color: "var(--mlab-grey)", margin: "0 4px" }}>→</span> {formatDate(p.endDate)}</div>
                                                                <div style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", marginTop: "2px" }}>{p.placementType}</div>
                                                            </td>
                                                            <td>
                                                                <div style={{ fontSize: "0.8rem", color: p.hasMentor ? "var(--mlab-midnight)" : "var(--mlab-red)", fontWeight: p.hasMentor ? 500 : 700, display: "flex", alignItems: "center", gap: "4px" }}>
                                                                    {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> Unassigned</>}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span className={`cdp-status-badge ${p.status.toLowerCase().includes("active") ? "cdp-status-badge--active" : p.status.toLowerCase().includes("terminate") ? "cdp-status-badge--dropped" : ""}`} style={p.status.toLowerCase().includes("pending") ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a", borderRadius: 0 } : p.status.toLowerCase().includes("complete") || p.status.toLowerCase().includes("absorb") ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 0 } : { borderRadius: 0 }}>
                                                                    {p.status.replace("_", " ")}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: p.complianceScore === 100 ? '#16a34a' : '#d97706' }}>{p.complianceScore}%</span>
                                                                    <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>{p.complianceScore === 100 ? 'Audit Ready' : 'Incomplete'}</span>
                                                                </div>
                                                                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: 0, overflow: 'hidden' }}>
                                                                    <div style={{ height: '100%', width: `${p.complianceScore}%`, background: p.complianceScore === 100 ? '#16a34a' : '#f59e0b', transition: 'width 0.3s ease-out' }} />
                                                                </div>
                                                            </td>
                                                            <td style={{ textAlign: "right" }}>
                                                                <button type="button" onClick={() => setDrawerPlacement(p)} className="lfm-btn lfm-btn--ghost" style={{ borderRadius: 0, padding: '6px 12px', fontSize: '0.7rem' }}>
                                                                    Review <ChevronRight size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </React.Fragment>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                    <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                    <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No placement records match your current filters.</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};


// import React, { useMemo, useState, useRef, useEffect } from "react";
// import { createPortal } from "react-dom";
// import { collection, query, where, getDocs, doc, onSnapshot, updateDoc, writeBatch } from "firebase/firestore";
// import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
// import { db, storage } from "../../../../lib/firebase";
// import {
//     MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
//     ShieldCheck, ChevronRight, Activity, RefreshCw, UploadCloud, ChevronDown, ChevronUp, Archive,
//     CheckSquare, Square, Edit, Link as LinkIcon, Save, ChevronLeft, History
// } from "lucide-react";
// import moment from "moment";
// import * as XLSX from "xlsx";

// // Modularized components
// import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
// import { LogbookAuditModal } from "./LogbookAuditModal";
// import { StipendDisbursementModal } from "./StipendDisbursementModal";
// import { BulkStipendUploader } from "./BulkStipendUploader";

// import type { ComplianceSchema, DashboardLearner, Employer, PlacementContract } from "../../../../types";
// import { useStore, type StaffMember } from "../../../../store/useStore";
// import { getFunctions, httpsCallable } from "firebase/functions";
// import { EvidenceExportModal } from "../../PlacementsDashboard/EvidenceExportModal";
// import { Sidebar } from "../../../dashboard/Sidebar/Sidebar";
// import { useNavigate } from "react-router-dom";
// import { ToastContainer, useToast } from "../../../common/Toast/Toast";
// import type { UploadedEvidence } from "../../PlacementsDashboard/PlacementsDashboard";

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
//         employmentContractUrl?: string;
//         slaUrl?: string;
//         smeAgreementUrl?: string;
//         dueDiligenceUrl?: string;
//     };
//     complianceScore: number;
//     complianceItems: {
//         key: string;
//         label: string;
//         isComplete: boolean;
//         isRequired: boolean;
//         url?: string;
//         actionType: 'upload' | 'assign' | 'none';
//         dbTarget: 'learner' | 'placement';
//     }[];
//     learnerName: string;
//     idNumber: string;
//     equityGroup: string;
//     hasDisability: boolean;
//     isFemale: boolean;
//     isYouth: boolean;
//     employerName: string;
//     mentorName: string;
//     hasMentor: boolean;
//     isEtiEligible: boolean;
//     etiMonthlyValue: number;
//     projectedStipendSpend: number;
//     s12hAllowanceTotal: number;
//     attendancePercentage: number;
//     approvedWpHours: number;
//     pendingWpHours: number;
//     draftWpHours: number;
//     rejectedWpHours: number;
//     currentMonthApprovedDays: number;
//     expectedWorkingDaysThisMonth: number;
//     currentMonthEarnedStipend: number;
//     complianceSchema?: ComplianceSchema; // The cloned blueprint inherited at the time of placement
//     evidenceMap?: Record<string, UploadedEvidence>; // The key-value store (e.g., { "tranche_1_req_1": { url: "..." } })



// }

// interface PlacementStats {
//     activeCount: number;
//     completedCount: number;
//     droppedCount: number;
//     missingContracts: number;
//     nonCompliantCount: number;
// }

// interface ComplianceMetricsData {
//     transformationPercentage: number;
//     disabilityPercentage: number;
//     disabilityCount: number;
//     youthPercentage: number;
//     youthCount: number;
//     etiYieldPercentage: number;
//     monthlyETITotal: number;
//     annualizedETIEstimate: number;
//     absorptionRate: number;
//     totalProjectedSpend: number;
//     totalS12hProjected: number;
//     totalFemale: number;
//     totalMale: number;
//     absorbedFemale: number;
//     absorbedMale: number;
//     raceCounts: { African: number; Coloured: number; Indian: number; White: number; Other: number };
//     overloadedMentors: number;
// }

// const getSAWorkingDaysInMonth = (year: number, month: number, holidays: string[]) => {
//     const start = moment([year, month, 1]);
//     const end = moment(start).endOf('month');
//     let days = 0;
//     let current = start.clone();
//     while (current.isSameOrBefore(end)) {
//         if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
//             if (!holidays.includes(current.format('YYYY-MM-DD'))) days++;
//         }
//         current.add(1, 'days');
//     }
//     return days;
// };

// const EtiBreakdownModal: React.FC<{ learner: EnrichedPlacement; onClose: () => void; }> = ({ learner, onClose }) => {
//     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
//     const wage = Number(learner.stipendAmount) || 0;
//     const eti = Number(learner.etiMonthlyValue) || 0;
//     const annualEti = eti * 12;

//     let mathString = "";
//     if (wage < 2000) mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
//     else if (wage >= 2000 && wage <= 4499) mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
//     else if (wage >= 4500 && wage < 6500) mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
//     else mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: 0, border: '2px solid var(--mlab-border)' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
//                     <div className="wm-modal__header-icon" style={{ background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', borderRadius: 0, border: '1px solid var(--mlab-border)' }}><Landmark size={20} /></div>
//                     <div>
//                         <h2 className="wm-modal__title">SARS ETI Tax Rebate Audit</h2>
//                         <p className="wm-modal__subtitle">Calculated for {learner.learnerName}</p>
//                     </div>
//                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
//                 </div>
//                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
//                     <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '1rem', borderRadius: 0 }}>
//                         <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "8px", marginBottom: "8px" }}>
//                             <span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)", fontWeight: 600 }}>Database Stipend Value:</span>
//                             <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(wage)}</strong>
//                         </div>
//                         <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "8px", marginBottom: "8px" }}>
//                             <span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)", fontWeight: 600 }}>Official ETI Calculation:</span>
//                             <strong style={{ fontSize: "1.1rem", color: "var(--mlab-green-dark)" }}>{formatCurrency(eti)} /mo</strong>
//                         </div>
//                         <div style={{ display: "flex", justifyContent: "space-between" }}>
//                             <span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)", fontWeight: 600 }}>Annualized Projection:</span>
//                             <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(annualEti)}</strong>
//                         </div>
//                     </div>
//                     <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>Mathematical Formula Check:</div>
//                     <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: 0, fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600 }}>{mathString}</div>
//                 </div>
//                 <div className="wm-modal__footer" style={{ borderTop: '1px solid var(--mlab-border)' }}>
//                     <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: 0 }} onClick={onClose}>Close Audit Trail</button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// const EditPlacementModal: React.FC<{
//     placement: any;
//     mentors: StaffMember[];
//     cohorts: any[];
//     learners: DashboardLearner[];
//     onClose: () => void;
//     onSaved: () => void;
// }> = ({ placement, mentors, cohorts, learners, onClose, onSaved }) => {
//     const toast = useToast();
//     const [saving, setSaving] = useState(false);
//     const [uploadingDoc, setUploadingDoc] = useState(false);
//     const [forceShowAllProgrammes, setForceShowAllProgrammes] = useState(false);
//     const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
//     const [selectedFile, setSelectedFile] = useState<File | null>(null);

//     const [form, setForm] = useState({
//         mentorId: placement.mentorId || '',
//         cohortId: placement.cohortId || '',
//         placementType: placement.placementType || 'QCTO Workplace Module',
//         bbbeeSpendCategory: placement.compliance?.bbbeeSpendCategory || placement.bbbeeSpendCategory || 'Category C',
//         stipendAmount: placement.stipendAmount || '',
//         startDate: placement.startDate || '',
//         endDate: placement.endDate || '',
//         isAgreementFullyExecuted: placement.compliance?.isAgreementFullyExecuted || false,
//         wblpaAgreementUrl: placement.compliance?.wblpaAgreementUrl || ''
//     });

//     const isQcto = form.placementType === 'QCTO Workplace Module';
//     const targetLearner = learners.find(l => l.id === placement.learnerId);

//     const displayedCohorts = useMemo(() => {
//         if (forceShowAllProgrammes) return cohorts;
//         const relevantIds = new Set<string>();
//         if (targetLearner?.cohortId) relevantIds.add(targetLearner.cohortId);
//         if (placement.cohortId) relevantIds.add(placement.cohortId);
//         if (relevantIds.size === 0) return cohorts;
//         const matchingTracks = cohorts.filter(c => relevantIds.has(c.id));
//         return matchingTracks.length === 0 ? cohorts : matchingTracks;
//     }, [cohorts, targetLearner, placement.cohortId, forceShowAllProgrammes]);

//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setSaving(true);
//         try {
//             let finalDocumentUrl = form.wblpaAgreementUrl;
//             if (uploadMode === 'upload' && selectedFile) {
//                 setUploadingDoc(true);
//                 const fileRef = ref(storage, `placements/${placement.id}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
//                 await uploadBytes(fileRef, selectedFile);
//                 finalDocumentUrl = await getDownloadURL(fileRef);
//                 setUploadingDoc(false);
//             }

//             const batch = writeBatch(db);
//             const placementRef = doc(db, 'placements', placement.id);
//             const learnerRef = doc(db, 'learners', placement.learnerId);

//             batch.update(placementRef, {
//                 mentorId: form.mentorId,
//                 cohortId: isQcto ? form.cohortId : '',
//                 placementType: form.placementType,
//                 stipendAmount: Number(form.stipendAmount) || 0,
//                 startDate: form.startDate,
//                 endDate: form.endDate,
//                 compliance: {
//                     ...(placement.compliance || {}),
//                     bbbeeSpendCategory: form.bbbeeSpendCategory,
//                     isAgreementFullyExecuted: form.isAgreementFullyExecuted,
//                     wblpaAgreementUrl: finalDocumentUrl
//                 },
//                 updatedAt: new Date().toISOString()
//             });
//             batch.update(learnerRef, { mentorId: form.mentorId, updatedAt: new Date().toISOString() });
//             await batch.commit();
//             toast.success("Placement details updated successfully!");
//             setTimeout(() => { onSaved(); onClose(); }, 1200);
//         } catch (err: any) {
//             toast.error(err.message || "Failed to update placement details.");
//             setUploadingDoc(false);
//             setSaving(false);
//         }
//     };

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px', borderRadius: 0, border: '2px solid var(--mlab-border)' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-green)', paddingBottom: '1rem' }}>
//                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9', borderRadius: 0 }}><Edit size={20} /></div>
//                     <div>
//                         <h2 className="wm-modal__title">Edit Placement Details</h2>
//                         <p className="wm-modal__subtitle">Updating {placement.learnerName} at {placement.employerName}</p>
//                     </div>
//                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
//                 </div>
//                 <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
//                     <div className="wm-modal__body">
//                         <div className="wm-form-section">
//                             <div className="wm-form-section__label"><Briefcase size={12} /> Logistics & Timeline</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Placement Type</label>
//                                     <select className="wm-form-input" value={form.placementType} onChange={e => {
//                                         setForm(p => ({ ...p, placementType: e.target.value }));
//                                         if (e.target.value !== 'QCTO Workplace Module') setForm(p => ({ ...p, cohortId: '' }));
//                                     }} disabled={saving}>
//                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
//                                         <option value="Alumni Internship">Alumni Internship</option>
//                                         <option value="External WIL">External WIL</option>
//                                     </select>
//                                 </div>
//                                 {isQcto && (
//                                     <div className="wm-form-group wm-form-group--full animate-fade-in">
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
//                                             <label className="wm-form-label" style={{ margin: 0 }}>Programme / Qualification Linked <span className="wm-form-required">*</span></label>
//                                             <button type="button" onClick={() => setForceShowAllProgrammes(!forceShowAllProgrammes)} style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
//                                                 {forceShowAllProgrammes ? "Restrict Track" : "Extend Registry"}
//                                             </button>
//                                         </div>
//                                         <select className="wm-form-input" required={isQcto} value={form.cohortId} onChange={e => setForm(p => ({ ...p, cohortId: e.target.value }))} disabled={saving}>
//                                             <option value="">-- Needs Programme Mapping --</option>
//                                             {displayedCohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
//                                         </select>
//                                     </div>
//                                 )}
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Workplace Mentor</label>
//                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))} disabled={saving}>
//                                         <option value="">-- No Mentor Assigned --</option>
//                                         {mentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
//                                     </select>
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
//                                     <div style={{ position: 'relative' }}>
//                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
//                                         <input className="wm-form-input" type="number" min="0" style={{ paddingLeft: '28px' }} placeholder="e.g. 4500" value={form.stipendAmount} onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))} disabled={saving} />
//                                     </div>
//                                 </div>
//                                 <div className="wm-form-group"><label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label><input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} /></div>
//                                 <div className="wm-form-group"><label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label><input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} /></div>
//                             </div>
//                         </div>
//                         <div className="wm-form-section" style={{ marginTop: '1.5rem' }}>
//                             <div className="wm-form-section__label"><ShieldAlert size={12} /> Compliance & Contracts</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">B-BBEE Spend Category</label>
//                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
//                                         <option value="Category B">Category B (Degree/Diploma)</option>
//                                         <option value="Category C">Category C (Certificate/Occupational)</option>
//                                         <option value="Category D">Category D (Apprenticeship)</option>
//                                         <option value="Category E">Category E (Work-integrated learning)</option>
//                                     </select>
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: 0, border: '1px solid #e2e8f0' }}>
//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
//                                         <input type="checkbox" checked={form.isAgreementFullyExecuted} onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }} disabled={saving} />
//                                         WBLPA Signed & On File
//                                     </label>
//                                     <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: 0, overflow: 'hidden', marginTop: '12px' }}>
//                                         <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
//                                             <button type="button" onClick={() => setUploadMode('link')} style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }} disabled={saving}><LinkIcon size={12} /> Paste Link</button>
//                                             <button type="button" onClick={() => setUploadMode('upload')} style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }} disabled={saving}><UploadCloud size={12} /> Upload File</button>
//                                         </div>
//                                         <div style={{ padding: '12px' }}>
//                                             {uploadMode === 'link' ? (
//                                                 <><label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link</label><input className="wm-form-input" type="url" placeholder="https://drive.google.com/file/d/..." value={form.wblpaAgreementUrl} onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))} disabled={saving} /></>
//                                             ) : (
//                                                 <><label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract</label><input className="wm-form-input" type="file" accept=".pdf,image/*,.doc,.docx" onChange={e => { if (e.target.files && e.target.files.length > 0) setSelectedFile(e.target.files[0]); }} style={{ padding: '6px' }} disabled={saving} /></>
//                                             )}
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                     <div className="wm-modal__footer">
//                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
//                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
//                             {saving ? <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Updating…'}</> : <><Save size={13} /> Save Changes</>}
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         document.body
//     );
// };

// interface PlacementDetailsDrawerProps {
//     placement: EnrichedPlacement;
//     companyName: string;
//     workplaceLogs: any[];
//     saHolidays: string[];
//     onClose: () => void;
//     onOpenEti: (p: EnrichedPlacement) => void;
//     onOpenLogs: (p: EnrichedPlacement) => void;
//     onEditPlacement: (p: EnrichedPlacement) => void;
// }


// export const PlacementDetailsDrawer: React.FC<PlacementDetailsDrawerProps> = ({ placement, companyName, workplaceLogs, saHolidays, onClose, onOpenEti, onOpenLogs, onEditPlacement }) => {
//     const toast = useToast();
//     const [isExportModalOpen, setIsExportModalOpen] = useState(false);
//     const [isGeneratingPack, setIsGeneratingPack] = useState(false);
//     const [auditPackError, setAuditPackError] = useState<string | null>(null);
//     const [showDisbursementModal, setShowDisbursementModal] = useState(false);

//     // Legacy Upload State
//     const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);

//     // New Tranche Upload State
//     const [uploadingTrancheKey, setUploadingTrancheKey] = useState<string | null>(null);
//     const [linkingReq, setLinkingReq] = useState<{ trancheId: string, req: any } | null>(null);

//     const [disbursements, setDisbursements] = useState<any[]>([]);
//     const [isLoadingLedger, setIsLoadingLedger] = useState(true);
//     const [isLedgerExpanded, setIsLedgerExpanded] = useState(false);

//     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
//     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

//     useEffect(() => {
//         const fetchLedger = async () => {
//             setIsLoadingLedger(true);
//             try {
//                 const snap = await getDocs(collection(db, `placements/${placement.id}/disbursements`));
//                 const list = snap.docs.map(doc => doc.data()).sort((a, b) => String(b.monthYear).localeCompare(String(a.monthYear)));
//                 setDisbursements(list);
//             } catch (error) {
//                 console.error("Failed to load ledger", error);
//             } finally {
//                 setIsLoadingLedger(false);
//             }
//         };
//         fetchLedger();
//     }, [placement.id, showDisbursementModal]);

//     // ── LEGACY COMPLIANCE UPLOAD (Kept intact for old placements) ──
//     const handleUploadComplianceDoc = async (e: React.ChangeEvent<HTMLInputElement>, item: any) => {
//         const file = e.target.files?.[0];
//         if (!file) return;
//         setUploadingDocKey(item.key);
//         try {
//             const fileRef = ref(storage, `compliance/${placement.id}/${item.key}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
//             await uploadBytes(fileRef, file);
//             const downloadUrl = await getDownloadURL(fileRef);
//             if (item.dbTarget === 'learner') {
//                 await updateDoc(doc(db, 'learners', placement.learnerId), {
//                     [`documents.${item.key}`]: downloadUrl,
//                     idDocumentUrl: item.key === 'idDoc' ? downloadUrl : undefined,
//                     updatedAt: new Date().toISOString()
//                 });
//             } else {
//                 let docField = `${item.key}Url`;
//                 if (item.key === 'wblpa') docField = 'wblpaAgreementUrl';
//                 if (item.key === 'empContract') docField = 'employmentContractUrl';
//                 await updateDoc(doc(db, 'placements', placement.id), {
//                     [`compliance.${docField}`]: downloadUrl,
//                     updatedAt: new Date().toISOString()
//                 });
//             }
//             toast.success(`${item.label} uploaded successfully!`);
//         } catch (err: any) {
//             toast.error("Failed to upload document.");
//         } finally {
//             setUploadingDocKey(null);
//             if (e.target) e.target.value = '';
//         }
//     };

//     // ── 🚀 NEW DYNAMIC TRANCHE UPLOAD ENGINE ──
//     const handleTrancheUpload = async (e: React.ChangeEvent<HTMLInputElement>, trancheId: string, req: any) => {
//         const file = e.target.files?.[0];
//         if (!file) return;

//         const compositeKey = `${trancheId}_${req.id}`;
//         setUploadingTrancheKey(compositeKey);

//         try {
//             // Upload to Cloud Storage
//             const fileRef = ref(storage, `compliance/${placement.id}/${compositeKey}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
//             await uploadBytes(fileRef, file);
//             const downloadUrl = await getDownloadURL(fileRef);

//             // Build payload for EvidenceMap
//             const evidencePayload = {
//                 url: downloadUrl,
//                 uploadedAt: new Date().toISOString(),
//                 fileName: file.name
//             };

//             const batch = writeBatch(db);
//             const placementRef = doc(db, 'placements', placement.id);

//             // 1. Save to EvidenceMap
//             batch.update(placementRef, {
//                 [`evidenceMap.${compositeKey}`]: evidencePayload,
//                 updatedAt: new Date().toISOString()
//             });

//             // 2. Map to System Tag (if required for Master Score)
//             if (req.systemTag) {
//                 batch.update(placementRef, {
//                     [`compliance.${req.systemTag}`]: downloadUrl
//                 });
//             }

//             await batch.commit();
//             toast.success(`${req.label} saved to Tranche log!`);
//         } catch (err: any) {
//             console.error(err);
//             toast.error("Failed to process tranche evidence.");
//         } finally {
//             setUploadingTrancheKey(null);
//             if (e.target) e.target.value = '';
//         }
//     };

//     // ── 🚀 "LINK FROM VAULT" ENGINE ──
//     const handleLinkExistingEvidence = async (sourceEvidence: any) => {
//         if (!linkingReq) return;

//         const compositeKey = `${linkingReq.trancheId}_${linkingReq.req.id}`;
//         try {
//             const batch = writeBatch(db);
//             const placementRef = doc(db, 'placements', placement.id);

//             // 1. Duplicate the existing link into the new tranche slot
//             batch.update(placementRef, {
//                 [`evidenceMap.${compositeKey}`]: {
//                     ...sourceEvidence,
//                     linkedAt: new Date().toISOString(),
//                     isLinked: true
//                 },
//                 updatedAt: new Date().toISOString()
//             });

//             // 2. Sync to System Tag if required
//             if (linkingReq.req.systemTag) {
//                 batch.update(placementRef, {
//                     [`compliance.${linkingReq.req.systemTag}`]: sourceEvidence.url
//                 });
//             }

//             await batch.commit();
//             toast.success(`${linkingReq.req.label} successfully linked from vault!`);
//             setLinkingReq(null);
//         } catch (err: any) {
//             toast.error("Failed to link evidence.");
//         }
//     };

//     const handleDownloadAuditPack = async (selectedFolders: string[]) => {
//         setIsGeneratingPack(true);
//         setAuditPackError(null);
//         try {
//             const functions = getFunctions();
//             const generateSetaAuditPack = httpsCallable(functions, "generateSetaAuditPack");
//             const response = await generateSetaAuditPack({
//                 learnerId: placement.learnerId, placementId: placement.id, employerName: companyName,
//                 learnerName: placement.learnerName, idNumber: placement.idNumber, mentorName: placement.mentorName,
//                 selectedFolders: selectedFolders
//             });
//             const data = response.data as { success: boolean; url: string };
//             if (data.success && data.url) {
//                 window.location.href = data.url;
//                 setIsExportModalOpen(false);
//             } else setAuditPackError("Server failed to supply a valid download path.");
//         } catch (error: any) {
//             setAuditPackError(error.message || "Failed to generate the compliance audit pack.");
//         } finally {
//             setIsGeneratingPack(false);
//         }
//     };

//     // Determine if this placement uses the new Tranche Schema or the old Fallback method
//     const hasSchema = placement.complianceSchema && placement.complianceSchema.tranches && placement.complianceSchema.tranches.length > 0;
//     const evidenceMap = placement.evidenceMap || {};

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99990, display: "flex", justifyContent: "flex-end", position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.3)", backdropFilter: "blur(2px)" }}>

//             {isExportModalOpen && (
//                 <EvidenceExportModal learnerName={placement.learnerName} onClose={() => setIsExportModalOpen(false)} onGenerate={handleDownloadAuditPack} isGenerating={isGeneratingPack} />
//             )}

//             {/* Link From Vault Inline Modal */}
//             {linkingReq && (
//                 <div style={{ position: 'absolute', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setLinkingReq(null)}>
//                     <div style={{ width: '400px', background: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
//                             <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '6px' }}><LinkIcon size={16} /> Link File from Vault</h3>
//                             <button onClick={() => setLinkingReq(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={16} /></button>
//                         </div>
//                         <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>Select an existing file to link as your <strong>{linkingReq.req.label}</strong>.</p>

//                         <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                             {Object.keys(evidenceMap).length > 0 ? Object.entries(evidenceMap).map(([key, ev]: [string, any]) => {
//                                 // Exclude the current slot to prevent self-linking
//                                 if (key === `${linkingReq.trancheId}_${linkingReq.req.id}`) return null;
//                                 return (
//                                     <div key={key} onClick={() => handleLinkExistingEvidence(ev)} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#e0f2fe'} onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                             <FileText size={14} color="var(--mlab-blue)" />
//                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                                 <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{ev.fileName || 'Uploaded Document'}</span>
//                                                 <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{moment(ev.uploadedAt).format('DD MMM YYYY')}</span>
//                                             </div>
//                                         </div>
//                                         <ChevronRight size={14} color="#94a3b8" />
//                                     </div>
//                                 );
//                             }) : (
//                                 <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', background: '#f1f5f9', borderRadius: '4px' }}>
//                                     Vault is empty. You haven't uploaded any files yet.
//                                 </div>
//                             )}
//                         </div>
//                     </div>
//                 </div>
//             )}

//             <div onClick={e => e.stopPropagation()} style={{ width: "450px", maxWidth: "100%", height: "100%", background: "var(--mlab-bg)", display: "flex", flexDirection: "column", boxShadow: "-10px 0 25px rgba(0,0,0,0.1)", animation: "slideInRight 0.3s ease-out" }}>

//                 <div style={{ padding: "1.5rem", background: "var(--mlab-white)", borderBottom: "1px solid var(--mlab-border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
//                     <div>
//                         <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
//                             <div className="cdp-learner-avatar" style={{ borderRadius: 0, background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)' }}>{placement.learnerName.charAt(0)}</div>
//                             <div><h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>{placement.learnerName}</h3><p style={{ margin: 0, fontSize: "0.8rem", color: "var(--mlab-grey)" }}>ID: {placement.idNumber}</p></div>
//                         </div>
//                     </div>
//                     <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--mlab-grey)", padding: "4px" }}><X size={20} /></button>
//                 </div>

//                 <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

//                     {/* 🚀 CONDITIONAL RENDER: NEW TRANCHE SCHEMA VS OLD COMPLIANCE VAULT */}
//                     {hasSchema ? (
//                         <div style={{ background: "white", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)", display: 'flex', flexDirection: 'column', gap: '1rem' }}>

//                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
//                                 <div>
//                                     <h4 style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", color: "var(--mlab-midnight)", fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={16} color="var(--mlab-blue)" /> Funding & Disbursement Timeline</h4>
//                                     <p style={{ margin: '4px 0 0 0', fontSize: '0.65rem', color: '#64748b' }}>Schema: {placement.complianceSchema?.schemaName}</p>
//                                 </div>
//                                 <div style={{ textAlign: 'right' }}>
//                                     <span style={{ fontSize: "1.1rem", fontWeight: 800, color: placement.complianceScore === 100 ? "var(--mlab-green-dark)" : "var(--mlab-amber)", fontFamily: "var(--font-heading)" }}>{placement.complianceScore}%</span>
//                                     <div style={{ fontSize: '0.6rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Core Compliance</div>
//                                 </div>
//                             </div>

//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
//                                 {placement.complianceSchema?.tranches.map((tranche: any, index: number) => {

//                                     // Calculate Due Date based on placement.startDate + dueAtMonth
//                                     const dueDate = moment(placement.startDate).add(tranche.dueAtMonth, 'months');
//                                     const isOverdue = moment().isAfter(dueDate) && tranche.requirements.some((r: any) => r.required && !evidenceMap[`${tranche.trancheId}_${r.id}`]);

//                                     return (
//                                         <div key={tranche.trancheId} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: isOverdue ? '#fef2f2' : '#e0f2fe', color: isOverdue ? '#dc2626' : '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, border: `1px solid ${isOverdue ? '#fecaca' : '#bae6fd'}` }}>
//                                                         {index + 1}
//                                                     </div>
//                                                     <h5 style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700 }}>{tranche.title}</h5>
//                                                 </div>
//                                                 <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: isOverdue ? '#fef2f2' : '#f8fafc', color: isOverdue ? '#dc2626' : '#64748b', border: `1px solid ${isOverdue ? '#fecaca' : '#e2e8f0'}` }}>
//                                                     Due: {dueDate.format('DD MMM YYYY')}
//                                                 </span>
//                                             </div>

//                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '14px', borderLeft: `2px solid ${isOverdue ? '#fca5a5' : '#cbd5e1'}`, marginLeft: '9px' }}>
//                                                 {tranche.requirements.map((req: any) => {
//                                                     const compositeKey = `${tranche.trancheId}_${req.id}`;
//                                                     const evidence = evidenceMap[compositeKey];
//                                                     const isComplete = !!evidence;
//                                                     const isUploading = uploadingTrancheKey === compositeKey;

//                                                     return (
//                                                         <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '4px' }}>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
//                                                                 {isComplete ? <CheckSquare size={13} color="#16a34a" /> : <Square size={13} color="#94a3b8" />}
//                                                                 {req.label}
//                                                                 {!req.required && <span style={{ fontSize: '0.55rem', background: '#e2e8f0', color: '#64748b', padding: '2px 4px', borderRadius: '2px', textTransform: 'uppercase' }}>Optional</span>}
//                                                             </div>

//                                                             <div>
//                                                                 {isComplete ? (
//                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                         {evidence?.isLinked && <span title="Linked from vault" style={{ display: 'flex' }}><LinkIcon size={10} color="#94a3b8" /></span>}
//                                                                         <a href={evidence.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                                             <FileText size={10} /> View
//                                                                         </a>
//                                                                     </div>
//                                                                 ) : (
//                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                                         {req.type === 'site_visit' ? (
//                                                                             <button onClick={() => toast.info('Site Visit Module activating in Phase 2!')} style={{ fontSize: '0.65rem', color: 'white', background: '#d97706', border: 'none', padding: '4px 8px', borderRadius: '2px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                                                 <Activity size={10} /> Log Visit
//                                                                             </button>
//                                                                         ) : req.type === 'report' ? (
//                                                                             <span style={{ fontSize: '0.6rem', color: '#16a34a', fontStyle: 'italic', fontWeight: 600 }}>Auto-Generated</span>
//                                                                         ) : (
//                                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                                                 <button type="button" onClick={() => setLinkingReq({ trancheId: tranche.trancheId, req })} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Link existing file from vault">
//                                                                                     <LinkIcon size={12} />
//                                                                                 </button>
//                                                                                 <label style={{ fontSize: '0.65rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '2px', fontWeight: 700, cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                                                     {isUploading ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
//                                                                                     {req.type === 'pop' ? 'Upload PoP' : 'Upload'}
//                                                                                     <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => handleTrancheUpload(e, tranche.trancheId, req)} disabled={isUploading} />
//                                                                                 </label>
//                                                                             </div>
//                                                                         )}
//                                                                     </div>
//                                                                 )}
//                                                             </div>
//                                                         </div>
//                                                     );
//                                                 })}
//                                             </div>
//                                         </div>
//                                     );
//                                 })}
//                             </div>

//                             {placement.complianceScore === 100 && (
//                                 <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 0, fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s", marginTop: '0.5rem' }}>
//                                     {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
//                                     {isGeneratingPack ? "Compiling Cloud Zip..." : "Download Completed Audit Pack"}
//                                 </button>
//                             )}
//                             {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
//                         </div>
//                     ) : (
//                         /* ─── LEGACY COMPLIANCE VAULT (FALLBACK FOR OLD RECORDS) ─── */
//                         <div style={{ background: "var(--mlab-white)", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)" }}>
//                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
//                                 <h4 style={{ margin: 0, fontSize: "0.75rem", textTransform: "uppercase", color: "var(--mlab-grey)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} /> Legacy Compliance Vault</h4>
//                                 <div style={{ textAlign: 'right' }}>
//                                     <span style={{ fontSize: "1.1rem", fontWeight: 800, color: placement.complianceScore === 100 ? "var(--mlab-green-dark)" : "var(--mlab-amber)", fontFamily: "var(--font-heading)" }}>{placement.complianceScore}%</span>
//                                     <div style={{ fontSize: '0.6rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Core Met</div>
//                                 </div>
//                             </div>
//                             <div style={{ width: "100%", background: "#e2e8f0", height: "6px", borderRadius: 0, overflow: "hidden", marginBottom: "1rem" }}>
//                                 <div style={{ width: `${placement.complianceScore}%`, background: placement.complianceScore === 100 ? "var(--mlab-green)" : "var(--mlab-amber)", height: "100%", transition: "width 0.3s ease-out" }} />
//                             </div>
//                             <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem" }}>
//                                 {placement.complianceItems.map((item: any) => (
//                                     <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '8px 12px', borderRadius: 0 }}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
//                                             {item.isComplete ? <CheckSquare size={14} color="var(--mlab-green)" /> : <Square size={14} color="var(--mlab-grey)" />}
//                                             {item.label}
//                                             {!item.isRequired && <span style={{ fontSize: '0.6rem', background: '#e2e8f0', color: 'var(--mlab-grey)', padding: '2px 6px', borderRadius: 0, textTransform: 'uppercase' }}>Optional</span>}
//                                         </div>
//                                         <div>
//                                             {item.isComplete ? (
//                                                 item.url ? (
//                                                     <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={12} /> View</a>
//                                                 ) : (
//                                                     <span style={{ fontSize: '0.7rem', color: 'var(--mlab-green-dark)', fontWeight: 700 }}>VERIFIED</span>
//                                                 )
//                                             ) : (
//                                                 item.actionType === 'upload' ? (
//                                                     <label style={{ fontSize: '0.7rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: 0, fontWeight: 700, cursor: uploadingDocKey === item.key ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                         {uploadingDocKey === item.key ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
//                                                         {uploadingDocKey === item.key ? 'Uploading...' : 'Upload'}
//                                                         <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={e => handleUploadComplianceDoc(e, item)} disabled={uploadingDocKey === item.key} />
//                                                     </label>
//                                                 ) : item.actionType === 'assign' ? (
//                                                     <button onClick={() => onEditPlacement(placement)} style={{ fontSize: '0.7rem', color: 'white', background: '#d97706', border: 'none', padding: '4px 8px', borderRadius: 0, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><User size={10} /> Assign</button>
//                                                 ) : null
//                                             )}
//                                         </div>
//                                     </div>
//                                 ))}
//                             </div>
//                             {placement.complianceScore === 100 && (
//                                 <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 0, fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s" }}>
//                                     {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
//                                     {isGeneratingPack ? "Compiling Cloud Zip..." : "Download SETA Audit Pack (.zip)"}
//                                 </button>
//                             )}
//                             {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
//                         </div>
//                     )}

//                     <div style={{ background: "var(--mlab-white)", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)" }}>
//                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--mlab-grey)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Briefcase size={14} /> Placement Trajectory</h4>
//                         <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
//                             <div><div style={{ fontSize: "0.7rem", color: "var(--mlab-grey)" }}>Start Date</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.startDate)}</div></div>
//                             <div><div style={{ fontSize: "0.7rem", color: "var(--mlab-grey)" }}>Expected End</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.endDate)}</div></div>
//                             <div style={{ gridColumn: "1 / -1", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}><div style={{ fontSize: "0.7rem", color: "var(--mlab-grey)", marginBottom: "4px" }}>Workplace Supervisor</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: placement.hasMentor ? "var(--mlab-midnight)" : "var(--mlab-red)", display: "flex", alignItems: "center", gap: "6px" }}>{placement.hasMentor ? <><User size={14} /> {placement.mentorName}</> : <><AlertTriangle size={14} /> Unassigned</>}</div></div>
//                         </div>
//                     </div>

//                     <div style={{ background: "var(--mlab-white)", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)" }}>
//                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--mlab-grey)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Landmark size={14} /> Finance & Rebates</h4>
//                         <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
//                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)" }}>Monthly Base Stipend</span><span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-midnight)", textDecoration: placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) ? 'line-through' : 'none' }}>{formatCurrency(placement.stipendAmount)} /mo</span></div>
//                             {placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) && (
//                                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: 0 }}>
//                                     <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: "0.75rem", color: "var(--mlab-red)", fontWeight: 700 }}>EARNED THIS MONTH</span><span style={{ fontSize: "0.65rem", color: "#991b1b" }}>Based on {placement.currentMonthApprovedDays} / {placement.expectedWorkingDaysThisMonth} expected days</span></div>
//                                     <span style={{ fontSize: "1rem", fontWeight: 800, color: "var(--mlab-red)" }}>{formatCurrency(placement.currentMonthEarnedStipend)}</span>
//                                 </div>
//                             )}
//                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}><span style={{ fontSize: "0.8rem", color: "var(--mlab-grey)" }}>SARS ETI Claim</span>{placement.isEtiEligible && placement.etiMonthlyValue > 0 ? (<button onClick={() => onOpenEti(placement)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: 0, fontSize: "0.75rem", color: "#166534", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Coins size={12} /> {formatCurrency(placement.etiMonthlyValue)} /mo</button>) : (<span style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", background: "#f1f5f9", padding: "4px 8px", borderRadius: 0, border: "1px solid #e2e8f0", fontWeight: 600 }}>Ineligible</span>)}</div>
//                             <div style={{ paddingTop: "10px", borderTop: "1px solid #f1f5f9", marginTop: "4px" }}>
//                                 <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-grey)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Historical Payments Ledger</div>
//                                 {isLoadingLedger ? (<div style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", display: "flex", alignItems: "center", gap: "6px" }}><Loader2 size={12} className="wm-spin" /> Loading records...</div>) : disbursements.length === 0 ? (<div style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", fontStyle: "italic" }}>No disbursements logged yet.</div>) : (
//                                     <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
//                                         <div style={{ background: "var(--mlab-bg)", border: "1px solid var(--mlab-border)", borderRadius: 0, padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                                             <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{disbursements[0].monthYear}</div><div style={{ fontSize: "0.65rem", color: "var(--mlab-grey)", fontFamily: "monospace" }}>{disbursements[0].bankReference}</div></div>
//                                             <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-green-dark)" }}>{formatCurrency(disbursements[0].netPayment)}</div>{disbursements[0].payslipEftUrl ? (<a href={disbursements[0].payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "var(--mlab-grey)" }}>Bulk Sync</span>)}</div>
//                                         </div>
//                                         {disbursements.length > 1 && (
//                                             <div style={{ marginTop: "4px" }}>
//                                                 <button onClick={() => setIsLedgerExpanded(!isLedgerExpanded)} style={{ width: "100%", background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}>
//                                                     <span>{isLedgerExpanded ? "Hide older payments" : `View ${disbursements.length - 1} older payment(s)`}</span>{isLedgerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
//                                                 </button>
//                                                 {isLedgerExpanded && (
//                                                     <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
//                                                         {disbursements.slice(1).map((d, i) => (
//                                                             <div key={i} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 0, padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.85 }}>
//                                                                 <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{d.monthYear}</div><div style={{ fontSize: "0.65rem", color: "var(--mlab-grey)", fontFamily: "monospace" }}>{d.bankReference}</div></div>
//                                                                 <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-green-dark)" }}>{formatCurrency(d.netPayment)}</div>{d.payslipEftUrl ? (<a href={d.payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "var(--mlab-grey)" }}>Bulk Sync</span>)}</div>
//                                                             </div>
//                                                         ))}
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         )}
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     </div>

//                     <div style={{ background: "var(--mlab-white)", borderRadius: 0, padding: "1rem", border: "1px solid var(--mlab-border)" }}>
//                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--mlab-grey)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Activity size={14} /> Audit & Logbook Activity</h4>
//                         <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
//                             <div>
//                                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--mlab-grey)", marginBottom: "6px", fontWeight: 600 }}>
//                                     <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> Campus Attendance Ratio</span>
//                                     <span style={{ color: placement.attendancePercentage >= 80 ? "var(--mlab-green-dark)" : placement.attendancePercentage >= 50 ? "#d97706" : "var(--mlab-red)" }}>{placement.attendancePercentage}%</span>
//                                 </div>
//                                 <div style={{ width: "100%", background: "#e2e8f0", height: "8px", borderRadius: 0, overflow: "hidden" }}>
//                                     <div style={{ width: `${placement.attendancePercentage}%`, background: placement.attendancePercentage >= 80 ? "var(--mlab-green)" : placement.attendancePercentage >= 50 ? "#f59e0b" : "#ef4444", height: "100%" }} />
//                                 </div>
//                             </div>
//                             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "var(--mlab-bg)", padding: "10px", borderRadius: 0, border: "1px solid var(--mlab-border)" }}>
//                                 <div><div style={{ fontSize: "0.7rem", color: "var(--mlab-green-dark)", fontWeight: 700 }}>✅ MENTOR APPROVED HOURS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#15803d" }}>{Number(placement.approvedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
//                                 <div><div style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 700 }}>⏳ WAITING FOR MENTOR</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#b45309" }}>{Number(placement.pendingWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
//                                 <div style={{ borderTop: "1px solid var(--mlab-border)", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "var(--mlab-red)", fontWeight: 700 }}>❌ REJECTED LOGS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c2410c" }}>{Number(placement.rejectedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
//                                 <div style={{ borderTop: "1px solid var(--mlab-border)", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "var(--mlab-grey)", fontWeight: 700 }}>📝 DRAFT (NOT SUBMITTED)</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>{Number(placement.draftWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
//                             </div>
//                             <button onClick={() => onOpenLogs(placement)} style={{ width: "100%", padding: "10px", background: "var(--mlab-white)", border: "1px solid var(--mlab-blue)", color: "var(--mlab-blue)", borderRadius: 0, fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={e => { e.currentTarget.style.background = "#eff6ff"; }} onMouseOut={e => { e.currentTarget.style.background = "var(--mlab-white)"; }}>
//                                 <FileText size={16} /> Open Complete Logbook Audit
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//             {showDisbursementModal && (
//                 <StipendDisbursementModal placement={placement} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setShowDisbursementModal(false)} />
//             )}
//         </div>,
//         document.body
//     );
// };

// export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
//     const navigate = useNavigate();
//     const { user, learners, staff } = useStore() as any;
//     const placements = useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || [];

//     const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
//     const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
//     const [workplaceLogs, setWorkplaceLogs] = useState<any[]>([]);
//     const [isComplianceLoading, setIsComplianceLoading] = useState(true);
//     const [saHolidays, setSaHolidays] = useState<string[]>([]);

//     const [activeTab, setActiveTab] = useState<"active" | "history" | "all" | "action_required">("active");
//     const [searchQuery, setSearchQuery] = useState("");
//     const [showExportMenu, setShowExportMenu] = useState(false);

//     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);
//     const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(null);
//     const [drawerPlacement, setDrawerPlacement] = useState<EnrichedPlacement | null>(null);
//     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);

//     const menuRef = useRef<HTMLDivElement>(null);
//     const [bulkJobId, setBulkJobId] = useState<string | null>(null);
//     const [bulkJobStatus, setBulkJobStatus] = useState<{ status: string, completedTasks: number, totalTasks: number, downloadUrl?: string | null } | null>(null);
//     const [isRequestingBulk, setIsRequestingBulk] = useState(false);
//     const [hasAutoDownloaded, setHasAutoDownloaded] = useState(false);

//     const companyPlacements = useMemo(() => placements.filter(p => p.employerId === company.id), [placements, company.id]);
//     const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

//     const placementLearnerIdsStr = useMemo(() => companyPlacements.map(p => p.learnerId).sort().join(","), [companyPlacements]);

//     const toast = useToast();

//     useEffect(() => {
//         const fetchHolidays = async () => {
//             try {
//                 const year = new Date().getFullYear();
//                 const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`);
//                 if (res.ok) setSaHolidays((await res.json()).map((h: any) => h.date));
//             } catch (error) { console.error("Error fetching SA holidays:", error); }
//         };
//         fetchHolidays();
//     }, []);

//     const fetchDeepComplianceData = async () => {
//         setIsComplianceLoading(true);
//         try {
//             const logsUnifiedMap = new Map<string, any>();
//             const wpQueryEmp = query(collection(db, "workplace_logs"), where("employerId", "==", company.id));
//             const wpSnapEmp = await getDocs(wpQueryEmp);
//             wpSnapEmp.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));

//             const relevantLearnerIds = new Set<string>();
//             companyPlacements.forEach(p => {
//                 if (p.learnerId) relevantLearnerIds.add(String(p.learnerId).trim());
//                 const l = learners.find((x: any) => x.id === p.learnerId);
//                 if (l && l.idNumber && String(l.idNumber).trim() !== "") relevantLearnerIds.add(String(l.idNumber).trim());
//             });

//             const placementStudentPool = Array.from(relevantLearnerIds).filter(Boolean);
//             for (let i = 0; i < placementStudentPool.length; i += 10) {
//                 const studentChunk = placementStudentPool.slice(i, i + 10);
//                 if (studentChunk.length === 0) continue;
//                 const wpQueryLearner = query(collection(db, "workplace_logs"), where("learnerId", "in", studentChunk));
//                 const wpSnapLearner = await getDocs(wpQueryLearner);
//                 wpSnapLearner.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));
//             }
//             setWorkplaceLogs(Array.from(logsUnifiedMap.values()));

//             const relevantCohortIds = new Set<string>();
//             companyPlacements.forEach(p => { if (p.cohortId) relevantCohortIds.add(p.cohortId); });
//             const cohortIdsArray = Array.from(relevantCohortIds);
//             let fetchedAttLogs: any[] = [];
//             let fetchedAttRecords: any[] = [];
//             for (const cId of cohortIdsArray) {
//                 if (!cId) continue;
//                 const logsQ = query(collection(db, "attendance_logs"), where("cohortId", "==", cId));
//                 const recsQ = query(collection(db, "attendance_records"), where("cohortId", "==", cId));
//                 const [lSnap, rSnap] = await Promise.all([getDocs(logsQ), getDocs(recsQ)]);
//                 fetchedAttLogs.push(...lSnap.docs.map(d => ({ id: d.id, ...d.data() })));
//                 fetchedAttRecords.push(...rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
//             }
//             setAttendanceLogs(fetchedAttLogs);
//             setAttendanceRecords(fetchedAttRecords);
//         } catch (error) {
//             console.error("Deep compliance fetch error:", error);
//         } finally {
//             setIsComplianceLoading(false);
//         }
//     };

//     useEffect(() => {
//         if (placementLearnerIdsStr.length > 0) fetchDeepComplianceData();
//         else setIsComplianceLoading(false);
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [company.id, placementLearnerIdsStr]);

//     const { activeCount, completedCount, droppedCount, missingContracts, nonCompliantCount } = useMemo<PlacementStats>(() => {
//         let active = 0, completed = 0, dropped = 0, missing = 0, nonCompliant = 0;
//         companyPlacements.forEach(p => {
//             const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean } };
//             const statusLower = p.status.toLowerCase();
//             if (statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview")) {
//                 active++;
//                 const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
//                 const hasMentor = !!(p.assignedMentorName || (placementRecord as any).mentorId);
//                 if (!isFullySigned) missing++;
//                 if (!isFullySigned || !hasMentor) nonCompliant++;
//             }
//             if (p.status === "Completed" || p.status === "absorbed_permanently") completed++;
//             if (p.status === "Terminated") dropped++;
//         });
//         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing, nonCompliantCount: nonCompliant };
//     }, [companyPlacements]);

//     const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
//         return companyPlacements.map(p => {
//             const learner = learners.find((l: any) => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
//             const placementRecord = p as PlacementContract & {
//                 placementType?: string;
//                 compliance?: { isAgreementFullyExecuted?: boolean; wblpaAgreementUrl?: string; employmentContractUrl?: string; slaUrl?: string; smeAgreementUrl?: string; dueDiligenceUrl?: string; bbbeeSpendCategory?: string; };
//                 bbbeeSpendCategory?: string; mentorId?: string; cohortId?: string;
//             };

//             const mentor = companyMentors.find((m: any) => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);
//             const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string; disabilityStatus?: string; };
//             const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || "Unknown";
//             const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || "No Disability";

//             let isEtiEligible = false, isFemale = false, isYouth = true;
//             if (learner.idNumber && learner.idNumber.length >= 13) {
//                 const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
//                 const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
//                 const age = new Date().getFullYear() - birthYear;
//                 if (age >= 18 && age <= 29) isEtiEligible = true;
//                 if (age > 35) isYouth = false;
//                 const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
//                 if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
//             } else if ((learner.demographics as any)?.genderCode === "F" || (extendedLearner as any).gender === "Female") {
//                 isFemale = true;
//             }

//             const monthsDuration = moment(p.endDate).diff(moment(p.startDate), "months", true);
//             const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

//             let etiMonthlyValue = 0;
//             const wage = Number(p.stipendAmount) || 0;
//             if (isEtiEligible && wage > 0) {
//                 if (wage < 2000) etiMonthlyValue = wage * 0.75;
//                 else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
//                 else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - 0.75 * (wage - 4500), 0);
//             }

//             const hasDisability = disability !== "No Disability" && disability !== "None" && disability !== "N/A" && disability !== "No" && disability !== "N";
//             const s12hAllowanceTotal = hasDisability ? 120000 : 80000;
//             const cohortId = learner.cohortId || placementRecord.cohortId;
//             const safeLearnerId = String(p.learnerId || "").trim().toLowerCase();
//             const safeIdNumber = String(learner.idNumber || "").trim().toLowerCase();

//             let attendancePercentage = 0;
//             if (cohortId) {
//                 const learnerAttRecords = attendanceRecords.filter((r: any) => r.cohortId === cohortId && (String(r.learnerId).trim().toLowerCase() === safeLearnerId || String(r.learnerId).trim().toLowerCase() === safeIdNumber));
//                 const learnerAttPresent = learnerAttRecords.filter((r: any) => r.status === "Present" || r.status === "Partial").length;
//                 const cohortTotalSessions = attendanceLogs.filter((l: any) => l.cohortId === cohortId).length;
//                 attendancePercentage = cohortTotalSessions > 0 ? Math.round((learnerAttPresent / cohortTotalSessions) * 100) : 0;
//             }

//             const learnerWpLogs = workplaceLogs.filter((l: any) => {
//                 const logLId = String(l.learnerId || "").trim().toLowerCase();
//                 return (safeLearnerId !== "" && logLId === safeLearnerId) || (safeIdNumber !== "" && logLId === safeIdNumber);
//             });

//             const approvedWpHours = learnerWpLogs.reduce((sum: number, l: any) => String(l.status || "").trim().toLowerCase() === "approved" ? sum + (Number(l.totalHours) || 0) : sum, 0);
//             const pendingWpHours = learnerWpLogs.reduce((sum: number, l: any) => (String(l.status || "").trim().toLowerCase() === "pending_mentor_approval" || String(l.status || "").trim().toLowerCase() === "pending") ? sum + (Number(l.totalHours) || 0) : sum, 0);
//             const rejectedWpHours = learnerWpLogs.reduce((sum: number, l: any) => String(l.status || "").trim().toLowerCase() === "rejected" ? sum + (Number(l.totalHours) || 0) : sum, 0);
//             const draftWpHours = learnerWpLogs.reduce((sum: number, l: any) => (String(l.status || "").trim().toLowerCase() === "draft" || String(l.status || "").trim().toLowerCase() === "") ? sum + (Number(l.totalHours) || 0) : sum, 0);

//             const currentYear = moment().year();
//             const currentMonth = moment().month();
//             const currentMonthStr = moment().format('YYYY-MM');
//             const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, saHolidays);
//             const currentMonthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr));
//             const approvedDatesThisMonth = new Set(currentMonthWpLogs.filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved").map((l: any) => l.dateString));
//             const currentMonthApprovedDays = approvedDatesThisMonth.size;

//             let currentMonthEarnedStipend = wage;
//             if (expectedWorkingDaysThisMonth > 0 && wage > 0) {
//                 const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * wage;
//                 currentMonthEarnedStipend = Math.round(Math.min(calculatedProRata, wage) * 100) / 100;
//             }

//             let idUrl = learner.documents?.idDocument || learner.idUrl || learner.idDocumentUrl || "";
//             let wblpaUrl = placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl || "";
//             let empContractUrl = placementRecord.compliance?.employmentContractUrl || "";
//             let slaUrl = placementRecord.compliance?.slaUrl || "";
//             let qualUrl = learner.documents?.qualification || "";
//             let affidavitUrl = learner.documents?.affidavit || "";
//             let smeAgreUrl = placementRecord.compliance?.smeAgreementUrl || "";
//             let dueDilUrl = placementRecord.compliance?.dueDiligenceUrl || "";
//             let bankUrl = learner.documents?.bankLetter || "";

//             const learnerUserDoc = (useStore.getState() as any).users?.find((u: any) => u.id === learner.authUid) || {};
//             const arraysToScan = [...(learner.uploadedDocuments || []), ...((p as any).uploadedDocuments || []), ...(learnerUserDoc?.uploadedDocuments || [])];
//             arraysToScan.forEach((doc: any) => {
//                 const docId = String(doc.id || "").toLowerCase();
//                 const name = String(doc.name || "").toLowerCase();
//                 if (!idUrl && (docId === "id" || name.includes("id") || name.includes("identity") || name.includes("passport"))) idUrl = doc.url;
//                 if (!wblpaUrl && (docId === "wblpa" || docId === "contract" || name.includes("contract") || name.includes("wblpa") || name.includes("agreement"))) wblpaUrl = doc.url;
//                 if (!empContractUrl && (docId === "emp_contract" || name.includes("employment"))) empContractUrl = doc.url;
//                 if (!slaUrl && (docId === "sla" || name.includes("sla"))) slaUrl = doc.url;
//                 if (!qualUrl && (docId === "qualification" || name.includes("qualification") || name.includes("certificate"))) qualUrl = doc.url;
//                 if (!affidavitUrl && (docId === "affidavit" || name.includes("affidavit"))) affidavitUrl = doc.url;
//                 if (!smeAgreUrl && (docId === "sme_agreement" || name.includes("host") || name.includes("sme"))) smeAgreUrl = doc.url;
//                 if (!dueDilUrl && (docId === "due_diligence" || name.includes("diligence"))) dueDilUrl = doc.url;
//                 if (!bankUrl && (docId === "bank" || name.includes("bank"))) bankUrl = doc.url;
//             });

//             const hasMentorAssigned = !!(p.assignedMentorName || placementRecord.mentorId || mentor.id);
//             const complianceItems: EnrichedPlacement["complianceItems"] = [
//                 { key: 'idDoc', label: 'Certified ID Document', isComplete: !!idUrl, isRequired: true, url: idUrl, actionType: 'upload', dbTarget: 'learner' },
//                 { key: 'wblpa', label: 'WBLPA Contract', isComplete: !!wblpaUrl, isRequired: true, url: wblpaUrl, actionType: 'upload', dbTarget: 'placement' },
//                 { key: 'empContract', label: 'Employment Contract', isComplete: !!empContractUrl, isRequired: true, url: empContractUrl, actionType: 'upload', dbTarget: 'placement' },
//                 { key: 'mentor', label: 'Workplace Mentor Assigned', isComplete: hasMentorAssigned, isRequired: true, actionType: 'assign', dbTarget: 'placement' },
//                 { key: 'sla', label: 'Service Level Agreement (SLA)', isComplete: !!slaUrl, isRequired: false, url: slaUrl, actionType: 'upload', dbTarget: 'placement' },
//                 { key: 'qualification', label: 'Highest Qualification', isComplete: !!qualUrl, isRequired: false, url: qualUrl, actionType: 'upload', dbTarget: 'learner' },
//                 { key: 'affidavit', label: 'Sworn Affidavit', isComplete: !!affidavitUrl, isRequired: false, url: affidavitUrl, actionType: 'upload', dbTarget: 'learner' },
//                 { key: 'smeAgreement', label: 'Host Company Agreement', isComplete: !!smeAgreUrl, isRequired: false, url: smeAgreUrl, actionType: 'upload', dbTarget: 'placement' },
//                 { key: 'dueDiligence', label: 'SME Due Diligence Report', isComplete: !!dueDilUrl, isRequired: false, url: dueDilUrl, actionType: 'upload', dbTarget: 'placement' },
//                 { key: 'bankLetter', label: 'Bank Confirmation Letter', isComplete: !!bankUrl, isRequired: false, url: bankUrl, actionType: 'upload', dbTarget: 'learner' }
//             ];

//             const requiredItems = complianceItems.filter(i => i.isRequired);
//             const completedRequiredCount = requiredItems.filter(i => i.isComplete).length;
//             const complianceScore = Math.round((completedRequiredCount / requiredItems.length) * 100);

//          return {
//                 ...p,
//                 placementType: placementRecord.placementType || "QCTO Workplace Module",
//                 bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || "Uncategorized",
//                 compliance: {
//                     isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === "boolean" ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
//                     wblpaAgreementUrl: wblpaUrl, employmentContractUrl: empContractUrl, slaUrl: slaUrl, smeAgreementUrl: smeAgreUrl, dueDiligenceUrl: dueDilUrl
//                 },
//                 complianceScore,
//                 complianceItems,
                
//                 employerName: company.name, 

//                 learnerName: learner.fullName || "Unknown Learner",
//                 idNumber: learner.idNumber || "—",
//                 equityGroup: equity,
//                 isFemale,
//                 isYouth,
//                 hasDisability,
//                 mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
//                 hasMentor: hasMentorAssigned,
//                 isEtiEligible,
//                 etiMonthlyValue,
//                 complianceSchema: placementRecord.complianceSchema,
//                 evidenceMap: placementRecord.evidenceMap,
//                 projectedStipendSpend: wage * verifiedTimeline,
//                 s12hAllowanceTotal,
//                 attendancePercentage,
//                 approvedWpHours,
//                 pendingWpHours,
//                 rejectedWpHours,
//                 draftWpHours,
//                 currentMonthApprovedDays,
//                 expectedWorkingDaysThisMonth,
//                 currentMonthEarnedStipend
//             };
//         }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
//     }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs, saHolidays]);

//     useEffect(() => {
//         if (drawerPlacement) {
//             const updatedMatch = enrichedPlacements.find(x => x.id === drawerPlacement.id);
//             if (updatedMatch) setDrawerPlacement(updatedMatch);
//         }
//     }, [enrichedPlacements]);

//     const complianceMetrics = useMemo<ComplianceMetricsData>(() => {
//         let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
//         let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
//         let totalFemale = 0, totalMale = 0, absorbedFemale = 0, absorbedMale = 0;
//         let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
//         let mentorLoad: Record<string, number> = {};

//         enrichedPlacements.forEach(p => {
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

//     const formatCurrency = (val?: number | string | null) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
//     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

//     const displayedPlacements = useMemo(() => {
//         return enrichedPlacements.filter(p => {
//             const sLower = p.status.toLowerCase();
//             if (activeTab === "action_required" && p.complianceScore === 100) return false;
//             if (activeTab === "active" && !sLower.includes("active") && !sLower.includes("pending") && !sLower.includes("interview")) return false;
//             if (activeTab === "history" && !sLower.includes("complete") && !sLower.includes("terminate") && !sLower.includes("absorb")) return false;
//             if (searchQuery) {
//                 const q = searchQuery.toLowerCase();
//                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
//             }
//             return true;
//         });
//     }, [enrichedPlacements, activeTab, searchQuery]);

//     const handleExportExcel = () => {
//         const data = displayedPlacements.map(p => ({
//             "Learner Name": p.learnerName, "ID Number": p.idNumber, "Race (EE Code)": p.equityGroup,
//             Gender: p.isFemale ? "Female" : "Male", "Placement Type": p.placementType,
//             "Monthly Stipend": Number(p.stipendAmount || 0).toFixed(2),
//             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${Number(p.etiMonthlyValue).toFixed(2)}/mo)` : "No",
//             "Compliance Score": `${p.complianceScore}%`,
//             "Start Date": p.startDate ? moment(p.startDate).format("YYYY-MM-DD") : "—",
//             "Expected End Date": p.endDate ? moment(p.endDate).format("YYYY-MM-DD") : "—",
//             "Assigned Mentor": p.mentorName, "Operational Status": p.status.toUpperCase(),
//         }));
//         if (data.length === 0) return;
//         const worksheet = XLSX.utils.json_to_sheet(data);
//         const workbook = XLSX.utils.book_new();
//         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
//         XLSX.writeFile(workbook, `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.xlsx`);
//         setShowExportMenu(false);
//     };

//     const handleExportCSV = () => {
//         const data = displayedPlacements.map(p => ({
//             "Learner Name": p.learnerName, "ID Number": p.idNumber, "Placement Type": p.placementType,
//             "Compliance Score": `${p.complianceScore}%`, "Operational Status": p.status.toUpperCase(),
//         }));
//         if (data.length === 0) return;
//         const headers = Object.keys(data[0]);
//         const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(","));
//         const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
//         const link = document.createElement("a");
//         link.href = URL.createObjectURL(blob);
//         link.setAttribute("download", `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`);
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//         setShowExportMenu(false);
//     };

//     const handleTriggerBulkExport = async () => {
//         if (displayedPlacements.length === 0) return;
//         setIsRequestingBulk(true);
//         setShowExportMenu(false);
//         try {
//             const fns = getFunctions();
//             const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");
//             const payloadPlacements = displayedPlacements.map(p => ({ learnerId: p.learnerId, placementId: p.id, learnerName: p.learnerName, idNumber: p.idNumber, mentorName: p.mentorName }));
//             const response = await requestBulkAuditPacks({ companyId: company.id, companyName: company.name, placements: payloadPlacements });
//             const data = response.data as { success: boolean, jobId: string };
//             if (data.success && data.jobId) setBulkJobId(data.jobId);
//         } catch (error) {
//             console.error("Failed to start bulk export:", error);
//             alert("Failed to start bulk export process. Check console for details.");
//         } finally {
//             setIsRequestingBulk(false);
//         }
//     };

//     useEffect(() => {
//         if (!bulkJobId) return;
//         const unsubscribe = onSnapshot(doc(db, "compliance_jobs", bulkJobId), (docSnap) => {
//             if (docSnap.exists()) {
//                 const data = docSnap.data() as any;
//                 setBulkJobStatus({ status: data.status, completedTasks: data.completedTasks || 0, totalTasks: data.totalTasks || 0, downloadUrl: data.downloadUrl || null });
//                 if (data.status === "complete" && data.downloadUrl && !hasAutoDownloaded) {
//                     setHasAutoDownloaded(true);
//                     const link = document.createElement("a");
//                     link.href = data.downloadUrl;
//                     link.target = "_blank";
//                     link.download = "Audit_Pack.zip";
//                     document.body.appendChild(link);
//                     link.click();
//                     document.body.removeChild(link);
//                 }
//             }
//         });
//         return () => unsubscribe();
//     }, [bulkJobId, hasAutoDownloaded]);

//     return (
//         <div className="cdp-layout">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
//             {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}
//             {drawerPlacement && (
//                 <PlacementDetailsDrawer placement={drawerPlacement} companyName={company.name} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setDrawerPlacement(null)} onOpenEti={setEtiBreakdownLearner} onOpenLogs={setAuditLearner} onEditPlacement={p => setEditingPlacement(p)} />
//             )}
//             {editingPlacement && (
//                 <EditPlacementModal placement={editingPlacement} mentors={companyMentors} cohorts={[]} learners={learners} onClose={() => setEditingPlacement(null)} onSaved={() => { }} />
//             )}

//             <main className="cdp-main">
//                 <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
//                     <div className="cdp-header__left">
//                         <button className="cdp-header__back" onClick={onBack} style={{ borderRadius: 0 }}>
//                             <ChevronLeft size={14} /> Back to Partners
//                         </button>
//                         <div className="cdp-header__eyebrow"><Briefcase size={12} /> Host Company Profile</div>
//                         <h1 className="cdp-header__title">{company.name}</h1>
//                         <p className="cdp-header__sub">
//                             <MapPin size={12} className="cdp-header__sub-icon" /> {company.physicalAddress}
//                             <span className="cdp-header__status cdp-header__status--active" style={{ borderRadius: 0 }}>{activeCount} Active Interns</span>
//                         </p>
//                     </div>
//                     <div className="cdp-header__right">
//                         <button className="cdp-btn cdp-btn--outline" style={{ borderRadius: 0 }} onClick={fetchDeepComplianceData} disabled={isComplianceLoading}>
//                             <RefreshCw size={13} className={isComplianceLoading ? 'spin' : ''} /> Sync Database
//                         </button>
//                     </div>
//                 </header>

//                 <div className="cdp-content">
//                     <div className="cdp-stat-row">
//                         <div className="cdp-stat-card cdp-stat-card--blue">
//                             <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
//                             <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Interns</span></div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--green">
//                             <div className="cdp-stat-card__icon"><Award size={20} /></div>
//                             <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{completedCount}</span><span className="cdp-stat-card__label">Completed Programs</span></div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--amber">
//                             <div className="cdp-stat-card__icon"><FileText size={20} /></div>
//                             <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit" }}>{missingContracts}</span><span className="cdp-stat-card__label">Missing Contracts</span></div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--grey">
//                             <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
//                             <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? "var(--mlab-red)" : "inherit" }}>{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Terminated</span></div>
//                         </div>
//                     </div>

//                     <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />

//                     <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
//                         <button className={`lfm-tab ${activeTab === "active" ? "active" : ""}`} onClick={() => setActiveTab("active")}>
//                             <Users size={16} /> Active Interns <span className="lfm-tab__badge">{activeCount}</span>
//                         </button>
//                         <button className={`lfm-tab ${activeTab === "action_required" ? "active" : ""}`} onClick={() => setActiveTab("action_required")}>
//                             <AlertTriangle size={16} /> Action Required <span className="lfm-tab__badge" style={{ background: activeTab === "action_required" ? '#fee2e2' : 'var(--mlab-bg)', color: activeTab === "action_required" ? 'var(--mlab-red)' : 'var(--mlab-grey)' }}>{nonCompliantCount}</span>
//                         </button>
//                         <button className={`lfm-tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>
//                             <History size={16} /> History <span className="lfm-tab__badge">{completedCount + droppedCount}</span>
//                         </button>
//                         <button className={`lfm-tab ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
//                             <Briefcase size={16} /> All Records <span className="lfm-tab__badge">{enrichedPlacements.length}</span>
//                         </button>
//                     </div>

//                     <div style={{ border: '1px solid var(--mlab-border)', background: 'var(--mlab-white)', borderRadius: 0 }}>
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title"><Users size={16} /> Placement Ledger</h2>
//                             <BulkStipendUploader placements={displayedPlacements} saHolidays={saHolidays} onSuccess={() => { fetchDeepComplianceData(); }} />
//                         </div>

//                         {bulkJobStatus && (
//                             <div style={{ margin: "1rem 1.5rem 0", background: "#f0f9ff", border: "1px solid #bae6fd", marginBottom: 16, borderRadius: 0, padding: "16px", display: "flex", flexDirection: "column", gap: "8px", position: "relative" }} className="animate-fade-in">
//                                 <button onClick={() => { setBulkJobId(null); setBulkJobStatus(null); setHasAutoDownloaded(false); }} style={{ position: "absolute", top: "0px", right: "0px", background: "none", border: "none", cursor: "pointer", color: "var(--mlab-grey)" }}><X size={16} /></button>
//                                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: "24px" }}>
//                                     <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--mlab-blue)", fontWeight: 700, fontSize: "0.85rem" }}>
//                                         {bulkJobStatus.status === "processing" || bulkJobStatus.status === "zipping" ? <Loader2 size={16} className="wm-spin" /> : <Archive size={16} color="#16a34a" />}
//                                         {bulkJobStatus.status === "processing" ? "Compiling Bulk Audit Packs..." : bulkJobStatus.status === "zipping" ? "Merging Cloud Stream..." : bulkJobStatus.status === "failed" ? "Job Failed" : "Download Ready!"}
//                                     </div>
//                                     <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>{bulkJobStatus.completedTasks} / {bulkJobStatus.totalTasks} Processed</div>
//                                 </div>
//                                 <div style={{ width: "100%", background: "#e0f2fe", height: "10px", borderRadius: 0, overflow: "hidden" }}>
//                                     <div style={{ width: `${bulkJobStatus.totalTasks > 0 ? (bulkJobStatus.completedTasks / bulkJobStatus.totalTasks) * 100 : 0}%`, background: bulkJobStatus.status === "complete" ? "#16a34a" : bulkJobStatus.status === "failed" ? "#dc2626" : "var(--mlab-blue)", height: "100%", transition: "width 0.3s ease-out" }} />
//                                 </div>
//                                 {bulkJobStatus.status === "complete" && (
//                                     bulkJobStatus.downloadUrl ? (
//                                         <a href={bulkJobStatus.downloadUrl} target="_blank" rel="noreferrer" style={{ background: "#16a34a", color: "white", padding: "8px", borderRadius: 0, textDecoration: "none", fontSize: "0.8rem", fontWeight: 700, textAlign: "center", marginTop: "8px", display: "inline-block" }}>Click here to download the ZIP file</a>
//                                     ) : (
//                                         <div style={{ color: "#d97706", fontSize: "0.8rem", fontWeight: 600, marginTop: "8px", textAlign: "center" }}>Waiting for secure download link from server...</div>
//                                     )
//                                 )}
//                             </div>
//                         )}

//                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
//                             <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
//                                 <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
//                                 <input type="text" className="lfm-input" placeholder="Search ledger..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '36px', borderRadius: 0 }} />
//                             </div>
//                             <div style={{ position: 'relative' }} ref={menuRef}>
//                                 <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={displayedPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: 'var(--mlab-white)', fontSize: '0.8rem', padding: '6px 12px', borderRadius: 0, opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? "not-allowed" : "pointer" }}>
//                                     <DownloadCloud size={14} /> Export
//                                 </button>
//                                 {showExportMenu && displayedPlacements.length > 0 && (
//                                     <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '220px', overflow: 'hidden' }} className="animate-fade-in">
//                                         <button type="button" onClick={handleExportCSV} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--mlab-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download Data as CSV</button>
//                                         <button type="button" onClick={handleExportExcel} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--mlab-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download Data as Excel</button>
//                                         <button type="button" onClick={handleTriggerBulkExport} disabled={isRequestingBulk || !!bulkJobId} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'var(--mlab-bg)', border: 'none', cursor: (isRequestingBulk || !!bulkJobId) ? "not-allowed" : "pointer", display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 600, opacity: (isRequestingBulk || !!bulkJobId) ? 0.5 : 1 }}>
//                                             <Archive size={14} color="#073f4e" /> {isRequestingBulk ? "Starting Job..." : "Generate Bulk SETA Pack (.zip)"}
//                                         </button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         <div className="lfm-body" style={{ padding: 0 }}>
//                             <div className="mlab-table-wrap">
//                                 {isComplianceLoading && <div style={{ padding: "1rem", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} className="wm-spin" /> Verifying deep compliance logs...</div>}
//                                 <table className="mlab-table" style={{ margin: 0 }}>
//                                     <thead style={{ background: 'var(--mlab-light-blue)' }}>
//                                         <tr>
//                                             <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Learner Profile</th>
//                                             <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Placement Scope</th>
//                                             <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Assigned Mentor</th>
//                                             <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Status</th>
//                                             <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Compliance Progress</th>
//                                             <th style={{ textAlign: 'right', color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Actions</th>
//                                         </tr>
//                                     </thead>
//                                     <tbody>
//                                         {displayedPlacements.length > 0 ? (
//                                             displayedPlacements.map(p => (
//                                                 <tr key={p.id}>
//                                                     <td>
//                                                         <div className="cdp-learner-cell">
//                                                             <div className="cdp-learner-avatar" style={{ borderRadius: 0, background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)' }}>{p.learnerName.charAt(0)}</div>
//                                                             <div className="cdp-learner-cell__info">
//                                                                 <span className="cdp-learner-cell__name" style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>{p.learnerName}</span>
//                                                                 <span className="cdp-learner-cell__id" style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{p.idNumber}</span>
//                                                             </div>
//                                                         </div>
//                                                     </td>
//                                                     <td>
//                                                         <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 500 }}>{formatDate(p.startDate)} <span style={{ color: "var(--mlab-grey)", margin: "0 4px" }}>→</span> {formatDate(p.endDate)}</div>
//                                                         <div style={{ fontSize: "0.75rem", color: "var(--mlab-grey)", marginTop: "2px" }}>{p.placementType}</div>
//                                                     </td>
//                                                     <td>
//                                                         <div style={{ fontSize: "0.8rem", color: p.hasMentor ? "var(--mlab-midnight)" : "var(--mlab-red)", fontWeight: p.hasMentor ? 500 : 700, display: "flex", alignItems: "center", gap: "4px" }}>
//                                                             {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> Unassigned</>}
//                                                         </div>
//                                                     </td>
//                                                     <td>
//                                                         <span className={`cdp-status-badge ${p.status.toLowerCase().includes("active") ? "cdp-status-badge--active" : p.status.toLowerCase().includes("terminate") ? "cdp-status-badge--dropped" : ""}`} style={p.status.toLowerCase().includes("pending") ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a", borderRadius: 0 } : p.status.toLowerCase().includes("complete") || p.status.toLowerCase().includes("absorb") ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 0 } : { borderRadius: 0 }}>
//                                                             {p.status.replace("_", " ")}
//                                                         </span>
//                                                     </td>
//                                                     <td>
//                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
//                                                             <span style={{ fontSize: '0.85rem', fontWeight: 700, color: p.complianceScore === 100 ? '#16a34a' : '#d97706' }}>{p.complianceScore}%</span>
//                                                             <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>{p.complianceScore === 100 ? 'Audit Ready' : 'Incomplete'}</span>
//                                                         </div>
//                                                         <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: 0, overflow: 'hidden' }}>
//                                                             <div style={{ height: '100%', width: `${p.complianceScore}%`, background: p.complianceScore === 100 ? '#16a34a' : '#f59e0b', transition: 'width 0.3s ease-out' }} />
//                                                         </div>
//                                                     </td>
//                                                     <td style={{ textAlign: "right" }}>
//                                                         <button type="button" onClick={() => setDrawerPlacement(p)} className="lfm-btn lfm-btn--ghost" style={{ borderRadius: 0, padding: '6px 12px', fontSize: '0.7rem' }}>
//                                                             Review <ChevronRight size={14} />
//                                                         </button>
//                                                     </td>
//                                                 </tr>
//                                             ))
//                                         ) : (
//                                             <tr>
//                                                 <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                                     <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
//                                                     <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No placement records match your current filters.</p>
//                                                 </td>
//                                             </tr>
//                                         )}
//                                     </tbody>
//                                 </table>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             </main>
//         </div>
//     );
// };


// // // src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

// // import React, { useMemo, useState, useRef, useEffect } from "react";
// // import { createPortal } from "react-dom";
// // import { collection, query, where, getDocs, doc, onSnapshot, updateDoc, writeBatch } from "firebase/firestore";
// // import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
// // import { db, storage } from "../../../../lib/firebase";
// // import {
// //     ArrowLeft, MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
// //     ShieldCheck, ChevronRight, Activity, RefreshCw, UploadCloud, ChevronDown, ChevronUp, Archive,
// //     CheckSquare, Square, Edit, Link as LinkIcon, Save
// // } from "lucide-react";
// // import moment from "moment";
// // import * as XLSX from "xlsx";

// // // Modularized components
// // import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
// // import { LogbookAuditModal } from "./LogbookAuditModal";
// // import { StipendDisbursementModal } from "./StipendDisbursementModal";
// // import { BulkStipendUploader } from "./BulkStipendUploader";

// // import type { DashboardLearner, Employer, PlacementContract } from "../../../../types";
// // import { useStore, type StaffMember } from "../../../../store/useStore";
// // import { getFunctions, httpsCallable } from "firebase/functions";
// // import { EvidenceExportModal } from "../../PlacementsDashboard/EvidenceExportModal";
// // import { ToastContainer, useToast } from "../../../common/Toast/Toast";

// // export interface CompanyInsightsViewProps {
// //     company: Employer;
// //     onBack: () => void;
// // }

// // export interface EnrichedPlacement extends PlacementContract {
// //     placementType: string;
// //     bbbeeSpendCategory: string;
// //     compliance: {
// //         isAgreementFullyExecuted: boolean;
// //         wblpaAgreementUrl?: string;
// //         employmentContractUrl?: string;
// //         slaUrl?: string;
// //         smeAgreementUrl?: string;
// //         dueDiligenceUrl?: string;
// //     };
// //     complianceScore: number;
// //     complianceItems: {
// //         key: string;
// //         label: string;
// //         isComplete: boolean;
// //         isRequired: boolean;
// //         url?: string;
// //         actionType: 'upload' | 'assign' | 'none';
// //         dbTarget: 'learner' | 'placement';
// //     }[];
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
// //     draftWpHours: number;
// //     rejectedWpHours: number;
// //     currentMonthApprovedDays: number;
// //     expectedWorkingDaysThisMonth: number;
// //     currentMonthEarnedStipend: number;
// // }

// // interface PlacementStats {
// //     activeCount: number;
// //     completedCount: number;
// //     droppedCount: number;
// //     missingContracts: number;
// //     nonCompliantCount: number;
// // }

// // interface ComplianceMetricsData {
// //     transformationPercentage: number;
// //     disabilityPercentage: number;
// //     disabilityCount: number;
// //     youthPercentage: number;
// //     youthCount: number;
// //     etiYieldPercentage: number;
// //     monthlyETITotal: number;
// //     annualizedETIEstimate: number;
// //     absorptionRate: number;
// //     totalProjectedSpend: number;
// //     totalS12hProjected: number;
// //     totalFemale: number;
// //     totalMale: number;
// //     absorbedFemale: number;
// //     absorbedMale: number;
// //     raceCounts: { African: number; Coloured: number; Indian: number; White: number; Other: number };
// //     overloadedMentors: number;
// // }

// // const getSAWorkingDaysInMonth = (year: number, month: number, holidays: string[]) => {
// //     const start = moment([year, month, 1]);
// //     const end = moment(start).endOf('month');
// //     let days = 0;

// //     let current = start.clone();
// //     while (current.isSameOrBefore(end)) {
// //         if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
// //             if (!holidays.includes(current.format('YYYY-MM-DD'))) {
// //                 days++;
// //             }
// //         }
// //         current.add(1, 'days');
// //     }
// //     return days;
// // };

// // /* ─── ETI BREAKDOWN MODAL ─── */
// // const EtiBreakdownModal: React.FC<{ learner: EnrichedPlacement; onClose: () => void; }> = ({ learner, onClose }) => {
// //     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
// //     const wage = Number(learner.stipendAmount) || 0;
// //     const eti = Number(learner.etiMonthlyValue) || 0;
// //     const annualEti = eti * 12;

// //     let mathString = "";
// //     if (wage < 2000) mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
// //     else if (wage >= 2000 && wage <= 4499) mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// //     else if (wage >= 4500 && wage < 6500) mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
// //     else mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center" }}>
// //             <div className="wm-modal" onClick={(e) => e.stopPropagation()} style={{ width: "480px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
// //                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
// //                     <div>
// //                         <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#16a34a", fontWeight: 800, fontSize: "1.1rem" }}><Landmark size={20} /> SARS ETI Tax Rebate Audit</div>
// //                         <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>Calculated for {learner.learnerName}</div>
// //                     </div>
// //                     <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
// //                 </div>

// //                 <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
// //                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
// //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Database Stipend Value:</span>
// //                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(wage)}</strong>
// //                     </div>
// //                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
// //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Official ETI Calculation:</span>
// //                         <strong style={{ fontSize: "1.1rem", color: "#16a34a" }}>{formatCurrency(eti)} /mo</strong>
// //                     </div>
// //                     <div style={{ display: "flex", justifyContent: "space-between" }}>
// //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Annualized Projection:</span>
// //                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(annualEti)}</strong>
// //                     </div>
// //                 </div>

// //                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>Mathematical Formula Check:</div>
// //                 <div style={{ background: "#e0e7ff", padding: "12px", borderRadius: "6px", fontSize: "0.85rem", color: "#3730a3", fontFamily: "monospace", fontWeight: 600, marginBottom: "1rem" }}>{mathString}</div>

// //                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>The SARS Rules (Ages 18-29):</div>
// //                 <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem", color: "#475569", display: "flex", flexDirection: "column", gap: "6px" }}>
// //                     <li style={{ color: wage > 0 && wage < 2000 ? "#16a34a" : "inherit", fontWeight: wage > 0 && wage < 2000 ? 700 : 400 }}>If stipend is R0 – R1,999: ETI = 75% of stipend</li>
// //                     <li style={{ color: wage >= 2000 && wage <= 4499 ? "#16a34a" : "inherit", fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400 }}>If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)</li>
// //                     <li style={{ color: wage >= 4500 && wage < 6500 ? "#16a34a" : "inherit", fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400 }}>If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend - R4,500])</li>
// //                     <li style={{ color: wage >= 6500 ? "#dc2626" : "inherit", fontWeight: wage >= 6500 ? 700 : 400 }}>If stipend is R6,500 or more: ETI = R0</li>
// //                 </ul>

// //                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: "100%", marginTop: "1.5rem", justifyContent: "center" }}>Close Audit Trail</button>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // /* ─── EDIT PLACEMENT MODAL ───────────────────────────────────────────────────── */
// // const EditPlacementModal: React.FC<{
// //     placement: any;
// //     mentors: StaffMember[];
// //     cohorts: any[];
// //     learners: DashboardLearner[];
// //     onClose: () => void;
// //     onSaved: () => void;
// // }> = ({ placement, mentors, cohorts, learners, onClose, onSaved }) => {
// //     const toast = useToast();
// //     const [saving, setSaving] = useState(false);
// //     const [uploadingDoc, setUploadingDoc] = useState(false);
// //     const [forceShowAllProgrammes, setForceShowAllProgrammes] = useState(false);

// //     const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
// //     const [selectedFile, setSelectedFile] = useState<File | null>(null);

// //     const [form, setForm] = useState({
// //         mentorId: placement.mentorId || '',
// //         cohortId: placement.cohortId || '',
// //         placementType: placement.placementType || 'QCTO Workplace Module',
// //         bbbeeSpendCategory: placement.compliance?.bbbeeSpendCategory || placement.bbbeeSpendCategory || 'Category C',
// //         stipendAmount: placement.stipendAmount || '',
// //         startDate: placement.startDate || '',
// //         endDate: placement.endDate || '',
// //         isAgreementFullyExecuted: placement.compliance?.isAgreementFullyExecuted || false,
// //         wblpaAgreementUrl: placement.compliance?.wblpaAgreementUrl || ''
// //     });

// //     const isQcto = form.placementType === 'QCTO Workplace Module';
// //     const targetLearner = learners.find(l => l.id === placement.learnerId);

// //     const displayedCohorts = useMemo(() => {
// //         if (forceShowAllProgrammes) return cohorts;

// //         const relevantIds = new Set<string>();
// //         if (targetLearner?.cohortId) relevantIds.add(targetLearner.cohortId);
// //         if (placement.cohortId) relevantIds.add(placement.cohortId);

// //         if (relevantIds.size === 0) return cohorts;

// //         const matchingTracks = cohorts.filter(c => relevantIds.has(c.id));
// //         if (matchingTracks.length === 0) return cohorts;

// //         return matchingTracks;
// //     }, [cohorts, targetLearner, placement.cohortId, forceShowAllProgrammes]);

// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         setSaving(true);
// //         try {
// //             let finalDocumentUrl = form.wblpaAgreementUrl;

// //             if (uploadMode === 'upload' && selectedFile) {
// //                 setUploadingDoc(true);
// //                 const fileRef = ref(storage, `placements/${placement.id}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// //                 await uploadBytes(fileRef, selectedFile);
// //                 finalDocumentUrl = await getDownloadURL(fileRef);
// //                 setUploadingDoc(false);
// //             }

// //             const batch = writeBatch(db);
// //             const placementRef = doc(db, 'placements', placement.id);
// //             const learnerRef = doc(db, 'learners', placement.learnerId);

// //             batch.update(placementRef, {
// //                 mentorId: form.mentorId,
// //                 cohortId: isQcto ? form.cohortId : '',
// //                 placementType: form.placementType,
// //                 stipendAmount: Number(form.stipendAmount) || 0,
// //                 startDate: form.startDate,
// //                 endDate: form.endDate,
// //                 compliance: {
// //                     ...(placement.compliance || {}),
// //                     bbbeeSpendCategory: form.bbbeeSpendCategory,
// //                     isAgreementFullyExecuted: form.isAgreementFullyExecuted,
// //                     wblpaAgreementUrl: finalDocumentUrl
// //                 },
// //                 updatedAt: new Date().toISOString()
// //             });

// //             batch.update(learnerRef, { mentorId: form.mentorId, updatedAt: new Date().toISOString() });

// //             await batch.commit();
// //             toast.success("Placement details updated successfully!");

// //             setTimeout(() => {
// //                 onSaved();
// //                 onClose();
// //             }, 1200);

// //         } catch (err: any) {
// //             console.error(err);
// //             toast.error(err.message || "Failed to update placement details.");
// //             setUploadingDoc(false);
// //             setSaving(false);
// //         }
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// //                 <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Edit size={20} /></div>
// //                     <div>
// //                         <h2 className="wm-modal__title">Edit Placement Details</h2>
// //                         <p className="wm-modal__subtitle">Updating {placement.learnerName} at {placement.employerName}</p>
// //                     </div>
// //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// //                 </div>

// //                 <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
// //                     <div className="wm-modal__body">
// //                         <div className="wm-form-section">
// //                             <div className="wm-form-section__label"><Briefcase size={12} /> Logistics & Timeline</div>
// //                             <div className="wm-form-grid">
// //                                 <div className="wm-form-group wm-form-group--full">
// //                                     <label className="wm-form-label">Placement Type</label>
// //                                     <select className="wm-form-input" value={form.placementType} onChange={e => {
// //                                         setForm(p => ({ ...p, placementType: e.target.value }));
// //                                         if (e.target.value !== 'QCTO Workplace Module') {
// //                                             setForm(p => ({ ...p, cohortId: '' }));
// //                                         }
// //                                     }} disabled={saving}>
// //                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
// //                                         <option value="Alumni Internship">Alumni Internship</option>
// //                                         <option value="External WIL">External WIL</option>
// //                                     </select>
// //                                 </div>

// //                                 {isQcto && (
// //                                     <div className="wm-form-group wm-form-group--full animate-fade-in">
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// //                                             <label className="wm-form-label" style={{ margin: 0 }}>Programme / Qualification Linked <span className="wm-form-required">*</span></label>
// //                                             <button type="button" onClick={() => setForceShowAllProgrammes(!forceShowAllProgrammes)} style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
// //                                                 {forceShowAllProgrammes ? "Restrict Track" : "Extend Registry"}
// //                                             </button>
// //                                         </div>
// //                                         <select className="wm-form-input" required={isQcto} value={form.cohortId} onChange={e => setForm(p => ({ ...p, cohortId: e.target.value }))} disabled={saving}>
// //                                             <option value="">-- Needs Programme Mapping --</option>
// //                                             {displayedCohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
// //                                         </select>
// //                                     </div>
// //                                 )}

// //                                 <div className="wm-form-group wm-form-group--full">
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}><label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label></div>
// //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))} disabled={saving}>
// //                                         <option value="">-- No Mentor Assigned --</option>
// //                                         {mentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// //                                     </select>
// //                                 </div>

// //                                 <div className="wm-form-group wm-form-group--full">
// //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// //                                     <div style={{ position: 'relative' }}>
// //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// //                                         <input className="wm-form-input" type="number" min="0" style={{ paddingLeft: '28px' }} placeholder="e.g. 4500" value={form.stipendAmount} onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))} disabled={saving} />
// //                                     </div>
// //                                 </div>

// //                                 <div className="wm-form-group"><label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label><input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} /></div>
// //                                 <div className="wm-form-group"><label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label><input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} /></div>
// //                             </div>
// //                         </div>

// //                         <div className="wm-form-section" style={{ marginTop: '1.5rem' }}>
// //                             <div className="wm-form-section__label"><ShieldAlert size={12} /> Compliance & Contracts</div>
// //                             <div className="wm-form-grid">
// //                                 <div className="wm-form-group wm-form-group--full">
// //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
// //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// //                                         <option value="Category D">Category D (Apprenticeship)</option>
// //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// //                                     </select>
// //                                 </div>

// //                                 <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
// //                                         <input type="checkbox" checked={form.isAgreementFullyExecuted} onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }} disabled={saving} />
// //                                         WBLPA Signed & On File
// //                                     </label>
// //                                     <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', marginTop: '12px' }}>
// //                                         <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
// //                                             <button type="button" onClick={() => setUploadMode('link')} style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }} disabled={saving}><LinkIcon size={12} /> Paste Link</button>
// //                                             <button type="button" onClick={() => setUploadMode('upload')} style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }} disabled={saving}><UploadCloud size={12} /> Upload File</button>
// //                                         </div>

// //                                         <div style={{ padding: '12px' }}>
// //                                             {uploadMode === 'link' ? (
// //                                                 <><label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link</label><input className="wm-form-input" type="url" placeholder="https://drive.google.com/file/d/..." value={form.wblpaAgreementUrl} onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))} disabled={saving} /></>
// //                                             ) : (
// //                                                 <><label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract</label><input className="wm-form-input" type="file" accept=".pdf,image/*,.doc,.docx" onChange={e => { if (e.target.files && e.target.files.length > 0) setSelectedFile(e.target.files[0]); }} style={{ padding: '6px' }} disabled={saving} /></>
// //                                             )}
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>

// //                     </div>
// //                     <div className="wm-modal__footer">
// //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// //                             {saving ? <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Updating…'}</> : <><Save size={13} /> Save Changes</>}
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };


// // /* ─── PLACEMENT DETAILS SLIDE-OVER DRAWER ─── */
// // interface PlacementDetailsDrawerProps {
// //     placement: EnrichedPlacement;
// //     companyName: string;
// //     workplaceLogs: any[];
// //     saHolidays: string[];
// //     onClose: () => void;
// //     onOpenEti: (p: EnrichedPlacement) => void;
// //     onOpenLogs: (p: EnrichedPlacement) => void;
// //     onEditPlacement: (p: EnrichedPlacement) => void;
// // }

// // export const PlacementDetailsDrawer: React.FC<PlacementDetailsDrawerProps> = ({ placement, companyName, workplaceLogs, saHolidays, onClose, onOpenEti, onOpenLogs, onEditPlacement }) => {

// //     const toast = useToast();
// //     const [isExportModalOpen, setIsExportModalOpen] = useState(false);
// //     const [isGeneratingPack, setIsGeneratingPack] = useState(false);
// //     const [auditPackError, setAuditPackError] = useState<string | null>(null);
// //     const [showDisbursementModal, setShowDisbursementModal] = useState(false);
// //     const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);

// //     const [disbursements, setDisbursements] = useState<any[]>([]);
// //     const [isLoadingLedger, setIsLoadingLedger] = useState(true);
// //     const [isLedgerExpanded, setIsLedgerExpanded] = useState(false);

// //     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
// //     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

// //     useEffect(() => {
// //         const fetchLedger = async () => {
// //             setIsLoadingLedger(true);
// //             try {
// //                 const snap = await getDocs(collection(db, `placements/${placement.id}/disbursements`));
// //                 const list = snap.docs.map(doc => doc.data()).sort((a, b) => String(b.monthYear).localeCompare(String(a.monthYear)));
// //                 setDisbursements(list);
// //             } catch (error) {
// //                 console.error("Failed to load ledger", error);
// //             } finally {
// //                 setIsLoadingLedger(false);
// //             }
// //         };
// //         fetchLedger();
// //     }, [placement.id, showDisbursementModal]);

// //     // 🚀 DYNAMIC COMPLIANCE UPLOAD HANDLER
// //     const handleUploadComplianceDoc = async (e: React.ChangeEvent<HTMLInputElement>, item: any) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;

// //         setUploadingDocKey(item.key);
// //         try {
// //             const fileRef = ref(storage, `compliance/${placement.id}/${item.key}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// //             await uploadBytes(fileRef, file);
// //             const downloadUrl = await getDownloadURL(fileRef);

// //             if (item.dbTarget === 'learner') {
// //                 await updateDoc(doc(db, 'learners', placement.learnerId), {
// //                     [`documents.${item.key}`]: downloadUrl,
// //                     idDocumentUrl: item.key === 'idDoc' ? downloadUrl : undefined,
// //                     updatedAt: new Date().toISOString()
// //                 });
// //             } else {
// //                 let docField = `${item.key}Url`; // e.g., slaUrl, dueDiligenceUrl
// //                 if (item.key === 'wblpa') docField = 'wblpaAgreementUrl';
// //                 if (item.key === 'empContract') docField = 'employmentContractUrl';

// //                 await updateDoc(doc(db, 'placements', placement.id), {
// //                     [`compliance.${docField}`]: downloadUrl,
// //                     updatedAt: new Date().toISOString()
// //                 });
// //             }
// //             toast.success(`${item.label} uploaded successfully!`);
// //         } catch (err: any) {
// //             toast.error("Failed to upload document.");
// //         } finally {
// //             setUploadingDocKey(null);
// //             if (e.target) e.target.value = ''; // Reset input
// //         }
// //     };

// //     const handleDownloadAuditPack = async (selectedFolders: string[]) => {
// //         setIsGeneratingPack(true);
// //         setAuditPackError(null);
// //         try {
// //             const functions = getFunctions();
// //             const generateSetaAuditPack = httpsCallable(functions, "generateSetaAuditPack");

// //             const response = await generateSetaAuditPack({
// //                 learnerId: placement.learnerId, placementId: placement.id, employerName: companyName,
// //                 learnerName: placement.learnerName, idNumber: placement.idNumber, mentorName: placement.mentorName,
// //                 selectedFolders: selectedFolders
// //             });

// //             const data = response.data as { success: boolean; url: string };
// //             if (data.success && data.url) {
// //                 window.location.href = data.url;
// //                 setIsExportModalOpen(false); // Close modal on success
// //             }
// //             else setAuditPackError("Server failed to supply a valid download path.");
// //         } catch (error: any) {
// //             setAuditPackError(error.message || "Failed to generate the compliance audit pack.");
// //         } finally {
// //             setIsGeneratingPack(false);
// //         }
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99990, display: "flex", justifyContent: "flex-end", position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.3)", backdropFilter: "blur(2px)" }}>

// //             {isExportModalOpen && (
// //                 <EvidenceExportModal
// //                     learnerName={placement.learnerName}
// //                     onClose={() => setIsExportModalOpen(false)}
// //                     onGenerate={handleDownloadAuditPack}
// //                     isGenerating={isGeneratingPack}
// //                 />
// //             )}

// //             <div onClick={(e) => e.stopPropagation()} style={{ width: "450px", maxWidth: "100%", height: "100%", background: "#f8fafc", display: "flex", flexDirection: "column", boxShadow: "-10px 0 25px rgba(0,0,0,0.1)", animation: "slideInRight 0.3s ease-out" }}>
// //                 <div style={{ padding: "1.5rem", background: "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
// //                     <div>
// //                         <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
// //                             <div className="cdp-learner-avatar">{placement.learnerName.charAt(0)}</div>
// //                             <div><h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>{placement.learnerName}</h3><p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>ID: {placement.idNumber}</p></div>
// //                         </div>
// //                     </div>
// //                     <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}><X size={20} /></button>
// //                 </div>

// //                 <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

// //                     {/* 🚀 EXPANDED COMPLIANCE VAULT */}
// //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// //                         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
// //                             <h4 style={{ margin: 0, fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} /> Compliance Vault</h4>
// //                             <div style={{ textAlign: 'right' }}>
// //                                 <span style={{ fontSize: "1.1rem", fontWeight: 800, color: placement.complianceScore === 100 ? "#16a34a" : "var(--mlab-amber)", fontFamily: "var(--font-heading)" }}>{placement.complianceScore}%</span>
// //                                 <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Core Met</div>
// //                             </div>
// //                         </div>

// //                         <div style={{ width: "100%", background: "#e2e8f0", height: "6px", borderRadius: "3px", overflow: "hidden", marginBottom: "1rem" }}>
// //                             <div style={{ width: `${placement.complianceScore}%`, background: placement.complianceScore === 100 ? "#16a34a" : "var(--mlab-amber)", height: "100%", transition: "width 0.3s ease-out" }} />
// //                         </div>

// //                         <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem" }}>
// //                             {placement.complianceItems.map((item) => (
// //                                 <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '6px' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
// //                                         {item.isComplete ? <CheckSquare size={14} color="#16a34a" /> : <Square size={14} color="#94a3b8" />}
// //                                         {item.label}
// //                                         {!item.isRequired && <span style={{ fontSize: '0.6rem', background: '#e2e8f0', color: '#64748b', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Optional</span>}
// //                                     </div>
// //                                     <div>
// //                                         {item.isComplete ? (
// //                                             item.url ? (
// //                                                 <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                     <FileText size={12} /> View
// //                                                 </a>
// //                                             ) : (
// //                                                 <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>VERIFIED</span>
// //                                             )
// //                                         ) : (
// //                                             item.actionType === 'upload' ? (
// //                                                 <label style={{ fontSize: '0.7rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, cursor: uploadingDocKey === item.key ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                     {uploadingDocKey === item.key ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
// //                                                     {uploadingDocKey === item.key ? 'Uploading...' : 'Upload'}
// //                                                     <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => handleUploadComplianceDoc(e, item)} disabled={uploadingDocKey === item.key} />
// //                                                 </label>
// //                                             ) : item.actionType === 'assign' ? (
// //                                                 <button onClick={() => onEditPlacement(placement)} style={{ fontSize: '0.7rem', color: 'white', background: '#d97706', border: 'none', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                     <User size={10} /> Assign
// //                                                 </button>
// //                                             ) : null
// //                                         )}
// //                                     </div>
// //                                 </div>
// //                             ))}
// //                         </div>

// //                         {placement.complianceScore === 100 && (
// //                             <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s" }}>
// //                                 {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
// //                                 {isGeneratingPack ? "Compiling Cloud Zip..." : "Download SETA Audit Pack (.zip)"}
// //                             </button>
// //                         )}
// //                         {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
// //                     </div>

// //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Briefcase size={14} /> Placement Trajectory</h4>
// //                         <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
// //                             <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Start Date</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.startDate)}</div></div>
// //                             <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Expected End</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.endDate)}</div></div>
// //                             <div style={{ gridColumn: "1 / -1", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}><div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "4px" }}>Workplace Supervisor</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: placement.hasMentor ? "var(--mlab-midnight)" : "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>{placement.hasMentor ? <><User size={14} /> {placement.mentorName}</> : <><AlertTriangle size={14} /> Unassigned</>}</div></div>
// //                         </div>
// //                     </div>

// //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Landmark size={14} /> Finance & Rebates</h4>
// //                         <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
// //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>Monthly Base Stipend</span><span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-midnight)", textDecoration: placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) ? 'line-through' : 'none' }}>{formatCurrency(placement.stipendAmount)} /mo</span></div>
// //                             {placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) && (
// //                                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: "6px" }}>
// //                                     <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700 }}>EARNED THIS MONTH</span><span style={{ fontSize: "0.65rem", color: "#991b1b" }}>Based on {placement.currentMonthApprovedDays} / {placement.expectedWorkingDaysThisMonth} expected days</span></div>
// //                                     <span style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626" }}>{formatCurrency(placement.currentMonthEarnedStipend)}</span>
// //                                 </div>
// //                             )}
// //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>SARS ETI Claim</span>{placement.isEtiEligible && placement.etiMonthlyValue > 0 ? (<button onClick={() => onOpenEti(placement)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", color: "#166534", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Coins size={12} /> {formatCurrency(placement.etiMonthlyValue)} /mo</button>) : (<span style={{ fontSize: "0.75rem", color: "#64748b", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>Ineligible</span>)}</div>

// //                             {/* ACCORDION HISTORY LEDGER */}
// //                             <div style={{ paddingTop: "10px", borderTop: "1px solid #f1f5f9", marginTop: "4px" }}>
// //                                 <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Historical Payments Ledger</div>
// //                                 {isLoadingLedger ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}><Loader2 size={12} className="wm-spin" /> Loading records...</div>) : disbursements.length === 0 ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>No disbursements logged yet.</div>) : (
// //                                     <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
// //                                         <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
// //                                             <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{disbursements[0].monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{disbursements[0].bankReference}</div></div>
// //                                             <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(disbursements[0].netPayment)}</div>{disbursements[0].payslipEftUrl ? (<a href={disbursements[0].payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
// //                                         </div>
// //                                         {disbursements.length > 1 && (
// //                                             <div style={{ marginTop: "4px" }}>
// //                                                 <button onClick={() => setIsLedgerExpanded(!isLedgerExpanded)} style={{ width: "100%", background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}>
// //                                                     <span>{isLedgerExpanded ? "Hide older payments" : `View ${disbursements.length - 1} older payment(s)`}</span>{isLedgerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
// //                                                 </button>
// //                                                 {isLedgerExpanded && (
// //                                                     <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
// //                                                         {disbursements.slice(1).map((d, i) => (
// //                                                             <div key={i} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.85 }}>
// //                                                                 <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{d.monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{d.bankReference}</div></div>
// //                                                                 <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(d.netPayment)}</div>{d.payslipEftUrl ? (<a href={d.payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
// //                                                             </div>
// //                                                         ))}
// //                                                     </div>
// //                                                 )}
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Activity size={14} /> Audit & Logbook Activity</h4>
// //                         <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
// //                             <div>
// //                                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#475569", marginBottom: "6px", fontWeight: 600 }}>
// //                                     <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> Campus Attendance Ratio</span>
// //                                     <span style={{ color: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#d97706" : "#dc2626" }}>{placement.attendancePercentage}%</span>
// //                                 </div>
// //                                 <div style={{ width: "100%", background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
// //                                     <div style={{ width: `${placement.attendancePercentage}%`, background: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#f59e0b" : "#ef4444", height: "100%" }} />
// //                                 </div>
// //                             </div>
// //                             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
// //                                 <div><div style={{ fontSize: "0.7rem", color: "#16a34a", fontWeight: 700 }}>✅ MENTOR APPROVED HOURS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#15803d" }}>{Number(placement.approvedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// //                                 <div><div style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 700 }}>⏳ WAITING FOR MENTOR</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#b45309" }}>{Number(placement.pendingWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// //                                 <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#dc2626", fontWeight: 700 }}>❌ REJECTED LOGS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c2410c" }}>{Number(placement.rejectedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// //                                 <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>📝 DRAFT (NOT SUBMITTED)</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#475569" }}>{Number(placement.draftWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// //                             </div>
// //                             <button onClick={() => onOpenLogs(placement)} style={{ width: "100%", padding: "10px", background: "white", border: "1px solid var(--mlab-blue)", color: "var(--mlab-blue)", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.background = "#eff6ff"; }} onMouseOut={(e) => { e.currentTarget.style.background = "white"; }}>
// //                                 <FileText size={16} /> Open Complete Logbook Audit
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </div>

// //             {showDisbursementModal && (
// //                 <StipendDisbursementModal placement={placement} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setShowDisbursementModal(false)} />
// //             )}
// //         </div>,
// //         document.body
// //     );
// // };

// // export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
// //     const { learners, staff } = useStore() as any;
// //     const placements = useStore((s) => (s as unknown as { placements?: PlacementContract[] }).placements) || [];

// //     const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
// //     const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
// //     const [workplaceLogs, setWorkplaceLogs] = useState<any[]>([]);
// //     const [isComplianceLoading, setIsComplianceLoading] = useState(true);
// //     const [saHolidays, setSaHolidays] = useState<string[]>([]);

// //     const [activeTab, setActiveTab] = useState<"active" | "history" | "all" | "action_required">("active");
// //     const [searchQuery, setSearchQuery] = useState("");
// //     const [showExportMenu, setShowExportMenu] = useState(false);

// //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);
// //     const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(null);
// //     const [drawerPlacement, setDrawerPlacement] = useState<EnrichedPlacement | null>(null);
// //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);

// //     const menuRef = useRef<HTMLDivElement>(null);

// //     const [bulkJobId, setBulkJobId] = useState<string | null>(null);
// //     const [bulkJobStatus, setBulkJobStatus] = useState<{ status: string, completedTasks: number, totalTasks: number, downloadUrl?: string | null } | null>(null);
// //     const [isRequestingBulk, setIsRequestingBulk] = useState(false);

// //     // 🚀 NEW STATE to bypass popup blockers for auto-download
// //     const [hasAutoDownloaded, setHasAutoDownloaded] = useState(false);

// //     const companyPlacements = useMemo(() => placements.filter((p) => p.employerId === company.id), [placements, company.id]);
// //     const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

// //     const placementLearnerIdsStr = useMemo(() => companyPlacements.map(p => p.learnerId).sort().join(","), [companyPlacements]);

// //     useEffect(() => {
// //         const fetchHolidays = async () => {
// //             try {
// //                 const year = new Date().getFullYear();
// //                 const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`);
// //                 if (res.ok) {
// //                     const data = await res.json();
// //                     setSaHolidays(data.map((h: any) => h.date));
// //                 }
// //             } catch (error) {
// //                 console.error("Error fetching SA holidays:", error);
// //             }
// //         };
// //         fetchHolidays();
// //     }, []);

// //     const fetchDeepComplianceData = async () => {
// //         setIsComplianceLoading(true);
// //         try {
// //             const logsUnifiedMap = new Map<string, any>();
// //             const wpQueryEmp = query(collection(db, "workplace_logs"), where("employerId", "==", company.id));
// //             const wpSnapEmp = await getDocs(wpQueryEmp);
// //             wpSnapEmp.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));

// //             const relevantLearnerIds = new Set<string>();
// //             companyPlacements.forEach(p => {
// //                 if (p.learnerId) relevantLearnerIds.add(String(p.learnerId).trim());
// //                 const l = learners.find((x: any) => x.id === p.learnerId);
// //                 if (l && l.idNumber && String(l.idNumber).trim() !== "") {
// //                     relevantLearnerIds.add(String(l.idNumber).trim());
// //                 }
// //             });

// //             const placementStudentPool = Array.from(relevantLearnerIds).filter(Boolean);

// //             for (let i = 0; i < placementStudentPool.length; i += 10) {
// //                 const studentChunk = placementStudentPool.slice(i, i + 10);
// //                 if (studentChunk.length === 0) continue;
// //                 const wpQueryLearner = query(collection(db, "workplace_logs"), where("learnerId", "in", studentChunk));
// //                 const wpSnapLearner = await getDocs(wpQueryLearner);
// //                 wpSnapLearner.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));
// //             }

// //             const compiledWpLogs = Array.from(logsUnifiedMap.values());
// //             setWorkplaceLogs(compiledWpLogs);

// //             const relevantCohortIds = new Set<string>();
// //             companyPlacements.forEach((p) => { if (p.cohortId) relevantCohortIds.add(p.cohortId); });
// //             const cohortIdsArray = Array.from(relevantCohortIds);
// //             let fetchedAttLogs: any[] = [];
// //             let fetchedAttRecords: any[] = [];
// //             for (const cId of cohortIdsArray) {
// //                 if (!cId) continue;
// //                 const logsQ = query(collection(db, "attendance_logs"), where("cohortId", "==", cId));
// //                 const recsQ = query(collection(db, "attendance_records"), where("cohortId", "==", cId));
// //                 const [lSnap, rSnap] = await Promise.all([getDocs(logsQ), getDocs(recsQ)]);
// //                 fetchedAttLogs.push(...lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
// //                 fetchedAttRecords.push(...rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
// //             }

// //             setAttendanceLogs(fetchedAttLogs);
// //             setAttendanceRecords(fetchedAttRecords);
// //         } catch (error) {
// //             console.error("Deep compliance fetch error:", error);
// //         } finally {
// //             setIsComplianceLoading(false);
// //         }
// //     };

// //     useEffect(() => {
// //         if (placementLearnerIdsStr.length > 0) {
// //             fetchDeepComplianceData();
// //         } else {
// //             setIsComplianceLoading(false);
// //         }
// //         // eslint-disable-next-line react-hooks/exhaustive-deps
// //     }, [company.id, placementLearnerIdsStr]);

// //     const { activeCount, completedCount, droppedCount, missingContracts, nonCompliantCount } = useMemo<PlacementStats>(() => {
// //         let active = 0, completed = 0, dropped = 0, missing = 0, nonCompliant = 0;
// //         companyPlacements.forEach((p) => {
// //             const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean } };
// //             const statusLower = p.status.toLowerCase();
// //             if (statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview")) {
// //                 active++;
// //                 const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
// //                 const hasMentor = !!(p.assignedMentorName || (placementRecord as any).mentorId);
// //                 if (!isFullySigned) missing++;
// //                 if (!isFullySigned || !hasMentor) nonCompliant++;
// //             }
// //             if (p.status === "Completed" || p.status === "absorbed_permanently") completed++;
// //             if (p.status === "Terminated") dropped++;
// //         });
// //         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing, nonCompliantCount: nonCompliant };
// //     }, [companyPlacements]);

// //     // 🚀 MASTER ENRICHMENT & COMPLIANCE SCORING ENGINE
// //     const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
// //         return companyPlacements
// //             .map((p) => {
// //                 const learner = learners.find((l: any) => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);

// //                 const placementRecord = p as PlacementContract & {
// //                     placementType?: string;
// //                     compliance?: {
// //                         isAgreementFullyExecuted?: boolean;
// //                         wblpaAgreementUrl?: string;
// //                         employmentContractUrl?: string;
// //                         slaUrl?: string;
// //                         smeAgreementUrl?: string;
// //                         dueDiligenceUrl?: string;
// //                         bbbeeSpendCategory?: string;
// //                     };
// //                     bbbeeSpendCategory?: string;
// //                     mentorId?: string;
// //                     cohortId?: string;
// //                 };

// //                 const mentor = companyMentors.find((m: any) => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);
// //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string; disabilityStatus?: string; };
// //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || "Unknown";
// //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || "No Disability";

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
// //                 } else if ((learner.demographics as any)?.genderCode === "F" || (extendedLearner as any).gender === "Female") {
// //                     isFemale = true;
// //                 }

// //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), "months", true);
// //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

// //                 let etiMonthlyValue = 0;
// //                 const wage = Number(p.stipendAmount) || 0;
// //                 if (isEtiEligible && wage > 0) {
// //                     if (wage < 2000) etiMonthlyValue = wage * 0.75;
// //                     else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
// //                     else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - 0.75 * (wage - 4500), 0);
// //                 }

// //                 const hasDisability = disability !== "No Disability" && disability !== "None" && disability !== "N/A" && disability !== "No" && disability !== "N";
// //                 const s12hAllowanceTotal = hasDisability ? 120000 : 80000;
// //                 const cohortId = learner.cohortId || placementRecord.cohortId;
// //                 const safeLearnerId = String(p.learnerId || "").trim().toLowerCase();
// //                 const safeIdNumber = String(learner.idNumber || "").trim().toLowerCase();

// //                 let attendancePercentage = 0;
// //                 if (cohortId) {
// //                     const learnerAttRecords = attendanceRecords.filter((r: any) => r.cohortId === cohortId && (String(r.learnerId).trim().toLowerCase() === safeLearnerId || String(r.learnerId).trim().toLowerCase() === safeIdNumber));
// //                     const learnerAttPresent = learnerAttRecords.filter((r: any) => r.status === "Present" || r.status === "Partial").length;
// //                     const cohortTotalSessions = attendanceLogs.filter((l: any) => l.cohortId === cohortId).length;
// //                     attendancePercentage = cohortTotalSessions > 0 ? Math.round((learnerAttPresent / cohortTotalSessions) * 100) : 0;
// //                 }

// //                 const learnerWpLogs = workplaceLogs.filter((l: any) => {
// //                     const logLId = String(l.learnerId || "").trim().toLowerCase();
// //                     return (safeLearnerId !== "" && logLId === safeLearnerId) || (safeIdNumber !== "" && logLId === safeIdNumber);
// //                 });

// //                 const approvedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// //                     const stat = String(l.status || "").trim().toLowerCase();
// //                     return stat === "approved" ? sum + (Number(l.totalHours) || 0) : sum;
// //                 }, 0);

// //                 const pendingWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// //                     const stat = String(l.status || "").trim().toLowerCase();
// //                     return (stat === "pending_mentor_approval" || stat === "pending") ? sum + (Number(l.totalHours) || 0) : sum;
// //                 }, 0);

// //                 const rejectedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// //                     const stat = String(l.status || "").trim().toLowerCase();
// //                     return stat === "rejected" ? sum + (Number(l.totalHours) || 0) : sum;
// //                 }, 0);

// //                 const draftWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// //                     const stat = String(l.status || "").trim().toLowerCase();
// //                     return (stat === "draft" || stat === "") ? sum + (Number(l.totalHours) || 0) : sum;
// //                 }, 0);

// //                 const currentYear = moment().year();
// //                 const currentMonth = moment().month();
// //                 const currentMonthStr = moment().format('YYYY-MM');
// //                 const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, saHolidays);

// //                 const currentMonthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr));
// //                 const approvedDatesThisMonth = new Set(
// //                     currentMonthWpLogs.filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved").map((l: any) => l.dateString)
// //                 );
// //                 const currentMonthApprovedDays = approvedDatesThisMonth.size;

// //                 let currentMonthEarnedStipend = wage;
// //                 if (expectedWorkingDaysThisMonth > 0 && wage > 0) {
// //                     const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * wage;
// //                     currentMonthEarnedStipend = Math.round(Math.min(calculatedProRata, wage) * 100) / 100;
// //                 }

// //                 // 🚀 COMPLIANCE RESOLUTION LOGIC
// //                 let idUrl = learner.documents?.idDocument || learner.idUrl || learner.idDocumentUrl || "";
// //                 let wblpaUrl = placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl || "";
// //                 let empContractUrl = placementRecord.compliance?.employmentContractUrl || "";
// //                 let slaUrl = placementRecord.compliance?.slaUrl || "";
// //                 let qualUrl = learner.documents?.qualification || "";
// //                 let affidavitUrl = learner.documents?.affidavit || "";
// //                 let smeAgreUrl = placementRecord.compliance?.smeAgreementUrl || "";
// //                 let dueDilUrl = placementRecord.compliance?.dueDiligenceUrl || "";
// //                 let bankUrl = learner.documents?.bankLetter || "";

// //                 // Deep scan uploadedDocuments
// //                 const learnerUserDoc = (useStore.getState() as any).users?.find((u: any) => u.id === learner.authUid) || {};
// //                 const arraysToScan = [...(learner.uploadedDocuments || []), ...((p as any).uploadedDocuments || []), ...(learnerUserDoc?.uploadedDocuments || [])];

// //                 arraysToScan.forEach((doc: any) => {
// //                     const docId = String(doc.id || "").toLowerCase();
// //                     const name = String(doc.name || "").toLowerCase();
// //                     if (!idUrl && (docId === "id" || name.includes("id") || name.includes("identity") || name.includes("passport"))) idUrl = doc.url;
// //                     if (!wblpaUrl && (docId === "wblpa" || docId === "contract" || name.includes("contract") || name.includes("wblpa") || name.includes("agreement"))) wblpaUrl = doc.url;
// //                     if (!empContractUrl && (docId === "emp_contract" || name.includes("employment"))) empContractUrl = doc.url;
// //                     if (!slaUrl && (docId === "sla" || name.includes("sla"))) slaUrl = doc.url;
// //                     if (!qualUrl && (docId === "qualification" || name.includes("qualification") || name.includes("certificate"))) qualUrl = doc.url;
// //                     if (!affidavitUrl && (docId === "affidavit" || name.includes("affidavit"))) affidavitUrl = doc.url;
// //                     if (!smeAgreUrl && (docId === "sme_agreement" || name.includes("host") || name.includes("sme"))) smeAgreUrl = doc.url;
// //                     if (!dueDilUrl && (docId === "due_diligence" || name.includes("diligence"))) dueDilUrl = doc.url;
// //                     if (!bankUrl && (docId === "bank" || name.includes("bank"))) bankUrl = doc.url;
// //                 });

// //                 const hasMentorAssigned = !!(p.assignedMentorName || placementRecord.mentorId || mentor.id);

// //                 const complianceItems: EnrichedPlacement["complianceItems"] = [
// //                     { key: 'idDoc', label: 'Certified ID Document', isComplete: !!idUrl, isRequired: true, url: idUrl, actionType: 'upload', dbTarget: 'learner' },
// //                     { key: 'wblpa', label: 'WBLPA Contract', isComplete: !!wblpaUrl, isRequired: true, url: wblpaUrl, actionType: 'upload', dbTarget: 'placement' },
// //                     { key: 'empContract', label: 'Employment Contract', isComplete: !!empContractUrl, isRequired: true, url: empContractUrl, actionType: 'upload', dbTarget: 'placement' },
// //                     { key: 'mentor', label: 'Workplace Mentor Assigned', isComplete: hasMentorAssigned, isRequired: true, actionType: 'assign', dbTarget: 'placement' },
// //                     { key: 'sla', label: 'Service Level Agreement (SLA)', isComplete: !!slaUrl, isRequired: false, url: slaUrl, actionType: 'upload', dbTarget: 'placement' },
// //                     { key: 'qualification', label: 'Highest Qualification', isComplete: !!qualUrl, isRequired: false, url: qualUrl, actionType: 'upload', dbTarget: 'learner' },
// //                     { key: 'affidavit', label: 'Sworn Affidavit', isComplete: !!affidavitUrl, isRequired: false, url: affidavitUrl, actionType: 'upload', dbTarget: 'learner' },
// //                     { key: 'smeAgreement', label: 'Host Company Agreement', isComplete: !!smeAgreUrl, isRequired: false, url: smeAgreUrl, actionType: 'upload', dbTarget: 'placement' },
// //                     { key: 'dueDiligence', label: 'SME Due Diligence Report', isComplete: !!dueDilUrl, isRequired: false, url: dueDilUrl, actionType: 'upload', dbTarget: 'placement' },
// //                     { key: 'bankLetter', label: 'Bank Confirmation Letter', isComplete: !!bankUrl, isRequired: false, url: bankUrl, actionType: 'upload', dbTarget: 'learner' }
// //                 ];

// //                 const requiredItems = complianceItems.filter(i => i.isRequired);
// //                 const completedRequiredCount = requiredItems.filter(i => i.isComplete).length;
// //                 const complianceScore = Math.round((completedRequiredCount / requiredItems.length) * 100);

// //                 return {
// //                     ...p,
// //                     placementType: placementRecord.placementType || "QCTO Workplace Module",
// //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || "Uncategorized",
// //                     compliance: {
// //                         isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === "boolean" ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
// //                         wblpaAgreementUrl: wblpaUrl,
// //                         employmentContractUrl: empContractUrl,
// //                         slaUrl: slaUrl,
// //                         smeAgreementUrl: smeAgreUrl,
// //                         dueDiligenceUrl: dueDilUrl
// //                     },
// //                     complianceScore,
// //                     complianceItems,
// //                     learnerName: learner.fullName || "Unknown Learner",
// //                     idNumber: learner.idNumber || "—",
// //                     equityGroup: equity,
// //                     isFemale,
// //                     isYouth,
// //                     hasDisability,
// //                     mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
// //                     hasMentor: hasMentorAssigned,
// //                     isEtiEligible,
// //                     etiMonthlyValue,
// //                     projectedStipendSpend: wage * verifiedTimeline,
// //                     s12hAllowanceTotal,
// //                     attendancePercentage,
// //                     approvedWpHours,
// //                     pendingWpHours,
// //                     rejectedWpHours,
// //                     draftWpHours,
// //                     currentMonthApprovedDays,
// //                     expectedWorkingDaysThisMonth,
// //                     currentMonthEarnedStipend
// //                 };
// //             })
// //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// //     }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs, saHolidays]);

// //     useEffect(() => {
// //         if (drawerPlacement) {
// //             const updatedMatch = enrichedPlacements.find(x => x.id === drawerPlacement.id);
// //             if (updatedMatch) setDrawerPlacement(updatedMatch);
// //         }
// //     }, [enrichedPlacements]);

// //     const complianceMetrics = useMemo<ComplianceMetricsData>(() => {
// //         let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
// //         let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
// //         let totalFemale = 0, totalMale = 0, absorbedFemale = 0, absorbedMale = 0;
// //         let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
// //         let mentorLoad: Record<string, number> = {};

// //         enrichedPlacements.forEach((p) => {
// //             const statusLower = p.status.toLowerCase();
// //             const isLive = statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview");
// //             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes("absorb") || (p as any).isAbsorbed;

// //             if (isLive && p.hasMentor) mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;

// //             const eq = p.equityGroup.trim().toLowerCase();
// //             if (eq.includes("african") || eq === "black" || eq === "ba") { raceCounts.African++; blackACI++; if (p.isFemale) blackFemale++; }
// //             else if (eq.includes("coloured") || eq === "bc") { raceCounts.Coloured++; blackACI++; if (p.isFemale) blackFemale++; }
// //             else if (eq.includes("indian") || eq === "bi") { raceCounts.Indian++; blackACI++; if (p.isFemale) blackFemale++; }
// //             else if (eq.includes("white") || eq === "w") { raceCounts.White++; }
// //             else { raceCounts.Other++; }

// //             if (p.isFemale) totalFemale++; else totalMale++;
// //             if (p.isYouth) youthCount++;
// //             if (isAbsorbed) { if (p.isFemale) absorbedFemale++; else absorbedMale++; }
// //             if (p.hasDisability) disabilityCount++;

// //             if (isLive) {
// //                 if (p.etiMonthlyValue > 0) activeEtiYielders++;
// //                 monthlyEtiSum += p.etiMonthlyValue;
// //                 accumulatedSpend += p.projectedStipendSpend;
// //             }

// //             if (isLive || statusLower.includes("complete") || statusLower.includes("absorb")) {
// //                 totalS12hProjected += p.s12hAllowanceTotal;
// //             }
// //         });

// //         const overloadedMentors = Object.entries(mentorLoad).filter(([_, count]) => count > 4).length;

// //         return {
// //             transformationPercentage: enrichedPlacements.length > 0 ? Math.round((blackACI / enrichedPlacements.length) * 100) : 0,
// //             disabilityPercentage: enrichedPlacements.length > 0 ? Math.round((disabilityCount / enrichedPlacements.length) * 100) : 0,
// //             disabilityCount,
// //             youthPercentage: enrichedPlacements.length > 0 ? Math.round((youthCount / enrichedPlacements.length) * 100) : 0,
// //             youthCount,
// //             etiYieldPercentage: activeCount > 0 ? Math.round((activeEtiYielders / activeCount) * 100) : 0,
// //             monthlyETITotal: monthlyEtiSum,
// //             annualizedETIEstimate: monthlyEtiSum * 12,
// //             absorptionRate: completedCount > 0 ? Math.round(((absorbedFemale + absorbedMale) / completedCount) * 100) : 0,
// //             totalProjectedSpend: accumulatedSpend,
// //             totalS12hProjected,
// //             totalFemale,
// //             totalMale,
// //             absorbedFemale,
// //             absorbedMale,
// //             raceCounts,
// //             overloadedMentors,
// //         };
// //     }, [enrichedPlacements, activeCount, completedCount]);

// //     const formatCurrency = (val?: number | string | null) =>
// //         new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);

// //     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

// //     const displayedPlacements = useMemo(() => {
// //         return enrichedPlacements.filter((p) => {
// //             const sLower = p.status.toLowerCase();
// //             if (activeTab === "action_required") {
// //                 if (p.complianceScore === 100) return false;
// //             }
// //             if (activeTab === "active" && !sLower.includes("active") && !sLower.includes("pending") && !sLower.includes("interview")) return false;
// //             if (activeTab === "history" && !sLower.includes("complete") && !sLower.includes("terminate") && !sLower.includes("absorb")) return false;
// //             if (searchQuery) {
// //                 const q = searchQuery.toLowerCase();
// //                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
// //             }
// //             return true;
// //         });
// //     }, [enrichedPlacements, activeTab, searchQuery]);

// //     const handleExportExcel = () => {
// //         const data = displayedPlacements.map((p) => ({
// //             "Learner Name": p.learnerName,
// //             "ID Number": p.idNumber,
// //             "Race (EE Code)": p.equityGroup,
// //             Gender: p.isFemale ? "Female" : "Male",
// //             "Placement Type": p.placementType,
// //             "Monthly Stipend": Number(p.stipendAmount || 0).toFixed(2),
// //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${Number(p.etiMonthlyValue).toFixed(2)}/mo)` : "No",
// //             "Compliance Score": `${p.complianceScore}%`,
// //             "Start Date": p.startDate ? moment(p.startDate).format("YYYY-MM-DD") : "—",
// //             "Expected End Date": p.endDate ? moment(p.endDate).format("YYYY-MM-DD") : "—",
// //             "Assigned Mentor": p.mentorName,
// //             "Operational Status": p.status.toUpperCase(),
// //         }));
// //         if (data.length === 0) return;
// //         const worksheet = XLSX.utils.json_to_sheet(data);
// //         const workbook = XLSX.utils.book_new();
// //         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
// //         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, "_");
// //         XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
// //         setShowExportMenu(false);
// //     };

// //     const handleExportCSV = () => {
// //         const data = displayedPlacements.map((p) => ({
// //             "Learner Name": p.learnerName,
// //             "ID Number": p.idNumber,
// //             "Placement Type": p.placementType,
// //             "Compliance Score": `${p.complianceScore}%`,
// //             "Operational Status": p.status.toUpperCase(),
// //         }));
// //         if (data.length === 0) return;
// //         const headers = Object.keys(data[0]);
// //         const csvRows = data.map((row) => headers.map((header) => `"${(row as Record<string, unknown>)[header]}"`).join(","));
// //         const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
// //         const link = document.createElement("a");
// //         link.href = URL.createObjectURL(blob);
// //         link.setAttribute("download", `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`);
// //         document.body.appendChild(link);
// //         link.click();
// //         document.body.removeChild(link);
// //         setShowExportMenu(false);
// //     };

// //     const handleTriggerBulkExport = async () => {
// //         if (displayedPlacements.length === 0) return;
// //         setIsRequestingBulk(true);
// //         setShowExportMenu(false);
// //         try {
// //             const fns = getFunctions();
// //             const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");
// //             const payloadPlacements = displayedPlacements.map(p => ({
// //                 learnerId: p.learnerId, placementId: p.id, learnerName: p.learnerName, idNumber: p.idNumber, mentorName: p.mentorName
// //             }));
// //             const response = await requestBulkAuditPacks({ companyId: company.id, companyName: company.name, placements: payloadPlacements });
// //             const data = response.data as { success: boolean, jobId: string };
// //             if (data.success && data.jobId) setBulkJobId(data.jobId);
// //         } catch (error) {
// //             console.error("Failed to start bulk export:", error);
// //             alert("Failed to start bulk export process. Check console for details.");
// //         } finally {
// //             setIsRequestingBulk(false);
// //         }
// //     };

// //     // 🚀 UPDATED: FIRESTORE LISTENER FOR LIVE BULK EXPORT PROGRESS
// //     useEffect(() => {
// //         if (!bulkJobId) return;

// //         const unsubscribe = onSnapshot(doc(db, "compliance_jobs", bulkJobId), (docSnap) => {
// //             if (docSnap.exists()) {
// //                 const data = docSnap.data() as any;
// //                 setBulkJobStatus({
// //                     status: data.status,
// //                     completedTasks: data.completedTasks || 0,
// //                     totalTasks: data.totalTasks || 0,
// //                     downloadUrl: data.downloadUrl || null
// //                 });

// //                 // Safely trigger download via invisible link to bypass popup blockers
// //                 if (data.status === "complete" && data.downloadUrl && !hasAutoDownloaded) {
// //                     setHasAutoDownloaded(true);
// //                     const link = document.createElement("a");
// //                     link.href = data.downloadUrl;
// //                     link.target = "_blank";
// //                     link.download = "Audit_Pack.zip";
// //                     document.body.appendChild(link);
// //                     link.click();
// //                     document.body.removeChild(link);
// //                 }
// //             }
// //         });

// //         return () => unsubscribe();
// //     }, [bulkJobId, hasAutoDownloaded]);

// //     const { fetchStaff: syncStaff } = useStore() as any;

// //     return (
// //         <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "2rem" }}>
// //             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
// //             {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}
// //             {drawerPlacement && (
// //                 <PlacementDetailsDrawer
// //                     placement={drawerPlacement}
// //                     companyName={company.name}
// //                     workplaceLogs={workplaceLogs}
// //                     saHolidays={saHolidays}
// //                     onClose={() => setDrawerPlacement(null)}
// //                     onOpenEti={setEtiBreakdownLearner}
// //                     onOpenLogs={setAuditLearner}
// //                     onEditPlacement={(p) => setEditingPlacement(p)}
// //                 />
// //             )}

// //             {editingPlacement && (
// //                 <EditPlacementModal
// //                     placement={editingPlacement}
// //                     mentors={companyMentors}
// //                     cohorts={[]}
// //                     learners={learners}
// //                     onClose={() => setEditingPlacement(null)}
// //                     onSaved={() => { }}
// //                 />
// //             )}

// //             {/* ── BREADCRUMB & HEADER ── */}
// //             <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
// //                 <button onClick={onBack} style={{ background: "white", border: "1px solid var(--mlab-border)", borderRadius: "8px", padding: "8px", cursor: "pointer", color: "var(--mlab-midnight)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "4px" }}>
// //                     <ArrowLeft size={18} />
// //                 </button>
// //                 <div>
// //                     <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Host Company Profile</div>
// //                     <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
// //                         <h1 style={{ margin: 0, fontSize: "1.8rem", fontFamily: "var(--font-heading)", color: "var(--mlab-midnight)", lineHeight: 1.2 }}>{company.name}</h1>
// //                         {isComplianceLoading && <Loader2 size={20} className="wm-spin" color="var(--mlab-blue)" />}
// //                         <button onClick={fetchDeepComplianceData} disabled={isComplianceLoading} style={{ background: "var(--mlab-blue)", color: "white", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", marginLeft: "1rem" }}>
// //                             <RefreshCw size={12} className={isComplianceLoading ? "wm-spin" : ""} /> Sync Database
// //                         </button>
// //                     </div>

// //                     <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", fontSize: "0.85rem", color: "#475569" }}>
// //                         {company.registrationNumber && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Hash size={13} /> {company.registrationNumber}</span>}
// //                         {company.physicalAddress && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={13} /> {company.physicalAddress}</span>}
// //                         {company.contactPerson && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Mail size={13} /> {company.contactEmail}</span>}
// //                     </div>
// //                 </div>
// //             </div>

// //             {complianceMetrics.overloadedMentors > 0 && (
// //                 <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", color: "#991b1b", fontSize: "0.8rem", fontWeight: 600 }}>
// //                     <ShieldAlert size={16} />
// //                     <span><strong>SETA Quality Warning:</strong> {complianceMetrics.overloadedMentors} assigned mentor(s) currently exceed the recommended 1:4 supervisor-to-learner load constraint.</span>
// //                 </div>
// //             )}

// //             <div className="cdp-stat-row">
// //                 <div className="cdp-stat-card cdp-stat-card--blue">
// //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Interns</span></div>
// //                 </div>
// //                 <div className="cdp-stat-card cdp-stat-card--green">
// //                     <div className="cdp-stat-card__icon"><Award size={20} /></div>
// //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{completedCount}</span><span className="cdp-stat-card__label">Completed Programs</span></div>
// //                 </div>
// //                 <div className="cdp-stat-card cdp-stat-card--amber">
// //                     <div className="cdp-stat-card__icon"><FileText size={20} /></div>
// //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit" }}>{missingContracts}</span><span className="cdp-stat-card__label">Missing Contracts</span></div>
// //                 </div>
// //                 <div className="cdp-stat-card cdp-stat-card--grey">
// //                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
// //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? "var(--mlab-red)" : "inherit" }}>{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Terminated</span></div>
// //                 </div>
// //             </div>

// //             <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />

// //             <div className="cdp-panel">
// //                 <div className="vp-card" style={{ marginBottom: 0 }}>
// //                     <div className="vp-card-header" style={{ borderBottom: "none", flexDirection: "row", display: "flex", justifyContent: "space-between", paddingBottom: 0 }}>
// //                         <div className="vp-card-title-group">
// //                             <Users size={18} color="var(--mlab-blue)" />
// //                             <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--mlab-blue)", textTransform: "uppercase" }}>Placement Ledger</h3>
// //                         </div>
// //                         <div>
// //                             <BulkStipendUploader
// //                                 placements={displayedPlacements}
// //                                 saHolidays={saHolidays}
// //                                 onSuccess={() => { fetchDeepComplianceData(); }}
// //                             />
// //                         </div>
// //                     </div>

// //                     {/* 🚀 UPDATED: LIVE PROGRESS BANNER FOR BULK EXPORT */}
// //                     {bulkJobStatus && (
// //                         <div style={{ margin: "1rem 1.5rem 0", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px", position: "relative" }} className="animate-fade-in">

// //                             {/* Close button for the banner */}
// //                             <button onClick={() => { setBulkJobId(null); setBulkJobStatus(null); setHasAutoDownloaded(false); }} style={{ position: "absolute", top: "12px", right: "12px", background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
// //                                 <X size={16} />
// //                             </button>

// //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: "24px" }}>
// //                                 <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--mlab-blue)", fontWeight: 700, fontSize: "0.85rem" }}>
// //                                     {bulkJobStatus.status === "processing" || bulkJobStatus.status === "zipping" ? <Loader2 size={16} className="wm-spin" /> : <Archive size={16} color="#16a34a" />}
// //                                     {bulkJobStatus.status === "processing" ? "Compiling Bulk Audit Packs..." : bulkJobStatus.status === "zipping" ? "Merging Cloud Stream..." : bulkJobStatus.status === "failed" ? "Job Failed" : "Download Ready!"}
// //                                 </div>
// //                                 <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>
// //                                     {bulkJobStatus.completedTasks} / {bulkJobStatus.totalTasks} Processed
// //                                 </div>
// //                             </div>

// //                             <div style={{ width: "100%", background: "#e0f2fe", height: "10px", borderRadius: "5px", overflow: "hidden" }}>
// //                                 <div style={{
// //                                     width: `${bulkJobStatus.totalTasks > 0 ? (bulkJobStatus.completedTasks / bulkJobStatus.totalTasks) * 100 : 0}%`,
// //                                     background: bulkJobStatus.status === "complete" ? "#16a34a" : bulkJobStatus.status === "failed" ? "#dc2626" : "var(--mlab-blue)",
// //                                     height: "100%",
// //                                     transition: "width 0.3s ease-out"
// //                                 }} />
// //                             </div>

// //                             {bulkJobStatus.status === "complete" && (
// //                                 bulkJobStatus.downloadUrl ? (
// //                                     <a href={bulkJobStatus.downloadUrl} target="_blank" rel="noreferrer" style={{ background: "#16a34a", color: "white", padding: "8px", borderRadius: "6px", textDecoration: "none", fontSize: "0.8rem", fontWeight: 700, textAlign: "center", marginTop: "8px", display: "inline-block" }}>
// //                                         Click here to download the ZIP file
// //                                     </a>
// //                                 ) : (
// //                                     <div style={{ color: "#d97706", fontSize: "0.8rem", fontWeight: 600, marginTop: "8px", textAlign: "center" }}>
// //                                         Waiting for secure download link from server...
// //                                     </div>
// //                                 )
// //                             )}
// //                         </div>
// //                     )}

// //                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 1.5rem", borderBottom: "1px solid var(--mlab-border)", marginTop: "1rem", background: "#f8fafc", flexWrap: "wrap", gap: "1rem" }}>
// //                         <div style={{ display: "flex", gap: "1.5rem" }}>
// //                             <button onClick={() => setActiveTab("active")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "active" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "active" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "active" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// //                                 Active Interns <span style={{ background: activeTab === "active" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "active" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{activeCount}</span>
// //                             </button>

// //                             <button onClick={() => setActiveTab("action_required")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "action_required" ? "#b91c1c" : "#64748b", fontWeight: activeTab === "action_required" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "action_required" ? "2px solid #b91c1c" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// //                                 Action Required <span style={{ background: activeTab === "action_required" ? "#fee2e2" : "#f1f5f9", color: activeTab === "action_required" ? "#b91c1c" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{nonCompliantCount}</span>
// //                             </button>

// //                             <button onClick={() => setActiveTab("history")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "history" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "history" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "history" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// //                                 History <span style={{ background: activeTab === "history" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "history" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{completedCount + droppedCount}</span>
// //                             </button>
// //                             <button onClick={() => setActiveTab("all")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "all" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "all" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "all" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// //                                 All Records <span style={{ background: activeTab === "all" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "all" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{enrichedPlacements.length}</span>
// //                             </button>
// //                         </div>

// //                         <div style={{ display: "flex", gap: "8px", paddingBottom: "8px" }}>
// //                             <div style={{ position: "relative", display: "flex", alignItems: "center", background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "0 8px" }}>
// //                                 <Search size={14} color="#64748b" />
// //                                 <input type="text" placeholder="Search ledger..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: "none", padding: "8px", outline: "none", background: "transparent", fontSize: "0.8rem", width: "200px" }} />
// //                                 {searchQuery && <button type="button" onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex" }}><X size={12} /></button>}
// //                             </div>

// //                             <div style={{ position: "relative" }} ref={menuRef}>
// //                                 <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={displayedPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: "white", fontSize: "0.8rem", padding: "6px 12px", opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? "not-allowed" : "pointer" }}>
// //                                     <DownloadCloud size={14} /> Export
// //                                 </button>
// //                                 {showExportMenu && displayedPlacements.length > 0 && (
// //                                     <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 50, minWidth: "220px", overflow: "hidden" }} className="animate-fade-in">
// //                                         <button type="button" onClick={handleExportCSV} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download Data as CSV</button>
// //                                         <button type="button" onClick={handleExportExcel} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download Data as Excel</button>
// //                                         {/* 🚀 NEW BULK EXPORT BUTTON IN THE DROPDOWN */}
// //                                         <button
// //                                             type="button"
// //                                             onClick={handleTriggerBulkExport}
// //                                             disabled={isRequestingBulk || !!bulkJobId}
// //                                             style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "#f8fafc", border: "none", cursor: (isRequestingBulk || !!bulkJobId) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 600, opacity: (isRequestingBulk || !!bulkJobId) ? 0.5 : 1 }}
// //                                         >
// //                                             <Archive size={14} color="#073f4e" />
// //                                             {isRequestingBulk ? "Starting Job..." : "Generate Bulk SETA Pack (.zip)"}
// //                                         </button>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <div className="mlab-table-wrap">
// //                         {isComplianceLoading && <div style={{ padding: "1rem", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} className="wm-spin" /> Verifying deep compliance logs...</div>}

// //                         <table className="mlab-table">
// //                             <colgroup>
// //                                 <col style={{ width: "20%" }} />
// //                                 <col style={{ width: "20%" }} />
// //                                 <col style={{ width: "15%" }} />
// //                                 <col style={{ width: "15%" }} />
// //                                 <col style={{ width: "20%" }} />
// //                                 <col style={{ width: "10%" }} />
// //                             </colgroup>
// //                             <thead>
// //                                 <tr>
// //                                     <th>Learner Profile</th>
// //                                     <th>Placement Scope</th>
// //                                     <th>Assigned Mentor</th>
// //                                     <th>Status</th>
// //                                     <th>Compliance Progress</th>
// //                                     <th style={{ textAlign: "right" }}>Actions</th>
// //                                 </tr>
// //                             </thead>
// //                             <tbody>
// //                                 {displayedPlacements.length > 0 ? (
// //                                     displayedPlacements.map((p) => {
// //                                         return (
// //                                             <tr key={p.id}>
// //                                                 <td>
// //                                                     <div className="cdp-learner-cell">
// //                                                         <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// //                                                         <div className="cdp-learner-cell__info">
// //                                                             <span className="cdp-learner-cell__name">{p.learnerName}</span>
// //                                                             <span className="cdp-learner-cell__id">{p.idNumber}</span>
// //                                                         </div>
// //                                                     </div>
// //                                                 </td>
// //                                                 <td>
// //                                                     <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 500 }}>
// //                                                         {formatDate(p.startDate)} <span style={{ color: "#94a3b8", margin: "0 4px" }}>→</span> {formatDate(p.endDate)}
// //                                                     </div>
// //                                                     <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>{p.placementType}</div>
// //                                                 </td>
// //                                                 <td>
// //                                                     <div style={{ fontSize: "0.8rem", color: p.hasMentor ? "var(--mlab-midnight)" : "#dc2626", fontWeight: p.hasMentor ? 500 : 700, display: "flex", alignItems: "center", gap: "4px" }}>
// //                                                         {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> Unassigned</>}
// //                                                     </div>
// //                                                 </td>
// //                                                 <td>
// //                                                     <span className={`cdp-status-badge ${p.status.toLowerCase().includes("active") ? "cdp-status-badge--active" : p.status.toLowerCase().includes("terminate") ? "cdp-status-badge--dropped" : ""}`} style={p.status.toLowerCase().includes("pending") ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" } : p.status.toLowerCase().includes("complete") || p.status.toLowerCase().includes("absorb") ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } : {}}>
// //                                                         {p.status.replace("_", " ")}
// //                                                     </span>
// //                                                 </td>
// //                                                 <td>
// //                                                     {/* 🚀 NEW: PERCENTAGE COMPLIANCE PROGRESS BAR */}
// //                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
// //                                                         <span style={{ fontSize: '0.85rem', fontWeight: 700, color: p.complianceScore === 100 ? '#16a34a' : '#d97706' }}>{p.complianceScore}%</span>
// //                                                         <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{p.complianceScore === 100 ? 'Audit Ready' : 'Incomplete'}</span>
// //                                                     </div>
// //                                                     <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// //                                                         <div style={{ height: '100%', width: `${p.complianceScore}%`, background: p.complianceScore === 100 ? '#16a34a' : '#f59e0b', transition: 'width 0.3s ease-out' }} />
// //                                                     </div>
// //                                                     {p.complianceScore < 100 && (
// //                                                         <div style={{ fontSize: '0.65rem', color: '#dc2626', marginTop: '4px', fontWeight: 600 }}>
// //                                                             Missing {p.complianceItems.filter(i => i.isRequired && !i.isComplete).length} required item(s)
// //                                                         </div>
// //                                                     )}
// //                                                 </td>
// //                                                 <td style={{ textAlign: "right" }}>
// //                                                     <button
// //                                                         type="button"
// //                                                         onClick={() => setDrawerPlacement(p)}
// //                                                         style={{
// //                                                             background: "white", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
// //                                                             color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px", transition: "all 0.2s"
// //                                                         }}
// //                                                     >
// //                                                         Review <ChevronRight size={14} />
// //                                                     </button>
// //                                                 </td>
// //                                             </tr>
// //                                         );
// //                                     })
// //                                 ) : (
// //                                     <tr>
// //                                         <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
// //                                             {searchQuery ? `No records matched your search query for "${searchQuery}".` : `No placement history matches found for this host company configuration.`}
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

// // // import React, { useMemo, useState, useRef, useEffect } from "react";
// // // import { createPortal } from "react-dom";
// // // import { collection, query, where, getDocs, doc, onSnapshot, updateDoc, writeBatch } from "firebase/firestore";
// // // import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
// // // import { db, storage } from "../../../../lib/firebase";
// // // import {
// // //     ArrowLeft, MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
// // //     ShieldCheck, ChevronRight, Activity, RefreshCw, UploadCloud, ChevronDown, ChevronUp, Archive,
// // //     CheckSquare, Square
// // // } from "lucide-react";
// // // import moment from "moment";
// // // import * as XLSX from "xlsx";

// // // // Modularized components
// // // import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
// // // import { LogbookAuditModal } from "./LogbookAuditModal";
// // // import { StipendDisbursementModal } from "./StipendDisbursementModal";
// // // import { BulkStipendUploader } from "./BulkStipendUploader";

// // // import type { DashboardLearner, Employer, PlacementContract } from "../../../../types";
// // // import { useStore, type StaffMember } from "../../../../store/useStore";
// // // import { getFunctions, httpsCallable } from "firebase/functions";
// // // import { EvidenceExportModal } from "../../PlacementsDashboard/EvidenceExportModal";
// // // import { useToast } from "../../../common/Toast/Toast";
// // // import { EditPlacementModal } from "./EditPlacementModal";

// // // export interface CompanyInsightsViewProps {
// // //     company: Employer;
// // //     onBack: () => void;
// // // }

// // // export interface EnrichedPlacement extends PlacementContract {
// // //     placementType: string;
// // //     bbbeeSpendCategory: string;
// // //     compliance: {
// // //         isAgreementFullyExecuted: boolean;
// // //         wblpaAgreementUrl?: string;
// // //         employmentContractUrl?: string;
// // //         slaUrl?: string;
// // //         smeAgreementUrl?: string;
// // //         dueDiligenceUrl?: string;
// // //     };
// // //     complianceScore: number;
// // //     complianceItems: {
// // //         key: string;
// // //         label: string;
// // //         isComplete: boolean;
// // //         isRequired: boolean;
// // //         url?: string;
// // //         actionType: 'upload' | 'assign' | 'none';
// // //         dbTarget: 'learner' | 'placement';
// // //     }[];
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
// // //     attendancePercentage: number;
// // //     approvedWpHours: number;
// // //     pendingWpHours: number;
// // //     draftWpHours: number;
// // //     rejectedWpHours: number;
// // //     currentMonthApprovedDays: number;
// // //     expectedWorkingDaysThisMonth: number;
// // //     currentMonthEarnedStipend: number;
// // // }

// // // interface PlacementStats {
// // //     activeCount: number;
// // //     completedCount: number;
// // //     droppedCount: number;
// // //     missingContracts: number;
// // //     nonCompliantCount: number;
// // // }

// // // interface ComplianceMetricsData {
// // //     transformationPercentage: number;
// // //     disabilityPercentage: number;
// // //     disabilityCount: number;
// // //     youthPercentage: number;
// // //     youthCount: number;
// // //     etiYieldPercentage: number;
// // //     monthlyETITotal: number;
// // //     annualizedETIEstimate: number;
// // //     absorptionRate: number;
// // //     totalProjectedSpend: number;
// // //     totalS12hProjected: number;
// // //     totalFemale: number;
// // //     totalMale: number;
// // //     absorbedFemale: number;
// // //     absorbedMale: number;
// // //     raceCounts: { African: number; Coloured: number; Indian: number; White: number; Other: number };
// // //     overloadedMentors: number;
// // // }

// // // const getSAWorkingDaysInMonth = (year: number, month: number, holidays: string[]) => {
// // //     const start = moment([year, month, 1]);
// // //     const end = moment(start).endOf('month');
// // //     let days = 0;

// // //     let current = start.clone();
// // //     while (current.isSameOrBefore(end)) {
// // //         if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
// // //             if (!holidays.includes(current.format('YYYY-MM-DD'))) {
// // //                 days++;
// // //             }
// // //         }
// // //         current.add(1, 'days');
// // //     }
// // //     return days;
// // // };

// // // /* ─── ETI BREAKDOWN MODAL ─── */
// // // const EtiBreakdownModal: React.FC<{ learner: EnrichedPlacement; onClose: () => void; }> = ({ learner, onClose }) => {
// // //     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
// // //     const wage = Number(learner.stipendAmount) || 0;
// // //     const eti = Number(learner.etiMonthlyValue) || 0;
// // //     const annualEti = eti * 12;

// // //     let mathString = "";
// // //     if (wage < 2000) mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
// // //     else if (wage >= 2000 && wage <= 4499) mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// // //     else if (wage >= 4500 && wage < 6500) mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
// // //     else mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center" }}>
// // //             <div className="wm-modal" onClick={(e) => e.stopPropagation()} style={{ width: "480px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
// // //                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
// // //                     <div>
// // //                         <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#16a34a", fontWeight: 800, fontSize: "1.1rem" }}><Landmark size={20} /> SARS ETI Tax Rebate Audit</div>
// // //                         <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>Calculated for {learner.learnerName}</div>
// // //                     </div>
// // //                     <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
// // //                 </div>

// // //                 <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
// // //                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
// // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Database Stipend Value:</span>
// // //                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(wage)}</strong>
// // //                     </div>
// // //                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
// // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Official ETI Calculation:</span>
// // //                         <strong style={{ fontSize: "1.1rem", color: "#16a34a" }}>{formatCurrency(eti)} /mo</strong>
// // //                     </div>
// // //                     <div style={{ display: "flex", justifyContent: "space-between" }}>
// // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Annualized Projection:</span>
// // //                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(annualEti)}</strong>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>Mathematical Formula Check:</div>
// // //                 <div style={{ background: "#e0e7ff", padding: "12px", borderRadius: "6px", fontSize: "0.85rem", color: "#3730a3", fontFamily: "monospace", fontWeight: 600, marginBottom: "1rem" }}>{mathString}</div>

// // //                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>The SARS Rules (Ages 18-29):</div>
// // //                 <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem", color: "#475569", display: "flex", flexDirection: "column", gap: "6px" }}>
// // //                     <li style={{ color: wage > 0 && wage < 2000 ? "#16a34a" : "inherit", fontWeight: wage > 0 && wage < 2000 ? 700 : 400 }}>If stipend is R0 – R1,999: ETI = 75% of stipend</li>
// // //                     <li style={{ color: wage >= 2000 && wage <= 4499 ? "#16a34a" : "inherit", fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400 }}>If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)</li>
// // //                     <li style={{ color: wage >= 4500 && wage < 6500 ? "#16a34a" : "inherit", fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400 }}>If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend - R4,500])</li>
// // //                     <li style={{ color: wage >= 6500 ? "#dc2626" : "inherit", fontWeight: wage >= 6500 ? 700 : 400 }}>If stipend is R6,500 or more: ETI = R0</li>
// // //                 </ul>

// // //                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: "100%", marginTop: "1.5rem", justifyContent: "center" }}>Close Audit Trail</button>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // /* ─── PLACEMENT DETAILS SLIDE-OVER DRAWER ─── */
// // // interface PlacementDetailsDrawerProps {
// // //     placement: EnrichedPlacement;
// // //     companyName: string;
// // //     workplaceLogs: any[];
// // //     saHolidays: string[];
// // //     onClose: () => void;
// // //     onOpenEti: (p: EnrichedPlacement) => void;
// // //     onOpenLogs: (p: EnrichedPlacement) => void;
// // //     onEditPlacement: (p: EnrichedPlacement) => void;
// // // }

// // // export const PlacementDetailsDrawer: React.FC<PlacementDetailsDrawerProps> = ({ placement, companyName, workplaceLogs, saHolidays, onClose, onOpenEti, onOpenLogs, onEditPlacement }) => {

// // //     const toast = useToast();
// // //     const [isExportModalOpen, setIsExportModalOpen] = useState(false);
// // //     const [isGeneratingPack, setIsGeneratingPack] = useState(false);
// // //     const [auditPackError, setAuditPackError] = useState<string | null>(null);
// // //     const [showDisbursementModal, setShowDisbursementModal] = useState(false);
// // //     const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);

// // //     const [disbursements, setDisbursements] = useState<any[]>([]);
// // //     const [isLoadingLedger, setIsLoadingLedger] = useState(true);
// // //     const [isLedgerExpanded, setIsLedgerExpanded] = useState(false);

// // //     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
// // //     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

// // //     const isAuditReady = placement.complianceScore === 100;

// // //     useEffect(() => {
// // //         const fetchLedger = async () => {
// // //             setIsLoadingLedger(true);
// // //             try {
// // //                 const snap = await getDocs(collection(db, `placements/${placement.id}/disbursements`));
// // //                 const list = snap.docs.map(doc => doc.data()).sort((a, b) => String(b.monthYear).localeCompare(String(a.monthYear)));
// // //                 setDisbursements(list);
// // //             } catch (error) {
// // //                 console.error("Failed to load ledger", error);
// // //             } finally {
// // //                 setIsLoadingLedger(false);
// // //             }
// // //         };
// // //         fetchLedger();
// // //     }, [placement.id, showDisbursementModal]);

// // //     // 🚀 DYNAMIC COMPLIANCE UPLOAD HANDLER
// // //     const handleUploadComplianceDoc = async (e: React.ChangeEvent<HTMLInputElement>, item: any) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;

// // //         setUploadingDocKey(item.key);
// // //         try {
// // //             const safeName = placement.learnerName.replace(/[^a-zA-Z0-9]/g, '_');
// // //             const fileRef = ref(storage, `compliance/${placement.id}/${item.key}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // //             await uploadBytes(fileRef, file);
// // //             const downloadUrl = await getDownloadURL(fileRef);

// // //             if (item.dbTarget === 'learner') {
// // //                 await updateDoc(doc(db, 'learners', placement.learnerId), {
// // //                     [`documents.${item.key}`]: downloadUrl,
// // //                     idDocumentUrl: item.key === 'idDoc' ? downloadUrl : undefined,
// // //                     updatedAt: new Date().toISOString()
// // //                 });
// // //             } else {
// // //                 let docField = `${item.key}Url`; // e.g., slaUrl, dueDiligenceUrl
// // //                 if (item.key === 'wblpa') docField = 'wblpaAgreementUrl';
// // //                 if (item.key === 'empContract') docField = 'employmentContractUrl';

// // //                 await updateDoc(doc(db, 'placements', placement.id), {
// // //                     [`compliance.${docField}`]: downloadUrl,
// // //                     updatedAt: new Date().toISOString()
// // //                 });
// // //             }
// // //             toast.success(`${item.label} uploaded successfully!`);
// // //         } catch (err: any) {
// // //             toast.error("Failed to upload document.");
// // //         } finally {
// // //             setUploadingDocKey(null);
// // //             if (e.target) e.target.value = ''; // Reset input
// // //         }
// // //     };

// // //     const handleDownloadAuditPack = async (selectedFolders: string[]) => {
// // //         setIsGeneratingPack(true);
// // //         setAuditPackError(null);
// // //         try {
// // //             const functions = getFunctions();
// // //             const generateSetaAuditPack = httpsCallable(functions, "generateSetaAuditPack");

// // //             const response = await generateSetaAuditPack({
// // //                 learnerId: placement.learnerId, placementId: placement.id, employerName: companyName,
// // //                 learnerName: placement.learnerName, idNumber: placement.idNumber, mentorName: placement.mentorName,
// // //                 selectedFolders: selectedFolders
// // //             });

// // //             const data = response.data as { success: boolean; url: string };
// // //             if (data.success && data.url) {
// // //                 window.location.href = data.url;
// // //                 setIsExportModalOpen(false); // Close modal on success
// // //             }
// // //             else setAuditPackError("Server failed to supply a valid download path.");
// // //         } catch (error: any) {
// // //             setAuditPackError(error.message || "Failed to generate the compliance audit pack.");
// // //         } finally {
// // //             setIsGeneratingPack(false);
// // //         }
// // //     };

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99990, display: "flex", justifyContent: "flex-end", position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.3)", backdropFilter: "blur(2px)" }}>

// // //             {isExportModalOpen && (
// // //                 <EvidenceExportModal
// // //                     learnerName={placement.learnerName}
// // //                     onClose={() => setIsExportModalOpen(false)}
// // //                     onGenerate={handleDownloadAuditPack}
// // //                     isGenerating={isGeneratingPack}
// // //                 />
// // //             )}

// // //             <div onClick={(e) => e.stopPropagation()} style={{ width: "450px", maxWidth: "100%", height: "100%", background: "#f8fafc", display: "flex", flexDirection: "column", boxShadow: "-10px 0 25px rgba(0,0,0,0.1)", animation: "slideInRight 0.3s ease-out" }}>
// // //                 <div style={{ padding: "1.5rem", background: "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
// // //                     <div>
// // //                         <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
// // //                             <div className="cdp-learner-avatar">{placement.learnerName.charAt(0)}</div>
// // //                             <div><h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>{placement.learnerName}</h3><p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>ID: {placement.idNumber}</p></div>
// // //                         </div>
// // //                     </div>
// // //                     <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}><X size={20} /></button>
// // //                 </div>

// // //                 <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

// // //                     {/* 🚀 EXPANDED COMPLIANCE VAULT */}
// // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // //                         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
// // //                             <h4 style={{ margin: 0, fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} /> Compliance Vault</h4>
// // //                             <div style={{ textAlign: 'right' }}>
// // //                                 <span style={{ fontSize: "1.1rem", fontWeight: 800, color: placement.complianceScore === 100 ? "#16a34a" : "var(--mlab-amber)", fontFamily: "var(--font-heading)" }}>{placement.complianceScore}%</span>
// // //                                 <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Core Met</div>
// // //                             </div>
// // //                         </div>

// // //                         <div style={{ width: "100%", background: "#e2e8f0", height: "6px", borderRadius: "3px", overflow: "hidden", marginBottom: "1rem" }}>
// // //                             <div style={{ width: `${placement.complianceScore}%`, background: placement.complianceScore === 100 ? "#16a34a" : "var(--mlab-amber)", height: "100%", transition: "width 0.3s ease-out" }} />
// // //                         </div>

// // //                         <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem" }}>
// // //                             {placement.complianceItems.map((item) => (
// // //                                 <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '6px' }}>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
// // //                                         {item.isComplete ? <CheckSquare size={14} color="#16a34a" /> : <Square size={14} color="#94a3b8" />}
// // //                                         {item.label}
// // //                                         {!item.isRequired && <span style={{ fontSize: '0.6rem', background: '#e2e8f0', color: '#64748b', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Optional</span>}
// // //                                     </div>
// // //                                     <div>
// // //                                         {item.isComplete ? (
// // //                                             item.url ? (
// // //                                                 <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                     <FileText size={12} /> View
// // //                                                 </a>
// // //                                             ) : (
// // //                                                 <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>VERIFIED</span>
// // //                                             )
// // //                                         ) : (
// // //                                             item.actionType === 'upload' ? (
// // //                                                 <label style={{ fontSize: '0.7rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, cursor: uploadingDocKey === item.key ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                     {uploadingDocKey === item.key ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
// // //                                                     {uploadingDocKey === item.key ? 'Uploading...' : 'Upload'}
// // //                                                     <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => handleUploadComplianceDoc(e, item)} disabled={uploadingDocKey === item.key} />
// // //                                                 </label>
// // //                                             ) : item.actionType === 'assign' ? (
// // //                                                 <button onClick={() => onEditPlacement(placement)} style={{ fontSize: '0.7rem', color: 'white', background: '#d97706', border: 'none', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                     <User size={10} /> Assign
// // //                                                 </button>
// // //                                             ) : null
// // //                                         )}
// // //                                     </div>
// // //                                 </div>
// // //                             ))}
// // //                         </div>

// // //                         {placement.complianceScore === 100 && (
// // //                             <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s" }}>
// // //                                 {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
// // //                                 {isGeneratingPack ? "Compiling Cloud Zip..." : "Download SETA Audit Pack (.zip)"}
// // //                             </button>
// // //                         )}
// // //                         {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
// // //                     </div>

// // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Briefcase size={14} /> Placement Trajectory</h4>
// // //                         <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
// // //                             <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Start Date</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.startDate)}</div></div>
// // //                             <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Expected End</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.endDate)}</div></div>
// // //                             <div style={{ gridColumn: "1 / -1", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}><div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "4px" }}>Workplace Supervisor</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: placement.hasMentor ? "var(--mlab-midnight)" : "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>{placement.hasMentor ? <><User size={14} /> {placement.mentorName}</> : <><AlertTriangle size={14} /> Unassigned</>}</div></div>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Landmark size={14} /> Finance & Rebates</h4>
// // //                         <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
// // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>Monthly Base Stipend</span><span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-midnight)", textDecoration: placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) ? 'line-through' : 'none' }}>{formatCurrency(placement.stipendAmount)} /mo</span></div>
// // //                             {placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) && (
// // //                                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: "6px" }}>
// // //                                     <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700 }}>EARNED THIS MONTH</span><span style={{ fontSize: "0.65rem", color: "#991b1b" }}>Based on {placement.currentMonthApprovedDays} / {placement.expectedWorkingDaysThisMonth} expected days</span></div>
// // //                                     <span style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626" }}>{formatCurrency(placement.currentMonthEarnedStipend)}</span>
// // //                                 </div>
// // //                             )}
// // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>SARS ETI Claim</span>{placement.isEtiEligible && placement.etiMonthlyValue > 0 ? (<button onClick={() => onOpenEti(placement)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", color: "#166534", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Coins size={12} /> {formatCurrency(placement.etiMonthlyValue)} /mo</button>) : (<span style={{ fontSize: "0.75rem", color: "#64748b", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>Ineligible</span>)}</div>

// // //                             {/* ACCORDION HISTORY LEDGER */}
// // //                             <div style={{ paddingTop: "10px", borderTop: "1px solid #f1f5f9", marginTop: "4px" }}>
// // //                                 <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Historical Payments Ledger</div>
// // //                                 {isLoadingLedger ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}><Loader2 size={12} className="wm-spin" /> Loading records...</div>) : disbursements.length === 0 ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>No disbursements logged yet.</div>) : (
// // //                                     <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
// // //                                         <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
// // //                                             <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{disbursements[0].monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{disbursements[0].bankReference}</div></div>
// // //                                             <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(disbursements[0].netPayment)}</div>{disbursements[0].payslipEftUrl ? (<a href={disbursements[0].payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
// // //                                         </div>
// // //                                         {disbursements.length > 1 && (
// // //                                             <div style={{ marginTop: "4px" }}>
// // //                                                 <button onClick={() => setIsLedgerExpanded(!isLedgerExpanded)} style={{ width: "100%", background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}>
// // //                                                     <span>{isLedgerExpanded ? "Hide older payments" : `View ${disbursements.length - 1} older payment(s)`}</span>{isLedgerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
// // //                                                 </button>
// // //                                                 {isLedgerExpanded && (
// // //                                                     <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
// // //                                                         {disbursements.slice(1).map((d, i) => (
// // //                                                             <div key={i} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.85 }}>
// // //                                                                 <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{d.monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{d.bankReference}</div></div>
// // //                                                                 <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(d.netPayment)}</div>{d.payslipEftUrl ? (<a href={d.payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
// // //                                                             </div>
// // //                                                         ))}
// // //                                                     </div>
// // //                                                 )}
// // //                                             </div>
// // //                                         )}
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Activity size={14} /> Audit & Logbook Activity</h4>
// // //                         <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
// // //                             <div>
// // //                                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#475569", marginBottom: "6px", fontWeight: 600 }}>
// // //                                     <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> Campus Attendance Ratio</span>
// // //                                     <span style={{ color: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#d97706" : "#dc2626" }}>{placement.attendancePercentage}%</span>
// // //                                 </div>
// // //                                 <div style={{ width: "100%", background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
// // //                                     <div style={{ width: `${placement.attendancePercentage}%`, background: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#f59e0b" : "#ef4444", height: "100%" }} />
// // //                                 </div>
// // //                             </div>
// // //                             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
// // //                                 <div><div style={{ fontSize: "0.7rem", color: "#16a34a", fontWeight: 700 }}>✅ MENTOR APPROVED HOURS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#15803d" }}>{Number(placement.approvedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // //                                 <div><div style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 700 }}>⏳ WAITING FOR MENTOR</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#b45309" }}>{Number(placement.pendingWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // //                                 <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#dc2626", fontWeight: 700 }}>❌ REJECTED LOGS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c2410c" }}>{Number(placement.rejectedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // //                                 <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>📝 DRAFT (NOT SUBMITTED)</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#475569" }}>{Number(placement.draftWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // //                             </div>
// // //                             <button onClick={() => onOpenLogs(placement)} style={{ width: "100%", padding: "10px", background: "white", border: "1px solid var(--mlab-blue)", color: "var(--mlab-blue)", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.background = "#eff6ff"; }} onMouseOut={(e) => { e.currentTarget.style.background = "white"; }}>
// // //                                 <FileText size={16} /> Open Complete Logbook Audit
// // //                             </button>
// // //                         </div>
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             {showDisbursementModal && (
// // //                 <StipendDisbursementModal placement={placement} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setShowDisbursementModal(false)} />
// // //             )}
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
// // //     const { learners, staff } = useStore() as any;
// // //     const placements = useStore((s) => (s as unknown as { placements?: PlacementContract[] }).placements) || [];

// // //     const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
// // //     const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
// // //     const [workplaceLogs, setWorkplaceLogs] = useState<any[]>([]);
// // //     const [isComplianceLoading, setIsComplianceLoading] = useState(true);
// // //     const [saHolidays, setSaHolidays] = useState<string[]>([]);

// // //     const [activeTab, setActiveTab] = useState<"active" | "history" | "all" | "action_required">("active");
// // //     const [searchQuery, setSearchQuery] = useState("");
// // //     const [showExportMenu, setShowExportMenu] = useState(false);

// // //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);
// // //     const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(null);
// // //     const [drawerPlacement, setDrawerPlacement] = useState<EnrichedPlacement | null>(null);
// // //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);

// // //     const menuRef = useRef<HTMLDivElement>(null);

// // //     const [bulkJobId, setBulkJobId] = useState<string | null>(null);
// // //     const [bulkJobStatus, setBulkJobStatus] = useState<{ status: string, completedTasks: number, totalTasks: number, downloadUrl?: string | null } | null>(null);
// // //     const [isRequestingBulk, setIsRequestingBulk] = useState(false);

// // //     const companyPlacements = useMemo(() => placements.filter((p) => p.employerId === company.id), [placements, company.id]);
// // //     const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

// // //     const placementLearnerIdsStr = useMemo(() => companyPlacements.map(p => p.learnerId).sort().join(","), [companyPlacements]);

// // //     useEffect(() => {
// // //         const fetchHolidays = async () => {
// // //             try {
// // //                 const year = new Date().getFullYear();
// // //                 const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`);
// // //                 if (res.ok) {
// // //                     const data = await res.json();
// // //                     setSaHolidays(data.map((h: any) => h.date));
// // //                 }
// // //             } catch (error) {
// // //                 console.error("Error fetching SA holidays:", error);
// // //             }
// // //         };
// // //         fetchHolidays();
// // //     }, []);

// // //     const fetchDeepComplianceData = async () => {
// // //         setIsComplianceLoading(true);
// // //         try {
// // //             const logsUnifiedMap = new Map<string, any>();
// // //             const wpQueryEmp = query(collection(db, "workplace_logs"), where("employerId", "==", company.id));
// // //             const wpSnapEmp = await getDocs(wpQueryEmp);
// // //             wpSnapEmp.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));

// // //             const relevantLearnerIds = new Set<string>();
// // //             companyPlacements.forEach(p => {
// // //                 if (p.learnerId) relevantLearnerIds.add(String(p.learnerId).trim());
// // //                 const l = learners.find((x: any) => x.id === p.learnerId);
// // //                 if (l && l.idNumber && String(l.idNumber).trim() !== "") {
// // //                     relevantLearnerIds.add(String(l.idNumber).trim());
// // //                 }
// // //             });

// // //             const placementStudentPool = Array.from(relevantLearnerIds).filter(Boolean);

// // //             for (let i = 0; i < placementStudentPool.length; i += 10) {
// // //                 const studentChunk = placementStudentPool.slice(i, i + 10);
// // //                 if (studentChunk.length === 0) continue;
// // //                 const wpQueryLearner = query(collection(db, "workplace_logs"), where("learnerId", "in", studentChunk));
// // //                 const wpSnapLearner = await getDocs(wpQueryLearner);
// // //                 wpSnapLearner.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));
// // //             }

// // //             const compiledWpLogs = Array.from(logsUnifiedMap.values());
// // //             setWorkplaceLogs(compiledWpLogs);

// // //             const relevantCohortIds = new Set<string>();
// // //             companyPlacements.forEach((p) => { if (p.cohortId) relevantCohortIds.add(p.cohortId); });
// // //             const cohortIdsArray = Array.from(relevantCohortIds);
// // //             let fetchedAttLogs: any[] = [];
// // //             let fetchedAttRecords: any[] = [];
// // //             for (const cId of cohortIdsArray) {
// // //                 if (!cId) continue;
// // //                 const logsQ = query(collection(db, "attendance_logs"), where("cohortId", "==", cId));
// // //                 const recsQ = query(collection(db, "attendance_records"), where("cohortId", "==", cId));
// // //                 const [lSnap, rSnap] = await Promise.all([getDocs(logsQ), getDocs(recsQ)]);
// // //                 fetchedAttLogs.push(...lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
// // //                 fetchedAttRecords.push(...rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
// // //             }

// // //             setAttendanceLogs(fetchedAttLogs);
// // //             setAttendanceRecords(fetchedAttRecords);
// // //         } catch (error) {
// // //             console.error("Deep compliance fetch error:", error);
// // //         } finally {
// // //             setIsComplianceLoading(false);
// // //         }
// // //     };

// // //     useEffect(() => {
// // //         if (placementLearnerIdsStr.length > 0) {
// // //             fetchDeepComplianceData();
// // //         } else {
// // //             setIsComplianceLoading(false);
// // //         }
// // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // //     }, [company.id, placementLearnerIdsStr]);

// // //     const { activeCount, completedCount, droppedCount, missingContracts, nonCompliantCount } = useMemo<PlacementStats>(() => {
// // //         let active = 0, completed = 0, dropped = 0, missing = 0, nonCompliant = 0;
// // //         companyPlacements.forEach((p) => {
// // //             const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean } };
// // //             const statusLower = p.status.toLowerCase();
// // //             if (statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview")) {
// // //                 active++;
// // //                 const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
// // //                 const hasMentor = !!(p.assignedMentorName || (placementRecord as any).mentorId);
// // //                 if (!isFullySigned) missing++;
// // //                 if (!isFullySigned || !hasMentor) nonCompliant++;
// // //             }
// // //             if (p.status === "Completed" || p.status === "absorbed_permanently") completed++;
// // //             if (p.status === "Terminated") dropped++;
// // //         });
// // //         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing, nonCompliantCount: nonCompliant };
// // //     }, [companyPlacements]);

// // //     // 🚀 MASTER ENRICHMENT & COMPLIANCE SCORING ENGINE
// // //     const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
// // //         return companyPlacements
// // //             .map((p) => {
// // //                 const learner = learners.find((l: any) => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);

// // //                 // 🚀 FIX 1: Added bbbeeSpendCategory to the compliance type definition
// // //                 const placementRecord = p as PlacementContract & {
// // //                     placementType?: string;
// // //                     compliance?: {
// // //                         isAgreementFullyExecuted?: boolean;
// // //                         wblpaAgreementUrl?: string;
// // //                         employmentContractUrl?: string;
// // //                         slaUrl?: string;
// // //                         smeAgreementUrl?: string;
// // //                         dueDiligenceUrl?: string;
// // //                         bbbeeSpendCategory?: string;
// // //                     };
// // //                     bbbeeSpendCategory?: string;
// // //                     mentorId?: string;
// // //                     cohortId?: string;
// // //                 };

// // //                 const mentor = companyMentors.find((m: any) => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);
// // //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string; disabilityStatus?: string; };
// // //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || "Unknown";
// // //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || "No Disability";

// // //                 let isEtiEligible = false;
// // //                 let isFemale = false;
// // //                 let isYouth = true;

// // //                 if (learner.idNumber && learner.idNumber.length >= 13) {
// // //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// // //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // //                     const age = new Date().getFullYear() - birthYear;
// // //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// // //                     if (age > 35) isYouth = false;
// // //                     const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
// // //                     if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
// // //                 } else if ((learner.demographics as any)?.genderCode === "F" || (extendedLearner as any).gender === "Female") {
// // //                     isFemale = true;
// // //                 }

// // //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), "months", true);
// // //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

// // //                 let etiMonthlyValue = 0;
// // //                 const wage = Number(p.stipendAmount) || 0;
// // //                 if (isEtiEligible && wage > 0) {
// // //                     if (wage < 2000) etiMonthlyValue = wage * 0.75;
// // //                     else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
// // //                     else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - 0.75 * (wage - 4500), 0);
// // //                 }

// // //                 const hasDisability = disability !== "No Disability" && disability !== "None" && disability !== "N/A" && disability !== "No" && disability !== "N";
// // //                 const s12hAllowanceTotal = hasDisability ? 120000 : 80000;
// // //                 const cohortId = learner.cohortId || placementRecord.cohortId;
// // //                 const safeLearnerId = String(p.learnerId || "").trim().toLowerCase();
// // //                 const safeIdNumber = String(learner.idNumber || "").trim().toLowerCase();

// // //                 let attendancePercentage = 0;
// // //                 if (cohortId) {
// // //                     const learnerAttRecords = attendanceRecords.filter((r: any) => r.cohortId === cohortId && (String(r.learnerId).trim().toLowerCase() === safeLearnerId || String(r.learnerId).trim().toLowerCase() === safeIdNumber));
// // //                     const learnerAttPresent = learnerAttRecords.filter((r: any) => r.status === "Present" || r.status === "Partial").length;
// // //                     const cohortTotalSessions = attendanceLogs.filter((l: any) => l.cohortId === cohortId).length;
// // //                     attendancePercentage = cohortTotalSessions > 0 ? Math.round((learnerAttPresent / cohortTotalSessions) * 100) : 0;
// // //                 }

// // //                 const learnerWpLogs = workplaceLogs.filter((l: any) => {
// // //                     const logLId = String(l.learnerId || "").trim().toLowerCase();
// // //                     return (safeLearnerId !== "" && logLId === safeLearnerId) || (safeIdNumber !== "" && logLId === safeIdNumber);
// // //                 });

// // //                 const approvedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // //                     const stat = String(l.status || "").trim().toLowerCase();
// // //                     return stat === "approved" ? sum + (Number(l.totalHours) || 0) : sum;
// // //                 }, 0);

// // //                 const pendingWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // //                     const stat = String(l.status || "").trim().toLowerCase();
// // //                     return (stat === "pending_mentor_approval" || stat === "pending") ? sum + (Number(l.totalHours) || 0) : sum;
// // //                 }, 0);

// // //                 const rejectedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // //                     const stat = String(l.status || "").trim().toLowerCase();
// // //                     return stat === "rejected" ? sum + (Number(l.totalHours) || 0) : sum;
// // //                 }, 0);

// // //                 const draftWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // //                     const stat = String(l.status || "").trim().toLowerCase();
// // //                     return (stat === "draft" || stat === "") ? sum + (Number(l.totalHours) || 0) : sum;
// // //                 }, 0);

// // //                 const currentYear = moment().year();
// // //                 const currentMonth = moment().month();
// // //                 const currentMonthStr = moment().format('YYYY-MM');
// // //                 const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, saHolidays);

// // //                 const currentMonthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr));
// // //                 const approvedDatesThisMonth = new Set(
// // //                     currentMonthWpLogs.filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved").map((l: any) => l.dateString)
// // //                 );
// // //                 const currentMonthApprovedDays = approvedDatesThisMonth.size;

// // //                 let currentMonthEarnedStipend = wage;
// // //                 if (expectedWorkingDaysThisMonth > 0 && wage > 0) {
// // //                     const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * wage;
// // //                     currentMonthEarnedStipend = Math.round(Math.min(calculatedProRata, wage) * 100) / 100;
// // //                 }

// // //                 // 🚀 COMPLIANCE RESOLUTION LOGIC
// // //                 let idUrl = learner.documents?.idDocument || learner.idUrl || learner.idDocumentUrl || "";
// // //                 let wblpaUrl = placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl || "";
// // //                 let empContractUrl = placementRecord.compliance?.employmentContractUrl || "";
// // //                 let slaUrl = placementRecord.compliance?.slaUrl || "";
// // //                 let qualUrl = learner.documents?.qualification || "";
// // //                 let affidavitUrl = learner.documents?.affidavit || "";
// // //                 let smeAgreUrl = placementRecord.compliance?.smeAgreementUrl || "";
// // //                 let dueDilUrl = placementRecord.compliance?.dueDiligenceUrl || "";
// // //                 let bankUrl = learner.documents?.bankLetter || "";

// // //                 // Deep scan uploadedDocuments
// // //                 const learnerUserDoc = (useStore.getState() as any).users?.find((u: any) => u.id === learner.authUid) || {};

// // //                 // 🚀 FIX 2: Added (p as any) to bypass the strict PlacementContract interface
// // //                 const arraysToScan = [...(learner.uploadedDocuments || []), ...((p as any).uploadedDocuments || []), ...(learnerUserDoc?.uploadedDocuments || [])];

// // //                 arraysToScan.forEach((doc: any) => {
// // //                     const docId = String(doc.id || "").toLowerCase();
// // //                     const name = String(doc.name || "").toLowerCase();
// // //                     if (!idUrl && (docId === "id" || name.includes("id") || name.includes("identity") || name.includes("passport"))) idUrl = doc.url;
// // //                     if (!wblpaUrl && (docId === "wblpa" || docId === "contract" || name.includes("contract") || name.includes("wblpa") || name.includes("agreement"))) wblpaUrl = doc.url;
// // //                     if (!empContractUrl && (docId === "emp_contract" || name.includes("employment"))) empContractUrl = doc.url;
// // //                     if (!slaUrl && (docId === "sla" || name.includes("sla"))) slaUrl = doc.url;
// // //                     if (!qualUrl && (docId === "qualification" || name.includes("qualification") || name.includes("certificate"))) qualUrl = doc.url;
// // //                     if (!affidavitUrl && (docId === "affidavit" || name.includes("affidavit"))) affidavitUrl = doc.url;
// // //                     if (!smeAgreUrl && (docId === "sme_agreement" || name.includes("host") || name.includes("sme"))) smeAgreUrl = doc.url;
// // //                     if (!dueDilUrl && (docId === "due_diligence" || name.includes("diligence"))) dueDilUrl = doc.url;
// // //                     if (!bankUrl && (docId === "bank" || name.includes("bank"))) bankUrl = doc.url;
// // //                 });

// // //                 const hasMentorAssigned = !!(p.assignedMentorName || placementRecord.mentorId || mentor.id);

// // //                 const complianceItems: EnrichedPlacement["complianceItems"] = [
// // //                     { key: 'idDoc', label: 'Certified ID Document', isComplete: !!idUrl, isRequired: true, url: idUrl, actionType: 'upload', dbTarget: 'learner' },
// // //                     { key: 'wblpa', label: 'WBLPA Contract', isComplete: !!wblpaUrl, isRequired: true, url: wblpaUrl, actionType: 'upload', dbTarget: 'placement' },
// // //                     { key: 'empContract', label: 'Employment Contract', isComplete: !!empContractUrl, isRequired: true, url: empContractUrl, actionType: 'upload', dbTarget: 'placement' },
// // //                     { key: 'mentor', label: 'Workplace Mentor Assigned', isComplete: hasMentorAssigned, isRequired: true, actionType: 'assign', dbTarget: 'placement' },
// // //                     { key: 'sla', label: 'Service Level Agreement (SLA)', isComplete: !!slaUrl, isRequired: false, url: slaUrl, actionType: 'upload', dbTarget: 'placement' },
// // //                     { key: 'qualification', label: 'Highest Qualification', isComplete: !!qualUrl, isRequired: false, url: qualUrl, actionType: 'upload', dbTarget: 'learner' },
// // //                     { key: 'affidavit', label: 'Sworn Affidavit', isComplete: !!affidavitUrl, isRequired: false, url: affidavitUrl, actionType: 'upload', dbTarget: 'learner' },
// // //                     { key: 'smeAgreement', label: 'Host Company Agreement', isComplete: !!smeAgreUrl, isRequired: false, url: smeAgreUrl, actionType: 'upload', dbTarget: 'placement' },
// // //                     { key: 'dueDiligence', label: 'SME Due Diligence Report', isComplete: !!dueDilUrl, isRequired: false, url: dueDilUrl, actionType: 'upload', dbTarget: 'placement' },
// // //                     { key: 'bankLetter', label: 'Bank Confirmation Letter', isComplete: !!bankUrl, isRequired: false, url: bankUrl, actionType: 'upload', dbTarget: 'learner' }
// // //                 ];

// // //                 const requiredItems = complianceItems.filter(i => i.isRequired);
// // //                 const completedRequiredCount = requiredItems.filter(i => i.isComplete).length;
// // //                 const complianceScore = Math.round((completedRequiredCount / requiredItems.length) * 100);

// // //                 return {
// // //                     ...p,
// // //                     placementType: placementRecord.placementType || "QCTO Workplace Module",
// // //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || "Uncategorized",
// // //                     compliance: {
// // //                         isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === "boolean" ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
// // //                         wblpaAgreementUrl: wblpaUrl,
// // //                         employmentContractUrl: empContractUrl,
// // //                         slaUrl: slaUrl,
// // //                         smeAgreementUrl: smeAgreUrl,
// // //                         dueDiligenceUrl: dueDilUrl
// // //                     },
// // //                     complianceScore,
// // //                     complianceItems,
// // //                     learnerName: learner.fullName || "Unknown Learner",
// // //                     idNumber: learner.idNumber || "—",
// // //                     equityGroup: equity,
// // //                     isFemale,
// // //                     isYouth,
// // //                     hasDisability,
// // //                     mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
// // //                     hasMentor: hasMentorAssigned,
// // //                     isEtiEligible,
// // //                     etiMonthlyValue,
// // //                     projectedStipendSpend: wage * verifiedTimeline,
// // //                     s12hAllowanceTotal,
// // //                     attendancePercentage,
// // //                     approvedWpHours,
// // //                     pendingWpHours,
// // //                     rejectedWpHours,
// // //                     draftWpHours,
// // //                     currentMonthApprovedDays,
// // //                     expectedWorkingDaysThisMonth,
// // //                     currentMonthEarnedStipend
// // //                 };
// // //             })
// // //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // //     }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs, saHolidays]);

// // //     useEffect(() => {
// // //         if (drawerPlacement) {
// // //             const updatedMatch = enrichedPlacements.find(x => x.id === drawerPlacement.id);
// // //             if (updatedMatch) setDrawerPlacement(updatedMatch);
// // //         }
// // //     }, [enrichedPlacements]);

// // //     const complianceMetrics = useMemo<ComplianceMetricsData>(() => {
// // //         let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
// // //         let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
// // //         let totalFemale = 0, totalMale = 0, absorbedFemale = 0, absorbedMale = 0;
// // //         let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
// // //         let mentorLoad: Record<string, number> = {};

// // //         enrichedPlacements.forEach((p) => {
// // //             const statusLower = p.status.toLowerCase();
// // //             const isLive = statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview");
// // //             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes("absorb") || (p as any).isAbsorbed;

// // //             if (isLive && p.hasMentor) mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;

// // //             const eq = p.equityGroup.trim().toLowerCase();
// // //             if (eq.includes("african") || eq === "black" || eq === "ba") { raceCounts.African++; blackACI++; if (p.isFemale) blackFemale++; }
// // //             else if (eq.includes("coloured") || eq === "bc") { raceCounts.Coloured++; blackACI++; if (p.isFemale) blackFemale++; }
// // //             else if (eq.includes("indian") || eq === "bi") { raceCounts.Indian++; blackACI++; if (p.isFemale) blackFemale++; }
// // //             else if (eq.includes("white") || eq === "w") { raceCounts.White++; }
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

// // //             if (isLive || statusLower.includes("complete") || statusLower.includes("absorb")) {
// // //                 totalS12hProjected += p.s12hAllowanceTotal;
// // //             }
// // //         });

// // //         const overloadedMentors = Object.entries(mentorLoad).filter(([_, count]) => count > 4).length;

// // //         return {
// // //             transformationPercentage: enrichedPlacements.length > 0 ? Math.round((blackACI / enrichedPlacements.length) * 100) : 0,
// // //             disabilityPercentage: enrichedPlacements.length > 0 ? Math.round((disabilityCount / enrichedPlacements.length) * 100) : 0,
// // //             disabilityCount,
// // //             youthPercentage: enrichedPlacements.length > 0 ? Math.round((youthCount / enrichedPlacements.length) * 100) : 0,
// // //             youthCount,
// // //             etiYieldPercentage: activeCount > 0 ? Math.round((activeEtiYielders / activeCount) * 100) : 0,
// // //             monthlyETITotal: monthlyEtiSum,
// // //             annualizedETIEstimate: monthlyEtiSum * 12,
// // //             absorptionRate: completedCount > 0 ? Math.round(((absorbedFemale + absorbedMale) / completedCount) * 100) : 0,
// // //             totalProjectedSpend: accumulatedSpend,
// // //             totalS12hProjected,
// // //             totalFemale,
// // //             totalMale,
// // //             absorbedFemale,
// // //             absorbedMale,
// // //             raceCounts,
// // //             overloadedMentors,
// // //         };
// // //     }, [enrichedPlacements, activeCount, completedCount]);

// // //     const formatCurrency = (val?: number | string | null) =>
// // //         new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);

// // //     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

// // //     const displayedPlacements = useMemo(() => {
// // //         return enrichedPlacements.filter((p) => {
// // //             const sLower = p.status.toLowerCase();
// // //             if (activeTab === "action_required") {
// // //                 if (p.complianceScore === 100) return false;
// // //             }
// // //             if (activeTab === "active" && !sLower.includes("active") && !sLower.includes("pending") && !sLower.includes("interview")) return false;
// // //             if (activeTab === "history" && !sLower.includes("complete") && !sLower.includes("terminate") && !sLower.includes("absorb")) return false;
// // //             if (searchQuery) {
// // //                 const q = searchQuery.toLowerCase();
// // //                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
// // //             }
// // //             return true;
// // //         });
// // //     }, [enrichedPlacements, activeTab, searchQuery]);

// // //     const handleExportExcel = () => {
// // //         const data = displayedPlacements.map((p) => ({
// // //             "Learner Name": p.learnerName,
// // //             "ID Number": p.idNumber,
// // //             "Race (EE Code)": p.equityGroup,
// // //             Gender: p.isFemale ? "Female" : "Male",
// // //             "Placement Type": p.placementType,
// // //             "Monthly Stipend": Number(p.stipendAmount || 0).toFixed(2),
// // //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${Number(p.etiMonthlyValue).toFixed(2)}/mo)` : "No",
// // //             "Compliance Score": `${p.complianceScore}%`,
// // //             "Start Date": p.startDate ? moment(p.startDate).format("YYYY-MM-DD") : "—",
// // //             "Expected End Date": p.endDate ? moment(p.endDate).format("YYYY-MM-DD") : "—",
// // //             "Assigned Mentor": p.mentorName,
// // //             "Operational Status": p.status.toUpperCase(),
// // //         }));
// // //         if (data.length === 0) return;
// // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // //         const workbook = XLSX.utils.book_new();
// // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
// // //         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, "_");
// // //         XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
// // //         setShowExportMenu(false);
// // //     };

// // //     const handleExportCSV = () => {
// // //         const data = displayedPlacements.map((p) => ({
// // //             "Learner Name": p.learnerName,
// // //             "ID Number": p.idNumber,
// // //             "Placement Type": p.placementType,
// // //             "Compliance Score": `${p.complianceScore}%`,
// // //             "Operational Status": p.status.toUpperCase(),
// // //         }));
// // //         if (data.length === 0) return;
// // //         const headers = Object.keys(data[0]);
// // //         const csvRows = data.map((row) => headers.map((header) => `"${(row as Record<string, unknown>)[header]}"`).join(","));
// // //         const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
// // //         const link = document.createElement("a");
// // //         link.href = URL.createObjectURL(blob);
// // //         link.setAttribute("download", `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`);
// // //         document.body.appendChild(link);
// // //         link.click();
// // //         document.body.removeChild(link);
// // //         setShowExportMenu(false);
// // //     };

// // //     const handleTriggerBulkExport = async () => {
// // //         if (displayedPlacements.length === 0) return;
// // //         setIsRequestingBulk(true);
// // //         setShowExportMenu(false);
// // //         try {
// // //             const fns = getFunctions();
// // //             const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");
// // //             const payloadPlacements = displayedPlacements.map(p => ({
// // //                 learnerId: p.learnerId, placementId: p.id, learnerName: p.learnerName, idNumber: p.idNumber, mentorName: p.mentorName
// // //             }));
// // //             const response = await requestBulkAuditPacks({ companyId: company.id, companyName: company.name, placements: payloadPlacements });
// // //             const data = response.data as { success: boolean, jobId: string };
// // //             if (data.success && data.jobId) setBulkJobId(data.jobId);
// // //         } catch (error) {
// // //             console.error("Failed to start bulk export:", error);
// // //             alert("Failed to start bulk export process. Check console for details.");
// // //         } finally {
// // //             setIsRequestingBulk(false);
// // //         }
// // //     };

// // //     useEffect(() => {
// // //         if (!bulkJobId) return;
// // //         const unsubscribe = onSnapshot(doc(db, "compliance_jobs", bulkJobId), (docSnap) => {
// // //             if (docSnap.exists()) {
// // //                 const data = docSnap.data() as any;
// // //                 setBulkJobStatus({ status: data.status, completedTasks: data.completedTasks || 0, totalTasks: data.totalTasks || 0, downloadUrl: data.downloadUrl || null });
// // //                 if (data.status === "complete" && data.downloadUrl) {
// // //                     window.location.href = data.downloadUrl;
// // //                     setTimeout(() => { setBulkJobId(null); setBulkJobStatus(null); }, 8000);
// // //                 }
// // //             }
// // //         });
// // //         return () => unsubscribe();
// // //     }, [bulkJobId]);


// // //     return (
// // //         <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "2rem" }}>
// // //             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
// // //             {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}
// // //             {drawerPlacement && (
// // //                 <PlacementDetailsDrawer
// // //                     placement={drawerPlacement}
// // //                     companyName={company.name}
// // //                     workplaceLogs={workplaceLogs}
// // //                     saHolidays={saHolidays}
// // //                     onClose={() => setDrawerPlacement(null)}
// // //                     onOpenEti={setEtiBreakdownLearner}
// // //                     onOpenLogs={setAuditLearner}
// // //                     onEditPlacement={(p) => setEditingPlacement(p)}
// // //                 />
// // //             )}

// // //             {editingPlacement && (
// // //                 <EditPlacementModal
// // //                     placement={editingPlacement}
// // //                     mentors={companyMentors}
// // //                     cohorts={[]}
// // //                     learners={learners}
// // //                     onClose={() => setEditingPlacement(null)}
// // //                     onSaved={() => { }}
// // //                 />
// // //             )}

// // //             {/* ── BREADCRUMB & HEADER ── */}
// // //             <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
// // //                 <button onClick={onBack} style={{ background: "white", border: "1px solid var(--mlab-border)", borderRadius: "8px", padding: "8px", cursor: "pointer", color: "var(--mlab-midnight)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "4px" }}>
// // //                     <ArrowLeft size={18} />
// // //                 </button>
// // //                 <div>
// // //                     <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Host Company Profile</div>
// // //                     <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
// // //                         <h1 style={{ margin: 0, fontSize: "1.8rem", fontFamily: "var(--font-heading)", color: "var(--mlab-midnight)", lineHeight: 1.2 }}>{company.name}</h1>
// // //                         {isComplianceLoading && <Loader2 size={20} className="wm-spin" color="var(--mlab-blue)" />}
// // //                         <button onClick={fetchDeepComplianceData} disabled={isComplianceLoading} style={{ background: "var(--mlab-blue)", color: "white", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", marginLeft: "1rem" }}>
// // //                             <RefreshCw size={12} className={isComplianceLoading ? "wm-spin" : ""} /> Sync Database
// // //                         </button>
// // //                     </div>

// // //                     <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", fontSize: "0.85rem", color: "#475569" }}>
// // //                         {company.registrationNumber && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Hash size={13} /> {company.registrationNumber}</span>}
// // //                         {company.physicalAddress && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={13} /> {company.physicalAddress}</span>}
// // //                         {company.contactPerson && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Mail size={13} /> {company.contactEmail}</span>}
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             {complianceMetrics.overloadedMentors > 0 && (
// // //                 <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", color: "#991b1b", fontSize: "0.8rem", fontWeight: 600 }}>
// // //                     <ShieldAlert size={16} />
// // //                     <span><strong>SETA Quality Warning:</strong> {complianceMetrics.overloadedMentors} assigned mentor(s) currently exceed the recommended 1:4 supervisor-to-learner load constraint.</span>
// // //                 </div>
// // //             )}

// // //             <div className="cdp-stat-row">
// // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Interns</span></div>
// // //                 </div>
// // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // //                     <div className="cdp-stat-card__icon"><Award size={20} /></div>
// // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{completedCount}</span><span className="cdp-stat-card__label">Completed Programs</span></div>
// // //                 </div>
// // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // //                     <div className="cdp-stat-card__icon"><FileText size={20} /></div>
// // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit" }}>{missingContracts}</span><span className="cdp-stat-card__label">Missing Contracts</span></div>
// // //                 </div>
// // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // //                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
// // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? "var(--mlab-red)" : "inherit" }}>{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Terminated</span></div>
// // //                 </div>
// // //             </div>

// // //             <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />

// // //             <div className="cdp-panel">
// // //                 <div className="vp-card" style={{ marginBottom: 0 }}>
// // //                     <div className="vp-card-header" style={{ borderBottom: "none", flexDirection: "row", display: "flex", justifyContent: "space-between", paddingBottom: 0 }}>
// // //                         <div className="vp-card-title-group">
// // //                             <Users size={18} color="var(--mlab-blue)" />
// // //                             <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--mlab-blue)", textTransform: "uppercase" }}>Placement Ledger</h3>
// // //                         </div>
// // //                         <div>
// // //                             <BulkStipendUploader
// // //                                 placements={displayedPlacements}
// // //                                 saHolidays={saHolidays}
// // //                                 onSuccess={() => { fetchDeepComplianceData(); }}
// // //                             />
// // //                         </div>
// // //                     </div>

// // //                     {/* 🚀 LIVE PROGRESS BANNER FOR BULK EXPORT */}
// // //                     {bulkJobStatus && (
// // //                         <div style={{ margin: "1rem 1.5rem 0", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }} className="animate-fade-in">
// // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
// // //                                 <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--mlab-blue)", fontWeight: 700, fontSize: "0.85rem" }}>
// // //                                     {bulkJobStatus.status === "processing" ? <Loader2 size={16} className="wm-spin" /> : <Archive size={16} color="#16a34a" />}
// // //                                     {bulkJobStatus.status === "processing" ? "Compiling Bulk Audit Packs..." : bulkJobStatus.status === "zipping" ? "Merging Cloud Stream..." : "Download Ready!"}
// // //                                 </div>
// // //                                 <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>
// // //                                     {bulkJobStatus.completedTasks} / {bulkJobStatus.totalTasks} Processed
// // //                                 </div>
// // //                             </div>

// // //                             <div style={{ width: "100%", background: "#e0f2fe", height: "10px", borderRadius: "5px", overflow: "hidden" }}>
// // //                                 <div style={{
// // //                                     width: `${bulkJobStatus.totalTasks > 0 ? (bulkJobStatus.completedTasks / bulkJobStatus.totalTasks) * 100 : 0}%`,
// // //                                     background: bulkJobStatus.status === "complete" ? "#16a34a" : "var(--mlab-blue)",
// // //                                     height: "100%",
// // //                                     transition: "width 0.3s ease-out"
// // //                                 }} />
// // //                             </div>

// // //                             {bulkJobStatus.status === "complete" && bulkJobStatus.downloadUrl && (
// // //                                 <a href={bulkJobStatus.downloadUrl} style={{ background: "#16a34a", color: "white", padding: "8px", borderRadius: "6px", textDecoration: "none", fontSize: "0.8rem", fontWeight: 700, textAlign: "center", marginTop: "8px", display: "inline-block" }}>
// // //                                     Click here if your download doesn't start automatically
// // //                                 </a>
// // //                             )}
// // //                         </div>
// // //                     )}

// // //                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 1.5rem", borderBottom: "1px solid var(--mlab-border)", marginTop: "1rem", background: "#f8fafc", flexWrap: "wrap", gap: "1rem" }}>
// // //                         <div style={{ display: "flex", gap: "1.5rem" }}>
// // //                             <button onClick={() => setActiveTab("active")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "active" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "active" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "active" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // //                                 Active Interns <span style={{ background: activeTab === "active" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "active" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{activeCount}</span>
// // //                             </button>

// // //                             <button onClick={() => setActiveTab("action_required")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "action_required" ? "#b91c1c" : "#64748b", fontWeight: activeTab === "action_required" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "action_required" ? "2px solid #b91c1c" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // //                                 Action Required <span style={{ background: activeTab === "action_required" ? "#fee2e2" : "#f1f5f9", color: activeTab === "action_required" ? "#b91c1c" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{nonCompliantCount}</span>
// // //                             </button>

// // //                             <button onClick={() => setActiveTab("history")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "history" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "history" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "history" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // //                                 History <span style={{ background: activeTab === "history" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "history" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{completedCount + droppedCount}</span>
// // //                             </button>
// // //                             <button onClick={() => setActiveTab("all")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "all" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "all" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "all" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // //                                 All Records <span style={{ background: activeTab === "all" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "all" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{enrichedPlacements.length}</span>
// // //                             </button>
// // //                         </div>

// // //                         <div style={{ display: "flex", gap: "8px", paddingBottom: "8px" }}>
// // //                             <div style={{ position: "relative", display: "flex", alignItems: "center", background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "0 8px" }}>
// // //                                 <Search size={14} color="#64748b" />
// // //                                 <input type="text" placeholder="Search ledger..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: "none", padding: "8px", outline: "none", background: "transparent", fontSize: "0.8rem", width: "200px" }} />
// // //                                 {searchQuery && <button type="button" onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex" }}><X size={12} /></button>}
// // //                             </div>

// // //                             <div style={{ position: "relative" }} ref={menuRef}>
// // //                                 <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={displayedPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: "white", fontSize: "0.8rem", padding: "6px 12px", opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? "not-allowed" : "pointer" }}>
// // //                                     <DownloadCloud size={14} /> Export
// // //                                 </button>
// // //                                 {showExportMenu && displayedPlacements.length > 0 && (
// // //                                     <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 50, minWidth: "220px", overflow: "hidden" }} className="animate-fade-in">
// // //                                         <button type="button" onClick={handleExportCSV} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download Data as CSV</button>
// // //                                         <button type="button" onClick={handleExportExcel} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download Data as Excel</button>
// // //                                         {/* 🚀 NEW BULK EXPORT BUTTON IN THE DROPDOWN */}
// // //                                         <button
// // //                                             type="button"
// // //                                             onClick={handleTriggerBulkExport}
// // //                                             disabled={isRequestingBulk || !!bulkJobId}
// // //                                             style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "#f8fafc", border: "none", cursor: (isRequestingBulk || !!bulkJobId) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 600, opacity: (isRequestingBulk || !!bulkJobId) ? 0.5 : 1 }}
// // //                                         >
// // //                                             <Archive size={14} color="#073f4e" />
// // //                                             {isRequestingBulk ? "Starting Job..." : "Generate Bulk SETA Pack (.zip)"}
// // //                                         </button>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>
// // //                     </div>

// // //                     <div className="mlab-table-wrap">
// // //                         {isComplianceLoading && <div style={{ padding: "1rem", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} className="wm-spin" /> Verifying deep compliance logs...</div>}

// // //                         <table className="mlab-table">
// // //                             <colgroup>
// // //                                 <col style={{ width: "20%" }} />
// // //                                 <col style={{ width: "20%" }} />
// // //                                 <col style={{ width: "15%" }} />
// // //                                 <col style={{ width: "15%" }} />
// // //                                 <col style={{ width: "20%" }} />
// // //                                 <col style={{ width: "10%" }} />
// // //                             </colgroup>
// // //                             <thead>
// // //                                 <tr>
// // //                                     <th>Learner Profile</th>
// // //                                     <th>Placement Scope</th>
// // //                                     <th>Assigned Mentor</th>
// // //                                     <th>Status</th>
// // //                                     <th>Compliance Progress</th>
// // //                                     <th style={{ textAlign: "right" }}>Actions</th>
// // //                                 </tr>
// // //                             </thead>
// // //                             <tbody>
// // //                                 {displayedPlacements.length > 0 ? (
// // //                                     displayedPlacements.map((p) => {
// // //                                         return (
// // //                                             <tr key={p.id}>
// // //                                                 <td>
// // //                                                     <div className="cdp-learner-cell">
// // //                                                         <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // //                                                         <div className="cdp-learner-cell__info">
// // //                                                             <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // //                                                             <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // //                                                         </div>
// // //                                                     </div>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 500 }}>
// // //                                                         {formatDate(p.startDate)} <span style={{ color: "#94a3b8", margin: "0 4px" }}>→</span> {formatDate(p.endDate)}
// // //                                                     </div>
// // //                                                     <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>{p.placementType}</div>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <div style={{ fontSize: "0.8rem", color: p.hasMentor ? "var(--mlab-midnight)" : "#dc2626", fontWeight: p.hasMentor ? 500 : 700, display: "flex", alignItems: "center", gap: "4px" }}>
// // //                                                         {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> Unassigned</>}
// // //                                                     </div>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <span className={`cdp-status-badge ${p.status.toLowerCase().includes("active") ? "cdp-status-badge--active" : p.status.toLowerCase().includes("terminate") ? "cdp-status-badge--dropped" : ""}`} style={p.status.toLowerCase().includes("pending") ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" } : p.status.toLowerCase().includes("complete") || p.status.toLowerCase().includes("absorb") ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } : {}}>
// // //                                                         {p.status.replace("_", " ")}
// // //                                                     </span>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     {/* 🚀 NEW: PERCENTAGE COMPLIANCE PROGRESS BAR */}
// // //                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
// // //                                                         <span style={{ fontSize: '0.85rem', fontWeight: 700, color: p.complianceScore === 100 ? '#16a34a' : '#d97706' }}>{p.complianceScore}%</span>
// // //                                                         <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{p.complianceScore === 100 ? 'Audit Ready' : 'Incomplete'}</span>
// // //                                                     </div>
// // //                                                     <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// // //                                                         <div style={{ height: '100%', width: `${p.complianceScore}%`, background: p.complianceScore === 100 ? '#16a34a' : '#f59e0b', transition: 'width 0.3s ease-out' }} />
// // //                                                     </div>
// // //                                                     {p.complianceScore < 100 && (
// // //                                                         <div style={{ fontSize: '0.65rem', color: '#dc2626', marginTop: '4px', fontWeight: 600 }}>
// // //                                                             Missing {p.complianceItems.filter(i => i.isRequired && !i.isComplete).length} required item(s)
// // //                                                         </div>
// // //                                                     )}
// // //                                                 </td>
// // //                                                 <td style={{ textAlign: "right" }}>
// // //                                                     <button
// // //                                                         type="button"
// // //                                                         onClick={() => setDrawerPlacement(p)}
// // //                                                         style={{
// // //                                                             background: "white", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
// // //                                                             color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px", transition: "all 0.2s"
// // //                                                         }}
// // //                                                     >
// // //                                                         Review <ChevronRight size={14} />
// // //                                                     </button>
// // //                                                 </td>
// // //                                             </tr>
// // //                                         );
// // //                                     })
// // //                                 ) : (
// // //                                     <tr>
// // //                                         <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
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

// // // // import React, { useMemo, useState, useRef, useEffect } from "react";
// // // // import { createPortal } from "react-dom";
// // // // import { collection, query, where, getDocs, doc, onSnapshot, updateDoc, writeBatch } from "firebase/firestore";
// // // // import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
// // // // import { db, storage } from "../../../../lib/firebase";
// // // // import {
// // // //     ArrowLeft, MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
// // // //     ShieldCheck, ChevronRight, Activity, RefreshCw, UploadCloud, ChevronDown, ChevronUp, Archive,
// // // //     CheckSquare, Square,
// // // //     Edit,
// // // //     LinkIcon,
// // // //     Save
// // // // } from "lucide-react";
// // // // import moment from "moment";
// // // // import * as XLSX from "xlsx";

// // // // // Modularized components
// // // // import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
// // // // import { LogbookAuditModal } from "./LogbookAuditModal";
// // // // import { StipendDisbursementModal } from "./StipendDisbursementModal";
// // // // import { BulkStipendUploader } from "./BulkStipendUploader";

// // // // import type { DashboardLearner, Employer, PlacementContract } from "../../../../types";
// // // // import { useStore, type StaffMember } from "../../../../store/useStore";
// // // // import { getFunctions, httpsCallable } from "firebase/functions";
// // // // import { EvidenceExportModal } from "../../PlacementsDashboard/EvidenceExportModal";
// // // // import { ToastContainer, useToast } from "../../../common/Toast/Toast";

// // // // export interface CompanyInsightsViewProps {
// // // //     company: Employer;
// // // //     onBack: () => void;
// // // // }

// // // // // 🚀 EXPANDED INTERFACE TO HOLD COMPLIANCE SCORE AND INDIVIDUAL ITEMS
// // // // export interface EnrichedPlacement extends PlacementContract {
// // // //     placementType: string;
// // // //     bbbeeSpendCategory: string;
// // // //     compliance: {
// // // //         isAgreementFullyExecuted: boolean;
// // // //         wblpaAgreementUrl?: string;
// // // //         employmentContractUrl?: string;
// // // //     };
// // // //     complianceScore: number;
// // // //     complianceItems: {
// // // //         key: string;
// // // //         label: string;
// // // //         isComplete: boolean;
// // // //         url?: string;
// // // //         actionType: 'upload' | 'assign' | 'none';
// // // //         dbTarget: 'learner' | 'placement';
// // // //     }[];
// // // //     learnerName: string;
// // // //     idNumber: string;
// // // //     equityGroup: string;
// // // //     hasDisability: boolean;
// // // //     isFemale: boolean;
// // // //     isYouth: boolean;
// // // //     mentorName: string;
// // // //     hasMentor: boolean;
// // // //     isEtiEligible: boolean;
// // // //     etiMonthlyValue: number;
// // // //     projectedStipendSpend: number;
// // // //     s12hAllowanceTotal: number;
// // // //     attendancePercentage: number;
// // // //     approvedWpHours: number;
// // // //     pendingWpHours: number;
// // // //     draftWpHours: number;
// // // //     rejectedWpHours: number;
// // // //     currentMonthApprovedDays: number;
// // // //     expectedWorkingDaysThisMonth: number;
// // // //     currentMonthEarnedStipend: number;
// // // // }

// // // // interface PlacementStats {
// // // //     activeCount: number;
// // // //     completedCount: number;
// // // //     droppedCount: number;
// // // //     missingContracts: number;
// // // //     nonCompliantCount: number;
// // // // }

// // // // interface ComplianceMetricsData {
// // // //     transformationPercentage: number;
// // // //     disabilityPercentage: number;
// // // //     disabilityCount: number;
// // // //     youthPercentage: number;
// // // //     youthCount: number;
// // // //     etiYieldPercentage: number;
// // // //     monthlyETITotal: number;
// // // //     annualizedETIEstimate: number;
// // // //     absorptionRate: number;
// // // //     totalProjectedSpend: number;
// // // //     totalS12hProjected: number;
// // // //     totalFemale: number;
// // // //     totalMale: number;
// // // //     absorbedFemale: number;
// // // //     absorbedMale: number;
// // // //     raceCounts: { African: number; Coloured: number; Indian: number; White: number; Other: number };
// // // //     overloadedMentors: number;
// // // // }

// // // // const getSAWorkingDaysInMonth = (year: number, month: number, holidays: string[]) => {
// // // //     const start = moment([year, month, 1]);
// // // //     const end = moment(start).endOf('month');
// // // //     let days = 0;

// // // //     let current = start.clone();
// // // //     while (current.isSameOrBefore(end)) {
// // // //         if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
// // // //             if (!holidays.includes(current.format('YYYY-MM-DD'))) {
// // // //                 days++;
// // // //             }
// // // //         }
// // // //         current.add(1, 'days');
// // // //     }
// // // //     return days;
// // // // };

// // // // /* ─── ETI BREAKDOWN MODAL ─── */
// // // // const EtiBreakdownModal: React.FC<{ learner: EnrichedPlacement; onClose: () => void; }> = ({ learner, onClose }) => {
// // // //     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
// // // //     const wage = Number(learner.stipendAmount) || 0;
// // // //     const eti = Number(learner.etiMonthlyValue) || 0;
// // // //     const annualEti = eti * 12;

// // // //     let mathString = "";
// // // //     if (wage < 2000) mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
// // // //     else if (wage >= 2000 && wage <= 4499) mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// // // //     else if (wage >= 4500 && wage < 6500) mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
// // // //     else mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;

// // // //     return createPortal(
// // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center" }}>
// // // //             <div className="wm-modal" onClick={(e) => e.stopPropagation()} style={{ width: "480px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
// // // //                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
// // // //                     <div>
// // // //                         <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#16a34a", fontWeight: 800, fontSize: "1.1rem" }}><Landmark size={20} /> SARS ETI Tax Rebate Audit</div>
// // // //                         <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>Calculated for {learner.learnerName}</div>
// // // //                     </div>
// // // //                     <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
// // // //                 </div>

// // // //                 <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
// // // //                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
// // // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Database Stipend Value:</span>
// // // //                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(wage)}</strong>
// // // //                     </div>
// // // //                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
// // // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Official ETI Calculation:</span>
// // // //                         <strong style={{ fontSize: "1.1rem", color: "#16a34a" }}>{formatCurrency(eti)} /mo</strong>
// // // //                     </div>
// // // //                     <div style={{ display: "flex", justifyContent: "space-between" }}>
// // // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Annualized Projection:</span>
// // // //                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(annualEti)}</strong>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>Mathematical Formula Check:</div>
// // // //                 <div style={{ background: "#e0e7ff", padding: "12px", borderRadius: "6px", fontSize: "0.85rem", color: "#3730a3", fontFamily: "monospace", fontWeight: 600, marginBottom: "1rem" }}>{mathString}</div>

// // // //                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>The SARS Rules (Ages 18-29):</div>
// // // //                 <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem", color: "#475569", display: "flex", flexDirection: "column", gap: "6px" }}>
// // // //                     <li style={{ color: wage > 0 && wage < 2000 ? "#16a34a" : "inherit", fontWeight: wage > 0 && wage < 2000 ? 700 : 400 }}>If stipend is R0 – R1,999: ETI = 75% of stipend</li>
// // // //                     <li style={{ color: wage >= 2000 && wage <= 4499 ? "#16a34a" : "inherit", fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400 }}>If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)</li>
// // // //                     <li style={{ color: wage >= 4500 && wage < 6500 ? "#16a34a" : "inherit", fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400 }}>If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend - R4,500])</li>
// // // //                     <li style={{ color: wage >= 6500 ? "#dc2626" : "inherit", fontWeight: wage >= 6500 ? 700 : 400 }}>If stipend is R6,500 or more: ETI = R0</li>
// // // //                 </ul>

// // // //                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: "100%", marginTop: "1.5rem", justifyContent: "center" }}>Close Audit Trail</button>
// // // //             </div>
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };

// // // // /* ─── PLACEMENT DETAILS SLIDE-OVER DRAWER ─── */
// // // // interface PlacementDetailsDrawerProps {
// // // //     placement: EnrichedPlacement;
// // // //     companyName: string;
// // // //     workplaceLogs: any[];
// // // //     saHolidays: string[];
// // // //     onClose: () => void;
// // // //     onOpenEti: (p: EnrichedPlacement) => void;
// // // //     onOpenLogs: (p: EnrichedPlacement) => void;
// // // //     onEditPlacement: (p: EnrichedPlacement) => void;
// // // // }

// // // // export const PlacementDetailsDrawer: React.FC<PlacementDetailsDrawerProps> = ({ placement, companyName, workplaceLogs, saHolidays, onClose, onOpenEti, onOpenLogs, onEditPlacement }) => {

// // // //     const toast = useToast();
// // // //     const [isExportModalOpen, setIsExportModalOpen] = useState(false);
// // // //     const [isGeneratingPack, setIsGeneratingPack] = useState(false);
// // // //     const [auditPackError, setAuditPackError] = useState<string | null>(null);
// // // //     const [showDisbursementModal, setShowDisbursementModal] = useState(false);
// // // //     const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);

// // // //     const [disbursements, setDisbursements] = useState<any[]>([]);
// // // //     const [isLoadingLedger, setIsLoadingLedger] = useState(true);
// // // //     const [isLedgerExpanded, setIsLedgerExpanded] = useState(false);

// // // //     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
// // // //     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

// // // //     useEffect(() => {
// // // //         const fetchLedger = async () => {
// // // //             setIsLoadingLedger(true);
// // // //             try {
// // // //                 const snap = await getDocs(collection(db, `placements/${placement.id}/disbursements`));
// // // //                 const list = snap.docs.map(doc => doc.data()).sort((a, b) => String(b.monthYear).localeCompare(String(a.monthYear)));
// // // //                 setDisbursements(list);
// // // //             } catch (error) {
// // // //                 console.error("Failed to load ledger", error);
// // // //             } finally {
// // // //                 setIsLoadingLedger(false);
// // // //             }
// // // //         };
// // // //         fetchLedger();
// // // //     }, [placement.id, showDisbursementModal]);

// // // //     // 🚀 DYNAMIC COMPLIANCE UPLOAD HANDLER
// // // //     const handleUploadComplianceDoc = async (e: React.ChangeEvent<HTMLInputElement>, item: any) => {
// // // //         const file = e.target.files?.[0];
// // // //         if (!file) return;

// // // //         setUploadingDocKey(item.key);
// // // //         try {
// // // //             const safeName = placement.learnerName.replace(/[^a-zA-Z0-9]/g, '_');
// // // //             const fileRef = ref(storage, `compliance/${placement.id}/${item.key}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // // //             await uploadBytes(fileRef, file);
// // // //             const downloadUrl = await getDownloadURL(fileRef);

// // // //             if (item.dbTarget === 'learner') {
// // // //                 await updateDoc(doc(db, 'learners', placement.learnerId), {
// // // //                     [`documents.${item.key}`]: downloadUrl,
// // // //                     idDocumentUrl: item.key === 'idDoc' ? downloadUrl : undefined,
// // // //                     updatedAt: new Date().toISOString()
// // // //                 });
// // // //             } else {
// // // //                 await updateDoc(doc(db, 'placements', placement.id), {
// // // //                     [`compliance.${item.key === 'wblpa' ? 'wblpaAgreementUrl' : 'employmentContractUrl'}`]: downloadUrl,
// // // //                     updatedAt: new Date().toISOString()
// // // //                 });
// // // //             }
// // // //             toast.success(`${item.label} uploaded successfully!`);
// // // //         } catch (err: any) {
// // // //             toast.error("Failed to upload document.");
// // // //         } finally {
// // // //             setUploadingDocKey(null);
// // // //             if (e.target) e.target.value = ''; // Reset input
// // // //         }
// // // //     };

// // // //     const handleDownloadAuditPack = async (selectedFolders: string[]) => {
// // // //         setIsGeneratingPack(true);
// // // //         setAuditPackError(null);
// // // //         try {
// // // //             const functions = getFunctions();
// // // //             const generateSetaAuditPack = httpsCallable(functions, "generateSetaAuditPack");

// // // //             const response = await generateSetaAuditPack({
// // // //                 learnerId: placement.learnerId, placementId: placement.id, employerName: companyName,
// // // //                 learnerName: placement.learnerName, idNumber: placement.idNumber, mentorName: placement.mentorName,
// // // //                 selectedFolders: selectedFolders
// // // //             });

// // // //             const data = response.data as { success: boolean; url: string };
// // // //             if (data.success && data.url) {
// // // //                 window.location.href = data.url;
// // // //                 setIsExportModalOpen(false);
// // // //             }
// // // //             else setAuditPackError("Server failed to supply a valid download path.");
// // // //         } catch (error: any) {
// // // //             setAuditPackError(error.message || "Failed to generate the compliance audit pack.");
// // // //         } finally {
// // // //             setIsGeneratingPack(false);
// // // //         }
// // // //     };

// // // //     return createPortal(
// // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99990, display: "flex", justifyContent: "flex-end", position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.3)", backdropFilter: "blur(2px)" }}>

// // // //             {isExportModalOpen && (
// // // //                 <EvidenceExportModal
// // // //                     learnerName={placement.learnerName}
// // // //                     onClose={() => setIsExportModalOpen(false)}
// // // //                     onGenerate={handleDownloadAuditPack}
// // // //                     isGenerating={isGeneratingPack}
// // // //                 />
// // // //             )}

// // // //             <div onClick={(e) => e.stopPropagation()} style={{ width: "450px", maxWidth: "100%", height: "100%", background: "#f8fafc", display: "flex", flexDirection: "column", boxShadow: "-10px 0 25px rgba(0,0,0,0.1)", animation: "slideInRight 0.3s ease-out" }}>
// // // //                 <div style={{ padding: "1.5rem", background: "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
// // // //                     <div>
// // // //                         <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
// // // //                             <div className="cdp-learner-avatar">{placement.learnerName.charAt(0)}</div>
// // // //                             <div><h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>{placement.learnerName}</h3><p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>ID: {placement.idNumber}</p></div>
// // // //                         </div>
// // // //                     </div>
// // // //                     <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}><X size={20} /></button>
// // // //                 </div>

// // // //                 <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

// // // //                     {/* 🚀 NEW: DYNAMIC COMPLIANCE VAULT AND PROGRESS TRACKER */}
// // // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // // //                         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
// // // //                             <h4 style={{ margin: 0, fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} /> Compliance & Audit Readiness</h4>
// // // //                             <span style={{ fontSize: "1.1rem", fontWeight: 800, color: placement.complianceScore === 100 ? "#16a34a" : "var(--mlab-amber)", fontFamily: "var(--font-heading)" }}>{placement.complianceScore}%</span>
// // // //                         </div>

// // // //                         <div style={{ width: "100%", background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "1rem" }}>
// // // //                             <div style={{ width: `${placement.complianceScore}%`, background: placement.complianceScore === 100 ? "#16a34a" : "var(--mlab-amber)", height: "100%", transition: "width 0.3s ease-out" }} />
// // // //                         </div>

// // // //                         <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem" }}>
// // // //                             {placement.complianceItems.map((item) => (
// // // //                                 <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '6px' }}>
// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
// // // //                                         {item.isComplete ? <CheckSquare size={14} color="#16a34a" /> : <Square size={14} color="#94a3b8" />}
// // // //                                         {item.label}
// // // //                                     </div>
// // // //                                     <div>
// // // //                                         {item.isComplete ? (
// // // //                                             item.url ? (
// // // //                                                 <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                     <FileText size={12} /> View
// // // //                                                 </a>
// // // //                                             ) : (
// // // //                                                 <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>VERIFIED</span>
// // // //                                             )
// // // //                                         ) : (
// // // //                                             item.actionType === 'upload' ? (
// // // //                                                 <label style={{ fontSize: '0.7rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, cursor: uploadingDocKey === item.key ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                     {uploadingDocKey === item.key ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
// // // //                                                     {uploadingDocKey === item.key ? 'Uploading...' : 'Upload'}
// // // //                                                     <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => handleUploadComplianceDoc(e, item)} disabled={uploadingDocKey === item.key} />
// // // //                                                 </label>
// // // //                                             ) : item.actionType === 'assign' ? (
// // // //                                                 <button onClick={() => onEditPlacement(placement)} style={{ fontSize: '0.7rem', color: 'white', background: '#d97706', border: 'none', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                     <User size={10} /> Assign
// // // //                                                 </button>
// // // //                                             ) : null
// // // //                                         )}
// // // //                                     </div>
// // // //                                 </div>
// // // //                             ))}
// // // //                         </div>

// // // //                         {placement.complianceScore === 100 && (
// // // //                             <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s" }}>
// // // //                                 {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
// // // //                                 {isGeneratingPack ? "Compiling Cloud Zip..." : "Download SETA Audit Pack (.zip)"}
// // // //                             </button>
// // // //                         )}
// // // //                         {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
// // // //                     </div>

// // // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Briefcase size={14} /> Placement Trajectory</h4>
// // // //                         <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
// // // //                             <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Start Date</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.startDate)}</div></div>
// // // //                             <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Expected End</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.endDate)}</div></div>
// // // //                             <div style={{ gridColumn: "1 / -1", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}><div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "4px" }}>Workplace Supervisor</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: placement.hasMentor ? "var(--mlab-midnight)" : "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>{placement.hasMentor ? <><User size={14} /> {placement.mentorName}</> : <><AlertTriangle size={14} /> Unassigned</>}</div></div>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Landmark size={14} /> Finance & Contracts</h4>
// // // //                         <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
// // // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>Monthly Base Stipend</span><span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-midnight)", textDecoration: placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) ? 'line-through' : 'none' }}>{formatCurrency(placement.stipendAmount)} /mo</span></div>
// // // //                             {placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) && (
// // // //                                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: "6px" }}>
// // // //                                     <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700 }}>EARNED THIS MONTH</span><span style={{ fontSize: "0.65rem", color: "#991b1b" }}>Based on {placement.currentMonthApprovedDays} / {placement.expectedWorkingDaysThisMonth} expected days</span></div>
// // // //                                     <span style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626" }}>{formatCurrency(placement.currentMonthEarnedStipend)}</span>
// // // //                                 </div>
// // // //                             )}
// // // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>SARS ETI Claim</span>{placement.isEtiEligible && placement.etiMonthlyValue > 0 ? (<button onClick={() => onOpenEti(placement)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", color: "#166534", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Coins size={12} /> {formatCurrency(placement.etiMonthlyValue)} /mo</button>) : (<span style={{ fontSize: "0.75rem", color: "#64748b", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>Ineligible</span>)}</div>

// // // //                             {/* ACCORDION HISTORY LEDGER */}
// // // //                             <div style={{ paddingTop: "10px", borderTop: "1px solid #f1f5f9", marginTop: "4px" }}>
// // // //                                 <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Historical Payments Ledger</div>
// // // //                                 {isLoadingLedger ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}><Loader2 size={12} className="wm-spin" /> Loading records...</div>) : disbursements.length === 0 ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>No disbursements logged yet.</div>) : (
// // // //                                     <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
// // // //                                         <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
// // // //                                             <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{disbursements[0].monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{disbursements[0].bankReference}</div></div>
// // // //                                             <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(disbursements[0].netPayment)}</div>{disbursements[0].payslipEftUrl ? (<a href={disbursements[0].payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
// // // //                                         </div>
// // // //                                         {disbursements.length > 1 && (
// // // //                                             <div style={{ marginTop: "4px" }}>
// // // //                                                 <button onClick={() => setIsLedgerExpanded(!isLedgerExpanded)} style={{ width: "100%", background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}>
// // // //                                                     <span>{isLedgerExpanded ? "Hide older payments" : `View ${disbursements.length - 1} older payment(s)`}</span>{isLedgerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
// // // //                                                 </button>
// // // //                                                 {isLedgerExpanded && (
// // // //                                                     <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
// // // //                                                         {disbursements.slice(1).map((d, i) => (
// // // //                                                             <div key={i} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.85 }}>
// // // //                                                                 <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{d.monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{d.bankReference}</div></div>
// // // //                                                                 <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(d.netPayment)}</div>{d.payslipEftUrl ? (<a href={d.payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
// // // //                                                             </div>
// // // //                                                         ))}
// // // //                                                     </div>
// // // //                                                 )}
// // // //                                             </div>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Activity size={14} /> Audit & Logbook Activity</h4>
// // // //                         <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
// // // //                             <div>
// // // //                                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#475569", marginBottom: "6px", fontWeight: 600 }}>
// // // //                                     <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> Campus Attendance Ratio</span>
// // // //                                     <span style={{ color: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#d97706" : "#dc2626" }}>{placement.attendancePercentage}%</span>
// // // //                                 </div>
// // // //                                 <div style={{ width: "100%", background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
// // // //                                     <div style={{ width: `${placement.attendancePercentage}%`, background: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#f59e0b" : "#ef4444", height: "100%" }} />
// // // //                                 </div>
// // // //                             </div>
// // // //                             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
// // // //                                 <div><div style={{ fontSize: "0.7rem", color: "#16a34a", fontWeight: 700 }}>✅ MENTOR APPROVED HOURS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#15803d" }}>{Number(placement.approvedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // // //                                 <div><div style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 700 }}>⏳ WAITING FOR MENTOR</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#b45309" }}>{Number(placement.pendingWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // // //                                 <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#dc2626", fontWeight: 700 }}>❌ REJECTED LOGS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c2410c" }}>{Number(placement.rejectedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // // //                                 <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>📝 DRAFT (NOT SUBMITTED)</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#475569" }}>{Number(placement.draftWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // // //                             </div>
// // // //                             <button onClick={() => onOpenLogs(placement)} style={{ width: "100%", padding: "10px", background: "white", border: "1px solid var(--mlab-blue)", color: "var(--mlab-blue)", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.background = "#eff6ff"; }} onMouseOut={(e) => { e.currentTarget.style.background = "white"; }}>
// // // //                                 <FileText size={16} /> Open Complete Logbook Audit
// // // //                             </button>
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>

// // // //             {showDisbursementModal && (
// // // //                 <StipendDisbursementModal placement={placement} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setShowDisbursementModal(false)} />
// // // //             )}
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };

// // // // export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
// // // //     const { learners, staff } = useStore() as any;
// // // //     const placements = useStore((s) => (s as unknown as { placements?: PlacementContract[] }).placements) || [];

// // // //     const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
// // // //     const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
// // // //     const [workplaceLogs, setWorkplaceLogs] = useState<any[]>([]);
// // // //     const [isComplianceLoading, setIsComplianceLoading] = useState(true);
// // // //     const [saHolidays, setSaHolidays] = useState<string[]>([]);

// // // //     const [activeTab, setActiveTab] = useState<"active" | "history" | "all" | "action_required">("active");
// // // //     const [searchQuery, setSearchQuery] = useState("");
// // // //     const [showExportMenu, setShowExportMenu] = useState(false);

// // // //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);
// // // //     const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(null);
// // // //     const [drawerPlacement, setDrawerPlacement] = useState<EnrichedPlacement | null>(null);
// // // //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);

// // // //     const menuRef = useRef<HTMLDivElement>(null);

// // // //     // 🚀 NEW STATE: Bulk Job Monitoring
// // // //     const [bulkJobId, setBulkJobId] = useState<string | null>(null);
// // // //     const [bulkJobStatus, setBulkJobStatus] = useState<{ status: string, completedTasks: number, totalTasks: number, downloadUrl?: string | null } | null>(null);
// // // //     const [isRequestingBulk, setIsRequestingBulk] = useState(false);

// // // //     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

// // // //     const companyPlacements = useMemo(() => placements.filter((p) => p.employerId === company.id), [placements, company.id]);
// // // //     const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

// // // //     const placementLearnerIdsStr = useMemo(() => companyPlacements.map(p => p.learnerId).sort().join(","), [companyPlacements]);

// // // //     useEffect(() => {
// // // //         const fetchHolidays = async () => {
// // // //             try {
// // // //                 const year = new Date().getFullYear();
// // // //                 const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`);
// // // //                 if (res.ok) {
// // // //                     const data = await res.json();
// // // //                     setSaHolidays(data.map((h: any) => h.date));
// // // //                 }
// // // //             } catch (error) {
// // // //                 console.error("Error fetching SA holidays:", error);
// // // //             }
// // // //         };
// // // //         fetchHolidays();
// // // //     }, []);

// // // //     const fetchDeepComplianceData = async () => {
// // // //         setIsComplianceLoading(true);
// // // //         try {
// // // //             const logsUnifiedMap = new Map<string, any>();
// // // //             const wpQueryEmp = query(collection(db, "workplace_logs"), where("employerId", "==", company.id));
// // // //             const wpSnapEmp = await getDocs(wpQueryEmp);
// // // //             wpSnapEmp.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));

// // // //             const relevantLearnerIds = new Set<string>();
// // // //             companyPlacements.forEach(p => {
// // // //                 if (p.learnerId) relevantLearnerIds.add(String(p.learnerId).trim());
// // // //                 const l = learners.find((x: any) => x.id === p.learnerId);
// // // //                 if (l && l.idNumber && String(l.idNumber).trim() !== "") {
// // // //                     relevantLearnerIds.add(String(l.idNumber).trim());
// // // //                 }
// // // //             });

// // // //             const placementStudentPool = Array.from(relevantLearnerIds).filter(Boolean);

// // // //             for (let i = 0; i < placementStudentPool.length; i += 10) {
// // // //                 const studentChunk = placementStudentPool.slice(i, i + 10);
// // // //                 if (studentChunk.length === 0) continue;
// // // //                 const wpQueryLearner = query(collection(db, "workplace_logs"), where("learnerId", "in", studentChunk));
// // // //                 const wpSnapLearner = await getDocs(wpQueryLearner);
// // // //                 wpSnapLearner.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));
// // // //             }

// // // //             const compiledWpLogs = Array.from(logsUnifiedMap.values());
// // // //             setWorkplaceLogs(compiledWpLogs);

// // // //             const relevantCohortIds = new Set<string>();
// // // //             companyPlacements.forEach((p) => { if (p.cohortId) relevantCohortIds.add(p.cohortId); });
// // // //             const cohortIdsArray = Array.from(relevantCohortIds);
// // // //             let fetchedAttLogs: any[] = [];
// // // //             let fetchedAttRecords: any[] = [];
// // // //             for (const cId of cohortIdsArray) {
// // // //                 if (!cId) continue;
// // // //                 const logsQ = query(collection(db, "attendance_logs"), where("cohortId", "==", cId));
// // // //                 const recsQ = query(collection(db, "attendance_records"), where("cohortId", "==", cId));
// // // //                 const [lSnap, rSnap] = await Promise.all([getDocs(logsQ), getDocs(recsQ)]);
// // // //                 fetchedAttLogs.push(...lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
// // // //                 fetchedAttRecords.push(...rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
// // // //             }

// // // //             setAttendanceLogs(fetchedAttLogs);
// // // //             setAttendanceRecords(fetchedAttRecords);
// // // //         } catch (error) {
// // // //             console.error("Deep compliance fetch error:", error);
// // // //         } finally {
// // // //             setIsComplianceLoading(false);
// // // //         }
// // // //     };

// // // //     useEffect(() => {
// // // //         if (placementLearnerIdsStr.length > 0) {
// // // //             fetchDeepComplianceData();
// // // //         } else {
// // // //             setIsComplianceLoading(false);
// // // //         }
// // // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // // //     }, [company.id, placementLearnerIdsStr]);

// // // //     const { activeCount, completedCount, droppedCount, missingContracts, nonCompliantCount } = useMemo<PlacementStats>(() => {
// // // //         let active = 0, completed = 0, dropped = 0, missing = 0, nonCompliant = 0;
// // // //         companyPlacements.forEach((p) => {
// // // //             const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean } };
// // // //             const statusLower = p.status.toLowerCase();
// // // //             if (statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview")) {
// // // //                 active++;
// // // //                 const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
// // // //                 const hasMentor = !!(p.assignedMentorName || (placementRecord as any).mentorId);
// // // //                 if (!isFullySigned) missing++;
// // // //                 if (!isFullySigned || !hasMentor) nonCompliant++;
// // // //             }
// // // //             if (p.status === "Completed" || p.status === "absorbed_permanently") completed++;
// // // //             if (p.status === "Terminated") dropped++;
// // // //         });
// // // //         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing, nonCompliantCount: nonCompliant };
// // // //     }, [companyPlacements]);

// // // //     // 🚀 MASTER ENRICHMENT & COMPLIANCE SCORING ENGINE
// // // //     const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
// // // //         return companyPlacements
// // // //             .map((p) => {
// // // //                 const learner = learners.find((l: any) => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// // // //                 const placementRecord = p as PlacementContract & {
// // // //                     placementType?: string;
// // // //                     compliance?: { isAgreementFullyExecuted?: boolean; wblpaAgreementUrl?: string; employmentContractUrl?: string; bbbeeSpendCategory?: string; };
// // // //                     bbbeeSpendCategory?: string;
// // // //                     mentorId?: string;
// // // //                     cohortId?: string;
// // // //                 };

// // // //                 const mentor = companyMentors.find((m: any) => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);
// // // //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string; disabilityStatus?: string; };
// // // //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || "Unknown";
// // // //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || "No Disability";

// // // //                 let isEtiEligible = false;
// // // //                 let isFemale = false;
// // // //                 let isYouth = true;

// // // //                 if (learner.idNumber && learner.idNumber.length >= 13) {
// // // //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// // // //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // // //                     const age = new Date().getFullYear() - birthYear;
// // // //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// // // //                     if (age > 35) isYouth = false;
// // // //                     const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
// // // //                     if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
// // // //                 } else if ((learner.demographics as any)?.genderCode === "F" || (extendedLearner as any).gender === "Female") {
// // // //                     isFemale = true;
// // // //                 }

// // // //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), "months", true);
// // // //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

// // // //                 let etiMonthlyValue = 0;
// // // //                 const wage = Number(p.stipendAmount) || 0;
// // // //                 if (isEtiEligible && wage > 0) {
// // // //                     if (wage < 2000) etiMonthlyValue = wage * 0.75;
// // // //                     else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
// // // //                     else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - 0.75 * (wage - 4500), 0);
// // // //                 }

// // // //                 const hasDisability = disability !== "No Disability" && disability !== "None" && disability !== "N/A" && disability !== "No" && disability !== "N";
// // // //                 const s12hAllowanceTotal = hasDisability ? 120000 : 80000;
// // // //                 const cohortId = learner.cohortId || placementRecord.cohortId;
// // // //                 const safeLearnerId = String(p.learnerId || "").trim().toLowerCase();
// // // //                 const safeIdNumber = String(learner.idNumber || "").trim().toLowerCase();

// // // //                 let attendancePercentage = 0;
// // // //                 if (cohortId) {
// // // //                     const learnerAttRecords = attendanceRecords.filter((r: any) => r.cohortId === cohortId && (String(r.learnerId).trim().toLowerCase() === safeLearnerId || String(r.learnerId).trim().toLowerCase() === safeIdNumber));
// // // //                     const learnerAttPresent = learnerAttRecords.filter((r: any) => r.status === "Present" || r.status === "Partial").length;
// // // //                     const cohortTotalSessions = attendanceLogs.filter((l: any) => l.cohortId === cohortId).length;
// // // //                     attendancePercentage = cohortTotalSessions > 0 ? Math.round((learnerAttPresent / cohortTotalSessions) * 100) : 0;
// // // //                 }

// // // //                 const learnerWpLogs = workplaceLogs.filter((l: any) => {
// // // //                     const logLId = String(l.learnerId || "").trim().toLowerCase();
// // // //                     return (safeLearnerId !== "" && logLId === safeLearnerId) || (safeIdNumber !== "" && logLId === safeIdNumber);
// // // //                 });

// // // //                 const approvedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // // //                     const stat = String(l.status || "").trim().toLowerCase();
// // // //                     return stat === "approved" ? sum + (Number(l.totalHours) || 0) : sum;
// // // //                 }, 0);

// // // //                 const pendingWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // // //                     const stat = String(l.status || "").trim().toLowerCase();
// // // //                     return (stat === "pending_mentor_approval" || stat === "pending") ? sum + (Number(l.totalHours) || 0) : sum;
// // // //                 }, 0);

// // // //                 const rejectedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // // //                     const stat = String(l.status || "").trim().toLowerCase();
// // // //                     return stat === "rejected" ? sum + (Number(l.totalHours) || 0) : sum;
// // // //                 }, 0);

// // // //                 const draftWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // // //                     const stat = String(l.status || "").trim().toLowerCase();
// // // //                     return (stat === "draft" || stat === "") ? sum + (Number(l.totalHours) || 0) : sum;
// // // //                 }, 0);

// // // //                 const currentYear = moment().year();
// // // //                 const currentMonth = moment().month();
// // // //                 const currentMonthStr = moment().format('YYYY-MM');
// // // //                 const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, saHolidays);

// // // //                 const currentMonthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr));
// // // //                 const approvedDatesThisMonth = new Set(
// // // //                     currentMonthWpLogs.filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved").map((l: any) => l.dateString)
// // // //                 );
// // // //                 const currentMonthApprovedDays = approvedDatesThisMonth.size;

// // // //                 let currentMonthEarnedStipend = wage;
// // // //                 if (expectedWorkingDaysThisMonth > 0 && wage > 0) {
// // // //                     const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * wage;
// // // //                     currentMonthEarnedStipend = Math.round(Math.min(calculatedProRata, wage) * 100) / 100;
// // // //                 }

// // // //                 // 🚀 COMPLIANCE RESOLUTION LOGIC
// // // //                 let idUrl = learner.documents?.idDocument || learner.idUrl || learner.idDocumentUrl || "";
// // // //                 let wblpaUrl = placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl || "";
// // // //                 let empContractUrl = placementRecord.compliance?.employmentContractUrl || "";

// // // //                 // Deep scan uploadedDocuments
// // // //                 const learnerUserDoc = (useStore.getState() as any).users?.find((u: any) => u.id === learner.authUid) || {};
// // // //                 const arraysToScan = [...(learner.uploadedDocuments || []), ...(p?.uploadedDocuments || []), ...(learnerUserDoc?.uploadedDocuments || [])];
// // // //                 arraysToScan.forEach((doc: any) => {
// // // //                     const docId = String(doc.id || "").toLowerCase();
// // // //                     const name = String(doc.name || "").toLowerCase();
// // // //                     if (!idUrl && (docId === "id" || name.includes("id") || name.includes("identity") || name.includes("passport"))) idUrl = doc.url;
// // // //                     if (!wblpaUrl && (docId === "wblpa" || docId === "contract" || name.includes("contract") || name.includes("wblpa") || name.includes("agreement"))) wblpaUrl = doc.url;
// // // //                     if (!empContractUrl && (docId === "emp_contract" || name.includes("employment"))) empContractUrl = doc.url;
// // // //                 });

// // // //                 const hasMentorAssigned = !!(p.assignedMentorName || placementRecord.mentorId || mentor.id);

// // // //                 const complianceItems: EnrichedPlacement["complianceItems"] = [
// // // //                     { key: 'mentor', label: 'Workplace Mentor Assigned', isComplete: hasMentorAssigned, actionType: 'assign', dbTarget: 'placement' },
// // // //                     { key: 'idDoc', label: 'Certified ID Document', isComplete: !!idUrl, url: idUrl, actionType: 'upload', dbTarget: 'learner' },
// // // //                     { key: 'wblpa', label: 'WBLPA Contract', isComplete: !!wblpaUrl, url: wblpaUrl, actionType: 'upload', dbTarget: 'placement' },
// // // //                     { key: 'empContract', label: 'Employment Contract', isComplete: !!empContractUrl, url: empContractUrl, actionType: 'upload', dbTarget: 'placement' }
// // // //                 ];

// // // //                 const completedItemsCount = complianceItems.filter(i => i.isComplete).length;
// // // //                 const complianceScore = Math.round((completedItemsCount / complianceItems.length) * 100);

// // // //                 return {
// // // //                     ...p,
// // // //                     placementType: placementRecord.placementType || "QCTO Workplace Module",
// // // //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || "Uncategorized",
// // // //                     compliance: {
// // // //                         isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === "boolean" ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
// // // //                         wblpaAgreementUrl: wblpaUrl,
// // // //                         employmentContractUrl: empContractUrl
// // // //                     },
// // // //                     complianceScore,
// // // //                     complianceItems,
// // // //                     learnerName: learner.fullName || "Unknown Learner",
// // // //                     idNumber: learner.idNumber || "—",
// // // //                     equityGroup: equity,
// // // //                     isFemale,
// // // //                     isYouth,
// // // //                     hasDisability,
// // // //                     mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
// // // //                     hasMentor: hasMentorAssigned,
// // // //                     isEtiEligible,
// // // //                     etiMonthlyValue,
// // // //                     projectedStipendSpend: wage * verifiedTimeline,
// // // //                     s12hAllowanceTotal,
// // // //                     attendancePercentage,
// // // //                     approvedWpHours,
// // // //                     pendingWpHours,
// // // //                     rejectedWpHours,
// // // //                     draftWpHours,
// // // //                     currentMonthApprovedDays,
// // // //                     expectedWorkingDaysThisMonth,
// // // //                     currentMonthEarnedStipend
// // // //                 };
// // // //             })
// // // //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // // //     }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs, saHolidays]);

// // // //     useEffect(() => {
// // // //         if (drawerPlacement) {
// // // //             const updatedMatch = enrichedPlacements.find(x => x.id === drawerPlacement.id);
// // // //             if (updatedMatch) setDrawerPlacement(updatedMatch);
// // // //         }
// // // //     }, [enrichedPlacements]);

// // // //     const complianceMetrics = useMemo<ComplianceMetricsData>(() => {
// // // //         let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
// // // //         let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
// // // //         let totalFemale = 0, totalMale = 0, absorbedFemale = 0, absorbedMale = 0;
// // // //         let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
// // // //         let mentorLoad: Record<string, number> = {};

// // // //         enrichedPlacements.forEach((p) => {
// // // //             const statusLower = p.status.toLowerCase();
// // // //             const isLive = statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview");
// // // //             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes("absorb") || (p as any).isAbsorbed;

// // // //             if (isLive && p.hasMentor) mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;

// // // //             const eq = p.equityGroup.trim().toLowerCase();
// // // //             if (eq.includes("african") || eq === "black" || eq === "ba") { raceCounts.African++; blackACI++; if (p.isFemale) blackFemale++; }
// // // //             else if (eq.includes("coloured") || eq === "bc") { raceCounts.Coloured++; blackACI++; if (p.isFemale) blackFemale++; }
// // // //             else if (eq.includes("indian") || eq === "bi") { raceCounts.Indian++; blackACI++; if (p.isFemale) blackFemale++; }
// // // //             else if (eq.includes("white") || eq === "w") { raceCounts.White++; }
// // // //             else { raceCounts.Other++; }

// // // //             if (p.isFemale) totalFemale++; else totalMale++;
// // // //             if (p.isYouth) youthCount++;
// // // //             if (isAbsorbed) { if (p.isFemale) absorbedFemale++; else absorbedMale++; }
// // // //             if (p.hasDisability) disabilityCount++;

// // // //             if (isLive) {
// // // //                 if (p.etiMonthlyValue > 0) activeEtiYielders++;
// // // //                 monthlyEtiSum += p.etiMonthlyValue;
// // // //                 accumulatedSpend += p.projectedStipendSpend;
// // // //             }

// // // //             if (isLive || statusLower.includes("complete") || statusLower.includes("absorb")) {
// // // //                 totalS12hProjected += p.s12hAllowanceTotal;
// // // //             }
// // // //         });

// // // //         const overloadedMentors = Object.entries(mentorLoad).filter(([_, count]) => count > 4).length;

// // // //         return {
// // // //             transformationPercentage: enrichedPlacements.length > 0 ? Math.round((blackACI / enrichedPlacements.length) * 100) : 0,
// // // //             disabilityPercentage: enrichedPlacements.length > 0 ? Math.round((disabilityCount / enrichedPlacements.length) * 100) : 0,
// // // //             disabilityCount,
// // // //             youthPercentage: enrichedPlacements.length > 0 ? Math.round((youthCount / enrichedPlacements.length) * 100) : 0,
// // // //             youthCount,
// // // //             etiYieldPercentage: activeCount > 0 ? Math.round((activeEtiYielders / activeCount) * 100) : 0,
// // // //             monthlyETITotal: monthlyEtiSum,
// // // //             annualizedETIEstimate: monthlyEtiSum * 12,
// // // //             absorptionRate: completedCount > 0 ? Math.round(((absorbedFemale + absorbedMale) / completedCount) * 100) : 0,
// // // //             totalProjectedSpend: accumulatedSpend,
// // // //             totalS12hProjected,
// // // //             totalFemale,
// // // //             totalMale,
// // // //             absorbedFemale,
// // // //             absorbedMale,
// // // //             raceCounts,
// // // //             overloadedMentors,
// // // //         };
// // // //     }, [enrichedPlacements, activeCount, completedCount]);

// // // //     const formatCurrency = (val?: number | string | null) =>
// // // //         new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);

// // // //     const displayedPlacements = useMemo(() => {
// // // //         return enrichedPlacements.filter((p) => {
// // // //             const sLower = p.status.toLowerCase();
// // // //             if (activeTab === "action_required") {
// // // //                 if (p.complianceScore === 100) return false;
// // // //             }
// // // //             if (activeTab === "active" && !sLower.includes("active") && !sLower.includes("pending") && !sLower.includes("interview")) return false;
// // // //             if (activeTab === "history" && !sLower.includes("complete") && !sLower.includes("terminate") && !sLower.includes("absorb")) return false;
// // // //             if (searchQuery) {
// // // //                 const q = searchQuery.toLowerCase();
// // // //                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
// // // //             }
// // // //             return true;
// // // //         });
// // // //     }, [enrichedPlacements, activeTab, searchQuery]);

// // // //     const handleExportExcel = () => {
// // // //         const data = displayedPlacements.map((p) => ({
// // // //             "Learner Name": p.learnerName,
// // // //             "ID Number": p.idNumber,
// // // //             "Race (EE Code)": p.equityGroup,
// // // //             Gender: p.isFemale ? "Female" : "Male",
// // // //             "Placement Type": p.placementType,
// // // //             "Monthly Stipend": Number(p.stipendAmount || 0).toFixed(2),
// // // //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${Number(p.etiMonthlyValue).toFixed(2)}/mo)` : "No",
// // // //             "Compliance Score": `${p.complianceScore}%`,
// // // //             "Start Date": p.startDate ? moment(p.startDate).format("YYYY-MM-DD") : "—",
// // // //             "Expected End Date": p.endDate ? moment(p.endDate).format("YYYY-MM-DD") : "—",
// // // //             "Assigned Mentor": p.mentorName,
// // // //             "Operational Status": p.status.toUpperCase(),
// // // //         }));
// // // //         if (data.length === 0) return;
// // // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // // //         const workbook = XLSX.utils.book_new();
// // // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
// // // //         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, "_");
// // // //         XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
// // // //         setShowExportMenu(false);
// // // //     };

// // // //     const handleExportCSV = () => {
// // // //         const data = displayedPlacements.map((p) => ({
// // // //             "Learner Name": p.learnerName,
// // // //             "ID Number": p.idNumber,
// // // //             "Placement Type": p.placementType,
// // // //             "Compliance Score": `${p.complianceScore}%`,
// // // //             "Operational Status": p.status.toUpperCase(),
// // // //         }));
// // // //         if (data.length === 0) return;
// // // //         const headers = Object.keys(data[0]);
// // // //         const csvRows = data.map((row) => headers.map((header) => `"${(row as Record<string, unknown>)[header]}"`).join(","));
// // // //         const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
// // // //         const link = document.createElement("a");
// // // //         link.href = URL.createObjectURL(blob);
// // // //         link.setAttribute("download", `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`);
// // // //         document.body.appendChild(link);
// // // //         link.click();
// // // //         document.body.removeChild(link);
// // // //         setShowExportMenu(false);
// // // //     };

// // // //     const handleTriggerBulkExport = async () => {
// // // //         if (displayedPlacements.length === 0) return;
// // // //         setIsRequestingBulk(true);
// // // //         setShowExportMenu(false);
// // // //         try {
// // // //             const fns = getFunctions();
// // // //             const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");
// // // //             const payloadPlacements = displayedPlacements.map(p => ({
// // // //                 learnerId: p.learnerId, placementId: p.id, learnerName: p.learnerName, idNumber: p.idNumber, mentorName: p.mentorName
// // // //             }));
// // // //             const response = await requestBulkAuditPacks({ companyId: company.id, companyName: company.name, placements: payloadPlacements });
// // // //             const data = response.data as { success: boolean, jobId: string };
// // // //             if (data.success && data.jobId) setBulkJobId(data.jobId);
// // // //         } catch (error) {
// // // //             console.error("Failed to start bulk export:", error);
// // // //             alert("Failed to start bulk export process. Check console for details.");
// // // //         } finally {
// // // //             setIsRequestingBulk(false);
// // // //         }
// // // //     };

// // // //     useEffect(() => {
// // // //         if (!bulkJobId) return;
// // // //         const unsubscribe = onSnapshot(doc(db, "compliance_jobs", bulkJobId), (docSnap) => {
// // // //             if (docSnap.exists()) {
// // // //                 const data = docSnap.data() as any;
// // // //                 setBulkJobStatus({ status: data.status, completedTasks: data.completedTasks || 0, totalTasks: data.totalTasks || 0, downloadUrl: data.downloadUrl || null });
// // // //                 if (data.status === "complete" && data.downloadUrl) {
// // // //                     window.location.href = data.downloadUrl;
// // // //                     setTimeout(() => { setBulkJobId(null); setBulkJobStatus(null); }, 8000);
// // // //                 }
// // // //             }
// // // //         });
// // // //         return () => unsubscribe();
// // // //     }, [bulkJobId]);

// // // //     const { fetchStaff: syncStaff } = useStore() as any;

// // // //     return (
// // // //         <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "2rem" }}>
// // // //             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
// // // //             {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}
// // // //             {drawerPlacement && (
// // // //                 <PlacementDetailsDrawer
// // // //                     placement={drawerPlacement}
// // // //                     companyName={company.name}
// // // //                     workplaceLogs={workplaceLogs}
// // // //                     saHolidays={saHolidays}
// // // //                     onClose={() => setDrawerPlacement(null)}
// // // //                     onOpenEti={setEtiBreakdownLearner}
// // // //                     onOpenLogs={setAuditLearner}
// // // //                     onEditPlacement={(p) => setEditingPlacement(p)}
// // // //                 />
// // // //             )}

// // // //             {editingPlacement && (
// // // //                 <EditPlacementModal
// // // //                     placement={editingPlacement}
// // // //                     mentors={companyMentors}
// // // //                     cohorts={[]}
// // // //                     learners={learners}
// // // //                     onClose={() => setEditingPlacement(null)}
// // // //                     onSaved={() => { }}
// // // //                 />
// // // //             )}

// // // //             {/* ── BREADCRUMB & HEADER ── */}
// // // //             <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
// // // //                 <button onClick={onBack} style={{ background: "white", border: "1px solid var(--mlab-border)", borderRadius: "8px", padding: "8px", cursor: "pointer", color: "var(--mlab-midnight)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "4px" }}>
// // // //                     <ArrowLeft size={18} />
// // // //                 </button>
// // // //                 <div>
// // // //                     <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Host Company Profile</div>
// // // //                     <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
// // // //                         <h1 style={{ margin: 0, fontSize: "1.8rem", fontFamily: "var(--font-heading)", color: "var(--mlab-midnight)", lineHeight: 1.2 }}>{company.name}</h1>
// // // //                         {isComplianceLoading && <Loader2 size={20} className="wm-spin" color="var(--mlab-blue)" />}
// // // //                         <button onClick={fetchDeepComplianceData} disabled={isComplianceLoading} style={{ background: "var(--mlab-blue)", color: "white", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", marginLeft: "1rem" }}>
// // // //                             <RefreshCw size={12} className={isComplianceLoading ? "wm-spin" : ""} /> Sync Database
// // // //                         </button>
// // // //                     </div>

// // // //                     <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", fontSize: "0.85rem", color: "#475569" }}>
// // // //                         {company.registrationNumber && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Hash size={13} /> {company.registrationNumber}</span>}
// // // //                         {company.physicalAddress && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={13} /> {company.physicalAddress}</span>}
// // // //                         {company.contactPerson && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Mail size={13} /> {company.contactEmail}</span>}
// // // //                     </div>
// // // //                 </div>
// // // //             </div>

// // // //             {complianceMetrics.overloadedMentors > 0 && (
// // // //                 <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", color: "#991b1b", fontSize: "0.8rem", fontWeight: 600 }}>
// // // //                     <ShieldAlert size={16} />
// // // //                     <span><strong>SETA Quality Warning:</strong> {complianceMetrics.overloadedMentors} assigned mentor(s) currently exceed the recommended 1:4 supervisor-to-learner load constraint.</span>
// // // //                 </div>
// // // //             )}

// // // //             <div className="cdp-stat-row">
// // // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Interns</span></div>
// // // //                 </div>
// // // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // // //                     <div className="cdp-stat-card__icon"><Award size={20} /></div>
// // // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{completedCount}</span><span className="cdp-stat-card__label">Completed Programs</span></div>
// // // //                 </div>
// // // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // // //                     <div className="cdp-stat-card__icon"><FileText size={20} /></div>
// // // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit" }}>{missingContracts}</span><span className="cdp-stat-card__label">Missing Contracts</span></div>
// // // //                 </div>
// // // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // // //                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
// // // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? "var(--mlab-red)" : "inherit" }}>{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Terminated</span></div>
// // // //                 </div>
// // // //             </div>

// // // //             <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />

// // // //             <div className="cdp-panel">
// // // //                 <div className="vp-card" style={{ marginBottom: 0 }}>
// // // //                     <div className="vp-card-header" style={{ borderBottom: "none", flexDirection: "row", display: "flex", justifyContent: "space-between", paddingBottom: 0 }}>
// // // //                         <div className="vp-card-title-group">
// // // //                             <Users size={18} color="var(--mlab-blue)" />
// // // //                             <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--mlab-blue)", textTransform: "uppercase" }}>Placement Ledger</h3>
// // // //                         </div>
// // // //                         <div>
// // // //                             <BulkStipendUploader
// // // //                                 placements={displayedPlacements}
// // // //                                 saHolidays={saHolidays}
// // // //                                 onSuccess={() => { fetchDeepComplianceData(); }}
// // // //                             />
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* 🚀 LIVE PROGRESS BANNER FOR BULK EXPORT */}
// // // //                     {bulkJobStatus && (
// // // //                         <div style={{ margin: "1rem 1.5rem 0", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }} className="animate-fade-in">
// // // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
// // // //                                 <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--mlab-blue)", fontWeight: 700, fontSize: "0.85rem" }}>
// // // //                                     {bulkJobStatus.status === "processing" ? <Loader2 size={16} className="wm-spin" /> : <Archive size={16} color="#16a34a" />}
// // // //                                     {bulkJobStatus.status === "processing" ? "Compiling Bulk Audit Packs..." : bulkJobStatus.status === "zipping" ? "Merging Cloud Stream..." : "Download Ready!"}
// // // //                                 </div>
// // // //                                 <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>
// // // //                                     {bulkJobStatus.completedTasks} / {bulkJobStatus.totalTasks} Processed
// // // //                                 </div>
// // // //                             </div>

// // // //                             <div style={{ width: "100%", background: "#e0f2fe", height: "10px", borderRadius: "5px", overflow: "hidden" }}>
// // // //                                 <div style={{
// // // //                                     width: `${bulkJobStatus.totalTasks > 0 ? (bulkJobStatus.completedTasks / bulkJobStatus.totalTasks) * 100 : 0}%`,
// // // //                                     background: bulkJobStatus.status === "complete" ? "#16a34a" : "var(--mlab-blue)",
// // // //                                     height: "100%",
// // // //                                     transition: "width 0.3s ease-out"
// // // //                                 }} />
// // // //                             </div>

// // // //                             {bulkJobStatus.status === "complete" && bulkJobStatus.downloadUrl && (
// // // //                                 <a href={bulkJobStatus.downloadUrl} style={{ background: "#16a34a", color: "white", padding: "8px", borderRadius: "6px", textDecoration: "none", fontSize: "0.8rem", fontWeight: 700, textAlign: "center", marginTop: "8px", display: "inline-block" }}>
// // // //                                     Click here if your download doesn't start automatically
// // // //                                 </a>
// // // //                             )}
// // // //                         </div>
// // // //                     )}

// // // //                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 1.5rem", borderBottom: "1px solid var(--mlab-border)", marginTop: "1rem", background: "#f8fafc", flexWrap: "wrap", gap: "1rem" }}>
// // // //                         <div style={{ display: "flex", gap: "1.5rem" }}>
// // // //                             <button onClick={() => setActiveTab("active")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "active" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "active" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "active" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // // //                                 Active Interns <span style={{ background: activeTab === "active" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "active" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{activeCount}</span>
// // // //                             </button>

// // // //                             <button onClick={() => setActiveTab("action_required")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "action_required" ? "#b91c1c" : "#64748b", fontWeight: activeTab === "action_required" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "action_required" ? "2px solid #b91c1c" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // // //                                 Action Required <span style={{ background: activeTab === "action_required" ? "#fee2e2" : "#f1f5f9", color: activeTab === "action_required" ? "#b91c1c" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{nonCompliantCount}</span>
// // // //                             </button>

// // // //                             <button onClick={() => setActiveTab("history")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "history" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "history" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "history" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // // //                                 History <span style={{ background: activeTab === "history" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "history" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{completedCount + droppedCount}</span>
// // // //                             </button>
// // // //                             <button onClick={() => setActiveTab("all")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "all" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "all" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "all" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // // //                                 All Records <span style={{ background: activeTab === "all" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "all" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{enrichedPlacements.length}</span>
// // // //                             </button>
// // // //                         </div>

// // // //                         <div style={{ display: "flex", gap: "8px", paddingBottom: "8px" }}>
// // // //                             <div style={{ position: "relative", display: "flex", alignItems: "center", background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "0 8px" }}>
// // // //                                 <Search size={14} color="#64748b" />
// // // //                                 <input type="text" placeholder="Search ledger..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: "none", padding: "8px", outline: "none", background: "transparent", fontSize: "0.8rem", width: "200px" }} />
// // // //                                 {searchQuery && <button type="button" onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex" }}><X size={12} /></button>}
// // // //                             </div>

// // // //                             <div style={{ position: "relative" }} ref={menuRef}>
// // // //                                 <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={displayedPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: "white", fontSize: "0.8rem", padding: "6px 12px", opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? "not-allowed" : "pointer" }}>
// // // //                                     <DownloadCloud size={14} /> Export
// // // //                                 </button>
// // // //                                 {showExportMenu && displayedPlacements.length > 0 && (
// // // //                                     <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 50, minWidth: "220px", overflow: "hidden" }} className="animate-fade-in">
// // // //                                         <button type="button" onClick={handleExportCSV} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download Data as CSV</button>
// // // //                                         <button type="button" onClick={handleExportExcel} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download Data as Excel</button>
// // // //                                         {/* 🚀 NEW BULK EXPORT BUTTON IN THE DROPDOWN */}
// // // //                                         <button
// // // //                                             type="button"
// // // //                                             onClick={handleTriggerBulkExport}
// // // //                                             disabled={isRequestingBulk || !!bulkJobId}
// // // //                                             style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "#f8fafc", border: "none", cursor: (isRequestingBulk || !!bulkJobId) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 600, opacity: (isRequestingBulk || !!bulkJobId) ? 0.5 : 1 }}
// // // //                                         >
// // // //                                             <Archive size={14} color="#073f4e" />
// // // //                                             {isRequestingBulk ? "Starting Job..." : "Generate Bulk SETA Pack (.zip)"}
// // // //                                         </button>
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="mlab-table-wrap">
// // // //                         {isComplianceLoading && <div style={{ padding: "1rem", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} className="wm-spin" /> Verifying deep compliance logs...</div>}

// // // //                         <table className="mlab-table">
// // // //                             <colgroup>
// // // //                                 <col style={{ width: "20%" }} />
// // // //                                 <col style={{ width: "20%" }} />
// // // //                                 <col style={{ width: "15%" }} />
// // // //                                 <col style={{ width: "15%" }} />
// // // //                                 <col style={{ width: "20%" }} />
// // // //                                 <col style={{ width: "10%" }} />
// // // //                             </colgroup>
// // // //                             <thead>
// // // //                                 <tr>
// // // //                                     <th>Learner Profile</th>
// // // //                                     <th>Placement Scope</th>
// // // //                                     <th>Assigned Mentor</th>
// // // //                                     <th>Status</th>
// // // //                                     <th>Compliance Progress</th>
// // // //                                     <th style={{ textAlign: "right" }}>Actions</th>
// // // //                                 </tr>
// // // //                             </thead>
// // // //                             <tbody>
// // // //                                 {displayedPlacements.length > 0 ? (
// // // //                                     displayedPlacements.map((p) => {
// // // //                                         return (
// // // //                                             <tr key={p.id}>
// // // //                                                 <td>
// // // //                                                     <div className="cdp-learner-cell">
// // // //                                                         <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // // //                                                         <div className="cdp-learner-cell__info">
// // // //                                                             <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // // //                                                             <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // // //                                                         </div>
// // // //                                                     </div>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 500 }}>
// // // //                                                         {formatDate(p.startDate)} <span style={{ color: "#94a3b8", margin: "0 4px" }}>→</span> {formatDate(p.endDate)}
// // // //                                                     </div>
// // // //                                                     <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>{p.placementType}</div>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <div style={{ fontSize: "0.8rem", color: p.hasMentor ? "var(--mlab-midnight)" : "#dc2626", fontWeight: p.hasMentor ? 500 : 700, display: "flex", alignItems: "center", gap: "4px" }}>
// // // //                                                         {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> Unassigned</>}
// // // //                                                     </div>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     <span className={`cdp-status-badge ${p.status.toLowerCase().includes("active") ? "cdp-status-badge--active" : p.status.toLowerCase().includes("terminate") ? "cdp-status-badge--dropped" : ""}`} style={p.status.toLowerCase().includes("pending") ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" } : p.status.toLowerCase().includes("complete") || p.status.toLowerCase().includes("absorb") ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } : {}}>
// // // //                                                         {p.status.replace("_", " ")}
// // // //                                                     </span>
// // // //                                                 </td>
// // // //                                                 <td>
// // // //                                                     {/* 🚀 NEW: PERCENTAGE COMPLIANCE PROGRESS BAR */}
// // // //                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
// // // //                                                         <span style={{ fontSize: '0.85rem', fontWeight: 700, color: p.complianceScore === 100 ? '#16a34a' : '#d97706' }}>{p.complianceScore}%</span>
// // // //                                                         <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{p.complianceScore === 100 ? 'Audit Ready' : 'Incomplete'}</span>
// // // //                                                     </div>
// // // //                                                     <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// // // //                                                         <div style={{ height: '100%', width: `${p.complianceScore}%`, background: p.complianceScore === 100 ? '#16a34a' : '#f59e0b', transition: 'width 0.3s ease-out' }} />
// // // //                                                     </div>
// // // //                                                     {p.complianceScore < 100 && (
// // // //                                                         <div style={{ fontSize: '0.65rem', color: '#dc2626', marginTop: '4px', fontWeight: 600 }}>
// // // //                                                             Missing {p.complianceItems.filter(i => !i.isComplete).length} required item(s)
// // // //                                                         </div>
// // // //                                                     )}
// // // //                                                 </td>
// // // //                                                 <td style={{ textAlign: "right" }}>
// // // //                                                     <button
// // // //                                                         type="button"
// // // //                                                         onClick={() => setDrawerPlacement(p)}
// // // //                                                         style={{
// // // //                                                             background: "white", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
// // // //                                                             color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px", transition: "all 0.2s"
// // // //                                                         }}
// // // //                                                     >
// // // //                                                         Review <ChevronRight size={14} />
// // // //                                                     </button>
// // // //                                                 </td>
// // // //                                             </tr>
// // // //                                         );
// // // //                                     })
// // // //                                 ) : (
// // // //                                     <tr>
// // // //                                         <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
// // // //                                             {searchQuery ? `No records matched your search query for "${searchQuery}".` : `No placement history matches found for this host company configuration.`}
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



// // // // // // src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

// // // // // import React, { useMemo, useState, useRef, useEffect } from "react";
// // // // // import { createPortal } from "react-dom";
// // // // // import { collection, query, where, getDocs, doc, onSnapshot } from "firebase/firestore";
// // // // // import { db } from "../../../../lib/firebase";
// // // // // import {
// // // // //     ArrowLeft, MapPin, Mail, Hash, Briefcase, CheckCircle, AlertTriangle, Users, Award, FileText, Search, X, DownloadCloud, User, FileSpreadsheet, Landmark, Coins, ShieldAlert, Calendar, Loader2,
// // // // //     ShieldCheck, ChevronRight, Activity, RefreshCw, UploadCloud, ChevronDown, ChevronUp, Archive
// // // // // } from "lucide-react";
// // // // // import moment from "moment";
// // // // // import * as XLSX from "xlsx";

// // // // // // Modularized components
// // // // // import { ComplianceMetricsGrid } from "./ComplianceMetricsGrid";
// // // // // import { LogbookAuditModal } from "./LogbookAuditModal";
// // // // // import { StipendDisbursementModal } from "./StipendDisbursementModal";
// // // // // import { BulkStipendUploader } from "./BulkStipendUploader";

// // // // // import type { DashboardLearner, Employer, PlacementContract } from "../../../../types";
// // // // // import { useStore, type StaffMember } from "../../../../store/useStore";
// // // // // import { getFunctions, httpsCallable } from "firebase/functions";
// // // // // import { EvidenceExportModal } from "../../PlacementsDashboard/EvidenceExportModal";

// // // // // export interface CompanyInsightsViewProps {
// // // // //     company: Employer;
// // // // //     onBack: () => void;
// // // // // }

// // // // // export interface EnrichedPlacement extends PlacementContract {
// // // // //     placementType: string;
// // // // //     bbbeeSpendCategory: string;
// // // // //     compliance: {
// // // // //         isAgreementFullyExecuted: boolean;
// // // // //         wblpaAgreementUrl?: string;
// // // // //     };
// // // // //     learnerName: string;
// // // // //     idNumber: string;
// // // // //     equityGroup: string;
// // // // //     hasDisability: boolean;
// // // // //     isFemale: boolean;
// // // // //     isYouth: boolean;
// // // // //     mentorName: string;
// // // // //     hasMentor: boolean;
// // // // //     isEtiEligible: boolean;
// // // // //     etiMonthlyValue: number;
// // // // //     projectedStipendSpend: number;
// // // // //     s12hAllowanceTotal: number;
// // // // //     attendancePercentage: number;
// // // // //     approvedWpHours: number;
// // // // //     pendingWpHours: number;
// // // // //     draftWpHours: number;
// // // // //     rejectedWpHours: number;
// // // // //     currentMonthApprovedDays: number;
// // // // //     expectedWorkingDaysThisMonth: number;
// // // // //     currentMonthEarnedStipend: number;
// // // // // }

// // // // // interface PlacementStats {
// // // // //     activeCount: number;
// // // // //     completedCount: number;
// // // // //     droppedCount: number;
// // // // //     missingContracts: number;
// // // // //     nonCompliantCount: number;
// // // // // }

// // // // // interface ComplianceMetricsData {
// // // // //     transformationPercentage: number;
// // // // //     disabilityPercentage: number;
// // // // //     disabilityCount: number;
// // // // //     youthPercentage: number;
// // // // //     youthCount: number;
// // // // //     etiYieldPercentage: number;
// // // // //     monthlyETITotal: number;
// // // // //     annualizedETIEstimate: number;
// // // // //     absorptionRate: number;
// // // // //     totalProjectedSpend: number;
// // // // //     totalS12hProjected: number;
// // // // //     totalFemale: number;
// // // // //     totalMale: number;
// // // // //     absorbedFemale: number;
// // // // //     absorbedMale: number;
// // // // //     raceCounts: { African: number; Coloured: number; Indian: number; White: number; Other: number };
// // // // //     overloadedMentors: number;
// // // // // }

// // // // // const getSAWorkingDaysInMonth = (year: number, month: number, holidays: string[]) => {
// // // // //     const start = moment([year, month, 1]);
// // // // //     const end = moment(start).endOf('month');
// // // // //     let days = 0;

// // // // //     let current = start.clone();
// // // // //     while (current.isSameOrBefore(end)) {
// // // // //         if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
// // // // //             if (!holidays.includes(current.format('YYYY-MM-DD'))) {
// // // // //                 days++;
// // // // //             }
// // // // //         }
// // // // //         current.add(1, 'days');
// // // // //     }
// // // // //     return days;
// // // // // };

// // // // // /* ─── ETI BREAKDOWN MODAL ─── */
// // // // // const EtiBreakdownModal: React.FC<{ learner: EnrichedPlacement; onClose: () => void; }> = ({ learner, onClose }) => {
// // // // //     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
// // // // //     const wage = Number(learner.stipendAmount) || 0;
// // // // //     const eti = Number(learner.etiMonthlyValue) || 0;
// // // // //     const annualEti = eti * 12;

// // // // //     let mathString = "";
// // // // //     if (wage < 2000) mathString = `${formatCurrency(wage)} (Stipend) × 75% = ${formatCurrency(eti)}/mo`;
// // // // //     else if (wage >= 2000 && wage <= 4499) mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// // // // //     else if (wage >= 4500 && wage < 6500) mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R4,500)) = ${formatCurrency(eti)}/mo`;
// // // // //     else mathString = `Stipend exceeds R6,500 upper limit. ETI Claim = R0`;

// // // // //     return createPortal(
// // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center" }}>
// // // // //             <div className="wm-modal" onClick={(e) => e.stopPropagation()} style={{ width: "480px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
// // // // //                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
// // // // //                     <div>
// // // // //                         <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#16a34a", fontWeight: 800, fontSize: "1.1rem" }}><Landmark size={20} /> SARS ETI Tax Rebate Audit</div>
// // // // //                         <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>Calculated for {learner.learnerName}</div>
// // // // //                     </div>
// // // // //                     <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
// // // // //                 </div>

// // // // //                 <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
// // // // //                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
// // // // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Database Stipend Value:</span>
// // // // //                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(wage)}</strong>
// // // // //                     </div>
// // // // //                     <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "8px" }}>
// // // // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Official ETI Calculation:</span>
// // // // //                         <strong style={{ fontSize: "1.1rem", color: "#16a34a" }}>{formatCurrency(eti)} /mo</strong>
// // // // //                     </div>
// // // // //                     <div style={{ display: "flex", justifyContent: "space-between" }}>
// // // // //                         <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Annualized Projection:</span>
// // // // //                         <strong style={{ fontSize: "0.9rem", color: "var(--mlab-midnight)" }}>{formatCurrency(annualEti)}</strong>
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>Mathematical Formula Check:</div>
// // // // //                 <div style={{ background: "#e0e7ff", padding: "12px", borderRadius: "6px", fontSize: "0.85rem", color: "#3730a3", fontFamily: "monospace", fontWeight: 600, marginBottom: "1rem" }}>{mathString}</div>

// // // // //                 <div style={{ fontSize: "0.8rem", color: "var(--mlab-midnight)", fontWeight: 700, marginBottom: "8px" }}>The SARS Rules (Ages 18-29):</div>
// // // // //                 <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem", color: "#475569", display: "flex", flexDirection: "column", gap: "6px" }}>
// // // // //                     <li style={{ color: wage > 0 && wage < 2000 ? "#16a34a" : "inherit", fontWeight: wage > 0 && wage < 2000 ? 700 : 400 }}>If stipend is R0 – R1,999: ETI = 75% of stipend</li>
// // // // //                     <li style={{ color: wage >= 2000 && wage <= 4499 ? "#16a34a" : "inherit", fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400 }}>If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)</li>
// // // // //                     <li style={{ color: wage >= 4500 && wage < 6500 ? "#16a34a" : "inherit", fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400 }}>If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend - R4,500])</li>
// // // // //                     <li style={{ color: wage >= 6500 ? "#dc2626" : "inherit", fontWeight: wage >= 6500 ? 700 : 400 }}>If stipend is R6,500 or more: ETI = R0</li>
// // // // //                 </ul>

// // // // //                 {/* 🚀 FIXED JSX COMPILER PANIC HERE (justifyContent) */}
// // // // //                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: "100%", marginTop: "1.5rem", justifyContent: "center" }}>Close Audit Trail</button>
// // // // //             </div>
// // // // //         </div>,
// // // // //         document.body
// // // // //     );
// // // // // };

// // // // // /* ─── PLACEMENT DETAILS SLIDE-OVER DRAWER ─── */
// // // // // interface PlacementDetailsDrawerProps {
// // // // //     placement: EnrichedPlacement;
// // // // //     companyName: string;
// // // // //     workplaceLogs: any[];
// // // // //     saHolidays: string[];
// // // // //     onClose: () => void;
// // // // //     onOpenEti: (p: EnrichedPlacement) => void;
// // // // //     onOpenLogs: (p: EnrichedPlacement) => void;
// // // // // }

// // // // // export const PlacementDetailsDrawer: React.FC<PlacementDetailsDrawerProps> = ({ placement, companyName, workplaceLogs, saHolidays, onClose, onOpenEti, onOpenLogs }) => {

// // // // //     // 🚀 NEW EXPORT MODAL STATE
// // // // //     const [isExportModalOpen, setIsExportModalOpen] = useState(false);

// // // // //     const [isGeneratingPack, setIsGeneratingPack] = useState(false);
// // // // //     const [auditPackError, setAuditPackError] = useState<string | null>(null);
// // // // //     const [showDisbursementModal, setShowDisbursementModal] = useState(false);

// // // // //     const [disbursements, setDisbursements] = useState<any[]>([]);
// // // // //     const [isLoadingLedger, setIsLoadingLedger] = useState(true);
// // // // //     const [isLedgerExpanded, setIsLedgerExpanded] = useState(false);

// // // // //     const formatCurrency = (val: any) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);
// // // // //     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

// // // // //     const isAuditReady = placement.hasMentor && placement.compliance.isAgreementFullyExecuted;
// // // // //     const missingItems = [];
// // // // //     if (!placement.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
// // // // //     if (!placement.hasMentor) missingItems.push("Workplace Mentor");

// // // // //     useEffect(() => {
// // // // //         const fetchLedger = async () => {
// // // // //             setIsLoadingLedger(true);
// // // // //             try {
// // // // //                 const snap = await getDocs(collection(db, `placements/${placement.id}/disbursements`));
// // // // //                 const list = snap.docs.map(doc => doc.data()).sort((a, b) => String(b.monthYear).localeCompare(String(a.monthYear)));
// // // // //                 setDisbursements(list);
// // // // //             } catch (error) {
// // // // //                 console.error("Failed to load ledger", error);
// // // // //             } finally {
// // // // //                 setIsLoadingLedger(false);
// // // // //             }
// // // // //         };
// // // // //         fetchLedger();
// // // // //     }, [placement.id, showDisbursementModal]);

// // // // //     // 🚀 MODIFIED HANDLER TO ACCEPT FOLDERS FROM THE MODAL
// // // // //     const handleDownloadAuditPack = async (selectedFolders: string[]) => {
// // // // //         setIsGeneratingPack(true);
// // // // //         setAuditPackError(null);
// // // // //         try {
// // // // //             const functions = getFunctions();
// // // // //             const generateSetaAuditPack = httpsCallable(functions, "generateSetaAuditPack");

// // // // //             const response = await generateSetaAuditPack({
// // // // //                 learnerId: placement.learnerId,
// // // // //                 placementId: placement.id,
// // // // //                 employerName: companyName,
// // // // //                 learnerName: placement.learnerName,
// // // // //                 idNumber: placement.idNumber,
// // // // //                 mentorName: placement.mentorName,
// // // // //                 selectedFolders: selectedFolders // 🚀 Passes user selection to backend
// // // // //             });

// // // // //             const data = response.data as { success: boolean; url: string };
// // // // //             if (data.success && data.url) {
// // // // //                 window.location.href = data.url;
// // // // //                 setIsExportModalOpen(false); // Close modal on success
// // // // //             }
// // // // //             else setAuditPackError("Server failed to supply a valid download path.");
// // // // //         } catch (error: any) {
// // // // //             setAuditPackError(error.message || "Failed to generate the compliance audit pack.");
// // // // //         } finally {
// // // // //             setIsGeneratingPack(false);
// // // // //         }
// // // // //     };

// // // // //     return createPortal(
// // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99990, display: "flex", justifyContent: "flex-end", position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.3)", backdropFilter: "blur(2px)" }}>

// // // // //             {isExportModalOpen && (
// // // // //                 <EvidenceExportModal
// // // // //                     learnerName={placement.learnerName}
// // // // //                     onClose={() => setIsExportModalOpen(false)}
// // // // //                     onGenerate={handleDownloadAuditPack}
// // // // //                     isGenerating={isGeneratingPack}
// // // // //                 />
// // // // //             )}

// // // // //             <div onClick={(e) => e.stopPropagation()} style={{ width: "450px", maxWidth: "100%", height: "100%", background: "#f8fafc", display: "flex", flexDirection: "column", boxShadow: "-10px 0 25px rgba(0,0,0,0.1)", animation: "slideInRight 0.3s ease-out" }}>
// // // // //                 <div style={{ padding: "1.5rem", background: "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
// // // // //                     <div>
// // // // //                         <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
// // // // //                             <div className="cdp-learner-avatar">{placement.learnerName.charAt(0)}</div>
// // // // //                             <div><h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--mlab-midnight)" }}>{placement.learnerName}</h3><p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>ID: {placement.idNumber}</p></div>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                     <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}><X size={20} /></button>
// // // // //                 </div>
// // // // //                 <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
// // // // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // // // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} /> Master Audit Status</h4>
// // // // //                         {isAuditReady ? (
// // // // //                             <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
// // // // //                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: '#15803d', fontSize: '0.85rem', fontWeight: 700 }}><CheckCircle size={18} /> Ready for SETA/SARS Verification</div>

// // // // //                                 {/* 🚀 UPDATED BUTTON OPENS MODAL */}
// // // // //                                 <button onClick={() => setIsExportModalOpen(true)} disabled={isGeneratingPack} style={{ width: "100%", padding: "10px", background: "var(--mlab-blue)", color: "white", border: "none", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: isGeneratingPack ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "background 0.2s" }}>
// // // // //                                     {isGeneratingPack ? <Loader2 size={16} className="wm-spin" /> : <DownloadCloud size={16} />}
// // // // //                                     {isGeneratingPack ? "Compiling Cloud Zip..." : "Download SETA Audit Pack (.zip)"}
// // // // //                                 </button>
// // // // //                             </div>
// // // // //                         ) : (
// // // // //                             <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '6px' }}>
// // // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}><AlertTriangle size={18} /> Non-Compliant Risks Detected</div>
// // // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{missingItems.map(m => (<div key={m} style={{ fontSize: '0.75rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}><X size={12} /> Missing {m}</div>))}</div>
// // // // //                             </div>
// // // // //                         )}
// // // // //                         {auditPackError && <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", color: "#991b1b", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={14} /> {auditPackError}</div>}
// // // // //                     </div>

// // // // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // // // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Briefcase size={14} /> Placement Trajectory</h4>
// // // // //                         <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
// // // // //                             <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Start Date</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.startDate)}</div></div>
// // // // //                             <div><div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Expected End</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--mlab-midnight)" }}>{formatDate(placement.endDate)}</div></div>
// // // // //                             <div style={{ gridColumn: "1 / -1", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}><div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "4px" }}>Workplace Supervisor</div><div style={{ fontSize: "0.85rem", fontWeight: 600, color: placement.hasMentor ? "var(--mlab-midnight)" : "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>{placement.hasMentor ? <><User size={14} /> {placement.mentorName}</> : <><AlertTriangle size={14} /> Unassigned</>}</div></div>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // // // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Landmark size={14} /> Finance & Contracts</h4>
// // // // //                         <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
// // // // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>Monthly Base Stipend</span><span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mlab-midnight)", textDecoration: placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) ? 'line-through' : 'none' }}>{formatCurrency(placement.stipendAmount)} /mo</span></div>
// // // // //                             {placement.currentMonthEarnedStipend < (Number(placement.stipendAmount) || 0) && (
// // // // //                                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: "6px" }}>
// // // // //                                     <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700 }}>EARNED THIS MONTH</span><span style={{ fontSize: "0.65rem", color: "#991b1b" }}>Based on {placement.currentMonthApprovedDays} / {placement.expectedWorkingDaysThisMonth} expected days</span></div>
// // // // //                                     <span style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626" }}>{formatCurrency(placement.currentMonthEarnedStipend)}</span>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>SARS ETI Claim</span>{placement.isEtiEligible && placement.etiMonthlyValue > 0 ? (<button onClick={() => onOpenEti(placement)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", color: "#166534", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Coins size={12} /> {formatCurrency(placement.etiMonthlyValue)} /mo</button>) : (<span style={{ fontSize: "0.75rem", color: "#64748b", background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>Ineligible</span>)}</div>
// // // // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}><span style={{ fontSize: "0.8rem", color: "#475569" }}>WBLPA Contract</span>{placement.compliance.isAgreementFullyExecuted ? (placement.compliance.wblpaAgreementUrl ? (<a href={placement.compliance.wblpaAgreementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#166534", background: "#dcfce7", padding: "4px 8px", borderRadius: "4px", border: "1px solid #bbf7d0", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}><FileText size={12} /> View Document</a>) : (<span style={{ fontSize: "0.75rem", color: "#166534", background: "#dcfce7", padding: "4px 8px", borderRadius: "4px", border: "1px solid #bbf7d0", fontWeight: 700 }}>Signed (No Link)</span>)) : (<span style={{ fontSize: "0.75rem", color: "#dc2626", background: "#fef2f2", padding: "4px 8px", borderRadius: "4px", border: "1px solid #fecaca", fontWeight: 700 }}>Not Uploaded</span>)}</div>

// // // // //                             {/* ACCORDION HISTORY LEDGER */}
// // // // //                             <div style={{ paddingTop: "10px", borderTop: "1px solid #f1f5f9", marginTop: "4px" }}>
// // // // //                                 <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Historical Payments Ledger</div>
// // // // //                                 {isLoadingLedger ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}><Loader2 size={12} className="wm-spin" /> Loading records...</div>) : disbursements.length === 0 ? (<div style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>No disbursements logged yet.</div>) : (
// // // // //                                     <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
// // // // //                                         <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
// // // // //                                             <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{disbursements[0].monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{disbursements[0].bankReference}</div></div>
// // // // //                                             <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(disbursements[0].netPayment)}</div>{disbursements[0].payslipEftUrl ? (<a href={disbursements[0].payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
// // // // //                                         </div>
// // // // //                                         {disbursements.length > 1 && (
// // // // //                                             <div style={{ marginTop: "4px" }}>
// // // // //                                                 <button onClick={() => setIsLedgerExpanded(!isLedgerExpanded)} style={{ width: "100%", background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}>
// // // // //                                                     <span>{isLedgerExpanded ? "Hide older payments" : `View ${disbursements.length - 1} older payment(s)`}</span>{isLedgerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
// // // // //                                                 </button>
// // // // //                                                 {isLedgerExpanded && (
// // // // //                                                     <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
// // // // //                                                         {disbursements.slice(1).map((d, i) => (
// // // // //                                                             <div key={i} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.85 }}>
// // // // //                                                                 <div><div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--mlab-midnight)" }}>{d.monthYear}</div><div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace" }}>{d.bankReference}</div></div>
// // // // //                                                                 <div style={{ textAlign: "right" }}><div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#16a34a" }}>{formatCurrency(d.netPayment)}</div>{d.payslipEftUrl ? (<a href={d.payslipEftUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.65rem", color: "var(--mlab-blue)", textDecoration: "underline" }}>View PoP</a>) : (<span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Bulk Sync</span>)}</div>
// // // // //                                                             </div>
// // // // //                                                         ))}
// // // // //                                                     </div>
// // // // //                                                 )}
// // // // //                                             </div>
// // // // //                                         )}
// // // // //                                     </div>
// // // // //                                 )}
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div style={{ background: "white", borderRadius: "8px", padding: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
// // // // //                         <h4 style={{ margin: "0 0 12px 0", fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}><Activity size={14} /> Audit & Logbook Activity</h4>
// // // // //                         <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
// // // // //                             <div>
// // // // //                                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#475569", marginBottom: "6px", fontWeight: 600 }}>
// // // // //                                     <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> Campus Attendance Ratio</span>
// // // // //                                     <span style={{ color: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#d97706" : "#dc2626" }}>{placement.attendancePercentage}%</span>
// // // // //                                 </div>
// // // // //                                 <div style={{ width: "100%", background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
// // // // //                                     <div style={{ width: `${placement.attendancePercentage}%`, background: placement.attendancePercentage >= 80 ? "#16a34a" : placement.attendancePercentage >= 50 ? "#f59e0b" : "#ef4444", height: "100%" }} />
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
// // // // //                                 <div><div style={{ fontSize: "0.7rem", color: "#16a34a", fontWeight: 700 }}>✅ MENTOR APPROVED HOURS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#15803d" }}>{Number(placement.approvedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // // // //                                 <div><div style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 700 }}>⏳ WAITING FOR MENTOR</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#b45309" }}>{Number(placement.pendingWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // // // //                                 <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#dc2626", fontWeight: 700 }}>❌ REJECTED LOGS</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c2410c" }}>{Number(placement.rejectedWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // // // //                                 <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}><div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>📝 DRAFT (NOT SUBMITTED)</div><div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#475569" }}>{Number(placement.draftWpHours || 0).toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>hrs</span></div></div>
// // // // //                             </div>
// // // // //                             <button onClick={() => onOpenLogs(placement)} style={{ width: "100%", padding: "10px", background: "white", border: "1px solid var(--mlab-blue)", color: "var(--mlab-blue)", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.background = "#eff6ff"; }} onMouseOut={(e) => { e.currentTarget.style.background = "white"; }}>
// // // // //                                 <FileText size={16} /> Open Complete Logbook Audit
// // // // //                             </button>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {showDisbursementModal && (
// // // // //                 <StipendDisbursementModal placement={placement} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setShowDisbursementModal(false)} />
// // // // //             )}
// // // // //         </div>,
// // // // //         document.body
// // // // //     );
// // // // // };

// // // // // export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
// // // // //     const { learners, staff } = useStore() as any;
// // // // //     const placements = useStore((s) => (s as unknown as { placements?: PlacementContract[] }).placements) || [];

// // // // //     const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
// // // // //     const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
// // // // //     const [workplaceLogs, setWorkplaceLogs] = useState<any[]>([]);
// // // // //     const [isComplianceLoading, setIsComplianceLoading] = useState(true);
// // // // //     const [saHolidays, setSaHolidays] = useState<string[]>([]);

// // // // //     const [activeTab, setActiveTab] = useState<"active" | "history" | "all" | "action_required">("active");
// // // // //     const [searchQuery, setSearchQuery] = useState("");
// // // // //     const [showExportMenu, setShowExportMenu] = useState(false);

// // // // //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);
// // // // //     const [auditLearner, setAuditLearner] = useState<EnrichedPlacement | null>(null);
// // // // //     const [drawerPlacement, setDrawerPlacement] = useState<EnrichedPlacement | null>(null);

// // // // //     const menuRef = useRef<HTMLDivElement>(null);

// // // // //     // 🚀 NEW STATE: Bulk Job Monitoring
// // // // //     const [bulkJobId, setBulkJobId] = useState<string | null>(null);
// // // // //     const [bulkJobStatus, setBulkJobStatus] = useState<{ status: string, completedTasks: number, totalTasks: number, downloadUrl?: string | null } | null>(null);
// // // // //     const [isRequestingBulk, setIsRequestingBulk] = useState(false);

// // // // //     const companyPlacements = useMemo(() => placements.filter((p) => p.employerId === company.id), [placements, company.id]);
// // // // //     const companyMentors = useMemo(() => staff.filter((s: any) => s.role === "mentor" && s.employerId === company.id && s.status !== "archived"), [staff, company.id]);

// // // // //     const placementLearnerIdsStr = useMemo(() => companyPlacements.map(p => p.learnerId).sort().join(","), [companyPlacements]);

// // // // //     useEffect(() => {
// // // // //         const fetchHolidays = async () => {
// // // // //             try {
// // // // //                 const year = new Date().getFullYear();
// // // // //                 const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`);
// // // // //                 if (res.ok) {
// // // // //                     const data = await res.json();
// // // // //                     setSaHolidays(data.map((h: any) => h.date));
// // // // //                 }
// // // // //             } catch (error) {
// // // // //                 console.error("Error fetching SA holidays:", error);
// // // // //             }
// // // // //         };
// // // // //         fetchHolidays();
// // // // //     }, []);

// // // // //     const fetchDeepComplianceData = async () => {
// // // // //         setIsComplianceLoading(true);
// // // // //         try {
// // // // //             const logsUnifiedMap = new Map<string, any>();
// // // // //             const wpQueryEmp = query(collection(db, "workplace_logs"), where("employerId", "==", company.id));
// // // // //             const wpSnapEmp = await getDocs(wpQueryEmp);
// // // // //             wpSnapEmp.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));

// // // // //             const relevantLearnerIds = new Set<string>();
// // // // //             companyPlacements.forEach(p => {
// // // // //                 if (p.learnerId) relevantLearnerIds.add(String(p.learnerId).trim());
// // // // //                 const l = learners.find((x: any) => x.id === p.learnerId);
// // // // //                 if (l && l.idNumber && String(l.idNumber).trim() !== "") {
// // // // //                     relevantLearnerIds.add(String(l.idNumber).trim());
// // // // //                 }
// // // // //             });

// // // // //             const placementStudentPool = Array.from(relevantLearnerIds).filter(Boolean);

// // // // //             for (let i = 0; i < placementStudentPool.length; i += 10) {
// // // // //                 const studentChunk = placementStudentPool.slice(i, i + 10);
// // // // //                 if (studentChunk.length === 0) continue;
// // // // //                 const wpQueryLearner = query(collection(db, "workplace_logs"), where("learnerId", "in", studentChunk));
// // // // //                 const wpSnapLearner = await getDocs(wpQueryLearner);
// // // // //                 wpSnapLearner.docs.forEach(d => logsUnifiedMap.set(d.id, { id: d.id, ...d.data() }));
// // // // //             }

// // // // //             const compiledWpLogs = Array.from(logsUnifiedMap.values());
// // // // //             setWorkplaceLogs(compiledWpLogs);

// // // // //             const relevantCohortIds = new Set<string>();
// // // // //             companyPlacements.forEach((p) => { if (p.cohortId) relevantCohortIds.add(p.cohortId); });
// // // // //             const cohortIdsArray = Array.from(relevantCohortIds);
// // // // //             let fetchedAttLogs: any[] = [];
// // // // //             let fetchedAttRecords: any[] = [];
// // // // //             for (const cId of cohortIdsArray) {
// // // // //                 if (!cId) continue;
// // // // //                 const logsQ = query(collection(db, "attendance_logs"), where("cohortId", "==", cId));
// // // // //                 const recsQ = query(collection(db, "attendance_records"), where("cohortId", "==", cId));
// // // // //                 const [lSnap, rSnap] = await Promise.all([getDocs(logsQ), getDocs(recsQ)]);
// // // // //                 fetchedAttLogs.push(...lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
// // // // //                 fetchedAttRecords.push(...rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
// // // // //             }

// // // // //             setAttendanceLogs(fetchedAttLogs);
// // // // //             setAttendanceRecords(fetchedAttRecords);
// // // // //         } catch (error) {
// // // // //             console.error("Deep compliance fetch error:", error);
// // // // //         } finally {
// // // // //             setIsComplianceLoading(false);
// // // // //         }
// // // // //     };

// // // // //     useEffect(() => {
// // // // //         if (placementLearnerIdsStr.length > 0) {
// // // // //             fetchDeepComplianceData();
// // // // //         } else {
// // // // //             setIsComplianceLoading(false);
// // // // //         }
// // // // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // // // //     }, [company.id, placementLearnerIdsStr]);

// // // // //     const { activeCount, completedCount, droppedCount, missingContracts, nonCompliantCount } = useMemo<PlacementStats>(() => {
// // // // //         let active = 0, completed = 0, dropped = 0, missing = 0, nonCompliant = 0;
// // // // //         companyPlacements.forEach((p) => {
// // // // //             const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean } };
// // // // //             const statusLower = p.status.toLowerCase();
// // // // //             if (statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview")) {
// // // // //                 active++;
// // // // //                 const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
// // // // //                 const hasMentor = !!(p.assignedMentorName || (placementRecord as any).mentorId);
// // // // //                 if (!isFullySigned) missing++;
// // // // //                 if (!isFullySigned || !hasMentor) nonCompliant++;
// // // // //             }
// // // // //             if (p.status === "Completed" || p.status === "absorbed_permanently") completed++;
// // // // //             if (p.status === "Terminated") dropped++;
// // // // //         });
// // // // //         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing, nonCompliantCount: nonCompliant };
// // // // //     }, [companyPlacements]);

// // // // //     const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
// // // // //         return companyPlacements
// // // // //             .map((p) => {
// // // // //                 const learner = learners.find((l: any) => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// // // // //                 const placementRecord = p as PlacementContract & {
// // // // //                     placementType?: string;
// // // // //                     compliance?: { isAgreementFullyExecuted?: boolean; wblpaAgreementUrl?: string; bbbeeSpendCategory?: string; };
// // // // //                     bbbeeSpendCategory?: string;
// // // // //                     mentorId?: string;
// // // // //                     cohortId?: string;
// // // // //                 };

// // // // //                 const mentor = companyMentors.find((m: any) => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);
// // // // //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string; disabilityStatus?: string; };
// // // // //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || "Unknown";
// // // // //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || "No Disability";

// // // // //                 let isEtiEligible = false;
// // // // //                 let isFemale = false;
// // // // //                 let isYouth = true;

// // // // //                 if (learner.idNumber && learner.idNumber.length >= 13) {
// // // // //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// // // // //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // // // //                     const age = new Date().getFullYear() - birthYear;
// // // // //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// // // // //                     if (age > 35) isYouth = false;
// // // // //                     const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
// // // // //                     if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
// // // // //                 } else if ((learner.demographics as any)?.genderCode === "F" || (extendedLearner as any).gender === "Female") {
// // // // //                     isFemale = true;
// // // // //                 }

// // // // //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), "months", true);
// // // // //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

// // // // //                 let etiMonthlyValue = 0;
// // // // //                 const wage = Number(p.stipendAmount) || 0;
// // // // //                 if (isEtiEligible && wage > 0) {
// // // // //                     if (wage < 2000) etiMonthlyValue = wage * 0.75;
// // // // //                     else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
// // // // //                     else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - 0.75 * (wage - 4500), 0);
// // // // //                 }

// // // // //                 const hasDisability = disability !== "No Disability" && disability !== "None" && disability !== "N/A" && disability !== "No" && disability !== "N";
// // // // //                 const s12hAllowanceTotal = hasDisability ? 120000 : 80000;
// // // // //                 const cohortId = learner.cohortId || placementRecord.cohortId;
// // // // //                 const safeLearnerId = String(p.learnerId || "").trim().toLowerCase();
// // // // //                 const safeIdNumber = String(learner.idNumber || "").trim().toLowerCase();

// // // // //                 let attendancePercentage = 0;
// // // // //                 if (cohortId) {
// // // // //                     const learnerAttRecords = attendanceRecords.filter((r: any) => r.cohortId === cohortId && (String(r.learnerId).trim().toLowerCase() === safeLearnerId || String(r.learnerId).trim().toLowerCase() === safeIdNumber));
// // // // //                     const learnerAttPresent = learnerAttRecords.filter((r: any) => r.status === "Present" || r.status === "Partial").length;
// // // // //                     const cohortTotalSessions = attendanceLogs.filter((l: any) => l.cohortId === cohortId).length;
// // // // //                     attendancePercentage = cohortTotalSessions > 0 ? Math.round((learnerAttPresent / cohortTotalSessions) * 100) : 0;
// // // // //                 }

// // // // //                 const learnerWpLogs = workplaceLogs.filter((l: any) => {
// // // // //                     const logLId = String(l.learnerId || "").trim().toLowerCase();
// // // // //                     return (safeLearnerId !== "" && logLId === safeLearnerId) || (safeIdNumber !== "" && logLId === safeIdNumber);
// // // // //                 });

// // // // //                 const approvedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // // // //                     const stat = String(l.status || "").trim().toLowerCase();
// // // // //                     return stat === "approved" ? sum + (Number(l.totalHours) || 0) : sum;
// // // // //                 }, 0);

// // // // //                 const pendingWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // // // //                     const stat = String(l.status || "").trim().toLowerCase();
// // // // //                     return (stat === "pending_mentor_approval" || stat === "pending") ? sum + (Number(l.totalHours) || 0) : sum;
// // // // //                 }, 0);

// // // // //                 const rejectedWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // // // //                     const stat = String(l.status || "").trim().toLowerCase();
// // // // //                     return stat === "rejected" ? sum + (Number(l.totalHours) || 0) : sum;
// // // // //                 }, 0);

// // // // //                 const draftWpHours = learnerWpLogs.reduce((sum: number, l: any) => {
// // // // //                     const stat = String(l.status || "").trim().toLowerCase();
// // // // //                     return (stat === "draft" || stat === "") ? sum + (Number(l.totalHours) || 0) : sum;
// // // // //                 }, 0);

// // // // //                 const currentYear = moment().year();
// // // // //                 const currentMonth = moment().month();
// // // // //                 const currentMonthStr = moment().format('YYYY-MM');
// // // // //                 const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, saHolidays);

// // // // //                 const currentMonthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr));
// // // // //                 const approvedDatesThisMonth = new Set(
// // // // //                     currentMonthWpLogs.filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved").map((l: any) => l.dateString)
// // // // //                 );
// // // // //                 const currentMonthApprovedDays = approvedDatesThisMonth.size;

// // // // //                 let currentMonthEarnedStipend = wage;
// // // // //                 if (expectedWorkingDaysThisMonth > 0 && wage > 0) {
// // // // //                     const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * wage;
// // // // //                     currentMonthEarnedStipend = Math.round(Math.min(calculatedProRata, wage) * 100) / 100;
// // // // //                 }

// // // // //                 return {
// // // // //                     ...p,
// // // // //                     placementType: placementRecord.placementType || "QCTO Workplace Module",
// // // // //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || "Uncategorized",
// // // // //                     compliance: {
// // // // //                         isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === "boolean" ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
// // // // //                         wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl,
// // // // //                     },
// // // // //                     learnerName: learner.fullName || "Unknown Learner",
// // // // //                     idNumber: learner.idNumber || "—",
// // // // //                     equityGroup: equity,
// // // // //                     isFemale,
// // // // //                     isYouth,
// // // // //                     hasDisability,
// // // // //                     mentorName: mentor.fullName || p.assignedMentorName || "Unassigned",
// // // // //                     hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id),
// // // // //                     isEtiEligible,
// // // // //                     etiMonthlyValue,
// // // // //                     projectedStipendSpend: wage * verifiedTimeline,
// // // // //                     s12hAllowanceTotal,
// // // // //                     attendancePercentage,
// // // // //                     approvedWpHours,
// // // // //                     pendingWpHours,
// // // // //                     rejectedWpHours,
// // // // //                     draftWpHours,
// // // // //                     currentMonthApprovedDays,
// // // // //                     expectedWorkingDaysThisMonth,
// // // // //                     currentMonthEarnedStipend
// // // // //                 };
// // // // //             })
// // // // //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // // // //     }, [companyPlacements, learners, companyMentors, attendanceRecords, attendanceLogs, workplaceLogs, saHolidays]);

// // // // //     useEffect(() => {
// // // // //         if (drawerPlacement) {
// // // // //             const updatedMatch = enrichedPlacements.find(x => x.id === drawerPlacement.id);
// // // // //             if (updatedMatch) setDrawerPlacement(updatedMatch);
// // // // //         }
// // // // //     }, [enrichedPlacements]);

// // // // //     const complianceMetrics = useMemo<ComplianceMetricsData>(() => {
// // // // //         let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
// // // // //         let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
// // // // //         let totalFemale = 0, totalMale = 0, absorbedFemale = 0, absorbedMale = 0;
// // // // //         let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
// // // // //         let mentorLoad: Record<string, number> = {};

// // // // //         enrichedPlacements.forEach((p) => {
// // // // //             const statusLower = p.status.toLowerCase();
// // // // //             const isLive = statusLower.includes("active") || statusLower.includes("pending") || statusLower.includes("interview");
// // // // //             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes("absorb") || (p as any).isAbsorbed;

// // // // //             if (isLive && p.hasMentor) mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;

// // // // //             const eq = p.equityGroup.trim().toLowerCase();
// // // // //             if (eq.includes("african") || eq === "black" || eq === "ba") { raceCounts.African++; blackACI++; if (p.isFemale) blackFemale++; }
// // // // //             else if (eq.includes("coloured") || eq === "bc") { raceCounts.Coloured++; blackACI++; if (p.isFemale) blackFemale++; }
// // // // //             else if (eq.includes("indian") || eq === "bi") { raceCounts.Indian++; blackACI++; if (p.isFemale) blackFemale++; }
// // // // //             else if (eq.includes("white") || eq === "w") { raceCounts.White++; }
// // // // //             else { raceCounts.Other++; }

// // // // //             if (p.isFemale) totalFemale++; else totalMale++;
// // // // //             if (p.isYouth) youthCount++;
// // // // //             if (isAbsorbed) { if (p.isFemale) absorbedFemale++; else absorbedMale++; }
// // // // //             if (p.hasDisability) disabilityCount++;

// // // // //             if (isLive) {
// // // // //                 if (p.etiMonthlyValue > 0) activeEtiYielders++;
// // // // //                 monthlyEtiSum += p.etiMonthlyValue;
// // // // //                 accumulatedSpend += p.projectedStipendSpend;
// // // // //             }

// // // // //             if (isLive || statusLower.includes("complete") || statusLower.includes("absorb")) {
// // // // //                 totalS12hProjected += p.s12hAllowanceTotal;
// // // // //             }
// // // // //         });

// // // // //         const overloadedMentors = Object.entries(mentorLoad).filter(([_, count]) => count > 4).length;

// // // // //         return {
// // // // //             transformationPercentage: enrichedPlacements.length > 0 ? Math.round((blackACI / enrichedPlacements.length) * 100) : 0,
// // // // //             disabilityPercentage: enrichedPlacements.length > 0 ? Math.round((disabilityCount / enrichedPlacements.length) * 100) : 0,
// // // // //             disabilityCount,
// // // // //             youthPercentage: enrichedPlacements.length > 0 ? Math.round((youthCount / enrichedPlacements.length) * 100) : 0,
// // // // //             youthCount,
// // // // //             etiYieldPercentage: activeCount > 0 ? Math.round((activeEtiYielders / activeCount) * 100) : 0,
// // // // //             monthlyETITotal: monthlyEtiSum,
// // // // //             annualizedETIEstimate: monthlyEtiSum * 12,
// // // // //             absorptionRate: completedCount > 0 ? Math.round(((absorbedFemale + absorbedMale) / completedCount) * 100) : 0,
// // // // //             totalProjectedSpend: accumulatedSpend,
// // // // //             totalS12hProjected,
// // // // //             totalFemale,
// // // // //             totalMale,
// // // // //             absorbedFemale,
// // // // //             absorbedMale,
// // // // //             raceCounts,
// // // // //             overloadedMentors,
// // // // //         };
// // // // //     }, [enrichedPlacements, activeCount, completedCount]);

// // // // //     const formatCurrency = (val?: number | string | null) =>
// // // // //         new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(val) || 0);

// // // // //     const displayedPlacements = useMemo(() => {
// // // // //         return enrichedPlacements.filter((p) => {
// // // // //             const sLower = p.status.toLowerCase();
// // // // //             if (activeTab === "action_required") {
// // // // //                 const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
// // // // //                 if (isAuditReady) return false;
// // // // //             }
// // // // //             if (activeTab === "active" && !sLower.includes("active") && !sLower.includes("pending") && !sLower.includes("interview")) return false;
// // // // //             if (activeTab === "history" && !sLower.includes("complete") && !sLower.includes("terminate") && !sLower.includes("absorb")) return false;
// // // // //             if (searchQuery) {
// // // // //                 const q = searchQuery.toLowerCase();
// // // // //                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
// // // // //             }
// // // // //             return true;
// // // // //         });
// // // // //     }, [enrichedPlacements, activeTab, searchQuery]);

// // // // //     const formatDate = (dateStr: any) => dateStr ? moment(dateStr).format("DD MMM YYYY") : "—";

// // // // //     const getExportData = () => {
// // // // //         return displayedPlacements.map((p) => ({
// // // // //             "Learner Name": p.learnerName,
// // // // //             "ID Number": p.idNumber,
// // // // //             "Race (EE Code)": p.equityGroup,
// // // // //             Gender: p.isFemale ? "Female" : "Male",
// // // // //             "Youth Status": p.isYouth ? "Youth (Under 35)" : "Non-Youth",
// // // // //             "Disability Status": p.hasDisability ? "Yes" : "No",
// // // // //             "Placement Type": p.placementType,
// // // // //             "B-BBEE Category": p.bbbeeSpendCategory,
// // // // //             "Monthly Stipend": Number(p.stipendAmount || 0).toFixed(2),
// // // // //             "Earned This Month (Pro-Rata)": Number(p.currentMonthEarnedStipend || 0).toFixed(2),
// // // // //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${Number(p.etiMonthlyValue).toFixed(2)}/mo)` : "No",
// // // // //             "Section 12H Value": Number(p.s12hAllowanceTotal || 0).toFixed(2),
// // // // //             "Campus Attendance %": `${p.attendancePercentage}%`,
// // // // //             "Approved Logbook Hours": Number(p.approvedWpHours || 0).toFixed(1),
// // // // //             "Pending Mentor Hours": Number(p.pendingWpHours || 0).toFixed(1),
// // // // //             "Rejected Hours": Number(p.rejectedWpHours || 0).toFixed(1),
// // // // //             "Draft Hours": Number(p.draftWpHours || 0).toFixed(1),
// // // // //             "Start Date": p.startDate ? moment(p.startDate).format("YYYY-MM-DD") : "—",
// // // // //             "Expected End Date": p.endDate ? moment(p.endDate).format("YYYY-MM-DD") : "—",
// // // // //             "Assigned Mentor": p.mentorName,
// // // // //             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// // // // //             "Operational Status": p.status.toUpperCase(),
// // // // //         }));
// // // // //     };

// // // // //     const handleExportExcel = () => {
// // // // //         const data = getExportData();
// // // // //         if (data.length === 0) return;
// // // // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // // // //         const workbook = XLSX.utils.book_new();
// // // // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
// // // // //         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, "_");
// // // // //         XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
// // // // //         setShowExportMenu(false);
// // // // //     };

// // // // //     const handleExportCSV = () => {
// // // // //         const data = getExportData();
// // // // //         if (data.length === 0) return;
// // // // //         const headers = Object.keys(data[0]);
// // // // //         const csvRows = data.map((row) => headers.map((header) => `"${(row as Record<string, unknown>)[header]}"`).join(","));
// // // // //         const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
// // // // //         const link = document.createElement("a");
// // // // //         link.href = URL.createObjectURL(blob);
// // // // //         link.setAttribute("download", `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${activeTab}_ledger.csv`);
// // // // //         document.body.appendChild(link);
// // // // //         link.click();
// // // // //         document.body.removeChild(link);
// // // // //         setShowExportMenu(false);
// // // // //     };

// // // // //     // 🚀 NEW: BULK BACKGROUND EXPORT TRIGGER
// // // // //     const handleTriggerBulkExport = async () => {
// // // // //         if (displayedPlacements.length === 0) return;
// // // // //         setIsRequestingBulk(true);
// // // // //         setShowExportMenu(false);

// // // // //         try {
// // // // //             const fns = getFunctions();
// // // // //             const requestBulkAuditPacks = httpsCallable(fns, "requestBulkAuditPacks");

// // // // //             const payloadPlacements = displayedPlacements.map(p => ({
// // // // //                 learnerId: p.learnerId,
// // // // //                 placementId: p.id,
// // // // //                 learnerName: p.learnerName,
// // // // //                 idNumber: p.idNumber,
// // // // //                 mentorName: p.mentorName
// // // // //             }));

// // // // //             const response = await requestBulkAuditPacks({
// // // // //                 companyId: company.id,
// // // // //                 companyName: company.name,
// // // // //                 placements: payloadPlacements
// // // // //             });

// // // // //             const data = response.data as { success: boolean, jobId: string };
// // // // //             if (data.success && data.jobId) {
// // // // //                 setBulkJobId(data.jobId);
// // // // //             }
// // // // //         } catch (error) {
// // // // //             console.error("Failed to start bulk export:", error);
// // // // //             alert("Failed to start bulk export process. Check console for details.");
// // // // //         } finally {
// // // // //             setIsRequestingBulk(false);
// // // // //         }
// // // // //     };

// // // // //     // 🚀 NEW: FIRESTORE LISTENER FOR LIVE BULK EXPORT PROGRESS
// // // // //     useEffect(() => {
// // // // //         if (!bulkJobId) return;

// // // // //         const unsubscribe = onSnapshot(doc(db, "compliance_jobs", bulkJobId), (docSnap) => {
// // // // //             if (docSnap.exists()) {
// // // // //                 const data = docSnap.data() as any;
// // // // //                 setBulkJobStatus({
// // // // //                     status: data.status,
// // // // //                     completedTasks: data.completedTasks || 0,
// // // // //                     totalTasks: data.totalTasks || 0,
// // // // //                     downloadUrl: data.downloadUrl || null
// // // // //                 });

// // // // //                 // Auto-download when complete!
// // // // //                 if (data.status === "complete" && data.downloadUrl) {
// // // // //                     window.location.href = data.downloadUrl;
// // // // //                     // Keep the banner up for a few seconds so they see "Complete", then clear it
// // // // //                     setTimeout(() => {
// // // // //                         setBulkJobId(null);
// // // // //                         setBulkJobStatus(null);
// // // // //                     }, 8000);
// // // // //                 }
// // // // //             }
// // // // //         });

// // // // //         return () => unsubscribe();
// // // // //     }, [bulkJobId]);

// // // // //     return (
// // // // //         <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "2rem" }}>
// // // // //             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}
// // // // //             {auditLearner && <LogbookAuditModal auditLearner={auditLearner} workplaceLogs={workplaceLogs} onClose={() => setAuditLearner(null)} />}
// // // // //             {drawerPlacement && <PlacementDetailsDrawer placement={drawerPlacement} companyName={company.name} workplaceLogs={workplaceLogs} saHolidays={saHolidays} onClose={() => setDrawerPlacement(null)} onOpenEti={setEtiBreakdownLearner} onOpenLogs={setAuditLearner} />}

// // // // //             {/* ── BREADCRUMB & HEADER ── */}
// // // // //             <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
// // // // //                 <button onClick={onBack} style={{ background: "white", border: "1px solid var(--mlab-border)", borderRadius: "8px", padding: "8px", cursor: "pointer", color: "var(--mlab-midnight)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "4px" }}>
// // // // //                     <ArrowLeft size={18} />
// // // // //                 </button>
// // // // //                 <div>
// // // // //                     <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Host Company Profile</div>
// // // // //                     <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
// // // // //                         <h1 style={{ margin: 0, fontSize: "1.8rem", fontFamily: "var(--font-heading)", color: "var(--mlab-midnight)", lineHeight: 1.2 }}>{company.name}</h1>
// // // // //                         {isComplianceLoading && <Loader2 size={20} className="wm-spin" color="var(--mlab-blue)" />}
// // // // //                         <button onClick={fetchDeepComplianceData} disabled={isComplianceLoading} style={{ background: "var(--mlab-blue)", color: "white", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", marginLeft: "1rem" }}>
// // // // //                             <RefreshCw size={12} className={isComplianceLoading ? "wm-spin" : ""} /> Sync Database
// // // // //                         </button>
// // // // //                     </div>

// // // // //                     <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", fontSize: "0.85rem", color: "#475569" }}>
// // // // //                         {company.registrationNumber && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Hash size={13} /> {company.registrationNumber}</span>}
// // // // //                         {company.physicalAddress && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={13} /> {company.physicalAddress}</span>}
// // // // //                         {company.contactPerson && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Mail size={13} /> {company.contactEmail}</span>}
// // // // //                     </div>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {complianceMetrics.overloadedMentors > 0 && (
// // // // //                 <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", color: "#991b1b", fontSize: "0.8rem", fontWeight: 600 }}>
// // // // //                     <ShieldAlert size={16} />
// // // // //                     <span><strong>SETA Quality Warning:</strong> {complianceMetrics.overloadedMentors} assigned mentor(s) currently exceed the recommended 1:4 supervisor-to-learner load constraint.</span>
// // // // //                 </div>
// // // // //             )}

// // // // //             <div className="cdp-stat-row">
// // // // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // // // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // // // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Interns</span></div>
// // // // //                 </div>
// // // // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // // // //                     <div className="cdp-stat-card__icon"><Award size={20} /></div>
// // // // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{completedCount}</span><span className="cdp-stat-card__label">Completed Programs</span></div>
// // // // //                 </div>
// // // // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // // // //                     <div className="cdp-stat-card__icon"><FileText size={20} /></div>
// // // // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? "var(--mlab-amber)" : "inherit" }}>{missingContracts}</span><span className="cdp-stat-card__label">Missing Contracts</span></div>
// // // // //                 </div>
// // // // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // // // //                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
// // // // //                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? "var(--mlab-red)" : "inherit" }}>{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Terminated</span></div>
// // // // //                 </div>
// // // // //             </div>

// // // // //             <ComplianceMetricsGrid complianceMetrics={complianceMetrics} formatCurrency={formatCurrency} />

// // // // //             <div className="cdp-panel">
// // // // //                 <div className="vp-card" style={{ marginBottom: 0 }}>
// // // // //                     <div className="vp-card-header" style={{ borderBottom: "none", flexDirection: "row", display: "flex", justifyContent: "space-between", paddingBottom: 0 }}>
// // // // //                         <div className="vp-card-title-group">
// // // // //                             <Users size={18} color="var(--mlab-blue)" />
// // // // //                             <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--mlab-blue)", textTransform: "uppercase" }}>Placement Ledger</h3>
// // // // //                         </div>
// // // // //                         <div>
// // // // //                             <BulkStipendUploader
// // // // //                                 placements={displayedPlacements}
// // // // //                                 saHolidays={saHolidays}
// // // // //                                 onSuccess={() => { fetchDeepComplianceData(); }}
// // // // //                             />
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     {/* 🚀 LIVE PROGRESS BANNER FOR BULK EXPORT */}
// // // // //                     {bulkJobStatus && (
// // // // //                         <div style={{ margin: "1rem 1.5rem 0", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }} className="animate-fade-in">
// // // // //                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
// // // // //                                 <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--mlab-blue)", fontWeight: 700, fontSize: "0.85rem" }}>
// // // // //                                     {bulkJobStatus.status === "processing" ? <Loader2 size={16} className="wm-spin" /> : <Archive size={16} color="#16a34a" />}
// // // // //                                     {bulkJobStatus.status === "processing" ? "Compiling Bulk Audit Packs..." : bulkJobStatus.status === "zipping" ? "Merging Cloud Stream..." : "Download Ready!"}
// // // // //                                 </div>
// // // // //                                 <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--mlab-midnight)" }}>
// // // // //                                     {bulkJobStatus.completedTasks} / {bulkJobStatus.totalTasks} Processed
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             <div style={{ width: "100%", background: "#e0f2fe", height: "10px", borderRadius: "5px", overflow: "hidden" }}>
// // // // //                                 <div style={{
// // // // //                                     width: `${bulkJobStatus.totalTasks > 0 ? (bulkJobStatus.completedTasks / bulkJobStatus.totalTasks) * 100 : 0}%`,
// // // // //                                     background: bulkJobStatus.status === "complete" ? "#16a34a" : "var(--mlab-blue)",
// // // // //                                     height: "100%",
// // // // //                                     transition: "width 0.3s ease-out"
// // // // //                                 }} />
// // // // //                             </div>

// // // // //                             {bulkJobStatus.status === "complete" && bulkJobStatus.downloadUrl && (
// // // // //                                 <a href={bulkJobStatus.downloadUrl} style={{ background: "#16a34a", color: "white", padding: "8px", borderRadius: "6px", textDecoration: "none", fontSize: "0.8rem", fontWeight: 700, textAlign: "center", marginTop: "8px", display: "inline-block" }}>
// // // // //                                     Click here if your download doesn't start automatically
// // // // //                                 </a>
// // // // //                             )}
// // // // //                         </div>
// // // // //                     )}

// // // // //                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 1.5rem", borderBottom: "1px solid var(--mlab-border)", marginTop: "1rem", background: "#f8fafc", flexWrap: "wrap", gap: "1rem" }}>
// // // // //                         <div style={{ display: "flex", gap: "1.5rem" }}>
// // // // //                             <button onClick={() => setActiveTab("active")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "active" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "active" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "active" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // // // //                                 Active Interns <span style={{ background: activeTab === "active" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "active" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{activeCount}</span>
// // // // //                             </button>

// // // // //                             <button onClick={() => setActiveTab("action_required")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "action_required" ? "#b91c1c" : "#64748b", fontWeight: activeTab === "action_required" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "action_required" ? "2px solid #b91c1c" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // // // //                                 Action Required <span style={{ background: activeTab === "action_required" ? "#fee2e2" : "#f1f5f9", color: activeTab === "action_required" ? "#b91c1c" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{nonCompliantCount}</span>
// // // // //                             </button>

// // // // //                             <button onClick={() => setActiveTab("history")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "history" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "history" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "history" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // // // //                                 History <span style={{ background: activeTab === "history" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "history" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{completedCount + droppedCount}</span>
// // // // //                             </button>
// // // // //                             <button onClick={() => setActiveTab("all")} style={{ padding: "12px 0", border: "none", background: "none", color: activeTab === "all" ? "var(--mlab-blue)" : "#64748b", fontWeight: activeTab === "all" ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", borderBottom: activeTab === "all" ? "2px solid var(--mlab-blue)" : "2px solid transparent", display: "flex", alignItems: "center", gap: "6px" }}>
// // // // //                                 All Records <span style={{ background: activeTab === "all" ? "#e0e7ff" : "#f1f5f9", color: activeTab === "all" ? "var(--mlab-blue)" : "#94a3b8", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem" }}>{enrichedPlacements.length}</span>
// // // // //                             </button>
// // // // //                         </div>

// // // // //                         <div style={{ display: "flex", gap: "8px", paddingBottom: "8px" }}>
// // // // //                             <div style={{ position: "relative", display: "flex", alignItems: "center", background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "0 8px" }}>
// // // // //                                 <Search size={14} color="#64748b" />
// // // // //                                 <input type="text" placeholder="Search ledger..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: "none", padding: "8px", outline: "none", background: "transparent", fontSize: "0.8rem", width: "200px" }} />
// // // // //                                 {searchQuery && <button type="button" onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex" }}><X size={12} /></button>}
// // // // //                             </div>

// // // // //                             <div style={{ position: "relative" }} ref={menuRef}>
// // // // //                                 <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={displayedPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: "white", fontSize: "0.8rem", padding: "6px 12px", opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? "not-allowed" : "pointer" }}>
// // // // //                                     <DownloadCloud size={14} /> Export
// // // // //                                 </button>
// // // // //                                 {showExportMenu && displayedPlacements.length > 0 && (
// // // // //                                     <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "white", border: "1px solid #cbd5e1", borderRadius: "6px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 50, minWidth: "220px", overflow: "hidden" }} className="animate-fade-in">
// // // // //                                         <button type="button" onClick={handleExportCSV} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download Data as CSV</button>
// // // // //                                         <button type="button" onClick={handleExportExcel} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download Data as Excel</button>
// // // // //                                         {/* 🚀 NEW BULK EXPORT BUTTON IN THE DROPDOWN */}
// // // // //                                         <button
// // // // //                                             type="button"
// // // // //                                             onClick={handleTriggerBulkExport}
// // // // //                                             disabled={isRequestingBulk || !!bulkJobId}
// // // // //                                             style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "#f8fafc", border: "none", cursor: (isRequestingBulk || !!bulkJobId) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--mlab-midnight)", fontWeight: 600, opacity: (isRequestingBulk || !!bulkJobId) ? 0.5 : 1 }}
// // // // //                                         >
// // // // //                                             <Archive size={14} color="#073f4e" />
// // // // //                                             {isRequestingBulk ? "Starting Job..." : "Generate Bulk SETA Pack (.zip)"}
// // // // //                                         </button>
// // // // //                                     </div>
// // // // //                                 )}
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div className="mlab-table-wrap">
// // // // //                         {isComplianceLoading && <div style={{ padding: "1rem", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}><Loader2 size={14} className="wm-spin" /> Verifying deep compliance logs...</div>}

// // // // //                         <table className="mlab-table">
// // // // //                             <colgroup>
// // // // //                                 <col style={{ width: "20%" }} />
// // // // //                                 <col style={{ width: "20%" }} />
// // // // //                                 <col style={{ width: "15%" }} />
// // // // //                                 <col style={{ width: "15%" }} />
// // // // //                                 <col style={{ width: "20%" }} />
// // // // //                                 <col style={{ width: "10%" }} />
// // // // //                             </colgroup>
// // // // //                             <thead>
// // // // //                                 <tr>
// // // // //                                     <th>Learner Profile</th>
// // // // //                                     <th>Placement Scope</th>
// // // // //                                     <th>Assigned Mentor</th>
// // // // //                                     <th>Status</th>
// // // // //                                     <th>Compliance</th>
// // // // //                                     <th style={{ textAlign: "right" }}>Actions</th>
// // // // //                                 </tr>
// // // // //                             </thead>
// // // // //                             <tbody>
// // // // //                                 {displayedPlacements.length > 0 ? (
// // // // //                                     displayedPlacements.map((p) => {
// // // // //                                         const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
// // // // //                                         return (
// // // // //                                             <tr key={p.id}>
// // // // //                                                 <td>
// // // // //                                                     <div className="cdp-learner-cell">
// // // // //                                                         <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // // // //                                                         <div className="cdp-learner-cell__info">
// // // // //                                                             <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // // // //                                                             <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // // // //                                                         </div>
// // // // //                                                     </div>
// // // // //                                                 </td>
// // // // //                                                 <td>
// // // // //                                                     <div style={{ fontSize: "0.85rem", color: "var(--mlab-midnight)", fontWeight: 500 }}>
// // // // //                                                         {formatDate(p.startDate)} <span style={{ color: "#94a3b8", margin: "0 4px" }}>→</span> {formatDate(p.endDate)}
// // // // //                                                     </div>
// // // // //                                                     <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>{p.placementType}</div>
// // // // //                                                 </td>
// // // // //                                                 <td>
// // // // //                                                     <div style={{ fontSize: "0.8rem", color: p.hasMentor ? "var(--mlab-midnight)" : "#dc2626", fontWeight: p.hasMentor ? 500 : 700, display: "flex", alignItems: "center", gap: "4px" }}>
// // // // //                                                         {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> Unassigned</>}
// // // // //                                                     </div>
// // // // //                                                 </td>
// // // // //                                                 <td>
// // // // //                                                     <span className={`cdp-status-badge ${p.status.toLowerCase().includes("active") ? "cdp-status-badge--active" : p.status.toLowerCase().includes("terminate") ? "cdp-status-badge--dropped" : ""}`} style={p.status.toLowerCase().includes("pending") ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" } : p.status.toLowerCase().includes("complete") || p.status.toLowerCase().includes("absorb") ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } : {}}>
// // // // //                                                         {p.status.replace("_", " ")}
// // // // //                                                     </span>
// // // // //                                                 </td>
// // // // //                                                 <td>
// // // // //                                                     {isAuditReady ? (
// // // // //                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#15803d', fontSize: '0.7rem', fontWeight: 700 }}>
// // // // //                                                             <ShieldCheck size={12} /> Audit Ready
// // // // //                                                         </div>
// // // // //                                                     ) : (
// // // // //                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // // // //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontSize: '0.7rem', fontWeight: 700 }}>
// // // // //                                                                 <AlertTriangle size={12} /> Non-Compliant
// // // // //                                                             </div>
// // // // //                                                         </div>
// // // // //                                                     )}
// // // // //                                                 </td>
// // // // //                                                 <td style={{ textAlign: "right" }}>
// // // // //                                                     <button
// // // // //                                                         type="button"
// // // // //                                                         onClick={() => setDrawerPlacement(p)}
// // // // //                                                         style={{
// // // // //                                                             background: "white", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
// // // // //                                                             color: "var(--mlab-blue)", fontSize: "0.75rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px", transition: "all 0.2s"
// // // // //                                                         }}
// // // // //                                                     >
// // // // //                                                         View <ChevronRight size={14} />
// // // // //                                                     </button>
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         );
// // // // //                                     })
// // // // //                                 ) : (
// // // // //                                     <tr>
// // // // //                                         <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
// // // // //                                             {searchQuery ? `No records matched your search query for "${searchQuery}".` : `No placement history matches found for this host company configuration.`}
// // // // //                                         </td>
// // // // //                                     </tr>
// // // // //                                 )}
// // // // //                             </tbody>
// // // // //                         </table>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };