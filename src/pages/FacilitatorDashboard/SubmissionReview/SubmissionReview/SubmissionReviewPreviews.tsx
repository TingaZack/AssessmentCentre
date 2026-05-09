import React from 'react';
import { FileText, Trash2 } from 'lucide-react';

interface FilePreviewProps {
    url?: string;
    onRemove?: () => void;
    disabled?: boolean;
}

// ─── FILE PREVIEW ─────────────────────────────────────────────────────────────
export const FilePreview: React.FC<FilePreviewProps> = ({ url, onRemove, disabled }) => {
    if (!url) return null;

    const getExtension = (urlStr: string) => {
        try {
            // 1. Strip the Firebase token/query parameters first
            const urlWithoutQuery = urlStr.split('?')[0];

            // 2. Decode the URL (Firebase encodes spaces as %20, slashes as %2F)
            // This is what was causing the broken images!
            const decoded = decodeURIComponent(urlWithoutQuery);

            // 3. Extract the extension safely
            const parts = decoded.split('.');
            if (parts.length <= 1) return '';

            return parts[parts.length - 1].toLowerCase();
        } catch {
            return '';
        }
    };

    const ext = getExtension(url);

    // Expanded the list to cover more common image/video types from phones
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(ext);
    const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'quicktime'].includes(ext);
    const isPdf = ext === 'pdf';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
    const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

    return (
        <div className="sr-file-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} /> Uploaded Evidence
                </span>

                {/* ACTION BUTTONS (Download + Remove) */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>
                        {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
                    </a>

                    {/* THE MISSING ONREMOVE BUTTON */}
                    {onRemove && !disabled && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                onRemove();
                            }}
                            style={{
                                background: 'var(--mlab-red)', color: 'white', border: 'none',
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

            <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                <strong>File:</strong> {url.split('?')[0].split('/').pop()} <br />
                <strong>URL:</strong> {url}
            </div>

            <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: isImage || isVideo ? '10px' : '0', minHeight: '100px' }}>
                {isImage && <img src={url} alt="Preview" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }} />}
                {isVideo && <video src={url} controls style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px' }} />}
                {isPdf && <iframe src={url} style={{ width: '100%', height: '500px', border: 'none' }} title="PDF Preview" />}
                {isOffice && (
                    <div style={{ width: '100%' }}>
                        <div style={{ padding: '10px', width: '100%', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#b45309', fontSize: '0.75rem', textAlign: 'center' }}>
                            <strong>Note:</strong> Office documents use a web previewer. If it fails to load, use the <strong>Download / View Native</strong> link above.
                        </div>
                        <iframe src={googleDocsViewerUrl} style={{ width: '100%', height: '500px', border: 'none' }} title="Office Preview" />
                    </div>
                )}
                {!isImage && !isVideo && !isPdf && !isOffice && (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        <FileText size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>Rich preview not available for this file type.<br />Please use the link above to download it.</p>
                    </div>
                )}
            </div>
        </div>
    );
};



// // src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReviewPreviews.tsx
// import React from 'react';
// import { FileText, Link as LinkIcon, Code } from 'lucide-react';

// // ─── FILE PREVIEW ─────────────────────────────────────────────────────────────
// export const FilePreview = ({ url }: { url?: string }) => {
//     if (!url) return null;

//     const getExtension = (urlStr: string) => {
//         try {
//             const urlWithoutQuery = urlStr.split('?')[0];
//             const parts = urlWithoutQuery.split('.');
//             return parts[parts.length - 1].toLowerCase();
//         } catch { return ''; }
//     };

//     const ext = getExtension(url);
//     const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
//     const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
//     const isPdf = ext === 'pdf';
//     const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
//     const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

//     return (
//         <div className="sr-file-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
//             <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
//                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                     <FileText size={14} /> Uploaded Evidence
//                 </span>
//                 <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>
//                     {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
//                 </a>
//             </div>
//             <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
//                 <strong>File:</strong> {url.split('?')[0].split('/').pop()} <br />
//                 <strong>URL:</strong> {url}
//             </div>
//             <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: isImage || isVideo ? '10px' : '0', minHeight: '100px' }}>
//                 {isImage && <img src={url} alt="Preview" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }} />}
//                 {isVideo && <video src={url} controls style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px' }} />}
//                 {isPdf && <iframe src={url} style={{ width: '100%', height: '500px', border: 'none' }} title="PDF Preview" />}
//                 {isOffice && (
//                     <div style={{ width: '100%' }}>
//                         <div style={{ padding: '10px', width: '100%', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#b45309', fontSize: '0.75rem', textAlign: 'center' }}>
//                             <strong>Note:</strong> Office documents use a web previewer. If it fails to load, use the <strong>Download / View Native</strong> link above.
//                         </div>
//                         <iframe src={googleDocsViewerUrl} style={{ width: '100%', height: '500px', border: 'none' }} title="Office Preview" />
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
// export const UrlPreview = ({ url }: { url?: string }) => {
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
//         <div className="sr-url-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
//             <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
//                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                     <LinkIcon size={14} /> Link Evidence Provided
//                 </span>
//                 <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>Open Link in New Tab</a>
//             </div>
//             <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
//                 <strong>Link:</strong> <a href={url} style={{ color: '#073f4e', wordBreak: 'break-all' }}>{url}</a>
//             </div>
//             <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }}>
//                 {isEmbeddable ? (
//                     <iframe src={embedUrl} style={{ width: '100%', height: '400px', border: 'none' }} title="URL Preview" />
//                 ) : (
//                     <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
//                         <Code size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
//                         <p style={{ margin: 0, fontSize: '0.8rem' }}>This link (e.g. GitHub) blocks inline previewing.<br />Please use the link above to view it securely in a new tab.</p>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };