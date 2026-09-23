// src/components/admin/AuditorLinkModal/AuditorLinkModal.tsx

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Mail, Clock, ShieldCheck, CheckSquare, Loader2, Send, Copy, Check
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../common/Toast/Toast';
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const DURATION_OPTIONS = [
    { minutes: 30, label: '30 Minutes (Quick Spot-Check)' },
    { minutes: 60, label: '1 Hour' },
    { minutes: 120, label: '2 Hours' },
    { minutes: 180, label: '3 Hours' },
    { minutes: 240, label: '4 Hours (Half-Day Audit)' },
    { minutes: 300, label: '5 Hours' },
    { minutes: 360, label: '6 Hours (Full-Day Verification Visit)' },
];

export const AuditorLinkModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const toast = useToast();
    const { user: currentUser, cohorts: storeCohorts } = useStore() as any;

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [organization, setOrganization] = useState<'QCTO' | 'MICT_SETA' | 'WR_SETA' | 'Other'>('QCTO');
    const [durationMinutes, setDurationMinutes] = useState<number>(120);
    const [selectedCohortIds, setSelectedCohortIds] = useState<string[]>([]);

    const [isSending, setIsSending] = useState(false);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const toggleCohort = (id: string) => {
        setSelectedCohortIds(prev =>
            prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
        );
    };

    const handleDispatchMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !fullName.trim()) return;

        setIsSending(true);
        try {
            const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

            // 1. Write Grant Record to Firestore
            const grantRef = await addDoc(collection(db, 'auditor_access_grants'), {
                fullName,
                email: email.toLowerCase().trim(),
                phone: phone.trim() || 'N/A',
                organization,
                allowedCohortIds: selectedCohortIds,
                durationMinutes,
                expiresAt,
                isActive: true,
                createdByUid: currentUser?.uid || 'admin',
                createdByName: currentUser?.fullName || 'SDP Quality Manager',
                createdAt: serverTimestamp()
            });

            const linkUrl = `${window.location.origin}/audit-access/${grantRef.id}`;
            setGeneratedLink(linkUrl);

            // 2. Dispatch Email via Firebase Trigger Email Collection
            await addDoc(collection(db, 'mail'), {
                to: email.trim(),
                message: {
                    subject: `[QCTO / SETA Audit] Temporary Inspection Portal Access - ${fullName}`,
                    html: `
                        <div style="font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <div style="border-bottom: 3px solid #16a34a; padding-bottom: 12px; margin-bottom: 20px;">
                                <h2 style={{ margin: 0, color: '#0f172a', textTransform: 'uppercase' }}>mLab SDP Compliance Portal</h2>
                                <span style="font-size: 12px; color: #16a34a; font-weight: bold; text-transform: uppercase;">Official Quality Assurance Inspection Link</span>
                            </div>
                            <p>Dear ${fullName},</p>
                            <p>You have been granted temporary, read-only inspection access to review Portfolios of Evidence (PoE) and compliance records.</p>
                            
                            <div style="background: #f8fafc; padding: 16px; border-left: 4px solid #0284c7; margin: 20px 0; font-size: 14px;">
                                <p style="margin: 0 0 6px 0;"><strong>Grant ID:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${grantRef.id}</code></p>
                                <p style="margin: 0 0 6px 0;"><strong>Assigned Organization:</strong> ${organization}</p>
                                <p style="margin: 0 0 6px 0;"><strong>Access Window:</strong> ${durationMinutes} Minutes</p>
                                <p style="margin: 0;"><strong>Expiration Time:</strong> ${new Date(expiresAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>

                            <p style="margin-bottom: 24px;">Click the button below to open your read-only inspection workspace:</p>
                            
                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="${linkUrl}" style="background: #16a34a; color: white; padding: 14px 28px; text-decoration: none; font-weight: 800; border-radius: 6px; display: inline-block; font-size: 15px;">
                                    Access Inspection Workspace →
                                </a>
                            </div>

                            <p style="font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                                Security Notice: This link is time-bound and restricted to official audit oversight. Do not forward this email.
                            </p>
                        </div>
                    `
                }
            });

            toast.success(`Magic Link dispatched to ${email}!`);
        } catch (error: any) {
            console.error("Failed to dispatch auditor link:", error);
            toast.error("Failed to send email. You can copy the link manually below.");
        } finally {
            setIsSending(false);
        }
    };

    const handleCopy = () => {
        if (!generatedLink) return;
        navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        toast.success("Magic Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
    };

    return createPortal(
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>

                {/* HEADER */}
                <div className="lfm-header" style={{ background: '#0f172a', borderBottom: '3px solid #16a34a' }}>
                    <h2 className="lfm-header__title" style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mail size={18} color="#4ade80" /> Dispatch Temporary Auditor Link
                    </h2>
                    <button className="lfm-close-btn" onClick={onClose} style={{ color: '#94a3b8' }}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleDispatchMagicLink} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div className="lfm-body" style={{ gap: '16px' }}>

                        {/* AUDITOR DETAILS */}
                        <div className="lfm-grid">
                            <div className="lfm-fg">
                                <label>Auditor Full Name *</label>
                                <input
                                    type="text"
                                    required
                                    className="lfm-input"
                                    placeholder="e.g. Sipho Ndlovu"
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                />
                            </div>
                            <div className="lfm-fg">
                                <label>Official Email Address *</label>
                                <input
                                    type="email"
                                    required
                                    className="lfm-input"
                                    placeholder="e.g. ndlovu.s@qcto.org.za"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                            <div className="lfm-fg">
                                <label>Mobile Phone (Optional)</label>
                                <input
                                    type="tel"
                                    className="lfm-input"
                                    placeholder="e.g. +27 82 123 4567"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                />
                            </div>
                            <div className="lfm-fg">
                                <label>Organization / Body *</label>
                                <select
                                    className="lfm-input"
                                    value={organization}
                                    onChange={(e: any) => setOrganization(e.target.value)}
                                >
                                    <option value="QCTO">QCTO (Quality Council for Trades &amp; Occupations)</option>
                                    <option value="MICT_SETA">MICT SETA</option>
                                    <option value="WR_SETA">W&amp;R SETA</option>
                                    <option value="Other">Other SETA / Professional Body</option>
                                </select>
                            </div>
                        </div>

                        {/* ACCESS DURATION SELECTOR (30 MIN - 6 HOURS) */}
                        <div className="lfm-fg lfm-fg--full">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Clock size={14} color="#0284c7" /> Access Window Duration *
                            </label>
                            <select
                                className="lfm-input"
                                value={durationMinutes}
                                onChange={e => setDurationMinutes(Number(e.target.value))}
                                style={{ fontWeight: 'bold', color: '#0369a1' }}
                            >
                                {DURATION_OPTIONS.map(opt => (
                                    <option key={opt.minutes} value={opt.minutes}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* SCOPED COHORTS SELECTOR */}
                        <div className="lfm-fg lfm-fg--full">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <CheckSquare size={14} color="#16a34a" /> Scoped Cohorts (Leave empty for all cohorts)
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '140px', overflowY: 'auto', background: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                {storeCohorts?.map((c: any) => {
                                    const isChecked = selectedCohortIds.includes(c.id);
                                    return (
                                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleCohort(c.id)}
                                                style={{ accentColor: '#16a34a' }}
                                            />
                                            <span style={{ fontWeight: isChecked ? 'bold' : 'normal' }}>{c.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* GENERATED LINK OUTPUT / BACKUP COPY */}
                        {generatedLink && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 800, display: 'block', marginBottom: '4px' }}>
                                    ✓ Magic Link Active &amp; Dispatched
                                </span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        readOnly
                                        value={generatedLink}
                                        style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        style={{ background: '#16a34a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy Link'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="lfm-footer">
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="lfm-btn lfm-btn--primary"
                            disabled={isSending || !email.trim() || !fullName.trim()}
                            style={{ background: '#16a34a', color: 'white', border: 'none' }}
                        >
                            {isSending ? (
                                <><Loader2 size={16} className="animate-spin" /> Dispatching Link...</>
                            ) : (
                                <><Send size={16} /> Dispatch Magic Link via Email</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};