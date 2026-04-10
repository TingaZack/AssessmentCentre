// src/components/ui/VerificationQRCode.tsx
import { QRCodeSVG } from 'qrcode.react';

interface Props {
    certId: string;
}

export const VerificationQRCode: React.FC<Props> = ({ certId }) => {
    const verificationUrl = `${window.location.origin}/sor/${certId}`;

    return (
        <div className="flex flex-col items-center p-2 bg-white border rounded-lg">
            <QRCodeSVG
                value={verificationUrl}
                size={120}
                level={"H"}
                includeMargin={true}
                imageSettings={{
                    src: "src/assets/mlab_logo.png",
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