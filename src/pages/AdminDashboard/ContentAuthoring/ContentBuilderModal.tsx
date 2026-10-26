// src/pages/AdminDashboard/ContentAuthoring/ContentBuilderModal.tsx

import React, { useState, useEffect, useMemo, memo, useRef, useCallback } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import Editor from '@monaco-editor/react';

import {
    collection, doc, writeBatch, serverTimestamp, getDocs, query
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { saveLearningUnit } from '../../../services/contentService';
import { useToast } from '../../../components/common/Toast/Toast';
import { createPortal } from 'react-dom';
import Tooltip from '../../../components/common/Tooltip/Tooltip';
import {
    Plus, Video, FileText, Sparkles,
    X, Clock, Layers, Zap, GraduationCap,
    Bookmark, Save, Loader2, Trash2, Settings, CheckCircle2, Eye, Tv, ExternalLink, Play, Timer,
    Code, Target, GripVertical, ChevronDown, ArrowDownNarrowWide,
    Paperclip, Lock, Tag, FileSpreadsheet, FileCode, UploadCloud, Info,
    Award, HelpCircle, ShieldCheck, ClipboardCheck
} from 'lucide-react';
import type {
    InteractiveCheckConfig,
    AccreditationBody,
    AccreditationConfig,
    MCQOption,
    MCQQuestion,
    AssessmentGatesConfig,
    GateSlot,
} from '../../../types/content.types';
import type { ExtendedLearningUnit } from './ContentAuthoring';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import {
    CourseMetadataSettingsPanel,
    STANDARD_ACCREDITATIONS,
    TagSelector,
    type FacilitatorInfo
} from '../../../components/common/CourseMetadataSettingsPanel/CourseMetadataSettingsPanel';

import './ContentAuthoring.css';

export interface LessonAttachment {
    id: string;
    name: string;
    url: string;
    fileType: string;
    uploadedAt: string;
    description?: string;
    fileSize?: number;
}

interface ExtendedLearningUnitWithStatus extends ExtendedLearningUnit {
    _justSaved?: boolean;
    interactiveCheck?: InteractiveCheckConfig | null;
    assessmentGates?: AssessmentGatesConfig;
    attachments?: LessonAttachment[];
    isRequiredForNextUnit?: boolean;
    tags?: string[];
    linkedAssessmentId?: string | null;
    unlinkedPolicy?: 'soft_gate' | 'hard_gate';
}

interface ContentBuilderModalProps {
    activeContainer: any;
    activeFramework: 'qcto' | 'secam';
    linkedTemplate: any;
    initialUnits: ExtendedLearningUnit[];
    isMockMode: boolean;
    onClose: () => void;
    onSaveBatch: (drafts: ExtendedLearningUnit[], toDeleteIds: string[], checkpointMetadata?: any) => Promise<void>;
}

const QUILL_MODULES = {
    toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link', 'clean']
    ]
};

const generateUniqueId = (prefix: string) =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const createDefaultMCQQuestion = (questionNum: number = 1): MCQQuestion => ({
    id: generateUniqueId('mcq_q'),
    question: `Question ${questionNum}: What is the primary purpose of this topic?`,
    options: [
        { id: generateUniqueId('opt'), text: 'Option A (Correct)', isCorrect: true },
        { id: generateUniqueId('opt'), text: 'Option B', isCorrect: false },
        { id: generateUniqueId('opt'), text: 'Option C', isCorrect: false },
        { id: generateUniqueId('opt'), text: 'Option D', isCorrect: false }
    ]
});

const sanitizePayload = (obj: any): any => {
    return JSON.parse(JSON.stringify(obj, (_, value) => (value === undefined ? null : value)));
};

export const sanitizeCodeInput = (input?: string): string => {
    if (!input) return '';
    let text = input.replace(/\u00A0/g, ' ').replace(/&nbsp;/gi, ' ');
    text = text.replace(/<\/p>\s*<p>/gi, '\n').replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<div[^>]*>/gi, '').replace(/<\/div>/gi, '\n')
        .replace(/<pre[^>]*>/gi, '').replace(/<\/pre>/gi, '\n').replace(/<code[^>]*>/gi, '').replace(/<\/code>/gi, '');
    let decoded = text;
    for (let i = 0; i < 3; i++) {
        if (!decoded.includes('&') && !decoded.includes('<')) break;
        const parser = new DOMParser();
        const doc = parser.parseFromString(decoded, 'text/html');
        decoded = doc.body.textContent || '';
    }
    return decoded.replace(/\u00A0/g, ' ').replace(/<[^>]*>/g, '');
};

const DEFAULT_BUGGY_CODE = `function UserProfile() {\n  return (\n    <h1>User Details</h1>\n    <p>Welcome to your profile!</p>\n  );\n}`;
const DEFAULT_SOLUTION_CODE = `function UserProfile() {\n  return (\n    <>\n      <h1>User Details</h1>\n      <p>Welcome to your profile!</p>\n    </>\n  );\n}`;

const extractYouTubeId = (url: string): string | null => {
    const cleanUrl = url.trim();
    if (cleanUrl.includes('youtu.be/')) return cleanUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || null;
    if (cleanUrl.includes('youtube.com/shorts/')) return cleanUrl.split('youtube.com/shorts/')[1]?.split('?')[0]?.split('&')[0] || null;
    if (cleanUrl.includes('youtube.com/live/')) return cleanUrl.split('youtube.com/live/')[1]?.split('?')[0]?.split('&')[0] || null;
    if (cleanUrl.includes('youtube.com/embed/')) return cleanUrl.split('youtube.com/embed/')[1]?.split('?')[0]?.split('&')[0] || null;
    if (cleanUrl.includes('youtube.com')) {
        try {
            return new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`).searchParams.get('v');
        } catch (e) { return null; }
    }
    return null;
};

const YOUTUBE_API_KEY = (import.meta as any).env?.VITE_YOUTUBE_API_KEY as string | undefined;

const parseIso8601Duration = (iso: string): number => {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    return (parseInt(match[1] || '0', 10) * 3600) + (parseInt(match[2] || '0', 10) * 60) + parseInt(match[3] || '0', 10);
};

const fetchYouTubeDurationViaDataApi = async (videoId: string): Promise<number | null> => {
    if (!YOUTUBE_API_KEY) return null;
    try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${videoId}&key=${YOUTUBE_API_KEY}`);
        if (!res.ok) return null;
        const data = await res.json();
        const isoDuration = data?.items?.[0]?.contentDetails?.duration;
        if (!isoDuration) return null;
        const totalSeconds = parseIso8601Duration(isoDuration);
        return totalSeconds > 0 ? Math.max(1, Math.ceil(totalSeconds / 60)) : null;
    } catch (e) { return null; }
};

let ytApiPromise: Promise<void> | null = null;
const loadYouTubeApi = (): Promise<void> => {
    if ((window as any).YT && (window as any).YT.Player) return Promise.resolve();
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise<void>((resolve, reject) => {
        if (!document.getElementById('yt-iframe-api')) {
            const tag = document.createElement('script');
            tag.id = 'yt-iframe-api';
            tag.src = 'https://www.youtube.com/iframe_api';
            tag.onerror = () => reject(new Error('Failed to load YouTube script'));
            document.head.appendChild(tag);
        }
        const previousOnReady = (window as any).onYouTubeIframeAPIReady;
        (window as any).onYouTubeIframeAPIReady = () => {
            if (typeof previousOnReady === 'function') previousOnReady();
            resolve();
        };
        const interval = setInterval(() => {
            if ((window as any).YT && (window as any).YT.Player) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
        setTimeout(() => { clearInterval(interval); reject(new Error('Timeout')); }, 10000);
    }).catch(err => { ytApiPromise = null; throw err; });
    return ytApiPromise;
};

const fetchYouTubeDurationViaIframe = async (videoId: string): Promise<number | null> => {
    try { await loadYouTubeApi(); } catch (err) { return null; }
    return new Promise<number | null>((resolve) => {
        const tempDiv = document.createElement('div');
        Object.assign(tempDiv.style, { position: 'fixed', bottom: '0px', right: '0px', width: '320px', height: '240px', opacity: '0.001', pointerEvents: 'none', zIndex: '-99999' });
        document.body.appendChild(tempDiv);
        let resolved = false;
        let pollInterval: any = null;
        const cleanup = () => { if (pollInterval) clearInterval(pollInterval); if (tempDiv.parentNode) tempDiv.parentNode.removeChild(tempDiv); };
        let player: any = null;
        const timeoutId = setTimeout(() => { if (!resolved) { resolved = true; if (player) { try { player.destroy(); } catch (e) { } } cleanup(); resolve(null); } }, 8000);
        try {
            player = new (window as any).YT.Player(tempDiv, {
                videoId: videoId,
                playerVars: { autoplay: 1, mute: 1, controls: 0, disablekb: 1, origin: window.location.origin },
                events: {
                    onReady: (event: any) => {
                        try { event.target.mute(); event.target.playVideo(); } catch (e) { }
                        let attempts = 0;
                        pollInterval = setInterval(() => {
                            if (resolved) { clearInterval(pollInterval); return; }
                            attempts++;
                            let durSecs = 0;
                            try { durSecs = event.target.getDuration(); } catch (e) { }
                            if (durSecs && durSecs > 0) {
                                resolved = true; clearInterval(pollInterval); clearTimeout(timeoutId);
                                try { event.target.pauseVideo(); event.target.destroy(); } catch (e) { }
                                cleanup(); resolve(Math.max(1, Math.ceil(durSecs / 60)));
                            } else if (attempts > 30) {
                                resolved = true; clearInterval(pollInterval); clearTimeout(timeoutId);
                                try { event.target.destroy(); } catch (e) { }
                                cleanup(); resolve(null);
                            }
                        }, 100);
                    },
                    onError: () => { if (resolved) return; cleanup(); clearTimeout(timeoutId); resolved = true; resolve(null); }
                }
            });
        } catch (err) { if (!resolved) { cleanup(); clearTimeout(timeoutId); resolved = true; resolve(null); } }
    });
};

export const fetchVideoDurationMinutes = async (url: string): Promise<number | null> => {
    if (!url) return null;
    const cleanUrl = url.trim();
    if (cleanUrl.includes('vimeo.com')) {
        try {
            const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(cleanUrl)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.duration) return Math.max(1, Math.ceil(data.duration / 60));
            }
        } catch (e) { }
    }
    if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
        const videoId = extractYouTubeId(cleanUrl);
        if (!videoId) return null;
        const apiResult = await fetchYouTubeDurationViaDataApi(videoId);
        if (apiResult !== null) return apiResult;
        return fetchYouTubeDurationViaIframe(videoId);
    }
    if (cleanUrl.match(/\.(mp4|webm|ogg)($|\?)/i)) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = cleanUrl;
            video.onloadedmetadata = () => resolve(video.duration && !isNaN(video.duration) ? Math.max(1, Math.ceil(video.duration / 60)) : null);
            video.onerror = () => resolve(null);
        });
    }
    return null;
};

export const getEmbedVideoUrl = (url?: string): string | null => {
    if (!url) return null;
    try {
        const cleanUrl = url.trim();
        if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
            const sanitizedId = extractYouTubeId(cleanUrl)?.replace(/[^a-zA-Z0-9_-]/g, '');
            if (sanitizedId && sanitizedId.length >= 10) return `https://www.youtube.com/embed/${sanitizedId}?controls=0&rel=0&autoplay=0&modestbranding=1`;
        }
        if (cleanUrl.includes('vimeo.com')) {
            let videoId = ''; let hash = '';
            const unlistedMatch = cleanUrl.match(/vimeo\.com\/(\d+)\/([a-zA-Z0-9]+)/);
            if (unlistedMatch) { videoId = unlistedMatch[1]; hash = unlistedMatch[2]; }
            else if (cleanUrl.includes('player.vimeo.com/video/')) {
                const parts = cleanUrl.split('player.vimeo.com/video/')[1]?.split('?')[0]?.split('/');
                videoId = parts[0] || '';
                const searchParams = new URLSearchParams(cleanUrl.split('?')[1] || '');
                hash = searchParams.get('h') || parts[1] || '';
            } else {
                const match = cleanUrl.match(/(?:vimeo\.com\/)(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/\d+\/video\/|video\/|manage\/videos\/)?(\d+)/);
                if (match && match[1]) videoId = match[1];
            }
            if (videoId) return `https://player.vimeo.com/video/${videoId}?controls=0&autopause=0${hash ? `&h=${hash}` : ''}`;
        }
        return cleanUrl;
    } catch (e) { return url; }
};

export const getVideoThumbnail = (url?: string): string | null => {
    if (!url) return null;
    try {
        const cleanUrl = url.trim();
        if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
            const sanitizedId = extractYouTubeId(cleanUrl)?.replace(/[^a-zA-Z0-9_-]/g, '');
            if (sanitizedId && sanitizedId.length >= 10) return `https://img.youtube.com/vi/${sanitizedId}/hqdefault.jpg`;
        }
        if (cleanUrl.includes('vimeo.com')) {
            const match = cleanUrl.match(/vimeo\.com\/(?:video\/|manage\/videos\/)?(\d+)/);
            if (match && match[1]) return `https://vumbnail.com/${match[1]}.jpg`;
        }
    } catch (e) { }
    return null;
};

export const openPopoutPlayer = (videoUrl: string) => {
    if (!videoUrl) return;
    const cleanUrl = videoUrl.trim();
    let embedUrl = getEmbedVideoUrl(cleanUrl);
    if (!embedUrl) embedUrl = cleanUrl;
    const width = 880; const height = 500;
    const left = (window.innerWidth - width) / 2; const top = (window.innerHeight - height) / 2;
    window.open(embedUrl, '_blank', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=no,status=no`);
};

const resequenceDraftUnits = (units: ExtendedLearningUnitWithStatus[], secamStructure: any[], activeFramework: 'qcto' | 'secam'): ExtendedLearningUnitWithStatus[] => {
    const unitsCopy = [...units];
    const resequenced: ExtendedLearningUnitWithStatus[] = [];
    const processedIds = new Set<string>();
    let counter = 1;

    if (activeFramework === 'secam' && Array.isArray(secamStructure)) {
        secamStructure.forEach((sprint) => {
            const days = sprint.days || [];
            days.forEach((day: any) => {
                const dayUnits = unitsCopy.filter(u => u.sprintTitle === sprint.title && u.dayOrLessonTitle === day.title);
                dayUnits.forEach(u => {
                    if (!processedIds.has(u.id)) {
                        processedIds.add(u.id);
                        resequenced.push({ ...u, orderIndex: counter++ });
                    }
                });
            });
        });
    }

    unitsCopy.forEach(u => {
        if (!processedIds.has(u.id)) {
            processedIds.add(u.id);
            resequenced.push({ ...u, orderIndex: counter++ });
        }
    });
    return resequenced;
};

const MemoizedCheckpointEditor = memo(({ ic, onUpdateField }: { ic: InteractiveCheckConfig, onUpdateField: (field: string, value: any) => void }) => {
    const [localBuggy, setLocalBuggy] = useState(ic.buggyCode || DEFAULT_BUGGY_CODE);
    const [localSolution, setLocalSolution] = useState(ic.solutionCode || DEFAULT_SOLUTION_CODE);
    const [localInstructions, setLocalInstructions] = useState(ic.instructions || '');
    const [localDefense, setLocalDefense] = useState(ic.defenseQuestion || '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { setLocalBuggy(ic.buggyCode || DEFAULT_BUGGY_CODE); }, [ic.buggyCode]);
    useEffect(() => { setLocalSolution(ic.solutionCode || DEFAULT_SOLUTION_CODE); }, [ic.solutionCode]);
    useEffect(() => { setLocalInstructions(ic.instructions || ''); }, [ic.instructions]);
    useEffect(() => { setLocalDefense(ic.defenseQuestion || ''); }, [ic.defenseQuestion]);

    const handleDebouncedUpdate = (field: string, value: any) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { onUpdateField(field, value); }, 600);
    };

    const updateQuestionField = (qIdx: number, key: keyof MCQQuestion, value: any) => {
        const questions = [...(ic.mcqQuestions || [])];
        if (!questions[qIdx]) return;
        questions[qIdx] = { ...questions[qIdx], [key]: value };
        onUpdateField('mcqQuestions', questions);
    };

    const addQuestion = () => {
        const questions = [...(ic.mcqQuestions || [])];
        questions.push(createDefaultMCQQuestion(questions.length + 1));
        onUpdateField('mcqQuestions', questions);
    };

    const removeQuestion = (qIdx: number) => {
        const questions = (ic.mcqQuestions || []).filter((_, idx) => idx !== qIdx);
        onUpdateField('mcqQuestions', questions);
    };

    const updateOptionField = (qIdx: number, oIdx: number, key: keyof MCQOption, value: any) => {
        const questions = [...(ic.mcqQuestions || [])];
        if (!questions[qIdx]) return;
        const options = [...(questions[qIdx].options || [])];
        if (!options[oIdx]) return;
        if (key === 'isCorrect' && value === true) {
            options.forEach((opt, idx) => { opt.isCorrect = idx === oIdx; });
        } else {
            options[oIdx] = { ...options[oIdx], [key]: value };
        }
        questions[qIdx] = { ...questions[qIdx], options };
        onUpdateField('mcqQuestions', questions);
    };

    const addOption = (qIdx: number) => {
        const questions = [...(ic.mcqQuestions || [])];
        if (!questions[qIdx]) return;
        const options = [...(questions[qIdx].options || [])];
        options.push({ id: generateUniqueId('opt'), text: `Option ${String.fromCharCode(65 + options.length)}`, isCorrect: options.length === 0 });
        questions[qIdx] = { ...questions[qIdx], options };
        onUpdateField('mcqQuestions', questions);
    };

    const removeOption = (qIdx: number, oIdx: number) => {
        const questions = [...(ic.mcqQuestions || [])];
        if (!questions[qIdx]) return;
        const options = (questions[qIdx].options || []).filter((_, idx) => idx !== oIdx);
        questions[qIdx] = { ...questions[qIdx], options };
        onUpdateField('mcqQuestions', questions);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '6px' }}>
            <select className="pfm-input" style={{ width: '100%', padding: '6px 8px', borderRadius: '0px' }} value={ic.checkType || 'none'} onChange={e => onUpdateField('checkType', e.target.value)}>
                <option value="none">No Verification Check</option>
                <option value="mcq">❓ Multiple Choice Questions Quiz Bank</option>
                <option value="socratic_dialogue">🤖 Socratic AI Peer Dialogue (PR Review / Concept Check)</option>
                <option value="spot_the_bug">🐛 Spot-the-Bug (Code Logic Repair)</option>
                <option value="oral_defense">🎙️ AI Oral Defense (Audio Transcript Analysis)</option>
            </select>

            {ic.checkType && ic.checkType !== 'none' && (() => {
                const totalSecs = ic.timeLimitSeconds || 0;
                const isMins = totalSecs > 0 && totalSecs % 60 === 0;
                const displayVal = totalSecs === 0 ? '' : isMins ? totalSecs / 60 : totalSecs;
                const unit = isMins ? 'mins' : 'secs';
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0px', padding: '4px 8px' }}>
                        <Timer size={14} color="#0284c7" />
                        <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Countdown Limit:</span>
                        <input className="pfm-input" style={{ width: '55px', border: '1px solid #e2e8f0', padding: '2px 4px', textAlign: 'center', fontWeight: 700, borderRadius: '0px' }} type="number" placeholder="0" value={displayVal} onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            onUpdateField('timeLimitSeconds', unit === 'mins' ? val * 60 : val);
                        }} min={0} />
                        <select className="pfm-input" style={{ border: 'none', background: 'transparent', fontSize: '0.75rem', padding: '2px 0', fontWeight: 700, color: '#0284c7', cursor: 'pointer', borderRadius: '0px' }} value={unit} onChange={e => {
                            const currentNum = typeof displayVal === 'number' ? displayVal : 0;
                            onUpdateField('timeLimitSeconds', e.target.value === 'mins' ? currentNum * 60 : currentNum);
                        }}>
                            <option value="secs">Seconds</option>
                            <option value="mins">Minutes</option>
                        </select>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 'auto' }}>Leave empty or 0 for unlimited</span>
                    </div>
                );
            })()}

            {ic.checkType === 'mcq' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '0px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <HelpCircle size={14} /> MCQ Quiz Bank ({(ic.mcqQuestions || []).length} Question{(ic.mcqQuestions || []).length === 1 ? '' : 's'})
                        </span>
                        <button type="button" style={{ background: '#16a34a', color: 'white', border: 'none', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', borderRadius: '0px', display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }} onClick={addQuestion}>
                            <Plus size={12} /> Add Question
                        </button>
                    </div>

                    {(ic.mcqQuestions || []).map((q, qIdx) => (
                        <div key={q.id || qIdx} style={{ background: '#ffffff', border: '1px solid #bbf7d0', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>Question #{qIdx + 1}</span>
                                {(ic.mcqQuestions || []).length > 1 && (
                                    <button type="button" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.68rem', fontWeight: 700 }} onClick={() => removeQuestion(qIdx)}><Trash2 size={13} /> Remove</button>
                                )}
                            </div>
                            <textarea className="pfm-input" rows={2} style={{ padding: '6px 8px', borderRadius: '0px', background: '#f8fafc', fontSize: '0.8rem' }} placeholder={`Enter Question #${qIdx + 1} prompt...`} value={q.question || ''} onChange={e => updateQuestionField(qIdx, 'question', e.target.value)} />
                            <label style={{ fontSize: '0.68rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase', marginTop: '2px' }}>Options &amp; Correct Answer</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {(q.options || []).map((opt, oIdx) => (
                                    <div key={opt.id || oIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="radio" name={`mcq_correct_${q.id || qIdx}`} checked={!!opt.isCorrect} onChange={() => updateOptionField(qIdx, oIdx, 'isCorrect', true)} style={{ cursor: 'pointer' }} />
                                        <input className="pfm-input" style={{ flex: 1, padding: '4px 8px', fontSize: '0.78rem', borderRadius: '0px', background: 'white' }} placeholder={`Option ${oIdx + 1}`} value={opt.text} onChange={e => updateOptionField(qIdx, oIdx, 'text', e.target.value)} />
                                        <button type="button" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }} onClick={() => removeOption(qIdx, oIdx)}><Trash2 size={13} /></button>
                                    </div>
                                ))}
                                <button type="button" style={{ alignSelf: 'flex-start', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '3px 8px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', borderRadius: '0px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px', textTransform: 'uppercase' }} onClick={() => addOption(qIdx)}><Plus size={10} /> Add Option</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {ic.checkType === 'socratic_dialogue' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#fffbeb', border: '1px solid #fde68a', padding: '12px', borderRadius: '0px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600, width: '90px' }}>AI Persona:</span>
                        <select className="pfm-input" style={{ flex: 1, padding: '4px 8px', borderRadius: '0px' }} value={ic.aiPersonaRole || 'junior_dev'} onChange={e => onUpdateField('aiPersonaRole', e.target.value)}>
                            <option value="junior_dev">Junior Developer (Needs Help)</option>
                            <option value="client">Non-Technical Client (Needs Layman Explanation)</option>
                            <option value="architect">Senior Architect (Challenging Design Choices)</option>
                        </select>
                    </div>
                    <textarea className="pfm-input" rows={2} style={{ padding: '6px 8px', borderRadius: '0px' }} placeholder="Scenario Prompt..." value={localInstructions} onChange={e => { setLocalInstructions(e.target.value); handleDebouncedUpdate('instructions', e.target.value); }} />
                </div>
            )}

            {ic.checkType === 'spot_the_bug' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff1f2', border: '1px solid #fecdd3', padding: '12px', borderRadius: '0px' }}>
                    <input className="pfm-input" style={{ padding: '6px 8px', borderRadius: '0px' }} placeholder="Brief Instruction..." value={localInstructions} onChange={e => { setLocalInstructions(e.target.value); handleDebouncedUpdate('instructions', e.target.value); }} />
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '280px' }}>
                            <label style={{ fontSize: '0.7rem', color: '#be123c', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}><Code size={12} /> Buggy Starter Code</label>
                            <div style={{ border: '1px solid #fecdd3', overflow: 'hidden' }}>
                                <Editor height="180px" defaultLanguage="javascript" theme="vs-dark" value={localBuggy} onChange={(val) => { setLocalBuggy(val || ''); handleDebouncedUpdate('buggyCode', val || ''); }} options={{ minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} />
                            </div>
                        </div>
                        <div style={{ flex: 1, minWidth: '280px' }}>
                            <label style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}><CheckCircle2 size={12} /> Expected Solution Code</label>
                            <div style={{ border: '1px solid #bbf7d0', overflow: 'hidden' }}>
                                <Editor height="180px" defaultLanguage="javascript" theme="vs-dark" value={localSolution} onChange={(val) => { setLocalSolution(val || ''); handleDebouncedUpdate('solutionCode', val || ''); }} options={{ minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {ic.checkType === 'oral_defense' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f3e8ff', border: '1px solid #e9d5ff', padding: '12px', borderRadius: '0px' }}>
                    <textarea className="pfm-input" rows={2} style={{ padding: '6px 8px', borderRadius: '0px' }} placeholder="Oral Prompt..." value={localDefense} onChange={e => { setLocalDefense(e.target.value); handleDebouncedUpdate('defenseQuestion', e.target.value); }} />
                </div>
            )}
        </div>
    );
});

const MemoizedLessonRow = memo(({
    lesson, packageAssessments, loadingAssessments, isPreviewActive, isDragging,
    isLockedInPreview, isFetchingDur, isUploadingAtt, attachmentUploadProgress,
    onDragStart, onDrop, onPreviewSelect, onUpdateDraftLesson, onUpdateAssessmentGateSlot,
    onUpdateInteractiveCheck, onToggleSettings, onRemoveDraftLesson, onVideoUrlChange,
    onFileUploadAttachment, onInlineSave
}: any) => {
    // Keep drag-over state LOCAL so hover animations do NOT re-render the whole modal!
    const [isDragOver, setIsDragOver] = useState(false);

    const ic = lesson.interactiveCheck || { checkType: 'none', instructions: '', isRequiredForCompletion: false, timeLimitSeconds: 0 };
    const gates = lesson.assessmentGates || { formative: { enabled: false }, summative: { enabled: Boolean(lesson.linkedAssessmentId) }, other: { enabled: false } };
    const isVideoUnit = lesson.unitType === 'video';

    const [localTitle, setLocalTitle] = useState(lesson.title || '');
    const [localHtml, setLocalHtml] = useState(lesson.contentHtml || '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { setLocalTitle(lesson.title || ''); }, [lesson.title]);
    useEffect(() => { setLocalHtml(lesson.contentHtml || ''); }, [lesson.contentHtml]);

    const handleDebouncedHtml = (val: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { onUpdateDraftLesson(lesson.id, 'contentHtml', val); }, 600);
    };

    const renderAssessmentSelector = (selectedId: string | null, onSelect: (id: string | null) => void, slotType: 'formative' | 'summative' | 'other') => {
        const formatives = packageAssessments.filter((a: any) => ['formative', 'Developmental Activity', 'Practice Set'].includes(a.type));
        const summatives = packageAssessments.filter((a: any) => ['summative', 'Practical Observation', 'Workplace Logbook'].includes(a.type));
        const others = packageAssessments.filter((a: any) => !formatives.includes(a) && !summatives.includes(a));

        return (
            <select
                className="pfm-input"
                style={{ width: '100%', padding: '6px 8px', borderRadius: '0px', background: '#ffffff', color: '#0f172a' }}
                value={selectedId || ''}
                onChange={e => onSelect(e.target.value.trim() || null)}
                disabled={loadingAssessments}
            >
                <option value="">-- Select Assessment Instrument --</option>
                {slotType === 'formative' && formatives.length > 0 && (
                    <optgroup label="📋 Formative Assessments & Practice Drills">
                        {formatives.map((ast: any) => (
                            <option key={ast.id} value={ast.id}>[{ast.moduleType?.toUpperCase() || 'KM'}] {ast.title} ({ast.totalMarks || 0} Marks)</option>
                        ))}
                    </optgroup>
                )}
                {slotType === 'summative' && summatives.length > 0 && (
                    <optgroup label="🏆 Formal Summative Assessments & FISA">
                        {summatives.map((ast: any) => (
                            <option key={ast.id} value={ast.id}>[{ast.moduleType?.toUpperCase() || 'KM'}] {ast.title} ({ast.totalMarks || 0} Marks)</option>
                        ))}
                    </optgroup>
                )}
                {slotType === 'other' && others.length > 0 && (
                    <optgroup label="💼 Assignments & Project Tasks">
                        {others.map((ast: any) => (
                            <option key={ast.id} value={ast.id}>[{ast.type?.toUpperCase() || 'TASK'}] {ast.title} ({ast.totalMarks || 0} Marks)</option>
                        ))}
                    </optgroup>
                )}
            </select>
        );
    };

    return (
        <div
            draggable
            onDragStart={(e) => {
                e.stopPropagation();
                onDragStart(lesson.id, e);
            }}
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(true);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (!isDragOver) setIsDragOver(true);
            }}
            onDragLeave={(e) => {
                e.stopPropagation();
                // Prevent children (inputs, badges, buttons) from triggering false dragleaves
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setIsDragOver(false);
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
                const droppedId = e.dataTransfer ? e.dataTransfer.getData('text/plain') : undefined;
                onDrop(lesson.id, droppedId);
            }}
            style={{
                display: 'flex', flexDirection: 'column', gap: '8px',
                background: isPreviewActive ? '#f0f9ff' : 'white',
                padding: '8px', borderRadius: '0px',
                border: `1px solid ${isDragOver ? '#0284c7' : isPreviewActive ? '#38bdf8' : '#e2e8f0'}`,
                borderTop: isDragOver ? '3px solid #0284c7' : undefined,
                opacity: isDragging ? 0.35 : 1,
                marginBottom: '8px',
                transition: 'border 0.05s ease', cursor: 'grab'
            }}
            onClick={() => onPreviewSelect(lesson.id)}
        >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ cursor: 'grab', color: '#94a3b8', display: 'flex', alignItems: 'center' }} title="Drag to reorder lesson">
                    <GripVertical size={16} />
                </div>

                <input
                    className="pfm-input"
                    style={{ width: '55px', textAlign: 'center', padding: '4px', borderRadius: '0px', fontWeight: 700, flexShrink: 0 }}
                    type="number"
                    step="any"
                    placeholder="#"
                    value={lesson.orderIndex ?? ''}
                    onChange={e => {
                        const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                        onUpdateDraftLesson(lesson.id, 'orderIndex', val);
                    }}
                />

                <input
                    className="pfm-input"
                    style={{ flex: 1, padding: '4px 8px', fontWeight: isPreviewActive ? 700 : 400, borderRadius: '0px', minWidth: '140px' }}
                    placeholder="Lesson Title"
                    value={localTitle}
                    onChange={e => setLocalTitle(e.target.value)}
                    onBlur={() => onUpdateDraftLesson(lesson.id, 'title', localTitle)}
                />

                {ic.checkType && ic.checkType !== 'none' && (
                    <Tooltip content="Includes Stage 2 In-Lesson Interactive Check" placement="top">
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px', textTransform: 'uppercase' }}>
                            <Zap size={10} fill="#b45309" /> Quiz
                        </span>
                    </Tooltip>
                )}

                {gates.formative?.enabled && gates.formative?.assessmentId && (
                    <Tooltip content="Includes Formative Practice Gate" placement="top">
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', padding: '2px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px', textTransform: 'uppercase' }}>
                            <ShieldCheck size={10} /> Form
                        </span>
                    </Tooltip>
                )}

                {gates.summative?.enabled && gates.summative?.assessmentId && (
                    <Tooltip content="Includes Formal Summative Exam Gate" placement="top">
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #e9d5ff', padding: '2px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px', textTransform: 'uppercase' }}>
                            <Award size={10} /> Summ
                        </span>
                    </Tooltip>
                )}

                {gates.other?.enabled && gates.other?.assessmentId && (
                    <Tooltip content="Includes Assignment / Project Gate" placement="top">
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px', textTransform: 'uppercase' }}>
                            <ClipboardCheck size={10} /> Task
                        </span>
                    </Tooltip>
                )}

                {isLockedInPreview && (
                    <Tooltip content="This lesson will be locked for learners until preceding gates are passed." placement="top">
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                            <Lock size={10} /> Locked
                        </span>
                    </Tooltip>
                )}

                {lesson.isRequiredForNextUnit && (
                    <Tooltip content="Progression Gate: Must be completed to unlock subsequent lessons." placement="top">
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                            <CheckCircle2 size={10} /> Gate
                        </span>
                    </Tooltip>
                )}

                {lesson._justSaved && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: '0px', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <CheckCircle2 size={12} color="#166534" /> Saved
                    </span>
                )}
                {!lesson._isDraft && !lesson._justSaved && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '3px 6px', borderRadius: '0px', flexShrink: 0 }}>
                        Synced
                    </span>
                )}
                {lesson._isDraft && !lesson._justSaved && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '3px 6px', borderRadius: '0px', flexShrink: 0 }}>
                        Draft
                    </span>
                )}

                <select className="pfm-input" style={{ width: '95px', padding: '4px', borderRadius: '0px', flexShrink: 0 }} value={lesson.unitType} onChange={e => onUpdateDraftLesson(lesson.id, 'unitType', e.target.value)}>
                    <option value="video">Video</option>
                    <option value="reading">Reading</option>
                    <option value="interactive_code">Code</option>
                </select>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0, border: '1px solid #cbd5e1', background: isVideoUnit ? '#f1f5f9' : '#ffffff', paddingRight: '6px', height: '28px' }}>
                    <input
                        className="pfm-input"
                        style={{ width: '38px', padding: '2px 2px 2px 4px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', color: '#0f172a' }}
                        type="number"
                        placeholder="0"
                        value={lesson.estimatedMinutes ?? ''}
                        readOnly={isVideoUnit}
                        onChange={e => {
                            if (!isVideoUnit) {
                                onUpdateDraftLesson(lesson.id, 'estimatedMinutes', parseInt(e.target.value) || 0);
                            }
                        }}
                        title={isVideoUnit ? "Video duration is automatically detected" : "Estimated completion time in minutes"}
                    />
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', marginLeft: '3px', userSelect: 'none' }}>
                        mins
                    </span>
                    {isFetchingDur && (
                        <Loader2 size={12} className="pfm-spin" style={{ color: '#0284c7', marginLeft: '4px' }} />
                    )}
                </div>

                <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSettings(lesson.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: lesson._expanded ? '#0ea5e9' : '#64748b', flexShrink: 0 }} title="Configure Settings">
                    <Settings size={16} />
                </button>
                <button type="button" className="pfm-remove-btn" onClick={(e) => { e.stopPropagation(); onRemoveDraftLesson(lesson.id); }} title="Delete Lesson" style={{ flexShrink: 0 }}>
                    <Trash2 size={16} />
                </button>
            </div>

            {lesson._expanded && (
                <div className="animate-fade-in" style={{ padding: '16px', background: '#f8fafc', borderRadius: '0px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }} onClick={e => e.stopPropagation()}>
                    {lesson.unitType === 'video' && (
                        <div>
                            <div className="lfm-section-hdr" style={{ margin: '0 0 8px 0', border: 'none', padding: 0 }}><Video size={13} /> Video Source &amp; Rules</div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    className="pfm-input"
                                    style={{ flex: 1, padding: '6px 8px', borderRadius: '0px' }}
                                    placeholder="Video URL (Vimeo, YouTube, MP4)"
                                    value={lesson.videoUrl || ''}
                                    onChange={e => onVideoUrlChange(lesson.id, e.target.value)}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0px', padding: '0 8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Req %:</span>
                                    <input className="pfm-input" style={{ width: '50px', border: 'none', padding: '4px 0', textAlign: 'center', borderRadius: '0px' }} type="number" value={lesson.requiredWatchPercentage || 90} onChange={e => onUpdateDraftLesson(lesson.id, 'requiredWatchPercentage', parseInt(e.target.value) || 0)} min={0} max={100} />
                                </div>
                            </div>
                        </div>
                    )}

                    {lesson.unitType === 'reading' && (
                        <div>
                            <div className="lfm-section-hdr" style={{ margin: '0 0 8px 0', border: 'none', padding: 0 }}><FileText size={13} /> Reading Guide Body Content (Rich Text)</div>
                            <div style={{ background: 'white', border: '1px solid #cbd5e1', color: '#0f172a' }}>
                                <ReactQuill
                                    theme="snow"
                                    value={localHtml}
                                    onChange={(val) => {
                                        setLocalHtml(val);
                                        handleDebouncedHtml(val);
                                    }}
                                    modules={QUILL_MODULES}
                                />
                            </div>
                        </div>
                    )}

                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
                        <div className="lfm-section-hdr" style={{ margin: '0 0 8px 0', border: 'none', padding: 0 }}>
                            <Sparkles size={13} /> In-Lesson Interactive Check (Stage 2 Micro-Verification)
                        </div>
                        <MemoizedCheckpointEditor ic={ic} onUpdateField={(field, val) => onUpdateInteractiveCheck(lesson.id, field, val)} />
                    </div>

                    <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '12px' }}>
                        <div className="lfm-section-hdr" style={{ margin: '0 0 8px 0', border: 'none', padding: 0 }}>
                            <Award size={13} /> Formal Assessment &amp; Gating Configuration
                        </div>
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.72rem', color: '#64748b' }}>
                            Link accredited instruments authored in the Assessment Centre. Enable only the slots required for this unit.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ background: gates.formative?.enabled ? '#eff6ff' : '#ffffff', border: `1px solid ${gates.formative?.enabled ? '#bfdbfe' : '#e2e8f0'}`, padding: '10px 12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 800, fontSize: '0.78rem', color: '#1e3a8a' }}>
                                    <input
                                        type="checkbox"
                                        checked={!!gates.formative?.enabled}
                                        onChange={e => onUpdateAssessmentGateSlot(lesson.id, 'formative', 'enabled', e.target.checked)}
                                        style={{ accentColor: '#0284c7' }}
                                    />
                                    <ShieldCheck size={14} color="#0284c7" /> Link Formative Assessment Gate (Practice Drill)
                                </label>

                                {gates.formative?.enabled && (
                                    <div className="animate-fade-in" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '22px' }}>
                                        {renderAssessmentSelector(gates.formative.assessmentId, (id) => onUpdateAssessmentGateSlot(lesson.id, 'formative', 'assessmentId', id), 'formative')}
                                        <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#0f172a' }}>
                                            <input
                                                type="checkbox"
                                                checked={gates.formative.requirePassToUnlockSummative !== false}
                                                onChange={e => onUpdateAssessmentGateSlot(lesson.id, 'formative', 'requirePassToUnlockSummative', e.target.checked)}
                                            />
                                            Must achieve passing grade (≥ Pass Mark) before learner can attempt Summative Exam
                                        </label>
                                    </div>
                                )}
                            </div>

                            <div style={{ background: gates.summative?.enabled ? '#faf5ff' : '#ffffff', border: `1px solid ${gates.summative?.enabled ? '#e9d5ff' : '#e2e8f0'}`, padding: '10px 12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 800, fontSize: '0.78rem', color: '#581c87' }}>
                                    <input
                                        type="checkbox"
                                        checked={!!gates.summative?.enabled}
                                        onChange={e => onUpdateAssessmentGateSlot(lesson.id, 'summative', 'enabled', e.target.checked)}
                                        style={{ accentColor: '#7c3aed' }}
                                    />
                                    <Award size={14} color="#7c3aed" /> Link Summative Assessment Gate (Accredited Exam / FISA)
                                </label>

                                {gates.summative?.enabled && (
                                    <div className="animate-fade-in" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '22px' }}>
                                        {renderAssessmentSelector(gates.summative.assessmentId, (id) => onUpdateAssessmentGateSlot(lesson.id, 'summative', 'assessmentId', id), 'summative')}
                                        <div style={{ display: 'flex', gap: '16px', background: '#f3e8ff', border: '1px solid #d8b4fe', padding: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6b21a8', textTransform: 'uppercase' }}>Next Unit Unlocks:</span>
                                            <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#0f172a' }}>
                                                <input
                                                    type="radio"
                                                    name={`sum_unlock_${lesson.id}`}
                                                    checked={gates.summative.unlockNextOn !== 'grading'}
                                                    onChange={() => onUpdateAssessmentGateSlot(lesson.id, 'summative', 'unlockNextOn', 'submission')}
                                                />
                                                <strong>Upon Submission</strong> (Maintains momentum; grading is async)
                                            </label>
                                            <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#0f172a' }}>
                                                <input
                                                    type="radio"
                                                    name={`sum_unlock_${lesson.id}`}
                                                    checked={gates.summative.unlockNextOn === 'grading'}
                                                    onChange={() => onUpdateAssessmentGateSlot(lesson.id, 'summative', 'unlockNextOn', 'grading')}
                                                />
                                                <strong>Only After Graded Competent (C)</strong> (Hard block)
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ background: gates.other?.enabled ? '#f8fafc' : '#ffffff', border: `1px solid ${gates.other?.enabled ? '#cbd5e1' : '#e2e8f0'}`, padding: '10px 12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 800, fontSize: '0.78rem', color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={!!gates.other?.enabled}
                                        onChange={e => onUpdateAssessmentGateSlot(lesson.id, 'other', 'enabled', e.target.checked)}
                                        style={{ accentColor: '#475569' }}
                                    />
                                    <ClipboardCheck size={14} color="#475569" /> Link Assignment / Project Capstone Gate
                                </label>

                                {gates.other?.enabled && (
                                    <div className="animate-fade-in" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '22px' }}>
                                        {renderAssessmentSelector(gates.other.assessmentId, (id) => onUpdateAssessmentGateSlot(lesson.id, 'other', 'assessmentId', id), 'other')}
                                        <div style={{ display: 'flex', gap: '16px', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Next Unit Unlocks:</span>
                                            <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#0f172a' }}>
                                                <input
                                                    type="radio"
                                                    name={`oth_unlock_${lesson.id}`}
                                                    checked={gates.other.unlockNextOn !== 'grading'}
                                                    onChange={() => onUpdateAssessmentGateSlot(lesson.id, 'other', 'unlockNextOn', 'submission')}
                                                />
                                                <strong>Upon Submission</strong>
                                            </label>
                                            <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#0f172a' }}>
                                                <input
                                                    type="radio"
                                                    name={`oth_unlock_${lesson.id}`}
                                                    checked={gates.other.unlockNextOn === 'grading'}
                                                    onChange={() => onUpdateAssessmentGateSlot(lesson.id, 'other', 'unlockNextOn', 'grading')}
                                                />
                                                <strong>Only After Graded Competent (C)</strong>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '10px' }}>
                        <div className="lfm-section-hdr" style={{ margin: '0 0 6px 0', border: 'none', padding: 0 }}>
                            <Paperclip size={13} /> Supplementary Assets &amp; Downloadable Attachments (PDFs, Excel, Docs, ZIPs)
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                background: '#0ea5e9', color: 'white', padding: '6px 12px',
                                fontSize: '0.72rem', fontWeight: 800, cursor: isUploadingAtt ? 'not-allowed' : 'pointer',
                                fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                            }}>
                                {isUploadingAtt ? <Loader2 size={13} className="pfm-spin" /> : <UploadCloud size={13} />}
                                {isUploadingAtt ? `Uploading (${attachmentUploadProgress}%)...` : 'Upload File to Storage'}
                                <input
                                    type="file"
                                    hidden
                                    disabled={isUploadingAtt}
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv"
                                    onChange={e => {
                                        const f = e.target.files?.[0];
                                        if (f) onFileUploadAttachment(lesson.id, f);
                                        e.target.value = '';
                                    }}
                                />
                            </label>

                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>OR LINK:</span>

                            <input className="pfm-input" style={{ flex: 1, minWidth: '120px', padding: '5px 8px', fontSize: '0.75rem', borderRadius: '0px' }} placeholder="Name (e.g. Lab_Guide.pdf)" id={`att_name_${lesson.id}`} />
                            <input className="pfm-input" style={{ flex: 1.5, minWidth: '140px', padding: '5px 8px', fontSize: '0.75rem', borderRadius: '0px' }} placeholder="Download URL (https://...)" id={`att_url_${lesson.id}`} />
                            <input className="pfm-input" style={{ flex: 1.8, minWidth: '160px', padding: '5px 8px', fontSize: '0.75rem', borderRadius: '0px' }} placeholder="Description / Purpose (optional)..." id={`att_desc_${lesson.id}`} />
                            <button
                                type="button"
                                onClick={() => {
                                    const nameInput = document.getElementById(`att_name_${lesson.id}`) as HTMLInputElement;
                                    const urlInput = document.getElementById(`att_url_${lesson.id}`) as HTMLInputElement;
                                    const descInput = document.getElementById(`att_desc_${lesson.id}`) as HTMLInputElement;
                                    if (nameInput?.value && urlInput?.value) {
                                        const newAtt: LessonAttachment = {
                                            id: generateUniqueId('att'),
                                            name: nameInput.value,
                                            url: urlInput.value,
                                            fileType: nameInput.value.split('.').pop() || 'file',
                                            description: descInput?.value || '',
                                            uploadedAt: new Date().toISOString()
                                        };
                                        const updatedAttachments = [...(lesson.attachments || []), newAtt];
                                        onUpdateDraftLesson(lesson.id, 'attachments', updatedAttachments);
                                        nameInput.value = '';
                                        urlInput.value = '';
                                        if (descInput) descInput.value = '';
                                    }
                                }}
                                style={{ background: '#0284c7', color: 'white', border: 'none', padding: '6px 12px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', borderRadius: '0px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
                            >
                                + Add Link
                            </button>
                        </div>

                        {lesson.attachments && lesson.attachments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                {lesson.attachments.map((att: LessonAttachment, attIdx: number) => {
                                    const ext = (att.fileType || att.name.split('.').pop() || 'file').toLowerCase();
                                    const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(ext);
                                    const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'zip'].includes(ext);

                                    return (
                                        <div
                                            key={att.id || attIdx}
                                            style={{
                                                background: '#ffffff', border: '1px solid #cbd5e1', borderLeft: '3px solid #0284c7',
                                                padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                                    {isSpreadsheet ? <FileSpreadsheet size={15} color="#059669" /> : isCode ? <FileCode size={15} color="#7c3aed" /> : <FileText size={15} color="#0284c7" />}
                                                    <span style={{ fontWeight: 800, fontSize: '0.78rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {att.name}
                                                    </span>
                                                    <span style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                                                        ({ext.toUpperCase()})
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                                    <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', display: 'flex', alignItems: 'center' }} title="Test Download Link">
                                                        <ExternalLink size={13} />
                                                    </a>
                                                    <span
                                                        style={{ cursor: 'pointer', color: '#ef4444', display: 'inline-flex', alignItems: 'center' }}
                                                        onClick={() => {
                                                            const filtered = (lesson.attachments || []).filter((a: LessonAttachment) => a.id !== att.id);
                                                            onUpdateDraftLesson(lesson.id, 'attachments', filtered);
                                                        }}
                                                        title="Remove Attachment"
                                                    >
                                                        <X size={14} />
                                                    </span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Info size={12} color="#64748b" style={{ flexShrink: 0 }} />
                                                <input
                                                    className="pfm-input"
                                                    type="text"
                                                    placeholder="Add brief description or learner instructions..."
                                                    value={att.description || ''}
                                                    onChange={(e) => {
                                                        const newDesc = e.target.value;
                                                        const updated = (lesson.attachments || []).map((a: LessonAttachment, idx: number) =>
                                                            idx === attIdx ? { ...a, description: newDesc } : a
                                                        );
                                                        onUpdateDraftLesson(lesson.id, 'attachments', updated);
                                                    }}
                                                    style={{ flex: 1, fontSize: '0.72rem', padding: '3px 8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0px', color: '#334155' }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px' }}>
                        <div>
                            <Tooltip content="Prerequisite Gate: Student must complete this lesson before unlocking the next." placement="top">
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    <Lock size={11} style={{ display: 'inline', marginRight: '2px' }} /> Unit-Level Progression Gate
                                </label>
                            </Tooltip>
                            <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#0f172a' }}>
                                <input type="checkbox" checked={lesson.isRequiredForNextUnit || false} onChange={e => onUpdateDraftLesson(lesson.id, 'isRequiredForNextUnit', e.target.checked)} />
                                Make this a Progression Gate (Locks next lessons)
                            </label>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                <Tag size={11} style={{ display: 'inline', marginRight: '2px' }} /> Lesson Tags / Keywords
                            </label>
                            <TagSelector selectedTags={lesson.tags || []} onChange={newTags => onUpdateDraftLesson(lesson.id, 'tags', newTags)} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <button
                            type="button"
                            className="mlab-btn mlab-btn--primary mlab-btn--sm"
                            style={{ borderRadius: '0px', minWidth: '120px', justifyContent: 'center' }}
                            onClick={() => onInlineSave(lesson.id)}
                            disabled={lesson._isSaving}
                        >
                            {lesson._isSaving ? <><Loader2 size={12} className="pfm-spin" /> Saving...</> : <><Save size={12} /> Save Lesson</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    // Ultra-fast comparison: NO JSON.stringify!
    if (prev.lesson.id !== next.lesson.id) return false;
    if (prev.lesson._expanded !== next.lesson._expanded) return false;
    if (prev.isPreviewActive !== next.isPreviewActive) return false;
    if (prev.isDragging !== next.isDragging) return false;
    if (prev.isLockedInPreview !== next.isLockedInPreview) return false;
    if (prev.isFetchingDur !== next.isFetchingDur) return false;
    if (prev.isUploadingAtt !== next.isUploadingAtt) return false;
    if (prev.attachmentUploadProgress !== next.attachmentUploadProgress) return false;
    if (prev.lesson !== next.lesson) return false;
    return true;
});

export const ContentBuilderModal: React.FC<ContentBuilderModalProps> = ({
    activeContainer,
    activeFramework,
    linkedTemplate,
    initialUnits,
    isMockMode,
    onClose,
    onSaveBatch
}) => {
    const toast = useToast();

    // 1. STORAGE KEY: Safely captures "all" or specific container ID
    const DRAFT_STORAGE_KEY = `mlab_builder_draft_${activeFramework}_${activeContainer?.id || 'all'}`;

    // 2. SYNCHRONOUS CACHE RETRIEVAL (Zero latency, runs before first frame renders)
    const cachedDraft = useMemo(() => {
        try {
            const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const ageHours = (Date.now() - new Date(parsed.savedAt).getTime()) / (1000 * 60 * 60);
            if (ageHours > 168) { // Expire after 7 days
                localStorage.removeItem(DRAFT_STORAGE_KEY);
                return null;
            }
            return parsed;
        } catch (e) {
            return null;
        }
    }, [DRAFT_STORAGE_KEY]);

    // Toast feedback if draft was restored
    const hasNotifiedRestore = useRef(false);
    useEffect(() => {
        if (cachedDraft && !hasNotifiedRestore.current) {
            hasNotifiedRestore.current = true;
            toast.info("Restored unsaved working session from local draft backup.");
        }
    }, [cachedDraft, toast]);

    // FETCH FORMAL SETA / QCTO ASSESSMENTS FOR LINKING
    const [packageAssessments, setPackageAssessments] = useState<any[]>([]);
    const [loadingAssessments, setLoadingAssessments] = useState<boolean>(false);

    useEffect(() => {
        let isMounted = true;
        const fetchPackageAssessments = async () => {
            setLoadingAssessments(true);
            try {
                const q = query(collection(db, 'assessments'));
                const snap = await getDocs(q);
                if (isMounted) {
                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    setPackageAssessments(list);
                }
            } catch (err) {
                console.error('[ContentBuilderModal] Error fetching assessments:', err);
            } finally {
                if (isMounted) setLoadingAssessments(false);
            }
        };
        fetchPackageAssessments();
        return () => { isMounted = false; };
    }, []);

    // INITIALIZE DRAFT UNITS (Restores cached draft immediately if present!)
    const [draftUnits, setDraftUnits] = useState<ExtendedLearningUnitWithStatus[]>(() => {
        if (cachedDraft?.draftUnits?.length) {
            return cachedDraft.draftUnits;
        }
        return initialUnits.map(unit => {
            const ext = unit as ExtendedLearningUnitWithStatus;
            const resolvedAssessmentId = ext.linkedAssessmentId ||
                (unit as any).assessmentId ||
                (unit as any).formalAssessmentId ||
                (typeof (unit as any).linkedAssessment === 'string' ? (unit as any).linkedAssessment : null) ||
                null;

            const existingCheck = unit.interactiveCheck ? {
                ...unit.interactiveCheck,
                buggyCode: sanitizeCodeInput(unit.interactiveCheck.buggyCode),
                solutionCode: sanitizeCodeInput(unit.interactiveCheck.solutionCode),
                instructions: sanitizeCodeInput(unit.interactiveCheck.instructions)
            } : undefined;

            if (existingCheck && existingCheck.checkType === 'mcq') {
                if (!existingCheck.mcqQuestions || existingCheck.mcqQuestions.length === 0) {
                    if (existingCheck.mcqQuestion) {
                        existingCheck.mcqQuestions = [{
                            id: generateUniqueId('mcq_q'),
                            question: existingCheck.mcqQuestion,
                            options: existingCheck.mcqOptions || []
                        }];
                    } else {
                        existingCheck.mcqQuestions = [createDefaultMCQQuestion(1)];
                    }
                }
            }

            const defaultGates: AssessmentGatesConfig = unit.assessmentGates || {
                formative: {
                    enabled: false,
                    assessmentId: null,
                    requirePassToUnlockSummative: true
                },
                summative: {
                    enabled: Boolean(resolvedAssessmentId),
                    assessmentId: resolvedAssessmentId,
                    unlockNextOn: (ext.unlinkedPolicy === 'hard_gate') ? 'grading' : 'submission'
                },
                other: {
                    enabled: false,
                    assessmentId: null,
                    unlockNextOn: 'submission'
                }
            };

            return {
                ...unit,
                linkedAssessmentId: resolvedAssessmentId,
                unlinkedPolicy: ext.unlinkedPolicy || 'soft_gate',
                interactiveCheck: existingCheck,
                assessmentGates: defaultGates
            };
        });
    });

    const [deletedIds, setDeletedIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    const [fetchingDurationId, setFetchingDurationId] = useState<string | null>(null);
    const [uploadingAttachmentForId, setUploadingAttachmentForId] = useState<string | null>(null);
    const [attachmentUploadProgress, setAttachmentUploadProgress] = useState<number>(0);

    const [collapsedSprintIds, setCollapsedSprintIds] = useState<Set<string>>(new Set());
    const [collapsedDayIds, setCollapsedDayIds] = useState<Set<string>>(new Set());

    const [draggedSprintId, setDraggedSprintId] = useState<string | null>(null);
    const [dragOverSprintId, setDragOverSprintId] = useState<string | null>(null);

    const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
    const [dragOverDayId, setDragOverDayId] = useState<string | null>(null);

    const [draggedLessonId, setDraggedLessonId] = useState<string | null>(null);
    const draggedLessonIdRef = useRef<string | null>(null);
    const handleLessonDragStart = useCallback((id: string, e: any) => {
        draggedLessonIdRef.current = id;
        setDraggedLessonId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    }, []);

    const [checkpointScope, setCheckpointScope] = useState<'per_lesson' | 'per_day' | 'per_sprint'>(() => {
        if (cachedDraft?.checkpointScope) return cachedDraft.checkpointScope;
        return activeContainer?.checkpointMetadata?.checkpointScope || activeContainer?.checkpointScope || 'per_lesson';
    });

    const [previewVideoUrl, setPreviewVideoUrl] = useState<string>(() => {
        if (cachedDraft?.previewVideoUrl !== undefined) return cachedDraft.previewVideoUrl;
        return activeContainer?.previewVideoUrl || activeContainer?.checkpointMetadata?.previewVideoUrl || '';
    });

    const [illustrationType, setIllustrationType] = useState<string>(() => {
        if (cachedDraft?.illustrationType) return cachedDraft.illustrationType;
        return activeContainer?.illustrationType || activeContainer?.checkpointMetadata?.illustrationType || 'code';
    });

    const [themeColor, setThemeColor] = useState<string>(() => {
        if (cachedDraft?.themeColor) return cachedDraft.themeColor;
        return activeContainer?.themeColor || activeContainer?.checkpointMetadata?.themeColor || '#0284c7';
    });

    const [courseLevel, setCourseLevel] = useState<string>(() => {
        if (cachedDraft?.courseLevel) return cachedDraft.courseLevel;
        return activeContainer?.level || activeContainer?.checkpointMetadata?.courseLevel || 'beginner';
    });

    const [courseDescription, setCourseDescription] = useState<string>(() => {
        if (cachedDraft?.courseDescription !== undefined) return cachedDraft.courseDescription;
        return activeContainer?.description || activeContainer?.checkpointMetadata?.courseDescription || '';
    });

    const [prerequisites, setPrerequisites] = useState<string[]>(() => {
        if (cachedDraft?.prerequisites) return cachedDraft.prerequisites;
        return activeContainer?.prerequisites || activeContainer?.checkpointMetadata?.prerequisites || [];
    });

    const [learningOutcomes, setLearningOutcomes] = useState<string[]>(() => {
        if (cachedDraft?.learningOutcomes) return cachedDraft.learningOutcomes;
        return activeContainer?.learningOutcomes || activeContainer?.checkpointMetadata?.learningOutcomes || [];
    });

    const [targetAudience, setTargetAudience] = useState<string[]>(() => {
        if (cachedDraft?.targetAudience) return cachedDraft.targetAudience;
        return activeContainer?.targetAudience || activeContainer?.checkpointMetadata?.targetAudience || [];
    });

    const [isCertificateAwarded, setIsCertificateAwarded] = useState<boolean>(() => {
        if (cachedDraft?.isCertificateAwarded !== undefined) return cachedDraft.isCertificateAwarded;
        return activeContainer?.isCertificateAwarded ?? activeContainer?.checkpointMetadata?.isCertificateAwarded ?? true;
    });

    const [courseTags, setCourseTags] = useState<string[]>(() => {
        if (cachedDraft?.courseTags) return cachedDraft.courseTags;
        return activeContainer?.tags || activeContainer?.checkpointMetadata?.courseTags || [];
    });

    const [courseworkHours, setCourseworkHours] = useState<number>(() => {
        if (cachedDraft?.courseworkHours !== undefined) return cachedDraft.courseworkHours;
        return activeContainer?.courseworkHours || activeContainer?.checkpointMetadata?.courseworkHours || 0;
    });

    const [instructors, setInstructors] = useState<FacilitatorInfo[]>(() => {
        if (cachedDraft?.instructors) return cachedDraft.instructors;
        return activeContainer?.instructors || activeContainer?.checkpointMetadata?.instructors || [
            { name: 'mLab Facilitator Team', role: 'Lead Technical Instructor', initials: 'ML' }
        ];
    });

    const [materialIncludes, setMaterialIncludes] = useState<string[]>(() => {
        if (cachedDraft?.materialIncludes) return cachedDraft.materialIncludes;
        return activeContainer?.materialIncludes || activeContainer?.checkpointMetadata?.materialIncludes || [
            'Hands-on Video Tutorials & Source Code',
            'Downloadable Lab Guides & Asset Packs',
            'Interactive AI Peer Reviews & Quizzes',
            'Industry Certificate of Completion'
        ];
    });

    const initialAccreditation = activeContainer?.defaultAccreditation?.body || activeContainer?.checkpointMetadata?.accreditationBody || activeContainer?.accreditationBody || 'none';
    const isStandardAccreditation = STANDARD_ACCREDITATIONS.some(a => a.value === initialAccreditation);

    const [isAccredited, setIsAccredited] = useState<boolean>(() => {
        if (cachedDraft?.isAccredited !== undefined) return cachedDraft.isAccredited;
        return activeContainer?.defaultAccreditation?.isAccredited ?? activeContainer?.checkpointMetadata?.isAccredited ?? (initialAccreditation !== 'none');
    });

    const [accreditationBody, setAccreditationBody] = useState<string>(() => {
        if (cachedDraft?.accreditationBody) return cachedDraft.accreditationBody;
        return isStandardAccreditation ? initialAccreditation : 'other';
    });

    const [customAccreditationText, setCustomAccreditationText] = useState<string>(() => {
        if (cachedDraft?.customAccreditationText !== undefined) return cachedDraft.customAccreditationText;
        return isStandardAccreditation ? '' : (activeContainer?.defaultAccreditation?.customText || activeContainer?.checkpointMetadata?.customAccreditationText || initialAccreditation);
    });

    const [saqaId, setSaqaId] = useState<string>(() => {
        if (cachedDraft?.saqaId !== undefined) return cachedDraft.saqaId;
        return activeContainer?.defaultAccreditation?.saqaId || '';
    });

    const [nqfLevel, setNqfLevel] = useState<string | number>(() => {
        if (cachedDraft?.nqfLevel !== undefined) return cachedDraft.nqfLevel;
        return activeContainer?.defaultAccreditation?.nqfLevel || 5;
    });

    const [credits, setCredits] = useState<number>(() => {
        if (cachedDraft?.credits !== undefined) return cachedDraft.credits;
        return activeContainer?.defaultAccreditation?.credits || 120;
    });

    const [previewLessonId, setPreviewLessonId] = useState<string | null>(initialUnits[0]?.id || null);

    const totalContentMinutes = useMemo(() => {
        return draftUnits.reduce((acc, unit) => acc + (Number(unit.estimatedMinutes) || 0), 0);
    }, [draftUnits]);

    const totalContentHours = useMemo(() => {
        return Math.round((totalContentMinutes / 60) * 10) / 10;
    }, [totalContentMinutes]);

    const grandTotalHours = useMemo(() => {
        return Math.round((totalContentHours + courseworkHours) * 10) / 10;
    }, [totalContentHours, courseworkHours]);

    const activePreviewUnit = useMemo(() => {
        if (previewLessonId === 'COURSE_PREVIEW') return null;
        return draftUnits.find(u => u.id === previewLessonId) || draftUnits[0] || null;
    }, [draftUnits, previewLessonId]);

    const [secamStructure, setSecamStructure] = useState<{
        id: string;
        title: string;
        sprintCheckpoint?: InteractiveCheckConfig;
        days: { id: string; title: string; dayCheckpoint?: InteractiveCheckConfig }[];
    }[]>(() => {
        if (cachedDraft?.secamStructure) return cachedDraft.secamStructure;
        return [];
    });

    const [qctoModuleCheckpoints, setQctoModuleCheckpoints] = useState<Record<string, InteractiveCheckConfig>>(() => {
        if (cachedDraft?.qctoModuleCheckpoints) return cachedDraft.qctoModuleCheckpoints;
        return {};
    });

    const [qctoTopicCheckpoints, setQctoTopicCheckpoints] = useState<Record<string, InteractiveCheckConfig>>(() => {
        if (cachedDraft?.qctoTopicCheckpoints) return cachedDraft.qctoTopicCheckpoints;
        return {};
    });

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
    }>({ isOpen: false, type: 'warning', title: '', message: '' });

    const mockUnlockedUnitIds = useMemo(() => {
        const unlocked = new Set<string>();
        let activeLockEnforced = false;

        const sorted = [...draftUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        for (const u of sorted) {
            if (!activeLockEnforced) {
                unlocked.add(u.id);
            }
            const gates = u.assessmentGates;
            const requiresNextLock = u.isRequiredForNextUnit === true ||
                Boolean(
                    (gates?.summative?.enabled && gates?.summative?.unlockNextOn === 'grading') ||
                    (gates?.other?.enabled && gates?.other?.unlockNextOn === 'grading') ||
                    (u.linkedAssessmentId && u.unlinkedPolicy === 'hard_gate')
                );

            if (requiresNextLock) {
                activeLockEnforced = true;
            }
        }
        return unlocked;
    }, [draftUnits]);

    useEffect(() => {
        // Do not overwrite sprints/days if we already restored a cached working draft
        if (cachedDraft?.secamStructure?.length) return;

        const unitsSprintMap = new Map<string, Set<string>>();
        initialUnits.forEach(u => {
            if (u.sprintTitle) {
                if (!unitsSprintMap.has(u.sprintTitle)) {
                    unitsSprintMap.set(u.sprintTitle, new Set());
                }
                if (u.dayOrLessonTitle) {
                    unitsSprintMap.get(u.sprintTitle)!.add(u.dayOrLessonTitle);
                }
            }
        });

        if (activeContainer?.checkpointMetadata?.secamStructure?.length > 0) {
            const metaStructure = activeContainer.checkpointMetadata.secamStructure;
            const existingSprintTitles = new Set(metaStructure.map((s: any) => s.title));

            const mergedStructure = metaStructure.map((s: any) => ({
                ...s,
                id: s.id || generateUniqueId('sprint'),
                days: (s.days || []).map((d: any) => ({
                    ...d,
                    id: d.id || generateUniqueId('day')
                }))
            }));

            unitsSprintMap.forEach((daysSet, sprintTitle) => {
                if (!existingSprintTitles.has(sprintTitle)) {
                    mergedStructure.push({
                        id: generateUniqueId('sprint'),
                        title: sprintTitle,
                        days: Array.from(daysSet).map(dayTitle => ({
                            id: generateUniqueId('day'),
                            title: dayTitle
                        }))
                    });
                } else {
                    const sprintObj = mergedStructure.find((s: any) => s.title === sprintTitle);
                    if (sprintObj) {
                        const existingDayTitles = new Set((sprintObj.days || []).map((d: any) => d.title));
                        daysSet.forEach(dayTitle => {
                            if (!existingDayTitles.has(dayTitle)) {
                                sprintObj.days.push({
                                    id: generateUniqueId('day'),
                                    title: dayTitle
                                });
                            }
                        });
                    }
                }
            });

            setSecamStructure(mergedStructure);
        } else if (activeFramework === 'secam') {
            const newStructure: typeof secamStructure = [];
            unitsSprintMap.forEach((daysSet, sprintTitle) => {
                newStructure.push({
                    id: generateUniqueId('sprint'),
                    title: sprintTitle,
                    days: Array.from(daysSet).map(dayTitle => ({
                        id: generateUniqueId('day'),
                        title: dayTitle
                    }))
                });
            });
            setSecamStructure(newStructure);
        }
    }, [initialUnits, activeFramework, activeContainer]);

    useEffect(() => {
        let isMounted = true;
        const processInitialVideoDurations = async () => {
            const videoUnits = initialUnits.filter(u => u.unitType === 'video' && u.videoUrl && u.videoUrl.trim().length > 10);
            for (const unit of videoUnits) {
                if (!isMounted) break;
                setFetchingDurationId(unit.id);
                try {
                    const dur = await fetchVideoDurationMinutes(unit.videoUrl!);
                    if (dur && dur > 0 && isMounted) {
                        updateDraftLesson(unit.id, 'estimatedMinutes', dur);
                    }
                } catch (err) {
                    console.error(`[VideoFetch] Failed duration check for "${unit.title}":`, err);
                }
            }
            if (isMounted) setFetchingDurationId(null);
        };
        processInitialVideoDurations();
        return () => { isMounted = false; };
    }, []);

    // Prevent accidental tab reload / close when changes exist
    // Warn before closing tab if there are unsaved edits
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChanges()) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [draftUnits, secamStructure, courseDescription, prerequisites, learningOutcomes, courseTags]);

    // Continuously persist edits to localStorage (Runs on ANY container, debounced)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const draftSession = {
                draftUnits,
                secamStructure,
                qctoModuleCheckpoints,
                qctoTopicCheckpoints,
                checkpointScope,
                previewVideoUrl,
                illustrationType,
                themeColor,
                courseLevel,
                courseDescription,
                prerequisites,
                learningOutcomes,
                targetAudience,
                isCertificateAwarded,
                courseTags,
                courseworkHours,
                instructors,
                materialIncludes,
                isAccredited,
                accreditationBody,
                customAccreditationText,
                saqaId,
                nqfLevel,
                credits,
                savedAt: new Date().toISOString()
            };

            try {
                localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftSession));
            } catch (e) {
                console.warn("localStorage quota exceeded for draft caching", e);
            }
        }, 800);

        return () => clearTimeout(timeoutId);
    }, [
        DRAFT_STORAGE_KEY, draftUnits, secamStructure, qctoModuleCheckpoints, qctoTopicCheckpoints,
        checkpointScope, previewVideoUrl, illustrationType, themeColor, courseLevel, courseDescription,
        prerequisites, learningOutcomes, targetAudience, isCertificateAwarded, courseTags, courseworkHours,
        instructors, materialIncludes, isAccredited, accreditationBody, customAccreditationText, saqaId,
        nqfLevel, credits
    ]);


    const toggleSprintCollapse = (sprintId: string) => {
        setCollapsedSprintIds(prev => {
            const next = new Set(prev);
            if (next.has(sprintId)) next.delete(sprintId); else next.add(sprintId);
            return next;
        });
    };

    const toggleDayCollapse = (dayId: string) => {
        setCollapsedDayIds(prev => {
            const next = new Set(prev);
            if (next.has(dayId)) next.delete(dayId); else next.add(dayId);
            return next;
        });
    };

    const handleDropSprint = (targetSprintId: string) => {
        if (!draggedSprintId || draggedSprintId === targetSprintId) {
            setDraggedSprintId(null);
            setDragOverSprintId(null);
            return;
        }

        setSecamStructure(prev => {
            const draggedIndex = prev.findIndex(s => s.id === draggedSprintId);
            const targetIndex = prev.findIndex(s => s.id === targetSprintId);
            if (draggedIndex === -1 || targetIndex === -1) return prev;

            const next = [...prev];
            const [movedSprint] = next.splice(draggedIndex, 1);
            next.splice(targetIndex, 0, movedSprint);

            setDraftUnits(currentUnits => resequenceDraftUnits(currentUnits, next, activeFramework));
            return next;
        });
        setDraggedSprintId(null);
        setDragOverSprintId(null);
    };

    const handleDropDay = (sprintId: string, targetDayId: string) => {
        if (!draggedDayId || draggedDayId === targetDayId) {
            setDraggedDayId(null);
            setDragOverDayId(null);
            return;
        }

        setSecamStructure(prev => {
            const nextStructure = prev.map(sprint => {
                if (sprint.id !== sprintId) return sprint;
                const draggedIndex = sprint.days.findIndex(d => d.id === draggedDayId);
                const targetIndex = sprint.days.findIndex(d => d.id === targetDayId);
                if (draggedIndex === -1 || targetIndex === -1) return sprint;

                const nextDays = [...sprint.days];
                const [movedDay] = nextDays.splice(draggedIndex, 1);
                nextDays.splice(targetIndex, 0, movedDay);

                return { ...sprint, days: nextDays };
            });

            setDraftUnits(currentUnits => resequenceDraftUnits(currentUnits, nextStructure, activeFramework));
            return nextStructure;
        });
        setDraggedDayId(null);
        setDragOverDayId(null);
    };

    const handleDropLesson = (targetLessonId: string, droppedId?: string) => {
        const sourceId = droppedId || draggedLessonIdRef.current || draggedLessonId;
        if (!sourceId || sourceId === targetLessonId) {
            setDraggedLessonId(null);
            draggedLessonIdRef.current = null;
            return;
        }

        setDraftUnits(prev => {
            const draggedIndex = prev.findIndex(u => u.id === sourceId);
            const targetIndex = prev.findIndex(u => u.id === targetLessonId);

            if (draggedIndex === -1 || targetIndex === -1) return prev;

            const targetUnit = prev[targetIndex];
            const draggedUnit = prev[draggedIndex];

            const updatedDraggedUnit = {
                ...draggedUnit,
                sprintTitle: targetUnit.sprintTitle,
                dayOrLessonTitle: targetUnit.dayOrLessonTitle,
                moduleType: targetUnit.moduleType,
                moduleCode: targetUnit.moduleCode,
                topicId: targetUnit.topicId
            };

            const next = [...prev];
            next.splice(draggedIndex, 1);
            next.splice(targetIndex, 0, updatedDraggedUnit);

            return resequenceDraftUnits(next, secamStructure, activeFramework);
        });

        setDraggedLessonId(null);
        draggedLessonIdRef.current = null;
    };

    const updateDraftLesson = useCallback((id: string, field: string, value: any) => {
        setDraftUnits(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
    }, []);

    const updateInteractiveCheck = useCallback((id: string, field: string, value: any) => {
        setDraftUnits(prev => prev.map((u): ExtendedLearningUnitWithStatus => {
            if (u.id !== id) return u;
            const currentCheck: InteractiveCheckConfig = u.interactiveCheck || {
                checkType: 'none',
                instructions: '',
                isRequiredForCompletion: true,
                timeLimitSeconds: 0
            };

            const updated: InteractiveCheckConfig = { ...currentCheck, [field]: value };
            if (field === 'checkType' && value === 'spot_the_bug') {
                if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
                if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
                if (!updated.instructions) updated.instructions = 'Fix the component so it returns adjacent JSX elements properly.';
            }
            if (field === 'checkType' && value === 'mcq') {
                if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
                    updated.mcqQuestions = [createDefaultMCQQuestion(1)];
                }
            }
            return { ...u, interactiveCheck: updated };
        }));
    }, []);

    const updateAssessmentGateSlot = useCallback((lessonId: string, slotKey: 'formative' | 'summative' | 'other', field: keyof GateSlot, value: any) => {
        setDraftUnits(prev => prev.map(u => {
            if (u.id !== lessonId) return u;
            const currentGates: AssessmentGatesConfig = u.assessmentGates || {};
            const currentSlot: GateSlot = currentGates[slotKey] || {
                enabled: false,
                assessmentId: null,
                requirePassToUnlockSummative: true,
                unlockNextOn: 'submission'
            };

            const updatedSlot: GateSlot = { ...currentSlot, [field]: value };
            const updatedGates: AssessmentGatesConfig = { ...currentGates, [slotKey]: updatedSlot };

            const primaryId = updatedGates.summative?.enabled ? updatedGates.summative.assessmentId :
                updatedGates.formative?.enabled ? updatedGates.formative.assessmentId :
                    updatedGates.other?.enabled ? updatedGates.other.assessmentId : null;

            const primaryPolicy = (updatedGates.summative?.unlockNextOn === 'grading' || updatedGates.other?.unlockNextOn === 'grading')
                ? 'hard_gate' : 'soft_gate';

            return {
                ...u,
                assessmentGates: updatedGates,
                linkedAssessmentId: primaryId,
                unlinkedPolicy: primaryPolicy
            };
        }));
    }, []);

    const toggleSettings = useCallback((id: string) => {
        setDraftUnits(prev => prev.map(u => u.id === id ? { ...u, _expanded: !u._expanded } : u));
        setPreviewLessonId(id);
    }, []);

    const hasChanges = () => {
        if (deletedIds.length > 0) return true;
        if (draftUnits.length !== initialUnits.length) return true;

        const unitsChanged = JSON.stringify(
            draftUnits.map(u => {
                const cleanCheck = u.interactiveCheck ? JSON.parse(JSON.stringify(u.interactiveCheck)) : null;
                // Strip dynamic IDs from MCQ options so they don't trigger false positives
                if (cleanCheck?.mcqQuestions) {
                    cleanCheck.mcqQuestions.forEach((q: any) => {
                        delete q.id;
                        q.options?.forEach((o: any) => delete o.id);
                    });
                }
                return {
                    id: u.id,
                    title: u.title,
                    unitType: u.unitType,
                    estimatedMinutes: u.estimatedMinutes,
                    orderIndex: u.orderIndex,
                    sprintTitle: u.sprintTitle,
                    dayOrLessonTitle: u.dayOrLessonTitle,
                    moduleCode: u.moduleCode,
                    moduleType: u.moduleType,
                    topicId: u.topicId,
                    videoUrl: u.videoUrl,
                    contentHtml: u.contentHtml,
                    requiredWatchPercentage: u.requiredWatchPercentage,
                    interactiveCheck: cleanCheck,
                    assessmentGates: u.assessmentGates,
                    attachments: u.attachments,
                    isRequiredForNextUnit: u.isRequiredForNextUnit,
                    tags: u.tags,
                    linkedAssessmentId: u.linkedAssessmentId || null,
                    unlinkedPolicy: u.unlinkedPolicy || 'soft_gate'
                };
            })
        ) !== JSON.stringify(
            initialUnits.map(u => {
                const ext = u as ExtendedLearningUnitWithStatus;
                const resolvedAssessmentId = ext.linkedAssessmentId || (u as any).assessmentId || (u as any).formalAssessmentId || (typeof (u as any).linkedAssessment === 'string' ? (u as any).linkedAssessment : null) || null;

                const check = u.interactiveCheck ? {
                    ...u.interactiveCheck,
                    buggyCode: sanitizeCodeInput(u.interactiveCheck.buggyCode),
                    solutionCode: sanitizeCodeInput(u.interactiveCheck.solutionCode)
                } : null;

                if (check && check.checkType === 'mcq') {
                    if (!check.mcqQuestions || check.mcqQuestions.length === 0) {
                        if (check.mcqQuestion) {
                            check.mcqQuestions = [{
                                question: check.mcqQuestion,
                                options: check.mcqOptions?.map((o: any) => { const copy = { ...o }; delete copy.id; return copy; }) || []
                            }] as any;
                        } else {
                            check.mcqQuestions = [{
                                question: `Question 1: What is the primary purpose of this topic?`,
                                options: [
                                    { text: 'Option A (Correct)', isCorrect: true },
                                    { text: 'Option B', isCorrect: false },
                                    { text: 'Option C', isCorrect: false },
                                    { text: 'Option D', isCorrect: false }
                                ]
                            }] as any;
                        }
                    } else {
                        check.mcqQuestions.forEach((q: any) => {
                            delete q.id;
                            q.options?.forEach((o: any) => delete o.id);
                        });
                    }
                }

                const defaultGates: AssessmentGatesConfig = u.assessmentGates || {
                    formative: { enabled: false, assessmentId: null, requirePassToUnlockSummative: true },
                    summative: { enabled: Boolean(resolvedAssessmentId), assessmentId: resolvedAssessmentId, unlockNextOn: (ext.unlinkedPolicy === 'hard_gate') ? 'grading' : 'submission' },
                    other: { enabled: false, assessmentId: null, unlockNextOn: 'submission' }
                };

                return {
                    id: u.id,
                    title: u.title,
                    unitType: u.unitType,
                    estimatedMinutes: u.estimatedMinutes,
                    orderIndex: u.orderIndex,
                    sprintTitle: u.sprintTitle,
                    dayOrLessonTitle: u.dayOrLessonTitle,
                    moduleCode: u.moduleCode,
                    moduleType: u.moduleType,
                    topicId: u.topicId,
                    videoUrl: u.videoUrl,
                    contentHtml: u.contentHtml,
                    requiredWatchPercentage: u.requiredWatchPercentage,
                    interactiveCheck: check,
                    assessmentGates: defaultGates,
                    attachments: u.attachments,
                    isRequiredForNextUnit: u.isRequiredForNextUnit,
                    tags: u.tags,
                    linkedAssessmentId: resolvedAssessmentId,
                    unlinkedPolicy: ext.unlinkedPolicy || 'soft_gate'
                };
            })
        );

        if (unitsChanged) return true;

        const initialMetadata = {
            illustrationType: activeContainer?.illustrationType || activeContainer?.checkpointMetadata?.illustrationType || 'code',
            themeColor: activeContainer?.themeColor || activeContainer?.checkpointMetadata?.themeColor || '#0284c7',
            courseLevel: activeContainer?.level || activeContainer?.checkpointMetadata?.courseLevel || 'beginner',
            courseDescription: activeContainer?.description || activeContainer?.checkpointMetadata?.courseDescription || '',
            prerequisites: activeContainer?.prerequisites || activeContainer?.checkpointMetadata?.prerequisites || [],
            learningOutcomes: activeContainer?.learningOutcomes || activeContainer?.checkpointMetadata?.learningOutcomes || [],
            targetAudience: activeContainer?.targetAudience || activeContainer?.checkpointMetadata?.targetAudience || [],
            isCertificateAwarded: activeContainer?.isCertificateAwarded ?? activeContainer?.checkpointMetadata?.isCertificateAwarded ?? true,
            courseTags: activeContainer?.tags || activeContainer?.checkpointMetadata?.courseTags || [],
            instructors: activeContainer?.instructors || activeContainer?.checkpointMetadata?.instructors || [],
            courseworkHours: activeContainer?.courseworkHours || activeContainer?.checkpointMetadata?.courseworkHours || 0,
            materialIncludes: activeContainer?.materialIncludes || activeContainer?.checkpointMetadata?.materialIncludes || [],
            previewVideoUrl: activeContainer?.previewVideoUrl || activeContainer?.checkpointMetadata?.previewVideoUrl || '',
            checkpointScope: activeContainer?.checkpointMetadata?.checkpointScope || activeContainer?.checkpointScope || 'per_lesson',
            isAccredited: activeContainer?.defaultAccreditation?.isAccredited ?? activeContainer?.checkpointMetadata?.isAccredited ?? false,
            accreditationBody: activeContainer?.defaultAccreditation?.body || activeContainer?.checkpointMetadata?.accreditationBody || 'none',
            customAccreditationText: activeContainer?.defaultAccreditation?.customText || activeContainer?.checkpointMetadata?.customAccreditationText || '',
            saqaId: activeContainer?.defaultAccreditation?.saqaId || '',
            nqfLevel: activeContainer?.defaultAccreditation?.nqfLevel || 5,
            credits: activeContainer?.defaultAccreditation?.credits || 120,
            secamStructure: activeContainer?.checkpointMetadata?.secamStructure || []
        };

        const currentMetadata = {
            illustrationType,
            themeColor,
            courseLevel,
            courseDescription,
            prerequisites,
            learningOutcomes,
            targetAudience,
            isCertificateAwarded,
            courseTags,
            instructors,
            courseworkHours,
            materialIncludes,
            previewVideoUrl: previewVideoUrl.trim(),
            checkpointScope,
            isAccredited,
            accreditationBody: !isAccredited ? 'none' : accreditationBody,
            customAccreditationText: isAccredited && accreditationBody === 'other' ? customAccreditationText.trim() : '',
            saqaId: isAccredited ? saqaId.trim() : '',
            nqfLevel: isAccredited ? nqfLevel : 5,
            credits: isAccredited ? Number(credits) : 120,
            secamStructure
        };

        return JSON.stringify(initialMetadata) !== JSON.stringify(currentMetadata);
    };

    const handleSave = async () => {
        if (!hasChanges()) {
            toast.info("No changes detected. Dismissed without database writes.");
            onClose();
            return;
        }

        setSaving(true);
        console.group('[ContentBuilderModal - SAVE BATCH] Initiating Curriculum Commit');
        try {
            const resequenced = resequenceDraftUnits(draftUnits, secamStructure, activeFramework);

            const finalAccreditationBody = !isAccredited ? 'none' : (
                accreditationBody === 'other'
                    ? (customAccreditationText.trim() || 'Custom Accreditation')
                    : accreditationBody
            );

            const accreditationConfig: AccreditationConfig = sanitizePayload({
                isAccredited,
                body: isAccredited ? (accreditationBody as AccreditationBody) : 'none',
                customText: isAccredited && accreditationBody === 'other' ? customAccreditationText.trim() : null,
                saqaId: isAccredited ? (saqaId.trim() || null) : null,
                nqfLevel: isAccredited ? (nqfLevel || null) : null,
                credits: isAccredited ? (Number(credits) || 0) : 0
            });

            const finalMaterialIncludes = materialIncludes.length > 0 ? materialIncludes : [
                `${totalContentHours}h content + ${courseworkHours}h projects`,
                'Downloadable lab guides & assets',
                'Interactive AI code challenges',
                'Certificate of Completion'
            ];

            const checkpointMetadata = sanitizePayload({
                illustrationType,
                themeColor,
                isAccredited,
                checkpointScope,
                previewVideoUrl: previewVideoUrl.trim(),
                secamStructure,
                qctoModuleCheckpoints,
                qctoTopicCheckpoints,
                accreditationBody: finalAccreditationBody,
                customAccreditationText: isAccredited ? customAccreditationText.trim() : '',
                courseLevel,
                courseDescription,
                prerequisites,
                learningOutcomes,
                targetAudience,
                isCertificateAwarded,
                courseTags,
                instructors,
                contentHours: totalContentHours,
                courseworkHours,
                estimatedTotalHours: grandTotalHours,
                materialIncludes: finalMaterialIncludes,
                updatedAt: new Date().toISOString()
            });

            const finalResequencedUnits: ExtendedLearningUnitWithStatus[] = [];

            if (!isMockMode) {
                const batch = writeBatch(db);
                const isSpecificContainer = activeContainer?.id && activeContainer.id !== 'all';

                if (isSpecificContainer) {
                    const containerRef = doc(db, 'content_containers', activeContainer.id);
                    batch.update(containerRef, {
                        illustrationType,
                        themeColor,
                        level: courseLevel,
                        description: courseDescription,
                        prerequisites,
                        learningOutcomes,
                        targetAudience,
                        isCertificateAwarded,
                        tags: courseTags,
                        instructors,
                        contentHours: totalContentHours,
                        courseworkHours,
                        estimatedTotalHours: grandTotalHours,
                        materialIncludes: finalMaterialIncludes,
                        previewVideoUrl: previewVideoUrl.trim(),
                        checkpointScope,
                        defaultAccreditation: accreditationConfig,
                        accreditationBody: finalAccreditationBody,
                        customAccreditationText: isAccredited ? customAccreditationText.trim() : '',
                        checkpointMetadata,
                        updatedAt: serverTimestamp()
                    });

                    const snapshotRef = doc(collection(db, 'content_containers', activeContainer.id, 'revisions'));
                    batch.set(snapshotRef, {
                        id: snapshotRef.id,
                        containerId: activeContainer.id,
                        committedBy: 'Admin Content Author',
                        committedAt: new Date().toISOString(),
                        unitCount: resequenced.length,
                        illustrationType,
                        themeColor,
                        level: courseLevel,
                        description: courseDescription,
                        prerequisites,
                        learningOutcomes,
                        targetAudience,
                        isCertificateAwarded,
                        tags: courseTags,
                        instructors,
                        contentHours: totalContentHours,
                        courseworkHours,
                        estimatedTotalHours: grandTotalHours,
                        materialIncludes: finalMaterialIncludes,
                        previewVideoUrl: previewVideoUrl.trim(),
                        checkpointScope,
                        secamStructure: secamStructure || [],
                        qctoModuleCheckpoints: qctoModuleCheckpoints || {},
                        qctoTopicCheckpoints: qctoTopicCheckpoints || {},
                        defaultAccreditation: accreditationConfig,
                        accreditationBody: finalAccreditationBody,
                        customAccreditationText: isAccredited ? customAccreditationText.trim() : ''
                    });
                }

                resequenced.forEach((unit) => {
                    const isDraft = unit.id.startsWith('draft_');
                    const unitRef = isDraft
                        ? doc(collection(db, 'learning_units'))
                        : doc(db, 'learning_units', unit.id);

                    const resolvedId = unitRef.id;

                    const sanitizedCheck = unit.interactiveCheck ? sanitizePayload({
                        ...unit.interactiveCheck,
                        buggyCode: sanitizeCodeInput(unit.interactiveCheck.buggyCode),
                        solutionCode: sanitizeCodeInput(unit.interactiveCheck.solutionCode),
                        instructions: sanitizeCodeInput(unit.interactiveCheck.instructions)
                    }) : null;

                    const targetContainerId = isSpecificContainer ? activeContainer.id : (unit.containerId && unit.containerId !== 'all' ? unit.containerId : 'unassigned');

                    const unitPayload = sanitizePayload({
                        id: resolvedId,
                        containerId: targetContainerId,
                        framework: activeFramework,
                        title: unit.title || 'Untitled Lesson',
                        unitType: unit.unitType || 'video',
                        estimatedMinutes: Number(unit.estimatedMinutes) || 15,
                        isRequired: unit.isRequired ?? true,
                        orderIndex: unit.orderIndex,
                        sprintTitle: unit.sprintTitle || null,
                        dayOrLessonTitle: unit.dayOrLessonTitle || null,
                        moduleCode: unit.moduleCode || null,
                        moduleType: unit.moduleType || null,
                        topicId: unit.topicId || null,
                        videoUrl: unit.videoUrl || null,
                        contentHtml: unit.contentHtml || null,
                        requiredWatchPercentage: unit.requiredWatchPercentage || 90,
                        interactiveCheck: sanitizedCheck,
                        assessmentGates: unit.assessmentGates || null,
                        attachments: unit.attachments || [],
                        isRequiredForNextUnit: unit.isRequiredForNextUnit || false,
                        tags: unit.tags || [],
                        linkedAssessmentId: unit.linkedAssessmentId || null,
                        unlinkedPolicy: unit.unlinkedPolicy || 'soft_gate',
                        updatedAt: new Date().toISOString()
                    });

                    if (isDraft) {
                        unitPayload.createdAt = new Date().toISOString();
                        batch.set(unitRef, unitPayload);
                    } else {
                        batch.set(unitRef, unitPayload, { merge: true });
                    }

                    const resolvedUnitObj = sanitizePayload({
                        ...unit,
                        id: resolvedId,
                        interactiveCheck: sanitizedCheck,
                        assessmentGates: unit.assessmentGates || null,
                        linkedAssessmentId: unit.linkedAssessmentId || null,
                        unlinkedPolicy: unit.unlinkedPolicy || 'soft_gate',
                        _isDraft: false,
                        _isSaving: false,
                        _justSaved: false
                    });

                    finalResequencedUnits.push(resolvedUnitObj);
                });

                deletedIds.forEach((delId) => {
                    if (!delId.startsWith('draft_')) {
                        batch.delete(doc(db, 'learning_units', delId));
                    }
                });

                await batch.commit();
            } else {
                finalResequencedUnits.push(...resequenced);
            }

            if (onSaveBatch) {
                await onSaveBatch(finalResequencedUnits, deletedIds, checkpointMetadata);
            }

            toast.success("Curriculum structure, assessment gates & metadata committed!");
            console.groupEnd();
            localStorage.removeItem(DRAFT_STORAGE_KEY);
            onClose();
        } catch (err: any) {
            console.groupEnd();
            console.error("Error committing curriculum structure:", err);
            toast.error(`Failed to commit curriculum structure: ${err.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleInlineSaveLesson = async (lessonId: string) => {
        const lessonToSave = draftUnits.find(u => u.id === lessonId);
        if (!lessonToSave) return;

        if (!lessonToSave.title.trim()) {
            toast.warning("Lesson Title is required.");
            return;
        }

        console.group(`[ContentBuilderModal - INLINE SAVE] Lesson "${lessonToSave.title}" (${lessonId})`);
        setDraftUnits(prev => prev.map(u => u.id === lessonId ? { ...u, _isSaving: true } : u));
        let finalSavedId = lessonId;

        try {
            if (isMockMode) {
                setDraftUnits(prev => prev.map(u => u.id === lessonId ? {
                    ...u,
                    _isDraft: false,
                    _isSaving: false,
                    _expanded: true,
                    _justSaved: true
                } : u));
                toast.success("Lesson Saved Locally!");
            } else {
                const isDraft = lessonId.startsWith('draft_');
                const targetId = isDraft ? undefined : lessonId;

                const sanitizedCheck = lessonToSave.interactiveCheck ? sanitizePayload({
                    ...lessonToSave.interactiveCheck,
                    buggyCode: sanitizeCodeInput(lessonToSave.interactiveCheck.buggyCode),
                    solutionCode: sanitizeCodeInput(lessonToSave.interactiveCheck.solutionCode),
                    instructions: sanitizeCodeInput(lessonToSave.interactiveCheck.instructions)
                }) : null;

                const payload: any = sanitizePayload({
                    ...lessonToSave,
                    containerId: activeContainer?.id === 'all' ? (lessonToSave.containerId || 'unassigned') : activeContainer.id,
                    framework: activeFramework,
                    interactiveCheck: sanitizedCheck,
                    assessmentGates: lessonToSave.assessmentGates || null,
                    linkedAssessmentId: lessonToSave.linkedAssessmentId || null,
                    unlinkedPolicy: lessonToSave.unlinkedPolicy || 'soft_gate'
                });

                delete payload._isDraft;
                delete payload._expanded;
                delete payload._isSaving;
                delete payload._justSaved;
                if (isDraft) delete payload.id;

                finalSavedId = await saveLearningUnit(payload, targetId);

                setDraftUnits(prev => prev.map(u => u.id === lessonId ? {
                    ...u,
                    id: finalSavedId,
                    _isDraft: false,
                    _isSaving: false,
                    _expanded: true,
                    _justSaved: true
                } : u));

                if (previewLessonId === lessonId) {
                    setPreviewLessonId(finalSavedId);
                }
                toast.success("Lesson Saved to Cloud!");
            }

            setTimeout(() => {
                setDraftUnits(prev => prev.map(u => u.id === finalSavedId || u.id === lessonId ? { ...u, _justSaved: false } : u));
            }, 2500);

            console.groupEnd();
        } catch (err) {
            console.groupEnd();
            setDraftUnits(prev => prev.map(u => u.id === lessonId ? { ...u, _isSaving: false } : u));
            toast.error("Failed to save lesson.");
        }
    };

    const addDraftLesson = (overrides: Partial<ExtendedLearningUnitWithStatus>) => {
        const newLesson: ExtendedLearningUnitWithStatus = {
            id: generateUniqueId('draft'),
            containerId: activeContainer?.id === 'all' ? '' : activeContainer?.id,
            framework: activeFramework,
            title: '',
            unitType: 'video',
            estimatedMinutes: 15,
            isRequired: true,
            orderIndex: draftUnits.length + 1,
            attachments: [],
            isRequiredForNextUnit: false,
            tags: [],
            linkedAssessmentId: null,
            unlinkedPolicy: 'soft_gate',
            assessmentGates: {
                formative: { enabled: false, assessmentId: null, requirePassToUnlockSummative: true },
                summative: { enabled: false, assessmentId: null, unlockNextOn: 'submission' },
                other: { enabled: false, assessmentId: null, unlockNextOn: 'submission' }
            },
            ...overrides,
            _isDraft: true,
            _expanded: true
        };

        const updated = resequenceDraftUnits([...draftUnits, newLesson], secamStructure, activeFramework);
        setDraftUnits(updated);
        setPreviewLessonId(newLesson.id);
    };


    const handleVideoUrlChange = async (lessonId: string, url: string) => {
        updateDraftLesson(lessonId, 'videoUrl', url);

        if (url.trim().length > 10) {
            setFetchingDurationId(lessonId);
            try {
                const durationMins = await fetchVideoDurationMinutes(url);
                if (durationMins && durationMins > 0) {
                    updateDraftLesson(lessonId, 'estimatedMinutes', durationMins);
                    toast.info(`Auto-detected video runtime: ~${durationMins} Mins`);
                } else {
                    toast.warning("Could not auto-detect video duration. Keeping existing value.");
                }
            } catch (e) {
                console.warn("Failed to auto-detect video runtime:", e);
            }
            setFetchingDurationId(null);
        }
    };

    const handleFileUploadAttachment = async (lessonId: string, file: File) => {
        if (!file) return;

        if (file.size > 50 * 1024 * 1024) {
            toast.warning("Attachment exceeds maximum 50MB limit.");
            return;
        }

        setUploadingAttachmentForId(lessonId);
        setAttachmentUploadProgress(10);

        try {
            if (isMockMode) {
                setTimeout(() => {
                    const ext = file.name.split('.').pop() || 'file';
                    const mockAttachment: LessonAttachment = {
                        id: generateUniqueId('att'),
                        name: file.name,
                        url: URL.createObjectURL(file),
                        fileType: ext,
                        uploadedAt: new Date().toISOString(),
                        description: '',
                        fileSize: file.size
                    };
                    const existing = draftUnits.find(u => u.id === lessonId)?.attachments || [];
                    updateDraftLesson(lessonId, 'attachments', [...existing, mockAttachment]);
                    setUploadingAttachmentForId(null);
                    setAttachmentUploadProgress(0);
                    toast.success(`Attached "${file.name}" locally!`);
                }, 1000);
                return;
            }

            const storage = getStorage();
            const filePath = `content_attachments/${activeContainer.id || 'drafts'}/${lessonId}/${Date.now()}_${file.name}`;
            const fileRef = storageRef(storage, filePath);
            const uploadTask = uploadBytesResumable(fileRef, file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                    setAttachmentUploadProgress(progress);
                },
                (error) => {
                    console.error('[AttachmentUpload] Error uploading file:', error);
                    toast.error(`Upload failed: ${error.message}`);
                    setUploadingAttachmentForId(null);
                    setAttachmentUploadProgress(0);
                },
                async () => {
                    const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                    const ext = file.name.split('.').pop() || 'file';

                    const newAttachment: LessonAttachment = {
                        id: generateUniqueId('att'),
                        name: file.name,
                        url: downloadUrl,
                        fileType: ext,
                        uploadedAt: new Date().toISOString(),
                        description: '',
                        fileSize: file.size
                    };

                    const existing = draftUnits.find(u => u.id === lessonId)?.attachments || [];
                    updateDraftLesson(lessonId, 'attachments', [...existing, newAttachment]);
                    setUploadingAttachmentForId(null);
                    setAttachmentUploadProgress(0);
                    toast.success(`Attached "${file.name}" successfully!`);
                }
            );

        } catch (err: any) {
            console.error('[AttachmentUpload] Error:', err);
            toast.error("Failed to upload attachment.");
            setUploadingAttachmentForId(null);
            setAttachmentUploadProgress(0);
        }
    };

    const removeDraftLesson = (id: string) => {
        const nextUnits = draftUnits.filter(u => u.id !== id);
        if (!id.startsWith('draft_')) setDeletedIds(prev => [...prev, id]);
        if (previewLessonId === id) setPreviewLessonId(null);
        setDraftUnits(resequenceDraftUnits(nextUnits, secamStructure, activeFramework));
    };

    const addSecamSprint = () => {
        const newSprint = {
            id: generateUniqueId('sprint'),
            title: `Sprint ${secamStructure.length + 1}: Agile Engineering`,
            days: []
        };
        setSecamStructure(prev => [newSprint, ...prev]);
    };

    const updateSecamSprint = (sprintId: string, newTitle: string) => {
        const sprint = secamStructure.find(s => s.id === sprintId);
        if (!sprint) return;
        const oldTitle = sprint.title;

        setSecamStructure(prev => prev.map(s => s.id === sprintId ? { ...s, title: newTitle } : s));
        setDraftUnits(prev => prev.map(u => u.sprintTitle === oldTitle ? { ...u, sprintTitle: newTitle } : u));
    };

    const removeSecamSprint = (sprintId: string) => {
        const sprint = secamStructure.find(s => s.id === sprintId);
        if (!sprint) return;

        const sprintTitle = sprint.title;
        setConfirmModal({
            isOpen: true,
            type: 'warning',
            title: 'Delete Entire Sprint',
            message: `Are you sure you want to delete "${sprintTitle}" and all its contained lessons?`,
            confirmText: 'Delete Sprint',
            cancelText: 'Cancel',
            onConfirm: () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                const unitsInSprint = draftUnits.filter(u => u.sprintTitle === sprintTitle);
                unitsInSprint.forEach(u => {
                    if (!u.id.startsWith('draft_')) {
                        setDeletedIds(prev => [...prev, u.id]);
                    }
                });

                setDraftUnits(prev => prev.filter(u => u.sprintTitle !== sprintTitle));
                setSecamStructure(prev => prev.filter(s => s.id !== sprintId));
                toast.info(`Deleted "${sprintTitle}"`);
            }
        });
    };

    const addSecamDay = (sprintId: string) => {
        const newDay = {
            id: generateUniqueId('day'),
            title: `Day: Lessons`
        };

        setSecamStructure(prev => prev.map(sprint => {
            if (sprint.id !== sprintId) return sprint;
            return {
                ...sprint,
                days: [newDay, ...sprint.days]
            };
        }));
    };

    const updateSecamDay = (sprintId: string, dayId: string, newTitle: string) => {
        const sprint = secamStructure.find(s => s.id === sprintId);
        const day = sprint?.days.find(d => d.id === dayId);
        if (!sprint || !day) return;
        const oldTitle = day.title;

        setSecamStructure(prev => prev.map(s => {
            if (s.id !== sprintId) return s;
            return {
                ...s,
                days: s.days.map(d => d.id === dayId ? { ...d, title: newTitle } : d)
            };
        }));

        setDraftUnits(prev => prev.map(u =>
            u.sprintTitle === sprint.title && u.dayOrLessonTitle === oldTitle
                ? { ...u, dayOrLessonTitle: newTitle }
                : u
        ));
    };

    const removeSecamDay = (sprintId: string, dayId: string) => {
        const sprint = secamStructure.find(s => s.id === sprintId);
        const day = sprint?.days.find(d => d.id === dayId);
        if (!sprint || !day) return;

        const sprintTitle = sprint.title;
        const dayTitle = day.title;

        setConfirmModal({
            isOpen: true,
            type: 'warning',
            title: 'Delete Day Group',
            message: `Are you sure you want to delete "${dayTitle}" and its lessons?`,
            confirmText: 'Delete Day',
            cancelText: 'Cancel',
            onConfirm: () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                const unitsInDay = draftUnits.filter(u => u.sprintTitle === sprintTitle && u.dayOrLessonTitle === dayTitle);
                unitsInDay.forEach(u => {
                    if (!u.id.startsWith('draft_')) {
                        setDeletedIds(prev => [...prev, u.id]);
                    }
                });

                setDraftUnits(prev => prev.filter(u => !(u.sprintTitle === sprintTitle && u.dayOrLessonTitle === dayTitle)));
                setSecamStructure(prev => prev.map(s => {
                    if (s.id !== sprintId) return s;
                    return {
                        ...s,
                        days: s.days.filter(d => d.id !== dayId)
                    };
                }));
                toast.info(`Deleted "${dayTitle}"`);
            }
        });
    };

    const toggleSprintCheckpoint = (sIdx: number) => {
        setSecamStructure(prev => prev.map((sprint, i) => {
            if (i !== sIdx) return sprint;
            const current = sprint.sprintCheckpoint;
            if (!current || current.checkType === 'none') {
                return {
                    ...sprint,
                    sprintCheckpoint: {
                        checkType: 'spot_the_bug',
                        instructions: `Sprint Capstone Code Challenge for ${sprint.title}`,
                        buggyCode: DEFAULT_BUGGY_CODE,
                        solutionCode: DEFAULT_SOLUTION_CODE,
                        isRequiredForCompletion: true,
                        timeLimitSeconds: 0
                    }
                };
            } else {
                const { sprintCheckpoint, ...rest } = sprint;
                return rest;
            }
        }));
    };

    const updateSprintCheckpointField = (sIdx: number, field: string, value: any) => {
        setSecamStructure(prev => prev.map((sprint, i) => {
            if (i !== sIdx || !sprint.sprintCheckpoint) return sprint;
            const updated = {
                ...sprint.sprintCheckpoint,
                [field]: value
            };
            if (field === 'checkType' && value === 'spot_the_bug') {
                if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
                if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
            }
            if (field === 'checkType' && value === 'mcq') {
                if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
                    updated.mcqQuestions = [createDefaultMCQQuestion(1)];
                }
            }
            return { ...sprint, sprintCheckpoint: updated };
        }));
    };

    const removeSprintCheckpoint = (sIdx: number) => {
        setSecamStructure(prev => prev.map((sprint, i) => {
            if (i !== sIdx) return sprint;
            const { sprintCheckpoint, ...rest } = sprint;
            return rest;
        }));
    };

    const toggleDayCheckpoint = (sIdx: number, dIdx: number) => {
        setSecamStructure(prev => prev.map((sprint, i) => {
            if (i !== sIdx) return sprint;
            return {
                ...sprint,
                days: sprint.days.map((day, j) => {
                    if (j !== dIdx) return day;
                    const current = day.dayCheckpoint;
                    if (!current || current.checkType === 'none') {
                        return {
                            ...day,
                            dayCheckpoint: {
                                checkType: 'spot_the_bug',
                                instructions: `Day Quiz: Fix the broken code snippet for ${day.title}`,
                                buggyCode: DEFAULT_BUGGY_CODE,
                                solutionCode: DEFAULT_SOLUTION_CODE,
                                isRequiredForCompletion: true,
                                timeLimitSeconds: 0
                            }
                        };
                    } else {
                        const { dayCheckpoint, ...rest } = day;
                        return rest;
                    }
                })
            };
        }));
    };

    const updateDayCheckpointField = (sIdx: number, dIdx: number, field: string, value: any) => {
        setSecamStructure(prev => prev.map((sprint, i) => {
            if (i !== sIdx) return sprint;
            return {
                ...sprint,
                days: sprint.days.map((day, j) => {
                    if (j !== dIdx || !day.dayCheckpoint) return day;
                    const updated = {
                        ...day.dayCheckpoint,
                        [field]: value
                    };
                    if (field === 'checkType' && value === 'spot_the_bug') {
                        if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
                        if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
                    }
                    if (field === 'checkType' && value === 'mcq') {
                        if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
                            updated.mcqQuestions = [createDefaultMCQQuestion(1)];
                        }
                    }
                    return { ...day, dayCheckpoint: updated };
                })
            };
        }));
    };

    const toggleQctoModuleCheckpoint = (moduleCode: string) => {
        setQctoModuleCheckpoints(prev => {
            const existing = prev[moduleCode];
            if (!existing || existing.checkType === 'none') {
                return {
                    ...prev,
                    [moduleCode]: {
                        checkType: 'spot_the_bug',
                        instructions: `Module Evaluation Gate for ${moduleCode}`,
                        buggyCode: DEFAULT_BUGGY_CODE,
                        solutionCode: DEFAULT_SOLUTION_CODE,
                        isRequiredForCompletion: true,
                        timeLimitSeconds: 0
                    }
                };
            } else {
                const next = { ...prev };
                delete next[moduleCode];
                return next;
            }
        });
    };

    const updateQctoModuleField = (moduleCode: string, field: string, value: any) => {
        setQctoModuleCheckpoints(prev => {
            const current = prev[moduleCode] || {};
            const updated = { ...current, [field]: value };
            if (field === 'checkType' && value === 'spot_the_bug') {
                if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
                if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
            }
            if (field === 'checkType' && value === 'mcq') {
                if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
                    updated.mcqQuestions = [createDefaultMCQQuestion(1)];
                }
            }
            return { ...prev, [moduleCode]: updated };
        });
    };

    const toggleQctoTopicCheckpoint = (topicKey: string) => {
        setQctoTopicCheckpoints(prev => {
            const existing = prev[topicKey];
            if (!existing || existing.checkType === 'none') {
                return {
                    ...prev,
                    [topicKey]: {
                        checkType: 'spot_the_bug',
                        instructions: `Topic Quiz for ${topicKey}`,
                        buggyCode: DEFAULT_BUGGY_CODE,
                        solutionCode: DEFAULT_SOLUTION_CODE,
                        isRequiredForCompletion: true,
                        timeLimitSeconds: 0
                    }
                };
            } else {
                const next = { ...prev };
                delete next[topicKey];
                return next;
            }
        });
    };

    const updateQctoTopicField = (topicKey: string, field: string, value: any) => {
        setQctoTopicCheckpoints(prev => {
            const current = prev[topicKey] || {};
            const updated = { ...current, [field]: value };
            if (field === 'checkType' && value === 'spot_the_bug') {
                if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
                if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
            }
            if (field === 'checkType' && value === 'mcq') {
                if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
                    updated.mcqQuestions = [createDefaultMCQQuestion(1)];
                }
            }
            return { ...prev, [topicKey]: updated };
        });
    };

    return (
        <div className="pfm-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '12px' }}>

            {confirmModal.isOpen && createPortal(
                <StatusModal
                    type={confirmModal.type}
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmText={confirmModal.confirmText}
                    cancelText={confirmModal.cancelText}
                    onClose={() => {
                        if (confirmModal.onConfirm) confirmModal.onConfirm();
                        else setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    }}
                    onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                />,
                document.body
            )}

            <div className="pfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '1850px', width: '98vw', height: '96vh', maxHeight: '96vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '0px', overflow: 'hidden' }}>

                {/* MODAL HEADER */}
                <div className="pfm-header" style={{ flexShrink: 0, borderRadius: '0px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px' }}>
                    <h2 className="pfm-header__title" style={{ fontSize: '1.05rem', margin: 0 }}>
                        <Layers size={18} /> Curriculum Content Builder - {activeContainer.title}
                    </h2>
                    <button className="pfm-close-btn" type="button" onClick={onClose} disabled={saving}><X size={20} /></button>
                </div>

                {/* GLOBAL CHECKPOINT STRATEGY BAR */}
                <div style={{ background: '#0f172a', color: 'white', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', fontWeight: 700 }}>
                        <Target size={15} color="#38bdf8" />
                        <span>Quiz &amp; Verification Strategy:</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                type="button"
                                onClick={() => setCheckpointScope('per_lesson')}
                                style={{
                                    background: checkpointScope === 'per_lesson' ? '#0284c7' : '#1e293b',
                                    border: '1px solid #38bdf8',
                                    color: checkpointScope === 'per_lesson' ? 'white' : '#94a3b8',
                                    padding: '3px 8px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Per Lesson
                            </button>
                            <button
                                type="button"
                                onClick={() => setCheckpointScope('per_day')}
                                style={{
                                    background: checkpointScope === 'per_day' ? '#0284c7' : '#1e293b',
                                    border: '1px solid #38bdf8',
                                    color: checkpointScope === 'per_day' ? 'white' : '#94a3b8',
                                    padding: '3px 8px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                End of Topic Group
                            </button>
                            <button
                                type="button"
                                onClick={() => setCheckpointScope('per_sprint')}
                                style={{
                                    background: checkpointScope === 'per_sprint' ? '#0284c7' : '#1e293b',
                                    border: '1px solid #38bdf8',
                                    color: checkpointScope === 'per_sprint' ? 'white' : '#94a3b8',
                                    padding: '3px 8px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                End of Sprint Capstone
                            </button>
                        </div>
                    </div>
                </div>

                {/* 3-COLUMN WORKSPACE GRID */}
                <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 380px', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', background: '#f8fafc' }}>
                    {loadingAssessments ? (
                        /* SKELETON LOADER / BLANK WHITE SCREEN */
                        <>
                            {/* Panel 1 Skeleton */}
                            <div style={{ padding: '20px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px', background: 'white' }}>
                                <div className="skeleton-box" style={{ height: '30px', width: '60%' }}></div>
                                <div className="skeleton-box" style={{ height: '250px', width: '100%' }}></div>
                                <div className="skeleton-box" style={{ height: '100px', width: '100%' }}></div>
                                <div className="skeleton-box" style={{ height: '100px', width: '100%' }}></div>
                            </div>
                            {/* Panel 2 Skeleton */}
                            <div style={{ padding: '20px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px', background: 'white', overflow: 'hidden' }}>
                                <div className="skeleton-box" style={{ height: '60px', width: '100%' }}></div>
                                <div className="skeleton-box" style={{ height: '40px', width: '100%' }}></div>
                                <div className="skeleton-box" style={{ height: '120px', width: '100%' }}></div>
                                <div className="skeleton-box" style={{ height: '120px', width: '100%' }}></div>
                            </div>
                            {/* Panel 3 Skeleton (Dark Theme) */}
                            <div style={{ padding: '20px', background: '#0f172a', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="skeleton-box-dark" style={{ height: '30px', width: '70%' }}></div>
                                <div className="skeleton-box-dark" style={{ height: '200px', width: '100%' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
                                    <Loader2 size={32} color="#38bdf8" className="pfm-spin" />
                                </div>
                            </div>
                        </>
                    ) : (
                        /* ACTUAL WORKSPACE CONTENT */
                        <>
                            <CourseMetadataSettingsPanel
                                illustrationType={illustrationType}
                                setIllustrationType={setIllustrationType}
                                themeColor={themeColor}
                                setThemeColor={setThemeColor}
                                courseLevel={courseLevel}
                                setCourseLevel={setCourseLevel}
                                courseDescription={courseDescription}
                                setCourseDescription={setCourseDescription}
                                prerequisites={prerequisites}
                                setPrerequisites={setPrerequisites}
                                learningOutcomes={learningOutcomes}
                                setLearningOutcomes={setLearningOutcomes}
                                targetAudience={targetAudience}
                                setTargetAudience={setTargetAudience}
                                materialIncludes={materialIncludes}
                                setMaterialIncludes={setMaterialIncludes}
                                isCertificateAwarded={isCertificateAwarded}
                                setIsCertificateAwarded={setIsCertificateAwarded}
                                courseTags={courseTags}
                                setCourseTags={setCourseTags}
                                instructors={instructors}
                                setInstructors={setInstructors}
                                containerId={activeContainer?.id}
                                totalContentHours={totalContentHours}
                                courseworkHours={courseworkHours}
                                setCourseworkHours={setCourseworkHours}
                                grandTotalHours={grandTotalHours}
                                isAccredited={isAccredited}
                                setIsAccredited={setIsAccredited}
                                accreditationBody={accreditationBody}
                                setAccreditationBody={setAccreditationBody}
                                customAccreditationText={customAccreditationText}
                                setCustomAccreditationText={setCustomAccreditationText}
                                saqaId={saqaId}
                                setSaqaId={setSaqaId}
                                nqfLevel={nqfLevel}
                                setNqfLevel={setNqfLevel}
                                credits={credits}
                                setCredits={setCredits}
                                onSyncTagsFromLessons={() => {
                                    const allLessonTags = Array.from(new Set(draftUnits.flatMap(u => u.tags || [])));
                                    if (allLessonTags.length === 0) {
                                        toast.info("No lesson tags found to sync.");
                                        return;
                                    }
                                    const merged = Array.from(new Set([...courseTags, ...allLessonTags]));
                                    setCourseTags(merged);
                                    toast.success(`Synced ${allLessonTags.length} unique lesson tag(s)!`);
                                }}
                            />

                            {/* COLUMN 2: PRIMARY CURRICULUM TREE BUILDER */}
                            <div style={{ overflowY: 'auto', minHeight: 0, padding: '20px', borderRight: '1px solid #e2e8f0' }}>

                                <div style={{
                                    background: '#ffffff',
                                    border: '2px solid var(--mlab-blue)',
                                    borderLeft: '5px solid #38bdf8',
                                    padding: '12px 16px',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--mlab-blue)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                            <Video size={14} color="#0284c7" /> Course Stream Preview Video (Trailer)
                                        </span>
                                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>
                                            Catalog &amp; Hero Trailer
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input
                                            className="pfm-input"
                                            style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', borderRadius: '0px', border: '1px solid #cbd5e1' }}
                                            placeholder="Enter YouTube, Vimeo, or MP4 URL for course stream trailer..."
                                            value={previewVideoUrl}
                                            onChange={e => setPreviewVideoUrl(e.target.value)}
                                        />
                                        {previewVideoUrl.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => setPreviewLessonId('COURSE_PREVIEW')}
                                                style={{
                                                    background: previewLessonId === 'COURSE_PREVIEW' ? '#0284c7' : '#e0f2fe',
                                                    color: previewLessonId === 'COURSE_PREVIEW' ? 'white' : '#0369a1',
                                                    border: '1px solid #0284c7',
                                                    padding: '6px 12px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 800,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    borderRadius: '0px',
                                                    fontFamily: 'var(--font-heading)',
                                                    textTransform: 'uppercase'
                                                }}
                                            >
                                                <Eye size={13} /> {previewLessonId === 'COURSE_PREVIEW' ? 'Previewing' : 'Test Preview'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', border: '1px solid #cbd5e1', borderLeft: '4px solid #0284c7', padding: '8px 12px', marginBottom: '16px', borderRadius: '0px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                                        <ArrowDownNarrowWide size={16} color="#0284c7" />
                                        <span>Curriculum Flow: <strong>Top → Bottom</strong> (Item #1 at top is taught first)</span>
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 8px', textTransform: 'uppercase', fontWeight: 800 }}>
                                        1.0 → N.0 Sequence
                                    </span>
                                </div>

                                {activeFramework === 'qcto' ? (
                                    <>
                                        <div style={{ marginBottom: '16px', padding: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '0px', color: '#065f46', fontSize: '0.85rem' }}>
                                            <GraduationCap size={16} style={{ display: 'inline', marginRight: '6px', marginBottom: '-3px' }} />
                                            <strong>QCTO Blueprint Active:</strong> {linkedTemplate ? `Linked Template: ${linkedTemplate.name}` : 'No Template Linked'} • Strategy: <u>{checkpointScope.toUpperCase().replace('_', ' ')}</u>.
                                        </div>

                                        {[
                                            { key: 'knowledge', label: 'Knowledge', prop: 'knowledgeModules' },
                                            { key: 'practical', label: 'Practical', prop: 'practicalModules' },
                                            { key: 'workplace', label: 'Work Experience', prop: 'workExperienceModules' }
                                        ].map(mTypeConfig => {
                                            const mType = mTypeConfig.key;
                                            const typeMods = linkedTemplate?.modules?.filter((m: any) => m.type === mType) || linkedTemplate?.[mTypeConfig.prop] || [];
                                            if (typeMods.length === 0) return null;

                                            return (
                                                <div key={mType} style={{ marginBottom: '20px' }}>
                                                    <h3 style={{ textTransform: 'uppercase', color: 'var(--mlab-blue)', fontSize: '0.85rem', marginBottom: '8px', borderBottom: '2px solid #bae6fd', paddingBottom: '4px' }}>
                                                        {mTypeConfig.label} Modules
                                                    </h3>
                                                    {typeMods.map((mod: any) => {
                                                        const moduleGate = qctoModuleCheckpoints[mod.code];
                                                        const hasActiveGate = moduleGate && moduleGate.checkType !== 'none';
                                                        const modTopics = mod.topics || mod.practicalSkills || mod.workActivities || [];

                                                        return (
                                                            <div key={mod.code} className="pfm-module-card" style={{ marginBottom: '16px', borderRadius: '0px', borderLeft: '4px solid #0284c7' }}>

                                                                <div className="pfm-module-card__hdr expanded" style={{ background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '0px' }}>
                                                                    <strong style={{ color: '#0369a1', fontSize: '0.85rem' }}>
                                                                        {mod.code}: {mod.name}
                                                                    </strong>

                                                                    {checkpointScope === 'per_sprint' && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleQctoModuleCheckpoint(mod.code)}
                                                                            style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                background: hasActiveGate ? '#0284c7' : '#bae6fd',
                                                                                border: '1px solid #0284c7',
                                                                                color: hasActiveGate ? 'white' : '#0369a1',
                                                                                padding: '0.35rem 0.7rem',
                                                                                fontSize: '0.72rem',
                                                                                borderRadius: '0px',
                                                                                cursor: 'pointer',
                                                                                fontWeight: 'bold'
                                                                            }}
                                                                        >
                                                                            <Sparkles size={13} />
                                                                            {hasActiveGate ? 'Edit Module Gate' : '+ Add Module Formative Gate'}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {checkpointScope === 'per_sprint' && hasActiveGate && (
                                                                    <div style={{ background: '#f0f9ff', borderBottom: '1px solid #bae6fd', padding: '12px 16px' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                                                                                <Sparkles size={14} /> End-of-Module Formative Gate ({mod.code})
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleQctoModuleCheckpoint(mod.code)}
                                                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                                                            >
                                                                                <X size={14} /> Remove Gate
                                                                            </button>
                                                                        </div>

                                                                        <MemoizedCheckpointEditor ic={moduleGate!} onUpdateField={(field, val) => updateQctoModuleField(mod.code, field, val)} />
                                                                    </div>
                                                                )}

                                                                <div className="pfm-module-card__body" style={{ padding: '12px' }}>
                                                                    {modTopics.map((topic: any, tIdx: number) => {
                                                                        const topicName = topic.title || topic.name || topic.description || `Topic ${tIdx + 1}`;
                                                                        const topicKey = `${mod.code}_${topicName}`;
                                                                        const topicGate = qctoTopicCheckpoints[topicKey];
                                                                        const hasActiveTopicGate = topicGate && topicGate.checkType !== 'none';

                                                                        return (
                                                                            <div key={tIdx} className="pfm-topic" style={{ borderLeft: '3px solid #0ea5e9', marginBottom: '12px', padding: '8px', borderRadius: '0px' }}>
                                                                                <div style={{ fontWeight: 700, color: '#334155', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Bookmark size={14} color="#0284c7" /> {topicName}</span>

                                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                                        {checkpointScope === 'per_day' && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => toggleQctoTopicCheckpoint(topicKey)}
                                                                                                style={{
                                                                                                    display: 'flex',
                                                                                                    alignItems: 'center',
                                                                                                    gap: '4px',
                                                                                                    background: hasActiveTopicGate ? '#0284c7' : '#e0f2fe',
                                                                                                    border: '1px solid #0284c7',
                                                                                                    color: hasActiveTopicGate ? 'white' : '#0369a1',
                                                                                                    padding: '0.3rem 0.6rem',
                                                                                                    fontSize: '0.7rem',
                                                                                                    borderRadius: '0px',
                                                                                                    cursor: 'pointer',
                                                                                                    fontWeight: 'bold'
                                                                                                }}
                                                                                            >
                                                                                                <Sparkles size={12} />
                                                                                                {hasActiveTopicGate ? 'Edit Topic Quiz' : '+ Add Topic Quiz'}
                                                                                            </button>
                                                                                        )}

                                                                                        <button type="button" onClick={() => addDraftLesson({ moduleType: mType as any, moduleCode: mod.code, topicId: topicName })} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '0px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                                                            <Plus size={12} /> Add Lesson
                                                                                        </button>
                                                                                    </div>
                                                                                </div>

                                                                                {checkpointScope === 'per_day' && hasActiveTopicGate && (
                                                                                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '10px', marginBottom: '10px' }}>
                                                                                        <div style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                                                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                <Sparkles size={12} /> Topic Quiz (Triggers after all topic lessons)
                                                                                            </span>
                                                                                            <button type="button" onClick={() => toggleQctoTopicCheckpoint(topicKey)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
                                                                                        </div>
                                                                                        <MemoizedCheckpointEditor ic={topicGate!} onUpdateField={(field, val) => updateQctoTopicField(topicKey, field, val)} />
                                                                                    </div>
                                                                                )}

                                                                                {draftUnits
                                                                                    .filter(u => u.moduleCode === mod.code && u.topicId === topicName)
                                                                                    .sort((a, b) => (parseFloat(a.orderIndex as any) || 0) - (parseFloat(b.orderIndex as any) || 0))
                                                                                    .map(u => (
                                                                                        <MemoizedLessonRow
                                                                                            key={u.id}
                                                                                            lesson={u}
                                                                                            packageAssessments={packageAssessments}
                                                                                            loadingAssessments={loadingAssessments}
                                                                                            isPreviewActive={previewLessonId === u.id}
                                                                                            isDragging={draggedLessonId === u.id}
                                                                                            isFetchingDur={fetchingDurationId === u.id}
                                                                                            isUploadingAtt={uploadingAttachmentForId === u.id}
                                                                                            attachmentUploadProgress={attachmentUploadProgress}
                                                                                            isLockedInPreview={!mockUnlockedUnitIds.has(u.id)}
                                                                                            onDragStart={handleLessonDragStart}
                                                                                            onDrop={handleDropLesson}
                                                                                            onPreviewSelect={setPreviewLessonId}
                                                                                            onUpdateDraftLesson={updateDraftLesson}
                                                                                            onUpdateAssessmentGateSlot={updateAssessmentGateSlot}
                                                                                            onUpdateInteractiveCheck={updateInteractiveCheck}
                                                                                            onToggleSettings={toggleSettings}
                                                                                            onRemoveDraftLesson={removeDraftLesson}
                                                                                            onVideoUrlChange={handleVideoUrlChange}
                                                                                            onFileUploadAttachment={handleFileUploadAttachment}
                                                                                            onInlineSave={handleInlineSaveLesson}
                                                                                        />
                                                                                    ))}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}
                                    </>
                                ) : (
                                    /* SECAM BOOTCAMP BUILDER */
                                    <>
                                        <div style={{ marginBottom: '16px', padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0px', color: '#1e3a8a', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <Zap size={16} style={{ display: 'inline', marginRight: '6px', marginBottom: '-3px' }} />
                                                <strong>Agile Bootcamp Mode:</strong> Checkpoint strategy set to: <u>{checkpointScope.toUpperCase().replace('_', ' ')}</u>.
                                            </div>
                                            <button type="button" className="mlab-btn mlab-btn--primary mlab-btn--sm" style={{ borderRadius: '0px' }} onClick={addSecamSprint}>
                                                <Plus size={14} /> Add Sprint
                                            </button>
                                        </div>

                                        {secamStructure.map((sprint) => {
                                            const hasActiveCapstone = sprint.sprintCheckpoint && sprint.sprintCheckpoint.checkType !== 'none';
                                            const isSprintCollapsed = collapsedSprintIds.has(sprint.id);
                                            const isDraggingSprint = draggedSprintId === sprint.id;
                                            const isDragOverSprint = dragOverSprintId === sprint.id;

                                            return (
                                                <div
                                                    key={sprint.id}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.stopPropagation();
                                                        setDraggedSprintId(sprint.id);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onDragOver={(e) => {
                                                        if (!draggedSprintId) return; // Ignore if dragging a lesson!
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setDragOverSprintId(sprint.id);
                                                        e.dataTransfer.dropEffect = 'move';
                                                    }}
                                                    onDragLeave={(e) => {
                                                        e.stopPropagation();
                                                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                                        if (dragOverSprintId === sprint.id) setDragOverSprintId(null);
                                                    }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleDropSprint(sprint.id);
                                                    }}
                                                    className="pfm-module-card"
                                                    style={{
                                                        marginBottom: '16px',
                                                        borderLeft: '4px solid #7c3aed',
                                                        borderRadius: '0px',
                                                        borderTop: isDragOverSprint ? '3px solid #7c3aed' : undefined,
                                                        opacity: isDraggingSprint ? 0.4 : 1,
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <div className="pfm-module-card__hdr expanded" style={{ background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', borderRadius: '0px' }}>
                                                        <div style={{ cursor: 'grab', color: '#7c3aed', display: 'flex', alignItems: 'center' }} title="Drag to reorder Sprint">
                                                            <GripVertical size={18} />
                                                        </div>

                                                        <input
                                                            className="pfm-module-input pfm-module-input--name"
                                                            style={{ fontWeight: 800, color: '#4c1d95', fontSize: '0.85rem', flex: 1, borderRadius: '0px' }}
                                                            placeholder="Sprint Title"
                                                            value={sprint.title}
                                                            onChange={e => updateSecamSprint(sprint.id, e.target.value)}
                                                        />

                                                        <span style={{ fontSize: '0.62rem', background: '#ede9fe', border: '1px solid #ddd6fe', color: '#6d28d9', padding: '2px 6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                            <ArrowDownNarrowWide size={10} /> Top-Down Block
                                                        </span>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {checkpointScope === 'per_sprint' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleSprintCheckpoint(secamStructure.findIndex(s => s.id === sprint.id))}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        background: hasActiveCapstone ? '#7c3aed' : '#f3e8ff',
                                                                        border: '1px solid #c4b5fd',
                                                                        color: hasActiveCapstone ? 'white' : '#6d28d9',
                                                                        padding: '0.35rem 0.7rem',
                                                                        fontSize: '0.72rem',
                                                                        borderRadius: '0px',
                                                                        cursor: 'pointer',
                                                                        fontWeight: 'bold'
                                                                    }}
                                                                >
                                                                    <Sparkles size={13} />
                                                                    {hasActiveCapstone ? 'Edit Sprint Capstone' : '+ Add Sprint Capstone'}
                                                                </button>
                                                            )}

                                                            <button
                                                                type="button"
                                                                className="pfm-remove-btn"
                                                                onClick={() => removeSecamSprint(sprint.id)}
                                                                title="Delete Entire Sprint"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => toggleSprintCollapse(sprint.id)}
                                                                style={{ background: 'none', border: 'none', color: '#6d28d9', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                                                                title={isSprintCollapsed ? "Expand Sprint" : "Collapse Sprint"}
                                                            >
                                                                <ChevronDown size={18} className={`chevron-rotate ${!isSprintCollapsed ? 'expanded' : ''}`} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {!isSprintCollapsed && (
                                                        <>
                                                            {checkpointScope === 'per_sprint' && hasActiveCapstone && (
                                                                <div style={{ background: '#faf5ff', borderBottom: '1px solid #e9d5ff', padding: '12px 16px' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                                                                            <Sparkles size={14} /> End-of-Sprint Capstone Gate
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeSprintCheckpoint(secamStructure.findIndex(s => s.id === sprint.id))}
                                                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                                                        >
                                                                            <X size={14} /> Remove Capstone
                                                                        </button>
                                                                    </div>

                                                                    <MemoizedCheckpointEditor ic={sprint.sprintCheckpoint!} onUpdateField={(field, val) => updateSprintCheckpointField(secamStructure.findIndex(s => s.id === sprint.id), field, val)} />
                                                                </div>
                                                            )}

                                                            <div className="pfm-module-card__body" style={{ padding: '12px' }}>
                                                                {sprint.days.map((day) => {
                                                                    const hasActiveDayGate = day.dayCheckpoint && day.dayCheckpoint.checkType !== 'none';
                                                                    const isDayCollapsed = collapsedDayIds.has(day.id);
                                                                    const isDraggingDay = draggedDayId === day.id;
                                                                    const isDragOverDay = dragOverDayId === day.id;

                                                                    return (
                                                                        <div
                                                                            key={day.id}
                                                                            draggable
                                                                            onDragStart={(e) => {
                                                                                e.stopPropagation();
                                                                                setDraggedDayId(day.id);
                                                                                e.dataTransfer.effectAllowed = 'move';
                                                                            }}
                                                                            onDragOver={(e) => {
                                                                                if (!draggedDayId) return; // Ignore lesson drags completely!
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                setDragOverDayId(day.id);
                                                                                e.dataTransfer.dropEffect = 'move';
                                                                            }}
                                                                            onDragLeave={(e) => {
                                                                                e.stopPropagation();
                                                                                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                                                                if (dragOverDayId === day.id) setDragOverDayId(null);
                                                                            }}
                                                                            onDragEnd={() => {
                                                                                setDraggedDayId(null);
                                                                                setDragOverDayId(null);
                                                                            }}
                                                                            onDrop={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                handleDropDay(sprint.id, day.id);
                                                                            }}
                                                                            className="pfm-topic"
                                                                            style={{
                                                                                borderLeft: '3px solid #c4b5fd',
                                                                                marginBottom: '12px',
                                                                                padding: '8px',
                                                                                borderRadius: '0px',
                                                                                borderTop: isDragOverDay ? '2px solid #7c3aed' : undefined,
                                                                                opacity: isDraggingDay ? 0.4 : 1,
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                        >
                                                                            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                                                                    <div style={{ cursor: 'grab', color: '#7c3aed', display: 'flex', alignItems: 'center' }} title="Drag to reorder Day Group">
                                                                                        <GripVertical size={16} />
                                                                                    </div>

                                                                                    <Bookmark size={14} color="#7c3aed" />
                                                                                    <input className="pfm-input" style={{ width: '220px', padding: '4px', fontSize: '0.8rem', borderRadius: '0px' }} placeholder="Day Title" value={day.title} onChange={e => updateSecamDay(sprint.id, day.id, e.target.value)} />

                                                                                    <span style={{ fontSize: '0.6rem', background: '#f3e8ff', border: '1px solid #e9d5ff', color: '#7c3aed', padding: '1px 5px', fontWeight: 800 }}>
                                                                                        Top → Bottom
                                                                                    </span>

                                                                                    <button
                                                                                        type="button"
                                                                                        className="pfm-remove-btn"
                                                                                        onClick={() => removeSecamDay(sprint.id, day.id)}
                                                                                        title="Delete Day Group"
                                                                                    >
                                                                                        <Trash2 size={14} />
                                                                                    </button>

                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => toggleDayCollapse(day.id)}
                                                                                        style={{ background: 'none', border: 'none', color: '#6d28d9', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                                                                                        title={isDayCollapsed ? "Expand Day Group" : "Collapse Day Group"}
                                                                                    >
                                                                                        <ChevronDown size={18} className={`chevron-rotate ${!isDayCollapsed ? 'expanded' : ''}`} />
                                                                                    </button>
                                                                                </div>

                                                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                                                    {checkpointScope === 'per_day' && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => toggleDayCheckpoint(secamStructure.findIndex(s => s.id === sprint.id), sprint.days.findIndex(d => d.id === day.id))}
                                                                                            style={{
                                                                                                display: 'flex',
                                                                                                alignItems: 'center',
                                                                                                gap: '4px',
                                                                                                background: hasActiveDayGate ? '#7c3aed' : '#f3e8ff',
                                                                                                border: '1px solid #c4b5fd',
                                                                                                color: hasActiveDayGate ? 'white' : '#6d28d9',
                                                                                                padding: '0.3rem 0.6rem',
                                                                                                fontSize: '0.7rem',
                                                                                                borderRadius: '0px',
                                                                                                cursor: 'pointer',
                                                                                                fontWeight: 'bold'
                                                                                            }}
                                                                                        >
                                                                                            <Sparkles size={12} />
                                                                                            {hasActiveDayGate ? 'Edit Day Quiz' : '+ Add Day Quiz'}
                                                                                        </button>
                                                                                    )}

                                                                                    <button type="button" onClick={() => addDraftLesson({ sprintTitle: sprint.title, dayOrLessonTitle: day.title })} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '0px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                                                        <Plus size={12} /> Add Lesson
                                                                                    </button>
                                                                                </div>
                                                                            </div>

                                                                            {!isDayCollapsed && (
                                                                                <>
                                                                                    {checkpointScope === 'per_day' && hasActiveDayGate && (
                                                                                        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', padding: '10px', marginBottom: '10px' }}>
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                    <Sparkles size={12} /> End-of-Day Completion Quiz
                                                                                                </span>
                                                                                                <button type="button" onClick={() => toggleDayCheckpoint(secamStructure.findIndex(s => s.id === sprint.id), sprint.days.findIndex(d => d.id === day.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
                                                                                            </div>
                                                                                            <MemoizedCheckpointEditor ic={day.dayCheckpoint!} onUpdateField={(field, val) => updateDayCheckpointField(secamStructure.findIndex(s => s.id === sprint.id), sprint.days.findIndex(d => d.id === day.id), field, val)} />
                                                                                        </div>
                                                                                    )}

                                                                                    {draftUnits
                                                                                        .filter(u => u.sprintTitle === sprint.title && u.dayOrLessonTitle === day.title)
                                                                                        .sort((a, b) => (parseFloat(a.orderIndex as any) || 0) - (parseFloat(b.orderIndex as any) || 0))
                                                                                        .map(u => (
                                                                                            <MemoizedLessonRow
                                                                                                key={u.id}
                                                                                                lesson={u}
                                                                                                packageAssessments={packageAssessments}
                                                                                                loadingAssessments={loadingAssessments}
                                                                                                isPreviewActive={previewLessonId === u.id}
                                                                                                isDragging={draggedLessonId === u.id}
                                                                                                isFetchingDur={fetchingDurationId === u.id}
                                                                                                isUploadingAtt={uploadingAttachmentForId === u.id}
                                                                                                attachmentUploadProgress={attachmentUploadProgress}
                                                                                                isLockedInPreview={!mockUnlockedUnitIds.has(u.id)}
                                                                                                onDragStart={handleLessonDragStart}
                                                                                                onDrop={handleDropLesson}
                                                                                                onPreviewSelect={setPreviewLessonId}
                                                                                                onUpdateDraftLesson={updateDraftLesson}
                                                                                                onUpdateAssessmentGateSlot={updateAssessmentGateSlot}
                                                                                                onUpdateInteractiveCheck={updateInteractiveCheck}
                                                                                                onToggleSettings={toggleSettings}
                                                                                                onRemoveDraftLesson={removeDraftLesson}
                                                                                                onVideoUrlChange={handleVideoUrlChange}
                                                                                                onFileUploadAttachment={handleFileUploadAttachment}
                                                                                                onInlineSave={handleInlineSaveLesson}
                                                                                            />
                                                                                        ))}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}

                                                                <button type="button" onClick={() => addSecamDay(sprint.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: '#7c3aed', padding: '4px 0', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>
                                                                    <Plus size={12} /> Add Day Group
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>

                            {/* COLUMN 3: LIVE STUDENT PREVIEW STATION */}
                            <div style={{ overflowY: 'auto', minHeight: 0, padding: '20px', background: '#0f172a', color: '#f8fafc', borderLeft: '1px solid #1e293b' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8' }}>
                                        <Tv size={18} /> Student Portal Live Preview
                                    </div>
                                    <span style={{ fontSize: '0.7rem', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '2px 8px', borderRadius: '0px' }}>
                                        {activeFramework.toUpperCase()} Player
                                    </span>
                                </div>

                                {previewLessonId !== 'COURSE_PREVIEW' && activePreviewUnit && !mockUnlockedUnitIds.has(activePreviewUnit.id) && (
                                    <div style={{ background: '#7f1d1d', border: '1px solid #f87171', color: '#fca5a5', padding: '10px 14px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderRadius: '0px' }}>
                                        <Lock size={16} /> This lesson will appear locked to learners until previous progression gates are passed.
                                    </div>
                                )}

                                {previewLessonId === 'COURSE_PREVIEW' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0ea5e9', fontWeight: 700, marginBottom: '4px' }}>
                                                Course Stream Trailer Preview
                                            </div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff', fontWeight: 700 }}>
                                                {activeContainer?.title || 'Course Preview Trailer'}
                                            </h3>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ background: '#000000', borderRadius: '0px', overflow: 'hidden', border: '1px solid #334155', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                                                {getVideoThumbnail(previewVideoUrl) ? (
                                                    <div
                                                        style={{ width: '100%', height: '100%', backgroundImage: `url(${getVideoThumbnail(previewVideoUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                        onClick={() => openPopoutPlayer(previewVideoUrl)}
                                                    >
                                                        <div style={{ background: 'rgba(2, 132, 199, 0.85)', padding: '12px 18px', borderRadius: '0px', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 700, fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                                            <Play size={16} fill="white" /> Launch Trailer Stream Player
                                                        </div>
                                                    </div>
                                                ) : getEmbedVideoUrl(previewVideoUrl) ? (
                                                    <iframe
                                                        src={getEmbedVideoUrl(previewVideoUrl)!}
                                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                                        title="Course Stream Preview Trailer"
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                        allowFullScreen
                                                    />
                                                ) : (
                                                    <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                                                        <Video size={40} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                                                        <p style={{ margin: 0, fontSize: '0.8rem' }}>Enter a valid Vimeo or YouTube URL in the trailer field</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : activePreviewUnit ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0ea5e9', fontWeight: 700, marginBottom: '4px' }}>
                                                #{activePreviewUnit.orderIndex} • {activeFramework === 'qcto' ? `${activePreviewUnit.moduleCode || 'KM-01'} • ${activePreviewUnit.topicId || 'General'}` : `${activePreviewUnit.sprintTitle || 'Sprint'} • ${activePreviewUnit.dayOrLessonTitle || 'Day'}`}
                                            </div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff', fontWeight: 700 }}>
                                                {activePreviewUnit.title || 'Untitled Lesson'}
                                            </h3>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {activePreviewUnit.estimatedMinutes || 15} Mins</span>
                                                <span style={{ textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700 }}>{activePreviewUnit.unitType}</span>
                                            </div>
                                        </div>

                                        {activePreviewUnit.unitType === 'video' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ background: '#000000', borderRadius: '0px', overflow: 'hidden', border: '1px solid #334155', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                                                    {getVideoThumbnail(activePreviewUnit.videoUrl) ? (
                                                        <div
                                                            style={{ width: '100%', height: '100%', backgroundImage: `url(${getVideoThumbnail(activePreviewUnit.videoUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                            onClick={() => openPopoutPlayer(activePreviewUnit.videoUrl!)}
                                                        >
                                                            <div style={{ background: 'rgba(2, 132, 199, 0.85)', padding: '12px 18px', borderRadius: '0px', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 700, fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                                                <Play size={16} fill="white" /> Launch Live Stream Player
                                                            </div>
                                                        </div>
                                                    ) : getEmbedVideoUrl(activePreviewUnit.videoUrl) ? (
                                                        <iframe
                                                            src={getEmbedVideoUrl(activePreviewUnit.videoUrl)!}
                                                            style={{ width: '100%', height: '100%', border: 'none' }}
                                                            title="Video Preview"
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                            allowFullScreen
                                                        />
                                                    ) : (
                                                        <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                                                            <Video size={40} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                                                            <p style={{ margin: 0, fontSize: '0.8rem' }}>Enter video URL to inspect stream</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {activePreviewUnit.unitType === 'reading' && (
                                            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '0px', border: '1px solid #334155', fontSize: '0.85rem', color: '#cbd5e1', minHeight: '120px' }}>
                                                <FileText size={20} color="#38bdf8" style={{ marginBottom: '8px' }} />
                                                <div className="ql-editor" style={{ padding: 0, minHeight: 'auto' }}>
                                                    <div dangerouslySetInnerHTML={{ __html: activePreviewUnit.contentHtml || '<p style="color:#64748b; font-style:italic;">Reading body content...</p>' }} />
                                                </div>
                                            </div>
                                        )}

                                        {/* --- STUDENT PREVIEW: MULTI-SLOT PROGRESSION GATE VIEW --- */}
                                        {activePreviewUnit.assessmentGates && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {/* Formative Slot Preview */}
                                                {activePreviewUnit.assessmentGates.formative?.enabled && (
                                                    <div style={{ background: '#1e293b', border: '1px solid #3b82f6', borderLeft: '4px solid #3b82f6', padding: '10px 12px' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                                            <ShieldCheck size={14} /> Formative Practice Gate
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#ffffff', fontWeight: 700 }}>
                                                            {packageAssessments.find(a => a.id === activePreviewUnit.assessmentGates?.formative?.assessmentId)?.title || 'Linked Formative Drill'}
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>
                                                            Rule: Must pass (≥ 80%) to unlock Summative Exam
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Summative Slot Preview */}
                                                {activePreviewUnit.assessmentGates.summative?.enabled && (
                                                    <div style={{ background: '#1e293b', border: '1px solid #a855f7', borderLeft: '4px solid #a855f7', padding: '10px 12px' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                                            <Award size={14} /> Formal Summative Examination
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#ffffff', fontWeight: 700 }}>
                                                            {packageAssessments.find(a => a.id === activePreviewUnit.assessmentGates?.summative?.assessmentId)?.title || 'Linked Summative Exam'}
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>
                                                            Progression: {activePreviewUnit.assessmentGates.summative.unlockNextOn === 'grading' ? 'Unlocks next lesson only after graded Competent (C)' : 'Unlocks next lesson immediately upon Submission'}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Assignment Slot Preview */}
                                                {activePreviewUnit.assessmentGates.other?.enabled && (
                                                    <div style={{ background: '#1e293b', border: '1px solid #64748b', borderLeft: '4px solid #94a3b8', padding: '10px 12px' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                                            <ClipboardCheck size={14} /> Assignment / Project Gate
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#ffffff', fontWeight: 700 }}>
                                                            {packageAssessments.find(a => a.id === activePreviewUnit.assessmentGates?.other?.assessmentId)?.title || 'Linked Capstone Task'}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                                        <Eye size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                                        <p style={{ fontSize: '0.85rem', margin: 0 }}>Select or edit any lesson to inspect its student preview</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* MODAL FOOTER */}
                <div className="pfm-footer" style={{ flexShrink: 0, borderRadius: '0px', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Tooltip content="Close without saving any changes made in this session." placement="top">
                        {/* <button type="button" className="pfm-btn pfm-btn--ghost" style={{ borderRadius: '0px' }} onClick={onClose} disabled={saving}>Discard Unsaved Changes</button> */}
                        <button
                            type="button"
                            className="pfm-btn pfm-btn--ghost"
                            onClick={() => {
                                localStorage.removeItem(DRAFT_STORAGE_KEY);
                                onClose();
                            }}
                        >
                            Discard Unsaved Changes
                        </button>
                    </Tooltip>
                    <Tooltip content="Batch commit all lessons, gates, and metadata to Cloud Firestore." placement="top">
                        <button type="button" className="pfm-btn pfm-btn--primary" style={{ borderRadius: '0px', minWidth: '220px', justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
                            {saving ? <><Loader2 size={13} className="pfm-spin" /> Saving Tree…</> : <><CheckCircle2 size={13} /> Commit Curriculum Structure</>}
                        </button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}




// // src/pages/AdminDashboard/ContentAuthoring/ContentBuilderModal.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';
// import Editor from '@monaco-editor/react';

// import {
//     collection, doc, writeBatch, serverTimestamp, getDocs, query
// } from 'firebase/firestore';
// import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
// import { db } from '../../../lib/firebase';
// import { saveLearningUnit } from '../../../services/contentService';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { createPortal } from 'react-dom';
// import Tooltip from '../../../components/common/Tooltip/Tooltip';
// import {
//     Plus, Video, FileText, Sparkles,
//     Bug, X, Clock, Layers, Zap, GraduationCap,
//     Bookmark, Save, Loader2, Trash2, Settings, CheckCircle2, Eye, Tv, Send, Mic, ExternalLink, Play, Timer,
//     Code, Target, GripVertical, ChevronDown, ArrowDownNarrowWide,
//     Paperclip, Lock, Tag, FileSpreadsheet, FileCode, UploadCloud, Info,
//     Bot, Award, HelpCircle
// } from 'lucide-react';
// import type {
//     InteractiveCheckConfig,
//     AccreditationBody,
//     AccreditationConfig,
//     MCQOption,
//     MCQQuestion
// } from '../../../types/content.types';
// import type { ExtendedLearningUnit } from './ContentAuthoring';
// import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// import {
//     CourseMetadataSettingsPanel,
//     STANDARD_ACCREDITATIONS,
//     TagSelector,
//     type FacilitatorInfo
// } from '../../../components/common/CourseMetadataSettingsPanel/CourseMetadataSettingsPanel';

// export interface LessonAttachment {
//     id: string;
//     name: string;
//     url: string;
//     fileType: string;
//     uploadedAt: string;
//     description?: string;
//     fileSize?: number;
// }

// interface ExtendedLearningUnitWithStatus extends ExtendedLearningUnit {
//     _justSaved?: boolean;
//     interactiveCheck?: InteractiveCheckConfig | null;
//     attachments?: LessonAttachment[];
//     isRequiredForNextUnit?: boolean;
//     tags?: string[];
//     linkedAssessmentId?: string | null;
//     unlinkedPolicy?: 'soft_gate' | 'hard_gate';
// }

// interface ContentBuilderModalProps {
//     activeContainer: any;
//     activeFramework: 'qcto' | 'secam';
//     linkedTemplate: any;
//     initialUnits: ExtendedLearningUnit[];
//     isMockMode: boolean;
//     onClose: () => void;
//     onSaveBatch: (drafts: ExtendedLearningUnit[], toDeleteIds: string[], checkpointMetadata?: any) => Promise<void>;
// }

// const QUILL_MODULES = {
//     toolbar: [
//         [{ 'header': [1, 2, 3, false] }],
//         ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
//         [{ 'list': 'ordered' }, { 'list': 'bullet' }],
//         ['link', 'clean']
//     ]
// };

// const generateUniqueId = (prefix: string) =>
//     `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// const createDefaultMCQQuestion = (questionNum: number = 1): MCQQuestion => ({
//     id: generateUniqueId('mcq_q'),
//     question: `Question ${questionNum}: What is the primary purpose of this topic?`,
//     options: [
//         { id: generateUniqueId('opt'), text: 'Option A (Correct)', isCorrect: true },
//         { id: generateUniqueId('opt'), text: 'Option B', isCorrect: false },
//         { id: generateUniqueId('opt'), text: 'Option C', isCorrect: false },
//         { id: generateUniqueId('opt'), text: 'Option D', isCorrect: false }
//     ]
// });

// const sanitizePayload = (obj: any): any => {
//     return JSON.parse(JSON.stringify(obj, (_, value) => (value === undefined ? null : value)));
// };

// export const sanitizeCodeInput = (input?: string): string => {
//     if (!input) return '';

//     let text = input;

//     text = text
//         .replace(/\u00A0/g, ' ')
//         .replace(/&nbsp;/gi, ' ');

//     text = text
//         .replace(/<\/p>\s*<p>/gi, '\n')
//         .replace(/<p[^>]*>/gi, '')
//         .replace(/<\/p>/gi, '\n')
//         .replace(/<br\s*\/?>/gi, '\n')
//         .replace(/<div[^>]*>/gi, '')
//         .replace(/<\/div>/gi, '\n')
//         .replace(/<pre[^>]*>/gi, '')
//         .replace(/<\/pre>/gi, '\n')
//         .replace(/<code[^>]*>/gi, '')
//         .replace(/<\/code>/gi, '');

//     let decoded = text;
//     for (let i = 0; i < 3; i++) {
//         if (!decoded.includes('&') && !decoded.includes('<')) break;
//         const parser = new DOMParser();
//         const doc = parser.parseFromString(decoded, 'text/html');
//         decoded = doc.body.textContent || '';
//     }

//     decoded = decoded.replace(/\u00A0/g, ' ').replace(/<[^>]*>/g, '');

//     return decoded;
// };

// const DEFAULT_BUGGY_CODE = `function UserProfile() {
//   return (
//     <h1>User Details</h1>
//     <p>Welcome to your profile!</p>
//   );
// }`;

// const DEFAULT_SOLUTION_CODE = `function UserProfile() {
//   return (
//     <>
//       <h1>User Details</h1>
//       <p>Welcome to your profile!</p>
//     </>
//   );
// }`;

// const extractYouTubeId = (url: string): string | null => {
//     const cleanUrl = url.trim();
//     if (cleanUrl.includes('youtu.be/')) {
//         return cleanUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || null;
//     } else if (cleanUrl.includes('youtube.com/shorts/')) {
//         return cleanUrl.split('youtube.com/shorts/')[1]?.split('?')[0]?.split('&')[0] || null;
//     } else if (cleanUrl.includes('youtube.com/live/')) {
//         return cleanUrl.split('youtube.com/live/')[1]?.split('?')[0]?.split('&')[0] || null;
//     } else if (cleanUrl.includes('youtube.com/embed/')) {
//         return cleanUrl.split('youtube.com/embed/')[1]?.split('?')[0]?.split('&')[0] || null;
//     } else if (cleanUrl.includes('youtube.com')) {
//         try {
//             const urlObj = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`);
//             return urlObj.searchParams.get('v');
//         } catch (e) {
//             return null;
//         }
//     }
//     return null;
// };

// const YOUTUBE_API_KEY = (import.meta as any).env?.VITE_YOUTUBE_API_KEY as string | undefined;

// const parseIso8601Duration = (iso: string): number => {
//     const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
//     if (!match) return 0;
//     const hours = parseInt(match[1] || '0', 10);
//     const minutes = parseInt(match[2] || '0', 10);
//     const seconds = parseInt(match[3] || '0', 10);
//     return hours * 3600 + minutes * 60 + seconds;
// };

// const fetchYouTubeDurationViaDataApi = async (videoId: string): Promise<number | null> => {
//     if (!YOUTUBE_API_KEY) return null;
//     try {
//         const res = await fetch(
//             `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${videoId}&key=${YOUTUBE_API_KEY}`
//         );
//         if (!res.ok) return null;
//         const data = await res.json();
//         const item = data?.items?.[0];
//         if (!item) return null;
//         const isoDuration = item.contentDetails?.duration;
//         if (!isoDuration) return null;

//         const totalSeconds = parseIso8601Duration(isoDuration);
//         if (totalSeconds <= 0) return null;

//         return Math.max(1, Math.ceil(totalSeconds / 60));
//     } catch (e) {
//         return null;
//     }
// };

// let ytApiPromise: Promise<void> | null = null;

// const loadYouTubeApi = (): Promise<void> => {
//     if ((window as any).YT && (window as any).YT.Player) {
//         return Promise.resolve();
//     }
//     if (ytApiPromise) return ytApiPromise;

//     ytApiPromise = new Promise<void>((resolve, reject) => {
//         if (!document.getElementById('yt-iframe-api')) {
//             const tag = document.createElement('script');
//             tag.id = 'yt-iframe-api';
//             tag.src = 'https://www.youtube.com/iframe_api';
//             tag.onerror = () => reject(new Error('Failed to load YouTube iframe API script'));
//             document.head.appendChild(tag);
//         }
//         const previousOnReady = (window as any).onYouTubeIframeAPIReady;
//         (window as any).onYouTubeIframeAPIReady = () => {
//             if (typeof previousOnReady === 'function') previousOnReady();
//             resolve();
//         };

//         const interval = setInterval(() => {
//             if ((window as any).YT && (window as any).YT.Player) {
//                 clearInterval(interval);
//                 resolve();
//             }
//         }, 100);

//         setTimeout(() => {
//             clearInterval(interval);
//             if (!((window as any).YT && (window as any).YT.Player)) {
//                 reject(new Error('YouTube iframe API load timed out'));
//             }
//         }, 10000);
//     }).catch(err => {
//         ytApiPromise = null;
//         throw err;
//     });

//     return ytApiPromise;
// };

// const fetchYouTubeDurationViaIframe = async (videoId: string): Promise<number | null> => {
//     try {
//         await loadYouTubeApi();
//     } catch (err) {
//         return null;
//     }

//     return new Promise<number | null>((resolve) => {
//         const tempDiv = document.createElement('div');
//         Object.assign(tempDiv.style, {
//             position: 'fixed',
//             bottom: '0px',
//             right: '0px',
//             width: '320px',
//             height: '240px',
//             opacity: '0.001',
//             pointerEvents: 'none',
//             zIndex: '-99999'
//         });
//         document.body.appendChild(tempDiv);

//         let resolved = false;
//         let pollInterval: any = null;

//         const cleanup = () => {
//             if (pollInterval) clearInterval(pollInterval);
//             if (tempDiv.parentNode) {
//                 tempDiv.parentNode.removeChild(tempDiv);
//             }
//         };

//         let player: any = null;
//         const timeoutId = setTimeout(() => {
//             if (!resolved) {
//                 resolved = true;
//                 if (player) {
//                     try { player.destroy(); } catch (e) { }
//                 }
//                 cleanup();
//                 resolve(null);
//             }
//         }, 8000);

//         try {
//             player = new (window as any).YT.Player(tempDiv, {
//                 videoId: videoId,
//                 playerVars: {
//                     autoplay: 1,
//                     mute: 1,
//                     controls: 0,
//                     disablekb: 1,
//                     origin: window.location.origin
//                 },
//                 events: {
//                     onReady: (event: any) => {
//                         try {
//                             event.target.mute();
//                             event.target.playVideo();
//                         } catch (e) { }

//                         let attempts = 0;
//                         pollInterval = setInterval(() => {
//                             if (resolved) {
//                                 clearInterval(pollInterval);
//                                 return;
//                             }
//                             attempts++;
//                             let durSecs = 0;
//                             try {
//                                 durSecs = event.target.getDuration();
//                             } catch (e) { }

//                             if (durSecs && durSecs > 0) {
//                                 resolved = true;
//                                 clearInterval(pollInterval);
//                                 clearTimeout(timeoutId);
//                                 try {
//                                     event.target.pauseVideo();
//                                     event.target.destroy();
//                                 } catch (e) { }
//                                 cleanup();
//                                 const mins = Math.max(1, Math.ceil(durSecs / 60));
//                                 resolve(mins);
//                             } else if (attempts > 30) {
//                                 resolved = true;
//                                 clearInterval(pollInterval);
//                                 clearTimeout(timeoutId);
//                                 try { event.target.destroy(); } catch (e) { }
//                                 cleanup();
//                                 resolve(null);
//                             }
//                         }, 100);
//                     },
//                     onError: () => {
//                         if (resolved) return;
//                         cleanup();
//                         clearTimeout(timeoutId);
//                         resolved = true;
//                         resolve(null);
//                     }
//                 }
//             });
//         } catch (err) {
//             if (!resolved) {
//                 cleanup();
//                 clearTimeout(timeoutId);
//                 resolved = true;
//                 resolve(null);
//             }
//         }
//     });
// };

// export const fetchVideoDurationMinutes = async (url: string): Promise<number | null> => {
//     if (!url) return null;
//     const cleanUrl = url.trim();

//     if (cleanUrl.includes('vimeo.com')) {
//         try {
//             const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(cleanUrl)}`);
//             if (res.ok) {
//                 const data = await res.json();
//                 if (data.duration) {
//                     return Math.max(1, Math.ceil(data.duration / 60));
//                 }
//             }
//         } catch (e) { }
//     }

//     if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
//         const videoId = extractYouTubeId(cleanUrl);
//         if (!videoId) return null;

//         const apiResult = await fetchYouTubeDurationViaDataApi(videoId);
//         if (apiResult !== null) return apiResult;

//         return fetchYouTubeDurationViaIframe(videoId);
//     }

//     if (cleanUrl.match(/\.(mp4|webm|ogg)($|\?)/i)) {
//         return new Promise((resolve) => {
//             const video = document.createElement('video');
//             video.preload = 'metadata';
//             video.src = cleanUrl;
//             video.onloadedmetadata = () => {
//                 if (video.duration && !isNaN(video.duration)) {
//                     resolve(Math.max(1, Math.ceil(video.duration / 60)));
//                 } else {
//                     resolve(null);
//                 }
//             };
//             video.onerror = () => resolve(null);
//         });
//     }

//     return null;
// };

// export const getEmbedVideoUrl = (url?: string): string | null => {
//     if (!url) return null;
//     try {
//         const cleanUrl = url.trim();

//         if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
//             const sanitizedId = extractYouTubeId(cleanUrl)?.replace(/[^a-zA-Z0-9_-]/g, '');
//             if (sanitizedId && sanitizedId.length >= 10) {
//                 return `https://www.youtube.com/embed/${sanitizedId}?controls=0&rel=0&autoplay=0&modestbranding=1`;
//             }
//         }

//         if (cleanUrl.includes('vimeo.com')) {
//             let videoId = '';
//             let hash = '';

//             const unlistedMatch = cleanUrl.match(/vimeo\.com\/(\d+)\/([a-zA-Z0-9]+)/);
//             if (unlistedMatch) {
//                 videoId = unlistedMatch[1];
//                 hash = unlistedMatch[2];
//             } else if (cleanUrl.includes('player.vimeo.com/video/')) {
//                 const parts = cleanUrl.split('player.vimeo.com/video/')[1]?.split('?')[0]?.split('/');
//                 videoId = parts[0] || '';
//                 const searchParams = new URLSearchParams(cleanUrl.split('?')[1] || '');
//                 hash = searchParams.get('h') || parts[1] || '';
//             } else {
//                 const match = cleanUrl.match(/(?:vimeo\.com\/)(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/\d+\/video\/|video\/|manage\/videos\/)?(\d+)/);
//                 if (match && match[1]) {
//                     videoId = match[1];
//                 }
//             }

//             if (videoId) {
//                 return `https://player.vimeo.com/video/${videoId}?controls=0&autopause=0${hash ? `&h=${hash}` : ''}`;
//             }
//         }

//         return cleanUrl;
//     } catch (e) {
//         return url;
//     }
// };

// export const getVideoThumbnail = (url?: string): string | null => {
//     if (!url) return null;
//     try {
//         const cleanUrl = url.trim();

//         if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
//             const sanitizedId = extractYouTubeId(cleanUrl)?.replace(/[^a-zA-Z0-9_-]/g, '');
//             if (sanitizedId && sanitizedId.length >= 10) {
//                 return `https://img.youtube.com/vi/${sanitizedId}/hqdefault.jpg`;
//             }
//         }

//         if (cleanUrl.includes('vimeo.com')) {
//             const match = cleanUrl.match(/vimeo\.com\/(?:video\/|manage\/videos\/)?(\d+)/);
//             if (match && match[1]) {
//                 return `https://vumbnail.com/${match[1]}.jpg`;
//             }
//         }
//     } catch (e) { }
//     return null;
// };

// export const openPopoutPlayer = (videoUrl: string) => {
//     if (!videoUrl) return;
//     const cleanUrl = videoUrl.trim();
//     let embedUrl = getEmbedVideoUrl(cleanUrl);
//     if (!embedUrl) embedUrl = cleanUrl;

//     const width = 880;
//     const height = 500;
//     const left = (window.innerWidth - width) / 2;
//     const top = (window.innerHeight - height) / 2;

//     window.open(
//         embedUrl,
//         '_blank',
//         `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=no,status=no`
//     );
// };

// const resequenceDraftUnits = (
//     units: ExtendedLearningUnitWithStatus[],
//     secamStructure: any[],
//     activeFramework: 'qcto' | 'secam'
// ): ExtendedLearningUnitWithStatus[] => {
//     const unitsCopy = [...units];
//     const resequenced: ExtendedLearningUnitWithStatus[] = [];
//     const processedIds = new Set<string>();
//     let counter = 1;

//     if (activeFramework === 'secam' && Array.isArray(secamStructure)) {
//         secamStructure.forEach((sprint) => {
//             const days = sprint.days || [];
//             days.forEach((day: any) => {
//                 const dayUnits = unitsCopy.filter(
//                     u => u.sprintTitle === sprint.title && u.dayOrLessonTitle === day.title
//                 );
//                 dayUnits.forEach(u => {
//                     if (!processedIds.has(u.id)) {
//                         processedIds.add(u.id);
//                         resequenced.push({
//                             ...u,
//                             orderIndex: counter++
//                         });
//                     }
//                 });
//             });
//         });
//     }

//     unitsCopy.forEach(u => {
//         if (!processedIds.has(u.id)) {
//             processedIds.add(u.id);
//             resequenced.push({
//                 ...u,
//                 orderIndex: counter++
//             });
//         }
//     });

//     return resequenced;
// };

// export const ContentBuilderModal: React.FC<ContentBuilderModalProps> = ({
//     activeContainer,
//     activeFramework,
//     linkedTemplate,
//     initialUnits,
//     isMockMode,
//     onClose,
//     onSaveBatch
// }) => {
//     const toast = useToast();

//     // FETCH FORMAL SETA / QCTO ASSESSMENTS FOR LINKING
//     const [packageAssessments, setPackageAssessments] = useState<any[]>([]);
//     const [loadingAssessments, setLoadingAssessments] = useState<boolean>(false);

//     useEffect(() => {
//         let isMounted = true;
//         const fetchPackageAssessments = async () => {
//             setLoadingAssessments(true);
//             try {
//                 const q = query(collection(db, 'assessments'));
//                 const snap = await getDocs(q);
//                 if (isMounted) {
//                     const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
//                     setPackageAssessments(list);
//                 }
//             } catch (err) {
//                 console.error('[ContentBuilderModal] Error fetching assessments:', err);
//             } finally {
//                 if (isMounted) setLoadingAssessments(false);
//             }
//         };
//         fetchPackageAssessments();
//         return () => { isMounted = false; };
//     }, []);

//     // INITIALIZE DRAFT UNITS WITH NORMALIZED LINKED ASSESSMENT & MCQ STRUCTURE
//     const [draftUnits, setDraftUnits] = useState<ExtendedLearningUnitWithStatus[]>(() =>
//         initialUnits.map(unit => {
//             const ext = unit as ExtendedLearningUnitWithStatus;
//             const resolvedAssessmentId = ext.linkedAssessmentId ||
//                 (unit as any).assessmentId ||
//                 (unit as any).formalAssessmentId ||
//                 (typeof (unit as any).linkedAssessment === 'string' ? (unit as any).linkedAssessment : null) ||
//                 null;

//             const existingCheck = unit.interactiveCheck ? {
//                 ...unit.interactiveCheck,
//                 buggyCode: sanitizeCodeInput(unit.interactiveCheck.buggyCode),
//                 solutionCode: sanitizeCodeInput(unit.interactiveCheck.solutionCode),
//                 instructions: sanitizeCodeInput(unit.interactiveCheck.instructions)
//             } : undefined;

//             if (existingCheck && existingCheck.checkType === 'mcq') {
//                 if (!existingCheck.mcqQuestions || existingCheck.mcqQuestions.length === 0) {
//                     if (existingCheck.mcqQuestion) {
//                         existingCheck.mcqQuestions = [{
//                             id: generateUniqueId('mcq_q'),
//                             question: existingCheck.mcqQuestion,
//                             options: existingCheck.mcqOptions || []
//                         }];
//                     } else {
//                         existingCheck.mcqQuestions = [createDefaultMCQQuestion(1)];
//                     }
//                 }
//             }

//             return {
//                 ...unit,
//                 linkedAssessmentId: resolvedAssessmentId,
//                 unlinkedPolicy: ext.unlinkedPolicy || 'soft_gate',
//                 interactiveCheck: existingCheck
//             };
//         })
//     );

//     const [deletedIds, setDeletedIds] = useState<string[]>([]);
//     const [saving, setSaving] = useState(false);

//     const [fetchingDurationId, setFetchingDurationId] = useState<string | null>(null);
//     const [uploadingAttachmentForId, setUploadingAttachmentForId] = useState<string | null>(null);
//     const [attachmentUploadProgress, setAttachmentUploadProgress] = useState<number>(0);

//     const [collapsedSprintIds, setCollapsedSprintIds] = useState<Set<string>>(new Set());
//     const [collapsedDayIds, setCollapsedDayIds] = useState<Set<string>>(new Set());

//     const [draggedSprintId, setDraggedSprintId] = useState<string | null>(null);
//     const [dragOverSprintId, setDragOverSprintId] = useState<string | null>(null);

//     const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
//     const [dragOverDayId, setDragOverDayId] = useState<string | null>(null);

//     const [draggedLessonId, setDraggedLessonId] = useState<string | null>(null);
//     const [dragOverLessonId, setDragOverLessonId] = useState<string | null>(null);

//     const [checkpointScope, setCheckpointScope] = useState<'per_lesson' | 'per_day' | 'per_sprint'>(
//         activeContainer?.checkpointMetadata?.checkpointScope || activeContainer?.checkpointScope || 'per_lesson'
//     );

//     const [previewVideoUrl, setPreviewVideoUrl] = useState<string>(
//         activeContainer?.previewVideoUrl || activeContainer?.checkpointMetadata?.previewVideoUrl || ''
//     );

//     const [illustrationType, setIllustrationType] = useState<string>(
//         activeContainer?.illustrationType || activeContainer?.checkpointMetadata?.illustrationType || 'code'
//     );
//     const [themeColor, setThemeColor] = useState<string>(
//         activeContainer?.themeColor || activeContainer?.checkpointMetadata?.themeColor || '#0284c7'
//     );

//     const [courseLevel, setCourseLevel] = useState<string>(
//         activeContainer?.level || activeContainer?.checkpointMetadata?.courseLevel || 'beginner'
//     );
//     const [courseDescription, setCourseDescription] = useState<string>(
//         activeContainer?.description || activeContainer?.checkpointMetadata?.courseDescription || ''
//     );
//     const [prerequisites, setPrerequisites] = useState<string[]>(
//         activeContainer?.prerequisites || activeContainer?.checkpointMetadata?.prerequisites || []
//     );
//     const [learningOutcomes, setLearningOutcomes] = useState<string[]>(
//         activeContainer?.learningOutcomes || activeContainer?.checkpointMetadata?.learningOutcomes || []
//     );
//     const [targetAudience, setTargetAudience] = useState<string[]>(
//         activeContainer?.targetAudience || activeContainer?.checkpointMetadata?.targetAudience || []
//     );
//     const [isCertificateAwarded, setIsCertificateAwarded] = useState<boolean>(
//         activeContainer?.isCertificateAwarded ?? activeContainer?.checkpointMetadata?.isCertificateAwarded ?? true
//     );
//     const [courseTags, setCourseTags] = useState<string[]>(
//         activeContainer?.tags || activeContainer?.checkpointMetadata?.courseTags || []
//     );

//     const [courseworkHours, setCourseworkHours] = useState<number>(
//         activeContainer?.courseworkHours || activeContainer?.checkpointMetadata?.courseworkHours || 0
//     );

//     const [instructors, setInstructors] = useState<FacilitatorInfo[]>(
//         activeContainer?.instructors || activeContainer?.checkpointMetadata?.instructors || [
//             { name: 'mLab Facilitator Team', role: 'Lead Technical Instructor', initials: 'ML' }
//         ]
//     );

//     const [materialIncludes, setMaterialIncludes] = useState<string[]>(
//         activeContainer?.materialIncludes || activeContainer?.checkpointMetadata?.materialIncludes || [
//             'Hands-on Video Tutorials & Source Code',
//             'Downloadable Lab Guides & Asset Packs',
//             'Interactive AI Peer Reviews & Quizzes',
//             'Industry Certificate of Completion'
//         ]
//     );

//     const initialAccreditation = activeContainer?.defaultAccreditation?.body || activeContainer?.checkpointMetadata?.accreditationBody || activeContainer?.accreditationBody || 'none';
//     const isStandardAccreditation = STANDARD_ACCREDITATIONS.some(a => a.value === initialAccreditation);

//     const [isAccredited, setIsAccredited] = useState<boolean>(
//         activeContainer?.defaultAccreditation?.isAccredited ??
//         activeContainer?.checkpointMetadata?.isAccredited ??
//         (initialAccreditation !== 'none')
//     );

//     const [accreditationBody, setAccreditationBody] = useState<string>(isStandardAccreditation ? initialAccreditation : 'other');
//     const [customAccreditationText, setCustomAccreditationText] = useState<string>(
//         isStandardAccreditation ? '' : (activeContainer?.defaultAccreditation?.customText || activeContainer?.checkpointMetadata?.customAccreditationText || initialAccreditation)
//     );
//     const [saqaId, setSaqaId] = useState<string>(activeContainer?.defaultAccreditation?.saqaId || '');
//     const [nqfLevel, setNqfLevel] = useState<string | number>(activeContainer?.defaultAccreditation?.nqfLevel || 5);
//     const [credits, setCredits] = useState<number>(activeContainer?.defaultAccreditation?.credits || 120);

//     const [previewLessonId, setPreviewLessonId] = useState<string | null>(initialUnits[0]?.id || null);

//     const totalContentMinutes = useMemo(() => {
//         return draftUnits.reduce((acc, unit) => acc + (Number(unit.estimatedMinutes) || 0), 0);
//     }, [draftUnits]);

//     const totalContentHours = useMemo(() => {
//         return Math.round((totalContentMinutes / 60) * 10) / 10;
//     }, [totalContentMinutes]);

//     const grandTotalHours = useMemo(() => {
//         return Math.round((totalContentHours + courseworkHours) * 10) / 10;
//     }, [totalContentHours, courseworkHours]);

//     const activePreviewUnit = useMemo(() => {
//         if (previewLessonId === 'COURSE_PREVIEW') return null;
//         return draftUnits.find(u => u.id === previewLessonId) || draftUnits[0] || null;
//     }, [draftUnits, previewLessonId]);

//     const [secamStructure, setSecamStructure] = useState<{
//         id: string;
//         title: string;
//         sprintCheckpoint?: InteractiveCheckConfig;
//         days: { id: string; title: string; dayCheckpoint?: InteractiveCheckConfig }[];
//     }[]>([]);

//     const [qctoModuleCheckpoints, setQctoModuleCheckpoints] = useState<Record<string, InteractiveCheckConfig>>({});
//     const [qctoTopicCheckpoints, setQctoTopicCheckpoints] = useState<Record<string, InteractiveCheckConfig>>({});

//     const [confirmModal, setConfirmModal] = useState<{
//         isOpen: boolean;
//         type: StatusType;
//         title: string;
//         message: string;
//         onConfirm?: () => void;
//         confirmText?: string;
//         cancelText?: string;
//     }>({ isOpen: false, type: 'warning', title: '', message: '' });

//     // DYNAMIC LOCK PREVIEW COMPUTATION FOR BUILDER
//     const mockUnlockedUnitIds = useMemo(() => {
//         const unlocked = new Set<string>();
//         let activeLockEnforced = false;

//         const sorted = [...draftUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

//         for (const u of sorted) {
//             if (!activeLockEnforced) {
//                 unlocked.add(u.id);
//             }
//             const requiresNextLock = u.isRequiredForNextUnit === true ||
//                 Boolean(u.linkedAssessmentId && u.unlinkedPolicy === 'hard_gate');

//             if (requiresNextLock) {
//                 activeLockEnforced = true;
//             }
//         }
//         return unlocked;
//     }, [draftUnits]);

//     useEffect(() => {
//         const unitsSprintMap = new Map<string, Set<string>>();
//         initialUnits.forEach(u => {
//             if (u.sprintTitle) {
//                 if (!unitsSprintMap.has(u.sprintTitle)) {
//                     unitsSprintMap.set(u.sprintTitle, new Set());
//                 }
//                 if (u.dayOrLessonTitle) {
//                     unitsSprintMap.get(u.sprintTitle)!.add(u.dayOrLessonTitle);
//                 }
//             }
//         });

//         if (activeContainer?.checkpointMetadata?.secamStructure?.length > 0) {
//             const metaStructure = activeContainer.checkpointMetadata.secamStructure;
//             const existingSprintTitles = new Set(metaStructure.map((s: any) => s.title));

//             const mergedStructure = metaStructure.map((s: any) => ({
//                 ...s,
//                 id: s.id || generateUniqueId('sprint'),
//                 days: (s.days || []).map((d: any) => ({
//                     ...d,
//                     id: d.id || generateUniqueId('day')
//                 }))
//             }));

//             unitsSprintMap.forEach((daysSet, sprintTitle) => {
//                 if (!existingSprintTitles.has(sprintTitle)) {
//                     mergedStructure.push({
//                         id: generateUniqueId('sprint'),
//                         title: sprintTitle,
//                         days: Array.from(daysSet).map(dayTitle => ({
//                             id: generateUniqueId('day'),
//                             title: dayTitle
//                         }))
//                     });
//                 } else {
//                     const sprintObj = mergedStructure.find((s: any) => s.title === sprintTitle);
//                     if (sprintObj) {
//                         const existingDayTitles = new Set((sprintObj.days || []).map((d: any) => d.title));
//                         daysSet.forEach(dayTitle => {
//                             if (!existingDayTitles.has(dayTitle)) {
//                                 sprintObj.days.push({
//                                     id: generateUniqueId('day'),
//                                     title: dayTitle
//                                 });
//                             }
//                         });
//                     }
//                 }
//             });

//             setSecamStructure(mergedStructure);
//         } else if (activeFramework === 'secam') {
//             const newStructure: typeof secamStructure = [];
//             unitsSprintMap.forEach((daysSet, sprintTitle) => {
//                 newStructure.push({
//                     id: generateUniqueId('sprint'),
//                     title: sprintTitle,
//                     days: Array.from(daysSet).map(dayTitle => ({
//                         id: generateUniqueId('day'),
//                         title: dayTitle
//                     }))
//                 });
//             });
//             setSecamStructure(newStructure);
//         }
//     }, [initialUnits, activeFramework, activeContainer]);

//     useEffect(() => {
//         let isMounted = true;

//         const processInitialVideoDurations = async () => {
//             const videoUnits = initialUnits.filter(u => u.unitType === 'video' && u.videoUrl && u.videoUrl.trim().length > 10);

//             for (const unit of videoUnits) {
//                 if (!isMounted) break;
//                 setFetchingDurationId(unit.id);
//                 try {
//                     const dur = await fetchVideoDurationMinutes(unit.videoUrl!);
//                     if (dur && dur > 0 && isMounted) {
//                         updateDraftLesson(unit.id, 'estimatedMinutes', dur);
//                     }
//                 } catch (err) {
//                     console.error(`[VideoFetch] Failed duration check for "${unit.title}":`, err);
//                 }
//             }
//             if (isMounted) setFetchingDurationId(null);
//         };

//         processInitialVideoDurations();

//         return () => { isMounted = false; };
//     }, []);

//     const toggleSprintCollapse = (sprintId: string) => {
//         setCollapsedSprintIds(prev => {
//             const next = new Set(prev);
//             if (next.has(sprintId)) next.delete(sprintId); else next.add(sprintId);
//             return next;
//         });
//     };

//     const toggleDayCollapse = (dayId: string) => {
//         setCollapsedDayIds(prev => {
//             const next = new Set(prev);
//             if (next.has(dayId)) next.delete(dayId); else next.add(dayId);
//             return next;
//         });
//     };

//     const handleDropSprint = (targetSprintId: string) => {
//         if (!draggedSprintId || draggedSprintId === targetSprintId) {
//             setDraggedSprintId(null);
//             setDragOverSprintId(null);
//             return;
//         }

//         setSecamStructure(prev => {
//             const draggedIndex = prev.findIndex(s => s.id === draggedSprintId);
//             const targetIndex = prev.findIndex(s => s.id === targetSprintId);

//             if (draggedIndex === -1 || targetIndex === -1) return prev;

//             const next = [...prev];
//             const [movedSprint] = next.splice(draggedIndex, 1);
//             next.splice(targetIndex, 0, movedSprint);

//             setDraftUnits(currentUnits => resequenceDraftUnits(currentUnits, next, activeFramework));
//             return next;
//         });

//         setDraggedSprintId(null);
//         setDragOverSprintId(null);
//     };

//     const handleDropDay = (sprintId: string, targetDayId: string) => {
//         if (!draggedDayId || draggedDayId === targetDayId) {
//             setDraggedDayId(null);
//             setDragOverDayId(null);
//             return;
//         }

//         setSecamStructure(prev => {
//             const nextStructure = prev.map(sprint => {
//                 if (sprint.id !== sprintId) return sprint;

//                 const draggedIndex = sprint.days.findIndex(d => d.id === draggedDayId);
//                 const targetIndex = sprint.days.findIndex(d => d.id === targetDayId);

//                 if (draggedIndex === -1 || targetIndex === -1) return sprint;

//                 const nextDays = [...sprint.days];
//                 const [movedDay] = nextDays.splice(draggedIndex, 1);
//                 nextDays.splice(targetIndex, 0, movedDay);

//                 return {
//                     ...sprint,
//                     days: nextDays
//                 };
//             });

//             setDraftUnits(currentUnits => resequenceDraftUnits(currentUnits, nextStructure, activeFramework));
//             return nextStructure;
//         });

//         setDraggedDayId(null);
//         setDragOverDayId(null);
//     };

//     const handleDropLesson = (targetLessonId: string) => {
//         if (!draggedLessonId || draggedLessonId === targetLessonId) {
//             setDraggedLessonId(null);
//             setDragOverLessonId(null);
//             return;
//         }

//         setDraftUnits(prev => {
//             const draggedIndex = prev.findIndex(u => u.id === draggedLessonId);
//             const targetIndex = prev.findIndex(u => u.id === targetLessonId);

//             if (draggedIndex === -1 || targetIndex === -1) return prev;

//             const targetUnit = prev[targetIndex];
//             const draggedUnit = prev[draggedIndex];

//             const updatedDraggedUnit = {
//                 ...draggedUnit,
//                 sprintTitle: targetUnit.sprintTitle,
//                 dayOrLessonTitle: targetUnit.dayOrLessonTitle,
//                 moduleType: targetUnit.moduleType,
//                 moduleCode: targetUnit.moduleCode,
//                 topicId: targetUnit.topicId
//             };

//             const next = [...prev];
//             next.splice(draggedIndex, 1);
//             next.splice(targetIndex, 0, updatedDraggedUnit);

//             return resequenceDraftUnits(next, secamStructure, activeFramework);
//         });

//         setDraggedLessonId(null);
//         setDragOverLessonId(null);
//     };

//     const hasChanges = () => {
//         if (deletedIds.length > 0) return true;
//         if (draftUnits.length !== initialUnits.length) return true;

//         const unitsChanged = JSON.stringify(
//             draftUnits.map(u => ({
//                 id: u.id,
//                 title: u.title,
//                 unitType: u.unitType,
//                 estimatedMinutes: u.estimatedMinutes,
//                 orderIndex: u.orderIndex,
//                 sprintTitle: u.sprintTitle,
//                 dayOrLessonTitle: u.dayOrLessonTitle,
//                 moduleCode: u.moduleCode,
//                 moduleType: u.moduleType,
//                 topicId: u.topicId,
//                 videoUrl: u.videoUrl,
//                 contentHtml: u.contentHtml,
//                 requiredWatchPercentage: u.requiredWatchPercentage,
//                 interactiveCheck: u.interactiveCheck,
//                 attachments: u.attachments,
//                 isRequiredForNextUnit: u.isRequiredForNextUnit,
//                 tags: u.tags,
//                 linkedAssessmentId: u.linkedAssessmentId || null,
//                 unlinkedPolicy: u.unlinkedPolicy || 'soft_gate'
//             }))
//         ) !== JSON.stringify(
//             initialUnits.map(u => {
//                 const ext = u as ExtendedLearningUnitWithStatus;
//                 const resolvedAssessmentId = ext.linkedAssessmentId || (u as any).assessmentId || (u as any).formalAssessmentId || (typeof (u as any).linkedAssessment === 'string' ? (u as any).linkedAssessment : null) || null;

//                 const check = u.interactiveCheck ? {
//                     ...u.interactiveCheck,
//                     buggyCode: sanitizeCodeInput(u.interactiveCheck.buggyCode),
//                     solutionCode: sanitizeCodeInput(u.interactiveCheck.solutionCode)
//                 } : null;

//                 if (check && check.checkType === 'mcq') {
//                     if (!check.mcqQuestions || check.mcqQuestions.length === 0) {
//                         if (check.mcqQuestion) {
//                             check.mcqQuestions = [{
//                                 id: generateUniqueId('mcq_q'),
//                                 question: check.mcqQuestion,
//                                 options: check.mcqOptions || []
//                             }];
//                         } else {
//                             check.mcqQuestions = [createDefaultMCQQuestion(1)];
//                         }
//                     }
//                 }

//                 return {
//                     id: u.id,
//                     title: u.title,
//                     unitType: u.unitType,
//                     estimatedMinutes: u.estimatedMinutes,
//                     orderIndex: u.orderIndex,
//                     sprintTitle: u.sprintTitle,
//                     dayOrLessonTitle: u.dayOrLessonTitle,
//                     moduleCode: u.moduleCode,
//                     moduleType: u.moduleType,
//                     topicId: u.topicId,
//                     videoUrl: u.videoUrl,
//                     contentHtml: u.contentHtml,
//                     requiredWatchPercentage: u.requiredWatchPercentage,
//                     interactiveCheck: check,
//                     attachments: u.attachments,
//                     isRequiredForNextUnit: u.isRequiredForNextUnit,
//                     tags: u.tags,
//                     linkedAssessmentId: resolvedAssessmentId,
//                     unlinkedPolicy: ext.unlinkedPolicy || 'soft_gate'
//                 };
//             })
//         );

//         if (unitsChanged) return true;

//         const initialMetadata = {
//             illustrationType: activeContainer?.illustrationType || activeContainer?.checkpointMetadata?.illustrationType || 'code',
//             themeColor: activeContainer?.themeColor || activeContainer?.checkpointMetadata?.themeColor || '#0284c7',
//             courseLevel: activeContainer?.level || activeContainer?.checkpointMetadata?.courseLevel || 'beginner',
//             courseDescription: activeContainer?.description || activeContainer?.checkpointMetadata?.courseDescription || '',
//             prerequisites: activeContainer?.prerequisites || activeContainer?.checkpointMetadata?.prerequisites || [],
//             learningOutcomes: activeContainer?.learningOutcomes || activeContainer?.checkpointMetadata?.learningOutcomes || [],
//             targetAudience: activeContainer?.targetAudience || activeContainer?.checkpointMetadata?.targetAudience || [],
//             isCertificateAwarded: activeContainer?.isCertificateAwarded ?? activeContainer?.checkpointMetadata?.isCertificateAwarded ?? true,
//             courseTags: activeContainer?.tags || activeContainer?.checkpointMetadata?.courseTags || [],
//             instructors: activeContainer?.instructors || activeContainer?.checkpointMetadata?.instructors || [],
//             courseworkHours: activeContainer?.courseworkHours || activeContainer?.checkpointMetadata?.courseworkHours || 0,
//             materialIncludes: activeContainer?.materialIncludes || activeContainer?.checkpointMetadata?.materialIncludes || [],
//             previewVideoUrl: activeContainer?.previewVideoUrl || activeContainer?.checkpointMetadata?.previewVideoUrl || '',
//             checkpointScope: activeContainer?.checkpointMetadata?.checkpointScope || activeContainer?.checkpointScope || 'per_lesson',
//             isAccredited: activeContainer?.defaultAccreditation?.isAccredited ?? activeContainer?.checkpointMetadata?.isAccredited ?? false,
//             accreditationBody: activeContainer?.defaultAccreditation?.body || activeContainer?.checkpointMetadata?.accreditationBody || 'none',
//             customAccreditationText: activeContainer?.defaultAccreditation?.customText || activeContainer?.checkpointMetadata?.customAccreditationText || '',
//             saqaId: activeContainer?.defaultAccreditation?.saqaId || '',
//             nqfLevel: activeContainer?.defaultAccreditation?.nqfLevel || 5,
//             credits: activeContainer?.defaultAccreditation?.credits || 120,
//             secamStructure: activeContainer?.checkpointMetadata?.secamStructure || []
//         };

//         const currentMetadata = {
//             illustrationType,
//             themeColor,
//             courseLevel,
//             courseDescription,
//             prerequisites,
//             learningOutcomes,
//             targetAudience,
//             isCertificateAwarded,
//             courseTags,
//             instructors,
//             courseworkHours,
//             materialIncludes,
//             previewVideoUrl: previewVideoUrl.trim(),
//             checkpointScope,
//             isAccredited,
//             accreditationBody: !isAccredited ? 'none' : accreditationBody,
//             customAccreditationText: isAccredited && accreditationBody === 'other' ? customAccreditationText.trim() : '',
//             saqaId: isAccredited ? saqaId.trim() : '',
//             nqfLevel: isAccredited ? nqfLevel : 5,
//             credits: isAccredited ? Number(credits) : 120,
//             secamStructure
//         };

//         return JSON.stringify(initialMetadata) !== JSON.stringify(currentMetadata);
//     };

//     const handleSave = async () => {
//         if (!hasChanges()) {
//             toast.info("No changes detected. Dismissed without database writes.");
//             onClose();
//             return;
//         }

//         setSaving(true);
//         console.group('[ContentBuilderModal - SAVE BATCH] Initiating Curriculum Commit');
//         try {
//             const resequenced = resequenceDraftUnits(draftUnits, secamStructure, activeFramework);

//             const finalAccreditationBody = !isAccredited ? 'none' : (
//                 accreditationBody === 'other'
//                     ? (customAccreditationText.trim() || 'Custom Accreditation')
//                     : accreditationBody
//             );

//             const accreditationConfig: AccreditationConfig = sanitizePayload({
//                 isAccredited,
//                 body: isAccredited ? (accreditationBody as AccreditationBody) : 'none',
//                 customText: isAccredited && accreditationBody === 'other' ? customAccreditationText.trim() : null,
//                 saqaId: isAccredited ? (saqaId.trim() || null) : null,
//                 nqfLevel: isAccredited ? (nqfLevel || null) : null,
//                 credits: isAccredited ? (Number(credits) || 0) : 0
//             });

//             const finalMaterialIncludes = materialIncludes.length > 0 ? materialIncludes : [
//                 `${totalContentHours}h content + ${courseworkHours}h projects`,
//                 'Downloadable lab guides & assets',
//                 'Interactive AI code challenges',
//                 'Certificate of Completion'
//             ];

//             const checkpointMetadata = sanitizePayload({
//                 illustrationType,
//                 themeColor,
//                 isAccredited,
//                 checkpointScope,
//                 previewVideoUrl: previewVideoUrl.trim(),
//                 secamStructure,
//                 qctoModuleCheckpoints,
//                 qctoTopicCheckpoints,
//                 accreditationBody: finalAccreditationBody,
//                 customAccreditationText: isAccredited ? customAccreditationText.trim() : '',
//                 courseLevel,
//                 courseDescription,
//                 prerequisites,
//                 learningOutcomes,
//                 targetAudience,
//                 isCertificateAwarded,
//                 courseTags,
//                 instructors,
//                 contentHours: totalContentHours,
//                 courseworkHours,
//                 estimatedTotalHours: grandTotalHours,
//                 materialIncludes: finalMaterialIncludes,
//                 updatedAt: new Date().toISOString()
//             });

//             console.log('📌 Container Checkpoint Metadata:', checkpointMetadata);

//             const finalResequencedUnits: ExtendedLearningUnitWithStatus[] = [];

//             if (!isMockMode && activeContainer?.id) {
//                 const batch = writeBatch(db);

//                 // 1. Update Container Metadata
//                 const containerRef = doc(db, 'content_containers', activeContainer.id);
//                 batch.update(containerRef, {
//                     illustrationType,
//                     themeColor,
//                     level: courseLevel,
//                     description: courseDescription,
//                     prerequisites,
//                     learningOutcomes,
//                     targetAudience,
//                     isCertificateAwarded,
//                     tags: courseTags,
//                     instructors,
//                     contentHours: totalContentHours,
//                     courseworkHours,
//                     estimatedTotalHours: grandTotalHours,
//                     materialIncludes: finalMaterialIncludes,
//                     previewVideoUrl: previewVideoUrl.trim(),
//                     checkpointScope,
//                     defaultAccreditation: accreditationConfig,
//                     accreditationBody: finalAccreditationBody,
//                     customAccreditationText: isAccredited ? customAccreditationText.trim() : '',
//                     checkpointMetadata,
//                     updatedAt: serverTimestamp()
//                 });

//                 // 2. Add Revision Snapshot
//                 const snapshotRef = doc(collection(db, 'content_containers', activeContainer.id, 'revisions'));
//                 batch.set(snapshotRef, {
//                     id: snapshotRef.id,
//                     containerId: activeContainer.id,
//                     committedBy: 'Admin Content Author',
//                     committedAt: new Date().toISOString(),
//                     unitCount: resequenced.length,
//                     illustrationType,
//                     themeColor,
//                     level: courseLevel,
//                     description: courseDescription,
//                     prerequisites,
//                     learningOutcomes,
//                     targetAudience,
//                     isCertificateAwarded,
//                     tags: courseTags,
//                     instructors,
//                     contentHours: totalContentHours,
//                     courseworkHours,
//                     estimatedTotalHours: grandTotalHours,
//                     materialIncludes: finalMaterialIncludes,
//                     previewVideoUrl: previewVideoUrl.trim(),
//                     checkpointScope,
//                     secamStructure: secamStructure || [],
//                     qctoModuleCheckpoints: qctoModuleCheckpoints || {},
//                     qctoTopicCheckpoints: qctoTopicCheckpoints || {},
//                     defaultAccreditation: accreditationConfig,
//                     accreditationBody: finalAccreditationBody,
//                     customAccreditationText: isAccredited ? customAccreditationText.trim() : ''
//                 });

//                 // 3. Batch Process Learning Units
//                 resequenced.forEach((unit) => {
//                     const isDraft = unit.id.startsWith('draft_');
//                     const unitRef = isDraft
//                         ? doc(collection(db, 'learning_units'))
//                         : doc(db, 'learning_units', unit.id);

//                     const resolvedId = unitRef.id;

//                     const sanitizedCheck = unit.interactiveCheck ? sanitizePayload({
//                         ...unit.interactiveCheck,
//                         buggyCode: sanitizeCodeInput(unit.interactiveCheck.buggyCode),
//                         solutionCode: sanitizeCodeInput(unit.interactiveCheck.solutionCode),
//                         instructions: sanitizeCodeInput(unit.interactiveCheck.instructions)
//                     }) : null;

//                     const unitPayload = sanitizePayload({
//                         id: resolvedId,
//                         containerId: activeContainer.id,
//                         framework: activeFramework,
//                         title: unit.title || 'Untitled Lesson',
//                         unitType: unit.unitType || 'video',
//                         estimatedMinutes: Number(unit.estimatedMinutes) || 15,
//                         isRequired: unit.isRequired ?? true,
//                         orderIndex: unit.orderIndex,
//                         sprintTitle: unit.sprintTitle || null,
//                         dayOrLessonTitle: unit.dayOrLessonTitle || null,
//                         moduleCode: unit.moduleCode || null,
//                         moduleType: unit.moduleType || null,
//                         topicId: unit.topicId || null,
//                         videoUrl: unit.videoUrl || null,
//                         contentHtml: unit.contentHtml || null,
//                         requiredWatchPercentage: unit.requiredWatchPercentage || 90,
//                         interactiveCheck: sanitizedCheck,
//                         attachments: unit.attachments || [],
//                         isRequiredForNextUnit: unit.isRequiredForNextUnit || false,
//                         tags: unit.tags || [],
//                         linkedAssessmentId: unit.linkedAssessmentId || null,
//                         unlinkedPolicy: unit.unlinkedPolicy || 'soft_gate',
//                         updatedAt: new Date().toISOString()
//                     });

//                     if (isDraft) {
//                         unitPayload.createdAt = new Date().toISOString();
//                         batch.set(unitRef, unitPayload);
//                     } else {
//                         batch.set(unitRef, unitPayload, { merge: true });
//                     }

//                     const resolvedUnitObj = sanitizePayload({
//                         ...unit,
//                         id: resolvedId,
//                         interactiveCheck: sanitizedCheck,
//                         linkedAssessmentId: unit.linkedAssessmentId || null,
//                         unlinkedPolicy: unit.unlinkedPolicy || 'soft_gate',
//                         _isDraft: false,
//                         _isSaving: false,
//                         _justSaved: false
//                     });

//                     finalResequencedUnits.push(resolvedUnitObj);

//                     console.log(`  💾 [Batch Unit Write] Path: "learning_units/${resolvedId}"`);
//                     console.log(`     ├─ Title: "${unitPayload.title}"`);
//                     console.log(`     ├─ linkedAssessmentId:`, unitPayload.linkedAssessmentId);
//                     console.log(`     ├─ unlinkedPolicy:`, unitPayload.unlinkedPolicy);
//                     console.log(`     └─ Full Payload:`, unitPayload);
//                 });

//                 // 4. Handle Deletions
//                 deletedIds.forEach((delId) => {
//                     if (!delId.startsWith('draft_')) {
//                         console.log(`  🗑️ [Batch Unit Delete] ID: "${delId}"`);
//                         batch.delete(doc(db, 'learning_units', delId));
//                     }
//                 });

//                 await batch.commit();
//                 console.log('✅ Firestore batch commit successful!');
//             } else {
//                 finalResequencedUnits.push(...resequenced);
//             }

//             if (onSaveBatch) {
//                 await onSaveBatch(finalResequencedUnits, deletedIds, checkpointMetadata);
//             }

//             toast.success("Curriculum structure, preview video & metadata committed!");
//             console.groupEnd();
//             onClose();
//         } catch (err: any) {
//             console.groupEnd();
//             console.error("Error committing curriculum structure:", err);
//             toast.error(`Failed to commit curriculum structure: ${err.message || 'Unknown error'}`);
//         } finally {
//             setSaving(false);
//         }
//     };

//     const handleInlineSaveLesson = async (lessonId: string) => {
//         const lessonToSave = draftUnits.find(u => u.id === lessonId);
//         if (!lessonToSave) return;

//         if (!lessonToSave.title.trim()) {
//             toast.warning("Lesson Title is required.");
//             return;
//         }

//         console.group(`[ContentBuilderModal - INLINE SAVE] Lesson "${lessonToSave.title}" (${lessonId})`);
//         setDraftUnits(prev => prev.map(u => u.id === lessonId ? { ...u, _isSaving: true } : u));

//         let finalSavedId = lessonId;

//         try {
//             if (isMockMode) {
//                 setDraftUnits(prev => prev.map(u => u.id === lessonId ? {
//                     ...u,
//                     _isDraft: false,
//                     _isSaving: false,
//                     _expanded: true,
//                     _justSaved: true
//                 } : u));
//                 toast.success("Lesson Saved Locally!");
//             } else {
//                 const isDraft = lessonId.startsWith('draft_');
//                 const targetId = isDraft ? undefined : lessonId;

//                 const sanitizedCheck = lessonToSave.interactiveCheck ? sanitizePayload({
//                     ...lessonToSave.interactiveCheck,
//                     buggyCode: sanitizeCodeInput(lessonToSave.interactiveCheck.buggyCode),
//                     solutionCode: sanitizeCodeInput(lessonToSave.interactiveCheck.solutionCode),
//                     instructions: sanitizeCodeInput(lessonToSave.interactiveCheck.instructions)
//                 }) : null;

//                 const payload: any = sanitizePayload({
//                     ...lessonToSave,
//                     containerId: activeContainer.id,
//                     framework: activeFramework,
//                     interactiveCheck: sanitizedCheck,
//                     linkedAssessmentId: lessonToSave.linkedAssessmentId || null,
//                     unlinkedPolicy: lessonToSave.unlinkedPolicy || 'soft_gate'
//                 });

//                 delete payload._isDraft;
//                 delete payload._expanded;
//                 delete payload._isSaving;
//                 delete payload._justSaved;
//                 if (isDraft) delete payload.id;

//                 console.log('📌 Raw Lesson State:', lessonToSave);
//                 console.log('🎯 Linked Assessment ID:', lessonToSave.linkedAssessmentId);
//                 console.log('🛡️ Unlinked/Release Policy:', lessonToSave.unlinkedPolicy);
//                 console.log('🚀 Payload sent to saveLearningUnit:', payload);

//                 finalSavedId = await saveLearningUnit(payload, targetId);
//                 console.log(`✅ Save verified. Final Firestore Unit ID: "${finalSavedId}"`);

//                 setDraftUnits(prev => prev.map(u => u.id === lessonId ? {
//                     ...u,
//                     id: finalSavedId,
//                     _isDraft: false,
//                     _isSaving: false,
//                     _expanded: true,
//                     _justSaved: true
//                 } : u));

//                 if (previewLessonId === lessonId) {
//                     setPreviewLessonId(finalSavedId);
//                 }
//                 toast.success("Lesson Saved to Cloud!");
//             }

//             setTimeout(() => {
//                 setDraftUnits(prev => prev.map(u => u.id === finalSavedId || u.id === lessonId ? { ...u, _justSaved: false } : u));
//             }, 2500);

//             console.groupEnd();
//         } catch (err) {
//             console.groupEnd();
//             setDraftUnits(prev => prev.map(u => u.id === lessonId ? { ...u, _isSaving: false } : u));
//             toast.error("Failed to save lesson.");
//         }
//     };

//     const addDraftLesson = (overrides: Partial<ExtendedLearningUnitWithStatus>) => {
//         const newLesson: ExtendedLearningUnitWithStatus = {
//             id: generateUniqueId('draft'),
//             containerId: activeContainer.id,
//             framework: activeFramework,
//             title: '',
//             unitType: 'video',
//             estimatedMinutes: 15,
//             isRequired: true,
//             orderIndex: draftUnits.length + 1,
//             attachments: [],
//             isRequiredForNextUnit: false,
//             tags: [],
//             linkedAssessmentId: null,
//             unlinkedPolicy: 'soft_gate',
//             ...overrides,
//             _isDraft: true,
//             _expanded: true
//         };

//         const updated = resequenceDraftUnits([...draftUnits, newLesson], secamStructure, activeFramework);
//         setDraftUnits(updated);
//         setPreviewLessonId(newLesson.id);
//     };

//     const updateDraftLesson = (id: string, field: string, value: any) => {
//         setDraftUnits(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
//     };

//     const handleVideoUrlChange = async (lessonId: string, url: string) => {
//         updateDraftLesson(lessonId, 'videoUrl', url);

//         if (url.trim().length > 10) {
//             setFetchingDurationId(lessonId);
//             try {
//                 const durationMins = await fetchVideoDurationMinutes(url);
//                 if (durationMins && durationMins > 0) {
//                     updateDraftLesson(lessonId, 'estimatedMinutes', durationMins);
//                     toast.info(`Auto-detected video runtime: ~${durationMins} Mins`);
//                 } else {
//                     toast.warning("Could not auto-detect video duration. Keeping existing value.");
//                 }
//             } catch (e) {
//                 console.warn("Failed to auto-detect video runtime:", e);
//             }
//             setFetchingDurationId(null);
//         }
//     };

//     const handleFileUploadAttachment = async (lessonId: string, file: File) => {
//         if (!file) return;

//         if (file.size > 50 * 1024 * 1024) {
//             toast.warning("Attachment exceeds maximum 50MB limit.");
//             return;
//         }

//         setUploadingAttachmentForId(lessonId);
//         setAttachmentUploadProgress(10);

//         try {
//             if (isMockMode) {
//                 setTimeout(() => {
//                     const ext = file.name.split('.').pop() || 'file';
//                     const mockAttachment: LessonAttachment = {
//                         id: generateUniqueId('att'),
//                         name: file.name,
//                         url: URL.createObjectURL(file),
//                         fileType: ext,
//                         uploadedAt: new Date().toISOString(),
//                         description: '',
//                         fileSize: file.size
//                     };
//                     const existing = draftUnits.find(u => u.id === lessonId)?.attachments || [];
//                     updateDraftLesson(lessonId, 'attachments', [...existing, mockAttachment]);
//                     setUploadingAttachmentForId(null);
//                     setAttachmentUploadProgress(0);
//                     toast.success(`Attached "${file.name}" locally!`);
//                 }, 1000);
//                 return;
//             }

//             const storage = getStorage();
//             const filePath = `content_attachments/${activeContainer.id || 'drafts'}/${lessonId}/${Date.now()}_${file.name}`;
//             const fileRef = storageRef(storage, filePath);
//             const uploadTask = uploadBytesResumable(fileRef, file);

//             uploadTask.on('state_changed',
//                 (snapshot) => {
//                     const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
//                     setAttachmentUploadProgress(progress);
//                 },
//                 (error) => {
//                     console.error('[AttachmentUpload] Error uploading file:', error);
//                     toast.error(`Upload failed: ${error.message}`);
//                     setUploadingAttachmentForId(null);
//                     setAttachmentUploadProgress(0);
//                 },
//                 async () => {
//                     const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
//                     const ext = file.name.split('.').pop() || 'file';

//                     const newAttachment: LessonAttachment = {
//                         id: generateUniqueId('att'),
//                         name: file.name,
//                         url: downloadUrl,
//                         fileType: ext,
//                         uploadedAt: new Date().toISOString(),
//                         description: '',
//                         fileSize: file.size
//                     };

//                     const existing = draftUnits.find(u => u.id === lessonId)?.attachments || [];
//                     updateDraftLesson(lessonId, 'attachments', [...existing, newAttachment]);

//                     setUploadingAttachmentForId(null);
//                     setAttachmentUploadProgress(0);
//                     toast.success(`Attached "${file.name}" successfully!`);
//                 }
//             );

//         } catch (err: any) {
//             console.error('[AttachmentUpload] Error:', err);
//             toast.error("Failed to upload attachment.");
//             setUploadingAttachmentForId(null);
//             setAttachmentUploadProgress(0);
//         }
//     };

//     const updateInteractiveCheck = (id: string, field: string, value: any) => {
//         setDraftUnits(prev => prev.map((u): ExtendedLearningUnitWithStatus => {
//             if (u.id !== id) return u;
//             const currentCheck: InteractiveCheckConfig = u.interactiveCheck || {
//                 checkType: 'none',
//                 instructions: '',
//                 isRequiredForCompletion: true,
//                 timeLimitSeconds: 0
//             };

//             const updated: InteractiveCheckConfig = {
//                 ...currentCheck,
//                 [field]: value
//             };

//             if (field === 'checkType' && value === 'spot_the_bug') {
//                 if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
//                 if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
//                 if (!updated.instructions) updated.instructions = 'Fix the component so it returns adjacent JSX elements properly.';
//             }

//             if (field === 'checkType' && value === 'mcq') {
//                 if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
//                     updated.mcqQuestions = [createDefaultMCQQuestion(1)];
//                 }
//             }

//             return {
//                 ...u,
//                 interactiveCheck: updated
//             };
//         }));
//     };

//     const toggleSettings = (id: string) => {
//         setDraftUnits(prev => prev.map(u => u.id === id ? { ...u, _expanded: !u._expanded } : u));
//         setPreviewLessonId(id);
//     };

//     const removeDraftLesson = (id: string) => {
//         const nextUnits = draftUnits.filter(u => u.id !== id);
//         if (!id.startsWith('draft_')) setDeletedIds(prev => [...prev, id]);
//         if (previewLessonId === id) setPreviewLessonId(null);
//         setDraftUnits(resequenceDraftUnits(nextUnits, secamStructure, activeFramework));
//     };

//     const addSecamSprint = () => {
//         const newSprint = {
//             id: generateUniqueId('sprint'),
//             title: `Sprint ${secamStructure.length + 1}: Agile Engineering`,
//             days: []
//         };
//         setSecamStructure(prev => [newSprint, ...prev]);
//     };

//     const updateSecamSprint = (sprintId: string, newTitle: string) => {
//         const sprint = secamStructure.find(s => s.id === sprintId);
//         if (!sprint) return;
//         const oldTitle = sprint.title;

//         setSecamStructure(prev => prev.map(s => s.id === sprintId ? { ...s, title: newTitle } : s));
//         setDraftUnits(prev => prev.map(u => u.sprintTitle === oldTitle ? { ...u, sprintTitle: newTitle } : u));
//     };

//     const removeSecamSprint = (sprintId: string) => {
//         const sprint = secamStructure.find(s => s.id === sprintId);
//         if (!sprint) return;

//         const sprintTitle = sprint.title;
//         setConfirmModal({
//             isOpen: true,
//             type: 'warning',
//             title: 'Delete Entire Sprint',
//             message: `Are you sure you want to delete "${sprintTitle}" and all its contained lessons?`,
//             confirmText: 'Delete Sprint',
//             cancelText: 'Cancel',
//             onConfirm: () => {
//                 setConfirmModal(prev => ({ ...prev, isOpen: false }));
//                 const unitsInSprint = draftUnits.filter(u => u.sprintTitle === sprintTitle);
//                 unitsInSprint.forEach(u => {
//                     if (!u.id.startsWith('draft_')) {
//                         setDeletedIds(prev => [...prev, u.id]);
//                     }
//                 });

//                 setDraftUnits(prev => prev.filter(u => u.sprintTitle !== sprintTitle));
//                 setSecamStructure(prev => prev.filter(s => s.id !== sprintId));
//                 toast.info(`Deleted "${sprintTitle}"`);
//             }
//         });
//     };

//     const addSecamDay = (sprintId: string) => {
//         const newDay = {
//             id: generateUniqueId('day'),
//             title: `Day: Lessons`
//         };

//         setSecamStructure(prev => prev.map(sprint => {
//             if (sprint.id !== sprintId) return sprint;
//             return {
//                 ...sprint,
//                 days: [newDay, ...sprint.days]
//             };
//         }));
//     };

//     const updateSecamDay = (sprintId: string, dayId: string, newTitle: string) => {
//         const sprint = secamStructure.find(s => s.id === sprintId);
//         const day = sprint?.days.find(d => d.id === dayId);
//         if (!sprint || !day) return;
//         const oldTitle = day.title;

//         setSecamStructure(prev => prev.map(s => {
//             if (s.id !== sprintId) return s;
//             return {
//                 ...s,
//                 days: s.days.map(d => d.id === dayId ? { ...d, title: newTitle } : d)
//             };
//         }));

//         setDraftUnits(prev => prev.map(u =>
//             u.sprintTitle === sprint.title && u.dayOrLessonTitle === oldTitle
//                 ? { ...u, dayOrLessonTitle: newTitle }
//                 : u
//         ));
//     };

//     const removeSecamDay = (sprintId: string, dayId: string) => {
//         const sprint = secamStructure.find(s => s.id === sprintId);
//         const day = sprint?.days.find(d => d.id === dayId);
//         if (!sprint || !day) return;

//         const sprintTitle = sprint.title;
//         const dayTitle = day.title;

//         setConfirmModal({
//             isOpen: true,
//             type: 'warning',
//             title: 'Delete Day Group',
//             message: `Are you sure you want to delete "${dayTitle}" and its lessons?`,
//             confirmText: 'Delete Day',
//             cancelText: 'Cancel',
//             onConfirm: () => {
//                 setConfirmModal(prev => ({ ...prev, isOpen: false }));
//                 const unitsInDay = draftUnits.filter(u => u.sprintTitle === sprintTitle && u.dayOrLessonTitle === dayTitle);
//                 unitsInDay.forEach(u => {
//                     if (!u.id.startsWith('draft_')) {
//                         setDeletedIds(prev => [...prev, u.id]);
//                     }
//                 });

//                 setDraftUnits(prev => prev.filter(u => !(u.sprintTitle === sprintTitle && u.dayOrLessonTitle === dayTitle)));
//                 setSecamStructure(prev => prev.map(s => {
//                     if (s.id !== sprintId) return s;
//                     return {
//                         ...s,
//                         days: s.days.filter(d => d.id !== dayId)
//                     };
//                 }));
//                 toast.info(`Deleted "${dayTitle}"`);
//             }
//         });
//     };

//     const toggleSprintCheckpoint = (sIdx: number) => {
//         setSecamStructure(prev => prev.map((sprint, i) => {
//             if (i !== sIdx) return sprint;
//             const current = sprint.sprintCheckpoint;
//             if (!current || current.checkType === 'none') {
//                 return {
//                     ...sprint,
//                     sprintCheckpoint: {
//                         checkType: 'spot_the_bug',
//                         instructions: `Sprint Capstone Code Challenge for ${sprint.title}`,
//                         buggyCode: DEFAULT_BUGGY_CODE,
//                         solutionCode: DEFAULT_SOLUTION_CODE,
//                         isRequiredForCompletion: true,
//                         timeLimitSeconds: 0
//                     }
//                 };
//             } else {
//                 const { sprintCheckpoint, ...rest } = sprint;
//                 return rest;
//             }
//         }));
//     };

//     const updateSprintCheckpointField = (sIdx: number, field: string, value: any) => {
//         setSecamStructure(prev => prev.map((sprint, i) => {
//             if (i !== sIdx || !sprint.sprintCheckpoint) return sprint;
//             const updated = {
//                 ...sprint.sprintCheckpoint,
//                 [field]: value
//             };
//             if (field === 'checkType' && value === 'spot_the_bug') {
//                 if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
//                 if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
//             }
//             if (field === 'checkType' && value === 'mcq') {
//                 if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
//                     updated.mcqQuestions = [createDefaultMCQQuestion(1)];
//                 }
//             }
//             return { ...sprint, sprintCheckpoint: updated };
//         }));
//     };

//     const removeSprintCheckpoint = (sIdx: number) => {
//         setSecamStructure(prev => prev.map((sprint, i) => {
//             if (i !== sIdx) return sprint;
//             const { sprintCheckpoint, ...rest } = sprint;
//             return rest;
//         }));
//     };

//     const toggleDayCheckpoint = (sIdx: number, dIdx: number) => {
//         setSecamStructure(prev => prev.map((sprint, i) => {
//             if (i !== sIdx) return sprint;
//             return {
//                 ...sprint,
//                 days: sprint.days.map((day, j) => {
//                     if (j !== dIdx) return day;
//                     const current = day.dayCheckpoint;
//                     if (!current || current.checkType === 'none') {
//                         return {
//                             ...day,
//                             dayCheckpoint: {
//                                 checkType: 'spot_the_bug',
//                                 instructions: `Day Quiz: Fix the broken code snippet for ${day.title}`,
//                                 buggyCode: DEFAULT_BUGGY_CODE,
//                                 solutionCode: DEFAULT_SOLUTION_CODE,
//                                 isRequiredForCompletion: true,
//                                 timeLimitSeconds: 0
//                             }
//                         };
//                     } else {
//                         const { dayCheckpoint, ...rest } = day;
//                         return rest;
//                     }
//                 })
//             };
//         }));
//     };

//     const updateDayCheckpointField = (sIdx: number, dIdx: number, field: string, value: any) => {
//         setSecamStructure(prev => prev.map((sprint, i) => {
//             if (i !== sIdx) return sprint;
//             return {
//                 ...sprint,
//                 days: sprint.days.map((day, j) => {
//                     if (j !== dIdx || !day.dayCheckpoint) return day;
//                     const updated = {
//                         ...day.dayCheckpoint,
//                         [field]: value
//                     };
//                     if (field === 'checkType' && value === 'spot_the_bug') {
//                         if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
//                         if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
//                     }
//                     if (field === 'checkType' && value === 'mcq') {
//                         if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
//                             updated.mcqQuestions = [createDefaultMCQQuestion(1)];
//                         }
//                     }
//                     return { ...day, dayCheckpoint: updated };
//                 })
//             };
//         }));
//     };

//     const toggleQctoModuleCheckpoint = (moduleCode: string) => {
//         setQctoModuleCheckpoints(prev => {
//             const existing = prev[moduleCode];
//             if (!existing || existing.checkType === 'none') {
//                 return {
//                     ...prev,
//                     [moduleCode]: {
//                         checkType: 'spot_the_bug',
//                         instructions: `Module Evaluation Gate for ${moduleCode}`,
//                         buggyCode: DEFAULT_BUGGY_CODE,
//                         solutionCode: DEFAULT_SOLUTION_CODE,
//                         isRequiredForCompletion: true,
//                         timeLimitSeconds: 0
//                     }
//                 };
//             } else {
//                 const next = { ...prev };
//                 delete next[moduleCode];
//                 return next;
//             }
//         });
//     };

//     const updateQctoModuleField = (moduleCode: string, field: string, value: any) => {
//         setQctoModuleCheckpoints(prev => {
//             const current = prev[moduleCode] || {};
//             const updated = { ...current, [field]: value };
//             if (field === 'checkType' && value === 'spot_the_bug') {
//                 if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
//                 if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
//             }
//             if (field === 'checkType' && value === 'mcq') {
//                 if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
//                     updated.mcqQuestions = [createDefaultMCQQuestion(1)];
//                 }
//             }
//             return { ...prev, [moduleCode]: updated };
//         });
//     };

//     const toggleQctoTopicCheckpoint = (topicKey: string) => {
//         setQctoTopicCheckpoints(prev => {
//             const existing = prev[topicKey];
//             if (!existing || existing.checkType === 'none') {
//                 return {
//                     ...prev,
//                     [topicKey]: {
//                         checkType: 'spot_the_bug',
//                         instructions: `Topic Quiz for ${topicKey}`,
//                         buggyCode: DEFAULT_BUGGY_CODE,
//                         solutionCode: DEFAULT_SOLUTION_CODE,
//                         isRequiredForCompletion: true,
//                         timeLimitSeconds: 0
//                     }
//                 };
//             } else {
//                 const next = { ...prev };
//                 delete next[topicKey];
//                 return next;
//             }
//         });
//     };

//     const updateQctoTopicField = (topicKey: string, field: string, value: any) => {
//         setQctoTopicCheckpoints(prev => {
//             const current = prev[topicKey] || {};
//             const updated = { ...current, [field]: value };
//             if (field === 'checkType' && value === 'spot_the_bug') {
//                 if (!updated.buggyCode) updated.buggyCode = DEFAULT_BUGGY_CODE;
//                 if (!updated.solutionCode) updated.solutionCode = DEFAULT_SOLUTION_CODE;
//             }
//             if (field === 'checkType' && value === 'mcq') {
//                 if (!updated.mcqQuestions || updated.mcqQuestions.length === 0) {
//                     updated.mcqQuestions = [createDefaultMCQQuestion(1)];
//                 }
//             }
//             return { ...prev, [topicKey]: updated };
//         });
//     };

//     const renderCheckpointEditor = (ic: InteractiveCheckConfig, updateField: (field: string, value: any) => void) => {
//         const currentBuggyCode = sanitizeCodeInput(ic.buggyCode || DEFAULT_BUGGY_CODE);
//         const currentSolutionCode = sanitizeCodeInput(ic.solutionCode || DEFAULT_SOLUTION_CODE);

//         const updateQuestionField = (qIdx: number, key: keyof MCQQuestion, value: any) => {
//             const questions = [...(ic.mcqQuestions || [])];
//             if (!questions[qIdx]) return;
//             questions[qIdx] = { ...questions[qIdx], [key]: value };
//             updateField('mcqQuestions', questions);
//         };

//         const addQuestion = () => {
//             const questions = [...(ic.mcqQuestions || [])];
//             questions.push(createDefaultMCQQuestion(questions.length + 1));
//             updateField('mcqQuestions', questions);
//         };

//         const removeQuestion = (qIdx: number) => {
//             const questions = (ic.mcqQuestions || []).filter((_, idx) => idx !== qIdx);
//             updateField('mcqQuestions', questions);
//         };

//         const updateOptionField = (qIdx: number, oIdx: number, key: keyof MCQOption, value: any) => {
//             const questions = [...(ic.mcqQuestions || [])];
//             if (!questions[qIdx]) return;
//             const options = [...(questions[qIdx].options || [])];
//             if (!options[oIdx]) return;

//             if (key === 'isCorrect' && value === true) {
//                 // Radio button logic: only one correct option per question
//                 options.forEach((opt, idx) => {
//                     opt.isCorrect = idx === oIdx;
//                 });
//             } else {
//                 options[oIdx] = { ...options[oIdx], [key]: value };
//             }

//             questions[qIdx] = { ...questions[qIdx], options };
//             updateField('mcqQuestions', questions);
//         };

//         const addOption = (qIdx: number) => {
//             const questions = [...(ic.mcqQuestions || [])];
//             if (!questions[qIdx]) return;
//             const options = [...(questions[qIdx].options || [])];
//             options.push({
//                 id: generateUniqueId('opt'),
//                 text: `Option ${String.fromCharCode(65 + options.length)}`,
//                 isCorrect: options.length === 0
//             });
//             questions[qIdx] = { ...questions[qIdx], options };
//             updateField('mcqQuestions', questions);
//         };

//         const removeOption = (qIdx: number, oIdx: number) => {
//             const questions = [...(ic.mcqQuestions || [])];
//             if (!questions[qIdx]) return;
//             const options = (questions[qIdx].options || []).filter((_, idx) => idx !== oIdx);
//             questions[qIdx] = { ...questions[qIdx], options };
//             updateField('mcqQuestions', questions);
//         };

//         return (
//             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '6px' }}>
//                 <select
//                     className="pfm-input"
//                     style={{ width: '100%', padding: '6px 8px', borderRadius: '0px' }}
//                     value={ic.checkType || 'none'}
//                     onChange={e => updateField('checkType', e.target.value)}
//                 >
//                     <option value="none">No Verification Check</option>
//                     <option value="mcq">❓ Multiple Choice Questions Quiz Bank</option>
//                     <option value="socratic_dialogue">🤖 Socratic AI Peer Dialogue (PR Review / Concept Check)</option>
//                     <option value="spot_the_bug">🐛 Spot-the-Bug (Code Logic Repair)</option>
//                     <option value="oral_defense">🎙️ AI Oral Defense (Audio Transcript Analysis)</option>
//                 </select>

//                 {ic.checkType && ic.checkType !== 'none' && (() => {
//                     const totalSecs = ic.timeLimitSeconds || 0;
//                     const isMins = totalSecs > 0 && totalSecs % 60 === 0;
//                     const displayVal = totalSecs === 0 ? '' : isMins ? totalSecs / 60 : totalSecs;
//                     const unit = isMins ? 'mins' : 'secs';

//                     return (
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0px', padding: '4px 8px' }}>
//                             <Timer size={14} color="#0284c7" />
//                             <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Countdown Limit:</span>
//                             <input
//                                 className="pfm-input"
//                                 style={{ width: '55px', border: '1px solid #e2e8f0', padding: '2px 4px', textAlign: 'center', fontWeight: 700, borderRadius: '0px' }}
//                                 type="number"
//                                 placeholder="0"
//                                 value={displayVal}
//                                 onChange={e => {
//                                     const val = parseInt(e.target.value) || 0;
//                                     const newSecs = unit === 'mins' ? val * 60 : val;
//                                     updateField('timeLimitSeconds', newSecs);
//                                 }}
//                                 min={0}
//                             />
//                             <select
//                                 className="pfm-input"
//                                 style={{ border: 'none', background: 'transparent', fontSize: '0.75rem', padding: '2px 0', fontWeight: 700, color: '#0284c7', cursor: 'pointer', borderRadius: '0px' }}
//                                 value={unit}
//                                 onChange={e => {
//                                     const newUnit = e.target.value;
//                                     const currentNum = typeof displayVal === 'number' ? displayVal : 0;
//                                     const newSecs = newUnit === 'mins' ? currentNum * 60 : currentNum;
//                                     updateField('timeLimitSeconds', newSecs);
//                                 }}
//                             >
//                                 <option value="secs">Seconds</option>
//                                 <option value="mins">Minutes</option>
//                             </select>
//                             <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 'auto' }}>Leave empty or 0 for unlimited</span>
//                         </div>
//                     );
//                 })()}

//                 {/* --- MULTI-QUESTION MCQ EDITOR BLOCK --- */}
//                 {ic.checkType === 'mcq' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '0px' }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                             <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                 <HelpCircle size={14} /> MCQ Quiz Bank ({(ic.mcqQuestions || []).length} Question{(ic.mcqQuestions || []).length === 1 ? '' : 's'})
//                             </span>

//                             <button
//                                 type="button"
//                                 style={{
//                                     background: '#16a34a',
//                                     color: 'white',
//                                     border: 'none',
//                                     padding: '4px 10px',
//                                     fontSize: '0.7rem',
//                                     fontWeight: 800,
//                                     cursor: 'pointer',
//                                     borderRadius: '0px',
//                                     display: 'inline-flex',
//                                     alignItems: 'center',
//                                     gap: '4px',
//                                     fontFamily: 'var(--font-heading)',
//                                     textTransform: 'uppercase'
//                                 }}
//                                 onClick={addQuestion}
//                             >
//                                 <Plus size={12} /> Add Question
//                             </button>
//                         </div>

//                         {(ic.mcqQuestions || []).map((q, qIdx) => (
//                             <div key={q.id || qIdx} style={{ background: '#ffffff', border: '1px solid #bbf7d0', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>
//                                         Question #{qIdx + 1}
//                                     </span>
//                                     {(ic.mcqQuestions || []).length > 1 && (
//                                         <button
//                                             type="button"
//                                             style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.68rem', fontWeight: 700 }}
//                                             onClick={() => removeQuestion(qIdx)}
//                                             title="Delete Question"
//                                         >
//                                             <Trash2 size={13} /> Remove Question
//                                         </button>
//                                     )}
//                                 </div>

//                                 <textarea
//                                     className="pfm-input"
//                                     rows={2}
//                                     style={{ padding: '6px 8px', borderRadius: '0px', background: '#f8fafc', fontSize: '0.8rem' }}
//                                     placeholder={`Enter Question #${qIdx + 1} prompt...`}
//                                     value={q.question || ''}
//                                     onChange={e => updateQuestionField(qIdx, 'question', e.target.value)}
//                                 />

//                                 <label style={{ fontSize: '0.68rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase', marginTop: '2px' }}>
//                                     Options &amp; Correct Answer
//                                 </label>

//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                     {(q.options || []).map((opt, oIdx) => (
//                                         <div key={opt.id || oIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                             <input
//                                                 type="radio"
//                                                 name={`mcq_correct_${q.id || qIdx}`}
//                                                 checked={!!opt.isCorrect}
//                                                 onChange={() => updateOptionField(qIdx, oIdx, 'isCorrect', true)}
//                                                 title="Mark as Correct Answer"
//                                                 style={{ cursor: 'pointer' }}
//                                             />
//                                             <input
//                                                 className="pfm-input"
//                                                 style={{ flex: 1, padding: '4px 8px', fontSize: '0.78rem', borderRadius: '0px', background: 'white' }}
//                                                 placeholder={`Option ${oIdx + 1}`}
//                                                 value={opt.text}
//                                                 onChange={e => updateOptionField(qIdx, oIdx, 'text', e.target.value)}
//                                             />
//                                             <button
//                                                 type="button"
//                                                 style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
//                                                 onClick={() => removeOption(qIdx, oIdx)}
//                                                 title="Remove Option"
//                                             >
//                                                 <Trash2 size={13} />
//                                             </button>
//                                         </div>
//                                     ))}

//                                     <button
//                                         type="button"
//                                         style={{
//                                             alignSelf: 'flex-start',
//                                             background: '#e0f2fe',
//                                             color: '#0369a1',
//                                             border: '1px solid #bae6fd',
//                                             padding: '3px 8px',
//                                             fontSize: '0.68rem',
//                                             fontWeight: 800,
//                                             cursor: 'pointer',
//                                             borderRadius: '0px',
//                                             display: 'inline-flex',
//                                             alignItems: 'center',
//                                             gap: '4px',
//                                             marginTop: '2px',
//                                             textTransform: 'uppercase'
//                                         }}
//                                         onClick={() => addOption(qIdx)}
//                                     >
//                                         <Plus size={10} /> Add Option
//                                     </button>
//                                 </div>
//                             </div>
//                         ))}
//                     </div>
//                 )}

//                 {ic.checkType === 'socratic_dialogue' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#fffbeb', border: '1px solid #fde68a', padding: '12px', borderRadius: '0px' }}>
//                         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                             <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600, width: '90px' }}>AI Persona:</span>
//                             <select className="pfm-input" style={{ flex: 1, padding: '4px 8px', borderRadius: '0px' }} value={ic.aiPersonaRole || 'junior_dev'} onChange={e => updateField('aiPersonaRole', e.target.value)}>
//                                 <option value="junior_dev">Junior Developer (Needs Help)</option>
//                                 <option value="client">Non-Technical Client (Needs Layman Explanation)</option>
//                                 <option value="architect">Senior Architect (Challenging Design Choices)</option>
//                             </select>
//                         </div>
//                         <textarea className="pfm-input" rows={2} style={{ padding: '6px 8px', borderRadius: '0px' }} placeholder="Scenario Prompt..." value={ic.instructions || ''} onChange={e => updateField('instructions', e.target.value)} />
//                     </div>
//                 )}

//                 {ic.checkType === 'spot_the_bug' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff1f2', border: '1px solid #fecdd3', padding: '12px', borderRadius: '0px' }}>
//                         <input className="pfm-input" style={{ padding: '6px 8px', borderRadius: '0px' }} placeholder="Brief Instruction..." value={ic.instructions || ''} onChange={e => updateField('instructions', e.target.value)} />

//                         <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
//                             <div style={{ flex: 1, minWidth: '280px' }}>
//                                 <label style={{ fontSize: '0.7rem', color: '#be123c', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
//                                     <Code size={12} /> Buggy Starter Code (What Learner Sees)
//                                 </label>
//                                 <div style={{ border: '1px solid #fecdd3', overflow: 'hidden' }}>
//                                     <Editor
//                                         height="180px"
//                                         defaultLanguage="javascript"
//                                         theme="vs-dark"
//                                         value={currentBuggyCode}
//                                         onChange={(val) => updateField('buggyCode', val || '')}
//                                         options={{
//                                             minimap: { enabled: false },
//                                             fontSize: 12,
//                                             lineNumbers: 'on',
//                                             scrollBeyondLastLine: false,
//                                             automaticLayout: true,
//                                             tabSize: 2,
//                                             padding: { top: 8, bottom: 8 },
//                                             fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
//                                             renderControlCharacters: false,
//                                             unicodeHighlight: {
//                                                 ambiguousCharacters: false,
//                                                 invisibleCharacters: false
//                                             }
//                                         }}
//                                     />
//                                 </div>
//                             </div>

//                             <div style={{ flex: 1, minWidth: '280px' }}>
//                                 <label style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
//                                     <CheckCircle2 size={12} /> Expected Solution Code (To Pass)
//                                 </label>
//                                 <div style={{ border: '1px solid #bbf7d0', overflow: 'hidden' }}>
//                                     <Editor
//                                         height="180px"
//                                         defaultLanguage="javascript"
//                                         theme="vs-dark"
//                                         value={currentSolutionCode}
//                                         onChange={(val) => updateField('solutionCode', val || '')}
//                                         options={{
//                                             minimap: { enabled: false },
//                                             fontSize: 12,
//                                             lineNumbers: 'on',
//                                             scrollBeyondLastLine: false,
//                                             automaticLayout: true,
//                                             tabSize: 2,
//                                             padding: { top: 8, bottom: 8 },
//                                             fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
//                                             renderControlCharacters: false,
//                                             unicodeHighlight: {
//                                                 ambiguousCharacters: false,
//                                                 invisibleCharacters: false
//                                             }
//                                         }}
//                                     />
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 )}

//                 {ic.checkType === 'oral_defense' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f3e8ff', border: '1px solid #e9d5ff', padding: '12px', borderRadius: '0px' }}>
//                         <textarea className="pfm-input" rows={2} style={{ padding: '6px 8px', borderRadius: '0px' }} placeholder="Oral Prompt..." value={ic.defenseQuestion || ''} onChange={e => updateField('defenseQuestion', e.target.value)} />
//                     </div>
//                 )}
//             </div>
//         );
//     };

//     const renderLessonRow = (lesson: ExtendedLearningUnitWithStatus) => {
//         const ic: InteractiveCheckConfig = (lesson.interactiveCheck || {
//             checkType: 'none',
//             instructions: '',
//             isRequiredForCompletion: false,
//             timeLimitSeconds: 0
//         }) as InteractiveCheckConfig;

//         const isPreviewActive = previewLessonId === lesson.id;
//         const isDragging = draggedLessonId === lesson.id;
//         const isDragOver = dragOverLessonId === lesson.id;
//         const isFetchingDur = fetchingDurationId === lesson.id;
//         const isUploadingAtt = uploadingAttachmentForId === lesson.id;
//         const isVideoUnit = lesson.unitType === 'video';
//         const isLockedInPreview = !mockUnlockedUnitIds.has(lesson.id);

//         return (
//             <div
//                 key={lesson.id}
//                 draggable
//                 onDragStart={(e) => {
//                     e.stopPropagation();
//                     setDraggedLessonId(lesson.id);
//                     e.dataTransfer.effectAllowed = 'move';
//                 }}
//                 onDragOver={(e) => {
//                     e.preventDefault();
//                     e.stopPropagation();
//                     setDragOverLessonId(lesson.id);
//                     e.dataTransfer.dropEffect = 'move';
//                 }}
//                 onDragLeave={(e) => {
//                     e.stopPropagation();
//                     if (dragOverLessonId === lesson.id) setDragOverLessonId(null);
//                 }}
//                 onDrop={(e) => {
//                     e.preventDefault();
//                     e.stopPropagation();
//                     handleDropLesson(lesson.id);
//                 }}
//                 style={{
//                     display: 'flex',
//                     flexDirection: 'column',
//                     gap: '8px',
//                     background: isPreviewActive ? '#f0f9ff' : 'white',
//                     padding: '8px',
//                     borderRadius: '0px',
//                     border: `1px solid ${isDragOver ? '#0284c7' : isPreviewActive ? '#38bdf8' : '#e2e8f0'}`,
//                     borderTop: isDragOver ? '3px solid #0284c7' : undefined,
//                     opacity: isDragging ? 0.4 : 1,
//                     marginBottom: '8px',
//                     transition: 'all 0.15s ease',
//                     cursor: 'grab'
//                 }}
//                 onClick={() => setPreviewLessonId(lesson.id)}
//             >
//                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                     <div style={{ cursor: 'grab', color: '#94a3b8', display: 'flex', alignItems: 'center' }} title="Drag to reorder lesson">
//                         <GripVertical size={16} />
//                     </div>

//                     <input
//                         className="pfm-input"
//                         style={{ width: '55px', textAlign: 'center', padding: '4px', borderRadius: '0px', fontWeight: 700, flexShrink: 0 }}
//                         type="number"
//                         step="any"
//                         placeholder="#"
//                         value={lesson.orderIndex ?? ''}
//                         onChange={e => {
//                             const val = e.target.value === '' ? '' : parseFloat(e.target.value);
//                             updateDraftLesson(lesson.id, 'orderIndex', val);
//                         }}
//                     />

//                     <input className="pfm-input" style={{ flex: 1, padding: '4px 8px', fontWeight: isPreviewActive ? 700 : 400, borderRadius: '0px', minWidth: '140px' }} placeholder="Lesson Title" value={lesson.title} onChange={e => updateDraftLesson(lesson.id, 'title', e.target.value)} />

//                     {/* BADGE 1: Knowledge Check / Interactive Quiz */}
//                     {lesson.interactiveCheck?.checkType && lesson.interactiveCheck.checkType !== 'none' && (
//                         <Tooltip content="Includes Stage 2 Knowledge Check" placement="top">
//                             <span style={{ fontSize: '0.62rem', fontWeight: 800, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px', textTransform: 'uppercase' }}>
//                                 <Zap size={10} fill="#b45309" /> Quiz
//                             </span>
//                         </Tooltip>
//                     )}

//                     {/* BADGE 2: Formal SETA / QCTO Assessment */}
//                     {lesson.linkedAssessmentId && (
//                         <Tooltip content="Includes Formal Accredited Examination" placement="top">
//                             <span style={{ fontSize: '0.62rem', fontWeight: 800, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #e9d5ff', padding: '2px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px', textTransform: 'uppercase' }}>
//                                 <Award size={10} /> Exam
//                             </span>
//                         </Tooltip>
//                     )}

//                     {isLockedInPreview && (
//                         <Tooltip content="This lesson will be locked for learners until preceding gates are passed." placement="top">
//                             <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
//                                 <Lock size={10} /> Locked
//                             </span>
//                         </Tooltip>
//                     )}

//                     {lesson.isRequiredForNextUnit && (
//                         <Tooltip content="This lesson is a progression gate. It must be completed to unlock subsequent lessons." placement="top">
//                             <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 6px', borderRadius: '0px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
//                                 <CheckCircle2 size={10} /> Gate
//                             </span>
//                         </Tooltip>
//                     )}

//                     {lesson._justSaved && (
//                         <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: '0px', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
//                             <CheckCircle2 size={12} color="#166534" /> Saved
//                         </span>
//                     )}
//                     {!lesson._isDraft && !lesson._justSaved && (
//                         <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '3px 6px', borderRadius: '0px', flexShrink: 0 }}>
//                             Synced
//                         </span>
//                     )}
//                     {lesson._isDraft && !lesson._justSaved && (
//                         <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '3px 6px', borderRadius: '0px', flexShrink: 0 }}>
//                             Draft
//                         </span>
//                     )}

//                     <select className="pfm-input" style={{ width: '95px', padding: '4px', borderRadius: '0px', flexShrink: 0 }} value={lesson.unitType} onChange={e => updateDraftLesson(lesson.id, 'unitType', e.target.value)}>
//                         <option value="video">Video</option>
//                         <option value="reading">Reading</option>
//                         <option value="interactive_code">Code</option>
//                     </select>

//                     <div style={{
//                         position: 'relative',
//                         display: 'flex',
//                         alignItems: 'center',
//                         flexShrink: 0,
//                         border: '1px solid #cbd5e1',
//                         background: isVideoUnit ? '#f1f5f9' : '#ffffff',
//                         paddingRight: '6px',
//                         height: '28px'
//                     }}>
//                         <input
//                             className="pfm-input"
//                             style={{
//                                 width: '38px',
//                                 padding: '2px 2px 2px 4px',
//                                 border: 'none',
//                                 background: 'transparent',
//                                 textAlign: 'right',
//                                 fontWeight: 800,
//                                 fontSize: '0.78rem',
//                                 color: '#0f172a'
//                             }}
//                             type="number"
//                             placeholder="0"
//                             value={lesson.estimatedMinutes ?? ''}
//                             readOnly={isVideoUnit}
//                             onChange={e => {
//                                 if (!isVideoUnit) {
//                                     updateDraftLesson(lesson.id, 'estimatedMinutes', parseInt(e.target.value) || 0);
//                                 }
//                             }}
//                             title={isVideoUnit ? "Video duration is automatically detected from YouTube" : "Estimated completion time in minutes"}
//                         />
//                         <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', marginLeft: '3px', userSelect: 'none' }}>
//                             mins
//                         </span>
//                         {isFetchingDur && (
//                             <Loader2 size={12} className="pfm-spin" style={{ color: '#0284c7', marginLeft: '4px' }} />
//                         )}
//                     </div>

//                     <button type="button" onClick={(e) => { e.stopPropagation(); toggleSettings(lesson.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: lesson._expanded ? '#0ea5e9' : '#64748b', flexShrink: 0 }} title="Configure Settings">
//                         <Settings size={16} />
//                     </button>
//                     <button type="button" className="pfm-remove-btn" onClick={(e) => { e.stopPropagation(); removeDraftLesson(lesson.id); }} title="Delete Lesson" style={{ flexShrink: 0 }}>
//                         <Trash2 size={16} />
//                     </button>
//                 </div>

//                 {lesson._expanded && (
//                     <div className="animate-fade-in" style={{ padding: '16px', background: '#f8fafc', borderRadius: '0px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }} onClick={e => e.stopPropagation()}>

//                         {lesson.unitType === 'video' && (
//                             <div>
//                                 <div className="lfm-section-hdr" style={{ margin: '0 0 8px 0', border: 'none', padding: 0 }}><Video size={13} /> Video Source &amp; Rules</div>
//                                 <div style={{ display: 'flex', gap: '8px' }}>
//                                     <input
//                                         className="pfm-input"
//                                         style={{ flex: 1, padding: '6px 8px', borderRadius: '0px' }}
//                                         placeholder="Video URL (Vimeo, YouTube, MP4)"
//                                         value={lesson.videoUrl || ''}
//                                         onChange={e => handleVideoUrlChange(lesson.id, e.target.value)}
//                                     />
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0px', padding: '0 8px' }}>
//                                         <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Req %:</span>
//                                         <input className="pfm-input" style={{ width: '50px', border: 'none', padding: '4px 0', textAlign: 'center', borderRadius: '0px' }} type="number" value={lesson.requiredWatchPercentage || 90} onChange={e => updateDraftLesson(lesson.id, 'requiredWatchPercentage', parseInt(e.target.value) || 0)} min={0} max={100} />
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {lesson.unitType === 'reading' && (
//                             <div>
//                                 <div className="lfm-section-hdr" style={{ margin: '0 0 8px 0', border: 'none', padding: 0 }}><FileText size={13} /> Reading Guide Body Content (Rich Text)</div>
//                                 <div style={{ background: 'white', border: '1px solid #cbd5e1', color: '#0f172a' }}>
//                                     <ReactQuill
//                                         theme="snow"
//                                         value={lesson.contentHtml || ''}
//                                         onChange={(val) => updateDraftLesson(lesson.id, 'contentHtml', val)}
//                                         modules={QUILL_MODULES}
//                                     />
//                                 </div>
//                             </div>
//                         )}

//                         {/* LINK FORMAL SETA / QCTO ASSESSMENT & EXAM */}
//                         <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
//                             <div className="lfm-section-hdr" style={{ margin: '0 0 8px 0', border: 'none', padding: 0 }}>
//                                 <Award size={13} /> Link Formal SETA / QCTO Assessment or Exam
//                             </div>
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                 <Tooltip content="Select a master assessment/assignment created in Assessment Builder to trigger upon reaching this lesson." placement="top">
//                                     <select
//                                         className="pfm-input"
//                                         style={{ width: '100%', padding: '6px 8px', borderRadius: '0px' }}
//                                         value={lesson.linkedAssessmentId || ''}
//                                         onChange={e => {
//                                             const val = e.target.value.trim() || null;
//                                             console.log(`[ContentBuilderModal - SELECT EXAM] Lesson "${lesson.title}" (${lesson.id}) linked to Assessment ID:`, val);
//                                             updateDraftLesson(lesson.id, 'linkedAssessmentId', val);
//                                         }}
//                                         disabled={loadingAssessments}
//                                     >
//                                         <option value="">-- No Formal Exam (In-Lesson Checks Only) --</option>
//                                         {packageAssessments.map((ast: any) => (
//                                             <option key={ast.id} value={ast.id}>
//                                                 [{ast.framework ? ast.framework.toUpperCase() : 'SETA'} • {ast.type || 'Assessment'}] {ast.title} ({ast.totalMarks || 0} Marks)
//                                             </option>
//                                         ))}
//                                     </select>
//                                 </Tooltip>

//                                 {lesson.linkedAssessmentId && (
//                                     <div style={{ display: 'flex', gap: '16px', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
//                                         <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>Unlinked / Release Policy:</span>

//                                         <Tooltip content="Allows learners to keep studying subsequent units if the exam hasn't been released or graded yet." placement="top">
//                                             <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#0f172a' }}>
//                                                 <input
//                                                     type="radio"
//                                                     name={`policy_${lesson.id}`}
//                                                     checked={lesson.unlinkedPolicy !== 'hard_gate'}
//                                                     onChange={() => updateDraftLesson(lesson.id, 'unlinkedPolicy', 'soft_gate')}
//                                                 />
//                                                 <strong>Soft Gate:</strong> Allow progression if exam is pending release
//                                             </label>
//                                         </Tooltip>

//                                         <Tooltip content="Blocks learner progression to subsequent units until this assessment is submitted and marked Competent." placement="top">
//                                             <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#0f172a' }}>
//                                                 <input
//                                                     type="radio"
//                                                     name={`policy_${lesson.id}`}
//                                                     checked={lesson.unlinkedPolicy === 'hard_gate'}
//                                                     onChange={() => updateDraftLesson(lesson.id, 'unlinkedPolicy', 'hard_gate')}
//                                                 />
//                                                 <strong>Hard Gate:</strong> Block progression until exam is graded
//                                             </label>
//                                         </Tooltip>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         {/* ALWAYS-ACCESSIBLE IN-LESSON INTERACTIVE VERIFICATION CHECKS */}
//                         <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
//                             <div className="lfm-section-hdr" style={{ margin: '0 0 8px 0', border: 'none', padding: 0 }}>
//                                 <Sparkles size={13} /> In-Lesson Interactive Verification Check (Quiz / AI Check)
//                             </div>
//                             {renderCheckpointEditor(ic, (field, val) => updateInteractiveCheck(lesson.id, field, val))}
//                         </div>

//                         <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '10px' }}>
//                             <div className="lfm-section-hdr" style={{ margin: '0 0 6px 0', border: 'none', padding: 0 }}>
//                                 <Paperclip size={13} /> Supplementary Assets &amp; Downloadable Attachments (PDFs, Excel, Docs, ZIPs)
//                             </div>

//                             <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
//                                 <label style={{
//                                     display: 'inline-flex',
//                                     alignItems: 'center',
//                                     gap: '6px',
//                                     background: '#0ea5e9',
//                                     color: 'white',
//                                     padding: '6px 12px',
//                                     fontSize: '0.72rem',
//                                     fontWeight: 800,
//                                     cursor: isUploadingAtt ? 'not-allowed' : 'pointer',
//                                     fontFamily: 'var(--font-heading)',
//                                     textTransform: 'uppercase'
//                                 }}>
//                                     {isUploadingAtt ? <Loader2 size={13} className="pfm-spin" /> : <UploadCloud size={13} />}
//                                     {isUploadingAtt ? `Uploading (${attachmentUploadProgress}%)...` : 'Upload File to Storage'}
//                                     <input
//                                         type="file"
//                                         hidden
//                                         disabled={isUploadingAtt}
//                                         accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv"
//                                         onChange={e => {
//                                             const f = e.target.files?.[0];
//                                             if (f) handleFileUploadAttachment(lesson.id, f);
//                                             e.target.value = '';
//                                         }}
//                                     />
//                                 </label>

//                                 <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>OR LINK:</span>

//                                 <input
//                                     className="pfm-input"
//                                     style={{ flex: 1, minWidth: '120px', padding: '5px 8px', fontSize: '0.75rem', borderRadius: '0px' }}
//                                     placeholder="Name (e.g. Lab_Guide.pdf)"
//                                     id={`att_name_${lesson.id}`}
//                                 />
//                                 <input
//                                     className="pfm-input"
//                                     style={{ flex: 1.5, minWidth: '140px', padding: '5px 8px', fontSize: '0.75rem', borderRadius: '0px' }}
//                                     placeholder="Download URL (https://...)"
//                                     id={`att_url_${lesson.id}`}
//                                 />
//                                 <input
//                                     className="pfm-input"
//                                     style={{ flex: 1.8, minWidth: '160px', padding: '5px 8px', fontSize: '0.75rem', borderRadius: '0px' }}
//                                     placeholder="Description / Purpose (optional)..."
//                                     id={`att_desc_${lesson.id}`}
//                                 />
//                                 <button
//                                     type="button"
//                                     onClick={() => {
//                                         const nameInput = document.getElementById(`att_name_${lesson.id}`) as HTMLInputElement;
//                                         const urlInput = document.getElementById(`att_url_${lesson.id}`) as HTMLInputElement;
//                                         const descInput = document.getElementById(`att_desc_${lesson.id}`) as HTMLInputElement;
//                                         if (nameInput?.value && urlInput?.value) {
//                                             const newAtt: LessonAttachment = {
//                                                 id: generateUniqueId('att'),
//                                                 name: nameInput.value,
//                                                 url: urlInput.value,
//                                                 fileType: nameInput.value.split('.').pop() || 'file',
//                                                 description: descInput?.value || '',
//                                                 uploadedAt: new Date().toISOString()
//                                             };
//                                             const updatedAttachments = [...(lesson.attachments || []), newAtt];
//                                             updateDraftLesson(lesson.id, 'attachments', updatedAttachments);
//                                             nameInput.value = '';
//                                             urlInput.value = '';
//                                             if (descInput) descInput.value = '';
//                                         }
//                                     }}
//                                     style={{ background: '#0284c7', color: 'white', border: 'none', padding: '6px 12px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', borderRadius: '0px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
//                                 >
//                                     + Add Link
//                                 </button>
//                             </div>

//                             {lesson.attachments && lesson.attachments.length > 0 && (
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
//                                     {lesson.attachments.map((att: LessonAttachment, attIdx: number) => {
//                                         const ext = (att.fileType || att.name.split('.').pop() || 'file').toLowerCase();
//                                         const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(ext);
//                                         const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'zip'].includes(ext);

//                                         return (
//                                             <div
//                                                 key={att.id || attIdx}
//                                                 style={{
//                                                     background: '#ffffff',
//                                                     border: '1px solid #cbd5e1',
//                                                     borderLeft: '3px solid #0284c7',
//                                                     padding: '8px 10px',
//                                                     display: 'flex',
//                                                     flexDirection: 'column',
//                                                     gap: '6px'
//                                                 }}
//                                             >
//                                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
//                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
//                                                         {isSpreadsheet ? <FileSpreadsheet size={15} color="#059669" /> : isCode ? <FileCode size={15} color="#7c3aed" /> : <FileText size={15} color="#0284c7" />}
//                                                         <span style={{ fontWeight: 800, fontSize: '0.78rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//                                                             {att.name}
//                                                         </span>
//                                                         <span style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
//                                                             ({ext.toUpperCase()})
//                                                         </span>
//                                                     </div>

//                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
//                                                         <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', display: 'flex', alignItems: 'center' }} title="Test Download Link">
//                                                             <ExternalLink size={13} />
//                                                         </a>
//                                                         <span
//                                                             style={{ cursor: 'pointer', color: '#ef4444', display: 'inline-flex', alignItems: 'center' }}
//                                                             onClick={() => {
//                                                                 const filtered = (lesson.attachments || []).filter((a: LessonAttachment) => a.id !== att.id);
//                                                                 updateDraftLesson(lesson.id, 'attachments', filtered);
//                                                             }}
//                                                             title="Remove Attachment"
//                                                         >
//                                                             <X size={14} />
//                                                         </span>
//                                                     </div>
//                                                 </div>

//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <Info size={12} color="#64748b" style={{ flexShrink: 0 }} />
//                                                     <input
//                                                         className="pfm-input"
//                                                         type="text"
//                                                         placeholder="Add brief description or learner instructions (e.g. Reference dataset for Lab 2)..."
//                                                         value={att.description || ''}
//                                                         onChange={(e) => {
//                                                             const newDesc = e.target.value;
//                                                             const updated = (lesson.attachments || []).map((a, idx) =>
//                                                                 idx === attIdx ? { ...a, description: newDesc } : a
//                                                             );
//                                                             updateDraftLesson(lesson.id, 'attachments', updated);
//                                                         }}
//                                                         style={{
//                                                             flex: 1,
//                                                             fontSize: '0.72rem',
//                                                             padding: '3px 8px',
//                                                             background: '#f8fafc',
//                                                             border: '1px solid #e2e8f0',
//                                                             borderRadius: '0px',
//                                                             color: '#334155'
//                                                         }}
//                                                     />
//                                                 </div>
//                                             </div>
//                                         );
//                                     })}
//                                 </div>
//                             )}
//                         </div>

//                         <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px' }}>
//                             <div>
//                                 <Tooltip content="Enforce prerequisite completion before student can unlock the next unit." placement="top">
//                                     <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
//                                         <Lock size={11} style={{ display: 'inline', marginRight: '2px' }} /> Prerequisite Gating
//                                     </label>
//                                 </Tooltip>
//                                 <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#0f172a' }}>
//                                     <input
//                                         type="checkbox"
//                                         checked={lesson.isRequiredForNextUnit || false}
//                                         onChange={e => updateDraftLesson(lesson.id, 'isRequiredForNextUnit', e.target.checked)}
//                                     />
//                                     Make this a Progression Gate (Locks next lessons)
//                                 </label>
//                             </div>

//                             <div>
//                                 <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
//                                     <Tag size={11} style={{ display: 'inline', marginRight: '2px' }} /> Lesson Tags / Keywords
//                                 </label>
//                                 <TagSelector
//                                     selectedTags={lesson.tags || []}
//                                     onChange={newTags => updateDraftLesson(lesson.id, 'tags', newTags)}
//                                 />
//                             </div>
//                         </div>

//                         <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
//                             <button
//                                 type="button"
//                                 className="mlab-btn mlab-btn--primary mlab-btn--sm"
//                                 style={{ borderRadius: '0px', minWidth: '120px', justifyContent: 'center' }}
//                                 onClick={() => handleInlineSaveLesson(lesson.id)}
//                                 disabled={lesson._isSaving}
//                             >
//                                 {lesson._isSaving ? <><Loader2 size={12} className="pfm-spin" /> Saving...</> : <><Save size={12} /> Save Lesson</>}
//                             </button>
//                         </div>
//                     </div>
//                 )}
//             </div>
//         );
//     };

//     return (
//         <div className="pfm-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '12px' }}>

//             {confirmModal.isOpen && createPortal(
//                 <StatusModal
//                     type={confirmModal.type}
//                     title={confirmModal.title}
//                     message={confirmModal.message}
//                     confirmText={confirmModal.confirmText}
//                     cancelText={confirmModal.cancelText}
//                     onClose={() => {
//                         if (confirmModal.onConfirm) confirmModal.onConfirm();
//                         else setConfirmModal(prev => ({ ...prev, isOpen: false }));
//                     }}
//                     onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
//                 />,
//                 document.body
//             )}

//             <div className="pfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '1850px', width: '98vw', height: '96vh', maxHeight: '96vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '0px', overflow: 'hidden' }}>

//                 {/* MODAL HEADER */}
//                 <div className="pfm-header" style={{ flexShrink: 0, borderRadius: '0px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px' }}>
//                     <h2 className="pfm-header__title" style={{ fontSize: '1.05rem', margin: 0 }}>
//                         <Layers size={18} /> Curriculum Content Builder - {activeContainer.title}
//                     </h2>
//                     <button className="pfm-close-btn" type="button" onClick={onClose} disabled={saving}><X size={20} /></button>
//                 </div>

//                 {/* GLOBAL CHECKPOINT STRATEGY BAR */}
//                 <div style={{ background: '#0f172a', color: 'white', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', fontWeight: 700 }}>
//                         <Target size={15} color="#38bdf8" />
//                         <span>Quiz &amp; Verification Strategy:</span>
//                         <div style={{ display: 'flex', gap: '4px' }}>
//                             <button
//                                 type="button"
//                                 onClick={() => setCheckpointScope('per_lesson')}
//                                 style={{
//                                     background: checkpointScope === 'per_lesson' ? '#0284c7' : '#1e293b',
//                                     border: '1px solid #38bdf8',
//                                     color: checkpointScope === 'per_lesson' ? 'white' : '#94a3b8',
//                                     padding: '3px 8px',
//                                     fontSize: '0.7rem',
//                                     fontWeight: 700,
//                                     cursor: 'pointer'
//                                 }}
//                             >
//                                 Per Lesson
//                             </button>
//                             <button
//                                 type="button"
//                                 onClick={() => setCheckpointScope('per_day')}
//                                 style={{
//                                     background: checkpointScope === 'per_day' ? '#0284c7' : '#1e293b',
//                                     border: '1px solid #38bdf8',
//                                     color: checkpointScope === 'per_day' ? 'white' : '#94a3b8',
//                                     padding: '3px 8px',
//                                     fontSize: '0.7rem',
//                                     fontWeight: 700,
//                                     cursor: 'pointer'
//                                 }}
//                             >
//                                 End of Topic Group
//                             </button>
//                             <button
//                                 type="button"
//                                 onClick={() => setCheckpointScope('per_sprint')}
//                                 style={{
//                                     background: checkpointScope === 'per_sprint' ? '#0284c7' : '#1e293b',
//                                     border: '1px solid #38bdf8',
//                                     color: checkpointScope === 'per_sprint' ? 'white' : '#94a3b8',
//                                     padding: '3px 8px',
//                                     fontSize: '0.7rem',
//                                     fontWeight: 700,
//                                     cursor: 'pointer'
//                                 }}
//                             >
//                                 End of Sprint Capstone
//                             </button>
//                         </div>
//                     </div>
//                 </div>

//                 {/* 3-COLUMN WORKSPACE GRID */}
//                 <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 380px', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', background: '#f8fafc' }}>

//                     <CourseMetadataSettingsPanel
//                         illustrationType={illustrationType}
//                         setIllustrationType={setIllustrationType}
//                         themeColor={themeColor}
//                         setThemeColor={setThemeColor}
//                         courseLevel={courseLevel}
//                         setCourseLevel={setCourseLevel}
//                         courseDescription={courseDescription}
//                         setCourseDescription={setCourseDescription}
//                         prerequisites={prerequisites}
//                         setPrerequisites={setPrerequisites}
//                         learningOutcomes={learningOutcomes}
//                         setLearningOutcomes={setLearningOutcomes}
//                         targetAudience={targetAudience}
//                         setTargetAudience={setTargetAudience}
//                         materialIncludes={materialIncludes}
//                         setMaterialIncludes={setMaterialIncludes}
//                         isCertificateAwarded={isCertificateAwarded}
//                         setIsCertificateAwarded={setIsCertificateAwarded}
//                         courseTags={courseTags}
//                         setCourseTags={setCourseTags}
//                         instructors={instructors}
//                         setInstructors={setInstructors}
//                         containerId={activeContainer?.id}
//                         totalContentHours={totalContentHours}
//                         courseworkHours={courseworkHours}
//                         setCourseworkHours={setCourseworkHours}
//                         grandTotalHours={grandTotalHours}
//                         isAccredited={isAccredited}
//                         setIsAccredited={setIsAccredited}
//                         accreditationBody={accreditationBody}
//                         setAccreditationBody={setAccreditationBody}
//                         customAccreditationText={customAccreditationText}
//                         setCustomAccreditationText={setCustomAccreditationText}
//                         saqaId={saqaId}
//                         setSaqaId={setSaqaId}
//                         nqfLevel={nqfLevel}
//                         setNqfLevel={setNqfLevel}
//                         credits={credits}
//                         setCredits={setCredits}
//                         onSyncTagsFromLessons={() => {
//                             const allLessonTags = Array.from(new Set(draftUnits.flatMap(u => u.tags || [])));
//                             if (allLessonTags.length === 0) {
//                                 toast.info("No lesson tags found to sync.");
//                                 return;
//                             }
//                             const merged = Array.from(new Set([...courseTags, ...allLessonTags]));
//                             setCourseTags(merged);
//                             toast.success(`Synced ${allLessonTags.length} unique lesson tag(s)!`);
//                         }}
//                     />

//                     {/* COLUMN 2: PRIMARY CURRICULUM TREE BUILDER */}
//                     <div style={{ overflowY: 'auto', minHeight: 0, padding: '20px', borderRight: '1px solid #e2e8f0' }}>

//                         <div style={{
//                             background: '#ffffff',
//                             border: '2px solid var(--mlab-blue)',
//                             borderLeft: '5px solid #38bdf8',
//                             padding: '12px 16px',
//                             marginBottom: '16px',
//                             display: 'flex',
//                             flexDirection: 'column',
//                             gap: '8px'
//                         }}>
//                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
//                                 <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--mlab-blue)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                     <Video size={14} color="#0284c7" /> Course Stream Preview Video (Trailer)
//                                 </span>
//                                 <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>
//                                     Catalog &amp; Hero Trailer
//                                 </span>
//                             </div>

//                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                 <input
//                                     className="pfm-input"
//                                     style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', borderRadius: '0px', border: '1px solid #cbd5e1' }}
//                                     placeholder="Enter YouTube, Vimeo, or MP4 URL for course stream trailer..."
//                                     value={previewVideoUrl}
//                                     onChange={e => setPreviewVideoUrl(e.target.value)}
//                                 />
//                                 {previewVideoUrl.trim() && (
//                                     <button
//                                         type="button"
//                                         onClick={() => setPreviewLessonId('COURSE_PREVIEW')}
//                                         style={{
//                                             background: previewLessonId === 'COURSE_PREVIEW' ? '#0284c7' : '#e0f2fe',
//                                             color: previewLessonId === 'COURSE_PREVIEW' ? 'white' : '#0369a1',
//                                             border: '1px solid #0284c7',
//                                             padding: '6px 12px',
//                                             fontSize: '0.72rem',
//                                             fontWeight: 800,
//                                             cursor: 'pointer',
//                                             display: 'inline-flex',
//                                             alignItems: 'center',
//                                             gap: '4px',
//                                             borderRadius: '0px',
//                                             fontFamily: 'var(--font-heading)',
//                                             textTransform: 'uppercase'
//                                         }}
//                                     >
//                                         <Eye size={13} /> {previewLessonId === 'COURSE_PREVIEW' ? 'Previewing' : 'Test Preview'}
//                                     </button>
//                                 )}
//                             </div>
//                         </div>

//                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', border: '1px solid #cbd5e1', borderLeft: '4px solid #0284c7', padding: '8px 12px', marginBottom: '16px', borderRadius: '0px' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
//                                 <ArrowDownNarrowWide size={16} color="#0284c7" />
//                                 <span>Curriculum Flow: <strong>Top → Bottom</strong> (Item #1 at top is taught first)</span>
//                             </div>
//                             <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 8px', textTransform: 'uppercase', fontWeight: 800 }}>
//                                 1.0 → N.0 Sequence
//                             </span>
//                         </div>

//                         {activeFramework === 'qcto' ? (
//                             <>
//                                 <div style={{ marginBottom: '16px', padding: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '0px', color: '#065f46', fontSize: '0.85rem' }}>
//                                     <GraduationCap size={16} style={{ display: 'inline', marginRight: '6px', marginBottom: '-3px' }} />
//                                     <strong>QCTO Blueprint Active:</strong> {linkedTemplate ? `Linked Template: ${linkedTemplate.name}` : 'No Template Linked'} • Strategy: <u>{checkpointScope.toUpperCase().replace('_', ' ')}</u>.
//                                 </div>

//                                 {[
//                                     { key: 'knowledge', label: 'Knowledge', prop: 'knowledgeModules' },
//                                     { key: 'practical', label: 'Practical', prop: 'practicalModules' },
//                                     { key: 'workplace', label: 'Work Experience', prop: 'workExperienceModules' }
//                                 ].map(mTypeConfig => {
//                                     const mType = mTypeConfig.key;
//                                     const typeMods = linkedTemplate?.modules?.filter((m: any) => m.type === mType) || linkedTemplate?.[mTypeConfig.prop] || [];
//                                     if (typeMods.length === 0) return null;

//                                     return (
//                                         <div key={mType} style={{ marginBottom: '20px' }}>
//                                             <h3 style={{ textTransform: 'uppercase', color: 'var(--mlab-blue)', fontSize: '0.85rem', marginBottom: '8px', borderBottom: '2px solid #bae6fd', paddingBottom: '4px' }}>
//                                                 {mTypeConfig.label} Modules
//                                             </h3>
//                                             {typeMods.map((mod: any) => {
//                                                 const moduleGate = qctoModuleCheckpoints[mod.code];
//                                                 const hasActiveGate = moduleGate && moduleGate.checkType !== 'none';
//                                                 const modTopics = mod.topics || mod.practicalSkills || mod.workActivities || [];

//                                                 return (
//                                                     <div key={mod.code} className="pfm-module-card" style={{ marginBottom: '16px', borderRadius: '0px', borderLeft: '4px solid #0284c7' }}>

//                                                         <div className="pfm-module-card__hdr expanded" style={{ background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '0px' }}>
//                                                             <strong style={{ color: '#0369a1', fontSize: '0.85rem' }}>
//                                                                 {mod.code}: {mod.name}
//                                                             </strong>

//                                                             {checkpointScope === 'per_sprint' && (
//                                                                 <button
//                                                                     type="button"
//                                                                     onClick={() => toggleQctoModuleCheckpoint(mod.code)}
//                                                                     style={{
//                                                                         display: 'flex',
//                                                                         alignItems: 'center',
//                                                                         gap: '4px',
//                                                                         background: hasActiveGate ? '#0284c7' : '#bae6fd',
//                                                                         border: '1px solid #0284c7',
//                                                                         color: hasActiveGate ? 'white' : '#0369a1',
//                                                                         padding: '0.35rem 0.7rem',
//                                                                         fontSize: '0.72rem',
//                                                                         borderRadius: '0px',
//                                                                         cursor: 'pointer',
//                                                                         fontWeight: 'bold'
//                                                                     }}
//                                                                 >
//                                                                     <Sparkles size={13} />
//                                                                     {hasActiveGate ? 'Edit Module Gate' : '+ Add Module Formative Gate'}
//                                                                 </button>
//                                                             )}
//                                                         </div>

//                                                         {checkpointScope === 'per_sprint' && hasActiveGate && (
//                                                             <div style={{ background: '#f0f9ff', borderBottom: '1px solid #bae6fd', padding: '12px 16px' }}>
//                                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
//                                                                     <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
//                                                                         <Sparkles size={14} /> End-of-Module Formative Gate ({mod.code})
//                                                                     </span>
//                                                                     <button
//                                                                         type="button"
//                                                                         onClick={() => toggleQctoModuleCheckpoint(mod.code)}
//                                                                         style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
//                                                                     >
//                                                                         <X size={14} /> Remove Gate
//                                                                     </button>
//                                                                 </div>

//                                                                 {renderCheckpointEditor(moduleGate, (field, val) => updateQctoModuleField(mod.code, field, val))}
//                                                             </div>
//                                                         )}

//                                                         <div className="pfm-module-card__body" style={{ padding: '12px' }}>
//                                                             {modTopics.map((topic: any, tIdx: number) => {
//                                                                 const topicName = topic.title || topic.name || topic.description || `Topic ${tIdx + 1}`;
//                                                                 const topicKey = `${mod.code}_${topicName}`;
//                                                                 const topicGate = qctoTopicCheckpoints[topicKey];
//                                                                 const hasActiveTopicGate = topicGate && topicGate.checkType !== 'none';

//                                                                 return (
//                                                                     <div key={tIdx} className="pfm-topic" style={{ borderLeft: '3px solid #0ea5e9', marginBottom: '12px', padding: '8px', borderRadius: '0px' }}>
//                                                                         <div style={{ fontWeight: 700, color: '#334155', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
//                                                                             <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Bookmark size={14} color="#0284c7" /> {topicName}</span>

//                                                                             <div style={{ display: 'flex', gap: '6px' }}>
//                                                                                 {checkpointScope === 'per_day' && (
//                                                                                     <button
//                                                                                         type="button"
//                                                                                         onClick={() => toggleQctoTopicCheckpoint(topicKey)}
//                                                                                         style={{
//                                                                                             display: 'flex',
//                                                                                             alignItems: 'center',
//                                                                                             gap: '4px',
//                                                                                             background: hasActiveTopicGate ? '#0284c7' : '#e0f2fe',
//                                                                                             border: '1px solid #0284c7',
//                                                                                             color: hasActiveTopicGate ? 'white' : '#0369a1',
//                                                                                             padding: '0.3rem 0.6rem',
//                                                                                             fontSize: '0.7rem',
//                                                                                             borderRadius: '0px',
//                                                                                             cursor: 'pointer',
//                                                                                             fontWeight: 'bold'
//                                                                                         }}
//                                                                                     >
//                                                                                         <Sparkles size={12} />
//                                                                                         {hasActiveTopicGate ? 'Edit Topic Quiz' : '+ Add Topic Quiz'}
//                                                                                     </button>
//                                                                                 )}

//                                                                                 <button type="button" onClick={() => addDraftLesson({ moduleType: mType as any, moduleCode: mod.code, topicId: topicName })} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '0px', cursor: 'pointer', fontWeight: 'bold' }}>
//                                                                                     <Plus size={12} /> Add Lesson
//                                                                                 </button>
//                                                                             </div>
//                                                                         </div>

//                                                                         {checkpointScope === 'per_day' && hasActiveTopicGate && (
//                                                                             <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '10px', marginBottom: '10px' }}>
//                                                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
//                                                                                     <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                                                         <Sparkles size={12} /> Topic Quiz (Triggers after all topic lessons)
//                                                                                     </span>
//                                                                                     <button type="button" onClick={() => toggleQctoTopicCheckpoint(topicKey)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
//                                                                                 </div>
//                                                                                 {renderCheckpointEditor(topicGate, (field, val) => updateQctoTopicField(topicKey, field, val))}
//                                                                             </div>
//                                                                         )}

//                                                                         {draftUnits
//                                                                             .filter(u => u.moduleCode === mod.code && u.topicId === topicName)
//                                                                             .sort((a, b) => (parseFloat(a.orderIndex as any) || 0) - (parseFloat(b.orderIndex as any) || 0))
//                                                                             .map(renderLessonRow)}
//                                                                     </div>
//                                                                 );
//                                                             })}
//                                                         </div>
//                                                     </div>
//                                                 );
//                                             })}
//                                         </div>
//                                     );
//                                 })}
//                             </>
//                         ) : (
//                             /* SECAM BOOTCAMP BUILDER */
//                             <>
//                                 <div style={{ marginBottom: '16px', padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0px', color: '#1e3a8a', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <div>
//                                         <Zap size={16} style={{ display: 'inline', marginRight: '6px', marginBottom: '-3px' }} />
//                                         <strong>Agile Bootcamp Mode:</strong> Checkpoint strategy set to: <u>{checkpointScope.toUpperCase().replace('_', ' ')}</u>.
//                                     </div>
//                                     <button type="button" className="mlab-btn mlab-btn--primary mlab-btn--sm" style={{ borderRadius: '0px' }} onClick={addSecamSprint}>
//                                         <Plus size={14} /> Add Sprint
//                                     </button>
//                                 </div>

//                                 {secamStructure.map((sprint) => {
//                                     const hasActiveCapstone = sprint.sprintCheckpoint && sprint.sprintCheckpoint.checkType !== 'none';
//                                     const isSprintCollapsed = collapsedSprintIds.has(sprint.id);
//                                     const isDraggingSprint = draggedSprintId === sprint.id;
//                                     const isDragOverSprint = dragOverSprintId === sprint.id;

//                                     return (
//                                         <div
//                                             key={sprint.id}
//                                             draggable
//                                             onDragStart={(e) => {
//                                                 e.stopPropagation();
//                                                 setDraggedSprintId(sprint.id);
//                                                 e.dataTransfer.effectAllowed = 'move';
//                                             }}
//                                             onDragOver={(e) => {
//                                                 e.preventDefault();
//                                                 e.stopPropagation();
//                                                 setDragOverSprintId(sprint.id);
//                                                 e.dataTransfer.dropEffect = 'move';
//                                             }}
//                                             onDragLeave={(e) => {
//                                                 e.stopPropagation();
//                                                 if (dragOverSprintId === sprint.id) setDragOverSprintId(null);
//                                             }}
//                                             onDrop={(e) => {
//                                                 e.preventDefault();
//                                                 e.stopPropagation();
//                                                 handleDropSprint(sprint.id);
//                                             }}
//                                             className="pfm-module-card"
//                                             style={{
//                                                 marginBottom: '16px',
//                                                 borderLeft: '4px solid #7c3aed',
//                                                 borderRadius: '0px',
//                                                 borderTop: isDragOverSprint ? '3px solid #7c3aed' : undefined,
//                                                 opacity: isDraggingSprint ? 0.4 : 1,
//                                                 transition: 'all 0.15s ease'
//                                             }}
//                                         >
//                                             <div className="pfm-module-card__hdr expanded" style={{ background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', borderRadius: '0px' }}>
//                                                 <div style={{ cursor: 'grab', color: '#7c3aed', display: 'flex', alignItems: 'center' }} title="Drag to reorder Sprint (Top → Bottom)">
//                                                     <GripVertical size={18} />
//                                                 </div>

//                                                 <input
//                                                     className="pfm-module-input pfm-module-input--name"
//                                                     style={{ fontWeight: 800, color: '#4c1d95', fontSize: '0.85rem', flex: 1, borderRadius: '0px' }}
//                                                     placeholder="Sprint Title"
//                                                     value={sprint.title}
//                                                     onChange={e => updateSecamSprint(sprint.id, e.target.value)}
//                                                 />

//                                                 <span style={{ fontSize: '0.62rem', background: '#ede9fe', border: '1px solid #ddd6fe', color: '#6d28d9', padding: '2px 6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
//                                                     <ArrowDownNarrowWide size={10} /> Top-Down Block
//                                                 </span>

//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     {checkpointScope === 'per_sprint' && (
//                                                         <button
//                                                             type="button"
//                                                             onClick={() => toggleSprintCheckpoint(secamStructure.findIndex(s => s.id === sprint.id))}
//                                                             style={{
//                                                                 display: 'flex',
//                                                                 alignItems: 'center',
//                                                                 gap: '4px',
//                                                                 background: hasActiveCapstone ? '#7c3aed' : '#f3e8ff',
//                                                                 border: '1px solid #c4b5fd',
//                                                                 color: hasActiveCapstone ? 'white' : '#6d28d9',
//                                                                 padding: '0.35rem 0.7rem',
//                                                                 fontSize: '0.72rem',
//                                                                 borderRadius: '0px',
//                                                                 cursor: 'pointer',
//                                                                 fontWeight: 'bold'
//                                                             }}
//                                                         >
//                                                             <Sparkles size={13} />
//                                                             {hasActiveCapstone ? 'Edit Sprint Capstone' : '+ Add Sprint Capstone'}
//                                                         </button>
//                                                     )}

//                                                     <button
//                                                         type="button"
//                                                         className="pfm-remove-btn"
//                                                         onClick={() => removeSecamSprint(sprint.id)}
//                                                         title="Delete Entire Sprint"
//                                                     >
//                                                         <Trash2 size={16} />
//                                                     </button>

//                                                     <button
//                                                         type="button"
//                                                         onClick={() => toggleSprintCollapse(sprint.id)}
//                                                         style={{ background: 'none', border: 'none', color: '#6d28d9', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
//                                                         title={isSprintCollapsed ? "Expand Sprint" : "Collapse Sprint"}
//                                                     >
//                                                         <ChevronDown size={18} className={`chevron-rotate ${!isSprintCollapsed ? 'expanded' : ''}`} />
//                                                     </button>
//                                                 </div>
//                                             </div>

//                                             {!isSprintCollapsed && (
//                                                 <>
//                                                     {checkpointScope === 'per_sprint' && hasActiveCapstone && (
//                                                         <div style={{ background: '#faf5ff', borderBottom: '1px solid #e9d5ff', padding: '12px 16px' }}>
//                                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
//                                                                 <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
//                                                                     <Sparkles size={14} /> End-of-Sprint Capstone Gate
//                                                                 </span>
//                                                                 <button
//                                                                     type="button"
//                                                                     onClick={() => removeSprintCheckpoint(secamStructure.findIndex(s => s.id === sprint.id))}
//                                                                     style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
//                                                                 >
//                                                                     <X size={14} /> Remove Capstone
//                                                                 </button>
//                                                             </div>

//                                                             {renderCheckpointEditor(sprint.sprintCheckpoint!, (field, val) => updateSprintCheckpointField(secamStructure.findIndex(s => s.id === sprint.id), field, val))}
//                                                         </div>
//                                                     )}

//                                                     <div className="pfm-module-card__body" style={{ padding: '12px' }}>
//                                                         {sprint.days.map((day) => {
//                                                             const hasActiveDayGate = day.dayCheckpoint && day.dayCheckpoint.checkType !== 'none';
//                                                             const isDayCollapsed = collapsedDayIds.has(day.id);
//                                                             const isDraggingDay = draggedDayId === day.id;
//                                                             const isDragOverDay = dragOverDayId === day.id;

//                                                             return (
//                                                                 <div
//                                                                     key={day.id}
//                                                                     draggable
//                                                                     onDragStart={(e) => {
//                                                                         e.stopPropagation();
//                                                                         setDraggedDayId(day.id);
//                                                                         e.dataTransfer.effectAllowed = 'move';
//                                                                     }}
//                                                                     onDragOver={(e) => {
//                                                                         e.preventDefault();
//                                                                         e.stopPropagation();
//                                                                         setDragOverDayId(day.id);
//                                                                         e.dataTransfer.dropEffect = 'move';
//                                                                     }}
//                                                                     onDragLeave={(e) => {
//                                                                         e.stopPropagation();
//                                                                         if (dragOverDayId === day.id) setDragOverDayId(null);
//                                                                     }}
//                                                                     onDrop={(e) => {
//                                                                         e.preventDefault();
//                                                                         e.stopPropagation();
//                                                                         handleDropDay(sprint.id, day.id);
//                                                                     }}
//                                                                     className="pfm-topic"
//                                                                     style={{
//                                                                         borderLeft: '3px solid #c4b5fd',
//                                                                         marginBottom: '12px',
//                                                                         padding: '8px',
//                                                                         borderRadius: '0px',
//                                                                         borderTop: isDragOverDay ? '2px solid #7c3aed' : undefined,
//                                                                         opacity: isDraggingDay ? 0.4 : 1,
//                                                                         transition: 'all 0.15s ease'
//                                                                     }}
//                                                                 >
//                                                                     <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
//                                                                             <div style={{ cursor: 'grab', color: '#7c3aed', display: 'flex', alignItems: 'center' }} title="Drag to reorder Day Group">
//                                                                                 <GripVertical size={16} />
//                                                                             </div>

//                                                                             <Bookmark size={14} color="#7c3aed" />
//                                                                             <input className="pfm-input" style={{ width: '220px', padding: '4px', fontSize: '0.8rem', borderRadius: '0px' }} placeholder="Day Title" value={day.title} onChange={e => updateSecamDay(sprint.id, day.id, e.target.value)} />

//                                                                             <span style={{ fontSize: '0.6rem', background: '#f3e8ff', border: '1px solid #e9d5ff', color: '#7c3aed', padding: '1px 5px', fontWeight: 800 }}>
//                                                                                 Top → Bottom
//                                                                             </span>

//                                                                             <button
//                                                                                 type="button"
//                                                                                 className="pfm-remove-btn"
//                                                                                 onClick={() => removeSecamDay(sprint.id, day.id)}
//                                                                                 title="Delete Day Group"
//                                                                             >
//                                                                                 <Trash2 size={14} />
//                                                                             </button>

//                                                                             <button
//                                                                                 type="button"
//                                                                                 onClick={() => toggleDayCollapse(day.id)}
//                                                                                 style={{ background: 'none', border: 'none', color: '#6d28d9', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
//                                                                                 title={isDayCollapsed ? "Expand Day Group" : "Collapse Day Group"}
//                                                                             >
//                                                                                 <ChevronDown size={18} className={`chevron-rotate ${!isDayCollapsed ? 'expanded' : ''}`} />
//                                                                             </button>
//                                                                         </div>

//                                                                         <div style={{ display: 'flex', gap: '6px' }}>
//                                                                             {checkpointScope === 'per_day' && (
//                                                                                 <button
//                                                                                     type="button"
//                                                                                     onClick={() => toggleDayCheckpoint(secamStructure.findIndex(s => s.id === sprint.id), sprint.days.findIndex(d => d.id === day.id))}
//                                                                                     style={{
//                                                                                         display: 'flex',
//                                                                                         alignItems: 'center',
//                                                                                         gap: '4px',
//                                                                                         background: hasActiveDayGate ? '#7c3aed' : '#f3e8ff',
//                                                                                         border: '1px solid #c4b5fd',
//                                                                                         color: hasActiveDayGate ? 'white' : '#6d28d9',
//                                                                                         padding: '0.3rem 0.6rem',
//                                                                                         fontSize: '0.7rem',
//                                                                                         borderRadius: '0px',
//                                                                                         cursor: 'pointer',
//                                                                                         fontWeight: 'bold'
//                                                                                     }}
//                                                                                 >
//                                                                                     <Sparkles size={12} />
//                                                                                     {hasActiveDayGate ? 'Edit Day Quiz' : '+ Add Day Quiz'}
//                                                                                 </button>
//                                                                             )}

//                                                                             <button type="button" onClick={() => addDraftLesson({ sprintTitle: sprint.title, dayOrLessonTitle: day.title })} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '0px', cursor: 'pointer', fontWeight: 'bold' }}>
//                                                                                 <Plus size={12} /> Add Lesson
//                                                                             </button>
//                                                                         </div>
//                                                                     </div>

//                                                                     {!isDayCollapsed && (
//                                                                         <>
//                                                                             {checkpointScope === 'per_day' && hasActiveDayGate && (
//                                                                                 <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', padding: '10px', marginBottom: '10px' }}>
//                                                                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
//                                                                                         <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                                                             <Sparkles size={12} /> End-of-Day Completion Quiz
//                                                                                         </span>
//                                                                                         <button type="button" onClick={() => toggleDayCheckpoint(secamStructure.findIndex(s => s.id === sprint.id), sprint.days.findIndex(d => d.id === day.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
//                                                                                     </div>
//                                                                                     {renderCheckpointEditor(day.dayCheckpoint!, (field, val) => updateDayCheckpointField(secamStructure.findIndex(s => s.id === sprint.id), sprint.days.findIndex(d => d.id === day.id), field, val))}
//                                                                                 </div>
//                                                                             )}

//                                                                             {draftUnits
//                                                                                 .filter(u => u.sprintTitle === sprint.title && u.dayOrLessonTitle === day.title)
//                                                                                 .sort((a, b) => (parseFloat(a.orderIndex as any) || 0) - (parseFloat(b.orderIndex as any) || 0))
//                                                                                 .map(renderLessonRow)}
//                                                                         </>
//                                                                     )}
//                                                                 </div>
//                                                             );
//                                                         })}

//                                                         <button type="button" onClick={() => addSecamDay(sprint.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: '#7c3aed', padding: '4px 0', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>
//                                                             <Plus size={12} /> Add Day Group
//                                                         </button>
//                                                     </div>
//                                                 </>
//                                             )}
//                                         </div>
//                                     );
//                                 })}
//                             </>
//                         )}
//                     </div>

//                     {/* COLUMN 3: LIVE STUDENT PREVIEW STATION */}
//                     <div style={{ overflowY: 'auto', minHeight: 0, padding: '20px', background: '#0f172a', color: '#f8fafc', borderLeft: '1px solid #1e293b' }}>
//                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8' }}>
//                                 <Tv size={18} /> Student Portal Live Preview
//                             </div>
//                             <span style={{ fontSize: '0.7rem', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '2px 8px', borderRadius: '0px' }}>
//                                 {activeFramework.toUpperCase()} Player
//                             </span>
//                         </div>

//                         {previewLessonId !== 'COURSE_PREVIEW' && activePreviewUnit && !mockUnlockedUnitIds.has(activePreviewUnit.id) && (
//                             <div style={{ background: '#7f1d1d', border: '1px solid #f87171', color: '#fca5a5', padding: '10px 14px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderRadius: '0px' }}>
//                                 <Lock size={16} /> This lesson will appear locked to learners until previous progression gates are passed.
//                             </div>
//                         )}

//                         {previewLessonId === 'COURSE_PREVIEW' ? (
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                                 <div>
//                                     <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0ea5e9', fontWeight: 700, marginBottom: '4px' }}>
//                                         Course Stream Trailer Preview
//                                     </div>
//                                     <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff', fontWeight: 700 }}>
//                                         {activeContainer?.title || 'Course Preview Trailer'}
//                                     </h3>
//                                 </div>

//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                     <div style={{ background: '#000000', borderRadius: '0px', overflow: 'hidden', border: '1px solid #334155', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
//                                         {getVideoThumbnail(previewVideoUrl) ? (
//                                             <div
//                                                 style={{ width: '100%', height: '100%', backgroundImage: `url(${getVideoThumbnail(previewVideoUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
//                                                 onClick={() => openPopoutPlayer(previewVideoUrl)}
//                                             >
//                                                 <div style={{ background: 'rgba(2, 132, 199, 0.85)', padding: '12px 18px', borderRadius: '0px', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 700, fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
//                                                     <Play size={16} fill="white" /> Launch Trailer Stream Player
//                                                 </div>
//                                             </div>
//                                         ) : getEmbedVideoUrl(previewVideoUrl) ? (
//                                             <iframe
//                                                 src={getEmbedVideoUrl(previewVideoUrl)!}
//                                                 style={{ width: '100%', height: '100%', border: 'none' }}
//                                                 title="Course Stream Preview Trailer"
//                                                 allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
//                                                 allowFullScreen
//                                             />
//                                         ) : (
//                                             <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
//                                                 <Video size={40} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
//                                                 <p style={{ margin: 0, fontSize: '0.8rem' }}>Enter a valid Vimeo or YouTube URL in the trailer field above</p>
//                                             </div>
//                                         )}
//                                     </div>

//                                     {previewVideoUrl.trim() && (
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                             <button
//                                                 type="button"
//                                                 onClick={() => openPopoutPlayer(previewVideoUrl)}
//                                                 style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0 }}
//                                             >
//                                                 <ExternalLink size={12} /> Launch Standalone Window Player
//                                             </button>
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         ) : activePreviewUnit ? (
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                                 <div>
//                                     <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0ea5e9', fontWeight: 700, marginBottom: '4px' }}>
//                                         #{activePreviewUnit.orderIndex} • {activeFramework === 'qcto' ? `${activePreviewUnit.moduleCode || 'KM-01'} • ${activePreviewUnit.topicId || 'General'}` : `${activePreviewUnit.sprintTitle || 'Sprint'} • ${activePreviewUnit.dayOrLessonTitle || 'Day'}`}
//                                     </div>
//                                     <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff', fontWeight: 700 }}>
//                                         {activePreviewUnit.title || 'Untitled Lesson'}
//                                     </h3>
//                                     <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
//                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {activePreviewUnit.estimatedMinutes || 15} Mins</span>
//                                         <span style={{ textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700 }}>{activePreviewUnit.unitType}</span>
//                                     </div>

//                                     {activePreviewUnit.tags && activePreviewUnit.tags.length > 0 && (
//                                         <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
//                                             {activePreviewUnit.tags.map(tag => (
//                                                 <span key={tag} style={{ fontSize: '0.65rem', background: '#1e293b', color: '#38bdf8', border: '1px solid #0284c7', padding: '1px 6px', fontWeight: 700, textTransform: 'uppercase' }}>
//                                                     #{tag}
//                                                 </span>
//                                             ))}
//                                         </div>
//                                     )}
//                                 </div>

//                                 {activePreviewUnit.unitType === 'video' && (
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                         <div style={{ background: '#000000', borderRadius: '0px', overflow: 'hidden', border: '1px solid #334155', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
//                                             {getVideoThumbnail(activePreviewUnit.videoUrl) ? (
//                                                 <div
//                                                     style={{ width: '100%', height: '100%', backgroundImage: `url(${getVideoThumbnail(activePreviewUnit.videoUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
//                                                     onClick={() => openPopoutPlayer(activePreviewUnit.videoUrl!)}
//                                                 >
//                                                     <div style={{ background: 'rgba(2, 132, 199, 0.85)', padding: '12px 18px', borderRadius: '0px', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 700, fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
//                                                         <Play size={16} fill="white" /> Launch Live Stream Player
//                                                     </div>
//                                                 </div>
//                                             ) : getEmbedVideoUrl(activePreviewUnit.videoUrl) ? (
//                                                 <iframe
//                                                     src={getEmbedVideoUrl(activePreviewUnit.videoUrl)!}
//                                                     style={{ width: '100%', height: '100%', border: 'none' }}
//                                                     title="Video Preview"
//                                                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
//                                                     allowFullScreen
//                                                 />
//                                             ) : (
//                                                 <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
//                                                     <Video size={40} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
//                                                     <p style={{ margin: 0, fontSize: '0.8rem' }}>Enter a Vimeo or YouTube URL in the editor to stream live preview</p>
//                                                 </div>
//                                             )}
//                                             {activePreviewUnit.requiredWatchPercentage && (
//                                                 <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(15, 23, 42, 0.85)', padding: '4px 8px', borderRadius: '0px', fontSize: '0.68rem', color: '#38bdf8', border: '1px solid #334155' }}>
//                                                     Required: {activePreviewUnit.requiredWatchPercentage}% Watch
//                                                 </div>
//                                             )}
//                                         </div>

//                                         {activePreviewUnit.videoUrl && (
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                 <button
//                                                     type="button"
//                                                     onClick={() => openPopoutPlayer(activePreviewUnit.videoUrl!)}
//                                                     style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0 }}
//                                                 >
//                                                     <ExternalLink size={12} /> Launch Standalone Window Player
//                                                 </button>
//                                             </div>
//                                         )}
//                                     </div>
//                                 )}

//                                 {activePreviewUnit.unitType === 'reading' && (
//                                     <div style={{ background: '#1e293b', padding: '16px', borderRadius: '0px', border: '1px solid #334155', fontSize: '0.85rem', color: '#cbd5e1', minHeight: '120px' }}>
//                                         <FileText size={20} color="#38bdf8" style={{ marginBottom: '8px' }} />
//                                         <div className="ql-editor" style={{ padding: 0, minHeight: 'auto' }}>
//                                             <div dangerouslySetInnerHTML={{ __html: activePreviewUnit.contentHtml || '<p style="color:#64748b; font-style:italic;">Reading body guide content preview...</p>' }} />
//                                         </div>
//                                     </div>
//                                 )}

//                                 {activePreviewUnit.unitType === 'interactive_code' && (
//                                     <div style={{ background: '#0f172a', padding: '12px', borderRadius: '0px', border: '1px solid #334155', fontFamily: 'monospace', fontSize: '0.8rem', color: '#38bdf8' }}>
//                                         <div style={{ color: '#64748b', marginBottom: '6px' }}>// Student Interactive Code Sandbox</div>
//                                         <div>const learnerCode = () =&gt; &#123;</div>
//                                         <div style={{ paddingLeft: '16px', color: '#f8fafc' }}>// Interactive code execution block</div>
//                                         <div>&#125;;</div>
//                                     </div>
//                                 )}

//                                 {/* PREVIEW: LINKED FORMAL SETA / QCTO EXAM CARD */}
//                                 {activePreviewUnit.linkedAssessmentId && (
//                                     <div style={{ background: '#faf5ff', padding: '12px', borderRadius: '0px', border: '1px solid #e9d5ff', borderLeft: '4px solid #7c3aed', marginTop: '8px' }}>
//                                         <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#6b21a8', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <Award size={14} /> Linked Formal Exam / Assessment
//                                         </div>
//                                         <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
//                                             {packageAssessments.find(a => a.id === activePreviewUnit.linkedAssessmentId)?.title || 'Formal SETA / QCTO Examination Module'}
//                                         </div>
//                                         <div style={{ fontSize: '0.72rem', color: '#475569' }}>
//                                             Unlinked Policy: <strong>{activePreviewUnit.unlinkedPolicy === 'hard_gate' ? 'Hard Gate (Progress blocked until graded)' : 'Soft Gate (Progress allowed if pending release)'}</strong>
//                                         </div>
//                                     </div>
//                                 )}

//                                 {activePreviewUnit.attachments && activePreviewUnit.attachments.length > 0 && (
//                                     <div style={{ background: '#1e293b', padding: '12px', borderRadius: '0px', border: '1px solid #334155' }}>
//                                         <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <Paperclip size={13} /> Attached Downloadable Assets ({activePreviewUnit.attachments.length})
//                                         </div>
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                             {activePreviewUnit.attachments.map((att: LessonAttachment) => (
//                                                 <div key={att.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: '#0f172a', border: '1px solid #334155', padding: '8px', borderRadius: '0px' }}>
//                                                     <a
//                                                         href={att.url}
//                                                         target="_blank"
//                                                         rel="noopener noreferrer"
//                                                         style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#f8fafc', fontSize: '0.75rem', textDecoration: 'none' }}
//                                                     >
//                                                         <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}>
//                                                             <FileText size={13} color="#0284c7" /> {att.name}
//                                                         </span>
//                                                         <ExternalLink size={12} color="#94a3b8" />
//                                                     </a>
//                                                     {att.description && (
//                                                         <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic', paddingLeft: '19px' }}>
//                                                             💡 {att.description}
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             ))}
//                                         </div>
//                                     </div>
//                                 )}

//                                 {activePreviewUnit.interactiveCheck?.checkType && activePreviewUnit.interactiveCheck.checkType !== 'none' && (
//                                     <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0px', padding: '14px', marginTop: '8px' }}>
//                                         <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#f59e0b', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
//                                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                 <Sparkles size={14} /> In-Lesson Verification Check
//                                             </span>

//                                             {activePreviewUnit.interactiveCheck.timeLimitSeconds ? (() => {
//                                                 const total = activePreviewUnit.interactiveCheck.timeLimitSeconds;
//                                                 const mins = Math.floor(total / 60);
//                                                 const secs = total % 60;
//                                                 const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
//                                                 return (
//                                                     <span style={{ background: '#7f1d1d', border: '1px solid #f87171', color: '#fca5a5', padding: '2px 8px', borderRadius: '0px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
//                                                         <Timer size={12} /> {timeStr} Remaining
//                                                     </span>
//                                                 );
//                                             })() : (
//                                                 <span style={{ fontSize: '0.68rem', color: '#64748b' }}>No Time Limit</span>
//                                             )}
//                                         </div>

//                                         {/* --- MULTI-QUESTION MCQ STUDENT LIVE PREVIEW --- */}
//                                         {activePreviewUnit.interactiveCheck.checkType === 'mcq' && (
//                                             <div style={{ background: '#0f172a', borderRadius: '0px', padding: '12px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                                                 <div style={{ fontSize: '0.78rem', color: '#4ade80', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <HelpCircle size={14} /> MCQ Quiz Bank Preview ({(activePreviewUnit.interactiveCheck.mcqQuestions || []).length} Question{(activePreviewUnit.interactiveCheck.mcqQuestions || []).length === 1 ? '' : 's'})
//                                                 </div>

//                                                 {(activePreviewUnit.interactiveCheck.mcqQuestions || []).map((q, qIdx) => (
//                                                     <div key={q.id || qIdx} style={{ background: '#1e293b', border: '1px solid #334155', padding: '10px' }}>
//                                                         <div style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
//                                                             Question {qIdx + 1} of {(activePreviewUnit.interactiveCheck?.mcqQuestions || []).length}
//                                                         </div>
//                                                         <p style={{ fontSize: '0.82rem', color: '#f8fafc', fontWeight: 600, margin: '0 0 10px 0', lineHeight: 1.4 }}>
//                                                             {q.question || 'Question prompt goes here...'}
//                                                         </p>

//                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                                             {(q.options || []).map((opt, oIdx) => (
//                                                                 <div
//                                                                     key={opt.id || oIdx}
//                                                                     style={{
//                                                                         display: 'flex',
//                                                                         alignItems: 'center',
//                                                                         gap: '8px',
//                                                                         background: '#0f172a',
//                                                                         border: opt.isCorrect ? '1px solid #22c55e' : '1px solid #334155',
//                                                                         padding: '8px 10px',
//                                                                         fontSize: '0.75rem',
//                                                                         color: '#e2e8f0'
//                                                                     }}
//                                                                 >
//                                                                     <input type="radio" name={`preview_mcq_${q.id || qIdx}`} disabled checked={!!opt.isCorrect} />
//                                                                     <span style={{ flex: 1 }}>{opt.text || `Option ${oIdx + 1}`}</span>
//                                                                     {opt.isCorrect && (
//                                                                         <span style={{ fontSize: '0.62rem', color: '#4ade80', background: '#052e16', padding: '2px 6px', fontWeight: 800, textTransform: 'uppercase' }}>
//                                                                             Correct
//                                                                         </span>
//                                                                     )}
//                                                                 </div>
//                                                             ))}
//                                                         </div>
//                                                     </div>
//                                                 ))}
//                                             </div>
//                                         )}

//                                         {activePreviewUnit.interactiveCheck.checkType === 'socratic_dialogue' && (
//                                             <div style={{ background: '#0f172a', borderRadius: '0px', padding: '12px', border: '1px solid #334155' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#fbbf24', fontWeight: 700, marginBottom: '6px' }}>
//                                                     <Bot size={14} /> AI Persona: {activePreviewUnit.interactiveCheck.aiPersonaRole || 'Junior Developer'}
//                                                 </div>
//                                                 <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.4 }}>
//                                                     "{activePreviewUnit.interactiveCheck.instructions || 'Explain your solution logic to pass...'}"
//                                                 </p>
//                                                 <div style={{ display: 'flex', gap: '6px' }}>
//                                                     <input className="pfm-input" style={{ flex: 1, padding: '4px 8px', fontSize: '0.75rem', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '0px' }} placeholder="Student types explanation..." disabled />
//                                                     <button type="button" style={{ background: '#0284c7', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '0px' }} disabled><Send size={12} /></button>
//                                                 </div>
//                                             </div>
//                                         )}

//                                         {activePreviewUnit.interactiveCheck.checkType === 'spot_the_bug' && (
//                                             <div style={{ background: '#0f172a', borderRadius: '0px', padding: '12px', border: '1px solid #334155' }}>
//                                                 <div style={{ fontSize: '0.78rem', color: '#f43f5e', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                     <Bug size={14} /> Spot-the-Bug Challenge Preview
//                                                 </div>
//                                                 <p style={{ fontSize: '0.75rem', color: '#cbd5e1', margin: '0 0 8px 0' }}>
//                                                     {activePreviewUnit.interactiveCheck.instructions || 'Fix the code logic to pass the completion gate.'}
//                                                 </p>

//                                                 <div style={{ border: '1px solid #1e293b', overflow: 'hidden' }}>
//                                                     <Editor
//                                                         height="140px"
//                                                         defaultLanguage="javascript"
//                                                         theme="vs-dark"
//                                                         value={sanitizeCodeInput(activePreviewUnit.interactiveCheck.buggyCode || DEFAULT_BUGGY_CODE)}
//                                                         options={{
//                                                             readOnly: true,
//                                                             minimap: { enabled: false },
//                                                             fontSize: 12,
//                                                             lineNumbers: 'on',
//                                                             scrollBeyondLastLine: false,
//                                                             automaticLayout: true,
//                                                             fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
//                                                             renderControlCharacters: false,
//                                                             unicodeHighlight: {
//                                                                 ambiguousCharacters: false,
//                                                                 invisibleCharacters: false
//                                                             }
//                                                         }}
//                                                     />
//                                                 </div>
//                                             </div>
//                                         )}

//                                         {activePreviewUnit.interactiveCheck.checkType === 'oral_defense' && (
//                                             <div style={{ background: '#0f172a', borderRadius: '0px', padding: '12px', border: '1px solid #334155', textAlign: 'center' }}>
//                                                 <div style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
//                                                     <Mic size={14} /> Voice Oral Defense Prompt
//                                                 </div>
//                                                 <p style={{ fontSize: '0.8rem', color: '#e2e8f0', margin: '0 0 10px 0' }}>
//                                                     "{activePreviewUnit.interactiveCheck.defenseQuestion || 'Record your voice response...'}"
//                                                 </p>
//                                                 <button type="button" style={{ background: '#7c3aed', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '0px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }} disabled>
//                                                     <Mic size={12} /> Record Response
//                                                 </button>
//                                             </div>
//                                         )}
//                                     </div>
//                                 )}
//                             </div>
//                         ) : (
//                             <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
//                                 <Eye size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
//                                 <p style={{ fontSize: '0.85rem', margin: 0 }}>Select or edit any lesson on the left to inspect its live student preview</p>
//                             </div>
//                         )}
//                     </div>
//                 </div>

//                 {/* MODAL FOOTER */}
//                 <div className="pfm-footer" style={{ flexShrink: 0, borderRadius: '0px', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
//                     <Tooltip content="Close without saving any changes made in this session." placement="top">
//                         <button type="button" className="pfm-btn pfm-btn--ghost" style={{ borderRadius: '0px' }} onClick={onClose} disabled={saving}>Discard Unsaved Changes</button>
//                     </Tooltip>
//                     <Tooltip content="Batch commit all lessons, order indexes, gates, and metadata to Cloud Firestore." placement="top">
//                         <button type="button" className="pfm-btn pfm-btn--primary" style={{ borderRadius: '0px', minWidth: '220px', justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
//                             {saving ? <><Loader2 size={13} className="pfm-spin" /> Saving Tree…</> : <><CheckCircle2 size={13} /> Commit Curriculum Structure</>}
//                         </button>
//                     </Tooltip>
//                 </div>
//             </div>
//         </div>
//     );
// };

