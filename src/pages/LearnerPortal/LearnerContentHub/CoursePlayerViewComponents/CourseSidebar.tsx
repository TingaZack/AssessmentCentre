// src/pages/LearnerPortal/LearnerContentHub/CourseSidebar.tsx

import React, { useState } from 'react';
import moment from 'moment';
import {
    ChevronDown, Lock, CheckCircle2, Sparkles,
    Award, Bookmark, Pause, Loader2,
    Zap
} from 'lucide-react';
import { ProgressBar } from '../types';
import Tooltip from '../../../../components/common/Tooltip/Tooltip';

// --- TYPES ---
export interface CourseSidebarProps {
    selectedCourse: any;
    nestedSyllabus: any[];
    currentActiveUnit: any;
    onSelectUnit: (unit: any) => void;
    onSelectSyntheticUnit: (title: string, checkpoint: any) => void;
    completedCount: number;
    dynamicCompletedCount: number;
    totalCount: number;
    unlockedUnitIds: Set<string>;
    isCourseComplete: boolean;
    learnerCertificate: any | null;
    isSearchingCert: boolean;
    onOpenCertificate: () => void;
}

// --- HELPER FUNCTIONS ---
const getUnitLinkedAssessmentId = (unit?: any): string | null => {
    if (!unit) return null;
    const candidates = [
        unit.linkedAssessmentId,
        unit.assessmentId,
        unit.formalAssessmentId,
        unit.linkedAssessment,
        unit.assessment,
        unit.examId,
        unit.linkedExamId,
        unit.checkpointMetadata?.linkedAssessmentId,
        unit.checkpointMetadata?.assessmentId
    ];

    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
        if (candidate && typeof candidate === 'object' && candidate !== null && candidate.id) {
            return String(candidate.id).trim();
        }
    }
    return null;
};

const getAssessmentMeta = (course?: any, unit?: any) => {
    const framework = String(
        course?.framework || course?.type || unit?.framework || unit?.assessmentFramework || ''
    ).toLowerCase();

    if (framework.includes('secam') || framework.includes('seta') || framework.includes('qcto')) {
        return { title: 'Formal SETA / QCTO Exam', shortTitle: 'SETA / QCTO Exam', badge: 'Official' };
    }
    if (framework.includes('codetribe') || framework.includes('bootcamp')) {
        return { title: 'CodeTribe Formal Assessment', shortTitle: 'CodeTribe Assessment', badge: 'CodeTribe' };
    }
    return { title: 'Formal Assessment', shortTitle: 'Formal Assessment', badge: 'Official' };
};

export const CourseSidebar: React.FC<CourseSidebarProps> = ({
    selectedCourse,
    nestedSyllabus,
    currentActiveUnit,
    onSelectUnit,
    onSelectSyntheticUnit,
    completedCount,
    dynamicCompletedCount,
    totalCount,
    unlockedUnitIds,
    isCourseComplete,
    learnerCertificate,
    isSearchingCert,
    onOpenCertificate
}) => {
    const [expandedMainGroups, setExpandedMainGroups] = useState<Record<string, boolean>>({});
    const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});

    return (
        <div className="lch-sidebar-sticky">
            <div className="qcto-card">
                <div className="qcto-hdr" style={{ fontSize: '0.75rem', borderBottom: '3px solid var(--mlab-green)' }}>
                    {selectedCourse.title}
                </div>
                <div style={{ padding: '14px' }}>
                    {(selectedCourse.startDate || selectedCourse.endDate) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '6px 8px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.7rem' }}>
                            <span style={{ fontWeight: 700, color: '#475569' }}>
                                📅 Timeline: {selectedCourse.startDate ? moment(selectedCourse.startDate).format('DD MMM YY') : 'Start'} → {selectedCourse.endDate ? moment(selectedCourse.endDate).format('DD MMM YY') : 'End'}
                            </span>
                            <span style={{ fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
                                {(selectedCourse.pacingModel || 'individual_self_paced') === 'individual_self_paced' ? 'Self-Paced' : 'Scheduled'}
                            </span>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                        <span>Course Progress</span>
                        <span>{completedCount} OF {totalCount} LESSONS</span>
                    </div>
                    <ProgressBar
                        completed={dynamicCompletedCount}
                        total={totalCount}
                    />

                    {isCourseComplete && (
                        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--mlab-border)' }}>
                            {learnerCertificate ? (
                                <button
                                    type="button"
                                    onClick={onOpenCertificate}
                                    className="lfm-btn lfm-btn--green"
                                    style={{ width: '100%', borderRadius: '0px', padding: '6px 12px', fontSize: '0.75rem' }}
                                >
                                    <Award size={14} /> View Certificate
                                </button>
                            ) : isSearchingCert ? (
                                <div style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Loader2 size={12} className="lfm-spin" /> Verifying certificate records...
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            {nestedSyllabus.map((mainGroup, mainIdx) => {
                const hasSelectedUnitMain = mainGroup.subGroups.some((sg: any) => sg.units.some((u: any) => u.id === currentActiveUnit.id) || (sg.dayCheckpoint && `synthetic_${sg.title}` === currentActiveUnit.id));
                const isMainOpen = expandedMainGroups[mainGroup.title] !== undefined ? expandedMainGroups[mainGroup.title] : hasSelectedUnitMain;

                return (
                    <div key={mainGroup.title} className="qcto-card" style={{ marginBottom: '12px' }}>
                        <button
                            type="button"
                            onClick={() => setExpandedMainGroups(prev => ({ ...prev, [mainGroup.title]: !isMainOpen }))}
                            style={{
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 14px',
                                background: hasSelectedUnitMain ? 'var(--mlab-blue)' : 'var(--mlab-light-blue)',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                borderBottom: isMainOpen && !hasSelectedUnitMain ? '2px solid var(--mlab-border)' : '2px solid var(--mlab-green)',
                                borderRadius: '0px',
                                outline: 'none'
                            }}
                        >
                            <div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: hasSelectedUnitMain ? '#bae6fd' : 'var(--mlab-blue)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                    MODULE {String(mainIdx + 1).padStart(2, '0')}
                                </div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: hasSelectedUnitMain ? 'white' : 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                    {mainGroup.title}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.68rem', color: hasSelectedUnitMain ? '#bae6fd' : '#64748b', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                                    {mainGroup.completedUnits}/{mainGroup.totalUnits}
                                </span>
                                <ChevronDown size={14} color={hasSelectedUnitMain ? "white" : "var(--mlab-blue)"} style={{ transform: isMainOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                            </div>
                        </button>

                        {isMainOpen && (
                            <div style={{ background: '#f8fafc', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {mainGroup.subGroups.map((subGroup: any) => {
                                    const subKey = `${mainGroup.title}__${subGroup.title}`;
                                    const hasSelectedUnitSub = subGroup.units.some((u: any) => u.id === currentActiveUnit.id) || (subGroup.dayCheckpoint && `synthetic_${subGroup.title}` === currentActiveUnit.id);
                                    const isSubOpen = expandedSubGroups[subKey] !== undefined ? expandedSubGroups[subKey] : hasSelectedUnitSub;
                                    const subDone = subGroup.units.filter((u: any) => u.isCompleted).length;

                                    return (
                                        <div key={subKey} style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', borderRadius: '0px' }}>

                                            <button
                                                type="button"
                                                onClick={() => setExpandedSubGroups(prev => ({ ...prev, [subKey]: !isSubOpen }))}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '8px 12px',
                                                    background: hasSelectedUnitSub ? '#f0f9ff' : 'transparent',
                                                    border: 'none',
                                                    borderLeft: `3px solid ${hasSelectedUnitSub ? '#0284c7' : 'var(--mlab-blue)'}`,
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    borderBottom: isSubOpen && !hasSelectedUnitSub ? '1px solid var(--mlab-border)' : 'none',
                                                    borderRadius: '0px',
                                                    outline: 'none'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Bookmark size={12} color={hasSelectedUnitSub ? '#0284c7' : 'var(--mlab-blue)'} />
                                                    <span style={{ fontWeight: 700, fontSize: '0.75rem', color: hasSelectedUnitSub ? '#0284c7' : '#334155', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                        {subGroup.title}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
                                                        {subDone}/{subGroup.units.length}
                                                    </span>
                                                    <ChevronDown size={14} color="#64748b" style={{ transform: isSubOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                                                </div>
                                            </button>

                                            {isSubOpen && (
                                                <div>
                                                    {subGroup.units.map((u: any) => {
                                                        const isCurrent = u.id === currentActiveUnit.id;
                                                        const isClickable = isCurrent || unlockedUnitIds.has(u.id);
                                                        const unitAssessment = getUnitLinkedAssessmentId(u);
                                                        const unitMeta = getAssessmentMeta(selectedCourse, u);

                                                        return (
                                                            <div
                                                                key={u.id}
                                                                onClick={() => { if (isClickable) onSelectUnit(u); }}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    gap: '8px',
                                                                    padding: '10px 12px',
                                                                    cursor: isClickable ? 'pointer' : 'not-allowed',
                                                                    background: isCurrent ? 'var(--mlab-light-blue)' : 'white',
                                                                    borderBottom: '1px solid #f1f5f9',
                                                                    borderLeft: isCurrent ? '3px solid var(--mlab-blue)' : '3px solid transparent'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, opacity: isClickable ? 1 : 0.5 }}>
                                                                    {u.isCompleted ? (
                                                                        <CheckCircle2 size={14} color="#15803d" style={{ flexShrink: 0 }} />
                                                                    ) : !isClickable ? (
                                                                        <Lock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
                                                                    ) : isCurrent ? (
                                                                        <Pause size={12} color="var(--mlab-blue)" style={{ flexShrink: 0 }} />
                                                                    ) : (
                                                                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #cbd5e1', flexShrink: 0 }} />
                                                                    )}

                                                                    <span style={{
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: isCurrent ? 800 : 600,
                                                                        color: !isClickable ? '#94a3b8' : (isCurrent ? 'var(--mlab-blue)' : '#334155'),
                                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                                    }}>
                                                                        {u.title}
                                                                    </span>

                                                                    {/* BADGE 1: Knowledge Check / Interactive Quiz */}
                                                                    {u.interactiveCheck?.checkType && u.interactiveCheck.checkType !== 'none' && (
                                                                        <span style={{
                                                                            fontSize: '0.58rem',
                                                                            fontWeight: 800,
                                                                            background: '#fef3c7',
                                                                            color: '#b45309',
                                                                            border: '1px solid #fde68a',
                                                                            padding: '1px 5px',
                                                                            borderRadius: '2px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '2px',
                                                                            fontFamily: 'var(--font-heading)',
                                                                            textTransform: 'uppercase',
                                                                            flexShrink: 0
                                                                        }} title="Includes Stage 2 Knowledge Check">
                                                                            <Zap size={9} fill="#b45309" /> Quiz
                                                                        </span>
                                                                    )}

                                                                    {/* BADGE 2: Formal Assessment */}
                                                                    {Boolean(unitAssessment) && (
                                                                        <Tooltip content={`Includes ${unitMeta.title}`} placement="top">
                                                                            <span style={{
                                                                                fontSize: '0.58rem',
                                                                                fontWeight: 800,
                                                                                background: '#f3e8ff',
                                                                                color: '#6b21a8',
                                                                                border: '1px solid #e9d5ff',
                                                                                padding: '1px 5px',
                                                                                borderRadius: '2px',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '2px',
                                                                                fontFamily: 'var(--font-heading)',
                                                                                textTransform: 'uppercase',
                                                                                flexShrink: 0
                                                                            }}>
                                                                                <Award size={9} /> {unitMeta.badge}
                                                                            </span>
                                                                        </Tooltip>
                                                                    )}
                                                                </div>
                                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', flexShrink: 0, fontFamily: 'monospace' }}>
                                                                    {u.estimatedMinutes}m
                                                                </span>
                                                            </div>
                                                        );
                                                    })}

                                                    {subGroup.dayCheckpoint && (
                                                        <div
                                                            onClick={() => {
                                                                if (subGroup.isDayComplete && subGroup.dayCheckpoint) {
                                                                    onSelectSyntheticUnit(`${subGroup.title} Assessment`, subGroup.dayCheckpoint);
                                                                }
                                                            }}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: '8px',
                                                                padding: '10px 12px',
                                                                cursor: subGroup.isDayComplete ? 'pointer' : 'not-allowed',
                                                                background: currentActiveUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '#fffbeb' : '#fafafa',
                                                                borderBottom: '1px solid #f1f5f9',
                                                                borderLeft: currentActiveUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '3px solid #f59e0b' : '3px solid transparent'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, opacity: subGroup.isDayComplete ? 1 : 0.5 }}>
                                                                {subGroup.isDayComplete ? (
                                                                    <Sparkles size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                                                                ) : (
                                                                    <Lock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
                                                                )}
                                                                <span style={{
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 800,
                                                                    color: subGroup.isDayComplete ? '#92400e' : '#94a3b8',
                                                                    fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                                                                }}>
                                                                    Topic Assessment
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {mainGroup.sprintCheckpoint && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (mainGroup.isComplete && mainGroup.sprintCheckpoint) {
                                                onSelectSyntheticUnit(`${mainGroup.title} Capstone`, mainGroup.sprintCheckpoint);
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            padding: '12px 14px',
                                            cursor: mainGroup.isComplete ? 'pointer' : 'not-allowed',
                                            background: currentActiveUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '#f3e8ff' : '#ffffff',
                                            border: '1px solid var(--mlab-border)',
                                            borderLeft: currentActiveUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '4px solid #9333ea' : '1px solid var(--mlab-border)',
                                            borderRadius: '0px',
                                            outline: 'none',
                                            opacity: mainGroup.isComplete ? 1 : 0.6
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                            {mainGroup.isComplete ? (
                                                <Award size={16} color="#9333ea" style={{ flexShrink: 0 }} />
                                            ) : (
                                                <Lock size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                                            )}
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 900,
                                                color: mainGroup.isComplete ? '#6b21a8' : '#94a3b8',
                                                fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                                            }}>
                                                Module Capstone Gate
                                            </span>
                                        </div>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};


// // src/pages/LearnerPortal/LearnerContentHub/CourseSidebar.tsx

// import React, { useState } from 'react';
// import moment from 'moment';
// import { 
//     ChevronDown, Lock, CheckCircle2, Sparkles, 
//     Award, Bookmark, Pause, Loader2, 
//     Zap
// } from 'lucide-react';
// import { ProgressBar } from '../types';

// // --- TYPES ---
// export interface CourseSidebarProps {
//     selectedCourse: any;
//     nestedSyllabus: any[];
//     currentActiveUnit: any;
//     onSelectUnit: (unit: any) => void;
//     onSelectSyntheticUnit: (title: string, checkpoint: any) => void;
//     completedCount: number;
//     dynamicCompletedCount: number;
//     totalCount: number;
//     unlockedUnitIds: Set<string>;
//     isCourseComplete: boolean;
//     learnerCertificate: any | null;
//     isSearchingCert: boolean;
//     onOpenCertificate: () => void;
// }

// // --- HELPER FUNCTIONS ---
// const getUnitLinkedAssessmentId = (unit?: any): string | null => {
//     if (!unit) return null;
//     const candidates = [
//         unit.linkedAssessmentId,
//         unit.assessmentId,
//         unit.formalAssessmentId,
//         unit.linkedAssessment,
//         unit.assessment,
//         unit.examId,
//         unit.linkedExamId,
//         unit.checkpointMetadata?.linkedAssessmentId,
//         unit.checkpointMetadata?.assessmentId
//     ];

//     for (const candidate of candidates) {
//         if (candidate && typeof candidate === 'string' && candidate.trim().length > 0) {
//             return candidate.trim();
//         }
//         if (candidate && typeof candidate === 'object' && candidate !== null && candidate.id) {
//             return String(candidate.id).trim();
//         }
//     }
//     return null;
// };

// const getAssessmentMeta = (course?: any, unit?: any) => {
//     const framework = String(
//         course?.framework || course?.type || unit?.framework || unit?.assessmentFramework || ''
//     ).toLowerCase();

//     if (framework.includes('secam') || framework.includes('seta') || framework.includes('qcto')) {
//         return { shortTitle: 'SETA / QCTO Exam', badge: 'Official' };
//     }
//     if (framework.includes('codetribe') || framework.includes('bootcamp')) {
//         return { shortTitle: 'CodeTribe Assessment', badge: 'CodeTribe' };
//     }
//     return { shortTitle: 'Formal Assessment', badge: 'Official' };
// };

// export const CourseSidebar: React.FC<CourseSidebarProps> = ({
//     selectedCourse,
//     nestedSyllabus,
//     currentActiveUnit,
//     onSelectUnit,
//     onSelectSyntheticUnit,
//     completedCount,
//     dynamicCompletedCount,
//     totalCount,
//     unlockedUnitIds,
//     isCourseComplete,
//     learnerCertificate,
//     isSearchingCert,
//     onOpenCertificate
// }) => {
//     const [expandedMainGroups, setExpandedMainGroups] = useState<Record<string, boolean>>({});
//     const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});

//     return (
//         <div className="lch-sidebar-sticky">
//             <div className="qcto-card">
//                 <div className="qcto-hdr" style={{ fontSize: '0.75rem', borderBottom: '3px solid var(--mlab-green)' }}>
//                     {selectedCourse.title}
//                 </div>
//                 <div style={{ padding: '14px' }}>
//                     {(selectedCourse.startDate || selectedCourse.endDate) && (
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '6px 8px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.7rem' }}>
//                             <span style={{ fontWeight: 700, color: '#475569' }}>
//                                 📅 Timeline: {selectedCourse.startDate ? moment(selectedCourse.startDate).format('DD MMM YY') : 'Start'} → {selectedCourse.endDate ? moment(selectedCourse.endDate).format('DD MMM YY') : 'End'}
//                             </span>
//                             <span style={{ fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
//                                 {(selectedCourse.pacingModel || 'individual_self_paced') === 'individual_self_paced' ? 'Self-Paced' : 'Scheduled'}
//                             </span>
//                         </div>
//                     )}

//                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                         <span>Course Progress</span>
//                         <span>{completedCount} OF {totalCount} LESSONS</span>
//                     </div>
//                     <ProgressBar
//                         completed={dynamicCompletedCount}
//                         total={totalCount}
//                     />

//                     {isCourseComplete && (
//                         <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--mlab-border)' }}>
//                             {learnerCertificate ? (
//                                 <button
//                                     type="button"
//                                     onClick={onOpenCertificate}
//                                     className="lfm-btn lfm-btn--green"
//                                     style={{ width: '100%', borderRadius: '0px', padding: '6px 12px', fontSize: '0.75rem' }}
//                                 >
//                                     <Award size={14} /> View Certificate
//                                 </button>
//                             ) : isSearchingCert ? (
//                                 <div style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                     <Loader2 size={12} className="lfm-spin" /> Verifying certificate records...
//                                 </div>
//                             ) : null}
//                         </div>
//                     )}
//                 </div>
//             </div>

//             {nestedSyllabus.map((mainGroup, mainIdx) => {
//                 const hasSelectedUnitMain = mainGroup.subGroups.some((sg: any) => sg.units.some((u: any) => u.id === currentActiveUnit.id) || (sg.dayCheckpoint && `synthetic_${sg.title}` === currentActiveUnit.id));
//                 const isMainOpen = expandedMainGroups[mainGroup.title] !== undefined ? expandedMainGroups[mainGroup.title] : hasSelectedUnitMain;

//                 return (
//                     <div key={mainGroup.title} className="qcto-card" style={{ marginBottom: '12px' }}>
//                         <button
//                             type="button"
//                             onClick={() => setExpandedMainGroups(prev => ({ ...prev, [mainGroup.title]: !isMainOpen }))}
//                             style={{
//                                 width: '100%',
//                                 display: 'flex',
//                                 justifyContent: 'space-between',
//                                 alignItems: 'center',
//                                 padding: '12px 14px',
//                                 background: hasSelectedUnitMain ? 'var(--mlab-blue)' : 'var(--mlab-light-blue)',
//                                 border: 'none',
//                                 cursor: 'pointer',
//                                 textAlign: 'left',
//                                 borderBottom: isMainOpen && !hasSelectedUnitMain ? '2px solid var(--mlab-border)' : '2px solid var(--mlab-green)',
//                                 borderRadius: '0px',
//                                 outline: 'none'
//                             }}
//                         >
//                             <div>
//                                 <div style={{ fontSize: '0.62rem', fontWeight: 800, color: hasSelectedUnitMain ? '#bae6fd' : 'var(--mlab-blue)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                     MODULE {String(mainIdx + 1).padStart(2, '0')}
//                                 </div>
//                                 <div style={{ fontSize: '0.82rem', fontWeight: 800, color: hasSelectedUnitMain ? 'white' : 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                     {mainGroup.title}
//                                 </div>
//                             </div>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 <span style={{ fontSize: '0.68rem', color: hasSelectedUnitMain ? '#bae6fd' : '#64748b', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
//                                     {mainGroup.completedUnits}/{mainGroup.totalUnits}
//                                 </span>
//                                 <ChevronDown size={14} color={hasSelectedUnitMain ? "white" : "var(--mlab-blue)"} style={{ transform: isMainOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
//                             </div>
//                         </button>

//                         {isMainOpen && (
//                             <div style={{ background: '#f8fafc', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                 {mainGroup.subGroups.map((subGroup: any) => {
//                                     const subKey = `${mainGroup.title}__${subGroup.title}`;
//                                     const hasSelectedUnitSub = subGroup.units.some((u: any) => u.id === currentActiveUnit.id) || (subGroup.dayCheckpoint && `synthetic_${subGroup.title}` === currentActiveUnit.id);
//                                     const isSubOpen = expandedSubGroups[subKey] !== undefined ? expandedSubGroups[subKey] : hasSelectedUnitSub;
//                                     const subDone = subGroup.units.filter((u: any) => u.isCompleted).length;

//                                     return (
//                                         <div key={subKey} style={{ background: '#ffffff', border: '1px solid var(--mlab-border)', borderRadius: '0px' }}>

//                                             <button
//                                                 type="button"
//                                                 onClick={() => setExpandedSubGroups(prev => ({ ...prev, [subKey]: !isSubOpen }))}
//                                                 style={{
//                                                     width: '100%',
//                                                     display: 'flex',
//                                                     justifyContent: 'space-between',
//                                                     alignItems: 'center',
//                                                     padding: '8px 12px',
//                                                     background: hasSelectedUnitSub ? '#f0f9ff' : 'transparent',
//                                                     border: 'none',
//                                                     borderLeft: `3px solid ${hasSelectedUnitSub ? '#0284c7' : 'var(--mlab-blue)'}`,
//                                                     cursor: 'pointer',
//                                                     textAlign: 'left',
//                                                     borderBottom: isSubOpen && !hasSelectedUnitSub ? '1px solid var(--mlab-border)' : 'none',
//                                                     borderRadius: '0px',
//                                                     outline: 'none'
//                                                 }}
//                                             >
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <Bookmark size={12} color={hasSelectedUnitSub ? '#0284c7' : 'var(--mlab-blue)'} />
//                                                     <span style={{ fontWeight: 700, fontSize: '0.75rem', color: hasSelectedUnitSub ? '#0284c7' : '#334155', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                                         {subGroup.title}
//                                                     </span>
//                                                 </div>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
//                                                         {subDone}/{subGroup.units.length}
//                                                     </span>
//                                                     <ChevronDown size={14} color="#64748b" style={{ transform: isSubOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
//                                                 </div>
//                                             </button>

//                                             {isSubOpen && (
//                                                 <div>
//                                                     {subGroup.units.map((u: any) => {
//                                                         const isCurrent = u.id === currentActiveUnit.id;
//                                                         const isClickable = isCurrent || unlockedUnitIds.has(u.id);
//                                                         const unitAssessment = getUnitLinkedAssessmentId(u);
//                                                         const unitMeta = getAssessmentMeta(selectedCourse, u);

//                                                         return (
//                                                             <div
//                                                                 key={u.id}
//                                                                 onClick={() => { if (isClickable) onSelectUnit(u); }}
//                                                                 style={{
//                                                                     display: 'flex',
//                                                                     alignItems: 'center',
//                                                                     justifyContent: 'space-between',
//                                                                     gap: '8px',
//                                                                     padding: '10px 12px',
//                                                                     cursor: isClickable ? 'pointer' : 'not-allowed',
//                                                                     background: isCurrent ? 'var(--mlab-light-blue)' : 'white',
//                                                                     borderBottom: '1px solid #f1f5f9',
//                                                                     borderLeft: isCurrent ? '3px solid var(--mlab-blue)' : '3px solid transparent'
//                                                                 }}
//                                                             >
//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, opacity: isClickable ? 1 : 0.5 }}>
//                                                                     {u.isCompleted ? (
//                                                                         <CheckCircle2 size={14} color="#15803d" style={{ flexShrink: 0 }} />
//                                                                     ) : !isClickable ? (
//                                                                         <Lock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
//                                                                     ) : isCurrent ? (
//                                                                         <Pause size={12} color="var(--mlab-blue)" style={{ flexShrink: 0 }} />
//                                                                     ) : (
//                                                                         <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #cbd5e1', flexShrink: 0 }} />
//                                                                     )}

//                                                                     <span style={{
//                                                                         fontSize: '0.72rem',
//                                                                         fontWeight: isCurrent ? 800 : 600,
//                                                                         color: !isClickable ? '#94a3b8' : (isCurrent ? 'var(--mlab-blue)' : '#334155'),
//                                                                         overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
//                                                                     }}>
//                                                                         {u.title}
//                                                                     </span>

//                                                                     {/* BADGE 1: Knowledge Check / Interactive Quiz */}
//                                                                     {u.interactiveCheck?.checkType && u.interactiveCheck.checkType !== 'none' && (
//                                                                         <span style={{
//                                                                             fontSize: '0.58rem',
//                                                                             fontWeight: 800,
//                                                                             background: '#fef3c7',
//                                                                             color: '#b45309',
//                                                                             border: '1px solid #fde68a',
//                                                                             padding: '1px 5px',
//                                                                             borderRadius: '2px',
//                                                                             display: 'inline-flex',
//                                                                             alignItems: 'center',
//                                                                             gap: '2px',
//                                                                             fontFamily: 'var(--font-heading)',
//                                                                             textTransform: 'uppercase',
//                                                                             flexShrink: 0
//                                                                         }} title="Includes Stage 2 Knowledge Check">
//                                                                             <Zap size={9} fill="#b45309" /> Quiz
//                                                                         </span>
//                                                                     )}

//                                                                     {/* BADGE 2: Formal Assessment */}
//                                                                     {Boolean(unitAssessment) && (
//                                                                         <span style={{
//                                                                             fontSize: '0.58rem',
//                                                                             fontWeight: 800,
//                                                                             background: '#f3e8ff',
//                                                                             color: '#6b21a8',
//                                                                             border: '1px solid #e9d5ff',
//                                                                             padding: '1px 5px',
//                                                                             borderRadius: '2px',
//                                                                             display: 'inline-flex',
//                                                                             alignItems: 'center',
//                                                                             gap: '2px',
//                                                                             fontFamily: 'var(--font-heading)',
//                                                                             textTransform: 'uppercase',
//                                                                             flexShrink: 0
//                                                                         }} title={`Includes ${unitMeta.title}`}>
//                                                                             <Award size={9} /> {unitMeta.badge}
//                                                                         </span>
//                                                                     )}
//                                                                 </div>
//                                                                 <span style={{ fontSize: '0.65rem', color: '#94a3b8', flexShrink: 0, fontFamily: 'monospace' }}>
//                                                                     {u.estimatedMinutes}m
//                                                                 </span>
//                                                             </div>
//                                                         );
//                                                     })}

//                                                     {subGroup.dayCheckpoint && (
//                                                         <div
//                                                             onClick={() => {
//                                                                 if (subGroup.isDayComplete && subGroup.dayCheckpoint) {
//                                                                     onSelectSyntheticUnit(`${subGroup.title} Assessment`, subGroup.dayCheckpoint);
//                                                                 }
//                                                             }}
//                                                             style={{
//                                                                 display: 'flex',
//                                                                 alignItems: 'center',
//                                                                 justifyContent: 'space-between',
//                                                                 gap: '8px',
//                                                                 padding: '10px 12px',
//                                                                 cursor: subGroup.isDayComplete ? 'pointer' : 'not-allowed',
//                                                                 background: currentActiveUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '#fffbeb' : '#fafafa',
//                                                                 borderBottom: '1px solid #f1f5f9',
//                                                                 borderLeft: currentActiveUnit.id === `synthetic_${subGroup.title.replace(/\s+/g, '_')}` ? '3px solid #f59e0b' : '3px solid transparent'
//                                                             }}
//                                                         >
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, opacity: subGroup.isDayComplete ? 1 : 0.5 }}>
//                                                                 {subGroup.isDayComplete ? (
//                                                                     <Sparkles size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
//                                                                 ) : (
//                                                                     <Lock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
//                                                                 )}
//                                                                 <span style={{
//                                                                     fontSize: '0.72rem',
//                                                                     fontWeight: 800,
//                                                                     color: subGroup.isDayComplete ? '#92400e' : '#94a3b8',
//                                                                     fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
//                                                                 }}>
//                                                                     Topic Assessment
//                                                                 </span>
//                                                             </div>
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             )}
//                                         </div>
//                                     );
//                                 })}

//                                 {mainGroup.sprintCheckpoint && (
//                                     <button
//                                         type="button"
//                                         onClick={() => {
//                                             if (mainGroup.isComplete && mainGroup.sprintCheckpoint) {
//                                                 onSelectSyntheticUnit(`${mainGroup.title} Capstone`, mainGroup.sprintCheckpoint);
//                                             }
//                                         }}
//                                         style={{
//                                             width: '100%',
//                                             display: 'flex',
//                                             alignItems: 'center',
//                                             justifyContent: 'space-between',
//                                             gap: '8px',
//                                             padding: '12px 14px',
//                                             cursor: mainGroup.isComplete ? 'pointer' : 'not-allowed',
//                                             background: currentActiveUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '#f3e8ff' : '#ffffff',
//                                             border: '1px solid var(--mlab-border)',
//                                             borderLeft: currentActiveUnit.id === `synthetic_${mainGroup.title.replace(/\s+/g, '_')}` ? '4px solid #9333ea' : '1px solid var(--mlab-border)',
//                                             borderRadius: '0px',
//                                             outline: 'none',
//                                             opacity: mainGroup.isComplete ? 1 : 0.6
//                                         }}
//                                     >
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
//                                             {mainGroup.isComplete ? (
//                                                 <Award size={16} color="#9333ea" style={{ flexShrink: 0 }} />
//                                             ) : (
//                                                 <Lock size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
//                                             )}
//                                             <span style={{
//                                                 fontSize: '0.75rem',
//                                                 fontWeight: 900,
//                                                 color: mainGroup.isComplete ? '#6b21a8' : '#94a3b8',
//                                                 fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
//                                             }}>
//                                                 Module Capstone Gate
//                                             </span>
//                                         </div>
//                                     </button>
//                                 )}
//                             </div>
//                         )}
//                     </div>
//                 );
//             })}
//         </div>
//     );
// };