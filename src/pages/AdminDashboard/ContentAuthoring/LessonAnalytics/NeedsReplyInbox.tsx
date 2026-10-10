import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, increment, serverTimestamp } from 'firebase/firestore';
import { MessageSquare, CheckCircle2, Clock, Send, Loader2, ArrowRight, X, AlertCircle } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { db, auth } from '../../../../lib/firebase';
import { QuillHTMLViewer } from '../../../../components/common/QuillHTMLViewer/QuillHTMLViewer';
import type { LearnerAnswerDoc, LearnerQuestionDoc } from '../../../LearnerPortal/LearnerContentHub/CoursePlayerView';

interface NeedsReplyInboxProps {
    containerId: string;
    courseId: string;
    onClose: () => void;
    onJumpToLesson?: (unitId: string) => void;
}

export const NeedsReplyInbox: React.FC<NeedsReplyInboxProps> = ({
    containerId,
    courseId,
    onClose,
    onJumpToLesson
}) => {
    const [questions, setQuestions] = useState<LearnerQuestionDoc[]>([]);
    const [selectedQuestion, setSelectedQuestion] = useState<LearnerQuestionDoc | null>(null);
    const [answers, setAnswers] = useState<LearnerAnswerDoc[]>([]);
    const [replyBody, setReplyBody] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);

    // Stream all unanswered questions across lessons in this cohort
    useEffect(() => {
        setLoading(true);
        const q = query(
            collection(db, 'lessonQuestions'),
            where('containerId', '==', containerId),
            where('hasStaffReply', '==', false)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerQuestionDoc));
            list.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return timeA - timeB; // Oldest unanswered first
            });
            setQuestions(list);
            setLoading(false);
        }, (err) => {
            console.error('[NeedsReplyInbox] Snapshot error:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [containerId]);

    // Stream replies when a question is selected
    useEffect(() => {
        if (!selectedQuestion) {
            setAnswers([]);
            return;
        }

        const q = query(
            collection(db, 'lessonQuestionAnswers'),
            where('questionId', '==', selectedQuestion.id)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerAnswerDoc));
            list.sort((a, b) => {
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return timeA - timeB;
            });
            setAnswers(list);
        });

        return () => unsubscribe();
    }, [selectedQuestion]);

    const handleSendStaffReply = async () => {
        const currentUser = auth.currentUser;
        if (!replyBody.trim() || !selectedQuestion || !currentUser) return;

        setIsSubmitting(true);
        try {
            const userEmail = currentUser.email || 'Facilitator';
            const userName = currentUser.displayName || userEmail.split('@')[0];
            const initials = userName.substring(0, 2).toUpperCase();

            await addDoc(collection(db, 'lessonQuestionAnswers'), {
                questionId: selectedQuestion.id,
                unitId: selectedQuestion.unitId,
                containerId: containerId,
                userId: currentUser.uid,
                userName: userName,
                userInitials: initials,
                contentHtml: replyBody,
                isStaff: true,
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, 'lessonQuestions', selectedQuestion.id), {
                answersCount: increment(1),
                hasStaffReply: true,
                lastActivityAt: serverTimestamp()
            });

            setReplyBody('');
            setSelectedQuestion(null);
        } catch (err) {
            console.error('[NeedsReplyInbox] Reply submit error:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5, 46, 58, 0.72)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: '#ffffff', width: '100%', maxWidth: '1000px', height: '85vh', border: '3px solid #073f4e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ background: '#073f4e', padding: '16px 20px', borderBottom: '3px solid #94c73d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AlertCircle size={20} color="#fbbf24" />
                        <div>
                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Cohort Unanswered Q&amp;A Queue
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#bae6fd' }}>
                                {questions.length} question(s) awaiting facilitator response
                            </div>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedQuestion ? '360px 1fr' : '1fr', overflow: 'hidden' }}>

                    {/* Questions List */}
                    <div style={{ borderRight: selectedQuestion ? '1px solid #dde4e8' : 'none', overflowY: 'auto', background: '#f8fafc' }}>
                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#6b6b6b' }}>
                                <Loader2 size={24} className="lfm-spin" /> Loading queue...
                            </div>
                        ) : questions.length === 0 ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#15803d' }}>
                                <CheckCircle2 size={36} style={{ marginBottom: '12px' }} />
                                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '1.1rem', textTransform: 'uppercase' }}>All Caught Up!</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b6b6b', marginTop: '4px' }}>There are no unanswered learner questions in this intake.</div>
                            </div>
                        ) : (
                            questions.map(q => {
                                const isSelected = selectedQuestion?.id === q.id;
                                return (
                                    <div
                                        key={q.id}
                                        onClick={() => setSelectedQuestion(q)}
                                        style={{
                                            padding: '14px 16px',
                                            borderBottom: '1px solid #dde4e8',
                                            background: isSelected ? '#ffffff' : '#f8fafc',
                                            borderLeft: `4px solid ${isSelected ? '#073f4e' : 'transparent'}`,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', fontFamily: 'Oswald, sans-serif' }}>
                                            {q.unitTitle || `Unit: ${q.unitId}`}
                                        </div>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#073f4e', margin: '4px 0' }}>
                                            {q.title}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#6b6b6b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Asked by <strong>{q.userName}</strong></span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c2410c', fontWeight: 700 }}>
                                                <Clock size={11} /> Pending
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Detail & Reply Panel */}
                    {selectedQuestion && (
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#ffffff' }}>

                            {/* Question Header & Context */}
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #dde4e8', background: '#f0f4f6' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', fontFamily: 'Oswald, sans-serif' }}>
                                            Lesson Context
                                        </span>
                                        <h3 style={{ margin: '2px 0 0 0', fontSize: '1.1rem', color: '#073f4e', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase' }}>
                                            {selectedQuestion.unitTitle || selectedQuestion.unitId}
                                        </h3>
                                    </div>
                                    {onJumpToLesson && (
                                        <button
                                            type="button"
                                            onClick={() => onJumpToLesson(selectedQuestion.unitId)}
                                            style={{ background: 'none', border: '1px solid #073f4e', color: '#073f4e', fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}
                                        >
                                            Open Lesson <ArrowRight size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Thread Display */}
                            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ border: '1px solid #dde4e8', padding: '16px', background: '#ffffff' }}>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#073f4e', marginBottom: '6px' }}>
                                        {selectedQuestion.title}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#6b6b6b', marginBottom: '12px' }}>
                                        Asked by <strong>{selectedQuestion.userName}</strong>
                                    </div>
                                    <QuillHTMLViewer html={selectedQuestion.contentHtml} />
                                </div>

                                {answers.map(ans => (
                                    <div key={ans.id} style={{ paddingLeft: '16px', borderLeft: `3px solid ${ans.isStaff ? '#94c73d' : '#073f4e'}` }}>
                                        <div style={{ background: ans.isStaff ? '#f0f7e1' : '#f8fafc', padding: '12px', border: '1px solid #dde4e8' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#073f4e', marginBottom: '4px' }}>
                                                {ans.userName} {ans.isStaff && <span style={{ color: '#7aaa2e' }}>(Facilitator)</span>}
                                            </div>
                                            <QuillHTMLViewer html={ans.contentHtml} />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Staff Reply Box */}
                            <div style={{ padding: '16px 20px', borderTop: '2px solid #073f4e', background: '#ffffff' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#073f4e', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'Oswald, sans-serif' }}>
                                    Post Facilitator Response
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <ReactQuill
                                        theme="snow"
                                        value={replyBody}
                                        onChange={setReplyBody}
                                        placeholder="Type your official response..."
                                        style={{ height: '100px', marginBottom: '40px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={handleSendStaffReply}
                                        disabled={isSubmitting || !replyBody.trim()}
                                        style={{
                                            background: '#073f4e',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '8px 20px',
                                            fontFamily: 'Oswald, sans-serif',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            cursor: (isSubmitting || !replyBody.trim()) ? 'not-allowed' : 'pointer',
                                            opacity: (isSubmitting || !replyBody.trim()) ? 0.6 : 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        {isSubmitting ? <Loader2 size={14} className="lfm-spin" /> : <Send size={14} />}
                                        Submit Staff Reply
                                    </button>
                                </div>
                            </div>

                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};