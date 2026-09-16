// src/components/views/MentorApprovalView/MentorApprovalView.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, AlertCircle, Briefcase, Loader2,
  Check, CalendarRange, Info, ShieldCheck, Clock,
  XCircle, MessageSquare, Square, CheckSquare,
  Eye, EyeOff, ExternalLink, Paperclip, History, Edit2, PenTool, ListChecks, Link2, FileCode,
  FileText,
  Printer,
  X,
  ArrowLeft, Lock
} from 'lucide-react';
import moment from 'moment';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';

import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import './MentorApprovalView.css';
import { SignatureSetupModal } from '../../auth/SignatureSetupModal';

import mLabLogo from '../../../assets/logo/mlab_logo_white.png';
import { createPortal } from 'react-dom';
import { StatusModal, type StatusType } from '../../common/StatusModal/StatusModal';

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
  evidenceUrl?: string;
  rejectionReason?: string;
  supervisorComment?: string;
  selectedMilestones?: string[];
  customEvidenceTracking?: any[];
  cwkEvidence?: Record<string, string>;
  history?: any[];
  employerId?: string;
  placementId?: string;
  status?: string;
  [key: string]: any;
}

interface GroupedLearner {
  learnerName: string;
  totalHours: number;
  entries: WorkplaceLog[];
}

interface LogDecision {
  status?: 'approved' | 'rejected';
  reason: string;
}

const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';
const RED = '#dc2626';

function FullScreenCard({ stripColor, icon, iconBg, title, titleColor, message, buttonLabel, buttonBg, onButton }: any) {
  return (
    <div className="mav-state-outer">
      <div className="mav-state-card">
        <div className="mav-state-strip" style={{ background: stripColor }} />
        <div className="mav-state-icon-wrap" style={{ background: iconBg }}>{icon}</div>
        <h2 className="mav-state-title" style={{ color: titleColor ?? MIDNIGHT }}>{title}</h2>
        <p className="mav-state-msg">{message}</p>
        <button type="button" className="mav-state-btn" style={{ background: buttonBg ?? MIDNIGHT }} onClick={onButton}>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

export const MentorApprovalView: React.FC = () => {
  const { tokenId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, learners } = useStore() as any;

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tokenData, setTokenData] = useState<any>(null);
  const [logs, setLogs] = useState<GroupedLearner[]>([]);
  const [status, setStatus] = useState<'valid' | 'expired' | 'already_approved' | 'not_found'>('valid');

  const [isDirectLogMode, setIsDirectLogMode] = useState(false);

  // 🚀 STRICT SIGNATORY AUTHORIZATION FLAG
  const [isAuthorizedSignatory, setIsAuthorizedSignatory] = useState(false);

  const [registeredModal, setRegisteredModal] = useState<{
    isOpen: boolean;
    type: StatusType;
    title: string;
    message: string;
  } | null>(null);

  const [existingSignatureUrl, setExistingSignatureUrl] = useState<string | null>(null);
  const [pendingSignatureBase64, setPendingSignatureBase64] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  const [decisions, setDecisions] = useState<Record<string, LogDecision>>({});

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState<'approve' | 'reject' | null>(null);
  const [bulkReason, setBulkReason] = useState('');

  const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(null);
  const [previewCustomSeId, setPreviewCustomSeId] = useState<string | null>(null);
  const [previewCwkId, setPreviewCwkId] = useState<string | null>(null);

  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());

  const [showFullReason, setShowFullReason] = useState(false);

  // READ-ONLY LOGIC
  const isExplicitReadOnly = searchParams.get('readOnly') === 'true' || searchParams.get('mode') === 'readOnly';
  const [isLogFinalized, setIsLogFinalized] = useState(false);

  // 🚀 The user is forced into Read-Only if the log is finalized OR if they are NOT an authorized signatory.
  const isReadOnly = isExplicitReadOnly || isLogFinalized || !isAuthorizedSignatory;

  const isImageFile = (url: string) => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0];
    return /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(cleanUrl);
  };

  const handleBackNavigation = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/portal?tab=attendance', { replace: true });
    }
  };

  // ─── DUAL-USE DATA FETCHING & RELATIONAL EMPLOYER HYDRATION ───
  useEffect(() => {
    const fetchSecureData = async () => {
      if (!tokenId) return;
      setLoading(true);

      try {
        const currentAuthUser = await new Promise<any>((resolve) => {
          if (auth.currentUser) {
            resolve(auth.currentUser);
            return;
          }
          const unsubscribe = onAuthStateChanged(auth, (u) => {
            unsubscribe();
            resolve(u);
          });
        });

        const activeUser = currentAuthUser || user;
        const isFirestoreDocId = tokenId.length <= 32 && !tokenId.includes('.');

        // 🚀 CHECK IF LOGGED IN USER HAS MENTOR SIGNATORY RIGHTS
        let hasSignatoryRights = false;
        if (activeUser) {
          const roleFlag = String(activeUser.role || user?.role || '').toLowerCase() === 'mentor';
          const userFlag = (activeUser as any)?.isMentor === true || (activeUser as any)?.isMentor === 'true' || (activeUser as any)?.canVerifyLogbooks === true || (user as any)?.isMentor === true || (user as any)?.canVerifyLogbooks === true;
          const secondaryFlag = Array.isArray((activeUser as any)?.secondaryRoles) && (activeUser as any).secondaryRoles.includes('mentor');

          hasSignatoryRights = roleFlag || userFlag || secondaryFlag;
          setIsAuthorizedSignatory(hasSignatoryRights);
        } else {
          // Guest mode (using secure token link) implicitly grants signatory rights for that specific log
          setIsAuthorizedSignatory(true);
        }

        if (activeUser?.uid) {
          try {
            const logRef = doc(db, 'workplace_logs', tokenId);
            const logSnap = await getDoc(logRef);

            if (logSnap.exists()) {
              const logData = { id: logSnap.id, ...logSnap.data() } as WorkplaceLog;

              const staffRoles = ['admin', 'super_admin', 'superadmin', 'facilitator', 'assistant_facilitator', 'assessor', 'moderator'];
              const activeRole = String(activeUser.role || user?.role || '').toLowerCase();
              const isStaff = staffRoles.includes(activeRole);

              const userEmail = String(activeUser.email || user?.email || '').toLowerCase();
              const userUid = activeUser.uid;

              const isAssignedMentor = logData.mentorId === userUid ||
                (logData.secondaryMentorIds && logData.secondaryMentorIds.includes(userUid)) ||
                (logData.mentorEmail && userEmail && logData.mentorEmail.toLowerCase() === userEmail);

              if (isAssignedMentor || isStaff) {
                setIsDirectLogMode(true);

                const learnerInfo = learners?.find((l: any) => l.id === logData.learnerId || l.learnerId === logData.learnerId);

                // 🚀 RELATIONAL EMPLOYER HYDRATION
                let hostCompanyName = '';

                if (logData.placementId) {
                  try {
                    const placeSnap = await getDoc(doc(db, 'placements', logData.placementId));
                    if (placeSnap.exists()) {
                      const pData = placeSnap.data();
                      if (pData.employerId) {
                        const empSnap = await getDoc(doc(db, 'employers', pData.employerId));
                        if (empSnap.exists()) {
                          const eData = empSnap.data();
                          hostCompanyName = eData.name || eData.companyName || eData.employerName || eData.company || '';
                        }
                      }
                    }
                  } catch (pErr) {
                    console.warn("Placement hydration lookup notice:", pErr);
                  }
                }

                if (!hostCompanyName && logData.employerId) {
                  try {
                    const empSnap = await getDoc(doc(db, 'employers', logData.employerId));
                    if (empSnap.exists()) {
                      const eData = empSnap.data();
                      hostCompanyName = eData.name || eData.companyName || eData.employerName || eData.company || '';
                    } else {
                      const userEmpSnap = await getDoc(doc(db, 'users', logData.employerId));
                      if (userEmpSnap.exists()) {
                        const uData = userEmpSnap.data();
                        hostCompanyName = uData.companyName || uData.company || uData.fullName || uData.name || '';
                      }
                    }
                  } catch (eErr) {
                    console.warn("Employer document hydration lookup notice:", eErr);
                  }
                }

                if (!hostCompanyName) {
                  hostCompanyName = user?.companyName || user?.company || activeUser?.companyName || activeUser?.company || logData.employerName || logData.hostCompany || '';
                }

                setTokenData({
                  mentorName: activeUser.displayName || user?.fullName || user?.firstName || 'Workplace Supervisor',
                  mentorEmail: userEmail,
                  company: hostCompanyName || 'Host Company',
                });

                const userSig = user?.signatureUrl;
                if (userSig) {
                  setExistingSignatureUrl(userSig);
                }

                setLogs([{
                  learnerName: learnerInfo?.fullName || logData.learnerName || 'Learner',
                  totalHours: logData.totalHours || 0,
                  entries: [logData]
                }]);

                // 🚀 FINALIZED LOG DETECTION (PRE-POPULATE DECISION STATE FOR READ-ONLY VIEWING)
                const isFinalized = logData.status === 'Approved' || logData.status === 'Rejected';
                if (isExplicitReadOnly || isFinalized) {
                  setIsLogFinalized(true);
                  setDecisions({
                    [logData.id]: {
                      status: logData.status === 'Approved' ? 'approved' : 'rejected',
                      reason: logData.supervisorComment || logData.rejectionReason || ''
                    }
                  });
                } else {
                  setDecisions({});
                }

                setStatus('valid');
                setLoading(false);
                return;
              } else {
                setStatus('not_found');
                setLoading(false);
                return;
              }
            }
          } catch (directErr) {
            console.warn("Direct Firestore log fetch attempt failed:", directErr);
          }
        }

        if (isFirestoreDocId && !activeUser) {
          navigate(`/login?redirectTo=${encodeURIComponent(window.location.pathname)}`, { replace: true });
          return;
        }

        const fn = getFunctions();
        const rpc = httpsCallable(fn, 'getMentorVerificationDetails');
        const res: any = await rpc({ tokenId });
        const data = res.data;

        setStatus(data.status);

        if (data.status === 'valid') {
          const rawToken = data.tokenData || {};
          let guestCompanyName = rawToken.company || rawToken.companyName || rawToken.hostCompany || rawToken.employerName || '';

          if (!guestCompanyName && data.logs?.[0]?.entries?.[0]?.employerId) {
            try {
              const targetEmpId = data.logs[0].entries[0].employerId;
              const empSnap = await getDoc(doc(db, 'employers', targetEmpId));
              if (empSnap.exists()) {
                const eData = empSnap.data();
                guestCompanyName = eData.name || eData.companyName || eData.employerName || eData.company || '';
              }
            } catch (gErr) {
              console.warn("Guest mode employer lookup notice:", gErr);
            }
          }

          setTokenData({
            ...rawToken,
            company: guestCompanyName || 'Host Company'
          });
          setLogs(data.logs);

          if (data.existingSignatureUrl) {
            setExistingSignatureUrl(data.existingSignatureUrl);
          }

          if (isExplicitReadOnly) {
            setIsLogFinalized(true);
          }

          setDecisions({});
        }
      } catch (err) {
        console.error("Verification data pipeline error:", err);
        setStatus('not_found');
      } finally {
        setLoading(false);
      }
    };

    fetchSecureData();
  }, [tokenId, user, learners, isExplicitReadOnly]);

  const milestoneDescriptionsLookup = useMemo(() => {
    const dictionaryMap: Record<string, string> = {};
    if (!logs || !Array.isArray(logs)) return dictionaryMap;

    logs.forEach((group: GroupedLearner) => {
      group.entries.forEach((entry: WorkplaceLog) => {
        if (entry?.milestoneLabels) {
          Object.entries(entry.milestoneLabels).forEach(([code, label]) => {
            if (label) dictionaryMap[code] = label as string;
          });
        }
        if (entry?.milestoneTranslations) {
          Object.entries(entry.milestoneTranslations).forEach(([code, label]) => {
            if (label) dictionaryMap[code] = label as string;
          });
        }
      });
    });
    return dictionaryMap;
  }, [logs]);

  const allEntries = useMemo(() => logs.flatMap(l => l.entries), [logs]);
  const isAllSelected = allEntries.length > 0 && selectedIds.size === allEntries.length;

  const totalLogsCount = allEntries.length;
  const approvedCount = Object.values(decisions).filter(d => d.status === 'approved').length;
  const rejectedCount = Object.values(decisions).filter(d => d.status === 'rejected').length;
  const pendingCount = totalLogsCount - (approvedCount + rejectedCount);

  const selectedReasonsHtml = useMemo(() => {
    if (selectedIds.size === 0) return '';
    const reasons: string[] = [];
    selectedIds.forEach(id => {
      const r = decisions[id]?.reason;
      if (r) {
        const cleaned = r.replace(/&nbsp;/g, ' ').trim();
        const plainCheck = cleaned.replace(/(<([^>]+)>)/gi, "").trim();
        if (plainCheck) reasons.push(cleaned);
      }
    });
    return Array.from(new Set(reasons)).join('<hr style="border:0; border-top:1px dashed #cbd5e1; margin:8px 0;" />');
  }, [selectedIds, decisions]);

  const plainTextTotal = useMemo(() => {
    return selectedReasonsHtml.replace(/(<([^>]+)>)/gi, "").trim();
  }, [selectedReasonsHtml]);

  const isReasonLong = plainTextTotal.length > 150;

  const handleDecisionChange = (logId: string, decisionStatus: 'approved' | 'rejected') => {
    if (isReadOnly) return;
    setDecisions(prev => ({
      ...prev,
      [logId]: {
        status: decisionStatus,
        reason: prev[logId]?.reason || ''
      }
    }));
  };

  const handleReasonChange = (logId: string, reason: string) => {
    if (isReadOnly) return;
    setDecisions(prev => ({
      ...prev,
      [logId]: {
        ...prev[logId],
        status: prev[logId]?.status,
        reason
      }
    }));
  };

  const toggleHistoryAccordion = (logId: string) => {
    setExpandedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId); else next.add(logId);
      return next;
    });
  };

  const toggleSelection = (id: string) => {
    if (isReadOnly) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setDecisions(dPrev => {
          const dNext = { ...dPrev };
          delete dNext[id];
          return dNext;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isReadOnly) return;
    if (isAllSelected) {
      setSelectedIds(new Set());
      setDecisions({});
    } else {
      setSelectedIds(new Set(allEntries.map(e => e.id)));
    }
  };

  const handleBulkActionConfirm = () => {
    if (isReadOnly) return;
    const plainTextBulk = bulkReason.replace(/(<([^>]+)>)/gi, "").trim();

    if (showBulkModal === 'reject' && !plainTextBulk) {
      alert("Please provide a reason so the learner(s) can fix their submission.");
      return;
    }

    const targetStatus: 'approved' | 'rejected' = showBulkModal === 'approve' ? 'approved' : 'rejected';

    setDecisions(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => {
        next[id] = { status: targetStatus, reason: bulkReason };
      });
      return next;
    });

    setBulkReason('');
    setShowBulkModal(null);
  };

  const handleSubmitReview = async () => {
    if (isReadOnly) return;
    const rejectedLogs = Object.values(decisions).filter(d => d.status === 'rejected');

    if (rejectedLogs.some(d => (d.reason || '').replace(/(<([^>]+)>)/gi, "").trim().length < 5)) {
      alert('Please provide a short reason for all rejected timesheets so the learner knows what to fix.');
      return;
    }

    if (pendingCount > 0) {
      alert(`You still have ${pendingCount} unreviewed logs. Please approve or reject all logs before submitting.`);
      return;
    }

    if (!pendingSignatureBase64 && !existingSignatureUrl) {
      alert('A digital signature is legally required. Please add your signature in the declaration box on the left before submitting.');
      setShowSignatureModal(true);
      return;
    }

    setIsSaving(true);
    try {
      if (isDirectLogMode && (user?.uid || auth.currentUser?.uid)) {
        const activeUid = user?.uid || auth.currentUser?.uid;

        for (const logId of Object.keys(decisions)) {
          const decision = decisions[logId];
          const logRef = doc(db, 'workplace_logs', logId);
          const logSnap = await getDoc(logRef);

          if (logSnap.exists()) {
            const existingData = logSnap.data();
            let history = existingData.history || [];

            if (existingData.status === 'Rejected' || existingData.status === 'Approved') {
              const alreadyArchived = history.some((h: any) => h.updatedAt === existingData.updatedAt);
              if (!alreadyArchived) {
                history.push({ ...existingData });
              }
            }

            await updateDoc(logRef, {
              status: decision.status === 'approved' ? 'Approved' : 'Rejected',
              rejectionReason: decision.status === 'rejected' ? decision.reason : null,
              supervisorComment: decision.status === 'approved' ? decision.reason : null,
              history: history,
              verifiedBy: activeUid,
              verifiedAt: new Date().toISOString(),
              mentorSignatureUrl: pendingSignatureBase64 || existingSignatureUrl || user?.signatureUrl || null,
              updatedAt: new Date().toISOString()
            });
          }
        }

        if (pendingSignatureBase64 && user?.uid && !user.signatureUrl) {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, { signatureUrl: pendingSignatureBase64 });
        }

        setSelectedIds(new Set());

        const hasRejections = rejectedCount > 0;
        setRegisteredModal({
          isOpen: true,
          type: hasRejections ? 'warning' : 'success',
          title: hasRejections ? 'Review Submitted with Rejections' : 'Workplace Log Approved',
          message: hasRejections
            ? `Your review has been submitted. ${approvedCount} log(s) approved, and ${rejectedCount} log(s) sent back to the learner for revision.`
            : `All ${approvedCount} workplace log entries have been verified, signed, and saved successfully.`
        });
        return;
      }

      const fn = getFunctions();
      const rpc = httpsCallable(fn, 'submitMentorApproval');

      await rpc({
        tokenId,
        userAgent: navigator.userAgent,
        decisions,
        signatureBase64: pendingSignatureBase64,
        existingSignatureUrl: pendingSignatureBase64 ? null : existingSignatureUrl
      });

      setSelectedIds(new Set());
      setStatus('already_approved');
    } catch (err) {
      console.error("Submission Error:", err);
      alert('Something went wrong saving the log. Please try again or refresh.');
    } finally {
      setIsSaving(false);
    }
  };

  const initials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'L';

  const quillModules = useMemo(() => {
    if (isReadOnly) return { toolbar: false };
    return {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['clean']
      ]
    };
  }, [isReadOnly]);

  if (loading) return (
    <div className="mav-state-outer">
      <div className="mav-loading-wrapper">
        <div className="mav-loading-icon-wrap"><Loader2 size={24} color="var(--mlab-blue)" className="mav-spin" /></div>
        <h2 className="mav-loading-title" style={{ color: 'var(--mlab-blue)' }}>Establishing Secure Connection</h2>
        <p className="mav-loading-msg">Loading workplace verification environment…</p>
      </div>
    </div>
  );

  if (status === 'already_approved' && !isDirectLogMode) return <FullScreenCard stripColor={GREEN} iconBg="#dcfce7" icon={<CheckCircle size={32} color={GREEN} />} title="Timesheets Processed" message="Thank you. Your review has been recorded. Approved timesheets have been signed, and rejected ones have been sent back to the learners." buttonLabel="Return to Dashboard" onButton={() => navigate('/portal?tab=dashboard')} />;
  if (status === 'expired' || status === 'not_found') return <FullScreenCard stripColor="#ef4444" iconBg="#fef2f2" icon={<AlertCircle size={32} color="#ef4444" />} title="Verification Failed" titleColor="#ef4444" message="This secure verification link is no longer active, or has already been used. Please contact mLab administration to request a new link." buttonLabel="Return to Home" buttonBg="#ef4444" onButton={() => navigate('/login')} />;

  return (
    <div className="mav-root">

      {registeredModal?.isOpen && createPortal(
        <StatusModal
          type={registeredModal.type}
          title={registeredModal.title}
          message={registeredModal.message}
          confirmText="Done"
          onClose={() => {
            setRegisteredModal(null);
            handleBackNavigation();
          }}
        />,
        document.body
      )}

      {showSignatureModal && (
        <SignatureSetupModal
          isGuestMode={!user?.uid}
          guestName={tokenData?.mentorName || 'Workplace Mentor'}
          guestCompany={tokenData?.company || 'Host Company'}
          existingSignatureUrl={existingSignatureUrl}
          onGuestSave={(base64) => setPendingSignatureBase64(base64)}
          onComplete={() => setShowSignatureModal(false)}
        />
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .quill-content-display { 
            width: 100% !important; 
            max-width: 100% !important; 
            box-sizing: border-box !important; 
            overflow-x: hidden !important; 
        }
        .quill-content-display *, .quill-content-display p, .quill-content-display span, .quill-content-display li { 
            white-space: normal !important; 
            word-break: break-word !important; 
            line-height: 1.6 !important; 
            color: #1e293b !important; 
        }
        .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 8px 0 !important; }
        .quill-content-display li { margin-bottom: 4px !important; }
        .quill-content-display a { color: #2563eb !important; text-decoration: underline !important; font-weight: 600 !important; cursor: pointer !important; }
        .quill-content-display a:hover { color: #1d4ed8 !important; }
        .quill-content-display code { background-color: #f1f5f9 !important; color: #0f172a !important; padding: 3px 6px !important; border-radius: 4px !important; font-family: monospace !important; font-size: 0.85em !important; }
        
        .quill-content-display pre, .quill-content-display pre.ql-syntax { 
            white-space: pre !important; 
            overflow-x: auto !important; 
            max-width: 100% !important; 
            background-color: #1e293b !important; 
            color: #f8fafc !important; 
            padding: 12px 16px !important; 
            border-radius: 6px !important; 
            font-family: monospace !important; 
            font-size: 0.85rem !important; 
            line-height: 1.5 !important; 
            margin: 10px 0 !important; 
            border: 1px solid #334155 !important; 
            word-break: normal !important;
            word-wrap: normal !important;
            display: block !important;
        }
        .quill-content-display blockquote { border-left: 4px solid #94a3b8 !important; padding-left: 12px !important; margin: 12px 0 !important; color: #475569 !important; font-style: italic !important; }
        .quill-content-display table { border-collapse: collapse !important; width: 100% !important; margin: 12px 0 !important; font-size: 0.85rem !important; }
        .quill-content-display table th, .quill-content-display table td { border: 1px solid #cbd5e1 !important; padding: 8px 12px !important; text-align: left !important; word-break: break-word !important; }
        .quill-content-display table th { background-color: #f8fafc !important; font-weight: 700 !important; color: #0f172a !important; }
        .quill-content-display table tr:nth-child(even) { background-color: #f8fafc !important; }
        
        .ql-container.ql-snow { background-color: #ffffff !important; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px; }
        .ql-editor { color: #1e293b !important; background-color: #ffffff !important; font-family: inherit !important; font-size: 0.9rem !important; }
        .ql-editor p, .ql-editor span, .ql-editor li, .ql-editor td { color: #1e293b !important; }
        .ql-editor.ql-blank::before { color: #94a3b8 !important; font-style: normal !important; }
        .ql-toolbar.ql-snow { background-color: #f8fafc !important; border-bottom: 1px solid #cbd5e1 !important; border-top-left-radius: 4px; border-top-right-radius: 4px; }
        .ql-toolbar.ql-snow .ql-stroke { stroke: #475569 !important; }
        .ql-toolbar.ql-snow .ql-fill { fill: #475569 !important; }
        .ql-toolbar.ql-snow .ql-picker { color: #475569 !important; }
        .mav-entry-content { flex: 1 !important; min-width: 0 !important; max-width: 100% !important; }
        .mav-tasks, .mav-reject-reason-wrap { max-width: 100% !important; overflow: hidden !important; }
        
        /* ─── CI STANDARDIZED UI ACTION BUTTONS ─── */
        .ci-btn-approve { border: 2px solid #16a34a; background: white; color: #16a34a; padding: 8px 16px; border-radius: 4px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s; font-size: 0.8rem; width: 100%; text-transform: uppercase; }
        .ci-btn-approve:hover { background: #f0fdf4; }
        .ci-btn-approve.is-selected { background: #16a34a; color: white; }

        .ci-btn-reject { border: 2px solid #dc2626; background: white; color: #dc2626; padding: 8px 16px; border-radius: 4px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s; font-size: 0.8rem; width: 100%; text-transform: uppercase; }
        .ci-btn-reject:hover { background: #fef2f2; }
        .ci-btn-reject.is-selected { background: #dc2626; color: white; }

        .ci-btn-midnight { border: none; background: var(--mlab-blue); color: white; padding: 12px 16px; border-radius: 4px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s; font-size: 0.85rem; width: 100%; text-transform: uppercase; }
        .ci-btn-midnight:hover { background: var(--mlab-midnight); }
        .ci-btn-midnight:disabled { background: #94a3b8; cursor: not-allowed; opacity: 0.7; }
        
        .mentor-milestone-review-box { margin-top: 10px !important; padding: 12px 14px !important; background: #f0fdf4 !important; border: 1px solid #bbf7d0 !important; border-radius: 6px !important; }
        .mentor-milestone-review-title { font-size: 0.8rem !important; font-weight: 800 !important; color: #166534 !important; margin-bottom: 6px !important; display: flex !important; align-items: center !important; gap: 6px !important; text-transform: uppercase !important; letter-spacing: 0.03em !important; }
        .mentor-milestone-row-item { font-size: 0.8rem !important; color: #1e293b !important; display: flex !important; align-items: flex-start !important; gap: 8px !important; font-weight: 600 !important; line-height: 1.4 !important; margin-bottom: 4px !important; }
        .mentor-milestone-row-item:last-child { margin-bottom: 0 !important; }
        .mentor-milestone-pill-badge { background: #dcfce7 !important; color: #15803d !important; padding: 1px 6px !important; border-radius: 4px !important; font-size: 0.7rem !important; border: 1px solid #bbf7d0 !important; font-family: monospace !important; flex-shrink: 0 !important; margin-top: 1px !important; }

        .mentor-se-review-stack { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; width: 100%; }
        .mentor-se-review-card { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #4f46e5; border-radius: 4px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
        .mentor-se-meta-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
        .mentor-se-code-label { background: #e0e7ff; color: #4338ca; font-weight: 800; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
        .mentor-se-target-chips { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
        .mentor-se-target-tag { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-weight: 700; font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; }
        
        /* UN-SQUISH SIDEBAR: LOCKED WIDTH & SMOOTH VERTICAL SCROLLING */
        .mav-layout {
            display: flex !important;
            gap: 1.5rem !important;
            max-width: 1600px !important;
            margin: 0 auto !important;
            padding: 1.5rem !important;
            align-items: flex-start !important;
        }
        .mav-sidebar {
            width: 340px !important;
            min-width: 340px !important;
            flex-shrink: 0 !important;
            height: calc(100vh - 100px) !important;
            position: sticky !important;
            top: 85px !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            padding: 1rem !important;
            background: #ffffff !important;
            border-radius: 8px !important;
            border: 1px solid #e2e8f0 !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
            box-sizing: border-box !important;
        }
        .mav-sidebar-scroll {
            flex: 1 1 auto !important;
            overflow-y: auto !important;
            padding-right: 6px !important;
            flex-direction: column !important;
            gap: 0.85rem !important;
            margin-bottom: 0.5rem !important;
        }
        .mav-sidebar-scroll::-webkit-scrollbar {
            width: 4px;
        }
        .mav-sidebar-scroll::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }
        .mav-actions-sticky {
            flex-shrink: 0 !important;
            padding-top: 0.75rem !important;
            padding-bottom: 0.25rem !important;
            background: #ffffff !important;
            border-top: 1px solid #e2e8f0 !important;
            z-index: 20 !important;
            margin-top: auto !important;
        }
    `}} />

      {showBulkModal && createPortal(
        <div className="lfm-overlay" style={{ zIndex: 99999, borderRadius: 16 }}>

          <div className="lfm-modal animate-fade-in" style={{
            maxWidth: '750px', background: 'white',
            borderRadius: 2, display: 'flex', flexDirection: 'column',
            overflow: 'hidden'
          }}>

            <div className="lfm-header">
              <div>
                <div style={{ color: 'white' }}>
                  <h3 style={{ margin: 0, color: showBulkModal === 'reject' ? RED : 'var(--mlab-white)', fontFamily: 'var(--font-heading)', fontSize: '1.25rem', textTransform: 'uppercase' }}>
                    <FileText size={18} /> Bulk {showBulkModal === 'reject' ? 'Reject' : 'Approve'} ({selectedIds.size} Selected)
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: showBulkModal === 'reject' ? 'red' : 'var(--mlab-green)' }}>
                    {showBulkModal === 'reject' ? 'Provide structural adjustment remarks. This will apply to all selected logs.' : 'Add optional approval feedback or commendation notes for the learners.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '8px', textTransform: 'uppercase' }}>
                {showBulkModal === 'reject' ? 'Required Reason for Rejection *' : 'Optional Supervisor Comments'}
              </label>
              <div style={{ background: 'white', borderRadius: '0', border: `1px solid ${showBulkModal === 'reject' ? '#fca5a5' : '#bbf7d0'}`, overflow: 'hidden', color: '#1e293b' }}>
                <ReactQuill
                  theme="snow"
                  value={bulkReason}
                  onChange={setBulkReason}
                  modules={quillModules}
                  placeholder={showBulkModal === 'reject' ? "Describe what modification benchmarks the learners must reach..." : "Great job applying risk assessment criteria today..."}
                  style={{ height: '220px', marginBottom: '42px' }}
                />
              </div>
            </div>

            <div className="lfm-footer" style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'var(--mlab-bg)' }}>
              <button
                type="button"
                className="lfm-btn lfm-btn--ghost"
                onClick={() => { setShowBulkModal(null); setBulkReason(''); }}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{ background: 'var(--mlab-blue)' }}
                className={`lfm-btn ${showBulkModal === 'reject' ? 'lfm-btn--danger' : 'lfm-btn--primary'}`}
                onClick={handleBulkActionConfirm}
              >
                {showBulkModal === 'reject' ? <XCircle size={14} /> : <CheckCircle size={14} />}
                Confirm {showBulkModal === 'reject' ? 'Rejection' : 'Approval'}
              </button>
            </div>

          </div>
        </div>, document.body)}

      <header className="mav-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(isDirectLogMode || user?.uid) && (
            <button
              type="button"
              onClick={handleBackNavigation}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: 'white',
                padding: '6px 14px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')}
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <div className="mav-brand">
            <img src={mLabLogo} alt="Logo" style={{ width: 70, height: 'auto' }} />
            <span className="mav-topbar-title">Workplace Verification Portal</span>
          </div>
        </div>
        <div className="mav-secure-pill">
          <span className="mav-secure-dot" style={{ background: isReadOnly ? '#eab308' : '#94c73d' }} />
          <span className="mav-secure-txt" style={{ color: isReadOnly ? '#fef08a' : '#94c73d' }}>
            {isReadOnly ? 'Read-Only Mode' : isDirectLogMode ? 'Direct Assessor Link' : 'Secure Connection'}
          </span>
        </div>
      </header>

      <div className="mav-layout">
        <aside className="mav-sidebar">

          {/* SCROLLABLE SIDEBAR CONTENT AREA */}
          <div className="mav-sidebar-scroll">
            <div className="mav-mentor-card">
              <div className="mav-mentor-card-top">
                <div className="mav-mentor-avatar">{initials(tokenData?.mentorName || 'M')}</div>
                <div>
                  <div className="mav-mentor-name">{tokenData?.mentorName}</div>
                  <div className="mav-mentor-role">
                    {isAuthorizedSignatory ? 'Authorised Workplace Mentor' : 'Unauthorized Observer'}
                  </div>
                </div>
              </div>
              <div className="mav-mentor-body">
                <div className="mav-mentor-field"><span className="mav-field-lbl">Registered email</span><span className="mav-field-val">{tokenData?.mentorEmail}</span></div>

                {/* HOST COMPANY DISPLAY WITH RELATIONAL HYDRATION FALLBACKS */}
                <div className="mav-mentor-field">
                  <span className="mav-field-lbl">Company</span>
                  <span className="mav-field-val">
                    {tokenData?.company || tokenData?.companyName || tokenData?.hostCompany || tokenData?.employerName || 'Host Company'}
                  </span>
                </div>

                <div className="mav-divider" />

                <div className="mav-summary-box">
                  <div className="mav-summary-row"><span>Total Submissions</span><strong>{totalLogsCount}</strong></div>
                  <div className="mav-summary-row success"><span>Approved</span><strong>{approvedCount}</strong></div>
                  <div className="mav-summary-row danger"><span>Queried / Rejected</span><strong>{rejectedCount}</strong></div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 16, marginBottom: 16, background: '#f4f7f9', padding: '1rem', borderRadius: '12px', border: '1px solid #dde4e8', flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
                <ShieldCheck size={18} color="#3b6d11" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.3 }}>
                  Declaration of Authenticity
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5, margin: '0 0 12px 0' }}>
                By signing below, you digitally declare that the approved work activities in the logbook are a true reflection of learners' practical exposure.
              </p>

              <div style={{ background: "white", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", width: "100%" }}>
                {pendingSignatureBase64 || existingSignatureUrl ? (
                  <>
                    <div style={{ background: "#f8fafc", width: "100%", borderRadius: "4px", border: "1px dashed #e2e8f0", padding: "10px", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80px" }}>
                      <img src={`${pendingSignatureBase64 || existingSignatureUrl}`} alt="Signature Preview" crossOrigin="anonymous" style={{ maxHeight: "70px", maxWidth: "100%", objectFit: "contain" }} />
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => setShowSignatureModal(true)}
                        style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", width: "100%", justifyContent: "center", transition: "background 0.2s" }}
                        onMouseOver={(e) => e.currentTarget.style.background = "#e2e8f0"}
                        onMouseOut={(e) => e.currentTarget.style.background = "#f1f5f9"}
                      >
                        <Edit2 size={12} /> Edit Signature
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ height: "80px", width: "100%", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.8rem", fontStyle: "italic", textAlign: "center", padding: "0 10px" }}>
                      No signature attached.<br />Required for submission.
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => setShowSignatureModal(true)}
                        style={{ background: "var(--mlab-blue)", color: "white", border: "none", padding: "8px 12px", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", width: "100%", justifyContent: "center", transition: "background 0.2s" }}
                      >
                        <PenTool size={14} /> Add Digital Signature
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* DYNAMIC RICH TEXT PREVIEW BOX FOR SELECTED LOGS */}
            {selectedIds.size > 0 && selectedReasonsHtml && (
              <div className="animate-fade-in" style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderLeft: '4px solid var(--mlab-blue, #0284c7)',
                borderRadius: '4px',
                padding: '0.75rem',
                fontSize: '0.78rem',
                color: '#334155'
              }}>
                <div style={{ fontWeight: 700, color: '#073f4e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MessageSquare size={13} color="var(--mlab-blue, #0284c7)" />
                  <span>Applied Supervisor Note ({selectedIds.size} Selected)</span>
                </div>

                <div
                  className="quill-content-display"
                  dangerouslySetInnerHTML={{ __html: selectedReasonsHtml }}
                  style={{
                    maxHeight: showFullReason ? 'none' : '90px',
                    overflow: 'hidden',
                    fontSize: '0.78rem',
                    lineHeight: '1.4'
                  }}
                />

                {isReasonLong && (
                  <button
                    type="button"
                    onClick={() => setShowFullReason(!showFullReason)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--mlab-blue, #0284c7)',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      padding: 0,
                      marginTop: '6px',
                      textDecoration: 'underline'
                    }}
                  >
                    {showFullReason ? 'See Less' : 'See More'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* PINNED/FLOATING BOTTOM ACTION CONTAINER */}
          <div className="mav-actions-sticky">
            {isReadOnly ? (
              <button type="button" className="ci-btn-midnight" disabled style={{ background: '#64748b', cursor: 'not-allowed', opacity: 0.85 }}>
                <Lock size={15} /> {!isAuthorizedSignatory ? 'Unauthorized Signatory' : 'Finalized Record (Read-Only)'}
              </button>
            ) : (
              <button type="button" className="ci-btn-midnight" onClick={handleSubmitReview} disabled={isSaving || pendingCount > 0}>
                {isSaving ? <><Loader2 size={16} className="mav-spin" /> Securing Signatures…</> : <><Check size={16} /> Submit Final Review</>}
              </button>
            )}

            {/* HIDDEN UNTIL AT LEAST ONE DECISION HAS BEEN MADE */}
            {(approvedCount > 0 || rejectedCount > 0) && (
              pendingCount > 0 ? (
                <div style={{ fontSize: '0.75rem', textAlign: 'center', color: '#b45309', fontWeight: 600, marginTop: '8px' }}>
                  ⚠️ {pendingCount} remaining log{pendingCount > 1 ? 's' : ''} awaiting decision.
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', textAlign: 'center', color: rejectedCount > 0 ? '#991b1b' : '#15803d', fontWeight: 700, marginTop: '8px' }}>
                  {rejectedCount === 0 && `✓ All ${approvedCount} log${approvedCount > 1 ? 's' : ''} marked for Approval`}
                  {approvedCount === 0 && `⚠️ All ${rejectedCount} log${rejectedCount > 1 ? 's' : ''} marked for Rejection`}
                  {approvedCount > 0 && rejectedCount > 0 && `✓ Review complete: ${approvedCount} Approved, ${rejectedCount} Rejected`}
                </div>
              )
            )}
          </div>

        </aside>

        <section className="mav-feed">
          <div className="mav-feed-container">

            <div className="mav-feed-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CalendarRange size={16} color={MIDNIGHT} />
                <h2 className="mav-feed-title">{isReadOnly ? 'Verification Record Detail' : 'Pending Logbook Entries'}</h2>
              </div>
            </div>

            {!isReadOnly && (
              <div className="mav-bulk-bar">
                <div className="mav-bulk-left" onClick={toggleSelectAll}>
                  {isAllSelected ? <CheckSquare size={18} color={MIDNIGHT} /> : <Square size={18} color="#94a3b8" />}
                  <span>Select All ({allEntries.length})</span>
                </div>
                {selectedIds.size > 0 && (
                  <div className="mav-bulk-right animate-fade-in" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="mav-bulk-count" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginRight: '4px' }}>{selectedIds.size} Selected:</span>
                    <button type="button" onClick={() => setShowBulkModal('reject')} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: '4px', fontWeight: 800, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', textTransform: 'uppercase' }}><XCircle size={12} /> Reject</button>
                    <button type="button" onClick={() => setShowBulkModal('approve')} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '4px', fontWeight: 800, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', textTransform: 'uppercase' }}><CheckCircle size={12} /> Approve</button>
                  </div>
                )}
              </div>
            )}

            <div className="mav-feed-scroll-area">
              {logs.map((learner, li) => (
                <div key={li} className="mav-learner-block">
                  <div className="mav-learner-hdr">
                    <div className="mav-learner-hdr-left">
                      <div className="mav-learner-avatar">{initials(learner.learnerName)}</div>
                      <span className="mav-learner-name">{learner.learnerName}</span>
                    </div>
                    <span className="mav-hours-badge">{learner.totalHours} hrs logged</span>
                  </div>

                  {learner.entries.map((entry) => {
                    const waCodes = entry.selectedMilestones?.filter((m: string) => m.startsWith('WA')) || [];
                    const cwkCodes = entry.selectedMilestones?.filter((m: string) => m.startsWith('CWK')) || [];
                    const currentDecision = decisions[entry.id]?.status;

                    return (
                      <div key={entry.id} className={`mav-entry ${currentDecision === 'rejected' ? 'is-rejected-card' : ''}`}>

                        {!isReadOnly && (
                          <div className={`mav-entry-checkbox ${selectedIds.has(entry.id) ? 'selected' : ''}`} onClick={() => toggleSelection(entry.id)}>
                            {selectedIds.has(entry.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                          </div>
                        )}

                        <div className="mav-entry-content">
                          <div className="mav-entry-top">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="mav-entry-date">{moment(entry.dateString).format('dddd, DD MMMM YYYY')}</span>

                              {(entry.evidenceUrl || (entry.customEvidenceTracking && entry.customEvidenceTracking.length > 0)) && (
                                <span title="Supporting evidence attached" style={{ display: 'inline-flex' }}>
                                  <Paperclip size={13} color="var(--mlab-blue)" />
                                </span>
                              )}

                              {entry.rejectionReason && !decisions[entry.id]?.status && (
                                <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                  Resubmitted (v2)
                                </span>
                              )}

                              {/* CARD DECISION BADGE */}
                              {currentDecision === 'approved' && (
                                <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: '1px solid #bbf7d0' }}>
                                  ✓ Marked Approved
                                </span>
                              )}
                              {currentDecision === 'rejected' && (
                                <span style={{ background: '#fef2f2', color: '#991b1b', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: '1px solid #fecaca' }}>
                                  ✕ Marked Rejected
                                </span>
                              )}
                            </div>
                            <span className="mav-time-chip"><Clock size={11} color="#3b6d11" /> {entry.startTime} – {entry.endTime} ({entry.totalHours}h)</span>
                          </div>

                          {entry.isQctoAligned && (
                            <div className="mav-qcto">
                              <div className="mav-qcto-icon"><Briefcase size={14} color="#d97706" /></div>
                              <div>
                                <div className="mav-qcto-title">Official QCTO Alignment</div>
                                <div className="mav-qcto-row"><strong>WA Code:</strong> {entry.workActivityCode} — {entry.workActivityLabel}</div>
                                <div className="mav-qcto-row"><strong>Module:</strong> {entry.moduleName}</div>
                              </div>
                            </div>
                          )}

                          {/* WORK ACTIVITIES (WA) RENDERING BLOCK */}
                          {entry.isQctoAligned && waCodes.length > 0 && (
                            <div className="mentor-milestone-review-box animate-fade-in">
                              <div className="mentor-milestone-review-title">
                                <ListChecks size={13} color="#166534" /> Targeted Milestones Up For Sign-Off:
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {waCodes.map((milestoneId: string) => (
                                  <div key={milestoneId} className="mentor-milestone-row-item">
                                    <span className="mentor-milestone-pill-badge">{milestoneId}</span>
                                    <span>{milestoneDescriptionsLookup[milestoneId] || entry.workActivityLabel || 'Curriculum Specification Metric Framework Requirement'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* CONTEXTUALIZED WORKPLACE KNOWLEDGE (CWK) RENDER MATRIX */}
                          {entry.isQctoAligned && cwkCodes.length > 0 && (
                            <div className="mentor-milestone-review-box animate-fade-in" style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}>
                              <div className="mentor-milestone-review-title" style={{ color: '#0369a1' }}>
                                <Info size={13} color="#0369a1" /> Contextual Knowledge Validations:
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {cwkCodes.map((milestoneId: string) => {
                                  const cwkFileUrl = entry.cwkEvidence?.[milestoneId];
                                  const isPreviewOpen = previewCwkId === `${entry.id}_${milestoneId}`;

                                  return (
                                    <div key={milestoneId} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'white', padding: '6px', borderRadius: '4px', border: '1px dashed #bae6fd' }}>
                                      <div className="mentor-milestone-row-item" style={{ marginBottom: 0 }}>
                                        <span className="mentor-milestone-pill-badge" style={{ background: '#e0f2fe', color: '#0284c7', borderColor: '#bae6fd' }}>{milestoneId}</span>
                                        <span>{milestoneDescriptionsLookup[milestoneId] || 'Contextual Framework Concept'}</span>
                                      </div>

                                      {cwkFileUrl ? (
                                        <div style={{ paddingLeft: '48px', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                          <button
                                            type="button"
                                            onClick={() => setPreviewCwkId(isPreviewOpen ? null : `${entry.id}_${milestoneId}`)}
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                          >
                                            {isPreviewOpen ? <EyeOff size={11} /> : <Eye size={11} />}
                                            Preview Proof
                                          </button>
                                          <a
                                            href={cwkFileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                                          >
                                            <ExternalLink size={11} /> Open File
                                          </a>
                                        </div>
                                      ) : (
                                        <div style={{ paddingLeft: '48px', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700 }}>
                                          ⚠️ Missing Expected Knowledge Proof Documentation
                                        </div>
                                      )}

                                      {isPreviewOpen && cwkFileUrl && (
                                        <div className="animate-fade-in" style={{ marginLeft: '48px', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                                          {isImageFile(cwkFileUrl) ? (
                                            <img src={cwkFileUrl} alt="CWK Artifact inline" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }} />
                                          ) : (
                                            <iframe src={cwkFileUrl} title="CWK Preview Frame" style={{ width: '100%', height: '200px', border: 'none', background: 'white' }} />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* RELATIONAL MULTI-LINE SUPPORTING EVIDENCE (SE) RENDER MATRIX */}
                          {entry.isQctoAligned && entry.customEvidenceTracking && entry.customEvidenceTracking.length > 0 && (
                            <div className="mentor-se-review-stack animate-fade-in">
                              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                <FileCode size={13} /> Bound Supporting Evidence Portfolio Artifacts ({entry.customEvidenceTracking.length}):
                              </div>

                              {entry.customEvidenceTracking.map((seItem: any, sIdx: number) => {
                                const customSeUniqueKey = `${entry.id}_${seItem.code}`;
                                const isCustomPreviewOpen = previewCustomSeId === customSeUniqueKey;

                                return (
                                  <div key={sIdx} className="mentor-se-review-card">
                                    <div className="mentor-se-meta-row">
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span className="mentor-se-code-label">{seItem.code}</span>
                                        <strong style={{ fontSize: '0.82rem', color: MIDNIGHT }}>{seItem.description}</strong>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: seItem.type === 'link' ? '#fffbeb' : '#f8fafc', color: seItem.type === 'link' ? '#b45309' : '#475569', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>
                                          {seItem.type === 'link' ? <Link2 size={10} /> : <FileText size={10} />}
                                          {seItem.type || 'file'}
                                        </span>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {seItem.type !== 'link' && seItem.fileUrl && (
                                          <button
                                            type="button"
                                            onClick={() => setPreviewCustomSeId(isCustomPreviewOpen ? null : customSeUniqueKey)}
                                            style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', transition: 'background 0.15s' }}
                                          >
                                            {isCustomPreviewOpen ? <EyeOff size={11} /> : <Eye size={11} />}
                                            Preview
                                          </button>
                                        )}
                                        {seItem.fileUrl && (
                                          <a
                                            href={seItem.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', textDecoration: 'none', border: '1px solid #bfdbfe' }}
                                          >
                                            <ExternalLink size={11} />
                                            {seItem.type === 'link' ? 'Open URL Link' : 'Open Document'}
                                          </a>
                                        )}
                                      </div>
                                    </div>

                                    {seItem.linkedWorkActivities && seItem.linkedWorkActivities.length > 0 && (
                                      <div className="mentor-se-target-chips">
                                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Validates Objectives:</span>
                                        {seItem.linkedWorkActivities.map((waCode: string) => {
                                          const boundWaDescriptionText = entry.milestoneLabels?.[waCode] || milestoneDescriptionsLookup[waCode] || 'Work Activity Objective';
                                          return (
                                            <span key={waCode} title={boundWaDescriptionText} className="mentor-se-target-tag">{waCode}</span>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {isCustomPreviewOpen && seItem.type !== 'link' && seItem.fileUrl && (
                                      <div className="animate-fade-in" style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                                        {isImageFile(seItem.fileUrl) ? (
                                          <img src={seItem.fileUrl} alt="Artifact Frame inline" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '240px', objectFit: 'contain' }} />
                                        ) : (
                                          <iframe src={seItem.fileUrl} title="Artifact Preview Frame" style={{ width: '100%', height: '240px', border: 'none', background: 'white' }} />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {entry.history && entry.history.length > 0 && (
                            <div style={{ marginBottom: '12px', marginTop: '10px' }}>
                              <button
                                type="button"
                                onClick={() => toggleHistoryAccordion(entry.id)}
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                              >
                                <History size={12} /> {expandedHistoryIds.has(entry.id) ? "Hide Past Versions" : `View Full Audit History Trail (${entry.history.length})`}
                              </button>

                              {expandedHistoryIds.has(entry.id) && (
                                <div className="animate-fade-in" style={{ padding: '12px', borderLeft: '2px dashed #cbd5e1', background: '#fafbfc', borderRadius: '0 8px 8px 0', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  {entry.history.map((hist: any, hIdx: number) => (
                                    <div key={hIdx} style={{ fontSize: '0.85rem' }}>
                                      <div style={{ fontWeight: 700, color: MIDNIGHT, marginBottom: '4px' }}>Revision stage v{hIdx + 1} ({moment(hist.updatedAt).format('DD MMM YYYY')})</div>
                                      <div className="quill-content-display" dangerouslySetInnerHTML={{ __html: hist.tasksPerformed }} style={{ background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0', color: '#475569' }} />

                                      {hist.rejectionReason && (
                                        <div style={{ color: '#991b1b', marginTop: '6px' }}>
                                          <strong>↳ Supervisor Note:</strong>
                                          <div
                                            className="quill-content-display"
                                            style={{ background: '#fff1f2', border: '1px solid #fecaca', padding: '8px', borderRadius: '4px', color: '#9f1239', marginTop: '4px' }}
                                            dangerouslySetInnerHTML={{ __html: hist.rejectionReason }}
                                          />
                                        </div>
                                      )}

                                      {hist.customEvidenceTracking && hist.customEvidenceTracking.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', background: '#f8fafc', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4338ca' }}>📎 Version Linked Proof items ({hist.customEvidenceTracking.length})</span>
                                          {hist.customEvidenceTracking.map((hSe: any, hSeIdx: number) => {
                                            const historyTrText = hist.milestoneLabels?.[hSe.code] || milestoneDescriptionsLookup[hSe.code] || '';
                                            return (
                                              <div key={hSeIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', background: 'white', padding: '3px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                <span><span style={{ color: '#4338ca', fontWeight: 800, marginRight: '4px', fontFamily: 'monospace' }}>{hSe.code}</span> {hSe.description} {historyTrText && `(${historyTrText})`}</span>
                                                {hSe.fileUrl && <a href={hSe.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Open URI</a>}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {entry.rejectionReason && !expandedHistoryIds.has(entry.id) && (
                            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: '4px', marginBottom: '12px', marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                              <History size={16} color="#475569" style={{ marginTop: '2px', flexShrink: 0 }} />
                              <div style={{ width: '100%' }}>
                                <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#475569', display: 'block', marginBottom: '2px' }}>Your Previous Modification Target Note</strong>
                                <div
                                  className="quill-content-display"
                                  style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}
                                  dangerouslySetInnerHTML={{ __html: entry.rejectionReason }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="mav-tasks" style={{ marginTop: '10px' }}>
                            <div className="mav-tasks-lbl"><Info size={11} color="#9aabb0" /> Tasks Performed</div>
                            <div
                              className="quill-content-display"
                              style={{ fontSize: '13px', color: '#334155', lineHeight: 1.65, margin: 0 }}
                              dangerouslySetInnerHTML={{ __html: entry.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">No description text provided...</span>' }}
                            />
                          </div>

                          {entry.evidenceUrl && (
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button
                                  type="button"
                                  onClick={() => setPreviewEvidenceId(previewEvidenceId === entry.id ? null : entry.id)}
                                  style={{ background: '#f1f5f9', color: '#073f4e', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.15s' }}
                                >
                                  {previewEvidenceId === entry.id ? <EyeOff size={14} /> : <Eye size={14} />}
                                  {previewEvidenceId === entry.id ? 'Close Summary Preview' : 'Preview Global Evidence'}
                                </button>
                                <a
                                  href={entry.evidenceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: 'white', padding: '5px 12px', borderRadius: '4px', textDecoration: 'none', border: '1px solid #cbd5e1', transition: 'background 0.2s' }}
                                >
                                  <ExternalLink size={14} /> Open Full View
                                </a>
                              </div>

                              {previewEvidenceId === entry.id && (
                                <div className="animate-fade-in" style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                                  {isImageFile(entry.evidenceUrl) ? (
                                    <img src={entry.evidenceUrl} alt="Evidence Render inline" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '350px', objectFit: 'contain' }} />
                                  ) : (
                                    <iframe
                                      src={entry.evidenceUrl}
                                      title="Evidence Preview Frame"
                                      style={{ width: '100%', height: '350px', border: 'none', borderRadius: '4px', background: 'white' }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* STANDARDIZED ACTION BUTTONS (DISABLED IN READ-ONLY MODE) */}
                          {!isReadOnly && (
                            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                              <div>
                                <button
                                  type="button"
                                  style={{ height: 30, fontSize: 12, textTransform: 'none' }}
                                  className={`ci-btn-approve ${currentDecision === 'approved' ? 'is-selected' : ''}`}
                                  onClick={() => handleDecisionChange(entry.id, 'approved')}
                                >
                                  <CheckCircle size={14} /> Approve
                                </button>
                              </div>

                              <div>
                                <button
                                  type="button"
                                  style={{ height: 30, fontSize: 12, textTransform: 'none' }}
                                  className={`ci-btn-reject ${currentDecision === 'rejected' ? 'is-selected' : ''}`}
                                  onClick={() => handleDecisionChange(entry.id, 'rejected')}
                                >
                                  <XCircle size={14} /> Reject
                                </button>
                              </div>
                            </div>
                          )}

                          {(!isReadOnly || decisions[entry.id]?.reason) && (
                            <div className="mav-reject-reason-wrap animate-fade-in" style={{ marginTop: '10px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: currentDecision === 'rejected' ? '#9f1239' : '#15803d' }}>
                                <MessageSquare size={12} />
                                {currentDecision === 'rejected' ? 'Required: Reason for Rejection' : 'Optional: Supervisor Approval Comments'}
                              </label>
                              <div style={{ background: 'white', borderRadius: '4px', border: `1px solid ${currentDecision === 'rejected' ? '#fecaca' : '#bbf7d0'}`, overflow: 'hidden', color: '#1e293b' }}>
                                <ReactQuill
                                  theme="snow"
                                  readOnly={isReadOnly}
                                  value={decisions[entry.id]?.reason || ''}
                                  onChange={(val) => handleReasonChange(entry.id, val)}
                                  modules={quillModules}
                                  placeholder={currentDecision === 'rejected' ? "Explain explicitly what structural elements are missing..." : "Add commendation or notes regarding today's progress..."}
                                  style={{ height: isReadOnly ? 'auto' : '95px', marginBottom: isReadOnly ? '0px' : '42px' }}
                                />
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

          </div>
        </section>
      </div>
    </div>
  );
};