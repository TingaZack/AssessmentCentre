// src/components/common/NotificationBell/NotificationBell.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCircle2 } from 'lucide-react';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import './NotificationBell.css';

interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: string;
    link?: string;
    isRead: boolean;
    createdAt: any;
}

export const NotificationBell: React.FC = () => {
    const { user } = useStore();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Listen for real-time notifications
    useEffect(() => {
        if (!user?.uid) return;

        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notifs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as AppNotification));
            setNotifications(notifs);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const handleNotificationClick = async (notif: AppNotification) => {
        if (!user?.uid) return;

        // Mark as read in Firestore
        if (!notif.isRead) {
            await updateDoc(doc(db, 'users', user.uid, 'notifications', notif.id), {
                isRead: true
            });
        }

        // Navigate to the workbook
        if (notif.link) {
            setIsOpen(false);
            navigate(notif.link);
        }
    };

    const markAllAsRead = async () => {
        if (!user?.uid || unreadCount === 0) return;
        const batch = writeBatch(db);
        notifications.forEach(n => {
            if (!n.isRead) {
                const ref = doc(db, 'users', user!.uid, 'notifications', n.id);
                batch.update(ref, { isRead: true });
            }
        });
        await batch.commit();
    };

    return (
        <div className="mlab-notif-container" ref={dropdownRef}>
            <button className="mlab-notif-btn" onClick={() => setIsOpen(!isOpen)}>
                <Bell size={20} />
                {unreadCount > 0 && <span className="mlab-notif-badge">{unreadCount}</span>}
            </button>

            {isOpen && (
                <div className="mlab-notif-dropdown animate-fade-in">
                    <div className="mlab-notif-header">
                        <h4 className="mlab-notif-title">Notifications</h4>
                        {unreadCount > 0 && (
                            <button className="mlab-notif-mark-read" onClick={markAllAsRead}>
                                <Check size={14} /> Mark all read
                            </button>
                        )}
                    </div>

                    <div className="mlab-notif-list">
                        {notifications.length === 0 ? (
                            <div className="mlab-notif-empty">You're all caught up!</div>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.id}
                                    className={`mlab-notif-item ${!n.isRead ? 'unread' : ''}`}
                                    onClick={() => handleNotificationClick(n)}
                                >
                                    <div className="mlab-notif-icon">
                                        <CheckCircle2 size={16} color={!n.isRead ? "var(--mlab-green)" : "var(--mlab-grey-lt)"} />
                                    </div>
                                    <div className="mlab-notif-content">
                                        <div className="mlab-notif-item-title">{n.title}</div>
                                        <div className="mlab-notif-item-message" dangerouslySetInnerHTML={{ __html: n.message }} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};