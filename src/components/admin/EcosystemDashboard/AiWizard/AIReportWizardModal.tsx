// AIReportWizardModal.tsx
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Users, FileText, Image as ImageIcon, MessageSquare, CheckCircle,
    BarChart2, Upload, Clipboard, DownloadCloud, Loader2, Sparkles, ChevronRight, ChevronLeft
} from 'lucide-react';
import moment from 'moment';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import './AIReportWizardModal.css';
import type { EcosystemEvent } from '../../../../types/ecosystem.types';
import { useToast } from '../../../common/Toast/Toast';

const storage = getStorage();
const cloudFunctions = getFunctions();

export const AIReportWizardModal: React.FC<{
    event: EcosystemEvent,
    checkins: any[],
    crmProfiles: Record<string, any>,
    onClose: () => void
}> = ({ event, checkins, crmProfiles, onClose }) => {
    const [step, setStep] = useState(1);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState("");
    const [reportResult, setReportResult] = useState<{ markdown: string, modelUsed: string } | null>(null);

    const [templateFile, setTemplateFile] = useState<File | null>(null);
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);
    const [context, setContext] = useState({ objectives: '', highlights: '', challenges: '' });
    const [includeCharts, setIncludeCharts] = useState(true);

    const toast = useToast();
    const templateInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const youthCount = checkins.filter(c => {
        const email = c.guestEmail?.toLowerCase();
        return email ? !!crmProfiles[email]?.isYouth : false;
    }).length;

    const femaleCount = checkins.filter(c => {
        const email = c.guestEmail?.toLowerCase();
        return email ? crmProfiles[email]?.gender === 'Female' : false;
    }).length;

    // 🚀 NEW: Calculate Male participants
    const maleCount = checkins.filter(c => {
        const email = c.guestEmail?.toLowerCase();
        return email ? crmProfiles[email]?.gender === 'Male' : false;
    }).length;

    const capacityPercent = event?.maxCapacity ? Math.round((checkins.length / event.maxCapacity) * 100) : 0;


    useEffect(() => {
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setProgress(5);
        setProgressText("Initializing AI Engine...");

        try {
            const uploadedPhotoUrls: string[] = [];
            let uploadedTemplateUrl: string | null = null;

            if (templateFile) {
                setProgressText("Uploading template document...");
                setProgress(15);
                const safeName = templateFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
                const tempRef = ref(storage, `ai_reports/templates/${event.id}_${Date.now()}_${safeName}`);
                await uploadBytes(tempRef, templateFile);
                uploadedTemplateUrl = await getDownloadURL(tempRef);
            }

            if (photoFiles.length > 0) {
                setProgressText(`Uploading ${photoFiles.length} photos...`);
                setProgress(25);
                for (let i = 0; i < photoFiles.length; i++) {
                    const file = photoFiles[i];
                    const photoRef = ref(storage, `ai_reports/events/${event.id}_photo_${i}_${Date.now()}`);
                    await uploadBytes(photoRef, file);
                    const url = await getDownloadURL(photoRef);
                    uploadedPhotoUrls.push(url);
                }
            }

            setProgressText("Connecting to Multi-Provider AI Gateway...");
            setProgress(35);

            intervalRef.current = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 95) return prev;
                    if (prev === 60) setProgressText("Synthesizing event metrics...");
                    if (prev === 80) setProgressText("Formatting QCTO compliance structure...");
                    return prev + 2;
                });
            }, 800);

            const generateEventReport = httpsCallable(cloudFunctions, 'generateEventReport');

            const payload = {
                eventId: event.id,
                eventDetails: {
                    eventName: event.eventName,
                    location: event.location,
                    date: moment(event.date).format('D MMM YYYY'),
                },
                metrics: {
                    totalAttendance: checkins.length,
                    maxCapacity: event.maxCapacity || 0,
                    youthCount: youthCount,
                    femaleCount: femaleCount,
                    maleCount: maleCount, // 🚀 NEW: Pass to backend
                },
                humanContext: {
                    highlights: context.highlights,
                    challenges: context.challenges,
                },
                includeCharts: includeCharts,
                photoUrls: uploadedPhotoUrls,
                templateUrl: uploadedTemplateUrl
            };

            const result = await generateEventReport(payload);
            const data = result.data as any;

            if (intervalRef.current) clearInterval(intervalRef.current);

            if (data.success) {
                setProgress(100);
                setProgressText("Report saved to history!");
                setReportResult({ markdown: data.markdown, modelUsed: data.modelUsed });
                setTimeout(() => setStep(5), 600);
            }

        } catch (error: any) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            console.error("Generation Error:", error);
            toast.error(error.message || "Failed to generate report.");
            setIsGenerating(false);
            setProgress(0);
        }
    };

    const copyToGoogleDocs = async () => {
        if (!reportResult) return;
        toast.info("Preparing document with embedded images...");

        let html = reportResult.markdown
            .replace(/^### (.*$)/gim, '<h3 style="color: #073f4e; font-family: Arial, sans-serif;">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 style="color: #073f4e; font-family: Arial, sans-serif; border-bottom: 1px solid #ccc; padding-bottom: 5px;">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 style="color: #073f4e; font-family: Arial, sans-serif;">$1</h1>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/^\- (.*$)/gim, '<ul style="margin-top: 0; margin-bottom: 4px;"><li>$1</li></ul>')
            .replace(/<\/ul>\n<ul[^>]*>/gim, '')
            .replace(/\n\n/gim, '<br><br>');

        html = html.replace(/<chart-data>([\s\S]*?)<\/chart-data>/gim, (match, jsonString) => {
            try {
                const data = JSON.parse(jsonString);
                let table = '<table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; margin-top: 15px; font-family: Arial, sans-serif;">';
                table += '<tr style="background-color: #f1f5f9;"><th style="text-align: left;">Demographic Metric</th><th style="text-align: left;">Count</th></tr>';
                data.forEach((row: any) => { table += `<tr><td>${row.name}</td><td><strong>${row.value}</strong></td></tr>`; });
                table += '</table>';
                return table;
            } catch (e) { return '<em>[Chart Data Parsing Error]</em>'; }
        });

        const imgMatches = [...reportResult.markdown.matchAll(/!\[.*?\]\((.*?)\)/gim)];

        for (const match of imgMatches) {
            const originalTag = match[0];
            const imageUrl = match[1];
            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                const resizedBase64 = await new Promise<string>((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const maxW = 800;
                        const scale = Math.min(1, maxW / img.width);
                        canvas.width = img.width * scale;
                        canvas.height = img.height * scale;
                        const ctx = canvas.getContext('2d');
                        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/jpeg', 0.85));
                    };
                    img.onerror = reject;
                    img.src = URL.createObjectURL(blob);
                });
                html = html.replace(originalTag, `<br><img src="${resizedBase64}" width="500" style="border-radius: 8px; margin: 10px 0;" /><br>`);
            } catch (err) {
                const xmlSafeUrl = imageUrl.replace(/&/g, '&amp;');
                html = html.replace(originalTag, `<br><a href="${xmlSafeUrl}">[Click to View Image]</a><br>`);
            }
        }

        try {
            window.focus();
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob([reportResult.markdown], { type: 'text/plain' });
            const clipboardItem = new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText });
            await navigator.clipboard.write([clipboardItem]);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
            toast.success("Copied! Open a blank Google Doc and press Ctrl+V");
        } catch (err) {
            const listener = (e: ClipboardEvent) => {
                e.preventDefault();
                e.clipboardData?.setData('text/html', html);
                e.clipboardData?.setData('text/plain', reportResult.markdown);
            };
            document.addEventListener('copy', listener);
            document.execCommand('copy');
            document.removeEventListener('copy', listener);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
            toast.success("Copied via fallback! Open a blank Google Doc and press Ctrl+V");
        }
    };

    const exportToWord = async () => {
        if (!reportResult) return;
        setIsExporting(true);
        toast.info("Preparing MS Word document... rendering media files...");

        let html = reportResult.markdown
            .replace(/^### (.*$)/gim, '<h3 style="color: #073f4e; font-family: Arial, sans-serif;">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 style="color: #073f4e; font-family: Arial, sans-serif; border-bottom: 1px solid #ccc; padding-bottom: 5px;">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 style="color: #073f4e; font-family: Arial, sans-serif;">$1</h1>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/^\- (.*$)/gim, '<ul style="margin-top: 0; margin-bottom: 4px;"><li>$1</li></ul>')
            .replace(/<\/ul>\n<ul[^>]*>/gim, '')
            .replace(/\n\n/gim, '<br><br>');

        html = html.replace(/<chart-data>([\s\S]*?)<\/chart-data>/gim, (match, jsonString) => {
            try {
                const data = JSON.parse(jsonString);
                let table = '<table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; margin-top: 15px; font-family: Arial, sans-serif;">';
                table += '<tr style="background-color: #f1f5f9;"><th style="text-align: left;">Demographic Metric</th><th style="text-align: left;">Count</th></tr>';
                data.forEach((row: any) => { table += `<tr><td>${row.name}</td><td><strong>${row.value}</strong></td></tr>`; });
                table += '</table>';
                return table;
            } catch (e) { return '<em>[Chart Data Parsing Error]</em>'; }
        });

        const imgMatches = [...html.matchAll(/!\[.*?\]\((.*?)\)/gim)];

        for (const match of imgMatches) {
            const originalTag = match[0];
            const imageUrl = match[1];
            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                const resizedBase64 = await new Promise<string>((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const maxW = 800;
                        const scale = Math.min(1, maxW / img.width);
                        canvas.width = img.width * scale;
                        canvas.height = img.height * scale;
                        const ctx = canvas.getContext('2d');
                        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/jpeg', 0.85));
                    };
                    img.onerror = reject;
                    img.src = URL.createObjectURL(blob);
                });
                html = html.replace(originalTag, `<br><img src="${resizedBase64}" width="500" /><br>`);
            } catch (err) {
                const xmlSafeUrl = imageUrl.replace(/&/g, '&amp;');
                html = html.replace(originalTag, `<br><img src="${xmlSafeUrl}" width="500" /><br><em><a href="${xmlSafeUrl}">[Click to View Attached Image]</a></em><br>`);
            }
        }

        const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>mLab Report</title></head><body>";
        const footer = "</body></html>";
        const sourceHTML = header + html + footer;

        const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);

        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = url;
        fileDownload.download = `mLab_Report_${event.eventName.replace(/\s+/g, '_')}.doc`;
        fileDownload.click();
        document.body.removeChild(fileDownload);
        URL.revokeObjectURL(url);

        toast.success("MS Word Document Downloaded! Open in MS Word.");
        setIsExporting(false);
    };

    const steps = [
        { num: 1, label: "DATA", icon: <Users size={16} /> },
        { num: 2, label: "TEMPLATE", icon: <FileText size={16} /> },
        { num: 3, label: "MEDIA", icon: <ImageIcon size={16} /> },
        { num: 4, label: "CONTEXT", icon: <MessageSquare size={16} /> }
    ];

    return createPortal(
        <div className="wizard-overlay" onClick={onClose}>

            <div className="wizard-modal" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="wizard-header">
                    <div className="wizard-header__title-group">
                        <div className="wizard-header__icon">
                            <Sparkles size={20} color="#94c73d" />
                        </div>
                        <h2 className="wizard-header__title">Generate M&E Report</h2>
                    </div>
                    <button className="wizard-close-btn" onClick={onClose} disabled={isGenerating}>
                        <X size={24} />
                    </button>
                </div>

                {/* Stepper Navigation */}
                {step < 5 && (
                    <div className="wizard-stepper">
                        {steps.map((s, index) => (
                            <div key={s.num} className={`wizard-step ${step === s.num ? 'wizard-step--active' : ''} ${step > s.num ? 'wizard-step--complete' : ''}`}>
                                {index < 3 && <div className="wizard-step__line" />}
                                <div className="wizard-step__circle">
                                    {step > s.num ? <CheckCircle size={18} /> : s.icon}
                                </div>
                                <span className="wizard-step__label">{s.label}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Body Content */}
                <div className="wizard-body">

                    {step === 1 && (
                        <div>
                            <h3 className="wizard-heading">Data Extraction</h3>
                            <p className="wizard-subheading">We have automatically gathered the following metrics to feed into your report.</p>
                            <div className="wizard-grid-2">
                                <div className="wizard-card wizard-card--blue">
                                    <Users size={24} color="#0284c7" style={{ margin: '0 auto 12px' }} />
                                    <div className="wizard-card__value">{checkins.length}</div>
                                    <div className="wizard-card__label" style={{ color: '#0369a1' }}>Total Attendance</div>
                                    <div style={{ fontSize: '0.8rem', color: '#0284c7', marginTop: '8px' }}>{capacityPercent}% Capacity Reached</div>
                                </div>
                                <div className="wizard-card wizard-card--green">
                                    <BarChart2 size={24} color="#84cc16" style={{ margin: '0 auto 12px' }} />
                                    <div className="wizard-card__value" style={{ fontSize: '1.8rem' }}>{youthCount} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#4d7c0f' }}>Youth</span></div>
                                    <div className="wizard-card__value" style={{ fontSize: '1.8rem', marginTop: '8px' }}>{femaleCount} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#4d7c0f' }}>Female</span></div>
                                    <div className="wizard-card__label" style={{ color: '#4d7c0f', marginTop: '8px' }}>Demographics</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <h3 className="wizard-heading">Style Template</h3>
                            <p className="wizard-subheading">Upload a screenshot of a report format you like. The AI will analyze the layout and mimic it.</p>
                            <input
                                type="file"
                                ref={templateInputRef}
                                style={{ display: 'none' }}
                                accept="image/png, image/jpeg"
                                onChange={(e) => e.target.files && setTemplateFile(e.target.files[0])}
                            />
                            <div className="wizard-dropzone" onClick={() => templateInputRef.current?.click()}>
                                <Upload size={32} color={templateFile ? '#94c73d' : '#6b6b6b'} style={{ margin: '0 auto 12px' }} />
                                <div style={{ fontWeight: 600, color: templateFile ? '#4d7c0f' : '#0f172a' }}>
                                    {templateFile ? templateFile.name : "Drag & Drop Screenshot Here"}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#6b6b6b', marginTop: '4px' }}>
                                    PNG or JPG only. AI cannot read PDF/Word files directly.
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div>
                            <h3 className="wizard-heading">Event Media</h3>
                            <p className="wizard-subheading">Upload up to 3 high-quality photos. These will be embedded into the final document.</p>
                            <input type="file" ref={photoInputRef} style={{ display: 'none' }} accept="image/jpeg, image/png, image/webp" multiple onChange={(e) => e.target.files && setPhotoFiles(Array.from(e.target.files).slice(0, 3))} />
                            <div className="wizard-dropzone" onClick={() => photoInputRef.current?.click()}>
                                <ImageIcon size={32} color={photoFiles.length > 0 ? '#94c73d' : '#6b6b6b'} style={{ margin: '0 auto 12px' }} />
                                <div style={{ fontWeight: 600, color: photoFiles.length > 0 ? '#4d7c0f' : '#0f172a' }}>{photoFiles.length > 0 ? `${photoFiles.length} photo(s) selected` : "Upload Event Photos"}</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b6b6b', marginTop: '4px' }}>JPEG, PNG (Max 3 files)</div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div>
                            <h3 className="wizard-heading">Human Context</h3>
                            <p className="wizard-subheading">Provide short bullet points; the AI will expand them professionally.</p>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="wizard-label">Main Objective or Highlight</label>
                                <textarea className="wizard-textarea" rows={2} placeholder="e.g. The winning team built an AI agriculture app..." value={context.highlights} onChange={e => setContext({ ...context, highlights: e.target.value })} />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="wizard-label">Notable Challenges</label>
                                <textarea className="wizard-textarea" rows={2} placeholder="e.g. Load shedding delayed the start by 30 mins..." value={context.challenges} onChange={e => setContext({ ...context, challenges: e.target.value })} />
                            </div>

                            <div className="wizard-toggle-container">
                                <div>
                                    <div className="wizard-toggle-label">
                                        <BarChart2 size={16} /> Include Data Visualizations
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '4px' }}>Render beautiful demographics tables.</div>
                                </div>
                                <div className={`wizard-toggle ${includeCharts ? 'wizard-toggle--active' : ''}`} onClick={() => setIncludeCharts(!includeCharts)}>
                                    <div className="wizard-toggle__thumb" />
                                </div>
                            </div>

                            {isGenerating && (
                                <div style={{ marginTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#073f4e' }}>{progressText}</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94c73d' }}>{progress}%</span>
                                    </div>
                                    <div style={{ width: '100%', background: '#e2e8f0', height: '8px', overflow: 'hidden' }}>
                                        <div className="wizard-progress-bar" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 5 && reportResult && (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                            <div className="wizard-success-icon">
                                <CheckCircle size={32} color="#94c73d" />
                            </div>
                            <h3 className="wizard-heading" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Report Generated Successfully</h3>
                            <p style={{ color: '#6b6b6b', fontSize: '0.95rem', marginBottom: '16px' }}>The AI has finished analyzing the event metrics and writing the formal documentation.</p>

                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 12px', marginBottom: '32px' }}>
                                <Sparkles size={14} color="#3b82f6" />
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1d4ed8' }}>AI Engine: {reportResult.modelUsed}</span>
                            </div>

                            <div className="wizard-grid-2">
                                <button style={{ borderRadius: 0 }} className={`wizard-btn ${isCopied ? 'wizard-btn--green' : 'wizard-btn--primary'}`} onClick={copyToGoogleDocs} disabled={isCopied}>
                                    {isCopied ? <><CheckCircle size={18} /> Copied!</> : <><Clipboard size={18} /> Copy for Google Docs</>}
                                </button>
                                <button style={{ borderRadius: 0 }} className="wizard-btn wizard-btn--outline" onClick={exportToWord} disabled={isExporting}>
                                    {isExporting ? <Loader2 size={18} className="spin" /> : <DownloadCloud size={18} />} Download MS Word
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer / Actions */}
                <div className="wizard-footer">
                    {step < 5 ? (
                        <>
                            <button className="wizard-btn wizard-btn--ghost" style={{ borderRadius: 0 }} onClick={() => step > 1 ? setStep(step - 1) : onClose()} disabled={isGenerating}>
                                {step > 1 ? <><ChevronLeft size={16} /> Back</> : "Cancel"}
                            </button>

                            {step < 4 ? (
                                <button className="wizard-btn wizard-btn--green" style={{ borderRadius: 0, color: 'white' }} onClick={() => setStep(step + 1)}>
                                    Continue <ChevronRight size={18} />
                                </button>
                            ) : (
                                <button className="wizard-btn wizard-btn--primary" style={{ borderRadius: 0 }} onClick={handleGenerate} disabled={isGenerating}>
                                    {isGenerating ? <><Loader2 size={18} className="spin" /> Generating...</> : <><Sparkles size={18} color="#94c73d" /> Synthesize Report</>}
                                </button>
                            )}
                        </>
                    ) : (
                        <button className="wizard-btn wizard-btn--primary" onClick={onClose} style={{ marginLeft: 'auto', borderRadius: 0 }}>
                            Close Window
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};