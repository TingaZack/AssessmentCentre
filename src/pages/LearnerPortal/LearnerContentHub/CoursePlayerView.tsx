// // src/pages/LearnerPortal/LearnerContentHub/CoursePlayerView.tsx

// import React, { useState, useEffect, useMemo, useRef } from 'react';
// import { createPortal } from 'react-dom';
// import { useNavigate } from 'react-router-dom';
// import {
//     ArrowLeft, Share2, Bookmark, ChevronRight, Tv, FileText, Send,
//     PartyPopper, Timer, CheckCircle2, Check, Sparkles, Bug, Bot,
//     HelpCircle, Pause, ExternalLink, Loader2, Award, RotateCcw,
//     Download, X, ArrowRight, History, Code, Shield, ShieldCheck, Eye, Mic, AlertTriangle
// } from 'lucide-react';
// import {
//     doc, getDoc, setDoc, collection, query, where,
//     onSnapshot, addDoc, serverTimestamp, deleteDoc, writeBatch, getDocs
// } from 'firebase/firestore';
// import { auth, db, storage } from '../../../lib/firebase';
// import { onAuthStateChanged } from 'firebase/auth';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// import ReactPlayer from 'react-player';
// import {
//     MediaController, MediaControlBar, MediaTimeRange, MediaTimeDisplay,
//     MediaVolumeRange, MediaPlaybackRateButton, MediaPlayButton,
//     MediaSeekBackwardButton, MediaSeekForwardButton, MediaMuteButton,
//     MediaFullscreenButton,
// } from 'media-chrome/react';

// import Tooltip from '../../../components/common/Tooltip/Tooltip';
// import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// import LearningFlow, { type Stage, type StageStatus } from './LearningFlow';

// import type {
//     InteractiveCheckConfig, MCQOption, MCQQuestion
// } from '../../../types/content.types';
// import {
//     type CoursePackage, type LearnerUnitProgress, type QuizAttemptDoc
// } from './types';
// import { LessonInteractionTabs } from './CoursePlayerViewComponents/LessonInteractionTabs';
// import { CourseSidebar } from './CoursePlayerViewComponents/CourseSidebar';

// // Types and Interfaces
// export interface AttachmentItem {
//     id?: string; url?: string; name?: string; containerId?: string;
//     timelineId?: string; cohortRunId?: string; fileType?: string;
//     fileSize?: number; description?: string;
// }

// export interface ExtendedCoursePackage extends CoursePackage {
//     timelineId?: string; placementId?: string; allowedProgressKeys?: string[];
//     checkpointScope?: 'per_lesson' | 'per_day' | 'per_sprint';
//     attachments?: AttachmentItem[];
//     secamStructure?: any[];
//     checkpointMetadata?: any;
//     pacingModel?: 'cohort_scheduled' | 'individual_self_paced';
//     [key: string]: any;
// }

// export interface ExtendedLearnerUnitProgress extends LearnerUnitProgress {
//     progressPercent?: number; watchPercentage?: number;
//     cohortRunId?: string; linkedAssessmentId?: string | null;
//     assessmentId?: string | null; formalAssessmentId?: string | null;
//     unlinkedPolicy?: 'soft_gate' | 'hard_gate';
//     files?: AttachmentItem[]; lessonAttachments?: AttachmentItem[];
//     relatedLinks?: any[];
// }

// interface CertificateData {
//     id?: string; courseName?: string; pdfUrl: string;[key: string]: any;
// }

// interface CoursePlayerViewProps {
//     selectedCourse: CoursePackage;
//     selectedUnit: LearnerUnitProgress;
//     courseUnits: LearnerUnitProgress[];
//     groupedSyllabus: Record<string, LearnerUnitProgress[]>;
//     onBackToOverview: () => void;
//     onSelectUnit: (unit: LearnerUnitProgress) => void;
// }

// // Helpers
// const getCourseInstanceId = (c?: CoursePackage | ExtendedCoursePackage | null) => {
//     if (!c) return '';
//     const ext = c as ExtendedCoursePackage;
//     return ext.cohortRunId || ext.timelineId || ext.placementId || ext.id;
// };

// const extractYouTubeId = (url: string): string | null => {
//     const cleanUrl = url.trim();
//     if (cleanUrl.includes('youtu.be/')) return cleanUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || null;
//     if (cleanUrl.includes('youtube.com/shorts/')) return cleanUrl.split('youtube.com/shorts/')[1]?.split('?')[0]?.split('&')[0] || null;
//     if (cleanUrl.includes('youtube.com/live/')) return cleanUrl.split('youtube.com/live/')[1]?.split('?')[0]?.split('&')[0] || null;
//     if (cleanUrl.includes('youtube.com/embed/')) return cleanUrl.split('youtube.com/embed/')[1]?.split('?')[0]?.split('&')[0] || null;
//     if (cleanUrl.includes('youtube.com')) {
//         try { return new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`).searchParams.get('v'); } catch (e) { return null; }
//     }
//     return null;
// };

// const formatTime = (secs: number) => {
//     const safeSecs = typeof secs === 'number' && !isNaN(secs) && secs > 0 ? Math.floor(secs) : 0;
//     if (safeSecs <= 0) return '0:00';
//     const h = Math.floor(safeSecs / 3600);
//     const m = Math.floor((safeSecs % 3600) / 60);
//     const s = safeSecs % 60;
//     if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
//     return `${m}:${s.toString().padStart(2, '0')}`;
// };

// const getUnitLinkedAssessmentId = (unit?: LearnerUnitProgress | null): string | null => {
//     if (!unit) return null;
//     const ext = unit as any;
//     const candidates = [
//         ext.linkedAssessmentId, ext.assessmentId, ext.formalAssessmentId,
//         ext.linkedAssessment, ext.assessment, ext.examId, ext.linkedExamId,
//         ext.checkpointMetadata?.linkedAssessmentId, ext.checkpointMetadata?.assessmentId
//     ];
//     for (const candidate of candidates) {
//         if (candidate && typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
//         if (candidate && typeof candidate === 'object' && candidate !== null && candidate.id) return String(candidate.id).trim();
//     }
//     return null;
// };

// const getAssessmentMeta = (course?: CoursePackage | ExtendedCoursePackage | null, unit?: LearnerUnitProgress | null) => {
//     const framework = String((course as any)?.framework || (course as any)?.type || (unit as any)?.framework || (unit as any)?.assessmentFramework || '').toLowerCase();
//     if (framework.includes('secam') || framework.includes('seta') || framework.includes('qcto')) {
//         return { title: 'Formal SETA / QCTO Exam', shortTitle: 'SETA / QCTO Exam', badge: 'Official', lifecycleTitle: 'Official SETA / QCTO Assessment Lifecycle', overviewTitle: 'Official SETA / QCTO Examination Overview', defaultReg: 'Reg: SETA' };
//     }
//     if (framework.includes('codetribe') || framework.includes('bootcamp')) {
//         return { title: 'CodeTribe Formal Assessment', shortTitle: 'CodeTribe Assessment', badge: 'CodeTribe', lifecycleTitle: 'CodeTribe Assessment Lifecycle', overviewTitle: 'CodeTribe Examination Overview', defaultReg: 'Reg: CodeTribe' };
//     }
//     return { title: 'Formal Assessment', shortTitle: 'Formal Assessment', badge: 'Official', lifecycleTitle: 'Official Assessment Lifecycle', overviewTitle: 'Official Examination Overview', defaultReg: 'Reg: Official' };
// };

// const CertificateModal: React.FC<{ certificate: CertificateData; onClose: () => void }> = ({ certificate, onClose }) => {
//     return createPortal(
//         <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
//             <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: '960px', height: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden' }}>
//                 <div style={{ padding: '16px 20px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid var(--mlab-green)' }}>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         <Award size={20} color="var(--mlab-green)" />
//                         <div>
//                             <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Certificate of Completion</div>
//                             <div style={{ fontSize: '0.75rem', color: '#bae6fd' }}>{certificate.courseName || 'Course Verification'}</div>
//                         </div>
//                     </div>
//                     <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
//                         <Tooltip content="Download official certificate PDF document." placement="bottom">
//                             <button onClick={() => window.open(certificate.pdfUrl, '_blank')} className="lfm-btn lfm-btn--primary" style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none', padding: '6px 14px', borderRadius: '2px' }}>
//                                 <Download size={14} /> Download Original PDF
//                             </button>
//                         </Tooltip>
//                         <Tooltip content="Close certificate viewer" placement="bottom">
//                             <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                                 <X size={18} />
//                             </button>
//                         </Tooltip>
//                     </div>
//                 </div>
//                 <div style={{ flex: 1, background: '#e2e8f0', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
//                     <object data={`${certificate.pdfUrl}#toolbar=0&navpanes=0`} type="application/pdf" width="100%" height="100%" style={{ borderRadius: '2px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
//                         <iframe src={`${certificate.pdfUrl}#toolbar=0&navpanes=0`} width="100%" height="100%" style={{ border: 'none' }} title="Certificate Preview">
//                             <p>It appears you don't have a PDF plugin for this browser. <a href={certificate.pdfUrl} target="_blank" rel="noopener noreferrer">Click here to download the PDF.</a></p>
//                         </iframe>
//                     </object>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// export const CoursePlayerView: React.FC<CoursePlayerViewProps> = ({
//     selectedCourse,
//     selectedUnit,
//     courseUnits,
//     onBackToOverview,
//     onSelectUnit
// }) => {
//     const navigate = useNavigate();
//     const targetInstanceId = useMemo(() => getCourseInstanceId(selectedCourse), [selectedCourse]);
//     const extCourse = selectedCourse as ExtendedCoursePackage;

//     const targetKeys = useMemo(() => {
//         const keys = new Set<string>();
//         if (selectedCourse?.id) keys.add(selectedCourse.id);
//         if (targetInstanceId) keys.add(targetInstanceId);
//         if (extCourse?.cohortRunId) keys.add(extCourse.cohortRunId);
//         if (extCourse?.timelineId) keys.add(extCourse.timelineId);
//         if (extCourse?.placementId) keys.add(extCourse.placementId);
//         if (Array.isArray(extCourse?.allowedProgressKeys)) extCourse.allowedProgressKeys.forEach(k => k && keys.add(k));
//         return Array.from(keys);
//     }, [selectedCourse, targetInstanceId, extCourse]);

//     const targetKeysString = useMemo(() => targetKeys.join(','), [targetKeys]);
//     const primaryProgressKey = useMemo(() => targetInstanceId || selectedCourse.id, [targetInstanceId, selectedCourse.id]);
//     const checkpointScope = extCourse.checkpointScope || extCourse.checkpointMetadata?.checkpointScope || 'per_lesson';

//     // State
//     const [isLessonCompleted, setIsLessonCompleted] = useState(false);
//     const [isExamMode, setIsExamMode] = useState(() => new URLSearchParams(window.location.search).get('exam') === 'true');
//     const [isQuizMode, setIsQuizMode] = useState(() => new URLSearchParams(window.location.search).get('quiz') === 'true');

//     const currentViewMode = useMemo<'exam' | 'quiz' | 'lesson'>(() => {
//         if (isExamMode) return 'exam';
//         if (isQuizMode) return 'quiz';
//         return 'lesson';
//     }, [isExamMode, isQuizMode]);

//     const setViewMode = (mode: 'exam' | 'quiz' | 'lesson') => {
//         if (mode === 'exam') { setIsQuizMode(false); setIsExamMode(true); }
//         else if (mode === 'quiz') { setIsQuizMode(true); setIsExamMode(false); }
//         else { setIsQuizMode(false); setIsExamMode(false); }
//     };

//     const [formalAssessmentPassed, setFormalAssessmentPassed] = useState(false);
//     const [socraticInput, setSocraticInput] = useState('');
//     const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({});
//     const [hasBegunAttempt, setHasBegunAttempt] = useState(false);
//     const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
//     const [isRecording, setIsRecording] = useState(false);
//     const [isProcessingAudio, setIsProcessingAudio] = useState(false);
//     const [liveTranscript, setLiveTranscript] = useState('');
//     const [audioReviewUrl, setAudioReviewUrl] = useState<string | null>(null);
//     const [isReviewingAudio, setIsReviewingAudio] = useState(false);
//     const [isRecordingPaused, setIsRecordingPaused] = useState(false);
//     const manualSubmitFromReviewRef = useRef<boolean>(false);

//     const [showGateCelebration, setShowGateCelebration] = useState(false);
//     const [attemptHistory, setAttemptHistory] = useState<QuizAttemptDoc[]>([]);
//     const [showAttemptDrawer, setShowAttemptDrawer] = useState(false);
//     const [graderNames, setGraderNames] = useState<Record<string, string>>({});

//     const [currentWatchPct, setCurrentWatchPct] = useState(0);
//     const [currentWatchedMins, setCurrentWatchedMins] = useState(0);
//     const [isBookmarked, setIsBookmarked] = useState(false);
//     const [isBookmarking, setIsBookmarking] = useState(false);
//     const [learnerCertificate, setLearnerCertificate] = useState<CertificateData | null>(null);
//     const [isCertModalOpen, setIsCertModalOpen] = useState(false);
//     const [isSearchingCert, setIsSearchingCert] = useState(false);
//     const [shareCopied, setShareCopied] = useState(false);
//     const [statusModal, setStatusModal] = useState<{ type: StatusType; title: string; message: string } | null>(null);
//     const [resumeTime, setResumeTime] = useState<number | null>(null);
//     const [autoNext, setAutoNext] = useState(() => localStorage.getItem('mlab_autonext') === 'true');
//     const [isPlayerReady, setIsPlayerReady] = useState(false);
//     const [isVideoBuffering, setIsVideoBuffering] = useState(false);
//     const [isPlaying, setIsPlaying] = useState(false);
//     const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
//     const [linkedSubmission, setLinkedSubmission] = useState<any>(null);
//     const [duration, setDuration] = useState(0);

//     const playerRef = useRef<any>(null);
//     const hasSoughtRef = useRef(false);
//     const lastSavedTimeRef = useRef<number>(0);
//     const lastRenderTimeRef = useRef<number>(0);
//     const maxWatchedSecondsRef = useRef<number>(0);
//     const isHydratedRef = useRef<boolean>(false);
//     const debugWipedRef = useRef<boolean>(false);
//     const mediaRecorderRef = useRef<MediaRecorder | null>(null);
//     const audioChunksRef = useRef<Blob[]>([]);
//     const audioBlobRef = useRef<Blob | null>(null);
//     const timerDiscardRef = useRef<boolean>(false);
//     const recognitionRef = useRef<any>(null);
//     const transcriptRef = useRef<string>('');
//     const accumulatedTranscriptRef = useRef<string>('');
//     const ignoreResultRef = useRef<boolean>(false);
//     const autoSubmitRef = useRef<boolean>(false);

//     // Derived Data
//     const enrichedCourseUnits = useMemo(() => {
//         return courseUnits.map(u => (u.id === selectedUnit.id && isLessonCompleted) ? { ...u, isCompleted: true, progressPercent: 100, watchPercentage: 100 } : u);
//     }, [courseUnits, selectedUnit.id, isLessonCompleted]);

//     const currentActiveUnit = useMemo(() => enrichedCourseUnits.find(u => u.id === selectedUnit.id) || selectedUnit, [enrichedCourseUnits, selectedUnit]);
//     const currentUnitIndex = useMemo(() => enrichedCourseUnits.findIndex(u => u.id === currentActiveUnit.id), [enrichedCourseUnits, currentActiveUnit.id]);
//     const nextUnitPreview = useMemo(() => currentUnitIndex >= 0 ? enrichedCourseUnits[currentUnitIndex + 1] : null, [currentUnitIndex, enrichedCourseUnits]);

//     const hasInteractiveCheck = useMemo(() => Boolean(currentActiveUnit?.interactiveCheck?.checkType && currentActiveUnit.interactiveCheck.checkType !== 'none'), [currentActiveUnit]);
//     const activeMcqQuestions = useMemo<MCQQuestion[]>(() => {
//         if (!hasInteractiveCheck || currentActiveUnit.interactiveCheck?.checkType !== 'mcq') return [];
//         const check = currentActiveUnit.interactiveCheck as unknown as InteractiveCheckConfig;
//         if (check.mcqQuestions && Array.isArray(check.mcqQuestions) && check.mcqQuestions.length > 0) return check.mcqQuestions;
//         if (check.mcqQuestion) return [{ id: 'legacy_q1', question: check.mcqQuestion, options: check.mcqOptions || [] }];
//         return [];
//     }, [hasInteractiveCheck, currentActiveUnit.interactiveCheck]);

//     const linkedAssessmentId = useMemo(() => getUnitLinkedAssessmentId(currentActiveUnit), [currentActiveUnit]);
//     const hasLinkedAssessment = useMemo(() => Boolean(linkedAssessmentId), [linkedAssessmentId]);

//     const isQuizPendingReview = useMemo(() => {
//         if (attemptHistory.length === 0) return false;
//         const latestAttempt = attemptHistory[attemptHistory.length - 1];
//         if (currentActiveUnit.interactiveCheck?.checkType === 'oral_defense' && !latestAttempt.gradedBy && !(latestAttempt as any).isGraded) return true;
//         return false;
//     }, [attemptHistory, currentActiveUnit.interactiveCheck?.checkType]);

//     const isQuizPassed = useMemo(() => {
//         if (attemptHistory.length === 0) return false;
//         const latestAttempt = attemptHistory[attemptHistory.length - 1];
//         if (!latestAttempt || latestAttempt.passed !== true) return false;
//         if (currentActiveUnit.interactiveCheck?.checkType === 'oral_defense') {
//             const text = (latestAttempt.submittedCodeOrAnswer || latestAttempt.submittedAnswer || '').trim();
//             if (text.length < 5 || text.includes('Bypass')) return false;
//             if (!latestAttempt.gradedBy && !(latestAttempt as any).isGraded) return false;
//         }
//         return true;
//     }, [attemptHistory, currentActiveUnit.interactiveCheck?.checkType]);

//     const hasFailedAttempts = useMemo(() => attemptHistory.length > 0 && !isQuizPassed, [attemptHistory, isQuizPassed]);
//     const isLatestAudioEmpty = useMemo(() => {
//         if (currentActiveUnit.interactiveCheck?.checkType !== 'oral_defense' || attemptHistory.length === 0) return false;
//         const text = (attemptHistory[attemptHistory.length - 1].submittedCodeOrAnswer || '').trim();
//         return text.length < 5 || text.includes('Bypass');
//     }, [attemptHistory, currentActiveUnit.interactiveCheck?.checkType]);

//     const isExamSubmitted = useMemo(() => ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(String(linkedSubmission?.status || '').toLowerCase()), [linkedSubmission]);
//     const isExamInProgress = useMemo(() => ['started', 'draft', 'in_progress'].includes(String(linkedSubmission?.status || '').toLowerCase()), [linkedSubmission]);

//     const isVideo = useMemo(() => currentActiveUnit.unitType === 'video', [currentActiveUnit.unitType]);
//     const reqProgress = useMemo(() => currentActiveUnit.requiredWatchPercentage || 90, [currentActiveUnit.requiredWatchPercentage]);
//     const isWatchRequirementMet = useMemo(() => isLessonCompleted || (!isVideo) || (currentWatchPct >= reqProgress), [isLessonCompleted, isVideo, currentWatchPct, reqProgress]);

//     const formattedVideoUrl = useMemo(() => {
//         if (!currentActiveUnit?.videoUrl) return '';
//         const ytId = extractYouTubeId(currentActiveUnit.videoUrl.trim());
//         return ytId ? `https://www.youtube.com/watch?v=${ytId}` : currentActiveUnit.videoUrl.trim();
//     }, [currentActiveUnit?.videoUrl]);

//     const unlockedUnitIds = useMemo(() => {
//         const unlocked = new Set<string>();
//         let activeLockEnforced = false;
//         const sorted = [...enrichedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
//         for (const u of sorted) {
//             if (!activeLockEnforced) unlocked.add(u.id);
//             const extUnit = u as ExtendedLearnerUnitProgress;
//             const requiresNextLock = u.isRequiredForNextUnit === true || Boolean(getUnitLinkedAssessmentId(extUnit) && extUnit.unlinkedPolicy === 'hard_gate');
//             const isUnitCompletedLocal = u.isCompleted || (u.id === currentActiveUnit.id && (isLessonCompleted || currentActiveUnit.isCompleted));
//             if (!isUnitCompletedLocal && requiresNextLock) activeLockEnforced = true;
//         }
//         return unlocked;
//     }, [enrichedCourseUnits, currentActiveUnit.id, isLessonCompleted, currentActiveUnit.isCompleted]);

//     const completedCountForLabel = useMemo(() => enrichedCourseUnits.filter(u => u.isCompleted || (u.id === currentActiveUnit.id && isLessonCompleted)).length, [enrichedCourseUnits, currentActiveUnit.id, isLessonCompleted]);
//     const dynamicCompletedCount = useMemo(() => enrichedCourseUnits.reduce((sum, u) => (u.isCompleted || (u.id === currentActiveUnit.id && isLessonCompleted)) ? sum + 1 : sum + (Math.max(0, (u as any).progressPercent ?? (u as any).watchPercentage ?? 0) / 100), 0), [enrichedCourseUnits, currentActiveUnit.id, isLessonCompleted]);
//     const isCourseComplete = useMemo(() => (selectedCourse.totalUnitsCount || enrichedCourseUnits.length) > 0 && completedCountForLabel >= (selectedCourse.totalUnitsCount || enrichedCourseUnits.length), [enrichedCourseUnits, selectedCourse.totalUnitsCount, completedCountForLabel]);

//     const allAttachments = useMemo(() => {
//         const parseAtts = (raw: any): AttachmentItem[] => Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
//         const lessonAtts = parseAtts(currentActiveUnit.attachments || (currentActiveUnit as any).lessonAttachments || (currentActiveUnit as any).files);
//         const courseAtts = parseAtts(extCourse.attachments || extCourse.checkpointMetadata?.attachments || extCourse.checkpointMetadata?.courseAttachments);
//         const uniqueMap = new Map<string, AttachmentItem>();
//         [...lessonAtts, ...courseAtts].forEach((att, index) => {
//             if (att && (att.url || att.name) && (!att.containerId || att.containerId === targetInstanceId || att.containerId === selectedCourse.id)) {
//                 uniqueMap.set(att.id || att.url || att.name || `att_${index}`, att);
//             }
//         });
//         return Array.from(uniqueMap.values());
//     }, [currentActiveUnit, selectedCourse, targetInstanceId, extCourse]);

//     const nestedSyllabus = useMemo(() => {
//         const isSecam = selectedCourse.framework === 'secam';
//         const sortedUnits = [...enrichedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
//         const mainGroupMap = new Map<string, Map<string, LearnerUnitProgress[]>>();
//         const secamMeta = extCourse.secamStructure || extCourse.checkpointMetadata?.secamStructure || [];

//         if (isSecam && Array.isArray(secamMeta) && secamMeta.length > 0) {
//             secamMeta.forEach((sprint) => {
//                 if (sprint.title) {
//                     const subMap = new Map<string, LearnerUnitProgress[]>();
//                     if (Array.isArray(sprint.days)) sprint.days.forEach((day: any) => { if (day.title) subMap.set(day.title, []); });
//                     mainGroupMap.set(sprint.title, subMap);
//                 }
//             });
//         }

//         sortedUnits.forEach((unit) => {
//             const mainKey = isSecam ? (unit.sprintTitle || 'Sprint 1: Core Fundamentals') : (unit.moduleCode ? `${unit.moduleCode} • ${unit.moduleType?.toUpperCase() || 'KNOWLEDGE'}` : 'General Module');
//             const subKey = isSecam ? (unit.dayOrLessonTitle || 'Day 1: Core Lessons') : (unit.topicId || 'General Topics');
//             if (!mainGroupMap.has(mainKey)) mainGroupMap.set(mainKey, new Map());
//             const subMap = mainGroupMap.get(mainKey)!;
//             if (!subMap.has(subKey)) subMap.set(subKey, []);
//             subMap.get(subKey)!.push(unit);
//         });

//         return Array.from(mainGroupMap.entries()).map(([mainTitle, subMap]) => {
//             const subGroups = Array.from(subMap.entries()).map(([subTitle, units]) => {
//                 const sorted = units.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
//                 let dayCheckpoint = null;
//                 if (checkpointScope === 'per_day') {
//                     if (isSecam) dayCheckpoint = (secamMeta.find((s: any) => s.title === mainTitle)?.days?.find((d: any) => d.title === subTitle)?.dayCheckpoint as any) || null;
//                     else if (sorted[0]?.moduleCode) dayCheckpoint = extCourse.checkpointMetadata?.qctoTopicCheckpoints?.[`${sorted[0].moduleCode}_${subTitle}`] || null;
//                 }
//                 return { title: subTitle, units: sorted, isDayComplete: sorted.length > 0 && sorted.every(u => u.isCompleted), dayCheckpoint: dayCheckpoint?.checkType === 'none' ? null : dayCheckpoint };
//             }).filter(sg => sg.units.length > 0);

//             const allGroupUnits = subGroups.flatMap(sg => sg.units);
//             let sprintCheckpoint = null;
//             if (checkpointScope === 'per_sprint') {
//                 if (isSecam) sprintCheckpoint = (secamMeta.find((s: any) => s.title === mainTitle)?.sprintCheckpoint as any) || null;
//                 else if (allGroupUnits[0]?.moduleCode) sprintCheckpoint = extCourse.checkpointMetadata?.qctoModuleCheckpoints?.[allGroupUnits[0].moduleCode] || null;
//             }
//             return { title: mainTitle, subGroups, totalUnits: allGroupUnits.length, completedUnits: allGroupUnits.filter(u => u.isCompleted).length, isComplete: allGroupUnits.length > 0 && allGroupUnits.filter(u => u.isCompleted).length === allGroupUnits.length, sprintCheckpoint: sprintCheckpoint?.checkType === 'none' ? null : sprintCheckpoint };
//         }).filter(mg => mg.subGroups.length > 0);
//     }, [enrichedCourseUnits, selectedCourse, extCourse, checkpointScope]);

//     const getGateAccent = (checkType?: string) => {
//         switch (checkType) {
//             case 'spot_the_bug': return { color: '#f59e0b', bg: '#78350f', border: '#f59e0b', icon: Bug, label: 'Code Repair Check' };
//             case 'oral_defense': return { color: '#a855f7', bg: '#3b0764', border: '#a855f7', icon: Bot, label: 'AI Audio Check' };
//             case 'socratic_dialogue': return { color: '#a78bfa', bg: '#2e1065', border: '#a78bfa', icon: Bot, label: 'AI Dialogue Check' };
//             case 'mcq': return { color: '#4ade80', bg: '#064e3b', border: '#4ade80', icon: HelpCircle, label: 'Interactive Quiz' };
//             default: return { color: '#38bdf8', bg: '#0f172a', border: '#073f4e', icon: Sparkles, label: 'Interactive Check' };
//         }
//     };

//     const gateAccent = getGateAccent(currentActiveUnit.interactiveCheck?.checkType as string | undefined);
//     const GateIcon = gateAccent.icon;
//     const isTimerUrgent = timerRemaining !== null && timerRemaining <= 30;
//     const isQuizActiveOrPaused = hasBegunAttempt && !isQuizPassed && timerRemaining !== null && timerRemaining > 0;
//     const isKnowledgeCheckLocked = !isWatchRequirementMet && !isQuizPassed && !isQuizActiveOrPaused && !hasFailedAttempts;

//     const learningFlowStages = useMemo<Stage[]>(() => {
//         const meta = getAssessmentMeta(selectedCourse, currentActiveUnit);
//         const isHardGate = (currentActiveUnit as ExtendedLearnerUnitProgress).unlinkedPolicy === 'hard_gate';
//         const list: Stage[] = [{ key: 'watch', label: 'Watch', hint: isVideo ? 'Video & lesson content' : 'Reading Guide', icon: 'play', from: '#0284c7', to: '#0369a1', title: 'Learn the lesson material', body: 'Study the content at your own pace. Rewind, pause, or revisit anytime.', cta: isPlaying ? 'Pause lesson' : 'Resume lesson', isLocked: false }];
//         if (hasInteractiveCheck) list.push({ key: 'quiz', label: 'Knowledge check', hint: gateAccent.label || 'Interactive check', icon: 'quiz', from: '#4f46e5', to: '#4338ca', title: hasFailedAttempts ? 'Re-attempt Knowledge Check' : 'In-lesson verification', body: hasFailedAttempts ? 'Review feedback on previous attempt and submit a revised response.' : 'Complete the interactive check to confirm your understanding.', cta: isQuizPassed ? "Check Cleared ✓" : isQuizPendingReview ? "Pending Review ⏳" : isQuizActiveOrPaused ? "Resume Check" : hasFailedAttempts ? "Retry Knowledge Check" : "Launch Knowledge Check", isLocked: !isWatchRequirementMet && !isQuizPassed && !hasFailedAttempts });
//         if (hasLinkedAssessment) list.push({ key: 'exam', label: 'Assessment', hint: meta.shortTitle, icon: 'exam', from: '#7c3aed', to: '#6d28d9', title: 'Formal examination module', body: isExamSubmitted ? 'View your submission record and accreditation audit logs.' : 'Prepare and launch the formal examination workspace.', cta: isExamSubmitted ? 'View Submission' : (isExamInProgress ? 'Resume Exam Overview' : 'Open Exam Overview'), isLocked: (!isWatchRequirementMet || (isHardGate && hasInteractiveCheck && !isQuizPassed)) && !formalAssessmentPassed });
//         return list;
//     }, [isVideo, isPlaying, hasInteractiveCheck, gateAccent.label, hasFailedAttempts, isQuizPassed, isQuizPendingReview, isQuizActiveOrPaused, hasLinkedAssessment, isExamSubmitted, isExamInProgress, isWatchRequirementMet, formalAssessmentPassed, selectedCourse, currentActiveUnit]);

//     const learningFlowStatuses = useMemo<Record<string, StageStatus>>(() => ({ watch: isWatchRequirementMet ? 'done' : 'todo', quiz: isQuizPassed ? 'done' : (isQuizPendingReview ? 'pending' : (hasFailedAttempts ? 'failed' : 'todo')), exam: formalAssessmentPassed ? 'done' : (isExamSubmitted ? 'pending' : 'todo') }), [isWatchRequirementMet, isQuizPassed, isQuizPendingReview, hasFailedAttempts, formalAssessmentPassed, isExamSubmitted]);
//     const learningFlowSelectedIndex = useMemo(() => isQuizMode ? learningFlowStages.findIndex(s => s.key === 'quiz') : isExamMode ? learningFlowStages.findIndex(s => s.key === 'exam') : 0, [isQuizMode, isExamMode, learningFlowStages]);

//     // Functions
//     const handleLearningFlowSelect = (_index: number, stage: Stage) => { if (!stage.isLocked) setViewMode(stage.key as 'lesson' | 'quiz' | 'exam'); };
//     const handleLearningFlowAction = (stage: Stage) => { if (stage.isLocked) return; setViewMode(stage.key as 'lesson' | 'quiz' | 'exam'); if (stage.key === 'watch' && playerRef.current) seekPlayer(maxWatchedSecondsRef.current || 0); };
//     const getPlayerDuration = (): number => playerRef.current ? (typeof playerRef.current.duration === 'number' && isFinite(playerRef.current.duration) && playerRef.current.duration > 0 ? playerRef.current.duration : (typeof playerRef.current.getDuration === 'function' ? playerRef.current.getDuration() : duration || 0)) : duration || 0;
//     const seekPlayer = (seconds: number) => { if (playerRef.current) { try { if (typeof playerRef.current.currentTime !== 'undefined') playerRef.current.currentTime = seconds; else if (typeof playerRef.current.seekTo === 'function') playerRef.current.seekTo(seconds, 'seconds'); } catch (e) { } } };
//     const openPopoutPlayer = () => { if (!currentActiveUnit.videoUrl) return; window.open(extractYouTubeId(currentActiveUnit.videoUrl) ? `https://www.youtube.com/watch?v=${extractYouTubeId(currentActiveUnit.videoUrl)}` : currentActiveUnit.videoUrl, '_blank', `width=960,height=540,top=${(window.innerHeight - 540) / 2},left=${(window.innerWidth - 960) / 2},resizable=yes,scrollbars=yes,status=no`); };

//     const handleLaunchSandbox = () => {
//         const checkConfig = (currentActiveUnit?.interactiveCheck as unknown as InteractiveCheckConfig) || {};
//         window.open(`/sandbox.html?${(checkConfig as any)?.blockId ? `blockId=${(checkConfig as any).blockId}` : `unitId=${currentActiveUnit.id}`}${Number(checkConfig.timeLimitSeconds) > 0 ? `&timer=${Number(checkConfig.timeLimitSeconds)}` : ''}`, '_blank', 'width=1024,height=768');
//     };

//     const toggleAutoNext = () => { setAutoNext(!autoNext); localStorage.setItem('mlab_autonext', String(!autoNext)); };
//     const handleRestartVideo = () => { seekPlayer(0); setResumeTime(null); hasSoughtRef.current = true; setIsPlaying(true); };
//     const handleLaunchAssessment = (e: React.SyntheticEvent | React.MouseEvent | undefined, assessmentId: string) => { if (e) { e.preventDefault(); e.stopPropagation(); } if (assessmentId) navigate(`/assessment-player/${assessmentId}?courseId=${selectedCourse.id}&instanceId=${targetInstanceId || selectedCourse.id}&unitId=${currentActiveUnit.id}`); };
//     const handleSelectUnitWrapper = (unit: LearnerUnitProgress) => { const url = new URL(window.location.href); url.searchParams.delete('quiz'); url.searchParams.delete('exam'); url.searchParams.set('unitId', unit.id); url.searchParams.set('hubView', 'player'); window.history.replaceState({}, '', url.toString()); setIsQuizMode(false); setIsExamMode(false); onSelectUnit(unit); };

//     const generateSyntheticQuizUnit = (
//         title: string,
//         interactiveCheck: Record<string, unknown> | null | undefined,
//         isLocked: boolean
//     ): LearnerUnitProgress => ({
//         id: `synthetic_${title.replace(/\s+/g, '_')}`,
//         containerId: primaryProgressKey,
//         framework: selectedCourse.framework,
//         title: title,
//         unitType: 'reading',
//         estimatedMinutes: Math.max(1, Math.ceil((((interactiveCheck?.timeLimitSeconds as number) || 600) / 60))),
//         isRequired: true,
//         orderIndex: 9999,
//         isCompleted: false,
//         isLocked: isLocked,
//         contentHtml: `<div style="text-align:center; padding: 40px; background:#f8fafc; border: 1px solid #e2e8f0; border-radius: 0px;">
//             <h3 style="color:#0f172a; margin-bottom:12px; font-family: var(--font-heading); text-transform: uppercase;">Assessment Verification Required</h3>
//             <p style="color:#475569; font-size: 0.9rem;">You have reached a critical progression milestone. Please complete the interactive verification check below to finalize your progress for this group.</p>
//         </div>`,
//         interactiveCheck: (interactiveCheck || {}) as unknown as LearnerUnitProgress['interactiveCheck']
//     });

//     const syncProgressToFirebase = async (pct: number, playedSecondsInput?: number, forceMarkCompleted?: boolean) => {
//         const currentUser = auth.currentUser;
//         if (!currentUser || !currentActiveUnit?.id) return;
//         const effectiveSeconds = Math.max(typeof playedSecondsInput === 'number' && !isNaN(playedSecondsInput) ? playedSecondsInput : 0, maxWatchedSecondsRef.current || 0);
//         const safeSecs = Math.floor(effectiveSeconds);
//         const safeMins = safeSecs > 0 ? Number((safeSecs / 60).toFixed(2)) : 0;
//         const safePct = isNaN(pct) ? 0 : Math.min(100, Math.floor(pct));
//         const markCompletedInDb = forceMarkCompleted !== undefined ? forceMarkCompleted : (Boolean(currentActiveUnit.isCompleted) || isLessonCompleted || ((safePct >= (currentActiveUnit.requiredWatchPercentage || 90)) && (hasInteractiveCheck ? isQuizPassed : true) && (hasLinkedAssessment ? formalAssessmentPassed : true)));
//         try {
//             const batch = writeBatch(db);
//             Array.from(new Set([primaryProgressKey, targetInstanceId, selectedCourse.id])).filter(Boolean).forEach(key => {
//                 batch.set(doc(db, 'learner_content_progress', `${currentUser.uid}_${key}_${currentActiveUnit.id}`), { userId: currentUser.uid, containerId: key, unitId: currentActiveUnit.id, watchPct: safePct, watchedMins: safeMins, lastPlayedSeconds: safeSecs, isCompleted: markCompletedInDb, updatedAt: serverTimestamp() }, { merge: true });
//             });
//             await batch.commit();
//         } catch (error) { console.error("[WatchTracking] Save FAILED:", error); }
//     };

//     const handlePlayerReady = () => { setIsPlayerReady(true); setIsVideoBuffering(false); if (resumeTime !== null && !hasSoughtRef.current && playerRef.current) { try { seekPlayer(resumeTime); hasSoughtRef.current = true; } catch (e) { } } };
//     const handleVideoPlay = () => { setIsPlayerReady(true); setIsPlaying(true); if (resumeTime !== null && !hasSoughtRef.current && playerRef.current) { try { seekPlayer(resumeTime); hasSoughtRef.current = true; } catch (e) { } } };
//     const handleVideoPause = () => { setIsPlaying(false); const safeMaxWatched = maxWatchedSecondsRef.current || 0; const currentDuration = getPlayerDuration(); syncProgressToFirebase(currentDuration > 0 ? Math.min(100, Math.floor((safeMaxWatched / currentDuration) * 100)) : currentWatchPct, safeMaxWatched); };
//     const handleVideoEnded = () => {
//         setIsPlaying(false);
//         const realDuration = getPlayerDuration() || maxWatchedSecondsRef.current || 60;
//         if (!isLessonCompleted && !currentActiveUnit.isCompleted && realDuration > 0 && maxWatchedSecondsRef.current < realDuration * 0.9) { seekPlayer(maxWatchedSecondsRef.current); return; }
//         setIsLessonCompleted(true); setCurrentWatchPct(100); maxWatchedSecondsRef.current = realDuration;
//         if (!hasInteractiveCheck && !hasLinkedAssessment) {
//             handleCompleteVerificationCheck();
//             if (autoNext && nextUnitPreview) { setIsAutoTransitioning(true); setTimeout(() => { setIsAutoTransitioning(false); handleSelectUnitWrapper(nextUnitPreview); }, 3000); }
//         } else { syncProgressToFirebase(100, realDuration); }
//     };

//     const handlePlayerTimeUpdate = (e: any) => {
//         if (!isHydratedRef.current) return;
//         let playedSeconds = typeof e === 'number' && !isNaN(e) ? e : (e?.playedSeconds && typeof e.playedSeconds === 'number' ? e.playedSeconds : (e?.target?.currentTime && typeof e.target.currentTime === 'number' ? e.target.currentTime : (playerRef.current && typeof playerRef.current.currentTime === 'number' ? playerRef.current.currentTime : (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' ? playerRef.current.getCurrentTime() : 0))));
//         let currentDuration = duration <= 0 ? getPlayerDuration() : duration;
//         if (currentDuration > 0 && duration <= 0) setDuration(currentDuration);
//         const safeMaxWatched = typeof maxWatchedSecondsRef.current === 'number' && !isNaN(maxWatchedSecondsRef.current) ? maxWatchedSecondsRef.current : 0;
//         if (playedSeconds <= 0 && safeMaxWatched > 0) return;
//         if (resumeTime !== null && !hasSoughtRef.current) { if (playedSeconds < resumeTime - 2) { seekPlayer(resumeTime); return; } else { hasSoughtRef.current = true; } }
//         if (currentActiveUnit.isCompleted || isLessonCompleted) {
//             if (playedSeconds > safeMaxWatched) { maxWatchedSecondsRef.current = playedSeconds; const now = Date.now(); if (now - lastSavedTimeRef.current > 3000) { lastSavedTimeRef.current = now; syncProgressToFirebase(100, playedSeconds); } }
//             return;
//         }
//         if (playedSeconds > safeMaxWatched + 3.0) { seekPlayer(safeMaxWatched); return; }
//         if (playedSeconds > safeMaxWatched) maxWatchedSecondsRef.current = playedSeconds;
//         const effectiveMaxWatched = maxWatchedSecondsRef.current || 0;
//         if (currentDuration <= 0) return;
//         const pct = Math.min(100, Math.floor((effectiveMaxWatched / currentDuration) * 100));
//         const now = Date.now();
//         if (now - lastRenderTimeRef.current > 1000) { lastRenderTimeRef.current = now; setCurrentWatchPct(pct); setCurrentWatchedMins(Number((effectiveMaxWatched / 60).toFixed(2))); }
//         const justCompleted = pct >= (currentActiveUnit.requiredWatchPercentage || 90) && !isLessonCompleted;
//         if (now - lastSavedTimeRef.current > 3000 || justCompleted) { lastSavedTimeRef.current = now; if (justCompleted) setIsLessonCompleted(true); syncProgressToFirebase(pct, effectiveMaxWatched); }
//     };

//     const logQuizAttempt = async (checkType: string, passed: boolean, answerText: string, failureReason?: string, audioUrl?: string, score?: number) => {
//         const currentUser = auth.currentUser;
//         if (!currentUser || !currentActiveUnit?.id) return;
//         try {
//             await addDoc(collection(db, 'learner_quiz_attempts'), { userId: currentUser.uid, unitId: currentActiveUnit.id, containerId: targetInstanceId || selectedCourse.id, checkType, passed, submittedCodeOrAnswer: answerText, audioUrl: audioUrl || null, recordingUrl: audioUrl || null, failureReason: failureReason || null, attemptNumber: attemptHistory.length + 1, score: score !== undefined ? score : null, attemptedAt: serverTimestamp() });
//         } catch (err) { console.error('❌ [logQuizAttempt] Failed:', err); }
//     };

//     const handleCompleteVerificationCheck = async (bypassText = 'Submitted Answer (Bypass)', audioUrlInput?: string, explicitPassed?: boolean, explicitScore?: number) => {
//         const checkType = currentActiveUnit.interactiveCheck?.checkType || 'socratic_dialogue';
//         const isOral = checkType === 'oral_defense';
//         const initialPassedState = explicitPassed !== undefined ? explicitPassed : !isOral;
//         const initialFailureReason = isOral ? 'Awaiting Assessor Marking' : (!initialPassedState ? 'Did not meet minimum passing score.' : undefined);
//         if (initialPassedState) setShowGateCelebration(true);
//         await logQuizAttempt(checkType, initialPassedState, socraticInput || bypassText, initialFailureReason, audioUrlInput, explicitScore);
//         setHasBegunAttempt(false); setTimerRemaining(null); setMcqAnswers({}); setSocraticInput('');
//         if (initialPassedState) {
//             if (!hasLinkedAssessment || formalAssessmentPassed) { setIsLessonCompleted(true); syncProgressToFirebase(currentWatchPct || 100, maxWatchedSecondsRef.current, true); }
//             else { syncProgressToFirebase(currentWatchPct || 100, maxWatchedSecondsRef.current, false); }
//         } else { setStatusModal({ type: 'error', title: 'Knowledge Check Failed', message: `You scored ${explicitScore !== undefined ? explicitScore : 0}%. You need at least 80% to pass. Please review the material and try again.` }); }
//     };

//     const handleNextLesson = async (e?: React.SyntheticEvent, forceProceed = false) => {
//         if (e) { e.preventDefault(); e.stopPropagation(); }
//         if (!isWatchRequirementMet) { setStatusModal({ type: 'warning', title: 'Watch Requirement Not Met', message: `Please watch at least ${reqProgress}% of the video to proceed.` }); return; }
//         if (!forceProceed && hasInteractiveCheck && !isQuizPassed && !isQuizPendingReview) { setIsQuizMode(true); return; }
//         if (hasLinkedAssessment && !formalAssessmentPassed && !isExamSubmitted) { setIsQuizMode(false); setIsExamMode(true); return; }
//         await syncProgressToFirebase(currentWatchPct || 100, maxWatchedSecondsRef.current, false);
//         if (!nextUnitPreview) { onBackToOverview(); return; }
//         if ((currentActiveUnit as ExtendedLearnerUnitProgress).unlinkedPolicy === 'hard_gate' && !isQuizPassed && !formalAssessmentPassed && !forceProceed) { setStatusModal({ type: 'warning', title: 'Hard Gate Requirement', message: 'This lesson requires passing the knowledge check before unlocking the next module.' }); return; }
//         handleSelectUnitWrapper(nextUnitPreview);
//     };

//     const handleStartOralDefense = async () => {
//         if (isQuizPassed || isQuizPendingReview) return;
//         try {
//             const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//             const mediaRecorder = new MediaRecorder(stream);
//             mediaRecorderRef.current = mediaRecorder;
//             audioChunksRef.current = [];
//             localStorage.removeItem(`mlab_transcript_${currentActiveUnit.id}`);
//             setLiveTranscript(''); transcriptRef.current = ''; accumulatedTranscriptRef.current = ''; ignoreResultRef.current = false; setAudioReviewUrl(null); setIsReviewingAudio(false); setIsRecordingPaused(false); autoSubmitRef.current = false; manualSubmitFromReviewRef.current = false;

//             const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
//             if (SpeechRecognition) {
//                 try {
//                     const recognition = new SpeechRecognition();
//                     recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
//                     let hasStarted = false;
//                     const silentFailTimeout = setTimeout(() => { if (!hasStarted && !transcriptRef.current) { transcriptRef.current = "[Live transcription unavailable in this browser. Your audio is still being recorded securely.]"; setLiveTranscript(transcriptRef.current); } }, 4000);
//                     recognition.onstart = () => { hasStarted = true; clearTimeout(silentFailTimeout); };
//                     recognition.onresult = (event: any) => {
//                         if (ignoreResultRef.current) return;
//                         let interimTranscript = '';
//                         for (let i = event.resultIndex; i < event.results.length; ++i) { if (event.results[i].isFinal) accumulatedTranscriptRef.current = (accumulatedTranscriptRef.current + " " + event.results[i][0].transcript).trim(); else interimTranscript += event.results[i][0].transcript; }
//                         const fullText = (accumulatedTranscriptRef.current + " " + interimTranscript).replace(/\s+/g, ' ').trim();
//                         transcriptRef.current = fullText; setLiveTranscript(fullText); localStorage.setItem(`mlab_transcript_${currentActiveUnit.id}`, fullText);
//                     };
//                     recognition.onerror = (event: any) => { hasStarted = true; clearTimeout(silentFailTimeout); if ((event.error === 'network' || event.error === 'not-allowed') && !transcriptRef.current) { transcriptRef.current = `[Live transcription unavailable (${event.error}). Your audio is still being recorded securely.]`; setLiveTranscript(transcriptRef.current); } };
//                     recognitionRef.current = recognition; recognition.start();
//                 } catch (e) { console.error("🎙️ [Speech API] Failed to initialize:", e); }
//             } else { transcriptRef.current = "Browser does not natively support live transcription. Your audio is still being recorded."; setLiveTranscript(transcriptRef.current); }

//             mediaRecorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data); };
//             mediaRecorder.onstop = async () => {
//                 stream.getTracks().forEach(track => track.stop());
//                 if (timerDiscardRef.current) return;
//                 const mimeType = mediaRecorder.mimeType || ((window as any).MediaRecorder?.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : 'audio/webm');
//                 const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
//                 audioBlobRef.current = audioBlob;
//                 if (manualSubmitFromReviewRef.current) { manualSubmitFromReviewRef.current = false; await processAndSubmitAudio(audioBlob); }
//                 else { setAudioReviewUrl(URL.createObjectURL(audioBlob)); setIsReviewingAudio(true); }
//             };

//             setHasBegunAttempt(true);
//             setTimerRemaining((Number((currentActiveUnit.interactiveCheck as unknown as InteractiveCheckConfig)?.timeLimitSeconds) || 0) > 0 ? Number((currentActiveUnit.interactiveCheck as unknown as InteractiveCheckConfig)?.timeLimitSeconds) : null);
//             mediaRecorder.start(500); setIsRecording(true); timerDiscardRef.current = false;
//         } catch (err) { setStatusModal({ type: 'error', title: 'Microphone Access Required', message: 'Please allow microphone permissions in your browser to complete this audio assessment.' }); }
//     };

//     const processAndSubmitAudio = async (blob: Blob) => {
//         setIsProcessingAudio(true);
//         let uploadedAudioUrl = '';
//         try {
//             if (blob && auth.currentUser && storage) {
//                 const ext = (blob.type || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';
//                 const fileRef = ref(storage, `oral_defenses/${auth.currentUser.uid}/${currentActiveUnit.id}_${Date.now()}.${ext}`);
//                 await uploadBytes(fileRef, blob);
//                 uploadedAudioUrl = await getDownloadURL(fileRef);
//             }
//         } catch (uploadErr) { console.error('❌ [Storage] Failed to upload audio recording:', uploadErr); }
//         finally { setIsProcessingAudio(false); await handleCompleteVerificationCheck(transcriptRef.current || "[No speech detected in audio file. Please re-record.]", uploadedAudioUrl); }
//     };

//     const handlePauseAndReview = () => {
//         if (mediaRecorderRef.current && isRecording && mediaRecorderRef.current.state === 'recording') {
//             ignoreResultRef.current = true; mediaRecorderRef.current.requestData(); mediaRecorderRef.current.pause();
//             if (recognitionRef.current) recognitionRef.current.stop();
//             let currentText = transcriptRef.current.trim();
//             if (currentText.length > 0 && !/[.!?]$/.test(currentText)) currentText += ".";
//             accumulatedTranscriptRef.current = currentText; transcriptRef.current = currentText; setLiveTranscript(currentText); localStorage.setItem(`mlab_transcript_${currentActiveUnit.id}`, currentText);
//             setIsRecordingPaused(true);
//             setTimeout(() => { const mimeType = mediaRecorderRef.current?.mimeType || ((window as any).MediaRecorder?.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : 'audio/webm'); setAudioReviewUrl(URL.createObjectURL(new Blob(audioChunksRef.current, { type: mimeType }))); setIsReviewingAudio(true); }, 150);
//         }
//     };

//     const handleResumeRecording = () => {
//         if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
//             ignoreResultRef.current = false; mediaRecorderRef.current.resume(); accumulatedTranscriptRef.current = transcriptRef.current;
//             try { if (recognitionRef.current) recognitionRef.current.start(); } catch (e) { }
//             setIsRecordingPaused(false); setIsReviewingAudio(false);
//         }
//     };

//     const handleConfirmAudioSubmission = async () => {
//         setIsReviewingAudio(false); setHasBegunAttempt(false); setTimerRemaining(null); manualSubmitFromReviewRef.current = true;
//         if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
//         else if (audioBlobRef.current) await processAndSubmitAudio(audioBlobRef.current);
//         else handleCompleteVerificationCheck(transcriptRef.current || "[No speech detected in audio file. Please re-record.]");
//     };

//     const handleDiscardAndRerecord = () => {
//         setIsReviewingAudio(false); setIsRecordingPaused(false); setAudioReviewUrl(null); setLiveTranscript(''); transcriptRef.current = ''; accumulatedTranscriptRef.current = ''; localStorage.removeItem(`mlab_transcript_${currentActiveUnit.id}`);
//         if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { timerDiscardRef.current = true; mediaRecorderRef.current.stop(); mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop()); }
//         handleStartOralDefense();
//     };

//     const handleBeginGenericAttempt = () => {
//         if (isQuizPassed || isQuizPendingReview) return;
//         setHasBegunAttempt(true);
//         setTimerRemaining((Number((currentActiveUnit.interactiveCheck as unknown as InteractiveCheckConfig)?.timeLimitSeconds) || 0) > 0 ? Number((currentActiveUnit.interactiveCheck as unknown as InteractiveCheckConfig)?.timeLimitSeconds) : null);
//     };

//     const handleToggleBookmark = async () => {
//         const currentUser = auth.currentUser;
//         if (!currentUser || !currentActiveUnit?.id) return;
//         setIsBookmarking(true);
//         try {
//             const bookmarkRef = doc(db, 'learnerBookmarks', `${currentUser.uid}_${currentActiveUnit.id}`);
//             if (isBookmarked) { await deleteDoc(bookmarkRef); setIsBookmarked(false); }
//             else { await setDoc(bookmarkRef, { userId: currentUser.uid, courseId: selectedCourse.id, containerId: primaryProgressKey, unitId: currentActiveUnit.id, unitTitle: currentActiveUnit.title, createdAt: serverTimestamp() }); setIsBookmarked(true); }
//         } catch (error) { console.error('[FirebaseBookmarks] Error toggling bookmark:', error); }
//         finally { setIsBookmarking(false); }
//     };

//     const handleShare = async () => {
//         const shareData = { title: currentActiveUnit.title, text: `Check out "${currentActiveUnit.title}" on ${selectedCourse.title}!`, url: window.location.href };
//         if (navigator.share && navigator.canShare && navigator.canShare(shareData)) { try { await navigator.share(shareData); return; } catch (err) { return; } }
//         try { await navigator.clipboard.writeText(window.location.href); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); } catch (err) { }
//     };

//     const renderSubmittedContent = (att: QuizAttemptDoc) => {
//         const rawText = att.submittedCodeOrAnswer || att.submittedAnswer || '';
//         if (!rawText) return <span style={{ color: '#64748b', fontStyle: 'italic' }}>No submission content recorded</span>;
//         if (att.checkType === 'mcq' || rawText.includes('Responses: {')) {
//             try {
//                 const jsonStart = rawText.indexOf('{'), jsonEnd = rawText.lastIndexOf('}');
//                 if (jsonStart !== -1 && jsonEnd !== -1) {
//                     const parsedAnswers = JSON.parse(rawText.substring(jsonStart, jsonEnd + 1)) as Record<string, string>;
//                     if (activeMcqQuestions.length > 0) return (
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'sans-serif' }}>
//                             {activeMcqQuestions.map((q, idx) => {
//                                 const selOpt = q.options.find(o => o.id === parsedAnswers[q.id || idx]);
//                                 return (
//                                     <div key={q.id || idx} style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '8px 10px', borderRadius: '3px' }}>
//                                         <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.75rem', marginBottom: '4px' }}>{idx + 1}. {q.question}</div>
//                                         <div style={{ fontSize: '0.72rem', color: selOpt ? (selOpt.isCorrect ? '#4ade80' : '#fca5a5') : '#94a3b8', fontWeight: 600 }}>
//                                             Selected: {selOpt ? `"${selOpt.text}"` : 'No Answer Selected'} {selOpt && (selOpt.isCorrect ? ' ✓' : ' ✗')}
//                                         </div>
//                                     </div>
//                                 );
//                             })}
//                         </div>
//                     );
//                 }
//             } catch (e) { }
//         }
//         return <pre style={{ margin: 0, fontSize: '0.72rem', color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{rawText}</pre>;
//     };

//     const renderSubmittedAssessmentCard = () => {
//         if (!linkedSubmission) return null;
//         const examMeta = getAssessmentMeta(selectedCourse, currentActiveUnit);
//         const subStatus = String(linkedSubmission.status || 'submitted').toLowerCase();
//         const isCompetent = ['C', 'HC', '3', '4'].includes(String(linkedSubmission.competency || '').toUpperCase());

//         const config = (() => {
//             switch (subStatus) {
//                 case 'submitted': return { label: 'Awaiting Facilitator Pre-Check', badgeBg: '#e0f2fe', badgeColor: '#0369a1', border: '#7dd3fc' };
//                 case 'facilitator_reviewed': return { label: 'Pre-Marked — Awaiting Assessor Grading', badgeBg: '#fef3c7', badgeColor: '#b45309', border: '#fcd34d' };
//                 case 'graded': return { label: 'Graded — Awaiting Moderator Quality Assurance (IQA)', badgeBg: '#f3e8ff', badgeColor: '#6b21a8', border: '#e9d5ff' };
//                 case 'moderated': return { label: isCompetent ? 'IQA Endorsed — Competent (C)' : 'IQA Endorsed — Not Yet Competent (NYC)', badgeBg: isCompetent ? '#dcfce7' : '#fee2e2', badgeColor: isCompetent ? '#15803d' : '#b91c1c', border: isCompetent ? '#86efac' : '#fca5a5' };
//                 case 'appealed': return { label: 'Formal Appeal Lodged & Under Review', badgeBg: '#fff7ed', badgeColor: '#c2410c', border: '#fdba74' };
//                 default: return { label: 'Submitted for Review', badgeBg: '#f1f5f9', badgeColor: '#475569', border: '#cbd5e1' };
//             }
//         })();

//         return (
//             <div id="formal_assessment_card" className="qcto-card animate-fade-in" style={{ padding: '24px', borderLeft: `6px solid ${config.badgeColor}`, background: '#f8fafc' }}>
//                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
//                     <div>
//                         <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: config.badgeColor, fontWeight: 800, letterSpacing: '0.05em', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <ShieldCheck size={14} /> {examMeta.lifecycleTitle}
//                         </span>
//                         <h3 style={{ margin: '4px 0 2px 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                             {currentActiveUnit.title} — Submission Record
//                         </h3>
//                     </div>
//                     <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
//                         <span style={{ fontSize: '0.75rem', background: config.badgeBg, color: config.badgeColor, fontWeight: 800, padding: '6px 14px', border: `1px solid ${config.border}`, display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                             {config.label}
//                         </span>
//                         <button type="button" onClick={() => setViewMode('lesson')} className="lfm-btn lfm-btn--ghost" style={{ color: '#94a3b8', border: '1px solid #cbd5e1' }}>
//                             <ArrowLeft size={14} /> Exit to Lesson
//                         </button>
//                     </div>
//                 </div>
//                 {/* Status progression grid can be inserted here as per original design */}
//                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
//                     <button type="button" onClick={(e) => handleLaunchAssessment(e, linkedAssessmentId!)} className="lfm-btn lfm-btn--primary" style={{ borderRadius: '0px' }}>
//                         <Eye size={14} /> View Submission &amp; Feedback Script
//                     </button>
//                 </div>
//             </div>
//         );
//     };

//     // Effects
//     useEffect(() => {
//         const url = new URL(window.location.href);
//         if (isQuizMode) url.searchParams.set('quiz', 'true'); else url.searchParams.delete('quiz');
//         if (isExamMode) url.searchParams.set('exam', 'true'); else url.searchParams.delete('exam');
//         window.history.replaceState({}, '', url.toString());
//     }, [isQuizMode, isExamMode, currentActiveUnit?.id]);

//     useEffect(() => {
//         const params = new URLSearchParams(window.location.search);
//         setIsQuizMode(params.get('quiz') === 'true' || Boolean(currentActiveUnit?.unitType !== 'video' && currentActiveUnit?.unitType !== 'reading' && hasInteractiveCheck));
//         setIsExamMode(params.get('exam') === 'true');
//         setShowAttemptDrawer(false);
//         debugWipedRef.current = false;
//     }, [currentActiveUnit?.id, hasLinkedAssessment, hasInteractiveCheck]);

//     useEffect(() => {
//         if (!currentActiveUnit?.id) { setAttemptHistory([]); return; }
//         let unsubAttempts: (() => void) | null = null;
//         const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
//             if (unsubAttempts) { unsubAttempts(); unsubAttempts = null; }
//             if (!currentUser) { setAttemptHistory([]); return; }
//             try {
//                 unsubAttempts = onSnapshot(query(collection(db, 'learner_quiz_attempts'), where('userId', '==', currentUser.uid), where('unitId', '==', currentActiveUnit.id)), (snap) => {
//                     if (debugWipedRef.current) return;
//                     setAttemptHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as QuizAttemptDoc)).sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0)));
//                 });
//             } catch (e) { }
//         });
//         return () => { unsubAuth(); if (unsubAttempts) unsubAttempts(); };
//     }, [currentActiveUnit?.id]);

//     useEffect(() => {
//         const uidsToFetch = Array.from(new Set(attemptHistory.map(a => a.gradedBy).filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0 && !graderNames[uid])));
//         if (uidsToFetch.length === 0) return;
//         Promise.all(uidsToFetch.map(async (uid) => {
//             try {
//                 const userSnap = await getDoc(doc(db, 'users', uid));
//                 if (userSnap.exists()) setGraderNames(prev => ({ ...prev, [uid]: userSnap.data().displayName || userSnap.data().fullName || uid }));
//                 else setGraderNames(prev => ({ ...prev, [uid]: uid }));
//             } catch (e) { setGraderNames(prev => ({ ...prev, [uid]: uid })); }
//         }));
//     }, [attemptHistory]);

//     useEffect(() => {
//         const currentUser = auth.currentUser;
//         if (!currentUser || !linkedAssessmentId) { setLinkedSubmission(null); return; }
//         const unsub = onSnapshot(query(collection(db, 'learner_submissions'), where('assessmentId', '==', linkedAssessmentId), where('authUid', '==', currentUser.uid)), (snap) => {
//             if (debugWipedRef.current) return;
//             setLinkedSubmission(snap.empty ? null : snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]);
//         });
//         return () => unsub();
//     }, [linkedAssessmentId]);

//     useEffect(() => {
//         if (hasLinkedAssessment) {
//             setFormalAssessmentPassed(attemptHistory.some(a => a.checkType === 'formal_assessment' && a.passed === true) || (['graded', 'moderated', 'appealed'].includes(String(linkedSubmission?.status || '').toLowerCase()) && ['c', 'hc', '3', '4'].includes(String(linkedSubmission?.competency || '').toLowerCase())));
//         } else setFormalAssessmentPassed(true);
//     }, [attemptHistory, hasLinkedAssessment, linkedSubmission]);

//     useEffect(() => {
//         const handleSandboxMessage = (event: MessageEvent) => {
//             if (event.data?.type === 'SANDBOX_COMPLETED' && event.data.unitId === currentActiveUnit.id) {
//                 setShowGateCelebration(true); setIsLessonCompleted(true); syncProgressToFirebase(100, maxWatchedSecondsRef.current, true);
//             }
//         };
//         window.addEventListener('message', handleSandboxMessage);
//         return () => window.removeEventListener('message', handleSandboxMessage);
//     }, [currentActiveUnit.id]);

//     useEffect(() => {
//         setIsPlayerReady(false); setIsVideoBuffering(false); setIsPlaying(false);
//         const timer = setTimeout(() => setIsPlayerReady(true), 3000);
//         return () => clearTimeout(timer);
//     }, [currentActiveUnit?.id, currentActiveUnit?.videoUrl]);

//     useEffect(() => {
//         if (resumeTime !== null && resumeTime > 0 && isPlayerReady && !hasSoughtRef.current && playerRef.current) {
//             try { seekPlayer(resumeTime); hasSoughtRef.current = true; } catch (e) { }
//         }
//     }, [resumeTime, isPlayerReady]);

//     useEffect(() => {
//         if (!isQuizMode || !hasBegunAttempt || isQuizPassed || timerRemaining === null) return;
//         const interval = setInterval(() => { setTimerRemaining(prev => prev === null ? null : (prev <= 1 ? 0 : prev - 1)); }, 1000);
//         return () => clearInterval(interval);
//     }, [isQuizMode, hasBegunAttempt, isQuizPassed, timerRemaining]);

//     useEffect(() => {
//         if (timerRemaining === 0 && !isQuizPassed && hasBegunAttempt && isQuizMode) {
//             const checkType = currentActiveUnit.interactiveCheck?.checkType || 'unknown';
//             if (checkType === 'oral_defense') {
//                 setIsRecording(false); setIsRecordingPaused(false); setHasBegunAttempt(false); setTimerRemaining(null);
//                 if (recognitionRef.current) recognitionRef.current.stop();
//                 manualSubmitFromReviewRef.current = true;
//                 if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
//                 else if (audioBlobRef.current) processAndSubmitAudio(audioBlobRef.current);
//                 else handleCompleteVerificationCheck(transcriptRef.current || "[Timeout - No speech detected]", "");
//             } else if (checkType === 'mcq') {
//                 let correctCount = 0;
//                 activeMcqQuestions.forEach((q: MCQQuestion, idx: number) => { if (q.options.find((o: MCQOption) => o.id === mcqAnswers[q.id || idx])?.isCorrect) correctCount++; });
//                 const score = activeMcqQuestions.length > 0 ? Math.round((correctCount / activeMcqQuestions.length) * 100) : 0;
//                 handleCompleteVerificationCheck(`MCQ Timeout Submitted. Score: ${score}% (${correctCount}/${activeMcqQuestions.length} correct). Responses: ${JSON.stringify(mcqAnswers)}`, undefined, score >= 80, score);
//                 setIsRecording(false); setIsRecordingPaused(false); setIsQuizMode(false); setHasBegunAttempt(false); setTimerRemaining(null);
//             } else {
//                 timerDiscardRef.current = true;
//                 logQuizAttempt(checkType, false, 'Timeout (Auto-Failed)', 'Time limit exceeded.');
//                 setStatusModal({ type: 'error', title: 'Time Expired ⏱', message: 'You ran out of time for this knowledge check. A failed attempt has been recorded.' });
//                 if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
//                 setIsRecording(false); setIsRecordingPaused(false); setIsQuizMode(false); setHasBegunAttempt(false); setTimerRemaining(null);
//             }
//         }
//     }, [timerRemaining, isQuizPassed, hasBegunAttempt, isQuizMode, currentActiveUnit.interactiveCheck?.checkType, isRecording, mcqAnswers, activeMcqQuestions]);

//     useEffect(() => {
//         setHasBegunAttempt(false); setTimerRemaining(null); setIsReviewingAudio(false); setAudioReviewUrl(null);
//         if (mediaRecorderRef.current && isRecording) {
//             timerDiscardRef.current = true; mediaRecorderRef.current.stop(); mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
//             if (recognitionRef.current) recognitionRef.current.stop();
//             setIsRecording(false);
//         }
//     }, [currentActiveUnit?.id]);

//     useEffect(() => {
//         const extUnit = currentActiveUnit as ExtendedLearnerUnitProgress;
//         setIsLessonCompleted(currentActiveUnit.isCompleted || false);
//         setCurrentWatchPct(extUnit.progressPercent || 0);
//         setResumeTime(null); hasSoughtRef.current = false; setIsPlayerReady(false); setIsVideoBuffering(false); setIsBookmarked(false); setShareCopied(false); setIsPlaying(false); setIsAutoTransitioning(false); isHydratedRef.current = false; setMcqAnswers({}); setSocraticInput('');

//         const fetchLearnerData = async () => {
//             const currentUser = auth.currentUser;
//             if (!currentUser || !currentActiveUnit?.id) { isHydratedRef.current = true; return; }
//             let cleanSavedSeconds = 0, savedPct = 0, completed = false;
//             const validTargetKeys = targetKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
//             try {
//                 if (validTargetKeys.length > 0) {
//                     const progressSnap = await getDocs(query(collection(db, 'learner_content_progress'), where('userId', '==', currentUser.uid), where('unitId', '==', currentActiveUnit.id), where('containerId', 'in', validTargetKeys)));
//                     if (!progressSnap.empty) progressSnap.docs.forEach(docSnap => {
//                         const d = docSnap.data();
//                         if (d.isCompleted) completed = true;
//                         if ((Number(d.watchPct) || 0) > savedPct) savedPct = Number(d.watchPct) || 0;
//                         if ((Number(d.lastPlayedSeconds) || 0) > cleanSavedSeconds) cleanSavedSeconds = Number(d.lastPlayedSeconds) || 0;
//                     });
//                 }
//                 if (!completed && primaryProgressKey) {
//                     const directSnap = await getDoc(doc(db, 'learner_content_progress', `${currentUser.uid}_${primaryProgressKey}_${currentActiveUnit.id}`));
//                     if (directSnap.exists()) {
//                         const d = directSnap.data();
//                         if (d.isCompleted) completed = true;
//                         if ((Number(d.watchPct) || 0) > savedPct) savedPct = Number(d.watchPct) || 0;
//                         if ((Number(d.lastPlayedSeconds) || 0) > cleanSavedSeconds) cleanSavedSeconds = Number(d.lastPlayedSeconds) || 0;
//                     }
//                 }
//             } catch (err) { }
//             if (cleanSavedSeconds > 86400) cleanSavedSeconds = 0;
//             if (completed) {
//                 maxWatchedSecondsRef.current = cleanSavedSeconds; setIsLessonCompleted(true); setCurrentWatchPct(100); setCurrentWatchedMins(Number((cleanSavedSeconds / 60).toFixed(2))); setResumeTime(null); hasSoughtRef.current = true;
//             } else if (cleanSavedSeconds > 3) {
//                 setResumeTime(cleanSavedSeconds); maxWatchedSecondsRef.current = cleanSavedSeconds; setCurrentWatchPct(savedPct); setCurrentWatchedMins(Number((cleanSavedSeconds / 60).toFixed(2)));
//                 if (savedPct >= (currentActiveUnit.requiredWatchPercentage || 90)) setIsLessonCompleted(true);
//             } else { maxWatchedSecondsRef.current = 0; setCurrentWatchPct(savedPct); setCurrentWatchedMins(0); setResumeTime(null); hasSoughtRef.current = true; }
//             try { setIsBookmarked((await getDoc(doc(db, 'learnerBookmarks', `${currentUser.uid}_${currentActiveUnit.id}`))).exists()); } catch (err) { setIsBookmarked(false); } finally { isHydratedRef.current = true; }
//         };
//         fetchLearnerData();
//     }, [currentActiveUnit.id, primaryProgressKey, targetKeysString, hasInteractiveCheck]);

//     useEffect(() => {
//         const handleBeforeUnload = () => {
//             const maxSecs = maxWatchedSecondsRef.current;
//             if (maxSecs <= 0) return;
//             const pct = duration > 0 ? Math.min(100, Math.floor((maxSecs / duration) * 100)) : 0;
//             if (pct <= 0) return;
//             syncProgressToFirebase(pct, maxSecs);
//         };
//         window.addEventListener('beforeunload', handleBeforeUnload);
//         return () => { handleBeforeUnload(); window.removeEventListener('beforeunload', handleBeforeUnload); };
//     }, [duration, currentActiveUnit.id]);

//     useEffect(() => {
//         const currentUser = auth.currentUser;
//         if (isCourseComplete && currentUser && !learnerCertificate) {
//             setIsSearchingCert(true);
//             const timeoutId = setTimeout(async () => {
//                 if (targetKeys.length === 0) { setIsSearchingCert(false); return; }
//                 try {
//                     const snap = await getDocs(query(collection(db, 'ad_hoc_certificates'), where('learnerId', '==', currentUser.uid), where('courseId', 'in', targetKeys)));
//                     if (!snap.empty) setLearnerCertificate({ id: snap.docs[0].id, ...snap.docs[0].data() } as CertificateData);
//                 } catch (error) { } finally { setIsSearchingCert(false); }
//             }, 1500);
//             return () => clearTimeout(timeoutId);
//         }
//     }, [isCourseComplete, selectedCourse.id, learnerCertificate, targetKeysString]);

//     return (
//         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
//             {isCertModalOpen && learnerCertificate && <CertificateModal certificate={learnerCertificate} onClose={() => setIsCertModalOpen(false)} />}
//             {statusModal && createPortal(<StatusModal type={statusModal.type} title={statusModal.title} message={statusModal.message} onClose={() => setStatusModal(null)} confirmText="Got It" />, document.body)}

//             {showGateCelebration && (
//                 <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 50, background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-blue)', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
//                     <PartyPopper size={18} />
//                     <div>
//                         <div style={{ fontWeight: 800, fontSize: '0.82rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Milestone Cleared!</div>
//                         <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>Assessment requirement verified</div>
//                     </div>
//                 </div>
//             )}

//             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
//                 <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
//                     <button type="button" onClick={onBackToOverview} className="lfm-btn lfm-btn--ghost"><ArrowLeft size={15} /> Back to Course Overview</button>
//                     <button type="button" onClick={handleToggleBookmark} disabled={isBookmarking} className="lfm-btn lfm-btn--ghost" title="Bookmark this lesson" style={{ color: isBookmarked ? '#0284c7' : 'inherit' }}><Bookmark size={15} fill={isBookmarked ? 'currentColor' : 'none'} /> {isBookmarked ? 'Bookmarked' : 'Bookmark'}</button>
//                     <button type="button" onClick={handleShare} className="lfm-btn lfm-btn--ghost" title="Share lesson link"><Share2 size={15} /> {shareCopied ? 'Link Copied!' : 'Share'}</button>
//                 </div>
//                 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
//                     {(selectedCourse.tags || []).map(tag => (
//                         <span key={tag} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-blue)', background: 'var(--mlab-light-blue)', border: '1px solid #bae6fd', padding: '4px 10px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>#{tag.replace(/\s+/g, '').toLowerCase()}</span>
//                     ))}
//                 </div>
//             </div>

//             <div style={{ display: 'grid', gridTemplateColumns: currentViewMode !== 'lesson' ? '1fr' : '1fr 320px', gap: '20px', alignItems: 'start' }}>
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
//                     <div className="qcto-card" style={{ padding: '12px 16px', background: '#0f172a', border: '1px solid #1e293b' }}>
//                         <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', marginBottom: '8px' }}>Lesson Completion Roadmap</div>
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isWatchRequirementMet ? 1 : 0.8 }}>
//                                 <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isWatchRequirementMet ? '#15803d' : '#0284c7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{isWatchRequirementMet ? <Check size={12} /> : '1'}</div>
//                                 <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isWatchRequirementMet ? '#86efac' : '#38bdf8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{isVideo ? 'Study Video' : 'Read Guide'}</span>
//                             </div>
//                             {hasInteractiveCheck && (
//                                 <>
//                                     <ArrowRight size={12} color="#475569" />
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (isQuizMode || isWatchRequirementMet) ? 1 : 0.4 }}>
//                                         <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isQuizPassed ? '#15803d' : isQuizMode ? '#0284c7' : isWatchRequirementMet ? '#f59e0b' : '#334155', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{isQuizPassed ? <Check size={12} /> : '2'}</div>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isQuizPassed ? '#86efac' : isQuizMode ? '#38bdf8' : isWatchRequirementMet ? '#fcd34d' : '#94a3b8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>Knowledge Check {isQuizPassed && <Check size={11} color="#86efac" />}</span>
//                                     </div>
//                                 </>
//                             )}
//                             {hasLinkedAssessment && (
//                                 <>
//                                     <ArrowRight size={12} color="#475569" />
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (!isWatchRequirementMet || (hasInteractiveCheck && !isQuizPassed)) ? 0.4 : formalAssessmentPassed ? 1 : 0.9 }}>
//                                         <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: formalAssessmentPassed ? '#15803d' : (isWatchRequirementMet && (!hasInteractiveCheck || isQuizPassed)) ? '#9333ea' : '#334155', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{formalAssessmentPassed ? <Check size={12} /> : hasInteractiveCheck ? '3' : '2'}</div>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 800, color: formalAssessmentPassed ? '#86efac' : (isWatchRequirementMet && (!hasInteractiveCheck || isQuizPassed)) ? '#c084fc' : '#94a3b8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{getAssessmentMeta(selectedCourse, currentActiveUnit).shortTitle}</span>
//                                     </div>
//                                 </>
//                             )}
//                         </div>
//                     </div>

//                     {currentViewMode === 'exam' && (isExamSubmitted ? renderSubmittedAssessmentCard() : (
//                         <div className="qcto-card animate-fade-in" style={{ padding: '28px', borderLeft: '6px solid #7c3aed', background: '#0f172a', color: 'white' }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #1e293b', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
//                                 <div>
//                                     <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#c084fc', fontWeight: 800, fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '6px' }}><Award size={14} /> {getAssessmentMeta(selectedCourse, currentActiveUnit).overviewTitle}</span>
//                                     <h2 style={{ margin: '4px 0 0 0', fontSize: '1.3rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{currentActiveUnit.title} — Formal Assessment</h2>
//                                     <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Linked Assessment ID: <code style={{ background: '#1e293b', padding: '2px 6px', color: '#38bdf8', fontFamily: 'monospace' }}>{linkedAssessmentId || 'N/A'}</code></div>
//                                 </div>
//                                 <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
//                                     <button type="button" onClick={() => setViewMode('lesson')} className="lfm-btn lfm-btn--ghost" style={{ color: '#94a3b8', border: '1px solid #334155' }}><ArrowLeft size={14} /> Exit Overview &amp; Return to Lesson</button>
//                                     {formalAssessmentPassed && nextUnitPreview && <button type="button" onClick={(e) => handleNextLesson(e, true)} className="lfm-btn lfm-btn--green" style={{ borderRadius: '0px', padding: '6px 14px', fontSize: '0.75rem' }}>Next Lesson <ChevronRight size={14} /></button>}
//                                 </div>
//                             </div>
//                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
//                                 <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '4px', border: '1px solid #334155' }}><div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>Assessment Type</div><div style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 800, marginTop: '2px' }}>{getAssessmentMeta(selectedCourse, currentActiveUnit).title}</div></div>
//                                 <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '4px', border: '1px solid #334155' }}><div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>Progression Policy</div><div style={{ fontSize: '0.9rem', color: '#c084fc', fontWeight: 800, marginTop: '2px' }}>Required Milestone</div></div>
//                                 <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '4px', border: '1px solid #334155' }}><div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>Status</div><div style={{ fontSize: '0.9rem', color: formalAssessmentPassed ? '#4ade80' : (isExamInProgress ? '#38bdf8' : '#fbbf24'), fontWeight: 800, marginTop: '2px' }}>{formalAssessmentPassed ? 'Cleared ✓' : (isExamInProgress ? 'In Progress (Draft)' : 'Pending Submission')}</div></div>
//                             </div>
//                             <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '18px', marginBottom: '24px', borderRadius: '4px' }}>
//                                 <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f8fafc', marginBottom: '8px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={16} color="#c084fc" /> Examination Guidelines &amp; Instructions</div>
//                                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.6 }}>You are about to launch the dedicated, full-screen examination workspace for <strong>{currentActiveUnit.title}</strong>. Ensure you have a stable internet connection and sufficient time before starting. Once you click <strong>"{isExamInProgress ? 'Resume Formal Exam Module' : 'Launch Formal Exam Module'}"</strong> below, you will be navigated to the secure player.</p>
//                             </div>
//                             <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', borderTop: '1px solid #1e293b', paddingTop: '20px', gap: '12px' }}>
//                                 <button type="button" onClick={() => setViewMode('lesson')} className="lfm-btn lfm-btn--ghost" style={{ color: '#cbd5e1' }}>Cancel</button>
//                                 <button type="button" onClick={(e) => { if (linkedAssessmentId) handleLaunchAssessment(e, linkedAssessmentId); }} className="lfm-btn" style={{ background: '#7c3aed', color: 'white', borderRadius: '0px', padding: '12px 28px', fontWeight: 800, fontSize: '0.85rem' }}><Award size={16} /> {isExamInProgress ? 'Resume Formal Exam Module' : 'Launch Formal Exam Module'}</button>
//                             </div>
//                         </div>
//                     ))}

//                     {currentViewMode === 'quiz' && hasInteractiveCheck && (
//                         <div className="qcto-card" style={{ padding: '24px 28px', borderLeft: `6px solid ${gateAccent.color}` }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
//                                 <div>
//                                     <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: gateAccent.color, fontWeight: 800, letterSpacing: '0.05em', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                         <GateIcon size={14} /> Stage 2: {gateAccent.label}
//                                         {isQuizPassed && <span style={{ fontSize: '0.58rem', background: '#052e16', color: '#4ade80', border: '1px solid #166534', padding: '1px 6px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Check size={9} /> Quiz Cleared</span>}
//                                         <button type="button" onClick={() => setShowAttemptDrawer(prev => !prev)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '2px 8px', fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}><History size={10} /> Attempt #{isQuizPassed ? attemptHistory.length : attemptHistory.length + 1} ({showAttemptDrawer ? 'Hide History ▲' : 'View History ▾'})</button>
//                                     </span>
//                                     <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{currentActiveUnit.title}</h2>
//                                     <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Please complete the interactive check below to finalize your knowledge check.</div>
//                                 </div>
//                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
//                                     {timerRemaining !== null && hasBegunAttempt && !isQuizPassed && <span style={{ fontSize: '0.7rem', fontWeight: 800, color: isTimerUrgent ? '#f87171' : '#38bdf8', background: isTimerUrgent ? '#450a0a' : '#0f172a', border: `1px solid ${isTimerUrgent ? '#991b1b' : '#1e293b'}`, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', letterSpacing: '0.05em' }}><Timer size={13} className={isTimerUrgent ? 'animate-pulse' : ''} /> {isTimerUrgent ? 'URGENT: ' : 'Timer: '}{formatTime(timerRemaining)}</span>}
//                                     {isVideo && <button type="button" onClick={() => setViewMode('lesson')} className="lfm-btn lfm-btn--ghost" style={{ color: 'var(--mlab-blue)' }}><ArrowLeft size={14} /> Review Video Stream</button>}
//                                 </div>
//                             </div>

//                             {showAttemptDrawer && (
//                                 <div className="animate-fade-in" style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #1e293b', background: '#020617', padding: '16px', border: '1px solid #334155' }}>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><History size={13} /> Submission History Log ({attemptHistory.length} Recorded Attempts)</span>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                             <button type="button" onClick={() => setShowAttemptDrawer(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={14} /></button>
//                                         </div>
//                                     </div>
//                                     {attemptHistory.length === 0 ? <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic', padding: '10px 0', textAlign: 'center' }}>No previous attempts recorded yet. This is your first attempt.</div> : (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
//                                             {attemptHistory.map((att, idx) => {
//                                                 const attemptTime = att.attemptedAt?.toDate ? att.attemptedAt.toDate().toLocaleString() : (typeof att.attemptedAt === 'string' ? att.attemptedAt : 'Recorded');
//                                                 const isOral = att.checkType === 'oral_defense' || currentActiveUnit.interactiveCheck?.checkType === 'oral_defense';
//                                                 const isGraded = Boolean(att.gradedBy || (att as any).isGraded);
//                                                 const isPending = isOral && !isGraded;
//                                                 const isPassed = att.passed === true && !isPending;
//                                                 const hasFeedback = Boolean(att.feedback || att.aiFeedback || att.overallFeedback || att.facilitatorFeedback || att.feedbackHtml);
//                                                 return (
//                                                     <div key={att.id || idx} style={{ background: '#0f172a', border: `1px solid ${isPassed ? '#166534' : isPending ? '#b45309' : '#991b1b'}`, borderLeft: `4px solid ${isPassed ? '#16a34a' : isPending ? '#f59e0b' : '#f87171'}`, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                 <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-heading)' }}>Attempt #{idx + 1}</span>
//                                                                 <span style={{ fontSize: '0.62rem', background: isPassed ? '#052e16' : isPending ? '#451a03' : '#450a0a', color: isPassed ? '#4ade80' : isPending ? '#fbbf24' : '#fca5a5', border: `1px solid ${isPassed ? '#166534' : isPending ? '#b45309' : '#991b1b'}`, padding: '1px 6px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>{isPassed ? <Check size={10} /> : isPending ? <Timer size={10} /> : <X size={10} />} {isPassed ? 'PASSED & VERIFIED' : isPending ? 'PENDING REVIEW ⏳' : 'FAILED / RETRY REQUIRED'}</span>
//                                                                 {att.score !== undefined && att.score !== null && <span style={{ fontSize: '0.65rem', background: '#1e293b', color: '#38bdf8', padding: '1px 6px', fontWeight: 800, border: '1px solid #334155' }}>Score: {att.score}%</span>}
//                                                             </div>
//                                                             <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{attemptTime}</span>
//                                                         </div>
//                                                         {att.failureReason && <div style={{ fontSize: '0.72rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>⚠️ {att.failureReason}</div>}
//                                                         <div><div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Code size={10} /> Submitted Response / Code Preview:</div><div style={{ background: '#020617', color: '#38bdf8', padding: '8px', maxHeight: '160px', overflowY: 'auto', border: '1px solid #1e293b' }}>{renderSubmittedContent(att)}</div></div>
//                                                         {hasFeedback && (
//                                                             <div style={{ background: '#020617', border: '1px solid #1e293b', padding: '10px 12px', borderRadius: '2px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                                                 <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}><Sparkles size={11} /> Assessment Feedback &amp; Review Notes:</div>
//                                                                 {att.facilitatorFeedback && <div style={{ fontSize: '0.75rem', color: '#e2e8f0', lineHeight: 1.4 }}><strong style={{ color: '#38bdf8' }}>Facilitator Note:</strong> {att.facilitatorFeedback}</div>}
//                                                                 {(att.aiFeedback || att.feedback || att.overallFeedback) && <div style={{ fontSize: '0.75rem', color: '#cbd5e1', lineHeight: 1.4, fontStyle: 'italic' }}>{att.aiFeedback || att.feedback || att.overallFeedback}</div>}
//                                                                 {att.feedbackHtml && <div style={{ fontSize: '0.75rem', color: '#cbd5e1', lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: att.feedbackHtml }} />}
//                                                                 {att.gradedBy && <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>Graded by: <code style={{ color: '#94a3b8' }}>{graderNames[att.gradedBy] || att.gradedBy}</code></div>}
//                                                             </div>
//                                                         )}
//                                                     </div>
//                                                 );
//                                             })}
//                                         </div>
//                                     )}
//                                 </div>
//                             )}

//                             {!isQuizPassed && !hasBegunAttempt && !isReviewingAudio ? (
//                                 <div style={{ textAlign: 'center', padding: '40px', background: '#0f172a', border: `1px dashed #334155`, marginTop: '20px' }}>
//                                     {isQuizPendingReview ? (
//                                         <div className="animate-fade-in" style={{ background: '#1e1b4b', border: '1px solid #6366f1', padding: '24px', borderRadius: '4px', color: 'white', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
//                                             <div style={{ width: '48px', height: '48px', background: '#312e81', color: '#818cf8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}><Timer size={24} /></div>
//                                             <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#c7d2fe' }}>Submission Under Assessor Review ⏳</h3>
//                                             <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>Your response has been recorded and submitted for grading. Re-recording is locked while an assessor reviews your submission. If your submission is found Not Yet Competent (NYC), a retry option will unlock automatically with assessor notes.</p>
//                                         </div>
//                                     ) : (
//                                         <>
//                                             {isLatestAudioEmpty && <div className="animate-fade-in" style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5', padding: '12px', borderRadius: '4px', marginBottom: '24px', fontSize: '0.85rem', textAlign: 'left' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}><AlertTriangle size={14} /> Empty Transcript Detected</div>Your audio was submitted, but the AI could not detect any speech. Please try again.</div>}
//                                             {hasFailedAttempts && <div className="animate-fade-in" style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5', padding: '12px 16px', borderRadius: '4px', marginBottom: '24px', textAlign: 'left' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)', fontSize: '0.8rem' }}><AlertTriangle size={15} /> Previous Attempt (#{attemptHistory.length}) Requires Re-submission</div>{attemptHistory[attemptHistory.length - 1]?.facilitatorFeedback && <div style={{ fontSize: '0.8rem', color: '#fecaca', marginTop: '6px', lineHeight: 1.4 }}><strong>Facilitator Note:</strong> "{attemptHistory[attemptHistory.length - 1].facilitatorFeedback}"</div>}<div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '6px' }}>Review your previous response, then click below to start Attempt #{attemptHistory.length + 1}.</div></div>}
//                                             <h3 style={{ color: 'white', marginBottom: '16px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{attemptHistory.length > 0 ? `Ready for Attempt #${attemptHistory.length + 1}?` : 'Ready to begin your attempt?'}</h3>
//                                             <p style={{ color: '#94a3b8', marginBottom: '24px', fontSize: '0.85rem' }}>{currentActiveUnit.interactiveCheck?.checkType === 'oral_defense' ? 'To begin this assessment, please grant microphone permissions. The prompt and timer will be revealed once recording starts.' : 'Once you begin, the timer will start and you must complete the check.'}</p>
//                                             <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
//                                                 <button type="button" onClick={currentActiveUnit.interactiveCheck?.checkType === 'oral_defense' ? handleStartOralDefense : handleBeginGenericAttempt} className="lfm-btn lfm-btn--primary" disabled={isKnowledgeCheckLocked || isQuizPendingReview || isQuizPassed} style={{ padding: '10px 24px', fontSize: '0.9rem', background: gateAccent.bg || '#b45309', borderRadius: '0px', opacity: (isKnowledgeCheckLocked || isQuizPendingReview || isQuizPassed) ? 0.5 : 1, cursor: (isKnowledgeCheckLocked || isQuizPendingReview || isQuizPassed) ? 'not-allowed' : 'pointer' }}>{currentActiveUnit.interactiveCheck?.checkType === 'oral_defense' ? '🎙️ Grant Access & Begin Attempt' : (attemptHistory.length > 0 ? `Begin Attempt #${attemptHistory.length + 1}` : 'Begin Attempt')}</button>
//                                                 {attemptHistory.length > 0 && (hasLinkedAssessment && !formalAssessmentPassed ? <button type="button" onClick={() => setViewMode('exam')} className="lfm-btn" style={{ background: '#7c3aed', color: 'white', borderRadius: '0px', padding: '10px 20px', fontSize: '0.85rem' }}>Proceed to Formal Exam <ChevronRight size={14} /></button> : nextUnitPreview ? <button type="button" onClick={(e) => handleNextLesson(e, true)} className="lfm-btn lfm-btn--ghost" style={{ border: '1px solid #334155', color: '#38bdf8', padding: '10px 20px', fontSize: '0.85rem' }}>Continue to Next Lesson <ChevronRight size={14} /></button> : null)}
//                                             </div>
//                                         </>
//                                     )}
//                                 </div>
//                             ) : (
//                                 <>
//                                     {currentActiveUnit.interactiveCheck?.checkType === 'oral_defense' && (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
//                                             {(hasBegunAttempt || isQuizPassed || isReviewingAudio) && (
//                                                 <div className="animate-fade-in" style={{ background: '#1e293b', border: '1px solid #334155', padding: '16px', borderRadius: '4px' }}>
//                                                     <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#a855f7', marginBottom: '8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Bot size={14} /> AI Audio Transcript Prompt</div>
//                                                     <div style={{ fontSize: '0.9rem', color: '#f8fafc', lineHeight: 1.5 }}>"{currentActiveUnit.interactiveCheck?.defenseQuestion || currentActiveUnit.interactiveCheck?.instructions}"</div>
//                                                 </div>
//                                             )}
//                                             <div style={{ padding: '24px', border: '1px dashed #334155', textAlign: 'center', color: '#64748b', fontSize: '0.8rem', background: '#020617' }}>
//                                                 {isQuizPassed ? (
//                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}><div style={{ color: '#4ade80', fontWeight: 800, textAlign: 'center' }}>✓ You have successfully completed this audio assessment.</div></div>
//                                                 ) : isReviewingAudio ? (
//                                                     <div className="animate-fade-in" style={{ textAlign: 'left' }}>
//                                                         <div style={{ marginBottom: '16px', color: '#cbd5e1', fontWeight: 600, textAlign: 'center' }}>Recording complete. Review your audio and transcript below before submitting.</div>
//                                                         {audioReviewUrl && <div style={{ marginBottom: '16px' }}><audio controls src={audioReviewUrl} style={{ width: '100%', height: '40px', outline: 'none' }} /></div>}
//                                                         <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
//                                                             <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)' }}><Mic size={12} /> Captured Live Transcript</div>
//                                                             <div style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.6, fontStyle: 'italic' }}>{liveTranscript ? `"${liveTranscript}"` : "No speech detected in this recording."}</div>
//                                                         </div>
//                                                         <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
//                                                             <button type="button" onClick={handleDiscardAndRerecord} className="lfm-btn lfm-btn--ghost" style={{ border: '1px solid #334155', color: '#94a3b8', borderRadius: '0px' }}><RotateCcw size={14} /> Discard &amp; Re-Record</button>
//                                                             {timerRemaining !== null && timerRemaining > 0 && <button type="button" onClick={handleResumeRecording} className="lfm-btn" style={{ background: '#0284c7', color: 'white', borderRadius: '0px' }}><Mic size={14} /> Resume Recording</button>}
//                                                             <button type="button" onClick={handleConfirmAudioSubmission} className="lfm-btn lfm-btn--green" style={{ borderRadius: '0px' }}>{isProcessingAudio ? <Loader2 size={14} className="lfm-spin" /> : <Send size={14} />} Submit Final Audio</button>
//                                                         </div>
//                                                     </div>
//                                                 ) : (
//                                                     <div className="animate-fade-in">
//                                                         <div style={{ marginBottom: '16px' }}>Recording in progress. Speak your answer clearly.</div>
//                                                         {isRecording && !isRecordingPaused && (
//                                                             <div style={{ background: '#020617', border: '1px solid #1e293b', padding: '16px', borderRadius: '4px', marginBottom: '16px', textAlign: 'left' }}>
//                                                                 <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', animation: 'pulse 2s infinite', fontFamily: 'var(--font-heading)' }}><div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }} /> Listening...</div>
//                                                                 <div style={{ fontSize: '0.85rem', color: '#f8fafc', lineHeight: 1.6, fontStyle: 'italic', minHeight: '40px' }}>{liveTranscript ? `"${liveTranscript}"` : "Waiting for speech..."}</div>
//                                                             </div>
//                                                         )}
//                                                         {isProcessingAudio ? <button type="button" disabled className="lfm-btn" style={{ background: '#4c1d95', color: 'white', borderRadius: '4px', opacity: 0.8 }}><Loader2 size={16} className="lfm-spin" /> Processing Audio...</button> : isRecording && !isRecordingPaused ? <button type="button" onClick={handlePauseAndReview} className="lfm-btn" style={{ background: '#f59e0b', color: 'white', borderRadius: '0px' }}><Pause size={14} fill="currentColor" /> Pause &amp; Review</button> : null}
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     )}

//                                     {currentActiveUnit.interactiveCheck?.checkType === 'spot_the_bug' && (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1' }}>{currentActiveUnit.interactiveCheck?.instructions}</p>
//                                                 <button type="button" onClick={handleLaunchSandbox} disabled={isQuizPassed} className="lfm-btn lfm-btn--green" style={{ borderRadius: '0px', padding: '4px 12px', fontSize: '0.75rem', opacity: isQuizPassed ? 0.5 : 1 }}><ExternalLink size={12} style={{ marginRight: '4px' }} /> Launch IDE Sandbox</button>
//                                             </div>
//                                             <div style={{ padding: '20px', border: '1px dashed #334155', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>{isQuizPassed ? 'Code repaired and verified.' : 'Click "Launch IDE Sandbox" to open the code editor in a standalone window. Once you fix the bug and submit your code in the IDE window, this check will automatically mark as complete.'}</div>
//                                             {!isQuizPassed && <button type="button" onClick={() => handleCompleteVerificationCheck()} className="lfm-btn lfm-btn--primary" style={{ alignSelf: 'flex-start', borderRadius: '0px', marginTop: '8px' }}><Check size={13} /> Bypass &amp; Mark Knowledge Check Submitted</button>}
//                                         </div>
//                                     )}

//                                     {currentActiveUnit.interactiveCheck?.checkType === 'socratic_dialogue' && (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
//                                             <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px', fontSize: '0.82rem', color: '#fbbf24' }}>🤖 <strong>AI Persona Prompt:</strong> "{currentActiveUnit.interactiveCheck?.instructions}"</div>
//                                             <textarea rows={3} placeholder={isQuizPassed ? "Answer submitted." : "Type your explanation to the AI assessor..."} value={socraticInput} onChange={e => setSocraticInput(e.target.value)} style={{ width: '100%', fontSize: '0.82rem', padding: '10px', border: '1px solid #334155', background: '#020617', color: 'white', borderRadius: '0px', outline: 'none' }} disabled={isQuizPassed} />
//                                             {!isQuizPassed && <button type="button" onClick={() => handleCompleteVerificationCheck()} className="lfm-btn lfm-btn--primary" style={{ alignSelf: 'flex-start', borderRadius: '0px' }}><Send size={13} /> Send Answer to AI Assessor</button>}
//                                         </div>
//                                     )}

//                                     {currentActiveUnit.interactiveCheck?.checkType === 'mcq' && (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
//                                             <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '16px', borderRadius: '4px' }}>
//                                                 <div style={{ fontSize: '0.85rem', color: '#4ade80', fontWeight: 800, marginBottom: '16px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><HelpCircle size={16} /> Multiple Choice Quiz Bank</div>
//                                                 {activeMcqQuestions.map((q: MCQQuestion, qIdx: number) => (
//                                                     <div key={q.id || qIdx} style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: qIdx < (activeMcqQuestions.length - 1) ? '1px dashed #334155' : 'none' }}>
//                                                         <div style={{ fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700, marginBottom: '12px', lineHeight: 1.5 }}><span style={{ color: '#38bdf8', marginRight: '6px' }}>{qIdx + 1}.</span> {q.question}</div>
//                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                                             {(q.options || []).map((opt: MCQOption, oIdx: number) => {
//                                                                 const isSelected = mcqAnswers[q.id || qIdx] === opt.id;
//                                                                 return (
//                                                                     <label key={opt.id || oIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: isSelected ? 'rgba(56, 189, 248, 0.1)' : '#0f172a', border: `1px solid ${isSelected ? '#38bdf8' : '#334155'}`, borderRadius: '4px', cursor: isQuizPassed ? 'default' : 'pointer', transition: 'all 0.2s ease', color: '#e2e8f0', fontSize: '0.85rem' }}>
//                                                                         <input type="radio" name={`mcq_${q.id || qIdx}`} value={opt.id} checked={isSelected} disabled={isQuizPassed} onChange={() => { if (!isQuizPassed) setMcqAnswers(prev => ({ ...prev, [q.id || qIdx]: opt.id })); }} style={{ margin: 0, cursor: isQuizPassed ? 'default' : 'pointer' }} />
//                                                                         <span style={{ flex: 1 }}>{opt.text}</span>
//                                                                     </label>
//                                                                 );
//                                                             })}
//                                                         </div>
//                                                     </div>
//                                                 ))}
//                                             </div>
//                                             {!isQuizPassed && (
//                                                 <button type="button" onClick={() => {
//                                                     const questions = activeMcqQuestions;
//                                                     if (Object.keys(mcqAnswers).length < questions.length) { setStatusModal({ type: 'warning', title: 'Incomplete Quiz', message: 'Please answer all questions before submitting.' }); return; }
//                                                     let correctCount = 0; const responseDetails: string[] = [];
//                                                     questions.forEach((q: MCQQuestion, idx: number) => {
//                                                         const selectedOpt = q.options.find((o: MCQOption) => o.id === mcqAnswers[q.id || idx]);
//                                                         if (selectedOpt?.isCorrect) correctCount++;
//                                                         responseDetails.push(`Q${idx + 1}: ${q.question} | Selected: "${selectedOpt ? selectedOpt.text : 'None'}" [${selectedOpt?.isCorrect ? 'Correct ✓' : 'Incorrect ✗'}]`);
//                                                     });
//                                                     const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
//                                                     handleCompleteVerificationCheck(`MCQ Submitted. Score: ${score}% (${correctCount}/${questions.length} correct).\n${responseDetails.join('\n')}\nResponses: ${JSON.stringify(mcqAnswers)}`, undefined, score >= 80, score);
//                                                 }} className="lfm-btn lfm-btn--primary" style={{ alignSelf: 'flex-start', borderRadius: '0px' }}><Send size={13} /> Submit Quiz Answers</button>
//                                             )}
//                                         </div>
//                                     )}
//                                 </>
//                             )}

//                             <div style={{ marginTop: '20px', borderTop: '1px solid #1e293b', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
//                                 <div>{hasFailedAttempts && !isQuizPassed && <span style={{ fontSize: '0.72rem', color: '#fca5a5' }}>⚠️ You can re-attempt this check or continue to the next stage below.</span>}</div>
//                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
//                                     {(isQuizPassed || attemptHistory.length > 0) && (hasLinkedAssessment && !formalAssessmentPassed ? <button type="button" onClick={() => setViewMode('exam')} className="lfm-btn" style={{ background: '#7c3aed', color: 'white', borderRadius: '0px' }}>{isQuizPassed ? 'Proceed to Formal Exam' : 'Continue to Formal Exam'} <ChevronRight size={14} /></button> : nextUnitPreview ? <button type="button" onClick={(e) => handleNextLesson(e, true)} className="lfm-btn lfm-btn--green" style={{ borderRadius: '0px' }}>{isQuizPassed ? 'Proceed to Next Lesson' : 'Continue to Next Lesson'} <ChevronRight size={14} /></button> : <button type="button" onClick={onBackToOverview} className="lfm-btn lfm-btn--ghost" style={{ color: '#cbd5e1', border: '1px solid #334155' }}>Return to Course Overview</button>)}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {currentViewMode === 'lesson' && (
//                         <>
//                             {currentActiveUnit.unitType === 'video' && (
//                                 <div className="qcto-card">
//                                     <div className="qcto-hdr" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                         <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <Tv size={14} /> Video Stream
//                                             {isWatchRequirementMet && <span style={{ background: '#15803d', color: 'white', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}><CheckCircle2 size={9} /> Completed</span>}
//                                             {resumeTime && resumeTime > 0 && <span style={{ background: '#334155', color: '#fcd34d', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}><RotateCcw size={9} /> Resumed at {formatTime(resumeTime)}</span>}
//                                             {currentWatchedMins > 0 && <span style={{ fontSize: '0.62rem', color: '#94a3b8', marginLeft: '6px' }}>({currentWatchedMins}m watched)</span>}
//                                         </span>
//                                         <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                             <button type="button" onClick={toggleAutoNext} style={{ background: autoNext ? '#0284c7' : 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'white', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }} title="Automatically open next lesson upon video completion">Auto-Next: {autoNext ? 'ON' : 'OFF'}</button>
//                                             {currentActiveUnit.videoUrl && (
//                                                 <>
//                                                     {(resumeTime || isLessonCompleted || currentActiveUnit.isCompleted || maxWatchedSecondsRef.current > 0) && <button type="button" onClick={handleRestartVideo} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'white', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }} title="Restart video from the beginning"><RotateCcw size={10} /> Restart Video</button>}
//                                                     <button type="button" onClick={openPopoutPlayer} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'white', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }} title="Launch in independent window if video fails to load"><ExternalLink size={10} /> Popout</button>
//                                                 </>
//                                             )}
//                                             <span>{currentActiveUnit.estimatedMinutes} MINS</span>
//                                         </span>
//                                     </div>
//                                     <div style={{ background: '#020617', width: '100%', aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
//                                         {formattedVideoUrl ? (
//                                             <>
//                                                 {(!isPlayerReady || isVideoBuffering) && (
//                                                     <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', color: 'white', pointerEvents: 'none' }}>
//                                                         <div style={{ position: 'relative', width: '68px', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                                                             <div className="lfm-spin" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid rgba(56, 189, 248, 0.15)', borderTopColor: '#38bdf8' }} />
//                                                             <Tv size={26} color="#38bdf8" />
//                                                         </div>
//                                                         <div style={{ textAlign: 'center' }}>
//                                                             <div style={{ fontSize: '0.78rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}><Loader2 size={13} className="lfm-spin" /> {isVideoBuffering ? 'Buffering Stream...' : 'Initializing Video Stream...'}</div>
//                                                             <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>Preparing media playback for {currentActiveUnit.title}</div>
//                                                         </div>
//                                                     </div>
//                                                 )}
//                                                 <MediaController style={{ width: "100%", aspectRatio: "16 / 9", position: 'absolute', top: 0, left: 0, background: '#000' }}>
//                                                     <ReactPlayer ref={playerRef} slot="media" src={formattedVideoUrl} playing={isPlaying} controls={false} width="100%" height="100%" style={{ width: "100%", height: "100%", "--controls": "none" } as React.CSSProperties} config={{ youtube: { playerVars: { disablekb: 1, modestbranding: 1, rel: 0, controls: 0 } } }} onReady={handlePlayerReady} onStart={handleVideoPlay} onPlay={handleVideoPlay} onPause={handleVideoPause} onEnded={handleVideoEnded} onProgress={(e) => handlePlayerTimeUpdate(e)} onTimeUpdate={(e) => handlePlayerTimeUpdate(e)} onError={(err: any) => { setIsPlayerReady(true); setIsVideoBuffering(false); }} onBuffer={() => setIsVideoBuffering(true)} onBufferEnd={() => setIsVideoBuffering(false)} />
//                                                     <MediaControlBar>
//                                                         <MediaPlayButton />
//                                                         <MediaSeekBackwardButton seekOffset={10} />
//                                                         <MediaSeekForwardButton seekOffset={10} />
//                                                         <MediaTimeRange />
//                                                         <MediaTimeDisplay showDuration />
//                                                         <MediaMuteButton />
//                                                         <MediaVolumeRange />
//                                                         <MediaPlaybackRateButton />
//                                                         <MediaFullscreenButton />
//                                                     </MediaControlBar>
//                                                 </MediaController>
//                                                 {isAutoTransitioning && nextUnitPreview && (
//                                                     <div className="animate-fade-in" style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'grayscale(100%) blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', textAlign: 'center' }}>
//                                                         <Loader2 size={42} className="lfm-spin" style={{ color: '#cbd5e1', marginBottom: '16px' }} />
//                                                         <div style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f8fafc' }}>Navigating to next video...</div>
//                                                         <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '8px', maxWidth: '80%', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}><Tv size={14} /> {nextUnitPreview.title}</div>
//                                                     </div>
//                                                 )}
//                                             </>
//                                         ) : (
//                                             <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#94a3b8', padding: '0 20px' }}>
//                                                 <Tv size={48} style={{ opacity: 0.4, marginBottom: '8px' }} />
//                                                 <p style={{ fontSize: '0.85rem', margin: 0 }}>Video Stream Unavailable</p>
//                                             </div>
//                                         )}
//                                     </div>
//                                 </div>
//                             )}

//                             {currentActiveUnit.unitType === 'reading' && (
//                                 <div className="qcto-card">
//                                     <div className="qcto-hdr" style={{ fontSize: '0.75rem' }}>
//                                         <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} /> Reading Guide</span>
//                                         <span>{currentActiveUnit.estimatedMinutes} MINS READ</span>
//                                     </div>
//                                     <div style={{ padding: '24px', color: '#0f172a' }}>
//                                         <div className="ql-editor" style={{ padding: 0, minHeight: 'auto', fontSize: '0.9rem', lineHeight: 1.6, color: '#0f172a' }}>
//                                             <div dangerouslySetInnerHTML={{ __html: currentActiveUnit.contentHtml || '<p>Reading content loading...</p>' }} />
//                                         </div>
//                                     </div>
//                                 </div>
//                             )}

//                             <div style={{ marginBottom: '16px' }}>
//                                 <LearningFlow stages={learningFlowStages} statuses={learningFlowStatuses} selected={learningFlowSelectedIndex} onSelect={handleLearningFlowSelect} onAction={handleLearningFlowAction} />
//                             </div>

//                             <LessonInteractionTabs
//                                 currentActiveUnit={currentActiveUnit as ExtendedLearnerUnitProgress}
//                                 selectedCourse={selectedCourse}
//                                 targetInstanceId={targetInstanceId}
//                                 allAttachments={allAttachments}
//                             />
//                         </>
//                     )}
//                 </div>

//                 {currentViewMode === 'lesson' && (
//                     <CourseSidebar
//                         selectedCourse={selectedCourse}
//                         nestedSyllabus={nestedSyllabus}
//                         currentActiveUnit={currentActiveUnit}
//                         onSelectUnit={handleSelectUnitWrapper}
//                         onSelectSyntheticUnit={(title, checkpoint) => handleSelectUnitWrapper(generateSyntheticQuizUnit(title, checkpoint, false))}
//                         completedCount={completedCountForLabel}
//                         dynamicCompletedCount={dynamicCompletedCount}
//                         totalCount={selectedCourse.totalUnitsCount || enrichedCourseUnits.length}
//                         unlockedUnitIds={unlockedUnitIds}
//                         isCourseComplete={isCourseComplete}
//                         learnerCertificate={learnerCertificate}
//                         isSearchingCert={isSearchingCert}
//                         onOpenCertificate={() => setIsCertModalOpen(true)}
//                     />
//                 )}
//             </div>
//         </div>
//     );
// };

// export default CoursePlayerView;




// src/pages/LearnerPortal/LearnerContentHub/CoursePlayerView.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import {
    ArrowLeft, Share2, Bookmark, ChevronRight, Tv, FileText, Send,
    PartyPopper, Timer, CheckCircle2, Check, Sparkles, Bug, Bot,
    MessageSquare, Paperclip, HelpCircle, ChevronDown, Pause,
    Lock, ExternalLink, Loader2, Plus, MessageCircle, Zap,
    Award, RotateCcw, Download, FileSpreadsheet, FileCode, X, ArrowRight, History, Code, Shield,
    ShieldCheck, Eye, Trash2, Mic, AlertTriangle,
    ClipboardCheck
} from 'lucide-react';
import {
    doc, getDoc, setDoc, collection, query, where,
    onSnapshot, addDoc, serverTimestamp, updateDoc, deleteDoc, increment, getDocs, limit, writeBatch
} from 'firebase/firestore';
import { auth, db, storage } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';

import ReactPlayer from 'react-player';

// Media Chrome imports for custom React controls
import {
    MediaController,
    MediaControlBar,
    MediaTimeRange,
    MediaTimeDisplay,
    MediaVolumeRange,
    MediaPlaybackRateButton,
    MediaPlayButton,
    MediaSeekBackwardButton,
    MediaSeekForwardButton,
    MediaMuteButton,
    MediaFullscreenButton,
} from 'media-chrome/react';

import { QuillHTMLViewer } from '../../../components/common/QuillHTMLViewer/QuillHTMLViewer';
import Tooltip from '../../../components/common/Tooltip/Tooltip';

import {
    ProgressBar,
    type CoursePackage,
    type LearnerUnitProgress,
    type QuizAttemptDoc
} from './types';

// Strict Types from content types
import type {
    InteractiveCheckConfig,
    MCQOption,
    MCQQuestion
} from '../../../types/content.types';

import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import LearningFlow, { type Stage, type StageStatus } from './LearningFlow';

// DEV DEBUGGING TOGGLE
const DEV_VERBOSE_LOGGING = true;

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
    linkedAssessmentId?: string | null;
    assessmentId?: string | null;
    linkedAssessment?: string | Record<string, unknown> | null;
    formalAssessmentId?: string | null;
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
    unitTitle?: string;
    containerId: string;
    timelineId?: string;
    cohortRunId?: string;
    courseId: string;
    userId: string;
    userName: string;
    userInitials?: string;
    title: string;
    contentHtml: string;
    answersCount: number;
    hasStaffReply: boolean;
    isResolved: boolean;
    createdAt: any;
    lastActivityAt?: any;
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
    const safeSecs = typeof secs === 'number' && !isNaN(secs) && secs > 0 ? Math.floor(secs) : 0;
    if (safeSecs <= 0) return '0:00';

    const h = Math.floor(safeSecs / 3600);
    const m = Math.floor((safeSecs % 3600) / 60);
    const s = safeSecs % 60;

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const getUnitAssessmentGates = (unit?: LearnerUnitProgress | null) => {
    if (!unit) return { formativeId: null, summativeId: null, otherId: null, gates: null };
    const ext = unit as any;
    const gates = ext.assessmentGates;

    const formativeId = (gates?.formative?.enabled && gates?.formative?.assessmentId) ? String(gates.formative.assessmentId).trim() : null;

    let summativeId = (gates?.summative?.enabled && gates?.summative?.assessmentId) ? String(gates.summative.assessmentId).trim() : null;
    if (!summativeId && ext.linkedAssessmentId) summativeId = String(ext.linkedAssessmentId).trim();
    if (!summativeId && ext.assessmentId) summativeId = String(ext.assessmentId).trim();
    if (!summativeId && ext.formalAssessmentId) summativeId = String(ext.formalAssessmentId).trim();

    const otherId = (gates?.other?.enabled && gates?.other?.assessmentId) ? String(gates.other.assessmentId).trim() : null;

    return { formativeId, summativeId, otherId, gates };
};

const getUnitLinkedAssessmentId = (unit?: LearnerUnitProgress | null): string | null => {
    const { summativeId, formativeId, otherId } = getUnitAssessmentGates(unit);
    return summativeId || formativeId || otherId || null;
};

/** Dynamically resolves assessment titles, badges, and lifecycle text based on course framework */
const getAssessmentMeta = (course?: CoursePackage | ExtendedCoursePackage | null, unit?: LearnerUnitProgress | null) => {
    const extCourse = course as ExtendedCoursePackage;
    const extUnit = unit as any;
    const framework = String(
        extCourse?.framework || extCourse?.type || extUnit?.framework || extUnit?.assessmentFramework || ''
    ).toLowerCase();

    if (framework.includes('secam') || framework.includes('seta') || framework.includes('qcto')) {
        return {
            title: 'Formal SETA / QCTO Exam',
            shortTitle: 'SETA / QCTO Exam',
            badge: 'Official',
            lifecycleTitle: 'Official SETA / QCTO Assessment Lifecycle',
            overviewTitle: 'Official SETA / QCTO Examination Overview',
            defaultReg: 'Reg: SETA'
        };
    }
    if (framework.includes('codetribe') || framework.includes('bootcamp')) {
        return {
            title: 'CodeTribe Formal Assessment',
            shortTitle: 'CodeTribe Assessment',
            badge: 'CodeTribe',
            lifecycleTitle: 'CodeTribe Assessment Lifecycle',
            overviewTitle: 'CodeTribe Examination Overview',
            defaultReg: 'Reg: CodeTribe'
        };
    }
    return {
        title: 'Formal Assessment',
        shortTitle: 'Formal Assessment',
        badge: 'Official',
        lifecycleTitle: 'Official Assessment Lifecycle',
        overviewTitle: 'Official Examination Overview',
        defaultReg: 'Reg: Official'
    };
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
    const navigate = useNavigate();

    const targetInstanceId = useMemo(() => getCourseInstanceId(selectedCourse), [selectedCourse]);
    const extCourse = selectedCourse as ExtendedCoursePackage;

    const targetKeys = useMemo(() => {
        const keys = new Set<string>();
        if (selectedCourse?.id) keys.add(selectedCourse.id);
        if (targetInstanceId) keys.add(targetInstanceId);
        if (extCourse?.cohortRunId) keys.add(extCourse.cohortRunId);
        if (extCourse?.timelineId) keys.add(extCourse.timelineId);
        if (extCourse?.placementId) keys.add(extCourse.placementId);
        if (Array.isArray(extCourse?.allowedProgressKeys)) {
            extCourse.allowedProgressKeys.forEach(k => k && keys.add(k));
        }
        return Array.from(keys);
    }, [selectedCourse, targetInstanceId, extCourse]);

    const targetKeysString = useMemo(() => targetKeys.join(','), [targetKeys]);
    const primaryProgressKey = useMemo(() => targetInstanceId || selectedCourse.id, [targetInstanceId, selectedCourse.id]);
    const checkpointScope = extCourse.checkpointScope || extCourse.checkpointMetadata?.checkpointScope || 'per_lesson';

    const [isLessonCompleted, setIsLessonCompleted] = useState(false);

    const [isExamMode, setIsExamMode] = useState(() => {
        if (typeof window === 'undefined') return false;
        const params = new URLSearchParams(window.location.search);
        return params.get('exam') === 'true';
    });

    const [isQuizMode, setIsQuizMode] = useState(() => {
        if (typeof window === 'undefined') return false;
        const params = new URLSearchParams(window.location.search);
        return params.get('quiz') === 'true';
    });

    const currentViewMode = useMemo<'exam' | 'quiz' | 'lesson'>(() => {
        if (isExamMode) return 'exam';
        if (isQuizMode) return 'quiz';
        return 'lesson';
    }, [isExamMode, isQuizMode]);

    const setViewMode = (mode: 'exam' | 'quiz' | 'lesson') => {
        if (mode === 'exam') {
            setIsQuizMode(false);
            setIsExamMode(true);
        } else if (mode === 'quiz') {
            setIsQuizMode(true);
            setIsExamMode(false);
        } else {
            setIsQuizMode(false);
            setIsExamMode(false);
        }
    };

    const [expandedMainGroups, setExpandedMainGroups] = useState<Record<string, boolean>>({});
    const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});
    const [activeLessonTab, setActiveLessonTab] = useState<'notes' | 'comments' | 'attachments' | 'qa' | 'related'>('notes');
    const [formalAssessmentPassed, setFormalAssessmentPassed] = useState(false);

    // Checkpoint States
    const [socraticInput, setSocraticInput] = useState('');
    const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({}); // Maps question ID -> selected option ID

    const [hasBegunAttempt, setHasBegunAttempt] = useState(false);
    const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessingAudio, setIsProcessingAudio] = useState(false);

    const [liveTranscript, setLiveTranscript] = useState('');
    const [audioReviewUrl, setAudioReviewUrl] = useState<string | null>(null);
    const [isReviewingAudio, setIsReviewingAudio] = useState(false);
    const [isRecordingPaused, setIsRecordingPaused] = useState(false);
    const manualSubmitFromReviewRef = useRef<boolean>(false);

    const [showGateCelebration, setShowGateCelebration] = useState(false);
    const [attemptHistory, setAttemptHistory] = useState<QuizAttemptDoc[]>([]);
    const [showAttemptDrawer, setShowAttemptDrawer] = useState(false);
    const [graderNames, setGraderNames] = useState<Record<string, string>>({});

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

    const [currentWatchPct, setCurrentWatchPct] = useState(0);
    const [currentWatchedMins, setCurrentWatchedMins] = useState(0);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [isBookmarking, setIsBookmarking] = useState(false);
    const [learnerCertificate, setLearnerCertificate] = useState<CertificateData | null>(null);
    const [isCertModalOpen, setIsCertModalOpen] = useState(false);
    const [isSearchingCert, setIsSearchingCert] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [statusModal, setStatusModal] = useState<{ type: StatusType; title: string; message: string } | null>(null);
    const [resumeTime, setResumeTime] = useState<number | null>(null);
    const [autoNext, setAutoNext] = useState(() => localStorage.getItem('mlab_autonext') === 'true');
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [isVideoBuffering, setIsVideoBuffering] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
    const [formativeSubmission, setFormativeSubmission] = useState<any>(null);
    const [summativeSubmission, setSummativeSubmission] = useState<any>(null);
    const [otherSubmission, setOtherSubmission] = useState<any>(null);
    const [duration, setDuration] = useState(0);


    const playerRef = useRef<any>(null);
    const hasSoughtRef = useRef(false);
    const lastSavedTimeRef = useRef<number>(0);
    const lastRenderTimeRef = useRef<number>(0);
    const maxWatchedSecondsRef = useRef<number>(0);
    const isHydratedRef = useRef<boolean>(false);
    const debugWipedRef = useRef<boolean>(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioBlobRef = useRef<Blob | null>(null);
    const timerDiscardRef = useRef<boolean>(false);

    const recognitionRef = useRef<any>(null);
    const transcriptRef = useRef<string>('');
    const accumulatedTranscriptRef = useRef<string>('');
    const autoSubmitRef = useRef<boolean>(false);
    const ignoreResultRef = useRef<boolean>(false);

    // Standalone Player Popout Function
    const openPopoutPlayer = () => {
        if (!currentActiveUnit.videoUrl) return;
        let targetUrl = currentActiveUnit.videoUrl;
        const ytId = extractYouTubeId(currentActiveUnit.videoUrl);
        if (ytId) targetUrl = `https://www.youtube.com/watch?v=${ytId}`;
        const width = 960;
        const height = 540;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;
        window.open(targetUrl, '_blank', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no`);
    };

    const handleLaunchSandbox = () => {
        const checkConfig = (currentActiveUnit?.interactiveCheck as unknown as InteractiveCheckConfig) || {};
        const blockId = (checkConfig as any)?.blockId;
        const timeLimit = Number(checkConfig.timeLimitSeconds) || 0;
        const targetParam = blockId ? `blockId=${blockId}` : `unitId=${currentActiveUnit.id}`;
        const timerParam = timeLimit > 0 ? `&timer=${timeLimit}` : '';
        window.open(`/sandbox.html?${targetParam}${timerParam}`, '_blank', 'width=1024,height=768');
    };

    const enrichedCourseUnits = useMemo(() => {
        return courseUnits.map(u => {
            if (u.id === selectedUnit.id && isLessonCompleted) {
                return { ...u, isCompleted: true, progressPercent: 100, watchPercentage: 100 };
            }
            return u;
        });
    }, [courseUnits, selectedUnit.id, isLessonCompleted]);

    const currentActiveUnit = useMemo(() => {
        return enrichedCourseUnits.find(u => u.id === selectedUnit.id) || selectedUnit;
    }, [enrichedCourseUnits, selectedUnit]);

    const currentUnitIndex = useMemo(() => {
        return enrichedCourseUnits.findIndex(u => u.id === currentActiveUnit.id);
    }, [enrichedCourseUnits, currentActiveUnit.id]);

    const nextUnitPreview = useMemo(() => {
        return currentUnitIndex >= 0 ? enrichedCourseUnits[currentUnitIndex + 1] : null;
    }, [currentUnitIndex, enrichedCourseUnits]);

    const hasInteractiveCheck = useMemo(() => {
        return Boolean(
            currentActiveUnit?.interactiveCheck?.checkType &&
            (currentActiveUnit.interactiveCheck.checkType as string) !== 'none'
        );
    }, [currentActiveUnit]);

    // Ensure MCQ backward compatibility for single-question formats safely via type casting
    const activeMcqQuestions = useMemo<MCQQuestion[]>(() => {
        if (!hasInteractiveCheck || currentActiveUnit.interactiveCheck?.checkType !== 'mcq') return [];
        const check = currentActiveUnit.interactiveCheck as unknown as InteractiveCheckConfig;

        if (check.mcqQuestions && Array.isArray(check.mcqQuestions) && check.mcqQuestions.length > 0) {
            return check.mcqQuestions;
        }
        if (check.mcqQuestion) {
            return [{
                id: 'legacy_q1',
                question: check.mcqQuestion,
                options: check.mcqOptions || []
            }];
        }
        return [];
    }, [hasInteractiveCheck, currentActiveUnit.interactiveCheck]);

    const { formativeId, summativeId, otherId } = useMemo(() => {
        return getUnitAssessmentGates(currentActiveUnit);
    }, [currentActiveUnit]);

    const hasFormativeGate = Boolean(formativeId);
    const hasSummativeGate = Boolean(summativeId);
    const hasOtherGate = Boolean(otherId);
    const hasLinkedAssessment = hasFormativeGate || hasSummativeGate || hasOtherGate;
    const linkedAssessmentId = summativeId || formativeId || otherId || null;

    // Format submitted MCQ responses into structured readable JSX
    const renderSubmittedContent = (att: QuizAttemptDoc) => {
        const rawText = att.submittedCodeOrAnswer || att.submittedAnswer || '';
        if (!rawText) return <span style={{ color: '#64748b', fontStyle: 'italic' }}>No submission content recorded</span>;

        if (att.checkType === 'mcq' || rawText.includes('Responses: {')) {
            try {
                const jsonStart = rawText.indexOf('{');
                const jsonEnd = rawText.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    const jsonStr = rawText.substring(jsonStart, jsonEnd + 1);
                    const parsedAnswers = JSON.parse(jsonStr) as Record<string, string>;
                    const questions = activeMcqQuestions;

                    if (questions.length > 0) {
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'sans-serif' }}>
                                {questions.map((q, idx) => {
                                    const selOptId = parsedAnswers[q.id || idx];
                                    const selOpt = q.options.find(o => o.id === selOptId);
                                    const isCorrect = selOpt?.isCorrect;

                                    return (
                                        <div key={q.id || idx} style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '8px 10px', borderRadius: '3px' }}>
                                            <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.75rem', marginBottom: '4px' }}>
                                                {idx + 1}. {q.question}
                                            </div>
                                            <div style={{
                                                fontSize: '0.72rem',
                                                color: selOpt ? (isCorrect ? '#4ade80' : '#fca5a5') : '#94a3b8',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                Selected: {selOpt ? `"${selOpt.text}"` : 'No Answer Selected'}
                                                {selOpt && (isCorrect ? ' ✓ (Correct)' : ' ✗ (Incorrect)')}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    }
                }
            } catch (e) {
                // Fall back to text if JSON parsing fails
            }
        }

        return (
            <pre style={{ margin: 0, fontSize: '0.72rem', color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {rawText}
            </pre>
        );
    };

    // Automatically fetch display names for gradedBy UIDs
    useEffect(() => {
        const uidsToFetch = Array.from(
            new Set(
                attemptHistory
                    .map(a => a.gradedBy)
                    .filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0 && !graderNames[uid])
            )
        );

        if (uidsToFetch.length === 0) return;

        const fetchGraderNames = async () => {
            const newNames: Record<string, string> = {};
            await Promise.all(
                uidsToFetch.map(async (uid) => {
                    try {
                        const userSnap = await getDoc(doc(db, 'users', uid));
                        if (userSnap.exists()) {
                            const data = userSnap.data();
                            newNames[uid] = data.displayName || data.fullName || data.name || data.email || uid;
                        } else {
                            newNames[uid] = uid;
                        }
                    } catch (e) {
                        console.warn(`[CoursePlayerView] Failed to fetch user name for UID ${uid}:`, e);
                        newNames[uid] = uid;
                    }
                })
            );
            setGraderNames(prev => ({ ...prev, ...newNames }));
        };

        fetchGraderNames();
    }, [attemptHistory]);

    const isQuizPendingReview = useMemo(() => {
        if (attemptHistory.length === 0) return false;
        const latestAttempt = attemptHistory[attemptHistory.length - 1];
        if (!latestAttempt) return false;

        const isOral = currentActiveUnit.interactiveCheck?.checkType === 'oral_defense';
        if (isOral && !latestAttempt.gradedBy && !(latestAttempt as any).isGraded) {
            return true;
        }
        return false;
    }, [attemptHistory, currentActiveUnit.interactiveCheck?.checkType]);

    const isQuizPassed = useMemo(() => {
        if (attemptHistory.length === 0) return false;
        const latestAttempt = attemptHistory[attemptHistory.length - 1];
        if (!latestAttempt || latestAttempt.passed !== true) return false;

        if (currentActiveUnit.interactiveCheck?.checkType === 'oral_defense') {
            const text = (latestAttempt.submittedCodeOrAnswer || latestAttempt.submittedAnswer || '').trim();
            if (text.length < 5 || text === 'Submitted Answer' || text === 'Submitted Answer (Bypass)') {
                return false;
            }
            if (!latestAttempt.gradedBy && !(latestAttempt as any).isGraded) {
                return false;
            }
        }
        return true;
    }, [attemptHistory, currentActiveUnit.interactiveCheck?.checkType]);

    const hasFailedAttempts = useMemo(() => {
        return attemptHistory.length > 0 && !isQuizPassed;
    }, [attemptHistory, isQuizPassed]);

    const isLatestAudioEmpty = useMemo(() => {
        if (currentActiveUnit.interactiveCheck?.checkType !== 'oral_defense') return false;
        if (attemptHistory.length === 0) return false;
        const latestAtt = attemptHistory[attemptHistory.length - 1];
        if (!latestAtt.passed) return false;
        const text = (latestAtt.submittedCodeOrAnswer || '').trim();
        return text.length < 5 || text === 'Submitted Answer' || text === 'Submitted Answer (Bypass)';
    }, [attemptHistory, currentActiveUnit.interactiveCheck?.checkType]);

    const isFormativePassed = useMemo(() => {
        if (!hasFormativeGate) return true;
        if (!formativeSubmission) return false;
        const status = String(formativeSubmission.status || '').toLowerCase();
        const comp = String(formativeSubmission.competency || '').toUpperCase();
        const score = formativeSubmission.totalMarks > 0 ? ((formativeSubmission.marks || 0) / formativeSubmission.totalMarks) * 100 : 0;
        return ['C', 'HC', '3', '4'].includes(comp) || score >= 80 || status === 'graded';
    }, [hasFormativeGate, formativeSubmission]);

    const isSummativeSubmitted = useMemo(() => {
        if (!hasSummativeGate) return false;
        if (!summativeSubmission) return false;
        const status = String(summativeSubmission.status || '').toLowerCase();
        return ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(status);
    }, [hasSummativeGate, summativeSubmission]);

    const isSummativeCompetent = useMemo(() => {
        if (!hasSummativeGate) return true;
        if (!summativeSubmission) return false;
        const comp = String(summativeSubmission.competency || '').toUpperCase();
        return ['C', 'HC', '3', '4'].includes(comp);
    }, [hasSummativeGate, summativeSubmission]);

    const isSummativeLockedByFormative = useMemo(() => {
        const ext = currentActiveUnit as ExtendedLearnerUnitProgress;
        const reqFormative = ext.assessmentGates?.formative?.requirePassToUnlockSummative !== false;
        return hasFormativeGate && reqFormative && !isFormativePassed;
    }, [currentActiveUnit, hasFormativeGate, isFormativePassed]);

    const isVideo = useMemo(() => currentActiveUnit.unitType === 'video', [currentActiveUnit.unitType]);
    const reqProgress = useMemo(() => currentActiveUnit.requiredWatchPercentage || 90, [currentActiveUnit.requiredWatchPercentage]);

    const isWatchRequirementMet = useMemo(() => {
        return isLessonCompleted || (!isVideo) || (currentWatchPct >= reqProgress);
    }, [isLessonCompleted, isVideo, currentWatchPct, reqProgress]);

    const formattedVideoUrl = useMemo(() => {
        if (!currentActiveUnit?.videoUrl) return '';
        const cleanUrl = currentActiveUnit.videoUrl.trim();
        const ytId = extractYouTubeId(cleanUrl);
        if (ytId) {
            return `https://www.youtube.com/watch?v=${ytId}`;
        }
        return cleanUrl;
    }, [currentActiveUnit?.videoUrl]);

    const unlockedUnitIds = useMemo(() => {
        const unlocked = new Set<string>();
        let activeLockEnforced = false;
        const sorted = [...enrichedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        for (const u of sorted) {
            if (!activeLockEnforced) {
                unlocked.add(u.id);
            }
            const extUnit = u as ExtendedLearnerUnitProgress;
            const unitAssessment = getUnitLinkedAssessmentId(extUnit);
            const requiresNextLock = u.isRequiredForNextUnit === true || Boolean(unitAssessment && extUnit.unlinkedPolicy === 'hard_gate');
            const isUnitCompletedLocal = u.isCompleted || (u.id === currentActiveUnit.id && (isLessonCompleted || currentActiveUnit.isCompleted));
            if (!isUnitCompletedLocal && requiresNextLock) {
                activeLockEnforced = true;
            }
        }
        return unlocked;
    }, [enrichedCourseUnits, currentActiveUnit.id, isLessonCompleted, currentActiveUnit.isCompleted]);

    const completedCountForLabel = useMemo(() => {
        return enrichedCourseUnits.filter(u => u.isCompleted || (u.id === currentActiveUnit.id && isLessonCompleted)).length;
    }, [enrichedCourseUnits, currentActiveUnit.id, isLessonCompleted]);

    const dynamicCompletedCount = useMemo(() => {
        return enrichedCourseUnits.reduce((sum, u) => {
            const isDone = u.isCompleted || (u.id === currentActiveUnit.id && isLessonCompleted);
            if (isDone) return sum + 1;
            const extUnit = u as ExtendedLearnerUnitProgress;
            const pct = Math.max(0, extUnit.progressPercent ?? extUnit.watchPercentage ?? 0);
            return sum + (pct / 100);
        }, 0);
    }, [enrichedCourseUnits, currentActiveUnit.id, isLessonCompleted]);

    const isCourseComplete = useMemo(() => {
        const total = selectedCourse.totalUnitsCount || enrichedCourseUnits.length;
        const fullCompletedCount = enrichedCourseUnits.filter(u => u.isCompleted || (u.id === currentActiveUnit.id && isLessonCompleted)).length;
        return total > 0 && fullCompletedCount >= total;
    }, [enrichedCourseUnits, selectedCourse.totalUnitsCount, currentActiveUnit.id, isLessonCompleted]);

    const facilitators = useMemo(() => {
        if (selectedCourse.instructors && selectedCourse.instructors.length > 0) return selectedCourse.instructors;
        if (extCourse.checkpointMetadata?.instructors && extCourse.checkpointMetadata.instructors.length > 0) return extCourse.checkpointMetadata.instructors;
        return [];
    }, [selectedCourse, extCourse]);

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
        const extUnit = currentActiveUnit as ExtendedLearnerUnitProgress;
        const lessonAtts = parseAtts(currentActiveUnit.attachments || extUnit.lessonAttachments || extUnit.files);
        const courseAtts = parseAtts(extCourse.attachments || extCourse.checkpointMetadata?.attachments || extCourse.checkpointMetadata?.courseAttachments);
        const combined = [...lessonAtts, ...courseAtts];
        const uniqueMap = new Map<string, AttachmentItem>();

        combined.forEach((att, index) => {
            if (att && (att.url || att.name)) {
                const attContainer = att.containerId || att.timelineId || att.cohortRunId;
                if (attContainer && attContainer !== targetInstanceId && attContainer !== selectedCourse.id) return;
                const key = att.id || att.url || att.name || `att_${index}`;
                uniqueMap.set(key, att);
            }
        });
        return Array.from(uniqueMap.values());
    }, [currentActiveUnit, selectedCourse, targetInstanceId, extCourse]);

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

                        return { title: subTitle, units: sorted, isDayComplete, dayCheckpoint };
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

                return { title: mainTitle, subGroups, totalUnits: allGroupUnits.length, completedUnits: completedCount, isComplete: isSprintComplete, sprintCheckpoint };
            })
            .filter(mg => mg.subGroups.length > 0);
    }, [enrichedCourseUnits, selectedCourse, extCourse, checkpointScope]);

    const getGateAccent = (checkType?: string) => {
        switch (checkType) {
            case 'spot_the_bug': return { color: '#f59e0b', bg: '#78350f', border: '#f59e0b', icon: Bug, label: 'Code Repair Check' };
            case 'oral_defense': return { color: '#a855f7', bg: '#3b0764', border: '#a855f7', icon: Bot, label: 'AI Audio Check' };
            case 'socratic_dialogue': return { color: '#a78bfa', bg: '#2e1065', border: '#a78bfa', icon: Bot, label: 'AI Dialogue Check' };
            case 'mcq': return { color: '#4ade80', bg: '#064e3b', border: '#4ade80', icon: HelpCircle, label: 'Interactive Quiz' };
            default: return { color: '#38bdf8', bg: '#0f172a', border: '#073f4e', icon: Sparkles, label: 'Interactive Check' };
        }
    };

    const gateAccent = getGateAccent(currentActiveUnit.interactiveCheck?.checkType as string | undefined);
    const GateIcon = gateAccent.icon;
    const isTimerUrgent = timerRemaining !== null && timerRemaining <= 30;

    const LESSON_TABS: { key: typeof activeLessonTab; label: string; icon: typeof FileText }[] = [
        { key: 'notes', label: 'Notes', icon: FileText },
        { key: 'comments', label: `Comments (${comments.length})`, icon: MessageSquare },
        { key: 'qa', label: `Questions (${questions.length})`, icon: HelpCircle },
        { key: 'attachments', label: `Attachments (${allAttachments.length})`, icon: Paperclip },
        { key: 'related', label: 'Related', icon: Sparkles }
    ];

    const isQuizActiveOrPaused = hasBegunAttempt && !isQuizPassed && timerRemaining !== null && timerRemaining > 0;
    const isKnowledgeCheckLocked = !isWatchRequirementMet && !isQuizPassed && !isQuizActiveOrPaused && !hasFailedAttempts;

    let stage2BtnText = "Launch Knowledge Check";
    if (isQuizPassed) stage2BtnText = "Check Cleared ✓";
    else if (isQuizPendingReview) stage2BtnText = "Pending Review ⏳";
    else if (isQuizActiveOrPaused) stage2BtnText = "Resume Check";
    else if (hasFailedAttempts) stage2BtnText = "Retry Knowledge Check";

    // Dynamic LearningFlow Stages (Watch -> Knowledge Check -> Assessment)
    const learningFlowStages = useMemo<Stage[]>(() => {
        const meta = getAssessmentMeta(selectedCourse, currentActiveUnit);
        const extUnit = currentActiveUnit as ExtendedLearnerUnitProgress;
        const isHardGate = extUnit.unlinkedPolicy === 'hard_gate';

        const list: Stage[] = [
            {
                key: 'watch',
                label: 'Watch',
                hint: isVideo ? 'Video & lesson content' : 'Reading Guide',
                icon: 'play',
                from: '#0284c7',
                to: '#0369a1',
                title: 'Learn the lesson material',
                body: 'Study the content at your own pace. Rewind, pause, or revisit anytime.',
                cta: isPlaying ? 'Pause lesson' : 'Resume lesson',
                isLocked: false
            }
        ];

        if (hasInteractiveCheck) {
            const isQuizLocked = !isWatchRequirementMet && !isQuizPassed && !hasFailedAttempts;
            list.push({
                key: 'quiz',
                label: 'Knowledge check',
                hint: gateAccent.label || 'Interactive check',
                icon: 'quiz',
                from: '#4f46e5',
                to: '#4338ca',
                title: hasFailedAttempts ? 'Re-attempt Knowledge Check' : 'In-lesson verification',
                body: hasFailedAttempts ? 'Review feedback on previous attempt and submit a revised response.' : 'Complete the interactive check to confirm your understanding.',
                cta: stage2BtnText,
                isLocked: isQuizLocked
            });
        }

        if (hasLinkedAssessment) {
            const isExamLocked = (!isWatchRequirementMet || (isHardGate && hasInteractiveCheck && !isQuizPassed)) && !formalAssessmentPassed;
            list.push({
                key: 'exam',
                label: 'Assessment',
                hint: meta.shortTitle,
                icon: 'exam',
                from: '#7c3aed',
                to: '#6d28d9',
                title: 'Formal examination module',
                body: isSummativeSubmitted ? 'View your submission record and accreditation audit logs.' : 'Prepare and launch the formal examination workspace.',
                cta: isSummativeSubmitted ? 'View Submission' : 'Open Assessment Hub',
                isLocked: isExamLocked
            });
        }

        return list;
    }, [isVideo, isPlaying, hasInteractiveCheck, gateAccent.label, hasFailedAttempts, stage2BtnText, hasLinkedAssessment, isWatchRequirementMet, isQuizPassed, formalAssessmentPassed, isSummativeSubmitted, selectedCourse, currentActiveUnit]);

    const learningFlowStatuses = useMemo<Record<string, StageStatus>>(() => ({
        watch: isWatchRequirementMet ? 'done' : 'todo',
        quiz: isQuizPassed ? 'done' : (isQuizPendingReview ? 'pending' : (hasFailedAttempts ? 'failed' : 'todo')),
        exam: formalAssessmentPassed ? 'done' : (isSummativeSubmitted ? 'pending' : 'todo')
    }), [isWatchRequirementMet, isQuizPassed, isQuizPendingReview, hasFailedAttempts, formalAssessmentPassed, isSummativeSubmitted]);


    const learningFlowSelectedIndex = useMemo(() => {
        if (isQuizMode) return learningFlowStages.findIndex(s => s.key === 'quiz');
        if (isExamMode) return learningFlowStages.findIndex(s => s.key === 'exam');
        return 0;
    }, [isQuizMode, isExamMode, learningFlowStages]);

    const handleLearningFlowSelect = (_index: number, stage: Stage) => {
        if (stage.isLocked) return;

        if (stage.key === 'watch') setViewMode('lesson');
        else if (stage.key === 'quiz') setViewMode('quiz');
        else if (stage.key === 'exam') setViewMode('exam');
    };

    const handleLearningFlowAction = (stage: Stage) => {
        if (stage.isLocked) return;

        if (stage.key === 'watch') {
            setViewMode('lesson');
            if (playerRef.current) seekPlayer(maxWatchedSecondsRef.current || 0);
        } else if (stage.key === 'quiz') {
            setViewMode('quiz');
        } else if (stage.key === 'exam') {
            setViewMode('exam');
        }
    };

    const handleStartOralDefense = async () => {
        if (isQuizPassed || isQuizPendingReview) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            localStorage.removeItem(`mlab_transcript_${currentActiveUnit.id}`);
            setLiveTranscript('');
            transcriptRef.current = '';
            accumulatedTranscriptRef.current = '';
            ignoreResultRef.current = false;
            setAudioReviewUrl(null);
            setIsReviewingAudio(false);
            setIsRecordingPaused(false);
            autoSubmitRef.current = false;
            manualSubmitFromReviewRef.current = false;

            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                try {
                    const recognition = new SpeechRecognition();
                    recognition.continuous = true;
                    recognition.interimResults = true;
                    recognition.lang = 'en-US';

                    let hasStarted = false;
                    const silentFailTimeout = setTimeout(() => {
                        if (!hasStarted) {
                            const fallbackMsg = "[Live transcription unavailable in this browser. Your audio is still being recorded securely.]";
                            if (!transcriptRef.current) {
                                transcriptRef.current = fallbackMsg;
                                setLiveTranscript(fallbackMsg);
                            }
                        }
                    }, 4000);

                    recognition.onstart = () => {
                        hasStarted = true;
                        clearTimeout(silentFailTimeout);
                    };

                    recognition.onresult = (event: any) => {
                        if (ignoreResultRef.current) return;

                        let interimTranscript = '';
                        for (let i = event.resultIndex; i < event.results.length; ++i) {
                            if (event.results[i].isFinal) {
                                accumulatedTranscriptRef.current = (accumulatedTranscriptRef.current + " " + event.results[i][0].transcript).trim();
                            } else {
                                interimTranscript += event.results[i][0].transcript;
                            }
                        }

                        const fullText = (accumulatedTranscriptRef.current + " " + interimTranscript).replace(/\s+/g, ' ').trim();
                        transcriptRef.current = fullText;
                        setLiveTranscript(fullText);
                        localStorage.setItem(`mlab_transcript_${currentActiveUnit.id}`, fullText);
                    };

                    recognition.onerror = (event: any) => {
                        hasStarted = true;
                        clearTimeout(silentFailTimeout);
                        if (event.error === 'network' || event.error === 'not-allowed') {
                            const fallbackMsg = `[Live transcription unavailable (${event.error}). Your audio is still being recorded securely.]`;
                            if (!transcriptRef.current) {
                                transcriptRef.current = fallbackMsg;
                                setLiveTranscript(fallbackMsg);
                            }
                        }
                    };

                    recognitionRef.current = recognition;
                    recognition.start();
                } catch (e) {
                    console.error("🎙️ [Speech API] Failed to initialize:", e);
                }
            } else {
                const fallbackMsg = "Browser does not natively support live transcription. Your audio is still being recorded.";
                transcriptRef.current = fallbackMsg;
                setLiveTranscript(fallbackMsg);
            }

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());

                if (timerDiscardRef.current) return;

                let mimeType = mediaRecorder.mimeType;
                if (!mimeType) {
                    mimeType = (window as any).MediaRecorder?.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : 'audio/webm';
                }
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                audioBlobRef.current = audioBlob;

                if (manualSubmitFromReviewRef.current) {
                    manualSubmitFromReviewRef.current = false;
                    await processAndSubmitAudio(audioBlob);
                } else {
                    const url = URL.createObjectURL(audioBlob);
                    setAudioReviewUrl(url);
                    setIsReviewingAudio(true);
                }
            };

            setHasBegunAttempt(true);
            const checkConfig = currentActiveUnit.interactiveCheck as unknown as InteractiveCheckConfig;
            const limitSecs = Number(checkConfig?.timeLimitSeconds) || 0;
            setTimerRemaining(limitSecs > 0 ? limitSecs : null);

            mediaRecorder.start(500);
            setIsRecording(true);
            timerDiscardRef.current = false;
        } catch (err) {
            console.error("Microphone access denied or error:", err);
            setStatusModal({
                type: 'error',
                title: 'Microphone Access Required',
                message: 'Please allow microphone permissions in your browser to complete this audio assessment.'
            });
        }
    };

    const processAndSubmitAudio = async (blob: Blob) => {
        setIsProcessingAudio(true);
        let uploadedAudioUrl = '';
        const currentUser = auth.currentUser;

        try {
            if (blob && currentUser && storage) {
                const mime = blob.type || 'audio/webm';
                const ext = mime.includes('mp4') ? 'mp4' : 'webm';
                const storagePath = `oral_defenses/${currentUser.uid}/${currentActiveUnit.id}_${Date.now()}.${ext}`;

                const fileRef = ref(storage, storagePath);
                await uploadBytes(fileRef, blob);
                uploadedAudioUrl = await getDownloadURL(fileRef);
            }
        } catch (uploadErr) {
            console.error('❌ [Storage] Failed to upload audio recording:', uploadErr);
        } finally {
            setIsProcessingAudio(false);
            await handleCompleteVerificationCheck(
                transcriptRef.current || "[No speech detected in audio file. Please re-record.]",
                uploadedAudioUrl
            );
        }
    };

    const handlePauseAndReview = () => {
        if (mediaRecorderRef.current && isRecording && mediaRecorderRef.current.state === 'recording') {
            ignoreResultRef.current = true;
            mediaRecorderRef.current.requestData();
            mediaRecorderRef.current.pause();
            if (recognitionRef.current) recognitionRef.current.stop();

            let currentText = transcriptRef.current.trim();
            if (currentText.length > 0 && !/[.!?]$/.test(currentText)) {
                currentText += ".";
            }

            accumulatedTranscriptRef.current = currentText;
            transcriptRef.current = currentText;
            setLiveTranscript(currentText);
            localStorage.setItem(`mlab_transcript_${currentActiveUnit.id}`, currentText);

            setIsRecordingPaused(true);

            setTimeout(() => {
                let mimeType = mediaRecorderRef.current?.mimeType;
                if (!mimeType) {
                    mimeType = (window as any).MediaRecorder?.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : 'audio/webm';
                }
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(audioBlob);
                setAudioReviewUrl(url);
                setIsReviewingAudio(true);
            }, 150);
        }
    };

    const handleResumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            ignoreResultRef.current = false;
            mediaRecorderRef.current.resume();

            accumulatedTranscriptRef.current = transcriptRef.current;

            try {
                if (recognitionRef.current) recognitionRef.current.start();
            } catch (e) { }

            setIsRecordingPaused(false);
            setIsReviewingAudio(false);
        }
    };

    const handleConfirmAudioSubmission = async () => {
        setIsReviewingAudio(false);
        setHasBegunAttempt(false);
        setTimerRemaining(null);

        manualSubmitFromReviewRef.current = true;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        } else if (audioBlobRef.current) {
            await processAndSubmitAudio(audioBlobRef.current);
        } else {
            handleCompleteVerificationCheck(transcriptRef.current || "[No speech detected in audio file. Please re-record.]");
        }
    };

    const handleDiscardAndRerecord = () => {
        setIsReviewingAudio(false);
        setIsRecordingPaused(false);
        setAudioReviewUrl(null);

        setLiveTranscript('');
        transcriptRef.current = '';
        accumulatedTranscriptRef.current = '';
        localStorage.removeItem(`mlab_transcript_${currentActiveUnit.id}`);

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            timerDiscardRef.current = true;
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
        handleStartOralDefense();
    };

    const handleBeginGenericAttempt = () => {
        if (isQuizPassed || isQuizPendingReview) return;
        setHasBegunAttempt(true);
        const checkConfig = currentActiveUnit.interactiveCheck as unknown as InteractiveCheckConfig;
        const limitSecs = Number(checkConfig?.timeLimitSeconds) || 0;
        setTimerRemaining(limitSecs > 0 ? limitSecs : null);
    };

    const handleClearAttemptsDebug = async () => {
        if (!DEV_VERBOSE_LOGGING) return;
        const currentUser = auth.currentUser;
        if (!currentUser || !currentActiveUnit?.id) return;

        debugWipedRef.current = true;
        setAttemptHistory([]);
        setIsLessonCompleted(false);
        setFormalAssessmentPassed(false);
        setCurrentWatchPct(0);
        setCurrentWatchedMins(0);
        setTimerRemaining(null);
        setHasBegunAttempt(false);
        maxWatchedSecondsRef.current = 0;

        if (playerRef.current) seekPlayer(0);

        if (mediaRecorderRef.current && isRecording) {
            timerDiscardRef.current = true;
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
        }

        setStatusModal({ type: 'success', title: 'Local Progress Wiped', message: 'Local UI reset for testing.' });

        try {
            const attemptsQuery = query(
                collection(db, 'learner_quiz_attempts'),
                where('userId', '==', currentUser.uid),
                where('unitId', '==', currentActiveUnit.id)
            );
            const snap = await getDocs(attemptsQuery);
            const batch = writeBatch(db);
            snap.docs.forEach(docSnap => batch.delete(docSnap.ref));

            const validTargetKeys = targetKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
            if (validTargetKeys.length > 0) {
                const progQuery = query(
                    collection(db, 'learner_content_progress'),
                    where('userId', '==', currentUser.uid),
                    where('unitId', '==', currentActiveUnit.id),
                    where('containerId', 'in', validTargetKeys)
                );
                const progSnap = await getDocs(progQuery);
                progSnap.docs.forEach(docSnap => {
                    batch.update(docSnap.ref, {
                        isCompleted: false,
                        watchPct: 0,
                        watchedMins: 0,
                        lastPlayedSeconds: 0
                    });
                });
            }

            await batch.commit();
        } catch (e) {
            console.warn("⚠️ DEBUG: Database wipe blocked by rules.", e);
        }
    };

    const getPlayerDuration = (): number => {
        const player = playerRef.current;
        if (!player) return duration || 0;
        try {
            if (typeof player.duration === 'number' && isFinite(player.duration) && player.duration > 0) return player.duration;
            if (typeof player.getDuration === 'function') {
                const d = player.getDuration();
                if (typeof d === 'number' && d > 0) return d;
            }
        } catch (e) { }
        return duration || 0;
    };

    const seekPlayer = (seconds: number) => {
        const player = playerRef.current;
        if (!player) return;
        try {
            if (typeof player.currentTime !== 'undefined') {
                player.currentTime = seconds;
                return;
            }
            if (typeof player.seekTo === 'function') {
                player.seekTo(seconds, 'seconds');
                return;
            }
        } catch (e) { }
    };

    const logQuizAttempt = async (
        checkType: string,
        passed: boolean,
        answerText: string,
        failureReason?: string,
        audioUrl?: string,
        score?: number
    ) => {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentActiveUnit?.id) return;
        const nextNum = attemptHistory.length + 1;
        const payload = {
            userId: currentUser.uid,
            unitId: currentActiveUnit.id,
            containerId: targetInstanceId || selectedCourse.id,
            checkType: checkType,
            passed: passed,
            submittedCodeOrAnswer: answerText,
            audioUrl: audioUrl || null,
            recordingUrl: audioUrl || null,
            failureReason: failureReason || null,
            attemptNumber: nextNum,
        };

        try {
            await addDoc(collection(db, 'learner_quiz_attempts'), {
                ...payload,
                score: score !== undefined ? score : null,
                attemptedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('❌ [logQuizAttempt] Failed to write attempt doc:', err);
        }
    };

    const syncProgressToFirebase = async (pct: number, playedSecondsInput?: number, forceMarkCompleted?: boolean) => {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentActiveUnit?.id) return;

        const effectiveSeconds = Math.max(typeof playedSecondsInput === 'number' && !isNaN(playedSecondsInput) ? playedSecondsInput : 0, maxWatchedSecondsRef.current || 0);
        const safeSecs = Math.floor(effectiveSeconds);
        const safeMins = safeSecs > 0 ? Number((safeSecs / 60).toFixed(2)) : 0;
        const safePct = isNaN(pct) ? 0 : Math.min(100, Math.floor(pct));

        const hasQuiz = currentActiveUnit.interactiveCheck?.checkType && (currentActiveUnit.interactiveCheck.checkType as string) !== 'none';
        const hasPassedFormal = hasLinkedAssessment ? formalAssessmentPassed : true;
        const hasPassedQuiz = hasQuiz ? isQuizPassed : true;

        const isAlreadyCompleted = Boolean(currentActiveUnit.isCompleted) || isLessonCompleted;
        const markCompletedInDb = forceMarkCompleted !== undefined ? forceMarkCompleted : (isAlreadyCompleted || ((safePct >= (currentActiveUnit.requiredWatchPercentage || 90)) && hasPassedQuiz && hasPassedFormal));

        const keysToWrite = Array.from(new Set([primaryProgressKey, targetInstanceId, selectedCourse.id])).filter(Boolean);

        try {
            const batch = writeBatch(db);
            keysToWrite.forEach(key => {
                const docId = `${currentUser.uid}_${key}_${currentActiveUnit.id}`;
                const docRef = doc(db, 'learner_content_progress', docId);
                batch.set(docRef, {
                    userId: currentUser.uid,
                    containerId: key,
                    unitId: currentActiveUnit.id,
                    watchPct: safePct,
                    watchedMins: safeMins,
                    lastPlayedSeconds: safeSecs,
                    isCompleted: markCompletedInDb,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            });
            await batch.commit();
        } catch (error) {
            console.error("[WatchTracking] Save FAILED:", error);
        }
    };

    const handleCompleteVerificationCheck = async (
        bypassText = 'Submitted Answer (Bypass)',
        audioUrlInput?: string,
        explicitPassed?: boolean,
        explicitScore?: number
    ) => {
        const checkType = currentActiveUnit.interactiveCheck?.checkType || 'socratic_dialogue';
        const isOral = checkType === 'oral_defense';

        const initialPassedState = explicitPassed !== undefined ? explicitPassed : !isOral;
        const initialFailureReason = isOral ? 'Awaiting Assessor Marking' : (!initialPassedState ? 'Did not meet minimum passing score.' : undefined);

        if (initialPassedState) setShowGateCelebration(true);

        await logQuizAttempt(checkType, initialPassedState, socraticInput || bypassText, initialFailureReason, audioUrlInput, explicitScore);

        // Always reset attempt active state and form inputs so learner lands on Gate / History screen
        setHasBegunAttempt(false);
        setTimerRemaining(null);
        setMcqAnswers({});
        setSocraticInput('');

        if (initialPassedState) {
            if (!hasLinkedAssessment || formalAssessmentPassed) {
                setIsLessonCompleted(true);
                syncProgressToFirebase(currentWatchPct || 100, maxWatchedSecondsRef.current, true);
            } else {
                syncProgressToFirebase(currentWatchPct || 100, maxWatchedSecondsRef.current, false);
            }
        } else {
            setStatusModal({
                type: 'error',
                title: 'Knowledge Check Failed',
                message: `You scored ${explicitScore !== undefined ? explicitScore : 0}%. You need at least 80% to pass. Please review the material and try again.`
            });
        }
    };

    const handleNextLesson = async (e?: React.SyntheticEvent, forceProceed = false) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (!isWatchRequirementMet) {
            setStatusModal({
                type: 'warning',
                title: 'Watch Requirement Not Met',
                message: `Please watch at least ${reqProgress}% of the video to proceed.`
            });
            return;
        }

        // Stop at quiz if not forcing proceed
        if (!forceProceed && hasInteractiveCheck && !isQuizPassed && !isQuizPendingReview) {
            setIsQuizMode(true);
            return;
        }

        // If there's an unpassed formal assessment for this unit, proceed to exam workspace first
        if (hasLinkedAssessment && !formalAssessmentPassed && !forceProceed) {
            setIsQuizMode(false);
            setIsExamMode(true);
            return;
        }

        await syncProgressToFirebase(currentWatchPct || 100, maxWatchedSecondsRef.current, false);

        if (!nextUnitPreview) {
            onBackToOverview();
            return;
        }

        const extUnit = currentActiveUnit as ExtendedLearnerUnitProgress;
        const isHardGate = extUnit.unlinkedPolicy === 'hard_gate';

        if (isHardGate && !isQuizPassed && !formalAssessmentPassed && !forceProceed) {
            setStatusModal({
                type: 'warning',
                title: 'Hard Gate Requirement',
                message: 'This lesson requires passing the knowledge check before unlocking the next module.'
            });
            return;
        }

        handleSelectUnitWrapper(nextUnitPreview);
    };

    const handlePlayerReady = () => {
        setIsPlayerReady(true);
        setIsVideoBuffering(false);

        if (resumeTime !== null && !hasSoughtRef.current && playerRef.current) {
            try {
                seekPlayer(resumeTime);
                hasSoughtRef.current = true;
            } catch (e) { }
        }
    };

    const handleVideoPlay = () => {
        setIsPlayerReady(true);
        setIsPlaying(true);

        if (resumeTime !== null && !hasSoughtRef.current && playerRef.current) {
            try {
                seekPlayer(resumeTime);
                hasSoughtRef.current = true;
            } catch (e) { }
        }
    };


    const handlePlayerTimeUpdate = (e: any) => {
        if (!isHydratedRef.current) return;

        let playedSeconds = 0;
        if (typeof e === 'number' && !isNaN(e)) {
            playedSeconds = e;
        } else if (e?.playedSeconds && typeof e.playedSeconds === 'number') {
            playedSeconds = e.playedSeconds;
        } else if (e?.target?.currentTime && typeof e.target.currentTime === 'number') {
            playedSeconds = e.target.currentTime;
        } else if (playerRef.current && typeof playerRef.current.currentTime === 'number') {
            playedSeconds = playerRef.current.currentTime || 0;
        } else if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
            playedSeconds = playerRef.current.getCurrentTime() || 0;
        }

        let currentDuration = duration;
        if (currentDuration <= 0) {
            currentDuration = getPlayerDuration();
            if (currentDuration > 0) setDuration(currentDuration);
        }

        const safeMaxWatched = typeof maxWatchedSecondsRef.current === 'number' && !isNaN(maxWatchedSecondsRef.current) ? maxWatchedSecondsRef.current : 0;

        if (playedSeconds <= 0 && safeMaxWatched > 0) return;

        if (resumeTime !== null && !hasSoughtRef.current) {
            if (playedSeconds < resumeTime - 2) {
                seekPlayer(resumeTime);
                return;
            } else {
                hasSoughtRef.current = true;
            }
        }

        if (currentActiveUnit.isCompleted || isLessonCompleted) {
            if (playedSeconds > safeMaxWatched) {
                maxWatchedSecondsRef.current = playedSeconds;
                const now = Date.now();
                if (now - lastSavedTimeRef.current > 3000) {
                    lastSavedTimeRef.current = now;
                    syncProgressToFirebase(100, playedSeconds);
                }
            }
            return;
        }

        if (playedSeconds > safeMaxWatched + 3.0) {
            seekPlayer(safeMaxWatched);
            return;
        }

        if (playedSeconds > safeMaxWatched) {
            maxWatchedSecondsRef.current = playedSeconds;
        }

        const effectiveMaxWatched = maxWatchedSecondsRef.current || 0;
        if (currentDuration <= 0) return;

        const pct = Math.min(100, Math.floor((effectiveMaxWatched / currentDuration) * 100));
        const watchedMins = Number((effectiveMaxWatched / 60).toFixed(2));
        const now = Date.now();

        if (now - lastRenderTimeRef.current > 1000) {
            lastRenderTimeRef.current = now;
            setCurrentWatchPct(pct);
            setCurrentWatchedMins(watchedMins);
        }

        const reqProgress = currentActiveUnit.requiredWatchPercentage || 90;
        const justCompleted = pct >= reqProgress && !isLessonCompleted;

        if (now - lastSavedTimeRef.current > 3000 || justCompleted) {
            lastSavedTimeRef.current = now;
            if (justCompleted) {
                setIsLessonCompleted(true);
            }
            syncProgressToFirebase(pct, effectiveMaxWatched);
        }
    };

    const handleVideoPause = () => {
        setIsPlaying(false);
        const safeMaxWatched = maxWatchedSecondsRef.current || 0;
        const currentDuration = getPlayerDuration();
        const pct = currentDuration > 0 ? Math.min(100, Math.floor((safeMaxWatched / currentDuration) * 100)) : currentWatchPct;
        syncProgressToFirebase(pct, safeMaxWatched);
    };

    const handleVideoEnded = () => {
        setIsPlaying(false);
        const realDuration = getPlayerDuration() || maxWatchedSecondsRef.current || 60;

        if (!isLessonCompleted && !currentActiveUnit.isCompleted) {
            if (realDuration > 0 && maxWatchedSecondsRef.current < realDuration * 0.9) {
                seekPlayer(maxWatchedSecondsRef.current);
                return;
            }
        }

        setIsLessonCompleted(true);
        setCurrentWatchPct(100);
        maxWatchedSecondsRef.current = realDuration;

        const hasQuiz = currentActiveUnit.interactiveCheck?.checkType && (currentActiveUnit.interactiveCheck.checkType as string) !== 'none';
        if (!hasQuiz && !hasLinkedAssessment) {
            handleCompleteVerificationCheck();
            if (autoNext && nextUnitPreview) {
                setIsAutoTransitioning(true);
                setTimeout(() => {
                    setIsAutoTransitioning(false);
                    handleSelectUnitWrapper(nextUnitPreview);
                }, 3000);
            }
        } else {
            syncProgressToFirebase(100, realDuration);
        }
    };

    const handleRestartVideo = () => {
        seekPlayer(0);
        setResumeTime(null);
        hasSoughtRef.current = true;
        setIsPlaying(true);
    };

    const toggleAutoNext = () => {
        const newVal = !autoNext;
        setAutoNext(newVal);
        localStorage.setItem('mlab_autonext', String(newVal));
    };

    const handleLaunchAssessment = (e: React.SyntheticEvent | React.MouseEvent | undefined, assessmentId: string) => {
        const targetUrl = `/assessment-player/${assessmentId}?courseId=${selectedCourse.id}&instanceId=${targetInstanceId || selectedCourse.id}&unitId=${currentActiveUnit.id}`;
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
        if (!assessmentId) return;
        navigate(targetUrl);
    };

    const handleToggleBookmark = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentActiveUnit?.id) return;
        setIsBookmarking(true);
        const docId = `${currentUser.uid}_${currentActiveUnit.id}`;
        const bookmarkRef = doc(db, 'learnerBookmarks', docId);

        try {
            if (isBookmarked) {
                await deleteDoc(bookmarkRef);
                setIsBookmarked(false);
            } else {
                await setDoc(bookmarkRef, {
                    userId: currentUser.uid,
                    courseId: selectedCourse.id,
                    containerId: primaryProgressKey,
                    unitId: currentActiveUnit.id,
                    unitTitle: currentActiveUnit.title,
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
            title: currentActiveUnit.title,
            text: `Check out "${currentActiveUnit.title}" on ${selectedCourse.title}!`,
            url: window.location.href,
        };
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                return;
            } catch (err: unknown) {
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

    const handleSaveNotes = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentActiveUnit?.id) return;
        setIsSavingNotes(true);
        try {
            const docRef = doc(db, 'learnerNotes', `${currentUser.uid}_${currentActiveUnit.id}`);
            await setDoc(docRef, {
                userId: currentUser.uid,
                courseId: selectedCourse.id,
                containerId: primaryProgressKey,
                unitId: currentActiveUnit.id,
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

    const handlePostComment = async () => {
        const currentUser = auth.currentUser;
        if (!newComment.trim() || !currentUser || !currentActiveUnit?.id || !targetInstanceId) return;
        setIsPostingComment(true);
        try {
            const userEmail = currentUser.email || 'Learner';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();
            await addDoc(collection(db, 'lessonComments'), {
                unitId: currentActiveUnit.id,
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

    const handlePostQuestion = async () => {
        const currentUser = auth.currentUser;
        if (!questionTitle.trim() || !questionBody.trim() || !currentUser || !currentActiveUnit?.id || !targetInstanceId) return;
        setIsSubmittingQA(true);
        try {
            const userEmail = currentUser.email || 'Learner';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();
            await addDoc(collection(db, 'lessonQuestions'), {
                unitId: currentActiveUnit.id,
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

    const handlePostAnswer = async () => {
        const currentUser = auth.currentUser;
        if (!answerBody.trim() || !currentUser || !selectedQuestion?.id || !targetInstanceId) return;

        setIsSubmittingQA(true);
        try {
            const userEmail = currentUser.email || 'Staff';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            const userDocRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userDocRef);
            const isStaffUser = userSnap.exists() && ['admin', 'facilitator', 'assessor', 'moderator'].includes(userSnap.data().role);

            await addDoc(collection(db, 'lessonQuestionAnswers'), {
                questionId: selectedQuestion.id,
                unitId: currentActiveUnit.id,
                containerId: targetInstanceId,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                contentHtml: answerBody,
                isStaff: isStaffUser,
                createdAt: serverTimestamp()
            });

            const qRef = doc(db, 'lessonQuestions', selectedQuestion.id);
            const updatePayload: Record<string, any> = {
                answersCount: increment(1),
                lastActivityAt: serverTimestamp()
            };

            if (isStaffUser) {
                updatePayload.hasStaffReply = true;
            }

            await updateDoc(qRef, updatePayload);
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

    const handleSelectUnitWrapper = (unit: LearnerUnitProgress) => {
        const url = new URL(window.location.href);
        url.searchParams.delete('quiz');
        url.searchParams.delete('exam');
        url.searchParams.set('unitId', unit.id);
        url.searchParams.set('hubView', 'player');
        window.history.replaceState({}, '', url.toString());
        setIsQuizMode(false);
        setIsExamMode(false);
        onSelectUnit(unit);
    };

    const generateSyntheticQuizUnit = (
        title: string,
        interactiveCheck: Record<string, unknown> | null | undefined,
        isLocked: boolean
    ): LearnerUnitProgress => ({
        id: `synthetic_${title.replace(/\s+/g, '_')}`,
        containerId: primaryProgressKey,
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

    const renderAssessmentWorkspace = () => {
        const meta = getAssessmentMeta(selectedCourse, currentActiveUnit);

        return (
            <div className="qcto-card animate-fade-in" style={{ padding: '24px 28px', background: '#0f172a', color: 'white', borderLeft: '6px solid #7c3aed' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #1e293b', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#c084fc', fontWeight: 800, fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Award size={14} /> {meta.overviewTitle}
                        </span>
                        <h2 style={{ margin: '4px 0 0 0', fontSize: '1.3rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            {currentActiveUnit.title} — Assessment Hub
                        </h2>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('lesson')}
                            className="lfm-btn lfm-btn--ghost"
                            style={{ color: '#94a3b8', border: '1px solid #334155' }}
                        >
                            <ArrowLeft size={14} /> Back to Lesson Stream
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* FORMATIVE PRACTICE GATE */}
                    {hasFormativeGate && (
                        <div style={{ background: '#1e293b', border: '1px solid #3b82f6', borderLeft: '4px solid #3b82f6', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                            <div>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <ShieldCheck size={14} /> Formative Assessment (Practice Drill)
                                </span>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'white', marginTop: '2px' }}>
                                    Formative Competency Verification
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                                    {isFormativePassed ? '✓ Passed (Competent)' : (formativeSubmission ? 'Submitted — Under Review' : 'Required practice drill prior to Official Exam')}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => handleLaunchAssessment(e, formativeId!)}
                                className="lfm-btn lfm-btn--primary"
                                style={{ borderRadius: '0px', background: '#0284c7', padding: '8px 18px', fontSize: '0.78rem' }}
                            >
                                {isFormativePassed ? 'Review Submission' : (formativeSubmission ? 'View Status' : 'Launch Formative Drill')}
                            </button>
                        </div>
                    )}

                    {/* OFFICIAL SUMMATIVE EXAM GATE */}
                    {hasSummativeGate && (
                        <div style={{
                            background: '#1e293b',
                            border: '1px solid #7c3aed',
                            borderLeft: '4px solid #7c3aed',
                            padding: '16px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '14px',
                            opacity: isSummativeLockedByFormative ? 0.6 : 1
                        }}>
                            <div>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Award size={14} /> Official Summative Assessment
                                </span>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'white', marginTop: '2px' }}>
                                    Accredited Formal Examination Module
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                                    {isSummativeLockedByFormative ? (
                                        <span style={{ color: '#f87171' }}><Lock size={11} style={{ display: 'inline' }} /> Locked: Complete and pass Formative practice drill first</span>
                                    ) : isSummativeCompetent ? (
                                        '✓ Endorsed Competent (C)'
                                    ) : isSummativeSubmitted ? (
                                        'Submitted — Pending Facilitator & Assessor Marking'
                                    ) : (
                                        'Required Milestone'
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={isSummativeLockedByFormative}
                                onClick={(e) => handleLaunchAssessment(e, summativeId!)}
                                className="lfm-btn"
                                style={{
                                    borderRadius: '0px',
                                    background: isSummativeLockedByFormative ? '#334155' : '#7c3aed',
                                    color: 'white',
                                    padding: '8px 18px',
                                    fontSize: '0.78rem',
                                    cursor: isSummativeLockedByFormative ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isSummativeSubmitted ? 'View Submission & Feedback' : 'Launch Official Exam'}
                            </button>
                        </div>
                    )}

                    {/* TASK CAPSTONE GATE */}
                    {hasOtherGate && (
                        <div style={{ background: '#1e293b', border: '1px solid #64748b', borderLeft: '4px solid #94a3b8', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                            <div>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <ClipboardCheck size={14} /> Capstone Assignment / Task
                                </span>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'white', marginTop: '2px' }}>
                                    Practical Coursework Task
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => handleLaunchAssessment(e, otherId!)}
                                className="lfm-btn"
                                style={{ borderRadius: '0px', background: '#334155', color: 'white', padding: '8px 18px', fontSize: '0.78rem' }}
                            >
                                Launch Task Workspace
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // useEffect(() => {
    //     if (!DEV_VERBOSE_LOGGING) return;
    //     console.group(`[AssessmentDebug] 🔍 ACTIVE UNIT DIAGNOSTIC FOR "${currentActiveUnit.title}" (ID: ${currentActiveUnit.id})`);
    //     console.log('📌 Raw currentActiveUnit Object:', currentActiveUnit);
    //     console.log('🎯 Resolved Assessment ID:', linkedAssessmentId);
    //     console.log('⚡ hasLinkedAssessment:', hasLinkedAssessment);
    //     console.log('🧩 hasInteractiveCheck:', hasInteractiveCheck);
    //     console.groupEnd();
    // }, [currentActiveUnit, linkedAssessmentId, hasLinkedAssessment, hasInteractiveCheck]);

    useEffect(() => {
        if (!DEV_VERBOSE_LOGGING || !courseUnits || courseUnits.length === 0) return;
        const map = courseUnits.map(u => ({
            id: u.id,
            title: u.title,
            resolvedAssessmentId: getUnitLinkedAssessmentId(u),
            interactiveCheckType: u.interactiveCheck?.checkType || 'none',
        }));
        console.log('[AssessmentDebug] 📊 ALL UNITS ASSESSMENT MAP:', map);
    }, [courseUnits]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);

        if (isQuizMode) url.searchParams.set('quiz', 'true');
        else url.searchParams.delete('quiz');

        if (isExamMode) url.searchParams.set('exam', 'true');
        else url.searchParams.delete('exam');

        window.history.replaceState({}, '', url.toString());
    }, [isQuizMode, isExamMode, currentActiveUnit?.id]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlQuizParam = params.get('quiz') === 'true';
        const urlExamParam = params.get('exam') === 'true';

        const standaloneQuiz = currentActiveUnit?.unitType !== 'video' &&
            currentActiveUnit?.unitType !== 'reading' &&
            currentActiveUnit?.interactiveCheck?.checkType &&
            (currentActiveUnit.interactiveCheck.checkType as string) !== 'none';

        setIsQuizMode(urlQuizParam || Boolean(standaloneQuiz));
        setIsExamMode(urlExamParam);
        setShowAttemptDrawer(false);
        debugWipedRef.current = false;
    }, [currentActiveUnit?.id, hasLinkedAssessment, hasInteractiveCheck]);

    useEffect(() => {
        if (!currentActiveUnit?.id) {
            setAttemptHistory([]);
            return;
        }

        let unsubAttempts: (() => void) | null = null;
        const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
            if (unsubAttempts) {
                unsubAttempts();
                unsubAttempts = null;
            }
            if (!currentUser) {
                setAttemptHistory([]);
                return;
            }
            try {
                const attemptsQuery = query(
                    collection(db, 'learner_quiz_attempts'),
                    where('userId', '==', currentUser.uid),
                    where('unitId', '==', currentActiveUnit.id)
                );

                unsubAttempts = onSnapshot(attemptsQuery, (snap) => {
                    if (debugWipedRef.current) return;

                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuizAttemptDoc));
                    list.sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));

                    setAttemptHistory(list);
                }, (err) => {
                    console.warn('[CoursePlayerView] Attempt history listener warning:', err);
                });
            } catch (e) {
                console.warn('[CoursePlayerView] Failed setting up attempt listener:', e);
            }
        });

        return () => {
            unsubAuth();
            if (unsubAttempts) unsubAttempts();
        };
    }, [currentActiveUnit?.id]);

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            setFormativeSubmission(null);
            setSummativeSubmission(null);
            setOtherSubmission(null);
            return;
        }

        const validIds = [formativeId, summativeId, otherId].filter(Boolean) as string[];
        if (validIds.length === 0) {
            setFormativeSubmission(null);
            setSummativeSubmission(null);
            setOtherSubmission(null);
            return;
        }

        const q = query(
            collection(db, 'learner_submissions'),
            where('assessmentId', 'in', validIds),
            where('authUid', '==', currentUser.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
            if (debugWipedRef.current) return;

            let fSub: any = null;
            let sSub: any = null;
            let oSub: any = null;

            snap.docs.forEach(docSnap => {
                const data = { id: docSnap.id, ...docSnap.data() } as any;
                if (data.assessmentId === formativeId) {
                    if (!fSub || new Date(data.createdAt || 0).getTime() > new Date(fSub.createdAt || 0).getTime()) fSub = data;
                }
                if (data.assessmentId === summativeId) {
                    if (!sSub || new Date(data.createdAt || 0).getTime() > new Date(sSub.createdAt || 0).getTime()) sSub = data;
                }
                if (data.assessmentId === otherId) {
                    if (!oSub || new Date(data.createdAt || 0).getTime() > new Date(oSub.createdAt || 0).getTime()) oSub = data;
                }
            });

            setFormativeSubmission(fSub);
            setSummativeSubmission(sSub);
            setOtherSubmission(oSub);
        }, (err) => {
            console.warn("[CoursePlayerView] Submissions snapshot notice:", err.message);
        });

        return () => unsub();
    }, [formativeId, summativeId, otherId]);

    useEffect(() => {
        if (!hasLinkedAssessment) {
            setFormalAssessmentPassed(true);
            return;
        }
        if (hasFormativeGate && !isFormativePassed) {
            setFormalAssessmentPassed(false);
            return;
        }
        if (hasSummativeGate) {
            const ext = currentActiveUnit as ExtendedLearnerUnitProgress;
            const requiresGrading = ext.assessmentGates?.summative?.unlockNextOn === 'grading' || ext.unlinkedPolicy === 'hard_gate';
            setFormalAssessmentPassed(requiresGrading ? isSummativeCompetent : isSummativeSubmitted);
            return;
        }
        setFormalAssessmentPassed(true);
    }, [hasLinkedAssessment, hasFormativeGate, isFormativePassed, hasSummativeGate, isSummativeCompetent, isSummativeSubmitted, currentActiveUnit]);

    useEffect(() => {
        const handleSandboxMessage = (event: MessageEvent) => {
            if (event.data?.type === 'SANDBOX_COMPLETED') {
                const targetUnitId = event.data.unitId;

                if (targetUnitId === currentActiveUnit.id) {
                    setShowGateCelebration(true);
                    setIsLessonCompleted(true);
                    syncProgressToFirebase(100, maxWatchedSecondsRef.current, true);
                }
            }
        };

        window.addEventListener('message', handleSandboxMessage);
        return () => window.removeEventListener('message', handleSandboxMessage);
    }, [currentActiveUnit.id]);

    useEffect(() => {
        setIsPlayerReady(false);
        setIsVideoBuffering(false);
        setIsPlaying(false);

        const timer = setTimeout(() => setIsPlayerReady(true), 3000);
        return () => clearTimeout(timer);
    }, [currentActiveUnit?.id, currentActiveUnit?.videoUrl]);

    useEffect(() => {
        if (resumeTime !== null && resumeTime > 0 && isPlayerReady && !hasSoughtRef.current && playerRef.current) {
            try {
                seekPlayer(resumeTime);
                hasSoughtRef.current = true;
            } catch (e) {
                console.error('[ReactPlayer] Early seek failed:', e);
            }
        }
    }, [resumeTime, isPlayerReady]);

    useEffect(() => {
        if (!isQuizMode || !hasBegunAttempt || isQuizPassed || timerRemaining === null) return;

        const interval = setInterval(() => {
            setTimerRemaining(prev => {
                if (prev === null) return null;
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isQuizMode, hasBegunAttempt, isQuizPassed, timerRemaining]);

    useEffect(() => {
        if (timerRemaining === 0 && !isQuizPassed && hasBegunAttempt && isQuizMode) {
            const handleTimeout = async () => {
                const checkType = currentActiveUnit.interactiveCheck?.checkType || 'unknown';

                if (checkType === 'oral_defense') {
                    setIsRecording(false);
                    setIsRecordingPaused(false);
                    setHasBegunAttempt(false);
                    setTimerRemaining(null);

                    if (recognitionRef.current) recognitionRef.current.stop();

                    manualSubmitFromReviewRef.current = true;

                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.stop();
                    } else if (audioBlobRef.current) {
                        await processAndSubmitAudio(audioBlobRef.current);
                    } else {
                        await handleCompleteVerificationCheck(
                            transcriptRef.current || "[Timeout - No speech detected]",
                            ""
                        );
                    }
                } else if (checkType === 'mcq') {
                    // For MCQ, Auto-submit what they have
                    const questions = activeMcqQuestions;
                    let correctCount = 0;
                    questions.forEach((q: MCQQuestion, idx: number) => {
                        const selectedOptId = mcqAnswers[q.id || idx];
                        const selectedOpt = q.options.find((o: MCQOption) => o.id === selectedOptId);
                        if (selectedOpt?.isCorrect) correctCount++;
                    });
                    const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
                    const passed = score >= 80;

                    await handleCompleteVerificationCheck(
                        `MCQ Timeout Submitted. Score: ${score}% (${correctCount}/${questions.length} correct). Responses: ${JSON.stringify(mcqAnswers)}`,
                        undefined,
                        passed,
                        score
                    );

                    setIsRecording(false);
                    setIsRecordingPaused(false);
                    setIsQuizMode(false);
                    setHasBegunAttempt(false);
                    setTimerRemaining(null);
                } else {
                    timerDiscardRef.current = true;
                    await logQuizAttempt(checkType, false, 'Timeout (Auto-Failed)', 'Time limit exceeded.');

                    setStatusModal({
                        type: 'error',
                        title: 'Time Expired ⏱',
                        message: 'You ran out of time for this knowledge check. A failed attempt has been recorded.'
                    });

                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.stop();
                    }

                    setIsRecording(false);
                    setIsRecordingPaused(false);
                    setIsQuizMode(false);
                    setHasBegunAttempt(false);
                    setTimerRemaining(null);
                }
            };
            handleTimeout();
        }
    }, [timerRemaining, isQuizPassed, hasBegunAttempt, isQuizMode, currentActiveUnit.interactiveCheck?.checkType, isRecording, mcqAnswers, activeMcqQuestions]);

    useEffect(() => {
        setHasBegunAttempt(false);
        setTimerRemaining(null);
        setIsReviewingAudio(false);
        setAudioReviewUrl(null);
        if (mediaRecorderRef.current && isRecording) {
            timerDiscardRef.current = true;
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            if (recognitionRef.current) recognitionRef.current.stop();
            setIsRecording(false);
        }
    }, [currentActiveUnit?.id]);

    useEffect(() => {
        const extUnit = currentActiveUnit as ExtendedLearnerUnitProgress;

        setIsLessonCompleted(currentActiveUnit.isCompleted || false);
        setCurrentWatchPct(extUnit.progressPercent || 0);

        setResumeTime(null);
        hasSoughtRef.current = false;
        setIsPlayerReady(false);
        setIsVideoBuffering(false);
        setIsBookmarked(false);
        setShareCopied(false);
        setIsPlaying(false);
        setIsAutoTransitioning(false);
        isHydratedRef.current = false;
        setMcqAnswers({});
        setSocraticInput('');

        const fetchLearnerData = async () => {
            const currentUser = auth.currentUser;
            if (!currentUser || !currentActiveUnit?.id) {
                setLearnerNotes('');
                isHydratedRef.current = true;
                setIsNotesLoading(false);
                return;
            }

            setIsNotesLoading(true);

            try {
                const noteRef = doc(db, 'learnerNotes', `${currentUser.uid}_${currentActiveUnit.id}`);
                const noteSnap = await getDoc(noteRef);
                if (noteSnap.exists()) {
                    setLearnerNotes(noteSnap.data().content || '');
                } else {
                    setLearnerNotes('');
                }
            } catch (err) {
                console.warn('[Firebase] Learner notes fetch notice:', err);
                setLearnerNotes('');
            }

            let cleanSavedSeconds = 0;
            let savedPct = 0;
            let completed = false;
            const validTargetKeys = targetKeys.filter(k => typeof k === 'string' && k.trim().length > 0);

            try {
                if (validTargetKeys.length > 0) {
                    const progressQuery = query(
                        collection(db, 'learner_content_progress'),
                        where('userId', '==', currentUser.uid),
                        where('unitId', '==', currentActiveUnit.id),
                        where('containerId', 'in', validTargetKeys)
                    );
                    const progressSnap = await getDocs(progressQuery);

                    if (!progressSnap.empty) {
                        progressSnap.docs.forEach(docSnap => {
                            const d = docSnap.data();
                            if (d.isCompleted) completed = true;
                            if ((Number(d.watchPct) || 0) > savedPct) savedPct = Number(d.watchPct) || 0;
                            if ((Number(d.lastPlayedSeconds) || 0) > cleanSavedSeconds) cleanSavedSeconds = Number(d.lastPlayedSeconds) || 0;
                        });
                    }
                }

                if (!completed && primaryProgressKey) {
                    const progressRef = doc(db, 'learner_content_progress', `${currentUser.uid}_${primaryProgressKey}_${currentActiveUnit.id}`);
                    const directSnap = await getDoc(progressRef);
                    if (directSnap.exists()) {
                        const d = directSnap.data();
                        if (d.isCompleted) completed = true;
                        if ((Number(d.watchPct) || 0) > savedPct) savedPct = Number(d.watchPct) || 0;
                        if ((Number(d.lastPlayedSeconds) || 0) > cleanSavedSeconds) cleanSavedSeconds = Number(d.lastPlayedSeconds) || 0;
                    }
                }
            } catch (err) {
                console.warn('[Firebase] Content progress fetch notice:', err);
            }

            if (cleanSavedSeconds > 86400) {
                cleanSavedSeconds = 0;
            }

            if (completed) {
                maxWatchedSecondsRef.current = cleanSavedSeconds;
                setIsLessonCompleted(true);
                setCurrentWatchPct(100);
                setCurrentWatchedMins(Number((cleanSavedSeconds / 60).toFixed(2)));
                setResumeTime(null);
                hasSoughtRef.current = true;
            } else if (cleanSavedSeconds > 3) {
                setResumeTime(cleanSavedSeconds);
                maxWatchedSecondsRef.current = cleanSavedSeconds;
                setCurrentWatchPct(savedPct);
                setCurrentWatchedMins(Number((cleanSavedSeconds / 60).toFixed(2)));

                if (savedPct >= (currentActiveUnit.requiredWatchPercentage || 90)) {
                    setIsLessonCompleted(true);
                }
            } else {
                maxWatchedSecondsRef.current = 0;
                setCurrentWatchPct(savedPct);
                setCurrentWatchedMins(0);
                setResumeTime(null);
                hasSoughtRef.current = true;
            }

            try {
                const bookmarkRef = doc(db, 'learnerBookmarks', `${currentUser.uid}_${currentActiveUnit.id}`);
                const bookmarkSnap = await getDoc(bookmarkRef);
                setIsBookmarked(bookmarkSnap.exists());
            } catch (err) {
                console.warn('[Firebase] Bookmarks fetch notice:', err);
                setIsBookmarked(false);
            } finally {
                isHydratedRef.current = true;
                setIsNotesLoading(false);
            }
        };

        fetchLearnerData();
    }, [currentActiveUnit.id, primaryProgressKey, targetKeysString, hasInteractiveCheck]);

    useEffect(() => {
        if (!currentActiveUnit?.id || !targetInstanceId) return;

        const q = query(
            collection(db, 'lessonComments'),
            where('unitId', '==', currentActiveUnit.id),
            limit(50)
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
    }, [currentActiveUnit?.id, targetInstanceId]);

    useEffect(() => {
        if (!currentActiveUnit?.id || !targetInstanceId) return;

        const q = query(
            collection(db, 'lessonQuestions'),
            where('unitId', '==', currentActiveUnit.id),
            limit(50)
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
    }, [currentActiveUnit?.id, targetInstanceId]);

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

    useEffect(() => {
        const handleBeforeUnload = () => {
            const maxSecs = maxWatchedSecondsRef.current;
            if (maxSecs <= 0) return;
            const pct = duration > 0 ? Math.min(100, Math.floor((maxSecs / duration) * 100)) : 0;
            if (pct <= 0) return;
            syncProgressToFirebase(pct, maxSecs);
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            const maxSecs = maxWatchedSecondsRef.current;
            if (maxSecs <= 0) return;
            const pct = duration > 0 ? Math.min(100, Math.floor((maxSecs / duration) * 100)) : 0;
            if (pct <= 0) return;
            syncProgressToFirebase(pct, maxSecs);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [duration, currentActiveUnit.id]);

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (isCourseComplete && currentUser && !learnerCertificate) {
            setIsSearchingCert(true);

            const fetchCertificate = async () => {
                if (targetKeys.length === 0) {
                    setIsSearchingCert(false);
                    return;
                }
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
    }, [isCourseComplete, selectedCourse.id, learnerCertificate, targetKeysString]);

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>

            {isCertModalOpen && learnerCertificate && (
                <CertificateModal certificate={learnerCertificate} onClose={() => setIsCertModalOpen(false)} />
            )}

            {statusModal && createPortal(
                <StatusModal
                    type={statusModal.type}
                    title={statusModal.title}
                    message={statusModal.message}
                    onClose={() => setStatusModal(null)}
                    confirmText="Got It"
                />,
                document.body
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
                        <div style={{ fontWeight: 800, fontSize: '0.82rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Milestone Cleared!</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>Assessment requirement verified</div>
                    </div>
                </div>
            )}

            {/* TOP BAR ACTION HEADER */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={onBackToOverview}
                        className="lfm-btn lfm-btn--ghost"
                    >
                        <ArrowLeft size={15} /> Back to Course Overview
                    </button>

                    <button
                        type="button"
                        onClick={handleToggleBookmark}
                        disabled={isBookmarking}
                        className="lfm-btn lfm-btn--ghost"
                        title="Bookmark this lesson"
                        style={{ color: isBookmarked ? '#0284c7' : 'inherit' }}
                    >
                        <Bookmark size={15} fill={isBookmarked ? 'currentColor' : 'none'} />
                        {isBookmarked ? 'Bookmarked' : 'Bookmark'}
                    </button>

                    <button
                        type="button"
                        onClick={handleShare}
                        className="lfm-btn lfm-btn--ghost"
                        title="Share lesson link"
                    >
                        <Share2 size={15} />
                        {shareCopied ? 'Link Copied!' : 'Share'}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(selectedCourse.tags || []).map(tag => (
                        <span key={tag} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-blue)', background: 'var(--mlab-light-blue)', border: '1px solid #bae6fd', padding: '4px 10px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            #{tag.replace(/\s+/g, '').toLowerCase()}
                        </span>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: currentViewMode !== 'lesson' ? '1fr' : '1fr 320px', gap: '20px', alignItems: 'start' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                    {/* ALWAYS VISIBLE ROADMAP */}
                    <div className="qcto-card" style={{ padding: '12px 16px', background: '#0f172a', border: '1px solid #1e293b' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', marginBottom: '8px' }}>
                            Lesson Completion Roadmap
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isWatchRequirementMet ? 1 : 0.8 }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isWatchRequirementMet ? '#15803d' : '#0284c7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                                    {isWatchRequirementMet ? <Check size={12} /> : '1'}
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isWatchRequirementMet ? '#86efac' : '#38bdf8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                    {isVideo ? 'Study Video' : 'Read Guide'}
                                </span>
                            </div>

                            {hasInteractiveCheck && (
                                <>
                                    <ArrowRight size={12} color="#475569" />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (isQuizMode || isWatchRequirementMet) ? 1 : 0.4 }}>
                                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isQuizPassed ? '#15803d' : isQuizMode ? '#0284c7' : isWatchRequirementMet ? '#f59e0b' : '#334155', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                                            {isQuizPassed ? <Check size={12} /> : '2'}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isQuizPassed ? '#86efac' : isQuizMode ? '#38bdf8' : isWatchRequirementMet ? '#fcd34d' : '#94a3b8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Knowledge Check {isQuizPassed && <Check size={11} color="#86efac" />}
                                        </span>
                                    </div>
                                </>
                            )}

                            {hasLinkedAssessment && (
                                <>
                                    <ArrowRight size={12} color="#475569" />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (!isWatchRequirementMet || (hasInteractiveCheck && !isQuizPassed)) ? 0.4 : formalAssessmentPassed ? 1 : 0.9 }}>
                                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: formalAssessmentPassed ? '#15803d' : (isWatchRequirementMet && (!hasInteractiveCheck || isQuizPassed)) ? '#9333ea' : '#334155', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                                            {formalAssessmentPassed ? <Check size={12} /> : hasInteractiveCheck ? '3' : '2'}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: formalAssessmentPassed ? '#86efac' : (isWatchRequirementMet && (!hasInteractiveCheck || isQuizPassed)) ? '#c084fc' : '#94a3b8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                            {getAssessmentMeta(selectedCourse, currentActiveUnit).shortTitle}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 1. MULTI-SLOT ASSESSMENT WORKSPACE VIEW */}
                    {currentViewMode === 'exam' && hasLinkedAssessment && renderAssessmentWorkspace()}

                    {/* 2. KNOWLEDGE CHECK / QUIZ VIEW */}
                    {currentViewMode === 'quiz' && hasInteractiveCheck && (
                        <div className="qcto-card" style={{ padding: '24px 28px', borderLeft: `6px solid ${gateAccent.color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                                <div>
                                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: gateAccent.color, fontWeight: 800, letterSpacing: '0.05em', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <GateIcon size={14} /> Stage 2: {gateAccent.label}

                                        {isQuizPassed && (
                                            <span style={{ fontSize: '0.58rem', background: '#052e16', color: '#4ade80', border: '1px solid #166534', padding: '1px 6px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                <Check size={9} /> Quiz Cleared
                                            </span>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => setShowAttemptDrawer(prev => !prev)}
                                            style={{
                                                background: '#1e293b',
                                                border: '1px solid #334155',
                                                color: '#38bdf8',
                                                padding: '2px 8px',
                                                fontSize: '0.62rem',
                                                fontWeight: 800,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                cursor: 'pointer',
                                                fontFamily: 'var(--font-heading)',
                                                textTransform: 'uppercase'
                                            }}
                                        >
                                            <History size={10} /> Attempt #{isQuizPassed ? attemptHistory.length : attemptHistory.length + 1} ({showAttemptDrawer ? 'Hide History ▲' : 'View History ▾'})
                                        </button>
                                    </span>
                                    <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        {currentActiveUnit.title}
                                    </h2>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                        Please complete the interactive check below to finalize your knowledge check.
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {timerRemaining !== null && hasBegunAttempt && !isQuizPassed && (
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 800,
                                            color: isTimerUrgent ? '#f87171' : '#38bdf8',
                                            background: isTimerUrgent ? '#450a0a' : '#0f172a',
                                            border: `1px solid ${isTimerUrgent ? '#991b1b' : '#1e293b'}`,
                                            padding: '4px 10px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontFamily: 'monospace',
                                            letterSpacing: '0.05em'
                                        }}>
                                            <Timer size={13} className={isTimerUrgent ? 'animate-pulse' : ''} />
                                            {isTimerUrgent ? 'URGENT: ' : 'Timer: '}{formatTime(timerRemaining)}
                                        </span>
                                    )}

                                    {isVideo && (
                                        <button
                                            type="button"
                                            onClick={() => setViewMode('lesson')}
                                            className="lfm-btn lfm-btn--ghost"
                                            style={{ color: 'var(--mlab-blue)' }}
                                        >
                                            <ArrowLeft size={14} /> Review Video Stream
                                        </button>
                                    )}
                                </div>
                            </div>

                            {showAttemptDrawer && (
                                <div className="animate-fade-in" style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #1e293b', background: '#020617', padding: '16px', border: '1px solid #334155' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <History size={13} /> Submission History Log ({attemptHistory.length} Recorded Attempts)
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {DEV_VERBOSE_LOGGING && attemptHistory.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={handleClearAttemptsDebug}
                                                    style={{ background: '#7f1d1d', color: '#fecaca', border: '1px solid #991b1b', fontSize: '0.65rem', fontWeight: 800, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}
                                                >
                                                    <Trash2 size={10} /> Reset Progress &amp; Delete Attempts (Debug)
                                                </button>
                                            )}
                                            <button type="button" onClick={() => setShowAttemptDrawer(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {attemptHistory.length === 0 ? (
                                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic', padding: '10px 0', textAlign: 'center' }}>
                                            No previous attempts recorded yet. This is your first attempt.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                                            {attemptHistory.map((att, idx) => {
                                                const attemptTime = att.attemptedAt?.toDate
                                                    ? att.attemptedAt.toDate().toLocaleString()
                                                    : (typeof att.attemptedAt === 'string' ? att.attemptedAt : 'Recorded');

                                                const isOral = att.checkType === 'oral_defense' || currentActiveUnit.interactiveCheck?.checkType === 'oral_defense';
                                                const isGraded = Boolean(att.gradedBy || (att as any).isGraded);
                                                const isPending = isOral && !isGraded;
                                                const isPassed = att.passed === true && !isPending;

                                                const hasFeedback = Boolean(
                                                    att.feedback ||
                                                    att.aiFeedback ||
                                                    att.overallFeedback ||
                                                    att.facilitatorFeedback ||
                                                    att.feedbackHtml
                                                );

                                                return (
                                                    <div key={att.id || idx} style={{
                                                        background: '#0f172a',
                                                        border: `1px solid ${isPassed ? '#166534' : isPending ? '#b45309' : '#991b1b'}`,
                                                        borderLeft: `4px solid ${isPassed ? '#16a34a' : isPending ? '#f59e0b' : '#f87171'}`,
                                                        padding: '10px 14px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '8px'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-heading)' }}>
                                                                    Attempt #{idx + 1}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: '0.62rem',
                                                                    background: isPassed ? '#052e16' : isPending ? '#451a03' : '#450a0a',
                                                                    color: isPassed ? '#4ade80' : isPending ? '#fbbf24' : '#fca5a5',
                                                                    border: `1px solid ${isPassed ? '#166534' : isPending ? '#b45309' : '#991b1b'}`,
                                                                    padding: '1px 6px',
                                                                    fontWeight: 800,
                                                                    textTransform: 'uppercase',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '3px'
                                                                }}>
                                                                    {isPassed ? <Check size={10} /> : isPending ? <Timer size={10} /> : <X size={10} />}
                                                                    {isPassed ? 'PASSED & VERIFIED' : isPending ? 'PENDING REVIEW ⏳' : 'FAILED / RETRY REQUIRED'}
                                                                </span>
                                                                {att.score !== undefined && att.score !== null && (
                                                                    <span style={{ fontSize: '0.65rem', background: '#1e293b', color: '#38bdf8', padding: '1px 6px', fontWeight: 800, border: '1px solid #334155' }}>
                                                                        Score: {att.score}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                                                {attemptTime}
                                                            </span>
                                                        </div>

                                                        {att.failureReason && (
                                                            <div style={{ fontSize: '0.72rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                                                ⚠️ {att.failureReason}
                                                            </div>
                                                        )}

                                                        <div>
                                                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <Code size={10} /> Submitted Response / Code Preview:
                                                            </div>
                                                            <div style={{ background: '#020617', color: '#38bdf8', padding: '8px', maxHeight: '160px', overflowY: 'auto', border: '1px solid #1e293b' }}>
                                                                {renderSubmittedContent(att)}
                                                            </div>
                                                        </div>

                                                        {hasFeedback && (
                                                            <div style={{ background: '#020617', border: '1px solid #1e293b', padding: '10px 12px', borderRadius: '2px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
                                                                    <Sparkles size={11} /> Assessment Feedback &amp; Review Notes:
                                                                </div>

                                                                {att.facilitatorFeedback && (
                                                                    <div style={{ fontSize: '0.75rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                                                                        <strong style={{ color: '#38bdf8' }}>Facilitator Note:</strong> {att.facilitatorFeedback}
                                                                    </div>
                                                                )}

                                                                {(att.aiFeedback || att.feedback || att.overallFeedback) && (
                                                                    <div style={{ fontSize: '0.75rem', color: '#cbd5e1', lineHeight: 1.4, fontStyle: 'italic' }}>
                                                                        {att.aiFeedback || att.feedback || att.overallFeedback}
                                                                    </div>
                                                                )}

                                                                {att.feedbackHtml && (
                                                                    <div style={{ fontSize: '0.75rem', color: '#cbd5e1', lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: att.feedbackHtml }} />
                                                                )}

                                                                {att.gradedBy && (
                                                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                                                        Graded by: <code style={{ color: '#94a3b8' }}>{graderNames[att.gradedBy] || att.gradedBy}</code>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* BEGIN ATTEMPT GATE */}
                            {!isQuizPassed && !hasBegunAttempt && !isReviewingAudio ? (
                                <div style={{ textAlign: 'center', padding: '40px', background: '#0f172a', border: `1px dashed #334155`, marginTop: '20px' }}>

                                    {isQuizPendingReview ? (
                                        <div className="animate-fade-in" style={{ background: '#1e1b4b', border: '1px solid #6366f1', padding: '24px', borderRadius: '4px', color: 'white', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
                                            <div style={{ width: '48px', height: '48px', background: '#312e81', color: '#818cf8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                                                <Timer size={24} />
                                            </div>
                                            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#c7d2fe' }}>
                                                Submission Under Assessor Review ⏳
                                            </h3>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                                                Your response has been recorded and submitted for grading. Re-recording is locked while an assessor reviews your submission. If your submission is found Not Yet Competent (NYC), a retry option will unlock automatically with assessor notes.
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            {isLatestAudioEmpty && (
                                                <div className="animate-fade-in" style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5', padding: '12px', borderRadius: '4px', marginBottom: '24px', fontSize: '0.85rem', textAlign: 'left' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                        <AlertTriangle size={14} /> Empty Transcript Detected
                                                    </div>
                                                    Your audio was submitted, but the AI could not detect any speech (or a default bypassed answer was recorded). Please ensure your microphone is working and try again.
                                                </div>
                                            )}

                                            {hasFailedAttempts && (
                                                <div className="animate-fade-in" style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5', padding: '12px 16px', borderRadius: '4px', marginBottom: '24px', textAlign: 'left' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)', fontSize: '0.8rem' }}>
                                                        <AlertTriangle size={15} /> Previous Attempt (#{attemptHistory.length}) Requires Re-submission
                                                    </div>
                                                    {attemptHistory[attemptHistory.length - 1]?.facilitatorFeedback && (
                                                        <div style={{ fontSize: '0.8rem', color: '#fecaca', marginTop: '6px', lineHeight: 1.4 }}>
                                                            <strong>Facilitator Note:</strong> "{attemptHistory[attemptHistory.length - 1].facilitatorFeedback}"
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '6px' }}>
                                                        Review your previous response in the history log above, then click below to start Attempt #{attemptHistory.length + 1}.
                                                    </div>
                                                </div>
                                            )}

                                            <h3 style={{ color: 'white', marginBottom: '16px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                {attemptHistory.length > 0 ? `Ready for Attempt #${attemptHistory.length + 1}?` : 'Ready to begin your attempt?'}
                                            </h3>
                                            <p style={{ color: '#94a3b8', marginBottom: '24px', fontSize: '0.85rem' }}>
                                                {currentActiveUnit.interactiveCheck?.checkType === 'oral_defense'
                                                    ? 'To begin this assessment, please grant microphone permissions. The prompt and timer will be revealed once recording starts.'
                                                    : 'Once you begin, the timer will start and you must complete the check.'}
                                            </p>
                                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={currentActiveUnit.interactiveCheck?.checkType === 'oral_defense' ? handleStartOralDefense : handleBeginGenericAttempt}
                                                    className="lfm-btn lfm-btn--primary"
                                                    disabled={isKnowledgeCheckLocked || isQuizPendingReview || isQuizPassed}
                                                    style={{
                                                        padding: '10px 24px',
                                                        fontSize: '0.9rem',
                                                        background: gateAccent.bg || '#b45309',
                                                        borderRadius: '0px',
                                                        opacity: (isKnowledgeCheckLocked || isQuizPendingReview || isQuizPassed) ? 0.5 : 1,
                                                        cursor: (isKnowledgeCheckLocked || isQuizPendingReview || isQuizPassed) ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    {currentActiveUnit.interactiveCheck?.checkType === 'oral_defense'
                                                        ? '🎙️ Grant Access & Begin Attempt'
                                                        : (attemptHistory.length > 0 ? `Begin Attempt #${attemptHistory.length + 1}` : 'Begin Attempt')}
                                                </button>

                                                {/* PROCEED BUTTON ONLY UNLOCKS AFTER AT LEAST 1 ATTEMPT IS MADE */}
                                                {attemptHistory.length > 0 && (
                                                    hasLinkedAssessment && !formalAssessmentPassed ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setViewMode('exam')}
                                                            className="lfm-btn"
                                                            style={{ background: '#7c3aed', color: 'white', borderRadius: '0px', padding: '10px 20px', fontSize: '0.85rem' }}
                                                        >
                                                            Proceed to Formal Exam <ChevronRight size={14} />
                                                        </button>
                                                    ) : nextUnitPreview ? (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleNextLesson(e, true)}
                                                            className="lfm-btn lfm-btn--ghost"
                                                            style={{ border: '1px solid #334155', color: '#38bdf8', padding: '10px 20px', fontSize: '0.85rem' }}
                                                        >
                                                            Continue to Next Lesson <ChevronRight size={14} />
                                                        </button>
                                                    ) : null
                                                )}
                                            </div>

                                            {DEV_VERBOSE_LOGGING && (
                                                <div style={{ marginTop: '20px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCompleteVerificationCheck('Bypassed via Debug')}
                                                        className="lfm-btn lfm-btn--ghost"
                                                        style={{ fontSize: '0.7rem' }}
                                                    >
                                                        <Check size={13} /> Bypass Check (Debug)
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {currentActiveUnit.interactiveCheck?.checkType === 'oral_defense' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                                            {(hasBegunAttempt || isQuizPassed || isReviewingAudio) && (
                                                <div className="animate-fade-in" style={{ background: '#1e293b', border: '1px solid #334155', padding: '16px', borderRadius: '4px' }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#a855f7', marginBottom: '8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Bot size={14} /> AI Audio Transcript Prompt
                                                    </div>
                                                    <div style={{ fontSize: '0.9rem', color: '#f8fafc', lineHeight: 1.5 }}>
                                                        "{currentActiveUnit.interactiveCheck?.defenseQuestion || currentActiveUnit.interactiveCheck?.instructions}"
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ padding: '24px', border: '1px dashed #334155', textAlign: 'center', color: '#64748b', fontSize: '0.8rem', background: '#020617' }}>
                                                {isQuizPassed ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                                                        <div style={{ color: '#4ade80', fontWeight: 800, textAlign: 'center' }}>✓ You have successfully completed this audio assessment.</div>
                                                    </div>
                                                ) : isReviewingAudio ? (
                                                    <div className="animate-fade-in" style={{ textAlign: 'left' }}>
                                                        <div style={{ marginBottom: '16px', color: '#cbd5e1', fontWeight: 600, textAlign: 'center' }}>
                                                            Recording complete. Review your audio and transcript below before submitting.
                                                        </div>

                                                        {audioReviewUrl && (
                                                            <div style={{ marginBottom: '16px' }}>
                                                                <audio controls src={audioReviewUrl} style={{ width: '100%', height: '40px', outline: 'none' }} />
                                                            </div>
                                                        )}

                                                        <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '16px', borderRadius: '4px', marginBottom: '24px' }}>
                                                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)' }}>
                                                                <Mic size={12} /> Captured Live Transcript
                                                            </div>
                                                            <div style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.6, fontStyle: 'italic' }}>
                                                                {liveTranscript ? `"${liveTranscript}"` : "No speech detected in this recording."}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                            <button type="button" onClick={handleDiscardAndRerecord} className="lfm-btn lfm-btn--ghost" style={{ border: '1px solid #334155', color: '#94a3b8', borderRadius: '0px' }}>
                                                                <RotateCcw size={14} /> Discard &amp; Re-Record
                                                            </button>

                                                            {timerRemaining !== null && timerRemaining > 0 && (
                                                                <button type="button" onClick={handleResumeRecording} className="lfm-btn" style={{ background: '#0284c7', color: 'white', borderRadius: '0px' }}>
                                                                    <Mic size={14} /> Resume Recording
                                                                </button>
                                                            )}

                                                            <button type="button" onClick={handleConfirmAudioSubmission} className="lfm-btn lfm-btn--green" style={{ borderRadius: '0px' }}>
                                                                {isProcessingAudio ? <Loader2 size={14} className="lfm-spin" /> : <Send size={14} />} Submit Final Audio
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="animate-fade-in">
                                                        <div style={{ marginBottom: '16px' }}>
                                                            Recording in progress. Speak your answer clearly.
                                                        </div>

                                                        {isRecording && !isRecordingPaused && (
                                                            <div style={{ background: '#020617', border: '1px solid #1e293b', padding: '16px', borderRadius: '4px', marginBottom: '16px', textAlign: 'left' }}>
                                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', animation: 'pulse 2s infinite', fontFamily: 'var(--font-heading)' }}>
                                                                    <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }} /> Listening...
                                                                </div>
                                                                <div style={{ fontSize: '0.85rem', color: '#f8fafc', lineHeight: 1.6, fontStyle: 'italic', minHeight: '40px' }}>
                                                                    {liveTranscript ? `"${liveTranscript}"` : "Waiting for speech..."}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {isProcessingAudio ? (
                                                            <button type="button" disabled className="lfm-btn" style={{ background: '#4c1d95', color: 'white', borderRadius: '4px', opacity: 0.8 }}>
                                                                <Loader2 size={16} className="lfm-spin" /> Processing Audio...
                                                            </button>
                                                        ) : isRecording && !isRecordingPaused ? (
                                                            <button type="button" onClick={handlePauseAndReview} className="lfm-btn" style={{ background: '#f59e0b', color: 'white', borderRadius: '0px' }}>
                                                                <Pause size={14} fill="currentColor" /> Pause &amp; Review
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {currentActiveUnit.interactiveCheck?.checkType === 'spot_the_bug' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1' }}>
                                                    {currentActiveUnit.interactiveCheck?.instructions}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={handleLaunchSandbox}
                                                    disabled={isQuizPassed}
                                                    className="lfm-btn lfm-btn--green"
                                                    style={{ borderRadius: '0px', padding: '4px 12px', fontSize: '0.75rem', opacity: isQuizPassed ? 0.5 : 1 }}
                                                >
                                                    <ExternalLink size={12} style={{ marginRight: '4px' }} /> Launch IDE Sandbox
                                                </button>
                                            </div>

                                            <div style={{ padding: '20px', border: '1px dashed #334155', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                                                {isQuizPassed ? 'Code repaired and verified.' : 'Click "Launch IDE Sandbox" to open the code editor in a standalone window. Once you fix the bug and submit your code in the IDE window, this check will automatically mark as complete.'}
                                            </div>

                                            {!isQuizPassed && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCompleteVerificationCheck()}
                                                    className="lfm-btn lfm-btn--primary"
                                                    style={{ alignSelf: 'flex-start', borderRadius: '0px', marginTop: '8px' }}
                                                >
                                                    <Check size={13} /> Bypass &amp; Mark Knowledge Check Submitted
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {currentActiveUnit.interactiveCheck?.checkType === 'socratic_dialogue' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                                            <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px', fontSize: '0.82rem', color: '#fbbf24' }}>
                                                🤖 <strong>AI Persona Prompt:</strong> "{currentActiveUnit.interactiveCheck?.instructions}"
                                            </div>

                                            <textarea
                                                rows={3}
                                                placeholder={isQuizPassed ? "Answer submitted." : "Type your explanation to the AI assessor..."}
                                                value={socraticInput}
                                                onChange={e => setSocraticInput(e.target.value)}
                                                style={{ width: '100%', fontSize: '0.82rem', padding: '10px', border: '1px solid #334155', background: '#020617', color: 'white', borderRadius: '0px', outline: 'none' }}
                                                disabled={isQuizPassed}
                                            />

                                            {!isQuizPassed && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCompleteVerificationCheck()}
                                                    className="lfm-btn lfm-btn--primary"
                                                    style={{ alignSelf: 'flex-start', borderRadius: '0px' }}
                                                >
                                                    <Send size={13} /> Send Answer to AI Assessor
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* MCQ STUDENT UI */}
                                    {currentActiveUnit.interactiveCheck?.checkType === 'mcq' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                                            <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '16px', borderRadius: '4px' }}>
                                                <div style={{ fontSize: '0.85rem', color: '#4ade80', fontWeight: 800, marginBottom: '16px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <HelpCircle size={16} /> Multiple Choice Quiz Bank
                                                </div>

                                                {activeMcqQuestions.map((q: MCQQuestion, qIdx: number) => (
                                                    <div key={q.id || qIdx} style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: qIdx < (activeMcqQuestions.length - 1) ? '1px dashed #334155' : 'none' }}>
                                                        <div style={{ fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700, marginBottom: '12px', lineHeight: 1.5 }}>
                                                            <span style={{ color: '#38bdf8', marginRight: '6px' }}>{qIdx + 1}.</span> {q.question}
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {(q.options || []).map((opt: MCQOption, oIdx: number) => {
                                                                const isSelected = mcqAnswers[q.id || qIdx] === opt.id;
                                                                return (
                                                                    <label
                                                                        key={opt.id || oIdx}
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '10px',
                                                                            padding: '10px 14px',
                                                                            background: isSelected ? 'rgba(56, 189, 248, 0.1)' : '#0f172a',
                                                                            border: `1px solid ${isSelected ? '#38bdf8' : '#334155'}`,
                                                                            borderRadius: '4px',
                                                                            cursor: isQuizPassed ? 'default' : 'pointer',
                                                                            transition: 'all 0.2s ease',
                                                                            color: '#e2e8f0',
                                                                            fontSize: '0.85rem'
                                                                        }}
                                                                    >
                                                                        <input
                                                                            type="radio"
                                                                            name={`mcq_${q.id || qIdx}`}
                                                                            value={opt.id}
                                                                            checked={isSelected}
                                                                            disabled={isQuizPassed}
                                                                            onChange={() => {
                                                                                if (!isQuizPassed) {
                                                                                    setMcqAnswers(prev => ({ ...prev, [q.id || qIdx]: opt.id }));
                                                                                }
                                                                            }}
                                                                            style={{ margin: 0, cursor: isQuizPassed ? 'default' : 'pointer' }}
                                                                        />
                                                                        <span style={{ flex: 1 }}>{opt.text}</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {!isQuizPassed && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const questions = activeMcqQuestions;
                                                        const answeredCount = Object.keys(mcqAnswers).length;
                                                        if (answeredCount < questions.length) {
                                                            setStatusModal({
                                                                type: 'warning',
                                                                title: 'Incomplete Quiz',
                                                                message: 'Please answer all questions before submitting.'
                                                            });
                                                            return;
                                                        }

                                                        let correctCount = 0;
                                                        const responseDetails: string[] = [];
                                                        questions.forEach((q: MCQQuestion, idx: number) => {
                                                            const selectedOptId = mcqAnswers[q.id || idx];
                                                            const selectedOpt = q.options.find((o: MCQOption) => o.id === selectedOptId);
                                                            const isCorrect = selectedOpt?.isCorrect;
                                                            if (isCorrect) correctCount++;
                                                            responseDetails.push(`Q${idx + 1}: ${q.question} | Selected: "${selectedOpt ? selectedOpt.text : 'None'}" [${isCorrect ? 'Correct ✓' : 'Incorrect ✗'}]`);
                                                        });

                                                        const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
                                                        const passed = score >= 80;

                                                        const summaryText = `MCQ Submitted. Score: ${score}% (${correctCount}/${questions.length} correct).\n` + responseDetails.join('\n') + `\nResponses: ${JSON.stringify(mcqAnswers)}`;

                                                        handleCompleteVerificationCheck(
                                                            summaryText,
                                                            undefined,
                                                            passed,
                                                            score
                                                        );
                                                    }}
                                                    className="lfm-btn lfm-btn--primary"
                                                    style={{ alignSelf: 'flex-start', borderRadius: '0px' }}
                                                >
                                                    <Send size={13} /> Submit Quiz Answers
                                                </button>
                                            )}
                                        </div>
                                    )}

                                </>
                            )}

                            {/* QUIZ FOOTER ACTION BAR */}
                            <div style={{ marginTop: '20px', borderTop: '1px solid #1e293b', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    {hasFailedAttempts && !isQuizPassed && (
                                        <span style={{ fontSize: '0.72rem', color: '#fca5a5' }}>
                                            ⚠️ You can re-attempt this check or continue to the next stage below.
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    {(isQuizPassed || attemptHistory.length > 0) && (
                                        hasLinkedAssessment && !formalAssessmentPassed ? (
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('exam')}
                                                className="lfm-btn"
                                                style={{ background: '#7c3aed', color: 'white', borderRadius: '0px' }}
                                            >
                                                {isQuizPassed ? 'Proceed to Formal Exam' : 'Continue to Formal Exam'} <ChevronRight size={14} />
                                            </button>
                                        ) : nextUnitPreview ? (
                                            <button
                                                type="button"
                                                onClick={(e) => handleNextLesson(e, true)}
                                                className="lfm-btn lfm-btn--green"
                                                style={{ borderRadius: '0px' }}
                                            >
                                                {isQuizPassed ? 'Proceed to Next Lesson' : 'Continue to Next Lesson'} <ChevronRight size={14} />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={onBackToOverview}
                                                className="lfm-btn lfm-btn--ghost"
                                                style={{ color: '#cbd5e1', border: '1px solid #334155' }}
                                            >
                                                Return to Course Overview
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. LESSON VIEW (Standard Video / Reading, Pipeline, Facilitators, Tabs) */}
                    {currentViewMode === 'lesson' && (
                        <>
                            {currentActiveUnit.unitType === 'video' && (
                                <div className="qcto-card">
                                    <div className="qcto-hdr" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Tv size={14} /> Video Stream
                                            {isWatchRequirementMet && (
                                                <span style={{ background: '#15803d', color: 'white', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                                    <CheckCircle2 size={9} /> Completed
                                                </span>
                                            )}
                                            {resumeTime && resumeTime > 0 && (
                                                <span style={{ background: '#334155', color: '#fcd34d', padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                                    <RotateCcw size={9} /> Resumed at {formatTime(resumeTime)}
                                                </span>
                                            )}
                                            {currentWatchedMins > 0 && (
                                                <span style={{ fontSize: '0.62rem', color: '#94a3b8', marginLeft: '6px' }}>
                                                    ({currentWatchedMins}m watched)
                                                </span>
                                            )}
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={toggleAutoNext}
                                                style={{
                                                    background: autoNext ? '#0284c7' : 'transparent',
                                                    border: '1px solid rgba(255,255,255,0.4)',
                                                    color: 'white',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 800,
                                                    padding: '2px 8px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontFamily: 'var(--font-heading)',
                                                    textTransform: 'uppercase'
                                                }}
                                                title="Automatically open next lesson upon video completion"
                                            >
                                                Auto-Next: {autoNext ? 'ON' : 'OFF'}
                                            </button>

                                            {currentActiveUnit.videoUrl && (
                                                <>
                                                    {(resumeTime || isLessonCompleted || currentActiveUnit.isCompleted || maxWatchedSecondsRef.current > 0) && (
                                                        <button
                                                            type="button"
                                                            onClick={handleRestartVideo}
                                                            style={{
                                                                background: 'transparent',
                                                                border: '1px solid rgba(255,255,255,0.4)',
                                                                color: 'white',
                                                                fontSize: '0.65rem',
                                                                fontWeight: 800,
                                                                padding: '2px 8px',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                fontFamily: 'var(--font-heading)',
                                                                textTransform: 'uppercase'
                                                            }}
                                                            title="Restart video from the beginning"
                                                        >
                                                            <RotateCcw size={10} /> Restart Video
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
                                                            padding: '2px 8px',
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
                                            <span>{currentActiveUnit.estimatedMinutes} MINS</span>
                                        </span>
                                    </div>

                                    <div style={{ background: '#020617', width: '100%', aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
                                        {formattedVideoUrl ? (
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
                                                        color: 'white',
                                                        pointerEvents: 'none'
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
                                                                Preparing media playback for {currentActiveUnit.title}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <MediaController style={{ width: "100%", aspectRatio: "16 / 9", position: 'absolute', top: 0, left: 0, background: '#000' }}>
                                                    <ReactPlayer
                                                        ref={playerRef}
                                                        slot="media"
                                                        src={formattedVideoUrl}
                                                        playing={isPlaying}
                                                        controls={false}
                                                        width="100%"
                                                        height="100%"
                                                        style={{ width: "100%", height: "100%", "--controls": "none" } as React.CSSProperties}
                                                        config={{ youtube: { playerVars: { disablekb: 1, modestbranding: 1, rel: 0, controls: 0 } } }}
                                                        onReady={handlePlayerReady}
                                                        onStart={handleVideoPlay}
                                                        onPlay={handleVideoPlay}
                                                        onPause={handleVideoPause}
                                                        onEnded={handleVideoEnded}
                                                        onProgress={(e) => handlePlayerTimeUpdate(e)}
                                                        onTimeUpdate={(e) => handlePlayerTimeUpdate(e)}
                                                        onError={(err: any) => {
                                                            console.warn('[ReactPlayer] Stream load error:', err);
                                                            setIsPlayerReady(true);
                                                            setIsVideoBuffering(false);
                                                        }}
                                                        onBuffer={() => setIsVideoBuffering(true)}
                                                        onBufferEnd={() => setIsVideoBuffering(false)}
                                                    />
                                                    <MediaControlBar>
                                                        <MediaPlayButton />
                                                        <MediaSeekBackwardButton seekOffset={10} />
                                                        <MediaSeekForwardButton seekOffset={10} />
                                                        <MediaTimeRange />
                                                        <MediaTimeDisplay showDuration />
                                                        <MediaMuteButton />
                                                        <MediaVolumeRange />
                                                        <MediaPlaybackRateButton />

                                                        <MediaFullscreenButton />
                                                    </MediaControlBar>
                                                </MediaController>

                                                {/* AUTO-NEXT TRANSITION OVERLAY */}
                                                {isAutoTransitioning && nextUnitPreview && (
                                                    <div className="animate-fade-in" style={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        zIndex: 50,
                                                        background: 'rgba(0, 0, 0, 0.65)',
                                                        backdropFilter: 'grayscale(100%) blur(4px)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'white',
                                                        textAlign: 'center'
                                                    }}>
                                                        <Loader2 size={42} className="lfm-spin" style={{ color: '#cbd5e1', marginBottom: '16px' }} />
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f8fafc' }}>
                                                            Navigating to next video...
                                                        </div>
                                                        <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '8px', maxWidth: '80%', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                            <Tv size={14} /> {nextUnitPreview.title}
                                                        </div>
                                                    </div>
                                                )}
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

                            {currentActiveUnit.unitType === 'reading' && (
                                <div className="qcto-card">
                                    <div className="qcto-hdr" style={{ fontSize: '0.75rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} /> Reading Guide</span>
                                        <span>{currentActiveUnit.estimatedMinutes} MINS READ</span>
                                    </div>
                                    <div style={{ padding: '24px', color: '#0f172a' }}>
                                        <div className="ql-editor" style={{ padding: 0, minHeight: 'auto', fontSize: '0.9rem', lineHeight: 1.6, color: '#0f172a' }}>
                                            <div dangerouslySetInnerHTML={{ __html: currentActiveUnit.contentHtml || '<p>Reading content loading...</p>' }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ANIMATED LEARNING FLOW PROCESS PIPELINE */}
                            <div style={{ marginBottom: '16px' }}>
                                <LearningFlow
                                    stages={learningFlowStages}
                                    statuses={learningFlowStatuses}
                                    selected={learningFlowSelectedIndex}
                                    onSelect={handleLearningFlowSelect}
                                    onAction={handleLearningFlowAction}
                                />
                            </div>

                            {/* FACILITATORS */}
                            {facilitators.length > 0 && (
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

                            {/* LESSON TABS */}
                            <div className="qcto-card">
                                <div style={{ display: 'flex', borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-light-blue)' }}>
                                    {LESSON_TABS.map(tab => {
                                        const TabIcon = tab.icon;
                                        const isActive = activeLessonTab === tab.key;
                                        return (
                                            <button
                                                key={tab.key}
                                                type="button"
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

                                <div style={{ padding: '16px', minHeight: '320px', display: 'flex', flexDirection: 'column' }}>
                                    {activeLessonTab === 'notes' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Your Personal Workspace</span>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveNotes}
                                                    disabled={isSavingNotes || isNotesLoading}
                                                    style={{ color: noteSavedFeedback ? '#15803d' : 'var(--mlab-blue)', background: 'transparent', border: 'none', fontWeight: 800, cursor: 'pointer' }}
                                                >
                                                    {isSavingNotes ? 'Saving...' : noteSavedFeedback ? '✓ Saved!' : 'Save Note'}
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
                                                    style={{ width: '100%', flex: 1, padding: '12px', fontSize: '0.8rem', background: '#f8fafc', border: '1px solid #cbd5e1', outline: 'none', resize: 'none' }}
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
                                                    type="button"
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
                                                                type="button"
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

                                            {!(currentActiveUnit as ExtendedLearnerUnitProgress).relatedLinks || (currentActiveUnit as ExtendedLearnerUnitProgress).relatedLinks?.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)', flex: 1 }}>
                                                    <Sparkles size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                                    <p style={{ margin: 0, fontSize: '0.82rem' }}>No supplemental resources have been added to this lesson yet.</p>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', overflowY: 'auto', maxHeight: '380px' }}>
                                                    {((currentActiveUnit as ExtendedLearnerUnitProgress).relatedLinks || []).map((link, idx) => {
                                                        let domain = 'External Link';
                                                        try { domain = new URL(link.url).hostname.replace('www.', ''); } catch (e) { }

                                                        return (
                                                            <a
                                                                key={idx}
                                                                href={link.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                                                                    background: '#f8fafc', border: '1px solid var(--mlab-border)',
                                                                    textDecoration: 'none', color: 'inherit', transition: 'background-color 0.2s ease'
                                                                }}
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
                        </>
                    )}

                </div>

                {/* RIGHT SIDEBAR (Only in Lesson View) */}
                {currentViewMode === 'lesson' && (
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
                                    <span>{completedCountForLabel} OF {selectedCourse.totalUnitsCount || enrichedCourseUnits.length} LESSONS</span>
                                </div>
                                <ProgressBar
                                    completed={dynamicCompletedCount}
                                    total={selectedCourse.totalUnitsCount || enrichedCourseUnits.length}
                                />

                                {isCourseComplete && (
                                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--mlab-border)' }}>
                                        {learnerCertificate ? (
                                            <button
                                                type="button"
                                                onClick={() => setIsCertModalOpen(true)}
                                                className="lfm-btn lfm-btn--green"
                                                style={{ width: '100%', borderRadius: '0px', padding: '6px 12px', fontSize: '0.75rem' }}
                                            >
                                                <Award size={14} /> View Certificate
                                            </button>
                                        ) : isSearchingCert ? (
                                            <div style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Loader2 size={12} className="lfm-spin" /> Verifying certificate records...
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        </div>

                        {nestedSyllabus.map((mainGroup, mainIdx) => {
                            const hasSelectedUnitMain = mainGroup.subGroups.some(sg => sg.units.some(u => u.id === currentActiveUnit.id) || (sg.dayCheckpoint && `synthetic_${sg.title}` === currentActiveUnit.id));
                            const isMainOpen = expandedMainGroups[mainGroup.title] !== undefined ? expandedMainGroups[mainGroup.title] : hasSelectedUnitMain;

                            return (
                                <div key={mainGroup.title} className="qcto-card" style={{ marginBottom: '12px' }}>
                                    <button
                                        type="button"
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
                                                const hasSelectedUnitSub = subGroup.units.some(u => u.id === currentActiveUnit.id) || (subGroup.dayCheckpoint && `synthetic_${subGroup.title}` === currentActiveUnit.id);
                                                const isSubOpen = expandedSubGroups[subKey] !== undefined ? expandedSubGroups[subKey] : hasSelectedUnitSub;
                                                const subDone = subGroup.units.filter(u => u.isCompleted).length;

                                                return (
                                                    <div key={subKey} style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', borderRadius: '0px' }}>

                                                        <button
                                                            type="button"
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
                                                                    const isCurrent = u.id === currentActiveUnit.id;
                                                                    const isClickable = isCurrent || unlockedUnitIds.has(u.id);

                                                                    const unitAssessment = getUnitLinkedAssessmentId(u);
                                                                    const unitMeta = getAssessmentMeta(selectedCourse, u);

                                                                    return (
                                                                        <div
                                                                            key={u.id}
                                                                            onClick={() => { if (isClickable) handleSelectUnitWrapper(u); }}
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
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, opacity: isClickable ? 1 : 0.5 }}>
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
                                                                                </span>

                                                                                {/* BADGE 1: Knowledge Check / Interactive Quiz */}
                                                                                {u.interactiveCheck?.checkType && u.interactiveCheck.checkType !== 'none' && (
                                                                                    <Tooltip content="Includes Stage 2 Knowledge Check" placement="top">
                                                                                        <span style={{
                                                                                            fontSize: '0.58rem',
                                                                                            fontWeight: 800,
                                                                                            background: '#fef3c7',
                                                                                            color: '#b45309',
                                                                                            border: '1px solid #fde68a',
                                                                                            padding: '1px 5px',
                                                                                            borderRadius: '2px',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '2px',
                                                                                            fontFamily: 'var(--font-heading)',
                                                                                            textTransform: 'uppercase',
                                                                                            flexShrink: 0
                                                                                        }}>
                                                                                            <Zap size={9} fill="#b45309" /> Quiz
                                                                                        </span>
                                                                                    </Tooltip>
                                                                                )}

                                                                                {/* BADGE 2: Formal Assessment (Dynamic Framework Labeling) */}
                                                                                {Boolean(unitAssessment) && (
                                                                                    <Tooltip content={`Includes ${unitMeta.title}`} placement="top">
                                                                                        <span style={{
                                                                                            fontSize: '0.58rem',
                                                                                            fontWeight: 800,
                                                                                            background: '#f3e8ff',
                                                                                            color: '#6b21a8',
                                                                                            border: '1px solid #e9d5ff',
                                                                                            padding: '1px 5px',
                                                                                            borderRadius: '2px',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '2px',
                                                                                            fontFamily: 'var(--font-heading)',
                                                                                            textTransform: 'uppercase',
                                                                                            flexShrink: 0
                                                                                        }}>
                                                                                            <Award size={9} /> {unitMeta.badge}
                                                                                        </span>
                                                                                    </Tooltip>
                                                                                )}
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
                                                                                handleSelectUnitWrapper(generateSyntheticQuizUnit(`${subGroup.title} Assessment`, subGroup.dayCheckpoint, false));
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'space-between',
                                                                            gap: '8px',
                                                                            padding: '10px 12px',
                                                                            cursor: subGroup.isDayComplete ? 'pointer' : 'not-allowed',
                                                                            background: currentActiveUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '#fffbeb' : '#fafafa',
                                                                            borderBottom: '1px solid #f1f5f9',
                                                                            borderLeft: currentActiveUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '3px solid #f59e0b' : '3px solid transparent'
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
                                                            handleSelectUnitWrapper(generateSyntheticQuizUnit(`${mainGroup.title} Capstone`, mainGroup.sprintCheckpoint, false));
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
                                                        background: currentActiveUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '#f3e8ff' : '#ffffff',
                                                        border: '1px solid var(--mlab-border)',
                                                        borderLeft: currentActiveUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '4px solid #9333ea' : '1px solid var(--mlab-border)',
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
                )}

            </div>
        </div>
    );
};

export default CoursePlayerView;