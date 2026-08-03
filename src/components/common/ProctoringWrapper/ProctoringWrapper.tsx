import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Maximize, MonitorX, ShieldAlert, CheckCircle, Video, ScanFace, Loader2, AlertCircle, Monitor } from 'lucide-react';
import { createPortal } from 'react-dom';
import { doc, setDoc, updateDoc, collection, query, where, getDocs, getDoc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../Toast/Toast';
import * as faceapi from 'face-api.js';
import './ProctoringWrapper.css';
import { StatusModal, type StatusType } from '../StatusModal/StatusModal';

interface ProctoringWrapperProps {
    children: React.ReactNode;
    assessmentId: string;
    learnerId: string;
    isProctored: boolean;
}

interface ModalState {
    type: StatusType;
    title: string;
    message: string;
    confirmText?: string;
    onClose?: () => void;
    onCancel?: () => void;
}

export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
    const { user } = useStore();
    const toast = useToast();

    // Safe fallback IDs to guarantee valid Firestore document paths
    const activeAssessmentId = assessmentId || 'unassigned_assessment';
    const activeLearnerId = learnerId || user?.uid || 'unassigned_learner';

    const [isReady, setIsReady] = useState(!isProctored);
    const [hasCamera, setHasCamera] = useState(false);
    const [hasScreen, setHasScreen] = useState(false);
    const [screenError, setScreenError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [violationWarning, setViolationWarning] = useState<string | null>(null);
    const [violationCount, setViolationCount] = useState(0);

    // 🚀 STATE FOR RELOAD DETECTION
    const [hasResumedSession, setHasResumedSession] = useState(false);
    const [isSessionSynced, setIsSessionSynced] = useState(!isProctored);

    // 🚀 CENTRALIZED MODAL STATE TO PREVENT OVERLAPPING POPUPS
    const [modalState, setModalState] = useState<ModalState | null>(null);

    const violationWarningRef = useRef<string | null>(null);
    useEffect(() => {
        violationWarningRef.current = violationWarning;
    }, [violationWarning]);

    // AI STATE
    const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
    const [isAiActive, setIsAiActive] = useState(false);

    // DRAGGABLE PIP STATE
    const [pipPos, setPipPos] = useState(() => ({
        x: typeof window !== 'undefined' ? window.innerWidth - 240 : 0,
        y: typeof window !== 'undefined' ? window.innerHeight - 190 : 0
    }));
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

    const gateVideoRef = useRef<HTMLVideoElement | null>(null);
    const pipVideoRef = useRef<HTMLVideoElement | null>(null);
    const screenVideoRef = useRef<HTMLVideoElement | null>(null);

    const streamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);

    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 🚀 CATEGORY-BASED THROTTLING TIMERS
    const lastBrowserViolationTimeRef = useRef<number>(0);
    const lastAiViolationTimeRef = useRef<number>(0);
    const lastAudioViolationTimeRef = useRef<number>(0);

    const gazeAwayTimeRef = useRef<number>(0);
    const noFaceTimeRef = useRef<number>(0);

    // Callback refs for instant video stream binding upon React DOM mounting
    const setPipVideoRef = useCallback((node: HTMLVideoElement | null) => {
        pipVideoRef.current = node;
        if (node && streamRef.current) {
            node.srcObject = streamRef.current;
            node.play().catch(e => console.warn("PiP video play failed:", e));
        }
    }, []);

    const setScreenVideoRef = useCallback((node: HTMLVideoElement | null) => {
        screenVideoRef.current = node;
        if (node && screenStreamRef.current) {
            node.srcObject = screenStreamRef.current;
            node.play().catch(e => console.warn("Screen video play failed:", e));
        }
    }, []);

    // ─── 1. LOAD AI MODELS FROM CDN ──────────────────────────────────────────
    useEffect(() => {
        if (!isProctored) return;
        let isMounted = true;

        const loadModels = async () => {
            const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
            try {
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
                ]);
                if (isMounted) setAiModelsLoaded(true);
            } catch (err) {
                console.error("[PROCTOR] Failed to load AI models from CDN:", err);
                if (isMounted) {
                    toast.warning("AI face models failed to load. Standard video and screen monitoring remain active.");
                }
            }
        };
        loadModels();

        return () => { isMounted = false; };
    }, [isProctored]);

    // ─── 2. WEBCAM & MIC ACCESS ──────────────────────────────────────────────
    const requestWebcamAccess = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            if (gateVideoRef.current) {
                gateVideoRef.current.srcObject = stream;
                gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
            }
            if (pipVideoRef.current) {
                pipVideoRef.current.srcObject = stream;
                pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
            }
            setHasCamera(true);

            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            toast.success("Webcam and Microphone connected securely.");
        } catch (err: any) {
            console.error("[PROCTOR] Webcam access error:", err);
            toast.error("Permission Denied: You must allow Webcam and Microphone access.");
        }
    };

    // ─── 3. ENFORCE "ENTIRE SCREEN" SHARE & HANDLE NATIVE "STOP SHARING" ──────
    const requestScreenAccess = async () => {
        setScreenError(null);
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                // systemAudio: 'exclude'
            });

            const videoTrack = screenStream.getVideoTracks()[0];
            const settings = videoTrack.getSettings() as any;
            const displaySurface = settings.displaySurface;

            if (displaySurface && displaySurface !== 'monitor') {
                screenStream.getTracks().forEach(track => track.stop());
                const errMessage = "Selection Error: You selected a Tab or Window. You MUST select 'Entire Screen'.";
                setScreenError(errMessage);
                toast.error(errMessage);
                setHasScreen(false);
                return;
            }

            screenStreamRef.current = screenStream;
            if (screenVideoRef.current) {
                screenVideoRef.current.srcObject = screenStream;
                screenVideoRef.current.play().catch(e => console.warn("Screen video play failed:", e));
            }
            setHasScreen(true);
            setScreenError(null);

            videoTrack.onended = async () => {
                console.warn("[PROCTOR BREACH] Native 'Stop sharing' button clicked by learner.");
                
                // Log violation silently (without showing the violation UI modal immediately)
                await handleViolation("Screen Share Interrupted: Learner clicked 'Stop sharing'.", "browser", true);

                // Show clean StatusModal asking what to do
                setModalState({
                    type: 'warning',
                    title: 'Screen Sharing Stopped',
                    message: "You have stopped sharing your screen. Screen sharing is mandatory throughout the assessment. Was this a mistake?",
                    confirmText: 'Resume Sharing',
                    onClose: () => {
                        setModalState(null);
                        requestScreenAccess();
                    },
                    onCancel: () => {
                        setModalState(null);
                        handleCriticalTermination("CRITICAL SECURITY BREACH: Learner confirmed to stop screen sharing. The assessment has been terminated.");
                    }
                });
            };

            toast.success("Entire Screen shared successfully.");
        } catch (err: any) {
            console.error("[PROCTOR] Screen access error:", err);
            const errMsg = "Screen Share Cancelled: You must grant Entire Screen permission to proceed.";
            setScreenError(errMsg);
            toast.error(errMsg);
        }
    };

    // ─── 4. SYNC SESSION ON MOUNT & HANDLE RELOADS ───────────────────────────
    useEffect(() => {
        if (!isProctored) return;

        const syncSession = async () => {
            const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);
            try {
                const snap = await getDoc(sessionRef);
                if (snap.exists()) {
                    const data = snap.data();
                    
                    // If they were terminated previously, hard block them from starting again
                    if (data.status === 'terminated') {
                        setModalState({
                            type: 'error',
                            title: 'Assessment Locked',
                            message: 'This assessment was terminated by the invigilator. You cannot resume this attempt.',
                            confirmText: 'Return to Dashboard',
                            onClose: () => {
                                window.location.href = user?.role === 'learner' ? '/learner/dashboard' : '/';
                            }
                        });
                        return;
                    }

                    // Sync violation count so the UI matches the database
                    if (data.violationCount) {
                        setViolationCount(data.violationCount);
                    }

                    // If they were active or had a violation, they likely reloaded the page
                    if (data.status === 'active' || data.status === 'violation') {
                        setHasResumedSession(true);
                    }
                }
            } catch (err) {
                console.error("[PROCTOR] Failed to sync session:", err);
            } finally {
                setIsSessionSynced(true);
            }
        };

        syncSession();
    }, [isProctored, activeAssessmentId, activeLearnerId]);

    // ─── 5. NATIVE RELOAD/CLOSE PREVENTION ───────────────────────────────────
    useEffect(() => {
        if (!isReady) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Best-effort log to Firestore (may not always complete before browser cuts it off)
            handleViolation("Page Reload/Close Detected: You reloaded or closed the assessment tab.", "browser", true);

            // Trigger native browser warning prompt
            e.preventDefault();
            e.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isReady]);

    useEffect(() => {
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
            if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
            if (audioContextRef.current) audioContextRef.current.close();

            if (isProctored && activeAssessmentId && activeLearnerId) {
                setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
                    status: 'offline', lastHeartbeat: serverTimestamp()
                }, { merge: true }).catch(console.error);
            }
        };
    }, [isProctored, activeAssessmentId, activeLearnerId]);

    // ─── 6. FULLSCREEN MODE ──────────────────────────────────────────────────
    const enterFullscreen = async () => {
        if (!wrapperRef.current) return;
        try {
            if (wrapperRef.current.requestFullscreen) await wrapperRef.current.requestFullscreen();
            setIsFullscreen(true);
            setIsReady(true);
            startLightweightHeartbeat();
            startAiProctoring();
            startAudioMonitoring();

            // 🚀 IF WE DETECTED A RELOAD, LOG IT RELIABLY NOW THAT WE ARE ACTIVE
            if (hasResumedSession) {
                setTimeout(() => {
                    handleViolation("Assessment Reloaded: You refreshed the page during the assessment.", "browser");
                }, 1500);
                setHasResumedSession(false);
            }
        } catch (err) {
            toast.error("Failed to enter fullscreen mode.");
        }
    };

    // ─── 7. HEARTBEAT ────────────────────────────────────────────────────────
    const startLightweightHeartbeat = () => {
        const sendPing = () => {
            if (!activeAssessmentId || !activeLearnerId) return;
            setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
                assessmentId: activeAssessmentId,
                learnerId: activeLearnerId,
                learnerName: user?.fullName || 'Unknown Learner',
                status: 'active',
                lastHeartbeat: serverTimestamp()
            }, { merge: true }).catch(console.error);
        };
        sendPing();
        heartbeatIntervalRef.current = setInterval(sendPing, 30000);
    };

    // ─── 8. AI GAZE & FACE DETECTION LOOP ────────────────────────────────────
    const startAiProctoring = () => {
        if (!aiModelsLoaded) {
            setTimeout(() => { if (isReady && !aiModelsLoaded) startAiProctoring(); }, 3000);
            return;
        }
        setIsAiActive(true);

        aiIntervalRef.current = setInterval(async () => {
            const video = pipVideoRef.current;
            if (!video || video.readyState !== 4) return;

            try {
                const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

                if (detections.length === 0) {
                    noFaceTimeRef.current += 2;
                    if (noFaceTimeRef.current >= 6) {
                        handleViolation("Face Not Detected: You left the camera frame or covered your face.", "ai");
                        noFaceTimeRef.current = 0;
                    }
                    return;
                } else {
                    noFaceTimeRef.current = 0;
                }

                if (detections.length > 1) {
                    handleViolation("Multiple Faces Detected: Another person entered the camera frame.", "ai");
                    return;
                }

                const face = detections[0];
                const landmarks = face.landmarks;
                const leftEye = landmarks.getLeftEye();
                const rightEye = landmarks.getRightEye();
                const nose = landmarks.getNose();

                const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
                const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
                const eyeMidX = (leftEyeX + rightEyeX) / 2;

                const horizontalGazeDiff = Math.abs(nose[3].x - eyeMidX);
                const faceWidth = face.detection.box.width;

                if (horizontalGazeDiff > (faceWidth * 0.15)) {
                    gazeAwayTimeRef.current += 2;
                    if (gazeAwayTimeRef.current >= 8) {
                        handleViolation("Gaze Tracking Alert: You looked away from the screen for too long.", "ai");
                        gazeAwayTimeRef.current = 0;
                    }
                } else {
                    gazeAwayTimeRef.current = 0;
                }
            } catch (err) {
                console.error("[PROCTOR] AI Inference Error:", err);
            }
        }, 2000);
    };

    // ─── 9. AUDIO MONITORING LOOP ────────────────────────────────────────────
    const startAudioMonitoring = () => {
        if (!analyserRef.current) return;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        audioIntervalRef.current = setInterval(() => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
            const avgVolume = sum / bufferLength;

            if (avgVolume > 40) {
                handleViolation("Audio Alert: Loud talking or background noise detected.", "audio");
            }
        }, 1000);
    };

    // ─── 10. CRITICAL TERMINATION ──────────────────────────────────────────────
    const handleCriticalTermination = async (reason: string) => {
        console.warn("[PROCTOR TERMINATION]", reason);

        const timestampIso = new Date().toISOString();
        const timestampId = Date.now();

        const screenFrame = grabFrameFromVideo(screenVideoRef.current);
        const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());

        let screenUrl: string | null = null;
        let webcamUrl: string | null = null;
        try {
            const storage = getStorage();
            if (screenFrame) {
                const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_screen.jpg`);
                await uploadString(screenRef, screenFrame, 'data_url');
                screenUrl = await getDownloadURL(screenRef);
            }
            if (webcamFrame) {
                const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_webcam.jpg`);
                await uploadString(webcamRef, webcamFrame, 'data_url');
                webcamUrl = await getDownloadURL(webcamRef);
            }
        } catch (e) {
            console.error("[PROCTOR] Failed uploading termination frames:", e);
        }

        const violationEvent = {
            timestamp: timestampIso,
            reason: reason || "Critical Security Termination",
            imageUrl: webcamUrl || null,
            screenUrl: screenUrl || null
        };

        const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);
        await setDoc(sessionRef, {
            status: 'terminated',
            latestWarning: reason,
            violationCount: increment(1),
            violationHistory: arrayUnion(violationEvent),
            terminatedAt: serverTimestamp()
        }, { merge: true }).catch(console.error);

        try {
            const subQ = query(
                collection(db, 'learner_submissions'),
                where('assessmentId', '==', activeAssessmentId),
                where('authUid', '==', activeLearnerId)
            );
            const subSnap = await getDocs(subQ);
            if (!subSnap.empty) {
                const subDoc = subSnap.docs[0];
                await updateDoc(doc(db, 'learner_submissions', subDoc.id), {
                    status: 'violation', // 🚀 CHANGED FROM 'missed' TO 'violation'
                    systemNote: `Assessment terminated by security proctor: ${reason}`,
                    terminatedAt: timestampIso
                });
            }
        } catch (e) {
            console.error("[PROCTOR] Failed to update submission status on termination:", e);
        }

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }

        setViolationWarning(null); 
        setModalState({
            type: 'error',
            title: 'Assessment Terminated',
            message: `${reason}\n\nThis incident has been permanently recorded on the Invigilator Dashboard.`,
            confirmText: 'Return to Dashboard',
            onClose: () => {
                window.location.href = user?.role === 'learner' ? '/learner/dashboard' : '/';
            }
        });
    };

    // ─── 11. HANDLE VIOLATION & LOGGING ───────────────────────────────────────
    // Added 'silent' flag to prevent UI popup overlap for background logging
    const handleViolation = async (reason: string, category: 'browser' | 'ai' | 'audio' = 'browser', silent: boolean = false) => {
        const now = Date.now();

        // Category-specific throttling
        if (category === 'audio') {
            if (now - lastAudioViolationTimeRef.current < 25000) return;
            lastAudioViolationTimeRef.current = now;
        } else if (category === 'ai') {
            if (now - lastAiViolationTimeRef.current < 15000) return;
            lastAiViolationTimeRef.current = now;
        } else {
            if (now - lastBrowserViolationTimeRef.current < 5000) return;
            lastBrowserViolationTimeRef.current = now;
        }

        const timestampIso = new Date().toISOString();
        const timestampId = Date.now();
        const incidentId = `inc_${timestampId}_${Math.random().toString(36).substring(2, 7)}`;

        const screenFrame = grabFrameFromVideo(screenVideoRef.current);
        const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

        if (!silent) {
            setViolationWarning(reason);
            setViolationCount(prev => prev + 1);
        }

        const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);

        try {
            await setDoc(sessionRef, {
                assessmentId: activeAssessmentId,
                learnerId: activeLearnerId,
                learnerName: user?.fullName || 'Unknown Learner',
                status: 'violation',
                violationCount: increment(1),
                latestWarning: reason,
                lastHeartbeat: serverTimestamp()
            }, { merge: true });
        } catch (err) {
            console.error(`[PROCTOR ERROR] [${incidentId}] Session summary write failed:`, err);
        }

        (async () => {
            let screenUrl: string | null = null;
            let webcamUrl: string | null = null;

            try {
                const storage = getStorage();
                if (screenFrame) {
                    const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_screen.jpg`);
                    await uploadString(screenRef, screenFrame, 'data_url');
                    screenUrl = await getDownloadURL(screenRef);
                }
                if (webcamFrame) {
                    const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_webcam.jpg`);
                    await uploadString(webcamRef, webcamFrame, 'data_url');
                    webcamUrl = await getDownloadURL(webcamRef);
                }
            } catch (e) {
                console.error(`[PROCTOR ERROR] [${incidentId}] Snapshot upload failed:`, e);
            }

            const violationEvent = {
                id: incidentId,
                timestamp: timestampIso,
                reason: reason || "Unspecified Violation",
                imageUrl: webcamUrl || null,
                screenUrl: screenUrl || null
            };

            try {
                await setDoc(sessionRef, { violationHistory: arrayUnion(violationEvent) }, { merge: true });
            } catch (err) {
                console.error(`[PROCTOR ERROR] [${incidentId}] History arrayUnion write failed:`, err);
            }
        })();
    };

    const grabFrameFromVideo = (video: HTMLVideoElement | null): string | null => {
        if (!video) return null;
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;

        const canvas = canvasRef.current;
        if (!canvas) return null;
        const context = canvas.getContext('2d');
        if (!context) return null;

        canvas.width = Math.min(width, 1280);
        canvas.height = Math.min(height, 720);

        try {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.7);
        } catch (e) {
            console.error("[PROCTOR ERROR] Canvas drawImage failed:", e);
            return null;
        }
    };

    // ─── 12. EVENT LISTENERS ─────────────────────────────────────────────────
    useEffect(() => {
        if (!isProctored || !isReady) return;

        const handleVisibilityChange = () => {
            if (document.hidden && !violationWarningRef.current) {
                handleViolation("Tab Switching Detected: You navigated away from the assessment tab.", "browser");
            }
        };
        const handleBlur = () => {
            if (!violationWarningRef.current) {
                handleViolation("Window Focus Lost: You clicked outside the assessment window.", "browser");
            }
        };
        const handleFullscreenChange = () => {
            const docEl = document as any;
            const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement);
            if (!isCurrentlyFullscreen && !violationWarningRef.current) {
                setIsFullscreen(false);
                handleViolation("Fullscreen Exited: Assessments must be completed in locked fullscreen mode.", "browser");
            }
        };
        const handleCopyPaste = (e: ClipboardEvent) => {
            e.preventDefault();
            if (!violationWarningRef.current) {
                handleViolation(`${e.type.charAt(0).toUpperCase() + e.type.slice(1)} Attempt Detected: Clipboard actions are blocked.`, "browser");
            }
        };
        const handleCustomViolation = (e: any) => {
            if (!violationWarningRef.current) {
                handleViolation(e.detail || "Security violation detected.", "browser");
            }
        };
        const handleContextMenu = (e: Event) => e.preventDefault();
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key)) || e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                e.preventDefault();
                if (!violationWarningRef.current) {
                    handleViolation(`Forbidden keyboard shortcut detected: ${e.key}`, "browser");
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('proctorViolation', handleCustomViolation);
        document.addEventListener('copy', handleCopyPaste);
        document.addEventListener('cut', handleCopyPaste);
        document.addEventListener('paste', handleCopyPaste);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('proctorViolation', handleCustomViolation);
            document.removeEventListener('copy', handleCopyPaste);
            document.removeEventListener('cut', handleCopyPaste);
            document.removeEventListener('paste', handleCopyPaste);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isProctored, isReady]);

    // ─── 13. DRAGGABLE PIP LOGIC ─────────────────────────────────────────────
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragRef.current.isDragging) return;
            e.preventDefault();
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            let newX = dragRef.current.initialX + dx;
            let newY = dragRef.current.initialY + dy;
            newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
            setPipPos({ x: newX, y: newY });
        };
        const handleTouchMove = (e: TouchEvent) => {
            if (!dragRef.current.isDragging) return;
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - dragRef.current.startX;
            const dy = touch.clientY - dragRef.current.startY;
            let newX = dragRef.current.initialX + dx;
            let newY = dragRef.current.initialY + dy;
            newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
            setPipPos({ x: newX, y: newY });
        };
        const handleEndDrag = () => { dragRef.current.isDragging = false; };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleEndDrag);
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleEndDrag);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleEndDrag);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleEndDrag);
        };
    }, []);

    const initiateDrag = (clientX: number, clientY: number) => {
        dragRef.current.isDragging = true;
        dragRef.current.startX = clientX;
        dragRef.current.startY = clientY;
        dragRef.current.initialX = pipPos.x;
        dragRef.current.initialY = pipPos.y;
    };

    const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
    const handleTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        initiateDrag(touch.clientX, touch.clientY);
    };

    // ─── RENDER ──────────────────────────────────────────────────────────────
    if (!isProctored) return <>{children}</>;

    const portalTarget = typeof document !== 'undefined' ? (document.getElementById('proctor-portal-root') || document.body) : null;

    return (
        <div ref={wrapperRef} className="pw-container">
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            <video 
                ref={setScreenVideoRef} 
                autoPlay 
                muted 
                playsInline 
                style={{ position: 'absolute', width: '320px', height: '180px', left: '-9999px', opacity: 0, pointerEvents: 'none' }} 
            />

            {isReady && (
                <div className="pw-content">
                    {children}
                    <div className="pw-pip" style={{ left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }}>
                        <div className="pw-pip-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
                            <div className="pw-pip-title">
                                {isAiActive ? <ScanFace size={13} className="pw-pulse" /> : <Video size={13} className="pw-pulse" />}
                                <span>{isAiActive ? 'AI Tracking Active' : 'Live Recording'}</span>
                            </div>
                            <span className="pw-pip-drag-hint">(Drag)</span>
                        </div>
                        <video ref={setPipVideoRef} autoPlay muted playsInline className="pw-pip-video" />
                    </div>
                </div>
            )}

            {/* 🚀 DEDICATED FIXED FULLSCREEN PORTAL CONTAINER */}
            <div id="proctor-portal-root" style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'none' }} />

            {/* Setup Gate Overlay */}
            {!isReady && isSessionSynced && !modalState && (
                <div className="lfm-overlay pw-gate-overlay">
                    <div className="lfm-modal pw-gate-card">
                        <div className="lfm-header">
                            <h2 className="lfm-header__title" style={{ color: 'white' }}>
                                <ShieldAlert size={18} /> Secure AI Environment Setup
                            </h2>
                        </div>

                        <div className="lfm-body pw-gate-body">
                            <div className="pw-gate-intro">
                                <p>To begin, you must enable AI face tracking AND share your entire screen to prevent external window usage.</p>
                            </div>

                            <div className="lfm-section-hdr">
                                <ShieldAlert size={13} /> Invigilation Prerequisites
                            </div>

                            <div className="pw-steps">
                                {/* STEP 1: WEBCAM */}
                                <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
                                    <div className="pw-step-icon">
                                        {hasCamera ? <CheckCircle size={18} /> : <Camera size={18} />}
                                    </div>
                                    <div className="pw-step-text">
                                        <strong>Webcam & Microphone</strong>
                                        <span>{hasCamera ? 'Connected securely' : 'Required for AI face tracking'}</span>
                                    </div>
                                    {!hasCamera && (
                                        <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={requestWebcamAccess}>
                                            Allow Access
                                        </button>
                                    )}
                                </div>

                                {/* STEP 2: AI ENGINE LOADER */}
                                <div className={`pw-step ${aiModelsLoaded ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
                                    <div className="pw-step-icon">
                                        {aiModelsLoaded ? <CheckCircle size={18} /> : <Loader2 className="lfm-spin" size={18} />}
                                    </div>
                                    <div className="pw-step-text">
                                        <strong>AI Proctoring Engine</strong>
                                        <span>{aiModelsLoaded ? 'Models Loaded & Verified' : 'Downloading neural weights...'}</span>
                                    </div>
                                </div>

                                {/* STEP 3: SCREEN SHARE */}
                                <div className={`pw-step ${hasScreen ? 'pw-step--done' : screenError ? 'pw-step--error' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
                                    <div className="pw-step-icon">
                                        {hasScreen ? <CheckCircle size={18} /> : screenError ? <AlertCircle size={18} /> : <Monitor size={18} />}
                                    </div>
                                    <div className="pw-step-text" style={{ flex: 1 }}>
                                        <strong>Screen Share (Entire Screen Only)</strong>
                                        <span>{hasScreen ? 'Entire Screen Shared' : screenError ? screenError : 'Select "Entire Screen" in browser prompt'}</span>
                                    </div>
                                    {hasCamera && !hasScreen && (
                                        <button 
                                            className={`lfm-btn pw-btn-small ${screenError ? 'pw-btn-danger' : 'lfm-btn--primary'}`} 
                                            style={{ background: screenError ? 'var(--mlab-red)' : undefined }}
                                            onClick={requestScreenAccess}
                                        >
                                            {screenError ? 'Retry Screen Share' : 'Share Screen'}
                                        </button>
                                    )}
                                </div>

                                {/* STEP 4: FULLSCREEN MODE */}
                                <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera || !hasScreen || !aiModelsLoaded ? 'pw-step--disabled' : ''}`}>
                                    <div className="pw-step-icon">
                                        {isFullscreen ? <CheckCircle size={18} /> : <Maximize size={18} />}
                                    </div>
                                    <div className="pw-step-text">
                                        <strong>Fullscreen Mode</strong>
                                        <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
                                    </div>
                                    {hasCamera && hasScreen && aiModelsLoaded && !isFullscreen && (
                                        <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={enterFullscreen}>
                                            Enter Fullscreen
                                        </button>
                                    )}
                                </div>
                            </div>

                            <video ref={gateVideoRef} autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Standard Violation Overlay */}
            {violationWarning && !modalState && portalTarget && createPortal(
                <div className="lfm-overlay pw-violation-overlay" style={{ pointerEvents: 'auto' }}>
                    <div className="lfm-modal pw-violation-card">
                        <div className="lfm-header pw-violation-header">
                            <h2 className="lfm-header__title">
                                <MonitorX size={18} /> Security Violation Detected
                            </h2>
                        </div>
                        <div className="lfm-body pw-violation-body">
                            <div className="lfm-error-banner">
                                <AlertCircle size={18} />
                                <span>{violationWarning}</span>
                            </div>

                            <div className="pw-violation-stats">
                                <span>Total Violations Logged: <strong>{violationCount}</strong></span>
                            </div>

                            <p className="pw-violation-sub">
                                A screenshot of your entire screen and webcam has been captured and sent to the invigilator dashboard.
                            </p>

                            <button
                                className="lfm-btn pw-btn-danger"
                                onClick={() => {
                                    setViolationWarning(null);
                                    setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), { status: 'active', latestWarning: null }, { merge: true });
                                    if (!document.fullscreenElement) enterFullscreen();
                                }}
                            >
                                I Understand, Return to Assessment
                            </button>
                        </div>
                    </div>
                </div>,
                portalTarget
            )}

            {/* REUSABLE STATUS MODAL FOR TERMINATIONS, RELOADS & SCREEN SHARE INTERRUPTIONS */}
            {modalState && portalTarget && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto' }}>
                    <StatusModal
                        type={modalState.type}
                        title={modalState.title}
                        message={modalState.message}
                        confirmText={modalState.confirmText}
                        onClose={modalState.onClose || (() => setModalState(null))}
                        onCancel={modalState.onCancel}
                    />
                </div>,
                portalTarget
            )}
        </div>
    );
};


// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import { Camera, Maximize, MonitorX, ShieldAlert, CheckCircle, Video, ScanFace, Loader2, AlertCircle, Monitor } from 'lucide-react';
// import { createPortal } from 'react-dom';
// import { doc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
// import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import { useToast } from '../Toast/Toast';
// import * as faceapi from 'face-api.js';
// import './ProctoringWrapper.css';
// import { StatusModal, type StatusType } from '../StatusModal/StatusModal';

// interface ProctoringWrapperProps {
//     children: React.ReactNode;
//     assessmentId: string;
//     learnerId: string;
//     isProctored: boolean;
// }

// interface ModalState {
//     type: StatusType;
//     title: string;
//     message: string;
//     confirmText?: string;
//     onClose?: () => void;
//     onCancel?: () => void;
// }

// export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
//     const { user } = useStore();
//     const toast = useToast();

//     // Safe fallback IDs to guarantee valid Firestore document paths
//     const activeAssessmentId = assessmentId || 'unassigned_assessment';
//     const activeLearnerId = learnerId || user?.uid || 'unassigned_learner';

//     const [isReady, setIsReady] = useState(!isProctored);
//     const [hasCamera, setHasCamera] = useState(false);
//     const [hasScreen, setHasScreen] = useState(false);
//     const [screenError, setScreenError] = useState<string | null>(null);
//     const [isFullscreen, setIsFullscreen] = useState(false);
//     const [violationWarning, setViolationWarning] = useState<string | null>(null);
//     const [violationCount, setViolationCount] = useState(0);

//     // 🚀 CENTRALIZED MODAL STATE TO PREVENT OVERLAPPING POPUPS
//     const [modalState, setModalState] = useState<ModalState | null>(null);

//     const violationWarningRef = useRef<string | null>(null);
//     useEffect(() => {
//         violationWarningRef.current = violationWarning;
//     }, [violationWarning]);

//     // AI STATE
//     const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
//     const [isAiActive, setIsAiActive] = useState(false);

//     // DRAGGABLE PIP STATE
//     const [pipPos, setPipPos] = useState(() => ({
//         x: typeof window !== 'undefined' ? window.innerWidth - 240 : 0,
//         y: typeof window !== 'undefined' ? window.innerHeight - 190 : 0
//     }));
//     const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

//     const gateVideoRef = useRef<HTMLVideoElement | null>(null);
//     const pipVideoRef = useRef<HTMLVideoElement | null>(null);
//     const screenVideoRef = useRef<HTMLVideoElement | null>(null);

//     const streamRef = useRef<MediaStream | null>(null);
//     const screenStreamRef = useRef<MediaStream | null>(null);

//     const audioContextRef = useRef<AudioContext | null>(null);
//     const analyserRef = useRef<AnalyserNode | null>(null);

//     const wrapperRef = useRef<HTMLDivElement>(null);
//     const canvasRef = useRef<HTMLCanvasElement>(null);
//     const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
//     const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
//     const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

//     // 🚀 CATEGORY-BASED THROTTLING TIMERS
//     const lastBrowserViolationTimeRef = useRef<number>(0);
//     const lastAiViolationTimeRef = useRef<number>(0);
//     const lastAudioViolationTimeRef = useRef<number>(0);

//     const gazeAwayTimeRef = useRef<number>(0);
//     const noFaceTimeRef = useRef<number>(0);

//     // Callback refs for instant video stream binding upon React DOM mounting
//     const setPipVideoRef = useCallback((node: HTMLVideoElement | null) => {
//         pipVideoRef.current = node;
//         if (node && streamRef.current) {
//             node.srcObject = streamRef.current;
//             node.play().catch(e => console.warn("PiP video play failed:", e));
//         }
//     }, []);

//     const setScreenVideoRef = useCallback((node: HTMLVideoElement | null) => {
//         screenVideoRef.current = node;
//         if (node && screenStreamRef.current) {
//             node.srcObject = screenStreamRef.current;
//             node.play().catch(e => console.warn("Screen video play failed:", e));
//         }
//     }, []);

//     // ─── 1. LOAD AI MODELS FROM CDN ──────────────────────────────────────────
//     useEffect(() => {
//         if (!isProctored) return;
//         let isMounted = true;

//         const loadModels = async () => {
//             const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
//             try {
//                 await Promise.all([
//                     faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
//                     faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
//                 ]);
//                 if (isMounted) setAiModelsLoaded(true);
//             } catch (err) {
//                 console.error("[PROCTOR] Failed to load AI models from CDN:", err);
//                 if (isMounted) {
//                     toast.warning("AI face models failed to load. Standard video and screen monitoring remain active.");
//                 }
//             }
//         };
//         loadModels();

//         return () => { isMounted = false; };
//     }, [isProctored]);

//     // ─── 2. WEBCAM & MIC ACCESS ──────────────────────────────────────────────
//     const requestWebcamAccess = async () => {
//         try {
//             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//             streamRef.current = stream;
//             if (gateVideoRef.current) {
//                 gateVideoRef.current.srcObject = stream;
//                 gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
//             }
//             if (pipVideoRef.current) {
//                 pipVideoRef.current.srcObject = stream;
//                 pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
//             }
//             setHasCamera(true);

//             const audioContext = new AudioContext();
//             const source = audioContext.createMediaStreamSource(stream);
//             const analyser = audioContext.createAnalyser();
//             analyser.fftSize = 256;
//             source.connect(analyser);
//             audioContextRef.current = audioContext;
//             analyserRef.current = analyser;

//             toast.success("Webcam and Microphone connected securely.");
//         } catch (err: any) {
//             console.error("[PROCTOR] Webcam access error:", err);
//             toast.error("Permission Denied: You must allow Webcam and Microphone access.");
//         }
//     };

//     // ─── 3. ENFORCE "ENTIRE SCREEN" SHARE & HANDLE NATIVE "STOP SHARING" ──────
//     const requestScreenAccess = async () => {
//         setScreenError(null);
//         try {
//             const screenStream = await navigator.mediaDevices.getDisplayMedia({
//                 video: true,
//                 // systemAudio: 'exclude'
//             });

//             const videoTrack = screenStream.getVideoTracks()[0];
//             const settings = videoTrack.getSettings() as any;
//             const displaySurface = settings.displaySurface;

//             if (displaySurface && displaySurface !== 'monitor') {
//                 screenStream.getTracks().forEach(track => track.stop());
//                 const errMessage = "Selection Error: You selected a Tab or Window. You MUST select 'Entire Screen'.";
//                 setScreenError(errMessage);
//                 toast.error(errMessage);
//                 setHasScreen(false);
//                 return;
//             }

//             screenStreamRef.current = screenStream;
//             if (screenVideoRef.current) {
//                 screenVideoRef.current.srcObject = screenStream;
//                 screenVideoRef.current.play().catch(e => console.warn("Screen video play failed:", e));
//             }
//             setHasScreen(true);
//             setScreenError(null);

//             // 🚀 SMOOTH UX: ASK IF STOPPING WAS A MISTAKE BEFORE TERMINATING
//             videoTrack.onended = async () => {
//                 console.warn("[PROCTOR BREACH] Native 'Stop sharing' button clicked by learner.");
                
//                 // Log violation silently (without showing the violation UI modal immediately)
//                 await handleViolation("Screen Share Interrupted: Learner clicked 'Stop sharing'.", "browser", true);

//                 // Show clean StatusModal asking what to do
//                 setModalState({
//                     type: 'warning',
//                     title: 'Screen Sharing Stopped',
//                     message: "You have stopped sharing your screen. Screen sharing is mandatory throughout the assessment. Was this a mistake?",
//                     confirmText: 'Resume Sharing',
//                     onClose: () => {
//                         setModalState(null);
//                         requestScreenAccess(); // Re-prompt for screen share
//                     },
//                     onCancel: () => {
//                         setModalState(null);
//                         handleCriticalTermination("CRITICAL SECURITY BREACH: Learner confirmed to stop screen sharing. The assessment has been terminated.");
//                     }
//                 });
//             };

//             toast.success("Entire Screen shared successfully.");
//         } catch (err: any) {
//             console.error("[PROCTOR] Screen access error:", err);
//             const errMsg = "Screen Share Cancelled: You must grant Entire Screen permission to proceed.";
//             setScreenError(errMsg);
//             toast.error(errMsg);
//         }
//     };

//     useEffect(() => {
//         return () => {
//             if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
//             if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
//             if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
//             if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
//             if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
//             if (audioContextRef.current) audioContextRef.current.close();

//             if (isProctored && activeAssessmentId && activeLearnerId) {
//                 setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
//                     status: 'offline', lastHeartbeat: serverTimestamp()
//                 }, { merge: true }).catch(console.error);
//             }
//         };
//     }, [isProctored, activeAssessmentId, activeLearnerId]);

//     // ─── 4. FULLSCREEN MODE ──────────────────────────────────────────────────
//     const enterFullscreen = async () => {
//         if (!wrapperRef.current) return;
//         try {
//             if (wrapperRef.current.requestFullscreen) await wrapperRef.current.requestFullscreen();
//             setIsFullscreen(true);
//             setIsReady(true);
//             startLightweightHeartbeat();
//             startAiProctoring();
//             startAudioMonitoring();
//         } catch (err) {
//             toast.error("Failed to enter fullscreen mode.");
//         }
//     };

//     // ─── 5. HEARTBEAT ────────────────────────────────────────────────────────
//     const startLightweightHeartbeat = () => {
//         const sendPing = () => {
//             if (!activeAssessmentId || !activeLearnerId) return;
//             setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
//                 assessmentId: activeAssessmentId,
//                 learnerId: activeLearnerId,
//                 learnerName: user?.fullName || 'Unknown Learner',
//                 status: 'active',
//                 lastHeartbeat: serverTimestamp()
//             }, { merge: true }).catch(console.error);
//         };
//         sendPing();
//         heartbeatIntervalRef.current = setInterval(sendPing, 30000);
//     };

//     // ─── 6. AI GAZE & FACE DETECTION LOOP ────────────────────────────────────
//     const startAiProctoring = () => {
//         if (!aiModelsLoaded) {
//             setTimeout(() => { if (isReady && !aiModelsLoaded) startAiProctoring(); }, 3000);
//             return;
//         }
//         setIsAiActive(true);

//         aiIntervalRef.current = setInterval(async () => {
//             const video = pipVideoRef.current;
//             if (!video || video.readyState !== 4) return;

//             try {
//                 const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

//                 if (detections.length === 0) {
//                     noFaceTimeRef.current += 2;
//                     if (noFaceTimeRef.current >= 6) {
//                         handleViolation("Face Not Detected: You left the camera frame or covered your face.", "ai");
//                         noFaceTimeRef.current = 0;
//                     }
//                     return;
//                 } else {
//                     noFaceTimeRef.current = 0;
//                 }

//                 if (detections.length > 1) {
//                     handleViolation("Multiple Faces Detected: Another person entered the camera frame.", "ai");
//                     return;
//                 }

//                 const face = detections[0];
//                 const landmarks = face.landmarks;
//                 const leftEye = landmarks.getLeftEye();
//                 const rightEye = landmarks.getRightEye();
//                 const nose = landmarks.getNose();

//                 const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
//                 const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
//                 const eyeMidX = (leftEyeX + rightEyeX) / 2;

//                 const horizontalGazeDiff = Math.abs(nose[3].x - eyeMidX);
//                 const faceWidth = face.detection.box.width;

//                 if (horizontalGazeDiff > (faceWidth * 0.15)) {
//                     gazeAwayTimeRef.current += 2;
//                     if (gazeAwayTimeRef.current >= 8) {
//                         handleViolation("Gaze Tracking Alert: You looked away from the screen for too long.", "ai");
//                         gazeAwayTimeRef.current = 0;
//                     }
//                 } else {
//                     gazeAwayTimeRef.current = 0;
//                 }
//             } catch (err) {
//                 console.error("[PROCTOR] AI Inference Error:", err);
//             }
//         }, 2000);
//     };

//     // ─── 7. AUDIO MONITORING LOOP ────────────────────────────────────────────
//     const startAudioMonitoring = () => {
//         if (!analyserRef.current) return;
//         const bufferLength = analyserRef.current.frequencyBinCount;
//         const dataArray = new Uint8Array(bufferLength);

//         audioIntervalRef.current = setInterval(() => {
//             if (!analyserRef.current) return;
//             analyserRef.current.getByteFrequencyData(dataArray);

//             let sum = 0;
//             for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
//             const avgVolume = sum / bufferLength;

//             if (avgVolume > 40) {
//                 handleViolation("Audio Alert: Loud talking or background noise detected.", "audio");
//             }
//         }, 1000);
//     };

//     // ─── 8. CRITICAL TERMINATION ──────────────────────────────────────────────
//     const handleCriticalTermination = async (reason: string) => {
//         console.warn("[PROCTOR TERMINATION]", reason);

//         const timestampIso = new Date().toISOString();
//         const timestampId = Date.now();

//         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
//         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

//         if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
//         if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());

//         let screenUrl: string | null = null;
//         let webcamUrl: string | null = null;
//         try {
//             const storage = getStorage();
//             if (screenFrame) {
//                 const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_screen.jpg`);
//                 await uploadString(screenRef, screenFrame, 'data_url');
//                 screenUrl = await getDownloadURL(screenRef);
//             }
//             if (webcamFrame) {
//                 const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_webcam.jpg`);
//                 await uploadString(webcamRef, webcamFrame, 'data_url');
//                 webcamUrl = await getDownloadURL(webcamRef);
//             }
//         } catch (e) {
//             console.error("[PROCTOR] Failed uploading termination frames:", e);
//         }

//         const violationEvent = {
//             timestamp: timestampIso,
//             reason: reason || "Critical Security Termination",
//             imageUrl: webcamUrl || null,
//             screenUrl: screenUrl || null
//         };

//         const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);
//         await setDoc(sessionRef, {
//             status: 'terminated',
//             latestWarning: reason,
//             violationCount: increment(1),
//             violationHistory: arrayUnion(violationEvent),
//             terminatedAt: serverTimestamp()
//         }, { merge: true }).catch(console.error);

//         try {
//             const subQ = query(
//                 collection(db, 'learner_submissions'),
//                 where('assessmentId', '==', activeAssessmentId),
//                 where('authUid', '==', activeLearnerId)
//             );
//             const subSnap = await getDocs(subQ);
//             if (!subSnap.empty) {
//                 const subDoc = subSnap.docs[0];
//                 await updateDoc(doc(db, 'learner_submissions', subDoc.id), {
//                     status: 'missed',
//                     systemNote: `Assessment terminated by security proctor: ${reason}`,
//                     terminatedAt: timestampIso
//                 });
//             }
//         } catch (e) {
//             console.error("[PROCTOR] Failed to update submission status on termination:", e);
//         }

//         if (document.fullscreenElement) {
//             document.exitFullscreen().catch(() => {});
//         }

//         // 🚀 REPLACED ALERT WITH REUSABLE STATUS MODAL
//         setViolationWarning(null); // Clear any existing violation popups
//         setModalState({
//             type: 'error',
//             title: 'Assessment Terminated',
//             message: `${reason}\n\nThis incident has been permanently recorded on the Invigilator Dashboard.`,
//             confirmText: 'Return to Dashboard',
//             onClose: () => {
//                 window.location.href = user?.role === 'learner' ? '/learner/dashboard' : '/';
//             }
//         });
//     };

//     // ─── 9. HANDLE VIOLATION & LOGGING ───────────────────────────────────────
//     // Added 'silent' flag to prevent UI popup overlap for background logging
//     const handleViolation = async (reason: string, category: 'browser' | 'ai' | 'audio' = 'browser', silent: boolean = false) => {
//         const now = Date.now();

//         // Category-specific throttling
//         if (category === 'audio') {
//             if (now - lastAudioViolationTimeRef.current < 25000) return;
//             lastAudioViolationTimeRef.current = now;
//         } else if (category === 'ai') {
//             if (now - lastAiViolationTimeRef.current < 15000) return;
//             lastAiViolationTimeRef.current = now;
//         } else {
//             if (now - lastBrowserViolationTimeRef.current < 5000) return;
//             lastBrowserViolationTimeRef.current = now;
//         }

//         const timestampIso = new Date().toISOString();
//         const timestampId = Date.now();
//         const incidentId = `inc_${timestampId}_${Math.random().toString(36).substring(2, 7)}`;

//         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
//         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

//         if (!silent) {
//             setViolationWarning(reason);
//             setViolationCount(prev => prev + 1);
//         }

//         const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);

//         try {
//             await setDoc(sessionRef, {
//                 assessmentId: activeAssessmentId,
//                 learnerId: activeLearnerId,
//                 learnerName: user?.fullName || 'Unknown Learner',
//                 status: 'violation',
//                 violationCount: increment(1),
//                 latestWarning: reason,
//                 lastHeartbeat: serverTimestamp()
//             }, { merge: true });
//         } catch (err) {
//             console.error(`[PROCTOR ERROR] [${incidentId}] Session summary write failed:`, err);
//         }

//         (async () => {
//             let screenUrl: string | null = null;
//             let webcamUrl: string | null = null;

//             try {
//                 const storage = getStorage();
//                 if (screenFrame) {
//                     const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_screen.jpg`);
//                     await uploadString(screenRef, screenFrame, 'data_url');
//                     screenUrl = await getDownloadURL(screenRef);
//                 }
//                 if (webcamFrame) {
//                     const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_webcam.jpg`);
//                     await uploadString(webcamRef, webcamFrame, 'data_url');
//                     webcamUrl = await getDownloadURL(webcamRef);
//                 }
//             } catch (e) {
//                 console.error(`[PROCTOR ERROR] [${incidentId}] Snapshot upload failed:`, e);
//             }

//             const violationEvent = {
//                 id: incidentId,
//                 timestamp: timestampIso,
//                 reason: reason || "Unspecified Violation",
//                 imageUrl: webcamUrl || null,
//                 screenUrl: screenUrl || null
//             };

//             try {
//                 await setDoc(sessionRef, { violationHistory: arrayUnion(violationEvent) }, { merge: true });
//             } catch (err) {
//                 console.error(`[PROCTOR ERROR] [${incidentId}] History arrayUnion write failed:`, err);
//             }
//         })();
//     };

//     const grabFrameFromVideo = (video: HTMLVideoElement | null): string | null => {
//         if (!video) return null;
//         const width = video.videoWidth || 1280;
//         const height = video.videoHeight || 720;

//         const canvas = canvasRef.current;
//         if (!canvas) return null;
//         const context = canvas.getContext('2d');
//         if (!context) return null;

//         canvas.width = Math.min(width, 1280);
//         canvas.height = Math.min(height, 720);

//         try {
//             context.drawImage(video, 0, 0, canvas.width, canvas.height);
//             return canvas.toDataURL('image/jpeg', 0.7);
//         } catch (e) {
//             console.error("[PROCTOR ERROR] Canvas drawImage failed:", e);
//             return null;
//         }
//     };

//     // ─── 10. EVENT LISTENERS ─────────────────────────────────────────────────
//     useEffect(() => {
//         if (!isProctored || !isReady) return;

//         const handleVisibilityChange = () => {
//             if (document.hidden && !violationWarningRef.current) {
//                 handleViolation("Tab Switching Detected: You navigated away from the assessment tab.", "browser");
//             }
//         };
//         const handleBlur = () => {
//             if (!violationWarningRef.current) {
//                 handleViolation("Window Focus Lost: You clicked outside the assessment window.", "browser");
//             }
//         };
//         const handleFullscreenChange = () => {
//             const docEl = document as any;
//             const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement);
//             if (!isCurrentlyFullscreen && !violationWarningRef.current) {
//                 setIsFullscreen(false);
//                 handleViolation("Fullscreen Exited: Assessments must be completed in locked fullscreen mode.", "browser");
//             }
//         };
//         const handleCopyPaste = (e: ClipboardEvent) => {
//             e.preventDefault();
//             if (!violationWarningRef.current) {
//                 handleViolation(`${e.type.charAt(0).toUpperCase() + e.type.slice(1)} Attempt Detected: Clipboard actions are blocked.`, "browser");
//             }
//         };
//         const handleCustomViolation = (e: any) => {
//             if (!violationWarningRef.current) {
//                 handleViolation(e.detail || "Security violation detected.", "browser");
//             }
//         };
//         const handleContextMenu = (e: Event) => e.preventDefault();
//         const handleKeyDown = (e: KeyboardEvent) => {
//             if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key)) || e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
//                 e.preventDefault();
//                 if (!violationWarningRef.current) {
//                     handleViolation(`Forbidden keyboard shortcut detected: ${e.key}`, "browser");
//                 }
//             }
//         };

//         document.addEventListener('visibilitychange', handleVisibilityChange);
//         window.addEventListener('blur', handleBlur);
//         document.addEventListener('fullscreenchange', handleFullscreenChange);
//         document.addEventListener('contextmenu', handleContextMenu);
//         document.addEventListener('proctorViolation', handleCustomViolation);
//         document.addEventListener('copy', handleCopyPaste);
//         document.addEventListener('cut', handleCopyPaste);
//         document.addEventListener('paste', handleCopyPaste);
//         document.addEventListener('keydown', handleKeyDown);

//         return () => {
//             document.removeEventListener('visibilitychange', handleVisibilityChange);
//             window.removeEventListener('blur', handleBlur);
//             document.removeEventListener('fullscreenchange', handleFullscreenChange);
//             document.removeEventListener('contextmenu', handleContextMenu);
//             document.removeEventListener('proctorViolation', handleCustomViolation);
//             document.removeEventListener('copy', handleCopyPaste);
//             document.removeEventListener('cut', handleCopyPaste);
//             document.removeEventListener('paste', handleCopyPaste);
//             document.removeEventListener('keydown', handleKeyDown);
//         };
//     }, [isProctored, isReady]);

//     // ─── 11. DRAGGABLE PIP LOGIC ─────────────────────────────────────────────
//     useEffect(() => {
//         const handleMouseMove = (e: MouseEvent) => {
//             if (!dragRef.current.isDragging) return;
//             e.preventDefault();
//             const dx = e.clientX - dragRef.current.startX;
//             const dy = e.clientY - dragRef.current.startY;
//             let newX = dragRef.current.initialX + dx;
//             let newY = dragRef.current.initialY + dy;
//             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
//             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
//             setPipPos({ x: newX, y: newY });
//         };
//         const handleTouchMove = (e: TouchEvent) => {
//             if (!dragRef.current.isDragging) return;
//             e.preventDefault();
//             const touch = e.touches[0];
//             const dx = touch.clientX - dragRef.current.startX;
//             const dy = touch.clientY - dragRef.current.startY;
//             let newX = dragRef.current.initialX + dx;
//             let newY = dragRef.current.initialY + dy;
//             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
//             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
//             setPipPos({ x: newX, y: newY });
//         };
//         const handleEndDrag = () => { dragRef.current.isDragging = false; };

//         window.addEventListener('mousemove', handleMouseMove);
//         window.addEventListener('mouseup', handleEndDrag);
//         window.addEventListener('touchmove', handleTouchMove, { passive: false });
//         window.addEventListener('touchend', handleEndDrag);

//         return () => {
//             window.removeEventListener('mousemove', handleMouseMove);
//             window.removeEventListener('mouseup', handleEndDrag);
//             window.removeEventListener('touchmove', handleTouchMove);
//             window.removeEventListener('touchend', handleEndDrag);
//         };
//     }, []);

//     const initiateDrag = (clientX: number, clientY: number) => {
//         dragRef.current.isDragging = true;
//         dragRef.current.startX = clientX;
//         dragRef.current.startY = clientY;
//         dragRef.current.initialX = pipPos.x;
//         dragRef.current.initialY = pipPos.y;
//     };

//     const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
//     const handleTouchStart = (e: React.TouchEvent) => {
//         const touch = e.touches[0];
//         initiateDrag(touch.clientX, touch.clientY);
//     };

//     // ─── RENDER ──────────────────────────────────────────────────────────────
//     if (!isProctored) return <>{children}</>;

//     const portalTarget = typeof document !== 'undefined' ? (document.getElementById('proctor-portal-root') || document.body) : null;

//     return (
//         <div ref={wrapperRef} className="pw-container">
//             <canvas ref={canvasRef} style={{ display: 'none' }} />
            
//             <video 
//                 ref={setScreenVideoRef} 
//                 autoPlay 
//                 muted 
//                 playsInline 
//                 style={{ position: 'absolute', width: '320px', height: '180px', left: '-9999px', opacity: 0, pointerEvents: 'none' }} 
//             />

//             {isReady && (
//                 <div className="pw-content">
//                     {children}
//                     <div className="pw-pip" style={{ left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }}>
//                         <div className="pw-pip-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
//                             <div className="pw-pip-title">
//                                 {isAiActive ? <ScanFace size={13} className="pw-pulse" /> : <Video size={13} className="pw-pulse" />}
//                                 <span>{isAiActive ? 'AI Tracking Active' : 'Live Recording'}</span>
//                             </div>
//                             <span className="pw-pip-drag-hint">(Drag)</span>
//                         </div>
//                         <video ref={setPipVideoRef} autoPlay muted playsInline className="pw-pip-video" />
//                     </div>
//                 </div>
//             )}

//             {/* 🚀 DEDICATED FIXED FULLSCREEN PORTAL CONTAINER */}
//             <div id="proctor-portal-root" style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'none' }} />

//             {/* Setup Gate Overlay */}
//             {!isReady && (
//                 <div className="lfm-overlay pw-gate-overlay">
//                     <div className="lfm-modal pw-gate-card">
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title" style={{ color: 'white' }}>
//                                 <ShieldAlert size={18} /> Secure AI Environment Setup
//                             </h2>
//                         </div>

//                         <div className="lfm-body pw-gate-body">
//                             <div className="pw-gate-intro">
//                                 <p>To begin, you must enable AI face tracking AND share your entire screen to prevent external window usage.</p>
//                             </div>

//                             <div className="lfm-section-hdr">
//                                 <ShieldAlert size={13} /> Invigilation Prerequisites
//                             </div>

//                             <div className="pw-steps">
//                                 {/* STEP 1: WEBCAM */}
//                                 <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
//                                     <div className="pw-step-icon">
//                                         {hasCamera ? <CheckCircle size={18} /> : <Camera size={18} />}
//                                     </div>
//                                     <div className="pw-step-text">
//                                         <strong>Webcam & Microphone</strong>
//                                         <span>{hasCamera ? 'Connected securely' : 'Required for AI face tracking'}</span>
//                                     </div>
//                                     {!hasCamera && (
//                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={requestWebcamAccess}>
//                                             Allow Access
//                                         </button>
//                                     )}
//                                 </div>

//                                 {/* STEP 2: AI ENGINE LOADER */}
//                                 <div className={`pw-step ${aiModelsLoaded ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
//                                     <div className="pw-step-icon">
//                                         {aiModelsLoaded ? <CheckCircle size={18} /> : <Loader2 className="lfm-spin" size={18} />}
//                                     </div>
//                                     <div className="pw-step-text">
//                                         <strong>AI Proctoring Engine</strong>
//                                         <span>{aiModelsLoaded ? 'Models Loaded & Verified' : 'Downloading neural weights...'}</span>
//                                     </div>
//                                 </div>

//                                 {/* STEP 3: SCREEN SHARE */}
//                                 <div className={`pw-step ${hasScreen ? 'pw-step--done' : screenError ? 'pw-step--error' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
//                                     <div className="pw-step-icon">
//                                         {hasScreen ? <CheckCircle size={18} /> : screenError ? <AlertCircle size={18} /> : <Monitor size={18} />}
//                                     </div>
//                                     <div className="pw-step-text" style={{ flex: 1 }}>
//                                         <strong>Screen Share (Entire Screen Only)</strong>
//                                         <span>{hasScreen ? 'Entire Screen Shared' : screenError ? screenError : 'Select "Entire Screen" in browser prompt'}</span>
//                                     </div>
//                                     {hasCamera && !hasScreen && (
//                                         <button 
//                                             className={`lfm-btn pw-btn-small ${screenError ? 'pw-btn-danger' : 'lfm-btn--primary'}`} 
//                                             style={{ background: screenError ? 'var(--mlab-red)' : undefined }}
//                                             onClick={requestScreenAccess}
//                                         >
//                                             {screenError ? 'Retry Screen Share' : 'Share Screen'}
//                                         </button>
//                                     )}
//                                 </div>

//                                 {/* STEP 4: FULLSCREEN MODE */}
//                                 <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera || !hasScreen || !aiModelsLoaded ? 'pw-step--disabled' : ''}`}>
//                                     <div className="pw-step-icon">
//                                         {isFullscreen ? <CheckCircle size={18} /> : <Maximize size={18} />}
//                                     </div>
//                                     <div className="pw-step-text">
//                                         <strong>Fullscreen Mode</strong>
//                                         <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
//                                     </div>
//                                     {hasCamera && hasScreen && aiModelsLoaded && !isFullscreen && (
//                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={enterFullscreen}>
//                                             Enter Fullscreen
//                                         </button>
//                                     )}
//                                 </div>
//                             </div>

//                             <video ref={gateVideoRef} autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }} />
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* Standard Violation Overlay */}
//             {violationWarning && !modalState && portalTarget && createPortal(
//                 <div className="lfm-overlay pw-violation-overlay" style={{ pointerEvents: 'auto' }}>
//                     <div className="lfm-modal pw-violation-card">
//                         <div className="lfm-header pw-violation-header">
//                             <h2 className="lfm-header__title">
//                                 <MonitorX size={18} /> Security Violation Detected
//                             </h2>
//                         </div>
//                         <div className="lfm-body pw-violation-body">
//                             <div className="lfm-error-banner">
//                                 <AlertCircle size={18} />
//                                 <span>{violationWarning}</span>
//                             </div>

//                             <div className="pw-violation-stats">
//                                 <span>Total Violations Logged: <strong>{violationCount}</strong></span>
//                             </div>

//                             <p className="pw-violation-sub">
//                                 A screenshot of your entire screen and webcam has been captured and sent to the invigilator dashboard.
//                             </p>

//                             <button
//                                 className="lfm-btn pw-btn-danger"
//                                 onClick={() => {
//                                     setViolationWarning(null);
//                                     setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), { status: 'active', latestWarning: null }, { merge: true });
//                                     if (!document.fullscreenElement) enterFullscreen();
//                                 }}
//                             >
//                                 I Understand, Return to Assessment
//                             </button>
//                         </div>
//                     </div>
//                 </div>,
//                 portalTarget
//             )}

//             {/* REUSABLE STATUS MODAL FOR TERMINATIONS & SCREEN SHARE INTERRUPTIONS */}
//             {modalState && portalTarget && createPortal(
//                 <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto' }}>
//                     <StatusModal
//                         type={modalState.type}
//                         title={modalState.title}
//                         message={modalState.message}
//                         confirmText={modalState.confirmText}
//                         onClose={modalState.onClose || (() => setModalState(null))}
//                         onCancel={modalState.onCancel}
//                     />
//                 </div>,
//                 portalTarget
//             )}
//         </div>
//     );
// };


// // import React, { useState, useEffect, useRef, useCallback } from 'react';
// // import { Camera, Maximize, MonitorX, ShieldAlert, CheckCircle, Video, ScanFace, Loader2, AlertCircle, Monitor } from 'lucide-react';
// // import { createPortal } from 'react-dom';
// // import { doc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
// // import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import { useToast } from '../Toast/Toast';
// // import * as faceapi from 'face-api.js';
// // import './ProctoringWrapper.css';

// // interface ProctoringWrapperProps {
// //     children: React.ReactNode;
// //     assessmentId: string;
// //     learnerId: string;
// //     isProctored: boolean;
// // }

// // export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
// //     const { user } = useStore();
// //     const toast = useToast();

// //     // Safe fallback IDs to guarantee valid Firestore document paths
// //     const activeAssessmentId = assessmentId || 'unassigned_assessment';
// //     const activeLearnerId = learnerId || user?.uid || 'unassigned_learner';

// //     const [isReady, setIsReady] = useState(!isProctored);
// //     const [hasCamera, setHasCamera] = useState(false);
// //     const [hasScreen, setHasScreen] = useState(false);
// //     const [screenError, setScreenError] = useState<string | null>(null);
// //     const [isFullscreen, setIsFullscreen] = useState(false);
// //     const [violationWarning, setViolationWarning] = useState<string | null>(null);
// //     const [violationCount, setViolationCount] = useState(0);

// //     const violationWarningRef = useRef<string | null>(null);
// //     useEffect(() => {
// //         violationWarningRef.current = violationWarning;
// //     }, [violationWarning]);

// //     // AI STATE
// //     const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
// //     const [isAiActive, setIsAiActive] = useState(false);

// //     // DRAGGABLE PIP STATE
// //     const [pipPos, setPipPos] = useState(() => ({
// //         x: typeof window !== 'undefined' ? window.innerWidth - 240 : 0,
// //         y: typeof window !== 'undefined' ? window.innerHeight - 190 : 0
// //     }));
// //     const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

// //     const gateVideoRef = useRef<HTMLVideoElement | null>(null);
// //     const pipVideoRef = useRef<HTMLVideoElement | null>(null);
// //     const screenVideoRef = useRef<HTMLVideoElement | null>(null);

// //     const streamRef = useRef<MediaStream | null>(null);
// //     const screenStreamRef = useRef<MediaStream | null>(null);

// //     const audioContextRef = useRef<AudioContext | null>(null);
// //     const analyserRef = useRef<AnalyserNode | null>(null);

// //     const wrapperRef = useRef<HTMLDivElement>(null);
// //     const canvasRef = useRef<HTMLCanvasElement>(null);
// //     const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
// //     const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
// //     const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

// //     // 🚀 CATEGORY-BASED THROTTLING TIMERS
// //     const lastBrowserViolationTimeRef = useRef<number>(0);
// //     const lastAiViolationTimeRef = useRef<number>(0);
// //     const lastAudioViolationTimeRef = useRef<number>(0);

// //     const gazeAwayTimeRef = useRef<number>(0);
// //     const noFaceTimeRef = useRef<number>(0);

// //     // Callback refs for instant video stream binding upon React DOM mounting
// //     const setPipVideoRef = useCallback((node: HTMLVideoElement | null) => {
// //         pipVideoRef.current = node;
// //         if (node && streamRef.current) {
// //             node.srcObject = streamRef.current;
// //             node.play().catch(e => console.warn("PiP video play failed:", e));
// //         }
// //     }, []);

// //     const setScreenVideoRef = useCallback((node: HTMLVideoElement | null) => {
// //         screenVideoRef.current = node;
// //         if (node && screenStreamRef.current) {
// //             node.srcObject = screenStreamRef.current;
// //             node.play().catch(e => console.warn("Screen video play failed:", e));
// //         }
// //     }, []);

// //     // ─── 1. LOAD AI MODELS FROM CDN ──────────────────────────────────────────
// //     useEffect(() => {
// //         if (!isProctored) return;
// //         let isMounted = true;

// //         const loadModels = async () => {
// //             const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
// //             try {
// //                 await Promise.all([
// //                     faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
// //                     faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
// //                 ]);
// //                 if (isMounted) setAiModelsLoaded(true);
// //             } catch (err) {
// //                 console.error("[PROCTOR] Failed to load AI models from CDN:", err);
// //                 if (isMounted) {
// //                     toast.warning("AI face models failed to load. Standard video and screen monitoring remain active.");
// //                 }
// //             }
// //         };
// //         loadModels();

// //         return () => { isMounted = false; };
// //     }, [isProctored]);

// //     // ─── 2. WEBCAM & MIC ACCESS ──────────────────────────────────────────────
// //     const requestWebcamAccess = async () => {
// //         try {
// //             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
// //             streamRef.current = stream;
// //             if (gateVideoRef.current) {
// //                 gateVideoRef.current.srcObject = stream;
// //                 gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
// //             }
// //             if (pipVideoRef.current) {
// //                 pipVideoRef.current.srcObject = stream;
// //                 pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
// //             }
// //             setHasCamera(true);

// //             const audioContext = new AudioContext();
// //             const source = audioContext.createMediaStreamSource(stream);
// //             const analyser = audioContext.createAnalyser();
// //             analyser.fftSize = 256;
// //             source.connect(analyser);
// //             audioContextRef.current = audioContext;
// //             analyserRef.current = analyser;

// //             toast.success("Webcam and Microphone connected securely.");
// //         } catch (err: any) {
// //             console.error("[PROCTOR] Webcam access error:", err);
// //             toast.error("Permission Denied: You must allow Webcam and Microphone access.");
// //         }
// //     };

// //     // ─── 3. ENFORCE "ENTIRE SCREEN" SHARE & HANDLE NATIVE "STOP SHARING" ──────
// //     const requestScreenAccess = async () => {
// //         setScreenError(null);
// //         try {
// //             const screenStream = await navigator.mediaDevices.getDisplayMedia({
// //                 video: true,
// //                 // systemAudio: 'exclude'
// //             });

// //             const videoTrack = screenStream.getVideoTracks()[0];
// //             const settings = videoTrack.getSettings() as any;
// //             const displaySurface = settings.displaySurface;

// //             if (displaySurface && displaySurface !== 'monitor') {
// //                 screenStream.getTracks().forEach(track => track.stop());
// //                 const errMessage = "Selection Error: You selected a Tab or Window. You MUST select 'Entire Screen'.";
// //                 setScreenError(errMessage);
// //                 toast.error(errMessage);
// //                 setHasScreen(false);
// //                 return;
// //             }

// //             screenStreamRef.current = screenStream;
// //             if (screenVideoRef.current) {
// //                 screenVideoRef.current.srcObject = screenStream;
// //                 screenVideoRef.current.play().catch(e => console.warn("Screen video play failed:", e));
// //             }
// //             setHasScreen(true);
// //             setScreenError(null);

// //             videoTrack.onended = async () => {
// //                 console.warn("[PROCTOR BREACH] Native 'Stop sharing' button clicked by learner.");
// //                 await handleCriticalTermination("CRITICAL SECURITY BREACH: You clicked 'Stop sharing'. Screen sharing is mandatory throughout the assessment. The assessment has been terminated.");
// //             };

// //             toast.success("Entire Screen shared successfully.");
// //         } catch (err: any) {
// //             console.error("[PROCTOR] Screen access error:", err);
// //             const errMsg = "Screen Share Cancelled: You must grant Entire Screen permission to proceed.";
// //             setScreenError(errMsg);
// //             toast.error(errMsg);
// //         }
// //     };

// //     useEffect(() => {
// //         return () => {
// //             if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
// //             if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
// //             if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
// //             if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
// //             if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
// //             if (audioContextRef.current) audioContextRef.current.close();

// //             if (isProctored && activeAssessmentId && activeLearnerId) {
// //                 setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
// //                     status: 'offline', lastHeartbeat: serverTimestamp()
// //                 }, { merge: true }).catch(console.error);
// //             }
// //         };
// //     }, [isProctored, activeAssessmentId, activeLearnerId]);

// //     // ─── 4. FULLSCREEN MODE ──────────────────────────────────────────────────
// //     const enterFullscreen = async () => {
// //         if (!wrapperRef.current) return;
// //         try {
// //             if (wrapperRef.current.requestFullscreen) await wrapperRef.current.requestFullscreen();
// //             setIsFullscreen(true);
// //             setIsReady(true);
// //             startLightweightHeartbeat();
// //             startAiProctoring();
// //             startAudioMonitoring();
// //         } catch (err) {
// //             toast.error("Failed to enter fullscreen mode.");
// //         }
// //     };

// //     // ─── 5. HEARTBEAT ────────────────────────────────────────────────────────
// //     const startLightweightHeartbeat = () => {
// //         const sendPing = () => {
// //             if (!activeAssessmentId || !activeLearnerId) return;
// //             setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
// //                 assessmentId: activeAssessmentId,
// //                 learnerId: activeLearnerId,
// //                 learnerName: user?.fullName || 'Unknown Learner',
// //                 status: 'active',
// //                 lastHeartbeat: serverTimestamp()
// //             }, { merge: true }).catch(console.error);
// //         };
// //         sendPing();
// //         heartbeatIntervalRef.current = setInterval(sendPing, 30000);
// //     };

// //     // ─── 6. AI GAZE & FACE DETECTION LOOP ────────────────────────────────────
// //     const startAiProctoring = () => {
// //         if (!aiModelsLoaded) {
// //             setTimeout(() => { if (isReady && !aiModelsLoaded) startAiProctoring(); }, 3000);
// //             return;
// //         }
// //         setIsAiActive(true);

// //         aiIntervalRef.current = setInterval(async () => {
// //             const video = pipVideoRef.current;
// //             if (!video || video.readyState !== 4) return;

// //             try {
// //                 const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

// //                 if (detections.length === 0) {
// //                     noFaceTimeRef.current += 2;
// //                     if (noFaceTimeRef.current >= 6) {
// //                         handleViolation("Face Not Detected: You left the camera frame or covered your face.", "ai");
// //                         noFaceTimeRef.current = 0;
// //                     }
// //                     return;
// //                 } else {
// //                     noFaceTimeRef.current = 0;
// //                 }

// //                 if (detections.length > 1) {
// //                     handleViolation("Multiple Faces Detected: Another person entered the camera frame.", "ai");
// //                     return;
// //                 }

// //                 const face = detections[0];
// //                 const landmarks = face.landmarks;
// //                 const leftEye = landmarks.getLeftEye();
// //                 const rightEye = landmarks.getRightEye();
// //                 const nose = landmarks.getNose();

// //                 const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
// //                 const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
// //                 const eyeMidX = (leftEyeX + rightEyeX) / 2;

// //                 const horizontalGazeDiff = Math.abs(nose[3].x - eyeMidX);
// //                 const faceWidth = face.detection.box.width;

// //                 if (horizontalGazeDiff > (faceWidth * 0.15)) {
// //                     gazeAwayTimeRef.current += 2;
// //                     if (gazeAwayTimeRef.current >= 8) {
// //                         handleViolation("Gaze Tracking Alert: You looked away from the screen for too long.", "ai");
// //                         gazeAwayTimeRef.current = 0;
// //                     }
// //                 } else {
// //                     gazeAwayTimeRef.current = 0;
// //                 }
// //             } catch (err) {
// //                 console.error("[PROCTOR] AI Inference Error:", err);
// //             }
// //         }, 2000);
// //     };

// //     // ─── 7. AUDIO MONITORING LOOP ────────────────────────────────────────────
// //     const startAudioMonitoring = () => {
// //         if (!analyserRef.current) return;
// //         const bufferLength = analyserRef.current.frequencyBinCount;
// //         const dataArray = new Uint8Array(bufferLength);

// //         audioIntervalRef.current = setInterval(() => {
// //             if (!analyserRef.current) return;
// //             analyserRef.current.getByteFrequencyData(dataArray);

// //             let sum = 0;
// //             for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
// //             const avgVolume = sum / bufferLength;

// //             if (avgVolume > 40) {
// //                 handleViolation("Audio Alert: Loud talking or background noise detected.", "audio");
// //             }
// //         }, 1000);
// //     };

// //     // ─── 8. CRITICAL TERMINATION ──────────────────────────────────────────────
// //     const handleCriticalTermination = async (reason: string) => {
// //         console.warn("[PROCTOR TERMINATION]", reason);

// //         const timestampIso = new Date().toISOString();
// //         const timestampId = Date.now();

// //         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
// //         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

// //         if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
// //         if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());

// //         let screenUrl: string | null = null;
// //         let webcamUrl: string | null = null;
// //         try {
// //             const storage = getStorage();
// //             if (screenFrame) {
// //                 const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_screen.jpg`);
// //                 await uploadString(screenRef, screenFrame, 'data_url');
// //                 screenUrl = await getDownloadURL(screenRef);
// //             }
// //             if (webcamFrame) {
// //                 const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_webcam.jpg`);
// //                 await uploadString(webcamRef, webcamFrame, 'data_url');
// //                 webcamUrl = await getDownloadURL(webcamRef);
// //             }
// //         } catch (e) {
// //             console.error("[PROCTOR] Failed uploading termination frames:", e);
// //         }

// //         const violationEvent = {
// //             timestamp: timestampIso,
// //             reason: reason || "Critical Security Termination",
// //             imageUrl: webcamUrl || null,
// //             screenUrl: screenUrl || null
// //         };

// //         const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);
// //         await setDoc(sessionRef, {
// //             status: 'terminated',
// //             latestWarning: reason,
// //             violationCount: increment(1),
// //             violationHistory: arrayUnion(violationEvent),
// //             terminatedAt: serverTimestamp()
// //         }, { merge: true }).catch(console.error);

// //         try {
// //             const subQ = query(
// //                 collection(db, 'learner_submissions'),
// //                 where('assessmentId', '==', activeAssessmentId),
// //                 where('authUid', '==', activeLearnerId)
// //             );
// //             const subSnap = await getDocs(subQ);
// //             if (!subSnap.empty) {
// //                 const subDoc = subSnap.docs[0];
// //                 await updateDoc(doc(db, 'learner_submissions', subDoc.id), {
// //                     status: 'missed',
// //                     systemNote: `Assessment terminated by security proctor: ${reason}`,
// //                     terminatedAt: timestampIso
// //                 });
// //             }
// //         } catch (e) {
// //             console.error("[PROCTOR] Failed to update submission status on termination:", e);
// //         }

// //         if (document.fullscreenElement) {
// //             document.exitFullscreen().catch(() => {});
// //         }

// //         alert(`ASSESSMENT TERMINATED\n\n${reason}\n\nThis incident has been permanently recorded on the Invigilator Dashboard.`);
// //         window.location.href = user?.role === 'learner' ? '/learner/dashboard' : '/';
// //     };

// //     // ─── 9. HANDLE VIOLATION & LOGGING (WITH CONSOLE LOG AUDITING) ───────────
// //     const handleViolation = async (reason: string, category: 'browser' | 'ai' | 'audio' = 'browser') => {
// //         const now = Date.now();

// //         // Category-specific throttling
// //         if (category === 'audio') {
// //             if (now - lastAudioViolationTimeRef.current < 25000) return;
// //             lastAudioViolationTimeRef.current = now;
// //         } else if (category === 'ai') {
// //             if (now - lastAiViolationTimeRef.current < 15000) return;
// //             lastAiViolationTimeRef.current = now;
// //         } else {
// //             if (now - lastBrowserViolationTimeRef.current < 5000) return;
// //             lastBrowserViolationTimeRef.current = now;
// //         }

// //         // GENERATE UNIQUE INCIDENT ID
// //         const timestampIso = new Date().toISOString();
// //         const timestampId = Date.now();
// //         const incidentId = `inc_${timestampId}_${Math.random().toString(36).substring(2, 7)}`;

// //         // console.warn(
// //         //     `%c[PROCTOR VIOLATION DETECTED]%c ID: ${incidentId} | Category: ${category.toUpperCase()} | Path: live_proctor_sessions/${activeAssessmentId}_${activeLearnerId}\nReason: ${reason}`,
// //         //     'color: #ef4444; font-weight: bold; font-size: 12px;',
// //         //     'color: inherit;'
// //         // );

// //         // Instant frame capture before browser throttling
// //         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
// //         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

// //         // console.log(`[PROCTOR FRAME CAPTURE] [${incidentId}] Screen Frame: ${screenFrame ? 'SUCCESS' : 'FAILED/NULL'} | Webcam Frame: ${webcamFrame ? 'SUCCESS' : 'FAILED/NULL'}`);

// //         setViolationWarning(reason);
// //         setViolationCount(prev => prev + 1);

// //         const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);

// //         // Update overall session status summary
// //         try {
// //             await setDoc(sessionRef, {
// //                 assessmentId: activeAssessmentId,
// //                 learnerId: activeLearnerId,
// //                 learnerName: user?.fullName || 'Unknown Learner',
// //                 status: 'violation',
// //                 violationCount: increment(1),
// //                 latestWarning: reason,
// //                 lastHeartbeat: serverTimestamp()
// //             }, { merge: true });
// //             // console.log(`[PROCTOR SUMMARY UPDATED] [${incidentId}] Session status set to 'violation' in Firestore.`);
// //         } catch (err) {
// //             console.error(`[PROCTOR ERROR] [${incidentId}] Session summary write failed:`, err);
// //         }

// //         // Upload evidence snapshots and append incident event to violationHistory
// //         (async () => {
// //             let screenUrl: string | null = null;
// //             let webcamUrl: string | null = null;

// //             try {
// //                 const storage = getStorage();
// //                 if (screenFrame) {
// //                     const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_screen.jpg`);
// //                     await uploadString(screenRef, screenFrame, 'data_url');
// //                     screenUrl = await getDownloadURL(screenRef);
// //                     console.log(`[PROCTOR EVIDENCE SCREENSHOT] [${incidentId}] Storage URL:`, screenUrl);
// //                 }
// //                 if (webcamFrame) {
// //                     const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_webcam.jpg`);
// //                     await uploadString(webcamRef, webcamFrame, 'data_url');
// //                     webcamUrl = await getDownloadURL(webcamRef);
// //                     console.log(`[PROCTOR EVIDENCE WEBCAM] [${incidentId}] Storage URL:`, webcamUrl);
// //                 }
// //             } catch (e) {
// //                 console.error(`[PROCTOR ERROR] [${incidentId}] Snapshot upload failed:`, e);
// //             }

// //             // Guaranteed non-undefined violation payload with Incident ID
// //             const violationEvent = {
// //                 id: incidentId,
// //                 timestamp: timestampIso,
// //                 reason: reason || "Unspecified Violation",
// //                 imageUrl: webcamUrl || null,
// //                 screenUrl: screenUrl || null
// //             };

// //             try {
// //                 await setDoc(sessionRef, { violationHistory: arrayUnion(violationEvent) }, { merge: true });
// //                 console.log(`%c[PROCTOR FIRESTORE SUCCESS]%c Incident [${incidentId}] successfully appended to violationHistory array.`, 'color: #22c55e; font-weight: bold;', 'color: inherit;');
// //             } catch (err) {
// //                 console.error(`[PROCTOR ERROR] [${incidentId}] History arrayUnion write failed:`, err);
// //             }
// //         })();
// //     };

// //     // ROBUST FRAME GRABBER WITH DIMENSION FALLBACKS
// //     const grabFrameFromVideo = (video: HTMLVideoElement | null): string | null => {
// //         if (!video) return null;
// //         const width = video.videoWidth || 1280;
// //         const height = video.videoHeight || 720;

// //         const canvas = canvasRef.current;
// //         if (!canvas) return null;
// //         const context = canvas.getContext('2d');
// //         if (!context) return null;

// //         canvas.width = Math.min(width, 1280);
// //         canvas.height = Math.min(height, 720);

// //         try {
// //             context.drawImage(video, 0, 0, canvas.width, canvas.height);
// //             return canvas.toDataURL('image/jpeg', 0.7);
// //         } catch (e) {
// //             console.error("[PROCTOR ERROR] Canvas drawImage failed:", e);
// //             return null;
// //         }
// //     };

// //     // ─── 10. EVENT LISTENERS (USES REF TO AVOID STALE CLOSURES) ───────────────
// //     useEffect(() => {
// //         if (!isProctored || !isReady) return;

// //         const handleVisibilityChange = () => {
// //             if (document.hidden && !violationWarningRef.current) {
// //                 handleViolation("Tab Switching Detected: You navigated away from the assessment tab.", "browser");
// //             }
// //         };
// //         const handleBlur = () => {
// //             if (!violationWarningRef.current) {
// //                 handleViolation("Window Focus Lost: You clicked outside the assessment window.", "browser");
// //             }
// //         };
// //         const handleFullscreenChange = () => {
// //             const docEl = document as any;
// //             const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement);
// //             if (!isCurrentlyFullscreen && !violationWarningRef.current) {
// //                 setIsFullscreen(false);
// //                 handleViolation("Fullscreen Exited: Assessments must be completed in locked fullscreen mode.", "browser");
// //             }
// //         };
// //         const handleCopyPaste = (e: ClipboardEvent) => {
// //             e.preventDefault();
// //             if (!violationWarningRef.current) {
// //                 handleViolation(`${e.type.charAt(0).toUpperCase() + e.type.slice(1)} Attempt Detected: Clipboard actions are blocked.`, "browser");
// //             }
// //         };
// //         const handleCustomViolation = (e: any) => {
// //             if (!violationWarningRef.current) {
// //                 handleViolation(e.detail || "Security violation detected.", "browser");
// //             }
// //         };
// //         const handleContextMenu = (e: Event) => e.preventDefault();
// //         const handleKeyDown = (e: KeyboardEvent) => {
// //             if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key)) || e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
// //                 e.preventDefault();
// //                 if (!violationWarningRef.current) {
// //                     handleViolation(`Forbidden keyboard shortcut detected: ${e.key}`, "browser");
// //                 }
// //             }
// //         };

// //         document.addEventListener('visibilitychange', handleVisibilityChange);
// //         window.addEventListener('blur', handleBlur);
// //         document.addEventListener('fullscreenchange', handleFullscreenChange);
// //         document.addEventListener('contextmenu', handleContextMenu);
// //         document.addEventListener('proctorViolation', handleCustomViolation);
// //         document.addEventListener('copy', handleCopyPaste);
// //         document.addEventListener('cut', handleCopyPaste);
// //         document.addEventListener('paste', handleCopyPaste);
// //         document.addEventListener('keydown', handleKeyDown);

// //         return () => {
// //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// //             window.removeEventListener('blur', handleBlur);
// //             document.removeEventListener('fullscreenchange', handleFullscreenChange);
// //             document.removeEventListener('contextmenu', handleContextMenu);
// //             document.removeEventListener('proctorViolation', handleCustomViolation);
// //             document.removeEventListener('copy', handleCopyPaste);
// //             document.removeEventListener('cut', handleCopyPaste);
// //             document.removeEventListener('paste', handleCopyPaste);
// //             document.removeEventListener('keydown', handleKeyDown);
// //         };
// //     }, [isProctored, isReady]);

// //     // ─── 11. DRAGGABLE PIP LOGIC ─────────────────────────────────────────────
// //     useEffect(() => {
// //         const handleMouseMove = (e: MouseEvent) => {
// //             if (!dragRef.current.isDragging) return;
// //             e.preventDefault();
// //             const dx = e.clientX - dragRef.current.startX;
// //             const dy = e.clientY - dragRef.current.startY;
// //             let newX = dragRef.current.initialX + dx;
// //             let newY = dragRef.current.initialY + dy;
// //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// //             setPipPos({ x: newX, y: newY });
// //         };
// //         const handleTouchMove = (e: TouchEvent) => {
// //             if (!dragRef.current.isDragging) return;
// //             e.preventDefault();
// //             const touch = e.touches[0];
// //             const dx = touch.clientX - dragRef.current.startX;
// //             const dy = touch.clientY - dragRef.current.startY;
// //             let newX = dragRef.current.initialX + dx;
// //             let newY = dragRef.current.initialY + dy;
// //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// //             setPipPos({ x: newX, y: newY });
// //         };
// //         const handleEndDrag = () => { dragRef.current.isDragging = false; };

// //         window.addEventListener('mousemove', handleMouseMove);
// //         window.addEventListener('mouseup', handleEndDrag);
// //         window.addEventListener('touchmove', handleTouchMove, { passive: false });
// //         window.addEventListener('touchend', handleEndDrag);

// //         return () => {
// //             window.removeEventListener('mousemove', handleMouseMove);
// //             window.removeEventListener('mouseup', handleEndDrag);
// //             window.removeEventListener('touchmove', handleTouchMove);
// //             window.removeEventListener('touchend', handleEndDrag);
// //         };
// //     }, []);

// //     const initiateDrag = (clientX: number, clientY: number) => {
// //         dragRef.current.isDragging = true;
// //         dragRef.current.startX = clientX;
// //         dragRef.current.startY = clientY;
// //         dragRef.current.initialX = pipPos.x;
// //         dragRef.current.initialY = pipPos.y;
// //     };

// //     const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
// //     const handleTouchStart = (e: React.TouchEvent) => {
// //         const touch = e.touches[0];
// //         initiateDrag(touch.clientX, touch.clientY);
// //     };

// //     // ─── RENDER ──────────────────────────────────────────────────────────────
// //     if (!isProctored) return <>{children}</>;

// //     const portalTarget = typeof document !== 'undefined' ? (document.getElementById('proctor-portal-root') || document.body) : null;

// //     return (
// //         <div ref={wrapperRef} className="pw-container">
// //             <canvas ref={canvasRef} style={{ display: 'none' }} />
            
// //             {/* Hidden screen video element mapped to the callback ref */}
// //             <video 
// //                 ref={setScreenVideoRef} 
// //                 autoPlay 
// //                 muted 
// //                 playsInline 
// //                 style={{ position: 'absolute', width: '320px', height: '180px', left: '-9999px', opacity: 0, pointerEvents: 'none' }} 
// //             />

// //             {/* Assessment Content */}
// //             {isReady && (
// //                 <div className="pw-content">
// //                     {children}
// //                     <div className="pw-pip" style={{ left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }}>
// //                         <div className="pw-pip-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
// //                             <div className="pw-pip-title">
// //                                 {isAiActive ? <ScanFace size={13} className="pw-pulse" /> : <Video size={13} className="pw-pulse" />}
// //                                 <span>{isAiActive ? 'AI Tracking Active' : 'Live Recording'}</span>
// //                             </div>
// //                             <span className="pw-pip-drag-hint">(Drag)</span>
// //                         </div>
// //                         <video ref={setPipVideoRef} autoPlay muted playsInline className="pw-pip-video" />
// //                     </div>
// //                 </div>
// //             )}

// //             {/* 🚀 DEDICATED FIXED FULLSCREEN PORTAL CONTAINER */}
// //             <div id="proctor-portal-root" style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'none' }} />

// //             {/* Setup Gate Overlay */}
// //             {!isReady && (
// //                 <div className="lfm-overlay pw-gate-overlay">
// //                     <div className="lfm-modal pw-gate-card">
// //                         <div className="lfm-header">
// //                             <h2 className="lfm-header__title" style={{ color: 'white' }}>
// //                                 <ShieldAlert size={18} /> Secure AI Environment Setup
// //                             </h2>
// //                         </div>

// //                         <div className="lfm-body pw-gate-body">
// //                             <div className="pw-gate-intro">
// //                                 <p>To begin, you must enable AI face tracking AND share your entire screen to prevent external window usage.</p>
// //                             </div>

// //                             <div className="lfm-section-hdr">
// //                                 <ShieldAlert size={13} /> Invigilation Prerequisites
// //                             </div>

// //                             <div className="pw-steps">
// //                                 {/* STEP 1: WEBCAM */}
// //                                 <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
// //                                     <div className="pw-step-icon">
// //                                         {hasCamera ? <CheckCircle size={18} /> : <Camera size={18} />}
// //                                     </div>
// //                                     <div className="pw-step-text">
// //                                         <strong>Webcam & Microphone</strong>
// //                                         <span>{hasCamera ? 'Connected securely' : 'Required for AI face tracking'}</span>
// //                                     </div>
// //                                     {!hasCamera && (
// //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={requestWebcamAccess}>
// //                                             Allow Access
// //                                         </button>
// //                                     )}
// //                                 </div>

// //                                 {/* STEP 2: AI ENGINE LOADER */}
// //                                 <div className={`pw-step ${aiModelsLoaded ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// //                                     <div className="pw-step-icon">
// //                                         {aiModelsLoaded ? <CheckCircle size={18} /> : <Loader2 className="lfm-spin" size={18} />}
// //                                     </div>
// //                                     <div className="pw-step-text">
// //                                         <strong>AI Proctoring Engine</strong>
// //                                         <span>{aiModelsLoaded ? 'Models Loaded & Verified' : 'Downloading neural weights...'}</span>
// //                                     </div>
// //                                 </div>

// //                                 {/* STEP 3: SCREEN SHARE */}
// //                                 <div className={`pw-step ${hasScreen ? 'pw-step--done' : screenError ? 'pw-step--error' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// //                                     <div className="pw-step-icon">
// //                                         {hasScreen ? <CheckCircle size={18} /> : screenError ? <AlertCircle size={18} /> : <Monitor size={18} />}
// //                                     </div>
// //                                     <div className="pw-step-text" style={{ flex: 1 }}>
// //                                         <strong>Screen Share (Entire Screen Only)</strong>
// //                                         <span>{hasScreen ? 'Entire Screen Shared' : screenError ? screenError : 'Select "Entire Screen" in browser prompt'}</span>
// //                                     </div>
// //                                     {hasCamera && !hasScreen && (
// //                                         <button 
// //                                             className={`lfm-btn pw-btn-sall ${screenError ? 'pw-btn-danger' : 'lfm-btn--primary'}`} 
// //                                             style={{ background: screenError ? 'var(--mlab-red)' : undefined, width: 200 }}
// //                                             onClick={requestScreenAccess}
// //                                         >
// //                                             {screenError ? 'Retry Screen Share' : 'Share Screen'}
// //                                         </button>
// //                                     )}
// //                                 </div>

// //                                 {/* STEP 4: FULLSCREEN MODE */}
// //                                 <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera || !hasScreen || !aiModelsLoaded ? 'pw-step--disabled' : ''}`}>
// //                                     <div className="pw-step-icon">
// //                                         {isFullscreen ? <CheckCircle size={18} /> : <Maximize size={18} />}
// //                                     </div>
// //                                     <div className="pw-step-text">
// //                                         <strong>Fullscreen Mode</strong>
// //                                         <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
// //                                     </div>
// //                                     {hasCamera && hasScreen && aiModelsLoaded && !isFullscreen && (
// //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={enterFullscreen}>
// //                                             Enter Fullscreen
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                             </div>

// //                             <video ref={gateVideoRef} autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }} />
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* Violation Overlay */}
// //             {violationWarning && portalTarget && createPortal(
// //                 <div className="lfm-overlay pw-violation-overlay" style={{ pointerEvents: 'auto' }}>
// //                     <div className="lfm-modal pw-violation-card">
// //                         <div className="lfm-header pw-violation-header">
// //                             <h2 className="lfm-header__title">
// //                                 <MonitorX size={18} /> Security Violation Detected
// //                             </h2>
// //                         </div>
// //                         <div className="lfm-body pw-violation-body">
// //                             <div className="lfm-error-banner">
// //                                 <AlertCircle size={18} />
// //                                 <span>{violationWarning}</span>
// //                             </div>

// //                             <div className="pw-violation-stats">
// //                                 <span>Total Violations Logged: <strong>{violationCount}</strong></span>
// //                             </div>

// //                             <p className="pw-violation-sub">
// //                                 A screenshot of your entire screen and webcam has been captured and sent to the invigilator dashboard.
// //                             </p>

// //                             <button
// //                                 className="lfm-btn pw-btn-danger"
// //                                 onClick={() => {
// //                                     setViolationWarning(null);
// //                                     setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), { status: 'active', latestWarning: null }, { merge: true });
// //                                     if (!document.fullscreenElement) enterFullscreen();
// //                                 }}
// //                             >
// //                                 I Understand, Return to Assessment
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>,
// //                 portalTarget
// //             )}
// //         </div>
// //     );
// // };


// // // import React, { useState, useEffect, useRef, useCallback } from 'react';
// // // import { Camera, Maximize, MonitorX, ShieldAlert, CheckCircle, Video, ScanFace, Loader2, AlertCircle, Monitor } from 'lucide-react';
// // // import { createPortal } from 'react-dom';
// // // import { doc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
// // // import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
// // // import { db } from '../../../lib/firebase';
// // // import { useStore } from '../../../store/useStore';
// // // import { useToast } from '../Toast/Toast';
// // // import * as faceapi from 'face-api.js';
// // // import './ProctoringWrapper.css';

// // // interface ProctoringWrapperProps {
// // //     children: React.ReactNode;
// // //     assessmentId: string;
// // //     learnerId: string;
// // //     isProctored: boolean;
// // // }

// // // export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
// // //     const { user } = useStore();
// // //     const toast = useToast();

// // //     const activeAssessmentId = assessmentId || 'unassigned_assessment';
// // //     const activeLearnerId = learnerId || user?.uid || 'unassigned_learner';

// // //     const [isReady, setIsReady] = useState(!isProctored);
// // //     const [hasCamera, setHasCamera] = useState(false);
// // //     const [hasScreen, setHasScreen] = useState(false);
// // //     const [screenError, setScreenError] = useState<string | null>(null);
// // //     const [isFullscreen, setIsFullscreen] = useState(false);
// // //     const [violationWarning, setViolationWarning] = useState<string | null>(null);
// // //     const [violationCount, setViolationCount] = useState(0);

// // //     const violationWarningRef = useRef<string | null>(null);
// // //     useEffect(() => {
// // //         violationWarningRef.current = violationWarning;
// // //     }, [violationWarning]);

// // //     const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
// // //     const [isAiActive, setIsAiActive] = useState(false);

// // //     const [pipPos, setPipPos] = useState(() => ({
// // //         x: typeof window !== 'undefined' ? window.innerWidth - 240 : 0,
// // //         y: typeof window !== 'undefined' ? window.innerHeight - 190 : 0
// // //     }));
// // //     const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

// // //     const gateVideoRef = useRef<HTMLVideoElement | null>(null);
// // //     const pipVideoRef = useRef<HTMLVideoElement | null>(null);
// // //     const screenVideoRef = useRef<HTMLVideoElement | null>(null);

// // //     const streamRef = useRef<MediaStream | null>(null);
// // //     const screenStreamRef = useRef<MediaStream | null>(null);

// // //     const audioContextRef = useRef<AudioContext | null>(null);
// // //     const analyserRef = useRef<AnalyserNode | null>(null);

// // //     const wrapperRef = useRef<HTMLDivElement>(null);
// // //     const canvasRef = useRef<HTMLCanvasElement>(null);
// // //     const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // //     const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // //     const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

// // //     const lastBrowserViolationTimeRef = useRef<number>(0);
// // //     const lastAiViolationTimeRef = useRef<number>(0);
// // //     const lastAudioViolationTimeRef = useRef<number>(0);

// // //     const gazeAwayTimeRef = useRef<number>(0);
// // //     const noFaceTimeRef = useRef<number>(0);

// // //     const setPipVideoRef = useCallback((node: HTMLVideoElement | null) => {
// // //         pipVideoRef.current = node;
// // //         if (node && streamRef.current) {
// // //             node.srcObject = streamRef.current;
// // //             node.play().catch(e => console.warn("PiP video play failed:", e));
// // //         }
// // //     }, []);

// // //     const setScreenVideoRef = useCallback((node: HTMLVideoElement | null) => {
// // //         screenVideoRef.current = node;
// // //         if (node && screenStreamRef.current) {
// // //             node.srcObject = screenStreamRef.current;
// // //             node.play().catch(e => console.warn("Screen video play failed:", e));
// // //         }
// // //     }, []);

// // //     useEffect(() => {
// // //         if (!isProctored) return;
// // //         let isMounted = true;

// // //         const loadModels = async () => {
// // //             const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
// // //             try {
// // //                 await Promise.all([
// // //                     faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
// // //                     faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
// // //                 ]);
// // //                 if (isMounted) setAiModelsLoaded(true);
// // //             } catch (err) {
// // //                 console.error("[PROCTOR] Failed to load AI models from CDN:", err);
// // //                 if (isMounted) {
// // //                     toast.warning("AI face models failed to load. Standard video and screen monitoring remain active.");
// // //                 }
// // //             }
// // //         };
// // //         loadModels();

// // //         return () => { isMounted = false; };
// // //     }, [isProctored]);

// // //     const requestWebcamAccess = async () => {
// // //         try {
// // //             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
// // //             streamRef.current = stream;
// // //             if (gateVideoRef.current) {
// // //                 gateVideoRef.current.srcObject = stream;
// // //                 gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
// // //             }
// // //             if (pipVideoRef.current) {
// // //                 pipVideoRef.current.srcObject = stream;
// // //                 pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
// // //             }
// // //             setHasCamera(true);

// // //             const audioContext = new AudioContext();
// // //             const source = audioContext.createMediaStreamSource(stream);
// // //             const analyser = audioContext.createAnalyser();
// // //             analyser.fftSize = 256;
// // //             source.connect(analyser);
// // //             audioContextRef.current = audioContext;
// // //             analyserRef.current = analyser;

// // //             toast.success("Webcam and Microphone connected securely.");
// // //         } catch (err: any) {
// // //             console.error("[PROCTOR] Webcam access error:", err);
// // //             toast.error("Permission Denied: You must allow Webcam and Microphone access.");
// // //         }
// // //     };

// // //     const requestScreenAccess = async () => {
// // //         setScreenError(null);
// // //         try {
// // //             const screenStream = await navigator.mediaDevices.getDisplayMedia({
// // //                 video: true,
// // //                 // systemAudio: 'exclude'
// // //             });

// // //             const videoTrack = screenStream.getVideoTracks()[0];
// // //             const settings = videoTrack.getSettings() as any;
// // //             const displaySurface = settings.displaySurface;

// // //             if (displaySurface && displaySurface !== 'monitor') {
// // //                 screenStream.getTracks().forEach(track => track.stop());
// // //                 const errMessage = "Selection Error: You selected a Tab or Window. You MUST select 'Entire Screen'.";
// // //                 setScreenError(errMessage);
// // //                 toast.error(errMessage);
// // //                 setHasScreen(false);
// // //                 return;
// // //             }

// // //             screenStreamRef.current = screenStream;
// // //             if (screenVideoRef.current) {
// // //                 screenVideoRef.current.srcObject = screenStream;
// // //                 screenVideoRef.current.play().catch(e => console.warn("Screen video play failed:", e));
// // //             }
// // //             setHasScreen(true);
// // //             setScreenError(null);

// // //             videoTrack.onended = async () => {
// // //                 console.warn("[PROCTOR BREACH] Native 'Stop sharing' button clicked by learner.");
// // //                 await handleCriticalTermination("CRITICAL SECURITY BREACH: You clicked 'Stop sharing'. Screen sharing is mandatory throughout the assessment. The assessment has been terminated.");
// // //             };

// // //             toast.success("Entire Screen shared successfully.");
// // //         } catch (err: any) {
// // //             console.error("[PROCTOR] Screen access error:", err);
// // //             const errMsg = "Screen Share Cancelled: You must grant Entire Screen permission to proceed.";
// // //             setScreenError(errMsg);
// // //             toast.error(errMsg);
// // //         }
// // //     };

// // //     useEffect(() => {
// // //         return () => {
// // //             if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
// // //             if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
// // //             if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
// // //             if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
// // //             if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
// // //             if (audioContextRef.current) audioContextRef.current.close();

// // //             if (isProctored && activeAssessmentId && activeLearnerId) {
// // //                 setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
// // //                     status: 'offline', lastHeartbeat: serverTimestamp()
// // //                 }, { merge: true }).catch(console.error);
// // //             }
// // //         };
// // //     }, [isProctored, activeAssessmentId, activeLearnerId]);

// // //     const enterFullscreen = async () => {
// // //         if (!wrapperRef.current) return;
// // //         try {
// // //             if (wrapperRef.current.requestFullscreen) await wrapperRef.current.requestFullscreen();
// // //             setIsFullscreen(true);
// // //             setIsReady(true);
// // //             startLightweightHeartbeat();
// // //             startAiProctoring();
// // //             startAudioMonitoring();
// // //         } catch (err) {
// // //             toast.error("Failed to enter fullscreen mode.");
// // //         }
// // //     };

// // //     const startLightweightHeartbeat = () => {
// // //         const sendPing = () => {
// // //             if (!activeAssessmentId || !activeLearnerId) return;
// // //             setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
// // //                 assessmentId: activeAssessmentId,
// // //                 learnerId: activeLearnerId,
// // //                 learnerName: user?.fullName || 'Unknown Learner',
// // //                 status: 'active',
// // //                 lastHeartbeat: serverTimestamp()
// // //             }, { merge: true }).catch(console.error);
// // //         };
// // //         sendPing();
// // //         heartbeatIntervalRef.current = setInterval(sendPing, 30000);
// // //     };

// // //     const startAiProctoring = () => {
// // //         if (!aiModelsLoaded) {
// // //             setTimeout(() => { if (isReady && !aiModelsLoaded) startAiProctoring(); }, 3000);
// // //             return;
// // //         }
// // //         setIsAiActive(true);

// // //         aiIntervalRef.current = setInterval(async () => {
// // //             const video = pipVideoRef.current;
// // //             if (!video || video.readyState !== 4) return;

// // //             try {
// // //                 const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

// // //                 if (detections.length === 0) {
// // //                     noFaceTimeRef.current += 2;
// // //                     if (noFaceTimeRef.current >= 6) {
// // //                         handleViolation("Face Not Detected: You left the camera frame or covered your face.", "ai");
// // //                         noFaceTimeRef.current = 0;
// // //                     }
// // //                     return;
// // //                 } else {
// // //                     noFaceTimeRef.current = 0;
// // //                 }

// // //                 if (detections.length > 1) {
// // //                     handleViolation("Multiple Faces Detected: Another person entered the camera frame.", "ai");
// // //                     return;
// // //                 }

// // //                 const face = detections[0];
// // //                 const landmarks = face.landmarks;
// // //                 const leftEye = landmarks.getLeftEye();
// // //                 const rightEye = landmarks.getRightEye();
// // //                 const nose = landmarks.getNose();

// // //                 const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
// // //                 const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
// // //                 const eyeMidX = (leftEyeX + rightEyeX) / 2;

// // //                 const horizontalGazeDiff = Math.abs(nose[3].x - eyeMidX);
// // //                 const faceWidth = face.detection.box.width;

// // //                 if (horizontalGazeDiff > (faceWidth * 0.15)) {
// // //                     gazeAwayTimeRef.current += 2;
// // //                     if (gazeAwayTimeRef.current >= 8) {
// // //                         handleViolation("Gaze Tracking Alert: You looked away from the screen for too long.", "ai");
// // //                         gazeAwayTimeRef.current = 0;
// // //                     }
// // //                 } else {
// // //                     gazeAwayTimeRef.current = 0;
// // //                 }
// // //             } catch (err) {
// // //                 console.error("[PROCTOR] AI Inference Error:", err);
// // //             }
// // //         }, 2000);
// // //     };

// // //     const startAudioMonitoring = () => {
// // //         if (!analyserRef.current) return;
// // //         const bufferLength = analyserRef.current.frequencyBinCount;
// // //         const dataArray = new Uint8Array(bufferLength);

// // //         audioIntervalRef.current = setInterval(() => {
// // //             if (!analyserRef.current) return;
// // //             analyserRef.current.getByteFrequencyData(dataArray);

// // //             let sum = 0;
// // //             for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
// // //             const avgVolume = sum / bufferLength;

// // //             if (avgVolume > 40) {
// // //                 handleViolation("Audio Alert: Loud talking or background noise detected.", "audio");
// // //             }
// // //         }, 1000);
// // //     };

// // //     const handleCriticalTermination = async (reason: string) => {
// // //         console.warn("[PROCTOR TERMINATION]", reason);

// // //         const timestampIso = new Date().toISOString();
// // //         const timestampId = Date.now();

// // //         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
// // //         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

// // //         if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
// // //         if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());

// // //         let screenUrl: string | null = null;
// // //         let webcamUrl: string | null = null;
// // //         try {
// // //             const storage = getStorage();
// // //             if (screenFrame) {
// // //                 const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_screen.jpg`);
// // //                 await uploadString(screenRef, screenFrame, 'data_url');
// // //                 screenUrl = await getDownloadURL(screenRef);
// // //             }
// // //             if (webcamFrame) {
// // //                 const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_webcam.jpg`);
// // //                 await uploadString(webcamRef, webcamFrame, 'data_url');
// // //                 webcamUrl = await getDownloadURL(webcamRef);
// // //             }
// // //         } catch (e) {
// // //             console.error("[PROCTOR] Failed uploading termination frames:", e);
// // //         }

// // //         const violationEvent = {
// // //             timestamp: timestampIso,
// // //             reason: reason || "Critical Security Termination",
// // //             imageUrl: webcamUrl || null,
// // //             screenUrl: screenUrl || null
// // //         };

// // //         const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);
// // //         await setDoc(sessionRef, {
// // //             status: 'terminated',
// // //             latestWarning: reason,
// // //             violationCount: increment(1),
// // //             violationHistory: arrayUnion(violationEvent),
// // //             terminatedAt: serverTimestamp()
// // //         }, { merge: true }).catch(console.error);

// // //         try {
// // //             const subQ = query(
// // //                 collection(db, 'learner_submissions'),
// // //                 where('assessmentId', '==', activeAssessmentId),
// // //                 where('authUid', '==', activeLearnerId)
// // //             );
// // //             const subSnap = await getDocs(subQ);
// // //             if (!subSnap.empty) {
// // //                 const subDoc = subSnap.docs[0];
// // //                 await updateDoc(doc(db, 'learner_submissions', subDoc.id), {
// // //                     status: 'missed',
// // //                     systemNote: `Assessment terminated by security proctor: ${reason}`,
// // //                     terminatedAt: timestampIso
// // //                 });
// // //             }
// // //         } catch (e) {
// // //             console.error("[PROCTOR] Failed to update submission status on termination:", e);
// // //         }

// // //         if (document.fullscreenElement) {
// // //             document.exitFullscreen().catch(() => {});
// // //         }

// // //         alert(`ASSESSMENT TERMINATED\n\n${reason}\n\nThis incident has been permanently recorded on the Invigilator Dashboard.`);
// // //         window.location.href = user?.role === 'learner' ? '/learner/dashboard' : '/';
// // //     };

// // //     const handleViolation = async (reason: string, category: 'browser' | 'ai' | 'audio' = 'browser') => {
// // //         const now = Date.now();

// // //         if (category === 'audio') {
// // //             if (now - lastAudioViolationTimeRef.current < 25000) return;
// // //             lastAudioViolationTimeRef.current = now;
// // //         } else if (category === 'ai') {
// // //             if (now - lastAiViolationTimeRef.current < 15000) return;
// // //             lastAiViolationTimeRef.current = now;
// // //         } else {
// // //             if (now - lastBrowserViolationTimeRef.current < 5000) return;
// // //             lastBrowserViolationTimeRef.current = now;
// // //         }

// // //         const timestampIso = new Date().toISOString();
// // //         const timestampId = Date.now();
// // //         const incidentId = `inc_${timestampId}_${Math.random().toString(36).substring(2, 7)}`;

// // //         console.warn(
// // //             `%c[PROCTOR VIOLATION DETECTED]%c ID: ${incidentId} | Category: ${category.toUpperCase()} | Path: live_proctor_sessions/${activeAssessmentId}_${activeLearnerId}\nReason: ${reason}`,
// // //             'color: #ef4444; font-weight: bold; font-size: 12px;',
// // //             'color: inherit;'
// // //         );

// // //         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
// // //         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

// // //         console.log(`[PROCTOR FRAME CAPTURE] [${incidentId}] Screen Frame: ${screenFrame ? 'SUCCESS' : 'FAILED/NULL'} | Webcam Frame: ${webcamFrame ? 'SUCCESS' : 'FAILED/NULL'}`);

// // //         setViolationWarning(reason);
// // //         setViolationCount(prev => prev + 1);

// // //         const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);

// // //         try {
// // //             await setDoc(sessionRef, {
// // //                 assessmentId: activeAssessmentId,
// // //                 learnerId: activeLearnerId,
// // //                 learnerName: user?.fullName || 'Unknown Learner',
// // //                 status: 'violation',
// // //                 violationCount: increment(1),
// // //                 latestWarning: reason,
// // //                 lastHeartbeat: serverTimestamp()
// // //             }, { merge: true });
// // //         } catch (err) {
// // //             console.error(`[PROCTOR ERROR] [${incidentId}] Session summary write failed:`, err);
// // //         }

// // //         (async () => {
// // //             let screenUrl: string | null = null;
// // //             let webcamUrl: string | null = null;

// // //             try {
// // //                 const storage = getStorage();
// // //                 if (screenFrame) {
// // //                     const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_screen.jpg`);
// // //                     await uploadString(screenRef, screenFrame, 'data_url');
// // //                     screenUrl = await getDownloadURL(screenRef);
// // //                 }
// // //                 if (webcamFrame) {
// // //                     const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_webcam.jpg`);
// // //                     await uploadString(webcamRef, webcamFrame, 'data_url');
// // //                     webcamUrl = await getDownloadURL(webcamRef);
// // //                 }
// // //             } catch (e) {
// // //                 console.error(`[PROCTOR ERROR] [${incidentId}] Snapshot upload failed:`, e);
// // //             }

// // //             const violationEvent = {
// // //                 id: incidentId,
// // //                 timestamp: timestampIso,
// // //                 reason: reason || "Unspecified Violation",
// // //                 imageUrl: webcamUrl || null,
// // //                 screenUrl: screenUrl || null
// // //             };

// // //             try {
// // //                 await setDoc(sessionRef, { violationHistory: arrayUnion(violationEvent) }, { merge: true });
// // //             } catch (err) {
// // //                 console.error(`[PROCTOR ERROR] [${incidentId}] History arrayUnion write failed:`, err);
// // //             }
// // //         })();
// // //     };

// // //     const grabFrameFromVideo = (video: HTMLVideoElement | null): string | null => {
// // //         if (!video) return null;
// // //         const width = video.videoWidth || 1280;
// // //         const height = video.videoHeight || 720;

// // //         const canvas = canvasRef.current;
// // //         if (!canvas) return null;
// // //         const context = canvas.getContext('2d');
// // //         if (!context) return null;

// // //         canvas.width = Math.min(width, 1280);
// // //         canvas.height = Math.min(height, 720);

// // //         try {
// // //             context.drawImage(video, 0, 0, canvas.width, canvas.height);
// // //             return canvas.toDataURL('image/jpeg', 0.7);
// // //         } catch (e) {
// // //             console.error("[PROCTOR ERROR] Canvas drawImage failed:", e);
// // //             return null;
// // //         }
// // //     };

// // //     useEffect(() => {
// // //         if (!isProctored || !isReady) return;

// // //         const handleVisibilityChange = () => {
// // //             if (document.hidden && !violationWarningRef.current) {
// // //                 handleViolation("Tab Switching Detected: You navigated away from the assessment tab.", "browser");
// // //             }
// // //         };
// // //         const handleBlur = () => {
// // //             if (!violationWarningRef.current) {
// // //                 handleViolation("Window Focus Lost: You clicked outside the assessment window.", "browser");
// // //             }
// // //         };
// // //         const handleFullscreenChange = () => {
// // //             const docEl = document as any;
// // //             const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement);
// // //             if (!isCurrentlyFullscreen && !violationWarningRef.current) {
// // //                 setIsFullscreen(false);
// // //                 handleViolation("Fullscreen Exited: Assessments must be completed in locked fullscreen mode.", "browser");
// // //             }
// // //         };
// // //         const handleCopyPaste = (e: ClipboardEvent) => {
// // //             e.preventDefault();
// // //             if (!violationWarningRef.current) {
// // //                 handleViolation(`${e.type.charAt(0).toUpperCase() + e.type.slice(1)} Attempt Detected: Clipboard actions are blocked.`, "browser");
// // //             }
// // //         };
// // //         const handleCustomViolation = (e: any) => {
// // //             if (!violationWarningRef.current) {
// // //                 handleViolation(e.detail || "Security violation detected.", "browser");
// // //             }
// // //         };
// // //         const handleContextMenu = (e: Event) => e.preventDefault();
// // //         const handleKeyDown = (e: KeyboardEvent) => {
// // //             if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key)) || e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
// // //                 e.preventDefault();
// // //                 if (!violationWarningRef.current) {
// // //                     handleViolation(`Forbidden keyboard shortcut detected: ${e.key}`, "browser");
// // //                 }
// // //             }
// // //         };

// // //         document.addEventListener('visibilitychange', handleVisibilityChange);
// // //         window.addEventListener('blur', handleBlur);
// // //         document.addEventListener('fullscreenchange', handleFullscreenChange);
// // //         document.addEventListener('contextmenu', handleContextMenu);
// // //         document.addEventListener('proctorViolation', handleCustomViolation);
// // //         document.addEventListener('copy', handleCopyPaste);
// // //         document.addEventListener('cut', handleCopyPaste);
// // //         document.addEventListener('paste', handleCopyPaste);
// // //         document.addEventListener('keydown', handleKeyDown);

// // //         return () => {
// // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // //             window.removeEventListener('blur', handleBlur);
// // //             document.removeEventListener('fullscreenchange', handleFullscreenChange);
// // //             document.removeEventListener('contextmenu', handleContextMenu);
// // //             document.removeEventListener('proctorViolation', handleCustomViolation);
// // //             document.removeEventListener('copy', handleCopyPaste);
// // //             document.removeEventListener('cut', handleCopyPaste);
// // //             document.removeEventListener('paste', handleCopyPaste);
// // //             document.removeEventListener('keydown', handleKeyDown);
// // //         };
// // //     }, [isProctored, isReady]);

// // //     useEffect(() => {
// // //         const handleMouseMove = (e: MouseEvent) => {
// // //             if (!dragRef.current.isDragging) return;
// // //             e.preventDefault();
// // //             const dx = e.clientX - dragRef.current.startX;
// // //             const dy = e.clientY - dragRef.current.startY;
// // //             let newX = dragRef.current.initialX + dx;
// // //             let newY = dragRef.current.initialY + dy;
// // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // //             setPipPos({ x: newX, y: newY });
// // //         };
// // //         const handleTouchMove = (e: TouchEvent) => {
// // //             if (!dragRef.current.isDragging) return;
// // //             e.preventDefault();
// // //             const touch = e.touches[0];
// // //             const dx = touch.clientX - dragRef.current.startX;
// // //             const dy = touch.clientY - dragRef.current.startY;
// // //             let newX = dragRef.current.initialX + dx;
// // //             let newY = dragRef.current.initialY + dy;
// // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // //             setPipPos({ x: newX, y: newY });
// // //         };
// // //         const handleEndDrag = () => { dragRef.current.isDragging = false; };

// // //         window.addEventListener('mousemove', handleMouseMove);
// // //         window.addEventListener('mouseup', handleEndDrag);
// // //         window.addEventListener('touchmove', handleTouchMove, { passive: false });
// // //         window.addEventListener('touchend', handleEndDrag);

// // //         return () => {
// // //             window.removeEventListener('mousemove', handleMouseMove);
// // //             window.removeEventListener('mouseup', handleEndDrag);
// // //             window.removeEventListener('touchmove', handleTouchMove);
// // //             window.removeEventListener('touchend', handleEndDrag);
// // //         };
// // //     }, []);

// // //     const initiateDrag = (clientX: number, clientY: number) => {
// // //         dragRef.current.isDragging = true;
// // //         dragRef.current.startX = clientX;
// // //         dragRef.current.startY = clientY;
// // //         dragRef.current.initialX = pipPos.x;
// // //         dragRef.current.initialY = pipPos.y;
// // //     };

// // //     const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
// // //     const handleTouchStart = (e: React.TouchEvent) => {
// // //         const touch = e.touches[0];
// // //         initiateDrag(touch.clientX, touch.clientY);
// // //     };

// // //     if (!isProctored) return <>{children}</>;

// // //     const portalTarget = typeof document !== 'undefined' ? (document.getElementById('proctor-portal-root') || document.body) : null;

// // //     return (
// // //         <div ref={wrapperRef} className="pw-container">
// // //             <canvas ref={canvasRef} style={{ display: 'none' }} />
            
// // //             <video 
// // //                 ref={setScreenVideoRef} 
// // //                 autoPlay 
// // //                 muted 
// // //                 playsInline 
// // //                 style={{ position: 'absolute', width: '320px', height: '180px', left: '-9999px', opacity: 0, pointerEvents: 'none' }} 
// // //             />

// // //             {isReady && (
// // //                 <div className="pw-content">
// // //                     {children}
// // //                     <div className="pw-pip" style={{ left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }}>
// // //                         <div className="pw-pip-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
// // //                             <div className="pw-pip-title">
// // //                                 {isAiActive ? <ScanFace size={13} className="pw-pulse" /> : <Video size={13} className="pw-pulse" />}
// // //                                 <span>{isAiActive ? 'AI Tracking Active' : 'Live Recording'}</span>
// // //                             </div>
// // //                             <span className="pw-pip-drag-hint">(Drag)</span>
// // //                         </div>
// // //                         <video ref={setPipVideoRef} autoPlay muted playsInline className="pw-pip-video" />
// // //                     </div>
// // //                 </div>
// // //             )}

// // //             {/* 🚀 DEDICATED FIXED FULLSCREEN PORTAL CONTAINER */}
// // //             <div id="proctor-portal-root" style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'none' }} />

// // //             {!isReady && (
// // //                 <div className="lfm-overlay pw-gate-overlay">
// // //                     <div className="lfm-modal pw-gate-card">
// // //                         <div className="lfm-header">
// // //                             <h2 className="lfm-header__title" style={{ color: 'white' }}>
// // //                                 <ShieldAlert size={18} /> Secure AI Environment Setup
// // //                             </h2>
// // //                         </div>

// // //                         <div className="lfm-body pw-gate-body">
// // //                             <div className="pw-gate-intro">
// // //                                 <p>To begin, you must enable AI face tracking AND share your entire screen to prevent external window usage.</p>
// // //                             </div>

// // //                             <div className="lfm-section-hdr">
// // //                                 <ShieldAlert size={13} /> Invigilation Prerequisites
// // //                             </div>

// // //                             <div className="pw-steps">
// // //                                 <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
// // //                                     <div className="pw-step-icon">
// // //                                         {hasCamera ? <CheckCircle size={18} /> : <Camera size={18} />}
// // //                                     </div>
// // //                                     <div className="pw-step-text">
// // //                                         <strong>Webcam & Microphone</strong>
// // //                                         <span>{hasCamera ? 'Connected securely' : 'Required for AI face tracking'}</span>
// // //                                     </div>
// // //                                     {!hasCamera && (
// // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={requestWebcamAccess}>
// // //                                             Allow Access
// // //                                         </button>
// // //                                     )}
// // //                                 </div>

// // //                                 <div className={`pw-step ${aiModelsLoaded ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // //                                     <div className="pw-step-icon">
// // //                                         {aiModelsLoaded ? <CheckCircle size={18} /> : <Loader2 className="lfm-spin" size={18} />}
// // //                                     </div>
// // //                                     <div className="pw-step-text">
// // //                                         <strong>AI Proctoring Engine</strong>
// // //                                         <span>{aiModelsLoaded ? 'Models Loaded & Verified' : 'Downloading neural weights...'}</span>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div className={`pw-step ${hasScreen ? 'pw-step--done' : screenError ? 'pw-step--error' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // //                                     <div className="pw-step-icon">
// // //                                         {hasScreen ? <CheckCircle size={18} /> : screenError ? <AlertCircle size={18} /> : <Monitor size={18} />}
// // //                                     </div>
// // //                                     <div className="pw-step-text" style={{ flex: 1 }}>
// // //                                         <strong>Screen Share (Entire Screen Only)</strong>
// // //                                         <span>{hasScreen ? 'Entire Screen Shared' : screenError ? screenError : 'Select "Entire Screen" in browser prompt'}</span>
// // //                                     </div>
// // //                                     {hasCamera && !hasScreen && (
// // //                                         <button 
// // //                                             className={`lfm-btn pw-btn-small ${screenError ? 'pw-btn-danger' : 'lfm-btn--primary'}`} 
// // //                                             style={{ background: screenError ? 'var(--mlab-red)' : undefined }}
// // //                                             onClick={requestScreenAccess}
// // //                                         >
// // //                                             {screenError ? 'Retry Screen Share' : 'Share Screen'}
// // //                                         </button>
// // //                                     )}
// // //                                 </div>

// // //                                 <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera || !hasScreen || !aiModelsLoaded ? 'pw-step--disabled' : ''}`}>
// // //                                     <div className="pw-step-icon">
// // //                                         {isFullscreen ? <CheckCircle size={18} /> : <Maximize size={18} />}
// // //                                     </div>
// // //                                     <div className="pw-step-text">
// // //                                         <strong>Fullscreen Mode</strong>
// // //                                         <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
// // //                                     </div>
// // //                                     {hasCamera && hasScreen && aiModelsLoaded && !isFullscreen && (
// // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={enterFullscreen}>
// // //                                             Enter Fullscreen
// // //                                         </button>
// // //                                     )}
// // //                                 </div>
// // //                             </div>

// // //                             <video ref={gateVideoRef} autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }} />
// // //                         </div>
// // //                     </div>
// // //                 </div>
// // //             )}

// // //             {violationWarning && portalTarget && createPortal(
// // //                 <div className="lfm-overlay pw-violation-overlay" style={{ pointerEvents: 'auto' }}>
// // //                     <div className="lfm-modal pw-violation-card">
// // //                         <div className="lfm-header pw-violation-header">
// // //                             <h2 className="lfm-header__title">
// // //                                 <MonitorX size={18} /> Security Violation Detected
// // //                             </h2>
// // //                         </div>
// // //                         <div className="lfm-body pw-violation-body">
// // //                             <div className="lfm-error-banner">
// // //                                 <AlertCircle size={18} />
// // //                                 <span>{violationWarning}</span>
// // //                             </div>

// // //                             <div className="pw-violation-stats">
// // //                                 <span>Total Violations Logged: <strong>{violationCount}</strong></span>
// // //                             </div>

// // //                             <p className="pw-violation-sub">
// // //                                 A screenshot of your entire screen and webcam has been captured and sent to the invigilator dashboard.
// // //                             </p>

// // //                             <button
// // //                                 className="lfm-btn pw-btn-danger"
// // //                                 onClick={() => {
// // //                                     setViolationWarning(null);
// // //                                     setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), { status: 'active', latestWarning: null }, { merge: true });
// // //                                     if (!document.fullscreenElement) enterFullscreen();
// // //                                 }}
// // //                             >
// // //                                 I Understand, Return to Assessment
// // //                             </button>
// // //                         </div>
// // //                     </div>
// // //                 </div>,
// // //                 portalTarget
// // //             )}
// // //         </div>
// // //     );
// // // };


// // // // import React, { useState, useEffect, useRef, useCallback } from 'react';
// // // // import { Camera, Maximize, MonitorX, ShieldAlert, CheckCircle, Video, ScanFace, Loader2, AlertCircle, Monitor } from 'lucide-react';
// // // // import { createPortal } from 'react-dom';
// // // // import { doc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
// // // // import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
// // // // import { db } from '../../../lib/firebase';
// // // // import { useStore } from '../../../store/useStore';
// // // // import { useToast } from '../Toast/Toast';
// // // // import * as faceapi from 'face-api.js';
// // // // import './ProctoringWrapper.css';

// // // // interface ProctoringWrapperProps {
// // // //     children: React.ReactNode;
// // // //     assessmentId: string;
// // // //     learnerId: string;
// // // //     isProctored: boolean;
// // // // }

// // // // export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
// // // //     const { user } = useStore();
// // // //     const toast = useToast();

// // // //     // Safe fallback IDs to guarantee valid Firestore document paths
// // // //     const activeAssessmentId = assessmentId || 'unassigned_assessment';
// // // //     const activeLearnerId = learnerId || user?.uid || 'unassigned_learner';

// // // //     const [isReady, setIsReady] = useState(!isProctored);
// // // //     const [hasCamera, setHasCamera] = useState(false);
// // // //     const [hasScreen, setHasScreen] = useState(false);
// // // //     const [screenError, setScreenError] = useState<string | null>(null);
// // // //     const [isFullscreen, setIsFullscreen] = useState(false);
// // // //     const [violationWarning, setViolationWarning] = useState<string | null>(null);
// // // //     const [violationCount, setViolationCount] = useState(0);

// // // //     const violationWarningRef = useRef<string | null>(null);
// // // //     useEffect(() => {
// // // //         violationWarningRef.current = violationWarning;
// // // //     }, [violationWarning]);

// // // //     // AI STATE
// // // //     const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
// // // //     const [isAiActive, setIsAiActive] = useState(false);

// // // //     // DRAGGABLE PIP STATE
// // // //     const [pipPos, setPipPos] = useState(() => ({
// // // //         x: typeof window !== 'undefined' ? window.innerWidth - 240 : 0,
// // // //         y: typeof window !== 'undefined' ? window.innerHeight - 190 : 0
// // // //     }));
// // // //     const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

// // // //     const gateVideoRef = useRef<HTMLVideoElement | null>(null);
// // // //     const pipVideoRef = useRef<HTMLVideoElement | null>(null);
// // // //     const screenVideoRef = useRef<HTMLVideoElement | null>(null);

// // // //     const streamRef = useRef<MediaStream | null>(null);
// // // //     const screenStreamRef = useRef<MediaStream | null>(null);

// // // //     const audioContextRef = useRef<AudioContext | null>(null);
// // // //     const analyserRef = useRef<AnalyserNode | null>(null);

// // // //     const wrapperRef = useRef<HTMLDivElement>(null);
// // // //     const canvasRef = useRef<HTMLCanvasElement>(null);
// // // //     const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // // //     const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // // //     const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

// // // //     // 🚀 CATEGORY-BASED THROTTLING TIMERS
// // // //     const lastBrowserViolationTimeRef = useRef<number>(0);
// // // //     const lastAiViolationTimeRef = useRef<number>(0);
// // // //     const lastAudioViolationTimeRef = useRef<number>(0);

// // // //     const gazeAwayTimeRef = useRef<number>(0);
// // // //     const noFaceTimeRef = useRef<number>(0);

// // // //     // Callback refs for instant video stream binding upon React DOM mounting
// // // //     const setPipVideoRef = useCallback((node: HTMLVideoElement | null) => {
// // // //         pipVideoRef.current = node;
// // // //         if (node && streamRef.current) {
// // // //             node.srcObject = streamRef.current;
// // // //             node.play().catch(e => console.warn("PiP video play failed:", e));
// // // //         }
// // // //     }, []);

// // // //     const setScreenVideoRef = useCallback((node: HTMLVideoElement | null) => {
// // // //         screenVideoRef.current = node;
// // // //         if (node && screenStreamRef.current) {
// // // //             node.srcObject = screenStreamRef.current;
// // // //             node.play().catch(e => console.warn("Screen video play failed:", e));
// // // //         }
// // // //     }, []);

// // // //     // ─── 1. LOAD AI MODELS FROM CDN ──────────────────────────────────────────
// // // //     useEffect(() => {
// // // //         if (!isProctored) return;
// // // //         let isMounted = true;

// // // //         const loadModels = async () => {
// // // //             const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
// // // //             try {
// // // //                 await Promise.all([
// // // //                     faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
// // // //                     faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
// // // //                 ]);
// // // //                 if (isMounted) setAiModelsLoaded(true);
// // // //             } catch (err) {
// // // //                 console.error("[PROCTOR] Failed to load AI models from CDN:", err);
// // // //                 if (isMounted) {
// // // //                     toast.warning("AI face models failed to load. Standard video and screen monitoring remain active.");
// // // //                 }
// // // //             }
// // // //         };
// // // //         loadModels();

// // // //         return () => { isMounted = false; };
// // // //     }, [isProctored]);

// // // //     // ─── 2. WEBCAM & MIC ACCESS ──────────────────────────────────────────────
// // // //     const requestWebcamAccess = async () => {
// // // //         try {
// // // //             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
// // // //             streamRef.current = stream;
// // // //             if (gateVideoRef.current) {
// // // //                 gateVideoRef.current.srcObject = stream;
// // // //                 gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
// // // //             }
// // // //             if (pipVideoRef.current) {
// // // //                 pipVideoRef.current.srcObject = stream;
// // // //                 pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
// // // //             }
// // // //             setHasCamera(true);

// // // //             const audioContext = new AudioContext();
// // // //             const source = audioContext.createMediaStreamSource(stream);
// // // //             const analyser = audioContext.createAnalyser();
// // // //             analyser.fftSize = 256;
// // // //             source.connect(analyser);
// // // //             audioContextRef.current = audioContext;
// // // //             analyserRef.current = analyser;

// // // //             toast.success("Webcam and Microphone connected securely.");
// // // //         } catch (err: any) {
// // // //             console.error("[PROCTOR] Webcam access error:", err);
// // // //             toast.error("Permission Denied: You must allow Webcam and Microphone access.");
// // // //         }
// // // //     };

// // // //     // ─── 3. ENFORCE "ENTIRE SCREEN" SHARE & HANDLE NATIVE "STOP SHARING" ──────
// // // //     const requestScreenAccess = async () => {
// // // //         setScreenError(null);
// // // //         try {
// // // //             const screenStream = await navigator.mediaDevices.getDisplayMedia({
// // // //                 video: true,
// // // //                 // systemAudio: 'exclude'
// // // //             });

// // // //             const videoTrack = screenStream.getVideoTracks()[0];
// // // //             const settings = videoTrack.getSettings() as any;
// // // //             const displaySurface = settings.displaySurface;

// // // //             if (displaySurface && displaySurface !== 'monitor') {
// // // //                 screenStream.getTracks().forEach(track => track.stop());
// // // //                 const errMessage = "Selection Error: You selected a Tab or Window. You MUST select 'Entire Screen'.";
// // // //                 setScreenError(errMessage);
// // // //                 toast.error(errMessage);
// // // //                 setHasScreen(false);
// // // //                 return;
// // // //             }

// // // //             screenStreamRef.current = screenStream;
// // // //             if (screenVideoRef.current) {
// // // //                 screenVideoRef.current.srcObject = screenStream;
// // // //                 screenVideoRef.current.play().catch(e => console.warn("Screen video play failed:", e));
// // // //             }
// // // //             setHasScreen(true);
// // // //             setScreenError(null);

// // // //             videoTrack.onended = async () => {
// // // //                 console.warn("[PROCTOR BREACH] Native 'Stop sharing' button clicked by learner.");
// // // //                 await handleCriticalTermination("CRITICAL SECURITY BREACH: You clicked 'Stop sharing'. Screen sharing is mandatory throughout the assessment. The assessment has been terminated.");
// // // //             };

// // // //             toast.success("Entire Screen shared successfully.");
// // // //         } catch (err: any) {
// // // //             console.error("[PROCTOR] Screen access error:", err);
// // // //             const errMsg = "Screen Share Cancelled: You must grant Entire Screen permission to proceed.";
// // // //             setScreenError(errMsg);
// // // //             toast.error(errMsg);
// // // //         }
// // // //     };

// // // //     useEffect(() => {
// // // //         return () => {
// // // //             if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
// // // //             if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
// // // //             if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
// // // //             if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
// // // //             if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
// // // //             if (audioContextRef.current) audioContextRef.current.close();

// // // //             if (isProctored && activeAssessmentId && activeLearnerId) {
// // // //                 setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
// // // //                     status: 'offline', lastHeartbeat: serverTimestamp()
// // // //                 }, { merge: true }).catch(console.error);
// // // //             }
// // // //         };
// // // //     }, [isProctored, activeAssessmentId, activeLearnerId]);

// // // //     // ─── 4. FULLSCREEN MODE ──────────────────────────────────────────────────
// // // //     const enterFullscreen = async () => {
// // // //         if (!wrapperRef.current) return;
// // // //         try {
// // // //             if (wrapperRef.current.requestFullscreen) await wrapperRef.current.requestFullscreen();
// // // //             setIsFullscreen(true);
// // // //             setIsReady(true);
// // // //             startLightweightHeartbeat();
// // // //             startAiProctoring();
// // // //             startAudioMonitoring();
// // // //         } catch (err) {
// // // //             toast.error("Failed to enter fullscreen mode.");
// // // //         }
// // // //     };

// // // //     // ─── 5. HEARTBEAT ────────────────────────────────────────────────────────
// // // //     const startLightweightHeartbeat = () => {
// // // //         const sendPing = () => {
// // // //             if (!activeAssessmentId || !activeLearnerId) return;
// // // //             setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), {
// // // //                 assessmentId: activeAssessmentId,
// // // //                 learnerId: activeLearnerId,
// // // //                 learnerName: user?.fullName || 'Unknown Learner',
// // // //                 status: 'active',
// // // //                 lastHeartbeat: serverTimestamp()
// // // //             }, { merge: true }).catch(console.error);
// // // //         };
// // // //         sendPing();
// // // //         heartbeatIntervalRef.current = setInterval(sendPing, 30000);
// // // //     };

// // // //     // ─── 6. AI GAZE & FACE DETECTION LOOP ────────────────────────────────────
// // // //     const startAiProctoring = () => {
// // // //         if (!aiModelsLoaded) {
// // // //             setTimeout(() => { if (isReady && !aiModelsLoaded) startAiProctoring(); }, 3000);
// // // //             return;
// // // //         }
// // // //         setIsAiActive(true);

// // // //         aiIntervalRef.current = setInterval(async () => {
// // // //             const video = pipVideoRef.current;
// // // //             if (!video || video.readyState !== 4) return;

// // // //             try {
// // // //                 const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

// // // //                 if (detections.length === 0) {
// // // //                     noFaceTimeRef.current += 2;
// // // //                     if (noFaceTimeRef.current >= 6) {
// // // //                         handleViolation("Face Not Detected: You left the camera frame or covered your face.", "ai");
// // // //                         noFaceTimeRef.current = 0;
// // // //                     }
// // // //                     return;
// // // //                 } else {
// // // //                     noFaceTimeRef.current = 0;
// // // //                 }

// // // //                 if (detections.length > 1) {
// // // //                     handleViolation("Multiple Faces Detected: Another person entered the camera frame.", "ai");
// // // //                     return;
// // // //                 }

// // // //                 const face = detections[0];
// // // //                 const landmarks = face.landmarks;
// // // //                 const leftEye = landmarks.getLeftEye();
// // // //                 const rightEye = landmarks.getRightEye();
// // // //                 const nose = landmarks.getNose();

// // // //                 const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
// // // //                 const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
// // // //                 const eyeMidX = (leftEyeX + rightEyeX) / 2;

// // // //                 const horizontalGazeDiff = Math.abs(nose[3].x - eyeMidX);
// // // //                 const faceWidth = face.detection.box.width;

// // // //                 if (horizontalGazeDiff > (faceWidth * 0.15)) {
// // // //                     gazeAwayTimeRef.current += 2;
// // // //                     if (gazeAwayTimeRef.current >= 8) {
// // // //                         handleViolation("Gaze Tracking Alert: You looked away from the screen for too long.", "ai");
// // // //                         gazeAwayTimeRef.current = 0;
// // // //                     }
// // // //                 } else {
// // // //                     gazeAwayTimeRef.current = 0;
// // // //                 }
// // // //             } catch (err) {
// // // //                 console.error("[PROCTOR] AI Inference Error:", err);
// // // //             }
// // // //         }, 2000);
// // // //     };

// // // //     // ─── 7. AUDIO MONITORING LOOP ────────────────────────────────────────────
// // // //     const startAudioMonitoring = () => {
// // // //         if (!analyserRef.current) return;
// // // //         const bufferLength = analyserRef.current.frequencyBinCount;
// // // //         const dataArray = new Uint8Array(bufferLength);

// // // //         audioIntervalRef.current = setInterval(() => {
// // // //             if (!analyserRef.current) return;
// // // //             analyserRef.current.getByteFrequencyData(dataArray);

// // // //             let sum = 0;
// // // //             for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
// // // //             const avgVolume = sum / bufferLength;

// // // //             if (avgVolume > 40) {
// // // //                 handleViolation("Audio Alert: Loud talking or background noise detected.", "audio");
// // // //             }
// // // //         }, 1000);
// // // //     };

// // // //     // ─── 8. CRITICAL TERMINATION ──────────────────────────────────────────────
// // // //     const handleCriticalTermination = async (reason: string) => {
// // // //         console.warn("[PROCTOR TERMINATION]", reason);

// // // //         const timestampIso = new Date().toISOString();
// // // //         const timestampId = Date.now();

// // // //         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
// // // //         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

// // // //         if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
// // // //         if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());

// // // //         let screenUrl: string | null = null;
// // // //         let webcamUrl: string | null = null;
// // // //         try {
// // // //             const storage = getStorage();
// // // //             if (screenFrame) {
// // // //                 const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_screen.jpg`);
// // // //                 await uploadString(screenRef, screenFrame, 'data_url');
// // // //                 screenUrl = await getDownloadURL(screenRef);
// // // //             }
// // // //             if (webcamFrame) {
// // // //                 const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${timestampId}_terminated_webcam.jpg`);
// // // //                 await uploadString(webcamRef, webcamFrame, 'data_url');
// // // //                 webcamUrl = await getDownloadURL(webcamRef);
// // // //             }
// // // //         } catch (e) {
// // // //             console.error("[PROCTOR] Failed uploading termination frames:", e);
// // // //         }

// // // //         const violationEvent = {
// // // //             timestamp: timestampIso,
// // // //             reason: reason || "Critical Security Termination",
// // // //             imageUrl: webcamUrl || null,
// // // //             screenUrl: screenUrl || null
// // // //         };

// // // //         const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);
// // // //         await setDoc(sessionRef, {
// // // //             status: 'terminated',
// // // //             latestWarning: reason,
// // // //             violationCount: increment(1),
// // // //             violationHistory: arrayUnion(violationEvent),
// // // //             terminatedAt: serverTimestamp()
// // // //         }, { merge: true }).catch(console.error);

// // // //         try {
// // // //             const subQ = query(
// // // //                 collection(db, 'learner_submissions'),
// // // //                 where('assessmentId', '==', activeAssessmentId),
// // // //                 where('authUid', '==', activeLearnerId)
// // // //             );
// // // //             const subSnap = await getDocs(subQ);
// // // //             if (!subSnap.empty) {
// // // //                 const subDoc = subSnap.docs[0];
// // // //                 await updateDoc(doc(db, 'learner_submissions', subDoc.id), {
// // // //                     status: 'missed',
// // // //                     systemNote: `Assessment terminated by security proctor: ${reason}`,
// // // //                     terminatedAt: timestampIso
// // // //                 });
// // // //             }
// // // //         } catch (e) {
// // // //             console.error("[PROCTOR] Failed to update submission status on termination:", e);
// // // //         }

// // // //         if (document.fullscreenElement) {
// // // //             document.exitFullscreen().catch(() => {});
// // // //         }

// // // //         alert(`ASSESSMENT TERMINATED\n\n${reason}\n\nThis incident has been permanently recorded on the Invigilator Dashboard.`);
// // // //         window.location.href = user?.role === 'learner' ? '/learner/dashboard' : '/';
// // // //     };

// // // // // ─── 9. HANDLE VIOLATION & LOGGING (WITH CONSOLE LOG AUDITING) ───────────
// // // //     const handleViolation = async (reason: string, category: 'browser' | 'ai' | 'audio' = 'browser') => {
// // // //         const now = Date.now();

// // // //         // Category-specific throttling
// // // //         if (category === 'audio') {
// // // //             if (now - lastAudioViolationTimeRef.current < 25000) return;
// // // //             lastAudioViolationTimeRef.current = now;
// // // //         } else if (category === 'ai') {
// // // //             if (now - lastAiViolationTimeRef.current < 15000) return;
// // // //             lastAiViolationTimeRef.current = now;
// // // //         } else {
// // // //             if (now - lastBrowserViolationTimeRef.current < 5000) return;
// // // //             lastBrowserViolationTimeRef.current = now;
// // // //         }

// // // //         // 🚀 GENERATE UNIQUE INCIDENT ID
// // // //         const timestampIso = new Date().toISOString();
// // // //         const timestampId = Date.now();
// // // //         const incidentId = `inc_${timestampId}_${Math.random().toString(36).substring(2, 7)}`;

// // // //         // 🔴 CONSOLE LOG: VIOLATION TRIGGERED WITH ID
// // // //         console.warn(
// // // //             `%c[PROCTOR VIOLATION DETECTED]%c ID: ${incidentId} | Category: ${category.toUpperCase()} | Path: live_proctor_sessions/${activeAssessmentId}_${activeLearnerId}\nReason: ${reason}`,
// // // //             'color: #ef4444; font-weight: bold; font-size: 12px;',
// // // //             'color: inherit;'
// // // //         );

// // // //         // Instant frame capture before browser throttling
// // // //         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
// // // //         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

// // // //         // 🔴 CONSOLE LOG: CAPTURED RAW FRAMES
// // // //         console.log(`[PROCTOR FRAME CAPTURE] [${incidentId}] Screen Frame: ${screenFrame ? 'SUCCESS' : 'FAILED/NULL'} | Webcam Frame: ${webcamFrame ? 'SUCCESS' : 'FAILED/NULL'}`);

// // // //         setViolationWarning(reason);
// // // //         setViolationCount(prev => prev + 1);

// // // //         const sessionRef = doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`);

// // // //         // Update overall session status summary
// // // //         try {
// // // //             await setDoc(sessionRef, {
// // // //                 assessmentId: activeAssessmentId,
// // // //                 learnerId: activeLearnerId,
// // // //                 learnerName: user?.fullName || 'Unknown Learner',
// // // //                 status: 'violation',
// // // //                 violationCount: increment(1),
// // // //                 latestWarning: reason,
// // // //                 lastHeartbeat: serverTimestamp()
// // // //             }, { merge: true });
// // // //             console.log(`[PROCTOR SUMMARY UPDATED] [${incidentId}] Session status set to 'violation' in Firestore.`);
// // // //         } catch (err) {
// // // //             console.error(`[PROCTOR ERROR] [${incidentId}] Session summary write failed:`, err);
// // // //         }

// // // //         // Upload evidence snapshots and append incident event to violationHistory
// // // //         (async () => {
// // // //             let screenUrl: string | null = null;
// // // //             let webcamUrl: string | null = null;

// // // //             try {
// // // //                 const storage = getStorage();
// // // //                 if (screenFrame) {
// // // //                     const screenRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_screen.jpg`);
// // // //                     await uploadString(screenRef, screenFrame, 'data_url');
// // // //                     screenUrl = await getDownloadURL(screenRef);
                    
// // // //                     // 🔴 CONSOLE LOG: SCREENSHOT URL
// // // //                     console.log(`[PROCTOR EVIDENCE SCREENSHOT] [${incidentId}] Storage URL:`, screenUrl);
// // // //                 }
// // // //                 if (webcamFrame) {
// // // //                     const webcamRef = fbStorageRef(storage, `proctoring/violations/${activeAssessmentId}/${activeLearnerId}_${incidentId}_webcam.jpg`);
// // // //                     await uploadString(webcamRef, webcamFrame, 'data_url');
// // // //                     webcamUrl = await getDownloadURL(webcamRef);

// // // //                     // 🔴 CONSOLE LOG: WEBCAM URL
// // // //                     console.log(`[PROCTOR EVIDENCE WEBCAM] [${incidentId}] Storage URL:`, webcamUrl);
// // // //                 }
// // // //             } catch (e) {
// // // //                 console.error(`[PROCTOR ERROR] [${incidentId}] Snapshot upload failed:`, e);
// // // //             }

// // // //             // Guaranteed non-undefined violation payload with Incident ID
// // // //             const violationEvent = {
// // // //                 id: incidentId,
// // // //                 timestamp: timestampIso,
// // // //                 reason: reason || "Unspecified Violation",
// // // //                 imageUrl: webcamUrl || null,
// // // //                 screenUrl: screenUrl || null
// // // //             };

// // // //             try {
// // // //                 await setDoc(sessionRef, { violationHistory: arrayUnion(violationEvent) }, { merge: true });
                
// // // //                 // 🔴 CONSOLE LOG: FINAL FIRESTORE WRITE SUCCESS
// // // //                 console.log(`%c[PROCTOR FIRESTORE SUCCESS]%c Incident [${incidentId}] successfully appended to violationHistory array.`, 'color: #22c55e; font-weight: bold;', 'color: inherit;');
// // // //             } catch (err) {
// // // //                 console.error(`[PROCTOR ERROR] [${incidentId}] History arrayUnion write failed:`, err);
// // // //             }
// // // //         })();
// // // //     };

// // // //     // 🚀 ROBUST FRAME GRABBER WITH DIMENSION FALLBACKS
// // // //     const grabFrameFromVideo = (video: HTMLVideoElement | null): string | null => {
// // // //         if (!video) return null;
// // // //         const width = video.videoWidth || 1280;
// // // //         const height = video.videoHeight || 720;

// // // //         const canvas = canvasRef.current;
// // // //         if (!canvas) return null;
// // // //         const context = canvas.getContext('2d');
// // // //         if (!context) return null;

// // // //         canvas.width = Math.min(width, 1280);
// // // //         canvas.height = Math.min(height, 720);

// // // //         try {
// // // //             context.drawImage(video, 0, 0, canvas.width, canvas.height);
// // // //             return canvas.toDataURL('image/jpeg', 0.7);
// // // //         } catch (e) {
// // // //             console.error("[PROCTOR ERROR] Canvas drawImage failed:", e);
// // // //             return null;
// // // //         }
// // // //     };

// // // //     // ─── 10. EVENT LISTENERS (USES REF TO AVOID STALE CLOSURES) ───────────────
// // // //     useEffect(() => {
// // // //         if (!isProctored || !isReady) return;

// // // //         const handleVisibilityChange = () => {
// // // //             if (document.hidden && !violationWarningRef.current) {
// // // //                 handleViolation("Tab Switching Detected: You navigated away from the assessment tab.", "browser");
// // // //             }
// // // //         };
// // // //         const handleBlur = () => {
// // // //             if (!violationWarningRef.current) {
// // // //                 handleViolation("Window Focus Lost: You clicked outside the assessment window.", "browser");
// // // //             }
// // // //         };
// // // //         const handleFullscreenChange = () => {
// // // //             const docEl = document as any;
// // // //             const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement);
// // // //             if (!isCurrentlyFullscreen && !violationWarningRef.current) {
// // // //                 setIsFullscreen(false);
// // // //                 handleViolation("Fullscreen Exited: Assessments must be completed in locked fullscreen mode.", "browser");
// // // //             }
// // // //         };
// // // //         const handleCopyPaste = (e: ClipboardEvent) => {
// // // //             e.preventDefault();
// // // //             if (!violationWarningRef.current) {
// // // //                 handleViolation(`${e.type.charAt(0).toUpperCase() + e.type.slice(1)} Attempt Detected: Clipboard actions are blocked.`, "browser");
// // // //             }
// // // //         };
// // // //         const handleCustomViolation = (e: any) => {
// // // //             if (!violationWarningRef.current) {
// // // //                 handleViolation(e.detail || "Security violation detected.", "browser");
// // // //             }
// // // //         };
// // // //         const handleContextMenu = (e: Event) => e.preventDefault();
// // // //         const handleKeyDown = (e: KeyboardEvent) => {
// // // //             if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key)) || e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
// // // //                 e.preventDefault();
// // // //                 if (!violationWarningRef.current) {
// // // //                     handleViolation(`Forbidden keyboard shortcut detected: ${e.key}`, "browser");
// // // //                 }
// // // //             }
// // // //         };

// // // //         document.addEventListener('visibilitychange', handleVisibilityChange);
// // // //         window.addEventListener('blur', handleBlur);
// // // //         document.addEventListener('fullscreenchange', handleFullscreenChange);
// // // //         document.addEventListener('contextmenu', handleContextMenu);
// // // //         document.addEventListener('proctorViolation', handleCustomViolation);
// // // //         document.addEventListener('copy', handleCopyPaste);
// // // //         document.addEventListener('cut', handleCopyPaste);
// // // //         document.addEventListener('paste', handleCopyPaste);
// // // //         document.addEventListener('keydown', handleKeyDown);

// // // //         return () => {
// // // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // // //             window.removeEventListener('blur', handleBlur);
// // // //             document.removeEventListener('fullscreenchange', handleFullscreenChange);
// // // //             document.removeEventListener('contextmenu', handleContextMenu);
// // // //             document.removeEventListener('proctorViolation', handleCustomViolation);
// // // //             document.removeEventListener('copy', handleCopyPaste);
// // // //             document.removeEventListener('cut', handleCopyPaste);
// // // //             document.removeEventListener('paste', handleCopyPaste);
// // // //             document.removeEventListener('keydown', handleKeyDown);
// // // //         };
// // // //     }, [isProctored, isReady]);

// // // //     // ─── 11. DRAGGABLE PIP LOGIC ─────────────────────────────────────────────
// // // //     useEffect(() => {
// // // //         const handleMouseMove = (e: MouseEvent) => {
// // // //             if (!dragRef.current.isDragging) return;
// // // //             e.preventDefault();
// // // //             const dx = e.clientX - dragRef.current.startX;
// // // //             const dy = e.clientY - dragRef.current.startY;
// // // //             let newX = dragRef.current.initialX + dx;
// // // //             let newY = dragRef.current.initialY + dy;
// // // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // // //             setPipPos({ x: newX, y: newY });
// // // //         };
// // // //         const handleTouchMove = (e: TouchEvent) => {
// // // //             if (!dragRef.current.isDragging) return;
// // // //             e.preventDefault();
// // // //             const touch = e.touches[0];
// // // //             const dx = touch.clientX - dragRef.current.startX;
// // // //             const dy = touch.clientY - dragRef.current.startY;
// // // //             let newX = dragRef.current.initialX + dx;
// // // //             let newY = dragRef.current.initialY + dy;
// // // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // // //             setPipPos({ x: newX, y: newY });
// // // //         };
// // // //         const handleEndDrag = () => { dragRef.current.isDragging = false; };

// // // //         window.addEventListener('mousemove', handleMouseMove);
// // // //         window.addEventListener('mouseup', handleEndDrag);
// // // //         window.addEventListener('touchmove', handleTouchMove, { passive: false });
// // // //         window.addEventListener('touchend', handleEndDrag);

// // // //         return () => {
// // // //             window.removeEventListener('mousemove', handleMouseMove);
// // // //             window.removeEventListener('mouseup', handleEndDrag);
// // // //             window.removeEventListener('touchmove', handleTouchMove);
// // // //             window.removeEventListener('touchend', handleEndDrag);
// // // //         };
// // // //     }, []);

// // // //     const initiateDrag = (clientX: number, clientY: number) => {
// // // //         dragRef.current.isDragging = true;
// // // //         dragRef.current.startX = clientX;
// // // //         dragRef.current.startY = clientY;
// // // //         dragRef.current.initialX = pipPos.x;
// // // //         dragRef.current.initialY = pipPos.y;
// // // //     };

// // // //     const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
// // // //     const handleTouchStart = (e: React.TouchEvent) => {
// // // //         const touch = e.touches[0];
// // // //         initiateDrag(touch.clientX, touch.clientY);
// // // //     };

// // // //     // ─── RENDER ──────────────────────────────────────────────────────────────
// // // //     if (!isProctored) return <>{children}</>;

// // // //     return (
// // // //         <div ref={wrapperRef} className="pw-container">
// // // //             <canvas ref={canvasRef} style={{ display: 'none' }} />
            
// // // //             {/* Hidden screen video element mapped to the callback ref */}
// // // //             <video 
// // // //                 ref={setScreenVideoRef} 
// // // //                 autoPlay 
// // // //                 muted 
// // // //                 playsInline 
// // // //                 style={{ position: 'absolute', width: '320px', height: '180px', left: '-9999px', opacity: 0, pointerEvents: 'none' }} 
// // // //             />

// // // //             {!isReady && (
// // // //                 <div className="lfm-overlay pw-gate-overlay">
// // // //                     <div className="lfm-modal pw-gate-card">
// // // //                         <div className="lfm-header">
// // // //                             <h2 className="lfm-header__title" style={{ color: 'white' }}>
// // // //                                 <ShieldAlert size={18} /> Secure AI Environment Setup
// // // //                             </h2>
// // // //                         </div>

// // // //                         <div className="lfm-body pw-gate-body">
// // // //                             <div className="pw-gate-intro">
// // // //                                 <p>To begin, you must enable AI face tracking AND share your entire screen to prevent external window usage.</p>
// // // //                             </div>

// // // //                             <div className="lfm-section-hdr">
// // // //                                 <ShieldAlert size={13} /> Invigilation Prerequisites
// // // //                             </div>

// // // //                             <div className="pw-steps">
// // // //                                 {/* STEP 1: WEBCAM */}
// // // //                                 <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
// // // //                                     <div className="pw-step-icon">
// // // //                                         {hasCamera ? <CheckCircle size={18} /> : <Camera size={18} />}
// // // //                                     </div>
// // // //                                     <div className="pw-step-text">
// // // //                                         <strong>Webcam & Microphone</strong>
// // // //                                         <span>{hasCamera ? 'Connected securely' : 'Required for AI face tracking'}</span>
// // // //                                     </div>
// // // //                                     {!hasCamera && (
// // // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={requestWebcamAccess}>
// // // //                                             Allow Access
// // // //                                         </button>
// // // //                                     )}
// // // //                                 </div>

// // // //                                 {/* STEP 2: AI ENGINE LOADER */}
// // // //                                 <div className={`pw-step ${aiModelsLoaded ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // //                                     <div className="pw-step-icon">
// // // //                                         {aiModelsLoaded ? <CheckCircle size={18} /> : <Loader2 className="lfm-spin" size={18} />}
// // // //                                     </div>
// // // //                                     <div className="pw-step-text">
// // // //                                         <strong>AI Proctoring Engine</strong>
// // // //                                         <span>{aiModelsLoaded ? 'Models Loaded & Verified' : 'Downloading neural weights...'}</span>
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 {/* STEP 3: SCREEN SHARE */}
// // // //                                 <div className={`pw-step ${hasScreen ? 'pw-step--done' : screenError ? 'pw-step--error' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // //                                     <div className="pw-step-icon">
// // // //                                         {hasScreen ? <CheckCircle size={18} /> : screenError ? <AlertCircle size={18} /> : <Monitor size={18} />}
// // // //                                     </div>
// // // //                                     <div className="pw-step-text" style={{ flex: 1 }}>
// // // //                                         <strong>Screen Share (Entire Screen Only)</strong>
// // // //                                         <span>{hasScreen ? 'Entire Screen Shared' : screenError ? screenError : 'Select "Entire Screen" in browser prompt'}</span>
// // // //                                     </div>
// // // //                                     {hasCamera && !hasScreen && (
// // // //                                         <button 
// // // //                                             className={`lfm-btn pw-btn-small ${screenError ? 'pw-btn-danger' : 'lfm-btn--primary'}`} 
// // // //                                             style={{ background: screenError ? 'var(--mlab-red)' : undefined }}
// // // //                                             onClick={requestScreenAccess}
// // // //                                         >
// // // //                                             {screenError ? 'Retry Screen Share' : 'Share Screen'}
// // // //                                         </button>
// // // //                                     )}
// // // //                                 </div>

// // // //                                 {/* STEP 4: FULLSCREEN MODE */}
// // // //                                 <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera || !hasScreen || !aiModelsLoaded ? 'pw-step--disabled' : ''}`}>
// // // //                                     <div className="pw-step-icon">
// // // //                                         {isFullscreen ? <CheckCircle size={18} /> : <Maximize size={18} />}
// // // //                                     </div>
// // // //                                     <div className="pw-step-text">
// // // //                                         <strong>Fullscreen Mode</strong>
// // // //                                         <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
// // // //                                     </div>
// // // //                                     {hasCamera && hasScreen && aiModelsLoaded && !isFullscreen && (
// // // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={enterFullscreen}>
// // // //                                             Enter Fullscreen
// // // //                                         </button>
// // // //                                     )}
// // // //                                 </div>
// // // //                             </div>

// // // //                             <video ref={gateVideoRef} autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }} />
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>
// // // //             )}

// // // //             {isReady && (
// // // //                 <div className="pw-content">
// // // //                     {children}
// // // //                     <div className="pw-pip" style={{ left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }}>
// // // //                         <div className="pw-pip-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
// // // //                             <div className="pw-pip-title">
// // // //                                 {isAiActive ? <ScanFace size={13} className="pw-pulse" /> : <Video size={13} className="pw-pulse" />}
// // // //                                 <span>{isAiActive ? 'AI Tracking Active' : 'Live Recording'}</span>
// // // //                             </div>
// // // //                             <span className="pw-pip-drag-hint">(Drag)</span>
// // // //                         </div>
// // // //                         <video ref={setPipVideoRef} autoPlay muted playsInline className="pw-pip-video" />
// // // //                     </div>
// // // //                 </div>
// // // //             )}

// // // //             {violationWarning && createPortal(
// // // //                 <div className="lfm-overlay pw-violation-overlay">
// // // //                     <div className="lfm-modal pw-violation-card">
// // // //                         <div className="lfm-header pw-violation-header">
// // // //                             <h2 className="lfm-header__title">
// // // //                                 <MonitorX size={18} /> Security Violation Detected
// // // //                             </h2>
// // // //                         </div>
// // // //                         <div className="lfm-body pw-violation-body">
// // // //                             <div className="lfm-error-banner">
// // // //                                 <AlertCircle size={18} />
// // // //                                 <span>{violationWarning}</span>
// // // //                             </div>

// // // //                             <div className="pw-violation-stats">
// // // //                                 <span>Total Violations Logged: <strong>{violationCount}</strong></span>
// // // //                             </div>

// // // //                             <p className="pw-violation-sub">
// // // //                                 A screenshot of your entire screen and webcam has been captured and sent to the invigilator dashboard.
// // // //                             </p>

// // // //                             <button
// // // //                                 className="lfm-btn pw-btn-danger"
// // // //                                 onClick={() => {
// // // //                                     setViolationWarning(null);
// // // //                                     setDoc(doc(db, 'live_proctor_sessions', `${activeAssessmentId}_${activeLearnerId}`), { status: 'active', latestWarning: null }, { merge: true });
// // // //                                     if (!document.fullscreenElement) enterFullscreen();
// // // //                                 }}
// // // //                             >
// // // //                                 I Understand, Return to Assessment
// // // //                             </button>
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>,
// // // //                 document.body
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };


// // // // // import React, { useState, useEffect, useRef } from 'react';
// // // // // import { Camera, Maximize, MonitorX, ShieldAlert, CheckCircle, Video, ScanFace, Loader2, AlertCircle, Monitor } from 'lucide-react';
// // // // // import { createPortal } from 'react-dom';
// // // // // import { doc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
// // // // // import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
// // // // // import { db } from '../../../lib/firebase';
// // // // // import { useStore } from '../../../store/useStore';
// // // // // import { useToast } from '../Toast/Toast';
// // // // // import * as faceapi from 'face-api.js';
// // // // // import './ProctoringWrapper.css';

// // // // // interface ProctoringWrapperProps {
// // // // //     children: React.ReactNode;
// // // // //     assessmentId: string;
// // // // //     learnerId: string;
// // // // //     isProctored: boolean;
// // // // // }

// // // // // export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
// // // // //     const { user } = useStore();
// // // // //     const toast = useToast();

// // // // //     const [isReady, setIsReady] = useState(!isProctored);
// // // // //     const [hasCamera, setHasCamera] = useState(false);
// // // // //     const [hasScreen, setHasScreen] = useState(false);
// // // // //     const [screenError, setScreenError] = useState<string | null>(null);
// // // // //     const [isFullscreen, setIsFullscreen] = useState(false);
// // // // //     const [violationWarning, setViolationWarning] = useState<string | null>(null);
// // // // //     const [violationCount, setViolationCount] = useState(0);

// // // // //     // AI STATE
// // // // //     const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
// // // // //     const [isAiActive, setIsAiActive] = useState(false);

// // // // //     // DRAGGABLE PIP STATE
// // // // //     const [pipPos, setPipPos] = useState(() => ({
// // // // //         x: typeof window !== 'undefined' ? window.innerWidth - 240 : 0,
// // // // //         y: typeof window !== 'undefined' ? window.innerHeight - 190 : 0
// // // // //     }));
// // // // //     const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

// // // // //     const gateVideoRef = useRef<HTMLVideoElement | null>(null);
// // // // //     const pipVideoRef = useRef<HTMLVideoElement | null>(null);
// // // // //     const screenVideoRef = useRef<HTMLVideoElement | null>(null);

// // // // //     const streamRef = useRef<MediaStream | null>(null);
// // // // //     const screenStreamRef = useRef<MediaStream | null>(null);

// // // // //     const audioContextRef = useRef<AudioContext | null>(null);
// // // // //     const analyserRef = useRef<AnalyserNode | null>(null);

// // // // //     const wrapperRef = useRef<HTMLDivElement>(null);
// // // // //     const canvasRef = useRef<HTMLCanvasElement>(null);
// // // // //     const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // // // //     const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // // // //     const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

// // // // //     const lastViolationTimeRef = useRef<number>(0);
// // // // //     const gazeAwayTimeRef = useRef<number>(0);
// // // // //     const noFaceTimeRef = useRef<number>(0);

// // // // //     // ─── 1. LOAD AI MODELS FROM CDN ──────────────────────────────────────────
// // // // //     useEffect(() => {
// // // // //         if (!isProctored) return;
// // // // //         let isMounted = true;

// // // // //         const loadModels = async () => {
// // // // //             const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
// // // // //             try {
// // // // //                 await Promise.all([
// // // // //                     faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
// // // // //                     faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
// // // // //                 ]);
// // // // //                 if (isMounted) setAiModelsLoaded(true);
// // // // //             } catch (err) {
// // // // //                 console.error("Failed to load AI models from CDN:", err);
// // // // //                 if (isMounted) {
// // // // //                     toast.warning("AI face models failed to load. Standard video and screen monitoring remain active.");
// // // // //                 }
// // // // //             }
// // // // //         };
// // // // //         loadModels();

// // // // //         return () => { isMounted = false; };
// // // // //     }, [isProctored]);

// // // // //     // ─── 2. WEBCAM & MIC ACCESS ──────────────────────────────────────────────
// // // // //     const requestWebcamAccess = async () => {
// // // // //         try {
// // // // //             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
// // // // //             streamRef.current = stream;
// // // // //             if (gateVideoRef.current) {
// // // // //                 gateVideoRef.current.srcObject = stream;
// // // // //                 gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
// // // // //             }
// // // // //             setHasCamera(true);

// // // // //             const audioContext = new AudioContext();
// // // // //             const source = audioContext.createMediaStreamSource(stream);
// // // // //             const analyser = audioContext.createAnalyser();
// // // // //             analyser.fftSize = 256;
// // // // //             source.connect(analyser);
// // // // //             audioContextRef.current = audioContext;
// // // // //             analyserRef.current = analyser;

// // // // //             toast.success("Webcam and Microphone connected securely.");
// // // // //         } catch (err: any) {
// // // // //             console.error("Webcam access error:", err);
// // // // //             toast.error("Permission Denied: You must allow Webcam and Microphone access.");
// // // // //         }
// // // // //     };

// // // // //     // ─── 3. ENFORCE "ENTIRE SCREEN" SHARE & HANDLE NATIVE "STOP SHARING" ──────
// // // // //     const requestScreenAccess = async () => {
// // // // //         setScreenError(null);
// // // // //         try {
// // // // //             const screenStream = await navigator.mediaDevices.getDisplayMedia({
// // // // //                 video: true,
// // // // //                 // systemAudio: 'exclude'
// // // // //             });

// // // // //             const videoTrack = screenStream.getVideoTracks()[0];
// // // // //             const settings = videoTrack.getSettings() as any;
// // // // //             const displaySurface = settings.displaySurface;

// // // // //             // Reject Tab or Window selections
// // // // //             if (displaySurface && displaySurface !== 'monitor') {
// // // // //                 screenStream.getTracks().forEach(track => track.stop());
// // // // //                 const errMessage = "Selection Error: You selected a Tab or Window. You MUST select 'Entire Screen'.";
// // // // //                 setScreenError(errMessage);
// // // // //                 toast.error(errMessage);
// // // // //                 setHasScreen(false);
// // // // //                 return;
// // // // //             }

// // // // //             screenStreamRef.current = screenStream;
// // // // //             if (screenVideoRef.current) {
// // // // //                 screenVideoRef.current.srcObject = screenStream;
// // // // //                 screenVideoRef.current.play().catch(e => console.warn("Screen video play failed:", e));
// // // // //             }
// // // // //             setHasScreen(true);
// // // // //             setScreenError(null);

// // // // //             // 🚀 TRIGGERED WHEN USER CLICKS BROWSER'S NATIVE "STOP SHARING" BUTTON
// // // // //             videoTrack.onended = async () => {
// // // // //                 console.warn("[PROCTOR BREACH] Native 'Stop sharing' button clicked by learner.");
// // // // //                 await handleCriticalTermination("CRITICAL SECURITY BREACH: You clicked 'Stop sharing'. Screen sharing is mandatory throughout the assessment. The assessment has been terminated.");
// // // // //             };

// // // // //             toast.success("Entire Screen shared successfully.");
// // // // //         } catch (err: any) {
// // // // //             console.error("Screen access error:", err);
// // // // //             const errMsg = "Screen Share Cancelled: You must grant Entire Screen permission to proceed.";
// // // // //             setScreenError(errMsg);
// // // // //             toast.error(errMsg);
// // // // //         }
// // // // //     };

// // // // //     // Assign streams to active video elements when ready
// // // // //     useEffect(() => {
// // // // //         if (isReady && pipVideoRef.current && streamRef.current) {
// // // // //             pipVideoRef.current.srcObject = streamRef.current;
// // // // //             pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
// // // // //         }
// // // // //         if (isReady && screenVideoRef.current && screenStreamRef.current) {
// // // // //             screenVideoRef.current.srcObject = screenStreamRef.current;
// // // // //             screenVideoRef.current.play().catch(e => console.warn("Screen video play failed:", e));
// // // // //         }
// // // // //     }, [isReady]);

// // // // //     // Cleanup resources on unmount
// // // // //     useEffect(() => {
// // // // //         return () => {
// // // // //             if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
// // // // //             if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
// // // // //             if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
// // // // //             if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
// // // // //             if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
// // // // //             if (audioContextRef.current) audioContextRef.current.close();

// // // // //             if (isProctored && assessmentId && learnerId) {
// // // // //                 setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
// // // // //                     status: 'offline', lastHeartbeat: serverTimestamp()
// // // // //                 }, { merge: true }).catch(console.error);
// // // // //             }
// // // // //         };
// // // // //     }, [isProctored, assessmentId, learnerId]);

// // // // //     // ─── 4. FULLSCREEN MODE ──────────────────────────────────────────────────
// // // // //     const enterFullscreen = async () => {
// // // // //         if (!wrapperRef.current) return;
// // // // //         try {
// // // // //             if (wrapperRef.current.requestFullscreen) await wrapperRef.current.requestFullscreen();
// // // // //             setIsFullscreen(true);
// // // // //             setIsReady(true);
// // // // //             startLightweightHeartbeat();
// // // // //             startAiProctoring();
// // // // //             startAudioMonitoring();
// // // // //         } catch (err) {
// // // // //             toast.error("Failed to enter fullscreen mode.");
// // // // //         }
// // // // //     };

// // // // //     // ─── 5. HEARTBEAT ────────────────────────────────────────────────────────
// // // // //     const startLightweightHeartbeat = () => {
// // // // //         const sendPing = () => {
// // // // //             if (!assessmentId || !learnerId) return;
// // // // //             setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
// // // // //                 assessmentId, learnerId, learnerName: user?.fullName || 'Unknown',
// // // // //                 status: 'active', lastHeartbeat: serverTimestamp()
// // // // //             }, { merge: true }).catch(console.error);
// // // // //         };
// // // // //         sendPing();
// // // // //         heartbeatIntervalRef.current = setInterval(sendPing, 30000);
// // // // //     };

// // // // //     // ─── 6. AI GAZE & FACE DETECTION LOOP ────────────────────────────────────
// // // // //     const startAiProctoring = () => {
// // // // //         if (!aiModelsLoaded) {
// // // // //             setTimeout(() => { if (isReady && !aiModelsLoaded) startAiProctoring(); }, 3000);
// // // // //             return;
// // // // //         }
// // // // //         setIsAiActive(true);

// // // // //         aiIntervalRef.current = setInterval(async () => {
// // // // //             const video = pipVideoRef.current;
// // // // //             if (!video || video.readyState !== 4) return;

// // // // //             try {
// // // // //                 const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

// // // // //                 if (detections.length === 0) {
// // // // //                     noFaceTimeRef.current += 2;
// // // // //                     if (noFaceTimeRef.current >= 6) {
// // // // //                         handleViolation("Face Not Detected: You left the camera frame or covered your face.");
// // // // //                         noFaceTimeRef.current = 0;
// // // // //                     }
// // // // //                     return;
// // // // //                 } else {
// // // // //                     noFaceTimeRef.current = 0;
// // // // //                 }

// // // // //                 if (detections.length > 1) {
// // // // //                     handleViolation("Multiple Faces Detected: Another person entered the camera frame.");
// // // // //                     return;
// // // // //                 }

// // // // //                 const face = detections[0];
// // // // //                 const landmarks = face.landmarks;
// // // // //                 const leftEye = landmarks.getLeftEye();
// // // // //                 const rightEye = landmarks.getRightEye();
// // // // //                 const nose = landmarks.getNose();

// // // // //                 const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
// // // // //                 const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
// // // // //                 const eyeMidX = (leftEyeX + rightEyeX) / 2;

// // // // //                 const horizontalGazeDiff = Math.abs(nose[3].x - eyeMidX);
// // // // //                 const faceWidth = face.detection.box.width;

// // // // //                 if (horizontalGazeDiff > (faceWidth * 0.15)) {
// // // // //                     gazeAwayTimeRef.current += 2;
// // // // //                     if (gazeAwayTimeRef.current >= 8) {
// // // // //                         handleViolation("Gaze Tracking Alert: You looked away from the screen for too long.");
// // // // //                         gazeAwayTimeRef.current = 0;
// // // // //                     }
// // // // //                 } else {
// // // // //                     gazeAwayTimeRef.current = 0;
// // // // //                 }
// // // // //             } catch (err) {
// // // // //                 console.error("AI Inference Error:", err);
// // // // //             }
// // // // //         }, 2000);
// // // // //     };

// // // // //     // ─── 7. AUDIO MONITORING LOOP ────────────────────────────────────────────
// // // // //     const startAudioMonitoring = () => {
// // // // //         if (!analyserRef.current) return;
// // // // //         const bufferLength = analyserRef.current.frequencyBinCount;
// // // // //         const dataArray = new Uint8Array(bufferLength);

// // // // //         audioIntervalRef.current = setInterval(() => {
// // // // //             if (!analyserRef.current) return;
// // // // //             analyserRef.current.getByteFrequencyData(dataArray);

// // // // //             let sum = 0;
// // // // //             for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
// // // // //             const avgVolume = sum / bufferLength;

// // // // //             if (avgVolume > 40) {
// // // // //                 if (Date.now() - lastViolationTimeRef.current > 15000) {
// // // // //                     handleViolation("Audio Alert: Loud talking or background noise detected.");
// // // // //                 }
// // // // //             }
// // // // //         }, 1000);
// // // // //     };

// // // // //     // ─── 8. CRITICAL TERMINATION (FLAG & CLOSE ASSESSMENT) ───────────────────
// // // // //     const handleCriticalTermination = async (reason: string) => {
// // // // //         console.warn("[PROCTOR TERMINATION]", reason);

// // // // //         const timestampIso = new Date().toISOString();
// // // // //         const timestampId = Date.now();

// // // // //         // 1. Capture final frames before closing streams
// // // // //         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
// // // // //         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

// // // // //         // 2. Stop all camera and screen streams
// // // // //         if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
// // // // //         if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());

// // // // //         // 3. Upload evidence snapshots
// // // // //         let screenUrl: string | null = null;
// // // // //         let webcamUrl: string | null = null;
// // // // //         try {
// // // // //             const storage = getStorage();
// // // // //             if (screenFrame) {
// // // // //                 const screenRef = fbStorageRef(storage, `proctoring/violations/${assessmentId}/${learnerId}_${timestampId}_terminated_screen.jpg`);
// // // // //                 await uploadString(screenRef, screenFrame, 'data_url');
// // // // //                 screenUrl = await getDownloadURL(screenRef);
// // // // //                 console.log(`[PROCTOR EVIDENCE] Termination Screenshot captured & uploaded: ${screenUrl}`);
// // // // //             }
// // // // //             if (webcamFrame) {
// // // // //                 const webcamRef = fbStorageRef(storage, `proctoring/violations/${assessmentId}/${learnerId}_${timestampId}_terminated_webcam.jpg`);
// // // // //                 await uploadString(webcamRef, webcamFrame, 'data_url');
// // // // //                 webcamUrl = await getDownloadURL(webcamRef);
// // // // //                 console.log(`[PROCTOR EVIDENCE] Termination Webcam photo captured & uploaded: ${webcamUrl}`);
// // // // //             }
// // // // //         } catch (e) {
// // // // //             console.error("Failed uploading termination frames", e);
// // // // //         }

// // // // //         const violationEvent = {
// // // // //             timestamp: timestampIso,
// // // // //             reason,
// // // // //             imageUrl: webcamUrl,
// // // // //             screenUrl: screenUrl
// // // // //         };

// // // // //         // 4. Update Live Proctor Session in Firestore
// // // // //         const sessionRef = doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`);
// // // // //         await setDoc(sessionRef, {
// // // // //             status: 'terminated',
// // // // //             latestWarning: reason,
// // // // //             violationCount: increment(1),
// // // // //             violationHistory: arrayUnion(violationEvent),
// // // // //             terminatedAt: serverTimestamp()
// // // // //         }, { merge: true }).catch(console.error);

// // // // //         // 5. Update Learner Submission to 'missed' (Terminated)
// // // // //         try {
// // // // //             const subQ = query(
// // // // //                 collection(db, 'learner_submissions'),
// // // // //                 where('assessmentId', '==', assessmentId),
// // // // //                 where('authUid', '==', learnerId)
// // // // //             );
// // // // //             const subSnap = await getDocs(subQ);
// // // // //             if (!subSnap.empty) {
// // // // //                 const subDoc = subSnap.docs[0];
// // // // //                 await updateDoc(doc(db, 'learner_submissions', subDoc.id), {
// // // // //                     status: 'missed',
// // // // //                     systemNote: `Assessment terminated by security proctor: ${reason}`,
// // // // //                     terminatedAt: timestampIso
// // // // //                 });
// // // // //             }
// // // // //         } catch (e) {
// // // // //             console.error("Failed to update submission status on termination", e);
// // // // //         }

// // // // //         // 6. Exit fullscreen
// // // // //         if (document.fullscreenElement) {
// // // // //             document.exitFullscreen().catch(() => { });
// // // // //         }

// // // // //         // 7. Alert and force redirect to dashboard
// // // // //         alert(`ASSESSMENT TERMINATED\n\n${reason}\n\nThis incident has been permanently recorded on the Invigilator Dashboard.`);
// // // // //         window.location.href = user?.role === 'learner' ? '/learner/dashboard' : '/';
// // // // //     };

// // // // //     // ─── 9. HANDLE STANDARD VIOLATIONS ────────────────────────────────────────
// // // // //     const handleViolation = (reason: string) => {
// // // // //         const now = Date.now();
// // // // //         // Debounce: Prevent logging the exact same violation multiple times within 3 seconds
// // // // //         if (now - lastViolationTimeRef.current < 3000) return;
// // // // //         lastViolationTimeRef.current = now;

// // // // //         // 1. CONSOLE LOG THE VIOLATION
// // // // //         console.warn(`[PROCTOR VIOLATION] ${reason}`);

// // // // //         setViolationWarning(reason);
// // // // //         setViolationCount(prev => prev + 1);

// // // // //         // 2. CAPTURE PHOTOS (Webcam & Screen)
// // // // //         const screenFrame = grabFrameFromVideo(screenVideoRef.current);
// // // // //         const webcamFrame = grabFrameFromVideo(pipVideoRef.current || gateVideoRef.current);

// // // // //         const timestampIso = new Date().toISOString();
// // // // //         const timestampId = Date.now();
// // // // //         const sessionRef = doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`);

// // // // //         // 3. LOG TO FIREBASE IMMEDIATELY (Status & Warning)
// // // // //         setDoc(sessionRef, {
// // // // //             status: 'violation',
// // // // //             violationCount: increment(1),
// // // // //             latestWarning: reason,
// // // // //             lastHeartbeat: serverTimestamp()
// // // // //         }, { merge: true }).catch(console.error);

// // // // //         // 4. UPLOAD PHOTOS & LOG HISTORY TO FIREBASE
// // // // //         (async () => {
// // // // //             let screenUrl: string | null = null;
// // // // //             let webcamUrl: string | null = null;

// // // // //             try {
// // // // //                 const storage = getStorage();
                
// // // // //                 if (screenFrame) {
// // // // //                     const screenRef = fbStorageRef(storage, `proctoring/violations/${assessmentId}/${learnerId}_${timestampId}_screen.jpg`);
// // // // //                     await uploadString(screenRef, screenFrame, 'data_url');
// // // // //                     screenUrl = await getDownloadURL(screenRef);
// // // // //                     // 🔴 LOG SCREENSHOT CAPTURE
// // // // //                     console.log(`[PROCTOR EVIDENCE] Screenshot captured & uploaded: ${screenUrl}`);
// // // // //                 }
                
// // // // //                 if (webcamFrame) {
// // // // //                     const webcamRef = fbStorageRef(storage, `proctoring/violations/${assessmentId}/${learnerId}_${timestampId}_webcam.jpg`);
// // // // //                     await uploadString(webcamRef, webcamFrame, 'data_url');
// // // // //                     webcamUrl = await getDownloadURL(webcamRef);
// // // // //                     // 🔴 LOG WEBCAM PHOTO CAPTURE
// // // // //                     console.log(`[PROCTOR EVIDENCE] Webcam photo captured & uploaded: ${webcamUrl}`);
// // // // //                 }
// // // // //             } catch (e) {
// // // // //                 console.error("Failed to upload violation snapshots", e);
// // // // //             }

// // // // //             const violationEvent = {
// // // // //                 timestamp: timestampIso,
// // // // //                 reason,
// // // // //                 imageUrl: webcamUrl,
// // // // //                 screenUrl: screenUrl
// // // // //             };
            
// // // // //             // Add to the violation history array in Firestore
// // // // //             await setDoc(sessionRef, { violationHistory: arrayUnion(violationEvent) }, { merge: true }).catch(console.error);
// // // // //         })();
// // // // //     };

// // // // //     const grabFrameFromVideo = (video: HTMLVideoElement | null): string | null => {
// // // // //         if (!video || video.videoWidth === 0) return null;
// // // // //         const canvas = canvasRef.current;
// // // // //         if (!canvas) return null;
// // // // //         const context = canvas.getContext('2d');
// // // // //         if (!context) return null;
// // // // //         canvas.width = Math.min(video.videoWidth, 1280);
// // // // //         canvas.height = Math.min(video.videoHeight, 720);
// // // // //         context.drawImage(video, 0, 0, canvas.width, canvas.height);
// // // // //         return canvas.toDataURL('image/jpeg', 0.7);
// // // // //     };

// // // // //     // ─── 10. EVENT LISTENERS ─────────────────────────────────────────────────
// // // // //     useEffect(() => {
// // // // //         if (!isProctored || !isReady) return;

// // // // //         const handleVisibilityChange = () => {
// // // // //             if (document.hidden && !violationWarning) handleViolation("Tab Switching Detected: You navigated away from the assessment tab.");
// // // // //         };
// // // // //         const handleBlur = () => {
// // // // //             if (!violationWarning) handleViolation("Window Focus Lost: You clicked outside the assessment window.");
// // // // //         };
// // // // //         const handleFullscreenChange = () => {
// // // // //             const docEl = document as any;
// // // // //             const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement);
// // // // //             if (!isCurrentlyFullscreen && !violationWarning) {
// // // // //                 setIsFullscreen(false);
// // // // //                 handleViolation("Fullscreen Exited: Assessments must be completed in locked fullscreen mode.");
// // // // //             }
// // // // //         };
// // // // //         const handleCopyPaste = (e: ClipboardEvent) => {
// // // // //             e.preventDefault();
// // // // //             if (!violationWarning) handleViolation(`${e.type.charAt(0).toUpperCase() + e.type.slice(1)} Attempt Detected: Clipboard actions are blocked.`);
// // // // //         };
// // // // //         const handleCustomViolation = (e: any) => {
// // // // //             if (!violationWarning) handleViolation(e.detail || "Security violation detected.");
// // // // //         };
// // // // //         const handleContextMenu = (e: Event) => e.preventDefault();
// // // // //         const handleKeyDown = (e: KeyboardEvent) => {
// // // // //             if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key)) || e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
// // // // //                 e.preventDefault();
// // // // //                 if (!violationWarning) handleViolation(`Forbidden keyboard shortcut detected: ${e.key}`);
// // // // //             }
// // // // //         };

// // // // //         document.addEventListener('visibilitychange', handleVisibilityChange);
// // // // //         window.addEventListener('blur', handleBlur);
// // // // //         document.addEventListener('fullscreenchange', handleFullscreenChange);
// // // // //         document.addEventListener('contextmenu', handleContextMenu);
// // // // //         document.addEventListener('proctorViolation', handleCustomViolation);
// // // // //         document.addEventListener('copy', handleCopyPaste);
// // // // //         document.addEventListener('cut', handleCopyPaste);
// // // // //         document.addEventListener('paste', handleCopyPaste);
// // // // //         document.addEventListener('keydown', handleKeyDown);

// // // // //         return () => {
// // // // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // // // //             window.removeEventListener('blur', handleBlur);
// // // // //             document.removeEventListener('fullscreenchange', handleFullscreenChange);
// // // // //             document.removeEventListener('contextmenu', handleContextMenu);
// // // // //             document.removeEventListener('proctorViolation', handleCustomViolation);
// // // // //             document.removeEventListener('copy', handleCopyPaste);
// // // // //             document.removeEventListener('cut', handleCopyPaste);
// // // // //             document.removeEventListener('paste', handleCopyPaste);
// // // // //             document.removeEventListener('keydown', handleKeyDown);
// // // // //         };
// // // // //     }, [isProctored, isReady, violationWarning]);

// // // // //     // ─── 11. DRAGGABLE PIP LOGIC ─────────────────────────────────────────────
// // // // //     useEffect(() => {
// // // // //         const handleMouseMove = (e: MouseEvent) => {
// // // // //             if (!dragRef.current.isDragging) return;
// // // // //             e.preventDefault();
// // // // //             const dx = e.clientX - dragRef.current.startX;
// // // // //             const dy = e.clientY - dragRef.current.startY;
// // // // //             let newX = dragRef.current.initialX + dx;
// // // // //             let newY = dragRef.current.initialY + dy;
// // // // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // // // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // // // //             setPipPos({ x: newX, y: newY });
// // // // //         };
// // // // //         const handleTouchMove = (e: TouchEvent) => {
// // // // //             if (!dragRef.current.isDragging) return;
// // // // //             e.preventDefault();
// // // // //             const touch = e.touches[0];
// // // // //             const dx = touch.clientX - dragRef.current.startX;
// // // // //             const dy = touch.clientY - dragRef.current.startY;
// // // // //             let newX = dragRef.current.initialX + dx;
// // // // //             let newY = dragRef.current.initialY + dy;
// // // // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // // // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // // // //             setPipPos({ x: newX, y: newY });
// // // // //         };
// // // // //         const handleEndDrag = () => { dragRef.current.isDragging = false; };

// // // // //         window.addEventListener('mousemove', handleMouseMove);
// // // // //         window.addEventListener('mouseup', handleEndDrag);
// // // // //         window.addEventListener('touchmove', handleTouchMove, { passive: false });
// // // // //         window.addEventListener('touchend', handleEndDrag);

// // // // //         return () => {
// // // // //             window.removeEventListener('mousemove', handleMouseMove);
// // // // //             window.removeEventListener('mouseup', handleEndDrag);
// // // // //             window.removeEventListener('touchmove', handleTouchMove);
// // // // //             window.removeEventListener('touchend', handleEndDrag);
// // // // //         };
// // // // //     }, []);

// // // // //     const initiateDrag = (clientX: number, clientY: number) => {
// // // // //         dragRef.current.isDragging = true;
// // // // //         dragRef.current.startX = clientX;
// // // // //         dragRef.current.startY = clientY;
// // // // //         dragRef.current.initialX = pipPos.x;
// // // // //         dragRef.current.initialY = pipPos.y;
// // // // //     };

// // // // //     const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
// // // // //     const handleTouchStart = (e: React.TouchEvent) => {
// // // // //         const touch = e.touches[0];
// // // // //         initiateDrag(touch.clientX, touch.clientY);
// // // // //     };

// // // // //     // ─── RENDER ──────────────────────────────────────────────────────────────
// // // // //     if (!isProctored) return <>{children}</>;

// // // // //     return (
// // // // //         <div ref={wrapperRef} className="pw-container">
// // // // //             <canvas ref={canvasRef} style={{ display: 'none' }} />
            
// // // // //             {/* 🚀 BUG FIX: Moved off-screen instead of display: none so frames can be captured for screenshots */}
// // // // //             <video 
// // // // //                 ref={screenVideoRef} 
// // // // //                 autoPlay 
// // // // //                 muted 
// // // // //                 playsInline 
// // // // //                 style={{ position: 'absolute', width: '1px', height: '1px', left: '-9999px', opacity: 0 }} 
// // // // //             />

// // // // //             {!isReady && (
// // // // //                 <div className="lfm-overlay pw-gate-overlay">
// // // // //                     <div className="lfm-modal pw-gate-card">
// // // // //                         <div className="lfm-header">
// // // // //                             <h2 className="lfm-header__title" style={{ color: 'white' }}>
// // // // //                                 <ShieldAlert size={18} /> Secure AI Environment Setup
// // // // //                             </h2>
// // // // //                         </div>

// // // // //                         <div className="lfm-body pw-gate-body">
// // // // //                             <div className="pw-gate-intro">
// // // // //                                 <p>To begin, you must enable AI face tracking AND share your entire screen to prevent external window usage.</p>
// // // // //                             </div>

// // // // //                             <div className="lfm-section-hdr">
// // // // //                                 <ShieldAlert size={13} /> Invigilation Prerequisites
// // // // //                             </div>

// // // // //                             <div className="pw-steps">
// // // // //                                 {/* STEP 1: WEBCAM */}
// // // // //                                 <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
// // // // //                                     <div className="pw-step-icon">
// // // // //                                         {hasCamera ? <CheckCircle size={18} /> : <Camera size={18} />}
// // // // //                                     </div>
// // // // //                                     <div className="pw-step-text">
// // // // //                                         <strong>Webcam & Microphone</strong>
// // // // //                                         <span>{hasCamera ? 'Connected securely' : 'Required for AI face tracking'}</span>
// // // // //                                     </div>
// // // // //                                     {!hasCamera && (
// // // // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={requestWebcamAccess}>
// // // // //                                             Allow Access
// // // // //                                         </button>
// // // // //                                     )}
// // // // //                                 </div>

// // // // //                                 {/* STEP 2: AI ENGINE LOADER */}
// // // // //                                 <div className={`pw-step ${aiModelsLoaded ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // // //                                     <div className="pw-step-icon">
// // // // //                                         {aiModelsLoaded ? <CheckCircle size={18} /> : <Loader2 className="lfm-spin" size={18} />}
// // // // //                                     </div>
// // // // //                                     <div className="pw-step-text">
// // // // //                                         <strong>AI Proctoring Engine</strong>
// // // // //                                         <span>{aiModelsLoaded ? 'Models Loaded & Verified' : 'Downloading neural weights...'}</span>
// // // // //                                     </div>
// // // // //                                 </div>

// // // // //                                 {/* STEP 3: SCREEN SHARE */}
// // // // //                                 <div className={`pw-step ${hasScreen ? 'pw-step--done' : screenError ? 'pw-step--error' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // // //                                     <div className="pw-step-icon">
// // // // //                                         {hasScreen ? <CheckCircle size={18} /> : screenError ? <AlertCircle size={18} /> : <Monitor size={18} />}
// // // // //                                     </div>
// // // // //                                     <div className="pw-step-text" style={{ flex: 1 }}>
// // // // //                                         <strong>Screen Share (Entire Screen Only)</strong>
// // // // //                                         <span>{hasScreen ? 'Entire Screen Shared' : screenError ? screenError : 'Select "Entire Screen" in browser prompt'}</span>
// // // // //                                     </div>
// // // // //                                     {hasCamera && !hasScreen && (
// // // // //                                         <button
// // // // //                                             className={`lfm-btn pw-btn-ll ${screenError ? 'pw-btn-danger' : 'lfm-btn--primary'}`}
// // // // //                                             style={{ background: screenError ? 'var(--mlab-red)' : undefined, width: 200 }}
// // // // //                                             onClick={requestScreenAccess}
// // // // //                                         >
// // // // //                                             {screenError ? 'Retry Screen Share' : 'Share Screen'}
// // // // //                                         </button>
// // // // //                                     )}
// // // // //                                 </div>

// // // // //                                 {/* STEP 4: FULLSCREEN MODE */}
// // // // //                                 <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera || !hasScreen || !aiModelsLoaded ? 'pw-step--disabled' : ''}`}>
// // // // //                                     <div className="pw-step-icon">
// // // // //                                         {isFullscreen ? <CheckCircle size={18} /> : <Maximize size={18} />}
// // // // //                                     </div>
// // // // //                                     <div className="pw-step-text">
// // // // //                                         <strong>Fullscreen Mode</strong>
// // // // //                                         <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
// // // // //                                     </div>
// // // // //                                     {hasCamera && hasScreen && aiModelsLoaded && !isFullscreen && (
// // // // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={enterFullscreen}>
// // // // //                                             Enter Fullscreen
// // // // //                                         </button>
// // // // //                                     )}
// // // // //                                 </div>
// // // // //                             </div>

// // // // //                             <video ref={gateVideoRef} autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }} />
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             )}

// // // // //             {isReady && (
// // // // //                 <div className="pw-content">
// // // // //                     {children}
// // // // //                     <div className="pw-pip" style={{ left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }}>
// // // // //                         <div className="pw-pip-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
// // // // //                             <div className="pw-pip-title">
// // // // //                                 {isAiActive ? <ScanFace size={13} className="pw-pulse" /> : <Video size={13} className="pw-pulse" />}
// // // // //                                 <span>{isAiActive ? 'AI Tracking Active' : 'Live Recording'}</span>
// // // // //                             </div>
// // // // //                             <span className="pw-pip-drag-hint">(Drag)</span>
// // // // //                         </div>
// // // // //                         <video ref={pipVideoRef} autoPlay muted playsInline className="pw-pip-video" />
// // // // //                     </div>
// // // // //                 </div>
// // // // //             )}

// // // // //             {violationWarning && createPortal(
// // // // //                 <div className="lfm-overlay pw-violation-overlay">
// // // // //                     <div className="lfm-modal pw-violation-card">
// // // // //                         <div className="lfm-header pw-violation-header">
// // // // //                             <h2 className="lfm-header__title">
// // // // //                                 <MonitorX size={18} /> Security Violation Detected
// // // // //                             </h2>
// // // // //                         </div>
// // // // //                         <div className="lfm-body pw-violation-body">
// // // // //                             <div className="lfm-error-banner">
// // // // //                                 <AlertCircle size={18} />
// // // // //                                 <span>{violationWarning}</span>
// // // // //                             </div>

// // // // //                             <div className="pw-violation-stats">
// // // // //                                 <span>Total Violations Logged: <strong>{violationCount}</strong></span>
// // // // //                             </div>

// // // // //                             <p className="pw-violation-sub">
// // // // //                                 A screenshot of your entire screen and webcam has been captured and sent to the invigilator dashboard.
// // // // //                             </p>

// // // // //                             <button
// // // // //                                 className="lfm-btn pw-btn-danger"
// // // // //                                 onClick={() => {
// // // // //                                     setViolationWarning(null);
// // // // //                                     setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), { status: 'active', latestWarning: null }, { merge: true });
// // // // //                                     if (!document.fullscreenElement) enterFullscreen();
// // // // //                                 }}
// // // // //                             >
// // // // //                                 I Understand, Return to Assessment
// // // // //                             </button>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>,
// // // // //                 document.body
// // // // //             )}
// // // // //         </div>
// // // // //     );
// // // // // };


// // // // // // import React, { useState, useEffect, useRef } from 'react';
// // // // // // import { Camera, Maximize, MonitorX, ShieldAlert, CheckCircle, Video, ScanFace, Loader2, AlertCircle } from 'lucide-react';
// // // // // // import { createPortal } from 'react-dom';
// // // // // // import { doc, setDoc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
// // // // // // import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
// // // // // // import { db } from '../../../lib/firebase';
// // // // // // import { useStore } from '../../../store/useStore';
// // // // // // import { useToast } from '../Toast/Toast';
// // // // // // import * as faceapi from 'face-api.js';
// // // // // // import './ProctoringWrapper.css';

// // // // // // interface ProctoringWrapperProps {
// // // // // //     children: React.ReactNode;
// // // // // //     assessmentId: string;
// // // // // //     learnerId: string;
// // // // // //     isProctored: boolean;
// // // // // // }

// // // // // // export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
// // // // // //     const { user } = useStore();
// // // // // //     const toast = useToast();

// // // // // //     const [isReady, setIsReady] = useState(!isProctored);
// // // // // //     const [hasCamera, setHasCamera] = useState(false);
// // // // // //     const [hasMic, setHasMic] = useState(false);
// // // // // //     const [isFullscreen, setIsFullscreen] = useState(false);
// // // // // //     const [violationWarning, setViolationWarning] = useState<string | null>(null);
// // // // // //     const [violationCount, setViolationCount] = useState(0);

// // // // // //     // AI STATE
// // // // // //     const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
// // // // // //     const [isAiActive, setIsAiActive] = useState(false);

// // // // // //     // DRAGGABLE PIP STATE
// // // // // //     const [pipPos, setPipPos] = useState(() => ({
// // // // // //         x: typeof window !== 'undefined' ? window.innerWidth - 240 : 0,
// // // // // //         y: typeof window !== 'undefined' ? window.innerHeight - 190 : 0
// // // // // //     }));
// // // // // //     const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

// // // // // //     const gateVideoRef = useRef<HTMLVideoElement | null>(null);
// // // // // //     const pipVideoRef = useRef<HTMLVideoElement | null>(null);
// // // // // //     const streamRef = useRef<MediaStream | null>(null);
// // // // // //     const audioContextRef = useRef<AudioContext | null>(null);
// // // // // //     const analyserRef = useRef<AnalyserNode | null>(null);

// // // // // //     const wrapperRef = useRef<HTMLDivElement>(null);
// // // // // //     const canvasRef = useRef<HTMLCanvasElement>(null);
// // // // // //     const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // // // // //     const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // // // // //     const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

// // // // // //     const lastViolationTimeRef = useRef<number>(0);

// // // // // //     // AI RULE THROTTLING
// // // // // //     const gazeAwayTimeRef = useRef<number>(0);
// // // // // //     const noFaceTimeRef = useRef<number>(0);

// // // // // //     // ─── 1. LOAD AI MODELS (VIA CDN) ──────────────────────────────────────
// // // // // //     useEffect(() => {
// // // // // //         if (!isProctored) return;
// // // // // //         const loadModels = async () => {
// // // // // //             // Loading directly from the official face-api.js CDN to prevent local 404/HTML fallback errors
// // // // // //             const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
// // // // // //             try {
// // // // // //                 await Promise.all([
// // // // // //                     faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
// // // // // //                     faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
// // // // // //                 ]);
// // // // // //                 setAiModelsLoaded(true);
// // // // // //                 console.log("AI Proctoring Models Loaded successfully from CDN.");
// // // // // //             } catch (err) {
// // // // // //                 console.error("Failed to load AI models. Gaze tracking disabled.", err);
// // // // // //                 toast.warning("AI Proctoring models failed to load. Standard video recording is active.");
// // // // // //             }
// // // // // //         };
// // // // // //         loadModels();
// // // // // //     }, [isProctored]);

// // // // // //     // ─── 2. INITIALIZE WEBCAM & MIC ────────────────────────────────────────
// // // // // //     const requestMediaAccess = async () => {
// // // // // //         try {
// // // // // //             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
// // // // // //             streamRef.current = stream;

// // // // // //             if (gateVideoRef.current) {
// // // // // //                 gateVideoRef.current.srcObject = stream;
// // // // // //                 gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
// // // // // //             }
// // // // // //             if (pipVideoRef.current) {
// // // // // //                 pipVideoRef.current.srcObject = stream;
// // // // // //                 pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
// // // // // //             }

// // // // // //             setHasCamera(true);
// // // // // //             setHasMic(true);

// // // // // //             const audioContext = new AudioContext();
// // // // // //             const source = audioContext.createMediaStreamSource(stream);
// // // // // //             const analyser = audioContext.createAnalyser();
// // // // // //             analyser.fftSize = 256;
// // // // // //             source.connect(analyser);
// // // // // //             audioContextRef.current = audioContext;
// // // // // //             analyserRef.current = analyser;

// // // // // //             toast.success("Camera, Microphone, and AI connected securely.");
// // // // // //         } catch (err: any) {
// // // // // //             console.error("Media access error:", err);
// // // // // //             toast.error("Permission Denied: You must click 'Allow' for Camera and Microphone.");
// // // // // //         }
// // // // // //     };

// // // // // //     // Cleanup
// // // // // //     useEffect(() => {
// // // // // //         return () => {
// // // // // //             if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
// // // // // //             if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
// // // // // //             if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
// // // // // //             if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
// // // // // //             if (audioContextRef.current) audioContextRef.current.close();

// // // // // //             if (isProctored && assessmentId && learnerId) {
// // // // // //                 setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
// // // // // //                     status: 'offline', lastHeartbeat: serverTimestamp()
// // // // // //                 }, { merge: true }).catch(console.error);
// // // // // //             }
// // // // // //         };
// // // // // //     }, [isProctored, assessmentId, learnerId]);

// // // // // //     // ─── 3. FULLSCREEN LOGIC ───────────────────────────────────────────────
// // // // // //     const enterFullscreen = async () => {
// // // // // //         if (!wrapperRef.current) return;
// // // // // //         try {
// // // // // //             if (wrapperRef.current.requestFullscreen) await wrapperRef.current.requestFullscreen();
// // // // // //             setIsFullscreen(true);
// // // // // //             setIsReady(true);
// // // // // //             startLightweightHeartbeat();
// // // // // //             startAiProctoring();
// // // // // //             startAudioMonitoring();
// // // // // //         } catch (err) {
// // // // // //             toast.error("Failed to enter fullscreen mode.");
// // // // // //         }
// // // // // //     };

// // // // // //     // ─── 4. LIGHTWEIGHT HEARTBEAT ──────────────────────────────────────────
// // // // // //     const startLightweightHeartbeat = () => {
// // // // // //         const sendPing = () => {
// // // // // //             if (!assessmentId || !learnerId) return;
// // // // // //             setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
// // // // // //                 assessmentId, learnerId, learnerName: user?.fullName || 'Unknown',
// // // // // //                 status: 'active', lastHeartbeat: serverTimestamp()
// // // // // //             }, { merge: true }).catch(console.error);
// // // // // //         };
// // // // // //         sendPing();
// // // // // //         heartbeatIntervalRef.current = setInterval(sendPing, 30000);
// // // // // //     };

// // // // // //     // ─── 5. AI GAZE & FACE DETECTION LOOP ──────────────────────────────────
// // // // // //     const startAiProctoring = () => {
// // // // // //         if (!aiModelsLoaded) {
// // // // // //             setTimeout(() => { if (isReady && !aiModelsLoaded) startAiProctoring(); }, 3000);
// // // // // //             return;
// // // // // //         }
// // // // // //         setIsAiActive(true);

// // // // // //         aiIntervalRef.current = setInterval(async () => {
// // // // // //             const video = pipVideoRef.current;
// // // // // //             if (!video || video.readyState !== 4) return;

// // // // // //             try {
// // // // // //                 const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

// // // // // //                 if (detections.length === 0) {
// // // // // //                     noFaceTimeRef.current += 2;
// // // // // //                     if (noFaceTimeRef.current >= 6) {
// // // // // //                         handleViolation("Face Not Detected: You left the camera frame or covered your face.");
// // // // // //                         noFaceTimeRef.current = 0;
// // // // // //                     }
// // // // // //                     return;
// // // // // //                 } else {
// // // // // //                     noFaceTimeRef.current = 0;
// // // // // //                 }

// // // // // //                 if (detections.length > 1) {
// // // // // //                     handleViolation("Multiple Faces Detected: Another person entered the camera frame.");
// // // // // //                     return;
// // // // // //                 }

// // // // // //                 const face = detections[0];
// // // // // //                 const landmarks = face.landmarks;
// // // // // //                 const leftEye = landmarks.getLeftEye();
// // // // // //                 const rightEye = landmarks.getRightEye();
// // // // // //                 const nose = landmarks.getNose();

// // // // // //                 const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
// // // // // //                 const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
// // // // // //                 const eyeMidX = (leftEyeX + rightEyeX) / 2;

// // // // // //                 const horizontalGazeDiff = Math.abs(nose[3].x - eyeMidX);
// // // // // //                 const faceWidth = face.detection.box.width;

// // // // // //                 if (horizontalGazeDiff > (faceWidth * 0.15)) {
// // // // // //                     gazeAwayTimeRef.current += 2;
// // // // // //                     if (gazeAwayTimeRef.current >= 8) {
// // // // // //                         handleViolation("Gaze Tracking Alert: You looked away from the screen for too long.");
// // // // // //                         gazeAwayTimeRef.current = 0;
// // // // // //                     }
// // // // // //                 } else {
// // // // // //                     gazeAwayTimeRef.current = 0;
// // // // // //                 }

// // // // // //             } catch (err) {
// // // // // //                 console.error("AI Inference Error:", err);
// // // // // //             }
// // // // // //         }, 2000);
// // // // // //     };

// // // // // //     // ─── 6. AUDIO MONITORING LOOP ──────────────────────────────────────────
// // // // // //     const startAudioMonitoring = () => {
// // // // // //         if (!analyserRef.current) return;
// // // // // //         const bufferLength = analyserRef.current.frequencyBinCount;
// // // // // //         const dataArray = new Uint8Array(bufferLength);

// // // // // //         audioIntervalRef.current = setInterval(() => {
// // // // // //             if (!analyserRef.current) return;
// // // // // //             analyserRef.current.getByteFrequencyData(dataArray);

// // // // // //             let sum = 0;
// // // // // //             for (let i = 0; i < bufferLength; i++) {
// // // // // //                 sum += dataArray[i];
// // // // // //             }
// // // // // //             const avgVolume = sum / bufferLength;

// // // // // //             if (avgVolume > 40) {
// // // // // //                 if (Date.now() - lastViolationTimeRef.current > 15000) {
// // // // // //                     handleViolation("Audio Alert: Loud talking or background noise detected.");
// // // // // //                 }
// // // // // //             }
// // // // // //         }, 1000);
// // // // // //     };

// // // // // //     // ─── 7. HANDLE VIOLATION ────────────────────────────────────────────────
// // // // // //     const handleViolation = (reason: string) => {
// // // // // //         const now = Date.now();
// // // // // //         if (now - lastViolationTimeRef.current < 3000) return; // Strict 3s throttle
// // // // // //         lastViolationTimeRef.current = now;

// // // // // //         setViolationWarning(reason);
// // // // // //         setViolationCount(prev => prev + 1);

// // // // // //         const base64Frame = grabBase64FrameSync();
// // // // // //         const timestampIso = new Date().toISOString();
// // // // // //         const timestampId = Date.now();
// // // // // //         const sessionRef = doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`);

// // // // // //         setDoc(sessionRef, {
// // // // // //             status: 'violation',
// // // // // //             violationCount: increment(1),
// // // // // //             latestWarning: reason,
// // // // // //             lastHeartbeat: serverTimestamp()
// // // // // //         }, { merge: true }).catch(console.error);

// // // // // //         (async () => {
// // // // // //             let downloadUrl: string | null = null;
// // // // // //             if (base64Frame) {
// // // // // //                 try {
// // // // // //                     const storage = getStorage();
// // // // // //                     const imageRef = fbStorageRef(storage, `proctoring/violations/${assessmentId}/${learnerId}_${timestampId}.jpg`);
// // // // // //                     await uploadString(imageRef, base64Frame, 'data_url');
// // // // // //                     downloadUrl = await getDownloadURL(imageRef);
// // // // // //                 } catch (e) {
// // // // // //                     console.error("Failed to upload violation snapshot", e);
// // // // // //                 }
// // // // // //             }

// // // // // //             const violationEvent = { timestamp: timestampIso, reason, imageUrl: downloadUrl };
// // // // // //             await setDoc(sessionRef, { violationHistory: arrayUnion(violationEvent) }, { merge: true }).catch(console.error);
// // // // // //         })();
// // // // // //     };

// // // // // //     const grabBase64FrameSync = (): string | null => {
// // // // // //         const video = pipVideoRef.current || gateVideoRef.current;
// // // // // //         const canvas = canvasRef.current;
// // // // // //         if (!video || !canvas || video.videoWidth === 0) return null;
// // // // // //         const context = canvas.getContext('2d');
// // // // // //         if (!context) return null;
// // // // // //         canvas.width = Math.min(video.videoWidth, 640);
// // // // // //         canvas.height = Math.min(video.videoHeight, 480);
// // // // // //         context.drawImage(video, 0, 0, canvas.width, canvas.height);
// // // // // //         return canvas.toDataURL('image/jpeg', 0.6);
// // // // // //     };

// // // // // //     // ─── 8. EVENT LISTENERS ────────────────────────────────────────────────
// // // // // //     useEffect(() => {
// // // // // //         if (!isProctored || !isReady) return;

// // // // // //         const handleVisibilityChange = () => {
// // // // // //             if (document.hidden && !violationWarning) handleViolation("Tab Switching Detected: You navigated away.");
// // // // // //         };
// // // // // //         const handleBlur = () => { if (!violationWarning) handleViolation("Window Focus Lost: You clicked outside."); };
// // // // // //         const handleFullscreenChange = () => {
// // // // // //             const docEl = document as any;
// // // // // //             const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement);
// // // // // //             if (!isCurrentlyFullscreen && !violationWarning) {
// // // // // //                 setIsFullscreen(false);
// // // // // //                 handleViolation("Fullscreen Exited: Assessments must be in fullscreen.");
// // // // // //             }
// // // // // //         };
// // // // // //         const handleCopyPaste = (e: ClipboardEvent) => {
// // // // // //             e.preventDefault();
// // // // // //             if (!violationWarning) handleViolation(`${e.type.charAt(0).toUpperCase() + e.type.slice(1)} Attempt Detected: Clipboard actions are blocked.`);
// // // // // //         };
// // // // // //         const handleCustomViolation = (e: any) => { if (!violationWarning) handleViolation(e.detail || "Security violation detected."); };
// // // // // //         const handleContextMenu = (e: Event) => e.preventDefault();
// // // // // //         const handleKeyDown = (e: KeyboardEvent) => {
// // // // // //             if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key)) || e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
// // // // // //                 e.preventDefault();
// // // // // //                 if (!violationWarning) handleViolation(`Forbidden shortcut detected: ${e.key}`);
// // // // // //             }
// // // // // //         };

// // // // // //         document.addEventListener('visibilitychange', handleVisibilityChange);
// // // // // //         window.addEventListener('blur', handleBlur);
// // // // // //         document.addEventListener('fullscreenchange', handleFullscreenChange);
// // // // // //         document.addEventListener('contextmenu', handleContextMenu);
// // // // // //         document.addEventListener('proctorViolation', handleCustomViolation);
// // // // // //         document.addEventListener('copy', handleCopyPaste);
// // // // // //         document.addEventListener('cut', handleCopyPaste);
// // // // // //         document.addEventListener('paste', handleCopyPaste);
// // // // // //         document.addEventListener('keydown', handleKeyDown);

// // // // // //         return () => {
// // // // // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // // // // //             window.removeEventListener('blur', handleBlur);
// // // // // //             document.removeEventListener('fullscreenchange', handleFullscreenChange);
// // // // // //             document.removeEventListener('contextmenu', handleContextMenu);
// // // // // //             document.removeEventListener('proctorViolation', handleCustomViolation);
// // // // // //             document.removeEventListener('copy', handleCopyPaste);
// // // // // //             document.removeEventListener('cut', handleCopyPaste);
// // // // // //             document.removeEventListener('paste', handleCopyPaste);
// // // // // //             document.removeEventListener('keydown', handleKeyDown);
// // // // // //         };
// // // // // //     }, [isProctored, isReady, violationWarning])

// // // // // //     // ─── 9. DRAGGABLE PIP LOGIC ─────────────────────────────────────────────
// // // // // //     useEffect(() => {
// // // // // //         const handleMouseMove = (e: MouseEvent) => {
// // // // // //             if (!dragRef.current.isDragging) return;
// // // // // //             e.preventDefault();
// // // // // //             const dx = e.clientX - dragRef.current.startX;
// // // // // //             const dy = e.clientY - dragRef.current.startY;
// // // // // //             let newX = dragRef.current.initialX + dx;
// // // // // //             let newY = dragRef.current.initialY + dy;
// // // // // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // // // // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // // // // //             setPipPos({ x: newX, y: newY });
// // // // // //         };
// // // // // //         const handleTouchMove = (e: TouchEvent) => {
// // // // // //             if (!dragRef.current.isDragging) return;
// // // // // //             e.preventDefault();
// // // // // //             const touch = e.touches[0];
// // // // // //             const dx = touch.clientX - dragRef.current.startX;
// // // // // //             const dy = touch.clientY - dragRef.current.startY;
// // // // // //             let newX = dragRef.current.initialX + dx;
// // // // // //             let newY = dragRef.current.initialY + dy;
// // // // // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // // // // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // // // // //             setPipPos({ x: newX, y: newY });
// // // // // //         };
// // // // // //         const handleEndDrag = () => { dragRef.current.isDragging = false; };

// // // // // //         window.addEventListener('mousemove', handleMouseMove);
// // // // // //         window.addEventListener('mouseup', handleEndDrag);
// // // // // //         window.addEventListener('touchmove', handleTouchMove, { passive: false });
// // // // // //         window.addEventListener('touchend', handleEndDrag);

// // // // // //         return () => {
// // // // // //             window.removeEventListener('mousemove', handleMouseMove);
// // // // // //             window.removeEventListener('mouseup', handleEndDrag);
// // // // // //             window.removeEventListener('touchmove', handleTouchMove);
// // // // // //             window.removeEventListener('touchend', handleEndDrag);
// // // // // //         };
// // // // // //     }, []);

// // // // // //     const initiateDrag = (clientX: number, clientY: number) => {
// // // // // //         dragRef.current.isDragging = true;
// // // // // //         dragRef.current.startX = clientX;
// // // // // //         dragRef.current.startY = clientY;
// // // // // //         dragRef.current.initialX = pipPos.x;
// // // // // //         dragRef.current.initialY = pipPos.y;
// // // // // //     };

// // // // // //     const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
// // // // // //     const handleTouchStart = (e: React.TouchEvent) => {
// // // // // //         const touch = e.touches[0];
// // // // // //         initiateDrag(touch.clientX, touch.clientY);
// // // // // //     };

// // // // // //     // ─── RENDER ────────────────────────────────────────────────────────────
// // // // // //     if (!isProctored) return <>{children}</>;

// // // // // //     return (
// // // // // //         <div ref={wrapperRef} className="pw-container">
// // // // // //             <canvas ref={canvasRef} style={{ display: 'none' }} />

// // // // // //             {!isReady && (
// // // // // //                 <div className="lfm-overlay pw-gate-overlay">
// // // // // //                     <div className="lfm-modal pw-gate-card">
// // // // // //                         <div className="lfm-header">
// // // // // //                             <h2 className="lfm-header__title" style={{ color: 'white' }}>
// // // // // //                                 <ShieldAlert size={18} /> Secure AI Environment Setup
// // // // // //                             </h2>
// // // // // //                         </div>

// // // // // //                         <div className="lfm-body pw-gate-body">
// // // // // //                             <div className="pw-gate-intro">
// // // // // //                                 <p>To begin or resume this assessment, you must establish a secure environment with AI face, gaze, and audio invigilation enabled.</p>
// // // // // //                             </div>

// // // // // //                             <div className="lfm-section-hdr">
// // // // // //                                 <ShieldAlert size={13} /> Invigilation Prerequisites
// // // // // //                             </div>

// // // // // //                             <div className="pw-steps">
// // // // // //                                 <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
// // // // // //                                     <div className="pw-step-icon">
// // // // // //                                         {hasCamera ? <CheckCircle size={18} /> : <Camera size={18} />}
// // // // // //                                     </div>
// // // // // //                                     <div className="pw-step-text">
// // // // // //                                         <strong>Camera & Microphone</strong>
// // // // // //                                         <span>{hasCamera ? 'Connected securely' : 'Required for live AI invigilation'}</span>
// // // // // //                                     </div>
// // // // // //                                     {!hasCamera && (
// // // // // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={requestMediaAccess}>
// // // // // //                                             Allow Access
// // // // // //                                         </button>
// // // // // //                                     )}
// // // // // //                                 </div>

// // // // // //                                 <div className={`pw-step ${aiModelsLoaded ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // // // //                                     <div className="pw-step-icon">
// // // // // //                                         {aiModelsLoaded ? <CheckCircle size={18} /> : <Loader2 className="lfm-spin" size={18} />}
// // // // // //                                     </div>
// // // // // //                                     <div className="pw-step-text">
// // // // // //                                         <strong>AI Proctoring Engine</strong>
// // // // // //                                         <span>{aiModelsLoaded ? 'Models Loaded & Verified' : 'Downloading neural weights...'}</span>
// // // // // //                                     </div>
// // // // // //                                 </div>

// // // // // //                                 <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // // // //                                     <div className="pw-step-icon">
// // // // // //                                         {isFullscreen ? <CheckCircle size={18} /> : <Maximize size={18} />}
// // // // // //                                     </div>
// // // // // //                                     <div className="pw-step-text">
// // // // // //                                         <strong>Fullscreen Mode</strong>
// // // // // //                                         <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
// // // // // //                                     </div>
// // // // // //                                     {hasCamera && !isFullscreen && (
// // // // // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={enterFullscreen}>
// // // // // //                                             Enter Fullscreen
// // // // // //                                         </button>
// // // // // //                                     )}
// // // // // //                                 </div>
// // // // // //                             </div>

// // // // // //                             <video ref={gateVideoRef} autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }} />
// // // // // //                         </div>
// // // // // //                     </div>
// // // // // //                 </div>
// // // // // //             )}

// // // // // //             {isReady && (
// // // // // //                 <div className="pw-content">
// // // // // //                     {children}
// // // // // //                     <div className="pw-pip" style={{ left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }}>
// // // // // //                         <div className="pw-pip-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
// // // // // //                             <div className="pw-pip-title">
// // // // // //                                 {isAiActive ? <ScanFace size={13} className="pw-pulse" /> : <Video size={13} className="pw-pulse" />}
// // // // // //                                 <span>{isAiActive ? 'AI Tracking Active' : 'Live Recording'}</span>
// // // // // //                             </div>
// // // // // //                             <span className="pw-pip-drag-hint">(Drag)</span>
// // // // // //                         </div>
// // // // // //                         <video ref={pipVideoRef} autoPlay muted playsInline className="pw-pip-video" />
// // // // // //                     </div>
// // // // // //                 </div>
// // // // // //             )}

// // // // // //             {violationWarning && createPortal(
// // // // // //                 <div className="lfm-overlay pw-violation-overlay">
// // // // // //                     <div className="lfm-modal pw-violation-card">
// // // // // //                         <div className="lfm-header pw-violation-header">
// // // // // //                             <h2 className="lfm-header__title">
// // // // // //                                 <MonitorX size={18} /> Security Violation Detected
// // // // // //                             </h2>
// // // // // //                         </div>
// // // // // //                         <div className="lfm-body pw-violation-body">
// // // // // //                             <div className="lfm-error-banner">
// // // // // //                                 <AlertCircle size={18} />
// // // // // //                                 <span>{violationWarning}</span>
// // // // // //                             </div>

// // // // // //                             <div className="pw-violation-stats">
// // // // // //                                 <span>Total Violations Logged: <strong>{violationCount}</strong></span>
// // // // // //                             </div>

// // // // // //                             <p className="pw-violation-sub">
// // // // // //                                 Your webcam and AI tracking engine captured this event. It has been permanently logged to the Invigilator Dashboard.
// // // // // //                             </p>

// // // // // //                             <button
// // // // // //                                 className="lfm-btn pw-btn-danger"
// // // // // //                                 onClick={() => {
// // // // // //                                     setViolationWarning(null);
// // // // // //                                     setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), { status: 'active', latestWarning: null }, { merge: true });
// // // // // //                                     if (!document.fullscreenElement) enterFullscreen();
// // // // // //                                 }}
// // // // // //                             >
// // // // // //                                 I Understand, Return to Assessment
// // // // // //                             </button>
// // // // // //                         </div>
// // // // // //                     </div>
// // // // // //                 </div>,
// // // // // //                 document.body
// // // // // //             )}
// // // // // //         </div>
// // // // // //     );
// // // // // // };



// // // // // // // import React, { useState, useEffect, useRef } from 'react';
// // // // // // // import { Camera, Maximize, MonitorX, ShieldAlert, CheckCircle, Video, ScanFace, Loader2, AlertCircle } from 'lucide-react';
// // // // // // // import { createPortal } from 'react-dom';
// // // // // // // import { doc, setDoc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
// // // // // // // import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
// // // // // // // import { db } from '../../../lib/firebase';
// // // // // // // import { useStore } from '../../../store/useStore';
// // // // // // // import { useToast } from '../Toast/Toast';
// // // // // // // import * as faceapi from 'face-api.js';
// // // // // // // import './ProctoringWrapper.css';

// // // // // // // interface ProctoringWrapperProps {
// // // // // // //     children: React.ReactNode;
// // // // // // //     assessmentId: string;
// // // // // // //     learnerId: string;
// // // // // // //     isProctored: boolean;
// // // // // // // }

// // // // // // // export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
// // // // // // //     const { user } = useStore();
// // // // // // //     const toast = useToast();

// // // // // // //     const [isReady, setIsReady] = useState(!isProctored);
// // // // // // //     const [hasCamera, setHasCamera] = useState(false);
// // // // // // //     const [hasMic, setHasMic] = useState(false);
// // // // // // //     const [isFullscreen, setIsFullscreen] = useState(false);
// // // // // // //     const [violationWarning, setViolationWarning] = useState<string | null>(null);
// // // // // // //     const [violationCount, setViolationCount] = useState(0);

// // // // // // //     // AI STATE
// // // // // // //     const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
// // // // // // //     const [isAiActive, setIsAiActive] = useState(false);

// // // // // // //     // DRAGGABLE PIP STATE
// // // // // // //     const [pipPos, setPipPos] = useState(() => ({
// // // // // // //         x: typeof window !== 'undefined' ? window.innerWidth - 240 : 0,
// // // // // // //         y: typeof window !== 'undefined' ? window.innerHeight - 190 : 0
// // // // // // //     }));
// // // // // // //     const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

// // // // // // //     const gateVideoRef = useRef<HTMLVideoElement | null>(null);
// // // // // // //     const pipVideoRef = useRef<HTMLVideoElement | null>(null);
// // // // // // //     const streamRef = useRef<MediaStream | null>(null);
// // // // // // //     const audioContextRef = useRef<AudioContext | null>(null);
// // // // // // //     const analyserRef = useRef<AnalyserNode | null>(null);

// // // // // // //     const wrapperRef = useRef<HTMLDivElement>(null);
// // // // // // //     const canvasRef = useRef<HTMLCanvasElement>(null);
// // // // // // //     const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // // // // // //     const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
// // // // // // //     const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

// // // // // // //     const lastViolationTimeRef = useRef<number>(0);

// // // // // // //     // AI RULE THROTTLING
// // // // // // //     const gazeAwayTimeRef = useRef<number>(0);
// // // // // // //     const noFaceTimeRef = useRef<number>(0);

// // // // // // //     // ─── 1. LOAD AI MODELS ──────────────────────────────────────────────────
// // // // // // //     useEffect(() => {
// // // // // // //         if (!isProctored) return;
// // // // // // //         const loadModels = async () => {
// // // // // // //             const MODEL_URL = '/models';
// // // // // // //             try {
// // // // // // //                 const testRes = await fetch(`${MODEL_URL}/tiny_face_detector_model-weights_manifest.json`);
// // // // // // //                 if (!testRes.ok) throw new Error("Model manifest not found");
// // // // // // //                 const text = await testRes.text();
// // // // // // //                 if (text.startsWith("<")) throw new Error("Received HTML instead of JSON. Models missing.");

// // // // // // //                 await Promise.all([
// // // // // // //                     faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
// // // // // // //                     faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
// // // // // // //                 ]);
// // // // // // //                 setAiModelsLoaded(true);
// // // // // // //             } catch (err) {
// // // // // // //                 console.error("Failed to load AI models. Gaze tracking disabled.", err);
// // // // // // //                 toast.warning("AI Proctoring models not found. Standard video recording is active.");
// // // // // // //             }
// // // // // // //         };
// // // // // // //         loadModels();
// // // // // // //     }, [isProctored]);

// // // // // // //     // ─── 2. INITIALIZE WEBCAM & MIC ────────────────────────────────────────
// // // // // // //     const requestMediaAccess = async () => {
// // // // // // //         try {
// // // // // // //             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
// // // // // // //             streamRef.current = stream;

// // // // // // //             if (gateVideoRef.current) {
// // // // // // //                 gateVideoRef.current.srcObject = stream;
// // // // // // //                 gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
// // // // // // //             }
// // // // // // //             if (pipVideoRef.current) {
// // // // // // //                 pipVideoRef.current.srcObject = stream;
// // // // // // //                 pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
// // // // // // //             }

// // // // // // //             setHasCamera(true);
// // // // // // //             setHasMic(true);

// // // // // // //             const audioContext = new AudioContext();
// // // // // // //             const source = audioContext.createMediaStreamSource(stream);
// // // // // // //             const analyser = audioContext.createAnalyser();
// // // // // // //             analyser.fftSize = 256;
// // // // // // //             source.connect(analyser);
// // // // // // //             audioContextRef.current = audioContext;
// // // // // // //             analyserRef.current = analyser;

// // // // // // //             toast.success("Camera, Microphone, and AI connected securely.");
// // // // // // //         } catch (err: any) {
// // // // // // //             console.error("Media access error:", err);
// // // // // // //             toast.error("Permission Denied: You must click 'Allow' for Camera and Microphone.");
// // // // // // //         }
// // // // // // //     };

// // // // // // //     // Cleanup
// // // // // // //     useEffect(() => {
// // // // // // //         return () => {
// // // // // // //             if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
// // // // // // //             if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
// // // // // // //             if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
// // // // // // //             if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
// // // // // // //             if (audioContextRef.current) audioContextRef.current.close();

// // // // // // //             if (isProctored && assessmentId && learnerId) {
// // // // // // //                 setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
// // // // // // //                     status: 'offline', lastHeartbeat: serverTimestamp()
// // // // // // //                 }, { merge: true }).catch(console.error);
// // // // // // //             }
// // // // // // //         };
// // // // // // //     }, [isProctored, assessmentId, learnerId]);

// // // // // // //     // ─── 3. FULLSCREEN LOGIC ───────────────────────────────────────────────
// // // // // // //     const enterFullscreen = async () => {
// // // // // // //         if (!wrapperRef.current) return;
// // // // // // //         try {
// // // // // // //             if (wrapperRef.current.requestFullscreen) await wrapperRef.current.requestFullscreen();
// // // // // // //             setIsFullscreen(true);
// // // // // // //             setIsReady(true);
// // // // // // //             startLightweightHeartbeat();
// // // // // // //             startAiProctoring();
// // // // // // //             startAudioMonitoring();
// // // // // // //         } catch (err) {
// // // // // // //             toast.error("Failed to enter fullscreen mode.");
// // // // // // //         }
// // // // // // //     };

// // // // // // //     // ─── 4. LIGHTWEIGHT HEARTBEAT ──────────────────────────────────────────
// // // // // // //     const startLightweightHeartbeat = () => {
// // // // // // //         const sendPing = () => {
// // // // // // //             if (!assessmentId || !learnerId) return;
// // // // // // //             setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
// // // // // // //                 assessmentId, learnerId, learnerName: user?.fullName || 'Unknown',
// // // // // // //                 status: 'active', lastHeartbeat: serverTimestamp()
// // // // // // //             }, { merge: true }).catch(console.error);
// // // // // // //         };
// // // // // // //         sendPing();
// // // // // // //         heartbeatIntervalRef.current = setInterval(sendPing, 30000);
// // // // // // //     };

// // // // // // //     // ─── 5. AI GAZE & FACE DETECTION LOOP ──────────────────────────────────
// // // // // // //     const startAiProctoring = () => {
// // // // // // //         if (!aiModelsLoaded) {
// // // // // // //             setTimeout(() => { if (isReady && !aiModelsLoaded) startAiProctoring(); }, 3000);
// // // // // // //             return;
// // // // // // //         }
// // // // // // //         setIsAiActive(true);

// // // // // // //         aiIntervalRef.current = setInterval(async () => {
// // // // // // //             const video = pipVideoRef.current;
// // // // // // //             if (!video || video.readyState !== 4) return;

// // // // // // //             try {
// // // // // // //                 const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();

// // // // // // //                 if (detections.length === 0) {
// // // // // // //                     noFaceTimeRef.current += 2;
// // // // // // //                     if (noFaceTimeRef.current >= 6) {
// // // // // // //                         handleViolation("Face Not Detected: You left the camera frame or covered your face.");
// // // // // // //                         noFaceTimeRef.current = 0;
// // // // // // //                     }
// // // // // // //                     return;
// // // // // // //                 } else {
// // // // // // //                     noFaceTimeRef.current = 0;
// // // // // // //                 }

// // // // // // //                 if (detections.length > 1) {
// // // // // // //                     handleViolation("Multiple Faces Detected: Another person entered the camera frame.");
// // // // // // //                     return;
// // // // // // //                 }

// // // // // // //                 const face = detections[0];
// // // // // // //                 const landmarks = face.landmarks;
// // // // // // //                 const leftEye = landmarks.getLeftEye();
// // // // // // //                 const rightEye = landmarks.getRightEye();
// // // // // // //                 const nose = landmarks.getNose();

// // // // // // //                 const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
// // // // // // //                 const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
// // // // // // //                 const eyeMidX = (leftEyeX + rightEyeX) / 2;

// // // // // // //                 const horizontalGazeDiff = Math.abs(nose[3].x - eyeMidX);
// // // // // // //                 const faceWidth = face.detection.box.width;

// // // // // // //                 if (horizontalGazeDiff > (faceWidth * 0.15)) {
// // // // // // //                     gazeAwayTimeRef.current += 2;
// // // // // // //                     if (gazeAwayTimeRef.current >= 8) {
// // // // // // //                         handleViolation("Gaze Tracking Alert: You looked away from the screen for too long.");
// // // // // // //                         gazeAwayTimeRef.current = 0;
// // // // // // //                     }
// // // // // // //                 } else {
// // // // // // //                     gazeAwayTimeRef.current = 0;
// // // // // // //                 }

// // // // // // //             } catch (err) {
// // // // // // //                 console.error("AI Inference Error:", err);
// // // // // // //             }
// // // // // // //         }, 2000);
// // // // // // //     };

// // // // // // //     // ─── 6. AUDIO MONITORING LOOP ──────────────────────────────────────────
// // // // // // //     const startAudioMonitoring = () => {
// // // // // // //         if (!analyserRef.current) return;
// // // // // // //         const bufferLength = analyserRef.current.frequencyBinCount;
// // // // // // //         const dataArray = new Uint8Array(bufferLength);

// // // // // // //         audioIntervalRef.current = setInterval(() => {
// // // // // // //             if (!analyserRef.current) return;
// // // // // // //             analyserRef.current.getByteFrequencyData(dataArray);

// // // // // // //             let sum = 0;
// // // // // // //             for (let i = 0; i < bufferLength; i++) {
// // // // // // //                 sum += dataArray[i];
// // // // // // //             }
// // // // // // //             const avgVolume = sum / bufferLength;

// // // // // // //             if (avgVolume > 40) {
// // // // // // //                 if (Date.now() - lastViolationTimeRef.current > 15000) {
// // // // // // //                     handleViolation("Audio Alert: Loud talking or background noise detected.");
// // // // // // //                 }
// // // // // // //             }
// // // // // // //         }, 1000);
// // // // // // //     };

// // // // // // //     // ─── 7. HANDLE VIOLATION ────────────────────────────────────────────────
// // // // // // //     const handleViolation = (reason: string) => {
// // // // // // //         const now = Date.now();
// // // // // // //         if (now - lastViolationTimeRef.current < 3000) return;
// // // // // // //         lastViolationTimeRef.current = now;

// // // // // // //         setViolationWarning(reason);
// // // // // // //         setViolationCount(prev => prev + 1);

// // // // // // //         const base64Frame = grabBase64FrameSync();
// // // // // // //         const timestampIso = new Date().toISOString();
// // // // // // //         const timestampId = Date.now();
// // // // // // //         const sessionRef = doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`);

// // // // // // //         setDoc(sessionRef, {
// // // // // // //             status: 'violation',
// // // // // // //             violationCount: increment(1),
// // // // // // //             latestWarning: reason,
// // // // // // //             lastHeartbeat: serverTimestamp()
// // // // // // //         }, { merge: true }).catch(console.error);

// // // // // // //         (async () => {
// // // // // // //             let downloadUrl: string | null = null;
// // // // // // //             if (base64Frame) {
// // // // // // //                 try {
// // // // // // //                     const storage = getStorage();
// // // // // // //                     const imageRef = fbStorageRef(storage, `proctoring/violations/${assessmentId}/${learnerId}_${timestampId}.jpg`);
// // // // // // //                     await uploadString(imageRef, base64Frame, 'data_url');
// // // // // // //                     downloadUrl = await getDownloadURL(imageRef);
// // // // // // //                 } catch (e) {
// // // // // // //                     console.error("Failed to upload violation snapshot", e);
// // // // // // //                 }
// // // // // // //             }

// // // // // // //             const violationEvent = { timestamp: timestampIso, reason, imageUrl: downloadUrl };
// // // // // // //             await setDoc(sessionRef, { violationHistory: arrayUnion(violationEvent) }, { merge: true }).catch(console.error);
// // // // // // //         })();
// // // // // // //     };

// // // // // // //     const grabBase64FrameSync = (): string | null => {
// // // // // // //         const video = pipVideoRef.current || gateVideoRef.current;
// // // // // // //         const canvas = canvasRef.current;
// // // // // // //         if (!video || !canvas || video.videoWidth === 0) return null;
// // // // // // //         const context = canvas.getContext('2d');
// // // // // // //         if (!context) return null;
// // // // // // //         canvas.width = Math.min(video.videoWidth, 640);
// // // // // // //         canvas.height = Math.min(video.videoHeight, 480);
// // // // // // //         context.drawImage(video, 0, 0, canvas.width, canvas.height);
// // // // // // //         return canvas.toDataURL('image/jpeg', 0.6);
// // // // // // //     };

// // // // // // //     // ─── 8. EVENT LISTENERS ────────────────────────────────────────────────
// // // // // // //     useEffect(() => {
// // // // // // //         if (!isProctored || !isReady) return;

// // // // // // //         const handleVisibilityChange = () => {
// // // // // // //             if (document.hidden && !violationWarning) handleViolation("Tab Switching Detected: You navigated away.");
// // // // // // //         };
// // // // // // //         const handleBlur = () => { if (!violationWarning) handleViolation("Window Focus Lost: You clicked outside."); };
// // // // // // //         const handleFullscreenChange = () => {
// // // // // // //             const docEl = document as any;
// // // // // // //             const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement);
// // // // // // //             if (!isCurrentlyFullscreen && !violationWarning) {
// // // // // // //                 setIsFullscreen(false);
// // // // // // //                 handleViolation("Fullscreen Exited: Assessments must be in fullscreen.");
// // // // // // //             }
// // // // // // //         };
// // // // // // //         const handleCopyPaste = (e: ClipboardEvent) => {
// // // // // // //             e.preventDefault();
// // // // // // //             if (!violationWarning) handleViolation(`${e.type.charAt(0).toUpperCase() + e.type.slice(1)} Attempt Detected: Clipboard actions are blocked.`);
// // // // // // //         };
// // // // // // //         const handleCustomViolation = (e: any) => { if (!violationWarning) handleViolation(e.detail || "Security violation detected."); };
// // // // // // //         const handleContextMenu = (e: Event) => e.preventDefault();
// // // // // // //         const handleKeyDown = (e: KeyboardEvent) => {
// // // // // // //             if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key)) || e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
// // // // // // //                 e.preventDefault();
// // // // // // //                 if (!violationWarning) handleViolation(`Forbidden shortcut detected: ${e.key}`);
// // // // // // //             }
// // // // // // //         };

// // // // // // //         document.addEventListener('visibilitychange', handleVisibilityChange);
// // // // // // //         window.addEventListener('blur', handleBlur);
// // // // // // //         document.addEventListener('fullscreenchange', handleFullscreenChange);
// // // // // // //         document.addEventListener('contextmenu', handleContextMenu);
// // // // // // //         document.addEventListener('proctorViolation', handleCustomViolation);
// // // // // // //         document.addEventListener('copy', handleCopyPaste);
// // // // // // //         document.addEventListener('cut', handleCopyPaste);
// // // // // // //         document.addEventListener('paste', handleCopyPaste);
// // // // // // //         document.addEventListener('keydown', handleKeyDown);

// // // // // // //         return () => {
// // // // // // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // // // // // //             window.removeEventListener('blur', handleBlur);
// // // // // // //             document.removeEventListener('fullscreenchange', handleFullscreenChange);
// // // // // // //             document.removeEventListener('contextmenu', handleContextMenu);
// // // // // // //             document.removeEventListener('proctorViolation', handleCustomViolation);
// // // // // // //             document.removeEventListener('copy', handleCopyPaste);
// // // // // // //             document.removeEventListener('cut', handleCopyPaste);
// // // // // // //             document.removeEventListener('paste', handleCopyPaste);
// // // // // // //             document.removeEventListener('keydown', handleKeyDown);
// // // // // // //         };
// // // // // // //     }, [isProctored, isReady, violationWarning]);

// // // // // // //     // ─── 9. DRAGGABLE PIP LOGIC ─────────────────────────────────────────────
// // // // // // //     useEffect(() => {
// // // // // // //         const handleMouseMove = (e: MouseEvent) => {
// // // // // // //             if (!dragRef.current.isDragging) return;
// // // // // // //             e.preventDefault();
// // // // // // //             const dx = e.clientX - dragRef.current.startX;
// // // // // // //             const dy = e.clientY - dragRef.current.startY;
// // // // // // //             let newX = dragRef.current.initialX + dx;
// // // // // // //             let newY = dragRef.current.initialY + dy;
// // // // // // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // // // // // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // // // // // //             setPipPos({ x: newX, y: newY });
// // // // // // //         };
// // // // // // //         const handleTouchMove = (e: TouchEvent) => {
// // // // // // //             if (!dragRef.current.isDragging) return;
// // // // // // //             e.preventDefault();
// // // // // // //             const touch = e.touches[0];
// // // // // // //             const dx = touch.clientX - dragRef.current.startX;
// // // // // // //             const dy = touch.clientY - dragRef.current.startY;
// // // // // // //             let newX = dragRef.current.initialX + dx;
// // // // // // //             let newY = dragRef.current.initialY + dy;
// // // // // // //             newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
// // // // // // //             newY = Math.max(0, Math.min(newY, window.innerHeight - 190));
// // // // // // //             setPipPos({ x: newX, y: newY });
// // // // // // //         };
// // // // // // //         const handleEndDrag = () => { dragRef.current.isDragging = false; };

// // // // // // //         window.addEventListener('mousemove', handleMouseMove);
// // // // // // //         window.addEventListener('mouseup', handleEndDrag);
// // // // // // //         window.addEventListener('touchmove', handleTouchMove, { passive: false });
// // // // // // //         window.addEventListener('touchend', handleEndDrag);

// // // // // // //         return () => {
// // // // // // //             window.removeEventListener('mousemove', handleMouseMove);
// // // // // // //             window.removeEventListener('mouseup', handleEndDrag);
// // // // // // //             window.removeEventListener('touchmove', handleTouchMove);
// // // // // // //             window.removeEventListener('touchend', handleEndDrag);
// // // // // // //         };
// // // // // // //     }, []);

// // // // // // //     const initiateDrag = (clientX: number, clientY: number) => {
// // // // // // //         dragRef.current.isDragging = true;
// // // // // // //         dragRef.current.startX = clientX;
// // // // // // //         dragRef.current.startY = clientY;
// // // // // // //         dragRef.current.initialX = pipPos.x;
// // // // // // //         dragRef.current.initialY = pipPos.y;
// // // // // // //     };

// // // // // // //     const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
// // // // // // //     const handleTouchStart = (e: React.TouchEvent) => {
// // // // // // //         const touch = e.touches[0];
// // // // // // //         initiateDrag(touch.clientX, touch.clientY);
// // // // // // //     };

// // // // // // //     // ─── RENDER ────────────────────────────────────────────────────────────
// // // // // // //     if (!isProctored) return <>{children}</>;

// // // // // // //     return (
// // // // // // //         <div ref={wrapperRef} className="pw-container">
// // // // // // //             <canvas ref={canvasRef} style={{ display: 'none' }} />

// // // // // // //             {!isReady && (
// // // // // // //                 <div className="lfm-overlay pw-gate-overlay">
// // // // // // //                     <div className="lfm-modal pw-gate-card">
// // // // // // //                         <div className="lfm-header">
// // // // // // //                             <h2 className="lfm-header__title" style={{ color: 'white' }}>
// // // // // // //                                 <ShieldAlert size={18} /> Secure AI Environment Setup
// // // // // // //                             </h2>
// // // // // // //                         </div>

// // // // // // //                         <div className="lfm-body pw-gate-body">
// // // // // // //                             <div className="pw-gate-intro">
// // // // // // //                                 <p>To begin or resume this assessment, you must establish a secure environment with AI face, gaze, and audio invigilation enabled.</p>
// // // // // // //                             </div>

// // // // // // //                             <div className="lfm-section-hdr">
// // // // // // //                                 <ShieldAlert size={13} /> Invigilation Prerequisites
// // // // // // //                             </div>

// // // // // // //                             <div className="pw-steps">
// // // // // // //                                 <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
// // // // // // //                                     <div className="pw-step-icon">
// // // // // // //                                         {hasCamera ? <CheckCircle size={18} /> : <Camera size={18} />}
// // // // // // //                                     </div>
// // // // // // //                                     <div className="pw-step-text">
// // // // // // //                                         <strong>Camera & Microphone</strong>
// // // // // // //                                         <span>{hasCamera ? 'Connected securely' : 'Required for live AI invigilation'}</span>
// // // // // // //                                     </div>
// // // // // // //                                     {!hasCamera && (
// // // // // // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={requestMediaAccess}>
// // // // // // //                                             Allow Access
// // // // // // //                                         </button>
// // // // // // //                                     )}
// // // // // // //                                 </div>

// // // // // // //                                 <div className={`pw-step ${aiModelsLoaded ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // // // // //                                     <div className="pw-step-icon">
// // // // // // //                                         {aiModelsLoaded ? <CheckCircle size={18} /> : <Loader2 className="lfm-spin" size={18} />}
// // // // // // //                                     </div>
// // // // // // //                                     <div className="pw-step-text">
// // // // // // //                                         <strong>AI Proctoring Engine</strong>
// // // // // // //                                         <span>{aiModelsLoaded ? 'Models Loaded & Verified' : 'Downloading neural weights...'}</span>
// // // // // // //                                     </div>
// // // // // // //                                 </div>

// // // // // // //                                 <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // // // // //                                     <div className="pw-step-icon">
// // // // // // //                                         {isFullscreen ? <CheckCircle size={18} /> : <Maximize size={18} />}
// // // // // // //                                     </div>
// // // // // // //                                     <div className="pw-step-text">
// // // // // // //                                         <strong>Fullscreen Mode</strong>
// // // // // // //                                         <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
// // // // // // //                                     </div>
// // // // // // //                                     {hasCamera && !isFullscreen && (
// // // // // // //                                         <button className="lfm-btn lfm-btn--primary pw-btn-small" onClick={enterFullscreen}>
// // // // // // //                                             Enter Fullscreen
// // // // // // //                                         </button>
// // // // // // //                                     )}
// // // // // // //                                 </div>
// // // // // // //                             </div>

// // // // // // //                             <video ref={gateVideoRef} autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }} />
// // // // // // //                         </div>
// // // // // // //                     </div>
// // // // // // //                 </div>
// // // // // // //             )}

// // // // // // //             {isReady && (
// // // // // // //                 <div className="pw-content">
// // // // // // //                     {children}
// // // // // // //                     <div className="pw-pip" style={{ left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }}>
// // // // // // //                         <div className="pw-pip-header" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
// // // // // // //                             <div className="pw-pip-title">
// // // // // // //                                 {isAiActive ? <ScanFace size={13} className="pw-pulse" /> : <Video size={13} className="pw-pulse" />}
// // // // // // //                                 <span>{isAiActive ? 'AI Tracking Active' : 'Live Recording'}</span>
// // // // // // //                             </div>
// // // // // // //                             <span className="pw-pip-drag-hint">(Drag)</span>
// // // // // // //                         </div>
// // // // // // //                         <video ref={pipVideoRef} autoPlay muted playsInline className="pw-pip-video" />
// // // // // // //                     </div>
// // // // // // //                 </div>
// // // // // // //             )}

// // // // // // //             {violationWarning && createPortal(
// // // // // // //                 <div className="lfm-overlay pw-violation-overlay">
// // // // // // //                     <div className="lfm-modal pw-violation-card">
// // // // // // //                         <div className="lfm-header pw-violation-header">
// // // // // // //                             <h2 className="lfm-header__title">
// // // // // // //                                 <MonitorX size={18} /> Security Violation Detected
// // // // // // //                             </h2>
// // // // // // //                         </div>
// // // // // // //                         <div className="lfm-body pw-violation-body">
// // // // // // //                             <div className="lfm-error-banner">
// // // // // // //                                 <AlertCircle size={18} />
// // // // // // //                                 <span>{violationWarning}</span>
// // // // // // //                             </div>

// // // // // // //                             <div className="pw-violation-stats">
// // // // // // //                                 <span>Total Violations Logged: <strong>{violationCount}</strong></span>
// // // // // // //                             </div>

// // // // // // //                             <p className="pw-violation-sub">
// // // // // // //                                 Your webcam and AI tracking engine captured this event. It has been permanently logged to the Invigilator Dashboard.
// // // // // // //                             </p>

// // // // // // //                             <button
// // // // // // //                                 className="lfm-btn pw-btn-danger"
// // // // // // //                                 onClick={() => {
// // // // // // //                                     setViolationWarning(null);
// // // // // // //                                     setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), { status: 'active', latestWarning: null }, { merge: true });
// // // // // // //                                     if (!document.fullscreenElement) enterFullscreen();
// // // // // // //                                 }}
// // // // // // //                             >
// // // // // // //                                 I Understand, Return to Assessment
// // // // // // //                             </button>
// // // // // // //                         </div>
// // // // // // //                     </div>
// // // // // // //                 </div>,
// // // // // // //                 document.body
// // // // // // //             )}
// // // // // // //         </div>
// // // // // // //     );
// // // // // // // };


// // // // // // // // import React, { useState, useEffect, useRef } from 'react';
// // // // // // // // import { Camera, Maximize, AlertTriangle, MonitorX, ShieldAlert, CheckCircle, Video } from 'lucide-react';
// // // // // // // // import { createPortal } from 'react-dom';
// // // // // // // // import { doc, setDoc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
// // // // // // // // import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
// // // // // // // // import { db } from '../../../lib/firebase';
// // // // // // // // import { useStore } from '../../../store/useStore';
// // // // // // // // import { useToast } from '../Toast/Toast';
// // // // // // // // import './ProctoringWrapper.css';

// // // // // // // // interface ProctoringWrapperProps {
// // // // // // // //     children: React.ReactNode;
// // // // // // // //     assessmentId: string;
// // // // // // // //     learnerId: string;
// // // // // // // //     isProctored: boolean;
// // // // // // // // }

// // // // // // // // export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
// // // // // // // //     const { user } = useStore();
// // // // // // // //     const toast = useToast();

// // // // // // // //     const [isReady, setIsReady] = useState(!isProctored);
// // // // // // // //     const [hasCamera, setHasCamera] = useState(false);
// // // // // // // //     const [hasMic, setHasMic] = useState(false);
// // // // // // // //     const [isFullscreen, setIsFullscreen] = useState(false);
// // // // // // // //     const [violationWarning, setViolationWarning] = useState<string | null>(null);
// // // // // // // //     const [violationCount, setViolationCount] = useState(0);

// // // // // // // //     // 🚀 DRAGGABLE PIP STATE
// // // // // // // //     const [pipPos, setPipPos] = useState(() => ({
// // // // // // // //         x: typeof window !== 'undefined' ? window.innerWidth - 230 : 0,
// // // // // // // //         y: typeof window !== 'undefined' ? window.innerHeight - 180 : 0
// // // // // // // //     }));
// // // // // // // //     const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

// // // // // // // //     const gateVideoRef = useRef<HTMLVideoElement | null>(null);
// // // // // // // //     const pipVideoRef = useRef<HTMLVideoElement | null>(null);
// // // // // // // //     const streamRef = useRef<MediaStream | null>(null);
// // // // // // // //     const wrapperRef = useRef<HTMLDivElement>(null);
// // // // // // // //     const canvasRef = useRef<HTMLCanvasElement>(null);
// // // // // // // //     const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

// // // // // // // //     const lastViolationTimeRef = useRef<number>(0);

// // // // // // // //     // ─── 1. INITIALIZE WEBCAM ──────────────────────────────────────────────
// // // // // // // //     const requestMediaAccess = async () => {
// // // // // // // //         try {
// // // // // // // //             const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
// // // // // // // //             streamRef.current = stream;

// // // // // // // //             if (gateVideoRef.current) {
// // // // // // // //                 gateVideoRef.current.srcObject = stream;
// // // // // // // //                 gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
// // // // // // // //             }
// // // // // // // //             if (pipVideoRef.current) {
// // // // // // // //                 pipVideoRef.current.srcObject = stream;
// // // // // // // //                 pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
// // // // // // // //             }

// // // // // // // //             setHasCamera(true);
// // // // // // // //             setHasMic(true);
// // // // // // // //             toast.success("Camera and Microphone connected securely.");
// // // // // // // //         } catch (err: any) {
// // // // // // // //             console.error("Media access error:", err);
// // // // // // // //             if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
// // // // // // // //                 toast.error("Hardware Missing: No camera or microphone was detected on this device.");
// // // // // // // //             } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
// // // // // // // //                 toast.error("Permission Denied: You must click 'Allow' in your browser URL bar.");
// // // // // // // //             } else {
// // // // // // // //                 toast.error("Failed to access camera. Please check your device settings.");
// // // // // // // //             }
// // // // // // // //         }
// // // // // // // //     };

// // // // // // // //     // ─── 2. VIDEO ELEMENT STREAM ASSIGNMENT ────────────────────────────────
// // // // // // // //     useEffect(() => {
// // // // // // // //         if (gateVideoRef.current && streamRef.current) {
// // // // // // // //             gateVideoRef.current.srcObject = streamRef.current;
// // // // // // // //             gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
// // // // // // // //         }
// // // // // // // //     }, [gateVideoRef.current, streamRef.current]);

// // // // // // // //     useEffect(() => {
// // // // // // // //         if (pipVideoRef.current && streamRef.current) {
// // // // // // // //             pipVideoRef.current.srcObject = streamRef.current;
// // // // // // // //             pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
// // // // // // // //         }
// // // // // // // //     }, [pipVideoRef.current, streamRef.current]);

// // // // // // // //     // Cleanup
// // // // // // // //     useEffect(() => {
// // // // // // // //         return () => {
// // // // // // // //             if (streamRef.current) {
// // // // // // // //                 streamRef.current.getTracks().forEach(track => track.stop());
// // // // // // // //             }
// // // // // // // //             if (heartbeatIntervalRef.current) {
// // // // // // // //                 clearInterval(heartbeatIntervalRef.current);
// // // // // // // //             }
// // // // // // // //             if (isProctored && assessmentId && learnerId) {
// // // // // // // //                 setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
// // // // // // // //                     status: 'offline',
// // // // // // // //                     lastHeartbeat: serverTimestamp()
// // // // // // // //                 }, { merge: true }).catch(console.error);
// // // // // // // //             }
// // // // // // // //         };
// // // // // // // //     }, [isProctored, assessmentId, learnerId]);

// // // // // // // //     // ─── 3. FULLSCREEN LOGIC ───────────────────────────────────────────────
// // // // // // // //     const enterFullscreen = async () => {
// // // // // // // //         if (!wrapperRef.current) return;
// // // // // // // //         try {
// // // // // // // //             if (wrapperRef.current.requestFullscreen) {
// // // // // // // //                 await wrapperRef.current.requestFullscreen();
// // // // // // // //             } else if ((wrapperRef.current as any).webkitRequestFullscreen) {
// // // // // // // //                 await (wrapperRef.current as any).webkitRequestFullscreen();
// // // // // // // //             } else if ((wrapperRef.current as any).msRequestFullscreen) {
// // // // // // // //                 await (wrapperRef.current as any).msRequestFullscreen();
// // // // // // // //             }
// // // // // // // //             setIsFullscreen(true);
// // // // // // // //             setIsReady(true);
// // // // // // // //             startLightweightHeartbeat();
// // // // // // // //         } catch (err) {
// // // // // // // //             toast.error("Failed to enter fullscreen mode.");
// // // // // // // //         }
// // // // // // // //     };

// // // // // // // //     // ─── 4. LIGHTWEIGHT HEARTBEAT ──────────────────────────────────────────
// // // // // // // //     const startLightweightHeartbeat = () => {
// // // // // // // //         const sendPing = () => {
// // // // // // // //             if (!assessmentId || !learnerId) return;
// // // // // // // //             setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
// // // // // // // //                 assessmentId,
// // // // // // // //                 learnerId,
// // // // // // // //                 learnerName: user?.fullName || 'Unknown Learner',
// // // // // // // //                 status: 'active',
// // // // // // // //                 lastHeartbeat: serverTimestamp()
// // // // // // // //             }, { merge: true }).catch(console.error);
// // // // // // // //         };
// // // // // // // //         sendPing();
// // // // // // // //         heartbeatIntervalRef.current = setInterval(sendPing, 30000);
// // // // // // // //     };

// // // // // // // //     // ─── 5. TRUE SYNCHRONOUS SNAPSHOT ──────────────────────────────────────
// // // // // // // //     const grabBase64FrameSync = (): string | null => {
// // // // // // // //         const video = pipVideoRef.current || gateVideoRef.current;
// // // // // // // //         const canvas = canvasRef.current;

// // // // // // // //         if (!video || !canvas || video.videoWidth === 0) {
// // // // // // // //             return null;
// // // // // // // //         }

// // // // // // // //         const context = canvas.getContext('2d');
// // // // // // // //         if (!context) return null;

// // // // // // // //         canvas.width = Math.min(video.videoWidth, 640);
// // // // // // // //         canvas.height = Math.min(video.videoHeight, 480);
// // // // // // // //         context.drawImage(video, 0, 0, canvas.width, canvas.height);

// // // // // // // //         return canvas.toDataURL('image/jpeg', 0.6);
// // // // // // // //     };

// // // // // // // //     // ─── 6. HANDLE VIOLATION ────────────────────────────────────────────────
// // // // // // // //     const handleViolation = (reason: string) => {
// // // // // // // //         const now = Date.now();
// // // // // // // //         if (now - lastViolationTimeRef.current < 1000) return;
// // // // // // // //         lastViolationTimeRef.current = now;

// // // // // // // //         setViolationWarning(reason);
// // // // // // // //         setViolationCount(prev => prev + 1);

// // // // // // // //         const base64Frame = grabBase64FrameSync();
// // // // // // // //         const timestampIso = new Date().toISOString();
// // // // // // // //         const timestampId = Date.now();
// // // // // // // //         const sessionRef = doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`);

// // // // // // // //         setDoc(sessionRef, {
// // // // // // // //             status: 'violation',
// // // // // // // //             violationCount: increment(1),
// // // // // // // //             latestWarning: reason,
// // // // // // // //             lastHeartbeat: serverTimestamp()
// // // // // // // //         }, { merge: true }).catch(console.error);

// // // // // // // //         (async () => {
// // // // // // // //             let downloadUrl: string | null = null;

// // // // // // // //             if (base64Frame) {
// // // // // // // //                 try {
// // // // // // // //                     const storage = getStorage();
// // // // // // // //                     const imageRef = fbStorageRef(storage, `proctoring/violations/${assessmentId}/${learnerId}_${timestampId}.jpg`);
// // // // // // // //                     await uploadString(imageRef, base64Frame, 'data_url');
// // // // // // // //                     downloadUrl = await getDownloadURL(imageRef);
// // // // // // // //                 } catch (e) {
// // // // // // // //                     console.error("Failed to upload violation snapshot", e);
// // // // // // // //                 }
// // // // // // // //             }

// // // // // // // //             const violationEvent = {
// // // // // // // //                 timestamp: timestampIso,
// // // // // // // //                 reason: reason,
// // // // // // // //                 imageUrl: downloadUrl
// // // // // // // //             };

// // // // // // // //             await setDoc(sessionRef, {
// // // // // // // //                 violationHistory: arrayUnion(violationEvent),
// // // // // // // //                 snapshotUrl: downloadUrl
// // // // // // // //             }, { merge: true }).catch(console.error);

// // // // // // // //         })();
// // // // // // // //     };

// // // // // // // //     // ─── 7. EVENT LISTENERS ────────────────────────────────────────────────
// // // // // // // //     useEffect(() => {
// // // // // // // //         if (!isProctored || !isReady) return;

// // // // // // // //         const handleVisibilityChange = () => {
// // // // // // // //             if (document.hidden && !violationWarning) {
// // // // // // // //                 handleViolation("Tab Switching Detected: You navigated away from the assessment browser tab.");
// // // // // // // //             }
// // // // // // // //         };

// // // // // // // //         const handleBlur = () => {
// // // // // // // //             if (!violationWarning) {
// // // // // // // //                 handleViolation("Window Focus Lost: You clicked outside the assessment window or opened another application.");
// // // // // // // //             }
// // // // // // // //         };

// // // // // // // //         const handleFullscreenChange = () => {
// // // // // // // //             const docEl = document as any;
// // // // // // // //             const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement || docEl.mozFullScreenElement || docEl.msFullscreenElement || docEl.webkitIsFullScreen || docEl.mozFullScreen);

// // // // // // // //             if (!isCurrentlyFullscreen && !violationWarning) {
// // // // // // // //                 setIsFullscreen(false);
// // // // // // // //                 handleViolation("Fullscreen Exited: Assessments must be completed in a locked fullscreen environment.");
// // // // // // // //             }
// // // // // // // //         };

// // // // // // // //         const handleCopyPaste = (e: ClipboardEvent) => {
// // // // // // // //             e.preventDefault();
// // // // // // // //             if (!violationWarning) {
// // // // // // // //                 const reason = e.type === 'copy' ? "Copy Attempt Detected" :
// // // // // // // //                     (e.type === 'cut' ? "Cut Attempt Detected" : "Paste Attempt Detected");
// // // // // // // //                 handleViolation(`${reason}: Clipboard actions are not allowed during proctored assessments.`);
// // // // // // // //             }
// // // // // // // //         };

// // // // // // // //         const handleCustomViolation = (e: any) => {
// // // // // // // //             if (!violationWarning) {
// // // // // // // //                 handleViolation(e.detail || "Security violation detected.");
// // // // // // // //             }
// // // // // // // //         };

// // // // // // // //         const handleContextMenu = (e: Event) => e.preventDefault();
// // // // // // // //         const handleKeyDown = (e: KeyboardEvent) => {
// // // // // // // //             if ((e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'x')) ||
// // // // // // // //                 e.key === 'F12' ||
// // // // // // // //                 (e.ctrlKey && e.shiftKey && e.key === 'I')) {
// // // // // // // //                 e.preventDefault();
// // // // // // // //                 if (!violationWarning) {
// // // // // // // //                     handleViolation(`Forbidden keyboard shortcut detected: ${e.key} ${e.ctrlKey ? 'Ctrl+' : ''}`);
// // // // // // // //                 }
// // // // // // // //             }
// // // // // // // //         };

// // // // // // // //         document.addEventListener('visibilitychange', handleVisibilityChange);
// // // // // // // //         window.addEventListener('blur', handleBlur);
// // // // // // // //         document.addEventListener('fullscreenchange', handleFullscreenChange);
// // // // // // // //         document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
// // // // // // // //         document.addEventListener('contextmenu', handleContextMenu);
// // // // // // // //         document.addEventListener('proctorViolation', handleCustomViolation);
// // // // // // // //         document.addEventListener('copy', handleCopyPaste);
// // // // // // // //         document.addEventListener('cut', handleCopyPaste);
// // // // // // // //         document.addEventListener('paste', handleCopyPaste);
// // // // // // // //         document.addEventListener('keydown', handleKeyDown);

// // // // // // // //         return () => {
// // // // // // // //             document.removeEventListener('visibilitychange', handleVisibilityChange);
// // // // // // // //             window.removeEventListener('blur', handleBlur);
// // // // // // // //             document.removeEventListener('fullscreenchange', handleFullscreenChange);
// // // // // // // //             document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
// // // // // // // //             document.removeEventListener('contextmenu', handleContextMenu);
// // // // // // // //             document.removeEventListener('proctorViolation', handleCustomViolation);
// // // // // // // //             document.removeEventListener('copy', handleCopyPaste);
// // // // // // // //             document.removeEventListener('cut', handleCopyPaste);
// // // // // // // //             document.removeEventListener('paste', handleCopyPaste);
// // // // // // // //             document.removeEventListener('keydown', handleKeyDown);
// // // // // // // //         };
// // // // // // // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // // // // // // //     }, [isProctored, isReady, violationWarning]);

// // // // // // // //     // ─── 🚀 8. DRAGGABLE PIP LOGIC ─────────────────────────────────────────
// // // // // // // //     useEffect(() => {
// // // // // // // //         const handleMouseMove = (e: MouseEvent) => {
// // // // // // // //             if (!dragRef.current.isDragging) return;
// // // // // // // //             e.preventDefault(); // Prevent text selection while dragging
// // // // // // // //             const dx = e.clientX - dragRef.current.startX;
// // // // // // // //             const dy = e.clientY - dragRef.current.startY;

// // // // // // // //             let newX = dragRef.current.initialX + dx;
// // // // // // // //             let newY = dragRef.current.initialY + dy;

// // // // // // // //             // Boundary checks (keep it on screen)
// // // // // // // //             const winWidth = window.innerWidth;
// // // // // // // //             const winHeight = window.innerHeight;
// // // // // // // //             const pipWidth = 214; // 210px width + 2px border * 2
// // // // // // // //             const pipHeight = 180; // approx height

// // // // // // // //             newX = Math.max(0, Math.min(newX, winWidth - pipWidth));
// // // // // // // //             newY = Math.max(0, Math.min(newY, winHeight - pipHeight));

// // // // // // // //             setPipPos({ x: newX, y: newY });
// // // // // // // //         };

// // // // // // // //         const handleTouchMove = (e: TouchEvent) => {
// // // // // // // //             if (!dragRef.current.isDragging) return;
// // // // // // // //             e.preventDefault();
// // // // // // // //             const touch = e.touches[0];
// // // // // // // //             const dx = touch.clientX - dragRef.current.startX;
// // // // // // // //             const dy = touch.clientY - dragRef.current.startY;

// // // // // // // //             let newX = dragRef.current.initialX + dx;
// // // // // // // //             let newY = dragRef.current.initialY + dy;

// // // // // // // //             const winWidth = window.innerWidth;
// // // // // // // //             const winHeight = window.innerHeight;
// // // // // // // //             const pipWidth = 214;
// // // // // // // //             const pipHeight = 180;

// // // // // // // //             newX = Math.max(0, Math.min(newX, winWidth - pipWidth));
// // // // // // // //             newY = Math.max(0, Math.min(newY, winHeight - pipHeight));

// // // // // // // //             setPipPos({ x: newX, y: newY });
// // // // // // // //         };

// // // // // // // //         const handleEndDrag = () => {
// // // // // // // //             dragRef.current.isDragging = false;
// // // // // // // //         };

// // // // // // // //         window.addEventListener('mousemove', handleMouseMove);
// // // // // // // //         window.addEventListener('mouseup', handleEndDrag);
// // // // // // // //         window.addEventListener('touchmove', handleTouchMove, { passive: false });
// // // // // // // //         window.addEventListener('touchend', handleEndDrag);

// // // // // // // //         return () => {
// // // // // // // //             window.removeEventListener('mousemove', handleMouseMove);
// // // // // // // //             window.removeEventListener('mouseup', handleEndDrag);
// // // // // // // //             window.removeEventListener('touchmove', handleTouchMove);
// // // // // // // //             window.removeEventListener('touchend', handleEndDrag);
// // // // // // // //         };
// // // // // // // //     }, []);

// // // // // // // //     const initiateDrag = (clientX: number, clientY: number) => {
// // // // // // // //         dragRef.current.isDragging = true;
// // // // // // // //         dragRef.current.startX = clientX;
// // // // // // // //         dragRef.current.startY = clientY;
// // // // // // // //         dragRef.current.initialX = pipPos.x;
// // // // // // // //         dragRef.current.initialY = pipPos.y;
// // // // // // // //     };

// // // // // // // //     const handleMouseDown = (e: React.MouseEvent) => initiateDrag(e.clientX, e.clientY);
// // // // // // // //     const handleTouchStart = (e: React.TouchEvent) => {
// // // // // // // //         const touch = e.touches[0];
// // // // // // // //         initiateDrag(touch.clientX, touch.clientY);
// // // // // // // //     };

// // // // // // // //     // ─── RENDER ────────────────────────────────────────────────────────────
// // // // // // // //     if (!isProctored) return <>{children}</>;

// // // // // // // //     return (
// // // // // // // //         <div ref={wrapperRef} className="pw-container">
// // // // // // // //             <canvas ref={canvasRef} style={{ display: 'none' }} />

// // // // // // // //             {!isReady && (
// // // // // // // //                 <div className="pw-gate animate-fade-in">
// // // // // // // //                     <div className="pw-gate-card">
// // // // // // // //                         <div className="pw-gate-icon"><ShieldAlert size={40} color="#0369a1" /></div>

// // // // // // // //                         <h2>Secure Environment Required</h2>
// // // // // // // //                         <p>To begin or resume this assessment, you must re-establish a secure environment.</p>

// // // // // // // //                         <div className="pw-steps">
// // // // // // // //                             <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
// // // // // // // //                                 <div className="pw-step-icon">{hasCamera ? <CheckCircle size={20} /> : <Camera size={20} />}</div>
// // // // // // // //                                 <div className="pw-step-text">
// // // // // // // //                                     <strong>Camera & Microphone</strong>
// // // // // // // //                                     <span>{hasCamera ? 'Connected securely' : 'Required for live invigilation'}</span>
// // // // // // // //                                 </div>
// // // // // // // //                                 {!hasCamera && <button className="pw-btn-small" onClick={requestMediaAccess}>Allow Access</button>}
// // // // // // // //                             </div>

// // // // // // // //                             <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
// // // // // // // //                                 <div className="pw-step-icon">{isFullscreen ? <CheckCircle size={20} /> : <Maximize size={20} />}</div>
// // // // // // // //                                 <div className="pw-step-text">
// // // // // // // //                                     <strong>Fullscreen Mode</strong>
// // // // // // // //                                     <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
// // // // // // // //                                 </div>
// // // // // // // //                                 {hasCamera && !isFullscreen && <button className="pw-btn-small" onClick={enterFullscreen}>Enter Fullscreen</button>}
// // // // // // // //                             </div>
// // // // // // // //                         </div>

// // // // // // // //                         <video
// // // // // // // //                             ref={gateVideoRef}
// // // // // // // //                             autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }}
// // // // // // // //                         />
// // // // // // // //                     </div>
// // // // // // // //                 </div>
// // // // // // // //             )}

// // // // // // // //             {isReady && (
// // // // // // // //                 <div className="pw-content">
// // // // // // // //                     {children}
// // // // // // // //                     <div
// // // // // // // //                         className="pw-pip"
// // // // // // // //                         style={{
// // // // // // // //                             left: `${pipPos.x}px`,
// // // // // // // //                             top: `${pipPos.y}px`,
// // // // // // // //                             right: 'auto',
// // // // // // // //                             bottom: 'auto'
// // // // // // // //                         }}
// // // // // // // //                     >
// // // // // // // //                         <div
// // // // // // // //                             className="pw-pip-header"
// // // // // // // //                             onMouseDown={handleMouseDown}
// // // // // // // //                             onTouchStart={handleTouchStart}
// // // // // // // //                         >
// // // // // // // //                             <Video size={12} className="animate-pulse" color="#ef4444" /> Live Recording (Drag to Move)
// // // // // // // //                         </div>
// // // // // // // //                         <video
// // // // // // // //                             ref={pipVideoRef}
// // // // // // // //                             autoPlay muted playsInline className="pw-pip-video"
// // // // // // // //                         />
// // // // // // // //                     </div>
// // // // // // // //                 </div>
// // // // // // // //             )}

// // // // // // // //             {violationWarning && createPortal(
// // // // // // // //                 <div className="pw-violation-overlay animate-fade-in">
// // // // // // // //                     <div className="pw-violation-card">
// // // // // // // //                         <MonitorX size={48} color="#ef4444" />
// // // // // // // //                         <h2 className="pw-violation-title">Security Violation Detected</h2>
// // // // // // // //                         <p className="pw-violation-reason">{violationWarning}</p>
// // // // // // // //                         <div className="pw-violation-log">Total Violations Logged: <strong>{violationCount}</strong></div>
// // // // // // // //                         <p className="pw-violation-sub">Your webcam captured this event. It has been permanently logged to the Invigilator Dashboard.</p>
// // // // // // // //                         <button
// // // // // // // //                             className="pw-btn-danger"
// // // // // // // //                             onClick={() => {
// // // // // // // //                                 setViolationWarning(null);
// // // // // // // //                                 setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), { status: 'active', latestWarning: null }, { merge: true });
// // // // // // // //                                 if (!document.fullscreenElement) enterFullscreen();
// // // // // // // //                             }}
// // // // // // // //                         >
// // // // // // // //                             I Understand, Return to Assessment
// // // // // // // //                         </button>
// // // // // // // //                     </div>
// // // // // // // //                 </div>,
// // // // // // // //                 document.body
// // // // // // // //             )}
// // // // // // // //         </div>
// // // // // // // //     );
// // // // // // // // };