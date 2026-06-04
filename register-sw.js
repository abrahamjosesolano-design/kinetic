/**
 * ═══════════════════════════════════════════════════════════
 *  KINETIC — Registro del Service Worker + utilidades PWA
 *
 *  Incluir en TODOS los HTML del proyecto justo antes de </body>:
 *  <script src="register-sw.js"></script>
 *
 *  No usar type="module" para que funcione en todos los navegadores.
 * ═══════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── 1. REGISTRAR SERVICE WORKER ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/kinetic/sw.js', { scope: '/kinetic/' })
        .then(reg => {
          console.log('[Kinetic PWA] SW registrado. Scope:', reg.scope);

          /* Detectar nueva versión disponible */
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                /* Hay una actualización disponible — mostrar banner */
                showUpdateBanner();
              }
            });
          });
        })
        .catch(err => {
          console.error('[Kinetic PWA] Error registrando SW:', err);
        });

      /* Recargar automáticamente cuando el SW se activa */
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }

  /* ══════════════════════════════════════════════
     2. BANNER DE ACTUALIZACIÓN DISPONIBLE
  ══════════════════════════════════════════════ */
  function showUpdateBanner() {
    /* Evitar duplicados */
    if (document.getElementById('kineticUpdateBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'kineticUpdateBanner';
    banner.style.cssText = `
      position: fixed; bottom: 80px; left: 50%;
      transform: translateX(-50%) translateY(12px);
      background: rgba(22,12,40,.97);
      border: 1px solid rgba(138,43,226,.5);
      border-radius: 12px;
      padding: 12px 18px;
      display: flex; align-items: center; gap: 14px;
      box-shadow: 0 0 20px rgba(138,43,226,.4);
      backdrop-filter: blur(16px);
      z-index: 9999;
      font-family: 'Urbanist', sans-serif;
      font-size: 14px; font-weight: 600;
      color: #ede0ff;
      white-space: nowrap;
      animation: bannerSlideUp .3s ease forwards;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes bannerSlideUp {
        from { opacity:0; transform:translateX(-50%) translateY(12px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);

    banner.innerHTML = `
      <span>⚡ Nueva versión disponible</span>
      <button id="kineticUpdateBtn" style="
        padding:6px 14px; background:linear-gradient(135deg,#8a2be2,#ff00ff);
        border:none; border-radius:8px; color:#fff;
        font-family:inherit; font-size:13px; font-weight:700;
        cursor:pointer;
      ">Actualizar</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('kineticUpdateBtn').addEventListener('click', () => {
      banner.remove();
      /* Decirle al nuevo SW que tome el control */
      navigator.serviceWorker.getRegistration().then(reg => {
        reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      });
    });

    /* Auto-cerrar después de 8s */
    setTimeout(() => banner?.remove(), 8000);
  }

  /* ══════════════════════════════════════════════
     3. INSTALAR COMO APP (Add to Home Screen)
     Captura el evento beforeinstallprompt para
     mostrar un botón propio en lugar del nativo.
  ══════════════════════════════════════════════ */
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    /* Mostrar botón de instalación si está en la página de perfil o radar */
    showInstallHint();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    console.log('[Kinetic PWA] App instalada correctamente.');
  });

  function showInstallHint() {
    if (document.getElementById('kineticInstallBtn')) return;
    /* Solo mostrar en radar y perfil */
    const path = window.location.pathname;
    if (!path.includes('radar') && !path.includes('perfil') && path !== '/kinetic/') return;

    const btn = document.createElement('button');
    btn.id = 'kineticInstallBtn';
    btn.style.cssText = `
      position: fixed; bottom: 82px; right: 16px; z-index: 9998;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px;
      background: rgba(22,12,40,.97);
      border: 1px solid rgba(138,43,226,.4);
      border-radius: 22px;
      color: #a020f0; font-family:'Urbanist',sans-serif;
      font-size:13px; font-weight:700; cursor:pointer;
      box-shadow:0 0 14px rgba(138,43,226,.3);
      backdrop-filter:blur(16px);
      animation:fadeIn .3s ease;
    `;
    const fadeStyle = document.createElement('style');
    fadeStyle.textContent = `@keyframes fadeIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}`;
    document.head.appendChild(fadeStyle);

    btn.innerHTML = '⚡ Instalar Kinetic';
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[Kinetic PWA] Install outcome:', outcome);
      deferredPrompt = null;
      btn.remove();
    });

    document.body.appendChild(btn);

    /* Auto-ocultar después de 10s */
    setTimeout(() => btn?.remove(), 10000);
  }

  /* ══════════════════════════════════════════════
     4. DETECTAR MODO STANDALONE
     Ajusta el padding-top en iOS cuando la app está instalada
  ══════════════════════════════════════════════ */
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) {
    document.documentElement.classList.add('pwa-standalone');
    /* Añadir clase para ajustes CSS específicos de PWA */
    const style = document.createElement('style');
    style.textContent = `
      .pwa-standalone body { padding-top: env(safe-area-inset-top, 0px); }
      .pwa-standalone .topbar,
      .pwa-standalone #header { padding-top: env(safe-area-inset-top, 0px) !important; }
    `;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════
     5. NOTIFICACIONES PUSH — solicitar permiso
     Llamar manualmente: window.kineticRequestPush()
  ══════════════════════════════════════════════ */
  window.kineticRequestPush = async function () {
    if (!('Notification' in window)) {
      console.warn('[Kinetic PWA] Notificaciones no soportadas.');
      return null;
    }
    if (Notification.permission === 'granted') {
      return await subscribeToPush();
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        return await subscribeToPush();
      }
    }
    return null;
  };

  async function subscribeToPush() {
    try {
      const reg = await navigator.serviceWorker.ready;

      /* VAPID public key — reemplaza con la tuya de Supabase / tu backend */
      const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE';

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      console.log('[Kinetic PWA] Push subscription:', JSON.stringify(subscription));
      return subscription;
    } catch (err) {
      console.error('[Kinetic PWA] Error suscribiendo a push:', err);
      return null;
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  /* ══════════════════════════════════════════════
     6. LIMPIAR CACHÉ AL CERRAR SESIÓN
     Llamar desde el botón de logout de perfil.html:
     window.kineticClearCache()
  ══════════════════════════════════════════════ */
  window.kineticClearCache = function () {
    navigator.serviceWorker.ready.then(reg => {
      reg.active?.postMessage({ type: 'USER_SIGNED_OUT' });
    });
  };

})();
