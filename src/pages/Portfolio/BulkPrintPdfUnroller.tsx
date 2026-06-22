// src/components/views/ViewPortfolio/BulkPrintPdfUnroller.tsx

import React, { useState } from 'react';

interface BulkPrintPdfUnrollerProps {
    url: string;
}

export const BulkPrintPdfUnroller: React.FC<BulkPrintPdfUnrollerProps> = ({ url }) => {
    const [failed] = useState(false);
    const cleanUrl = url?.replace(/\s+/g, '');
    const inlineUrl = cleanUrl ? `${cleanUrl}&response-content-disposition=inline` : cleanUrl;

    if (!cleanUrl || failed) {
        return (
            <div style={{ padding: '25px 20px', border: '2px solid #000000', background: '#fafbfc', textAlign: 'center', fontFamily: 'Arial, sans-serif', marginTop: '15px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div style={{ fontSize: '22pt', marginBottom: '6px' }}>📋</div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', fontWeight: 'bold', color: '#000000', textTransform: 'uppercase' }}>
                    SECURE EVIDENCE ATTACHMENT COMPONENT RECORDED
                </h3>
                <p style={{ margin: '0 auto 12px', fontSize: '9.5pt', color: '#334155', maxWidth: '600px', lineHeight: 1.5 }}>
                    This objective document could not be rendered natively within the batch thread layout. Please review the system URI path inside the central tracker console or insert a hardcopy page directly behind this cover page descriptor slot.
                </p>
                <div style={{ fontSize: '8pt', fontFamily: 'monospace', color: '#4b5563', background: '#f3f4f6', padding: '6px 12px', display: 'inline-block', borderRadius: '4px', maxWidth: '100%', wordBreak: 'break-all' }}>
                    System URI Token: {cleanUrl}
                </div>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', textAlign: 'center', boxSizing: 'border-box', marginTop: '10px' }}>
            <embed src={inlineUrl} type="application/pdf" style={{ width: '100%', height: '500px', border: 'none', display: 'block' }} />
        </div>
    );
};