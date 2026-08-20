// src/pages/AdminDashboard/SurveyManager/SurveyManager.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
    ClipboardList, Plus, Edit2, Trash2, Save, BarChart2, Star, DownloadCloud,
    Loader2, MapPin, Link as LinkIcon, Search, Eye, X, CheckCircle2, User, ChevronDown,
    MessageSquare, BookOpen, Filter, HelpCircle, FileText, Users
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import type { SurveyTemplate, SurveyQuestion, SurveyResponse } from '../../../types/survey.types';

export const SurveyManager: React.FC = () => {
    const toast = useToast();
    const { cohorts, fetchCohorts } = useStore();
    const [activeTab, setActiveTab] = useState<'builder' | 'analytics'>('builder');

    const [surveys, setSurveys] = useState<SurveyTemplate[]>([]);
    const [responses, setResponses] = useState<SurveyResponse[]>([]);
    const [assessments, setAssessments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingSurvey, setEditingLog] = useState<SurveyTemplate | null>(null);
    const [selectedSurveyForAnalytics, setSelectedSurveyForAnalytics] = useState<string>('');
    const [selectedAssessmentFilter, setSelectedAssessmentFilter] = useState<string>('ALL');

    // Builder Form State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [targetType, setTargetType] = useState<'assessment' | 'cohort' | 'general' | 'exit'>('cohort');
    const [targetCohortIds, setTargetCohortIds] = useState<string[]>(['ALL']);
    const [allowMultipleResponses, setAllowMultipleResponses] = useState(false);
    const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // Builder Sidebar Search State
    const [builderSearchQuery, setBuilderSearchQuery] = useState('');

    // Target Cohorts Multi-Select Dropdown State
    const [isCohortDropdownOpen, setIsCohortDropdownOpen] = useState(false);
    const [cohortSearchQuery, setCohortSearchQuery] = useState('');
    const cohortDropdownRef = useRef<HTMLDivElement>(null);

    // Analytics Searchable Dropdown State
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [templateSearchQuery, setTemplateSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Individual Submissions Search State
    const [responseSearchQuery, setResponseSearchQuery] = useState('');

    // Response Viewer Modal State
    const [viewingResponse, setViewingResponse] = useState<SurveyResponse | null>(null);

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
    }, [cohorts, fetchCohorts]);

    // Close dropdowns on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (cohortDropdownRef.current && !cohortDropdownRef.current.contains(event.target as Node)) {
                setIsCohortDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const unsubSurveys = onSnapshot(collection(db, 'surveys'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as SurveyTemplate);
            setSurveys(list);
            if (list.length > 0 && !selectedSurveyForAnalytics) {
                setSelectedSurveyForAnalytics(list[0].id);
            }
        });

        const unsubResponses = onSnapshot(collection(db, 'survey_responses'), (snap) => {
            setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SurveyResponse));
            setLoading(false);
        });

        const unsubAssessments = onSnapshot(collection(db, 'assessments'), (snap) => {
            setAssessments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubSurveys();
            unsubResponses();
            unsubAssessments();
        };
    }, []);

    const assessmentsMap = useMemo(() => {
        const map = new Map<string, any>();
        assessments.forEach(a => map.set(a.id, a));
        return map;
    }, [assessments]);

    const handleCopyPublicLink = (surveyId: string) => {
        const publicUrl = `${window.location.origin}/survey/${surveyId}`;
        navigator.clipboard.writeText(publicUrl);
        toast.success("Shareable public link copied to clipboard!");
    };

    const openNewBuilder = () => {
        setEditingLog(null);
        setTitle('');
        setDescription('');
        setTargetType('cohort');
        setTargetCohortIds(['ALL']);
        setAllowMultipleResponses(false);
        setQuestions([]);
    };

    const openEditBuilder = (s: SurveyTemplate) => {
        setEditingLog(s);
        setTitle(s.title);
        setDescription(s.description || '');
        setTargetType(s.targetType || 'cohort');
        setTargetCohortIds(s.cohortIds && s.cohortIds.length > 0 ? s.cohortIds : ['ALL']);
        setAllowMultipleResponses(s.allowMultipleResponses ?? false);
        setQuestions(s.questions || []);
    };

    const handleAddQuestion = () => {
        const newQ: SurveyQuestion = {
            id: `q_${Date.now()}`,
            type: 'rating',
            label: 'New Question',
            required: true,
            maxStars: 5
        };
        setQuestions([...questions, newQ]);
    };

    const handleUpdateQuestion = (index: number, fields: Partial<SurveyQuestion>) => {
        const next = [...questions];
        next[index] = { ...next[index], ...fields };
        setQuestions(next);
    };

    const handleRemoveQuestion = (index: number) => {
        setQuestions(questions.filter((_, i) => i !== index));
    };

    const toggleTargetCohort = (cohortId: string) => {
        if (cohortId === 'ALL') {
            setTargetCohortIds(['ALL']);
            return;
        }

        let next = targetCohortIds.filter(id => id !== 'ALL');
        if (next.includes(cohortId)) {
            next = next.filter(id => id !== cohortId);
        } else {
            next.push(cohortId);
        }

        if (next.length === 0) next = ['ALL'];
        setTargetCohortIds(next);
    };

    const handleSaveTemplate = async () => {
        if (!title.trim()) { toast.warning("Survey title is required."); return; }
        if (questions.length === 0) { toast.warning("Add at least one question before saving."); return; }

        setIsSaving(true);
        try {
            const surveyId = editingSurvey ? editingSurvey.id : `survey_${Date.now()}`;

            const sanitizedQuestions = questions.map((q) => {
                const cleanQ: Record<string, any> = {
                    id: q.id || `q_${Date.now()}`,
                    type: q.type || 'text',
                    label: q.label?.trim() || 'Question',
                    required: Boolean(q.required)
                };
                if (q.type === 'rating') cleanQ.maxStars = q.maxStars || 5;
                else if (q.type === 'nps') { cleanQ.min = q.min ?? 0; cleanQ.max = q.max ?? 10; }
                else if (q.type === 'single_choice') cleanQ.options = (q.options || []).map(o => String(o).trim()).filter(Boolean);
                else if (q.placeholder?.trim()) cleanQ.placeholder = q.placeholder.trim();
                return cleanQ;
            });

            const payload: Record<string, any> = {
                title: title.trim(),
                description: description.trim(),
                targetType: targetType || 'cohort',
                cohortIds: targetCohortIds,
                allowMultipleResponses,
                isActive: true,
                questions: sanitizedQuestions,
                createdAt: editingSurvey?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'surveys', surveyId), payload);
            toast.success(editingSurvey ? "Survey template updated!" : "New survey created successfully!");
            setEditingLog(null);
        } catch (err: any) {
            console.error("Save template error:", err);
            toast.error(`Failed to save survey template: ${err.message || 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this survey template?")) return;
        try {
            await deleteDoc(doc(db, 'surveys', id));
            toast.success("Survey template deleted.");
        } catch {
            toast.error("Failed to delete survey.");
        }
    };

    const handleDeleteResponse = async (id: string) => {
        if (!window.confirm("Delete this individual survey response permanently?")) return;
        try {
            await deleteDoc(doc(db, 'survey_responses', id));
            toast.success("Response deleted successfully.");
        } catch {
            toast.error("Failed to delete response.");
        }
    };

    const activeSurveyObj = useMemo(() => surveys.find(s => s.id === selectedSurveyForAnalytics), [surveys, selectedSurveyForAnalytics]);

    const allSurveyResponses = useMemo(() => {
        return responses
            .filter(r => r.surveyId === selectedSurveyForAnalytics)
            .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }, [responses, selectedSurveyForAnalytics]);

    const linkedAssessments = useMemo(() => {
        const setMap = new Map<string, { id: string; title: string; moduleNumber?: string }>();
        allSurveyResponses.forEach(r => {
            if (r.assessmentId && r.assessmentId !== 'public_link') {
                const assDoc = assessmentsMap.get(r.assessmentId);
                const title = assDoc?.title || r.assessmentId;
                const moduleNumber = assDoc?.moduleInfo?.moduleNumber || '';
                setMap.set(r.assessmentId, { id: r.assessmentId, title, moduleNumber });
            }
        });
        return Array.from(setMap.values());
    }, [allSurveyResponses, assessmentsMap]);

    const filteredResponses = useMemo(() => {
        if (selectedAssessmentFilter === 'ALL') return allSurveyResponses;
        return allSurveyResponses.filter(r => r.assessmentId === selectedAssessmentFilter);
    }, [allSurveyResponses, selectedAssessmentFilter]);

    const finalDisplayedResponses = useMemo(() => {
        if (!responseSearchQuery.trim()) return filteredResponses;
        const lower = responseSearchQuery.toLowerCase().trim();
        return filteredResponses.filter(r => {
            const name = (r.learnerName || '').toLowerCase();
            const email = (r.learnerEmail || '').toLowerCase();
            const phone = (r.learnerPhone || '').toLowerCase();
            return name.includes(lower) || email.includes(lower) || phone.includes(lower);
        });
    }, [filteredResponses, responseSearchQuery]);

    const analyticsSummary = useMemo(() => {
        if (!activeSurveyObj || filteredResponses.length === 0) return null;

        const summary: Record<string, {
            label: string;
            type: string;
            avgRating?: number;
            totalAnswered?: number;
            choiceBreakdown?: { option: string; count: number; percentage: number }[];
            textCount?: number;
            addressCount?: number;
        }> = {};

        activeSurveyObj.questions.forEach(q => {
            if (q.type === 'rating' || q.type === 'nps') {
                let sum = 0; let count = 0;
                filteredResponses.forEach(r => {
                    const val = r.answers?.[q.id];
                    if (typeof val === 'number') { sum += val; count++; }
                });
                summary[q.id] = {
                    label: q.label,
                    type: q.type,
                    avgRating: count > 0 ? Number((sum / count).toFixed(1)) : 0,
                    totalAnswered: count
                };
            } else if (q.type === 'single_choice') {
                const counts: Record<string, number> = {};
                let answeredCount = 0;

                (q.options || []).forEach(opt => counts[opt] = 0);

                filteredResponses.forEach(r => {
                    const val = r.answers?.[q.id];
                    if (val) {
                        counts[val] = (counts[val] || 0) + 1;
                        answeredCount++;
                    }
                });

                const breakdown = Object.entries(counts).map(([option, count]) => ({
                    option,
                    count,
                    percentage: answeredCount > 0 ? Number(((count / answeredCount) * 100).toFixed(0)) : 0
                }));

                summary[q.id] = {
                    label: q.label,
                    type: q.type,
                    choiceBreakdown: breakdown,
                    totalAnswered: answeredCount
                };
            } else if (q.type === 'address') {
                let count = 0;
                filteredResponses.forEach(r => {
                    const val = r.answers?.[q.id];
                    if (val && typeof val === 'object' && val.formattedAddress) count++;
                });
                summary[q.id] = { label: q.label, type: q.type, addressCount: count };
            } else if (q.type === 'text') {
                let count = 0;
                filteredResponses.forEach(r => {
                    const val = r.answers?.[q.id];
                    if (val && typeof val === 'string' && val.trim().length > 0) count++;
                });
                summary[q.id] = { label: q.label, type: q.type, textCount: count };
            }
        });
        return summary;
    }, [activeSurveyObj, filteredResponses]);

    const filteredSurveysForBuilder = useMemo(() => {
        if (!builderSearchQuery.trim()) return surveys;
        const lower = builderSearchQuery.toLowerCase().trim();
        return surveys.filter(s =>
            s.title.toLowerCase().includes(lower) ||
            s.description?.toLowerCase().includes(lower)
        );
    }, [surveys, builderSearchQuery]);

    const filteredSurveysForDropdown = useMemo(() => {
        if (!templateSearchQuery.trim()) return surveys;
        const lower = templateSearchQuery.toLowerCase().trim();
        return surveys.filter(s =>
            s.title.toLowerCase().includes(lower) ||
            s.description?.toLowerCase().includes(lower)
        );
    }, [surveys, templateSearchQuery]);

    // 🚀 FILTERED COHORTS FOR TARGET DROPDOWN
    const filteredCohortsForBuilder = useMemo(() => {
        const active = cohorts.filter(c => !c.isArchived);
        if (!cohortSearchQuery.trim()) return active;
        const lower = cohortSearchQuery.toLowerCase().trim();
        return active.filter(c => c.name.toLowerCase().includes(lower));
    }, [cohorts, cohortSearchQuery]);

    const exportExcel = () => {
        if (finalDisplayedResponses.length === 0) return toast.warning("No response data to export.");

        const questionMap = new Map<string, string>();
        activeSurveyObj?.questions?.forEach(q => {
            if (q.id && q.label) {
                questionMap.set(q.id, q.label.trim());
            }
        });

        const rows = finalDisplayedResponses.map(r => {
            const flattenedAnswers: Record<string, any> = {};
            const parentAssessment = r.assessmentId ? assessmentsMap.get(r.assessmentId) : null;

            Object.entries(r.answers || {}).forEach(([qId, val]) => {
                const rawLabel = questionMap.get(qId) || qId.replace(/^q_/, 'Question ').replace(/_/g, ' ');
                const qLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

                if (val && typeof val === 'object' && 'formattedAddress' in val) {
                    flattenedAnswers[`${qLabel} - Address`] = val.formattedAddress || '';
                    flattenedAnswers[`${qLabel} - Suburb`] = val.suburb || '';
                    flattenedAnswers[`${qLabel} - City`] = val.city || '';
                    flattenedAnswers[`${qLabel} - Local Municipality`] = val.localMunicipality || '';
                    flattenedAnswers[`${qLabel} - District / Metro`] = val.districtOrMetro || '';
                    flattenedAnswers[`${qLabel} - Province`] = val.province || '';
                    flattenedAnswers[`${qLabel} - Postal Code`] = val.postalCode || '';
                    flattenedAnswers[`${qLabel} - Latitude`] = val.lat || '';
                    flattenedAnswers[`${qLabel} - Longitude`] = val.lng || '';
                } else {
                    flattenedAnswers[qLabel] = val !== undefined && val !== null ? val : '';
                }
            });

            return {
                "Response ID": r.id,
                "Respondent Name": r.learnerName || 'External Respondent',
                "Respondent Email": r.learnerEmail || 'N/A',
                "Respondent Phone": r.learnerPhone || 'N/A',
                "Verified Contact": r.isVerifiedRespondent ? 'YES' : 'NO',
                "Assessment ID": r.assessmentId || 'N/A',
                "Assessment Title": parentAssessment?.title || (r.assessmentId === 'public_link' ? 'Public Shared Link' : 'N/A'),
                "Module Number": parentAssessment?.moduleInfo?.moduleNumber || 'N/A',
                "Cohort ID": r.cohortId || 'N/A',
                "Submitted At": new Date(r.submittedAt).toLocaleString('en-ZA'),
                ...flattenedAnswers
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Survey Responses");
        XLSX.writeFile(wb, `Survey_Export_${selectedSurveyForAnalytics}.xlsx`);
        toast.success("Feedback logs exported!");
    };

    if (loading) return <div style={{ padding: '3rem', textAlign: 'center' }}><Loader2 size={24} className="spin" color="var(--mlab-blue)" /></div>;

    return (
        <div style={{ padding: '1.5rem', background: '#f8fafc', minHeight: '100vh' }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            <style>{`
                .sm-table-container { background: #fff; border: 1px solid var(--mlab-border); border-top: 3px solid var(--mlab-blue); overflow: hidden; margin-top: 1.5rem; }
                .sm-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; }
                .sm-table th { background: var(--mlab-light-blue); padding: 12px 16px; font-family: var(--font-heading); text-transform: uppercase; color: var(--mlab-blue); border-bottom: 1px solid var(--mlab-border); font-size: 0.8rem; letter-spacing: 0.05em; }
                .sm-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
                .sm-table tr:hover td { background-color: #f8fafc; }
                .sm-badge-verified { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px; }
                .sm-badge-unverified { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px; }
                
                .sm-dropdown { position: absolute; top: 100%; left: 0; width: 340px; background: #fff; border: 1px solid var(--mlab-border); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 50; max-height: 350px; overflow-y: auto; margin-top: 4px; }
                .sm-dropdown-search { position: sticky; top: 0; background: #f8fafc; padding: 10px; border-bottom: 1px solid var(--mlab-border); display: flex; align-items: center; gap: 8px; z-index: 2; }
                .sm-dropdown-item { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s; }
                .sm-dropdown-item:hover { background: var(--mlab-light-blue); }
                .sm-dropdown-item.active { background: var(--mlab-blue); color: #fff; }
                .sm-dropdown-item.active .text-sub { color: #cbd5e1; }

                .sm-sidebar-scroll::-webkit-scrollbar { width: 5px; }
                .sm-sidebar-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
                .sm-sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
            `}</style>

            {/* HEADER */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><FileText size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Survey & Feedback Engine</h1>
                        <p className="wm-page-header__desc">Manage feedback templates and inspect real-time survey analytics.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        className={`wm-btn ${activeTab === 'builder' ? 'wm-btn--primary' : 'wm-btn--ghost'}`}
                        onClick={() => setActiveTab('builder')}
                    >
                        <ClipboardList size={14} /> Templates & Builder
                    </button>
                    <button
                        className={`wm-btn ${activeTab === 'analytics' ? 'wm-btn--primary' : 'wm-btn--ghost'}`}
                        onClick={() => setActiveTab('analytics')}
                    >
                        <BarChart2 size={14} /> Analytics & Responses ({responses.length})
                    </button>
                </div>
            </div>

            {/* ─── TAB 1: BUILDER & TEMPLATES ─── */}
            {activeTab === 'builder' && (
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
                    <div style={{
                        background: '#fff',
                        border: '1px solid var(--mlab-border)',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: 'calc(100vh - 210px)',
                        position: 'sticky',
                        top: '1.5rem',
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
                            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
                                Templates ({filteredSurveysForBuilder.length})
                            </span>
                            <button onClick={openNewBuilder} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Plus size={12} /> New
                            </button>
                        </div>

                        {/* TEMPLATES SIDEBAR SEARCH BAR */}
                        <div style={{ position: 'relative', marginBottom: '0.85rem', flexShrink: 0 }}>
                            <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                className="lfm-input"
                                value={builderSearchQuery}
                                onChange={e => setBuilderSearchQuery(e.target.value)}
                                placeholder="Search templates..."
                                style={{ paddingLeft: '32px', borderRadius: 0, width: '100%', fontSize: '0.8rem', height: '36px' }}
                            />
                        </div>

                        <div className="sm-sidebar-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, paddingRight: '2px' }}>
                            {filteredSurveysForBuilder.length > 0 ? (
                                filteredSurveysForBuilder.map(s => (
                                    <div key={s.id} style={{ padding: '10px', background: editingSurvey?.id === s.id ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ overflow: 'hidden', paddingRight: '6px' }}>
                                            <strong style={{ fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</strong>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
                                                {s.questions?.length || 0} Questions {s.allowMultipleResponses ? '• Multi-submit' : '• Single-submit'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                            <button onClick={() => handleCopyPublicLink(s.id)} title="Copy Shareable Public Link" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                <LinkIcon size={12} />
                                            </button>
                                            <button onClick={() => openEditBuilder(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)' }}><Edit2 size={13} /></button>
                                            <button onClick={() => handleDeleteTemplate(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-red)' }}><Trash2 size={13} /></button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--mlab-grey)', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)' }}>
                                    No templates match "{builderSearchQuery}"
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1.1rem', textTransform: 'uppercase' }}>
                            {editingSurvey ? 'Edit Template' : 'Create Survey Template'}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '4px' }}>Survey Title *</label>
                                <input type="text" className="lfm-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Post-Assessment Feedback" style={{ borderRadius: 0, width: '100%' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '4px' }}>Description</label>
                                <input type="text" className="lfm-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Help us improve our test clarity" style={{ borderRadius: 0, width: '100%' }} />
                            </div>

                            {/* 🚀 SEARCHABLE MULTI-SELECT TARGET COHORTS DROPDOWN */}
                            <div style={{ padding: '12px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '4px', color: 'var(--mlab-blue)' }}>
                                    <Users size={14} color="var(--mlab-green)" /> Target Cohort Availability
                                </label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '0 0 10px 0' }}>
                                    Restrict this survey to specific active classes, or leave set to "All Active Cohorts".
                                </p>

                                <div style={{ position: 'relative', width: '100%', maxWidth: '420px' }} ref={cohortDropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => setIsCohortDropdownOpen(!isCohortDropdownOpen)}
                                        className="lfm-input"
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: '#fff', borderRadius: 0 }}
                                    >
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>
                                            {targetCohortIds.includes('ALL')
                                                ? 'All Active Cohorts'
                                                : `${targetCohortIds.length} Cohort(s) Selected`}
                                        </span>
                                        <ChevronDown size={14} color="var(--mlab-grey)" />
                                    </button>

                                    {isCohortDropdownOpen && (
                                        <div className="sm-dropdown" style={{ width: '100%', maxWidth: '420px' }}>
                                            <div className="sm-dropdown-search">
                                                <Search size={14} color="var(--mlab-grey)" />
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={cohortSearchQuery}
                                                    onChange={e => setCohortSearchQuery(e.target.value)}
                                                    placeholder="Search cohorts..."
                                                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                                                />
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div
                                                    className={`sm-dropdown-item ${targetCohortIds.includes('ALL') ? 'active' : ''}`}
                                                    onClick={() => toggleTargetCohort('ALL')}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
                                                >
                                                    <input type="checkbox" checked={targetCohortIds.includes('ALL')} readOnly style={{ accentColor: 'var(--mlab-green)' }} />
                                                    All Active Cohorts
                                                </div>

                                                {filteredCohortsForBuilder.length > 0 ? (
                                                    filteredCohortsForBuilder.map(c => {
                                                        const isSelected = targetCohortIds.includes(c.id);
                                                        return (
                                                            <div
                                                                key={c.id}
                                                                className={`sm-dropdown-item ${isSelected ? 'active' : ''}`}
                                                                onClick={() => toggleTargetCohort(c.id)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                                            >
                                                                <input type="checkbox" checked={isSelected} readOnly style={{ accentColor: 'var(--mlab-blue)' }} />
                                                                <span style={{ fontSize: '0.85rem' }}>{c.name}</span>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--mlab-grey)', textAlign: 'center' }}>No cohorts found.</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* TARGET COHORTS CHIPS DISPLAY */}
                                {!targetCohortIds.includes('ALL') && targetCohortIds.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                        {targetCohortIds.map(id => {
                                            const match = cohorts.find(c => c.id === id);
                                            return (
                                                <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                                                    {match?.name || id}
                                                    <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => toggleTargetCohort(id)} />
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: '10px 12px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)' }}>
                                <label className="lfm-checkbox-row" style={{ cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={allowMultipleResponses}
                                        onChange={e => setAllowMultipleResponses(e.target.checked)}
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }}
                                    />
                                    <div>
                                        <strong style={{ fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'block' }}>Allow Multiple Submissions</strong>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>
                                            If unchecked, participants can only complete this survey once per browser/account.
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>Questions ({questions.length})</span>
                                <button onClick={handleAddQuestion} className="lfm-btn lfm-btn--ghost" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                                    <Plus size={12} /> Add Question
                                </button>
                            </div>

                            {/* EMPTY STATE PLACEHOLDER WHEN QUESTIONS ARE 0 */}
                            {questions.length === 0 ? (
                                <div style={{
                                    padding: '2.5rem 1.5rem',
                                    border: '2px dashed var(--mlab-border)',
                                    background: 'var(--mlab-bg)',
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    marginBottom: '1rem'
                                }}>
                                    <HelpCircle size={32} color="var(--mlab-grey)" />
                                    <strong style={{ color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.9rem' }}>
                                        No Questions Added Yet
                                    </strong>
                                    <p style={{ color: 'var(--mlab-grey)', fontSize: '0.82rem', margin: 0, maxWidth: '320px', lineHeight: 1.4 }}>
                                        Build your survey by adding rating scales, multiple choice options, location autocompletes, or free text fields.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleAddQuestion}
                                        className="lfm-btn lfm-btn--accent"
                                        style={{ marginTop: '0.5rem', color: 'var(--mlab-grey)', padding: '6px 14px', fontSize: '0.78rem' }}
                                    >
                                        <Plus size={14} /> Add First Question
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {questions.map((q, idx) => (
                                        <div key={q.id} style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>#{idx + 1}</span>
                                                <input type="text" className="lfm-input" value={q.label} onChange={e => handleUpdateQuestion(idx, { label: e.target.value })} placeholder="Question label..." style={{ flex: 1, borderRadius: 0 }} />
                                                <select className="lfm-input lfm-select" value={q.type} onChange={e => handleUpdateQuestion(idx, { type: e.target.value as any })} style={{ width: '170px', borderRadius: 0 }}>
                                                    <option value="rating">Star Rating</option>
                                                    <option value="single_choice">Multiple Choice</option>
                                                    <option value="nps">NPS Scale (0-10)</option>
                                                    <option value="address">Address Autocomplete</option>
                                                    <option value="text">Open Text</option>
                                                </select>
                                                <button onClick={() => handleRemoveQuestion(idx)} style={{ background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}><Trash2 size={15} /></button>
                                            </div>

                                            {q.type === 'single_choice' && (
                                                <div style={{ paddingLeft: '24px' }}>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-grey)' }}>Comma-separated Options:</label>
                                                    <input type="text" className="lfm-input" value={q.options?.join(', ') || ''} onChange={e => handleUpdateQuestion(idx, { options: e.target.value.split(',').map(s => s.trim()) })} placeholder="Option 1, Option 2, Option 3" style={{ borderRadius: 0, width: '100%', marginTop: '2px' }} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={handleSaveTemplate} className="lfm-btn lfm-btn--primary" disabled={isSaving}>
                                    <Save size={14} /> {isSaving ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 2: ANALYTICS & RESPONSES ─── */}
            {activeTab === 'analytics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* TOP BAR: SEARCHABLE TEMPLATE SELECTOR & ASSESSMENT FILTER */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '1rem', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                            {/* 1. Template Picker */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>Template:</span>

                                <div style={{ position: 'relative' }} ref={dropdownRef}>
                                    <button
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="lfm-input"
                                        style={{ width: '300px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: '#f8fafc' }}
                                    >
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {activeSurveyObj ? activeSurveyObj.title : "Search Template..."}
                                        </span>
                                        <ChevronDown size={14} color="var(--mlab-grey)" />
                                    </button>

                                    {isDropdownOpen && (
                                        <div className="sm-dropdown">
                                            <div className="sm-dropdown-search">
                                                <Search size={14} color="var(--mlab-grey)" />
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={templateSearchQuery}
                                                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                                                    placeholder="Search templates..."
                                                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                                                />
                                            </div>
                                            {filteredSurveysForDropdown.length > 0 ? (
                                                filteredSurveysForDropdown.map(s => (
                                                    <div
                                                        key={s.id}
                                                        className={`sm-dropdown-item ${selectedSurveyForAnalytics === s.id ? 'active' : ''}`}
                                                        onClick={() => {
                                                            setSelectedSurveyForAnalytics(s.id);
                                                            setSelectedAssessmentFilter('ALL');
                                                            setIsDropdownOpen(false);
                                                            setTemplateSearchQuery('');
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{s.title}</div>
                                                        <div className="text-sub" style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
                                                            {s.questions?.length} Questions • {s.targetType}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div style={{ padding: '14px', fontSize: '0.8rem', color: 'var(--mlab-grey)', textAlign: 'center' }}>No templates found.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 2. Assessment Filter (If linked to multiple assessments) */}
                            {linkedAssessments.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Filter size={14} color="var(--mlab-grey)" />
                                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--mlab-blue)' }}>Assessment Filter:</span>
                                    <select
                                        className="lfm-input lfm-select"
                                        value={selectedAssessmentFilter}
                                        onChange={(e) => setSelectedAssessmentFilter(e.target.value)}
                                        style={{ width: '260px', borderRadius: 0 }}
                                    >
                                        <option value="ALL">All Linked Assessments ({allSurveyResponses.length})</option>
                                        {linkedAssessments.map(a => (
                                            <option key={a.id} value={a.id}>
                                                {a.moduleNumber ? `${a.moduleNumber} • ` : ''}{a.title}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            {selectedSurveyForAnalytics && (
                                <button onClick={() => handleCopyPublicLink(selectedSurveyForAnalytics)} className="lfm-btn lfm-btn--ghost" style={{ borderRadius: 0 }}>
                                    <LinkIcon size={14} /> Public Link
                                </button>
                            )}
                            <button onClick={exportExcel} className="lfm-btn lfm-btn--outline" style={{ borderRadius: 0, color: 'var(--mlab-blue)', background: '#fff', border: '1px solid var(--mlab-border)' }}>
                                <DownloadCloud size={14} /> Export Excel
                            </button>
                        </div>
                    </div>

                    {activeSurveyObj ? (
                        <>
                            {/* AGGREGATE BOUNDED KPI CARDS */}
                            {analyticsSummary && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                                    {Object.entries(analyticsSummary).map(([qId, data]) => (
                                        <div key={qId} style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-blue)', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', lineHeight: 1.3 }}>
                                                {data.label}
                                            </h4>

                                            {/* RATING & NPS SUMMARY */}
                                            {data.avgRating !== undefined && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--mlab-bg)', padding: '12px', border: '1px solid var(--mlab-border)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Star size={26} color="#f59e0b" fill="#f59e0b" />
                                                        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{data.avgRating}</span>
                                                    </div>
                                                    <span style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
                                                        {data.totalAnswered} Answered
                                                    </span>
                                                </div>
                                            )}

                                            {/* BOUNDED CHOICE PERCENTAGE PROGRESS BARS */}
                                            {data.choiceBreakdown && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {data.choiceBreakdown.map((item) => (
                                                        <div key={item.option} style={{ fontSize: '0.8rem' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 600 }}>
                                                                <span style={{ color: 'var(--mlab-midnight)' }}>{item.option}</span>
                                                                <span style={{ color: 'var(--mlab-grey)' }}>{item.percentage}% ({item.count})</span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '8px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)' }}>
                                                                <div style={{ width: `${item.percentage}%`, height: '100%', background: 'var(--mlab-green)', transition: 'width 0.4s ease' }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* TEXT COMMENTS METRIC CARD */}
                                            {data.textCount !== undefined && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--mlab-bg)', padding: '12px', border: '1px solid var(--mlab-border)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <MessageSquare size={20} color="var(--mlab-blue)" />
                                                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{data.textCount}</span>
                                                        <span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>Comments Captured</span>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>See Table Below</span>
                                                </div>
                                            )}

                                            {/* ADDRESS LOCATIONS METRIC CARD */}
                                            {data.addressCount !== undefined && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--mlab-bg)', padding: '12px', border: '1px solid var(--mlab-border)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <MapPin size={20} color="var(--mlab-green)" />
                                                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{data.addressCount}</span>
                                                        <span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>Locations Captured</span>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>See Table Below</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* DETAILED RESPONSES TABLE WITH SEARCHABLE PARTICIPANT FILTER */}
                            <div className="sm-table-container">
                                <div style={{
                                    padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
                                    justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Individual Submissions ({finalDisplayedResponses.length})
                                        </h3>
                                        {selectedAssessmentFilter !== 'ALL' && (
                                            <span style={{ fontSize: '0.75rem', background: 'var(--mlab-green)', color: 'var(--mlab-blue)', padding: '2px 8px', fontWeight: 'bold' }}>
                                                Filtered View
                                            </span>
                                        )}
                                    </div>

                                    {/* PARTICIPANT SEARCH BAR FOR SUBMISSIONS TABLE */}
                                    <div style={{ position: 'relative', width: '260px' }}>
                                        <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                        <input
                                            type="text"
                                            className="lfm-input"
                                            value={responseSearchQuery}
                                            onChange={(e) => setResponseSearchQuery(e.target.value)}
                                            placeholder="Search name, email, phone..."
                                            style={{ paddingLeft: '32px', borderRadius: 0, width: '100%', fontSize: '0.8rem', height: '34px', background: '#fff', color: 'var(--mlab-blue)' }}
                                        />
                                    </div>
                                </div>

                                {finalDisplayedResponses.length > 0 ? (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="sm-table">
                                            <thead>
                                                <tr>
                                                    <th>Date Submitted</th>
                                                    <th>Participant</th>
                                                    <th>Assessment / Module</th>
                                                    <th>Contact Status</th>
                                                    <th style={{ textAlign: 'center' }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {finalDisplayedResponses.map(resp => {
                                                    const parentAssessment = resp.assessmentId ? assessmentsMap.get(resp.assessmentId) : null;

                                                    return (
                                                        <tr key={resp.id}>
                                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                                {new Date(resp.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td>
                                                                <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{resp.learnerName || 'Anonymous Respondent'}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{resp.learnerEmail || resp.learnerPhone || 'No contact provided'}</div>
                                                            </td>
                                                            <td>
                                                                {parentAssessment ? (
                                                                    <div>
                                                                        <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <BookOpen size={12} color="var(--mlab-green)" /> {parentAssessment.title}
                                                                        </div>
                                                                        {parentAssessment.moduleInfo?.moduleNumber && (
                                                                            <div style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>
                                                                                Module: {parentAssessment.moduleInfo.moduleNumber}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : resp.assessmentId === 'public_link' ? (
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Public Share Link</span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{resp.assessmentId || 'Unlinked'}</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                {resp.isVerifiedRespondent
                                                                    ? <span className="sm-badge-verified"><CheckCircle2 size={12} /> Verified</span>
                                                                    : <span className="sm-badge-unverified">Unverified</span>
                                                                }
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                                    <button onClick={() => setViewingResponse(resp)} title="View Detailed Response" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>
                                                                        <Eye size={14} />
                                                                    </button>
                                                                    <button onClick={() => handleDeleteResponse(resp.id)} title="Delete Response" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                        {responseSearchQuery ? `No individual submissions match "${responseSearchQuery}".` : 'No responses found for this criteria.'}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={{ background: '#fff', padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)' }}>
                            Please select a survey template from the dropdown to view its analytics.
                        </div>
                    )}
                </div>
            )}

            {/* ─── MODAL: VIEW INDIVIDUAL RESPONSE WITH ASSESSMENT METADATA ─── */}
            {viewingResponse && activeSurveyObj && (
                <div className="lfm-overlay" onClick={() => setViewingResponse(null)} style={{ zIndex: 9999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '85vh' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><User size={16} /> Participant Submission</h2>
                            <button className="lfm-close-btn" onClick={() => setViewingResponse(null)}><X size={20} /></button>
                        </div>

                        <div className="lfm-body" style={{ background: '#f8fafc', padding: 0 }}>
                            {/* Respondent & Assessment Meta Info */}
                            <div style={{ padding: '1.25rem', background: '#fff', borderBottom: '1px solid var(--mlab-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1.2rem', textTransform: 'uppercase' }}>
                                        {viewingResponse.learnerName || 'Anonymous'}
                                    </h3>
                                    {viewingResponse.isVerifiedRespondent
                                        ? <span className="sm-badge-verified"><CheckCircle2 size={12} /> Verified Contact</span>
                                        : <span className="sm-badge-unverified">Unverified</span>
                                    }
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span><strong>Submitted:</strong> {new Date(viewingResponse.submittedAt).toLocaleString('en-ZA')}</span>
                                    {viewingResponse.learnerEmail && <span><strong>Email:</strong> {viewingResponse.learnerEmail}</span>}
                                    {viewingResponse.learnerPhone && <span><strong>Phone:</strong> {viewingResponse.learnerPhone}</span>}

                                    {viewingResponse.assessmentId && viewingResponse.assessmentId !== 'public_link' && (
                                        <div style={{ marginTop: '6px', padding: '6px 10px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)' }}>
                                            <span style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <BookOpen size={12} color="var(--mlab-green)" />
                                                {assessmentsMap.get(viewingResponse.assessmentId)?.title || viewingResponse.assessmentId}
                                            </span>
                                            {assessmentsMap.get(viewingResponse.assessmentId)?.moduleInfo?.moduleNumber && (
                                                <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>
                                                    Module Code: {assessmentsMap.get(viewingResponse.assessmentId)?.moduleInfo?.moduleNumber}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Answers Breakdown */}
                            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>Survey Answers</h4>

                                {activeSurveyObj.questions.map((q, idx) => {
                                    const answer = viewingResponse.answers?.[q.id];

                                    return (
                                        <div key={q.id} style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1rem' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-midnight)', marginBottom: '8px' }}>
                                                {idx + 1}. {q.label}
                                            </div>

                                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>
                                                {answer === undefined || answer === '' ? (
                                                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Skipped / No Answer</span>
                                                ) : q.type === 'rating' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Star size={16} color="#f59e0b" fill="#f59e0b" />
                                                        <strong>{answer}</strong> / {q.maxStars || 5}
                                                    </div>
                                                ) : q.type === 'address' ? (
                                                    <div style={{ background: 'var(--mlab-bg)', padding: '8px', border: '1px solid var(--mlab-border)', fontSize: '0.8rem' }}>
                                                        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><MapPin size={12} /> {answer.formattedAddress}</div>
                                                        {answer.localMunicipality && <div style={{ color: 'var(--mlab-grey)' }}>Municipality: {answer.localMunicipality}</div>}
                                                        {answer.districtOrMetro && <div style={{ color: 'var(--mlab-grey)' }}>District: {answer.districtOrMetro}</div>}
                                                        {answer.province && <div style={{ color: 'var(--mlab-grey)' }}>Province: {answer.province}</div>}
                                                    </div>
                                                ) : (
                                                    <span style={{ whiteSpace: 'pre-wrap' }}>{String(answer)}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="lfm-footer" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="lfm-btn lfm-btn--outline" onClick={() => setViewingResponse(null)} style={{ background: '#fff', border: '1px solid var(--mlab-border)' }}>Close View</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};