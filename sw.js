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
      return Promise.all(ASSETS.map((ruta) => {
        return cache.add(ruta).catch(() => {
          /* Si un archivo falla, el iPhone guarda igualmente el resto. */
        });
      }));
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

function esCarcasa(request) {
  try {
    const ruta = new URL(request.url).pathname.toLowerCase();
    if (ruta.endsWith('/')) {
      return true;
    }
    return /\.(html|css|js|json|png)$/.test(ruta);
  } catch (error) {
    return false;
  }
}

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
    try {
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
    } catch (error) {
      return new Response('Sin conexion', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }
  const rango = request.headers.get('Range');
  if (!rango) {
    return completo;
  }
  return recortarPdf(completo, rango);
}

async function responderCarcasa(request) {
  const cache = await caches.open(CACHE_NAME);
  const guardado = await cache.match(request, { ignoreSearch: true });
  const actualizar = fetch(request).then((respuesta) => {
    if (respuesta && respuesta.ok) {
      cache.put(request, respuesta.clone()).catch(() => {});
    }
    return respuesta;
  }).catch(() => null);
  if (guardado) {
    return guardado;
  }
  const fresca = await actualizar;
  if (fresca && fresca.ok) {
    return fresca;
  }
  if (request.mode === 'navigate') {
    const inicio = await cache.match('./index.html');
    if (inicio) {
      return inicio;
    }
  }
  return new Response('Sin conexion', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function responderRedConCache(request) {
  try {
    const red = await fetch(request);
    if (red && red.ok) {
      return red;
    }
  } catch (error) {
    /* sin red: se usa lo guardado */
  }
  const guardado = await caches.match(request, { ignoreSearch: true });
  if (guardado) {
    return guardado;
  }
  if (request.mode === 'navigate') {
    const inicio = await caches.match('./index.html');
    if (inicio) {
      return inicio;
    }
  }
  return new Response('Sin conexion', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') {
    return;
  }
  if (esPdf(e.request)) {
    e.respondWith(responderPdf(e.request));
    return;
  }
  if (e.request.mode === 'navigate' || esCarcasa(e.request)) {
    e.respondWith(responderCarcasa(e.request));
    return;
  }
  e.respondWith(responderRedConCache(e.request));
});
