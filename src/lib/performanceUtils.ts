// src/lib/performanceUtils.ts

import { trace } from "firebase/performance";
import { perf } from "./firebase";

/**
 * Times the execution of a custom async operation and sends the duration to Firebase Performance Monitoring.
 *
 * @param traceName - Identifier for the trace (e.g., 'webcontainer_boot_time')
 * @param asyncFn - The function or promise to execute and measure
 */
export const measurePerformance = async <T>(
  traceName: string,
  asyncFn: () => Promise<T>,
  attributes?: Record<string, string>,
): Promise<T> => {
  if (!perf) {
    return await asyncFn();
  }

  const customTrace = trace(perf, traceName);

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      customTrace.putAttribute(key, String(value));
    });
  }

  customTrace.start();
  try {
    const result = await asyncFn();
    customTrace.stop();
    return result;
  } catch (error) {
    customTrace.putAttribute("has_error", "true");
    customTrace.stop();
    throw error;
  }
};
