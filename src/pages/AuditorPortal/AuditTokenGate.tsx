// src/pages/AuditorPortal/AuditTokenGate.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ShieldCheck, Loader2, AlertTriangle, ArrowRight, Lock, CheckCircle2, User, Mail, Briefcase, CheckSquare } from 'lucide-react';
import { useStore } from '../../store/useStore';
import Loader from '../../components/common/Loader/Loader';

export const AuditTokenGate: React.FC = () => {
    const { tokenId } = useParams<{ tokenId: string }>();
    const navigate = useNavigate();
    const setUser = useStore((state: any) => state.setUser);

    const [status, setStatus] = useState<'verifying' | 'valid' | 'expired' | 'invalid'>('verifying');
    const [grantData, setGrantData] = useState<any>(null);
    const [assignedCohortNames, setAssignedCohortNames] = useState<string[]>([]);
    const [isClaiming, setIsClaiming] = useState(false);

    useEffect(() => {
        const verifyToken = async () => {
            if (!tokenId) {
                setStatus('invalid');
                return;
            }

            try {
                const grantSnap = await getDoc(doc(db, 'auditor_access_grants', tokenId));
                if (!grantSnap.exists()) {
                    setStatus('invalid');
                    return;
                }

                const data = grantSnap.data();
                const now = new Date().getTime();
                const expiry = new Date(data.expiresAt).getTime();

                if (!data.isActive || now > expiry) {
                    setStatus('expired');
                    return;
                }

                setGrantData(data);

                const allowedIds: string[] = Array.isArray(data.allowedCohortIds) ? data.allowedCohortIds : [];

                if (allowedIds.length > 0) {
                    try {
                        const cohortSnaps = await Promise.all(
                            allowedIds.map(cId => getDoc(doc(db, 'cohorts', cId)))
                        );
                        const names = cohortSnaps
                            .filter(snap => snap.exists())
                            .map(snap => snap.data()?.name || snap.id);
                        setAssignedCohortNames(names);
                    } catch (cErr) {
                        console.error("Error fetching assigned cohort names:", cErr);
                    }
                }

                setStatus('valid');
            } catch (err) {
                console.error("Token verification error:", err);
                setStatus('invalid');
            }
        };

        verifyToken();
    }, [tokenId]);

    const handleEnterPortal = async () => {
        setIsClaiming(true);
        try {
            await updateDoc(doc(db, 'auditor_access_grants', tokenId!), {
                lastAccessedAt: serverTimestamp(),
                accessCount: (grantData.accessCount || 0) + 1
            });

            const allowedIds: string[] = Array.isArray(grantData.allowedCohortIds) ? grantData.allowedCohortIds : [];

            const tempAuditorUser = {
                uid: `auditor_${tokenId}`,
                email: grantData.email,
                fullName: grantData.fullName,
                organization: grantData.organization,
                role: 'qcto_auditor',
                allowedCohortIds: allowedIds,
                isTemporaryAuditor: true,
                profileCompleted: true,
                expiresAt: grantData.expiresAt
            };

            // 🚀 PERSIST TO SESSION STORAGE FOR PAGE RELOADS
            sessionStorage.setItem('temp_auditor_session', JSON.stringify(tempAuditorUser));

            setUser(tempAuditorUser);
            navigate('/audit-portal', { replace: true });
        } catch (err) {
            console.error("Failed to claim access:", err);
        } finally {
            setIsClaiming(false);
        }
    };

    const GateStyles = () => (
        <style>{`
            .atg-wrapper { min-height: 100vh; background: #f8fafc; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: var(--font-body); }
            .atg-card { background: #ffffff; border: 1px solid var(--mlab-border); border-radius: 6px; width: 100%; max-width: 560px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); overflow: hidden; }
            .atg-header { display: flex; align-items: center; gap: 16px; padding: 20px 24px; background: #ffffff; border-bottom: 2px solid #e2e8f0; }
            .atg-header--valid { border-top: 4px solid var(--mlab-green); }
            .atg-header--error { border-top: 4px solid #dc2626; flex-direction: column; text-align: center; gap: 12px; padding: 32px 24px 20px; }
            .atg-header__icon { width: 48px; height: 48px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .atg-header__icon--valid { background: #dcfce7; color: var(--mlab-green); border: 1px solid #bbf7d0; }
            .atg-header__icon--error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
            .atg-header__title { margin: 0 0 4px 0; fontFamily: var(--font-heading); font-size: 1.15rem; font-weight: 800; color: var(--mlab-blue); text-transform: uppercase; letter-spacing: 0.05em; }
            .atg-header__desc { margin: 0; font-size: 0.8rem; color: var(--mlab-grey); }
            .atg-body { padding: 24px; }
            .atg-info-grid { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 20px; }
            .atg-info-row { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #ffffff; font-size: 0.85rem; }
            .atg-info-row:last-child { border-bottom: none; }
            .atg-info-row:nth-child(even) { background: #f8fafc; }
            .atg-info-label { width: 140px; font-weight: 700; color: var(--mlab-grey); display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
            .atg-info-value { flex: 1; font-weight: 600; color: var(--mlab-blue); }
            .atg-expiry-box { background: #fff1f2; border: 1px solid #fecdd3; border-left: 4px solid #e11d48; padding: 12px 16px; border-radius: 4px; display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
            .atg-expiry-text { font-size: 0.8rem; color: #9f1239; font-weight: 700; }
            .atg-verified-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 16px; border-radius: 4px; display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: #166534; margin-bottom: 24px; }
            .atg-btn { width: 100%; background: var(--mlab-green); color: white; border: none; padding: 14px; border-radius: 4px; font-family: var(--font-heading); font-size: 0.9rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.2); }
            .atg-btn:hover:not(:disabled) { background: #15803d; transform: translateY(-1px); }
            .atg-btn:disabled { opacity: 0.7; cursor: not-allowed; }
            .atg-footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: var(--mlab-grey); text-align: center; }
        `}</style>
    );

    if (status === 'verifying') {
        return (
            <div className="atg-wrapper" style={{ flexDirection: 'column', gap: '20px', position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
                <GateStyles />
                <Loader message="Authenticating Secure Session..." />
            </div>
        );
    }

    if (status === 'expired' || status === 'invalid') {
        return (
            <div className="atg-wrapper" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
                <GateStyles />
                <div className="atg-card animate-fade-in">
                    <div className="atg-header atg-header--error">
                        <div className="atg-header__icon atg-header__icon--error">
                            <AlertTriangle size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="atg-header__title">
                                {status === 'expired' ? 'Inspection Session Expired' : 'Invalid Access Token'}
                            </h2>
                            <p className="atg-header__desc">
                                {status === 'expired'
                                    ? 'This time-bound inspection link has exceeded its authorized limit.'
                                    : 'The access token provided is unrecognized or has been explicitly revoked.'}
                            </p>
                        </div>
                    </div>
                    <div className="atg-body" style={{ textAlign: 'center' }}>
                        <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
                            For security and compliance purposes, quality assurance links are strictly time-bound.
                            Please contact the SDP Quality Administrator to request a newly provisioned magic link.
                        </p>
                    </div>
                    <div className="atg-footer">
                        Mobile Applications Laboratory NPC (mLab) | QMS Governance
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="atg-wrapper" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
            <GateStyles />
            <div className="atg-card animate-fade-in">
                <div className="atg-header atg-header--valid">
                    <div className="atg-header__icon atg-header__icon--valid">
                        <ShieldCheck size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h2 className="atg-header__title">Quality Assurance Gateway</h2>
                        <p className="atg-header__desc">{grantData?.organization} Official Inspection Session</p>
                    </div>
                </div>

                <div className="atg-body">
                    <div className="atg-info-grid">
                        <div className="atg-info-row">
                            <div className="atg-info-label"><User size={14} /> Auditor Name</div>
                            <div className="atg-info-value">{grantData?.fullName}</div>
                        </div>
                        <div className="atg-info-row">
                            <div className="atg-info-label"><Mail size={14} /> Official Email</div>
                            <div className="atg-info-value">{grantData?.email}</div>
                        </div>
                        <div className="atg-info-row">
                            <div className="atg-info-label"><Briefcase size={14} /> Organization</div>
                            <div className="atg-info-value">{grantData?.organization}</div>
                        </div>
                        <div className="atg-info-row" style={{ alignItems: 'flex-start' }}>
                            <div className="atg-info-label" style={{ paddingTop: '2px' }}><CheckSquare size={14} /> Inspection Scope</div>
                            <div className="atg-info-value">
                                {assignedCohortNames.length > 0 ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {assignedCohortNames.map((name, idx) => (
                                            <span
                                                key={idx}
                                                style={{
                                                    background: '#e0f2fe',
                                                    color: '#0369a1',
                                                    border: '1px solid #bae6fd',
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700
                                                }}
                                            >
                                                {name}
                                            </span>
                                        ))}
                                    </div>
                                ) : Array.isArray(grantData?.allowedCohortIds) && grantData.allowedCohortIds.length > 0 ? (
                                    `${grantData.allowedCohortIds.length} Cohort(s) Assigned`
                                ) : (
                                    <span style={{ color: '#15803d', fontWeight: 700 }}>All Active Cohorts (Full Scope)</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="atg-expiry-box">
                        <Lock size={18} color="#e11d48" />
                        <div className="atg-expiry-text">
                            Strict Session Expiration: {grantData?.expiresAt ? new Date(grantData.expiresAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}
                        </div>
                    </div>

                    <div className="atg-verified-box">
                        <CheckCircle2 size={18} />
                        <div><strong>Identity Verified:</strong> Click below to securely enter the read-only inspection workspace.</div>
                    </div>

                    <button
                        onClick={handleEnterPortal}
                        disabled={isClaiming}
                        className="atg-btn"
                    >
                        {isClaiming ? (
                            <><Loader2 size={18} className="animate-spin" /> Authenticating Session...</>
                        ) : (
                            <>Begin Inspection Workspace <ArrowRight size={18} /></>
                        )}
                    </button>
                </div>

                <div className="atg-footer">
                    Mobile Applications Laboratory NPC (mLab) | Secured by QMS Gateway
                </div>
            </div>
        </div>
    );
};