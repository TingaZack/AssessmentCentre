// public/firebase-messaging-sw.js

importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js",
);

const firebaseConfig = {
  apiKey: "AIzaSyD84T_nCTIgTTjeTdTOC31B7KXzdsB7AFw",
  authDomain: "mlabassessmentcenter.firebaseapp.com",
  projectId: "mlabassessmentcenter",
  storageBucket: "mlabassessmentcenter.firebasestorage.app",
  messagingSenderId: "318923575083",
  appId: "1:318923575083:web:e142907c074fee5a4c7f6e",
  measurementId: "G-KK20F76W38",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle notifications when the browser tab is closed or in the background
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || "Community Mention";
  const notificationOptions = {
    body: payload.notification?.body || "You were tagged in a discussion.",
    icon: payload.webpush?.notification?.icon || "/logo192.png",
    badge: payload.webpush?.notification?.badge || "/badge.png",
    vibrate: [200, 100, 200],
    data: {
      url:
        payload.webpush?.fcmOptions?.link ||
        payload.data?.route ||
        "/community",
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Navigate to the channel when the user clicks the browser notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/community";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing tab if open
        for (const client of windowClients) {
          if (client.url.includes("/community") && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window/tab
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
