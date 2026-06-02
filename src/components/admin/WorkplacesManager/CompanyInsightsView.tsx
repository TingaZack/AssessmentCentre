// src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowLeft, MapPin, Mail, Hash,
    Briefcase, CheckCircle, AlertTriangle, Users, Award,
    FileText, Search, X, DownloadCloud, AlertCircle, User,
    FileSpreadsheet, TrendingUp, Percent, Landmark, Calculator,
    Coins, Accessibility, Wallet, Lightbulb, Info, Activity,
    Receipt, ShieldAlert
} from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { useStore, type StaffMember } from '../../../store/useStore';
import type { Employer, DashboardLearner, PlacementContract } from '../../../types';

interface CompanyInsightsViewProps {
    company: Employer;
    onBack: () => void;
}

interface EnrichedPlacement extends PlacementContract {
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
}

/* ─── REUSABLE UI COMPONENTS ─── */
const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}>
                <Activity size={16} color="#d97706" /> {title}
            </div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}
        </div>
    </div>
);

const RingGauge = ({ percentage, color }: { percentage: number, color: string }) => {
    const size = 52;
    const stroke = 5;
    const radius = (size - stroke) / 2;
    const circum = radius * 2 * Math.PI;
    const offset = circum - (Math.min(percentage, 100) / 100) * circum;

    return (
        <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circum} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
            </svg>
            <div style={{ position: 'absolute', fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-midnight)' }}>{percentage}%</div>
        </div>
    );
};

export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
    const { learners, staff } = useStore();

    const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);

    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');
    const [searchQuery, setSearchQuery] = useState('');
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | 's12h' | 'mentor' | null>(null);
    const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowExportMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const companyPlacements = useMemo(() => placements.filter(p => p.employerId === company.id), [placements, company.id]);
    const companyMentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.employerId === company.id && s.status !== 'archived'), [staff, company.id]);

    const { activeCount, completedCount, droppedCount, missingContracts, absorbedCount } = useMemo(() => {
        let active = 0, completed = 0, dropped = 0, missing = 0, absorbed = 0;

        companyPlacements.forEach(p => {
            const placementRecord = p as PlacementContract & { compliance?: { isAgreementFullyExecuted?: boolean }, isAbsorbed?: boolean };
            const statusLower = p.status.toLowerCase();

            if (statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview')) {
                active++;
                const isFullySigned = p.wblAgreementSigned || placementRecord.compliance?.isAgreementFullyExecuted;
                if (!isFullySigned) missing++;
            }
            if (p.status === 'Completed' || p.status === 'absorbed_permanently') completed++;
            if (p.status === 'Terminated') dropped++;
            if (p.isAbsorbedPostPlacement || p.status === 'absorbed_permanently' || placementRecord.isAbsorbed) absorbed++;
        });
        return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing, absorbedCount: absorbed };
    }, [companyPlacements]);

    const enrichedPlacements = useMemo<EnrichedPlacement[]>(() => {
        return companyPlacements.map(p => {
            const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);

            const placementRecord = p as PlacementContract & {
                placementType?: string,
                compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
                bbbeeSpendCategory?: string,
                mentorId?: string
            };

            const mentor = companyMentors.find(m =>
                (p.assignedMentorName && m.fullName === p.assignedMentorName) ||
                (placementRecord.mentorId && m.id === placementRecord.mentorId)
            ) || ({} as Partial<StaffMember>);

            const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
            const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
            const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

            // 🚀 LIVE ID NUMBER RESOLUTION (Age & Gender)
            let isEtiEligible = false;
            let isFemale = false;
            let isYouth = true; // Default to RSA youth framework standard (under 35)

            if (learner.idNumber && learner.idNumber.length >= 13) {
                const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
                const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
                const age = new Date().getFullYear() - birthYear;

                if (age >= 18 && age <= 29) isEtiEligible = true;
                if (age > 35) isYouth = false;

                const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
                if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
            } else if ((learner.demographics as any)?.genderCode === 'F' || (extendedLearner as any).gender === 'Female') {
                isFemale = true;
            }

            const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
            const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 12;

            let etiMonthlyValue = 0;
            const wage = Number(p.stipendAmount) || 0;

            if (isEtiEligible && wage > 0) {
                if (wage < 2000) etiMonthlyValue = wage * 0.75;
                else if (wage >= 2000 && wage <= 4499) etiMonthlyValue = 1500;
                else if (wage >= 4500 && wage < 6500) etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 4500)), 0);
            }

            const hasDisability = disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No' && disability !== 'N';
            const s12hAllowanceTotal = hasDisability ? 120000 : 80000;

            return {
                ...p,
                placementType: placementRecord.placementType || 'QCTO Workplace Module',
                bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
                compliance: {
                    isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean'
                        ? placementRecord.compliance.isAgreementFullyExecuted
                        : p.wblAgreementSigned,
                    wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
                },
                learnerName: learner.fullName || 'Unknown Learner',
                idNumber: learner.idNumber || '—',
                equityGroup: equity,
                isFemale,
                isYouth,
                hasDisability,
                mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
                hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id),
                isEtiEligible,
                etiMonthlyValue,
                projectedStipendSpend: wage * verifiedTimeline,
                s12hAllowanceTotal
            };
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [companyPlacements, learners, companyMentors]);

    // ─── EXTENDED DEMOGRAPHIC AGGREGATION ───
    const complianceMetrics = useMemo(() => {
        let blackACI = 0, blackFemale = 0, disabilityCount = 0, youthCount = 0;
        let monthlyEtiSum = 0, accumulatedSpend = 0, totalS12hProjected = 0, activeEtiYielders = 0;
        let totalFemale = 0, totalMale = 0;
        let absorbedFemale = 0, absorbedMale = 0;

        let raceCounts = { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 };
        let mentorLoad: Record<string, number> = {};

        enrichedPlacements.forEach(p => {
            const statusLower = p.status.toLowerCase();
            const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
            const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes('absorb') || (p as any).isAbsorbed;

            if (isLive && p.hasMentor) {
                mentorLoad[p.mentorName] = (mentorLoad[p.mentorName] || 0) + 1;
            }

            const eq = p.equityGroup.trim().toLowerCase();
            if (eq.includes('african') || eq === 'black' || eq === 'ba') { raceCounts.African++; blackACI++; if (p.isFemale) blackFemale++; }
            else if (eq.includes('coloured') || eq === 'bc') { raceCounts.Coloured++; blackACI++; if (p.isFemale) blackFemale++; }
            else if (eq.includes('indian') || eq === 'bi') { raceCounts.Indian++; blackACI++; if (p.isFemale) blackFemale++; }
            else if (eq.includes('white') || eq === 'w') { raceCounts.White++; }
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

            if (isLive || statusLower.includes('complete') || statusLower.includes('absorb')) {
                totalS12hProjected += p.s12hAllowanceTotal;
            }
        });

        const maxMentorLoad = Object.values(mentorLoad).length > 0 ? Math.max(...Object.values(mentorLoad)) : 0;
        const overloadedMentors = Object.entries(mentorLoad).filter(([_, count]) => count > 4).length;

        return {
            transformationPercentage: enrichedPlacements.length > 0 ? Math.round((blackACI / enrichedPlacements.length) * 100) : 0,
            blackFemalePercentage: enrichedPlacements.length > 0 ? Math.round((blackFemale / enrichedPlacements.length) * 100) : 0,
            disabilityPercentage: enrichedPlacements.length > 0 ? Math.round((disabilityCount / enrichedPlacements.length) * 100) : 0,
            disabilityCount,
            youthPercentage: enrichedPlacements.length > 0 ? Math.round((youthCount / enrichedPlacements.length) * 100) : 0,
            youthCount,
            etiYieldPercentage: activeCount > 0 ? Math.round((activeEtiYielders / activeCount) * 100) : 0,
            monthlyETITotal: monthlyEtiSum,
            annualizedETIEstimate: monthlyEtiSum * 12,
            absorptionRate: completedCount > 0 ? Math.round((absorbedCount / completedCount) * 100) : 0,
            totalProjectedSpend: accumulatedSpend,
            totalS12hProjected,
            totalFemale,
            totalMale,
            absorbedFemale,
            absorbedMale,
            raceCounts,
            maxMentorLoad,
            overloadedMentors
        };
    }, [enrichedPlacements, activeCount, completedCount, absorbedCount]);

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

    const displayedPlacements = useMemo(() => {
        return enrichedPlacements.filter(p => {
            const sLower = p.status.toLowerCase();
            if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
            if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
            }
            return true;
        });
    }, [enrichedPlacements, activeTab, searchQuery]);

    const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

    const getExportData = () => {
        return displayedPlacements.map(p => ({
            "Learner Name": p.learnerName,
            "ID Number": p.idNumber,
            "Race (EE Code)": p.equityGroup,
            "Gender": p.isFemale ? "Female" : "Male",
            "Youth Status": p.isYouth ? "Youth (Under 35)" : "Non-Youth",
            "Disability Status": p.hasDisability ? "Yes" : "No",
            "Placement Type": p.placementType,
            "B-BBEE Category": p.bbbeeSpendCategory,
            "Monthly Stipend": p.stipendAmount || 0,
            "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
            "Section 12H Value": p.s12hAllowanceTotal,
            "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
            "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
            "Assigned Mentor": p.mentorName,
            "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
            "Operational Status": p.status.toUpperCase()
        }));
    };

    const handleExportExcel = () => {
        const data = getExportData();
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");
        const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
        XLSX.writeFile(workbook, `${cleanCompanyName}_${activeTab}_ledger.xlsx`);
        setShowExportMenu(false);
    };

    const handleExportCSV = () => {
        const data = getExportData();
        if (data.length === 0) return;
        const headers = Object.keys(data[0]);
        const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
        const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `${company.name.replace(/[^a-zA-Z0-9]/g, '_')}_${activeTab}_ledger.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportMenu(false);
    };

    // 🚀 PORTALED SARS ETI BREAKDOWN MODAL
    const EtiBreakdownModal = () => {
        if (!etiBreakdownLearner) return null;
        const wage = Number(etiBreakdownLearner.stipendAmount) || 0;
        const eti = etiBreakdownLearner.etiMonthlyValue;
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
            <div className="wm-overlay animate-fade-in" onClick={() => setEtiBreakdownLearner(null)} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
                                <Landmark size={20} /> SARS ETI Tax Rebate Audit
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {etiBreakdownLearner.learnerName}</div>
                        </div>
                        <button type="button" onClick={() => setEtiBreakdownLearner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
                            <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Projection:</span>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
                        </div>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
                    <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
                        {mathString}
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS Rules (Ages 18-29):</div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <li style={{ color: wage > 0 && wage < 2000 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2000 ? 700 : 400 }}>
                            If stipend is R0 – R1,999: ETI = 75% of stipend
                        </li>
                        <li style={{ color: wage >= 2000 && wage <= 4499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2000 && wage <= 4499 ? 700 : 400 }}>
                            If stipend is R2,000 – R4,499: ETI = R1,500 (Maximized)
                        </li>
                        <li style={{ color: wage >= 4500 && wage < 6500 ? '#16a34a' : 'inherit', fontWeight: wage >= 4500 && wage < 6500 ? 700 : 400 }}>
                            If stipend is R4,500 – R6,499: ETI = R1,500 - (75% of [Stipend - R4,500])
                        </li>
                        <li style={{ color: wage >= 6500 ? '#dc2626' : 'inherit', fontWeight: wage >= 6500 ? 700 : 400 }}>
                            If stipend is R6,500 or more: ETI = R0
                        </li>
                    </ul>

                    <button type="button" onClick={() => setEtiBreakdownLearner(null)} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center' }}>
                        Close Audit Trail
                    </button>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

            {etiBreakdownLearner && <EtiBreakdownModal />}

            {/* ── BREADCRUMB & HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <button onClick={onBack} style={{ background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' }}>
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Host Company Profile
                    </div>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', lineHeight: 1.2 }}>
                        {company.name}
                    </h1>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '0.85rem', color: '#475569' }}>
                        {company.registrationNumber && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={13} /> {company.registrationNumber}</span>}
                        {company.physicalAddress && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={13} /> {company.physicalAddress}</span>}
                        {company.contactPerson && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={13} /> {company.contactEmail}</span>}
                    </div>
                </div>
            </div>

            {/* ── ALERTS SECTION FOR QUALITY SIGNALS ── */}
            {complianceMetrics.overloadedMentors > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600 }}>
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
                        <span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? 'var(--mlab-amber)' : 'inherit' }}>{missingContracts}</span>
                        <span className="cdp-stat-card__label">Missing Contracts</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--grey">
                    <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? 'var(--mlab-red)' : 'inherit' }}>{droppedCount}</span>
                        <span className="cdp-stat-card__label">Dropped / Terminated</span>
                    </div>
                </div>
            </div>

            {/* ── COMPLIANCE & REBATE INTELLIGENCE GRID ── */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Calculator size={18} /> Strategic Employment Equity & Scorecard Auditor
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

                    {/* SARS ETI Yield Framework with Ring */}
                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <RingGauge percentage={complianceMetrics.etiYieldPercentage} color="#16a34a" />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Opt. Yield</span>
                                <button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
                                {formatCurrency(complianceMetrics.monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span>
                            </div>
                            <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>
                                Annually: {formatCurrency(complianceMetrics.annualizedETIEstimate)}
                            </div>
                            {activeInsight === 'eti' && (
                                <InsightPopup
                                    title="SARS Employment Tax Incentive"
                                    currentValue={`${complianceMetrics.etiYieldPercentage}% of Active Interns are ETI-Optimized`}
                                    actionSteps={[
                                        <span key="1"><strong>Live Calculation:</strong> Value is compiled dynamically by evaluating every active learner's recorded stipend against the official SARS ETI sliding scale.</span>,
                                        <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500 to max the algorithm.</span>,
                                        <span key="3"><strong>View Math:</strong> Scroll down to the placement ledger and click on any green ETI button to view the exact math breakdown.</span>
                                    ]}
                                    onClose={() => setActiveInsight(null)}
                                />
                            )}
                        </div>
                    </div>

                    {/* NEW: SECTION 12H TAX ALLOWANCE */}
                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}>
                            <Receipt size={24} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Sec. 12H Tax Rebates</span>
                                <button type="button" onClick={() => setActiveInsight(activeInsight === 's12h' ? null : 's12h')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button>
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
                                {formatCurrency(complianceMetrics.totalS12hProjected)}
                            </div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected total cycle deduction allowance.</span>
                            {activeInsight === 's12h' && (
                                <InsightPopup
                                    title="Section 12H Tax Deductions"
                                    currentValue={formatCurrency(complianceMetrics.totalS12hProjected)}
                                    actionSteps={[
                                        <span key="1"><strong>Live Calculation:</strong> R80,000 (Commencement + Completion) per able-bodied learner. R120,000 per learner with an uploaded Disability Code.</span>,
                                        <span key="2"><strong>To Optimize:</strong> This allowance is claimed against taxable income. Terminated/Dropped learners do not qualify for the completion allowance portion.</span>
                                    ]}
                                    onClose={() => setActiveInsight(null)}
                                />
                            )}
                        </div>
                    </div>

                    {/* B-BBEE Skills Development Spend Tracker */}
                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '50%', color: '#475569', height: 'fit-content' }}>
                            <Wallet size={24} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span>
                                <button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><Info size={14} /></button>
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
                                {formatCurrency(complianceMetrics.totalProjectedSpend)}
                            </div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
                            {activeInsight === 'spend' && (
                                <InsightPopup
                                    title="Skills Target Spend"
                                    currentValue={formatCurrency(complianceMetrics.totalProjectedSpend)}
                                    actionSteps={[
                                        <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
                                        <span key="2"><strong>To Optimize:</strong> Ensure all placements have an accurate Stipend Amount logged in the ledger, as this counts directly toward your B-BBEE 3-6% payroll skills target.</span>
                                    ]}
                                    onClose={() => setActiveInsight(null)}
                                />
                            )}
                        </div>
                    </div>

                    {/* RACIAL AND GENDER DEMOGRAPHICS */}
                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <RingGauge percentage={complianceMetrics.transformationPercentage} color="#b45309" />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Race & Gender Split</span>
                                <button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--mlab-midnight)', marginTop: '4px' }}>
                                {complianceMetrics.raceCounts.African}A | {complianceMetrics.raceCounts.Coloured}C | {complianceMetrics.raceCounts.Indian}I | {complianceMetrics.raceCounts.White}W
                            </div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                                Gender: <strong style={{ color: 'var(--mlab-blue)' }}>{complianceMetrics.totalFemale} Female / {complianceMetrics.totalMale} Male</strong>
                            </span>
                            {activeInsight === 'transformation' && (
                                <InsightPopup
                                    title="EEA2 Alignment Breakdown"
                                    currentValue="Total Demographics Ledger"
                                    actionSteps={[
                                        <span key="1"><strong>Headcounts:</strong> African ({complianceMetrics.raceCounts.African}), Coloured ({complianceMetrics.raceCounts.Coloured}), Indian ({complianceMetrics.raceCounts.Indian}), White ({complianceMetrics.raceCounts.White}).</span>,
                                        <span key="2"><strong>B-BBEE Focus:</strong> Under Code Series 300, Skills Development sub-minimum calculations exclude White candidates from positive point matrices.</span>
                                    ]}
                                    onClose={() => setActiveInsight(null)}
                                />
                            )}
                        </div>
                    </div>

                    {/* DISABILITY INDEX CHECK */}
                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <RingGauge percentage={complianceMetrics.disabilityPercentage} color="#7c3aed" />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#6d28d9', fontWeight: 700, textTransform: 'uppercase' }}>Disability Framework</span>
                                <button type="button" onClick={() => setActiveInsight(activeInsight === 'disability' ? null : 'disability')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6d28d9', display: 'flex' }}><Info size={14} /></button>
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
                                {complianceMetrics.disabilityCount} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Learners</span>
                            </div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                                Reflects a ratio of <strong>{complianceMetrics.disabilityPercentage}%</strong> of total context.
                            </span>
                            {activeInsight === 'disability' && (
                                <InsightPopup
                                    title="Disability Compliance Target"
                                    currentValue={`${complianceMetrics.disabilityCount} Headcount`}
                                    actionSteps={[
                                        <span key="1"><strong>Audit Rule:</strong> Each instance listed here must maintain a verified medical certificate signed by an operating practitioner to claim Section 12H bonus deductions (R120k vs R80k).</span>
                                    ]}
                                    onClose={() => setActiveInsight(null)}
                                />
                            )}
                        </div>
                    </div>

                    {/* YOUTH DEVELOPMENT PROFILES */}
                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <RingGauge percentage={complianceMetrics.youthPercentage} color="#059669" />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>Youth Demographics</span>
                                <button type="button" onClick={() => setActiveInsight(activeInsight === 'mentor' ? null : 'mentor')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#047857', display: 'flex' }}><Info size={14} /></button>
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
                                {complianceMetrics.youthCount} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>under 35</span>
                            </div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                                <strong>{complianceMetrics.youthPercentage}%</strong> match for South African Youth initiatives.
                            </span>
                        </div>
                    </div>

                    {/* ABSORPTION AND PERMANENT PLACEMENT */}
                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <RingGauge percentage={complianceMetrics.absorptionRate} color="#0ea5e9" />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Absorption Rate</span>
                                <button type="button" onClick={() => setActiveInsight(activeInsight === 'absorption' ? null : 'absorption')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', display: 'flex' }}><Info size={14} /></button>
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
                                {complianceMetrics.absorptionRate}% Absorbed
                            </div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                                Gender Split: <strong style={{ color: 'var(--mlab-blue)' }}>{complianceMetrics.absorbedFemale}F / {complianceMetrics.absorbedMale}M</strong>
                            </span>
                            {activeInsight === 'absorption' && (
                                <InsightPopup
                                    title="B-BBEE Scorecard Absorption"
                                    currentValue={`${complianceMetrics.absorptionRate}% Total | ${complianceMetrics.absorbedFemale}F / ${complianceMetrics.absorbedMale}M Split`}
                                    actionSteps={[
                                        <span key="1"><strong>Target:</strong> 100% absorption unlocks 5 B-BBEE Bonus Points under Code Series 300.</span>,
                                        <span key="2"><strong>To Optimize:</strong> Secure key scorecard bonus allocations by confirming permanent transitions upon program completion. Ensure status is set to "Absorbed".</span>
                                    ]}
                                    onClose={() => setActiveInsight(null)}
                                />
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* ── PLACEMENT LEDGER DATA GRID ── */}
            <div className="cdp-panel">
                <div className="vp-card" style={{ marginBottom: 0 }}>
                    <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                        <div className="vp-card-title-group">
                            <Users size={18} color="var(--mlab-blue)" />
                            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                Placement Ledger
                            </h3>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc', flexWrap: 'wrap', gap: '1rem' }}>

                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                            <button
                                onClick={() => setActiveTab('active')}
                                style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('all')}
                                style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{enrichedPlacements.length}</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', paddingBottom: '8px' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 8px' }}>
                                <Search size={14} color="#64748b" />
                                <input
                                    type="text"
                                    placeholder="Search ledger..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{ border: 'none', padding: '8px', outline: 'none', background: 'transparent', fontSize: '0.8rem', width: '200px' }}
                                />
                                {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={12} /></button>}
                            </div>

                            <div style={{ position: 'relative' }} ref={menuRef}>
                                <button
                                    type="button"
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    disabled={displayedPlacements.length === 0}
                                    className="cdp-btn cdp-btn--outline"
                                    style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
                                >
                                    <DownloadCloud size={14} /> Export Options
                                </button>

                                {showExportMenu && displayedPlacements.length > 0 && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
                                        <button
                                            type="button"
                                            onClick={handleExportCSV}
                                            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
                                        >
                                            <FileText size={14} color="#0ea5e9" /> Download as CSV
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleExportExcel}
                                            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
                                        >
                                            <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th>Learner Profile</th>
                                    <th>Placement Timeline</th>
                                    <th>Assigned Mentor</th>
                                    <th>Financials & Compliance</th>
                                    <th>Operational Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedPlacements.length > 0 ? displayedPlacements.map(p => (
                                    <tr key={p.id}>
                                        {/* Learner Name & Identity */}
                                        <td>
                                            <div className="cdp-learner-cell">
                                                <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
                                                <div className="cdp-learner-cell__info">
                                                    <span className="cdp-learner-cell__name">{p.learnerName}</span>
                                                    <span className="cdp-learner-cell__id">{p.idNumber}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Schedule Limits */}
                                        <td>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
                                                {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {formatDate(p.endDate)}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{p.placementType}</div>
                                        </td>

                                        {/* Workplace Mentor Connection */}
                                        <td>
                                            <div style={{ fontSize: '0.8rem', color: p.hasMentor ? 'var(--mlab-midnight)' : '#dc2626', fontWeight: p.hasMentor ? 500 : 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {p.hasMentor ? (
                                                    <><User size={12} /> {p.mentorName}</>
                                                ) : (
                                                    <><AlertTriangle size={12} /> No Mentor Assigned</>
                                                )}
                                            </div>
                                        </td>

                                        {/* 🚀 FULLY DYNAMIC ETI BREAKDOWN BUTTON */}
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>

                                                    <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
                                                        {p.bbbeeSpendCategory}
                                                    </span>

                                                    {/* Live Stipend Value */}
                                                    {p.stipendAmount && p.stipendAmount > 0 && (
                                                        <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content' }}>
                                                            Wage: R{p.stipendAmount}/mo
                                                        </span>
                                                    )}

                                                    {/* 🚀 Dynamic ETI Value + Clickable Audit Trigger */}
                                                    {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEtiBreakdownLearner(p)}
                                                            style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }}
                                                            title="Click to view exact SARS mathematical breakdown"
                                                        >
                                                            <Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo
                                                        </button>
                                                    ) : (
                                                        <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                            <AlertCircle size={10} /> Ineligible for ETI
                                                        </span>
                                                    )}
                                                </div>

                                                {p.wblAgreementSigned || p.compliance.isAgreementFullyExecuted ? (
                                                    p.wblAgreementUrl || p.compliance.wblpaAgreementUrl ? (
                                                        <a
                                                            href={p.wblAgreementUrl || p.compliance.wblpaAgreementUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
                                                            title="Click to view signed contract document"
                                                        >
                                                            <FileText size={10} /> View WBLPA Contract
                                                        </a>
                                                    ) : (
                                                        <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                            <CheckCircle size={10} /> Signed & On File
                                                        </span>
                                                    )
                                                ) : (
                                                    <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                        <AlertCircle size={10} /> Missing WBLPA Document
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Status Parameters */}
                                        <td>
                                            <span
                                                className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' :
                                                    p.status.toLowerCase().includes('terminate') ? 'cdp-status-badge--dropped' : ''
                                                    }`}
                                                style={
                                                    p.status.toLowerCase().includes('pending') ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } :
                                                        p.status.toLowerCase().includes('complete') || p.status.toLowerCase().includes('absorb') ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}
                                                }
                                            >
                                                {p.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
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

// import React, { useMemo, useState, useRef, useEffect } from 'react';
// import {
//     ArrowLeft, MapPin, Mail, Hash,
//     Briefcase, CheckCircle, AlertTriangle, Users, Award,
//     FileText, Search, X, DownloadCloud, AlertCircle, User,
//     FileSpreadsheet
// } from 'lucide-react';
// import moment from 'moment';
// import * as XLSX from 'xlsx';
// import { useStore, type StaffMember } from '../../../store/useStore';
// import type { Employer, DashboardLearner } from '../../../types';

// interface CompanyInsightsViewProps {
//     company: Employer;
//     onBack: () => void;
// }

// export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
//     const { learners, staff } = useStore();
//     const placements = (useStore(s => (s as any).placements) || []) as any[];

//     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');
//     const [searchQuery, setSearchQuery] = useState('');
//     const [showExportMenu, setShowExportMenu] = useState(false);
//     const menuRef = useRef<HTMLDivElement>(null);

//     // Close export menu if clicked outside
//     useEffect(() => {
//         const handleClickOutside = (event: MouseEvent) => {
//             if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
//                 setShowExportMenu(false);
//             }
//         };
//         document.addEventListener('mousedown', handleClickOutside);
//         return () => document.removeEventListener('mousedown', handleClickOutside);
//     }, []);

//     // Filter Data for this specific company
//     const companyPlacements = useMemo(() => placements.filter(p => p.employerId === company.id), [placements, company.id]);
//     const companyMentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.employerId === company.id && s.status !== 'archived'), [staff, company.id]);

//     // Calculate Metrics
//     const { activeCount, completedCount, droppedCount, missingContracts } = useMemo(() => {
//         let active = 0, completed = 0, dropped = 0, missing = 0;
//         companyPlacements.forEach(p => {
//             if (p.status === 'active' || p.status === 'pending_signatures') {
//                 active++;
//                 if (p.status === 'active' && !p.compliance?.isAgreementFullyExecuted) missing++;
//             }
//             if (p.status === 'completed') completed++;
//             if (p.status === 'terminated') dropped++;
//         });
//         return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing };
//     }, [companyPlacements]);

//     // Enriched Placement Data
//     const enrichedPlacements = useMemo(() => {
//         return companyPlacements.map(p => {
//             const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
//             const mentor = companyMentors.find(m => m.id === p.mentorId) || ({} as Partial<StaffMember>);
//             return {
//                 ...p,
//                 learnerName: learner.fullName || 'Unknown Learner',
//                 idNumber: learner.idNumber || '—',
//                 mentorName: mentor.fullName || 'Unassigned',
//             };
//         }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
//     }, [companyPlacements, learners, companyMentors]);

//     // Apply Tab Filters & Search Query
//     const displayedPlacements = useMemo(() => {
//         return enrichedPlacements.filter(p => {
//             if (activeTab === 'active' && p.status !== 'active' && p.status !== 'pending_signatures') return false;
//             if (activeTab === 'history' && p.status !== 'completed' && p.status !== 'terminated') return false;
//             if (searchQuery) {
//                 const q = searchQuery.toLowerCase();
//                 if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
//             }
//             return true;
//         });
//     }, [enrichedPlacements, activeTab, searchQuery]);

//     const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

//     // EXPORT DATA PREPARATION
//     const getExportData = () => {
//         return displayedPlacements.map(p => ({
//             "Learner Name": p.learnerName,
//             "ID Number": p.idNumber,
//             "Placement Type": p.placementType,
//             "B-BBEE Category": p.compliance?.bbbeeSpendCategory || p.bbbeeSpendCategory || 'Uncategorized',
//             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
//             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
//             "Assigned Mentor": p.mentorName,
//             "WBLPA Contract Status": p.compliance?.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
//             "Contract Link": p.compliance?.wblpaAgreementUrl || 'Not Uploaded',
//             "Operational Status": p.status.replace('_', ' ').toUpperCase()
//         }));
//     };

//     const generateFileName = (extension: string) => {
//         const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
//         return `${cleanCompanyName}_${activeTab}_placements_${moment().format('YYYYMMDD')}.${extension}`;
//     };

//     // EXPORT TO CSV
//     const handleExportCSV = () => {
//         const data = getExportData();
//         if (data.length === 0) return;

//         const headers = Object.keys(data[0]);
//         const csvRows = data.map(row =>
//             headers.map(header => `"${(row as any)[header]}"`).join(',')
//         );
//         const csvString = [headers.join(','), ...csvRows].join('\n');

//         const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
//         const link = document.createElement('a');
//         link.href = URL.createObjectURL(blob);
//         link.setAttribute('download', generateFileName('csv'));
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//         setShowExportMenu(false);
//     };

//     // EXPORT TO NATIVE EXCEL (.XLSX)
//     const handleExportExcel = () => {
//         const data = getExportData();
//         if (data.length === 0) return;

//         const worksheet = XLSX.utils.json_to_sheet(data);
//         const workbook = XLSX.utils.book_new();
//         XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");

//         XLSX.writeFile(workbook, generateFileName('xlsx'));
//         setShowExportMenu(false);
//     };

//     return (
//         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

//             {/* ── BREADCRUMB & HEADER ── */}
//             <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
//                 <button
//                     onClick={onBack}
//                     style={{ background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' }}
//                 >
//                     <ArrowLeft size={18} />
//                 </button>
//                 <div>
//                     <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                         Host Company Profile
//                     </div>
//                     <h1 style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', lineHeight: 1.2 }}>
//                         {company.name}
//                     </h1>
//                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '0.85rem', color: '#475569' }}>
//                         {company.registrationNumber && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={13} /> {company.registrationNumber}</span>}
//                         {company.physicalAddress && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={13} /> {company.physicalAddress}</span>}
//                         {company.contactPerson && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={13} /> {company.contactEmail}</span>}
//                     </div>
//                 </div>
//             </div>

//             {/* ── METRICS RIBBON ── */}
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

//             {/* ── DATA GRID WITH TABS & SEARCH ── */}
//             <div className="cdp-panel">
//                 <div className="vp-card" style={{ marginBottom: 0 }}>
//                     <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
//                         <div className="vp-card-title-group">
//                             <Users size={18} color="var(--mlab-blue)" />
//                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
//                                 Placement Ledger
//                             </h3>
//                         </div>
//                     </div>

//                     {/* TOOLBAR: TABS + SEARCH + DUAL EXPORT */}
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc', flexWrap: 'wrap', gap: '1rem' }}>

//                         <div style={{ display: 'flex', gap: '1.5rem' }}>
//                             <button
//                                 onClick={() => setActiveTab('active')}
//                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
//                             >
//                                 Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
//                             </button>
//                             <button
//                                 onClick={() => setActiveTab('history')}
//                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
//                             >
//                                 History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
//                             </button>
//                             <button
//                                 onClick={() => setActiveTab('all')}
//                                 style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
//                             >
//                                 All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{enrichedPlacements.length}</span>
//                             </button>
//                         </div>

//                         <div style={{ display: 'flex', gap: '8px', paddingBottom: '8px' }}>
//                             <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 8px' }}>
//                                 <Search size={14} color="#64748b" />
//                                 <input
//                                     type="text"
//                                     placeholder="Search by learner or ID..."
//                                     value={searchQuery}
//                                     onChange={e => setSearchQuery(e.target.value)}
//                                     style={{ border: 'none', padding: '8px', outline: 'none', background: 'transparent', fontSize: '0.8rem', width: '200px' }}
//                                 />
//                                 {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={12} /></button>}
//                             </div>

//                             <div style={{ position: 'relative' }} ref={menuRef}>
//                                 <button
//                                     onClick={() => setShowExportMenu(!showExportMenu)}
//                                     disabled={displayedPlacements.length === 0}
//                                     className="cdp-btn cdp-btn--outline"
//                                     style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
//                                 >
//                                     <DownloadCloud size={14} /> Export Ledger
//                                 </button>

//                                 {showExportMenu && displayedPlacements.length > 0 && (
//                                     <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
//                                         <button
//                                             onClick={handleExportCSV}
//                                             style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
//                                         >
//                                             <FileText size={14} color="#0ea5e9" /> Download as CSV
//                                         </button>
//                                         <button
//                                             onClick={handleExportExcel}
//                                             style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
//                                         >
//                                             <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
//                                         </button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                     </div>

//                     <div className="mlab-table-wrap">
//                         <table className="mlab-table">
//                             <thead>
//                                 <tr>
//                                     <th>Learner Profile</th>
//                                     <th>Placement Timeline</th>
//                                     <th>Assigned Mentor</th>
//                                     <th>Compliance Track & Contracts</th>
//                                     <th>Operational Status</th>
//                                 </tr>
//                             </thead>
//                             <tbody>
//                                 {displayedPlacements.length > 0 ? displayedPlacements.map(p => (
//                                     <tr key={p.id}>
//                                         {/* Learner Name & ID */}
//                                         <td>
//                                             <div className="cdp-learner-cell">
//                                                 <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
//                                                 <div className="cdp-learner-cell__info">
//                                                     <span className="cdp-learner-cell__name">{p.learnerName}</span>
//                                                     <span className="cdp-learner-cell__id">{p.idNumber}</span>
//                                                 </div>
//                                             </div>
//                                         </td>

//                                         {/* Timeline */}
//                                         <td>
//                                             <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
//                                                 {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {formatDate(p.endDate)}
//                                             </div>
//                                             <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{p.placementType}</div>
//                                         </td>

//                                         {/* Mentor Cell */}
//                                         <td>
//                                             <div style={{ fontSize: '0.8rem', color: p.mentorId ? 'var(--mlab-midnight)' : '#dc2626', fontWeight: p.mentorId ? 500 : 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                 {p.mentorId ? (
//                                                     <><User size={12} /> {p.mentorName}</>
//                                                 ) : (
//                                                     <><AlertTriangle size={12} /> No Mentor Assigned</>
//                                                 )}
//                                             </div>
//                                         </td>

//                                         {/* Compliance Cell */}
//                                         <td>
//                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
//                                                 <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
//                                                     {p.compliance?.bbbeeSpendCategory || p.bbbeeSpendCategory || 'Uncategorized'}
//                                                 </span>

//                                                 {p.compliance?.isAgreementFullyExecuted ? (
//                                                     p.compliance?.wblpaAgreementUrl ? (
//                                                         <a
//                                                             href={p.compliance.wblpaAgreementUrl}
//                                                             target="_blank"
//                                                             rel="noopener noreferrer"
//                                                             style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
//                                                             title="Click to view signed contract document"
//                                                         >
//                                                             <FileText size={10} /> View WBLPA Contract
//                                                         </a>
//                                                     ) : (
//                                                         <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
//                                                             <CheckCircle size={10} /> Signed (No File Link)
//                                                         </span>
//                                                     )
//                                                 ) : (
//                                                     <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
//                                                         <AlertCircle size={10} /> No WBLPA Uploaded
//                                                     </span>
//                                                 )}
//                                             </div>
//                                         </td>

//                                         {/* Operational Status */}
//                                         <td>
//                                             <span className={`cdp-status-badge ${p.status === 'active' ? 'cdp-status-badge--active' : p.status === 'terminated' ? 'cdp-status-badge--dropped' : ''}`} style={p.status === 'pending_signatures' ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } : p.status === 'completed' ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}}>
//                                                 {p.status.replace('_', ' ')}
//                                             </span>
//                                         </td>
//                                     </tr>
//                                 )) : (
//                                     <tr>
//                                         <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
//                                             {searchQuery ? `No records matched your search for "${searchQuery}".` : `No ${activeTab === 'active' ? 'active' : activeTab === 'history' ? 'historical' : ''} placements found for this company.`}
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