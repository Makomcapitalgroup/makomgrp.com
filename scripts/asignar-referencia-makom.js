#!/usr/bin/env node
"use strict";

/**
 * Milestone 12 — Etapa 8B: asignador local de Referencia MAKOM.
 *
 * Responsabilidad ÚNICA de este script: encontrar propiedades con
 * "referenciaMakom": "PENDIENTE-ASIGNACION" y asignarles la siguiente
 * referencia consecutiva (MKW-RE-###), actualizando el contador
 * persistente. No toca git, no conoce GitHub, no hace commits — esa
 * responsabilidad es exclusiva de la Etapa 8C (GitHub Actions), que
 * envolverá esta misma lógica sin duplicarla.
 *
 * Uso:
 *   node scripts/asignar-referencia-makom.js            (ejecución real)
 *   node scripts/asignar-referencia-makom.js --dry-run   (solo muestra el plan)
 */

const fs = require("fs");
const path = require("path");

// Debe coincidir EXACTAMENTE con FORMATO_REFERENCIA_MAKOM en .eleventy.js
// (función validarReferenciasMakom). No se extrajo a un módulo compartido
// en esta etapa porque hacerlo exigiría modificar .eleventy.js, fuera de
// alcance explícito de la Etapa 8B — ver el reporte de esta etapa para
// el análisis completo de esa decisión. Si esta expresión cambia alguna
// vez, debe actualizarse en ambos lugares a la vez.
const FORMATO_REFERENCIA_MAKOM = /^MKW-RE-(\d{3,})$/;
const PENDIENTE = "PENDIENTE-ASIGNACION";

const RAIZ = path.join(__dirname, "..");
const DIR_PROPIEDADES = path.join(RAIZ, "content", "propiedades");
const RUTA_SECUENCIA = path.join(RAIZ, "_data", "referenciaMakomSecuencia.json");

function rutaRelativa(rutaAbsoluta) {
  return path.relative(RAIZ, rutaAbsoluta);
}

function fallar(mensaje) {
  console.error(`ERROR: ${mensaje}`);
  process.exit(1);
}

// Escritura lo más segura posible con las herramientas nativas de Node:
// escribe primero a un archivo temporal y solo entonces lo renombra al
// destino final. Un rename dentro del mismo sistema de archivos es
// prácticamente atómico — nunca queda un archivo a medio escribir con
// el nombre real si el proceso se interrumpe durante la escritura.
function escribirArchivoSeguro(rutaFinal, contenido) {
  const rutaTemporal = `${rutaFinal}.tmp-${process.pid}`;
  fs.writeFileSync(rutaTemporal, contenido, "utf8");
  fs.renameSync(rutaTemporal, rutaFinal);
}

// Reemplaza ÚNICAMENTE el valor de "referenciaMakom" dentro del texto
// crudo del archivo — nunca se vuelve a serializar el JSON completo.
// Esto preserva indentación, orden de claves y salto de línea final
// exactamente como estaban, tal como exige la Etapa 8B.
function reemplazarReferenciaPendiente(contenidoCrudo, nuevaReferencia) {
  const patron = /("referenciaMakom"\s*:\s*")PENDIENTE-ASIGNACION(")/;
  return contenidoCrudo.replace(patron, `$1${nuevaReferencia}$2`);
}

function main() {
  const dryRun = process.argv.includes("--dry-run");

  // ------------------------------------------------------------
  // 1. Cargar y validar el contador ANTES de tocar cualquier propiedad.
  // ------------------------------------------------------------
  if (!fs.existsSync(RUTA_SECUENCIA)) {
    fallar(`No existe el archivo de contador: ${rutaRelativa(RUTA_SECUENCIA)}`);
  }

  let secuencia;
  try {
    secuencia = JSON.parse(fs.readFileSync(RUTA_SECUENCIA, "utf8"));
  } catch (err) {
    fallar(`${rutaRelativa(RUTA_SECUENCIA)} no es un JSON válido: ${err.message}`);
  }

  const { ultimoNumero } = secuencia;
  if (!Number.isInteger(ultimoNumero) || ultimoNumero < 1) {
    fallar(
      `"ultimoNumero" en ${rutaRelativa(RUTA_SECUENCIA)} debe ser un entero >= 1 ` +
        `(valor actual: ${JSON.stringify(ultimoNumero)}).`
    );
  }

  // ------------------------------------------------------------
  // 2. Leer TODAS las propiedades. Orden alfabético por nombre de
  //    archivo — determinista y reproducible, tal como se documentó
  //    en el diseño de esta etapa.
  // ------------------------------------------------------------
  if (!fs.existsSync(DIR_PROPIEDADES)) {
    console.log("No existe content/propiedades/ — nada que hacer.");
    process.exit(0);
  }

  const archivos = fs
    .readdirSync(DIR_PROPIEDADES)
    .filter((a) => a.endsWith(".json"))
    .sort();

  const pendientes = [];
  const numerosExistentes = new Map(); // numero -> [rutaRelativa, ...]
  const datosPorArchivo = new Map(); // archivo -> { contenidoCrudo, rutaCompleta, rutaRel }
  let maximoExistente = 0;

  for (const archivo of archivos) {
    const rutaCompleta = path.join(DIR_PROPIEDADES, archivo);
    const rutaRel = path.join("content", "propiedades", archivo);

    let contenidoCrudo;
    try {
      contenidoCrudo = fs.readFileSync(rutaCompleta, "utf8");
    } catch (err) {
      fallar(`No se pudo leer ${rutaRel}: ${err.message}`);
    }

    let datos;
    try {
      datos = JSON.parse(contenidoCrudo);
    } catch (err) {
      fallar(`JSON inválido en ${rutaRel}: ${err.message}`);
    }

    datosPorArchivo.set(archivo, { contenidoCrudo, rutaCompleta, rutaRel });

    const referencia = datos.referenciaMakom;

    if (referencia === PENDIENTE) {
      pendientes.push(archivo);
      continue;
    }

    if (referencia === undefined || referencia === null || referencia === "") {
      fallar(`Referencia MAKOM faltante en ${rutaRel} (ni asignada ni "${PENDIENTE}").`);
    }

    const coincidencia = FORMATO_REFERENCIA_MAKOM.exec(referencia);
    if (!coincidencia) {
      fallar(
        `Referencia MAKOM inválida "${referencia}" en ${rutaRel}. ` +
          `Formato esperado: MKW-RE-### (3 o más dígitos, ej. MKW-RE-001).`
      );
    }

    const numero = parseInt(coincidencia[1], 10);
    maximoExistente = Math.max(maximoExistente, numero);
    if (!numerosExistentes.has(numero)) numerosExistentes.set(numero, []);
    numerosExistentes.get(numero).push(rutaRel);
  }

  // Duplicados entre las referencias YA asignadas (antes de asignar nada nuevo).
  for (const [numero, archivosConEseNumero] of numerosExistentes) {
    if (archivosConEseNumero.length > 1) {
      fallar(
        `Referencia MAKOM duplicada MKW-RE-${String(numero).padStart(3, "0")} en:\n` +
          archivosConEseNumero.map((a) => `      ${a}`).join("\n")
      );
    }
  }

  // El contador nunca puede estar por debajo de lo que ya existe en disco.
  // Nunca se corrige solo — es un error explícito que requiere intervención.
  if (ultimoNumero < maximoExistente) {
    fallar(
      `"ultimoNumero" (${ultimoNumero}) es menor que la referencia más alta ya utilizada ` +
        `(${maximoExistente}). El contador nunca se ajusta automáticamente hacia arriba.`
    );
  }

  // ------------------------------------------------------------
  // 3. Sin pendientes → salida limpia e idempotente.
  // ------------------------------------------------------------
  if (pendientes.length === 0) {
    console.log("No hay referencias MAKOM pendientes de asignación.");
    process.exit(0);
  }

  // ------------------------------------------------------------
  // 4. Calcular TODAS las asignaciones en memoria antes de escribir nada.
  // ------------------------------------------------------------
  let siguienteNumero = ultimoNumero;
  const asignaciones = pendientes.map((archivo) => {
    siguienteNumero += 1;
    return {
      archivo,
      referencia: `MKW-RE-${String(siguienteNumero).padStart(3, "0")}`,
    };
  });

  if (dryRun) {
    console.log("Asignaciones propuestas:");
    asignaciones.forEach((a) => console.log(`  ${a.archivo} → ${a.referencia}`));
    console.log(`\nNuevo ultimoNumero sería: ${siguienteNumero}`);
    console.log("\nDRY RUN — no se modificó ningún archivo.");
    process.exit(0);
  }

  // ------------------------------------------------------------
  // 5. Escritura segura: primero se preparan todos los contenidos
  //    nuevos en memoria y se validan; luego se escriben las
  //    propiedades (vía archivo temporal + rename); el contador se
  //    actualiza únicamente al final, solo si todas las propiedades
  //    se escribieron sin error. Si algo falla a mitad de camino, el
  //    contador queda sin tocar — y la próxima ejecución, al recalcular
  //    "maximoExistente" desde disco, detectaría cualquier inconsistencia
  //    (contador por debajo de una referencia ya escrita) y fallaría
  //    explícitamente en vez de reasignar un número ya usado.
  // ------------------------------------------------------------
  const escrituras = asignaciones.map((asignacion) => {
    const { contenidoCrudo, rutaCompleta, rutaRel } = datosPorArchivo.get(asignacion.archivo);
    const nuevoContenido = reemplazarReferenciaPendiente(contenidoCrudo, asignacion.referencia);
    if (nuevoContenido === contenidoCrudo) {
      fallar(
        `No se pudo localizar el campo "referenciaMakom": "${PENDIENTE}" en ${rutaRel} para reemplazarlo.`
      );
    }
    return { rutaCompleta, nuevoContenido };
  });

  for (const { rutaCompleta, nuevoContenido } of escrituras) {
    escribirArchivoSeguro(rutaCompleta, nuevoContenido);
  }

  const nuevaSecuencia = { ...secuencia, ultimoNumero: siguienteNumero };
  escribirArchivoSeguro(RUTA_SECUENCIA, JSON.stringify(nuevaSecuencia, null, 2) + "\n");

  // ------------------------------------------------------------
  // 6. Reporte — nunca imprime el contenido completo de una propiedad.
  // ------------------------------------------------------------
  console.log(`Propiedades pendientes encontradas: ${pendientes.length}`);
  asignaciones.forEach((a) => console.log(`  ${a.archivo} → ${a.referencia}`));
  console.log(`Nuevo ultimoNumero: ${siguienteNumero}`);
  console.log(`Archivos modificados: ${asignaciones.length + 1} (propiedades + contador)`);

  process.exit(0);
}

main();
