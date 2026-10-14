const CACHE_NAME = 'enfermeria-robot-huc-v2';
const ASSETS = [
  './',
  './index.html',
  './visor.html',
  './style.css',
  './app.js',
  './manifest.json',
  './img/robot.png',
  './js/pdfjs/pdf.min.js',
  './js/pdfjs/pdf.worker.min.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((nombres) => {
      return Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      );
    }).then(() => self.clients.claim())
  );
});

function esPdf(request) {
  if (request.method !== 'GET') {
    return false;
  }
  try {
    return new URL(request.url).pathname.toLowerCase().endsWith('.pdf');
  } catch (error) {
    return false;
  }
}

async function responderPdf(request) {
  const cache = await caches.open(CACHE_NAME);
  const guardado = await cache.match(request);
  if (guardado) {
    return guardado;
  }

  const cabeceras = new Headers(request.headers);
  cabeceras.delete('Range');
  const red = await fetch(new Request(request.url, { method: 'GET', headers: cabeceras }));
  if (red && red.ok && red.status !== 206) {
    try {
      await cache.put(request, red.clone());
    } catch (error) {
      /* Si el dispositivo no admite mas datos, el PDF se muestra igual. */
    }
  }
  return red;
}

async function responderRedConCache(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const guardado = await caches.match(request, { ignoreSearch: true });
    if (guardado) {
      return guardado;
    }
    throw error;
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') {
    return;
  }
  if (esPdf(e.request)) {
    e.respondWith(responderPdf(e.request));
    return;
  }
  e.respondWith(responderRedConCache(e.request));
});
