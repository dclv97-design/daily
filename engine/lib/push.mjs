// Web Push to the single subscribed iPhone (home-screen web app, iOS 16.4+).
import webpush from "web-push";

export async function sendPush({ title, body, url = "./#/stocks" }) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTION) {
    console.log("push: skipped (VAPID keys or subscription not set)");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:owner@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification(JSON.parse(PUSH_SUBSCRIPTION), JSON.stringify({ title, body, url }), { TTL: 6 * 3600 });
    console.log("push: sent");
    return true;
  } catch (e) {
    console.log(`push: failed (${e.statusCode || ""} ${e.body || e.message})`);
    return false;
  }
}
