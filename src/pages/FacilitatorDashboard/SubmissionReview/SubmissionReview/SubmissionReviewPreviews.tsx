import React, { useState } from 'react';
import { FileText, Trash2, Eye, ExternalLink, Link as LinkIcon, Code } from 'lucide-react';

export interface FilePreviewProps {
    url?: string;
    onRemove?: () => void;
    disabled?: boolean;
}

export interface UrlPreviewProps {
    url?: string;
}

// ─── FILE PREVIEW ─────────────────────────────────────────────────────────────
export const FilePreview: React.FC<FilePreviewProps> = ({ url, onRemove, disabled }) => {
    const [loadOfficePreview, setLoadOfficePreview] = useState(false);

    if (!url) return null;

    // Validate HTTP/HTTPS/Data link format
    const isLinkValid = (u?: string) =>
        Boolean(u && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')));

    // Fallback UI for pending, raw local, or invalid URLs
    if (!isLinkValid(url)) {
        return (
            <div className="sr-file-preview__fallback ap-file-preview__fallback" style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span className="ap-file-preview__fallback-name" style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    Selected file: {url}
                </span>
                {!disabled && onRemove && (
                    <button
                        type="button"
                        className="ap-file-preview__remove-btn"
                        onClick={onRemove}
                        style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="Remove Evidence"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>
        );
    }

    // Extract extension safely (strips Firebase tokens and decodes URI)
    const getExtension = (urlStr: string) => {
        try {
            const urlWithoutQuery = urlStr.split('?')[0];
            const decoded = decodeURIComponent(urlWithoutQuery);
            const parts = decoded.split('.');
            if (parts.length <= 1) return '';
            return parts[parts.length - 1].toLowerCase();
        } catch {
            return '';
        }
    };

    const ext = getExtension(url);
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(ext);
    const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'quicktime'].includes(ext);
    const isPdf = ext === 'pdf';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
    const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    const fileName = url.split('?')[0].split('/').pop() || 'evidence-file';

    return (
        <div className="sr-file-preview ap-file-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            {/* TOOLBAR */}
            <div className="ap-file-preview__bar" style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', flexWrap: 'wrap', gap: '8px' }}>
                <span className="ap-file-preview__bar-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} /> Evidence Preview
                </span>

                <div className="ap-file-preview__bar-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <a href={url} target="_blank" rel="noreferrer" className="ap-file-preview__open-link no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue, #0284c7)', fontWeight: 'bold', textDecoration: 'underline' }}>
                        {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
                    </a>

                    {!disabled && onRemove && (
                        <button
                            type="button"
                            className="ap-file-preview__remove-btn"
                            onClick={(e) => {
                                e.preventDefault();
                                onRemove();
                            }}
                            title="Remove Evidence"
                            style={{
                                background: 'var(--mlab-red, #ef4444)', color: 'white', border: 'none',
                                padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                fontSize: '0.7rem', fontWeight: 'bold'
                            }}
                        >
                            <Trash2 size={12} /> Remove
                        </button>
                    )}
                </div>
            </div>

            {/* PRINT AUDIT VIEW */}
            <div className="print-only" style={{ padding: '8pt', fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>
                [Digital Evidence Attached: {fileName}] <br />
                <strong>URL:</strong> {url}
            </div>

            {/* INTERACTIVE PREVIEW */}
            <div className={`ap-file-preview__body${isImage || isVideo ? ' ap-file-preview__body--padded' : ''} no-print`} style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: isImage || isVideo ? '10px' : '0', minHeight: '100px' }}>
                {isImage && <img src={url} alt="Preview" crossOrigin="anonymous" className="ap-file-preview__img" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }} />}
                {isVideo && <video src={url} controls className="ap-file-preview__video" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px' }} />}
                {isPdf && <iframe src={url} className="ap-file-preview__iframe" style={{ width: '100%', height: '500px', border: 'none' }} title="PDF Preview" />}

                {/* OFFICE DOCUMENTS: ON-DEMAND PREVIEW */}
                {isOffice && (
                    <div style={{ width: '100%' }}>
                        {!loadOfficePreview ? (
                            <div className="ap-file-preview__office-card" style={{ padding: '1.5rem', textAlign: 'center', background: '#ffffff', borderBottom: '1px solid #cbd5e1' }}>
                                <FileText size={32} color="#0284c7" style={{ margin: '0 auto 8px' }} />
                                <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b' }}>
                                    Office Document ({ext.toUpperCase()})
                                </p>
                                <p style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: '#64748b' }}>
                                    Click below to load inline web preview via Google Docs Viewer, or download directly.
                                </p>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => setLoadOfficePreview(true)}
                                        style={{
                                            background: '#0284c7', color: 'white', border: 'none',
                                            padding: '6px 14px', borderRadius: '4px', cursor: 'pointer',
                                            fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px'
                                        }}
                                    >
                                        <Eye size={14} /> Load Inline Preview
                                    </button>
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                            background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1',
                                            padding: '6px 14px', borderRadius: '4px', textDecoration: 'none',
                                            fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px'
                                        }}
                                    >
                                        <ExternalLink size={14} /> Download File
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="ap-file-preview__office-note" style={{ padding: '8px 12px', width: '100%', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#b45309', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span><strong>Note:</strong> If web preview fails to load or appears blank, use <strong>Download / View Native</strong> above.</span>
                                    <button
                                        type="button"
                                        onClick={() => setLoadOfficePreview(false)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}
                                    >
                                        Hide Preview ✕
                                    </button>
                                </div>
                                <iframe src={googleDocsViewerUrl} className="ap-file-preview__iframe" style={{ width: '100%', height: '500px', border: 'none' }} title="Office Document Preview" />
                            </div>
                        )}
                    </div>
                )}

                {!isImage && !isVideo && !isPdf && !isOffice && (
                    <div className="ap-file-preview__no-preview" style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        <FileText size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>Rich preview not available.<br />Use the link above to download.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── URL PREVIEW ──────────────────────────────────────────────────────────────
export const UrlPreview: React.FC<UrlPreviewProps> = ({ url }) => {
    if (!url) return null;

    let embedUrl = url;
    let isEmbeddable = true;

    if (url.includes('youtube.com/watch?v=')) {
        embedUrl = url.replace('watch?v=', 'embed/');
    } else if (url.includes('youtu.be/')) {
        embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
    } else if (url.includes('docs.google.com') || url.includes('drive.google.com')) {
        embedUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
    } else if (url.includes('github.com')) {
        isEmbeddable = false;
    }

    return (
        <div className="sr-url-preview ap-url-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <div className="ap-file-preview__bar" style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
                <span className="ap-file-preview__bar-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LinkIcon size={14} /> Link Evidence Provided
                </span>
                <a href={url} target="_blank" rel="noreferrer" className="ap-file-preview__open-link no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue, #0284c7)', fontWeight: 'bold', textDecoration: 'underline' }}>
                    Open in New Tab
                </a>
            </div>

            <div className="print-only" style={{ padding: '8pt', fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>
                [External Link Evidence: {url}]
            </div>

            <div className="ap-url-preview__body no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }}>
                {isEmbeddable ? (
                    <iframe src={embedUrl} className="ap-file-preview__iframe" style={{ width: '100%', height: '400px', border: 'none' }} title="URL Preview" />
                ) : (
                    <div className="ap-url-preview__no-embed" style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        <Code size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>This link (e.g., GitHub) blocks inline previewing.<br />Please use the link above to view it securely in a new tab.</p>
                    </div>
                )}
            </div>
        </div>
    );
};



// import React, { useState } from 'react';
// import { FileText, Trash2, Eye, ExternalLink, Link as LinkIcon, Code } from 'lucide-react';

// interface FilePreviewProps {
//     url?: string;
//     onRemove?: () => void;
//     disabled?: boolean;
// }

// interface UrlPreviewProps {
//     url?: string;
// }

// // ─── FILE PREVIEW ─────────────────────────────────────────────────────────────
// export const FilePreview: React.FC<FilePreviewProps> = ({ url, onRemove, disabled }) => {
//     const [loadOfficePreview, setLoadOfficePreview] = useState(false);

//     if (!url) return null;

//     const getExtension = (urlStr: string) => {
//         try {
//             // 1. Strip the Firebase token/query parameters first
//             const urlWithoutQuery = urlStr.split('?')[0];

//             // 2. Decode the URL (Firebase encodes spaces as %20, slashes as %2F)
//             const decoded = decodeURIComponent(urlWithoutQuery);

//             // 3. Extract the extension safely
//             const parts = decoded.split('.');
//             if (parts.length <= 1) return '';

//             return parts[parts.length - 1].toLowerCase();
//         } catch {
//             return '';
//         }
//     };

//     const ext = getExtension(url);

//     const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(ext);
//     const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'quicktime'].includes(ext);
//     const isPdf = ext === 'pdf';
//     const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
//     const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

//     return (
//         <div className="sr-file-preview ap-file-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
//             <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', flexWrap: 'wrap', gap: '8px' }}>
//                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                     <FileText size={14} /> Uploaded Evidence
//                 </span>

//                 {/* ACTION BUTTONS (Download + Remove) */}
//                 <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
//                     <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue, #0284c7)', fontWeight: 'bold', textDecoration: 'underline' }}>
//                         {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
//                     </a>

//                     {onRemove && !disabled && (
//                         <button
//                             type="button"
//                             onClick={(e) => {
//                                 e.preventDefault();
//                                 onRemove();
//                             }}
//                             style={{
//                                 background: 'var(--mlab-red, #ef4444)', color: 'white', border: 'none',
//                                 padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
//                                 display: 'flex', alignItems: 'center', gap: '4px',
//                                 fontSize: '0.7rem', fontWeight: 'bold'
//                             }}
//                         >
//                             <Trash2 size={12} /> Remove
//                         </button>
//                     )}
//                 </div>
//             </div>

//             <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
//                 <strong>File:</strong> {url.split('?')[0].split('/').pop()} <br />
//                 <strong>URL:</strong> {url}
//             </div>

//             <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: isImage || isVideo ? '10px' : '0', minHeight: '100px' }}>
//                 {isImage && <img src={url} alt="Preview" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }} />}
//                 {isVideo && <video src={url} controls style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px' }} />}
//                 {isPdf && <iframe src={url} style={{ width: '100%', height: '500px', border: 'none' }} title="PDF Preview" />}

//                 {/* OFFICE DOCUMENTS: ON-DEMAND LAZY PREVIEW */}
//                 {isOffice && (
//                     <div style={{ width: '100%' }}>
//                         {!loadOfficePreview ? (
//                             <div style={{ padding: '1.5rem', textAlign: 'center', background: '#ffffff', borderBottom: '1px solid #cbd5e1' }}>
//                                 <FileText size={32} color="#0284c7" style={{ margin: '0 auto 8px' }} />
//                                 <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b' }}>
//                                     Office Document ({ext.toUpperCase()})
//                                 </p>
//                                 <p style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: '#64748b' }}>
//                                     Click below to load inline web preview via Google Docs Viewer, or download directly.
//                                 </p>
//                                 <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
//                                     <button
//                                         type="button"
//                                         onClick={() => setLoadOfficePreview(true)}
//                                         style={{
//                                             background: '#0284c7', color: 'white', border: 'none',
//                                             padding: '6px 14px', borderRadius: '4px', cursor: 'pointer',
//                                             fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px'
//                                         }}
//                                     >
//                                         <Eye size={14} /> Load Inline Preview
//                                     </button>
//                                     <a
//                                         href={url}
//                                         target="_blank"
//                                         rel="noreferrer"
//                                         style={{
//                                             background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1',
//                                             padding: '6px 14px', borderRadius: '4px', textDecoration: 'none',
//                                             fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px'
//                                         }}
//                                     >
//                                         <ExternalLink size={14} /> Download File
//                                     </a>
//                                 </div>
//                             </div>
//                         ) : (
//                             <div>
//                                 <div style={{ padding: '8px 12px', width: '100%', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#b45309', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <span><strong>Note:</strong> If web preview fails to load, use the <strong>Download / View Native</strong> link above.</span>
//                                     <button
//                                         type="button"
//                                         onClick={() => setLoadOfficePreview(false)}
//                                         style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}
//                                     >
//                                         Hide Preview ✕
//                                     </button>
//                                 </div>
//                                 <iframe src={googleDocsViewerUrl} style={{ width: '100%', height: '500px', border: 'none' }} title="Office Preview" />
//                             </div>
//                         )}
//                     </div>
//                 )}

//                 {!isImage && !isVideo && !isPdf && !isOffice && (
//                     <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
//                         <FileText size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
//                         <p style={{ margin: 0, fontSize: '0.8rem' }}>Rich preview not available for this file type.<br />Please use the link above to download it.</p>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };

// // ─── URL PREVIEW ──────────────────────────────────────────────────────────────
// export const UrlPreview: React.FC<UrlPreviewProps> = ({ url }) => {
//     if (!url) return null;

//     let embedUrl = url;
//     let isEmbeddable = true;

//     if (url.includes('youtube.com/watch?v=')) {
//         embedUrl = url.replace('watch?v=', 'embed/');
//     } else if (url.includes('youtu.be/')) {
//         embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
//     } else if (url.includes('docs.google.com') || url.includes('drive.google.com')) {
//         embedUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
//     } else if (url.includes('github.com')) {
//         isEmbeddable = false;
//     }

//     return (
//         <div className="sr-url-preview ap-url-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
//             <div className="ap-file-preview__bar" style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
//                 <span className="ap-file-preview__bar-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                     <LinkIcon size={14} /> Link Evidence Provided
//                 </span>
//                 <a href={url} target="_blank" rel="noreferrer" className="ap-file-preview__open-link no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue, #0284c7)', fontWeight: 'bold', textDecoration: 'underline' }}>
//                     Open in New Tab
//                 </a>
//             </div>

//             <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
//                 <strong>Link:</strong> <a href={url} style={{ color: '#073f4e', wordBreak: 'break-all' }}>{url}</a>
//             </div>

//             <div className="ap-url-preview__body no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }}>
//                 {isEmbeddable ? (
//                     <iframe src={embedUrl} className="ap-file-preview__iframe" style={{ width: '100%', height: '400px', border: 'none' }} title="URL Preview" />
//                 ) : (
//                     <div className="ap-url-preview__no-embed" style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
//                         <Code size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
//                         <p style={{ margin: 0, fontSize: '0.8rem' }}>This link (e.g., GitHub) blocks inline previewing.<br />Please use the link above to view it securely in a new tab.</p>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };