// src/components/views/WorkplaceLogViewerModal/WorkplaceLogViewerModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    FileText, X, Calendar, Clock, AlertTriangle, ExternalLink, Pencil,
    UserCheck, Printer, ListChecks, ChevronDown, ChevronUp, Briefcase,
    History, Link2, FileCode, Eye, EyeOff, Info, Paperclip, Building2, MapPin
} from 'lucide-react';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import moment from 'moment';

// Import the print-optimized engine component from its verified path
import { WorkplaceLogPrintable } from '../WorkplaceModulePrintable/WorkplaceModulePrintable';

import './WorkplaceLogViewerModal.css';

const MIDNIGHT = '#073f4e';

const isImageFile = (url: string): boolean => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.gif');
};

interface HistoricalMetrics {
    count: number;
    totalHours: number;
}

interface WorkplaceLogViewerModalProps {
    log: any;
    onClose: () => void;
    onEdit?: (log: any) => void;
    allowEdit?: boolean;
    preloadedEmployer?: any; // Accepted data payload passed down directly from parent view
}

export const WorkplaceLogViewerModal: React.FC<WorkplaceLogViewerModalProps> = ({
    log,
    onClose,
    onEdit,
    allowEdit = true,
    preloadedEmployer
}) => {
    const [fetchedMentorName, setFetchedMentorName] = useState<string>('');
    const [fetchedAssessorName, setFetchedAssessorName] = useState<string>('');

    const [learnerSig, setLearnerSig] = useState<string>('');
    const [mentorSig, setMentorSig] = useState<string>('');
    const [assessorSig, setAssessorSig] = useState<string>('');

    // Use preloaded employer metadata if provided, otherwise initialize as null for side-effect lookup
    const [employerDetails, setEmployerDetails] = useState<any>(preloadedEmployer || null);

    const [moduleTopics, setModuleTopics] = useState<any[]>([]);
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [isTemplateLoading, setIsBlueprintLoading] = useState<boolean>(true);

    const [previewCustomSeId, setPreviewCustomSeId] = useState<string | null>(null);
    const [previewCwkId, setPreviewCwkId] = useState<string | null>(null);

    const [historicalMilestoneMetrics, setHistoricalMilestoneMetrics] = useState<Record<string, HistoricalMetrics>>({});

    useEffect(() => {
        const fetchSystemAuditDetails = async () => {
            if (!log) return;
            setIsBlueprintLoading(true);

            // ─── LEARNER SIGNATURE RESOLUTION ───
            const frozenLearnerSig = log.learnerSignatureUrl || log.signatureUrl || log.learnerSignature || log.signature;
            if (frozenLearnerSig) {
                setLearnerSig(frozenLearnerSig);
            } else if (log.learnerId) {
                try {
                    const learnerQuery = query(collection(db, 'users'), where('idNumber', '==', String(log.learnerId).trim()), limit(1));
                    const querySnapshot = await getDocs(learnerQuery);
                    if (!querySnapshot.empty) {
                        setLearnerSig(querySnapshot.docs[0].data().signatureUrl || '');
                    }
                } catch (e) { console.warn(e); }
            }

            // ─── 🚀 BULLETPROOF MENTOR NAME & SIGNATURE DISCOVERY PIPELINE ───
            let resolvedMentorName = log.mentorName || '';

            // Step 1: Extract Mentor Name from ID if missing on the log root
            if (!resolvedMentorName && log.mentorId) {
                try {
                    const profile = await getDoc(doc(db, 'users', log.mentorId));
                    if (profile.exists()) {
                        resolvedMentorName = profile.data().fullName || '';
                        if (profile.data().signatureUrl && !log.mentorSignatureUrl) {
                            setMentorSig(profile.data().signatureUrl);
                        }
                    }
                } catch (e) { console.error(e); }
            }

            // Step 2: Fallback query user profile by email if name is still unresolved
            if (!resolvedMentorName && (log.mentorEmail || log.processedBy)) {
                try {
                    const targetEmail = (log.mentorEmail || log.processedBy).toLowerCase().trim();
                    const mentorQuery = query(collection(db, 'users'), where('email', '==', targetEmail), limit(1));
                    const querySnapshot = await getDocs(mentorQuery);
                    if (!querySnapshot.empty) {
                        resolvedMentorName = querySnapshot.docs[0].data().fullName || '';
                        if (querySnapshot.docs[0].data().signatureUrl && !log.mentorSignatureUrl) {
                            setMentorSig(querySnapshot.docs[0].data().signatureUrl);
                        }
                    }
                } catch (e) { console.error(e); }
            }

            // Update state with finalized recovered name string
            if (resolvedMentorName) {
                setFetchedMentorName(resolvedMentorName);
            }

            // Step 3: Resolve independent signature document hooks if needed
            if (log.mentorSignatureUrl) {
                setMentorSig(log.mentorSignatureUrl);
            } else if (log.mentorEmail || log.processedBy) {
                const targetEmail = log.mentorEmail || log.processedBy;
                try {
                    const sigDoc = await getDoc(doc(db, 'mentor_signatures', targetEmail.toLowerCase().trim()));
                    if (sigDoc.exists()) setMentorSig(sigDoc.data().signatureUrl || '');
                } catch (e) { console.error(e); }
            }

            // ─── ASSESSOR DATA RESOLUTION ───
            const targetAssessorId = log.assessorId || log.reviewerId;
            if (log.assessorName) setFetchedAssessorName(log.assessorName);
            if (log.assessorSignatureUrl) {
                setAssessorSig(log.assessorSignatureUrl);
            } else if (targetAssessorId) {
                try {
                    const profile = await getDoc(doc(db, 'users', targetAssessorId));
                    if (profile.exists()) {
                        const data = profile.data();
                        if (!log.assessorName) setFetchedAssessorName(data.fullName || '');
                        setAssessorSig(data.signatureUrl || '');
                    }
                } catch (e) { console.error(e); }
            }

            // ─── STANDALONE EMPLOYER DISCOVERY NODE ───
            if (!preloadedEmployer) {
                try {
                    const searchId = log.learnerId || '';
                    if (searchId) {
                        const placeQuery = query(
                            collection(db, 'placements'),
                            where('learnerId', '==', searchId),
                            where('status', 'in', ['Active Placement', 'Pending Match', 'active'])
                        );
                        const placeSnap = await getDocs(placeQuery);

                        if (!placeSnap.empty) {
                            const activePlacement = placeSnap.docs.sort((a, b) => new Date(b.data().createdAt).getTime() - new Date(a.data().createdAt).getTime())[0].data();

                            if (activePlacement.employerId) {
                                const empDoc = await getDoc(doc(db, 'employers', activePlacement.employerId));
                                if (empDoc.exists()) {
                                    const empData = empDoc.data();
                                    setEmployerDetails({
                                        companyName: empData.name || 'Registered Host Employer',
                                        address: empData.physicalAddress || 'Address missing in system',
                                        workTelephone: empData.contactPhone || 'Phone unlisted',
                                        email: empData.contactEmail || 'Email unlisted'
                                    });
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed standalone employer discovery:", err);
                }
            }

            try {
                const targetUid = log.learnerId || '';
                if (targetUid) {
                    const historicalLogsQuery = query(
                        collection(db, 'workplace_logs'),
                        where('learnerId', '==', targetUid),
                        where('status', '==', 'Approved')
                    );
                    const historicalSnap = await getDocs(historicalLogsQuery);
                    const compiledMetrics: Record<string, HistoricalMetrics> = {};

                    historicalSnap.docs.forEach(docSnap => {
                        if (docSnap.id === log.id) return;

                        const data = docSnap.data();
                        const selectedCodes = data.selectedMilestones || [];
                        const hoursForLog = Number(data.totalHours) || 0;

                        selectedCodes.forEach((code: string) => {
                            if (!compiledMetrics[code]) {
                                compiledMetrics[code] = { count: 0, totalHours: 0 };
                            }
                            compiledMetrics[code].count += 1;
                            compiledMetrics[code].totalHours += hoursForLog;
                        });
                    });
                    setHistoricalMilestoneMetrics(compiledMetrics);
                }
            } catch (err) {
                console.error("Historical background aggregation scanner failed:", err);
            }

            let resolvedModulesArray: any[] = [];

            if (log.learnerId) {
                try {
                    let profileDoc = await getDoc(doc(db, 'users', log.learnerId));
                    if (!profileDoc.exists()) {
                        const q = query(collection(db, 'users'), where('idNumber', '==', String(log.learnerId).trim()), limit(1));
                        const snap = await getDocs(q);
                        if (!snap.empty) profileDoc = snap.docs[0];
                    }
                    if (profileDoc.exists() && profileDoc.data().workExperienceModules) {
                        resolvedModulesArray = profileDoc.data().workExperienceModules;
                    }
                } catch (e) { console.warn(e); }
            }

            if ((!resolvedModulesArray || resolvedModulesArray.length === 0) && log.cohortId) {
                try {
                    const cohortDoc = await getDoc(doc(db, 'cohorts', log.cohortId));
                    if (cohortDoc.exists()) {
                        const cData = cohortDoc.data();
                        const templateTemplateId = cData.programmeId || cData.qualificationId;
                        if (templateTemplateId) {
                            const templateDoc = await getDoc(doc(db, 'programmes', templateTemplateId));
                            if (templateDoc.exists()) {
                                resolvedModulesArray = templateDoc.data().workExperienceModules || [];
                            } else {
                                const qualDoc = await getDoc(doc(db, 'qualifications', templateTemplateId));
                                if (qualDoc.exists()) resolvedModulesArray = qualDoc.data().workExperienceModules || [];
                            }
                        }
                    }
                } catch (err) { console.error(err); }
            }

            const matchingModule = resolvedModulesArray.find((m: any) =>
                (m.code === log.workActivityCode || m.name === log.workActivityLabel || m.name === log.moduleName)
            );

            if (matchingModule && matchingModule.topics && Array.isArray(matchingModule.topics)) {
                const sortedTopics = matchingModule.topics.map((topic: any) => {
                    if (topic.criteria && Array.isArray(topic.criteria)) {
                        const sortedCriteria = [...topic.criteria].sort((a, b) =>
                            a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
                        );
                        return { ...topic, criteria: sortedCriteria };
                    }
                    return topic;
                }).sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true }));

                setModuleTopics(sortedTopics);

                const autoExpandedSet = new Set<string>();
                sortedTopics.forEach((topic: any) => {
                    const containsTick = topic.criteria?.some((c: any) => log.selectedMilestones?.includes(c.code));
                    if (containsTick) autoExpandedSet.add(topic.code);
                });

                if (autoExpandedSet.size === 0 && sortedTopics.length > 0) {
                    autoExpandedSet.add(sortedTopics[0].code);
                }
                setExpandedTopics(autoExpandedSet);
            } else {
                console.warn('Dynamic topics blueprint empty. Generating fallback state container.');
                setModuleTopics([]);
            }

            setIsBlueprintLoading(false);
        };

        fetchSystemAuditDetails();
    }, [log, preloadedEmployer]);

    // ─── REAL-TIME CURRICULUM DESCRIPTION TRANSLATION DICTIONARY ───
    const milestoneDescriptionsLookup = useMemo(() => {
        const dictionaryMap: Record<string, string> = {};
        if (!moduleTopics || !Array.isArray(moduleTopics)) return dictionaryMap;

        moduleTopics.forEach((topic: any) => {
            if (topic.criteria && Array.isArray(topic.criteria)) {
                topic.criteria.forEach((criterion: any) => {
                    if (criterion.code) {
                        dictionaryMap[criterion.code] = criterion.description || criterion.label || criterion.title || '';
                    }
                });
            }
        });
        return dictionaryMap;
    }, [moduleTopics]);

    const toggleTopicAccordion = (topicCode: string) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            if (next.has(topicCode)) next.delete(topicCode);
            else next.add(topicCode);
            return next;
        });
    };

    const displayMentorName = fetchedMentorName || log?.mentorName || 'Assigned Mentor';

    const logVersions = useMemo(() => {
        if (!log) return [];
        if (log.history && log.history.length > 0) {
            return [...log.history, log].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        }
        return [log];
    }, [log]);

    if (!log) return null;

    return (
        <>
            {!isTemplateLoading && createPortal(
                <WorkplaceLogPrintable
                    log={log}
                    logVersions={logVersions}
                    mentorName={displayMentorName}
                    historicalMilestoneMetrics={historicalMilestoneMetrics}
                    employerDetails={employerDetails}
                    assessorName={fetchedAssessorName}
                    learnerSig={learnerSig}
                    mentorSig={mentorSig}
                    assessorSig={assessorSig}
                    moduleTopics={moduleTopics}
                />,
                document.body
            )}

            {createPortal(
                <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 999999 }}>
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        .quill-content-display { 
                            word-wrap: break-word !important; 
                            overflow-wrap: break-word !important; 
                            word-break: break-word !important;
                            max-width: 100% !important; 
                            box-sizing: border-box !important;
                        }
                        .quill-content-display *, .quill-content-display p, .quill-content-display span, .quill-content-display li { 
                            word-wrap: break-word !important; 
                            overflow-wrap: break-word !important; 
                            max-width: 100% !important;
                            box-sizing: border-box !important;
                        }
                        .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 6px 0 !important; }
                        .quill-content-display pre { 
                            white-space: pre-wrap !important; 
                            word-wrap: break-word !important; 
                            overflow-x: auto !important; 
                            background: #1e293b !important; 
                            color: #f8fafc !important; 
                            padding: 10px !important; 
                            border-radius: 6px !important; 
                        }
                        .quill-content-display code { background: #f1f5f9 !important; color: #0f172a !important; padding: 2px 4px !important; border-radius: 4px !important; }
                        .quill-content-display table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; margin: 8px 0 !important; }
                        .quill-content-display table td { border: 1px solid #cbd5e1 !important; padding: 6px 10px !important; }
                        .quill-content-display img { max-width: 100% !important; height: auto !important; object-fit: contain !important; }

                        .viewer-se-stack { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; width: 100%; }
                        .viewer-se-card { background: #ffffff; border: 1px solid #cbd5e1; border-left: 4px solid #4f46e5; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
                        .viewer-se-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
                        .viewer-se-badge { background: #e0e7ff; color: #4338ca; font-weight: 800; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
                        .viewer-se-chip-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
                        .viewer-se-tag-chip { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; font-weight: 700; font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; }

                        @media print {
                            #root, .app-container, .main-layout { display: none !important; height: 0 !important; overflow: hidden !important; visibility: hidden !important; }
                            .lfm-overlay, .lfm-modal, .lfm-header, .lfm-body, .lfm-footer { display: none !important; opacity: 0 !important; height: 0 !important; width: 0 !important; overflow: hidden !important; visibility: hidden !important; }
                        }
                    `}} />

                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

                        <div className="lfm-header">
                            <h2 className="lfm-header__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={18} /> Workplace Log Details &amp; Revision History
                            </h2>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="mlab-btn" onClick={() => window.print()} disabled={isTemplateLoading}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600 }}>
                                    <Printer size={14} /> Print This Diary Entry
                                </button>
                                <button className="lfm-close-btn" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                            </div>
                        </div>

                        <div className="lfm-body" style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: MIDNIGHT, width: 40, height: 40, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><Calendar size={20} /></div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: MIDNIGHT, fontSize: '1.1rem' }}>{moment(log.dateString).format('dddd, DD MMMM YYYY')}</div>
                                        <div style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={12} /> {log.startTime} - {log.endTime} ({log.totalHours} hrs)</div>
                                    </div>
                                </div>
                                {log.isQctoAligned && (
                                    <div style={{ textTransform: 'uppercase', textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700 }}>Curriculum Alignment</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: MIDNIGHT }}>{log.workActivityCode}</div>
                                    </div>
                                )}
                            </div>

                            {/* ─── VISUAL COMPANY DETAILS INJECTION ─── */}
                            {employerDetails && (
                                <div style={{ marginTop: '-1rem', display: 'flex', alignItems: 'flex-start', gap: '12px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                    <div style={{ background: '#e2e8f0', padding: '8px', borderRadius: '6px', color: '#475569', marginTop: '2px' }}>
                                        <Building2 size={18} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Host Employer Profile</div>
                                        <div style={{ fontSize: '1rem', color: MIDNIGHT, fontWeight: 800 }}>{employerDetails.companyName}</div>
                                        {employerDetails.address && (
                                            <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MapPin size={12} /> {employerDetails.address}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {log.status === 'Approved' && (
                                <div style={{ marginTop: '-1rem', display: 'flex', alignItems: 'center', gap: '8px', background: '#dcfce7', padding: '12px 16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                    <UserCheck size={18} color="#166534" />
                                    <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 700 }}>Officially Approved by {displayMentorName}</span>
                                </div>
                            )}

                            {log.isQctoAligned && (
                                <div style={{ marginTop: '-1rem' }}>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                                        <div style={{ color: MIDNIGHT, fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>{log.workActivityCode}: {log.workActivityLabel}</div>
                                        <div style={{ color: '#475569', fontSize: '0.85rem' }}><strong>Module:</strong> {log.moduleName}</div>
                                        <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '4px' }}><strong>Topic:</strong> {log.topicTitle}</div>
                                    </div>
                                </div>
                            )}

                            {/* ─── REQUIREMENTS COVERAGE BREAKDOWN GRID ─── */}
                            {log.isQctoAligned && moduleTopics.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '-1rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '-2px' }}>
                                        <ListChecks size={14} /> Module Requirements Breakdown Matrix:
                                    </div>
                                    {moduleTopics.map((topic) => {
                                        const isOpen = expandedTopics.has(topic.code);
                                        const tickedCount = topic.criteria?.filter((c: any) => log.selectedMilestones?.includes(c.code)).length || 0;

                                        return (
                                            <div key={topic.code} style={{ border: '1px solid #dde4e8', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
                                                <div
                                                    onClick={() => toggleTopicAccordion(topic.code)}
                                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: isOpen ? '#f4f7f9' : '#ffffff', cursor: 'pointer', borderBottom: isOpen ? '1px solid #dde4e8' : 'none', transition: 'background 0.15s' }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: MIDNIGHT, fontSize: '0.82rem', flex: 1, paddingRight: '15px' }}>
                                                        <Briefcase size={14} color="var(--mlab-blue)" style={{ flexShrink: 0 }} />
                                                        <span>{topic.code}: {topic.title}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                                        <span style={{ fontSize: '0.7rem', background: tickedCount > 0 ? '#dcfce7' : '#f1f5f9', color: tickedCount > 0 ? '#15803d' : '#475569', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, border: tickedCount > 0 ? '1px solid #bbf7d0' : '1px solid #cbd5e1' }}>
                                                            {tickedCount} / {topic.criteria?.length || 0} Covered
                                                        </span>
                                                        {isOpen ? <ChevronUp size={16} color={MIDNIGHT} /> : <ChevronDown size={16} color={MIDNIGHT} />}
                                                    </div>
                                                </div>

                                                {isOpen && (
                                                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fafbfc', borderTop: '1px solid #dde4e8' }}>
                                                        {topic.criteria?.map((c: any) => {
                                                            const activeToday = log.selectedMilestones?.includes(c.code);
                                                            const pastMetrics = historicalMilestoneMetrics[c.code];
                                                            const isPastCovered = !activeToday && !!pastMetrics && pastMetrics.count > 0;

                                                            return (
                                                                <div key={c.code} style={{ display: 'flex', gap: '10px', fontSize: '0.82rem', alignItems: 'flex-start', color: '#1e293b', fontWeight: 600, lineHeight: 1.45 }}>
                                                                    <span style={{
                                                                        background: activeToday ? '#dcfce7' : (isPastCovered ? '#f0fdf4' : '#fee2e2'),
                                                                        color: activeToday ? '#15803d' : (isPastCovered ? '#16a34a' : '#991b1b'),
                                                                        border: `1px solid ${activeToday ? '#bbf7d0' : (isPastCovered ? '#bbf7d0' : '#fecaca')}`,
                                                                        padding: '1px 6px', fontSize: '0.68rem', borderRadius: '4px', fontFamily: 'monospace', marginTop: '1px'
                                                                    }}>{c.code}</span>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                                        <span style={{ color: activeToday ? '#0f172a' : (isPastCovered ? '#334155' : '#64748b'), textDecoration: activeToday || isPastCovered ? 'none' : 'line-through dashed' }}>
                                                                            {c.description || c.label}
                                                                        </span>
                                                                        <div style={{ marginTop: '2px' }}>
                                                                            {activeToday ? (
                                                                                <strong style={{ color: '#166534', fontSize: '0.75rem' }}>✔️ COVERED IN THIS LOG ENTRY</strong>
                                                                            ) : isPastCovered ? (
                                                                                <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <History size={11} /> ✔️ COVERED IN PRIOR LOGS ({pastMetrics.count} shifts • ~{pastMetrics.totalHours.toFixed(1)} hrs logged)
                                                                                </span>
                                                                            ) : (
                                                                                <strong style={{ color: '#b91c1c', fontSize: '0.75rem' }}>❌ OUTSTANDING IN PORTFOLIO SCOPE</strong>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ─── HISTORICAL REVISION ENGINE TIMELINE VERTICAL SPLIT ─── */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {logVersions.map((version: any, idx: number) => {
                                    const isLatest = idx === 0;
                                    const versionNumber = logVersions.length - idx;
                                    const waCodes = version.selectedMilestones?.filter((m: string) => m.startsWith('WA')) || [];
                                    const cwkCodes = version.selectedMilestones?.filter((m: string) => m.startsWith('CWK')) || [];

                                    return (
                                        <div key={version.updatedAt || idx} style={{ position: 'relative', paddingLeft: '20px', borderLeft: '2px solid var(--mlab-border)' }}>
                                            <div style={{ position: 'absolute', left: '-8px', top: '0px', width: '14px', height: '14px', borderRadius: '50%', background: isLatest ? 'var(--mlab-blue)' : '#cbd5e1', border: '3px solid white' }} />

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <h3 style={{ margin: 0, fontSize: '1.05rem', color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    Version {versionNumber}
                                                    {isLatest && <span style={{ fontSize: '0.7rem', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', fontWeight: 700 }}>Latest</span>}
                                                </h3>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    {version.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>Draft</span>}
                                                    {version.status === 'Pending_Mentor_Approval' && <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a' }}>Pending Review</span>}
                                                    {version.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0' }}>Approved</span>}
                                                    {version.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca' }}>Rejected</span>}
                                                    {version.status === 'Approved' && <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}><UserCheck size={14} /> {displayMentorName}</span>}
                                                </div>
                                            </div>

                                            <div style={{ marginBottom: '1rem' }}>
                                                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>Tasks Performed</h4>
                                                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--mlab-border)', color: '#334155', fontSize: '0.9rem', lineHeight: 1.6 }} className="quill-content-display" dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">No description provided...</span>' }} />
                                            </div>

                                            {version.isQctoAligned && waCodes.length > 0 && (
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>Work Activity Milestones Targetted</h4>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', background: '#f8fafc', padding: '8px', border: '1px solid var(--mlab-border)', borderRadius: '6px' }}>
                                                        {waCodes.map((mc: string) => {
                                                            const textStringDescription = version.milestoneLabels?.[mc] || milestoneDescriptionsLookup[mc] || mc;
                                                            return (
                                                                <span key={mc} title={textStringDescription} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontFamily: 'monospace', color: '#334155', fontWeight: 600 }}>{mc}</span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* ─── 🚀 INLINE CONTEXTUAL KNOWLEDGE RENDERER ─── */}
                                            {version.isQctoAligned && cwkCodes.length > 0 && (
                                                <div style={{ marginBottom: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px', borderRadius: '8px' }}>
                                                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#0369a1', margin: '0 0 10px 0', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}><Info size={12} /> Contextual Knowledge Validations</h4>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {cwkCodes.map((cwkCode: string) => {
                                                            const cwkUrl = version.cwkEvidence?.[cwkCode];
                                                            const isPreviewOpen = previewCwkId === `${versionNumber}_${cwkCode}`;
                                                            const textStringDescription = version.milestoneLabels?.[cwkCode] || milestoneDescriptionsLookup[cwkCode] || 'Contextual Framework Concept';

                                                            return (
                                                                <div key={cwkCode} style={{ background: 'white', padding: '8px 12px', borderRadius: '6px', border: '1px dashed #bae6fd', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#0f172a', fontWeight: 600 }}>
                                                                        <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontFamily: 'monospace' }}>{cwkCode}</span>
                                                                        {textStringDescription}
                                                                    </div>

                                                                    {cwkUrl ? (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '48px' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setPreviewCwkId(isPreviewOpen ? null : `${versionNumber}_${cwkCode}`)}
                                                                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                            >
                                                                                {isPreviewOpen ? <EyeOff size={10} /> : <Eye size={10} />}
                                                                                Preview
                                                                            </button>
                                                                            <a
                                                                                href={cwkUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                                                                            >
                                                                                <ExternalLink size={10} /> Open Proof
                                                                            </a>
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ paddingLeft: '48px', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700 }}>
                                                                            ⚠️ Missing required documentation
                                                                        </div>
                                                                    )}

                                                                    {isPreviewOpen && cwkUrl && (
                                                                        <div className="animate-fade-in" style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc', marginTop: '4px', marginLeft: '48px', display: 'flex', justifyContent: 'center' }}>
                                                                            {isImageFile(cwkUrl) ? (
                                                                                <img src={cwkUrl} alt="CWK Render" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }} />
                                                                            ) : (
                                                                                <iframe src={cwkUrl} title="CWK Preview Frame" style={{ width: '100%', height: '200px', border: 'none', background: 'white' }} />
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* ─── 🚀 RELATIONAL MULTI-LINE HYBRID SE PORTFOLIO ARTIFACT VISUALIZER ─── */}
                                            {version.customEvidenceTracking && version.customEvidenceTracking.length > 0 && (
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>
                                                        Bound Supporting Evidence Artifacts ({version.customEvidenceTracking.length})
                                                    </h4>
                                                    <div className="viewer-se-stack">
                                                        {version.customEvidenceTracking.map((seItem: any, seIdx: number) => {
                                                            const uniquePreviewKey = `${versionNumber}_${idx}_${seItem.code}`;
                                                            const isCustomPreviewOpen = previewCustomSeId === uniquePreviewKey;

                                                            return (
                                                                <div key={seIdx} className="viewer-se-card">
                                                                    <div className="viewer-se-header">
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                            <span className="viewer-se-badge">{seItem.code}</span>
                                                                            <strong style={{ fontSize: '0.85rem', color: MIDNIGHT }}>{seItem.description}</strong>
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: seItem.type === 'link' ? '#fffbeb' : '#f8fafc', color: seItem.type === 'link' ? '#b45309' : '#475569', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>
                                                                                {seItem.type === 'link' ? <Link2 size={10} /> : <FileText size={10} />}
                                                                                {seItem.type || 'file'}
                                                                            </span>
                                                                        </div>

                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            {seItem.type !== 'link' && seItem.fileUrl && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setPreviewCustomSeId(isCustomPreviewOpen ? null : uniquePreviewKey)}
                                                                                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                                >
                                                                                    {isCustomPreviewOpen ? <EyeOff size={11} /> : <Eye size={11} />}
                                                                                    Preview
                                                                                </button>
                                                                            )}
                                                                            {seItem.fileUrl && (
                                                                                <a
                                                                                    href={seItem.fileUrl}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600, color: '#3b82f6', background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', textDecoration: 'none', border: '1px solid #bfdbfe' }}
                                                                                >
                                                                                    <ExternalLink size={11} />
                                                                                    {seItem.type === 'link' ? 'Open Destination URL' : 'Open Document'}
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Mapping Chips Trace Line */}
                                                                    {seItem.linkedWorkActivities && seItem.linkedWorkActivities.length > 0 && (
                                                                        <div className="viewer-se-chip-row">
                                                                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Proves Activities:</span>
                                                                            {seItem.linkedWorkActivities.map((waCode: string) => {
                                                                                const boundWaDescriptionText = version.milestoneTranslations?.[waCode] || milestoneDescriptionsLookup[waCode] || 'Work Activity Metric';
                                                                                return (
                                                                                    <span key={waCode} title={boundWaDescriptionText} className="viewer-se-tag-chip">{waCode}</span>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}

                                                                    {/* Custom Nested Inline Frame Renderer */}
                                                                    {isCustomPreviewOpen && seItem.type !== 'link' && seItem.fileUrl && (
                                                                        <div className="animate-fade-in" style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                                                                            {isImageFile(seItem.fileUrl) ? (
                                                                                <img src={seItem.fileUrl} alt="Artifact inline render" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '250px', objectFit: 'contain' }} />
                                                                            ) : (
                                                                                <iframe src={seItem.fileUrl} title="Artifact Frame Preview" style={{ width: '100%', height: '250px', border: 'none', background: 'white' }} />
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Legacy Singleton Base File Attachment Node (Kept for backwards dataset continuity) */}
                                            {version.evidenceUrl && (
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>Global Timesheet Attachment Summary</h4>
                                                    <div style={{ padding: '8px', border: '1px solid var(--mlab-border)', borderRadius: '8px', background: '#f8fafc' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                                            <a href={version.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', background: 'white', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', border: '1px solid #cbd5e1' }}><ExternalLink size={12} /> Open File in Full Tab</a>
                                                        </div>
                                                        <div style={{ width: '100%', minHeight: '250px', background: 'white', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                            {isImageFile(version.evidenceUrl) ? (
                                                                <img src={version.evidenceUrl} alt="Evidence Frame" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
                                                            ) : (
                                                                <iframe src={version.evidenceUrl} title="Evidence Frame" style={{ width: '100%', height: '350px', border: 'none' }} />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {version.rejectionReason && version.status !== 'Approved' && (
                                                <div style={{ background: version.status === 'Rejected' ? '#fff1f2' : '#f8fafc', border: `1px dashed ${version.status === 'Rejected' ? '#fca5a5' : '#cbd5e1'}`, padding: '14px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <AlertTriangle size={18} color={version.status === 'Rejected' ? '#be123c' : '#475569'} style={{ marginTop: '2px', flexShrink: 0 }} />
                                                    <div style={{ width: '100%' }}>
                                                        <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: version.status === 'Rejected' ? '#be123c' : '#475569', display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }}>Mentor's Correction Notice</strong>
                                                        <div className="quill-content-display" style={{ color: version.status === 'Rejected' ? '#9f1239' : '#334155', fontSize: '0.9rem', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: version.rejectionReason }} />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Supervisor Approval Notes Component Layout */}
                                            {version.status === 'Approved' && version.reason && (
                                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '12px' }}>
                                                    <UserCheck size={18} color="#166534" style={{ marginTop: '2px', flexShrink: 0 }} />
                                                    <div style={{ width: '100%' }}>
                                                        <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#166534', display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }}>Supervisor Verification Notes</strong>
                                                        <div className="quill-content-display" style={{ color: '#14532d', fontSize: '0.9rem', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: version.reason }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-border)' }}>
                            <button className="mlab-btn mlab-btn--ghost" onClick={onClose} style={{ cursor: 'pointer' }}>Close Window</button>

                            {allowEdit && onEdit && ['Draft', 'Rejected'].includes(log.status) && (
                                <button
                                    onClick={() => {
                                        onClose();
                                        onEdit(log);
                                    }}
                                    className="mlab-btn mlab-btn--primary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}
                                >
                                    <Pencil size={14} /> Edit &amp; Resubmit
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};