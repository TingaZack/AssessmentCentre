// src/components/ui/VerificationQRCode.tsx
import { QRCodeSVG } from 'qrcode.react';

interface Props {
    certId: string;
}

export const VerificationQRCode: React.FC<Props> = ({ certId }) => {
    // This creates the absolute URL for the verification page
    // In production, change 'localhost:5173' to your real domain (e.g., mlab-verify.co.za)
    const verificationUrl = `${window.location.origin}/sor/${certId}`;

    return (
        <div className="flex flex-col items-center p-2 bg-white border rounded-lg">
            <QRCodeSVG
                value={verificationUrl}
                size={120}
                level={"H"} // High error correction
                includeMargin={true}
                imageSettings={{
                    src: "/mlab-logo-icon.png", // Optional: put a tiny mLab logo in the middle
                    x: undefined,
                    y: undefined,
                    height: 24,
                    width: 24,
                    excavate: true,
                }}
            />
            <p className="text-[10px] mt-1 text-gray-400 font-mono">{certId}</p>
        </div>
    );
};