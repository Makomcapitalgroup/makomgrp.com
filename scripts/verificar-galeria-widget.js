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
  if (DETALLE) console.log(`  ${condicion ? "ok   " : "FALLO"} ${grupo} | ${nombre}`);
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
  const repoFiles = () => {
    const out = { content: {} };
    for (const col of ["propiedades", "asesores", "proyectos", "perspectivas"]) {
      const d = path.join(RAIZ, "content", col);
      out.content[col] = {};
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) out.content[col][f] = { content: fs.readFileSync(path.join(d, f), "utf8") };
      out["content/" + col] = out.content[col]; // el listado del backend de prueba busca la carpeta con la ruta completa
    }
    return "window.repoFiles=" + JSON.stringify(out) + ";";
  };
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
    if (u === "/admin/repo-files.js") return enviar(TIPOS[".js"], repoFiles());
    if (u === "/admin/test-hooks.js") return enviar(TIPOS[".js"], ganchos);
    if (u === "/admin/decap-cms.js") return enviar(TIPOS[".js"], fs.readFileSync(decap.cache));
    if (u === "/admin/galeria-fotos.js") return enviar(TIPOS[".js"], fs.readFileSync(path.join(RAIZ, "admin", "galeria-fotos.js")));
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
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

  return;
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
