"use strict";

/**
 * Lógica pura (sin Eleventy ni navegador) de la ficha de propiedad:
 * rangos de habitaciones/baños, fecha de referencia del precio, precios
 * específicos, video del recorrido, zona aproximada del mapa, asesor,
 * enlace limpio e iconos. Se registra como filtros en .eleventy.js y
 * tiene pruebas propias en scripts/verificar-ficha.js.
 *
 * Regla de oro: NUNCA se inventan datos. Si un campo no existe o no es
 * válido, la función devuelve null/"" y la plantilla no muestra nada.
 */

const crypto = require("crypto");

/* ------------------------------------------------------------------ */
/* Enlace limpio                                                      */
/* ------------------------------------------------------------------ */

const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugPublicoValido(valor) {
  return typeof valor === "string" && PATRON_SLUG.test(valor) ? valor : null;
}

/* ------------------------------------------------------------------ */
/* Rangos de habitaciones y baños                                     */
/* ------------------------------------------------------------------ */

function esNumero(n) {
  return typeof n === "number" && Number.isFinite(n);
}

// "1–2" cuando hay un máximo mayor que el mínimo; "Desde 1" / "From 1" si se
// pidió; el valor simple en cualquier otro caso. null si no hay dato.
function rangoDetalle(minimo, maximo, desde, lang) {
  if (!esNumero(minimo)) return null;
  if (esNumero(maximo) && maximo > minimo) return `${minimo}–${maximo}`;
  if (desde === true) return `${lang === "en" ? "From" : "Desde"} ${minimo}`;
  return String(minimo);
}

/* ------------------------------------------------------------------ */
/* Precio: fecha de referencia y precios específicos                  */
/* ------------------------------------------------------------------ */

const MESES = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

// Acepta "2026-11", "2026-11-05", "2026-11-05T00:00:00.000Z" y "11/2026".
function parseMesAno(valor) {
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  let m = /^(\d{4})-(\d{2})(?:-\d{2})?(?:T.*)?$/.exec(t);
  if (m) return { ano: +m[1], mes: +m[2] };
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return { ano: +m[2], mes: +m[1] };
  return null;
}

function fechaReferenciaTexto(precio, lang) {
  const f = precio && parseMesAno(precio.fechaReferencia);
  if (!f || f.mes < 1 || f.mes > 12 || f.ano < 2000 || f.ano > 2100) return null;
  const mes = (lang === "en" ? MESES.en : MESES.es)[f.mes - 1];
  return lang === "en"
    ? `List price as of ${mes} ${f.ano} · subject to availability`
    : `Precio de lista a ${mes} ${f.ano} · sujeto a disponibilidad`;
}

function preciosEspecificosTexto(precio, lang) {
  const lista = precio && Array.isArray(precio.preciosEspecificos) ? precio.preciosEspecificos : [];
  return lista
    .filter((p) => p && esNumero(p.monto) && p.monto > 0 && (p.etiqueta || p.etiquetaEn))
    .map((p) => {
      const etiqueta = lang === "en" ? p.etiquetaEn || p.etiqueta : p.etiqueta || p.etiquetaEn;
      const monto = "$" + p.monto.toLocaleString("en-US");
      return lang === "en" ? `${etiqueta} from ${monto}` : `${etiqueta} desde ${monto}`;
    });
}

/* ------------------------------------------------------------------ */
/* Video del recorrido                                                */
/* ------------------------------------------------------------------ */

// Devuelve { tipo, embedUrl|src, url, poster, titulo } o null. Solo https (o un
// archivo del propio sitio) y solo YouTube, Vimeo o un .mp4/.webm directo.
function videoDe(video) {
  if (!video || typeof video !== "object") return null;
  const titulo = typeof video.titulo === "string" && video.titulo.trim() ? video.titulo.trim() : null;
  const poster = typeof video.poster === "string" && video.poster.startsWith("/assets/") ? video.poster : null;
  const url = typeof video.url === "string" ? video.url.trim() : "";
  if (url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let id = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
        if (m) id = m[1];
      }
    }
    if (id && /^[A-Za-z0-9_-]{6,15}$/.test(id)) {
      return { tipo: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1`, url, poster, titulo, miniatura: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const m = /\/(?:video\/)?(\d{6,12})(?:\/([0-9a-f]{6,12}))?/.exec(u.pathname);
      if (m) {
        const h = m[2] || u.searchParams.get("h");
        return { tipo: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}?dnt=1&autoplay=1${h && /^[0-9a-f]{6,12}$/.test(h) ? "&h=" + h : ""}`, url, poster, titulo, miniatura: null };
      }
    }
    if (/\.(mp4|webm)$/i.test(u.pathname)) return { tipo: "archivo", src: url, url, poster, titulo, miniatura: null };
    return null;
  }
  const archivo = typeof video.archivo === "string" ? video.archivo : "";
  if (archivo.startsWith("/assets/") && /\.(mp4|webm)$/i.test(archivo)) {
    return { tipo: "archivo", src: archivo, url: archivo, poster, titulo, miniatura: null };
  }
  return null;
}

// Planos: solo imágenes del propio sitio (/assets/…) con un archivo real.
function planosValidos(planos) {
  return (Array.isArray(planos) ? planos : []).filter((p) => p && typeof p.archivo === "string" && p.archivo.startsWith("/assets/") && /\.(jpe?g|png|webp)$/i.test(p.archivo));
}

/* ------------------------------------------------------------------ */
/* Mapa: zona aproximada                                              */
/* ------------------------------------------------------------------ */

const RADIO_ZONA_M = 450; // radio del círculo que se dibuja (m)
const DESPLAZAMIENTO_MIN_M = 90; // el centro publicado se aleja del punto real entre 90 y 170 m
const DESPLAZAMIENTO_MAX_M = 170;

// El sitio nunca publica la ubicación exacta: el centro del círculo es el punto
// guardado en el CMS desplazado a propósito (distancia y dirección deterministas a
// partir de la referencia de la propiedad) y redondeado a 3 decimales. Con un radio
// de 450 m el punto real queda siempre dentro del círculo, pero el centro ya no lo
// delata. La opción antigua «exacta» del CMS se ignora: siempre se publica la zona.
function mapaPublico(mapa, semilla) {
  if (!mapa || mapa.activo !== true) return null;
  if (!esNumero(mapa.latitud) || !esNumero(mapa.longitud)) return null;
  const h = crypto.createHash("sha256").update(String(semilla || "makom")).digest();
  const angulo = (h.readUInt16BE(0) / 65535) * 2 * Math.PI;
  const dist = DESPLAZAMIENTO_MIN_M + (h.readUInt16BE(2) / 65535) * (DESPLAZAMIENTO_MAX_M - DESPLAZAMIENTO_MIN_M);
  const dLat = (dist * Math.sin(angulo)) / 111320;
  const dLng = (dist * Math.cos(angulo)) / (111320 * Math.cos((mapa.latitud * Math.PI) / 180));
  const redondear = (n) => Math.round(n * 1000) / 1000;
  let lat = redondear(mapa.latitud + dLat);
  let lng = redondear(mapa.longitud + dLng);
  // Si el redondeo devolviera exactamente una coordenada guardada (p. ej. un punto con 3 decimales), se mueve un paso de 0,001° (~110 m):
  // ninguna de las dos coordenadas publicadas coincide nunca con la real. El punto real sigue dentro del círculo (peor caso ≈ 360 m de 450 m).
  if (lat === mapa.latitud) lat = redondear(lat + (dLat >= 0 ? 0.001 : -0.001));
  if (lng === mapa.longitud) lng = redondear(lng + (dLng >= 0 ? 0.001 : -0.001));
  return {
    lat,
    lng,
    zoom: esNumero(mapa.nivelZoom) ? Math.min(16, Math.max(12, mapa.nivelZoom)) : 15,
    radio: RADIO_ZONA_M,
    aproximada: true,
  };
}

// Distancia (m) entre dos puntos: la usan las pruebas para confirmar que el punto
// real sigue dentro del círculo publicado.
function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------------------ */
/* Asesor asignado                                                    */
/* ------------------------------------------------------------------ */

function iniciales(nombre) {
  const partes = String(nombre || "")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "";
  const primera = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primera + ultima).toLocaleUpperCase("es");
}

// Devuelve el perfil público del asesor o null. El WhatsApp solo se acepta con 8 a
// 15 dígitos; si no es válido, la tarjeta cae al contacto corporativo.
function asesorPublico(asesor, lang) {
  if (!asesor || typeof asesor !== "object" || !asesor.nombre) return null;
  const wa = typeof asesor.whatsapp === "string" && /^[0-9]{8,15}$/.test(asesor.whatsapp) ? asesor.whatsapp : null;
  return {
    slug: asesor.slug || null,
    nombre: asesor.nombre,
    cargo: lang === "en" ? asesor.cargoEn || asesor.cargo || "" : asesor.cargo || asesor.cargoEn || "",
    idoneidad: typeof asesor.idoneidad === "string" && asesor.idoneidad.trim() ? asesor.idoneidad.trim() : null,
    foto: typeof asesor.foto === "string" && asesor.foto ? asesor.foto : null,
    iniciales: iniciales(asesor.nombre),
    whatsapp: wa,
  };
}

/* ------------------------------------------------------------------ */
/* Iconos                                                             */
/* ------------------------------------------------------------------ */

function iconoDe(valor, mapa) {
  return (mapa && mapa[valor]) || "generico";
}

module.exports = {
  slugPublicoValido,
  rangoDetalle,
  fechaReferenciaTexto,
  preciosEspecificosTexto,
  videoDe,
  planosValidos,
  mapaPublico,
  distanciaMetros,
  asesorPublico,
  iniciales,
  iconoDe,
  RADIO_ZONA_M,
};
