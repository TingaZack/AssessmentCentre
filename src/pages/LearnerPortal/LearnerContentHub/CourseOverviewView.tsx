// src/pages/LearnerPortal/LearnerContentHub/CourseOverviewView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import moment from 'moment';
import {
    ArrowLeft, Play, Sparkles, Clock, CheckCircle2, ChevronDown, Check,
    Layers, BarChart3, Users, Calendar, Award, Zap, GraduationCap,
    Bookmark, Lock, X, ExternalLink, PartyPopper, Download, Loader2
} from 'lucide-react';
import {
    CourseIllustrationGraphic, ProgressBar, getThemeStyles,
    type CoursePackage,
    type LearnerUnitProgress
} from './types';
import { QuillHTMLViewer } from '../../../components/common/QuillHTMLViewer/QuillHTMLViewer';
import Tooltip from '../../../components/common/Tooltip/Tooltip';

import { auth, db } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';

interface CertificateData {
    id?: string;
    courseName?: string;
    pdfUrl: string;
    [key: string]: unknown;
}

interface CertificateModalProps {
    certificate: CertificateData;
    onClose: () => void;
}

interface ExtendedCoursePackage extends CoursePackage {
    allowedProgressKeys?: string[];
    secamStructure?: Array<{
        title?: string;
        days?: Array<{ title?: string;[key: string]: unknown }>;
        [key: string]: unknown;
    }>;
    checkpointMetadata?: {
        secamStructure?: Array<{
            title?: string;
            days?: Array<{ title?: string;[key: string]: unknown }>;
            [key: string]: unknown;
        }>;
        previewVideoUrl?: string;
        materialIncludes?: string[];
        pacingScheduleBreakdown?: Array<{ moduleOrSprintTitle?: string; title?: string; targetDate?: string; targetHours?: number }>;
        [key: string]: unknown;
    };
    timelineStartDate?: string;
    runStartDate?: string;
    timelineEndDate?: string;
    runEndDate?: string;
    pacingScheduleBreakdown?: Array<{ moduleOrSprintTitle?: string; title?: string; targetDate?: string; targetHours?: number }>;
    [key: string]: unknown;
}

interface ExtendedLearnerUnitProgress extends LearnerUnitProgress {
    progressPercent?: number;
    watchPercentage?: number;
    [key: string]: unknown;
}

interface DirectTimelineData {
    timeBoundConfig?: {
        startDate?: string;
        endDate?: string;
        isTimeBound?: boolean;
    };
    startDate?: string;
    endDate?: string;
    applicationStartDate?: string;
    applicationEndDate?: string;
    pacingScheduleBreakdown?: Array<{ moduleOrSprintTitle?: string; title?: string; targetDate?: string; targetHours?: number }>;
    checkpointMetadata?: {
        pacingScheduleBreakdown?: Array<{ moduleOrSprintTitle?: string; title?: string; targetDate?: string; targetHours?: number }>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface CourseOverviewViewProps {
    selectedCourse: CoursePackage;
    courseUnits: LearnerUnitProgress[];
    groupedSyllabus: Record<string, LearnerUnitProgress[]>;
    minutesToNextMilestone: number;
    onBackToCatalog: () => void;
    onStartOrResume: () => void;
    onSelectUnit: (unit: LearnerUnitProgress) => void;
}

const getCourseInstanceId = (c?: CoursePackage | ExtendedCoursePackage | null) => {
    if (!c) return '';
    const ext = c as ExtendedCoursePackage;
    return ext.cohortRunId || ext.timelineId || ext.placementId || ext.id;
};

const extractYouTubeId = (url: string): string | null => {
    const cleanUrl = url.trim();
    if (cleanUrl.includes('youtu.be/')) {
        return cleanUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (cleanUrl.includes('youtube.com/shorts/')) {
        return cleanUrl.split('youtube.com/shorts/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (cleanUrl.includes('youtube.com/live/')) {
        return cleanUrl.split('youtube.com/live/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (cleanUrl.includes('youtube.com/embed/')) {
        return cleanUrl.split('youtube.com/embed/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (cleanUrl.includes('youtube.com')) {
        try {
            const urlObj = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`);
            return urlObj.searchParams.get('v');
        } catch (e) {
            return null;
        }
    }
    return null;
};

const getEmbedVideoUrl = (url?: string | null): string | null => {
    if (!url) return null;
    try {
        const cleanUrl = url.trim();

        if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
            const sanitizedId = extractYouTubeId(cleanUrl)?.replace(/[^a-zA-Z0-9_-]/g, '');
            if (sanitizedId && sanitizedId.length >= 10) {
                return `https://www.youtube.com/embed/${sanitizedId}?controls=0&rel=0&autoplay=1&modestbranding=1`;
            }
        }

        if (cleanUrl.includes('vimeo.com')) {
            let videoId = '';
            let hash = '';

            const unlistedMatch = cleanUrl.match(/vimeo\.com\/(\d+)\/([a-zA-Z0-9]+)/);
            if (unlistedMatch) {
                videoId = unlistedMatch[1];
                hash = unlistedMatch[2];
            } else if (cleanUrl.includes('player.vimeo.com/video/')) {
                const parts = cleanUrl.split('player.vimeo.com/video/')[1]?.split('?')[0]?.split('/');
                videoId = parts[0] || '';
                const searchParams = new URLSearchParams(cleanUrl.split('?')[1] || '');
                hash = searchParams.get('h') || parts[1] || '';
            } else {
                const match = cleanUrl.match(/(?:vimeo\.com\/)(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/\d+\/video\/|video\/|manage\/videos\/)?(\d+)/);
                if (match && match[1]) {
                    videoId = match[1];
                }
            }

            if (videoId) {
                return `https://player.vimeo.com/video/${videoId}?controls=0&autopause=0${hash ? `&h=${hash}` : ''}&autoplay=1`;
            }
        }

        return cleanUrl;
    } catch (e) {
        return url;
    }
};

const CertificateModal: React.FC<CertificateModalProps> = ({ certificate, onClose }) => {
    return createPortal(
        <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: '960px', height: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid var(--mlab-green)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Award size={20} color="var(--mlab-green)" />
                        <div>
                            <div style={{ fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Certificate of Completion</div>
                            <div style={{ fontSize: '0.75rem', color: '#bae6fd' }}>{certificate.courseName || 'Course Verification'}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <Tooltip content="Download official certificate PDF document." placement="bottom">
                            <button onClick={() => window.open(certificate.pdfUrl, '_blank')} className="lfm-btn lfm-btn--primary" style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none', padding: '6px 14px', borderRadius: '2px' }}>
                                <Download size={14} /> Download Original PDF
                            </button>
                        </Tooltip>
                        <Tooltip content="Close certificate viewer" placement="bottom">
                            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} />
                            </button>
                        </Tooltip>
                    </div>
                </div>
                <div style={{ flex: 1, background: '#e2e8f0', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <object data={`${certificate.pdfUrl}#toolbar=0&navpanes=0`} type="application/pdf" width="100%" height="100%" style={{ borderRadius: '2px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                        <iframe src={`${certificate.pdfUrl}#toolbar=0&navpanes=0`} width="100%" height="100%" style={{ border: 'none' }} title="Certificate Preview">
                            <p>It appears you don't have a PDF plugin for this browser. <a href={certificate.pdfUrl} target="_blank" rel="noopener noreferrer">Click here to download the PDF.</a></p>
                        </iframe>
                    </object>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const CourseOverviewView: React.FC<CourseOverviewViewProps> = ({
    selectedCourse,
    courseUnits = [],
    groupedSyllabus = {},
    minutesToNextMilestone = 0,
    onBackToCatalog,
    onStartOrResume,
    onSelectUnit
}) => {
    const [isAboutExpanded, setIsAboutExpanded] = useState(false);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

    const [collapsedMainKeys, setCollapsedMainKeys] = useState<Set<string>>(new Set());
    const [collapsedSubKeys, setCollapsedSubKeys] = useState<Set<string>>(new Set());

    const [enrichedCourseUnits, setEnrichedCourseUnits] = useState<LearnerUnitProgress[]>(courseUnits);

    const [learnerCertificate, setLearnerCertificate] = useState<CertificateData | null>(null);
    const [isCertModalOpen, setIsCertModalOpen] = useState(false);
    const [isSearchingCert, setIsSearchingCert] = useState(false);

    // DIRECT FIREBASE TIMELINE HYDRATION STATE
    const [directTimelineData, setDirectTimelineData] = useState<DirectTimelineData | null>(null);

    const targetInstanceId = useMemo(() => getCourseInstanceId(selectedCourse), [selectedCourse]);
    const theme = getThemeStyles(selectedCourse.themeColor, selectedCourse.framework);

    // 1. DIRECT FIREBASE FETCH FOR TIMELINE BLUEPRINT (cohort_runs)
    useEffect(() => {
        if (!targetInstanceId) return;

        const fetchTimelineDirectly = async () => {
            try {
                const runRef = doc(db, 'cohort_runs', targetInstanceId);
                const snap = await getDoc(runRef);

                if (snap.exists()) {
                    setDirectTimelineData(snap.data() as DirectTimelineData);
                } else {
                    const containerRef = doc(db, 'content_containers', selectedCourse.id);
                    const containerSnap = await getDoc(containerRef);
                    if (containerSnap.exists()) {
                        setDirectTimelineData(containerSnap.data() as DirectTimelineData);
                    }
                }
            } catch (err) {
                console.error('[Direct Firebase Timeline] Error fetching timeline:', err);
            }
        };

        fetchTimelineDirectly();
    }, [targetInstanceId, selectedCourse.id]);

    // 2. REAL-TIME SNAPSHOT QUERY FOR PROGRESS
    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!currentUser?.uid || !selectedCourse) {
            setEnrichedCourseUnits(courseUnits.map(u => ({ ...u, isCompleted: false, progressPercent: 0, watchPercentage: 0 })));
            return;
        }

        const extCourse = selectedCourse as ExtendedCoursePackage;
        const targetKeys = extCourse.allowedProgressKeys || [targetInstanceId];

        const q = query(
            collection(db, 'learner_content_progress'),
            where('userId', '==', currentUser.uid),
            where('containerId', 'in', targetKeys)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const progressMap = new Map<string, { isCompleted?: boolean; watchPct?: number }>();
            snapshot.docs.forEach(d => {
                const data = d.data();
                progressMap.set(data.unitId as string, data);
            });

            setEnrichedCourseUnits(courseUnits.map(unit => {
                const prog = progressMap.get(unit.id);
                if (prog) {
                    return {
                        ...unit,
                        isCompleted: Boolean(prog.isCompleted),
                        progressPercent: prog.watchPct || 0,
                        watchPercentage: prog.watchPct || 0,
                    };
                }
                return {
                    ...unit,
                    isCompleted: false,
                    progressPercent: 0,
                    watchPercentage: 0,
                };
            }));
        }, (error) => {
            console.warn('[OverviewProgress] Query notice:', error.message);
        });

        return () => unsubscribe();
    }, [courseUnits, selectedCourse, targetInstanceId]);

    // DYNAMIC PER-LESSON PREREQUISITE GATING CALCULATION
    const gatedCourseUnits = useMemo(() => {
        const sorted = [...enrichedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        let activeLockEnforced = false;

        return sorted.map((unit) => {
            const isLocked = activeLockEnforced;

            if (!unit.isCompleted && unit.isRequiredForNextUnit === true) {
                activeLockEnforced = true;
            }

            return {
                ...unit,
                isLocked
            };
        });
    }, [enrichedCourseUnits]);

    // WEIGHTED FRACTIONAL PROGRESS CALCULATOR
    const dynamicCompletedCount = useMemo(() => {
        return gatedCourseUnits.reduce((sum, u) => {
            if (u.isCompleted) return sum + 1;
            const extUnit = u as ExtendedLearnerUnitProgress;
            const pct = Math.max(0, extUnit.progressPercent ?? extUnit.watchPercentage ?? 0);
            return sum + (pct / 100);
        }, 0);
    }, [gatedCourseUnits]);

    const hasCourseProgress = useMemo(() => {
        return dynamicCompletedCount > 0;
    }, [dynamicCompletedCount]);

    const isCourseComplete = useMemo(() => {
        const total = selectedCourse.totalUnitsCount || gatedCourseUnits.length;
        const fullCompletedCount = gatedCourseUnits.filter(u => u.isCompleted).length;
        return total > 0 && fullCompletedCount >= total;
    }, [gatedCourseUnits, selectedCourse.totalUnitsCount]);

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (isCourseComplete && currentUser && !learnerCertificate) {
            setIsSearchingCert(true);

            const extCourse = selectedCourse as ExtendedCoursePackage;
            const targetKeys = extCourse.allowedProgressKeys || [targetInstanceId];

            const fetchCertificate = async () => {
                try {
                    const q = query(
                        collection(db, 'ad_hoc_certificates'),
                        where('learnerId', '==', currentUser.uid),
                        where('courseId', 'in', targetKeys)
                    );
                    const snap = await getDocs(q);

                    if (!snap.empty) {
                        setLearnerCertificate({ id: snap.docs[0].id, ...snap.docs[0].data() } as CertificateData);
                    }
                } catch (error) {
                    console.error("Failed to fetch learner certificate:", error);
                } finally {
                    setIsSearchingCert(false);
                }
            };

            const timeoutId = setTimeout(fetchCertificate, 1500);
            return () => clearTimeout(timeoutId);
        }
    }, [isCourseComplete, selectedCourse, learnerCertificate, targetInstanceId]);

    const toggleMainKey = (key: string) => {
        setCollapsedMainKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleSubKey = (key: string) => {
        setCollapsedSubKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const extCourse = selectedCourse as ExtendedCoursePackage;
    const previewVideoUrl = selectedCourse.previewVideoUrl || extCourse.checkpointMetadata?.previewVideoUrl || null;

    const openPopoutPlayer = (videoUrl: string) => {
        const cleanUrl = videoUrl.trim();

        if (cleanUrl.includes('vimeo.com')) {
            const embedUrl = getEmbedVideoUrl(cleanUrl);
            if (embedUrl) {
                const width = 880;
                const height = 500;
                const left = (window.innerWidth - width) / 2;
                const top = (window.innerHeight - height) / 2;
                window.open(embedUrl, '_blank', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=no,status=no`);
            } else {
                window.open(cleanUrl, '_blank');
            }
            return;
        }

        const embedUrl = getEmbedVideoUrl(cleanUrl);
        if (!embedUrl) return;

        const width = 880;
        const height = 500;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;

        window.open(
            embedUrl,
            '_blank',
            `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=no,status=no`
        );
    };

    const targetAudienceList = selectedCourse.targetAudience || [];
    const requirementsList = selectedCourse.requirements || extCourse.prerequisites || [];
    const learningOutcomesList = selectedCourse.whatYouWillLearn || [];
    const instructorsList = selectedCourse.instructors || [];

    const rawMaterials = selectedCourse.materialIncludes || extCourse.checkpointMetadata?.materialIncludes;
    const materialsList = (Array.isArray(rawMaterials) && rawMaterials.length > 0)
        ? rawMaterials
        : [
            `${selectedCourse.estimatedTotalHours || 0} Hours Total Learning Content`,
            'Downloadable Lab Guides & Starter Code',
            'Interactive AI Peer Reviews & Quizzes',
            'Verified Certificate of Completion'
        ];

    // DIRECT FIREBASE-HYDRATED PACING & TIMELINE RESOLUTION
    const timeConfig = directTimelineData?.timeBoundConfig || {};

    const startDateVal = (timeConfig.startDate ||
        directTimelineData?.startDate ||
        directTimelineData?.applicationStartDate ||
        selectedCourse.startDate ||
        extCourse.timelineStartDate ||
        extCourse.runStartDate) as string | undefined;

    const endDateVal = (timeConfig.endDate ||
        directTimelineData?.endDate ||
        directTimelineData?.applicationEndDate ||
        selectedCourse.endDate ||
        extCourse.timelineEndDate ||
        extCourse.runEndDate) as string | undefined;

    const isTimeBoundVal = timeConfig.isTimeBound !== undefined
        ? timeConfig.isTimeBound
        : (startDateVal || endDateVal) ? true : false;

    const pacingModelVal = isTimeBoundVal ? 'cohort_scheduled' : 'individual_self_paced';

    const pacingScheduleBreakdownVal = useMemo(() => {
        const raw = directTimelineData?.pacingScheduleBreakdown ||
            directTimelineData?.checkpointMetadata?.pacingScheduleBreakdown ||
            extCourse.pacingScheduleBreakdown ||
            extCourse.checkpointMetadata?.pacingScheduleBreakdown ||
            [];
        return Array.isArray(raw) ? raw : [];
    }, [directTimelineData, extCourse]);

    // MULTI-TIERED SYLLABUS BUILDER
    const nestedSyllabus = useMemo(() => {
        const isSecam = selectedCourse.framework === 'secam';
        const sortedUnits = [...gatedCourseUnits].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        const mainGroupMap = new Map<string, Map<string, LearnerUnitProgress[]>>();

        const secamMeta = extCourse.secamStructure || extCourse.checkpointMetadata?.secamStructure;
        if (isSecam && Array.isArray(secamMeta) && secamMeta.length > 0) {
            secamMeta.forEach((sprint) => {
                if (sprint.title) {
                    const subMap = new Map<string, LearnerUnitProgress[]>();
                    if (Array.isArray(sprint.days)) {
                        sprint.days.forEach((day) => {
                            if (day.title) {
                                subMap.set(day.title, []);
                            }
                        });
                    }
                    mainGroupMap.set(sprint.title, subMap);
                }
            });
        }

        sortedUnits.forEach((unit) => {
            let mainKey = '';
            let subKey = '';

            if (isSecam) {
                mainKey = unit.sprintTitle || 'Sprint 1: Core Fundamentals';
                subKey = unit.dayOrLessonTitle || 'Day 1: Core Lessons';
            } else {
                const modType = unit.moduleType ? unit.moduleType.toUpperCase() : 'KNOWLEDGE';
                mainKey = unit.moduleCode ? `${unit.moduleCode} • ${modType}` : 'General Module';
                subKey = unit.topicId || 'General Topics';
            }

            if (!mainGroupMap.has(mainKey)) {
                mainGroupMap.set(mainKey, new Map());
            }
            const subMap = mainGroupMap.get(mainKey)!;

            if (!subMap.has(subKey)) {
                subMap.set(subKey, []);
            }
            subMap.get(subKey)!.push(unit);
        });

        return Array.from(mainGroupMap.entries())
            .map(([mainTitle, subMap]) => {
                const subGroups = Array.from(subMap.entries())
                    .map(([subTitle, units]) => ({
                        title: subTitle,
                        units: units.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
                    }))
                    .filter(sg => sg.units.length > 0);

                const allGroupUnits = subGroups.flatMap(sg => sg.units);

                const groupCompletedFraction = allGroupUnits.reduce((sum, u) => {
                    if (u.isCompleted) return sum + 1;
                    const extUnit = u as ExtendedLearnerUnitProgress;
                    const pct = Math.max(0, extUnit.progressPercent ?? extUnit.watchPercentage ?? 0);
                    return sum + (pct / 100);
                }, 0);

                const fullCompletedCount = allGroupUnits.filter(u => u.isCompleted).length;

                return {
                    title: mainTitle,
                    subGroups,
                    totalUnits: allGroupUnits.length,
                    completedUnits: fullCompletedCount,
                    completedFraction: groupCompletedFraction,
                    isComplete: allGroupUnits.length > 0 && fullCompletedCount === allGroupUnits.length
                };
            })
            .filter(mg => mg.subGroups.length > 0);
    }, [gatedCourseUnits, selectedCourse, extCourse]);

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {isCertModalOpen && learnerCertificate && (
                <CertificateModal certificate={learnerCertificate} onClose={() => setIsCertModalOpen(false)} />
            )}

            <Tooltip content="Return to course catalog overview." placement="right">
                <button
                    type="button"
                    onClick={onBackToCatalog}
                    className="lfm-btn lfm-btn--ghost"
                    style={{ alignSelf: 'flex-start' }}
                >
                    <ArrowLeft size={15} /> Return to Catalog
                </button>
            </Tooltip>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000000', border: '2px solid var(--mlab-blue)', overflow: 'hidden' }}>
                        {isPreviewPlaying && previewVideoUrl ? (
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                <iframe
                                    src={getEmbedVideoUrl(previewVideoUrl) || ''}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                    title="Course Stream Preview Trailer"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                />

                                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 10 }}>
                                    <Tooltip content="Launch preview in a standalone window." placement="bottom">
                                        <button
                                            type="button"
                                            onClick={() => openPopoutPlayer(previewVideoUrl)}
                                            style={{
                                                background: '#0284c7',
                                                color: 'white',
                                                border: '1px solid rgba(255,255,255,0.4)',
                                                padding: '4px 10px',
                                                fontSize: '0.72rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontFamily: 'var(--font-heading)'
                                            }}
                                        >
                                            <ExternalLink size={12} /> Popout Window
                                        </button>
                                    </Tooltip>
                                    <Tooltip content="Close trailer player" placement="bottom">
                                        <button
                                            type="button"
                                            onClick={() => setIsPreviewPlaying(false)}
                                            style={{
                                                background: 'rgba(15, 23, 42, 0.9)',
                                                color: 'white',
                                                border: '1px solid rgba(255,255,255,0.3)',
                                                padding: '4px 10px',
                                                fontSize: '0.72rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontFamily: 'var(--font-heading)'
                                            }}
                                        >
                                            <X size={14} /> Close
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    if (previewVideoUrl) setIsPreviewPlaying(true);
                                }}
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    padding: 0,
                                    cursor: previewVideoUrl ? 'pointer' : 'default',
                                    background: theme.gradient,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <div style={{ transform: 'scale(1.8)', opacity: 0.95 }}>
                                    <CourseIllustrationGraphic
                                        type={selectedCourse.illustrationType}
                                        themeColor={selectedCourse.themeColor}
                                        framework={selectedCourse.framework}
                                        size={48}
                                    />
                                </div>

                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(7,63,78,0.15) 0%, rgba(7,63,78,0.75) 100%)' }} />

                                <span style={{ position: 'absolute', top: '14px', left: '14px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'white', background: 'rgba(0,0,0,0.5)', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)' }}>
                                    <Sparkles size={12} /> Course Stream Preview
                                </span>

                                {previewVideoUrl && (
                                    <Tooltip content="Play course stream trailer video." placement="bottom">
                                        <div style={{
                                            position: 'relative',
                                            width: '68px', height: '68px', borderRadius: '0px',
                                            background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 6px 24px rgba(0,0,0,0.35)'
                                        }}>
                                            <Play size={26} fill="var(--mlab-blue)" color="var(--mlab-blue)" style={{ marginLeft: '3px' }} />
                                        </div>
                                    </Tooltip>
                                )}

                                <div style={{ position: 'absolute', bottom: '14px', left: '14px', right: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                    <div style={{ textAlign: 'left' }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'white', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                            {selectedCourse.title}
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'white', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', flexShrink: 0, fontFamily: 'var(--font-heading)' }}>
                                        {previewVideoUrl ? 'Trailer Available • Click to Play' : 'Artwork Banner'}
                                    </span>
                                </div>
                            </button>
                        )}
                    </div>

                    {isCourseComplete ? (
                        <div style={{
                            background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
                            color: 'white',
                            padding: '24px 28px',
                            borderLeft: `6px solid #f59e0b`,
                            border: '2px solid #14532d',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <PartyPopper size={48} color="rgba(255,255,255,0.1)" style={{ position: 'absolute', right: '20px', top: '20px' }} />

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#fde68a', fontWeight: 800, letterSpacing: '0.05em', fontFamily: 'var(--font-heading)' }}>
                                    Course Completed!
                                </span>
                            </div>

                            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#ffffff', position: 'relative', zIndex: 2 }}>
                                {selectedCourse.title}
                            </h2>

                            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#dcfce7', maxWidth: '480px', lineHeight: 1.5, position: 'relative', zIndex: 2 }}>
                                Congratulations! You have successfully completed all modules and interactive assessments for this course. Your competency has been verified.
                            </p>

                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 2 }}>
                                {learnerCertificate ? (
                                    <Tooltip content="Open and download your official PDF completion certificate." placement="top">
                                        <button
                                            onClick={() => setIsCertModalOpen(true)}
                                            className="lfm-btn lfm-btn--primary animate-fade-in"
                                            style={{ background: '#f59e0b', color: '#78350f', border: 'none', padding: '10px 18px', fontSize: '0.85rem' }}
                                        >
                                            <Award size={16} /> View &amp; Download Certificate
                                        </button>
                                    </Tooltip>
                                ) : isSearchingCert ? (
                                    <span style={{ fontSize: '0.78rem', color: '#fde68a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', border: '1px solid rgba(255,255,255,0.2)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        <Loader2 size={13} className="lfm-spin" /> Verifying &amp; Generating Document...
                                    </span>
                                ) : (
                                    <span style={{ fontSize: '0.75rem', color: '#bae6fd', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.2)' }}>
                                        <CheckCircle2 size={14} color="#bae6fd" />
                                        Your completion is logged. Note: External qualifications may take additional time to issue.
                                    </span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            background: 'var(--mlab-blue)',
                            color: 'white',
                            padding: '24px 28px',
                            borderRadius: '0px',
                            borderLeft: `6px solid ${theme.borderTopColor}`,
                            border: '2px solid var(--mlab-blue)'
                        }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--mlab-green)', fontWeight: 800, letterSpacing: '0.05em', fontFamily: 'var(--font-heading)' }}>
                                    {selectedCourse.framework === 'secam' ? 'SECAM Agile Bootcamp' : 'QCTO Qualification'}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontFamily: 'monospace' }}>
                                    Ref: {selectedCourse.referenceId}
                                </span>
                            </div>

                            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#ffffff' }}>
                                {selectedCourse.title}
                            </h2>

                            <div style={{ maxWidth: '360px', marginBottom: '18px' }}>
                                <ProgressBar
                                    completed={dynamicCompletedCount}
                                    total={selectedCourse.totalUnitsCount || gatedCourseUnits.length}
                                    trackColor="rgba(255,255,255,0.15)"
                                    fillColor="var(--mlab-green, #94c73d)"
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <Tooltip content={hasCourseProgress ? "Continue with your next uncompleted lesson." : "Start lesson 1 in the course player."} placement="top">
                                    <button
                                        type="button"
                                        onClick={onStartOrResume}
                                        className="lfm-btn lfm-btn--green"
                                    >
                                        <Play size={16} fill="var(--mlab-blue)" />
                                        {hasCourseProgress ? 'Resume Active Lesson' : 'Begin Course Content'}
                                    </button>
                                </Tooltip>

                                {minutesToNextMilestone > 0 && (
                                    <Tooltip content="Estimated duration to complete the next active lesson." placement="top">
                                        <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.1)', padding: '6px 10px', border: '1px solid rgba(255,255,255,0.2)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                            <Clock size={13} color="var(--mlab-green)" /> ~{minutesToNextMilestone} min to next milestone
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="qcto-card" style={{ padding: '20px' }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            About Course
                        </h3>

                        <QuillHTMLViewer html={selectedCourse.description} textColor="var(--mlab-blue)" />

                        {isAboutExpanded && (
                            <p style={{ margin: '10px 0 0 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
                                This course is built for {targetAudienceList[0]?.toLowerCase() || 'all learners'}, and continues on for {targetAudienceList.slice(1).join(', ').toLowerCase() || 'related skill tracks'}. Prerequisites: {requirementsList.join('; ').toLowerCase() || 'None'}.
                            </p>
                        )}

                        <Tooltip content="Expand or collapse detailed course background information." placement="top">
                            <button
                                type="button"
                                onClick={() => setIsAboutExpanded(prev => !prev)}
                                style={{ marginTop: '12px', background: 'transparent', border: 'none', color: 'var(--mlab-blue)', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
                            >
                                {isAboutExpanded ? 'Show Less' : 'Show More'}
                                <ChevronDown size={14} style={{ transform: isAboutExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                            </button>
                        </Tooltip>
                    </div>

                    {learningOutcomesList.length > 0 && (
                        <div className="qcto-card" style={{ padding: '20px' }}>
                            <h3 style={{ margin: '0 0 14px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                What Will I Learn?
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px 20px' }}>
                                {learningOutcomesList.map(point => (
                                    <div key={point} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                        <CheckCircle2 size={15} color="#15803d" style={{ flexShrink: 0, marginTop: '1px' }} />
                                        <span style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.4 }}>{point}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="qcto-card">
                        <div className="qcto-hdr" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Layers size={18} color="white" /> Course Curriculum Modules
                            </span>
                            <span style={{ fontSize: '0.7rem', background: 'white', color: 'var(--mlab-blue)', padding: '2px 8px', fontWeight: 800 }}>
                                {gatedCourseUnits.length} Total Units
                            </span>
                        </div>

                        <div style={{ padding: '16px' }}>
                            {nestedSyllabus.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                                    <Layers size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                    <p style={{ margin: 0, fontSize: '0.85rem' }}>No learning units published for this course yet.</p>
                                </div>
                            ) : (
                                nestedSyllabus.map((mainGroup) => {
                                    const isMainCollapsed = collapsedMainKeys.has(mainGroup.title);

                                    const mainPercent = mainGroup.totalUnits > 0
                                        ? Math.min(100, Math.round((mainGroup.completedFraction / mainGroup.totalUnits) * 100))
                                        : 0;

                                    return (
                                        <div key={mainGroup.title} style={{ marginBottom: '16px', border: '2px solid var(--mlab-border)', borderRadius: '0px', overflow: 'hidden', background: '#ffffff' }}>
                                            <Tooltip content="Click to expand or collapse module sections." placement="top">
                                                <div
                                                    onClick={() => toggleMainKey(mainGroup.title)}
                                                    style={{
                                                        background: 'var(--mlab-light-blue)',
                                                        padding: '12px 16px',
                                                        borderBottom: isMainCollapsed ? 'none' : '2px solid var(--mlab-border)',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        cursor: 'pointer',
                                                        userSelect: 'none',
                                                        flexWrap: 'wrap',
                                                        gap: '10px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
                                                        {selectedCourse.framework === 'secam' ? (
                                                            <Zap size={16} color="var(--mlab-blue)" />
                                                        ) : (
                                                            <GraduationCap size={16} color="var(--mlab-blue)" />
                                                        )}
                                                        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                            {mainGroup.title}
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto' }}>
                                                        <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                                                                <span>PROGRESS</span>
                                                                <span>{mainPercent}%</span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '5px', background: 'rgba(2, 132, 199, 0.15)', borderRadius: '0px', overflow: 'hidden' }}>
                                                                <div style={{ width: `${mainPercent}%`, height: '100%', background: mainPercent === 100 ? 'var(--mlab-green)' : 'var(--mlab-blue)', transition: 'width 0.3s ease' }} />
                                                            </div>
                                                        </div>

                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: 800,
                                                            padding: '3px 8px',
                                                            color: mainGroup.isComplete ? '#15803d' : 'var(--mlab-blue)',
                                                            background: mainGroup.isComplete ? 'var(--mlab-green-bg)' : '#ffffff',
                                                            border: `1px solid ${mainGroup.isComplete ? 'var(--mlab-green)' : 'var(--mlab-border)'}`,
                                                            fontFamily: 'var(--font-heading)'
                                                        }}>
                                                            {mainGroup.completedUnits} / {mainGroup.totalUnits} DONE
                                                        </span>
                                                        <ChevronDown
                                                            size={18}
                                                            color="var(--mlab-blue)"
                                                            style={{
                                                                transform: isMainCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                                                transition: 'transform 0.2s ease'
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </Tooltip>

                                            {!isMainCollapsed && (
                                                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc' }}>
                                                    {mainGroup.subGroups.map((subGroup) => {
                                                        const subKey = `${mainGroup.title}__${subGroup.title}`;
                                                        const isSubCollapsed = collapsedSubKeys.has(subKey);
                                                        const subDone = subGroup.units.filter(u => u.isCompleted).length;

                                                        return (
                                                            <div key={subKey} style={{ border: '1px solid var(--mlab-border)', background: '#ffffff', borderRadius: '0px' }}>
                                                                <Tooltip content="Click to expand or collapse topic lessons." placement="top">
                                                                    <div
                                                                        onClick={() => toggleSubKey(subKey)}
                                                                        style={{
                                                                            background: '#ffffff',
                                                                            padding: '8px 12px',
                                                                            borderBottom: isSubCollapsed ? 'none' : '1px solid var(--mlab-border)',
                                                                            borderLeft: '4px solid var(--mlab-blue)',
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center',
                                                                            cursor: 'pointer',
                                                                            userSelect: 'none',
                                                                            flexWrap: 'wrap',
                                                                            gap: '8px'
                                                                        }}
                                                                    >
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <Bookmark size={14} color="var(--mlab-blue)" />
                                                                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#334155', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                                                {subGroup.title}
                                                                            </span>
                                                                        </div>

                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b' }}>
                                                                                {subGroup.units.length} Lesson{subGroup.units.length === 1 ? '' : 's'} ({subDone} Done)
                                                                            </span>
                                                                            <ChevronDown
                                                                                size={16}
                                                                                color="#64748b"
                                                                                style={{
                                                                                    transform: isSubCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                                                                    transition: 'transform 0.2s ease'
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </Tooltip>

                                                                {!isSubCollapsed && (
                                                                    <div>
                                                                        {subGroup.units.map((u) => {
                                                                            const extUnit = u as ExtendedLearnerUnitProgress;
                                                                            const unitProgressPercent = u.isCompleted
                                                                                ? 100
                                                                                : Math.min(100, Math.max(0, extUnit.progressPercent ?? extUnit.watchPercentage ?? 0));

                                                                            const hasStartedUnit = unitProgressPercent > 0 && unitProgressPercent < 100;
                                                                            const isClickable = !u.isLocked;

                                                                            return (
                                                                                <Tooltip key={u.id} content={u.isLocked ? "Complete preceding required lessons to unlock." : "Click to launch lesson player."} placement="left">
                                                                                    <div
                                                                                        onClick={() => {
                                                                                            if (isClickable) onSelectUnit(u);
                                                                                        }}
                                                                                        style={{
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            justifyContent: 'space-between',
                                                                                            padding: '10px 14px',
                                                                                            borderBottom: '1px solid #f1f5f9',
                                                                                            cursor: isClickable ? 'pointer' : 'not-allowed',
                                                                                            background: u.isLocked ? '#f8fafc' : '#ffffff',
                                                                                            opacity: u.isLocked ? 0.75 : 1,
                                                                                            transition: 'background-color 0.15s ease',
                                                                                            flexWrap: 'wrap',
                                                                                            gap: '10px'
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px', flex: '1 1 240px' }}>
                                                                                            <div style={{
                                                                                                width: '24px', height: '24px', flexShrink: 0,
                                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                                fontSize: '0.7rem', fontWeight: 800,
                                                                                                border: `1px solid ${u.isCompleted ? '#15803d' : isClickable ? 'var(--mlab-blue)' : '#cbd5e1'}`,
                                                                                                color: u.isCompleted ? '#15803d' : isClickable ? 'var(--mlab-blue)' : '#94a3b8',
                                                                                                background: u.isCompleted ? 'var(--mlab-green-bg)' : 'white',
                                                                                                fontFamily: 'var(--font-heading)'
                                                                                            }}>
                                                                                                {u.isCompleted ? <CheckCircle2 size={14} /> : u.isLocked ? <Lock size={12} /> : u.orderIndex}
                                                                                            </div>

                                                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: isClickable ? 'var(--mlab-blue)' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                                    {u.title}
                                                                                                </div>
                                                                                                <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                                                                    <span style={{ textTransform: 'uppercase', fontWeight: 800, color: isClickable ? 'var(--mlab-blue)' : '#94a3b8', fontFamily: 'var(--font-heading)' }}>{u.unitType}</span>
                                                                                                    <span>•</span>
                                                                                                    <span>{u.estimatedMinutes} mins</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        {!u.isLocked && (
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px', flex: '0 1 150px' }}>
                                                                                                <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '0px', overflow: 'hidden', position: 'relative' }}>
                                                                                                    <div
                                                                                                        style={{
                                                                                                            width: `${unitProgressPercent}%`,
                                                                                                            height: '100%',
                                                                                                            background: u.isCompleted ? '#15803d' : 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
                                                                                                            transition: 'width 0.4s ease'
                                                                                                        }}
                                                                                                    />
                                                                                                </div>
                                                                                                <span style={{
                                                                                                    fontSize: '0.65rem',
                                                                                                    fontWeight: 800,
                                                                                                    color: u.isCompleted ? '#15803d' : hasStartedUnit ? '#0284c7' : '#94a3b8',
                                                                                                    fontFamily: 'monospace',
                                                                                                    minWidth: '32px',
                                                                                                    textAlign: 'right'
                                                                                                }}>
                                                                                                    {unitProgressPercent}%
                                                                                                </span>
                                                                                            </div>
                                                                                        )}

                                                                                        <div style={{ flexShrink: 0, marginLeft: 'auto' }}>
                                                                                            {u.isCompleted ? (
                                                                                                <span style={{ fontSize: '0.65rem', color: '#15803d', background: 'var(--mlab-green-bg)', padding: '2px 8px', fontWeight: 800, border: '1px solid var(--mlab-green)', fontFamily: 'var(--font-heading)' }}>
                                                                                                    DONE
                                                                                                </span>
                                                                                            ) : u.isLocked ? (
                                                                                                <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#e2e8f0', padding: '2px 8px', fontWeight: 800, border: '1px solid #cbd5e1', fontFamily: 'var(--font-heading)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                                    <Lock size={10} /> LOCKED
                                                                                                </span>
                                                                                            ) : hasStartedUnit ? (
                                                                                                <button type="button" className="lfm-btn lfm-btn--primary" style={{ padding: '3px 10px', fontSize: '0.68rem', background: '#0284c7' }}>
                                                                                                    RESUME
                                                                                                </button>
                                                                                            ) : (
                                                                                                <button type="button" className="lfm-btn lfm-btn--ghost" style={{ padding: '3px 10px', fontSize: '0.68rem' }}>
                                                                                                    START
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </Tooltip>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>

                {/* STICKY RIGHT SIDEBAR */}
                <div className="lch-sidebar-sticky">

                    {/* PROGRAMME TIMELINE & PACING SCHEDULE CARD */}
                    <Tooltip content="Delivery timeline and schedule structure assigned to this intake run." placement="left">
                        <div className="qcto-card" style={{ marginBottom: '12px' }}>
                            <div className="qcto-hdr" style={{ fontSize: '0.75rem', display: 'flex', borderBottom: '3px solid var(--mlab-green)', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Programme Timeline &amp; Pacing</span>
                                <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', fontWeight: 800 }}>
                                    {pacingModelVal === 'individual_self_paced' ? 'Self-Paced' : 'Cohort Scheduled'}
                                </span>
                            </div>

                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f8fafc', padding: '10px', border: '1px solid #cbd5e1' }}>
                                    <div>
                                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                                            Start Date
                                        </span>
                                        <strong style={{ fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>
                                            {startDateVal ? moment(startDateVal).format('DD MMM YYYY') : 'Flexible Start'}
                                        </strong>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                                            Target End Date
                                        </span>
                                        <strong style={{ fontSize: '0.8rem', color: endDateVal && moment(endDateVal).isBefore(moment()) ? '#dc2626' : 'var(--mlab-blue)' }}>
                                            {endDateVal ? moment(endDateVal).format('DD MMM YYYY') : 'Open Ending'}
                                        </strong>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-heading)' }}>
                                        Lesson Pacing Model
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: '#475569', margin: 0, lineHeight: 1.4 }}>
                                        {pacingModelVal === 'individual_self_paced' ? (
                                            '⚡ Individual Self-Paced: Complete lessons at your own speed. Gated lessons require completion before unlocking subsequent units.'
                                        ) : (
                                            '🔒 Fixed Cohort Schedule: Lessons unlock according to the master cohort delivery timetable.'
                                        )}
                                    </p>
                                </div>

                                {pacingScheduleBreakdownVal.length > 0 && (
                                    <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '10px' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'var(--font-heading)' }}>
                                            Module Milestone Schedule
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {pacingScheduleBreakdownVal.map((item, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', background: '#ffffff', padding: '6px 8px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontWeight: 700, color: '#334155' }}>{item.moduleOrSprintTitle || item.title || `Module ${idx + 1}`}</span>
                                                    <span style={{ color: '#0284c7', fontWeight: 800 }}>{item.targetDate ? moment(item.targetDate).format('DD MMM') : `${item.targetHours || 0}h target`}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Tooltip>

                    <div className="qcto-card">
                        <div className="qcto-hdr" style={{ fontSize: '0.75rem', borderBottom: '3px solid var(--mlab-green)' }}>
                            Course Specifications
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <Tooltip content="Target skill level for this course." placement="left">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                                    <BarChart3 size={14} color="var(--mlab-blue)" /> {selectedCourse.level || 'Beginner'} Level
                                </div>
                            </Tooltip>

                            <Tooltip content="Total learners enrolled in this delivery intake." placement="left">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                                    <Users size={14} color="var(--mlab-blue)" /> {(selectedCourse.enrolledCount || 0).toLocaleString()} Enrolled Learners
                                </div>
                            </Tooltip>

                            <Tooltip content="Total estimated learning duration including practical coursework." placement="left">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                                    <Clock size={14} color="var(--mlab-blue)" />
                                    {selectedCourse.courseworkHours && selectedCourse.courseworkHours > 0 ? (
                                        <span><strong>{selectedCourse.estimatedTotalHours} Hours Total</strong> ({selectedCourse.contentHours}h content + {selectedCourse.courseworkHours}h projects)</span>
                                    ) : (
                                        <span>{selectedCourse.estimatedTotalHours || 0} Hours Duration</span>
                                    )}
                                </div>
                            </Tooltip>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                                <Calendar size={14} color="var(--mlab-blue)" /> Updated {selectedCourse.lastUpdatedLabel || 'Recently'}
                            </div>

                            {selectedCourse.hasCertificate && (
                                <Tooltip content="Official certificate issued upon successfully passing all required modules." placement="left">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#334155' }}>
                                        <Award size={14} color="var(--mlab-blue)" /> Certificate Granted
                                    </div>
                                </Tooltip>
                            )}
                        </div>
                    </div>

                    {instructorsList.length > 0 && (
                        <div className="qcto-card">
                            <div className="qcto-hdr" style={{ fontSize: '0.75rem', borderBottom: '3px solid var(--mlab-green)' }}>
                                Assigned Facilitators
                            </div>
                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {instructorsList.map((instructor) => (
                                    <div key={instructor.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '34px', height: '34px', borderRadius: '0px', flexShrink: 0,
                                            background: 'var(--mlab-blue)', color: 'white', border: '1px solid var(--mlab-blue)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.75rem', fontWeight: 800, fontFamily: 'var(--font-heading)'
                                        }}>
                                            {instructor.initials || instructor.name.split(' ').map((n: string) => n[0]).join('')}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{instructor.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{instructor.role}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {materialsList.length > 0 && (
                        <div className="qcto-card">
                            <div className="qcto-hdr" style={{ fontSize: '0.75rem', borderBottom: '3px solid var(--mlab-green)' }}>
                                Material Included
                            </div>
                            <div style={{ padding: '16px' }}>
                                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {materialsList.map((item: string) => (
                                        <li key={item} style={{ fontSize: '0.78rem', color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                                            <Check size={13} color="#15803d" style={{ flexShrink: 0, marginTop: '2px' }} /> {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};