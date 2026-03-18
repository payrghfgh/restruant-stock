/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyChuDKFI3RBghxC2Lhr_oElFZPvbgjxgno",
  authDomain: "rangla-app.firebaseapp.com",
  projectId: "rangla-app",
  storageBucket: "rangla-app.firebasestorage.app",
  messagingSenderId: "505473918149",
  appId: "1:505473918149:web:35de49d92905d49e30fcac"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Stock Alert";
  const options = {
    body: payload.notification?.body || "Stock is below threshold.",
    icon: "/icons/icon-192.svg"
  };

  self.registration.showNotification(title, options);
});
