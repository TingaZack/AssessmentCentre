// src/hooks/usePageTracking.ts

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getAnalytics, logEvent } from "firebase/analytics";
import { useStore } from "../store/useStore";

export const usePageTracking = () => {
  const location = useLocation();
  const { user } = useStore();

  useEffect(() => {
    try {
      const analytics = getAnalytics();
      logEvent(analytics, "page_view", {
        page_path: location.pathname,
        page_location: window.location.href,
        user_role: user?.role || "guest",
        user_id: user?.uid || "anonymous",
      });
    } catch (err) {
      // Analytics might be blocked by ad-blockers in development
      console.log(err);
    }
  }, [location, user]);
};
