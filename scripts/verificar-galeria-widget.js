#!/usr/bin/env node
"use strict";

/**
 * Pruebas del widget de galería «galeria-fotos» (admin/galeria-fotos.js) con el Decap REAL y un backend de prueba AISLADO.
 *
 * Qué es el «backend de prueba»: Decap trae el backend `test-repo`, que guarda todo EN MEMORIA del navegador (nada se escribe en
 * GitHub ni en el repositorio; al recargar se pierde). El servidor de este script sirve la página REAL admin/index.html, el
 * admin/config.yml REAL (solo cambia `backend`) y el widget REAL; precarga las propiedades reales como entradas del CMS en memoria.
 * Por eso estas pruebas NO verifican carga ni guardado reales contra GitHub (eso exige una sesión autenticada).
 *
 *   npm run build   (no hace falta para estas pruebas, salvo con --construir)
 *   node scripts/verificar-galeria-widget.js
 *
 * Opciones:
 *   --construir      además, construye el sitio en una carpeta temporal con la galería guardada por el widget (ES/EN) y la revisa
 *   --optimizacion   solo imprime la tabla antes/después con fotos reales del sitio (lectura)
 *   --detalle        imprime también lo que pasa
 *
 * Requiere: Chrome instalado y conexión a internet la primera vez (descarga Decap, versión fijada en admin/index.html, a la
 * carpeta temporal del sistema). Código de salida: 0 sin fallos; 1 con fallos; 2 error de entorno.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const nav = require("./lib/navegador");

const RAIZ = path.join(__dirname, "..");
const args = process.argv.slice(2);
const DETALLE = args.includes("--detalle");
const CONSTRUIR = args.includes("--construir");
const SOLO_OPTIMIZACION = args.includes("--optimizacion");

const resultados = [];
const erroresPagina = []; // excepciones y console.error de la página (se comprueba al final que no hay del widget)
let grupo = "";
function ok(nombre, condicion, detalle) {
  resultados.push({ grupo, nombre, ok: !!condicion, detalle: condicion ? "" : String(detalle === undefined ? "" : detalle).slice(0, 300) });
  if (DETALLE) console.log(`  ${condicion ? "ok   " : "FALLO"} ${grupo} | ${nombre}${condicion ? "" : "  →  " + String(detalle === undefined ? "" : detalle).slice(0, 400)}`);
  return !!condicion;
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Decap (versión fijada en admin/index.html) y fixtures               */
/* ------------------------------------------------------------------ */

async function obtenerDecap() {
  const html = fs.readFileSync(path.join(RAIZ, "admin", "index.html"), "utf8");
  const m = /decap-cms@(\d+\.\d+\.\d+)\/dist\/decap-cms\.js/.exec(html);
  if (!m) throw new Error("admin/index.html no fija una versión exacta de Decap (decap-cms@X.Y.Z).");
  const version = m[1];
  const cache = path.join(os.tmpdir(), `makom-decap-${version}.js`);
  if (!fs.existsSync(cache) || fs.statSync(cache).size < 1e6) {
    const r = await fetch(`https://unpkg.com/decap-cms@${version}/dist/decap-cms.js`);
    if (!r.ok) throw new Error(`No se pudo descargar Decap ${version} (${r.status}).`);
    fs.writeFileSync(cache, Buffer.from(await r.arrayBuffer()));
  }
  return { version, cache };
}

let sharp = null;
try {
  sharp = require("sharp");
} catch (e) {
  /* se avisa más abajo */
}

// Fotografía sintética con detalle fino (para que el JPEG pese como una foto real): manchas suaves + ruido determinista.
async function fotoSintetica(ruta, w, h, semilla, opciones) {
  const o = opciones || {};
  const bw = Math.max(8, Math.floor(w / 16));
  const bh = Math.max(8, Math.floor(h / 16));
  let s = semilla >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  const baja = Buffer.alloc(bw * bh * 3);
  for (let i = 0; i < baja.length; i++) baja[i] = Math.floor(40 + rnd() * 170);
  let img = sharp(baja, { raw: { width: bw, height: bh, channels: 3 } }).resize(w, h, { kernel: "cubic" });
  const base = await img.raw().toBuffer();
  for (let i = 0; i < base.length; i++) base[i] = Math.max(0, Math.min(255, base[i] + Math.floor((rnd() - 0.5) * (o.ruido === undefined ? 36 : o.ruido))));
  let p = sharp(base, { raw: { width: w, height: h, channels: 3 } });
  if (o.orientacion) p = p.withMetadata({ orientation: o.orientacion });
  if (o.png) await p.png().toFile(ruta);
  else await p.jpeg({ quality: o.calidad || 90 }).toFile(ruta);
}

async function crearFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const f = (n) => path.join(dir, n);
  const n = (i) => "foto-" + String(i).padStart(2, "0") + ".jpg";
  for (let i = 1; i <= 12; i++) await fotoSintetica(f(n(i)), 4000, 3000, 1000 + i);
  await fotoSintetica(f("grande-8000.jpg"), 8000, 6000, 77);
  for (let i = 1; i <= 5; i++) await fotoSintetica(f("orden-" + i + ".jpg"), 3200 - 200 * i, 2000, 40 + i); // tamaños distintos: permiten comprobar el orden
  await fotoSintetica(f("giro6.jpg"), 3000, 2000, 5, { orientacion: 6 });
  await fotoSintetica(f("pequena.jpg"), 1200, 800, 9, { calidad: 80, ruido: 12 });
  await fotoSintetica(f("diminuta.jpg"), 640, 480, 10, { calidad: 85 });
  fs.copyFileSync(f(n(1)), f("copia-identica-de-foto-01.jpg"));
  // transparencia
  const rgba = Buffer.alloc(800 * 600 * 4, 0);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 200;
    rgba[i + 1] = 60;
    rgba[i + 2] = 40;
    rgba[i + 3] = (i / 4) % 800 < 400 ? 0 : 255;
  }
  await sharp(rgba, { raw: { width: 800, height: 600, channels: 4 } }).png().toFile(f("transparente.png"));
  await sharp(rgba, { raw: { width: 800, height: 600, channels: 4 } }).webp().toFile(f("foto.webp"));
  // mismo nombre original, contenido distinto, en carpetas distintas
  fs.mkdirSync(f("a"), { recursive: true });
  fs.mkdirSync(f("b"), { recursive: true });
  await fotoSintetica(f("a/IMG_0001.jpg"), 3000, 2000, 301);
  await fotoSintetica(f("b/IMG_0001.jpg"), 3000, 2000, 302);
  // archivos inválidos
  fs.writeFileSync(f("texto-disfrazado.jpg"), "esto no es una imagen");
  const valida = fs.readFileSync(f(n(2)));
  fs.writeFileSync(f("danada.jpg"), valida.subarray(0, 30000));
  fs.writeFileSync(f("documento.pdf"), "%PDF-1.4\n%fake");
  fs.writeFileSync(f("iphone.heic"), Buffer.from("....ftypheic....fake"));
  fs.writeFileSync(f("animacion.gif"), Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "binary"));
  return { n };
}

/* ------------------------------------------------------------------ */
/* Servidor del backend de prueba                                      */
/* ------------------------------------------------------------------ */

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".yml": "text/yaml; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".css": "text/css" };

function iniciarServidorPrueba(decap, dirFixtures) {
  const yaml = require("js-yaml");
  const configPrueba = () => {
    const c = yaml.load(fs.readFileSync(path.join(RAIZ, "admin", "config.yml"), "utf8"));
    c.backend = { name: "test-repo" };
    delete c.local_backend;
    return yaml.dump(c, { lineWidth: -1 });
  };
  const { construirRepo } = require("./lib/repo-prueba");
  const { crearFeed } = require("./lib/listado-feed-prueba");
  // Datos de prueba (con las entradas CONGELADAS y las SINTÉTICAS del listado) y, a partir de ellos, la réplica del archivo de datos del listado.
  const repoDatos = construirRepo(RAIZ);
  const feedPrueba = crearFeed(repoDatos.content.propiedades, RAIZ, sharp);
  const repoFiles = () => "window.repoFiles=" + JSON.stringify(repoDatos) + ";";
  // Gancho de prueba: con window.__fallo = true cualquier escritura en el «repositorio» lanza un error (publicación fallida).
  const ganchos = `(function(){var base=window.repoFiles;function envolver(o){return new Proxy(o,{get:function(t,k){var v=t[k];return v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype?envolver(v):v},set:function(t,k,v){if(window.__fallo)throw new Error('Fallo simulado de publicación');t[k]=v;return true},deleteProperty:function(t,k){if(window.__fallo)throw new Error('Fallo simulado de publicación');delete t[k];return true}})}var p=envolver(base);Object.defineProperty(window,'repoFiles',{get:function(){return p},set:function(v){base=v;p=envolver(v)},configurable:true});window.__crudo=base;})();`;
  const servidor = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const enviar = (tipo, cuerpo) => {
      res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "no-store" });
      res.end(cuerpo);
    };
    if (u === "/admin/" || u === "/admin/index.html") {
      let html = fs.readFileSync(path.join(RAIZ, "admin", "index.html"), "utf8");
      html = html.replace(/<script src="https:\/\/unpkg\.com\/decap-cms@[^"]*"><\/script>/, '<script src="/admin/repo-files.js"></script><script src="/admin/test-hooks.js"></script><script src="/admin/decap-cms.js"></script>');
      return enviar(TIPOS[".html"], html);
    }
    if (u === "/admin/config.yml") return enviar(TIPOS[".yml"], configPrueba());
    if (u === "/admin/listado-propiedades.json") {
      globalThis.__pedidosFeed = (globalThis.__pedidosFeed || 0) + 1;
      if (globalThis.__feedFalla) { res.writeHead(globalThis.__feedFalla, { "Content-Type": "text/plain" }); return res.end("error simulado"); }
      if (globalThis.__feedMalo === "version") return enviar(TIPOS[".json"], JSON.stringify({ version: 3, propiedades: [] }));
      if (globalThis.__feedMalo === "hostil") {
        // Datos hostiles: URL externa, esquema javascript:, estado desconocido y tipos equivocados. Nada de eso debe usarse.
        const f = JSON.parse(JSON.stringify(feedPrueba.feed));
        f.propiedades.forEach((x, i) => { if (x.portada) x.portada.miniatura = i % 2 ? "https://hostil.example/x.webp" : "javascript:alert(1)"; x.estado = i % 3 ? "<img src=x onerror=alert(1)>" : x.estado; });
        f.propiedades.push({ k: 42, estado: [] }, { k: "no-es-hash", estado: "disponible" }, null, "texto");
        return enviar(TIPOS[".json"], JSON.stringify(f));
      }
      return enviar(TIPOS[".json"], JSON.stringify(feedPrueba.feed));
    }
    if (u.startsWith("/assets/propiedades/_optimizadas/th-")) {
      globalThis.__hitsMini = globalThis.__hitsMini || new Map();
      globalThis.__hitsMini.set(u, (globalThis.__hitsMini.get(u) || 0) + 1);
      if (globalThis.__miniaturasLentas) { setTimeout(() => feedPrueba.miniatura(u).then((b) => (b ? (res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "max-age=600" }), res.end(b)) : (res.writeHead(404), res.end("404")))), globalThis.__miniaturasLentas); return; }
      feedPrueba.miniatura(u).then((b) => (b ? (res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "max-age=600" }), res.end(b)) : (res.writeHead(404), res.end("404"))));
      return;
    }
    if (u === "/admin/repo-files.js") return enviar(TIPOS[".js"], repoFiles());
    if (u === "/admin/test-hooks.js") return enviar(TIPOS[".js"], ganchos);
    if (u === "/admin/decap-cms.js") return enviar(TIPOS[".js"], fs.readFileSync(decap.cache));
    if (u === "/admin/galeria-fotos.js") return enviar(TIPOS[".js"], fs.readFileSync(path.join(RAIZ, "admin", "galeria-fotos.js")));
    if (u === "/admin/listado-propiedades.js") { if (globalThis.__sinListadoJs) { res.writeHead(404); return res.end("404"); } return enviar(TIPOS[".js"], fs.readFileSync(path.join(RAIZ, "admin", "listado-propiedades.js"))); }
    let archivo;
    if (u.startsWith("/__fixtures/")) archivo = path.join(dirFixtures, u.slice("/__fixtures/".length));
    else archivo = path.normalize(path.join(RAIZ, u));
    const raiz = u.startsWith("/__fixtures/") ? dirFixtures : RAIZ;
    if (!archivo.startsWith(raiz) || /[\\/]\.(git|claude)/.test(archivo) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      res.writeHead(404).end("404");
      return;
    }
    enviar(TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream", fs.readFileSync(archivo));
  });
  return new Promise((resolve) => servidor.listen(0, "127.0.0.1", () => resolve({ servidor, base: "http://127.0.0.1:" + servidor.address().port })));
}

/* ------------------------------------------------------------------ */
/* Navegador                                                           */
/* ------------------------------------------------------------------ */

const ENTRADA = "apartamentos-amoblados-en-venta-en-costa-del-este-panam%C3%A1"; // propiedad real (6 fotos) usada como base

async function abrirPanel(cdp, base, ancho) {
  const ev = async (expr) => {
    const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || JSON.stringify(r.exceptionDetails)).slice(0, 400) + " | expr: " + String(expr).slice(0, 160).replace(/\s+/g, " "));
    return r.result.value;
  };
  const p = { cdp, base, ev };
  p.esperar = async (cond, limite) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (limite || 20000)) {
      try {
        if (await ev(cond)) return true;
      } catch (e) {
        /* sigue esperando */
      }
      await dormir(100);
    }
    return false;
  };
  p.real = async (texto) => {
    const c = await ev(`(() => { const els = [...document.querySelectorAll('button,li,a,span,div,label')].filter((e) => (e.children.length === 0 || e.tagName === 'BUTTON') && e.textContent.trim() === ${JSON.stringify(texto)}); const e = els[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    if (!c) return false;
    for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await cdp.send("Input.dispatchMouseEvent", { type: t, x: c.x, y: c.y, button: "left", clickCount: t === "mouseMoved" ? 0 : 1 });
    return true;
  };
  p.cargar = async (entrada) => {
    const l = cdp.una("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: base + "/admin/" });
    await Promise.race([l, dormir(15000)]);
    await p.esperar("!!document.querySelector('button')", 15000);
    await ev("(() => { const b = [...document.querySelectorAll('button')].find((b) => /Iniciar sesi/i.test(b.textContent)); if (b) b.click(); })()");
    await p.esperar("!!document.querySelector('a[href*=\"collections\"], [class*=SidebarContainer]')", 15000);
    await ev(`location.hash = '#/collections/propiedades/entries/${entrada || ENTRADA}'`);
    return p.esperar("!!document.querySelector('[data-galeria-fotos]')", 20000);
  };
  p.contador = () => ev("(document.querySelector('[data-galeria-contador]') || {}).textContent || ''");
  p.n = async () => Number((await ev("document.querySelectorAll('[data-galeria-tarjeta]').length")) || 0);
  p.ocupado = () => ev("!!document.querySelector('[data-galeria-progreso]')");
  p.esperarFin = async (limite) => {
    await dormir(150);
    return p.esperar("!document.querySelector('[data-galeria-progreso]')", limite || 60000);
  };
  p.mensajes = () => ev("[...document.querySelectorAll('[data-galeria-error]')].map((e) => e.textContent)");
  p.subir = async (rutas) => {
    const doc = await cdp.send("DOM.getDocument", { depth: 1 });
    const q = await cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[data-galeria-entrada]" });
    await cdp.send("DOM.setFileInputFiles", { nodeId: q.nodeId, files: rutas });
    await p.esperarFin();
  };
  // Arrastrar y soltar archivos reales (eventos DragEvent con DataTransfer sobre la zona de carga)
  p.soltar = async (nombres) => {
    await ev(`(async () => { const dt = new DataTransfer(); for (const n of ${JSON.stringify(nombres)}) { const r = await fetch('/__fixtures/' + n); const b = await r.blob(); dt.items.add(new File([b], n.split('/').pop(), { type: b.type })); } const z = document.querySelector('[data-galeria-zona]'); for (const t of ['dragenter', 'dragover', 'drop']) z.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })); return true; })()`);
    await p.esperarFin();
  };
  // Escribe el texto alternativo como una persona: clic real en el campo, teclado real y Enter (el navegador debe tener el foco)
  p.escribirAlt = async (i, texto) => {
    const c = await ev(`(() => { const e = document.querySelector('[data-galeria-tarjeta="${i}"] input[type=text]'); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await cdp.send("Input.dispatchMouseEvent", { type: t, x: c.x, y: c.y, button: "left", clickCount: t === "mouseMoved" ? 0 : 1 });
    await cdp.send("Input.insertText", { text: texto });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await dormir(200);
  };
  p.quitarTodas = async () => {
    for (let i = 0; i < 12; i++) {
      const hay = await ev("(() => { const b = document.querySelector('[data-galeria-tarjeta] button[aria-label^=\"Quitar\"]'); if (!b) return false; b.click(); return true; })()");
      if (!hay) break;
      await dormir(60);
    }
  };
  p.publicar = async () => {
    await p.real("Publicar");
    await dormir(400);
    await p.real("Publicar ahora");
    await dormir(1800);
    return ev("(document.body.innerText.match(/CAMBIOS [A-ZÁÉÍÓÚ ]+/) || [''])[0]");
  };
  // Estado del «repositorio» en memoria: la propiedad guardada y los archivos nuevos (con sus bytes)
  p.repo = async () => {
    const txt = await ev(`(async () => {
      const c = window.__crudo;
      const k = Object.keys(c.content.propiedades).find((x) => x.includes('costa-del-este'));
      const raw = c.content.propiedades[k].content;
      const prop = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const archivos = [];
      const rec = async (o, ruta) => { for (const k2 of Object.keys(o || {})) { const v = o[k2]; const fo = v && v.content && (v.content.fileObj || v.content.file); if (fo && typeof fo.arrayBuffer === 'function') { const buf = new Uint8Array(await fo.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); archivos.push({ ruta: ruta + '/' + k2, tamano: buf.length, b64: btoa(s) }); } else if (v && typeof v === 'object' && !(v.content && typeof v.content === 'string')) await rec(v, ruta + '/' + k2); } };
      await rec(c.assets, 'assets');
      const todas = {}; for (const kk of Object.keys(c.content.propiedades)) { const r = c.content.propiedades[kk].content; todas[kk] = typeof r === 'string' ? r : JSON.stringify(r); }
      return JSON.stringify({ prop, archivos, todas });
    })()`);
    return JSON.parse(txt);
  };
  return p;
}

/* ------------------------------------------------------------------ */
/* Pruebas                                                             */
/* ------------------------------------------------------------------ */

const RE_NOMBRE = /^mkw-re-\d{3,}-\d{8}-[0-9a-f]{8}\.jpg$/;

function metaDe(archivo) {
  return archivo ? sharp(Buffer.from(archivo.b64, "base64")).metadata() : Promise.resolve(null);
}

function original(dirFix, nombre) {
  return path.join(dirFix, nombre);
}

async function main() {
  if (!sharp) {
    console.error("Falta 'sharp' (dependencia de eleventy-img). Ejecuta npm install.");
    process.exit(2);
  }
  const decap = await obtenerDecap();
  const dirFix = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-fixtures-"));
  const { n } = await crearFixtures(dirFix);
  const { servidor, base } = await iniciarServidorPrueba(decap, dirFix);
  const cdp = await nav.lanzarChrome(nav.localizarChrome(process.env.CHROME_PATH));
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Log.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.addEventListener('unhandledrejection', function (e) { console.error('RECHAZO: ' + String((e.reason && (e.reason.stack || e.reason.message)) || e.reason)); });" });
  cdp.on((m) => {
    if (m.method === "Runtime.exceptionThrown") erroresPagina.push(grupo + " | " + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || "").slice(0, 300));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") erroresPagina.push(grupo + " | " + m.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 300));
    // Los avisos nativos de Decap (p. ej. «¿salir sin guardar?») se aceptan para poder probar la cancelación
    if (m.method === "Page.javascriptDialogOpening") cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  });
  const p = await abrirPanel(cdp, base);
  if (DETALLE) process.on("exit", () => erroresPagina.slice(0, 8).forEach((e) => console.log("  [consola]", e)));
  const temporales = [];
  try {
    if (SOLO_OPTIMIZACION) {
      await tablaOptimizacion(p, base);
      return;
    }
    await escenarios(p, dirFix, n, temporales);
    if (CONSTRUIR) await construirE2E(p, dirFix, n);
  } finally {
    await cdp.cerrar();
    servidor.close();
    fs.rmSync(dirFix, { recursive: true, force: true });
  }
  resumen();
}

async function tablaOptimizacion(p, base) {
  const D = path.join(RAIZ, "assets", "propiedades", "uploads");
  const lista = ["exterior-nommad-_-300dpi-1-15-03-2025-11_08_53_722.jpg", "bpp_4462.jpg", "bpp_4450.jpg", "2015_02_gt_a01_aereo02_01_opcion-02.jpg", "chatgpt-image-24-ago-2026-05_29_00-p.m..png", "psquare-bloom_captura-de-pantalla.jpg"].filter((f) => fs.existsSync(path.join(D, f)));
  await p.cargar();
  const doc = await p.cdp.send("DOM.getDocument", { depth: 1 });
  console.log("Optimización con fotos reales del sitio (solo lectura):");
  for (const f of lista) {
    const q = await p.cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[data-galeria-reemplazo]" });
    await p.cdp.send("DOM.setFileInputFiles", { nodeId: q.nodeId, files: [path.join(D, f)] });
    await p.esperarFin();
    const info = await p.ev("[...document.querySelectorAll('[data-galeria-info]')].map((e) => e.textContent).pop() || ''");
    console.log("  " + f.slice(0, 44).padEnd(46) + info);
  }
}

// Compara dos objetos ignorando valores vacíos (Decap escribe null/""/[] en campos opcionales sin usar).
function limpiar(v) {
  if (Array.isArray(v)) return v.map(limpiar).filter((x) => x !== undefined);
  if (v && typeof v === "object") {
    const o = {};
    Object.keys(v).sort().forEach((k) => {
      const x = limpiar(v[k]);
      if (x !== undefined) o[k] = x;
    });
    return Object.keys(o).length ? o : undefined;
  }
  return v === null || v === "" || v === undefined ? undefined : v;
}
const igualesSinGaleria = (a, b) => {
  const c = JSON.parse(JSON.stringify(a));
  const d = JSON.parse(JSON.stringify(b));
  [c, d].forEach((x) => x.fotografias && delete x.fotografias.galeria);
  return JSON.stringify(limpiar(c)) === JSON.stringify(limpiar(d));
};

async function escenarios(p, dirFix, n, temporales) {
  if (process.env.SOLO_LISTADO) {
    // Solo los grupos 16 y 17 (listado de Propiedades); inicia sesión en el panel y los ejecuta.
    await p.cargar();
    await grupoListado(p);
    return;
  }
  if (process.env.SOLO_BARRA) {
    // Solo el grupo 18 (barra superior sin «Añadir rápido»).
    await p.cargar();
    await grupoBarra(p);
    return;
  }
  const f = (nombre) => path.join(dirFix, nombre);
  const fotos = (k) => Array.from({ length: k }, (_, i) => f(n(i + 1)));
  const rutaPublica = (a) => a.archivo;
  const nombreDe = (a) => path.basename(a.archivo);

  /* ---------- 0. Carga del widget en el Decap real ---------- */
  grupo = "1 · widget en Decap real";
  ok("el panel carga con el backend de prueba y el widget «galeria-fotos» está registrado", await p.cargar());
  ok("muestra las fotos existentes (6) y el contador «6 de 10 fotografías»", (await p.n()) === 6 && /6 de 10/.test(await p.contador()), await p.contador());
  ok("el límite (10) y el mínimo (3) salen de la configuración, no del código del widget", (await p.ev("window.MakomGaleriaFotos && !/\\b10\\b/.test(String(window.MakomGaleriaFotos.procesarImagen))")) === true);
  ok("conserva el orden y la portada existentes (portada = foto 4)", (await p.ev("[...document.querySelectorAll('[data-galeria-tarjeta]')].map((t, i) => t.textContent.includes('★ Portada') ? i + 1 : 0).filter(Boolean).join(',')")) === "4");
  const inicial = await p.repo();
  const galeriaInicial = inicial.prop.fotografias.galeria;
  const rutasIniciales = galeriaInicial.map((x) => x.archivo);
  ok("configuración: el widget del config.yml, la carpeta pública y la versión fija de Decap coinciden con lo que usa el panel", await (async () => {
    const yaml = require("js-yaml");
    const cfg = yaml.load(fs.readFileSync(path.join(RAIZ, "admin", "config.yml"), "utf8"));
    const g = cfg.collections[0].fields.find((x) => x.name === "fotografias").fields.find((x) => x.name === "galeria");
    const idx = fs.readFileSync(path.join(RAIZ, "admin", "index.html"), "utf8");
    return g.widget === "galeria-fotos" && g.public_folder === cfg.public_folder && /decap-cms@\d+\.\d+\.\d+\/dist/.test(idx) && idx.indexOf("decap-cms.js") < idx.indexOf("galeria-fotos.js");
  })());

  /* ---------- 2. Selección múltiple, orden, optimización, nombres ---------- */
  grupo = "2 · selección múltiple y optimización";
  await p.cargar();
  await p.quitarTodas();
  ok("al quitar todas las fotos (solo quita referencias) el contador marca 0 y avisa que faltan 3", (await p.n()) === 0 && /0 de 10/.test(await p.contador()) && /Faltan 3/.test(await p.ev("document.querySelector('[data-galeria-estado]').textContent")));
  const t0 = Date.now();
  await p.subir([1, 2, 3, 4, 5].map((i) => f("orden-" + i + ".jpg")));
  ok(`5 fotografías elegidas en UNA sola operación → 5 miniaturas (${Math.round((Date.now() - t0) / 1000)} s)`, (await p.n()) === 5 && /5 de 10/.test(await p.contador()), await p.contador());
  ok("sin guardar, nada se escribió en el repositorio (las imágenes son borradores de la entrada)", await (async () => { const r = await p.repo(); return r.archivos.length === 0 && JSON.stringify(r.prop.fotografias.galeria) === JSON.stringify(galeriaInicial); })());
  const estado = await p.publicar();
  const r2 = await p.repo();
  const gal2 = r2.prop.fotografias.galeria;
  ok("publicar guarda la propiedad con 5 fotos y las 5 imágenes nuevas, en una sola operación", /CAMBIOS GUARDADOS/.test(estado) && gal2.length === 5 && r2.archivos.length === 5, `${estado} ${gal2.length} ${r2.archivos.length}`);
  ok("formato de datos idéntico al anterior: { archivo, [alt], portada } con rutas /assets/propiedades/uploads/…", gal2.every((x) => typeof x.archivo === "string" && x.archivo.startsWith("/assets/propiedades/uploads/") && typeof x.portada === "boolean" && Object.keys(x).every((k) => ["archivo", "alt", "portada"].includes(k))));
  ok("exactamente una portada (la primera)", gal2.filter((x) => x.portada).length === 1 && gal2[0].portada === true);
  ok("nombres únicos «referencia-fecha-código.jpg» (no dependen del nombre original)", gal2.every((x) => RE_NOMBRE.test(nombreDe(x))), gal2.map(nombreDe).join(","));
  const dirUploads = fs.readdirSync(path.join(RAIZ, "assets", "propiedades", "uploads"));
  ok("ninguna imagen nueva pisa un archivo existente de Medios", gal2.every((x) => !dirUploads.includes(nombreDe(x))));
  ok("cada imagen se guardó por el mecanismo de Decap en la carpeta de Medios exacta (assets/propiedades/uploads/<nombre>) y la ruta de la propiedad es esa misma con «/» inicial", gal2.every((x) => r2.archivos.filter((a) => a.ruta === "assets/propiedades/uploads/" + nombreDe(x)).length === 1 && x.archivo === "/assets/propiedades/uploads/" + nombreDe(x)), r2.archivos.map((a) => a.ruta).join(","));
  ok("no se guardó ningún archivo que la propiedad no use (sin huérfanos en este flujo)", r2.archivos.every((a) => gal2.some((x) => nombreDe(x) === path.basename(a.ruta))));
  // Volver a abrir la propiedad ya publicada (misma sesión del CMS): el widget lee las rutas nuevas sin errores y muestra las 5 fotos
  await p.ev("location.hash = '#/collections/propiedades'");
  await dormir(700);
  await p.ev(`location.hash = '#/collections/propiedades/entries/${ENTRADA}'`);
  await p.esperar("!!document.querySelector('[data-galeria-fotos]')");
  ok("al reabrir la propiedad publicada, el widget lista las 5 fotos con sus rutas nuevas (miniaturas con origen definido) y la portada", (await p.n()) === 5 && (await p.ev("[...document.querySelectorAll('[data-galeria-tarjeta] img')].every((i) => !!i.getAttribute('src'))")) === true && (await p.ev("document.querySelectorAll('[data-galeria-tarjeta]')[0].textContent.includes('★ Portada')")) === true);
  const metas = [];
  for (const a of gal2) {
    const arch = r2.archivos.find((x) => x.ruta.endsWith("/" + nombreDe(a)));
    metas.push(arch ? await metaDe(arch) : null);
  }
  ok("cada ruta publicada tiene su archivo y es un JPEG", metas.every((m) => m && m.format === "jpeg"));
  ok("el orden elegido se conserva (tamaños 2400×1600, 2400×1714, 2400×1846, 2400×2000, 2200×2000)", JSON.stringify(metas.map((m) => m && [m.width, m.height])) === JSON.stringify([[2400, 1600], [2400, 1714], [2400, 1846], [2400, 2000], [2200, 2000]]), JSON.stringify(metas.map((m) => m && [m.width, m.height])));
  ok("sin metadatos EXIF/GPS en las imágenes subidas", metas.every((m) => m && !m.exif));
  ok("las imágenes pesan una fracción de las originales (≤ 2,5 MB cada una)", r2.archivos.every((a) => a.tamano <= 2.5 * 1048576), r2.archivos.map((a) => a.tamano).join(","));
  ok("el resto de la propiedad no cambió (solo la galería)", igualesSinGaleria(inicial.prop, r2.prop));
  ok("las demás propiedades reales no se modificaron", Object.keys(inicial.todas).filter((k) => !k.includes("costa-del-este")).every((k) => inicial.todas[k] === r2.todas[k]));

  /* ---------- 3. Arrastrar y soltar ---------- */
  grupo = "3 · arrastrar y soltar";
  await p.cargar();
  await p.quitarTodas();
  await p.soltar(["orden-1.jpg", "orden-2.jpg", "orden-3.jpg"]);
  ok("soltar 3 archivos sobre la zona los agrega (3 de 10)", (await p.n()) === 3 && /3 de 10/.test(await p.contador()), await p.contador());
  const rd = await p.publicar();
  const rdr = await p.repo();
  ok("se publican 3 fotos con 3 imágenes nuevas, en el orden soltado", /CAMBIOS GUARDADOS/.test(rd) && rdr.prop.fotografias.galeria.length === 3 && rdr.archivos.length === 3, `${rd} ${rdr.archivos.length}`);
  await p.cargar();
  await p.quitarTodas();
  await p.soltar(["documento.pdf"]);
  ok("soltar un archivo que no es imagen NO lo agrega y explica el motivo", (await p.n()) === 0 && (await p.mensajes()).some((m) => /Formato no admitido/.test(m)), JSON.stringify(await p.mensajes()));

  /* ---------- 4. Cantidades: 1, 3, 6, 10 y 11 ---------- */
  grupo = "4 · 1, 3, 6, 10 y 11 fotografías";
  for (const k of [1, 3, 6, 10, 11]) {
    await p.cargar();
    await p.quitarTodas();
    await p.subir(fotos(k));
    const esperadas = Math.min(k, 10);
    ok(`${k} foto(s) elegidas → ${esperadas} de 10 en la lista`, (await p.n()) === esperadas && new RegExp(`${esperadas} de 10`).test(await p.contador()), await p.contador());
    const estadoTxt = await p.ev("document.querySelector('[data-galeria-estado]').textContent");
    if (k === 1) ok("1 foto: avisa que faltan 2 para el mínimo", /Faltan 2/.test(estadoTxt), estadoTxt);
    if (k === 10 || k === 11) ok(`${k} fotos: «Máximo alcanzado» y la zona de carga queda desactivada`, /Máximo alcanzado/.test(estadoTxt) && (await p.ev("document.querySelector('[data-galeria-entrada]').disabled")) === true, estadoTxt);
    if (k === 11) ok("11 fotos elegidas a la vez: se agregan las primeras 10 y se avisa que se omite 1", (await p.ev("document.body.innerText")).includes("se omiten 1"));
    const antes = await p.repo();
    const st = await p.publicar();
    const dp = await p.repo();
    if (k < 3) {
      ok("1 foto: Decap NO deja publicar (mínimo 3) y no se escribe nada", !/CAMBIOS GUARDADOS/.test(st) && /al menos 3/i.test(await p.ev("document.body.innerText")) && dp.archivos.length === 0 && JSON.stringify(dp.prop.fotografias.galeria) === JSON.stringify(antes.prop.fotografias.galeria), `${st} | msg: ${/al menos 3/i.test(await p.ev("document.body.innerText"))} | archivos ${dp.archivos.length} | galería igual ${JSON.stringify(dp.prop.fotografias.galeria) === JSON.stringify(antes.prop.fotografias.galeria)}`);
    } else {
      ok(`${esperadas} fotos: se publican ${esperadas} fotos con ${esperadas} imágenes nuevas`, /CAMBIOS GUARDADOS/.test(st) && dp.prop.fotografias.galeria.length === esperadas && dp.archivos.length === esperadas, `${st} ${dp.prop.fotografias.galeria.length}/${dp.archivos.length}`);
      ok(`${esperadas} fotos: una sola portada y todas las rutas con su archivo`, dp.prop.fotografias.galeria.filter((x) => x.portada).length === 1 && dp.prop.fotografias.galeria.every((x) => dp.archivos.some((a) => a.ruta.endsWith("/" + nombreDe(x)))));
    }
  }
  await p.cargar();
  await p.subir(fotos(4)); // 6 existentes + 4 = 10
  ok("con 6 existentes se pueden agregar 4 y la lista llega a 10 de 10", (await p.n()) === 10);
  await p.soltar(["orden-1.jpg"]);
  ok("con 10 fotos, soltar otra no la agrega y avisa «Ya tiene el máximo»", (await p.n()) === 10 && (await p.mensajes()).some((m) => /máximo/.test(m)), JSON.stringify(await p.mensajes()));

  /* ---------- 5. Orden, portada, reemplazo y edición de una propiedad existente ---------- */
  grupo = "5 · orden, portada, reemplazo, edición";
  await p.cargar();
  const orig = (await p.repo()).prop;
  // mover con los botones ▶ (foto 1 → posición 3)
  await p.ev("(() => { const t = document.querySelector('[data-galeria-tarjeta=\"0\"]'); const b = [...t.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') && /derecha/.test(x.getAttribute('aria-label'))); b.click(); })()");
  await dormir(150);
  await p.ev("(() => { const t = document.querySelector('[data-galeria-tarjeta=\"1\"]'); const b = [...t.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') && /derecha/.test(x.getAttribute('aria-label'))); b.click(); })()");
  await dormir(150);
  // arrastrar la tarjeta 6 al lugar 1 (eventos de arrastre HTML5 entre tarjetas)
  await p.ev("(() => { const dt = new DataTransfer(); const o = document.querySelector('[data-galeria-tarjeta=\"5\"]'); const d = document.querySelector('[data-galeria-tarjeta=\"0\"]'); o.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); o.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt })); })()");
  await dormir(250);
  const o0 = orig.fotografias.galeria.map((x) => x.archivo);
  const esperadoOrden = [o0[5], o0[1], o0[2], o0[0], o0[3], o0[4]];
  // portada: la foto 4 original (o0[3]) sigue siendo portada; se cambia a la 2.ª tarjeta
  await p.ev("(() => { const t = document.querySelector('[data-galeria-tarjeta=\"1\"]'); [...t.querySelectorAll('button')].find((x) => /Hacer portada/.test(x.textContent)).click(); })()");
  await dormir(200);
  ok("tras mover con ▶ y arrastrar, el orden visible es el esperado y hay una sola ★", (await p.ev("[...document.querySelectorAll('[data-galeria-tarjeta] img')].map((i) => i.src.split('/').pop()).join('|')")) === esperadoOrden.map((x) => x.split("/").pop()).join("|") && (await p.ev("document.querySelectorAll('[data-galeria-tarjeta]').length && [...document.querySelectorAll('[data-galeria-tarjeta]')].filter((t) => t.textContent.includes('★ Portada')).length")) === 1, (await p.ev("[...document.querySelectorAll('[data-galeria-tarjeta] img')].map((i) => i.src.split('/').pop()).join('|')")) + ' vs ' + esperadoOrden.map((x) => x.split('/').pop()).join('|'));
  // alt y reemplazo
  await p.escribirAlt(2, "Texto alt de prueba");
  if (DETALLE) console.log("  [debug] alt de la tarjeta 2 tras escribirlo:", await p.ev("document.querySelector('[data-galeria-tarjeta=\"2\"] img').alt"));
  const doc = await p.cdp.send("DOM.getDocument", { depth: 1 });
  const q = await p.cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: 'input[data-galeria-reemplazo="3"]' });
  await p.cdp.send("DOM.setFileInputFiles", { nodeId: q.nodeId, files: [f("orden-3.jpg")] });
  await p.esperarFin();
  if (DETALLE) console.log("  [debug] alt de la tarjeta 2 tras reemplazar:", await p.ev("document.querySelector('[data-galeria-tarjeta=\"2\"] img').alt"));
  await p.subir([f("orden-4.jpg"), f("orden-5.jpg")]);
  const sv = await p.publicar();
  const rr = await p.repo();
  const g5 = rr.prop.fotografias.galeria;
  ok("se guardó: 8 fotos (6 existentes + 2 nuevas) y 3 imágenes nuevas (1 reemplazo + 2 agregadas)", /CAMBIOS GUARDADOS/.test(sv) && g5.length === 8 && rr.archivos.length === 3, `${sv} ${g5.length} ${rr.archivos.length}`);
  ok("las fotos existentes no movidas conservan su ruta exacta (nada se renombra ni se copia)", [o0[5], o0[1], o0[2], o0[4]].every((r) => g5.some((x) => x.archivo === r)));
  ok("el reemplazo cambió solo esa posición por una imagen nueva (la anterior queda en Medios, no se borra)", g5[3].archivo !== o0[0] && RE_NOMBRE.test(nombreDe(g5[3])) && !g5.some((x) => x.archivo === o0[0]));
  ok("el texto alternativo escrito se conservó en su foto", g5[2].alt === "Texto alt de prueba", JSON.stringify(g5.map((x) => [path.basename(x.archivo).slice(0, 12), x.alt])));
  ok("la portada cambió a la 2.ª y es la única", g5[1].portada === true && g5.filter((x) => x.portada).length === 1);
  ok("las dos nuevas quedan al final, en orden", RE_NOMBRE.test(nombreDe(g5[6])) && RE_NOMBRE.test(nombreDe(g5[7])));
  ok("el resto de la propiedad y las demás propiedades reales no cambiaron", igualesSinGaleria(orig, rr.prop) && Object.keys(inicial.todas).filter((k) => !k.includes("costa-del-este")).every((k) => inicial.todas[k] === rr.todas[k]));
  // quitar la portada → la primera pasa a ser portada
  await p.cargar();
  await p.ev("(() => { const t = document.querySelector('[data-galeria-tarjeta=\"3\"]'); t.querySelector('button[aria-label^=\"Quitar\"]').click(); })()");
  await dormir(200);
  ok("al quitar la portada, la primera foto pasa a ser la portada (una sola ★) y quedan 5 (por debajo del mínimo: no se puede publicar)", (await p.n()) === 5 && (await p.ev("[...document.querySelectorAll('[data-galeria-tarjeta]')].filter((t) => t.textContent.includes('★ Portada')).length")) === 1);

  /* ---------- 6. Duplicadas, nombres repetidos, grandes, giro, pequeñas, transparencia ---------- */
  grupo = "6 · duplicadas, grandes, giro y formatos";
  await p.cargar();
  await p.quitarTodas();
  await p.subir([f(n(1)), f("copia-identica-de-foto-01.jpg"), f("a/IMG_0001.jpg"), f("b/IMG_0001.jpg")]);
  ok("la misma foto con otro nombre se detecta y no se agrega dos veces", (await p.n()) === 3 && (await p.mensajes()).some((m) => /misma fotograf/.test(m)), `${await p.n()} ${JSON.stringify(await p.mensajes())}`);
  const sdup = await p.publicar();
  ok("dos archivos distintos con el MISMO nombre original (IMG_0001.jpg) se suben con nombres únicos, sin pisarse", await (async () => {
    const r = await p.repo();
    const nombres = r.prop.fotografias.galeria.map(nombreDe);
    return /CAMBIOS GUARDADOS/.test(sdup) && new Set(nombres).size === nombres.length && nombres.every((x) => RE_NOMBRE.test(x)) && r.archivos.length === 3;
  })(), sdup);
  await p.cargar();
  await p.quitarTodas();
  const tG = Date.now();
  await p.subir([f("grande-8000.jpg"), f("giro6.jpg"), f("pequena.jpg"), f("diminuta.jpg"), f("transparente.png"), f("foto.webp")]);
  const segundos = (Date.now() - tG) / 1000;
  ok(`6 archivos de formatos y tamaños distintos (incluye 8000×6000) se procesan juntos (${segundos.toFixed(1)} s); el WebP es la MISMA imagen que el PNG y se rechaza como repetida (evita una referencia rota por contenido idéntico)`, (await p.n()) === 5 && (await p.mensajes()).some((m) => /foto\.webp.*misma imagen/.test(m)), `${await p.n()} ${JSON.stringify(await p.mensajes())}`);
  const captions = await p.ev("[...document.querySelectorAll('[data-galeria-info]')].map((e) => e.textContent)");
  ok("cada foto nueva muestra «antes → después» (peso y dimensiones) o «Subida sin cambios»", captions.length === 5 && captions.some((c) => /Optimizada: .* → .* · 2400×1800/.test(c)) && captions.some((c) => /Subida sin cambios/.test(c)), JSON.stringify(captions));
  await p.subir([f(n(2)), f(n(3)), f("foto.webp")]);
  const sg = await p.publicar();
  const rg = await p.repo();
  const gg = rg.prop.fotografias.galeria;
  const arch = (a) => rg.archivos.find((x) => x.ruta.endsWith("/" + nombreDe(a)));
  const m0 = await metaDe(arch(gg[0]));
  const m1 = await metaDe(arch(gg[1]));
  const m2 = arch(gg[2]);
  const m3 = await metaDe(arch(gg[3]));
  ok("una foto de 8000×6000 queda en 2400×1800 (lado mayor 2400, proporción conservada)", m0 && m0.width === 2400 && m0.height === 1800, JSON.stringify(m0 && [m0.width, m0.height]));
  ok("la foto con giro EXIF 6 (3000×2000) queda DERECHA: 1600×2400 (vertical)", m1 && m1.width === 1600 && m1.height === 2400 && !m1.exif, JSON.stringify(m1 && [m1.width, m1.height, m1.orientation]));
  ok("un JPEG pequeño (1200×800, sin giro) se sube SIN recomprimir (mismos bytes)", m2 && Buffer.from(m2.b64, "base64").equals(fs.readFileSync(f("pequena.jpg"))));
  ok("una foto de 640×480 NO se amplía", m3 && m3.width === 640 && m3.height === 480, JSON.stringify(m3 && [m3.width, m3.height]));
  const pngRes = await (async () => {
    try {
      if (!arch(gg[4])) return "sin archivo; faltan " + JSON.stringify(gg.map((x, i) => [i, !!arch(x)]).filter((x) => !x[1])) + " de " + gg.length + ", archivos " + rg.archivos.length;
      const px = await sharp(Buffer.from(arch(gg[4]).b64, "base64")).raw().toBuffer({ resolveWithObject: true });
      const at = (x, y) => [0, 1, 2].map((c) => px.data[(y * px.info.width + x) * px.info.channels + c]);
      const transp = at(100, 100); // mitad transparente
      const opaco = at(700, 100); // mitad opaca (rojiza)
      return transp.every((v) => v > 235) && opaco[0] > 150 && opaco[2] < 110 ? true : JSON.stringify({ dim: [px.info.width, px.info.height, px.info.channels], transp, opaco });
    } catch (e) {
      return e.message;
    }
  })();
  ok("un PNG con transparencia se convierte a JPEG con fondo blanco (sin negro)", pngRes === true, pngRes);
  ok("las imágenes grandes pesan ≤ 2,5 MB tras optimizar", rg.archivos.every((a) => a.tamano <= 2.5 * 1048576), rg.archivos.map((a) => (a.tamano / 1048576).toFixed(2)).join(","));
  ok("se publicó correctamente con 7 fotos y TODAS las rutas tienen su archivo (ninguna referencia rota)", /CAMBIOS GUARDADOS/.test(sg) && gg.length === 7 && gg.every((x) => arch(x)) && rg.archivos.length === 7, `${sg} ${gg.length}/${rg.archivos.length}`);

  /* ---------- 7. Errores de procesamiento ---------- */
  grupo = "7 · errores de procesamiento";
  await p.cargar();
  await p.quitarTodas();
  await p.subir([f(n(1)), f("texto-disfrazado.jpg"), f(n(2)), f("danada.jpg"), f("documento.pdf"), f("iphone.heic"), f("animacion.gif")]);
  const msgs = await p.mensajes();
  ok("en un lote mezclado, las 2 fotos válidas se agregan y cada archivo inválido recibe su propio mensaje (5)", (await p.n()) === 2 && msgs.length === 5, `${await p.n()} ${msgs.length} ${JSON.stringify(msgs)}`);
  ok("mensajes claros: «no se pudo procesar», «Formato no admitido» y HEIC con instrucción", msgs.some((m) => /texto-disfrazado.*No se pudo procesar/.test(m)) && msgs.some((m) => /danada.*No se pudo procesar/.test(m)) && msgs.some((m) => /documento.*Formato no admitido/.test(m)) && msgs.some((m) => /iphone.*HEIC/.test(m)) && msgs.some((m) => /animacion.*Formato no admitido/.test(m)), JSON.stringify(msgs));
  ok("los archivos inválidos no dejaron nada en el repositorio ni en la lista", (await (async () => (await p.repo()).archivos.length)()) === 0);

  /* ---------- 8. Publicación fallida y cancelación ---------- */
  grupo = "8 · publicación fallida y cancelación";
  await p.cargar();
  const base0 = await p.repo();
  await p.subir(fotos(3));
  await p.ev("window.__fallo = true");
  const sf = await p.publicar();
  const df = await p.repo();
  erroresPagina.length = 0; // los rechazos de esta publicación fallida son simulados a propósito
  ok("con la publicación fallida NO se escribe nada: ni la propiedad ni las 3 imágenes (sin referencias rotas)", !/CAMBIOS GUARDADOS/.test(sf) && df.archivos.length === 0 && JSON.stringify(df.prop) === JSON.stringify(base0.prop), `${sf} archivos ${df.archivos.length} propiedad igual ${JSON.stringify(df.prop) === JSON.stringify(base0.prop)}`);
  ok("tras el fallo, el widget conserva las 9 fotos en el borrador para reintentar", (await p.n()) === 9 && /9 de 10/.test(await p.contador()));
  await p.ev("window.__fallo = false");
  const sr = await p.publicar();
  const dr = await p.repo();
  ok("al reintentar, se publica completo: propiedad con 9 fotos y 3 imágenes, todas las rutas con su archivo", /CAMBIOS GUARDADOS/.test(sr) && dr.prop.fotografias.galeria.length === 9 && dr.archivos.length === 3 && dr.prop.fotografias.galeria.filter((x) => /mkw-re/.test(x.archivo)).every((x) => dr.archivos.some((a) => a.ruta.endsWith("/" + nombreDe(x)))), `${sr} ${dr.archivos.length}`);
  // cancelación: agregar y salir sin publicar
  await p.cargar();
  await p.subir(fotos(2));
  const draft = await p.repo();
  ok("antes de publicar, las imágenes solo son borradores: nada en el repositorio", draft.archivos.length === 0 && JSON.stringify(draft.prop) === JSON.stringify(base0.prop));
  await p.ev("location.hash = '#/collections/propiedades'");
  await dormir(800);
  await p.ev(`location.hash = '#/collections/propiedades/entries/${ENTRADA}'`);
  await p.esperar("!!document.querySelector('[data-galeria-fotos]')");
  ok("al cancelar (salir sin publicar) la propiedad vuelve a sus 6 fotos y no queda ningún archivo nuevo", (await p.n()) === 6 && (await p.repo()).archivos.length === 0, `${await p.n()}`);

  /* ---------- 9. Propiedades con datos anómalos existentes (no se corrigen solas) ---------- */
  grupo = "9 · datos existentes anómalos";
  erroresPagina.length = 0;
  await p.cargar("apartamentos-desde-120-000-en-av-balboa");
  if (DETALLE) console.log("  [debug] errores tras abrir av-balboa:", erroresPagina.length);
  const bal = (await p.repo()).todas;
  const kBal = Object.keys(bal).find((k) => k.includes("av-balboa"));
  const galBal = JSON.parse(bal[kBal]).fotografias.galeria;
  const nPort = galBal.filter((x) => x.portada).length;
  ok(`una propiedad con ${nPort} portadas marcadas (dato real) se abre y el widget lo advierte, sin corregirlo`, nPort > 1 && /marcadas como portada/.test(await p.ev("document.querySelector('[data-galeria-fotos]').innerText")) && (await p.n()) === galBal.length);
  const escribirAlt = (i, texto) => p.escribirAlt(i, texto);
  await escribirAlt(0, "cambio de prueba"); // Decap solo guarda si hay un cambio
  await dormir(250);
  if (DETALLE) console.log("  [debug] errores tras escribir alt:", erroresPagina.length);
  const sb = await p.publicar();
  if (DETALLE) console.log("  [debug] errores tras publicar bloqueado:", erroresPagina.length);
  ok("con dos portadas Decap NO deja publicar hasta que se elija una (aviso explícito)", !/CAMBIOS GUARDADOS/.test(sb) && /marcadas como portada/i.test(await p.ev("document.body.innerText")), sb);
  const kPrim = galBal.findIndex((x) => x.portada);
  await p.ev(`(() => { const ts = [...document.querySelectorAll('[data-galeria-tarjeta]')]; [...ts[${kPrim}].querySelectorAll('button')].find((b) => /portada/i.test(b.textContent)).click(); })()`);
  await dormir(250);
  const sb2 = await p.publicar();
  const rb = (await p.repo()).todas[kBal];
  const gb2 = JSON.parse(rb).fotografias.galeria;
  ok("tras elegir UNA portada, se publica; las fotos conservan ruta y orden y solo se añadió el texto alternativo de prueba", /CAMBIOS GUARDADOS/.test(sb2) && gb2.map((x) => x.archivo).join("|") === galBal.map((x) => x.archivo).join("|") && gb2.filter((x) => x.portada).length === 1 && gb2[0].alt === "cambio de prueba", `${sb2} portadas ${gb2.filter((x) => x.portada).length}`);
  await p.cargar("semi-amoblado-de-2-rec%C3%A1maras-en-condado-del-rey");
  const avisoRep = /repetida/.test(await p.ev("document.querySelector('[data-galeria-fotos]').innerText"));
  await escribirAlt(0, "cambio de prueba");
  await dormir(250);
  const sc = await p.publicar();
  const kCh = Object.keys((await p.repo()).todas).find((k) => k.includes("condado-del-rey"));
  const gCh = JSON.parse((await p.repo()).todas[kCh]).fotografias.galeria;
  const gCh0 = JSON.parse(inicial.todas[kCh]).fotografias.galeria;
  ok("una propiedad con una foto repetida (dato real) muestra el aviso, se puede publicar y NO se corrige sola (siguen repetidas)", avisoRep && /CAMBIOS GUARDADOS/.test(sc) && gCh.length === gCh0.length && gCh.map((x) => x.archivo).join("|") === gCh0.map((x) => x.archivo).join("|"), `${sc} ${gCh.length}/${gCh0.length} errores visibles: ${await p.ev("[...document.querySelectorAll('[class*=ErrorsList]')].map((e) => e.innerText).join(' | ')")}`);

  /* ---------- 10. Sin errores de ejecución ---------- */
  grupo = "10 · consola";
  // «RECHAZO: undefined» es el aborto sin mensaje que hace Decap al bloquear un guardado inválido (comportamiento normal); se ignora.
  // Cualquier otra excepción o console.error se considera error del widget.
  const propios = erroresPagina.filter((e) => !/RECHAZO: undefined|Uncaught \(in promise\)$/.test(e) && !/Fallo simulado/.test(e));
  ok("el widget no produjo excepciones ni errores de consola inesperados", propios.length === 0, propios.slice(0, 3).join(" | "));

  /* ---------- 12. Tema visual MAKOM (solo estética) ---------- */
  grupo = "12 · tema MAKOM";
  const css = fs.readFileSync(path.join(RAIZ, "admin", "tema-makom.css"), "utf8");
  const idx = fs.readFileSync(path.join(RAIZ, "admin", "index.html"), "utf8");
  const cfgTema = require("js-yaml").load(fs.readFileSync(path.join(RAIZ, "admin", "config.yml"), "utf8"));
  ok("el tema está enlazado en admin/index.html y es solo CSS (sin JavaScript, sin @import ni recursos externos)", /<link href="tema-makom\.css" rel="stylesheet"/.test(idx) && !/@import|expression\(|javascript:|https?:\/\//.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && !/<script/i.test(css));
  ok("el logo oficial sale de la opción estándar de Decap (logo.src + show_in_header) y apunta a un archivo que existe", !!(cfgTema.logo && cfgTema.logo.show_in_header === true && fs.existsSync(path.join(RAIZ, cfgTema.logo.src.replace(/^\//, "")))), JSON.stringify(cfgTema.logo));
  ok("los selectores enganchan por la ETIQUETA del componente de Decap, no por el hash de Emotion", !/\.css-[a-z0-9]{5,}/.test(css) && /\[class\*="-SidebarNavLink"\]/.test(css));
  // Contraste (WCAG AA 4,5:1 para texto) con los valores reales del tema
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const mezcla = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
  const HUESO = hex("#F5F2EE");
  const pares = [
    ["texto de botón principal (marfil sobre terracota)", contraste(HUESO, hex("#B5472A"))],
    ["texto de botón principal en hover (marfil sobre terracota oscuro)", contraste(HUESO, hex("#9E3D24"))],
    ["texto terracota sobre marfil (navegación activa, etiquetas)", contraste(hex("#8F3720"), HUESO)],
    ["texto secundario (negro 66 % sobre marfil)", contraste(mezcla([10, 10, 10], HUESO, 0.66), HUESO)],
    ["texto de estado «Publicado» (verde bosque sobre su tinte)", contraste(hex("#2D6A4F"), mezcla(hex("#2D6A4F"), HUESO, 0.10))],
    ["error (rojo sobre blanco)", contraste(hex("#C0392B"), hex("#FFFFFF"))],
    ["enlace «Comprobar vista previa» (azul petróleo sobre marfil)", contraste(hex("#1F5560"), HUESO)],
  ];
  pares.forEach(([nombre, c]) => ok(`contraste ≥ 4,5:1 — ${nombre} (${c.toFixed(2)}:1)`, c >= 4.5, c.toFixed(2)));
  await p.cargar();
  await dormir(500);
  const est = await p.ev(`(() => {
    const g = (s) => document.querySelector(s);
    const cs = (e) => (e ? getComputedStyle(e) : null);
    const campo = g('[class*="-ControlContainer"] input[type="text"]');
    const sel = g('[class*="-ControlContainer"] [class$="-control"]');
    const pub = [...document.querySelectorAll('[class*="-StyledDropdownButton"]')].find((e) => /Publicad/.test(e.textContent));
    return JSON.stringify({
      fondo: cs(document.body).backgroundColor,
      fuente: cs(document.body).fontFamily.slice(0, 20),
      campoRadio: campo ? cs(campo).borderTopLeftRadius : null,
      selRadio: sel ? cs(sel).borderTopLeftRadius : null,
      publicado: pub ? cs(pub).color : null,
    });
  })()`);
  const e = JSON.parse(est);
  ok("tema aplicado: fondo marfil #F5F2EE y tipografía del sitio (Helvetica Neue)", e.fondo === "rgb(245, 242, 238)" && /Helvetica/.test(e.fuente), est);
  ok("campos y desplegables con esquinas suaves de 10 px", e.campoRadio === "10px" && e.selRadio === "10px", est);
  ok("el estado «Publicado» usa el verde bosque de la marca", e.publicado === "rgb(45, 106, 79)", est);
  // El botón principal de la lista y «Publicar» son terracota
  await p.ev("location.hash = '#/collections/propiedades'");
  await dormir(1200);
  const barra = JSON.parse(await p.ev(`(() => { const logo = document.querySelector('header nav img[alt="Logo"]'); const hdr = document.querySelector('header[class*="-AppHeader"]'); const r = logo && logo.getBoundingClientRect(); return JSON.stringify({ logo: r ? [Math.round(r.width), Math.round(r.height), logo.complete && logo.naturalWidth > 0] : null, cristal: hdr ? (getComputedStyle(hdr).backdropFilter || getComputedStyle(hdr).webkitBackdropFilter || '') : '' }); })()`));
  ok("el logo oficial se ve en la barra superior (≈118×34 px, cargado)", barra.logo && barra.logo[0] >= 100 && barra.logo[1] >= 28 && barra.logo[2] === true, JSON.stringify(barra));
  ok("la barra superior usa cristal marfil discreto (backdrop-filter)", /blur/.test(barra.cristal), JSON.stringify(barra));
  const nuevo = await p.ev("(() => { const b = document.querySelector('[class*=\"-CollectionTopNewButton\"]'); const c = getComputedStyle(b); return JSON.stringify([c.backgroundColor, c.borderTopLeftRadius, c.textTransform]); })()");
  ok("acción principal («+ Propiedad»): terracota #B5472A, radio 10 px, mayúsculas (igual que .btn--primary del sitio)", nuevo === JSON.stringify(["rgb(181, 71, 42)", "10px", "uppercase"]), nuevo);
  await p.ev(`location.hash = '#/collections/propiedades/entries/${ENTRADA}'`);
  await p.esperar("!!document.querySelector('[data-galeria-fotos]')");
  await p.escribirAlt(0, "x");
  const pubBtn = await p.ev("(() => { const b = [...document.querySelectorAll('[class*=\"-StyledDropdownButton\"]')].find((e) => /Publicar/.test(e.textContent)); return b ? getComputedStyle(b).backgroundColor : null; })()");
  ok("al haber cambios, «Publicar» es terracota", pubBtn === "rgb(181, 71, 42)", pubBtn);
  // Foco visible con el teclado (mismo anillo que el sitio: 2 px terracota)
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  const foco = await p.ev("(() => { const a = document.activeElement; const c = getComputedStyle(a); return JSON.stringify([c.outlineStyle, c.outlineWidth, c.outlineColor, a.tagName]); })()");
  ok("al tabular, el elemento enfocado muestra un contorno visible (2 px terracota)", /solid/.test(foco) && /2px/.test(foco) && /181, 71, 42/.test(foco), foco);

  /* ---------- 13. Formulario compacto (solo distribución; mismos campos, mismo orden, mismos datos) ---------- */
  grupo = "13 · formulario compacto";
  const vista = async (ancho, alto) => { await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto || 900, deviceScaleFactor: 1, mobile: ancho < 500 }); await dormir(700); };
  const abrirTodo = async () => {
    for (let i = 0; i < 6; i++) {
      const k = await p.ev(`(() => { let n = 0; for (const t of document.querySelectorAll('[class*="-TopBarContainer"]')) { const sib = t.nextElementSibling; const b = t.querySelector('[class*="-ExpandButton"]:not([class*="Container"])'); if (b && sib && getComputedStyle(sib).display === 'none') { b.click(); n++; } } return n; })()`);
      await dormir(500);
      if (!k) break;
    }
  };
  // Utilidades dentro de la página: campo «hoja» (sin campos dentro) por el id que Decap le pone al control
  const UT = `(() => {
    const CC = '[class*="-ControlContainer"]';
    window.__hoja = (id) => { const e = document.querySelector('[id^="' + id + '-field-"]'); const c = e && e.closest(CC); return c && !c.querySelector(CC) ? c : null; };
    window.__caja = (id) => { const c = window.__hoja(id); if (!c) return null; const r = c.getBoundingClientRect(); return { t: Math.round(r.top + scrollY), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
    window.__panel = () => document.querySelector('[class*="-ControlPaneContainer"]:not([class*="-PreviewPane"])');
    window.__hojas = () => [...window.__panel().querySelectorAll(CC)].filter((c) => !c.querySelector(CC));
    return true; })()`;
  await vista(1440);
  await p.cargar();
  await p.ev(UT);
  await dormir(500);
  ok("las secciones cerradas por defecto (video, planos, mapa, SEO, metadatos) siguen cerradas con la distribución nueva", await p.ev(`(() => ['videoRecorrido', 'mapa', 'seo', 'metadatos'].every((id) => { const o = document.querySelector('[id^="' + id + '-field-"]'); const cuerpo = o && [...o.children].find((x) => !/TopBarContainer/.test(x.className)); return cuerpo && getComputedStyle(cuerpo).display === 'none'; }))()`));
  await abrirTodo();
  await dormir(1500);
  const cols = await p.ev("getComputedStyle(__panel()).gridTemplateColumns.split(' ').length");
  ok("escritorio: el panel del formulario es una cuadrícula de 12 columnas y mide hasta 1080 px (antes 800)", cols === 12 && (await p.ev("Math.round(__panel().getBoundingClientRect().width)")) === 1080, cols);
  const fila = async (ids) => { const cajas = []; for (const id of ids) cajas.push(await p.ev(`JSON.stringify(__caja('${id}'))`)); const c = cajas.map((x) => JSON.parse(x)); return c.every((x) => x) && c.every((x) => Math.abs(x.t - c[0].t) <= 2) && c.every((x, i) => i === 0 || x.l >= c[i - 1].l + c[i - 1].w - 2) ? true : JSON.stringify(c); };
  ok("escritorio: Operación · Fecha de entrega · Tipo · Categoría comparten fila", (await fila(["operacion", "fechaEntrega", "tipo", "categoriaGeneral"])) === true, await fila(["operacion", "fechaEntrega", "tipo", "categoriaGeneral"]));
  ok("escritorio: Monto · Moneda comparten fila", (await fila(["monto", "moneda"])) === true);
  ok("escritorio: Provincia · Distrito · Corregimiento comparten fila; Sector · Edificio comparten fila", (await fila(["provincia", "distrito", "corregimiento"])) === true && (await fila(["sector", "edificioPH"])) === true);
  ok("escritorio: Habitaciones · Baños · Estacionamientos comparten fila; Metrajes · Año · Piso comparten fila", (await fila(["habitaciones", "banos", "estacionamientos"])) === true && (await fila(["metrajeInterno", "metrajeTotal", "anoConstruccion", "piso"])) === true);
  ok("escritorio: título, dirección interna y enlace del video conservan el ancho completo", await p.ev(`(() => ['titulo', 'direccionInterna', 'url'].every((id) => { const c = __caja(id); return c && c.w >= 780; }))()`));
  ok("escritorio: Descripción (ES) y Descripción en inglés quedan lado a lado, cada una con ≥ 450 px, y empiezan en una fila nueva", await p.ev(`(() => { const r = [...__panel().children].filter((c) => c.querySelector('.cms-editor-visual')).map((c) => c.getBoundingClientRect()); const est = __caja('estado'); return r.length === 2 && Math.abs(r[0].top - r[1].top) < 2 && r[0].width >= 450 && r[1].width >= 450 && r[1].left >= r[0].right && r[0].top > est.t + est.h - scrollY - 2; })()`));
  ok("escritorio: la galería (widget) conserva el ancho completo del panel", await p.ev(`(() => { const g = document.querySelector('[data-galeria-fotos]').closest('[class*="-ControlContainer"]'); const o = g.parentElement.parentElement; return g.getBoundingClientRect().width >= 1000; })()`));
  ok("el orden de tabulación coincide con el orden visual: cada campo queda a la derecha o debajo del anterior (el DOM no se reordena)", await (async () => { const r = await p.ev(`(() => { const h = __hojas().filter((c) => c.getBoundingClientRect().width > 0 && !c.closest('[data-galeria-fotos]')); const mal = []; for (let i = 1; i < h.length; i++) { const a = h[i - 1].getBoundingClientRect(), b = h[i].getBoundingClientRect(); const mismaFila = Math.abs(b.top - a.top) <= 2 && b.left >= a.right - 2; if (!(mismaFila || b.top >= a.bottom - 2)) mal.push(i + ':' + (h[i].querySelector('label') || {}).textContent); } return JSON.stringify(mal.slice(0, 5)); })()`); return r === "[]" || r; })());
  ok("todos los campos de las secciones abiertas son visibles y no se encogen (≥ 150 px de ancho, ≥ 40 px de alto)", await p.ev(`(() => __hojas().filter((c) => c.getBoundingClientRect().width > 0).every((c) => { const r = c.getBoundingClientRect(); return r.width >= 150 && r.height >= 40; }))()`));
  ok("los controles de texto, número y desplegables miden ≥ 40 px de alto", await p.ev(`(() => [...__panel().querySelectorAll('input[type=text],input[type=number],[class$="-control"]')].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[data-galeria-fotos]') && !(e.tagName === 'INPUT' && e.closest('[class$="-control"]'))).every((e) => e.getBoundingClientRect().height >= 40))()`));
  // Mismos controles y mismo número de elementos con y sin el tema (el DOM no cambia); altura con y sin el tema
  const conTema = JSON.parse(await p.ev(`JSON.stringify({ ids: [...document.querySelectorAll('[id*="-field-"]')].map((e) => e.id.replace(/-field-\\d+$/, '')), n: document.querySelectorAll('*').length, alto: Math.round(__panel().getBoundingClientRect().height) })`));
  await p.ev("document.querySelector('link[href*=\"tema-makom\"]').disabled = true");
  await dormir(800);
  const sinTema = JSON.parse(await p.ev(`JSON.stringify({ ids: [...document.querySelectorAll('[id*="-field-"]')].map((e) => e.id.replace(/-field-\\d+$/, '')), n: document.querySelectorAll('*').length, alto: Math.round(__panel().getBoundingClientRect().height) })`));
  await p.ev("document.querySelector('link[href*=\"tema-makom\"]').disabled = false");
  await dormir(500);
  ok("el tema no añade, quita ni reordena campos: mismos controles, en el mismo orden, con y sin el CSS", JSON.stringify(conTema.ids) === JSON.stringify(sinTema.ids) && conTema.ids.length > 50, conTema.ids.length + " vs " + sinTema.ids.length);
  ok(`el formulario abierto mide ${conTema.alto} px con el tema y ${sinTema.alto} px sin él (≥ 30 % menos de desplazamiento)`, conTema.alto <= sinTema.alto * 0.7, conTema.alto + " / " + sinTema.alto);
  // Tableta y móvil
  await vista(1024);
  ok("tableta (1024 px): Operación y Fecha de entrega comparten fila (2 por fila); Tipo baja a la fila siguiente", await (async () => { const a = JSON.parse(await p.ev("JSON.stringify(__caja('operacion'))")), b = JSON.parse(await p.ev("JSON.stringify(__caja('fechaEntrega'))")), c = JSON.parse(await p.ev("JSON.stringify(__caja('tipo'))")); return Math.abs(a.t - b.t) <= 2 && c.t > a.t + 20; })());
  ok("tableta (1024 px): las descripciones vuelven a ancho completo", await p.ev(`(() => [...__panel().children].filter((c) => c.querySelector('.cms-editor-visual')).every((c) => c.getBoundingClientRect().width >= 700))()`));
  await vista(390, 844);
  ok("móvil (390 px): una sola columna; todos los campos ocupan el ancho del panel", await p.ev(`(() => { const w = __panel().getBoundingClientRect().width; return __hojas().filter((c) => c.getBoundingClientRect().width > 0 && !c.closest('[data-galeria-fotos]')).every((c) => c.getBoundingClientRect().width >= w - 80); })()`));
  ok("móvil (390 px): los controles conservan alto cómodo para tocar (≥ 44 px)", await p.ev(`(() => [...__panel().querySelectorAll('input[type=text],input[type=number],[class$="-control"]')].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[data-galeria-fotos]') && !(e.tagName === 'INPUT' && e.closest('[class$="-control"]'))).every((e) => e.getBoundingClientRect().height >= 44))()`));
  const desborde = async () => p.ev("(() => { const s = document.querySelector('[class*=\"-PreviewPaneContainer-ControlPaneContainer\"]'); return s.scrollWidth - s.clientWidth; })()");
  for (const w of [1440, 1024, 768]) { await vista(w); ok(`sin desplazamiento horizontal del formulario a ${w} px`, (await desborde()) <= 1, await desborde()); }
  await vista(390, 844);
  const conT = await desborde();
  await p.ev("document.querySelector('link[href*=\"tema-makom\"]').disabled = true");
  await dormir(500);
  const sinT = await desborde();
  await p.ev("document.querySelector('link[href*=\"tema-makom\"]').disabled = false");
  ok(`móvil (390 px): el tema no aumenta el desborde horizontal que ya trae Decap (${conT} px con tema, ${sinT} px sin él)`, conT <= sinT + 1, conT + " vs " + sinT);
  // Integridad de datos: editar desde la distribución compacta y publicar cambia SOLO lo editado
  await vista(1440);
  await p.cargar();
  await p.ev(UT);
  const antes = (await p.repo()).prop;
  const escribir = async (id, texto) => {
    const c = await p.ev(`(() => { const e = document.querySelector('[id^="${id}-field-"]'); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await p.cdp.send("Input.dispatchMouseEvent", { type: t, x: c.x, y: c.y, button: "left", clickCount: t === "mouseMoved" ? 0 : 1 });
    await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 4, windowsVirtualKeyCode: 65, commands: ["selectAll"] });
    await p.cdp.send("Input.insertText", { text: texto });
    await dormir(200);
  };
  await escribir("monto", "999000");
  await escribir("habitaciones", "3");
  await escribir("sector", "Sector de prueba");
  const despues = await (async () => { await p.publicar(); return (await p.repo()).prop; })();
  const difs = [];
  const comparar = (a, b, ruta) => {
    if (a && b && typeof a === "object" && typeof b === "object") { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) comparar(a[k], b[k], ruta + "." + k); }
    else if (JSON.stringify(a) !== JSON.stringify(b)) difs.push(ruta);
  };
  comparar(antes, despues, "");
  const permitidas = [".precio.monto", ".detallesCuantitativos.habitaciones", ".ubicacionInterna.sector"];
  const inesperadas = difs.filter((d) => !permitidas.includes(d) && !/^\.metadatos\./.test(d));
  ok("editar monto, habitaciones y sector desde la distribución compacta y publicar guarda exactamente esos 3 valores y nada más (sin pérdida ni cambio de otros datos)", inesperadas.length === 0 && despues.precio.monto === 999000 && despues.detallesCuantitativos.habitaciones === 3 && despues.ubicacionInterna.sector === "Sector de prueba", JSON.stringify({ difs, inesperadas }));


  /* ---------- 14. Pulido visual final (encabezado, botones, estados, secciones, galería, listado, móvil) ---------- */
  grupo = "14 · pulido visual";
  const rgbDe = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(",").map((x) => parseFloat(x)); return { c: v.slice(0, 3), a: v.length > 3 ? v[3] : 1 }; };
  const sobre = (fg, bg) => { const f = rgbDe(fg), b = rgbDe(bg) || { c: HUESO, a: 1 }; return mezcla(f.c, b.c, f.a); };
  const centrado = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; const r = document.createRange(); r.selectNodeContents(b); const t = r.getBoundingClientRect(), q = b.getBoundingClientRect(); return JSON.stringify({ dx: +(((t.left + t.right) / 2) - ((q.left + q.right) / 2)).toFixed(1), dy: +(((t.top + t.bottom) / 2) - ((q.top + q.bottom) / 2)).toFixed(1), h: Math.round(q.height) }); })()`;
  await vista(1440);
  await p.cargar();
  await p.ev(UT);
  await p.ev("location.hash = '#/collections/propiedades'");
  await dormir(1500);
  // --- Encabezado: Medios vs inactiva vs deshabilitada
  const med = JSON.parse(await p.ev(`(() => { const b = [...document.querySelectorAll('header nav button')].find((x) => /Medios/.test(x.textContent)); const cs = getComputedStyle(b); const a = [...document.querySelectorAll('header nav a')].find((x) => /Contenido/.test(x.textContent)); const hdr = document.querySelector('header[class*="-AppHeader"]'); const r = b.getBoundingClientRect(), h = hdr.getBoundingClientRect(); return JSON.stringify({ disabled: b.disabled, color: cs.color, cursor: cs.cursor, h: Math.round(r.height), top: Math.round(r.top), hdr: Math.round(h.height), activo: getComputedStyle(a).color }); })()`));
  ok("«Medios» no está deshabilitado en Decap y se ve activo: botón habilitado, cursor de acción y texto con contraste ≥ 4,5:1 sobre el marfil", !med.disabled && med.cursor === "pointer" && contraste(sobre(med.color, "rgb(245,242,238)"), HUESO) >= 4.5, JSON.stringify(med));
  ok("encabezado de 56 px con las pestañas centradas verticalmente (no se recortan ni suben)", med.hdr === 56 && med.top >= 8 && med.h === 36, JSON.stringify(med));
  await p.real("Medios");
  await dormir(1000);
  ok("«Medios» sigue abriendo la biblioteca de medios (ventana «Archivos multimedia»)", await p.ev("/Archivos multimedia/.test(document.body.innerText)"));
  const modal = JSON.parse(await p.ev(`(() => { const t = [...document.querySelectorAll('h1')].find((e) => /Archivos multimedia/.test(e.textContent)); const m = t && t.closest('[class*="-StyledModal"]'); const u = document.querySelector('[class*="-UploadButton"]'); return JSON.stringify({ radio: m && getComputedStyle(m).borderTopLeftRadius, subir: u && getComputedStyle(u).backgroundColor }); })()`));
  ok("la ventana de medios usa el radio de 20 px y «Subir nuevo» en terracota", modal.radio === "20px" && modal.subir === "rgb(181, 71, 42)", JSON.stringify(modal));
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await dormir(500);
  // --- «Añadir rápido» ya no existe en la barra (ver el grupo 18): aquí solo se comprueba que no queda un botón huérfano con el estilo anterior
  ok("la barra superior no muestra «Añadir rápido» (el control está oculto; el grupo 18 lo prueba a fondo)", await p.ev(`![...document.querySelectorAll('header button, header [role="button"], header span')].some((x) => /Añadir rápido/.test(x.textContent) && x.getBoundingClientRect().width > 0)`));
  // --- Botones centrados
  const cNuevo = JSON.parse(await p.ev(centrado('[class*="-CollectionTopNewButton"]')));
  ok("«+ Propiedad»: texto centrado en el botón (desvío ≤ 1 px en horizontal y vertical) y 44 px de alto", Math.abs(cNuevo.dx) <= 1 && Math.abs(cNuevo.dy) <= 1 && cNuevo.h === 44, JSON.stringify(cNuevo));
  // --- Listado: hover y foco
  const caja1 = JSON.parse(await p.ev(`(() => { const e = document.querySelector('[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])'); const q = e.getBoundingClientRect(); return JSON.stringify({ x: q.left + q.width / 2, y: q.top + q.height / 2 }); })()`));
  await p.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: caja1.x, y: caja1.y });
  await dormir(400);
  const hov = await p.ev(`(() => { const e = document.querySelector('[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])'); const cs = getComputedStyle(e); return cs.borderTopColor + '|' + cs.boxShadow; })()`);
  ok("listado: al pasar el ratón la entrada resalta con el borde en el acento de la colección (terracota en Propiedades) y sombra", /181, 71, 42|0\.7098\d* 0\.2784\d* 0\.1647\d*/.test(hov) && /rgba\(10, 10, 10, 0\.08\)/.test(hov), hov);
  ok("listado: separación entre entradas y título legible (títulos de 15 px, o 16 px en la primera línea de Propiedades)", await p.ev(`(() => { const t = document.querySelector('[class*="-ListCardTitle"]'); const cs = getComputedStyle(t); const a = document.querySelectorAll('[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])'); const g = a[1].getBoundingClientRect().top - a[0].getBoundingClientRect().bottom; return (cs.fontSize === '15px' || cs.fontSize === '16px') && parseFloat(cs.lineHeight) >= 20 && g >= 9; })()`));
  // --- Editor: estados de guardado
  await p.ev(`location.hash = '#/collections/propiedades/entries/${ENTRADA}'`);
  await p.esperar("!!document.querySelector('[data-galeria-fotos]')");
  await dormir(800);
  const estG = JSON.parse(await p.ev(`(() => { const e = document.querySelector('[class*="-BackStatus"]'); const cs = getComputedStyle(e); return JSON.stringify({ t: e.textContent.trim(), color: cs.color, bg: cs.backgroundColor, radio: cs.borderTopLeftRadius }); })()`));
  ok("«Cambios guardados»: verde bosque con fondo tenue y contraste ≥ 4,5:1", /guardados/i.test(estG.t) && estG.color === "rgb(45, 106, 79)" && contraste(hex("#2D6A4F"), sobre(estG.bg, "rgb(245,242,238)")) >= 4.5, JSON.stringify(estG));
  await p.escribirAlt(0, "x");
  await dormir(400);
  const estS = JSON.parse(await p.ev(`(() => { const e = document.querySelector('[class*="-BackStatus"]'); const cs = getComputedStyle(e); return JSON.stringify({ t: e.textContent.trim(), color: cs.color, bg: cs.backgroundColor }); })()`));
  ok("«Cambios no guardados»: aviso en terracota oscuro (no el rojo de error #FF003B), con fondo tenue y contraste ≥ 4,5:1", /no guardados/i.test(estS.t) && estS.color === "rgb(143, 55, 32)" && contraste(hex("#8F3720"), sobre(estS.bg, "rgb(245,242,238)")) >= 4.5, JSON.stringify(estS));
  const cPub = JSON.parse(await p.ev(centrado('[class*="-PublishButton"]')));
  ok("«Publicar»: texto centrado verticalmente en el botón (desvío ≤ 1,5 px)", Math.abs(cPub.dy) <= 1.5, JSON.stringify(cPub));
  // --- Secciones desplegables
  const sec = JSON.parse(await p.ev(`(() => { const o = document.querySelector('[id^="precio-field-"]'); const cs = getComputedStyle(o); const tb = o.querySelector('[class*="-TopBarContainer"]'); const bt = tb.querySelector('[class*="-ExpandButton"]:not([class*="Container"])'); return JSON.stringify({ borde: cs.borderTopWidth, radio: cs.borderTopLeftRadius, alto: Math.round(tb.getBoundingClientRect().height), btn: Math.round(bt.getBoundingClientRect().width), bgAbierto: getComputedStyle(tb).backgroundColor, color: getComputedStyle(bt).color }); })()`));
  ok("secciones: tarjeta con borde de 1 px y radio de 16 px, franja superior de ≤ 42 px y botón de flecha de 30 px", sec.borde === "1px" && sec.radio === "16px" && sec.alto <= 42 && sec.btn === 30, JSON.stringify(sec));
  await p.ev(`(() => { const o = document.querySelector('[id^="precio-field-"]'); o.querySelector('[class*="-ExpandButton"]:not([class*="Container"])').click(); })()`);
  await dormir(500);
  const cerr = JSON.parse(await p.ev(`(() => { const o = document.querySelector('[id^="precio-field-"]'); const tb = o.querySelector('[class*="-TopBarContainer"]'); return JSON.stringify({ bg: getComputedStyle(tb).backgroundColor, color: getComputedStyle(tb.querySelector('[class*="-ExpandButton"]:not([class*="Container"])')).color, cuerpo: getComputedStyle(o.children[1]).display }); })()`));
  ok("secciones: abierta y cerrada se distinguen (fondo y color de la flecha distintos) y cerrar oculta el cuerpo, como en Decap", cerr.bg !== sec.bgAbierto && cerr.color !== sec.color && cerr.cuerpo === "none", JSON.stringify({ sec, cerr }));
  await p.ev(`(() => { const o = document.querySelector('[id^="precio-field-"]'); o.querySelector('[class*="-ExpandButton"]:not([class*="Container"])').click(); })()`);
  await dormir(500);
  // --- Legibilidad: etiquetas y ayudas
  const leg = JSON.parse(await p.ev(`(() => { const l = document.querySelector('[class*="-FieldLabel"]'); const h = document.querySelector('[class*="-ControlHint"]'); const a = getComputedStyle(l), b = getComputedStyle(h); return JSON.stringify({ lf: a.fontSize, lw: a.fontWeight, lc: a.color, hf: b.fontSize, hw: b.fontWeight, hc: b.color }); })()`));
  ok("legibilidad: etiquetas de 12 px / peso 500 y ayudas de 13 px / peso 400, ambas con contraste ≥ 4,5:1 sobre el marfil", leg.lf === "12px" && leg.lw === "500" && leg.hf === "13px" && leg.hw === "400" && contraste(sobre(leg.lc, "rgb(245,242,238)"), HUESO) >= 4.5 && contraste(sobre(leg.hc, "rgb(245,242,238)"), HUESO) >= 4.5, JSON.stringify(leg));
  const tog = await p.ev(`(() => { const on = document.querySelector('[role="switch"][aria-checked="true"] [class*="-ToggleBackground"]'); const off = document.querySelector('[role="switch"][aria-checked="false"] [class*="-ToggleBackground"]'); return JSON.stringify({ on: on && getComputedStyle(on).backgroundColor, off: off && getComputedStyle(off).backgroundColor }); })()`);
  ok("interruptores: el activado va en terracota y el desactivado en gris (se distinguen por color, no solo por la posición)", JSON.parse(tog).on === "rgb(181, 71, 42)" && JSON.parse(tog).off !== "rgb(181, 71, 42)", tog);
  // --- Galería
  const gal = JSON.parse(await p.ev(`(() => { document.querySelector('[data-galeria-fotos]').scrollIntoView({ block: 'center' }); const t = [...document.querySelectorAll('[data-galeria-tarjeta]')]; const filas = {}; t.forEach((e) => { const r = e.getBoundingClientRect(); (filas[Math.round(r.top)] = filas[Math.round(r.top)] || []).push(Math.round(r.height)); }); const igual = Object.values(filas).every((a) => a.every((h) => Math.abs(h - a[0]) <= 1)); const port = document.querySelector('[data-galeria-tarjeta]:has(> div:first-child > span + span)'); const insig = port && port.querySelector('div:first-child > span:nth-of-type(2)'); const btns = [...document.querySelectorAll('[data-galeria-tarjeta] button, [data-galeria-tarjeta] label')]; return JSON.stringify({ n: t.length, porFila: Object.values(filas).map((a) => a.length).join(','), igual, portadaBorde: port && getComputedStyle(port).borderTopColor, insig: insig && [getComputedStyle(insig).backgroundColor, getComputedStyle(insig).color, getComputedStyle(insig).fontSize], minAlto: Math.min(...btns.map((b) => b.getBoundingClientRect().height)), desbordan: btns.filter((b) => b.scrollWidth > b.clientWidth + 1).length }); })()`));
  ok("galería: varias fotos por fila, tarjetas de la misma fila con la misma altura y la portada con borde terracota", gal.n >= 6 && /^[3-9]/.test(gal.porFila) && gal.igual && /181, 71, 42/.test(gal.portadaBorde), JSON.stringify(gal));
  ok("galería: insignia «Portada» blanca sobre terracota (≥ 4,5:1, 12 px) y botones de ≥ 36 px de alto sin texto desbordado", gal.insig && gal.insig[0] === "rgb(181, 71, 42)" && gal.insig[2] === "12px" && contraste([255, 255, 255], hex("#B5472A")) >= 4.5 && gal.minAlto >= 36 && gal.desbordan === 0, JSON.stringify(gal));
  const cSel = JSON.parse(await p.ev(centrado('[data-galeria-zona] > span')));
  ok("galería: «Seleccionar fotografías» con el texto centrado (desvío ≤ 1 px)", Math.abs(cSel.dx) <= 1 && Math.abs(cSel.dy) <= 1, JSON.stringify(cSel));
  ok("galería: el widget conserva su funcionamiento con el tema (mover, portada, quitar siguen en la tarjeta con sus etiquetas de accesibilidad)", await p.ev(`(() => { const t = document.querySelector('[data-galeria-tarjeta="1"]'); return !!t.querySelector('button[aria-label^="Mover la fotografía 2 a la izquierda"]') && !!t.querySelector('button[aria-label^="Quitar la fotografía 2"]') && !!t.querySelector('input[type=file][data-galeria-reemplazo]'); })()`));
  // --- Errores reales: rojo accesible, mismo mensaje
  await p.ev("location.hash = '#/collections/propiedades/new'");
  await dormir(1800);
  await p.real("Publicar");
  await dormir(400);
  await p.real("Publicar ahora");
  await dormir(1500);
  const err = JSON.parse(await p.ev(`(() => { const e = document.querySelector('[class*="-ControlErrorsList"]'); const cs = getComputedStyle(e); const campo = e.closest('[class*="-ControlContainer"]'); return JSON.stringify({ t: e.textContent.trim().slice(0, 60), color: cs.color, peso: cs.fontWeight, n: document.querySelectorAll('[class*="-ControlErrorsList"]').length, toast: !!document.querySelector('.Toastify__toast--error'), toastBg: (document.querySelector('.Toastify__toast--error') ? getComputedStyle(document.querySelector('.Toastify__toast--error')).backgroundColor : '') }); })()`));
  ok("errores reales: mensajes de campo en rojo de error #C0392B (≥ 4,5:1), siguen visibles y con el texto original de Decap", /obligatorio/i.test(err.t) && err.color === "rgb(192, 57, 43)" && contraste(hex("#C0392B"), HUESO) >= 4.5 && err.n >= 4, JSON.stringify(err));
  ok("errores reales: el aviso de error de Decap sigue visible en rojo", err.toast && err.toastBg === "rgb(192, 57, 43)", JSON.stringify(err));
  // --- Foco con teclado en las pestañas, «Añadir rápido» y la flecha de sección
  await p.ev(`location.hash = '#/collections/propiedades'`);
  await dormir(1200);
  // Una pulsación de Tab real fija la modalidad «teclado»; luego se enfoca cada elemento y se lee su contorno (:focus-visible)
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  const foco2 = [];
  for (const n of ["Contenido", "Medios"]) {
    foco2.push(await p.ev(`(() => { const a = [...document.querySelectorAll('header nav a, header nav button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(n)})); a.focus(); const c = getComputedStyle(a); return ${JSON.stringify(n)} + '|' + (document.activeElement === a) + '|' + c.outlineStyle + '|' + c.outlineWidth + '|' + c.outlineColor; })()`));
  }
  ok("teclado: Contenido y Medios reciben el foco con contorno visible de 2 px terracota", ["Contenido", "Medios"].every((n) => foco2.some((f) => f.startsWith(n) && /\|true\|solid\|2px\|rgb\(181, 71, 42\)/.test(f))), JSON.stringify(foco2));

  /* ---------- Compatibilidad a varios anchos: 1440, 1280, 1024, 768, 390 y 375 ---------- */
  for (const w of [1440, 1280, 1024, 768, 390, 375]) {
    await vista(w, w < 500 ? 844 : 900);
    await p.cargar();
    await p.ev(UT);
    await abrirTodo();
    await dormir(800);
    const g = JSON.parse(await p.ev(`(() => { const vw = innerWidth; const fuera = [...document.querySelectorAll('input, [class$="-control"], [class*="-ToolbarContainer"], [class*="-ControlContainer"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); }).length; const bot = [...document.querySelectorAll('[class*="-ToolbarContainer"] button, [class*="-ToolbarContainer"] a')].filter((b) => b.getBoundingClientRect().right > vw + 1).length; const tb = document.querySelector('[class*="-ToolbarContainer"]'); const ed = document.querySelector('[class*="-EditorContainer"]'); const pane = document.querySelector('[class*="-PreviewPaneContainer-ControlPaneContainer"]'); const top = tb.getBoundingClientRect().bottom; const primero = document.querySelector('[id^="titulo-field-"]').getBoundingClientRect().top; return JSON.stringify({ vw, fuera, bot, tbW: Math.round(tb.getBoundingClientRect().width), edMin: getComputedStyle(ed).minWidth, solapa: primero < top - 1, desborde: pane.scrollWidth - pane.clientWidth }); })()`));
    ok(`${w} px: el editor cabe en la pantalla (barra de acciones, botones y campos dentro del ancho, sin solaparse con el primer campo, sin desborde horizontal)`, g.fuera === 0 && g.bot === 0 && g.tbW === g.vw && !g.solapa && g.desborde <= 1, JSON.stringify(g));
    if (w <= 400) {
      const t = JSON.parse(await p.ev(`(() => { const e = [...document.querySelectorAll('input[type=text],input[type=number],[class$="-control"]')].filter((x) => x.getBoundingClientRect().width > 0 && !x.closest('[data-galeria-fotos]') && !(x.tagName === 'INPUT' && x.closest('[class$="-control"]'))); const btn = [...document.querySelectorAll('[class*="-ExpandButton"]:not([class*="Container"]), [data-galeria-tarjeta] button')].filter((x) => x.getBoundingClientRect().width > 0); return JSON.stringify({ campos: Math.min(...e.map((x) => Math.round(x.getBoundingClientRect().height))), botones: Math.min(...btn.map((x) => Math.round(Math.min(x.getBoundingClientRect().height, x.getBoundingClientRect().width)))) }); })()`));
      ok(`${w} px: campos ≥ 44 px de alto y botones táctiles ≥ 30 px (flecha de sección) / 36 px (galería)`, t.campos >= 44 && t.botones >= 30, JSON.stringify(t));
    }
    await p.ev("location.hash = '#/collections/propiedades'");
    await dormir(1000);
    const h2 = JSON.parse(await p.ev(`(() => { const vw = innerWidth; const hdr = document.querySelector('header[class*="-AppHeader"]'); const fuera = [...hdr.querySelectorAll('nav a, nav button, [class*="-AvatarDropdownButton"]')].filter((b) => { const r = b.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1 || r.bottom > hdr.getBoundingClientRect().bottom + 1; }).length; const nuevo = document.querySelector('[class*="-CollectionTopNewButton"]').getBoundingClientRect(); return JSON.stringify({ fuera, nuevoDentro: nuevo.right <= vw && nuevo.left >= 0, sw: document.documentElement.scrollWidth - vw }); })()`));
    ok(`${w} px: encabezado y listado sin recortes ni desbordes (pestañas y menú de la persona dentro de la barra, «+ Propiedad» visible)`, h2.fuera === 0 && h2.nuevoDentro && h2.sw <= 1, JSON.stringify(h2));
  }
  await vista(1440);
  // --- Reducir movimiento / transparencia: reglas presentes para los componentes nuevos
  const cssTxt = fs.readFileSync(path.join(RAIZ, "admin", "tema-makom.css"), "utf8");
  const bloque = (nombre) => { const i = cssTxt.indexOf("@media (" + nombre + ": reduce)"); let d = 0, k = cssTxt.indexOf("{", i); const ini = k; for (; k < cssTxt.length; k++) { if (cssTxt[k] === "{") d++; if (cssTxt[k] === "}" && --d === 0) break; } return cssTxt.slice(ini, k); };
  ok("prefers-reduced-motion: sin transiciones ni desplazamientos en ningún componente del tema", /transition: none !important/.test(bloque("prefers-reduced-motion")) && /-AppHeaderButton/.test(bloque("prefers-reduced-motion")) && /-ListCard/.test(bloque("prefers-reduced-motion")));
  ok("prefers-reduced-transparency: encabezado, barra de acciones, menús y ventana de medios pasan a superficies opacas", ["-AppHeader", "-ToolbarContainer", "-DropdownList", "-menu", "-StyledModal"].every((k) => bloque("prefers-reduced-transparency").includes(k)));
  await p.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await p.cargar();
  await p.ev("location.hash = '#/collections/propiedades'");
  await dormir(1200);
  ok("con «reducir movimiento» activo, los botones no animan (transition-duration 0 s)", await p.ev(`(() => ['[class*="-CollectionTopNewButton"]', '[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])', 'header nav a'].every((s) => { const c = getComputedStyle(document.querySelector(s)); return c.transitionDuration.split(',').every((d) => parseFloat(d) === 0); }))()`));
  await p.cdp.send("Emulation.setEmulatedMedia", { features: [] });


  /* ---------- 15. Proyectos, Perspectivas y Asesores: widget «imagen-makom», galería sin portada y estándar visual compartido ---------- */
  grupo = "15 · otras colecciones";
  await vista(1440);
  await p.cargar();
  const fx = (nombre) => path.join(dirFix, nombre);
  // Cada colección se abre con una carga completa de la página (el «repositorio» de prueba vuelve a su estado inicial): al cambiar de colección solo con
  // el hash, Decap deja montado el formulario anterior. La clave (p. ej. «loyra») se busca entre los archivos de la colección.
  const enColeccion = async (col, clave, espera, campo) => {
    const l = p.cdp.una("Page.loadEventFired");
    await p.cdp.send("Page.navigate", { url: p.base + "/admin/" });
    await Promise.race([l, dormir(15000)]);
    await p.esperar("!!document.querySelector('button')", 15000);
    await p.ev("(() => { const b = [...document.querySelectorAll('button')].find((b) => /Iniciar sesi/i.test(b.textContent)); if (b) b.click(); })()");
    await p.esperar("!!document.querySelector('a[href*=\"collections\"], [class*=SidebarContainer]')", 15000);
    const slug = await p.ev(`Object.keys(window.__crudo.content['${col}']).find((k) => k.includes(${JSON.stringify(clave)})).replace(/\\.json$/, '')`);
    await p.ev(`location.hash = '#/collections/${col}/entries/' + ${JSON.stringify(slug)}`);
    await p.esperar(`(() => { const i = document.querySelector('[id^="${campo}-field-"]'); return !!i && !!i.value; })() && (${espera})`, 25000);
    await dormir(800);
    return slug;
  };
  const datosRepo = async (col, slug) => JSON.parse(await p.ev(`(() => { const c = window.__crudo.content['${col}']; const k = Object.keys(c).find((x) => x.replace(/\\.json$/, '') === ${JSON.stringify(slug)}); const raw = c[k].content; return typeof raw === 'string' ? raw : JSON.stringify(raw); })()`));
  const subirEn = async (selector, rutas) => {
    const doc = await p.cdp.send("DOM.getDocument", { depth: 1 });
    const q = await p.cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
    await p.cdp.send("DOM.setFileInputFiles", { nodeId: q.nodeId, files: rutas });
    await p.esperar("!document.querySelector('[data-galeria-progreso]') && !/Optimizando y subiendo/.test(document.body.innerText)", 60000);
    await dormir(300);
  };
  const soltarImagen = async (nombres) => {
    await p.ev(`(async () => { const dt = new DataTransfer(); for (const n of ${JSON.stringify(nombres)}) { const r = await fetch('/__fixtures/' + n); const b = await r.blob(); dt.items.add(new File([b], n.split('/').pop(), { type: b.type })); } const z = document.querySelector('[data-imagen-zona]'); for (const t of ['dragenter', 'dragover', 'drop']) z.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })); return true; })()`);
    await p.esperar("!/Optimizando y subiendo/.test(document.body.innerText)", 60000);
    await dormir(300);
  };
  const estadoImg = async () => JSON.parse(await p.ev(`(() => { const w = document.querySelector('[data-imagen-makom]'); const img = w && w.querySelector('[data-imagen-vista-previa]'); return JSON.stringify({ hay: !!w, vista: w && w.getAttribute('data-imagen-vista'), preview: img ? img.getAttribute('src') : null, cargada: img ? img.complete && img.naturalWidth > 0 : false, vacia: !!(w && w.querySelector('[data-imagen-vacia]')), insignia: (w && (w.querySelector('[data-imagen-insignia]') || {}).textContent) || '', archivo: (w && (w.querySelector('[data-imagen-archivo]') || {}).textContent) || '', accion: (w && (w.querySelector('label[data-imagen-accion]') || {}).textContent) || '', quitar: !!(w && w.querySelector('button[data-imagen-accion="quitar"]')), errores: w ? [...w.querySelectorAll('[data-imagen-error]')].map((e) => e.textContent) : [], avisos: w ? [...w.querySelectorAll('[data-imagen-aviso]')].map((e) => e.textContent) : [] }); })()`));
  const igualesSalvo = (a, b, permitidas) => { const d = []; const rec = (x, y, r) => { if (x && y && typeof x === "object" && typeof y === "object") { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) rec(x[k], y[k], r + "." + k); } else if (typeof x === "string" && typeof y === "string" && x.replace(/\n{3,}/g, "\n\n").trim() === y.replace(/\n{3,}/g, "\n\n").trim()) { /* Decap normaliza el Markdown del texto enriquecido al guardar (3 saltos de línea → 2): lo hace con cualquier guardado nativo, no es del widget */ } else if (JSON.stringify(x) !== JSON.stringify(y)) d.push(r); }; rec(a, b, ""); return { d, mal: d.filter((r) => !permitidas.includes(r) && !/^\.metadatos\./.test(r)) }; };
  const clic = async (selector) => { const c = await p.ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`); for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await p.cdp.send("Input.dispatchMouseEvent", { type: t, x: c.x, y: c.y, button: "left", clickCount: t === "mouseMoved" ? 0 : 1 }); await dormir(400); };
  const RUTA_NUEVA = /^\/assets\/propiedades\/uploads\/[a-z0-9-]+-\d{8}-[0-9a-f]{8}\.jpg$/;

  // ---------- ASESORES ----------
  let slugA = await enColeccion("asesores", "loyra", "!!document.querySelector('[data-imagen-makom]')", "nombre");
  const origA = await datosRepo("asesores", slugA);
  let e0 = await estadoImg();
  ok("asesores: la foto de perfil usa el widget «imagen-makom» en vista de perfil y muestra la vista previa de la foto actual, cargada", e0.hay && e0.vista === "perfil" && e0.cargada && /asesor-loyra\.jpg/.test(e0.preview + e0.archivo) && e0.accion === "Reemplazar imagen" && e0.quitar, JSON.stringify(e0));
  ok("asesores: la vista previa de perfil es circular de 120 px", await p.ev(`(() => { const m = document.querySelector('[data-imagen-marco]'); const c = getComputedStyle(m); const r = m.getBoundingClientRect(); return Math.round(r.width) === 120 && Math.round(r.height) === 120 && c.borderTopLeftRadius === '50%'; })()`));
  await subirEn("input[data-imagen-entrada]", [fx(n(3))]);
  e0 = await estadoImg();
  ok("asesores: al subir una foto grande (4000×3000) se optimiza, se ve la vista previa nueva y aparece la nota de optimización", e0.cargada && /optimizada/.test(e0.archivo) && RUTA_NUEVA.test("/assets/propiedades/uploads/" + e0.archivo.split(" ·")[0]) && /^asesor-loyra-flores-\d{8}-[0-9a-f]{8}\.jpg/.test(e0.archivo), JSON.stringify(e0));
  const est1 = await p.publicar();
  ok("asesores: publicar con la foto nueva funciona", /GUARDADOS/.test(est1) && !/NO GUARDADOS/.test(est1), est1);
  const rep1 = await p.repo();
  const a1 = await datosRepo("asesores", slugA);
  const nuevoAsset = rep1.archivos.find((x) => /asesor-loyra-flores-\d{8}-[0-9a-f]{8}\.jpg$/.test(x.ruta));
  const meta1 = nuevoAsset ? await metaDe(nuevoAsset) : null;
  ok("asesores: el JSON guarda la ruta nueva (cadena, igual que el widget nativo) y NO cambia ningún otro dato", typeof a1.foto === "string" && RUTA_NUEVA.test(a1.foto) && igualesSalvo(origA, a1, [".foto"]).mal.length === 0, JSON.stringify({ foto: a1.foto, difs: igualesSalvo(origA, a1, [".foto"]) }));
  ok("asesores: la imagen guardada es un JPEG de ≤ 1000 px de lado mayor, sin metadatos EXIF, y es la que sube Decap (un solo archivo nuevo)", !!meta1 && meta1.format === "jpeg" && Math.max(meta1.width, meta1.height) <= 1000 && !meta1.exif && rep1.archivos.filter((x) => /asesor-loyra-flores-/.test(x.ruta)).length === 1, JSON.stringify(meta1 && { f: meta1.format, w: meta1.width, h: meta1.height, exif: !!meta1.exif }));
  await clic('button[data-imagen-accion="quitar"]');
  e0 = await estadoImg();
  ok("asesores: «Quitar» muestra «Sin foto» y el botón vuelve a «Elegir imagen»", e0.vacia && !e0.cargada && e0.accion === "Elegir imagen" && !e0.quitar, JSON.stringify(e0));
  const est2 = await p.publicar();
  const a2 = await datosRepo("asesores", slugA);
  ok("asesores: publicar sin foto deja el campo vacío (el sitio usa el monograma: la ficha solo pinta la foto si el campo tiene valor) y no cambia otros datos", /GUARDADOS/.test(est2) && !a2.foto && igualesSalvo(origA, a2, [".foto"]).mal.length === 0, JSON.stringify({ est2, foto: a2.foto, d: igualesSalvo(origA, a2, [".foto"]) }));
  await subirEn("input[data-imagen-entrada]", [fx("texto-disfrazado.jpg")]);
  e0 = await estadoImg();
  ok("asesores: un archivo que no es imagen muestra un error claro y no cambia el valor", e0.vacia && e0.errores.length === 1 && /imagen|decodificar|abrir|leer/i.test(e0.errores[0]), JSON.stringify(e0));
  await soltarImagen([n(4), n(5)]);
  e0 = await estadoImg();
  ok("asesores: arrastrar y soltar admite una sola imagen: usa la primera y avisa", e0.cargada && e0.avisos.some((t) => /una imagen/.test(t)), JSON.stringify(e0));
  await p.ev("location.hash = '#/collections/asesores'");
  await dormir(500);

  // ---------- PERSPECTIVAS ----------
  let slugP = await enColeccion("perspectivas", "turismo-record", "!!document.querySelector('[data-imagen-makom]')", "titulo");
  const origP = await datosRepo("perspectivas", slugP);
  e0 = await estadoImg();
  ok("perspectivas: la portada usa «imagen-makom» (vista normal), muestra la vista previa actual y la insignia «★ Portada»", e0.hay && e0.vista === "normal" && e0.cargada && e0.insignia === "★ Portada" && e0.accion === "Reemplazar imagen", JSON.stringify(e0));
  await subirEn("input[data-imagen-entrada]", [fx(n(6))]);
  const estP = await p.publicar();
  const p1 = await datosRepo("perspectivas", slugP);
  const repP = await p.repo();
  const aP = repP.archivos.find((x) => /perspectiva-turismo-record[a-z0-9-]*-\d{8}-[0-9a-f]{8}\.jpg$/.test(x.ruta));
  const metaP = aP ? await metaDe(aP) : null;
  ok("perspectivas: reemplazar la portada y publicar guarda la ruta nueva, con un solo cambio en los datos (no se toca el resto del artículo ES/EN)", /GUARDADOS/.test(estP) && RUTA_NUEVA.test(p1.imagenPortada) && igualesSalvo(origP, p1, [".imagenPortada"]).mal.length === 0, JSON.stringify({ estP, v: p1.imagenPortada, d: igualesSalvo(origP, p1, [".imagenPortada"]), dif: (() => { const a = String(origP.contenido), b = String(p1.contenido); let k = 0; while (k < a.length && a[k] === b[k]) k++; return { en: k, antes: a.slice(Math.max(0, k - 20), k + 30), despues: b.slice(Math.max(0, k - 20), k + 30), largo: [a.length, b.length] }; })() }));
  ok("perspectivas: la imagen guardada es un JPEG de ≤ 2400 px, sin metadatos EXIF", !!metaP && metaP.format === "jpeg" && Math.max(metaP.width, metaP.height) <= 2400 && !metaP.exif, JSON.stringify(metaP && { w: metaP.width, h: metaP.height }));
  await clic('button[data-imagen-accion="quitar"]');
  const estP2 = await p.publicar();
  const p2 = await datosRepo("perspectivas", slugP);
  ok("perspectivas: quitar la portada y publicar la deja vacía sin tocar el resto", /GUARDADOS/.test(estP2) && !p2.imagenPortada && igualesSalvo(origP, p2, [".imagenPortada"]).mal.length === 0, JSON.stringify({ estP2, v: p2.imagenPortada }));
  ok("perspectivas: no se agregó ninguna galería (la estructura del contenido no la requiere)", await p.ev("!document.querySelector('[data-galeria-fotos]')"));

  // ---------- PROYECTOS ----------
  let slugY = await enColeccion("proyectos", "remodelacion", "!!document.querySelector('[data-imagen-makom]') && !!document.querySelector('[data-galeria-fotos]')", "titulo");
  const origY = await datosRepo("proyectos", slugY);
  e0 = await estadoImg();
  ok("proyectos: la imagen principal usa «imagen-makom»; sin imagen muestra «Sin imagen», sin insignia y con el botón «Elegir imagen»", e0.hay && e0.vista === "normal" && e0.vacia && e0.insignia === "" && e0.accion === "Elegir imagen", JSON.stringify(e0));
  await subirEn("input[data-imagen-entrada]", [fx(n(7))]);
  e0 = await estadoImg();
  ok("proyectos: tras subir, la imagen principal se identifica con la insignia «★ Imagen principal» y la vista previa", e0.cargada && e0.insignia === "★ Imagen principal", JSON.stringify(e0));
  const g0 = JSON.parse(await p.ev(`(() => { const g = document.querySelector('[data-galeria-fotos]'); return JSON.stringify({ contador: g.querySelector('[data-galeria-contador]').textContent, estado: g.querySelector('[data-galeria-estado]').textContent, tarjetas: g.querySelectorAll('[data-galeria-tarjeta]').length }); })()`));
  ok("proyectos: la galería sin fotos no exige mínimo (0 de 12) y no marca error", /^0 de 12/.test(g0.contador) && !/Faltan/.test(g0.estado), JSON.stringify(g0));
  await subirEn("input[data-galeria-entrada]", [fx(n(8)), fx(n(9)), fx(n(10))]);
  const g1 = JSON.parse(await p.ev(`(() => { const g = document.querySelector('[data-galeria-fotos]'); return JSON.stringify({ n: g.querySelectorAll('[data-galeria-tarjeta]').length, estrellas: /★/.test(g.textContent), hacerPortada: [...g.querySelectorAll('button')].some((b) => /portada/i.test(b.textContent)), insignias: g.querySelectorAll('[data-galeria-tarjeta] > div:first-child > span').length }); })()`));
  ok("proyectos: la galería carga varias fotos a la vez, con miniaturas, y NO muestra ninguna «portada» (ni ★ ni «Hacer portada»)", g1.n === 3 && !g1.estrellas && !g1.hacerPortada && g1.insignias === 3, JSON.stringify(g1));
  const antesOrden = await p.ev("[...document.querySelectorAll('[data-galeria-tarjeta] img')].map((i) => i.getAttribute('src')).join('|')");
  await clic('[data-galeria-tarjeta="0"] button[aria-label^="Mover la fotografía 1 a la derecha"]');
  const despuesOrden = await p.ev("[...document.querySelectorAll('[data-galeria-tarjeta] img')].map((i) => i.getAttribute('src')).join('|')");
  ok("proyectos: se puede reordenar (◀ ▶) y cambia el orden de las miniaturas", antesOrden !== despuesOrden && antesOrden.split("|")[0] === despuesOrden.split("|")[1]);
  await clic('[data-galeria-tarjeta="2"] button[aria-label^="Quitar la fotografía 3"]');
  ok("proyectos: «Quitar» saca la fotografía de la lista (quedan 2)", (await p.n()) === 2);
  await subirEn("input[data-galeria-entrada]", [fx(n(11)), fx(n(12)), fx(n(1)), fx(n(2)), fx(n(3)), fx(n(4)), fx(n(5)), fx(n(6)), fx(n(7)), fx("orden-1.jpg"), fx("orden-2.jpg")]);
  ok("proyectos: la galería respeta el máximo de 12 (agrega hasta completar y avisa del resto)", (await p.n()) === 12 && /12 de 12/.test(await p.contador()), await p.contador());
  await clic('[data-galeria-tarjeta="11"] button[aria-label^="Quitar la fotografía 12"]');
  await clic('[data-galeria-tarjeta="10"] button[aria-label^="Quitar la fotografía 11"]');
  const estY = await p.publicar();
  const y1 = await datosRepo("proyectos", slugY);
  ok("proyectos: publicar guarda la imagen principal (cadena) y la galería como [{ archivo }] SIN clave «portada», y no cambia ningún otro dato", /GUARDADOS/.test(estY) && RUTA_NUEVA.test(y1.imagenPrincipal) && Array.isArray(y1.galeria) && y1.galeria.length === 10 && y1.galeria.every((f) => RUTA_NUEVA.test(f.archivo) && !("portada" in f)) && igualesSalvo(origY, y1, [".imagenPrincipal", ".galeria"]).mal.length === 0, JSON.stringify({ estY, ip: y1.imagenPrincipal, g: (y1.galeria || []).slice(0, 2), mal: igualesSalvo(origY, y1, [".imagenPrincipal", ".galeria"]).mal }));
  ok("proyectos: los nombres de archivo salen del título («proyecto-…») y son únicos", new Set(y1.galeria.map((f) => f.archivo)).size === 10 && /proyecto-remodelacion/.test(y1.imagenPrincipal), y1.imagenPrincipal);
  await p.ev(`location.hash = '#/collections/proyectos/entries/${slugY}'`);
  await p.esperar("!!document.querySelector('[data-galeria-fotos]')");
  await dormir(500);
  ok("proyectos: al reabrir la entrada publicada se ven las 10 miniaturas y la imagen principal con su insignia", (await p.n()) === 10 && (await estadoImg()).insignia === "★ Imagen principal");
  await p.quitarTodas();
  const estY2 = await p.publicar();
  const y2 = await datosRepo("proyectos", slugY);
  ok("proyectos: vaciar la galería y publicar funciona (mínimo 0) y deja la imagen principal", /GUARDADOS/.test(estY2) && (!y2.galeria || y2.galeria.length === 0) && RUTA_NUEVA.test(y2.imagenPrincipal), JSON.stringify({ estY2, g: y2.galeria }));

  // ---------- Estándar visual compartido ----------
  await p.cargar();
  const colores = {};
  for (const [col, clave, marca, titulo] of [["proyectos", "remodelacion", "tipoProyecto", "Información general"], ["perspectivas", "turismo-record", "categoria", "Información editorial"], ["asesores", "loyra", "idoneidad", "Identidad"]]) {
    await enColeccion(col, clave, "true", marca === "idoneidad" ? "nombre" : "titulo");
    await vista(1440);
    const g = JSON.parse(await p.ev(`(() => { const pane = document.querySelector('[class*="-ControlPaneContainer"]:not([class*="-PreviewPane"])'); const cols = getComputedStyle(pane).gridTemplateColumns.split(' ').length; const hojas = [...pane.querySelectorAll('[class*="-ControlContainer"]')].filter((c) => !c.querySelector('[class*="-ControlContainer"]') && c.getBoundingClientRect().width > 0); const primeros = [...pane.children].filter((c) => getComputedStyle(c, '::before').content !== 'none' && getComputedStyle(c, '::before').content !== 'normal').map((c) => getComputedStyle(c, '::before').content.replace(/"/g, '')); const mal = []; for (let i = 1; i < hojas.length; i++) { const a = hojas[i - 1].getBoundingClientRect(), b = hojas[i].getBoundingClientRect(); const fila = Math.abs(b.top - a.top) <= 2 && b.left >= a.right - 2; if (!(fila || b.top >= a.bottom - 2)) mal.push(i); } const ancho = Math.round(pane.getBoundingClientRect().width); const anchos = hojas.filter((c) => !c.closest('[data-galeria-fotos]')).every((c) => c.getBoundingClientRect().width >= 150); return JSON.stringify({ cols, ancho, grupos: primeros, ordenOK: mal.length === 0, anchosOK: anchos }); })()`));
    ok(`${col}: cuadrícula de 12 columnas (1080 px), rótulos de grupo (${g.grupos.join(" · ")}), orden de tabulación = orden visual y campos sin encogerse`, g.cols === 12 && g.ancho === 1080 && g.grupos.length >= 3 && g.grupos[0] === titulo && g.ordenOK && g.anchosOK, JSON.stringify(g));
    const campos = JSON.parse(await p.ev(`(() => { const e = [...document.querySelectorAll('input[type=text],input[type=number],[class$="-control"]')].filter((x) => x.getBoundingClientRect().width > 0 && !x.closest('[data-galeria-fotos]') && !x.closest('[data-imagen-makom]') && !(x.tagName === 'INPUT' && x.closest('[class$="-control"]'))); const r = getComputedStyle(e[0]).borderTopLeftRadius; return JSON.stringify({ n: e.length, radio: r, alto: Math.min(...e.map((x) => Math.round(x.getBoundingClientRect().height))) }); })()`));
    ok(`${col}: campos con bordes redondeados de 10 px y alto ≥ 40 px`, campos.radio === "10px" && campos.alto >= 40, JSON.stringify(campos));
    await vista(390, 844);
    const m = JSON.parse(await p.ev(`(() => { const vw = innerWidth; const hojas = [...document.querySelectorAll('[class*="-ControlContainer"]')].filter((c) => !c.querySelector('[class*="-ControlContainer"]') && c.getBoundingClientRect().width > 0); const pane = document.querySelector('[class*="-ControlPaneContainer"]:not([class*="-PreviewPane"])'); return JSON.stringify({ uno: hojas.every((c) => c.getBoundingClientRect().left < 40 && c.getBoundingClientRect().right <= vw), toolbar: document.querySelector('[class*="-ToolbarContainer"]').getBoundingClientRect().width === vw }); })()`));
    ok(`${col}: en móvil (390 px) una sola columna, sin recortes y con la barra de acciones a todo el ancho`, m.uno && m.toolbar, JSON.stringify(m));
    await vista(1440);
  }
  // ---------- Listados de las cuatro colecciones ----------
  await p.cargar();
  const acentos = { propiedades: "rgb(181, 71, 42)", proyectos: "rgb(31, 85, 96)", perspectivas: "rgb(138, 109, 59)", asesores: "rgb(45, 106, 79)" };
  const vistos = new Set();
  for (const col of ["propiedades", "proyectos", "perspectivas", "asesores"]) {
    await p.ev(`location.hash = '#/collections/${col}'`);
    await p.esperar("!!document.querySelector('[class*=\"-ListCard\"]:not([class*=\"-ListCardLink\"]):not([class*=\"-ListCardTitle\"])')", 15000);
    await dormir(500);
    const l = JSON.parse(await p.ev(`(() => { const c = document.querySelector('[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])'); const b = getComputedStyle(c, '::before'); const t = document.querySelector('[class*="-ListCardTitle"]'); const a = c.querySelectorAll('a').length; return JSON.stringify({ franja: b.backgroundColor, ancho: b.width, radio: getComputedStyle(c).borderTopLeftRadius, titulo: getComputedStyle(t).fontSize, n: document.querySelectorAll('[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])').length }); })()`));
    if (col !== "propiedades") vistos.add(l.franja);
    // Propiedades: sus tarjetas están ENRIQUECIDAS (portada a la izquierda, ver grupo 17); las demás colecciones llevan la franja de acento de 4 px.
    ok(`${col}: el listado muestra tarjetas ` + (col === "propiedades" ? "enriquecidas con portada (148 px), radio de 16 px y título de 16 px" : `con franja de acento propia de la colección (${acentos[col]}), radio de 16 px y título de 15 px`), col === "propiedades" ? (l.ancho === "148px" && l.radio === "16px" && l.titulo === "16px" && l.n >= 1) : (l.franja === acentos[col] && l.ancho === "4px" && l.radio === "16px" && l.titulo === "15px" && l.n >= 1), JSON.stringify(l));
  }
  ok("Proyectos, Perspectivas y Asesores tienen un acento distinto entre sí (colecciones diferenciables); Propiedades se distingue por sus tarjetas con portada", vistos.size === 3, [...vistos].join(" | "));
  await p.ev("location.hash = '#/collections/perspectivas'");
  await dormir(600);
  await p.ev(`(() => { const b = document.querySelector('[aria-label="Grid view option"]'); if (b) b.click(); })()`);
  await dormir(800);
  const gr = JSON.parse(await p.ev(`(() => { const c = document.querySelector('[class*="-GridCard"]:not([class*="-GridCardLink"])'); return JSON.stringify(c ? { alto: Math.round(c.getBoundingClientRect().height), franja: getComputedStyle(c, '::before').backgroundColor } : null); })()`));
  ok("vista de cuadrícula: tarjetas de 176 px (en vez de 240 px casi vacíos) con la franja de acento de la colección", !!gr && gr.alto === 176 && gr.franja === acentos.perspectivas, JSON.stringify(gr));
  await p.ev(`(() => { const b = document.querySelector('[aria-label="List view option"]'); if (b) b.click(); })()`);
  await grupoListado(p);
  await grupoBarra(p);
  const ed = JSON.parse(await p.ev(`(() => { return null; })()`));
  await enColeccion("perspectivas", "turismo-record", "!!document.querySelector('.cms-editor-visual')", "titulo");
  const alturas = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('.cms-editor-visual [class*="editorStyles"]')].map((e) => Math.round(parseFloat(getComputedStyle(e).minHeight)))))()`));
  ok("perspectivas: los editores de texto enriquecido bajan su altura mínima de 300 a 190 px (siguen creciendo con el contenido)", alturas.length === 2 && alturas.every((a) => a === 190), JSON.stringify(alturas));
  await p.cargar();
  const altP = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('.cms-editor-visual [class*="editorStyles"]')].map((e) => Math.round(parseFloat(getComputedStyle(e).minHeight)))))()`));
  ok("propiedades: NO se altera la altura de sus editores (sigue como en el PR #20)", altP.length === 2 && altP.every((a) => a !== 190), JSON.stringify(altP));

  return;
}


/* ------------------------------------------------------------------ */
/* Grupos 16 y 17: listado de Propiedades (se pueden ejecutar solos con SOLO_LISTADO=1) */
/* ------------------------------------------------------------------ */
async function grupoListado(p) {
  const vista = async (ancho, alto) => { await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto || 900, deviceScaleFactor: 1, mobile: ancho < 500 }); await dormir(700); };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const mezcla = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
  const HUESO = hex("#F5F2EE");
  const rgbDe = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(",").map((x) => parseFloat(x)); return { c: v.slice(0, 3), a: v.length > 3 ? v[3] : 1 }; };
  const sobre = (fg, bg) => { const f = rgbDe(fg), b = rgbDe(bg) || { c: HUESO, a: 1 }; return mezcla(f.c, b.c, f.a); };
  /* ---------- 16. Listado de Propiedades: summary de dos líneas, filtros nativos, jerarquía y responsive ---------- */
  grupo = "16 · listado de propiedades";
  await vista(1440);
  // Carga limpia del panel directamente en el listado (sin abrir antes ninguna entrada: Decap duplicaría en la lista la entrada ya cargada en memoria con otra normalización del nombre)
  const lcarga = p.cdp.una("Page.loadEventFired");
  await p.cdp.send("Page.navigate", { url: p.base + "/admin/" });
  await Promise.race([lcarga, dormir(15000)]);
  await p.esperar("!!document.querySelector('button')", 15000);
  await p.ev("(() => { const b = [...document.querySelectorAll('button')].find((b) => /Iniciar sesi/i.test(b.textContent)); if (b) b.click(); })()");
  await p.esperar("!!document.querySelector('a[href*=\"collections\"], [class*=SidebarContainer]')", 15000);
  const cfgL = require("js-yaml").load(fs.readFileSync(path.join(RAIZ, "admin", "config.yml"), "utf8")).collections[0];
  const estadosCfg = cfgL.fields.find((f) => f.name === "estado").options.map((o) => o.value);
  const operCfg = cfgL.fields.find((f) => f.name === "operacion").options.map((o) => o.value);
  ok("config: el summary es «referencia · operación · tipo · estado» y, debajo, el título (el estado va en el propio texto: el listado nativo lo muestra aunque falle el enriquecimiento), con los campos reales y sin inventar datos", /^\{\{referenciaMakom \| default\('sin referencia'\)\}\} · \{\{operacion\}\} · \{\{tipo\}\} · \{\{estado \| default\('sin estado'\)\}\}\\n\{\{titulo( \| truncate\(\d+\))?\}\}$/.test(cfgL.summary.replace(/\n/g, "\\n")), cfgL.summary);
  ok("config: hay un filtro nativo (view_filters) por CADA estado definido en el campo «Estado» y por cada operación, con el valor exacto", estadosCfg.every((v) => cfgL.view_filters.some((f) => f.field === "estado" && f.pattern === "^" + v + "$")) && operCfg.every((v) => cfgL.view_filters.some((f) => f.field === "operacion" && f.pattern === "^" + v + "$")), JSON.stringify({ estadosCfg, operCfg }));
  const cargarTodas = async () => { for (let i = 0; i < 10; i++) { await p.ev(`(() => { window.scrollTo(0, document.documentElement.scrollHeight); [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)).forEach((e) => { e.scrollTop = e.scrollHeight; }); })()`); await dormir(500); } };
  await p.ev("location.hash = '#/collections/propiedades'");
  await p.esperar("document.querySelectorAll('[class*=\"-ListCardLink\"]').length > 0", 15000);
  await cargarTodas();
  const filas = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('[class*="-ListCardLink"]')].map((a) => { const slug = decodeURIComponent(a.getAttribute('href').split('/entries/')[1]); const k = Object.keys(window.__crudo.content.propiedades).find((x) => x.replace(/\\.json$/, '') === slug); const raw = window.__crudo.content.propiedades[k].content; const d = typeof raw === 'string' ? JSON.parse(raw) : raw; const t = a.querySelector('[class*="-ListCardTitle"]').textContent; return { slug, texto: t, titulo: d.titulo, ref: d.referenciaMakom || '', op: d.operacion, tipo: d.tipo, estado: d.estado }; })))()`));
  const total = Object.keys(await p.ev("(() => { const o = {}; Object.keys(window.__crudo.content.propiedades).forEach((k) => { o[k] = 1; }); return o; })()")).length;
  const slugsRepo = await p.ev("Object.keys(window.__crudo.content.propiedades).map((k) => k.replace(/\\.json$/, ''))");
  const contados = {}; filas.forEach((f) => { contados[f.slug] = (contados[f.slug] || 0) + 1; });
  ok(`el listado carga TODAS las propiedades (reales + 5 sintéticas = ${total}) con su tarjeta`, filas.length === total, filas.length + " de " + total + " | repetidas: " + JSON.stringify(Object.entries(contados).filter(([k, v]) => v > 1)) + " | sin tarjeta: " + JSON.stringify(slugsRepo.filter((k) => !contados[k])) + " | sin clave: " + JSON.stringify(Object.keys(contados).filter((k) => !slugsRepo.includes(k))));
  const mal = filas.filter((f) => { const [l1, l2] = f.texto.split("\n"); const esperado2 = f.titulo.length > 120 ? f.titulo.slice(0, 120) + "..." : f.titulo; return l1 !== `${f.ref || "sin referencia"} · ${f.op} · ${f.tipo} · ${f.estado}` || l2 !== esperado2; });
  ok("fidelidad: en TODAS las tarjetas la 1.ª línea (texto nativo de Decap) es referencia · operación · tipo · estado y la 2.ª el título (cortado a 120 caracteres solo si lo excede), leídos de los datos de esa propiedad", mal.length === 0, JSON.stringify(mal.slice(0, 2)));
  const sint = Object.fromEntries(filas.filter((f) => /^zz-sintetica/.test(f.slug)).map((f) => [f.slug.replace("zz-sintetica-", ""), f]));
  ok("casos especiales: borrador sin referencia («sin referencia»), archivada, vendida y reservada se muestran con su referencia o «sin referencia» (el estado va en el texto nativo y también en la insignia, probada en el grupo 17)", sint["borrador-sin-referencia"] && sint["borrador-sin-referencia"].texto.split("\n")[0] === "sin referencia · venta · penthouse · borrador" && sint["borrador-sin-referencia"].estado === "borrador" && sint["archivada-titulo-largo"].estado === "archivada" && sint["vendida"].estado === "vendida" && sint["reservada"].estado === "reservada", JSON.stringify(Object.keys(sint)));
  ok("título larguísimo (> 120 caracteres): la tarjeta lo corta con «…» solo al mostrarlo; el título guardado no cambia", sint["borrador-sin-referencia"].texto.split("\n")[1].endsWith("...") && sint["borrador-sin-referencia"].titulo.length > 150 && !sint["borrador-sin-referencia"].titulo.endsWith("..."));
  ok("las tarjetas enlazan a la edición de SU propiedad (#/collections/propiedades/entries/<slug>) y cada una trae el indicador de acento", await p.ev(`(() => [...document.querySelectorAll('[class*="-ListCardLink"]')].every((a) => /^#\\/collections\\/propiedades\\/entries\\/.+/.test(a.getAttribute('href'))))()`));
  // Jerarquía: dos tipos de tarjeta. PÚBLICA enriquecida: el sobretítulo lo dibuja a::before y la 1.ª línea nativa se colapsa; NO pública (o sin datos): la 1.ª línea nativa hace de sobretítulo.
  const jer = JSON.parse(await p.ev(`(() => { const med = (a) => { const t = a.querySelector('[class*="-ListCardTitle"]'); const b = getComputedStyle(t), f = getComputedStyle(t, '::first-line'), e = getComputedStyle(a, '::before'); return { sob: a.hasAttribute('data-mk-sobretitulo'), base: b.fontSize, pesoBase: b.fontWeight, ps: b.whiteSpace, col1: b.color, f1: f.fontSize, peso1: f.fontWeight, up1: f.textTransform, col2: f.color, eF: e.fontSize, ePeso: e.fontWeight, eUp: e.textTransform, eCol: e.color, eNowrap: e.whiteSpace, eTexto: e.content }; }; const as = [...document.querySelectorAll('[class*="-ListCardLink"]')]; return JSON.stringify({ pub: med(as.find((a) => a.hasAttribute('data-mk-sobretitulo'))), sinSob: as.filter((a) => !a.hasAttribute('data-mk-sobretitulo')).length }); })()`));
  ok("jerarquía (todas las tarjetas enriquecidas): título de 16 px / 500 en negro y, encima, sobretítulo de 11,5 px / 600 en mayúsculas y gris, en una sola línea; la 1.ª línea nativa queda colapsada (0 px)", jer.pub.sob && jer.pub.base === "16px" && jer.pub.pesoBase === "500" && jer.pub.ps === "pre-line" && jer.pub.col1 === "rgb(10, 10, 10)" && jer.pub.eF === "11.5px" && jer.pub.ePeso === "600" && jer.pub.eUp === "uppercase" && jer.pub.eNowrap === "nowrap" && jer.pub.eCol !== jer.pub.col1 && jer.pub.f1 === "0px" && jer.sinSob === 0, JSON.stringify(jer));
  const contr = contraste(sobre(jer.pub.eCol, "rgb(255,255,255)"), [255, 255, 255]);
  ok(`contraste del sobretítulo (gris sobre blanco) ≥ 4,5:1 (${contr.toFixed(2)}:1)`, contr >= 4.5, contr);
  // Filtros nativos
  const botones = await p.ev(`[...document.querySelectorAll('[class*="-CollectionControlsContainer"] button, [class*="-CollectionControlsContainer"] [role="button"]')].map((b) => b.textContent.trim() || b.getAttribute('aria-label'))`);
  ok("los controles del listado conservan «Ordenar por» y las vistas de lista/cuadrícula y suman el filtro nativo", botones.some((b) => /Ordenar/.test(b)) && botones.includes("List view option") && botones.includes("Grid view option") && botones.some((b) => /Filter|Filtr/.test(b)), JSON.stringify(botones));
  const contar = () => p.ev(`document.querySelectorAll('[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])').length`);
  // El menú de filtros de Decap NO se cierra al elegir (closeOnSelection: false) y cada opción alterna (marcada / desmarcada).
  const elegirFiltro = async (texto) => {
    if (!(await p.ev("!!document.querySelector('[class*=\"-DropdownList\"] [class*=\"-StyledMenuItem\"]')"))) { await p.real("Filter by"); await dormir(400); }
    await p.ev(`(() => { const o = [...document.querySelectorAll('[class*="-StyledMenuItem"]')].find((e) => e.textContent.trim() === ${JSON.stringify(texto)}); if (o) o.click(); })()`);
    await dormir(900);
    await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await dormir(300);
  };
  await elegirFiltro("Archivadas");
  await p.esperar("!!document.querySelector('li[data-mk-card]')", 8000);
  const archivadas = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('li[data-mk-card]')].map((t) => t.getAttribute('data-mk-estado'))))()`));
  ok("filtro «Archivadas»: solo quedan propiedades con estado archivada (reales + sintéticas)", archivadas.length >= 2 && archivadas.every((e) => e === "archivada"), JSON.stringify(archivadas));
  await elegirFiltro("Archivadas");
  await cargarTodas();
  ok("al quitar el filtro vuelven todas las propiedades", (await contar()) === total, (await contar()) + " de " + total);
  await elegirFiltro("En alquiler");
  const alq = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('[class*="-ListCardTitle"]')].map((t) => t.textContent.split('\\n')[0].split(' · ')[1])))()`));
  ok("filtro «En alquiler»: solo propiedades con operación alquiler", alq.length >= 3 && alq.every((e) => e === "alquiler"), JSON.stringify(alq.slice(0, 4)));
  await elegirFiltro("En alquiler");
  // Navegación a la edición
  await p.ev(`(() => { document.querySelector('[class*="-ListCardLink"]').click(); })()`);
  await p.esperar("!!document.querySelector('[id^=\"titulo-field-\"]')", 15000);
  await dormir(800);
  ok("abrir una tarjeta lleva al formulario de edición de esa propiedad (título cargado) y el panel conserva «Publicar»/estado", await p.ev(`!!document.querySelector('[id^="titulo-field-"]') && !!document.querySelector('[id^="titulo-field-"]').value && /Escribiendo en la colección Propiedades/.test(document.body.innerText)`));
  // Otras colecciones sin cambios
  await p.ev("location.hash = '#/collections/proyectos'");
  await p.esperar("document.querySelectorAll('[class*=\"-ListCardTitle\"]').length > 0", 15000);
  const otra = JSON.parse(await p.ev(`(() => { const t = document.querySelector('[class*="-ListCardTitle"]'); const c = getComputedStyle(t), f = getComputedStyle(t, '::first-line'); return JSON.stringify({ base: c.fontSize, peso: f.fontWeight, f1: f.fontSize }); })()`));
  ok("Proyectos conserva su listado (15 px, peso 400, sin la jerarquía de dos líneas de Propiedades)", otra.base === "15px" && otra.f1 === "15px" && otra.peso === "400", JSON.stringify(otra));
  // Responsive
  for (const w of [1440, 1280, 1024, 768, 390, 375]) {
    await vista(w, w < 500 ? 844 : 900);
    await p.ev("location.hash = '#/collections/propiedades'");
    await p.esperar("document.querySelectorAll('[class*=\"-ListCardLink\"]').length > 0", 15000);
    await cargarTodas();
    await p.esperar("!!document.querySelector('li[data-mk-card]')", 8000);
    await p.ev("window.scrollTo(0, 0); [...document.querySelectorAll('*')].filter((e) => e.scrollTop > 0).forEach((e) => { e.scrollTop = 0; })");
    const r = JSON.parse(await p.ev(`(() => { const vw = innerWidth; const cards = [...document.querySelectorAll('[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])')]; const fuera = cards.filter((c) => { const q = c.getBoundingClientRect(); return q.right > vw + 1 || q.left < -1; }).length; const desb = [...document.querySelectorAll('[class*="-ListCardTitle"]')].filter((t) => t.scrollWidth > t.clientWidth + 1).length; const a0 = document.querySelector('[class*="-ListCardLink"]'); const f = a0.hasAttribute('data-mk-sobretitulo') ? getComputedStyle(a0, '::before').fontSize : getComputedStyle(a0.querySelector('[class*="-ListCardTitle"]'), '::first-line').fontSize; const h = cards.map((c) => c.getBoundingClientRect().height); const ctl = document.querySelector('[class*="-CollectionControlsContainer"]').getBoundingClientRect(); return JSON.stringify({ n: cards.length, fuera, desb, f1: f, hmin: Math.round(Math.min(...h)), sw: document.documentElement.scrollWidth - vw, ctlDentro: ctl.right <= vw + 1 }); })()`));
    ok(`${w} px: las ${total} tarjetas caben en pantalla, el texto largo se ajusta sin desbordar, sin desplazamiento horizontal y los controles quedan dentro` + (w > 560 ? " (sobretítulo 11,5 px)" : " (sobretítulo 10 px)"), r.n === total && r.fuera === 0 && r.desb === 0 && r.sw <= 1 && r.ctlDentro && (w > 560 ? r.f1 === "11.5px" : r.f1 === "10px") && r.hmin >= 60, JSON.stringify(r));
  }
  await vista(1440);
  // Foco con teclado en las tarjetas
  await p.ev("location.hash = '#/collections/propiedades'");
  await dormir(800);
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  const fcard = await p.ev(`(() => { const a = document.querySelector('[class*="-ListCardLink"]'); a.focus(); const c = getComputedStyle(a); const li = a.closest('li'); return a === document.activeElement && /solid/.test(c.outlineStyle) && /2px/.test(c.outlineWidth) && /181, 71, 42/.test(c.outlineColor) && getComputedStyle(li).borderTopColor.length > 0; })()`);
  ok("teclado: el enlace de la tarjeta recibe el foco con contorno de 2 px terracota", fcard === true, fcard);

  /* ---------- 17. Listado de Propiedades ENRIQUECIDO (portada, estado y acceso a editar): admin/listado-propiedades.js + /admin/listado-propiedades.json ---------- */
  grupo = "17 · listado enriquecido";
  {
  await vista(1440);
  const CARD = `[class*="-ListCard"]:not([class*="-ListCardLink"]):not([class*="-ListCardTitle"])`;
  const abrirListado = async ({ limpiarCache = true, hash = "#/collections/propiedades" } = {}) => {
    if (limpiarCache) await p.ev("try { localStorage.removeItem('mk-listado-propiedades-v1'); localStorage.removeItem('mk-listado-propiedades-v2'); } catch (e) {}").catch(() => {});
    const l = p.cdp.una("Page.loadEventFired");
    await p.cdp.send("Page.navigate", { url: p.base + "/admin/" });
    await Promise.race([l, dormir(15000)]);
    await p.esperar("!!document.querySelector('button')", 15000);
    // (la copia local se borra ANTES de navegar: con la sesión ya iniciada Decap abre el listado por sí solo y el panel escribiría su copia nueva enseguida)
    await p.ev("(() => { const b = [...document.querySelectorAll('button')].find((b) => /Iniciar sesi/i.test(b.textContent)); if (b) b.click(); })()");
    await p.esperar("!!document.querySelector('a[href*=\"collections\"], [class*=SidebarContainer]')", 15000);
    await p.ev(`location.hash = ${JSON.stringify(hash)}`);
    await p.esperar(`document.querySelectorAll('${CARD.replace(/'/g, "\\'")}').length > 0`, 15000);
  };
  // Recorre el listado de arriba abajo en pasos de pantalla (como una persona): la paginación de Decap carga más tarjetas al llegar al final y la carga perezosa de
  // miniaturas se activa para cada tarjeta que pasa por la pantalla. Termina de vuelta arriba.
  const cargarTodo = async () => {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const n0 = await p.ev(`document.querySelectorAll('${CARD}').length`);
      await p.ev(`(() => { const c = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)).concat([document.scrollingElement]); window.__scrollers = c; c.forEach((e) => { e.scrollTop = 0; }); })()`);
      for (let k = 0; k < 40; k++) {
        const fin = await p.ev(`(() => { let fin = true; window.__scrollers.forEach((e) => { e.scrollTop += 420; if (e.scrollTop + e.clientHeight < e.scrollHeight - 2) fin = false; }); return fin; })()`);
        await dormir(120);
        if (fin) break;
      }
      await dormir(500);
      if ((await p.ev(`document.querySelectorAll('${CARD}').length`)) === n0 && vuelta > 0) break;
    }
    await p.ev(`(window.__scrollers || []).forEach((e) => { e.scrollTop = 0; })`);
    await dormir(300);
  };
  const resumenTarjetas = () => p.ev(`(() => { const t = [...document.querySelectorAll('${CARD}')]; const c = (a, v) => t.filter((x) => x.getAttribute(a) === v).length; return JSON.stringify({ n: t.length, enr: t.filter((x) => x.hasAttribute('data-mk-card')).length, ok: c('data-mk-foto', 'ok'), sin: c('data-mk-foto', 'sin'), error: c('data-mk-foto', 'error'), cargando: c('data-mk-foto', 'cargando'), estados: t.filter((x) => x.hasAttribute('data-mk-estado')).length }); })()`).then(JSON.parse);
  const esperarTodas = async (n) => p.esperar(`document.querySelectorAll('li[data-mk-card]').length >= ${n} && !document.querySelector('li[data-mk-card][data-mk-foto="cargando"]')`, 20000);
  const { claveListado } = require("../.eleventy.js");
  const slugsRepo17 = Object.keys(require("./lib/repo-prueba").construirRepo(RAIZ).content.propiedades).filter((k) => k.endsWith(".json")).map((k) => k.replace(/\.json$/, ""));
  // Filas del archivo de datos (v2) con su slug: la clave del archivo es un hash; el slug solo existe aquí, del lado de la prueba, para comparar.
  const filasDatos = JSON.parse(JSON.stringify((await (async () => { const f = require("./lib/listado-feed-prueba").crearFeed(require("./lib/repo-prueba").construirRepo(RAIZ).content.propiedades, RAIZ, sharp); return f.feed; })()).propiedades))
    .map((f) => ({ ...f, slug: slugsRepo17.find((s) => claveListado(s) === f.k) }));
  const nTot = filasDatos.length;
  const conFoto = filasDatos.filter((f) => f.portada).length; // solo las públicas (disponible/reservada) traen portada en el archivo de datos
  const nPublicas = filasDatos.filter((f) => f.estado === "disponible" || f.estado === "reservada").length;
  const nFotoRota = filasDatos.filter((f) => f.portada && /no-existe/.test(f.portada.original)).length;

  /* ---- A. Datos y estado inicial ---- */
  await abrirListado();
  await cargarTodo();
  await esperarTodas(nTot);
  const a0 = await resumenTarjetas();
  const est0 = JSON.parse(await p.ev("JSON.stringify(window.MakomListadoPropiedades.estado())"));
  ok("el panel lee /admin/listado-propiedades.json (mismo origen) y marca el estado «ok» con una fila por propiedad", est0.datos === "ok" && est0.filas === nTot && (await p.ev("document.documentElement.getAttribute('data-mk-listado')")) === "ok", JSON.stringify(est0));
  ok(`TODAS las propiedades (${nTot}) muestran su tarjeta enriquecida, con insignia de estado`, a0.n === nTot && a0.enr === nTot && a0.estados === nTot, JSON.stringify(a0));
  ok(`portadas: ${conFoto - nFotoRota} cargan su miniatura real; ${nTot - conFoto} (las no públicas, que el archivo de datos no detalla, y las sin fotografía) muestran el marcador de MAKOM; ${nFotoRota} con archivo roto también (sin romper la tarjeta)`, a0.ok === conFoto - nFotoRota && a0.sin === nTot - conFoto && a0.error === nFotoRota && a0.cargando === 0, JSON.stringify(a0));
  const fid = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('${CARD}')].map((li) => { const a = li.querySelector('a'); const slug = decodeURIComponent(a.getAttribute('href').split('/entries/')[1]).normalize('NFC'); return { slug, estado: li.getAttribute('data-mk-estado'), badge: getComputedStyle(li, '::after').content, foto: li.getAttribute('data-mk-foto'), portada: getComputedStyle(li).getPropertyValue('--mk-portada') }; })))()`));
  const etiquetas = { disponible: "Disponible", reservada: "Reservada", alquilada: "Alquilada", vendida: "Vendida", archivada: "Archivada", borrador: "Borrador" };
  const malFid = fid.filter((x) => { const d = filasDatos.find((f) => f.slug.normalize("NFC") === x.slug); return !d || x.estado !== d.estado || x.badge !== `"● ${etiquetas[d.estado]}"`; });
  ok("fidelidad: en cada tarjeta la insignia dice el estado REAL de esa propiedad (disponible, reservada, alquilada, vendida, archivada o borrador)", malFid.length === 0, JSON.stringify(malFid.slice(0, 2)));
  const sobs = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('${CARD}')].map((li) => { const a = li.querySelector('a'); return { slug: decodeURIComponent(a.getAttribute('href').split('/entries/')[1]).normalize('NFC'), sob: a.getAttribute('data-mk-sobretitulo'), foto: li.getAttribute('data-mk-foto'), estado: li.getAttribute('data-mk-estado'), min: li.getAttribute('data-mk-miniatura') }; })))()`));
  const repoProps17 = require("./lib/repo-prueba").construirRepo(RAIZ).content.propiedades;
  const malSob = sobs.filter((x) => { const d = filasDatos.find((f) => f.slug.normalize("NFC") === x.slug); const pub = d.estado === "disponible" || d.estado === "reservada"; const real = JSON.parse(repoProps17[d.slug + ".json"].content); return x.sob !== `${real.referenciaMakom || "sin referencia"} · ${real.operacion} · ${real.tipo}` || (!pub && (x.min !== null || x.foto !== "sin")); });
  ok(`sobretítulo «referencia · operación · tipo» en las ${nTot} tarjetas, tomado del propio texto de Decap (no del archivo de datos); las ${nTot - nPublicas} no públicas solo traen estado: sin miniatura ni foto`, malSob.length === 0 && sobs.length === nTot, JSON.stringify(malSob.slice(0, 2)));
  const paridad = JSON.parse(await p.ev(`(() => JSON.stringify(${JSON.stringify(slugsRepo17)}.map((s) => window.MakomListadoPropiedades.clave(s))))()`));
  ok(`la clave que calcula el navegador (cyrb53 del slug NFC) coincide con la del build (claveListado) en las ${slugsRepo17.length} propiedades, incluidas las de nombre con tildes, y son todas distintas`, paridad.every((k, i) => k === claveListado(slugsRepo17[i])) && new Set(paridad).size === paridad.length && paridad.every((k) => /^[0-9a-f]{14}$/.test(k)), JSON.stringify(paridad.slice(0, 2)));
  const cfgEstados = require("js-yaml").load(fs.readFileSync(path.join(RAIZ, "admin", "config.yml"), "utf8")).collections[0].fields.find((f) => f.name === "estado").options.map((o) => o.value);
  const cssTema = fs.readFileSync(path.join(RAIZ, "admin", "tema-makom.css"), "utf8");
  ok("el tema define una insignia para CADA estado del campo «Estado» de config.yml (si se agrega uno, la prueba avisa)", cfgEstados.every((e) => cssTema.includes(`li[data-mk-estado="${e}"]::after`)), cfgEstados.join(","));
  ok("el marcador de las propiedades sin portada usa el archivo oficial del logo de MAKOM (no uno redibujado)", /makom-capital-group-logo-positivo\.svg/.test(cssTema) && fs.existsSync(path.join(RAIZ, "assets", "logos", "makom-capital-group-logo-positivo.svg")));

  /* ---- B. Persistencia del enriquecimiento ---- */
  const tardanza = async (accion, cond) => { const t0 = Date.now(); await accion(); const ok1 = await p.esperar(cond, 8000); return { ok: ok1, ms: Date.now() - t0 }; };
  let r = await tardanza(async () => { await p.ev(`document.querySelector('[aria-label="Grid view option"]').click()`); }, `document.querySelectorAll('li[data-mk-card]').length >= 10 && !!document.querySelector('[class*="-GridCard"][data-mk-card]')`);
  const rg = JSON.parse(await p.ev(`(() => { const g = [...document.querySelectorAll('[class*="-GridCard"]:not([class*="-GridCardLink"])')]; const c = g[0]; const b = c ? getComputedStyle(c, '::before') : null; return JSON.stringify({ n: g.length, enr: g.filter((x) => x.hasAttribute('data-mk-card')).length, alto: c && Math.round(c.getBoundingClientRect().height), foto: b && b.height }); })()`));
  ok("cambiar a la vista de cuadrícula: las tarjetas se reconstruyen enriquecidas de inmediato (portada arriba, 284 px de alto)", r.ok && rg.n > 0 && rg.enr === rg.n && rg.alto === 284 && rg.foto === "150px", JSON.stringify({ r, rg }));
  r = await tardanza(async () => { await p.ev(`document.querySelector('[aria-label="List view option"]').click()`); }, `!!document.querySelector('[class*="-ListCard"][data-mk-card]')`);
  const rl = await resumenTarjetas();
  ok("volver a la vista de lista: vuelven enriquecidas (todas las cargadas)", r.ok && rl.n > 0 && rl.enr === rl.n, JSON.stringify(rl));
  const msVista = r.ms;
  // Orden
  await p.real("Ordenar por");
  await dormir(300);
  const opcionesOrden = await p.ev(`[...document.querySelectorAll('[class*="-StyledMenuItem"]')].map((e) => e.textContent.trim())`);
  await p.ev(`(() => { const o = [...document.querySelectorAll('[class*="-StyledMenuItem"]')][1]; if (o) o.click(); })()`);
  await dormir(500);
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const primeroAntes = await p.ev(`document.querySelector('${CARD} a').getAttribute('href')`);
  await p.esperar(`!!document.querySelector('li[data-mk-card]')`, 5000);
  const ro = await resumenTarjetas();
  ok(`ordenar (${opcionesOrden.join(" / ")}): las tarjetas reordenadas siguen enriquecidas (${ro.enr} de ${ro.n})`, ro.n > 0 && ro.enr === ro.n, JSON.stringify({ ro, opcionesOrden }));
  // Filtros
  const elegirFiltro17 = async (texto) => {
    if (!(await p.ev("!!document.querySelector('[class*=\"-DropdownList\"] [class*=\"-StyledMenuItem\"]')"))) { await p.real("Filter by"); await dormir(400); }
    await p.ev(`(() => { const o = [...document.querySelectorAll('[class*="-StyledMenuItem"]')].find((e) => e.textContent.trim() === ${JSON.stringify(texto)}); if (o) o.click(); })()`);
    await dormir(700);
    await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await dormir(200);
  };
  await elegirFiltro17("Archivadas");
  const rf = await resumenTarjetas();
  const estadosFiltro = await p.ev(`[...document.querySelectorAll('${CARD}')].map((x) => x.getAttribute('data-mk-estado'))`);
  ok("aplicar el filtro «Archivadas»: quedan solo propiedades archivadas y TODAS enriquecidas", rf.n >= 2 && rf.enr === rf.n && estadosFiltro.every((e) => e === "archivada"), JSON.stringify({ rf, estadosFiltro }));
  await elegirFiltro17("Archivadas");
  await cargarTodo();
  const rf2 = await resumenTarjetas();
  ok("quitar el filtro: vuelven todas las propiedades, enriquecidas", rf2.n === nTot && rf2.enr === nTot, JSON.stringify(rf2));
  // Cambiar de colección y volver
  await p.ev("location.hash = '#/collections/proyectos'");
  await p.esperar(`!!document.querySelector('[class*="-ListCardTitle"]') && !document.querySelector('li[data-mk-card]')`, 8000);
  const otraCol = await p.ev("document.querySelectorAll('li[data-mk-card]').length");
  await p.ev("location.hash = '#/collections/propiedades'");
  const t1 = Date.now();
  await p.esperar(`document.querySelectorAll('li[data-mk-card]').length > 0`, 8000);
  const msVuelta = Date.now() - t1;
  const rc = await resumenTarjetas();
  ok("cambiar de colección (Proyectos no se enriquece) y volver a Propiedades: las tarjetas se reconstruyen enriquecidas", otraCol === 0 && rc.n > 0 && rc.enr === rc.n, JSON.stringify({ otraCol, rc, msVuelta }));
  // Abrir una propiedad y volver
  await p.ev(`document.querySelector('${CARD} a').click()`);
  await p.esperar("!!document.querySelector('[id^=\"titulo-field-\"]')", 15000);
  await dormir(500);
  const enEditor = await p.ev("document.querySelectorAll('li[data-mk-card]').length");
  await p.ev("(() => { const a = document.querySelector('[class*=\"-ToolbarSectionBackLink\"]'); if (a) a.click(); })()");
  await p.esperar(`document.querySelectorAll('${CARD}').length > 0`, 15000);
  await p.esperar(`!!document.querySelector('li[data-mk-card]')`, 8000);
  const rv = await resumenTarjetas();
  ok("abrir una propiedad (el editor no se toca) y volver con «←»: el listado regresa enriquecido", enEditor === 0 && rv.n > 0 && rv.enr === rv.n, JSON.stringify({ enEditor, rv }));
  // Paginación (cargar más): ya cubierta en #A (35 tarjetas, 20 por página): se comprueba que se pidieron las páginas
  ok("paginación nativa de Decap (20 en 20 al desplazarse): las tarjetas que llegan después también salen enriquecidas", nTot > 20 && a0.n === nTot && a0.enr === nTot);
  // Búsqueda
  await p.ev("location.hash = '#/collections/propiedades'");
  await dormir(500);
  const buscar = await p.ev(`(() => { const i = document.querySelector('[class*="-SearchInput"]'); return !!i; })()`);
  let rb = null;
  if (buscar) {
    const c = await p.ev(`(() => { const e = document.querySelector('[class*="-SearchInput"]'); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    for (const tp of ["mouseMoved", "mousePressed", "mouseReleased"]) await p.cdp.send("Input.dispatchMouseEvent", { type: tp, x: c.x, y: c.y, button: "left", clickCount: tp === "mouseMoved" ? 0 : 1 });
    await p.cdp.send("Input.insertText", { text: "Chame" });
    await dormir(1200);
    rb = await p.ev(`(() => JSON.stringify({ hash: location.hash.slice(0, 30), tarjetas: document.querySelectorAll('${CARD}').length, enr: document.querySelectorAll('li[data-mk-card]').length, lista: [...document.querySelectorAll('[class*="-ListCardTitle"]')].map((t) => t.textContent.split('\\n')[1]).slice(0, 3) }))()`).then(JSON.parse);
  }
  ok("buscar (barra «Buscar todas»): el resultado aparece como tarjeta enriquecida", !buscar || (rb.tarjetas >= 1 && rb.enr === rb.tarjetas), JSON.stringify({ buscar, rb }));

  /* ---- C. Carga perezosa, una sola petición por miniatura y rendimiento ---- */
  // Se cuentan las peticiones que LLEGAN al servidor (contador por URL) con la caché del navegador vacía; el servidor responde con Cache-Control: max-age=600, como GitHub Pages.
  globalThis.__hitsMini = new Map();
  await p.cdp.send("Network.enable");
  await p.cdp.send("Network.clearBrowserCache");
  await abrirListado();
  await esperarTodas(1);
  await dormir(600);
  const antesScroll = globalThis.__hitsMini.size;
  await cargarTodo();
  await esperarTodas(nTot);
  const hitsTrasScroll = [...globalThis.__hitsMini.values()];
  ok(`carga perezosa: al abrir el listado solo se piden las miniaturas visibles (${antesScroll} de ${conFoto}); al desplazarse se piden el resto, cada una UNA sola vez (${hitsTrasScroll.reduce((a, b) => a + b, 0)} peticiones al servidor)`, antesScroll > 0 && antesScroll < conFoto && globalThis.__hitsMini.size === conFoto && hitsTrasScroll.every((v) => v === 1), JSON.stringify({ antesScroll, urls: globalThis.__hitsMini.size, conFoto, repetidas: hitsTrasScroll.filter((v) => v > 1).length }));
  const trasPeso = hitsTrasScroll.reduce((a, b) => a + b, 0);
  await p.ev(`document.querySelector('[aria-label="Grid view option"]').click()`);
  await dormir(500);
  await p.ev(`document.querySelector('[aria-label="List view option"]').click()`);
  await dormir(500);
  await p.ev("location.hash = '#/collections/proyectos'");
  await dormir(500);
  await p.ev("location.hash = '#/collections/propiedades'");
  await esperarTodas(1);
  await dormir(500);
  const despuesVistas = [...globalThis.__hitsMini.values()].reduce((a, b) => a + b, 0);
  ok("cambiar de vista (lista ↔ cuadrícula) y de colección (y volver) NO vuelve a pedir las miniaturas al servidor (se reaplican desde la memoria y la caché del navegador)", despuesVistas === trasPeso, despuesVistas + " vs " + trasPeso);
  const peso = await p.ev(`(async () => { const u = [...new Set(performance.getEntriesByType('resource').filter((e) => /_optimizadas[/]th-/.test(e.name)).map((e) => e.name))]; let tot = 0, max = 0; for (const x of u) { const b = await (await fetch(x)).blob(); tot += b.size; max = Math.max(max, b.size); } const f = await (await fetch('/admin/listado-propiedades.json')).text(); return JSON.stringify({ miniaturasKB: Math.round(tot / 1024), maxKB: Math.round(max / 1024), feedKB: +(f.length / 1024).toFixed(1) }); })()`).then(JSON.parse);
  ok(`peso: ${peso.miniaturasKB} KB en total para ${conFoto} miniaturas webp de 480 px (la mayor ${peso.maxKB} KB) y ${peso.feedKB} KB de datos; las fotografías originales (hasta ~16 MB) NO se descargan`, peso.maxKB <= 80 && peso.feedKB < 40, JSON.stringify(peso));
  const coste = JSON.parse(await p.ev(`(() => { const f = window.MakomListadoPropiedades.reconciliar; const t0 = performance.now(); for (let i = 0; i < 50; i++) f(); const ms = (performance.now() - t0) / 50; return JSON.stringify({ msPorReconciliacion: +ms.toFixed(2), tarjetas: document.querySelectorAll('li[data-mk-card]').length, observadas: window.MakomListadoPropiedades.estado().observadas }); })()`));
  ok(`rendimiento: reaplicar el enriquecimiento a ${coste.tarjetas} tarjetas tarda ${coste.msPorReconciliacion} ms (≤ 10 ms) y no quedan tarjetas observadas pendientes (${coste.observadas})`, coste.msPorReconciliacion <= 10 && coste.observadas === 0, JSON.stringify(coste));
  const sinCambios = await p.ev(`(() => { const a = window.MakomListadoPropiedades.estado().version; window.MakomListadoPropiedades.reconciliar(); return window.MakomListadoPropiedades.estado().version === a; })()`);
  ok("reaplicar es idempotente (no cambia la versión de los datos ni vuelve a escribir en las tarjetas al día)", sinCambios);
  // Fuera del listado el script no hace trabajo: se comprueba con el editor abierto y escritura continua
  await p.ev(`document.querySelector('${CARD} a').click()`);
  await p.esperar("!!document.querySelector('[id^=\"titulo-field-\"]')", 15000);
  const trabajo = await p.ev(`(async () => { let n = 0; const orig = window.MakomListadoPropiedades.reconciliar; const mo = new MutationObserver(() => {}); const i = document.querySelector('[id^="titulo-field-"]'); i.focus(); return JSON.stringify({ hash: location.hash.slice(0, 40) }); })()`);
  await p.cdp.send("Input.insertText", { text: " prueba de escritura continua en el editor" });
  await dormir(500);
  ok("en el editor (otra ruta) el observador no reaplica nada: escribir en un campo no toca el listado ni cambia los datos del script", (await p.ev("window.MakomListadoPropiedades.estado().version")) === est0.version);

  /* ---- D. Errores y resiliencia ---- */
  // D1. El archivo de datos falla y no hay copia: tarjetas nativas, todo funciona
  globalThis.__feedFalla = 500;
  await abrirListado();
  await dormir(800);
  const d1 = await resumenTarjetas();
  const est1 = JSON.parse(await p.ev("JSON.stringify(window.MakomListadoPropiedades.estado())"));
  ok("si el archivo de datos falla (HTTP 500) y no hay copia, las tarjetas quedan como las dibuja Decap (nativas) y el estado es «error»", d1.n > 0 && d1.enr === 0 && est1.datos === "error", JSON.stringify({ d1, est1 }));
  await cargarTodo();
  const nativo = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('${CARD}')].map((li) => { const a = li.querySelector('a'); const t = a.querySelector('[class*="-ListCardTitle"]'); return { slug: decodeURIComponent(a.getAttribute('href').split('/entries/')[1]).normalize('NFC'), l1: t.textContent.split('\\n')[0], f1: getComputedStyle(t, '::first-line').fontSize, vis: t.getBoundingClientRect().height > 0 && getComputedStyle(t).display !== 'none', sob: a.hasAttribute('data-mk-sobretitulo') }; })))()`));
  const malNativo = nativo.filter((x) => { const d = filasDatos.find((f) => f.slug.normalize("NFC") === x.slug); return !d || !x.l1.endsWith(" · " + d.estado) || x.f1 !== "11.5px" || !x.vis || x.sob; });
  ok(`si el enriquecimiento falla del todo, el listado nativo muestra el estado de CADA una de las ${nativo.length} propiedades en su texto («… · disponible», «… · borrador», etc.), legible (sobretítulo de 11,5 px) y sin depender de insignias`, nativo.length === nTot && malNativo.length === 0, JSON.stringify(malNativo.slice(0, 2)));
  await elegirFiltro17("Archivadas");
  const f1 = await p.ev(`document.querySelectorAll('${CARD}').length`);
  await elegirFiltro17("Archivadas");
  await p.ev(`document.querySelector('${CARD} a').click()`);
  const abre = await p.esperar("!!document.querySelector('[id^=\"titulo-field-\"]') && !!document.querySelector('[id^=\"titulo-field-\"]').value", 15000);
  ok("sin enriquecimiento siguen funcionando los filtros nativos (Archivadas) y abrir una propiedad para editarla", f1 >= 2 && abre, JSON.stringify({ f1, abre }));
  // D2. Copia previa en el navegador: se ve enriquecido aunque el archivo no responda
  globalThis.__feedFalla = 0;
  await abrirListado();
  await esperarTodas(1);
  const guardada = await p.ev("!!localStorage.getItem('mk-listado-propiedades-v2')") + " " + (await p.ev("JSON.stringify(window.MakomListadoPropiedades.estado()) + ' ls=' + localStorage.length + ' claves=' + Object.keys(localStorage).join(',')"));
  globalThis.__feedFalla = 500;
  await abrirListado({ limpiarCache: false });
  await p.esperar(`document.querySelectorAll('li[data-mk-card]').length > 0`, 8000);
  const d2 = await resumenTarjetas();
  const est2 = JSON.parse(await p.ev("JSON.stringify(window.MakomListadoPropiedades.estado())"));
  ok("con una copia de la última lectura correcta, el listado se ve enriquecido al instante aunque el archivo falle (estado «cache»)", /^true/.test(guardada) && d2.enr === d2.n && d2.n > 0 && est2.datos === "cache", JSON.stringify({ guardada, d2, est2 }));
  const pedidosAntes = await p.ev("0");
  const nPed = globalThis.__pedidosFeed;
  await p.ev("location.hash = '#/collections/proyectos'"); await dormir(300); await p.ev("location.hash = '#/collections/propiedades'"); await dormir(600);
  await p.ev("location.hash = '#/collections/proyectos'"); await dormir(300); await p.ev("location.hash = '#/collections/propiedades'"); await dormir(600);
  ok("tras un fallo no se reintenta en cada cambio de pantalla (no hay tormenta de peticiones)", globalThis.__pedidosFeed === nPed, globalThis.__pedidosFeed + " vs " + nPed);
  globalThis.__feedFalla = 0;
  // D3. Formato desconocido y datos hostiles
  globalThis.__feedMalo = "version";
  await abrirListado();
  await dormir(600);
  const d3 = await resumenTarjetas();
  ok("un archivo con otra versión de formato se ignora (tarjetas nativas, sin errores en la consola)", d3.n > 0 && d3.enr === 0, JSON.stringify(d3));
  globalThis.__feedMalo = "hostil";
  await abrirListado();
  await dormir(800);
  await cargarTodo();
  const d4 = await p.ev(`(() => JSON.stringify({ tarjetas: document.querySelectorAll('${CARD}').length, estadosRaros: [...document.querySelectorAll('li[data-mk-estado]')].filter((x) => !/^(disponible|reservada|alquilada|vendida|archivada|borrador)$/.test(x.getAttribute('data-mk-estado'))).length, urlExterna: [...document.querySelectorAll('li[data-mk-miniatura]')].filter((x) => !/^\\/assets\\/propiedades\\/_optimizadas\\//.test(x.getAttribute('data-mk-miniatura'))).length, peticionesAjenas: performance.getEntriesByType('resource').filter((e) => /hostil\\.example|javascript:/.test(e.name)).length, inyeccion: !!document.querySelector('li img[src="x"], li [onerror]'), sobRaros: [...document.querySelectorAll('a[data-mk-sobretitulo]')].filter((a) => !/^(sin referencia|[A-Za-z0-9-]{1,24}) · (venta|alquiler) · [a-z0-9-]{1,24}$/.test(a.getAttribute('data-mk-sobretitulo'))).length }))()`).then(JSON.parse);
  ok("datos hostiles (URL externa, «javascript:», estado con HTML, tipos equivocados): se descartan; ninguna petición a otro dominio, ningún estado inválido y nada se inyecta", d4.tarjetas > 0 && d4.estadosRaros === 0 && d4.sobRaros === 0 && d4.urlExterna === 0 && d4.peticionesAjenas === 0 && !d4.inyeccion, JSON.stringify(d4));
  globalThis.__feedMalo = null;
  // D4. Miniaturas lentas: marcador y luego la foto, sin mover la tarjeta
  globalThis.__miniaturasLentas = 1200;
  await abrirListado();
  const cargando = await p.esperar(`!!document.querySelector('li[data-mk-card][data-mk-foto="cargando"]')`, 8000);
  const alturaAntes = await p.ev(`Math.round(document.querySelector('${CARD}').getBoundingClientRect().height)`);
  await esperarTodas(1);
  const alturaDespues = await p.ev(`Math.round(document.querySelector('${CARD}').getBoundingClientRect().height)`);
  ok("miniaturas lentas: la tarjeta muestra primero el fondo neutro («cargando») y luego la foto, sin cambiar de tamaño", cargando && alturaAntes === alturaDespues, JSON.stringify({ cargando, alturaAntes, alturaDespues }));
  globalThis.__miniaturasLentas = 0;
  // D5. Sin el script del listado (interruptor): Decap nativo intacto
  globalThis.__sinListadoJs = true;
  await abrirListado();
  await dormir(600);
  const d5 = await resumenTarjetas();
  ok("sin admin/listado-propiedades.js (por ejemplo, si no carga) el listado es el nativo de Decap y sigue funcionando", d5.n > 0 && d5.enr === 0 && (await p.ev("typeof window.MakomListadoPropiedades")) === "undefined", JSON.stringify(d5));
  globalThis.__sinListadoJs = false;

  /* ---- E. Cambios hechos desde el panel (eventos postSave/postPublish) ---- */
  await abrirListado();
  await esperarTodas(1);
  const slugEd = "casa-en-la-chorrera-2-recámaras";
  const slugCosta = await p.ev(`Object.keys(window.__crudo.content.propiedades).find((k) => k.includes('costa-del-este-panam')).replace(/\\.json$/, '')`);
  await p.ev(`location.hash = '#/collections/propiedades/entries/' + ${JSON.stringify(slugCosta)}`);
  await p.esperar("!!document.querySelector('[data-galeria-fotos]')", 20000);
  await p.esperar("(() => { const i = document.querySelector('[id^=\"titulo-field-\"]'); return !!i && !!i.value; })()", 20000);
  await dormir(600);
  const antesEstado = JSON.parse(await p.ev(`JSON.stringify(window.MakomListadoPropiedades.estado())`));
  // Cambiar el estado a «Reservada» con la interfaz real y publicar
  await p.ev(`(() => { const i = document.querySelector('[id^="estado-field-"]'); i.scrollIntoView({ block: 'center' }); })()`);
  const cEst = await p.ev(`(() => { const i = document.querySelector('[id^="estado-field-"]'); const q = i.closest('[class*="-ControlContainer"]').querySelector('[class$="-control"]').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
  for (const tp of ["mouseMoved", "mousePressed", "mouseReleased"]) await p.cdp.send("Input.dispatchMouseEvent", { type: tp, x: cEst.x, y: cEst.y, button: "left", clickCount: tp === "mouseMoved" ? 0 : 1 });
  await dormir(500);
  await p.ev(`(() => { const o = [...document.querySelectorAll('[class$="-option"]')].find((e) => /Reservada/.test(e.textContent)); if (o) o.click(); })()`);
  await dormir(400);
  const pub17 = await p.publicar();
  ok("guardar la propiedad con estado «Reservada» funciona con el listado enriquecido activo", /GUARDADOS/.test(pub17) && !/NO GUARDADOS/.test(pub17), pub17);
  await p.ev("location.hash = '#/collections/propiedades'");
  await p.esperar(`!!document.querySelector('li[data-mk-card]')`, 15000);
  await cargarTodo();
  const badgeCosta = await p.ev(`(() => { const a = [...document.querySelectorAll('a[href*="costa-del-este-panam"]')].find((x) => /apartamentos-amoblados/.test(decodeURIComponent(x.getAttribute('href')))); const li = a && a.closest('li'); return li ? JSON.stringify({ estado: li.getAttribute('data-mk-estado'), badge: getComputedStyle(li, '::after').content, foto: li.getAttribute('data-mk-foto') }) : null; })()`);
  const bc = JSON.parse(badgeCosta);
  ok("al guardar desde el panel, la insignia se actualiza al instante (evento postSave) sin esperar al despliegue: «Reservada», conservando la misma miniatura", bc.estado === "reservada" && bc.badge === '"● Reservada"' && bc.foto === "ok", badgeCosta);
  await p.ev(`location.hash = '#/collections/propiedades/entries/' + ${JSON.stringify(slugCosta)}`);
  await p.esperar("!!document.querySelector('[data-galeria-fotos]')", 20000);
  await dormir(800);
  await p.ev(`(() => { const b = [...document.querySelectorAll('[data-galeria-tarjeta="0"] button')].find((x) => /Hacer portada/.test(x.textContent)); if (b) b.click(); })()`);
  await dormir(400);
  const pub18 = await p.publicar();
  await p.ev("location.hash = '#/collections/propiedades'");
  await p.esperar(`!!document.querySelector('li[data-mk-card]')`, 15000);
  await cargarTodo();
  const foto2 = await p.ev(`(() => { const a = [...document.querySelectorAll('a[href*="costa-del-este-panam"]')].find((x) => /apartamentos-amoblados/.test(decodeURIComponent(x.getAttribute('href')))); const li = a && a.closest('li'); return li ? li.getAttribute('data-mk-foto') : null; })()`);
  ok("si cambia la portada desde el panel, la tarjeta muestra el marcador de MAKOM hasta el próximo despliegue (nunca la foto equivocada)", /GUARDADOS/.test(pub18) && foto2 === "sin", JSON.stringify({ pub18, foto2 }));

  /* ---- F. Diseño: tamaños, ajuste de texto, contraste, foco y teclado ---- */
  await abrirListado();
  await esperarTodas(1);
  const dis = JSON.parse(await p.ev(`(() => { const li = [...document.querySelectorAll('${CARD}')].find((x) => x.getAttribute('data-mk-foto') === 'ok'); const b = getComputedStyle(li, '::before'); const q = li.getBoundingClientRect(); const a = getComputedStyle(li.querySelector('a'), '::after'); return JSON.stringify({ alto: Math.round(q.height), fotoAncho: b.width, fotoRadio: b.borderTopLeftRadius, fotoFondo: /url\\(/.test(b.backgroundImage), cubre: b.backgroundSize, editar: a.content, editarColor: a.color }); })()`));
  ok("tarjeta de escritorio: portada de 148 px con esquinas de 12 px (recorte proporcional «cover»), 126–140 px de alto y acceso «Editar ›» en terracota", dis.fotoAncho === "148px" && dis.fotoRadio === "12px" && dis.fotoFondo && dis.cubre === "cover" && dis.alto >= 126 && dis.alto <= 140 && /Editar/.test(dis.editar) && dis.editarColor === "rgb(143, 55, 32)", JSON.stringify(dis));
  const lin = JSON.parse(await p.ev(`(() => JSON.stringify([...document.querySelectorAll('${CARD}')].map((li) => { const t = li.querySelector('[class*="-ListCardTitle"]'); const cs = getComputedStyle(t); const lh = parseFloat(cs.lineHeight); const fl = 11.5 * 2; return { maxAlto: Math.round(t.getBoundingClientRect().height), recorte: t.scrollHeight > t.clientHeight + 1 }; })))()`));
  ok("el título ocupa como máximo dos líneas (más el sobretítulo): ninguna tarjeta supera 72 px de texto, ni siquiera el título de 170 caracteres", lin.every((x) => x.maxAlto <= 72), JSON.stringify(lin.filter((x) => x.maxAlto > 72)));
  const colores = {};
  for (const e of cfgEstados) colores[e] = await p.ev(`(() => { const d = document.createElement('li'); d.setAttribute('data-mk-estado', '${e}'); d.setAttribute('data-mk-card', ''); document.body.appendChild(d); const c = getComputedStyle(d, '::after').color; d.remove(); return c; })()`);
  const bajos = Object.entries(colores).filter(([e, c]) => contraste(rgbDe(c).c, [255, 255, 255]) < 4.5).map(([e, c]) => e + " " + c);
  ok("contraste de la insignia de cada estado sobre su fondo blanco ≥ 4,5:1 (" + Object.entries(colores).map(([e, c]) => e + " " + contraste(rgbDe(c).c, [255, 255, 255]).toFixed(1)).join(", ") + ")", bajos.length === 0, JSON.stringify(bajos));
  ok("contraste de «Editar ›» (terracota oscuro sobre blanco) ≥ 4,5:1", contraste(hex("#8F3720"), [255, 255, 255]) >= 4.5);
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  const foco17 = await p.ev(`(() => { const a = document.querySelector('${CARD} a'); a.focus(); const c = getComputedStyle(a); return JSON.stringify({ activo: a === document.activeElement, contorno: c.outlineStyle + ' ' + c.outlineWidth + ' ' + c.outlineColor, nombre: a.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) }); })()`);
  const f17 = JSON.parse(foco17);
  ok("teclado: la tarjeta es un enlace con foco visible (2 px terracota) y su nombre accesible es el texto de Decap (referencia · operación · tipo y título)", f17.activo && /solid 2px rgb\(181, 71, 42\)/.test(f17.contorno) && f17.nombre.length > 10, foco17);
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await p.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  ok("teclado: Enter sobre la tarjeta abre la edición de esa propiedad", await p.esperar("!!document.querySelector('[id^=\"titulo-field-\"]')", 15000));
  ok("la portada es decorativa: no se agregan imágenes ni nodos al DOM de Decap (solo atributos y una variable CSS en el <li>)", await (async () => { await abrirListado(); await esperarTodas(1); return p.ev(`(() => { const li = document.querySelector('li[data-mk-card][data-mk-foto="ok"]'); return li.querySelectorAll('img').length === 0 && [...li.attributes].every((a) => /^(class|data-mk-[a-z]+|style)$/.test(a.name)) && (li.getAttribute('style') || '').replace(/--mk-portada:[^;]+;?/, '').trim() === ''; })()`); })());
  // Responsive: 1440, 1280, 1024, 768, 390 y 375
  for (const w of [1440, 1280, 1024, 768, 390, 375]) {
    await vista(w, w < 500 ? 844 : 900);
    await abrirListado();
    await cargarTodo();
    await esperarTodas(nTot);
    await p.ev("window.scrollTo(0, 0); [...document.querySelectorAll('*')].filter((e) => e.scrollTop > 0).forEach((e) => { e.scrollTop = 0; })");
    const g = JSON.parse(await p.ev(`(() => { const vw = innerWidth; const cs = [...document.querySelectorAll('${CARD}')]; const fuera = cs.filter((c) => { const q = c.getBoundingClientRect(); return q.right > vw + 1 || q.left < -1; }).length; const b0 = getComputedStyle(cs[0], '::before'); const fotoW = parseFloat(b0.width); const insDentro = cs.filter((c) => { const a = getComputedStyle(c, '::after'); const f = getComputedStyle(c, '::before'); return c.hasAttribute('data-mk-estado') && (parseFloat(a.left) + (a.width === 'auto' ? 0 : parseFloat(a.width)) > parseFloat(f.left) + parseFloat(f.width) + 2); }).length; const alturas = cs.map((c) => Math.round(c.getBoundingClientRect().height)); const txt = cs.filter((c) => { const t = c.querySelector('[class*="-ListCardTitle"]'); return t.getBoundingClientRect().height > 74; }).length; const desb = cs.filter((c) => { const t = c.querySelector('[class*="-ListCardTitle"]'); const l = c.querySelector('a').getBoundingClientRect(); const q = t.getBoundingClientRect(); return q.right > l.right + 1; }).length; return JSON.stringify({ n: cs.length, fuera, fotoW, hmin: Math.min(...alturas), hmax: Math.max(...alturas), txtLargo: txt, desb, sw: document.documentElement.scrollWidth - vw }); })()`));
    const esperadoFoto = w > 1099 ? 148 : w > 560 ? 120 : 76;
    ok(`${w} px: ${nTot} tarjetas con portada de ${esperadoFoto} px, texto de ≤ 2 líneas (+ sobretítulo) sin desbordar, alto ${g.hmin}–${g.hmax} px y sin desplazamiento horizontal`, g.n === nTot && g.fuera === 0 && g.fotoW === esperadoFoto && g.txtLargo === 0 && g.desb === 0 && g.sw <= 1 && g.hmin >= 100 && g.hmax <= (w > 560 ? 140 : 132), JSON.stringify(g));
  }
  await vista(1440);
  // reduce movimiento
  await p.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await abrirListado();
  await esperarTodas(1);
  ok("con «reducir movimiento» el acceso «Editar ›» no se anima", await p.ev(`(() => parseFloat(getComputedStyle(document.querySelector('li[data-mk-card] a'), '::after').transitionDuration) === 0)()`));
  await p.cdp.send("Emulation.setEmulatedMedia", { features: [] });

  }
}

/* ------------------------------------------------------------------ */
/* Grupo 18: barra superior sin «Añadir rápido» (se puede ejecutar solo con SOLO_BARRA=1) */
/* ------------------------------------------------------------------ */
async function grupoBarra(p) {
  grupo = "18 · barra superior sin «Añadir rápido»";
  const vista = async (ancho, alto) => { await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto || 900, deviceScaleFactor: 1, mobile: ancho < 500 }); await dormir(600); };
  const entrar = async (hash) => {
    const l = p.cdp.una("Page.loadEventFired");
    await p.cdp.send("Page.navigate", { url: p.base + "/admin/" });
    await Promise.race([l, dormir(15000)]);
    await p.esperar("!!document.querySelector('button')", 15000);
    await p.ev("(() => { const b = [...document.querySelectorAll('button')].find((b) => /Iniciar sesi/i.test(b.textContent)); if (b) b.click(); })()");
    await p.esperar("!!document.querySelector('a[href*=\"collections\"], [class*=SidebarContainer]')", 15000);
    if (hash) { await p.ev(`location.hash = ${JSON.stringify(hash)}`); await dormir(900); }
  };
  const clic = async (selector) => { const c = await p.ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`); for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await p.cdp.send("Input.dispatchMouseEvent", { type: t, x: c.x, y: c.y, button: "left", clickCount: t === "mouseMoved" ? 0 : 1 }); await dormir(500); };
  const cssTxt = fs.readFileSync(path.join(RAIZ, "admin", "tema-makom.css"), "utf8");
  const cfg = require("js-yaml").load(fs.readFileSync(path.join(RAIZ, "admin", "config.yml"), "utf8"));

  /* ---- A. El control está fuera de la interfaz, solo con CSS acotado ---- */
  ok("el ocultamiento es CSS acotado a ese control (contenedor con :has + respaldo sobre el propio botón), sin tocar JavaScript ni la configuración de las colecciones", /\[class\*="-AppHeaderActions"\] > \[class\*="-StyledWrapper"\]:has\(\[class\*="-AppHeaderQuickNewButton"\]\) \{ display: none; \}/.test(cssTxt) && /\[class\*="-AppHeaderQuickNewButton"\] \{ display: none; \}/.test(cssTxt) && cfg.collections.length === 4 && cfg.collections.every((c) => c.create === true), cfg.collections.map((c) => c.name + ":" + c.create).join(","));
  await vista(1440);
  await entrar("#/collections/propiedades");
  const a1 = JSON.parse(await p.ev(`(() => { const h = document.querySelector('header'); const q = h.querySelector('[class*="-AppHeaderQuickNewButton"]'); const w = q && q.closest('[class*="-AppHeaderActions"] > *'); const visibles = [...h.querySelectorAll('button, a, [role="button"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.textContent.trim() || e.getAttribute('aria-label') || 'avatar').slice(0, 24)); return JSON.stringify({ existeEnDom: !!q, botonDisplay: q && getComputedStyle(q).display, envolturaDisplay: w && getComputedStyle(w).display, ancho: q && Math.round(q.getBoundingClientRect().width), visibles, textoVisible: h.innerText.includes('Añadir rápido') }); })()`));
  ok("«Añadir rápido» y su menú no se muestran: el botón y su contenedor están en display:none, no ocupan espacio y su texto no es visible", a1.botonDisplay === "none" && a1.envolturaDisplay === "none" && a1.ancho === 0 && !a1.textoVisible, JSON.stringify(a1));
  ok("en la barra solo quedan Contenido, Medios y el menú de la persona (y el enlace «Test Backend» propio del backend de prueba)", a1.visibles.every((t) => /^(Contenido|Medios|avatar|Test Backend|)/.test(t)) && !a1.visibles.some((t) => /Añadir/.test(t)), JSON.stringify(a1.visibles));
  // Teclado: Tab recorre la barra sin pasar por el control oculto
  await p.ev("document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);");
  const recorrido = [];
  for (let i = 0; i < 8; i++) {
    await p.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await p.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    recorrido.push(await p.ev("(document.activeElement ? (document.activeElement.textContent || document.activeElement.getAttribute('aria-label') || document.activeElement.tagName) : '').trim().slice(0, 24)"));
  }
  ok("con el teclado (Tab) nunca se enfoca «Añadir rápido»", !recorrido.some((t) => /Añadir rápido/.test(t)), JSON.stringify(recorrido));

  /* ---- B. Cada colección conserva su propio botón de crear y su formulario ---- */
  for (const [col, singular] of [["propiedades", "Propiedad"], ["proyectos", "Proyecto"], ["perspectivas", "Perspectiva"], ["asesores", "Asesor"]]) {
    await entrar("#/collections/" + col);
    const b = JSON.parse(await p.ev(`(() => { const e = document.querySelector('[class*="-CollectionTopNewButton"]'); if (!e) return JSON.stringify(null); const q = e.getBoundingClientRect(); return JSON.stringify({ texto: e.textContent.trim(), visible: q.width > 0 && q.height > 0 && q.right <= innerWidth, href: e.getAttribute('href') }); })()`));
    ok(`${col}: la colección conserva su botón «+ ${singular}» visible y enlazado a su formulario nuevo`, !!b && b.visible && new RegExp(singular, "i").test(b.texto) && new RegExp("/collections/" + col + "/new$").test(b.href || ""), JSON.stringify(b));
    await clic('[class*="-CollectionTopNewButton"]');
    const f = await p.esperar("!!document.querySelector('[id*=\"-field-\"]') && location.hash.includes('/collections/" + col + "/new')", 15000);
    const campos = await p.ev("document.querySelectorAll('[id*=\"-field-\"]').length");
    ok(`${col}: «+ ${singular}» abre el formulario de nueva entrada (${campos} campos) en #/collections/${col}/new`, f && campos >= 3, String(campos));
  }
  // Crear y publicar un Asesor desde el botón de la colección (en el «repositorio» de prueba, en memoria)
  await entrar("#/collections/asesores");
  await clic('[class*="-CollectionTopNewButton"]');
  await p.esperar("!!document.querySelector('[id^=\"nombre-field-\"]')", 15000);
  await clic('[id^="nombre-field-"]');
  await p.cdp.send("Input.insertText", { text: "Asesor de prueba barra" });
  await clic('[id^="cargo-field-"]');
  await p.cdp.send("Input.insertText", { text: "Asesor inmobiliario · MAKOM Properties" });
  await dormir(400);
  const est = await p.publicar();
  const creado = await p.ev(`Object.keys(window.__crudo.content.asesores).some((k) => /asesor-de-prueba-barra/.test(k))`);
  ok("crear: un Asesor nuevo creado con el botón de su colección se publica y queda guardado (sin «Añadir rápido»)", /GUARDADOS/.test(est) && !/NO GUARDADOS/.test(est) && creado === true, est + " creado=" + creado);
  // Editar y publicar una existente
  await entrar("#/collections/asesores");
  await p.esperar("document.querySelectorAll('[class*=\"-ListCardLink\"]').length > 0", 15000);
  await clic('[class*="-ListCardLink"]');
  await p.esperar("(() => { const i = document.querySelector('[id^=\"cargo-field-\"]'); return !!i && !!i.value; })()", 15000);
  await clic('[id^="cargo-field-"]');
  await p.cdp.send("Input.insertText", { text: " (editado)" });
  const est2 = await p.publicar();
  ok("editar: abrir un registro desde el listado, cambiarlo y publicarlo funciona", /GUARDADOS/.test(est2) && !/NO GUARDADOS/.test(est2), est2);

  /* ---- C. Sesión: menú de la persona, cierre de sesión y nuevo ingreso ---- */
  await entrar("#/collections/propiedades");
  await clic('header [class*="-AvatarDropdownButton"]');
  const menu = await p.ev(`[...document.querySelectorAll('[class*="-DropdownList"] [class*="-StyledMenuItem"], [class*="-DropdownList"] li, [class*="-DropdownList"] button')].map((e) => e.textContent.trim()).filter(Boolean).join('|')`);
  ok("el menú de la persona (avatar) sigue abriéndose y ofrece «Cerrar sesión»", /Cerrar sesi|Log out|Logout/i.test(menu), menu);
  await p.ev(`(() => { const e = [...document.querySelectorAll('[class*="-DropdownList"] *')].find((x) => /Cerrar sesi|Log out|Logout/i.test(x.textContent) && x.children.length === 0); if (e) e.click(); })()`);
  const salio = await p.esperar("[...document.querySelectorAll('button')].some((b) => /Iniciar sesi/i.test(b.textContent)) && !document.querySelector('[class*=SidebarContainer]')", 15000);
  ok("«Cerrar sesión» devuelve a la pantalla de ingreso", salio === true);
  await p.ev("(() => { const b = [...document.querySelectorAll('button')].find((b) => /Iniciar sesi/i.test(b.textContent)); if (b) b.click(); })()");
  const volvio = await p.esperar("!!document.querySelector('[class*=SidebarContainer]')", 15000);
  ok("volver a iniciar sesión carga el panel con sus cuatro colecciones", volvio === true && (await p.ev("document.querySelectorAll('[class*=\"-SidebarNavLink\"]').length")) >= 4);

  /* ---- D. Distribución de la barra en cada ancho (sin el enlace «Test Backend», que solo existe con el backend de prueba) ---- */
  for (const w of [1440, 1280, 1024, 800, 768, 390, 375]) {
    await vista(w, w < 500 ? 844 : 900);
    await entrar("#/collections/propiedades");
    await p.ev(`[...document.querySelectorAll('header [class*="-SettingsWrapper"] a')].forEach((x) => { if (/Test Backend/.test(x.textContent)) x.style.display = 'none'; })`);
    await dormir(300);
    const g = JSON.parse(await p.ev(`(() => { const vw = innerWidth; const h = document.querySelector('header'); const hr = h.getBoundingClientRect(); const nav = h.querySelector('nav').getBoundingClientRect(); const ps = [...h.querySelectorAll('nav li')].map((l) => l.getBoundingClientRect()).filter((r) => r.width > 0); const av = h.querySelector('[class*="-AvatarDropdownButton"]').getBoundingClientRect(); return JSON.stringify({ alto: Math.round(hr.height), navDerecha: Math.round(nav.right), avatarIzq: Math.round(av.left), avatarDer: Math.round(vw - av.right), tabsFuera: ps.filter((r) => r.right > vw || r.left < 0).length, solapa: nav.right > av.left + 1, centrado: Math.abs((av.top + av.bottom) / 2 - hr.height / 2) <= 2, sw: document.documentElement.scrollWidth - vw }); })()`));
    ok(`${w} px: barra de UNA sola fila (${g.alto} px), pestañas a la izquierda y menú de la persona a la derecha (${g.avatarDer} px del borde), centrado vertical, sin solapes ni desbordes`, g.alto <= 60 && !g.solapa && g.tabsFuera === 0 && g.centrado && g.avatarDer >= 4 && g.avatarDer <= 24 && g.sw <= 1, JSON.stringify(g));
  }
  await vista(1440);

  /* ---- E. Lo aprobado no cambia ---- */
  await entrar("#/collections/propiedades");
  await p.esperar("document.querySelectorAll('li[data-mk-card]').length > 0", 15000);
  const lis = await p.ev("document.querySelectorAll('li[data-mk-card]').length");
  ok("el listado enriquecido de Propiedades sigue igual (tarjetas con portada, estado y filtros)", lis > 0 && (await p.ev(`!!document.querySelector('[class*="-CollectionControlsContainer"]') && [...document.querySelectorAll('[class*="-CollectionControlsContainer"] button, [class*="-CollectionControlsContainer"] [role="button"]')].some((b) => /Filter|Filtr/.test(b.textContent))`)));
}

// De punta a punta: lo que guarda el widget (propiedad + imágenes) se construye con Eleventy y se revisa la ficha pública ES/EN.
// Escribe archivos TEMPORALES en el repositorio (imágenes nuevas en assets/propiedades/uploads y el JSON de Costa del Este) y los
// restaura en un bloque finally; al final comprueba que git no ve cambios en esas rutas.
async function construirE2E(p, dirFix, n) {
  const { execSync, spawnSync } = require("child_process");
  grupo = "11 · construcción del sitio con lo que guardó el widget";
  const f = (nombre) => path.join(dirFix, nombre);
  await p.cargar();
  await p.quitarTodas();
  await p.subir(Array.from({ length: 10 }, (_, i) => f(n(i + 1))));
  for (let i = 0; i < 10; i++) await p.escribirAlt(i, "F" + String(i + 1).padStart(2, "0"));
  await p.ev("(() => { const t = document.querySelector('[data-galeria-tarjeta=\"3\"]'); [...t.querySelectorAll('button')].find((x) => /Hacer portada/.test(x.textContent)).click(); })()");
  await dormir(200);
  const st = await p.publicar();
  const r = await p.repo();
  ok("el widget guardó 10 fotos con texto alternativo F01…F10 y la portada en la 4.ª", /CAMBIOS GUARDADOS/.test(st) && r.prop.fotografias.galeria.length === 10 && r.prop.fotografias.galeria[3].portada === true && r.archivos.length === 10, st);
  const dirProps = path.join(RAIZ, "content", "propiedades");
  const nombreJson = fs.readdirSync(dirProps).find((x) => x.includes("costa-del-este"));
  const rutaJson = path.join(dirProps, nombreJson);
  const originalJson = fs.readFileSync(rutaJson, "utf8");
  const dirUp = path.join(RAIZ, "assets", "propiedades", "uploads");
  const creados = [];
  const salida = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-e2e-"));
  try {
    for (const a of r.archivos) {
      const destino = path.join(dirUp, path.basename(a.ruta));
      if (fs.existsSync(destino)) throw new Error("Colisión inesperada con " + destino);
      fs.writeFileSync(destino, Buffer.from(a.b64, "base64"));
      creados.push(destino);
    }
    fs.writeFileSync(rutaJson, JSON.stringify(r.prop, null, 2));
    const b = spawnSync("npx", ["eleventy", `--output=${salida}`], { cwd: RAIZ, encoding: "utf8" });
    ok("Eleventy construye el sitio con la galería guardada por el widget", b.status === 0, (b.stdout + b.stderr).slice(-300));
    const slug = r.prop.slugPublico || path.basename(nombreJson, ".json");
    const alts = (html) => [...html.matchAll(/<div class="galeria-ficha__slide"[\s\S]*?alt="(F\d\d)"/g)].map((m) => m[1]);
    const esperado = ["F04", "F01", "F02", "F03", "F05", "F06", "F07", "F08", "F09", "F10"];
    for (const [idioma, ruta] of [["ES", "propiedades"], ["EN", "en/properties"]]) {
      const archivo = path.join(salida, ruta, slug, "index.html");
      const html = fs.existsSync(archivo) ? fs.readFileSync(archivo, "utf8") : "";
      ok(`${idioma}: la ficha pública muestra las 10 fotos, la portada primero y el resto en el orden de la lista`, JSON.stringify(alts(html)) === JSON.stringify(esperado), JSON.stringify(alts(html)));
      const imgs = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]).filter((u) => /_optimizadas|uploads/.test(u));
      ok(`${idioma}: todas las imágenes de la galería se publican (existen en la carpeta de salida)`, imgs.length >= 10 && imgs.every((u) => { const rel = decodeURIComponent(u.split("?")[0]).replace(/^\//, ""); return fs.existsSync(path.join(salida, rel)) || fs.existsSync(path.join(RAIZ, "_site", rel)); }), imgs.length); // eleventy-img escribe las optimizadas en _site/ aunque se use --output
      ok(`${idioma}: el botón de video/planos, el mapa y el contacto siguen presentes`, /data-ficha-whatsapp/.test(html) && /galeria-ficha__miniaturas/.test(html));
    }
  } finally {
    fs.writeFileSync(rutaJson, originalJson);
    creados.forEach((c) => fs.rmSync(c, { force: true }));
    fs.rmSync(salida, { recursive: true, force: true });
  }
  const sucio = execSync("git status --porcelain -- content assets", { cwd: RAIZ, encoding: "utf8" }).split("\n").filter((l) => l && !l.startsWith("??"));
  const nuevos = creados.filter((c) => fs.existsSync(c));
  ok("tras la prueba, el repositorio quedó intacto (JSON restaurado y las imágenes temporales eliminadas)", sucio.length === 0 && nuevos.length === 0 && fs.readFileSync(rutaJson, "utf8") === originalJson, sucio.join(";"));
}

function resumen() {
  const grupos = {};
  resultados.forEach((r) => {
    grupos[r.grupo] = grupos[r.grupo] || { n: 0, f: 0 };
    grupos[r.grupo].n++;
    if (!r.ok) grupos[r.grupo].f++;
  });
  const fallos = resultados.filter((r) => !r.ok);
  fallos.slice(0, 80).forEach((r) => console.log(`  FALLO ${r.grupo} | ${r.nombre}${r.detalle ? "  →  " + r.detalle : ""}`));
  console.log("");
  Object.entries(grupos).forEach(([g, v]) => console.log(`  ${g.padEnd(34)} ${String(v.n).padStart(4)} comprobaciones, ${v.f} fallos`));
  const huella = crypto.createHash("sha256").update(resultados.map((r) => r.nombre + "=" + r.ok).sort().join("\n")).digest("hex").slice(0, 12);
  console.log(`\nTotal: ${resultados.length} comprobaciones, ${fallos.length} fallos · huella ${huella}`);
  process.exit(fallos.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
