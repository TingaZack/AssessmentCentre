// src/pages/LearnerPortal/LearnerContentHub/CoursePlayerView.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import moment from 'moment';
import {
    ArrowLeft, Share2, Bookmark, ChevronRight, Tv, FileText, Send,
    PartyPopper, Timer, CheckCircle2, Check, Sparkles, Bug, Bot,
    MessageSquare, Paperclip, HelpCircle, ChevronDown, Pause, Play,
    Lock, ExternalLink, Loader2, Plus, MessageCircle, Zap,
    Award, RotateCcw, Download, FileSpreadsheet, FileCode, X
} from 'lucide-react';
import {
    doc, getDoc, setDoc, collection, query, where,
    onSnapshot, addDoc, serverTimestamp, updateDoc, deleteDoc, increment, getDocs
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';

import ReactPlayer from 'react-player';

import { QuillHTMLViewer } from '../../../components/common/QuillHTMLViewer/QuillHTMLViewer';
import Tooltip from '../../../components/common/Tooltip/Tooltip';

import {
    ProgressBar,
    type CoursePackage,
    type LearnerUnitProgress
} from './types';

if (typeof window !== 'undefined' && !(window as unknown as { katex: typeof katex }).katex) {
    (window as unknown as { katex: typeof katex }).katex = katex;
}

export interface AttachmentItem {
    id?: string;
    url?: string;
    name?: string;
    containerId?: string;
    timelineId?: string;
    cohortRunId?: string;
    fileType?: string;
    fileSize?: number;
    description?: string;
}

export interface RelatedLinkItem {
    title?: string;
    url: string;
    type?: string;
}

export interface ExtendedCoursePackage extends CoursePackage {
    timelineId?: string;
    placementId?: string;
    allowedProgressKeys?: string[];
    checkpointScope?: 'per_lesson' | 'per_day' | 'per_sprint';
    attachments?: AttachmentItem[];
    secamStructure?: Array<{
        title?: string;
        sprintCheckpoint?: Record<string, unknown>;
        days?: Array<{ title?: string; dayCheckpoint?: Record<string, unknown>;[key: string]: unknown }>;
        [key: string]: unknown;
    }>;
    checkpointMetadata?: {
        secamStructure?: Array<{
            title?: string;
            sprintCheckpoint?: Record<string, unknown>;
            days?: Array<{ title?: string; dayCheckpoint?: Record<string, unknown>;[key: string]: unknown }>;
            [key: string]: unknown;
        }>;
        qctoModuleCheckpoints?: Record<string, Record<string, unknown>>;
        qctoTopicCheckpoints?: Record<string, Record<string, unknown>>;
        previewVideoUrl?: string;
        materialIncludes?: string[];
        attachments?: AttachmentItem[];
        courseAttachments?: AttachmentItem[];
        instructors?: Array<{ id?: string; name: string; role?: string; initials?: string }>;
        pacingScheduleBreakdown?: Array<{ moduleOrSprintTitle?: string; title?: string; targetDate?: string; targetHours?: number }>;
        [key: string]: unknown;
    };
    pacingScheduleBreakdown?: Array<{ moduleOrSprintTitle?: string; title?: string; targetDate?: string; targetHours?: number }>;
    pacingModel?: 'cohort_scheduled' | 'individual_self_paced';
    [key: string]: unknown;
}

export interface ExtendedLearnerUnitProgress extends LearnerUnitProgress {
    progressPercent?: number;
    watchPercentage?: number;
    cohortRunId?: string;
    unlinkedPolicy?: 'soft_gate' | 'hard_gate';
    files?: AttachmentItem[];
    lessonAttachments?: AttachmentItem[];
    relatedLinks?: RelatedLinkItem[];
}

export interface LearnerCommentDoc {
    id: string;
    unitId: string;
    containerId?: string;
    timelineId?: string;
    cohortRunId?: string;
    userId: string;
    userName: string;
    userInitials?: string;
    text: string;
    createdAt?: { toDate?: () => Date; seconds?: number };
    isStaff?: boolean;
    isFlagged?: boolean;
    flagReason?: string;
}

export interface LearnerQuestionDoc {
    id: string;
    unitId: string;
    containerId?: string;
    timelineId?: string;
    cohortRunId?: string;
    userId: string;
    userName: string;
    userInitials?: string;
    title: string;
    contentHtml: string;
    answersCount?: number;
    isResolved?: boolean;
    createdAt?: { toDate?: () => Date; seconds?: number };
}

export interface LearnerAnswerDoc {
    id: string;
    questionId: string;
    unitId: string;
    containerId?: string;
    userId: string;
    userName: string;
    userInitials?: string;
    contentHtml: string;
    createdAt?: { toDate?: () => Date; seconds?: number };
    isStaff?: boolean;
}

interface CertificateData {
    id?: string;
    courseName?: string;
    pdfUrl: string;
    [key: string]: unknown;
}

interface CoursePlayerViewProps {
    selectedCourse: CoursePackage;
    selectedUnit: LearnerUnitProgress;
    courseUnits: LearnerUnitProgress[];
    groupedSyllabus: Record<string, LearnerUnitProgress[]>;
    onBackToOverview: () => void;
    onSelectUnit: (unit: LearnerUnitProgress) => void;
}

const getCourseInstanceId = (c?: CoursePackage | ExtendedCoursePackage | null) => {
    if (!c) return '';
    const ext = c as ExtendedCoursePackage;
    return ext.cohortRunId || ext.timelineId || ext.placementId || ext.id;
};

const extractYouTubeId = (url: string): string | null => {
    const cleanUrl = url.trim();
    if (cleanUrl.includes('youtu.be/')) {
        return cleanUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (cleanUrl.includes('youtube.com/shorts/')) {
        return cleanUrl.split('youtube.com/shorts/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (cleanUrl.includes('youtube.com/live/')) {
        return cleanUrl.split('youtube.com/live/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (cleanUrl.includes('youtube.com/embed/')) {
        return cleanUrl.split('youtube.com/embed/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (cleanUrl.includes('youtube.com')) {
        try {
            const urlObj = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`);
            return urlObj.searchParams.get('v');
        } catch (e) {
            return null;
        }
    }
    return null;
};

const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const QUILL_QA_MODULES = {
    toolbar: [
        ['bold', 'italic', 'underline', 'code-block'],
        ['formula'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link'],
        ['clean']
    ],
};

const CertificateModal: React.FC<{ certificate: CertificateData; onClose: () => void }> = ({ certificate, onClose }) => {
    return createPortal(
        <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: '960px', height: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid var(--mlab-green)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Award size={20} color="var(--mlab-green)" />
                        <div>
                            <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Certificate of Completion</div>
                            <div style={{ fontSize: '0.75rem', color: '#bae6fd' }}>{certificate.courseName || 'Course Verification'}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <Tooltip content="Download official certificate PDF document." placement="bottom">
                            <button onClick={() => window.open(certificate.pdfUrl, '_blank')} className="lfm-btn lfm-btn--primary" style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none', padding: '6px 14px', borderRadius: '2px' }}>
                                <Download size={14} /> Download Original PDF
                            </button>
                        </Tooltip>
                        <Tooltip content="Close certificate viewer" placement="bottom">
                            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} />
                            </button>
                        </Tooltip>
                    </div>
                </div>
                <div style={{ flex: 1, background: '#e2e8f0', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <object data={`${certificate.pdfUrl}#toolbar=0&navpanes=0`} type="application/pdf" width="100%" height="100%" style={{ borderRadius: '2px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                        <iframe src={`${certificate.pdfUrl}#toolbar=0&navpanes=0`} width="100%" height="100%" style={{ border: 'none' }} title="Certificate Preview">
                            <p>It appears you don't have a PDF plugin for this browser. <a href={certificate.pdfUrl} target="_blank" rel="noopener noreferrer">Click here to download the PDF.</a></p>
                        </iframe>
                    </object>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const CoursePlayerView: React.FC<CoursePlayerViewProps> = ({
    selectedCourse,
    selectedUnit,
    courseUnits,
    onBackToOverview,
    onSelectUnit
}) => {
    const targetInstanceId = useMemo(() => getCourseInstanceId(selectedCourse), [selectedCourse]);

    const [expandedMainGroups, setExpandedMainGroups] = useState<Record<string, boolean>>({});
    const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});

    const [activeLessonTab, setActiveLessonTab] = useState<'notes' | 'comments' | 'attachments' | 'qa' | 'related'>('notes');
    const [checkSubmitted, setCheckSubmitted] = useState(false);
    const [socraticInput, setSocraticInput] = useState('');
    const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
    const [showGateCelebration, setShowGateCelebration] = useState(false);

    const [learnerNotes, setLearnerNotes] = useState('');
    const [isNotesLoading, setIsNotesLoading] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

    const [comments, setComments] = useState<LearnerCommentDoc[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isPostingComment, setIsPostingComment] = useState(false);

    const [questions, setQuestions] = useState<LearnerQuestionDoc[]>([]);
    const [qaViewMode, setQaViewMode] = useState<'list' | 'ask' | 'detail'>('list');
    const [selectedQuestion, setSelectedQuestion] = useState<LearnerQuestionDoc | null>(null);
    const [questionAnswers, setQuestionAnswers] = useState<LearnerAnswerDoc[]>([]);

    const [showMockAiAnswer, setShowMockAiAnswer] = useState(false);
    const [isAiThinking, setIsAiThinking] = useState(false);

    const [questionTitle, setQuestionTitle] = useState('');
    const [questionBody, setQuestionTitleBody] = useState('');
    const [answerBody, setAnswerBody] = useState('');
    const [isSubmittingQA, setIsSubmittingQA] = useState(false);

    // WATCH TRACKING STATE & REFS
    const [currentWatchPct, setCurrentWatchPct] = useState(0);
    const [currentWatchedMins, setCurrentWatchedMins] = useState(0);
    const [isLessonCompleted, setIsLessonCompleted] = useState(false);

    // BOOKMARK STATE
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [isBookmarking, setIsBookmarking] = useState(false);

    const [learnerCertificate, setLearnerCertificate] = useState<CertificateData | null>(null);
    const [isCertModalOpen, setIsCertModalOpen] = useState(false);
    const [isSearchingCert, setIsSearchingCert] = useState(false);

    // SHARE STATE
    const [shareCopied, setShareCopied] = useState(false);

    // RESUME PLAYBACK & AUTO-NEXT STATE & REFS
    const [resumeTime, setResumeTime] = useState<number | null>(null);
    const [autoNext, setAutoNext] = useState(() => localStorage.getItem('mlab_autonext') === 'true');
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [isVideoBuffering, setIsVideoBuffering] = useState(false);

    const playerRef = useRef<any>(null); // Type safe bypass for ReactPlayer ref
    const hasSoughtRef = useRef(false);

    const lastSavedTimeRef = useRef<number>(0);
    const lastRenderTimeRef = useRef<number>(0);

    // ANTI-FAST-FORWARD WATCH RECORD REF & DURATION STATE
    const maxWatchedSecondsRef = useRef<number>(0);
    const [duration, setDuration] = useState(0);

    // QUIZ MODE STATE
    const [isQuizMode, setIsQuizMode] = useState(false);

    // LOCAL STATE FOR LIVE-ENRICHED COURSE UNITS
    const [enrichedCourseUnits, setEnrichedCourseUnits] = useState<LearnerUnitProgress[]>(courseUnits);

    // REAL-TIME FIREBASE LISTENER FOR TIMELINE-SPECIFIC PROGRESS
    useEffect(() => {
        setEnrichedCourseUnits(courseUnits);

        const currentUser = auth.currentUser;
        if (!currentUser || !selectedCourse) return;

        const extCourse = selectedCourse as ExtendedCoursePackage;
        const targetKeys = extCourse.allowedProgressKeys || [targetInstanceId];

        const q = query(
            collection(db, 'learner_content_progress'),
            where('userId', '==', currentUser.uid),
            where('containerId', 'in', targetKeys)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const progressMap = new Map<string, { isCompleted?: boolean; watchPct?: number }>();
            snapshot.docs.forEach(d => {
                const data = d.data();
                progressMap.set(data.unitId as string, data);
            });

            setEnrichedCourseUnits(prev => prev.map(unit => {
                const prog = progressMap.get(unit.id);
                if (prog) {
                    return {
                        ...unit,
                        isCompleted: Boolean(prog.isCompleted),
                        progressPercent: prog.watchPct || 0,
                        watchPercentage: prog.watchPct || 0,
                    };
                }
                return unit;
            }));
        }, (error) => {
            console.warn('[PlayerSidebarProgress] Query notice:', error.message);
        });

        return () => unsubscribe();
    }, [courseUnits, selectedCourse, targetInstanceId]);

    // STRICT GRANULAR UNLOCKED UNITS COMPUTATION
    const unlockedUnitIds = useMemo(() => {
        const unlocked = new Set<string>();
        let activeLockEnforced = false;

        const sorted = [...enrichedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        for (const u of sorted) {
            if (!activeLockEnforced) {
                unlocked.add(u.id);
            }
            if (!u.isCompleted && u.isRequiredForNextUnit === true) {
                activeLockEnforced = true;
            }
        }
        return unlocked;
    }, [enrichedCourseUnits]);

    const dynamicCompletedCount = useMemo(() => {
        return enrichedCourseUnits.filter(u => u.isCompleted).length;
    }, [enrichedCourseUnits]);

    const isCourseComplete = useMemo(() => {
        const total = selectedCourse.totalUnitsCount || enrichedCourseUnits.length;
        const fullCompletedCount = enrichedCourseUnits.filter(u => u.isCompleted).length;
        return total > 0 && fullCompletedCount >= total;
    }, [enrichedCourseUnits, selectedCourse.totalUnitsCount]);

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (isCourseComplete && currentUser && !learnerCertificate) {
            setIsSearchingCert(true);

            const extCourse = selectedCourse as ExtendedCoursePackage;
            const targetKeys = extCourse.allowedProgressKeys || [targetInstanceId];

            const fetchCertificate = async () => {
                try {
                    const q = query(
                        collection(db, 'ad_hoc_certificates'),
                        where('learnerId', '==', currentUser.uid),
                        where('courseId', 'in', targetKeys)
                    );
                    const snap = await getDocs(q);

                    if (!snap.empty) {
                        setLearnerCertificate({ id: snap.docs[0].id, ...snap.docs[0].data() } as CertificateData);
                    }
                } catch (error) {
                    console.error("Failed to fetch learner certificate:", error);
                } finally {
                    setIsSearchingCert(false);
                }
            };

            const timeoutId = setTimeout(fetchCertificate, 1500);
            return () => clearTimeout(timeoutId);
        }
    }, [isCourseComplete, selectedCourse, learnerCertificate, targetInstanceId]);

    const facilitators = useMemo(() => {
        if (selectedCourse.instructors && selectedCourse.instructors.length > 0) {
            return selectedCourse.instructors;
        }
        const extCourse = selectedCourse as ExtendedCoursePackage;
        const metaInstructors = extCourse.checkpointMetadata?.instructors;
        if (metaInstructors && metaInstructors.length > 0) {
            return metaInstructors;
        }
        return [];
    }, [selectedCourse]);

    // TIMELINE-ISOLATED ATTACHMENTS FILTERING
    const allAttachments = useMemo(() => {
        const parseAtts = (raw: unknown): AttachmentItem[] => {
            if (!raw) return [];
            if (Array.isArray(raw)) return raw as AttachmentItem[];
            if (typeof raw === 'string') {
                try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    return [];
                }
            }
            return [];
        };

        const extUnit = selectedUnit as ExtendedLearnerUnitProgress;
        const extCourse = selectedCourse as ExtendedCoursePackage;

        const lessonAtts = parseAtts(
            selectedUnit.attachments ||
            extUnit.lessonAttachments ||
            extUnit.files
        );

        const courseAtts = parseAtts(
            extCourse.attachments ||
            extCourse.checkpointMetadata?.attachments ||
            extCourse.checkpointMetadata?.courseAttachments
        );

        const combined = [...lessonAtts, ...courseAtts];
        const uniqueMap = new Map<string, AttachmentItem>();

        combined.forEach((att, index) => {
            if (att && (att.url || att.name)) {
                const attContainer = att.containerId || att.timelineId || att.cohortRunId;
                if (attContainer && attContainer !== targetInstanceId && attContainer !== selectedCourse.id) {
                    return;
                }
                const key = att.id || att.url || att.name || `att_${index}`;
                uniqueMap.set(key, att);
            }
        });

        return Array.from(uniqueMap.values());
    }, [selectedUnit, selectedCourse, targetInstanceId]);

    // HYDRATE LEARNER TIMELINE PROGRESS AND NOTES FOR SELECTED LESSON
    useEffect(() => {
        const extUnit = selectedUnit as ExtendedLearnerUnitProgress;
        setCheckSubmitted(selectedUnit.isCompleted);
        setIsLessonCompleted(selectedUnit.isCompleted || false);
        setCurrentWatchPct(extUnit.progressPercent || 0);

        setResumeTime(null);
        hasSoughtRef.current = false;
        setIsPlayerReady(false);
        setIsVideoBuffering(false);
        setIsBookmarked(false);
        setShareCopied(false);

        const standaloneQuiz = selectedUnit.unitType !== 'video' && selectedUnit.unitType !== 'reading' && selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';
        setIsQuizMode(standaloneQuiz || false);

        const fetchLearnerData = async () => {
            const currentUser = auth.currentUser;
            if (!currentUser || !selectedUnit?.id) {
                setLearnerNotes('');
                return;
            }

            setIsNotesLoading(true);
            try {
                const noteRef = doc(db, 'learnerNotes', `${currentUser.uid}_${selectedUnit.id}`);
                const noteSnap = await getDoc(noteRef);
                if (noteSnap.exists()) {
                    setLearnerNotes(noteSnap.data().content || '');
                } else {
                    setLearnerNotes('');
                }

                const extCourse = selectedCourse as ExtendedCoursePackage;
                const targetKeys = extCourse.allowedProgressKeys || [targetInstanceId];

                const progressQuery = query(
                    collection(db, 'learner_content_progress'),
                    where('userId', '==', currentUser.uid),
                    where('unitId', '==', selectedUnit.id),
                    where('containerId', 'in', targetKeys)
                );
                const progressSnap = await getDocs(progressQuery);

                let data: { lastPlayedSeconds?: number; isCompleted?: boolean; watchPct?: number } | null = null;
                if (!progressSnap.empty) {
                    data = progressSnap.docs[0].data() as { lastPlayedSeconds?: number; isCompleted?: boolean; watchPct?: number };
                } else {
                    const progressRef = doc(db, 'learner_content_progress', `${currentUser.uid}_${targetInstanceId}_${selectedUnit.id}`);
                    const directSnap = await getDoc(progressRef);
                    if (directSnap.exists()) {
                        data = directSnap.data() as { lastPlayedSeconds?: number; isCompleted?: boolean; watchPct?: number };
                    }
                }

                if (data) {
                    const savedSeconds = data.lastPlayedSeconds || 0;
                    const completed = data.isCompleted || false;
                    const savedPct = data.watchPct || 0;

                    if (savedSeconds > 5 && !completed) {
                        setResumeTime(savedSeconds);
                        maxWatchedSecondsRef.current = savedSeconds;
                        setCurrentWatchPct(savedPct);
                    } else if (completed) {
                        maxWatchedSecondsRef.current = 999999;
                        setIsLessonCompleted(true);
                        setCurrentWatchPct(100);
                        setResumeTime(null);
                    } else {
                        maxWatchedSecondsRef.current = 0;
                        setCurrentWatchPct(savedPct);
                        setResumeTime(null);
                    }
                } else {
                    maxWatchedSecondsRef.current = 0;
                    setCurrentWatchPct(0);
                    setResumeTime(null);
                }

                const bookmarkRef = doc(db, 'learnerBookmarks', `${currentUser.uid}_${selectedUnit.id}`);
                const bookmarkSnap = await getDoc(bookmarkRef);
                setIsBookmarked(bookmarkSnap.exists());

            } catch (err) {
                console.error('[Firebase] Error loading data:', err);
            } finally {
                setIsNotesLoading(false);
            }
        };

        fetchLearnerData();
    }, [selectedUnit, selectedCourse, targetInstanceId]);

    // TIMELINE-ISOLATED SYNC TO FIREBASE
    const syncProgressToFirebase = async (pct: number, watchedMins: number, markCompleted: boolean, playedSeconds: number = 0) => {
        const currentUser = auth.currentUser;
        if (!currentUser || !selectedUnit?.id) return;

        const safePct = isNaN(pct) ? 0 : pct;
        const safeMins = isNaN(watchedMins) ? 0 : watchedMins;
        const safeSecs = isNaN(playedSeconds) ? 0 : Math.floor(playedSeconds);

        try {
            const docId = `${currentUser.uid}_${targetInstanceId}_${selectedUnit.id}`;
            const docRef = doc(db, 'learner_content_progress', docId);
            await setDoc(docRef, {
                userId: currentUser.uid,
                containerId: targetInstanceId,
                unitId: selectedUnit.id,
                watchPct: safePct,
                watchedMins: safeMins,
                lastPlayedSeconds: safeSecs,
                isCompleted: markCompleted,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error("[WatchTracking] Save FAILED:", error);
        }
    };

    const handlePlayerReady = () => {
        setIsPlayerReady(true);
        setIsVideoBuffering(false);
    };

    const handleVideoPlay = () => {
        if (resumeTime !== null && !hasSoughtRef.current && playerRef.current) {
            try {
                if (typeof playerRef.current.seekTo === 'function') {
                    playerRef.current.seekTo(resumeTime, 'seconds');
                }
            } catch (e) {
                console.error('Failed to seek on play', e);
            }
            hasSoughtRef.current = true;
        }
    };

    const handleReactPlayerProgress = (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
        const playedSeconds = state.playedSeconds;
        const currentDuration = playerRef.current?.getDuration() || duration || 0;

        if (currentDuration > 0 && currentDuration !== duration) {
            setDuration(currentDuration);
        }

        if (selectedUnit.isCompleted || isLessonCompleted) {
            maxWatchedSecondsRef.current = Math.max(maxWatchedSecondsRef.current, playedSeconds);
            return;
        }

        if (playedSeconds > maxWatchedSecondsRef.current + 3.0) {
            if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
                playerRef.current.seekTo(maxWatchedSecondsRef.current, 'seconds');
            }
            return;
        }

        if (playedSeconds > maxWatchedSecondsRef.current) {
            maxWatchedSecondsRef.current = playedSeconds;
        }

        const pct = currentDuration > 0 ? Math.min(100, Math.floor((maxWatchedSecondsRef.current / currentDuration) * 100)) : 0;
        const watchedMins = Number((maxWatchedSecondsRef.current / 60).toFixed(2));
        const now = Date.now();

        if (now - lastRenderTimeRef.current > 1000) {
            lastRenderTimeRef.current = now;
            setCurrentWatchPct(pct);
            setCurrentWatchedMins(watchedMins);
        }

        const reqProgress = selectedUnit.requiredWatchPercentage || 90;
        const justCompleted = pct >= reqProgress && !isLessonCompleted;

        if (now - lastSavedTimeRef.current > 10000 || justCompleted) {
            lastSavedTimeRef.current = now;

            if (justCompleted) {
                setIsLessonCompleted(true);
            }

            const hasQuiz = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';
            const markCompletedInDb = (isLessonCompleted || justCompleted) && (!hasQuiz || checkSubmitted);

            syncProgressToFirebase(pct, watchedMins, markCompletedInDb, maxWatchedSecondsRef.current);
        }
    };

    const handleVideoPause = () => {
        const hasQuiz = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';
        const markCompletedInDb = isLessonCompleted && (!hasQuiz || checkSubmitted);
        syncProgressToFirebase(currentWatchPct, currentWatchedMins, markCompletedInDb, maxWatchedSecondsRef.current);
    };

    const handleVideoEnded = () => {
        if (!isLessonCompleted && !selectedUnit.isCompleted) {
            if (duration > 0 && maxWatchedSecondsRef.current < duration * 0.9) {
                if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
                    playerRef.current.seekTo(maxWatchedSecondsRef.current, 'seconds');
                }
                return;
            }
        }

        setIsLessonCompleted(true);
        setCurrentWatchPct(100);
        maxWatchedSecondsRef.current = duration;

        const hasQuiz = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';

        if (!hasQuiz) {
            handleCompleteVerificationCheck();

            if (autoNext && nextUnitPreview && unlockedUnitIds.has(nextUnitPreview.id)) {
                setTimeout(() => {
                    onSelectUnit(nextUnitPreview);
                }, 2000);
            }
        } else {
            syncProgressToFirebase(100, currentWatchedMins, checkSubmitted, duration);
        }
    };

    const handleRestartVideo = () => {
        if (playerRef.current) {
            if (typeof playerRef.current.seekTo === 'function') {
                playerRef.current.seekTo(0, 'seconds');
            }
            setResumeTime(null);
            hasSoughtRef.current = true;
        }
    };

    const toggleAutoNext = () => {
        const newVal = !autoNext;
        setAutoNext(newVal);
        localStorage.setItem('mlab_autonext', String(newVal));
    };

    useEffect(() => {
        const handleBeforeUnload = () => {
            const hasQuiz = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';
            const markCompletedInDb = isLessonCompleted && (!hasQuiz || checkSubmitted);
            syncProgressToFirebase(currentWatchPct, currentWatchedMins, markCompletedInDb, maxWatchedSecondsRef.current);
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [currentWatchPct, currentWatchedMins, isLessonCompleted, checkSubmitted, selectedUnit]);

    const handleToggleBookmark = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser || !selectedUnit?.id) return;

        setIsBookmarking(true);
        const docId = `${currentUser.uid}_${selectedUnit.id}`;
        const bookmarkRef = doc(db, 'learnerBookmarks', docId);

        try {
            if (isBookmarked) {
                await deleteDoc(bookmarkRef);
                setIsBookmarked(false);
            } else {
                await setDoc(bookmarkRef, {
                    userId: currentUser.uid,
                    courseId: selectedCourse.id,
                    containerId: targetInstanceId,
                    unitId: selectedUnit.id,
                    unitTitle: selectedUnit.title,
                    createdAt: serverTimestamp()
                });
                setIsBookmarked(true);
            }
        } catch (error) {
            console.error('[FirebaseBookmarks] Error toggling bookmark:', error);
        } finally {
            setIsBookmarking(false);
        }
    };

    const handleShare = async () => {
        const shareData = {
            title: selectedUnit.title,
            text: `Check out "${selectedUnit.title}" on ${selectedCourse.title}!`,
            url: window.location.href,
        };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                return;
            } catch (err: unknown) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    console.error('[Share] Error invoking native share:', err);
                } else if (!(err instanceof Error)) {
                    console.error('[Share] Error invoking native share:', err);
                }
                return;
            }
        }

        try {
            await navigator.clipboard.writeText(window.location.href);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch (err) {
            console.error('[Share] Clipboard write failed:', err);
        }
    };

    // DIRECT FIREBASE REALTIME LISTENER FOR COMMENTS (STRICT TIMELINE SCOPING)
    useEffect(() => {
        if (!selectedUnit?.id || !targetInstanceId) return;

        const q = query(
            collection(db, 'lessonComments'),
            where('unitId', '==', selectedUnit.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rawComments = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LearnerCommentDoc));

            const filtered = rawComments.filter((c) => {
                const docContainer = c.containerId || c.timelineId || c.cohortRunId;
                return docContainer === targetInstanceId;
            });

            filtered.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeA - timeB;
            });

            setComments(filtered);
        }, (error) => {
            console.error('[DEBUG Comments] Firestore error in comments snapshot:', error);
        });

        return () => unsubscribe();
    }, [selectedUnit?.id, targetInstanceId]);

    // DIRECT FIREBASE REALTIME LISTENER FOR QUESTIONS (STRICT TIMELINE SCOPING)
    useEffect(() => {
        if (!selectedUnit?.id || !targetInstanceId) return;

        const q = query(
            collection(db, 'lessonQuestions'),
            where('unitId', '==', selectedUnit.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rawQuestions = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LearnerQuestionDoc));

            const filtered = rawQuestions.filter((qData) => {
                const docContainer = qData.containerId || qData.timelineId || qData.cohortRunId;
                return docContainer === targetInstanceId;
            });

            filtered.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeB - timeA;
            });

            setQuestions(filtered);
        }, (error) => {
            console.error('[DEBUG Questions] Firestore error in questions snapshot:', error);
        });

        return () => unsubscribe();
    }, [selectedUnit?.id, targetInstanceId]);

    // DIRECT FIREBASE REALTIME LISTENER FOR ANSWERS
    useEffect(() => {
        if (!selectedQuestion?.id) {
            setQuestionAnswers([]);
            return;
        }

        const q = query(
            collection(db, 'lessonQuestionAnswers'),
            where('questionId', '==', selectedQuestion.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedAnswers = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LearnerAnswerDoc));

            fetchedAnswers.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeA - timeB;
            });

            setQuestionAnswers(fetchedAnswers);
        }, (error) => {
            console.error('[DEBUG Answers] Firestore error in answers snapshot:', error);
        });

        return () => unsubscribe();
    }, [selectedQuestion?.id]);

    const handleSaveNotes = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser || !selectedUnit?.id) return;

        setIsSavingNotes(true);
        try {
            const docRef = doc(db, 'learnerNotes', `${currentUser.uid}_${selectedUnit.id}`);
            await setDoc(docRef, {
                userId: currentUser.uid,
                courseId: selectedCourse.id,
                containerId: targetInstanceId,
                unitId: selectedUnit.id,
                content: learnerNotes,
                updatedAt: serverTimestamp()
            }, { merge: true });

            setNoteSavedFeedback(true);
            setTimeout(() => setNoteSavedFeedback(false), 2000);
        } catch (err) {
            console.error('[FirebaseNotes] Error saving notes:', err);
        } finally {
            setIsSavingNotes(false);
        }
    };

    // POST COMMENT BOUND TO CURRENT TIMELINE
    const handlePostComment = async () => {
        const currentUser = auth.currentUser;
        if (!newComment.trim() || !currentUser || !selectedUnit?.id || !targetInstanceId) return;

        setIsPostingComment(true);
        try {
            const userEmail = currentUser.email || 'Learner';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonComments'), {
                unitId: selectedUnit.id,
                containerId: targetInstanceId,
                courseId: selectedCourse.id,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                text: newComment.trim(),
                createdAt: serverTimestamp()
            });
            setNewComment('');
        } catch (error) {
            console.error('[FirebaseComments] Error posting comment:', error);
        } finally {
            setIsPostingComment(false);
        }
    };

    // POST QUESTION BOUND TO CURRENT TIMELINE
    const handlePostQuestion = async () => {
        const currentUser = auth.currentUser;
        if (!questionTitle.trim() || !questionBody.trim() || !currentUser || !selectedUnit?.id || !targetInstanceId) return;

        setIsSubmittingQA(true);
        try {
            const userEmail = currentUser.email || 'Learner';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonQuestions'), {
                unitId: selectedUnit.id,
                containerId: targetInstanceId,
                courseId: selectedCourse.id,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                title: questionTitle.trim(),
                contentHtml: questionBody,
                answersCount: 0,
                isResolved: false,
                createdAt: serverTimestamp()
            });

            setQuestionTitle('');
            setQuestionTitleBody('');
            setQaViewMode('list');
        } catch (error) {
            console.error('[FirebaseQA] Error posting question:', error);
        } finally {
            setIsSubmittingQA(false);
        }
    };

    // POST ANSWER BOUND TO CURRENT TIMELINE
    const handlePostAnswer = async () => {
        const currentUser = auth.currentUser;
        if (!answerBody.trim() || !currentUser || !selectedQuestion?.id || !targetInstanceId) return;

        setIsSubmittingQA(true);
        try {
            const userEmail = currentUser.email || 'Learner';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonQuestionAnswers'), {
                questionId: selectedQuestion.id,
                unitId: selectedUnit.id,
                containerId: targetInstanceId,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                contentHtml: answerBody,
                createdAt: serverTimestamp()
            });

            const qRef = doc(db, 'lessonQuestions', selectedQuestion.id);
            await updateDoc(qRef, {
                answersCount: increment(1)
            });

            setAnswerBody('');
        } catch (error) {
            console.error('[FirebaseQA] Error posting answer:', error);
        } finally {
            setIsSubmittingQA(false);
        }
    };

    const handleTriggerMockAi = () => {
        setIsAiThinking(true);
        setTimeout(() => {
            setIsAiThinking(false);
            setShowMockAiAnswer(true);
        }, 1500);
    };

    const handleCompleteVerificationCheck = () => {
        setCheckSubmitted(true);
        setShowGateCelebration(true);
        setIsLessonCompleted(true);
        selectedUnit.isCompleted = true;

        syncProgressToFirebase(currentWatchPct || 100, currentWatchedMins, true, maxWatchedSecondsRef.current);
    };

    useEffect(() => {
        if (!selectedUnit?.interactiveCheck?.timeLimitSeconds || checkSubmitted) {
            setTimerRemaining(null);
            return;
        }

        const initialSecs = selectedUnit.interactiveCheck.timeLimitSeconds;
        setTimerRemaining(initialSecs);

        const interval = setInterval(() => {
            setTimerRemaining(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [selectedUnit, checkSubmitted]);

    useEffect(() => {
        if (!showGateCelebration) return;
        const t = setTimeout(() => setShowGateCelebration(false), 2200);
        return () => clearTimeout(t);
    }, [showGateCelebration]);

    const currentUnitIndex = enrichedCourseUnits.findIndex(u => u.id === selectedUnit.id);
    const nextUnitPreview = currentUnitIndex >= 0 ? enrichedCourseUnits[currentUnitIndex + 1] : null;

    const getGateAccent = (checkType?: string) => {
        switch (checkType) {
            case 'spot_the_bug': return { color: '#f59e0b', bg: '#78350f', border: '#f59e0b', icon: Bug, label: 'Code Repair Gate' };
            case 'socratic_dialogue': return { color: '#a78bfa', bg: '#2e1065', border: '#a78bfa', icon: Bot, label: 'AI Dialogue Gate' };
            default: return { color: '#38bdf8', bg: '#0f172a', border: '#073f4e', icon: Sparkles, label: 'Required Completion Gate' };
        }
    };

    const gateAccent = getGateAccent(selectedUnit.interactiveCheck?.checkType);
    const GateIcon = gateAccent.icon;
    const isTimerUrgent = timerRemaining !== null && timerRemaining <= 30;

    const LESSON_TABS: { key: typeof activeLessonTab; label: string; icon: typeof FileText }[] = [
        { key: 'notes', label: 'Notes', icon: FileText },
        { key: 'comments', label: `Comments (${comments.length})`, icon: MessageSquare },
        { key: 'qa', label: `Questions (${questions.length})`, icon: HelpCircle },
        { key: 'attachments', label: `Attachments (${allAttachments.length})`, icon: Paperclip },
        { key: 'related', label: 'Related', icon: Sparkles }
    ];

    const isVideo = selectedUnit.unitType === 'video';
    const reqProgress = selectedUnit.requiredWatchPercentage || 90;
    const isWatchRequirementMet = isLessonCompleted || (!isVideo) || (currentWatchPct >= reqProgress);

    const hasInteractiveCheck = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';

    const handleNextLesson = () => {
        if (!isWatchRequirementMet) return;

        if (hasInteractiveCheck && !checkSubmitted) {
            setIsQuizMode(true);
            return;
        }

        if (nextUnitPreview && unlockedUnitIds.has(nextUnitPreview.id)) {
            setIsQuizMode(false);
            onSelectUnit(nextUnitPreview);
        }
    };

    const openPopoutPlayer = () => {
        if (!selectedUnit.videoUrl) return;
        let targetUrl = selectedUnit.videoUrl;
        const ytId = extractYouTubeId(selectedUnit.videoUrl);

        if (ytId) {
            targetUrl = `https://www.youtube.com/watch?v=${ytId}`;
        }

        const width = 960;
        const height = 540;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;
        window.open(
            targetUrl,
            '_blank',
            `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no`
        );
    };

    const extCourse = selectedCourse as ExtendedCoursePackage;
    const checkpointScope = extCourse.checkpointScope || extCourse.checkpointMetadata?.checkpointScope || 'per_lesson';

    const nestedSyllabus = useMemo(() => {
        const isSecam = selectedCourse.framework === 'secam';
        const sortedUnits = [...enrichedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        const mainGroupMap = new Map<string, Map<string, LearnerUnitProgress[]>>();

        const secamMeta = extCourse.secamStructure || extCourse.checkpointMetadata?.secamStructure || [];
        const qctoModules = extCourse.checkpointMetadata?.qctoModuleCheckpoints || {};
        const qctoTopics = extCourse.checkpointMetadata?.qctoTopicCheckpoints || {};

        if (isSecam && Array.isArray(secamMeta) && secamMeta.length > 0) {
            secamMeta.forEach((sprint) => {
                if (sprint.title) {
                    const subMap = new Map<string, LearnerUnitProgress[]>();
                    if (Array.isArray(sprint.days)) {
                        sprint.days.forEach((day) => {
                            if (day.title) subMap.set(day.title, []);
                        });
                    }
                    mainGroupMap.set(sprint.title, subMap);
                }
            });
        }

        sortedUnits.forEach((unit) => {
            let mainKey = '';
            let subKey = '';

            if (isSecam) {
                mainKey = unit.sprintTitle || 'Sprint 1: Core Fundamentals';
                subKey = unit.dayOrLessonTitle || 'Day 1: Core Lessons';
            } else {
                const modType = unit.moduleType ? unit.moduleType.toUpperCase() : 'KNOWLEDGE';
                mainKey = unit.moduleCode ? `${unit.moduleCode} • ${modType}` : 'General Module';
                subKey = unit.topicId || 'General Topics';
            }

            if (!mainGroupMap.has(mainKey)) mainGroupMap.set(mainKey, new Map());
            const subMap = mainGroupMap.get(mainKey)!;

            if (!subMap.has(subKey)) subMap.set(subKey, []);
            subMap.get(subKey)!.push(unit);
        });

        return Array.from(mainGroupMap.entries())
            .map(([mainTitle, subMap]) => {
                const subGroups = Array.from(subMap.entries())
                    .map(([subTitle, units]) => {
                        const sorted = units.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                        const isDayComplete = sorted.length > 0 && sorted.every(u => u.isCompleted);

                        let dayCheckpoint: Record<string, unknown> | null = null;
                        if (checkpointScope === 'per_day') {
                            if (isSecam) {
                                const sprintMeta = secamMeta.find((s) => s.title === mainTitle);
                                dayCheckpoint = (sprintMeta?.days?.find((d) => d.title === subTitle)?.dayCheckpoint as Record<string, unknown>) || null;
                            } else {
                                const modCode = sorted[0]?.moduleCode;
                                if (modCode) dayCheckpoint = qctoTopics[`${modCode}_${subTitle}`] || null;
                            }
                            if ((dayCheckpoint as { checkType?: string })?.checkType === 'none') dayCheckpoint = null;
                        }

                        return {
                            title: subTitle,
                            units: sorted,
                            isDayComplete,
                            dayCheckpoint
                        };
                    })
                    .filter(sg => sg.units.length > 0);

                const allGroupUnits = subGroups.flatMap(sg => sg.units);
                const completedCount = allGroupUnits.filter(u => u.isCompleted).length;
                const isSprintComplete = allGroupUnits.length > 0 && completedCount === allGroupUnits.length;

                let sprintCheckpoint: Record<string, unknown> | null = null;
                if (checkpointScope === 'per_sprint') {
                    if (isSecam) {
                        const sprintMeta = secamMeta.find((s) => s.title === mainTitle);
                        sprintCheckpoint = (sprintMeta?.sprintCheckpoint as Record<string, unknown>) || null;
                    } else {
                        const modCode = allGroupUnits[0]?.moduleCode;
                        if (modCode) sprintCheckpoint = qctoModules[modCode] || null;
                    }
                    if ((sprintCheckpoint as { checkType?: string })?.checkType === 'none') sprintCheckpoint = null;
                }

                return {
                    title: mainTitle,
                    subGroups,
                    totalUnits: allGroupUnits.length,
                    completedUnits: completedCount,
                    isComplete: isSprintComplete,
                    sprintCheckpoint
                };
            })
            .filter(mg => mg.subGroups.length > 0);
    }, [enrichedCourseUnits, selectedCourse, extCourse, checkpointScope]);

    const generateSyntheticQuizUnit = (
        title: string,
        interactiveCheck: Record<string, unknown> | null | undefined,
        isLocked: boolean
    ): LearnerUnitProgress => ({
        id: `synthetic_${title.replace(/\s+/g, '_')}`,
        containerId: targetInstanceId,
        framework: selectedCourse.framework,
        title: title,
        unitType: 'reading',
        estimatedMinutes: Math.max(1, Math.ceil((((interactiveCheck?.timeLimitSeconds as number) || 600) / 60))),
        isRequired: true,
        orderIndex: 9999,
        isCompleted: false,
        isLocked: isLocked,
        contentHtml: `<div style="text-align:center; padding: 40px; background:#f8fafc; border: 1px solid #e2e8f0; border-radius: 0px;">
            <h3 style="color:#0f172a; margin-bottom:12px; font-family: var(--font-heading); text-transform: uppercase;">Assessment Verification Required</h3>
            <p style="color:#475569; font-size: 0.9rem;">You have reached a critical progression milestone. Please complete the interactive verification check below to finalize your progress for this group.</p>
        </div>`,
        interactiveCheck: (interactiveCheck || {}) as unknown as LearnerUnitProgress['interactiveCheck']
    });

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>

            {isCertModalOpen && learnerCertificate && (
                <CertificateModal certificate={learnerCertificate} onClose={() => setIsCertModalOpen(false)} />
            )}

            {showGateCelebration && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    zIndex: 50,
                    background: 'var(--mlab-green)',
                    color: 'var(--mlab-blue)',
                    border: '2px solid var(--mlab-blue)',
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
                }}>
                    <PartyPopper size={18} />
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Gate Passed!</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>Assessment completion verified</div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <button
                    onClick={onBackToOverview}
                    className="lfm-btn lfm-btn--ghost"
                >
                    <ArrowLeft size={15} /> Back to Course Overview
                </button>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(selectedCourse.tags || []).map(tag => (
                        <span key={tag} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-blue)', background: 'var(--mlab-light-blue)', border: '1px solid #bae6fd', padding: '4px 10px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            #{tag.replace(/\s+/g, '').toLowerCase()}
                        </span>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>

                {/* LEFT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                    {/* VIDEO STREAM PLAYER (Hide if in Quiz Mode) */}
                    {!isQuizMode && selectedUnit.unitType === 'video' && (
                        <div className="qcto-card">
                            <div className="qcto-hdr" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Tv size={14} /> Video Stream
                                    {isLessonCompleted && (
                                        <span style={{ background: '#15803d', color: 'white', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                            <CheckCircle2 size={9} /> Completed
                                        </span>
                                    )}
                                    {resumeTime && (
                                        <span style={{ background: '#334155', color: '#fcd34d', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                            <RotateCcw size={9} /> Resumed at {formatTime(resumeTime)}
                                        </span>
                                    )}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {selectedUnit.videoUrl && (
                                        <>
                                            {resumeTime && (
                                                <button
                                                    type="button"
                                                    onClick={handleRestartVideo}
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid rgba(255,255,255,0.4)',
                                                        color: 'white',
                                                        fontSize: '0.65rem',
                                                        fontWeight: 800,
                                                        padding: '2px 6px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontFamily: 'var(--font-heading)',
                                                        textTransform: 'uppercase'
                                                    }}
                                                    title="Restart video from the beginning"
                                                >
                                                    <RotateCcw size={10} /> Restart
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={openPopoutPlayer}
                                                style={{
                                                    background: 'transparent',
                                                    border: '1px solid rgba(255,255,255,0.4)',
                                                    color: 'white',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 800,
                                                    padding: '2px 6px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontFamily: 'var(--font-heading)',
                                                    textTransform: 'uppercase'
                                                }}
                                                title="Launch in independent window if video fails to load"
                                            >
                                                <ExternalLink size={10} /> Popout
                                            </button>
                                        </>
                                    )}
                                    <span>{selectedUnit.estimatedMinutes} MINS</span>
                                </span>
                            </div>

                            <div style={{ background: '#020617', width: '100%', aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
                                {selectedUnit.videoUrl ? (
                                    <>
                                        {(!isPlayerReady || isVideoBuffering) && (
                                            <div style={{
                                                position: 'absolute',
                                                inset: 0,
                                                zIndex: 10,
                                                background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '14px',
                                                color: 'white'
                                            }}>
                                                <div style={{
                                                    position: 'relative',
                                                    width: '68px',
                                                    height: '68px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <div className="lfm-spin" style={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        borderRadius: '50%',
                                                        border: '3px solid rgba(56, 189, 248, 0.15)',
                                                        borderTopColor: '#38bdf8'
                                                    }} />
                                                    <Tv size={26} color="#38bdf8" />
                                                </div>

                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{
                                                        fontSize: '0.78rem',
                                                        fontWeight: 800,
                                                        fontFamily: 'var(--font-heading)',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.08em',
                                                        color: '#38bdf8',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        justifyContent: 'center'
                                                    }}>
                                                        <Loader2 size={13} className="lfm-spin" /> {isVideoBuffering ? 'Buffering Stream...' : 'Initializing Video Stream...'}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                                                        Preparing media playback for {selectedUnit.title}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <ReactPlayer
                                            ref={playerRef}
                                            src={selectedUnit.videoUrl}
                                            controls={true}
                                            width="100%"
                                            height="100%"
                                            style={{ position: 'absolute', top: 0, left: 0 }}
                                            config={{
                                                youtube: {
                                                    playerVars: {
                                                        disablekb: 1,
                                                        modestbranding: 1,
                                                        rel: 0
                                                    }
                                                }
                                            }}
                                            onReady={handlePlayerReady}
                                            onStart={handleVideoPlay}
                                            onPlay={handleVideoPlay}
                                            onBuffer={() => setIsVideoBuffering(true)}
                                            onBufferEnd={() => setIsVideoBuffering(false)}
                                            onProgress={handleReactPlayerProgress}
                                            onDuration={(d: number) => setDuration(d)}
                                            onPause={handleVideoPause}
                                            onEnded={handleVideoEnded}
                                        />
                                    </>
                                ) : (
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#94a3b8', padding: '0 20px' }}>
                                        <Tv size={48} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                        <p style={{ fontSize: '0.85rem', margin: 0 }}>Video Stream Unavailable</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* READING GUIDE CONTENT (Hide if in Quiz Mode) */}
                    {!isQuizMode && selectedUnit.unitType === 'reading' && (
                        <div className="qcto-card">
                            <div className="qcto-hdr" style={{ fontSize: '0.75rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} /> Reading Guide</span>
                                <span>{selectedUnit.estimatedMinutes} MINS READ</span>
                            </div>
                            <div style={{ padding: '24px', color: '#0f172a' }}>
                                <div className="ql-editor" style={{ padding: 0, minHeight: 'auto', fontSize: '0.9rem', lineHeight: 1.6, color: '#0f172a' }}>
                                    <div dangerouslySetInnerHTML={{ __html: selectedUnit.contentHtml || '<p>Reading content loading...</p>' }} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FOCUSED QUIZ HEADER IF IN QUIZ Mode */}
                    {isQuizMode && hasInteractiveCheck && (
                        <div className="qcto-card" style={{ padding: '24px 28px', borderLeft: `6px solid ${gateAccent.color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                                <div>
                                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: gateAccent.color, fontWeight: 800, letterSpacing: '0.05em', fontFamily: 'var(--font-heading)' }}>
                                        Assessment Module
                                    </span>
                                    <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        {selectedUnit.title}
                                    </h2>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                        Please complete the verification check below to proceed.
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {isVideo && (
                                        <button
                                            onClick={() => setIsQuizMode(false)}
                                            className="lfm-btn lfm-btn--ghost"
                                            style={{ color: 'var(--mlab-blue)' }}
                                        >
                                            <ArrowLeft size={14} /> Back to Video
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STANDARD LESSON METADATA BAR (Hide if in Quiz Mode) */}
                    {!isQuizMode && (
                        <div className="qcto-card" style={{ padding: '18px 20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {selectedUnit.title}
                                        {isLessonCompleted && (
                                            <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <CheckCircle2 size={9} /> Done
                                            </span>
                                        )}
                                    </h2>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                        {selectedUnit.estimatedMinutes} min lesson • {selectedUnit.sprintTitle || selectedCourse.title}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--mlab-border)' }}>
                                <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>

                                    <button
                                        onClick={handleShare}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            color: shareCopied ? '#15803d' : 'var(--mlab-blue)',
                                            padding: 0,
                                            fontFamily: 'var(--font-heading)',
                                            textTransform: 'uppercase',
                                            transition: 'color 0.2s ease'
                                        }}
                                    >
                                        {shareCopied ? <Check size={14} /> : <Share2 size={14} />}
                                        {shareCopied ? 'Link Copied!' : 'Share'}
                                    </button>

                                    <button
                                        onClick={handleToggleBookmark}
                                        disabled={isBookmarking}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: isBookmarking ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            color: isBookmarked ? '#0284c7' : 'var(--mlab-blue)',
                                            padding: 0,
                                            fontFamily: 'var(--font-heading)',
                                            textTransform: 'uppercase',
                                            opacity: isBookmarking ? 0.5 : 1
                                        }}
                                    >
                                        {isBookmarking ? <Loader2 size={14} className="lfm-spin" /> : <Bookmark size={14} fill={isBookmarked ? 'currentColor' : 'none'} />}
                                        {isBookmarked ? 'Bookmarked' : 'Bookmark'}
                                    </button>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-blue)', padding: 0, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        <input
                                            type="checkbox"
                                            checked={autoNext}
                                            onChange={toggleAutoNext}
                                            style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
                                        />
                                        Autoplay Next
                                    </label>
                                </div>

                                {/* DYNAMIC SMART ACTION BUTTON */}
                                {!isWatchRequirementMet ? (
                                    <button
                                        disabled
                                        className="lfm-btn lfm-btn--primary"
                                        style={{ opacity: 0.4, cursor: 'not-allowed', borderRadius: '0px' }}
                                    >
                                        {isVideo ? `Watch ${reqProgress}% to Unlock` : 'Read Content to Unlock'} <ChevronRight size={14} />
                                    </button>
                                ) : hasInteractiveCheck && !checkSubmitted ? (
                                    <button
                                        onClick={() => setIsQuizMode(true)}
                                        className="lfm-btn lfm-btn--green"
                                        style={{ borderRadius: '0px' }}
                                    >
                                        <Zap size={14} fill="var(--mlab-blue)" /> Take Assessment <ChevronRight size={14} />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleNextLesson}
                                        disabled={!nextUnitPreview || !unlockedUnitIds.has(nextUnitPreview.id)}
                                        className="lfm-btn lfm-btn--primary"
                                        style={{
                                            opacity: (!nextUnitPreview || !unlockedUnitIds.has(nextUnitPreview.id)) ? 0.4 : 1,
                                            cursor: (!nextUnitPreview || !unlockedUnitIds.has(nextUnitPreview.id)) ? 'not-allowed' : 'pointer',
                                            borderRadius: '0px'
                                        }}
                                    >
                                        Next Lesson <ChevronRight size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* DYNAMIC FACILITATOR CARD DISPLAY */}
                    {!isQuizMode && facilitators.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {facilitators.map((inst, idx) => {
                                const displayName = inst.name || 'mLab Facilitator';
                                const displayRole = inst.role || 'Course Instructor';
                                const initials = inst.initials || displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'FC';
                                const instId = (inst as any).id || `inst_${idx}`;

                                return (
                                    <div key={instId} className="qcto-card" style={{ padding: '14px 18px', flexDirection: 'row', alignItems: 'center', gap: '14px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '0px', flexShrink: 0, background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}>
                                            {initials}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                {idx === 0 ? 'Lead Facilitator' : 'Co-Facilitator'}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                {displayName}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{displayRole}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* INTERACTIVE ASSESSMENT CONTAINER */}
                    {isQuizMode && hasInteractiveCheck && (
                        <div style={{ background: '#0f172a', border: `2px solid ${checkSubmitted ? '#15803d' : gateAccent.border}`, padding: '20px', borderRadius: '0px', transition: 'border-color 0.3s ease' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #1e293b', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ fontWeight: 900, fontSize: '0.85rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                    <GateIcon size={16} color={gateAccent.color} /> {gateAccent.label}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {!checkSubmitted && (
                                        <span style={{
                                            fontSize: '0.72rem',
                                            background: isTimerUrgent ? '#7f1d1d' : '#78350f',
                                            border: `1px solid ${isTimerUrgent ? '#f87171' : '#f59e0b'}`,
                                            color: isTimerUrgent ? '#fca5a5' : '#fcd34d',
                                            padding: '2px 8px',
                                            fontWeight: 800,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontFamily: 'var(--font-heading)'
                                        }}>
                                            <Timer size={12} /> {timerRemaining !== null ? `${Math.floor(timerRemaining / 60)}:${String(timerRemaining % 60).padStart(2, '0')}` : 'Gate Active'}
                                        </span>
                                    )}

                                    {checkSubmitted && (
                                        <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', fontWeight: 900, padding: '3px 10px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
                                            <Check size={13} /> GATE PASSED
                                        </span>
                                    )}
                                </div>
                            </div>

                            {selectedUnit.interactiveCheck?.checkType === 'spot_the_bug' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1' }}>
                                            {selectedUnit.interactiveCheck?.instructions}
                                        </p>
                                        <button
                                            onClick={() => window.open(`/sandbox.html?blockId=${(selectedUnit.interactiveCheck as any)?.blockId || ''}`, '_blank', 'width=1024,height=768')}
                                            className="lfm-btn lfm-btn--green"
                                            style={{ borderRadius: '0px', padding: '4px 12px', fontSize: '0.75rem' }}
                                        >
                                            <ExternalLink size={12} style={{ marginRight: '4px' }} /> Launch IDE
                                        </button>
                                    </div>

                                    <div style={{ padding: '20px', border: '1px dashed #334155', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                                        Click "Launch IDE" to open the code editor in a standalone window. Once you fix the bug and submit your code in the IDE window, this lesson will automatically be marked as complete.
                                    </div>

                                    {!checkSubmitted && (
                                        <button
                                            onClick={handleCompleteVerificationCheck}
                                            className="lfm-btn lfm-btn--primary"
                                            style={{ alignSelf: 'flex-start', borderRadius: '0px', marginTop: '8px' }}
                                        >
                                            <Check size={13} /> Mark Assessment Submitted
                                        </button>
                                    )}
                                </div>
                            )}

                            {selectedUnit.interactiveCheck?.checkType === 'socratic_dialogue' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px', fontSize: '0.82rem', color: '#fbbf24' }}>
                                        🤖 <strong>AI Persona Prompt:</strong> "{selectedUnit.interactiveCheck?.instructions}"
                                    </div>

                                    <textarea
                                        rows={3}
                                        placeholder="Type your explanation to the AI assessor..."
                                        value={socraticInput}
                                        onChange={e => setSocraticInput(e.target.value)}
                                        style={{ width: '100%', fontSize: '0.82rem', padding: '10px', border: '1px solid #334155', background: '#020617', color: 'white', borderRadius: '0px', outline: 'none' }}
                                        disabled={checkSubmitted}
                                    />

                                    {!checkSubmitted && (
                                        <button
                                            onClick={handleCompleteVerificationCheck}
                                            className="lfm-btn lfm-btn--primary"
                                            style={{ alignSelf: 'flex-start', borderRadius: '0px' }}
                                        >
                                            <Send size={13} /> Send Answer to AI Assessor
                                        </button>
                                    )}
                                </div>
                            )}

                            {checkSubmitted && nextUnitPreview && unlockedUnitIds.has(nextUnitPreview.id) && (
                                <div style={{ marginTop: '16px', borderTop: '1px solid #1e293b', paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={handleNextLesson}
                                        className="lfm-btn lfm-btn--green"
                                        style={{ borderRadius: '0px' }}
                                    >
                                        Proceed to Next Lesson <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TABS WORKSPACE */}
                    <div className="qcto-card">
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-light-blue)' }}>
                            {LESSON_TABS.map(tab => {
                                const TabIcon = tab.icon;
                                const isActive = activeLessonTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveLessonTab(tab.key)}
                                        style={{
                                            padding: '10px 14px',
                                            background: isActive ? 'var(--mlab-blue)' : 'transparent',
                                            border: 'none',
                                            color: isActive ? 'white' : 'var(--mlab-blue)',
                                            fontWeight: 800,
                                            fontSize: '0.75rem',
                                            fontFamily: 'var(--font-heading)',
                                            textTransform: 'uppercase',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            borderRadius: '0px',
                                            outline: 'none'
                                        }}
                                    >
                                        <TabIcon size={13} /> {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ padding: '16px', minHeight: '480px', display: 'flex', flexDirection: 'column' }}>
                            {activeLessonTab === 'notes' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Your Personal Workspace</span>
                                        <button
                                            type="button"
                                            onClick={handleSaveNotes}
                                            disabled={isSavingNotes || isNotesLoading}
                                            style={{
                                                color: noteSavedFeedback ? '#15803d' : 'var(--mlab-blue)',
                                                cursor: isSavingNotes ? 'not-allowed' : 'pointer',
                                                background: 'transparent',
                                                border: 'none',
                                                fontWeight: 800,
                                                padding: 0,
                                                fontFamily: 'var(--font-heading)',
                                                textTransform: 'uppercase',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            {isSavingNotes ? (
                                                <>
                                                    <Loader2 size={12} className="lfm-spin" /> Saving...
                                                </>
                                            ) : noteSavedFeedback ? (
                                                '✓ Saved!'
                                            ) : (
                                                'Save Note'
                                            )}
                                        </button>
                                    </div>

                                    {isNotesLoading ? (
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '8px' }}>
                                            <Loader2 size={16} className="lfm-spin" /> Fetching your personal notes...
                                        </div>
                                    ) : (
                                        <textarea
                                            value={learnerNotes}
                                            onChange={(e) => setLearnerNotes(e.target.value)}
                                            placeholder="Type your personal notes here while watching the video... (These are private to you)"
                                            style={{
                                                width: '100%',
                                                flex: 1,
                                                padding: '12px',
                                                borderRadius: '0px',
                                                outline: 'none',
                                                resize: 'none',
                                                fontSize: '0.8rem',
                                                background: '#f8fafc',
                                                border: '1px solid #cbd5e1',
                                                color: '#0f172a'
                                            }}
                                        />
                                    )}
                                </div>
                            )}

                            {activeLessonTab === 'comments' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                                    <div style={{ flex: 1, maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                                        {comments.length === 0 ? (
                                            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', padding: '30px 0' }}>
                                                No comments yet for this timeline. Start the discussion!
                                            </div>
                                        ) : (
                                            comments.map(comment => (
                                                <div key={comment.id} style={{ display: 'flex', gap: '10px' }}>
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '0px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
                                                        {comment.userInitials}
                                                    </div>
                                                    <div style={{ flex: 1, background: '#f8fafc', padding: '10px', border: '1px solid var(--mlab-border)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                                {comment.userName}
                                                            </span>
                                                            <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                                                {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleDateString() : 'Just now'}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
                                                            {comment.text}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', borderTop: '1px solid var(--mlab-border)', paddingTop: '14px', marginTop: 'auto' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '0px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
                                            YOU
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Ask a question or leave a comment..."
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                                            className="pfm-input"
                                            style={{ flex: 1, padding: '8px 12px', borderRadius: '0px', outline: 'none' }}
                                            disabled={isPostingComment}
                                        />
                                        <button
                                            onClick={handlePostComment}
                                            disabled={isPostingComment || !newComment.trim()}
                                            className="lfm-btn lfm-btn--primary"
                                            style={{ borderRadius: '0px', opacity: (isPostingComment || !newComment.trim()) ? 0.5 : 1 }}
                                        >
                                            {isPostingComment ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {activeLessonTab === 'qa' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>

                                    {qaViewMode === 'list' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                    Lesson Discussion ({questions.length})
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setQaViewMode('ask')}
                                                    className="lfm-btn lfm-btn--primary"
                                                    style={{ padding: '4px 12px', fontSize: '0.72rem', borderRadius: '0px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Plus size={13} /> Ask Question
                                                </button>
                                            </div>

                                            <div style={{ flex: 1, maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
                                                {questions.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)' }}>
                                                        <HelpCircle size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                                        <p style={{ margin: 0, fontSize: '0.82rem' }}>Have a question about this lesson? Be the first to ask!</p>
                                                    </div>
                                                ) : (
                                                    questions.map(q => (
                                                        <div
                                                            key={q.id}
                                                            onClick={() => {
                                                                setSelectedQuestion(q);
                                                                setShowMockAiAnswer(false);
                                                                setQaViewMode('detail');
                                                            }}
                                                            style={{
                                                                padding: '12px 16px',
                                                                border: '1px solid var(--mlab-border)',
                                                                background: '#ffffff',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '6px',
                                                                transition: 'border-color 0.15s ease'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--mlab-blue)'}
                                                            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--mlab-border)'}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                                                                    {q.title}
                                                                </div>
                                                                <span style={{ fontSize: '0.7rem', background: (q.answersCount || 0) > 0 ? '#dcfce7' : '#f1f5f9', color: (q.answersCount || 0) > 0 ? '#15803d' : '#64748b', padding: '2px 8px', fontWeight: 800 }}>
                                                                    {q.answersCount || 0} Answers
                                                                </span>
                                                            </div>

                                                            <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span>Asked by <strong>{q.userName}</strong></span>
                                                                <span>•</span>
                                                                <span>{q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {qaViewMode === 'ask' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--mlab-border)', paddingBottom: '10px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                    Draft Your Question
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setQaViewMode('list')}
                                                    style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700 }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                    Question Title / Subject
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. How does the useEffect hook cleanup work here?"
                                                    value={questionTitle}
                                                    onChange={(e) => setQuestionTitle(e.target.value)}
                                                    className="pfm-input"
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '0px', outline: 'none' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                    Detailed Description &amp; Code Snippets
                                                </label>
                                                <div style={{ background: '#ffffff' }}>
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={questionBody}
                                                        onChange={setQuestionTitleBody}
                                                        modules={QUILL_QA_MODULES}
                                                        placeholder="Provide context, error messages, or code samples..."
                                                        style={{ height: '180px', marginBottom: '40px' }}
                                                    />
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handlePostQuestion}
                                                disabled={isSubmittingQA || !questionTitle.trim() || !questionBody.trim()}
                                                className="lfm-btn lfm-btn--green"
                                                style={{ alignSelf: 'flex-end', padding: '6px 16px', fontSize: '0.78rem', opacity: (!questionTitle.trim() || !questionBody.trim() || isSubmittingQA) ? 0.5 : 1, marginTop: 'auto' }}
                                            >
                                                {isSubmittingQA ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} Submit Question
                                            </button>
                                        </div>
                                    )}

                                    {qaViewMode === 'detail' && selectedQuestion && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedQuestion(null);
                                                        setShowMockAiAnswer(false);
                                                        setQaViewMode('list');
                                                    }}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--mlab-blue)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', padding: 0 }}
                                                >
                                                    <ArrowLeft size={13} /> Back
                                                </button>

                                                {!showMockAiAnswer && (
                                                    <button
                                                        onClick={handleTriggerMockAi}
                                                        disabled={isAiThinking}
                                                        style={{
                                                            background: 'transparent',
                                                            border: '1px solid #c4b5fd',
                                                            color: '#6d28d9',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 800,
                                                            cursor: isAiThinking ? 'not-allowed' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            fontFamily: 'var(--font-heading)',
                                                            textTransform: 'uppercase',
                                                            padding: '4px 10px',
                                                            transition: 'all 0.2s',
                                                            opacity: isAiThinking ? 0.6 : 1
                                                        }}
                                                    >
                                                        {isAiThinking ? (
                                                            <><Loader2 size={12} className="lfm-spin" /> Analyzing...</>
                                                        ) : (
                                                            <><Zap size={12} /> Ask AI Assistant</>
                                                        )}
                                                    </button>
                                                )}
                                            </div>

                                            <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '16px' }}>
                                                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', marginBottom: '8px' }}>
                                                    {selectedQuestion.title}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '12px', display: 'flex', gap: '8px' }}>
                                                    <span>Asked by <strong>{selectedQuestion.userName}</strong></span>
                                                    <span>•</span>
                                                    <span>{selectedQuestion.createdAt?.toDate ? selectedQuestion.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                                                    <QuillHTMLViewer html={selectedQuestion.contentHtml} />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <MessageCircle size={14} /> Answers ({questionAnswers.length})
                                                </span>

                                                {showMockAiAnswer && (
                                                    <div style={{ display: 'flex', gap: '10px', paddingLeft: '12px', borderLeft: '3px solid #8b5cf6', marginBottom: '8px' }}>
                                                        <div style={{ flex: 1, background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '12px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6d28d9', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                                                                    <Bot size={14} /> mLab AI Assistant
                                                                </span>
                                                                <span style={{ fontSize: '0.65rem', color: '#8b5cf6', fontWeight: 700 }}>
                                                                    ✨ Instant Reply
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.82rem', color: '#4c1d95', lineHeight: 1.6 }}>
                                                                <p style={{ margin: '0 0 8px 0' }}>Hi <strong>{selectedQuestion.userName}</strong>, based on your question, it looks like you are asking about <strong>{selectedQuestion.title}</strong>.</p>
                                                                <div style={{ background: '#ede9fe', border: '1px dashed #c4b5fd', padding: '10px', marginBottom: '8px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                                    // Interactive code execution block
                                                                </div>
                                                                <p style={{ margin: 0 }}>Does this resolve your issue? A human facilitator has also been notified of your question.</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {questionAnswers.length === 0 && !showMockAiAnswer ? (
                                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
                                                        No replies posted yet.
                                                    </div>
                                                ) : (
                                                    questionAnswers.map(ans => (
                                                        <div key={ans.id} style={{ display: 'flex', gap: '10px', paddingLeft: '12px', borderLeft: '3px solid var(--mlab-blue)' }}>
                                                            <div style={{ flex: 1, background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '12px' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                                                                        {ans.userName}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                                                        {ans.createdAt?.toDate ? ans.createdAt.toDate().toLocaleDateString() : 'Just now'}
                                                                    </span>
                                                                </div>
                                                                <div style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                                    <QuillHTMLViewer html={ans.contentHtml} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '14px', marginTop: '8px' }}>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                    Post Your Reply / Solution
                                                </label>
                                                <div style={{ background: '#ffffff', marginBottom: '40px' }}>
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={answerBody}
                                                        onChange={setAnswerBody}
                                                        modules={QUILL_QA_MODULES}
                                                        placeholder="Type your response or solution here..."
                                                        style={{ height: '120px' }}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handlePostAnswer}
                                                    disabled={isSubmittingQA || !answerBody.trim()}
                                                    className="lfm-btn lfm-btn--primary"
                                                    style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: '0.75rem', opacity: (!answerBody.trim() || isSubmittingQA) ? 0.5 : 1, borderRadius: '0px' }}
                                                >
                                                    {isSubmittingQA ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} Post Reply
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}

                            {activeLessonTab === 'attachments' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                            Lesson &amp; Course Resources ({allAttachments.length})
                                        </span>
                                    </div>

                                    {allAttachments.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)', flex: 1 }}>
                                            <Paperclip size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                            <p style={{ margin: 0, fontSize: '0.82rem' }}>No attachments available for this lesson or course timeline.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', overflowY: 'auto', maxHeight: '380px' }}>
                                            {allAttachments.map((att, idx) => {
                                                const ext = (att.fileType || att.name?.split('.').pop() || 'file').toLowerCase();
                                                const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(ext);
                                                const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'zip'].includes(ext);

                                                return (
                                                    <a
                                                        key={att.id || idx}
                                                        href={att.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', border: '1px solid var(--mlab-border)', textDecoration: 'none', color: 'inherit', transition: 'background-color 0.2s ease', gap: '12px' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: 1 }}>
                                                            <div style={{ width: '36px', height: '36px', background: isSpreadsheet ? '#d1fae5' : isCode ? '#f3e8ff' : '#e0f2fe', color: isSpreadsheet ? '#059669' : isCode ? '#7c3aed' : '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                                                {isSpreadsheet ? <FileSpreadsheet size={18} /> : isCode ? <FileCode size={18} /> : <FileText size={18} />}
                                                            </div>
                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--mlab-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {att.name}
                                                                </div>
                                                                {att.description && (
                                                                    <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '2px', marginBottom: '3px', lineHeight: 1.35, fontWeight: 500 }}>
                                                                        {att.description}
                                                                    </div>
                                                                )}
                                                                <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                                                                    {ext.toUpperCase()} • {att.fileSize ? `${(att.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Downloadable File'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--mlab-blue)', color: 'white', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
                                                            <Download size={12} /> Download
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeLessonTab === 'related' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                            Supplemental Resources
                                        </span>
                                    </div>

                                    {!(selectedUnit as ExtendedLearnerUnitProgress).relatedLinks || (selectedUnit as ExtendedLearnerUnitProgress).relatedLinks?.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)', flex: 1 }}>
                                            <Sparkles size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                            <p style={{ margin: 0, fontSize: '0.82rem' }}>No supplemental resources have been added to this lesson yet.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', overflowY: 'auto', maxHeight: '380px' }}>
                                            {((selectedUnit as ExtendedLearnerUnitProgress).relatedLinks || []).map((link, idx) => {
                                                let domain = 'External Link';
                                                try { domain = new URL(link.url).hostname.replace('www.', ''); } catch (e) { }

                                                return (
                                                    <a
                                                        key={idx}
                                                        href={link.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', border: '1px solid var(--mlab-border)', textDecoration: 'none', color: 'inherit', transition: 'background-color 0.2s ease' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                    >
                                                        <div style={{ width: '32px', height: '32px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <ExternalLink size={16} />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {link.title || 'Supplemental Resource'}
                                                            </div>
                                                            <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                                                                {link.type || 'Resource'} • {domain}
                                                            </div>
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* STICKY RIGHT SIDEBAR IN PLAYER VIEW */}
                <div className="lch-sidebar-sticky">

                    <div className="qcto-card">
                        <div className="qcto-hdr" style={{ fontSize: '0.75rem', borderBottom: '3px solid var(--mlab-green)' }}>
                            {selectedCourse.title}
                        </div>
                        <div style={{ padding: '14px' }}>
                            {((selectedCourse as ExtendedCoursePackage).startDate || (selectedCourse as ExtendedCoursePackage).endDate) && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '6px 8px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.7rem' }}>
                                    <span style={{ fontWeight: 700, color: '#475569' }}>
                                        📅 Timeline: {(selectedCourse as ExtendedCoursePackage).startDate ? moment((selectedCourse as ExtendedCoursePackage).startDate).format('DD MMM YY') : 'Start'} → {(selectedCourse as ExtendedCoursePackage).endDate ? moment((selectedCourse as ExtendedCoursePackage).endDate).format('DD MMM YY') : 'End'}
                                    </span>
                                    <span style={{ fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
                                        {((selectedCourse as ExtendedCoursePackage).pacingModel || 'individual_self_paced') === 'individual_self_paced' ? 'Self-Paced' : 'Scheduled'}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                <span>Course Progress</span>
                                <span>{dynamicCompletedCount} OF {selectedCourse.totalUnitsCount || enrichedCourseUnits.length} LESSONS</span>
                            </div>
                            <ProgressBar
                                completed={dynamicCompletedCount}
                                total={selectedCourse.totalUnitsCount || enrichedCourseUnits.length}
                            />
                        </div>
                    </div>

                    {nestedSyllabus.map((mainGroup, mainIdx) => {
                        const hasSelectedUnitMain = mainGroup.subGroups.some(sg => sg.units.some(u => u.id === selectedUnit.id) || (sg.dayCheckpoint && `synthetic_${sg.title}` === selectedUnit.id));
                        const isMainOpen = expandedMainGroups[mainGroup.title] !== undefined ? expandedMainGroups[mainGroup.title] : hasSelectedUnitMain;

                        return (
                            <div key={mainGroup.title} className="qcto-card" style={{ marginBottom: '12px' }}>
                                <button
                                    onClick={() => setExpandedMainGroups(prev => ({ ...prev, [mainGroup.title]: !isMainOpen }))}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '12px 14px',
                                        background: hasSelectedUnitMain ? 'var(--mlab-blue)' : 'var(--mlab-light-blue)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        borderBottom: isMainOpen && !hasSelectedUnitMain ? '2px solid var(--mlab-border)' : '2px solid var(--mlab-green)',
                                        borderRadius: '0px',
                                        outline: 'none'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: hasSelectedUnitMain ? '#bae6fd' : 'var(--mlab-blue)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                            MODULE {String(mainIdx + 1).padStart(2, '0')}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: hasSelectedUnitMain ? 'white' : 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                            {mainGroup.title}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.68rem', color: hasSelectedUnitMain ? '#bae6fd' : '#64748b', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                                            {mainGroup.completedUnits}/{mainGroup.totalUnits}
                                        </span>
                                        <ChevronDown size={14} color={hasSelectedUnitMain ? "white" : "var(--mlab-blue)"} style={{ transform: isMainOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                                    </div>
                                </button>

                                {isMainOpen && (
                                    <div style={{ background: '#f8fafc', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {mainGroup.subGroups.map(subGroup => {
                                            const subKey = `${mainGroup.title}__${subGroup.title}`;
                                            const hasSelectedUnitSub = subGroup.units.some(u => u.id === selectedUnit.id) || (subGroup.dayCheckpoint && `synthetic_${subGroup.title}` === selectedUnit.id);
                                            const isSubOpen = expandedSubGroups[subKey] !== undefined ? expandedSubGroups[subKey] : hasSelectedUnitSub;
                                            const subDone = subGroup.units.filter(u => u.isCompleted).length;

                                            return (
                                                <div key={subKey} style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', borderRadius: '0px' }}>

                                                    <button
                                                        onClick={() => setExpandedSubGroups(prev => ({ ...prev, [subKey]: !isSubOpen }))}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            padding: '8px 12px',
                                                            background: hasSelectedUnitSub ? '#f0f9ff' : 'transparent',
                                                            border: 'none',
                                                            borderLeft: `3px solid ${hasSelectedUnitSub ? '#0284c7' : 'var(--mlab-blue)'}`,
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            borderBottom: isSubOpen && !hasSelectedUnitSub ? '1px solid var(--mlab-border)' : 'none',
                                                            borderRadius: '0px',
                                                            outline: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Bookmark size={12} color={hasSelectedUnitSub ? '#0284c7' : 'var(--mlab-blue)'} />
                                                            <span style={{ fontWeight: 700, fontSize: '0.75rem', color: hasSelectedUnitSub ? '#0284c7' : '#334155', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                                {subGroup.title}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
                                                                {subDone}/{subGroup.units.length}
                                                            </span>
                                                            <ChevronDown size={14} color="#64748b" style={{ transform: isSubOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                                                        </div>
                                                    </button>

                                                    {isSubOpen && (
                                                        <div>
                                                            {subGroup.units.map(u => {
                                                                const isCurrent = u.id === selectedUnit.id;
                                                                const isClickable = isCurrent || unlockedUnitIds.has(u.id);

                                                                return (
                                                                    <div
                                                                        key={u.id}
                                                                        onClick={() => { if (isClickable) onSelectUnit(u); }}
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'space-between',
                                                                            gap: '8px',
                                                                            padding: '10px 12px',
                                                                            cursor: isClickable ? 'pointer' : 'not-allowed',
                                                                            background: isCurrent ? 'var(--mlab-light-blue)' : 'white',
                                                                            borderBottom: '1px solid #f1f5f9',
                                                                            borderLeft: isCurrent ? '3px solid var(--mlab-blue)' : '3px solid transparent'
                                                                        }}
                                                                    >
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, opacity: isClickable ? 1 : 0.5 }}>
                                                                            {u.isCompleted ? (
                                                                                <CheckCircle2 size={14} color="#15803d" style={{ flexShrink: 0 }} />
                                                                            ) : !isClickable ? (
                                                                                <Lock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
                                                                            ) : isCurrent ? (
                                                                                <Pause size={12} color="var(--mlab-blue)" style={{ flexShrink: 0 }} />
                                                                            ) : (
                                                                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #cbd5e1', flexShrink: 0 }} />
                                                                            )}
                                                                            <span style={{
                                                                                fontSize: '0.72rem',
                                                                                fontWeight: isCurrent ? 800 : 600,
                                                                                color: !isClickable ? '#94a3b8' : (isCurrent ? 'var(--mlab-blue)' : '#334155'),
                                                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                                            }}>
                                                                                {u.title}
                                                                                {checkpointScope === 'per_lesson' && u.interactiveCheck?.checkType && u.interactiveCheck.checkType !== 'none' && (
                                                                                    <span title="Assessment Included" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '4px', marginBottom: '-1px' }}>
                                                                                        <Sparkles size={10} color="#f59e0b" />
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                        <span style={{ fontSize: '0.65rem', color: '#94a3b8', flexShrink: 0, fontFamily: 'monospace' }}>
                                                                            {u.estimatedMinutes}m
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}

                                                            {subGroup.dayCheckpoint && (
                                                                <div
                                                                    onClick={() => {
                                                                        if (subGroup.isDayComplete && subGroup.dayCheckpoint) {
                                                                            onSelectUnit(generateSyntheticQuizUnit(`${subGroup.title} Assessment`, subGroup.dayCheckpoint, false));
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'space-between',
                                                                        gap: '8px',
                                                                        padding: '10px 12px',
                                                                        cursor: subGroup.isDayComplete ? 'pointer' : 'not-allowed',
                                                                        background: selectedUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '#fffbeb' : '#fafafa',
                                                                        borderBottom: '1px solid #f1f5f9',
                                                                        borderLeft: selectedUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '3px solid #f59e0b' : '3px solid transparent'
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, opacity: subGroup.isDayComplete ? 1 : 0.5 }}>
                                                                        {subGroup.isDayComplete ? (
                                                                            <Sparkles size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                                                                        ) : (
                                                                            <Lock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
                                                                        )}
                                                                        <span style={{
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: 800,
                                                                            color: subGroup.isDayComplete ? '#92400e' : '#94a3b8',
                                                                            fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                                                                        }}>
                                                                            Topic Assessment
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {mainGroup.sprintCheckpoint && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (mainGroup.isComplete && mainGroup.sprintCheckpoint) {
                                                        onSelectUnit(generateSyntheticQuizUnit(`${mainGroup.title} Capstone`, mainGroup.sprintCheckpoint, false));
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '8px',
                                                    padding: '12px 14px',
                                                    cursor: mainGroup.isComplete ? 'pointer' : 'not-allowed',
                                                    background: selectedUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '#f3e8ff' : '#ffffff',
                                                    border: '1px solid var(--mlab-border)',
                                                    borderLeft: selectedUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '4px solid #9333ea' : '1px solid var(--mlab-border)',
                                                    borderRadius: '0px',
                                                    outline: 'none',
                                                    opacity: mainGroup.isComplete ? 1 : 0.6
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                    {mainGroup.isComplete ? (
                                                        <Award size={16} color="#9333ea" style={{ flexShrink: 0 }} />
                                                    ) : (
                                                        <Lock size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                                                    )}
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        fontWeight: 900,
                                                        color: mainGroup.isComplete ? '#6b21a8' : '#94a3b8',
                                                        fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                                                    }}>
                                                        Module Capstone Gate
                                                    </span>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                </div>

            </div>
        </div>
    );
};


// // src/pages/LearnerPortal/LearnerContentHub/CoursePlayerView.tsx

// import React, { useState, useEffect, useMemo, useRef } from 'react';
// import moment from 'moment';
// import {
//     ArrowLeft, Share2, Bookmark, ChevronRight, Tv, FileText, Send,
//     PartyPopper, Timer, CheckCircle2, Check, Sparkles, Bug, Bot,
//     MessageSquare, Paperclip, HelpCircle, ChevronDown, Pause, Play,
//     Lock, ExternalLink, Loader2, Plus, MessageCircle, Zap,
//     Award, RotateCcw, Download, FileSpreadsheet, FileCode
// } from 'lucide-react';
// import {
//     doc, getDoc, setDoc, collection, query, where,
//     onSnapshot, addDoc, serverTimestamp, updateDoc, deleteDoc, increment, getDocs
// } from 'firebase/firestore';
// import { auth, db } from '../../../lib/firebase';
// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';
// import katex from 'katex';
// import 'katex/dist/katex.min.css';

// import ReactPlayer from 'react-player';

// import { QuillHTMLViewer } from '../../../components/common/QuillHTMLViewer/QuillHTMLViewer';

// import {
//     ProgressBar,
//     type CoursePackage,
//     type LearnerUnitProgress
// } from './types';

// interface CoursePlayerViewProps {
//     selectedCourse: CoursePackage;
//     selectedUnit: LearnerUnitProgress;
//     courseUnits: LearnerUnitProgress[];
//     groupedSyllabus: Record<string, LearnerUnitProgress[]>;
//     onBackToOverview: () => void;
//     onSelectUnit: (unit: LearnerUnitProgress) => void;
// }

// const getCourseInstanceId = (c?: CoursePackage | null) => {
//     if (!c) return '';
//     return c.cohortRunId || (c as any).timelineId || (c as any).placementId || c.id;
// };

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

// const formatTime = (secs: number) => {
//     const m = Math.floor(secs / 60);
//     const s = Math.floor(secs % 60);
//     return `${m}:${s < 10 ? '0' : ''}${s}`;
// };

// const QUILL_QA_MODULES = {
//     toolbar: [
//         ['bold', 'italic', 'underline', 'code-block'],
//         ['formula'],
//         [{ 'list': 'ordered' }, { 'list': 'bullet' }],
//         ['link'],
//         ['clean']
//     ],
// };

// export const CoursePlayerView: React.FC<CoursePlayerViewProps> = ({
//     selectedCourse,
//     selectedUnit,
//     courseUnits,
//     onBackToOverview,
//     onSelectUnit
// }) => {
//     const targetInstanceId = useMemo(() => getCourseInstanceId(selectedCourse), [selectedCourse]);

//     const [expandedMainGroups, setExpandedMainGroups] = useState<Record<string, boolean>>({});
//     const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});

//     const [activeLessonTab, setActiveLessonTab] = useState<'notes' | 'comments' | 'attachments' | 'qa' | 'related'>('notes');
//     const [checkSubmitted, setCheckSubmitted] = useState(false);
//     const [socraticInput, setSocraticInput] = useState('');
//     const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
//     const [showGateCelebration, setShowGateCelebration] = useState(false);

//     const [learnerNotes, setLearnerNotes] = useState('');
//     const [isNotesLoading, setIsNotesLoading] = useState(false);
//     const [isSavingNotes, setIsSavingNotes] = useState(false);
//     const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

//     const [comments, setComments] = useState<any[]>([]);
//     const [newComment, setNewComment] = useState('');
//     const [isPostingComment, setIsPostingComment] = useState(false);

//     const [questions, setQuestions] = useState<any[]>([]);
//     const [qaViewMode, setQaViewMode] = useState<'list' | 'ask' | 'detail'>('list');
//     const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
//     const [questionAnswers, setQuestionAnswers] = useState<any[]>([]);

//     const [showMockAiAnswer, setShowMockAiAnswer] = useState(false);
//     const [isAiThinking, setIsAiThinking] = useState(false);

//     const [questionTitle, setQuestionTitle] = useState('');
//     const [questionBody, setQuestionTitleBody] = useState('');
//     const [answerBody, setAnswerBody] = useState('');
//     const [isSubmittingQA, setIsSubmittingQA] = useState(false);

//     // WATCH TRACKING STATE & REFS
//     const [currentWatchPct, setCurrentWatchPct] = useState(0);
//     const [currentWatchedMins, setCurrentWatchedMins] = useState(0);
//     const [isLessonCompleted, setIsLessonCompleted] = useState(false);

//     // BOOKMARK STATE
//     const [isBookmarked, setIsBookmarked] = useState(false);
//     const [isBookmarking, setIsBookmarking] = useState(false);

//     // SHARE STATE
//     const [shareCopied, setShareCopied] = useState(false);

//     // 🚀 RESUME PLAYBACK & AUTO-NEXT STATE & REFS
//     const [resumeTime, setResumeTime] = useState<number | null>(null);
//     const [autoNext, setAutoNext] = useState(() => localStorage.getItem('mlab_autonext') === 'true');
//     const [isPlayerReady, setIsPlayerReady] = useState(false);
//     const [isVideoBuffering, setIsVideoBuffering] = useState(false);
//     const playerRef = useRef<any>(null);
//     const hasSoughtRef = useRef(false);

//     const lastSavedTimeRef = useRef<number>(0);
//     const lastRenderTimeRef = useRef<number>(0);

//     // ANTI-FAST-FORWARD WATCH RECORD REF & DURATION STATE
//     const maxWatchedSecondsRef = useRef<number>(0);
//     const [duration, setDuration] = useState(0);

//     // QUIZ MODE STATE
//     const [isQuizMode, setIsQuizMode] = useState(false);

//     // LOCAL STATE FOR LIVE-ENRICHED COURSE UNITS
//     const [enrichedCourseUnits, setEnrichedCourseUnits] = useState<LearnerUnitProgress[]>(courseUnits);

//     // REAL-TIME FIREBASE LISTENER FOR TIMELINE-SPECIFIC PROGRESS
//     useEffect(() => {
//         setEnrichedCourseUnits(courseUnits);

//         const currentUser = auth.currentUser;
//         if (!currentUser || !selectedCourse) return;

//         const targetKeys = (selectedCourse as any).allowedProgressKeys || [targetInstanceId];

//         const q = query(
//             collection(db, 'learner_content_progress'),
//             where('userId', '==', currentUser.uid),
//             where('containerId', 'in', targetKeys)
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const progressMap = new Map<string, any>();
//             snapshot.docs.forEach(d => {
//                 progressMap.set(d.data().unitId, d.data());
//             });

//             setEnrichedCourseUnits(prev => prev.map(unit => {
//                 const prog = progressMap.get(unit.id);
//                 if (prog) {
//                     return {
//                         ...unit,
//                         isCompleted: Boolean(prog.isCompleted),
//                         progressPercent: prog.watchPct || 0,
//                         watchPercentage: prog.watchPct || 0,
//                     };
//                 }
//                 return unit;
//             }));
//         }, (error) => {
//             console.warn('[PlayerSidebarProgress] Query notice:', error.message);
//         });

//         return () => unsubscribe();
//     }, [courseUnits, selectedCourse, targetInstanceId]);

//     // STRICT GRANULAR UNLOCKED UNITS COMPUTATION
//     const unlockedUnitIds = useMemo(() => {
//         const unlocked = new Set<string>();
//         let activeLockEnforced = false;

//         const sorted = [...enrichedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

//         for (const u of sorted) {
//             if (!activeLockEnforced) {
//                 unlocked.add(u.id);
//             }
//             if (!u.isCompleted && u.isRequiredForNextUnit === true) {
//                 activeLockEnforced = true;
//             }
//         }
//         return unlocked;
//     }, [enrichedCourseUnits]);

//     const dynamicCompletedCount = useMemo(() => {
//         return enrichedCourseUnits.filter(u => u.isCompleted).length;
//     }, [enrichedCourseUnits]);

//     const facilitators = useMemo(() => {
//         if (selectedCourse.instructors && selectedCourse.instructors.length > 0) {
//             return selectedCourse.instructors;
//         }
//         const metaInstructors = (selectedCourse as any).checkpointMetadata?.instructors;
//         if (metaInstructors && metaInstructors.length > 0) {
//             return metaInstructors;
//         }
//         return [];
//     }, [selectedCourse]);

//     // TIMELINE-ISOLATED ATTACHMENTS FILTERING
//     const allAttachments = useMemo(() => {
//         const parseAtts = (raw: any): any[] => {
//             if (!raw) return [];
//             if (Array.isArray(raw)) return raw;
//             if (typeof raw === 'string') {
//                 try {
//                     const parsed = JSON.parse(raw);
//                     return Array.isArray(parsed) ? parsed : [];
//                 } catch (e) {
//                     return [];
//                 }
//             }
//             return [];
//         };

//         const lessonAtts = parseAtts(
//             (selectedUnit as any)?.attachments ||
//             (selectedUnit as any)?.lessonAttachments ||
//             (selectedUnit as any)?.files
//         );

//         const courseAtts = parseAtts(
//             (selectedCourse as any)?.attachments ||
//             (selectedCourse as any)?.checkpointMetadata?.attachments ||
//             (selectedCourse as any)?.checkpointMetadata?.courseAttachments
//         );

//         const combined = [...lessonAtts, ...courseAtts];
//         const uniqueMap = new Map<string, any>();

//         combined.forEach((att, index) => {
//             if (att && (att.url || att.name)) {
//                 const attContainer = att.containerId || att.timelineId || att.cohortRunId;
//                 if (attContainer && attContainer !== targetInstanceId && attContainer !== selectedCourse.id) {
//                     return;
//                 }
//                 const key = att.id || att.url || att.name || `att_${index}`;
//                 uniqueMap.set(key, att);
//             }
//         });

//         return Array.from(uniqueMap.values());
//     }, [selectedUnit, selectedCourse, targetInstanceId]);

//     // HYDRATE LEARNER TIMELINE PROGRESS AND NOTES FOR SELECTED LESSON
//     useEffect(() => {
//         setCheckSubmitted(selectedUnit.isCompleted);
//         setIsLessonCompleted(selectedUnit.isCompleted || false);
//         setCurrentWatchPct((selectedUnit as any).progressPercent || 0);

//         // 🚀 RESET MEDIA STATES ON LESSON SWITCH
//         setResumeTime(null);
//         hasSoughtRef.current = false;
//         setIsPlayerReady(false);
//         setIsVideoBuffering(false);
//         setIsBookmarked(false);
//         setShareCopied(false);

//         const standaloneQuiz = selectedUnit.unitType !== 'video' && selectedUnit.unitType !== 'reading' && selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';
//         setIsQuizMode(standaloneQuiz || false);

//         const fetchLearnerData = async () => {
//             const currentUser = auth.currentUser;
//             if (!currentUser || !selectedUnit?.id) {
//                 setLearnerNotes('');
//                 return;
//             }

//             setIsNotesLoading(true);
//             try {
//                 const noteRef = doc(db, 'learnerNotes', `${currentUser.uid}_${selectedUnit.id}`);
//                 const noteSnap = await getDoc(noteRef);
//                 if (noteSnap.exists()) {
//                     setLearnerNotes(noteSnap.data().content || '');
//                 } else {
//                     setLearnerNotes('');
//                 }

//                 const targetKeys = (selectedCourse as any).allowedProgressKeys || [targetInstanceId];

//                 const progressQuery = query(
//                     collection(db, 'learner_content_progress'),
//                     where('userId', '==', currentUser.uid),
//                     where('unitId', '==', selectedUnit.id),
//                     where('containerId', 'in', targetKeys)
//                 );
//                 const progressSnap = await getDocs(progressQuery);

//                 let data: any = null;
//                 if (!progressSnap.empty) {
//                     data = progressSnap.docs[0].data();
//                 } else {
//                     const progressRef = doc(db, 'learner_content_progress', `${currentUser.uid}_${targetInstanceId}_${selectedUnit.id}`);
//                     const directSnap = await getDoc(progressRef);
//                     if (directSnap.exists()) {
//                         data = directSnap.data();
//                     }
//                 }

//                 if (data) {
//                     const savedSeconds = data.lastPlayedSeconds || 0;
//                     const completed = data.isCompleted || false;
//                     const savedPct = data.watchPct || 0;

//                     // Restore time if they were midway
//                     if (savedSeconds > 5 && !completed) {
//                         setResumeTime(savedSeconds);
//                         maxWatchedSecondsRef.current = savedSeconds;
//                         setCurrentWatchPct(savedPct);
//                     } else if (completed) {
//                         maxWatchedSecondsRef.current = 999999;
//                         setIsLessonCompleted(true);
//                         setCurrentWatchPct(100);
//                         setResumeTime(null);
//                     } else {
//                         maxWatchedSecondsRef.current = 0;
//                         setCurrentWatchPct(savedPct);
//                         setResumeTime(null);
//                     }
//                 } else {
//                     maxWatchedSecondsRef.current = 0;
//                     setCurrentWatchPct(0);
//                     setResumeTime(null);
//                 }

//                 const bookmarkRef = doc(db, 'learnerBookmarks', `${currentUser.uid}_${selectedUnit.id}`);
//                 const bookmarkSnap = await getDoc(bookmarkRef);
//                 setIsBookmarked(bookmarkSnap.exists());

//             } catch (err) {
//                 console.error('[Firebase] Error loading data:', err);
//             } finally {
//                 setIsNotesLoading(false);
//             }
//         };

//         fetchLearnerData();
//     }, [selectedUnit, selectedCourse, targetInstanceId]);

//     // TIMELINE-ISOLATED SYNC TO FIREBASE
//     const syncProgressToFirebase = async (pct: number, watchedMins: number, markCompleted: boolean, playedSeconds: number = 0) => {
//         const currentUser = auth.currentUser;
//         if (!currentUser || !selectedUnit?.id) return;

//         const safePct = isNaN(pct) ? 0 : pct;
//         const safeMins = isNaN(watchedMins) ? 0 : watchedMins;
//         const safeSecs = isNaN(playedSeconds) ? 0 : Math.floor(playedSeconds);

//         try {
//             const docId = `${currentUser.uid}_${targetInstanceId}_${selectedUnit.id}`;
//             const docRef = doc(db, 'learner_content_progress', docId);
//             await setDoc(docRef, {
//                 userId: currentUser.uid,
//                 containerId: targetInstanceId,
//                 unitId: selectedUnit.id,
//                 watchPct: safePct,
//                 watchedMins: safeMins,
//                 lastPlayedSeconds: safeSecs,
//                 isCompleted: markCompleted,
//                 updatedAt: serverTimestamp()
//             }, { merge: true });
//         } catch (error) {
//             console.error("[WatchTracking] Save FAILED:", error);
//         }
//     };

//     const handlePlayerReady = () => {
//         setIsPlayerReady(true);
//         setIsVideoBuffering(false);
//     };

//     // 🚀 NEW: Seek securely when playback actively starts (Fixes the unstarted iframe issue)
//     const handleVideoPlay = () => {
//         if (resumeTime !== null && !hasSoughtRef.current && playerRef.current) {
//             try {
//                 if (typeof playerRef.current.seekTo === 'function') {
//                     playerRef.current.seekTo(resumeTime, 'seconds');
//                 }
//             } catch (e) {
//                 console.error('Failed to seek on play', e);
//             }
//             hasSoughtRef.current = true;
//         }
//     };

//     // 🚀 NEW: ReactPlayer uses onProgress instead of HTML5 onTimeUpdate for embedded iframes like YouTube
//     const handleReactPlayerProgress = (state: { played: number, playedSeconds: number, loaded: number, loadedSeconds: number }) => {
//         const playedSeconds = state.playedSeconds;
//         const currentDuration = playerRef.current?.getDuration() || duration || 0;

//         if (currentDuration > 0 && currentDuration !== duration) {
//             setDuration(currentDuration);
//         }

//         if (selectedUnit.isCompleted || isLessonCompleted) {
//             maxWatchedSecondsRef.current = Math.max(maxWatchedSecondsRef.current, playedSeconds);
//             return;
//         }

//         // Anti-fast-forward trap (3.0s tolerance allows for keyframe seek imprecisions)
//         if (playedSeconds > maxWatchedSecondsRef.current + 3.0) {
//             if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
//                 playerRef.current.seekTo(maxWatchedSecondsRef.current, 'seconds');
//             }
//             return;
//         }

//         if (playedSeconds > maxWatchedSecondsRef.current) {
//             maxWatchedSecondsRef.current = playedSeconds;
//         }

//         const pct = currentDuration > 0 ? Math.min(100, Math.floor((maxWatchedSecondsRef.current / currentDuration) * 100)) : 0;
//         const watchedMins = Number((maxWatchedSecondsRef.current / 60).toFixed(2));
//         const now = Date.now();

//         if (now - lastRenderTimeRef.current > 1000) {
//             lastRenderTimeRef.current = now;
//             setCurrentWatchPct(pct);
//             setCurrentWatchedMins(watchedMins);
//         }

//         const reqProgress = selectedUnit.requiredWatchPercentage || 90;
//         const justCompleted = pct >= reqProgress && !isLessonCompleted;

//         if (now - lastSavedTimeRef.current > 10000 || justCompleted) {
//             lastSavedTimeRef.current = now;

//             if (justCompleted) {
//                 setIsLessonCompleted(true);
//             }

//             const hasQuiz = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';
//             const markCompletedInDb = (isLessonCompleted || justCompleted) && (!hasQuiz || checkSubmitted);

//             syncProgressToFirebase(pct, watchedMins, markCompletedInDb, maxWatchedSecondsRef.current);
//         }
//     };

//     const handleVideoPause = () => {
//         const hasQuiz = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';
//         const markCompletedInDb = isLessonCompleted && (!hasQuiz || checkSubmitted);
//         syncProgressToFirebase(currentWatchPct, currentWatchedMins, markCompletedInDb, maxWatchedSecondsRef.current);
//     };

//     const handleVideoEnded = () => {
//         if (!isLessonCompleted && !selectedUnit.isCompleted) {
//             if (duration > 0 && maxWatchedSecondsRef.current < duration * 0.9) {
//                 if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
//                     playerRef.current.seekTo(maxWatchedSecondsRef.current, 'seconds');
//                 }
//                 return;
//             }
//         }

//         setIsLessonCompleted(true);
//         setCurrentWatchPct(100);
//         maxWatchedSecondsRef.current = duration;

//         const hasQuiz = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';

//         if (!hasQuiz) {
//             handleCompleteVerificationCheck();

//             if (autoNext && nextUnitPreview && unlockedUnitIds.has(nextUnitPreview.id)) {
//                 setTimeout(() => {
//                     onSelectUnit(nextUnitPreview);
//                 }, 2000);
//             }
//         } else {
//             syncProgressToFirebase(100, currentWatchedMins, checkSubmitted, duration);
//         }
//     };

//     const handleRestartVideo = () => {
//         if (playerRef.current) {
//             if (typeof playerRef.current.seekTo === 'function') {
//                 playerRef.current.seekTo(0, 'seconds');
//             } else {
//                 playerRef.current.currentTime = 0;
//             }
//             setResumeTime(null);
//             hasSoughtRef.current = true;
//         }
//     };

//     const toggleAutoNext = () => {
//         const newVal = !autoNext;
//         setAutoNext(newVal);
//         localStorage.setItem('mlab_autonext', String(newVal));
//     };

//     useEffect(() => {
//         const handleBeforeUnload = () => {
//             const hasQuiz = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';
//             const markCompletedInDb = isLessonCompleted && (!hasQuiz || checkSubmitted);
//             syncProgressToFirebase(currentWatchPct, currentWatchedMins, markCompletedInDb, maxWatchedSecondsRef.current);
//         };

//         window.addEventListener('beforeunload', handleBeforeUnload);
//         return () => window.removeEventListener('beforeunload', handleBeforeUnload);
//     }, [currentWatchPct, currentWatchedMins, isLessonCompleted, checkSubmitted, selectedUnit]);

//     const handleToggleBookmark = async () => {
//         const currentUser = auth.currentUser;
//         if (!currentUser || !selectedUnit?.id) return;

//         setIsBookmarking(true);
//         const docId = `${currentUser.uid}_${selectedUnit.id}`;
//         const bookmarkRef = doc(db, 'learnerBookmarks', docId);

//         try {
//             if (isBookmarked) {
//                 await deleteDoc(bookmarkRef);
//                 setIsBookmarked(false);
//             } else {
//                 await setDoc(bookmarkRef, {
//                     userId: currentUser.uid,
//                     courseId: selectedCourse.id,
//                     containerId: targetInstanceId,
//                     unitId: selectedUnit.id,
//                     unitTitle: selectedUnit.title,
//                     createdAt: serverTimestamp()
//                 });
//                 setIsBookmarked(true);
//             }
//         } catch (error) {
//             console.error('[FirebaseBookmarks] Error toggling bookmark:', error);
//         } finally {
//             setIsBookmarking(false);
//         }
//     };

//     const handleShare = async () => {
//         const shareData = {
//             title: selectedUnit.title,
//             text: `Check out "${selectedUnit.title}" on ${selectedCourse.title}!`,
//             url: window.location.href,
//         };

//         if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
//             try {
//                 await navigator.share(shareData);
//                 return;
//             } catch (err: any) {
//                 if (err.name !== 'AbortError') {
//                     console.error('[Share] Error invoking native share:', err);
//                 } else {
//                     return;
//                 }
//             }
//         }

//         try {
//             await navigator.clipboard.writeText(window.location.href);
//             setShareCopied(true);
//             setTimeout(() => setShareCopied(false), 2000);
//         } catch (err) {
//             console.error('[Share] Clipboard write failed:', err);
//         }
//     };

//     // DIRECT FIREBASE REALTIME LISTENER FOR COMMENTS (STRICT TIMELINE SCOPING)
//     useEffect(() => {
//         if (!selectedUnit?.id || !targetInstanceId) return;

//         const q = query(
//             collection(db, 'lessonComments'),
//             where('unitId', '==', selectedUnit.id)
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const rawComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

//             // STRICT TIMELINE MATCH
//             const filtered = rawComments.filter((c: any) => {
//                 const docContainer = c.containerId || c.timelineId || c.cohortRunId;
//                 return docContainer === targetInstanceId;
//             });

//             filtered.sort((a: any, b: any) => {
//                 const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
//                 const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
//                 return timeA - timeB;
//             });

//             setComments(filtered);
//         }, (error) => {
//             console.error('[DEBUG Comments] Firestore error in comments snapshot:', error);
//         });

//         return () => unsubscribe();
//     }, [selectedUnit?.id, targetInstanceId]);

//     // DIRECT FIREBASE REALTIME LISTENER FOR QUESTIONS (STRICT TIMELINE SCOPING)
//     useEffect(() => {
//         if (!selectedUnit?.id || !targetInstanceId) return;

//         const q = query(
//             collection(db, 'lessonQuestions'),
//             where('unitId', '==', selectedUnit.id)
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const rawQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

//             // STRICT TIMELINE MATCH
//             const filtered = rawQuestions.filter((qData: any) => {
//                 const docContainer = qData.containerId || qData.timelineId || qData.cohortRunId;
//                 return docContainer === targetInstanceId;
//             });

//             filtered.sort((a: any, b: any) => {
//                 const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
//                 const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
//                 return timeB - timeA;
//             });

//             setQuestions(filtered);
//         }, (error) => {
//             console.error('[DEBUG Questions] Firestore error in questions snapshot:', error);
//         });

//         return () => unsubscribe();
//     }, [selectedUnit?.id, targetInstanceId]);

//     // DIRECT FIREBASE REALTIME LISTENER FOR ANSWERS
//     useEffect(() => {
//         if (!selectedQuestion?.id) {
//             setQuestionAnswers([]);
//             return;
//         }

//         const q = query(
//             collection(db, 'lessonQuestionAnswers'),
//             where('questionId', '==', selectedQuestion.id)
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const fetchedAnswers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

//             fetchedAnswers.sort((a: any, b: any) => {
//                 const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
//                 const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
//                 return timeA - timeB;
//             });

//             setQuestionAnswers(fetchedAnswers);
//         }, (error) => {
//             console.error('[DEBUG Answers] Firestore error in answers snapshot:', error);
//         });

//         return () => unsubscribe();
//     }, [selectedQuestion?.id]);

//     const handleSaveNotes = async () => {
//         const currentUser = auth.currentUser;
//         if (!currentUser || !selectedUnit?.id) return;

//         setIsSavingNotes(true);
//         try {
//             const docRef = doc(db, 'learnerNotes', `${currentUser.uid}_${selectedUnit.id}`);
//             await setDoc(docRef, {
//                 userId: currentUser.uid,
//                 courseId: selectedCourse.id,
//                 containerId: targetInstanceId,
//                 unitId: selectedUnit.id,
//                 content: learnerNotes,
//                 updatedAt: serverTimestamp()
//             }, { merge: true });

//             setNoteSavedFeedback(true);
//             setTimeout(() => setNoteSavedFeedback(false), 2000);
//         } catch (err) {
//             console.error('[FirebaseNotes] Error saving notes:', err);
//         } finally {
//             setIsSavingNotes(false);
//         }
//     };

//     // POST COMMENT BOUND TO CURRENT TIMELINE
//     const handlePostComment = async () => {
//         const currentUser = auth.currentUser;
//         if (!newComment.trim() || !currentUser || !selectedUnit?.id || !targetInstanceId) return;

//         setIsPostingComment(true);
//         try {
//             const userEmail = currentUser.email || 'Learner';
//             const userName = currentUser.displayName || userEmail.split('@')[0];
//             const initials = userName.substring(0, 2).toUpperCase();

//             await addDoc(collection(db, 'lessonComments'), {
//                 unitId: selectedUnit.id,
//                 containerId: targetInstanceId,
//                 courseId: selectedCourse.id,
//                 userId: currentUser.uid,
//                 userName: userName,
//                 userInitials: initials,
//                 text: newComment.trim(),
//                 createdAt: serverTimestamp()
//             });
//             setNewComment('');
//         } catch (error) {
//             console.error('[FirebaseComments] Error posting comment:', error);
//         } finally {
//             setIsPostingComment(false);
//         }
//     };

//     // POST QUESTION BOUND TO CURRENT TIMELINE
//     const handlePostQuestion = async () => {
//         const currentUser = auth.currentUser;
//         if (!questionTitle.trim() || !questionBody.trim() || !currentUser || !selectedUnit?.id || !targetInstanceId) return;

//         setIsSubmittingQA(true);
//         try {
//             const userEmail = currentUser.email || 'Learner';
//             const userName = currentUser.displayName || userEmail.split('@')[0];
//             const initials = userName.substring(0, 2).toUpperCase();

//             await addDoc(collection(db, 'lessonQuestions'), {
//                 unitId: selectedUnit.id,
//                 containerId: targetInstanceId,
//                 courseId: selectedCourse.id,
//                 userId: currentUser.uid,
//                 userName: userName,
//                 userInitials: initials,
//                 title: questionTitle.trim(),
//                 contentHtml: questionBody,
//                 answersCount: 0,
//                 isResolved: false,
//                 createdAt: serverTimestamp()
//             });

//             setQuestionTitle('');
//             setQuestionTitleBody('');
//             setQaViewMode('list');
//         } catch (error) {
//             console.error('[FirebaseQA] Error posting question:', error);
//         } finally {
//             setIsSubmittingQA(false);
//         }
//     };

//     // POST ANSWER BOUND TO CURRENT TIMELINE
//     const handlePostAnswer = async () => {
//         const currentUser = auth.currentUser;
//         if (!answerBody.trim() || !currentUser || !selectedQuestion?.id || !targetInstanceId) return;

//         setIsSubmittingQA(true);
//         try {
//             const userEmail = currentUser.email || 'Learner';
//             const userName = currentUser.displayName || userEmail.split('@')[0];
//             const initials = userName.substring(0, 2).toUpperCase();

//             await addDoc(collection(db, 'lessonQuestionAnswers'), {
//                 questionId: selectedQuestion.id,
//                 unitId: selectedUnit.id,
//                 containerId: targetInstanceId,
//                 userId: currentUser.uid,
//                 userName: userName,
//                 userInitials: initials,
//                 contentHtml: answerBody,
//                 createdAt: serverTimestamp()
//             });

//             const qRef = doc(db, 'lessonQuestions', selectedQuestion.id);
//             await updateDoc(qRef, {
//                 answersCount: increment(1)
//             });

//             setAnswerBody('');
//         } catch (error) {
//             console.error('[FirebaseQA] Error posting answer:', error);
//         } finally {
//             setIsSubmittingQA(false);
//         }
//     };

//     const handleTriggerMockAi = () => {
//         setIsAiThinking(true);
//         setTimeout(() => {
//             setIsAiThinking(false);
//             setShowMockAiAnswer(true);
//         }, 1500);
//     };

//     const handleCompleteVerificationCheck = () => {
//         setCheckSubmitted(true);
//         setShowGateCelebration(true);
//         setIsLessonCompleted(true);
//         selectedUnit.isCompleted = true;

//         syncProgressToFirebase(currentWatchPct || 100, currentWatchedMins, true, maxWatchedSecondsRef.current);
//     };

//     useEffect(() => {
//         if (!selectedUnit?.interactiveCheck?.timeLimitSeconds || checkSubmitted) {
//             setTimerRemaining(null);
//             return;
//         }

//         const initialSecs = selectedUnit.interactiveCheck.timeLimitSeconds;
//         setTimerRemaining(initialSecs);

//         const interval = setInterval(() => {
//             setTimerRemaining(prev => {
//                 if (prev === null || prev <= 1) {
//                     clearInterval(interval);
//                     return 0;
//                 }
//                 return prev - 1;
//             });
//         }, 1000);

//         return () => clearInterval(interval);
//     }, [selectedUnit, checkSubmitted]);

//     useEffect(() => {
//         if (!showGateCelebration) return;
//         const t = setTimeout(() => setShowGateCelebration(false), 2200);
//         return () => clearTimeout(t);
//     }, [showGateCelebration]);

//     const currentUnitIndex = enrichedCourseUnits.findIndex(u => u.id === selectedUnit.id);
//     const nextUnitPreview = currentUnitIndex >= 0 ? enrichedCourseUnits[currentUnitIndex + 1] : null;

//     const getGateAccent = (checkType?: string) => {
//         switch (checkType) {
//             case 'spot_the_bug': return { color: '#f59e0b', bg: '#78350f', border: '#f59e0b', icon: Bug, label: 'Code Repair Gate' };
//             case 'socratic_dialogue': return { color: '#a78bfa', bg: '#2e1065', border: '#a78bfa', icon: Bot, label: 'AI Dialogue Gate' };
//             default: return { color: '#38bdf8', bg: '#0f172a', border: '#073f4e', icon: Sparkles, label: 'Required Completion Gate' };
//         }
//     };

//     const gateAccent = getGateAccent(selectedUnit.interactiveCheck?.checkType);
//     const GateIcon = gateAccent.icon;
//     const isTimerUrgent = timerRemaining !== null && timerRemaining <= 30;

//     const LESSON_TABS: { key: typeof activeLessonTab; label: string; icon: typeof FileText }[] = [
//         { key: 'notes', label: 'Notes', icon: FileText },
//         { key: 'comments', label: `Comments (${comments.length})`, icon: MessageSquare },
//         { key: 'qa', label: `Questions (${questions.length})`, icon: HelpCircle },
//         { key: 'attachments', label: `Attachments (${allAttachments.length})`, icon: Paperclip },
//         { key: 'related', label: 'Related', icon: Sparkles }
//     ];

//     const isVideo = selectedUnit.unitType === 'video';
//     const reqProgress = selectedUnit.requiredWatchPercentage || 90;
//     const isWatchRequirementMet = isLessonCompleted || (!isVideo) || (currentWatchPct >= reqProgress);

//     const hasInteractiveCheck = selectedUnit.interactiveCheck?.checkType && (selectedUnit.interactiveCheck.checkType as string) !== 'none';

//     const handleNextLesson = () => {
//         if (!isWatchRequirementMet) return;

//         if (hasInteractiveCheck && !checkSubmitted) {
//             setIsQuizMode(true);
//             return;
//         }

//         if (nextUnitPreview && unlockedUnitIds.has(nextUnitPreview.id)) {
//             setIsQuizMode(false);
//             onSelectUnit(nextUnitPreview);
//         }
//     };

//     const openPopoutPlayer = () => {
//         if (!selectedUnit.videoUrl) return;
//         let targetUrl = selectedUnit.videoUrl;
//         const ytId = extractYouTubeId(selectedUnit.videoUrl);

//         if (ytId) {
//             targetUrl = `https://www.youtube.com/watch?v=${ytId}`;
//         }

//         const width = 960;
//         const height = 540;
//         const left = (window.innerWidth - width) / 2;
//         const top = (window.innerHeight - height) / 2;
//         window.open(
//             targetUrl,
//             '_blank',
//             `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no`
//         );
//     };

//     const checkpointScope = (selectedCourse as any).checkpointScope || (selectedCourse as any).checkpointMetadata?.checkpointScope || 'per_lesson';

//     const nestedSyllabus = useMemo(() => {
//         const isSecam = selectedCourse.framework === 'secam';
//         const sortedUnits = [...enrichedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
//         const mainGroupMap = new Map<string, Map<string, LearnerUnitProgress[]>>();

//         const secamMeta = (selectedCourse as any).secamStructure || (selectedCourse as any).checkpointMetadata?.secamStructure || [];
//         const qctoModules = (selectedCourse as any).checkpointMetadata?.qctoModuleCheckpoints || {};
//         const qctoTopics = (selectedCourse as any).checkpointMetadata?.qctoTopicCheckpoints || {};

//         if (isSecam && Array.isArray(secamMeta) && secamMeta.length > 0) {
//             secamMeta.forEach((sprint: any) => {
//                 if (sprint.title) {
//                     const subMap = new Map<string, LearnerUnitProgress[]>();
//                     if (Array.isArray(sprint.days)) {
//                         sprint.days.forEach((day: any) => {
//                             if (day.title) subMap.set(day.title, []);
//                         });
//                     }
//                     mainGroupMap.set(sprint.title, subMap);
//                 }
//             });
//         }

//         sortedUnits.forEach((unit) => {
//             let mainKey = '';
//             let subKey = '';

//             if (isSecam) {
//                 mainKey = unit.sprintTitle || 'Sprint 1: Core Fundamentals';
//                 subKey = unit.dayOrLessonTitle || 'Day 1: Core Lessons';
//             } else {
//                 const modType = unit.moduleType ? unit.moduleType.toUpperCase() : 'KNOWLEDGE';
//                 mainKey = unit.moduleCode ? `${unit.moduleCode} • ${modType}` : 'General Module';
//                 subKey = unit.topicId || 'General Topics';
//             }

//             if (!mainGroupMap.has(mainKey)) mainGroupMap.set(mainKey, new Map());
//             const subMap = mainGroupMap.get(mainKey)!;

//             if (!subMap.has(subKey)) subMap.set(subKey, []);
//             subMap.get(subKey)!.push(unit);
//         });

//         return Array.from(mainGroupMap.entries())
//             .map(([mainTitle, subMap]) => {
//                 const subGroups = Array.from(subMap.entries())
//                     .map(([subTitle, units]) => {
//                         const sorted = units.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
//                         const isDayComplete = sorted.length > 0 && sorted.every(u => u.isCompleted);

//                         let dayCheckpoint = null;
//                         if (checkpointScope === 'per_day') {
//                             if (isSecam) {
//                                 const sprintMeta = secamMeta.find((s: any) => s.title === mainTitle);
//                                 dayCheckpoint = sprintMeta?.days?.find((d: any) => d.title === subTitle)?.dayCheckpoint;
//                             } else {
//                                 const modCode = sorted[0]?.moduleCode;
//                                 if (modCode) dayCheckpoint = qctoTopics[`${modCode}_${subTitle}`];
//                             }
//                             if (dayCheckpoint?.checkType === 'none') dayCheckpoint = null;
//                         }

//                         return {
//                             title: subTitle,
//                             units: sorted,
//                             isDayComplete,
//                             dayCheckpoint
//                         };
//                     })
//                     .filter(sg => sg.units.length > 0);

//                 const allGroupUnits = subGroups.flatMap(sg => sg.units);
//                 const completedCount = allGroupUnits.filter(u => u.isCompleted).length;
//                 const isSprintComplete = allGroupUnits.length > 0 && completedCount === allGroupUnits.length;

//                 let sprintCheckpoint = null;
//                 if (checkpointScope === 'per_sprint') {
//                     if (isSecam) {
//                         const sprintMeta = secamMeta.find((s: any) => s.title === mainTitle);
//                         sprintCheckpoint = sprintMeta?.sprintCheckpoint;
//                     } else {
//                         const modCode = allGroupUnits[0]?.moduleCode;
//                         if (modCode) sprintCheckpoint = qctoModules[modCode];
//                     }
//                     if (sprintCheckpoint?.checkType === 'none') sprintCheckpoint = null;
//                 }

//                 return {
//                     title: mainTitle,
//                     subGroups,
//                     totalUnits: allGroupUnits.length,
//                     completedUnits: completedCount,
//                     isComplete: isSprintComplete,
//                     sprintCheckpoint
//                 };
//             })
//             .filter(mg => mg.subGroups.length > 0);
//     }, [enrichedCourseUnits, selectedCourse, checkpointScope]);

//     const generateSyntheticQuizUnit = (title: string, interactiveCheck: any, isLocked: boolean): LearnerUnitProgress => ({
//         id: `synthetic_${title.replace(/\s+/g, '_')}`,
//         containerId: targetInstanceId,
//         framework: selectedCourse.framework,
//         title: title,
//         unitType: 'reading',
//         estimatedMinutes: Math.max(1, Math.ceil((interactiveCheck.timeLimitSeconds || 600) / 60)),
//         isRequired: true,
//         orderIndex: 9999,
//         isCompleted: false,
//         isLocked: isLocked,
//         contentHtml: `<div style="text-align:center; padding: 40px; background:#f8fafc; border: 1px solid #e2e8f0; border-radius: 0px;">
//             <h3 style="color:#0f172a; margin-bottom:12px; font-family: var(--font-heading); text-transform: uppercase;">Assessment Verification Required</h3>
//             <p style="color:#475569; font-size: 0.9rem;">You have reached a critical progression milestone. Please complete the interactive verification check below to finalize your progress for this group.</p>
//         </div>`,
//         interactiveCheck: interactiveCheck
//     });

//     return (
//         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>

//             {showGateCelebration && (
//                 <div style={{
//                     position: 'fixed',
//                     top: '20px',
//                     right: '20px',
//                     zIndex: 50,
//                     background: 'var(--mlab-green)',
//                     color: 'var(--mlab-blue)',
//                     border: '2px solid var(--mlab-blue)',
//                     padding: '12px 18px',
//                     display: 'flex',
//                     alignItems: 'center',
//                     gap: '10px',
//                     boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
//                 }}>
//                     <PartyPopper size={18} />
//                     <div>
//                         <div style={{ fontWeight: 800, fontSize: '0.82rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Gate Passed!</div>
//                         <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>Assessment completion verified</div>
//                     </div>
//                 </div>
//             )}

//             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
//                 <button
//                     onClick={onBackToOverview}
//                     className="lfm-btn lfm-btn--ghost"
//                 >
//                     <ArrowLeft size={15} /> Back to Course Overview
//                 </button>

//                 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
//                     {(selectedCourse.tags || []).map(tag => (
//                         <span key={tag} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-blue)', background: 'var(--mlab-light-blue)', border: '1px solid #bae6fd', padding: '4px 10px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                             #{tag.replace(/\s+/g, '').toLowerCase()}
//                         </span>
//                     ))}
//                 </div>
//             </div>

//             <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>

//                 {/* LEFT COLUMN */}
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

//                     {/* VIDEO STREAM PLAYER (Hide if in Quiz Mode) */}
//                     {!isQuizMode && selectedUnit.unitType === 'video' && (
//                         <div className="qcto-card">
//                             <div className="qcto-hdr" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
//                                 <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                     <Tv size={14} /> Video Stream
//                                     {isLessonCompleted && (
//                                         <span style={{ background: '#15803d', color: 'white', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
//                                             <CheckCircle2 size={9} /> Completed
//                                         </span>
//                                     )}
//                                     {resumeTime && (
//                                         <span style={{ background: '#334155', color: '#fcd34d', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
//                                             <RotateCcw size={9} /> Resumed at {formatTime(resumeTime)}
//                                         </span>
//                                     )}
//                                 </span>
//                                 <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                     {selectedUnit.videoUrl && (
//                                         <>
//                                             {resumeTime && (
//                                                 <button
//                                                     type="button"
//                                                     onClick={handleRestartVideo}
//                                                     style={{
//                                                         background: 'transparent',
//                                                         border: '1px solid rgba(255,255,255,0.4)',
//                                                         color: 'white',
//                                                         fontSize: '0.65rem',
//                                                         fontWeight: 800,
//                                                         padding: '2px 6px',
//                                                         cursor: 'pointer',
//                                                         display: 'flex',
//                                                         alignItems: 'center',
//                                                         gap: '4px',
//                                                         fontFamily: 'var(--font-heading)',
//                                                         textTransform: 'uppercase'
//                                                     }}
//                                                     title="Restart video from the beginning"
//                                                 >
//                                                     <RotateCcw size={10} /> Restart
//                                                 </button>
//                                             )}
//                                             <button
//                                                 type="button"
//                                                 onClick={openPopoutPlayer}
//                                                 style={{
//                                                     background: 'transparent',
//                                                     border: '1px solid rgba(255,255,255,0.4)',
//                                                     color: 'white',
//                                                     fontSize: '0.65rem',
//                                                     fontWeight: 800,
//                                                     padding: '2px 6px',
//                                                     cursor: 'pointer',
//                                                     display: 'flex',
//                                                     alignItems: 'center',
//                                                     gap: '4px',
//                                                     fontFamily: 'var(--font-heading)',
//                                                     textTransform: 'uppercase'
//                                                 }}
//                                                 title="Launch in independent window if video fails to load"
//                                             >
//                                                 <ExternalLink size={10} /> Popout
//                                             </button>
//                                         </>
//                                     )}
//                                     <span>{selectedUnit.estimatedMinutes} MINS</span>
//                                 </span>
//                             </div>

//                             <div style={{ background: '#020617', width: '100%', aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
//                                 {selectedUnit.videoUrl ? (
//                                     <>
//                                         {/* 🚀 BRANDED VIDEO LOADING SKELETON / BUFFERING OVERLAY */}
//                                         {(!isPlayerReady || isVideoBuffering) && (
//                                             <div style={{
//                                                 position: 'absolute',
//                                                 inset: 0,
//                                                 zIndex: 10,
//                                                 background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
//                                                 display: 'flex',
//                                                 flexDirection: 'column',
//                                                 alignItems: 'center',
//                                                 justifyContent: 'center',
//                                                 gap: '14px',
//                                                 color: 'white'
//                                             }}>
//                                                 <div style={{
//                                                     position: 'relative',
//                                                     width: '68px',
//                                                     height: '68px',
//                                                     display: 'flex',
//                                                     alignItems: 'center',
//                                                     justifyContent: 'center'
//                                                 }}>
//                                                     <div className="lfm-spin" style={{
//                                                         position: 'absolute',
//                                                         inset: 0,
//                                                         borderRadius: '50%',
//                                                         border: '3px solid rgba(56, 189, 248, 0.15)',
//                                                         borderTopColor: '#38bdf8'
//                                                     }} />
//                                                     <Tv size={26} color="#38bdf8" />
//                                                 </div>

//                                                 <div style={{ textAlign: 'center' }}>
//                                                     <div style={{
//                                                         fontSize: '0.78rem',
//                                                         fontWeight: 800,
//                                                         fontFamily: 'var(--font-heading)',
//                                                         textTransform: 'uppercase',
//                                                         letterSpacing: '0.08em',
//                                                         color: '#38bdf8',
//                                                         display: 'flex',
//                                                         alignItems: 'center',
//                                                         gap: '6px',
//                                                         justifyContent: 'center'
//                                                     }}>
//                                                         <Loader2 size={13} className="lfm-spin" /> {isVideoBuffering ? 'Buffering Stream...' : 'Initializing Video Stream...'}
//                                                     </div>
//                                                     <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
//                                                         Preparing media playback for {selectedUnit.title}
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         )}

//                                         <ReactPlayer
//                                             ref={playerRef}
//                                             src={selectedUnit.videoUrl}
//                                             controls={true}
//                                             width="100%"
//                                             height="100%"
//                                             style={{ position: 'absolute', top: 0, left: 0 }}
//                                             config={{
//                                                 youtube: {
//                                                     playerVars: {
//                                                         disablekb: 1,
//                                                         modestbranding: 1,
//                                                         rel: 0
//                                                     }
//                                                 }
//                                             }}
//                                             onReady={handlePlayerReady}
//                                             onStart={handleVideoPlay}
//                                             onPlay={handleVideoPlay}
//                                             onBuffer={() => setIsVideoBuffering(true)}
//                                             onBufferEnd={() => setIsVideoBuffering(false)}
//                                             onProgress={handleReactPlayerProgress}
//                                             onDuration={(d) => setDuration(d)}
//                                             onPause={handleVideoPause}
//                                             onEnded={handleVideoEnded}
//                                         />
//                                     </>
//                                 ) : (
//                                     <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#94a3b8', padding: '0 20px' }}>
//                                         <Tv size={48} style={{ opacity: 0.4, marginBottom: '8px' }} />
//                                         <p style={{ fontSize: '0.85rem', margin: 0 }}>Video Stream Unavailable</p>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     )}

//                     {/* READING GUIDE CONTENT (Hide if in Quiz Mode) */}
//                     {!isQuizMode && selectedUnit.unitType === 'reading' && (
//                         <div className="qcto-card">
//                             <div className="qcto-hdr" style={{ fontSize: '0.75rem' }}>
//                                 <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} /> Reading Guide</span>
//                                 <span>{selectedUnit.estimatedMinutes} MINS READ</span>
//                             </div>
//                             <div style={{ padding: '24px', color: '#0f172a' }}>
//                                 <div className="ql-editor" style={{ padding: 0, minHeight: 'auto', fontSize: '0.9rem', lineHeight: 1.6, color: '#0f172a' }}>
//                                     <div dangerouslySetInnerHTML={{ __html: selectedUnit.contentHtml || '<p>Reading content loading...</p>' }} />
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* FOCUSED QUIZ HEADER IF IN QUIZ Mode */}
//                     {isQuizMode && hasInteractiveCheck && (
//                         <div className="qcto-card" style={{ padding: '24px 28px', borderLeft: `6px solid ${gateAccent.color}` }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
//                                 <div>
//                                     <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: gateAccent.color, fontWeight: 800, letterSpacing: '0.05em', fontFamily: 'var(--font-heading)' }}>
//                                         Assessment Module
//                                     </span>
//                                     <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                         {selectedUnit.title}
//                                     </h2>
//                                     <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
//                                         Please complete the verification check below to proceed.
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '10px' }}>
//                                     {isVideo && (
//                                         <button
//                                             onClick={() => setIsQuizMode(false)}
//                                             className="lfm-btn lfm-btn--ghost"
//                                             style={{ color: 'var(--mlab-blue)' }}
//                                         >
//                                             <ArrowLeft size={14} /> Back to Video
//                                         </button>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* STANDARD LESSON METADATA BAR (Hide if in Quiz Mode) */}
//                     {!isQuizMode && (
//                         <div className="qcto-card" style={{ padding: '18px 20px' }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
//                                 <div>
//                                     <h2 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         {selectedUnit.title}
//                                         {isLessonCompleted && (
//                                             <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                 <CheckCircle2 size={9} /> Done
//                                             </span>
//                                         )}
//                                     </h2>
//                                     <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
//                                         {selectedUnit.estimatedMinutes} min lesson • {selectedUnit.sprintTitle || selectedCourse.title}
//                                     </div>
//                                 </div>
//                             </div>

//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--mlab-border)' }}>
//                                 <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>

//                                     <button
//                                         onClick={handleShare}
//                                         style={{
//                                             background: 'transparent',
//                                             border: 'none',
//                                             cursor: 'pointer',
//                                             display: 'inline-flex',
//                                             alignItems: 'center',
//                                             gap: '6px',
//                                             fontSize: '0.78rem',
//                                             fontWeight: 700,
//                                             color: shareCopied ? '#15803d' : 'var(--mlab-blue)',
//                                             padding: 0,
//                                             fontFamily: 'var(--font-heading)',
//                                             textTransform: 'uppercase',
//                                             transition: 'color 0.2s ease'
//                                         }}
//                                     >
//                                         {shareCopied ? <Check size={14} /> : <Share2 size={14} />}
//                                         {shareCopied ? 'Link Copied!' : 'Share'}
//                                     </button>

//                                     <button
//                                         onClick={handleToggleBookmark}
//                                         disabled={isBookmarking}
//                                         style={{
//                                             background: 'transparent',
//                                             border: 'none',
//                                             cursor: isBookmarking ? 'not-allowed' : 'pointer',
//                                             display: 'inline-flex',
//                                             alignItems: 'center',
//                                             gap: '6px',
//                                             fontSize: '0.78rem',
//                                             fontWeight: 700,
//                                             color: isBookmarked ? '#0284c7' : 'var(--mlab-blue)',
//                                             padding: 0,
//                                             fontFamily: 'var(--font-heading)',
//                                             textTransform: 'uppercase',
//                                             opacity: isBookmarking ? 0.5 : 1
//                                         }}
//                                     >
//                                         {isBookmarking ? <Loader2 size={14} className="lfm-spin" /> : <Bookmark size={14} fill={isBookmarked ? 'currentColor' : 'none'} />}
//                                         {isBookmarked ? 'Bookmarked' : 'Bookmark'}
//                                     </button>

//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-blue)', padding: 0, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                         <input
//                                             type="checkbox"
//                                             checked={autoNext}
//                                             onChange={toggleAutoNext}
//                                             style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
//                                         />
//                                         Autoplay Next
//                                     </label>
//                                 </div>

//                                 {/* DYNAMIC SMART ACTION BUTTON */}
//                                 {!isWatchRequirementMet ? (
//                                     <button
//                                         disabled
//                                         className="lfm-btn lfm-btn--primary"
//                                         style={{ opacity: 0.4, cursor: 'not-allowed', borderRadius: '0px' }}
//                                     >
//                                         {isVideo ? `Watch ${reqProgress}% to Unlock` : 'Read Content to Unlock'} <ChevronRight size={14} />
//                                     </button>
//                                 ) : hasInteractiveCheck && !checkSubmitted ? (
//                                     <button
//                                         onClick={() => setIsQuizMode(true)}
//                                         className="lfm-btn lfm-btn--green"
//                                         style={{ borderRadius: '0px' }}
//                                     >
//                                         <Zap size={14} fill="var(--mlab-blue)" /> Take Assessment <ChevronRight size={14} />
//                                     </button>
//                                 ) : (
//                                     <button
//                                         onClick={handleNextLesson}
//                                         disabled={!nextUnitPreview || !unlockedUnitIds.has(nextUnitPreview.id)}
//                                         className="lfm-btn lfm-btn--primary"
//                                         style={{
//                                             opacity: (!nextUnitPreview || !unlockedUnitIds.has(nextUnitPreview.id)) ? 0.4 : 1,
//                                             cursor: (!nextUnitPreview || !unlockedUnitIds.has(nextUnitPreview.id)) ? 'not-allowed' : 'pointer',
//                                             borderRadius: '0px'
//                                         }}
//                                     >
//                                         Next Lesson <ChevronRight size={14} />
//                                     </button>
//                                 )}
//                             </div>
//                         </div>
//                     )}

//                     {/* DYNAMIC FACILITATOR CARD DISPLAY */}
//                     {!isQuizMode && facilitators.length > 0 && (
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                             {facilitators.map((inst: any, idx: number) => {
//                                 const displayName = inst.name || 'mLab Facilitator';
//                                 const displayRole = inst.role || 'Course Instructor';
//                                 const initials = inst.initials || displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'FC';

//                                 return (
//                                     <div key={inst.id || idx} className="qcto-card" style={{ padding: '14px 18px', flexDirection: 'row', alignItems: 'center', gap: '14px' }}>
//                                         <div style={{ width: '40px', height: '40px', borderRadius: '0px', flexShrink: 0, background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}>
//                                             {initials}
//                                         </div>
//                                         <div>
//                                             <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                                 {idx === 0 ? 'Lead Facilitator' : 'Co-Facilitator'}
//                                             </div>
//                                             <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                 {displayName}
//                                             </div>
//                                             <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{displayRole}</div>
//                                         </div>
//                                     </div>
//                                 );
//                             })}
//                         </div>
//                     )}

//                     {/* INTERACTIVE ASSESSMENT CONTAINER */}
//                     {isQuizMode && hasInteractiveCheck && (
//                         <div style={{ background: '#0f172a', border: `2px solid ${checkSubmitted ? '#15803d' : gateAccent.border}`, padding: '20px', borderRadius: '0px', transition: 'border-color 0.3s ease' }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #1e293b', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
//                                 <div style={{ fontWeight: 900, fontSize: '0.85rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                     <GateIcon size={16} color={gateAccent.color} /> {gateAccent.label}
//                                 </div>

//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                     {!checkSubmitted && (
//                                         <span style={{
//                                             fontSize: '0.72rem',
//                                             background: isTimerUrgent ? '#7f1d1d' : '#78350f',
//                                             border: `1px solid ${isTimerUrgent ? '#f87171' : '#f59e0b'}`,
//                                             color: isTimerUrgent ? '#fca5a5' : '#fcd34d',
//                                             padding: '2px 8px',
//                                             fontWeight: 800,
//                                             display: 'inline-flex',
//                                             alignItems: 'center',
//                                             gap: '4px',
//                                             fontFamily: 'var(--font-heading)'
//                                         }}>
//                                             <Timer size={12} /> {timerRemaining !== null ? `${Math.floor(timerRemaining / 60)}:${String(timerRemaining % 60).padStart(2, '0')}` : 'Gate Active'}
//                                         </span>
//                                     )}

//                                     {checkSubmitted && (
//                                         <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', fontWeight: 900, padding: '3px 10px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
//                                             <Check size={13} /> GATE PASSED
//                                         </span>
//                                     )}
//                                 </div>
//                             </div>

//                             {selectedUnit.interactiveCheck?.checkType === 'spot_the_bug' && (
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1' }}>
//                                             {selectedUnit.interactiveCheck?.instructions}
//                                         </p>
//                                         <button
//                                             onClick={() => window.open(`/sandbox.html?blockId=${selectedUnit.interactiveCheck?.blockId || ''}`, '_blank', 'width=1024,height=768')}
//                                             className="lfm-btn lfm-btn--green"
//                                             style={{ borderRadius: '0px', padding: '4px 12px', fontSize: '0.75rem' }}
//                                         >
//                                             <ExternalLink size={12} style={{ marginRight: '4px' }} /> Launch IDE
//                                         </button>
//                                     </div>

//                                     <div style={{ padding: '20px', border: '1px dashed #334155', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
//                                         Click "Launch IDE" to open the code editor in a standalone window. Once you fix the bug and submit your code in the IDE window, this lesson will automatically be marked as complete.
//                                     </div>

//                                     {!checkSubmitted && (
//                                         <button
//                                             onClick={handleCompleteVerificationCheck}
//                                             className="lfm-btn lfm-btn--primary"
//                                             style={{ alignSelf: 'flex-start', borderRadius: '0px', marginTop: '8px' }}
//                                         >
//                                             <Check size={13} /> Mark Assessment Submitted
//                                         </button>
//                                     )}
//                                 </div>
//                             )}

//                             {selectedUnit.interactiveCheck?.checkType === 'socratic_dialogue' && (
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
//                                     <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px', fontSize: '0.82rem', color: '#fbbf24' }}>
//                                         🤖 <strong>AI Persona Prompt:</strong> "{selectedUnit.interactiveCheck?.instructions}"
//                                     </div>

//                                     <textarea
//                                         rows={3}
//                                         placeholder="Type your explanation to the AI assessor..."
//                                         value={socraticInput}
//                                         onChange={e => setSocraticInput(e.target.value)}
//                                         style={{ width: '100%', fontSize: '0.82rem', padding: '10px', border: '1px solid #334155', background: '#020617', color: 'white', borderRadius: '0px', outline: 'none' }}
//                                         disabled={checkSubmitted}
//                                     />

//                                     {!checkSubmitted && (
//                                         <button
//                                             onClick={handleCompleteVerificationCheck}
//                                             className="lfm-btn lfm-btn--primary"
//                                             style={{ alignSelf: 'flex-start', borderRadius: '0px' }}
//                                         >
//                                             <Send size={13} /> Send Answer to AI Assessor
//                                         </button>
//                                     )}
//                                 </div>
//                             )}

//                             {checkSubmitted && nextUnitPreview && unlockedUnitIds.has(nextUnitPreview.id) && (
//                                 <div style={{ marginTop: '16px', borderTop: '1px solid #1e293b', paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
//                                     <button
//                                         onClick={handleNextLesson}
//                                         className="lfm-btn lfm-btn--green"
//                                         style={{ borderRadius: '0px' }}
//                                     >
//                                         Proceed to Next Lesson <ChevronRight size={14} />
//                                     </button>
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {/* TABS WORKSPACE */}
//                     <div className="qcto-card">
//                         <div style={{ display: 'flex', borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-light-blue)' }}>
//                             {LESSON_TABS.map(tab => {
//                                 const TabIcon = tab.icon;
//                                 const isActive = activeLessonTab === tab.key;
//                                 return (
//                                     <button
//                                         key={tab.key}
//                                         onClick={() => setActiveLessonTab(tab.key)}
//                                         style={{
//                                             padding: '10px 14px',
//                                             background: isActive ? 'var(--mlab-blue)' : 'transparent',
//                                             border: 'none',
//                                             color: isActive ? 'white' : 'var(--mlab-blue)',
//                                             fontWeight: 800,
//                                             fontSize: '0.75rem',
//                                             fontFamily: 'var(--font-heading)',
//                                             textTransform: 'uppercase',
//                                             cursor: 'pointer',
//                                             display: 'inline-flex',
//                                             alignItems: 'center',
//                                             gap: '6px',
//                                             borderRadius: '0px',
//                                             outline: 'none'
//                                         }}
//                                     >
//                                         <TabIcon size={13} /> {tab.label}
//                                     </button>
//                                 );
//                             })}
//                         </div>

//                         <div style={{ padding: '16px', minHeight: '480px', display: 'flex', flexDirection: 'column' }}>
//                             {activeLessonTab === 'notes' && (
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
//                                     <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                         <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Your Personal Workspace</span>
//                                         <button
//                                             type="button"
//                                             onClick={handleSaveNotes}
//                                             disabled={isSavingNotes || isNotesLoading}
//                                             style={{
//                                                 color: noteSavedFeedback ? '#15803d' : 'var(--mlab-blue)',
//                                                 cursor: isSavingNotes ? 'not-allowed' : 'pointer',
//                                                 background: 'transparent',
//                                                 border: 'none',
//                                                 fontWeight: 800,
//                                                 padding: 0,
//                                                 fontFamily: 'var(--font-heading)',
//                                                 textTransform: 'uppercase',
//                                                 display: 'inline-flex',
//                                                 alignItems: 'center',
//                                                 gap: '4px'
//                                             }}
//                                         >
//                                             {isSavingNotes ? (
//                                                 <>
//                                                     <Loader2 size={12} className="lfm-spin" /> Saving...
//                                                 </>
//                                             ) : noteSavedFeedback ? (
//                                                 '✓ Saved!'
//                                             ) : (
//                                                 'Save Note'
//                                             )}
//                                         </button>
//                                     </div>

//                                     {isNotesLoading ? (
//                                         <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '8px' }}>
//                                             <Loader2 size={16} className="lfm-spin" /> Fetching your personal notes...
//                                         </div>
//                                     ) : (
//                                         <textarea
//                                             value={learnerNotes}
//                                             onChange={(e) => setLearnerNotes(e.target.value)}
//                                             placeholder="Type your personal notes here while watching the video... (These are private to you)"
//                                             style={{
//                                                 width: '100%',
//                                                 flex: 1,
//                                                 padding: '12px',
//                                                 borderRadius: '0px',
//                                                 outline: 'none',
//                                                 resize: 'none',
//                                                 fontSize: '0.8rem',
//                                                 background: '#f8fafc',
//                                                 border: '1px solid #cbd5e1',
//                                                 color: '#0f172a'
//                                             }}
//                                         />
//                                     )}
//                                 </div>
//                             )}

//                             {activeLessonTab === 'comments' && (
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
//                                     <div style={{ flex: 1, maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
//                                         {comments.length === 0 ? (
//                                             <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', padding: '30px 0' }}>
//                                                 No comments yet for this timeline. Start the discussion!
//                                             </div>
//                                         ) : (
//                                             comments.map(comment => (
//                                                 <div key={comment.id} style={{ display: 'flex', gap: '10px' }}>
//                                                     <div style={{ width: '32px', height: '32px', borderRadius: '0px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
//                                                         {comment.userInitials}
//                                                     </div>
//                                                     <div style={{ flex: 1, background: '#f8fafc', padding: '10px', border: '1px solid var(--mlab-border)' }}>
//                                                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
//                                                             <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                                 {comment.userName}
//                                                             </span>
//                                                             <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
//                                                                 {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleDateString() : 'Just now'}
//                                                             </span>
//                                                         </div>
//                                                         <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
//                                                             {comment.text}
//                                                         </div>
//                                                     </div>
//                                                 </div>
//                                             ))
//                                         )}
//                                     </div>

//                                     <div style={{ display: 'flex', gap: '10px', alignItems: 'center', borderTop: '1px solid var(--mlab-border)', paddingTop: '14px', marginTop: 'auto' }}>
//                                         <div style={{ width: '32px', height: '32px', borderRadius: '0px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
//                                             YOU
//                                         </div>
//                                         <input
//                                             type="text"
//                                             placeholder="Ask a question or leave a comment..."
//                                             value={newComment}
//                                             onChange={(e) => setNewComment(e.target.value)}
//                                             onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
//                                             className="pfm-input"
//                                             style={{ flex: 1, padding: '8px 12px', borderRadius: '0px', outline: 'none' }}
//                                             disabled={isPostingComment}
//                                         />
//                                         <button
//                                             onClick={handlePostComment}
//                                             disabled={isPostingComment || !newComment.trim()}
//                                             className="lfm-btn lfm-btn--primary"
//                                             style={{ borderRadius: '0px', opacity: (isPostingComment || !newComment.trim()) ? 0.5 : 1 }}
//                                         >
//                                             {isPostingComment ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />}
//                                         </button>
//                                     </div>
//                                 </div>
//                             )}

//                             {activeLessonTab === 'qa' && (
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>

//                                     {qaViewMode === 'list' && (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                 <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                     Lesson Discussion ({questions.length})
//                                                 </span>
//                                                 <button
//                                                     type="button"
//                                                     onClick={() => setQaViewMode('ask')}
//                                                     className="lfm-btn lfm-btn--primary"
//                                                     style={{ padding: '4px 12px', fontSize: '0.72rem', borderRadius: '0px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
//                                                 >
//                                                     <Plus size={13} /> Ask Question
//                                                 </button>
//                                             </div>

//                                             <div style={{ flex: 1, maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
//                                                 {questions.length === 0 ? (
//                                                     <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)' }}>
//                                                         <HelpCircle size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
//                                                         <p style={{ margin: 0, fontSize: '0.82rem' }}>Have a question about this lesson? Be the first to ask!</p>
//                                                     </div>
//                                                 ) : (
//                                                     questions.map(q => (
//                                                         <div
//                                                             key={q.id}
//                                                             onClick={() => {
//                                                                 setSelectedQuestion(q);
//                                                                 setShowMockAiAnswer(false);
//                                                                 setQaViewMode('detail');
//                                                             }}
//                                                             style={{
//                                                                 padding: '12px 16px',
//                                                                 border: '1px solid var(--mlab-border)',
//                                                                 background: '#ffffff',
//                                                                 cursor: 'pointer',
//                                                                 display: 'flex',
//                                                                 flexDirection: 'column',
//                                                                 gap: '6px',
//                                                                 transition: 'border-color 0.15s ease'
//                                                             }}
//                                                             onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--mlab-blue)'}
//                                                             onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--mlab-border)'}
//                                                         >
//                                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
//                                                                 <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
//                                                                     {q.title}
//                                                                 </div>
//                                                                 <span style={{ fontSize: '0.7rem', background: q.answersCount > 0 ? '#dcfce7' : '#f1f5f9', color: q.answersCount > 0 ? '#15803d' : '#64748b', padding: '2px 8px', fontWeight: 800 }}>
//                                                                     {q.answersCount || 0} Answers
//                                                                 </span>
//                                                             </div>

//                                                             <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                 <span>Asked by <strong>{q.userName}</strong></span>
//                                                                 <span>•</span>
//                                                                 <span>{q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
//                                                             </div>
//                                                         </div>
//                                                     ))
//                                                 )}
//                                             </div>
//                                         </div>
//                                     )}

//                                     {qaViewMode === 'ask' && (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--mlab-border)', paddingBottom: '10px' }}>
//                                                 <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                     Draft Your Question
//                                                 </span>
//                                                 <button
//                                                     type="button"
//                                                     onClick={() => setQaViewMode('list')}
//                                                     style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700 }}
//                                                 >
//                                                     Cancel
//                                                 </button>
//                                             </div>

//                                             <div>
//                                                 <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                     Question Title / Subject
//                                                 </label>
//                                                 <input
//                                                     type="text"
//                                                     placeholder="e.g. How does the useEffect hook cleanup work here?"
//                                                     value={questionTitle}
//                                                     onChange={(e) => setQuestionTitle(e.target.value)}
//                                                     className="pfm-input"
//                                                     style={{ width: '100%', padding: '8px 12px', borderRadius: '0px', outline: 'none' }}
//                                                 />
//                                             </div>

//                                             <div>
//                                                 <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                     Detailed Description &amp; Code Snippets
//                                                 </label>
//                                                 <div style={{ background: '#ffffff' }}>
//                                                     <ReactQuill
//                                                         theme="snow"
//                                                         value={questionBody}
//                                                         onChange={setQuestionTitleBody}
//                                                         modules={QUILL_QA_MODULES}
//                                                         placeholder="Provide context, error messages, or code samples..."
//                                                         style={{ height: '180px', marginBottom: '40px' }}
//                                                     />
//                                                 </div>
//                                             </div>

//                                             <button
//                                                 type="button"
//                                                 onClick={handlePostQuestion}
//                                                 disabled={isSubmittingQA || !questionTitle.trim() || !questionBody.trim()}
//                                                 className="lfm-btn lfm-btn--green"
//                                                 style={{ alignSelf: 'flex-end', padding: '6px 16px', fontSize: '0.78rem', opacity: (!questionTitle.trim() || !questionBody.trim() || isSubmittingQA) ? 0.5 : 1, marginTop: 'auto' }}
//                                             >
//                                                 {isSubmittingQA ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} Submit Question
//                                             </button>
//                                         </div>
//                                     )}

//                                     {qaViewMode === 'detail' && selectedQuestion && (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>

//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                 <button
//                                                     type="button"
//                                                     onClick={() => {
//                                                         setSelectedQuestion(null);
//                                                         setShowMockAiAnswer(false);
//                                                         setQaViewMode('list');
//                                                     }}
//                                                     style={{ background: 'transparent', border: 'none', color: 'var(--mlab-blue)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', padding: 0 }}
//                                                 >
//                                                     <ArrowLeft size={13} /> Back
//                                                 </button>

//                                                 {!showMockAiAnswer && (
//                                                     <button
//                                                         onClick={handleTriggerMockAi}
//                                                         disabled={isAiThinking}
//                                                         style={{
//                                                             background: 'transparent',
//                                                             border: '1px solid #c4b5fd',
//                                                             color: '#6d28d9',
//                                                             fontSize: '0.7rem',
//                                                             fontWeight: 800,
//                                                             cursor: isAiThinking ? 'not-allowed' : 'pointer',
//                                                             display: 'inline-flex',
//                                                             alignItems: 'center',
//                                                             gap: '6px',
//                                                             fontFamily: 'var(--font-heading)',
//                                                             textTransform: 'uppercase',
//                                                             padding: '4px 10px',
//                                                             transition: 'all 0.2s',
//                                                             opacity: isAiThinking ? 0.6 : 1
//                                                         }}
//                                                     >
//                                                         {isAiThinking ? (
//                                                             <><Loader2 size={12} className="lfm-spin" /> Analyzing...</>
//                                                         ) : (
//                                                             <><Zap size={12} /> Ask AI Assistant</>
//                                                         )}
//                                                     </button>
//                                                 )}
//                                             </div>

//                                             <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '16px' }}>
//                                                 <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', marginBottom: '8px' }}>
//                                                     {selectedQuestion.title}
//                                                 </div>
//                                                 <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '12px', display: 'flex', gap: '8px' }}>
//                                                     <span>Asked by <strong>{selectedQuestion.userName}</strong></span>
//                                                     <span>•</span>
//                                                     <span>{selectedQuestion.createdAt?.toDate ? selectedQuestion.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
//                                                 </div>
//                                                 <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
//                                                     <QuillHTMLViewer html={selectedQuestion.contentHtml} />
//                                                 </div>
//                                             </div>

//                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
//                                                 <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <MessageCircle size={14} /> Answers ({questionAnswers.length})
//                                                 </span>

//                                                 {showMockAiAnswer && (
//                                                     <div style={{ display: 'flex', gap: '10px', paddingLeft: '12px', borderLeft: '3px solid #8b5cf6', marginBottom: '8px' }}>
//                                                         <div style={{ flex: 1, background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '12px' }}>
//                                                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
//                                                                 <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6d28d9', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
//                                                                     <Bot size={14} /> mLab AI Assistant
//                                                                 </span>
//                                                                 <span style={{ fontSize: '0.65rem', color: '#8b5cf6', fontWeight: 700 }}>
//                                                                     ✨ Instant Reply
//                                                                 </span>
//                                                             </div>
//                                                             <div style={{ fontSize: '0.82rem', color: '#4c1d95', lineHeight: 1.6 }}>
//                                                                 <p style={{ margin: '0 0 8px 0' }}>Hi <strong>{selectedQuestion.userName}</strong>, based on your question, it looks like you are asking about <strong>{selectedQuestion.title}</strong>.</p>
//                                                                 <div style={{ background: '#ede9fe', border: '1px dashed #c4b5fd', padding: '10px', marginBottom: '8px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
//                                                                     // Interactive code execution block
//                                                                 </div>
//                                                                 <p style={{ margin: 0 }}>Does this resolve your issue? A human facilitator has also been notified of your question.</p>
//                                                             </div>
//                                                         </div>
//                                                     </div>
//                                                 )}

//                                                 {questionAnswers.length === 0 && !showMockAiAnswer ? (
//                                                     <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
//                                                         No replies posted yet.
//                                                     </div>
//                                                 ) : (
//                                                     questionAnswers.map(ans => (
//                                                         <div key={ans.id} style={{ display: 'flex', gap: '10px', paddingLeft: '12px', borderLeft: '3px solid var(--mlab-blue)' }}>
//                                                             <div style={{ flex: 1, background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '12px' }}>
//                                                                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
//                                                                     <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
//                                                                         {ans.userName}
//                                                                     </span>
//                                                                     <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
//                                                                         {ans.createdAt?.toDate ? ans.createdAt.toDate().toLocaleDateString() : 'Just now'}
//                                                                     </span>
//                                                                 </div>
//                                                                 <div style={{ fontSize: '0.82rem', color: '#334155' }}>
//                                                                     <QuillHTMLViewer html={ans.contentHtml} />
//                                                                 </div>
//                                                             </div>
//                                                         </div>
//                                                     ))
//                                                 )}
//                                             </div>

//                                             <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '14px', marginTop: '8px' }}>
//                                                 <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                     Post Your Reply / Solution
//                                                 </label>
//                                                 <div style={{ background: '#ffffff', marginBottom: '40px' }}>
//                                                     <ReactQuill
//                                                         theme="snow"
//                                                         value={answerBody}
//                                                         onChange={setAnswerBody}
//                                                         modules={QUILL_QA_MODULES}
//                                                         placeholder="Type your response or solution here..."
//                                                         style={{ height: '120px' }}
//                                                     />
//                                                 </div>
//                                                 <button
//                                                     type="button"
//                                                     onClick={handlePostAnswer}
//                                                     disabled={isSubmittingQA || !answerBody.trim()}
//                                                     className="lfm-btn lfm-btn--primary"
//                                                     style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: '0.75rem', opacity: (!answerBody.trim() || isSubmittingQA) ? 0.5 : 1, borderRadius: '0px' }}
//                                                 >
//                                                     {isSubmittingQA ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} Post Reply
//                                                 </button>
//                                             </div>
//                                         </div>
//                                     )}

//                                 </div>
//                             )}

//                             {activeLessonTab === 'attachments' && (
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
//                                     <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
//                                         <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                             Lesson &amp; Course Resources ({allAttachments.length})
//                                         </span>
//                                     </div>

//                                     {allAttachments.length === 0 ? (
//                                         <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)', flex: 1 }}>
//                                             <Paperclip size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
//                                             <p style={{ margin: 0, fontSize: '0.82rem' }}>No attachments available for this lesson or course timeline.</p>
//                                         </div>
//                                     ) : (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', overflowY: 'auto', maxHeight: '380px' }}>
//                                             {allAttachments.map((att: any, idx: number) => {
//                                                 const ext = (att.fileType || att.name?.split('.').pop() || 'file').toLowerCase();
//                                                 const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(ext);
//                                                 const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'zip'].includes(ext);

//                                                 return (
//                                                     <a
//                                                         key={att.id || idx}
//                                                         href={att.url}
//                                                         target="_blank"
//                                                         rel="noopener noreferrer"
//                                                         style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', border: '1px solid var(--mlab-border)', textDecoration: 'none', color: 'inherit', transition: 'background-color 0.2s ease', gap: '12px' }}
//                                                         onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
//                                                         onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
//                                                     >
//                                                         <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: 1 }}>
//                                                             <div style={{ width: '36px', height: '36px', background: isSpreadsheet ? '#d1fae5' : isCode ? '#f3e8ff' : '#e0f2fe', color: isSpreadsheet ? '#059669' : isCode ? '#7c3aed' : '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
//                                                                 {isSpreadsheet ? <FileSpreadsheet size={18} /> : isCode ? <FileCode size={18} /> : <FileText size={18} />}
//                                                             </div>
//                                                             <div style={{ minWidth: 0, flex: 1 }}>
//                                                                 <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--mlab-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//                                                                     {att.name}
//                                                                 </div>
//                                                                 {att.description && (
//                                                                     <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '2px', marginBottom: '3px', lineHeight: 1.35, fontWeight: 500 }}>
//                                                                         {att.description}
//                                                                     </div>
//                                                                 )}
//                                                                 <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
//                                                                     {ext.toUpperCase()} • {att.fileSize ? `${(att.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Downloadable File'}
//                                                                 </div>
//                                                             </div>
//                                                         </div>
//                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--mlab-blue)', color: 'white', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
//                                                             <Download size={12} /> Download
//                                                         </div>
//                                                     </a>
//                                                 );
//                                             })}
//                                         </div>
//                                     )}
//                                 </div>
//                             )}

//                             {activeLessonTab === 'related' && (
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
//                                     <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
//                                         <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                             Supplemental Resources
//                                         </span>
//                                     </div>

//                                     {!(selectedUnit as any).relatedLinks || (selectedUnit as any).relatedLinks.length === 0 ? (
//                                         <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)', flex: 1 }}>
//                                             <Sparkles size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
//                                             <p style={{ margin: 0, fontSize: '0.82rem' }}>No supplemental resources have been added to this lesson yet.</p>
//                                         </div>
//                                     ) : (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', overflowY: 'auto', maxHeight: '380px' }}>
//                                             {((selectedUnit as any).relatedLinks || []).map((link: any, idx: number) => {
//                                                 let domain = 'External Link';
//                                                 try { domain = new URL(link.url).hostname.replace('www.', ''); } catch (e) { }

//                                                 return (
//                                                     <a
//                                                         key={idx}
//                                                         href={link.url}
//                                                         target="_blank"
//                                                         rel="noopener noreferrer"
//                                                         style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', border: '1px solid var(--mlab-border)', textDecoration: 'none', color: 'inherit', transition: 'background-color 0.2s ease' }}
//                                                         onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
//                                                         onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
//                                                     >
//                                                         <div style={{ width: '32px', height: '32px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
//                                                             <ExternalLink size={16} />
//                                                         </div>
//                                                         <div style={{ flex: 1, minWidth: 0 }}>
//                                                             <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//                                                                 {link.title || 'Supplemental Resource'}
//                                                             </div>
//                                                             <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
//                                                                 {link.type || 'Resource'} • {domain}
//                                                             </div>
//                                                         </div>
//                                                     </a>
//                                                 );
//                                             })}
//                                         </div>
//                                     )}
//                                 </div>
//                             )}
//                         </div>
//                     </div>

//                 </div>

//                 {/* STICKY RIGHT SIDEBAR IN PLAYER VIEW */}
//                 <div className="lch-sidebar-sticky">

//                     <div className="qcto-card">
//                         <div className="qcto-hdr" style={{ fontSize: '0.75rem', borderBottom: '3px solid var(--mlab-green)' }}>
//                             {selectedCourse.title}
//                         </div>
//                         <div style={{ padding: '14px' }}>
//                             {/* COMPACT TIMELINE & PACING BADGE */}
//                             {((selectedCourse as any).startDate || (selectedCourse as any).endDate) && (
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '6px 8px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.7rem' }}>
//                                     <span style={{ fontWeight: 700, color: '#475569' }}>
//                                         📅 Timeline: {(selectedCourse as any).startDate ? moment((selectedCourse as any).startDate).format('DD MMM YY') : 'Start'} → {(selectedCourse as any).endDate ? moment((selectedCourse as any).endDate).format('DD MMM YY') : 'End'}
//                                     </span>
//                                     <span style={{ fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
//                                         {((selectedCourse as any).pacingModel || 'individual_self_paced') === 'individual_self_paced' ? 'Self-Paced' : 'Scheduled'}
//                                     </span>
//                                 </div>
//                             )}

//                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                 <span>Course Progress</span>
//                                 <span>{dynamicCompletedCount} OF {selectedCourse.totalUnitsCount || enrichedCourseUnits.length} LESSONS</span>
//                             </div>
//                             <ProgressBar
//                                 completed={dynamicCompletedCount}
//                                 total={selectedCourse.totalUnitsCount || enrichedCourseUnits.length}
//                             />
//                         </div>
//                     </div>

//                     {nestedSyllabus.map((mainGroup, mainIdx) => {
//                         const hasSelectedUnitMain = mainGroup.subGroups.some(sg => sg.units.some(u => u.id === selectedUnit.id) || (sg.dayCheckpoint && `synthetic_${sg.title}` === selectedUnit.id));
//                         const isMainOpen = expandedMainGroups[mainGroup.title] !== undefined ? expandedMainGroups[mainGroup.title] : hasSelectedUnitMain;

//                         return (
//                             <div key={mainGroup.title} className="qcto-card" style={{ marginBottom: '12px' }}>
//                                 <button
//                                     onClick={() => setExpandedMainGroups(prev => ({ ...prev, [mainGroup.title]: !isMainOpen }))}
//                                     style={{
//                                         width: '100%',
//                                         display: 'flex',
//                                         justifyContent: 'space-between',
//                                         alignItems: 'center',
//                                         padding: '12px 14px',
//                                         background: hasSelectedUnitMain ? 'var(--mlab-blue)' : 'var(--mlab-light-blue)',
//                                         border: 'none',
//                                         cursor: 'pointer',
//                                         textAlign: 'left',
//                                         borderBottom: isMainOpen && !hasSelectedUnitMain ? '2px solid var(--mlab-border)' : '2px solid var(--mlab-green)',
//                                         borderRadius: '0px',
//                                         outline: 'none'
//                                     }}
//                                 >
//                                     <div>
//                                         <div style={{ fontSize: '0.62rem', fontWeight: 800, color: hasSelectedUnitMain ? '#bae6fd' : 'var(--mlab-blue)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                             MODULE {String(mainIdx + 1).padStart(2, '0')}
//                                         </div>
//                                         <div style={{ fontSize: '0.82rem', fontWeight: 800, color: hasSelectedUnitMain ? 'white' : 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                             {mainGroup.title}
//                                         </div>
//                                     </div>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <span style={{ fontSize: '0.68rem', color: hasSelectedUnitMain ? '#bae6fd' : '#64748b', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
//                                             {mainGroup.completedUnits}/{mainGroup.totalUnits}
//                                         </span>
//                                         <ChevronDown size={14} color={hasSelectedUnitMain ? "white" : "var(--mlab-blue)"} style={{ transform: isMainOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
//                                     </div>
//                                 </button>

//                                 {isMainOpen && (
//                                     <div style={{ background: '#f8fafc', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                         {mainGroup.subGroups.map(subGroup => {
//                                             const subKey = `${mainGroup.title}__${subGroup.title}`;
//                                             const hasSelectedUnitSub = subGroup.units.some(u => u.id === selectedUnit.id) || (subGroup.dayCheckpoint && `synthetic_${subGroup.title}` === selectedUnit.id);
//                                             const isSubOpen = expandedSubGroups[subKey] !== undefined ? expandedSubGroups[subKey] : hasSelectedUnitSub;
//                                             const subDone = subGroup.units.filter(u => u.isCompleted).length;

//                                             return (
//                                                 <div key={subKey} style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', borderRadius: '0px' }}>

//                                                     <button
//                                                         onClick={() => setExpandedSubGroups(prev => ({ ...prev, [subKey]: !isSubOpen }))}
//                                                         style={{
//                                                             width: '100%',
//                                                             display: 'flex',
//                                                             justifyContent: 'space-between',
//                                                             alignItems: 'center',
//                                                             padding: '8px 12px',
//                                                             background: hasSelectedUnitSub ? '#f0f9ff' : 'transparent',
//                                                             border: 'none',
//                                                             borderLeft: `3px solid ${hasSelectedUnitSub ? '#0284c7' : 'var(--mlab-blue)'}`,
//                                                             cursor: 'pointer',
//                                                             textAlign: 'left',
//                                                             borderBottom: isSubOpen && !hasSelectedUnitSub ? '1px solid var(--mlab-border)' : 'none',
//                                                             borderRadius: '0px',
//                                                             outline: 'none'
//                                                         }}
//                                                     >
//                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                             <Bookmark size={12} color={hasSelectedUnitSub ? '#0284c7' : 'var(--mlab-blue)'} />
//                                                             <span style={{ fontWeight: 700, fontSize: '0.75rem', color: hasSelectedUnitSub ? '#0284c7' : '#334155', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                                 {subGroup.title}
//                                                             </span>
//                                                         </div>
//                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                             <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
//                                                                 {subDone}/{subGroup.units.length}
//                                                             </span>
//                                                             <ChevronDown size={14} color="#64748b" style={{ transform: isSubOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
//                                                         </div>
//                                                     </button>

//                                                     {isSubOpen && (
//                                                         <div>
//                                                             {subGroup.units.map(u => {
//                                                                 const isCurrent = u.id === selectedUnit.id;
//                                                                 const isClickable = isCurrent || unlockedUnitIds.has(u.id);

//                                                                 return (
//                                                                     <div
//                                                                         key={u.id}
//                                                                         onClick={() => { if (isClickable) onSelectUnit(u); }}
//                                                                         style={{
//                                                                             display: 'flex',
//                                                                             alignItems: 'center',
//                                                                             justifyContent: 'space-between',
//                                                                             gap: '8px',
//                                                                             padding: '10px 12px',
//                                                                             cursor: isClickable ? 'pointer' : 'not-allowed',
//                                                                             background: isCurrent ? 'var(--mlab-light-blue)' : 'white',
//                                                                             borderBottom: '1px solid #f1f5f9',
//                                                                             borderLeft: isCurrent ? '3px solid var(--mlab-blue)' : '3px solid transparent'
//                                                                         }}
//                                                                     >
//                                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, opacity: isClickable ? 1 : 0.5 }}>
//                                                                             {u.isCompleted ? (
//                                                                                 <CheckCircle2 size={14} color="#15803d" style={{ flexShrink: 0 }} />
//                                                                             ) : !isClickable ? (
//                                                                                 <Lock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
//                                                                             ) : isCurrent ? (
//                                                                                 <Pause size={12} color="var(--mlab-blue)" style={{ flexShrink: 0 }} />
//                                                                             ) : (
//                                                                                 <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #cbd5e1', flexShrink: 0 }} />
//                                                                             )}
//                                                                             <span style={{
//                                                                                 fontSize: '0.72rem',
//                                                                                 fontWeight: isCurrent ? 800 : 600,
//                                                                                 color: !isClickable ? '#94a3b8' : (isCurrent ? 'var(--mlab-blue)' : '#334155'),
//                                                                                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
//                                                                             }}>
//                                                                                 {u.title}
//                                                                                 {checkpointScope === 'per_lesson' && u.interactiveCheck?.checkType && u.interactiveCheck.checkType !== 'none' && (
//                                                                                     <span title="Assessment Included" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '4px', marginBottom: '-1px' }}>
//                                                                                         <Sparkles size={10} color="#f59e0b" />
//                                                                                     </span>
//                                                                                 )}
//                                                                             </span>
//                                                                         </div>
//                                                                         <span style={{ fontSize: '0.65rem', color: '#94a3b8', flexShrink: 0, fontFamily: 'monospace' }}>
//                                                                             {u.estimatedMinutes}m
//                                                                         </span>
//                                                                     </div>
//                                                                 );
//                                                             })}

//                                                             {subGroup.dayCheckpoint && (
//                                                                 <div
//                                                                     onClick={() => {
//                                                                         if (subGroup.isDayComplete) {
//                                                                             onSelectUnit(generateSyntheticQuizUnit(`${subGroup.title} Assessment`, subGroup.dayCheckpoint, false));
//                                                                         }
//                                                                     }}
//                                                                     style={{
//                                                                         display: 'flex',
//                                                                         alignItems: 'center',
//                                                                         justifyContent: 'space-between',
//                                                                         gap: '8px',
//                                                                         padding: '10px 12px',
//                                                                         cursor: subGroup.isDayComplete ? 'pointer' : 'not-allowed',
//                                                                         background: selectedUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '#fffbeb' : '#fafafa',
//                                                                         borderBottom: '1px solid #f1f5f9',
//                                                                         borderLeft: selectedUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '3px solid #f59e0b' : '3px solid transparent'
//                                                                     }}
//                                                                 >
//                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, opacity: subGroup.isDayComplete ? 1 : 0.5 }}>
//                                                                         {subGroup.isDayComplete ? (
//                                                                             <Sparkles size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
//                                                                         ) : (
//                                                                             <Lock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
//                                                                         )}
//                                                                         <span style={{
//                                                                             fontSize: '0.72rem',
//                                                                             fontWeight: 800,
//                                                                             color: subGroup.isDayComplete ? '#92400e' : '#94a3b8',
//                                                                             fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
//                                                                         }}>
//                                                                             Topic Assessment
//                                                                         </span>
//                                                                     </div>
//                                                                 </div>
//                                                             )}
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             );
//                                         })}

//                                         {mainGroup.sprintCheckpoint && (
//                                             <button
//                                                 type="button"
//                                                 onClick={() => {
//                                                     if (mainGroup.isComplete) {
//                                                         onSelectUnit(generateSyntheticQuizUnit(`${mainGroup.title} Capstone`, mainGroup.sprintCheckpoint, false));
//                                                     }
//                                                 }}
//                                                 style={{
//                                                     width: '100%',
//                                                     display: 'flex',
//                                                     alignItems: 'center',
//                                                     justifyContent: 'space-between',
//                                                     gap: '8px',
//                                                     padding: '12px 14px',
//                                                     cursor: mainGroup.isComplete ? 'pointer' : 'not-allowed',
//                                                     background: selectedUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '#f3e8ff' : '#ffffff',
//                                                     border: '1px solid var(--mlab-border)',
//                                                     borderLeft: selectedUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '4px solid #9333ea' : '1px solid var(--mlab-border)',
//                                                     borderRadius: '0px',
//                                                     outline: 'none',
//                                                     opacity: mainGroup.isComplete ? 1 : 0.6
//                                                 }}
//                                             >
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
//                                                     {mainGroup.isComplete ? (
//                                                         <Award size={16} color="#9333ea" style={{ flexShrink: 0 }} />
//                                                     ) : (
//                                                         <Lock size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
//                                                     )}
//                                                     <span style={{
//                                                         fontSize: '0.75rem',
//                                                         fontWeight: 900,
//                                                         color: mainGroup.isComplete ? '#6b21a8' : '#94a3b8',
//                                                         fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
//                                                     }}>
//                                                         Module Capstone Gate
//                                                     </span>
//                                                 </div>
//                                             </button>
//                                         )}
//                                     </div>
//                                 )}
//                             </div>
//                         );
//                     })}

//                 </div>

//             </div>
//         </div>
//     );
// };