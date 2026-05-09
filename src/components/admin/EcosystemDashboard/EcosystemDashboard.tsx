// src/components/AdminPortal/EcosystemDashboard/EcosystemDashboard.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { doc, collection, setDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
    Calendar, Users, Search, PlusCircle, QrCode,
    Settings, CheckCircle, Globe, Database
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import Loader from '../../../components/common/Loader/Loader';
import { useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';

import { EventBuilderModal } from './EventBuilderModal';

import '../../../components/views/LearnersView/LearnersView.css';
import "../../../pages/FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList.css";
import type { EcosystemEvent } from '../../../types/ecosystem.types';
import { useNavigate } from 'react-router-dom';

// ─── SMART DATE FORMATTER ───
const formatEventDuration = (startIso: string, endIso?: string) => {
    if (!startIso) return "Date TBD";
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : start;

    // Reset time to accurately count full days
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

    // 1-Day Event
    if (diffDays <= 1) return startStr;

    // Multi-Day (Same Month & Year) -> "12 – 14 Oct 2026 (3 Days)"
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
        return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
    }

    // Multi-Day (Different Months/Years) -> "30 Sep 2026 – 2 Oct 2026 (3 Days)"
    const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startStr} – ${endStr} (${diffDays} Days)`;
};

export const EcosystemDashboard: React.FC = () => {
    const toast = useToast();
    const { programmes, user } = useStore();
    const navigate = useNavigate();

    // ─── TABS & LOADING STATE ───
    const [activeTab, setActiveTab] = useState<'events' | 'guests'>('events');
    const [isLoading, setIsLoading] = useState(true);

    // ─── MODAL STATES ───
    const [showEventModal, setShowEventModal] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<EcosystemEvent | null>(null);

    // ─── DATA STATES ───
    const [events, setEvents] = useState<EcosystemEvent[]>([]);
    const [guests, setGuests] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // 🚀 REAL-TIME FIRESTORE SYNC 🚀
    useEffect(() => {
        setIsLoading(true);

        // Sync Events
        const eventsQuery = query(collection(db, 'events'), orderBy('date', 'desc'));
        const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
            const fetchedEvents = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as EcosystemEvent[];
            setEvents(fetchedEvents);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching events:", error);
            toast.error("Failed to load ecosystem events.");
            setIsLoading(false);
        });

        // Sync Guests (For Tab 2)
        const guestsQuery = query(collection(db, 'ecosystem_guests'), orderBy('lastSeenAt', 'desc'));
        const unsubscribeGuests = onSnapshot(guestsQuery, (snapshot) => {
            const fetchedGuests = snapshot.docs.map(doc => ({
                email: doc.id,
                ...doc.data()
            }));
            setGuests(fetchedGuests);
        });

        return () => {
            unsubscribeEvents();
            unsubscribeGuests();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── SAVE HANDLER FOR THE EVENT MODAL ───
    const handleSaveEvent = async (eventData: Partial<EcosystemEvent>) => {
        try {
            const isEdit = !!selectedEvent?.id;
            const eventRef = isEdit
                ? doc(db, 'events', selectedEvent.id)
                : doc(collection(db, 'events'));

            const payload: any = {
                ...eventData,
                updatedAt: new Date().toISOString(),
            };

            if (isEdit) {
                await updateDoc(eventRef, payload);
                toast.success("Event updated successfully!");
            } else {
                payload.id = eventRef.id;
                payload.createdBy = user?.uid || 'admin';
                payload.currentCheckIns = 0;
                payload.status = 'active';
                payload.createdAt = new Date().toISOString();

                await setDoc(eventRef, payload);
                toast.success("Event created successfully!");
            }

            // Close modal & reset state
            setShowEventModal(false);
            setSelectedEvent(null);

        } catch (error: any) {
            console.error("Failed to save event:", error);
            throw error;
        }
    };

    const filteredEvents = events.filter(e =>
        e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.eventType && e.eventType.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const filteredGuests = guests.filter(g =>
        (g.firstName + ' ' + g.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) {
        return (
            <div className="att-loader-wrap">
                <Loader message="Loading Ecosystem Data…" />
            </div>
        );
    }

    return (
        <div className="att-root animate-fade-in">

            {showEventModal && createPortal(
                <EventBuilderModal
                    event={selectedEvent}
                    programmes={programmes}
                    onClose={() => {
                        setShowEventModal(false);
                        setSelectedEvent(null);
                    }}
                    onSave={handleSaveEvent}
                />,
                document.body
            )}

            {/* ─── HEADER TABS ─── */}
            <div className="att-tabs" role="tablist">
                <button
                    role="tab"
                    className={`att-tab${activeTab === 'events' ? ' att-tab--active' : ''}`}
                    onClick={() => { setActiveTab('events'); setSearchTerm(''); }}
                >
                    <Calendar size={14} /> Ecosystem Events
                </button>
                <button
                    role="tab"
                    className={`att-tab${activeTab === 'guests' ? ' att-tab--active' : ''}`}
                    onClick={() => { setActiveTab('guests'); setSearchTerm(''); }}
                >
                    <Database size={14} /> Guest CRM Ledger
                </button>
            </div>

            {/* ─── STAT CARDS ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Globe size={24} color="var(--mlab-blue)" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Total Events</p>
                        <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem' }}>{events.length} <span style={{ fontSize: '1rem', color: 'var(--mlab-grey)' }}>Hosted</span></h3>
                    </div>
                </div>

                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><Users size={24} color="var(--mlab-green-dark)" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Total Unique Guests</p>
                        <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>{guests.length}</h3>
                    </div>
                </div>
            </div>

            {/* ─── SEARCH & TOOLBAR ─── */}
            <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="mlab-search" style={{ minWidth: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Search size={18} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder={activeTab === 'events' ? "Search events or locations..." : "Search guests by name or email..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
                    />
                </div>

                {activeTab === 'events' && (
                    <button
                        className="mlab-btn mlab-btn--primary"
                        onClick={() => {
                            setSelectedEvent(null);
                            setShowEventModal(true);
                        }}
                    >
                        <PlusCircle size={16} /> Create New Event
                    </button>
                )}
            </div>

            {/* ─── EVENTS TAB CONTENT ─── */}
            {activeTab === 'events' && (
                <div className="mlab-table-wrap">
                    <table className="mlab-table">
                        <thead>
                            <tr>
                                <th>Event Name & Date</th>
                                <th>Location</th>
                                <th>Capacity</th>
                                <th>Custom Fields</th>
                                <th className="att-th--right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEvents.length > 0 ? filteredEvents.map(event => (
                                <tr key={event.id}>
                                    <td>
                                        <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{event.eventName}</div>
                                        {event.eventType && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--mlab-green)', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
                                                {event.eventType}
                                            </div>
                                        )}
                                        {/* 🚀 DYNAMIC MULTI-DAY FORMATTING APPLIED HERE 🚀 */}
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Calendar size={12} color="#94a3b8" />
                                            {formatEventDuration(event.date, (event as any).endDate)}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '0.85rem' }}>{event.location.split(',')[0]}</div>
                                    </td>
                                    <td>
                                        <span className="att-badge" style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>
                                            {event.currentCheckIns || 0} / {event.maxCapacity} Checked In
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
                                            {event.guestFormBlueprint?.length || 0} Extra Question(s)
                                        </span>
                                    </td>
                                    <td className="att-td--right">
                                        <button
                                            className="cdp-btn cdp-btn--sky"
                                            onClick={() => {
                                                // setSelectedEvent(event);
                                                // setShowEventModal(true);
                                                setSelectedEvent(event);
                                                setShowEventModal(true);
                                            }}
                                        >
                                            <Settings size={14} /> Manage
                                        </button>
                                        <button
                                            className="cdp-btn cdp-btn--outline"
                                            style={{ marginLeft: 8, }}
                                            onClick={() => navigate(`/admin/ecosystem/event/${event.id}`)}
                                        >
                                            <Users size={14} /> View Roster
                                        </button>

                                        <button
                                            className="mlab-btn mlab-btn--sm"
                                            style={{ marginLeft: '8px', background: 'var(--mlab-blue)', color: 'white' }}
                                            onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}
                                        >
                                            <QrCode size={14} /> View Door QR
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                        No events found. Click "Create New Event" to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ─── GUESTS TAB CONTENT ─── */}
            {activeTab === 'guests' && (
                <div className="mlab-table-wrap">
                    <table className="mlab-table">
                        <thead>
                            <tr>
                                <th>Guest Name</th>
                                <th>Email Address</th>
                                <th>Mobile</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredGuests.length > 0 ? filteredGuests.map(guest => (
                                <tr key={guest.email}>
                                    <td><div style={{ fontWeight: 600 }}>{guest.firstName} {guest.lastName}</div></td>
                                    <td>{guest.email}</td>
                                    <td>{guest.phone}</td>
                                    <td>
                                        <span className="att-badge att-badge--present">
                                            <CheckCircle size={11} /> Verified CRM Profile
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                        No guests found. Data will populate once visitors start checking in.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};