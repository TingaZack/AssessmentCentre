import React, { useState, useEffect, useRef } from 'react';
import { Camera, Maximize, AlertTriangle, MonitorX, ShieldAlert, CheckCircle, Video } from 'lucide-react';
import { createPortal } from 'react-dom';
import { doc, setDoc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { getStorage, ref as fbStorageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../Toast/Toast';
import './ProctoringWrapper.css';

interface ProctoringWrapperProps {
    children: React.ReactNode;
    assessmentId: string;
    learnerId: string;
    isProctored: boolean;
}

export const ProctoringWrapper: React.FC<ProctoringWrapperProps> = ({ children, assessmentId, learnerId, isProctored }) => {
    const { user } = useStore();
    const toast = useToast();

    const [isReady, setIsReady] = useState(!isProctored);
    const [hasCamera, setHasCamera] = useState(false);
    const [hasMic, setHasMic] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [violationWarning, setViolationWarning] = useState<string | null>(null);
    const [violationCount, setViolationCount] = useState(0);

    const gateVideoRef = useRef<HTMLVideoElement | null>(null);
    const pipVideoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Throttle to prevent multiple violations within 1 second
    const lastViolationTimeRef = useRef<number>(0);

    // ─── 1. INITIALIZE WEBCAM ──────────────────────────────────────────────
    const requestMediaAccess = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;

            // Attach stream to both video elements if they exist
            if (gateVideoRef.current) {
                gateVideoRef.current.srcObject = stream;
                gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
            }
            if (pipVideoRef.current) {
                pipVideoRef.current.srcObject = stream;
                pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
            }

            setHasCamera(true);
            setHasMic(true);
            toast.success("Camera and Microphone connected securely.");
        } catch (err: any) {
            console.error("Media access error:", err);
            if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                toast.error("Hardware Missing: No camera or microphone was detected on this device.");
            } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                toast.error("Permission Denied: You must click 'Allow' in your browser URL bar.");
            } else {
                toast.error("Failed to access camera. Please check your device settings.");
            }
        }
    };

    // ─── 2. VIDEO ELEMENT STREAM ASSIGNMENT ────────────────────────────────
    useEffect(() => {
        if (gateVideoRef.current && streamRef.current) {
            gateVideoRef.current.srcObject = streamRef.current;
            gateVideoRef.current.play().catch(e => console.warn("Gate video play failed:", e));
        }
    }, [gateVideoRef.current, streamRef.current]);

    useEffect(() => {
        if (pipVideoRef.current && streamRef.current) {
            pipVideoRef.current.srcObject = streamRef.current;
            pipVideoRef.current.play().catch(e => console.warn("PiP video play failed:", e));
        }
    }, [pipVideoRef.current, streamRef.current]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
            if (isProctored && assessmentId && learnerId) {
                setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
                    status: 'offline',
                    lastHeartbeat: serverTimestamp()
                }, { merge: true }).catch(console.error);
            }
        };
    }, [isProctored, assessmentId, learnerId]);

    // ─── 3. FULLSCREEN LOGIC ───────────────────────────────────────────────
    const enterFullscreen = async () => {
        if (!wrapperRef.current) return;
        try {
            if (wrapperRef.current.requestFullscreen) {
                await wrapperRef.current.requestFullscreen();
            } else if ((wrapperRef.current as any).webkitRequestFullscreen) {
                await (wrapperRef.current as any).webkitRequestFullscreen();
            } else if ((wrapperRef.current as any).msRequestFullscreen) {
                await (wrapperRef.current as any).msRequestFullscreen();
            }
            setIsFullscreen(true);
            setIsReady(true);
            startLightweightHeartbeat();
        } catch (err) {
            toast.error("Failed to enter fullscreen mode.");
        }
    };

    // ─── 4. LIGHTWEIGHT HEARTBEAT ──────────────────────────────────────────
    const startLightweightHeartbeat = () => {
        const sendPing = () => {
            if (!assessmentId || !learnerId) return;
            setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), {
                assessmentId,
                learnerId,
                learnerName: user?.fullName || 'Unknown Learner',
                status: 'active',
                lastHeartbeat: serverTimestamp()
            }, { merge: true }).catch(console.error);
        };
        sendPing(); // Initial ping
        heartbeatIntervalRef.current = setInterval(sendPing, 30000);
    };

    // ─── 5. TRUE SYNCHRONOUS SNAPSHOT ──────────────────────────────────────
    const grabBase64FrameSync = (): string | null => {
        const video = pipVideoRef.current || gateVideoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || video.videoWidth === 0) {
            return null;
        }

        const context = canvas.getContext('2d');
        if (!context) return null;

        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = Math.min(video.videoHeight, 480);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.6);
    };

    // ─── 6. HANDLE VIOLATION (FIXED RACE CONDITION) ────────────────────────
    const handleViolation = (reason: string) => {
        const now = Date.now();
        if (now - lastViolationTimeRef.current < 1000) return; // Strict 1s throttle
        lastViolationTimeRef.current = now;

        setViolationWarning(reason);
        setViolationCount(prev => prev + 1);

        // 1. IMMEDIATELY grab the frame synchronously before Mac sleeps the tab
        const base64Frame = grabBase64FrameSync();
        const timestampIso = new Date().toISOString();
        const timestampId = Date.now();
        const sessionRef = doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`);

        // 2. IMMEDIATELY trigger the red flash on the Invigilator Dashboard
        setDoc(sessionRef, {
            status: 'violation',
            violationCount: increment(1),
            latestWarning: reason,
            lastHeartbeat: serverTimestamp()
        }, { merge: true }).catch(console.error);

        // 3. BACKGROUND TASK: Upload image, then atomically append to history array
        (async () => {
            let downloadUrl: string | null = null;

            if (base64Frame) {
                try {
                    const storage = getStorage();
                    const imageRef = fbStorageRef(storage, `proctoring/violations/${assessmentId}/${learnerId}_${timestampId}.jpg`);
                    await uploadString(imageRef, base64Frame, 'data_url');
                    downloadUrl = await getDownloadURL(imageRef);
                } catch (e) {
                    console.error("Failed to upload violation snapshot", e);
                }
            }

            // Push the *completed* record into the array to avoid race conditions
            const violationEvent = {
                timestamp: timestampIso,
                reason: reason,
                imageUrl: downloadUrl
            };

            await setDoc(sessionRef, {
                violationHistory: arrayUnion(violationEvent),
                snapshotUrl: downloadUrl // Keeping the legacy root field updated just in case
            }, { merge: true }).catch(console.error);

        })();
    };

    // ─── 7. EVENT LISTENERS ────────────────────────────────────────────────
    useEffect(() => {
        if (!isProctored || !isReady) return;

        const handleVisibilityChange = () => {
            if (document.hidden && !violationWarning) {
                handleViolation("Tab Switching Detected: You navigated away from the assessment browser tab.");
            }
        };

        const handleBlur = () => {
            if (!violationWarning) {
                handleViolation("Window Focus Lost: You clicked outside the assessment window or opened another application.");
            }
        };

        const handleFullscreenChange = () => {
            const docEl = document as any;
            const isCurrentlyFullscreen = !!(docEl.fullscreenElement || docEl.webkitFullscreenElement || docEl.mozFullScreenElement || docEl.msFullscreenElement || docEl.webkitIsFullScreen || docEl.mozFullScreen);

            if (!isCurrentlyFullscreen && !violationWarning) {
                setIsFullscreen(false);
                handleViolation("Fullscreen Exited: Assessments must be completed in a locked fullscreen environment.");
            }
        };

        const handleCopyPaste = (e: ClipboardEvent) => {
            e.preventDefault();
            if (!violationWarning) {
                const reason = e.type === 'copy' ? "Copy Attempt Detected" :
                    (e.type === 'cut' ? "Cut Attempt Detected" : "Paste Attempt Detected");
                handleViolation(`${reason}: Clipboard actions are not allowed during proctored assessments.`);
            }
        };

        const handleCustomViolation = (e: any) => {
            if (!violationWarning) {
                handleViolation(e.detail || "Security violation detected.");
            }
        };

        const handleContextMenu = (e: Event) => e.preventDefault();
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'x')) ||
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                e.preventDefault();
                if (!violationWarning) {
                    handleViolation(`Forbidden keyboard shortcut detected: ${e.key} ${e.ctrlKey ? 'Ctrl+' : ''}`);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
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
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('proctorViolation', handleCustomViolation);
            document.removeEventListener('copy', handleCopyPaste);
            document.removeEventListener('cut', handleCopyPaste);
            document.removeEventListener('paste', handleCopyPaste);
            document.removeEventListener('keydown', handleKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isProctored, isReady, violationWarning]);

    // ─── RENDER ────────────────────────────────────────────────────────────
    if (!isProctored) return <>{children}</>;

    return (
        <div ref={wrapperRef} className="pw-container">
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {!isReady && (
                <div className="pw-gate animate-fade-in">
                    <div className="pw-gate-card">
                        <div className="pw-gate-icon"><ShieldAlert size={40} color="#0369a1" /></div>

                        <h2>Secure Environment Required</h2>
                        <p>To begin or resume this assessment, you must re-establish a secure environment.</p>

                        <div className="pw-steps">
                            <div className={`pw-step ${hasCamera ? 'pw-step--done' : ''}`}>
                                <div className="pw-step-icon">{hasCamera ? <CheckCircle size={20} /> : <Camera size={20} />}</div>
                                <div className="pw-step-text">
                                    <strong>Camera & Microphone</strong>
                                    <span>{hasCamera ? 'Connected securely' : 'Required for live invigilation'}</span>
                                </div>
                                {!hasCamera && <button className="pw-btn-small" onClick={requestMediaAccess}>Allow Access</button>}
                            </div>

                            <div className={`pw-step ${isFullscreen ? 'pw-step--done' : ''} ${!hasCamera ? 'pw-step--disabled' : ''}`}>
                                <div className="pw-step-icon">{isFullscreen ? <CheckCircle size={20} /> : <Maximize size={20} />}</div>
                                <div className="pw-step-text">
                                    <strong>Fullscreen Mode</strong>
                                    <span>{isFullscreen ? 'Active' : 'Required to lock environment'}</span>
                                </div>
                                {hasCamera && !isFullscreen && <button className="pw-btn-small" onClick={enterFullscreen}>Enter Fullscreen</button>}
                            </div>
                        </div>

                        <video
                            ref={gateVideoRef}
                            autoPlay muted playsInline className="pw-setup-video" style={{ display: hasCamera ? 'block' : 'none' }}
                        />
                    </div>
                </div>
            )}

            {isReady && (
                <div className="pw-content">
                    {children}
                    <div className="pw-pip">
                        <div className="pw-pip-header"><Video size={12} className="animate-pulse" color="#ef4444" /> Live Recording</div>
                        <video
                            ref={pipVideoRef}
                            autoPlay muted playsInline className="pw-pip-video"
                        />
                    </div>
                </div>
            )}

            {violationWarning && createPortal(
                <div className="pw-violation-overlay animate-fade-in">
                    <div className="pw-violation-card">
                        <MonitorX size={48} color="#ef4444" />
                        <h2 className="pw-violation-title">Security Violation Detected</h2>
                        <p className="pw-violation-reason">{violationWarning}</p>
                        <div className="pw-violation-log">Total Violations Logged: <strong>{violationCount}</strong></div>
                        <p className="pw-violation-sub">Your webcam captured this event. It has been permanently logged to the Invigilator Dashboard.</p>
                        <button
                            className="pw-btn-danger"
                            onClick={() => {
                                setViolationWarning(null);
                                setDoc(doc(db, 'live_proctor_sessions', `${assessmentId}_${learnerId}`), { status: 'active', latestWarning: null }, { merge: true });
                                if (!document.fullscreenElement) enterFullscreen();
                            }}
                        >
                            I Understand, Return to Assessment
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};