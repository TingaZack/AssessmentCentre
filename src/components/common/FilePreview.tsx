import React from 'react';
import { FileText, Trash2 } from 'lucide-react';

export const FilePreview = ({
    url,
    onRemove,
    disabled,
}: {
    url: string;
    onRemove?: () => void;
    disabled?: boolean;
}) => {
    const isLinkValid = (u?: string) =>
        u && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:'));

    if (!isLinkValid(url)) {
        return (
            <div className="ap-file-preview__fallback">
                <span className="ap-file-preview__fallback-name" style={{ color: 'black' }}>Selected file: {url}</span>
                {!disabled && onRemove && (
                    <button type="button" className="ap-file-preview__remove-btn" onClick={onRemove}>
                        <Trash2 size={14} />
                    </button>
                )}
            </div>
        );
    }

    const getExt = (u: string) => {
        try { return u.split('?')[0].split('.').pop()!.toLowerCase(); } catch { return ''; }
    };

    const ext = getExt(url);
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
    const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
    const isPdf = ext === 'pdf';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
    const googleDocsUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

    return (
        <div className="ap-file-preview">
            <div className="ap-file-preview__bar">
                <span className="ap-file-preview__bar-label">
                    <FileText size={13} /> Evidence Preview
                </span>
                <div className="ap-file-preview__bar-actions">
                    <a href={url} target="_blank" rel="noreferrer" className="ap-file-preview__open-link no-print">
                        {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
                    </a>
                    {!disabled && onRemove && (
                        <button type="button" className="ap-file-preview__remove-btn" onClick={onRemove} title="Remove Evidence">
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            <div className={`ap-file-preview__body${isImage || isVideo ? ' ap-file-preview__body--padded' : ''} no-print`}>
                {isImage && <img src={url} alt="Preview" className="ap-file-preview__img" />}
                {isVideo && <video src={url} controls className="ap-file-preview__video" />}
                {isPdf && <iframe src={url} className="ap-file-preview__iframe" title="PDF Preview" />}
                {isOffice && (
                    <>
                        <div className="ap-file-preview__office-note">
                            <strong>Note:</strong> If the document appears blank, use <strong>Download / View Native</strong> above.
                        </div>
                        <iframe src={googleDocsUrl} className="ap-file-preview__iframe" title="Office Document Preview" />
                    </>
                )}
                {!isImage && !isVideo && !isPdf && !isOffice && (
                    <div className="ap-file-preview__no-preview">
                        <FileText size={32} />
                        <p>Rich preview not available.<br />Use the link above to download.</p>
                    </div>
                )}
            </div>

            <div className="print-only" style={{ padding: '8pt', fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>
                [Digital Evidence Attached: {url.split('?')[0].split('/').pop()}]
            </div>
        </div>
    );
};