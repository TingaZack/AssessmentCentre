// src/components/views/MentorApprovalView/MentorApprovalView.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle, AlertCircle, Briefcase, Loader2,
  Check, X, CalendarRange, Info, ShieldCheck, Clock,
} from 'lucide-react';
import moment from 'moment';
import { getFunctions, httpsCallable } from 'firebase/functions';

import './MentorApprovalView.css';

interface WorkplaceLog {
  id: string;
  learnerId: string;
  learnerName?: string;
  totalHours?: number;
  dateString?: string;
  startTime?: string;
  endTime?: string;
  tasksPerformed?: string;
  isQctoAligned?: boolean;
  moduleName?: string;
  workActivityCode?: string;
  workActivityLabel?: string;
  [key: string]: any;
}

interface GroupedLearner {
  learnerName: string;
  totalHours: number;
  entries: WorkplaceLog[];
}

const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';

// ─── Full-screen state wrapper ────────────────────────────────────────────────
function FullScreenCard({
  stripColor,
  icon,
  iconBg,
  title,
  titleColor,
  message,
  buttonLabel,
  buttonBg,
  onButton,
}: {
  stripColor: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  titleColor?: string;
  message: string;
  buttonLabel: string;
  buttonBg?: string;
  onButton: () => void;
}) {
  return (
    <div className="mav-state-outer">
      <div className="mav-state-card">
        <div className="mav-state-strip" style={{ background: stripColor }} />
        <div className="mav-state-icon-wrap" style={{ background: iconBg }}>{icon}</div>
        <h2 className="mav-state-title" style={{ color: titleColor ?? MIDNIGHT }}>{title}</h2>
        <p className="mav-state-msg">{message}</p>
        <button className="mav-state-btn" style={{ background: buttonBg ?? MIDNIGHT }} onClick={onButton}>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export const MentorApprovalView: React.FC = () => {
  const { tokenId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tokenData, setTokenData] = useState<any>(null);
  const [logs, setLogs] = useState<GroupedLearner[]>([]);
  const [status, setStatus] = useState<'valid' | 'expired' | 'already_approved' | 'not_found'>('valid');

  useEffect(() => {
    const fetchSecureData = async () => {
      if (!tokenId) return;
      try {
        const fn = getFunctions();
        const rpc = httpsCallable(fn, 'getMentorVerificationDetails');
        const res: any = await rpc({ tokenId });
        const data = res.data;
        setStatus(data.status);
        if (data.status === 'valid') {
          setTokenData(data.tokenData);
          setLogs(data.logs);
        }
      } catch {
        setStatus('not_found');
      } finally {
        setLoading(false);
      }
    };
    fetchSecureData();
  }, [tokenId]);

  const handleApproveAll = async () => {
    setIsSaving(true);
    try {
      const fn = getFunctions();
      const rpc = httpsCallable(fn, 'submitMentorApproval');
      await rpc({ tokenId, userAgent: navigator.userAgent });
      setStatus('already_approved');
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const totalHours = logs.reduce((s, l) => s + l.totalHours, 0);

  // Initials helper
  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // ── Loading ──
  if (loading) return (
    <div className="mav-state-outer">
      <div className="mav-loading-wrapper">
        <div className="mav-loading-icon-wrap">
          <Loader2 size={24} color={GREEN} className="mav-spin" />
        </div>
        <h2 className="mav-loading-title">Establishing Secure Connection</h2>
        <p className="mav-loading-msg">Loading workplace verification environment…</p>
      </div>
    </div>
  );

  // ── Approved ──
  if (status === 'already_approved') return (
    <FullScreenCard
      stripColor={GREEN}
      iconBg="rgba(148,199,61,.12)"
      icon={<CheckCircle size={32} color={GREEN} />}
      title="Timesheets Approved"
      message="Thank you. Your digital signature has been recorded and secured for QCTO compliance. You may now close this window safely."
      buttonLabel="Return to Home"
      onButton={() => navigate('/login')}
    />
  );

  // ── Expired / Not Found ──
  if (status === 'expired' || status === 'not_found') return (
    <FullScreenCard
      stripColor="#ef4444"
      iconBg="rgba(239,68,68,.1)"
      icon={<AlertCircle size={32} color="#ef4444" />}
      title="Verification Failed"
      titleColor="#ef4444"
      message="This secure verification link is no longer active, or has already been used. Please contact mLab administration to request a new link."
      buttonLabel="Return to Home"
      buttonBg="#ef4444"
      onButton={() => navigate('/login')}
    />
  );

  // ── Valid: main 2-column portal ──
  return (
    <div className="mav-root">

      {/* ── TOP BAR ── */}
      <header className="mav-topbar">
        <div className="mav-brand">
          <span className="mav-brand-text">
            <span className="mav-brand-m">m</span>
            <span className="mav-brand-lab">lab</span>
          </span>
          <span className="mav-topbar-title">Workplace Verification Portal</span>
        </div>
        <div className="mav-secure-pill">
          <span className="mav-secure-dot" />
          <span className="mav-secure-txt">Secure Connection</span>
        </div>
      </header>

      {/* ── 2-COLUMN LAYOUT ── */}
      <div className="mav-layout">

        {/* ════ SIDEBAR ════ */}
        <aside className="mav-sidebar">

          {/* Mentor card */}
          <div className="mav-mentor-card">
            <div className="mav-mentor-card-top">
              <div className="mav-mentor-avatar">
                {initials(tokenData.mentorName || 'M')}
              </div>
              <div>
                <div className="mav-mentor-name">{tokenData.mentorName}</div>
                <div className="mav-mentor-role">Authorised Workplace Mentor</div>
              </div>
            </div>
            <div className="mav-mentor-body">
              <div className="mav-mentor-field">
                <span className="mav-field-lbl">Registered email</span>
                <span className="mav-field-val">{tokenData.mentorEmail}</span>
              </div>
              {tokenData.company && (
                <div className="mav-mentor-field">
                  <span className="mav-field-lbl">Company</span>
                  <span className="mav-field-val">{tokenData.company}</span>
                </div>
              )}
              <div className="mav-divider" />
              <div className="mav-stats-row">
                <div className="mav-stat-box">
                  <div className="mav-stat-val">{logs.length}</div>
                  <div className="mav-stat-lbl">Learners</div>
                </div>
                <div className="mav-stat-box">
                  <div className="mav-stat-val">{totalHours}</div>
                  <div className="mav-stat-lbl">Total hrs</div>
                </div>
              </div>
            </div>
          </div>

          {/* Declaration */}
          <div className="mav-declaration">
            <ShieldCheck size={18} color="#3b6d11" className="mav-declaration-icon" />
            <div>
              <span className="mav-declaration-title">Declaration of Authenticity</span>
              <p className="mav-declaration-txt">
                By approving, you digitally declare that these work activities are a true reflection of learners' practical exposure, in strict alignment with QCTO regulations.
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="mav-actions">
            <button
              className="mav-approve-btn"
              onClick={handleApproveAll}
              disabled={isSaving}
            >
              {isSaving ? (
                <><Loader2 size={14} className="mav-spin" /> Securing Signatures…</>
              ) : (
                <>
                  <Check size={14} />
                  Approve &amp; Sign All Logs
                  <span className="mav-approve-pill">
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke={MIDNIGHT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7h10M8 3l4 4-4 4" /></svg>
                  </span>
                </>
              )}
            </button>

            <button
              className="mav-reject-btn"
              disabled={isSaving}
              onClick={() => alert('Rejection workflow triggered. The learner will be notified to correct their logs and resubmit.')}
            >
              <X size={13} color="#dc2626" />
              Query / Reject Submissions
            </button>
          </div>

        </aside>

        {/* ════ LOG FEED ════ */}
        <section className="mav-feed">

          <div className="mav-feed-header">
            <CalendarRange size={16} color={MIDNIGHT} />
            <h2 className="mav-feed-title">Submitted Logbook Entries</h2>
          </div>

          {logs.map((learner, li) => (
            <div key={li} className="mav-learner-block">

              {/* Learner header */}
              <div className="mav-learner-hdr">
                <div className="mav-learner-hdr-left">
                  <div className="mav-learner-avatar">{initials(learner.learnerName)}</div>
                  <span className="mav-learner-name">{learner.learnerName}</span>
                </div>
                <span className="mav-hours-badge">{learner.totalHours} hrs logged</span>
              </div>

              {/* Entries */}
              {learner.entries.map((entry) => (
                <div key={entry.id} className="mav-entry">

                  <div className="mav-entry-top">
                    <span className="mav-entry-date">
                      {moment(entry.dateString).format('dddd, DD MMMM YYYY')}
                    </span>
                    <span className="mav-time-chip">
                      <Clock size={11} color="#3b6d11" />
                      {entry.startTime} – {entry.endTime} ({entry.totalHours}h)
                    </span>
                  </div>

                  {entry.isQctoAligned && (
                    <div className="mav-qcto">
                      <div className="mav-qcto-icon">
                        <Briefcase size={14} color="#d97706" />
                      </div>
                      <div>
                        <div className="mav-qcto-title">Official QCTO Alignment</div>
                        <div className="mav-qcto-row"><strong>WA Code:</strong> {entry.workActivityCode} — {entry.workActivityLabel}</div>
                        <div className="mav-qcto-row"><strong>Module:</strong> {entry.moduleName}</div>
                      </div>
                    </div>
                  )}

                  <div className="mav-tasks">
                    <div className="mav-tasks-lbl">
                      <Info size={11} color="#9aabb0" />
                      Evidence / Tasks Performed
                    </div>
                    <p className="mav-tasks-txt">{entry.tasksPerformed}</p>
                  </div>

                </div>
              ))}
            </div>
          ))}

        </section>
      </div>
    </div>
  );
};