import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref as fbStorageRef, deleteObject } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import {
    ArrowLeft, ShieldCheck, AlertTriangle, MonitorPlay,
    WifiOff, Clock, Camera, X, CheckCircle,
    Activity, Eye, Zap, Monitor, Ban,
    ShieldAlert, Loader2, Trash2
} from 'lucide-react';
import moment from 'moment';
import './InvigilatorDashboard.css';
import { createPortal } from 'react-dom';

export interface ProctorSession {
    id: string;
    learnerId: string;
    learnerName: string;
    status: 'active' | 'violation' | 'offline' | 'terminated';
    latestWarning: string | null;
    lastHeartbeat: any;
    violationCount?: number;
    violationHistory?: Array<{
        timestamp: string;
        reason: string;
        imageUrl: string | null;
        screenUrl?: string | null;
    }>;
}

/* ─── HISTORY MODAL WITH INFINITE SCROLL & DELETE ALL LOGS ───────────────────── */
const PAGE_SIZE = 5;

export const HistoryModal: React.FC<{ session: ProctorSession; onClose: () => void }> = ({ session, onClose }) => {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [isDeleting, setIsDeleting] = useState(false);
    const observerTarget = useRef<HTMLDivElement | null>(null);

    const vCount = session.violationHistory?.length || 0;

    // Reverse history once so newest incidents appear at the top
    const reversedHistory = useMemo(() => {
        return [...(session.violationHistory || [])].reverse();
    }, [session.violationHistory]);

    // Paginated subset of incidents currently rendered in the DOM
    const displayedHistory = useMemo(() => {
        return reversedHistory.slice(0, visibleCount);
    }, [reversedHistory, visibleCount]);

    const hasMore = visibleCount < reversedHistory.length;

    // Infinite scroll observer: loads next batch when scrolling near the bottom
    useEffect(() => {
        const target = observerTarget.current;
        if (!target || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, reversedHistory.length));
                }
            },
            {
                root: null,
                threshold: 0.1,
            }
        );

        observer.observe(target);

        return () => {
            if (target) observer.unobserve(target);
        };
    }, [hasMore, reversedHistory.length]);

    // DELETE ALL LOGS & ASSOCIATED STORAGE IMAGES
    const handleDeleteAllLogs = async () => {
        if (!window.confirm(`Are you sure you want to permanently delete all ${vCount} incident log(s) and evidence images for ${session.learnerName}? This action cannot be undone.`)) {
            return;
        }

        setIsDeleting(true);
        try {
            const storage = getStorage();
            const history = session.violationHistory || [];

            // 1. Delete all webcam and screen capture images from Firebase Storage
            const deletePromises: Promise<void>[] = [];
            history.forEach((v) => {
                if (v.imageUrl) {
                    try {
                        const imgRef = fbStorageRef(storage, v.imageUrl);
                        deletePromises.push(deleteObject(imgRef).catch((e) => console.warn("Image delete skipped:", e)));
                    } catch (e) {
                        console.warn("Invalid image URL:", e);
                    }
                }
                if (v.screenUrl) {
                    try {
                        const screenRef = fbStorageRef(storage, v.screenUrl);
                        deletePromises.push(deleteObject(screenRef).catch((e) => console.warn("Screen capture delete skipped:", e)));
                    } catch (e) {
                        console.warn("Invalid screen URL:", e);
                    }
                }
            });

            await Promise.all(deletePromises);

            // 2. Clear violation records from Firestore document
            const sessionRef = doc(db, 'live_proctor_sessions', session.id);
            await updateDoc(sessionRef, {
                violationHistory: [],
                violationCount: 0,
                latestWarning: null,
                status: session.status === 'violation' ? 'active' : session.status
            });

            setIsDeleting(false);
            onClose();
        } catch (error) {
            console.error("Failed to delete proctor logs:", error);
            alert("An error occurred while deleting incident logs.");
            setIsDeleting(false);
        }
    };

    return createPortal(
        <div className="lfm-overlay invig-modal-overlay" onClick={onClose}>
            <div className="lfm-modal invig-modal-card" onClick={e => e.stopPropagation()}>
                <div className="lfm-header invig-modal-header">
                    <div className="invig-modal-header__left">
                        <ShieldAlert size={20} color="var(--mlab-white)" />
                        <div>
                            <h2 className="lfm-header__title">{session.learnerName}</h2>
                            <p className="invig-modal-subtitle">
                                Security Incident Log · {vCount} incident{vCount !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {vCount > 0 && (
                            <button
                                type="button"
                                onClick={handleDeleteAllLogs}
                                disabled={isDeleting}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                                    opacity: isDeleting ? 0.7 : 1
                                }}
                            >
                                {isDeleting ? <Loader2 size={13} className="lfm-spin" /> : <Trash2 size={13} />}
                                <span>{isDeleting ? 'Deleting...' : 'Delete All Logs'}</span>
                            </button>
                        )}
                        <button className="lfm-close-btn" onClick={onClose}><X size={20} /></button>
                    </div>
                </div>
                <div className="lfm-body invig-modal-body">
                    {!session.violationHistory || session.violationHistory.length === 0 ? (
                        <div className="invig-empty-violations">
                            <ShieldCheck size={40} color="var(--mlab-green-dark)" />
                            <p>No violations recorded for this session.</p>
                        </div>
                    ) : (
                        <div className="invig-history-list">
                            {displayedHistory.map((v, i) => {
                                const incidentNumber = reversedHistory.length - i;
                                return (
                                    <div key={`${v.timestamp}-${i}`} className="invig-history-item">
                                        <div className="invig-history-item__header">
                                            <div className="invig-history-item__badge">
                                                <Zap size={12} />
                                                Incident #{incidentNumber}
                                            </div>
                                            <div className="invig-history-item__time">
                                                <Clock size={12} />
                                                {moment(v.timestamp).format('DD MMM YYYY, HH:mm:ss')}
                                            </div>
                                        </div>
                                        <strong className="invig-history-item__reason">{v.reason}</strong>

                                        <div className="invig-evidence-grid">
                                            {/* WEBCAM EVIDENCE */}
                                            <div className="invig-evidence-box">
                                                <div className="invig-evidence-box__label"><Camera size={12} /> Webcam Snapshot</div>
                                                {v.imageUrl ? (
                                                    <img src={v.imageUrl} alt="Webcam Evidence" crossOrigin="anonymous" className="invig-evidence-box__img" loading="lazy" />
                                                ) : (
                                                    <div className="invig-evidence-box__empty"><Camera size={16} /> No photo</div>
                                                )}
                                            </div>

                                            {/* SCREENSHARE EVIDENCE */}
                                            <div className="invig-evidence-box">
                                                <div className="invig-evidence-box__label"><Monitor size={12} /> Full Screen Capture</div>
                                                {v.screenUrl ? (
                                                    <img src={v.screenUrl} alt="Screen Evidence" crossOrigin="anonymous" className="invig-evidence-box__img" loading="lazy" />
                                                ) : (
                                                    <div className="invig-evidence-box__empty"><Monitor size={16} /> No screen capture</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* INFINITE SCROLL SENTINEL & LOADER */}
                            {hasMore && (
                                <div
                                    ref={observerTarget}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '1.25rem',
                                        gap: '8px',
                                        color: 'var(--mlab-grey)',
                                        fontSize: '0.8rem',
                                        fontWeight: 'bold',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}
                                >
                                    <Loader2 size={18} className="lfm-spin" color="var(--mlab-blue)" />
                                    <span>Loading older incidents...</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
const InvigilatorDashboard: React.FC = () => {
    const { assessmentId } = useParams<{ assessmentId: string }>();
    const navigate = useNavigate();

    const [assessmentTitle, setAssessmentTitle] = useState('Loading Assessment...');
    const [sessions, setSessions] = useState<ProctorSession[]>([]);
    const [selectedSession, setSelectedSession] = useState<ProctorSession | null>(null);

    // Fetch Assessment Title
    useEffect(() => {
        if (!assessmentId) return;
        const fetchAss = async () => {
            try {
                const snap = await getDoc(doc(db, 'assessments', assessmentId));
                if (snap.exists()) setAssessmentTitle(snap.data().title);
            } catch (e) {
                console.error(e);
                setAssessmentTitle('Assessment Details Unavailable');
            }
        };
        fetchAss();
    }, [assessmentId]);

    // Real-time listener for live proctor sessions
    useEffect(() => {
        if (!assessmentId) return;
        const q = query(collection(db, 'live_proctor_sessions'), where('assessmentId', '==', assessmentId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const activeSessions: ProctorSession[] = [];
            snapshot.forEach((docSnap) => activeSessions.push({ id: docSnap.id, ...docSnap.data() } as ProctorSession));
            setSessions(activeSessions);
        });
        return () => unsubscribe();
    }, [assessmentId]);

    const getStatus = (session: ProctorSession) => {
        if (session.status === 'terminated') return 'terminated';
        if (session.status === 'offline') return 'offline';
        const now = new Date().getTime();
        const lastPing = session.lastHeartbeat?.toDate?.()?.getTime() || 0;
        if (now - lastPing > 60000) return 'offline';
        return session.status;
    };

    const activeCount = sessions.filter(s => getStatus(s) === 'active').length;
    const offlineCount = sessions.filter(s => getStatus(s) === 'offline').length;
    const terminatedCount = sessions.filter(s => getStatus(s) === 'terminated').length;
    const totalViolationsCount = sessions.reduce((sum, session) => sum + (session.violationHistory?.length || session.violationCount || 0), 0);

    return (
        <div className="invig-layout">
            {selectedSession && (
                <HistoryModal session={selectedSession} onClose={() => setSelectedSession(null)} />
            )}

            {/* ── HEADER ── */}
            <header className="invig-header">
                <div className="invig-header__top">
                    <button className="lfm-btn lfm-btn--ghost invig-back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={14} /> Back to Management
                    </button>
                    <div className="invig-header__live-pulse">
                        <span className="invig-live-dot" />
                        Live Invigilation Feed
                    </div>
                </div>
                <div className="invig-header__main">
                    <div className="invig-header__title-group">
                        <div className="invig-header__eyebrow">
                            <MonitorPlay size={13} /> Invigilator Control Center
                        </div>
                        <h1 className="invig-header__title">{assessmentTitle}</h1>
                    </div>
                    <div className="invig-header__metrics">
                        <div className="invig-metric invig-metric--active">
                            <div className="invig-metric__icon"><Activity size={18} /></div>
                            <div className="invig-metric__body">
                                <span className="invig-metric__value">{activeCount}</span>
                                <span className="invig-metric__label">Active</span>
                            </div>
                        </div>
                        <div className={`invig-metric invig-metric--violation${totalViolationsCount > 0 ? ' invig-metric--violation-alert' : ''}`}>
                            <div className="invig-metric__icon"><AlertTriangle size={18} /></div>
                            <div className="invig-metric__body">
                                <span className="invig-metric__value">{totalViolationsCount}</span>
                                <span className="invig-metric__label">Violations</span>
                            </div>
                        </div>
                        <div className="invig-metric invig-metric--terminated">
                            <div className="invig-metric__icon"><Ban size={18} /></div>
                            <div className="invig-metric__body">
                                <span className="invig-metric__value">{terminatedCount}</span>
                                <span className="invig-metric__label">Terminated</span>
                            </div>
                        </div>
                        <div className="invig-metric invig-metric--offline">
                            <div className="invig-metric__icon"><WifiOff size={18} /></div>
                            <div className="invig-metric__body">
                                <span className="invig-metric__value">{offlineCount}</span>
                                <span className="invig-metric__label">Offline</span>
                            </div>
                        </div>
                        <div className="invig-metric invig-metric--total">
                            <div className="invig-metric__icon"><Eye size={18} /></div>
                            <div className="invig-metric__body">
                                <span className="invig-metric__value">{sessions.length}</span>
                                <span className="invig-metric__label">Total</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* ── BODY ── */}
            <main className="invig-body">
                {sessions.length === 0 ? (
                    <div className="invig-empty-state">
                        <div className="invig-empty-state__icon">
                            <ShieldCheck size={48} color="var(--mlab-blue)" />
                        </div>
                        <h3 className="invig-empty-state__title">Awaiting Active Learners</h3>
                        <p className="invig-empty-state__desc">When learners launch this proctored assessment, their real-time telemetry, AI gaze alerts, and dual screenshots will appear here.</p>
                    </div>
                ) : (
                    <div className="invig-grid">
                        {sessions.map(session => {
                            const currentStatus = getStatus(session);
                            const isViolation = currentStatus === 'violation';
                            const isTerminated = currentStatus === 'terminated';
                            const isOffline = currentStatus === 'offline';
                            const isActive = currentStatus === 'active';

                            const latestEvent = session.violationHistory?.length
                                ? session.violationHistory[session.violationHistory.length - 1]
                                : null;
                            const latestImage = latestEvent?.screenUrl || latestEvent?.imageUrl || null;
                            const vCount = session.violationHistory?.length || session.violationCount || 0;

                            return (
                                <div key={session.id} className={`invig-card invig-card--${currentStatus}`}>
                                    <div className="invig-card__header">
                                        <div className="invig-card__learner">
                                            <div className="invig-card__avatar">
                                                {session.learnerName.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="invig-card__learner-info">
                                                <strong className="invig-card__name">{session.learnerName}</strong>
                                                {session.latestWarning && (isViolation || isTerminated) && (
                                                    <span className="invig-card__latest-warning">{session.latestWarning}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={`invig-card__badge invig-card__badge--${currentStatus}`}>
                                            {isTerminated && <><Ban size={11} /> Terminated</>}
                                            {isViolation && <><AlertTriangle size={11} /> Violation</>}
                                            {isActive && <><CheckCircle size={11} /> Active</>}
                                            {isOffline && <><WifiOff size={11} /> Offline</>}
                                        </div>
                                    </div>

                                    <div className="invig-card__content">
                                        {latestImage ? (
                                            <>
                                                <img src={latestImage} alt="Latest Evidence Snapshot" crossOrigin="anonymous" className="invig-card__snapshot" />
                                                <div className="invig-card__snapshot-label">
                                                    {latestEvent?.screenUrl ? <Monitor size={11} /> : <Camera size={11} />}
                                                    {latestEvent?.screenUrl ? 'Screen Capture' : 'Webcam Capture'}
                                                </div>
                                            </>
                                        ) : (
                                            <div className={`invig-card__placeholder invig-card__placeholder--${currentStatus}`}>
                                                {isTerminated ? <Ban size={32} /> : isOffline ? <WifiOff size={32} /> : <ShieldCheck size={32} />}
                                                <span>{isTerminated ? 'Assessment Terminated' : isOffline ? 'Session Closed / Offline' : 'Environment Secure'}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="invig-card__footer">
                                        <div className="invig-card__stats">
                                            <span className={`invig-card__violation-count${vCount > 0 ? ' invig-card__violation-count--warn' : ''}`}>
                                                <AlertTriangle size={11} />
                                                {vCount} incident{vCount !== 1 ? 's' : ''}
                                            </span>
                                            {session.lastHeartbeat && (
                                                <span className="invig-card__heartbeat">
                                                    <Clock size={11} />
                                                    {moment(session.lastHeartbeat?.toDate?.() || session.lastHeartbeat).fromNow()}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            className={`lfm-btn invig-card__btn-logs${vCount > 0 ? ' invig-card__btn-logs--active' : ''}`}
                                            disabled={vCount === 0}
                                            onClick={() => setSelectedSession(session)}
                                        >
                                            <Eye size={13} /> View Logs ({vCount})
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
};

export default InvigilatorDashboard;


// import React, { useState, useEffect, useRef, useMemo } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import {
//     ArrowLeft, ShieldCheck, AlertTriangle, MonitorPlay,
//     WifiOff, Clock, Camera, X, CheckCircle,
//     Activity, Eye, Zap, Monitor, Ban,
//     ShieldAlert,
//     Loader2,
// } from 'lucide-react';
// import moment from 'moment';
// import './InvigilatorDashboard.css';
// import { createPortal } from 'react-dom';

// // interface ProctorSession {
// //     id: string;
// //     learnerId: string;
// //     learnerName: string;
// //     status: 'active' | 'violation' | 'offline' | 'terminated';
// //     latestWarning: string | null;
// //     lastHeartbeat: any;
// //     violationCount?: number;
// //     violationHistory?: Array<{
// //         timestamp: string;
// //         reason: string;
// //         imageUrl: string | null;
// //         screenUrl?: string | null;
// //     }>;
// // }

// export interface ProctorSession {
//     id: string;
//     learnerId: string;
//     learnerName: string;
//     status: 'active' | 'violation' | 'offline' | 'terminated';
//     latestWarning: string | null;
//     lastHeartbeat: any;
//     violationCount?: number;
//     violationHistory?: Array<{
//         timestamp: string;
//         reason: string;
//         imageUrl: string | null;
//         screenUrl?: string | null;
//     }>;
// }

// /* ─── HISTORY MODAL WITH INFINITE SCROLL ─────────────────────────────────────── */
// const PAGE_SIZE = 5;

// export const HistoryModal: React.FC<{ session: ProctorSession; onClose: () => void }> = ({ session, onClose }) => {
//     // const HistoryModal: React.FC<{ session: ProctorSession; onClose: () => void }> = ({ session, onClose }) => {
//     const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
//     const observerTarget = useRef<HTMLDivElement | null>(null);

//     const vCount = session.violationHistory?.length || 0;

//     // Reverse history once so newest incidents appear at the top
//     const reversedHistory = useMemo(() => {
//         return [...(session.violationHistory || [])].reverse();
//     }, [session.violationHistory]);

//     // Paginated subset of incidents currently rendered in the DOM
//     const displayedHistory = useMemo(() => {
//         return reversedHistory.slice(0, visibleCount);
//     }, [reversedHistory, visibleCount]);

//     const hasMore = visibleCount < reversedHistory.length;

//     // Infinite scroll observer: loads next batch when scrolling near the bottom
//     useEffect(() => {
//         const target = observerTarget.current;
//         if (!target || !hasMore) return;

//         const observer = new IntersectionObserver(
//             (entries) => {
//                 if (entries[0].isIntersecting) {
//                     setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, reversedHistory.length));
//                 }
//             },
//             {
//                 root: null,
//                 threshold: 0.1,
//             }
//         );

//         observer.observe(target);

//         return () => {
//             if (target) observer.unobserve(target);
//         };
//     }, [hasMore, reversedHistory.length]);

//     return createPortal(
//         <div className="lfm-overlay invig-modal-overlay" onClick={onClose}>
//             <div className="lfm-modal invig-modal-card" onClick={e => e.stopPropagation()}>
//                 <div className="lfm-header invig-modal-header">
//                     <div className="invig-modal-header__left">
//                         <ShieldAlert size={20} color="var(--mlab-white)" />
//                         <div>
//                             <h2 className="lfm-header__title">{session.learnerName}</h2>
//                             <p className="invig-modal-subtitle">
//                                 Security Incident Log · {vCount} incident{vCount !== 1 ? 's' : ''}
//                             </p>
//                         </div>
//                     </div>
//                     <button className="lfm-close-btn" onClick={onClose}><X size={20} /></button>
//                 </div>
//                 <div className="lfm-body invig-modal-body">
//                     {!session.violationHistory || session.violationHistory.length === 0 ? (
//                         <div className="invig-empty-violations">
//                             <ShieldCheck size={40} color="var(--mlab-green-dark)" />
//                             <p>No violations recorded for this session.</p>
//                         </div>
//                     ) : (
//                         <div className="invig-history-list">
//                             {displayedHistory.map((v, i) => {
//                                 const incidentNumber = reversedHistory.length - i;
//                                 return (
//                                     <div key={`${v.timestamp}-${i}`} className="invig-history-item">
//                                         <div className="invig-history-item__header">
//                                             <div className="invig-history-item__badge">
//                                                 <Zap size={12} />
//                                                 Incident #{incidentNumber}
//                                             </div>
//                                             <div className="invig-history-item__time">
//                                                 <Clock size={12} />
//                                                 {moment(v.timestamp).format('DD MMM YYYY, HH:mm:ss')}
//                                             </div>
//                                         </div>
//                                         <strong className="invig-history-item__reason">{v.reason}</strong>

//                                         <div className="invig-evidence-grid">
//                                             {/* WEBCAM EVIDENCE */}
//                                             <div className="invig-evidence-box">
//                                                 <div className="invig-evidence-box__label"><Camera size={12} /> Webcam Snapshot</div>
//                                                 {v.imageUrl ? (
//                                                     <img src={v.imageUrl} alt="Webcam Evidence" crossOrigin="anonymous" className="invig-evidence-box__img" loading="lazy" />
//                                                 ) : (
//                                                     <div className="invig-evidence-box__empty"><Camera size={16} /> No photo</div>
//                                                 )}
//                                             </div>

//                                             {/* SCREENSHARE EVIDENCE */}
//                                             <div className="invig-evidence-box">
//                                                 <div className="invig-evidence-box__label"><Monitor size={12} /> Full Screen Capture</div>
//                                                 {v.screenUrl ? (
//                                                     <img src={v.screenUrl} alt="Screen Evidence" crossOrigin="anonymous" className="invig-evidence-box__img" loading="lazy" />
//                                                 ) : (
//                                                     <div className="invig-evidence-box__empty"><Monitor size={16} /> No screen capture</div>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     </div>
//                                 );
//                             })}

//                             {/* INFINITE SCROLL SENTINEL & LOADER */}
//                             {hasMore && (
//                                 <div
//                                     ref={observerTarget}
//                                     style={{
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         justifyContent: 'center',
//                                         padding: '1.25rem',
//                                         gap: '8px',
//                                         color: 'var(--mlab-grey)',
//                                         fontSize: '0.8rem',
//                                         fontWeight: 'bold',
//                                         textTransform: 'uppercase',
//                                         letterSpacing: '0.05em'
//                                     }}
//                                 >
//                                     <Loader2 size={18} className="lfm-spin" color="var(--mlab-blue)" />
//                                     <span>Loading older incidents...</span>
//                                 </div>
//                             )}
//                         </div>
//                     )}
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// /* ═══════════════════════════════════════════════════════════════════════════
//    MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════ */
// const InvigilatorDashboard: React.FC = () => {
//     const { assessmentId } = useParams<{ assessmentId: string }>();
//     const navigate = useNavigate();

//     const [assessmentTitle, setAssessmentTitle] = useState('Loading Assessment...');
//     const [sessions, setSessions] = useState<ProctorSession[]>([]);
//     const [selectedSession, setSelectedSession] = useState<ProctorSession | null>(null);

//     // Fetch Assessment Title
//     useEffect(() => {
//         if (!assessmentId) return;
//         const fetchAss = async () => {
//             try {
//                 const snap = await getDoc(doc(db, 'assessments', assessmentId));
//                 if (snap.exists()) setAssessmentTitle(snap.data().title);
//             } catch (e) {
//                 console.error(e);
//                 setAssessmentTitle('Assessment Details Unavailable');
//             }
//         };
//         fetchAss();
//     }, [assessmentId]);

//     // Real-time listener for live proctor sessions
//     useEffect(() => {
//         if (!assessmentId) return;
//         const q = query(collection(db, 'live_proctor_sessions'), where('assessmentId', '==', assessmentId));
//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const activeSessions: ProctorSession[] = [];
//             snapshot.forEach((docSnap) => activeSessions.push({ id: docSnap.id, ...docSnap.data() } as ProctorSession));
//             setSessions(activeSessions);
//         });
//         return () => unsubscribe();
//     }, [assessmentId]);

//     const getStatus = (session: ProctorSession) => {
//         if (session.status === 'terminated') return 'terminated';
//         if (session.status === 'offline') return 'offline';
//         const now = new Date().getTime();
//         const lastPing = session.lastHeartbeat?.toDate?.()?.getTime() || 0;
//         if (now - lastPing > 60000) return 'offline';
//         return session.status;
//     };

//     const activeCount = sessions.filter(s => getStatus(s) === 'active').length;
//     const offlineCount = sessions.filter(s => getStatus(s) === 'offline').length;
//     const terminatedCount = sessions.filter(s => getStatus(s) === 'terminated').length;
//     const totalViolationsCount = sessions.reduce((sum, session) => sum + (session.violationHistory?.length || session.violationCount || 0), 0);

//     return (
//         <div className="invig-layout">
//             {selectedSession && (
//                 <HistoryModal session={selectedSession} onClose={() => setSelectedSession(null)} />
//             )}

//             {/* ── HEADER ── */}
//             <header className="invig-header">
//                 <div className="invig-header__top">
//                     <button className="lfm-btn lfm-btn--ghost invig-back-btn" onClick={() => navigate(-1)}>
//                         <ArrowLeft size={14} /> Back to Management
//                     </button>
//                     <div className="invig-header__live-pulse">
//                         <span className="invig-live-dot" />
//                         Live Invigilation Feed
//                     </div>
//                 </div>
//                 <div className="invig-header__main">
//                     <div className="invig-header__title-group">
//                         <div className="invig-header__eyebrow">
//                             <MonitorPlay size={13} /> Invigilator Control Center
//                         </div>
//                         <h1 className="invig-header__title">{assessmentTitle}</h1>
//                     </div>
//                     <div className="invig-header__metrics">
//                         <div className="invig-metric invig-metric--active">
//                             <div className="invig-metric__icon"><Activity size={18} /></div>
//                             <div className="invig-metric__body">
//                                 <span className="invig-metric__value">{activeCount}</span>
//                                 <span className="invig-metric__label">Active</span>
//                             </div>
//                         </div>
//                         <div className={`invig-metric invig-metric--violation${totalViolationsCount > 0 ? ' invig-metric--violation-alert' : ''}`}>
//                             <div className="invig-metric__icon"><AlertTriangle size={18} /></div>
//                             <div className="invig-metric__body">
//                                 <span className="invig-metric__value">{totalViolationsCount}</span>
//                                 <span className="invig-metric__label">Violations</span>
//                             </div>
//                         </div>
//                         <div className="invig-metric invig-metric--terminated">
//                             <div className="invig-metric__icon"><Ban size={18} /></div>
//                             <div className="invig-metric__body">
//                                 <span className="invig-metric__value">{terminatedCount}</span>
//                                 <span className="invig-metric__label">Terminated</span>
//                             </div>
//                         </div>
//                         <div className="invig-metric invig-metric--offline">
//                             <div className="invig-metric__icon"><WifiOff size={18} /></div>
//                             <div className="invig-metric__body">
//                                 <span className="invig-metric__value">{offlineCount}</span>
//                                 <span className="invig-metric__label">Offline</span>
//                             </div>
//                         </div>
//                         <div className="invig-metric invig-metric--total">
//                             <div className="invig-metric__icon"><Eye size={18} /></div>
//                             <div className="invig-metric__body">
//                                 <span className="invig-metric__value">{sessions.length}</span>
//                                 <span className="invig-metric__label">Total</span>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             </header>

//             {/* ── BODY ── */}
//             <main className="invig-body">
//                 {sessions.length === 0 ? (
//                     <div className="invig-empty-state">
//                         <div className="invig-empty-state__icon">
//                             <ShieldCheck size={48} color="var(--mlab-blue)" />
//                         </div>
//                         <h3 className="invig-empty-state__title">Awaiting Active Learners</h3>
//                         <p className="invig-empty-state__desc">When learners launch this proctored assessment, their real-time telemetry, AI gaze alerts, and dual screenshots will appear here.</p>
//                     </div>
//                 ) : (
//                     <div className="invig-grid">
//                         {sessions.map(session => {
//                             const currentStatus = getStatus(session);
//                             const isViolation = currentStatus === 'violation';
//                             const isTerminated = currentStatus === 'terminated';
//                             const isOffline = currentStatus === 'offline';
//                             const isActive = currentStatus === 'active';

//                             const latestEvent = session.violationHistory?.length
//                                 ? session.violationHistory[session.violationHistory.length - 1]
//                                 : null;
//                             const latestImage = latestEvent?.screenUrl || latestEvent?.imageUrl || null;
//                             const vCount = session.violationHistory?.length || session.violationCount || 0;

//                             return (
//                                 <div key={session.id} className={`invig-card invig-card--${currentStatus}`}>
//                                     <div className="invig-card__header">
//                                         <div className="invig-card__learner">
//                                             <div className="invig-card__avatar">
//                                                 {session.learnerName.charAt(0).toUpperCase()}
//                                             </div>
//                                             <div className="invig-card__learner-info">
//                                                 <strong className="invig-card__name">{session.learnerName}</strong>
//                                                 {session.latestWarning && (isViolation || isTerminated) && (
//                                                     <span className="invig-card__latest-warning">{session.latestWarning}</span>
//                                                 )}
//                                             </div>
//                                         </div>
//                                         <div className={`invig-card__badge invig-card__badge--${currentStatus}`}>
//                                             {isTerminated && <><Ban size={11} /> Terminated</>}
//                                             {isViolation && <><AlertTriangle size={11} /> Violation</>}
//                                             {isActive && <><CheckCircle size={11} /> Active</>}
//                                             {isOffline && <><WifiOff size={11} /> Offline</>}
//                                         </div>
//                                     </div>

//                                     <div className="invig-card__content">
//                                         {latestImage ? (
//                                             <>
//                                                 <img src={latestImage} alt="Latest Evidence Snapshot" crossOrigin="anonymous" className="invig-card__snapshot" />
//                                                 <div className="invig-card__snapshot-label">
//                                                     {latestEvent?.screenUrl ? <Monitor size={11} /> : <Camera size={11} />}
//                                                     {latestEvent?.screenUrl ? 'Screen Capture' : 'Webcam Capture'}
//                                                 </div>
//                                             </>
//                                         ) : (
//                                             <div className={`invig-card__placeholder invig-card__placeholder--${currentStatus}`}>
//                                                 {isTerminated ? <Ban size={32} /> : isOffline ? <WifiOff size={32} /> : <ShieldCheck size={32} />}
//                                                 <span>{isTerminated ? 'Assessment Terminated' : isOffline ? 'Session Closed / Offline' : 'Environment Secure'}</span>
//                                             </div>
//                                         )}
//                                     </div>

//                                     <div className="invig-card__footer">
//                                         <div className="invig-card__stats">
//                                             <span className={`invig-card__violation-count${vCount > 0 ? ' invig-card__violation-count--warn' : ''}`}>
//                                                 <AlertTriangle size={11} />
//                                                 {vCount} incident{vCount !== 1 ? 's' : ''}
//                                             </span>
//                                             {session.lastHeartbeat && (
//                                                 <span className="invig-card__heartbeat">
//                                                     <Clock size={11} />
//                                                     {moment(session.lastHeartbeat?.toDate?.() || session.lastHeartbeat).fromNow()}
//                                                 </span>
//                                             )}
//                                         </div>
//                                         <button
//                                             className={`lfm-btn invig-card__btn-logs${vCount > 0 ? ' invig-card__btn-logs--active' : ''}`}
//                                             disabled={vCount === 0}
//                                             onClick={() => setSelectedSession(session)}
//                                         >
//                                             <Eye size={13} /> View Logs ({vCount})
//                                         </button>
//                                     </div>
//                                 </div>
//                             );
//                         })}
//                     </div>
//                 )}
//             </main>
//         </div>
//     );
// };

// export default InvigilatorDashboard;



// // import React, { useState, useEffect } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import {
// //     ArrowLeft, ShieldCheck, AlertTriangle, MonitorPlay,
// //     WifiOff, Clock, Camera, X, CheckCircle,
// //     Activity, Eye, Shield, Zap
// // } from 'lucide-react';
// // import moment from 'moment';
// // import './InvigilatorDashboard.css';
// // import { createPortal } from 'react-dom';

// // interface ProctorSession {
// //     id: string;
// //     learnerId: string;
// //     learnerName: string;
// //     status: 'active' | 'violation' | 'offline';
// //     latestWarning: string | null;
// //     lastHeartbeat: any;
// //     violationHistory?: Array<{ timestamp: string; reason: string; imageUrl: string | null }>;
// // }

// // /* ─── HISTORY MODAL ─────────────────────────────────────────────────────────── */
// // const HistoryModal: React.FC<{ session: ProctorSession; onClose: () => void }> = ({ session, onClose }) => {
// //     const vCount = session.violationHistory?.length || 0;

// //     return createPortal(
// //         <div className="invig-modal-overlay" onClick={onClose}>
// //             <div className="invig-modal-card" onClick={e => e.stopPropagation()}>
// //                 <div className="invig-modal-header">
// //                     <div className="invig-modal-header__left">
// //                         <div className="invig-modal-icon">
// //                             <AlertTriangle size={20} />
// //                         </div>
// //                         <div>
// //                             <h2 className="invig-modal-title">{session.learnerName}</h2>
// //                             <p className="invig-modal-subtitle">Violation History · {vCount} total incident{vCount !== 1 ? 's' : ''}</p>
// //                         </div>
// //                     </div>
// //                     <button className="invig-modal-close" onClick={onClose}><X size={20} /></button>
// //                 </div>
// //                 <div className="invig-modal-body">
// //                     {!session.violationHistory || session.violationHistory.length === 0 ? (
// //                         <div className="invig-empty-violations">
// //                             <Shield size={40} />
// //                             <p>No violations recorded for this session.</p>
// //                         </div>
// //                     ) : (
// //                         <div className="invig-history-list">
// //                             {[...session.violationHistory].reverse().map((v, i) => (
// //                                 <div key={i} className="invig-history-item">
// //                                     <div className="invig-history-item__header">
// //                                         <div className="invig-history-item__badge">
// //                                             <Zap size={12} />
// //                                             Incident #{session.violationHistory!.length - i}
// //                                         </div>
// //                                         <div className="invig-history-item__time">
// //                                             <Clock size={12} />
// //                                             {moment(v.timestamp).format('DD MMM YYYY, HH:mm:ss')}
// //                                         </div>
// //                                     </div>
// //                                     <strong className="invig-history-item__reason">{v.reason}</strong>
// //                                     {v.imageUrl ? (
// //                                         <div className="invig-history-item__img-wrap">
// //                                             <img src={v.imageUrl} alt="Violation Evidence" crossOrigin="anonymous" className="invig-history-item__img" />
// //                                             <div className="invig-history-item__img-label"><Camera size={11} /> Captured Evidence</div>
// //                                         </div>
// //                                     ) : (
// //                                         <div className="invig-history-item__no-img">
// //                                             <Camera size={15} />
// //                                             <span>No snapshot captured</span>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             ))}
// //                         </div>
// //                     )}
// //                 </div>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // /* ═══════════════════════════════════════════════════════════════════════════
// //    MAIN COMPONENT
// // ═══════════════════════════════════════════════════════════════════════════ */
// // const InvigilatorDashboard: React.FC = () => {
// //     const { assessmentId } = useParams<{ assessmentId: string }>();
// //     const navigate = useNavigate();

// //     const [assessmentTitle, setAssessmentTitle] = useState('Loading Assessment...');
// //     const [sessions, setSessions] = useState<ProctorSession[]>([]);
// //     const [selectedSession, setSelectedSession] = useState<ProctorSession | null>(null);

// //     // Fetch Assessment Title
// //     useEffect(() => {
// //         if (!assessmentId) return;
// //         const fetchAss = async () => {
// //             try {
// //                 const snap = await getDoc(doc(db, 'assessments', assessmentId));
// //                 if (snap.exists()) setAssessmentTitle(snap.data().title);
// //             } catch (e) {
// //                 console.error(e);
// //                 setAssessmentTitle('Assessment Details Unavailable');
// //             }
// //         };
// //         fetchAss();
// //     }, [assessmentId]);

// //     // Real-time listener for learner heartbeats
// //     useEffect(() => {
// //         if (!assessmentId) return;
// //         const q = query(collection(db, 'live_proctor_sessions'), where('assessmentId', '==', assessmentId));
// //         const unsubscribe = onSnapshot(q, (snapshot) => {
// //             const activeSessions: ProctorSession[] = [];
// //             snapshot.forEach((doc) => activeSessions.push({ id: doc.id, ...doc.data() } as ProctorSession));
// //             setSessions(activeSessions);
// //         });
// //         return () => unsubscribe();
// //     }, [assessmentId]);

// //     const getStatus = (session: ProctorSession) => {
// //         if (session.status === 'offline') return 'offline';
// //         const now = new Date().getTime();
// //         const lastPing = session.lastHeartbeat?.toDate()?.getTime() || 0;
// //         if (now - lastPing > 60000) return 'offline';
// //         return session.status;
// //     };

// //     const activeCount = sessions.filter(s => getStatus(s) === 'active').length;
// //     const offlineCount = sessions.filter(s => getStatus(s) === 'offline').length;

// //     // Sums the actual length of the violation arrays directly!
// //     const totalViolationsCount = sessions.reduce((sum, session) => sum + (session.violationHistory?.length || 0), 0);

// //     return (
// //         <div className="invig-layout">
// //             {selectedSession && (
// //                 <HistoryModal session={selectedSession} onClose={() => setSelectedSession(null)} />
// //             )}

// //             {/* ── HEADER ── */}
// //             <header className="invig-header">
// //                 <div className="invig-header__top">
// //                     <button className="invig-back-btn" onClick={() => navigate(-1)}>
// //                         <ArrowLeft size={14} /> Back
// //                     </button>
// //                     <div className="invig-header__live-pulse">
// //                         <span className="invig-live-dot" />
// //                         Live Proctoring
// //                     </div>
// //                 </div>
// //                 <div className="invig-header__main">
// //                     <div className="invig-header__title-group">
// //                         <div className="invig-header__eyebrow">
// //                             <MonitorPlay size={13} /> Invigilator Dashboard
// //                         </div>
// //                         <h1 className="invig-header__title">{assessmentTitle}</h1>
// //                     </div>
// //                     <div className="invig-header__metrics">
// //                         <div className="invig-metric invig-metric--active">
// //                             <div className="invig-metric__icon"><Activity size={18} /></div>
// //                             <div className="invig-metric__body">
// //                                 <span className="invig-metric__value">{activeCount}</span>
// //                                 <span className="invig-metric__label">Active</span>
// //                             </div>
// //                         </div>
// //                         <div className={`invig-metric invig-metric--violation${totalViolationsCount > 0 ? ' invig-metric--violation-alert' : ''}`}>
// //                             <div className="invig-metric__icon"><AlertTriangle size={18} /></div>
// //                             <div className="invig-metric__body">
// //                                 <span className="invig-metric__value">{totalViolationsCount}</span>
// //                                 <span className="invig-metric__label">Total Violations</span>
// //                             </div>
// //                         </div>
// //                         <div className="invig-metric invig-metric--offline">
// //                             <div className="invig-metric__icon"><WifiOff size={18} /></div>
// //                             <div className="invig-metric__body">
// //                                 <span className="invig-metric__value">{offlineCount}</span>
// //                                 <span className="invig-metric__label">Offline</span>
// //                             </div>
// //                         </div>
// //                         <div className="invig-metric invig-metric--total">
// //                             <div className="invig-metric__icon"><Eye size={18} /></div>
// //                             <div className="invig-metric__body">
// //                                 <span className="invig-metric__value">{sessions.length}</span>
// //                                 <span className="invig-metric__label">Total</span>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </header>

// //             {/* ── BODY ── */}
// //             <main className="invig-body">
// //                 {sessions.length === 0 ? (
// //                     <div className="invig-empty-state">
// //                         <div className="invig-empty-state__icon">
// //                             <ShieldCheck size={48} />
// //                         </div>
// //                         <h3 className="invig-empty-state__title">Waiting for Learners to Begin</h3>
// //                         <p className="invig-empty-state__desc">When learners start this assessment, their live proctoring feeds will appear here in real time.</p>
// //                     </div>
// //                 ) : (
// //                     <div className="invig-grid">
// //                         {sessions.map(session => {
// //                             const currentStatus = getStatus(session);
// //                             const isViolation = currentStatus === 'violation';
// //                             const isOffline = currentStatus === 'offline';
// //                             const isActive = currentStatus === 'active';
// //                             const latestImage = session.violationHistory?.length
// //                                 ? session.violationHistory[session.violationHistory.length - 1].imageUrl
// //                                 : null;
// //                             const hasLogs = !!(session.violationHistory?.length);

// //                             // DERIVED SOURCE OF TRUTH
// //                             const vCount = session.violationHistory?.length || 0;

// //                             return (
// //                                 <div key={session.id} className={`invig-card invig-card--${currentStatus}${isViolation && vCount > 2 ? ' invig-card--critical' : ''}`}>
// //                                     {/* Card header */}
// //                                     <div className="invig-card__header">
// //                                         <div className="invig-card__learner">
// //                                             <div className="invig-card__avatar">
// //                                                 {session.learnerName.charAt(0).toUpperCase()}
// //                                             </div>
// //                                             <div className="invig-card__learner-info">
// //                                                 <strong className="invig-card__name">{session.learnerName}</strong>
// //                                                 {session.latestWarning && isViolation && (
// //                                                     <span className="invig-card__latest-warning">{session.latestWarning}</span>
// //                                                 )}
// //                                             </div>
// //                                         </div>
// //                                         <div className={`invig-card__badge invig-card__badge--${currentStatus}`}>
// //                                             {isViolation && <><AlertTriangle size={11} /> Violation</>}
// //                                             {isActive && <><CheckCircle size={11} /> Active</>}
// //                                             {isOffline && <><WifiOff size={11} /> Offline</>}
// //                                         </div>
// //                                     </div>

// //                                     {/* Card content — snapshot or placeholder */}
// //                                     <div className="invig-card__content">
// //                                         {isViolation && latestImage ? (
// //                                             <>
// //                                                 <img src={latestImage} alt="Latest Violation Snapshot" crossOrigin="anonymous" className="invig-card__snapshot" />
// //                                                 <div className="invig-card__snapshot-label"><Camera size={11} /> Latest Capture</div>
// //                                             </>
// //                                         ) : (
// //                                             <div className={`invig-card__placeholder invig-card__placeholder--${currentStatus}`}>
// //                                                 {isOffline ? <WifiOff size={28} /> : <ShieldCheck size={28} />}
// //                                                 {/* Display clear, non-alarming text when the session goes offline */}
// //                                                 <span>{isOffline ? 'Session Ended / Offline' : isViolation ? 'Violation Flagged' : 'Environment Secure'}</span>
// //                                             </div>
// //                                         )}
// //                                     </div>

// //                                     {/* Card footer */}
// //                                     <div className="invig-card__footer">
// //                                         <div className="invig-card__stats">
// //                                             <span className={`invig-card__violation-count${vCount > 0 ? ' invig-card__violation-count--warn' : ''}`}>
// //                                                 <AlertTriangle size={11} />
// //                                                 {vCount} violation{vCount !== 1 ? 's' : ''}
// //                                             </span>
// //                                             {session.lastHeartbeat && (
// //                                                 <span className="invig-card__heartbeat">
// //                                                     <Clock size={11} />
// //                                                     {moment(session.lastHeartbeat?.toDate?.() || session.lastHeartbeat).fromNow()}
// //                                                 </span>
// //                                             )}
// //                                         </div>
// //                                         <button
// //                                             className={`invig-card__btn-logs${hasLogs ? ' invig-card__btn-logs--active' : ''}`}
// //                                             disabled={!hasLogs}
// //                                             onClick={() => setSelectedSession(session)}
// //                                         >
// //                                             <Eye size={13} /> View Logs
// //                                         </button>
// //                                     </div>
// //                                 </div>
// //                             );
// //                         })}
// //                     </div>
// //                 )}
// //             </main>
// //         </div>
// //     );
// // };

// // export default InvigilatorDashboard;