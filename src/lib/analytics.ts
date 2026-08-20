// src/lib/analytics.ts

import { getAnalytics, logEvent } from "firebase/analytics";

export const trackFeatureUse = (
  eventName: string,
  params: Record<string, any> = {},
) => {
  try {
    const analytics = getAnalytics();
    logEvent(analytics, eventName, {
      timestamp: new Date().toISOString(),
      ...params,
    });
  } catch (e) {
    console.warn(`[Analytics Blocked]: ${eventName}`, params);
  }
};

// Example Usage:
// trackFeatureUse('submit_assessment', { assessmentId: 'module_101', score: 85 });
// trackFeatureUse('upload_poa_doc', { docType: 'utility_bill' });
