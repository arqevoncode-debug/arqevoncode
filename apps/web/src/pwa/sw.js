// Service worker do app instalável. Só guarda a própria página e os ícones, para o app abrir
// sem internet. A página vem sempre da rede primeiro: um deploy novo chega na próxima abertura,
// e a cópia guardada só é usada offline. Nada de dados do usuário passa por aqui: os lançamentos
// ficam no localStorage, e as chamadas ao Supabase não são interceptadas.
const CACHE = "arqevon-finance-v1";
const ARQUIVOS = ["/", "/manifest.webmanifest", "/icone-192.png", "/icone-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(chaves => Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put("/", copia)); return r; })
      .catch(() => caches.match("/")));
    return;
  }
  if (ARQUIVOS.includes(url.pathname)) e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
