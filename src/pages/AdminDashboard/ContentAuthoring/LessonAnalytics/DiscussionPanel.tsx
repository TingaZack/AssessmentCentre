// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/DiscussionPanel.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
    collection, addDoc, doc, updateDoc, onSnapshot, setDoc,
    query, where, serverTimestamp
} from 'firebase/firestore';
import {
    MessageSquare, HelpCircle, Send, CheckCircle2, Clock,
    ArrowLeft, Shield, Loader2, MessageCircle, Check, Filter,
    CheckCheck, Bell
} from 'lucide-react';
import { db, auth } from '../../../../lib/firebase';
import { useToast } from '../../../../components/common/Toast/Toast';
import { QuillHTMLViewer } from '../../../../components/common/QuillHTMLViewer/QuillHTMLViewer';
import type { LessonComment, LessonQuestion } from './types';

interface LessonAnswer {
    id: string;
    questionId: string;
    unitId: string;
    containerId?: string;
    userId: string;
    userName: string;
    userInitials?: string;
    contentHtml: string;
    createdAt?: any;
    isStaff?: boolean;
}

interface Props {
    unitId: string;
    postContainerId: string;
    courseId: string;
    comments: LessonComment[];
    questions: LessonQuestion[];
    focusQuestionId?: string | null;
    onFocusHandled?: () => void;
}

type QAFilter = 'all' | 'unanswered' | 'answered' | 'staff_replied' | 'resolved';
type CommentFilter = 'all' | 'unread';

export const DiscussionPanel: React.FC<Props> = ({
    unitId,
    postContainerId,
    courseId,
    comments,
    questions,
    focusQuestionId,
    onFocusHandled
}) => {
    const toast = useToast();

    // ── Active Discussion Tab ───────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<'comments' | 'qa'>('comments');

    // ── Filters & Tracking State ────────────────────────────────────────────
    const [qaFilter, setQaFilter] = useState<QAFilter>('all');
    const [commentFilter, setCommentFilter] = useState<CommentFilter>('all');
    const [lastReadTime, setLastReadTime] = useState<number>(0);

    // ── Comments State ──────────────────────────────────────────────────────
    const [newComment, setNewComment] = useState('');
    const [isPostingComment, setIsPostingComment] = useState(false);

    // ── Q&A State ───────────────────────────────────────────────────────────
    const [selectedQuestion, setSelectedQuestion] = useState<LessonQuestion | null>(null);
    const [answers, setAnswers] = useState<LessonAnswer[]>([]);
    const [newAnswer, setNewAnswer] = useState('');
    const [isPostingAnswer, setIsPostingAnswer] = useState(false);
    const [isTogglingResolved, setIsTogglingResolved] = useState(false);

    // Helper to extract timestamp from Firestore document
    const getDocTime = (c: any) => c.createdAt?.toDate ? c.createdAt.toDate().getTime() : (c.createdAt?.seconds ? c.createdAt.seconds * 1000 : 0);

    // 🚀 CROSS-DEVICE FIRESTORE READ STATE LISTENERS + LOCALSTORAGE FALLBACK
    useEffect(() => {
        const uid = auth.currentUser?.uid;
        if (!uid || !unitId) return;

        // 1. Instant fallback from localStorage
        const localSaved = localStorage.getItem(`mlab_comments_read_${unitId}_${uid}`);
        if (localSaved) setLastReadTime(Number(localSaved));

        // 2. Realtime listener to Firestore read state for cross-device sync
        const readDocRef = doc(db, 'discussion_read_states', `${uid}_${unitId}`);
        const unsubscribe = onSnapshot(readDocRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const timeMs = data.lastReadAt?.toDate ? data.lastReadAt.toDate().getTime() : (data.lastReadTimeMs || 0);
                if (timeMs > 0) {
                    setLastReadTime(timeMs);
                    localStorage.setItem(`mlab_comments_read_${unitId}_${uid}`, timeMs.toString());
                }
            }
        }, (err) => {
            console.warn('[DiscussionPanel] Read state snapshot warning:', err);
        });

        return () => unsubscribe();
    }, [unitId, auth.currentUser?.uid]);

    // Persist read state to Firestore and LocalStorage
    const markReadInDatabase = async (timeMs: number) => {
        const uid = auth.currentUser?.uid;
        if (!uid || !unitId) return;

        setLastReadTime(timeMs);
        localStorage.setItem(`mlab_comments_read_${unitId}_${uid}`, timeMs.toString());

        try {
            const readDocRef = doc(db, 'discussion_read_states', `${uid}_${unitId}`);
            await setDoc(readDocRef, {
                userId: uid,
                unitId: unitId,
                lastReadAt: serverTimestamp(),
                lastReadTimeMs: timeMs
            }, { merge: true });
        } catch (err) {
            console.warn('[DiscussionPanel] Failed to save read state to database:', err);
        }
    };

    // 🚀 AUTOMATICALLY MARK AS READ WHEN VIEWING COMMENTS TAB
    useEffect(() => {
        if (activeTab === 'comments' && comments.length > 0) {
            const latestCommentTime = Math.max(...comments.map(c => getDocTime(c)), Date.now());

            if (latestCommentTime > lastReadTime) {
                const timer = setTimeout(() => {
                    markReadInDatabase(latestCommentTime);
                }, 600);

                return () => clearTimeout(timer);
            }
        }
    }, [activeTab, comments, unitId, lastReadTime]);

    // Handle focusing a specific question thread when triggered from drawer/analytics
    useEffect(() => {
        if (focusQuestionId) {
            const found = questions.find(q => q.id === focusQuestionId);
            if (found) {
                setSelectedQuestion(found);
                setActiveTab('qa');
                if (onFocusHandled) onFocusHandled();
            }
        }
    }, [focusQuestionId, questions, onFocusHandled]);

    // Live Snapshot listener for answers to the selected question thread
    useEffect(() => {
        if (!selectedQuestion?.id) {
            setAnswers([]);
            return;
        }

        const q = query(
            collection(db, 'lessonQuestionAnswers'),
            where('questionId', '==', selectedQuestion.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LessonAnswer));
            fetched.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeA - timeB;
            });
            setAnswers(fetched);
        }, (err) => {
            console.warn('[DiscussionPanel] Answers snapshot warning:', err);
        });

        return () => unsubscribe();
    }, [selectedQuestion?.id]);

    // ── Computed & Filtered Data ────────────────────────────────────────────

    const unreadCount = useMemo(() => {
        return comments.filter(c => !c.isStaff && getDocTime(c) > lastReadTime).length;
    }, [comments, lastReadTime]);

    const filteredComments = useMemo(() => {
        const sorted = [...comments].sort((a, b) => getDocTime(a) - getDocTime(b));
        if (commentFilter === 'unread') {
            return sorted.filter(c => !c.isStaff && getDocTime(c) > lastReadTime);
        }
        return sorted;
    }, [comments, commentFilter, lastReadTime]);

    const filteredQuestions = useMemo(() => {
        return questions.filter(q => {
            const answerCount = q.answersCount || 0;
            if (qaFilter === 'unanswered') return answerCount === 0;
            if (qaFilter === 'answered') return answerCount > 0;
            if (qaFilter === 'staff_replied') return q.hasStaffReply === true;
            if (qaFilter === 'resolved') return q.isResolved === true;
            return true;
        });
    }, [questions, qaFilter]);

    const unansweredCount = questions.filter(q => !(q.answersCount && q.answersCount > 0)).length;

    // ── Action Handlers ─────────────────────────────────────────────────────

    const handleMarkAllRead = async () => {
        const now = Date.now();
        await markReadInDatabase(now);
        toast.success('All comments marked as read.');
        setCommentFilter('all');
    };

    // Post a Staff Comment
    const handlePostComment = async () => {
        if (!newComment.trim()) return;
        const currentUser = auth.currentUser;
        if (!currentUser) {
            toast.error('You must be logged in to comment.');
            return;
        }

        setIsPostingComment(true);
        try {
            const userEmail = currentUser.email || 'Staff';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonComments'), {
                unitId,
                containerId: postContainerId,
                courseId,
                userId: currentUser.uid,
                userName,
                userInitials: initials,
                text: newComment.trim(),
                isStaff: true,
                createdAt: serverTimestamp()
            });

            setNewComment('');
            toast.success('Staff comment posted.');

            if (unreadCount > 0) await handleMarkAllRead();

        } catch (err) {
            console.error('[DiscussionPanel] Error posting comment:', err);
            toast.error('Failed to post comment.');
        } finally {
            setIsPostingComment(false);
        }
    };

    // Post a Staff Answer to Q&A Thread
    const handlePostAnswer = async () => {
        if (!newAnswer.trim() || !selectedQuestion?.id) return;
        const currentUser = auth.currentUser;
        if (!currentUser) {
            toast.error('You must be logged in to answer.');
            return;
        }

        setIsPostingAnswer(true);
        try {
            const userEmail = currentUser.email || 'Staff';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonQuestionAnswers'), {
                questionId: selectedQuestion.id,
                unitId,
                containerId: postContainerId,
                userId: currentUser.uid,
                userName,
                userInitials: initials,
                contentHtml: `<p>${newAnswer.trim().replace(/\n/g, '<br/>')}</p>`,
                isStaff: true,
                createdAt: serverTimestamp()
            });

            const qRef = doc(db, 'lessonQuestions', selectedQuestion.id);
            await updateDoc(qRef, {
                hasStaffReply: true,
                lastActivityAt: serverTimestamp()
            });

            setNewAnswer('');
            toast.success('Official staff answer posted.');
        } catch (err) {
            console.error('[DiscussionPanel] Error posting answer:', err);
            toast.error('Failed to post answer.');
        } finally {
            setIsPostingAnswer(false);
        }
    };

    // Toggle Question Resolution Status
    const handleToggleResolution = async () => {
        if (!selectedQuestion?.id) return;
        setIsTogglingResolved(true);
        try {
            const nextStatus = !selectedQuestion.isResolved;
            await updateDoc(doc(db, 'lessonQuestions', selectedQuestion.id), {
                isResolved: nextStatus,
                lastActivityAt: serverTimestamp()
            });
            setSelectedQuestion(prev => prev ? { ...prev, isResolved: nextStatus } : null);
            toast.success(nextStatus ? 'Thread marked as Resolved.' : 'Thread reopened.');
        } catch (err) {
            toast.error('Failed to update resolution status.');
        } finally {
            setIsTogglingResolved(false);
        }
    };

    return (
        <div style={{ background: '#ffffff', border: '1px solid var(--mlab-border, #dde4e8)', borderRadius: '0px', display: 'flex', flexDirection: 'column' }}>

            {/* SEGMENTED TAB HEADER */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--mlab-blue, #073f4e)', background: '#f8fafc' }}>
                <button
                    type="button"
                    onClick={() => { setActiveTab('comments'); setSelectedQuestion(null); }}
                    style={{
                        padding: '12px 20px',
                        background: activeTab === 'comments' ? 'var(--mlab-blue, #073f4e)' : 'transparent',
                        color: activeTab === 'comments' ? '#ffffff' : 'var(--mlab-blue, #073f4e)',
                        border: 'none',
                        fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderRadius: '0px'
                    }}
                >
                    <MessageSquare size={15} /> Lesson Comments ({comments.length})
                    {unreadCount > 0 && (
                        <span style={{
                            background: activeTab === 'comments' ? '#f59e0b' : '#fef3c7',
                            color: activeTab === 'comments' ? '#ffffff' : '#b45309',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '2px',
                            marginLeft: '4px'
                        }}>
                            {unreadCount} Unread
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('qa')}
                    style={{
                        padding: '12px 20px',
                        background: activeTab === 'qa' ? 'var(--mlab-blue, #073f4e)' : 'transparent',
                        color: activeTab === 'qa' ? '#ffffff' : 'var(--mlab-blue, #073f4e)',
                        border: 'none',
                        fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderRadius: '0px'
                    }}
                >
                    <HelpCircle size={15} /> Questions &amp; Answers ({questions.length})
                    {unansweredCount > 0 && (
                        <span style={{
                            background: activeTab === 'qa' ? '#f59e0b' : '#fef3c7',
                            color: activeTab === 'qa' ? '#ffffff' : '#b45309',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '2px',
                            marginLeft: '4px'
                        }}>
                            {unansweredCount} Unanswered
                        </span>
                    )}
                </button>
            </div>

            {/* TAB CONTENT BODY */}
            <div style={{ padding: '20px', minHeight: '380px', display: 'flex', flexDirection: 'column' }}>

                {/* ═════════════════ TAB 1: COMMENTS STREAM ═════════════════ */}
                {activeTab === 'comments' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>

                        {/* COMMENTS FILTER & ACTIONS BAR */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                                    <Filter size={12} /> Filter:
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCommentFilter('all')}
                                    style={{
                                        padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s ease',
                                        border: commentFilter === 'all' ? '1px solid var(--mlab-blue, #073f4e)' : '1px solid #cbd5e1',
                                        background: commentFilter === 'all' ? 'var(--mlab-blue, #073f4e)' : '#ffffff',
                                        color: commentFilter === 'all' ? '#ffffff' : '#475569'
                                    }}
                                >
                                    All ({comments.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCommentFilter('unread')}
                                    style={{
                                        padding: '4px 10px', fontSize: '0.7rem', fontWeight: 800, fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s ease',
                                        border: commentFilter === 'unread' ? '1px solid var(--mlab-blue, #073f4e)' : '1px solid #cbd5e1',
                                        background: commentFilter === 'unread' ? 'var(--mlab-blue, #073f4e)' : '#ffffff',
                                        color: commentFilter === 'unread' ? '#ffffff' : '#475569'
                                    }}
                                >
                                    Unread ({unreadCount})
                                </button>
                            </div>

                            {unreadCount > 0 && (
                                <button
                                    type="button"
                                    onClick={handleMarkAllRead}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 800, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}
                                >
                                    <CheckCheck size={12} /> Mark All Read
                                </button>
                            )}
                        </div>

                        <div style={{ flex: 1, maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px', paddingLeft: '12px', marginLeft: '-12px' }}>
                            {filteredComments.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                                    <MessageSquare size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                    <p style={{ margin: 0, fontSize: '0.85rem' }}>No comments match your filter.</p>
                                </div>
                            ) : (
                                filteredComments.map(comment => {
                                    const isUnread = !comment.isStaff && getDocTime(comment) > lastReadTime;

                                    return (
                                        <div key={comment.id} style={{ display: 'flex', gap: '12px', borderLeft: isUnread ? '3px solid #f59e0b' : '3px solid transparent', paddingLeft: isUnread ? '9px' : '12px', marginLeft: '-12px', transition: 'all 0.2s ease' }}>
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                background: comment.isStaff ? 'var(--mlab-blue, #073f4e)' : '#e0f2fe',
                                                color: comment.isStaff ? '#ffffff' : '#0284c7',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.75rem',
                                                fontWeight: 800,
                                                fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                                flexShrink: 0
                                            }}>
                                                {comment.userInitials || 'LN'}
                                            </div>
                                            <div style={{
                                                flex: 1,
                                                background: comment.isStaff ? '#f0fdf4' : (isUnread ? '#fffbeb' : '#f8fafc'),
                                                border: `1px solid ${comment.isStaff ? '#bbf7d0' : (isUnread ? '#fde68a' : '#e2e8f0')}`,
                                                padding: '12px 16px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {comment.userName}
                                                        {comment.isStaff && <span style={{ fontSize: '0.62rem', background: '#15803d', color: '#ffffff', padding: '1px 6px', fontWeight: 800 }}><Shield size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> Staff</span>}
                                                        {isUnread && <span style={{ fontSize: '0.62rem', background: '#f59e0b', color: '#ffffff', padding: '1px 6px', fontWeight: 800, borderRadius: '2px' }}><Bell size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> Unread</span>}
                                                    </span>
                                                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                        {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleDateString() : 'Recently'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>
                                                    {comment.text}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* STAFF COMMENT POST BOX */}
                        <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px', marginTop: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="Post an official staff comment or guidance..."
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                                style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem', border: '1px solid #cbd5e1', outline: 'none', background: '#ffffff' }}
                                disabled={isPostingComment}
                            />
                            <button
                                type="button"
                                onClick={handlePostComment}
                                disabled={isPostingComment || !newComment.trim()}
                                style={{
                                    background: 'var(--mlab-blue, #073f4e)',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '10px 18px',
                                    fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                    fontSize: '0.8rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    cursor: (isPostingComment || !newComment.trim()) ? 'not-allowed' : 'pointer',
                                    opacity: (isPostingComment || !newComment.trim()) ? 0.5 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                {isPostingComment ? <Loader2 size={14} className="lfm-spin" /> : <Send size={14} />} Post Staff Comment
                            </button>
                        </div>
                    </div>
                )}

                {/* ═════════════════ TAB 2: QUESTIONS & ANSWERS (Q&A) ═════════════════ */}
                {activeTab === 'qa' && (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

                        {/* VIEW 1: Q&A THREAD LIST WITH FILTERS */}
                        {!selectedQuestion && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>

                                {/* Q&A FILTER PILLS BAR */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                                        <Filter size={12} /> Filter Threads:
                                    </span>

                                    {[
                                        { id: 'all', label: `All (${questions.length})` },
                                        { id: 'unanswered', label: `Unanswered (${questions.filter(q => !(q.answersCount && q.answersCount > 0)).length})` },
                                        { id: 'answered', label: `Answered (${questions.filter(q => q.answersCount && q.answersCount > 0).length})` },
                                        { id: 'staff_replied', label: `Staff Replied (${questions.filter(q => q.hasStaffReply).length})` },
                                        { id: 'resolved', label: `Resolved (${questions.filter(q => q.isResolved).length})` }
                                    ].map(f => {
                                        const isActive = qaFilter === f.id;
                                        return (
                                            <button
                                                key={f.id}
                                                type="button"
                                                onClick={() => setQaFilter(f.id as QAFilter)}
                                                style={{
                                                    padding: '4px 10px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                                    textTransform: 'uppercase',
                                                    border: isActive ? '1px solid var(--mlab-blue, #073f4e)' : '1px solid #cbd5e1',
                                                    background: isActive ? 'var(--mlab-blue, #073f4e)' : '#ffffff',
                                                    color: isActive ? '#ffffff' : '#475569',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {f.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* THREAD LIST */}
                                <div style={{ flex: 1, maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
                                    {filteredQuestions.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94a3b8', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                                            <HelpCircle size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>No Q&amp;A threads match the selected filter.</p>
                                        </div>
                                    ) : (
                                        filteredQuestions.map(q => (
                                            <div
                                                key={q.id}
                                                onClick={() => setSelectedQuestion(q)}
                                                style={{
                                                    padding: '14px 18px',
                                                    border: '1px solid #e2e8f0',
                                                    background: '#ffffff',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px',
                                                    transition: 'border-color 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--mlab-blue, #073f4e)'}
                                                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                                        {q.title}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        {q.isResolved ? (
                                                            <span style={{ fontSize: '0.62rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <CheckCircle2 size={10} /> Resolved
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.62rem', background: '#fef3c7', color: '#b45309', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <Clock size={10} /> Open
                                                            </span>
                                                        )}
                                                        {q.hasStaffReply && (
                                                            <span style={{ fontSize: '0.62rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading, "Oswald", sans-serif)' }}>
                                                                Staff Replied
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: '0.68rem', background: (q.answersCount || 0) > 0 ? '#f1f5f9' : '#fef3c7', color: (q.answersCount || 0) > 0 ? '#475569' : '#b45309', padding: '2px 8px', fontWeight: 800 }}>
                                                            {q.answersCount || 0} Answers
                                                        </span>
                                                    </div>
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

                        {/* VIEW 2: SELECTED Q&A THREAD DETAIL */}
                        {selectedQuestion && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, maxHeight: '460px', overflowY: 'auto', paddingRight: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedQuestion(null)}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--mlab-blue, #073f4e)', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase', padding: 0 }}
                                    >
                                        <ArrowLeft size={14} /> Back to Thread List
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleToggleResolution}
                                        disabled={isTogglingResolved}
                                        style={{
                                            background: selectedQuestion.isResolved ? '#fef3c7' : '#dcfce7',
                                            color: selectedQuestion.isResolved ? '#b45309' : '#15803d',
                                            border: `1px solid ${selectedQuestion.isResolved ? '#fcd34d' : '#86efac'}`,
                                            padding: '4px 12px',
                                            fontSize: '0.72rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                            textTransform: 'uppercase',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        {isTogglingResolved ? <Loader2 size={12} className="lfm-spin" /> : <Check size={12} />}
                                        {selectedQuestion.isResolved ? 'Reopen Thread' : 'Mark Thread Resolved'}
                                    </button>
                                </div>

                                {/* QUESTION BODY CARD */}
                                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '16px' }}>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', marginBottom: '6px', textTransform: 'uppercase' }}>
                                        {selectedQuestion.title}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '12px', display: 'flex', gap: '8px' }}>
                                        <span>Asked by <strong>{selectedQuestion.userName}</strong></span>
                                        <span>•</span>
                                        <span>{selectedQuestion.createdAt?.toDate ? selectedQuestion.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                                        <QuillHTMLViewer html={selectedQuestion.contentHtml} />
                                    </div>
                                </div>

                                {/* ANSWERS LIST */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <MessageCircle size={14} /> Official Answers &amp; Staff Responses ({answers.length})
                                    </span>

                                    {answers.length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
                                            No answers posted yet. Post an official staff response below.
                                        </div>
                                    ) : (
                                        answers.map(ans => (
                                            <div key={ans.id} style={{ display: 'flex', gap: '10px', paddingLeft: '12px', borderLeft: `3px solid ${ans.isStaff ? '#16a34a' : 'var(--mlab-blue, #073f4e)'}` }}>
                                                <div style={{ flex: 1, background: ans.isStaff ? '#f0fdf4' : '#ffffff', border: `1px solid ${ans.isStaff ? '#bbf7d0' : '#e2e8f0'}`, padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {ans.userName} {ans.isStaff && <span style={{ fontSize: '0.62rem', background: '#15803d', color: '#ffffff', padding: '1px 6px', fontWeight: 800 }}><Shield size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> Staff Reply</span>}
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

                                {/* STAFF ANSWER BOX */}
                                <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '14px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--mlab-blue, #073f4e)', fontFamily: 'var(--font-heading, "Oswald", sans-serif)', textTransform: 'uppercase' }}>
                                        Post Official Staff Answer
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Type official guidance or solution to resolve this learner's query..."
                                        value={newAnswer}
                                        onChange={(e) => setNewAnswer(e.target.value)}
                                        style={{ width: '100%', padding: '10px', fontSize: '0.82rem', border: '1px solid #cbd5e1', outline: 'none', background: '#ffffff', resize: 'vertical' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={handlePostAnswer}
                                        disabled={isPostingAnswer || !newAnswer.trim()}
                                        style={{
                                            alignSelf: 'flex-end',
                                            background: '#16a34a',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '8px 18px',
                                            fontFamily: 'var(--font-heading, "Oswald", sans-serif)',
                                            fontSize: '0.78rem',
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            cursor: (isPostingAnswer || !newAnswer.trim()) ? 'not-allowed' : 'pointer',
                                            opacity: (isPostingAnswer || !newAnswer.trim()) ? 0.5 : 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        {isPostingAnswer ? <Loader2 size={13} className="lfm-spin" /> : <Send size={13} />} Post Staff Answer
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DiscussionPanel;