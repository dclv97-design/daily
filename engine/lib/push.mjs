// Web Push to the single subscribed iPhone (home-screen web app, iOS 16.4+).
import webpush from "web-push";

export async function sendPush({ title, body, url = "./#/stocks" }) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION, VAPID_SUBJECT, PART } = process.env;
  // A menu's update button (PART = stocks/news/flights) shows the result in the app right away; no push needed.
  if (PART && PART !== "all") {
    console.log(`push: skipped (manual ${PART} update)`);
    return false;
  }
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
