import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Users, Calendar, ChevronLeft, Mail, Phone, Award, DownloadCloud,
    FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
    UploadCloud, Search, Briefcase, UserMinus, Timer, LayoutList, CheckSquare,
    Layers, ChevronUp, ChevronDown, Sparkles, Link as LinkIcon, Plus, Trash2,
    Edit3, X, PenTool, FileText, CheckCircle,
    Loader2,
    RefreshCcw,
    BookOpen
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, getDocs, writeBatch, increment, updateDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useToast } from '../../../components/common/Toast/Toast';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import { WorkplacePlacementModal } from '../../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
import { CurriculumTraceabilityCard } from '../../../components/admin/facilitator/CurriculumTraceabilityCard';
import type { DashboardLearner } from '../../../types';
import Loader from '../../../components/common/Loader/Loader';
import { ZoomAttendanceDropZone } from '../attendance/ZoomAttendanceDropZone';

// ─── UTILS & SUB-COMPONENTS ─────────────────────────────────────────────────

const quillModules = {
    toolbar: [
        [{ 'header': [1, 2, 3, 4, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'table': true }],
        ['blockquote', 'code-block'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }],
        ['clean']
    ],
    table: true
};

const cleanRichText = (html?: string) => {
    if (!html) return '';
    return html.replace(/&nbsp;/g, ' ');
};

const formatQCTODate = (d?: string) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
};

const getDOBFromID = (id: string) => {
    const clean = String(id || '').replace(/\s/g, '');
    if (clean.length !== 13) return '';
    try {
        let y = parseInt(clean.substring(0, 2), 10);
        const m = clean.substring(2, 4), d2 = clean.substring(4, 6);
        y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
        return `${y}${m}${d2}`;
    } catch { return ''; }
};

const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });

const ModuleChip: React.FC<{ label: string; count: number; variant: 'k' | 'p' | 'w' }> = ({ label, count, variant }) => (
    <span className={`cdp-chip cdp-chip--${variant}`}>{label}: {count}</span>
);

// ─── AI LESSON PLAN MODAL ───────────────────────────────────────────────────

const AILessonPlanModal: React.FC<any> = ({ isOpen, onClose, onSave, onShowStatus, selectedTopics, curriculumItems, activeProgramme, cohort, user, existingReport, staff }) => {
    const [isGenerating, setIsGenerating] = useState(true);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [planHtml, setPlanHtml] = useState('');
    const [evidenceItems, setEvidenceItems] = useState<{ url: string, description: string }[]>([{ url: '', description: '' }]);
    const [loadingStep, setLoadingStep] = useState(0);
    const loadingMessages = ["Initializing OpenAI...", "Analyzing Curriculum...", "Structuring outcomes...", "Finalizing report..."];
    const quillRef = useRef<ReactQuill>(null);
    const hasGeneratedRef = useRef(false);

    const [authorSignature, setAuthorSignature] = useState<string | null>(null);
    const authorId = existingReport ? existingReport.facilitatorId : user?.uid;
    const displayName = existingReport ? (existingReport.facilitatorName || 'Instructor') : (user?.fullName || 'Instructor');

    useEffect(() => {
        if (!isOpen || !authorId) return;

        if (existingReport?.facilitatorSignatureUrl) {
            setAuthorSignature(existingReport.facilitatorSignatureUrl);
            return;
        }

        const fetchSignature = async () => {
            try {
                const userSnap = await getDoc(doc(db, 'users', authorId));
                if (userSnap.exists()) {
                    setAuthorSignature(userSnap.data().signatureUrl || null);
                }
            } catch (error) {
                console.error("Failed to fetch author signature:", error);
            }
        };

        fetchSignature();
    }, [isOpen, authorId, existingReport]);

    useEffect(() => {
        if (!isGenerating) return;
        const interval = setInterval(() => setLoadingStep(prev => (prev < loadingMessages.length - 1 ? prev + 1 : prev)), 1500);
        return () => clearInterval(interval);
    }, [isGenerating, loadingMessages.length]);

    useEffect(() => {
        if (!isOpen) { hasGeneratedRef.current = false; setLoadingStep(0); return; }
        if (existingReport) {
            setPlanHtml(existingReport.reportHtml || '');
            setEvidenceItems(existingReport.evidenceLinks?.length ? existingReport.evidenceLinks : [{ url: '', description: '' }]);
            setIsGenerating(false);
            hasGeneratedRef.current = true;
        } else {
            if (!hasGeneratedRef.current) {
                hasGeneratedRef.current = true;
                const generateFromAI = async () => {
                    setIsGenerating(true);
                    setLoadingStep(0);
                    const selectedDefs = Object.keys(selectedTopics).map(id => curriculumItems.find((i: any) => i.id === id)).filter(Boolean);
                    const moduleNames = Array.from(new Set(selectedDefs.map(d => d.moduleName))).join(', ');
                    const topicList = selectedDefs.map(d => `<li style="color: #000000;">${d.code ? `${d.code}: ` : ''}${d.title}</li>`).join('');

                    try {
                        const functions = getFunctions();
                        const draftSessionReport = httpsCallable(functions, 'draftSessionReport');
                        const response = await draftSessionReport({
                            topics: selectedDefs, moduleNames, programmeName: activeProgramme?.name || cohort?.name,
                            nqfLevel: activeProgramme?.nqfLevel || 'N/A', saqaId: activeProgramme?.saqaId || 'N/A',
                            qctoId: activeProgramme?.qctoId || activeProgramme?.curriculumCode || 'N/A', credits: activeProgramme?.credits || 'N/A',
                            facilitatorName: user?.fullName, preferences: user?.preferences ? `Teaching style: ${user.preferences.teachingStyle}` : null
                        });

                        const data = response.data as any;
                        if (data.success && data.html) {
                            let finalHtml = data.html;
                            if (user?.signatureUrl) finalHtml = finalHtml.replace(`<strong>Delivered By:</strong> ${user?.fullName}</p>`, `<strong>Delivered By:</strong> ${user?.fullName}</p><img src="${user.signatureUrl}" style="max-height: 50px; display: block; margin: 10px 0;" alt="Digital Signature" />`);
                            setPlanHtml(finalHtml);
                            onShowStatus('success', 'AI Generation Complete', 'OpenAI has drafted your lesson plan.');
                        } else throw new Error("Invalid HTML returned from AI");
                    } catch (error: any) {
                        onShowStatus('warning', 'AI Unavailable', "OpenAI service busy. Loaded standard template instead.");
                        setPlanHtml(`<h3>1. Programme Information</h3><p><strong>Programme:</strong> ${activeProgramme?.name || cohort?.name}</p><p><strong>SAQA ID:</strong> ${activeProgramme?.saqaId || 'N/A'}</p><ul>${topicList}</ul><hr/><p><strong>Delivered By:</strong> ${user?.fullName}</p>${user?.signatureUrl ? `<img src="${user.signatureUrl}" style="max-height: 50px;"/>` : ''}`);
                    } finally {
                        setIsGenerating(false);
                    }
                };
                generateFromAI();
            }
        }
    }, [isOpen, existingReport, selectedTopics, curriculumItems, activeProgramme, cohort, user, onShowStatus]);

    const handleEnhanceText = async () => {
        const editor = quillRef.current?.getEditor();
        if (!editor) return;
        const range = editor.getSelection();
        if (!range || range.length === 0) return onShowStatus('info', 'No Text Selected', 'Highlight specific text to enhance.');

        setIsEnhancing(true);
        try {
            const functions = getFunctions();
            const enhanceTextFn = httpsCallable(functions, 'enhanceText');
            const response = await enhanceTextFn({ text: editor.getText(range.index, range.length) });
            const data = response.data as any;
            if (data.success && data.text) {
                editor.deleteText(range.index, range.length);
                editor.insertText(range.index, data.text);
                setPlanHtml(editor.root.innerHTML);
            }
        } catch (error) {
            onShowStatus('error', 'Enhancement Failed', 'The AI service is currently busy.');
        } finally {
            setIsEnhancing(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="lfm-overlay" style={{ zIndex: 99999 }}>
            <div className="lfm-modal" style={{ maxWidth: '1000px', height: '90vh' }}>
                <div className="lfm-header" style={{ background: 'var(--mlab-blue)' }}>
                    <h2 className="lfm-header__title" style={{ color: 'white' }}>
                        {existingReport ? <Edit3 size={18} color="var(--mlab-green)" /> : <Sparkles size={18} color="var(--mlab-green)" />}
                        {existingReport ? 'Edit Session Report' : 'Smart Session Report'}
                    </h2>
                    <button className="lfm-close-btn" onClick={onClose}><X size={20} style={{ color: 'white' }} /></button>
                </div>

                <div className="lfm-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#f8fafc', padding: 0 }}>
                    {isGenerating ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '450px', color: 'var(--mlab-blue)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', background: 'rgba(148, 199, 61, 0.1)', borderRadius: '50%', marginBottom: '1.5rem' }}>
                                <Sparkles size={40} color="var(--mlab-green)" />
                            </div>
                            <h3 style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--mlab-midnight)' }}>Crafting Lesson Plan...</h3>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                            <div style={{ flex: 2, padding: '1.5rem', borderRight: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', borderLeft: '4px solid #0ea5e9', padding: '8px 12px', borderRadius: '4px', fontSize: '0.8rem', color: '#0369a1', flex: 1, marginRight: '1rem' }}>
                                        {!existingReport ? <strong>Automated QCTO Compliance:</strong> : <strong>Edit Mode:</strong>} Review and tweak your content below.
                                    </div>
                                    <button onClick={handleEnhanceText} disabled={isEnhancing} className="lfm-btn" style={{ background: '#fdf4ff', color: '#c026d3', border: '1px solid #f0abfc', borderRadius: '4px', padding: '6px 12px', fontSize: '0.75rem', cursor: isEnhancing ? 'not-allowed' : 'pointer' }}>
                                        {isEnhancing ? <Loader2 size={14} className="lfm-spin" /> : <Sparkles size={14} />} Enhance Highlighted Text
                                    </button>
                                </div>
                                <div style={{ background: 'white', color: '#000000', border: '1px solid var(--mlab-border)', borderRadius: '8px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <ReactQuill ref={quillRef} theme="snow" value={planHtml} onChange={setPlanHtml} modules={quillModules} style={{ height: '350px', display: 'flex', flexDirection: 'column' }} />
                                </div>
                            </div>

                            <div style={{ flex: 1, padding: '1.5rem', background: 'white', overflowY: 'auto', borderLeft: '1px solid var(--mlab-border)' }}>
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem', borderLeft: '4px solid var(--mlab-green)' }}>
                                    <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: '#166534', textTransform: 'uppercase', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}><PenTool size={16} /> Digital Authentication</h4>

                                    {authorSignature ? (
                                        <div style={{ background: 'white', padding: '12px', borderRadius: '4px', border: '1px dashed #bbf7d0', textAlign: 'center' }}>
                                            <img src={authorSignature} alt="Signature" style={{ maxHeight: '60px', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                                            <div style={{ fontSize: '0.65rem', color: '#166534', marginTop: '6px', fontWeight: 'bold' }}>VERIFIED: {displayName?.toUpperCase()}</div>
                                        </div>
                                    ) : (
                                        <div style={{ background: 'white', padding: '12px', borderRadius: '4px', border: '1px dashed #fca5a5', textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 600 }}>No signature found for {displayName}</div>
                                        </div>
                                    )}
                                </div>

                                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 1rem' }}><LinkIcon size={16} style={{ display: 'inline', marginRight: '6px' }} /> Session Evidence</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {evidenceItems.map((item, idx) => (
                                        <div key={idx} style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--mlab-grey)' }}>Item {idx + 1}</span>
                                                {evidenceItems.length > 1 && <button onClick={() => setEvidenceItems(p => p.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}><Trash2 size={14} /></button>}
                                            </div>
                                            <input type="url" className="lfm-input" placeholder="https://..." value={item.url} onChange={e => { const n = [...evidenceItems]; n[idx].url = e.target.value; setEvidenceItems(n); }} style={{ marginBottom: '8px', fontSize: '0.8rem', padding: '6px' }} />
                                            <input type="text" className="lfm-input" placeholder="Description (e.g. Code Repository)" value={item.description} onChange={e => { const n = [...evidenceItems]; n[idx].description = e.target.value; setEvidenceItems(n); }} style={{ fontSize: '0.8rem', padding: '6px' }} />
                                        </div>
                                    ))}
                                    <button onClick={() => setEvidenceItems(p => [...p, { url: '', description: '' }])} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'center', padding: '8px', fontSize: '0.8rem' }}><Plus size={14} /> Add Another Link</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="lfm-footer" style={{ background: 'var(--mlab-bg)' }}>
                    <button className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isGenerating || isEnhancing}>Cancel</button>
                    <button className="lfm-btn lfm-btn--primary" onClick={() => onSave(planHtml, evidenceItems.filter(e => e.url), !!existingReport, existingReport?.id)} disabled={isGenerating || isEnhancing}>
                        <CheckCircle size={16} /> {existingReport ? 'Update Session Report' : 'Save Log & Publish Topics'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── 1. BOOTCAMP COHORT VIEW ────────────────────────────────────────────────
export const BootcampCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
    const navigate = useNavigate();
    const toast = useToast();

    const { user, learners, enrollments, staff } = useStore();

    const [activeTab, setActiveTab] = useState<'learners' | 'attendance'>('learners');

    // Controls the Zoom Drop Zone popup
    const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);

    const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

    const [ledgerDates, setLedgerDates] = useState<string[]>([]);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [isGrantingTime, setIsGrantingTime] = useState(false);

    //  FILTER STATES
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
    const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

    const isAdmin = user?.role === 'admin';

    const handleBack = () => {
        if (isAdmin) {
            navigate('/admin', { state: { activeTab: 'cohorts' } });
        } else {
            navigate(-1);
        }
    };

    const enrolledLearners = useMemo(() => {
        if (!cohort || !cohort.id) return [];

        const cohortEnrollments = enrollments.filter(e => e.cohortId === cohort.id);
        const merged: DashboardLearner[] = [];

        cohortEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
            if (profile?.fullName && profile?.idNumber) {
                merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
            }
        });

        learners.forEach(profile => {
            if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
                merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
            }
        });

        return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
    }, [learners, enrollments, cohort]);

    const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;
    const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;

    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'attendance_logs'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            logs.sort((a: any, b: any) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
            setAttendanceLogs(logs);
        });
        return () => unsubscribe();
    }, [cohort]);

    useEffect(() => {
        if (!cohort?.id) return;
        const qRecords = query(collection(db, 'attendance_records'), where('cohortId', '==', cohort.id));
        const unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
            setAttendanceRecords(snapshot.docs.map(doc => doc.data()));
        });
        return () => unsubscribeRecords();
    }, [cohort]);

    const fetchSubmissions = async () => {
        try {
            const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id)));
            setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error('Error fetching submissions:', e); }
    };

    useEffect(() => {
        fetchSubmissions();
    }, [cohort.id]);

    const rosterAttendanceMap = useMemo(() => {
        const map = new Map<string, { attended: number; total: number; pct: number }>();
        const totalSessions = attendanceLogs.length;

        attendanceRecords.forEach(rec => {
            if (!rec.learnerId) return;
            if (!map.has(rec.learnerId)) {
                map.set(rec.learnerId, { attended: 0, total: totalSessions, pct: 0 });
            }
            const entry = map.get(rec.learnerId)!;
            if (rec.status === 'Present' || rec.status === 'Partial') {
                entry.attended += 1;
            }
        });

        map.forEach(value => {
            value.total = totalSessions;
            value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
        });

        return map;
    }, [attendanceRecords, attendanceLogs.length]);

    const filteredLearners = useMemo(() => {
        return enrolledLearners.filter(learner => {
            const searchLower = searchTerm.toLowerCase().trim();
            const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
            const matchesSearch = !searchLower ||
                learner.fullName.toLowerCase().includes(searchLower) ||
                learner.idNumber.includes(searchLower) ||
                dbEmail.includes(searchLower);

            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && learner.status !== 'dropped') ||
                (statusFilter === 'dropped' && learner.status === 'dropped');

            const stats = rosterAttendanceMap.get(learner.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };
            let matchesAttendance = true;
            if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
            else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
            else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

            return matchesSearch && matchesStatus && matchesAttendance;
        });
    }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, attendanceLogs.length]);

    const filteredAttendanceLogs = useMemo(() => {
        if (ledgerDates.length === 0) return attendanceLogs;
        return attendanceLogs.filter(log => {
            const logDate = log.sessionDate ? log.sessionDate.split('T')[0] : '';
            return ledgerDates.includes(logDate);
        });
    }, [attendanceLogs, ledgerDates]);

    const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value;
        if (date && !ledgerDates.includes(date)) {
            setLedgerDates([...ledgerDates, date]);
        }
    };

    const removeLedgerDate = (dateToRemove: string) => {
        setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));
    };

    // 🚀 NEW: Group Active Exams with Learner Names
    const activeAssessmentsMap = useMemo(() => {
        const map = new Map<string, { title: string, count: number, subs: any[], learnerNames: string[] }>();
        submissions.forEach(s => {
            if (s.status === 'in_progress') {
                if (!map.has(s.assessmentId)) {
                    map.set(s.assessmentId, { title: s.title || 'Unknown Assessment', count: 0, subs: [], learnerNames: [] });
                }
                const entry = map.get(s.assessmentId)!;
                entry.count++;
                entry.subs.push(s);

                const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
                entry.learnerNames.push(matchedLearner?.fullName || 'Unknown Learner');
            }
        });
        return Array.from(map.values());
    }, [submissions, enrolledLearners]);

    const grantExtraTimeToExam = async (subsToUpdate: any[], minutes: number, examTitle: string) => {
        if (subsToUpdate.length === 0) return;
        if (!window.confirm(`Add ${minutes} minutes to the clock for ${subsToUpdate.length} learner(s) taking ${examTitle}?`)) return;

        setIsGrantingTime(true);
        try {
            const batch = writeBatch(db);
            subsToUpdate.forEach(sub => {
                batch.update(doc(db, 'learner_submissions', sub.id), {
                    extraTimeGranted: increment(minutes),
                    lastStaffEditAt: new Date().toISOString()
                });
            });
            await batch.commit();
            toast.success(`Successfully granted +${minutes} minutes to ${examTitle}!`);
            await fetchSubmissions();
        } catch (error) {
            toast.error("Failed to grant extra time.");
        } finally {
            setIsGrantingTime(false);
        }
    };

    const handleExport = () => {
        if (filteredLearners.length === 0) {
            toast.error('No matching records to export.');
            return;
        }

        const dataRows = filteredLearners.map(l => {
            const att = rosterAttendanceMap.get(l.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };
            return {
                "Full Name": l.fullName,
                "ID Number": l.idNumber,
                "Email Address": l.email || l.demographics?.learnerEmailAddress || 'N/A',
                "Phone Number": l.phone || l.mobile || l.demographics?.learnerPhoneNumber || 'N/A',
                "Attendance Score": `${att.attended}/${att.total} (${att.pct}%)`,
                "Status": l.status === 'dropped' ? 'Withdrawn' : 'Active Applicant',
                "Enrolled Date": l.createdAt?.split('T')[0] || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bootcamp Roster');
        XLSX.writeFile(wb, `Bootcamp_Applicants_${cohort.name.replace(/\s+/g, '_')}.xlsx`);
        toast.success('Roster exported successfully with tracking metrics.');
    };

    if (!cohort) return null;

    return (
        <div className="cdp-layout">

            <ZoomAttendanceDropZone
                isOpen={isDropZoneOpen}
                onClose={() => setIsDropZoneOpen(false)}
                cohort={cohort}
                enrolledLearners={enrolledLearners}
            />

            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

            <main className="cdp-main">
                <header className="cdp-header">
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={handleBack}>
                            <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
                        </button>
                        <div className="cdp-header__eyebrow"><Users size={12} /> Bootcamp Funnel</div>
                        <h1 className="cdp-header__title">{cohort.name}</h1>
                        <p className="cdp-header__sub">
                            <Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}
                            <span className="cdp-header__status cdp-header__status--active">Bootcamp Active</span>
                        </p>
                    </div>
                    <div className="cdp-header__right">
                        <button className="cdp-btn cdp-btn--outline" onClick={handleExport}>
                            <DownloadCloud size={13} /> Export List
                        </button>
                    </div>
                </header>

                <div className="cdp-content">
                    {/* 🚀 NEW: Dynamic Active Assessment Banners */}
                    {activeAssessmentsMap.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                            {activeAssessmentsMap.map((exam, idx) => (
                                <div key={idx} className="animate-fade-in" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ background: '#3b82f6', padding: '8px', borderRadius: '50%', boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)' }}>
                                            <Timer size={20} color="white" />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '1rem', fontWeight: 700 }}>
                                                {exam.title} <span style={{ fontSize: '0.7rem', color: '#ef4444', textTransform: 'uppercase', paddingLeft: '6px', animation: 'pulse 2s infinite' }}>● Live</span>
                                            </h3>
                                            <p style={{ margin: '4px 0 0 0', color: '#2563eb', fontSize: '0.85rem' }}>
                                                <strong>{exam.count}</strong> learner(s) currently writing: <span style={{ fontStyle: 'italic', opacity: 0.8 }}>{exam.learnerNames.join(', ')}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            className="cdp-btn"
                                            style={{ background: 'white', color: '#2563eb', border: '1px solid #bfdbfe' }}
                                            onClick={() => grantExtraTimeToExam(exam.subs, 15, exam.title)}
                                            disabled={isGrantingTime}
                                        >
                                            {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />} +15 Mins
                                        </button>
                                        <button
                                            className="cdp-btn"
                                            style={{ background: '#2563eb', color: 'white', border: '1px solid #2563eb' }}
                                            onClick={() => grantExtraTimeToExam(exam.subs, 30, exam.title)}
                                            disabled={isGrantingTime}
                                        >
                                            {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />} +30 Mins
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="cdp-stat-row">
                        <div className="cdp-stat-card cdp-stat-card--blue">
                            <div className="cdp-stat-card__icon"><Users size={20} /></div>
                            <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Applicants</span></div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--grey">
                            <div className="cdp-stat-card__icon"><Award size={20} /></div>
                            <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{droppedCount}</span><span className="cdp-stat-card__label">Withdrawn</span></div>
                        </div>
                    </div>

                    <div className="lfm-tabs" style={{ marginBottom: '1.5rem' }}>
                        <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
                            <Users size={16} /> Applicant Roster
                        </button>
                        <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
                            <UserCheck size={16} /> Attendance Tracker
                        </button>
                    </div>

                    {activeTab === 'learners' && (
                        <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
                            <div className="vp-card" style={{ marginBottom: 0 }}>
                                <div className="vp-card-header">
                                    <div className="vp-card-title-group">
                                        <Users size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                            Registered Applicants ({filteredLearners.length})
                                        </h3>
                                    </div>
                                </div>

                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem',
                                    backgroundColor: '#f8fafc', borderBottom: '1px solid var(--mlab-border)',
                                    alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                    <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
                                        <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search name, ID or email..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: '0.85rem', color: 'var(--mlab-midnight)', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', outline: 'none' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status:</label>
                                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}>
                                                <option value="all">All Applicants</option>
                                                <option value="active">Active Only</option>
                                                <option value="dropped">Withdrawn Only</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Attendance:</label>
                                            <select value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value as any)} style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}>
                                                <option value="all">All Attendance Bands</option>
                                                <option value="high">High Compliance (75%+)</option>
                                                <option value="mid">Average Compliance (40% - 74%)</option>
                                                <option value="low">Critical Risk (&lt; 40%)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="mlab-table-wrap">
                                    <table className="mlab-table">
                                        <thead>
                                            <tr>
                                                <th>Applicant Details</th>
                                                <th>Contact Information</th>
                                                <th>Status</th>
                                                <th>Attendance Score</th>
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                        <p style={{ margin: 0, fontWeight: 500 }}>No applicants match your current query parameter thresholds.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLearners.map(learner => {
                                                    const isDropped = learner.status === 'dropped';
                                                    const routingId = learner.enrollmentId || learner.id;
                                                    const stats = rosterAttendanceMap.get(learner.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };

                                                    return (
                                                        <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
                                                            <td>
                                                                <div className="cdp-learner-cell">
                                                                    <div className="cdp-learner-avatar">{learner.fullName.charAt(0)}</div>
                                                                    <div className="cdp-learner-cell__info">
                                                                        <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`}>{learner.fullName}</span>
                                                                        <span className="cdp-learner-cell__id">{learner.idNumber}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={12} color="var(--mlab-grey)" /> {learner.email || 'No Email Attached'}</span>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={12} color="var(--mlab-grey)" /> {learner.phone || learner.mobile || 'No Contact Number'}</span>
                                                                </div>
                                                            </td>
                                                            <td><span className={`cdp-status-badge${isDropped ? ' cdp-status-badge--dropped' : ' cdp-status-badge--active'}`}>{isDropped ? 'Withdrawn' : 'Active'}</span></td>

                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        padding: '4px 10px',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 700,
                                                                        letterSpacing: '0.025em',
                                                                        background: stats.pct >= 75 ? '#dcfce7' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
                                                                        color: stats.pct >= 75 ? '#166534' : stats.pct >= 40 ? '#b45309' : '#991b1b',
                                                                        border: stats.pct >= 75 ? '1px solid #bbf7d0' : stats.pct >= 40 ? '1px solid #fde68a' : '1px solid #fca5a5',
                                                                    }}>
                                                                        {stats.pct}%
                                                                    </span>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
                                                                        {stats.attended} / {stats.total} classes
                                                                    </span>
                                                                </div>
                                                            </td>

                                                            <td style={{ textAlign: 'right' }}>
                                                                <div className="cdp-actions" style={{ justifyContent: 'flex-end', display: 'flex' }}>
                                                                    <button
                                                                        className="mlab-btn mlab-btn--sm mlab-btn--ghost"
                                                                        onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
                                                                        title="View Applicant Digital Portfolio"
                                                                    >
                                                                        <FolderOpen size={12} /> Portfolio
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'attendance' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="vp-card" style={{ marginBottom: '2rem' }}>
                                <div className="vp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div className="vp-card-title-group">
                                        <Calendar size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                            Historical Session Ledger
                                        </h3>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid var(--mlab-border)', padding: '6px 12px', borderRadius: '8px' }}>
                                            <Calendar size={16} color="var(--mlab-grey)" />
                                            <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>Filter Dates:</span>
                                            <input type="date" onChange={handleAddLedgerDate} style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.85rem', cursor: 'pointer' }} />
                                        </div>
                                        <button className="cdp-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={() => setIsDropZoneOpen(true)}>
                                            <UploadCloud size={14} /> Upload Zoom CSV
                                        </button>
                                    </div>
                                </div>

                                {ledgerDates.length > 0 && (
                                    <div style={{ padding: '0.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
                                        {ledgerDates.map(date => (
                                            <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#e0f2fe', color: '#0284c7', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeLedgerDate(date)} />
                                            </span>
                                        ))}
                                        <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <XCircle size={12} /> Clear All
                                        </button>
                                    </div>
                                )}

                                <div className="mlab-table-wrap">
                                    {filteredAttendanceLogs.length === 0 ? (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                            <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                            <p>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance records have been logged for this cohort yet.'}</p>
                                        </div>
                                    ) : (
                                        <table className="mlab-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Session Date</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Expected Duration</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Total Captured</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Present (80%+)</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Short Hours</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Absent</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredAttendanceLogs.map((log) => (
                                                    <tr key={log.id}>
                                                        <td style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                            {new Date(log.sessionDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </td>
                                                        <td>
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
                                                                <Clock size={14} /> {log.expectedDuration} mins
                                                            </span>
                                                        </td>
                                                        <td style={{ color: 'var(--mlab-midnight)' }}>{log.totalEnrolled || 0} Learners</td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#dcfce7', color: '#166534', fontSize: '0.8rem', fontWeight: 600 }}>
                                                                <CheckCircle2 size={12} /> {log.totalPresent || 0}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#fef3c7', color: '#b45309', fontSize: '0.8rem', fontWeight: 600 }}>
                                                                <AlertCircle size={12} /> {log.totalPartial || 0}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600 }}>
                                                                <XCircle size={12} /> {log.totalAbsent || 0}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// ─── QCTO COHORT VIEW COMPONENT ──────────────────────────────────────────────

export const QCTOCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
    const navigate = useNavigate();
    const toast = useToast();

    const { user, learners, staff, employers, settings, programmes, enrollments } = useStore();

    const [activeTab, setActiveTab] = useState<'learners' | 'curriculum' | 'attendance'>('learners');
    const [curriculumViewMode, setCurriculumViewMode] = useState<'blueprint' | 'history'>('blueprint');

    const [isSyncing, setIsSyncing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isGrantingTime, setIsGrantingTime] = useState(false);
    const [isLogging, setIsLogging] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
    const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

    const [dailyRegisters, setDailyRegisters] = useState<any[]>([]);
    const [ledgerDates, setLedgerDates] = useState<string[]>([]);

    const [submissions, setSubmissions] = useState<any[]>([]);
    const [curriculumLogs, setCurriculumLogs] = useState<any[]>([]);
    const [sessionReports, setSessionReports] = useState<any[]>([]);
    const [editingReport, setEditingReport] = useState<any | null>(null);

    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
    const [globalCoveredDate, setGlobalCoveredDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [expandedHistoryModules, setExpandedHistoryModules] = useState<Set<string>>(new Set());

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'info', title: '', message: '' });
    const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

    const showStatusPopup = (type: StatusType, title: string, message: string) => { setModalConfig({ isOpen: true, type, title, message }); };

    const isAdmin = user?.role === 'admin';
    const isFacilitator = user?.role === 'facilitator';

    const handleBack = () => {
        if (isAdmin) {
            navigate('/admin', { state: { activeTab: 'cohorts' } });
        } else {
            navigate(-1);
        }
    };

    const activeProgramme = useMemo(() => {
        if (!cohort || !programmes.length) return null;
        const templateId = String(cohort.programmeId || cohort.qualificationId || '').trim();
        if (!templateId) return null;
        return programmes.find(p => p.id === templateId || (p as any).saqaId === templateId || (p as any).curriculumCode === templateId) || null;
    }, [cohort, programmes]);

    const groupedCurriculum = useMemo(() => {
        if (!activeProgramme) return {};
        const groups: Record<string, { moduleName: string, moduleType: string, items: any[] }> = {};
        const extractItems = (modules: any[], type: string) => {
            (modules || []).forEach(mod => {
                const subElements = mod.topics || mod.practicalSkills || mod.workActivities || [];
                const modCode = mod.code || 'General';
                if (!groups[modCode]) groups[modCode] = { moduleName: mod.name || 'Unnamed Module', moduleType: type, items: [] };
                subElements.forEach((sub: any) => groups[modCode].items.push({ id: sub.id || sub.code || Math.random().toString(36).substring(7), code: sub.code || '', title: sub.title || sub.name || sub.description || 'Unnamed Item', moduleCode: modCode, moduleName: mod.name || '', moduleType: type, weight: sub.weight || sub.percentage || '' }));
            });
        };
        extractItems(activeProgramme.knowledgeModules, 'Knowledge');
        extractItems(activeProgramme.practicalModules, 'Practical');
        extractItems(activeProgramme.workExperienceModules, 'Workplace');
        return groups;
    }, [activeProgramme]);

    const curriculumItems = useMemo(() => Object.values(groupedCurriculum).flatMap(g => g.items), [groupedCurriculum]);

    const groupedHistoryLogs = useMemo(() => {
        const groups: Record<string, any[]> = {};
        curriculumLogs.forEach(log => {
            const modCode = log.moduleCode || 'Uncategorized';
            if (!groups[modCode]) groups[modCode] = [];
            groups[modCode].push(log);
        });
        return groups;
    }, [curriculumLogs]);

    const moduleProgress = useMemo(() => {
        const stats = { Knowledge: { total: 0, logged: 0 }, Practical: { total: 0, logged: 0 }, Workplace: { total: 0, logged: 0 } };
        Object.values(groupedCurriculum).forEach(group => {
            const type = group.moduleType as 'Knowledge' | 'Practical' | 'Workplace';
            if (stats[type]) {
                stats[type].total += group.items.length;
                stats[type].logged += group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
            }
        });
        return stats;
    }, [groupedCurriculum, curriculumLogs]);

    const enrolledLearners = useMemo(() => {
        const cohortEnrollments = enrollments.filter(e => e.cohortId === cohort.id);
        const merged: DashboardLearner[] = [];
        cohortEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
            if (profile?.fullName && profile?.idNumber) merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
        });
        learners.forEach(profile => {
            if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
                merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
            }
        });
        return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
    }, [learners, enrollments, cohort.id]);

    const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;

    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'attendance'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const regs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            regs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setDailyRegisters(regs);
        });
        return () => unsubscribe();
    }, [cohort.id]);

    const rosterAttendanceMap = useMemo(() => {
        const map = new Map<string, { attended: number; total: number; pct: number }>();
        const totalSessions = dailyRegisters.length;

        enrolledLearners.forEach(l => {
            if (l.idNumber) map.set(l.idNumber, { attended: 0, total: totalSessions, pct: 0 });
        });

        dailyRegisters.forEach(reg => {
            const present = reg.presentLearners || [];
            present.forEach((idNum: string) => {
                if (map.has(idNum)) {
                    map.get(idNum)!.attended += 1;
                }
            });
        });

        map.forEach(value => {
            value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
        });

        return map;
    }, [dailyRegisters, enrolledLearners]);

    const filteredLearners = useMemo(() => {
        return enrolledLearners.filter(learner => {
            const searchLower = searchTerm.toLowerCase().trim();
            const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
            const matchesSearch = !searchLower ||
                learner.fullName.toLowerCase().includes(searchLower) ||
                learner.idNumber.includes(searchLower) ||
                dbEmail.includes(searchLower);

            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && learner.status !== 'dropped') ||
                (statusFilter === 'dropped' && learner.status === 'dropped');

            const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
            let matchesAttendance = true;
            if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
            else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
            else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

            return matchesSearch && matchesStatus && matchesAttendance;
        });
    }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, dailyRegisters.length]);

    const filteredDailyRegisters = useMemo(() => {
        if (ledgerDates.length === 0) return dailyRegisters;
        return dailyRegisters.filter(reg => {
            return ledgerDates.includes(reg.date);
        });
    }, [dailyRegisters, ledgerDates]);

    const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value;
        if (date && !ledgerDates.includes(date)) {
            setLedgerDates([...ledgerDates, date]);
        }
    };

    const removeLedgerDate = (dateToRemove: string) => {
        setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));
    };

    const fetchSubmissions = async () => {
        try {
            const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id)));
            setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error('Error fetching submissions:', e); }
    };

    useEffect(() => {
        fetchSubmissions();
        const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', '==', cohort.id));
        const unsubLogs = onSnapshot(logsQ, (snap) => setCurriculumLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const reportsQ = query(collection(db, 'session_reports'), where('cohortId', '==', cohort.id));
        const unsubReports = onSnapshot(reportsQ, (snap) => {
            const reps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            reps.sort((a, b) => new Date(b.dateLogged).getTime() - new Date(a.dateLogged).getTime());
            setSessionReports(reps);
        });
        return () => { unsubLogs(); unsubReports(); };
    }, [cohort.id]);

    const toggleModuleAccordion = (moduleCode: string) => { setExpandedModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
    const toggleHistoryAccordion = (moduleCode: string) => { setExpandedHistoryModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
    const toggleTopicSelection = (topicId: string) => { setSelectedTopics(prev => { const next = { ...prev }; next[topicId] ? delete next[topicId] : next[topicId] = globalCoveredDate; return next; }); };
    const handleIndividualDateChange = (topicId: string, newDate: string) => { setSelectedTopics(prev => ({ ...prev, [topicId]: newDate })); };
    const handleGlobalDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newDate = e.target.value; setGlobalCoveredDate(newDate); setSelectedTopics(prev => { const next = { ...prev }; Object.keys(next).forEach(key => { next[key] = newDate; }); return next; }); };

    const handleSaveReport = async (planHtml: string, evidenceLinks: any[], isEdit: boolean, reportId?: string) => {
        if (isEdit && reportId) {
            setIsLogging(true);
            try {
                await updateDoc(doc(db, 'session_reports', reportId), { reportHtml: planHtml, evidenceLinks, lastEditedAt: new Date().toISOString(), lastEditedBy: user?.uid });
                toast.success("Session report updated successfully.");
                setShowAIModal(false);
                setEditingReport(null);
            } catch (error) { toast.error("Failed to update report."); } finally { setIsLogging(false); }
        } else {
            const selectedTopicIds = Object.keys(selectedTopics);
            if (selectedTopicIds.length === 0) return;
            setShowAIModal(false);
            setIsLogging(true);
            try {
                const batch = writeBatch(db);
                const now = new Date();
                const reportRef = doc(collection(db, 'session_reports'));

                batch.set(reportRef, {
                    cohortId: cohort.id,
                    facilitatorId: user?.uid,
                    facilitatorName: user?.fullName,
                    facilitatorSignatureUrl: user?.signatureUrl || null,
                    dateLogged: now.toISOString(),
                    reportHtml: planHtml,
                    evidenceLinks,
                    topicsCovered: selectedTopicIds
                });

                selectedTopicIds.forEach(topicId => {
                    const itemDef = curriculumItems.find(i => i.id === topicId);
                    if (!itemDef) return;
                    batch.set(doc(collection(db, 'curriculum_logs')), {
                        cohortId: cohort.id, topicId: itemDef.id, topicCode: itemDef.code, topicTitle: itemDef.title, moduleCode: itemDef.moduleCode, moduleName: itemDef.moduleName, moduleType: itemDef.moduleType, coveredAt: selectedTopics[topicId], loggedAt: now.toISOString(), deadlineAt: new Date(now.getTime() + (48 * 60 * 60 * 1000)).toISOString(), loggedBy: user?.uid, loggedByName: user?.fullName, sessionReportId: reportRef.id, acknowledgedBy: [], penalizeLearners: []
                    });
                });

                await batch.commit();
                setSelectedTopics({});
                showStatusPopup('success', 'Topics Logged & Published', `Session Report saved and ${selectedTopicIds.length} topics published to Learners.`);
            } catch (error) { showStatusPopup('error', 'Publish Failed', 'Failed to publish topics. Please check your connection and try again.'); } finally { setIsLogging(false); }
        }
    };

    // 🚀 NEW: Group Active Exams with Learner Names
    const activeAssessmentsMap = useMemo(() => {
        const map = new Map<string, { title: string, count: number, subs: any[], learnerNames: string[] }>();
        submissions.forEach(s => {
            if (s.status === 'in_progress') {
                if (!map.has(s.assessmentId)) {
                    map.set(s.assessmentId, { title: s.title || 'Unknown Assessment', count: 0, subs: [], learnerNames: [] });
                }
                const entry = map.get(s.assessmentId)!;
                entry.count++;
                entry.subs.push(s);

                const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
                entry.learnerNames.push(matchedLearner?.fullName || 'Unknown Learner');
            }
        });
        return Array.from(map.values());
    }, [submissions, enrolledLearners]);

    const grantExtraTimeToExam = async (subsToUpdate: any[], minutes: number, examTitle: string) => {
        if (subsToUpdate.length === 0) return;
        if (!window.confirm(`Add ${minutes} minutes to the clock for ${subsToUpdate.length} learner(s) taking ${examTitle}?`)) return;

        setIsGrantingTime(true);
        try {
            const batch = writeBatch(db);
            subsToUpdate.forEach(sub => {
                batch.update(doc(db, 'learner_submissions', sub.id), {
                    extraTimeGranted: increment(minutes),
                    lastStaffEditAt: new Date().toISOString()
                });
            });
            await batch.commit();
            toast.success(`Successfully granted +${minutes} minutes to ${examTitle}!`);
            await fetchSubmissions();
        } catch (error) {
            toast.error("Failed to grant extra time.");
        } finally {
            setIsGrantingTime(false);
        }
    };

    const handleQCTOExport = async () => {
        if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
        setIsExporting(true);
        try {
            const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
            const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
            const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
            const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
            const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId || (p as any).curriculumCode === targetProgId);
            const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
            const todayQCTO = formatQCTODate(new Date().toISOString());

            const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

            const dataRows = [headers.map(createTextCell)];
            enrolledLearners.forEach(learner => {
                const d = learner.demographics || {};
                const names = (learner.fullName || '').trim().split(' ');
                const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
                dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', names.length > 1 ? names.pop() : '', names.join(' '), d.learnerMiddleName || '', d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr'), getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || formatQCTODate(cohort.endDate), d.statementOfResultsStatus || '02', (d.statementOfResultsStatus === '01') ? cleanDate(d.statementOfResultsIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || '1', d.flc || '06', String(d.flcStatementOfResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
            });

            const wb = XLSX.utils.book_new();
            const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Institution:", mainInstitutionName], ["Qualification:", String(qualObj?.name || 'Qualification Name Missing')], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
            XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
            const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
            XLSX.writeFile(wb, fileName);
            toast.success(`Export successful: ${fileName}`);
        } catch (e) { toast.error('Export failed. Check console for details.'); } finally { setIsExporting(false); }
    };

    const syncLearnerWorkbooks = async () => {
        setIsSyncing(true);
        try {
            const batch = writeBatch(db);
            const aRef = collection(db, 'assessments');
            const [snapA, snapS] = await Promise.all([
                getDocs(query(aRef, where('cohortIds', 'array-contains', cohort.id), where('status', 'in', ['active', 'scheduled']))),
                getDocs(query(aRef, where('cohortId', '==', cohort.id), where('status', 'in', ['active', 'scheduled']))),
            ]);
            const allAssessments = new Map<string, any>();
            snapA.docs.forEach(d => allAssessments.set(d.id, d));
            snapS.docs.forEach(d => allAssessments.set(d.id, d));

            if (allAssessments.size === 0) { setIsSyncing(false); return toast.info('No active assessments found to sync.'); }

            let count = 0;
            for (const learner of enrolledLearners) {
                const enrolId = learner.enrollmentId || learner.id;
                const humanId = learner.learnerId || learner.id;
                for (const [astId, astDoc] of allAssessments.entries()) {
                    const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohort.id && (s.enrollmentId === enrolId || s.learnerId === humanId));
                    if (!exists) {
                        const data = astDoc.data();
                        batch.set(doc(db, 'learner_submissions', `${cohort.id}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid: learner.authUid || learner.idNumber || humanId, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId: cohort.id, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
                        count++;
                    }
                }
            }
            if (count > 0) { await batch.commit(); await fetchSubmissions(); toast.success(`Generated ${count} missing workbook(s).`); }
            else toast.success('All learners are synced.');
        } catch (e: any) { toast.error('Sync failed.'); } finally { setIsSyncing(false); }
    };

    const getStaffName = async (id: string) => {
        const cachedStaff = useStore.getState().staff;
        const match = cachedStaff.find(s => s.id === id);
        if (match) return match.fullName;

        try {
            const userSnap = await getDoc(doc(db, 'users', id));
            if (userSnap.exists()) return userSnap.data().fullName;
        } catch { }

        return 'Unassigned';
    };

    const [facName, setFacName] = useState('Loading...');
    const [assName, setAssName] = useState('Loading...');
    const [modName, setModName] = useState('Loading...');

    useEffect(() => {
        if (!cohort) return;
        getStaffName(cohort.facilitatorId).then(setFacName);
        getStaffName(cohort.assessorId).then(setAssName);
        getStaffName(cohort.moderatorId).then(setModName);
    }, [cohort]);


    const handleDropLearner = async (learnerId: string, learnerName: string) => {
        const reason = window.prompt(`QCTO EXIT REASON: Why is ${learnerName} leaving?`);
        if (reason?.trim() && window.confirm(`Mark ${learnerName} as dropped?`)) {
            await useStore.getState().dropLearnerFromCohort(learnerId, cohort.id, reason);
        }
    };

    const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
    const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
    const pendingTotal = submissions.filter(s => s.status === 'submitted').length;
    const selectedTopicCount = Object.keys(selectedTopics).length;

    const renderProgressCard = (title: string, data: { total: number, logged: number }, themeColor: string, bgColor: string) => {
        const pct = data.total > 0 ? Math.round((data.logged / data.total) * 100) : 0;
        return (
            <div style={{ flex: 1, minWidth: '220px', background: 'white', padding: '1.25rem', borderRadius: '8px', border: `1px solid var(--mlab-border)`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--mlab-midnight)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
                    <span style={{ fontWeight: 800, fontSize: '1.2rem', color: themeColor }}>{pct}%</span>
                </div>
                <div style={{ height: '8px', background: bgColor, borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: themeColor, width: `${pct}%`, transition: 'width 0.5s ease-in-out' }} />
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--mlab-grey)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Progress</span>
                    <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>{data.logged} / {data.total} Topics</span>
                </div>
            </div>
        );
    };

    return (
        <div className="cdp-layout">
            {modalConfig.isOpen && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />
                </div>,
                document.body
            )}
            {learnerToPlace && createPortal(<WorkplacePlacementModal learner={learnerToPlace} onClose={() => setLearnerToPlace(null)} />, document.body)}

            <AILessonPlanModal
                isOpen={showAIModal || !!editingReport}
                onClose={() => { setShowAIModal(false); setEditingReport(null); }}
                onSave={handleSaveReport}
                onShowStatus={showStatusPopup}
                selectedTopics={selectedTopics}
                curriculumItems={activeProgramme ? curriculumItems : []}
                activeProgramme={activeProgramme}
                cohort={cohort}
                user={user}
                existingReport={editingReport}
            />

            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

            <main className="cdp-main">
                <header className="cdp-header">
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={handleBack}>
                            <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
                        </button>
                        <div className="cdp-header__eyebrow"><Users size={12} /> Cohort Overview</div>
                        <h1 className="cdp-header__title">{cohort.name}</h1>
                        <p className="cdp-header__sub">
                            <Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}
                            <span className={`cdp-header__status${cohort.isArchived ? ' cdp-header__status--archived' : ' cdp-header__status--active'}`}>{cohort.isArchived ? 'Archived' : 'Active Class'}</span>
                        </p>
                    </div>
                    <div className="cdp-header__right">
                        {(isAdmin || isFacilitator) && (
                            <div className="cdp-header__actions">
                                <button className="cdp-btn cdp-btn--outline" onClick={handleQCTOExport} disabled={isExporting}>
                                    {isExporting ? <Loader2 size={13} className="cdp-spinner" /> : <DownloadCloud size={13} />} Export LEISA
                                </button>
                                <button className="cdp-btn cdp-btn--outline" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
                                    {isSyncing ? <Loader2 size={13} className="cdp-spinner" /> : <RefreshCcw size={13} />} Sync Workbooks
                                </button>
                            </div>
                        )}
                        <NotificationBell />
                    </div>
                </header>

                <div className="cdp-content">
                    {/* 🚀 NEW: Dynamic Active Assessment Banners */}
                    {activeAssessmentsMap.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                            {activeAssessmentsMap.map((exam, idx) => (
                                <div key={idx} className="animate-fade-in" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ background: '#3b82f6', padding: '8px', borderRadius: '50%', boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)' }}>
                                            <Timer size={20} color="white" />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '1rem', fontWeight: 700 }}>
                                                {exam.title} <span style={{ fontSize: '0.7rem', color: '#ef4444', textTransform: 'uppercase', paddingLeft: '6px', animation: 'pulse 2s infinite' }}>● Live</span>
                                            </h3>
                                            <p style={{ margin: '4px 0 0 0', color: '#2563eb', fontSize: '0.85rem' }}>
                                                <strong>{exam.count}</strong> learner(s) currently writing: <span style={{ fontStyle: 'italic', opacity: 0.8 }}>{exam.learnerNames.join(', ')}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            className="cdp-btn"
                                            style={{ background: 'white', color: '#2563eb', border: '1px solid #bfdbfe' }}
                                            onClick={() => grantExtraTimeToExam(exam.subs, 15, exam.title)}
                                            disabled={isGrantingTime}
                                        >
                                            {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />} +15 Mins
                                        </button>
                                        <button
                                            className="cdp-btn"
                                            style={{ background: '#2563eb', color: 'white', border: '1px solid #2563eb' }}
                                            onClick={() => grantExtraTimeToExam(exam.subs, 30, exam.title)}
                                            disabled={isGrantingTime}
                                        >
                                            {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />} +30 Mins
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="cdp-stat-row">
                        <div className="cdp-stat-card cdp-stat-card--blue"><div className="cdp-stat-card__icon"><Users size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Learners</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--green"><div className="cdp-stat-card__icon"><Briefcase size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{placedCount}</span><span className="cdp-stat-card__label">Workplace Placements</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--amber"><div className="cdp-stat-card__icon"><Clock size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{pendingTotal}</span><span className="cdp-stat-card__label">Pending Marking</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--grey"><div className="cdp-stat-card__icon"><UserMinus size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Exited</span></div></div>
                    </div>

                    <div className="mlab-summary-card">
                        <div className="mlab-summary-item"><span className="mlab-summary-item__label"><Calendar size={12} /> Timeline</span><span className="mlab-summary-item__value">{cohort.startDate} — {cohort.endDate}</span></div>
                        <div className="mlab-summary-item"><span className="mlab-summary-item__label">Instructor / Facilitator</span><span className="mlab-summary-item__value">{facName}</span></div>
                        <div className="mlab-summary-item"><span className="mlab-summary-item__label">Assessor</span><span className="mlab-summary-item__value">{assName}</span></div>
                        <div className="mlab-summary-item"><span className="mlab-summary-item__label">Moderator</span><span className="mlab-summary-item__value">{modName}</span></div>
                    </div>

                    <div className="lfm-tabs" style={{ marginBottom: '1.5rem' }}>
                        <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}><Users size={16} /> Learner Roster</button>
                        <button className={`lfm-tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}><LayoutList size={16} /> Curriculum Tracker</button>
                        <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}><UserCheck size={16} /> Attendance Tracker</button>
                    </div>

                    {activeTab === 'learners' && (
                        <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
                            <div className="vp-card" style={{ marginBottom: 0 }}>
                                <div className="vp-card-header">
                                    <div className="vp-card-title-group">
                                        <Users size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>Enrolled Learners ({filteredLearners.length})</h3>
                                    </div>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '1rem',
                                    padding: '1rem 1.5rem',
                                    backgroundColor: '#f8fafc',
                                    borderBottom: '1px solid var(--mlab-border)',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
                                        <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search name, ID or email..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px 8px 36px',
                                                fontSize: '0.85rem',
                                                color: 'var(--mlab-midnight)',
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #cbd5e1',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status:</label>
                                            <select
                                                value={statusFilter}
                                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                                style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
                                            >
                                                <option value="all">All Applicants</option>
                                                <option value="active">Active Only</option>
                                                <option value="dropped">Withdrawn Only</option>
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Attendance:</label>
                                            <select
                                                value={attendanceFilter}
                                                onChange={(e) => setAttendanceFilter(e.target.value as any)}
                                                style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
                                            >
                                                <option value="all">All Attendance Bands</option>
                                                <option value="high">High Compliance (75%+)</option>
                                                <option value="mid">Average Compliance (40% - 74%)</option>
                                                <option value="low">Critical Risk (&lt; 40%)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="mlab-table-wrap">
                                    <table className="mlab-table">
                                        <thead>
                                            <tr>
                                                <th>Learner</th>
                                                <th>Workplace</th>
                                                <th>Module Progress</th>
                                                <th>Attendance</th>
                                                <th>Status</th>
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                        <p style={{ margin: 0, fontWeight: 500 }}>No applicants match your current query parameter thresholds.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLearners.map(learner => {
                                                    const isDropped = learner.status === 'dropped';
                                                    const routingId = learner.enrollmentId || learner.id;
                                                    const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
                                                    const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
                                                    const isPlaced = !!learner.employerId;

                                                    const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };

                                                    return (
                                                        <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
                                                            <td>
                                                                <div className="cdp-learner-cell">
                                                                    <div className="cdp-learner-avatar">{learner.fullName.charAt(0)}</div>
                                                                    <div className="cdp-learner-cell__info">
                                                                        <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`}>{learner.fullName}</span>
                                                                        <span className="cdp-learner-cell__id">{learner.idNumber}</span>
                                                                        {!isDropped && pendingCount > 0 && <span className="cdp-pending-chip"><Clock size={10} /> {pendingCount} marking pending</span>}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td>{isPlaced ? <span className="cdp-placement__employer">{employers.find(e => e.id === learner.employerId)?.name}</span> : <span className="cdp-placement--pending"><AlertCircle size={12} /> Pending</span>}</td>
                                                            <td>
                                                                <div className="cdp-chips">
                                                                    <ModuleChip label="K" count={learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length} variant="k" />
                                                                    <ModuleChip label="P" count={learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length} variant="p" />
                                                                    <ModuleChip label="W" count={learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length} variant="w" />
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    <span style={{
                                                                        display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.025em',
                                                                        background: stats.pct >= 75 ? '#dcfce7' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
                                                                        color: stats.pct >= 75 ? '#166534' : stats.pct >= 40 ? '#b45309' : '#991b1b',
                                                                        border: stats.pct >= 75 ? '1px solid #bbf7d0' : stats.pct >= 40 ? '1px solid #fde68a' : '1px solid #fca5a5',
                                                                        borderRadius: '4px'
                                                                    }}>
                                                                        {stats.pct}%
                                                                    </span>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
                                                                        {stats.attended} / {stats.total}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td><span className={`cdp-status-badge${isDropped ? ' cdp-status-badge--dropped' : ' cdp-status-badge--active'}`}>{isDropped ? 'Dropped' : 'Active'}</span></td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div className="cdp-actions" style={{ justifyContent: 'flex-end', display: 'flex' }}>
                                                                    {isAdmin && <button className={`mlab-btn mlab-btn--sm ${isPlaced ? 'mlab-btn--ghost' : 'mlab-btn--primary'}`} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
                                                                    <button className="mlab-btn mlab-btn--sm mlab-btn--ghost" onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>
                                                                    {isAdmin && !isDropped && <button className="mlab-btn mlab-btn--sm mlab-btn--error" onClick={() => handleDropLearner(learner.id, learner.fullName)}><UserMinus size={12} /></button>}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'curriculum' && (
                        <div className="animate-fade-in" style={{ paddingBottom: selectedTopicCount > 0 ? '80px' : '0' }}>
                            {activeProgramme && (
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                    {renderProgressCard('Knowledge Modules', moduleProgress.Knowledge, '#f59e0b', '#fef3c7')}
                                    {renderProgressCard('Practical Modules', moduleProgress.Practical, '#0ea5e9', '#e0f2fe')}
                                    {renderProgressCard('Workplace Modules', moduleProgress.Workplace, '#10b981', '#dcfce7')}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                                <div style={{ background: 'white', display: 'inline-flex', padding: '4px', borderRadius: '8px', border: '1px solid var(--mlab-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                    <button onClick={() => setCurriculumViewMode('blueprint')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: curriculumViewMode === 'blueprint' ? 'var(--mlab-blue)' : 'transparent', color: curriculumViewMode === 'blueprint' ? 'white' : 'var(--mlab-grey)' }}><CheckSquare size={14} /> Log New Topics</button>
                                    <button onClick={() => setCurriculumViewMode('history')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: curriculumViewMode === 'history' ? 'var(--mlab-blue)' : 'transparent', color: curriculumViewMode === 'history' ? 'white' : 'var(--mlab-grey)' }}><Clock size={14} /> View Past Sessions</button>
                                </div>
                            </div>

                            <div style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                <div className="lfm-header"><h2 className="lfm-header__title" style={{ color: 'white' }}><BookOpen size={18} /> {curriculumViewMode === 'blueprint' ? 'Curriculum Blueprint Tracker' : 'Past Session Reports & Traceability'}</h2></div>
                                <div className="lfm-body" style={{ background: curriculumViewMode === 'blueprint' ? 'white' : 'var(--mlab-bg)', border: '2px solid var(--mlab-blue)', borderTop: 'none', padding: '1.5rem', borderRadius: '0 0 8px 8px' }}>
                                    {!activeProgramme ? (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p>No formal Qualification Blueprint is linked to this cohort.</p></div>
                                    ) : (
                                        <>
                                            {curriculumViewMode === 'blueprint' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                    {Object.keys(groupedCurriculum).map(modCode => {
                                                        const group = groupedCurriculum[modCode];
                                                        const isOpen = expandedModules.has(modCode);
                                                        const totalItems = group.items.length;
                                                        const loggedItems = group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
                                                        const isComplete = loggedItems === totalItems && totalItems > 0;

                                                        return (
                                                            <div key={modCode}>
                                                                <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: isComplete ? 'var(--mlab-green)' : 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleModuleAccordion(modCode)}>
                                                                    <Layers size={16} color={isComplete ? "var(--mlab-green)" : "var(--mlab-blue)"} />
                                                                    <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{group.moduleName}</span></span>
                                                                    <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', letterSpacing: '0.1em', fontWeight: 700, background: isComplete ? 'var(--mlab-green-bg)' : 'transparent', padding: '2px 8px', borderRadius: '4px' }}>{loggedItems} / {totalItems} COVERED</span>
                                                                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                </div>
                                                                {isOpen && (
                                                                    <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid var(--mlab-blue)', padding: 0, marginTop: '-0.75rem' }}>
                                                                        <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                                                                            <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                                                                                <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                                                    <tr>
                                                                                        <th style={{ width: '50px', color: 'grey', textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>Log</th>
                                                                                        <th style={{ color: 'grey' }}>Topic / Activity</th>
                                                                                        <th style={{ width: '280px', color: 'grey' }}>Status / Session Report</th>
                                                                                        <th style={{ width: '180px', color: 'grey' }}>Engagement</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {group.items.map(item => {
                                                                                        const logRecord = curriculumLogs.find(log => log.topicId === item.id);
                                                                                        const isLogged = !!logRecord;
                                                                                        const isSelected = selectedTopics.hasOwnProperty(item.id);
                                                                                        const ackPct = activeCount > 0 ? Math.round(((logRecord?.acknowledgedBy?.length || 0) / activeCount) * 100) : 0;
                                                                                        const associatedReport = isLogged ? sessionReports.find(r => r.id === logRecord.sessionReportId) : null;

                                                                                        return (
                                                                                            <tr key={item.id} style={{ background: isLogged ? '#f0fdf4' : (isSelected ? '#eff6ff' : 'white') }}>
                                                                                                <td style={{ textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>
                                                                                                    {isLogged ? <CheckCircle size={18} color="var(--mlab-green)" style={{ margin: '0 auto' }} /> : <input type="checkbox" checked={isSelected} onChange={() => toggleTopicSelection(item.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }} />}
                                                                                                </td>
                                                                                                <td>
                                                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                                        <span style={{ fontWeight: 600, color: isLogged ? '#166534' : 'var(--mlab-midnight)', fontSize: '0.85rem' }}>{item.code ? `${item.code}: ` : ''}{item.title}</span>
                                                                                                        <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>{item.moduleType}</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td>
                                                                                                    {isLogged ? (
                                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                                            <span style={{ display: 'inline-block', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Covered {new Date(logRecord.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
                                                                                                            {associatedReport && <button onClick={() => setEditingReport(associatedReport)} style={{ background: 'transparent', border: '1px solid #86efac', color: '#15803d', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}><Edit3 size={12} /> Edit Report</button>}
                                                                                                        </div>
                                                                                                    ) : isSelected ? (
                                                                                                        <input type="date" className="lfm-input" value={selectedTopics[item.id]} max={new Date().toISOString().split('T')[0]} onChange={(e) => handleIndividualDateChange(item.id, e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', height: '28px' }} />
                                                                                                    ) : <span style={{ display: 'inline-block', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending</span>}
                                                                                                </td>
                                                                                                <td>
                                                                                                    {isLogged ? (
                                                                                                        <div className="cdp-progress-col" style={{ width: '100%' }}>
                                                                                                            <div className="cdp-progress-text"><span style={{ fontFamily: 'var(--font-heading)', color: 'grey' }}>{logRecord?.acknowledgedBy?.length || 0} / {activeCount} ACKD </span><span style={{ fontWeight: 'bold', color: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : '#ef4444') }}>{ackPct}%</span></div>
                                                                                                            <div className="cdp-progress-track" style={{ height: '4px', borderRadius: '0' }}><div className="cdp-progress-fill" style={{ width: `${ackPct}%`, background: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : '#ef4444'), borderRadius: '0' }} /></div>
                                                                                                        </div>
                                                                                                    ) : <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-light)' }}>—</span>}
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                    }
                                                </div>
                                            )}

                                            {curriculumViewMode === 'history' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                    {curriculumLogs.length === 0 ? (
                                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p>No topics have been logged for this cohort yet.</p></div>
                                                    ) : (
                                                        Object.keys(groupedHistoryLogs).sort().map(modCode => {
                                                            const logsInModule = groupedHistoryLogs[modCode];
                                                            const isOpen = expandedHistoryModules.has(modCode);
                                                            const moduleName = groupedCurriculum[modCode]?.moduleName || '';

                                                            return (
                                                                <div key={`hist-${modCode}`}>
                                                                    <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleHistoryAccordion(modCode)}>
                                                                        <Layers size={16} color="var(--mlab-blue)" />
                                                                        <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{moduleName}</span></span>
                                                                        <span style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', letterSpacing: '0.1em', fontWeight: 700, background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>{logsInModule.length} TOPIC{logsInModule.length !== 1 ? 's' : ''} LOGGED</span>
                                                                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                    </div>
                                                                    {isOpen && (
                                                                        <div className="animate-fade-in" style={{ borderTop: '2px solid var(--mlab-blue)', paddingTop: '15px', marginTop: '-0.75rem' }}>
                                                                            {logsInModule.map(log => {
                                                                                const mappedLog = { id: log.id, title: log.topicTitle, moduleCode: log.moduleCode, dateLogged: log.coveredAt || log.dateLogged, notes: log.systemNote || "Session details available in full report.", presentLearnerIds: log.presentLearnerIds, absentLearnerIds: log.absentLearnerIds, acknowledgedBy: log.acknowledgedBy };
                                                                                return <CurriculumTraceabilityCard key={log.id} log={mappedLog} roster={enrolledLearners} />;
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {selectedTopicCount > 0 && createPortal(
                                <div className="animate-slide-up" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--mlab-blue)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px)', borderTop: '3px solid var(--mlab-green)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 9999, boxShadow: '0 -10px 20px rgba(0,0,0,0.15)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '50%', display: 'flex' }}><CheckCircle size={24} color="var(--mlab-green)" /></div>
                                        <div style={{ display: 'flex', flex: 'none', flexDirection: 'column' }}>
                                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedTopicCount} Topic{selectedTopicCount !== 1 ? 's' : ''} Selected</span>
                                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Learners will have 48 hours to acknowledge.</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <label style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Batch Date:</label>
                                            <input type="date" className="lfm-input" value={globalCoveredDate} max={new Date().toISOString().split('T')[0]} onChange={handleGlobalDateChange} style={{ width: '130px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem', background: 'var(--mlab-white)', color: 'var(--mlab-blue)' }} />
                                        </div>
                                        <button className="lfm-btn" onClick={() => setSelectedTopics({})} style={{ background: 'transparent', color: 'white', border: '2px solid rgba(255,255,255,0.3)' }}>Cancel</button>
                                        <button className="lfm-btn" onClick={() => setShowAIModal(true)} disabled={isLogging} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-green)' }}>
                                            {isLogging ? <Loader2 size={16} className="lfm-spin" /> : <Sparkles size={16} />} Generate Session Report
                                        </button>
                                    </div>
                                </div>,
                                document.body
                            )}
                        </div>
                    )}

                    {/* 🚀 ATTENDANCE TRACKER TAB */}
                    {activeTab === 'attendance' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="vp-card" style={{ marginBottom: '2rem' }}>
                                <div className="vp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div className="vp-card-title-group">
                                        <Calendar size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                            Historical Session Ledger
                                        </h3>
                                    </div>

                                    {/* 🚀 Multi-Date Filter UI */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid var(--mlab-border)', padding: '6px 12px', borderRadius: '8px' }}>
                                            <Calendar size={16} color="var(--mlab-grey)" />
                                            <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>Filter Dates:</span>
                                            <input
                                                type="date"
                                                onChange={handleAddLedgerDate}
                                                style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.85rem', cursor: 'pointer' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 🚀 Selected Date Chips */}
                                {ledgerDates.length > 0 && (
                                    <div style={{ padding: '0.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
                                        {ledgerDates.map(date => (
                                            <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#e0f2fe', color: '#0284c7', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeLedgerDate(date)} />
                                            </span>
                                        ))}
                                        <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <XCircle size={12} /> Clear All
                                        </button>
                                    </div>
                                )}

                                <div className="mlab-table-wrap">
                                    {filteredDailyRegisters.length === 0 ? (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                            <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                            <p>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance registers have been finalized for this cohort yet.'}</p>
                                        </div>
                                    ) : (
                                        <table className="mlab-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Session Date</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Total Enrolled</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Present</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Absent</th>
                                                    <th style={{ textAlign: 'right', color: 'var(--mlab-midnight)' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredDailyRegisters.map((reg) => {
                                                    const presentCount = reg.presentLearners?.length || 0;
                                                    const absentCount = reg.absentLearners?.length || 0;
                                                    const totalCaptured = presentCount + absentCount;

                                                    return (
                                                        <tr key={reg.id}>
                                                            <td style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                                {new Date(reg.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </td>
                                                            <td style={{ color: 'var(--mlab-midnight)' }}>{totalCaptured} Learners</td>
                                                            <td>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#dcfce7', color: '#166534', fontSize: '0.8rem', fontWeight: 600, borderRadius: '4px' }}>
                                                                    <CheckCircle2 size={12} /> {presentCount}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600, borderRadius: '4px' }}>
                                                                    <XCircle size={12} /> {absentCount}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <button
                                                                    className="mlab-btn mlab-btn--sm mlab-btn--ghost"
                                                                    onClick={() => navigate(`/facilitator/attendance/${cohort.id}?date=${reg.date}`)}
                                                                >
                                                                    <FolderOpen size={12} /> View Register
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};



// import React, { useEffect, useState, useMemo, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { createPortal } from 'react-dom';
// import {
//     Users, Calendar, Clock, Loader2, RefreshCcw, DownloadCloud,
//     Briefcase, FolderOpen, UserMinus, AlertCircle, ChevronLeft,
//     CheckCircle, BookOpen, Building2, Award, Timer, Layers, LayoutList,
//     ChevronDown, ChevronUp, Sparkles, Link as LinkIcon, Plus, Trash2, Edit3, X, PenTool,
//     FileText, CheckSquare
// } from 'lucide-react';
// import { writeBatch, doc, collection, query, where, getDocs, increment, onSnapshot, updateDoc } from 'firebase/firestore';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import * as XLSX from 'xlsx';
// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';

// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// import { WorkplacePlacementModal } from '../../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// import { CurriculumTraceabilityCard } from '../../../components/admin/facilitator/CurriculumTraceabilityCard';
// import type { DashboardLearner } from '../../../types';

// const quillModules = {
//     toolbar: [
//         [{ 'header': [1, 2, 3, 4, false] }],
//         ['bold', 'italic', 'underline', 'strike'],
//         [{ 'list': 'ordered' }, { 'list': 'bullet' }],
//         [{ 'table': true }],
//         ['blockquote', 'code-block'],
//         [{ 'color': [] }, { 'background': [] }],
//         [{ 'font': [] }],
//         ['clean']
//     ],
//     table: true
// };

// const formatQCTODate = (d?: string) => {
//     if (!d) return '';
//     const dt = new Date(d);
//     if (isNaN(dt.getTime())) return '';
//     return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
// };

// const getDOBFromID = (id: string) => {
//     const clean = String(id || '').replace(/\s/g, '');
//     if (clean.length !== 13) return '';
//     try {
//         let y = parseInt(clean.substring(0, 2), 10);
//         const m = clean.substring(2, 4), d2 = clean.substring(4, 6);
//         y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
//         return `${y}${m}${d2}`;
//     } catch { return ''; }
// };

// const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });

// const ModuleChip: React.FC<{ label: string; count: number; variant: 'k' | 'p' | 'w' }> = ({ label, count, variant }) => (
//     <span className={`cdp-chip cdp-chip--${variant}`}>{label}: {count}</span>
// );

// const AILessonPlanModal: React.FC<any> = ({ isOpen, onClose, onSave, onShowStatus, selectedTopics, curriculumItems, activeProgramme, cohort, user, existingReport }) => {
//     const [isGenerating, setIsGenerating] = useState(true);
//     const [isEnhancing, setIsEnhancing] = useState(false);
//     const [planHtml, setPlanHtml] = useState('');
//     const [evidenceItems, setEvidenceItems] = useState<{ url: string, description: string }[]>([{ url: '', description: '' }]);
//     const [loadingStep, setLoadingStep] = useState(0);
//     const loadingMessages = [
//         "Initializing OpenAI GPT-4o engine...", "Analyzing QCTO Programme & NQF Levels...", "Structuring learning outcomes...", "Drafting compliant evidence strategies...", "Finalizing professional session report..."
//     ];
//     const quillRef = useRef<ReactQuill>(null);
//     const hasGeneratedRef = useRef(false);

//     useEffect(() => {
//         if (!isGenerating) return;
//         const interval = setInterval(() => setLoadingStep(prev => (prev < loadingMessages.length - 1 ? prev + 1 : prev)), 1500);
//         return () => clearInterval(interval);
//     }, [isGenerating, loadingMessages.length]);

//     useEffect(() => {
//         if (!isOpen) { hasGeneratedRef.current = false; setLoadingStep(0); return; }
//         if (existingReport) {
//             setPlanHtml(existingReport.reportHtml || '');
//             setEvidenceItems(existingReport.evidenceLinks?.length ? existingReport.evidenceLinks : [{ url: '', description: '' }]);
//             setIsGenerating(false);
//             hasGeneratedRef.current = true;
//         } else {
//             if (!hasGeneratedRef.current) {
//                 hasGeneratedRef.current = true;
//                 const generateFromAI = async () => {
//                     setIsGenerating(true);
//                     setLoadingStep(0);
//                     const selectedDefs = Object.keys(selectedTopics).map(id => curriculumItems.find((i: any) => i.id === id)).filter(Boolean);
//                     const moduleNames = Array.from(new Set(selectedDefs.map(d => d.moduleName))).join(', ');
//                     const topicList = selectedDefs.map(d => `<li style="color: #000000;">${d.code ? `${d.code}: ` : ''}${d.title}</li>`).join('');

//                     try {
//                         const functions = getFunctions();
//                         const draftSessionReport = httpsCallable(functions, 'draftSessionReport');
//                         const response = await draftSessionReport({
//                             topics: selectedDefs, moduleNames, programmeName: activeProgramme?.name || cohort?.name,
//                             nqfLevel: activeProgramme?.nqfLevel || 'N/A', saqaId: activeProgramme?.saqaId || 'N/A',
//                             qctoId: activeProgramme?.qctoId || activeProgramme?.curriculumCode || 'N/A', credits: activeProgramme?.credits || 'N/A',
//                             facilitatorName: user?.fullName, preferences: user?.preferences ? `Teaching style: ${user.preferences.teachingStyle}` : null
//                         });

//                         const data = response.data as any;
//                         if (data.success && data.html) {
//                             let finalHtml = data.html;
//                             if (user?.signatureUrl) finalHtml = finalHtml.replace(`<strong>Delivered By:</strong> ${user?.fullName}</p>`, `<strong>Delivered By:</strong> ${user?.fullName}</p><img src="${user.signatureUrl}" style="max-height: 50px; display: block; margin: 10px 0;" alt="Digital Signature" />`);
//                             setPlanHtml(finalHtml);
//                             onShowStatus('success', 'AI Generation Complete', 'OpenAI has drafted your lesson plan.');
//                         } else throw new Error("Invalid HTML returned from AI");
//                     } catch (error: any) {
//                         onShowStatus('warning', 'AI Temporarily Unavailable', "OpenAI service busy. Loaded standard template instead.");
//                         setPlanHtml(`<h3>1. Programme Information</h3><p><strong>Programme:</strong> ${activeProgramme?.name || cohort?.name}</p><p><strong>SAQA ID:</strong> ${activeProgramme?.saqaId || 'N/A'}</p><ul>${topicList}</ul><hr/><p><strong>Delivered By:</strong> ${user?.fullName}</p>${user?.signatureUrl ? `<img src="${user.signatureUrl}" style="max-height: 50px;"/>` : ''}`);
//                     } finally {
//                         setIsGenerating(false);
//                     }
//                 };
//                 generateFromAI();
//             }
//         }
//     }, [isOpen, existingReport, selectedTopics, curriculumItems, activeProgramme, cohort, user, onShowStatus]);

//     const handleEnhanceText = async () => {
//         const editor = quillRef.current?.getEditor();
//         if (!editor) return;
//         const range = editor.getSelection();
//         if (!range || range.length === 0) return onShowStatus('info', 'No Text Selected', 'Highlight specific text to enhance.');

//         setIsEnhancing(true);
//         try {
//             const functions = getFunctions();
//             const enhanceTextFn = httpsCallable(functions, 'enhanceText');
//             const response = await enhanceTextFn({ text: editor.getText(range.index, range.length) });
//             const data = response.data as any;
//             if (data.success && data.text) {
//                 editor.deleteText(range.index, range.length);
//                 editor.insertText(range.index, data.text);
//                 setPlanHtml(editor.root.innerHTML);
//             }
//         } catch (error) {
//             onShowStatus('error', 'Enhancement Failed', 'The AI service is currently busy.');
//         } finally {
//             setIsEnhancing(false);
//         }
//     };

//     if (!isOpen) return null;

//     return createPortal(
//         <div className="lfm-overlay" style={{ zIndex: 99999 }}>
//             <div className="lfm-modal" style={{ maxWidth: '1000px', height: '90vh' }}>
//                 <div className="lfm-header" style={{ background: 'var(--mlab-blue)' }}>
//                     <h2 className="lfm-header__title" style={{ color: 'white' }}>
//                         {existingReport ? <Edit3 size={18} color="var(--mlab-green)" /> : <Sparkles size={18} color="var(--mlab-green)" />}
//                         {existingReport ? 'Edit Session Report' : 'Smart Session Report'}
//                     </h2>
//                     <button className="lfm-close-btn" onClick={onClose}><X size={20} style={{ color: 'white' }} /></button>
//                 </div>

//                 <div className="lfm-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#f8fafc', padding: 0 }}>
//                     {isGenerating ? (
//                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '450px', color: 'var(--mlab-blue)' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', background: 'rgba(148, 199, 61, 0.1)', borderRadius: '50%', marginBottom: '1.5rem' }}>
//                                 <Sparkles size={40} color="var(--mlab-green)" />
//                             </div>
//                             <h3 style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--mlab-midnight)' }}>Crafting Lesson Plan...</h3>
//                         </div>
//                     ) : (
//                         <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
//                             <div style={{ flex: 2, padding: '1.5rem', borderRight: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column' }}>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
//                                     <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', borderLeft: '4px solid #0ea5e9', padding: '8px 12px', borderRadius: '4px', fontSize: '0.8rem', color: '#0369a1', flex: 1, marginRight: '1rem' }}>
//                                         {!existingReport ? <strong>Automated QCTO Compliance:</strong> : <strong>Edit Mode:</strong>} Review and tweak your content below.
//                                     </div>
//                                     <button onClick={handleEnhanceText} disabled={isEnhancing} className="lfm-btn" style={{ background: '#fdf4ff', color: '#c026d3', border: '1px solid #f0abfc', borderRadius: '4px', padding: '6px 12px', fontSize: '0.75rem', cursor: isEnhancing ? 'not-allowed' : 'pointer' }}>
//                                         {isEnhancing ? <Loader2 size={14} className="lfm-spin" /> : <Sparkles size={14} />} Enhance Highlighted Text
//                                     </button>
//                                 </div>
//                                 <div style={{ background: 'white', color: '#000000', border: '1px solid var(--mlab-border)', borderRadius: '8px', flex: 1, display: 'flex', flexDirection: 'column' }}>
//                                     <ReactQuill ref={quillRef} theme="snow" value={planHtml} onChange={setPlanHtml} modules={quillModules} style={{ height: '350px', display: 'flex', flexDirection: 'column' }} />
//                                 </div>
//                             </div>

//                             <div style={{ flex: 1, padding: '1.5rem', background: 'white', overflowY: 'auto', borderLeft: '1px solid var(--mlab-border)' }}>
//                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem', borderLeft: '4px solid var(--mlab-green)' }}>
//                                     <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: '#166534', textTransform: 'uppercase', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}><PenTool size={16} /> Digital Authentication</h4>
//                                     {user?.signatureUrl ? (
//                                         <div style={{ background: 'white', padding: '12px', borderRadius: '4px', border: '1px dashed #bbf7d0', textAlign: 'center' }}>
//                                             <img src={user.signatureUrl} alt="Signature" style={{ maxHeight: '60px', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
//                                             <div style={{ fontSize: '0.65rem', color: '#166534', marginTop: '6px', fontWeight: 'bold' }}>VERIFIED SIGNATURE ATTACHED</div>
//                                         </div>
//                                     ) : (
//                                         <div style={{ background: 'white', padding: '12px', borderRadius: '4px', border: '1px dashed #fca5a5', textAlign: 'center' }}>
//                                             <div style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 600 }}>No signature found</div>
//                                         </div>
//                                     )}
//                                 </div>

//                                 <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 1rem' }}><LinkIcon size={16} style={{ display: 'inline', marginRight: '6px' }} /> Session Evidence</h3>
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                                     {evidenceItems.map((item, idx) => (
//                                         <div key={idx} style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px', borderRadius: '6px' }}>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
//                                                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--mlab-grey)' }}>Item {idx + 1}</span>
//                                                 {evidenceItems.length > 1 && <button onClick={() => setEvidenceItems(p => p.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}><Trash2 size={14} /></button>}
//                                             </div>
//                                             <input type="url" className="lfm-input" placeholder="https://..." value={item.url} onChange={e => { const n = [...evidenceItems]; n[idx].url = e.target.value; setEvidenceItems(n); }} style={{ marginBottom: '8px', fontSize: '0.8rem', padding: '6px' }} />
//                                             <input type="text" className="lfm-input" placeholder="Description (e.g. Code Repository)" value={item.description} onChange={e => { const n = [...evidenceItems]; n[idx].description = e.target.value; setEvidenceItems(n); }} style={{ fontSize: '0.8rem', padding: '6px' }} />
//                                         </div>
//                                     ))}
//                                     <button onClick={() => setEvidenceItems(p => [...p, { url: '', description: '' }])} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'center', padding: '8px', fontSize: '0.8rem' }}><Plus size={14} /> Add Another Link</button>
//                                 </div>
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 <div className="lfm-footer" style={{ background: 'var(--mlab-bg)' }}>
//                     <button className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isGenerating || isEnhancing}>Cancel</button>
//                     <button className="lfm-btn lfm-btn--primary" onClick={() => onSave(planHtml, evidenceItems.filter(e => e.url), !!existingReport, existingReport?.id)} disabled={isGenerating || isEnhancing}>
//                         <CheckCircle size={16} /> {existingReport ? 'Update Session Report' : 'Save Log & Publish Topics'}
//                     </button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };



// // export const QCTOCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
// //     const navigate = useNavigate();
// //     const toast = useToast();

// //     const { user, learners, staff, employers, settings, programmes, enrollments } = useStore();

// //     const [activeTab, setActiveTab] = useState<'learners' | 'curriculum'>('learners');
// //     const [curriculumViewMode, setCurriculumViewMode] = useState<'blueprint' | 'history'>('blueprint');

// //     const [isSyncing, setIsSyncing] = useState(false);
// //     const [isExporting, setIsExporting] = useState(false);
// //     const [isGrantingTime, setIsGrantingTime] = useState(false);
// //     const [isLogging, setIsLogging] = useState(false);
// //     const [showAIModal, setShowAIModal] = useState(false);

// //     const [submissions, setSubmissions] = useState<any[]>([]);
// //     const [curriculumLogs, setCurriculumLogs] = useState<any[]>([]);
// //     const [sessionReports, setSessionReports] = useState<any[]>([]);
// //     const [editingReport, setEditingReport] = useState<any | null>(null);

// //     const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
// //     const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
// //     const [globalCoveredDate, setGlobalCoveredDate] = useState<string>(new Date().toISOString().split('T')[0]);
// //     const [expandedHistoryModules, setExpandedHistoryModules] = useState<Set<string>>(new Set());

// //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'info', title: '', message: '' });
// //     const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

// //     const showStatusPopup = (type: StatusType, title: string, message: string) => { setModalConfig({ isOpen: true, type, title, message }); };

// //     const isAdmin = user?.role === 'admin';
// //     const isFacilitator = user?.role === 'facilitator';

// //     // TS Safe Navigation function
// //     const handleBack = () => {
// //         if (isAdmin) {
// //             navigate('/admin', { state: { activeTab: 'cohorts' } });
// //         } else {
// //             navigate(-1);
// //         }
// //     };

// //     const activeProgramme = useMemo(() => {
// //         if (!cohort || !programmes.length) return null;
// //         const templateId = String(cohort.programmeId || cohort.qualificationId || '').trim();
// //         if (!templateId) return null;
// //         return programmes.find(p => p.id === templateId || (p as any).saqaId === templateId || (p as any).curriculumCode === templateId) || null;
// //     }, [cohort, programmes]);

// //     const groupedCurriculum = useMemo(() => {
// //         if (!activeProgramme) return {};
// //         const groups: Record<string, { moduleName: string, moduleType: string, items: any[] }> = {};
// //         const extractItems = (modules: any[], type: string) => {
// //             (modules || []).forEach(mod => {
// //                 const subElements = mod.topics || mod.practicalSkills || mod.workActivities || [];
// //                 const modCode = mod.code || 'General';
// //                 if (!groups[modCode]) groups[modCode] = { moduleName: mod.name || 'Unnamed Module', moduleType: type, items: [] };
// //                 subElements.forEach((sub: any) => groups[modCode].items.push({ id: sub.id || sub.code || Math.random().toString(36).substring(7), code: sub.code || '', title: sub.title || sub.name || sub.description || 'Unnamed Item', moduleCode: modCode, moduleName: mod.name || '', moduleType: type, weight: sub.weight || sub.percentage || '' }));
// //             });
// //         };
// //         extractItems(activeProgramme.knowledgeModules, 'Knowledge');
// //         extractItems(activeProgramme.practicalModules, 'Practical');
// //         extractItems(activeProgramme.workExperienceModules, 'Workplace');
// //         return groups;
// //     }, [activeProgramme]);

// //     const curriculumItems = useMemo(() => Object.values(groupedCurriculum).flatMap(g => g.items), [groupedCurriculum]);

// //     const groupedHistoryLogs = useMemo(() => {
// //         const groups: Record<string, any[]> = {};
// //         curriculumLogs.forEach(log => {
// //             const modCode = log.moduleCode || 'Uncategorized';
// //             if (!groups[modCode]) groups[modCode] = [];
// //             groups[modCode].push(log);
// //         });
// //         return groups;
// //     }, [curriculumLogs]);

// //     const moduleProgress = useMemo(() => {
// //         const stats = { Knowledge: { total: 0, logged: 0 }, Practical: { total: 0, logged: 0 }, Workplace: { total: 0, logged: 0 } };
// //         Object.values(groupedCurriculum).forEach(group => {
// //             const type = group.moduleType as 'Knowledge' | 'Practical' | 'Workplace';
// //             if (stats[type]) {
// //                 stats[type].total += group.items.length;
// //                 stats[type].logged += group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
// //             }
// //         });
// //         return stats;
// //     }, [groupedCurriculum, curriculumLogs]);

// //     const enrolledLearners = useMemo(() => {
// //         const cohortEnrollments = enrollments.filter(e => e.cohortId === cohort.id);
// //         const merged: DashboardLearner[] = [];
// //         cohortEnrollments.forEach(enrollment => {
// //             const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
// //             if (profile?.fullName && profile?.idNumber) merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
// //         });
// //         learners.forEach(profile => {
// //             if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
// //                 merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
// //             }
// //         });
// //         return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
// //     }, [learners, enrollments, cohort.id]);

// //     const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;

// //     const fetchSubmissions = async () => {
// //         try {
// //             const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id)));
// //             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //         } catch (e) { console.error('Error fetching submissions:', e); }
// //     };

// //     useEffect(() => {
// //         fetchSubmissions();
// //         const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', '==', cohort.id));
// //         const unsubLogs = onSnapshot(logsQ, (snap) => setCurriculumLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
// //         const reportsQ = query(collection(db, 'session_reports'), where('cohortId', '==', cohort.id));
// //         const unsubReports = onSnapshot(reportsQ, (snap) => {
// //             const reps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
// //             reps.sort((a, b) => new Date(b.dateLogged).getTime() - new Date(a.dateLogged).getTime());
// //             setSessionReports(reps);
// //         });
// //         return () => { unsubLogs(); unsubReports(); };
// //     }, [cohort.id]);

// //     const toggleModuleAccordion = (moduleCode: string) => { setExpandedModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
// //     const toggleHistoryAccordion = (moduleCode: string) => { setExpandedHistoryModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
// //     const toggleTopicSelection = (topicId: string) => { setSelectedTopics(prev => { const next = { ...prev }; next[topicId] ? delete next[topicId] : next[topicId] = globalCoveredDate; return next; }); };
// //     const handleIndividualDateChange = (topicId: string, newDate: string) => { setSelectedTopics(prev => ({ ...prev, [topicId]: newDate })); };
// //     const handleGlobalDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newDate = e.target.value; setGlobalCoveredDate(newDate); setSelectedTopics(prev => { const next = { ...prev }; Object.keys(next).forEach(key => { next[key] = newDate; }); return next; }); };

// //     const handleSaveReport = async (planHtml: string, evidenceLinks: any[], isEdit: boolean, reportId?: string) => {
// //         if (isEdit && reportId) {
// //             setIsLogging(true);
// //             try {
// //                 await updateDoc(doc(db, 'session_reports', reportId), { reportHtml: planHtml, evidenceLinks, lastEditedAt: new Date().toISOString(), lastEditedBy: user?.uid });
// //                 toast.success("Session report updated successfully.");
// //                 setShowAIModal(false);
// //                 setEditingReport(null);
// //             } catch (error) { toast.error("Failed to update report."); } finally { setIsLogging(false); }
// //         } else {
// //             const selectedTopicIds = Object.keys(selectedTopics);
// //             if (selectedTopicIds.length === 0) return;
// //             setShowAIModal(false);
// //             setIsLogging(true);
// //             try {
// //                 const batch = writeBatch(db);
// //                 const now = new Date();
// //                 const reportRef = doc(collection(db, 'session_reports'));
// //                 batch.set(reportRef, { cohortId: cohort.id, facilitatorId: user?.uid, facilitatorName: user?.fullName, dateLogged: now.toISOString(), reportHtml: planHtml, evidenceLinks, topicsCovered: selectedTopicIds });

// //                 selectedTopicIds.forEach(topicId => {
// //                     const itemDef = curriculumItems.find(i => i.id === topicId);
// //                     if (!itemDef) return;
// //                     batch.set(doc(collection(db, 'curriculum_logs')), {
// //                         cohortId: cohort.id, topicId: itemDef.id, topicCode: itemDef.code, topicTitle: itemDef.title, moduleCode: itemDef.moduleCode, moduleName: itemDef.moduleName, moduleType: itemDef.moduleType, coveredAt: selectedTopics[topicId], loggedAt: now.toISOString(), deadlineAt: new Date(now.getTime() + (48 * 60 * 60 * 1000)).toISOString(), loggedBy: user?.uid, loggedByName: user?.fullName, sessionReportId: reportRef.id, acknowledgedBy: [], penalizeLearners: []
// //                     });
// //                 });

// //                 await batch.commit();
// //                 setSelectedTopics({});
// //                 showStatusPopup('success', 'Topics Logged & Published', `Session Report saved and ${selectedTopicIds.length} topics published to Learners.`);
// //             } catch (error) { showStatusPopup('error', 'Publish Failed', 'Failed to publish topics. Please check your connection and try again.'); } finally { setIsLogging(false); }
// //         }
// //     };

// //     const activeExams = useMemo(() => submissions.filter(s => s.status === 'in_progress'), [submissions]);

// //     const grantExtraTimeToCohort = async (minutes: number) => {
// //         if (activeExams.length === 0) return;
// //         if (!window.confirm(`Are you sure you want to add ${minutes} minutes to the clock for all ${activeExams.length} active exam sessions?`)) return;
// //         setIsGrantingTime(true);
// //         try {
// //             const batch = writeBatch(db);
// //             activeExams.forEach(sub => batch.update(doc(db, 'learner_submissions', sub.id), { extraTimeGranted: increment(minutes), lastStaffEditAt: new Date().toISOString() }));
// //             await batch.commit();
// //             toast.success(`Successfully granted +${minutes} minutes!`);
// //             await fetchSubmissions();
// //         } catch (error) { toast.error("Failed to grant extra time."); } finally { setIsGrantingTime(false); }
// //     };

// //     const handleQCTOExport = async () => {
// //         if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
// //         setIsExporting(true);
// //         try {
// //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
// //             const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
// //             const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
// //             const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
// //             const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId || (p as any).curriculumCode === targetProgId);
// //             const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
// //             const todayQCTO = formatQCTODate(new Date().toISOString());

// //             const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

// //             const dataRows = [headers.map(createTextCell)];
// //             enrolledLearners.forEach(learner => {
// //                 const d = learner.demographics || {};
// //                 const names = (learner.fullName || '').trim().split(' ');
// //                 const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
// //                 dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', names.length > 1 ? names.pop() : '', names.join(' '), d.learnerMiddleName || '', d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr'), getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || formatQCTODate(cohort.endDate), d.statementOfResultsStatus || '02', (d.statementOfResultsStatus === '01') ? cleanDate(d.statementOfResultsIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || '1', d.flc || '06', String(d.flcStatementOfResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
// //             });

// //             const wb = XLSX.utils.book_new();
// //             const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Institution:", mainInstitutionName], ["Qualification:", String(qualObj?.name || 'Qualification Name Missing')], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
// //             XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
// //             XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
// //             const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
// //             XLSX.writeFile(wb, fileName);
// //             toast.success(`Export successful: ${fileName}`);
// //         } catch (e) { toast.error('Export failed. Check console for details.'); } finally { setIsExporting(false); }
// //     };

// //     const syncLearnerWorkbooks = async () => {
// //         setIsSyncing(true);
// //         try {
// //             const batch = writeBatch(db);
// //             const aRef = collection(db, 'assessments');
// //             const [snapA, snapS] = await Promise.all([
// //                 getDocs(query(aRef, where('cohortIds', 'array-contains', cohort.id), where('status', 'in', ['active', 'scheduled']))),
// //                 getDocs(query(aRef, where('cohortId', '==', cohort.id), where('status', 'in', ['active', 'scheduled']))),
// //             ]);
// //             const allAssessments = new Map<string, any>();
// //             snapA.docs.forEach(d => allAssessments.set(d.id, d));
// //             snapS.docs.forEach(d => allAssessments.set(d.id, d));

// //             if (allAssessments.size === 0) { setIsSyncing(false); return toast.info('No active assessments found to sync.'); }

// //             let count = 0;
// //             for (const learner of enrolledLearners) {
// //                 const enrolId = learner.enrollmentId || learner.id;
// //                 const humanId = learner.learnerId || learner.id;
// //                 for (const [astId, astDoc] of allAssessments.entries()) {
// //                     const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohort.id && (s.enrollmentId === enrolId || s.learnerId === humanId));
// //                     if (!exists) {
// //                         const data = astDoc.data();
// //                         batch.set(doc(db, 'learner_submissions', `${cohort.id}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid: learner.authUid || learner.idNumber || humanId, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId: cohort.id, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
// //                         count++;
// //                     }
// //                 }
// //             }
// //             if (count > 0) { await batch.commit(); await fetchSubmissions(); toast.success(`Generated ${count} missing workbook(s).`); }
// //             else toast.success('All learners are synced.');
// //         } catch (e: any) { toast.error('Sync failed.'); } finally { setIsSyncing(false); }
// //     };

// //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

// //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// //         const reason = window.prompt(`QCTO EXIT REASON: Why is ${learnerName} leaving?`);
// //         if (reason?.trim() && window.confirm(`Mark ${learnerName} as dropped?`)) {
// //             await useStore.getState().dropLearnerFromCohort(learnerId, cohort.id, reason);
// //         }
// //     };

// //     const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
// //     const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
// //     const pendingTotal = submissions.filter(s => s.status === 'submitted').length;
// //     const selectedTopicCount = Object.keys(selectedTopics).length;

// //     const renderProgressCard = (title: string, data: { total: number, logged: number }, themeColor: string, bgColor: string) => {
// //         const pct = data.total > 0 ? Math.round((data.logged / data.total) * 100) : 0;
// //         return (
// //             <div style={{ flex: 1, minWidth: '220px', background: 'white', padding: '1.25rem', borderRadius: '8px', border: `1px solid var(--mlab-border)`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
// //                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
// //                     <span style={{ fontWeight: 700, color: 'var(--mlab-midnight)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
// //                     <span style={{ fontWeight: 800, fontSize: '1.2rem', color: themeColor }}>{pct}%</span>
// //                 </div>
// //                 <div style={{ height: '8px', background: bgColor, borderRadius: '4px', overflow: 'hidden' }}>
// //                     <div style={{ height: '100%', background: themeColor, width: `${pct}%`, transition: 'width 0.5s ease-in-out' }} />
// //                 </div>
// //                 <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--mlab-grey)', display: 'flex', justifyContent: 'space-between' }}>
// //                     <span>Progress</span>
// //                     <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>{data.logged} / {data.total} Topics</span>
// //                 </div>
// //             </div>
// //         );
// //     };

// //     return (
// //         <div className="cdp-layout">
// //             {modalConfig.isOpen && createPortal(
// //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// //                     <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />
// //                 </div>,
// //                 document.body
// //             )}
// //             {learnerToPlace && createPortal(<WorkplacePlacementModal learner={learnerToPlace} onClose={() => setLearnerToPlace(null)} />, document.body)}

// //             <AILessonPlanModal
// //                 isOpen={showAIModal || !!editingReport}
// //                 onClose={() => { setShowAIModal(false); setEditingReport(null); }}
// //                 onSave={handleSaveReport}
// //                 onShowStatus={showStatusPopup}
// //                 selectedTopics={selectedTopics}
// //                 curriculumItems={activeProgramme ? curriculumItems : []}
// //                 activeProgramme={activeProgramme}
// //                 cohort={cohort}
// //                 user={user}
// //                 existingReport={editingReport}
// //             />

// //             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

// //             <main className="cdp-main">
// //                 <header className="cdp-header">
// //                     <div className="cdp-header__left">
// //                         <button className="cdp-header__back" onClick={handleBack}>
// //                             <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
// //                         </button>
// //                         <div className="cdp-header__eyebrow"><Users size={12} /> Cohort Overview</div>
// //                         <h1 className="cdp-header__title">{cohort.name}</h1>
// //                         <p className="cdp-header__sub">
// //                             <Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}
// //                             <span className={`cdp-header__status${cohort.isArchived ? ' cdp-header__status--archived' : ' cdp-header__status--active'}`}>{cohort.isArchived ? 'Archived' : 'Active Class'}</span>
// //                         </p>
// //                     </div>
// //                     <div className="cdp-header__right">
// //                         {(isAdmin || isFacilitator) && (
// //                             <div className="cdp-header__actions">
// //                                 <button className="cdp-btn cdp-btn--outline" onClick={handleQCTOExport} disabled={isExporting}>
// //                                     {isExporting ? <Loader2 size={13} className="cdp-spinner" /> : <DownloadCloud size={13} />} Export LEISA
// //                                 </button>
// //                                 <button className="cdp-btn cdp-btn--outline" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
// //                                     {isSyncing ? <Loader2 size={13} className="cdp-spinner" /> : <RefreshCcw size={13} />} Sync Workbooks
// //                                 </button>
// //                             </div>
// //                         )}
// //                         <NotificationBell />
// //                     </div>
// //                 </header>

// //                 <div className="cdp-content">
// //                     {activeExams.length > 0 && (
// //                         <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                                 <div style={{ background: '#3b82f6', padding: '8px', borderRadius: '50%' }}><Timer size={20} color="white" /></div>
// //                                 <div>
// //                                     <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '1rem', fontWeight: 700 }}>Live Exam in Progress</h3>
// //                                     <p style={{ margin: '4px 0 0 0', color: '#2563eb', fontSize: '0.85rem' }}>{activeExams.length} learner(s) currently taking an assessment.</p>
// //                                 </div>
// //                             </div>
// //                             <div style={{ display: 'flex', gap: '8px' }}>
// //                                 <button className="cdp-btn" style={{ background: 'white', color: '#2563eb', border: '1px solid #bfdbfe' }} onClick={() => grantExtraTimeToCohort(15)} disabled={isGrantingTime}>
// //                                     {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />} +15 Mins
// //                                 </button>
// //                                 <button className="cdp-btn" style={{ background: '#2563eb', color: 'white', border: '1px solid #2563eb' }} onClick={() => grantExtraTimeToCohort(30)} disabled={isGrantingTime}>
// //                                     {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />} +30 Mins
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     )}

// //                     <div className="cdp-stat-row">
// //                         <div className="cdp-stat-card cdp-stat-card--blue"><div className="cdp-stat-card__icon"><Users size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Learners</span></div></div>
// //                         <div className="cdp-stat-card cdp-stat-card--green"><div className="cdp-stat-card__icon"><Building2 size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{placedCount}</span><span className="cdp-stat-card__label">Workplace Placements</span></div></div>
// //                         <div className="cdp-stat-card cdp-stat-card--amber"><div className="cdp-stat-card__icon"><Clock size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{pendingTotal}</span><span className="cdp-stat-card__label">Pending Marking</span></div></div>
// //                         <div className="cdp-stat-card cdp-stat-card--grey"><div className="cdp-stat-card__icon"><Award size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Exited</span></div></div>
// //                     </div>

// //                     <div className="mlab-summary-card">
// //                         <div className="mlab-summary-item"><span className="mlab-summary-item__label"><Calendar size={12} /> Timeline</span><span className="mlab-summary-item__value">{cohort.startDate} — {cohort.endDate}</span></div>
// //                         <div className="mlab-summary-item"><span className="mlab-summary-item__label">Instructor / Facilitator</span><span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span></div>
// //                         <div className="mlab-summary-item"><span className="mlab-summary-item__label">Assessor</span><span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span></div>
// //                         <div className="mlab-summary-item"><span className="mlab-summary-item__label">Moderator</span><span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span></div>
// //                     </div>

// //                     <div className="lfm-tabs" style={{ marginBottom: '1.5rem' }}>
// //                         <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}><Users size={16} /> Learner Roster</button>
// //                         <button className={`lfm-tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}><LayoutList size={16} /> Curriculum Tracker</button>
// //                     </div>

// //                     {activeTab === 'learners' && (
// //                         <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
// //                             <div className="vp-card" style={{ marginBottom: 0 }}>
// //                                 <div className="vp-card-header">
// //                                     <div className="vp-card-title-group">
// //                                         <Users size={18} color="var(--mlab-blue)" />
// //                                         <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>Enrolled Learners ({enrolledLearners.length})</h3>
// //                                     </div>
// //                                 </div>
// //                                 <div className="mlab-table-wrap">
// //                                     <table className="mlab-table">
// //                                         <thead>
// //                                             <tr>
// //                                                 <th>Learner</th>
// //                                                 <th>Workplace</th>
// //                                                 <th>Module Progress</th>
// //                                                 <th>Status</th>
// //                                                 <th style={{ textAlign: 'right' }}>Actions</th>
// //                                             </tr>
// //                                         </thead>
// //                                         <tbody>
// //                                             {enrolledLearners.map(learner => {
// //                                                 const isDropped = learner.status === 'dropped';
// //                                                 const routingId = learner.enrollmentId || learner.id;
// //                                                 const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
// //                                                 const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
// //                                                 const isPlaced = !!learner.employerId;

// //                                                 return (
// //                                                     <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
// //                                                         <td>
// //                                                             <div className="cdp-learner-cell">
// //                                                                 <div className="cdp-learner-avatar">{learner.fullName.charAt(0)}</div>
// //                                                                 <div className="cdp-learner-cell__info">
// //                                                                     <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`}>{learner.fullName}</span>
// //                                                                     <span className="cdp-learner-cell__id">{learner.idNumber}</span>
// //                                                                     {!isDropped && pendingCount > 0 && <span className="cdp-pending-chip"><Clock size={10} /> {pendingCount} marking pending</span>}
// //                                                                 </div>
// //                                                             </div>
// //                                                         </td>
// //                                                         <td>{isPlaced ? <span className="cdp-placement__employer">{employers.find(e => e.id === learner.employerId)?.name}</span> : <span className="cdp-placement--pending"><AlertCircle size={12} /> Pending</span>}</td>
// //                                                         <td>
// //                                                             <div className="cdp-chips">
// //                                                                 <ModuleChip label="K" count={learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length} variant="k" />
// //                                                                 <ModuleChip label="P" count={learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length} variant="p" />
// //                                                                 <ModuleChip label="W" count={learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length} variant="w" />
// //                                                             </div>
// //                                                         </td>
// //                                                         <td><span className={`cdp-status-badge${isDropped ? ' cdp-status-badge--dropped' : ' cdp-status-badge--active'}`}>{isDropped ? 'Dropped' : 'Active'}</span></td>
// //                                                         <td style={{ textAlign: 'right' }}>
// //                                                             <div className="cdp-actions">
// //                                                                 {isAdmin && <button className={`mlab-btn mlab-btn--sm ${isPlaced ? 'mlab-btn--ghost' : 'mlab-btn--primary'}`} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
// //                                                                 <button className="mlab-btn mlab-btn--sm mlab-btn--ghost" onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>
// //                                                                 {isAdmin && !isDropped && <button className="mlab-btn mlab-btn--sm mlab-btn--error" onClick={() => handleDropLearner(learner.id, learner.fullName)}><UserMinus size={12} /></button>}
// //                                                             </div>
// //                                                         </td>
// //                                                     </tr>
// //                                                 );
// //                                             })}
// //                                         </tbody>
// //                                     </table>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {activeTab === 'curriculum' && (
// //                         <div className="animate-fade-in" style={{ paddingBottom: selectedTopicCount > 0 ? '80px' : '0' }}>
// //                             {activeProgramme && (
// //                                 <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
// //                                     {renderProgressCard('Knowledge Modules', moduleProgress.Knowledge, '#f59e0b', '#fef3c7')}
// //                                     {renderProgressCard('Practical Modules', moduleProgress.Practical, '#0ea5e9', '#e0f2fe')}
// //                                     {renderProgressCard('Workplace Modules', moduleProgress.Workplace, '#10b981', '#dcfce7')}
// //                                 </div>
// //                             )}

// //                             <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
// //                                 <div style={{ background: 'white', display: 'inline-flex', padding: '4px', borderRadius: '8px', border: '1px solid var(--mlab-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
// //                                     <button onClick={() => setCurriculumViewMode('blueprint')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: curriculumViewMode === 'blueprint' ? 'var(--mlab-blue)' : 'transparent', color: curriculumViewMode === 'blueprint' ? 'white' : 'var(--mlab-grey)' }}><CheckSquare size={14} /> Log New Topics</button>
// //                                     <button onClick={() => setCurriculumViewMode('history')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: curriculumViewMode === 'history' ? 'var(--mlab-blue)' : 'transparent', color: curriculumViewMode === 'history' ? 'white' : 'var(--mlab-grey)' }}><Clock size={14} /> View Past Sessions</button>
// //                                 </div>
// //                             </div>

// //                             <div style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
// //                                 <div className="lfm-header"><h2 className="lfm-header__title" style={{ color: 'white' }}><BookOpen size={18} /> {curriculumViewMode === 'blueprint' ? 'Curriculum Blueprint Tracker' : 'Past Session Reports & Traceability'}</h2></div>
// //                                 <div className="lfm-body" style={{ background: curriculumViewMode === 'blueprint' ? 'white' : 'var(--mlab-bg)', border: '2px solid var(--mlab-blue)', borderTop: 'none', padding: '1.5rem', borderRadius: '0 0 8px 8px' }}>
// //                                     {!activeProgramme ? (
// //                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p>No formal Qualification Blueprint is linked to this cohort.</p></div>
// //                                     ) : (
// //                                         <>
// //                                             {curriculumViewMode === 'blueprint' && (
// //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// //                                                     {Object.keys(groupedCurriculum).map(modCode => {
// //                                                         const group = groupedCurriculum[modCode];
// //                                                         const isOpen = expandedModules.has(modCode);
// //                                                         const totalItems = group.items.length;
// //                                                         const loggedItems = group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
// //                                                         const isComplete = loggedItems === totalItems && totalItems > 0;

// //                                                         return (
// //                                                             <div key={modCode}>
// //                                                                 <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: isComplete ? 'var(--mlab-green)' : 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleModuleAccordion(modCode)}>
// //                                                                     <Layers size={16} color={isComplete ? "var(--mlab-green)" : "var(--mlab-blue)"} />
// //                                                                     <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{group.moduleName}</span></span>
// //                                                                     <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', letterSpacing: '0.1em', fontWeight: 700, background: isComplete ? 'var(--mlab-green-bg)' : 'transparent', padding: '2px 8px', borderRadius: '4px' }}>{loggedItems} / {totalItems} COVERED</span>
// //                                                                     {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
// //                                                                 </div>
// //                                                                 {isOpen && (
// //                                                                     <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid var(--mlab-blue)', padding: 0, marginTop: '-0.75rem' }}>
// //                                                                         <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
// //                                                                             <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
// //                                                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
// //                                                                                     <tr>
// //                                                                                         <th style={{ width: '50px', color: 'grey', textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>Log</th>
// //                                                                                         <th style={{ color: 'grey' }}>Topic / Activity</th>
// //                                                                                         <th style={{ width: '280px', color: 'grey' }}>Status / Session Report</th>
// //                                                                                         <th style={{ width: '180px', color: 'grey' }}>Engagement</th>
// //                                                                                     </tr>
// //                                                                                 </thead>
// //                                                                                 <tbody>
// //                                                                                     {group.items.map(item => {
// //                                                                                         const logRecord = curriculumLogs.find(log => log.topicId === item.id);
// //                                                                                         const isLogged = !!logRecord;
// //                                                                                         const isSelected = selectedTopics.hasOwnProperty(item.id);
// //                                                                                         const ackPct = activeCount > 0 ? Math.round(((logRecord?.acknowledgedBy?.length || 0) / activeCount) * 100) : 0;
// //                                                                                         const associatedReport = isLogged ? sessionReports.find(r => r.id === logRecord.sessionReportId) : null;

// //                                                                                         return (
// //                                                                                             <tr key={item.id} style={{ background: isLogged ? '#f0fdf4' : (isSelected ? '#eff6ff' : 'white') }}>
// //                                                                                                 <td style={{ textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>
// //                                                                                                     {isLogged ? <CheckCircle size={18} color="var(--mlab-green)" style={{ margin: '0 auto' }} /> : <input type="checkbox" checked={isSelected} onChange={() => toggleTopicSelection(item.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }} />}
// //                                                                                                 </td>
// //                                                                                                 <td>
// //                                                                                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                                                                                                         <span style={{ fontWeight: 600, color: isLogged ? '#166534' : 'var(--mlab-midnight)', fontSize: '0.85rem' }}>{item.code ? `${item.code}: ` : ''}{item.title}</span>
// //                                                                                                         <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>{item.moduleType}</span>
// //                                                                                                     </div>
// //                                                                                                 </td>
// //                                                                                                 <td>
// //                                                                                                     {isLogged ? (
// //                                                                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                                                                             <span style={{ display: 'inline-block', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Covered {new Date(logRecord.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
// //                                                                                                             {associatedReport && <button onClick={() => setEditingReport(associatedReport)} style={{ background: 'transparent', border: '1px solid #86efac', color: '#15803d', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}><FileText size={12} /> View Report</button>}
// //                                                                                                         </div>
// //                                                                                                     ) : isSelected ? (
// //                                                                                                         <input type="date" className="lfm-input" value={selectedTopics[item.id]} max={new Date().toISOString().split('T')[0]} onChange={(e) => handleIndividualDateChange(item.id, e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', height: '28px' }} />
// //                                                                                                     ) : <span style={{ display: 'inline-block', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending</span>}
// //                                                                                                 </td>
// //                                                                                                 <td>
// //                                                                                                     {isLogged ? (
// //                                                                                                         <div className="cdp-progress-col" style={{ width: '100%' }}>
// //                                                                                                             <div className="cdp-progress-text"><span style={{ fontFamily: 'var(--font-heading)', color: 'grey' }}>{logRecord?.acknowledgedBy?.length || 0} / {activeCount} ACKD </span><span style={{ fontWeight: 'bold', color: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : '#ef4444') }}>{ackPct}%</span></div>
// //                                                                                                             <div className="cdp-progress-track" style={{ height: '4px', borderRadius: '0' }}><div className="cdp-progress-fill" style={{ width: `${ackPct}%`, background: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : '#ef4444'), borderRadius: '0' }} /></div>
// //                                                                                                         </div>
// //                                                                                                     ) : <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-light)' }}>—</span>}
// //                                                                                                 </td>
// //                                                                                             </tr>
// //                                                                                         );
// //                                                                                     })}
// //                                                                                 </tbody>
// //                                                                             </table>
// //                                                                         </div>
// //                                                                     </div>
// //                                                                 )}
// //                                                             </div>
// //                                                         );
// //                                                     })}
// //                                                 </div>
// //                                             )}

// //                                             {curriculumViewMode === 'history' && (
// //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// //                                                     {curriculumLogs.length === 0 ? (
// //                                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p>No topics have been logged for this cohort yet.</p></div>
// //                                                     ) : (
// //                                                         Object.keys(groupedHistoryLogs).sort().map(modCode => {
// //                                                             const logsInModule = groupedHistoryLogs[modCode];
// //                                                             const isOpen = expandedHistoryModules.has(modCode);
// //                                                             const moduleName = groupedCurriculum[modCode]?.moduleName || '';

// //                                                             return (
// //                                                                 <div key={`hist-${modCode}`}>
// //                                                                     <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleHistoryAccordion(modCode)}>
// //                                                                         <Layers size={16} color="var(--mlab-blue)" />
// //                                                                         <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{moduleName}</span></span>
// //                                                                         <span style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', letterSpacing: '0.1em', fontWeight: 700, background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>{logsInModule.length} TOPIC{logsInModule.length !== 1 ? 's' : ''} LOGGED</span>
// //                                                                         {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
// //                                                                     </div>
// //                                                                     {isOpen && (
// //                                                                         <div className="animate-fade-in" style={{ borderTop: '2px solid var(--mlab-blue)', paddingTop: '15px', marginTop: '-0.75rem' }}>
// //                                                                             {logsInModule.map(log => {
// //                                                                                 const mappedLog = { id: log.id, title: log.topicTitle, moduleCode: log.moduleCode, dateLogged: log.coveredAt || log.dateLogged, notes: log.systemNote || "Session details available in full report.", presentLearnerIds: log.presentLearnerIds, absentLearnerIds: log.absentLearnerIds, acknowledgedBy: log.acknowledgedBy };
// //                                                                                 return <CurriculumTraceabilityCard key={log.id} log={mappedLog} roster={enrolledLearners} />;
// //                                                                             })}
// //                                                                         </div>
// //                                                                     )}
// //                                                                 </div>
// //                                                             );
// //                                                         })
// //                                                     )}
// //                                                 </div>
// //                                             )}
// //                                         </>
// //                                     )}
// //                                 </div>
// //                             </div>

// //                             {selectedTopicCount > 0 && createPortal(
// //                                 <div className="animate-slide-up" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--mlab-blue)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px)', borderTop: '3px solid var(--mlab-green)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 9999, boxShadow: '0 -10px 20px rgba(0,0,0,0.15)' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                                         <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '50%', display: 'flex' }}><CheckCircle size={24} color="var(--mlab-green)" /></div>
// //                                         <div style={{ display: 'flex', flex: 'none', flexDirection: 'column' }}>
// //                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedTopicCount} Topic{selectedTopicCount !== 1 ? 's' : ''} Selected</span>
// //                                             <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Learners will have 48 hours to acknowledge.</span>
// //                                         </div>
// //                                     </div>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
// //                                             <label style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Batch Date:</label>
// //                                             <input type="date" className="lfm-input" value={globalCoveredDate} max={new Date().toISOString().split('T')[0]} onChange={handleGlobalDateChange} style={{ width: '130px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem', background: 'var(--mlab-white)', color: 'var(--mlab-blue)' }} />
// //                                         </div>
// //                                         <button className="lfm-btn" onClick={() => setSelectedTopics({})} style={{ background: 'transparent', color: 'white', border: '2px solid rgba(255,255,255,0.3)' }}>Cancel</button>
// //                                         <button className="lfm-btn" onClick={() => setShowAIModal(true)} disabled={isLogging} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-green)' }}>
// //                                             {isLogging ? <Loader2 size={16} className="lfm-spin" /> : <Sparkles size={16} />} Generate Session Report
// //                                         </button>
// //                                     </div>
// //                                 </div>,
// //                                 document.body
// //                             )}
// //                         </div>
// //                     )}
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };