import React from 'react';

export const UploadProgress = ({ progress }: { progress: number }) => (
    <div className="ap-upload-progress">
        <div className="ap-upload-progress__header">
            <span>Uploading…</span>
            <span>{progress}%</span>
        </div>
        <div className="ap-upload-progress__track">
            <div className="ap-upload-progress__fill" style={{ width: `${progress}%` }} />
        </div>
    </div>
);