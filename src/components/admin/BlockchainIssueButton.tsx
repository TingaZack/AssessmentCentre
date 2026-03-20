// src/components/admin/BlockchainIssueButton.tsx

import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { generateSorId } from '../../pages/utils/validation';
import { issueBlockchainCertificate } from '../../pages/utils/lib/web3/blockchainService';
import { uploadToIPFS } from '../../pages/utils/lib/pinata';

interface Props {
    learner: {
        id: string; // Firebase UID
        name: string;
        idNumber: string;
        qualification: string;
        eisaStatus: string;
    };
    pdfFile: File; // The generated Statement of Results PDF
}

export const BlockchainIssueButton: React.FC<Props> = ({ learner, pdfFile }) => {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'blockchain' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleIssue = async () => {
        setStatus('uploading');
        try {
            // 1. Generate the unique internal SOR ID
            const today = new Date().toISOString().split('T')[0];
            const certId = generateSorId(learner.name, today);

            // 2. Upload the PDF to IPFS via Pinata
            const ipfsHash = await uploadToIPFS(pdfFile);

            // 3. Request MetaMask to sign and issue to Blockchain
            setStatus('blockchain');
            const fingerprint = await issueBlockchainCertificate(
                certId,
                learner.name,
                learner.idNumber,
                learner.qualification,
                today,
                learner.eisaStatus,
                ipfsHash
            );

            // 4. Update Firebase with the Web3 proof
            const learnerRef = doc(db, "learners", learner.id);
            await updateDoc(learnerRef, {
                verificationCode: certId,
                ipfsHash: ipfsHash,
                blockchainFingerprint: fingerprint,
                isBlockchainVerified: true,
                issuedAt: today
            });

            setStatus('success');
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || "Failed to secure certificate");
            setStatus('error');
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <button
                onClick={handleIssue}
                disabled={status === 'uploading' || status === 'blockchain' || status === 'success'}
                className={`px-6 py-2 rounded-lg font-bold text-white transition-all ${status === 'success' ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                    } disabled:opacity-50`}
            >
                {status === 'idle' && "Issue Digital Certificate"}
                {status === 'uploading' && "Uploading to IPFS..."}
                {status === 'blockchain' && "Sign in MetaMask..."}
                {status === 'success' && "✅ Secured on Blockchain"}
                {status === 'error' && "Retry Issuance"}
            </button>

            {status === 'error' && (
                <p className="text-xs text-red-500 mt-1">{errorMsg}</p>
            )}
        </div>
    );
};