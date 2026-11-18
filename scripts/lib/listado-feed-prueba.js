// Réplica para PRUEBAS de /admin/listado-propiedades.json (en producción lo genera el build: filtro «listadoAdminPropiedades» de .eleventy.js; el formato es el mismo):
//   { version: 2, total, propiedades: [ { k, estado }                                                  ← propiedades NO públicas (borrador, alquilada, vendida, archivada)
//                                       { k, estado, portada } ] }   ← públicas (disponible, reservada): solo la portada
// `k` = hash del nombre de archivo (claveListado de .eleventy.js). Las miniaturas se generan al pedirlas (webp de 480 px con sharp) y se sirven en la misma ruta pública
// que el sitio (/assets/propiedades/_optimizadas/…); solo existen para las propiedades públicas.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { claveListado } = require("../../.eleventy.js");

const ESTADOS_PUBLICOS = ["disponible", "reservada"];

exports.crearFeed = function (propiedades, raiz, sharp) {
  const porUrl = new Map(); // url de miniatura -> ruta pública del original
  const filas = Object.keys(propiedades)
    .filter((k) => k.endsWith(".json"))
    .map((k) => {
      const d = JSON.parse(propiedades[k].content);
      const fila = { k: claveListado(k.replace(/\.json$/, "")), estado: d.estado || null };
      if (!ESTADOS_PUBLICOS.includes(d.estado)) return fila;
      const galeria = (d.fotografias && d.fotografias.galeria) || [];
      const portada = galeria.find((f) => f.portada) || galeria[0] || null;
      let miniatura = null;
      if (portada) {
        miniatura = "/assets/propiedades/_optimizadas/th-" + crypto.createHash("sha1").update(portada.archivo).digest("hex").slice(0, 10) + "-480.webp";
        porUrl.set(miniatura, portada.archivo);
      }
      fila.portada = portada ? { original: portada.archivo, miniatura, ancho: 480, alto: 320 } : null;
      return fila;
    })
    .sort((a, b) => a.k.localeCompare(b.k));
  const cache = new Map();
  return {
    feed: { version: 2, total: filas.length, propiedades: filas },
    // Devuelve el webp de la miniatura o null (original inexistente: se comporta como una foto rota → 404; propiedad no pública: no existe).
    async miniatura(url) {
      if (!porUrl.has(url)) return null;
      if (cache.has(url)) return cache.get(url);
      const ruta = path.join(raiz, porUrl.get(url).replace(/^\//, ""));
      let buf = null;
      try { if (fs.existsSync(ruta)) buf = await sharp(ruta).resize({ width: 480 }).webp({ quality: 70 }).toBuffer(); } catch (e) { buf = null; }
      cache.set(url, buf);
      return buf;
    }
  };
};
