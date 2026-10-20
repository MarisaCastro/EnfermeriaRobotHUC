const CACHE_NAME = 'enfermeria-robot-huc-v2';
const ASSETS = [
  './',
  './index.html',
  './visor.html',
  './style.css',
  './app.js',
  './manifest.json',
  './indice-documentos.json',
  './img/robot.png',
  './img/icono-180.png',
  './img/icono-192.png',
  './img/icono-512.png',
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

async function recortarPdf(respuesta, rango) {
  const datos = await respuesta.clone().arrayBuffer();
  const total = datos.byteLength;
  const partes = /bytes=(\d*)-(\d*)/i.exec(rango || '');
  let inicio = 0;
  let fin = total - 1;
  if (partes) {
    if (partes[1] === '') {
      const ultimos = parseInt(partes[2], 10) || 0;
      inicio = Math.max(total - ultimos, 0);
    } else {
      inicio = parseInt(partes[1], 10) || 0;
      if (partes[2] !== '') {
        fin = parseInt(partes[2], 10);
      }
    }
  }
  if (fin >= total) {
    fin = total - 1;
  }
  if (inicio < 0 || inicio >= total || inicio > fin) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': 'bytes */' + total }
    });
  }
  const trozo = datos.slice(inicio, fin + 1);
  return new Response(trozo, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': respuesta.headers.get('Content-Type') || 'application/pdf',
      'Content-Length': String(trozo.byteLength),
      'Content-Range': 'bytes ' + inicio + '-' + fin + '/' + total,
      'Accept-Ranges': 'bytes'
    }
  });
}

async function responderPdf(request) {
  const cache = await caches.open(CACHE_NAME);
  const clave = new Request(request.url, { method: 'GET' });
  let completo = await cache.match(clave);
  if (!completo) {
    const red = await fetch(clave);
    if (!red || !red.ok || red.status === 206) {
      return red;
    }
    try {
      await cache.put(clave, red.clone());
    } catch (error) {
      /* Si el dispositivo no admite mas datos, el PDF se muestra igual. */
    }
    completo = red;
  }
  const rango = request.headers.get('Range');
  if (!rango) {
    return completo;
  }
  return recortarPdf(completo, rango);
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
