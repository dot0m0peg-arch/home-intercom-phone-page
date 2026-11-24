'use strict';
const button = document.getElementById('enable');
const statusLabel = document.getElementById('status');
const say = text => { statusLabel.textContent = text; };
let pairBase = null;
try {
  const raw = new URLSearchParams(location.hash.slice(1)).get('pair');
  if (raw) {
    const pair = new URL(raw);
    if (pair.protocol !== 'https:' || pair.username || pair.password || pair.search || pair.hash ||
        !/^\/[A-Za-z0-9_-]{32,256}\/?$/.test(pair.pathname)) throw new Error('Invalid private setup link.');
    pairBase = pair.origin + pair.pathname.replace(/\/+$/, '');
  }
} catch (_) {
  say('This setup link is invalid. Open a new private setup link from the laptop.');
}
if (!pairBase) {
  button.disabled = true;
} else if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
  button.disabled = true;
  say('Open this private setup link in Chrome on your Android phone.');
} else {
  say('Tap Enable calls, then allow notifications. No call is placed during setup.');
}

function bytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
function sameKey(a, b) {
  if (!a) return false;
  a = new Uint8Array(a);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(pairBase + path, {...options, signal: controller.signal,
      mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The laptop could not finish setup.');
    return data;
  } finally { clearTimeout(timer); }
}

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    // Request directly within the tap gesture; no permission is requested on page load.
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notifications are blocked. Allow notifications for this site in Chrome, then try again.');
    }
    say('Connecting this phone to the laptop…');
    const config = await request('/push/config');
    if (config.enrollmentOrigin !== location.origin) throw new Error('This setup site does not match the laptop configuration.');
    const publicKey = bytes(config.publicKey);
    const registration = await navigator.serviceWorker.register('./sw.js', {scope: './'});
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription.options.applicationServerKey, publicKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) subscription = await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: publicKey});
    const result = await request('/push/subscription', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({subscription: subscription.toJSON()})
    });
    if (!result.registered) throw new Error('The laptop did not save this phone yet.');
    button.textContent = 'Phone connected';
    say('Calls are enabled on this phone. You can close this page.');
  } catch (error) {
    say(error.name === 'AbortError' ? 'The laptop is not reachable. Open a new setup link while the laptop is connected.' :
      error instanceof TypeError ? 'The laptop could not be reached. Open a new private setup link and try again.' : error.message);
    button.disabled = false;
  }
});
