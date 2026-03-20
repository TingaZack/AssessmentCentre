import React from "react";
import "./loader.css";

const Loader = ({ message = "Loading...", fullScreen = true }) => {
    return (
        <div className={fullScreen ? "loader-overlay" : "loader-inline"}>
            <div className="loader-card">
                <div className="loader-spinner" />
                <p>{message}</p>
            </div>
        </div>
    );
};

export default Loader;