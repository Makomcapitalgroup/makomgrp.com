#!/usr/bin/env node
"use strict";

/**
 * Regresión del botón flotante "Iniciar conversación" (navegador real).
 *
 * Qué verifica (todo en Chrome real, con clics y teclas reales):
 *   1. Home ES/EN: el CTA del Hero y el flotante se relevan sin duplicarse.
 *   2. Fichas de propiedades ES/EN: el flotante se aparta SOLO mientras
 *      solapa la galería interactiva ([data-galeria] [data-galeria-abrir="0"])
 *      y reaparece al liberar la esquina.
 *   3. Perspectivas ES/EN: el flotante está disponible desde la carga.
 *   4. Catálogo y demás páginas interiores: siempre disponible; las páginas
 *      legales no lo llevan.
 *   5. Panel: apertura y cierre (botón, clic fuera, Escape, "Formulario").
 *   6. Destinos de contacto: WhatsApp, Correo y Formulario.
 *   7. Teclado: foco, Enter/Espacio, Escape, foco no tapado.
 *   8. Scroll, recarga, volver atrás y cambios de tamaño de ventana.
 *   9. Ningún control interactivo queda tapado por el flotante (en reposo,
 *      al final de la página y, en fichas, la galería y su lightbox).
 *  10. Responsive de 375 a 1920 px; tamaño aprobado: 44 px de alto por
 *      debajo de 640 px y 46 px desde 640 px.
 *
 * Diseño para que sea determinista:
 *   - No hay esperas fijas: cada paso espera un ESTADO observable (valor
 *     esperado calculado por un oráculo independiente a partir de la
 *     geometría) y exige que se mantenga estable tres fotogramas con las
 *     transiciones del widget ya terminadas.
 *   - El scroll es instantáneo (el sitio usa scroll-behavior: smooth).
 *   - Las posiciones de muestreo se calculan a partir del diseño real, con
 *     margen respecto a los umbrales exactos.
 *   - Meta Pixel / CAPI: las peticiones a facebook.*, fbcdn.* y *.workers.dev
 *     se bloquean en el propio navegador y la suite falla si alguna
 *     respuesta llega a recibirse. No se generan métricas reales.
 *   - Cada ejecución imprime una "huella" (hash de nombre+resultado de cada
 *     comprobación): dos ejecuciones iguales deben dar la misma huella.
 *
 * Sin dependencias nuevas: usa Node (fetch y WebSocket globales) y el Chrome
 * ya instalado.
 *
 * Uso:
 *   npm run build                                 (genera _site/)
 *   node scripts/verificar-flotante.js            (sirve _site/ en local)
 *   node scripts/verificar-flotante.js --base https://makomgrp.com
 *
 * Opciones:
 *   --base <url>      Probar un sitio ya publicado en vez de _site/.
 *   --chrome <ruta>   Ejecutable de Chrome (o variable CHROME_PATH).
 *   --anchos 375,1440 Limitar los anchos de ventana (por defecto, los diez).
 *   --solo <grupo>    Un solo grupo: home, fichas, perspectivas, interiores,
 *                     panel, teclado, estados.
 *   --detalle         Imprimir también las comprobaciones que pasan.
 *
 * Código de salida: 0 sin fallas; 1 con fallas; 2 error de entorno.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const SITIO = path.join(RAIZ, "_site");

/* ------------------------------------------------------------------ */
/* Configuración                                                      */
/* ------------------------------------------------------------------ */

const ANCHOS = [
  [375, 812],
  [414, 896],
  [639, 900],
  [640, 900],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1440, 900],
  [1728, 1117],
  [1920, 1080],
];

// Anchos en los que se ejercitan las interacciones largas (panel, teclado).
const ANCHOS_INTERACCION = [375, 768, 1440];

const BLOQUEADOS = ["*facebook.net*", "*facebook.com*", "*fbcdn*", "*workers.dev*"];
const HOSTS_BLOQUEADOS = /facebook\.(net|com)|fbcdn|workers\.dev/;

const WHATSAPP = "https://wa.me/50763534377";
const CORREO = "mailto:gerencia@makomgrp.com";

const PAGINAS_LEGALES = ["/aviso-legal.html", "/privacidad.html", "/en/legal-notice.html", "/en/privacy.html"];

/* ------------------------------------------------------------------ */
/* Argumentos                                                         */
/* ------------------------------------------------------------------ */

function leerArgumentos(argv) {
  const a = { base: null, chrome: process.env.CHROME_PATH || null, anchos: null, solo: null, detalle: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--base") a.base = argv[++i].replace(/\/+$/, "");
    else if (k === "--chrome") a.chrome = argv[++i];
    else if (k === "--anchos") a.anchos = argv[++i].split(",").map(Number);
    else if (k === "--solo") a.solo = argv[++i];
    else if (k === "--detalle") a.detalle = true;
    else throw new Error("Opción desconocida: " + k);
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Servidor estático mínimo para _site/                               */
/* ------------------------------------------------------------------ */

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function iniciarServidor() {
  return new Promise((resolve) => {
    const servidor = http.createServer((req, res) => {
      let ruta;
      try {
        ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
      } catch (e) {
        res.writeHead(400).end();
        return;
      }
      let archivo = path.normalize(path.join(SITIO, ruta));
      if (!archivo.startsWith(SITIO)) {
        res.writeHead(403).end();
        return;
      }
      if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) archivo = path.join(archivo, "index.html");
      if (!fs.existsSync(archivo)) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("404");
        return;
      }
      res.writeHead(200, {
        "Content-Type": TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(archivo).pipe(res);
    });
    servidor.listen(0, "127.0.0.1", () => resolve({ servidor, base: "http://127.0.0.1:" + servidor.address().port }));
  });
}

function comprobarSitioConstruido() {
  for (const f of ["script.js", "styles.css"]) {
    const compilado = path.join(SITIO, f);
    if (!fs.existsSync(compilado)) throw new Error("Falta _site/" + f + ". Ejecuta primero: npm run build");
    if (!fs.readFileSync(compilado).equals(fs.readFileSync(path.join(RAIZ, f)))) {
      throw new Error("_site/" + f + " no coincide con " + f + " (build desactualizado). Ejecuta: npm run build");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Chrome y protocolo DevTools (sin dependencias)                     */
/* ------------------------------------------------------------------ */

function localizarChrome(preferido) {
  const candidatos = [
    preferido,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const c of candidatos) if (fs.existsSync(c)) return c;
  for (const n of ["google-chrome", "chromium", "chromium-browser"]) {
    const r = spawnSync("which", [n], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error("No se encontró Chrome. Usa --chrome <ruta> o la variable CHROME_PATH.");
}

async function lanzarChrome(ejecutable) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "makom-flotante-"));
  const proc = spawn(
    ejecutable,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      "--user-data-dir=" + perfil,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const archivoPuerto = path.join(perfil, "DevToolsActivePort");
  let puerto = null;
  for (let i = 0; i < 200 && !puerto; i++) {
    if (fs.existsSync(archivoPuerto)) puerto = fs.readFileSync(archivoPuerto, "utf8").split("\n")[0].trim();
    else await new Promise((r) => setTimeout(r, 50));
  }
  if (!puerto) throw new Error("Chrome no abrió el puerto de depuración.");
  let pestana = null;
  for (let i = 0; i < 100 && !pestana; i++) {
    try {
      const lista = await (await fetch("http://127.0.0.1:" + puerto + "/json/list")).json();
      pestana = lista.find((t) => t.type === "page");
    } catch (e) {
      /* reintento */
    }
    if (!pestana) await new Promise((r) => setTimeout(r, 50));
  }
  if (!pestana) throw new Error("Chrome no ofreció ninguna pestaña.");
  const ws = new WebSocket(pestana.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let id = 0;
  const pendientes = new Map();
  const oyentes = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      const { ok, ko } = pendientes.get(m.id);
      pendientes.delete(m.id);
      if (m.error) ko(new Error(JSON.stringify(m.error)));
      else ok(m.result);
    } else if (m.method) {
      oyentes.slice().forEach((o) => o(m));
    }
  });
  const cdp = {
    send(method, params = {}) {
      return new Promise((ok, ko) => {
        const i = ++id;
        pendientes.set(i, { ok, ko });
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    },
    on(fn) {
      oyentes.push(fn);
    },
    una(method) {
      return new Promise((resolve) => {
        const fn = (m) => {
          if (m.method === method) {
            oyentes.splice(oyentes.indexOf(fn), 1);
            resolve(m.params);
          }
        };
        oyentes.push(fn);
      });
    },
    async cerrar() {
      try {
        await cdp.send("Browser.close");
      } catch (e) {
        /* ya cerrado */
      }
      try {
        ws.close();
      } catch (e) {
        /* ya cerrado */
      }
      proc.kill();
      try {
        fs.rmSync(perfil, { recursive: true, force: true });
      } catch (e) {
        /* mejor esfuerzo */
      }
    },
  };
  return cdp;
}

/* ------------------------------------------------------------------ */
/* Ayudantes dentro de la página (solo lectura; no tocan el sitio)    */
/* ------------------------------------------------------------------ */

const AYUDANTES_PAGINA = `(() => {
  if (window.__t) return;
  const $ = (id) => document.getElementById(id);
  const t = (window.__t = { registro: [], inicial: {} });

  // Estado canónico del flotante. 'incoherente' = a medias (p. ej. en transición).
  t.flotante = () => {
    const fc = $('floating-contact');
    if (!fc) return 'ausente';
    const cs = getComputedStyle(fc);
    const inert = fc.hasAttribute('inert');
    const ah = fc.getAttribute('aria-hidden');
    if (!inert && ah !== 'true' && cs.visibility === 'visible' && cs.opacity === '1' && cs.pointerEvents !== 'none') return 'activo';
    if (inert && ah === 'true' && cs.visibility === 'hidden' && !fc.classList.contains('is-active')) return 'apartado';
    return 'incoherente';
  };
  t.hero = () => {
    const hc = $('hero-contact');
    if (!hc) return 'ausente';
    const inert = hc.hasAttribute('inert');
    const ah = hc.getAttribute('aria-hidden');
    if (inert && ah === 'true') return 'apartado';
    if (!inert && ah !== 'true') return 'activo';
    return 'incoherente';
  };

  // Oráculos independientes de la implementación.
  t.margen = () => (matchMedia('(max-width: 639px)').matches ? 16 : 24);
  t.huella = () => {
    const tg = $('floating-contact-toggle');
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const m = t.margen();
    return { l: vw - m - tg.offsetWidth, t: vh - m - tg.offsetHeight, r: vw - m, b: vh - m };
  };
  t.principal = () => document.querySelector('[data-galeria] [data-galeria-abrir="0"]');
  t.solapaGaleria = () => {
    const g = t.principal();
    if (!g) return false;
    const r = g.getBoundingClientRect();
    const f = t.huella();
    return r.width > 0 && r.left < f.r && r.right > f.l && r.top < f.b && r.bottom > f.t;
  };
  t.altoCabecera = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10) || 72;
  t.ctaVisible = () => {
    const b = $('hero-contact-toggle').getBoundingClientRect();
    return b.width > 0 && b.bottom > t.altoCabecera() && b.top < innerHeight;
  };
  t.esperado = (tipo) => {
    if (tipo === 'home') return t.ctaVisible() ? { f: 'apartado', h: 'activo' } : { f: 'activo', h: 'apartado' };
    if (tipo === 'galeria') return { f: t.solapaGaleria() ? 'apartado' : 'activo', h: 'ausente' };
    return { f: 'activo', h: 'ausente' };
  };
  t.animando = () => {
    const nodos = [$('floating-contact'), $('hero-contact')].filter(Boolean);
    return nodos.some((n) => n.getAnimations({ subtree: true }).some((a) => a.playState === 'running' || a.playState === 'pending'));
  };

  // Espera un estado observable (no un tiempo): el esperado, estable 3 fotogramas
  // y con las transiciones terminadas.
  t.asentar = (tipo, limite) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      let estable = 0;
      (function fotograma() {
        const e = t.esperado(tipo);
        const f = t.flotante();
        const h = t.hero();
        const ok = f === e.f && h === e.h && !t.animando();
        estable = ok ? estable + 1 : 0;
        if (estable >= 3) return resolve({ ok: true, f, h });
        if (performance.now() - t0 > (limite || 4000)) return resolve({ ok: false, f, h, esperado: e });
        requestAnimationFrame(fotograma);
      })();
    });

  t.esperar = (fn, limite) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      (function f() {
        let v = false;
        try { v = !!fn(); } catch (e) { v = false; }
        if (v) return resolve(true);
        if (performance.now() - t0 > (limite || 3000)) return resolve(false);
        requestAnimationFrame(f);
      })();
    });

  const SEL = 'a[href],button,input,select,textarea,summary,[role="button"]';
  const visible = (e) => {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  // Controles que el flotante (si está activo) intercepta. Se separa el bloqueo material
  // (el flotante tapa el centro de la parte visible del control o más de la mitad de
  // su área) del solape parcial de una esquina, que se informa como aviso.
  t.tapados = () => {
    const res = { bloqueados: [], parciales: [] };
    if (t.flotante() !== 'activo') return res;
    const fc = $('floating-contact');
    const r = $('floating-contact-toggle').getBoundingClientRect();
    document.querySelectorAll(SEL).forEach((e) => {
      if (fc.contains(e) || e.closest('[inert]') || !visible(e)) return;
      const b = e.getBoundingClientRect();
      const vl = Math.max(b.left, 0), vt = Math.max(b.top, 0), vr = Math.min(b.right, innerWidth), vb = Math.min(b.bottom, innerHeight);
      if (vr <= vl || vb <= vt) return;
      const ix = Math.min(vr, r.right) - Math.max(vl, r.left);
      const iy = Math.min(vb, r.bottom) - Math.max(vt, r.top);
      if (ix <= 0 || iy <= 0) return;
      const cx = (vl + vr) / 2, cy = (vt + vb) / 2;
      const topC = document.elementFromPoint(cx, cy);
      const centro = !!(topC && fc.contains(topC));
      const fraccion = (ix * iy) / ((vr - vl) * (vb - vt));
      const topI = document.elementFromPoint(Math.max(vl, r.left) + ix / 2, Math.max(vt, r.top) + iy / 2);
      const intercepta = !!(topI && fc.contains(topI));
      const etiqueta = (e.className || e.tagName).toString().split(' ')[0] + ' "' + (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24) + '" ' + Math.round(ix) + 'x' + Math.round(iy) + ' (' + Math.round(fraccion * 100) + '%)';
      if (centro || fraccion > 0.5) res.bloqueados.push(etiqueta);
      else if (intercepta) res.parciales.push(etiqueta);
    });
    return res;
  };
  // Puntos de la galería principal (dentro de la ventana) que intercepta el flotante.
  t.galeriaInterceptada = () => {
    const g = t.principal();
    const fc = $('floating-contact');
    if (!g || !fc) return 0;
    const b = g.getBoundingClientRect();
    let n = 0;
    for (let x = b.left + 3; x < b.right; x += 8) {
      for (let y = Math.max(b.top, 0) + 3; y < Math.min(b.bottom, innerHeight); y += 8) {
        const e = document.elementFromPoint(x, y);
        if (e && fc.contains(e)) n++;
      }
    }
    return n;
  };
  t.geometria = () => {
    const tg = $('floating-contact-toggle');
    const cs = getComputedStyle(tg);
    const r = tg.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    return {
      w: r.width, h: r.height, derecha: vw - r.right, abajo: vh - r.bottom, margen: t.margen(),
      dentro: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh,
      desborde: document.documentElement.scrollWidth - vw,
      fondo: cs.backgroundColor, borde: cs.borderTopColor, grosor: cs.borderTopWidth, color: cs.color,
    };
  };
  t.centro = (sel) => {
    const e = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  };
  t.cubiertoPorFlotante = (e) => {
    const c = t.centro(e);
    const top = c && document.elementFromPoint(c.x, c.y);
    return !!(top && $('floating-contact') && $('floating-contact').contains(top));
  };
  // Un punto de la ventana sin controles (para "clic fuera").
  t.puntoLibre = () => {
    const fc = $('floating-contact');
    const hh = t.altoCabecera();
    for (let y = hh + 20; y < innerHeight - 20; y += 24) {
      for (let x = 8; x < innerWidth - 8; x += 24) {
        const e = document.elementFromPoint(x, y);
        if (e && !(fc && fc.contains(e)) && !e.closest('a,button,input,select,textarea,label,summary,[tabindex],[role="button"],header')) return { x, y };
      }
    }
    return null;
  };
  t.panel = () => {
    const tg = $('floating-contact-toggle');
    const pn = $('floating-contact-panel');
    const r = pn.getBoundingClientRect();
    const cs = getComputedStyle(pn);
    return {
      exp: tg.getAttribute('aria-expanded'), abierto: pn.classList.contains('is-open'), ah: pn.getAttribute('aria-hidden'),
      visible: cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.99,
      dentro: r.left >= 0 && r.top >= 0 && r.right <= document.documentElement.clientWidth && r.bottom <= document.documentElement.clientHeight,
    };
  };
  t.activo = () => {
    const a = document.activeElement;
    return a ? (a.id || (a.className && a.className.toString().split(' ')[0]) || a.tagName) : null;
  };

  // Registro de cambios del flotante desde que existe (para "desde la carga").
  new MutationObserver((ms) => {
    ms.forEach((m) => {
      if (m.target.id === 'floating-contact') t.registro.push(m.attributeName + '=' + m.target.getAttribute(m.attributeName));
    });
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ['inert', 'aria-hidden', 'data-defer', 'class'] });
  document.addEventListener('DOMContentLoaded', () => { t.inicial.dcl = t.flotante(); });
  window.addEventListener('load', () => { t.inicial.carga = t.flotante(); });
  requestAnimationFrame(() => { t.inicial.cuadro1 = t.flotante(); });
})();`;

/* ------------------------------------------------------------------ */
/* Navegador                                                          */
/* ------------------------------------------------------------------ */

class Pagina {
  constructor(cdp, base) {
    this.cdp = cdp;
    this.base = base;
    this.errores = [];
    this.fugas = [];
    this.intentosBloqueados = 0;
  }

  async iniciar() {
    const c = this.cdp;
    await c.send("Page.enable");
    await c.send("Runtime.enable");
    await c.send("Log.enable");
    await c.send("Network.enable");
    await c.send("Network.setBlockedURLs", { urls: BLOQUEADOS });
    await c.send("Page.addScriptToEvaluateOnNewDocument", { source: AYUDANTES_PAGINA });
    const bloqueadas = new Set();
    c.on((m) => {
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        this.errores.push(((d.exception && d.exception.description) || d.text || "excepción").split("\n")[0]);
      } else if (m.method === "Network.requestWillBeSent" && HOSTS_BLOQUEADOS.test(m.params.request.url)) {
        this.intentosBloqueados++;
        bloqueadas.add(m.params.requestId);
      } else if (m.method === "Network.responseReceived" && HOSTS_BLOQUEADOS.test(m.params.response.url)) {
        this.fugas.push(m.params.response.url);
      }
    });
  }

  async eval(expresion) {
    const r = await this.cdp.send("Runtime.evaluate", { expression: expresion, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  }

  async ventana(ancho, alto) {
    const movil = ancho <= 768;
    await this.cdp.send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: movil });
    await this.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: movil });
  }

  async listo() {
    await this.eval("document.fonts.ready.then(() => true)");
    await this.eval("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
    await this.eval("document.documentElement.style.scrollBehavior = 'auto'");
  }

  async ir(ruta) {
    this.errores = [];
    const cargada = this.cdp.una("Page.loadEventFired");
    await this.cdp.send("Page.navigate", { url: this.base + ruta });
    await cargada;
    await this.listo();
  }

  async recargar() {
    this.errores = [];
    const cargada = this.cdp.una("Page.loadEventFired");
    await this.cdp.send("Page.reload");
    await cargada;
    await this.listo();
  }

  async atras() {
    const h = await this.cdp.send("Page.getNavigationHistory");
    const previa = h.entries[h.currentIndex - 1];
    const mostrada = this.cdp.una("Page.frameNavigated");
    await this.cdp.send("Page.navigateToHistoryEntry", { entryId: previa.id });
    await mostrada;
    await this.eval("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
  }

  scroll(y) {
    return this.eval(`window.scrollTo({ top: ${Math.round(y)}, left: 0, behavior: 'instant' }); true`);
  }

  async scrollMax() {
    return this.eval("document.documentElement.scrollHeight - document.documentElement.clientHeight");
  }

  asentar(tipo) {
    return this.eval(`window.__t.asentar(${JSON.stringify(tipo)})`);
  }

  esperar(expresion, limite) {
    return this.eval(`window.__t.esperar(() => (${expresion}), ${limite || 3000})`);
  }

  async clic(x, y) {
    for (const tipo of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await this.cdp.send("Input.dispatchMouseEvent", { type: tipo, x, y, button: "left", clickCount: 1, buttons: tipo === "mousePressed" ? 1 : 0 });
    }
  }

  async clicEn(selector) {
    const p = await this.eval(`window.__t.centro(${JSON.stringify(selector)})`);
    if (!p) throw new Error("No existe " + selector);
    await this.clic(p.x, p.y);
  }

  async tecla(nombre, { mayus = false } = {}) {
    const mapa = {
      Tab: { key: "Tab", code: "Tab", vk: 9 },
      Escape: { key: "Escape", code: "Escape", vk: 27 },
      Enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
      Space: { key: " ", code: "Space", vk: 32, text: " " },
      ArrowRight: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
      ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
    };
    const k = mapa[nombre];
    const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, modifiers: mayus ? 8 : 0 };
    await this.cdp.send("Input.dispatchKeyEvent", Object.assign({ type: "keyDown" }, base, k.text ? { text: k.text } : {}));
    await this.cdp.send("Input.dispatchKeyEvent", Object.assign({ type: "keyUp" }, base));
  }
}

/* ------------------------------------------------------------------ */
/* Registro de resultados                                             */
/* ------------------------------------------------------------------ */

const resultados = [];
let grupoActual = "";

function ok(nombre, condicion, detalle) {
  resultados.push({ grupo: grupoActual, nombre, ok: !!condicion, detalle: condicion ? "" : String(detalle === undefined ? "" : detalle) });
}

function json(v) {
  return JSON.stringify(v);
}

/* ------------------------------------------------------------------ */
/* Descubrimiento de páginas (sin depender de URLs concretas)         */
/* ------------------------------------------------------------------ */

async function primerEnlace(base, listado, prefijo) {
  const html = await (await fetch(base + listado)).text();
  const re = new RegExp('href="(' + prefijo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '[^"/#?]+/)"', "g");
  const m = re.exec(html);
  if (!m) throw new Error("No se encontró ninguna ficha en " + listado);
  return decodeURI(m[1]);
}

async function descubrir(base) {
  return {
    ficha: { es: await primerEnlace(base, "/propiedades/", "/propiedades/"), en: await primerEnlace(base, "/en/properties/", "/en/properties/") },
    perspectiva: { es: await primerEnlace(base, "/perspectivas/", "/perspectivas/"), en: await primerEnlace(base, "/en/insights/", "/en/insights/") },
    proyecto: { es: await primerEnlace(base, "/proyectos/", "/proyectos/"), en: await primerEnlace(base, "/en/projects/", "/en/projects/") },
  };
}

/* ------------------------------------------------------------------ */
/* Comprobaciones comunes                                             */
/* ------------------------------------------------------------------ */

// Tamaño aprobado (44 px < 640 px, 46 px desde 640 px), posición, estilo y desborde.
async function comprobarGeometria(p, etiqueta, ancho) {
  const g = await p.eval("window.__t.geometria()");
  const alto = ancho < 640 ? 44 : 46;
  ok(`${etiqueta} tamaño ${alto}px de alto`, Math.round(g.h) === alto, `${g.w}x${g.h}`);
  ok(`${etiqueta} objetivo táctil ≥ 44px de ancho`, g.w >= 44, g.w);
  ok(`${etiqueta} esquina inferior derecha a ${g.margen}px`, Math.abs(g.derecha - g.margen) <= 0.5 && Math.abs(g.abajo - g.margen) <= 0.5, `${g.derecha},${g.abajo}`);
  ok(`${etiqueta} dentro de la ventana`, g.dentro, json(g));
  ok(`${etiqueta} sin desborde horizontal de la página`, g.desborde <= 0, g.desborde);
  ok(
    `${etiqueta} estilo cristal oscuro, borde terracota fino, texto hueso`,
    /^rgba\(10, 10, 10/.test(g.fondo) && g.borde === "rgb(181, 71, 42)" && g.grosor === "1px" && g.color === "rgb(245, 242, 238)",
    json(g)
  );
}

async function comprobarEstado(p, etiqueta, tipo) {
  const r = await p.asentar(tipo);
  ok(`${etiqueta} estado esperado (${tipo}) estable`, r.ok, json(r));
  return r.ok;
}

// Avisos: hallazgos que no son fallas de esta suite (se imprimen, sin afectar el resultado).
const avisos = new Set();

async function estadoFinal(p, etiqueta) {
  const t = await p.eval("window.__t.tapados()");
  ok(`${etiqueta} ningún control bloqueado por el flotante`, t.bloqueados.length === 0, t.bloqueados.join(" ; "));
  t.parciales.forEach((x) => avisos.add(`${etiqueta}: el flotante solapa parcialmente una esquina de ${x}`));
  const n = await p.eval("window.__t.galeriaInterceptada()");
  ok(`${etiqueta} galería no interceptada`, n === 0, n);
}

/* ------------------------------------------------------------------ */
/* Grupo: Home                                                        */
/* ------------------------------------------------------------------ */

async function grupoHome(p, anchos) {
  grupoActual = "home";
  for (const [w, h] of anchos) {
    await p.ventana(w, h);
    for (const lang of ["es", "en"]) {
      const E = `home ${lang.toUpperCase()} ${w}px`;
      await p.ir(lang === "en" ? "/en/" : "/");
      const ini = await p.eval("window.__t.inicial");
      ok(`${E} desde la carga el flotante está apartado`, ini.dcl === "apartado" && ini.cuadro1 === "apartado", json(ini));
      await comprobarEstado(p, `${E} reposo`, "home");
      ok(`${E} sin errores de JavaScript`, p.errores.length === 0, p.errores.join(" | "));
      await estadoFinal(p, `${E} reposo`);
      const hero = await p.eval(`(() => {
        const c = (s) => window.__t.cubiertoPorFlotante(s);
        // Un control sin caja (p. ej. el buscador, plegado en móvil) no aplica.
        const dentro = (s) => { const e = document.querySelector(s); if (!e) return false; const b = e.getBoundingClientRect(); if (!b.width) return true; const p = window.__t.centro(s); const t = document.elementFromPoint(p.x, p.y); return !!(t && (t === e || e.contains(t) || t.contains(e))); };
        return { cta: dentro('#hero-contact-toggle'), buscar: dentro('.hero-search__submit'), avanzada: dentro('.hero-search__advanced') };
      })()`);
      ok(`${E} CTA del Hero y buscador accesibles al clic`, hero.cta && hero.buscar && hero.avanzada, json(hero));

      // Umbral exacto: scroll al que el CTA sale del área visible (bajo el header).
      const salida = await p.eval("(() => { const b = document.getElementById('hero-contact-toggle').getBoundingClientRect(); return b.bottom + scrollY - window.__t.altoCabecera(); })()");
      await p.scroll(Math.max(0, salida - 14));
      await comprobarEstado(p, `${E} justo antes de que el CTA salga`, "home");
      await p.scroll(salida + 14);
      const pasa = await comprobarEstado(p, `${E} justo después de que el CTA sale`, "home");
      if (pasa) await comprobarGeometria(p, `${E} flotante`, w);
      await estadoFinal(p, `${E} tras el CTA`);
      const max = await p.scrollMax();
      await p.scroll(max / 2);
      await comprobarEstado(p, `${E} mitad de la página`, "home");
      await p.scroll(max);
      await comprobarEstado(p, `${E} final de la página`, "home");
      await estadoFinal(p, `${E} final`);
      await p.scroll(0);
      await comprobarEstado(p, `${E} de vuelta arriba`, "home");

      // Relevo del foco: con el foco en el CTA del Hero, al salir pasa al flotante.
      await p.eval("document.getElementById('hero-contact-toggle').focus(); true");
      await p.scroll(salida + 14);
      await comprobarEstado(p, `${E} relevo con foco en el Hero`, "home");
      ok(`${E} el foco pasa del CTA del Hero al flotante`, (await p.eval("window.__t.activo()")) === "floating-contact-toggle", await p.eval("window.__t.activo()"));
      await p.scroll(0);
      await comprobarEstado(p, `${E} regreso tras relevo`, "home");

      // Nunca los dos activos, en un barrido corto.
      let dobles = 0;
      for (let i = 0; i <= 8; i++) {
        await p.scroll((salida * 2 * i) / 8);
        await comprobarEstadoSilencioso(p, "home");
        const e = await p.eval("[window.__t.flotante(), window.__t.hero()]");
        if (e[0] === "activo" && e[1] === "activo") dobles++;
      }
      ok(`${E} nunca hay dos controles activos a la vez`, dobles === 0, dobles);
      await p.scroll(0);
    }
  }
}

// Espera el estado sin registrar un resultado (para barridos).
async function comprobarEstadoSilencioso(p, tipo) {
  await p.asentar(tipo);
}

/* ------------------------------------------------------------------ */
/* Grupo: fichas de propiedades                                       */
/* ------------------------------------------------------------------ */

let configuracionesConSolape = 0;

async function grupoFichas(p, anchos, paginas) {
  grupoActual = "fichas";
  for (const [w, h] of anchos) {
    await p.ventana(w, h);
    for (const lang of ["es", "en"]) {
      const E = `ficha ${lang.toUpperCase()} ${w}px`;
      await p.ir(paginas.ficha[lang]);
      const n = await p.eval("document.querySelectorAll('[data-galeria] [data-galeria-abrir=\"0\"]').length");
      ok(`${E} una única galería interactiva identificada`, n === 1, n);
      ok(`${E} sin errores de JavaScript`, p.errores.length === 0, p.errores.join(" | "));
      // La foto principal se carga con prioridad: se espera a que esté decodificada para que
      // la geometría (y con ella el recorrido de muestreo) no dependa de la velocidad de red.
      await p.esperar("(() => { const i = window.__t.principal().querySelector('img'); return i && i.complete && i.naturalWidth > 0; })()", 8000);
      const max = await p.scrollMax();
      // Recorrido fijo: 25 muestras cada 1/8 de alto de ventana (hasta tres pantallas), con las
      // posiciones limitadas al máximo real. El número de muestras no depende de la geometría
      // (fuentes, imágenes diferidas), de modo que dos ejecuciones comprueban lo mismo.
      const paso = Math.max(60, Math.round(h / 8));
      const muestras = 25;
      let primero = true;
      let hubo = false;
      let activos = 0;
      for (let k = 0; k < muestras; k++) {
        const y = Math.min(k * paso, max);
        await p.scroll(y);
        const solapa = await p.eval("window.__t.solapaGaleria()");
        if (solapa) hubo = true;
        const bien = await comprobarEstado(p, `${E} muestra ${k}`, "galeria");
        const inter = await p.eval("window.__t.galeriaInterceptada()");
        ok(`${E} muestra ${k}: galería no interceptada`, inter === 0, inter);
        if (bien && !solapa) {
          activos++;
          if (primero) {
            primero = false;
            await comprobarGeometria(p, `${E} flotante`, w);
          }
        }
      }
      if (hubo) configuracionesConSolape++;
      await p.scroll(max);
      await comprobarEstado(p, `${E} final de la página`, "galeria");
      await estadoFinal(p, `${E} final`);
      ok(`${E} el flotante está disponible en algún punto del recorrido`, activos > 0, activos);

      // Clic real en la esquina antes interceptada: abre la galería, no el panel.
      await p.scroll(0);
      await comprobarEstadoSilencioso(p, "galeria");
      const esquina = await p.eval(`(() => {
        const g = window.__t.principal().getBoundingClientRect(), f = window.__t.huella();
        const l = Math.max(g.left, f.l), r = Math.min(g.right, f.r), t = Math.max(g.top, f.t), b = Math.min(g.bottom, f.b, innerHeight);
        return (r > l && b > t) ? { x: (l + r) / 2, y: (t + b) / 2 } : null;
      })()`);
      if (esquina) {
        await p.clic(esquina.x, esquina.y);
        const abierta = await p.esperar("document.querySelector('.lightbox') && getComputedStyle(document.querySelector('.lightbox')).display !== 'none'");
        const panel = await p.eval("window.__t.panel().exp");
        ok(`${E} clic en la esquina antes interceptada abre la galería`, abierta && panel === "false", `lightbox=${abierta} panel=${panel}`);
        await p.tecla("Escape");
        const cerrada = await p.esperar("!document.querySelector('.lightbox') || getComputedStyle(document.querySelector('.lightbox')).display === 'none'");
        ok(`${E} Escape cierra la galería`, cerrada, "");
        ok(`${E} el foco vuelve a la foto principal`, (await p.eval("window.__t.activo()")) === "galeria-ficha__principal", await p.eval("window.__t.activo()"));
      }

      // Lightbox con el flotante activo: los controles de la galería no quedan tapados.
      await p.scroll(max / 2);
      await comprobarEstadoSilencioso(p, "galeria");
      await p.eval("window.__t.principal().click(); true");
      const lb = await p.esperar("document.querySelector('.lightbox') && getComputedStyle(document.querySelector('.lightbox')).display !== 'none'");
      ok(`${E} el lightbox se abre`, lb, "");
      if (lb) {
        await p.esperar("(() => { const i = document.querySelector('.lightbox img'); return i && i.complete && i.naturalWidth > 0; })()", 5000);
        await p.asentar("galeria");
        // Cada control dentro de la ventana debe recibir el clic (ni el flotante ni nada lo tapa);
        // un control fuera de la ventana es un hallazgo de maquetación del lightbox, no del flotante.
        const libres = await p.eval(`(() => {
          const sel = ['.lightbox__cerrar', '.lightbox__anterior', '.lightbox__siguiente'];
          return sel.map((s) => {
            const e = document.querySelector(s);
            if (!e) return s + ':ausente';
            const b = e.getBoundingClientRect();
            if (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight) return s + ':fuera';
            const c = window.__t.centro(e);
            const t = document.elementFromPoint(c.x, c.y);
            return (t === e || e.contains(t)) ? 'ok' : s + ':tapado';
          });
        })()`);
        ok(`${E} controles del lightbox dentro de la ventana no quedan tapados`, libres.every((x) => x === "ok" || /:fuera$/.test(x)), json(libres));
        libres.filter((x) => /:fuera$/.test(x)).forEach((x) => avisos.add(`${E}: ${x.replace(":fuera", "")} del lightbox queda fuera de la ventana (maquetación del lightbox, ajena al flotante)`));
        const a = await p.eval("(document.querySelector('.lightbox img') || {}).src || ''");
        await p.tecla("ArrowRight");
        const cambio = await p.esperar(`((document.querySelector('.lightbox img') || {}).src || '') !== ${json(a)}`);
        const hayVarias = (await p.eval("document.querySelectorAll('[data-galeria] [data-galeria-abrir]').length")) > 1;
        ok(`${E} flecha derecha cambia de fotografía`, !hayVarias || cambio, "");
        await p.tecla("Escape");
        await p.esperar("!document.querySelector('.lightbox') || getComputedStyle(document.querySelector('.lightbox')).display === 'none'");
      }
      await p.scroll(0);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Grupo: perspectivas                                                */
/* ------------------------------------------------------------------ */

async function grupoPerspectivas(p, anchos, paginas) {
  grupoActual = "perspectivas";
  for (const [w, h] of anchos) {
    await p.ventana(w, h);
    for (const lang of ["es", "en"]) {
      const E = `perspectiva ${lang.toUpperCase()} ${w}px`;
      await p.ir(paginas.perspectiva[lang]);
      const ini = await p.eval("window.__t.inicial");
      ok(`${E} disponible desde la carga`, ini.dcl === "activo" && ini.cuadro1 === "activo", json(ini));
      ok(`${E} sin galería interactiva`, (await p.eval("document.querySelectorAll('[data-galeria]').length")) === 0, "");
      await comprobarEstado(p, `${E} reposo`, "siempre");
      await comprobarGeometria(p, `${E} flotante`, w);
      await estadoFinal(p, `${E} reposo`);
      const max = await p.scrollMax();
      for (const y of [max / 3, max]) {
        await p.scroll(y);
        await comprobarEstado(p, `${E} tras scroll`, "siempre");
      }
      await estadoFinal(p, `${E} final`);
      const reg = await p.eval("window.__t.registro");
      ok(`${E} el flotante no cambió de estado en ningún momento`, reg.length === 0, reg.join(","));
      ok(`${E} sin atributo data-defer`, (await p.eval("document.getElementById('floating-contact').hasAttribute('data-defer')")) === false, "");
      ok(`${E} sin errores de JavaScript`, p.errores.length === 0, p.errores.join(" | "));
      await p.scroll(0);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Grupo: catálogo y páginas interiores                               */
/* ------------------------------------------------------------------ */

async function grupoInteriores(p, anchos, paginas) {
  grupoActual = "interiores";
  const lista = [];
  for (const lang of ["es", "en"]) {
    lista.push([`catálogo ${lang.toUpperCase()}`, lang === "en" ? "/en/properties/" : "/propiedades/"]);
    lista.push([`proyectos ${lang.toUpperCase()}`, lang === "en" ? "/en/projects/" : "/proyectos/"]);
    lista.push([`proyecto ${lang.toUpperCase()}`, paginas.proyecto[lang]]);
    lista.push([`perspectivas ${lang.toUpperCase()}`, lang === "en" ? "/en/insights/" : "/perspectivas/"]);
  }
  for (const [w, h] of anchos) {
    await p.ventana(w, h);
    for (const [nombre, ruta] of lista) {
      const E = `${nombre} ${w}px`;
      await p.ir(ruta);
      const ini = await p.eval("window.__t.inicial");
      ok(`${E} flotante disponible desde la carga`, ini.dcl === "activo" && ini.cuadro1 === "activo", json(ini));
      await comprobarEstado(p, `${E} reposo`, "siempre");
      await comprobarGeometria(p, `${E} flotante`, w);
      await estadoFinal(p, `${E} reposo`);
      await p.scroll(await p.scrollMax());
      await comprobarEstado(p, `${E} final`, "siempre");
      await estadoFinal(p, `${E} final`);
      ok(`${E} el flotante no cambió de estado`, (await p.eval("window.__t.registro")).length === 0, "");
      ok(`${E} sin errores de JavaScript`, p.errores.length === 0, p.errores.join(" | "));
      await p.scroll(0);
    }
  }
  // Páginas legales: no llevan flotante.
  for (const [w, h] of anchos.filter(([a]) => a === 375 || a === 1440)) {
    await p.ventana(w, h);
    for (const ruta of PAGINAS_LEGALES) {
      await p.ir(ruta);
      ok(`legal ${ruta} ${w}px sin flotante`, (await p.eval("!document.getElementById('floating-contact')")) === true, "");
      ok(`legal ${ruta} ${w}px sin errores de JavaScript`, p.errores.length === 0, p.errores.join(" | "));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Grupo: panel y destinos de contacto                                */
/* ------------------------------------------------------------------ */

async function comprobarDestinos(p, E, lang, panelSel, enHome) {
  const opciones = await p.eval(`[...document.querySelectorAll(${json(panelSel + " a")})].map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target') || '', rel: a.getAttribute('rel') || '' }))`);
  // En la Home el destino es el ancla de la propia página; en el resto, la Home.
  const formulario = enHome ? "#contacto" : lang === "en" ? "/en/#contacto" : "/#contacto";
  ok(
    `${E} destinos: WhatsApp, Correo y Formulario`,
    opciones.length === 3 &&
      opciones[0].href === WHATSAPP && opciones[0].target === "_blank" && /noopener/.test(opciones[0].rel) &&
      opciones[1].href === CORREO &&
      opciones[2].href === formulario,
    json(opciones)
  );
}

async function ciclo(p, E, abrirSel, panelSel) {
  const estado = (sel) =>
    sel === "flotante" ? p.eval("window.__t.panel()") : p.eval(`(() => { const t = document.getElementById('hero-contact-toggle'), n = document.getElementById('hero-contact-panel'); const r = n.getBoundingClientRect(); return { exp: t.getAttribute('aria-expanded'), abierto: n.classList.contains('is-open'), ah: n.getAttribute('aria-hidden'), visible: getComputedStyle(n).visibility !== 'hidden' && parseFloat(getComputedStyle(n).opacity) > 0.99, dentro: r.left >= 0 && r.top >= window.__t.altoCabecera() && r.right <= document.documentElement.clientWidth && r.bottom <= document.documentElement.clientHeight }; })()`);
  const cond = (valor) => (abrirSel === "flotante" ? `window.__t.panel().exp === '${valor}'` : `document.getElementById('hero-contact-toggle').getAttribute('aria-expanded') === '${valor}'`);
  const toggle = abrirSel === "flotante" ? "#floating-contact-toggle" : "#hero-contact-toggle";
  const idToggle = abrirSel === "flotante" ? "floating-contact-toggle" : "hero-contact-toggle";

  await p.clicEn(toggle);
  ok(`${E} clic abre el panel`, await p.esperar(cond("true")), json(await estado(abrirSel)));
  const s = await estado(abrirSel);
  ok(`${E} panel abierto: visible, anunciado y dentro de la ventana`, s.abierto && s.ah === "false" && s.dentro, json(s));
  await p.clicEn(toggle);
  ok(`${E} segundo clic cierra el panel`, await p.esperar(cond("false")), json(await estado(abrirSel)));

  await p.clicEn(toggle);
  await p.esperar(cond("true"));
  const libre = await p.eval("window.__t.puntoLibre()");
  if (libre) {
    await p.clic(libre.x, libre.y);
    ok(`${E} clic fuera cierra el panel`, await p.esperar(cond("false")), json(await estado(abrirSel)));
  } else {
    ok(`${E} existe un punto libre para el clic fuera`, false, "sin punto libre");
  }

  await p.clicEn(toggle);
  await p.esperar(cond("true"));
  await p.tecla("Escape");
  ok(`${E} Escape cierra el panel`, await p.esperar(cond("false")), json(await estado(abrirSel)));
  ok(`${E} Escape devuelve el foco al botón`, (await p.eval("window.__t.activo()")) === idToggle, await p.eval("window.__t.activo()"));
}

async function grupoPanel(p, anchos, paginas) {
  grupoActual = "panel";
  const interaccion = anchos.filter(([w]) => ANCHOS_INTERACCION.includes(w));
  // Destinos: en todos los anchos y páginas relevantes (barato: solo atributos).
  for (const [w, h] of anchos) {
    await p.ventana(w, h);
    for (const lang of ["es", "en"]) {
      for (const [nombre, ruta] of [["catálogo", lang === "en" ? "/en/properties/" : "/propiedades/"], ["ficha", paginas.ficha[lang]], ["perspectiva", paginas.perspectiva[lang]]]) {
        await p.ir(ruta);
        await comprobarDestinos(p, `${nombre} ${lang.toUpperCase()} ${w}px flotante`, lang, "#floating-contact-panel");
      }
      await p.ir(lang === "en" ? "/en/" : "/");
      await comprobarDestinos(p, `home ${lang.toUpperCase()} ${w}px flotante`, lang, "#floating-contact-panel", true);
      await comprobarDestinos(p, `home ${lang.toUpperCase()} ${w}px Hero`, lang, "#hero-contact-panel", true);
      ok(`home ${lang.toUpperCase()} ${w}px el destino "Formulario" existe (#contacto)`, (await p.eval("!!document.getElementById('contacto')")) === true, "");
    }
  }
  // Apertura y cierre con clics y teclas reales.
  for (const [w, h] of interaccion) {
    await p.ventana(w, h);
    for (const lang of ["es", "en"]) {
      const L = lang.toUpperCase();
      await p.ir(lang === "en" ? "/en/properties/" : "/propiedades/");
      await ciclo(p, `catálogo ${L} ${w}px`, "flotante", "#floating-contact-panel");

      await p.ir(paginas.ficha[lang]);
      await p.scroll(await p.scrollMax() / 2);
      await comprobarEstadoSilencioso(p, "galeria");
      await ciclo(p, `ficha ${L} ${w}px`, "flotante", "#floating-contact-panel");

      await p.ir(paginas.perspectiva[lang]);
      await ciclo(p, `perspectiva ${L} ${w}px`, "flotante", "#floating-contact-panel");

      // Home: panel del Hero y panel del flotante.
      await p.ir(lang === "en" ? "/en/" : "/");
      await comprobarEstadoSilencioso(p, "home");
      await ciclo(p, `home ${L} ${w}px Hero`, "hero", "#hero-contact-panel");
      const salida = await p.eval("(() => { const b = document.getElementById('hero-contact-toggle').getBoundingClientRect(); return b.bottom + scrollY - window.__t.altoCabecera(); })()");
      // Panel del Hero abierto + el CTA sale de la vista: el panel se cierra y el flotante toma el relevo.
      await p.clicEn("#hero-contact-toggle");
      await p.esperar("document.getElementById('hero-contact-toggle').getAttribute('aria-expanded') === 'true'");
      // El Hero reajusta su posición en el siguiente fotograma al abrir el panel: se espera a que asiente.
      await comprobarEstado(p, `home ${L} ${w}px panel del Hero abierto, antes del relevo`, "home");
      const yAbierto = await p.eval("scrollY");
      await p.scroll(Math.max(salida + 14, yAbierto));
      await comprobarEstado(p, `home ${L} ${w}px relevo con el panel del Hero abierto`, "home");
      const heroExp = await p.eval("document.getElementById('hero-contact-toggle').getAttribute('aria-expanded')");
      ok(`home ${L} ${w}px el panel del Hero se cierra en el relevo`, heroExp === "false", json({ heroExp, scrollY: await p.eval("scrollY"), salida, estado: await p.eval("[window.__t.flotante(), window.__t.hero()]") }));
      await ciclo(p, `home ${L} ${w}px flotante`, "flotante", "#floating-contact-panel");
      // "Formulario" cierra el panel del flotante (en la Home navega a #contacto).
      await p.clicEn("#floating-contact-toggle");
      await p.esperar("window.__t.panel().exp === 'true'");
      await p.clicEn("#floating-contact-form-link");
      ok(`home ${L} ${w}px elegir "Formulario" cierra el panel`, await p.esperar("window.__t.panel().exp === 'false'"), json(await p.eval("window.__t.panel()")));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Grupo: teclado y foco                                              */
/* ------------------------------------------------------------------ */

async function grupoTeclado(p, anchos, paginas) {
  grupoActual = "teclado";
  const interaccion = anchos.filter(([w]) => ANCHOS_INTERACCION.includes(w) && (w === 375 || w === 1440));
  for (const [w, h] of interaccion) {
    await p.ventana(w, h);
    for (const lang of ["es", "en"]) {
      const L = lang.toUpperCase();
      const casos = [
        ["catálogo", lang === "en" ? "/en/properties/" : "/propiedades/", "siempre"],
        ["ficha", paginas.ficha[lang], "galeria"],
        ["perspectiva", paginas.perspectiva[lang], "siempre"],
      ];
      for (const [nombre, ruta, tipo] of casos) {
        const E = `${nombre} ${L} ${w}px`;
        await p.ir(ruta);
        // Recorrido con Tab desde arriba: nunca se enfoca el flotante apartado y el
        // control enfocado nunca queda tapado por el flotante activo.
        await p.eval("document.activeElement && document.activeElement.blur(); true");
        let enfocadoApartado = 0;
        let tapadoEnfocado = [];
        for (let i = 0; i < 60; i++) {
          await p.tecla("Tab");
          const inf = await p.eval(`(() => {
            const a = document.activeElement, fc = document.getElementById('floating-contact');
            if (!a || a === document.body) return null;
            const enFlotante = fc.contains(a);
            return { id: window.__t.activo(), enFlotante, estado: window.__t.flotante(), tapado: !enFlotante && window.__t.flotante() === 'activo' && window.__t.cubiertoPorFlotante(a) };
          })()`);
          if (!inf) continue;
          if (inf.enFlotante && inf.estado === "apartado") enfocadoApartado++;
          if (inf.tapado) tapadoEnfocado.push(inf.id);
        }
        ok(`${E} Tab no enfoca el flotante mientras está apartado`, enfocadoApartado === 0, enfocadoApartado);
        ok(`${E} el control enfocado nunca queda tapado por el flotante`, tapadoEnfocado.length === 0, tapadoEnfocado.join(","));

        // Llegar al flotante con una Tab real desde el último control y operarlo con teclado.
        await p.scroll(await p.scrollMax());
        await comprobarEstadoSilencioso(p, tipo);
        await p.eval(`(() => { const todos = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter((e) => !e.closest('#floating-contact') && !e.closest('[inert]') && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0); todos[todos.length - 1].focus({ preventScroll: true }); return true; })()`);
        await p.tecla("Tab");
        ok(`${E} una Tab desde el último control llega al flotante`, (await p.eval("window.__t.activo()")) === "floating-contact-toggle", await p.eval("window.__t.activo()"));
        await p.tecla("Enter");
        ok(`${E} Enter abre el panel`, await p.esperar("window.__t.panel().exp === 'true'"), json(await p.eval("window.__t.panel()")));
        await p.tecla("Escape");
        ok(`${E} Escape cierra el panel`, await p.esperar("window.__t.panel().exp === 'false'"), "");
        ok(`${E} el foco sigue en el botón tras Escape`, (await p.eval("window.__t.activo()")) === "floating-contact-toggle", await p.eval("window.__t.activo()"));
        await p.tecla("Space");
        ok(`${E} Espacio abre el panel`, await p.esperar("window.__t.panel().exp === 'true'"), json(await p.eval("window.__t.panel()")));
        await p.tecla("Escape");
        await p.esperar("window.__t.panel().exp === 'false'");
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Grupo: scroll, recarga, volver atrás y cambios de tamaño           */
/* ------------------------------------------------------------------ */

async function grupoEstados(p, anchos, paginas) {
  grupoActual = "estados";
  const tamanos = anchos.map(([w, h]) => [w, h]);
  const por = (w) => tamanos.find(([a]) => a === w);
  const [bw, bh] = por(1440) || tamanos[tamanos.length - 1];

  for (const lang of ["es", "en"]) {
    const L = lang.toUpperCase();
    // Recarga con el scroll restaurado: Home.
    await p.ventana(bw, bh);
    await p.ir(lang === "en" ? "/en/" : "/");
    const salida = await p.eval("(() => { const b = document.getElementById('hero-contact-toggle').getBoundingClientRect(); return b.bottom + scrollY - window.__t.altoCabecera(); })()");
    await p.scroll(salida + 400);
    await comprobarEstadoSilencioso(p, "home");
    await p.recargar();
    ok(`estados home ${L} recarga: el navegador restaura el scroll`, (await p.eval("scrollY")) > 0, await p.eval("scrollY"));
    await comprobarEstado(p, `estados home ${L} recarga con scroll restaurado`, "home");

    // Recarga y vuelta atrás: ficha.
    await p.ir(paginas.ficha[lang]);
    await p.scroll(60);
    await comprobarEstadoSilencioso(p, "galeria");
    await p.recargar();
    await comprobarEstado(p, `estados ficha ${L} recarga`, "galeria");
    await p.ir(lang === "en" ? "/en/properties/" : "/propiedades/");
    await p.atras();
    await comprobarEstado(p, `estados ficha ${L} volver atrás`, "galeria");
    ok(`estados ficha ${L} volver atrás sin errores de JavaScript`, p.errores.length === 0, p.errores.join(" | "));

    // Cambios de tamaño de ventana sin recargar.
    const secuencia = tamanos.filter(([a]) => [1440, 1728, 1024, 375, 640, 639, 1920].includes(a));
    const orden = [1440, 1728, 1024, 375, 640, 639, 1366, 1440].map((a) => por(a)).filter(Boolean);
    await p.ventana(...(orden[0] || secuencia[0]));
    await p.ir(paginas.ficha[lang]);
    for (const [w, h] of orden) {
      await p.ventana(w, h);
      await p.scroll(0);
      await comprobarEstado(p, `estados ficha ${L} cambio de tamaño a ${w}px`, "galeria");
    }
    await p.ventana(...(orden[0] || secuencia[0]));
    await p.ir(lang === "en" ? "/en/" : "/");
    for (const [w, h] of orden) {
      await p.ventana(w, h);
      await p.scroll(0);
      await comprobarEstado(p, `estados home ${L} cambio de tamaño a ${w}px`, "home");
    }
    await p.ir(paginas.perspectiva[lang]);
    for (const [w, h] of orden) {
      await p.ventana(w, h);
      await comprobarEstado(p, `estados perspectiva ${L} cambio de tamaño a ${w}px`, "siempre");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Ejecución                                                          */
/* ------------------------------------------------------------------ */

const GRUPOS = {
  home: grupoHome,
  fichas: grupoFichas,
  perspectivas: grupoPerspectivas,
  interiores: grupoInteriores,
  panel: grupoPanel,
  teclado: grupoTeclado,
  estados: grupoEstados,
};

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  let servidor = null;
  let base = args.base;
  if (!base) {
    comprobarSitioConstruido();
    const s = await iniciarServidor();
    servidor = s.servidor;
    base = s.base;
  }
  const anchos = args.anchos ? ANCHOS.filter(([w]) => args.anchos.includes(w)) : ANCHOS;
  if (!anchos.length) throw new Error("--anchos no coincide con ningún ancho conocido: " + ANCHOS.map(([w]) => w).join(","));
  if (args.solo && !GRUPOS[args.solo]) throw new Error("Grupo desconocido: " + args.solo);

  const chrome = await lanzarChrome(localizarChrome(args.chrome));
  const inicio = Date.now();
  let p;
  try {
    p = new Pagina(chrome, base);
    await p.iniciar();
    const paginas = await descubrir(base);
    console.log("Sitio:", base);
    console.log("Fichas de prueba:", json(paginas));
    for (const [nombre, fn] of Object.entries(GRUPOS)) {
      if (args.solo && args.solo !== nombre) continue;
      await fn(p, anchos, paginas);
    }
    if (!args.solo || args.solo === "fichas") {
      grupoActual = "fichas";
      const conSolape = anchos.some(([w]) => w >= 1024 && w <= 1440);
      if (conSolape) ok("la prueba de solape no es vacua (hubo solapamiento real en algún ancho)", configuracionesConSolape > 0, configuracionesConSolape);
    }
    grupoActual = "analítica";
    ok("ninguna respuesta de Meta Pixel / CAPI llegó a recibirse", p.fugas.length === 0, p.fugas.join(" ; "));
  } finally {
    await chrome.cerrar();
    if (servidor) servidor.close();
  }

  // Resumen
  const porGrupo = {};
  for (const r of resultados) {
    porGrupo[r.grupo] = porGrupo[r.grupo] || { total: 0, fallos: 0 };
    porGrupo[r.grupo].total++;
    if (!r.ok) porGrupo[r.grupo].fallos++;
  }
  if (args.detalle) for (const r of resultados) if (r.ok) console.log("  ok  ", r.grupo + " | " + r.nombre);
  const fallos = resultados.filter((r) => !r.ok);
  if (avisos.size) {
    console.log("\nAvisos (no afectan al resultado):");
    [...avisos].forEach((a) => console.log("  aviso", a));
  }
  for (const f of fallos) console.log("  FALLO", f.grupo + " | " + f.nombre + (f.detalle ? "  →  " + f.detalle.slice(0, 260) : ""));
  console.log("");
  for (const [g, v] of Object.entries(porGrupo)) console.log(`  ${g.padEnd(13)} ${String(v.total).padStart(5)} comprobaciones, ${v.fallos} fallos`);
  const huella = crypto.createHash("sha1").update(resultados.map((r) => r.grupo + "|" + r.nombre + "|" + (r.ok ? 1 : 0)).join("\n")).digest("hex").slice(0, 12);
  console.log(`\nTotal: ${resultados.length} comprobaciones, ${fallos.length} fallos · intentos bloqueados de Pixel/CAPI: ${p.intentosBloqueados} · ${Math.round((Date.now() - inicio) / 1000)} s · huella ${huella}`);
  process.exit(fallos.length ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Error de entorno:", e.message);
    process.exit(2);
  });
} else {
  module.exports = { Pagina, lanzarChrome, localizarChrome, iniciarServidor };
}
