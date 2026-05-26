import "./Loader.css";

const Loader = ({ message = "Loading...", fullScreen = true }) => {
    const containerStyle = fullScreen
        ? { position: 'absolute' as const, left: 0, right: 0, bottom: 0, top: 0 }
        : {};

    return (
        <div className="ap-fullscreen" style={containerStyle}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div className="ap-spinner" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
                    {message}
                </span>
            </div>
        </div>
    );
};

export default Loader;
