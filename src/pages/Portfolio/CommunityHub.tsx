// src/components/views/ViewPortfolio/CommunityHub.tsx

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, getDocs, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
    Hash, Send, MessageSquare, Loader2, Bot, ShieldCheck, Plus, Lock, X,
    Paperclip, Bold, Italic, Code, Terminal, Check, Users, Search,
    UserPlus, UserMinus, ChevronUp, ChevronDown, FileText, Image, ExternalLink,
    Download, AtSign, Eye, CornerUpLeft, Share2, Maximize2
} from 'lucide-react';
import moment from 'moment';
import { storage } from '../../lib/firebase';

// Markdown & Syntax Highlighting
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { db } from '../../lib/firebase';

export interface CommunityHubProps {
    cohortId: string;
    user: {
        uid: string;
        fullName: string;
        role: string;
    };
    cohorts?: Array<{ id: string; name: string }>;
    onCohortChange?: (cohortId: string) => void;
}

export interface AttachmentItem {
    name: string;
    url: string;
    size: number;
    type: string;
}

interface ChatMessage {
    id: string;
    text: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    createdAt: any;
    attachments?: AttachmentItem[];
    mentions?: string[];

    // 1. Reactions (Emoji Map -> Array of user UIDs who clicked it)
    reactions?: Record<string, string[]>; // e.g. { "👍": ["uid1", "uid2"], "❤️": ["uid3"] }

    // 2. Quote Reply
    replyTo?: {
        id: string;
        senderName: string;
        text: string;
    };

    // 3. Forward Metadata
    forwardedFrom?: {
        channelName: string;
        originalSender: string;
    };
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB upload cap

// Helper: Format file sizes cleanly
const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Helper: Extract valid URLs cleanly without trailing punctuation and ignore code blocks
const extractUrls = (text: string): string[] => {
    if (!text) return [];
    // Strip code blocks and inline code so URLs inside snippets are ignored
    const stripped = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*?`/g, '');
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = stripped.match(urlRegex);
    if (!matches) return [];
    return Array.from(new Set(matches.map(url => url.replace(/[.,;:!?)]+$/, ''))));
};

interface Channel {
    id: string;
    name: string;
    isPrivate: boolean;
    isDirect?: boolean;
    members: string[];
    createdBy: string;
}

// Preserves line breaks and formats @Mentions into badges outside of code blocks
const formatChatText = (text: string, knownNames: string[] = []): string => {
    if (!text) return '';
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map(part => {
        if (part.startsWith('```')) return part;
        let formatted = part.replace(/\n/g, '  \n');

        // Wrap known mention names with [@Name](#mention) for Markdown rendering
        if (knownNames.length > 0) {
            knownNames.forEach(name => {
                if (!name.trim()) return;
                const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`@${escaped}(?![\\w])`, 'g');
                formatted = formatted.replace(regex, `[@${name.trim()}](#mention)`);
            });
        }
        return formatted;
    }).join('');
};

// ============================================================
// SKELETON LOADER COMPONENTS
// Stable-dimension placeholders that prevent layout shift while
// async data is still being fetched. Each skeleton reserves the
// exact same space the real content will occupy, so the surrounding
// UI never reflows when the data eventually arrives.
// ============================================================

// Inject shimmer keyframes once per page (idempotent mount)
const SkeletonStylesInjector: React.FC = () => (
    <style>{`
        @keyframes mlab-skeleton-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        .mlab-skeleton {
            background: linear-gradient(90deg, #e2e8f0 0%, #f1f5f9 50%, #e2e8f0 100%);
            background-size: 200% 100%;
            animation: mlab-skeleton-shimmer 1.4s ease-in-out infinite;
        }
        .mlab-skeleton--dark {
            background: linear-gradient(90deg, #1e293b 0%, #334155 50%, #1e293b 100%);
            background-size: 200% 100%;
            animation: mlab-skeleton-shimmer 1.4s ease-in-out infinite;
        }
        @keyframes mlab-fade-in {
            from { opacity: 0; transform: translateY(2px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .mlab-fade-in {
            animation: mlab-fade-in 0.25s ease-out;
        }
    `}</style>
);

const SkeletonBlock: React.FC<{
    width: string | number;
    height: string | number;
    borderRadius?: string | number;
    className?: string;
    style?: React.CSSProperties;
}> = ({ width, height, borderRadius = '4px', className = 'mlab-skeleton', style }) => (
    <div
        className={className}
        style={{
            width,
            height,
            borderRadius,
            ...style,
        }}
    />
);

// Mimics a single chat message row (avatar + name + bubble)
const MessageSkeletonRow: React.FC<{ isOwn?: boolean; widthVariance?: number }> = ({
    isOwn = false,
    widthVariance = 1,
}) => {
    const bubbleWidth = Math.round((isOwn ? 220 : 280) * widthVariance);
    return (
        <div
            style={{
                display: 'flex',
                gap: '14px',
                flexDirection: isOwn ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                padding: '4px 0',
                minHeight: '90px',
            }}
        >
            <SkeletonBlock width="32px" height="32px" borderRadius="50%" />
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxWidth: '82%',
                    alignItems: isOwn ? 'flex-end' : 'flex-start',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'baseline',
                        flexDirection: isOwn ? 'row-reverse' : 'row',
                    }}
                >
                    <SkeletonBlock width="110px" height="12px" />
                    <SkeletonBlock width="40px" height="10px" />
                </div>
                <SkeletonBlock
                    width={`${bubbleWidth}px`}
                    height="52px"
                    borderRadius="14px"
                    style={{
                        borderBottomRightRadius: isOwn ? '3px' : '14px',
                        borderBottomLeftRadius: isOwn ? '14px' : '3px',
                    }}
                />
            </div>
        </div>
    );
};

// Mimics a sidebar channel button row
const ChannelSkeletonItem: React.FC = () => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            marginBottom: '4px',
            borderRadius: '6px',
        }}
    >
        <SkeletonBlock width="16px" height="16px" borderRadius="3px" />
        <SkeletonBlock width="120px" height="11px" />
    </div>
);

// Mimics a sidebar DM list row
const DmSkeletonItem: React.FC = () => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            marginBottom: '2px',
            borderRadius: '6px',
        }}
    >
        <SkeletonBlock width="24px" height="24px" borderRadius="50%" />
        <SkeletonBlock width="130px" height="10px" />
    </div>
);

// Mimics a member row inside the Manage Members modal
const MemberRowSkeleton: React.FC = () => (
    <div
        style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            background: '#ffffff',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            marginBottom: '8px',
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <SkeletonBlock width="32px" height="32px" borderRadius="50%" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <SkeletonBlock width="120px" height="10px" />
                <SkeletonBlock width="70px" height="8px" />
            </div>
        </div>
        <SkeletonBlock width="82px" height="28px" borderRadius="5px" />
    </div>
);

// Mimics the KPI header numbers while cohort data resolves
const KpiSkeleton: React.FC<{ width: string }> = ({ width }) => (
    <SkeletonBlock width={width} height="14px" borderRadius="3px" />
);


interface ChatCodeBlockProps {
    language: string;
    codeString: string;
    isCopied: boolean;
    onCopy: () => void;
    onOpenModal: (code: string, language: string, lineCount: number) => void;
}

const ChatCodeBlock: React.FC<ChatCodeBlockProps> = ({
    language,
    codeString,
    isCopied,
    onCopy,
    onOpenModal
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const lineCount = codeString.split('\n').length;

    // Thresholds:
    // 1-12 lines: Standard display (no collapse needed)
    // 13-26 lines: Expand / Collapse directly inside the chat bubble
    // 27+ lines: Very large, opens in a dedicated scrollable modal
    const isMedium = lineCount > 12 && lineCount <= 26;
    const isVeryLarge = lineCount > 26;
    const isClipped = lineCount > 12 && !isExpanded;

    return (
        <div style={{
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid #30363d',
            background: '#0d1117',
            margin: '8px 0',
            width: '100%',
            textAlign: 'left'
        }}>
            {/* Snippet Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#161b22',
                padding: '6px 12px',
                borderBottom: '1px solid #30363d',
                fontSize: '0.7rem',
                color: '#8b949e',
                fontFamily: 'monospace'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700 }}>{language.toUpperCase()}</span>
                    <span style={{ fontSize: '0.65rem', color: '#6e7681' }}>({lineCount} lines)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {lineCount > 12 && (
                        <button
                            type="button"
                            onClick={() => onOpenModal(codeString, language, lineCount)}
                            title="Expand in Modal"
                            style={{
                                background: 'rgba(255,255,255,0.08)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#c9d1d9',
                                cursor: 'pointer',
                                fontSize: '0.68rem',
                                padding: '3px 8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <Maximize2 size={11} /> Expand
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onCopy}
                        style={{
                            background: isCopied ? '#238636' : 'rgba(255,255,255,0.08)',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            padding: '3px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'background 0.2s ease'
                        }}
                    >
                        {isCopied && <Check size={12} />}
                        {isCopied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
            </div>

            {/* Code Body with optional height clipping */}
            <div style={{
                position: 'relative',
                maxHeight: isClipped ? '240px' : 'none',
                overflow: isClipped ? 'hidden' : 'visible'
            }}>
                <div style={{ overflowX: 'auto' }}>
                    <SyntaxHighlighter
                        style={vscDarkPlus as any}
                        language={language}
                        PreTag="div"
                        customStyle={{
                            margin: 0,
                            padding: '12px',
                            background: '#0d1117',
                            fontSize: '0.85rem',
                            lineHeight: '1.4',
                            fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                        }}
                    >
                        {codeString}
                    </SyntaxHighlighter>
                </div>

                {/* Subtle gradient overlay when code is clipped */}
                {isClipped && (
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '65px',
                        background: 'linear-gradient(to bottom, transparent, #0d1117)',
                        pointerEvents: 'none'
                    }} />
                )}
            </div>

            {/* Bottom Footer Action for Large Snippets */}
            {lineCount > 12 && (
                <div style={{
                    padding: '6px 12px',
                    background: '#161b22',
                    borderTop: '1px solid #30363d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {isMedium ? (
                        <button
                            type="button"
                            onClick={() => setIsExpanded(prev => !prev)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#58a6ff',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            {isExpanded ? (
                                <><ChevronUp size={13} /> Collapse</>
                            ) : (
                                <><ChevronDown size={13} /> Show more ({lineCount - 12} more lines)</>
                            )}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onOpenModal(codeString, language, lineCount)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#58a6ff',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <Maximize2 size={12} /> View all {lineCount} lines in modal
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export const CommunityHub: React.FC<CommunityHubProps> = ({ cohortId, user, cohorts = [], onCohortChange }) => {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [activeChannel, setActiveChannel] = useState<string>('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoadingFeed, setIsLoadingFeed] = useState(false);
    // Tracks whether channels have EVER been fetched at least once.
    // Without this we cannot tell 'still loading' apart from 'empty cohort',
    // which causes the 'No channels available' empty state to flash
    // briefly during first load before Firestore returns.
    const [hasInitiallyLoadedChannels, setHasInitiallyLoadedChannels] = useState(false);
    // Tracks whether cohort users have EVER resolved (so DM list can
    // skeleton instead of flashing 'No members available').
    const [hasInitiallyLoadedCohortUsers, setHasInitiallyLoadedCohortUsers] = useState(false);
    // Tracks whether the cohort-wide messages snapshot has resolved
    // at least once so the sidebar unread badges don't flicker.
    const [hasInitiallyLoadedCohortMessages, setHasInitiallyLoadedCohortMessages] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

    // Channel Creation Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [isNewChannelPrivate, setIsNewChannelPrivate] = useState(false);
    const [isCreatingChannel, setIsCreatingChannel] = useState(false);

    // Member Management & Cohort State
    const [cohortUsers, setCohortUsers] = useState<{ uid: string, fullName: string, role: string }[]>([]);
    const [cohortStaff, setCohortStaff] = useState<{ uid: string, fullName: string, role: string }[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [showManageMembersModal, setShowManageMembersModal] = useState(false);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const [memberFilterTab, setMemberFilterTab] = useState<'all' | 'in_channel' | 'available'>('all');
    const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
    const [isLoadingCohortUsers, setIsLoadingCohortUsers] = useState(false);

    // Attachment Upload State
    const [stagedAttachment, setStagedAttachment] = useState<File | null>(null);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Attachment Preview Modal State
    const [previewFile, setPreviewFile] = useState<AttachmentItem | null>(null);
    const [activeCodeModal, setActiveCodeModal] = useState<{ code: string; language: string; lineCount: number } | null>(null);
    const [activeDmUser, setActiveDmUser] = useState<{ uid: string; fullName: string; role: string } | null>(null);

    // Online / Offline Presence State
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

    // 1. Current User Presence Heartbeat.
    //    Uses setDoc with { merge: true } instead of updateDoc so it works
    //    even if the user document doesn't exist yet (updateDoc silently
    //    fails on missing docs, leaving the user permanently 'offline').
    useEffect(() => {
        if (!user.uid) return;
        const userRef = doc(db, 'users', user.uid);

        const markOnline = () => {
            setDoc(userRef, { isOnline: true, lastActiveAt: serverTimestamp() }, { merge: true }).catch(() => { });
        };
        const markOffline = () => {
            setDoc(userRef, { isOnline: false, lastActiveAt: serverTimestamp() }, { merge: true }).catch(() => { });
        };

        // Mark current user online on mount
        markOnline();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') markOffline();
            else markOnline();
        };

        // beforeunload fires when the user closes the tab / navigates away.
        // We mark offline optimistically; the server will reconcile via the
        // lastActiveAt timestamp if the event doesn't fire (e.g. mobile safari).
        window.addEventListener('beforeunload', markOffline);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            markOffline();
            window.removeEventListener('beforeunload', markOffline);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user.uid]);

    // 2. Real-time Listener for Online Cohort Members
    useEffect(() => {
        const q = query(collection(db, 'users'), where('isOnline', '==', true));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const onlineSet = new Set<string>();
            snapshot.docs.forEach((docSnap) => onlineSet.add(docSnap.id));
            setOnlineUserIds(onlineSet);
        });
        return () => unsubscribe();
    }, []);

    // @ Mention Autocomplete State
    const [mentionSearch, setMentionSearch] = useState<string | null>(null);
    const [mentionCursorIndex, setMentionCursorIndex] = useState<number>(-1);
    const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);

    // Reactions, Replies, Forwards State
    const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [forwardingMsg, setForwardingMsg] = useState<ChatMessage | null>(null);
    const [showForwardModal, setShowForwardModal] = useState(false);

    // Staff Super-Permission Check
    const isStaff = ['admin', 'facilitator', 'assessor', 'moderator'].includes(user.role?.toLowerCase());

    // Unread Tracking & Floating Badges State
    const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
    const [initialUnreadId, setInitialUnreadId] = useState<string | null>(null);
    const [unreadAboveCount, setUnreadAboveCount] = useState(0);
    const [unreadBelowCount, setUnreadBelowCount] = useState(0);
    const [allCohortMessages, setAllCohortMessages] = useState<ChatMessage[]>([]);
    const messageElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

    // Helper: Local Storage Read Timestamps
    const getLastReadTimestamp = (channelId: string): number => {
        try {
            const raw = localStorage.getItem(`mlab_last_read_${user.uid}`);
            if (raw) return JSON.parse(raw)[channelId] || 0;
        } catch { }
        return 0;
    };

    const setLastReadTimestamp = (channelId: string, time: number) => {
        try {
            const raw = localStorage.getItem(`mlab_last_read_${user.uid}`);
            const map = raw ? JSON.parse(raw) : {};
            map[channelId] = time;
            localStorage.setItem(`mlab_last_read_${user.uid}`, JSON.stringify(map));
        } catch { }
    };

    const getMsgTimeMs = (msg: ChatMessage): number => {
        if (!msg.createdAt) return 0;
        if (typeof msg.createdAt.toDate === 'function') return msg.createdAt.toDate().getTime();
        if (msg.createdAt.seconds) return msg.createdAt.seconds * 1000;
        const parsed = new Date(msg.createdAt).getTime();
        return isNaN(parsed) ? 0 : parsed;
    };

    // Close preview or code modal on ESC key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeCodeModal) setActiveCodeModal(null);
                else if (previewFile) setPreviewFile(null);
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [previewFile, activeCodeModal]);

    // Automatically remove the "NEW MESSAGES" line 1.5s after messages are viewed
    useEffect(() => {
        if (unreadIds.size === 0 && initialUnreadId !== null) {
            const timer = setTimeout(() => {
                setInitialUnreadId(null);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [unreadIds.size, initialUnreadId]);

    // Code Snippet Modal State
    const [showSnippetModal, setShowSnippetModal] = useState(false);
    const [snippetLanguage, setSnippetLanguage] = useState('html');
    const [snippetCode, setSnippetCode] = useState('');
    const [snippetComment, setSnippetComment] = useState('');

    const getDmChannelId = (targetUid: string) => {
        const sortedUids = [user.uid, targetUid].sort();
        return `dm_${sortedUids[0]}_${sortedUids[1]}`;
    };

    const openDirectMessage = async (targetUser: { uid: string; fullName: string; role: string }) => {
        const dmId = getDmChannelId(targetUser.uid);
        const existingChannel = channels.find(c => c.id === dmId);

        if (!existingChannel) {
            try {
                const channelRef = doc(db, 'community_channels', dmId);
                await updateDoc(channelRef, {
                    cohortId,
                    name: targetUser.fullName,
                    isPrivate: true,
                    isDirect: true,
                    members: [user.uid, targetUser.uid],
                    createdBy: user.uid,
                    createdAt: serverTimestamp()
                }).catch(async () => {
                    // Create if it doesn't exist
                    const { setDoc } = await import('firebase/firestore');
                    await setDoc(channelRef, {
                        cohortId,
                        name: targetUser.fullName,
                        isPrivate: true,
                        isDirect: true,
                        members: [user.uid, targetUser.uid],
                        createdBy: user.uid,
                        createdAt: serverTimestamp()
                    });
                });
            } catch (err) {
                console.error("Failed to establish DM channel:", err);
            }
        }

        setActiveDmUser(targetUser);
        setActiveChannel(dmId);
    };

    // Firestore logic to add/remove members from the array
    const toggleReaction = async (messageId: string, emoji: string) => {
        const msg = messages.find(m => m.id === messageId);
        if (!msg) return;
        const currentUids = msg.reactions?.[emoji] || [];
        const hasReacted = currentUids.includes(user.uid);
        const msgRef = doc(db, 'community_messages', messageId);
        await updateDoc(msgRef, {
            [`reactions.${emoji}`]: hasReacted ? arrayRemove(user.uid) : arrayUnion(user.uid)
        });
    };

    const executeForward = async (destinationChannelId: string) => {
        if (!forwardingMsg) return;
        const currentChannelName = activeChannelData?.name || 'chat';
        await addDoc(collection(db, 'community_messages'), {
            cohortId,
            channelId: destinationChannelId,
            text: forwardingMsg.text,
            senderId: user.uid,
            senderName: user.fullName || 'Unknown User',
            senderRole: user.role || 'learner',
            createdAt: serverTimestamp(),
            attachments: forwardingMsg.attachments || [],
            forwardedFrom: {
                channelName: currentChannelName,
                originalSender: forwardingMsg.senderName
            }
        });
        setShowForwardModal(false);
        setForwardingMsg(null);
    };

    const toggleMember = async (memberId: string, isCurrentlyMember: boolean) => {
        if (!activeChannel) return;
        setUpdatingMemberId(memberId);
        const channelRef = doc(db, 'community_channels', activeChannel);
        try {
            await updateDoc(channelRef, {
                members: isCurrentlyMember ? arrayRemove(memberId) : arrayUnion(memberId)
            });
        } catch (error) {
            console.error("Failed to update members", error);
        } finally {
            setUpdatingMemberId(null);
        }
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const feedContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = (smooth = true) => {
        messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    };

    // Listen to recent cohort messages to compute sidebar unread counts
    useEffect(() => {
        if (!cohortId) return;
        const q = query(
            collection(db, 'community_messages'),
            where('cohortId', '==', cohortId),
            limit(150)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ChatMessage[];
            setAllCohortMessages(fetched);
            setHasInitiallyLoadedCohortMessages(true);
        }, (error) => {
            console.error('CommunityHub - Failed to fetch cohort messages for unread tracking:', error);
            setHasInitiallyLoadedCohortMessages(true);
        });
        return () => unsubscribe();
    }, [cohortId]);

    const scrollToFirstUnread = () => {
        const targetId = initialUnreadId || Array.from(unreadIds)[0];
        if (targetId) {
            const el = messageElementsRef.current.get(targetId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    // Real-time Visibility Observer: Clears unread state the instant a message is on screen
    useEffect(() => {
        const container = feedContainerRef.current;
        if (!container || !activeChannel || messages.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const readBatch: string[] = [];
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const msgId = entry.target.getAttribute('data-msg-id');
                        if (msgId) readBatch.push(msgId);
                    }
                });

                if (readBatch.length > 0) {
                    setUnreadIds((prev) => {
                        const next = new Set(prev);
                        let changed = false;
                        readBatch.forEach((id) => {
                            if (next.has(id)) {
                                next.delete(id);
                                changed = true;
                            }
                        });
                        return changed ? next : prev;
                    });
                    setLastReadTimestamp(activeChannel, Date.now());
                }
            },
            { root: container, threshold: 0.1 }
        );

        messageElementsRef.current.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [messages, activeChannel]);

    // Recalculate unread messages above & below viewport
    const updateUnreadScrollPositions = () => {
        const container = feedContainerRef.current;
        if (!container || unreadIds.size === 0) {
            setUnreadAboveCount(0);
            setUnreadBelowCount(0);
            return;
        }

        const containerRect = container.getBoundingClientRect();
        let above = 0;
        let below = 0;

        unreadIds.forEach((id) => {
            const el = messageElementsRef.current.get(id);
            if (!el) return;
            const rect = el.getBoundingClientRect();
            if (rect.bottom < containerRect.top + 10) above++;
            else if (rect.top > containerRect.bottom - 10) below++;
        });

        setUnreadAboveCount(above);
        setUnreadBelowCount(below);
    };

    useEffect(() => {
        updateUnreadScrollPositions();
    }, [unreadIds, messages]);

    // Ref mirror of activeChannel so the channels useEffect can read the
    // current value WITHOUT listing it in its dependency array. This prevents
    // the Firestore subscription from being torn down and rebuilt every time
    // the user switches channels (which would cause a brief loading flash).
    const activeChannelRef = useRef<string>(activeChannel);
    useEffect(() => {
        activeChannelRef.current = activeChannel;
    }, [activeChannel]);

    // 1. Subscribe to Channels with Full Staff Access
    useEffect(() => {
        if (!cohortId) return;

        const q = query(
            collection(db, 'community_channels'),
            where('cohortId', '==', cohortId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedChannels = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Channel[];

            // Staff (admin, facilitator, assessor, moderator) have full oversight over all public and private channels
            const accessibleChannels = fetchedChannels.filter(c =>
                !c.isPrivate ||
                (c.members && c.members.includes(user.uid)) ||
                isStaff
            );

            // 1. Ensure #general exists for this cohort.
            //    We check by NAME (not by length) so #general gets created
            //    even if the cohort has OTHER channels but is missing #general.
            //    Uses a DETERMINISTIC doc ID (`${cohortId}_general`) with setDoc
            //    + merge so concurrent attempts by multiple learners on a fresh
            //    cohort are idempotent (they all write to the same doc instead
            //    of creating duplicate #general channels).
            //
            //    NOTE: We do NOT return early after setDoc. The cohort-reset
            //    useLayoutEffect already pre-populated a synthetic #general with
            //    the same ID, so the user sees it instantly. We just need to
            //    make sure the REAL #general gets created in the background so
            //    other learners see it too.
            const hasGeneralChannel = fetchedChannels.some(c => c.name === 'general');
            if (!hasGeneralChannel && cohortId) {
                const generalDocRef = doc(db, 'community_channels', `${cohortId}_general`);
                setDoc(generalDocRef, {
                    cohortId,
                    name: 'general',
                    isPrivate: false,
                    members: [],
                    createdBy: 'system',
                    createdAt: serverTimestamp()
                }, { merge: true }).catch((err) => {
                    console.warn('Failed to auto-create #general channel:', err);
                });
                // Do NOT return — let the channels update normally below.
                // The synthetic #general from the cohort-reset effect is
                // still in state and will be replaced by the real one once
                // the setDoc triggers a new snapshot.
            }

            // 2. Merge real Firestore channels with the synthetic #general.
            //    If Firestore returned channels (including possibly the real
            //    #general), use them. If Firestore returned NOTHING (fresh
            //    cohort, setDoc just fired), keep showing the synthetic
            //    #general so the sidebar never goes empty.
            const channelsToShow = accessibleChannels.length > 0
                ? accessibleChannels
                : (cohortId ? [{
                    id: `${cohortId}_general`,
                    name: 'general',
                    isPrivate: false,
                    isDirect: false,
                    members: [],
                    createdBy: 'system'
                } as Channel] : []);
            channelsToShow.sort((a, b) => a.name.localeCompare(b.name));
            setChannels(channelsToShow);
            setHasInitiallyLoadedChannels(true);

            // 3. Resolve active channel.
            //    Read activeChannel via ref so this effect doesn't depend on it
            //    (avoids re-subscribing to Firestore on every channel switch).
            //    If the current active channel is still valid, keep it.
            //    Otherwise default to #general (every cohort has one), falling
            //    back to the first available channel if #general isn't there yet.
            const currentActive = activeChannelRef.current;
            const isValidChannel = channelsToShow.some(c => c.id === currentActive);
            const isCurrentDm = currentActive.startsWith('dm_');
            if (!isValidChannel && !isCurrentDm) {
                const generalChannel = channelsToShow.find(c => c.name === 'general');
                setActiveChannel(generalChannel ? generalChannel.id : (channelsToShow[0]?.id || ''));
            }
        });

        return () => unsubscribe();
    }, [cohortId, user.uid, user.role, isStaff]);
    // eslint-disable-next-line react-hooks/exhaustive-deps

    // Reset ALL cohort-specific state the instant the cohort changes.
    //
    // This uses `useLayoutEffect` (not `useEffect`) so the state clears
    // happen SYNCHRONOUSLY before the browser paints. Without this, the
    // user would see the previous cohort's channels / DMs / unread badges
    // for one render frame (~16ms) before the skeletons appear. With
    // useLayoutEffect, the cleared state is what gets painted, so the
    // skeleton loaders appear truly instantly when the user picks a new
    // cohort from the dropdown.
    //
    // CRITICAL: We clear `channels`, `cohortUsers`, `cohortStaff`, and
    // `allCohortMessages` here (not just `activeChannel` / `messages`).
    // Without clearing these AND resetting the `hasInitiallyLoaded*`
    // flags, the sidebar would keep showing the previous cohort's data
    // until the new cohort's Firestore snapshots arrive (200-500ms over
    // a slow connection). The skeleton loaders only render when
    // `hasInitiallyLoadedChannels` / `hasInitiallyLoadedCohortUsers` are
    // false, so we MUST reset them here to trigger the skeletons again.
    //
    // The channel + cohort-users Firestore subscriptions will flip these
    // flags back to `true` once the new cohort's first snapshot arrives,
    // at which point the skeletons swap to the real channel / DM lists.
    useLayoutEffect(() => {
        // OPTIMISTIC #general CHANNEL
        //
        // Every cohort gets a #general channel by default. Instead of
        // clearing channels to [] and showing skeleton loaders while
        // Firestore fetches the real list, we pre-populate channels
        // with a synthetic #general using the SAME deterministic doc ID
        // (`${cohortId}_general`) that the auto-create setDoc uses.
        //
        // This means #general is visible INSTANTLY when the user
        // switches cohorts — no skeletons, no empty state, no flash.
        // When Firestore returns the real channel list, the real
        // #general (same ID) seamlessly replaces the synthetic one —
        // React reconciles them as the same item, no flicker.
        //
        // We also auto-select #general so the user lands in the
        // default channel immediately and can start typing.
        const generalChannelId = `${cohortId}_general`;
        setActiveChannel(generalChannelId);
        setActiveDmUser(null);

        // Pre-populate channels with a synthetic #general so the
        // sidebar shows it immediately. The real list (including the
        // real #general with the same ID) will replace this when
        // Firestore returns.
        setChannels([{
            id: `${cohortId}_general`,
            name: 'general',
            isPrivate: false,
            isDirect: false,
            members: [],
            createdBy: 'system'
        } as Channel]);
        // Mark channels as loaded so the skeleton loaders DON'T render
        // for channels (we have #general, that's enough). The DM list
        // still skeletons because cohortUsers is cleared below.
        setHasInitiallyLoadedChannels(true);

        // Clear the previous cohort's DM roster + unread data so the
        // DM list shows skeletons and unread badges reset to 0.
        setCohortUsers([]);
        setCohortStaff([]);
        setAllCohortMessages([]);
        setHasInitiallyLoadedCohortUsers(false);

        // Reset transient feed state so the new cohort doesn't briefly
        // show the previous cohort's messages or unread markers.
        setMessages([]);
        setUnreadIds(new Set());
        setInitialUnreadId(null);
        setUnreadAboveCount(0);
        setUnreadBelowCount(0);
        setIsLoadingFeed(true);
    }, [cohortId]);

    // Fetch Facilitator, Assessor, and Moderator for Mentions
    useEffect(() => {
        if (!cohortId) return;

        const fetchCohortStaff = async () => {
            try {
                const cohortDocRef = doc(db, 'cohorts', cohortId);
                const cohortSnap = await getDoc(cohortDocRef);
                if (!cohortSnap.exists()) return;

                const cData = cohortSnap.data();
                const staffIds = [cData.facilitatorId, cData.assessorId, cData.moderatorId].filter(Boolean);

                const resolvedStaff: { uid: string; fullName: string; role: string }[] = [];
                for (const sId of staffIds) {
                    const uSnap = await getDoc(doc(db, 'users', sId));
                    if (uSnap.exists()) {
                        const uData = uSnap.data();
                        resolvedStaff.push({
                            uid: uSnap.id,
                            fullName: uData.fullName || uData.name || 'Staff Member',
                            role: uData.role || 'facilitator'
                        });
                    }
                }
                setCohortStaff(resolvedStaff);
            } catch (err) {
                console.warn("Could not fetch assigned cohort staff:", err);
            }
        };

        fetchCohortStaff();
    }, [cohortId]);

    // 2. Subscribe to Active Channel Messages
    useEffect(() => {
        if (!cohortId || !activeChannel) {
            setMessages([]);
            setUnreadIds(new Set());
            setInitialUnreadId(null);
            setUnreadAboveCount(0);
            setUnreadBelowCount(0);
            // IMPORTANT: clear isLoadingFeed so the UI doesn't get stuck
            // on the loading skeleton when there's no active channel.
            setIsLoadingFeed(false);
            return;
        }

        setIsLoadingFeed(true);
        // Reset unread counts on channel switch
        setUnreadAboveCount(0);
        setUnreadBelowCount(0);

        const q = query(
            collection(db, 'community_messages'),
            where('cohortId', '==', cohortId),
            where('channelId', '==', activeChannel),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const lastReadTime = getLastReadTimestamp(activeChannel);
            const fetchedMessages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ChatMessage[];

            const chronological = fetchedMessages.reverse();
            setMessages(chronological);
            setIsLoadingFeed(false);

            // Detect unread messages
            const unreadSet = new Set<string>();
            let firstUnreadFound: string | null = null;

            chronological.forEach(m => {
                if (m.senderId !== user.uid && getMsgTimeMs(m) > lastReadTime) {
                    unreadSet.add(m.id);
                    if (!firstUnreadFound) firstUnreadFound = m.id;
                }
            });

            setUnreadIds(unreadSet);
            // Lock in the first unread marker position so the feed doesn't jump on scroll
            setInitialUnreadId(firstUnreadFound);

            // Auto-scroll to bottom, then calculate which unreads remain above
            setTimeout(() => {
                scrollToBottom(false);
                setTimeout(updateUnreadScrollPositions, 150);
            }, 80);
        }, (error) => {
            console.error("Community Feed Error:", error);
            setIsLoadingFeed(false);
        });

        return () => unsubscribe();
    }, [cohortId, activeChannel]);

    // Clean up the message element refs Map when the component unmounts
    // to prevent a memory leak across channel switches.
    useEffect(() => {
        return () => {
            messageElementsRef.current.clear();
        };
    }, []);

    // 3. Fetch Cohort Users from Enrollments & Resolve Profile Names
    useEffect(() => {
        if (!cohortId) return;

        const q = query(
            collection(db, 'enrollments'),
            where('cohortId', '==', cohortId)
        );

        setIsLoadingCohortUsers(true);
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const userPromises = snapshot.docs.map(async (docSnap) => {
                const data = docSnap.data();
                const rawLearnerId = data.learnerId || data.authUid || docSnap.id;
                const statusStr = String(data.status || '').toLowerCase();
                const isWithdrawn = statusStr.includes('drop') || statusStr.includes('withdrawn');

                let resolvedName = data.fullName || data.learnerName || data.name || '';
                let resolvedAuthUid = rawLearnerId;

                // If the name isn't stored in the enrollment document, fetch it from 'users'
                if (rawLearnerId) {
                    try {
                        // 1. Look up user by ID number
                        const userQ = query(
                            collection(db, 'users'),
                            where('idNumber', '==', String(rawLearnerId).trim()),
                            limit(1)
                        );
                        const userSnap = await getDocs(userQ);

                        if (!userSnap.empty) {
                            const uDoc = userSnap.docs[0];
                            const uData = uDoc.data();
                            resolvedName = uData.fullName || uData.name || (uData.firstName ? `${uData.firstName} ${uData.lastName || ''}`.trim() : '');
                            resolvedAuthUid = uDoc.id; // Use their real Firebase Auth UID for channel membership
                        } else {
                            // 2. Fallback: Look up user directly by document ID
                            const uDocRef = await getDoc(doc(db, 'users', rawLearnerId));
                            if (uDocRef.exists()) {
                                const uData = uDocRef.data();
                                resolvedName = uData.fullName || uData.name || (uData.firstName ? `${uData.firstName} ${uData.lastName || ''}`.trim() : '');
                                resolvedAuthUid = uDocRef.id;
                            }
                        }
                    } catch (err) {
                        console.warn("CommunityHub - Could not resolve profile for:", rawLearnerId, err);
                    }
                }

                return {
                    uid: resolvedAuthUid,
                    fullName: resolvedName || `Learner (${rawLearnerId})`,
                    role: data.role || 'learner',
                    isWithdrawn
                };
            });

            const resolvedList = await Promise.all(userPromises);
            const activeCohortMembers = resolvedList.filter(u => u.uid !== user.uid && !u.isWithdrawn);

            setCohortUsers(activeCohortMembers);
            setIsLoadingCohortUsers(false);
            setHasInitiallyLoadedCohortUsers(true);
        }, (error) => {
            console.error("CommunityHub - Failed to fetch cohort enrollments:", error);
            setIsLoadingCohortUsers(false);
            setHasInitiallyLoadedCohortUsers(true);
        });

        return () => unsubscribe();
    }, [cohortId, user.uid]);


    // Combined pool of mentionable users (learners + staff).
    // Memoized so we don't recompute the deduplicated array on every render -
    // this matters because allMentionableUsers is referenced by handleSendMessage,
    // the message renderer's formatChatText, and the mention autocomplete.
    const allMentionableUsers = useMemo(
        () => [...cohortStaff, ...cohortUsers].filter(
            (person, idx, self) => idx === self.findIndex((p) => p.uid === person.uid) && person.uid !== user.uid
        ),
        [cohortStaff, cohortUsers, user.uid]
    );

    const filteredMentionUsers = useMemo(
        () => mentionSearch !== null
            ? allMentionableUsers.filter(u => u.fullName.toLowerCase().includes(mentionSearch.toLowerCase()))
            : [],
        [mentionSearch, allMentionableUsers]
    );

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setAttachmentError(null);
        if (!file) return;

        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
            setAttachmentError(`File size exceeds 10MB limit (${formatBytes(file.size)})`);
            return;
        }

        setStagedAttachment(file);
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart;
        setNewMessage(val);

        // Detect if user typed an '@' trigger
        const textBeforeCursor = val.slice(0, cursor);
        const match = textBeforeCursor.match(/@([a-zA-Z0-9_\s]*)$/);

        if (match) {
            setMentionSearch(match[1]);
            setMentionCursorIndex(cursor - match[0].length);
            setMentionSelectedIdx(0);
        } else {
            setMentionSearch(null);
            setMentionCursorIndex(-1);
        }
    };

    const insertMention = (person: { uid: string; fullName: string }) => {
        if (mentionCursorIndex === -1) return;
        const textarea = textareaRef.current;
        const mentionText = `@${person.fullName} `;
        const before = newMessage.slice(0, mentionCursorIndex);
        const after = newMessage.slice(textarea?.selectionStart || mentionCursorIndex);
        const combined = before + mentionText + after;

        setNewMessage(combined);
        setMentionSearch(null);
        setMentionCursorIndex(-1);

        setTimeout(() => {
            if (textarea) {
                textarea.focus();
                textarea.selectionStart = textarea.selectionEnd = before.length + mentionText.length;
            }
        }, 10);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Mention menu navigation
        if (mentionSearch !== null && filteredMentionUsers.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionSelectedIdx(prev => (prev + 1) % filteredMentionUsers.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionSelectedIdx(prev => (prev - 1 + filteredMentionUsers.length) % filteredMentionUsers.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(filteredMentionUsers[mentionSelectedIdx]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setMentionSearch(null);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const trimmedMessage = newMessage.trim();
        if ((!trimmedMessage && !stagedAttachment) || !cohortId || !user.uid || !activeChannel) return;

        setIsSending(true);
        try {
            let uploadedAttachments: AttachmentItem[] = [];

            // Upload attachment to Firebase Storage if present
            if (stagedAttachment) {
                setIsUploadingAttachment(true);
                const fileRef = ref(storage, `community_attachments/${cohortId}/${activeChannel}/${Date.now()}_${stagedAttachment.name}`);
                const uploadTask = uploadBytesResumable(fileRef, stagedAttachment);

                const downloadUrl = await new Promise<string>((resolve, reject) => {
                    uploadTask.on(
                        'state_changed',
                        (snap) => {
                            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                            setUploadProgress(pct);
                        },
                        (err) => reject(err),
                        async () => {
                            const url = await getDownloadURL(uploadTask.snapshot.ref);
                            resolve(url);
                        }
                    );
                });

                uploadedAttachments.push({
                    name: stagedAttachment.name,
                    url: downloadUrl,
                    size: stagedAttachment.size,
                    type: stagedAttachment.type
                });
            }

            // Extract mentioned UIDs
            const detectedMentions: string[] = [];
            allMentionableUsers.forEach(u => {
                if (trimmedMessage.includes(`@${u.fullName}`)) {
                    detectedMentions.push(u.uid);
                }
            });

            // 1. Post message to active channel
            await addDoc(collection(db, 'community_messages'), {
                cohortId,
                channelId: activeChannel,
                text: trimmedMessage,
                senderId: user.uid,
                senderName: user.fullName || 'Unknown User',
                senderRole: user.role || 'learner',
                createdAt: serverTimestamp(),
                attachments: uploadedAttachments,
                mentions: detectedMentions,
                replyTo: replyingTo ? {
                    id: replyingTo.id,
                    senderName: replyingTo.senderName,
                    text: replyingTo.text.slice(0, 100)
                } : null
            });

            // 2. Dispatch in-app notifications to mentioned users
            if (detectedMentions.length > 0) {
                const uniqueMentionedUids = Array.from(new Set(detectedMentions)).filter(uid => uid !== user.uid);
                const notificationPromises = uniqueMentionedUids.map(recipientUid => {
                    return addDoc(collection(db, 'notifications'), {
                        userId: recipientUid,
                        recipientId: recipientUid,
                        title: `@${user.fullName || 'Someone'} mentioned you`,
                        message: `${user.fullName || 'A member'} mentioned you in #${activeChannelData?.name || 'channel'}: "${trimmedMessage.slice(0, 90)}${trimmedMessage.length > 90 ? '...' : ''}"`,
                        type: 'community_mention',
                        channelId: activeChannel,
                        cohortId,
                        read: false,
                        senderId: user.uid,
                        senderName: user.fullName || 'Unknown User',
                        createdAt: serverTimestamp()
                    }).catch(err => console.warn("Failed to write mention notification:", err));
                });
                await Promise.all(notificationPromises);
            }

            setNewMessage('');
            setReplyingTo(null);
            setStagedAttachment(null);
            setUploadProgress(0);
            setIsUploadingAttachment(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            scrollToBottom();
        } catch (error) {
            console.error("Failed to send message:", error);
            setIsUploadingAttachment(false);
        } finally {
            setIsSending(false);
        }
    };

    const handleCreateChannel = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
        if (!trimmedName || !cohortId) return;

        setIsCreatingChannel(true);
        try {
            const docRef = await addDoc(collection(db, 'community_channels'), {
                cohortId,
                name: trimmedName,
                isPrivate: isNewChannelPrivate,
                // Include both the creator and the selected members
                members: isNewChannelPrivate ? [user.uid, ...selectedMembers] : [],
                createdBy: user.uid,
                createdAt: serverTimestamp()
            });

            setShowCreateModal(false);
            setNewChannelName('');
            setIsNewChannelPrivate(false);
            setSelectedMembers([]); // Reset selections
            setActiveChannel(docRef.id);
        } catch (error) {
            console.error("Failed to create channel", error);
        } finally {
            setIsCreatingChannel(false);
        }
    };

    const handleSendSnippet = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedCode = snippetCode.trim();
        if (!trimmedCode || !cohortId || !user.uid || !activeChannel) return;

        setIsSending(true);
        try {
            const payloadText = snippetComment.trim()
                ? `${snippetComment.trim()}\n\n\`\`\`${snippetLanguage}\n${trimmedCode}\n\`\`\``
                : `\`\`\`${snippetLanguage}\n${trimmedCode}\n\`\`\``;

            await addDoc(collection(db, 'community_messages'), {
                cohortId,
                channelId: activeChannel,
                text: payloadText,
                senderId: user.uid,
                senderName: user.fullName || 'Unknown User',
                senderRole: user.role || 'learner',
                createdAt: serverTimestamp(),
                attachments: [],
                mentions: []
            });

            setShowSnippetModal(false);
            setSnippetCode('');
            setSnippetComment('');
            scrollToBottom();
        } catch (error) {
            console.error("Failed to send snippet:", error);
        } finally {
            setIsSending(false);
        }
    };

    const insertFormatting = (prefix: string, suffix: string = prefix, placeholder: string = 'text') => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = newMessage.substring(start, end) || placeholder;

        const replacement = `${prefix}${selected}${suffix}`;
        const updated = newMessage.substring(0, start) + replacement + newMessage.substring(end);

        setNewMessage(updated);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        }, 10);
    };

    const handleCopyCode = (code: string, id: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCodeId(id);
        setTimeout(() => setCopiedCodeId(null), 2000);
    };

    const getRoleBadge = (role: string) => {
        const r = role.toLowerCase();
        if (r === 'facilitator') return <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><ShieldCheck size={10} /> Facilitator</span>;
        if (r === 'assessor' || r === 'moderator') return <span style={{ background: '#f3e8ff', color: '#6d28d9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Bot size={10} /> Assessor</span>;
        if (r === 'admin') return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase' }}>Admin</span>;
        return null;
    };

    const activeChannelData = channels.find(c => c.id === activeChannel);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: '580px', maxHeight: '860px', gap: '16px' }}>
            <SkeletonStylesInjector />

            {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon">
                        <Users size={22} />
                    </div>
                    <div>
                        <h1 className="wm-page-header__title">Community Hub</h1>
                        <div className="wm-page-header__desc" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {hasInitiallyLoadedCohortUsers ? (
                                    <>{cohortUsers.length + cohortStaff.length} Total Members</>
                                ) : (
                                    <KpiSkeleton width="110px" />
                                )}
                            </span>
                            <span>•</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                                <span style={{ fontWeight: 700, minWidth: '85px', display: 'inline-flex' }}>
                                    {hasInitiallyLoadedCohortUsers ? (
                                        <>{onlineUserIds.size} Online Now</>
                                    ) : (
                                        <KpiSkeleton width="85px" />
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Active Channels Badge */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        color: '#ffffff',
                        fontWeight: 700
                    }}>
                        <Hash size={14} color="var(--mlab-green, #94c73d)" />
                        <span>{channels.length} Channels</span>
                    </div>

                    {/* Cohort Selector Dropdown */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#ffffff',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}>
                        <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: '#64748b',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            Cohort:
                        </span>

                        {cohorts.length > 0 ? (
                            <select
                                value={cohortId}
                                onChange={(e) => onCohortChange && onCohortChange(e.target.value)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: 'var(--mlab-blue, #073f4e)',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    maxWidth: '300px'
                                }}
                            >
                                {cohorts.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        ) : (
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--mlab-blue, #073f4e)' }}>
                                {cohortId.substring(0, 8).toUpperCase()}
                            </span>
                        )}
                    </div>

                    {/* Cohort ID Chip */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontFamily: 'monospace'
                    }}>
                        #{cohortId.substring(0, 8).toUpperCase()}
                    </div>
                </div>
            </div>

            <div style={{
                display: 'flex',
                flex: 1,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                marginTop: -16,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                overflow: 'hidden',
                position: 'relative'
            }}>

                {/* ATTACHMENT FULL PREVIEW LIGHTBOX MODAL */}
                {previewFile && createPortal(
                    <div
                        onClick={() => setPreviewFile(null)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 999999,
                            background: 'rgba(15, 23, 42, 0.8)',
                            backdropFilter: 'blur(6px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '24px'
                        }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                width: '92vw',
                                maxWidth: '1060px',
                                height: '86vh',
                                display: 'flex',
                                flexDirection: 'column',
                                background: '#ffffff',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                                border: '1px solid #334155'
                            }}
                        >
                            {/* Preview Header */}
                            <div style={{
                                padding: '12px 20px',
                                background: 'var(--mlab-blue, #073f4e)',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderBottom: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                    <FileText size={18} color="#94c73d" />
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '420px' }}>
                                        {previewFile.name}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>({formatBytes(previewFile.size)})</span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <a
                                        href={previewFile.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            color: '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            fontSize: '0.75rem',
                                            textDecoration: 'none',
                                            background: 'rgba(255,255,255,0.12)',
                                            padding: '5px 10px',
                                            borderRadius: '5px',
                                            fontWeight: 600
                                        }}
                                    >
                                        <ExternalLink size={13} /> Open Tab
                                    </a>
                                    <a
                                        href={previewFile.url}
                                        download={previewFile.name}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            fontSize: '0.75rem',
                                            textDecoration: 'none',
                                            background: 'var(--mlab-green, #94c73d)',
                                            color: 'var(--mlab-blue, #073f4e)',
                                            fontWeight: 800,
                                            padding: '5px 12px',
                                            borderRadius: '5px'
                                        }}
                                    >
                                        <Download size={13} /> Download
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => setPreviewFile(null)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                            padding: '5px',
                                            display: 'flex',
                                            marginLeft: '4px'
                                        }}
                                        title="Close Preview (Esc)"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Preview Body Canvas */}
                            <div style={{ flex: 1, background: '#0b1120', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {(() => {
                                    const lowerName = previewFile.name.toLowerCase();
                                    const isPdf = previewFile.type === 'application/pdf' || lowerName.endsWith('.pdf');
                                    const isImg = previewFile.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(lowerName);
                                    const isOfficeDoc = /\.(docx?|xlsx?|pptx?)$/i.test(lowerName);

                                    if (isPdf) {
                                        return (
                                            <iframe
                                                src={`${previewFile.url}#view=FitH`}
                                                title={previewFile.name}
                                                style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                            />
                                        );
                                    }

                                    if (isImg) {
                                        return (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                                                <img
                                                    src={previewFile.url}
                                                    alt={previewFile.name}
                                                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }}
                                                />
                                            </div>
                                        );
                                    }

                                    if (isOfficeDoc) {
                                        return (
                                            <iframe
                                                src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewFile.url)}&embedded=true`}
                                                title={previewFile.name}
                                                style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                            />
                                        );
                                    }

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', color: '#94a3b8', textAlign: 'center', padding: '40px' }}>
                                            <FileText size={60} opacity={0.35} />
                                            <div>
                                                <h4 style={{ color: '#ffffff', margin: '0 0 6px 0', fontSize: '1.05rem' }}>Direct preview not supported for this file type</h4>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Please download the file or open it in a new window.</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                                <a
                                                    href={previewFile.url}
                                                    download={previewFile.name}
                                                    style={{
                                                        background: 'var(--mlab-green, #94c73d)',
                                                        color: 'var(--mlab-blue, #073f4e)',
                                                        padding: '8px 16px',
                                                        borderRadius: '6px',
                                                        fontWeight: 800,
                                                        fontSize: '0.8rem',
                                                        textDecoration: 'none',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <Download size={14} /> Download File
                                                </a>
                                                <a
                                                    href={previewFile.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        background: '#334155',
                                                        color: '#ffffff',
                                                        padding: '8px 16px',
                                                        borderRadius: '6px',
                                                        fontWeight: 600,
                                                        fontSize: '0.8rem',
                                                        textDecoration: 'none',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <ExternalLink size={14} /> Open Directly
                                                </a>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* EXPANDED CODE SNIPPET MODAL */}
                {activeCodeModal && createPortal(
                    <div
                        onClick={() => setActiveCodeModal(null)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 999999,
                            background: 'rgba(15, 23, 42, 0.85)',
                            backdropFilter: 'blur(6px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '24px'
                        }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                width: '92vw',
                                maxWidth: '1020px',
                                height: '84vh',
                                display: 'flex',
                                flexDirection: 'column',
                                background: '#0d1117',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1px solid #30363d',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }}
                        >
                            {/* Header */}
                            <div style={{
                                padding: '12px 20px',
                                background: '#161b22',
                                borderBottom: '1px solid #30363d',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: '#c9d1d9'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Terminal size={17} color="#58a6ff" />
                                    <span style={{ fontWeight: 700, fontSize: '0.88rem', fontFamily: 'monospace' }}>
                                        {activeCodeModal.language.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: '#8b949e' }}>
                                        ({activeCodeModal.lineCount} lines)
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyCode(activeCodeModal.code, 'modal_code')}
                                        style={{
                                            background: copiedCodeId === 'modal_code' ? '#238636' : 'rgba(255,255,255,0.08)',
                                            border: 'none',
                                            borderRadius: '4px',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                            fontSize: '0.72rem',
                                            padding: '4px 10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        {copiedCodeId === 'modal_code' && <Check size={12} />}
                                        {copiedCodeId === 'modal_code' ? 'Copied!' : 'Copy Code'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveCodeModal(null)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#8b949e',
                                            cursor: 'pointer',
                                            padding: '4px',
                                            display: 'flex'
                                        }}
                                        title="Close (Esc)"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Code Canvas */}
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '16px', background: '#0d1117' }}>
                                <SyntaxHighlighter
                                    style={vscDarkPlus as any}
                                    language={activeCodeModal.language}
                                    PreTag="div"
                                    customStyle={{
                                        margin: 0,
                                        padding: '12px',
                                        background: 'transparent',
                                        fontSize: '0.88rem',
                                        lineHeight: '1.45',
                                        fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                                    }}
                                >
                                    {activeCodeModal.code}
                                </SyntaxHighlighter>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* CHANNEL CREATION MODAL */}
                {showCreateModal && createPortal(
                    <div className="lfm-overlay" onClick={() => setShowCreateModal(false)} style={{ zIndex: 99999 }}>
                        <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: 0 }}>
                            <div className="lfm-header">
                                <h2 className="lfm-header__title"><Hash size={16} /> Create Channel</h2>
                                <button className="lfm-close-btn" type="button" onClick={() => setShowCreateModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleCreateChannel} style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
                                <div className="lfm-body">
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Channel Name *</label>
                                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '0 10px', borderRadius: '0' }}>
                                            <Hash color="var(--mlab-grey)" size={14} />
                                            <input
                                                type="text"
                                                className="lfm-input"
                                                value={newChannelName}
                                                onChange={e => setNewChannelName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
                                                placeholder="e.g. frontend-help"
                                                style={{ flex: 1, border: 'none', background: 'transparent', boxShadow: 'none', padding: '10px 10px 10px 6px' }}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <label className="lfm-checkbox-row" style={{ marginTop: '4px', alignItems: 'flex-start' }}>
                                        <input type="checkbox" checked={isNewChannelPrivate} onChange={e => setIsNewChannelPrivate(e.target.checked)} style={{ marginTop: '3px' }} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>Make Private</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Only invited members can view and join this group.</span>
                                        </div>
                                    </label>

                                    {/* DYNAMIC MEMBER SELECTION FOR PRIVATE GROUPS */}
                                    {isNewChannelPrivate && (
                                        <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Add Members ({selectedMembers.length})
                                            </span>
                                            <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                                                {cohortUsers.length === 0 ? (
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>No other cohort members found.</div>
                                                ) : (
                                                    cohortUsers.map(u => (
                                                        <label key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '4px', borderRadius: '4px', transition: 'background 0.2s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMembers.includes(u.uid)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setSelectedMembers(prev => [...prev, u.uid]);
                                                                    else setSelectedMembers(prev => prev.filter(id => id !== u.uid));
                                                                }}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{u.fullName}</span>
                                                                <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'capitalize' }}>{u.role}</span>
                                                            </div>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="lfm-footer">
                                    <button type="button" onClick={() => setShowCreateModal(false)} className="lfm-btn lfm-btn--ghost">Cancel</button>
                                    <button type="submit" disabled={isCreatingChannel || !newChannelName.trim()} className="lfm-btn lfm-btn--primary">
                                        {isCreatingChannel ? <Loader2 className="lfm-spin" size={13} /> : <><Plus size={13} /> Create Channel</>}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

                {/* FORWARD MESSAGE MODAL */}
                {showForwardModal && createPortal(
                    <div className="lfm-overlay" onClick={() => { setShowForwardModal(false); setForwardingMsg(null); }} style={{ zIndex: 99999 }}>
                        <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: 0 }}>
                            <div className="lfm-header">
                                <h2 className="lfm-header__title"><Share2 size={16} /> Forward Message</h2>
                                <button className="lfm-close-btn" type="button" onClick={() => { setShowForwardModal(false); setForwardingMsg(null); }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="lfm-body" style={{ maxHeight: '300px', overflowY: 'auto', padding: '16px' }}>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 12px 0' }}>Select a channel to forward to:</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {channels.filter(c => c.id !== activeChannel).length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>No other channels available.</div>
                                    ) : (
                                        channels.filter(c => c.id !== activeChannel).map(channel => (
                                            <button
                                                key={channel.id}
                                                onClick={() => executeForward(channel.id)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    padding: '10px 12px',
                                                    background: '#f8fafc',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    color: '#334155',
                                                    transition: 'background 0.2s'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                                            >
                                                {channel.isPrivate ? <Lock size={14} color="#64748b" /> : <Hash size={14} color="#64748b" />}
                                                {channel.name}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* DEDICATED CODE SNIPPET MODAL */}

                {/* Note: This requires showSnippetModal, snippetLanguage, snippetCode, snippetComment state variables */}
                {typeof showSnippetModal !== 'undefined' && showSnippetModal && createPortal(
                    <div className="lfm-overlay" onClick={() => setShowSnippetModal(false)} style={{ zIndex: 99999 }}>
                        <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px', padding: 0 }}>
                            <div className="lfm-header">
                                <h2 className="lfm-header__title"><Terminal size={16} /> Share Code Snippet</h2>
                                <button className="lfm-close-btn" type="button" onClick={() => setShowSnippetModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleSendSnippet} style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
                                <div className="lfm-body" style={{ gap: '1rem' }}>
                                    <div className="lfm-fg">
                                        <label>Syntax Language</label>
                                        <select
                                            className="lfm-input lfm-select"
                                            value={snippetLanguage}
                                            onChange={e => setSnippetLanguage(e.target.value)}
                                        >
                                            <option value="html">HTML / XML</option>
                                            <option value="javascript">JavaScript (JS / JSX)</option>
                                            <option value="typescript">TypeScript (TS / TSX)</option>
                                            <option value="css">CSS / SCSS</option>
                                            <option value="python">Python</option>
                                            <option value="json">JSON</option>
                                            <option value="sql">SQL</option>
                                            <option value="bash">Bash / Terminal</option>
                                            <option value="markdown">Markdown</option>
                                        </select>
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Code *</label>
                                        <textarea
                                            className="lfm-input"
                                            rows={10}
                                            style={{
                                                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                                                fontSize: '0.85rem',
                                                background: '#0d1117',
                                                color: '#e6edf3',
                                                border: '1px solid #30363d',
                                                padding: '12px',
                                                borderRadius: '6px',
                                                lineHeight: 1.4,
                                                whiteSpace: 'pre',
                                                overflowWrap: 'normal',
                                                overflowX: 'auto'
                                            }}
                                            value={snippetCode}
                                            onChange={e => setSnippetCode(e.target.value)}
                                            placeholder="Paste your snippet here (e.g. <p>hello</p>)..."
                                            required
                                        />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Message / Question (Optional)</label>
                                        <input
                                            type="text"
                                            className="lfm-input"
                                            value={snippetComment}
                                            onChange={e => setSnippetComment(e.target.value)}
                                            placeholder="Add context or questions about this snippet..."
                                        />
                                    </div>
                                </div>
                                <div className="lfm-footer">
                                    <button type="button" onClick={() => setShowSnippetModal(false)} className="lfm-btn lfm-btn--ghost">Cancel</button>
                                    <button type="submit" disabled={isSending || !snippetCode.trim()} className="lfm-btn lfm-btn--primary">
                                        {isSending ? <Loader2 className="lfm-spin" size={13} /> : <><Send size={13} /> Post Snippet</>}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

                {/* SIDEBAR */}
                <div style={{ width: '250px', background: '#f8fafc', borderRight: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%', overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 12px 8px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Channels</span>
                            <button onClick={() => setShowCreateModal(true)} style={{ background: 'transparent', border: 'none', color: 'var(--mlab-green)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="New Channel">
                                <Plus size={16} />
                            </button>
                        </div>

                        {channels.length === 0 ? (
                            hasInitiallyLoadedChannels ? (
                                <div style={{ padding: '12px 8px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                                    No channels available.
                                </div>
                            ) : (
                                // Skeleton placeholders preserve sidebar height so the
                                // panel does not collapse during first load.
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <ChannelSkeletonItem key={`ch-skel-${i}`} />
                                    ))}
                                </div>
                            )
                        ) : (
                            <div className="mlab-fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
                                {channels.map(channel => (
                                    <button
                                        key={channel.id}
                                        onClick={() => setActiveChannel(channel.id)}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '10px 12px',
                                            background: activeChannel === channel.id ? 'var(--mlab-blue)' : 'transparent',
                                            color: activeChannel === channel.id ? '#ffffff' : '#475569',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: '0.85rem',
                                            fontWeight: activeChannel === channel.id ? 700 : 500,
                                            transition: 'all 0.15s ease',
                                            marginBottom: '4px'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (activeChannel !== channel.id) {
                                                e.currentTarget.style.background = '#e2e8f0';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (activeChannel !== channel.id) {
                                                e.currentTarget.style.background = 'transparent';
                                            }
                                        }}
                                    >
                                        {channel.isPrivate ? (
                                            <Lock size={15} style={{ opacity: activeChannel === channel.id ? 1 : 0.6, flexShrink: 0 }} />
                                        ) : (
                                            <Hash size={16} style={{ opacity: activeChannel === channel.id ? 1 : 0.6, flexShrink: 0 }} />
                                        )}
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{channel.name}</span>

                                        {/* SIDEBAR UNREAD BADGE */}
                                        {(() => {
                                            // Active channel is currently being read, never show an unread count on it
                                            if (activeChannel === channel.id) return null;

                                            const channelLastRead = getLastReadTimestamp(channel.id);
                                            const count = allCohortMessages.filter(m => m.channelId === channel.id && m.senderId !== user.uid && getMsgTimeMs(m) > channelLastRead).length;
                                            return count > 0 ? (
                                                <span style={{ background: '#ef4444', color: '#ffffff', fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px' }}>
                                                    {count}
                                                </span>
                                            ) : null;
                                        })()}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* DIRECT MESSAGES SECTION */}
                        <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 8px 8px' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    Direct Messages
                                </span>
                            </div>

                            {(() => {
                                // Compliance Rule: Learners cannot DM Moderators
                                const isLearner = user.role?.toLowerCase() === 'learner';
                                const dmList = [...cohortStaff, ...cohortUsers]
                                    .filter(u => u.uid !== user.uid)
                                    .filter(u => !(isLearner && u.role?.toLowerCase() === 'moderator'));

                                if (dmList.length === 0) {
                                    if (!hasInitiallyLoadedCohortUsers) {
                                        // Cohort roster is still resolving - show stable skeletons
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                {Array.from({ length: 4 }).map((_, i) => (
                                                    <DmSkeletonItem key={`dm-skel-${i}`} />
                                                ))}
                                            </div>
                                        );
                                    }
                                    return (
                                        <div style={{ padding: '8px', fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                            No members available.
                                        </div>
                                    );
                                }

                                return dmList.map(member => {
                                    const dmId = getDmChannelId(member.uid);
                                    const isSelected = activeChannel === dmId;
                                    const channelLastRead = getLastReadTimestamp(dmId);
                                    const unreadCount = allCohortMessages.filter(
                                        m => m.channelId === dmId && m.senderId !== user.uid && getMsgTimeMs(m) > channelLastRead
                                    ).length;

                                    return (
                                        <button
                                            key={member.uid}
                                            onClick={() => openDirectMessage(member)}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '8px 10px',
                                                background: isSelected ? 'var(--mlab-blue)' : 'transparent',
                                                color: isSelected ? '#ffffff' : '#475569',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                fontSize: '0.8rem',
                                                fontWeight: isSelected ? 700 : 500,
                                                marginBottom: '2px',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onMouseEnter={e => {
                                                if (!isSelected) e.currentTarget.style.background = '#e2e8f0';
                                            }}
                                            onMouseLeave={e => {
                                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                                            }}
                                        >
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <div style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '50%',
                                                    background: isSelected ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                                                    color: isSelected ? '#ffffff' : '#073f4e',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 800
                                                }}>
                                                    {member.fullName.substring(0, 2).toUpperCase()}
                                                </div>
                                                {/* Status Dot */}
                                                <span style={{
                                                    position: 'absolute',
                                                    bottom: '-1px',
                                                    right: '-1px',
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    background: onlineUserIds.has(member.uid) ? '#22c55e' : '#94a3b8',
                                                    border: `1.5px solid ${isSelected ? 'var(--mlab-blue)' : '#f8fafc'}`
                                                }} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <span>{member.fullName}</span>
                                            </div>
                                            {unreadCount > 0 && (
                                                <span style={{ background: '#ef4444', color: '#ffffff', fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px' }}>
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </button>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>

                {/* CHAT AREA */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#ffffff', minWidth: 0 }}>

                    {/* HEADER */}
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '10px', background: '#ffffff', height: '65px', flexShrink: 0 }}>
                        {activeChannel.startsWith('dm_') ? (
                            <>
                                <div style={{ position: 'relative' }}>
                                    <div style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '50%',
                                        background: 'var(--mlab-blue)',
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 800,
                                        fontSize: '0.8rem'
                                    }}>
                                        {(activeDmUser?.fullName || activeChannelData?.name || 'DM').substring(0, 2).toUpperCase()}
                                    </div>
                                    <span style={{
                                        position: 'absolute',
                                        bottom: '0',
                                        right: '0',
                                        width: '9px',
                                        height: '9px',
                                        borderRadius: '50%',
                                        background: activeDmUser?.uid && onlineUserIds.has(activeDmUser.uid) ? '#22c55e' : '#94a3b8',
                                        border: '2px solid #ffffff'
                                    }} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>
                                        {activeDmUser?.fullName || activeChannelData?.name || 'Direct Message'}
                                    </h2>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                        <span style={{
                                            width: '6px',
                                            height: '6px',
                                            borderRadius: '50%',
                                            background: activeDmUser?.uid && onlineUserIds.has(activeDmUser.uid) ? '#22c55e' : '#94a3b8'
                                        }} />
                                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: activeDmUser?.uid && onlineUserIds.has(activeDmUser.uid) ? '#15803d' : '#64748b' }}>
                                            {activeDmUser?.uid && onlineUserIds.has(activeDmUser.uid) ? 'Online' : 'Offline'}
                                        </span>
                                        {activeDmUser?.role && (
                                            <>
                                                <span style={{ color: '#cbd5e1' }}>•</span>
                                                <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'capitalize' }}>
                                                    {activeDmUser.role}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : activeChannelData ? (
                            <>
                                {activeChannelData.isPrivate ? <Lock color="var(--mlab-blue)" size={20} /> : <Hash color="var(--mlab-blue)" size={22} />}
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                                    {activeChannelData.name}
                                </h2>
                                {activeChannelData.isPrivate && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.65rem', background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Private Group
                                    </span>
                                )}

                                {/* ADD MEMBERS BUTTON */}
                                {activeChannelData.isPrivate && (
                                    <button
                                        onClick={() => setShowManageMembersModal(true)}
                                        style={{ marginLeft: 'auto', background: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700 }}
                                    >
                                        <Users size={14} /> Add / Manage Members
                                    </button>
                                )}
                            </>
                        ) : (
                            <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>Select or create a channel</div>
                        )}
                    </div>

                    {/* ENHANCED MANAGE MEMBERS MODAL */}
                    {showManageMembersModal && activeChannelData && createPortal(
                        <div className="lfm-overlay" onClick={() => { setShowManageMembersModal(false); setMemberSearchQuery(''); }} style={{ zIndex: 99999 }}>
                            <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', padding: 0, overflow: 'hidden' }}>

                                {/* MODAL HEADER */}
                                <div className="lfm-header" style={{ padding: '16px 20px' }}>
                                    <div>
                                        <h2 className="lfm-header__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Users size={18} /> Manage Channel Members
                                        </h2>
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px', display: 'block' }}>
                                            #{activeChannelData.name} • Private Group
                                        </span>
                                    </div>
                                    <button className="lfm-close-btn" type="button" onClick={() => { setShowManageMembersModal(false); setMemberSearchQuery(''); }}>
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* SEARCH BAR & FILTER TABS */}
                                <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 12px' }}>
                                        <Search size={15} color="#94a3b8" />
                                        <input
                                            type="text"
                                            placeholder="Search by learner name..."
                                            value={memberSearchQuery}
                                            onChange={e => setMemberSearchQuery(e.target.value)}
                                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '8px 10px', fontSize: '0.85rem', color: '#0f172a' }}
                                        />
                                        {memberSearchQuery && (
                                            <button onClick={() => setMemberSearchQuery('')} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}>
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {(() => {
                                        const channelMembers = activeChannelData.members || [];
                                        const inChannelCount = cohortUsers.filter(u => channelMembers.includes(u.uid)).length;
                                        const availableCount = cohortUsers.filter(u => !channelMembers.includes(u.uid)).length;

                                        return (
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setMemberFilterTab('all')}
                                                    style={{
                                                        background: memberFilterTab === 'all' ? 'var(--mlab-blue)' : '#ffffff',
                                                        color: memberFilterTab === 'all' ? '#ffffff' : '#64748b',
                                                        border: '1px solid #cbd5e1',
                                                        padding: '4px 10px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    All ({cohortUsers.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMemberFilterTab('in_channel')}
                                                    style={{
                                                        background: memberFilterTab === 'in_channel' ? 'var(--mlab-blue)' : '#ffffff',
                                                        color: memberFilterTab === 'in_channel' ? '#ffffff' : '#64748b',
                                                        border: '1px solid #cbd5e1',
                                                        padding: '4px 10px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    In Channel ({inChannelCount})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMemberFilterTab('available')}
                                                    style={{
                                                        background: memberFilterTab === 'available' ? 'var(--mlab-blue)' : '#ffffff',
                                                        color: memberFilterTab === 'available' ? '#ffffff' : '#64748b',
                                                        border: '1px solid #cbd5e1',
                                                        padding: '4px 10px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Available to Add ({availableCount})
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* MEMBERS LIST BODY */}
                                <div className="lfm-body" style={{ maxHeight: '380px', overflowY: 'auto', padding: '16px 20px' }}>
                                    {isLoadingCohortUsers ? (
                                        // Skeleton member rows preserve modal body height so the
                                        // surrounding panel does not jump while users resolve.
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <MemberRowSkeleton key={`member-skel-${i}`} />
                                            ))}
                                        </div>
                                    ) : (() => {
                                        const channelMembers = activeChannelData.members || [];
                                        const searchLower = memberSearchQuery.toLowerCase().trim();

                                        const filtered = cohortUsers.filter(u => {
                                            const matchesSearch = !searchLower || u.fullName.toLowerCase().includes(searchLower);
                                            const isMember = channelMembers.includes(u.uid);

                                            if (!matchesSearch) return false;
                                            if (memberFilterTab === 'in_channel') return isMember;
                                            if (memberFilterTab === 'available') return !isMember;
                                            return true;
                                        });

                                        if (filtered.length === 0) {
                                            return (
                                                <div style={{ padding: '36px 0', textAlign: 'center', color: '#94a3b8' }}>
                                                    <Users size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                                                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>
                                                        {memberSearchQuery ? `No learners matching "${memberSearchQuery}"` : 'No learners found for this tab.'}
                                                    </p>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {filtered.map(u => {
                                                    const isMember = channelMembers.includes(u.uid);
                                                    const isMutating = updatingMemberId === u.uid;

                                                    return (
                                                        <div
                                                            key={u.uid}
                                                            style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                padding: '10px 14px',
                                                                background: isMember ? '#f8fafc' : '#ffffff',
                                                                borderRadius: '6px',
                                                                border: isMember ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
                                                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                            }}
                                                        >
                                                            {/* Learner Info */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <div style={{
                                                                    width: '32px',
                                                                    height: '32px',
                                                                    borderRadius: '50%',
                                                                    background: isMember ? 'var(--mlab-light-blue, #e0f2fe)' : '#f1f5f9',
                                                                    color: isMember ? 'var(--mlab-blue)' : '#64748b',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    flexShrink: 0
                                                                }}>
                                                                    {u.fullName.substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                                                        {u.fullName}
                                                                    </span>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                                        <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'capitalize' }}>
                                                                            {u.role}
                                                                        </span>
                                                                        <span style={{ width: '3px', height: '3px', background: '#cbd5e1', borderRadius: '50%' }} />
                                                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: isMember ? '#15803d' : '#94a3b8' }}>
                                                                            {isMember ? 'In Channel' : 'Not added'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Action Button */}
                                                            <button
                                                                type="button"
                                                                disabled={isMutating}
                                                                onClick={() => toggleMember(u.uid, isMember)}
                                                                style={{
                                                                    background: isMember ? '#fee2e2' : '#f0fdf4',
                                                                    color: isMember ? '#b91c1c' : '#16a34a',
                                                                    border: isMember ? '1px solid #fecaca' : '1px solid #bbf7d0',
                                                                    padding: '6px 12px',
                                                                    borderRadius: '5px',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 700,
                                                                    cursor: isMutating ? 'not-allowed' : 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px',
                                                                    minWidth: '82px',
                                                                    justifyContent: 'center',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                {isMutating ? (
                                                                    <Loader2 size={13} className="lfm-spin" />
                                                                ) : isMember ? (
                                                                    <><UserMinus size={13} /> Remove</>
                                                                ) : (
                                                                    <><UserPlus size={13} /> Add</>
                                                                )}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* MODAL FOOTER */}
                                <div className="lfm-footer" style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 20px', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => { setShowManageMembersModal(false); setMemberSearchQuery(''); }}
                                        className="lfm-btn lfm-btn--ghost"
                                        style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                    {/* MESSAGES FEED WRAPPER WITH FLOATING BADGES */}
                    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '420px' }}>

                        {/* FLOATING BADGE: UNREAD MESSAGES ABOVE */}
                        {unreadAboveCount > 0 && (
                            <div
                                onClick={scrollToFirstUnread}
                                style={{
                                    position: 'absolute',
                                    top: '14px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 30,
                                    background: 'var(--mlab-blue)',
                                    color: '#ffffff',
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    boxShadow: '0 4px 12px rgba(7, 63, 78, 0.25)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    transition: 'transform 0.15s ease'
                                }}
                            >
                                <ChevronUp size={15} />
                                <span>{unreadAboveCount} unread message{unreadAboveCount > 1 ? 's' : ''} above</span>
                            </div>
                        )}

                        {/* FLOATING BADGE: NEW MESSAGES BELOW */}
                        {unreadBelowCount > 0 && (
                            <div
                                onClick={() => scrollToBottom(true)}
                                style={{
                                    position: 'absolute',
                                    bottom: '14px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 30,
                                    background: '#10b981',
                                    color: '#ffffff',
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    transition: 'transform 0.15s ease'
                                }}
                            >
                                <ChevronDown size={15} />
                                <span>{unreadBelowCount} new message{unreadBelowCount > 1 ? 's' : ''} below</span>
                            </div>
                        )}

                        <div
                            ref={feedContainerRef}
                            onScroll={updateUnreadScrollPositions}
                            style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}
                        >
                            {!activeChannel ? (
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#cbd5e1', gap: '16px' }}>
                                    <MessageSquare opacity={0.5} size={48} />
                                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#94a3b8' }}>Select a channel from the sidebar to begin.</p>
                                </div>
                            ) : isLoadingFeed ? (
                                // Skeleton message rows preserve the feed's vertical footprint
                                // so the composer / header / sidebar do NOT shift while the
                                // channel's first batch of messages arrives from Firestore.
                                <div className="mlab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0', minHeight: '420px' }}>
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <MessageSkeletonRow
                                            key={`msg-skel-${i}`}
                                            isOwn={i % 3 === 1}
                                            widthVariance={0.7 + ((i * 37) % 60) / 100}
                                        />
                                    ))}
                                </div>
                            ) : messages.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8', gap: '16px' }}>
                                    <div style={{ background: '#f1f5f9', padding: '20px', borderRadius: '50%' }}>
                                        <MessageSquare color="#cbd5e1" size={32} />
                                    </div>
                                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>
                                        Welcome to {activeDmUser?.fullName ? activeDmUser.fullName : activeChannelData?.isPrivate ? 'this private group' : `#${activeChannelData?.name || 'chat'}`}!
                                    </p>
                                    <span style={{ fontSize: '0.85rem' }}>Be the first to start the conversation.</span>
                                </div>
                            ) : (
                                <div className="mlab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {messages.map((msg, idx) => {
                                        const isOwnMessage = msg.senderId === user.uid;
                                        const showUnreadDivider = initialUnreadId !== null && msg.id === initialUnreadId;

                                        return (
                                            <React.Fragment key={msg.id}>
                                                {/* STABLE UNREAD DIVIDER LINE */}
                                                {showUnreadDivider && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '12px 0' }}>
                                                        <div style={{ flex: 1, height: '1px', background: '#f87171' }} />
                                                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 10px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                            New Messages
                                                        </span>
                                                        <div style={{ flex: 1, height: '1px', background: '#f87171' }} />
                                                    </div>
                                                )}

                                                <div
                                                    ref={(el) => {
                                                        if (el) messageElementsRef.current.set(msg.id, el);
                                                        else messageElementsRef.current.delete(msg.id);
                                                    }}
                                                    data-msg-id={msg.id}
                                                    style={{ display: 'flex', gap: '14px', flexDirection: isOwnMessage ? 'row-reverse' : 'row', alignItems: 'flex-end', position: 'relative' }}
                                                    onMouseEnter={() => setHoveredMsgId(msg.id)}
                                                    onMouseLeave={() => setHoveredMsgId(null)}
                                                >
                                                    {/* Hover Actions Menu */}
                                                    {hoveredMsgId === msg.id && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: '-15px',
                                                            [isOwnMessage ? 'right' : 'left']: '45px',
                                                            background: '#ffffff',
                                                            border: '1px solid #cbd5e1',
                                                            borderRadius: '6px',
                                                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '2px',
                                                            padding: '2px',
                                                            zIndex: 10
                                                        }}>
                                                            {['👍', '❤️', '🔥', '😂'].map(emoji => (
                                                                <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px', borderRadius: '4px', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                            <div style={{ width: '1px', height: '16px', background: '#cbd5e1', margin: '0 4px' }} />
                                                            <button onClick={() => setReplyingTo(msg)} title="Reply" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', display: 'flex', borderRadius: '4px' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                <CornerUpLeft size={16} />
                                                            </button>
                                                            <button onClick={() => { setForwardingMsg(msg); setShowForwardModal(true); }} title="Forward" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', display: 'flex', borderRadius: '4px' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                <Share2 size={16} />
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Muted Circular Avatar */}
                                                    <div style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '50%',
                                                        background: '#F5EFE6',
                                                        color: '#78716C',
                                                        border: '1px solid #E8DFD3',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        flexShrink: 0
                                                    }}>
                                                        {msg.senderName.substring(0, 2).toUpperCase()}
                                                    </div>

                                                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '82%', alignItems: isOwnMessage ? 'flex-end' : 'flex-start' }}>
                                                        {/* Header Bar */}
                                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px', justifyContent: isOwnMessage ? 'flex-end' : 'flex-start', width: '100%' }}>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e293b' }}>{isOwnMessage ? 'You' : msg.senderName}</span>
                                                            {!isOwnMessage && getRoleBadge(msg.senderRole)}
                                                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
                                                                {msg.createdAt?.toDate ? moment(msg.createdAt.toDate()).format('HH:mm') : 'Sending...'}
                                                            </span>
                                                        </div>

                                                        {/* Forward / Reply Badges */}
                                                        {msg.forwardedFrom && (
                                                            <div style={{ fontSize: '0.68rem', fontStyle: 'italic', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <Share2 size={10} /> Forwarded from #{msg.forwardedFrom.channelName}
                                                            </div>
                                                        )}

                                                        {/* Chat Bubble Body */}
                                                        <div style={{
                                                            background: isOwnMessage ? 'var(--mlab-blue)' : '#FAF7F2',
                                                            color: isOwnMessage ? '#ffffff' : '#292524',
                                                            padding: '12px 16px',
                                                            borderRadius: '14px',
                                                            borderBottomRightRadius: isOwnMessage ? '3px' : '14px',
                                                            borderBottomLeftRadius: isOwnMessage ? '14px' : '3px',
                                                            border: isOwnMessage ? '1px solid var(--mlab-blue)' : '1px solid #E8DFD3',
                                                            fontSize: '0.9rem',
                                                            lineHeight: 1.5,
                                                            boxShadow: isOwnMessage ? '0 2px 6px rgba(37,99,235,0.2)' : '0 1px 2px rgba(0,0,0,0.04)',
                                                            wordBreak: 'break-word',
                                                            overflowWrap: 'anywhere'
                                                        }}>
                                                            {msg.replyTo && (
                                                                <div style={{
                                                                    borderLeft: '3px solid #38bdf8',
                                                                    padding: '6px 10px',
                                                                    marginBottom: '8px',
                                                                    background: isOwnMessage ? 'rgba(255,255,255,0.15)' : '#EDE4D6',
                                                                    borderRadius: '0 4px 4px 0',
                                                                    fontSize: '0.75rem'
                                                                }}>
                                                                    <span style={{ fontWeight: 800, color: isOwnMessage ? '#38bdf8' : '#0284c7', display: 'block', marginBottom: '2px' }}>{msg.replyTo.senderName}</span>
                                                                    <span style={{ opacity: 0.85, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                                        {msg.replyTo.text}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {/* RENDER ATTACHMENTS WITH PREVIEW & DOWNLOAD */}
                                                            {/* INLINE EMBEDDED ATTACHMENT CARDS */}
                                                            {msg.attachments && msg.attachments.length > 0 && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: msg.text ? '10px' : '0' }}>
                                                                    {msg.attachments.map((att, attIdx) => {
                                                                        const lowerName = att.name.toLowerCase();
                                                                        const isImage = att.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(lowerName);
                                                                        const isPdf = att.type === 'application/pdf' || lowerName.endsWith('.pdf');

                                                                        if (isImage) {
                                                                            return (
                                                                                <div
                                                                                    key={attIdx}
                                                                                    onClick={() => setPreviewFile(att)}
                                                                                    style={{
                                                                                        position: 'relative',
                                                                                        borderRadius: '8px',
                                                                                        overflow: 'hidden',
                                                                                        border: isOwnMessage ? '1px solid rgba(255,255,255,0.2)' : '1px solid #cbd5e1',
                                                                                        cursor: 'pointer',
                                                                                        maxHeight: '220px',
                                                                                        maxWidth: '320px',
                                                                                        background: '#0f172a'
                                                                                    }}
                                                                                    title="Click to view full image"
                                                                                >
                                                                                    <img
                                                                                        src={att.url}
                                                                                        alt={att.name}
                                                                                        style={{ width: '100%', height: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }}
                                                                                    />
                                                                                    <div style={{
                                                                                        position: 'absolute',
                                                                                        bottom: '6px',
                                                                                        right: '6px',
                                                                                        background: 'rgba(0,0,0,0.65)',
                                                                                        color: '#ffffff',
                                                                                        borderRadius: '4px',
                                                                                        padding: '3px 7px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '4px',
                                                                                        fontSize: '0.65rem',
                                                                                        fontWeight: 700
                                                                                    }}>
                                                                                        <Eye size={11} /> View
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        }

                                                                        if (isPdf) {
                                                                            return (
                                                                                <div
                                                                                    key={attIdx}
                                                                                    style={{
                                                                                        width: '260px',
                                                                                        borderRadius: '8px',
                                                                                        overflow: 'hidden',
                                                                                        border: isOwnMessage ? '1px solid rgba(255,255,255,0.3)' : '1px solid #cbd5e1',
                                                                                        background: isOwnMessage ? 'rgba(255,255,255,0.1)' : '#ffffff',
                                                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
                                                                                    }}
                                                                                >
                                                                                    {/* Mini Viewport */}
                                                                                    <div
                                                                                        onClick={() => setPreviewFile(att)}
                                                                                        style={{ height: '140px', overflow: 'hidden', position: 'relative', cursor: 'pointer', background: '#f8fafc' }}
                                                                                        title="Click to view PDF"
                                                                                    >
                                                                                        <iframe
                                                                                            src={`${att.url}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                                                                                            title={att.name}
                                                                                            style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                                                                                        />
                                                                                        <div style={{
                                                                                            position: 'absolute',
                                                                                            inset: 0,
                                                                                            background: 'rgba(7,63,78,0.15)',
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            justifyContent: 'center',
                                                                                            opacity: 0,
                                                                                            transition: 'opacity 0.2s ease'
                                                                                        }}
                                                                                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                                                            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                                                                                        >
                                                                                            <span style={{ background: '#073f4e', color: '#ffffff', padding: '5px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                <Eye size={12} /> Expand PDF
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                    {/* Footer bar */}
                                                                                    <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                                                                                        <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                                                                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                                {att.name}
                                                                                            </span>
                                                                                            <span style={{ fontSize: '0.65rem', opacity: 0.75 }}>{formatBytes(att.size)}</span>
                                                                                        </div>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setPreviewFile(att)}
                                                                                                style={{ background: 'transparent', border: 'none', color: isOwnMessage ? '#ffffff' : '#0284c7', cursor: 'pointer', padding: '4px' }}
                                                                                                title="Full Screen"
                                                                                            >
                                                                                                <Eye size={14} />
                                                                                            </button>
                                                                                            <a
                                                                                                href={att.url}
                                                                                                download={att.name}
                                                                                                target="_blank"
                                                                                                rel="noopener noreferrer"
                                                                                                style={{ color: isOwnMessage ? '#ffffff' : '#0284c7', padding: '4px', display: 'flex' }}
                                                                                                title="Download"
                                                                                            >
                                                                                                <Download size={14} />
                                                                                            </a>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        }

                                                                        // Generic Document Card
                                                                        return (
                                                                            <div key={attIdx} style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'space-between',
                                                                                gap: '12px',
                                                                                background: isOwnMessage ? 'rgba(255,255,255,0.12)' : '#ffffff',
                                                                                border: isOwnMessage ? '1px solid rgba(255,255,255,0.2)' : '1px solid #cbd5e1',
                                                                                padding: '8px 12px',
                                                                                borderRadius: '6px'
                                                                            }}>
                                                                                <div
                                                                                    onClick={() => setPreviewFile(att)}
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, cursor: 'pointer', flex: 1 }}
                                                                                    title="Click to view file"
                                                                                >
                                                                                    <FileText size={18} color={isOwnMessage ? '#ffffff' : 'var(--mlab-blue)'} />
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                                                                                            {att.name}
                                                                                        </span>
                                                                                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                                                            {formatBytes(att.size)}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>

                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setPreviewFile(att)}
                                                                                        style={{
                                                                                            background: isOwnMessage ? 'rgba(255,255,255,0.22)' : '#e0f2fe',
                                                                                            border: 'none',
                                                                                            color: isOwnMessage ? '#ffffff' : '#0284c7',
                                                                                            padding: '4px 8px',
                                                                                            borderRadius: '4px',
                                                                                            cursor: 'pointer',
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '4px',
                                                                                            fontSize: '0.7rem',
                                                                                            fontWeight: 700
                                                                                        }}
                                                                                    >
                                                                                        <Eye size={12} /> View
                                                                                    </button>

                                                                                    <a
                                                                                        href={att.url}
                                                                                        target="_blank"
                                                                                        download={att.name}
                                                                                        rel="noopener noreferrer"
                                                                                        style={{
                                                                                            color: isOwnMessage ? '#ffffff' : 'var(--mlab-blue)',
                                                                                            padding: '4px 6px',
                                                                                            display: 'flex',
                                                                                            alignItems: 'center'
                                                                                        }}
                                                                                    >
                                                                                        <Download size={14} />
                                                                                    </a>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}

                                                            <ReactMarkdown
                                                                components={{
                                                                    code({ node, inline, className, children, ...props }: any) {
                                                                        const match = /language-(\w+)/.exec(className || '');
                                                                        const codeString = String(children).replace(/\n$/, '');

                                                                        if (!inline) {
                                                                            const language = match ? match[1] : 'markup';
                                                                            const uniqueBlockId = `${msg.id}_${language}_${codeString.slice(0, 10)}`;
                                                                            const isCopied = typeof copiedCodeId !== 'undefined' && copiedCodeId === uniqueBlockId;
                                                                            return (
                                                                                <ChatCodeBlock
                                                                                    language={language}
                                                                                    codeString={codeString}
                                                                                    isCopied={isCopied}
                                                                                    onCopy={() => handleCopyCode(codeString, uniqueBlockId)}
                                                                                    onOpenModal={(code, lang, count) => setActiveCodeModal({ code, language: lang, lineCount: count })}
                                                                                />
                                                                            );
                                                                        }

                                                                        return (
                                                                            <code
                                                                                style={{
                                                                                    background: isOwnMessage ? 'rgba(255,255,255,0.2)' : '#EDE4D6',
                                                                                    color: isOwnMessage ? '#ffffff' : '#292524',
                                                                                    padding: '2px 6px',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '0.85em',
                                                                                    fontFamily: 'monospace'
                                                                                }}
                                                                                {...props}
                                                                            >
                                                                                {children}
                                                                            </code>
                                                                        );
                                                                    },
                                                                    p({ children }: any) {
                                                                        return <p style={{ margin: '0 0 6px 0', padding: 0 }}>{children}</p>;
                                                                    },
                                                                    a({ href, children, ...props }: any) {
                                                                        // Highlight @ Mentions with a pill badge
                                                                        if (href === '#mention') {
                                                                            return (
                                                                                <span style={{
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '2px',
                                                                                    background: isOwnMessage ? 'rgba(255, 255, 255, 0.28)' : '#e0f2fe',
                                                                                    color: isOwnMessage ? '#ffffff' : '#0284c7',
                                                                                    border: isOwnMessage ? '1px solid rgba(255,255,255,0.45)' : '1px solid #bae6fd',
                                                                                    padding: '1px 7px',
                                                                                    borderRadius: '12px',
                                                                                    fontWeight: 800,
                                                                                    fontSize: '0.82em',
                                                                                    margin: '0 2px',
                                                                                    verticalAlign: 'middle',
                                                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                                                                }}>
                                                                                    <AtSign size={11} style={{ opacity: 0.85 }} />
                                                                                    <span>{String(children).replace(/^@/, '')}</span>
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: isOwnMessage ? '#ffffff' : '#0284c7', textDecoration: 'underline' }} {...props}>
                                                                                {children}
                                                                            </a>
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                {formatChatText(msg.text, [...allMentionableUsers.map(u => u.fullName), user.fullName])}
                                                            </ReactMarkdown>

                                                            {/* RICH LINK PREVIEW CARDS */}
                                                            {(() => {
                                                                const urls = extractUrls(msg.text);
                                                                if (urls.length === 0) return null;
                                                                return (
                                                                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                        {urls.map((linkUrl, lIdx) => {
                                                                            let host = linkUrl;
                                                                            try { host = new URL(linkUrl).hostname; } catch { }
                                                                            return (
                                                                                <a
                                                                                    key={lIdx}
                                                                                    href={linkUrl}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    style={{
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '8px',
                                                                                        padding: '6px 10px',
                                                                                        background: isOwnMessage ? 'rgba(255,255,255,0.1)' : '#ffffff',
                                                                                        border: isOwnMessage ? '1px solid rgba(255,255,255,0.2)' : '1px solid #cbd5e1',
                                                                                        borderRadius: '4px',
                                                                                        textDecoration: 'none',
                                                                                        color: isOwnMessage ? '#ffffff' : '#0284c7',
                                                                                        fontSize: '0.75rem',
                                                                                        fontWeight: 600
                                                                                    }}
                                                                                >
                                                                                    <ExternalLink size={13} style={{ flexShrink: 0 }} />
                                                                                    <span style={{ textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host}</span>
                                                                                </a>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>

                                                        {/* Reactions Row */}
                                                        {msg.reactions && Object.entries(msg.reactions).some(([_, uids]) => uids.length > 0) && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px', alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' }}>
                                                                {Object.entries(msg.reactions).map(([emoji, uids]) => {
                                                                    if (!uids || uids.length === 0) return null;
                                                                    const reacted = uids.includes(user.uid);
                                                                    return (
                                                                        <button
                                                                            key={emoji}
                                                                            type="button"
                                                                            onClick={() => toggleReaction(msg.id, emoji)}
                                                                            style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                padding: '2px 7px',
                                                                                borderRadius: '12px',
                                                                                fontSize: '0.75rem',
                                                                                background: reacted ? '#e0f2fe' : '#f1f5f9',
                                                                                border: reacted ? '1px solid #38bdf8' : '1px solid #cbd5e1',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            <span>{emoji}</span>
                                                                            <span style={{ fontWeight: 700, color: '#334155' }}>{uids.length}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* COMPOSER WITH FORMATTING TOOLBAR */}
                    <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', position: 'relative' }}>
                        <div style={{
                            background: 'white',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            position: 'relative'
                        }}>
                            {replyingTo && (
                                <div style={{
                                    padding: '8px 12px',
                                    background: '#f1f5f9',
                                    borderBottom: '1px solid #cbd5e1',
                                    borderTopLeftRadius: '8px',
                                    borderTopRightRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        <CornerUpLeft size={14} color="#64748b" />
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            Replying to <strong>{replyingTo.senderName}</strong>: {replyingTo.text}
                                        </span>
                                    </div>
                                    <button onClick={() => setReplyingTo(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            )}

                            {/* FORMATTING TOOLBAR */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                borderBottom: '1px solid #f1f5f9',
                                background: '#fafafa'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => typeof insertFormatting === 'function' && insertFormatting('**', '**', 'bold text')}
                                    disabled={!activeChannel}
                                    title="Bold"
                                    style={{ background: 'transparent', border: 'none', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', color: '#64748b', display: 'flex' }}
                                >
                                    <Bold size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => typeof insertFormatting === 'function' && insertFormatting('*', '*', 'italic text')}
                                    disabled={!activeChannel}
                                    title="Italic"
                                    style={{ background: 'transparent', border: 'none', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', color: '#64748b', display: 'flex' }}
                                >
                                    <Italic size={15} />
                                </button>
                                <div style={{ width: '1px', height: '14px', background: '#cbd5e1', margin: '0 4px' }} />
                                <button
                                    type="button"
                                    onClick={() => typeof insertFormatting === 'function' && insertFormatting('`', '`', 'inline code')}
                                    disabled={!activeChannel}
                                    title="Inline Code"
                                    style={{ background: 'transparent', border: 'none', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', color: '#64748b', display: 'flex' }}
                                >
                                    <Code size={15} />
                                </button>

                                {/* SLACK-STYLE SNIPPET BUTTON */}
                                {typeof setShowSnippetModal !== 'undefined' && (
                                    <button
                                        type="button"
                                        onClick={() => setShowSnippetModal(true)}
                                        disabled={!activeChannel}
                                        title="Create Code Snippet"
                                        style={{
                                            background: '#e0f2fe',
                                            border: '1px solid #bae6fd',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            color: '#0284c7',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700
                                        }}
                                    >
                                        <Terminal size={13} /> {`{ ; }`} Snippet
                                    </button>
                                )}
                            </div>

                            {/* @ MENTION AUTOCOMPLETE POPOVER */}
                            {mentionSearch !== null && filteredMentionUsers.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 'calc(100% + 8px)',
                                    left: '12px',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    width: '280px',
                                    zIndex: 1000
                                }}>
                                    <div style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                                        Mention someone
                                    </div>
                                    {filteredMentionUsers.map((person, mIdx) => (
                                        <div
                                            key={person.uid}
                                            onClick={() => insertMention(person)}
                                            style={{
                                                padding: '8px 12px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                background: mentionSelectedIdx === mIdx ? 'var(--mlab-light-blue)' : 'transparent'
                                            }}
                                            onMouseEnter={() => setMentionSelectedIdx(mIdx)}
                                        >
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                                                {person.fullName}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'capitalize' }}>
                                                {person.role}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* STAGED ATTACHMENT PREVIEW BANNER */}
                            {stagedAttachment && (
                                <div style={{
                                    padding: '8px 14px',
                                    background: '#f0fdf4',
                                    borderBottom: '1px solid #bbf7d0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '10px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                        <FileText size={16} color="#16a34a" />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                                            {stagedAttachment.name}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            ({formatBytes(stagedAttachment.size)})
                                        </span>
                                    </div>
                                    {isUploadingAttachment ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                                            <Loader2 size={13} className="lfm-spin" /> {uploadProgress}%
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => { setStagedAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                            style={{ background: 'transparent', border: 'none', color: '#b91c1c', cursor: 'pointer', padding: 0 }}
                                        >
                                            <X size={15} />
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* ATTACHMENT ERROR BANNER */}
                            {attachmentError && (
                                <div style={{ padding: '6px 14px', background: '#fee2e2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#991b1b', fontSize: '0.75rem', fontWeight: 600 }}>
                                    <span>{attachmentError}</span>
                                    <button type="button" onClick={() => setAttachmentError(null)} style={{ background: 'transparent', border: 'none', color: '#991b1b', cursor: 'pointer' }}><X size={13} /></button>
                                </div>
                            )}

                            {/* INPUT ROW */}
                            <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'flex-end', padding: '8px 12px', gap: '8px' }}>
                                {/* HIDDEN FILE INPUT */}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    style={{ display: 'none' }}
                                />

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={!activeChannel || isUploadingAttachment}
                                    style={{
                                        background: stagedAttachment ? '#dcfce7' : 'transparent',
                                        border: 'none',
                                        color: stagedAttachment ? '#15803d' : '#64748b',
                                        padding: '8px 6px',
                                        cursor: !activeChannel ? 'not-allowed' : 'pointer',
                                        alignSelf: 'center',
                                        borderRadius: '4px'
                                    }}
                                    title="Attach a file (Max 10MB)"
                                >
                                    <Paperclip size={18} />
                                </button>

                                <textarea
                                    ref={textareaRef}
                                    rows={Math.min(6, Math.max(1, newMessage.split('\n').length))}
                                    placeholder={
                                        activeChannel
                                            ? activeDmUser?.fullName
                                                ? `Message @${activeDmUser.fullName}...`
                                                : activeChannelData?.name
                                                    ? `Message #${activeChannelData.name} (type @ to mention)...`
                                                    : 'Type a message...'
                                            : 'Select a channel first...'
                                    }
                                    value={newMessage}

                                    onChange={handleTextareaChange}
                                    onKeyDown={handleKeyDown}
                                    disabled={!activeChannel}
                                    style={{
                                        flex: 1,
                                        border: 'none',
                                        outline: 'none',
                                        resize: 'none',
                                        fontSize: '0.9rem',
                                        padding: '6px 4px',
                                        minHeight: '40px',
                                        maxHeight: '120px',
                                        overflowY: 'auto',
                                        background: 'transparent',
                                        color: '#0f172a',
                                        lineHeight: 1.4
                                    }}
                                />

                                <button
                                    type="submit"
                                    disabled={isSending || (!newMessage.trim() && !stagedAttachment) || !activeChannel}
                                    style={{
                                        background: (!newMessage.trim() && !stagedAttachment) || isSending || !activeChannel ? '#e2e8f0' : 'var(--mlab-green)',
                                        color: (!newMessage.trim() && !stagedAttachment) || isSending || !activeChannel ? '#94a3b8' : 'var(--mlab-blue)',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '8px 14px',
                                        height: '38px',
                                        cursor: (!newMessage.trim() && !stagedAttachment) || isSending || !activeChannel ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s ease',
                                        flexShrink: 0
                                    }}
                                >
                                    {isSending ? <Loader2 className="lfm-spin" size={16} /> : <Send size={16} />}
                                </button>
                            </form>
                        </div>

                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '8px', textAlign: 'right', paddingRight: '4px' }}>
                            <strong>Return</strong> to send • <strong>Shift + Return</strong> for new line • Use <strong>Snippet</strong> for code formatting
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};