#!/usr/bin/env node
"use strict";

/**
 * Buscador premium — Bloque 3: verificación del catálogo de zonas.
 *
 * Fuente única de verdad: las claves "regiones" y "zonas" de
 * _data/propiedadesConfig.json (identificadores técnicos y etiquetas
 * ES/EN). Decap CMS no puede leer ese archivo, así que el selector
 * "zona" de admin/config.yml repite las opciones; esta verificación
 * impide que ambas listas diverjan sin que nadie lo note.
 *
 * Se ejecuta de dos formas, con la misma lógica:
 *   - automáticamente en cada `npm run build` (evento eleventy.before
 *     en .eleventy.js), donde cualquier error detiene el build;
 *   - a mano: `node scripts/verificar-zonas.js`.
 *
 * Privacidad: de cada propiedad solo se consulta la clave pública
 * "zona". Ningún otro campo se lee, imprime ni compara.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const FORMATO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CLAVES_PERMITIDAS = {
  regiones: ["valor", "etiqueta", "etiquetaEn"],
  zonas: ["valor", "region", "etiqueta", "etiquetaEn"],
};
// Separador de las etiquetas del selector del CMS: "Región › Zona".
const SEPARADOR_ETIQUETA = " › ";

function esTextoNoVacio(valor) {
  return typeof valor === "string" && valor.trim() !== "";
}

function verificarCatalogo(catalogo, errores) {
  const regiones = catalogo.regiones;
  const zonas = catalogo.zonas;

  if (!Array.isArray(regiones) || regiones.length === 0) {
    errores.push('_data/propiedadesConfig.json no tiene una lista "regiones" válida.');
    return false;
  }
  if (!Array.isArray(zonas) || zonas.length === 0) {
    errores.push('_data/propiedadesConfig.json no tiene una lista "zonas" válida.');
    return false;
  }

  const ids = new Set();
  const idsRegion = new Set();

  [["regiones", regiones], ["zonas", zonas]].forEach(([nombre, lista]) => {
    lista.forEach((item, i) => {
      const donde = `${nombre}[${i}]`;
      Object.keys(item || {}).forEach((clave) => {
        if (!CLAVES_PERMITIDAS[nombre].includes(clave)) {
          errores.push(`${donde} tiene la clave no permitida "${clave}".`);
        }
      });
      if (!item || !FORMATO_ID.test(item.valor || "")) {
        errores.push(`${donde}: "valor" debe ser un slug técnico en minúsculas (a-z, 0-9, guiones).`);
        return;
      }
      if (ids.has(item.valor)) {
        errores.push(`${donde}: el identificador "${item.valor}" está repetido.`);
      }
      ids.add(item.valor);
      if (nombre === "regiones") idsRegion.add(item.valor);
      if (!esTextoNoVacio(item.etiqueta)) errores.push(`${donde} ("${item.valor}") no tiene "etiqueta" en español.`);
      if (!esTextoNoVacio(item.etiquetaEn)) errores.push(`${donde} ("${item.valor}") no tiene "etiquetaEn" en inglés.`);
    });
  });

  zonas.forEach((zona) => {
    if (!idsRegion.has(zona.region)) {
      errores.push(`La zona "${zona.valor}" apunta a la región inexistente "${zona.region}".`);
    }
  });
  regiones.forEach((region) => {
    if (!zonas.some((z) => z.region === region.valor)) {
      errores.push(`La región "${region.valor}" no tiene ninguna zona.`);
    }
  });
  return true;
}

function verificarCms(catalogo, configYml, errores) {
  const campos = configYml.collections?.[0]?.fields || [];
  const campo = campos.find((f) => f.name === "zona");
  if (!campo) {
    errores.push('admin/config.yml no tiene un campo "zona" en la colección de propiedades.');
    return;
  }
  if (campo.widget !== "select") errores.push('El campo "zona" del CMS debe ser un select.');
  if (campo.required !== false) {
    errores.push('El campo "zona" del CMS debe declarar required: false (las propiedades existentes no la tienen).');
  }

  const opciones = campo.options || [];
  const valoresCms = opciones.map((o) => o.value);
  const valoresCatalogo = catalogo.zonas.map((z) => z.valor);
  if (new Set(valoresCms).size !== valoresCms.length) {
    errores.push('El campo "zona" del CMS tiene valores repetidos.');
  }
  if (JSON.stringify(valoresCms) !== JSON.stringify(valoresCatalogo)) {
    const faltan = valoresCatalogo.filter((v) => !valoresCms.includes(v));
    const sobran = valoresCms.filter((v) => !valoresCatalogo.includes(v));
    errores.push(
      `Las opciones de "zona" difieren entre admin/config.yml (${valoresCms.length}) y ` +
        `_data/propiedadesConfig.json (${valoresCatalogo.length}) en valores u orden.` +
        (faltan.length ? ` Faltan en el CMS: ${faltan.join(", ")}.` : "") +
        (sobran.length ? ` Sobran en el CMS: ${sobran.join(", ")}.` : "")
    );
  }

  const regionPorId = new Map(catalogo.regiones.map((r) => [r.valor, r]));
  opciones.forEach((opcion) => {
    const zona = catalogo.zonas.find((z) => z.valor === opcion.value);
    if (!zona) return;
    const region = regionPorId.get(zona.region);
    const esperada = `${region ? region.etiqueta : zona.region}${SEPARADOR_ETIQUETA}${zona.etiqueta}`;
    if (opcion.label !== esperada) {
      errores.push(`La etiqueta CMS de "${zona.valor}" es "${opcion.label}" y debería ser "${esperada}".`);
    }
  });
}

function verificarPropiedades(raiz, catalogo, errores) {
  const dir = path.join(raiz, "content", "propiedades");
  if (!fs.existsSync(dir)) return;
  const validas = new Set(catalogo.zonas.map((z) => z.valor));
  fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .forEach((archivo) => {
      let zona;
      try {
        // Solo se accede a la clave pública "zona".
        zona = JSON.parse(fs.readFileSync(path.join(dir, archivo), "utf8")).zona;
      } catch {
        errores.push(`content/propiedades/${archivo}: JSON no válido.`);
        return;
      }
      if (zona === undefined || zona === null || zona === "") return;
      if (!validas.has(zona)) {
        errores.push(`content/propiedades/${archivo}: la zona "${zona}" no existe en el catálogo.`);
      }
    });
}

// Devuelve la lista de errores (vacía si todo es consistente).
function verificarZonas(raiz) {
  const errores = [];
  const rutaCatalogo = path.join(raiz, "_data", "propiedadesConfig.json");
  const rutaConfigYml = path.join(raiz, "admin", "config.yml");

  let catalogo;
  let configYml;
  try {
    catalogo = JSON.parse(fs.readFileSync(rutaCatalogo, "utf8"));
  } catch (e) {
    return [`No se pudo leer _data/propiedadesConfig.json: ${e.message}`];
  }
  try {
    configYml = yaml.load(fs.readFileSync(rutaConfigYml, "utf8"));
  } catch (e) {
    return [`No se pudo leer admin/config.yml: ${e.message}`];
  }

  if (verificarCatalogo(catalogo, errores)) {
    verificarCms(catalogo, configYml, errores);
    verificarPropiedades(raiz, catalogo, errores);
  }
  return errores;
}

// Igual que verificarZonas, pero lanza un error si algo falla (para el
// evento eleventy.before: detiene `npm run build`).
function validarZonas(raiz) {
  const errores = verificarZonas(raiz);
  if (errores.length > 0) {
    throw new Error(
      "Validación del catálogo de zonas falló:\n" +
        errores.map((e) => `  - ${e}`).join("\n") +
        "\nActualiza admin/config.yml y _data/propiedadesConfig.json para que coincidan."
    );
  }
}

module.exports = { verificarZonas, validarZonas };

if (require.main === module) {
  const raiz = path.join(__dirname, "..");
  const errores = verificarZonas(raiz);
  if (errores.length > 0) {
    console.error("Catálogo de zonas: FALLÓ\n" + errores.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, "_data", "propiedadesConfig.json"), "utf8"));
  console.log(
    `Catálogo de zonas: OK (${catalogo.regiones.length} regiones, ${catalogo.zonas.length} zonas; ` +
      "CMS coincide con el catálogo; ninguna propiedad con zona inválida)."
  );
}
