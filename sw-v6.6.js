const CACHE_NAME = 'parkest-shell-v6.6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css?v=6.6',
  '/app-v6.6.js',
  '/manifest.webmanifest?v=6.6',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('parkest-shell-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', event => {
  let data={};
  try{data=event.data?.json()||{};}catch(_e){data={title:'Parkest',body:event.data?.text()||'Nuovo parcheggio disponibile'};}
  const options={
    body:data.body||'Nuovo parcheggio disponibile',
    tag:data.spotId?`parkest-push-${data.spotId}`:'parkest-push',
    renotify:true,
    silent:false,
    vibrate:[220,100,220],
    icon:'/icons/icon-192.png',
    badge:'/icons/icon-192.png',
    data:{spotId:data.spotId,lat:data.lat,lng:data.lng},
    actions:[{action:'navigate',title:'NAVIGA'},{action:'go',title:'VAI'}],
  };
  event.waitUntil(self.registration.showNotification(data.title||'🅿️ Parcheggio disponibile',options));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase, map tiles and CDNs must remain network-driven.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      if (resp && resp.ok) {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return resp;
    }))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data=event.notification.data||{};
  const action=(event.action==='go'||event.action==='navigate')?event.action:'open';
  const query=data.spotId?`?notification_action=${encodeURIComponent(action)}&spot=${encodeURIComponent(data.spotId)}`:'';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const existing=list[0];
    if(existing){existing.focus();existing.postMessage({type:'PARKEST_NOTIFICATION_ACTION',action,spotId:data.spotId});return;}
    return clients.openWindow('/'+query);
  }));
});
