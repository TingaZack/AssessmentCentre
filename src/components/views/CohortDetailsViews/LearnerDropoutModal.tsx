// src/components/common/LearnerDropoutModal/LearnerDropoutModal.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    Loader2, UploadCloud, UserMinus, FileText, AlertCircle, X, ExternalLink,
    FileDown, Mail, CheckCircle2, AlertTriangle, RefreshCw, Clock, UserCheck
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useToast } from '../../common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import type { DashboardLearner } from '../../../types';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface Props {
    learner: DashboardLearner;
    onClose: () => void;
    onConfirm: (data: {
        date: string;
        reason: string;
        notes: string;
        evidenceUrl: string;
        resignationUrl: string;
    }) => Promise<void>;
}

export const LearnerDropoutModal: React.FC<Props> = ({ learner, onClose, onConfirm }) => {
    // 1. Access global store to get user, institution settings, and cohort data
    const { user, settings, cohorts } = useStore() as any;

    const learnerData = learner as any;
    const isViewMode = learnerData.status === 'dropped';

    // 2. Form State
    const [date, setDate] = useState(learnerData.exitDate || new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState(learnerData.exitReasonCategory || 'Personal/Other');
    const [notes, setNotes] = useState(learnerData.exitNotes || '');
    const [file, setFile] = useState<File | null>(null);
    const [resignationFile, setResignationFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [isReinstating, setIsReinstating] = useState(false);

    // 3. Extract Email & Delivery Status Object
    const targetEmail = learnerData.email || learnerData.demographics?.learnerEmailAddress;
    const hasEmail = Boolean(targetEmail?.trim());

    // Local state for instant optimistic UI updates without needing to re-open the modal
    const [localEmailStatus, setLocalEmailStatus] = useState(learnerData.withdrawalEmailStatus);

    useEffect(() => {
        setLocalEmailStatus(learnerData.withdrawalEmailStatus);
    }, [learnerData.withdrawalEmailStatus]);

    const toast = useToast();

    const existingEvidenceUrl = learnerData.exitEvidenceUrl || '';
    const existingResignationUrl = learnerData.resignationLetterUrl || '';

    // // Debug Log on Modal Launch (KEPT INTACT)
    // useEffect(() => {
    //     console.group("🚀 DROPOUT MODAL LAUNCHED");
    //     console.log("🆔 LEARNER ID:", learnerData.learnerId || learnerData.id);
    //     console.log("🆔 ID NUMBER:", learnerData.idNumber);
    //     console.log("📧 TARGET EMAIL:", targetEmail);
    //     console.log("STATUS OBJECT:", localEmailStatus);
    //     console.groupEnd();
    // }, [learnerData, targetEmail, localEmailStatus]);

    // 4. Submit New Dropout Action
    const handleSubmit = async () => {
        if (!date) { toast.error('Exit date is required.'); return; }
        setIsSubmitting(true);
        try {
            let evidenceUrl = existingEvidenceUrl;
            let resignationUrl = existingResignationUrl;

            if (file) {
                const storageRef = ref(getStorage(), `dropout_evidence/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
                await uploadBytes(storageRef, file);
                evidenceUrl = await getDownloadURL(storageRef);
            }
            if (resignationFile) {
                const resRef = ref(getStorage(), `dropout_resignation/${Date.now()}_${resignationFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
                await uploadBytes(resRef, resignationFile);
                resignationUrl = await getDownloadURL(resRef);
            }
            await onConfirm({ date, reason, notes, evidenceUrl, resignationUrl });
        } catch (err: any) {
            toast.error(err?.message || 'Failed to process upload.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 5. Dynamic Resend Email Handler with Toast Feedback and Immediate UI Update
    const handleResendEmail = async () => {
        if (!hasEmail) {
            toast.error("Cannot resend: No email address found on profile.");
            return;
        }

        setIsResending(true);
        toast.info("Processing withdrawal record update...");

        try {
            const functions = getFunctions();
            const resendFn = httpsCallable(functions, 'resendWithdrawalEmail');

            const trueLearnerDocId = learnerData.idNumber || (learnerData.id?.includes('_') ? learnerData.id.split('_')[1] : learnerData.id);

            const response = await resendFn({
                learnerId: trueLearnerDocId,
                cohortId: learnerData.cohortId,
                enrollmentId: learnerData.enrollmentId || learnerData.id,
                email: targetEmail,
                fullName: learnerData.fullName || "Learner",
                programmeName: learnerData.qualification?.name || "the STEP UP Programme"
            });

            // console.log("✅ SERVER RESPONSE:", response.data);

            setLocalEmailStatus({
                sent: true,
                sentAt: new Date().toISOString(),
                recipient: targetEmail,
                isManualResend: true
            });

            toast.success("Record updated successfully!");
        } catch (err: any) {
            console.error("SERVER ERROR:", err);
            toast.error(`Resend failed: ${err.message || "Unknown error"}`);
        } finally {
            setIsResending(false);
        }
    };

    // 🚀 6. REINSTATE LEARNER HANDLER
    const handleReinstate = async () => {
        const confirmMsg = `Are you sure you want to reinstate ${learner.fullName}? Their status will be restored to 'Active' in this cohort.`;
        if (!window.confirm(confirmMsg)) return;

        setIsReinstating(true);
        toast.info(`Reinstating ${learner.fullName}...`);

        try {
            const functions = getFunctions();
            const reinstateFn = httpsCallable(functions, 'reinstateLearner');

            const trueLearnerDocId = learnerData.idNumber || (learnerData.id?.includes('_') ? learnerData.id.split('_')[1] : learnerData.id);

            await reinstateFn({
                learnerId: trueLearnerDocId,
                enrollmentId: learnerData.enrollmentId || learnerData.id,
                cohortId: learnerData.cohortId,
                notes: "Reinstated via Admin Withdrawal Record modal"
            });

            toast.success(`${learner.fullName} has been successfully reinstated to Active status!`);

            // Refresh global state store if method exists
            const globalStore = useStore.getState() as any;
            if (globalStore.fetchLearners) {
                globalStore.fetchLearners(true);
            }

            onClose();
        } catch (err: any) {
            console.error("REINSTATEMENT ERROR:", err);
            toast.error(`Reinstatement failed: ${err.message || "Unknown error"}`);
        } finally {
            setIsReinstating(false);
        }
    };

    // 7. Dynamic Card Status Theme Calculation (Soft Red / Soft Orange / Soft Green)
    const getEmailStatusUI = () => {
        if (!hasEmail) {
            return {
                bg: '#fef2f2',
                border: '#fecaca',
                iconColor: '#dc2626',
                textColor: '#dc2626',
                icon: <AlertTriangle size={14} />,
                message: "Cannot send: No email address on profile"
            };
        }
        if (isResending) {
            return {
                bg: '#fffbeb',
                border: '#fde68a',
                iconColor: '#d97706',
                textColor: '#b45309',
                icon: <Clock size={14} />,
                message: "Sending email notice..."
            };
        }
        if (localEmailStatus?.sent === true) {
            return {
                bg: '#f0fdf4',
                border: '#bbf7d0',
                iconColor: '#16a34a',
                textColor: '#15803d',
                icon: <CheckCircle2 size={14} />,
                message: `Successfully delivered to ${localEmailStatus.recipient || targetEmail}`
            };
        }
        if (localEmailStatus?.error) {
            return {
                bg: '#fef2f2',
                border: '#fecaca',
                iconColor: '#dc2626',
                textColor: '#dc2626',
                icon: <AlertTriangle size={14} />,
                message: `Delivery failed: ${localEmailStatus.error}`
            };
        }
        // Unsent State (Default) -> Soft Red
        return {
            bg: '#fef2f2',
            border: '#fecaca',
            iconColor: '#dc2626',
            textColor: '#dc2626',
            icon: <AlertCircle size={14} />,
            message: "Email notice not sent yet."
        };
    };

    const statusUI = getEmailStatusUI();

    // 8. Attachment Preview Component
    const renderEvidencePreview = (url: string, label: string) => {
        if (!url) {
            return (
                <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <FileText size={24} color="#94a3b8" />
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Not Provided</span>
                    </div>
                </div>
            );
        }

        const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
        const isImage = url.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/);

        if (isPdf) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
                        <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
                    </div>
                    <iframe src={url} title={label} style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', background: 'white' }} />
                </div>
            );
        }

        if (isImage) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
                        <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid #e2e8f0', background: 'white' }}>
                        <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                </div>
            );
        }

        return (
            <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', border: '1px solid var(--mlab-green)', background: '#f0fdf4', color: 'var(--mlab-green-dark)', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', height: '100%' }}>
                <FileText size={20} /> View {label} <ExternalLink size={14} />
            </a>
        );
    };

    // 9. Plain text parser for Quill HTML
    const parseHtmlToPlainText = (html: string) => {
        if (!html) return "No additional notes provided.";

        let cleanHtml = html.replace(/<br\s*[\/]?>/gi, '\n');
        cleanHtml = cleanHtml.replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n');

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cleanHtml;
        let text = tempDiv.textContent || tempDiv.innerText || "";

        text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u2022/g, '-')
            .replace(/\u00A0/g, ' ');

        return text.replace(/\n{3,}/g, '\n\n').trim() || "No additional notes provided.";
    };

    // 10. PDF Generation Report
    const handleGeneratePdfReport = async () => {
        setIsGeneratingPdf(true);
        toast.info("Generating official PDF and attaching evidence...");

        try {
            const cohort = cohorts?.find((c: any) => c.id === learner.cohortId);
            const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort?.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
            const sdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
            const institutionName = settings?.institutionName || 'Mobile Applications Laboratory';

            const pdfDoc = await PDFDocument.create();
            const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const pageWidth = 595.28;
            const pageHeight = 841.89;
            const margin = 50;
            const bottomMargin = 50;
            const maxWidth = pageWidth - (margin * 2);

            let page = pdfDoc.addPage([pageWidth, pageHeight]);
            let currentY = pageHeight - margin;

            const checkAndAddPage = (requiredSpace: number) => {
                if (currentY - requiredSpace < bottomMargin) {
                    page = pdfDoc.addPage([pageWidth, pageHeight]);
                    currentY = pageHeight - margin;
                }
            };

            const drawWrappedText = (text: string, font: any, size: number, color: any, lineHeight: number = 14) => {
                const paragraphs = text.split('\n');

                for (const para of paragraphs) {
                    if (para.trim() === '') {
                        currentY -= lineHeight / 2;
                        checkAndAddPage(lineHeight);
                        continue;
                    }

                    const words = para.split(' ');
                    let line = '';

                    for (let n = 0; n < words.length; n++) {
                        const testLine = line + words[n] + ' ';
                        const testWidth = font.widthOfTextAtSize(testLine, size);

                        if (testWidth > maxWidth && line.length > 0) {
                            checkAndAddPage(lineHeight);
                            page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
                            line = words[n] + ' ';
                            currentY -= lineHeight;
                        } else {
                            line = testLine;
                        }
                    }

                    if (line.trim().length > 0) {
                        checkAndAddPage(lineHeight);
                        page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
                        currentY -= lineHeight;
                    }
                }
            };

            // 1. Draw Header
            page.drawText(institutionName, { x: margin, y: currentY, size: 18, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
            currentY -= 20;

            page.drawText(`QCTO Accredited Training Provider | SDP Code: ${sdpCode}`, { x: margin, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

            const generatedOn = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
            const docTitle = 'Official Withdrawal Record';
            const titleWidth = helveticaBold.widthOfTextAtSize(docTitle, 14);
            page.drawText(docTitle, { x: pageWidth - margin - titleWidth, y: currentY + 20, size: 14, font: helveticaBold, color: rgb(0.86, 0.15, 0.15) });
            const dateWidth = helvetica.widthOfTextAtSize(`Generated: ${generatedOn}`, 10);
            page.drawText(`Generated: ${generatedOn}`, { x: pageWidth - margin - dateWidth, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

            currentY -= 15;
            page.drawLine({ start: { x: margin, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 2, color: rgb(0.03, 0.24, 0.3) });
            currentY -= 35;

            // 2. Learner Details
            checkAndAddPage(60);
            page.drawText('LEARNER DETAILS', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
            currentY -= 20;
            page.drawText(`Full Name: ${learner.fullName}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
            const idText = `ID Number: ${learner.idNumber}`;
            const idWidth = helveticaBold.widthOfTextAtSize(idText, 12);
            page.drawText(idText, { x: pageWidth - margin - idWidth, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
            currentY -= 40;

            // 3. Exit Information
            checkAndAddPage(60);
            page.drawText('EXIT INFORMATION', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
            currentY -= 20;
            const formattedDate = new Date(date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
            page.drawText(`Date of Exit: ${formattedDate}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
            currentY -= 40;

            // 4. Additional Notes
            checkAndAddPage(60);
            page.drawText('ADDITIONAL CONTEXT / NOTES', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
            currentY -= 20;

            const plainTextNotes = parseHtmlToPlainText(notes);
            drawWrappedText(plainTextNotes, helvetica, 11, rgb(0.2, 0.2, 0.2), 14);
            currentY -= 30;

            // 5. Signature Area
            checkAndAddPage(100);

            let sigImg = null;
            if (user?.signatureUrl) {
                try {
                    const sigRes = await fetch(user.signatureUrl);
                    const sigBuffer = await sigRes.arrayBuffer();
                    const isPng = user.signatureUrl.toLowerCase().includes('.png');
                    sigImg = isPng ? await pdfDoc.embedPng(sigBuffer) : await pdfDoc.embedJpg(sigBuffer);
                } catch (e) {
                    console.warn("Could not load user signature image", e);
                }
            }

            if (sigImg) {
                const sigDims = sigImg.scale(1);
                const maxSigW = 180;
                const maxSigH = 50;
                const scale = Math.min(maxSigW / sigDims.width, maxSigH / sigDims.height);
                page.drawImage(sigImg, {
                    x: margin + 10,
                    y: currentY + 5,
                    width: sigDims.width * scale,
                    height: sigDims.height * scale,
                });
            } else {
                page.drawText(user?.fullName || 'Authorized Admin', { x: margin + 10, y: currentY + 10, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
            }

            page.drawText(generatedOn, { x: pageWidth - margin - 150, y: currentY + 10, size: 11, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

            page.drawLine({ start: { x: margin, y: currentY }, end: { x: margin + 200, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
            page.drawText(`Authorized by: ${user?.fullName || 'Manager'}`, { x: margin, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

            page.drawLine({ start: { x: pageWidth - margin - 200, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
            page.drawText('Date Authorized', { x: pageWidth - margin - 130, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

            // 6. Append Attachments
            const appendAttachment = async (url: string, label: string) => {
                if (!url) return;
                try {
                    const response = await fetch(url);
                    const buffer = await response.arrayBuffer();
                    const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
                    const isPng = url.toLowerCase().match(/\.(png)(\?|$)/);
                    const isJpg = url.toLowerCase().match(/\.(jpg|jpeg)(\?|$)/);

                    if (isPdf) {
                        const donorPdf = await PDFDocument.load(buffer);
                        const pages = await pdfDoc.copyPages(donorPdf, donorPdf.getPageIndices());
                        pages.forEach((p, i) => {
                            const donorPage = pdfDoc.addPage(p);
                            donorPage.drawText(`Attachment: ${label} (Page ${i + 1})`, { x: margin, y: donorPage.getSize().height - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
                        });
                    } else if (isPng || isJpg) {
                        const imgPage = pdfDoc.addPage([pageWidth, pageHeight]);
                        imgPage.drawText(`Attachment: ${label}`, { x: margin, y: pageHeight - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

                        let img;
                        if (isPng) img = await pdfDoc.embedPng(buffer);
                        if (isJpg) img = await pdfDoc.embedJpg(buffer);

                        if (img) {
                            const imgDims = img.scale(1);
                            const maxW = 450;
                            const maxH = 650;
                            let scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
                            const drawW = imgDims.width * scale;
                            const drawH = imgDims.height * scale;

                            imgPage.drawImage(img, {
                                x: (pageWidth - drawW) / 2,
                                y: (pageHeight - drawH) / 2 - 20,
                                width: drawW,
                                height: drawH,
                            });
                        }
                    }
                } catch (e) {
                    console.error(`Failed to fetch/append ${label}:`, e);
                }
            };

            await appendAttachment(existingResignationUrl, "Resignation Letter");
            await appendAttachment(existingEvidenceUrl, "Other Evidence");

            // 7. Save and Download
            const pdfBytes: any = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Withdrawal_Record_${learner.fullName.replace(/\s/g, '_')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success("PDF generated successfully!");
        } catch (err: any) {
            console.error(err);
            toast.error("Failed to generate PDF document.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
            <style>{` .wm-modal, .wm-btn, .mlab-btn { border-radius: 0 !important; } `}</style>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-red)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                        <UserMinus size={20} />
                    </div>
                    <div>
                        <h2 className="wm-modal__title">{isViewMode ? 'Withdrawal Record' : 'Process Learner Withdrawal'}</h2>
                        <p className="wm-modal__subtitle">
                            {isViewMode
                                ? `Official exit details for ${learner.fullName}`
                                : <>Officially remove <strong>{learner.fullName}</strong> from this cohort.</>
                            }
                        </p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>

                    {isViewMode ? (
                        <>
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', color: 'var(--mlab-midnight)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--mlab-grey)' }} />
                                <span>This learner was officially withdrawn on <strong>{new Date(date).toLocaleDateString('en-ZA')}</strong>. Their historical data is retained for QCTO auditing.</span>
                            </div>

                            {/* DYNAMIC COLOR-CODED EMAIL STATUS TRACKER CARD */}
                            <div style={{
                                background: statusUI.bg,
                                border: `1px solid ${statusUI.border}`,
                                padding: '12px', borderRadius: '0', fontSize: '0.85rem',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <Mail size={16} color={statusUI.iconColor} />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>Exit Survey Email Link</span>
                                        <span style={{ fontSize: '0.75rem', color: statusUI.textColor, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                            {statusUI.icon} {statusUI.message}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="mlab-btn mlab-btn--sm"
                                    onClick={handleResendEmail}
                                    disabled={isResending || isReinstating || !hasEmail}
                                    title={!hasEmail ? "Please edit the learner's profile and add an email address first." : "Resend withdrawal email"}
                                    style={{
                                        background: !hasEmail ? '#f1f5f9' : 'white',
                                        color: !hasEmail ? '#94a3b8' : 'var(--mlab-midnight)',
                                        border: '1px solid #cbd5e1',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        cursor: !hasEmail ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {isResending ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                                    Resend
                                </button>
                            </div>
                        </>
                    ) : (
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '0', color: '#991b1b', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>This action will update the learner's status to "Dropped", making them inactive in the roster while retaining their historical data for QCTO auditing. They will also receive an automated exit survey link.</span>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="wm-form-group" style={{ flex: 1 }}>
                            <label className="wm-form-label">Exit Date *</label>
                            <input type="date" className="wm-form-input" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} disabled={isViewMode} readOnly={isViewMode} />
                        </div>
                        <div className="wm-form-group" style={{ flex: 2 }}>
                            <label className="wm-form-label">Primary Reason *</label>
                            <select className="wm-form-input" value={reason} onChange={e => setReason(e.target.value)} disabled={isViewMode}>
                                <option value="Not Started">Not Started (Never Attended)</option>
                                <option value="Employment/New Job">Employment / New Job</option>
                                <option value="Medical/Health">Medical / Health Reasons</option>
                                <option value="Financial Constraints">Financial Constraints</option>
                                <option value="Academic Difficulty">Academic Difficulty</option>
                                <option value="Disciplinary Dismissal">Disciplinary Dismissal</option>
                                <option value="Relocation">Relocation</option>
                                <option value="Deceased">Deceased</option>
                                <option value="Personal/Other">Personal / Other</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className="wm-form-group" style={{ flex: 1 }}>
                            <label className="wm-form-label">Resignation Letter</label>
                            {isViewMode ? (
                                renderEvidencePreview(existingResignationUrl, 'Resignation Letter')
                            ) : (
                                <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '0', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
                                    <input type="file" id="resignation-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setResignationFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
                                    <label htmlFor="resignation-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
                                        <FileText size={24} color={resignationFile ? "var(--mlab-green)" : "#94a3b8"} />
                                        <span style={{ fontSize: '0.75rem', color: resignationFile ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
                                            {resignationFile ? resignationFile.name : (isViewMode ? 'Not Provided' : 'Upload Resignation Letter')}
                                        </span>
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="wm-form-group" style={{ flex: 1 }}>
                            <label className="wm-form-label">Other Evidence (e.g. Medical)</label>
                            {isViewMode ? (
                                renderEvidencePreview(existingEvidenceUrl, 'Other Evidence')
                            ) : (
                                <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '0', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
                                    <input type="file" id="evidence-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
                                    <label htmlFor="evidence-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
                                        <UploadCloud size={24} color={file ? "var(--mlab-green)" : "#94a3b8"} />
                                        <span style={{ fontSize: '0.75rem', color: file ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
                                            {file ? file.name : (isViewMode ? 'Not Provided' : 'Upload Other Evidence')}
                                        </span>
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="wm-form-group">
                        <label className="wm-form-label">Additional Context / Notes</label>
                        <div style={{ background: 'white', opacity: isViewMode ? 0.8 : 1 }}>
                            <ReactQuill
                                theme="snow"
                                value={notes}
                                onChange={setNotes}
                                placeholder="Provide further context regarding this withdrawal..."
                                style={{ height: '120px', color: 'black', marginBottom: '45px' }}
                                readOnly={isViewMode}
                            />
                        </div>
                    </div>
                </div>

                <div className="wm-modal__footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isSubmitting || isGeneratingPdf || isResending || isReinstating}>Close</button>

                    {isViewMode && (
                        <>
                            {/* REINSTATE LEARNER BUTTON */}
                            <button
                                className="mlab-btn"
                                style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                onClick={handleReinstate}
                                disabled={isSubmitting || isGeneratingPdf || isResending || isReinstating}
                            >
                                {isReinstating ? <Loader2 size={16} className="spin" /> : <UserCheck size={16} />} Reinstate Learner
                            </button>

                            <button
                                className="mlab-btn"
                                style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                onClick={handleGeneratePdfReport}
                                disabled={isSubmitting || isGeneratingPdf || isResending || isReinstating}
                            >
                                {isGeneratingPdf ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />} Generate PDF Report
                            </button>
                        </>
                    )}

                    {!isViewMode && (
                        <button
                            className="mlab-btn"
                            style={{ background: 'var(--mlab-red)', color: 'white', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            onClick={handleSubmit}
                            disabled={isSubmitting || isResending || isReinstating}
                        >
                            {isSubmitting ? <Loader2 size={16} className="spin" /> : <UserMinus size={16} />} Confirm Withdrawal
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};


// // src/components/common/LearnerDropoutModal/LearnerDropoutModal.tsx

// import React, { useState, useEffect } from 'react';
// import { createPortal } from 'react-dom';
// import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import {
//     Loader2, UploadCloud, UserMinus, FileText, AlertCircle, X, ExternalLink,
//     FileDown, Mail, CheckCircle2, AlertTriangle, RefreshCw, Clock
// } from 'lucide-react';
// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';
// import { useToast } from '../../common/Toast/Toast';
// import { useStore } from '../../../store/useStore';
// import type { DashboardLearner } from '../../../types';
// import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// interface Props {
//     learner: DashboardLearner;
//     onClose: () => void;
//     onConfirm: (data: {
//         date: string;
//         reason: string;
//         notes: string;
//         evidenceUrl: string;
//         resignationUrl: string;
//     }) => Promise<void>;
// }

// export const LearnerDropoutModal: React.FC<Props> = ({ learner, onClose, onConfirm }) => {
//     // 1. Access global store to get user, institution settings, and cohort data
//     const { user, settings, cohorts } = useStore() as any;

//     const learnerData = learner as any;
//     const isViewMode = learnerData.status === 'dropped';

//     // 2. Form State
//     const [date, setDate] = useState(learnerData.exitDate || new Date().toISOString().split('T')[0]);
//     const [reason, setReason] = useState(learnerData.exitReasonCategory || 'Personal/Other');
//     const [notes, setNotes] = useState(learnerData.exitNotes || '');
//     const [file, setFile] = useState<File | null>(null);
//     const [resignationFile, setResignationFile] = useState<File | null>(null);
//     const [isSubmitting, setIsSubmitting] = useState(false);
//     const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
//     const [isResending, setIsResending] = useState(false);

//     // 3. Extract Email & Delivery Status Object
//     const targetEmail = learnerData.email || learnerData.demographics?.learnerEmailAddress;
//     const hasEmail = Boolean(targetEmail?.trim());

//     // 🚀 Local state for instant optimistic UI updates without needing to re-open the modal
//     const [localEmailStatus, setLocalEmailStatus] = useState(learnerData.withdrawalEmailStatus);

//     useEffect(() => {
//         setLocalEmailStatus(learnerData.withdrawalEmailStatus);
//     }, [learnerData.withdrawalEmailStatus]);

//     const toast = useToast();

//     const existingEvidenceUrl = learnerData.exitEvidenceUrl || '';
//     const existingResignationUrl = learnerData.resignationLetterUrl || '';

//     // 🚀 Debug Log on Modal Launch (KEPT INTACT)
//     useEffect(() => {
//         console.group("🚀 DROPOUT MODAL LAUNCHED");
//         console.log("🆔 LEARNER ID:", learnerData.learnerId || learnerData.id);
//         console.log("🆔 ID NUMBER:", learnerData.idNumber);
//         console.log("📧 TARGET EMAIL:", targetEmail);
//         console.log("STATUS OBJECT:", localEmailStatus);
//         console.groupEnd();
//     }, [learnerData, targetEmail, localEmailStatus]);

//     // 4. Submit New Dropout Action
//     const handleSubmit = async () => {
//         if (!date) { toast.error('Exit date is required.'); return; }
//         setIsSubmitting(true);
//         try {
//             let evidenceUrl = existingEvidenceUrl;
//             let resignationUrl = existingResignationUrl;

//             if (file) {
//                 const storageRef = ref(getStorage(), `dropout_evidence/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
//                 await uploadBytes(storageRef, file);
//                 evidenceUrl = await getDownloadURL(storageRef);
//             }
//             if (resignationFile) {
//                 const resRef = ref(getStorage(), `dropout_resignation/${Date.now()}_${resignationFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
//                 await uploadBytes(resRef, resignationFile);
//                 resignationUrl = await getDownloadURL(resRef);
//             }
//             await onConfirm({ date, reason, notes, evidenceUrl, resignationUrl });
//         } catch (err: any) {
//             toast.error(err?.message || 'Failed to process upload.');
//         } finally {
//             setIsSubmitting(false);
//         }
//     };

//     // 5. Dynamic Resend Email Handler with Toast Feedback and Immediate UI Update
//     const handleResendEmail = async () => {
//         if (!hasEmail) {
//             toast.error("Cannot resend: No email address found on profile.");
//             return;
//         }

//         setIsResending(true);
//         toast.info("Processing withdrawal record update...");

//         try {
//             const functions = getFunctions();
//             const resendFn = httpsCallable(functions, 'resendWithdrawalEmail');

//             const trueLearnerDocId = learnerData.idNumber || (learnerData.id?.includes('_') ? learnerData.id.split('_')[1] : learnerData.id);

//             const response = await resendFn({
//                 learnerId: trueLearnerDocId,
//                 cohortId: learnerData.cohortId,
//                 enrollmentId: learnerData.enrollmentId || learnerData.id,
//                 email: targetEmail,
//                 fullName: learnerData.fullName || "Learner",
//                 programmeName: learnerData.qualification?.name || "the STEP UP Programme"
//             });

//             console.log("✅ SERVER RESPONSE:", response.data);

//             setLocalEmailStatus({
//                 sent: true,
//                 sentAt: new Date().toISOString(),
//                 recipient: targetEmail,
//                 isManualResend: true
//             });

//             toast.success("Record updated successfully!");
//         } catch (err: any) {
//             console.error("❌ SERVER ERROR:", err);
//             toast.error(`Resend failed: ${err.message || "Unknown error"}`);
//         } finally {
//             setIsResending(false);
//         }
//     };

//     // 6. Dynamic Card Status Theme Calculation (Soft Red / Soft Orange / Soft Green)
//     const getEmailStatusUI = () => {
//         if (!hasEmail) {
//             return {
//                 bg: '#fef2f2',
//                 border: '#fecaca',
//                 iconColor: '#dc2626',
//                 textColor: '#dc2626',
//                 icon: <AlertTriangle size={14} />,
//                 message: "Cannot send: No email address on profile"
//             };
//         }
//         if (isResending) {
//             return {
//                 bg: '#fffbeb',
//                 border: '#fde68a',
//                 iconColor: '#d97706',
//                 textColor: '#b45309',
//                 icon: <Clock size={14} />,
//                 message: "Sending email notice..."
//             };
//         }
//         if (localEmailStatus?.sent === true) {
//             return {
//                 bg: '#f0fdf4',
//                 border: '#bbf7d0',
//                 iconColor: '#16a34a',
//                 textColor: '#15803d',
//                 icon: <CheckCircle2 size={14} />,
//                 message: `Successfully delivered to ${localEmailStatus.recipient || targetEmail}`
//             };
//         }
//         if (localEmailStatus?.error) {
//             return {
//                 bg: '#fef2f2',
//                 border: '#fecaca',
//                 iconColor: '#dc2626',
//                 textColor: '#dc2626',
//                 icon: <AlertTriangle size={14} />,
//                 message: `Delivery failed: ${localEmailStatus.error}`
//             };
//         }
//         // Unsent State (Default) -> Soft Red
//         return {
//             bg: '#fef2f2',
//             border: '#fecaca',
//             iconColor: '#dc2626',
//             textColor: '#dc2626',
//             icon: <AlertCircle size={14} />,
//             message: "Email notice not sent yet."
//         };
//     };

//     const statusUI = getEmailStatusUI();

//     // 7. Attachment Preview Component
//     const renderEvidencePreview = (url: string, label: string) => {
//         if (!url) {
//             return (
//                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
//                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
//                         <FileText size={24} color="#94a3b8" />
//                         <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Not Provided</span>
//                     </div>
//                 </div>
//             );
//         }

//         const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
//         const isImage = url.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/);

//         if (isPdf) {
//             return (
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
//                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
//                     </div>
//                     <iframe src={url} title={label} style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', background: 'white' }} />
//                 </div>
//             );
//         }

//         if (isImage) {
//             return (
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
//                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
//                     </div>
//                     <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid #e2e8f0', background: 'white' }}>
//                         <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
//                     </div>
//                 </div>
//             );
//         }

//         return (
//             <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', border: '1px solid var(--mlab-green)', background: '#f0fdf4', color: 'var(--mlab-green-dark)', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', height: '100%' }}>
//                 <FileText size={20} /> View {label} <ExternalLink size={14} />
//             </a>
//         );
//     };

//     // 8. Plain text parser for Quill HTML
//     const parseHtmlToPlainText = (html: string) => {
//         if (!html) return "No additional notes provided.";

//         let cleanHtml = html.replace(/<br\s*[\/]?>/gi, '\n');
//         cleanHtml = cleanHtml.replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n');

//         const tempDiv = document.createElement("div");
//         tempDiv.innerHTML = cleanHtml;
//         let text = tempDiv.textContent || tempDiv.innerText || "";

//         text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
//             .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
//             .replace(/[\u2013\u2014]/g, '-')
//             .replace(/\u2022/g, '-')
//             .replace(/\u00A0/g, ' ');

//         return text.replace(/\n{3,}/g, '\n\n').trim() || "No additional notes provided.";
//     };

//     // 9. PDF Generation Report
//     const handleGeneratePdfReport = async () => {
//         setIsGeneratingPdf(true);
//         toast.info("Generating official PDF and attaching evidence...");

//         try {
//             const cohort = cohorts?.find((c: any) => c.id === learner.cohortId);
//             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort?.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
//             const sdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
//             const institutionName = settings?.institutionName || 'Mobile Applications Laboratory';

//             const pdfDoc = await PDFDocument.create();
//             const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
//             const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

//             const pageWidth = 595.28;
//             const pageHeight = 841.89;
//             const margin = 50;
//             const bottomMargin = 50;
//             const maxWidth = pageWidth - (margin * 2);

//             let page = pdfDoc.addPage([pageWidth, pageHeight]);
//             let currentY = pageHeight - margin;

//             const checkAndAddPage = (requiredSpace: number) => {
//                 if (currentY - requiredSpace < bottomMargin) {
//                     page = pdfDoc.addPage([pageWidth, pageHeight]);
//                     currentY = pageHeight - margin;
//                 }
//             };

//             const drawWrappedText = (text: string, font: any, size: number, color: any, lineHeight: number = 14) => {
//                 const paragraphs = text.split('\n');

//                 for (const para of paragraphs) {
//                     if (para.trim() === '') {
//                         currentY -= lineHeight / 2;
//                         checkAndAddPage(lineHeight);
//                         continue;
//                     }

//                     const words = para.split(' ');
//                     let line = '';

//                     for (let n = 0; n < words.length; n++) {
//                         const testLine = line + words[n] + ' ';
//                         const testWidth = font.widthOfTextAtSize(testLine, size);

//                         if (testWidth > maxWidth && line.length > 0) {
//                             checkAndAddPage(lineHeight);
//                             page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
//                             line = words[n] + ' ';
//                             currentY -= lineHeight;
//                         } else {
//                             line = testLine;
//                         }
//                     }

//                     if (line.trim().length > 0) {
//                         checkAndAddPage(lineHeight);
//                         page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
//                         currentY -= lineHeight;
//                     }
//                 }
//             };

//             // 1. Draw Header
//             page.drawText(institutionName, { x: margin, y: currentY, size: 18, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
//             currentY -= 20;

//             page.drawText(`QCTO Accredited Training Provider | SDP Code: ${sdpCode}`, { x: margin, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

//             const generatedOn = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
//             const docTitle = 'Official Withdrawal Record';
//             const titleWidth = helveticaBold.widthOfTextAtSize(docTitle, 14);
//             page.drawText(docTitle, { x: pageWidth - margin - titleWidth, y: currentY + 20, size: 14, font: helveticaBold, color: rgb(0.86, 0.15, 0.15) });
//             const dateWidth = helvetica.widthOfTextAtSize(`Generated: ${generatedOn}`, 10);
//             page.drawText(`Generated: ${generatedOn}`, { x: pageWidth - margin - dateWidth, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

//             currentY -= 15;
//             page.drawLine({ start: { x: margin, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 2, color: rgb(0.03, 0.24, 0.3) });
//             currentY -= 35;

//             // 2. Learner Details
//             checkAndAddPage(60);
//             page.drawText('LEARNER DETAILS', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
//             currentY -= 20;
//             page.drawText(`Full Name: ${learner.fullName}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
//             const idText = `ID Number: ${learner.idNumber}`;
//             const idWidth = helveticaBold.widthOfTextAtSize(idText, 12);
//             page.drawText(idText, { x: pageWidth - margin - idWidth, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
//             currentY -= 40;

//             // 3. Exit Information
//             checkAndAddPage(60);
//             page.drawText('EXIT INFORMATION', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
//             currentY -= 20;
//             const formattedDate = new Date(date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
//             page.drawText(`Date of Exit: ${formattedDate}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
//             currentY -= 40;

//             // 4. Additional Notes
//             checkAndAddPage(60);
//             page.drawText('ADDITIONAL CONTEXT / NOTES', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
//             currentY -= 20;

//             const plainTextNotes = parseHtmlToPlainText(notes);
//             drawWrappedText(plainTextNotes, helvetica, 11, rgb(0.2, 0.2, 0.2), 14);
//             currentY -= 30;

//             // 5. Signature Area
//             checkAndAddPage(100);

//             let sigImg = null;
//             if (user?.signatureUrl) {
//                 try {
//                     const sigRes = await fetch(user.signatureUrl);
//                     const sigBuffer = await sigRes.arrayBuffer();
//                     const isPng = user.signatureUrl.toLowerCase().includes('.png');
//                     sigImg = isPng ? await pdfDoc.embedPng(sigBuffer) : await pdfDoc.embedJpg(sigBuffer);
//                 } catch (e) {
//                     console.warn("Could not load user signature image", e);
//                 }
//             }

//             if (sigImg) {
//                 const sigDims = sigImg.scale(1);
//                 const maxSigW = 180;
//                 const maxSigH = 50;
//                 const scale = Math.min(maxSigW / sigDims.width, maxSigH / sigDims.height);
//                 page.drawImage(sigImg, {
//                     x: margin + 10,
//                     y: currentY + 5,
//                     width: sigDims.width * scale,
//                     height: sigDims.height * scale,
//                 });
//             } else {
//                 page.drawText(user?.fullName || 'Authorized Admin', { x: margin + 10, y: currentY + 10, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
//             }

//             page.drawText(generatedOn, { x: pageWidth - margin - 150, y: currentY + 10, size: 11, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

//             page.drawLine({ start: { x: margin, y: currentY }, end: { x: margin + 200, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
//             page.drawText(`Authorized by: ${user?.fullName || 'Manager'}`, { x: margin, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

//             page.drawLine({ start: { x: pageWidth - margin - 200, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
//             page.drawText('Date Authorized', { x: pageWidth - margin - 130, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

//             // 6. Append Attachments
//             const appendAttachment = async (url: string, label: string) => {
//                 if (!url) return;
//                 try {
//                     const response = await fetch(url);
//                     const buffer = await response.arrayBuffer();
//                     const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
//                     const isPng = url.toLowerCase().match(/\.(png)(\?|$)/);
//                     const isJpg = url.toLowerCase().match(/\.(jpg|jpeg)(\?|$)/);

//                     if (isPdf) {
//                         const donorPdf = await PDFDocument.load(buffer);
//                         const pages = await pdfDoc.copyPages(donorPdf, donorPdf.getPageIndices());
//                         pages.forEach((p, i) => {
//                             const donorPage = pdfDoc.addPage(p);
//                             donorPage.drawText(`Attachment: ${label} (Page ${i + 1})`, { x: margin, y: donorPage.getSize().height - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
//                         });
//                     } else if (isPng || isJpg) {
//                         const imgPage = pdfDoc.addPage([pageWidth, pageHeight]);
//                         imgPage.drawText(`Attachment: ${label}`, { x: margin, y: pageHeight - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

//                         let img;
//                         if (isPng) img = await pdfDoc.embedPng(buffer);
//                         if (isJpg) img = await pdfDoc.embedJpg(buffer);

//                         if (img) {
//                             const imgDims = img.scale(1);
//                             const maxW = 450;
//                             const maxH = 650;
//                             let scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
//                             const drawW = imgDims.width * scale;
//                             const drawH = imgDims.height * scale;

//                             imgPage.drawImage(img, {
//                                 x: (pageWidth - drawW) / 2,
//                                 y: (pageHeight - drawH) / 2 - 20,
//                                 width: drawW,
//                                 height: drawH,
//                             });
//                         }
//                     }
//                 } catch (e) {
//                     console.error(`Failed to fetch/append ${label}:`, e);
//                 }
//             };

//             await appendAttachment(existingResignationUrl, "Resignation Letter");
//             await appendAttachment(existingEvidenceUrl, "Other Evidence");

//             // 7. Save and Download
//             const pdfBytes: any = await pdfDoc.save();
//             const blob = new Blob([pdfBytes], { type: "application/pdf" });
//             const link = document.createElement('a');
//             link.href = URL.createObjectURL(blob);
//             link.download = `Withdrawal_Record_${learner.fullName.replace(/\s/g, '_')}.pdf`;
//             document.body.appendChild(link);
//             link.click();
//             document.body.removeChild(link);

//             toast.success("PDF generated successfully!");
//         } catch (err: any) {
//             console.error(err);
//             toast.error("Failed to generate PDF document.");
//         } finally {
//             setIsGeneratingPdf(false);
//         }
//     };

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
//             <style>{` .wm-modal, .wm-btn, .mlab-btn { border-radius: 0 !important; } `}</style>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-red)', paddingBottom: '1rem' }}>
//                     <div className="wm-modal__header-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
//                         <UserMinus size={20} />
//                     </div>
//                     <div>
//                         <h2 className="wm-modal__title">{isViewMode ? 'Withdrawal Record' : 'Process Learner Withdrawal'}</h2>
//                         <p className="wm-modal__subtitle">
//                             {isViewMode
//                                 ? `Official exit details for ${learner.fullName}`
//                                 : <>Officially remove <strong>{learner.fullName}</strong> from this cohort.</>
//                             }
//                         </p>
//                     </div>
//                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
//                 </div>

//                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>

//                     {isViewMode ? (
//                         <>
//                             <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', color: 'var(--mlab-midnight)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
//                                 <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--mlab-grey)' }} />
//                                 <span>This learner was officially withdrawn on <strong>{new Date(date).toLocaleDateString('en-ZA')}</strong>. Their historical data is retained for QCTO auditing.</span>
//                             </div>

//                             {/* 🚀 DYNAMIC COLOR-CODED EMAIL STATUS TRACKER CARD */}
//                             <div style={{
//                                 background: statusUI.bg,
//                                 border: `1px solid ${statusUI.border}`,
//                                 padding: '12px', borderRadius: '0', fontSize: '0.85rem',
//                                 display: 'flex', justifyContent: 'space-between', alignItems: 'center'
//                             }}>
//                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                     <Mail size={16} color={statusUI.iconColor} />
//                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                         <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>Exit Survey Email Link</span>
//                                         <span style={{ fontSize: '0.75rem', color: statusUI.textColor, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
//                                             {statusUI.icon} {statusUI.message}
//                                         </span>
//                                     </div>
//                                 </div>
//                                 <button
//                                     type="button"
//                                     className="mlab-btn mlab-btn--sm"
//                                     onClick={handleResendEmail}
//                                     disabled={isResending || !hasEmail}
//                                     title={!hasEmail ? "Please edit the learner's profile and add an email address first." : "Resend withdrawal email"}
//                                     style={{
//                                         background: !hasEmail ? '#f1f5f9' : 'white',
//                                         color: !hasEmail ? '#94a3b8' : 'var(--mlab-midnight)',
//                                         border: '1px solid #cbd5e1',
//                                         display: 'flex', alignItems: 'center', gap: '4px',
//                                         cursor: !hasEmail ? 'not-allowed' : 'pointer'
//                                     }}
//                                 >
//                                     {isResending ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
//                                     Resend
//                                 </button>
//                             </div>
//                         </>
//                     ) : (
//                         <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '0', color: '#991b1b', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
//                             <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
//                             <span>This action will update the learner's status to "Dropped", making them inactive in the roster while retaining their historical data for QCTO auditing. They will also receive an automated exit survey link.</span>
//                         </div>
//                     )}

//                     <div style={{ display: 'flex', gap: '1rem' }}>
//                         <div className="wm-form-group" style={{ flex: 1 }}>
//                             <label className="wm-form-label">Exit Date *</label>
//                             <input type="date" className="wm-form-input" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} disabled={isViewMode} readOnly={isViewMode} />
//                         </div>
//                         <div className="wm-form-group" style={{ flex: 2 }}>
//                             <label className="wm-form-label">Primary Reason *</label>
//                             <select className="wm-form-input" value={reason} onChange={e => setReason(e.target.value)} disabled={isViewMode}>
//                                 <option value="Not Started">Not Started (Never Attended)</option>
//                                 <option value="Employment/New Job">Employment / New Job</option>
//                                 <option value="Medical/Health">Medical / Health Reasons</option>
//                                 <option value="Financial Constraints">Financial Constraints</option>
//                                 <option value="Academic Difficulty">Academic Difficulty</option>
//                                 <option value="Disciplinary Dismissal">Disciplinary Dismissal</option>
//                                 <option value="Relocation">Relocation</option>
//                                 <option value="Deceased">Deceased</option>
//                                 <option value="Personal/Other">Personal / Other</option>
//                             </select>
//                         </div>
//                     </div>

//                     <div style={{ display: 'flex', gap: '1rem' }}>
//                         <div className="wm-form-group" style={{ flex: 1 }}>
//                             <label className="wm-form-label">Resignation Letter</label>
//                             {isViewMode ? (
//                                 renderEvidencePreview(existingResignationUrl, 'Resignation Letter')
//                             ) : (
//                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '0', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
//                                     <input type="file" id="resignation-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setResignationFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
//                                     <label htmlFor="resignation-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
//                                         <FileText size={24} color={resignationFile ? "var(--mlab-green)" : "#94a3b8"} />
//                                         <span style={{ fontSize: '0.75rem', color: resignationFile ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
//                                             {resignationFile ? resignationFile.name : (isViewMode ? 'Not Provided' : 'Upload Resignation Letter')}
//                                         </span>
//                                     </label>
//                                 </div>
//                             )}
//                         </div>

//                         <div className="wm-form-group" style={{ flex: 1 }}>
//                             <label className="wm-form-label">Other Evidence (e.g. Medical)</label>
//                             {isViewMode ? (
//                                 renderEvidencePreview(existingEvidenceUrl, 'Other Evidence')
//                             ) : (
//                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '0', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
//                                     <input type="file" id="evidence-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
//                                     <label htmlFor="evidence-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
//                                         <UploadCloud size={24} color={file ? "var(--mlab-green)" : "#94a3b8"} />
//                                         <span style={{ fontSize: '0.75rem', color: file ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
//                                             {file ? file.name : (isViewMode ? 'Not Provided' : 'Upload Other Evidence')}
//                                         </span>
//                                     </label>
//                                 </div>
//                             )}
//                         </div>
//                     </div>

//                     <div className="wm-form-group">
//                         <label className="wm-form-label">Additional Context / Notes</label>
//                         <div style={{ background: 'white', opacity: isViewMode ? 0.8 : 1 }}>
//                             <ReactQuill
//                                 theme="snow"
//                                 value={notes}
//                                 onChange={setNotes}
//                                 placeholder="Provide further context regarding this withdrawal..."
//                                 style={{ height: '120px', color: 'black', marginBottom: '45px' }}
//                                 readOnly={isViewMode}
//                             />
//                         </div>
//                     </div>
//                 </div>

//                 <div className="wm-modal__footer">
//                     <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isSubmitting || isGeneratingPdf || isResending}>Close</button>

//                     {isViewMode && (
//                         <button className="mlab-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={handleGeneratePdfReport} disabled={isGeneratingPdf || isResending}>
//                             {isGeneratingPdf ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />} Generate PDF Report
//                         </button>
//                     )}

//                     {!isViewMode && (
//                         <button className="mlab-btn" style={{ background: 'var(--mlab-red)', color: 'white', border: 'none' }} onClick={handleSubmit} disabled={isSubmitting || isResending}>
//                             {isSubmitting ? <Loader2 size={16} className="spin" /> : <UserMinus size={16} />} Confirm Withdrawal
//                         </button>
//                     )}
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };




// // // src/components/common/LearnerDropoutModal/LearnerDropoutModal.tsx

// // import React, { useState, useEffect } from 'react';
// // import { createPortal } from 'react-dom';
// // import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import {
// //     Loader2, UploadCloud, UserMinus, FileText, AlertCircle, X, ExternalLink,
// //     FileDown, Mail, CheckCircle2, AlertTriangle, RefreshCw, Clock
// // } from 'lucide-react';
// // import ReactQuill from 'react-quill-new';
// // import 'react-quill-new/dist/quill.snow.css';
// // import { useToast } from '../../common/Toast/Toast';
// // import { useStore } from '../../../store/useStore';
// // import type { DashboardLearner } from '../../../types';
// // import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// // interface Props {
// //     learner: DashboardLearner;
// //     onClose: () => void;
// //     onConfirm: (data: {
// //         date: string;
// //         reason: string;
// //         notes: string;
// //         evidenceUrl: string;
// //         resignationUrl: string;
// //     }) => Promise<void>;
// // }

// // export const LearnerDropoutModal: React.FC<Props> = ({ learner, onClose, onConfirm }) => {
// //     // 1. Access global store to get user, institution settings, and cohort data
// //     const { user, settings, cohorts } = useStore() as any;

// //     const learnerData = learner as any;
// //     const isViewMode = learnerData.status === 'dropped';

// //     // 2. Form State
// //     const [date, setDate] = useState(learnerData.exitDate || new Date().toISOString().split('T')[0]);
// //     const [reason, setReason] = useState(learnerData.exitReasonCategory || 'Personal/Other');
// //     const [notes, setNotes] = useState(learnerData.exitNotes || '');
// //     const [file, setFile] = useState<File | null>(null);
// //     const [resignationFile, setResignationFile] = useState<File | null>(null);
// //     const [isSubmitting, setIsSubmitting] = useState(false);
// //     const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
// //     const [isResending, setIsResending] = useState(false);

// //     // 3. Extract Email & Delivery Status Object
// //     const targetEmail = learnerData.email || learnerData.demographics?.learnerEmailAddress;
// //     const hasEmail = Boolean(targetEmail?.trim());
// //     const emailStatus = learnerData.withdrawalEmailStatus;

// //     const toast = useToast();

// //     const existingEvidenceUrl = learnerData.exitEvidenceUrl || '';
// //     const existingResignationUrl = learnerData.resignationLetterUrl || '';

// //     // 🚀 Debug Log on Modal Launch
// //     useEffect(() => {
// //         console.group("🚀 DROPOUT MODAL LAUNCHED");
// //         console.log("🆔 LEARNER ID:", learnerData.learnerId || learnerData.id);
// //         console.log("🆔 ID NUMBER:", learnerData.idNumber);
// //         console.log("📧 TARGET EMAIL:", targetEmail);
// //         console.log("STATUS OBJECT:", emailStatus);
// //         console.groupEnd();
// //     }, [learnerData, targetEmail, emailStatus]);

// //     // 4. Submit New Dropout Action
// //     const handleSubmit = async () => {
// //         if (!date) { toast.error('Exit date is required.'); return; }
// //         setIsSubmitting(true);
// //         try {
// //             let evidenceUrl = existingEvidenceUrl;
// //             let resignationUrl = existingResignationUrl;

// //             if (file) {
// //                 const storageRef = ref(getStorage(), `dropout_evidence/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// //                 await uploadBytes(storageRef, file);
// //                 evidenceUrl = await getDownloadURL(storageRef);
// //             }
// //             if (resignationFile) {
// //                 const resRef = ref(getStorage(), `dropout_resignation/${Date.now()}_${resignationFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// //                 await uploadBytes(resRef, resignationFile);
// //                 resignationUrl = await getDownloadURL(resRef);
// //             }
// //             await onConfirm({ date, reason, notes, evidenceUrl, resignationUrl });
// //         } catch (err: any) {
// //             toast.error(err?.message || 'Failed to process upload.');
// //         } finally {
// //             setIsSubmitting(false);
// //         }
// //     };

// //     // 5. Dynamic Resend Email Handler with Toast Feedback
// //     const handleResendEmail = async () => {
// //         if (!hasEmail) {
// //             toast.error("Cannot resend: No email address found on profile.");
// //             return;
// //         }

// //         setIsResending(true);
// //         toast.info("Sending withdrawal email...");

// //         try {
// //             const functions = getFunctions();
// //             const resendFn = httpsCallable(functions, 'resendWithdrawalEmail');

// //             // Safely resolve the ID Number for learners collection lookup
// //             const trueLearnerDocId = learnerData.idNumber || (learnerData.id?.includes('_') ? learnerData.id.split('_')[1] : learnerData.id);

// //             const response = await resendFn({
// //                 learnerId: trueLearnerDocId,
// //                 enrollmentId: learnerData.enrollmentId || learnerData.id,
// //                 email: targetEmail,
// //                 fullName: learnerData.fullName || "Learner",
// //                 programmeName: learnerData.qualification?.name || "the STEP UP Programme"
// //             });

// //             console.log("✅ SERVER RESPONSE:", response.data);
// //             toast.success("Withdrawal email dispatched successfully!");
// //         } catch (err: any) {
// //             console.error("❌ SERVER ERROR:", err);
// //             toast.error(`Resend failed: ${err.message || "Unknown error"}`);
// //         } finally {
// //             setIsResending(false);
// //         }
// //     };

// //     // 6. Dynamic Card Status Theme Calculation (Red / Orange / Green)
// //     const getEmailStatusUI = () => {
// //         if (!hasEmail) {
// //             return {
// //                 bg: '#fef2f2',
// //                 border: '#fecaca',
// //                 iconColor: '#dc2626',
// //                 textColor: '#dc2626',
// //                 icon: <AlertTriangle size={14} />,
// //                 message: "Cannot send: No email address on profile"
// //             };
// //         }
// //         if (isResending) {
// //             return {
// //                 bg: '#fffbeb',
// //                 border: '#fde68a',
// //                 iconColor: '#d97706',
// //                 textColor: '#b45309',
// //                 icon: <Clock size={14} />,
// //                 message: "Sending email notice..."
// //             };
// //         }
// //         if (emailStatus?.sent === true) {
// //             return {
// //                 bg: '#f0fdf4',
// //                 border: '#bbf7d0',
// //                 iconColor: '#16a34a',
// //                 textColor: '#15803d',
// //                 icon: <CheckCircle2 size={14} />,
// //                 message: `Successfully delivered to ${emailStatus.recipient || targetEmail}`
// //             };
// //         }
// //         if (emailStatus?.error) {
// //             return {
// //                 bg: '#fef2f2',
// //                 border: '#fecaca',
// //                 iconColor: '#dc2626',
// //                 textColor: '#dc2626',
// //                 icon: <AlertTriangle size={14} />,
// //                 message: `Delivery failed: ${emailStatus.error}`
// //             };
// //         }
// //         // Unsent State (Default) -> Soft Red
// //         return {
// //             bg: '#fef2f2',
// //             border: '#fecaca',
// //             iconColor: '#dc2626',
// //             textColor: '#dc2626',
// //             icon: <AlertCircle size={14} />,
// //             message: "Email notice not sent yet."
// //         };
// //     };

// //     const statusUI = getEmailStatusUI();

// //     // 7. Attachment Preview Component
// //     const renderEvidencePreview = (url: string, label: string) => {
// //         if (!url) {
// //             return (
// //                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// //                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
// //                         <FileText size={24} color="#94a3b8" />
// //                         <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Not Provided</span>
// //                     </div>
// //                 </div>
// //             );
// //         }

// //         const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
// //         const isImage = url.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/);

// //         if (isPdf) {
// //             return (
// //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
// //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
// //                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
// //                     </div>
// //                     <iframe src={url} title={label} style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', background: 'white' }} />
// //                 </div>
// //             );
// //         }

// //         if (isImage) {
// //             return (
// //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
// //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
// //                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
// //                     </div>
// //                     <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid #e2e8f0', background: 'white' }}>
// //                         <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
// //                     </div>
// //                 </div>
// //             );
// //         }

// //         return (
// //             <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', border: '1px solid var(--mlab-green)', background: '#f0fdf4', color: 'var(--mlab-green-dark)', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', height: '100%' }}>
// //                 <FileText size={20} /> View {label} <ExternalLink size={14} />
// //             </a>
// //         );
// //     };

// //     // 8. Plain text parser for Quill HTML
// //     const parseHtmlToPlainText = (html: string) => {
// //         if (!html) return "No additional notes provided.";

// //         let cleanHtml = html.replace(/<br\s*[\/]?>/gi, '\n');
// //         cleanHtml = cleanHtml.replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n');

// //         const tempDiv = document.createElement("div");
// //         tempDiv.innerHTML = cleanHtml;
// //         let text = tempDiv.textContent || tempDiv.innerText || "";

// //         text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
// //             .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
// //             .replace(/[\u2013\u2014]/g, '-')
// //             .replace(/\u2022/g, '-')
// //             .replace(/\u00A0/g, ' ');

// //         return text.replace(/\n{3,}/g, '\n\n').trim() || "No additional notes provided.";
// //     };

// //     // 9. PDF Generation Report
// //     const handleGeneratePdfReport = async () => {
// //         setIsGeneratingPdf(true);
// //         toast.info("Generating official PDF and attaching evidence...");

// //         try {
// //             const cohort = cohorts?.find((c: any) => c.id === learner.cohortId);
// //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort?.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
// //             const sdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
// //             const institutionName = settings?.institutionName || 'Mobile Applications Laboratory';

// //             const pdfDoc = await PDFDocument.create();
// //             const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
// //             const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

// //             const pageWidth = 595.28;
// //             const pageHeight = 841.89;
// //             const margin = 50;
// //             const bottomMargin = 50;
// //             const maxWidth = pageWidth - (margin * 2);

// //             let page = pdfDoc.addPage([pageWidth, pageHeight]);
// //             let currentY = pageHeight - margin;

// //             const checkAndAddPage = (requiredSpace: number) => {
// //                 if (currentY - requiredSpace < bottomMargin) {
// //                     page = pdfDoc.addPage([pageWidth, pageHeight]);
// //                     currentY = pageHeight - margin;
// //                 }
// //             };

// //             const drawWrappedText = (text: string, font: any, size: number, color: any, lineHeight: number = 14) => {
// //                 const paragraphs = text.split('\n');

// //                 for (const para of paragraphs) {
// //                     if (para.trim() === '') {
// //                         currentY -= lineHeight / 2;
// //                         checkAndAddPage(lineHeight);
// //                         continue;
// //                     }

// //                     const words = para.split(' ');
// //                     let line = '';

// //                     for (let n = 0; n < words.length; n++) {
// //                         const testLine = line + words[n] + ' ';
// //                         const testWidth = font.widthOfTextAtSize(testLine, size);

// //                         if (testWidth > maxWidth && line.length > 0) {
// //                             checkAndAddPage(lineHeight);
// //                             page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
// //                             line = words[n] + ' ';
// //                             currentY -= lineHeight;
// //                         } else {
// //                             line = testLine;
// //                         }
// //                     }

// //                     if (line.trim().length > 0) {
// //                         checkAndAddPage(lineHeight);
// //                         page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
// //                         currentY -= lineHeight;
// //                     }
// //                 }
// //             };

// //             // 1. Draw Header
// //             page.drawText(institutionName, { x: margin, y: currentY, size: 18, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// //             currentY -= 20;

// //             page.drawText(`QCTO Accredited Training Provider | SDP Code: ${sdpCode}`, { x: margin, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// //             const generatedOn = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
// //             const docTitle = 'Official Withdrawal Record';
// //             const titleWidth = helveticaBold.widthOfTextAtSize(docTitle, 14);
// //             page.drawText(docTitle, { x: pageWidth - margin - titleWidth, y: currentY + 20, size: 14, font: helveticaBold, color: rgb(0.86, 0.15, 0.15) });
// //             const dateWidth = helvetica.widthOfTextAtSize(`Generated: ${generatedOn}`, 10);
// //             page.drawText(`Generated: ${generatedOn}`, { x: pageWidth - margin - dateWidth, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// //             currentY -= 15;
// //             page.drawLine({ start: { x: margin, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 2, color: rgb(0.03, 0.24, 0.3) });
// //             currentY -= 35;

// //             // 2. Learner Details
// //             checkAndAddPage(60);
// //             page.drawText('LEARNER DETAILS', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// //             currentY -= 20;
// //             page.drawText(`Full Name: ${learner.fullName}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// //             const idText = `ID Number: ${learner.idNumber}`;
// //             const idWidth = helveticaBold.widthOfTextAtSize(idText, 12);
// //             page.drawText(idText, { x: pageWidth - margin - idWidth, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// //             currentY -= 40;

// //             // 3. Exit Information
// //             checkAndAddPage(60);
// //             page.drawText('EXIT INFORMATION', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// //             currentY -= 20;
// //             const formattedDate = new Date(date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
// //             page.drawText(`Date of Exit: ${formattedDate}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// //             currentY -= 40;

// //             // 4. Additional Notes
// //             checkAndAddPage(60);
// //             page.drawText('ADDITIONAL CONTEXT / NOTES', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// //             currentY -= 20;

// //             const plainTextNotes = parseHtmlToPlainText(notes);
// //             drawWrappedText(plainTextNotes, helvetica, 11, rgb(0.2, 0.2, 0.2), 14);
// //             currentY -= 30;

// //             // 5. Signature Area
// //             checkAndAddPage(100);

// //             let sigImg = null;
// //             if (user?.signatureUrl) {
// //                 try {
// //                     const sigRes = await fetch(user.signatureUrl);
// //                     const sigBuffer = await sigRes.arrayBuffer();
// //                     const isPng = user.signatureUrl.toLowerCase().includes('.png');
// //                     sigImg = isPng ? await pdfDoc.embedPng(sigBuffer) : await pdfDoc.embedJpg(sigBuffer);
// //                 } catch (e) {
// //                     console.warn("Could not load user signature image", e);
// //                 }
// //             }

// //             if (sigImg) {
// //                 const sigDims = sigImg.scale(1);
// //                 const maxSigW = 180;
// //                 const maxSigH = 50;
// //                 const scale = Math.min(maxSigW / sigDims.width, maxSigH / sigDims.height);
// //                 page.drawImage(sigImg, {
// //                     x: margin + 10,
// //                     y: currentY + 5,
// //                     width: sigDims.width * scale,
// //                     height: sigDims.height * scale,
// //                 });
// //             } else {
// //                 page.drawText(user?.fullName || 'Authorized Admin', { x: margin + 10, y: currentY + 10, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// //             }

// //             page.drawText(generatedOn, { x: pageWidth - margin - 150, y: currentY + 10, size: 11, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

// //             page.drawLine({ start: { x: margin, y: currentY }, end: { x: margin + 200, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
// //             page.drawText(`Authorized by: ${user?.fullName || 'Manager'}`, { x: margin, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// //             page.drawLine({ start: { x: pageWidth - margin - 200, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
// //             page.drawText('Date Authorized', { x: pageWidth - margin - 130, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// //             // 6. Append Attachments
// //             const appendAttachment = async (url: string, label: string) => {
// //                 if (!url) return;
// //                 try {
// //                     const response = await fetch(url);
// //                     const buffer = await response.arrayBuffer();
// //                     const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
// //                     const isPng = url.toLowerCase().match(/\.(png)(\?|$)/);
// //                     const isJpg = url.toLowerCase().match(/\.(jpg|jpeg)(\?|$)/);

// //                     if (isPdf) {
// //                         const donorPdf = await PDFDocument.load(buffer);
// //                         const pages = await pdfDoc.copyPages(donorPdf, donorPdf.getPageIndices());
// //                         pages.forEach((p, i) => {
// //                             const donorPage = pdfDoc.addPage(p);
// //                             donorPage.drawText(`Attachment: ${label} (Page ${i + 1})`, { x: margin, y: donorPage.getSize().height - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
// //                         });
// //                     } else if (isPng || isJpg) {
// //                         const imgPage = pdfDoc.addPage([pageWidth, pageHeight]);
// //                         imgPage.drawText(`Attachment: ${label}`, { x: margin, y: pageHeight - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

// //                         let img;
// //                         if (isPng) img = await pdfDoc.embedPng(buffer);
// //                         if (isJpg) img = await pdfDoc.embedJpg(buffer);

// //                         if (img) {
// //                             const imgDims = img.scale(1);
// //                             const maxW = 450;
// //                             const maxH = 650;
// //                             let scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
// //                             const drawW = imgDims.width * scale;
// //                             const drawH = imgDims.height * scale;

// //                             imgPage.drawImage(img, {
// //                                 x: (pageWidth - drawW) / 2,
// //                                 y: (pageHeight - drawH) / 2 - 20,
// //                                 width: drawW,
// //                                 height: drawH,
// //                             });
// //                         }
// //                     }
// //                 } catch (e) {
// //                     console.error(`Failed to fetch/append ${label}:`, e);
// //                 }
// //             };

// //             await appendAttachment(existingResignationUrl, "Resignation Letter");
// //             await appendAttachment(existingEvidenceUrl, "Other Evidence");

// //             // 7. Save and Download
// //             const pdfBytes: any = await pdfDoc.save();
// //             const blob = new Blob([pdfBytes], { type: "application/pdf" });
// //             const link = document.createElement('a');
// //             link.href = URL.createObjectURL(blob);
// //             link.download = `Withdrawal_Record_${learner.fullName.replace(/\s/g, '_')}.pdf`;
// //             document.body.appendChild(link);
// //             link.click();
// //             document.body.removeChild(link);

// //             toast.success("PDF generated successfully!");
// //         } catch (err: any) {
// //             console.error(err);
// //             toast.error("Failed to generate PDF document.");
// //         } finally {
// //             setIsGeneratingPdf(false);
// //         }
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// //             <style>{` .wm-modal, .wm-btn, .mlab-btn { border-radius: 0 !important; } `}</style>
// //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-red)', paddingBottom: '1rem' }}>
// //                     <div className="wm-modal__header-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
// //                         <UserMinus size={20} />
// //                     </div>
// //                     <div>
// //                         <h2 className="wm-modal__title">{isViewMode ? 'Withdrawal Record' : 'Process Learner Withdrawal'}</h2>
// //                         <p className="wm-modal__subtitle">
// //                             {isViewMode
// //                                 ? `Official exit details for ${learner.fullName}`
// //                                 : <>Officially remove <strong>{learner.fullName}</strong> from this cohort.</>
// //                             }
// //                         </p>
// //                     </div>
// //                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// //                 </div>

// //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>

// //                     {isViewMode ? (
// //                         <>
// //                             <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', color: 'var(--mlab-midnight)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// //                                 <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--mlab-grey)' }} />
// //                                 <span>This learner was officially withdrawn on <strong>{new Date(date).toLocaleDateString('en-ZA')}</strong>. Their historical data is retained for QCTO auditing.</span>
// //                             </div>

// //                             {/* 🚀 DYNAMIC COLOR-CODED EMAIL STATUS TRACKER CARD */}
// //                             <div style={{
// //                                 background: statusUI.bg,
// //                                 border: `1px solid ${statusUI.border}`,
// //                                 padding: '12px', borderRadius: '0', fontSize: '0.85rem',
// //                                 display: 'flex', justifyContent: 'space-between', alignItems: 'center'
// //                             }}>
// //                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// //                                     <Mail size={16} color={statusUI.iconColor} />
// //                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                                         <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>Exit Survey Email Link</span>
// //                                         <span style={{ fontSize: '0.75rem', color: statusUI.textColor, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// //                                             {statusUI.icon} {statusUI.message}
// //                                         </span>
// //                                     </div>
// //                                 </div>
// //                                 <button
// //                                     type="button"
// //                                     className="mlab-btn mlab-btn--sm"
// //                                     onClick={handleResendEmail}
// //                                     disabled={isResending || !hasEmail}
// //                                     title={!hasEmail ? "Please edit the learner's profile and add an email address first." : "Resend withdrawal email"}
// //                                     style={{
// //                                         background: !hasEmail ? '#f1f5f9' : 'white',
// //                                         color: !hasEmail ? '#94a3b8' : 'var(--mlab-midnight)',
// //                                         border: '1px solid #cbd5e1',
// //                                         display: 'flex', alignItems: 'center', gap: '4px',
// //                                         cursor: !hasEmail ? 'not-allowed' : 'pointer'
// //                                     }}
// //                                 >
// //                                     {isResending ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
// //                                     Resend
// //                                 </button>
// //                             </div>
// //                         </>
// //                     ) : (
// //                         <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '0', color: '#991b1b', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// //                             <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
// //                             <span>This action will update the learner's status to "Dropped", making them inactive in the roster while retaining their historical data for QCTO auditing. They will also receive an automated exit survey link.</span>
// //                         </div>
// //                     )}

// //                     <div style={{ display: 'flex', gap: '1rem' }}>
// //                         <div className="wm-form-group" style={{ flex: 1 }}>
// //                             <label className="wm-form-label">Exit Date *</label>
// //                             <input type="date" className="wm-form-input" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} disabled={isViewMode} readOnly={isViewMode} />
// //                         </div>
// //                         <div className="wm-form-group" style={{ flex: 2 }}>
// //                             <label className="wm-form-label">Primary Reason *</label>
// //                             <select className="wm-form-input" value={reason} onChange={e => setReason(e.target.value)} disabled={isViewMode}>
// //                                 <option value="Not Started">Not Started (Never Attended)</option>
// //                                 <option value="Employment/New Job">Employment / New Job</option>
// //                                 <option value="Medical/Health">Medical / Health Reasons</option>
// //                                 <option value="Financial Constraints">Financial Constraints</option>
// //                                 <option value="Academic Difficulty">Academic Difficulty</option>
// //                                 <option value="Disciplinary Dismissal">Disciplinary Dismissal</option>
// //                                 <option value="Relocation">Relocation</option>
// //                                 <option value="Deceased">Deceased</option>
// //                                 <option value="Personal/Other">Personal / Other</option>
// //                             </select>
// //                         </div>
// //                     </div>

// //                     <div style={{ display: 'flex', gap: '1rem' }}>
// //                         <div className="wm-form-group" style={{ flex: 1 }}>
// //                             <label className="wm-form-label">Resignation Letter</label>
// //                             {isViewMode ? (
// //                                 renderEvidencePreview(existingResignationUrl, 'Resignation Letter')
// //                             ) : (
// //                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '0', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
// //                                     <input type="file" id="resignation-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setResignationFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
// //                                     <label htmlFor="resignation-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
// //                                         <FileText size={24} color={resignationFile ? "var(--mlab-green)" : "#94a3b8"} />
// //                                         <span style={{ fontSize: '0.75rem', color: resignationFile ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
// //                                             {resignationFile ? resignationFile.name : (isViewMode ? 'Not Provided' : 'Upload Resignation Letter')}
// //                                         </span>
// //                                     </label>
// //                                 </div>
// //                             )}
// //                         </div>

// //                         <div className="wm-form-group" style={{ flex: 1 }}>
// //                             <label className="wm-form-label">Other Evidence (e.g. Medical)</label>
// //                             {isViewMode ? (
// //                                 renderEvidencePreview(existingEvidenceUrl, 'Other Evidence')
// //                             ) : (
// //                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '0', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
// //                                     <input type="file" id="evidence-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
// //                                     <label htmlFor="evidence-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
// //                                         <UploadCloud size={24} color={file ? "var(--mlab-green)" : "#94a3b8"} />
// //                                         <span style={{ fontSize: '0.75rem', color: file ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
// //                                             {file ? file.name : (isViewMode ? 'Not Provided' : 'Upload Other Evidence')}
// //                                         </span>
// //                                     </label>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     </div>

// //                     <div className="wm-form-group">
// //                         <label className="wm-form-label">Additional Context / Notes</label>
// //                         <div style={{ background: 'white', opacity: isViewMode ? 0.8 : 1 }}>
// //                             <ReactQuill
// //                                 theme="snow"
// //                                 value={notes}
// //                                 onChange={setNotes}
// //                                 placeholder="Provide further context regarding this withdrawal..."
// //                                 style={{ height: '120px', color: 'black', marginBottom: '45px' }}
// //                                 readOnly={isViewMode}
// //                             />
// //                         </div>
// //                     </div>
// //                 </div>

// //                 <div className="wm-modal__footer">
// //                     <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isSubmitting || isGeneratingPdf || isResending}>Close</button>

// //                     {isViewMode && (
// //                         <button className="mlab-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={handleGeneratePdfReport} disabled={isGeneratingPdf || isResending}>
// //                             {isGeneratingPdf ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />} Generate PDF Report
// //                         </button>
// //                     )}

// //                     {!isViewMode && (
// //                         <button className="mlab-btn" style={{ background: 'var(--mlab-red)', color: 'white', border: 'none' }} onClick={handleSubmit} disabled={isSubmitting || isResending}>
// //                             {isSubmitting ? <Loader2 size={16} className="spin" /> : <UserMinus size={16} />} Confirm Withdrawal
// //                         </button>
// //                     )}
// //                 </div>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };



// // // import React, { useEffect, useState } from 'react';
// // // import { createPortal } from 'react-dom';
// // // import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // import { Loader2, UploadCloud, UserMinus, FileText, AlertCircle, X, ExternalLink, FileDown, Mail, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
// // // import ReactQuill from 'react-quill-new';
// // // import 'react-quill-new/dist/quill.snow.css';
// // // import { useToast } from '../../common/Toast/Toast';
// // // import { useStore } from '../../../store/useStore';
// // // import type { DashboardLearner } from '../../../types';
// // // import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// // // interface Props {
// // //     learner: DashboardLearner;
// // //     onClose: () => void;
// // //     onConfirm: (data: {
// // //         date: string;
// // //         reason: string;
// // //         notes: string;
// // //         evidenceUrl: string;
// // //         resignationUrl: string;
// // //     }) => Promise<void>;
// // // }

// // // export const LearnerDropoutModal: React.FC<Props> = ({ learner, onClose, onConfirm }) => {
// // //     // Access global store to get user, institution settings, and cohort data for the SDP Code
// // //     const { user, settings, cohorts } = useStore() as any;

// // //     const learnerData = learner as any;
// // //     const isViewMode = learnerData.status === 'dropped';

// // //     const [date, setDate] = useState(learnerData.exitDate || new Date().toISOString().split('T')[0]);
// // //     const [reason, setReason] = useState(learnerData.exitReasonCategory || 'Personal/Other');
// // //     const [notes, setNotes] = useState(learnerData.exitNotes || '');
// // //     const [file, setFile] = useState<File | null>(null);
// // //     const [resignationFile, setResignationFile] = useState<File | null>(null);
// // //     const [isSubmitting, setIsSubmitting] = useState(false);
// // //     const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
// // //     const [isResending, setIsResending] = useState(false);

// // //     // 🚀 Extract Email exactly how BootcampCohortView does it
// // //     const targetEmail = learnerData.email || learnerData.demographics?.learnerEmailAddress;
// // //     const hasEmail = Boolean(targetEmail?.trim());
// // //     const emailStatus = learnerData.withdrawalEmailStatus;

// // //     const toast = useToast();

// // //     const existingEvidenceUrl = learnerData.exitEvidenceUrl || '';
// // //     const existingResignationUrl = learnerData.resignationLetterUrl || '';

// // //     const handleSubmit = async () => {
// // //         if (!date) { toast.error('Exit date is required.'); return; }
// // //         setIsSubmitting(true);
// // //         try {
// // //             let evidenceUrl = existingEvidenceUrl;
// // //             let resignationUrl = existingResignationUrl;

// // //             if (file) {
// // //                 const storageRef = ref(getStorage(), `dropout_evidence/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // //                 await uploadBytes(storageRef, file);
// // //                 evidenceUrl = await getDownloadURL(storageRef);
// // //             }
// // //             if (resignationFile) {
// // //                 const resRef = ref(getStorage(), `dropout_resignation/${Date.now()}_${resignationFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // //                 await uploadBytes(resRef, resignationFile);
// // //                 resignationUrl = await getDownloadURL(resRef);
// // //             }
// // //             await onConfirm({ date, reason, notes, evidenceUrl, resignationUrl });
// // //         } catch (err: any) {
// // //             toast.error(err?.message || 'Failed to process upload.');
// // //         } finally {
// // //             setIsSubmitting(false);
// // //         }
// // //     };

// // //     // 🚀 HANDLE RESEND WITH FULL TOAST FEEDBACK
// // //     const handleResendEmail = async () => {
// // //         if (!hasEmail) {
// // //             toast.error("Cannot resend: No email address found on profile.");
// // //             return;
// // //         }

// // //         setIsResending(true);
// // //         // 1. Toast for initial trigger
// // //         toast.info("Sending withdrawal email...");

// // //         try {
// // //             const functions = getFunctions();
// // //             const resendFn = httpsCallable(functions, 'resendWithdrawalEmail');

// // //             // Safely resolve the ID Number for learners collection lookup
// // //             const trueLearnerDocId = learnerData.idNumber || (learnerData.id?.includes('_') ? learnerData.id.split('_')[1] : learnerData.id);

// // //             const response = await resendFn({
// // //                 learnerId: trueLearnerDocId,
// // //                 enrollmentId: learnerData.enrollmentId || learnerData.id,
// // //                 email: targetEmail,
// // //                 fullName: learnerData.fullName || "Learner",
// // //                 programmeName: learnerData.qualification?.name || "the STEP UP Programme"
// // //             });

// // //             console.log("✅ SERVER RESPONSE:", response.data);

// // //             // 2. Toast for success
// // //             toast.success("Withdrawal email dispatched successfully!");
// // //         } catch (err: any) {
// // //             console.error("❌ SERVER ERROR:", err);

// // //             // 3. Toast for error
// // //             toast.error(`Resend failed: ${err.message || "Unknown error"}`);
// // //         } finally {
// // //             setIsResending(false);
// // //         }
// // //     };

// // //     // //  LOG LEARNER DATA & USER ID ON MODAL LAUNCH
// // //     // useEffect(() => {
// // //     //     console.group("🚀 DROPOUT MODAL LAUNCHED");
// // //     //     console.log("🆔 USER / LEARNER ID:", learnerData.learnerId || learnerData.id);
// // //     //     console.log("📦 FULL LEARNER OBJECT:", learnerData);
// // //     //     console.groupEnd();
// // //     // }, [learnerData]);

// // //     const renderEvidencePreview = (url: string, label: string) => {
// // //         if (!url) {
// // //             return (
// // //                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// // //                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
// // //                         <FileText size={24} color="#94a3b8" />
// // //                         <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Not Provided</span>
// // //                     </div>
// // //                 </div>
// // //             );
// // //         }

// // //         const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
// // //         const isImage = url.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/);

// // //         if (isPdf) {
// // //             return (
// // //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
// // //                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
// // //                     </div>
// // //                     <iframe src={url} title={label} style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', background: 'white' }} />
// // //                 </div>
// // //             );
// // //         }

// // //         if (isImage) {
// // //             return (
// // //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
// // //                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
// // //                     </div>
// // //                     <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid #e2e8f0', background: 'white' }}>
// // //                         <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
// // //                     </div>
// // //                 </div>
// // //             );
// // //         }

// // //         return (
// // //             <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', border: '1px solid var(--mlab-green)', background: '#f0fdf4', color: 'var(--mlab-green-dark)', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', height: '100%' }}>
// // //                 <FileText size={20} /> View {label} <ExternalLink size={14} />
// // //             </a>
// // //         );
// // //     };

// // //     // 🚀 ROBUST HTML TO PLAIN TEXT CONVERTER
// // //     const parseHtmlToPlainText = (html: string) => {
// // //         if (!html) return "No additional notes provided.";

// // //         let cleanHtml = html.replace(/<br\s*[\/]?>/gi, '\n');
// // //         cleanHtml = cleanHtml.replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n');

// // //         const tempDiv = document.createElement("div");
// // //         tempDiv.innerHTML = cleanHtml;
// // //         let text = tempDiv.textContent || tempDiv.innerText || "";

// // //         text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
// // //             .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
// // //             .replace(/[\u2013\u2014]/g, '-')
// // //             .replace(/\u2022/g, '-')
// // //             .replace(/\u00A0/g, ' ');

// // //         return text.replace(/\n{3,}/g, '\n\n').trim() || "No additional notes provided.";
// // //     };

// // //     // 🚀 PROFESSIONAL PDF GENERATOR
// // //     const handleGeneratePdfReport = async () => {
// // //         setIsGeneratingPdf(true);
// // //         toast.info("Generating official PDF and attaching evidence...");

// // //         try {
// // //             // 🚀 Resolve the Dynamic SDP Code based on the Learner's Cohort Campus
// // //             const cohort = cohorts?.find((c: any) => c.id === learner.cohortId);
// // //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort?.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
// // //             const sdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
// // //             const institutionName = settings?.institutionName || 'Mobile Applications Laboratory';

// // //             const pdfDoc = await PDFDocument.create();
// // //             const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
// // //             const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

// // //             const pageWidth = 595.28;
// // //             const pageHeight = 841.89;
// // //             const margin = 50;
// // //             const bottomMargin = 50;
// // //             const maxWidth = pageWidth - (margin * 2);

// // //             let page = pdfDoc.addPage([pageWidth, pageHeight]);
// // //             let currentY = pageHeight - margin;

// // //             const checkAndAddPage = (requiredSpace: number) => {
// // //                 if (currentY - requiredSpace < bottomMargin) {
// // //                     page = pdfDoc.addPage([pageWidth, pageHeight]);
// // //                     currentY = pageHeight - margin;
// // //                 }
// // //             };

// // //             const drawWrappedText = (text: string, font: any, size: number, color: any, lineHeight: number = 14) => {
// // //                 const paragraphs = text.split('\n');

// // //                 for (const para of paragraphs) {
// // //                     if (para.trim() === '') {
// // //                         currentY -= lineHeight / 2;
// // //                         checkAndAddPage(lineHeight);
// // //                         continue;
// // //                     }

// // //                     const words = para.split(' ');
// // //                     let line = '';

// // //                     for (let n = 0; n < words.length; n++) {
// // //                         const testLine = line + words[n] + ' ';
// // //                         const testWidth = font.widthOfTextAtSize(testLine, size);

// // //                         if (testWidth > maxWidth && line.length > 0) {
// // //                             checkAndAddPage(lineHeight);
// // //                             page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
// // //                             line = words[n] + ' ';
// // //                             currentY -= lineHeight;
// // //                         } else {
// // //                             line = testLine;
// // //                         }
// // //                     }

// // //                     if (line.trim().length > 0) {
// // //                         checkAndAddPage(lineHeight);
// // //                         page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
// // //                         currentY -= lineHeight;
// // //                     }
// // //                 }
// // //             };

// // //             // 1. Draw Header
// // //             page.drawText(institutionName, { x: margin, y: currentY, size: 18, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // //             currentY -= 20;

// // //             // 🚀 Injected SDP Code into Header
// // //             page.drawText(`QCTO Accredited Training Provider | SDP Code: ${sdpCode}`, { x: margin, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // //             const generatedOn = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
// // //             const docTitle = 'Official Withdrawal Record';
// // //             const titleWidth = helveticaBold.widthOfTextAtSize(docTitle, 14);
// // //             page.drawText(docTitle, { x: pageWidth - margin - titleWidth, y: currentY + 20, size: 14, font: helveticaBold, color: rgb(0.86, 0.15, 0.15) });
// // //             const dateWidth = helvetica.widthOfTextAtSize(`Generated: ${generatedOn}`, 10);
// // //             page.drawText(`Generated: ${generatedOn}`, { x: pageWidth - margin - dateWidth, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // //             currentY -= 15;
// // //             page.drawLine({ start: { x: margin, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 2, color: rgb(0.03, 0.24, 0.3) });
// // //             currentY -= 35;

// // //             // 2. Learner Details
// // //             checkAndAddPage(60);
// // //             page.drawText('LEARNER DETAILS', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // //             currentY -= 20;
// // //             page.drawText(`Full Name: ${learner.fullName}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // //             const idText = `ID Number: ${learner.idNumber}`;
// // //             const idWidth = helveticaBold.widthOfTextAtSize(idText, 12);
// // //             page.drawText(idText, { x: pageWidth - margin - idWidth, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // //             currentY -= 40;

// // //             // 3. Exit Information
// // //             checkAndAddPage(60);
// // //             page.drawText('EXIT INFORMATION', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // //             currentY -= 20;
// // //             const formattedDate = new Date(date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
// // //             page.drawText(`Date of Exit: ${formattedDate}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // //             currentY -= 40;

// // //             // 4. Additional Notes
// // //             checkAndAddPage(60);
// // //             page.drawText('ADDITIONAL CONTEXT / NOTES', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // //             currentY -= 20;

// // //             const plainTextNotes = parseHtmlToPlainText(notes);
// // //             drawWrappedText(plainTextNotes, helvetica, 11, rgb(0.2, 0.2, 0.2), 14);
// // //             currentY -= 30;

// // //             // 5. Dynamic Signature Area
// // //             checkAndAddPage(100);

// // //             let sigImg = null;
// // //             if (user?.signatureUrl) {
// // //                 try {
// // //                     const sigRes = await fetch(user.signatureUrl);
// // //                     const sigBuffer = await sigRes.arrayBuffer();
// // //                     const isPng = user.signatureUrl.toLowerCase().includes('.png');
// // //                     sigImg = isPng ? await pdfDoc.embedPng(sigBuffer) : await pdfDoc.embedJpg(sigBuffer);
// // //                 } catch (e) {
// // //                     console.warn("Could not load user signature image", e);
// // //                 }
// // //             }

// // //             if (sigImg) {
// // //                 const sigDims = sigImg.scale(1);
// // //                 const maxSigW = 180;
// // //                 const maxSigH = 50;
// // //                 const scale = Math.min(maxSigW / sigDims.width, maxSigH / sigDims.height);
// // //                 page.drawImage(sigImg, {
// // //                     x: margin + 10,
// // //                     y: currentY + 5,
// // //                     width: sigDims.width * scale,
// // //                     height: sigDims.height * scale,
// // //                 });
// // //             } else {
// // //                 page.drawText(user?.fullName || 'Authorized Admin', { x: margin + 10, y: currentY + 10, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // //             }

// // //             page.drawText(generatedOn, { x: pageWidth - margin - 150, y: currentY + 10, size: 11, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

// // //             page.drawLine({ start: { x: margin, y: currentY }, end: { x: margin + 200, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
// // //             page.drawText(`Authorized by: ${user?.fullName || 'Manager'}`, { x: margin, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // //             page.drawLine({ start: { x: pageWidth - margin - 200, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
// // //             page.drawText('Date Authorized', { x: pageWidth - margin - 130, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // //             // 6. Append Attachments
// // //             const appendAttachment = async (url: string, label: string) => {
// // //                 if (!url) return;
// // //                 try {
// // //                     const response = await fetch(url);
// // //                     const buffer = await response.arrayBuffer();
// // //                     const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
// // //                     const isPng = url.toLowerCase().match(/\.(png)(\?|$)/);
// // //                     const isJpg = url.toLowerCase().match(/\.(jpg|jpeg)(\?|$)/);

// // //                     if (isPdf) {
// // //                         const donorPdf = await PDFDocument.load(buffer);
// // //                         const pages = await pdfDoc.copyPages(donorPdf, donorPdf.getPageIndices());
// // //                         pages.forEach((p, i) => {
// // //                             const donorPage = pdfDoc.addPage(p);
// // //                             donorPage.drawText(`Attachment: ${label} (Page ${i + 1})`, { x: margin, y: donorPage.getSize().height - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
// // //                         });
// // //                     } else if (isPng || isJpg) {
// // //                         const imgPage = pdfDoc.addPage([pageWidth, pageHeight]);
// // //                         imgPage.drawText(`Attachment: ${label}`, { x: margin, y: pageHeight - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

// // //                         let img;
// // //                         if (isPng) img = await pdfDoc.embedPng(buffer);
// // //                         if (isJpg) img = await pdfDoc.embedJpg(buffer);

// // //                         if (img) {
// // //                             const imgDims = img.scale(1);
// // //                             const maxW = 450;
// // //                             const maxH = 650;
// // //                             let scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
// // //                             const drawW = imgDims.width * scale;
// // //                             const drawH = imgDims.height * scale;

// // //                             imgPage.drawImage(img, {
// // //                                 x: (pageWidth - drawW) / 2,
// // //                                 y: (pageHeight - drawH) / 2 - 20,
// // //                                 width: drawW,
// // //                                 height: drawH,
// // //                             });
// // //                         }
// // //                     }
// // //                 } catch (e) {
// // //                     console.error(`Failed to fetch/append ${label}:`, e);
// // //                 }
// // //             };

// // //             await appendAttachment(existingResignationUrl, "Resignation Letter");
// // //             await appendAttachment(existingEvidenceUrl, "Other Evidence");

// // //             // 7. Save and Download
// // //             const pdfBytes: any = await pdfDoc.save();
// // //             const blob = new Blob([pdfBytes], { type: "application/pdf" });
// // //             const link = document.createElement('a');
// // //             link.href = URL.createObjectURL(blob);
// // //             link.download = `Withdrawal_Record_${learner.fullName.replace(/\s/g, '_')}.pdf`;
// // //             document.body.appendChild(link);
// // //             link.click();
// // //             document.body.removeChild(link);

// // //             toast.success("PDF generated successfully!");
// // //         } catch (err: any) {
// // //             console.error(err);
// // //             toast.error("Failed to generate PDF document.");
// // //         } finally {
// // //             setIsGeneratingPdf(false);
// // //         }
// // //     };

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// // //             <style>{` .wm-modal, .wm-btn, .mlab-btn { border-radius: 0 !important; } `}</style>
// // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-red)', paddingBottom: '1rem' }}>
// // //                     <div className="wm-modal__header-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
// // //                         <UserMinus size={20} />
// // //                     </div>
// // //                     <div>
// // //                         <h2 className="wm-modal__title">{isViewMode ? 'Withdrawal Record' : 'Process Learner Withdrawal'}</h2>
// // //                         <p className="wm-modal__subtitle">
// // //                             {isViewMode
// // //                                 ? `Official exit details for ${learner.fullName}`
// // //                                 : <>Officially remove <strong>{learner.fullName}</strong> from this cohort.</>
// // //                             }
// // //                         </p>
// // //                     </div>
// // //                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// // //                 </div>

// // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>

// // //                     {isViewMode ? (
// // //                         <>
// // //                             <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', color: 'var(--mlab-midnight)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// // //                                 <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--mlab-grey)' }} />
// // //                                 <span>This learner was officially withdrawn on <strong>{new Date(date).toLocaleDateString('en-ZA')}</strong>. Their historical data is retained for QCTO auditing.</span>
// // //                             </div>

// // //                             {/* 🚀 EMAIL STATUS TRACKER BLOCK */}
// // //                             <div style={{
// // //                                 background: emailStatus?.sent ? '#f0fdf4' : (emailStatus?.error || !hasEmail ? '#fef2f2' : '#f8fafc'),
// // //                                 border: `1px solid ${emailStatus?.sent ? '#bbf7d0' : (emailStatus?.error || !hasEmail ? '#fecaca' : '#e2e8f0')}`,
// // //                                 padding: '12px', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
// // //                             }}>
// // //                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// // //                                     <Mail size={16} color={emailStatus?.sent ? '#16a34a' : (emailStatus?.error || !hasEmail ? '#dc2626' : '#64748b')} />
// // //                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
// // //                                         <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>Exit Survey Email Link</span>

// // //                                         {!hasEmail ? (
// // //                                             <span style={{ fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                 <AlertTriangle size={12} /> Cannot send: No email address on profile
// // //                                             </span>
// // //                                         ) : emailStatus?.sent ? (
// // //                                             <span style={{ fontSize: '0.75rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                 <CheckCircle2 size={12} /> Successfully delivered
// // //                                             </span>
// // //                                         ) : emailStatus?.error ? (
// // //                                             <span style={{ fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                 <AlertTriangle size={12} /> Delivery failed: {emailStatus.error}
// // //                                             </span>
// // //                                         ) : (
// // //                                             <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No record of email delivery found.</span>
// // //                                         )}
// // //                                     </div>
// // //                                 </div>
// // //                                 <button
// // //                                     className="mlab-btn mlab-btn--sm"
// // //                                     onClick={handleResendEmail}
// // //                                     disabled={isResending || !hasEmail}
// // //                                     title={!hasEmail ? "Please edit the learner's profile and add an email address first." : "Resend withdrawal email"}
// // //                                     style={{
// // //                                         background: !hasEmail ? '#f1f5f9' : 'white',
// // //                                         color: !hasEmail ? '#94a3b8' : 'var(--mlab-midnight)',
// // //                                         border: '1px solid #cbd5e1',
// // //                                         display: 'flex', alignItems: 'center', gap: '4px',
// // //                                         cursor: !hasEmail ? 'not-allowed' : 'pointer'
// // //                                     }}
// // //                                 >
// // //                                     {isResending ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
// // //                                     Resend
// // //                                 </button>
// // //                             </div>
// // //                         </>
// // //                     ) : (
// // //                         <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '6px', color: '#991b1b', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// // //                             <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
// // //                             <span>This action will update the learner's status to "Dropped", making them inactive in the roster while retaining their historical data for QCTO auditing. They will also receive an automated exit survey link.</span>
// // //                         </div>
// // //                     )}

// // //                     <div style={{ display: 'flex', gap: '1rem' }}>
// // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // //                             <label className="wm-form-label">Exit Date *</label>
// // //                             <input type="date" className="wm-form-input" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} disabled={isViewMode} readOnly={isViewMode} />
// // //                         </div>
// // //                         <div className="wm-form-group" style={{ flex: 2 }}>
// // //                             <label className="wm-form-label">Primary Reason *</label>
// // //                             <select className="wm-form-input" value={reason} onChange={e => setReason(e.target.value)} disabled={isViewMode}>
// // //                                 <option value="Not Started">Not Started (Never Attended)</option>
// // //                                 <option value="Employment/New Job">Employment / New Job</option>
// // //                                 <option value="Medical/Health">Medical / Health Reasons</option>
// // //                                 <option value="Financial Constraints">Financial Constraints</option>
// // //                                 <option value="Academic Difficulty">Academic Difficulty</option>
// // //                                 <option value="Disciplinary Dismissal">Disciplinary Dismissal</option>
// // //                                 <option value="Relocation">Relocation</option>
// // //                                 <option value="Deceased">Deceased</option>
// // //                                 <option value="Personal/Other">Personal / Other</option>
// // //                             </select>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ display: 'flex', gap: '1rem' }}>
// // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // //                             <label className="wm-form-label">Resignation Letter</label>
// // //                             {isViewMode ? (
// // //                                 renderEvidencePreview(existingResignationUrl, 'Resignation Letter')
// // //                             ) : (
// // //                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
// // //                                     <input type="file" id="resignation-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setResignationFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
// // //                                     <label htmlFor="resignation-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
// // //                                         <FileText size={24} color={resignationFile ? "var(--mlab-green)" : "#94a3b8"} />
// // //                                         <span style={{ fontSize: '0.75rem', color: resignationFile ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
// // //                                             {resignationFile ? resignationFile.name : (isViewMode ? 'Not Provided' : 'Upload Resignation Letter')}
// // //                                         </span>
// // //                                     </label>
// // //                                 </div>
// // //                             )}
// // //                         </div>

// // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // //                             <label className="wm-form-label">Other Evidence (e.g. Medical)</label>
// // //                             {isViewMode ? (
// // //                                 renderEvidencePreview(existingEvidenceUrl, 'Other Evidence')
// // //                             ) : (
// // //                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
// // //                                     <input type="file" id="evidence-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
// // //                                     <label htmlFor="evidence-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
// // //                                         <UploadCloud size={24} color={file ? "var(--mlab-green)" : "#94a3b8"} />
// // //                                         <span style={{ fontSize: '0.75rem', color: file ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
// // //                                             {file ? file.name : (isViewMode ? 'Not Provided' : 'Upload Other Evidence')}
// // //                                         </span>
// // //                                     </label>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     </div>

// // //                     <div className="wm-form-group">
// // //                         <label className="wm-form-label">Additional Context / Notes</label>
// // //                         <div style={{ background: 'white', opacity: isViewMode ? 0.8 : 1 }}>
// // //                             <ReactQuill
// // //                                 theme="snow"
// // //                                 value={notes}
// // //                                 onChange={setNotes}
// // //                                 placeholder="Provide further context regarding this withdrawal..."
// // //                                 style={{ height: '120px', color: 'black', marginBottom: '45px' }}
// // //                                 readOnly={isViewMode}
// // //                             />
// // //                         </div>
// // //                     </div>
// // //                 </div>

// // //                 <div className="wm-modal__footer">
// // //                     <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isSubmitting || isGeneratingPdf || isResending}>Close</button>

// // //                     {isViewMode && (
// // //                         <button className="mlab-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={handleGeneratePdfReport} disabled={isGeneratingPdf || isResending}>
// // //                             {isGeneratingPdf ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />} Generate PDF Report
// // //                         </button>
// // //                     )}

// // //                     {!isViewMode && (
// // //                         <button className="mlab-btn" style={{ background: 'var(--mlab-red)', color: 'white', border: 'none' }} onClick={handleSubmit} disabled={isSubmitting || isResending}>
// // //                             {isSubmitting ? <Loader2 size={16} className="spin" /> : <UserMinus size={16} />} Confirm Withdrawal
// // //                         </button>
// // //                     )}
// // //                 </div>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };


// // // // import React, { useState } from 'react';
// // // // import { createPortal } from 'react-dom';
// // // // import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // import { Loader2, UploadCloud, UserMinus, FileText, AlertCircle, X, ExternalLink, FileDown, Mail, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
// // // // import ReactQuill from 'react-quill-new';
// // // // import 'react-quill-new/dist/quill.snow.css';
// // // // import { useToast } from '../../common/Toast/Toast';
// // // // import { useStore } from '../../../store/useStore';
// // // // import type { DashboardLearner } from '../../../types';
// // // // import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// // // // interface Props {
// // // //     learner: DashboardLearner;
// // // //     onClose: () => void;
// // // //     onConfirm: (data: {
// // // //         date: string;
// // // //         reason: string;
// // // //         notes: string;
// // // //         evidenceUrl: string;
// // // //         resignationUrl: string;
// // // //     }) => Promise<void>;
// // // // }

// // // // export const LearnerDropoutModal: React.FC<Props> = ({ learner, onClose, onConfirm }) => {
// // // //     // Access global store to get user, institution settings, and cohort data for the SDP Code
// // // //     const { user, settings, cohorts } = useStore() as any;

// // // //     const learnerData = learner as any;
// // // //     const isViewMode = learnerData.status === 'dropped';

// // // //     const [date, setDate] = useState(learnerData.exitDate || new Date().toISOString().split('T')[0]);
// // // //     const [reason, setReason] = useState(learnerData.exitReasonCategory || 'Personal/Other');
// // // //     const [notes, setNotes] = useState(learnerData.exitNotes || '');
// // // //     const [file, setFile] = useState<File | null>(null);
// // // //     const [resignationFile, setResignationFile] = useState<File | null>(null);
// // // //     const [isSubmitting, setIsSubmitting] = useState(false);
// // // //     const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
// // // //     const [isResending, setIsResending] = useState(false); // 🚀 State for email resend

// // // //     // Extract Email Status Object from DB
// // // //     const emailStatus = learnerData.withdrawalEmailStatus;

// // // //     const toast = useToast();

// // // //     const existingEvidenceUrl = learnerData.exitEvidenceUrl || '';
// // // //     const existingResignationUrl = learnerData.resignationLetterUrl || '';

// // // //     const handleSubmit = async () => {
// // // //         if (!date) { toast.error('Exit date is required.'); return; }
// // // //         setIsSubmitting(true);
// // // //         try {
// // // //             let evidenceUrl = existingEvidenceUrl;
// // // //             let resignationUrl = existingResignationUrl;

// // // //             if (file) {
// // // //                 const storageRef = ref(getStorage(), `dropout_evidence/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // // //                 await uploadBytes(storageRef, file);
// // // //                 evidenceUrl = await getDownloadURL(storageRef);
// // // //             }
// // // //             if (resignationFile) {
// // // //                 const resRef = ref(getStorage(), `dropout_resignation/${Date.now()}_${resignationFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // // //                 await uploadBytes(resRef, resignationFile);
// // // //                 resignationUrl = await getDownloadURL(resRef);
// // // //             }
// // // //             await onConfirm({ date, reason, notes, evidenceUrl, resignationUrl });
// // // //         } catch (err: any) {
// // // //             toast.error(err?.message || 'Failed to process upload.');
// // // //         } finally {
// // // //             setIsSubmitting(false);
// // // //         }
// // // //     };

// // // //     // 🚀 TRIGGER FIREBASE CALLABLE FUNCTION TO RESEND EMAIL
// // // //     const handleResendEmail = async () => {
// // // //         setIsResending(true);
// // // //         toast.info("Attempting to resend withdrawal email...");
// // // //         try {
// // // //             const functions = getFunctions();
// // // //             const resendFn = httpsCallable(functions, 'resendWithdrawalEmail');
// // // //             await resendFn({ learnerId: learner.id });

// // // //             toast.success("Withdrawal email dispatched successfully!");
// // // //             // Optional: Close modal so they refresh the page/cache to see the updated badge, 
// // // //             // or just let them close it themselves.
// // // //         } catch (err: any) {
// // // //             console.error(err);
// // // //             toast.error(`Resend failed: ${err.message}`);
// // // //         } finally {
// // // //             setIsResending(false);
// // // //         }
// // // //     };

// // // //     const renderEvidencePreview = (url: string, label: string) => {
// // // //         if (!url) {
// // // //             return (
// // // //                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// // // //                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
// // // //                         <FileText size={24} color="#94a3b8" />
// // // //                         <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Not Provided</span>
// // // //                     </div>
// // // //                 </div>
// // // //             );
// // // //         }

// // // //         const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
// // // //         const isImage = url.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/);

// // // //         if (isPdf) {
// // // //             return (
// // // //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
// // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
// // // //                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
// // // //                     </div>
// // // //                     <iframe src={url} title={label} style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', background: 'white' }} />
// // // //                 </div>
// // // //             );
// // // //         }

// // // //         if (isImage) {
// // // //             return (
// // // //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
// // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
// // // //                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
// // // //                     </div>
// // // //                     <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid #e2e8f0', background: 'white' }}>
// // // //                         <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
// // // //                     </div>
// // // //                 </div>
// // // //             );
// // // //         }

// // // //         return (
// // // //             <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', border: '1px solid var(--mlab-green)', background: '#f0fdf4', color: 'var(--mlab-green-dark)', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', height: '100%' }}>
// // // //                 <FileText size={20} /> View {label} <ExternalLink size={14} />
// // // //             </a>
// // // //         );
// // // //     };

// // // //     // 🚀 ROBUST HTML TO PLAIN TEXT CONVERTER
// // // //     const parseHtmlToPlainText = (html: string) => {
// // // //         if (!html) return "No additional notes provided.";

// // // //         let cleanHtml = html.replace(/<br\s*[\/]?>/gi, '\n');
// // // //         cleanHtml = cleanHtml.replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n');

// // // //         const tempDiv = document.createElement("div");
// // // //         tempDiv.innerHTML = cleanHtml;
// // // //         let text = tempDiv.textContent || tempDiv.innerText || "";

// // // //         text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
// // // //             .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
// // // //             .replace(/[\u2013\u2014]/g, '-')
// // // //             .replace(/\u2022/g, '-')
// // // //             .replace(/\u00A0/g, ' ');

// // // //         return text.replace(/\n{3,}/g, '\n\n').trim() || "No additional notes provided.";
// // // //     };

// // // //     // 🚀 PROFESSIONAL PDF GENERATOR
// // // //     const handleGeneratePdfReport = async () => {
// // // //         setIsGeneratingPdf(true);
// // // //         toast.info("Generating official PDF and attaching evidence...");

// // // //         try {
// // // //             // 🚀 Resolve the Dynamic SDP Code based on the Learner's Cohort Campus
// // // //             const cohort = cohorts?.find((c: any) => c.id === learner.cohortId);
// // // //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort?.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
// // // //             const sdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
// // // //             const institutionName = settings?.institutionName || 'Mobile Applications Laboratory';

// // // //             const pdfDoc = await PDFDocument.create();
// // // //             const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
// // // //             const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

// // // //             const pageWidth = 595.28;
// // // //             const pageHeight = 841.89;
// // // //             const margin = 50;
// // // //             const bottomMargin = 50;
// // // //             const maxWidth = pageWidth - (margin * 2);

// // // //             let page = pdfDoc.addPage([pageWidth, pageHeight]);
// // // //             let currentY = pageHeight - margin;

// // // //             const checkAndAddPage = (requiredSpace: number) => {
// // // //                 if (currentY - requiredSpace < bottomMargin) {
// // // //                     page = pdfDoc.addPage([pageWidth, pageHeight]);
// // // //                     currentY = pageHeight - margin;
// // // //                 }
// // // //             };

// // // //             const drawWrappedText = (text: string, font: any, size: number, color: any, lineHeight: number = 14) => {
// // // //                 const paragraphs = text.split('\n');

// // // //                 for (const para of paragraphs) {
// // // //                     if (para.trim() === '') {
// // // //                         currentY -= lineHeight / 2;
// // // //                         checkAndAddPage(lineHeight);
// // // //                         continue;
// // // //                     }

// // // //                     const words = para.split(' ');
// // // //                     let line = '';

// // // //                     for (let n = 0; n < words.length; n++) {
// // // //                         const testLine = line + words[n] + ' ';
// // // //                         const testWidth = font.widthOfTextAtSize(testLine, size);

// // // //                         if (testWidth > maxWidth && line.length > 0) {
// // // //                             checkAndAddPage(lineHeight);
// // // //                             page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
// // // //                             line = words[n] + ' ';
// // // //                             currentY -= lineHeight;
// // // //                         } else {
// // // //                             line = testLine;
// // // //                         }
// // // //                     }

// // // //                     if (line.trim().length > 0) {
// // // //                         checkAndAddPage(lineHeight);
// // // //                         page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
// // // //                         currentY -= lineHeight;
// // // //                     }
// // // //                 }
// // // //             };

// // // //             // 1. Draw Header
// // // //             page.drawText(institutionName, { x: margin, y: currentY, size: 18, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // // //             currentY -= 20;

// // // //             // 🚀 Injected SDP Code into Header
// // // //             page.drawText(`QCTO Accredited Training Provider | SDP Code: ${sdpCode}`, { x: margin, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // // //             const generatedOn = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
// // // //             const docTitle = 'Official Withdrawal Record';
// // // //             const titleWidth = helveticaBold.widthOfTextAtSize(docTitle, 14);
// // // //             page.drawText(docTitle, { x: pageWidth - margin - titleWidth, y: currentY + 20, size: 14, font: helveticaBold, color: rgb(0.86, 0.15, 0.15) });
// // // //             const dateWidth = helvetica.widthOfTextAtSize(`Generated: ${generatedOn}`, 10);
// // // //             page.drawText(`Generated: ${generatedOn}`, { x: pageWidth - margin - dateWidth, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // // //             currentY -= 15;
// // // //             page.drawLine({ start: { x: margin, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 2, color: rgb(0.03, 0.24, 0.3) });
// // // //             currentY -= 35;

// // // //             // 2. Learner Details
// // // //             checkAndAddPage(60);
// // // //             page.drawText('LEARNER DETAILS', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // // //             currentY -= 20;
// // // //             page.drawText(`Full Name: ${learner.fullName}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // // //             const idText = `ID Number: ${learner.idNumber}`;
// // // //             const idWidth = helveticaBold.widthOfTextAtSize(idText, 12);
// // // //             page.drawText(idText, { x: pageWidth - margin - idWidth, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // // //             currentY -= 40;

// // // //             // 3. Exit Information
// // // //             checkAndAddPage(60);
// // // //             page.drawText('EXIT INFORMATION', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // // //             currentY -= 20;
// // // //             const formattedDate = new Date(date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
// // // //             page.drawText(`Date of Exit: ${formattedDate}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // // //             currentY -= 40;

// // // //             // 4. Additional Notes
// // // //             checkAndAddPage(60);
// // // //             page.drawText('ADDITIONAL CONTEXT / NOTES', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // // //             currentY -= 20;

// // // //             const plainTextNotes = parseHtmlToPlainText(notes);
// // // //             drawWrappedText(plainTextNotes, helvetica, 11, rgb(0.2, 0.2, 0.2), 14);
// // // //             currentY -= 30;

// // // //             // 5. Dynamic Signature Area
// // // //             checkAndAddPage(100);

// // // //             let sigImg = null;
// // // //             if (user?.signatureUrl) {
// // // //                 try {
// // // //                     const sigRes = await fetch(user.signatureUrl);
// // // //                     const sigBuffer = await sigRes.arrayBuffer();
// // // //                     const isPng = user.signatureUrl.toLowerCase().includes('.png');
// // // //                     sigImg = isPng ? await pdfDoc.embedPng(sigBuffer) : await pdfDoc.embedJpg(sigBuffer);
// // // //                 } catch (e) {
// // // //                     console.warn("Could not load user signature image", e);
// // // //                 }
// // // //             }

// // // //             if (sigImg) {
// // // //                 const sigDims = sigImg.scale(1);
// // // //                 const maxSigW = 180;
// // // //                 const maxSigH = 50;
// // // //                 const scale = Math.min(maxSigW / sigDims.width, maxSigH / sigDims.height);
// // // //                 page.drawImage(sigImg, {
// // // //                     x: margin + 10,
// // // //                     y: currentY + 5,
// // // //                     width: sigDims.width * scale,
// // // //                     height: sigDims.height * scale,
// // // //                 });
// // // //             } else {
// // // //                 page.drawText(user?.fullName || 'Authorized Admin', { x: margin + 10, y: currentY + 10, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // // //             }

// // // //             page.drawText(generatedOn, { x: pageWidth - margin - 150, y: currentY + 10, size: 11, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

// // // //             page.drawLine({ start: { x: margin, y: currentY }, end: { x: margin + 200, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
// // // //             page.drawText(`Authorized by: ${user?.fullName || 'Manager'}`, { x: margin, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // // //             page.drawLine({ start: { x: pageWidth - margin - 200, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
// // // //             page.drawText('Date Authorized', { x: pageWidth - margin - 130, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // // //             // 6. Append Attachments
// // // //             const appendAttachment = async (url: string, label: string) => {
// // // //                 if (!url) return;
// // // //                 try {
// // // //                     const response = await fetch(url);
// // // //                     const buffer = await response.arrayBuffer();
// // // //                     const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
// // // //                     const isPng = url.toLowerCase().match(/\.(png)(\?|$)/);
// // // //                     const isJpg = url.toLowerCase().match(/\.(jpg|jpeg)(\?|$)/);

// // // //                     if (isPdf) {
// // // //                         const donorPdf = await PDFDocument.load(buffer);
// // // //                         const pages = await pdfDoc.copyPages(donorPdf, donorPdf.getPageIndices());
// // // //                         pages.forEach((p, i) => {
// // // //                             const donorPage = pdfDoc.addPage(p);
// // // //                             donorPage.drawText(`Attachment: ${label} (Page ${i + 1})`, { x: margin, y: donorPage.getSize().height - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
// // // //                         });
// // // //                     } else if (isPng || isJpg) {
// // // //                         const imgPage = pdfDoc.addPage([pageWidth, pageHeight]);
// // // //                         imgPage.drawText(`Attachment: ${label}`, { x: margin, y: pageHeight - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

// // // //                         let img;
// // // //                         if (isPng) img = await pdfDoc.embedPng(buffer);
// // // //                         if (isJpg) img = await pdfDoc.embedJpg(buffer);

// // // //                         if (img) {
// // // //                             const imgDims = img.scale(1);
// // // //                             const maxW = 450;
// // // //                             const maxH = 650;
// // // //                             let scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
// // // //                             const drawW = imgDims.width * scale;
// // // //                             const drawH = imgDims.height * scale;

// // // //                             imgPage.drawImage(img, {
// // // //                                 x: (pageWidth - drawW) / 2,
// // // //                                 y: (pageHeight - drawH) / 2 - 20,
// // // //                                 width: drawW,
// // // //                                 height: drawH,
// // // //                             });
// // // //                         }
// // // //                     }
// // // //                 } catch (e) {
// // // //                     console.error(`Failed to fetch/append ${label}:`, e);
// // // //                 }
// // // //             };

// // // //             await appendAttachment(existingResignationUrl, "Resignation Letter");
// // // //             await appendAttachment(existingEvidenceUrl, "Other Evidence");

// // // //             // 7. Save and Download
// // // //             const pdfBytes: any = await pdfDoc.save();
// // // //             const blob = new Blob([pdfBytes], { type: "application/pdf" });
// // // //             const link = document.createElement('a');
// // // //             link.href = URL.createObjectURL(blob);
// // // //             link.download = `Withdrawal_Record_${learner.fullName.replace(/\s/g, '_')}.pdf`;
// // // //             document.body.appendChild(link);
// // // //             link.click();
// // // //             document.body.removeChild(link);

// // // //             toast.success("PDF generated successfully!");
// // // //         } catch (err: any) {
// // // //             console.error(err);
// // // //             toast.error("Failed to generate PDF document.");
// // // //         } finally {
// // // //             setIsGeneratingPdf(false);
// // // //         }
// // // //     };

// // // //     return createPortal(
// // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// // // //             <style>{` .wm-modal, .wm-btn, .mlab-btn { border-radius: 0 !important; } `}</style>
// // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// // // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-red)', paddingBottom: '1rem' }}>
// // // //                     <div className="wm-modal__header-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
// // // //                         <UserMinus size={20} />
// // // //                     </div>
// // // //                     <div>
// // // //                         <h2 className="wm-modal__title">{isViewMode ? 'Withdrawal Record' : 'Process Learner Withdrawal'}</h2>
// // // //                         <p className="wm-modal__subtitle">
// // // //                             {isViewMode
// // // //                                 ? `Official exit details for ${learner.fullName}`
// // // //                                 : <>Officially remove <strong>{learner.fullName}</strong> from this cohort.</>
// // // //                             }
// // // //                         </p>
// // // //                     </div>
// // // //                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// // // //                 </div>

// // // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>

// // // //                     {isViewMode ? (
// // // //                         <>
// // // //                             <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', color: 'var(--mlab-midnight)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// // // //                                 <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--mlab-grey)' }} />
// // // //                                 <span>This learner was officially withdrawn on <strong>{new Date(date).toLocaleDateString('en-ZA')}</strong>. Their historical data is retained for QCTO auditing.</span>
// // // //                             </div>

// // // //                             {/* 🚀 EMAIL STATUS TRACKER BLOCK */}
// // // //                             <div style={{
// // // //                                 background: emailStatus?.sent ? '#f0fdf4' : (emailStatus?.error ? '#fef2f2' : '#f8fafc'),
// // // //                                 border: `1px solid ${emailStatus?.sent ? '#bbf7d0' : (emailStatus?.error ? '#fecaca' : '#e2e8f0')}`,
// // // //                                 padding: '12px', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
// // // //                             }}>
// // // //                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// // // //                                     <Mail size={16} color={emailStatus?.sent ? '#16a34a' : (emailStatus?.error ? '#dc2626' : '#64748b')} />
// // // //                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
// // // //                                         <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>Exit Survey Email Link</span>
// // // //                                         {emailStatus?.sent ? (
// // // //                                             <span style={{ fontSize: '0.75rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                 <CheckCircle2 size={12} /> Successfully delivered
// // // //                                             </span>
// // // //                                         ) : emailStatus?.error ? (
// // // //                                             <span style={{ fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                 <AlertTriangle size={12} /> Delivery failed: {emailStatus.error}
// // // //                                             </span>
// // // //                                         ) : (
// // // //                                             <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No record of email delivery found.</span>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <button
// // // //                                     className="mlab-btn mlab-btn--sm"
// // // //                                     onClick={handleResendEmail}
// // // //                                     disabled={isResending}
// // // //                                     style={{
// // // //                                         background: 'white',
// // // //                                         color: 'var(--mlab-midnight)',
// // // //                                         border: '1px solid #cbd5e1',
// // // //                                         display: 'flex', alignItems: 'center', gap: '4px'
// // // //                                     }}
// // // //                                 >
// // // //                                     {isResending ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
// // // //                                     Resend
// // // //                                 </button>
// // // //                             </div>
// // // //                         </>
// // // //                     ) : (
// // // //                         <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '6px', color: '#991b1b', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// // // //                             <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
// // // //                             <span>This action will update the learner's status to "Dropped", making them inactive in the roster while retaining their historical data for QCTO auditing. They will also receive an automated exit survey link.</span>
// // // //                         </div>
// // // //                     )}

// // // //                     <div style={{ display: 'flex', gap: '1rem' }}>
// // // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // // //                             <label className="wm-form-label">Exit Date *</label>
// // // //                             <input type="date" className="wm-form-input" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} disabled={isViewMode} readOnly={isViewMode} />
// // // //                         </div>
// // // //                         <div className="wm-form-group" style={{ flex: 2 }}>
// // // //                             <label className="wm-form-label">Primary Reason *</label>
// // // //                             <select className="wm-form-input" value={reason} onChange={e => setReason(e.target.value)} disabled={isViewMode}>
// // // //                                 <option value="Not Started">Not Started (Never Attended)</option>
// // // //                                 <option value="Employment/New Job">Employment / New Job</option>
// // // //                                 <option value="Medical/Health">Medical / Health Reasons</option>
// // // //                                 <option value="Financial Constraints">Financial Constraints</option>
// // // //                                 <option value="Academic Difficulty">Academic Difficulty</option>
// // // //                                 <option value="Disciplinary Dismissal">Disciplinary Dismissal</option>
// // // //                                 <option value="Relocation">Relocation</option>
// // // //                                 <option value="Deceased">Deceased</option>
// // // //                                 <option value="Personal/Other">Personal / Other</option>
// // // //                             </select>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div style={{ display: 'flex', gap: '1rem' }}>
// // // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // // //                             <label className="wm-form-label">Resignation Letter</label>
// // // //                             {isViewMode ? (
// // // //                                 renderEvidencePreview(existingResignationUrl, 'Resignation Letter')
// // // //                             ) : (
// // // //                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
// // // //                                     <input type="file" id="resignation-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setResignationFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
// // // //                                     <label htmlFor="resignation-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
// // // //                                         <FileText size={24} color={resignationFile ? "var(--mlab-green)" : "#94a3b8"} />
// // // //                                         <span style={{ fontSize: '0.75rem', color: resignationFile ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
// // // //                                             {resignationFile ? resignationFile.name : (isViewMode ? 'Not Provided' : 'Upload Resignation Letter')}
// // // //                                         </span>
// // // //                                     </label>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>

// // // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // // //                             <label className="wm-form-label">Other Evidence (e.g. Medical)</label>
// // // //                             {isViewMode ? (
// // // //                                 renderEvidencePreview(existingEvidenceUrl, 'Other Evidence')
// // // //                             ) : (
// // // //                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
// // // //                                     <input type="file" id="evidence-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
// // // //                                     <label htmlFor="evidence-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
// // // //                                         <UploadCloud size={24} color={file ? "var(--mlab-green)" : "#94a3b8"} />
// // // //                                         <span style={{ fontSize: '0.75rem', color: file ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
// // // //                                             {file ? file.name : (isViewMode ? 'Not Provided' : 'Upload Other Evidence')}
// // // //                                         </span>
// // // //                                     </label>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="wm-form-group">
// // // //                         <label className="wm-form-label">Additional Context / Notes</label>
// // // //                         <div style={{ background: 'white', opacity: isViewMode ? 0.8 : 1 }}>
// // // //                             <ReactQuill
// // // //                                 theme="snow"
// // // //                                 value={notes}
// // // //                                 onChange={setNotes}
// // // //                                 placeholder="Provide further context regarding this withdrawal..."
// // // //                                 style={{ height: '120px', color: 'black', marginBottom: '45px' }}
// // // //                                 readOnly={isViewMode}
// // // //                             />
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div className="wm-modal__footer">
// // // //                     <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isSubmitting || isGeneratingPdf || isResending}>Close</button>

// // // //                     {isViewMode && (
// // // //                         <button className="mlab-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={handleGeneratePdfReport} disabled={isGeneratingPdf || isResending}>
// // // //                             {isGeneratingPdf ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />} Generate PDF Report
// // // //                         </button>
// // // //                     )}

// // // //                     {!isViewMode && (
// // // //                         <button className="mlab-btn" style={{ background: 'var(--mlab-red)', color: 'white', border: 'none' }} onClick={handleSubmit} disabled={isSubmitting || isResending}>
// // // //                             {isSubmitting ? <Loader2 size={16} className="spin" /> : <UserMinus size={16} />} Confirm Withdrawal
// // // //                         </button>
// // // //                     )}
// // // //                 </div>
// // // //             </div>
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };


// // // // // import React, { useState } from 'react';
// // // // // import { createPortal } from 'react-dom';
// // // // // import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // // // // import { Loader2, UploadCloud, UserMinus, FileText, AlertCircle, X, ExternalLink, FileDown } from 'lucide-react';
// // // // // import ReactQuill from 'react-quill-new';
// // // // // import 'react-quill-new/dist/quill.snow.css';
// // // // // import { useToast } from '../../common/Toast/Toast';
// // // // // import { useStore } from '../../../store/useStore';
// // // // // import type { DashboardLearner } from '../../../types';
// // // // // import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// // // // // interface Props {
// // // // //     learner: DashboardLearner;
// // // // //     onClose: () => void;
// // // // //     onConfirm: (data: {
// // // // //         date: string;
// // // // //         reason: string;
// // // // //         notes: string;
// // // // //         evidenceUrl: string;
// // // // //         resignationUrl: string;
// // // // //     }) => Promise<void>;
// // // // // }

// // // // // export const LearnerDropoutModal: React.FC<Props> = ({ learner, onClose, onConfirm }) => {
// // // // //     // 🚀 Access global store to get user, institution settings, and cohort data for the SDP Code
// // // // //     const { user, settings, cohorts } = useStore() as any;

// // // // //     const learnerData = learner as any;
// // // // //     const isViewMode = learnerData.status === 'dropped';

// // // // //     const [date, setDate] = useState(learnerData.exitDate || new Date().toISOString().split('T')[0]);
// // // // //     const [reason, setReason] = useState(learnerData.exitReasonCategory || 'Personal/Other');
// // // // //     const [notes, setNotes] = useState(learnerData.exitNotes || '');
// // // // //     const [file, setFile] = useState<File | null>(null);
// // // // //     const [resignationFile, setResignationFile] = useState<File | null>(null);
// // // // //     const [isSubmitting, setIsSubmitting] = useState(false);
// // // // //     const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
// // // // //     const toast = useToast();

// // // // //     const existingEvidenceUrl = learnerData.exitEvidenceUrl || '';
// // // // //     const existingResignationUrl = learnerData.resignationLetterUrl || '';

// // // // //     const handleSubmit = async () => {
// // // // //         if (!date) { toast.error('Exit date is required.'); return; }
// // // // //         setIsSubmitting(true);
// // // // //         try {
// // // // //             let evidenceUrl = existingEvidenceUrl;
// // // // //             let resignationUrl = existingResignationUrl;

// // // // //             if (file) {
// // // // //                 const storageRef = ref(getStorage(), `dropout_evidence/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // // // //                 await uploadBytes(storageRef, file);
// // // // //                 evidenceUrl = await getDownloadURL(storageRef);
// // // // //             }
// // // // //             if (resignationFile) {
// // // // //                 const resRef = ref(getStorage(), `dropout_resignation/${Date.now()}_${resignationFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // // // //                 await uploadBytes(resRef, resignationFile);
// // // // //                 resignationUrl = await getDownloadURL(resRef);
// // // // //             }
// // // // //             await onConfirm({ date, reason, notes, evidenceUrl, resignationUrl });
// // // // //         } catch (err: any) {
// // // // //             toast.error(err?.message || 'Failed to process upload.');
// // // // //         } finally {
// // // // //             setIsSubmitting(false);
// // // // //         }
// // // // //     };

// // // // //     const renderEvidencePreview = (url: string, label: string) => {
// // // // //         if (!url) {
// // // // //             return (
// // // // //                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// // // // //                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
// // // // //                         <FileText size={24} color="#94a3b8" />
// // // // //                         <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Not Provided</span>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             );
// // // // //         }

// // // // //         const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
// // // // //         const isImage = url.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/);

// // // // //         if (isPdf) {
// // // // //             return (
// // // // //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
// // // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
// // // // //                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
// // // // //                     </div>
// // // // //                     <iframe src={url} title={label} style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', background: 'white' }} />
// // // // //                 </div>
// // // // //             );
// // // // //         }

// // // // //         if (isImage) {
// // // // //             return (
// // // // //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--mlab-border)', background: '#f8fafc', height: '250px', padding: '8px' }}>
// // // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-midnight)', textTransform: 'uppercase' }}>{label}</span>
// // // // //                         <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none' }}>Fullscreen <ExternalLink size={12} /></a>
// // // // //                     </div>
// // // // //                     <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid #e2e8f0', background: 'white' }}>
// // // // //                         <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
// // // // //                     </div>
// // // // //                 </div>
// // // // //             );
// // // // //         }

// // // // //         return (
// // // // //             <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', border: '1px solid var(--mlab-green)', background: '#f0fdf4', color: 'var(--mlab-green-dark)', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', height: '100%' }}>
// // // // //                 <FileText size={20} /> View {label} <ExternalLink size={14} />
// // // // //             </a>
// // // // //         );
// // // // //     };

// // // // //     // 🚀 ROBUST HTML TO PLAIN TEXT CONVERTER
// // // // //     const parseHtmlToPlainText = (html: string) => {
// // // // //         if (!html) return "No additional notes provided.";

// // // // //         let cleanHtml = html.replace(/<br\s*[\/]?>/gi, '\n');
// // // // //         cleanHtml = cleanHtml.replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n');

// // // // //         const tempDiv = document.createElement("div");
// // // // //         tempDiv.innerHTML = cleanHtml;
// // // // //         let text = tempDiv.textContent || tempDiv.innerText || "";

// // // // //         text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
// // // // //             .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
// // // // //             .replace(/[\u2013\u2014]/g, '-')
// // // // //             .replace(/\u2022/g, '-')
// // // // //             .replace(/\u00A0/g, ' ');

// // // // //         return text.replace(/\n{3,}/g, '\n\n').trim() || "No additional notes provided.";
// // // // //     };

// // // // //     // 🚀 PROFESSIONAL PDF GENERATOR
// // // // //     const handleGeneratePdfReport = async () => {
// // // // //         setIsGeneratingPdf(true);
// // // // //         toast.info("Generating official PDF and attaching evidence...");

// // // // //         try {
// // // // //             // 🚀 Resolve the Dynamic SDP Code based on the Learner's Cohort Campus
// // // // //             const cohort = cohorts?.find((c: any) => c.id === learner.cohortId);
// // // // //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort?.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
// // // // //             const sdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
// // // // //             const institutionName = settings?.institutionName || 'Mobile Applications Laboratory';

// // // // //             const pdfDoc = await PDFDocument.create();
// // // // //             const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
// // // // //             const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

// // // // //             const pageWidth = 595.28;
// // // // //             const pageHeight = 841.89;
// // // // //             const margin = 50;
// // // // //             const bottomMargin = 50;
// // // // //             const maxWidth = pageWidth - (margin * 2);

// // // // //             let page = pdfDoc.addPage([pageWidth, pageHeight]);
// // // // //             let currentY = pageHeight - margin;

// // // // //             const checkAndAddPage = (requiredSpace: number) => {
// // // // //                 if (currentY - requiredSpace < bottomMargin) {
// // // // //                     page = pdfDoc.addPage([pageWidth, pageHeight]);
// // // // //                     currentY = pageHeight - margin;
// // // // //                 }
// // // // //             };

// // // // //             const drawWrappedText = (text: string, font: any, size: number, color: any, lineHeight: number = 14) => {
// // // // //                 const paragraphs = text.split('\n');

// // // // //                 for (const para of paragraphs) {
// // // // //                     if (para.trim() === '') {
// // // // //                         currentY -= lineHeight / 2;
// // // // //                         checkAndAddPage(lineHeight);
// // // // //                         continue;
// // // // //                     }

// // // // //                     const words = para.split(' ');
// // // // //                     let line = '';

// // // // //                     for (let n = 0; n < words.length; n++) {
// // // // //                         const testLine = line + words[n] + ' ';
// // // // //                         const testWidth = font.widthOfTextAtSize(testLine, size);

// // // // //                         if (testWidth > maxWidth && line.length > 0) {
// // // // //                             checkAndAddPage(lineHeight);
// // // // //                             page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
// // // // //                             line = words[n] + ' ';
// // // // //                             currentY -= lineHeight;
// // // // //                         } else {
// // // // //                             line = testLine;
// // // // //                         }
// // // // //                     }

// // // // //                     if (line.trim().length > 0) {
// // // // //                         checkAndAddPage(lineHeight);
// // // // //                         page.drawText(line.trim(), { x: margin, y: currentY, size, font, color });
// // // // //                         currentY -= lineHeight;
// // // // //                     }
// // // // //                 }
// // // // //             };

// // // // //             // 1. Draw Header
// // // // //             page.drawText(institutionName, { x: margin, y: currentY, size: 18, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // // // //             currentY -= 20;

// // // // //             // 🚀 Injected SDP Code into Header
// // // // //             page.drawText(`QCTO Accredited Training Provider | SDP Code: ${sdpCode}`, { x: margin, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // // // //             const generatedOn = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
// // // // //             const docTitle = 'Official Withdrawal Record';
// // // // //             const titleWidth = helveticaBold.widthOfTextAtSize(docTitle, 14);
// // // // //             page.drawText(docTitle, { x: pageWidth - margin - titleWidth, y: currentY + 20, size: 14, font: helveticaBold, color: rgb(0.86, 0.15, 0.15) });
// // // // //             const dateWidth = helvetica.widthOfTextAtSize(`Generated: ${generatedOn}`, 10);
// // // // //             page.drawText(`Generated: ${generatedOn}`, { x: pageWidth - margin - dateWidth, y: currentY, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // // // //             currentY -= 15;
// // // // //             page.drawLine({ start: { x: margin, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 2, color: rgb(0.03, 0.24, 0.3) });
// // // // //             currentY -= 35;

// // // // //             // 2. Learner Details
// // // // //             checkAndAddPage(60);
// // // // //             page.drawText('LEARNER DETAILS', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // // // //             currentY -= 20;
// // // // //             page.drawText(`Full Name: ${learner.fullName}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // // // //             const idText = `ID Number: ${learner.idNumber}`;
// // // // //             const idWidth = helveticaBold.widthOfTextAtSize(idText, 12);
// // // // //             page.drawText(idText, { x: pageWidth - margin - idWidth, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // // // //             currentY -= 40;

// // // // //             // 3. Exit Information
// // // // //             checkAndAddPage(60);
// // // // //             page.drawText('EXIT INFORMATION', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // // // //             currentY -= 20;
// // // // //             const formattedDate = new Date(date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
// // // // //             page.drawText(`Date of Exit: ${formattedDate}`, { x: margin, y: currentY, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // // // //             currentY -= 40;

// // // // //             // 4. Additional Notes
// // // // //             checkAndAddPage(60);
// // // // //             page.drawText('ADDITIONAL CONTEXT / NOTES', { x: margin, y: currentY, size: 10, font: helveticaBold, color: rgb(0.03, 0.24, 0.3) });
// // // // //             currentY -= 20;

// // // // //             const plainTextNotes = parseHtmlToPlainText(notes);
// // // // //             drawWrappedText(plainTextNotes, helvetica, 11, rgb(0.2, 0.2, 0.2), 14);
// // // // //             currentY -= 30;

// // // // //             // 5. Dynamic Signature Area
// // // // //             checkAndAddPage(100);

// // // // //             let sigImg = null;
// // // // //             if (user?.signatureUrl) {
// // // // //                 try {
// // // // //                     const sigRes = await fetch(user.signatureUrl);
// // // // //                     const sigBuffer = await sigRes.arrayBuffer();
// // // // //                     const isPng = user.signatureUrl.toLowerCase().includes('.png');
// // // // //                     sigImg = isPng ? await pdfDoc.embedPng(sigBuffer) : await pdfDoc.embedJpg(sigBuffer);
// // // // //                 } catch (e) {
// // // // //                     console.warn("Could not load user signature image", e);
// // // // //                 }
// // // // //             }

// // // // //             if (sigImg) {
// // // // //                 const sigDims = sigImg.scale(1);
// // // // //                 const maxSigW = 180;
// // // // //                 const maxSigH = 50;
// // // // //                 const scale = Math.min(maxSigW / sigDims.width, maxSigH / sigDims.height);
// // // // //                 page.drawImage(sigImg, {
// // // // //                     x: margin + 10,
// // // // //                     y: currentY + 5,
// // // // //                     width: sigDims.width * scale,
// // // // //                     height: sigDims.height * scale,
// // // // //                 });
// // // // //             } else {
// // // // //                 page.drawText(user?.fullName || 'Authorized Admin', { x: margin + 10, y: currentY + 10, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
// // // // //             }

// // // // //             page.drawText(generatedOn, { x: pageWidth - margin - 150, y: currentY + 10, size: 11, font: helvetica, color: rgb(0.1, 0.1, 0.1) });

// // // // //             page.drawLine({ start: { x: margin, y: currentY }, end: { x: margin + 200, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
// // // // //             page.drawText(`Authorized by: ${user?.fullName || 'Manager'}`, { x: margin, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // // // //             page.drawLine({ start: { x: pageWidth - margin - 200, y: currentY }, end: { x: pageWidth - margin, y: currentY }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
// // // // //             page.drawText('Date Authorized', { x: pageWidth - margin - 130, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

// // // // //             // 6. Append Attachments
// // // // //             const appendAttachment = async (url: string, label: string) => {
// // // // //                 if (!url) return;
// // // // //                 try {
// // // // //                     const response = await fetch(url);
// // // // //                     const buffer = await response.arrayBuffer();
// // // // //                     const isPdf = url.toLowerCase().match(/\.pdf(\?|$)/);
// // // // //                     const isPng = url.toLowerCase().match(/\.(png)(\?|$)/);
// // // // //                     const isJpg = url.toLowerCase().match(/\.(jpg|jpeg)(\?|$)/);

// // // // //                     if (isPdf) {
// // // // //                         const donorPdf = await PDFDocument.load(buffer);
// // // // //                         const pages = await pdfDoc.copyPages(donorPdf, donorPdf.getPageIndices());
// // // // //                         pages.forEach((p, i) => {
// // // // //                             const donorPage = pdfDoc.addPage(p);
// // // // //                             donorPage.drawText(`Attachment: ${label} (Page ${i + 1})`, { x: margin, y: donorPage.getSize().height - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
// // // // //                         });
// // // // //                     } else if (isPng || isJpg) {
// // // // //                         const imgPage = pdfDoc.addPage([pageWidth, pageHeight]);
// // // // //                         imgPage.drawText(`Attachment: ${label}`, { x: margin, y: pageHeight - 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

// // // // //                         let img;
// // // // //                         if (isPng) img = await pdfDoc.embedPng(buffer);
// // // // //                         if (isJpg) img = await pdfDoc.embedJpg(buffer);

// // // // //                         if (img) {
// // // // //                             const imgDims = img.scale(1);
// // // // //                             const maxW = 450;
// // // // //                             const maxH = 650;
// // // // //                             let scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
// // // // //                             const drawW = imgDims.width * scale;
// // // // //                             const drawH = imgDims.height * scale;

// // // // //                             imgPage.drawImage(img, {
// // // // //                                 x: (pageWidth - drawW) / 2,
// // // // //                                 y: (pageHeight - drawH) / 2 - 20,
// // // // //                                 width: drawW,
// // // // //                                 height: drawH,
// // // // //                             });
// // // // //                         }
// // // // //                     }
// // // // //                 } catch (e) {
// // // // //                     console.error(`Failed to fetch/append ${label}:`, e);
// // // // //                 }
// // // // //             };

// // // // //             await appendAttachment(existingResignationUrl, "Resignation Letter");
// // // // //             await appendAttachment(existingEvidenceUrl, "Other Evidence");

// // // // //             // 7. Save and Download
// // // // //             const pdfBytes: any = await pdfDoc.save();
// // // // //             const blob = new Blob([pdfBytes], { type: "application/pdf" });
// // // // //             const link = document.createElement('a');
// // // // //             link.href = URL.createObjectURL(blob);
// // // // //             link.download = `Withdrawal_Record_${learner.fullName.replace(/\s/g, '_')}.pdf`;
// // // // //             document.body.appendChild(link);
// // // // //             link.click();
// // // // //             document.body.removeChild(link);

// // // // //             toast.success("PDF generated successfully!");
// // // // //         } catch (err: any) {
// // // // //             console.error(err);
// // // // //             toast.error("Failed to generate PDF document.");
// // // // //         } finally {
// // // // //             setIsGeneratingPdf(false);
// // // // //         }
// // // // //     };

// // // // //     return createPortal(
// // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// // // // //             <style>{` .wm-modal, .wm-btn, .mlab-btn { border-radius: 0 !important; } `}</style>
// // // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
// // // // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-red)', paddingBottom: '1rem' }}>
// // // // //                     <div className="wm-modal__header-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
// // // // //                         <UserMinus size={20} />
// // // // //                     </div>
// // // // //                     <div>
// // // // //                         <h2 className="wm-modal__title">{isViewMode ? 'Withdrawal Record' : 'Process Learner Withdrawal'}</h2>
// // // // //                         <p className="wm-modal__subtitle">
// // // // //                             {isViewMode
// // // // //                                 ? `Official exit details for ${learner.fullName}`
// // // // //                                 : <>Officially remove <strong>{learner.fullName}</strong> from this cohort.</>
// // // // //                             }
// // // // //                         </p>
// // // // //                     </div>
// // // // //                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// // // // //                 </div>

// // // // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>

// // // // //                     {isViewMode ? (
// // // // //                         <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', color: 'var(--mlab-midnight)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// // // // //                             <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--mlab-grey)' }} />
// // // // //                             <span>This learner was officially withdrawn on <strong>{new Date(date).toLocaleDateString('en-ZA')}</strong>. Their historical data is retained for QCTO auditing.</span>
// // // // //                         </div>
// // // // //                     ) : (
// // // // //                         <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '6px', color: '#991b1b', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// // // // //                             <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
// // // // //                             <span>This action will update the learner's status to "Dropped", making them inactive in the roster while retaining their historical data for QCTO auditing.</span>
// // // // //                         </div>
// // // // //                     )}

// // // // //                     <div style={{ display: 'flex', gap: '1rem' }}>
// // // // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // // // //                             <label className="wm-form-label">Exit Date *</label>
// // // // //                             <input type="date" className="wm-form-input" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} disabled={isViewMode} readOnly={isViewMode} />
// // // // //                         </div>
// // // // //                         <div className="wm-form-group" style={{ flex: 2 }}>
// // // // //                             <label className="wm-form-label">Primary Reason *</label>
// // // // //                             <select className="wm-form-input" value={reason} onChange={e => setReason(e.target.value)} disabled={isViewMode}>
// // // // //                                 <option value="Not Started">Not Started (Never Attended)</option>
// // // // //                                 <option value="Employment/New Job">Employment / New Job</option>
// // // // //                                 <option value="Medical/Health">Medical / Health Reasons</option>
// // // // //                                 <option value="Financial Constraints">Financial Constraints</option>
// // // // //                                 <option value="Academic Difficulty">Academic Difficulty</option>
// // // // //                                 <option value="Disciplinary Dismissal">Disciplinary Dismissal</option>
// // // // //                                 <option value="Relocation">Relocation</option>
// // // // //                                 <option value="Deceased">Deceased</option>
// // // // //                                 <option value="Personal/Other">Personal / Other</option>
// // // // //                             </select>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div style={{ display: 'flex', gap: '1rem' }}>
// // // // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // // // //                             <label className="wm-form-label">Resignation Letter</label>
// // // // //                             {isViewMode ? (
// // // // //                                 renderEvidencePreview(existingResignationUrl, 'Resignation Letter')
// // // // //                             ) : (
// // // // //                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
// // // // //                                     <input type="file" id="resignation-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setResignationFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
// // // // //                                     <label htmlFor="resignation-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
// // // // //                                         <FileText size={24} color={resignationFile ? "var(--mlab-green)" : "#94a3b8"} />
// // // // //                                         <span style={{ fontSize: '0.75rem', color: resignationFile ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
// // // // //                                             {resignationFile ? resignationFile.name : (isViewMode ? 'Not Provided' : 'Upload Resignation Letter')}
// // // // //                                         </span>
// // // // //                                     </label>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>

// // // // //                         <div className="wm-form-group" style={{ flex: 1 }}>
// // // // //                             <label className="wm-form-label">Other Evidence (e.g. Medical)</label>
// // // // //                             {isViewMode ? (
// // // // //                                 renderEvidencePreview(existingEvidenceUrl, 'Other Evidence')
// // // // //                             ) : (
// // // // //                                 <div style={{ border: '2px dashed #cbd5e1', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: '#f8fafc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isViewMode ? 0.5 : 1 }}>
// // // // //                                     <input type="file" id="evidence-upload" accept="image/*,.pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} disabled={isViewMode} />
// // // // //                                     <label htmlFor="evidence-upload" style={{ cursor: isViewMode ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: 0 }}>
// // // // //                                         <UploadCloud size={24} color={file ? "var(--mlab-green)" : "#94a3b8"} />
// // // // //                                         <span style={{ fontSize: '0.75rem', color: file ? 'var(--mlab-midnight)' : '#64748b', fontWeight: 600 }}>
// // // // //                                             {file ? file.name : (isViewMode ? 'Not Provided' : 'Upload Other Evidence')}
// // // // //                                         </span>
// // // // //                                     </label>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div className="wm-form-group">
// // // // //                         <label className="wm-form-label">Additional Context / Notes</label>
// // // // //                         <div style={{ background: 'white', opacity: isViewMode ? 0.8 : 1 }}>
// // // // //                             <ReactQuill
// // // // //                                 theme="snow"
// // // // //                                 value={notes}
// // // // //                                 onChange={setNotes}
// // // // //                                 placeholder="Provide further context regarding this withdrawal..."
// // // // //                                 style={{ height: '120px', color: 'black', marginBottom: '45px' }}
// // // // //                                 readOnly={isViewMode}
// // // // //                             />
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 <div className="wm-modal__footer">
// // // // //                     <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isSubmitting || isGeneratingPdf}>Close</button>

// // // // //                     {isViewMode && (
// // // // //                         <button className="mlab-btn" style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }} onClick={handleGeneratePdfReport} disabled={isGeneratingPdf}>
// // // // //                             {isGeneratingPdf ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />} Generate PDF Report
// // // // //                         </button>
// // // // //                     )}

// // // // //                     {!isViewMode && (
// // // // //                         <button className="mlab-btn" style={{ background: 'var(--mlab-red)', color: 'white', border: 'none' }} onClick={handleSubmit} disabled={isSubmitting}>
// // // // //                             {isSubmitting ? <Loader2 size={16} className="spin" /> : <UserMinus size={16} />} Confirm Withdrawal
// // // // //                         </button>
// // // // //                     )}
// // // // //                 </div>
// // // // //             </div>
// // // // //         </div>,
// // // // //         document.body
// // // // //     );
// // // // // };