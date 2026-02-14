// src/components/common/UploadModal.tsx

import React, { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet } from 'lucide-react';

interface UploadModalProps {
    onClose: () => void;
    onUpload: (file: File) => Promise<void>;
    title: string;
    // Removed uploadOptions as we now use a unified master file
}

export const UploadModal: React.FC<UploadModalProps> = ({
    onClose,
    onUpload,
    title,
}) => {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const validateAndSetFile = (file: File) => {
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            alert('Please upload a CSV file.');
            return;
        }
        setFile(file);
    };

    const handleSubmit = async () => {
        if (!file) return;
        setIsUploading(true);
        try {
            await onUpload(file);
            onClose();
        } catch (error) {
            console.error(error);
            setIsUploading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button className="icon-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-body">
                    <div
                        className={`upload-zone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleChange}
                            hidden
                        />

                        {file ? (
                            <div className="file-preview">
                                <FileSpreadsheet size={48} className="text-green" />
                                <p className="file-name">{file.name}</p>
                                <p className="file-size">{(file.size / 1024).toFixed(2)} KB</p>
                                <button
                                    className="btn-link"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFile(null);
                                    }}
                                >
                                    Remove file
                                </button>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <Upload size={48} className="text-gray" />
                                <p>Drag & Drop your CSV file here</p>
                                <p className="sub-text">or click to browse</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-outline" onClick={onClose} disabled={isUploading}>
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={!file || isUploading}
                    >
                        {isUploading ? 'Importing...' : 'Upload & Import'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// // src/components/common/UploadModal.tsx

// import React, { useState, useRef } from 'react';
// import { X, Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';

// interface UploadOption {
//     label: string;
//     value: string;
// }

// interface UploadModalProps {
//     onClose: () => void;
//     onUpload: (file: File, type?: string) => Promise<void>;
//     title: string;
//     uploadOptions?: UploadOption[]; // New prop for the dropdown
// }

// export const UploadModal: React.FC<UploadModalProps> = ({
//     onClose,
//     onUpload,
//     title,
//     uploadOptions
// }) => {
//     const [dragActive, setDragActive] = useState(false);
//     const [selectedType, setSelectedType] = useState<string>(
//         uploadOptions ? uploadOptions[0].value : ''
//     );
//     const [file, setFile] = useState<File | null>(null);
//     const [isUploading, setIsUploading] = useState(false);
//     const fileInputRef = useRef<HTMLInputElement>(null);

//     const handleDrag = (e: React.DragEvent) => {
//         e.preventDefault();
//         e.stopPropagation();
//         if (e.type === 'dragenter' || e.type === 'dragover') {
//             setDragActive(true);
//         } else if (e.type === 'dragleave') {
//             setDragActive(false);
//         }
//     };

//     const handleDrop = (e: React.DragEvent) => {
//         e.preventDefault();
//         e.stopPropagation();
//         setDragActive(false);
//         if (e.dataTransfer.files && e.dataTransfer.files[0]) {
//             validateAndSetFile(e.dataTransfer.files[0]);
//         }
//     };

//     const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         e.preventDefault();
//         if (e.target.files && e.target.files[0]) {
//             validateAndSetFile(e.target.files[0]);
//         }
//     };

//     const validateAndSetFile = (file: File) => {
//         if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
//             alert('Please upload a CSV file.');
//             return;
//         }
//         setFile(file);
//     };

//     const handleSubmit = async () => {
//         if (!file) return;
//         setIsUploading(true);
//         try {
//             // Pass the file AND the selected type back to the parent
//             await onUpload(file, selectedType);
//             onClose();
//         } catch (error) {
//             console.error(error);
//             setIsUploading(false);
//         }
//     };

//     return (
//         <div className="modal-overlay" onClick={onClose}>
//             <div className="modal-content" onClick={(e) => e.stopPropagation()}>
//                 <div className="modal-header">
//                     <h2>{title}</h2>
//                     <button className="icon-btn" onClick={onClose}>
//                         <X size={24} />
//                     </button>
//                 </div>

//                 <div className="modal-body">
//                     {/* --- NEW DROPDOWN SECTION --- */}
//                     {uploadOptions && uploadOptions.length > 0 && (
//                         <div className="input-group" style={{ marginBottom: '1.5rem' }}>
//                             <label style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
//                                 Select Import Type
//                             </label>
//                             <select
//                                 value={selectedType}
//                                 onChange={(e) => setSelectedType(e.target.value)}
//                                 style={{
//                                     width: '100%',
//                                     padding: '0.75rem',
//                                     borderRadius: '8px',
//                                     border: '1px solid #e2e8f0',
//                                     fontSize: '1rem'
//                                 }}
//                             >
//                                 {uploadOptions.map((opt) => (
//                                     <option key={opt.value} value={opt.value}>
//                                         {opt.label}
//                                     </option>
//                                 ))}
//                             </select>

//                             {/* Helper text based on selection */}
//                             <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#64748b', display: 'flex', gap: '0.5rem' }}>
//                                 <AlertCircle size={14} style={{ marginTop: '2px' }} />
//                                 {selectedType === 'qcto'
//                                     ? "Uses 'NationalId' and 'LearnerFirstName'. Good for new registrations."
//                                     : "Uses 'ID_Number' and 'Module_Type'. Good for assessment results."}
//                             </div>
//                         </div>
//                     )}

//                     <div
//                         className={`upload-zone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
//                         onDragEnter={handleDrag}
//                         onDragLeave={handleDrag}
//                         onDragOver={handleDrag}
//                         onDrop={handleDrop}
//                         onClick={() => fileInputRef.current?.click()}
//                     >
//                         <input
//                             ref={fileInputRef}
//                             type="file"
//                             accept=".csv"
//                             onChange={handleChange}
//                             hidden
//                         />

//                         {file ? (
//                             <div className="file-preview">
//                                 <FileSpreadsheet size={48} className="text-green" />
//                                 <p className="file-name">{file.name}</p>
//                                 <p className="file-size">{(file.size / 1024).toFixed(2)} KB</p>
//                                 <button
//                                     className="btn-link"
//                                     onClick={(e) => {
//                                         e.stopPropagation();
//                                         setFile(null);
//                                     }}
//                                 >
//                                     Remove file
//                                 </button>
//                             </div>
//                         ) : (
//                             <div className="empty-state">
//                                 <Upload size={48} className="text-gray" />
//                                 <p>Drag & Drop your CSV file here</p>
//                                 <p className="sub-text">or click to browse</p>
//                             </div>
//                         )}
//                     </div>
//                 </div>

//                 <div className="modal-footer">
//                     <button className="btn btn-outline" onClick={onClose} disabled={isUploading}>
//                         Cancel
//                     </button>
//                     <button
//                         className="btn btn-primary"
//                         onClick={handleSubmit}
//                         disabled={!file || isUploading}
//                     >
//                         {isUploading ? 'Importing...' : 'Upload & Import'}
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );
// };