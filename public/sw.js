// v3: offline fallback only. The service worker used to proxy every same-origin GET through
// respondWith(fetch()) — including the Next.js RSC requests behind router.refresh() and client
// navigation — which intermittently left the App Router stuck (stale field screens after an action,
// links that stopped navigating) and broke CSS preloads. Hashed /_next/static assets are already
// cached by the browser's HTTP cache, so the only job left here is showing /offline when a page
// navigation fails with no network.
const CACHE="seera-shell-v3";const SHELL=["/offline","/manifest.webmanifest","/icons/seera.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
// No clients.claim(): taking control of an already-open page mid-session interrupted in-flight
// App Router requests (a link tap right after first load did nothing). Pages opened after
// activation are controlled as usual.
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET"||request.mode!=="navigate"||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(request).catch(()=>caches.match("/offline").then(hit=>hit??Response.error())));
});
