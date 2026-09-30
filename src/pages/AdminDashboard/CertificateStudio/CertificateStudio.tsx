// src/pages/AdminDashboard/CertificateStudio/CertificateStudio.tsx

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
    Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
    FileText, X, Folder, FolderPlus, Edit2, Layers,
    UploadCloud, CheckCircle, UserPlus, Search, Trash2,
    ChevronLeft, ChevronRight, Send, Calendar, ArrowRight, AlertCircle, Save, BookOpen, Edit3, Archive, ShieldCheck, QrCode, Maximize2, Move, Copy, Check
} from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, doc, arrayUnion, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../components/common/Toast/Toast';
import { db } from '../../../lib/firebase';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';

// ── Import separated templates ───────────────────────────────────────────────
import { LuxuryTemplate, OfficialTemplate, ModernTemplate } from './CertificateTemplates';

// ── CSS imports ──────────────────────────────────────────────────────────────
import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
import '../../../components/views/LearnersView/LearnersView.css';
import '../../CohortDetails/CohortDetailsPage.css';
import '../AdminDashboard.css';
import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
import '../../../components/views/CohortsView/CohortsView.css';

import mLabLogo from '../../../assets/logo/mlab_logo.png';
import defaultSignature from '../../../assets/Signatue_Zack_.png';
import Loader from '../../../components/common/Loader/Loader';

// 🚀 PRIMARY PRODUCTION DOMAIN CONSTANT
const PRIMARY_PRODUCTION_DOMAIN = 'https://mlabassessmentcenter.web.app';

// ── CERTIFICATE CANVAS CONSTANTS (A4 landscape @ 96dpi) ─────────────────────
const CERT_WIDTH = 1123;
const CERT_HEIGHT = 794;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// 🚀 HELPER: DYNAMIC BASE URL RESOLVER WITH DOMAIN SANITIZER
const getBaseUrl = (): string => {
    let url = import.meta.env.VITE_APP_URL || '';

    if (!url && typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
        url = window.location.origin;
    }

    if (!url || url.includes('localhost') || url.includes('127.0.0.1')) {
        url = PRIMARY_PRODUCTION_DOMAIN;
    }

    if (url.includes('assessmentcentr')) {
        url = url.replace('assessmentcentr', 'mlabassessmentcenter');
    }

    return url.replace(/\/$/, "");
};

// 🚀 HELPER: CAPTURE THE CERTIFICATE AT TRUE 100% SIZE, INDEPENDENT OF ZOOM / PAN / CLIPPING
const captureCertificateCanvas = (el: HTMLElement) =>
    html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: CERT_WIDTH,
        height: CERT_HEIGHT,
        windowWidth: CERT_WIDTH,
        windowHeight: CERT_HEIGHT,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc: Document) => {
            const cloned = clonedDoc.querySelector('[data-cert-canvas="true"]') as HTMLElement | null;
            if (cloned) {
                cloned.style.position = 'fixed';
                cloned.style.left = '0px';
                cloned.style.top = '0px';
                cloned.style.margin = '0px';
                cloned.style.transform = 'none';
                cloned.style.transition = 'none';
                cloned.style.width = `${CERT_WIDTH}px`;
                cloned.style.height = `${CERT_HEIGHT}px`;
            }
        }
    });

const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => resolve(reader.result as string);
    });

// ── Helper: FormSection ──────────────────────────────────────────────────────
const FormSection = ({ title, icon: Icon, children }: any) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1.5rem', borderBottom: '1px dashed #e2e8f0' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Icon size={16} /> {title}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {children}
        </div>
    </div>
);

// ── SHARE MODAL ──────────────────────────────────────────────────────────────
const ShareModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    targetId: string;
    targetType: 'folder' | 'certificate';
    targetName: string;
    initialCollaborators: string[];
    verifyUrl?: string;
    onSave: (id: string, type: 'folder' | 'certificate', collabs: string[]) => Promise<void>;
}> = ({ isOpen, onClose, targetId, targetType, targetName, initialCollaborators, verifyUrl, onSave }) => {
    const { staff = [] } = useStore() as any;
    const [emails, setEmails] = useState<string[]>(initialCollaborators || []);
    const [inputValue, setInputValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleAdd = () => {
        const cleanEmail = inputValue.trim().toLowerCase();
        if (cleanEmail && !emails.includes(cleanEmail)) {
            setEmails([...emails, cleanEmail]);
            setInputValue('');
        }
    };

    const handleRemove = (email: string) => {
        setEmails(emails.filter((e: string) => e !== email));
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(targetId, targetType, emails);
        setIsSaving(false);
        onClose();
    };

    const handleCopyLink = async () => {
        if (!verifyUrl) return;
        try {
            await navigator.clipboard.writeText(verifyUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch (err) {
            console.error("Copy error:", err);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><UserPlus size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">Share {targetType === 'folder' ? 'Folder' : 'Certificate'}</h2>
                        <p className="wm-modal__subtitle">Manage access for "{targetName}"</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* COPY VERIFICATION LINK SECTION */}
                    {verifyUrl && targetType === 'certificate' && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label className="wm-form-label" style={{ color: '#166534', margin: 0, fontWeight: 700 }}>Public Verification URL</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    readOnly
                                    value={verifyUrl}
                                    className="wm-form-input"
                                    style={{ margin: 0, flex: 1, background: '#ffffff', fontSize: '0.8rem', color: '#1e293b' }}
                                />
                                <button
                                    type="button"
                                    className={`mlab-btn ${copied ? 'mlab-btn--green' : 'mlab-btn--outline-blue'}`}
                                    onClick={handleCopyLink}
                                    style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: '100px', justifyContent: 'center' }}
                                >
                                    {copied ? (
                                        <>
                                            <Check size={14} className="animate-scale-in" /> Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={14} /> Copy Link
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="wm-form-label">Add Collaborator (Email)</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="email"
                                className="wm-form-input"
                                style={{ margin: 0, flex: 1 }}
                                placeholder="Search staff name or email..."
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                                list="staff-emails"
                            />
                            <datalist id="staff-emails">
                                {staff.map((s: any) => s.email && (
                                    <option key={s.id || s.email} value={s.email}>
                                        {s.fullName} ({s.role})
                                    </option>
                                ))}
                            </datalist>
                            <button type="button" className="mlab-btn mlab-btn--outline-blue" onClick={handleAdd}>Add</button>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
                        <label className="wm-form-label">Current Collaborators ({emails.length})</label>
                        {emails.length === 0 ? (
                            <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontStyle: 'italic', margin: '0.5rem 0' }}>No external collaborators added. Only you can view this.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                {emails.map((email: string) => (
                                    <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{email}</span>
                                        <button type="button" className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', padding: 0 }} onClick={() => handleRemove(email)}>
                                            <Trash2 size={14} color="#ef4444" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="wm-modal__footer">
                    <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="button" className="mlab-btn mlab-btn--primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 size={14} className="spin" /> : 'Save Access Control'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ── FULL-SCREEN BULK GENERATOR MODAL ─────────────────────────────────────────
const BulkGeneratorModal: React.FC<{
    certificateGroups: any[],
    courses: any[],
    onClose: () => void,
    onStart: (rows: any[], settings: any, sendEmails: boolean) => void,
    onCreateFolder: (name: string) => Promise<string | null>
}> = ({ certificateGroups = [], courses = [], onClose, onStart, onCreateFolder }) => {

    const [parsedData, setParsedData] = useState<any[]>([]);
    const [fileError, setFileError] = useState('');
    const [sendEmails, setSendEmails] = useState(false);

    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [isSavingFolder, setIsSavingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const [settings, setSettings] = useState({
        template: 'luxury',
        groupId: 'general',
        courseId: '',
        certType: 'Achievement',
        programme: '',
        description: 'has demonstrated exceptional skills and outstanding performance in',
        issueDate: new Date().toISOString().split('T')[0],
        showQrCode: true,
        mintToBlockchain: true
    });

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    setFileError("The uploaded spreadsheet is empty.");
                    return;
                }

                const sample = data[0] as any;
                const hasName = ('Name' in sample) || ('name' in sample) || ('Full Name' in sample) || ('Recipient' in sample);

                if (!hasName) {
                    setFileError("Spreadsheet missing a recognizable 'Name' column. Please use a column header like 'Name' or 'Full Name'.");
                    return;
                }

                setFileError('');
                setParsedData(data);

            } catch (err) {
                setFileError("Failed to parse the file. Ensure it is a valid .csv or .xlsx.");
            }
        };
        reader.readAsBinaryString(file);
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999, padding: 0 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: 0, margin: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', padding: '1.5rem 2rem', flexShrink: 0 }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Layers size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">Bulk Generate Certificates</h2>
                        <p className="wm-modal__subtitle">Upload a spreadsheet to automate design, blockchain anchoring, and distribution.</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose}><X size={24} /></button>
                </div>

                <div className="wm-modal__body" style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', padding: '2rem', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '800px', background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid var(--mlab-border)' }}>
                        {parsedData.length === 0 ? (
                            <div style={{ border: '2px dashed #cbd5e1', padding: '4rem 2rem', textAlign: 'center', borderRadius: '8px', background: '#f8fafc' }}>
                                <UploadCloud size={56} color="#94a3b8" style={{ margin: '0 auto 1rem' }} />
                                <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem' }}>Upload Document Template</h3>
                                <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.9rem' }}>Must contain a "Name" column. Optionally include "Email" or "Course". (.csv or .xlsx)</p>
                                <label className="mlab-btn mlab-btn--primary" style={{ display: 'inline-flex', cursor: 'pointer', padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
                                    Browse Files
                                    <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} />
                                </label>
                                {fileError && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '1.5rem', fontWeight: 500 }}>{fileError}</p>}
                            </div>
                        ) : (
                            <div className="wm-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f0fdf4', padding: '16px 20px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                    <CheckCircle size={28} color="#16a34a" />
                                    <div>
                                        <h4 style={{ margin: 0, color: '#166534', fontSize: '1rem' }}>Spreadsheet Verified!</h4>
                                        <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '0.8rem' }}>Successfully extracted <strong>{parsedData.length} records.</strong></p>
                                    </div>
                                    <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => setParsedData([])}>Change File</button>
                                </div>

                                <div className="wm-form-section">
                                    <div className="wm-form-section__label"><Layers size={14} /> Default Certificate Settings</div>
                                    <div className="wm-form-grid">
                                        <div className="wm-form-group wm-form-group--full">
                                            <label className="wm-form-label">Visual Template</label>
                                            <select className="wm-form-input" value={settings.template} onChange={e => setSettings(s => ({ ...s, template: e.target.value }))}>
                                                <option value="luxury">Luxury Classic</option>
                                                <option value="official">Official Statement (SoR)</option>
                                                <option value="modern">Modern Minimalist</option>
                                            </select>
                                        </div>

                                        <div className="wm-form-group wm-form-group--full">
                                            <label className="wm-form-label">Save To Folder</label>
                                            {isCreatingFolder ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        className="wm-form-input"
                                                        autoFocus
                                                        placeholder="New folder name..."
                                                        value={newFolderName}
                                                        onChange={e => setNewFolderName(e.target.value)}
                                                        disabled={isSavingFolder}
                                                    />
                                                    <button type="button" className="mlab-btn mlab-btn--primary" style={{ padding: '0.4rem 0.6rem' }} disabled={isSavingFolder} onClick={async () => {
                                                        if (!newFolderName.trim()) return;
                                                        setIsSavingFolder(true);
                                                        const newId = await onCreateFolder(newFolderName.trim());
                                                        if (newId) {
                                                            setSettings(s => ({ ...s, groupId: newId }));
                                                            setIsCreatingFolder(false);
                                                            setNewFolderName('');
                                                        }
                                                        setIsSavingFolder(false);
                                                    }}>
                                                        {isSavingFolder ? <Loader2 size={14} className="spin" /> : 'Save'}
                                                    </button>
                                                    <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.6rem' }} disabled={isSavingFolder} onClick={() => setIsCreatingFolder(false)}>Cancel</button>
                                                </div>
                                            ) : (
                                                <select className="wm-form-input" value={settings.groupId} onChange={e => {
                                                    if (e.target.value === 'create_new') {
                                                        setIsCreatingFolder(true);
                                                    } else {
                                                        setSettings(s => ({ ...s, groupId: e.target.value }));
                                                    }
                                                }}>
                                                    <option value="general">General (No Folder)</option>
                                                    {(certificateGroups || []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                                                    <option value="create_new" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>➕ Create New Folder...</option>
                                                </select>
                                            )}
                                        </div>

                                        <div className="wm-form-group wm-form-group--full">
                                            <label className="wm-form-label">Link System Course / Qualification</label>
                                            <select
                                                className="wm-form-input"
                                                value={settings.courseId}
                                                onChange={e => {
                                                    const cid = e.target.value;
                                                    const matchedCourse = courses.find((c: any) => c.id === cid);
                                                    setSettings(s => ({
                                                        ...s,
                                                        courseId: cid,
                                                        programme: matchedCourse?.title || matchedCourse?.name || s.programme
                                                    }));
                                                }}
                                            >
                                                <option value="">-- Custom / Unlinked --</option>
                                                {(courses || []).map((c: any) => (
                                                    <option key={c.id} value={c.id}>{c.title || c.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="wm-form-group wm-form-group--full">
                                            <label className="wm-form-label">Award Title</label>
                                            <select className="wm-form-input" value={settings.certType} onChange={e => setSettings(s => ({ ...s, certType: e.target.value }))}>
                                                <option value="Achievement">Certificate of Achievement</option>
                                                <option value="Attendance">Certificate of Attendance</option>
                                                <option value="Excellence">Award of Excellence</option>
                                                <option value="Participation">Certificate of Participation</option>
                                            </select>
                                        </div>
                                        <div className="wm-form-group wm-form-group--full">
                                            <label className="wm-form-label">Default Course/Programme Name</label>
                                            <input className="wm-form-input" placeholder="e.g. Advanced AI Bootcamp" value={settings.programme} onChange={e => setSettings(s => ({ ...s, programme: e.target.value }))} />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 700, color: '#166534', fontSize: '0.9rem', background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                        <input type="checkbox" checked={settings.mintToBlockchain} onChange={e => setSettings(s => ({ ...s, mintToBlockchain: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#16a34a' }} />
                                        <ShieldCheck size={18} /> Anchor to Ethereum Sepolia Blockchain (Mint Verifiable Credentials)
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <input type="checkbox" checked={settings.showQrCode} onChange={e => setSettings(s => ({ ...s, showQrCode: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: 'var(--mlab-blue)' }} />
                                        <QrCode size={18} /> Include Verification QR Code on all certificates
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <input type="checkbox" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--mlab-blue)' }} />
                                        <Mail size={18} /> Automatically email to recipients
                                        <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>(Requires 'Email' column in spreadsheet)</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="wm-modal__footer" style={{ padding: '1.5rem 2rem', flexShrink: 0, borderTop: '1px solid var(--mlab-border)', background: 'white' }}>
                    <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} style={{ fontSize: '1rem', padding: '0.6rem 1.25rem' }}>Cancel</button>
                    <button
                        type="button"
                        className="mlab-btn mlab-btn--primary"
                        disabled={parsedData.length === 0 || isCreatingFolder}
                        onClick={() => onStart(parsedData, settings, sendEmails)}
                        style={{ fontSize: '1rem', padding: '0.6rem 1.25rem' }}
                    >
                        {isCreatingFolder ? "Save Folder First..." : `Stage & Review (${parsedData.length})`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ── MAIN CERTIFICATE STUDIO COMPONENT ──────────────────────────────────────
export const CertificateStudio: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const {
        settings, user, adHocCertificates = [], certificateGroups = [],
        fetchAdHocCertificates, fetchCertificateGroups, createCertificateGroup,
        renameCertificateGroup, fetchSettings, cohorts = []
    } = useStore() as any;

    const toast = useToast();

    // Intercept target learner passed in route state
    const targetLearner = location.state?.learner;

    // DUAL LANDING TAB STATE
    const [studioLandingTab, setStudioLandingTab] = useState<'adhoc' | 'course_templates'>('adhoc');

    // ─── VIEW & LAYOUT STATE ───
    const [view, setView] = useState<'folders' | 'inside-folder' | 'studio' | 'bulk-review'>('folders');
    const [activeFolder, setActiveFolder] = useState<any>(null);
    const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editFolderName, setEditFolderName] = useState('');

    const [folderSearchQuery, setFolderSearchQuery] = useState('');
    const [certSearchQuery, setCertSearchQuery] = useState('');
    const [templateSearchQuery, setTemplateSearchQuery] = useState('');
    const [folderToDelete, setFolderToDelete] = useState<any>(null);

    // SYSTEM COURSES & SAVED COURSE TEMPLATES
    const [systemCourses, setSystemCourses] = useState<any[]>([]);
    const [courseTemplates, setCourseTemplates] = useState<any[]>([]);
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);

    // ─── ZIP EXPORT STATE ───
    const [isExportingZip, setIsExportingZip] = useState(false);
    const [zipProgress, setZipProgress] = useState({ current: 0, total: 0 });

    // ─── LEGACY / ON-DEMAND BLOCKCHAIN MINTING STATE ───
    const [mintingCertId, setMintingCertId] = useState<string | null>(null);

    // ─── ROOT VIEWPORT LOCK ───
    const rootRef = useRef<HTMLDivElement>(null);
    const [rootHeight, setRootHeight] = useState<number | null>(null);

    // ─── CANVAS INTERACTIVE PAN & ZOOM GESTURE STATE ───
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const userAdjustedRef = useRef(false);

    const previewContainerRef = useRef<HTMLDivElement>(null);

    // ─── SHARE MODAL STATE ───
    const [shareModalConfig, setShareModalConfig] = useState<{
        isOpen: boolean;
        targetId: string;
        targetType: 'folder' | 'certificate';
        targetName: string;
        collaborators: string[];
        verifyUrl?: string;
    }>({ isOpen: false, targetId: '', targetType: 'folder', targetName: '', collaborators: [], verifyUrl: '' });

    const [certData, setCertData] = useState({
        template: 'luxury',
        recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '',
        description: 'has demonstrated exceptional skills and outstanding performance in',
        programme: 'Advanced Leadership Workshop', institutionName: 'mLab Southern Africa',
        issueDate: new Date().toISOString().split('T')[0], signatoryName: 'Zakhele Tinga',
        signatoryTitle: 'Academic Manager', logoUrl: mLabLogo, sigUrl: defaultSignature,
        groupId: 'general',
        courseId: '',
        containerId: '',
        verificationCode: '',
        verifyUrl: '',
        showQrCode: true
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [actionType, setActionType] = useState<'save' | 'download' | 'email'>('save');
    const [zoom, setZoom] = useState(0.65);
    const certRef = useRef<HTMLDivElement>(null);

    // ─── BULK GENERATOR STATE ───
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [isBulkGenerating, setIsBulkGenerating] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, status: '' });

    const [bulkData, setBulkData] = useState<any[]>([]);
    const [bulkSettings, setBulkSettings] = useState<any>(null);
    const [bulkSendEmails, setBulkSendEmails] = useState(false);
    const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
    const [applyBulkEditsToAll, setApplyBulkEditsToAll] = useState(false);

    const isStudioView = view === 'studio' || view === 'bulk-review';

    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;

        const locked: { node: HTMLElement; overflowY: string }[] = [];
        let node: HTMLElement | null = el.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            const cs = window.getComputedStyle(node);
            if (/(auto|scroll)/.test(cs.overflowY)) {
                node.scrollTop = 0;
                locked.push({ node, overflowY: node.style.overflowY });
                node.style.overflowY = 'hidden';
            }
            node = node.parentElement;
        }
        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.scrollTo(0, 0);

        const measure = () => {
            const top = el.getBoundingClientRect().top;
            setRootHeight(Math.max(360, Math.floor(window.innerHeight - top)));
        };
        measure();
        const settle = window.setTimeout(measure, 150);
        window.addEventListener('resize', measure);

        return () => {
            window.clearTimeout(settle);
            window.removeEventListener('resize', measure);
            locked.forEach(({ node, overflowY }) => { node.style.overflowY = overflowY; });
            document.body.style.overflow = prevBodyOverflow;
        };
    }, []);

    const handleFitToScreen = useCallback(() => {
        userAdjustedRef.current = false;
        const container = previewContainerRef.current;
        if (!container) return;
        const { clientWidth, clientHeight } = container;
        if (clientWidth <= 0 || clientHeight <= 0) return;

        const paddingX = 80;
        const paddingY = 110;
        const scaleX = (clientWidth - paddingX) / CERT_WIDTH;
        const scaleY = (clientHeight - paddingY) / CERT_HEIGHT;
        const fitScale = Math.min(scaleX, scaleY);

        setZoom(Number(clampZoom(fitScale).toFixed(3)));
        setPan({ x: 0, y: 0 });
    }, []);

    const handleResetViewport = useCallback(() => {
        userAdjustedRef.current = true;
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    useEffect(() => {
        if (!isStudioView) return;
        const timer = setTimeout(() => handleFitToScreen(), 120);

        const container = previewContainerRef.current;
        if (!container) return () => clearTimeout(timer);

        const resizeObserver = new ResizeObserver(() => {
            if (!userAdjustedRef.current) handleFitToScreen();
        });
        resizeObserver.observe(container);

        return () => {
            clearTimeout(timer);
            resizeObserver.disconnect();
        };
    }, [isStudioView, handleFitToScreen]);

    useEffect(() => {
        if (!isStudioView) return;
        const el = previewContainerRef.current;
        if (!el) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                userAdjustedRef.current = true;
                const factor = e.deltaY > 0 ? 0.92 : 1.08;
                setZoom(prev => Number(clampZoom(prev * factor).toFixed(3)));
            } else {
                setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [isStudioView]);

    const fetchStudioDatasets = useCallback(async () => {
        try {
            const coursesSnap = await getDocs(collection(db, 'content_packages'));
            setSystemCourses(coursesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        } catch (err: any) {
            if (cohorts && cohorts.length > 0) setSystemCourses(cohorts);
        }

        try {
            const templatesSnap = await getDocs(collection(db, 'certificate_templates'));
            setCourseTemplates(templatesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        } catch (err: any) {
            setCourseTemplates([]);
        }
    }, [cohorts]);

    useEffect(() => {
        fetchStudioDatasets();
    }, [fetchStudioDatasets]);

    useEffect(() => {
        if (targetLearner) {
            setCertData(prev => ({
                ...prev,
                recipientName: targetLearner.fullName || targetLearner.name || '',
                recipientEmail: targetLearner.email || '',
                programme: targetLearner.qualification?.name || targetLearner.programmeName || prev.programme,
                certType: 'Competence',
            }));
            setView('studio');
        }
    }, [targetLearner]);

    useEffect(() => { if (!settings && fetchSettings) fetchSettings(); }, [settings, fetchSettings]);

    useEffect(() => {
        if (settings) {
            setCertData(prev => ({
                ...prev,
                institutionName: settings.institutionName || "mLab Southern Africa",
                signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
                signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
                logoUrl: mLabLogo, sigUrl: (settings as any).signatureUrl || defaultSignature
            }));
        }
    }, [settings]);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                if (fetchCertificateGroups) await fetchCertificateGroups();
                if (fetchAdHocCertificates) await fetchAdHocCertificates();
            } catch (error) { console.error("Failed to load studio data", error); }
            finally { setIsLoadingData(false); }
        };
        if (adHocCertificates.length === 0 || certificateGroups.length === 0) loadInitialData();
        else setIsLoadingData(false);
    }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

    useEffect(() => {
        if (view === 'bulk-review' && bulkData.length > 0) {
            const currentRecord = bulkData[bulkCurrentIndex];
            if (currentRecord) setCertData(currentRecord);
        }
    }, [bulkCurrentIndex, view, bulkData]);

    const isSuperAdmin = (user as any)?.isSuperAdmin === true;
    const userEmail = user?.email?.toLowerCase() || '';

    const myCertificateGroups = (certificateGroups || []).filter((g: any) =>
        isSuperAdmin || g.createdBy === user?.uid || (g.collaborators || []).includes(userEmail)
    );

    const myAdHocCertificates = (adHocCertificates || []).filter((c: any) =>
        isSuperAdmin || c.createdBy === user?.uid || (c.collaborators || []).includes(userEmail)
    );

    const handleMintExistingCertificate = async (cert: any) => {
        setMintingCertId(cert.id);
        toast.info(`Minting certificate for ${cert.recipientName} to Blockchain...`);

        try {
            const codePrefix = cert.recipientName ? cert.recipientName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X') : '0000';
            const verificationCode = cert.verificationCode || `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
            const verifyUrl = (cert.verifyUrl && !cert.verifyUrl.includes('localhost'))
                ? cert.verifyUrl
                : `${getBaseUrl()}/verify/${verificationCode}`;

            let pdfBase64 = '';
            if (cert.pdfUrl) {
                const response = await fetch(cert.pdfUrl);
                const blob = await response.blob();
                pdfBase64 = await blobToDataUrl(blob);
            } else {
                throw new Error("No PDF URL found for this certificate.");
            }

            const functions = getFunctions();
            const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

            const bcResponse: any = await issueBlockchainCertificate({
                verificationCode,
                learnerName: cert.recipientName,
                idNumber: cert.idNumber || 'N/A',
                qualification: cert.courseName || cert.programme || 'Certificate',
                issueDate: cert.issueDate || new Date().toISOString().split('T')[0],
                eisaStatus: cert.type || 'Achievement',
                pdfBase64: pdfBase64
            });

            if (bcResponse.data?.success) {
                const blockchainTxHash = bcResponse.data.transactionHash;
                const ipfsHash = bcResponse.data.ipfsHash;
                const blockchainStatus = 'anchored';

                await updateDoc(doc(db, 'ad_hoc_certificates', cert.id), {
                    verificationCode,
                    verifyUrl,
                    blockchainTxHash,
                    ipfsHash,
                    blockchainStatus
                });

                toast.success(`Successfully anchored ${cert.recipientName}'s certificate on Blockchain!`);
                if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
            } else {
                throw new Error("Blockchain service returned unsuccessful response.");
            }
        } catch (error: any) {
            console.error("Mint existing certificate error:", error);
            toast.error(error?.message || "Failed to mint certificate to Blockchain.");
        } finally {
            setMintingCertId(null);
        }
    };

    const handleExportFolderZip = async (folderObj: any) => {
        let certsInFolder: any[] = [];
        if (folderObj.id === 'general') {
            certsInFolder = myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general');
        } else {
            certsInFolder = myAdHocCertificates.filter((c: any) => c.groupId === folderObj.id);
        }

        if (certsInFolder.length === 0) {
            toast.warning(`Folder "${folderObj.name}" contains no certificates to export.`);
            return;
        }

        setIsExportingZip(true);
        setZipProgress({ current: 0, total: certsInFolder.length });
        toast.info(`Preparing ZIP archive for "${folderObj.name}"...`);

        try {
            const zip = new JSZip();
            const folderNameClean = (folderObj.name || 'Certificates').replace(/[^a-zA-Z0-9_-]/g, '_');
            const zipFolder = zip.folder(folderNameClean) || zip;

            let successfulCount = 0;

            for (let i = 0; i < certsInFolder.length; i++) {
                const cert = certsInFolder[i];
                setZipProgress({ current: i + 1, total: certsInFolder.length });

                if (!cert.pdfUrl) continue;

                try {
                    const response = await fetch(cert.pdfUrl);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();

                    const safeRecipient = (cert.recipientName || `Certificate_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
                    const certTitle = (cert.type || 'Award').replace(/[^a-zA-Z0-9_-]/g, '_');
                    const fileFilename = `${safeRecipient}_${certTitle}.pdf`;

                    zipFolder.file(fileFilename, blob);
                    successfulCount++;
                } catch (fetchErr) {
                    console.warn(`Could not fetch PDF for ${cert.recipientName}:`, fetchErr);
                }
            }

            if (successfulCount === 0) {
                toast.error("Could not download PDF files from Storage.");
                setIsExportingZip(false);
                return;
            }

            toast.info("Compressing files into .zip archive...");
            const zipContent = await zip.generateAsync({ type: 'blob' });

            const zipUrl = URL.createObjectURL(zipContent);
            const downloadLink = document.createElement('a');
            downloadLink.href = zipUrl;
            downloadLink.download = `${folderNameClean}_Certificates.zip`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(zipUrl);

            toast.success(`Successfully exported ${successfulCount} certificates as ZIP!`);
        } catch (err: any) {
            console.error("ZIP Export Error:", err);
            toast.error("Failed to generate ZIP export.");
        } finally {
            setIsExportingZip(false);
            setZipProgress({ current: 0, total: 0 });
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());
            if (fetchCertificateGroups) await fetchCertificateGroups(true);
            setNewFolderName(''); setShowNewFolderInput(false); toast.success("Folder created successfully!");
        } catch (error) { toast.error("Failed to create folder"); }
    };

    const handleRenameFolder = async (id: string) => {
        if (!editFolderName.trim()) { setEditingFolderId(null); return; }
        try {
            if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
            if (fetchCertificateGroups) await fetchCertificateGroups(true);
            setEditingFolderId(null); toast.success("Folder renamed!");
        } catch (error) { toast.error("Failed to rename folder"); }
    };

    const triggerDeleteFolder = (e: React.MouseEvent, folder: any) => {
        e.stopPropagation();
        setFolderToDelete(folder);
    };

    const executeDeleteFolder = async () => {
        if (!folderToDelete) return;
        try {
            const batch = writeBatch(db);
            const certsToMove = myAdHocCertificates.filter((c: any) => c.groupId === folderToDelete.id);
            certsToMove.forEach((cert: any) => {
                batch.update(doc(db, 'ad_hoc_certificates', cert.id), { groupId: 'general' });
            });
            batch.delete(doc(db, 'certificate_groups', folderToDelete.id));

            await batch.commit();
            toast.success(`Folder deleted. ${certsToMove.length} certificates safely moved to General.`);

            if (fetchCertificateGroups) await fetchCertificateGroups(true);
            if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
        } catch (error) {
            console.error("Delete Error:", error);
            toast.error("Failed to delete folder.");
        } finally {
            setFolderToDelete(null);
        }
    };

    const handleSaveCollaborators = async (id: string, type: 'folder' | 'certificate', collaborators: string[]) => {
        try {
            const collectionName = type === 'folder' ? 'certificate_groups' : 'ad_hoc_certificates';
            await updateDoc(doc(db, collectionName, id), { collaborators });
            toast.success('Access control updated securely.');

            if (type === 'folder' && fetchCertificateGroups) await fetchCertificateGroups(true);
            if (type === 'certificate' && fetchAdHocCertificates) await fetchAdHocCertificates(true);

            if (activeFolder && activeFolder.id === id) {
                setActiveFolder((prev: any) => ({ ...prev, collaborators }));
            }
        } catch (err) {
            toast.error('Failed to update collaborators.');
        }
    };

    const getCertificatesForActiveFolder = () => {
        if (!activeFolder) return [];
        let certs: any[] = [];
        if (activeFolder.id === 'general') certs = myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general');
        else certs = myAdHocCertificates.filter((c: any) => c.groupId === activeFolder.id);

        if (certSearchQuery) {
            const q = certSearchQuery.toLowerCase();
            return certs.filter((c: any) =>
                (c.recipientName || '').toLowerCase().includes(q) ||
                (c.courseName || '').toLowerCase().includes(q) ||
                (c.type || '').toLowerCase().includes(q)
            );
        }
        return certs;
    };

    const filteredFolders = myCertificateGroups.filter((g: any) => (g.name || '').toLowerCase().includes(folderSearchQuery.toLowerCase()));
    const showGeneralFolder = folderSearchQuery === '' || 'general certificates'.includes(folderSearchQuery.toLowerCase());

    const filteredCourseTemplates = courseTemplates.filter((t: any) =>
        (t.title || '').toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
        (t.programmeName || '').toLowerCase().includes(templateSearchQuery.toLowerCase())
    );

    const handleZoomIn = () => { userAdjustedRef.current = true; setZoom(prev => Number(clampZoom(prev + 0.1).toFixed(3))); };
    const handleZoomOut = () => { userAdjustedRef.current = true; setZoom(prev => Number(clampZoom(prev - 0.1).toFixed(3))); };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0 && e.button !== 1) return;
        setIsPanning(true);
        dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        setPan({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
    };

    const handleCanvasMouseUp = () => setIsPanning(false);

    const stopCanvasEvent = (e: React.SyntheticEvent) => e.stopPropagation();

    const handleChange = (field: string, value: any) => {
        setCertData(prev => ({ ...prev, [field]: value }));
        const personalFields = ['recipientName', 'recipientEmail'];

        if (view === 'bulk-review') {
            setBulkData(currentBulk => {
                if (applyBulkEditsToAll && !personalFields.includes(field)) {
                    return currentBulk.map((cert: any) => ({ ...cert, [field]: value }));
                } else {
                    const updated = [...currentBulk];
                    updated[bulkCurrentIndex] = { ...updated[bulkCurrentIndex], [field]: value };
                    return updated;
                }
            });
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
        const file = e.target.files?.[0];
        if (file) { handleChange(field, URL.createObjectURL(file)); }
    };

    const resetForm = () => {
        setEditingTemplateId(null);
        setPan({ x: 0, y: 0 });
        setCertData(prev => ({
            ...prev,
            recipientName: '',
            recipientEmail: '',
            certType: 'Achievement',
            customType: '',
            programme: 'Advanced Leadership Workshop',
            courseId: '',
            containerId: '',
            verificationCode: '',
            verifyUrl: '',
            showQrCode: true
        }));
    };

    const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

    const handleEditTemplate = (tmpl: any) => {
        setEditingTemplateId(tmpl.id);
        setPan({ x: 0, y: 0 });
        setCertData({
            template: tmpl.templateVisual || 'luxury',
            recipientName: 'SAMPLE LEARNER (PREVIEW)',
            recipientEmail: 'learner@example.com',
            certType: tmpl.certType || 'Achievement',
            customType: '',
            description: tmpl.description || 'has demonstrated exceptional skills and performance in',
            programme: tmpl.programmeName || '',
            institutionName: tmpl.institutionName || 'mLab Southern Africa',
            issueDate: new Date().toISOString().split('T')[0],
            signatoryName: tmpl.signatoryName || '',
            signatoryTitle: tmpl.signatoryTitle || '',
            logoUrl: tmpl.logoUrl || mLabLogo,
            sigUrl: tmpl.sigUrl || defaultSignature,
            groupId: 'general',
            courseId: tmpl.courseId || '',
            containerId: tmpl.containerId || '',
            verificationCode: '',
            verifyUrl: '',
            showQrCode: tmpl.showQrCode !== false
        });
        setView('studio');
    };

    const handleDeleteTemplate = async (tmplId: string, title: string) => {
        if (!window.confirm(`Are you sure you want to delete template "${title}"?`)) return;
        try {
            await deleteDoc(doc(db, 'certificate_templates', tmplId));
            toast.success("Certificate template deleted.");
            fetchStudioDatasets();
        } catch (err) {
            toast.error("Failed to delete template.");
        }
    };

    const handleSaveAsReusableTemplate = async () => {
        if (!certData.programme) {
            toast.warning("Please provide or select a course/programme name first.");
            return;
        }

        setIsSavingTemplate(true);
        try {
            const templatePayload = {
                title: `${certData.programme} - ${finalCertType} Template`,
                courseId: certData.courseId || null,
                programmeName: certData.programme,
                certType: finalCertType,
                templateVisual: certData.template,
                description: certData.description,
                institutionName: certData.institutionName,
                signatoryName: certData.signatoryName,
                signatoryTitle: certData.signatoryTitle,
                logoUrl: certData.logoUrl,
                sigUrl: certData.sigUrl,
                showQrCode: certData.showQrCode,
                updatedAt: serverTimestamp()
            };

            if (editingTemplateId) {
                await updateDoc(doc(db, 'certificate_templates', editingTemplateId), templatePayload);
                toast.success(`Template updated successfully!`);
            } else {
                await addDoc(collection(db, 'certificate_templates'), {
                    ...templatePayload,
                    createdBy: user?.uid || 'Admin',
                    createdAt: serverTimestamp()
                });
                toast.success(`Saved new template "${templatePayload.title}"! It is now available in Launch Cohort Run modal.`);
            }

            fetchStudioDatasets();
            setView('folders');
            setStudioLandingTab('course_templates');
        } catch (err: any) {
            console.error("Save template error:", err);
            toast.error("Failed to save certificate template.");
        } finally {
            setIsSavingTemplate(false);
        }
    };

    // ============================================================================
    // SINGLE CERTIFICATE GENERATION & BLOCKCHAIN HANDSHAKE
    // ============================================================================
    const executeGeneration = useCallback(async (overrideAction?: 'save' | 'download' | 'email') => {
        const mode = overrideAction || actionType;
        if (!certRef.current) return;
        if (!certData.recipientName.trim()) { toast.error('Recipient name is required'); return; }

        setIsGenerating(true);
        setActionType(mode);

        const actionLabel = mode === 'email'
            ? 'Generating & sending email...'
            : mode === 'download'
                ? 'Generating & Downloading PDF...'
                : 'Generating & Anchoring to Blockchain...';
        toast.info(actionLabel);

        try {
            const codePrefix = targetLearner?.idNumber ? targetLearner.idNumber.slice(-4) : '0000';
            const verificationCode = certData.verificationCode || `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
            const verifyUrl = `${getBaseUrl()}/verify/${verificationCode}`;

            setCertData(prev => ({ ...prev, verificationCode, verifyUrl }));
            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await captureCertificateCanvas(certRef.current);

            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
            const pdfBlob = pdf.output('blob');

            const pdfBase64 = await blobToDataUrl(pdfBlob);

            const storage = getStorage();
            const safeName = certData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `ad_hoc_certs/${Date.now()}_${safeName}.pdf`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, pdfBlob);
            const downloadUrl = await getDownloadURL(storageRef);

            let blockchainTxHash = null;
            let ipfsHash = null;
            let blockchainStatus = 'pending';

            try {
                toast.info("Anchoring to Ethereum Sepolia Blockchain...");
                const functions = getFunctions();
                const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

                const bcResponse: any = await issueBlockchainCertificate({
                    verificationCode,
                    learnerName: certData.recipientName,
                    idNumber: targetLearner?.idNumber || 'N/A',
                    qualification: certData.programme,
                    issueDate: certData.issueDate,
                    eisaStatus: finalCertType,
                    pdfBase64: pdfBase64
                });

                if (bcResponse.data?.success) {
                    blockchainTxHash = bcResponse.data.transactionHash;
                    ipfsHash = bcResponse.data.ipfsHash;
                    blockchainStatus = 'anchored';
                    toast.success("Successfully anchored to Blockchain!");
                }
            } catch (bcError) {
                console.error("Blockchain anchoring failed:", bcError);
                toast.warning("PDF saved, but blockchain anchoring failed.");
            }

            const targetFolderObj = (myCertificateGroups || []).find((g: any) => g.id === certData.groupId);
            const savedFolderName = targetFolderObj?.name || (certData.groupId === 'general' || !certData.groupId ? 'General Certificates' : 'Workspace Folder');

            const certRecord = {
                recipientName: certData.recipientName,
                recipientEmail: certData.recipientEmail || null,
                learnerId: targetLearner?.id || null,
                courseId: certData.courseId || null,
                containerId: certData.containerId || null,
                type: finalCertType,
                courseName: certData.programme,
                issueDate: certData.issueDate,

                pdfUrl: downloadUrl,
                verificationCode: verificationCode,
                verifyUrl: verifyUrl,
                blockchainTxHash: blockchainTxHash,
                ipfsHash: ipfsHash,
                blockchainStatus: blockchainStatus,
                showQrCode: certData.showQrCode !== false,

                groupId: certData.groupId || 'general',
                templateUsed: certData.template,
                createdBy: user?.uid || 'Admin',
                createdAt: serverTimestamp(),
                isEmailed: false,
                collaborators: []
            };

            const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), certRecord);

            if (targetLearner?.id) {
                await updateDoc(doc(db, 'learners', targetLearner.id), {
                    certificates: arrayUnion({
                        id: newCertRef.id,
                        courseId: certData.courseId || null,
                        type: finalCertType,
                        courseName: certData.programme,
                        issueDate: certData.issueDate,
                        pdfUrl: downloadUrl,
                        verificationCode: verificationCode,
                        createdAt: new Date().toISOString()
                    })
                });
            }

            if (mode === 'email' && certData.recipientEmail) {
                const functions = getFunctions();
                const sendAdHocEmail = httpsCallable(functions, 'sendAdHocCertificate');
                await sendAdHocEmail({ email: certData.recipientEmail, recipientName: certData.recipientName, pdfUrl: downloadUrl, awardTitle: finalCertType, courseName: certData.programme });
                await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
                toast.success(`Certificate saved to "${savedFolderName}" & emailed to ${certData.recipientEmail}!`);
            } else if (mode === 'download') {
                pdf.save(`Certificate_${safeName}.pdf`);
                toast.success(`Certificate downloaded & saved to "${savedFolderName}"!`);
            } else if (mode === 'save') {
                toast.success(`Certificate saved to "${savedFolderName}" & anchored to Blockchain!`);
            }

            if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
            resetForm();
            navigate('/admin?tab=studio', { replace: true, state: {} });
            setView('folders');
        } catch (error: any) {
            console.error('Studio Error:', error);
            toast.error(`Studio Error: ${error?.message || 'Failed to process.'}`);
        } finally { setIsGenerating(false); }
    }, [certRef, certData, actionType, toast, finalCertType, user, targetLearner, fetchAdHocCertificates, navigate, myCertificateGroups]);

    const handleStartBulkReview = (rows: any[], settings: any, sendEmails: boolean) => {
        setShowBulkModal(false);
        const fullyMappedData = rows.map((row: any) => ({
            ...certData,
            ...settings,
            recipientName: row.Name || row.name || row['Full Name'] || row.Recipient || 'Unknown',
            recipientEmail: row.Email || row.email || row['Email Address'] || '',
            programme: row.Course || row.course || row.Programme || settings.programme
        }));

        setBulkData(fullyMappedData);
        setBulkSettings(settings);
        setBulkSendEmails(sendEmails);
        setBulkCurrentIndex(0);
        setCertData(fullyMappedData[0]);
        setView('bulk-review');
    };

    // ============================================================================
    // BULK CERTIFICATE GENERATION & BLOCKCHAIN HANDSHAKE
    // ============================================================================
    const executeFinalBulkProcessing = async () => {
        setIsBulkGenerating(true);

        let successCount = 0;

        try {
            for (let i = 0; i < bulkData.length; i++) {
                setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Preparing document verification data...' });
                const currentCert = bulkData[i];

                const codePrefix = currentCert.recipientName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
                const verificationCode = `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
                const verifyUrl = `${getBaseUrl()}/verify/${verificationCode}`;

                const activeCertData = {
                    ...currentCert,
                    verificationCode,
                    verifyUrl
                };

                setCertData(activeCertData);
                await new Promise(r => setTimeout(r, 600));

                if (!certRef.current) continue;

                setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Capturing High-Resolution PDF...' });
                const canvas = await captureCertificateCanvas(certRef.current);
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
                const pdfBlob = pdf.output('blob');

                const pdfBase64 = await blobToDataUrl(pdfBlob);

                setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Uploading securely to Cloud Storage...' });
                const safeName = activeCertData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `ad_hoc_certs/bulk_${Date.now()}_${safeName}.pdf`;
                const storageRef = ref(getStorage(), fileName);
                await uploadBytes(storageRef, pdfBlob);
                const downloadUrl = await getDownloadURL(storageRef);

                let blockchainTxHash = null;
                let ipfsHash = null;
                let blockchainStatus = 'pending';

                if (bulkSettings?.mintToBlockchain) {
                    setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Minting to Ethereum Sepolia Blockchain...' });
                    try {
                        const functions = getFunctions();
                        const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

                        const bcResponse: any = await issueBlockchainCertificate({
                            verificationCode,
                            learnerName: activeCertData.recipientName,
                            idNumber: 'N/A',
                            qualification: activeCertData.programme,
                            issueDate: activeCertData.issueDate,
                            eisaStatus: activeCertData.certType,
                            pdfBase64: pdfBase64
                        });

                        if (bcResponse.data?.success) {
                            blockchainTxHash = bcResponse.data.transactionHash;
                            ipfsHash = bcResponse.data.ipfsHash;
                            blockchainStatus = 'anchored';
                        }
                    } catch (bcError) {
                        console.warn(`Bulk blockchain anchoring failed for ${activeCertData.recipientName}:`, bcError);
                    }
                } else {
                    blockchainStatus = 'not_requested';
                }

                setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Saving to Workspace Directory...' });
                const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
                    recipientName: activeCertData.recipientName,
                    recipientEmail: activeCertData.recipientEmail || null,
                    courseId: activeCertData.courseId || null,
                    type: activeCertData.certType,
                    courseName: activeCertData.programme,
                    issueDate: activeCertData.issueDate,

                    pdfUrl: downloadUrl,
                    verificationCode: verificationCode,
                    verifyUrl: verifyUrl,
                    blockchainTxHash: blockchainTxHash,
                    ipfsHash: ipfsHash,
                    blockchainStatus: blockchainStatus,
                    showQrCode: activeCertData.showQrCode !== false,

                    groupId: activeCertData.groupId || 'general',
                    templateUsed: activeCertData.template,
                    createdBy: user?.uid || 'Admin',
                    createdAt: serverTimestamp(),
                    isEmailed: false,
                    emailStatus: (bulkSendEmails && activeCertData.recipientEmail) ? 'pending' : 'not_requested',
                    isBulkUpload: true,
                    collaborators: []
                });

                if (bulkSendEmails && activeCertData.recipientEmail) {
                    setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Dispatching via Email...' });
                    try {
                        const sendAdHocEmail = httpsCallable(getFunctions(), 'sendAdHocCertificate');
                        await sendAdHocEmail({ email: activeCertData.recipientEmail, recipientName: activeCertData.recipientName, pdfUrl: downloadUrl, awardTitle: activeCertData.certType, courseName: activeCertData.programme });
                        await updateDoc(newCertRef, { isEmailed: true, emailStatus: 'sent', emailedAt: serverTimestamp() });
                    } catch (emailError: any) {
                        console.error(`Failed to send email to ${activeCertData.recipientEmail}:`, emailError);
                        await updateDoc(newCertRef, { emailStatus: 'failed', emailError: emailError?.message || 'Cloud function failed' });
                    }
                }
                successCount++;

                setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Network cooldown...' });
                await new Promise(r => setTimeout(r, 1000));
            }

            toast.success(`Bulk Operation Complete: ${successCount} certificates generated & processed successfully.`);
            if (fetchAdHocCertificates) fetchAdHocCertificates(true);

        } catch (error) {
            console.error("Bulk process failed:", error);
            toast.error("A critical error interrupted the bulk generation loop.");
        } finally {
            setIsBulkGenerating(false);
            setBulkData([]);
            setBulkSettings(null);
            setBulkProgress({ current: 0, total: 0, status: '' });
            resetForm();
            setView('folders');
        }
    };

    const canvasBackdrop: React.CSSProperties = {
        backgroundColor: '#1e293b',
        backgroundImage: 'radial-gradient(rgba(148,163,184,0.28) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        backgroundPosition: `${pan.x}px ${pan.y}px`
    };

    return (
        <div
            ref={rootRef}
            className="wm-root animate-fade-in"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: rootHeight ? `${rootHeight}px` : '100%',
                maxHeight: rootHeight ? `${rootHeight}px` : undefined,
                minHeight: 0,
                overflow: 'hidden',
                position: 'relative'
            }}
        >

            {folderToDelete && (
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type="warning"
                        title="Delete Workspace Folder"
                        message={`Are you sure you want to delete the folder "${folderToDelete.name}"?\n\nDon't worry! All certificates currently inside this folder will be safely preserved and moved back to the General Certificates workspace.`}
                        confirmText="Yes, Delete Folder"
                        onClose={executeDeleteFolder}
                        onCancel={() => setFolderToDelete(null)}
                    />
                </div>
            )}

            {shareModalConfig.isOpen && (
                <ShareModal
                    isOpen={shareModalConfig.isOpen}
                    onClose={() => setShareModalConfig({ ...shareModalConfig, isOpen: false })}
                    targetId={shareModalConfig.targetId}
                    targetType={shareModalConfig.targetType}
                    targetName={shareModalConfig.targetName}
                    initialCollaborators={shareModalConfig.collaborators}
                    verifyUrl={shareModalConfig.verifyUrl}
                    onSave={handleSaveCollaborators}
                />
            )}

            {/* ZIP EXPORT OVERLAY */}
            {isExportingZip && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="ap-spinner" style={{ width: '60px', height: '60px', marginBottom: '1.5rem', borderTopColor: 'var(--mlab-green)' }}></div>
                    <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', fontSize: '1.75rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Creating Folder ZIP Archive</h2>
                    <p style={{ color: 'var(--mlab-grey)', fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Downloading &amp; Bundling <span style={{ color: 'var(--mlab-green)', fontWeight: 'bold' }}>{zipProgress.current}</span> of {zipProgress.total} PDFs...
                    </p>
                    <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Please wait while files are being zipped.</p>
                </div>
            )}

            {/* 🚀 BULK PROCESSING LIVE PROGRESS OVERLAY (PORTALED FULLSCREEN) */}
            {isBulkGenerating && createPortal(
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(255,255,255,0.96)', zIndex: 999999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
                    <div className="ap-spinner" style={{ width: '60px', height: '60px', marginBottom: '1.5rem', borderTopColor: 'var(--mlab-blue)' }}></div>
                    <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', fontSize: '2rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Generating Batch Certificates</h2>

                    <p style={{ color: 'var(--mlab-grey)', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Processing <span style={{ color: 'var(--mlab-blue)', fontWeight: 'bold', fontSize: '1.5rem' }}>{bulkProgress.current}</span> of {bulkProgress.total}...
                    </p>

                    <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '12px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '320px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{bulkProgress.status || 'Initializing...'}</span>
                    </div>

                    {bulkSettings?.mintToBlockchain && (
                        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>
                            <ShieldCheck size={18} /> Minting to Blockchain Enabled ({bulkProgress.current} / {bulkProgress.total})
                        </div>
                    )}

                    <p style={{ marginTop: '2.5rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>DO NOT CLOSE THIS TAB OR SWITCH WINDOWS.</p>
                </div>,
                document.body
            )}

            {showBulkModal && (
                <BulkGeneratorModal
                    certificateGroups={myCertificateGroups}
                    courses={systemCourses}
                    onClose={() => setShowBulkModal(false)}
                    onStart={handleStartBulkReview}
                    onCreateFolder={async (name) => {
                        try {
                            const newDocRef = await addDoc(collection(db, 'certificate_groups'), {
                                name: name,
                                createdAt: serverTimestamp(),
                                createdBy: user?.uid || 'Admin',
                                collaborators: []
                            });
                            if (fetchCertificateGroups) await fetchCertificateGroups(true);
                            toast.success("Folder created successfully!");
                            return newDocRef.id;
                        } catch (error) {
                            toast.error("Failed to create folder");
                            return null;
                        }
                    }}
                />
            )}

            {/* ── FIXED APPLICATION HEADER ── */}
            {view !== 'bulk-review' && (
                <div className="wm-page-header" style={{ flexShrink: 0 }}>
                    <div className="wm-page-header__left">
                        <div className="wm-page-header__icon"><Award size={22} /></div>
                        <div>
                            <h1 className="wm-page-header__title">{view === 'folders' ? 'Certificate Studio' : view === 'inside-folder' ? activeFolder?.name : 'Design Certificate'}</h1>
                            <p className="wm-page-header__desc">
                                {targetLearner ? `Issuing Official Certificate for ${targetLearner.fullName}` : 'Design custom ad-hoc awards, reusable course templates, and manage document history.'}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {view === 'folders' && studioLandingTab === 'adhoc' && (
                            <>
                                <button type="button" className="cdp-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} onClick={() => setShowBulkModal(true)}>
                                    <UploadCloud size={13} /> Import Spreadsheet
                                </button>
                                <button type="button" className="cdp-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={() => { resetForm(); setView('studio'); }}>
                                    <Plus size={13} /> Single Certificate
                                </button>
                            </>
                        )}
                        {view === 'folders' && studioLandingTab === 'course_templates' && (
                            <button type="button" className="cdp-btn" style={{ background: '#7c3aed', color: 'white', border: 'none' }} onClick={() => { resetForm(); setView('studio'); }}>
                                <Plus size={13} /> Create Course Template
                            </button>
                        )}
                        {view === 'inside-folder' && activeFolder && (
                            <>
                                <button type="button" className="cdp-btn cdp-btn--outline" onClick={() => setView('folders')}>
                                    <ArrowLeft size={13} /> Back to Folders
                                </button>
                                <button
                                    type="button"
                                    className="cdp-btn"
                                    style={{ background: '#16a34a', color: 'white', border: 'none' }}
                                    onClick={() => handleExportFolderZip(activeFolder)}
                                    title="Export all PDF certificates in this folder as a ZIP archive for printing"
                                >
                                    <Archive size={13} /> Export Folder (ZIP)
                                </button>
                                <button type="button" className="cdp-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={() => { resetForm(); setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
                                    <Plus size={13} /> Create in this Folder
                                </button>
                            </>
                        )}
                        {view === 'studio' && (
                            <>
                                {/* <button type="button" className="cdp-btn cdp-btn--outline" onClick={() => { resetForm(); navigate('/admin?tab=studio', { replace: true, state: {} }); setView('folders'); }}>
                                    <ArrowLeft size={13} /> Cancel Design
                                </button> */}
                                <button className="cdp-header__back" style={{ height: 25, borderRadius: 0, marginTop: 6 }}
                                    onClick={() => { resetForm(); navigate('/admin?tab=studio', { replace: true, state: {} }); setView('folders'); }}>
                                    <ChevronLeft size={14} /> Cancel Design
                                </button>

                                <button
                                    type="button"
                                    className="cdp-btn"
                                    disabled={isSavingTemplate}
                                    onClick={handleSaveAsReusableTemplate}
                                    style={{ background: '#7c3aed', color: 'white', border: 'none' }}
                                    title="Save this template so it can be selected when launching Cohort Runs"
                                >
                                    {isSavingTemplate ? <Loader2 className="spin" size={13} /> : <Save size={13} />} {editingTemplateId ? 'Update Template' : 'Save Reusable Template'}
                                </button>

                                <button
                                    type="button"
                                    className="cdp-btn"
                                    disabled={isGenerating}
                                    onClick={() => executeGeneration('save')}
                                    style={{ background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', color: 'white', border: 'none' }}
                                    title="Save certificate to workspace folder and anchor to blockchain without downloading or emailing"
                                >
                                    {isGenerating && actionType === 'save' ? <Loader2 className="spin" size={13} /> : <ShieldCheck size={13} />} Save & Mint to Blockchain
                                </button>

                                <button type="button" className="cdp-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} disabled={isGenerating} onClick={() => executeGeneration('download')}>
                                    {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={13} /> : <Download size={13} />} Download PDF
                                </button>
                                <button type="button" className="cdp-btn" disabled={isGenerating || !certData.recipientEmail} onClick={() => executeGeneration('email')} style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }}>
                                    {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={13} /> : <Mail size={13} />} Email Document
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── WORKSPACE AREA ── */}
            <div style={{ flex: 1, minHeight: 0, overflow: isStudioView ? 'hidden' : 'auto', padding: isStudioView ? '0.75rem 1.5rem 1rem' : '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column' }}>

                {/* DUAL TAB SWITCHER ON STUDIO LANDING PAGE */}
                {view === 'folders' && (
                    <div style={{ display: 'flex', borderBottom: '2px solid var(--mlab-border)', marginBottom: '1.25rem', gap: '8px', flexShrink: 0 }}>
                        <button
                            type="button"
                            onClick={() => setStudioLandingTab('adhoc')}
                            style={{
                                padding: '10px 18px',
                                background: studioLandingTab === 'adhoc' ? '#ffffff' : 'transparent',
                                border: 'none',
                                color: studioLandingTab === 'adhoc' ? 'var(--mlab-blue)' : '#64748b',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                fontFamily: 'var(--font-heading)',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderBottom: studioLandingTab === 'adhoc' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
                                borderRadius: '0px'
                            }}
                        >
                            <Folder size={15} color={studioLandingTab === 'adhoc' ? 'var(--mlab-blue)' : '#64748b'} />
                            Ad-Hoc &amp; Manual Workspaces
                        </button>

                        <button
                            type="button"
                            onClick={() => setStudioLandingTab('course_templates')}
                            style={{
                                padding: '10px 18px',
                                background: studioLandingTab === 'course_templates' ? '#ffffff' : 'transparent',
                                border: 'none',
                                color: studioLandingTab === 'course_templates' ? '#7c3aed' : '#64748b',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                fontFamily: 'var(--font-heading)',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderBottom: studioLandingTab === 'course_templates' ? '3px solid #7c3aed' : '3px solid transparent',
                                borderRadius: '0px'
                            }}
                        >
                            <BookOpen size={15} color={studioLandingTab === 'course_templates' ? '#7c3aed' : '#64748b'} />
                            Course Assigned Templates ({courseTemplates.length})
                        </button>
                    </div>
                )}

                {/* ── METRICS RIBBON ── */}
                {view === 'folders' && studioLandingTab === 'adhoc' && !isLoadingData && (
                    <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
                        <div className="cdp-stat-card cdp-stat-card--blue">
                            <div className="cdp-stat-card__icon"><Layers size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{myCertificateGroups.length + 1}</span>
                                <span className="cdp-stat-card__label">Total Folders</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--green">
                            <div className="cdp-stat-card__icon"><Award size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{myAdHocCertificates.length}</span>
                                <span className="cdp-stat-card__label">Issued Certificates</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--amber">
                            <div className="cdp-stat-card__icon"><Mail size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{myAdHocCertificates.filter((c: any) => c.isEmailed).length}</span>
                                <span className="cdp-stat-card__label">Emailed Successfully</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--grey">
                            <div className="cdp-stat-card__icon"><FileText size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{myAdHocCertificates.filter((c: any) => !c.isEmailed).length}</span>
                                <span className="cdp-stat-card__label">Downloads Only</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── SEARCH TOOLBAR ── */}
                {(view === 'folders' || view === 'inside-folder') && studioLandingTab === 'adhoc' && !isLoadingData && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap', flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px', width: '300px' }}>
                            <Search size={15} color="var(--mlab-grey)" />
                            <input
                                type="text"
                                placeholder={view === 'folders' ? "Search folders..." : "Search names or courses..."}
                                value={view === 'folders' ? folderSearchQuery : certSearchQuery}
                                onChange={e => view === 'folders' ? setFolderSearchQuery(e.target.value) : setCertSearchQuery(e.target.value)}
                                style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
                            />
                            {(folderSearchQuery || certSearchQuery) && (
                                <button type="button" onClick={() => view === 'folders' ? setFolderSearchQuery('') : setCertSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {view === 'folders' && (
                                showNewFolderInput ? (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input className="wm-form-input" style={{ width: '220px', margin: 0, padding: '0.4rem 0.75rem', height: '36px' }} value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Enter folder name..." autoFocus />
                                        <button type="button" className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.8rem' }} onClick={handleCreateFolder}>Save</button>
                                        <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ background: 'white', padding: '0.4rem 0.8rem' }} onClick={() => setShowNewFolderInput(false)}>Cancel</button>
                                    </div>
                                ) : (
                                    <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ background: 'white', padding: '0.5rem 1rem' }} onClick={() => setShowNewFolderInput(true)}>
                                        <FolderPlus size={14} /> New Folder
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                )}

                {/* ── FOLDERS GRID ── */}
                {view === 'folders' && studioLandingTab === 'adhoc' && (
                    isLoadingData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
                            <Loader message='Loading Workspace...' />
                        </div>
                    ) : (
                        <div className="mlab-cohort-grid">
                            {showGeneralFolder && (
                                <div className="mlab-cohort-card animate-fade-in">
                                    <div className="mlab-cohort-card__header">
                                        <h3 className="mlab-cohort-card__name">General Certificates</h3>
                                    </div>
                                    <div className="mlab-cohort-card__dates">
                                        <Calendar size={14} />
                                        <span>System Default Folder</span>
                                    </div>
                                    <div className="mlab-role-row-stack">
                                        <div className="mlab-role-row">
                                            <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
                                            <span className="mlab-role-label">Contents:</span>
                                            <span className="mlab-role-name">{myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general').length} Documents</span>
                                        </div>
                                        <div className="mlab-role-row">
                                            <div className="mlab-role-dot mlab-role-dot--green" />
                                            <span className="mlab-role-label">Access:</span>
                                            <span className="mlab-role-name">System Default Workspace</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16 }}>
                                        <button
                                            type="button"
                                            className="mlab-btn mlab-btn--outline-blue"
                                            style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }}
                                            onClick={() => handleExportFolderZip({ id: 'general', name: 'General Certificates' })}
                                            title="Export ZIP"
                                        >
                                            <Archive size={13} /> Export ZIP
                                        </button>
                                        <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
                                            Open Folder <ArrowRight size={13} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {filteredFolders.map((group: any) => {
                                const certCount = myAdHocCertificates.filter((c: any) => c.groupId === group.id).length;
                                const isShared = group.collaborators?.length > 0;
                                const createdDate = group.createdAt?.toDate ? new Date(group.createdAt.toDate()).toLocaleDateString('en-ZA') : 'Recently';

                                return (
                                    <div key={group.id} className="mlab-cohort-card animate-fade-in" style={{ borderTopColor: 'var(--mlab-green)' }}>
                                        <div className="mlab-cohort-card__header">
                                            {editingFolderId === group.id ? (
                                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center', width: '100%' }}>
                                                    <input className="wm-form-input" style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem', width: '100%', margin: 0 }} autoFocus value={editFolderName} onChange={e => setEditFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(group.id); if (e.key === 'Escape') setEditingFolderId(null); }} />
                                                    <button type="button" className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
                                                </div>
                                            ) : (
                                                <>
                                                    <h3 className="mlab-cohort-card__name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h3>
                                                    <div className="mlab-cohort-card__actions">
                                                        <button type="button" className="mlab-icon-btn mlab-icon-btn--blue" onClick={(e) => { e.stopPropagation(); setEditingFolderId(group.id); setEditFolderName(group.name); }} title="Rename Folder"><Edit2 size={14} /></button>
                                                        <button type="button" className="mlab-icon-btn mlab-icon-btn--amber" onClick={(e) => triggerDeleteFolder(e, group)} title="Delete Folder"><Trash2 size={14} color="#ef4444" /></button>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {editingFolderId !== group.id && (
                                            <>
                                                <div className="mlab-cohort-card__dates">
                                                    <Calendar size={14} />
                                                    <span>Created: {createdDate}</span>
                                                </div>

                                                <div className="mlab-role-row-stack">
                                                    <div className="mlab-role-row">
                                                        <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
                                                        <span className="mlab-role-label">Contents:</span>
                                                        <span className="mlab-role-name">{certCount} Documents</span>
                                                    </div>
                                                    <div className="mlab-role-row">
                                                        <div className={`mlab-role-dot ${isShared ? 'mlab-role-dot--blue' : 'mlab-role-dot--green'}`} />
                                                        <span className="mlab-role-label">Access:</span>
                                                        <span className="mlab-role-name">{isShared ? `Shared (${group.collaborators.length})` : 'Private Workspace'}</span>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16 }}>
                                                    <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => { e.stopPropagation(); handleExportFolderZip(group); }} title="Export ZIP Archive">
                                                        <Archive size={13} /> ZIP
                                                    </button>
                                                    <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }} onClick={(e) => { e.stopPropagation(); setShareModalConfig({ isOpen: true, targetId: group.id, targetType: 'folder', targetName: group.name, collaborators: group.collaborators || [] }); }} title="Share Folder">
                                                        <UserPlus size={13} /> Share
                                                    </button>
                                                    <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setActiveFolder(group); setView('inside-folder'); }}>
                                                        Open <ArrowRight size={13} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}

                            {filteredFolders.length === 0 && !showGeneralFolder && (
                                <div className="mlab-cohort-empty">
                                    <Search size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                    <p className="mlab-cohort-empty__title">No Folders Found</p>
                                    <p className="mlab-cohort-empty__desc">Create a folder or adjust your search parameters.</p>
                                </div>
                            )}
                        </div>
                    )
                )}

                {/* ── COURSE ASSIGNED TEMPLATES TAB ── */}
                {view === 'folders' && studioLandingTab === 'course_templates' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px', width: '320px' }}>
                                <Search size={15} color="var(--mlab-grey)" />
                                <input
                                    type="text"
                                    placeholder="Search course templates..."
                                    value={templateSearchQuery}
                                    onChange={e => setTemplateSearchQuery(e.target.value)}
                                    style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
                                />
                                {templateSearchQuery && (
                                    <button type="button" onClick={() => setTemplateSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                className="mlab-btn mlab-btn--primary"
                                onClick={() => { resetForm(); setView('studio'); }}
                            >
                                <Plus size={14} /> Create Course Template
                            </button>
                        </div>

                        {filteredCourseTemplates.length === 0 ? (
                            <div className="mlab-cohort-empty" style={{ background: 'white' }}>
                                <BookOpen size={44} color="#7c3aed" style={{ opacity: 0.5 }} />
                                <p className="mlab-cohort-empty__title">No Course Templates Configured</p>
                                <p className="mlab-cohort-empty__desc">Save a custom template here to make it selectable when launching Cohort Runs.</p>
                            </div>
                        ) : (
                            <div className="mlab-cohort-grid">
                                {filteredCourseTemplates.map((tmpl: any) => {
                                    const matchedCourse = systemCourses.find((c: any) => c.id === tmpl.courseId);
                                    const linkedTitle = matchedCourse?.title || matchedCourse?.name || tmpl.programmeName || 'General Course Template';

                                    return (
                                        <div key={tmpl.id} className="mlab-cohort-card animate-fade-in" style={{ borderTop: '4px solid #7c3aed' }}>
                                            <div className="mlab-cohort-card__header">
                                                <div>
                                                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                        {tmpl.templateVisual ? `${tmpl.templateVisual.toUpperCase()} TEMPLATE` : 'LUXURY TEMPLATE'}
                                                    </span>
                                                    <h3 className="mlab-cohort-card__name" style={{ margin: '2px 0 0 0' }}>{tmpl.title || linkedTitle}</h3>
                                                </div>
                                            </div>

                                            <div className="mlab-cohort-card__dates">
                                                <BookOpen size={14} color="#7c3aed" />
                                                <span>Linked Course: <strong>{linkedTitle}</strong></span>
                                            </div>

                                            <div className="mlab-role-row-stack">
                                                <div className="mlab-role-row">
                                                    <div className="mlab-role-dot" style={{ background: '#7c3aed' }} />
                                                    <span className="mlab-role-label">Award Title:</span>
                                                    <span className="mlab-role-name">{tmpl.certType || 'Certificate of Competence'}</span>
                                                </div>
                                                <div className="mlab-role-row">
                                                    <div className="mlab-role-dot mlab-role-dot--green" />
                                                    <span className="mlab-role-label">Signatory:</span>
                                                    <span className="mlab-role-name">{tmpl.signatoryName || 'Zakhele Tinga'} ({tmpl.signatoryTitle || 'Academic Manager'})</span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16, paddingTop: '12px', borderTop: '1px solid var(--mlab-border)' }}>
                                                <button
                                                    type="button"
                                                    className="mlab-btn mlab-btn--outline-blue"
                                                    style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem' }}
                                                    onClick={() => handleEditTemplate(tmpl)}
                                                >
                                                    <Edit3 size={13} /> Edit Design
                                                </button>

                                                <button
                                                    type="button"
                                                    className="mlab-icon-btn mlab-icon-btn--amber"
                                                    onClick={() => handleDeleteTemplate(tmpl.id, tmpl.title || linkedTitle)}
                                                    title="Delete Template"
                                                >
                                                    <Trash2 size={13} color="#ef4444" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── CERTIFICATES GRID (INSIDE FOLDER) ── */}
                {view === 'inside-folder' && activeFolder && (
                    <>
                        {getCertificatesForActiveFolder().length === 0 ? (
                            <div className="mlab-cohort-empty" style={{ background: 'white' }}>
                                {certSearchQuery ? <Search size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} /> : <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />}
                                <p className="mlab-cohort-empty__title">{certSearchQuery ? 'No Results Found' : 'Folder is Empty'}</p>
                                <p className="mlab-cohort-empty__desc">{certSearchQuery ? `No certificates match "${certSearchQuery}".` : 'No certificates have been saved to this folder yet.'}</p>
                            </div>
                        ) : (
                            <div className="mlab-cohort-grid">
                                {getCertificatesForActiveFolder().map((cert: any) => {
                                    const certVerifyUrl = cert.verifyUrl || `${getBaseUrl()}/verify/${cert.verificationCode}`;

                                    return (
                                        <div key={cert.id} className="mlab-cohort-card animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
                                            <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                <Award size={48} color="rgba(255,255,255,0.1)" />
                                                <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
                                                    {cert.blockchainStatus === 'anchored' && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#10b981', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={`Tx: ${cert.blockchainTxHash || 'On-chain'}`}>
                                                            <ShieldCheck size={10} /> Anchored
                                                        </span>
                                                    )}
                                                    {cert.emailStatus === 'failed' && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#ef4444', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={cert.emailError || "Email delivery failed"}>
                                                            <AlertCircle size={10} /> Send Failed
                                                        </span>
                                                    )}
                                                    {cert.isEmailed && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: 'var(--mlab-green)', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={`Emailed to ${cert.recipientEmail}`}>
                                                            <Mail size={10} /> Sent
                                                        </span>
                                                    )}
                                                    <span style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>PDF</span>
                                                </div>
                                            </div>
                                            <div style={{ padding: '1.25rem' }}>
                                                <div className="mlab-cohort-card__header">
                                                    <h3 className="mlab-cohort-card__name">{cert.recipientName}</h3>
                                                </div>
                                                <div className="mlab-cohort-card__dates" style={{ marginBottom: '10px' }}>
                                                    <Award size={14} />
                                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cert.courseName}</span>
                                                </div>

                                                <div className="mlab-role-row-stack">
                                                    <div className="mlab-role-row">
                                                        <div className="mlab-role-dot mlab-role-dot--green" />
                                                        <span className="mlab-role-label">Type:</span>
                                                        <span className="mlab-role-name">{cert.type}</span>
                                                    </div>
                                                    <div className="mlab-role-row">
                                                        <div className="mlab-role-dot mlab-role-dot--blue" />
                                                        <span className="mlab-role-label">Issued:</span>
                                                        <span className="mlab-role-name">{cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString() : cert.issueDate}</span>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', width: '100%', flexDirection: 'column', gap: '8px', marginTop: 16 }}>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            type="button"
                                                            className="mlab-btn mlab-btn--outline-blue"
                                                            style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }}
                                                            onClick={() => setShareModalConfig({
                                                                isOpen: true,
                                                                targetId: cert.id,
                                                                targetType: 'certificate',
                                                                targetName: cert.recipientName,
                                                                collaborators: cert.collaborators || [],
                                                                verifyUrl: certVerifyUrl
                                                            })}
                                                        >
                                                            <UserPlus size={13} /> Share
                                                        </button>
                                                        <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.open(cert.pdfUrl, '_blank')}>
                                                            View / Print <ArrowRight size={13} />
                                                        </button>
                                                    </div>

                                                    {/* ON-DEMAND BLOCKCHAIN MINT BUTTON FOR EXISTING CERTS */}
                                                    {cert.blockchainStatus !== 'anchored' ? (
                                                        <button
                                                            type="button"
                                                            className="mlab-btn mlab-btn--primary"
                                                            style={{ width: '100%', padding: '0.45rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)' }}
                                                            disabled={mintingCertId === cert.id}
                                                            onClick={() => handleMintExistingCertificate(cert)}
                                                        >
                                                            {mintingCertId === cert.id ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={13} />}
                                                            {mintingCertId === cert.id ? "Anchoring to Blockchain..." : "Issue to Blockchain"}
                                                        </button>
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.4rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>
                                                            <ShieldCheck size={13} color="#16a34a" /> Secured on Blockchain
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* ── STUDIO & BULK REVIEW VIEWS ── */}
                {isStudioView && (
                    <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, overflow: 'hidden', flexDirection: 'column' }}>

                        {/* Bulk Controls Header */}
                        {view === 'bulk-review' && (
                            <div style={{ display: 'flex', alignItems: 'center', background: 'white', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', gap: '1rem', flexShrink: 0, flexWrap: 'wrap' }}>
                                <button type="button" className="cdp-btn cdp-btn--outline" style={{ color: 'var(--mlab-red)', borderColor: 'var(--mlab-red)' }} onClick={() => { setBulkData([]); setView('folders'); }}>
                                    <X size={13} /> Cancel Bulk Operation
                                </button>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 auto', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                                    <button
                                        type="button"
                                        className="mlab-icon-btn"
                                        disabled={bulkCurrentIndex === 0}
                                        onClick={() => setBulkCurrentIndex(p => Math.max(0, p - 1))}
                                        style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                    >
                                        <ChevronLeft color='var(--mlab-midnight)' size={18} />
                                    </button>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-midnight)', minWidth: '150px', textAlign: 'center' }}>
                                        Preview {bulkCurrentIndex + 1} of {bulkData.length}
                                    </span>
                                    <button
                                        type="button"
                                        className="mlab-icon-btn"
                                        disabled={bulkCurrentIndex === bulkData.length - 1}
                                        onClick={() => setBulkCurrentIndex(p => Math.min(bulkData.length - 1, p + 1))}
                                        style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                    >
                                        <ChevronRight color='var(--mlab-midnight)' size={18} />
                                    </button>
                                </div>

                                <button type="button" className="cdp-btn" onClick={executeFinalBulkProcessing} style={bulkSettings?.mintToBlockchain ? { background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', color: 'white', border: 'none' } : { background: 'var(--mlab-blue)', color: 'white', border: 'none' }}>
                                    {bulkSettings?.mintToBlockchain ? <ShieldCheck size={13} /> : <Send size={13} />}
                                    {bulkSettings?.mintToBlockchain ? `Save & Mint All (${bulkData.length})` : `Approve & Process All (${bulkData.length})`}
                                </button>
                            </div>
                        )}

                        {/* Two-pane editor: [ scrolling controls | fixed playground ] */}
                        <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                            {/* 🚀 LEFT PANEL: the ONLY thing that scrolls */}
                            <aside style={{ width: '360px', flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                                <div style={{ flexShrink: 0, padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--mlab-border)', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-midnight)' }}>
                                        {view === 'bulk-review' ? `Editing ${bulkCurrentIndex + 1} of ${bulkData.length}` : editingTemplateId ? 'Edit Template' : 'Design Settings'}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Live preview →</span>
                                </div>

                                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {view === 'bulk-review' && (
                                        <div style={{ background: applyBulkEditsToAll ? '#eff6ff' : '#f8fafc', padding: '12px', borderRadius: '8px', border: `1px solid ${applyBulkEditsToAll ? '#bfdbfe' : '#e2e8f0'}`, transition: 'all 0.2s' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--mlab-blue)', fontSize: '0.85rem', margin: 0 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={applyBulkEditsToAll}
                                                    onChange={e => setApplyBulkEditsToAll(e.target.checked)}
                                                    style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
                                                />
                                                Apply edits to ALL certificates
                                            </label>
                                            <p style={{ margin: '6px 0 0 24px', fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: 1.4 }}>
                                                When checked, changing the template, course, or signature will instantly update all <strong>{bulkData.length}</strong> certificates.
                                            </p>
                                        </div>
                                    )}

                                    <FormSection title="Design Template" icon={Layers}>
                                        <select className="wm-form-input" style={{ margin: 0 }} value={certData.template} onChange={e => handleChange('template', e.target.value)}><option value="luxury">Luxury (Default)</option><option value="official">Official Statement (SoR)</option><option value="modern">Modern Minimalist</option></select>
                                    </FormSection>

                                    <FormSection title="Course & Content Linkage" icon={BookOpen}>
                                        <select
                                            className="wm-form-input"
                                            style={{ margin: 0 }}
                                            value={certData.courseId}
                                            onChange={e => {
                                                const selectedId = e.target.value;
                                                const matchedCourse = systemCourses.find((c: any) => c.id === selectedId);
                                                const nextProgramme = matchedCourse?.title || matchedCourse?.name || certData.programme;
                                                handleChange('courseId', selectedId);
                                                handleChange('programme', nextProgramme);
                                            }}
                                        >
                                            <option value="">-- Custom / Ad-Hoc (No Course Link) --</option>
                                            {(systemCourses || []).map((course: any) => (
                                                <option key={course.id} value={course.id}>{course.title || course.name}</option>
                                            ))}
                                        </select>
                                    </FormSection>

                                    <FormSection title="Folder Assignment" icon={Folder}>
                                        <select className="wm-form-input" style={{ margin: 0 }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}><option value="general">General (No Folder)</option>{(myCertificateGroups || []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}</select>
                                    </FormSection>

                                    <FormSection title="Recipient Details" icon={UserCircle}>
                                        <input className="wm-form-input" style={{ margin: 0 }} placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
                                        <input className="wm-form-input" style={{ margin: 0 }} type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
                                    </FormSection>

                                    <FormSection title="Award Details" icon={FileCheck}>
                                        <select className="wm-form-input" style={{ margin: 0 }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}><option value="Achievement">Certificate of Achievement</option><option value="Attendance">Certificate of Attendance</option><option value="Appreciation">Certificate of Appreciation</option><option value="Excellence">Award of Excellence</option><option value="Other">Custom Title...</option></select>
                                        {certData.certType === 'Other' && <input className="wm-form-input" style={{ margin: 0 }} placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />}
                                        <input className="wm-form-input" style={{ margin: 0 }} placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
                                        <textarea className="wm-form-input" style={{ margin: 0, minHeight: '60px' }} placeholder="Description..." value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
                                    </FormSection>

                                    <FormSection title="Branding & Verification" icon={Building2}>
                                        <input className="wm-form-input" style={{ margin: 0 }} placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
                                            <input className="wm-form-input" style={{ margin: 0 }} type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
                                        </div>
                                        <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />

                                        {/* QR CODE TOGGLE CHECKBOX */}
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', marginTop: '0.5rem', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <input
                                                type="checkbox"
                                                checked={certData.showQrCode !== false}
                                                onChange={e => handleChange('showQrCode', e.target.checked)}
                                                style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
                                            />
                                            <QrCode size={16} color="var(--mlab-blue)" /> Include Verification QR Code
                                        </label>

                                        <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                                            <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}><ImageIcon size={14} /> Change Logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} /></label>
                                            <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}><ImageIcon size={14} /> Change Signature<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} /></label>
                                        </div>
                                    </FormSection>
                                </div>
                            </aside>

                            {/* 🚀 RIGHT: FIXED PLAYGROUND — never scrolls, always fits the free space, certificate centred */}
                            <div
                                ref={previewContainerRef}
                                onMouseDown={handleCanvasMouseDown}
                                onMouseMove={handleCanvasMouseMove}
                                onMouseUp={handleCanvasMouseUp}
                                onMouseLeave={handleCanvasMouseUp}
                                style={{
                                    flex: 1,
                                    minHeight: 0,
                                    minWidth: 0,
                                    position: 'relative',
                                    borderRadius: '8px',
                                    border: '1px solid var(--mlab-border)',
                                    overflow: 'hidden',
                                    cursor: isPanning ? 'grabbing' : 'grab',
                                    userSelect: 'none',
                                    overscrollBehavior: 'contain',
                                    touchAction: 'none',
                                    ...canvasBackdrop
                                }}
                            >
                                {/* Floating zoom bar (bottom centre, Canva-style) */}
                                <div
                                    onMouseDown={stopCanvasEvent}
                                    onMouseMove={stopCanvasEvent}
                                    style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.96)', padding: '0.35rem 0.5rem', borderRadius: '999px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.35)', zIndex: 100, backdropFilter: 'blur(4px)', cursor: 'default' }}
                                >
                                    <button type="button" className="mlab-icon-btn" onClick={handleZoomOut} disabled={isBulkGenerating} title="Zoom out (Ctrl + scroll down)"><ZoomOut size={15} color='var(--mlab-blue)' /></button>
                                    <span style={{ minWidth: '48px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
                                    <button type="button" className="mlab-icon-btn" onClick={handleZoomIn} disabled={isBulkGenerating} title="Zoom in (Ctrl + scroll up)"><ZoomIn size={15} color='var(--mlab-blue)' /></button>
                                    <span style={{ width: '1px', height: '18px', background: '#e2e8f0', margin: '0 4px' }} />
                                    <button type="button" className="mlab-icon-btn mlab-icon-btn--blue" onClick={handleFitToScreen} disabled={isBulkGenerating} title="Fit to screen"><Maximize2 size={15} /></button>
                                    <button type="button" className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetViewport} disabled={isBulkGenerating} title="Actual size (100%)"><RotateCcw size={15} /></button>
                                </div>

                                {/* Gesture hint */}
                                <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.75)', color: '#cbd5e1', padding: '6px 12px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, backdropFilter: 'blur(4px)', zIndex: 100, pointerEvents: 'none' }}>
                                    <Move size={12} color="#38bdf8" /> Drag or scroll to pan · Ctrl + scroll to zoom
                                </div>

                                {view === 'bulk-review' && certData.recipientEmail && bulkSendEmails && (
                                    <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #bbf7d0', zIndex: 100, pointerEvents: 'none' }}>
                                        <Mail size={14} /> Will be emailed to: {certData.recipientEmail}
                                    </div>
                                )}

                                <div
                                    data-cert-canvas="true"
                                    className="cert-canvas"
                                    ref={certRef}
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        width: `${CERT_WIDTH}px`,
                                        height: `${CERT_HEIGHT}px`,
                                        marginLeft: `${-CERT_WIDTH / 2}px`,
                                        marginTop: `${-CERT_HEIGHT / 2}px`,
                                        flex: 'none',
                                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                        transformOrigin: 'center center',
                                        transition: isPanning ? 'none' : 'transform 0.12s ease-out',
                                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.55)',
                                        backgroundColor: '#fff',
                                        overflow: 'hidden',
                                        willChange: 'transform'
                                    }}
                                >
                                    {certData.template === 'luxury' && <LuxuryTemplate data={certData} finalType={finalCertType} />}
                                    {certData.template === 'official' && <OfficialTemplate data={certData} finalType={finalCertType} />}
                                    {certData.template === 'modern' && <ModernTemplate data={certData} finalType={finalCertType} />}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// // src/pages/AdminDashboard/CertificateStudio/CertificateStudio.tsx

// import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
// import { createPortal } from 'react-dom';
// import { useLocation, useNavigate } from 'react-router-dom';
// import {
//     Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
//     Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
//     FileText, X, Folder, FolderPlus, Edit2, Layers,
//     UploadCloud, CheckCircle, UserPlus, Search, Trash2,
//     ChevronLeft, ChevronRight, Send, Calendar, ArrowRight, AlertCircle, Save, BookOpen, Edit3, Archive, ShieldCheck, QrCode, Maximize2, Move, Copy, Check
// } from 'lucide-react';
// import { collection, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, doc, arrayUnion, getDocs } from 'firebase/firestore';
// import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import html2canvas from 'html2canvas';
// import jsPDF from 'jspdf';
// import * as XLSX from 'xlsx';
// import JSZip from 'jszip';
// import { useStore } from '../../../store/useStore';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { db } from '../../../lib/firebase';
// import { StatusModal } from '../../../components/common/StatusModal/StatusModal';

// // ── Import separated templates ───────────────────────────────────────────────
// import { LuxuryTemplate, OfficialTemplate, ModernTemplate } from './CertificateTemplates';

// // ── CSS imports ──────────────────────────────────────────────────────────────
// import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
// import '../../../components/views/LearnersView/LearnersView.css';
// import '../../CohortDetails/CohortDetailsPage.css';
// import '../AdminDashboard.css';
// import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
// import '../../../components/views/CohortsView/CohortsView.css';

// import mLabLogo from '../../../assets/logo/mlab_logo.png';
// import defaultSignature from '../../../assets/Signatue_Zack_.png';
// import Loader from '../../../components/common/Loader/Loader';

// // 🚀 PRIMARY PRODUCTION DOMAIN CONSTANT
// const PRIMARY_PRODUCTION_DOMAIN = 'https://mlabassessmentcenter.web.app';

// // ── CERTIFICATE CANVAS CONSTANTS (A4 landscape @ 96dpi) ─────────────────────
// const CERT_WIDTH = 1123;
// const CERT_HEIGHT = 794;
// const MIN_ZOOM = 0.1;
// const MAX_ZOOM = 3;
// const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// // 🚀 HELPER: DYNAMIC BASE URL RESOLVER WITH DOMAIN SANITIZER
// const getBaseUrl = (): string => {
//     let url = import.meta.env.VITE_APP_URL || '';

//     if (!url && typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
//         url = window.location.origin;
//     }

//     if (!url || url.includes('localhost') || url.includes('127.0.0.1')) {
//         url = PRIMARY_PRODUCTION_DOMAIN;
//     }

//     if (url.includes('assessmentcentr')) {
//         url = url.replace('assessmentcentr', 'mlabassessmentcenter');
//     }

//     return url.replace(/\/$/, "");
// };

// // 🚀 HELPER: CAPTURE THE CERTIFICATE AT TRUE 100% SIZE, INDEPENDENT OF ZOOM / PAN / CLIPPING
// const captureCertificateCanvas = (el: HTMLElement) =>
//     html2canvas(el, {
//         scale: 2,
//         useCORS: true,
//         logging: false,
//         backgroundColor: '#ffffff',
//         width: CERT_WIDTH,
//         height: CERT_HEIGHT,
//         windowWidth: CERT_WIDTH,
//         windowHeight: CERT_HEIGHT,
//         scrollX: 0,
//         scrollY: 0,
//         onclone: (clonedDoc: Document) => {
//             const cloned = clonedDoc.querySelector('[data-cert-canvas="true"]') as HTMLElement | null;
//             if (cloned) {
//                 cloned.style.position = 'fixed';
//                 cloned.style.left = '0px';
//                 cloned.style.top = '0px';
//                 cloned.style.margin = '0px';
//                 cloned.style.transform = 'none';
//                 cloned.style.transition = 'none';
//                 cloned.style.width = `${CERT_WIDTH}px`;
//                 cloned.style.height = `${CERT_HEIGHT}px`;
//             }
//         }
//     });

// const blobToDataUrl = (blob: Blob) =>
//     new Promise<string>((resolve) => {
//         const reader = new FileReader();
//         reader.readAsDataURL(blob);
//         reader.onloadend = () => resolve(reader.result as string);
//     });

// // ── Helper: FormSection ──────────────────────────────────────────────────────
// const FormSection = ({ title, icon: Icon, children }: any) => (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1.5rem', borderBottom: '1px dashed #e2e8f0' }}>
//         <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//             <Icon size={16} /> {title}
//         </h3>
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
//             {children}
//         </div>
//     </div>
// );

// // ── SHARE MODAL ──────────────────────────────────────────────────────────────
// const ShareModal: React.FC<{
//     isOpen: boolean;
//     onClose: () => void;
//     targetId: string;
//     targetType: 'folder' | 'certificate';
//     targetName: string;
//     initialCollaborators: string[];
//     verifyUrl?: string;
//     onSave: (id: string, type: 'folder' | 'certificate', collabs: string[]) => Promise<void>;
// }> = ({ isOpen, onClose, targetId, targetType, targetName, initialCollaborators, verifyUrl, onSave }) => {
//     const { staff = [] } = useStore() as any;
//     const [emails, setEmails] = useState<string[]>(initialCollaborators || []);
//     const [inputValue, setInputValue] = useState('');
//     const [isSaving, setIsSaving] = useState(false);
//     const [copied, setCopied] = useState(false);

//     const handleAdd = () => {
//         const cleanEmail = inputValue.trim().toLowerCase();
//         if (cleanEmail && !emails.includes(cleanEmail)) {
//             setEmails([...emails, cleanEmail]);
//             setInputValue('');
//         }
//     };

//     const handleRemove = (email: string) => {
//         setEmails(emails.filter((e: string) => e !== email));
//     };

//     const handleSave = async () => {
//         setIsSaving(true);
//         await onSave(targetId, targetType, emails);
//         setIsSaving(false);
//         onClose();
//     };

//     const handleCopyLink = async () => {
//         if (!verifyUrl) return;
//         try {
//             await navigator.clipboard.writeText(verifyUrl);
//             setCopied(true);
//             setTimeout(() => setCopied(false), 2500);
//         } catch (err) {
//             console.error("Copy error:", err);
//         }
//     };

//     if (!isOpen) return null;

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
//                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><UserPlus size={20} /></div>
//                     <div>
//                         <h2 className="wm-modal__title">Share {targetType === 'folder' ? 'Folder' : 'Certificate'}</h2>
//                         <p className="wm-modal__subtitle">Manage access for "{targetName}"</p>
//                     </div>
//                     <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
//                 </div>
//                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

//                     {/* COPY VERIFICATION LINK SECTION */}
//                     {verifyUrl && targetType === 'certificate' && (
//                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                             <label className="wm-form-label" style={{ color: '#166534', margin: 0, fontWeight: 700 }}>Public Verification URL</label>
//                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                 <input
//                                     type="text"
//                                     readOnly
//                                     value={verifyUrl}
//                                     className="wm-form-input"
//                                     style={{ margin: 0, flex: 1, background: '#ffffff', fontSize: '0.8rem', color: '#1e293b' }}
//                                 />
//                                 <button
//                                     type="button"
//                                     className={`mlab-btn ${copied ? 'mlab-btn--green' : 'mlab-btn--outline-blue'}`}
//                                     onClick={handleCopyLink}
//                                     style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: '100px', justifyContent: 'center' }}
//                                 >
//                                     {copied ? (
//                                         <>
//                                             <Check size={14} className="animate-scale-in" /> Copied!
//                                         </>
//                                     ) : (
//                                         <>
//                                             <Copy size={14} /> Copy Link
//                                         </>
//                                     )}
//                                 </button>
//                             </div>
//                         </div>
//                     )}

//                     <div>
//                         <label className="wm-form-label">Add Collaborator (Email)</label>
//                         <div style={{ display: 'flex', gap: '8px' }}>
//                             <input
//                                 type="email"
//                                 className="wm-form-input"
//                                 style={{ margin: 0, flex: 1 }}
//                                 placeholder="Search staff name or email..."
//                                 value={inputValue}
//                                 onChange={e => setInputValue(e.target.value)}
//                                 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
//                                 list="staff-emails"
//                             />
//                             <datalist id="staff-emails">
//                                 {staff.map((s: any) => s.email && (
//                                     <option key={s.id || s.email} value={s.email}>
//                                         {s.fullName} ({s.role})
//                                     </option>
//                                 ))}
//                             </datalist>
//                             <button type="button" className="mlab-btn mlab-btn--outline-blue" onClick={handleAdd}>Add</button>
//                         </div>
//                     </div>

//                     <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
//                         <label className="wm-form-label">Current Collaborators ({emails.length})</label>
//                         {emails.length === 0 ? (
//                             <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontStyle: 'italic', margin: '0.5rem 0' }}>No external collaborators added. Only you can view this.</p>
//                         ) : (
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
//                                 {emails.map((email: string) => (
//                                     <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
//                                         <span style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{email}</span>
//                                         <button type="button" className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', padding: 0 }} onClick={() => handleRemove(email)}>
//                                             <Trash2 size={14} color="#ef4444" />
//                                         </button>
//                                     </div>
//                                 ))}
//                             </div>
//                         )}
//                     </div>
//                 </div>
//                 <div className="wm-modal__footer">
//                     <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button>
//                     <button type="button" className="mlab-btn mlab-btn--primary" onClick={handleSave} disabled={isSaving}>
//                         {isSaving ? <Loader2 size={14} className="spin" /> : 'Save Access Control'}
//                     </button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// // ── FULL-SCREEN BULK GENERATOR MODAL ─────────────────────────────────────────
// const BulkGeneratorModal: React.FC<{
//     certificateGroups: any[],
//     courses: any[],
//     onClose: () => void,
//     onStart: (rows: any[], settings: any, sendEmails: boolean) => void,
//     onCreateFolder: (name: string) => Promise<string | null>
// }> = ({ certificateGroups = [], courses = [], onClose, onStart, onCreateFolder }) => {

//     const [parsedData, setParsedData] = useState<any[]>([]);
//     const [fileError, setFileError] = useState('');
//     const [sendEmails, setSendEmails] = useState(false);

//     const [isCreatingFolder, setIsCreatingFolder] = useState(false);
//     const [isSavingFolder, setIsSavingFolder] = useState(false);
//     const [newFolderName, setNewFolderName] = useState('');

//     const [settings, setSettings] = useState({
//         template: 'luxury',
//         groupId: 'general',
//         courseId: '',
//         certType: 'Achievement',
//         programme: '',
//         description: 'has demonstrated exceptional skills and outstanding performance in',
//         issueDate: new Date().toISOString().split('T')[0],
//         showQrCode: true,
//         mintToBlockchain: true
//     });

//     const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;

//         const reader = new FileReader();
//         reader.onload = (evt) => {
//             try {
//                 const bstr = evt.target?.result;
//                 const wb = XLSX.read(bstr, { type: 'binary' });
//                 const wsname = wb.SheetNames[0];
//                 const ws = wb.Sheets[wsname];
//                 const data = XLSX.utils.sheet_to_json(ws);

//                 if (data.length === 0) {
//                     setFileError("The uploaded spreadsheet is empty.");
//                     return;
//                 }

//                 const sample = data[0] as any;
//                 const hasName = ('Name' in sample) || ('name' in sample) || ('Full Name' in sample) || ('Recipient' in sample);

//                 if (!hasName) {
//                     setFileError("Spreadsheet missing a recognizable 'Name' column. Please use a column header like 'Name' or 'Full Name'.");
//                     return;
//                 }

//                 setFileError('');
//                 setParsedData(data);

//             } catch (err) {
//                 setFileError("Failed to parse the file. Ensure it is a valid .csv or .xlsx.");
//             }
//         };
//         reader.readAsBinaryString(file);
//     };

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999, padding: 0 }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: 0, margin: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', padding: '1.5rem 2rem', flexShrink: 0 }}>
//                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Layers size={20} /></div>
//                     <div>
//                         <h2 className="wm-modal__title">Bulk Generate Certificates</h2>
//                         <p className="wm-modal__subtitle">Upload a spreadsheet to automate design, blockchain anchoring, and distribution.</p>
//                     </div>
//                     <button type="button" className="wm-modal__close" onClick={onClose}><X size={24} /></button>
//                 </div>

//                 <div className="wm-modal__body" style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', padding: '2rem', display: 'flex', justifyContent: 'center' }}>
//                     <div style={{ width: '100%', maxWidth: '800px', background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid var(--mlab-border)' }}>
//                         {parsedData.length === 0 ? (
//                             <div style={{ border: '2px dashed #cbd5e1', padding: '4rem 2rem', textAlign: 'center', borderRadius: '8px', background: '#f8fafc' }}>
//                                 <UploadCloud size={56} color="#94a3b8" style={{ margin: '0 auto 1rem' }} />
//                                 <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem' }}>Upload Document Template</h3>
//                                 <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.9rem' }}>Must contain a "Name" column. Optionally include "Email" or "Course". (.csv or .xlsx)</p>
//                                 <label className="mlab-btn mlab-btn--primary" style={{ display: 'inline-flex', cursor: 'pointer', padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
//                                     Browse Files
//                                     <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} />
//                                 </label>
//                                 {fileError && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '1.5rem', fontWeight: 500 }}>{fileError}</p>}
//                             </div>
//                         ) : (
//                             <div className="wm-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f0fdf4', padding: '16px 20px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
//                                     <CheckCircle size={28} color="#16a34a" />
//                                     <div>
//                                         <h4 style={{ margin: 0, color: '#166534', fontSize: '1rem' }}>Spreadsheet Verified!</h4>
//                                         <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '0.8rem' }}>Successfully extracted <strong>{parsedData.length} records.</strong></p>
//                                     </div>
//                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => setParsedData([])}>Change File</button>
//                                 </div>

//                                 <div className="wm-form-section">
//                                     <div className="wm-form-section__label"><Layers size={14} /> Default Certificate Settings</div>
//                                     <div className="wm-form-grid">
//                                         <div className="wm-form-group wm-form-group--full">
//                                             <label className="wm-form-label">Visual Template</label>
//                                             <select className="wm-form-input" value={settings.template} onChange={e => setSettings(s => ({ ...s, template: e.target.value }))}>
//                                                 <option value="luxury">Luxury Classic</option>
//                                                 <option value="official">Official Statement (SoR)</option>
//                                                 <option value="modern">Modern Minimalist</option>
//                                             </select>
//                                         </div>

//                                         <div className="wm-form-group wm-form-group--full">
//                                             <label className="wm-form-label">Save To Folder</label>
//                                             {isCreatingFolder ? (
//                                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                                     <input
//                                                         className="wm-form-input"
//                                                         autoFocus
//                                                         placeholder="New folder name..."
//                                                         value={newFolderName}
//                                                         onChange={e => setNewFolderName(e.target.value)}
//                                                         disabled={isSavingFolder}
//                                                     />
//                                                     <button type="button" className="mlab-btn mlab-btn--primary" style={{ padding: '0.4rem 0.6rem' }} disabled={isSavingFolder} onClick={async () => {
//                                                         if (!newFolderName.trim()) return;
//                                                         setIsSavingFolder(true);
//                                                         const newId = await onCreateFolder(newFolderName.trim());
//                                                         if (newId) {
//                                                             setSettings(s => ({ ...s, groupId: newId }));
//                                                             setIsCreatingFolder(false);
//                                                             setNewFolderName('');
//                                                         }
//                                                         setIsSavingFolder(false);
//                                                     }}>
//                                                         {isSavingFolder ? <Loader2 size={14} className="spin" /> : 'Save'}
//                                                     </button>
//                                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.6rem' }} disabled={isSavingFolder} onClick={() => setIsCreatingFolder(false)}>Cancel</button>
//                                                 </div>
//                                             ) : (
//                                                 <select className="wm-form-input" value={settings.groupId} onChange={e => {
//                                                     if (e.target.value === 'create_new') {
//                                                         setIsCreatingFolder(true);
//                                                     } else {
//                                                         setSettings(s => ({ ...s, groupId: e.target.value }));
//                                                     }
//                                                 }}>
//                                                     <option value="general">General (No Folder)</option>
//                                                     {(certificateGroups || []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
//                                                     <option value="create_new" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>➕ Create New Folder...</option>
//                                                 </select>
//                                             )}
//                                         </div>

//                                         <div className="wm-form-group wm-form-group--full">
//                                             <label className="wm-form-label">Link System Course / Qualification</label>
//                                             <select
//                                                 className="wm-form-input"
//                                                 value={settings.courseId}
//                                                 onChange={e => {
//                                                     const cid = e.target.value;
//                                                     const matchedCourse = courses.find((c: any) => c.id === cid);
//                                                     setSettings(s => ({
//                                                         ...s,
//                                                         courseId: cid,
//                                                         programme: matchedCourse?.title || matchedCourse?.name || s.programme
//                                                     }));
//                                                 }}
//                                             >
//                                                 <option value="">-- Custom / Unlinked --</option>
//                                                 {(courses || []).map((c: any) => (
//                                                     <option key={c.id} value={c.id}>{c.title || c.name}</option>
//                                                 ))}
//                                             </select>
//                                         </div>

//                                         <div className="wm-form-group wm-form-group--full">
//                                             <label className="wm-form-label">Award Title</label>
//                                             <select className="wm-form-input" value={settings.certType} onChange={e => setSettings(s => ({ ...s, certType: e.target.value }))}>
//                                                 <option value="Achievement">Certificate of Achievement</option>
//                                                 <option value="Attendance">Certificate of Attendance</option>
//                                                 <option value="Excellence">Award of Excellence</option>
//                                                 <option value="Participation">Certificate of Participation</option>
//                                             </select>
//                                         </div>
//                                         <div className="wm-form-group wm-form-group--full">
//                                             <label className="wm-form-label">Default Course/Programme Name</label>
//                                             <input className="wm-form-input" placeholder="e.g. Advanced AI Bootcamp" value={settings.programme} onChange={e => setSettings(s => ({ ...s, programme: e.target.value }))} />
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 700, color: '#166534', fontSize: '0.9rem', background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
//                                         <input type="checkbox" checked={settings.mintToBlockchain} onChange={e => setSettings(s => ({ ...s, mintToBlockchain: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#16a34a' }} />
//                                         <ShieldCheck size={18} /> Anchor to Ethereum Sepolia Blockchain (Mint Verifiable Credentials)
//                                     </label>

//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                                         <input type="checkbox" checked={settings.showQrCode} onChange={e => setSettings(s => ({ ...s, showQrCode: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: 'var(--mlab-blue)' }} />
//                                         <QrCode size={18} /> Include Verification QR Code on all certificates
//                                     </label>

//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                                         <input type="checkbox" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--mlab-blue)' }} />
//                                         <Mail size={18} /> Automatically email to recipients
//                                         <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>(Requires 'Email' column in spreadsheet)</span>
//                                     </label>
//                                 </div>
//                             </div>
//                         )}
//                     </div>
//                 </div>
//                 <div className="wm-modal__footer" style={{ padding: '1.5rem 2rem', flexShrink: 0, borderTop: '1px solid var(--mlab-border)', background: 'white' }}>
//                     <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} style={{ fontSize: '1rem', padding: '0.6rem 1.25rem' }}>Cancel</button>
//                     <button
//                         type="button"
//                         className="mlab-btn mlab-btn--primary"
//                         disabled={parsedData.length === 0 || isCreatingFolder}
//                         onClick={() => onStart(parsedData, settings, sendEmails)}
//                         style={{ fontSize: '1rem', padding: '0.6rem 1.25rem' }}
//                     >
//                         {isCreatingFolder ? "Save Folder First..." : `Stage & Review (${parsedData.length})`}
//                     </button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// // ── MAIN CERTIFICATE STUDIO COMPONENT ──────────────────────────────────────
// export const CertificateStudio: React.FC = () => {
//     const location = useLocation();
//     const navigate = useNavigate();

//     const {
//         settings, user, adHocCertificates = [], certificateGroups = [],
//         fetchAdHocCertificates, fetchCertificateGroups, createCertificateGroup,
//         renameCertificateGroup, fetchSettings, cohorts = []
//     } = useStore() as any;

//     const toast = useToast();

//     // Intercept target learner passed in route state
//     const targetLearner = location.state?.learner;

//     // DUAL LANDING TAB STATE
//     const [studioLandingTab, setStudioLandingTab] = useState<'adhoc' | 'course_templates'>('adhoc');

//     // ─── VIEW & LAYOUT STATE ───
//     const [view, setView] = useState<'folders' | 'inside-folder' | 'studio' | 'bulk-review'>('folders');
//     const [activeFolder, setActiveFolder] = useState<any>(null);
//     const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

//     const [showNewFolderInput, setShowNewFolderInput] = useState(false);
//     const [newFolderName, setNewFolderName] = useState('');
//     const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
//     const [editFolderName, setEditFolderName] = useState('');

//     const [folderSearchQuery, setFolderSearchQuery] = useState('');
//     const [certSearchQuery, setCertSearchQuery] = useState('');
//     const [templateSearchQuery, setTemplateSearchQuery] = useState('');
//     const [folderToDelete, setFolderToDelete] = useState<any>(null);

//     // SYSTEM COURSES & SAVED COURSE TEMPLATES
//     const [systemCourses, setSystemCourses] = useState<any[]>([]);
//     const [courseTemplates, setCourseTemplates] = useState<any[]>([]);
//     const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
//     const [isSavingTemplate, setIsSavingTemplate] = useState(false);

//     // ─── ZIP EXPORT STATE ───
//     const [isExportingZip, setIsExportingZip] = useState(false);
//     const [zipProgress, setZipProgress] = useState({ current: 0, total: 0 });

//     // ─── LEGACY / ON-DEMAND BLOCKCHAIN MINTING STATE ───
//     const [mintingCertId, setMintingCertId] = useState<string | null>(null);

//     // ─── ROOT VIEWPORT LOCK (header never scrolls, studio fills remaining height) ───
//     const rootRef = useRef<HTMLDivElement>(null);
//     const [rootHeight, setRootHeight] = useState<number | null>(null);

//     // ─── CANVAS INTERACTIVE PAN & ZOOM GESTURE STATE ───
//     const [pan, setPan] = useState({ x: 0, y: 0 });
//     const [isPanning, setIsPanning] = useState(false);
//     const dragStartRef = useRef({ x: 0, y: 0 });
//     const userAdjustedRef = useRef(false);

//     const previewContainerRef = useRef<HTMLDivElement>(null);

//     // ─── SHARE MODAL STATE ───
//     const [shareModalConfig, setShareModalConfig] = useState<{
//         isOpen: boolean;
//         targetId: string;
//         targetType: 'folder' | 'certificate';
//         targetName: string;
//         collaborators: string[];
//         verifyUrl?: string;
//     }>({ isOpen: false, targetId: '', targetType: 'folder', targetName: '', collaborators: [], verifyUrl: '' });

//     const [certData, setCertData] = useState({
//         template: 'luxury',
//         recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '',
//         description: 'has demonstrated exceptional skills and outstanding performance in',
//         programme: 'Advanced Leadership Workshop', institutionName: 'mLab Southern Africa',
//         issueDate: new Date().toISOString().split('T')[0], signatoryName: 'Zakhele Tinga',
//         signatoryTitle: 'Academic Manager', logoUrl: mLabLogo, sigUrl: defaultSignature,
//         groupId: 'general',
//         courseId: '',
//         containerId: '',
//         verificationCode: '',
//         verifyUrl: '',
//         showQrCode: true
//     });

//     const [isGenerating, setIsGenerating] = useState(false);
//     const [actionType, setActionType] = useState<'save' | 'download' | 'email'>('save');
//     const [zoom, setZoom] = useState(0.65);
//     const certRef = useRef<HTMLDivElement>(null);

//     // ─── BULK GENERATOR STATE ───
//     const [showBulkModal, setShowBulkModal] = useState(false);
//     const [isBulkGenerating, setIsBulkGenerating] = useState(false);
//     const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, status: '' });

//     const [bulkData, setBulkData] = useState<any[]>([]);
//     const [bulkSettings, setBulkSettings] = useState<any>(null);
//     const [bulkSendEmails, setBulkSendEmails] = useState(false);
//     const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
//     const [applyBulkEditsToAll, setApplyBulkEditsToAll] = useState(false);

//     const isStudioView = view === 'studio' || view === 'bulk-review';

//     useLayoutEffect(() => {
//         const el = rootRef.current;
//         if (!el) return;

//         const locked: { node: HTMLElement; overflowY: string }[] = [];
//         let node: HTMLElement | null = el.parentElement;
//         while (node && node !== document.body && node !== document.documentElement) {
//             const cs = window.getComputedStyle(node);
//             if (/(auto|scroll)/.test(cs.overflowY)) {
//                 node.scrollTop = 0;
//                 locked.push({ node, overflowY: node.style.overflowY });
//                 node.style.overflowY = 'hidden';
//             }
//             node = node.parentElement;
//         }
//         const prevBodyOverflow = document.body.style.overflow;
//         document.body.style.overflow = 'hidden';
//         window.scrollTo(0, 0);

//         const measure = () => {
//             const top = el.getBoundingClientRect().top;
//             setRootHeight(Math.max(360, Math.floor(window.innerHeight - top)));
//         };
//         measure();
//         const settle = window.setTimeout(measure, 150);
//         window.addEventListener('resize', measure);

//         return () => {
//             window.clearTimeout(settle);
//             window.removeEventListener('resize', measure);
//             locked.forEach(({ node, overflowY }) => { node.style.overflowY = overflowY; });
//             document.body.style.overflow = prevBodyOverflow;
//         };
//     }, []);

//     const handleFitToScreen = useCallback(() => {
//         userAdjustedRef.current = false;
//         const container = previewContainerRef.current;
//         if (!container) return;
//         const { clientWidth, clientHeight } = container;
//         if (clientWidth <= 0 || clientHeight <= 0) return;

//         const paddingX = 80;
//         const paddingY = 110;
//         const scaleX = (clientWidth - paddingX) / CERT_WIDTH;
//         const scaleY = (clientHeight - paddingY) / CERT_HEIGHT;
//         const fitScale = Math.min(scaleX, scaleY);

//         setZoom(Number(clampZoom(fitScale).toFixed(3)));
//         setPan({ x: 0, y: 0 });
//     }, []);

//     const handleResetViewport = useCallback(() => {
//         userAdjustedRef.current = true;
//         setZoom(1);
//         setPan({ x: 0, y: 0 });
//     }, []);

//     useEffect(() => {
//         if (!isStudioView) return;
//         const timer = setTimeout(() => handleFitToScreen(), 120);

//         const container = previewContainerRef.current;
//         if (!container) return () => clearTimeout(timer);

//         const resizeObserver = new ResizeObserver(() => {
//             if (!userAdjustedRef.current) handleFitToScreen();
//         });
//         resizeObserver.observe(container);

//         return () => {
//             clearTimeout(timer);
//             resizeObserver.disconnect();
//         };
//     }, [isStudioView, handleFitToScreen]);

//     useEffect(() => {
//         if (!isStudioView) return;
//         const el = previewContainerRef.current;
//         if (!el) return;

//         const onWheel = (e: WheelEvent) => {
//             e.preventDefault();
//             if (e.ctrlKey || e.metaKey) {
//                 userAdjustedRef.current = true;
//                 const factor = e.deltaY > 0 ? 0.92 : 1.08;
//                 setZoom(prev => Number(clampZoom(prev * factor).toFixed(3)));
//             } else {
//                 setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
//             }
//         };

//         el.addEventListener('wheel', onWheel, { passive: false });
//         return () => el.removeEventListener('wheel', onWheel);
//     }, [isStudioView]);

//     const fetchStudioDatasets = useCallback(async () => {
//         try {
//             const coursesSnap = await getDocs(collection(db, 'content_packages'));
//             setSystemCourses(coursesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
//         } catch (err: any) {
//             if (cohorts && cohorts.length > 0) setSystemCourses(cohorts);
//         }

//         try {
//             const templatesSnap = await getDocs(collection(db, 'certificate_templates'));
//             setCourseTemplates(templatesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
//         } catch (err: any) {
//             setCourseTemplates([]);
//         }
//     }, [cohorts]);

//     useEffect(() => {
//         fetchStudioDatasets();
//     }, [fetchStudioDatasets]);

//     useEffect(() => {
//         if (targetLearner) {
//             setCertData(prev => ({
//                 ...prev,
//                 recipientName: targetLearner.fullName || targetLearner.name || '',
//                 recipientEmail: targetLearner.email || '',
//                 programme: targetLearner.qualification?.name || targetLearner.programmeName || prev.programme,
//                 certType: 'Competence',
//             }));
//             setView('studio');
//         }
//     }, [targetLearner]);

//     useEffect(() => { if (!settings && fetchSettings) fetchSettings(); }, [settings, fetchSettings]);

//     useEffect(() => {
//         if (settings) {
//             setCertData(prev => ({
//                 ...prev,
//                 institutionName: settings.institutionName || "mLab Southern Africa",
//                 signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
//                 signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
//                 logoUrl: mLabLogo, sigUrl: (settings as any).signatureUrl || defaultSignature
//             }));
//         }
//     }, [settings]);

//     useEffect(() => {
//         const loadInitialData = async () => {
//             try {
//                 if (fetchCertificateGroups) await fetchCertificateGroups();
//                 if (fetchAdHocCertificates) await fetchAdHocCertificates();
//             } catch (error) { console.error("Failed to load studio data", error); }
//             finally { setIsLoadingData(false); }
//         };
//         if (adHocCertificates.length === 0 || certificateGroups.length === 0) loadInitialData();
//         else setIsLoadingData(false);
//     }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

//     useEffect(() => {
//         if (view === 'bulk-review' && bulkData.length > 0) {
//             const currentRecord = bulkData[bulkCurrentIndex];
//             if (currentRecord) setCertData(currentRecord);
//         }
//     }, [bulkCurrentIndex, view, bulkData]);

//     const isSuperAdmin = (user as any)?.isSuperAdmin === true;
//     const userEmail = user?.email?.toLowerCase() || '';

//     const myCertificateGroups = (certificateGroups || []).filter((g: any) =>
//         isSuperAdmin || g.createdBy === user?.uid || (g.collaborators || []).includes(userEmail)
//     );

//     const myAdHocCertificates = (adHocCertificates || []).filter((c: any) =>
//         isSuperAdmin || c.createdBy === user?.uid || (c.collaborators || []).includes(userEmail)
//     );

//     const handleMintExistingCertificate = async (cert: any) => {
//         setMintingCertId(cert.id);
//         toast.info(`Minting certificate for ${cert.recipientName} to Blockchain...`);

//         try {
//             const codePrefix = cert.recipientName ? cert.recipientName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X') : '0000';
//             const verificationCode = cert.verificationCode || `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
//             const verifyUrl = (cert.verifyUrl && !cert.verifyUrl.includes('localhost'))
//                 ? cert.verifyUrl
//                 : `${getBaseUrl()}/verify/${verificationCode}`;

//             let pdfBase64 = '';
//             if (cert.pdfUrl) {
//                 const response = await fetch(cert.pdfUrl);
//                 const blob = await response.blob();
//                 pdfBase64 = await blobToDataUrl(blob);
//             } else {
//                 throw new Error("No PDF URL found for this certificate.");
//             }

//             const functions = getFunctions();
//             const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

//             const bcResponse: any = await issueBlockchainCertificate({
//                 verificationCode,
//                 learnerName: cert.recipientName,
//                 idNumber: cert.idNumber || 'N/A',
//                 qualification: cert.courseName || cert.programme || 'Certificate',
//                 issueDate: cert.issueDate || new Date().toISOString().split('T')[0],
//                 eisaStatus: cert.type || 'Achievement',
//                 pdfBase64: pdfBase64
//             });

//             if (bcResponse.data?.success) {
//                 const blockchainTxHash = bcResponse.data.transactionHash;
//                 const ipfsHash = bcResponse.data.ipfsHash;
//                 const blockchainStatus = 'anchored';

//                 await updateDoc(doc(db, 'ad_hoc_certificates', cert.id), {
//                     verificationCode,
//                     verifyUrl,
//                     blockchainTxHash,
//                     ipfsHash,
//                     blockchainStatus
//                 });

//                 toast.success(`Successfully anchored ${cert.recipientName}'s certificate on Blockchain!`);
//                 if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
//             } else {
//                 throw new Error("Blockchain service returned unsuccessful response.");
//             }
//         } catch (error: any) {
//             console.error("Mint existing certificate error:", error);
//             toast.error(error?.message || "Failed to mint certificate to Blockchain.");
//         } finally {
//             setMintingCertId(null);
//         }
//     };

//     const handleExportFolderZip = async (folderObj: any) => {
//         let certsInFolder: any[] = [];
//         if (folderObj.id === 'general') {
//             certsInFolder = myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general');
//         } else {
//             certsInFolder = myAdHocCertificates.filter((c: any) => c.groupId === folderObj.id);
//         }

//         if (certsInFolder.length === 0) {
//             toast.warning(`Folder "${folderObj.name}" contains no certificates to export.`);
//             return;
//         }

//         setIsExportingZip(true);
//         setZipProgress({ current: 0, total: certsInFolder.length });
//         toast.info(`Preparing ZIP archive for "${folderObj.name}"...`);

//         try {
//             const zip = new JSZip();
//             const folderNameClean = (folderObj.name || 'Certificates').replace(/[^a-zA-Z0-9_-]/g, '_');
//             const zipFolder = zip.folder(folderNameClean) || zip;

//             let successfulCount = 0;

//             for (let i = 0; i < certsInFolder.length; i++) {
//                 const cert = certsInFolder[i];
//                 setZipProgress({ current: i + 1, total: certsInFolder.length });

//                 if (!cert.pdfUrl) continue;

//                 try {
//                     const response = await fetch(cert.pdfUrl);
//                     if (!response.ok) throw new Error(`HTTP ${response.status}`);
//                     const blob = await response.blob();

//                     const safeRecipient = (cert.recipientName || `Certificate_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
//                     const certTitle = (cert.type || 'Award').replace(/[^a-zA-Z0-9_-]/g, '_');
//                     const fileFilename = `${safeRecipient}_${certTitle}.pdf`;

//                     zipFolder.file(fileFilename, blob);
//                     successfulCount++;
//                 } catch (fetchErr) {
//                     console.warn(`Could not fetch PDF for ${cert.recipientName}:`, fetchErr);
//                 }
//             }

//             if (successfulCount === 0) {
//                 toast.error("Could not download PDF files from Storage.");
//                 setIsExportingZip(false);
//                 return;
//             }

//             toast.info("Compressing files into .zip archive...");
//             const zipContent = await zip.generateAsync({ type: 'blob' });

//             const zipUrl = URL.createObjectURL(zipContent);
//             const downloadLink = document.createElement('a');
//             downloadLink.href = zipUrl;
//             downloadLink.download = `${folderNameClean}_Certificates.zip`;
//             document.body.appendChild(downloadLink);
//             downloadLink.click();
//             document.body.removeChild(downloadLink);
//             URL.revokeObjectURL(zipUrl);

//             toast.success(`Successfully exported ${successfulCount} certificates as ZIP!`);
//         } catch (err: any) {
//             console.error("ZIP Export Error:", err);
//             toast.error("Failed to generate ZIP export.");
//         } finally {
//             setIsExportingZip(false);
//             setZipProgress({ current: 0, total: 0 });
//         }
//     };

//     const handleCreateFolder = async () => {
//         if (!newFolderName.trim()) return;
//         try {
//             if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());
//             if (fetchCertificateGroups) await fetchCertificateGroups(true);
//             setNewFolderName(''); setShowNewFolderInput(false); toast.success("Folder created successfully!");
//         } catch (error) { toast.error("Failed to create folder"); }
//     };

//     const handleRenameFolder = async (id: string) => {
//         if (!editFolderName.trim()) { setEditingFolderId(null); return; }
//         try {
//             if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
//             if (fetchCertificateGroups) await fetchCertificateGroups(true);
//             setEditingFolderId(null); toast.success("Folder renamed!");
//         } catch (error) { toast.error("Failed to rename folder"); }
//     };

//     const triggerDeleteFolder = (e: React.MouseEvent, folder: any) => {
//         e.stopPropagation();
//         setFolderToDelete(folder);
//     };

//     const executeDeleteFolder = async () => {
//         if (!folderToDelete) return;
//         try {
//             const batch = writeBatch(db);
//             const certsToMove = myAdHocCertificates.filter((c: any) => c.groupId === folderToDelete.id);
//             certsToMove.forEach((cert: any) => {
//                 batch.update(doc(db, 'ad_hoc_certificates', cert.id), { groupId: 'general' });
//             });
//             batch.delete(doc(db, 'certificate_groups', folderToDelete.id));

//             await batch.commit();
//             toast.success(`Folder deleted. ${certsToMove.length} certificates safely moved to General.`);

//             if (fetchCertificateGroups) await fetchCertificateGroups(true);
//             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
//         } catch (error) {
//             console.error("Delete Error:", error);
//             toast.error("Failed to delete folder.");
//         } finally {
//             setFolderToDelete(null);
//         }
//     };

//     const handleSaveCollaborators = async (id: string, type: 'folder' | 'certificate', collaborators: string[]) => {
//         try {
//             const collectionName = type === 'folder' ? 'certificate_groups' : 'ad_hoc_certificates';
//             await updateDoc(doc(db, collectionName, id), { collaborators });
//             toast.success('Access control updated securely.');

//             if (type === 'folder' && fetchCertificateGroups) await fetchCertificateGroups(true);
//             if (type === 'certificate' && fetchAdHocCertificates) await fetchAdHocCertificates(true);

//             if (activeFolder && activeFolder.id === id) {
//                 setActiveFolder((prev: any) => ({ ...prev, collaborators }));
//             }
//         } catch (err) {
//             toast.error('Failed to update collaborators.');
//         }
//     };

//     const getCertificatesForActiveFolder = () => {
//         if (!activeFolder) return [];
//         let certs: any[] = [];
//         if (activeFolder.id === 'general') certs = myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general');
//         else certs = myAdHocCertificates.filter((c: any) => c.groupId === activeFolder.id);

//         if (certSearchQuery) {
//             const q = certSearchQuery.toLowerCase();
//             return certs.filter((c: any) =>
//                 (c.recipientName || '').toLowerCase().includes(q) ||
//                 (c.courseName || '').toLowerCase().includes(q) ||
//                 (c.type || '').toLowerCase().includes(q)
//             );
//         }
//         return certs;
//     };

//     const filteredFolders = myCertificateGroups.filter((g: any) => (g.name || '').toLowerCase().includes(folderSearchQuery.toLowerCase()));
//     const showGeneralFolder = folderSearchQuery === '' || 'general certificates'.includes(folderSearchQuery.toLowerCase());

//     const filteredCourseTemplates = courseTemplates.filter((t: any) =>
//         (t.title || '').toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
//         (t.programmeName || '').toLowerCase().includes(templateSearchQuery.toLowerCase())
//     );

//     const handleZoomIn = () => { userAdjustedRef.current = true; setZoom(prev => Number(clampZoom(prev + 0.1).toFixed(3))); };
//     const handleZoomOut = () => { userAdjustedRef.current = true; setZoom(prev => Number(clampZoom(prev - 0.1).toFixed(3))); };

//     const handleCanvasMouseDown = (e: React.MouseEvent) => {
//         if (e.button !== 0 && e.button !== 1) return;
//         setIsPanning(true);
//         dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
//     };

//     const handleCanvasMouseMove = (e: React.MouseEvent) => {
//         if (!isPanning) return;
//         setPan({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
//     };

//     const handleCanvasMouseUp = () => setIsPanning(false);

//     const stopCanvasEvent = (e: React.SyntheticEvent) => e.stopPropagation();

//     const handleChange = (field: string, value: any) => {
//         setCertData(prev => ({ ...prev, [field]: value }));
//         const personalFields = ['recipientName', 'recipientEmail'];

//         if (view === 'bulk-review') {
//             setBulkData(currentBulk => {
//                 if (applyBulkEditsToAll && !personalFields.includes(field)) {
//                     return currentBulk.map((cert: any) => ({ ...cert, [field]: value }));
//                 } else {
//                     const updated = [...currentBulk];
//                     updated[bulkCurrentIndex] = { ...updated[bulkCurrentIndex], [field]: value };
//                     return updated;
//                 }
//             });
//         }
//     };

//     const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
//         const file = e.target.files?.[0];
//         if (file) { handleChange(field, URL.createObjectURL(file)); }
//     };

//     const resetForm = () => {
//         setEditingTemplateId(null);
//         setPan({ x: 0, y: 0 });
//         setCertData(prev => ({
//             ...prev,
//             recipientName: '',
//             recipientEmail: '',
//             certType: 'Achievement',
//             customType: '',
//             programme: 'Advanced Leadership Workshop',
//             courseId: '',
//             containerId: '',
//             verificationCode: '',
//             verifyUrl: '',
//             showQrCode: true
//         }));
//     };

//     const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

//     const handleEditTemplate = (tmpl: any) => {
//         setEditingTemplateId(tmpl.id);
//         setPan({ x: 0, y: 0 });
//         setCertData({
//             template: tmpl.templateVisual || 'luxury',
//             recipientName: 'SAMPLE LEARNER (PREVIEW)',
//             recipientEmail: 'learner@example.com',
//             certType: tmpl.certType || 'Achievement',
//             customType: '',
//             description: tmpl.description || 'has demonstrated exceptional skills and performance in',
//             programme: tmpl.programmeName || '',
//             institutionName: tmpl.institutionName || 'mLab Southern Africa',
//             issueDate: new Date().toISOString().split('T')[0],
//             signatoryName: tmpl.signatoryName || '',
//             signatoryTitle: tmpl.signatoryTitle || '',
//             logoUrl: tmpl.logoUrl || mLabLogo,
//             sigUrl: tmpl.sigUrl || defaultSignature,
//             groupId: 'general',
//             courseId: tmpl.courseId || '',
//             containerId: tmpl.containerId || '',
//             verificationCode: '',
//             verifyUrl: '',
//             showQrCode: tmpl.showQrCode !== false
//         });
//         setView('studio');
//     };

//     const handleDeleteTemplate = async (tmplId: string, title: string) => {
//         if (!window.confirm(`Are you sure you want to delete template "${title}"?`)) return;
//         try {
//             await deleteDoc(doc(db, 'certificate_templates', tmplId));
//             toast.success("Certificate template deleted.");
//             fetchStudioDatasets();
//         } catch (err) {
//             toast.error("Failed to delete template.");
//         }
//     };

//     const handleSaveAsReusableTemplate = async () => {
//         if (!certData.programme) {
//             toast.warning("Please provide or select a course/programme name first.");
//             return;
//         }

//         setIsSavingTemplate(true);
//         try {
//             const templatePayload = {
//                 title: `${certData.programme} - ${finalCertType} Template`,
//                 courseId: certData.courseId || null,
//                 programmeName: certData.programme,
//                 certType: finalCertType,
//                 templateVisual: certData.template,
//                 description: certData.description,
//                 institutionName: certData.institutionName,
//                 signatoryName: certData.signatoryName,
//                 signatoryTitle: certData.signatoryTitle,
//                 logoUrl: certData.logoUrl,
//                 sigUrl: certData.sigUrl,
//                 showQrCode: certData.showQrCode,
//                 updatedAt: serverTimestamp()
//             };

//             if (editingTemplateId) {
//                 await updateDoc(doc(db, 'certificate_templates', editingTemplateId), templatePayload);
//                 toast.success(`Template updated successfully!`);
//             } else {
//                 await addDoc(collection(db, 'certificate_templates'), {
//                     ...templatePayload,
//                     createdBy: user?.uid || 'Admin',
//                     createdAt: serverTimestamp()
//                 });
//                 toast.success(`Saved new template "${templatePayload.title}"! It is now available in Launch Cohort Run modal.`);
//             }

//             fetchStudioDatasets();
//             setView('folders');
//             setStudioLandingTab('course_templates');
//         } catch (err: any) {
//             console.error("Save template error:", err);
//             toast.error("Failed to save certificate template.");
//         } finally {
//             setIsSavingTemplate(false);
//         }
//     };

//     // ============================================================================
//     // SINGLE CERTIFICATE GENERATION & BLOCKCHAIN HANDSHAKE
//     // ============================================================================
//     const executeGeneration = useCallback(async (overrideAction?: 'save' | 'download' | 'email') => {
//         const mode = overrideAction || actionType;
//         if (!certRef.current) return;
//         if (!certData.recipientName.trim()) { toast.error('Recipient name is required'); return; }

//         setIsGenerating(true);
//         setActionType(mode);

//         const actionLabel = mode === 'email'
//             ? 'Generating & sending email...'
//             : mode === 'download'
//                 ? 'Generating & Downloading PDF...'
//                 : 'Generating & Anchoring to Blockchain...';
//         toast.info(actionLabel);

//         try {
//             const codePrefix = targetLearner?.idNumber ? targetLearner.idNumber.slice(-4) : '0000';
//             const verificationCode = certData.verificationCode || `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
//             const verifyUrl = `${getBaseUrl()}/verify/${verificationCode}`;

//             setCertData(prev => ({ ...prev, verificationCode, verifyUrl }));
//             await new Promise(resolve => setTimeout(resolve, 500));

//             const canvas = await captureCertificateCanvas(certRef.current);

//             const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
//             pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
//             const pdfBlob = pdf.output('blob');

//             const pdfBase64 = await blobToDataUrl(pdfBlob);

//             const storage = getStorage();
//             const safeName = certData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
//             const fileName = `ad_hoc_certs/${Date.now()}_${safeName}.pdf`;
//             const storageRef = ref(storage, fileName);
//             await uploadBytes(storageRef, pdfBlob);
//             const downloadUrl = await getDownloadURL(storageRef);

//             let blockchainTxHash = null;
//             let ipfsHash = null;
//             let blockchainStatus = 'pending';

//             try {
//                 toast.info("Anchoring to Ethereum Sepolia Blockchain...");
//                 const functions = getFunctions();
//                 const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

//                 const bcResponse: any = await issueBlockchainCertificate({
//                     verificationCode,
//                     learnerName: certData.recipientName,
//                     idNumber: targetLearner?.idNumber || 'N/A',
//                     qualification: certData.programme,
//                     issueDate: certData.issueDate,
//                     eisaStatus: finalCertType,
//                     pdfBase64: pdfBase64
//                 });

//                 if (bcResponse.data?.success) {
//                     blockchainTxHash = bcResponse.data.transactionHash;
//                     ipfsHash = bcResponse.data.ipfsHash;
//                     blockchainStatus = 'anchored';
//                     toast.success("Successfully anchored to Blockchain!");
//                 }
//             } catch (bcError) {
//                 console.error("Blockchain anchoring failed:", bcError);
//                 toast.warning("PDF saved, but blockchain anchoring failed.");
//             }

//             const targetFolderObj = (myCertificateGroups || []).find((g: any) => g.id === certData.groupId);
//             const savedFolderName = targetFolderObj?.name || (certData.groupId === 'general' || !certData.groupId ? 'General Certificates' : 'Workspace Folder');

//             const certRecord = {
//                 recipientName: certData.recipientName,
//                 recipientEmail: certData.recipientEmail || null,
//                 learnerId: targetLearner?.id || null,
//                 courseId: certData.courseId || null,
//                 containerId: certData.containerId || null,
//                 type: finalCertType,
//                 courseName: certData.programme,
//                 issueDate: certData.issueDate,

//                 pdfUrl: downloadUrl,
//                 verificationCode: verificationCode,
//                 verifyUrl: verifyUrl,
//                 blockchainTxHash: blockchainTxHash,
//                 ipfsHash: ipfsHash,
//                 blockchainStatus: blockchainStatus,
//                 showQrCode: certData.showQrCode !== false,

//                 groupId: certData.groupId || 'general',
//                 templateUsed: certData.template,
//                 createdBy: user?.uid || 'Admin',
//                 createdAt: serverTimestamp(),
//                 isEmailed: false,
//                 collaborators: []
//             };

//             const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), certRecord);

//             if (targetLearner?.id) {
//                 await updateDoc(doc(db, 'learners', targetLearner.id), {
//                     certificates: arrayUnion({
//                         id: newCertRef.id,
//                         courseId: certData.courseId || null,
//                         type: finalCertType,
//                         courseName: certData.programme,
//                         issueDate: certData.issueDate,
//                         pdfUrl: downloadUrl,
//                         verificationCode: verificationCode,
//                         createdAt: new Date().toISOString()
//                     })
//                 });
//             }

//             if (mode === 'email' && certData.recipientEmail) {
//                 const functions = getFunctions();
//                 const sendAdHocEmail = httpsCallable(functions, 'sendAdHocCertificate');
//                 await sendAdHocEmail({ email: certData.recipientEmail, recipientName: certData.recipientName, pdfUrl: downloadUrl, awardTitle: finalCertType, courseName: certData.programme });
//                 await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
//                 toast.success(`Certificate saved to "${savedFolderName}" & emailed to ${certData.recipientEmail}!`);
//             } else if (mode === 'download') {
//                 pdf.save(`Certificate_${safeName}.pdf`);
//                 toast.success(`Certificate downloaded & saved to "${savedFolderName}"!`);
//             } else if (mode === 'save') {
//                 toast.success(`Certificate saved to "${savedFolderName}" & anchored to Blockchain!`);
//             }

//             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
//             resetForm();
//             navigate('/admin?tab=studio', { replace: true, state: {} });
//             setView('folders');
//         } catch (error: any) {
//             console.error('Studio Error:', error);
//             toast.error(`Studio Error: ${error?.message || 'Failed to process.'}`);
//         } finally { setIsGenerating(false); }
//     }, [certRef, certData, actionType, toast, finalCertType, user, targetLearner, fetchAdHocCertificates, navigate, myCertificateGroups]);

//     const handleStartBulkReview = (rows: any[], settings: any, sendEmails: boolean) => {
//         setShowBulkModal(false);
//         const fullyMappedData = rows.map((row: any) => ({
//             ...certData,
//             ...settings,
//             recipientName: row.Name || row.name || row['Full Name'] || row.Recipient || 'Unknown',
//             recipientEmail: row.Email || row.email || row['Email Address'] || '',
//             programme: row.Course || row.course || row.Programme || settings.programme
//         }));

//         setBulkData(fullyMappedData);
//         setBulkSettings(settings);
//         setBulkSendEmails(sendEmails);
//         setBulkCurrentIndex(0);
//         setCertData(fullyMappedData[0]);
//         setView('bulk-review');
//     };

//     // ============================================================================
//     // BULK CERTIFICATE GENERATION & BLOCKCHAIN HANDSHAKE
//     // ============================================================================
//     const executeFinalBulkProcessing = async () => {
//         setIsBulkGenerating(true);

//         let successCount = 0;

//         try {
//             for (let i = 0; i < bulkData.length; i++) {
//                 setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Preparing document verification data...' });
//                 const currentCert = bulkData[i];

//                 const codePrefix = currentCert.recipientName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
//                 const verificationCode = `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
//                 const verifyUrl = `${getBaseUrl()}/verify/${verificationCode}`;

//                 const activeCertData = {
//                     ...currentCert,
//                     verificationCode,
//                     verifyUrl
//                 };

//                 setCertData(activeCertData);
//                 await new Promise(r => setTimeout(r, 600));

//                 if (!certRef.current) continue;

//                 setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Capturing High-Resolution PDF...' });
//                 const canvas = await captureCertificateCanvas(certRef.current);
//                 const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
//                 pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
//                 const pdfBlob = pdf.output('blob');

//                 const pdfBase64 = await blobToDataUrl(pdfBlob);

//                 setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Uploading securely to Cloud Storage...' });
//                 const safeName = activeCertData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
//                 const fileName = `ad_hoc_certs/bulk_${Date.now()}_${safeName}.pdf`;
//                 const storageRef = ref(getStorage(), fileName);
//                 await uploadBytes(storageRef, pdfBlob);
//                 const downloadUrl = await getDownloadURL(storageRef);

//                 let blockchainTxHash = null;
//                 let ipfsHash = null;
//                 let blockchainStatus = 'pending';

//                 if (bulkSettings?.mintToBlockchain) {
//                     setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Minting to Ethereum Sepolia Blockchain...' });
//                     try {
//                         const functions = getFunctions();
//                         const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

//                         const bcResponse: any = await issueBlockchainCertificate({
//                             verificationCode,
//                             learnerName: activeCertData.recipientName,
//                             idNumber: 'N/A',
//                             qualification: activeCertData.programme,
//                             issueDate: activeCertData.issueDate,
//                             eisaStatus: activeCertData.certType,
//                             pdfBase64: pdfBase64
//                         });

//                         if (bcResponse.data?.success) {
//                             blockchainTxHash = bcResponse.data.transactionHash;
//                             ipfsHash = bcResponse.data.ipfsHash;
//                             blockchainStatus = 'anchored';
//                         }
//                     } catch (bcError) {
//                         console.warn(`Bulk blockchain anchoring failed for ${activeCertData.recipientName}:`, bcError);
//                     }
//                 } else {
//                     blockchainStatus = 'not_requested';
//                 }

//                 setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Saving to Workspace Directory...' });
//                 const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
//                     recipientName: activeCertData.recipientName,
//                     recipientEmail: activeCertData.recipientEmail || null,
//                     courseId: activeCertData.courseId || null,
//                     type: activeCertData.certType,
//                     courseName: activeCertData.programme,
//                     issueDate: activeCertData.issueDate,

//                     pdfUrl: downloadUrl,
//                     verificationCode: verificationCode,
//                     verifyUrl: verifyUrl,
//                     blockchainTxHash: blockchainTxHash,
//                     ipfsHash: ipfsHash,
//                     blockchainStatus: blockchainStatus,
//                     showQrCode: activeCertData.showQrCode !== false,

//                     groupId: activeCertData.groupId || 'general',
//                     templateUsed: activeCertData.template,
//                     createdBy: user?.uid || 'Admin',
//                     createdAt: serverTimestamp(),
//                     isEmailed: false,
//                     emailStatus: (bulkSendEmails && activeCertData.recipientEmail) ? 'pending' : 'not_requested',
//                     isBulkUpload: true,
//                     collaborators: []
//                 });

//                 if (bulkSendEmails && activeCertData.recipientEmail) {
//                     setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Dispatching via Email...' });
//                     try {
//                         const sendAdHocEmail = httpsCallable(getFunctions(), 'sendAdHocCertificate');
//                         await sendAdHocEmail({ email: activeCertData.recipientEmail, recipientName: activeCertData.recipientName, pdfUrl: downloadUrl, awardTitle: activeCertData.certType, courseName: activeCertData.programme });
//                         await updateDoc(newCertRef, { isEmailed: true, emailStatus: 'sent', emailedAt: serverTimestamp() });
//                     } catch (emailError: any) {
//                         console.error(`Failed to send email to ${activeCertData.recipientEmail}:`, emailError);
//                         await updateDoc(newCertRef, { emailStatus: 'failed', emailError: emailError?.message || 'Cloud function failed' });
//                     }
//                 }
//                 successCount++;

//                 setBulkProgress({ current: i + 1, total: bulkData.length, status: 'Network cooldown...' });
//                 await new Promise(r => setTimeout(r, 1000));
//             }

//             toast.success(`Bulk Operation Complete: ${successCount} certificates generated & processed successfully.`);
//             if (fetchAdHocCertificates) fetchAdHocCertificates(true);

//         } catch (error) {
//             console.error("Bulk process failed:", error);
//             toast.error("A critical error interrupted the bulk generation loop.");
//         } finally {
//             setIsBulkGenerating(false);
//             setBulkData([]);
//             setBulkSettings(null);
//             setBulkProgress({ current: 0, total: 0, status: '' });
//             resetForm();
//             setView('folders');
//         }
//     };

//     const canvasBackdrop: React.CSSProperties = {
//         backgroundColor: '#1e293b',
//         backgroundImage: 'radial-gradient(rgba(148,163,184,0.28) 1px, transparent 1px)',
//         backgroundSize: '22px 22px',
//         backgroundPosition: `${pan.x}px ${pan.y}px`
//     };

//     return (
//         <div
//             ref={rootRef}
//             className="wm-root animate-fade-in"
//             style={{
//                 display: 'flex',
//                 flexDirection: 'column',
//                 height: rootHeight ? `${rootHeight}px` : '100%',
//                 maxHeight: rootHeight ? `${rootHeight}px` : undefined,
//                 minHeight: 0,
//                 overflow: 'hidden',
//                 position: 'relative'
//             }}
//         >

//             {folderToDelete && (
//                 <div style={{ position: 'relative', zIndex: 999999 }}>
//                     <StatusModal
//                         type="warning"
//                         title="Delete Workspace Folder"
//                         message={`Are you sure you want to delete the folder "${folderToDelete.name}"?\n\nDon't worry! All certificates currently inside this folder will be safely preserved and moved back to the General Certificates workspace.`}
//                         confirmText="Yes, Delete Folder"
//                         onClose={executeDeleteFolder}
//                         onCancel={() => setFolderToDelete(null)}
//                     />
//                 </div>
//             )}

//             {shareModalConfig.isOpen && (
//                 <ShareModal
//                     isOpen={shareModalConfig.isOpen}
//                     onClose={() => setShareModalConfig({ ...shareModalConfig, isOpen: false })}
//                     targetId={shareModalConfig.targetId}
//                     targetType={shareModalConfig.targetType}
//                     targetName={shareModalConfig.targetName}
//                     initialCollaborators={shareModalConfig.collaborators}
//                     verifyUrl={shareModalConfig.verifyUrl}
//                     onSave={handleSaveCollaborators}
//                 />
//             )}

//             {/* ZIP EXPORT OVERLAY */}
//             {isExportingZip && (
//                 <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
//                     <div className="ap-spinner" style={{ width: '60px', height: '60px', marginBottom: '1.5rem', borderTopColor: 'var(--mlab-green)' }}></div>
//                     <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', fontSize: '1.75rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Creating Folder ZIP Archive</h2>
//                     <p style={{ color: 'var(--mlab-grey)', fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         Downloading &amp; Bundling <span style={{ color: 'var(--mlab-green)', fontWeight: 'bold' }}>{zipProgress.current}</span> of {zipProgress.total} PDFs...
//                     </p>
//                     <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Please wait while files are being zipped.</p>
//                 </div>
//             )}

//             {/* 🚀 BULK PROCESSING LIVE PROGRESS OVERLAY (PORTALED FULLSCREEN) */}
//             {isBulkGenerating && createPortal(
//                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(255,255,255,0.96)', zIndex: 999999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
//                     <div className="ap-spinner" style={{ width: '60px', height: '60px', marginBottom: '1.5rem', borderTopColor: 'var(--mlab-blue)' }}></div>
//                     <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', fontSize: '2rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Generating Batch Certificates</h2>

//                     <p style={{ color: 'var(--mlab-grey)', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         Processing <span style={{ color: 'var(--mlab-blue)', fontWeight: 'bold', fontSize: '1.5rem' }}>{bulkProgress.current}</span> of {bulkProgress.total}...
//                     </p>

//                     <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '12px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '320px', textAlign: 'center' }}>
//                         <span style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{bulkProgress.status || 'Initializing...'}</span>
//                     </div>

//                     {bulkSettings?.mintToBlockchain && (
//                         <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>
//                             <ShieldCheck size={18} /> Minting to Blockchain Enabled ({bulkProgress.current} / {bulkProgress.total})
//                         </div>
//                     )}

//                     <p style={{ marginTop: '2.5rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>DO NOT CLOSE THIS TAB OR SWITCH WINDOWS.</p>
//                 </div>,
//                 document.body
//             )}

//             {showBulkModal && (
//                 <BulkGeneratorModal
//                     certificateGroups={myCertificateGroups}
//                     courses={systemCourses}
//                     onClose={() => setShowBulkModal(false)}
//                     onStart={handleStartBulkReview}
//                     onCreateFolder={async (name) => {
//                         try {
//                             const newDocRef = await addDoc(collection(db, 'certificate_groups'), {
//                                 name: name,
//                                 createdAt: serverTimestamp(),
//                                 createdBy: user?.uid || 'Admin',
//                                 collaborators: []
//                             });
//                             if (fetchCertificateGroups) await fetchCertificateGroups(true);
//                             toast.success("Folder created successfully!");
//                             return newDocRef.id;
//                         } catch (error) {
//                             toast.error("Failed to create folder");
//                             return null;
//                         }
//                     }}
//                 />
//             )}

//             {/* ── FIXED APPLICATION HEADER ── */}
//             {view !== 'bulk-review' && (
//                 <div className="wm-page-header" style={{ flexShrink: 0 }}>
//                     <div className="wm-page-header__left">
//                         <div className="wm-page-header__icon"><Award size={22} /></div>
//                         <div>
//                             <h1 className="wm-page-header__title">{view === 'folders' ? 'Certificate Studio' : view === 'inside-folder' ? activeFolder?.name : 'Design Certificate'}</h1>
//                             <p className="wm-page-header__desc">
//                                 {targetLearner ? `Issuing Official Certificate for ${targetLearner.fullName}` : 'Design custom ad-hoc awards, reusable course templates, and manage document history.'}
//                             </p>
//                         </div>
//                     </div>
//                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
//                         {view === 'folders' && studioLandingTab === 'adhoc' && (
//                             <>
//                                 <button type="button" className="cdp-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} onClick={() => setShowBulkModal(true)}>
//                                     <UploadCloud size={13} /> Import Spreadsheet
//                                 </button>
//                                 <button type="button" className="cdp-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={() => { resetForm(); setView('studio'); }}>
//                                     <Plus size={13} /> Single Certificate
//                                 </button>
//                             </>
//                         )}
//                         {view === 'folders' && studioLandingTab === 'course_templates' && (
//                             <button type="button" className="cdp-btn" style={{ background: '#7c3aed', color: 'white', border: 'none' }} onClick={() => { resetForm(); setView('studio'); }}>
//                                 <Plus size={13} /> Create Course Template
//                             </button>
//                         )}
//                         {view === 'inside-folder' && activeFolder && (
//                             <>
//                                 <button type="button" className="cdp-btn cdp-btn--outline" onClick={() => setView('folders')}>
//                                     <ArrowLeft size={13} /> Back to Folders
//                                 </button>
//                                 <button
//                                     type="button"
//                                     className="cdp-btn"
//                                     style={{ background: '#16a34a', color: 'white', border: 'none' }}
//                                     onClick={() => handleExportFolderZip(activeFolder)}
//                                     title="Export all PDF certificates in this folder as a ZIP archive for printing"
//                                 >
//                                     <Archive size={13} /> Export Folder (ZIP)
//                                 </button>
//                                 <button type="button" className="cdp-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={() => { resetForm(); setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
//                                     <Plus size={13} /> Create in this Folder
//                                 </button>
//                             </>
//                         )}
//                         {view === 'studio' && (
//                             <>
//                                 <button type="button" className="cdp-btn cdp-btn--outline" onClick={() => { resetForm(); navigate('/admin?tab=studio', { replace: true, state: {} }); setView('folders'); }}>
//                                     <ArrowLeft size={13} /> Cancel Design
//                                 </button>

//                                 <button
//                                     type="button"
//                                     className="cdp-btn"
//                                     disabled={isSavingTemplate}
//                                     onClick={handleSaveAsReusableTemplate}
//                                     style={{ background: '#7c3aed', color: 'white', border: 'none' }}
//                                     title="Save this template so it can be selected when launching Cohort Runs"
//                                 >
//                                     {isSavingTemplate ? <Loader2 className="spin" size={13} /> : <Save size={13} />} {editingTemplateId ? 'Update Template' : 'Save Reusable Template'}
//                                 </button>

//                                 <button
//                                     type="button"
//                                     className="cdp-btn"
//                                     disabled={isGenerating}
//                                     onClick={() => executeGeneration('save')}
//                                     style={{ background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', color: 'white', border: 'none' }}
//                                     title="Save certificate to workspace folder and anchor to blockchain without downloading or emailing"
//                                 >
//                                     {isGenerating && actionType === 'save' ? <Loader2 className="spin" size={13} /> : <ShieldCheck size={13} />} Save & Mint to Blockchain
//                                 </button>

//                                 <button type="button" className="cdp-btn cdp-btn--outline" disabled={isGenerating} onClick={() => executeGeneration('download')}>
//                                     {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={13} /> : <Download size={13} />} Download PDF
//                                 </button>
//                                 <button type="button" className="cdp-btn" disabled={isGenerating || !certData.recipientEmail} onClick={() => executeGeneration('email')} style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }}>
//                                     {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={13} /> : <Mail size={13} />} Email Document
//                                 </button>
//                             </>
//                         )}
//                     </div>
//                 </div>
//             )}

//             {/* ── WORKSPACE AREA ── */}
//             <div style={{ flex: 1, minHeight: 0, overflow: isStudioView ? 'hidden' : 'auto', padding: isStudioView ? '0.75rem 1.5rem 1rem' : '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column' }}>

//                 {/* DUAL TAB SWITCHER ON STUDIO LANDING PAGE */}
//                 {view === 'folders' && (
//                     <div style={{ display: 'flex', borderBottom: '2px solid var(--mlab-border)', marginBottom: '1.25rem', gap: '8px', flexShrink: 0 }}>
//                         <button
//                             type="button"
//                             onClick={() => setStudioLandingTab('adhoc')}
//                             style={{
//                                 padding: '10px 18px',
//                                 background: studioLandingTab === 'adhoc' ? '#ffffff' : 'transparent',
//                                 border: 'none',
//                                 color: studioLandingTab === 'adhoc' ? 'var(--mlab-blue)' : '#64748b',
//                                 fontWeight: 800,
//                                 fontSize: '0.78rem',
//                                 fontFamily: 'var(--font-heading)',
//                                 textTransform: 'uppercase',
//                                 cursor: 'pointer',
//                                 display: 'inline-flex',
//                                 alignItems: 'center',
//                                 gap: '8px',
//                                 borderBottom: studioLandingTab === 'adhoc' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
//                                 borderRadius: '0px'
//                             }}
//                         >
//                             <Folder size={15} color={studioLandingTab === 'adhoc' ? 'var(--mlab-blue)' : '#64748b'} />
//                             Ad-Hoc &amp; Manual Workspaces
//                         </button>

//                         <button
//                             type="button"
//                             onClick={() => setStudioLandingTab('course_templates')}
//                             style={{
//                                 padding: '10px 18px',
//                                 background: studioLandingTab === 'course_templates' ? '#ffffff' : 'transparent',
//                                 border: 'none',
//                                 color: studioLandingTab === 'course_templates' ? '#7c3aed' : '#64748b',
//                                 fontWeight: 800,
//                                 fontSize: '0.78rem',
//                                 fontFamily: 'var(--font-heading)',
//                                 textTransform: 'uppercase',
//                                 cursor: 'pointer',
//                                 display: 'inline-flex',
//                                 alignItems: 'center',
//                                 gap: '8px',
//                                 borderBottom: studioLandingTab === 'course_templates' ? '3px solid #7c3aed' : '3px solid transparent',
//                                 borderRadius: '0px'
//                             }}
//                         >
//                             <BookOpen size={15} color={studioLandingTab === 'course_templates' ? '#7c3aed' : '#64748b'} />
//                             Course Assigned Templates ({courseTemplates.length})
//                         </button>
//                     </div>
//                 )}

//                 {/* ── METRICS RIBBON ── */}
//                 {view === 'folders' && studioLandingTab === 'adhoc' && !isLoadingData && (
//                     <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
//                         <div className="cdp-stat-card cdp-stat-card--blue">
//                             <div className="cdp-stat-card__icon"><Layers size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{myCertificateGroups.length + 1}</span>
//                                 <span className="cdp-stat-card__label">Total Folders</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--green">
//                             <div className="cdp-stat-card__icon"><Award size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{myAdHocCertificates.length}</span>
//                                 <span className="cdp-stat-card__label">Issued Certificates</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--amber">
//                             <div className="cdp-stat-card__icon"><Mail size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{myAdHocCertificates.filter((c: any) => c.isEmailed).length}</span>
//                                 <span className="cdp-stat-card__label">Emailed Successfully</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--grey">
//                             <div className="cdp-stat-card__icon"><FileText size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{myAdHocCertificates.filter((c: any) => !c.isEmailed).length}</span>
//                                 <span className="cdp-stat-card__label">Downloads Only</span>
//                             </div>
//                         </div>
//                     </div>
//                 )}

//                 {/* ── SEARCH TOOLBAR ── */}
//                 {(view === 'folders' || view === 'inside-folder') && studioLandingTab === 'adhoc' && !isLoadingData && (
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap', flexShrink: 0 }}>
//                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px', width: '300px' }}>
//                             <Search size={15} color="var(--mlab-grey)" />
//                             <input
//                                 type="text"
//                                 placeholder={view === 'folders' ? "Search folders..." : "Search names or courses..."}
//                                 value={view === 'folders' ? folderSearchQuery : certSearchQuery}
//                                 onChange={e => view === 'folders' ? setFolderSearchQuery(e.target.value) : setCertSearchQuery(e.target.value)}
//                                 style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
//                             />
//                             {(folderSearchQuery || certSearchQuery) && (
//                                 <button type="button" onClick={() => view === 'folders' ? setFolderSearchQuery('') : setCertSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
//                                     <X size={13} />
//                                 </button>
//                             )}
//                         </div>

//                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
//                             {view === 'folders' && (
//                                 showNewFolderInput ? (
//                                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                         <input className="wm-form-input" style={{ width: '220px', margin: 0, padding: '0.4rem 0.75rem', height: '36px' }} value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Enter folder name..." autoFocus />
//                                         <button type="button" className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.8rem' }} onClick={handleCreateFolder}>Save</button>
//                                         <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ background: 'white', padding: '0.4rem 0.8rem' }} onClick={() => setShowNewFolderInput(false)}>Cancel</button>
//                                     </div>
//                                 ) : (
//                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ background: 'white', padding: '0.5rem 1rem' }} onClick={() => setShowNewFolderInput(true)}>
//                                         <FolderPlus size={14} /> New Folder
//                                     </button>
//                                 )
//                             )}
//                         </div>
//                     </div>
//                 )}

//                 {/* ── FOLDERS GRID ── */}
//                 {view === 'folders' && studioLandingTab === 'adhoc' && (
//                     isLoadingData ? (
//                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
//                             <Loader message='Loading Workspace...' />
//                         </div>
//                     ) : (
//                         <div className="mlab-cohort-grid">
//                             {showGeneralFolder && (
//                                 <div className="mlab-cohort-card animate-fade-in">
//                                     <div className="mlab-cohort-card__header">
//                                         <h3 className="mlab-cohort-card__name">General Certificates</h3>
//                                     </div>
//                                     <div className="mlab-cohort-card__dates">
//                                         <Calendar size={14} />
//                                         <span>System Default Folder</span>
//                                     </div>
//                                     <div className="mlab-role-row-stack">
//                                         <div className="mlab-role-row">
//                                             <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
//                                             <span className="mlab-role-label">Contents:</span>
//                                             <span className="mlab-role-name">{myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general').length} Documents</span>
//                                         </div>
//                                         <div className="mlab-role-row">
//                                             <div className="mlab-role-dot mlab-role-dot--green" />
//                                             <span className="mlab-role-label">Access:</span>
//                                             <span className="mlab-role-name">System Default Workspace</span>
//                                         </div>
//                                     </div>
//                                     <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16 }}>
//                                         <button
//                                             type="button"
//                                             className="mlab-btn mlab-btn--outline-blue"
//                                             style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }}
//                                             onClick={() => handleExportFolderZip({ id: 'general', name: 'General Certificates' })}
//                                             title="Export ZIP"
//                                         >
//                                             <Archive size={13} /> Export ZIP
//                                         </button>
//                                         <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
//                                             Open Folder <ArrowRight size={13} />
//                                         </button>
//                                     </div>
//                                 </div>
//                             )}

//                             {filteredFolders.map((group: any) => {
//                                 const certCount = myAdHocCertificates.filter((c: any) => c.groupId === group.id).length;
//                                 const isShared = group.collaborators?.length > 0;
//                                 const createdDate = group.createdAt?.toDate ? new Date(group.createdAt.toDate()).toLocaleDateString('en-ZA') : 'Recently';

//                                 return (
//                                     <div key={group.id} className="mlab-cohort-card animate-fade-in" style={{ borderTopColor: 'var(--mlab-green)' }}>
//                                         <div className="mlab-cohort-card__header">
//                                             {editingFolderId === group.id ? (
//                                                 <div style={{ display: 'flex', gap: '5px', alignItems: 'center', width: '100%' }}>
//                                                     <input className="wm-form-input" style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem', width: '100%', margin: 0 }} autoFocus value={editFolderName} onChange={e => setEditFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(group.id); if (e.key === 'Escape') setEditingFolderId(null); }} />
//                                                     <button type="button" className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
//                                                 </div>
//                                             ) : (
//                                                 <>
//                                                     <h3 className="mlab-cohort-card__name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h3>
//                                                     <div className="mlab-cohort-card__actions">
//                                                         <button type="button" className="mlab-icon-btn mlab-icon-btn--blue" onClick={(e) => { e.stopPropagation(); setEditingFolderId(group.id); setEditFolderName(group.name); }} title="Rename Folder"><Edit2 size={14} /></button>
//                                                         <button type="button" className="mlab-icon-btn mlab-icon-btn--amber" onClick={(e) => triggerDeleteFolder(e, group)} title="Delete Folder"><Trash2 size={14} color="#ef4444" /></button>
//                                                     </div>
//                                                 </>
//                                             )}
//                                         </div>

//                                         {editingFolderId !== group.id && (
//                                             <>
//                                                 <div className="mlab-cohort-card__dates">
//                                                     <Calendar size={14} />
//                                                     <span>Created: {createdDate}</span>
//                                                 </div>

//                                                 <div className="mlab-role-row-stack">
//                                                     <div className="mlab-role-row">
//                                                         <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
//                                                         <span className="mlab-role-label">Contents:</span>
//                                                         <span className="mlab-role-name">{certCount} Documents</span>
//                                                     </div>
//                                                     <div className="mlab-role-row">
//                                                         <div className={`mlab-role-dot ${isShared ? 'mlab-role-dot--blue' : 'mlab-role-dot--green'}`} />
//                                                         <span className="mlab-role-label">Access:</span>
//                                                         <span className="mlab-role-name">{isShared ? `Shared (${group.collaborators.length})` : 'Private Workspace'}</span>
//                                                     </div>
//                                                 </div>

//                                                 <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16 }}>
//                                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => { e.stopPropagation(); handleExportFolderZip(group); }} title="Export ZIP Archive">
//                                                         <Archive size={13} /> ZIP
//                                                     </button>
//                                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }} onClick={(e) => { e.stopPropagation(); setShareModalConfig({ isOpen: true, targetId: group.id, targetType: 'folder', targetName: group.name, collaborators: group.collaborators || [] }); }} title="Share Folder">
//                                                         <UserPlus size={13} /> Share
//                                                     </button>
//                                                     <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setActiveFolder(group); setView('inside-folder'); }}>
//                                                         Open <ArrowRight size={13} />
//                                                     </button>
//                                                 </div>
//                                             </>
//                                         )}
//                                     </div>
//                                 );
//                             })}

//                             {filteredFolders.length === 0 && !showGeneralFolder && (
//                                 <div className="mlab-cohort-empty">
//                                     <Search size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
//                                     <p className="mlab-cohort-empty__title">No Folders Found</p>
//                                     <p className="mlab-cohort-empty__desc">Create a folder or adjust your search parameters.</p>
//                                 </div>
//                             )}
//                         </div>
//                     )
//                 )}

//                 {/* ── COURSE ASSIGNED TEMPLATES TAB ── */}
//                 {view === 'folders' && studioLandingTab === 'course_templates' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
//                             <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px', width: '320px' }}>
//                                 <Search size={15} color="var(--mlab-grey)" />
//                                 <input
//                                     type="text"
//                                     placeholder="Search course templates..."
//                                     value={templateSearchQuery}
//                                     onChange={e => setTemplateSearchQuery(e.target.value)}
//                                     style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
//                                 />
//                                 {templateSearchQuery && (
//                                     <button type="button" onClick={() => setTemplateSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
//                                         <X size={13} />
//                                     </button>
//                                 )}
//                             </div>

//                             <button
//                                 type="button"
//                                 className="mlab-btn mlab-btn--primary"
//                                 onClick={() => { resetForm(); setView('studio'); }}
//                             >
//                                 <Plus size={14} /> Create Course Template
//                             </button>
//                         </div>

//                         {filteredCourseTemplates.length === 0 ? (
//                             <div className="mlab-cohort-empty" style={{ background: 'white' }}>
//                                 <BookOpen size={44} color="#7c3aed" style={{ opacity: 0.5 }} />
//                                 <p className="mlab-cohort-empty__title">No Course Templates Configured</p>
//                                 <p className="mlab-cohort-empty__desc">Save a custom template here to make it selectable when launching Cohort Runs.</p>
//                             </div>
//                         ) : (
//                             <div className="mlab-cohort-grid">
//                                 {filteredCourseTemplates.map((tmpl: any) => {
//                                     const matchedCourse = systemCourses.find((c: any) => c.id === tmpl.courseId);
//                                     const linkedTitle = matchedCourse?.title || matchedCourse?.name || tmpl.programmeName || 'General Course Template';

//                                     return (
//                                         <div key={tmpl.id} className="mlab-cohort-card animate-fade-in" style={{ borderTop: '4px solid #7c3aed' }}>
//                                             <div className="mlab-cohort-card__header">
//                                                 <div>
//                                                     <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                                         {tmpl.templateVisual ? `${tmpl.templateVisual.toUpperCase()} TEMPLATE` : 'LUXURY TEMPLATE'}
//                                                     </span>
//                                                     <h3 className="mlab-cohort-card__name" style={{ margin: '2px 0 0 0' }}>{tmpl.title || linkedTitle}</h3>
//                                                 </div>
//                                             </div>

//                                             <div className="mlab-cohort-card__dates">
//                                                 <BookOpen size={14} color="#7c3aed" />
//                                                 <span>Linked Course: <strong>{linkedTitle}</strong></span>
//                                             </div>

//                                             <div className="mlab-role-row-stack">
//                                                 <div className="mlab-role-row">
//                                                     <div className="mlab-role-dot" style={{ background: '#7c3aed' }} />
//                                                     <span className="mlab-role-label">Award Title:</span>
//                                                     <span className="mlab-role-name">{tmpl.certType || 'Certificate of Competence'}</span>
//                                                 </div>
//                                                 <div className="mlab-role-row">
//                                                     <div className="mlab-role-dot mlab-role-dot--green" />
//                                                     <span className="mlab-role-label">Signatory:</span>
//                                                     <span className="mlab-role-name">{tmpl.signatoryName || 'Zakhele Tinga'} ({tmpl.signatoryTitle || 'Academic Manager'})</span>
//                                                 </div>
//                                             </div>

//                                             <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16, paddingTop: '12px', borderTop: '1px solid var(--mlab-border)' }}>
//                                                 <button
//                                                     type="button"
//                                                     className="mlab-btn mlab-btn--outline-blue"
//                                                     style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem' }}
//                                                     onClick={() => handleEditTemplate(tmpl)}
//                                                 >
//                                                     <Edit3 size={13} /> Edit Design
//                                                 </button>

//                                                 <button
//                                                     type="button"
//                                                     className="mlab-icon-btn mlab-icon-btn--amber"
//                                                     onClick={() => handleDeleteTemplate(tmpl.id, tmpl.title || linkedTitle)}
//                                                     title="Delete Template"
//                                                 >
//                                                     <Trash2 size={13} color="#ef4444" />
//                                                 </button>
//                                             </div>
//                                         </div>
//                                     );
//                                 })}
//                             </div>
//                         )}
//                     </div>
//                 )}

//                 {/* ── CERTIFICATES GRID (INSIDE FOLDER) ── */}
//                 {view === 'inside-folder' && activeFolder && (
//                     <>
//                         {getCertificatesForActiveFolder().length === 0 ? (
//                             <div className="mlab-cohort-empty" style={{ background: 'white' }}>
//                                 {certSearchQuery ? <Search size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} /> : <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />}
//                                 <p className="mlab-cohort-empty__title">{certSearchQuery ? 'No Results Found' : 'Folder is Empty'}</p>
//                                 <p className="mlab-cohort-empty__desc">{certSearchQuery ? `No certificates match "${certSearchQuery}".` : 'No certificates have been saved to this folder yet.'}</p>
//                             </div>
//                         ) : (
//                             <div className="mlab-cohort-grid">
//                                 {getCertificatesForActiveFolder().map((cert: any) => {
//                                     const certVerifyUrl = cert.verifyUrl || `${getBaseUrl()}/verify/${cert.verificationCode}`;

//                                     return (
//                                         <div key={cert.id} className="mlab-cohort-card animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
//                                             <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
//                                                 <Award size={48} color="rgba(255,255,255,0.1)" />
//                                                 <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
//                                                     {cert.blockchainStatus === 'anchored' && (
//                                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#10b981', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={`Tx: ${cert.blockchainTxHash || 'On-chain'}`}>
//                                                             <ShieldCheck size={10} /> Anchored
//                                                         </span>
//                                                     )}
//                                                     {cert.emailStatus === 'failed' && (
//                                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#ef4444', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={cert.emailError || "Email delivery failed"}>
//                                                             <AlertCircle size={10} /> Send Failed
//                                                         </span>
//                                                     )}
//                                                     {cert.isEmailed && (
//                                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: 'var(--mlab-green)', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={`Emailed to ${cert.recipientEmail}`}>
//                                                             <Mail size={10} /> Sent
//                                                         </span>
//                                                     )}
//                                                     <span style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>PDF</span>
//                                                 </div>
//                                             </div>
//                                             <div style={{ padding: '1.25rem' }}>
//                                                 <div className="mlab-cohort-card__header">
//                                                     <h3 className="mlab-cohort-card__name">{cert.recipientName}</h3>
//                                                 </div>
//                                                 <div className="mlab-cohort-card__dates" style={{ marginBottom: '10px' }}>
//                                                     <Award size={14} />
//                                                     <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cert.courseName}</span>
//                                                 </div>

//                                                 <div className="mlab-role-row-stack">
//                                                     <div className="mlab-role-row">
//                                                         <div className="mlab-role-dot mlab-role-dot--green" />
//                                                         <span className="mlab-role-label">Type:</span>
//                                                         <span className="mlab-role-name">{cert.type}</span>
//                                                     </div>
//                                                     <div className="mlab-role-row">
//                                                         <div className="mlab-role-dot mlab-role-dot--blue" />
//                                                         <span className="mlab-role-label">Issued:</span>
//                                                         <span className="mlab-role-name">{cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString() : cert.issueDate}</span>
//                                                     </div>
//                                                 </div>

//                                                 <div style={{ display: 'flex', width: '100%', flexDirection: 'column', gap: '8px', marginTop: 16 }}>
//                                                     <div style={{ display: 'flex', gap: '8px' }}>
//                                                         <button
//                                                             type="button"
//                                                             className="mlab-btn mlab-btn--outline-blue"
//                                                             style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }}
//                                                             onClick={() => setShareModalConfig({
//                                                                 isOpen: true,
//                                                                 targetId: cert.id,
//                                                                 targetType: 'certificate',
//                                                                 targetName: cert.recipientName,
//                                                                 collaborators: cert.collaborators || [],
//                                                                 verifyUrl: certVerifyUrl
//                                                             })}
//                                                         >
//                                                             <UserPlus size={13} /> Share
//                                                         </button>
//                                                         <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.open(cert.pdfUrl, '_blank')}>
//                                                             View / Print <ArrowRight size={13} />
//                                                         </button>
//                                                     </div>

//                                                     {/* ON-DEMAND BLOCKCHAIN MINT BUTTON FOR EXISTING CERTS */}
//                                                     {cert.blockchainStatus !== 'anchored' ? (
//                                                         <button
//                                                             type="button"
//                                                             className="mlab-btn mlab-btn--primary"
//                                                             style={{ width: '100%', padding: '0.45rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)' }}
//                                                             disabled={mintingCertId === cert.id}
//                                                             onClick={() => handleMintExistingCertificate(cert)}
//                                                         >
//                                                             {mintingCertId === cert.id ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={13} />}
//                                                             {mintingCertId === cert.id ? "Anchoring to Blockchain..." : "Issue to Blockchain"}
//                                                         </button>
//                                                     ) : (
//                                                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.4rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>
//                                                             <ShieldCheck size={13} color="#16a34a" /> Secured on Blockchain
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     );
//                                 })}
//                             </div>
//                         )}
//                     </>
//                 )}

//                 {/* ── STUDIO & BULK REVIEW VIEWS ── */}
//                 {isStudioView && (
//                     <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, overflow: 'hidden', flexDirection: 'column' }}>

//                         {/* Bulk Controls Header */}
//                         {view === 'bulk-review' && (
//                             <div style={{ display: 'flex', alignItems: 'center', background: 'white', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', gap: '1rem', flexShrink: 0, flexWrap: 'wrap' }}>
//                                 <button type="button" className="cdp-btn cdp-btn--outline" style={{ color: 'var(--mlab-red)', borderColor: 'var(--mlab-red)' }} onClick={() => { setBulkData([]); setView('folders'); }}>
//                                     <X size={13} /> Cancel Bulk Operation
//                                 </button>

//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 auto', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
//                                     <button
//                                         type="button"
//                                         className="mlab-icon-btn"
//                                         disabled={bulkCurrentIndex === 0}
//                                         onClick={() => setBulkCurrentIndex(p => Math.max(0, p - 1))}
//                                         style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
//                                     >
//                                         <ChevronLeft color='var(--mlab-midnight)' size={18} />
//                                     </button>
//                                     <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-midnight)', minWidth: '150px', textAlign: 'center' }}>
//                                         Preview {bulkCurrentIndex + 1} of {bulkData.length}
//                                     </span>
//                                     <button
//                                         type="button"
//                                         className="mlab-icon-btn"
//                                         disabled={bulkCurrentIndex === bulkData.length - 1}
//                                         onClick={() => setBulkCurrentIndex(p => Math.min(bulkData.length - 1, p + 1))}
//                                         style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
//                                     >
//                                         <ChevronRight color='var(--mlab-midnight)' size={18} />
//                                     </button>
//                                 </div>

//                                 <button type="button" className="cdp-btn" onClick={executeFinalBulkProcessing} style={bulkSettings?.mintToBlockchain ? { background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', color: 'white', border: 'none' } : { background: 'var(--mlab-blue)', color: 'white', border: 'none' }}>
//                                     {bulkSettings?.mintToBlockchain ? <ShieldCheck size={13} /> : <Send size={13} />}
//                                     {bulkSettings?.mintToBlockchain ? `Save & Mint All (${bulkData.length})` : `Approve & Process All (${bulkData.length})`}
//                                 </button>
//                             </div>
//                         )}

//                         {/* Two-pane editor: [ scrolling controls | fixed playground ] */}
//                         <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>

//                             {/* 🚀 LEFT PANEL: the ONLY thing that scrolls */}
//                             <aside style={{ width: '360px', flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
//                                 <div style={{ flexShrink: 0, padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--mlab-border)', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
//                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-midnight)' }}>
//                                         {view === 'bulk-review' ? `Editing ${bulkCurrentIndex + 1} of ${bulkData.length}` : editingTemplateId ? 'Edit Template' : 'Design Settings'}
//                                     </span>
//                                     <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Live preview →</span>
//                                 </div>

//                                 <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
//                                     {view === 'bulk-review' && (
//                                         <div style={{ background: applyBulkEditsToAll ? '#eff6ff' : '#f8fafc', padding: '12px', borderRadius: '8px', border: `1px solid ${applyBulkEditsToAll ? '#bfdbfe' : '#e2e8f0'}`, transition: 'all 0.2s' }}>
//                                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--mlab-blue)', fontSize: '0.85rem', margin: 0 }}>
//                                                 <input
//                                                     type="checkbox"
//                                                     checked={applyBulkEditsToAll}
//                                                     onChange={e => setApplyBulkEditsToAll(e.target.checked)}
//                                                     style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
//                                                 />
//                                                 Apply edits to ALL certificates
//                                             </label>
//                                             <p style={{ margin: '6px 0 0 24px', fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: 1.4 }}>
//                                                 When checked, changing the template, course, or signature will instantly update all <strong>{bulkData.length}</strong> certificates.
//                                             </p>
//                                         </div>
//                                     )}

//                                     <FormSection title="Design Template" icon={Layers}>
//                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.template} onChange={e => handleChange('template', e.target.value)}><option value="luxury">Luxury (Default)</option><option value="official">Official Statement (SoR)</option><option value="modern">Modern Minimalist</option></select>
//                                     </FormSection>

//                                     <FormSection title="Course & Content Linkage" icon={BookOpen}>
//                                         <select
//                                             className="wm-form-input"
//                                             style={{ margin: 0 }}
//                                             value={certData.courseId}
//                                             onChange={e => {
//                                                 const selectedId = e.target.value;
//                                                 const matchedCourse = systemCourses.find((c: any) => c.id === selectedId);
//                                                 const nextProgramme = matchedCourse?.title || matchedCourse?.name || certData.programme;
//                                                 handleChange('courseId', selectedId);
//                                                 handleChange('programme', nextProgramme);
//                                             }}
//                                         >
//                                             <option value="">-- Custom / Ad-Hoc (No Course Link) --</option>
//                                             {(systemCourses || []).map((course: any) => (
//                                                 <option key={course.id} value={course.id}>{course.title || course.name}</option>
//                                             ))}
//                                         </select>
//                                     </FormSection>

//                                     <FormSection title="Folder Assignment" icon={Folder}>
//                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}><option value="general">General (No Folder)</option>{(myCertificateGroups || []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}</select>
//                                     </FormSection>

//                                     <FormSection title="Recipient Details" icon={UserCircle}>
//                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
//                                         <input className="wm-form-input" style={{ margin: 0 }} type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
//                                     </FormSection>

//                                     <FormSection title="Award Details" icon={FileCheck}>
//                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}><option value="Achievement">Certificate of Achievement</option><option value="Attendance">Certificate of Attendance</option><option value="Appreciation">Certificate of Appreciation</option><option value="Excellence">Award of Excellence</option><option value="Other">Custom Title...</option></select>
//                                         {certData.certType === 'Other' && <input className="wm-form-input" style={{ margin: 0 }} placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />}
//                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
//                                         <textarea className="wm-form-input" style={{ margin: 0, minHeight: '60px' }} placeholder="Description..." value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
//                                     </FormSection>

//                                     <FormSection title="Branding & Verification" icon={Building2}>
//                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
//                                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
//                                             <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
//                                             <input className="wm-form-input" style={{ margin: 0 }} type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
//                                         </div>
//                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />

//                                         {/* QR CODE TOGGLE CHECKBOX */}
//                                         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', marginTop: '0.5rem', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
//                                             <input
//                                                 type="checkbox"
//                                                 checked={certData.showQrCode !== false}
//                                                 onChange={e => handleChange('showQrCode', e.target.checked)}
//                                                 style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
//                                             />
//                                             <QrCode size={16} color="var(--mlab-blue)" /> Include Verification QR Code
//                                         </label>

//                                         <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
//                                             <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}><ImageIcon size={14} /> Change Logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} /></label>
//                                             <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}><ImageIcon size={14} /> Change Signature<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} /></label>
//                                         </div>
//                                     </FormSection>
//                                 </div>
//                             </aside>

//                             {/* 🚀 RIGHT: FIXED PLAYGROUND — never scrolls, always fits the free space, certificate centred */}
//                             <div
//                                 ref={previewContainerRef}
//                                 onMouseDown={handleCanvasMouseDown}
//                                 onMouseMove={handleCanvasMouseMove}
//                                 onMouseUp={handleCanvasMouseUp}
//                                 onMouseLeave={handleCanvasMouseUp}
//                                 style={{
//                                     flex: 1,
//                                     minHeight: 0,
//                                     minWidth: 0,
//                                     position: 'relative',
//                                     borderRadius: '8px',
//                                     border: '1px solid var(--mlab-border)',
//                                     overflow: 'hidden',
//                                     cursor: isPanning ? 'grabbing' : 'grab',
//                                     userSelect: 'none',
//                                     overscrollBehavior: 'contain',
//                                     touchAction: 'none',
//                                     ...canvasBackdrop
//                                 }}
//                             >
//                                 {/* Floating zoom bar (bottom centre, Canva-style) */}
//                                 <div
//                                     onMouseDown={stopCanvasEvent}
//                                     onMouseMove={stopCanvasEvent}
//                                     style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.96)', padding: '0.35rem 0.5rem', borderRadius: '999px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.35)', zIndex: 100, backdropFilter: 'blur(4px)', cursor: 'default' }}
//                                 >
//                                     <button type="button" className="mlab-icon-btn" onClick={handleZoomOut} disabled={isBulkGenerating} title="Zoom out (Ctrl + scroll down)"><ZoomOut size={15} color='var(--mlab-blue)' /></button>
//                                     <span style={{ minWidth: '48px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
//                                     <button type="button" className="mlab-icon-btn" onClick={handleZoomIn} disabled={isBulkGenerating} title="Zoom in (Ctrl + scroll up)"><ZoomIn size={15} color='var(--mlab-blue)' /></button>
//                                     <span style={{ width: '1px', height: '18px', background: '#e2e8f0', margin: '0 4px' }} />
//                                     <button type="button" className="mlab-icon-btn mlab-icon-btn--blue" onClick={handleFitToScreen} disabled={isBulkGenerating} title="Fit to screen"><Maximize2 size={15} /></button>
//                                     <button type="button" className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetViewport} disabled={isBulkGenerating} title="Actual size (100%)"><RotateCcw size={15} /></button>
//                                 </div>

//                                 {/* Gesture hint */}
//                                 <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.75)', color: '#cbd5e1', padding: '6px 12px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, backdropFilter: 'blur(4px)', zIndex: 100, pointerEvents: 'none' }}>
//                                     <Move size={12} color="#38bdf8" /> Drag or scroll to pan · Ctrl + scroll to zoom
//                                 </div>

//                                 {view === 'bulk-review' && certData.recipientEmail && bulkSendEmails && (
//                                     <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #bbf7d0', zIndex: 100, pointerEvents: 'none' }}>
//                                         <Mail size={14} /> Will be emailed to: {certData.recipientEmail}
//                                     </div>
//                                 )}

//                                 <div
//                                     data-cert-canvas="true"
//                                     className="cert-canvas"
//                                     ref={certRef}
//                                     style={{
//                                         position: 'absolute',
//                                         left: '50%',
//                                         top: '50%',
//                                         width: `${CERT_WIDTH}px`,
//                                         height: `${CERT_HEIGHT}px`,
//                                         marginLeft: `${-CERT_WIDTH / 2}px`,
//                                         marginTop: `${-CERT_HEIGHT / 2}px`,
//                                         flex: 'none',
//                                         transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
//                                         transformOrigin: 'center center',
//                                         transition: isPanning ? 'none' : 'transform 0.12s ease-out',
//                                         boxShadow: '0 25px 50px -12px rgba(0,0,0,0.55)',
//                                         backgroundColor: '#fff',
//                                         overflow: 'hidden',
//                                         willChange: 'transform'
//                                     }}
//                                 >
//                                     {certData.template === 'luxury' && <LuxuryTemplate data={certData} finalType={finalCertType} />}
//                                     {certData.template === 'official' && <OfficialTemplate data={certData} finalType={finalCertType} />}
//                                     {certData.template === 'modern' && <ModernTemplate data={certData} finalType={finalCertType} />}
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };


// // // src/pages/AdminDashboard/CertificateStudio/CertificateStudio.tsx

// // import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
// // import { createPortal } from 'react-dom';
// // import { useLocation, useNavigate } from 'react-router-dom';
// // import {
// //     Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
// //     Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
// //     FileText, X, Folder, FolderPlus, Edit2, Layers,
// //     UploadCloud, CheckCircle, UserPlus, Search, Trash2,
// //     ChevronLeft, ChevronRight, Send, Calendar, ArrowRight, AlertCircle, Save, BookOpen, Edit3, Archive, ShieldCheck, QrCode, Maximize2, Move, Copy, Check
// // } from 'lucide-react';
// // import { collection, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, doc, arrayUnion, getDocs } from 'firebase/firestore';
// // import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import html2canvas from 'html2canvas';
// // import jsPDF from 'jspdf';
// // import * as XLSX from 'xlsx';
// // import JSZip from 'jszip';
// // import { useStore } from '../../../store/useStore';
// // import { useToast } from '../../../components/common/Toast/Toast';
// // import { db } from '../../../lib/firebase';
// // import { StatusModal } from '../../../components/common/StatusModal/StatusModal';

// // // ── Import separated templates ───────────────────────────────────────────────
// // import { LuxuryTemplate, OfficialTemplate, ModernTemplate } from './CertificateTemplates';

// // // ── CSS imports ──────────────────────────────────────────────────────────────
// // import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
// // import '../../../components/views/LearnersView/LearnersView.css';
// // import '../../CohortDetails/CohortDetailsPage.css';
// // import '../AdminDashboard.css';
// // import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
// // import '../../../components/views/CohortsView/CohortsView.css';

// // import mLabLogo from '../../../assets/logo/mlab_logo.png';
// // import defaultSignature from '../../../assets/Signatue_Zack_.png';
// // import Loader from '../../../components/common/Loader/Loader';

// // // 🚀 PRIMARY PRODUCTION DOMAIN CONSTANT
// // const PRIMARY_PRODUCTION_DOMAIN = 'https://mlabassessmentcenter.web.app';

// // // ── CERTIFICATE CANVAS CONSTANTS (A4 landscape @ 96dpi) ─────────────────────
// // const CERT_WIDTH = 1123;
// // const CERT_HEIGHT = 794;
// // const MIN_ZOOM = 0.1;
// // const MAX_ZOOM = 3;
// // const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// // // 🚀 HELPER: DYNAMIC BASE URL RESOLVER WITH DOMAIN SANITIZER
// // const getBaseUrl = (): string => {
// //     let url = import.meta.env.VITE_APP_URL || '';

// //     if (!url && typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
// //         url = window.location.origin;
// //     }

// //     if (!url || url.includes('localhost') || url.includes('127.0.0.1')) {
// //         url = PRIMARY_PRODUCTION_DOMAIN;
// //     }

// //     // Auto-correct spelling typos or domain misalignments (e.g., assessmentcentr -> mlabassessmentcenter)
// //     if (url.includes('assessmentcentr')) {
// //         url = url.replace('assessmentcentr', 'mlabassessmentcenter');
// //     }

// //     return url.replace(/\/$/, "");
// // };

// // // 🚀 HELPER: CAPTURE THE CERTIFICATE AT TRUE 100% SIZE, INDEPENDENT OF ZOOM / PAN / CLIPPING
// // // The clone is pulled out of the clipped, transformed playground (position: fixed, no transform)
// // // so what you see on screen never affects the exported PDF.
// // const captureCertificateCanvas = (el: HTMLElement) =>
// //     html2canvas(el, {
// //         scale: 2,
// //         useCORS: true,
// //         logging: false,
// //         backgroundColor: '#ffffff',
// //         width: CERT_WIDTH,
// //         height: CERT_HEIGHT,
// //         windowWidth: CERT_WIDTH,
// //         windowHeight: CERT_HEIGHT,
// //         scrollX: 0,
// //         scrollY: 0,
// //         onclone: (clonedDoc: Document) => {
// //             const cloned = clonedDoc.querySelector('[data-cert-canvas="true"]') as HTMLElement | null;
// //             if (cloned) {
// //                 cloned.style.position = 'fixed';
// //                 cloned.style.left = '0px';
// //                 cloned.style.top = '0px';
// //                 cloned.style.margin = '0px';
// //                 cloned.style.transform = 'none';
// //                 cloned.style.transition = 'none';
// //                 cloned.style.width = `${CERT_WIDTH}px`;
// //                 cloned.style.height = `${CERT_HEIGHT}px`;
// //             }
// //         }
// //     });

// // const blobToDataUrl = (blob: Blob) =>
// //     new Promise<string>((resolve) => {
// //         const reader = new FileReader();
// //         reader.readAsDataURL(blob);
// //         reader.onloadend = () => resolve(reader.result as string);
// //     });

// // // ── Helper: FormSection ──────────────────────────────────────────────────────
// // const FormSection = ({ title, icon: Icon, children }: any) => (
// //     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1.5rem', borderBottom: '1px dashed #e2e8f0' }}>
// //         <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //             <Icon size={16} /> {title}
// //         </h3>
// //         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// //             {children}
// //         </div>
// //     </div>
// // );

// // // ── SHARE MODAL ──────────────────────────────────────────────────────────────
// // const ShareModal: React.FC<{
// //     isOpen: boolean;
// //     onClose: () => void;
// //     targetId: string;
// //     targetType: 'folder' | 'certificate';
// //     targetName: string;
// //     initialCollaborators: string[];
// //     verifyUrl?: string;
// //     onSave: (id: string, type: 'folder' | 'certificate', collabs: string[]) => Promise<void>;
// // }> = ({ isOpen, onClose, targetId, targetType, targetName, initialCollaborators, verifyUrl, onSave }) => {
// //     const { staff = [] } = useStore() as any;
// //     const [emails, setEmails] = useState<string[]>(initialCollaborators || []);
// //     const [inputValue, setInputValue] = useState('');
// //     const [isSaving, setIsSaving] = useState(false);
// //     const [copied, setCopied] = useState(false);

// //     const handleAdd = () => {
// //         const cleanEmail = inputValue.trim().toLowerCase();
// //         if (cleanEmail && !emails.includes(cleanEmail)) {
// //             setEmails([...emails, cleanEmail]);
// //             setInputValue('');
// //         }
// //     };

// //     const handleRemove = (email: string) => {
// //         setEmails(emails.filter((e: string) => e !== email));
// //     };

// //     const handleSave = async () => {
// //         setIsSaving(true);
// //         await onSave(targetId, targetType, emails);
// //         setIsSaving(false);
// //         onClose();
// //     };

// //     const handleCopyLink = async () => {
// //         if (!verifyUrl) return;
// //         try {
// //             await navigator.clipboard.writeText(verifyUrl);
// //             setCopied(true);
// //             setTimeout(() => setCopied(false), 2500);
// //         } catch (err) {
// //             console.error("Copy error:", err);
// //         }
// //     };

// //     if (!isOpen) return null;

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
// //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><UserPlus size={20} /></div>
// //                     <div>
// //                         <h2 className="wm-modal__title">Share {targetType === 'folder' ? 'Folder' : 'Certificate'}</h2>
// //                         <p className="wm-modal__subtitle">Manage access for "{targetName}"</p>
// //                     </div>
// //                     <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// //                 </div>
// //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

// //                     {/* COPY VERIFICATION LINK SECTION */}
// //                     {verifyUrl && targetType === 'certificate' && (
// //                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                             <label className="wm-form-label" style={{ color: '#166534', margin: 0, fontWeight: 700 }}>Public Verification URL</label>
// //                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// //                                 <input
// //                                     type="text"
// //                                     readOnly
// //                                     value={verifyUrl}
// //                                     className="wm-form-input"
// //                                     style={{ margin: 0, flex: 1, background: '#ffffff', fontSize: '0.8rem', color: '#1e293b' }}
// //                                 />
// //                                 <button
// //                                     type="button"
// //                                     className={`mlab-btn ${copied ? 'mlab-btn--green' : 'mlab-btn--outline-blue'}`}
// //                                     onClick={handleCopyLink}
// //                                     style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: '100px', justifyContent: 'center' }}
// //                                 >
// //                                     {copied ? (
// //                                         <>
// //                                             <Check size={14} className="animate-scale-in" /> Copied!
// //                                         </>
// //                                     ) : (
// //                                         <>
// //                                             <Copy size={14} /> Copy Link
// //                                         </>
// //                                     )}
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     )}

// //                     <div>
// //                         <label className="wm-form-label">Add Collaborator (Email)</label>
// //                         <div style={{ display: 'flex', gap: '8px' }}>
// //                             <input
// //                                 type="email"
// //                                 className="wm-form-input"
// //                                 style={{ margin: 0, flex: 1 }}
// //                                 placeholder="Search staff name or email..."
// //                                 value={inputValue}
// //                                 onChange={e => setInputValue(e.target.value)}
// //                                 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
// //                                 list="staff-emails"
// //                             />
// //                             <datalist id="staff-emails">
// //                                 {staff.map((s: any) => s.email && (
// //                                     <option key={s.id || s.email} value={s.email}>
// //                                         {s.fullName} ({s.role})
// //                                     </option>
// //                                 ))}
// //                             </datalist>
// //                             <button type="button" className="mlab-btn mlab-btn--outline-blue" onClick={handleAdd}>Add</button>
// //                         </div>
// //                     </div>

// //                     <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
// //                         <label className="wm-form-label">Current Collaborators ({emails.length})</label>
// //                         {emails.length === 0 ? (
// //                             <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontStyle: 'italic', margin: '0.5rem 0' }}>No external collaborators added. Only you can view this.</p>
// //                         ) : (
// //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
// //                                 {emails.map((email: string) => (
// //                                     <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
// //                                         <span style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{email}</span>
// //                                         <button type="button" className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', padding: 0 }} onClick={() => handleRemove(email)}>
// //                                             <Trash2 size={14} color="#ef4444" />
// //                                         </button>
// //                                     </div>
// //                                 ))}
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>
// //                 <div className="wm-modal__footer">
// //                     <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button>
// //                     <button type="button" className="mlab-btn mlab-btn--primary" onClick={handleSave} disabled={isSaving}>
// //                         {isSaving ? <Loader2 size={14} className="spin" /> : 'Save Access Control'}
// //                     </button>
// //                 </div>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // // ── BULK GENERATOR MODAL ────────────────────────────────────────────────────
// // const BulkGeneratorModal: React.FC<{
// //     certificateGroups: any[],
// //     courses: any[],
// //     onClose: () => void,
// //     onStart: (rows: any[], settings: any, sendEmails: boolean) => void,
// //     onCreateFolder: (name: string) => Promise<string | null>
// // }> = ({ certificateGroups = [], courses = [], onClose, onStart, onCreateFolder }) => {

// //     const [parsedData, setParsedData] = useState<any[]>([]);
// //     const [fileError, setFileError] = useState('');
// //     const [sendEmails, setSendEmails] = useState(false);

// //     const [isCreatingFolder, setIsCreatingFolder] = useState(false);
// //     const [isSavingFolder, setIsSavingFolder] = useState(false);
// //     const [newFolderName, setNewFolderName] = useState('');

// //     const [settings, setSettings] = useState({
// //         template: 'luxury',
// //         groupId: 'general',
// //         courseId: '',
// //         certType: 'Achievement',
// //         programme: '',
// //         description: 'has demonstrated exceptional skills and outstanding performance in',
// //         issueDate: new Date().toISOString().split('T')[0],
// //         showQrCode: true
// //     });

// //     const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;

// //         const reader = new FileReader();
// //         reader.onload = (evt) => {
// //             try {
// //                 const bstr = evt.target?.result;
// //                 const wb = XLSX.read(bstr, { type: 'binary' });
// //                 const wsname = wb.SheetNames[0];
// //                 const ws = wb.Sheets[wsname];
// //                 const data = XLSX.utils.sheet_to_json(ws);

// //                 if (data.length === 0) {
// //                     setFileError("The uploaded spreadsheet is empty.");
// //                     return;
// //                 }

// //                 const sample = data[0] as any;
// //                 const hasName = ('Name' in sample) || ('name' in sample) || ('Full Name' in sample) || ('Recipient' in sample);

// //                 if (!hasName) {
// //                     setFileError("Spreadsheet missing a recognizable 'Name' column. Please use a column header like 'Name' or 'Full Name'.");
// //                     return;
// //                 }

// //                 setFileError('');
// //                 setParsedData(data);

// //             } catch (err) {
// //                 setFileError("Failed to parse the file. Ensure it is a valid .csv or .xlsx.");
// //             }
// //         };
// //         reader.readAsBinaryString(file);
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// //                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Layers size={20} /></div>
// //                     <div>
// //                         <h2 className="wm-modal__title">Bulk Generate Certificates</h2>
// //                         <p className="wm-modal__subtitle">Upload a spreadsheet to automate design, blockchain anchoring, and distribution.</p>
// //                     </div>
// //                     <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// //                 </div>

// //                 <div className="wm-modal__body">
// //                     {parsedData.length === 0 ? (
// //                         <div style={{ border: '2px dashed #cbd5e1', padding: '3rem 2rem', textAlign: 'center', borderRadius: '8px', background: '#f8fafc' }}>
// //                             <UploadCloud size={48} color="#94a3b8" style={{ margin: '0 auto 1rem' }} />
// //                             <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1rem' }}>Upload Document Template</h3>
// //                             <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.85rem' }}>Must contain a "Name" column. Optionally include "Email" or "Course". (.csv or .xlsx)</p>
// //                             <label className="mlab-btn mlab-btn--primary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
// //                                 Browse Files
// //                                 <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} />
// //                             </label>
// //                             {fileError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '1rem', fontWeight: 500 }}>{fileError}</p>}
// //                         </div>
// //                     ) : (
// //                         <div className="wm-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
// //                                 <CheckCircle size={24} color="#16a34a" />
// //                                 <div>
// //                                     <h4 style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>Spreadsheet Verified!</h4>
// //                                     <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '0.75rem' }}>Successfully extracted <strong>{parsedData.length} records.</strong></p>
// //                                 </div>
// //                                 <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ marginLeft: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setParsedData([])}>Change File</button>
// //                             </div>

// //                             <div className="wm-form-section">
// //                                 <div className="wm-form-section__label"><Layers size={12} /> Default Certificate Settings</div>
// //                                 <div className="wm-form-grid">
// //                                     <div className="wm-form-group wm-form-group--full">
// //                                         <label className="wm-form-label">Visual Template</label>
// //                                         <select className="wm-form-input" value={settings.template} onChange={e => setSettings(s => ({ ...s, template: e.target.value }))}>
// //                                             <option value="luxury">Luxury Classic</option>
// //                                             <option value="official">Official Statement (SoR)</option>
// //                                             <option value="modern">Modern Minimalist</option>
// //                                         </select>
// //                                     </div>

// //                                     <div className="wm-form-group wm-form-group--full">
// //                                         <label className="wm-form-label">Save To Folder</label>
// //                                         {isCreatingFolder ? (
// //                                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// //                                                 <input
// //                                                     className="wm-form-input"
// //                                                     autoFocus
// //                                                     placeholder="New folder name..."
// //                                                     value={newFolderName}
// //                                                     onChange={e => setNewFolderName(e.target.value)}
// //                                                     disabled={isSavingFolder}
// //                                                 />
// //                                                 <button type="button" className="mlab-btn mlab-btn--primary" style={{ padding: '0.4rem 0.6rem' }} disabled={isSavingFolder} onClick={async () => {
// //                                                     if (!newFolderName.trim()) return;
// //                                                     setIsSavingFolder(true);
// //                                                     const newId = await onCreateFolder(newFolderName.trim());
// //                                                     if (newId) {
// //                                                         setSettings(s => ({ ...s, groupId: newId }));
// //                                                         setIsCreatingFolder(false);
// //                                                         setNewFolderName('');
// //                                                     }
// //                                                     setIsSavingFolder(false);
// //                                                 }}>
// //                                                     {isSavingFolder ? <Loader2 size={14} className="spin" /> : 'Save'}
// //                                                 </button>
// //                                                 <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.6rem' }} disabled={isSavingFolder} onClick={() => setIsCreatingFolder(false)}>Cancel</button>
// //                                             </div>
// //                                         ) : (
// //                                             <select className="wm-form-input" value={settings.groupId} onChange={e => {
// //                                                 if (e.target.value === 'create_new') {
// //                                                     setIsCreatingFolder(true);
// //                                                 } else {
// //                                                     setSettings(s => ({ ...s, groupId: e.target.value }));
// //                                                 }
// //                                             }}>
// //                                                 <option value="general">General (No Folder)</option>
// //                                                 {(certificateGroups || []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
// //                                                 <option value="create_new" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>➕ Create New Folder...</option>
// //                                             </select>
// //                                         )}
// //                                     </div>

// //                                     <div className="wm-form-group wm-form-group--full">
// //                                         <label className="wm-form-label">Link System Course / Qualification</label>
// //                                         <select
// //                                             className="wm-form-input"
// //                                             value={settings.courseId}
// //                                             onChange={e => {
// //                                                 const cid = e.target.value;
// //                                                 const matchedCourse = courses.find((c: any) => c.id === cid);
// //                                                 setSettings(s => ({
// //                                                     ...s,
// //                                                     courseId: cid,
// //                                                     programme: matchedCourse?.title || matchedCourse?.name || s.programme
// //                                                 }));
// //                                             }}
// //                                         >
// //                                             <option value="">-- Custom / Unlinked --</option>
// //                                             {(courses || []).map((c: any) => (
// //                                                 <option key={c.id} value={c.id}>{c.title || c.name}</option>
// //                                             ))}
// //                                         </select>
// //                                     </div>

// //                                     <div className="wm-form-group wm-form-group--full">
// //                                         <label className="wm-form-label">Award Title</label>
// //                                         <select className="wm-form-input" value={settings.certType} onChange={e => setSettings(s => ({ ...s, certType: e.target.value }))}>
// //                                             <option value="Achievement">Certificate of Achievement</option>
// //                                             <option value="Attendance">Certificate of Attendance</option>
// //                                             <option value="Excellence">Award of Excellence</option>
// //                                             <option value="Participation">Certificate of Participation</option>
// //                                         </select>
// //                                     </div>
// //                                     <div className="wm-form-group wm-form-group--full">
// //                                         <label className="wm-form-label">Default Course/Programme Name</label>
// //                                         <input className="wm-form-input" placeholder="e.g. Advanced AI Bootcamp" value={settings.programme} onChange={e => setSettings(s => ({ ...s, programme: e.target.value }))} />
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// //                                     <input type="checkbox" checked={settings.showQrCode} onChange={e => setSettings(s => ({ ...s, showQrCode: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
// //                                     Include Verification QR Code on all certificates
// //                                 </label>

// //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// //                                     <input type="checkbox" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
// //                                     Automatically email to recipients
// //                                     <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>(Requires 'Email' column in spreadsheet)</span>
// //                                 </label>
// //                             </div>
// //                         </div>
// //                     )}
// //                 </div>
// //                 <div className="wm-modal__footer">
// //                     <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button>
// //                     <button
// //                         type="button"
// //                         className="mlab-btn mlab-btn--primary"
// //                         disabled={parsedData.length === 0 || isCreatingFolder}
// //                         onClick={() => onStart(parsedData, settings, sendEmails)}
// //                     >
// //                         {isCreatingFolder ? "Save Folder First..." : `Stage & Review (${parsedData.length})`}
// //                     </button>
// //                 </div>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // // ── MAIN CERTIFICATE STUDIO COMPONENT ──────────────────────────────────────
// // export const CertificateStudio: React.FC = () => {
// //     const location = useLocation();
// //     const navigate = useNavigate();

// //     const {
// //         settings, user, adHocCertificates = [], certificateGroups = [],
// //         fetchAdHocCertificates, fetchCertificateGroups, createCertificateGroup,
// //         renameCertificateGroup, fetchSettings, cohorts = []
// //     } = useStore() as any;

// //     const toast = useToast();

// //     // Intercept target learner passed in route state
// //     const targetLearner = location.state?.learner;

// //     // DUAL LANDING TAB STATE
// //     const [studioLandingTab, setStudioLandingTab] = useState<'adhoc' | 'course_templates'>('adhoc');

// //     // ─── VIEW & LAYOUT STATE ───
// //     const [view, setView] = useState<'folders' | 'inside-folder' | 'studio' | 'bulk-review'>('folders');
// //     const [activeFolder, setActiveFolder] = useState<any>(null);
// //     const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

// //     const [showNewFolderInput, setShowNewFolderInput] = useState(false);
// //     const [newFolderName, setNewFolderName] = useState('');
// //     const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
// //     const [editFolderName, setEditFolderName] = useState('');

// //     const [folderSearchQuery, setFolderSearchQuery] = useState('');
// //     const [certSearchQuery, setCertSearchQuery] = useState('');
// //     const [templateSearchQuery, setTemplateSearchQuery] = useState('');
// //     const [folderToDelete, setFolderToDelete] = useState<any>(null);

// //     // SYSTEM COURSES & SAVED COURSE TEMPLATES
// //     const [systemCourses, setSystemCourses] = useState<any[]>([]);
// //     const [courseTemplates, setCourseTemplates] = useState<any[]>([]);
// //     const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
// //     const [isSavingTemplate, setIsSavingTemplate] = useState(false);

// //     // ─── ZIP EXPORT STATE ───
// //     const [isExportingZip, setIsExportingZip] = useState(false);
// //     const [zipProgress, setZipProgress] = useState({ current: 0, total: 0 });

// //     // ─── LEGACY / ON-DEMAND BLOCKCHAIN MINTING STATE ───
// //     const [mintingCertId, setMintingCertId] = useState<string | null>(null);

// //     // ─── ROOT VIEWPORT LOCK (header never scrolls, studio fills remaining height) ───
// //     const rootRef = useRef<HTMLDivElement>(null);
// //     const [rootHeight, setRootHeight] = useState<number | null>(null);

// //     // ─── CANVAS INTERACTIVE PAN & ZOOM GESTURE STATE ───
// //     const [pan, setPan] = useState({ x: 0, y: 0 });
// //     const [isPanning, setIsPanning] = useState(false);
// //     const dragStartRef = useRef({ x: 0, y: 0 });
// //     const userAdjustedRef = useRef(false); // once user zooms manually we stop auto-refitting on resize

// //     const previewContainerRef = useRef<HTMLDivElement>(null);

// //     // ─── SHARE MODAL STATE ───
// //     const [shareModalConfig, setShareModalConfig] = useState<{
// //         isOpen: boolean;
// //         targetId: string;
// //         targetType: 'folder' | 'certificate';
// //         targetName: string;
// //         collaborators: string[];
// //         verifyUrl?: string;
// //     }>({ isOpen: false, targetId: '', targetType: 'folder', targetName: '', collaborators: [], verifyUrl: '' });

// //     const [certData, setCertData] = useState({
// //         template: 'luxury',
// //         recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '',
// //         description: 'has demonstrated exceptional skills and outstanding performance in',
// //         programme: 'Advanced Leadership Workshop', institutionName: 'mLab Southern Africa',
// //         issueDate: new Date().toISOString().split('T')[0], signatoryName: 'Zakhele Tinga',
// //         signatoryTitle: 'Academic Manager', logoUrl: mLabLogo, sigUrl: defaultSignature,
// //         groupId: 'general',
// //         courseId: '',
// //         containerId: '',
// //         verificationCode: '',
// //         verifyUrl: '',
// //         showQrCode: true
// //     });

// //     const [isGenerating, setIsGenerating] = useState(false);
// //     const [actionType, setActionType] = useState<'save' | 'download' | 'email'>('save');
// //     const [zoom, setZoom] = useState(0.65);
// //     const certRef = useRef<HTMLDivElement>(null);

// //     // ─── BULK GENERATOR STATE ───
// //     const [showBulkModal, setShowBulkModal] = useState(false);
// //     const [isBulkGenerating, setIsBulkGenerating] = useState(false);
// //     const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

// //     const [bulkData, setBulkData] = useState<any[]>([]);
// //     const [bulkSettings, setBulkSettings] = useState<any>(null);
// //     const [bulkSendEmails, setBulkSendEmails] = useState(false);
// //     const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
// //     const [applyBulkEditsToAll, setApplyBulkEditsToAll] = useState(false);

// //     const isStudioView = view === 'studio' || view === 'bulk-review';

// //     // 🚀 LOCK THE PAGE: stop every scrollable ancestor from scrolling and size this component
// //     // to exactly the space below its own top edge. This is what keeps the header pinned and
// //     // gives the certificate playground a stable, measurable box to fit into.
// //     useLayoutEffect(() => {
// //         const el = rootRef.current;
// //         if (!el) return;

// //         const locked: { node: HTMLElement; overflowY: string }[] = [];
// //         let node: HTMLElement | null = el.parentElement;
// //         while (node && node !== document.body && node !== document.documentElement) {
// //             const cs = window.getComputedStyle(node);
// //             if (/(auto|scroll)/.test(cs.overflowY)) {
// //                 node.scrollTop = 0;
// //                 locked.push({ node, overflowY: node.style.overflowY });
// //                 node.style.overflowY = 'hidden';
// //             }
// //             node = node.parentElement;
// //         }
// //         const prevBodyOverflow = document.body.style.overflow;
// //         document.body.style.overflow = 'hidden';
// //         window.scrollTo(0, 0);

// //         const measure = () => {
// //             const top = el.getBoundingClientRect().top;
// //             setRootHeight(Math.max(360, Math.floor(window.innerHeight - top)));
// //         };
// //         measure();
// //         const settle = window.setTimeout(measure, 150); // re-measure after layout settles
// //         window.addEventListener('resize', measure);

// //         return () => {
// //             window.clearTimeout(settle);
// //             window.removeEventListener('resize', measure);
// //             locked.forEach(({ node, overflowY }) => { node.style.overflowY = overflowY; });
// //             document.body.style.overflow = prevBodyOverflow;
// //         };
// //     }, []);

// //     // 🚀 DYNAMIC AUTO-FIT CALCULATOR (centres the certificate and fits it to the free space)
// //     const handleFitToScreen = useCallback(() => {
// //         userAdjustedRef.current = false;
// //         const container = previewContainerRef.current;
// //         if (!container) return;
// //         const { clientWidth, clientHeight } = container;
// //         if (clientWidth <= 0 || clientHeight <= 0) return;

// //         const paddingX = 80;
// //         const paddingY = 110; // extra room for the floating zoom bar at the bottom
// //         const scaleX = (clientWidth - paddingX) / CERT_WIDTH;
// //         const scaleY = (clientHeight - paddingY) / CERT_HEIGHT;
// //         const fitScale = Math.min(scaleX, scaleY);

// //         setZoom(Number(clampZoom(fitScale).toFixed(3)));
// //         setPan({ x: 0, y: 0 });
// //     }, []);

// //     // 🚀 RESET VIEWPORT HANDLER (100%, centred)
// //     const handleResetViewport = useCallback(() => {
// //         userAdjustedRef.current = true;
// //         setZoom(1);
// //         setPan({ x: 0, y: 0 });
// //     }, []);

// //     // Auto-fit whenever the studio opens and whenever the playground box changes size
// //     useEffect(() => {
// //         if (!isStudioView) return;
// //         const timer = setTimeout(() => handleFitToScreen(), 120);

// //         const container = previewContainerRef.current;
// //         if (!container) return () => clearTimeout(timer);

// //         const resizeObserver = new ResizeObserver(() => {
// //             if (!userAdjustedRef.current) handleFitToScreen();
// //         });
// //         resizeObserver.observe(container);

// //         return () => {
// //             clearTimeout(timer);
// //             resizeObserver.disconnect();
// //         };
// //     }, [isStudioView, handleFitToScreen]);

// //     // 🚀 NATIVE (NON-PASSIVE) WHEEL LISTENER: Ctrl/Cmd + scroll zooms, plain scroll / trackpad pans.
// //     // React's onWheel is passive, so preventDefault there would let the browser zoom the whole page.
// //     useEffect(() => {
// //         if (!isStudioView) return;
// //         const el = previewContainerRef.current;
// //         if (!el) return;

// //         const onWheel = (e: WheelEvent) => {
// //             e.preventDefault();
// //             if (e.ctrlKey || e.metaKey) {
// //                 userAdjustedRef.current = true;
// //                 const factor = e.deltaY > 0 ? 0.92 : 1.08;
// //                 setZoom(prev => Number(clampZoom(prev * factor).toFixed(3)));
// //             } else {
// //                 setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
// //             }
// //         };

// //         el.addEventListener('wheel', onWheel, { passive: false });
// //         return () => el.removeEventListener('wheel', onWheel);
// //     }, [isStudioView]);

// //     // Fetch system courses and saved course certificate templates
// //     const fetchStudioDatasets = useCallback(async () => {
// //         try {
// //             const coursesSnap = await getDocs(collection(db, 'content_packages'));
// //             setSystemCourses(coursesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
// //         } catch (err: any) {
// //             if (cohorts && cohorts.length > 0) setSystemCourses(cohorts);
// //         }

// //         try {
// //             const templatesSnap = await getDocs(collection(db, 'certificate_templates'));
// //             setCourseTemplates(templatesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
// //         } catch (err: any) {
// //             setCourseTemplates([]);
// //         }
// //     }, [cohorts]);

// //     useEffect(() => {
// //         fetchStudioDatasets();
// //     }, [fetchStudioDatasets]);

// //     useEffect(() => {
// //         if (targetLearner) {
// //             setCertData(prev => ({
// //                 ...prev,
// //                 recipientName: targetLearner.fullName || targetLearner.name || '',
// //                 recipientEmail: targetLearner.email || '',
// //                 programme: targetLearner.qualification?.name || targetLearner.programmeName || prev.programme,
// //                 certType: 'Competence',
// //             }));
// //             setView('studio');
// //         }
// //     }, [targetLearner]);

// //     useEffect(() => { if (!settings && fetchSettings) fetchSettings(); }, [settings, fetchSettings]);

// //     useEffect(() => {
// //         if (settings) {
// //             setCertData(prev => ({
// //                 ...prev,
// //                 institutionName: settings.institutionName || "mLab Southern Africa",
// //                 signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
// //                 signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
// //                 logoUrl: mLabLogo, sigUrl: (settings as any).signatureUrl || defaultSignature
// //             }));
// //         }
// //     }, [settings]);

// //     useEffect(() => {
// //         const loadInitialData = async () => {
// //             try {
// //                 if (fetchCertificateGroups) await fetchCertificateGroups();
// //                 if (fetchAdHocCertificates) await fetchAdHocCertificates();
// //             } catch (error) { console.error("Failed to load studio data", error); }
// //             finally { setIsLoadingData(false); }
// //         };
// //         if (adHocCertificates.length === 0 || certificateGroups.length === 0) loadInitialData();
// //         else setIsLoadingData(false);
// //     }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

// //     useEffect(() => {
// //         if (view === 'bulk-review' && bulkData.length > 0) {
// //             const currentRecord = bulkData[bulkCurrentIndex];
// //             if (currentRecord) setCertData(currentRecord);
// //         }
// //     }, [bulkCurrentIndex, view, bulkData]);

// //     const isSuperAdmin = (user as any)?.isSuperAdmin === true;
// //     const userEmail = user?.email?.toLowerCase() || '';

// //     const myCertificateGroups = (certificateGroups || []).filter((g: any) =>
// //         isSuperAdmin || g.createdBy === user?.uid || (g.collaborators || []).includes(userEmail)
// //     );

// //     const myAdHocCertificates = (adHocCertificates || []).filter((c: any) =>
// //         isSuperAdmin || c.createdBy === user?.uid || (c.collaborators || []).includes(userEmail)
// //     );

// //     // 🚀 MINT EXISTING / LEGACY CERTIFICATE TO BLOCKCHAIN
// //     const handleMintExistingCertificate = async (cert: any) => {
// //         setMintingCertId(cert.id);
// //         toast.info(`Minting certificate for ${cert.recipientName} to Blockchain...`);

// //         try {
// //             const codePrefix = cert.recipientName ? cert.recipientName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X') : '0000';
// //             const verificationCode = cert.verificationCode || `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
// //             const verifyUrl = (cert.verifyUrl && !cert.verifyUrl.includes('localhost'))
// //                 ? cert.verifyUrl
// //                 : `${getBaseUrl()}/verify/${verificationCode}`;

// //             let pdfBase64 = '';
// //             if (cert.pdfUrl) {
// //                 const response = await fetch(cert.pdfUrl);
// //                 const blob = await response.blob();
// //                 pdfBase64 = await blobToDataUrl(blob);
// //             } else {
// //                 throw new Error("No PDF URL found for this certificate.");
// //             }

// //             const functions = getFunctions();
// //             const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

// //             const bcResponse: any = await issueBlockchainCertificate({
// //                 verificationCode,
// //                 learnerName: cert.recipientName,
// //                 idNumber: cert.idNumber || 'N/A',
// //                 qualification: cert.courseName || cert.programme || 'Certificate',
// //                 issueDate: cert.issueDate || new Date().toISOString().split('T')[0],
// //                 eisaStatus: cert.type || 'Achievement',
// //                 pdfBase64: pdfBase64
// //             });

// //             if (bcResponse.data?.success) {
// //                 const blockchainTxHash = bcResponse.data.transactionHash;
// //                 const ipfsHash = bcResponse.data.ipfsHash;
// //                 const blockchainStatus = 'anchored';

// //                 await updateDoc(doc(db, 'ad_hoc_certificates', cert.id), {
// //                     verificationCode,
// //                     verifyUrl,
// //                     blockchainTxHash,
// //                     ipfsHash,
// //                     blockchainStatus
// //                 });

// //                 toast.success(`Successfully anchored ${cert.recipientName}'s certificate on Blockchain!`);
// //                 if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
// //             } else {
// //                 throw new Error("Blockchain service returned unsuccessful response.");
// //             }
// //         } catch (error: any) {
// //             console.error("Mint existing certificate error:", error);
// //             toast.error(error?.message || "Failed to mint certificate to Blockchain.");
// //         } finally {
// //             setMintingCertId(null);
// //         }
// //     };

// //     // 🚀 CLIENT-SIDE ZIP EXPORT ENGINE FOR FOLDERS
// //     const handleExportFolderZip = async (folderObj: any) => {
// //         let certsInFolder: any[] = [];
// //         if (folderObj.id === 'general') {
// //             certsInFolder = myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general');
// //         } else {
// //             certsInFolder = myAdHocCertificates.filter((c: any) => c.groupId === folderObj.id);
// //         }

// //         if (certsInFolder.length === 0) {
// //             toast.warning(`Folder "${folderObj.name}" contains no certificates to export.`);
// //             return;
// //         }

// //         setIsExportingZip(true);
// //         setZipProgress({ current: 0, total: certsInFolder.length });
// //         toast.info(`Preparing ZIP archive for "${folderObj.name}"...`);

// //         try {
// //             const zip = new JSZip();
// //             const folderNameClean = (folderObj.name || 'Certificates').replace(/[^a-zA-Z0-9_-]/g, '_');
// //             const zipFolder = zip.folder(folderNameClean) || zip;

// //             let successfulCount = 0;

// //             for (let i = 0; i < certsInFolder.length; i++) {
// //                 const cert = certsInFolder[i];
// //                 setZipProgress({ current: i + 1, total: certsInFolder.length });

// //                 if (!cert.pdfUrl) continue;

// //                 try {
// //                     const response = await fetch(cert.pdfUrl);
// //                     if (!response.ok) throw new Error(`HTTP ${response.status}`);
// //                     const blob = await response.blob();

// //                     const safeRecipient = (cert.recipientName || `Certificate_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
// //                     const certTitle = (cert.type || 'Award').replace(/[^a-zA-Z0-9_-]/g, '_');
// //                     const fileFilename = `${safeRecipient}_${certTitle}.pdf`;

// //                     zipFolder.file(fileFilename, blob);
// //                     successfulCount++;
// //                 } catch (fetchErr) {
// //                     console.warn(`Could not fetch PDF for ${cert.recipientName}:`, fetchErr);
// //                 }
// //             }

// //             if (successfulCount === 0) {
// //                 toast.error("Could not download PDF files from Storage.");
// //                 setIsExportingZip(false);
// //                 return;
// //             }

// //             toast.info("Compressing files into .zip archive...");
// //             const zipContent = await zip.generateAsync({ type: 'blob' });

// //             const zipUrl = URL.createObjectURL(zipContent);
// //             const downloadLink = document.createElement('a');
// //             downloadLink.href = zipUrl;
// //             downloadLink.download = `${folderNameClean}_Certificates.zip`;
// //             document.body.appendChild(downloadLink);
// //             downloadLink.click();
// //             document.body.removeChild(downloadLink);
// //             URL.revokeObjectURL(zipUrl);

// //             toast.success(`Successfully exported ${successfulCount} certificates as ZIP!`);
// //         } catch (err: any) {
// //             console.error("ZIP Export Error:", err);
// //             toast.error("Failed to generate ZIP export.");
// //         } finally {
// //             setIsExportingZip(false);
// //             setZipProgress({ current: 0, total: 0 });
// //         }
// //     };

// //     const handleCreateFolder = async () => {
// //         if (!newFolderName.trim()) return;
// //         try {
// //             if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());
// //             if (fetchCertificateGroups) await fetchCertificateGroups(true);
// //             setNewFolderName(''); setShowNewFolderInput(false); toast.success("Folder created successfully!");
// //         } catch (error) { toast.error("Failed to create folder"); }
// //     };

// //     const handleRenameFolder = async (id: string) => {
// //         if (!editFolderName.trim()) { setEditingFolderId(null); return; }
// //         try {
// //             if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
// //             if (fetchCertificateGroups) await fetchCertificateGroups(true);
// //             setEditingFolderId(null); toast.success("Folder renamed!");
// //         } catch (error) { toast.error("Failed to rename folder"); }
// //     };

// //     const triggerDeleteFolder = (e: React.MouseEvent, folder: any) => {
// //         e.stopPropagation();
// //         setFolderToDelete(folder);
// //     };

// //     const executeDeleteFolder = async () => {
// //         if (!folderToDelete) return;
// //         try {
// //             const batch = writeBatch(db);
// //             const certsToMove = myAdHocCertificates.filter((c: any) => c.groupId === folderToDelete.id);
// //             certsToMove.forEach((cert: any) => {
// //                 batch.update(doc(db, 'ad_hoc_certificates', cert.id), { groupId: 'general' });
// //             });
// //             batch.delete(doc(db, 'certificate_groups', folderToDelete.id));

// //             await batch.commit();
// //             toast.success(`Folder deleted. ${certsToMove.length} certificates safely moved to General.`);

// //             if (fetchCertificateGroups) await fetchCertificateGroups(true);
// //             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
// //         } catch (error) {
// //             console.error("Delete Error:", error);
// //             toast.error("Failed to delete folder.");
// //         } finally {
// //             setFolderToDelete(null);
// //         }
// //     };

// //     const handleSaveCollaborators = async (id: string, type: 'folder' | 'certificate', collaborators: string[]) => {
// //         try {
// //             const collectionName = type === 'folder' ? 'certificate_groups' : 'ad_hoc_certificates';
// //             await updateDoc(doc(db, collectionName, id), { collaborators });
// //             toast.success('Access control updated securely.');

// //             if (type === 'folder' && fetchCertificateGroups) await fetchCertificateGroups(true);
// //             if (type === 'certificate' && fetchAdHocCertificates) await fetchAdHocCertificates(true);

// //             if (activeFolder && activeFolder.id === id) {
// //                 setActiveFolder((prev: any) => ({ ...prev, collaborators }));
// //             }
// //         } catch (err) {
// //             toast.error('Failed to update collaborators.');
// //         }
// //     };

// //     const getCertificatesForActiveFolder = () => {
// //         if (!activeFolder) return [];
// //         let certs: any[] = [];
// //         if (activeFolder.id === 'general') certs = myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general');
// //         else certs = myAdHocCertificates.filter((c: any) => c.groupId === activeFolder.id);

// //         if (certSearchQuery) {
// //             const q = certSearchQuery.toLowerCase();
// //             return certs.filter((c: any) =>
// //                 (c.recipientName || '').toLowerCase().includes(q) ||
// //                 (c.courseName || '').toLowerCase().includes(q) ||
// //                 (c.type || '').toLowerCase().includes(q)
// //             );
// //         }
// //         return certs;
// //     };

// //     const filteredFolders = myCertificateGroups.filter((g: any) => (g.name || '').toLowerCase().includes(folderSearchQuery.toLowerCase()));
// //     const showGeneralFolder = folderSearchQuery === '' || 'general certificates'.includes(folderSearchQuery.toLowerCase());

// //     const filteredCourseTemplates = courseTemplates.filter((t: any) =>
// //         (t.title || '').toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
// //         (t.programmeName || '').toLowerCase().includes(templateSearchQuery.toLowerCase())
// //     );

// //     const handleZoomIn = () => { userAdjustedRef.current = true; setZoom(prev => Number(clampZoom(prev + 0.1).toFixed(3))); };
// //     const handleZoomOut = () => { userAdjustedRef.current = true; setZoom(prev => Number(clampZoom(prev - 0.1).toFixed(3))); };

// //     // 🚀 INTERACTIVE CANVAS DRAG-TO-PAN (drag anywhere on the playground, like Canva / Figma)
// //     const handleCanvasMouseDown = (e: React.MouseEvent) => {
// //         if (e.button !== 0 && e.button !== 1) return;
// //         setIsPanning(true);
// //         dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
// //     };

// //     const handleCanvasMouseMove = (e: React.MouseEvent) => {
// //         if (!isPanning) return;
// //         setPan({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
// //     };

// //     const handleCanvasMouseUp = () => setIsPanning(false);

// //     const stopCanvasEvent = (e: React.SyntheticEvent) => e.stopPropagation();

// //     const handleChange = (field: string, value: any) => {
// //         setCertData(prev => ({ ...prev, [field]: value }));
// //         const personalFields = ['recipientName', 'recipientEmail'];

// //         if (view === 'bulk-review') {
// //             setBulkData(currentBulk => {
// //                 if (applyBulkEditsToAll && !personalFields.includes(field)) {
// //                     return currentBulk.map((cert: any) => ({ ...cert, [field]: value }));
// //                 } else {
// //                     const updated = [...currentBulk];
// //                     updated[bulkCurrentIndex] = { ...updated[bulkCurrentIndex], [field]: value };
// //                     return updated;
// //                 }
// //             });
// //         }
// //     };

// //     const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
// //         const file = e.target.files?.[0];
// //         if (file) { handleChange(field, URL.createObjectURL(file)); }
// //     };

// //     const resetForm = () => {
// //         setEditingTemplateId(null);
// //         setPan({ x: 0, y: 0 });
// //         setCertData(prev => ({
// //             ...prev,
// //             recipientName: '',
// //             recipientEmail: '',
// //             certType: 'Achievement',
// //             customType: '',
// //             programme: 'Advanced Leadership Workshop',
// //             courseId: '',
// //             containerId: '',
// //             verificationCode: '',
// //             verifyUrl: '',
// //             showQrCode: true
// //         }));
// //     };

// //     const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

// //     const handleEditTemplate = (tmpl: any) => {
// //         setEditingTemplateId(tmpl.id);
// //         setPan({ x: 0, y: 0 });
// //         setCertData({
// //             template: tmpl.templateVisual || 'luxury',
// //             recipientName: 'SAMPLE LEARNER (PREVIEW)',
// //             recipientEmail: 'learner@example.com',
// //             certType: tmpl.certType || 'Achievement',
// //             customType: '',
// //             description: tmpl.description || 'has demonstrated exceptional skills and performance in',
// //             programme: tmpl.programmeName || '',
// //             institutionName: tmpl.institutionName || 'mLab Southern Africa',
// //             issueDate: new Date().toISOString().split('T')[0],
// //             signatoryName: tmpl.signatoryName || '',
// //             signatoryTitle: tmpl.signatoryTitle || '',
// //             logoUrl: tmpl.logoUrl || mLabLogo,
// //             sigUrl: tmpl.sigUrl || defaultSignature,
// //             groupId: 'general',
// //             courseId: tmpl.courseId || '',
// //             containerId: tmpl.containerId || '',
// //             verificationCode: '',
// //             verifyUrl: '',
// //             showQrCode: tmpl.showQrCode !== false
// //         });
// //         setView('studio');
// //     };

// //     const handleDeleteTemplate = async (tmplId: string, title: string) => {
// //         if (!window.confirm(`Are you sure you want to delete template "${title}"?`)) return;
// //         try {
// //             await deleteDoc(doc(db, 'certificate_templates', tmplId));
// //             toast.success("Certificate template deleted.");
// //             fetchStudioDatasets();
// //         } catch (err) {
// //             toast.error("Failed to delete template.");
// //         }
// //     };

// //     const handleSaveAsReusableTemplate = async () => {
// //         if (!certData.programme) {
// //             toast.warning("Please provide or select a course/programme name first.");
// //             return;
// //         }

// //         setIsSavingTemplate(true);
// //         try {
// //             const templatePayload = {
// //                 title: `${certData.programme} - ${finalCertType} Template`,
// //                 courseId: certData.courseId || null,
// //                 programmeName: certData.programme,
// //                 certType: finalCertType,
// //                 templateVisual: certData.template,
// //                 description: certData.description,
// //                 institutionName: certData.institutionName,
// //                 signatoryName: certData.signatoryName,
// //                 signatoryTitle: certData.signatoryTitle,
// //                 logoUrl: certData.logoUrl,
// //                 sigUrl: certData.sigUrl,
// //                 showQrCode: certData.showQrCode,
// //                 updatedAt: serverTimestamp()
// //             };

// //             if (editingTemplateId) {
// //                 await updateDoc(doc(db, 'certificate_templates', editingTemplateId), templatePayload);
// //                 toast.success(`Template updated successfully!`);
// //             } else {
// //                 await addDoc(collection(db, 'certificate_templates'), {
// //                     ...templatePayload,
// //                     createdBy: user?.uid || 'Admin',
// //                     createdAt: serverTimestamp()
// //                 });
// //                 toast.success(`Saved new template "${templatePayload.title}"! It is now available in Launch Cohort Run modal.`);
// //             }

// //             fetchStudioDatasets();
// //             setView('folders');
// //             setStudioLandingTab('course_templates');
// //         } catch (err: any) {
// //             console.error("Save template error:", err);
// //             toast.error("Failed to save certificate template.");
// //         } finally {
// //             setIsSavingTemplate(false);
// //         }
// //     };

// //     // ============================================================================
// //     // SINGLE CERTIFICATE GENERATION & BLOCKCHAIN HANDSHAKE
// //     // ============================================================================
// //     const executeGeneration = useCallback(async (overrideAction?: 'save' | 'download' | 'email') => {
// //         const mode = overrideAction || actionType;
// //         if (!certRef.current) return;
// //         if (!certData.recipientName.trim()) { toast.error('Recipient name is required'); return; }

// //         setIsGenerating(true);
// //         setActionType(mode);

// //         const actionLabel = mode === 'email'
// //             ? 'Generating & sending email...'
// //             : mode === 'download'
// //                 ? 'Generating & Downloading PDF...'
// //                 : 'Generating & Anchoring to Blockchain...';
// //         toast.info(actionLabel);

// //         try {
// //             // 🚀 1. PRE-GENERATE VERIFICATION CODE & URL FOR QR (USING PRODUCTION DOMAIN RESOLVER)
// //             const codePrefix = targetLearner?.idNumber ? targetLearner.idNumber.slice(-4) : '0000';
// //             const verificationCode = certData.verificationCode || `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
// //             const verifyUrl = `${getBaseUrl()}/verify/${verificationCode}`;

// //             // Inject into state so the template renders the QR code, then let it paint
// //             setCertData(prev => ({ ...prev, verificationCode, verifyUrl }));
// //             await new Promise(resolve => setTimeout(resolve, 500));

// //             // 🚀 2. CAPTURE CANVAS & GENERATE PDF (zoom/pan independent — the playground view is untouched)
// //             const canvas = await captureCertificateCanvas(certRef.current);

// //             const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
// //             pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
// //             const pdfBlob = pdf.output('blob');

// //             // Convert Blob to Base64 for the Blockchain Cloud Function
// //             const pdfBase64 = await blobToDataUrl(pdfBlob);

// //             // 🚀 3. UPLOAD TO FIREBASE STORAGE
// //             const storage = getStorage();
// //             const safeName = certData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
// //             const fileName = `ad_hoc_certs/${Date.now()}_${safeName}.pdf`;
// //             const storageRef = ref(storage, fileName);
// //             await uploadBytes(storageRef, pdfBlob);
// //             const downloadUrl = await getDownloadURL(storageRef);

// //             // 🚀 4. ANCHOR TO BLOCKCHAIN VIA CLOUD FUNCTION
// //             let blockchainTxHash = null;
// //             let ipfsHash = null;
// //             let blockchainStatus = 'pending';

// //             try {
// //                 toast.info("Anchoring to Ethereum Sepolia Blockchain...");
// //                 const functions = getFunctions();
// //                 const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

// //                 const bcResponse: any = await issueBlockchainCertificate({
// //                     verificationCode,
// //                     learnerName: certData.recipientName,
// //                     idNumber: targetLearner?.idNumber || 'N/A',
// //                     qualification: certData.programme,
// //                     issueDate: certData.issueDate,
// //                     eisaStatus: finalCertType,
// //                     pdfBase64: pdfBase64
// //                 });

// //                 if (bcResponse.data?.success) {
// //                     blockchainTxHash = bcResponse.data.transactionHash;
// //                     ipfsHash = bcResponse.data.ipfsHash;
// //                     blockchainStatus = 'anchored';
// //                     toast.success("Successfully anchored to Blockchain!");
// //                 }
// //             } catch (bcError) {
// //                 console.error("Blockchain anchoring failed:", bcError);
// //                 toast.warning("PDF saved, but blockchain anchoring failed.");
// //             }

// //             // 🚀 5. RESOLVE FOLDER NAME FOR CLEAR USER TOAST FEEDBACK
// //             const targetFolderObj = (myCertificateGroups || []).find((g: any) => g.id === certData.groupId);
// //             const savedFolderName = targetFolderObj?.name || (certData.groupId === 'general' || !certData.groupId ? 'General Certificates' : 'Workspace Folder');

// //             // 🚀 6. SAVE RECORD TO FIRESTORE
// //             const certRecord = {
// //                 recipientName: certData.recipientName,
// //                 recipientEmail: certData.recipientEmail || null,
// //                 learnerId: targetLearner?.id || null,
// //                 courseId: certData.courseId || null,
// //                 containerId: certData.containerId || null,
// //                 type: finalCertType,
// //                 courseName: certData.programme,
// //                 issueDate: certData.issueDate,

// //                 // Track verification & blockchain fields
// //                 pdfUrl: downloadUrl,
// //                 verificationCode: verificationCode,
// //                 verifyUrl: verifyUrl,
// //                 blockchainTxHash: blockchainTxHash,
// //                 ipfsHash: ipfsHash,
// //                 blockchainStatus: blockchainStatus,
// //                 showQrCode: certData.showQrCode !== false,

// //                 groupId: certData.groupId || 'general',
// //                 templateUsed: certData.template,
// //                 createdBy: user?.uid || 'Admin',
// //                 createdAt: serverTimestamp(),
// //                 isEmailed: false,
// //                 collaborators: []
// //             };

// //             const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), certRecord);

// //             if (targetLearner?.id) {
// //                 await updateDoc(doc(db, 'learners', targetLearner.id), {
// //                     certificates: arrayUnion({
// //                         id: newCertRef.id,
// //                         courseId: certData.courseId || null,
// //                         type: finalCertType,
// //                         courseName: certData.programme,
// //                         issueDate: certData.issueDate,
// //                         pdfUrl: downloadUrl,
// //                         verificationCode: verificationCode,
// //                         createdAt: new Date().toISOString()
// //                     })
// //                 });
// //             }

// //             if (mode === 'email' && certData.recipientEmail) {
// //                 const functions = getFunctions();
// //                 const sendAdHocEmail = httpsCallable(functions, 'sendAdHocCertificate');
// //                 await sendAdHocEmail({ email: certData.recipientEmail, recipientName: certData.recipientName, pdfUrl: downloadUrl, awardTitle: finalCertType, courseName: certData.programme });
// //                 await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
// //                 toast.success(`Certificate saved to "${savedFolderName}" & emailed to ${certData.recipientEmail}!`);
// //             } else if (mode === 'download') {
// //                 pdf.save(`Certificate_${safeName}.pdf`);
// //                 toast.success(`Certificate downloaded & saved to "${savedFolderName}"!`);
// //             } else if (mode === 'save') {
// //                 toast.success(`Certificate saved to "${savedFolderName}" & anchored to Blockchain!`);
// //             }

// //             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
// //             resetForm();
// //             navigate('/admin?tab=studio', { replace: true, state: {} });
// //             setView('folders');
// //         } catch (error: any) {
// //             console.error('Studio Error:', error);
// //             toast.error(`Studio Error: ${error?.message || 'Failed to process.'}`);
// //         } finally { setIsGenerating(false); }
// //     }, [certRef, certData, actionType, toast, finalCertType, user, targetLearner, fetchAdHocCertificates, navigate, myCertificateGroups]);

// //     const handleStartBulkReview = (rows: any[], settings: any, sendEmails: boolean) => {
// //         setShowBulkModal(false);
// //         const fullyMappedData = rows.map((row: any) => ({
// //             ...certData,
// //             ...settings,
// //             recipientName: row.Name || row.name || row['Full Name'] || row.Recipient || 'Unknown',
// //             recipientEmail: row.Email || row.email || row['Email Address'] || '',
// //             programme: row.Course || row.course || row.Programme || settings.programme
// //         }));

// //         setBulkData(fullyMappedData);
// //         setBulkSettings(settings);
// //         setBulkSendEmails(sendEmails);
// //         setBulkCurrentIndex(0);
// //         setCertData(fullyMappedData[0]);
// //         setView('bulk-review');
// //     };

// //     // ============================================================================
// //     // BULK CERTIFICATE GENERATION & BLOCKCHAIN HANDSHAKE
// //     // ============================================================================
// //     const executeFinalBulkProcessing = async () => {
// //         setIsBulkGenerating(true);

// //         let successCount = 0;

// //         try {
// //             for (let i = 0; i < bulkData.length; i++) {
// //                 setBulkProgress({ current: i + 1, total: bulkData.length });
// //                 const currentCert = bulkData[i];

// //                 // 🚀 1. PRE-GENERATE VERIFICATION DATA PER RECIPIENT (USING PRODUCTION DOMAIN RESOLVER)
// //                 const codePrefix = currentCert.recipientName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
// //                 const verificationCode = `CERT${Date.now().toString().slice(-6)}${codePrefix}`;
// //                 const verifyUrl = `${getBaseUrl()}/verify/${verificationCode}`;

// //                 const activeCertData = {
// //                     ...currentCert,
// //                     verificationCode,
// //                     verifyUrl
// //                 };

// //                 // Inject into state and pause for the QR code to render in the DOM
// //                 setCertData(activeCertData);
// //                 await new Promise(r => setTimeout(r, 600));

// //                 if (!certRef.current) continue;

// //                 // 🚀 2. CAPTURE CANVAS & GENERATE PDF (zoom/pan independent)
// //                 const canvas = await captureCertificateCanvas(certRef.current);
// //                 const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
// //                 pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
// //                 const pdfBlob = pdf.output('blob');

// //                 const pdfBase64 = await blobToDataUrl(pdfBlob);

// //                 // 🚀 3. UPLOAD PDF TO STORAGE
// //                 const safeName = activeCertData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
// //                 const fileName = `ad_hoc_certs/bulk_${Date.now()}_${safeName}.pdf`;
// //                 const storageRef = ref(getStorage(), fileName);
// //                 await uploadBytes(storageRef, pdfBlob);
// //                 const downloadUrl = await getDownloadURL(storageRef);

// //                 // 🚀 4. BLOCKCHAIN MINTING WITH RATE-LIMIT SAFEGUARD
// //                 let blockchainTxHash = null;
// //                 let ipfsHash = null;
// //                 let blockchainStatus = 'pending';

// //                 try {
// //                     const functions = getFunctions();
// //                     const issueBlockchainCertificate = httpsCallable(functions, 'issueBlockchainCertificate');

// //                     const bcResponse: any = await issueBlockchainCertificate({
// //                         verificationCode,
// //                         learnerName: activeCertData.recipientName,
// //                         idNumber: 'N/A',
// //                         qualification: activeCertData.programme,
// //                         issueDate: activeCertData.issueDate,
// //                         eisaStatus: activeCertData.certType,
// //                         pdfBase64: pdfBase64
// //                     });

// //                     if (bcResponse.data?.success) {
// //                         blockchainTxHash = bcResponse.data.transactionHash;
// //                         ipfsHash = bcResponse.data.ipfsHash;
// //                         blockchainStatus = 'anchored';
// //                     }
// //                 } catch (bcError) {
// //                     console.warn(`Bulk blockchain anchoring failed for ${activeCertData.recipientName}:`, bcError);
// //                 }

// //                 // 🚀 5. SAVE TO FIRESTORE
// //                 const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
// //                     recipientName: activeCertData.recipientName,
// //                     recipientEmail: activeCertData.recipientEmail || null,
// //                     courseId: activeCertData.courseId || null,
// //                     type: activeCertData.certType,
// //                     courseName: activeCertData.programme,
// //                     issueDate: activeCertData.issueDate,

// //                     // Tracking Data
// //                     pdfUrl: downloadUrl,
// //                     verificationCode: verificationCode,
// //                     verifyUrl: verifyUrl,
// //                     blockchainTxHash: blockchainTxHash,
// //                     ipfsHash: ipfsHash,
// //                     blockchainStatus: blockchainStatus,
// //                     showQrCode: activeCertData.showQrCode !== false,

// //                     groupId: activeCertData.groupId || 'general',
// //                     templateUsed: activeCertData.template,
// //                     createdBy: user?.uid || 'Admin',
// //                     createdAt: serverTimestamp(),
// //                     isEmailed: false,
// //                     emailStatus: (bulkSendEmails && activeCertData.recipientEmail) ? 'pending' : 'not_requested',
// //                     isBulkUpload: true,
// //                     collaborators: []
// //                 });

// //                 if (bulkSendEmails && activeCertData.recipientEmail) {
// //                     try {
// //                         const sendAdHocEmail = httpsCallable(getFunctions(), 'sendAdHocCertificate');
// //                         await sendAdHocEmail({ email: activeCertData.recipientEmail, recipientName: activeCertData.recipientName, pdfUrl: downloadUrl, awardTitle: activeCertData.certType, courseName: activeCertData.programme });
// //                         await updateDoc(newCertRef, { isEmailed: true, emailStatus: 'sent', emailedAt: serverTimestamp() });
// //                     } catch (emailError: any) {
// //                         console.error(`Failed to send email to ${activeCertData.recipientEmail}:`, emailError);
// //                         await updateDoc(newCertRef, { emailStatus: 'failed', emailError: emailError?.message || 'Cloud function failed' });
// //                     }
// //                 }
// //                 successCount++;

// //                 // 🚀 RATE LIMIT PAUSE: 1-second pause between iterations prevents Sepolia RPC/nonce errors
// //                 await new Promise(r => setTimeout(r, 1000));
// //             }

// //             toast.success(`Bulk Operation Complete: ${successCount} certificates generated & anchored safely.`);
// //             if (fetchAdHocCertificates) fetchAdHocCertificates(true);

// //         } catch (error) {
// //             console.error("Bulk process failed:", error);
// //             toast.error("A critical error interrupted the bulk generation loop.");
// //         } finally {
// //             setIsBulkGenerating(false);
// //             setBulkData([]);
// //             setBulkSettings(null);
// //             setBulkProgress({ current: 0, total: 0 });
// //             resetForm();
// //             setView('folders');
// //         }
// //     };

// //     // Shared style for header ghost buttons
// //     const headerGhostStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' };

// //     // Canvas dot-grid backdrop that follows the pan, so movement feels physical
// //     const canvasBackdrop: React.CSSProperties = {
// //         backgroundColor: '#1e293b',
// //         backgroundImage: 'radial-gradient(rgba(148,163,184,0.28) 1px, transparent 1px)',
// //         backgroundSize: '22px 22px',
// //         backgroundPosition: `${pan.x}px ${pan.y}px`
// //     };

// //     return (
// //         <div
// //             ref={rootRef}
// //             className="wm-root animate-fade-in"
// //             style={{
// //                 display: 'flex',
// //                 flexDirection: 'column',
// //                 height: rootHeight ? `${rootHeight}px` : '100%',
// //                 maxHeight: rootHeight ? `${rootHeight}px` : undefined,
// //                 minHeight: 0,
// //                 overflow: 'hidden',
// //                 position: 'relative'
// //             }}
// //         >

// //             {folderToDelete && (
// //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// //                     <StatusModal
// //                         type="warning"
// //                         title="Delete Workspace Folder"
// //                         message={`Are you sure you want to delete the folder "${folderToDelete.name}"?\n\nDon't worry! All certificates currently inside this folder will be safely preserved and moved back to the General Certificates workspace.`}
// //                         confirmText="Yes, Delete Folder"
// //                         onClose={executeDeleteFolder}
// //                         onCancel={() => setFolderToDelete(null)}
// //                     />
// //                 </div>
// //             )}

// //             {shareModalConfig.isOpen && (
// //                 <ShareModal
// //                     isOpen={shareModalConfig.isOpen}
// //                     onClose={() => setShareModalConfig({ ...shareModalConfig, isOpen: false })}
// //                     targetId={shareModalConfig.targetId}
// //                     targetType={shareModalConfig.targetType}
// //                     targetName={shareModalConfig.targetName}
// //                     initialCollaborators={shareModalConfig.collaborators}
// //                     verifyUrl={shareModalConfig.verifyUrl}
// //                     onSave={handleSaveCollaborators}
// //                 />
// //             )}

// //             {/* ZIP EXPORT OVERLAY */}
// //             {isExportingZip && (
// //                 <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// //                     <div className="ap-spinner" style={{ width: '60px', height: '60px', marginBottom: '1.5rem', borderTopColor: 'var(--mlab-green)' }}></div>
// //                     <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', fontSize: '1.75rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Creating Folder ZIP Archive</h2>
// //                     <p style={{ color: 'var(--mlab-grey)', fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                         Downloading &amp; Bundling <span style={{ color: 'var(--mlab-green)', fontWeight: 'bold' }}>{zipProgress.current}</span> of {zipProgress.total} PDFs...
// //                     </p>
// //                     <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Please wait while files are being zipped.</p>
// //                 </div>
// //             )}

// //             {isBulkGenerating && (
// //                 <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// //                     <div className="ap-spinner" style={{ width: '60px', height: '60px', marginBottom: '1.5rem', borderTopColor: 'var(--mlab-blue)' }}></div>
// //                     <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', fontSize: '2rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Generating Batch Certificates</h2>
// //                     <p style={{ color: 'var(--mlab-grey)', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                         Processing <span style={{ color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{bulkProgress.current}</span> of {bulkProgress.total}...
// //                     </p>
// //                     <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>DO NOT CLOSE THIS TAB OR SWITCH WINDOWS.</p>
// //                 </div>
// //             )}

// //             {showBulkModal && (
// //                 <BulkGeneratorModal
// //                     certificateGroups={myCertificateGroups}
// //                     courses={systemCourses}
// //                     onClose={() => setShowBulkModal(false)}
// //                     onStart={handleStartBulkReview}
// //                     onCreateFolder={async (name) => {
// //                         try {
// //                             const newDocRef = await addDoc(collection(db, 'certificate_groups'), {
// //                                 name: name,
// //                                 createdAt: serverTimestamp(),
// //                                 createdBy: user?.uid || 'Admin',
// //                                 collaborators: []
// //                             });
// //                             if (fetchCertificateGroups) await fetchCertificateGroups(true);
// //                             toast.success("Folder created successfully!");
// //                             return newDocRef.id;
// //                         } catch (error) {
// //                             toast.error("Failed to create folder");
// //                             return null;
// //                         }
// //                     }}
// //                 />
// //             )}

// //             {/* ── FIXED APPLICATION HEADER (NEVER SCROLLS) ── */}
// //             {view !== 'bulk-review' && (
// //                 <div className="wm-page-header" style={{ flexShrink: 0 }}>
// //                     <div className="wm-page-header__left">
// //                         <div className="wm-page-header__icon"><Award size={22} /></div>
// //                         <div>
// //                             <h1 className="wm-page-header__title">{view === 'folders' ? 'Certificate Studio' : view === 'inside-folder' ? activeFolder?.name : 'Design Certificate'}</h1>
// //                             <p className="wm-page-header__desc">
// //                                 {targetLearner ? `Issuing Official Certificate for ${targetLearner.fullName}` : 'Design custom ad-hoc awards, reusable course templates, and manage document history.'}
// //                             </p>
// //                         </div>
// //                     </div>
// //                     <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
// //                         {view === 'folders' && studioLandingTab === 'adhoc' && (
// //                             <>
// //                                 <button type="button" className="wm-btn wm-btn--ghost" onClick={() => setShowBulkModal(true)} style={headerGhostStyle}>
// //                                     <UploadCloud size={14} /> Import Spreadsheet
// //                                 </button>
// //                                 <button type="button" className="wm-btn wm-btn--primary" onClick={() => { resetForm(); setView('studio'); }}>
// //                                     <Plus size={14} /> Single Certificate
// //                                 </button>
// //                             </>
// //                         )}
// //                         {view === 'folders' && studioLandingTab === 'course_templates' && (
// //                             <button type="button" className="wm-btn wm-btn--primary" onClick={() => { resetForm(); setView('studio'); }}>
// //                                 <Plus size={14} /> Create Course Template
// //                             </button>
// //                         )}
// //                         {view === 'inside-folder' && activeFolder && (
// //                             <>
// //                                 <button type="button" className="wm-btn wm-btn--ghost" style={headerGhostStyle} onClick={() => setView('folders')}>
// //                                     <ArrowLeft size={14} /> Back to Folders
// //                                 </button>
// //                                 <button
// //                                     type="button"
// //                                     className="wm-btn wm-btn--ghost"
// //                                     style={{ background: '#16a34a', color: 'white', borderColor: '#22c55e' }}
// //                                     onClick={() => handleExportFolderZip(activeFolder)}
// //                                     title="Export all PDF certificates in this folder as a ZIP archive for printing"
// //                                 >
// //                                     <Archive size={14} /> Export Folder (ZIP)
// //                                 </button>
// //                                 <button type="button" className="wm-btn wm-btn--primary" onClick={() => { resetForm(); setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
// //                                     <Plus size={14} /> Create in this Folder
// //                                 </button>
// //                             </>
// //                         )}
// //                         {view === 'studio' && (
// //                             <>
// //                                 <button type="button" className="wm-btn wm-btn--ghost" style={headerGhostStyle} onClick={() => { resetForm(); navigate('/admin?tab=studio', { replace: true, state: {} }); setView('folders'); }}>
// //                                     <ArrowLeft size={14} /> Cancel Design
// //                                 </button>

// //                                 <button
// //                                     type="button"
// //                                     className="wm-btn wm-btn--ghost"
// //                                     disabled={isSavingTemplate}
// //                                     onClick={handleSaveAsReusableTemplate}
// //                                     style={{ background: '#7c3aed', color: 'white', border: '1px solid #a78bfa' }}
// //                                     title="Save this template so it can be selected when launching Cohort Runs"
// //                                 >
// //                                     {isSavingTemplate ? <Loader2 className="spin" size={14} /> : <Save size={14} />} {editingTemplateId ? 'Update Template' : 'Save Reusable Template'}
// //                                 </button>

// //                                 {/* 🚀 SAVE & MINT TO BLOCKCHAIN BUTTON (NO DOWNLOAD OR EMAIL) */}
// //                                 <button
// //                                     type="button"
// //                                     className="wm-btn wm-btn--primary"
// //                                     disabled={isGenerating}
// //                                     onClick={() => executeGeneration('save')}
// //                                     style={{ background: 'linear-gradient(135deg, #0ea5e9, #2563eb)' }}
// //                                     title="Save certificate to workspace folder and anchor to blockchain without downloading or emailing"
// //                                 >
// //                                     {isGenerating && actionType === 'save' ? <Loader2 className="spin" size={14} /> : <ShieldCheck size={14} />} Save & Mint to Blockchain
// //                                 </button>

// //                                 <button type="button" className="wm-btn wm-btn--ghost" disabled={isGenerating} style={headerGhostStyle} onClick={() => executeGeneration('download')}>
// //                                     {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={14} /> : <Download size={14} />} Download PDF
// //                                 </button>
// //                                 <button type="button" className="wm-btn wm-btn--primary" disabled={isGenerating || !certData.recipientEmail} onClick={() => executeGeneration('email')}>
// //                                     {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={14} /> : <Mail size={14} />} Email Document
// //                                 </button>
// //                             </>
// //                         )}
// //                     </div>
// //                 </div>
// //             )}

// //             {/* ── WORKSPACE AREA (fills all remaining height; scrolls only outside studio) ── */}
// //             <div style={{ flex: 1, minHeight: 0, overflow: isStudioView ? 'hidden' : 'auto', padding: isStudioView ? '0.75rem 1.5rem 1rem' : '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column' }}>

// //                 {/* DUAL TAB SWITCHER ON STUDIO LANDING PAGE */}
// //                 {view === 'folders' && (
// //                     <div style={{ display: 'flex', borderBottom: '2px solid var(--mlab-border)', marginBottom: '1.25rem', gap: '8px', flexShrink: 0 }}>
// //                         <button
// //                             type="button"
// //                             onClick={() => setStudioLandingTab('adhoc')}
// //                             style={{
// //                                 padding: '10px 18px',
// //                                 background: studioLandingTab === 'adhoc' ? '#ffffff' : 'transparent',
// //                                 border: 'none',
// //                                 color: studioLandingTab === 'adhoc' ? 'var(--mlab-blue)' : '#64748b',
// //                                 fontWeight: 800,
// //                                 fontSize: '0.78rem',
// //                                 fontFamily: 'var(--font-heading)',
// //                                 textTransform: 'uppercase',
// //                                 cursor: 'pointer',
// //                                 display: 'inline-flex',
// //                                 alignItems: 'center',
// //                                 gap: '8px',
// //                                 borderBottom: studioLandingTab === 'adhoc' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
// //                                 borderRadius: '0px'
// //                             }}
// //                         >
// //                             <Folder size={15} color={studioLandingTab === 'adhoc' ? 'var(--mlab-blue)' : '#64748b'} />
// //                             Ad-Hoc &amp; Manual Workspaces
// //                         </button>

// //                         <button
// //                             type="button"
// //                             onClick={() => setStudioLandingTab('course_templates')}
// //                             style={{
// //                                 padding: '10px 18px',
// //                                 background: studioLandingTab === 'course_templates' ? '#ffffff' : 'transparent',
// //                                 border: 'none',
// //                                 color: studioLandingTab === 'course_templates' ? '#7c3aed' : '#64748b',
// //                                 fontWeight: 800,
// //                                 fontSize: '0.78rem',
// //                                 fontFamily: 'var(--font-heading)',
// //                                 textTransform: 'uppercase',
// //                                 cursor: 'pointer',
// //                                 display: 'inline-flex',
// //                                 alignItems: 'center',
// //                                 gap: '8px',
// //                                 borderBottom: studioLandingTab === 'course_templates' ? '3px solid #7c3aed' : '3px solid transparent',
// //                                 borderRadius: '0px'
// //                             }}
// //                         >
// //                             <BookOpen size={15} color={studioLandingTab === 'course_templates' ? '#7c3aed' : '#64748b'} />
// //                             Course Assigned Templates ({courseTemplates.length})
// //                         </button>
// //                     </div>
// //                 )}

// //                 {/* ── METRICS RIBBON ── */}
// //                 {view === 'folders' && studioLandingTab === 'adhoc' && !isLoadingData && (
// //                     <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
// //                         <div className="cdp-stat-card cdp-stat-card--blue">
// //                             <div className="cdp-stat-card__icon"><Layers size={20} /></div>
// //                             <div className="cdp-stat-card__body">
// //                                 <span className="cdp-stat-card__value">{myCertificateGroups.length + 1}</span>
// //                                 <span className="cdp-stat-card__label">Total Folders</span>
// //                             </div>
// //                         </div>
// //                         <div className="cdp-stat-card cdp-stat-card--green">
// //                             <div className="cdp-stat-card__icon"><Award size={20} /></div>
// //                             <div className="cdp-stat-card__body">
// //                                 <span className="cdp-stat-card__value">{myAdHocCertificates.length}</span>
// //                                 <span className="cdp-stat-card__label">Issued Certificates</span>
// //                             </div>
// //                         </div>
// //                         <div className="cdp-stat-card cdp-stat-card--amber">
// //                             <div className="cdp-stat-card__icon"><Mail size={20} /></div>
// //                             <div className="cdp-stat-card__body">
// //                                 <span className="cdp-stat-card__value">{myAdHocCertificates.filter((c: any) => c.isEmailed).length}</span>
// //                                 <span className="cdp-stat-card__label">Emailed Successfully</span>
// //                             </div>
// //                         </div>
// //                         <div className="cdp-stat-card cdp-stat-card--grey">
// //                             <div className="cdp-stat-card__icon"><FileText size={20} /></div>
// //                             <div className="cdp-stat-card__body">
// //                                 <span className="cdp-stat-card__value">{myAdHocCertificates.filter((c: any) => !c.isEmailed).length}</span>
// //                                 <span className="cdp-stat-card__label">Downloads Only</span>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 )}

// //                 {/* ── SEARCH TOOLBAR ── */}
// //                 {(view === 'folders' || view === 'inside-folder') && studioLandingTab === 'adhoc' && !isLoadingData && (
// //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap', flexShrink: 0 }}>
// //                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px', width: '300px' }}>
// //                             <Search size={15} color="var(--mlab-grey)" />
// //                             <input
// //                                 type="text"
// //                                 placeholder={view === 'folders' ? "Search folders..." : "Search names or courses..."}
// //                                 value={view === 'folders' ? folderSearchQuery : certSearchQuery}
// //                                 onChange={e => view === 'folders' ? setFolderSearchQuery(e.target.value) : setCertSearchQuery(e.target.value)}
// //                                 style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
// //                             />
// //                             {(folderSearchQuery || certSearchQuery) && (
// //                                 <button type="button" onClick={() => view === 'folders' ? setFolderSearchQuery('') : setCertSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
// //                                     <X size={13} />
// //                                 </button>
// //                             )}
// //                         </div>

// //                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
// //                             {view === 'folders' && (
// //                                 showNewFolderInput ? (
// //                                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// //                                         <input className="wm-form-input" style={{ width: '220px', margin: 0, padding: '0.4rem 0.75rem', height: '36px' }} value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Enter folder name..." autoFocus />
// //                                         <button type="button" className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.8rem' }} onClick={handleCreateFolder}>Save</button>
// //                                         <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ background: 'white', padding: '0.4rem 0.8rem' }} onClick={() => setShowNewFolderInput(false)}>Cancel</button>
// //                                     </div>
// //                                 ) : (
// //                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ background: 'white', padding: '0.5rem 1rem' }} onClick={() => setShowNewFolderInput(true)}>
// //                                         <FolderPlus size={14} /> New Folder
// //                                     </button>
// //                                 )
// //                             )}
// //                         </div>
// //                     </div>
// //                 )}

// //                 {/* ── FOLDERS GRID ── */}
// //                 {view === 'folders' && studioLandingTab === 'adhoc' && (
// //                     isLoadingData ? (
// //                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
// //                             <Loader message='Loading Workspace...' />
// //                         </div>
// //                     ) : (
// //                         <div className="mlab-cohort-grid">
// //                             {showGeneralFolder && (
// //                                 <div className="mlab-cohort-card animate-fade-in">
// //                                     <div className="mlab-cohort-card__header">
// //                                         <h3 className="mlab-cohort-card__name">General Certificates</h3>
// //                                     </div>
// //                                     <div className="mlab-cohort-card__dates">
// //                                         <Calendar size={14} />
// //                                         <span>System Default Folder</span>
// //                                     </div>
// //                                     <div className="mlab-role-row-stack">
// //                                         <div className="mlab-role-row">
// //                                             <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
// //                                             <span className="mlab-role-label">Contents:</span>
// //                                             <span className="mlab-role-name">{myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general').length} Documents</span>
// //                                         </div>
// //                                         <div className="mlab-role-row">
// //                                             <div className="mlab-role-dot mlab-role-dot--green" />
// //                                             <span className="mlab-role-label">Access:</span>
// //                                             <span className="mlab-role-name">System Default Workspace</span>
// //                                         </div>
// //                                     </div>
// //                                     <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16 }}>
// //                                         <button
// //                                             type="button"
// //                                             className="mlab-btn mlab-btn--outline-blue"
// //                                             style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }}
// //                                             onClick={() => handleExportFolderZip({ id: 'general', name: 'General Certificates' })}
// //                                             title="Export ZIP"
// //                                         >
// //                                             <Archive size={13} /> Export ZIP
// //                                         </button>
// //                                         <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
// //                                             Open Folder <ArrowRight size={13} />
// //                                         </button>
// //                                     </div>
// //                                 </div>
// //                             )}

// //                             {filteredFolders.map((group: any) => {
// //                                 const certCount = myAdHocCertificates.filter((c: any) => c.groupId === group.id).length;
// //                                 const isShared = group.collaborators?.length > 0;
// //                                 const createdDate = group.createdAt?.toDate ? new Date(group.createdAt.toDate()).toLocaleDateString('en-ZA') : 'Recently';

// //                                 return (
// //                                     <div key={group.id} className="mlab-cohort-card animate-fade-in" style={{ borderTopColor: 'var(--mlab-green)' }}>
// //                                         <div className="mlab-cohort-card__header">
// //                                             {editingFolderId === group.id ? (
// //                                                 <div style={{ display: 'flex', gap: '5px', alignItems: 'center', width: '100%' }}>
// //                                                     <input className="wm-form-input" style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem', width: '100%', margin: 0 }} autoFocus value={editFolderName} onChange={e => setEditFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(group.id); if (e.key === 'Escape') setEditingFolderId(null); }} />
// //                                                     <button type="button" className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
// //                                                 </div>
// //                                             ) : (
// //                                                 <>
// //                                                     <h3 className="mlab-cohort-card__name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h3>
// //                                                     <div className="mlab-cohort-card__actions">
// //                                                         <button type="button" className="mlab-icon-btn mlab-icon-btn--blue" onClick={(e) => { e.stopPropagation(); setEditingFolderId(group.id); setEditFolderName(group.name); }} title="Rename Folder"><Edit2 size={14} /></button>
// //                                                         <button type="button" className="mlab-icon-btn mlab-icon-btn--amber" onClick={(e) => triggerDeleteFolder(e, group)} title="Delete Folder"><Trash2 size={14} color="#ef4444" /></button>
// //                                                     </div>
// //                                                 </>
// //                                             )}
// //                                         </div>

// //                                         {editingFolderId !== group.id && (
// //                                             <>
// //                                                 <div className="mlab-cohort-card__dates">
// //                                                     <Calendar size={14} />
// //                                                     <span>Created: {createdDate}</span>
// //                                                 </div>

// //                                                 <div className="mlab-role-row-stack">
// //                                                     <div className="mlab-role-row">
// //                                                         <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
// //                                                         <span className="mlab-role-label">Contents:</span>
// //                                                         <span className="mlab-role-name">{certCount} Documents</span>
// //                                                     </div>
// //                                                     <div className="mlab-role-row">
// //                                                         <div className={`mlab-role-dot ${isShared ? 'mlab-role-dot--blue' : 'mlab-role-dot--green'}`} />
// //                                                         <span className="mlab-role-label">Access:</span>
// //                                                         <span className="mlab-role-name">{isShared ? `Shared (${group.collaborators.length})` : 'Private Workspace'}</span>
// //                                                     </div>
// //                                                 </div>

// //                                                 <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16 }}>
// //                                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => { e.stopPropagation(); handleExportFolderZip(group); }} title="Export ZIP Archive">
// //                                                         <Archive size={13} /> ZIP
// //                                                     </button>
// //                                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }} onClick={(e) => { e.stopPropagation(); setShareModalConfig({ isOpen: true, targetId: group.id, targetType: 'folder', targetName: group.name, collaborators: group.collaborators || [] }); }} title="Share Folder">
// //                                                         <UserPlus size={13} /> Share
// //                                                     </button>
// //                                                     <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setActiveFolder(group); setView('inside-folder'); }}>
// //                                                         Open <ArrowRight size={13} />
// //                                                     </button>
// //                                                 </div>
// //                                             </>
// //                                         )}
// //                                     </div>
// //                                 );
// //                             })}

// //                             {filteredFolders.length === 0 && !showGeneralFolder && (
// //                                 <div className="mlab-cohort-empty">
// //                                     <Search size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// //                                     <p className="mlab-cohort-empty__title">No Folders Found</p>
// //                                     <p className="mlab-cohort-empty__desc">Create a folder or adjust your search parameters.</p>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )
// //                 )}

// //                 {/* ── COURSE ASSIGNED TEMPLATES TAB ── */}
// //                 {view === 'folders' && studioLandingTab === 'course_templates' && (
// //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
// //                             <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px', width: '320px' }}>
// //                                 <Search size={15} color="var(--mlab-grey)" />
// //                                 <input
// //                                     type="text"
// //                                     placeholder="Search course templates..."
// //                                     value={templateSearchQuery}
// //                                     onChange={e => setTemplateSearchQuery(e.target.value)}
// //                                     style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
// //                                 />
// //                                 {templateSearchQuery && (
// //                                     <button type="button" onClick={() => setTemplateSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
// //                                         <X size={13} />
// //                                     </button>
// //                                 )}
// //                             </div>

// //                             <button
// //                                 type="button"
// //                                 className="mlab-btn mlab-btn--primary"
// //                                 onClick={() => { resetForm(); setView('studio'); }}
// //                             >
// //                                 <Plus size={14} /> Create Course Template
// //                             </button>
// //                         </div>

// //                         {filteredCourseTemplates.length === 0 ? (
// //                             <div className="mlab-cohort-empty" style={{ background: 'white' }}>
// //                                 <BookOpen size={44} color="#7c3aed" style={{ opacity: 0.5 }} />
// //                                 <p className="mlab-cohort-empty__title">No Course Templates Configured</p>
// //                                 <p className="mlab-cohort-empty__desc">Save a custom template here to make it selectable when launching Cohort Runs.</p>
// //                             </div>
// //                         ) : (
// //                             <div className="mlab-cohort-grid">
// //                                 {filteredCourseTemplates.map((tmpl: any) => {
// //                                     const matchedCourse = systemCourses.find((c: any) => c.id === tmpl.courseId);
// //                                     const linkedTitle = matchedCourse?.title || matchedCourse?.name || tmpl.programmeName || 'General Course Template';

// //                                     return (
// //                                         <div key={tmpl.id} className="mlab-cohort-card animate-fade-in" style={{ borderTop: '4px solid #7c3aed' }}>
// //                                             <div className="mlab-cohort-card__header">
// //                                                 <div>
// //                                                     <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
// //                                                         {tmpl.templateVisual ? `${tmpl.templateVisual.toUpperCase()} TEMPLATE` : 'LUXURY TEMPLATE'}
// //                                                     </span>
// //                                                     <h3 className="mlab-cohort-card__name" style={{ margin: '2px 0 0 0' }}>{tmpl.title || linkedTitle}</h3>
// //                                                 </div>
// //                                             </div>

// //                                             <div className="mlab-cohort-card__dates">
// //                                                 <BookOpen size={14} color="#7c3aed" />
// //                                                 <span>Linked Course: <strong>{linkedTitle}</strong></span>
// //                                             </div>

// //                                             <div className="mlab-role-row-stack">
// //                                                 <div className="mlab-role-row">
// //                                                     <div className="mlab-role-dot" style={{ background: '#7c3aed' }} />
// //                                                     <span className="mlab-role-label">Award Title:</span>
// //                                                     <span className="mlab-role-name">{tmpl.certType || 'Certificate of Competence'}</span>
// //                                                 </div>
// //                                                 <div className="mlab-role-row">
// //                                                     <div className="mlab-role-dot mlab-role-dot--green" />
// //                                                     <span className="mlab-role-label">Signatory:</span>
// //                                                     <span className="mlab-role-name">{tmpl.signatoryName || 'Zakhele Tinga'} ({tmpl.signatoryTitle || 'Academic Manager'})</span>
// //                                                 </div>
// //                                             </div>

// //                                             <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16, paddingTop: '12px', borderTop: '1px solid var(--mlab-border)' }}>
// //                                                 <button
// //                                                     type="button"
// //                                                     className="mlab-btn mlab-btn--outline-blue"
// //                                                     style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem' }}
// //                                                     onClick={() => handleEditTemplate(tmpl)}
// //                                                 >
// //                                                     <Edit3 size={13} /> Edit Design
// //                                                 </button>

// //                                                 <button
// //                                                     type="button"
// //                                                     className="mlab-icon-btn mlab-icon-btn--amber"
// //                                                     onClick={() => handleDeleteTemplate(tmpl.id, tmpl.title || linkedTitle)}
// //                                                     title="Delete Template"
// //                                                 >
// //                                                     <Trash2 size={13} color="#ef4444" />
// //                                                 </button>
// //                                             </div>
// //                                         </div>
// //                                     );
// //                                 })}
// //                             </div>
// //                         )}
// //                     </div>
// //                 )}

// //                 {/* ── CERTIFICATES GRID (INSIDE FOLDER) ── */}
// //                 {view === 'inside-folder' && activeFolder && (
// //                     <>
// //                         {getCertificatesForActiveFolder().length === 0 ? (
// //                             <div className="mlab-cohort-empty" style={{ background: 'white' }}>
// //                                 {certSearchQuery ? <Search size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} /> : <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />}
// //                                 <p className="mlab-cohort-empty__title">{certSearchQuery ? 'No Results Found' : 'Folder is Empty'}</p>
// //                                 <p className="mlab-cohort-empty__desc">{certSearchQuery ? `No certificates match "${certSearchQuery}".` : 'No certificates have been saved to this folder yet.'}</p>
// //                             </div>
// //                         ) : (
// //                             <div className="mlab-cohort-grid">
// //                                 {getCertificatesForActiveFolder().map((cert: any) => {
// //                                     const certVerifyUrl = cert.verifyUrl || `${getBaseUrl()}/verify/${cert.verificationCode}`;

// //                                     return (
// //                                         <div key={cert.id} className="mlab-cohort-card animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
// //                                             <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
// //                                                 <Award size={48} color="rgba(255,255,255,0.1)" />
// //                                                 <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
// //                                                     {cert.blockchainStatus === 'anchored' && (
// //                                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#10b981', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={`Tx: ${cert.blockchainTxHash || 'On-chain'}`}>
// //                                                             <ShieldCheck size={10} /> Anchored
// //                                                         </span>
// //                                                     )}
// //                                                     {cert.emailStatus === 'failed' && (
// //                                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#ef4444', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={cert.emailError || "Email delivery failed"}>
// //                                                             <AlertCircle size={10} /> Send Failed
// //                                                         </span>
// //                                                     )}
// //                                                     {cert.isEmailed && (
// //                                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: 'var(--mlab-green)', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={`Emailed to ${cert.recipientEmail}`}>
// //                                                             <Mail size={10} /> Sent
// //                                                         </span>
// //                                                     )}
// //                                                     <span style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>PDF</span>
// //                                                 </div>
// //                                             </div>
// //                                             <div style={{ padding: '1.25rem' }}>
// //                                                 <div className="mlab-cohort-card__header">
// //                                                     <h3 className="mlab-cohort-card__name">{cert.recipientName}</h3>
// //                                                 </div>
// //                                                 <div className="mlab-cohort-card__dates" style={{ marginBottom: '10px' }}>
// //                                                     <Award size={14} />
// //                                                     <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cert.courseName}</span>
// //                                                 </div>

// //                                                 <div className="mlab-role-row-stack">
// //                                                     <div className="mlab-role-row">
// //                                                         <div className="mlab-role-dot mlab-role-dot--green" />
// //                                                         <span className="mlab-role-label">Type:</span>
// //                                                         <span className="mlab-role-name">{cert.type}</span>
// //                                                     </div>
// //                                                     <div className="mlab-role-row">
// //                                                         <div className="mlab-role-dot mlab-role-dot--blue" />
// //                                                         <span className="mlab-role-label">Issued:</span>
// //                                                         <span className="mlab-role-name">{cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString() : cert.issueDate}</span>
// //                                                     </div>
// //                                                 </div>

// //                                                 <div style={{ display: 'flex', width: '100%', flexDirection: 'column', gap: '8px', marginTop: 16 }}>
// //                                                     <div style={{ display: 'flex', gap: '8px' }}>
// //                                                         <button
// //                                                             type="button"
// //                                                             className="mlab-btn mlab-btn--outline-blue"
// //                                                             style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }}
// //                                                             onClick={() => setShareModalConfig({
// //                                                                 isOpen: true,
// //                                                                 targetId: cert.id,
// //                                                                 targetType: 'certificate',
// //                                                                 targetName: cert.recipientName,
// //                                                                 collaborators: cert.collaborators || [],
// //                                                                 verifyUrl: certVerifyUrl
// //                                                             })}
// //                                                         >
// //                                                             <UserPlus size={13} /> Share
// //                                                         </button>
// //                                                         <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.open(cert.pdfUrl, '_blank')}>
// //                                                             View / Print <ArrowRight size={13} />
// //                                                         </button>
// //                                                     </div>

// //                                                     {/* ON-DEMAND BLOCKCHAIN MINT BUTTON FOR EXISTING CERTS */}
// //                                                     {cert.blockchainStatus !== 'anchored' ? (
// //                                                         <button
// //                                                             type="button"
// //                                                             className="mlab-btn mlab-btn--primary"
// //                                                             style={{ width: '100%', padding: '0.45rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)' }}
// //                                                             disabled={mintingCertId === cert.id}
// //                                                             onClick={() => handleMintExistingCertificate(cert)}
// //                                                         >
// //                                                             {mintingCertId === cert.id ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={13} />}
// //                                                             {mintingCertId === cert.id ? "Anchoring to Blockchain..." : "Issue to Blockchain"}
// //                                                         </button>
// //                                                     ) : (
// //                                                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.4rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>
// //                                                             <ShieldCheck size={13} color="#16a34a" /> Secured on Blockchain
// //                                                         </div>
// //                                                     )}
// //                                                 </div>
// //                                             </div>
// //                                         </div>
// //                                     );
// //                                 })}
// //                             </div>
// //                         )}
// //                     </>
// //                 )}

// //                 {/* ── STUDIO & BULK REVIEW VIEWS ── */}
// //                 {isStudioView && (
// //                     <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, overflow: 'hidden', flexDirection: 'column' }}>

// //                         {/* Bulk Controls Header */}
// //                         {view === 'bulk-review' && (
// //                             <div style={{ display: 'flex', alignItems: 'center', background: 'white', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', gap: '1rem', flexShrink: 0, flexWrap: 'wrap' }}>
// //                                 <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ color: 'var(--mlab-red)', borderColor: 'var(--mlab-red)' }} onClick={() => { setBulkData([]); setView('folders'); }}>
// //                                     <X size={14} /> Cancel Bulk Operation
// //                                 </button>

// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 auto', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
// //                                     <button
// //                                         type="button"
// //                                         className="mlab-icon-btn"
// //                                         disabled={bulkCurrentIndex === 0}
// //                                         onClick={() => setBulkCurrentIndex(p => Math.max(0, p - 1))}
// //                                         style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// //                                     >
// //                                         <ChevronLeft color='var(--mlab-midnight)' size={18} />
// //                                     </button>
// //                                     <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-midnight)', minWidth: '150px', textAlign: 'center' }}>
// //                                         Preview {bulkCurrentIndex + 1} of {bulkData.length}
// //                                     </span>
// //                                     <button
// //                                         type="button"
// //                                         className="mlab-icon-btn"
// //                                         disabled={bulkCurrentIndex === bulkData.length - 1}
// //                                         onClick={() => setBulkCurrentIndex(p => Math.min(bulkData.length - 1, p + 1))}
// //                                         style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// //                                     >
// //                                         <ChevronRight color='var(--mlab-midnight)' size={18} />
// //                                     </button>
// //                                 </div>

// //                                 <button type="button" className="mlab-btn mlab-btn--primary" onClick={executeFinalBulkProcessing}>
// //                                     <Send size={14} /> Approve & Process All ({bulkData.length})
// //                                 </button>
// //                             </div>
// //                         )}

// //                         {/* Two-pane editor: [ scrolling controls | fixed playground ] */}
// //                         <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>

// //                             {/* 🚀 LEFT PANEL: the ONLY thing that scrolls */}
// //                             <aside style={{ width: '360px', flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
// //                                 <div style={{ flexShrink: 0, padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--mlab-border)', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
// //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-midnight)' }}>
// //                                         {view === 'bulk-review' ? `Editing ${bulkCurrentIndex + 1} of ${bulkData.length}` : editingTemplateId ? 'Edit Template' : 'Design Settings'}
// //                                     </span>
// //                                     <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Live preview →</span>
// //                                 </div>

// //                                 <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
// //                                     {view === 'bulk-review' && (
// //                                         <div style={{ background: applyBulkEditsToAll ? '#eff6ff' : '#f8fafc', padding: '12px', borderRadius: '8px', border: `1px solid ${applyBulkEditsToAll ? '#bfdbfe' : '#e2e8f0'}`, transition: 'all 0.2s' }}>
// //                                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--mlab-blue)', fontSize: '0.85rem', margin: 0 }}>
// //                                                 <input
// //                                                     type="checkbox"
// //                                                     checked={applyBulkEditsToAll}
// //                                                     onChange={e => setApplyBulkEditsToAll(e.target.checked)}
// //                                                     style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
// //                                                 />
// //                                                 Apply edits to ALL certificates
// //                                             </label>
// //                                             <p style={{ margin: '6px 0 0 24px', fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: 1.4 }}>
// //                                                 When checked, changing the template, course, or signature will instantly update all <strong>{bulkData.length}</strong> certificates.
// //                                             </p>
// //                                         </div>
// //                                     )}

// //                                     <FormSection title="Design Template" icon={Layers}>
// //                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.template} onChange={e => handleChange('template', e.target.value)}><option value="luxury">Luxury (Default)</option><option value="official">Official Statement (SoR)</option><option value="modern">Modern Minimalist</option></select>
// //                                     </FormSection>

// //                                     <FormSection title="Course & Content Linkage" icon={BookOpen}>
// //                                         <select
// //                                             className="wm-form-input"
// //                                             style={{ margin: 0 }}
// //                                             value={certData.courseId}
// //                                             onChange={e => {
// //                                                 const selectedId = e.target.value;
// //                                                 const matchedCourse = systemCourses.find((c: any) => c.id === selectedId);
// //                                                 const nextProgramme = matchedCourse?.title || matchedCourse?.name || certData.programme;
// //                                                 handleChange('courseId', selectedId);
// //                                                 handleChange('programme', nextProgramme);
// //                                             }}
// //                                         >
// //                                             <option value="">-- Custom / Ad-Hoc (No Course Link) --</option>
// //                                             {(systemCourses || []).map((course: any) => (
// //                                                 <option key={course.id} value={course.id}>{course.title || course.name}</option>
// //                                             ))}
// //                                         </select>
// //                                     </FormSection>

// //                                     <FormSection title="Folder Assignment" icon={Folder}>
// //                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}><option value="general">General (No Folder)</option>{(myCertificateGroups || []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}</select>
// //                                     </FormSection>

// //                                     <FormSection title="Recipient Details" icon={UserCircle}>
// //                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
// //                                         <input className="wm-form-input" style={{ margin: 0 }} type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
// //                                     </FormSection>

// //                                     <FormSection title="Award Details" icon={FileCheck}>
// //                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}><option value="Achievement">Certificate of Achievement</option><option value="Attendance">Certificate of Attendance</option><option value="Appreciation">Certificate of Appreciation</option><option value="Excellence">Award of Excellence</option><option value="Other">Custom Title...</option></select>
// //                                         {certData.certType === 'Other' && <input className="wm-form-input" style={{ margin: 0 }} placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />}
// //                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
// //                                         <textarea className="wm-form-input" style={{ margin: 0, minHeight: '60px' }} placeholder="Description..." value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
// //                                     </FormSection>

// //                                     <FormSection title="Branding & Verification" icon={Building2}>
// //                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
// //                                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
// //                                             <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
// //                                             <input className="wm-form-input" style={{ margin: 0 }} type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
// //                                         </div>
// //                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />

// //                                         {/* QR CODE TOGGLE CHECKBOX */}
// //                                         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', marginTop: '0.5rem', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// //                                             <input
// //                                                 type="checkbox"
// //                                                 checked={certData.showQrCode !== false}
// //                                                 onChange={e => handleChange('showQrCode', e.target.checked)}
// //                                                 style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
// //                                             />
// //                                             <QrCode size={16} color="var(--mlab-blue)" /> Include Verification QR Code
// //                                         </label>

// //                                         <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
// //                                             <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}><ImageIcon size={14} /> Change Logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} /></label>
// //                                             <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}><ImageIcon size={14} /> Change Signature<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} /></label>
// //                                         </div>
// //                                     </FormSection>
// //                                 </div>
// //                             </aside>

// //                             {/* 🚀 RIGHT: FIXED PLAYGROUND — never scrolls, always fits the free space, certificate centred */}
// //                             <div
// //                                 ref={previewContainerRef}
// //                                 onMouseDown={handleCanvasMouseDown}
// //                                 onMouseMove={handleCanvasMouseMove}
// //                                 onMouseUp={handleCanvasMouseUp}
// //                                 onMouseLeave={handleCanvasMouseUp}
// //                                 style={{
// //                                     flex: 1,
// //                                     minHeight: 0,
// //                                     minWidth: 0,
// //                                     position: 'relative',
// //                                     borderRadius: '8px',
// //                                     border: '1px solid var(--mlab-border)',
// //                                     overflow: 'hidden',
// //                                     cursor: isPanning ? 'grabbing' : 'grab',
// //                                     userSelect: 'none',
// //                                     overscrollBehavior: 'contain',
// //                                     touchAction: 'none',
// //                                     ...canvasBackdrop
// //                                 }}
// //                             >
// //                                 {/* Floating zoom bar (bottom centre, Canva-style) */}
// //                                 <div
// //                                     onMouseDown={stopCanvasEvent}
// //                                     onMouseMove={stopCanvasEvent}
// //                                     style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.96)', padding: '0.35rem 0.5rem', borderRadius: '999px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.35)', zIndex: 100, backdropFilter: 'blur(4px)', cursor: 'default' }}
// //                                 >
// //                                     <button type="button" className="mlab-icon-btn" onClick={handleZoomOut} disabled={isBulkGenerating} title="Zoom out (Ctrl + scroll down)"><ZoomOut size={15} color='var(--mlab-blue)' /></button>
// //                                     <span style={{ minWidth: '48px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.8rem', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
// //                                     <button type="button" className="mlab-icon-btn" onClick={handleZoomIn} disabled={isBulkGenerating} title="Zoom in (Ctrl + scroll up)"><ZoomIn size={15} color='var(--mlab-blue)' /></button>
// //                                     <span style={{ width: '1px', height: '18px', background: '#e2e8f0', margin: '0 4px' }} />
// //                                     <button type="button" className="mlab-icon-btn mlab-icon-btn--blue" onClick={handleFitToScreen} disabled={isBulkGenerating} title="Fit to screen"><Maximize2 size={15} /></button>
// //                                     <button type="button" className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetViewport} disabled={isBulkGenerating} title="Actual size (100%)"><RotateCcw size={15} /></button>
// //                                 </div>

// //                                 {/* Gesture hint */}
// //                                 <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.75)', color: '#cbd5e1', padding: '6px 12px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, backdropFilter: 'blur(4px)', zIndex: 100, pointerEvents: 'none' }}>
// //                                     <Move size={12} color="#38bdf8" /> Drag or scroll to pan · Ctrl + scroll to zoom
// //                                 </div>

// //                                 {view === 'bulk-review' && certData.recipientEmail && bulkSendEmails && (
// //                                     <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #bbf7d0', zIndex: 100, pointerEvents: 'none' }}>
// //                                         <Mail size={14} /> Will be emailed to: {certData.recipientEmail}
// //                                     </div>
// //                                 )}

// //                                 {/* Certificate is pinned to the exact centre of the playground with absolute
// //                                     positioning, so it stays centred at any zoom and never affects layout size. */}
// //                                 <div
// //                                     data-cert-canvas="true"
// //                                     className="cert-canvas"
// //                                     ref={certRef}
// //                                     style={{
// //                                         position: 'absolute',
// //                                         left: '50%',
// //                                         top: '50%',
// //                                         width: `${CERT_WIDTH}px`,
// //                                         height: `${CERT_HEIGHT}px`,
// //                                         marginLeft: `${-CERT_WIDTH / 2}px`,
// //                                         marginTop: `${-CERT_HEIGHT / 2}px`,
// //                                         flex: 'none',
// //                                         transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
// //                                         transformOrigin: 'center center',
// //                                         transition: isPanning ? 'none' : 'transform 0.12s ease-out',
// //                                         boxShadow: '0 25px 50px -12px rgba(0,0,0,0.55)',
// //                                         backgroundColor: '#fff',
// //                                         overflow: 'hidden',
// //                                         willChange: 'transform'
// //                                     }}
// //                                 >
// //                                     {certData.template === 'luxury' && <LuxuryTemplate data={certData} finalType={finalCertType} />}
// //                                     {certData.template === 'official' && <OfficialTemplate data={certData} finalType={finalCertType} />}
// //                                     {certData.template === 'modern' && <ModernTemplate data={certData} finalType={finalCertType} />}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 )}
// //             </div>
// //         </div>
// //     );
// // };




// // // // src/pages/AdminDashboard/CertificateStudio/CertificateStudio.tsx

// // // import React, { useState, useRef, useEffect, useCallback } from 'react';
// // // import { createPortal } from 'react-dom';
// // // import { useLocation, useNavigate } from 'react-router-dom';
// // // import {
// // //     Award, Loader2, Download, FileCheck, ZoomIn, ZoomOut, RotateCcw,
// // //     Mail, Building2, UserCircle, Image as ImageIcon, Plus, ArrowLeft,
// // //     FileText, X, Folder, FolderPlus, Edit2, Layers,
// // //     UploadCloud, CheckCircle, UserPlus, Search, Trash2,
// // //     ChevronLeft, ChevronRight, Send, Calendar, ArrowRight, AlertCircle, Save, BookOpen, Edit3, Sparkles
// // // } from 'lucide-react';
// // // import { collection, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, doc, arrayUnion, getDocs, query, where } from 'firebase/firestore';
// // // import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // import html2canvas from 'html2canvas';
// // // import jsPDF from 'jspdf';
// // // import * as XLSX from 'xlsx';
// // // import { useStore } from '../../../store/useStore';
// // // import { useToast } from '../../../components/common/Toast/Toast';
// // // import { db } from '../../../lib/firebase';
// // // import { StatusModal } from '../../../components/common/StatusModal/StatusModal';

// // // // ── Import the separated templates ───────────────────────────────────────────
// // // import { LuxuryTemplate, OfficialTemplate, ModernTemplate } from './CertificateTemplates';

// // // // ── CSS imports ──────────────────────────────────────────────────────────────
// // // import '../../../components/common/CertificateGenerator/CertificateGenerator.css';
// // // import '../../../components/views/LearnersView/LearnersView.css';
// // // import '../../CohortDetails/CohortDetailsPage.css';
// // // import '../AdminDashboard.css';
// // // import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
// // // import '../../../components/views/CohortsView/CohortsView.css';

// // // import mLabLogo from '../../../assets/logo/mlab_logo.png';
// // // import defaultSignature from '../../../assets/Signatue_Zack_.png';
// // // import Loader from '../../../components/common/Loader/Loader';

// // // // ── Helper: FormSection ──────────────────────────────────────────────────────
// // // const FormSection = ({ title, icon: Icon, children }: any) => (
// // //     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1.5rem', borderBottom: '1px dashed #e2e8f0' }}>
// // //         <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // //             <Icon size={16} /> {title}
// // //         </h3>
// // //         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// // //             {children}
// // //         </div>
// // //     </div>
// // // );

// // // // ── SHARE MODAL ──────────────────────────────────────────────────────────────
// // // const ShareModal: React.FC<{
// // //     isOpen: boolean;
// // //     onClose: () => void;
// // //     targetId: string;
// // //     targetType: 'folder' | 'certificate';
// // //     targetName: string;
// // //     initialCollaborators: string[];
// // //     onSave: (id: string, type: 'folder' | 'certificate', collabs: string[]) => Promise<void>;
// // // }> = ({ isOpen, onClose, targetId, targetType, targetName, initialCollaborators, onSave }) => {
// // //     const { staff = [] } = useStore() as any;
// // //     const [emails, setEmails] = useState<string[]>(initialCollaborators || []);
// // //     const [inputValue, setInputValue] = useState('');
// // //     const [isSaving, setIsSaving] = useState(false);

// // //     const handleAdd = () => {
// // //         const cleanEmail = inputValue.trim().toLowerCase();
// // //         if (cleanEmail && !emails.includes(cleanEmail)) {
// // //             setEmails([...emails, cleanEmail]);
// // //             setInputValue('');
// // //         }
// // //     };

// // //     const handleRemove = (email: string) => {
// // //         setEmails(emails.filter((e: string) => e !== email));
// // //     };

// // //     const handleSave = async () => {
// // //         setIsSaving(true);
// // //         await onSave(targetId, targetType, emails);
// // //         setIsSaving(false);
// // //         onClose();
// // //     };

// // //     if (!isOpen) return null;

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
// // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><UserPlus size={20} /></div>
// // //                     <div>
// // //                         <h2 className="wm-modal__title">Share {targetType === 'folder' ? 'Folder' : 'Certificate'}</h2>
// // //                         <p className="wm-modal__subtitle">Manage access for "{targetName}"</p>
// // //                     </div>
// // //                     <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// // //                 </div>
// // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// // //                     <div>
// // //                         <label className="wm-form-label">Add Collaborator (Email)</label>
// // //                         <div style={{ display: 'flex', gap: '8px' }}>
// // //                             <input
// // //                                 type="email"
// // //                                 className="wm-form-input"
// // //                                 style={{ margin: 0, flex: 1 }}
// // //                                 placeholder="Search staff name or email..."
// // //                                 value={inputValue}
// // //                                 onChange={e => setInputValue(e.target.value)}
// // //                                 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
// // //                                 list="staff-emails"
// // //                             />
// // //                             <datalist id="staff-emails">
// // //                                 {staff.map((s: any) => s.email && (
// // //                                     <option key={s.id || s.email} value={s.email}>
// // //                                         {s.fullName} ({s.role})
// // //                                     </option>
// // //                                 ))}
// // //                             </datalist>
// // //                             <button type="button" className="mlab-btn mlab-btn--outline-blue" onClick={handleAdd}>Add</button>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
// // //                         <label className="wm-form-label">Current Collaborators ({emails.length})</label>
// // //                         {emails.length === 0 ? (
// // //                             <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontStyle: 'italic', margin: '0.5rem 0' }}>No external collaborators added. Only you can view this.</p>
// // //                         ) : (
// // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
// // //                                 {emails.map((email: string) => (
// // //                                     <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
// // //                                         <span style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{email}</span>
// // //                                         <button type="button" className="mlab-icon-btn" style={{ border: 'none', background: 'transparent', padding: 0 }} onClick={() => handleRemove(email)}>
// // //                                             <Trash2 size={14} color="#ef4444" />
// // //                                         </button>
// // //                                     </div>
// // //                                 ))}
// // //                             </div>
// // //                         )}
// // //                     </div>
// // //                 </div>
// // //                 <div className="wm-modal__footer">
// // //                     <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button>
// // //                     <button type="button" className="mlab-btn mlab-btn--primary" onClick={handleSave} disabled={isSaving}>
// // //                         {isSaving ? <Loader2 size={14} className="spin" /> : 'Save Access Control'}
// // //                     </button>
// // //                 </div>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // // ── BULK GENERATOR MODAL ────────────────────────────────────────────────────
// // // const BulkGeneratorModal: React.FC<{
// // //     certificateGroups: any[],
// // //     courses: any[],
// // //     onClose: () => void,
// // //     onStart: (rows: any[], settings: any, sendEmails: boolean) => void,
// // //     onCreateFolder: (name: string) => Promise<string | null>
// // // }> = ({ certificateGroups = [], courses = [], onClose, onStart, onCreateFolder }) => {

// // //     const [parsedData, setParsedData] = useState<any[]>([]);
// // //     const [fileError, setFileError] = useState('');
// // //     const [sendEmails, setSendEmails] = useState(false);

// // //     const [isCreatingFolder, setIsCreatingFolder] = useState(false);
// // //     const [isSavingFolder, setIsSavingFolder] = useState(false);
// // //     const [newFolderName, setNewFolderName] = useState('');

// // //     const [settings, setSettings] = useState({
// // //         template: 'luxury',
// // //         groupId: 'general',
// // //         courseId: '',
// // //         certType: 'Achievement',
// // //         programme: '',
// // //         description: 'has demonstrated exceptional skills and outstanding performance in',
// // //         issueDate: new Date().toISOString().split('T')[0]
// // //     });

// // //     const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;

// // //         const reader = new FileReader();
// // //         reader.onload = (evt) => {
// // //             try {
// // //                 const bstr = evt.target?.result;
// // //                 const wb = XLSX.read(bstr, { type: 'binary' });
// // //                 const wsname = wb.SheetNames[0];
// // //                 const ws = wb.Sheets[wsname];
// // //                 const data = XLSX.utils.sheet_to_json(ws);

// // //                 if (data.length === 0) {
// // //                     setFileError("The uploaded spreadsheet is empty.");
// // //                     return;
// // //                 }

// // //                 const sample = data[0] as any;
// // //                 const hasName = ('Name' in sample) || ('name' in sample) || ('Full Name' in sample) || ('Recipient' in sample);

// // //                 if (!hasName) {
// // //                     setFileError("Spreadsheet missing a recognizable 'Name' column. Please use a column header like 'Name' or 'Full Name'.");
// // //                     return;
// // //                 }

// // //                 setFileError('');
// // //                 setParsedData(data);

// // //             } catch (err) {
// // //                 setFileError("Failed to parse the file. Ensure it is a valid .csv or .xlsx.");
// // //             }
// // //         };
// // //         reader.readAsBinaryString(file);
// // //     };

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// // //                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// // //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Layers size={20} /></div>
// // //                     <div>
// // //                         <h2 className="wm-modal__title">Bulk Generate Certificates</h2>
// // //                         <p className="wm-modal__subtitle">Upload a spreadsheet to automate design and distribution.</p>
// // //                     </div>
// // //                     <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// // //                 </div>

// // //                 <div className="wm-modal__body">

// // //                     {parsedData.length === 0 ? (
// // //                         <div style={{ border: '2px dashed #cbd5e1', padding: '3rem 2rem', textAlign: 'center', borderRadius: '8px', background: '#f8fafc' }}>
// // //                             <UploadCloud size={48} color="#94a3b8" style={{ margin: '0 auto 1rem' }} />
// // //                             <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1rem' }}>Upload Document Template</h3>
// // //                             <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.85rem' }}>Must contain a "Name" column. Optionally include "Email" or "Course". (.csv or .xlsx)</p>
// // //                             <label className="mlab-btn mlab-btn--primary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
// // //                                 Browse Files
// // //                                 <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} />
// // //                             </label>
// // //                             {fileError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '1rem', fontWeight: 500 }}>{fileError}</p>}
// // //                         </div>
// // //                     ) : (
// // //                         <div className="wm-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
// // //                                 <CheckCircle size={24} color="#16a34a" />
// // //                                 <div>
// // //                                     <h4 style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>Spreadsheet Verified!</h4>
// // //                                     <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '0.75rem' }}>Successfully extracted <strong>{parsedData.length} records.</strong></p>
// // //                                 </div>
// // //                                 <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ marginLeft: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setParsedData([])}>Change File</button>
// // //                             </div>

// // //                             <div className="wm-form-section">
// // //                                 <div className="wm-form-section__label"><Layers size={12} /> Default Certificate Settings</div>
// // //                                 <div className="wm-form-grid">
// // //                                     <div className="wm-form-group wm-form-group--full">
// // //                                         <label className="wm-form-label">Visual Template</label>
// // //                                         <select className="wm-form-input" value={settings.template} onChange={e => setSettings(s => ({ ...s, template: e.target.value }))}>
// // //                                             <option value="luxury">Luxury Classic</option>
// // //                                             <option value="official">Official Statement (SoR)</option>
// // //                                             <option value="modern">Modern Minimalist</option>
// // //                                         </select>
// // //                                     </div>

// // //                                     <div className="wm-form-group wm-form-group--full">
// // //                                         <label className="wm-form-label">Save To Folder</label>
// // //                                         {isCreatingFolder ? (
// // //                                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// // //                                                 <input
// // //                                                     className="wm-form-input"
// // //                                                     autoFocus
// // //                                                     placeholder="New folder name..."
// // //                                                     value={newFolderName}
// // //                                                     onChange={e => setNewFolderName(e.target.value)}
// // //                                                     disabled={isSavingFolder}
// // //                                                     onKeyDown={async (e) => {
// // //                                                         if (e.key === 'Enter') {
// // //                                                             e.preventDefault();
// // //                                                             if (!newFolderName.trim()) return;
// // //                                                             setIsSavingFolder(true);
// // //                                                             const newId = await onCreateFolder(newFolderName.trim());
// // //                                                             if (newId) {
// // //                                                                 setSettings(s => ({ ...s, groupId: newId }));
// // //                                                                 setIsCreatingFolder(false);
// // //                                                                 setNewFolderName('');
// // //                                                             }
// // //                                                             setIsSavingFolder(false);
// // //                                                         }
// // //                                                     }}
// // //                                                 />
// // //                                                 <button type="button" className="mlab-btn mlab-btn--primary" style={{ padding: '0.4rem 0.6rem' }} disabled={isSavingFolder} onClick={async () => {
// // //                                                     if (!newFolderName.trim()) return;
// // //                                                     setIsSavingFolder(true);
// // //                                                     const newId = await onCreateFolder(newFolderName.trim());
// // //                                                     if (newId) {
// // //                                                         setSettings(s => ({ ...s, groupId: newId }));
// // //                                                         setIsCreatingFolder(false);
// // //                                                         setNewFolderName('');
// // //                                                     }
// // //                                                     setIsSavingFolder(false);
// // //                                                 }}>
// // //                                                     {isSavingFolder ? <Loader2 size={14} className="spin" /> : 'Save'}
// // //                                                 </button>
// // //                                                 <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ padding: '0.4rem 0.6rem' }} disabled={isSavingFolder} onClick={() => setIsCreatingFolder(false)}>Cancel</button>
// // //                                             </div>
// // //                                         ) : (
// // //                                             <select className="wm-form-input" value={settings.groupId} onChange={e => {
// // //                                                 if (e.target.value === 'create_new') {
// // //                                                     setIsCreatingFolder(true);
// // //                                                 } else {
// // //                                                     setSettings(s => ({ ...s, groupId: e.target.value }));
// // //                                                 }
// // //                                             }}>
// // //                                                 <option value="general">General (No Folder)</option>
// // //                                                 {(certificateGroups || []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}

// // //                                                 {settings.groupId !== 'general' && !certificateGroups.find((g: any) => g.id === settings.groupId) && (
// // //                                                     <option value={settings.groupId}>{newFolderName || 'New Folder...'}</option>
// // //                                                 )}

// // //                                                 <option value="create_new" style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>➕ Create New Folder...</option>
// // //                                             </select>
// // //                                         )}
// // //                                     </div>

// // //                                     <div className="wm-form-group wm-form-group--full">
// // //                                         <label className="wm-form-label">Link System Course / Qualification</label>
// // //                                         <select
// // //                                             className="wm-form-input"
// // //                                             value={settings.courseId}
// // //                                             onChange={e => {
// // //                                                 const cid = e.target.value;
// // //                                                 const matchedCourse = courses.find((c: any) => c.id === cid);
// // //                                                 setSettings(s => ({
// // //                                                     ...s,
// // //                                                     courseId: cid,
// // //                                                     programme: matchedCourse?.title || matchedCourse?.name || s.programme
// // //                                                 }));
// // //                                             }}
// // //                                         >
// // //                                             <option value="">-- Custom / Unlinked --</option>
// // //                                             {(courses || []).map((c: any) => (
// // //                                                 <option key={c.id} value={c.id}>{c.title || c.name}</option>
// // //                                             ))}
// // //                                         </select>
// // //                                     </div>

// // //                                     <div className="wm-form-group wm-form-group--full">
// // //                                         <label className="wm-form-label">Award Title</label>
// // //                                         <select className="wm-form-input" value={settings.certType} onChange={e => setSettings(s => ({ ...s, certType: e.target.value }))}>
// // //                                             <option value="Achievement">Certificate of Achievement</option>
// // //                                             <option value="Attendance">Certificate of Attendance</option>
// // //                                             <option value="Excellence">Award of Excellence</option>
// // //                                             <option value="Participation">Certificate of Participation</option>
// // //                                         </select>
// // //                                     </div>
// // //                                     <div className="wm-form-group wm-form-group--full">
// // //                                         <label className="wm-form-label">Default Course/Programme Name (Overridden if spreadsheet has 'Course' column)</label>
// // //                                         <input className="wm-form-input" placeholder="e.g. Advanced AI Bootcamp" value={settings.programme} onChange={e => setSettings(s => ({ ...s, programme: e.target.value }))} />
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// // //                                 <input type="checkbox" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
// // //                                 Automatically email to recipients
// // //                                 <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>(Requires 'Email' column in spreadsheet)</span>
// // //                             </label>

// // //                         </div>
// // //                     )}

// // //                 </div>
// // //                 <div className="wm-modal__footer">
// // //                     <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button>
// // //                     <button
// // //                         type="button"
// // //                         className="mlab-btn mlab-btn--primary"
// // //                         disabled={parsedData.length === 0 || isCreatingFolder}
// // //                         onClick={() => onStart(parsedData, settings, sendEmails)}
// // //                     >
// // //                         {isCreatingFolder ? "Save Folder First..." : `Stage & Review (${parsedData.length})`}
// // //                     </button>
// // //                 </div>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // // ── MAIN CERTIFICATE STUDIO COMPONENT ──────────────────────────────────────
// // // export const CertificateStudio: React.FC = () => {
// // //     const location = useLocation();
// // //     const navigate = useNavigate();

// // //     const {
// // //         settings, user, adHocCertificates = [], certificateGroups = [],
// // //         fetchAdHocCertificates, fetchCertificateGroups, createCertificateGroup,
// // //         renameCertificateGroup, fetchSettings, cohorts = []
// // //     } = useStore() as any;

// // //     const toast = useToast();

// // //     // Intercept target learner passed in route state
// // //     const targetLearner = location.state?.learner;

// // //     // DUAL LANDING TAB STATE
// // //     const [studioLandingTab, setStudioLandingTab] = useState<'adhoc' | 'course_templates'>('adhoc');

// // //     // ─── VIEW & LAYOUT STATE ───
// // //     const [view, setView] = useState<'folders' | 'inside-folder' | 'studio' | 'bulk-review'>('folders');
// // //     const [activeFolder, setActiveFolder] = useState<any>(null);
// // //     const [isLoadingData, setIsLoadingData] = useState(adHocCertificates.length === 0 && certificateGroups.length === 0);

// // //     const [showNewFolderInput, setShowNewFolderInput] = useState(false);
// // //     const [newFolderName, setNewFolderName] = useState('');
// // //     const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
// // //     const [editFolderName, setEditFolderName] = useState('');

// // //     const [folderSearchQuery, setFolderSearchQuery] = useState('');
// // //     const [certSearchQuery, setCertSearchQuery] = useState('');
// // //     const [templateSearchQuery, setTemplateSearchQuery] = useState('');
// // //     const [folderToDelete, setFolderToDelete] = useState<any>(null);

// // //     // SYSTEM COURSES & SAVED COURSE TEMPLATES
// // //     const [systemCourses, setSystemCourses] = useState<any[]>([]);
// // //     const [courseTemplates, setCourseTemplates] = useState<any[]>([]);
// // //     const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
// // //     const [isSavingTemplate, setIsSavingTemplate] = useState(false);

// // //     // ─── SHARE MODAL STATE ───
// // //     const [shareModalConfig, setShareModalConfig] = useState<{
// // //         isOpen: boolean;
// // //         targetId: string;
// // //         targetType: 'folder' | 'certificate';
// // //         targetName: string;
// // //         collaborators: string[];
// // //     }>({ isOpen: false, targetId: '', targetType: 'folder', targetName: '', collaborators: [] });

// // //     const [certData, setCertData] = useState({
// // //         template: 'luxury',
// // //         recipientName: '', recipientEmail: '', certType: 'Achievement', customType: '',
// // //         description: 'has demonstrated exceptional skills and outstanding performance in',
// // //         programme: 'Advanced Leadership Workshop', institutionName: 'mLab Southern Africa',
// // //         issueDate: new Date().toISOString().split('T')[0], signatoryName: 'Zakhele Tinga',
// // //         signatoryTitle: 'Academic Manager', logoUrl: mLabLogo, sigUrl: defaultSignature,
// // //         groupId: 'general',
// // //         courseId: '',
// // //         containerId: ''
// // //     });

// // //     const [isGenerating, setIsGenerating] = useState(false);
// // //     const [actionType, setActionType] = useState<'download' | 'email'>('download');
// // //     const [zoom, setZoom] = useState(0.65);
// // //     const certRef = useRef<HTMLDivElement>(null);

// // //     // ─── BULK GENERATOR STATE ───
// // //     const [showBulkModal, setShowBulkModal] = useState(false);
// // //     const [isBulkGenerating, setIsBulkGenerating] = useState(false);
// // //     const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

// // //     const [bulkData, setBulkData] = useState<any[]>([]);
// // //     const [bulkSettings, setBulkSettings] = useState<any>(null);
// // //     const [bulkSendEmails, setBulkSendEmails] = useState(false);
// // //     const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
// // //     const [applyBulkEditsToAll, setApplyBulkEditsToAll] = useState(false);

// // //     // Fetch system courses and saved course certificate templates safely
// // //     const fetchStudioDatasets = useCallback(async () => {
// // //         // 1. Fetch system courses / content packages
// // //         try {
// // //             const coursesSnap = await getDocs(collection(db, 'content_packages'));
// // //             setSystemCourses(coursesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
// // //         } catch (err: any) {
// // //             console.warn("Could not load content_packages directly from Firestore:", err?.message || err);
// // //             if (cohorts && cohorts.length > 0) {
// // //                 setSystemCourses(cohorts);
// // //             }
// // //         }

// // //         // 2. Fetch certificate templates
// // //         try {
// // //             const templatesSnap = await getDocs(collection(db, 'certificate_templates'));
// // //             setCourseTemplates(templatesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
// // //         } catch (err: any) {
// // //             console.warn("Could not load certificate_templates from Firestore (check rules or create collection):", err?.message || err);
// // //             setCourseTemplates([]);
// // //         }
// // //     }, [cohorts]);

// // //     useEffect(() => {
// // //         fetchStudioDatasets();
// // //     }, [fetchStudioDatasets]);

// // //     // ROUTE INTERCEPTOR: Pre-fill studio when learner state is passed
// // //     useEffect(() => {
// // //         if (targetLearner) {
// // //             setCertData(prev => ({
// // //                 ...prev,
// // //                 recipientName: targetLearner.fullName || targetLearner.name || '',
// // //                 recipientEmail: targetLearner.email || '',
// // //                 programme: targetLearner.qualification?.name || targetLearner.programmeName || prev.programme,
// // //                 certType: 'Competence',
// // //             }));
// // //             setView('studio');
// // //         }
// // //     }, [targetLearner]);

// // //     useEffect(() => { if (!settings && fetchSettings) fetchSettings(); }, [settings, fetchSettings]);

// // //     useEffect(() => {
// // //         if (settings) {
// // //             setCertData(prev => ({
// // //                 ...prev,
// // //                 institutionName: settings.institutionName || "mLab Southern Africa",
// // //                 signatoryName: (settings as any).signatoryName || 'Zakhele Tinga',
// // //                 signatoryTitle: (settings as any).signatoryTitle || 'Academic Manager',
// // //                 logoUrl: mLabLogo, sigUrl: (settings as any).signatureUrl || defaultSignature
// // //             }));
// // //         }
// // //     }, [settings]);

// // //     useEffect(() => {
// // //         const loadInitialData = async () => {
// // //             try {
// // //                 if (fetchCertificateGroups) await fetchCertificateGroups();
// // //                 if (fetchAdHocCertificates) await fetchAdHocCertificates();
// // //             } catch (error) { console.error("Failed to load studio data", error); }
// // //             finally { setIsLoadingData(false); }
// // //         };
// // //         if (adHocCertificates.length === 0 || certificateGroups.length === 0) loadInitialData();
// // //         else setIsLoadingData(false);
// // //     }, [fetchCertificateGroups, fetchAdHocCertificates, adHocCertificates.length, certificateGroups.length]);

// // //     useEffect(() => {
// // //         if (view === 'bulk-review' && bulkData.length > 0) {
// // //             const currentRecord = bulkData[bulkCurrentIndex];
// // //             if (currentRecord) {
// // //                 setCertData(currentRecord);
// // //             }
// // //         }
// // //     }, [bulkCurrentIndex, view, bulkData]);

// // //     // ─── FILTERING FOR ACCESS CONTROL ───
// // //     const isSuperAdmin = (user as any)?.isSuperAdmin === true;
// // //     const userEmail = user?.email?.toLowerCase() || '';

// // //     const myCertificateGroups = (certificateGroups || []).filter((g: any) =>
// // //         isSuperAdmin || g.createdBy === user?.uid || (g.collaborators || []).includes(userEmail)
// // //     );

// // //     const myAdHocCertificates = (adHocCertificates || []).filter((c: any) =>
// // //         isSuperAdmin || c.createdBy === user?.uid || (c.collaborators || []).includes(userEmail)
// // //     );

// // //     const handleCreateFolder = async () => {
// // //         if (!newFolderName.trim()) return;
// // //         try {
// // //             if (createCertificateGroup) await createCertificateGroup(newFolderName.trim());
// // //             if (fetchCertificateGroups) await fetchCertificateGroups(true);
// // //             setNewFolderName(''); setShowNewFolderInput(false); toast.success("Folder created successfully!");
// // //         } catch (error) { toast.error("Failed to create folder"); }
// // //     };

// // //     const handleRenameFolder = async (id: string) => {
// // //         if (!editFolderName.trim()) { setEditingFolderId(null); return; }
// // //         try {
// // //             if (renameCertificateGroup) await renameCertificateGroup(id, editFolderName.trim());
// // //             if (fetchCertificateGroups) await fetchCertificateGroups(true);
// // //             setEditingFolderId(null); toast.success("Folder renamed!");
// // //         } catch (error) { toast.error("Failed to rename folder"); }
// // //     };

// // //     const triggerDeleteFolder = (e: React.MouseEvent, folder: any) => {
// // //         e.stopPropagation();
// // //         setFolderToDelete(folder);
// // //     };

// // //     const executeDeleteFolder = async () => {
// // //         if (!folderToDelete) return;

// // //         try {
// // //             const batch = writeBatch(db);
// // //             const certsToMove = myAdHocCertificates.filter((c: any) => c.groupId === folderToDelete.id);
// // //             certsToMove.forEach((cert: any) => {
// // //                 batch.update(doc(db, 'ad_hoc_certificates', cert.id), { groupId: 'general' });
// // //             });

// // //             batch.delete(doc(db, 'certificate_groups', folderToDelete.id));

// // //             await batch.commit();
// // //             toast.success(`Folder deleted. ${certsToMove.length} certificates safely moved to General.`);

// // //             if (fetchCertificateGroups) await fetchCertificateGroups(true);
// // //             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
// // //         } catch (error) {
// // //             console.error("Delete Error:", error);
// // //             toast.error("Failed to delete folder.");
// // //         } finally {
// // //             setFolderToDelete(null);
// // //         }
// // //     };

// // //     const handleSaveCollaborators = async (id: string, type: 'folder' | 'certificate', collaborators: string[]) => {
// // //         try {
// // //             const collectionName = type === 'folder' ? 'certificate_groups' : 'ad_hoc_certificates';
// // //             await updateDoc(doc(db, collectionName, id), { collaborators });
// // //             toast.success('Access control updated securely.');

// // //             if (type === 'folder' && fetchCertificateGroups) await fetchCertificateGroups(true);
// // //             if (type === 'certificate' && fetchAdHocCertificates) await fetchAdHocCertificates(true);

// // //             if (activeFolder && activeFolder.id === id) {
// // //                 setActiveFolder((prev: any) => ({ ...prev, collaborators }));
// // //             }
// // //         } catch (err) {
// // //             toast.error('Failed to update collaborators.');
// // //         }
// // //     };

// // //     const getCertificatesForActiveFolder = () => {
// // //         if (!activeFolder) return [];
// // //         let certs: any[] = [];
// // //         if (activeFolder.id === 'general') certs = myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general');
// // //         else certs = myAdHocCertificates.filter((c: any) => c.groupId === activeFolder.id);

// // //         if (certSearchQuery) {
// // //             const q = certSearchQuery.toLowerCase();
// // //             return certs.filter((c: any) =>
// // //                 (c.recipientName || '').toLowerCase().includes(q) ||
// // //                 (c.courseName || '').toLowerCase().includes(q) ||
// // //                 (c.type || '').toLowerCase().includes(q)
// // //             );
// // //         }
// // //         return certs;
// // //     };

// // //     const filteredFolders = myCertificateGroups.filter((g: any) => (g.name || '').toLowerCase().includes(folderSearchQuery.toLowerCase()));
// // //     const showGeneralFolder = folderSearchQuery === '' || 'general certificates'.includes(folderSearchQuery.toLowerCase());

// // //     const filteredCourseTemplates = courseTemplates.filter((t: any) =>
// // //         (t.title || '').toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
// // //         (t.programmeName || '').toLowerCase().includes(templateSearchQuery.toLowerCase())
// // //     );

// // //     const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
// // //     const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
// // //     const handleResetZoom = () => setZoom(0.65);

// // //     const handleChange = (field: string, value: string) => {
// // //         setCertData(prev => ({ ...prev, [field]: value }));
// // //         const personalFields = ['recipientName', 'recipientEmail'];

// // //         if (view === 'bulk-review') {
// // //             setBulkData(currentBulk => {
// // //                 if (applyBulkEditsToAll && !personalFields.includes(field)) {
// // //                     return currentBulk.map((cert: any) => ({ ...cert, [field]: value }));
// // //                 } else {
// // //                     const updated = [...currentBulk];
// // //                     updated[bulkCurrentIndex] = { ...updated[bulkCurrentIndex], [field]: value };
// // //                     return updated;
// // //                 }
// // //             });
// // //         }
// // //     };

// // //     const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'sigUrl') => {
// // //         const file = e.target.files?.[0];
// // //         if (file) { handleChange(field, URL.createObjectURL(file)); }
// // //     };

// // //     const resetForm = () => {
// // //         setEditingTemplateId(null);
// // //         setCertData(prev => ({
// // //             ...prev,
// // //             recipientName: '',
// // //             recipientEmail: '',
// // //             certType: 'Achievement',
// // //             customType: '',
// // //             programme: 'Advanced Leadership Workshop',
// // //             courseId: '',
// // //             containerId: ''
// // //         }));
// // //     };

// // //     const finalCertType = certData.certType === 'Other' ? (certData.customType || 'Custom Award') : certData.certType;

// // //     // LOAD EXISTING TEMPLATE INTO CANVAS FOR EDITING
// // //     const handleEditTemplate = (tmpl: any) => {
// // //         setEditingTemplateId(tmpl.id);
// // //         setCertData({
// // //             template: tmpl.templateVisual || 'luxury',
// // //             recipientName: 'SAMPLE LEARNER (PREVIEW)',
// // //             recipientEmail: 'learner@example.com',
// // //             certType: tmpl.certType || 'Achievement',
// // //             customType: '',
// // //             description: tmpl.description || 'has demonstrated exceptional skills and performance in',
// // //             programme: tmpl.programmeName || '',
// // //             institutionName: tmpl.institutionName || 'mLab Southern Africa',
// // //             issueDate: new Date().toISOString().split('T')[0],
// // //             signatoryName: tmpl.signatoryName || '',
// // //             signatoryTitle: tmpl.signatoryTitle || '',
// // //             logoUrl: tmpl.logoUrl || mLabLogo,
// // //             sigUrl: tmpl.sigUrl || defaultSignature,
// // //             groupId: 'general',
// // //             courseId: tmpl.courseId || '',
// // //             containerId: tmpl.containerId || ''
// // //         });
// // //         setView('studio');
// // //     };

// // //     // DELETE TEMPLATE
// // //     const handleDeleteTemplate = async (tmplId: string, title: string) => {
// // //         if (!window.confirm(`Are you sure you want to delete template "${title}"?`)) return;
// // //         try {
// // //             await deleteDoc(doc(db, 'certificate_templates', tmplId));
// // //             toast.success("Certificate template deleted.");
// // //             fetchStudioDatasets();
// // //         } catch (err) {
// // //             toast.error("Failed to delete template.");
// // //         }
// // //     };

// // //     // SAVE / UPDATE REUSABLE COURSE TEMPLATE
// // //     const handleSaveAsReusableTemplate = async () => {
// // //         if (!certData.programme) {
// // //             toast.warning("Please provide or select a course/programme name first.");
// // //             return;
// // //         }

// // //         setIsSavingTemplate(true);
// // //         try {
// // //             const templatePayload = {
// // //                 title: `${certData.programme} - ${finalCertType} Template`,
// // //                 courseId: certData.courseId || null,
// // //                 programmeName: certData.programme,
// // //                 certType: finalCertType,
// // //                 templateVisual: certData.template,
// // //                 description: certData.description,
// // //                 institutionName: certData.institutionName,
// // //                 signatoryName: certData.signatoryName,
// // //                 signatoryTitle: certData.signatoryTitle,
// // //                 logoUrl: certData.logoUrl,
// // //                 sigUrl: certData.sigUrl,
// // //                 updatedAt: serverTimestamp()
// // //             };

// // //             if (editingTemplateId) {
// // //                 await updateDoc(doc(db, 'certificate_templates', editingTemplateId), templatePayload);
// // //                 toast.success(`Template updated successfully!`);
// // //             } else {
// // //                 await addDoc(collection(db, 'certificate_templates'), {
// // //                     ...templatePayload,
// // //                     createdBy: user?.uid || 'Admin',
// // //                     createdAt: serverTimestamp()
// // //                 });
// // //                 toast.success(`Saved new template "${templatePayload.title}"! It is now available in Launch Cohort Run modal.`);
// // //             }

// // //             fetchStudioDatasets();
// // //             setView('folders');
// // //             setStudioLandingTab('course_templates');
// // //         } catch (err: any) {
// // //             console.error("Save template error:", err);
// // //             toast.error("Failed to save certificate template.");
// // //         } finally {
// // //             setIsSavingTemplate(false);
// // //         }
// // //     };

// // //     const executeGeneration = useCallback(async () => {
// // //         if (!certRef.current) return;
// // //         if (!certData.recipientName.trim()) { toast.error('Recipient name is required'); return; }

// // //         setIsGenerating(true);
// // //         toast.info(actionType === 'email' ? 'Generating and sending email...' : 'Generating high-res PDF...');

// // //         try {
// // //             const currentZoom = zoom; setZoom(1);
// // //             await new Promise(resolve => setTimeout(resolve, 300));

// // //             const canvas = await html2canvas(certRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 1123, height: 794 });
// // //             setZoom(currentZoom);

// // //             const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
// // //             pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
// // //             const pdfBlob = pdf.output('blob');

// // //             const storage = getStorage();
// // //             const safeName = certData.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
// // //             const fileName = `ad_hoc_certs/${Date.now()}_${safeName}.pdf`;
// // //             const storageRef = ref(storage, fileName);
// // //             await uploadBytes(storageRef, pdfBlob);
// // //             const downloadUrl = await getDownloadURL(storageRef);

// // //             const certRecord = {
// // //                 recipientName: certData.recipientName,
// // //                 recipientEmail: certData.recipientEmail || null,
// // //                 learnerId: targetLearner?.id || null,
// // //                 courseId: certData.courseId || null,
// // //                 containerId: certData.containerId || null,
// // //                 type: finalCertType,
// // //                 courseName: certData.programme,
// // //                 issueDate: certData.issueDate,
// // //                 pdfUrl: downloadUrl,
// // //                 groupId: certData.groupId || 'general',
// // //                 templateUsed: certData.template,
// // //                 createdBy: user?.uid || 'Admin',
// // //                 createdAt: serverTimestamp(),
// // //                 isEmailed: false,
// // //                 collaborators: []
// // //             };

// // //             const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), certRecord);

// // //             if (targetLearner?.id) {
// // //                 await updateDoc(doc(db, 'learners', targetLearner.id), {
// // //                     certificates: arrayUnion({
// // //                         id: newCertRef.id,
// // //                         courseId: certData.courseId || null,
// // //                         type: finalCertType,
// // //                         courseName: certData.programme,
// // //                         issueDate: certData.issueDate,
// // //                         pdfUrl: downloadUrl,
// // //                         createdAt: new Date().toISOString()
// // //                     })
// // //                 });
// // //             }

// // //             if (actionType === 'email' && certData.recipientEmail) {
// // //                 const functions = getFunctions();
// // //                 const sendAdHocEmail = httpsCallable(functions, 'sendAdHocCertificate');
// // //                 await sendAdHocEmail({ email: certData.recipientEmail, recipientName: certData.recipientName, pdfUrl: downloadUrl, awardTitle: finalCertType, courseName: certData.programme });
// // //                 await updateDoc(newCertRef, { isEmailed: true, emailedAt: serverTimestamp() });
// // //                 toast.success(`Certificate successfully emailed to ${certData.recipientEmail}`);
// // //             } else if (actionType === 'download') {
// // //                 pdf.save(`Certificate_${safeName}.pdf`);
// // //                 toast.success('Certificate downloaded securely!');
// // //             }

// // //             if (fetchAdHocCertificates) await fetchAdHocCertificates(true);
// // //             resetForm();
// // //             navigate('/admin?tab=studio', { replace: true, state: {} });
// // //             setView('folders');
// // //         } catch (error: any) {
// // //             console.error('Studio Error:', error); toast.error('Failed to process. Please try again.');
// // //         } finally { setIsGenerating(false); }
// // //     }, [certRef, certData, actionType, toast, zoom, finalCertType, user, targetLearner, fetchAdHocCertificates, navigate]);

// // //     const handleStartBulkReview = (rows: any[], settings: any, sendEmails: boolean) => {
// // //         setShowBulkModal(false);
// // //         const fullyMappedData = rows.map((row: any) => ({
// // //             ...certData,
// // //             ...settings,
// // //             recipientName: row.Name || row.name || row['Full Name'] || row.Recipient || 'Unknown',
// // //             recipientEmail: row.Email || row.email || row['Email Address'] || '',
// // //             programme: row.Course || row.course || row.Programme || settings.programme
// // //         }));

// // //         setBulkData(fullyMappedData);
// // //         setBulkSettings(settings);
// // //         setBulkSendEmails(sendEmails);
// // //         setBulkCurrentIndex(0);
// // //         setCertData(fullyMappedData[0]);
// // //         setView('bulk-review');
// // //     };

// // //     const executeFinalBulkProcessing = async () => {
// // //         setIsBulkGenerating(true);
// // //         const currentZoom = zoom;
// // //         setZoom(1);

// // //         let successCount = 0;

// // //         try {
// // //             for (let i = 0; i < bulkData.length; i++) {
// // //                 setBulkProgress({ current: i + 1, total: bulkData.length });
// // //                 const currentCert = bulkData[i];

// // //                 setCertData(currentCert);
// // //                 await new Promise(r => setTimeout(r, 700));

// // //                 if (!certRef.current) continue;

// // //                 const canvas = await html2canvas(certRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: 1123, height: 794 });
// // //                 const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
// // //                 pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
// // //                 const pdfBlob = pdf.output('blob');

// // //                 const safeName = currentCert.recipientName.replace(/[^a-zA-Z0-9]/g, '_');
// // //                 const fileName = `ad_hoc_certs/bulk_${Date.now()}_${safeName}.pdf`;
// // //                 const storageRef = ref(getStorage(), fileName);
// // //                 await uploadBytes(storageRef, pdfBlob);
// // //                 const downloadUrl = await getDownloadURL(storageRef);

// // //                 const newCertRef = await addDoc(collection(db, 'ad_hoc_certificates'), {
// // //                     recipientName: currentCert.recipientName,
// // //                     recipientEmail: currentCert.recipientEmail || null,
// // //                     courseId: currentCert.courseId || null,
// // //                     type: currentCert.certType,
// // //                     courseName: currentCert.programme,
// // //                     issueDate: currentCert.issueDate,
// // //                     pdfUrl: downloadUrl,
// // //                     groupId: currentCert.groupId || 'general',
// // //                     templateUsed: currentCert.template,
// // //                     createdBy: user?.uid || 'Admin',
// // //                     createdAt: serverTimestamp(),
// // //                     isEmailed: false,
// // //                     emailStatus: (bulkSendEmails && currentCert.recipientEmail) ? 'pending' : 'not_requested',
// // //                     isBulkUpload: true,
// // //                     collaborators: []
// // //                 });

// // //                 if (bulkSendEmails && currentCert.recipientEmail) {
// // //                     try {
// // //                         const sendAdHocEmail = httpsCallable(getFunctions(), 'sendAdHocCertificate');
// // //                         await sendAdHocEmail({ email: currentCert.recipientEmail, recipientName: currentCert.recipientName, pdfUrl: downloadUrl, awardTitle: currentCert.certType, courseName: currentCert.programme });
// // //                         await updateDoc(newCertRef, { isEmailed: true, emailStatus: 'sent', emailedAt: serverTimestamp() });
// // //                     } catch (emailError: any) {
// // //                         console.error(`Failed to send email to ${currentCert.recipientEmail}:`, emailError);
// // //                         await updateDoc(newCertRef, { emailStatus: 'failed', emailError: emailError?.message || 'Cloud function failed' });
// // //                     }
// // //                 }
// // //                 successCount++;
// // //             }

// // //             toast.success(`Bulk Operation Complete: ${successCount} certificates generated safely.`);
// // //             if (fetchAdHocCertificates) fetchAdHocCertificates(true);

// // //         } catch (error) {
// // //             console.error("Bulk process failed:", error);
// // //             toast.error("A critical error interrupted the bulk generation loop.");
// // //         } finally {
// // //             setZoom(currentZoom);
// // //             setIsBulkGenerating(false);
// // //             setBulkData([]);
// // //             setBulkSettings(null);
// // //             setBulkProgress({ current: 0, total: 0 });
// // //             resetForm();
// // //             setView('folders');
// // //         }
// // //     };

// // //     return (
// // //         <div className="wm-root animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

// // //             {folderToDelete && (
// // //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// // //                     <StatusModal
// // //                         type="warning"
// // //                         title="Delete Workspace Folder"
// // //                         message={`Are you sure you want to delete the folder "${folderToDelete.name}"?\n\nDon't worry! All certificates currently inside this folder will be safely preserved and moved back to the General Certificates workspace.`}
// // //                         confirmText="Yes, Delete Folder"
// // //                         onClose={executeDeleteFolder}
// // //                         onCancel={() => setFolderToDelete(null)}
// // //                     />
// // //                 </div>
// // //             )}

// // //             {shareModalConfig.isOpen && (
// // //                 <ShareModal
// // //                     isOpen={shareModalConfig.isOpen}
// // //                     onClose={() => setShareModalConfig({ ...shareModalConfig, isOpen: false })}
// // //                     targetId={shareModalConfig.targetId}
// // //                     targetType={shareModalConfig.targetType}
// // //                     targetName={shareModalConfig.targetName}
// // //                     initialCollaborators={shareModalConfig.collaborators}
// // //                     onSave={handleSaveCollaborators}
// // //                 />
// // //             )}

// // //             {isBulkGenerating && (
// // //                 <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// // //                     <div className="ap-spinner" style={{ width: '60px', height: '60px', marginBottom: '1.5rem', borderTopColor: 'var(--mlab-blue)' }}></div>
// // //                     <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', fontSize: '2rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Generating Batch Certificates</h2>
// // //                     <p style={{ color: 'var(--mlab-grey)', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                         Processing <span style={{ color: 'var(--mlab-blue)', fontWeight: 'bold' }}>{bulkProgress.current}</span> of {bulkProgress.total}...
// // //                     </p>
// // //                     <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>DO NOT CLOSE THIS TAB OR SWITCH WINDOWS.</p>
// // //                 </div>
// // //             )}

// // //             {showBulkModal && (
// // //                 <BulkGeneratorModal
// // //                     certificateGroups={myCertificateGroups}
// // //                     courses={systemCourses}
// // //                     onClose={() => setShowBulkModal(false)}
// // //                     onStart={handleStartBulkReview}
// // //                     onCreateFolder={async (name) => {
// // //                         try {
// // //                             const newDocRef = await addDoc(collection(db, 'certificate_groups'), {
// // //                                 name: name,
// // //                                 createdAt: serverTimestamp(),
// // //                                 createdBy: user?.uid || 'Admin',
// // //                                 collaborators: []
// // //                             });
// // //                             if (fetchCertificateGroups) await fetchCertificateGroups(true);
// // //                             toast.success("Folder created successfully!");
// // //                             return newDocRef.id;
// // //                         } catch (error) {
// // //                             toast.error("Failed to create folder");
// // //                             return null;
// // //                         }
// // //                     }}
// // //                 />
// // //             )}

// // //             {/* ── HEADER ── */}
// // //             {view !== 'bulk-review' && (
// // //                 <div className="wm-page-header">
// // //                     <div className="wm-page-header__left">
// // //                         <div className="wm-page-header__icon"><Award size={22} /></div>
// // //                         <div>
// // //                             <h1 className="wm-page-header__title">{view === 'folders' ? 'Certificate Studio' : view === 'inside-folder' ? activeFolder?.name : 'Design Certificate'}</h1>
// // //                             <p className="wm-page-header__desc">
// // //                                 {targetLearner ? `Issuing Official Certificate for ${targetLearner.fullName}` : 'Design custom ad-hoc awards, reusable course templates, and manage document history.'}
// // //                             </p>
// // //                         </div>
// // //                     </div>
// // //                     <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
// // //                         {view === 'folders' && studioLandingTab === 'adhoc' && (
// // //                             <>
// // //                                 <button type="button" className="wm-btn wm-btn--ghost" onClick={() => setShowBulkModal(true)} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>
// // //                                     <UploadCloud size={14} /> Import Spreadsheet
// // //                                 </button>
// // //                                 <button type="button" className="wm-btn wm-btn--primary" onClick={() => { resetForm(); setView('studio'); }}>
// // //                                     <Plus size={14} /> Single Certificate
// // //                                 </button>
// // //                             </>
// // //                         )}
// // //                         {view === 'folders' && studioLandingTab === 'course_templates' && (
// // //                             <button type="button" className="wm-btn wm-btn--primary" onClick={() => { resetForm(); setView('studio'); }}>
// // //                                 <Plus size={14} /> Create Course Template
// // //                             </button>
// // //                         )}
// // //                         {view === 'inside-folder' && activeFolder && (
// // //                             <>
// // //                                 <button type="button" className="wm-btn wm-btn--ghost" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => setView('folders')}>
// // //                                     <ArrowLeft size={14} /> Back to Folders
// // //                                 </button>
// // //                                 <button type="button" className="wm-btn wm-btn--primary" onClick={() => { resetForm(); setCertData(prev => ({ ...prev, groupId: activeFolder.id })); setView('studio'); }}>
// // //                                     <Plus size={14} /> Create in this Folder
// // //                                 </button>
// // //                             </>
// // //                         )}
// // //                         {view === 'studio' && (
// // //                             <>
// // //                                 <button type="button" className="wm-btn wm-btn--ghost" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => { resetForm(); navigate('/admin?tab=studio', { replace: true, state: {} }); setView('folders'); }}>
// // //                                     <ArrowLeft size={14} /> Cancel Design
// // //                                 </button>

// // //                                 <button
// // //                                     type="button"
// // //                                     className="wm-btn wm-btn--ghost"
// // //                                     disabled={isSavingTemplate}
// // //                                     onClick={handleSaveAsReusableTemplate}
// // //                                     style={{ background: '#7c3aed', color: 'white', border: '1px solid #a78bfa' }}
// // //                                     title="Save this template so it can be selected when launching Cohort Runs"
// // //                                 >
// // //                                     {isSavingTemplate ? <Loader2 className="spin" size={14} /> : <Save size={14} />} {editingTemplateId ? 'Update Template' : 'Save Reusable Template'}
// // //                                 </button>

// // //                                 <button type="button" className="wm-btn wm-btn--ghost" disabled={isGenerating} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => { setActionType('download'); executeGeneration(); }}>
// // //                                     {isGenerating && actionType === 'download' ? <Loader2 className="spin" size={14} /> : <Download size={14} />} Download PDF
// // //                                 </button>
// // //                                 <button type="button" className="wm-btn wm-btn--primary" disabled={isGenerating || !certData.recipientEmail} onClick={() => { setActionType('email'); executeGeneration(); }}>
// // //                                     {isGenerating && actionType === 'email' ? <Loader2 className="spin" size={14} /> : <Mail size={14} />} Email Document
// // //                                 </button>
// // //                             </>
// // //                         )}
// // //                     </div>
// // //                 </div>
// // //             )}

// // //             <div style={{ flex: 1, overflowY: 'auto', padding: view === 'bulk-review' ? 0 : '0 1.5rem 1.5rem' }}>

// // //                 {/* DUAL TAB SWITCHER ON STUDIO LANDING PAGE */}
// // //                 {view === 'folders' && (
// // //                     <div style={{ display: 'flex', borderBottom: '2px solid var(--mlab-border)', marginBottom: '1.25rem', gap: '8px' }}>
// // //                         <button
// // //                             type="button"
// // //                             onClick={() => setStudioLandingTab('adhoc')}
// // //                             style={{
// // //                                 padding: '10px 18px',
// // //                                 background: studioLandingTab === 'adhoc' ? '#ffffff' : 'transparent',
// // //                                 border: 'none',
// // //                                 color: studioLandingTab === 'adhoc' ? 'var(--mlab-blue)' : '#64748b',
// // //                                 fontWeight: 800,
// // //                                 fontSize: '0.78rem',
// // //                                 fontFamily: 'var(--font-heading)',
// // //                                 textTransform: 'uppercase',
// // //                                 cursor: 'pointer',
// // //                                 display: 'inline-flex',
// // //                                 alignItems: 'center',
// // //                                 gap: '8px',
// // //                                 borderBottom: studioLandingTab === 'adhoc' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
// // //                                 borderRadius: '0px'
// // //                             }}
// // //                         >
// // //                             <Folder size={15} color={studioLandingTab === 'adhoc' ? 'var(--mlab-blue)' : '#64748b'} />
// // //                             Ad-Hoc &amp; Manual Workspaces
// // //                         </button>

// // //                         <button
// // //                             type="button"
// // //                             onClick={() => setStudioLandingTab('course_templates')}
// // //                             style={{
// // //                                 padding: '10px 18px',
// // //                                 background: studioLandingTab === 'course_templates' ? '#ffffff' : 'transparent',
// // //                                 border: 'none',
// // //                                 color: studioLandingTab === 'course_templates' ? '#7c3aed' : '#64748b',
// // //                                 fontWeight: 800,
// // //                                 fontSize: '0.78rem',
// // //                                 fontFamily: 'var(--font-heading)',
// // //                                 textTransform: 'uppercase',
// // //                                 cursor: 'pointer',
// // //                                 display: 'inline-flex',
// // //                                 alignItems: 'center',
// // //                                 gap: '8px',
// // //                                 borderBottom: studioLandingTab === 'course_templates' ? '3px solid #7c3aed' : '3px solid transparent',
// // //                                 borderRadius: '0px'
// // //                             }}
// // //                         >
// // //                             <BookOpen size={15} color={studioLandingTab === 'course_templates' ? '#7c3aed' : '#64748b'} />
// // //                             Course Assigned Templates ({courseTemplates.length})
// // //                         </button>
// // //                     </div>
// // //                 )}

// // //                 {/* ── METRICS RIBBON (Only in Ad-Hoc Folders View) ── */}
// // //                 {view === 'folders' && studioLandingTab === 'adhoc' && !isLoadingData && (
// // //                     <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
// // //                         <div className="cdp-stat-card cdp-stat-card--blue">
// // //                             <div className="cdp-stat-card__icon"><Layers size={20} /></div>
// // //                             <div className="cdp-stat-card__body">
// // //                                 <span className="cdp-stat-card__value">{myCertificateGroups.length + 1}</span>
// // //                                 <span className="cdp-stat-card__label">Total Folders</span>
// // //                             </div>
// // //                         </div>
// // //                         <div className="cdp-stat-card cdp-stat-card--green">
// // //                             <div className="cdp-stat-card__icon"><Award size={20} /></div>
// // //                             <div className="cdp-stat-card__body">
// // //                                 <span className="cdp-stat-card__value">{myAdHocCertificates.length}</span>
// // //                                 <span className="cdp-stat-card__label">Issued Certificates</span>
// // //                             </div>
// // //                         </div>
// // //                         <div className="cdp-stat-card cdp-stat-card--amber">
// // //                             <div className="cdp-stat-card__icon"><Mail size={20} /></div>
// // //                             <div className="cdp-stat-card__body">
// // //                                 <span className="cdp-stat-card__value">{myAdHocCertificates.filter((c: any) => c.isEmailed).length}</span>
// // //                                 <span className="cdp-stat-card__label">Emailed Successfully</span>
// // //                             </div>
// // //                         </div>
// // //                         <div className="cdp-stat-card cdp-stat-card--grey">
// // //                             <div className="cdp-stat-card__icon"><FileText size={20} /></div>
// // //                             <div className="cdp-stat-card__body">
// // //                                 <span className="cdp-stat-card__value">{myAdHocCertificates.filter((c: any) => !c.isEmailed).length}</span>
// // //                                 <span className="cdp-stat-card__label">Downloads Only</span>
// // //                             </div>
// // //                         </div>
// // //                     </div>
// // //                 )}

// // //                 {/* ── SEARCH TOOLBAR ── */}
// // //                 {(view === 'folders' || view === 'inside-folder') && studioLandingTab === 'adhoc' && !isLoadingData && (
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
// // //                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px', width: '300px' }}>
// // //                             <Search size={15} color="var(--mlab-grey)" />
// // //                             <input
// // //                                 type="text"
// // //                                 placeholder={view === 'folders' ? "Search folders..." : "Search names or courses..."}
// // //                                 value={view === 'folders' ? folderSearchQuery : certSearchQuery}
// // //                                 onChange={e => view === 'folders' ? setFolderSearchQuery(e.target.value) : setCertSearchQuery(e.target.value)}
// // //                                 style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
// // //                             />
// // //                             {(folderSearchQuery || certSearchQuery) && (
// // //                                 <button type="button" onClick={() => view === 'folders' ? setFolderSearchQuery('') : setCertSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
// // //                                     <X size={13} />
// // //                                 </button>
// // //                             )}
// // //                         </div>

// // //                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
// // //                             {view === 'folders' && (
// // //                                 showNewFolderInput ? (
// // //                                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// // //                                         <input className="wm-form-input" style={{ width: '220px', margin: 0, padding: '0.4rem 0.75rem', height: '36px' }} value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Enter folder name..." autoFocus />
// // //                                         <button type="button" className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.8rem' }} onClick={handleCreateFolder}>Save</button>
// // //                                         <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ background: 'white', padding: '0.4rem 0.8rem' }} onClick={() => setShowNewFolderInput(false)}>Cancel</button>
// // //                                     </div>
// // //                                 ) : (
// // //                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ background: 'white', padding: '0.5rem 1rem' }} onClick={() => setShowNewFolderInput(true)}>
// // //                                         <FolderPlus size={14} /> New Folder
// // //                                     </button>
// // //                                 )
// // //                             )}
// // //                         </div>
// // //                     </div>
// // //                 )}

// // //                 {/* ── FOLDERS GRID (AD-HOC TAB) ── */}
// // //                 {view === 'folders' && studioLandingTab === 'adhoc' && (
// // //                     isLoadingData ? (
// // //                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
// // //                             <Loader message='Loading Workspace...' />
// // //                         </div>
// // //                     ) : (
// // //                         <div className="mlab-cohort-grid">
// // //                             {showGeneralFolder && (
// // //                                 <div className="mlab-cohort-card animate-fade-in">
// // //                                     <div className="mlab-cohort-card__header">
// // //                                         <h3 className="mlab-cohort-card__name">General Certificates</h3>
// // //                                     </div>
// // //                                     <div className="mlab-cohort-card__dates">
// // //                                         <Calendar size={14} />
// // //                                         <span>System Default Folder</span>
// // //                                     </div>
// // //                                     <div className="mlab-role-row-stack">
// // //                                         <div className="mlab-role-row">
// // //                                             <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
// // //                                             <span className="mlab-role-label">Contents:</span>
// // //                                             <span className="mlab-role-name">{myAdHocCertificates.filter((c: any) => !c.groupId || c.groupId === 'general').length} Documents</span>
// // //                                         </div>
// // //                                         <div className="mlab-role-row">
// // //                                             <div className="mlab-role-dot mlab-role-dot--green" />
// // //                                             <span className="mlab-role-label">Access:</span>
// // //                                             <span className="mlab-role-name">System Default Workspace</span>
// // //                                         </div>
// // //                                     </div>
// // //                                     <div style={{ display: 'flex', width: '100%', justifyContent: 'flex-end', marginTop: 16 }}>
// // //                                         <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setActiveFolder({ id: 'general', name: 'General Certificates' }); setView('inside-folder'); }}>
// // //                                             Open Folder <ArrowRight size={13} />
// // //                                         </button>
// // //                                     </div>
// // //                                 </div>
// // //                             )}

// // //                             {filteredFolders.map((group: any) => {
// // //                                 const certCount = myAdHocCertificates.filter((c: any) => c.groupId === group.id).length;
// // //                                 const isShared = group.collaborators?.length > 0;
// // //                                 const createdDate = group.createdAt?.toDate ? new Date(group.createdAt.toDate()).toLocaleDateString('en-ZA') : 'Recently';

// // //                                 return (
// // //                                     <div key={group.id} className="mlab-cohort-card animate-fade-in" style={{ borderTopColor: 'var(--mlab-green)' }}>
// // //                                         <div className="mlab-cohort-card__header">
// // //                                             {editingFolderId === group.id ? (
// // //                                                 <div style={{ display: 'flex', gap: '5px', alignItems: 'center', width: '100%' }}>
// // //                                                     <input className="wm-form-input" style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem', width: '100%', margin: 0 }} autoFocus value={editFolderName} onChange={e => setEditFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(group.id); if (e.key === 'Escape') setEditingFolderId(null); }} />
// // //                                                     <button type="button" className="mlab-btn mlab-btn--green" style={{ padding: '0.4rem 0.6rem' }} onClick={() => handleRenameFolder(group.id)}>Save</button>
// // //                                                 </div>
// // //                                             ) : (
// // //                                                 <>
// // //                                                     <h3 className="mlab-cohort-card__name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</h3>
// // //                                                     <div className="mlab-cohort-card__actions">
// // //                                                         <button type="button" className="mlab-icon-btn mlab-icon-btn--blue" onClick={(e) => { e.stopPropagation(); setEditingFolderId(group.id); setEditFolderName(group.name); }} title="Rename Folder"><Edit2 size={14} /></button>
// // //                                                         <button type="button" className="mlab-icon-btn mlab-icon-btn--amber" onClick={(e) => triggerDeleteFolder(e, group)} title="Delete Folder"><Trash2 size={14} color="#ef4444" /></button>
// // //                                                     </div>
// // //                                                 </>
// // //                                             )}
// // //                                         </div>

// // //                                         {editingFolderId !== group.id && (
// // //                                             <>
// // //                                                 <div className="mlab-cohort-card__dates">
// // //                                                     <Calendar size={14} />
// // //                                                     <span>Created: {createdDate}</span>
// // //                                                 </div>

// // //                                                 <div className="mlab-role-row-stack">
// // //                                                     <div className="mlab-role-row">
// // //                                                         <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
// // //                                                         <span className="mlab-role-label">Contents:</span>
// // //                                                         <span className="mlab-role-name">{certCount} Documents</span>
// // //                                                     </div>
// // //                                                     <div className="mlab-role-row">
// // //                                                         <div className={`mlab-role-dot ${isShared ? 'mlab-role-dot--blue' : 'mlab-role-dot--green'}`} />
// // //                                                         <span className="mlab-role-label">Access:</span>
// // //                                                         <span className="mlab-role-name">{isShared ? `Shared (${group.collaborators.length})` : 'Private Workspace'}</span>
// // //                                                     </div>
// // //                                                 </div>

// // //                                                 <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '10px', marginTop: 16 }}>
// // //                                                     <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }} onClick={(e) => { e.stopPropagation(); setShareModalConfig({ isOpen: true, targetId: group.id, targetType: 'folder', targetName: group.name, collaborators: group.collaborators || [] }); }} title="Share Folder">
// // //                                                         <UserPlus size={13} /> Share Folder
// // //                                                     </button>
// // //                                                     <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setActiveFolder(group); setView('inside-folder'); }}>
// // //                                                         Open Folder <ArrowRight size={13} />
// // //                                                     </button>
// // //                                                 </div>
// // //                                             </>
// // //                                         )}
// // //                                     </div>
// // //                                 );
// // //                             })}

// // //                             {filteredFolders.length === 0 && !showGeneralFolder && (
// // //                                 <div className="mlab-cohort-empty">
// // //                                     <Search size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // //                                     <p className="mlab-cohort-empty__title">No Folders Found</p>
// // //                                     <p className="mlab-cohort-empty__desc">Create a folder or adjust your search parameters.</p>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     )
// // //                 )}

// // //                 {/* 🚀 COURSE ASSIGNED TEMPLATES TAB CONTENT */}
// // //                 {view === 'folders' && studioLandingTab === 'course_templates' && (
// // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
// // //                             <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px', width: '320px' }}>
// // //                                 <Search size={15} color="var(--mlab-grey)" />
// // //                                 <input
// // //                                     type="text"
// // //                                     placeholder="Search course templates..."
// // //                                     value={templateSearchQuery}
// // //                                     onChange={e => setTemplateSearchQuery(e.target.value)}
// // //                                     style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }}
// // //                                 />
// // //                                 {templateSearchQuery && (
// // //                                     <button type="button" onClick={() => setTemplateSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
// // //                                         <X size={13} />
// // //                                     </button>
// // //                                 )}
// // //                             </div>

// // //                             <button
// // //                                 type="button"
// // //                                 className="mlab-btn mlab-btn--primary"
// // //                                 onClick={() => { resetForm(); setView('studio'); }}
// // //                             >
// // //                                 <Plus size={14} /> Create Course Template
// // //                             </button>
// // //                         </div>

// // //                         {filteredCourseTemplates.length === 0 ? (
// // //                             <div className="mlab-cohort-empty" style={{ background: 'white' }}>
// // //                                 <BookOpen size={44} color="#7c3aed" style={{ opacity: 0.5 }} />
// // //                                 <p className="mlab-cohort-empty__title">No Course Templates Configured</p>
// // //                                 <p className="mlab-cohort-empty__desc">Save a custom template here to make it selectable when launching Cohort Runs.</p>
// // //                             </div>
// // //                         ) : (
// // //                             <div className="mlab-cohort-grid">
// // //                                 {filteredCourseTemplates.map((tmpl: any) => {
// // //                                     const matchedCourse = systemCourses.find((c: any) => c.id === tmpl.courseId);
// // //                                     const linkedTitle = matchedCourse?.title || matchedCourse?.name || tmpl.programmeName || 'General Course Template';

// // //                                     return (
// // //                                         <div key={tmpl.id} className="mlab-cohort-card animate-fade-in" style={{ borderTop: '4px solid #7c3aed' }}>
// // //                                             <div className="mlab-cohort-card__header">
// // //                                                 <div>
// // //                                                     <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
// // //                                                         {tmpl.templateVisual ? `${tmpl.templateVisual.toUpperCase()} TEMPLATE` : 'LUXURY TEMPLATE'}
// // //                                                     </span>
// // //                                                     <h3 className="mlab-cohort-card__name" style={{ margin: '2px 0 0 0' }}>{tmpl.title || linkedTitle}</h3>
// // //                                                 </div>
// // //                                             </div>

// // //                                             <div className="mlab-cohort-card__dates">
// // //                                                 <BookOpen size={14} color="#7c3aed" />
// // //                                                 <span>Linked Course: <strong>{linkedTitle}</strong></span>
// // //                                             </div>

// // //                                             <div className="mlab-role-row-stack">
// // //                                                 <div className="mlab-role-row">
// // //                                                     <div className="mlab-role-dot" style={{ background: '#7c3aed' }} />
// // //                                                     <span className="mlab-role-label">Award Title:</span>
// // //                                                     <span className="mlab-role-name">{tmpl.certType || 'Certificate of Competence'}</span>
// // //                                                 </div>
// // //                                                 <div className="mlab-role-row">
// // //                                                     <div className="mlab-role-dot mlab-role-dot--green" />
// // //                                                     <span className="mlab-role-label">Signatory:</span>
// // //                                                     <span className="mlab-role-name">{tmpl.signatoryName || 'Zakhele Tinga'} ({tmpl.signatoryTitle || 'Academic Manager'})</span>
// // //                                                 </div>
// // //                                             </div>

// // //                                             <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', marginTop: 16, paddingTop: '12px', borderTop: '1px solid var(--mlab-border)' }}>
// // //                                                 <button
// // //                                                     type="button"
// // //                                                     className="mlab-btn mlab-btn--outline-blue"
// // //                                                     style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem' }}
// // //                                                     onClick={() => handleEditTemplate(tmpl)}
// // //                                                 >
// // //                                                     <Edit3 size={13} /> Edit Design
// // //                                                 </button>

// // //                                                 <button
// // //                                                     type="button"
// // //                                                     className="mlab-icon-btn mlab-icon-btn--amber"
// // //                                                     onClick={() => handleDeleteTemplate(tmpl.id, tmpl.title || linkedTitle)}
// // //                                                     title="Delete Template"
// // //                                                 >
// // //                                                     <Trash2 size={13} color="#ef4444" />
// // //                                                 </button>
// // //                                             </div>
// // //                                         </div>
// // //                                     );
// // //                                 })}
// // //                             </div>
// // //                         )}
// // //                     </div>
// // //                 )}

// // //                 {/* ── CERTIFICATES GRID (INSIDE FOLDER) ── */}
// // //                 {view === 'inside-folder' && activeFolder && (
// // //                     <>
// // //                         {getCertificatesForActiveFolder().length === 0 ? (
// // //                             <div className="mlab-cohort-empty" style={{ background: 'white' }}>
// // //                                 {certSearchQuery ? <Search size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} /> : <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />}
// // //                                 <p className="mlab-cohort-empty__title">{certSearchQuery ? 'No Results Found' : 'Folder is Empty'}</p>
// // //                                 <p className="mlab-cohort-empty__desc">{certSearchQuery ? `No certificates match "${certSearchQuery}".` : 'No certificates have been saved to this folder yet.'}</p>
// // //                             </div>
// // //                         ) : (
// // //                             <div className="mlab-cohort-grid">
// // //                                 {getCertificatesForActiveFolder().map((cert: any) => (
// // //                                     <div key={cert.id} className="mlab-cohort-card animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
// // //                                         <div style={{ height: '120px', background: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
// // //                                             <Award size={48} color="rgba(255,255,255,0.1)" />
// // //                                             <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
// // //                                                 {cert.emailStatus === 'failed' && (
// // //                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#ef4444', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={cert.emailError || "Email delivery failed"}>
// // //                                                         <AlertCircle size={10} /> Send Failed
// // //                                                     </span>
// // //                                                 )}
// // //                                                 {cert.isEmailed && (
// // //                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: 'var(--mlab-green)', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }} title={`Emailed to ${cert.recipientEmail}`}>
// // //                                                         <Mail size={10} /> Sent
// // //                                                     </span>
// // //                                                 )}
// // //                                                 <span style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>PDF</span>
// // //                                             </div>
// // //                                         </div>
// // //                                         <div style={{ padding: '1.25rem' }}>
// // //                                             <div className="mlab-cohort-card__header">
// // //                                                 <h3 className="mlab-cohort-card__name">{cert.recipientName}</h3>
// // //                                             </div>
// // //                                             <div className="mlab-cohort-card__dates" style={{ marginBottom: '10px' }}>
// // //                                                 <Award size={14} />
// // //                                                 <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cert.courseName}</span>
// // //                                             </div>

// // //                                             <div className="mlab-role-row-stack">
// // //                                                 <div className="mlab-role-row">
// // //                                                     <div className="mlab-role-dot mlab-role-dot--green" />
// // //                                                     <span className="mlab-role-label">Type:</span>
// // //                                                     <span className="mlab-role-name">{cert.type}</span>
// // //                                                 </div>
// // //                                                 <div className="mlab-role-row">
// // //                                                     <div className="mlab-role-dot mlab-role-dot--blue" />
// // //                                                     <span className="mlab-role-label">Issued:</span>
// // //                                                     <span className="mlab-role-name">{cert.createdAt ? new Date(cert.createdAt.toDate()).toLocaleDateString() : cert.issueDate}</span>
// // //                                                 </div>
// // //                                             </div>

// // //                                             <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '10px', marginTop: 16 }}>
// // //                                                 <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }} onClick={() => setShareModalConfig({ isOpen: true, targetId: cert.id, targetType: 'certificate', targetName: cert.recipientName, collaborators: cert.collaborators || [] })}>
// // //                                                     <UserPlus size={13} /> Share
// // //                                                 </button>
// // //                                                 <button type="button" className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.open(cert.pdfUrl, '_blank')}>
// // //                                                     View <ArrowRight size={13} />
// // //                                                 </button>
// // //                                             </div>
// // //                                         </div>
// // //                                     </div>
// // //                                 ))}
// // //                             </div>
// // //                         )}
// // //                     </>
// // //                 )}

// // //                 {/* ── STUDIO & BULK REVIEW VIEWS ── */}
// // //                 {(view === 'studio' || view === 'bulk-review') && (
// // //                     <div style={{ display: 'flex', gap: '1.5rem', height: '100%', flexDirection: view === 'bulk-review' ? 'column' : 'row' }}>

// // //                         {view === 'bulk-review' && (
// // //                             <div style={{ display: 'flex', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', gap: '1rem', flexShrink: 0 }}>
// // //                                 <button type="button" className="mlab-btn mlab-btn--outline-blue" style={{ color: 'var(--mlab-red)', borderColor: 'var(--mlab-red)' }} onClick={() => { setBulkData([]); setView('folders'); }}>
// // //                                     <X size={14} /> Cancel Bulk Operation
// // //                                 </button>

// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 auto', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
// // //                                     <button
// // //                                         type="button"
// // //                                         className="mlab-icon-btn"
// // //                                         disabled={bulkCurrentIndex === 0}
// // //                                         onClick={() => setBulkCurrentIndex(p => Math.max(0, p - 1))}
// // //                                         style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// // //                                     >
// // //                                         <ChevronLeft color='var(--mlab-midnight)' size={18} />
// // //                                     </button>
// // //                                     <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-midnight)', minWidth: '150px', textAlign: 'center' }}>
// // //                                         Preview {bulkCurrentIndex + 1} of {bulkData.length}
// // //                                     </span>
// // //                                     <button
// // //                                         type="button"
// // //                                         className="mlab-icon-btn"
// // //                                         disabled={bulkCurrentIndex === bulkData.length - 1}
// // //                                         onClick={() => setBulkCurrentIndex(p => Math.min(bulkData.length - 1, p + 1))}
// // //                                         style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// // //                                     >
// // //                                         <ChevronRight color='var(--mlab-midnight)' size={18} />
// // //                                     </button>
// // //                                 </div>

// // //                                 <button type="button" className="mlab-btn mlab-btn--primary" onClick={executeFinalBulkProcessing}>
// // //                                     <Send size={14} /> Approve & Process All ({bulkData.length})
// // //                                 </button>
// // //                             </div>
// // //                         )}

// // //                         <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>
// // //                             {/* Left Sidebar (Form) */}
// // //                             <div className="cdp-panel" style={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
// // //                                 <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// // //                                     {/* BULK EDIT TOGGLE */}
// // //                                     {view === 'bulk-review' && (
// // //                                         <div style={{ background: applyBulkEditsToAll ? '#eff6ff' : '#f8fafc', padding: '12px', borderRadius: '8px', border: `1px solid ${applyBulkEditsToAll ? '#bfdbfe' : '#e2e8f0'}`, transition: 'all 0.2s' }}>
// // //                                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--mlab-blue)', fontSize: '0.85rem', margin: 0 }}>
// // //                                                 <input
// // //                                                     type="checkbox"
// // //                                                     checked={applyBulkEditsToAll}
// // //                                                     onChange={e => setApplyBulkEditsToAll(e.target.checked)}
// // //                                                     style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
// // //                                                 />
// // //                                                 Apply edits to ALL certificates
// // //                                             </label>
// // //                                             <p style={{ margin: '6px 0 0 24px', fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: 1.4 }}>
// // //                                                 When checked, changing the template, course, or signature will instantly update all <strong>{bulkData.length}</strong> certificates.
// // //                                             </p>
// // //                                         </div>
// // //                                     )}

// // //                                     <FormSection title="Design Template" icon={Layers}>
// // //                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.template} onChange={e => handleChange('template', e.target.value)}><option value="luxury">Luxury (Default)</option><option value="official">Official Statement (SoR)</option><option value="modern">Modern Minimalist</option></select>
// // //                                     </FormSection>

// // //                                     {/* COURSE LINKAGE SELECTOR */}
// // //                                     <FormSection title="Course & Content Linkage" icon={BookOpen}>
// // //                                         <select
// // //                                             className="wm-form-input"
// // //                                             style={{ margin: 0 }}
// // //                                             value={certData.courseId}
// // //                                             onChange={e => {
// // //                                                 const selectedId = e.target.value;
// // //                                                 const matchedCourse = systemCourses.find((c: any) => c.id === selectedId);
// // //                                                 setCertData(prev => ({
// // //                                                     ...prev,
// // //                                                     courseId: selectedId,
// // //                                                     programme: matchedCourse?.title || matchedCourse?.name || prev.programme
// // //                                                 }));
// // //                                             }}
// // //                                         >
// // //                                             <option value="">-- Custom / Ad-Hoc (No Course Link) --</option>
// // //                                             {(systemCourses || []).map((course: any) => (
// // //                                                 <option key={course.id} value={course.id}>{course.title || course.name}</option>
// // //                                             ))}
// // //                                         </select>
// // //                                     </FormSection>

// // //                                     <FormSection title="Folder Assignment" icon={Folder}>
// // //                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.groupId} onChange={e => handleChange('groupId', e.target.value)}><option value="general">General (No Folder)</option>{(myCertificateGroups || []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}</select>
// // //                                     </FormSection>

// // //                                     <FormSection title="Recipient Details" icon={UserCircle}>
// // //                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Full Name *" value={certData.recipientName} onChange={e => handleChange('recipientName', e.target.value)} />
// // //                                         <input className="wm-form-input" style={{ margin: 0 }} type="email" placeholder="Email Address (Optional)" value={certData.recipientEmail} onChange={e => handleChange('recipientEmail', e.target.value)} />
// // //                                     </FormSection>

// // //                                     <FormSection title="Award Details" icon={FileCheck}>
// // //                                         <select className="wm-form-input" style={{ margin: 0 }} value={certData.certType} onChange={e => handleChange('certType', e.target.value)}><option value="Achievement">Certificate of Achievement</option><option value="Attendance">Certificate of Attendance</option><option value="Appreciation">Certificate of Appreciation</option><option value="Excellence">Award of Excellence</option><option value="Other">Custom Title...</option></select>
// // //                                         {certData.certType === 'Other' && <input className="wm-form-input" style={{ margin: 0 }} placeholder="Custom Title" value={certData.customType} onChange={e => handleChange('customType', e.target.value)} />}
// // //                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Course / Event Name" value={certData.programme} onChange={e => handleChange('programme', e.target.value)} />
// // //                                         <textarea className="wm-form-input" style={{ margin: 0, minHeight: '60px' }} placeholder="Description..." value={certData.description} onChange={e => handleChange('description', e.target.value)} rows={2} />
// // //                                     </FormSection>

// // //                                     <FormSection title="Branding & Signatures" icon={Building2}>
// // //                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Institution Name" value={certData.institutionName} onChange={e => handleChange('institutionName', e.target.value)} />
// // //                                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
// // //                                             <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Name" value={certData.signatoryName} onChange={e => handleChange('signatoryName', e.target.value)} />
// // //                                             <input className="wm-form-input" style={{ margin: 0 }} type="date" value={certData.issueDate} onChange={e => handleChange('issueDate', e.target.value)} />
// // //                                         </div>
// // //                                         <input className="wm-form-input" style={{ margin: 0 }} placeholder="Signatory Title" value={certData.signatoryTitle} onChange={e => handleChange('signatoryTitle', e.target.value)} />
// // //                                         <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
// // //                                             <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}><ImageIcon size={14} /> Change Logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'logoUrl')} /></label>
// // //                                             <label className="mlab-btn mlab-btn--outline-blue" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}><ImageIcon size={14} /> Change Signature<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, 'sigUrl')} /></label>
// // //                                         </div>
// // //                                     </FormSection>
// // //                                 </div>
// // //                             </div>

// // //                             {/* Right Side (Canvas & Controls) */}
// // //                             <div className="cdp-panel cert-preview-container" style={{ flex: 1, position: 'relative', background: '#e2e8f0', borderRadius: '8px', border: '1px solid var(--mlab-border)', overflow: 'hidden' }}>
// // //                                 <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem', background: 'white', padding: '0.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 100 }}>
// // //                                     <button type="button" className="mlab-icon-btn" onClick={handleZoomOut} disabled={isBulkGenerating}><ZoomOut size={16} color='var(--mlab-green-dark)' /></button>
// // //                                     <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)' }}>{Math.round(zoom * 100)}%</span>
// // //                                     <button type="button" className="mlab-icon-btn" onClick={handleZoomIn} disabled={isBulkGenerating}><ZoomIn size={16} color='var(--mlab-green-dark)' /></button>
// // //                                     <button type="button" className="mlab-icon-btn mlab-icon-btn--amber" onClick={handleResetZoom} disabled={isBulkGenerating}><RotateCcw size={16} /></button>
// // //                                 </div>

// // //                                 {view === 'bulk-review' && certData.recipientEmail && bulkSendEmails && (
// // //                                     <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #bbf7d0', zIndex: 100 }}>
// // //                                         <Mail size={14} /> Will be emailed to: {certData.recipientEmail}
// // //                                     </div>
// // //                                 )}

// // //                                 <div className="cert-canvas-wrapper" style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
// // //                                     <div className="cert-canvas" ref={certRef} style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', margin: 'auto', backgroundColor: '#fff', overflow: 'hidden' }}>
// // //                                         {certData.template === 'luxury' && <LuxuryTemplate data={certData} finalType={finalCertType} />}
// // //                                         {certData.template === 'official' && <OfficialTemplate data={certData} finalType={finalCertType} />}
// // //                                         {certData.template === 'modern' && <ModernTemplate data={certData} finalType={finalCertType} />}
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     </div>
// // //                 )}
// // //             </div>
// // //         </div>
// // //     )
// // // ;
// // // };