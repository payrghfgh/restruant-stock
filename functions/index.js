const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

function getStatus(current, threshold) {
  if (threshold <= 0) return "good";
  if (current < threshold) return "low";
  if (current <= threshold * 1.2) return "warn";
  return "good";
}

exports.dailyStockCheck = onSchedule(
  {
    schedule: "every day 06:00",
    timeZone: "Asia/Calcutta",
    region: "us-central1"
  },
  async () => {
    const db = getFirestore();
    const itemsSnap = await db.collection("items").get();
    const lowItems = [];

    itemsSnap.forEach((doc) => {
      const data = doc.data();
      const current = Number(data.currentStock || 0);
      const threshold = Number(data.dailyThreshold || 0);
      if (getStatus(current, threshold) === "low") {
        lowItems.push({ id: doc.id, name: data.name || "Item", current, threshold });
      }
    });

    if (lowItems.length === 0) return;

    const ownerDoc = await db.doc("settings/owner").get();
    if (!ownerDoc.exists) {
      console.log("Owner not configured; skipping notifications.");
      return;
    }

    const ownerUid = ownerDoc.data().uid;
    const ownerProfile = await db.doc(`users/${ownerUid}`).get();
    const token = ownerProfile.exists ? ownerProfile.data().fcmToken : null;

    if (!token) {
      console.log("No owner FCM token available.");
      return;
    }

    const names = lowItems.slice(0, 4).map((i) => i.name).join(", ");
    const extra = lowItems.length > 4 ? ` +${lowItems.length - 4} more` : "";

    await getMessaging().send({
      token,
      notification: {
        title: "Low stock alert",
        body: `${names}${extra}`
      },
      data: {
        count: String(lowItems.length)
      }
    });
  }
);
