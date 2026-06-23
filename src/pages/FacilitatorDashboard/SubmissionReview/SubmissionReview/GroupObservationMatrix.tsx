// src/pages/FacilitatorDashboard/SubmissionReview/GroupObservationMatrix.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Users, UserPlus, Check, X, Save, AlertCircle, Info, Loader2, CheckCircle2, ArrowLeft, Play, Square, Timer, Trash2, ListChecks } from 'lucide-react';

export interface Peer {
    id: string;
    name: string;
}

export interface ChecklistCriterion {
    id: string;
    description: string;
    blockId: string;
    index: number;
    type: 'checklist' | 'workplace';
}

interface GroupObservationMatrixProps {
    currentLearner: Peer;
    availablePeers: Peer[];
    criteria: ChecklistCriterion[];

    // Lifted Persistent State Props
    selectedGroup: Peer[];
    setSelectedGroup: React.Dispatch<React.SetStateAction<Peer[]>>;
    matrix: Record<string, Record<string, boolean>>;
    setMatrix: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>;
    groupTimeMatrix: Record<string, Record<string, { startTime?: string; endTime?: string }>>;
    setGroupTimeMatrix: React.Dispatch<React.SetStateAction<Record<string, Record<string, { startTime?: string; endTime?: string }>>>>;
    groupRemarks: string;
    setGroupRemarks: React.Dispatch<React.SetStateAction<string>>;
    isGroupSessionActive: boolean;
    setIsGroupSessionActive: React.Dispatch<React.SetStateAction<boolean>>;

    onCancel: () => void;
    onDisband: () => void;
    onSaveGroup: () => Promise<void>;
}

export const GroupObservationMatrix: React.FC<GroupObservationMatrixProps> = ({
    currentLearner,
    availablePeers,
    criteria,

    selectedGroup,
    setSelectedGroup,
    matrix,
    setMatrix,
    groupTimeMatrix,
    setGroupTimeMatrix,
    groupRemarks,
    setGroupRemarks,
    isGroupSessionActive,
    setIsGroupSessionActive,

    onCancel,
    onDisband,
    onSaveGroup,
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [showPeerSelector, setShowPeerSelector] = useState(!isGroupSessionActive);

    // ─── ALPHABETIZE PEERS FOR BETTER UX ───
    const sortedPeers = useMemo(() => {
        return [...availablePeers].sort((a, b) => a.name.localeCompare(b.name));
    }, [availablePeers]);

    // Dynamic UI counter refresh tracker tick for running timers
    const [, setTicker] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTicker(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    // Prevent background scrolling
    useEffect(() => {
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.overflow = 'hidden';

        // Inject global pulse keyframe for live timers
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes timer-pulse {
                0% { opacity: 1; }
                50% { opacity: 0.6; }
                100% { opacity: 1; }
            }
            .live-timer-pulse { animation: timer-pulse 1.5s infinite ease-in-out; }
            .sticky-col { position: sticky; left: 0; z-index: 10; box-shadow: 4px 0 8px rgba(0,0,0,0.05); }
        `;
        document.head.appendChild(style);

        return () => {
            document.body.style.overflow = originalStyle;
            document.head.removeChild(style);
        };
    }, []);

    // ─── PEER SELECTION HANDLERS ───
    const togglePeer = (peer: Peer) => {
        setSelectedGroup((prev) => {
            if (prev.find((p) => p.id === peer.id)) {
                return prev.filter((p) => p.id !== peer.id);
            }
            return [...prev, peer];
        });
    };

    const handleSelectAllPeers = () => {
        const allIncluded = sortedPeers.every(p => selectedGroup.some(sg => sg.id === p.id));
        if (allIncluded) {
            // Deselect all (keep current learner)
            setSelectedGroup([currentLearner]);
        } else {
            // Select all
            const completeGroup = [currentLearner, ...sortedPeers.filter(p => p.id !== currentLearner.id)];
            setSelectedGroup(completeGroup);
        }
    };

    // ─── MATRIX CELL HANDLERS ───
    const handleCellToggle = (criterionId: string, learnerId: string, value: boolean) => {
        setMatrix((prev) => ({
            ...prev,
            [criterionId]: {
                ...(prev[criterionId] || {}),
                [learnerId]: value,
            },
        }));
    };

    const handleRowCheckAll = (criterionId: string, value: boolean) => {
        setMatrix((prev) => {
            const updatedRow: Record<string, boolean> = { ...(prev[criterionId] || {}) };
            selectedGroup.forEach((learner) => {
                updatedRow[learner.id] = value;
            });
            return { ...prev, [criterionId]: updatedRow };
        });
    };

    const handleColumnCheckAll = (learnerId: string, value: boolean) => {
        setMatrix((prev) => {
            const updatedMatrix = { ...prev };
            criteria.forEach((criterion) => {
                if (!updatedMatrix[criterion.id]) {
                    updatedMatrix[criterion.id] = {};
                }
                updatedMatrix[criterion.id][learnerId] = value;
            });
            return updatedMatrix;
        });
    };

    // ─── TIMER CONTROLLER HANDLERS ──────────────────────────────────────────
    const handleStartCellTimer = (criterionId: string, learnerId: string) => {
        const nowIso = new Date().toISOString();
        setGroupTimeMatrix((prev) => ({
            ...prev,
            [criterionId]: {
                ...(prev[criterionId] || {}),
                [learnerId]: {
                    ...(prev[criterionId]?.[learnerId] || {}),
                    startTime: nowIso,
                    endTime: undefined
                }
            }
        }));
    };

    const handleStopCellTimer = (criterionId: string, learnerId: string) => {
        const nowIso = new Date().toISOString();
        setGroupTimeMatrix((prev) => {
            const cell = prev[criterionId]?.[learnerId];
            if (!cell?.startTime) return prev;
            return {
                ...prev,
                [criterionId]: {
                    ...(prev[criterionId] || {}),
                    [learnerId]: {
                        ...cell,
                        endTime: nowIso
                    }
                }
            };
        });
    };

    const handleStartRowTimers = (criterionId: string) => {
        const nowIso = new Date().toISOString();
        setGroupTimeMatrix((prev) => {
            const updatedRow = { ...(prev[criterionId] || {}) };
            selectedGroup.forEach((learner) => {
                updatedRow[learner.id] = {
                    ...(updatedRow[learner.id] || {}),
                    startTime: nowIso,
                    endTime: undefined
                };
            });
            return { ...prev, [criterionId]: updatedRow };
        });
    };

    const handleStopRowTimers = (criterionId: string) => {
        const nowIso = new Date().toISOString();
        setGroupTimeMatrix((prev) => {
            const updatedRow = { ...(prev[criterionId] || {}) };
            selectedGroup.forEach((learner) => {
                const cell = updatedRow[learner.id];
                if (cell?.startTime && !cell.endTime) {
                    updatedRow[learner.id] = {
                        ...cell,
                        endTime: nowIso
                    };
                }
            });
            return { ...prev, [criterionId]: updatedRow };
        });
    };

    // ─── MANUAL TIME OVERRIDES ──────────────────────────────────────────────
    const formatTimeForInput = (isoString?: string) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '';
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    };

    const handleManualTimeChange = (criterionId: string, learnerId: string, field: 'startTime' | 'endTime', timeValue: string) => {
        setGroupTimeMatrix((prev) => {
            const cell = prev[criterionId]?.[learnerId] || {};

            if (!timeValue) {
                return {
                    ...prev,
                    [criterionId]: {
                        ...(prev[criterionId] || {}),
                        [learnerId]: { ...cell, [field]: undefined }
                    }
                };
            }

            const parts = timeValue.split(':').map(Number);
            const hours = parts[0] || 0;
            const minutes = parts[1] || 0;
            const seconds = parts[2] || 0;

            let baseDate = new Date();

            if (cell[field]) {
                baseDate = new Date(cell[field]!);
            } else if (field === 'endTime' && cell.startTime) {
                baseDate = new Date(cell.startTime);
            } else if (field === 'startTime' && cell.endTime) {
                baseDate = new Date(cell.endTime);
            }

            if (!isNaN(hours) && !isNaN(minutes)) {
                baseDate.setHours(hours, minutes, seconds, 0);
            }

            return {
                ...prev,
                [criterionId]: {
                    ...(prev[criterionId] || {}),
                    [learnerId]: {
                        ...cell,
                        [field]: baseDate.toISOString()
                    }
                }
            };
        });
    };

    const getLiveDurationText = (startTime?: string, endTime?: string) => {
        if (!startTime) return { text: '', isNegative: false };
        const end = endTime ? new Date(endTime).getTime() : new Date().getTime();
        const start = new Date(startTime).getTime();

        const diffSecs = Math.floor((end - start) / 1000);
        if (diffSecs < 0) return { text: 'Invalid Time', isNegative: true }; // 🚀 Smart Validation for manual overrides

        const m = Math.floor(diffSecs / 60);
        const s = diffSecs % 60;
        return { text: `${m}m ${s}s`, isNegative: false };
    };

    // ─── SAVE FLOW ─────────────────────────────────────────────────────────
    const handleContinueToMatrix = () => {
        setIsGroupSessionActive(true);
        setShowPeerSelector(false);
    };

    const handleSave = async () => {
        if (!groupRemarks.trim()) {
            alert("Please provide Overall Group Remarks before saving. This is required for QCTO compliance.");
            return;
        }

        setIsSaving(true);
        try {
            const nowIso = new Date().toISOString();

            // Auto-caps dangling timers
            setGroupTimeMatrix((prev) => {
                const finalized = { ...prev };
                Object.keys(finalized).forEach((critId) => {
                    Object.keys(finalized[critId]).forEach((learnerId) => {
                        const cell = finalized[critId][learnerId];
                        if (cell?.startTime && !cell.endTime) {
                            finalized[critId][learnerId] = {
                                ...cell,
                                endTime: nowIso
                            };
                        }
                    });
                });
                return finalized;
            });

            // React batch timeout
            setTimeout(async () => {
                await onSaveGroup();
            }, 50);

        } catch (error) {
            console.error("Failed to save group matrix:", error);
            setIsSaving(false);
        }
    };

    const allPeersSelected = sortedPeers.length > 0 && sortedPeers.every(p => selectedGroup.some(sg => sg.id === p.id));

    const modalContent = (
        <div className="lfm-overlay" style={{ zIndex: 9999 }}>
            <div className="lfm-modal animate-fade-in" style={{ maxWidth: showPeerSelector ? '750px' : '1400px', width: '95%', padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

                {/* ── HEADER ── */}
                <div className="lfm-header" style={{ flexShrink: 0 }}>
                    <h2 className="lfm-header__title">
                        <Users size={16} />
                        {showPeerSelector ? 'Group Observation Setup' : `Active Group Session: ${selectedGroup.length} Learners`}
                    </h2>

                    {!showPeerSelector && (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="lfm-btn lfm-btn--ghost" style={{ fontSize: '0.7rem', padding: '4px 8px', color: '#b91c1c' }} onClick={onDisband}>
                                <Trash2 size={12} /> Disband Group
                            </button>
                            <button className="lfm-btn lfm-btn--ghost" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => setShowPeerSelector(true)}>
                                <UserPlus size={12} /> Add/Remove Peers
                            </button>
                        </div>
                    )}

                    <button className="lfm-close-btn" type="button" onClick={onCancel} disabled={isSaving} title="Minimize to Dashboard">
                        <X size={20} />
                    </button>
                </div>

                {/* ── STEP 1: PEER SELECTOR ── */}
                {showPeerSelector && (
                    <>
                        <div className="lfm-body" style={{ overflowY: 'auto' }}>
                            <div className="lfm-section-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span><UserPlus size={14} /> Select Participating Peers</span>
                                {sortedPeers.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleSelectAllPeers}
                                        style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.7rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#334155', fontWeight: 'bold' }}
                                    >
                                        <ListChecks size={12} /> {allPeersSelected ? 'Deselect All' : 'Select All Cohort'}
                                    </button>
                                )}
                            </div>

                            <div style={{ background: '#f8fafc', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '6px' }}>
                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)', lineHeight: 1.5 }}>
                                    Who else is working with <strong>{currentLearner.name}</strong> on this task today? Select the active group members below to grade them simultaneously.
                                </p>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    {sortedPeers.length === 0 && (
                                        <span style={{ fontSize: '0.85rem', color: 'var(--mlab-red)', fontStyle: 'italic', background: '#fef2f2', padding: '10px', borderRadius: '4px', border: '1px solid #fecaca', width: '100%' }}>
                                            <AlertCircle size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                                            No other learners are currently active or eligible for this assessment in this cohort.
                                        </span>
                                    )}
                                    {sortedPeers.map((peer) => {
                                        const isSelected = selectedGroup.some((p) => p.id === peer.id);
                                        return (
                                            <button
                                                key={peer.id}
                                                type="button"
                                                onClick={() => togglePeer(peer)}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '8px 16px',
                                                    borderRadius: '20px',
                                                    border: `2px solid ${isSelected ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`,
                                                    background: isSelected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)',
                                                    color: isSelected ? 'var(--mlab-blue)' : 'var(--mlab-grey)',
                                                    fontFamily: 'var(--font-heading)',
                                                    fontSize: '0.75rem',
                                                    fontWeight: isSelected ? 700 : 500,
                                                    letterSpacing: '0.05em',
                                                    textTransform: 'uppercase',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {isSelected ? <CheckCircle2 size={14} color="var(--mlab-blue)" /> : <UserPlus size={14} />}
                                                {peer.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="lfm-footer" style={{ flexShrink: 0 }}>
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={isGroupSessionActive ? () => setShowPeerSelector(false) : onCancel}>
                                {isGroupSessionActive ? 'Cancel Changes' : 'Cancel'}
                            </button>
                            <button
                                type="button"
                                className="lfm-btn lfm-btn--primary"
                                onClick={handleContinueToMatrix}
                            >
                                Continue to Matrix ({selectedGroup.length} Learners) <ArrowLeft size={14} style={{ transform: 'rotate(180deg)', marginLeft: '4px' }} />
                            </button>
                        </div>
                    </>
                )}

                {/* ── STEP 2: THE MATRIX ── */}
                {!showPeerSelector && (
                    <>
                        <div style={{ padding: '1rem 1.5rem', background: 'var(--mlab-white)', borderBottom: '1px solid var(--mlab-border)', flexShrink: 0 }}>
                            <div className="lfm-error-banner" style={{ background: '#e0f2fe', borderColor: '#bae6fd', color: '#0369a1', margin: 0, padding: '10px 14px', borderRadius: '6px' }}>
                                <Info size={18} color="#0ea5e9" style={{ flexShrink: 0 }} />
                                <span><strong>Group Mode Active:</strong> You can minimize this window to review the portfolio without losing your timers. Saving applies marks to <strong>all {selectedGroup.length} learners</strong> simultaneously.</span>
                            </div>
                        </div>

                        {/* 🚀 STICKY MATRIX CONTAINER */}
                        <div style={{ overflow: 'auto', flex: 1, background: 'var(--mlab-bg)' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, background: 'var(--mlab-white)', minWidth: '800px' }}>
                                <thead>
                                    <tr>
                                        {/* Sticky Header + Sticky First Column */}
                                        <th className="sticky-col" style={{ position: 'sticky', top: 0, left: 0, zIndex: 20, background: 'var(--mlab-blue)', color: 'var(--mlab-white)', padding: '14px 16px', textAlign: 'left', fontFamily: 'var(--font-heading)', fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase', minWidth: '350px', borderBottom: '2px solid #1e3a8a' }}>
                                            Observation Criteria & Timers
                                        </th>

                                        {/* Sticky Learner Headers */}
                                        {selectedGroup.map((learner) => (
                                            <th key={learner.id} style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--mlab-blue)', padding: '12px 10px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.2)', borderBottom: '2px solid #1e3a8a', minWidth: '220px' }}>
                                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px', color: learner.id === currentLearner.id ? '#4ade80' : 'var(--mlab-white)' }}>
                                                    {learner.name} {learner.id === currentLearner.id && <span style={{ fontSize: '0.65rem', background: '#22c55e', color: 'white', padding: '2px 6px', borderRadius: '4px', verticalAlign: 'middle', marginLeft: '6px' }}>CURRENT</span>}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleColumnCheckAll(learner.id, true)}
                                                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--mlab-white)', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'background 0.2s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                                >
                                                    Verify Entire Column
                                                </button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {criteria.map((criterion, index) => {
                                        const startedCount = selectedGroup.filter(l => groupTimeMatrix[criterion.id]?.[l.id]?.startTime).length;
                                        const runningCount = selectedGroup.filter(l => groupTimeMatrix[criterion.id]?.[l.id]?.startTime && !groupTimeMatrix[criterion.id]?.[l.id]?.endTime).length;
                                        const isRowRunning = runningCount > 0;
                                        const isRowFinished = startedCount > 0 && runningCount === 0;

                                        return (
                                            <tr key={criterion.id} style={{ transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>

                                                {/* Sticky First Column for Content */}
                                                <td className="sticky-col" style={{ padding: '16px', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-body)', verticalAlign: 'top', background: 'white', borderBottom: '1px solid var(--mlab-border)' }}>
                                                    <div style={{ marginBottom: '10px', lineHeight: '1.4' }}>
                                                        <span style={{ fontWeight: 700, marginRight: '8px', color: '#0284c7' }}>{index + 1}.</span>
                                                        {criterion.description}
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRowCheckAll(criterion.id, true)}
                                                            style={{ background: '#e0f2fe', border: '1px solid #bae6fd', color: '#0284c7', fontSize: '0.65rem', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                                        >
                                                            Verify Row
                                                        </button>

                                                        {criterion.type === 'checklist' && (
                                                            <>
                                                                {isRowRunning ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleStopRowTimers(criterion.id)}
                                                                        style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: '0.65rem', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                                                    >
                                                                        <Square size={12} fill="#dc2626" /> Stop Row Timer
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleStartRowTimers(criterion.id)}
                                                                        style={{
                                                                            background: isRowFinished ? '#fffbeb' : '#f0fdf4',
                                                                            border: isRowFinished ? '1px solid #fde68a' : '1px solid #bbf7d0',
                                                                            color: isRowFinished ? '#d97706' : '#16a34a',
                                                                            fontSize: '0.65rem', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em'
                                                                        }}
                                                                    >
                                                                        <Play size={12} fill={isRowFinished ? "#d97706" : "#16a34a"} />
                                                                        {isRowFinished ? 'Restart Row Timer' : 'Start Row Timer'}
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Scrollable Learner Cells */}
                                                {selectedGroup.map((learner) => {
                                                    const isChecked = matrix[criterion.id]?.[learner.id] || false;
                                                    const timeRecord = groupTimeMatrix[criterion.id]?.[learner.id];
                                                    const isTimerRunning = !!(timeRecord?.startTime && !timeRecord.endTime);

                                                    const durationData = getLiveDurationText(timeRecord?.startTime, timeRecord?.endTime);

                                                    return (
                                                        <td key={`${criterion.id}-${learner.id}`} style={{ padding: '14px 10px', borderLeft: '1px solid var(--mlab-border)', borderBottom: '1px solid var(--mlab-border)', verticalAlign: 'middle', background: isChecked ? 'rgba(148, 199, 61, 0.04)' : 'transparent' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>

                                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: isChecked ? '#e8f5e9' : '#f1f5f9', padding: '6px 12px', borderRadius: '4px', border: isChecked ? '1px solid #a5d6a7' : '1px solid #cbd5e1', transition: 'all 0.2s' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={(e) => handleCellToggle(criterion.id, learner.id, e.target.checked)}
                                                                        style={{ accentColor: 'var(--mlab-green)', width: '18px', height: '18px', cursor: 'pointer' }}
                                                                    />
                                                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isChecked ? '#2e7d32' : '#64748b' }}>
                                                                        {isChecked ? 'VERIFIED' : 'UNMARKED'}
                                                                    </span>
                                                                </label>

                                                                {criterion.type === 'checklist' && (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '100%', background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)' }}>

                                                                        {/* Live Action Toggles */}
                                                                        <div style={{ display: 'flex', justifyContent: 'center', minHeight: '26px' }}>
                                                                            {!timeRecord?.startTime && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleStartCellTimer(criterion.id, learner.id)}
                                                                                    style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#475569', fontSize: '0.7rem', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'background 0.2s' }}
                                                                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                                                    onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                                                                                >
                                                                                    <Play size={10} /> Start
                                                                                </button>
                                                                            )}

                                                                            {isTimerRunning && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleStopCellTimer(criterion.id, learner.id)}
                                                                                    className="live-timer-pulse"
                                                                                    style={{ background: '#ef4444', border: '1px solid #dc2626', color: 'white', fontSize: '0.75rem', fontWeight: 'bold', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)' }}
                                                                                >
                                                                                    <Square size={10} fill="white" /> {durationData.text}
                                                                                </button>
                                                                            )}

                                                                            {timeRecord?.startTime && timeRecord?.endTime && (
                                                                                <div
                                                                                    style={{ fontSize: '0.75rem', color: durationData.isNegative ? '#b91c1c' : '#059669', background: durationData.isNegative ? '#fef2f2' : '#f0fdf4', border: durationData.isNegative ? '1px solid #fecaca' : '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}
                                                                                >
                                                                                    {durationData.isNegative ? <AlertCircle size={12} /> : <Timer size={12} />}
                                                                                    {durationData.text}
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {/* Manual Input Fields */}
                                                                        {(timeRecord?.startTime || isChecked) && (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                                                                                <input
                                                                                    type="time"
                                                                                    className='datetime-input'
                                                                                    step="1"
                                                                                    title="Start Time"
                                                                                    value={formatTimeForInput(timeRecord?.startTime)}
                                                                                    onChange={(e) => handleManualTimeChange(criterion.id, learner.id, 'startTime', e.target.value)}
                                                                                    style={{ fontSize: '0.7rem', padding: '3px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', width: '75px', textAlign: 'center', color: '#334155' }}
                                                                                />
                                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>-</span>
                                                                                <input
                                                                                    type="time"
                                                                                    className='datetime-input'
                                                                                    step="1"
                                                                                    title="End Time"
                                                                                    value={formatTimeForInput(timeRecord?.endTime)}
                                                                                    onChange={(e) => handleManualTimeChange(criterion.id, learner.id, 'endTime', e.target.value)}
                                                                                    style={{ fontSize: '0.7rem', padding: '3px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', width: '75px', textAlign: 'center', color: '#334155' }}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* ── Group Remarks ── */}
                        <div style={{ padding: '1.5rem', background: 'var(--mlab-white)', borderTop: '1px solid var(--mlab-border)', flexShrink: 0 }}>
                            <label style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                Overall Group Remarks (Required) <span style={{ color: 'var(--mlab-red)' }}>*</span>
                            </label>
                            <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', margin: '0 0 10px 0' }}>
                                Provide an overall comment on the group's performance. This exact text will be copied to all selected learners' portfolios.
                            </p>
                            <textarea
                                className="lfm-input"
                                rows={3}
                                placeholder="E.g., The team successfully dismantled and reassembled the engine block with zero safety violations. Excellent communication demonstrated..."
                                value={groupRemarks}
                                onChange={(e) => setGroupRemarks(e.target.value)}
                                style={{ width: '100%', resize: 'vertical' }}
                            />
                        </div>

                    </>
                )}

                <div className="lfm-footer" style={{ flexShrink: 0 }}>
                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowPeerSelector(true)} disabled={isSaving}>
                        <ArrowLeft size={14} /> Back to Selection
                    </button>
                    <button type="button" className="lfm-btn lfm-btn--primary" onClick={handleSave} disabled={isSaving || !groupRemarks.trim()}>
                        {isSaving ? <><Loader2 size={14} className="lfm-spin" /> Committing Grades...</> : <><Save size={14} /> Submit Group Observation</>}
                    </button>
                </div>

            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};