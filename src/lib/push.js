// Web Push helpers: service worker registration, subscription management,
// and a small helper to ask the backend to notify other devices.
const SHARED = true;

async function setValue(key, value) {
  try {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    await window.storage.set(key, v, SHARED);
    return true;
  } catch { return false; }
}

async function deleteValue(key) {
  try {
    await window.storage.delete(key, SHARED);
    return true;
  } catch { return false; }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getCurrentSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function getOrCreateDeviceId() {
  let id = localStorage.getItem('irrigation-device-id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('irrigation-device-id', id);
  }
  return id;
}

export async function enablePushNotifications() {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new Error('Push notifications are not configured for this app yet.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
  }

  const id = getOrCreateDeviceId();
  await setValue(`push:${id}`, sub.toJSON());
  return sub;
}

export async function disablePushNotifications() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const id = getOrCreateDeviceId();
    await deleteValue(`push:${id}`);
    await sub.unsubscribe();
  }
}

// Ask the notify Edge Function to push a message to every subscribed device
// (optionally skipping the device that triggered the action).
export async function broadcastPush({ title, body, url, excludeCurrentDevice = true }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return;

  let excludeEndpoint = null;
  if (excludeCurrentDevice) {
    const sub = await getCurrentSubscription();
    excludeEndpoint = sub?.endpoint || null;
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      },
      body: JSON.stringify({ action: 'broadcast', title, body, url, excludeEndpoint })
    });
  } catch {
    // Best-effort: a failed notification shouldn't block the irrigation action.
  }
}
