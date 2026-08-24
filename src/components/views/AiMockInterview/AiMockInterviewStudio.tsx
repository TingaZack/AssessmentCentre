// src/components/views/AiMockInterview/AiMockInterviewStudio.tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    Video, Sparkles, X, CheckCircle2, Check, Plus,
    Loader2, Award, Brain, MessageSquare, Mic, MicOff,
    VideoOff, Send, RotateCcw, AlertTriangle, CheckCircle, Tag,
    Lock, Unlock, Flame, Zap, Sprout, Trophy,
    Clock, PauseCircle, Play, Volume2, Pause, FileX, BookOpen,
    FileText, History, HelpCircle, Eye, Cloud, Zap as ZapIcon, Square, UploadCloud
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, setDoc, updateDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import moment from 'moment';
import { useToast } from '../../common/Toast/Toast';
import { createPortal } from 'react-dom';

import './AiMockInterviewStudio.css';

const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';

export type DifficultyMode = 'simple' | 'mid' | 'hard';
export type ContextMode = 'both' | 'chips_only' | 'cv_only' | 'none';
export type InterviewScope = 'full' | 'technical_only' | 'behavioral_only';

interface ModeConfig {
    id: DifficultyMode;
    level: number;
    title: string;
    badge: string;
    icon: any;
    color: string;
    bg: string;
    border: string;
    timeLimitSeconds: number;
    description: string;
}

const DIFFICULTY_MODES: ModeConfig[] = [
    { id: 'simple', level: 1, title: 'Simple / Novice', badge: 'Tier 1', icon: Sprout, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', timeLimitSeconds: 600, description: 'Guided pace, core concepts & fundamental practice.' },
    { id: 'mid', level: 2, title: 'Mid / Practitioner', badge: 'Tier 2', icon: Zap, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', timeLimitSeconds: 900, description: 'Standard interview speed, trade-offs & STAR questions.' },
    { id: 'hard', level: 3, title: 'Hard / Master', badge: 'Tier 3', icon: Flame, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', timeLimitSeconds: 1200, description: 'High-rigor grilling, system design & edge cases.' }
];

const AVAILABLE_SKILL_CHIPS = [
    { id: 'react', label: 'React.js' },
    { id: 'typescript', label: 'TypeScript' },
    { id: 'node', label: 'Node.js' },
    { id: 'postgresql', label: 'PostgreSQL & SQL' },
    { id: 'docker', label: 'Docker & DevOps' },
    { id: 'rest_api', label: 'REST APIs & Architecture' },
    { id: 'star_behavioral', label: 'STAR Method Stories' },
    { id: 'agile_scrum', label: 'Agile / Scrum' }
];

const HOLISTIC_STAGES = [
    'Work Readiness & Warmup',
    'Soft Skills & STAR Behavioral',
    'Technical Deep-Dive',
    'System Scenario & Problem-Solving',
    'Candidate Questions (Q&A)',
    'Conclusion & Wrap-Up'
];

// ── VOICE SELECTION TYPES & CONSTANTS ──────────────────
export interface VoiceOption {
    id: string;
    name: string;
    label: string;
    lang: string;
    type: 'cloud' | 'local';
    voiceURI?: string;
}

const GEMINI_TTS_VOICES: VoiceOption[] = [
    { id: 'cloud-achernar', name: 'Achernar', lang: 'en-GB', label: 'Male - Warm British (Achernar)', type: 'cloud' },
    { id: 'cloud-fenrir', name: 'Fenrir', lang: 'en-US', label: 'Male - Confident US (Fenrir)', type: 'cloud' },
    { id: 'cloud-despina', name: 'Despina', lang: 'en-US', label: 'Female - Professional US (Despina)', type: 'cloud' },
    { id: 'cloud-charon', name: 'Charon', lang: 'en-US', label: 'Male - Deep Conversational (Charon)', type: 'cloud' },
    { id: 'cloud-aoede', name: 'Aoede', lang: 'en-GB', label: 'Female - Crisp British (Aoede)', type: 'cloud' },
    { id: 'cloud-kore', name: 'Kore', lang: 'en-US', label: 'Female - Warm US (Kore)', type: 'cloud' }
];

interface SpeechQueueState {
    sentences: string[];
    index: number;
    revealedSoFar: string;
    nextAudioPromise: Promise<string | null> | null;
    stopCurrentFn: (() => void) | null;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. LIVE AI INTERVIEW ROOM COMPONENT
// ════════════════════════════════════════════════════════════════════════════
interface LiveRoomProps {
    sessionId: string;
    targetRole: string;
    difficulty: DifficultyMode;
    contextMode: ContextMode;
    interviewScope: InterviewScope;
    selectedChips: string[];
    cvSummary: string;
    pastInterviewSummary: string;
    learnerName: string;
    learnerId: string;
    isBraveBrowser: boolean;
    selectedVoice: VoiceOption;
    onEndSession: (scorecard?: any, isQualifying?: boolean) => void;
    onCancel: () => void;
}

const AiInterviewRoom: React.FC<LiveRoomProps> = ({
    sessionId, targetRole, difficulty, contextMode, interviewScope,
    selectedChips, cvSummary, pastInterviewSummary, learnerName, learnerId, isBraveBrowser, selectedVoice,
    onEndSession, onCancel
}) => {
    const toast = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const modeConfig = DIFFICULTY_MODES.find(m => m.id === difficulty) || DIFFICULTY_MODES[0];

    const [stream, setStream] = useState<MediaStream | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [showBraveModal, setShowBraveModal] = useState(false);

    const [stageIndex, setStageIndex] = useState(0);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [isAiVoiceInterrupted, setIsAiVoiceInterrupted] = useState(false);

    const [isListening, setIsListening] = useState(false);
    const isListeningRef = useRef(false);

    const [isPaused, setIsPaused] = useState(false);
    const [pauseSecondsLeft, setPauseSecondsLeft] = useState(60);
    const isPausedRef = useRef(false);

    const [sessionSecondsLeft, setSessionSecondsLeft] = useState(modeConfig.timeLimitSeconds);
    const [inactivitySeconds, setInactivitySeconds] = useState(0);
    const [inactivityWarning, setInactivityWarning] = useState<string | null>(null);

    const [transcript, setTranscript] = useState<Array<{ speaker: 'interviewer' | 'candidate'; text: string; timestamp: string }>>([]);
    const [currentCandidateInput, setCurrentCandidateInput] = useState('');
    const [isEvaluating, setIsEvaluating] = useState(false);

    const recognitionRef = useRef<any>(null);
    const hasInitializedRef = useRef(false);
    const hasPrompted30sRef = useRef(false);
    const hasPrompted60sRef = useRef(false);

    const speechQueueRef = useRef<SpeechQueueState>({
        sentences: [],
        index: 0,
        revealedSoFar: '',
        nextAudioPromise: null,
        stopCurrentFn: null,
    });
    const isVoicePausedRef = useRef(false);

    const stagesList = interviewScope === 'full'
        ? HOLISTIC_STAGES
        : interviewScope === 'technical_only'
            ? ['Warmup', 'Technical Deep-Dive', 'Wrap-Up']
            : ['Warmup', 'Soft Skills & Behavioral', 'Wrap-Up'];

    const handleCompleteInterview = useCallback(async () => {
        isListeningRef.current = false;
        setIsListening(false);
        speechQueueRef.current.stopCurrentFn?.();
        if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (e) { } }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        if (audioRef.current) { audioRef.current.pause(); }

        setIsEvaluating(true);
        try {
            const evalFn = httpsCallable(getFunctions(), 'evaluateMockInterview', { timeout: 300000 });
            const res = await evalFn({
                sessionId, learnerId, targetRole, difficulty,
                selectedSkillChips: selectedChips, contextMode, interviewScope, cvSummary,
                fullTranscript: transcript
            });
            const data = res.data as any;
            onEndSession(data.scorecard, data.isQualifyingRun);
        } catch (err: any) {
            console.error("Evaluation Error:", err);
            toast.error("Assessment service unavailable or timed out. No score awarded.");
            onEndSession({ evaluationFailed: true }, false);
        } finally {
            setIsEvaluating(false);
        }
    }, [sessionId, learnerId, targetRole, difficulty, selectedChips, contextMode, interviewScope, cvSummary, transcript, onEndSession, toast]);

    useEffect(() => {
        if (!isPaused) {
            setPauseSecondsLeft(60);
            return;
        }

        const pauseInterval = setInterval(() => {
            setPauseSecondsLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(pauseInterval);
                    toast.warning("Interrupted session expired after 60 seconds. Finalizing scorecard...");
                    handleCompleteInterview();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(pauseInterval);
    }, [isPaused, handleCompleteInterview, toast]);

    // ── WORD-BY-WORD SYNCHRONIZED PIPELINE ──────────────────
    const splitSentences = (text: string) =>
        (text.match(/[^.!?]+[.!?]+|\S+$/g) || [text]).map(s => s.trim()).filter(Boolean);

    const fetchSentenceAudio = async (sentence: string): Promise<string | null> => {
        if (selectedVoice.type === 'local') return null;
        try {
            const ttsFn = httpsCallable(getFunctions(), 'generateSpeech');
            const res = await ttsFn({ text: sentence, voiceName: selectedVoice.name, languageCode: selectedVoice.lang });
            return (res.data as { audioBase64: string })?.audioBase64 || null;
        } catch {
            return null;
        }
    };

    const playSentenceAndType = (audioBase64: string | null, sentence: string): Promise<void> =>
        new Promise<void>((resolve) => {
            let settled = false;
            let typeInterval: any = null;

            const q = speechQueueRef.current;
            const words = sentence.trim().split(' ');
            let wordIndex = 0;
            const baseRevealed = q.revealedSoFar ? q.revealedSoFar + ' ' : '';

            const finish = () => {
                if (!settled) {
                    settled = true;
                    if (typeInterval) clearInterval(typeInterval);
                    q.stopCurrentFn = null;

                    q.revealedSoFar = baseRevealed + sentence.trim();
                    setTranscript(prev => {
                        const updated = [...prev];
                        if (updated.length > 0) {
                            updated[updated.length - 1] = { ...updated[updated.length - 1], text: q.revealedSoFar };
                        }
                        return updated;
                    });
                    resolve();
                }
            };

            const startTyping = (durationMs?: number) => {
                const intervalMs = durationMs ? Math.max(50, Math.floor(durationMs / words.length)) : 250;

                typeInterval = setInterval(() => {
                    if (isVoicePausedRef.current) return;

                    if (wordIndex < words.length) {
                        const currentWords = words.slice(0, wordIndex + 1).join(' ');
                        const currentText = baseRevealed + currentWords;

                        setTranscript(prev => {
                            const updated = [...prev];
                            if (updated.length > 0) {
                                updated[updated.length - 1] = { ...updated[updated.length - 1], text: currentText };
                            }
                            return updated;
                        });
                        wordIndex++;
                    } else {
                        clearInterval(typeInterval);
                    }
                }, intervalMs);
            };

            if (audioBase64) {
                const audio = new Audio(audioBase64);
                audioRef.current = audio;
                audio.onended = finish;
                audio.onerror = finish;

                audio.onplay = () => {
                    const duration = audio.duration && audio.duration !== Infinity ? audio.duration * 1000 : undefined;
                    startTyping(duration);
                };

                q.stopCurrentFn = () => { audio.pause(); finish(); };
                audio.play().catch(finish);
            } else if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(sentence);

                if (selectedVoice.type === 'local' && selectedVoice.voiceURI) {
                    const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === selectedVoice.voiceURI);
                    if (voice) utterance.voice = voice;
                }

                utterance.onend = finish;
                utterance.onerror = finish;
                utterance.onstart = () => {
                    startTyping();
                };

                q.stopCurrentFn = () => { window.speechSynthesis.cancel(); finish(); };
                window.speechSynthesis.speak(utterance);
            } else {
                startTyping(words.length * 250);
                setTimeout(finish, words.length * 250);
            }
        });

    const drainSpeechQueue = async () => {
        const q = speechQueueRef.current;
        setIsAiSpeaking(true);
        setIsAiVoiceInterrupted(false);

        while (q.index < q.sentences.length) {
            if (isVoicePausedRef.current) break;

            const sentence = q.sentences[q.index];
            const audioB64 = await q.nextAudioPromise;

            if (isVoicePausedRef.current) break;

            if (q.index + 1 < q.sentences.length) {
                q.nextAudioPromise = fetchSentenceAudio(q.sentences[q.index + 1]);
            } else {
                q.nextAudioPromise = null;
            }

            await playSentenceAndType(audioB64, sentence);

            if (!isVoicePausedRef.current) q.index += 1;
        }

        if (!isVoicePausedRef.current) setIsAiSpeaking(false);
    };

    const speakAiResponseSynced = useCallback((fullText: string) => {
        if (!fullText) return;
        isVoicePausedRef.current = false;
        speechQueueRef.current = {
            sentences: splitSentences(fullText),
            index: 0,
            revealedSoFar: '',
            nextAudioPromise: null,
            stopCurrentFn: null,
        };
        speechQueueRef.current.nextAudioPromise = fetchSentenceAudio(speechQueueRef.current.sentences[0]);
        drainSpeechQueue();
    }, [selectedVoice]);

    const pauseAiVoiceQueued = () => {
        isVoicePausedRef.current = true;
        speechQueueRef.current.stopCurrentFn?.();
        setIsAiSpeaking(false);
        setIsAiVoiceInterrupted(true);
    };

    const resumeAiVoiceQueued = () => {
        const q = speechQueueRef.current;
        if (q.index >= q.sentences.length) return;
        isVoicePausedRef.current = false;
        q.nextAudioPromise = fetchSentenceAudio(q.sentences[q.index]);
        drainSpeechQueue();
    };

    const replayAiVoiceQueued = (fullText: string) => {
        isVoicePausedRef.current = false;
        speechQueueRef.current = {
            sentences: splitSentences(fullText),
            index: 0,
            revealedSoFar: '',
            nextAudioPromise: null,
            stopCurrentFn: null,
        };
        speechQueueRef.current.nextAudioPromise = fetchSentenceAudio(speechQueueRef.current.sentences[0]);
        drainSpeechQueue();
    };

    // ── SESSION LOGIC ──────────────────
    const pauseSession = useCallback((reason: string) => {
        if (isPausedRef.current || isEvaluating) return;
        isPausedRef.current = true;
        setIsPaused(true);

        pauseAiVoiceQueued();
        isListeningRef.current = false;
        setIsListening(false);
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) { }
        }

        toast.info(reason);
    }, [isEvaluating, toast]);

    const resumeSession = () => {
        isPausedRef.current = false;
        setIsPaused(false);
        setPauseSecondsLeft(60);
        toast.success("Session resumed. You can continue speaking or typing.");
    };

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                pauseSession("Session paused due to app backgrounding or incoming call.");
            }
        };

        const handleUnload = () => {
            speechQueueRef.current.stopCurrentFn?.();
            if (audioRef.current) audioRef.current.pause();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { }
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handleUnload);
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handleUnload);
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [pauseSession]);

    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            setSessionSecondsLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    toast.info("Interview time limit reached. Submitting session for evaluation...");
                    handleCompleteInterview();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isPaused, handleCompleteInterview, toast]);

    useEffect(() => {
        if (isAiLoading || isAiSpeaking || isEvaluating || isPaused) {
            setInactivitySeconds(0);
            return;
        }

        const interval = setInterval(() => {
            setInactivitySeconds((prev) => prev + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [isAiLoading, isAiSpeaking, isEvaluating, isPaused]);

    useEffect(() => {
        if (inactivitySeconds === 30 && !hasPrompted30sRef.current) {
            hasPrompted30sRef.current = true;
            const promptMsg = `Are you still there, ${learnerName}? Let me know if you would like me to repeat the question.`;
            setTranscript(prev => [...prev, { speaker: 'interviewer', text: '', timestamp: moment().format('HH:mm') }]);
            speakAiResponseSynced(promptMsg);
        } else if (inactivitySeconds === 60 && !hasPrompted60sRef.current) {
            hasPrompted60sRef.current = true;
            const warnMsg = `I haven't heard from you in over a minute. To save your progress, I will end this session in 30 seconds if there is no response.`;
            setInactivityWarning("Silence Warning: Session closing in 30 seconds if inactive.");
            setTranscript(prev => [...prev, { speaker: 'interviewer', text: '', timestamp: moment().format('HH:mm') }]);
            speakAiResponseSynced(warnMsg);
        } else if (inactivitySeconds >= 90) {
            toast.warning("Session closed automatically due to 90 seconds of inactivity.");
            handleCompleteInterview();
        }
    }, [inactivitySeconds, learnerName, speakAiResponseSynced, toast, handleCompleteInterview]);

    useEffect(() => {
        if (currentCandidateInput.trim()) {
            setInactivitySeconds(0);
            setInactivityWarning(null);
            hasPrompted30sRef.current = false;
            hasPrompted60sRef.current = false;
        }
    }, [currentCandidateInput]);

    const triggerAiTurn = useCallback(async (history: any[]) => {
        setIsAiLoading(true);
        try {
            const turnFn = httpsCallable(getFunctions(), 'generateInterviewTurn');
            const res = await turnFn({
                sessionId, targetRole, difficulty, seniority: difficulty,
                selectedSkillChips: selectedChips, currentStage: stagesList[stageIndex] || stagesList[0],
                contextMode, interviewScope, cvSummary,
                pastInterviewSummary,
                timeRemainingSeconds: sessionSecondsLeft, totalTimeLimitSeconds: modeConfig.timeLimitSeconds,
                conversationHistory: history
            });

            const data = res.data as any;
            const aiText = data.responseText || "Thank you. Let us move to the next question.";

            if (data.shouldAdvanceStage && stageIndex < stagesList.length - 1) {
                setStageIndex(prev => prev + 1);
            }

            setTranscript(prev => [...prev, { speaker: 'interviewer', text: '', timestamp: moment().format('HH:mm') }]);
            setIsAiLoading(false);

            speakAiResponseSynced(aiText);

        } catch (err: any) {
            setIsAiLoading(false);
            const fallbackText = sessionSecondsLeft <= 120
                ? `Thank you ${learnerName}. As we are almost out of time, can you give me a brief closing summary of your experience?`
                : `Thank you ${learnerName}. Let's discuss your experience further. Can you describe a challenging scenario you solved?`;

            setTranscript(prev => [...prev, { speaker: 'interviewer', text: '', timestamp: moment().format('HH:mm') }]);
            speakAiResponseSynced(fallbackText);
        }
    }, [sessionId, targetRole, difficulty, selectedChips, stagesList, stageIndex, contextMode, interviewScope, cvSummary, pastInterviewSummary, sessionSecondsLeft, modeConfig.timeLimitSeconds, learnerName, speakAiResponseSynced]);

    useEffect(() => {
        if (hasInitializedRef.current) return;
        hasInitializedRef.current = true;

        let activeStream: MediaStream | null = null;

        const initializeMedia = async () => {
            try {
                activeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            } catch (err: any) {
                try {
                    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    setIsVideoOff(true);
                } catch (audioErr: any) {
                    toast.error("No hardware camera/mic found. Operating in text mode.");
                    setIsVideoOff(true);
                }
            }

            if (activeStream) {
                streamRef.current = activeStream;
                setStream(activeStream);
                if (videoRef.current) videoRef.current.srcObject = activeStream;
            }

            triggerAiTurn([]);
        };

        initializeMedia();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            speechQueueRef.current.stopCurrentFn?.();
            if (audioRef.current) audioRef.current.pause();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        };
    }, [triggerAiTurn, toast]);

    useEffect(() => {
        if (transcript.length === 0 || !sessionId) return;

        const sessionRef = doc(db, 'ai_interviews', sessionId);
        updateDoc(sessionRef, {
            transcript,
            currentStage: stagesList[stageIndex] || 'Technical Deep-Dive',
            lastTurnAt: new Date().toISOString()
        }).catch(err => {
            if (err?.code !== 'permission-denied') {
                console.warn("Incremental transcript auto-save skipped:", err?.message || err);
            }
        });
    }, [transcript, sessionId, stageIndex, stagesList]);

    const toggleListening = () => {
        if (isPaused) {
            toast.warning("Please click 'Resume Session' before activating voice input.");
            return;
        }

        if (isAiLoading || isAiSpeaking) {
            toast.warning("Please wait for the AI to finish before responding.");
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.warning("Browser speech recognition unavailable. Please type your answer.");
            return;
        }

        if (isListening) {
            isListeningRef.current = false;
            setIsListening(false);
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { }
            }
            toast.info("Voice input paused.");
        } else {
            pauseAiVoiceQueued();

            try {
                if (!recognitionRef.current) {
                    const recog = new SpeechRecognition();
                    recog.continuous = true;
                    recog.interimResults = true;
                    recog.lang = 'en-US';

                    recog.onresult = (event: any) => {
                        let text = '';
                        for (let i = 0; i < event.results.length; i++) {
                            text += event.results[i][0].transcript;
                        }
                        setCurrentCandidateInput(text);
                    };

                    recog.onerror = (e: any) => {
                        if (['network', 'not-allowed', 'audio-capture', 'aborted'].includes(e.error)) {
                            isListeningRef.current = false;
                            setIsListening(false);

                            if (e.error === 'network') {
                                if (isBraveBrowser) setShowBraveModal(true);
                                else toast.error("Speech service blocked. Please type your response.");
                            }
                        }
                    };

                    recog.onend = () => {
                        if (isListeningRef.current && !isPausedRef.current) {
                            try { recog.start(); } catch (err) {
                                isListeningRef.current = false;
                                setIsListening(false);
                            }
                        } else {
                            setIsListening(false);
                        }
                    };

                    recognitionRef.current = recog;
                }

                isListeningRef.current = true;
                setIsListening(true);
                recognitionRef.current.start();
                toast.success("Listening... Speak clearly into your mic.");
            } catch (e: any) {
                isListeningRef.current = false;
                setIsListening(false);
                toast.error("Could not start microphone listener. Please type your answer.");
            }
        }
    };

    const handleSendCandidateResponse = () => {
        if (!currentCandidateInput.trim() || isPaused || isAiLoading || isAiSpeaking) return;

        setInactivitySeconds(0);
        setInactivityWarning(null);
        hasPrompted30sRef.current = false;
        hasPrompted60sRef.current = false;

        isListeningRef.current = false;
        setIsListening(false);
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) { }
        }

        const candidateText = currentCandidateInput.trim();
        const updatedTranscript = [...transcript, { speaker: 'candidate' as const, text: candidateText, timestamp: moment().format('HH:mm') }];

        setTranscript(updatedTranscript);
        setCurrentCandidateInput('');

        const formattedHistory = updatedTranscript.map(t => ({
            role: t.speaker === 'interviewer' ? 'assistant' : 'user',
            content: t.text
        }));

        triggerAiTurn(formattedHistory);
    };

    const toggleMic = () => {
        if (stream) { stream.getAudioTracks().forEach(t => t.enabled = isMicMuted); setIsMicMuted(!isMicMuted); }
    };

    const toggleVideo = () => {
        if (stream) { stream.getVideoTracks().forEach(t => t.enabled = isVideoOff); setIsVideoOff(!isVideoOff); }
    };

    const formatTimer = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const lastAiMessageIndex = transcript.map(t => t.speaker).lastIndexOf('interviewer');

    const handleExitCancel = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        speechQueueRef.current.stopCurrentFn?.();
        if (audioRef.current) audioRef.current.pause();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        onCancel();
    };

    return (
        <div className="aimi-room">

            {/* Interrupted Overlay */}
            {isPaused && (
                <div className="aimi-room__overlay">
                    <div className="aimi-room__modal">
                        <div style={{ background: '#f59e0b', color: 'white', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <PauseCircle size={32} />
                        </div>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)', color: 'white', textTransform: 'uppercase', fontSize: '1.25rem' }}>
                            Session Interrupted
                        </h3>
                        <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
                            Your interview was paused due to an incoming call or app backgrounding. Click below to resume.
                        </p>

                        <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '10px 14px', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#38bdf8', fontWeight: 800 }}>
                            Auto-closing & submitting in: {pauseSecondsLeft}s
                        </div>

                        <button type="button" onClick={resumeSession} className="mlab-btn mlab-btn--primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.9rem', fontWeight: 700 }}>
                            <Play size={18} /> Resume Session Now
                        </button>
                    </div>
                </div>
            )}

            {/* Brave Modal */}
            {showBraveModal && createPortal(
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: 'white', color: MIDNIGHT, maxWidth: '480px', width: '100%', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertTriangle size={20} /> Brave Browser Notice
                            </h3>
                            <button type="button" onClick={() => setShowBraveModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6, margin: '0 0 1rem 0' }}>
                            Brave Shields blocks Google's Web Speech API requests by default. To enable speech-to-text:
                        </p>
                        <ol style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
                            <li style={{ marginBottom: '6px' }}>Click the <strong>Brave Lion Icon</strong> in your address bar.</li>
                            <li style={{ marginBottom: '6px' }}>Turn <strong>Shields OFF</strong> for this site.</li>
                            <li>Reload the page to speak natively, or continue by typing your answers below.</li>
                        </ol>
                        <button type="button" onClick={() => setShowBraveModal(false)} className="mlab-btn mlab-btn--primary" style={{ width: '100%', justifyContent: 'center' }}>
                            I'll Type or Adjust Settings
                        </button>
                    </div>
                </div>, document.body
            )}

            {/* Warning Banner */}
            {inactivityWarning && (
                <div className="aimi-room__warning-banner">
                    <AlertTriangle size={16} />
                    <span>{inactivityWarning}</span>
                </div>
            )}

            {/* Top Bar */}
            <div className="aimi-room__top-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: modeConfig.color, padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>
                        {modeConfig.badge} • Stage {stageIndex + 1}/{stagesList.length}
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#38bdf8' }}>
                        {stagesList[stageIndex]}
                    </span>
                    {contextMode === 'both' && interviewScope === 'full' && (
                        <span style={{ background: GREEN, color: MIDNIGHT, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>
                            🏆 Qualifying Run
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className={`aimi-room__timer ${sessionSecondsLeft < 120 ? 'aimi-room__timer--warning' : ''}`}>
                        <Clock size={16} /> Time Left: {formatTimer(sessionSecondsLeft)}
                    </div>

                    <button type="button" onClick={handleExitCancel} className="mlab-btn mlab-btn--ghost" style={{ color: '#94a3b8', padding: '6px 14px' }}>End Session</button>
                    <button type="button" onClick={handleCompleteInterview} className="mlab-btn mlab-btn--danger" style={{ padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: 0 }} disabled={isEvaluating}>
                        {isEvaluating ? <Loader2 size={14} className="lfm-spin" /> : <Award size={14} />} Complete & Submit
                    </button>
                </div>
            </div>

            {/* Main Room Layout Grid */}
            <div className="aimi-room__grid">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="aimi-room__avatar-box">
                        <div className={`aimi-room__brain-icon ${isAiSpeaking ? 'aimi-room__brain-icon--speaking' : ''}`} style={{ background: modeConfig.color }}>
                            <Brain size={40} color="white" />
                            {isAiSpeaking && <div className="aimi-room__pulse-ring" />}
                        </div>
                        <strong style={{ fontSize: '0.9rem', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Interviewer ({modeConfig.title})</strong>
                        <span style={{ fontSize: '0.75rem', color: isAiSpeaking ? '#38bdf8' : '#64748b', marginTop: '4px', fontWeight: 600 }}>{isAiLoading ? 'Thinking...' : isAiSpeaking ? '🔊 Speaking...' : 'Listening...'}</span>
                    </div>

                    <div className="aimi-room__video-box">
                        <video ref={videoRef} autoPlay muted className="aimi-room__video-feed" style={{ display: isVideoOff ? 'none' : 'block' }} />
                        {isVideoOff && (
                            <div style={{ textAlign: 'center', color: '#64748b' }}><VideoOff size={40} style={{ margin: '0 auto 8px' }} /><span style={{ fontSize: '0.8rem', display: 'block' }}>Camera Off / Unavailable</span></div>
                        )}
                        <span style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, borderRadius: '2px' }}>{learnerName} (Candidate)</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', background: '#1e293b', padding: '10px', border: '1px solid #334155' }}>
                        <button type="button" onClick={toggleMic} style={{ background: isMicMuted ? '#ef4444' : '#334155', color: 'white', border: 'none', padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
                            {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />} {isMicMuted ? 'Unmute' : 'Mute'}
                        </button>
                        <button type="button" onClick={toggleVideo} style={{ background: isVideoOff ? '#ef4444' : '#334155', color: 'white', border: 'none', padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
                            {isVideoOff ? <VideoOff size={16} /> : <Video size={16} />} {isVideoOff ? 'Start Video' : 'Stop Video'}
                        </button>
                    </div>
                </div>

                <div className="aimi-room__transcript-panel">
                    <div style={{ padding: '1rem', borderBottom: '1px solid #334155', background: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}><MessageSquare size={14} /> Real-Time Transcript</span>
                        <span style={{ fontSize: '0.7rem', color: GREEN, fontWeight: 700 }}>Live Feed Active</span>
                    </div>

                    <div className="aimi-room__transcript-feed">
                        {transcript.map((item, idx) => {
                            const isLatestAiMessage = item.speaker === 'interviewer' && idx === lastAiMessageIndex;

                            return (
                                <div key={idx} style={{ alignSelf: item.speaker === 'candidate' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '2px', textAlign: item.speaker === 'candidate' ? 'right' : 'left' }}>
                                        {item.speaker === 'candidate' ? learnerName : 'AI Interviewer'} • {item.timestamp}
                                    </div>
                                    <div style={{ padding: '10px 14px', background: item.speaker === 'candidate' ? '#0284c7' : '#334155', color: 'white', borderRadius: '6px', fontSize: '0.85rem', lineHeight: 1.5 }}>
                                        {item.text}

                                        {isLatestAiMessage && !isAiLoading && item.text && (
                                            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {isAiSpeaking ? (
                                                    <button
                                                        type="button"
                                                        onClick={pauseAiVoiceQueued}
                                                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#38bdf8', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        <Pause size={12} /> Pause Voice
                                                    </button>
                                                ) : isAiVoiceInterrupted ? (
                                                    <button
                                                        type="button"
                                                        onClick={resumeAiVoiceQueued}
                                                        style={{ background: GREEN, border: 'none', color: MIDNIGHT, padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        <Play size={12} /> Resume AI Voice
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => replayAiVoiceQueued(item.text)}
                                                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        <Volume2 size={12} /> Replay Voice
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Bouncing Dots Indicator */}
                        {isAiLoading && (
                            <div style={{ alignSelf: 'flex-start', maxWidth: '85%', marginTop: '4px' }}>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '2px', textAlign: 'left' }}>
                                    AI Interviewer • Thinking
                                </div>
                                <div style={{ padding: '10px 14px', background: '#334155', color: '#38bdf8', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', height: '42px' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                        <circle cx="4" cy="12" r="2.5">
                                            <animate id="bouncer0" attributeName="cy" begin="0;bouncer2.end+0.25s" calcMode="spline" dur="0.6s" keySplines=".33,.66,.66,1;.33,0,.66,.33" values="12;6;12" />
                                        </circle>
                                        <circle cx="12" cy="12" r="2.5">
                                            <animate attributeName="cy" begin="bouncer0.begin+0.1s" calcMode="spline" dur="0.6s" keySplines=".33,.66,.66,1;.33,0,.66,.33" values="12;6;12" />
                                        </circle>
                                        <circle cx="20" cy="12" r="2.5">
                                            <animate id="bouncer2" attributeName="cy" begin="bouncer0.begin+0.2s" calcMode="spline" dur="0.6s" keySplines=".33,.66,.66,1;.33,0,.66,.33" values="12;6;12" />
                                        </circle>
                                    </svg>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ padding: '1rem', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={toggleListening}
                                disabled={isAiLoading || isAiSpeaking || isPaused}
                                className={isListening ? 'aimi-room__speech-btn-listening' : ''}
                                style={{
                                    background: isAiLoading || isAiSpeaking ? '#94a3b8' : isListening ? '#dc2626' : GREEN,
                                    color: isAiLoading || isAiSpeaking ? '#cbd5e1' : isListening ? 'white' : MIDNIGHT,
                                    border: 'none',
                                    padding: '0 16px',
                                    fontWeight: 800,
                                    fontSize: '0.8rem',
                                    cursor: isAiLoading || isAiSpeaking ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    opacity: isAiLoading || isAiSpeaking ? 0.6 : 1
                                }}
                            >
                                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                                {isListening ? 'Stop Voice Input' : 'Start Voice Input'}
                            </button>

                            <input
                                type="text"
                                value={currentCandidateInput}
                                onChange={e => setCurrentCandidateInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !isAiLoading && !isAiSpeaking && handleSendCandidateResponse()}
                                disabled={isAiLoading || isAiSpeaking || isPaused}
                                placeholder={
                                    isAiLoading ? "AI is thinking... please wait." :
                                        isAiSpeaking ? "AI is speaking... please wait." :
                                            isListening ? "Listening... Speak into your mic..." :
                                                "Type your answer or click 'Start Voice Input'..."
                                }
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    fontSize: '0.85rem',
                                    background: isAiLoading || isAiSpeaking ? '#0f172a' : '#1e293b',
                                    border: `1px solid ${isListening ? '#38bdf8' : isAiLoading || isAiSpeaking ? '#334155' : '#334155'}`,
                                    color: isAiLoading || isAiSpeaking ? '#64748b' : 'white',
                                    outline: 'none',
                                    cursor: isAiLoading || isAiSpeaking ? 'not-allowed' : 'text'
                                }}
                            />

                            <button
                                type="button"
                                onClick={handleSendCandidateResponse}
                                disabled={!currentCandidateInput.trim() || isAiLoading || isAiSpeaking || isPaused}
                                className="mlab-btn mlab-btn--primary"
                                style={{
                                    padding: '0 18px',
                                    borderRadius: 0,
                                    opacity: (!currentCandidateInput.trim() || isAiLoading || isAiSpeaking) ? 0.5 : 1,
                                    cursor: (!currentCandidateInput.trim() || isAiLoading || isAiSpeaking) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// 2. SCORECARD REPORT VIEW COMPONENT
// ════════════════════════════════════════════════════════════════════════════
const InterviewScorecardView: React.FC<{ scorecard: any; isQualifying?: boolean; difficulty: DifficultyMode; onRestart: () => void }> = ({ scorecard, isQualifying, difficulty, onRestart }) => {

    if (!scorecard || scorecard.evaluationFailed) {
        return (
            <div className="aimi-card" style={{ borderTop: '4px solid #dc2626', textAlign: 'center' }}>
                <div style={{ background: '#fef2f2', color: '#dc2626', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <FileX size={32} />
                </div>
                <h2 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>
                    Assessment Not Finalised
                </h2>
                <p style={{ color: 'var(--mlab-grey)', fontSize: '0.9rem', maxWidth: '520px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
                    A valid interview evaluation could not be generated at this time. No readiness score has been awarded for this attempt.
                </p>
                <button type="button" onClick={onRestart} className="mlab-btn mlab-btn--primary" style={{ padding: '10px 24px' }}>
                    <RotateCcw size={16} /> Practice Again
                </button>
            </div>
        );
    }

    const overall = scorecard.overallScore;
    const tech = scorecard.technicalScore;
    const techKnowledge = scorecard.technicalKnowledgeScore;
    const interviewReadiness = scorecard.interviewReadinessScore;
    const behavioral = scorecard.behavioralScore;
    const comm = scorecard.communicationScore;
    const status = scorecard.readinessStatus || 'NOT_READY';

    const currentMode = DIFFICULTY_MODES.find(m => m.id === difficulty) || DIFFICULTY_MODES[0];

    const getHonestFeedbackMessage = () => {
        if (status === 'READY') {
            return {
                title: `INTERVIEW READY — ${currentMode.badge.toUpperCase()}`,
                desc: "You demonstrated the required competency independently across the majority of assessed areas. Your remaining gaps are minor and should not materially prevent you from participating in an interview at this level.",
                bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', iconColor: '#16a34a', Icon: Trophy
            };
        } else if (status === 'NEARLY_READY' || status === 'DEVELOPING') {
            return {
                title: `DEVELOPING — NOT YET READY`,
                desc: "You demonstrated some relevant knowledge, but your performance was inconsistent. Several answers required additional probing and some technical explanations lacked sufficient depth. Further preparation is recommended before progressing to the next difficulty level.",
                bg: '#f0f9ff', border: '#bae6fd', color: '#0369a1', iconColor: '#0284c7', Icon: AlertTriangle
            };
        } else {
            return {
                title: `NOT INTERVIEW READY`,
                desc: "Your current performance does not yet demonstrate the technical and behavioural competency required for this interview level. This is not a failure of potential; it is an indication of the specific areas that require further preparation.",
                bg: '#fef2f2', border: '#fecaca', color: '#b45309', iconColor: '#dc2626', Icon: RotateCcw
            };
        }
    };

    const feedback = getHonestFeedbackMessage();
    const FeedbackIcon = feedback.Icon;

    const getEvidenceBadgeClass = (level: string) => {
        switch (level) {
            case 'INDEPENDENT': return 'aimi-evidence-badge--independent';
            case 'PROMPTED': return 'aimi-evidence-badge--prompted';
            case 'PARTIAL': return 'aimi-evidence-badge--partial';
            case 'INCORRECT': return 'aimi-evidence-badge--incorrect';
            default: return '';
        }
    };

    const gapsList = scorecard.priorityGaps || scorecard.areasForImprovement || [];

    return (
        <div className="aimi-scorecard animate-fade-in">
            <div className="aimi-scorecard__banner" style={{ background: feedback.bg, border: `2px solid ${feedback.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: feedback.iconColor, color: 'white', padding: '10px', borderRadius: '50%' }}>
                        <FeedbackIcon size={24} />
                    </div>
                    <div>
                        <strong style={{ fontSize: '1rem', color: feedback.color, display: 'block', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            {overall}% • {feedback.title}
                        </strong>
                        <span style={{ fontSize: '0.85rem', color: feedback.color, opacity: 0.9 }}>
                            {feedback.desc}
                        </span>
                    </div>
                </div>
            </div>

            <div className="aimi-card" style={{ borderTop: `4px solid ${GREEN}` }}>
                <div className="aimi-header-flex" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, fontSize: '1.6rem', textTransform: 'uppercase' }}>Employability Scorecard Report</h2>
                        <p style={{ margin: '6px 0 0 0', color: '#334155', fontSize: '0.88rem', lineHeight: 1.6 }}>
                            {scorecard.readinessSummary || "Evidence-based candidate competency evaluation."}
                        </p>
                    </div>
                    <button type="button" onClick={onRestart} className="mlab-btn mlab-btn--primary" style={{ padding: '10px 20px', borderRadius: 0 }}><RotateCcw size={16} /> Practice Again</button>
                </div>
            </div>

            <div className="aimi-scorecard__metrics-grid">
                <div className="aimi-metric-card">
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Overall Readiness</span>
                    <div className="aimi-metric-value" style={{ color: MIDNIGHT }}>{overall ?? 0}%</div>
                    <span style={{ fontSize: '0.75rem', color: feedback.color, fontWeight: 700, background: feedback.bg, padding: '2px 8px', border: `1px solid ${feedback.border}` }}>
                        {status}
                    </span>
                </div>

                <div className="aimi-metric-card">
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Technical Score</span>
                    <div className="aimi-metric-value" style={{ color: '#0284c7' }}>{tech ?? 0}%</div>
                    <span style={{ fontSize: '0.75rem', color: '#0369a1' }}>Core Technical Depth</span>
                </div>

                <div className="aimi-metric-card">
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Raw Knowledge</span>
                    <div className="aimi-metric-value" style={{ color: '#0d9488' }}>{techKnowledge ?? 0}%</div>
                    <span style={{ fontSize: '0.75rem', color: '#0f766e' }}>Accuracy & Concepts</span>
                </div>

                <div className="aimi-metric-card">
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Interview Delivery</span>
                    <div className="aimi-metric-value" style={{ color: '#4f46e5' }}>{interviewReadiness ?? 0}%</div>
                    <span style={{ fontSize: '0.75rem', color: '#4338ca' }}>Independent Execution</span>
                </div>

                <div className="aimi-metric-card">
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>STAR Behavioral</span>
                    <div className="aimi-metric-value" style={{ color: '#d97706' }}>{behavioral ?? 0}%</div>
                    <span style={{ fontSize: '0.75rem', color: '#b45309' }}>Structure & Ownership</span>
                </div>

                <div className="aimi-metric-card">
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Communication</span>
                    <div className="aimi-metric-value" style={{ color: '#7c3aed' }}>{comm ?? 0}%</div>
                    <span style={{ fontSize: '0.75rem', color: '#6d28d9' }}>Structure & Clarity</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                <div className="aimi-card">
                    <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: '#15803d', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle size={18} /> Demonstrated Strengths
                    </h4>
                    {scorecard.strengths && scorecard.strengths.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
                            {scorecard.strengths.map((s: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{s}</li>)}
                        </ul>
                    ) : (
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                            No clear strengths were demonstrated independently during this interview session.
                        </p>
                    )}
                </div>

                <div className="aimi-card">
                    <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={18} /> Priority Knowledge Gaps
                    </h4>
                    {gapsList && gapsList.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
                            {gapsList.map((gap: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{gap}</li>)}
                        </ul>
                    ) : (
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                            No critical knowledge gaps identified.
                        </p>
                    )}
                </div>
            </div>

            <div className="aimi-card">
                <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BookOpen size={18} color="#0284c7" /> Recommended Preparation Plan
                </h4>
                {scorecard.recommendedPreparation && scorecard.recommendedPreparation.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
                        {scorecard.recommendedPreparation.map((prep: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{prep}</li>)}
                    </ul>
                ) : (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                        Review general software development concepts and STAR behavioral frameworks.
                    </p>
                )}
            </div>

            {scorecard.questionBreakdown && scorecard.questionBreakdown.length > 0 && (
                <div className="aimi-card">
                    <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase' }}>Evidence-Based Question Breakdown</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {scorecard.questionBreakdown.map((q: any, idx: number) => {
                            const badgeClass = getEvidenceBadgeClass(q.evidenceLevel);

                            return (
                                <div key={idx} className="aimi-evidence-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <strong style={{ fontSize: '0.85rem', color: MIDNIGHT }}>Q{idx + 1}: {q.question}</strong>
                                        <span className={`aimi-evidence-badge ${badgeClass}`}>
                                            {q.evidenceLevel || 'EVALUATED'} ({q.score}%)
                                        </span>
                                    </div>
                                    <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#475569', fontStyle: 'italic' }}>
                                        "{q.candidateAnswer}"
                                    </p>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
                                        <strong>Feedback:</strong> {q.feedback}
                                    </p>
                                    {q.whatWasMissing && (
                                        <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#b45309', lineHeight: 1.5 }}>
                                            <strong>Missing Evidence:</strong> {q.whatWasMissing}
                                        </p>
                                    )}
                                    {q.idealAnswerSample && (
                                        <div style={{ marginTop: '8px', padding: '8px 12px', background: '#e0f2fe', borderLeft: '3px solid #0284c7', fontSize: '0.78rem', color: '#0369a1', lineHeight: 1.5 }}>
                                            <strong>Sample Target Response:</strong> {q.idealAnswerSample}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// 3. MAIN EXPORTED ORCHESTRATOR COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export interface AiMockInterviewStudioProps {
    learnerName: string;
    learnerId: string;
}

export const AiMockInterviewStudio: React.FC<AiMockInterviewStudioProps> = ({ learnerName, learnerId }) => {
    const [interviewStep, setInterviewStep] = useState<'landing' | 'setup' | 'room' | 'scorecard'>('landing');
    const [currentSessionId, setCurrentSessionId] = useState<string>('');
    const [targetRole, setTargetRole] = useState('Software Developer');

    const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyMode>('simple');
    const [contextMode, setContextMode] = useState<ContextMode>('both');
    const [interviewScope, setInterviewScope] = useState<InterviewScope>('full');

    const [selectedChips, setSelectedChips] = useState<string[]>(['react', 'typescript', 'star_behavioral']);
    const [customSkillInput, setCustomSkillInput] = useState('');

    const [learnerCvSummary, setLearnerCvSummary] = useState<string>('Candidate has a software development background in web applications.');
    const [isEditingCv, setIsEditingCv] = useState(false);

    const [localVoices, setLocalVoices] = useState<VoiceOption[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(GEMINI_TTS_VOICES[0]);
    const [isTestingVoice, setIsTestingVoice] = useState(false);
    const testAudioRef = useRef<HTMLAudioElement | null>(null);
    const testVoiceCounter = useRef(0);

    const [pastInterviewSummary, setPastInterviewSummary] = useState<string>('');

    const [latestScorecard, setLatestScorecard] = useState<any>(null);
    const [latestIsQualifying, setLatestIsQualifying] = useState<boolean>(false);
    const [isLaunching, setIsLaunching] = useState(false);
    const [isBraveBrowser, setIsBraveBrowser] = useState(false);

    const [pastSessions, setPastSessions] = useState<any[]>([]);
    const [selectedAuditSession, setSelectedAuditSession] = useState<any | null>(null);
    const [modeHighScores, setModeHighScores] = useState<Record<DifficultyMode, number>>({
        simple: 0,
        mid: 0,
        hard: 0
    });

    const toast = useToast();

    useEffect(() => {
        if ((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') {
            (navigator as any).brave.isBrave().then((isBrave: boolean) => {
                if (isBrave) setIsBraveBrowser(true);
            });
        }
    }, []);

    useEffect(() => {
        const loadVoices = () => {
            if (!('speechSynthesis' in window)) return;
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                const englishVoices = voices.filter(v => v.lang.startsWith('en'));
                const premiumVoices = englishVoices.sort((a, b) => {
                    const aIsPremium = a.name.includes('Neural') || a.name.includes('Premium') || a.name.includes('Google');
                    const bIsPremium = b.name.includes('Neural') || b.name.includes('Premium') || b.name.includes('Google');
                    if (aIsPremium && !bIsPremium) return -1;
                    if (!aIsPremium && bIsPremium) return 1;
                    return 0;
                });

                const mappedLocal: VoiceOption[] = premiumVoices.map((v, i) => ({
                    id: `local-${i}`,
                    name: v.name,
                    lang: v.lang,
                    label: v.name.replace('Microsoft ', '').replace('Google ', ''),
                    type: 'local',
                    voiceURI: v.voiceURI
                }));
                setLocalVoices(mappedLocal);
            }
        };

        loadVoices();
        if ('speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    useEffect(() => {
        if (!learnerId) return;

        const fetchHistoryAndScores = async () => {
            try {
                const learnerDoc = await getDoc(doc(db, 'learners', learnerId));
                if (learnerDoc.exists()) {
                    const data = learnerDoc.data();
                    if (data.cvSummary || data.cvText) {
                        setLearnerCvSummary(data.cvSummary || data.cvText);
                    }
                    if (data.interviewProgress) {
                        setModeHighScores({
                            simple: data.interviewProgress.tier1HighScore || 0,
                            mid: data.interviewProgress.tier2HighScore || 0,
                            hard: data.interviewProgress.tier3HighScore || 0
                        });
                    }
                }

                const qDocs = query(
                    collection(db, 'ai_interviews'),
                    where('learnerId', '==', learnerId),
                    where('status', '==', 'completed')
                );
                const snap = await getDocs(qDocs);

                const list: any[] = [];
                const scores: Record<DifficultyMode, number> = { simple: 0, mid: 0, hard: 0 };

                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    list.push({ id: docSnap.id, ...data });

                    const mode = (data.difficulty || 'simple') as DifficultyMode;
                    const score = Number(data.scorecard?.overallScore) || 0;
                    if (data.isQualifyingRun && data.scorecard?.readinessStatus === 'READY' && score > (scores[mode] || 0)) {
                        scores[mode] = score;
                    }
                });

                list.sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime());

                setPastSessions(list);
                if (scores.simple > 0 || scores.mid > 0 || scores.hard > 0) {
                    setModeHighScores(prev => ({
                        simple: Math.max(prev.simple, scores.simple),
                        mid: Math.max(prev.mid, scores.mid),
                        hard: Math.max(prev.hard, scores.hard)
                    }));
                }

                if (list.length > 0) {
                    const lastSession = list[0];
                    const sc = lastSession.scorecard || {};
                    const gaps = sc.priorityGaps || sc.areasForImprovement || [];
                    const strengths = sc.strengths || [];

                    let summary = `In their last mock interview for a ${lastSession.targetRole} role, the candidate scored ${sc.overallScore || 'unknown'}% and was rated as ${sc.readinessStatus || 'unknown'}.\n`;
                    if (strengths.length > 0) summary += `Previous strengths noted: ${strengths.slice(0, 3).join(', ')}.\n`;
                    if (gaps.length > 0) summary += `Previous priority gaps to re-test: ${gaps.slice(0, 3).join(', ')}.`;

                    setPastInterviewSummary(summary);
                } else {
                    setPastInterviewSummary('');
                }

            } catch (err: any) {
                console.warn("Past high scores query skipped:", err?.message || err);
            }
        };

        fetchHistoryAndScores();
    }, [learnerId, interviewStep]);

    const isMidUnlocked = modeHighScores.simple >= 90;
    const isHardUnlocked = isMidUnlocked && modeHighScores.mid >= 90;
    const isQualifyingSelection = contextMode === 'both' && interviewScope === 'full';

    const toggleChip = (chipId: string) => {
        setSelectedChips(prev => prev.includes(chipId) ? prev.filter(c => c !== chipId) : [...prev, chipId]);
    };

    const handleAddCustomSkill = (e?: React.KeyboardEvent | React.MouseEvent) => {
        if (e && 'key' in e && e.key !== 'Enter') return;
        if (e) e.preventDefault();

        const trimmed = customSkillInput.trim();
        if (!trimmed) return;

        const existsInDefaults = AVAILABLE_SKILL_CHIPS.find(c => c.label.toLowerCase() === trimmed.toLowerCase() || c.id.toLowerCase() === trimmed.toLowerCase());
        const chipId = existsInDefaults ? existsInDefaults.id : trimmed;

        if (!selectedChips.includes(chipId)) setSelectedChips(prev => [...prev, chipId]);
        setCustomSkillInput('');
    };

    const handleSaveCv = async () => {
        setIsEditingCv(false);
        if (!learnerId) return;

        try {
            await updateDoc(doc(db, 'learners', learnerId), {
                cvText: learnerCvSummary,
                updatedAt: new Date().toISOString()
            });
            toast.success("CV context saved securely.");
        } catch (err) {
            console.error("Failed to save CV", err);
        }
    };

    const handleTestVoiceToggle = async () => {
        if (isTestingVoice) {
            testVoiceCounter.current += 1;
            if (testAudioRef.current) {
                testAudioRef.current.pause();
                testAudioRef.current.currentTime = 0;
            }
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            setIsTestingVoice(false);
            return;
        }

        if (!selectedVoice.id) return;

        const currentTestId = ++testVoiceCounter.current;
        setIsTestingVoice(true);

        if (testAudioRef.current) {
            testAudioRef.current.pause();
            testAudioRef.current.currentTime = 0;
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }

        if (selectedVoice.type === 'cloud') {
            try {
                const ttsFn = httpsCallable(getFunctions(), 'generateSpeech');
                const res = await ttsFn({
                    text: "Hello! I am your AI interviewer. I look forward to speaking with you today.",
                    voiceName: selectedVoice.name,
                    languageCode: selectedVoice.lang
                });

                if (currentTestId !== testVoiceCounter.current) return;

                const data = res.data as { audioBase64: string };

                if (data?.audioBase64) {
                    const audio = new Audio(data.audioBase64);
                    testAudioRef.current = audio;

                    audio.onended = () => {
                        if (currentTestId === testVoiceCounter.current) setIsTestingVoice(false);
                    };
                    audio.onerror = () => {
                        if (currentTestId === testVoiceCounter.current) {
                            setIsTestingVoice(false);
                            toast.error("Failed to play audio.");
                        }
                    };

                    await audio.play();
                } else {
                    if (currentTestId === testVoiceCounter.current) setIsTestingVoice(false);
                }
            } catch (err) {
                if (currentTestId !== testVoiceCounter.current) return;
                console.error("Voice test failed:", err);
                toast.error("Could not play test voice. Please check your connection.");
                setIsTestingVoice(false);
            }
        } else {
            if (!('speechSynthesis' in window)) {
                setIsTestingVoice(false);
                return;
            }
            const utterance = new SpeechSynthesisUtterance("Hello! I am your AI interviewer. I look forward to speaking with you today.");
            const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === selectedVoice.voiceURI);
            if (voice) utterance.voice = voice;

            utterance.onend = () => {
                if (currentTestId === testVoiceCounter.current) setIsTestingVoice(false);
            };
            utterance.onerror = () => {
                if (currentTestId === testVoiceCounter.current) setIsTestingVoice(false);
            };

            window.speechSynthesis.speak(utterance);
        }
    };

    const handleLaunchRoom = async () => {
        if (selectedChips.length === 0 && contextMode !== 'cv_only' && contextMode !== 'none') return;

        if (testAudioRef.current) {
            testAudioRef.current.pause();
        }

        setIsLaunching(true);

        try {
            const sessionRef = doc(collection(db, 'ai_interviews'));
            const newSessionId = sessionRef.id;
            setCurrentSessionId(newSessionId);

            await setDoc(sessionRef, {
                id: newSessionId,
                learnerId: learnerId || 'unknown_learner',
                learnerName: learnerName || 'Candidate',
                targetRole,
                difficulty: selectedDifficulty,
                contextMode,
                interviewScope,
                isQualifyingRun: isQualifyingSelection,
                selectedSkillChips: selectedChips,
                transcript: [],
                status: 'in_progress',
                startedAt: new Date().toISOString()
            });

            setInterviewStep('room');
        } catch (err: any) {
            console.warn("Firestore session initialization bypassed:", err?.message || err);
            setCurrentSessionId(`local_${Date.now()}`);
            setInterviewStep('room');
        } finally {
            setIsLaunching(false);
        }
    };

    return (
        <div className="aimi-studio ld-animate">
            {selectedAuditSession && createPortal(
                <div className="aimi-modal-overlay" onClick={() => setSelectedAuditSession(null)}>
                    <div className="aimi-modal-body" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase' }}>
                                    Audit Inspection • {selectedAuditSession.targetRole}
                                </h3>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {moment(selectedAuditSession.completedAt || selectedAuditSession.startedAt).format('D MMMM YYYY, h:mm A')}
                                </span>
                            </div>
                            <button type="button" onClick={() => setSelectedAuditSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <InterviewScorecardView
                            scorecard={selectedAuditSession.scorecard}
                            isQualifying={selectedAuditSession.isQualifyingRun}
                            difficulty={selectedAuditSession.difficulty}
                            onRestart={() => setSelectedAuditSession(null)}
                        />
                    </div>
                </div>, document.body
            )}

            {interviewStep === 'landing' && (
                <>
                    <div className="aimi-card">
                        <div className="aimi-header-title">
                            <Video size={28} color="var(--mlab-blue)" />
                            <h2>AI Mock Interview Studio</h2>
                        </div>
                        <p className="aimi-description">
                            Practice technical, behavioral, or full holistic interviews. Achieve <strong>90%+ in a Qualifying Full Interview (Both CV & Skills Enabled)</strong> to unlock higher difficulty tiers.
                        </p>

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                            <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Sprout size={18} color="#16a34a" />
                                <div>
                                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 1 • Simple</span>
                                    <strong style={{ fontSize: '0.85rem', color: MIDNIGHT }}>
                                        High: {modeHighScores.simple}% {modeHighScores.simple >= 90 ? '🏆 Mastered' : '(Req: 90%)'}
                                    </strong>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {isMidUnlocked ? <Zap size={18} color="#0284c7" /> : <Lock size={18} color="#94a3b8" />}
                                <div>
                                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 2 • Mid</span>
                                    <strong style={{ fontSize: '0.85rem', color: isMidUnlocked ? MIDNIGHT : '#94a3b8' }}>
                                        {isMidUnlocked ? `High: ${modeHighScores.mid}% ${modeHighScores.mid >= 90 ? '🏆 Mastered' : '(Req: 90%)'}` : 'Locked (Req: 90% in Simple)'}
                                    </strong>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {isHardUnlocked ? <Flame size={18} color="#dc2626" /> : <Lock size={18} color="#94a3b8" />}
                                <div>
                                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 3 • Hard</span>
                                    <strong style={{ fontSize: '0.85rem', color: isHardUnlocked ? MIDNIGHT : '#94a3b8' }}>
                                        {isHardUnlocked ? `High: ${modeHighScores.hard}% ${modeHighScores.hard >= 90 ? '🏆 Mastered' : '(Req: 90%)'}` : 'Locked (Req: 90% in Mid)'}
                                    </strong>
                                </div>
                            </div>
                        </div>

                        <button type="button" className="mlab-btn mlab-btn--primary" style={{ padding: '10px 20px', fontSize: '0.9rem', fontWeight: 700, borderRadius: 0, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); setInterviewStep('setup'); }}>
                            <Sparkles size={16} /> Start New Mock Interview
                        </button>
                    </div>

                    <div className="aimi-card">
                        <h3 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <History size={18} color="#0284c7" /> Past Practice & Audit History ({pastSessions.length})
                        </h3>

                        {pastSessions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
                                <FileText size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                                <strong style={{ display: 'block', color: MIDNIGHT, textTransform: 'uppercase', marginBottom: '4px' }}>No Practice History Recorded</strong>
                                <p style={{ margin: 0, fontSize: '0.85rem' }}>Complete your first mock interview above to build an audited performance record.</p>
                            </div>
                        ) : (
                            <div className="aimi-history-table-wrap">
                                <table className="aimi-history-table">
                                    <thead>
                                        <tr>
                                            <th>Date & Time</th>
                                            <th>Target Role</th>
                                            <th>Tier</th>
                                            <th>Format Scope</th>
                                            <th>Context</th>
                                            <th>Score & Readiness</th>
                                            <th style={{ textAlign: 'right' }}>Audit Inspection</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pastSessions.map(session => {
                                            const sc = session.scorecard || {};
                                            const score = sc.overallScore ?? '—';
                                            const status = sc.readinessStatus || 'NOT_EVALUATED';

                                            return (
                                                <tr key={session.id}>
                                                    <td>{moment(session.completedAt || session.startedAt).format('D MMM YYYY, HH:mm')}</td>
                                                    <td><strong>{session.targetRole}</strong></td>
                                                    <td><span className="aimi-tag aimi-tag--practice">{session.difficulty?.toUpperCase()}</span></td>
                                                    <td>
                                                        <span className={`aimi-tag ${session.interviewScope === 'full' ? 'aimi-tag--scope-full' : session.interviewScope === 'technical_only' ? 'aimi-tag--scope-tech' : 'aimi-tag--scope-behavioral'}`}>
                                                            {session.interviewScope === 'full' ? 'Full Holistic' : session.interviewScope === 'technical_only' ? 'Technical Only' : 'Behavioral Only'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`aimi-tag ${session.isQualifyingRun ? 'aimi-tag--qualifying' : 'aimi-tag--practice'}`}>
                                                            {session.isQualifyingRun ? '🏆 Qualifying (CV+Chips)' : session.contextMode?.replace('_', ' ').toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <strong>{score}%</strong> <span style={{ fontSize: '0.7rem', color: status === 'READY' ? '#166534' : '#b45309' }}>({status})</span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button type="button" onClick={() => setSelectedAuditSession(session)} className="mlab-btn mlab-btn--ghost mlab-btn--sm" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>
                                                            <Eye size={14} /> Inspect
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {interviewStep === 'setup' && (
                <div className="animate-fade-in" style={{ maxWidth: '880px', margin: '0 auto', width: '100%' }}>
                    <div className="aimi-card aimi-card--setup-header">
                        <div className="aimi-header-flex">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={24} /></div>
                                <div>
                                    <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, fontSize: '1.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Interview Studio Configuration</h2>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Select target roles, unlocked difficulty mode, and skill focus areas.</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setInterviewStep('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}><X size={20} /></button>
                        </div>
                    </div>

                    <div className="aimi-card aimi-card--setup-body">
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>1. Target Career Role</label>
                            <div style={{ position: 'relative' }}>
                                <input type="text" value={targetRole} onChange={e => setTargetRole(e.target.value)} placeholder="e.g. Full-Stack Developer, Frontend Engineer..." className="aimi-input-text" />
                                <Tag size={18} className="aimi-input-icon" />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>2. Interview Scope / Format</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setInterviewScope('full')}
                                    className={`aimi-tier-card ${interviewScope === 'full' ? 'aimi-tier-card--selected-mid' : ''}`}
                                >
                                    <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Full Holistic Interview</strong>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Multi-part: Warmup, STAR, Technical, Scenario & Q&A. (Required for Progression)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInterviewScope('technical_only')}
                                    className={`aimi-tier-card ${interviewScope === 'technical_only' ? 'aimi-tier-card--selected-mid' : ''}`}
                                >
                                    <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Focused Technical Only</strong>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Targeted technical grilling practice.</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInterviewScope('behavioral_only')}
                                    className={`aimi-tier-card ${interviewScope === 'behavioral_only' ? 'aimi-tier-card--selected-mid' : ''}`}
                                >
                                    <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Focused Behavioral Only</strong>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Soft skills, STAR stories & teamwork practice.</span>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>3. Context Sources</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                                {[
                                    { id: 'both', label: 'Both CV & Skill Chips', desc: 'Required for Tier Progression' },
                                    { id: 'chips_only', label: 'Skill Chips Only', desc: 'Practice focus skills' },
                                    { id: 'cv_only', label: 'CV Background Only', desc: 'Practice resume defense' },
                                    { id: 'none', label: 'Generic Standard', desc: 'Unassisted general interview' }
                                ].map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setContextMode(item.id as ContextMode)}
                                        className={`aimi-tier-card ${contextMode === item.id ? 'aimi-tier-card--selected-simple' : ''}`}
                                    >
                                        <strong style={{ fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>{item.label}</strong>
                                        <span style={{ fontSize: '0.7rem', display: 'block', color: '#64748b' }}>{item.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {(contextMode === 'both' || contextMode === 'cv_only') && (
                            <div>
                                <div className="aimi-header-flex" style={{ marginBottom: '10px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT }}>
                                        Review CV Context
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => isEditingCv ? handleSaveCv() : setIsEditingCv(true)}
                                        style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        {isEditingCv ? <Check size={14} /> : <UploadCloud size={14} />}
                                        {isEditingCv ? 'Save Context' : 'Update / Paste New CV'}
                                    </button>
                                </div>

                                {isEditingCv ? (
                                    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
                                        <textarea
                                            value={learnerCvSummary}
                                            onChange={e => setLearnerCvSummary(e.target.value)}
                                            placeholder="Paste your latest CV/Resume text here... (Select all text in your PDF/Word doc and paste)"
                                            style={{ width: '100%', minHeight: '140px', padding: '10px', fontSize: '0.85rem', fontFamily: 'monospace', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Paste your raw CV text. The AI will extract your experience automatically.</span>
                                            <button type="button" onClick={handleSaveCv} className="mlab-btn mlab-btn--primary mlab-btn--sm" style={{ padding: '6px 14px', fontSize: '0.75rem' }}>Save & Update</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem', color: '#475569', maxHeight: '80px', overflow: 'hidden', position: 'relative' }}>
                                        {learnerCvSummary && learnerCvSummary !== 'No CV provided or linked.' ? (
                                            <>
                                                <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {learnerCvSummary}
                                                </div>
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(transparent, #f8fafc)' }} />
                                            </>
                                        ) : (
                                            <span style={{ color: '#ef4444', fontWeight: 600 }}>No CV found. Please update your CV context to proceed with this mode.</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '10px' }}>
                                4. Select Difficulty Mode Tier (Mastery Target: 90%+)
                            </label>
                            <div className="aimi-tier-grid">
                                {DIFFICULTY_MODES.map(mode => {
                                    const ModeIcon = mode.icon;
                                    const isSelected = selectedDifficulty === mode.id;

                                    let isUnlocked = true;
                                    if (mode.id === 'mid') isUnlocked = isMidUnlocked;
                                    if (mode.id === 'hard') isUnlocked = isHardUnlocked;

                                    const selectedClass = isSelected
                                        ? mode.id === 'simple' ? 'aimi-tier-card--selected-simple' : mode.id === 'mid' ? 'aimi-tier-card--selected-mid' : 'aimi-tier-card--selected-hard'
                                        : '';

                                    return (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            disabled={!isUnlocked}
                                            onClick={() => setSelectedDifficulty(mode.id)}
                                            className={`aimi-tier-card ${selectedClass}`}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '3px', background: isUnlocked ? mode.color : '#94a3b8', color: 'white' }}>
                                                    {mode.badge}
                                                </span>
                                                {isUnlocked ? (
                                                    isSelected ? <CheckCircle2 size={18} color={mode.color} /> : <Unlock size={16} color="#94a3b8" />
                                                ) : (
                                                    <Lock size={16} color="#94a3b8" />
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <ModeIcon size={18} color={isUnlocked ? mode.color : '#94a3b8'} />
                                                <strong style={{ fontSize: '0.9rem', color: isUnlocked ? MIDNIGHT : '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                    {mode.title}
                                                </strong>
                                            </div>

                                            <p style={{ margin: '4px 0 8px 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
                                                {mode.description}
                                            </p>

                                            {!isUnlocked && (
                                                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1', fontSize: '0.7rem', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Lock size={12} /> Score 90%+ in Tier {mode.level - 1} to unlock
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '10px' }}>
                                5. Select AI Interviewer Voice
                            </label>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <select
                                    value={selectedVoice.id}
                                    onChange={(e) => {
                                        const v = GEMINI_TTS_VOICES.find(x => x.id === e.target.value) || localVoices.find(x => x.id === e.target.value);
                                        if (v) setSelectedVoice(v);
                                    }}
                                    style={{
                                        flex: 1, padding: '10px 14px', color: 'var(--mlab-blue)', fontSize: '0.85rem', background: 'white',
                                        border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', boxSizing: 'border-box'
                                    }}
                                >
                                    <optgroup label="☁️ High Quality (Cloud - May have slight network latency)">
                                        {GEMINI_TTS_VOICES.map((voice) => (
                                            <option key={voice.id} value={voice.id}>{voice.label}</option>
                                        ))}
                                    </optgroup>
                                    {localVoices.length > 0 && (
                                        <optgroup label="⚡ Instant (Local Device - Zero Latency)">
                                            {localVoices.map((voice) => (
                                                <option key={voice.id} value={voice.id}>{voice.label}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>

                                <button
                                    type="button"
                                    onClick={handleTestVoiceToggle}
                                    className="mlab-btn mlab-btn--ghost"
                                    style={{
                                        padding: '10px 14px',
                                        border: `1px solid ${isTestingVoice ? '#ef4444' : MIDNIGHT}`,
                                        color: isTestingVoice ? '#ef4444' : MIDNIGHT,
                                        borderRadius: '4px',
                                        width: '85px',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {isTestingVoice ? <Square size={16} fill="currentColor" /> : <Volume2 size={16} />}
                                    {isTestingVoice ? 'Stop' : 'Test'}
                                </button>
                            </div>

                            {selectedVoice.type === 'cloud' ? (
                                <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Cloud size={12} /> Powered by Google Cloud Gemini 3.1 Flash. Extremely realistic, but relies on network speed.
                                </p>
                            ) : (
                                <p style={{ fontSize: '0.7rem', color: '#16a34a', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <ZapIcon size={12} /> Powered by your local device. Perfect zero-latency synchronization.
                                </p>
                            )}
                        </div>

                        {(contextMode === 'both' || contextMode === 'chips_only') && (
                            <div>
                                <div className="aimi-header-flex" style={{ marginBottom: '10px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT }}>6. Select Focus Skill Chips</label>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '12px' }}>{selectedChips.length} Skills Selected</span>
                                </div>
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '6px', marginBottom: '1rem' }}>
                                    <div className="aimi-chip-group">
                                        {AVAILABLE_SKILL_CHIPS.map(chip => {
                                            const isSelected = selectedChips.includes(chip.id);
                                            return (
                                                <button key={chip.id} type="button" onClick={() => toggleChip(chip.id)} className={`aimi-chip ${isSelected ? 'aimi-chip--active' : ''}`}>
                                                    {isSelected ? <Check size={13} color={GREEN} /> : <Plus size={13} />} {chip.label}
                                                </button>
                                            );
                                        })}
                                        {selectedChips.filter(id => !AVAILABLE_SKILL_CHIPS.find(c => c.id === id)).map(customChip => (
                                            <button key={customChip} type="button" onClick={() => toggleChip(customChip)} className="aimi-chip aimi-chip--active">
                                                <Check size={13} color={GREEN} /> {customChip} <X size={13} style={{ marginLeft: '4px', opacity: 0.8 }} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input type="text" placeholder="Type a custom skill (e.g., GraphQL, Tailwind, System Design) and press Enter..." value={customSkillInput} onChange={e => setCustomSkillInput(e.target.value)} onKeyDown={handleAddCustomSkill} style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' }} />
                                    <button type="button" onClick={handleAddCustomSkill} style={{ padding: '0 18px', background: 'white', border: `1px solid ${MIDNIGHT}`, color: MIDNIGHT, fontWeight: 700, fontSize: '0.8rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add Skill</button>
                                </div>
                            </div>
                        )}

                        <div style={{ padding: '12px 16px', background: isQualifyingSelection ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isQualifyingSelection ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '4px', fontSize: '0.85rem' }}>
                            {isQualifyingSelection ? (
                                <span style={{ color: '#166534', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Trophy size={16} /> QUALIFYING RUN: Passing this session with 90%+ unlocks Tier Progression.
                                </span>
                            ) : (
                                <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <HelpCircle size={16} /> PRACTICE RUN ONLY: To qualify for Tier Progression, choose Full Scope & Both Context Sources.
                                </span>
                            )}
                        </div>

                        <div className="aimi-header-flex" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginTop: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569' }}><Sparkles size={16} color={GREEN} /><span>Target: <strong>{targetRole || 'Software Developer'}</strong> ({selectedDifficulty.toUpperCase()} MODE)</span></div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setInterviewStep('landing')} className="mlab-btn mlab-btn--ghost" style={{ padding: '10px 20px' }}>Cancel</button>
                                <button type="button" disabled={isLaunching} onClick={handleLaunchRoom} className="mlab-btn mlab-btn--primary" style={{ padding: '12px 24px', fontSize: '0.9rem', fontWeight: 700, background: GREEN, color: MIDNIGHT, border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isLaunching ? <Loader2 size={18} className="lfm-spin" /> : <Video size={18} />} Launch Interview Room
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {interviewStep === 'room' && (
                <AiInterviewRoom
                    sessionId={currentSessionId}
                    targetRole={targetRole}
                    difficulty={selectedDifficulty}
                    contextMode={contextMode}
                    interviewScope={interviewScope}
                    selectedChips={selectedChips}
                    cvSummary={learnerCvSummary}
                    pastInterviewSummary={pastInterviewSummary}
                    learnerName={learnerName}
                    learnerId={learnerId}
                    isBraveBrowser={isBraveBrowser}
                    selectedVoice={selectedVoice}
                    onCancel={() => setInterviewStep('landing')}
                    onEndSession={(sc, isQual) => { setLatestScorecard(sc); setLatestIsQualifying(Boolean(isQual)); setInterviewStep('scorecard'); }}
                />
            )}

            {interviewStep === 'scorecard' && (
                <InterviewScorecardView scorecard={latestScorecard} isQualifying={latestIsQualifying} difficulty={selectedDifficulty} onRestart={() => setInterviewStep('setup')} />
            )}
        </div>
    );
};

export default AiMockInterviewStudio;


// // src/components/views/AiMockInterview/AiMockInterviewStudio.tsx

// import React, { useEffect, useState, useRef, useCallback } from 'react';
// import {
//     Video, Sparkles, X, CheckCircle2, Check, Plus,
//     Loader2, Award, Brain, MessageSquare, Mic, MicOff,
//     VideoOff, Send, RotateCcw, AlertTriangle, CheckCircle, Tag,
//     Lock, Unlock, Flame, Zap, Sprout, Trophy,
//     Clock, PauseCircle, Play, Volume2, Pause, FileX, BookOpen,
//     FileText, History, HelpCircle, Eye, Layers
// } from 'lucide-react';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { doc, setDoc, updateDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import moment from 'moment';
// import { useToast } from '../../common/Toast/Toast';
// import { createPortal } from 'react-dom';

// import './AiMockInterviewStudio.css';

// const MIDNIGHT = '#073f4e';
// const GREEN = '#94c73d';

// export type DifficultyMode = 'simple' | 'mid' | 'hard';
// export type ContextMode = 'both' | 'chips_only' | 'cv_only' | 'none';
// export type InterviewScope = 'full' | 'technical_only' | 'behavioral_only';

// interface ModeConfig {
//     id: DifficultyMode;
//     level: number;
//     title: string;
//     badge: string;
//     icon: any;
//     color: string;
//     bg: string;
//     border: string;
//     timeLimitSeconds: number;
//     description: string;
// }

// const DIFFICULTY_MODES: ModeConfig[] = [
//     { id: 'simple', level: 1, title: 'Simple / Novice', badge: 'Tier 1', icon: Sprout, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', timeLimitSeconds: 600, description: 'Guided pace, core concepts & fundamental practice.' },
//     { id: 'mid', level: 2, title: 'Mid / Practitioner', badge: 'Tier 2', icon: Zap, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', timeLimitSeconds: 900, description: 'Standard interview speed, trade-offs & STAR questions.' },
//     { id: 'hard', level: 3, title: 'Hard / Master', badge: 'Tier 3', icon: Flame, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', timeLimitSeconds: 1200, description: 'High-rigor grilling, system design & edge cases.' }
// ];

// const AVAILABLE_SKILL_CHIPS = [
//     { id: 'react', label: 'React.js' },
//     { id: 'typescript', label: 'TypeScript' },
//     { id: 'node', label: 'Node.js' },
//     { id: 'postgresql', label: 'PostgreSQL & SQL' },
//     { id: 'docker', label: 'Docker & DevOps' },
//     { id: 'rest_api', label: 'REST APIs & Architecture' },
//     { id: 'star_behavioral', label: 'STAR Method Stories' },
//     { id: 'agile_scrum', label: 'Agile / Scrum' }
// ];

// const HOLISTIC_STAGES = [
//     'Work Readiness & Warmup',
//     'Soft Skills & STAR Behavioral',
//     'Technical Deep-Dive',
//     'System Scenario & Problem-Solving',
//     'Candidate Questions (Q&A)',
//     'Conclusion & Wrap-Up'
// ];

// // ════════════════════════════════════════════════════════════════════════════
// // 1. LIVE AI INTERVIEW ROOM COMPONENT
// // ════════════════════════════════════════════════════════════════════════════
// interface LiveRoomProps {
//     sessionId: string;
//     targetRole: string;
//     difficulty: DifficultyMode;
//     contextMode: ContextMode;
//     interviewScope: InterviewScope;
//     selectedChips: string[];
//     cvSummary: string;
//     pastInterviewSummary: string; // 🚀 NEW: Long-term memory prop
//     learnerName: string;
//     learnerId: string;
//     isBraveBrowser: boolean;
//     onEndSession: (scorecard?: any, isQualifying?: boolean) => void;
//     onCancel: () => void;
// }

// const AiInterviewRoom: React.FC<LiveRoomProps> = ({
//     sessionId, targetRole, difficulty, contextMode, interviewScope,
//     selectedChips, cvSummary, pastInterviewSummary, learnerName, learnerId, isBraveBrowser,
//     onEndSession, onCancel
// }) => {
//     const toast = useToast();
//     const videoRef = useRef<HTMLVideoElement>(null);
//     const modeConfig = DIFFICULTY_MODES.find(m => m.id === difficulty) || DIFFICULTY_MODES[0];

//     const [stream, setStream] = useState<MediaStream | null>(null);
//     const streamRef = useRef<MediaStream | null>(null);
//     const [isMicMuted, setIsMicMuted] = useState(false);
//     const [isVideoOff, setIsVideoOff] = useState(false);
//     const [showBraveModal, setShowBraveModal] = useState(false);

//     const [stageIndex, setStageIndex] = useState(0);
//     const [isAiLoading, setIsAiLoading] = useState(false);
//     const [isAiSpeaking, setIsAiSpeaking] = useState(false);
//     const [isAiVoiceInterrupted, setIsAiVoiceInterrupted] = useState(false);

//     const [isListening, setIsListening] = useState(false);
//     const isListeningRef = useRef(false);

//     const [isPaused, setIsPaused] = useState(false);
//     const [pauseSecondsLeft, setPauseSecondsLeft] = useState(60);
//     const isPausedRef = useRef(false);

//     const [sessionSecondsLeft, setSessionSecondsLeft] = useState(modeConfig.timeLimitSeconds);
//     const [inactivitySeconds, setInactivitySeconds] = useState(0);
//     const [inactivityWarning, setInactivityWarning] = useState<string | null>(null);

//     const [transcript, setTranscript] = useState<Array<{ speaker: 'interviewer' | 'candidate'; text: string; timestamp: string }>>([]);
//     const [currentCandidateInput, setCurrentCandidateInput] = useState('');
//     const [isEvaluating, setIsEvaluating] = useState(false);

//     const recognitionRef = useRef<any>(null);
//     const hasInitializedRef = useRef(false);
//     const hasPrompted30sRef = useRef(false);
//     const hasPrompted60sRef = useRef(false);

//     const stagesList = interviewScope === 'full'
//         ? HOLISTIC_STAGES
//         : interviewScope === 'technical_only'
//             ? ['Warmup', 'Technical Deep-Dive', 'Wrap-Up']
//             : ['Warmup', 'Soft Skills & Behavioral', 'Wrap-Up'];

//     const handleCompleteInterview = useCallback(async () => {
//         isListeningRef.current = false;
//         setIsListening(false);
//         if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (e) { } }
//         if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
//         if ('speechSynthesis' in window) window.speechSynthesis.cancel();

//         setIsEvaluating(true);
//         try {
//             const evalFn = httpsCallable(getFunctions(), 'evaluateMockInterview');
//             const res = await evalFn({
//                 sessionId, learnerId, targetRole, difficulty,
//                 selectedSkillChips: selectedChips, contextMode, interviewScope, cvSummary,
//                 fullTranscript: transcript
//             });
//             const data = res.data as any;
//             onEndSession(data.scorecard, data.isQualifyingRun);
//         } catch (err: any) {
//             toast.error("Assessment service unavailable. No score awarded.");
//             onEndSession({ evaluationFailed: true }, false);
//         } finally {
//             setIsEvaluating(false);
//         }
//     }, [sessionId, learnerId, targetRole, difficulty, selectedChips, contextMode, interviewScope, cvSummary, transcript, onEndSession, toast]);

//     useEffect(() => {
//         if (!isPaused) {
//             setPauseSecondsLeft(60);
//             return;
//         }

//         const pauseInterval = setInterval(() => {
//             setPauseSecondsLeft((prev) => {
//                 if (prev <= 1) {
//                     clearInterval(pauseInterval);
//                     toast.warning("Interrupted session expired after 60 seconds. Finalizing scorecard...");
//                     handleCompleteInterview();
//                     return 0;
//                 }
//                 return prev - 1;
//             });
//         }, 1000);

//         return () => clearInterval(pauseInterval);
//     }, [isPaused, handleCompleteInterview, toast]);

//     const speakAiResponse = useCallback((text: string) => {
//         if (!('speechSynthesis' in window) || isPausedRef.current) return;

//         window.speechSynthesis.cancel();
//         setIsAiVoiceInterrupted(false);

//         const utterance = new SpeechSynthesisUtterance(text);
//         utterance.rate = 1.0;
//         utterance.pitch = 1.0;

//         utterance.onstart = () => {
//             setIsAiSpeaking(true);
//             setIsAiVoiceInterrupted(false);
//         };
//         utterance.onend = () => setIsAiSpeaking(false);
//         utterance.onerror = () => setIsAiSpeaking(false);

//         window.speechSynthesis.speak(utterance);
//     }, []);

//     const pauseAiVoice = () => {
//         if ('speechSynthesis' in window) window.speechSynthesis.cancel();
//         setIsAiSpeaking(false);
//         setIsAiVoiceInterrupted(true);
//     };

//     const resumeAiVoice = (text: string) => {
//         speakAiResponse(text);
//     };

//     const pauseSession = useCallback((reason: string) => {
//         if (isPausedRef.current || isEvaluating) return;
//         isPausedRef.current = true;
//         setIsPaused(true);

//         pauseAiVoice();
//         isListeningRef.current = false;
//         setIsListening(false);
//         if (recognitionRef.current) {
//             try { recognitionRef.current.stop(); } catch (e) { }
//         }

//         toast.info(reason);
//     }, [isEvaluating, toast]);

//     const resumeSession = () => {
//         isPausedRef.current = false;
//         setIsPaused(false);
//         setPauseSecondsLeft(60);
//         toast.success("Session resumed. You can continue speaking or typing.");
//     };

//     useEffect(() => {
//         const handleVisibilityChange = () => {
//             if (document.hidden) {
//                 pauseSession("Session paused due to app backgrounding or incoming call.");
//             }
//         };

//         const handleUnload = () => {
//             if ('speechSynthesis' in window) window.speechSynthesis.cancel();
//             if (recognitionRef.current) {
//                 try { recognitionRef.current.stop(); } catch (e) { }
//             }
//             if (streamRef.current) {
//                 streamRef.current.getTracks().forEach(t => t.stop());
//             }
//         };

//         document.addEventListener('visibilitychange', handleVisibilityChange);
//         window.addEventListener('pagehide', handleUnload);
//         window.addEventListener('beforeunload', handleUnload);

//         return () => {
//             document.removeEventListener('visibilitychange', handleVisibilityChange);
//             window.removeEventListener('pagehide', handleUnload);
//             window.removeEventListener('beforeunload', handleUnload);
//         };
//     }, [pauseSession]);

//     useEffect(() => {
//         if (isPaused) return;

//         const interval = setInterval(() => {
//             setSessionSecondsLeft((prev) => {
//                 if (prev <= 1) {
//                     clearInterval(interval);
//                     toast.info("Interview time limit reached. Submitting session for evaluation...");
//                     handleCompleteInterview();
//                     return 0;
//                 }
//                 return prev - 1;
//             });
//         }, 1000);

//         return () => clearInterval(interval);
//     }, [isPaused, handleCompleteInterview, toast]);

//     useEffect(() => {
//         if (isAiLoading || isAiSpeaking || isEvaluating || isPaused) {
//             setInactivitySeconds(0);
//             return;
//         }

//         const interval = setInterval(() => {
//             setInactivitySeconds((prev) => prev + 1);
//         }, 1000);

//         return () => clearInterval(interval);
//     }, [isAiLoading, isAiSpeaking, isEvaluating, isPaused]);

//     useEffect(() => {
//         if (inactivitySeconds === 30 && !hasPrompted30sRef.current) {
//             hasPrompted30sRef.current = true;
//             const promptMsg = `Are you still there, ${learnerName}? Let me know if you would like me to repeat the question.`;
//             setTranscript(prev => [...prev, { speaker: 'interviewer', text: promptMsg, timestamp: moment().format('HH:mm') }]);
//             speakAiResponse(promptMsg);
//         } else if (inactivitySeconds === 60 && !hasPrompted60sRef.current) {
//             hasPrompted60sRef.current = true;
//             const warnMsg = `I haven't heard from you in over a minute. To save your progress, I will end this session in 30 seconds if there is no response.`;
//             setInactivityWarning("Silence Warning: Session closing in 30 seconds if inactive.");
//             setTranscript(prev => [...prev, { speaker: 'interviewer', text: warnMsg, timestamp: moment().format('HH:mm') }]);
//             speakAiResponse(warnMsg);
//         } else if (inactivitySeconds >= 90) {
//             toast.warning("Session closed automatically due to 90 seconds of inactivity.");
//             handleCompleteInterview();
//         }
//     }, [inactivitySeconds, learnerName, speakAiResponse, toast, handleCompleteInterview]);

//     useEffect(() => {
//         if (currentCandidateInput.trim()) {
//             setInactivitySeconds(0);
//             setInactivityWarning(null);
//             hasPrompted30sRef.current = false;
//             hasPrompted60sRef.current = false;
//         }
//     }, [currentCandidateInput]);

//     const triggerAiTurn = useCallback(async (history: any[]) => {
//         setIsAiLoading(true);
//         try {
//             const turnFn = httpsCallable(getFunctions(), 'generateInterviewTurn');

//             // 🚀 Extract the last user message to explicitly send it to the backend
//             const lastUserMsg = history.length > 0 && history[history.length - 1].role === 'user'
//                 ? history[history.length - 1].content
//                 : '';

//             const res = await turnFn({
//                 sessionId, targetRole, difficulty, seniority: difficulty,
//                 selectedSkillChips: selectedChips, currentStage: stagesList[stageIndex] || stagesList[0],
//                 contextMode, interviewScope, cvSummary,
//                 pastInterviewSummary,
//                 timeRemainingSeconds: sessionSecondsLeft, totalTimeLimitSeconds: modeConfig.timeLimitSeconds,
//                 conversationHistory: history,
//                 lastCandidateAnswer: lastUserMsg // 🚀 EXPLICITLY PASS THIS
//             });

//             const data = res.data as any;
//             const aiText = data.responseText || "Thank you. Let us move to the next question.";

//             if (data.shouldAdvanceStage && stageIndex < stagesList.length - 1) {
//                 setStageIndex(prev => prev + 1);
//             }

//             setTranscript(prev => [...prev, { speaker: 'interviewer', text: aiText, timestamp: moment().format('HH:mm') }]);
//             speakAiResponse(aiText);
//         } catch (err: any) {
//             // REMOVED HARDCODED FALLBACK. Let the user know the connection failed so they can type again.
//             toast.error("Connection to AI interviewer lost. Please try submitting your answer again.");
//         } finally {
//             setIsAiLoading(false);
//         }
//     }, [sessionId, targetRole, difficulty, selectedChips, stagesList, stageIndex, contextMode, interviewScope, cvSummary, pastInterviewSummary, sessionSecondsLeft, modeConfig.timeLimitSeconds, learnerName, speakAiResponse, toast]);

//     useEffect(() => {
//         if (hasInitializedRef.current) return;
//         hasInitializedRef.current = true;

//         let activeStream: MediaStream | null = null;

//         const initializeMedia = async () => {
//             try {
//                 activeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//             } catch (err: any) {
//                 try {
//                     activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
//                     setIsVideoOff(true);
//                 } catch (audioErr: any) {
//                     toast.error("No hardware camera/mic found. Operating in text mode.");
//                     setIsVideoOff(true);
//                 }
//             }

//             if (activeStream) {
//                 streamRef.current = activeStream;
//                 setStream(activeStream);
//                 if (videoRef.current) videoRef.current.srcObject = activeStream;
//             }

//             triggerAiTurn([]);
//         };

//         initializeMedia();

//         return () => {
//             if (streamRef.current) {
//                 streamRef.current.getTracks().forEach(t => t.stop());
//                 streamRef.current = null;
//             }
//             if ('speechSynthesis' in window) window.speechSynthesis.cancel();
//         };
//     }, [triggerAiTurn, toast]);

//     useEffect(() => {
//         if (transcript.length === 0 || !sessionId) return;

//         const sessionRef = doc(db, 'ai_interviews', sessionId);
//         updateDoc(sessionRef, {
//             transcript,
//             currentStage: stagesList[stageIndex] || 'Technical Deep-Dive',
//             lastTurnAt: new Date().toISOString()
//         }).catch(err => {
//             if (err?.code !== 'permission-denied') {
//                 console.warn("Incremental transcript auto-save skipped:", err?.message || err);
//             }
//         });
//     }, [transcript, sessionId, stageIndex, stagesList]);

//     const toggleListening = () => {
//         if (isPaused) {
//             toast.warning("Please click 'Resume Session' before activating voice input.");
//             return;
//         }

//         const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
//         if (!SpeechRecognition) {
//             toast.warning("Browser speech recognition unavailable. Please type your answer.");
//             return;
//         }

//         if (isListening) {
//             isListeningRef.current = false;
//             setIsListening(false);
//             if (recognitionRef.current) {
//                 try { recognitionRef.current.stop(); } catch (e) { }
//             }
//             toast.info("Voice input paused.");
//         } else {
//             if ('speechSynthesis' in window) window.speechSynthesis.cancel();
//             setIsAiSpeaking(false);

//             try {
//                 if (!recognitionRef.current) {
//                     const recog = new SpeechRecognition();
//                     recog.continuous = true;
//                     recog.interimResults = true;
//                     recog.lang = 'en-US';

//                     recog.onresult = (event: any) => {
//                         let text = '';
//                         for (let i = 0; i < event.results.length; i++) {
//                             text += event.results[i][0].transcript;
//                         }
//                         setCurrentCandidateInput(text);
//                     };

//                     recog.onerror = (e: any) => {
//                         if (['network', 'not-allowed', 'audio-capture', 'aborted'].includes(e.error)) {
//                             isListeningRef.current = false;
//                             setIsListening(false);

//                             if (e.error === 'network') {
//                                 if (isBraveBrowser) setShowBraveModal(true);
//                                 else toast.error("Speech service blocked. Please type your response.");
//                             }
//                         }
//                     };

//                     recog.onend = () => {
//                         if (isListeningRef.current && !isPausedRef.current) {
//                             try { recog.start(); } catch (err) {
//                                 isListeningRef.current = false;
//                                 setIsListening(false);
//                             }
//                         } else {
//                             setIsListening(false);
//                         }
//                     };

//                     recognitionRef.current = recog;
//                 }

//                 isListeningRef.current = true;
//                 setIsListening(true);
//                 recognitionRef.current.start();
//                 toast.success("Listening... Speak clearly into your mic.");
//             } catch (e: any) {
//                 isListeningRef.current = false;
//                 setIsListening(false);
//                 toast.error("Could not start microphone listener. Please type your answer.");
//             }
//         }
//     };

//     const handleSendCandidateResponse = () => {
//         if (!currentCandidateInput.trim() || isPaused) return;

//         setInactivitySeconds(0);
//         setInactivityWarning(null);
//         hasPrompted30sRef.current = false;
//         hasPrompted60sRef.current = false;

//         isListeningRef.current = false;
//         setIsListening(false);
//         if (recognitionRef.current) {
//             try { recognitionRef.current.stop(); } catch (e) { }
//         }

//         const candidateText = currentCandidateInput.trim();
//         const updatedTranscript = [...transcript, { speaker: 'candidate' as const, text: candidateText, timestamp: moment().format('HH:mm') }];

//         setTranscript(updatedTranscript);
//         setCurrentCandidateInput('');

//         const formattedHistory = updatedTranscript.map(t => ({
//             role: t.speaker === 'interviewer' ? 'assistant' : 'user',
//             content: t.text
//         }));

//         triggerAiTurn(formattedHistory);
//     };

//     const toggleMic = () => {
//         if (stream) { stream.getAudioTracks().forEach(t => t.enabled = isMicMuted); setIsMicMuted(!isMicMuted); }
//     };

//     const toggleVideo = () => {
//         if (stream) { stream.getVideoTracks().forEach(t => t.enabled = isVideoOff); setIsVideoOff(!isVideoOff); }
//     };

//     const formatTimer = (sec: number) => {
//         const m = Math.floor(sec / 60);
//         const s = sec % 60;
//         return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
//     };

//     const lastAiMessageIndex = transcript.map(t => t.speaker).lastIndexOf('interviewer');

//     const handleExitCancel = () => {
//         if (streamRef.current) {
//             streamRef.current.getTracks().forEach(t => t.stop());
//             streamRef.current = null;
//         }
//         if ('speechSynthesis' in window) window.speechSynthesis.cancel();
//         onCancel();
//     };

//     return (
//         <div className="aimi-room">

//             {/* Interrupted Overlay */}
//             {isPaused && (
//                 <div className="aimi-room__overlay">
//                     <div className="aimi-room__modal">
//                         <div style={{ background: '#f59e0b', color: 'white', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
//                             <PauseCircle size={32} />
//                         </div>
//                         <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)', color: 'white', textTransform: 'uppercase', fontSize: '1.25rem' }}>
//                             Session Interrupted
//                         </h3>
//                         <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
//                             Your interview was paused due to an incoming call or app backgrounding. Click below to resume.
//                         </p>

//                         <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '10px 14px', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#38bdf8', fontWeight: 800 }}>
//                             Auto-closing & submitting in: {pauseSecondsLeft}s
//                         </div>

//                         <button type="button" onClick={resumeSession} className="mlab-btn mlab-btn--primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.9rem', fontWeight: 700 }}>
//                             <Play size={18} /> Resume Session Now
//                         </button>
//                     </div>
//                 </div>
//             )}

//             {/* Brave Modal */}
//             {showBraveModal && createPortal(
//                 <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
//                     <div style={{ background: 'white', color: MIDNIGHT, maxWidth: '480px', width: '100%', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
//                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 <AlertTriangle size={20} /> Brave Browser Notice
//                             </h3>
//                             <button type="button" onClick={() => setShowBraveModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
//                         </div>
//                         <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6, margin: '0 0 1rem 0' }}>
//                             Brave Shields blocks Google's Web Speech API requests by default. To enable speech-to-text:
//                         </p>
//                         <ol style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
//                             <li style={{ marginBottom: '6px' }}>Click the <strong>Brave Lion Icon</strong> in your address bar.</li>
//                             <li style={{ marginBottom: '6px' }}>Turn <strong>Shields OFF</strong> for this site.</li>
//                             <li>Reload the page to speak natively, or continue by typing your answers below.</li>
//                         </ol>
//                         <button type="button" onClick={() => setShowBraveModal(false)} className="mlab-btn mlab-btn--primary" style={{ width: '100%', justifyContent: 'center' }}>
//                             I'll Type or Adjust Settings
//                         </button>
//                     </div>
//                 </div>, document.body
//             )}

//             {/* Warning Banner */}
//             {inactivityWarning && (
//                 <div className="aimi-room__warning-banner">
//                     <AlertTriangle size={16} />
//                     <span>{inactivityWarning}</span>
//                 </div>
//             )}

//             {/* Top Bar */}
//             <div className="aimi-room__top-bar">
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                     <div style={{ background: modeConfig.color, padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>
//                         {modeConfig.badge} • Stage {stageIndex + 1}/{stagesList.length}
//                     </div>
//                     <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#38bdf8' }}>
//                         {stagesList[stageIndex]}
//                     </span>
//                     {contextMode === 'both' && interviewScope === 'full' && (
//                         <span style={{ background: GREEN, color: MIDNIGHT, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>
//                             🏆 Qualifying Run
//                         </span>
//                     )}
//                 </div>

//                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
//                     <div className={`aimi-room__timer ${sessionSecondsLeft < 120 ? 'aimi-room__timer--warning' : ''}`}>
//                         <Clock size={16} /> Time Left: {formatTimer(sessionSecondsLeft)}
//                     </div>

//                     <button type="button" onClick={handleExitCancel} className="mlab-btn mlab-btn--ghost" style={{ color: '#94a3b8', padding: '6px 14px' }}>End Session</button>
//                     <button type="button" onClick={handleCompleteInterview} className="mlab-btn mlab-btn--danger" style={{ padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: 0 }} disabled={isEvaluating}>
//                         {isEvaluating ? <Loader2 size={14} className="lfm-spin" /> : <Award size={14} />} Complete & Submit
//                     </button>
//                 </div>
//             </div>

//             {/* Main Room Layout Grid */}
//             <div className="aimi-room__grid">
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                     <div className="aimi-room__avatar-box">
//                         <div className={`aimi-room__brain-icon ${isAiSpeaking ? 'aimi-room__brain-icon--speaking' : ''}`} style={{ background: modeConfig.color }}>
//                             <Brain size={40} color="white" />
//                             {isAiSpeaking && <div className="aimi-room__pulse-ring" />}
//                         </div>
//                         <strong style={{ fontSize: '0.9rem', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Interviewer ({modeConfig.title})</strong>
//                         <span style={{ fontSize: '0.75rem', color: isAiSpeaking ? '#38bdf8' : '#64748b', marginTop: '4px', fontWeight: 600 }}>{isAiLoading ? 'Thinking...' : isAiSpeaking ? '🔊 Speaking...' : 'Listening...'}</span>
//                     </div>

//                     <div className="aimi-room__video-box">
//                         <video ref={videoRef} autoPlay muted className="aimi-room__video-feed" style={{ display: isVideoOff ? 'none' : 'block' }} />
//                         {isVideoOff && (
//                             <div style={{ textAlign: 'center', color: '#64748b' }}><VideoOff size={40} style={{ margin: '0 auto 8px' }} /><span style={{ fontSize: '0.8rem', display: 'block' }}>Camera Off / Unavailable</span></div>
//                         )}
//                         <span style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, borderRadius: '2px' }}>{learnerName} (Candidate)</span>
//                     </div>

//                     <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', background: '#1e293b', padding: '10px', border: '1px solid #334155' }}>
//                         <button type="button" onClick={toggleMic} style={{ background: isMicMuted ? '#ef4444' : '#334155', color: 'white', border: 'none', padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
//                             {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />} {isMicMuted ? 'Unmute' : 'Mute'}
//                         </button>
//                         <button type="button" onClick={toggleVideo} style={{ background: isVideoOff ? '#ef4444' : '#334155', color: 'white', border: 'none', padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
//                             {isVideoOff ? <VideoOff size={16} /> : <Video size={16} />} {isVideoOff ? 'Start Video' : 'Stop Video'}
//                         </button>
//                     </div>
//                 </div>

//                 <div className="aimi-room__transcript-panel">
//                     <div style={{ padding: '1rem', borderBottom: '1px solid #334155', background: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                         <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}><MessageSquare size={14} /> Real-Time Transcript</span>
//                         <span style={{ fontSize: '0.7rem', color: GREEN, fontWeight: 700 }}>Live Feed Active</span>
//                     </div>

//                     <div className="aimi-room__transcript-feed">
//                         {transcript.map((item, idx) => {
//                             const isLatestAiMessage = item.speaker === 'interviewer' && idx === lastAiMessageIndex;

//                             return (
//                                 <div key={idx} style={{ alignSelf: item.speaker === 'candidate' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
//                                     <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '2px', textAlign: item.speaker === 'candidate' ? 'right' : 'left' }}>
//                                         {item.speaker === 'candidate' ? learnerName : 'AI Interviewer'} • {item.timestamp}
//                                     </div>
//                                     <div style={{ padding: '10px 14px', background: item.speaker === 'candidate' ? '#0284c7' : '#334155', color: 'white', borderRadius: '6px', fontSize: '0.85rem', lineHeight: 1.5 }}>
//                                         {item.text}

//                                         {isLatestAiMessage && (
//                                             <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                 {isAiSpeaking ? (
//                                                     <button
//                                                         type="button"
//                                                         onClick={pauseAiVoice}
//                                                         style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#38bdf8', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
//                                                     >
//                                                         <Pause size={12} /> Pause Voice
//                                                     </button>
//                                                 ) : isAiVoiceInterrupted ? (
//                                                     <button
//                                                         type="button"
//                                                         onClick={() => resumeAiVoice(item.text)}
//                                                         style={{ background: GREEN, border: 'none', color: MIDNIGHT, padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
//                                                     >
//                                                         <Play size={12} /> Resume AI Voice
//                                                     </button>
//                                                 ) : (
//                                                     <button
//                                                         type="button"
//                                                         onClick={() => resumeAiVoice(item.text)}
//                                                         style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
//                                                     >
//                                                         <Volume2 size={12} /> Replay Voice
//                                                     </button>
//                                                 )}
//                                             </div>
//                                         )}
//                                     </div>
//                                 </div>
//                             );
//                         })}
//                         {isAiLoading && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '0.8rem', fontStyle: 'italic' }}><Loader2 size={14} className="lfm-spin" /> AI is formulating...</div>}
//                     </div>

//                     {/* Voice Controls */}
//                     <div style={{ padding: '1rem', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', flexDirection: 'column', gap: '10px' }}>
//                         <div style={{ display: 'flex', gap: '8px' }}>
//                             <button
//                                 type="button"
//                                 onClick={toggleListening}
//                                 className={isListening ? 'aimi-room__speech-btn-listening' : ''}
//                                 style={{
//                                     background: isListening ? '#dc2626' : GREEN,
//                                     color: isListening ? 'white' : MIDNIGHT,
//                                     border: 'none',
//                                     padding: '0 16px',
//                                     fontWeight: 800,
//                                     fontSize: '0.8rem',
//                                     cursor: 'pointer',
//                                     display: 'flex',
//                                     alignItems: 'center',
//                                     gap: '6px'
//                                 }}
//                             >
//                                 {isListening ? <MicOff size={16} /> : <Mic size={16} />}
//                                 {isListening ? 'Stop Voice Input' : 'Start Voice Input'}
//                             </button>

//                             <input
//                                 type="text"
//                                 value={currentCandidateInput}
//                                 onChange={e => setCurrentCandidateInput(e.target.value)}
//                                 onKeyDown={e => e.key === 'Enter' && handleSendCandidateResponse()}
//                                 placeholder={isListening ? "Listening... Speak into your mic..." : "Type your answer or click 'Start Voice Input'..."}
//                                 style={{ flex: 1, padding: '10px', fontSize: '0.85rem', background: '#1e293b', border: `1px solid ${isListening ? '#38bdf8' : '#334155'}`, color: 'white', outline: 'none' }}
//                             />

//                             <button
//                                 type="button"
//                                 onClick={handleSendCandidateResponse}
//                                 disabled={!currentCandidateInput.trim() || isAiLoading}
//                                 className="mlab-btn mlab-btn--primary"
//                                 style={{ padding: '0 18px', borderRadius: 0 }}
//                             >
//                                 <Send size={16} />
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// // ════════════════════════════════════════════════════════════════════════════
// // 2. SCORECARD REPORT VIEW COMPONENT
// // ════════════════════════════════════════════════════════════════════════════
// const InterviewScorecardView: React.FC<{ scorecard: any; isQualifying?: boolean; difficulty: DifficultyMode; onRestart: () => void }> = ({ scorecard, isQualifying, difficulty, onRestart }) => {
//     if (!scorecard || scorecard.evaluationFailed) {
//         return (
//             <div className="aimi-card" style={{ borderTop: '4px solid #dc2626', textAlign: 'center' }}>
//                 <div style={{ background: '#fef2f2', color: '#dc2626', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
//                     <FileX size={32} />
//                 </div>
//                 <h2 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>
//                     Assessment Not Finalised
//                 </h2>
//                 <p style={{ color: 'var(--mlab-grey)', fontSize: '0.9rem', maxWidth: '520px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
//                     A valid interview evaluation could not be generated at this time because the assessment service was unreachable. No readiness score has been awarded for this attempt.
//                 </p>
//                 <button type="button" onClick={onRestart} className="mlab-btn mlab-btn--primary" style={{ padding: '10px 24px' }}>
//                     <RotateCcw size={16} /> Practice Again
//                 </button>
//             </div>
//         );
//     }

//     const overall = scorecard.overallScore;
//     const tech = scorecard.technicalScore;
//     const techKnowledge = scorecard.technicalKnowledgeScore ?? tech;
//     const interviewReadiness = scorecard.interviewReadinessScore ?? overall;
//     const behavioral = scorecard.behavioralScore;
//     const comm = scorecard.communicationScore;
//     const status = scorecard.readinessStatus || 'NOT_READY';

//     const currentMode = DIFFICULTY_MODES.find(m => m.id === difficulty) || DIFFICULTY_MODES[0];
//     const nextMode = DIFFICULTY_MODES.find(m => m.level === currentMode.level + 1);
//     const hasPassedThreshold = overall >= 90 && status === 'READY' && isQualifying;

//     const getStatusBadge = () => {
//         switch (status) {
//             case 'READY': return { text: 'INTERVIEW READY', bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
//             case 'NEARLY_READY': return { text: 'NEARLY READY (MINOR GAPS)', bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' };
//             case 'DEVELOPING': return { text: 'DEVELOPING (INCONSISTENT)', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
//             default: return { text: 'NOT INTERVIEW READY', bg: '#fef2f2', color: '#991b1b', border: '#fecaca' };
//         }
//     };

//     const statusBadge = getStatusBadge();

//     const getEvidenceBadgeClass = (level: string) => {
//         switch (level) {
//             case 'INDEPENDENT': return 'aimi-evidence-badge--independent';
//             case 'PROMPTED': return 'aimi-evidence-badge--prompted';
//             case 'PARTIAL': return 'aimi-evidence-badge--partial';
//             case 'INCORRECT': return 'aimi-evidence-badge--incorrect';
//             default: return '';
//         }
//     };

//     return (
//         <div className="aimi-scorecard animate-fade-in">
//             {isQualifying ? (
//                 hasPassedThreshold ? (
//                     <div className="aimi-scorecard__banner aimi-scorecard__banner--passed">
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                             <div style={{ background: '#16a34a', color: 'white', padding: '10px', borderRadius: '50%' }}>
//                                 <Trophy size={24} />
//                             </div>
//                             <div>
//                                 <strong style={{ fontSize: '1rem', color: '#15803d', display: 'block', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                     🎉 Level Mastery Achieved! ({overall}%) — INTERVIEW READY
//                                 </strong>
//                                 <span style={{ fontSize: '0.85rem', color: '#166534' }}>
//                                     {nextMode
//                                         ? `Demonstrated required independent competency in ${currentMode.title}. Unlocked ${nextMode.title} Mode.`
//                                         : `Mastery achieved across all difficulty tiers!`}
//                                 </span>
//                             </div>
//                         </div>
//                     </div>
//                 ) : (
//                     <div className="aimi-scorecard__banner aimi-scorecard__banner--failed">
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                             <div style={{ background: '#d97706', color: 'white', padding: '10px', borderRadius: '50%' }}>
//                                 <RotateCcw size={24} />
//                             </div>
//                             <div>
//                                 <strong style={{ fontSize: '1rem', color: '#b45309', display: 'block', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                     Target Not Met ({overall}%) — Practice Repeat Recommended
//                                 </strong>
//                                 <span style={{ fontSize: '0.85rem', color: '#92400e' }}>
//                                     A score of <strong>90% or above and READY status</strong> is required to master this level and unlock higher tiers.
//                                 </span>
//                             </div>
//                         </div>
//                     </div>
//                 )
//             ) : (
//                 <div className="aimi-scorecard__banner" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569' }}>
//                     <span>Practice Session Complete. To unlock the next tier, run a <strong>Holistic Interview with both CV & Skill Chips enabled</strong>.</span>
//                 </div>
//             )}

//             {/* Header Report Card */}
//             <div className="aimi-card" style={{ borderTop: `4px solid ${GREEN}` }}>
//                 <div className="aimi-header-flex" style={{ flexWrap: 'wrap', gap: '1rem' }}>
//                     <div>
//                         <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: statusBadge.bg, color: statusBadge.color, border: `1px solid ${statusBadge.border}`, padding: '4px 10px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
//                             <Award size={12} /> {statusBadge.text}
//                         </div>
//                         <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, fontSize: '1.6rem', textTransform: 'uppercase' }}>Employability Scorecard Report</h2>
//                         <p style={{ margin: '6px 0 0 0', color: '#334155', fontSize: '0.88rem', lineHeight: 1.6 }}>
//                             {scorecard.readinessSummary || "Evidence-based candidate competency evaluation."}
//                         </p>
//                     </div>
//                     <button type="button" onClick={onRestart} className="mlab-btn mlab-btn--primary" style={{ padding: '10px 20px', borderRadius: 0 }}><RotateCcw size={16} /> Practice Again</button>
//                 </div>
//             </div>

//             {/* Metric Cards Grid */}
//             <div className="aimi-scorecard__metrics-grid">
//                 <div className="aimi-metric-card">
//                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Overall Readiness</span>
//                     <div className="aimi-metric-value" style={{ color: MIDNIGHT }}>{overall}%</div>
//                     <span style={{ fontSize: '0.75rem', color: statusBadge.color, fontWeight: 700, background: statusBadge.bg, padding: '2px 8px', border: `1px solid ${statusBadge.border}` }}>
//                         {status}
//                     </span>
//                 </div>

//                 <div className="aimi-metric-card">
//                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Technical Score</span>
//                     <div className="aimi-metric-value" style={{ color: '#0284c7' }}>{tech}%</div>
//                     <span style={{ fontSize: '0.75rem', color: '#0369a1' }}>Core Technical Depth</span>
//                 </div>

//                 <div className="aimi-metric-card">
//                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Raw Knowledge</span>
//                     <div className="aimi-metric-value" style={{ color: '#0d9488' }}>{techKnowledge}%</div>
//                     <span style={{ fontSize: '0.75rem', color: '#0f766e' }}>Accuracy & Concepts</span>
//                 </div>

//                 <div className="aimi-metric-card">
//                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Interview Delivery</span>
//                     <div className="aimi-metric-value" style={{ color: '#4f46e5' }}>{interviewReadiness}%</div>
//                     <span style={{ fontSize: '0.75rem', color: '#4338ca' }}>Independent Execution</span>
//                 </div>

//                 <div className="aimi-metric-card">
//                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>STAR Behavioral</span>
//                     <div className="aimi-metric-value" style={{ color: '#d97706' }}>{behavioral}%</div>
//                     <span style={{ fontSize: '0.75rem', color: '#b45309' }}>Structure & Ownership</span>
//                 </div>

//                 <div className="aimi-metric-card">
//                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Communication</span>
//                     <div className="aimi-metric-value" style={{ color: '#7c3aed' }}>{comm}%</div>
//                     <span style={{ fontSize: '0.75rem', color: '#6d28d9' }}>Structure & Clarity</span>
//                 </div>
//             </div>

//             {/* Strengths & Gaps Grid */}
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
//                 <div className="aimi-card">
//                     <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: '#15803d', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={18} /> Demonstrated Strengths</h4>
//                     <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
//                         {(scorecard.strengths || []).map((s: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{s}</li>)}
//                     </ul>
//                 </div>

//                 <div className="aimi-card">
//                     <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={18} /> Priority Knowledge Gaps</h4>
//                     <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
//                         {(scorecard.priorityGaps || scorecard.areasForImprovement || []).map((gap: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{gap}</li>)}
//                     </ul>
//                 </div>
//             </div>

//             {/* Recommended Preparation */}
//             {scorecard.recommendedPreparation && scorecard.recommendedPreparation.length > 0 && (
//                 <div className="aimi-card">
//                     <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         <BookOpen size={18} color="#0284c7" /> Recommended Preparation Plan
//                     </h4>
//                     <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
//                         {scorecard.recommendedPreparation.map((prep: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{prep}</li>)}
//                     </ul>
//                 </div>
//             )}

//             {/* Question Breakdown */}
//             {scorecard.questionBreakdown && scorecard.questionBreakdown.length > 0 && (
//                 <div className="aimi-card">
//                     <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase' }}>Evidence-Based Question Breakdown</h4>
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                         {scorecard.questionBreakdown.map((q: any, idx: number) => {
//                             const badgeClass = getEvidenceBadgeClass(q.evidenceLevel);

//                             return (
//                                 <div key={idx} className="aimi-evidence-card">
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
//                                         <strong style={{ fontSize: '0.85rem', color: MIDNIGHT }}>Q{idx + 1}: {q.question}</strong>
//                                         <span className={`aimi-evidence-badge ${badgeClass}`}>
//                                             {q.evidenceLevel || 'EVALUATED'} ({q.score}%)
//                                         </span>
//                                     </div>
//                                     <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#475569', fontStyle: 'italic' }}>
//                                         "{q.candidateAnswer}"
//                                     </p>
//                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
//                                         <strong>Feedback:</strong> {q.feedback}
//                                     </p>
//                                     {q.whatWasMissing && (
//                                         <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#b45309', lineHeight: 1.5 }}>
//                                             <strong>Missing Evidence:</strong> {q.whatWasMissing}
//                                         </p>
//                                     )}
//                                     {q.idealAnswerSample && (
//                                         <div style={{ marginTop: '8px', padding: '8px 12px', background: '#e0f2fe', borderLeft: '3px solid #0284c7', fontSize: '0.78rem', color: '#0369a1', lineHeight: 1.5 }}>
//                                             <strong>Sample Target Response:</strong> {q.idealAnswerSample}
//                                         </div>
//                                     )}
//                                 </div>
//                             );
//                         })}
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };

// // ════════════════════════════════════════════════════════════════════════════
// // 3. MAIN EXPORTED ORCHESTRATOR COMPONENT
// // ════════════════════════════════════════════════════════════════════════════
// export interface AiMockInterviewStudioProps {
//     learnerName: string;
//     learnerId: string;
// }

// export const AiMockInterviewStudio: React.FC<AiMockInterviewStudioProps> = ({ learnerName, learnerId }) => {
//     const [interviewStep, setInterviewStep] = useState<'landing' | 'setup' | 'room' | 'scorecard'>('landing');
//     const [currentSessionId, setCurrentSessionId] = useState<string>('');
//     const [targetRole, setTargetRole] = useState('Software Developer');

//     const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyMode>('simple');
//     const [contextMode, setContextMode] = useState<ContextMode>('both');
//     const [interviewScope, setInterviewScope] = useState<InterviewScope>('full');

//     const [selectedChips, setSelectedChips] = useState<string[]>(['react', 'typescript', 'star_behavioral']);
//     const [customSkillInput, setCustomSkillInput] = useState('');
//     const [learnerCvSummary, setLearnerCvSummary] = useState<string>('Candidate has a software development background in web applications.');

//     // 🚀 NEW: Long-term memory state
//     const [pastInterviewSummary, setPastInterviewSummary] = useState<string>('');

//     const [latestScorecard, setLatestScorecard] = useState<any>(null);
//     const [latestIsQualifying, setLatestIsQualifying] = useState<boolean>(false);
//     const [isLaunching, setIsLaunching] = useState(false);
//     const [isBraveBrowser, setIsBraveBrowser] = useState(false);

//     const [pastSessions, setPastSessions] = useState<any[]>([]);
//     const [selectedAuditSession, setSelectedAuditSession] = useState<any | null>(null);
//     const [modeHighScores, setModeHighScores] = useState<Record<DifficultyMode, number>>({
//         simple: 0,
//         mid: 0,
//         hard: 0
//     });

//     useEffect(() => {
//         if ((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') {
//             (navigator as any).brave.isBrave().then((isBrave: boolean) => {
//                 if (isBrave) setIsBraveBrowser(true);
//             });
//         }
//     }, []);

//     useEffect(() => {
//         if (!learnerId) return;

//         const fetchHistoryAndScores = async () => {
//             try {
//                 const learnerDoc = await getDoc(doc(db, 'learners', learnerId));
//                 if (learnerDoc.exists()) {
//                     const data = learnerDoc.data();
//                     if (data.cvSummary || data.cvText) {
//                         setLearnerCvSummary(data.cvSummary || data.cvText);
//                     }
//                 }

//                 const qDocs = query(
//                     collection(db, 'ai_interviews'),
//                     where('learnerId', '==', learnerId),
//                     where('status', '==', 'completed')
//                 );
//                 const snap = await getDocs(qDocs);

//                 const list: any[] = [];
//                 const scores: Record<DifficultyMode, number> = { simple: 0, mid: 0, hard: 0 };

//                 snap.docs.forEach(docSnap => {
//                     const data = docSnap.data();
//                     list.push({ id: docSnap.id, ...data });

//                     const mode = (data.difficulty || 'simple') as DifficultyMode;
//                     const score = Number(data.scorecard?.overallScore) || 0;
//                     if (data.isQualifyingRun && data.scorecard?.readinessStatus === 'READY' && score > (scores[mode] || 0)) {
//                         scores[mode] = score;
//                     }
//                 });

//                 list.sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime());

//                 setPastSessions(list);
//                 setModeHighScores(scores);

//                 // 🚀 BUILD PAST INTERVIEW SUMMARY FOR AI MEMORY
//                 if (list.length > 0) {
//                     const lastSession = list[0]; // Most recent completed session
//                     const sc = lastSession.scorecard || {};
//                     const gaps = sc.priorityGaps || sc.areasForImprovement || [];
//                     const strengths = sc.strengths || [];

//                     let summary = `In their last mock interview for a ${lastSession.targetRole} role, the candidate scored ${sc.overallScore || 'unknown'}% and was rated as ${sc.readinessStatus || 'unknown'}.\n`;
//                     if (strengths.length > 0) summary += `Previous strengths noted: ${strengths.slice(0, 3).join(', ')}.\n`;
//                     if (gaps.length > 0) summary += `Previous priority gaps to re-test: ${gaps.slice(0, 3).join(', ')}.`;

//                     setPastInterviewSummary(summary);
//                 } else {
//                     setPastInterviewSummary(''); // No past interviews
//                 }

//             } catch (err: any) {
//                 console.warn("Past high scores query skipped:", err?.message || err);
//             }
//         };

//         fetchHistoryAndScores();
//     }, [learnerId, interviewStep]);

//     const isMidUnlocked = modeHighScores.simple >= 90;
//     const isHardUnlocked = isMidUnlocked && modeHighScores.mid >= 90;
//     const isQualifyingSelection = contextMode === 'both' && interviewScope === 'full';

//     const toggleChip = (chipId: string) => {
//         setSelectedChips(prev => prev.includes(chipId) ? prev.filter(c => c !== chipId) : [...prev, chipId]);
//     };

//     const handleAddCustomSkill = (e?: React.KeyboardEvent | React.MouseEvent) => {
//         if (e && 'key' in e && e.key !== 'Enter') return;
//         if (e) e.preventDefault();

//         const trimmed = customSkillInput.trim();
//         if (!trimmed) return;

//         const existsInDefaults = AVAILABLE_SKILL_CHIPS.find(c => c.label.toLowerCase() === trimmed.toLowerCase() || c.id.toLowerCase() === trimmed.toLowerCase());
//         const chipId = existsInDefaults ? existsInDefaults.id : trimmed;

//         if (!selectedChips.includes(chipId)) setSelectedChips(prev => [...prev, chipId]);
//         setCustomSkillInput('');
//     };

//     const handleLaunchRoom = async () => {
//         if (selectedChips.length === 0 && contextMode !== 'cv_only' && contextMode !== 'none') return;
//         setIsLaunching(true);

//         try {
//             const sessionRef = doc(collection(db, 'ai_interviews'));
//             const newSessionId = sessionRef.id;
//             setCurrentSessionId(newSessionId);

//             await setDoc(sessionRef, {
//                 id: newSessionId,
//                 learnerId: learnerId || 'unknown_learner',
//                 learnerName: learnerName || 'Candidate',
//                 targetRole,
//                 difficulty: selectedDifficulty,
//                 contextMode,
//                 interviewScope,
//                 isQualifyingRun: isQualifyingSelection,
//                 selectedSkillChips: selectedChips,
//                 transcript: [],
//                 status: 'in_progress',
//                 startedAt: new Date().toISOString()
//             });

//             setInterviewStep('room');
//         } catch (err: any) {
//             console.warn("Firestore session initialization bypassed:", err?.message || err);
//             setCurrentSessionId(`local_${Date.now()}`);
//             setInterviewStep('room');
//         } finally {
//             setIsLaunching(false);
//         }
//     };

//     return (
//         <div className="aimi-studio ld-animate">
//             {/* Audit Modal for Past Scorecard Inspection */}
//             {selectedAuditSession && createPortal(
//                 <div className="aimi-modal-overlay" onClick={() => setSelectedAuditSession(null)}>
//                     <div className="aimi-modal-body" onClick={e => e.stopPropagation()}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem' }}>
//                             <div>
//                                 <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase' }}>
//                                     Audit Inspection • {selectedAuditSession.targetRole}
//                                 </h3>
//                                 <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
//                                     {moment(selectedAuditSession.completedAt || selectedAuditSession.startedAt).format('D MMMM YYYY, h:mm A')}
//                                 </span>
//                             </div>
//                             <button type="button" onClick={() => setSelectedAuditSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
//                         </div>
//                         <InterviewScorecardView
//                             scorecard={selectedAuditSession.scorecard}
//                             isQualifying={selectedAuditSession.isQualifyingRun}
//                             difficulty={selectedAuditSession.difficulty}
//                             onRestart={() => setSelectedAuditSession(null)}
//                         />
//                     </div>
//                 </div>, document.body
//             )}

//             {interviewStep === 'landing' && (
//                 <>
//                     <div className="aimi-card">
//                         <div className="aimi-header-title">
//                             <Video size={28} color="var(--mlab-blue)" />
//                             <h2>AI Mock Interview Studio</h2>
//                         </div>
//                         <p className="aimi-description">
//                             Practice technical, behavioral, or full holistic interviews. Achieve <strong>90%+ in a Qualifying Full Interview (Both CV & Skills Enabled)</strong> to unlock higher difficulty tiers.
//                         </p>

//                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
//                             <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                 <Sprout size={18} color="#16a34a" />
//                                 <div>
//                                     <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 1 • Simple</span>
//                                     <strong style={{ fontSize: '0.85rem', color: MIDNIGHT }}>
//                                         High: {modeHighScores.simple}% {modeHighScores.simple >= 90 ? '🏆 Mastered' : '(Req: 90%)'}
//                                     </strong>
//                                 </div>
//                             </div>

//                             <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                 {isMidUnlocked ? <Zap size={18} color="#0284c7" /> : <Lock size={18} color="#94a3b8" />}
//                                 <div>
//                                     <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 2 • Mid</span>
//                                     <strong style={{ fontSize: '0.85rem', color: isMidUnlocked ? MIDNIGHT : '#94a3b8' }}>
//                                         {isMidUnlocked ? `High: ${modeHighScores.mid}% ${modeHighScores.mid >= 90 ? '🏆 Mastered' : '(Req: 90%)'}` : 'Locked (Req: 90% in Simple)'}
//                                     </strong>
//                                 </div>
//                             </div>

//                             <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                 {isHardUnlocked ? <Flame size={18} color="#dc2626" /> : <Lock size={18} color="#94a3b8" />}
//                                 <div>
//                                     <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 3 • Hard</span>
//                                     <strong style={{ fontSize: '0.85rem', color: isHardUnlocked ? MIDNIGHT : '#94a3b8' }}>
//                                         {isHardUnlocked ? `High: ${modeHighScores.hard}% ${modeHighScores.hard >= 90 ? '🏆 Mastered' : '(Req: 90%)'}` : 'Locked (Req: 90% in Mid)'}
//                                     </strong>
//                                 </div>
//                             </div>
//                         </div>

//                         <button type="button" className="mlab-btn mlab-btn--primary" style={{ padding: '10px 20px', fontSize: '0.9rem', fontWeight: 700, borderRadius: 0, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); setInterviewStep('setup'); }}>
//                             <Sparkles size={16} /> Start New Mock Interview
//                         </button>
//                     </div>

//                     {/* PAST PRACTICE & AUDIT HISTORY LOG */}
//                     <div className="aimi-card">
//                         <h3 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                             <History size={18} color="#0284c7" /> Past Practice & Audit History ({pastSessions.length})
//                         </h3>

//                         {pastSessions.length === 0 ? (
//                             <div style={{ textAlign: 'center', padding: '2.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
//                                 <FileText size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
//                                 <strong style={{ display: 'block', color: MIDNIGHT, textTransform: 'uppercase', marginBottom: '4px' }}>No Practice History Recorded</strong>
//                                 <p style={{ margin: 0, fontSize: '0.85rem' }}>Complete your first mock interview above to build an audited performance record.</p>
//                             </div>
//                         ) : (
//                             <div className="aimi-history-table-wrap">
//                                 <table className="aimi-history-table">
//                                     <thead>
//                                         <tr>
//                                             <th>Date & Time</th>
//                                             <th>Target Role</th>
//                                             <th>Tier</th>
//                                             <th>Format Scope</th>
//                                             <th>Context</th>
//                                             <th>Score & Readiness</th>
//                                             <th style={{ textAlign: 'right' }}>Audit Inspection</th>
//                                         </tr>
//                                     </thead>
//                                     <tbody>
//                                         {pastSessions.map(session => {
//                                             const sc = session.scorecard || {};
//                                             const score = sc.overallScore ?? '—';
//                                             const status = sc.readinessStatus || 'NOT_EVALUATED';

//                                             return (
//                                                 <tr key={session.id}>
//                                                     <td>{moment(session.completedAt || session.startedAt).format('D MMM YYYY, HH:mm')}</td>
//                                                     <td><strong>{session.targetRole}</strong></td>
//                                                     <td><span className="aimi-tag aimi-tag--practice">{session.difficulty?.toUpperCase()}</span></td>
//                                                     <td>
//                                                         <span className={`aimi-tag ${session.interviewScope === 'full' ? 'aimi-tag--scope-full' : session.interviewScope === 'technical_only' ? 'aimi-tag--scope-tech' : 'aimi-tag--scope-behavioral'}`}>
//                                                             {session.interviewScope === 'full' ? 'Full Holistic' : session.interviewScope === 'technical_only' ? 'Technical Only' : 'Behavioral Only'}
//                                                         </span>
//                                                     </td>
//                                                     <td>
//                                                         <span className={`aimi-tag ${session.isQualifyingRun ? 'aimi-tag--qualifying' : 'aimi-tag--practice'}`}>
//                                                             {session.isQualifyingRun ? '🏆 Qualifying (CV+Chips)' : session.contextMode?.replace('_', ' ').toUpperCase()}
//                                                         </span>
//                                                     </td>
//                                                     <td>
//                                                         <strong>{score}%</strong> <span style={{ fontSize: '0.7rem', color: status === 'READY' ? '#166534' : '#b45309' }}>({status})</span>
//                                                     </td>
//                                                     <td style={{ textAlign: 'right' }}>
//                                                         <button type="button" onClick={() => setSelectedAuditSession(session)} className="mlab-btn mlab-btn--ghost mlab-btn--sm" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>
//                                                             <Eye size={14} /> Inspect
//                                                         </button>
//                                                     </td>
//                                                 </tr>
//                                             );
//                                         })}
//                                     </tbody>
//                                 </table>
//                             </div>
//                         )}
//                     </div>
//                 </>
//             )}

//             {interviewStep === 'setup' && (
//                 <div className="animate-fade-in" style={{ maxWidth: '880px', margin: '0 auto', width: '100%' }}>
//                     <div className="aimi-card aimi-card--setup-header">
//                         <div className="aimi-header-flex">
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
//                                 <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={24} /></div>
//                                 <div>
//                                     <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, fontSize: '1.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Interview Studio Configuration</h2>
//                                     <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Select target roles, unlocked difficulty mode, and skill focus areas.</p>
//                                 </div>
//                             </div>
//                             <button type="button" onClick={() => setInterviewStep('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}><X size={20} /></button>
//                         </div>
//                     </div>

//                     <div className="aimi-card aimi-card--setup-body">
//                         <div>
//                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>1. Target Career Role</label>
//                             <div style={{ position: 'relative' }}>
//                                 <input type="text" value={targetRole} onChange={e => setTargetRole(e.target.value)} placeholder="e.g. Full-Stack Developer, Frontend Engineer..." className="aimi-input-text" />
//                                 <Tag size={18} className="aimi-input-icon" />
//                             </div>
//                         </div>

//                         <div>
//                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>2. Interview Scope / Format</label>
//                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
//                                 <button
//                                     type="button"
//                                     onClick={() => setInterviewScope('full')}
//                                     className={`aimi-tier-card ${interviewScope === 'full' ? 'aimi-tier-card--selected-mid' : ''}`}
//                                 >
//                                     <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Full Holistic Interview</strong>
//                                     <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Multi-part: Warmup, STAR, Technical, Scenario & Q&A. (Required for Progression)</span>
//                                 </button>
//                                 <button
//                                     type="button"
//                                     onClick={() => setInterviewScope('technical_only')}
//                                     className={`aimi-tier-card ${interviewScope === 'technical_only' ? 'aimi-tier-card--selected-mid' : ''}`}
//                                 >
//                                     <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Focused Technical Only</strong>
//                                     <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Targeted technical grilling practice.</span>
//                                 </button>
//                                 <button
//                                     type="button"
//                                     onClick={() => setInterviewScope('behavioral_only')}
//                                     className={`aimi-tier-card ${interviewScope === 'behavioral_only' ? 'aimi-tier-card--selected-mid' : ''}`}
//                                 >
//                                     <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Focused Behavioral Only</strong>
//                                     <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Soft skills, STAR stories & teamwork practice.</span>
//                                 </button>
//                             </div>
//                         </div>

//                         <div>
//                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>3. Context Sources</label>
//                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
//                                 {[
//                                     { id: 'both', label: 'Both CV & Skill Chips', desc: 'Required for Tier Progression' },
//                                     { id: 'chips_only', label: 'Skill Chips Only', desc: 'Practice focus skills' },
//                                     { id: 'cv_only', label: 'CV Background Only', desc: 'Practice resume defense' },
//                                     { id: 'none', label: 'Generic Standard', desc: 'Unassisted general interview' }
//                                 ].map(item => (
//                                     <button
//                                         key={item.id}
//                                         type="button"
//                                         onClick={() => setContextMode(item.id as ContextMode)}
//                                         className={`aimi-tier-card ${contextMode === item.id ? 'aimi-tier-card--selected-simple' : ''}`}
//                                     >
//                                         <strong style={{ fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>{item.label}</strong>
//                                         <span style={{ fontSize: '0.7rem', display: 'block', color: '#64748b' }}>{item.desc}</span>
//                                     </button>
//                                 ))}
//                             </div>
//                         </div>

//                         <div>
//                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '10px' }}>
//                                 4. Select Difficulty Mode Tier (Mastery Target: 90%+)
//                             </label>
//                             <div className="aimi-tier-grid">
//                                 {DIFFICULTY_MODES.map(mode => {
//                                     const ModeIcon = mode.icon;
//                                     const isSelected = selectedDifficulty === mode.id;

//                                     let isUnlocked = true;
//                                     if (mode.id === 'mid') isUnlocked = isMidUnlocked;
//                                     if (mode.id === 'hard') isUnlocked = isHardUnlocked;

//                                     const selectedClass = isSelected
//                                         ? mode.id === 'simple' ? 'aimi-tier-card--selected-simple' : mode.id === 'mid' ? 'aimi-tier-card--selected-mid' : 'aimi-tier-card--selected-hard'
//                                         : '';

//                                     return (
//                                         <button
//                                             key={mode.id}
//                                             type="button"
//                                             disabled={!isUnlocked}
//                                             onClick={() => setSelectedDifficulty(mode.id)}
//                                             className={`aimi-tier-card ${selectedClass}`}
//                                         >
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
//                                                 <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '3px', background: isUnlocked ? mode.color : '#94a3b8', color: 'white' }}>
//                                                     {mode.badge}
//                                                 </span>
//                                                 {isUnlocked ? (
//                                                     isSelected ? <CheckCircle2 size={18} color={mode.color} /> : <Unlock size={16} color="#94a3b8" />
//                                                 ) : (
//                                                     <Lock size={16} color="#94a3b8" />
//                                                 )}
//                                             </div>

//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
//                                                 <ModeIcon size={18} color={isUnlocked ? mode.color : '#94a3b8'} />
//                                                 <strong style={{ fontSize: '0.9rem', color: isUnlocked ? MIDNIGHT : '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                                     {mode.title}
//                                                 </strong>
//                                             </div>

//                                             <p style={{ margin: '4px 0 8px 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
//                                                 {mode.description}
//                                             </p>

//                                             {!isUnlocked && (
//                                                 <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1', fontSize: '0.7rem', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                     <Lock size={12} /> Score 90%+ in Tier {mode.level - 1} to unlock
//                                                 </div>
//                                             )}
//                                         </button>
//                                     );
//                                 })}
//                             </div>
//                         </div>

//                         {(contextMode === 'both' || contextMode === 'chips_only') && (
//                             <div>
//                                 <div className="aimi-header-flex" style={{ marginBottom: '10px' }}>
//                                     <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT }}>5. Select Focus Skill Chips</label>
//                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '12px' }}>{selectedChips.length} Skills Selected</span>
//                                 </div>
//                                 <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '6px', marginBottom: '1rem' }}>
//                                     <div className="aimi-chip-group">
//                                         {AVAILABLE_SKILL_CHIPS.map(chip => {
//                                             const isSelected = selectedChips.includes(chip.id);
//                                             return (
//                                                 <button key={chip.id} type="button" onClick={() => toggleChip(chip.id)} className={`aimi-chip ${isSelected ? 'aimi-chip--active' : ''}`}>
//                                                     {isSelected ? <Check size={13} color={GREEN} /> : <Plus size={13} />} {chip.label}
//                                                 </button>
//                                             );
//                                         })}
//                                         {selectedChips.filter(id => !AVAILABLE_SKILL_CHIPS.find(c => c.id === id)).map(customChip => (
//                                             <button key={customChip} type="button" onClick={() => toggleChip(customChip)} className="aimi-chip aimi-chip--active">
//                                                 <Check size={13} color={GREEN} /> {customChip} <X size={13} style={{ marginLeft: '4px', opacity: 0.8 }} />
//                                             </button>
//                                         ))}
//                                     </div>
//                                 </div>
//                                 <div style={{ display: 'flex', gap: '8px' }}>
//                                     <input type="text" placeholder="Type a custom skill (e.g., GraphQL, Tailwind, System Design) and press Enter..." value={customSkillInput} onChange={e => setCustomSkillInput(e.target.value)} onKeyDown={handleAddCustomSkill}
//                                         style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' }} />
//                                     <button type="button" onClick={handleAddCustomSkill} style={{ padding: '0 18px', background: 'white', border: `1px solid ${MIDNIGHT}`, color: MIDNIGHT, fontWeight: 700, fontSize: '0.8rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add Skill</button>
//                                 </div>
//                             </div>
//                         )}

//                         <div style={{ padding: '12px 16px', background: isQualifyingSelection ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isQualifyingSelection ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '4px', fontSize: '0.85rem' }}>
//                             {isQualifyingSelection ? (
//                                 <span style={{ color: '#166534', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                     <Trophy size={16} /> QUALIFYING RUN: Passing this session with 90%+ unlocks Tier Progression.
//                                 </span>
//                             ) : (
//                                 <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                     <HelpCircle size={16} /> PRACTICE RUN ONLY: To qualify for Tier Progression, choose Full Scope & Both Context Sources.
//                                 </span>
//                             )}
//                         </div>

//                         <div className="aimi-header-flex" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginTop: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569' }}><Sparkles size={16} color={GREEN} /><span>Target: <strong>{targetRole || 'Software Developer'}</strong> ({selectedDifficulty.toUpperCase()} MODE)</span></div>
//                             <div style={{ display: 'flex', gap: '12px' }}>
//                                 <button type="button" onClick={() => setInterviewStep('landing')} className="mlab-btn mlab-btn--ghost" style={{ padding: '10px 20px' }}>Cancel</button>
//                                 <button type="button" disabled={isLaunching} onClick={handleLaunchRoom} className="mlab-btn mlab-btn--primary" style={{ padding: '12px 24px', fontSize: '0.9rem', fontWeight: 700, background: GREEN, color: MIDNIGHT, border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                     {isLaunching ? <Loader2 size={18} className="lfm-spin" /> : <Video size={18} />} Launch Interview Room
//                                 </button>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {interviewStep === 'room' && (
//                 <AiInterviewRoom
//                     sessionId={currentSessionId}
//                     targetRole={targetRole}
//                     difficulty={selectedDifficulty}
//                     contextMode={contextMode}
//                     interviewScope={interviewScope}
//                     selectedChips={selectedChips}
//                     cvSummary={learnerCvSummary}
//                     pastInterviewSummary={pastInterviewSummary} // 🚀 PASS LONG-TERM MEMORY TO ROOM
//                     learnerName={learnerName}
//                     learnerId={learnerId}
//                     isBraveBrowser={isBraveBrowser}
//                     onCancel={() => setInterviewStep('landing')}
//                     onEndSession={(sc, isQual) => { setLatestScorecard(sc); setLatestIsQualifying(Boolean(isQual)); setInterviewStep('scorecard'); }}
//                 />
//             )}

//             {interviewStep === 'scorecard' && (
//                 <InterviewScorecardView scorecard={latestScorecard} isQualifying={latestIsQualifying} difficulty={selectedDifficulty} onRestart={() => setInterviewStep('setup')} />
//             )}
//         </div>
//     );
// };

// export default AiMockInterviewStudio;



// // // src/components/views/AiMockInterview/AiMockInterviewStudio.tsx

// // import React, { useEffect, useState, useRef, useCallback } from 'react';
// // import {
// //     Video, Sparkles, X, CheckCircle2, Check, Plus,
// //     Loader2, Award, Brain, MessageSquare, Mic, MicOff,
// //     VideoOff, Send, RotateCcw, AlertTriangle, CheckCircle, Tag,
// //     Lock, Unlock, Flame, Zap, Sprout, Trophy,
// //     Clock, PauseCircle, Play, Volume2, Pause, FileX, BookOpen,
// //     FileText, History, HelpCircle, Eye, Layers
// // } from 'lucide-react';
// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import { doc, setDoc, updateDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import moment from 'moment';
// // import { useToast } from '../../common/Toast/Toast';
// // import { createPortal } from 'react-dom';

// // import './AiMockInterviewStudio.css';

// // const MIDNIGHT = '#073f4e';
// // const GREEN = '#94c73d';

// // export type DifficultyMode = 'simple' | 'mid' | 'hard';
// // export type ContextMode = 'both' | 'chips_only' | 'cv_only' | 'none';
// // export type InterviewScope = 'full' | 'technical_only' | 'behavioral_only';

// // interface ModeConfig {
// //     id: DifficultyMode;
// //     level: number;
// //     title: string;
// //     badge: string;
// //     icon: any;
// //     color: string;
// //     bg: string;
// //     border: string;
// //     timeLimitSeconds: number;
// //     description: string;
// // }

// // const DIFFICULTY_MODES: ModeConfig[] = [
// //     { id: 'simple', level: 1, title: 'Simple / Novice', badge: 'Tier 1', icon: Sprout, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', timeLimitSeconds: 600, description: 'Guided pace, core concepts & fundamental practice.' },
// //     { id: 'mid', level: 2, title: 'Mid / Practitioner', badge: 'Tier 2', icon: Zap, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', timeLimitSeconds: 900, description: 'Standard interview speed, trade-offs & STAR questions.' },
// //     { id: 'hard', level: 3, title: 'Hard / Master', badge: 'Tier 3', icon: Flame, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', timeLimitSeconds: 1200, description: 'High-rigor grilling, system design & edge cases.' }
// // ];

// // const AVAILABLE_SKILL_CHIPS = [
// //     { id: 'react', label: 'React.js' },
// //     { id: 'typescript', label: 'TypeScript' },
// //     { id: 'node', label: 'Node.js' },
// //     { id: 'postgresql', label: 'PostgreSQL & SQL' },
// //     { id: 'docker', label: 'Docker & DevOps' },
// //     { id: 'rest_api', label: 'REST APIs & Architecture' },
// //     { id: 'star_behavioral', label: 'STAR Method Stories' },
// //     { id: 'agile_scrum', label: 'Agile / Scrum' }
// // ];

// // const HOLISTIC_STAGES = [
// //     'Work Readiness & Warmup',
// //     'Soft Skills & STAR Behavioral',
// //     'Technical Deep-Dive',
// //     'System Scenario & Problem-Solving',
// //     'Candidate Questions (Q&A)',
// //     'Conclusion & Wrap-Up'
// // ];

// // // ════════════════════════════════════════════════════════════════════════════
// // // 1. LIVE AI INTERVIEW ROOM COMPONENT
// // // ════════════════════════════════════════════════════════════════════════════
// // interface LiveRoomProps {
// //     sessionId: string;
// //     targetRole: string;
// //     difficulty: DifficultyMode;
// //     contextMode: ContextMode;
// //     interviewScope: InterviewScope;
// //     selectedChips: string[];
// //     cvSummary: string;
// //     learnerName: string;
// //     learnerId: string;
// //     isBraveBrowser: boolean;
// //     onEndSession: (scorecard?: any, isQualifying?: boolean) => void;
// //     onCancel: () => void;
// // }

// // const AiInterviewRoom: React.FC<LiveRoomProps> = ({
// //     sessionId, targetRole, difficulty, contextMode, interviewScope,
// //     selectedChips, cvSummary, learnerName, learnerId, isBraveBrowser,
// //     onEndSession, onCancel
// // }) => {
// //     const toast = useToast();
// //     const videoRef = useRef<HTMLVideoElement>(null);
// //     const modeConfig = DIFFICULTY_MODES.find(m => m.id === difficulty) || DIFFICULTY_MODES[0];

// //     const [stream, setStream] = useState<MediaStream | null>(null);
// //     const streamRef = useRef<MediaStream | null>(null);
// //     const [isMicMuted, setIsMicMuted] = useState(false);
// //     const [isVideoOff, setIsVideoOff] = useState(false);
// //     const [showBraveModal, setShowBraveModal] = useState(false);

// //     const [stageIndex, setStageIndex] = useState(0);
// //     const [isAiLoading, setIsAiLoading] = useState(false);
// //     const [isAiSpeaking, setIsAiSpeaking] = useState(false);
// //     const [isAiVoiceInterrupted, setIsAiVoiceInterrupted] = useState(false);

// //     const [isListening, setIsListening] = useState(false);
// //     const isListeningRef = useRef(false);

// //     const [isPaused, setIsPaused] = useState(false);
// //     const [pauseSecondsLeft, setPauseSecondsLeft] = useState(60);
// //     const isPausedRef = useRef(false);

// //     const [sessionSecondsLeft, setSessionSecondsLeft] = useState(modeConfig.timeLimitSeconds);
// //     const [inactivitySeconds, setInactivitySeconds] = useState(0);
// //     const [inactivityWarning, setInactivityWarning] = useState<string | null>(null);

// //     const [transcript, setTranscript] = useState<Array<{ speaker: 'interviewer' | 'candidate'; text: string; timestamp: string }>>([]);
// //     const [currentCandidateInput, setCurrentCandidateInput] = useState('');
// //     const [isEvaluating, setIsEvaluating] = useState(false);

// //     const recognitionRef = useRef<any>(null);
// //     const hasInitializedRef = useRef(false);
// //     const hasPrompted30sRef = useRef(false);
// //     const hasPrompted60sRef = useRef(false);

// //     const stagesList = interviewScope === 'full'
// //         ? HOLISTIC_STAGES
// //         : interviewScope === 'technical_only'
// //             ? ['Warmup', 'Technical Deep-Dive', 'Wrap-Up']
// //             : ['Warmup', 'Soft Skills & Behavioral', 'Wrap-Up'];

// //     const handleCompleteInterview = useCallback(async () => {
// //         isListeningRef.current = false;
// //         setIsListening(false);
// //         if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (e) { } }
// //         if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
// //         if ('speechSynthesis' in window) window.speechSynthesis.cancel();

// //         setIsEvaluating(true);
// //         try {
// //             const evalFn = httpsCallable(getFunctions(), 'evaluateMockInterview');
// //             const res = await evalFn({
// //                 sessionId, learnerId, targetRole, difficulty,
// //                 selectedSkillChips: selectedChips, contextMode, interviewScope, cvSummary,
// //                 fullTranscript: transcript
// //             });
// //             const data = res.data as any;
// //             onEndSession(data.scorecard, data.isQualifyingRun);
// //         } catch (err: any) {
// //             toast.error("Assessment service unavailable. No score awarded.");
// //             onEndSession({ evaluationFailed: true }, false);
// //         } finally {
// //             setIsEvaluating(false);
// //         }
// //     }, [sessionId, learnerId, targetRole, difficulty, selectedChips, contextMode, interviewScope, cvSummary, transcript, onEndSession, toast]);

// //     useEffect(() => {
// //         if (!isPaused) {
// //             setPauseSecondsLeft(60);
// //             return;
// //         }

// //         const pauseInterval = setInterval(() => {
// //             setPauseSecondsLeft((prev) => {
// //                 if (prev <= 1) {
// //                     clearInterval(pauseInterval);
// //                     toast.warning("Interrupted session expired after 60 seconds. Finalizing scorecard...");
// //                     handleCompleteInterview();
// //                     return 0;
// //                 }
// //                 return prev - 1;
// //             });
// //         }, 1000);

// //         return () => clearInterval(pauseInterval);
// //     }, [isPaused, handleCompleteInterview, toast]);

// //     const speakAiResponse = useCallback((text: string) => {
// //         if (!('speechSynthesis' in window) || isPausedRef.current) return;

// //         window.speechSynthesis.cancel();
// //         setIsAiVoiceInterrupted(false);

// //         const utterance = new SpeechSynthesisUtterance(text);
// //         utterance.rate = 1.0;
// //         utterance.pitch = 1.0;

// //         utterance.onstart = () => {
// //             setIsAiSpeaking(true);
// //             setIsAiVoiceInterrupted(false);
// //         };
// //         utterance.onend = () => setIsAiSpeaking(false);
// //         utterance.onerror = () => setIsAiSpeaking(false);

// //         window.speechSynthesis.speak(utterance);
// //     }, []);

// //     const pauseAiVoice = () => {
// //         if ('speechSynthesis' in window) window.speechSynthesis.cancel();
// //         setIsAiSpeaking(false);
// //         setIsAiVoiceInterrupted(true);
// //     };

// //     const resumeAiVoice = (text: string) => {
// //         speakAiResponse(text);
// //     };

// //     const pauseSession = useCallback((reason: string) => {
// //         if (isPausedRef.current || isEvaluating) return;
// //         isPausedRef.current = true;
// //         setIsPaused(true);

// //         pauseAiVoice();
// //         isListeningRef.current = false;
// //         setIsListening(false);
// //         if (recognitionRef.current) {
// //             try { recognitionRef.current.stop(); } catch (e) { }
// //         }

// //         toast.info(reason);
// //     }, [isEvaluating, toast]);

// //     const resumeSession = () => {
// //         isPausedRef.current = false;
// //         setIsPaused(false);
// //         setPauseSecondsLeft(60);
// //         toast.success("Session resumed. You can continue speaking or typing.");
// //     };

// //     useEffect(() => {
// //         const handleVisibilityChange = () => {
// //             if (document.hidden) {
// //                 pauseSession("Session paused due to app backgrounding or incoming call.");
// //             }
// //         };

// //         const handleUnload = () => {
// //             if ('speechSynthesis' in window) window.speechSynthesis.cancel();
// //             if (recognitionRef.current) {
// //                 try { recognitionRef.current.stop(); } catch (e) { }
// //             }
// //             if (streamRef.current) {
// //                 streamRef.current.getTracks().forEach(t => t.stop());
// //             }
// //         };

// //         document.addEventListener('visibilitychange', handleVisibilityChange);
// //         window.addEventListener('pagehide', handleUnload);
// //         window.addEventListener('beforeunload', handleUnload);

// //         return () => {
// //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// //             window.removeEventListener('pagehide', handleUnload);
// //             window.removeEventListener('beforeunload', handleUnload);
// //         };
// //     }, [pauseSession]);

// //     useEffect(() => {
// //         if (isPaused) return;

// //         const interval = setInterval(() => {
// //             setSessionSecondsLeft((prev) => {
// //                 if (prev <= 1) {
// //                     clearInterval(interval);
// //                     toast.info("Interview time limit reached. Submitting session for evaluation...");
// //                     handleCompleteInterview();
// //                     return 0;
// //                 }
// //                 return prev - 1;
// //             });
// //         }, 1000);

// //         return () => clearInterval(interval);
// //     }, [isPaused, handleCompleteInterview, toast]);

// //     useEffect(() => {
// //         if (isAiLoading || isAiSpeaking || isEvaluating || isPaused) {
// //             setInactivitySeconds(0);
// //             return;
// //         }

// //         const interval = setInterval(() => {
// //             setInactivitySeconds((prev) => prev + 1);
// //         }, 1000);

// //         return () => clearInterval(interval);
// //     }, [isAiLoading, isAiSpeaking, isEvaluating, isPaused]);

// //     useEffect(() => {
// //         if (inactivitySeconds === 30 && !hasPrompted30sRef.current) {
// //             hasPrompted30sRef.current = true;
// //             const promptMsg = `Are you still there, ${learnerName}? Let me know if you would like me to repeat the question.`;
// //             setTranscript(prev => [...prev, { speaker: 'interviewer', text: promptMsg, timestamp: moment().format('HH:mm') }]);
// //             speakAiResponse(promptMsg);
// //         } else if (inactivitySeconds === 60 && !hasPrompted60sRef.current) {
// //             hasPrompted60sRef.current = true;
// //             const warnMsg = `I haven't heard from you in over a minute. To save your progress, I will end this session in 30 seconds if there is no response.`;
// //             setInactivityWarning("Silence Warning: Session closing in 30 seconds if inactive.");
// //             setTranscript(prev => [...prev, { speaker: 'interviewer', text: warnMsg, timestamp: moment().format('HH:mm') }]);
// //             speakAiResponse(warnMsg);
// //         } else if (inactivitySeconds >= 90) {
// //             toast.warning("Session closed automatically due to 90 seconds of inactivity.");
// //             handleCompleteInterview();
// //         }
// //     }, [inactivitySeconds, learnerName, speakAiResponse, toast, handleCompleteInterview]);

// //     useEffect(() => {
// //         if (currentCandidateInput.trim()) {
// //             setInactivitySeconds(0);
// //             setInactivityWarning(null);
// //             hasPrompted30sRef.current = false;
// //             hasPrompted60sRef.current = false;
// //         }
// //     }, [currentCandidateInput]);

// //     const triggerAiTurn = useCallback(async (history: any[]) => {
// //         setIsAiLoading(true);
// //         try {
// //             const turnFn = httpsCallable(getFunctions(), 'generateInterviewTurn');
// //             const res = await turnFn({
// //                 sessionId, targetRole, difficulty, seniority: difficulty,
// //                 selectedSkillChips: selectedChips, currentStage: stagesList[stageIndex] || stagesList[0],
// //                 contextMode, interviewScope, cvSummary,
// //                 timeRemainingSeconds: sessionSecondsLeft, totalTimeLimitSeconds: modeConfig.timeLimitSeconds,
// //                 conversationHistory: history
// //             });

// //             const data = res.data as any;
// //             const aiText = data.responseText || "Thank you. Let us move to the next question.";

// //             if (data.shouldAdvanceStage && stageIndex < stagesList.length - 1) {
// //                 setStageIndex(prev => prev + 1);
// //             }

// //             setTranscript(prev => [...prev, { speaker: 'interviewer', text: aiText, timestamp: moment().format('HH:mm') }]);
// //             speakAiResponse(aiText);
// //         } catch (err: any) {
// //             const fallbackText = sessionSecondsLeft <= 120
// //                 ? `Thank you ${learnerName}. As we are almost out of time, can you give me a brief closing summary of your experience with ${selectedChips[0] || 'software architecture'}?`
// //                 : `Thank you ${learnerName}. Let's discuss your experience with ${selectedChips[0] || 'software architecture'}. Can you describe a challenging scenario you solved?`;

// //             setTranscript(prev => [...prev, { speaker: 'interviewer', text: fallbackText, timestamp: moment().format('HH:mm') }]);
// //             speakAiResponse(fallbackText);
// //         } finally {
// //             setIsAiLoading(false);
// //         }
// //     }, [sessionId, targetRole, difficulty, selectedChips, stagesList, stageIndex, contextMode, interviewScope, cvSummary, sessionSecondsLeft, modeConfig.timeLimitSeconds, learnerName, speakAiResponse]);

// //     useEffect(() => {
// //         if (hasInitializedRef.current) return;
// //         hasInitializedRef.current = true;

// //         let activeStream: MediaStream | null = null;

// //         const initializeMedia = async () => {
// //             try {
// //                 activeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
// //             } catch (err: any) {
// //                 try {
// //                     activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
// //                     setIsVideoOff(true);
// //                 } catch (audioErr: any) {
// //                     toast.error("No hardware camera/mic found. Operating in text mode.");
// //                     setIsVideoOff(true);
// //                 }
// //             }

// //             if (activeStream) {
// //                 streamRef.current = activeStream;
// //                 setStream(activeStream);
// //                 if (videoRef.current) videoRef.current.srcObject = activeStream;
// //             }

// //             triggerAiTurn([]);
// //         };

// //         initializeMedia();

// //         return () => {
// //             if (streamRef.current) {
// //                 streamRef.current.getTracks().forEach(t => t.stop());
// //                 streamRef.current = null;
// //             }
// //             if ('speechSynthesis' in window) window.speechSynthesis.cancel();
// //         };
// //     }, [triggerAiTurn, toast]);

// //     useEffect(() => {
// //         if (transcript.length === 0 || !sessionId) return;

// //         const sessionRef = doc(db, 'ai_interviews', sessionId);
// //         updateDoc(sessionRef, {
// //             transcript,
// //             currentStage: stagesList[stageIndex] || 'Technical Deep-Dive',
// //             lastTurnAt: new Date().toISOString()
// //         }).catch(err => {
// //             if (err?.code !== 'permission-denied') {
// //                 console.warn("Incremental transcript auto-save skipped:", err?.message || err);
// //             }
// //         });
// //     }, [transcript, sessionId, stageIndex, stagesList]);

// //     const toggleListening = () => {
// //         if (isPaused) {
// //             toast.warning("Please click 'Resume Session' before activating voice input.");
// //             return;
// //         }

// //         const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
// //         if (!SpeechRecognition) {
// //             toast.warning("Browser speech recognition unavailable. Please type your answer.");
// //             return;
// //         }

// //         if (isListening) {
// //             isListeningRef.current = false;
// //             setIsListening(false);
// //             if (recognitionRef.current) {
// //                 try { recognitionRef.current.stop(); } catch (e) { }
// //             }
// //             toast.info("Voice input paused.");
// //         } else {
// //             if ('speechSynthesis' in window) window.speechSynthesis.cancel();
// //             setIsAiSpeaking(false);

// //             try {
// //                 if (!recognitionRef.current) {
// //                     const recog = new SpeechRecognition();
// //                     recog.continuous = true;
// //                     recog.interimResults = true;
// //                     recog.lang = 'en-US';

// //                     recog.onresult = (event: any) => {
// //                         let text = '';
// //                         for (let i = 0; i < event.results.length; i++) {
// //                             text += event.results[i][0].transcript;
// //                         }
// //                         setCurrentCandidateInput(text);
// //                     };

// //                     recog.onerror = (e: any) => {
// //                         if (['network', 'not-allowed', 'audio-capture', 'aborted'].includes(e.error)) {
// //                             isListeningRef.current = false;
// //                             setIsListening(false);

// //                             if (e.error === 'network') {
// //                                 if (isBraveBrowser) setShowBraveModal(true);
// //                                 else toast.error("Speech service blocked. Please type your response.");
// //                             }
// //                         }
// //                     };

// //                     recog.onend = () => {
// //                         if (isListeningRef.current && !isPausedRef.current) {
// //                             try { recog.start(); } catch (err) {
// //                                 isListeningRef.current = false;
// //                                 setIsListening(false);
// //                             }
// //                         } else {
// //                             setIsListening(false);
// //                         }
// //                     };

// //                     recognitionRef.current = recog;
// //                 }

// //                 isListeningRef.current = true;
// //                 setIsListening(true);
// //                 recognitionRef.current.start();
// //                 toast.success("Listening... Speak clearly into your mic.");
// //             } catch (e: any) {
// //                 isListeningRef.current = false;
// //                 setIsListening(false);
// //                 toast.error("Could not start microphone listener. Please type your answer.");
// //             }
// //         }
// //     };

// //     const handleSendCandidateResponse = () => {
// //         if (!currentCandidateInput.trim() || isPaused) return;

// //         setInactivitySeconds(0);
// //         setInactivityWarning(null);
// //         hasPrompted30sRef.current = false;
// //         hasPrompted60sRef.current = false;

// //         isListeningRef.current = false;
// //         setIsListening(false);
// //         if (recognitionRef.current) {
// //             try { recognitionRef.current.stop(); } catch (e) { }
// //         }

// //         const candidateText = currentCandidateInput.trim();
// //         const updatedTranscript = [...transcript, { speaker: 'candidate' as const, text: candidateText, timestamp: moment().format('HH:mm') }];

// //         setTranscript(updatedTranscript);
// //         setCurrentCandidateInput('');

// //         const formattedHistory = updatedTranscript.map(t => ({
// //             role: t.speaker === 'interviewer' ? 'assistant' : 'user',
// //             content: t.text
// //         }));

// //         triggerAiTurn(formattedHistory);
// //     };

// //     const toggleMic = () => {
// //         if (stream) { stream.getAudioTracks().forEach(t => t.enabled = isMicMuted); setIsMicMuted(!isMicMuted); }
// //     };

// //     const toggleVideo = () => {
// //         if (stream) { stream.getVideoTracks().forEach(t => t.enabled = isVideoOff); setIsVideoOff(!isVideoOff); }
// //     };

// //     const formatTimer = (sec: number) => {
// //         const m = Math.floor(sec / 60);
// //         const s = sec % 60;
// //         return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
// //     };

// //     const lastAiMessageIndex = transcript.map(t => t.speaker).lastIndexOf('interviewer');

// //     const handleExitCancel = () => {
// //         if (streamRef.current) {
// //             streamRef.current.getTracks().forEach(t => t.stop());
// //             streamRef.current = null;
// //         }
// //         if ('speechSynthesis' in window) window.speechSynthesis.cancel();
// //         onCancel();
// //     };

// //     return (
// //         <div className="aimi-room">

// //             {/* Interrupted Overlay */}
// //             {isPaused && (
// //                 <div className="aimi-room__overlay">
// //                     <div className="aimi-room__modal">
// //                         <div style={{ background: '#f59e0b', color: 'white', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
// //                             <PauseCircle size={32} />
// //                         </div>
// //                         <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)', color: 'white', textTransform: 'uppercase', fontSize: '1.25rem' }}>
// //                             Session Interrupted
// //                         </h3>
// //                         <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
// //                             Your interview was paused due to an incoming call or app backgrounding. Click below to resume.
// //                         </p>

// //                         <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '10px 14px', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#38bdf8', fontWeight: 800 }}>
// //                             Auto-closing & submitting in: {pauseSecondsLeft}s
// //                         </div>

// //                         <button type="button" onClick={resumeSession} className="mlab-btn mlab-btn--primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.9rem', fontWeight: 700 }}>
// //                             <Play size={18} /> Resume Session Now
// //                         </button>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* Brave Modal */}
// //             {showBraveModal && createPortal(
// //                 <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
// //                     <div style={{ background: 'white', color: MIDNIGHT, maxWidth: '480px', width: '100%', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
// //                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                 <AlertTriangle size={20} /> Brave Browser Notice
// //                             </h3>
// //                             <button type="button" onClick={() => setShowBraveModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
// //                         </div>
// //                         <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6, margin: '0 0 1rem 0' }}>
// //                             Brave Shields blocks Google's Web Speech API requests by default. To enable speech-to-text:
// //                         </p>
// //                         <ol style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
// //                             <li style={{ marginBottom: '6px' }}>Click the <strong>Brave Lion Icon</strong> in your address bar.</li>
// //                             <li style={{ marginBottom: '6px' }}>Turn <strong>Shields OFF</strong> for this site.</li>
// //                             <li>Reload the page to speak natively, or continue by typing your answers below.</li>
// //                         </ol>
// //                         <button type="button" onClick={() => setShowBraveModal(false)} className="mlab-btn mlab-btn--primary" style={{ width: '100%', justifyContent: 'center' }}>
// //                             I'll Type or Adjust Settings
// //                         </button>
// //                     </div>
// //                 </div>, document.body
// //             )}

// //             {/* Warning Banner */}
// //             {inactivityWarning && (
// //                 <div className="aimi-room__warning-banner">
// //                     <AlertTriangle size={16} />
// //                     <span>{inactivityWarning}</span>
// //                 </div>
// //             )}

// //             {/* Top Bar */}
// //             <div className="aimi-room__top-bar">
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                     <div style={{ background: modeConfig.color, padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>
// //                         {modeConfig.badge} • Stage {stageIndex + 1}/{stagesList.length}
// //                     </div>
// //                     <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#38bdf8' }}>
// //                         {stagesList[stageIndex]}
// //                     </span>
// //                     {contextMode === 'both' && interviewScope === 'full' && (
// //                         <span style={{ background: GREEN, color: MIDNIGHT, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>
// //                             🏆 Qualifying Run
// //                         </span>
// //                     )}
// //                 </div>

// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
// //                     <div className={`aimi-room__timer ${sessionSecondsLeft < 120 ? 'aimi-room__timer--warning' : ''}`}>
// //                         <Clock size={16} /> Time Left: {formatTimer(sessionSecondsLeft)}
// //                     </div>

// //                     <button type="button" onClick={handleExitCancel} className="mlab-btn mlab-btn--ghost" style={{ color: '#94a3b8', padding: '6px 14px' }}>End Session</button>
// //                     <button type="button" onClick={handleCompleteInterview} className="mlab-btn mlab-btn--danger" style={{ padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: 0 }} disabled={isEvaluating}>
// //                         {isEvaluating ? <Loader2 size={14} className="lfm-spin" /> : <Award size={14} />} Complete & Submit
// //                     </button>
// //                 </div>
// //             </div>

// //             {/* Main Room Layout Grid */}
// //             <div className="aimi-room__grid">
// //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                     <div className="aimi-room__avatar-box">
// //                         <div className={`aimi-room__brain-icon ${isAiSpeaking ? 'aimi-room__brain-icon--speaking' : ''}`} style={{ background: modeConfig.color }}>
// //                             <Brain size={40} color="white" />
// //                             {isAiSpeaking && <div className="aimi-room__pulse-ring" />}
// //                         </div>
// //                         <strong style={{ fontSize: '0.9rem', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Interviewer ({modeConfig.title})</strong>
// //                         <span style={{ fontSize: '0.75rem', color: isAiSpeaking ? '#38bdf8' : '#64748b', marginTop: '4px', fontWeight: 600 }}>{isAiLoading ? 'Thinking...' : isAiSpeaking ? '🔊 Speaking...' : 'Listening...'}</span>
// //                     </div>

// //                     <div className="aimi-room__video-box">
// //                         <video ref={videoRef} autoPlay muted className="aimi-room__video-feed" style={{ display: isVideoOff ? 'none' : 'block' }} />
// //                         {isVideoOff && (
// //                             <div style={{ textAlign: 'center', color: '#64748b' }}><VideoOff size={40} style={{ margin: '0 auto 8px' }} /><span style={{ fontSize: '0.8rem', display: 'block' }}>Camera Off / Unavailable</span></div>
// //                         )}
// //                         <span style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, borderRadius: '2px' }}>{learnerName} (Candidate)</span>
// //                     </div>

// //                     <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', background: '#1e293b', padding: '10px', border: '1px solid #334155' }}>
// //                         <button type="button" onClick={toggleMic} style={{ background: isMicMuted ? '#ef4444' : '#334155', color: 'white', border: 'none', padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
// //                             {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />} {isMicMuted ? 'Unmute' : 'Mute'}
// //                         </button>
// //                         <button type="button" onClick={toggleVideo} style={{ background: isVideoOff ? '#ef4444' : '#334155', color: 'white', border: 'none', padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
// //                             {isVideoOff ? <VideoOff size={16} /> : <Video size={16} />} {isVideoOff ? 'Start Video' : 'Stop Video'}
// //                         </button>
// //                     </div>
// //                 </div>

// //                 <div className="aimi-room__transcript-panel">
// //                     <div style={{ padding: '1rem', borderBottom: '1px solid #334155', background: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                         <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}><MessageSquare size={14} /> Real-Time Transcript</span>
// //                         <span style={{ fontSize: '0.7rem', color: GREEN, fontWeight: 700 }}>Live Feed Active</span>
// //                     </div>

// //                     <div className="aimi-room__transcript-feed">
// //                         {transcript.map((item, idx) => {
// //                             const isLatestAiMessage = item.speaker === 'interviewer' && idx === lastAiMessageIndex;

// //                             return (
// //                                 <div key={idx} style={{ alignSelf: item.speaker === 'candidate' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
// //                                     <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '2px', textAlign: item.speaker === 'candidate' ? 'right' : 'left' }}>
// //                                         {item.speaker === 'candidate' ? learnerName : 'AI Interviewer'} • {item.timestamp}
// //                                     </div>
// //                                     <div style={{ padding: '10px 14px', background: item.speaker === 'candidate' ? '#0284c7' : '#334155', color: 'white', borderRadius: '6px', fontSize: '0.85rem', lineHeight: 1.5 }}>
// //                                         {item.text}

// //                                         {isLatestAiMessage && (
// //                                             <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                 {isAiSpeaking ? (
// //                                                     <button
// //                                                         type="button"
// //                                                         onClick={pauseAiVoice}
// //                                                         style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#38bdf8', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// //                                                     >
// //                                                         <Pause size={12} /> Pause Voice
// //                                                     </button>
// //                                                 ) : isAiVoiceInterrupted ? (
// //                                                     <button
// //                                                         type="button"
// //                                                         onClick={() => resumeAiVoice(item.text)}
// //                                                         style={{ background: GREEN, border: 'none', color: MIDNIGHT, padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// //                                                     >
// //                                                         <Play size={12} /> Resume AI Voice
// //                                                     </button>
// //                                                 ) : (
// //                                                     <button
// //                                                         type="button"
// //                                                         onClick={() => resumeAiVoice(item.text)}
// //                                                         style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// //                                                     >
// //                                                         <Volume2 size={12} /> Replay Voice
// //                                                     </button>
// //                                                 )}
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                 </div>
// //                             );
// //                         })}
// //                         {isAiLoading && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '0.8rem', fontStyle: 'italic' }}><Loader2 size={14} className="lfm-spin" /> AI is formulating...</div>}
// //                     </div>

// //                     {/* Voice Controls */}
// //                     <div style={{ padding: '1rem', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', flexDirection: 'column', gap: '10px' }}>
// //                         <div style={{ display: 'flex', gap: '8px' }}>
// //                             <button
// //                                 type="button"
// //                                 onClick={toggleListening}
// //                                 className={isListening ? 'aimi-room__speech-btn-listening' : ''}
// //                                 style={{
// //                                     background: isListening ? '#dc2626' : GREEN,
// //                                     color: isListening ? 'white' : MIDNIGHT,
// //                                     border: 'none',
// //                                     padding: '0 16px',
// //                                     fontWeight: 800,
// //                                     fontSize: '0.8rem',
// //                                     cursor: 'pointer',
// //                                     display: 'flex',
// //                                     alignItems: 'center',
// //                                     gap: '6px'
// //                                 }}
// //                             >
// //                                 {isListening ? <MicOff size={16} /> : <Mic size={16} />}
// //                                 {isListening ? 'Stop Voice Input' : 'Start Voice Input'}
// //                             </button>

// //                             <input
// //                                 type="text"
// //                                 value={currentCandidateInput}
// //                                 onChange={e => setCurrentCandidateInput(e.target.value)}
// //                                 onKeyDown={e => e.key === 'Enter' && handleSendCandidateResponse()}
// //                                 placeholder={isListening ? "Listening... Speak into your mic..." : "Type your answer or click 'Start Voice Input'..."}
// //                                 style={{ flex: 1, padding: '10px', fontSize: '0.85rem', background: '#1e293b', border: `1px solid ${isListening ? '#38bdf8' : '#334155'}`, color: 'white', outline: 'none' }}
// //                             />

// //                             <button
// //                                 type="button"
// //                                 onClick={handleSendCandidateResponse}
// //                                 disabled={!currentCandidateInput.trim() || isAiLoading}
// //                                 className="mlab-btn mlab-btn--primary"
// //                                 style={{ padding: '0 18px', borderRadius: 0 }}
// //                             >
// //                                 <Send size={16} />
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };

// // // ════════════════════════════════════════════════════════════════════════════
// // // 2. SCORECARD REPORT VIEW COMPONENT
// // // ════════════════════════════════════════════════════════════════════════════
// // const InterviewScorecardView: React.FC<{ scorecard: any; isQualifying?: boolean; difficulty: DifficultyMode; onRestart: () => void }> = ({ scorecard, isQualifying, difficulty, onRestart }) => {
// //     if (!scorecard || scorecard.evaluationFailed) {
// //         return (
// //             <div className="aimi-card" style={{ borderTop: '4px solid #dc2626', textAlign: 'center' }}>
// //                 <div style={{ background: '#fef2f2', color: '#dc2626', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
// //                     <FileX size={32} />
// //                 </div>
// //                 <h2 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>
// //                     Assessment Not Finalised
// //                 </h2>
// //                 <p style={{ color: 'var(--mlab-grey)', fontSize: '0.9rem', maxWidth: '520px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
// //                     A valid interview evaluation could not be generated at this time because the assessment service was unreachable. No readiness score has been awarded for this attempt.
// //                 </p>
// //                 <button type="button" onClick={onRestart} className="mlab-btn mlab-btn--primary" style={{ padding: '10px 24px' }}>
// //                     <RotateCcw size={16} /> Practice Again
// //                 </button>
// //             </div>
// //         );
// //     }

// //     const overall = scorecard.overallScore;
// //     const tech = scorecard.technicalScore;
// //     const techKnowledge = scorecard.technicalKnowledgeScore ?? tech;
// //     const interviewReadiness = scorecard.interviewReadinessScore ?? overall;
// //     const behavioral = scorecard.behavioralScore;
// //     const comm = scorecard.communicationScore;
// //     const status = scorecard.readinessStatus || 'NOT_READY';

// //     const currentMode = DIFFICULTY_MODES.find(m => m.id === difficulty) || DIFFICULTY_MODES[0];
// //     const nextMode = DIFFICULTY_MODES.find(m => m.level === currentMode.level + 1);
// //     const hasPassedThreshold = overall >= 90 && status === 'READY' && isQualifying;

// //     const getStatusBadge = () => {
// //         switch (status) {
// //             case 'READY': return { text: 'INTERVIEW READY', bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
// //             case 'NEARLY_READY': return { text: 'NEARLY READY (MINOR GAPS)', bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' };
// //             case 'DEVELOPING': return { text: 'DEVELOPING (INCONSISTENT)', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
// //             default: return { text: 'NOT INTERVIEW READY', bg: '#fef2f2', color: '#991b1b', border: '#fecaca' };
// //         }
// //     };

// //     const statusBadge = getStatusBadge();

// //     const getEvidenceBadgeClass = (level: string) => {
// //         switch (level) {
// //             case 'INDEPENDENT': return 'aimi-evidence-badge--independent';
// //             case 'PROMPTED': return 'aimi-evidence-badge--prompted';
// //             case 'PARTIAL': return 'aimi-evidence-badge--partial';
// //             case 'INCORRECT': return 'aimi-evidence-badge--incorrect';
// //             default: return '';
// //         }
// //     };

// //     return (
// //         <div className="aimi-scorecard animate-fade-in">
// //             {isQualifying ? (
// //                 hasPassedThreshold ? (
// //                     <div className="aimi-scorecard__banner aimi-scorecard__banner--passed">
// //                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                             <div style={{ background: '#16a34a', color: 'white', padding: '10px', borderRadius: '50%' }}>
// //                                 <Trophy size={24} />
// //                             </div>
// //                             <div>
// //                                 <strong style={{ fontSize: '1rem', color: '#15803d', display: 'block', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                     🎉 Level Mastery Achieved! ({overall}%) — INTERVIEW READY
// //                                 </strong>
// //                                 <span style={{ fontSize: '0.85rem', color: '#166534' }}>
// //                                     {nextMode
// //                                         ? `Demonstrated required independent competency in ${currentMode.title}. Unlocked ${nextMode.title} Mode.`
// //                                         : `Mastery achieved across all difficulty tiers!`}
// //                                 </span>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 ) : (
// //                     <div className="aimi-scorecard__banner aimi-scorecard__banner--failed">
// //                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                             <div style={{ background: '#d97706', color: 'white', padding: '10px', borderRadius: '50%' }}>
// //                                 <RotateCcw size={24} />
// //                             </div>
// //                             <div>
// //                                 <strong style={{ fontSize: '1rem', color: '#b45309', display: 'block', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                     Target Not Met ({overall}%) — Practice Repeat Recommended
// //                                 </strong>
// //                                 <span style={{ fontSize: '0.85rem', color: '#92400e' }}>
// //                                     A score of <strong>90% or above and READY status</strong> is required to master this level and unlock higher tiers.
// //                                 </span>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 )
// //             ) : (
// //                 <div className="aimi-scorecard__banner" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569' }}>
// //                     <span>Practice Session Complete. To unlock the next tier, run a <strong>Holistic Interview with both CV & Skill Chips enabled</strong>.</span>
// //                 </div>
// //             )}

// //             {/* Header Report Card */}
// //             <div className="aimi-card" style={{ borderTop: `4px solid ${GREEN}` }}>
// //                 <div className="aimi-header-flex" style={{ flexWrap: 'wrap', gap: '1rem' }}>
// //                     <div>
// //                         <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: statusBadge.bg, color: statusBadge.color, border: `1px solid ${statusBadge.border}`, padding: '4px 10px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
// //                             <Award size={12} /> {statusBadge.text}
// //                         </div>
// //                         <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, fontSize: '1.6rem', textTransform: 'uppercase' }}>Employability Scorecard Report</h2>
// //                         <p style={{ margin: '6px 0 0 0', color: '#334155', fontSize: '0.88rem', lineHeight: 1.6 }}>
// //                             {scorecard.readinessSummary || "Evidence-based candidate competency evaluation."}
// //                         </p>
// //                     </div>
// //                     <button type="button" onClick={onRestart} className="mlab-btn mlab-btn--primary" style={{ padding: '10px 20px', borderRadius: 0 }}><RotateCcw size={16} /> Practice Again</button>
// //                 </div>
// //             </div>

// //             {/* Metric Cards Grid */}
// //             <div className="aimi-scorecard__metrics-grid">
// //                 <div className="aimi-metric-card">
// //                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Overall Readiness</span>
// //                     <div className="aimi-metric-value" style={{ color: MIDNIGHT }}>{overall}%</div>
// //                     <span style={{ fontSize: '0.75rem', color: statusBadge.color, fontWeight: 700, background: statusBadge.bg, padding: '2px 8px', border: `1px solid ${statusBadge.border}` }}>
// //                         {status}
// //                     </span>
// //                 </div>

// //                 <div className="aimi-metric-card">
// //                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Technical Score</span>
// //                     <div className="aimi-metric-value" style={{ color: '#0284c7' }}>{tech}%</div>
// //                     <span style={{ fontSize: '0.75rem', color: '#0369a1' }}>Core Technical Depth</span>
// //                 </div>

// //                 <div className="aimi-metric-card">
// //                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Raw Knowledge</span>
// //                     <div className="aimi-metric-value" style={{ color: '#0d9488' }}>{techKnowledge}%</div>
// //                     <span style={{ fontSize: '0.75rem', color: '#0f766e' }}>Accuracy & Concepts</span>
// //                 </div>

// //                 <div className="aimi-metric-card">
// //                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Interview Delivery</span>
// //                     <div className="aimi-metric-value" style={{ color: '#4f46e5' }}>{interviewReadiness}%</div>
// //                     <span style={{ fontSize: '0.75rem', color: '#4338ca' }}>Independent Execution</span>
// //                 </div>

// //                 <div className="aimi-metric-card">
// //                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>STAR Behavioral</span>
// //                     <div className="aimi-metric-value" style={{ color: '#d97706' }}>{behavioral}%</div>
// //                     <span style={{ fontSize: '0.75rem', color: '#b45309' }}>Structure & Ownership</span>
// //                 </div>

// //                 <div className="aimi-metric-card">
// //                     <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Communication</span>
// //                     <div className="aimi-metric-value" style={{ color: '#7c3aed' }}>{comm}%</div>
// //                     <span style={{ fontSize: '0.75rem', color: '#6d28d9' }}>Structure & Clarity</span>
// //                 </div>
// //             </div>

// //             {/* Strengths & Gaps Grid */}
// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
// //                 <div className="aimi-card">
// //                     <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: '#15803d', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={18} /> Demonstrated Strengths</h4>
// //                     <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
// //                         {(scorecard.strengths || []).map((s: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{s}</li>)}
// //                     </ul>
// //                 </div>

// //                 <div className="aimi-card">
// //                     <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={18} /> Priority Knowledge Gaps</h4>
// //                     <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
// //                         {(scorecard.priorityGaps || scorecard.areasForImprovement || []).map((gap: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{gap}</li>)}
// //                     </ul>
// //                 </div>
// //             </div>

// //             {/* Recommended Preparation */}
// //             {scorecard.recommendedPreparation && scorecard.recommendedPreparation.length > 0 && (
// //                 <div className="aimi-card">
// //                     <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                         <BookOpen size={18} color="#0284c7" /> Recommended Preparation Plan
// //                     </h4>
// //                     <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#334155', fontSize: '0.85rem', lineHeight: 1.6 }}>
// //                         {scorecard.recommendedPreparation.map((prep: string, idx: number) => <li key={idx} style={{ marginBottom: '6px' }}>{prep}</li>)}
// //                     </ul>
// //                 </div>
// //             )}

// //             {/* Question Breakdown */}
// //             {scorecard.questionBreakdown && scorecard.questionBreakdown.length > 0 && (
// //                 <div className="aimi-card">
// //                     <h4 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase' }}>Evidence-Based Question Breakdown</h4>
// //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                         {scorecard.questionBreakdown.map((q: any, idx: number) => {
// //                             const badgeClass = getEvidenceBadgeClass(q.evidenceLevel);

// //                             return (
// //                                 <div key={idx} className="aimi-evidence-card">
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
// //                                         <strong style={{ fontSize: '0.85rem', color: MIDNIGHT }}>Q{idx + 1}: {q.question}</strong>
// //                                         <span className={`aimi-evidence-badge ${badgeClass}`}>
// //                                             {q.evidenceLevel || 'EVALUATED'} ({q.score}%)
// //                                         </span>
// //                                     </div>
// //                                     <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#475569', fontStyle: 'italic' }}>
// //                                         "{q.candidateAnswer}"
// //                                     </p>
// //                                     <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
// //                                         <strong>Feedback:</strong> {q.feedback}
// //                                     </p>
// //                                     {q.whatWasMissing && (
// //                                         <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#b45309', lineHeight: 1.5 }}>
// //                                             <strong>Missing Evidence:</strong> {q.whatWasMissing}
// //                                         </p>
// //                                     )}
// //                                     {q.idealAnswerSample && (
// //                                         <div style={{ marginTop: '8px', padding: '8px 12px', background: '#e0f2fe', borderLeft: '3px solid #0284c7', fontSize: '0.78rem', color: '#0369a1', lineHeight: 1.5 }}>
// //                                             <strong>Sample Target Response:</strong> {q.idealAnswerSample}
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             );
// //                         })}
// //                     </div>
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };

// // // ════════════════════════════════════════════════════════════════════════════
// // // 3. MAIN EXPORTED ORCHESTRATOR COMPONENT
// // // ════════════════════════════════════════════════════════════════════════════
// // export interface AiMockInterviewStudioProps {
// //     learnerName: string;
// //     learnerId: string;
// // }

// // export const AiMockInterviewStudio: React.FC<AiMockInterviewStudioProps> = ({ learnerName, learnerId }) => {
// //     const [interviewStep, setInterviewStep] = useState<'landing' | 'setup' | 'room' | 'scorecard'>('landing');
// //     const [currentSessionId, setCurrentSessionId] = useState<string>('');
// //     const [targetRole, setTargetRole] = useState('Software Developer');

// //     const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyMode>('simple');
// //     const [contextMode, setContextMode] = useState<ContextMode>('both');
// //     const [interviewScope, setInterviewScope] = useState<InterviewScope>('full');

// //     const [selectedChips, setSelectedChips] = useState<string[]>(['react', 'typescript', 'star_behavioral']);
// //     const [customSkillInput, setCustomSkillInput] = useState('');
// //     const [learnerCvSummary, setLearnerCvSummary] = useState<string>('Candidate has a software development background in web applications.');
// //     const [latestScorecard, setLatestScorecard] = useState<any>(null);
// //     const [latestIsQualifying, setLatestIsQualifying] = useState<boolean>(false);
// //     const [isLaunching, setIsLaunching] = useState(false);
// //     const [isBraveBrowser, setIsBraveBrowser] = useState(false);

// //     const [pastSessions, setPastSessions] = useState<any[]>([]);
// //     const [selectedAuditSession, setSelectedAuditSession] = useState<any | null>(null);
// //     const [modeHighScores, setModeHighScores] = useState<Record<DifficultyMode, number>>({
// //         simple: 0,
// //         mid: 0,
// //         hard: 0
// //     });

// //     useEffect(() => {
// //         if ((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') {
// //             (navigator as any).brave.isBrave().then((isBrave: boolean) => {
// //                 if (isBrave) setIsBraveBrowser(true);
// //             });
// //         }
// //     }, []);

// //     useEffect(() => {
// //         if (!learnerId) return;

// //         const fetchHistoryAndScores = async () => {
// //             try {
// //                 const learnerDoc = await getDoc(doc(db, 'learners', learnerId));
// //                 if (learnerDoc.exists()) {
// //                     const data = learnerDoc.data();
// //                     if (data.cvSummary || data.cvText) {
// //                         setLearnerCvSummary(data.cvSummary || data.cvText);
// //                     }
// //                 }

// //                 const qDocs = query(
// //                     collection(db, 'ai_interviews'),
// //                     where('learnerId', '==', learnerId),
// //                     where('status', '==', 'completed')
// //                 );
// //                 const snap = await getDocs(qDocs);

// //                 const list: any[] = [];
// //                 const scores: Record<DifficultyMode, number> = { simple: 0, mid: 0, hard: 0 };

// //                 snap.docs.forEach(docSnap => {
// //                     const data = docSnap.data();
// //                     list.push({ id: docSnap.id, ...data });

// //                     const mode = (data.difficulty || 'simple') as DifficultyMode;
// //                     const score = Number(data.scorecard?.overallScore) || 0;
// //                     if (data.isQualifyingRun && data.scorecard?.readinessStatus === 'READY' && score > (scores[mode] || 0)) {
// //                         scores[mode] = score;
// //                     }
// //                 });

// //                 list.sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime());

// //                 setPastSessions(list);
// //                 setModeHighScores(scores);
// //             } catch (err: any) {
// //                 console.warn("Past high scores query skipped:", err?.message || err);
// //             }
// //         };

// //         fetchHistoryAndScores();
// //     }, [learnerId, interviewStep]);

// //     const isMidUnlocked = modeHighScores.simple >= 90;
// //     const isHardUnlocked = isMidUnlocked && modeHighScores.mid >= 90;
// //     const isQualifyingSelection = contextMode === 'both' && interviewScope === 'full';

// //     const toggleChip = (chipId: string) => {
// //         setSelectedChips(prev => prev.includes(chipId) ? prev.filter(c => c !== chipId) : [...prev, chipId]);
// //     };

// //     const handleAddCustomSkill = (e?: React.KeyboardEvent | React.MouseEvent) => {
// //         if (e && 'key' in e && e.key !== 'Enter') return;
// //         if (e) e.preventDefault();

// //         const trimmed = customSkillInput.trim();
// //         if (!trimmed) return;

// //         const existsInDefaults = AVAILABLE_SKILL_CHIPS.find(c => c.label.toLowerCase() === trimmed.toLowerCase() || c.id.toLowerCase() === trimmed.toLowerCase());
// //         const chipId = existsInDefaults ? existsInDefaults.id : trimmed;

// //         if (!selectedChips.includes(chipId)) setSelectedChips(prev => [...prev, chipId]);
// //         setCustomSkillInput('');
// //     };

// //     const handleLaunchRoom = async () => {
// //         if (selectedChips.length === 0 && contextMode !== 'cv_only' && contextMode !== 'none') return;
// //         setIsLaunching(true);

// //         try {
// //             const sessionRef = doc(collection(db, 'ai_interviews'));
// //             const newSessionId = sessionRef.id;
// //             setCurrentSessionId(newSessionId);

// //             await setDoc(sessionRef, {
// //                 id: newSessionId,
// //                 learnerId: learnerId || 'unknown_learner',
// //                 learnerName: learnerName || 'Candidate',
// //                 targetRole,
// //                 difficulty: selectedDifficulty,
// //                 contextMode,
// //                 interviewScope,
// //                 isQualifyingRun: isQualifyingSelection,
// //                 selectedSkillChips: selectedChips,
// //                 transcript: [],
// //                 status: 'in_progress',
// //                 startedAt: new Date().toISOString()
// //             });

// //             setInterviewStep('room');
// //         } catch (err: any) {
// //             console.warn("Firestore session initialization bypassed:", err?.message || err);
// //             setCurrentSessionId(`local_${Date.now()}`);
// //             setInterviewStep('room');
// //         } finally {
// //             setIsLaunching(false);
// //         }
// //     };

// //     return (
// //         <div className="aimi-studio ld-animate">
// //             {/* Audit Modal for Past Scorecard Inspection */}
// //             {selectedAuditSession && createPortal(
// //                 <div className="aimi-modal-overlay" onClick={() => setSelectedAuditSession(null)}>
// //                     <div className="aimi-modal-body" onClick={e => e.stopPropagation()}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem' }}>
// //                             <div>
// //                                 <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase' }}>
// //                                     Audit Inspection • {selectedAuditSession.targetRole}
// //                                 </h3>
// //                                 <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
// //                                     {moment(selectedAuditSession.completedAt || selectedAuditSession.startedAt).format('D MMMM YYYY, h:mm A')}
// //                                 </span>
// //                             </div>
// //                             <button type="button" onClick={() => setSelectedAuditSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
// //                         </div>
// //                         <InterviewScorecardView
// //                             scorecard={selectedAuditSession.scorecard}
// //                             isQualifying={selectedAuditSession.isQualifyingRun}
// //                             difficulty={selectedAuditSession.difficulty}
// //                             onRestart={() => setSelectedAuditSession(null)}
// //                         />
// //                     </div>
// //                 </div>, document.body
// //             )}

// //             {interviewStep === 'landing' && (
// //                 <>
// //                     <div className="aimi-card">
// //                         <div className="aimi-header-title">
// //                             <Video size={28} color="var(--mlab-blue)" />
// //                             <h2>AI Mock Interview Studio</h2>
// //                         </div>
// //                         <p className="aimi-description">
// //                             Practice technical, behavioral, or full holistic interviews. Achieve <strong>90%+ in a Qualifying Full Interview (Both CV & Skills Enabled)</strong> to unlock higher difficulty tiers.
// //                         </p>

// //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
// //                             <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                 <Sprout size={18} color="#16a34a" />
// //                                 <div>
// //                                     <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 1 • Simple</span>
// //                                     <strong style={{ fontSize: '0.85rem', color: MIDNIGHT }}>
// //                                         High: {modeHighScores.simple}% {modeHighScores.simple >= 90 ? '🏆 Mastered' : '(Req: 90%)'}
// //                                     </strong>
// //                                 </div>
// //                             </div>

// //                             <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                 {isMidUnlocked ? <Zap size={18} color="#0284c7" /> : <Lock size={18} color="#94a3b8" />}
// //                                 <div>
// //                                     <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 2 • Mid</span>
// //                                     <strong style={{ fontSize: '0.85rem', color: isMidUnlocked ? MIDNIGHT : '#94a3b8' }}>
// //                                         {isMidUnlocked ? `High: ${modeHighScores.mid}% ${modeHighScores.mid >= 90 ? '🏆 Mastered' : '(Req: 90%)'}` : 'Locked (Req: 90% in Simple)'}
// //                                     </strong>
// //                                 </div>
// //                             </div>

// //                             <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                 {isHardUnlocked ? <Flame size={18} color="#dc2626" /> : <Lock size={18} color="#94a3b8" />}
// //                                 <div>
// //                                     <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'block', fontWeight: 700 }}>Tier 3 • Hard</span>
// //                                     <strong style={{ fontSize: '0.85rem', color: isHardUnlocked ? MIDNIGHT : '#94a3b8' }}>
// //                                         {isHardUnlocked ? `High: ${modeHighScores.hard}% ${modeHighScores.hard >= 90 ? '🏆 Mastered' : '(Req: 90%)'}` : 'Locked (Req: 90% in Mid)'}
// //                                     </strong>
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         <button type="button" className="mlab-btn mlab-btn--primary" style={{ padding: '10px 20px', fontSize: '0.9rem', fontWeight: 700, borderRadius: 0, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); setInterviewStep('setup'); }}>
// //                             <Sparkles size={16} /> Start New Mock Interview
// //                         </button>
// //                     </div>

// //                     {/* PAST PRACTICE & AUDIT HISTORY LOG */}
// //                     <div className="aimi-card">
// //                         <h3 style={{ margin: '0 0 1rem 0', fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                             <History size={18} color="#0284c7" /> Past Practice & Audit History ({pastSessions.length})
// //                         </h3>

// //                         {pastSessions.length === 0 ? (
// //                             <div style={{ textAlign: 'center', padding: '2.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
// //                                 <FileText size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
// //                                 <strong style={{ display: 'block', color: MIDNIGHT, textTransform: 'uppercase', marginBottom: '4px' }}>No Practice History Recorded</strong>
// //                                 <p style={{ margin: 0, fontSize: '0.85rem' }}>Complete your first mock interview above to build an audited performance record.</p>
// //                             </div>
// //                         ) : (
// //                             <div className="aimi-history-table-wrap">
// //                                 <table className="aimi-history-table">
// //                                     <thead>
// //                                         <tr>
// //                                             <th>Date & Time</th>
// //                                             <th>Target Role</th>
// //                                             <th>Tier</th>
// //                                             <th>Format Scope</th>
// //                                             <th>Context</th>
// //                                             <th>Score & Readiness</th>
// //                                             <th style={{ textAlign: 'right' }}>Audit Inspection</th>
// //                                         </tr>
// //                                     </thead>
// //                                     <tbody>
// //                                         {pastSessions.map(session => {
// //                                             const sc = session.scorecard || {};
// //                                             const score = sc.overallScore ?? '—';
// //                                             const status = sc.readinessStatus || 'NOT_EVALUATED';

// //                                             return (
// //                                                 <tr key={session.id}>
// //                                                     <td>{moment(session.completedAt || session.startedAt).format('D MMM YYYY, HH:mm')}</td>
// //                                                     <td><strong>{session.targetRole}</strong></td>
// //                                                     <td><span className="aimi-tag aimi-tag--practice">{session.difficulty?.toUpperCase()}</span></td>
// //                                                     <td>
// //                                                         <span className={`aimi-tag ${session.interviewScope === 'full' ? 'aimi-tag--scope-full' : session.interviewScope === 'technical_only' ? 'aimi-tag--scope-tech' : 'aimi-tag--scope-behavioral'}`}>
// //                                                             {session.interviewScope === 'full' ? 'Full Holistic' : session.interviewScope === 'technical_only' ? 'Technical Only' : 'Behavioral Only'}
// //                                                         </span>
// //                                                     </td>
// //                                                     <td>
// //                                                         <span className={`aimi-tag ${session.isQualifyingRun ? 'aimi-tag--qualifying' : 'aimi-tag--practice'}`}>
// //                                                             {session.isQualifyingRun ? '🏆 Qualifying (CV+Chips)' : session.contextMode?.replace('_', ' ').toUpperCase()}
// //                                                         </span>
// //                                                     </td>
// //                                                     <td>
// //                                                         <strong>{score}%</strong> <span style={{ fontSize: '0.7rem', color: status === 'READY' ? '#166534' : '#b45309' }}>({status})</span>
// //                                                     </td>
// //                                                     <td style={{ textAlign: 'right' }}>
// //                                                         <button type="button" onClick={() => setSelectedAuditSession(session)} className="mlab-btn mlab-btn--ghost mlab-btn--sm" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>
// //                                                             <Eye size={14} /> Inspect
// //                                                         </button>
// //                                                     </td>
// //                                                 </tr>
// //                                             );
// //                                         })}
// //                                     </tbody>
// //                                 </table>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </>
// //             )}

// //             {interviewStep === 'setup' && (
// //                 <div className="animate-fade-in" style={{ maxWidth: '880px', margin: '0 auto', width: '100%' }}>
// //                     <div className="aimi-card aimi-card--setup-header">
// //                         <div className="aimi-header-flex">
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
// //                                 <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={24} /></div>
// //                                 <div>
// //                                     <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: MIDNIGHT, fontSize: '1.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Interview Studio Configuration</h2>
// //                                     <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Select target roles, unlocked difficulty mode, and skill focus areas.</p>
// //                                 </div>
// //                             </div>
// //                             <button type="button" onClick={() => setInterviewStep('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}><X size={20} /></button>
// //                         </div>
// //                     </div>

// //                     <div className="aimi-card aimi-card--setup-body">
// //                         <div>
// //                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>1. Target Career Role</label>
// //                             <div style={{ position: 'relative' }}>
// //                                 <input type="text" value={targetRole} onChange={e => setTargetRole(e.target.value)} placeholder="e.g. Full-Stack Developer, Frontend Engineer..." className="aimi-input-text" />
// //                                 <Tag size={18} className="aimi-input-icon" />
// //                             </div>
// //                         </div>

// //                         <div>
// //                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>2. Interview Scope / Format</label>
// //                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() => setInterviewScope('full')}
// //                                     className={`aimi-tier-card ${interviewScope === 'full' ? 'aimi-tier-card--selected-mid' : ''}`}
// //                                 >
// //                                     <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Full Holistic Interview</strong>
// //                                     <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Multi-part: Warmup, STAR, Technical, Scenario & Q&A. (Required for Progression)</span>
// //                                 </button>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() => setInterviewScope('technical_only')}
// //                                     className={`aimi-tier-card ${interviewScope === 'technical_only' ? 'aimi-tier-card--selected-mid' : ''}`}
// //                                 >
// //                                     <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Focused Technical Only</strong>
// //                                     <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Targeted technical grilling practice.</span>
// //                                 </button>
// //                                 <button
// //                                     type="button"
// //                                     onClick={() => setInterviewScope('behavioral_only')}
// //                                     className={`aimi-tier-card ${interviewScope === 'behavioral_only' ? 'aimi-tier-card--selected-mid' : ''}`}
// //                                 >
// //                                     <strong style={{ display: 'block', color: 'var(--mlab-blue)' }}>Focused Behavioral Only</strong>
// //                                     <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Soft skills, STAR stories & teamwork practice.</span>
// //                                 </button>
// //                             </div>
// //                         </div>

// //                         <div>
// //                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '8px' }}>3. Context Sources</label>
// //                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
// //                                 {[
// //                                     { id: 'both', label: 'Both CV & Skill Chips', desc: 'Required for Tier Progression' },
// //                                     { id: 'chips_only', label: 'Skill Chips Only', desc: 'Practice focus skills' },
// //                                     { id: 'cv_only', label: 'CV Background Only', desc: 'Practice resume defense' },
// //                                     { id: 'none', label: 'Generic Standard', desc: 'Unassisted general interview' }
// //                                 ].map(item => (
// //                                     <button
// //                                         key={item.id}
// //                                         type="button"
// //                                         onClick={() => setContextMode(item.id as ContextMode)}
// //                                         className={`aimi-tier-card ${contextMode === item.id ? 'aimi-tier-card--selected-simple' : ''}`}
// //                                     >
// //                                         <strong style={{ fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>{item.label}</strong>
// //                                         <span style={{ fontSize: '0.7rem', display: 'block', color: '#64748b' }}>{item.desc}</span>
// //                                     </button>
// //                                 ))}
// //                             </div>
// //                         </div>

// //                         <div>
// //                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT, marginBottom: '10px' }}>
// //                                 4. Select Difficulty Mode Tier (Mastery Target: 90%+)
// //                             </label>
// //                             <div className="aimi-tier-grid">
// //                                 {DIFFICULTY_MODES.map(mode => {
// //                                     const ModeIcon = mode.icon;
// //                                     const isSelected = selectedDifficulty === mode.id;

// //                                     let isUnlocked = true;
// //                                     if (mode.id === 'mid') isUnlocked = isMidUnlocked;
// //                                     if (mode.id === 'hard') isUnlocked = isHardUnlocked;

// //                                     const selectedClass = isSelected
// //                                         ? mode.id === 'simple' ? 'aimi-tier-card--selected-simple' : mode.id === 'mid' ? 'aimi-tier-card--selected-mid' : 'aimi-tier-card--selected-hard'
// //                                         : '';

// //                                     return (
// //                                         <button
// //                                             key={mode.id}
// //                                             type="button"
// //                                             disabled={!isUnlocked}
// //                                             onClick={() => setSelectedDifficulty(mode.id)}
// //                                             className={`aimi-tier-card ${selectedClass}`}
// //                                         >
// //                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
// //                                                 <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '3px', background: isUnlocked ? mode.color : '#94a3b8', color: 'white' }}>
// //                                                     {mode.badge}
// //                                                 </span>
// //                                                 {isUnlocked ? (
// //                                                     isSelected ? <CheckCircle2 size={18} color={mode.color} /> : <Unlock size={16} color="#94a3b8" />
// //                                                 ) : (
// //                                                     <Lock size={16} color="#94a3b8" />
// //                                                 )}
// //                                             </div>

// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
// //                                                 <ModeIcon size={18} color={isUnlocked ? mode.color : '#94a3b8'} />
// //                                                 <strong style={{ fontSize: '0.9rem', color: isUnlocked ? MIDNIGHT : '#64748b', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
// //                                                     {mode.title}
// //                                                 </strong>
// //                                             </div>

// //                                             <p style={{ margin: '4px 0 8px 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
// //                                                 {mode.description}
// //                                             </p>

// //                                             {!isUnlocked && (
// //                                                 <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1', fontSize: '0.7rem', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                     <Lock size={12} /> Score 90%+ in Tier {mode.level - 1} to unlock
// //                                                 </div>
// //                                             )}
// //                                         </button>
// //                                     );
// //                                 })}
// //                             </div>
// //                         </div>

// //                         {(contextMode === 'both' || contextMode === 'chips_only') && (
// //                             <div>
// //                                 <div className="aimi-header-flex" style={{ marginBottom: '10px' }}>
// //                                     <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: MIDNIGHT }}>5. Select Focus Skill Chips</label>
// //                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '12px' }}>{selectedChips.length} Skills Selected</span>
// //                                 </div>
// //                                 <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '6px', marginBottom: '1rem' }}>
// //                                     <div className="aimi-chip-group">
// //                                         {AVAILABLE_SKILL_CHIPS.map(chip => {
// //                                             const isSelected = selectedChips.includes(chip.id);
// //                                             return (
// //                                                 <button key={chip.id} type="button" onClick={() => toggleChip(chip.id)} className={`aimi-chip ${isSelected ? 'aimi-chip--active' : ''}`}>
// //                                                     {isSelected ? <Check size={13} color={GREEN} /> : <Plus size={13} />} {chip.label}
// //                                                 </button>
// //                                             );
// //                                         })}
// //                                         {selectedChips.filter(id => !AVAILABLE_SKILL_CHIPS.find(c => c.id === id)).map(customChip => (
// //                                             <button key={customChip} type="button" onClick={() => toggleChip(customChip)} className="aimi-chip aimi-chip--active">
// //                                                 <Check size={13} color={GREEN} /> {customChip} <X size={13} style={{ marginLeft: '4px', opacity: 0.8 }} />
// //                                             </button>
// //                                         ))}
// //                                     </div>
// //                                 </div>
// //                                 <div style={{ display: 'flex', gap: '8px' }}>
// //                                     <input type="text" placeholder="Type a custom skill (e.g., GraphQL, Tailwind, System Design) and press Enter..." value={customSkillInput} onChange={e => setCustomSkillInput(e.target.value)} onKeyDown={handleAddCustomSkill} style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' }} />
// //                                     <button type="button" onClick={handleAddCustomSkill} style={{ padding: '0 18px', background: 'white', border: `1px solid ${MIDNIGHT}`, color: MIDNIGHT, fontWeight: 700, fontSize: '0.8rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add Skill</button>
// //                                 </div>
// //                             </div>
// //                         )}

// //                         <div style={{ padding: '12px 16px', background: isQualifyingSelection ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isQualifyingSelection ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '4px', fontSize: '0.85rem' }}>
// //                             {isQualifyingSelection ? (
// //                                 <span style={{ color: '#166534', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <Trophy size={16} /> QUALIFYING RUN: Passing this session with 90%+ unlocks Tier Progression.
// //                                 </span>
// //                             ) : (
// //                                 <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <HelpCircle size={16} /> PRACTICE RUN ONLY: To qualify for Tier Progression, choose Full Scope & Both Context Sources.
// //                                 </span>
// //                             )}
// //                         </div>

// //                         <div className="aimi-header-flex" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginTop: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569' }}><Sparkles size={16} color={GREEN} /><span>Target: <strong>{targetRole || 'Software Developer'}</strong> ({selectedDifficulty.toUpperCase()} MODE)</span></div>
// //                             <div style={{ display: 'flex', gap: '12px' }}>
// //                                 <button type="button" onClick={() => setInterviewStep('landing')} className="mlab-btn mlab-btn--ghost" style={{ padding: '10px 20px' }}>Cancel</button>
// //                                 <button type="button" disabled={isLaunching} onClick={handleLaunchRoom} className="mlab-btn mlab-btn--primary" style={{ padding: '12px 24px', fontSize: '0.9rem', fontWeight: 700, background: GREEN, color: MIDNIGHT, border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                     {isLaunching ? <Loader2 size={18} className="lfm-spin" /> : <Video size={18} />} Launch Interview Room
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {interviewStep === 'room' && (
// //                 <AiInterviewRoom
// //                     sessionId={currentSessionId}
// //                     targetRole={targetRole}
// //                     difficulty={selectedDifficulty}
// //                     contextMode={contextMode}
// //                     interviewScope={interviewScope}
// //                     selectedChips={selectedChips}
// //                     cvSummary={learnerCvSummary}
// //                     learnerName={learnerName}
// //                     learnerId={learnerId}
// //                     isBraveBrowser={isBraveBrowser}
// //                     onCancel={() => setInterviewStep('landing')}
// //                     onEndSession={(sc, isQual) => { setLatestScorecard(sc); setLatestIsQualifying(Boolean(isQual)); setInterviewStep('scorecard'); }}
// //                 />
// //             )}

// //             {interviewStep === 'scorecard' && (
// //                 <InterviewScorecardView scorecard={latestScorecard} isQualifying={latestIsQualifying} difficulty={selectedDifficulty} onRestart={() => setInterviewStep('setup')} />
// //             )}
// //         </div>
// //     );
// // };

// // export default AiMockInterviewStudio;




// // // Also, i want the voice to sound more human and natural and not robotic. how can we do that. should we train it? and should sound like a South African. or the user can choose their prefered vpice. How can we achive this?

// // // how can we have a way to upload or use the alreadu uploaded user CV or ask them to update it and uplaod it on and then we can intervidw them based on their cv's and also the skills they selected during the chips selection. What do you think of this? we can use AI to ready through the contents of the cv to know what it contains. right?

// // // now, we need to have a multi part interviews in 1, the user can select whether they just want one technical interview or it should include everything at once, that means Workreadiness, softskills, general questions, then technical questions, closing questions and if they have answers for you and then conclude. depending on wat theu want but to move to the next level you need to have completed a wholistic inteview that includes everything but the others can act as to prepeare tou for the final one if you need to before moving to the next level. Can we do that?