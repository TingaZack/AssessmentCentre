// src/components/common/NotificationBell/NotificationBell.tsx

import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { Bell, Check, Trash2, X, ExternalLink, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import './NotificationBell.css';

interface NotificationItem {
    id: string;
    userId: string;
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'success' | 'alert';
    read: boolean;
    createdAt: string;
    link?: string;
}

export const NotificationBell: React.FC = () => {
    const { user } = useStore() as any;
    const navigate = useNavigate();

    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 🚀 SAFE REAL-TIME FIRESTORE LISTENER WITH MOUNT GUARD
    useEffect(() => {
        if (!user?.uid) return;

        let isMounted = true;

        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', user.uid)
        );

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                if (!isMounted) return;

                const fetched: NotificationItem[] = snapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data()
                } as NotificationItem));

                fetched.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                setNotifications(fetched);
            },
            (error) => {
                // Suppress internal stream assertion errors on unmount
                console.warn("NotificationBell Firestore stream handled:", error.message);
            }
        );

        return () => {
            isMounted = false;
            try {
                unsubscribe();
            } catch (e) {
                // Ignore disconnect assertions on React Fiber unmount
            }
        };
    }, [user?.uid]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            await updateDoc(doc(db, 'notifications', id), { read: true });
        } catch (err) {
            console.error("Failed to mark notification read:", err);
        }
    };

    const handleMarkAllAsRead = async () => {
        const unread = notifications.filter(n => !n.read);
        if (unread.length === 0) return;

        try {
            const batch = writeBatch(db);
            unread.forEach(n => {
                batch.update(doc(db, 'notifications', n.id), { read: true });
            });
            await batch.commit();
        } catch (err) {
            console.error("Failed to mark all notifications read:", err);
        }
    };

    const handleNotificationClick = (item: NotificationItem) => {
        if (!item.read) handleMarkAsRead(item.id);
        if (item.link) {
            setIsOpen(false);
            navigate(item.link);
        }
    };

    const getIcon = (type?: string) => {
        switch (type) {
            case 'warning': return <AlertTriangle size={16} color="#eab308" />;
            case 'success': return <CheckCircle2 size={16} color="#22c55e" />;
            case 'alert': return <AlertTriangle size={16} color="#ef4444" />;
            default: return <Info size={16} color="#3b82f6" />;
        }
    };

    return (
        <div className="nb-wrapper" ref={dropdownRef}>
            <button 
                className={`nb-bell-btn ${unreadCount > 0 ? 'nb-bell-btn--unread' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Notifications"
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span className="nb-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="nb-dropdown animate-fade-in">
                    <div className="nb-dropdown-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bell size={16} color="var(--mlab-blue)" />
                            <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>Notifications</strong>
                            {unreadCount > 0 && (
                                <span className="nb-header-count">{unreadCount} new</span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button className="nb-link-btn" onClick={handleMarkAllAsRead}>
                                <Check size={13} /> Mark all read
                            </button>
                        )}
                    </div>

                    <div className="nb-dropdown-body">
                        {notifications.length === 0 ? (
                            <div className="nb-empty">
                                <Bell size={32} style={{ opacity: 0.3 }} />
                                <p>No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map(item => (
                                <div 
                                    key={item.id} 
                                    className={`nb-item ${!item.read ? 'nb-item--unread' : ''}`}
                                    onClick={() => handleNotificationClick(item)}
                                >
                                    <div className="nb-item-icon">
                                        {getIcon(item.type)}
                                    </div>

                                    <div className="nb-item-content">
                                        <div className="nb-item-title">{item.title}</div>
                                        <div className="nb-item-msg">{item.message}</div>
                                        <div className="nb-item-time">{moment(item.createdAt).fromNow()}</div>
                                    </div>

                                    {!item.read && (
                                        <button 
                                            className="nb-read-btn" 
                                            onClick={(e) => handleMarkAsRead(item.id, e)}
                                            title="Mark as read"
                                        >
                                            <div className="nb-unread-dot" />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};



// // src/components/common/NotificationBell/NotificationBell.tsx

// import React, { useState, useEffect, useRef } from 'react';
// import { Bell, Check, CheckCircle2 } from 'lucide-react';
// import { collection, query, onSnapshot, orderBy, doc, updateDoc, writeBatch } from 'firebase/firestore';
// import { useNavigate } from 'react-router-dom';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import './NotificationBell.css';

// interface AppNotification {
//     id: string;
//     title: string;
//     message: string;
//     type: string;
//     link?: string;
//     isRead: boolean;
//     createdAt: any;
// }

// export const NotificationBell: React.FC = () => {
//     const { user } = useStore();
//     const navigate = useNavigate();
//     const [notifications, setNotifications] = useState<AppNotification[]>([]);
//     const [isOpen, setIsOpen] = useState(false);
//     const dropdownRef = useRef<HTMLDivElement>(null);

//     // Close dropdown when clicking outside
//     useEffect(() => {
//         const handleClickOutside = (event: MouseEvent) => {
//             if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
//                 setIsOpen(false);
//             }
//         };
//         document.addEventListener('mousedown', handleClickOutside);
//         return () => document.removeEventListener('mousedown', handleClickOutside);
//     }, []);

//     // Listen for real-time notifications
//     useEffect(() => {
//         if (!user?.uid) return;

//         const q = query(
//             collection(db, 'users', user.uid, 'notifications'),
//             orderBy('createdAt', 'desc')
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const notifs = snapshot.docs.map(doc => ({
//                 id: doc.id,
//                 ...doc.data()
//             } as AppNotification));
//             setNotifications(notifs);
//         });

//         return () => unsubscribe();
//     }, [user?.uid]);

//     const unreadCount = notifications.filter(n => !n.isRead).length;

//     const handleNotificationClick = async (notif: AppNotification) => {
//         if (!user?.uid) return;

//         // Mark as read in Firestore
//         if (!notif.isRead) {
//             await updateDoc(doc(db, 'users', user.uid, 'notifications', notif.id), {
//                 isRead: true
//             });
//         }

//         // Navigate to the workbook
//         if (notif.link) {
//             setIsOpen(false);
//             navigate(notif.link);
//         }
//     };

//     const markAllAsRead = async () => {
//         if (!user?.uid || unreadCount === 0) return;
//         const batch = writeBatch(db);
//         notifications.forEach(n => {
//             if (!n.isRead) {
//                 const ref = doc(db, 'users', user!.uid, 'notifications', n.id);
//                 batch.update(ref, { isRead: true });
//             }
//         });
//         await batch.commit();
//     };

//     return (
//         <div className="mlab-notif-container" ref={dropdownRef}>
//             <button className="mlab-notif-btn" onClick={() => setIsOpen(!isOpen)}>
//                 {user?.role !== 'admin' && <Bell color='var(--mlab-blue)' size={20} />}
//                 {user?.role === 'admin' && <Bell color='var(--mlab-green)' size={20} />}

//                 {unreadCount > 0 && <span className="mlab-notif-badge">{unreadCount}</span>}
//             </button>

//             {isOpen && (
//                 <div className="mlab-notif-dropdown animate-fade-in">
//                     <div className="mlab-notif-header">
//                         <h4 className="mlab-notif-title">Notifications</h4>
//                         {unreadCount > 0 && (
//                             <button className="mlab-notif-mark-read" onClick={markAllAsRead}>
//                                 <Check size={14} /> Mark all read
//                             </button>
//                         )}
//                     </div>

//                     <div className="mlab-notif-list">
//                         {notifications.length === 0 ? (
//                             <div className="mlab-notif-empty">You're all caught up!</div>
//                         ) : (
//                             notifications.map(n => (
//                                 <div
//                                     key={n.id}
//                                     className={`mlab-notif-item ${!n.isRead ? 'unread' : ''}`}
//                                     onClick={() => handleNotificationClick(n)}
//                                 >
//                                     <div className="mlab-notif-icon">
//                                         <CheckCircle2 size={16} color={!n.isRead ? "var(--mlab-green)" : "var(--mlab-grey-lt)"} />
//                                     </div>
//                                     <div className="mlab-notif-content">
//                                         <div className="mlab-notif-item-title">{n.title}</div>
//                                         <div className="mlab-notif-item-message" dangerouslySetInnerHTML={{ __html: n.message }} />
//                                     </div>
//                                 </div>
//                             ))
//                         )}
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };