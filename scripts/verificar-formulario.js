#!/usr/bin/env node
"use strict";

/**
 * Batería: TODOS los controles que llevan al formulario de contacto (navegador real).
 *
 * Qué hace:
 *   1. AUDITORÍA ESTÁTICA (todas las páginas de _site/, ES y EN): localiza cada enlace cuyo destino es el formulario
 *      (cualquier href que resuelva a «#contacto» de la Home), lo clasifica por componente y página de origen, y comprueba
 *      que apunta a la Home de SU idioma, que ese destino existe y que contiene el formulario. También lista los controles
 *      con texto de contacto/solicitud cuyo destino es OTRO (WhatsApp, correo, catálogo…) para confirmar que son intencionales.
 *   2. PRUEBAS EN NAVEGADOR (Chrome real, clics reales con el ratón, sin atajos): por cada CTA elegido
 *        - abre la página de origen, prepara el control como lo haría una persona (menú móvil, panel flotante, menú de
 *          servicios, desplazarse hasta el pie…), hace clic y espera el ESTADO final (no un tiempo);
 *        - exige: página y versión de idioma correctas, «#contacto» en la URL, formulario presente, formulario COMPLETO dentro del
 *          área visible (por debajo del encabezado y por encima del botón flotante), campos sin tapar por nada y utilizables
 *          (se enfocan y aceptan texto), posición estable después de cargar todos los recursos, origen conservado (referrer)
 *          y parámetros de la URL conservados.
 *   3. ESCENARIOS: navegación directa (ES/EN, con y sin parámetros utm), recarga, pulsación repetida, historial
 *      atrás/adelante, teclado (Enter, foco, Tab), prefers-reduced-motion, menú móvil y panel flotante (se cierran), carga lenta y
 *      enlaces que NO deben tocarse (WhatsApp, correo, otras páginas).
 *   Cobertura de las pruebas en navegador: cada combinación (tipo de página × idioma × componente × ancho) y, además, el CTA
 *   principal de TODAS las páginas. Los demás ejemplares del mismo componente se comprueban en la auditoría estática.
 *
 * No envía nada: no se pulsa «enviar»; Meta Pixel / CAPI / CRM se bloquean en el propio navegador y la suite falla si se intenta.
 *
 * Uso:
 *   npm run build
 *   node scripts/verificar-formulario.js
 * Opciones:
 *   --anchos 1440,768,390,375   anchos a probar (por defecto esos cuatro)
 *   --solo estatica|cta|escenarios|lento
 *   --todos                     probar TODAS las páginas × TODOS sus CTA × todos los anchos (muy lento)
 *   --inventario <ruta.md>      escribir el inventario (tabla Markdown) con los resultados
 *   --fusionar a.json,b.json    (con --inventario) fusionar los volcados de ejecuciones por ancho y escribir el inventario, sin probar nada
 *   --json <ruta.json>          volcar las filas de resultado (para fusionar ejecuciones por ancho en paralelo)
 *   --detalle                   imprimir también lo que pasa
 * Código de salida: 0 sin fallos; 1 con fallos; 2 error de entorno.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nav = require("./lib/navegador");

const RAIZ = path.join(__dirname, "..");
const SITIO = nav.SITIO;

const TAMANOS = { 1440: 900, 768: 1024, 390: 844, 375: 812 };
const BLOQUEADOS = ["*facebook.net*", "*facebook.com*", "*fbcdn*", "*workers.dev*", "*supabase*"];
const PAGINAS_SIN_FORMULARIO_DE_ORIGEN = []; // todas las páginas deben poder llegar al formulario

/* ------------------------------------------------------------------ */
/* Argumentos                                                         */
/* ------------------------------------------------------------------ */

function leerArgumentos(argv) {
  const a = { anchos: [1440, 768, 390, 375], solo: null, todos: false, inventario: null, json: null, fusionar: null, detalle: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--anchos") a.anchos = argv[++i].split(",").map(Number);
    else if (k === "--solo") a.solo = argv[++i];
    else if (k === "--todos") a.todos = true;
    else if (k === "--inventario") a.inventario = argv[++i];
    else if (k === "--json") a.json = argv[++i];
    else if (k === "--fusionar") a.fusionar = argv[++i].split(",");
    else if (k === "--detalle") a.detalle = true;
    else throw new Error("Opción desconocida: " + k);
  }
  return a;
}

const resultados = [];
let grupo = "";
function ok(nombre, condicion, detalle) {
  resultados.push({ grupo, nombre, ok: !!condicion, detalle: condicion ? "" : String(detalle === undefined ? "" : detalle) });
  return !!condicion;
}

/* ------------------------------------------------------------------ */
/* Páginas y auditoría estática                                       */
/* ------------------------------------------------------------------ */

function recorrer(dir, salida) {
  salida = salida || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["admin", "vendor", "MAKOM_Logo_Files_v4.0", "_optimizadas"].includes(e.name)) continue;
      recorrer(p, salida);
    } else if (e.name.endsWith(".html")) salida.push(p);
  }
  return salida;
}

// Ruta pública de un archivo de _site/
function rutaDe(archivo) {
  let r = "/" + path.relative(SITIO, archivo).split(path.sep).join("/");
  r = r.replace(/index\.html$/, "");
  return r;
}

function idioma(ruta) {
  return ruta === "/en/" || ruta.startsWith("/en/") ? "en" : "es";
}

function tipoDePagina(ruta) {
  const r = ruta.replace(/^\/en\//, "/");
  if (r === "/") return "home";
  if (/^\/(aviso-legal|privacidad|legal-notice|privacy)\.html$/.test(r)) return "legal";
  if (r === "/propiedades/" || r === "/properties/") return "catalogo";
  if (/^\/(propiedades|properties)\/[^/]+\/$/.test(r)) return "ficha-propiedad";
  if (r === "/proyectos/" || r === "/projects/") return "proyectos";
  if (/^\/(proyectos|projects)\/[^/]+\/$/.test(r)) return "ficha-proyecto";
  if (r === "/perspectivas/" || r === "/insights/") return "perspectivas";
  if (/^\/(perspectivas|insights)\/[^/]+\/$/.test(r)) return "articulo";
  return "otra";
}

const FORMA_FORM = (ruta) => (idioma(ruta) === "en" ? "/en/" : "/");

// Resuelve un href igual que el navegador (sin depender del código del sitio)
function resolver(href, ruta) {
  try {
    return new URL(href, "http://x" + ruta);
  } catch (e) {
    return null;
  }
}
const esDestinoFormulario = (u) => !!u && u.hash === "#contacto" && /^\/(en\/)?(index\.html)?$/.test(u.pathname);

function componente(attrs, texto) {
  const cls = ((/class="([^"]*)"/.exec(attrs) || [])[1] || "").split(/\s+/).filter(Boolean);
  const id = (/\bid="([^"]*)"/.exec(attrs) || [])[1] || "";
  if (id === "hero-contact-form-link") return "hero-panel-formulario";
  if (id === "floating-contact-form-link") return "flotante-panel-formulario";
  const c = ["mega-menu__item", "header__nav-link", "mobile-menu__link", "footer__nav-link", "floating-contact__option", "link--arrow", "btn"].find((k) => cls.includes(k));
  return c || "otro(" + cls.join(".") + ")";
}

const TEXTO_CONTACTO = /contact|solicit|request|cotiz|consult|agend|hablemos|conversaci|conversation|asesor|advis|escr[ií]benos|write to us|get in touch|inform/i;

function auditarEstatica(paginas) {
  grupo = "auditoría estática";
  const ctas = [];
  const otros = new Map();
  const destinos = new Map();
  for (const pg of paginas) {
    for (const m of pg.html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const attrs = m[2];
      const texto = m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const href = (/href="([^"]*)"/.exec(attrs) || [])[1];
      if (m[1] === "a" && href !== undefined) {
        const u = resolver(href, pg.ruta);
        if (esDestinoFormulario(u)) {
          ctas.push({ origen: pg.ruta, tipo: pg.tipo, lang: pg.lang, comp: componente(attrs, texto), texto: texto.slice(0, 60), href });
          continue;
        }
      }
      if (TEXTO_CONTACTO.test(texto) && texto.length < 80) {
        const k = [pg.lang, m[1], href || "(botón)", texto.slice(0, 40)].join(" | ");
        if (!otros.has(k)) otros.set(k, { n: 0, ej: pg.ruta });
        otros.get(k).n++;
      }
    }
  }
  // Destino de cada CTA: la Home de su idioma, que existe y tiene el formulario
  const malos = [];
  for (const c of ctas) {
    const u = resolver(c.href, c.origen);
    let ruta = u.pathname.replace(/index\.html$/, "");
    const esperado = FORMA_FORM(c.origen);
    c.destino = ruta;
    if (ruta !== esperado) malos.push(`${c.origen} → ${c.href} (esperado ${esperado})`);
    const home = paginas.find((p) => p.ruta === esperado);
    if (!home || !/id="contacto"/.test(home.html) || !/id="contact-form"/.test(home.html)) malos.push(`${esperado} sin #contacto / #contact-form`);
    destinos.set(esperado, true);
  }
  ok(`${ctas.length} CTA al formulario auditados en ${new Set(ctas.map((c) => c.origen)).size} páginas: todos apuntan a la Home de su idioma, que contiene el formulario`, malos.length === 0, malos.slice(0, 4).join(" | "));
  const sinCta = paginas.filter((p) => p.tipo !== "home" && !ctas.some((c) => c.origen === p.ruta) && p.html.includes('id="header"'));
  ok("toda página con encabezado tiene al menos un acceso al formulario", sinCta.length === 0, sinCta.map((p) => p.ruta).slice(0, 4).join(", "));
  // Dentro de la Home los enlaces son «#contacto» (mismo documento); fuera, «/#contacto» o «/en/#contacto»
  const cruzados = ctas.filter((c) => (c.tipo === "home" ? !c.href.startsWith("#") && c.href !== FORMA_FORM(c.origen) + "#contacto" : c.href !== FORMA_FORM(c.origen) + "#contacto"));
  ok("los enlaces usan una forma conocida («#contacto» en la Home; «/#contacto» o «/en/#contacto» en el resto)", cruzados.length === 0, cruzados.slice(0, 3).map((c) => c.origen + " " + c.href).join(" | "));
  // ids únicos del destino
  for (const r of ["/", "/en/"]) {
    const h = paginas.find((p) => p.ruta === r).html;
    ok(`${r}: un único #contacto y un único #contact-form`, (h.match(/\sid="contacto"/g) || []).length === 1 && (h.match(/\sid="contact-form"/g) || []).length === 1);
  }
  return { ctas, otros };
}

/* ------------------------------------------------------------------ */
/* Selección de pruebas en navegador                                  */
/* ------------------------------------------------------------------ */

// Cada elemento: { origen, comp, texto, indice (n.º de orden entre los enlaces al formulario de esa página) }
function seleccionar(ctas, paginas, anchos, todos) {
  const porPagina = new Map();
  for (const c of ctas) {
    if (!porPagina.has(c.origen)) porPagina.set(c.origen, []);
    porPagina.get(c.origen).push(c);
  }
  const casos = [];
  const vistos = new Set();
  const tiposVistos = new Set();
  const repResumen = new Set();
  paginas.forEach((p) => {
    const k = p.tipo + "|" + p.lang;
    if (!tiposVistos.has(k) && porPagina.has(p.ruta)) {
      tiposVistos.add(k);
      repResumen.add(p.ruta);
    }
  });
  let rot = 0;
  for (const p of paginas) {
    const lista = porPagina.get(p.ruta);
    if (!lista) continue;
    const esRep = repResumen.has(p.ruta);
    // componentes únicos de la página (por componente + texto)
    const unicos = [];
    const clave = new Set();
    lista.forEach((c, i) => {
      const k = c.comp + "|" + c.texto + "|" + c.href;
      if (!clave.has(k)) {
        clave.add(k);
        unicos.push({ ...c, indice: i });
      }
    });
    for (const c of unicos) {
      const principal = c.comp === "header__nav-link" || c.comp === "mobile-menu__link";
      for (const w of anchos) {
        // Representantes y modo --todos: todos los componentes en todos los anchos. Resto de páginas: el CTA principal en todos los anchos.
        if (!(esRep || todos || principal)) continue;
        const k = [p.ruta, c.comp, c.texto, w].join("|");
        if (vistos.has(k)) continue;
        vistos.add(k);
        casos.push({ ...c, ancho: w, representante: esRep });
      }
    }
    rot++;
  }
  return casos;
}

/* ------------------------------------------------------------------ */
/* Ayudantes dentro de la página                                      */
/* ------------------------------------------------------------------ */

const AYUDANTES = `(() => {
  if (window.__f) return;
  const $ = (id) => document.getElementById(id);
  const f = (window.__f = {});
  f.IDS = ['field-nombre', 'field-email', 'field-telefono', 'field-servicio', 'form-submit'];
  f.cabecera = () => { const h = $('header'); return h ? Math.max(0, h.getBoundingClientRect().bottom) : 0; };
  f.flotanteActivo = () => {
    const fc = $('floating-contact'); if (!fc) return null;
    const cs = getComputedStyle(fc);
    if (fc.hasAttribute('inert') || cs.visibility !== 'visible' || cs.opacity !== '1') return null;
    const tg = $('floating-contact-toggle'); if (!tg) return null;
    const r = tg.getBoundingClientRect();
    return r.width > 0 ? r : null;
  };
  f.centro = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  // ¿Alguien tapa este control? (el elemento en su punto central debe ser él, un descendiente o parte de su misma fila de formulario)
  f.tapado = (el) => {
    let objetivo = el;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) { const c = el.closest('.form-field'); if (!c) return 'invisible'; objetivo = c; }
    const [x, y] = f.centro(objetivo);
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return 'fuera de la pantalla';
    const hit = document.elementFromPoint(x, y);
    if (!hit) return 'sin elemento';
    if (hit === objetivo || objetivo.contains(hit) || hit.contains(objetivo)) return null;
    const fila = el.closest('.form-field');
    if (fila && fila.contains(hit)) return null;
    return 'tapado por ' + (hit.id ? '#' + hit.id : hit.tagName.toLowerCase() + '.' + String(hit.className).split(' ')[0]);
  };
  f.medir = () => {
    const form = $('contact-form'); const sec = $('contacto');
    const m = { ruta: location.pathname, hash: location.hash, search: location.search, listo: document.readyState, referrer: document.referrer, scrollY: Math.round(scrollY), vh: innerHeight, vw: document.documentElement.clientWidth, docH: document.documentElement.scrollHeight };
    m.hayFormulario = !!form && !!sec;
    if (!form) return m;
    const r = form.getBoundingClientRect();
    m.cab = Math.round(f.cabecera());
    const fl = f.flotanteActivo();
    m.flotanteTop = fl ? Math.round(fl.top) : null;
    m.form = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), alto: Math.round(r.height) };
    const limiteInf = fl ? Math.min(innerHeight, fl.top) : innerHeight;
    m.completo = r.top >= m.cab - 0.5 && r.bottom <= limiteInf + 0.5 && r.left >= -0.5 && r.right <= m.vw + 0.5;
    m.bordeSuperior = r.top >= m.cab - 0.5 && r.top < innerHeight;
    m.campos = f.IDS.map((id) => { const el = $(id); return { id, tapado: el ? f.tapado(el) : 'no existe', usable: !!el && !el.disabled && !el.readOnly }; });
    const a = document.activeElement;
    m.foco = a ? (a.id || a.tagName.toLowerCase()) : null;
    m.focoEnSeccion = !!(a && sec.contains(a));
    return m;
  };
  f.animando = () => {
    const nodos = [$('floating-contact'), $('hero-contact'), $('contacto'), ...document.querySelectorAll('[data-reveal]')].filter(Boolean);
    return nodos.some((n) => n.getAnimations({ subtree: true }).some((a) => a.playState === 'running' || a.playState === 'pending'));
  };
  // Espera el ESTADO esperado (formulario completo y campos libres) estable N fotogramas, con la página cargada y sin animaciones.
  f.asentar = (limite, estable) => new Promise((resolve) => {
    const t0 = performance.now(); let n = 0; let ultimo = null;
    (function fot() {
      let m = null; try { m = f.medir(); } catch (e) { m = null; }
      const bien = m && m.hayFormulario && m.listo === 'complete' && m.completo && m.campos.every((c) => !c.tapado) && !f.animando();
      const k = m ? [m.scrollY, m.form && m.form.top, m.docH].join() : '';
      n = bien && k === ultimo ? n + 1 : 0; ultimo = k;
      if (n >= (estable || 25)) return resolve({ ok: true, m });
      if (performance.now() - t0 > (limite || 15000)) return resolve({ ok: false, m });
      requestAnimationFrame(fot);
    })();
  });
  // Estabilidad posterior: tras N fotogramas más (y con todo lo que haya terminado de cargar) la posición no cambia.
  f.estabilidad = (fotogramas) => new Promise((resolve) => {
    const a = f.medir(); let n = 0;
    (function fot() { if (++n >= (fotogramas || 45)) { const b = f.medir(); return resolve({ a, b }); } requestAnimationFrame(fot); })();
  });
  f.esperarFuentesEImagenes = () => Promise.all([document.fonts ? document.fonts.ready : null, ...[...document.images].filter((i) => i.loading !== 'lazy' || i.complete).map((i) => i.decode ? i.decode().catch(() => null) : null)]).then(() => true);
  // Tipea en el primer campo para comprobar que es utilizable (se deja vacío después)
  f.escribirPrueba = () => { const el = $('field-nombre'); el.focus({ preventScroll: true }); return document.activeElement === el; };
  f.valorNombre = () => $('field-nombre').value;
  f.limpiarNombre = () => { $('field-nombre').value = ''; };
  f.descripcion = () => {
    const selector = 'a[href]';
    const res = [];
    document.querySelectorAll(selector).forEach((a, i) => {
      let u = null; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) {}
      if (u && u.hash === '#contacto' && /^\\/(en\\/)?(index\\.html)?$/.test(u.pathname) && u.origin === location.origin) res.push(i);
    });
    return res;
  };
})();`;

/* ------------------------------------------------------------------ */
/* Navegador                                                          */
/* ------------------------------------------------------------------ */

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function crearNavegador(base, ancho, alto, opciones) {
  const cdp = await nav.lanzarChrome(nav.localizarChrome(process.env.CHROME_PATH));
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", { urls: BLOQUEADOS });
  const bloqueadas = [];
  cdp.on((m) => {
    if (m.method === "Network.responseReceived" && /facebook|fbcdn|workers\.dev|supabase/.test(m.params.response.url)) bloqueadas.push(m.params.response.url);
  });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: AYUDANTES });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 500 });
  if (opciones && opciones.movimientoReducido) await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const b = { cdp, base, ancho, alto, bloqueadas };
  b.ev = async (expr, reintentos) => {
    for (let i = 0; i <= (reintentos === undefined ? 40 : reintentos); i++) {
      try {
        const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
        return r.result.value;
      } catch (e) {
        if (!/Cannot find context|Execution context|navigat|destroyed|Inspected target/i.test(String(e.message)) || i === (reintentos === undefined ? 40 : reintentos)) throw e;
        await dormir(50);
      }
    }
  };
  b.ir = async (ruta) => {
    const l = cdp.una("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: base + ruta });
    await Promise.race([l, dormir(25000)]);
  };
  b.recargar = async () => {
    const l = cdp.una("Page.loadEventFired");
    await cdp.send("Page.reload");
    await Promise.race([l, dormir(25000)]);
  };
  b.atras = async () => {
    const h = await cdp.send("Page.getNavigationHistory");
    if (h.currentIndex === 0) return false;
    const l = cdp.una("Page.loadEventFired");
    await cdp.send("Page.navigateToHistoryEntry", { entryId: h.entries[h.currentIndex - 1].id });
    await Promise.race([l, dormir(8000)]);
    return true;
  };
  b.adelante = async () => {
    const h = await cdp.send("Page.getNavigationHistory");
    if (h.currentIndex >= h.entries.length - 1) return false;
    const l = cdp.una("Page.loadEventFired");
    await cdp.send("Page.navigateToHistoryEntry", { entryId: h.entries[h.currentIndex + 1].id });
    await Promise.race([l, dormir(8000)]);
    return true;
  };
  b.clicEn = async (x, y) => {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  b.tecla = async (key, code, vk, texto) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, text: texto });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  };
  b.cerrar = () => cdp.cerrar();
  return b;
}

// Coordenadas del centro de un control visible (tras traerlo a la vista sin animación)
async function centroDe(b, expr) {
  return b.ev(`(() => {
    const el = ${expr}; if (!el) return null;
    const cs = getComputedStyle(el);
    const raiz = document.documentElement; const previo = raiz.style.scrollBehavior; raiz.style.scrollBehavior = 'auto';
    el.scrollIntoView({ block: 'center', inline: 'nearest' }); raiz.style.scrollBehavior = previo;
    // Un enlace con el texto en varias líneas tiene varios rectángulos: se pulsa el más grande (donde de verdad está el texto).
    const rs = [...el.getClientRects()].filter((q) => q.width > 0 && q.height > 0).sort((a, b) => b.width * b.height - a.width * a.height);
    const r = rs[0] || el.getBoundingClientRect();
    const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[inert]');
    return { visible, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Prueba de un CTA                                                   */
/* ------------------------------------------------------------------ */

async function esperarAsentada(b, limite) {
  const r = await b.ev(`window.__f.asentar(${limite || 15000}, 25)`, 80);
  return r;
}

async function validarLlegada(b, caso, etiqueta, esperadoRuta, opciones) {
  const opc = opciones || {};
  const as = await esperarAsentada(b, opc.limite);
  const m = as.m || {};
  const nombre = (t) => `${etiqueta} → ${t}`;
  const lleno = !!as.ok;
  ok(nombre("llega a la página correcta (" + esperadoRuta + ") con #contacto"), decodeURIComponent(m.ruta || "") === esperadoRuta && m.hash === "#contacto", `${m.ruta}${m.hash}`);
  ok(nombre("el formulario existe"), m.hayFormulario === true);
  ok(nombre("el formulario COMPLETO queda a la vista (bajo el encabezado y sobre el botón flotante)"), m.completo === true, JSON.stringify({ form: m.form, cab: m.cab, flotanteTop: m.flotanteTop, vh: m.vh }));
  ok(nombre("ningún campo queda tapado (encabezado, botón flotante u otro)"), !(m.campos || []).some((c) => c.tapado), JSON.stringify((m.campos || []).filter((c) => c.tapado)));
  ok(nombre("campos utilizables (habilitados y sin solo lectura)"), (m.campos || []).every((c) => c.usable));
  if (!lleno) return m;
  // Estabilidad: la posición no cambia después de asentarse (ni al terminar de cargar fuentes e imágenes)
  await b.ev("window.__f.esperarFuentesEImagenes()", 40);
  const est = await b.ev("window.__f.estabilidad(45)", 40);
  const mover = Math.abs(est.a.scrollY - est.b.scrollY) + Math.abs(est.a.form.top - est.b.form.top);
  ok(nombre("posición estable después de cargar los recursos"), mover <= 1 && est.b.completo === true, JSON.stringify({ antes: est.a.form, despues: est.b.form, y: [est.a.scrollY, est.b.scrollY] }));
  // Utilizable de verdad: se enfoca y acepta texto
  const enfocado = await b.ev("window.__f.escribirPrueba()");
  await b.cdp.send("Input.insertText", { text: "Prueba" });
  const valor = await b.ev("window.__f.valorNombre()");
  await b.ev("window.__f.limpiarNombre()");
  ok(nombre("el primer campo se enfoca y acepta texto"), enfocado === true && valor === "Prueba", `${enfocado}/${valor}`);
  const despues = await b.ev("window.__f.medir()");
  // ≤ 3 px: tolerancia al anclaje de scroll NATIVO del navegador cuando el mensaje de validación de un campo aparece o desaparece (±1 px de alto).
  ok(nombre("al enfocar y escribir en un campo la página no salta"), Math.abs(despues.scrollY - est.b.scrollY) <= 3, `${est.b.scrollY}→${despues.scrollY}`);
  return m;
}

async function prepararYClicar(b, caso, esDesdeMovil) {
  // Devuelve { estado: 'ok' | 'no-visible' | 'tapado', detalle }
  // El control se localiza por componente + texto (no por posición): el script de la Home sustituye algunos marcadores del HTML
  // estático (p. ej. las tarjetas de proyectos), así que el orden del HTML no coincide con el del DOM ya ejecutado.
  const sel = `(() => {
    const norm = (t) => t.replace(/\\s+/g, '');
    const comp = ${JSON.stringify(caso.comp)};
    const texto = norm(${JSON.stringify(caso.texto)});
    return [...document.querySelectorAll('a[href]')].find((a) => {
      let u = null; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) {}
      if (!(u && u.hash === '#contacto' && /^\\/(en\\/)?(index\\.html)?$/.test(u.pathname) && u.origin === location.origin)) return false;
      const compOk = comp === 'hero-panel-formulario' ? a.id === 'hero-contact-form-link' : comp === 'flotante-panel-formulario' ? a.id === 'floating-contact-form-link' : a.classList.contains(comp);
      return compOk && norm(a.textContent).startsWith(texto);
    });
  })()`;
  const info = await b.ev(`(() => { const a = ${sel}; if (!a) return null; return { id: a.id, cls: a.className, panel: a.closest('#mobile-menu') ? 'movil' : a.closest('#mega-menu') ? 'mega' : a.closest('#floating-contact-panel') ? 'flotante' : a.closest('#hero-contact-panel') ? 'hero' : 'pagina' }; })()`);
  if (!info) return { estado: "no-existe", detalle: "no existe en el DOM tras ejecutar el JS (marcador del HTML que el script sustituye)" };
  // Preparación como una persona
  if (info.panel === "movil") {
    const abierto = await b.ev("document.getElementById('mobile-menu').classList.contains('is-open')");
    if (!abierto) {
      const c = await centroDe(b, "document.getElementById('hamburger')");
      if (!c || !c.visible) return { estado: "no-visible", detalle: "el menú móvil no existe a este ancho" };
      await b.clicEn(c.x, c.y);
      await b.ev("new Promise(r => { const t0 = performance.now(); (function f(){ const m = document.getElementById('mobile-menu'); if (m.classList.contains('is-open') && !m.getAnimations({subtree:true}).some(a => a.playState === 'running')) return r(true); if (performance.now()-t0 > 4000) return r(false); requestAnimationFrame(f); })(); })");
    }
  } else if (info.panel === "mega") {
    const disp = await b.ev("(() => { const t = document.querySelector('[aria-controls=\"mega-menu\"]'); if (!t) return false; const r = t.getBoundingClientRect(); return r.width > 0; })()");
    if (!disp) return { estado: "no-visible", detalle: "el menú de servicios no existe a este ancho" };
    // El menú de servicios se abre al pasar el puntero (con 100 ms de intención); un clic en «Servicios» fuera de la Home navega.
    const c = await centroDe(b, "document.querySelector('[aria-controls=\"mega-menu\"]')");
    await b.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    await b.ev("new Promise(r => { const t0 = performance.now(); (function f(){ const t = document.querySelector('[aria-controls=\"mega-menu\"]'); if (t.getAttribute('aria-expanded') === 'true' && !document.getElementById('mega-menu').getAnimations({subtree:true}).some(a => a.playState === 'running')) return r(true); if (performance.now()-t0 > 4000) return r(false); requestAnimationFrame(f); })(); })");
  } else if (info.panel === "flotante" || info.panel === "hero") {
    const ptog = info.panel === "hero" ? "hero-contact-toggle" : "floating-contact-toggle";
    if (info.panel === "flotante") {
      // En la Home el flotante entra al salir el CTA del Hero de la pantalla, y en las fichas se aparta mientras tapa la galería: se baja un poco (como haría una persona).
      await b.ev("(() => { const r = document.documentElement; r.style.scrollBehavior='auto'; scrollTo(0, 1600); r.style.scrollBehavior=''; })()");
      const activo = await b.ev("new Promise(r => { const t0 = performance.now(); (function f(){ if (window.__f.flotanteActivo()) return r(true); if (performance.now()-t0 > 4000) return r(false); requestAnimationFrame(f); })(); })");
      if (!activo) return { estado: "no-visible", detalle: "el botón flotante no está activo" };
    }
    const c = await centroDe(b, `document.getElementById('${ptog}')`);
    if (!c || !c.visible) return { estado: "no-visible", detalle: "el botón de contacto no está visible" };
    await b.clicEn(c.x, c.y);
    await b.ev(`new Promise(r => { const t0 = performance.now(); (function f(){ const t = document.getElementById('${ptog}'); if (t.getAttribute('aria-expanded') === 'true' && !document.querySelector('#${info.panel === "hero" ? "hero-contact" : "floating-contact"}').getAnimations({subtree:true}).some(a => a.playState === 'running')) return r(true); if (performance.now()-t0 > 4000) return r(false); requestAnimationFrame(f); })(); })`);
  }
  const c = await centroDe(b, sel);
  if (!c || !c.visible) return { estado: "no-visible", detalle: "el control no es visible a este ancho" };
  // Dejar que se asienten las animaciones de entrada antes de calcular el punto
  await b.ev("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
  const c2 = await centroDe(b, sel);
  const tapa = await b.ev(`(() => { const a = ${sel}; const h = document.elementFromPoint(${c2.x}, ${c2.y}); return h && (h === a || a.contains(h)) ? null : (h ? (h.id ? '#' + h.id : h.tagName.toLowerCase() + '.' + String(h.className).split(' ')[0]) : 'nada'); })()`);
  if (tapa) return { estado: "tapado", detalle: "tapado por " + tapa };
  await b.clicEn(c2.x, c2.y);
  return { estado: "ok" };
}

/* ------------------------------------------------------------------ */
/* Pruebas de CTA                                                     */
/* ------------------------------------------------------------------ */

async function pruebasCta(base, casos, ancho, informe) {
  const alto = TAMANOS[ancho];
  const b = await crearNavegador(base, ancho, alto);
  try {
    for (const caso of casos.filter((c) => c.ancho === ancho)) {
      grupo = `CTA ${ancho}px`;
      const etiqueta = `${caso.origen} [${caso.comp}: «${caso.texto}»] @${ancho}`;
      const fila = { origen: caso.origen, tipo: caso.tipo, lang: caso.lang, comp: caso.comp, texto: caso.texto, ancho, destino: FORMA_FORM(caso.origen) + "#contacto", resultado: "", detalle: "" };
      informe.push(fila);
      if (informe.length % 10 === 0) console.error(`  … ${informe.length} navegaciones (${ancho}px)`);
      try {
        await b.ir(caso.origen);
        await b.ev("window.__f && true");
        const antes = resultados.length;
        const pr = await prepararYClicar(b, caso, ancho < 1024);
        if (pr.estado === "no-visible" || pr.estado === "no-existe") {
          fila.resultado = "n/a";
          fila.detalle = pr.detalle || pr.estado;
          continue;
        }
        if (!ok(etiqueta + " → el control se puede pulsar (no queda tapado)", pr.estado === "ok", pr.detalle)) {
          fila.resultado = "FALLA";
          fila.detalle = pr.detalle;
          continue;
        }
        const esperado = FORMA_FORM(caso.origen);
        // Esperar a estar en la página de destino con #contacto (navegación o mismo documento)
        const llegado = await b.ev(`new Promise(r => { const t0 = performance.now(); (function f(){ if (location.pathname === ${JSON.stringify(esperado)} && location.hash === '#contacto' && document.readyState !== 'loading') return r(true); if (performance.now()-t0 > 20000) return r(false); setTimeout(f, 30); })(); })`, 200);
        const m = await validarLlegada(b, caso, etiqueta, esperado);
        // Origen conservado (referrer) cuando se navega desde otra página
        if (caso.origen !== esperado) {
          let refPath = null;
          try { refPath = decodeURIComponent(new URL(m.referrer).pathname); } catch (e) { /* sin referrer */ }
          ok(etiqueta + " → conserva el origen (document.referrer = página de origen)", refPath === caso.origen, m.referrer);
        }
        const fallos = resultados.slice(antes).filter((r) => !r.ok);
        fila.resultado = fallos.length ? "FALLA" : "OK";
        if (fallos.length) fila.detalle = fallos[0].nombre.replace(etiqueta + " → ", "") + (fallos[0].detalle ? " (" + fallos[0].detalle.slice(0, 120) + ")" : "");
        if (!llegado) fila.detalle = (fila.detalle ? fila.detalle + "; " : "") + "no llegó a " + esperado + "#contacto";
      } catch (e) {
        ok(etiqueta + " → sin errores de ejecución", false, e.message.slice(0, 200));
        fila.resultado = "FALLA";
        fila.detalle = "error: " + e.message.slice(0, 120);
      }
    }
    informe.bloqueadas = (informe.bloqueadas || []).concat(b.bloqueadas);
  } finally {
    await b.cerrar();
  }
}

/* ------------------------------------------------------------------ */
/* Escenarios                                                         */
/* ------------------------------------------------------------------ */

const FICHA_ES = (paginas) => (paginas.find((p) => p.tipo === "ficha-propiedad" && p.lang === "es") || {}).ruta;
const FICHA_EN = (paginas) => (paginas.find((p) => p.tipo === "ficha-propiedad" && p.lang === "en") || {}).ruta;

async function enlacePrincipal(b, ancho) {
  // «Contacto» de la cabecera (≥1024) o del menú móvil (<1024): devuelve un selector JS del enlace
  return ancho >= 1024 ? "document.querySelector('.header__nav-link--cta, a.header__nav-link[href$=\"#contacto\"]')" : "document.querySelector('#mobile-menu a[href$=\"#contacto\"]')";
}

async function clicPrincipal(b, ancho) {
  if (ancho < 1024) {
    const c = await centroDe(b, "document.getElementById('hamburger')");
    await b.clicEn(c.x, c.y);
    await b.ev("new Promise(r => { const t0 = performance.now(); (function f(){ const m = document.getElementById('mobile-menu'); if (m.classList.contains('is-open') && !m.getAnimations({subtree:true}).some(a => a.playState === 'running')) return r(true); if (performance.now()-t0 > 4000) return r(false); requestAnimationFrame(f); })(); })");
  }
  const sel = await enlacePrincipal(b, ancho);
  const c = await centroDe(b, sel);
  if (!c || !c.visible) throw new Error("enlace principal no visible");
  await b.clicEn(c.x, c.y);
}

async function escenarios(base, paginas, ancho, opciones) {
  const alto = TAMANOS[ancho];
  const lento = !!(opciones && opciones.lento);
  const b = await crearNavegador(base, ancho, alto);
  const pre = (t) => `${lento ? "carga lenta · " : ""}@${ancho} · ${t}`;
  const LIM = lento ? { limite: 40000 } : undefined;
  try {
    const homes = [["/", "es"], ["/en/", "en"]];
    // 1. Navegación directa (ES y EN), con y sin parámetros
    for (const [home] of homes) {
      for (const query of ["", "?utm_source=prueba&utm_medium=cta"]) {
        grupo = lento ? "carga lenta" : "escenarios";
        await b.ir(home + query + "#contacto");
        const m = await validarLlegada(b, {}, pre(`directo ${home}${query}#contacto`), home, LIM);
        ok(pre(`directo ${home}${query} → conserva los parámetros de la URL`), m.search === query, m.search);
      }
    }
    // 2. Recarga con #contacto
    await b.ir("/en/#contacto");
    await esperarAsentada(b);
    await b.recargar();
    await validarLlegada(b, {}, pre("recarga de /en/#contacto"), "/en/", LIM);
    if (lento) return;

    // 3. Pulsación repetida desde la propia Home (3 veces, volviendo arriba entre pulsaciones)
    for (const [home] of homes) {
      await b.ir(home);
      const hist0 = await b.ev("history.length");
      for (let i = 1; i <= 3; i++) {
        await b.ev("(() => { const r = document.documentElement; r.style.scrollBehavior='auto'; scrollTo(0, " + (i === 2 ? 4000 : 0) + "); r.style.scrollBehavior=''; })()");
        await b.ev("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
        await clicPrincipal(b, ancho);
        await validarLlegada(b, {}, pre(`${home}: pulsación ${i} de 3`), home);
      }
      const hist1 = await b.ev("history.length");
      ok(pre(`${home}: pulsar varias veces no llena el historial (como mucho +1 entrada)`), hist1 - hist0 <= 1, `${hist0}→${hist1}`);
      await b.atras();
      const tras = await b.ev("({ hash: location.hash, ruta: location.pathname })");
      ok(pre(`${home}: «atrás» tras pulsar vuelve a la Home sin #contacto`), tras.hash === "" && tras.ruta === home, JSON.stringify(tras));
    }

    // 4. Historial: ficha → CTA → Home#contacto → atrás → adelante
    for (const ficha of [FICHA_ES(paginas), FICHA_EN(paginas)].filter(Boolean)) {
      const home = FORMA_FORM(ficha);
      await b.ir(ficha);
      await clicPrincipal(b, ancho);
      await validarLlegada(b, {}, pre(`${ficha} → Home`), home);
      const atras = await b.atras();
      await esperarFicha(b, ficha);
      const aqui = decodeURIComponent(await b.ev("location.pathname"));
      ok(pre(`${ficha}: «atrás» vuelve a la ficha`), atras && aqui === ficha, aqui);
      const adel = await b.adelante();
      await validarLlegada(b, {}, pre(`${ficha}: «adelante» vuelve al formulario`), home);
      ok(pre(`${ficha}: «adelante» navega`), adel === true);
    }

    // 5. Teclado: Enter sobre el enlace; el foco queda en la sección; Tab entra en el primer campo
    {
      const ficha = FICHA_ES(paginas);
      await b.ir(ficha);
      if (ancho < 1024) {
        const c = await centroDe(b, "document.getElementById('hamburger')");
        await b.clicEn(c.x, c.y);
        await b.ev("new Promise(r => { const t0 = performance.now(); (function f(){ const m = document.getElementById('mobile-menu'); if (m.classList.contains('is-open') && !m.getAnimations({subtree:true}).some(a => a.playState === 'running')) return r(true); if (performance.now()-t0 > 4000) return r(false); requestAnimationFrame(f); })(); })");
      }
      const sel = await enlacePrincipal(b, ancho);
      await b.ev(`${sel}.focus()`);
      const enfocado = await b.ev(`document.activeElement === ${sel}`);
      ok(pre("teclado: el enlace «Contacto» puede recibir el foco"), enfocado === true);
      await b.tecla("Enter", "Enter", 13, "\r");
      await esperarAsentada(b);
      const medido = await b.ev("window.__f.medir()");
      ok(pre("teclado: el foco queda dentro de la sección del formulario"), medido.focoEnSeccion === true, medido.foco);
      // Tab recorre, en el orden del documento, lo que hay dentro de la sección (enlaces de contacto) hasta el primer campo.
      let siguiente = null, dentro = true;
      for (let i = 0; i < 10 && siguiente !== "field-nombre"; i++) {
        await b.tecla("Tab", "Tab", 9);
        const est = await b.ev("({ id: document.activeElement && document.activeElement.id, dentro: !!document.activeElement && document.getElementById('contacto').contains(document.activeElement) })");
        siguiente = est.id;
        dentro = dentro && est.dentro;
      }
      ok(pre("teclado: Tab, desde el foco en la sección, avanza por la propia sección hasta el primer campo del formulario"), siguiente === "field-nombre" && dentro, siguiente);
      const trasTab = await b.ev("window.__f.medir()");
      ok(pre("teclado: al tabular hasta el primer campo el formulario sigue completo a la vista y la página no salta"), trasTab.completo === true && Math.abs(trasTab.scrollY - medido.scrollY) <= 3, `${medido.scrollY}→${trasTab.scrollY}`);
    }

    // 6. Menú móvil y panel flotante se cierran al elegir el formulario (en la Home)
    if (ancho < 1024) {
      await b.ir("/");
      await clicPrincipal(b, ancho);
      await validarLlegada(b, {}, pre("menú móvil → «Contacto»"), "/");
      const estado = await b.ev("({ abierto: document.getElementById('mobile-menu').classList.contains('is-open'), overflow: document.body.style.overflow })");
      ok(pre("el menú móvil se cierra y se libera el scroll de la página"), estado.abierto === false && estado.overflow === "", JSON.stringify(estado));
    }
    {
      await b.ir("/");
      await b.ev("(() => { const r = document.documentElement; r.style.scrollBehavior='auto'; scrollTo(0, 1600); r.style.scrollBehavior=''; })()");
      await b.ev("new Promise(r => { const t0 = performance.now(); (function f(){ if (window.__f.flotanteActivo() || performance.now()-t0 > 4000) return r(true); requestAnimationFrame(f); })(); })");
      const c = await centroDe(b, "document.getElementById('floating-contact-toggle')");
      await b.clicEn(c.x, c.y);
      await b.ev("new Promise(r => { const t0 = performance.now(); (function f(){ const t = document.getElementById('floating-contact-toggle'); if (t.getAttribute('aria-expanded') === 'true' && !document.getElementById('floating-contact').getAnimations({subtree:true}).some(a => a.playState === 'running') || performance.now()-t0 > 4000) return r(true); requestAnimationFrame(f); })(); })");
      const c2 = await centroDe(b, "document.getElementById('floating-contact-form-link')");
      await b.clicEn(c2.x, c2.y);
      await validarLlegada(b, {}, pre("botón flotante → «Formulario»"), "/");
      const cerrado = await b.ev("document.getElementById('floating-contact-toggle').getAttribute('aria-expanded')");
      ok(pre("el panel del botón flotante se cierra al elegir «Formulario»"), cerrado === "false", cerrado);
    }

    // 7. Enlaces que NO deben tocarse: WhatsApp, correo y otras páginas conservan su comportamiento
    for (const ruta of ["/", "/en/", FICHA_ES(paginas), FICHA_EN(paginas)].filter(Boolean)) {
      await b.ir(ruta);
      const r = await b.ev(`(() => {
        const salida = [];
        window.addEventListener('click', (ev) => { ev.__antes = ev.defaultPrevented; ev.preventDefault(); }, false);
        const enlaces = [...document.querySelectorAll('a[href]')].filter((a) => {
          const u = new URL(a.getAttribute('href'), location.href);
          return !(u.hash === '#contacto' && u.origin === location.origin && /^\\/(en\\/)?(index\\.html)?$/.test(u.pathname)) && !a.getAttribute('href').startsWith('#') && !a.hasAttribute('hidden');
        });
        const muestra = [];
        const dist = new Set();
        for (const a of enlaces) { const k = a.getAttribute('href').replace(/[?#].*/, '').slice(0, 40); if (!dist.has(k)) { dist.add(k); muestra.push(a); } if (muestra.length >= 60) break; }
        let alterados = 0; const detalle = [];
        for (const a of muestra) {
          let prevenido = null;
          const oy = (ev) => { prevenido = ev.__antes; };
          window.addEventListener('click', oy, false);
          a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
          window.removeEventListener('click', oy, false);
          if (prevenido === true) { alterados++; detalle.push(a.getAttribute('href').slice(0, 50)); }
        }
        const wa = enlaces.filter((a) => /wa\\.me|mailto:|tel:/.test(a.getAttribute('href'))).length;
        return { probados: muestra.length, alterados, detalle, wa };
      })()`);
      ok(pre(`${ruta}: WhatsApp, correo y demás enlaces ajenos al formulario no son interceptados (${r.probados} probados, ${r.wa} de WhatsApp/correo/teléfono)`), r.alterados === 0, JSON.stringify(r.detalle));
    }

    // 8. prefers-reduced-motion: llega sin animación
    {
      const br = await crearNavegador(base, ancho, alto, { movimientoReducido: true });
      try {
        await br.ir("/");
        await br.ev("(() => { const r = document.documentElement; r.style.scrollBehavior='auto'; scrollTo(0, 0); })()");
        await br.ev("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
        if (ancho < 1024) {
          const c = await centroDe(br, "document.getElementById('hamburger')");
          await br.clicEn(c.x, c.y);
          await br.ev("new Promise(r => { const t0 = performance.now(); (function f(){ const m = document.getElementById('mobile-menu'); if (m.classList.contains('is-open') && !m.getAnimations({subtree:true}).some(a => a.playState === 'running')) return r(true); if (performance.now()-t0 > 4000) return r(false); requestAnimationFrame(f); })(); })");
        }
        const sel = await enlacePrincipal(br, ancho);
        const c = await centroDe(br, sel);
        const y0 = await br.ev("scrollY");
        await br.clicEn(c.x, c.y);
        // Sin animación: en un par de fotogramas ya está alineado (no hay recorrido gradual)
        const salto = await br.ev("new Promise(r => { const ys = [scrollY]; let n = 0; (function f(){ ys.push(scrollY); if (++n >= 6) return r(ys); requestAnimationFrame(f); })(); })");
        const intermedios = salto.slice(1).filter((y) => y > y0 + 1 && Math.abs(y - salto[salto.length - 1]) > 1).length;
        ok(pre("reduced-motion: el desplazamiento al formulario es inmediato (sin recorrido animado)"), intermedios === 0 && salto[salto.length - 1] > y0 + 1, JSON.stringify(salto));
        await validarLlegada(br, {}, pre("reduced-motion"), "/");
      } finally {
        await br.cerrar();
      }
    }
  } finally {
    bloqueadasGlobal.push(...b.bloqueadas);
    await b.cerrar();
  }
}

async function esperarFicha(b, ficha) {
  await b.ev(`new Promise(r => { const t0 = performance.now(); (function f(){ if (location.pathname === ${JSON.stringify(ficha)} && document.readyState === 'complete') return r(true); if (performance.now()-t0 > 10000) return r(false); setTimeout(f, 30); })(); })`, 200);
}

const bloqueadasGlobal = [];

/* ------------------------------------------------------------------ */
/* Informe                                                            */
/* ------------------------------------------------------------------ */

function escribirInventario(ruta, ctas, informe, otros) {
  const lineas = [];
  lineas.push("# Inventario de controles que llevan al formulario de contacto");
  lineas.push("");
  lineas.push("Generado por `scripts/verificar-formulario.js`. Destino de todos: formulario de la Home del mismo idioma (`/#contacto` o `/en/#contacto`).");
  lineas.push("");
  const grupos = new Map();
  for (const c of ctas) {
    const k = [c.lang, c.tipo, c.comp, c.texto, c.href.startsWith("#") ? "#contacto (misma página)" : c.href].join("|");
    if (!grupos.has(k)) grupos.set(k, { c, n: 0, ej: c.origen });
    grupos.get(k).n++;
  }
  lineas.push(`Total de enlaces al formulario auditados: **${ctas.length}** en **${new Set(ctas.map((c) => c.origen)).size}** páginas (${grupos.size} combinaciones idioma × tipo de página × componente × texto).`);
  lineas.push("");
  lineas.push("| Idioma | Tipo de página de origen | Componente | Texto | Enlace | Ejemplares | Ejemplo de página |");
  lineas.push("|---|---|---|---|---|---|---|");
  [...grupos.values()]
    .sort((a, b) => (a.c.lang + a.c.tipo + a.c.comp).localeCompare(b.c.lang + b.c.tipo + b.c.comp))
    .forEach(({ c, n, ej }) => lineas.push(`| ${c.lang.toUpperCase()} | ${c.tipo} | ${c.comp} | ${c.texto.replace(/\|/g, "/")} | \`${c.href}\` | ${n} | ${ej} |`));
  lineas.push("");
  lineas.push("## Resultado de las pruebas en navegador");
  lineas.push("");
  const total = informe.length;
  const okc = informe.filter((f) => f.resultado === "OK").length;
  const na = informe.filter((f) => f.resultado === "n/a").length;
  const bad = informe.filter((f) => f.resultado === "FALLA").length;
  lineas.push(`Pruebas de navegación ejecutadas: ${total} (aprobadas ${okc}, no aplicables a ese ancho ${na}, fallidas ${bad}).`);
  lineas.push("");
  lineas.push("| Página de origen | Componente | Texto | Ancho | Destino | Resultado | Detalle |");
  lineas.push("|---|---|---|---|---|---|---|");
  informe.forEach((f) => lineas.push(`| ${f.origen} | ${f.comp} | ${f.texto.replace(/\|/g, "/")} | ${f.ancho} | \`${f.destino}\` | ${f.resultado} | ${(f.detalle || "").replace(/\|/g, "/")} |`));
  lineas.push("");
  lineas.push("## Controles con texto de contacto o solicitud cuyo destino es otro (intencional)");
  lineas.push("");
  lineas.push("| Idioma | Elemento | Destino | Texto | Veces |");
  lineas.push("|---|---|---|---|---|");
  [...otros.entries()].sort().forEach(([k, v]) => {
    const [l, el, href, texto] = k.split(" | ");
    lineas.push(`| ${l.toUpperCase()} | ${el} | \`${href}\` | ${texto.replace(/\|/g, "/")} | ${v.n} |`);
  });
  fs.writeFileSync(ruta, lineas.join("\n") + "\n");
}

/* ------------------------------------------------------------------ */
/* Principal                                                          */
/* ------------------------------------------------------------------ */

(async () => {
  const args = leerArgumentos(process.argv.slice(2));
  if (args.fusionar) {
    const vol = args.fusionar.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
    const informe = vol.flatMap((v) => v.informe);
    escribirInventario(args.inventario, vol[0].ctas, informe, new Map(vol[0].otros));
    console.log(`Inventario escrito en ${args.inventario}: ${vol[0].ctas.length} CTA, ${informe.length} navegaciones`);
    return;
  }
  if (!fs.existsSync(SITIO)) {
    console.error("Falta _site/. Ejecuta primero: npm run build");
    process.exit(2);
  }
  for (const f of process.env.MAKOM_SITIO ? [] : ["script.js", "styles.css"]) {
    if (!fs.readFileSync(path.join(SITIO, f)).equals(fs.readFileSync(path.join(RAIZ, f)))) {
      console.error("_site/" + f + " no coincide con " + f + " (build desactualizado). Ejecuta: npm run build");
      process.exit(2);
    }
  }
  const paginas = recorrer(SITIO)
    .map((f) => {
      const html = fs.readFileSync(f, "utf8");
      const ruta = rutaDe(f);
      return { ruta, html, lang: idioma(ruta), tipo: tipoDePagina(ruta) };
    })
    // Las redirecciones suaves de enlaces antiguos no son páginas con navegación propia
    .filter((p) => !/http-equiv="refresh"/.test(p.html))
    .sort((a, b) => a.ruta.localeCompare(b.ruta));

  const { ctas, otros } = auditarEstatica(paginas);
  const informe = [];
  const t0 = Date.now();

  if (!args.solo || args.solo === "cta" || args.solo === "escenarios") {
    const { servidor, base } = await nav.iniciarServidor();
    try {
      if (!args.solo || args.solo === "cta") {
        const casos = seleccionar(ctas, paginas, args.anchos, args.todos);
        for (const w of args.anchos) await pruebasCta(base, casos, w, informe);
      }
      if (!args.solo || args.solo === "escenarios") {
        for (const w of args.anchos) {
          grupo = "escenarios";
          await escenarios(base, paginas, w);
        }
      }
    } finally {
      servidor.close();
    }
  }
  if (!args.solo || args.solo === "lento") {
    // Carga lenta: imágenes, fuentes, estilos y scripts llegan con retraso; el destino debe seguir siendo el mismo
    const retardo = (ruta) => (/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(ruta) ? 350 : /\.woff2?$/i.test(ruta) ? 700 : /\.css$/i.test(ruta) ? 250 : /script\.js$/i.test(ruta) ? 300 : 0);
    const { servidor, base } = await nav.iniciarServidor({ retardo });
    try {
      for (const w of args.anchos) {
        grupo = "carga lenta";
        await escenarios(base, paginas, w, { lento: true });
        // y un clic real desde una ficha con la misma lentitud
        const b = await crearNavegador(base, w, TAMANOS[w]);
        try {
          for (const ficha of [FICHA_ES(paginas), FICHA_EN(paginas)].filter(Boolean)) {
            await b.ir(ficha);
            await clicPrincipal(b, w);
            await validarLlegada(b, {}, `carga lenta · @${w} · ${ficha} → Home`, FORMA_FORM(ficha), { limite: 40000 });
          }
        } finally {
          bloqueadasGlobal.push(...b.bloqueadas);
          await b.cerrar();
        }
      }
    } finally {
      servidor.close();
    }
  }
  bloqueadasGlobal.push(...(informe.bloqueadas || []));
  ok("ninguna petición a Meta, CAPI o CRM llegó a recibir respuesta", bloqueadasGlobal.length === 0, bloqueadasGlobal.slice(0, 2).join(" | "));

  if (args.inventario) escribirInventario(args.inventario, ctas, informe, otros);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ ctas, informe: [...informe], otros: [...otros.entries()] }));

  // Resumen
  const grupos = {};
  resultados.forEach((r) => {
    grupos[r.grupo] = grupos[r.grupo] || { n: 0, f: 0 };
    grupos[r.grupo].n++;
    if (!r.ok) grupos[r.grupo].f++;
  });
  const fallos = resultados.filter((r) => !r.ok);
  if (args.detalle) resultados.filter((r) => r.ok).forEach((r) => console.log(`  ok    ${r.grupo} | ${r.nombre}`));
  fallos.slice(0, 80).forEach((r) => console.log(`  FALLO ${r.grupo} | ${r.nombre}${r.detalle ? "  →  " + r.detalle : ""}`));
  console.log("");
  Object.entries(grupos).forEach(([g, v]) => console.log(`  ${g.padEnd(22)} ${String(v.n).padStart(5)} comprobaciones, ${v.f} fallos`));
  const aprobadas = informe.filter((f) => f.resultado === "OK").length;
  const na = informe.filter((f) => f.resultado === "n/a").length;
  console.log(`\n  CTA al formulario auditados (estático): ${ctas.length} en ${new Set(ctas.map((c) => c.origen)).size} páginas`);
  console.log(`  Navegaciones reales probadas: ${informe.length} (aprobadas ${aprobadas}, no aplicables al ancho ${na}, fallidas ${informe.filter((f) => f.resultado === "FALLA").length})`);
  const huella = crypto.createHash("sha256").update(resultados.map((r) => r.nombre + "=" + r.ok).sort().join("\n")).digest("hex").slice(0, 12);
  console.log(`\nTotal: ${resultados.length} comprobaciones, ${fallos.length} fallos · ${Math.round((Date.now() - t0) / 1000)} s · huella ${huella}`);
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
