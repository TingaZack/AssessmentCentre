// src/components/views/LearnerWorkplaceLogModal/LearnerWorkplaceLogModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Briefcase, Calendar, Layers, Info, AlertTriangle, UploadCloud, CheckCircle, ExternalLink } from 'lucide-react';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { useToast } from '../../common/Toast/Toast';
import moment from 'moment';

import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import '../../admin/LearnerFormModal/LearnerFormModal.css';

const MIDNIGHT = '#073f4e';

interface LearnerWorkplaceLogModalProps {
    learner: any;
    existingLog?: any;
    onClose: () => void;
}

export const LearnerWorkplaceLogModal: React.FC<LearnerWorkplaceLogModalProps> = ({ learner, existingLog, onClose }) => {
    const toast = useToast();
    const [isSaving, setIsSaving] = useState(false);

    // ─── FORM STATE ───
    const [dateString, setDateString] = useState(existingLog ? existingLog.dateString : moment().format('YYYY-MM-DD'));
    const [startTime, setStartTime] = useState(existingLog ? existingLog.startTime : '08:00');
    const [endTime, setEndTime] = useState(existingLog ? existingLog.endTime : '16:00');
    const [isQctoAligned, setIsQctoAligned] = useState(existingLog ? existingLog.isQctoAligned : true);
    const [selectedModuleCode, setSelectedModuleCode] = useState(existingLog ? existingLog.workActivityCode : '');
    const [selectedTopicCode, setSelectedTopicCode] = useState(existingLog ? existingLog.topicCode : '');
    const [tasksPerformed, setTasksPerformed] = useState(existingLog ? existingLog.tasksPerformed : '');

    // File Evidence State
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [evidenceUrl, setEvidenceUrl] = useState(existingLog ? existingLog.evidenceUrl : '');

    const weModules = useMemo(() => {
        return (learner.workExperienceModules || []).filter((m: any) => m.code || m.name);
    }, [learner]);

    const activeModule = useMemo(() => {
        if (!selectedModuleCode) return null;
        return weModules.find((m: any) => (m.code || m.name) === selectedModuleCode);
    }, [weModules, selectedModuleCode]);

    const moduleTopics = useMemo(() => {
        if (!activeModule) return [];
        return activeModule.topics || [];
    }, [activeModule]);

    useEffect(() => {
        if (weModules.length > 0 && !selectedModuleCode) {
            setSelectedModuleCode(weModules[0].code || weModules[0].name);
        }
    }, [weModules, selectedModuleCode]);

    useEffect(() => {
        if (moduleTopics.length > 0 && !selectedTopicCode) {
            setSelectedTopicCode(moduleTopics[0].code || '');
        }
    }, [moduleTopics, selectedTopicCode]);

    const calculateHours = () => {
        const start = moment(`${dateString} ${startTime}`, 'YYYY-MM-DD HH:mm');
        const end = moment(`${dateString} ${endTime}`, 'YYYY-MM-DD HH:mm');
        const duration = moment.duration(end.diff(start));
        return Math.max(0, duration.asHours());
    };

    const handleSaveLog = async (e: React.FormEvent, targetStatus: 'Draft' | 'Pending_Mentor_Approval') => {
        e.preventDefault();

        const totalHours = calculateHours();
        if (totalHours <= 0) {
            toast.error("End time must be after start time.");
            return;
        }

        // Strip HTML tags from Quill content to check actual text length safely
        const plainTextDescription = tasksPerformed.replace(/(<([^>]+)>)/gi, "").trim();

        if (targetStatus === 'Pending_Mentor_Approval' && plainTextDescription.length < 20) {
            toast.error("Please provide a more detailed description of your tasks before submitting.");
            return;
        }

        if (!learner.mentorId || !learner.employerId) {
            toast.error("You must be officially placed with an Employer and Mentor to log workplace hours.");
            return;
        }

        setIsSaving(true);

        try {
            // STEP 1: Upload File to Storage if selected
            let finalEvidenceUrl = evidenceUrl;
            if (evidenceFile) {
                try {
                    const storage = getStorage();
                    const fileExtension = evidenceFile.name.split('.').pop();
                    const storageRef = ref(storage, `workplace_evidence/${learner.id}/${Date.now()}_evidence.${fileExtension}`);
                    const snapshot = await uploadBytes(storageRef, evidenceFile);
                    finalEvidenceUrl = await getDownloadURL(snapshot.ref);
                } catch (uploadErr) {
                    console.error("File upload failed:", uploadErr);
                    toast.error("Failed to upload evidence file. Saving text only.");
                }
            }

            // STEP 2: BACK-AND-FORTH LOOP AUDIT BUILDER
            const structuralHistory = [...(existingLog?.history || [])];
            if (existingLog && existingLog.status === 'Rejected') {
                const alreadyArchived = structuralHistory.some((h: any) => h.updatedAt === existingLog.updatedAt);
                if (!alreadyArchived) {
                    structuralHistory.push({
                        tasksPerformed: existingLog.tasksPerformed,
                        evidenceUrl: existingLog.evidenceUrl || '',
                        rejectionReason: existingLog.rejectionReason || '',
                        status: existingLog.status,
                        updatedAt: existingLog.updatedAt || new Date().toISOString()
                    });
                }
            }

            const chosenTopic = moduleTopics.find((t: any) => t.code === selectedTopicCode);

            const payload = {
                learnerId: learner.id,
                learnerName: learner.fullName,
                cohortId: learner.cohortId || 'Unassigned',
                mentorId: learner.mentorId,
                employerId: learner.employerId,
                dateString,
                startTime,
                endTime,
                totalHours,
                isQctoAligned,
                workActivityCode: activeModule?.code || '',
                workActivityLabel: activeModule?.name || '',
                moduleName: activeModule?.name || 'General Workplace Duties',
                topicCode: chosenTopic?.code || selectedTopicCode || '',
                topicTitle: chosenTopic?.title || 'General Workplace Activity',
                tasksPerformed,
                evidenceUrl: finalEvidenceUrl || '',
                status: targetStatus,

                history: structuralHistory,
                rejectionReason: existingLog?.rejectionReason || null,

                createdAt: existingLog?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (existingLog?.id) {
                await setDoc(doc(db, 'workplace_logs', existingLog.id), payload, { merge: true });
            } else {
                await addDoc(collection(db, 'workplace_logs'), payload);
            }

            if (targetStatus === 'Draft') {
                toast.success("Timesheet saved successfully as a draft!");
            } else {
                toast.success("Timesheet entry resubmitted for mentor verification!");
            }

            onClose();
        } catch (error) {
            console.error("Error saving workplace log:", error);
            toast.error("Failed to securely save logbook entry.");
        } finally {
            setIsSaving(false);
        }
    };

    // 🚀 EXTREMELY HIGH FIDELITY TOOLBAR SELECTION CONFIGURATION
    const quillModules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            [{ 'script': 'sub' }, { 'script': 'super' }],
            [{ 'align': [] }],
            [{ 'color': [] }, { 'background': [] }],
            ['link', 'table'], // 🚀 Link Insertion (GitHub) & Data Matrix Tables Enabled
            ['clean']
        ]
    };

    return (
        <div className="lfm-overlay" onClick={onClose}>
            {/* Local CSS Overrides to defend the modal from boundaries inflation text anomalies */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .quill-content-display { word-wrap: break-word !important; overflow-wrap: break-word !important; max-width: 100% !important; }
                .quill-content-display *, .quill-content-display p, .quill-content-display span { word-wrap: break-word !important; overflow-wrap: break-word !important; line-break: anywhere !important; }
                .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 6px 0 !important; }
                
                /* 🚀 FIXED: PREVENTS WHITE TEXT GHOSTING INSIDE THE ACTIVE QUILL EDITING AREA AND ALL SUB-ELEMENTS */
                .ql-container.ql-snow {
                    background-color: #ffffff !important;
                }
                .ql-editor {
                    color: #1e293b !important; /* Forces dark slate text */
                    background-color: #ffffff !important;
                    font-family: inherit !important;
                    font-size: 0.9rem !important;
                }
                .ql-editor.ql-blank::before {
                    color: #94a3b8 !important; /* Light grey styling placeholder */
                    font-style: normal !important;
                }
                .ql-toolbar.ql-snow {
                    background-color: #f8fafc !important; /* Uniform slate color palette tracking header */
                    border-bottom: 1px solid var(--mlab-border) !important;
                }
                .ql-toolbar.ql-snow .ql-stroke {
                    stroke: #475569 !important;
                }
                .ql-toolbar.ql-snow .ql-fill {
                    fill: #475569 !important;
                }
                .ql-toolbar.ql-snow .ql-picker {
                    color: #475569 !important;
                }
                
                /* 🚀 ADDITIONAL OVERRIDES FOR THE FORMATTING NODES ACTIVE STATE TEXT COHERENCE */
                .ql-editor p, .ql-editor span, .ql-editor h1, .ql-editor h2, .ql-editor h3, .ql-editor li {
                    color: #1e293b !important; 
                }
                .ql-editor blockquote {
                    border-left: 4px solid #cbd5e1 !important;
                    padding-left: 10px !important;
                    color: #475569 !important;
                }
                .ql-editor a {
                    color: #2563eb !important;
                    text-decoration: underline !important;
                }
                .ql-editor pre.ql-syntax {
                    background-color: #1e293b !important;
                    color: #f8fafc !important;
                    padding: 8px 12px !important;
                    border-radius: 4px !important;
                }
                .ql-editor code {
                    background-color: #f1f5f9 !important;
                    color: #0f172a !important;
                    padding: 2px 4px !important;
                    border-radius: 4px !important;
                }
                .ql-editor table {
                    border-collapse: collapse;
                    width: 100%;
                }
                .ql-editor table td {
                    border: 1px solid #cbd5e1 !important;
                    padding: 6px 10px !important;
                    color: #1e293b !important;
                }
            `}} />

            <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>

                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <Briefcase size={16} />
                        {existingLog?.status === 'Rejected' || existingLog?.rejectionReason ? 'Fix Rejected Timesheet' : (existingLog ? 'Resume Draft Entry' : 'Log Workplace Hours')}
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                </div>

                <form onSubmit={(e) => handleSaveLog(e, 'Pending_Mentor_Approval')} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div className="lfm-body">

                        {/* Renders the mentor rejection text smoothly as structured HTML content */}
                        {existingLog?.rejectionReason && (
                            <div className="lfm-error-banner" style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fecaca', marginBottom: '1rem', alignItems: 'flex-start', display: 'flex', gap: '8px' }}>
                                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ width: '100%' }}>
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.75rem', marginBottom: '4px' }}>Mentor's Rejection Note</strong>
                                    <div
                                        className="quill-content-display"
                                        style={{ fontSize: '0.85rem', lineHeight: 1.4, color: '#9f1239' }}
                                        dangerouslySetInnerHTML={{ __html: existingLog.rejectionReason }}
                                    />
                                </div>
                            </div>
                        )}

                        {!learner.mentorId && (
                            <div className="lfm-error-banner" style={{ marginBottom: '1rem' }}>
                                <AlertTriangle size={16} />
                                <span>You are currently not assigned to a Mentor. Your logs cannot be approved.</span>
                            </div>
                        )}

                        <div className="lfm-section-hdr"><Calendar size={13} /> Date & Time</div>
                        <div className="lfm-grid">
                            <div className="lfm-fg">
                                <label>Date of Work *</label>
                                <input className="lfm-input" type="date" required max={moment().format('YYYY-MM-DD')} value={dateString} onChange={(e) => setDateString(e.target.value)} />
                            </div>
                            <div className="lfm-fg">
                                <label>Start Time *</label>
                                <input className="lfm-input" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                            </div>
                            <div className="lfm-fg">
                                <label>End Time *</label>
                                <input className="lfm-input" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                            </div>
                            <div className="lfm-fg">
                                <label>Total Hours</label>
                                <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '0.55rem 0.75rem', fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>
                                    {calculateHours().toFixed(1)} hrs
                                </div>
                            </div>
                        </div>

                        <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}><Layers size={13} /> QCTO Alignment</div>
                        <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
                            <label className="lfm-checkbox-row">
                                <input type="checkbox" checked={isQctoAligned} onChange={(e) => setIsQctoAligned(e.target.checked)} />
                                <span>Align this entry to an official QCTO Work Activity (WA)</span>
                            </label>
                        </div>

                        {isQctoAligned && weModules.length > 0 && (
                            <div className="lfm-grid" style={{ gridTemplateColumns: '1fr', gap: '1rem' }}>
                                <div className="lfm-fg">
                                    <label>Select Work Activity Module *</label>
                                    <select className="lfm-input lfm-select" required value={selectedModuleCode} onChange={(e) => setSelectedModuleCode(e.target.value)}>
                                        <option value="">-- Select Module --</option>
                                        {weModules.map((m: any, idx: number) => (
                                            <option key={idx} value={m.code || m.name}>{m.code ? `${m.code} - ` : ''}{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {moduleTopics.length > 0 && (
                                    <div className="lfm-fg animate-fade-in">
                                        <label>Select Specific Topic Element / Activity *</label>
                                        <select className="lfm-input lfm-select" required value={selectedTopicCode} onChange={(e) => setSelectedTopicCode(e.target.value)} style={{ borderLeft: '3px solid var(--mlab-blue)' }}>
                                            <option value="">-- Select Topic Element --</option>
                                            {moduleTopics.map((t: any, idx: number) => (
                                                <option key={idx} value={t.code}>{t.code ? `${t.code} - ` : ''}{t.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {isQctoAligned && weModules.length === 0 && (
                            <div style={{ fontSize: '0.8rem', color: '#b45309', background: '#fef3c7', padding: '0.75rem', border: '1px solid #fde68a', borderRadius: '4px' }}>
                                No Work Experience modules found in your active curriculum blueprint.
                            </div>
                        )}

                        <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}><Info size={13} /> Tasks Performed / Evidence</div>

                        <div className="lfm-fg">
                            <label>Detailed Description *</label>
                            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid var(--mlab-border)', overflow: 'hidden' }}>
                                <ReactQuill
                                    theme="snow"
                                    value={tasksPerformed}
                                    onChange={setTasksPerformed}
                                    modules={quillModules}
                                    placeholder="Describe the tasks you completed, tools used, and outcomes achieved..."
                                    style={{
                                        height: '160px',
                                        marginBottom: '42px'
                                    }}
                                />
                            </div>
                        </div>

                        {/* 🚀 HIGH FIDELITY EXISTING ATTACHMENT VIEWER & UPLOAD CONTROLLER */}
                        <div className="lfm-fg" style={{ marginTop: '0.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <UploadCloud size={14} color="var(--mlab-grey)" /> Attach Supporting Evidence (Optional)
                            </label>

                            {evidenceUrl && !evidenceFile && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '6px', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ background: '#dcfce7', padding: '6px', borderRadius: '4px' }}>
                                            <CheckCircle size={16} color="#166534" />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: MIDNIGHT }}>Existing Evidence Attached</div>
                                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>Uploading a new file below will replace this document.</div>
                                        </div>
                                    </div>
                                    <a
                                        href={evidenceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ background: 'white', border: '1px solid #cbd5e1', color: '#0f172a', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                                    >
                                        <ExternalLink size={14} /> View File
                                    </a>
                                </div>
                            )}

                            <input
                                type="file"
                                className="lfm-input"
                                style={{ padding: '8px', fontSize: '0.85rem' }}
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        const file = e.target.files[0];
                                        const maxBytes = 5 * 1024 * 1024;

                                        if (file.size > maxBytes) {
                                            toast.error("File is too large. Please upload an image or PDF under 5MB.");
                                            e.target.value = "";
                                            return;
                                        }
                                        setEvidenceFile(file);
                                    }
                                }}
                            />
                        </div>

                    </div>

                    <div className="lfm-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving} style={{ marginRight: 'auto' }}>Cancel</button>

                        <button
                            type="button"
                            className="lfm-btn"
                            onClick={(e) => handleSaveLog(e, 'Draft')}
                            disabled={isSaving || !learner.mentorId}
                            style={{ background: '#cbd5e1', color: '#1e293b', border: 'none', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            {isSaving ? <Loader2 size={13} className="lfm-spin" /> : <Save size={13} />} Save Draft
                        </button>

                        <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving || !learner.mentorId}>
                            {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Submitting…</> : <><Save size={13} /> {existingLog?.rejectionReason ? 'Resubmit to Mentor' : 'Submit Timesheet'}</>}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
};