/**
 * ═══════════════════════════════════════════════════════════════
 *  KINETIC — Service Worker v1.0
 *  Estrategias:
 *    - Shell (HTML/CSS/JS/fonts): Cache First
 *    - Imágenes de usuario (Supabase Storage): Stale While Revalidate
 *    - API Supabase (REST/Realtime): Network First con fallback
 *    - Todo lo demás: Network First
 * ═══════════════════════════════════════════════════════════════
 */

const CACHE_VERSION  = 'kinetic-v1';
const SHELL_CACHE    = `${CACHE_VERSION}-shell`;
const IMG_CACHE      = `${CACHE_VERSION}-images`;
const FONT_CACHE     = `${CACHE_VERSION}-fonts`;

/* ── Archivos del app shell (se cachean en install) ── */
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/radar.html',
  '/chats.html',
  '/chat-interno.html',
  '/likes.html',
  '/matches.html',
  '/perfil.html',
  '/perfil-detalle.html',
  '/onboarding.html',
  '/notificaciones.html',
  '/manifest.json',
  /* Página offline personalizada */
  '/offline.html',
];

/* ── URLs que NUNCA se cachean (realtime, auth) ── */
const NO_CACHE_PATTERNS = [
  /supabase\.co\/realtime/,
  /supabase\.co\/auth/,
  /supabase\.co\/rest\/v1\/rpc/,
  /chrome-extension/,
];

/* ── CDN assets que SÍ se cachean ── */
const CDN_CACHE_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /cdnjs\.cloudflare\.com/,
  /cdn\.jsdelivr\.net\/npm\/@supabase/,
];

/* ══════════════════════════════════════════════
   INSTALL — precachear el shell
══════════════════════════════════════════════ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => {
      /* addAll falla si cualquier recurso falla —
         usamos add individualmente para ser resilientes */
      return Promise.allSettled(
        SHELL_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] No se pudo cachear ${url}:`, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ══════════════════════════════════════════════
   ACTIVATE — limpiar caches viejos
══════════════════════════════════════════════ */
self.addEventListener('activate', event => {
  const validCaches = [SHELL_CACHE, IMG_CACHE, FONT_CACHE];

  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => !validCaches.includes(k))
            .map(k => {
              console.log(`[SW] Eliminando cache viejo: ${k}`);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ══════════════════════════════════════════════
   FETCH — interceptar peticiones
══════════════════════════════════════════════ */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Solo interceptar GET */
  if (request.method !== 'GET') return;

  /* Nunca cachear estas URLs */
  if (NO_CACHE_PATTERNS.some(p => p.test(request.url))) return;

  /* ── CDN fonts & libs: Cache First ── */
  if (CDN_CACHE_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  /* ── Imágenes de Supabase Storage: Stale While Revalidate ── */
  if (request.url.includes('supabase.co/storage')) {
    event.respondWith(staleWhileRevalidate(request, IMG_CACHE));
    return;
  }

  /* ── Supabase REST API: Network First ── */
  if (request.url.includes('supabase.co/rest')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  /* ── Archivos del shell (.html, .js, .css): Cache First ── */
  if (
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.html') ||
     url.pathname.endsWith('.js')   ||
     url.pathname.endsWith('.css')  ||
     url.pathname.endsWith('.json') ||
     url.pathname === '/')
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /* ── Default: Network First con fallback offline ── */
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

/* ══════════════════════════════════════════════
   ESTRATEGIAS DE CACHÉ
══════════════════════════════════════════════ */

/**
 * Cache First — sirve desde caché, si no está va a red y guarda.
 */
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return offlineFallback(request);
  }
}

/**
 * Network First — intenta red, si falla sirve desde caché.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineFallback(request);
  }
}

/**
 * Stale While Revalidate — sirve caché inmediatamente,
 * actualiza en background.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise || offlineFallback(request);
}

/**
 * Fallback cuando no hay red ni caché.
 * Para HTML devuelve offline.html, para imágenes un SVG,
 * para el resto un 503.
 */
async function offlineFallback(request) {
  const url = new URL(request.url);

  /* Página HTML → offline.html */
  if (request.headers.get('accept')?.includes('text/html')) {
    const cache    = await caches.open(SHELL_CACHE);
    const offline  = await cache.match('/offline.html');
    if (offline) return offline;
  }

  /* Imagen → SVG placeholder */
  if (request.headers.get('accept')?.includes('image')) {
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#160c28"/>
        <text x="50" y="54" text-anchor="middle" fill="#52406e" font-size="12" font-family="sans-serif">Sin imagen</text>
      </svg>`,
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }

  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

/* ══════════════════════════════════════════════
   PUSH NOTIFICATIONS
   Recibe payloads desde Supabase Edge Functions
   o desde tu backend con Web Push.
══════════════════════════════════════════════ */
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Kinetic', body: event.data.text() };
  }

  const title   = payload.title || 'Kinetic';
  const options = {
    body:    payload.body    || 'Tienes actividad nueva.',
    icon:    payload.icon    || '/icons/icon-192.png',
    badge:   payload.badge   || '/icons/icon-96.png',
    image:   payload.image   || undefined,
    tag:     payload.tag     || 'kinetic-notif',
    data:    payload.data    || {},
    vibrate: [100, 50, 100],
    actions: payload.actions || [],
    requireInteraction: payload.requireInteraction || false,
  };

  /* Reemplazar notificación anterior del mismo tag */
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* ══════════════════════════════════════════════
   NOTIFICATION CLICK — navegar al destino
══════════════════════════════════════════════ */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data   = event.notification.data || {};
  const action = event.action;

  /* Determinar URL de destino */
  let targetUrl = '/radar.html';

  if (action === 'reply' || data.type === 'message') {
    targetUrl = data.chat_url || `/chat-interno.html?id=${data.actor_id || ''}`;
  } else if (data.type === 'match') {
    targetUrl = '/matches.html';
  } else if (data.type === 'like' || data.type === 'visit') {
    targetUrl = data.profile_url || `/perfil-detalle.html?id=${data.actor_id || ''}`;
  } else if (data.url) {
    targetUrl = data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        /* Si ya hay una ventana abierta, enfocarla y navegar */
        for (const client of windowClients) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(c => c.focus());
          }
        }
        /* Si no, abrir nueva ventana */
        return clients.openWindow(targetUrl);
      })
  );
});

/* ══════════════════════════════════════════════
   BACKGROUND SYNC (opcional)
   Reintenta enviar mensajes que fallaron por falta de red.
══════════════════════════════════════════════ */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingMessages() {
  /* Leer mensajes pendientes de IndexedDB o Cache */
  try {
    const cache    = await caches.open(SHELL_CACHE);
    const pending  = await cache.match('/__pending_messages__');
    if (!pending) return;

    const messages = await pending.json();
    if (!messages?.length) return;

    /* Intentar reenviar cada mensaje pendiente */
    const remaining = [];
    for (const msg of messages) {
      try {
        await fetch(msg.url, {
          method:  'POST',
          headers: msg.headers,
          body:    msg.body,
        });
      } catch {
        remaining.push(msg);
      }
    }

    /* Guardar solo los que aún fallaron */
    await cache.put(
      '/__pending_messages__',
      new Response(JSON.stringify(remaining), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
  } catch (err) {
    console.error('[SW] Error en syncPendingMessages:', err);
  }
}

/* ══════════════════════════════════════════════
   MESSAGE — comunicación con la app
══════════════════════════════════════════════ */
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  switch (type) {
    /* La app pide limpiar el caché */
    case 'CLEAR_CACHE':
      caches.keys().then(keys =>
        Promise.all(keys.map(k => caches.delete(k)))
      ).then(() => {
        event.source?.postMessage({ type: 'CACHE_CLEARED' });
      });
      break;

    /* La app pide forzar actualización */
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    /* La app reporta que el usuario cerró sesión — limpiar caché sensible */
    case 'USER_SIGNED_OUT':
      caches.delete(SHELL_CACHE).then(() => {
        console.log('[SW] Cache limpiado por cierre de sesión.');
      });
      break;

    default:
      break;
  }
});

console.log('[SW] Kinetic Service Worker cargado —', CACHE_VERSION);
