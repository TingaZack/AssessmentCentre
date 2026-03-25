import "./loader.css";

const Loader = ({ message = "Loading...", fullScreen = true }) => {
    return (
        // <div className={fullScreen ? "loader-overlay" : "loader-inline"}>
        //     <div className="loader-card">
        //         <div className="loader-spinner" />
        //         <p>{message}</p>
        //     </div>
        // </div>
        // if (loading) return (
        <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div className="ap-spinner" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
                    {/* Verifying Access... */}
                    {message}
                </span>
            </div>
        </div>
        // );
    );
};

export default Loader;