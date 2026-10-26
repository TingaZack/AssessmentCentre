// src/lib/webPush.ts

import { getApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import "./firebase"; // Ensures Firebase initialization runs before getApp()

export const VAPID_KEY = "" + import.meta.env.VITE_WEB_PUSH_API_KEY;

export const initializeWebPush = async (userId: string): Promise<boolean> => {
  // Check if browser supports notifications & service workers
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    console.warn(
      "Push notifications are not supported in this browser environment.",
    );
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission was denied by the user.");
      return false;
    }

    // Retrieve the active Firebase App instance
    const app = getApp();

    // Register service worker
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );
    const messaging = getMessaging(app);

    // Retrieve browser push token
    const currentToken = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey: VAPID_KEY,
    });

    if (!currentToken) {
      console.warn(
        "No registration token available. Request permission to generate one.",
      );
      return false;
    }

    // Register token to user topic via Cloud Function
    const functions = getFunctions(app, "us-central1");
    const subscribeFunction = httpsCallable<
      { token: string },
      { success: boolean }
    >(functions, "subscribeWebTokenToTopic");

    await subscribeFunction({ token: currentToken });
    console.log(
      "✅ Web Push token registered and subscribed to topic for user:",
      userId,
    );

    // Handle messages received while the tab is active in the foreground
    onMessage(messaging, (payload) => {
      console.log("Foreground notification received:", payload);
      if (Notification.permission === "granted") {
        new Notification(payload.notification?.title || "Community Mention", {
          body: payload.notification?.body,
          icon: "/logo192.png",
          data: payload.data,
        });
      }
    });

    return true;
  } catch (error) {
    console.error("Failed to initialize Web Push notifications:", error);
    return false;
  }
};
