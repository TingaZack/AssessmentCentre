import React, { useState, useEffect } from 'react';
import {
    FileText, MessageSquare, HelpCircle, Paperclip, Sparkles,
    Send, Loader2, Plus, ArrowLeft, ExternalLink,
    FileSpreadsheet, FileCode, Bot, Zap, Download
} from 'lucide-react';
import {
    collection, query, where, onSnapshot, addDoc,
    serverTimestamp, doc, getDoc, setDoc, updateDoc, increment, limit
} from 'firebase/firestore';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { auth, db } from '../../../../lib/firebase';
import { QuillHTMLViewer } from '../../../../components/common/QuillHTMLViewer/QuillHTMLViewer';


interface LessonInteractionTabsProps {
    currentActiveUnit: ExtendedLearnerUnitProgress;
    selectedCourse: any;
    targetInstanceId: string;
    allAttachments: AttachmentItem[];
}

const QUILL_QA_MODULES = {
    toolbar: [
        ['bold', 'italic', 'underline', 'code-block'],
        ['formula'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link'],
        ['clean']
    ],
};

// --- TYPES ---
import type {
    AttachmentItem,
    ExtendedLearnerUnitProgress
} from '../CoursePlayerView';

export interface LearnerCommentDoc {
    id: string;
    unitId: string;
    containerId?: string;
    timelineId?: string;
    cohortRunId?: string;
    userId: string;
    userName: string;
    userInitials?: string;
    text: string;
    createdAt?: { toDate?: () => Date; seconds?: number };
    isStaff?: boolean;
    isFlagged?: boolean;
    flagReason?: string;
}

export interface LearnerQuestionDoc {
    id: string;
    unitId: string;
    unitTitle?: string;
    containerId: string;
    timelineId?: string;
    cohortRunId?: string;
    courseId: string;
    userId: string;
    userName: string;
    userInitials?: string;
    title: string;
    contentHtml: string;
    answersCount: number;
    hasStaffReply: boolean;
    isResolved: boolean;
    createdAt: any;
    lastActivityAt?: any;
}

export interface LearnerAnswerDoc {
    id: string;
    questionId: string;
    unitId: string;
    containerId?: string;
    userId: string;
    userName: string;
    userInitials?: string;
    contentHtml: string;
    createdAt?: { toDate?: () => Date; seconds?: number };
    isStaff?: boolean;
}

interface LessonInteractionTabsProps {
    currentActiveUnit: ExtendedLearnerUnitProgress;
    selectedCourse: any;
    targetInstanceId: string;
    allAttachments: AttachmentItem[];
}

export const LessonInteractionTabs: React.FC<LessonInteractionTabsProps> = ({
    currentActiveUnit,
    selectedCourse,
    targetInstanceId,
    allAttachments
}) => {
    // --- TAB STATE ---
    const [activeLessonTab, setActiveLessonTab] = useState<'notes' | 'comments' | 'attachments' | 'qa' | 'related'>('notes');

    // --- NOTES STATE ---
    const [learnerNotes, setLearnerNotes] = useState('');
    const [isNotesLoading, setIsNotesLoading] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

    // --- COMMENTS STATE ---
    const [comments, setComments] = useState<LearnerCommentDoc[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isPostingComment, setIsPostingComment] = useState(false);

    // --- Q&A STATE ---
    const [questions, setQuestions] = useState<LearnerQuestionDoc[]>([]);
    const [qaViewMode, setQaViewMode] = useState<'list' | 'ask' | 'detail'>('list');
    const [selectedQuestion, setSelectedQuestion] = useState<LearnerQuestionDoc | null>(null);
    const [questionAnswers, setQuestionAnswers] = useState<LearnerAnswerDoc[]>([]);
    const [showMockAiAnswer, setShowMockAiAnswer] = useState(false);
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [questionTitle, setQuestionTitle] = useState('');
    const [questionBody, setQuestionTitleBody] = useState('');
    const [answerBody, setAnswerBody] = useState('');
    const [isSubmittingQA, setIsSubmittingQA] = useState(false);

    const LESSON_TABS: { key: typeof activeLessonTab; label: string; icon: typeof FileText }[] = [
        { key: 'notes', label: 'Notes', icon: FileText },
        { key: 'comments', label: `Comments (${comments.length})`, icon: MessageSquare },
        { key: 'qa', label: `Questions (${questions.length})`, icon: HelpCircle },
        { key: 'attachments', label: `Attachments (${allAttachments.length})`, icon: Paperclip },
        { key: 'related', label: 'Related', icon: Sparkles }
    ];

    // ==========================================
    // DATA FETCHING & REAL-TIME LISTENERS
    // ==========================================

    // Fetch Notes (One-time on load)
    useEffect(() => {
        const fetchNotes = async () => {
            const currentUser = auth.currentUser;
            if (!currentUser || !currentActiveUnit?.id) {
                setLearnerNotes('');
                setIsNotesLoading(false);
                return;
            }

            setIsNotesLoading(true);
            try {
                const noteRef = doc(db, 'learnerNotes', `${currentUser.uid}_${currentActiveUnit.id}`);
                const noteSnap = await getDoc(noteRef);
                if (noteSnap.exists()) {
                    setLearnerNotes(noteSnap.data().content || '');
                } else {
                    setLearnerNotes('');
                }
            } catch (err) {
                console.warn('[Firebase] Learner notes fetch notice:', err);
                setLearnerNotes('');
            } finally {
                setIsNotesLoading(false);
            }
        };

        fetchNotes();
    }, [currentActiveUnit?.id]);

    // Real-time Comments Listener
    useEffect(() => {
        if (!currentActiveUnit?.id || !targetInstanceId) return;

        const q = query(
            collection(db, 'lessonComments'),
            where('unitId', '==', currentActiveUnit.id),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rawComments = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LearnerCommentDoc));

            const filtered = rawComments.filter((c) => {
                const docContainer = c.containerId || c.timelineId || c.cohortRunId;
                return docContainer === targetInstanceId;
            });

            filtered.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeA - timeB; // Oldest first for chat flow
            });

            setComments(filtered);
        }, (error) => {
            console.error('[DEBUG Comments] Firestore error in comments snapshot:', error);
        });

        return () => unsubscribe();
    }, [currentActiveUnit?.id, targetInstanceId]);

    // Real-time Questions Listener
    useEffect(() => {
        if (!currentActiveUnit?.id || !targetInstanceId) return;

        const q = query(
            collection(db, 'lessonQuestions'),
            where('unitId', '==', currentActiveUnit.id),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rawQuestions = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LearnerQuestionDoc));

            const filtered = rawQuestions.filter((qData) => {
                const docContainer = qData.containerId || qData.timelineId || qData.cohortRunId;
                return docContainer === targetInstanceId;
            });

            filtered.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeB - timeA; // Newest first
            });

            setQuestions(filtered);
        }, (error) => {
            console.error('[DEBUG Questions] Firestore error in questions snapshot:', error);
        });

        return () => unsubscribe();
    }, [currentActiveUnit?.id, targetInstanceId]);

    // Real-time Answers Listener (only active when a question is selected)
    useEffect(() => {
        if (!selectedQuestion?.id) {
            setQuestionAnswers([]);
            return;
        }

        const q = query(
            collection(db, 'lessonQuestionAnswers'),
            where('questionId', '==', selectedQuestion.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedAnswers = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LearnerAnswerDoc));

            fetchedAnswers.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeA - timeB; // Oldest first
            });

            setQuestionAnswers(fetchedAnswers);
        }, (error) => {
            console.error('[DEBUG Answers] Firestore error in answers snapshot:', error);
        });

        return () => unsubscribe();
    }, [selectedQuestion?.id]);

    // ==========================================
    // ACTION HANDLERS
    // ==========================================

    const handleSaveNotes = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentActiveUnit?.id) return;
        setIsSavingNotes(true);
        try {
            const docRef = doc(db, 'learnerNotes', `${currentUser.uid}_${currentActiveUnit.id}`);
            await setDoc(docRef, {
                userId: currentUser.uid,
                courseId: selectedCourse.id,
                containerId: targetInstanceId || selectedCourse.id,
                unitId: currentActiveUnit.id,
                content: learnerNotes,
                updatedAt: serverTimestamp()
            }, { merge: true });

            setNoteSavedFeedback(true);
            setTimeout(() => setNoteSavedFeedback(false), 2000);
        } catch (err) {
            console.error('[FirebaseNotes] Error saving notes:', err);
        } finally {
            setIsSavingNotes(false);
        }
    };

    const handlePostComment = async () => {
        const currentUser = auth.currentUser;
        if (!newComment.trim() || !currentUser || !currentActiveUnit?.id || !targetInstanceId) return;
        setIsPostingComment(true);
        try {
            const userEmail = currentUser.email || 'Learner';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonComments'), {
                unitId: currentActiveUnit.id,
                containerId: targetInstanceId,
                courseId: selectedCourse.id,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                text: newComment.trim(),
                createdAt: serverTimestamp()
            });
            setNewComment('');
        } catch (error) {
            console.error('[FirebaseComments] Error posting comment:', error);
        } finally {
            setIsPostingComment(false);
        }
    };

    const handlePostQuestion = async () => {
        const currentUser = auth.currentUser;
        if (!questionTitle.trim() || !questionBody.trim() || !currentUser || !currentActiveUnit?.id || !targetInstanceId) return;
        setIsSubmittingQA(true);
        try {
            const userEmail = currentUser.email || 'Learner';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonQuestions'), {
                unitId: currentActiveUnit.id,
                containerId: targetInstanceId,
                courseId: selectedCourse.id,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                title: questionTitle.trim(),
                contentHtml: questionBody,
                answersCount: 0,
                isResolved: false,
                createdAt: serverTimestamp()
            });
            setQuestionTitle('');
            setQuestionTitleBody('');
            setQaViewMode('list');
        } catch (error) {
            console.error('[FirebaseQA] Error posting question:', error);
        } finally {
            setIsSubmittingQA(false);
        }
    };

    const handlePostAnswer = async () => {
        const currentUser = auth.currentUser;
        if (!answerBody.trim() || !currentUser || !selectedQuestion?.id || !targetInstanceId) return;

        setIsSubmittingQA(true);
        try {
            const userEmail = currentUser.email || 'Staff';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            // Check if user is staff (simplified check based on typical pattern)
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userDocRef);
            const isStaffUser = userSnap.exists() && ['admin', 'facilitator', 'assessor', 'moderator'].includes(userSnap.data().role);

            await addDoc(collection(db, 'lessonQuestionAnswers'), {
                questionId: selectedQuestion.id,
                unitId: currentActiveUnit.id,
                containerId: targetInstanceId,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                contentHtml: answerBody,
                isStaff: isStaffUser,
                createdAt: serverTimestamp()
            });

            const qRef = doc(db, 'lessonQuestions', selectedQuestion.id);
            const updatePayload: Record<string, any> = {
                answersCount: increment(1),
                lastActivityAt: serverTimestamp()
            };

            if (isStaffUser) {
                updatePayload.hasStaffReply = true;
            }

            await updateDoc(qRef, updatePayload);
            setAnswerBody('');
        } catch (error) {
            console.error('[FirebaseQA] Error posting answer:', error);
        } finally {
            setIsSubmittingQA(false);
        }
    };

    const handleTriggerMockAi = () => {
        setIsAiThinking(true);
        setTimeout(() => {
            setIsAiThinking(false);
            setShowMockAiAnswer(true);
        }, 1500);
    };

    // ==========================================
    // RENDER
    // ==========================================
    return (
        <div className="qcto-card">
            {/* TABS NAVIGATION */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-light-blue)' }}>
                {LESSON_TABS.map(tab => {
                    const TabIcon = tab.icon;
                    const isActive = activeLessonTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveLessonTab(tab.key)}
                            style={{
                                padding: '10px 14px',
                                background: isActive ? 'var(--mlab-blue)' : 'transparent',
                                border: 'none',
                                color: isActive ? 'white' : 'var(--mlab-blue)',
                                fontWeight: 800,
                                fontSize: '0.75rem',
                                fontFamily: 'var(--font-heading)',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                borderRadius: '0px',
                                outline: 'none'
                            }}
                        >
                            <TabIcon size={13} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* TAB CONTENT AREA */}
            <div style={{ padding: '16px', minHeight: '320px', display: 'flex', flexDirection: 'column' }}>

                {/* 1. NOTES TAB */}
                {activeLessonTab === 'notes' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Your Personal Workspace</span>
                            <button
                                type="button"
                                onClick={handleSaveNotes}
                                disabled={isSavingNotes || isNotesLoading}
                                style={{ color: noteSavedFeedback ? '#15803d' : 'var(--mlab-blue)', background: 'transparent', border: 'none', fontWeight: 800, cursor: 'pointer' }}
                            >
                                {isSavingNotes ? 'Saving...' : noteSavedFeedback ? '✓ Saved!' : 'Save Note'}
                            </button>
                        </div>
                        {isNotesLoading ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '8px' }}>
                                <Loader2 size={16} className="lfm-spin" /> Fetching your personal notes...
                            </div>
                        ) : (
                            <textarea
                                value={learnerNotes}
                                onChange={(e) => setLearnerNotes(e.target.value)}
                                placeholder="Type your personal notes here while watching the video... (These are private to you)"
                                style={{ width: '100%', flex: 1, padding: '12px', fontSize: '0.8rem', background: '#f8fafc', border: '1px solid #cbd5e1', outline: 'none', resize: 'none' }}
                            />
                        )}
                    </div>
                )}

                {/* 2. COMMENTS TAB */}
                {activeLessonTab === 'comments' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                        <div style={{ flex: 1, maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                            {comments.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', padding: '30px 0' }}>
                                    No comments yet for this timeline. Start the discussion!
                                </div>
                            ) : (
                                comments.map(comment => (
                                    <div key={comment.id} style={{ display: 'flex', gap: '10px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '0px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
                                            {comment.userInitials}
                                        </div>
                                        <div style={{ flex: 1, background: '#f8fafc', padding: '10px', border: '1px solid var(--mlab-border)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                                    {comment.userName}
                                                </span>
                                                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                                    {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleDateString() : 'Just now'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
                                                {comment.text}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Input Area */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', borderTop: '1px solid var(--mlab-border)', paddingTop: '14px', marginTop: 'auto' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '0px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
                                YOU
                            </div>
                            <input
                                type="text"
                                placeholder="Ask a question or leave a comment..."
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                                className="pfm-input"
                                style={{ flex: 1, padding: '8px 12px', borderRadius: '0px', outline: 'none' }}
                                disabled={isPostingComment}
                            />
                            <button
                                type="button"
                                onClick={handlePostComment}
                                disabled={isPostingComment || !newComment.trim()}
                                className="lfm-btn lfm-btn--primary"
                                style={{ borderRadius: '0px', opacity: (isPostingComment || !newComment.trim()) ? 0.5 : 1 }}
                            >
                                {isPostingComment ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />}
                            </button>
                        </div>
                    </div>
                )}

                {/* 3. QA TAB */}
                {activeLessonTab === 'qa' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>

                        {/* LIST MODE */}
                        {qaViewMode === 'list' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        Lesson Discussion ({questions.length})
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setQaViewMode('ask')}
                                        className="lfm-btn lfm-btn--primary"
                                        style={{ padding: '4px 12px', fontSize: '0.72rem', borderRadius: '0px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Plus size={13} /> Ask Question
                                    </button>
                                </div>

                                <div style={{ flex: 1, maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
                                    {questions.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)' }}>
                                            <HelpCircle size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                            <p style={{ margin: 0, fontSize: '0.82rem' }}>Have a question about this lesson? Be the first to ask!</p>
                                        </div>
                                    ) : (
                                        questions.map(q => (
                                            <div
                                                key={q.id}
                                                onClick={() => {
                                                    setSelectedQuestion(q);
                                                    setShowMockAiAnswer(false);
                                                    setQaViewMode('detail');
                                                }}
                                                style={{
                                                    padding: '12px 16px',
                                                    border: '1px solid var(--mlab-border)',
                                                    background: '#ffffff',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px',
                                                    transition: 'border-color 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--mlab-blue)'}
                                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--mlab-border)'}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                                                        {q.title}
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', background: (q.answersCount || 0) > 0 ? '#dcfce7' : '#f1f5f9', color: (q.answersCount || 0) > 0 ? '#15803d' : '#64748b', padding: '2px 8px', fontWeight: 800 }}>
                                                        {q.answersCount || 0} Answers
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span>Asked by <strong>{q.userName}</strong></span>
                                                    <span>•</span>
                                                    <span>{q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ASK QUESTION MODE */}
                        {qaViewMode === 'ask' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--mlab-border)', paddingBottom: '10px' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        Draft Your Question
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setQaViewMode('list')}
                                        style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700 }}
                                    >
                                        Cancel
                                    </button>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        Question Title / Subject
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. How does the useEffect hook cleanup work here?"
                                        value={questionTitle}
                                        onChange={(e) => setQuestionTitle(e.target.value)}
                                        className="pfm-input"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '0px', outline: 'none' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        Detailed Description &amp; Code Snippets
                                    </label>
                                    <div style={{ background: '#ffffff' }}>
                                        <ReactQuill
                                            theme="snow"
                                            value={questionBody}
                                            onChange={setQuestionTitleBody}
                                            modules={QUILL_QA_MODULES}
                                            placeholder="Provide context, error messages, or code samples..."
                                            style={{ height: '180px', marginBottom: '40px' }}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handlePostQuestion}
                                    disabled={isSubmittingQA || !questionTitle.trim() || !questionBody.trim()}
                                    className="lfm-btn lfm-btn--green"
                                    style={{ alignSelf: 'flex-end', padding: '6px 16px', fontSize: '0.78rem', opacity: (!questionTitle.trim() || !questionBody.trim() || isSubmittingQA) ? 0.5 : 1, marginTop: 'auto' }}
                                >
                                    {isSubmittingQA ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} Submit Question
                                </button>
                            </div>
                        )}

                        {/* QUESTION DETAIL & REPLY MODE */}
                        {qaViewMode === 'detail' && selectedQuestion && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedQuestion(null);
                                            setShowMockAiAnswer(false);
                                            setQaViewMode('list');
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--mlab-blue)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', padding: 0 }}
                                    >
                                        <ArrowLeft size={13} /> Back
                                    </button>

                                    {!showMockAiAnswer && (
                                        <button
                                            type="button"
                                            onClick={handleTriggerMockAi}
                                            disabled={isAiThinking}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #c4b5fd',
                                                color: '#6d28d9',
                                                fontSize: '0.7rem',
                                                fontWeight: 800,
                                                cursor: isAiThinking ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                fontFamily: 'var(--font-heading)',
                                                textTransform: 'uppercase',
                                                padding: '4px 10px',
                                                transition: 'all 0.2s',
                                                opacity: isAiThinking ? 0.6 : 1
                                            }}
                                        >
                                            {isAiThinking ? (
                                                <><Loader2 size={12} className="lfm-spin" /> Analyzing...</>
                                            ) : (
                                                <><Zap size={12} /> Ask AI Assistant</>
                                            )}
                                        </button>
                                    )}
                                </div>

                                <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '16px' }}>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', marginBottom: '8px' }}>
                                        {selectedQuestion.title}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '12px', display: 'flex', gap: '8px' }}>
                                        <span>Asked by <strong>{selectedQuestion.userName}</strong></span>
                                        <span>•</span>
                                        <span>{selectedQuestion.createdAt?.toDate ? selectedQuestion.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                                        <QuillHTMLViewer html={selectedQuestion.contentHtml} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <MessageSquare size={14} /> Answers ({questionAnswers.length})
                                    </span>

                                    {/* MOCK AI ANSWER */}
                                    {showMockAiAnswer && (
                                        <div style={{ display: 'flex', gap: '10px', paddingLeft: '12px', borderLeft: '3px solid #8b5cf6', marginBottom: '8px' }}>
                                            <div style={{ flex: 1, background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '12px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6d28d9', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                                                        <Bot size={14} /> mLab AI Assistant
                                                    </span>
                                                    <span style={{ fontSize: '0.65rem', color: '#8b5cf6', fontWeight: 700 }}>
                                                        ✨ Instant Reply
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.82rem', color: '#4c1d95', lineHeight: 1.6 }}>
                                                    <p style={{ margin: '0 0 8px 0' }}>Hi <strong>{selectedQuestion.userName}</strong>, based on your question, it looks like you are asking about <strong>{selectedQuestion.title}</strong>.</p>
                                                    <div style={{ background: '#ede9fe', border: '1px dashed #c4b5fd', padding: '10px', marginBottom: '8px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                        // Interactive code execution block
                                                    </div>
                                                    <p style={{ margin: 0 }}>Does this resolve your issue? A human facilitator has also been notified of your question.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* REAL ANSWERS */}
                                    {questionAnswers.length === 0 && !showMockAiAnswer ? (
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
                                            No replies posted yet.
                                        </div>
                                    ) : (
                                        questionAnswers.map(ans => (
                                            <div key={ans.id} style={{ display: 'flex', gap: '10px', paddingLeft: '12px', borderLeft: '3px solid var(--mlab-blue)' }}>
                                                <div style={{ flex: 1, background: '#ffffff', border: '1px solid var(--mlab-border)', padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                                                            {ans.userName} {ans.isStaff && <span style={{ color: '#059669', fontSize: '0.65rem' }}>(Staff)</span>}
                                                        </span>
                                                        <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                                            {ans.createdAt?.toDate ? ans.createdAt.toDate().toLocaleDateString() : 'Just now'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.82rem', color: '#334155' }}>
                                                        <QuillHTMLViewer html={ans.contentHtml} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '14px', marginTop: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue)', marginBottom: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        Post Your Reply / Solution
                                    </label>
                                    <div style={{ background: '#ffffff', marginBottom: '40px' }}>
                                        <ReactQuill
                                            theme="snow"
                                            value={answerBody}
                                            onChange={setAnswerBody}
                                            modules={QUILL_QA_MODULES}
                                            placeholder="Type your response or solution here..."
                                            style={{ height: '120px' }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handlePostAnswer}
                                        disabled={isSubmittingQA || !answerBody.trim()}
                                        className="lfm-btn lfm-btn--primary"
                                        style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: '0.75rem', opacity: (!answerBody.trim() || isSubmittingQA) ? 0.5 : 1, borderRadius: '0px' }}
                                    >
                                        {isSubmittingQA ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} Post Reply
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 4. ATTACHMENTS TAB */}
                {activeLessonTab === 'attachments' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Lesson &amp; Course Resources ({allAttachments.length})
                            </span>
                        </div>

                        {allAttachments.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)', flex: 1 }}>
                                <Paperclip size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                <p style={{ margin: 0, fontSize: '0.82rem' }}>No attachments available for this lesson or course timeline.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', overflowY: 'auto', maxHeight: '380px' }}>
                                {allAttachments.map((att, idx) => {
                                    const ext = (att.fileType || att.name?.split('.').pop() || 'file').toLowerCase();
                                    const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(ext);
                                    const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'zip'].includes(ext);

                                    return (
                                        <a
                                            key={att.id || idx}
                                            href={att.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', border: '1px solid var(--mlab-border)', textDecoration: 'none', color: 'inherit', transition: 'background-color 0.2s ease', gap: '12px' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: 1 }}>
                                                <div style={{ width: '36px', height: '36px', background: isSpreadsheet ? '#d1fae5' : isCode ? '#f3e8ff' : '#e0f2fe', color: isSpreadsheet ? '#059669' : isCode ? '#7c3aed' : '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                                    {isSpreadsheet ? <FileSpreadsheet size={18} /> : isCode ? <FileCode size={18} /> : <FileText size={18} />}
                                                </div>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--mlab-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {att.name}
                                                    </div>
                                                    {att.description && (
                                                        <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '2px', marginBottom: '3px', lineHeight: 1.35, fontWeight: 500 }}>
                                                            {att.description}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                                                        {ext.toUpperCase()} • {att.fileSize ? `${(att.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Downloadable File'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--mlab-blue)', color: 'white', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
                                                <Download size={12} /> Download
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* 5. RELATED TAB */}
                {activeLessonTab === 'related' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Supplemental Resources
                            </span>
                        </div>

                        {!currentActiveUnit.relatedLinks || currentActiveUnit.relatedLinks?.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px solid var(--mlab-border)', flex: 1 }}>
                                <Sparkles size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                <p style={{ margin: 0, fontSize: '0.82rem' }}>No supplemental resources have been added to this lesson yet.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', overflowY: 'auto', maxHeight: '380px' }}>
                                {(currentActiveUnit.relatedLinks || []).map((link, idx) => {
                                    let domain = 'External Link';
                                    try { domain = new URL(link.url).hostname.replace('www.', ''); } catch (e) { }

                                    return (
                                        <a
                                            key={idx}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                                                background: '#f8fafc', border: '1px solid var(--mlab-border)',
                                                textDecoration: 'none', color: 'inherit', transition: 'background-color 0.2s ease'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                                        >
                                            <div style={{ width: '32px', height: '32px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <ExternalLink size={16} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {link.title || 'Supplemental Resource'}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                                                    {link.type || 'Resource'} • {domain}
                                                </div>
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};