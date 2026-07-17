import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, FileText, ChevronLeft, Info, Clock, Sparkles, CheckCircle,
    Clipboard, DownloadCloud, Loader2,
    ChevronRight
} from 'lucide-react';
import moment from 'moment';
import { query, collection, where, getDocs } from 'firebase/firestore';
import './AIReportWizardModal.css';
import { useToast } from '../../../common/Toast/Toast';
import { db } from '../../../../lib/firebase';

export const ReportHistoryModal: React.FC<{
    eventId: string,
    eventName: string,
    onClose: () => void
}> = ({ eventId, eventName, onClose }) => {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<any | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const toast = useToast();

    useEffect(() => {
        let isMounted = true;

        const fetchHistory = async () => {
            if (!eventId) return;

            try {
                const q = query(collection(db, 'event_reports'), where('eventId', '==', eventId));
                const snap = await getDocs(q);

                if (!isMounted) return;

                const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                fetched.sort((a: any, b: any) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());

                setReports(fetched);
            } catch (error: any) {
                console.error("Failed to fetch reports:", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchHistory();
        return () => { isMounted = false; };
    }, [eventId]);

    const copyToGoogleDocs = async (markdown: string) => {
        toast.info("Preparing document with embedded images...");

        let html = markdown
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

        const imgMatches = [...markdown.matchAll(/!\[.*?\]\((.*?)\)/gim)];

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
            const blobText = new Blob([markdown], { type: 'text/plain' });
            const clipboardItem = new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText });
            await navigator.clipboard.write([clipboardItem]);

            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
            toast.success("Copied! Open a blank Google Doc and press Ctrl+V");
        } catch (err) {
            const listener = (e: ClipboardEvent) => {
                e.preventDefault();
                e.clipboardData?.setData('text/html', html);
                e.clipboardData?.setData('text/plain', markdown);
            };
            document.addEventListener('copy', listener);
            document.execCommand('copy');
            document.removeEventListener('copy', listener);

            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
            toast.success("Copied via fallback! Open a blank Google Doc and press Ctrl+V");
        }
    };

    const exportToWord = async (markdown: string, dateStr: string) => {
        setIsExporting(true);
        toast.info("Preparing fully editable MS Word document with embedded media...", 4000);

        let html = markdown
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
        const boundary = "----=_NextPart_Boundary_" + Date.now();
        let mhtmlImages = "";
        let imgIndex = 0;

        for (const match of imgMatches) {
            const originalTag = match[0];
            const imageUrl = match[1];
            const contentLocation = `image_${imgIndex}.jpeg`;

            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();

                const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const result = reader.result as string;
                        resolve(result.split(',')[1]);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });

                html = html.replace(originalTag, `<br><img src="${contentLocation}" width="500" style="border-radius: 8px; margin: 10px 0;" /><br>`);

                mhtmlImages += `\n--${boundary}\nContent-Location: ${contentLocation}\nContent-Type: image/jpeg\nContent-Transfer-Encoding: base64\n\n${base64Data}\n`;
                imgIndex++;
            } catch (err) {
                const xmlSafeUrl = imageUrl.replace(/&/g, '&amp;');
                html = html.replace(originalTag, `<br><a href="${xmlSafeUrl}">[View Attached Image]</a><br>`);
            }
        }

        const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>mLab Report</title></head><body>";
        const footer = "</body></html>";
        const sourceHTML = header + html + footer;

        const mhtml = `MIME-Version: 1.0\nContent-Type: multipart/related; boundary="${boundary}"\n\n--${boundary}\nContent-Type: text/html; charset="utf-8"\nContent-Transfer-Encoding: 8bit\n\n${sourceHTML}\n${mhtmlImages}\n--${boundary}--`;

        const blob = new Blob([mhtml], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);

        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = url;
        fileDownload.download = `mLab_Report_${eventName.replace(/\s+/g, '_')}_${moment(dateStr).format('YYYYMMDD')}.doc`;
        fileDownload.click();
        document.body.removeChild(fileDownload);
        URL.revokeObjectURL(url);

        toast.success("Editable MS Word Document Downloaded!");
        setIsExporting(false);
    };

    return createPortal(
        <div className="wizard-overlay" onClick={onClose}>
            <div className="wizard-modal" onClick={e => e.stopPropagation()}>

                {/* Reusing Wizard Header */}
                <div className="wizard-header">
                    <div className="wizard-header__title-group">
                        <div className="wizard-header__icon">
                            <FileText size={20} color="#94c73d" />
                        </div>
                        <h2 className="wizard-header__title">Report History</h2>
                    </div>
                    <button className="wizard-close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                {/* Reusing Wizard Body */}
                <div className="wizard-body">
                    {selectedReport ? (
                        <div>
                            <button className="wizard-btn wizard-btn--ghost" style={{ padding: '0 0 1.5rem 0' }} onClick={() => setSelectedReport(null)}>
                                <ChevronLeft size={16} /> Back to List
                            </button>

                            <div className="wizard-subheading" style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', fontFamily: 'Oswald, sans-serif', fontWeight: 500, color: 'var(--mlab-blue)', fontSize: '0.9rem' }}>
                                <Info size={14} /> Report Metadata
                            </div>

                            <div className="wizard-grid-2" style={{ background: '#f8fafc', padding: '1.5rem', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                                <div>
                                    <div className="wizard-label">Generated Date</div>
                                    <div style={{ fontSize: '0.95rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{moment(selectedReport.generatedAt).format('D MMM YYYY, HH:mm')}</div>
                                </div>
                                <div>
                                    <div className="wizard-label">AI Engine</div>
                                    <div style={{ fontSize: '0.95rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{selectedReport.modelUsed}</div>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div className="wizard-label">Media Embedded</div>
                                    <div style={{ fontSize: '0.95rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{selectedReport.photoUrls?.length || 0} Photos</div>
                                </div>
                            </div>

                            <div className="wizard-grid-2" style={{ marginBottom: '1.5rem' }}>
                                <button
                                    style={{ borderRadius: 0, color: 'white' }}
                                    className={`wizard-btn ${isCopied ? 'wizard-btn--green' : 'wizard-btn--primary'}`}
                                    onClick={() => copyToGoogleDocs(selectedReport.markdown)}
                                    disabled={isCopied}
                                >
                                    {isCopied ? <><CheckCircle size={18} /> Copied!</> : <><Clipboard size={18} /> Copy to Google Docs</>}
                                </button>
                                <button
                                    style={{ borderRadius: 0 }}
                                    className="wizard-btn wizard-btn--outline"
                                    onClick={() => exportToWord(selectedReport.markdown, selectedReport.generatedAt)}
                                    disabled={isExporting}
                                >
                                    {isExporting ? <Loader2 size={18} className="spin" /> : <DownloadCloud size={18} />} Download MS Word
                                </button>
                            </div>

                            <div className="wizard-subheading" style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', fontFamily: 'Oswald, sans-serif', fontWeight: 500, color: 'var(--mlab-blue)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                <FileText size={14} /> Report Preview
                            </div>

                            {/* Reusing Wizard Card for Preview Box */}
                            <div className="wizard-card" style={{ textAlign: 'left', padding: '1.5rem', fontSize: '0.85rem', color: 'var(--mlab-grey)', whiteSpace: 'pre-wrap', maxHeight: '250px', overflowY: 'auto' }}>
                                {selectedReport.markdown}
                            </div>
                        </div>
                    ) : (
                        <>
                            {loading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--mlab-grey)' }}>
                                    <Loader2 size={32} className="spin" style={{ marginBottom: '10px' }} />
                                    Loading history...
                                </div>
                            ) : reports.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--mlab-grey)' }}>
                                    <FileText size={40} style={{ opacity: 0.3, margin: '0 auto 1rem' }} />
                                    <h4 style={{ margin: '0 0 8px', color: 'var(--mlab-blue)', fontFamily: 'Oswald, sans-serif' }}>No Reports Found</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem' }}>You haven't generated any AI reports for this event yet.</p>
                                </div>
                            ) : (
                                <div>
                                    {reports.map((report) => (
                                        <div
                                            key={report.id}
                                            className="wizard-card"
                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', marginBottom: '10px' }}
                                            onClick={() => setSelectedReport(report)}
                                            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--mlab-blue)'}
                                            onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '1.1rem', fontFamily: 'Oswald, sans-serif' }}>
                                                    {moment(report.generatedAt).format('D MMMM YYYY')}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--mlab-grey)', marginTop: '4px' }}>
                                                    <Clock size={12} /> {moment(report.generatedAt).format('HH:mm A')}
                                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                                    <Sparkles size={12} color="var(--mlab-green)" /> {report.modelUsed}
                                                </div>
                                            </div>
                                            <ChevronRight size={20} color="var(--mlab-grey)" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};