import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
    Calendar, Edit3, Sparkles, X, Loader2, PenTool, LinkIcon, Plus, Trash2, CheckCircle
} from 'lucide-react';
import { db } from '../../../lib/firebase';

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

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (planHtml: string, evidenceLinks: { url: string; description: string }[], isEdit: boolean, reportId?: string, sessionDate?: string) => void;
    onShowStatus: (type: any, title: string, message: string) => void;
    selectedTopics: Record<string, string>;
    curriculumItems: any[];
    activeProgramme: any;
    cohort: any;
    user: any;
    existingReport: any;
}

export const AILessonPlanModal: React.FC<Props> = ({
    isOpen, onClose, onSave, onShowStatus,
    selectedTopics, curriculumItems, activeProgramme, cohort, user, existingReport
}) => {
    const [isGenerating, setIsGenerating] = useState(true);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [planHtml, setPlanHtml] = useState('');
    const [evidenceItems, setEvidenceItems] = useState<{ url: string; description: string }[]>([{ url: '', description: '' }]);
    const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().split('T')[0]);
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
                if (userSnap.exists()) setAuthorSignature(userSnap.data().signatureUrl || null);
            } catch (error) {
                console.error("Failed to fetch author signature:", error);
            }
        };
        fetchSignature();
    }, [isOpen, authorId, existingReport]);

    useEffect(() => {
        if (!isOpen) { hasGeneratedRef.current = false; return; }
        if (existingReport) {
            setPlanHtml(existingReport.reportHtml || '');
            setEvidenceItems(existingReport.evidenceLinks?.length ? existingReport.evidenceLinks : [{ url: '', description: '' }]);
            setSessionDate(existingReport.sessionDate || existingReport.dateLogged?.split('T')[0] || new Date().toISOString().split('T')[0]);
            setIsGenerating(false);
            hasGeneratedRef.current = true;
        } else {
            setSessionDate(new Date().toISOString().split('T')[0]);
            if (!hasGeneratedRef.current) {
                hasGeneratedRef.current = true;
                const generateFromAI = async () => {
                    setIsGenerating(true);
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
                            if (user?.signatureUrl) finalHtml = finalHtml.replace(`<strong>Delivered By:</strong> ${user?.fullName}</p>`, `<strong>Delivered By:</strong> ${user?.fullName}</p><img src="${user.signatureUrl}" crossOrigin="anonymous" style="max-height: 50px; display: block; margin: 10px 0;" alt="Digital Signature" />`);
                            setPlanHtml(finalHtml);
                            onShowStatus('success', 'AI Generation Complete', 'OpenAI has drafted your lesson plan.');
                        } else throw new Error("Invalid HTML returned from AI");
                    } catch (error: any) {
                        onShowStatus('warning', 'AI Unavailable', "OpenAI service busy. Loaded standard template instead.");
                        setPlanHtml(`<h3>1. Programme Information</h3><p><strong>Programme:</strong> ${activeProgramme?.name || cohort?.name}</p><p><strong>SAQA ID:</strong> ${activeProgramme?.saqaId || 'N/A'}</p><ul>${topicList}</ul><hr/><p><strong>Delivered By:</strong> ${user?.fullName}</p>${user?.signatureUrl ? `<img src="${user.signatureUrl}" crossOrigin="anonymous" style="max-height: 50px;"/>` : ''}`);
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
                                        <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', borderLeft: '4px solid #0ea5e9', padding: '8px 12px', borderRadius: '4px', fontSize: '0.8rem', color: '#0369a1' }}>
                                            {!existingReport ? <strong>Automated QCTO Compliance:</strong> : <strong>Edit Mode:</strong>} Review your content below.
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                            <Calendar size={14} color="#0284c7" />
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>Session Date:</span>
                                            <input
                                                type="date"
                                                value={sessionDate}
                                                max={new Date().toISOString().split('T')[0]}
                                                onChange={e => setSessionDate(e.target.value)}
                                                style={{ border: 'none', outline: 'none', fontSize: '0.8rem', background: 'transparent', color: 'var(--mlab-blue)', fontWeight: 600, cursor: 'pointer' }}
                                            />
                                        </div>
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
                                            <img src={authorSignature} alt="Signature" crossOrigin="anonymous" style={{ maxHeight: '60px', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
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
                    <button className="lfm-btn lfm-btn--primary" onClick={() => onSave(planHtml, evidenceItems.filter(e => e.url), !!existingReport, existingReport?.id, sessionDate)} disabled={isGenerating || isEnhancing}>
                        <CheckCircle size={16} /> {existingReport ? 'Update Session Report' : 'Save Log & Publish Topics'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};