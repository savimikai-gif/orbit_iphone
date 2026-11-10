/* ORBIT Mobile 3.1: bump CACHE_VERSION with each published release. */
const CACHE_VERSION = 'orbit-mobile-3.1.0-v1';
const ASSETS = ['./', './index.html', './main.js', './style.css', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames=await caches.keys();
    await Promise.all(cacheNames.filter(name => name.startsWith('orbit-mobile-') && name !== CACHE_VERSION).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const all = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of all) {
      if(client.url.startsWith(self.registration.scope)) {
        await client.focus();
        client.postMessage({type:'OPEN_REMINDERS'});
        return;
      }
    }
    await self.clients.openWindow('./');
  })());
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const requestUrl=new URL(event.request.url);
  if(requestUrl.origin !== self.location.origin || !requestUrl.href.startsWith(self.registration.scope))return;
  if(event.request.mode === 'navigate') {
    event.respondWith((async()=>{
      try {
        const response=await fetch(event.request);
        if(response.ok){const cache=await caches.open(CACHE_VERSION);await cache.put('./index.html',response.clone());}
        return response;
      }catch {
        return (await caches.match('./index.html')) || new Response('ORBIT is offline. Reconnect to load the app.',{status:503,headers:{'Content-Type':'text/plain'}});
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    try {return await fetch(event.request);}catch{return Response.error();}
  })());
});
