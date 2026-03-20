import React from 'react';
import { LinkIcon, Code } from 'lucide-react';

export const UrlPreview = ({ url }: { url: string }) => {
    if (!url) return null;

    let embedUrl = url;
    let isEmbeddable = true;

    if (url.includes('youtube.com/watch?v=')) embedUrl = url.replace('watch?v=', 'embed/');
    else if (url.includes('youtu.be/')) embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
    else if (url.includes('docs.google.com') || url.includes('drive.google.com'))
        embedUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
    else if (url.includes('github.com')) isEmbeddable = false;

    return (
        <div className="ap-url-preview">
            <div className="ap-file-preview__bar">
                <span className="ap-file-preview__bar-label">
                    <LinkIcon size={13} /> Link Evidence Provided
                </span>
                <a href={url} target="_blank" rel="noreferrer" className="ap-file-preview__open-link no-print">
                    Open in New Tab
                </a>
            </div>
            <div className="print-only" style={{ padding: '8pt', fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>
                [External Link: {url}]
            </div>
            <div className="ap-url-preview__body no-print">
                {isEmbeddable ? (
                    <iframe src={embedUrl} className="ap-file-preview__iframe" title="URL Preview" />
                ) : (
                    <div className="ap-url-preview__no-embed">
                        <Code size={32} />
                        <p>This link blocks inline previewing.<br />Use the link above to view it in a new tab.</p>
                    </div>
                )}
            </div>
        </div>
    );
};