// src/pages/AppScannerRequired.tsx
import { Smartphone, ExternalLink } from 'lucide-react';

export const AppScannerRequired = () => {

    // Replace 'codetribe://' with the exact scheme defined in your Expo app.json
    // If you haven't set one yet, add "scheme": "codetribe" to app.json!
    const handleOpenApp = () => {
        window.location.href = 'codetribe://';
    };

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px', textAlign: 'center' }}>
            <div style={{ background: '#e6f0fb', padding: '20px', borderRadius: '50%', marginBottom: '24px' }}>
                <Smartphone size={64} color="var(--mlab-blue)" />
            </div>

            <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '2.2rem', margin: '0 0 16px 0' }}>
                Please Use the App
            </h1>

            <p style={{ color: '#475569', maxWidth: '420px', lineHeight: 1.6, marginBottom: '32px', fontSize: '1.05rem' }}>
                You cannot clock in using your phone's native camera.
                Please open the <strong>CodeTribe Connect mobile app</strong>, navigate to your Dashboard, and tap <strong>"Scan Attendance"</strong>.
            </p>

            <button
                onClick={handleOpenApp}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'var(--mlab-blue)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '16px 32px',
                    borderRadius: '30px',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    fontFamily: 'var(--font-heading)',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(7, 63, 78, 0.2)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
                <ExternalLink size={20} />
                Open CodeTribe App
            </button>

            <p style={{ marginTop: '24px', fontSize: '0.9rem', color: '#94a3b8' }}>
                Don't have the app installed? Contact your facilitator.
            </p>
        </div>
    );
}


// // src/pages/AppScannerRequired.tsx
// import { Smartphone } from 'lucide-react';

// export const AppScannerRequired = () => {
//     return (
//         <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px', textAlign: 'center' }}>
//             <Smartphone size={64} color="var(--mlab-blue)" style={{ marginBottom: '20px' }} />
//             <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '2rem' }}>
//                 Please Use the App
//             </h1>
//             <p style={{ color: '#475569', maxWidth: '400px', lineHeight: 1.6 }}>
//                 You cannot clock in using your phone's native camera.
//                 Please open the <strong>CodeTribe mobile app</strong>, navigate to the Dashboard, and tap <strong>"Open Scanner"</strong> to scan this code.
//             </p>
//         </div>
//     );
// }