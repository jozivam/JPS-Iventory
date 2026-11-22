/**
 * JPS ALMOXARIFADO - SERVICE WORKER OFFLINE-FIRST (CANTEIRO DE OBRA)
 * Cacheia assets, fontes, ícones e telas principais para funcionamento rápido e offline.
 */

const STATIC_CACHE = 'jps-almox-static-v3';
const PAGES_CACHE = 'jps-almox-pages-v3';

const CORE_ASSETS = [
  '/css/style.css',
  '/js/main.js',
  '/js/offline-manager.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const CORE_PAGES = [
  '/produtos',
  '/balcao',
  '/movimentacoes',
  '/colaboradores',
  '/fichas',
  '/produtos/novo'
];

// Instalação: pré-cacheia assets essenciais e páginas principais
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      await Promise.allSettled(CORE_ASSETS.map((url) => staticCache.add(url)));

      const pagesCache = await caches.open(PAGES_CACHE);
      await Promise.allSettled(
        CORE_PAGES.map(async (url) => {
          try {
            const resp = await fetch(url, { credentials: 'same-origin' });
            const respPath = resp && resp.url ? new URL(resp.url).pathname : '';
            if (resp && resp.ok && !resp.redirected && respPath !== '/login') {
              await pagesCache.put(url, resp.clone());
            }
          } catch (_) {
            // Ignora falha no pré-cache se estiver offline durante instalação
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

// Ativação: remove caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Helper: fetch com timeout para evitar travamento em internet instável de obra
function fetchWithTimeout(request, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), timeoutMs);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignora métodos de escrita (POST/PUT/DELETE) e endpoints de ping/sync
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/offline/')) return;
  if (url.pathname === '/login' || url.pathname === '/logout') return;
  if (url.pathname.includes('/exportar/excel') || url.pathname.includes('/modelo/excel')) return;

  // 1. Assets Estáticos + Fontes + Ícones -> Cache-First com atualização em segundo plano
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const networkUpdate = fetch(request)
          .then((resp) => {
            if (resp && (resp.ok || resp.type === 'opaque')) {
              cache.put(request, resp.clone());
            }
            return resp;
          })
          .catch(() => null);

        return cached || (await networkUpdate) || new Response('', { status: 504 });
      })()
    );
    return;
  }

  // 2. Navegação de Páginas HTML e Consultas GET da mesma origem -> Network-First (4.5s) -> Cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        try {
          const networkResp = await fetchWithTimeout(request, 4500);
          const respPath = networkResp && networkResp.url ? new URL(networkResp.url).pathname : '';
          if (networkResp && networkResp.ok && !networkResp.redirected && respPath !== '/login') {
            cache.put(request, networkResp.clone());
            // Também mantém a rota base atualizada (sem query string de sucesso/erro)
            if (url.search && CORE_PAGES.includes(url.pathname)) {
              cache.put(url.pathname, networkResp.clone());
            }
          }
          return networkResp;
        } catch (_) {
          // Fallback para o cache exato
          const exactMatch = await cache.match(request);
          if (exactMatch) return exactMatch;

          // Fallback para a rota base (ex: /balcao?produto_id=10 -> /balcao)
          const pathMatch = await cache.match(url.pathname);
          if (pathMatch) return pathMatch;

          // Se for a raiz '/', entrega /produtos do cache
          if (url.pathname === '/') {
            const prodCache = await cache.match('/produtos');
            if (prodCache) return prodCache;
          }

          // Para chamadas JSON (/produtos/:id/movimentacoes), retorna array vazio amigável
          if (url.pathname.endsWith('/movimentacoes') || url.pathname.startsWith('/api/')) {
            return new Response(JSON.stringify([]), {
              headers: { 'Content-Type': 'application/json' }
            });
          }

          // Fallback final: tenta entregar /balcao ou /produtos
          const fallbackPage = (await cache.match('/balcao')) || (await cache.match('/produtos'));
          if (fallbackPage) return fallbackPage;

          return new Response(
            '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Modo Offline</title></head><body style="font-family:sans-serif;text-align:center;padding:3rem;background:#f8fafc;color:#0f172a;"><h2>📡 Sem conexão no momento</h2><p>Abra esta tela ao menos uma vez com internet para salvá-la no aparelho.</p><button onclick="location.reload()" style="padding:10px 20px;background:#4f46e5;color:#fff;border:none;border-radius:8px;font-weight:700;">Tentar Novamente</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
  }
});

// Mensagem do app para forçar atualização ou limpeza do cache das páginas principais
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_AUTH_CACHE') {
    event.waitUntil(caches.delete(PAGES_CACHE));
    return;
  }

  if (event.data && event.data.type === 'WARM_CACHE') {
    event.waitUntil(
      (async () => {
        const pagesCache = await caches.open(PAGES_CACHE);
        await Promise.allSettled(
          CORE_PAGES.map(async (url) => {
            try {
              const resp = await fetch(url, { credentials: 'same-origin' });
              const respPath = resp && resp.url ? new URL(resp.url).pathname : '';
              if (resp && resp.ok && !resp.redirected && respPath !== '/login') {
                await pagesCache.put(url, resp.clone());
              }
            } catch (_) {}
          })
        );
      })()
    );
  }
});
