import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
    ArrowLeft, ShieldCheck, AlertTriangle, MonitorPlay,
    WifiOff, Clock, Camera, X, CheckCircle,
    Activity, Eye, Shield, Zap
} from 'lucide-react';
import moment from 'moment';
import './InvigilatorDashboard.css';
import { createPortal } from 'react-dom';

interface ProctorSession {
    id: string;
    learnerId: string;
    learnerName: string;
    status: 'active' | 'violation' | 'offline';
    latestWarning: string | null;
    lastHeartbeat: any;
    violationHistory?: Array<{ timestamp: string; reason: string; imageUrl: string | null }>;
}

/* ─── HISTORY MODAL ─────────────────────────────────────────────────────────── */
const HistoryModal: React.FC<{ session: ProctorSession; onClose: () => void }> = ({ session, onClose }) => {
    const vCount = session.violationHistory?.length || 0;

    return createPortal(
        <div className="invig-modal-overlay" onClick={onClose}>
            <div className="invig-modal-card" onClick={e => e.stopPropagation()}>
                <div className="invig-modal-header">
                    <div className="invig-modal-header__left">
                        <div className="invig-modal-icon">
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h2 className="invig-modal-title">{session.learnerName}</h2>
                            <p className="invig-modal-subtitle">Violation History · {vCount} total incident{vCount !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button className="invig-modal-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="invig-modal-body">
                    {!session.violationHistory || session.violationHistory.length === 0 ? (
                        <div className="invig-empty-violations">
                            <Shield size={40} />
                            <p>No violations recorded for this session.</p>
                        </div>
                    ) : (
                        <div className="invig-history-list">
                            {[...session.violationHistory].reverse().map((v, i) => (
                                <div key={i} className="invig-history-item">
                                    <div className="invig-history-item__header">
                                        <div className="invig-history-item__badge">
                                            <Zap size={12} />
                                            Incident #{session.violationHistory!.length - i}
                                        </div>
                                        <div className="invig-history-item__time">
                                            <Clock size={12} />
                                            {moment(v.timestamp).format('DD MMM YYYY, HH:mm:ss')}
                                        </div>
                                    </div>
                                    <strong className="invig-history-item__reason">{v.reason}</strong>
                                    {v.imageUrl ? (
                                        <div className="invig-history-item__img-wrap">
                                            <img src={v.imageUrl} alt="Violation Evidence" className="invig-history-item__img" />
                                            <div className="invig-history-item__img-label"><Camera size={11} /> Captured Evidence</div>
                                        </div>
                                    ) : (
                                        <div className="invig-history-item__no-img">
                                            <Camera size={15} />
                                            <span>No snapshot captured</span>
                                        </div>
                                    )}
                                </div>
                            ))}
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

    // Real-time listener for learner heartbeats
    useEffect(() => {
        if (!assessmentId) return;
        const q = query(collection(db, 'live_proctor_sessions'), where('assessmentId', '==', assessmentId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const activeSessions: ProctorSession[] = [];
            snapshot.forEach((doc) => activeSessions.push({ id: doc.id, ...doc.data() } as ProctorSession));
            setSessions(activeSessions);
        });
        return () => unsubscribe();
    }, [assessmentId]);

    const getStatus = (session: ProctorSession) => {
        if (session.status === 'offline') return 'offline';
        const now = new Date().getTime();
        const lastPing = session.lastHeartbeat?.toDate()?.getTime() || 0;
        if (now - lastPing > 60000) return 'offline';
        return session.status;
    };

    const activeCount = sessions.filter(s => getStatus(s) === 'active').length;
    const offlineCount = sessions.filter(s => getStatus(s) === 'offline').length;

    // Sums the actual length of the violation arrays directly!
    const totalViolationsCount = sessions.reduce((sum, session) => sum + (session.violationHistory?.length || 0), 0);

    return (
        <div className="invig-layout">
            {selectedSession && (
                <HistoryModal session={selectedSession} onClose={() => setSelectedSession(null)} />
            )}

            {/* ── HEADER ── */}
            <header className="invig-header">
                <div className="invig-header__top">
                    <button className="invig-back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={14} /> Back
                    </button>
                    <div className="invig-header__live-pulse">
                        <span className="invig-live-dot" />
                        Live Proctoring
                    </div>
                </div>
                <div className="invig-header__main">
                    <div className="invig-header__title-group">
                        <div className="invig-header__eyebrow">
                            <MonitorPlay size={13} /> Invigilator Dashboard
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
                                <span className="invig-metric__label">Total Violations</span>
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
                            <ShieldCheck size={48} />
                        </div>
                        <h3 className="invig-empty-state__title">Waiting for Learners to Begin</h3>
                        <p className="invig-empty-state__desc">When learners start this assessment, their live proctoring feeds will appear here in real time.</p>
                    </div>
                ) : (
                    <div className="invig-grid">
                        {sessions.map(session => {
                            const currentStatus = getStatus(session);
                            const isViolation = currentStatus === 'violation';
                            const isOffline = currentStatus === 'offline';
                            const isActive = currentStatus === 'active';
                            const latestImage = session.violationHistory?.length
                                ? session.violationHistory[session.violationHistory.length - 1].imageUrl
                                : null;
                            const hasLogs = !!(session.violationHistory?.length);

                            // DERIVED SOURCE OF TRUTH
                            const vCount = session.violationHistory?.length || 0;

                            return (
                                <div key={session.id} className={`invig-card invig-card--${currentStatus}${isViolation && vCount > 2 ? ' invig-card--critical' : ''}`}>
                                    {/* Card header */}
                                    <div className="invig-card__header">
                                        <div className="invig-card__learner">
                                            <div className="invig-card__avatar">
                                                {session.learnerName.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="invig-card__learner-info">
                                                <strong className="invig-card__name">{session.learnerName}</strong>
                                                {session.latestWarning && isViolation && (
                                                    <span className="invig-card__latest-warning">{session.latestWarning}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={`invig-card__badge invig-card__badge--${currentStatus}`}>
                                            {isViolation && <><AlertTriangle size={11} /> Violation</>}
                                            {isActive && <><CheckCircle size={11} /> Active</>}
                                            {isOffline && <><WifiOff size={11} /> Offline</>}
                                        </div>
                                    </div>

                                    {/* Card content — snapshot or placeholder */}
                                    <div className="invig-card__content">
                                        {isViolation && latestImage ? (
                                            <>
                                                <img src={latestImage} alt="Latest Violation Snapshot" className="invig-card__snapshot" />
                                                <div className="invig-card__snapshot-label"><Camera size={11} /> Latest Capture</div>
                                            </>
                                        ) : (
                                            <div className={`invig-card__placeholder invig-card__placeholder--${currentStatus}`}>
                                                {isOffline ? <WifiOff size={28} /> : <ShieldCheck size={28} />}
                                                {/* Display clear, non-alarming text when the session goes offline */}
                                                <span>{isOffline ? 'Session Ended / Offline' : isViolation ? 'Violation Flagged' : 'Environment Secure'}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Card footer */}
                                    <div className="invig-card__footer">
                                        <div className="invig-card__stats">
                                            <span className={`invig-card__violation-count${vCount > 0 ? ' invig-card__violation-count--warn' : ''}`}>
                                                <AlertTriangle size={11} />
                                                {vCount} violation{vCount !== 1 ? 's' : ''}
                                            </span>
                                            {session.lastHeartbeat && (
                                                <span className="invig-card__heartbeat">
                                                    <Clock size={11} />
                                                    {moment(session.lastHeartbeat?.toDate?.() || session.lastHeartbeat).fromNow()}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            className={`invig-card__btn-logs${hasLogs ? ' invig-card__btn-logs--active' : ''}`}
                                            disabled={!hasLogs}
                                            onClick={() => setSelectedSession(session)}
                                        >
                                            <Eye size={13} /> View Logs
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