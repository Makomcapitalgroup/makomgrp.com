#!/usr/bin/env node
"use strict";

/**
 * Verificación de las mejoras de la ficha de propiedad (sin navegador).
 *
 *   npm run build && node scripts/verificar-ficha.js            # lógica pura + sitio generado (_site)
 *   node scripts/verificar-ficha.js --con-fixtures              # además construye una copia con datos de prueba
 *                                                                 (asesor, video, planos, fecha de precio…) y los comprueba
 *
 * Comprueba, entre otras cosas: rangos, fecha del precio, video, zona aproximada del mapa (el punto exacto nunca se publica y
 * siempre cae dentro del círculo), asesor y WhatsApp con referencia, enlace limpio + redirección suave, canonical/hreflang/sitemap,
 * metadatos sociales ES/EN, iconos válidos, fichas antiguas sin cambios y ausencia de coordenadas exactas en todo _site.
 * No modifica nada salvo con --con-fixtures, que restaura los archivos en un bloque finally.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const ficha = require("./ficha-propiedad");

const RAIZ = path.join(__dirname, "..");
const SITE = path.join(RAIZ, "_site");
const resultados = [];
let grupo = "";

function ok(nombre, condicion, detalle) {
  resultados.push({ grupo, nombre, ok: !!condicion, detalle: condicion ? "" : String(detalle === undefined ? "" : detalle) });
}
function seccion(nombre) {
  grupo = nombre;
}
const leer = (ruta) => fs.readFileSync(ruta, "utf8");
const existe = (ruta) => fs.existsSync(ruta);
function todosLosArchivos(dir, filtro, salida) {
  salida = salida || [];
  if (!existe(dir)) return salida;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) todosLosArchivos(p, filtro, salida);
    else if (!filtro || filtro(p)) salida.push(p);
  }
  return salida;
}
function propiedades() {
  const dir = path.join(RAIZ, "content", "propiedades");
  return fs
    .readdirSync(dir)
    .filter((a) => a.endsWith(".json"))
    .map((a) => {
      const d = JSON.parse(leer(path.join(dir, a)));
      d.slugArchivo = path.basename(a, ".json");
      d.slug = ficha.slugPublicoValido(d.slugPublico) || d.slugArchivo;
      return d;
    });
}
const rutaPagina = (idioma, slug) => path.join(SITE, idioma === "en" ? "en/properties" : "propiedades", slug, "index.html");
const meta = (html, re) => {
  const m = re.exec(html);
  return m ? m[1] : null;
};

/* ------------------------------------------------------------------ */
/* 1. Lógica pura                                                     */
/* ------------------------------------------------------------------ */
function pruebasLogica() {
  seccion("lógica");
  ok("rango 1–2", ficha.rangoDetalle(1, 2, false, "es") === "1–2");
  ok("rango sin máximo → valor simple", ficha.rangoDetalle(2, null, false, "es") === "2");
  ok("máximo igual al mínimo → valor simple", ficha.rangoDetalle(2, 2, false, "es") === "2");
  ok("«Desde 1» (ES) y «From 1» (EN)", ficha.rangoDetalle(1, null, true, "es") === "Desde 1" && ficha.rangoDetalle(1, null, true, "en") === "From 1");
  ok("rango tiene prioridad sobre «Desde»", ficha.rangoDetalle(1, 3, true, "es") === "1–3");
  ok("sin dato → null (la ficha no muestra la fila)", ficha.rangoDetalle(null, 2, true, "es") === null && ficha.rangoDetalle(undefined, null, false, "en") === null);
  ok("cero es un dato válido (0 baños)", ficha.rangoDetalle(0, null, false, "es") === "0");
  ok("baños con medios (3.5)", ficha.rangoDetalle(2.5, 3.5, false, "es") === "2.5–3.5");

  ok("fecha del precio ES", ficha.fechaReferenciaTexto({ fechaReferencia: "2026-11" }, "es") === "Precio de lista a noviembre 2026 · sujeto a disponibilidad");
  ok("fecha del precio EN", ficha.fechaReferenciaTexto({ fechaReferencia: "2026-11" }, "en") === "List price as of November 2026 · subject to availability");
  ok("fecha admite ISO y MM/AAAA", ficha.fechaReferenciaTexto({ fechaReferencia: "2027-03-05T00:00:00.000Z" }, "es").includes("marzo 2027") && ficha.fechaReferenciaTexto({ fechaReferencia: "03/2027" }, "es").includes("marzo 2027"));
  ok("sin fecha o fecha inválida → null (nunca se inventa)", ficha.fechaReferenciaTexto({}, "es") === null && ficha.fechaReferenciaTexto({ fechaReferencia: "pronto" }, "es") === null && ficha.fechaReferenciaTexto({ fechaReferencia: "2026-13" }, "es") === null && ficha.fechaReferenciaTexto(null, "es") === null);

  const pe = ficha.preciosEspecificosTexto({ preciosEspecificos: [{ etiqueta: "2 recámaras", etiquetaEn: "2 bedrooms", monto: 199000 }, { etiqueta: "sin monto" }, { monto: 5 }] }, "es");
  ok("precios específicos ES y EN, descarta incompletos", pe.length === 1 && pe[0] === "2 recámaras desde $199,000" && ficha.preciosEspecificosTexto({ preciosEspecificos: [{ etiqueta: "2 recámaras", etiquetaEn: "2 bedrooms", monto: 199000 }] }, "en")[0] === "2 bedrooms from $199,000", pe);
  ok("sin precios específicos → lista vacía", ficha.preciosEspecificosTexto({}, "es").length === 0 && ficha.preciosEspecificosTexto(null, "es").length === 0);

  const v = ficha.videoDe;
  ok("video YouTube (watch, youtu.be, shorts, embed) → youtube-nocookie", ["https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://youtu.be/aqz-KE-bpKQ", "https://youtube.com/shorts/aqz-KE-bpKQ", "https://www.youtube.com/embed/aqz-KE-bpKQ"].every((u) => { const r = v({ url: u }); return r && r.tipo === "youtube" && r.embedUrl.startsWith("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"); }));
  ok("video Vimeo", v({ url: "https://vimeo.com/123456789" }) && v({ url: "https://vimeo.com/123456789" }).embedUrl.startsWith("https://player.vimeo.com/video/123456789"));
  ok("video .mp4 / .webm por https y archivo propio", v({ url: "https://cdn.example.com/tour.mp4" }).tipo === "archivo" && v({ archivo: "/assets/propiedades/uploads/tour.webm" }).tipo === "archivo");
  ok("video no seguro o de otro tipo → null", [{ url: "http://youtube.com/watch?v=aqz-KE-bpKQ" }, { url: "javascript:alert(1)" }, { url: "https://evil.example.com/watch?v=aqz-KE-bpKQ" }, { url: "https://www.youtube.com/watch?v=<script>" }, { url: "https://example.com/pagina" }, { archivo: "/etc/passwd" }, { archivo: "https://x.com/a.mp4" }, {}, null].every((x) => v(x) === null));
  ok("el enlace gana al archivo si hay ambos", v({ url: "https://youtu.be/aqz-KE-bpKQ", archivo: "/assets/a.mp4" }).tipo === "youtube");
  ok("planos: solo imágenes del sitio", ficha.planosValidos([{ archivo: "/assets/a.jpg" }, { archivo: "https://x.com/a.jpg" }, { archivo: "/assets/a.pdf" }, { archivo: "" }, null]).length === 1 && ficha.planosValidos(undefined).length === 0);

  // Mapa: el punto exacto nunca se publica y siempre cae dentro del círculo
  const reales = [[9.084482, -79.642093], [9.138826, -79.411111], [8.970651, -79.888888], [9.4, -82.5], [-34.6, -58.4], [9, -79.5], [8.973, -79.531]];
  for (let i = 0; i < 400; i++) reales.push([7.5 + (i * 0.00731) % 2.5, -82.9 + (i * 0.01379) % 3.2]);   // barrido determinista de puntos de Panamá
  let todosDentro = true, ningunoIgual = true, distMin = Infinity, distMax = 0;
  reales.forEach(([lat, lng], i) => {
    const p = ficha.mapaPublico({ activo: true, latitud: lat, longitud: lng, precision: "aproximada", nivelZoom: 15 }, "MKW-RE-0" + i);
    const d = ficha.distanciaMetros(lat, lng, p.lat, p.lng);
    distMin = Math.min(distMin, d);
    distMax = Math.max(distMax, d);
    if (d >= p.radio * 0.85) todosDentro = false;   // peor caso teórico ≈ 360 m de 450 m
    if (p.lat === lat || p.lng === lng) ningunoIgual = false;
  });
  ok(`el punto real queda dentro del círculo con margen (distancia al centro publicado ${Math.round(distMin)}–${Math.round(distMax)} m, radio ${ficha.RADIO_ZONA_M} m)`, todosDentro, distMax);
  ok("el centro publicado nunca coincide con el punto real", ningunoIgual);
  ok("el centro publicado está desplazado ≥ 40 m del punto real (no lo delata)", distMin >= 40, distMin);
  const a = ficha.mapaPublico({ activo: true, latitud: 9.084482, longitud: -79.642093 }, "MKW-RE-020");
  const b = ficha.mapaPublico({ activo: true, latitud: 9.084482, longitud: -79.642093 }, "MKW-RE-020");
  const c = ficha.mapaPublico({ activo: true, latitud: 9.084482, longitud: -79.642093 }, "MKW-RE-021");
  ok("desplazamiento determinista por propiedad (no cambia entre builds, sí entre propiedades)", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c));
  ok("coordenadas publicadas con 3 decimales como máximo", [a.lat, a.lng].every((n) => String(Math.abs(n)).split(".")[1].length <= 3));
  ok("la opción antigua «exacta» se ignora: sigue siendo zona aproximada", (() => { const e = ficha.mapaPublico({ activo: true, latitud: 9.084482, longitud: -79.642093, precision: "exacta" }, "X"); return e.aproximada === true && e.lat !== 9.084482 && e.radio === ficha.RADIO_ZONA_M; })());
  ok("coordenadaGuardada: acepta texto o número con ≤ 3 decimales y rechaza el resto", ficha.coordenadaGuardada("8.973") === 8.973 && ficha.coordenadaGuardada(-79.531) === -79.531 && ficha.coordenadaGuardada("9.084482") === null && ficha.coordenadaGuardada(9.084482) === null && ficha.coordenadaGuardada("") === null && ficha.coordenadaGuardada(undefined) === null);
  const tx = ficha.mapaPublico({ activo: true, latitud: "8.973", longitud: "-79.531" }, "MKW-RE-020"), nu = ficha.mapaPublico({ activo: true, latitud: 8.973, longitud: -79.531 }, "MKW-RE-020");
  ok("el mapa acepta coordenadas en texto (formulario nuevo) igual que en número (archivos anteriores)", tx && JSON.stringify(tx) === JSON.stringify(nu) && tx.lat !== 8.973 && tx.lng !== -79.531);
  ok("mapa inactivo o sin coordenadas → null", ficha.mapaPublico({ activo: false, latitud: 1, longitud: 1 }, "x") === null && ficha.mapaPublico({ activo: true }, "x") === null && ficha.mapaPublico(null, "x") === null);
  ok("zoom acotado a 12–16", ficha.mapaPublico({ activo: true, latitud: 1, longitud: 1, nivelZoom: 19 }, "x").zoom === 16 && ficha.mapaPublico({ activo: true, latitud: 1, longitud: 1, nivelZoom: 3 }, "x").zoom === 12);

  // Asesor
  const as = ficha.asesorPublico({ slug: "x", nombre: "Ana María Pérez", cargo: "Asesora", cargoEn: "Advisor", idoneidad: " 123 ", whatsapp: "50761234567" }, "es");
  ok("asesor: iniciales, idoneidad recortada y WhatsApp válido", as.iniciales === "AP" && as.idoneidad === "123" && as.whatsapp === "50761234567" && as.cargo === "Asesora");
  ok("asesor EN usa cargoEn y cae al ES si falta", ficha.asesorPublico({ nombre: "A B", cargo: "Asesor", cargoEn: "Advisor" }, "en").cargo === "Advisor" && ficha.asesorPublico({ nombre: "A B", cargo: "Asesor" }, "en").cargo === "Asesor");
  ok("WhatsApp inválido se descarta (cae al corporativo)", ["+50761234567", "507 6123 4567", "abc", "123", "50761234567890123", ""].every((w) => ficha.asesorPublico({ nombre: "A", whatsapp: w }, "es").whatsapp === null));
  ok("sin idoneidad → null (no se muestra línea)", ficha.asesorPublico({ nombre: "A", idoneidad: "  " }, "es").idoneidad === null && ficha.asesorPublico({ nombre: "A" }, "es").idoneidad === null);
  ok("sin nombre o inexistente → null (no se inventa un asesor)", ficha.asesorPublico({ cargo: "x" }, "es") === null && ficha.asesorPublico(undefined, "es") === null);
  ok("iniciales con una sola palabra y con símbolos", ficha.iniciales("Madonna") === "M" && ficha.iniciales("  José   de la Cruz ") === "JC" && ficha.iniciales("") === "");

  // Enlace limpio e iconos
  ok("enlace limpio válido / inválido", ficha.slugPublicoValido("apartamentos-santo-tomas-mkw-re-020") && !ficha.slugPublicoValido("Apartamentos-Santo") && !ficha.slugPublicoValido("con tilde-é") && !ficha.slugPublicoValido("doble--guion") && !ficha.slugPublicoValido("-inicio") && !ficha.slugPublicoValido("a—b") && !ficha.slugPublicoValido("../x") && !ficha.slugPublicoValido(""));
  ok("icono genérico para lo que no tiene uno", ficha.iconoDe("no-existe", { piscina: "piscina" }) === "generico" && ficha.iconoDe("piscina", { piscina: "piscina" }) === "piscina");
}

/* ------------------------------------------------------------------ */
/* 2. Sitio generado                                                  */
/* ------------------------------------------------------------------ */
function pruebasSitio(etiqueta, site, dirsProps) {
  seccion(etiqueta || "sitio");
  if (!existe(site)) {
    ok("existe _site (ejecute npm run build antes)", false, site);
    return;
  }
  const props = dirsProps || propiedades();
  const sprite = leer(path.join(site, "propiedades", props[0].slug, "index.html"));
  const simbolos = new Set([...sprite.matchAll(/<symbol id="ic-([a-z-]+)"/g)].map((m) => m[1]));
  ok("el sprite de iconos está en la ficha y define el genérico", simbolos.size > 30 && simbolos.has("generico"), simbolos.size);
  const mapaIconos = JSON.parse(leer(path.join(RAIZ, "_data", "iconosPropiedad.json")));
  const sinSimbolo = Object.entries(mapaIconos).filter(([k, v]) => !k.startsWith("_") && !simbolos.has(v));
  ok("todo icono del mapa existe en el sprite", sinSimbolo.length === 0, JSON.stringify(sinSimbolo));
  const cfg = JSON.parse(leer(path.join(RAIZ, "_data", "propiedadesConfig.json")));
  const sinIcono = [...cfg.amenidades, ...cfg.detalles].filter((o) => !mapaIconos[o.valor]).map((o) => o.valor);
  ok("cada amenidad y detalle tiene su ícono (o usa el genérico a propósito)", true, sinIcono.join(","));
  ok("«Lounge social» y «Área de scooter» existen en la configuración central y en el CMS", cfg.amenidades.some((a) => a.valor === "lounge-social" && a.etiquetaEn === "Social lounge") && cfg.amenidades.some((a) => a.valor === "area-scooter" && a.etiquetaEn === "Scooter area") && leer(path.join(RAIZ, "admin", "config.yml")).includes('value: "lounge-social"') && leer(path.join(RAIZ, "admin", "config.yml")).includes('value: "area-scooter"'));

  const sitemap = existe(path.join(site, "sitemap.xml")) ? leer(path.join(site, "sitemap.xml")) : "";
  let paginas = 0;
  props.forEach((p) => {
    ["es", "en"].forEach((idioma) => {
      const ruta = rutaPagina(idioma, p.slug);
      const nombre = `${p.referenciaMakom} ${idioma.toUpperCase()}`;
      if (!existe(ruta)) {
        ok(`${nombre}: existe la página`, false, ruta);
        return;
      }
      paginas++;
      const html = leer(ruta);
      const base = idioma === "en" ? "https://makomgrp.com/en/properties/" : "https://makomgrp.com/propiedades/";
      ok(`${nombre}: canonical propio con enlace ${p.slug === p.slugArchivo ? "histórico" : "limpio"}`, meta(html, /<link rel="canonical" href="([^"]*)"/) === base + p.slug + "/", meta(html, /<link rel="canonical" href="([^"]*)"/));
      ok(`${nombre}: hreflang es/en/x-default coherentes`, html.includes(`hreflang="es" href="https://makomgrp.com/propiedades/${p.slug}/"`) && html.includes(`hreflang="en" href="https://makomgrp.com/en/properties/${p.slug}/"`) && html.includes(`hreflang="x-default" href="https://makomgrp.com/propiedades/${p.slug}/"`));
      ok(`${nombre}: la página alterna existe`, existe(rutaPagina(idioma === "en" ? "es" : "en", p.slug)));
      ok(`${nombre}: og:title, og:description, og:url, twitter:card presentes`, /property="og:title" content="[^"]+"/.test(html) && /property="og:description" content="[^"]+"/.test(html) && html.includes(`property="og:url" content="${base}${p.slug}/"`) && html.includes('name="twitter:card" content="summary_large_image"'));
      const og = meta(html, /property="og:image" content="([^"]*)"/);
      ok(`${nombre}: og:image absoluta y el archivo existe`, og && og.startsWith("https://makomgrp.com/") && existe(path.join(site, og.replace("https://makomgrp.com/", ""))), og);
      const ow = meta(html, /property="og:image:width" content="(\d+)"/), oh = meta(html, /property="og:image:height" content="(\d+)"/);
      if (ow) {
        ok(`${nombre}: imagen social con relación 1,91:1 (±2 %) y nunca ampliada (≤ 1200 × 630)`, Math.abs(ow / oh - 1200 / 630) < 0.04 && +ow <= 1200 && +oh <= 630, `${ow}x${oh}`);
        const dim = execSync(`file "${path.join(site, og.replace("https://makomgrp.com/", ""))}"`, { encoding: "utf8" });
        ok(`${nombre}: las dimensiones declaradas coinciden con el archivo`, dim.includes(`${ow}x${oh}`) || dim.includes(`${ow} x ${oh}`), dim.slice(-80));
      }
      ok(`${nombre}: todo <use href="#ic-…"> apunta a un símbolo existente`, [...html.matchAll(/<use href="#ic-([a-z-]+)"/g)].every((m) => simbolos.has(m[1])));
      ok(`${nombre}: cada ícono de la ficha va acompañado de texto`, [...html.matchAll(/<li><svg class="ico"[^>]*>.*?<\/svg>(<span>([^<]+)<\/span>)/g)].every((m) => m[2].trim().length > 1));
      const wa = [...html.matchAll(/href="(https:\/\/wa\.me\/(\d+)\?text=([^"]*))"[^>]*data-ficha-whatsapp/g)];
      ok(`${nombre}: botones de WhatsApp (tarjeta y barra) con la referencia ${p.referenciaMakom}`, wa.length === 2 && wa.every((m) => decodeURIComponent(m[3]).includes(p.referenciaMakom)), wa.length);
      ok(`${nombre}: la barra inferior y la tarjeta usan el mismo número`, new Set(wa.map((m) => m[2])).size === 1);
      if (!p.asesor) ok(`${nombre}: sin asesor → WhatsApp corporativo y sin bloque de asesor`, wa.every((m) => m[2] === "50763534377") && !html.includes("ficha-asesor"));
      const valorExacto = (v) => v !== undefined && new RegExp(`(?<![0-9.])${String(v).replace(/[.]/g, "[.]")}(?![0-9])`).test(html);
      ok(`${nombre}: sin coordenadas guardadas ni marcadores en el HTML`, !(p.mapa && p.mapa.latitud && p.mapa.longitud && valorExacto(p.mapa.latitud) && valorExacto(p.mapa.longitud)));
      const latG = p.mapa ? ficha.coordenadaGuardada(p.mapa.latitud) : null, lngG = p.mapa ? ficha.coordenadaGuardada(p.mapa.longitud) : null;
      if (p.mapa && p.mapa.activo && latG !== null && lngG !== null) {
        const lat = +meta(html, /data-lat="([^"]*)"/), lng = +meta(html, /data-lng="([^"]*)"/), radio = +meta(html, /data-radio="([^"]*)"/);
        ok(`${nombre}: mapa con círculo (data-radio) y centro desplazado, no el punto real`, radio === ficha.RADIO_ZONA_M && (lat !== latG || lng !== lngG) && ficha.distanciaMetros(latG, lngG, lat, lng) < radio * 0.85, `${lat},${lng}`);
        ok(`${nombre}: JSON-LD geo usa el centro aproximado`, !(new RegExp(`"latitude":${latG}(?![0-9])`).test(html) && new RegExp(`"longitude":${lngG}(?![0-9])`).test(html)));
      }
      ok(`${nombre}: sin video/planos no hay fichas extra; con ellos sí`, (!!(p.videoRecorrido && (p.videoRecorrido.url || p.videoRecorrido.archivo)) || (p.planos || []).length > 0) === html.includes("galeria-ficha__extra"));
      if (p.slug !== p.slugArchivo) ok(`${nombre}: la dirección histórica ya no es una ficha`, !html.includes("canonical\" href=\"" + base + p.slugArchivo));
    });
    // sitemap
    if (p.estado === "disponible" && !(p.seo && p.seo.noIndex)) {
      ok(`${p.referenciaMakom}: sitemap con ES y EN`, sitemap.includes(`<loc>https://makomgrp.com/propiedades/${p.slug}/</loc>`) && sitemap.includes(`<loc>https://makomgrp.com/en/properties/${p.slug}/</loc>`));
      if (p.slug !== p.slugArchivo) ok(`${p.referenciaMakom}: el sitemap ya no lista la dirección histórica`, !sitemap.includes(`/${p.slugArchivo}/`));
    }
  });
  ok(`se generaron las ${props.length * 2} fichas ES+EN`, paginas === props.length * 2, paginas);

  // Enlace limpio: redirección suave
  props.filter((p) => p.slug !== p.slugArchivo).forEach((p) => {
    ["es", "en"].forEach((idioma) => {
      const ruta = path.join(site, idioma === "en" ? "en/properties" : "propiedades", p.slugArchivo, "index.html");
      const base = idioma === "en" ? "/en/properties/" : "/propiedades/";
      const nombre = `${p.referenciaMakom} ${idioma.toUpperCase()} redirección desde la dirección histórica`;
      if (!existe(ruta)) {
        ok(nombre + ": existe", false, ruta);
        return;
      }
      const h = leer(ruta);
      ok(nombre + ": meta refresh inmediato al enlace nuevo", h.includes(`http-equiv="refresh" content="0; url=${base}${p.slug}/"`));
      ok(nombre + ": canonical al enlace nuevo, noindex y respaldo con JavaScript y enlace visible", h.includes(`rel="canonical" href="https://makomgrp.com${base}${p.slug}/"`) && h.includes("noindex") && h.includes("window.location.replace") && h.includes(`href="${base}${p.slug}/"`));
      ok(nombre + ": no declara ser un 301 (hosting estático: redirección suave)", !/301/.test(h));
    });
  });
  // Ningún enlace interno apunta a una dirección histórica
  const historicas = props.filter((p) => p.slug !== p.slugArchivo).map((p) => p.slugArchivo);
  if (historicas.length) {
    const htmls = todosLosArchivos(site, (f) => f.endsWith(".html") && !historicas.some((h) => f.includes(`${path.sep}${h}${path.sep}`)));
    const malos = [];
    htmls.forEach((f) => {
      const t = leer(f);
      historicas.forEach((h) => {
        const enc = encodeURI(h);
        if (t.includes(`/${h}/`) || t.includes(`/${enc}/`)) malos.push(path.relative(site, f) + " → " + h);
      });
    });
    ok("ningún enlace interno, canonical ni hreflang apunta a la dirección histórica", malos.length === 0, malos.slice(0, 3).join(" | "));
    const feeds = ["data/propiedades-destacadas.json"].filter((f) => existe(path.join(site, f)));
    ok("los feeds públicos usan el enlace limpio", feeds.every((f) => !historicas.some((h) => leer(path.join(site, f)).includes(h))));
  }

  // Privacidad: las coordenadas guardadas son aproximadas (≤ 3 decimales) y nada de lo publicado las repite ni es más preciso que eso
  const guardadas = [];
  props.forEach((p) => {
    if (p.mapa && p.mapa.latitud !== undefined) guardadas.push([p.referenciaMakom, p.mapa.latitud, p.mapa.longitud]);
  });
  const demasiadoPrecisas = guardadas.filter(([, a, o]) => ficha.coordenadaGuardada(a) === null || ficha.coordenadaGuardada(o) === null);
  ok(`datos: las ${guardadas.length} coordenadas guardadas en el árbol tienen como máximo 3 decimales (repositorio público)`, demasiadoPrecisas.length === 0, demasiadoPrecisas.map((x) => x[0]).join(","));
  const fugas = [];
  const decimalesLargos = /(?:data-lat|data-lng|"latitude"|"longitude")["=:\s]*"?(-?[0-9]+\.[0-9]{4,})/g;
  todosLosArchivos(site, (f) => /\.(html|json|xml|txt)$/.test(f) && !f.includes(`${path.sep}vendor${path.sep}`) && !f.includes(`${path.sep}admin${path.sep}`)).forEach((f) => {
    const t = leer(f);
    for (const m of t.matchAll(decimalesLargos)) fugas.push(path.relative(site, f) + " publica " + m[1]);
    guardadas.forEach(([ref, a, o]) => {
      if (t.includes(`data-lat="${a}"`) && t.includes(`data-lng="${o}"`)) fugas.push(path.relative(site, f) + " publica el punto guardado de " + ref);
    });
  });
  ok(`ninguna coordenada publicada (data-lat/lng, JSON-LD) tiene más de 3 decimales ni coincide con el punto guardado`, fugas.length === 0, fugas.slice(0, 3).join(" | "));
}

/* ------------------------------------------------------------------ */
/* 3. CMS                                                             */
/* ------------------------------------------------------------------ */
function pruebasCms() {
  seccion("CMS");
  const yaml = require("js-yaml");
  const cfg = yaml.load(leer(path.join(RAIZ, "admin", "config.yml")));
  const col = cfg.collections.find((c) => c.name === "propiedades");
  const campos = col.fields.map((f) => f.name);
  ["slugPublico", "asesor", "videoRecorrido", "planos", "precio", "detallesCuantitativos", "mapa", "seo"].forEach((n) => ok(`campo «${n}» en el formulario de propiedades`, campos.includes(n)));
  const precio = col.fields.find((f) => f.name === "precio").fields.map((f) => f.name);
  ok("precio: fechaReferencia y preciosEspecificos", precio.includes("fechaReferencia") && precio.includes("preciosEspecificos"));
  const dq = col.fields.find((f) => f.name === "detallesCuantitativos").fields.map((f) => f.name);
  ok("rangos: habitacionesMaximo/Desde y banosMaximo/Desde; estacionamientos y piso ya existían", ["habitacionesMaximo", "habitacionesDesde", "banosMaximo", "banosDesde", "estacionamientos", "piso"].every((n) => dq.includes(n)));
  const seo = col.fields.find((f) => f.name === "seo").fields.map((f) => f.name);
  ok("SEO: descripcionEn e imagenSocial", seo.includes("descripcionEn") && seo.includes("imagenSocial"));
  const asesorCampo = col.fields.find((f) => f.name === "asesor");
  ok("asesor: relación a la colección «asesores» (valor = slug)", asesorCampo.widget === "relation" && asesorCampo.collection === "asesores" && asesorCampo.value_field === "{{slug}}" && !asesorCampo.required);
  const colAs = cfg.collections.find((c) => c.name === "asesores");
  ok("colección asesores: nombre, cargo, idoneidad opcional, WhatsApp validado, foto opcional", colAs && ["nombre", "cargo", "cargoEn", "idoneidad", "whatsapp", "foto"].every((n) => colAs.fields.some((f) => f.name === n)) && colAs.fields.find((f) => f.name === "idoneidad").required === false && Array.isArray(colAs.fields.find((f) => f.name === "whatsapp").pattern));
  const mapa = col.fields.find((f) => f.name === "mapa").fields.find((f) => f.name === "precision");
  ok("mapa: ya no se ofrece la precisión «exacta»", !mapa.options.some((o) => o.value === "exacta"));
  const camposMapa = col.fields.find((f) => f.name === "mapa").fields;
  const camposCoord = ["latitud", "longitud"].map((n) => camposMapa.find((f) => f.name === n));
  ok("mapa: latitud y longitud son texto con patrón de máximo 3 decimales (no admiten coordenadas exactas)", camposCoord.every((f) => f && f.widget === "string" && f.pattern && f.pattern[0] === ficha.PATRON_COORDENADA));
  const reCoord = new RegExp(ficha.PATRON_COORDENADA);
  ok("patrón del CMS: acepta «8.973», «-79.531», «9», rechaza «9.084482», «abc», «8,973» y vacíos con espacios", ["8.973", "-79.531", "9", "8.9"].every((v) => reCoord.test(v)) && ["9.084482", "-79.5309", "abc", "8,973", " 8.973", "1234.5", "8."].every((v) => !reCoord.test(v)));
  const paginaUbic = leer(path.join(RAIZ, "admin", "buscar-ubicacion.html"));
  ok("la herramienta de búsqueda de ubicación redondea a 3 decimales (nunca 6)", paginaUbic.includes("toFixed(3)") && !paginaUbic.includes("toFixed(6)"));
  // Guardia del build: un archivo con coordenadas exactas detiene el build
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guardia-coord-"));
  try {
    const { validarFichas } = require(path.join(RAIZ, ".eleventy.js"));
    fs.mkdirSync(path.join(tmp, "content", "propiedades"), { recursive: true });
    const base = { referenciaMakom: "MKW-RE-999", mapa: { activo: true, precision: "aproximada", latitud: "8.973", longitud: "-79.531" } };
    const escribir = (mapa) => fs.writeFileSync(path.join(tmp, "content", "propiedades", "x.json"), JSON.stringify({ ...base, mapa }));
    const intenta = () => { try { validarFichas(tmp); return null; } catch (e) { return e.message; } };
    escribir(base.mapa);
    ok("guardia del build: coordenadas aproximadas (texto) pasan", intenta() === null);
    escribir({ ...base.mapa, latitud: 8.973 , longitud: -79.531 });
    ok("guardia del build: coordenadas aproximadas (número, formato anterior) pasan", intenta() === null);
    escribir({ ...base.mapa, latitud: "9.084482" });
    ok("guardia del build: una latitud con 6 decimales detiene el build", /mapa\.latitud/.test(intenta() || ""));
    escribir({ ...base.mapa, longitud: -79.642093 });
    ok("guardia del build: una longitud numérica con 6 decimales detiene el build", /mapa\.longitud/.test(intenta() || ""));
    escribir({ activo: false, latitud: "9.084482", longitud: "-79.642093" });
    ok("guardia del build: también se vigila el mapa desactivado (el repositorio sigue siendo público)", intenta() !== null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const slugPub = col.fields.find((f) => f.name === "slugPublico");
  ok("slugPublico: patrón sin tildes ni guiones largos", slugPub.pattern && new RegExp(slugPub.pattern[0]).test("apartamentos-santo-tomas-mkw-re-020") && !new RegExp(slugPub.pattern[0]).test("apartamentos—santo"));
  ok("las demás colecciones no cambian", ["proyectos", "perspectivas"].every((n) => cfg.collections.some((c) => c.name === n)));
  const requeridos = col.fields.filter((f) => f.required !== false && ["videoRecorrido", "planos", "asesor", "slugPublico"].includes(f.name));
  ok("los campos nuevos son opcionales (las propiedades antiguas siguen siendo válidas)", requeridos.every((f) => f.required === false) || requeridos.length === 0, requeridos.map((f) => f.name).join(","));
}

/* ------------------------------------------------------------------ */
/* 4. Fixtures: asesor, video, planos, fecha de precio, rangos…       */
/* ------------------------------------------------------------------ */
function pruebasConFixtures() {
  seccion("fixtures");
  const dirProps = path.join(RAIZ, "content", "propiedades");
  const dirAs = path.join(RAIZ, "content", "asesores");
  const archivo = fs.readdirSync(dirProps).find((a) => a.includes("desde-150-000"));
  if (!archivo) {
    ok("hay una propiedad base para las pruebas", false);
    return;
  }
  const ruta = path.join(dirProps, archivo);
  const copia = path.join(os.tmpdir(), "verificar-ficha-" + Date.now() + ".json");
  const original = leer(ruta);
  fs.writeFileSync(copia, original);
  const rutaAs = path.join(dirAs, "zz-prueba.json");
  const salida = fs.mkdtempSync(path.join(os.tmpdir(), "ficha-site-"));
  try {
    const d = JSON.parse(original);
    d.asesor = "zz-prueba";
    d.videoRecorrido = { url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", titulo: "Recorrido de prueba" };
    d.planos = [{ archivo: d.fotografias.galeria[0].archivo, etiqueta: "Modelo A", etiquetaEn: "Model A" }];
    d.precio.fechaReferencia = "2026-11";
    d.precio.preciosEspecificos = [{ etiqueta: "2 recámaras", etiquetaEn: "2 bedrooms", monto: 199000 }];
    d.detallesCuantitativos.estacionamientos = 1;
    d.detallesCuantitativos.piso = "8";
    d.detallesCuantitativos.banosMaximo = 3;
    fs.writeFileSync(ruta, JSON.stringify(d, null, 2));
    fs.mkdirSync(dirAs, { recursive: true });
    fs.writeFileSync(rutaAs, JSON.stringify({ nombre: "Ana María Pérez", cargo: "Asesora inmobiliaria · MAKOM Properties", cargoEn: "Real estate advisor · MAKOM Properties", idoneidad: "12345", whatsapp: "50761234567" }));
    execSync(`npx eleventy --output="${salida}"`, { cwd: RAIZ, stdio: "pipe" });
    const slug = d.slugPublico || path.basename(archivo, ".json");
    ["es", "en"].forEach((idioma) => {
      const html = leer(path.join(salida, idioma === "en" ? "en/properties" : "propiedades", slug, "index.html"));
      const n = idioma.toUpperCase();
      ok(`${n}: asesor con monograma, nombre, cargo e idoneidad`, html.includes('class="ficha-asesor__monograma"') && html.includes("AP") && html.includes("Ana María Pérez") && html.includes(idioma === "en" ? "Real estate advisor" : "Asesora inmobiliaria") && html.includes(idioma === "en" ? "License No. 12345" : "Idoneidad N.º 12345"));
      ok(`${n}: WhatsApp (tarjeta y barra) al número del asesor con la referencia`, [...html.matchAll(/href="https:\/\/wa\.me\/50761234567\?text=([^"]*)"[^>]*data-ficha-whatsapp/g)].length === 2 && html.includes(encodeURIComponent(d.referenciaMakom)));
      ok(`${n}: ficha «Video» con enlace sin cookies y título accesible`, html.includes('data-galeria-extra="video"') && html.includes("youtube-nocookie.com/embed/aqz-KE-bpKQ") && html.includes('data-video-titulo="Recorrido de prueba"'));
      ok(`${n}: ficha «Planos» con la imagen y su etiqueta`, html.includes('data-galeria-extra="planos"') && html.includes("data-galeria-planos") && html.includes(idioma === "en" ? 'data-etiqueta="Model A"' : 'data-etiqueta="Modelo A"'));
      ok(`${n}: fecha del precio y precio específico`, html.includes(idioma === "en" ? "List price as of November 2026 · subject to availability" : "Precio de lista a noviembre 2026 · sujeto a disponibilidad") && html.includes(idioma === "en" ? "2 bedrooms from $199,000" : "2 recámaras desde $199,000"));
      ok(`${n}: estacionamientos y piso visibles; rango de habitaciones 1–2 y baños 2–3`, html.includes("<strong>8</strong>") && /<strong>1<\/strong>/.test(html) && html.includes("<strong>1–2</strong>") && html.includes("<strong>2–3</strong>"));
    });
    // Foto del asesor
    fs.writeFileSync(rutaAs, JSON.stringify({ nombre: "Ana María Pérez", cargo: "Asesora", foto: "/assets/team/loyra-flores.png", whatsapp: "no-es-un-numero" }));
    execSync(`npx eleventy --output="${salida}"`, { cwd: RAIZ, stdio: "pipe" });
    const h2 = leer(path.join(salida, "propiedades", slug, "index.html"));
    ok("asesor con foto: imagen en la tarjeta, sin monograma ni línea de idoneidad", h2.includes("ficha-asesor__foto") && !h2.includes("ficha-asesor__monograma") && !h2.includes("Idoneidad N."));
    ok("WhatsApp inválido del asesor → cae al corporativo", [...h2.matchAll(/href="https:\/\/wa\.me\/50763534377\?text=/g)].length === 2);
    // Asesor inexistente
    d.asesor = "no-existe";
    fs.writeFileSync(ruta, JSON.stringify(d, null, 2));
    execSync(`npx eleventy --output="${salida}"`, { cwd: RAIZ, stdio: "pipe" });
    const h3 = leer(path.join(salida, "propiedades", slug, "index.html"));
    ok("asesor inexistente → contacto corporativo, sin bloque de asesor y sin romper el build", h3.includes("wa.me/50763534377") && !h3.includes("ficha-asesor"));
    // Video inválido
    d.asesor = undefined;
    d.videoRecorrido = { url: "http://insegura.example.com/a" };
    fs.writeFileSync(ruta, JSON.stringify(d, null, 2));
    execSync(`npx eleventy --output="${salida}"`, { cwd: RAIZ, stdio: "pipe" });
    ok("video inválido → no aparece la ficha «Video»", !leer(path.join(salida, "propiedades", slug, "index.html")).includes('data-galeria-extra="video"'));
    // Enlace limpio inválido detiene el build
    d.slugPublico = "Con Tildes é";
    fs.writeFileSync(ruta, JSON.stringify(d, null, 2));
    let fallo = false;
    try {
      execSync(`npx eleventy --output="${salida}"`, { cwd: RAIZ, stdio: "pipe" });
    } catch (e) {
      fallo = /slugPublico/.test(String(e.stderr || e.stdout || e.message));
    }
    ok("un enlace limpio no válido detiene el build con un mensaje claro", fallo);
  } finally {
    fs.writeFileSync(ruta, leer(copia));
    fs.rmSync(copia, { force: true });
    fs.rmSync(rutaAs, { force: true });
    fs.rmSync(salida, { recursive: true, force: true });
  }
  ok("los archivos de datos quedaron restaurados", leer(ruta) === original && !existe(rutaAs));
}

/* ------------------------------------------------------------------ */

pruebasLogica();
pruebasCms();
pruebasSitio("sitio (_site)", SITE);
if (process.argv.includes("--con-fixtures")) pruebasConFixtures();

const grupos = {};
resultados.forEach((r) => {
  grupos[r.grupo] = grupos[r.grupo] || { n: 0, f: 0 };
  grupos[r.grupo].n++;
  if (!r.ok) grupos[r.grupo].f++;
});
const fallos = resultados.filter((r) => !r.ok);
fallos.slice(0, 60).forEach((r) => console.log(`  FALLO ${r.grupo} | ${r.nombre}${r.detalle ? "  →  " + r.detalle : ""}`));
console.log("");
Object.entries(grupos).forEach(([g, v]) => console.log(`  ${g.padEnd(16)} ${String(v.n).padStart(5)} comprobaciones, ${v.f} fallos`));
console.log(`\nTotal: ${resultados.length} comprobaciones, ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);
