const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const yaml = require("js-yaml");
const { eleventyImageTransformPlugin } = require("@11ty/eleventy-img");
const Image = require("@11ty/eleventy-img").default;

// Milestone 9: fecha real de última modificación de un archivo, tomada
// del historial de git (fecha del último commit que lo tocó) — nunca
// la fecha del build. Google trata <lastmod> del sitemap como señal de
// confianza solo si es consistentemente real; una fecha fabricada en
// cada build (ej. "hoy") sería peor que no incluir <lastmod>. Devuelve
// null si el archivo no tiene historial de git todavía (ej. contenido
// nuevo sin commitear) — la plantilla debe omitir <lastmod> en ese caso,
// nunca inventar un valor de respaldo.
function fechaModificacionGit(rutaRelativaDesdeRaiz) {
  try {
    const salida = execSync(`git log -1 --format=%cI -- "${rutaRelativaDesdeRaiz}"`, {
      cwd: __dirname,
      encoding: "utf8",
    }).trim();
    return salida || null;
  } catch {
    return null;
  }
}

// Compara las opciones de los campos "detalles" y "amenidades" en
// admin/config.yml contra las listas canónicas de
// _data/propiedadesConfig.json. Lanza un error de build (detiene
// `npm run build`) si divergen, para que una lista nunca quede
// desincronizada de la otra sin que alguien lo note.
function validarConfigCmsContraFuenteCentral(raiz) {
  const rutaConfigYml = path.join(raiz, "admin", "config.yml");
  const rutaConfigCentral = path.join(raiz, "_data", "propiedadesConfig.json");
  if (!fs.existsSync(rutaConfigYml) || !fs.existsSync(rutaConfigCentral)) return;

  const configYml = yaml.load(fs.readFileSync(rutaConfigYml, "utf8"));
  const configCentral = JSON.parse(fs.readFileSync(rutaConfigCentral, "utf8"));

  const campos = configYml.collections?.[0]?.fields || [];
  const errores = [];

  ["detalles", "amenidades"].forEach((nombreCampo) => {
    const campo = campos.find((f) => f.name === nombreCampo);
    if (!campo) {
      errores.push(`admin/config.yml no tiene un campo "${nombreCampo}".`);
      return;
    }
    const valoresYml = (campo.options || []).map((o) => o.value).sort();
    const valoresCentral = (configCentral[nombreCampo] || []).map((o) => o.valor).sort();
    if (JSON.stringify(valoresYml) !== JSON.stringify(valoresCentral)) {
      errores.push(
        `"${nombreCampo}" difiere entre admin/config.yml (${valoresYml.length} opciones) y ` +
          `_data/propiedadesConfig.json (${valoresCentral.length} opciones).`
      );
    }
  });

  if (errores.length > 0) {
    throw new Error(
      "Validación de configuración del CMS falló:\n" +
        errores.map((e) => `  - ${e}`).join("\n") +
        "\nActualiza admin/config.yml y _data/propiedadesConfig.json para que coincidan."
    );
  }
}

// Milestone 13 — Etapa 3: convierte el Markdown básico que guarda el
// widget "richtext" del CMS (**bold**, _italic_, listas "- ") a texto
// plano — para los contextos que EXIGEN texto sin marcado: meta
// description, Open Graph, Twitter Card y "description" de JSON-LD.
// Nunca se usa para el HTML visible de la ficha (eso sigue resuelto
// por "descripcionHtml", que sí debe mostrar negrita/cursiva reales) —
// cada uno parte del mismo campo de origen pero para una necesidad
// distinta.
function textoPlanoDesdeMarkdown(texto) {
  if (!texto) return "";
  return texto
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\n+/g, " ")
    .replace(/[-*]\s+/g, "")
    .trim();
}

// Milestone 12 — Etapa 8A: valida en cada build que "referenciaMakom"
// de cada propiedad sea real, única y tenga el formato correcto
// (MKW-RE-### o superior), y que el contador persistente
// (_data/referenciaMakomSecuencia.json) nunca esté por debajo del
// número más alto ya asignado. Esta función SOLO valida — la
// asignación automática real (Etapa 8B/8C, todavía no implementada)
// vivirá en GitHub Actions, el único punto donde es posible serializar
// la asignación sin riesgo de que dos administradores obtengan la
// misma referencia (ver diseño de la Etapa 7).
const FORMATO_REFERENCIA_MAKOM = /^MKW-RE-(\d{3,})$/;

function validarReferenciasMakom(raiz) {
  const dirPropiedades = path.join(raiz, "content", "propiedades");
  const rutaSecuencia = path.join(raiz, "_data", "referenciaMakomSecuencia.json");
  if (!fs.existsSync(dirPropiedades)) return;

  const errores = [];
  const numerosVistos = new Map(); // numero (int) -> [archivos]
  let numeroMaximoAsignado = 0;

  const archivos = fs.readdirSync(dirPropiedades).filter((a) => a.endsWith(".json"));

  archivos.forEach((archivo) => {
    const rutaRelativa = path.join("content", "propiedades", archivo);
    const datos = JSON.parse(fs.readFileSync(path.join(dirPropiedades, archivo), "utf8"));
    const referencia = datos.referenciaMakom;

    if (referencia === undefined || referencia === null || referencia === "") {
      errores.push(`Referencia MAKOM faltante en:\n    ${rutaRelativa}`);
      return;
    }
    if (referencia === "PENDIENTE-ASIGNACION") {
      errores.push(
        `Referencia MAKOM pendiente de asignación en:\n    ${rutaRelativa}\n` +
          `    (todavía no se ha asignado un número real — la asignación automática` +
          ` se implementará en una etapa posterior)`
      );
      return;
    }

    const coincidencia = FORMATO_REFERENCIA_MAKOM.exec(referencia);
    if (!coincidencia) {
      errores.push(
        `Referencia MAKOM inválida:\n    ${referencia}\n    Archivo:\n    ${rutaRelativa}\n` +
          `    Formato esperado: MKW-RE-### (3 o más dígitos, ej. MKW-RE-001)`
      );
      return;
    }

    const numero = parseInt(coincidencia[1], 10);
    numeroMaximoAsignado = Math.max(numeroMaximoAsignado, numero);

    if (!numerosVistos.has(numero)) numerosVistos.set(numero, []);
    numerosVistos.get(numero).push(rutaRelativa);
  });

  numerosVistos.forEach((archivosConEsteNumero, numero) => {
    if (archivosConEsteNumero.length > 1) {
      errores.push(
        `Referencia MAKOM duplicada:\n    MKW-RE-${String(numero).padStart(3, "0")}\n    Archivos:\n` +
          archivosConEsteNumero.map((a) => `      ${a}`).join("\n")
      );
    }
  });

  // Coherencia del contador persistente — solo se exige si existe al
  // menos una propiedad con referencia válida que verificar contra él.
  if (fs.existsSync(rutaSecuencia)) {
    let secuencia;
    try {
      secuencia = JSON.parse(fs.readFileSync(rutaSecuencia, "utf8"));
    } catch {
      errores.push(`_data/referenciaMakomSecuencia.json no es un JSON válido.`);
      secuencia = null;
    }
    if (secuencia) {
      const { ultimoNumero } = secuencia;
      if (!Number.isInteger(ultimoNumero)) {
        errores.push(
          `_data/referenciaMakomSecuencia.json: "ultimoNumero" debe ser un entero (valor actual: ${JSON.stringify(
            ultimoNumero
          )}).`
        );
      } else if (ultimoNumero < 1) {
        errores.push(`_data/referenciaMakomSecuencia.json: "ultimoNumero" debe ser >= 1 (valor actual: ${ultimoNumero}).`);
      } else if (ultimoNumero < numeroMaximoAsignado) {
        errores.push(
          `_data/referenciaMakomSecuencia.json: "ultimoNumero" (${ultimoNumero}) es menor que el número más alto ` +
            `ya asignado en las propiedades (${numeroMaximoAsignado}). El contador nunca debe estar por debajo ` +
            `de una referencia ya existente.`
        );
      }
      // ultimoNumero > numeroMaximoAsignado es válido a propósito: puede
      // reflejar referencias históricas de propiedades ya eliminadas,
      // que nunca deben reutilizarse.
    }
  } else if (numeroMaximoAsignado > 0) {
    errores.push(
      `_data/referenciaMakomSecuencia.json no existe, pero ya hay propiedades con referencias asignadas ` +
        `(la más alta: MKW-RE-${String(numeroMaximoAsignado).padStart(3, "0")}).`
    );
  }

  if (errores.length > 0) {
    throw new Error(
      "Validación de Referencia MAKOM falló:\n\n" +
        errores.map((e) => `  - ${e}`).join("\n\n") +
        "\n"
    );
  }
}

module.exports = function (eleventyConfig) {
  // Milestone 1: andamiaje delimitado. Eleventy solo copia el sitio actual
  // tal cual (passthrough), sin procesarlo como plantilla. Nada se
  // transforma, reestructura ni recibe front matter todavía.
  // Milestone 9: "sitemap.xml" deja de copiarse tal cual — pasa a
  // generarse dinámicamente en cada build (ver content/sitemap.njk),
  // por lo que ya no aparece en esta lista de passthrough.
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("aviso-legal.html");
  eleventyConfig.addPassthroughCopy("privacidad.html");
  // Milestone 13: home y legales en inglés — misma lógica que sus
  // equivalentes en español (HTML estático, servido tal cual). Las
  // rutas GENERADAS en inglés (/en/properties/, /en/properties/<slug>/)
  // viven aparte, en content/propiedades-catalogo-en.njk y
  // content/propiedades-en.njk — Eleventy no tiene problema en que
  // ambos (passthrough + plantillas) escriban dentro de "_site/en/",
  // porque son archivos distintos.
  eleventyConfig.addPassthroughCopy("en");
  eleventyConfig.addPassthroughCopy("styles.css");
  eleventyConfig.addPassthroughCopy("script.js");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("MAKOM_Logo_Files_v4.0");

  // Milestone 6: /admin/ se sirve tal cual (Decap CMS se carga por CDN
  // dentro de admin/index.html) — nunca se procesa como plantilla ni se
  // referencia desde ninguna página pública.
  eleventyConfig.addPassthroughCopy("admin");

  // Milestone 8: Leaflet servido localmente (npm), no desde un CDN —
  // preferencia técnica explícita para minimizar dominios externos de
  // JS/CSS. Los tiles de OpenStreetMap siguen siendo necesariamente
  // externos (no se pueden auto-alojar en este alcance). Solo se carga
  // en páginas de ficha individual con mapa.activo=true — ver
  // _includes/propiedad.njk.
  eleventyConfig.addPassthroughCopy({
    "node_modules/leaflet/dist/leaflet.js": "assets/vendor/leaflet/leaflet.js",
    "node_modules/leaflet/dist/leaflet.css": "assets/vendor/leaflet/leaflet.css",
    "node_modules/leaflet/dist/images": "assets/vendor/leaflet/images",
  });

  // Milestone 7: optimización automática de fotografías de propiedades.
  // "Image HTML Transform" (recomendado por la documentación oficial de
  // @11ty/eleventy-img) post-procesa cualquier <img> presente en el HTML
  // ya generado por Eleventy — nunca toca páginas servidas por
  // passthrough copy (index.html, aviso-legal.html, privacidad.html),
  // porque esas nunca pasan por el motor de plantillas. Solo afecta las
  // páginas que SÍ genera Eleventy: ficha individual y catálogo de
  // propiedades. Las imágenes de marca (logos SVG en header/footer) se
  // excluyen explícitamente con el atributo eleventy:ignore en las
  // plantillas — de lo contrario el plugin intentaría rasterizarlas.
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["webp", "jpeg"],
    // Ancho por defecto para tarjetas (Home/catálogo) y miniaturas. La
    // portada de la ficha individual pide anchos mayores explícitamente
    // vía el atributo eleventy:widths en su propia plantilla.
    widths: [400, 800],
    htmlOptions: {
      imgAttributes: {
        loading: "lazy",
        decoding: "async",
      },
    },
    outputDir: "_site/assets/propiedades/_optimizadas/",
    urlPath: "/assets/propiedades/_optimizadas/",
  });

  // Milestone 3: colección de propiedades leída directamente de
  // content/propiedades/*.json. Son archivos de datos puros (no
  // plantillas Eleventy), por lo que se leen a mano con fs — esto es
  // lo que permite generar una página por propiedad sin convertir esos
  // JSON en archivos con front matter.
  //
  // Milestone 6: "slug" ya NO se confía al valor que trae el JSON — se
  // deriva siempre del nombre de archivo real. Investigado durante este
  // milestone: el valor por defecto "{{slug}}" en un campo widget:hidden
  // de Decap CMS es conocido por no interpolarse de forma fiable (bug
  // reportado: decaporg/decap-cms#4022, #4787), mientras que el nombre
  // de archivo que Decap sí genera de forma fiable mediante `slug:
  // "{{slug}}"` a nivel de colección. Derivarlo del nombre de archivo
  // elimina esa fuente de datos inconsistente en vez de depender de un
  // campo que podría no coincidir con la URL real generada.
  // Milestone 9: se vuelve asíncrona para poder precalcular, una sola
  // vez por propiedad, la variante optimizada de la imagen social
  // (Open Graph) — igual que ya se hace para el feed de destacadas del
  // Home. También adjunta "_archivoRelativo" (ruta del JSON fuente,
  // relativa a la raíz del repo) para poder consultar su fecha real de
  // modificación en git al construir sitemap.xml. Ambos campos llevan
  // un guion bajo inicial para señalar que son de uso interno de build
  // — nunca se vuelcan tal cual a un feed público (los feeds públicos
  // siempre construyen su propio objeto explícito, campo por campo).
  eleventyConfig.addCollection("propiedades", async () => {
    const dir = path.join(__dirname, "content", "propiedades");
    if (!fs.existsSync(dir)) return [];
    const archivos = fs.readdirSync(dir).filter((archivo) => archivo.endsWith(".json"));
    return Promise.all(
      archivos.map(async (archivo) => {
        const datos = JSON.parse(fs.readFileSync(path.join(dir, archivo), "utf8"));
        datos.slug = path.basename(archivo, ".json");
        datos._archivoRelativo = path.join("content", "propiedades", archivo);
        const galeria = (datos.fotografias && datos.fotografias.galeria) || [];
        const portada = galeria.find((f) => f.portada) || galeria[0] || null;
        const origenImagenSocial = (datos.seo && datos.seo.imagenSocial) || (portada && portada.archivo) || null;
        const variante = await generarVarianteOptimizada(origenImagenSocial, { formatos: ["jpeg"], anchos: [1200] });
        datos._imagenOgUrl = variante ? variante.archivo : null;
        return datos;
      })
    );
  });

  // Milestone 14 — Etapa 2: colección de proyectos, mismo patrón que
  // "propiedades" (JSON puro leído a mano, slug derivado del nombre de
  // archivo real — nunca de un campo interno).
  eleventyConfig.addCollection("proyectos", () => {
    const dir = path.join(__dirname, "content", "proyectos");
    if (!fs.existsSync(dir)) return [];
    const archivos = fs.readdirSync(dir).filter((archivo) => archivo.endsWith(".json"));
    return archivos.map((archivo) => {
      const datos = JSON.parse(fs.readFileSync(path.join(dir, archivo), "utf8"));
      datos.slug = path.basename(archivo, ".json");
      datos._archivoRelativo = path.join("content", "proyectos", archivo);
      return datos;
    });
  });

  // Milestone 14 — Etapa 2: colección de perspectivas (artículos),
  // mismo patrón.
  eleventyConfig.addCollection("perspectivas", () => {
    const dir = path.join(__dirname, "content", "perspectivas");
    if (!fs.existsSync(dir)) return [];
    const archivos = fs.readdirSync(dir).filter((archivo) => archivo.endsWith(".json"));
    return archivos.map((archivo) => {
      const datos = JSON.parse(fs.readFileSync(path.join(dir, archivo), "utf8"));
      datos.slug = path.basename(archivo, ".json");
      datos._archivoRelativo = path.join("content", "perspectivas", archivo);
      return datos;
    });
  });

  // Milestone 6: valida, en cada build, que las listas de "detalles" y
  // "amenidades" del panel administrativo (admin/config.yml) no hayan
  // divergido de la fuente central (_data/propiedadesConfig.json). Son
  // dos archivos que Decap CMS no puede compartir de forma nativa (ver
  // reporte del Milestone 6) — esta validación es la mitigación acordada
  // en vez de una solución más compleja.
  eleventyConfig.on("eleventy.before", () => {
    validarConfigCmsContraFuenteCentral(__dirname);
    validarReferenciasMakom(__dirname);
  });

  // Resuelve una clave técnica (ej. "vista-mar") a su etiqueta pública
  // (ej. "Vista al mar") contra un catálogo de _data/propiedadesConfig.json.
  eleventyConfig.addFilter("etiqueta", (valor, catalogo) => {
    const item = (catalogo || []).find((i) => i.valor === valor);
    return item ? item.etiqueta : valor;
  });

  // Milestone 13 — bilingüe: misma resolución que "etiqueta" pero en
  // inglés ("etiquetaEn" del catálogo). Nunca deja un valor sin
  // traducir de forma silenciosa ni distinta a como ya se comporta
  // "etiqueta": si el catálogo no tiene el valor, cae al valor técnico
  // crudo — igual que el filtro en español.
  eleventyConfig.addFilter("etiquetaEn", (valor, catalogo) => {
    const item = (catalogo || []).find((i) => i.valor === valor);
    return item ? item.etiquetaEn || item.etiqueta : valor;
  });

  // Formatea el precio numérico almacenado según la operación.
  // Venta: "$485,000". Alquiler: "$2,500 / mes" ("$2,500 / month" en
  // inglés, vía el parámetro opcional "lang" — Milestone 13).
  eleventyConfig.addFilter("precioFormato", (precio, operacion, lang) => {
    if (!precio || typeof precio.monto !== "number") return "";
    const monto = precio.monto.toLocaleString("en-US");
    if (operacion === "alquiler") {
      const sufijos =
        lang === "en"
          ? { mensual: "month", quincenal: "two weeks", otra: "period" }
          : { mensual: "mes", quincenal: "quincena", otra: "período" };
      return `$${monto} / ${sufijos[precio.periodicidad] || sufijos.otra}`;
    }
    return `$${monto}`;
  });

  // Resumen automático para meta description SEO cuando no hay una
  // personalizada: primeros ~155 caracteres de la descripción, sin
  // marcado (incluye **bold**/_italic_ — Milestone 13), cortado en el
  // último espacio para no partir una palabra.
  eleventyConfig.addFilter("resumenSeo", (texto, maxLen = 155) => {
    const plano = textoPlanoDesdeMarkdown(texto);
    if (!plano) return "";
    if (plano.length <= maxLen) return plano;
    return plano.slice(0, plano.lastIndexOf(" ", maxLen)) + "…";
  });

  // Convierte el campo "descripcion" (Markdown básico que guarda el
  // widget "richtext" de Decap CMS — botones: bold, italic,
  // bulleted-list, numbered-list) en HTML: <p>/<br>, <ul>/<ol><li> y
  // <strong>/<em>. Siempre escapa el texto ANTES de envolverlo en esas
  // etiquetas — nunca interpreta HTML arbitrario del CMS, solo el
  // subconjunto de marcado que el propio editor puede producir.
  eleventyConfig.addFilter("descripcionHtml", (texto) => {
    if (!texto) return "";
    const escapar = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const enLinea = (s) =>
      escapar(s)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/_(.+?)_/g, "<em>$1</em>");
    const bloques = texto.split(/\n\s*\n/);
    return bloques
      .map((bloque) => {
        const lineas = bloque.split("\n").filter((l) => l.trim() !== "");
        const esViñetas = lineas.length > 0 && lineas.every((l) => /^-\s+/.test(l.trim()));
        const esNumerada = lineas.length > 0 && lineas.every((l) => /^\d+\.\s+/.test(l.trim()));
        if (esViñetas) {
          const items = lineas.map((l) => `<li>${enLinea(l.trim().replace(/^-\s+/, ""))}</li>`).join("");
          return `<ul class="ficha-propiedad__lista">${items}</ul>`;
        }
        if (esNumerada) {
          const items = lineas.map((l) => `<li>${enLinea(l.trim().replace(/^\d+\.\s+/, ""))}</li>`).join("");
          return `<ol class="ficha-propiedad__lista">${items}</ol>`;
        }
        return `<p>${lineas.map(enLinea).join("<br>")}</p>`;
      })
      .join("\n");
  });

  // Determina la foto de portada de una galería: la marcada
  // explícitamente con portada:true (la PRIMERA marcada, si hubiera más
  // de una por error — .find() ya es determinista en ese sentido), o
  // la primera de la lista si ninguna está marcada.
  eleventyConfig.addFilter("portadaDe", (galeria) => {
    if (!galeria || galeria.length === 0) return null;
    return galeria.find((foto) => foto.portada) || galeria[0];
  });

  // Milestone 7: alt automático — si Loyra/Yurlio no escriben un texto
  // alternativo, se genera a partir del título y la ubicación pública
  // en vez de dejar el atributo alt vacío o repetir solo el título.
  eleventyConfig.addFilter("altAuto", (alt, titulo, ubicacionPublica) => {
    if (alt) return alt;
    return [titulo, ubicacionPublica].filter(Boolean).join(", ");
  });

  // Milestone 7: reordena la galería para la ficha individual — portada
  // primero (misma regla determinista de portadaDe: la marcada, o si
  // ninguna lo está, la primera), el resto conserva su orden original.
  // Separa "principal" (para la foto grande) de "miniaturas" (el resto)
  // para que la plantilla no tenga que hacer aritmética de índices.
  eleventyConfig.addFilter("galeriaOrdenada", (galeria) => {
    if (!galeria || galeria.length === 0) return { principal: null, miniaturas: [], todas: [] };
    const principal = galeria.find((f) => f.portada) || galeria[0];
    const miniaturas = galeria.filter((f) => f !== principal);
    return { principal, miniaturas, todas: [principal, ...miniaturas] };
  });

  // Milestone 8: resuelve las coordenadas públicas de un mapa activo.
  // Devuelve null si el mapa no debe mostrarse o si faltan datos — la
  // plantilla nunca debe recibir un objeto a medias que la obligue a
  // adivinar. Con precision:"aproximada" (default recomendado), las
  // coordenadas se redondean a 3 decimales — un desplazamiento
  // DETERMINISTA (mismo resultado siempre, no aleatorio) de hasta
  // ~110m en latitud, suficiente para no revelar el edificio exacto
  // sin dejar de ubicar el sector correctamente. Con "exacta", se usan
  // tal cual — una elección consciente, nunca el default.
  eleventyConfig.addFilter("mapaPublico", (mapa) => {
    if (!mapa || mapa.activo !== true) return null;
    if (typeof mapa.latitud !== "number" || typeof mapa.longitud !== "number") return null;
    const esExacta = mapa.precision === "exacta";
    const redondear = (n) => Math.round(n * 1000) / 1000;
    return {
      lat: esExacta ? mapa.latitud : redondear(mapa.latitud),
      lng: esExacta ? mapa.longitud : redondear(mapa.longitud),
      zoom: typeof mapa.nivelZoom === "number" ? mapa.nivelZoom : 15,
      aproximada: !esExacta,
    };
  });

  // Milestone 9: regla definitiva de indexabilidad de una propiedad.
  // Solo "disponible" y sin seo.noIndex forzado. "Reservada" queda
  // deliberadamente FUERA de esta regla (cambio respecto al Milestone 3,
  // que sí la incluía): es un estado transitorio — la propiedad puede
  // volver a "disponible" o pasar a "vendida"/"alquilada" en cualquier
  // momento — indexar temporalmente algo que pronto deja de poder
  // transaccionarse introduce ruido de posicionamiento sin beneficio
  // real. La página sigue siendo generada y accesible (nunca se borra
  // ni se redirige), solo no se ofrece a los buscadores mientras dure
  // ese estado. "Vendida"/"alquilada"/"borrador"/"archivada" tampoco
  // son indexables por la misma regla (no son "disponible").
  eleventyConfig.addFilter("esPropiedadIndexable", (propiedad) => {
    return propiedad.estado === "disponible" && !(propiedad.seo && propiedad.seo.noIndex);
  });

  // Milestone 9 (ajuste de cierre): valor completo de <meta name="robots">
  // por propiedad. No es un simple index/noindex binario — "reservada",
  // "vendida" y "alquilada" siguen siendo páginas públicas válidas con
  // navegación interna útil (CTA, enlaces al catálogo, etc.), así que se
  // les permite "follow" aunque no sean indexables. "Disponible" con
  // seo.noIndex forzado y "borrador"/"archivada" sí bloquean "follow" —
  // son estados sin intención de exposición pública real.
  eleventyConfig.addFilter("robotsMetaDe", (propiedad) => {
    const esIndexable = propiedad.estado === "disponible" && !(propiedad.seo && propiedad.seo.noIndex);
    if (esIndexable) return "index, follow";
    const permiteFollow = ["reservada", "vendida", "alquilada"].includes(propiedad.estado);
    return permiteFollow ? "noindex, follow" : "noindex, nofollow";
  });

  // Milestone 9: propiedades indexables reales, para sitemap.xml.
  eleventyConfig.addFilter("propiedadesIndexables", (lista) => {
    return (lista || []).filter((p) => p.estado === "disponible" && !(p.seo && p.seo.noIndex));
  });

  // Milestone 9: el catálogo (/propiedades/) se vuelve indexable de
  // forma automática en cuanto exista AL MENOS UNA propiedad indexable
  // real — Loyra/Yurlio nunca necesitan alternar esto a mano. Mientras
  // el inventario público sea exclusivamente contenido de prueba (todo
  // con seo.noIndex:true) o no exista ninguna propiedad "disponible"
  // publicable, el catálogo permanece noindex.
  eleventyConfig.addFilter("catalogoEsIndexable", (lista) => {
    return (lista || []).some((p) => p.estado === "disponible" && !(p.seo && p.seo.noIndex));
  });

  // Milestone 9: fecha real de última modificación de un archivo
  // (ruta relativa a la raíz del repo), para <lastmod> del sitemap.
  // Devuelve null si no hay historial de git — la plantilla omite
  // <lastmod> en ese caso en vez de fabricar una fecha.
  eleventyConfig.addFilter("lastmodDeArchivo", (rutaRelativa) => {
    if (!rutaRelativa) return null;
    return fechaModificacionGit(rutaRelativa);
  });

  // Milestone 9: JSON-LD schema.org para la ficha de propiedad —
  // RealEstateListing con una Offer anidada. Se investigó si existe un
  // "rich result" dedicado de Google para listados inmobiliarios: no lo
  // hay (2026); RealEstateListing/RealEstateAgent son tipos válidos de
  // schema.org que buscadores y sistemas de IA sí pueden leer para
  // entender el contenido, pero no producen ninguna presentación
  // especial garantizada en el SERP. Se agrega de todos modos por ser
  // información real, correcta y sin costo de mantenimiento — nunca
  // para perseguir un resultado enriquecido inexistente.
  // "businessFunction" distingue explícitamente venta de alquiler para
  // no representar un alquiler como una venta. La dirección solo usa
  // ubicacionPublica (nunca direccionInterna) y, si hay mapa activo,
  // "geo" usa EXACTAMENTE las mismas coordenadas ya redondeadas/públicas
  // que ve el mapa Leaflet — nunca coordenadas más precisas.
  // Milestone 13: "tituloMostrado"/"descripcionMostrada"/"ubicacionMostrada"
  // son opcionales — cuando se pasan (ficha en inglés), reemplazan a los
  // campos ES del objeto "propiedad" ya con su fallback aplicado por
  // quien llama al filtro. El resto del structured data (precio,
  // referencia, geo) es siempre el mismo dato compartido.
  eleventyConfig.addFilter("jsonLdPropiedad", (propiedad, mapaPublico, urlCanonica, imagenAbsoluta, tituloMostrado, descripcionMostrada, ubicacionMostrada) => {
    const esAlquiler = propiedad.operacion === "alquiler";
    const ld = {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: tituloMostrado || propiedad.titulo,
      url: urlCanonica,
      // Milestone 13 — Etapa 3: texto plano, sin **/_ literales — el
      // HTML visible de la ficha sigue mostrando negrita/cursiva reales
      // vía "descripcionHtml"; JSON-LD exige texto plano.
      description:
        (propiedad.seo && propiedad.seo.descripcion) ||
        textoPlanoDesdeMarkdown(descripcionMostrada || propiedad.descripcion) ||
        undefined,
      address: {
        "@type": "PostalAddress",
        addressLocality: ubicacionMostrada || propiedad.ubicacionPublica,
        addressCountry: "PA",
      },
    };
    if (imagenAbsoluta) ld.image = imagenAbsoluta;
    if (mapaPublico) {
      ld.geo = {
        "@type": "GeoCoordinates",
        latitude: mapaPublico.lat,
        longitude: mapaPublico.lng,
      };
    }
    if (propiedad.precio && typeof propiedad.precio.monto === "number") {
      ld.offers = {
        "@type": "Offer",
        price: propiedad.precio.monto,
        priceCurrency: propiedad.precio.moneda || "USD",
        businessFunction: esAlquiler
          ? "http://purl.org/goodrelations/v1#LeaseOut"
          : "http://purl.org/goodrelations/v1#Sell",
        availability: "https://schema.org/InStock",
      };
    }
    return ld;
  });

  // Milestone 9: BreadcrumbList JSON-LD acompañando al breadcrumb visual
  // "Propiedades / [Título]" de la ficha. Milestone 13: variante en
  // inglés vía "lang" — apunta a /en/properties/ y usa el título EN
  // (con el mismo fallback ya aplicado por quien llama al filtro).
  eleventyConfig.addFilter("jsonLdBreadcrumb", (propiedad, urlCanonica, lang, tituloMostrado) => {
    const esEn = lang === "en";
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: esEn ? "Properties" : "Propiedades",
          item: esEn ? "https://makomgrp.com/en/properties/" : "https://makomgrp.com/propiedades/",
        },
        { "@type": "ListItem", position: 2, name: tituloMostrado || propiedad.titulo, item: urlCanonica },
      ],
    };
  });

  // Milestone 4: propiedades visibles en el catálogo público —
  // solo "disponible" y "reservada" — ordenadas por fechaPublicacion
  // descendente (fechaCreacion como respaldo si aún no tiene fecha
  // de publicación asignada).
  eleventyConfig.addFilter("propiedadesPublicas", (lista) => {
    const fechaOrden = (p) =>
      (p.metadatos && (p.metadatos.fechaPublicacion || p.metadatos.fechaCreacion)) || "";
    return (lista || [])
      .filter((p) => p.estado === "disponible" || p.estado === "reservada")
      .sort((a, b) => fechaOrden(b).localeCompare(fechaOrden(a)));
  });

  // Texto breve de specs para la tarjeta de catálogo (ej. "3 hab ·
  // 2 baños · 125 m²" / "3 bed · 2 bath · 125 m²" en inglés — Milestone
  // 13), omitiendo cualquier valor no aplicable (null).
  eleventyConfig.addFilter("specsTexto", (d, lang) => {
    if (!d) return "";
    const partes = [];
    if (lang === "en") {
      if (d.habitaciones != null) partes.push(`${d.habitaciones} bed`);
      if (d.banos != null) partes.push(`${d.banos} bath`);
      if (d.estacionamientos != null) partes.push(`${d.estacionamientos} parking`);
      if (d.metrajeInterno != null) partes.push(`${d.metrajeInterno} m²`);
      return partes.join(" · ");
    }
    if (d.habitaciones != null) partes.push(`${d.habitaciones} hab`);
    if (d.banos != null) partes.push(`${d.banos} baños`);
    if (d.estacionamientos != null) partes.push(`${d.estacionamientos} est.`);
    if (d.metrajeInterno != null) partes.push(`${d.metrajeInterno} m²`);
    return partes.join(" · ");
  });

  // Milestone 4: qué pestañas de filtro tienen al menos una propiedad
  // — para no generar una pestaña "inútil" (ej. "Comercial") mientras
  // ninguna propiedad pública coincida con esa categoría.
  eleventyConfig.addFilter("filtrosDisponibles", (lista) => {
    const l = lista || [];
    return {
      venta: l.some((p) => p.operacion === "venta"),
      alquiler: l.some((p) => p.operacion === "alquiler"),
      comercial: l.some((p) => p.categoriaGeneral === "comercial"),
      residencial: l.some((p) => p.categoriaGeneral === "residencial"),
    };
  });

  // Milestone 7 (ampliado en Milestone 9): genera una única variante
  // optimizada de una imagen original, para los casos en que la imagen
  // NO pasa por el "Image HTML Transform" (que solo post-procesa <img>
  // dentro del HTML que Eleventy ya generó). Dos consumidores comparten
  // esta misma función: el feed /data/propiedades-destacadas.json que
  // lee script.js (WebP 800px, Milestone 7) y la imagen Open Graph de
  // cada ficha (JPEG 1200px, Milestone 9 — og:image no es un <img>, es
  // el valor de un <meta content="...">, así que el transform tampoco
  // lo alcanzaría aunque estuviera en una página generada).
  async function generarVarianteOptimizada(rutaPublica, { formatos, anchos }) {
    if (!rutaPublica) return null;
    const rutaOriginal = path.join(__dirname, rutaPublica.replace(/^\//, ""));
    if (!fs.existsSync(rutaOriginal)) return null;
    const stats = await Image(rutaOriginal, {
      formats: formatos,
      widths: anchos,
      outputDir: "_site/assets/propiedades/_optimizadas/",
      urlPath: "/assets/propiedades/_optimizadas/",
    });
    const variante = stats[formatos[0]][0];
    return { archivo: variante.url, ancho: variante.width, alto: variante.height };
  }

  // Milestone 5: selecciona hasta 3 propiedades destacadas para el
  // Home (disponible/reservada + mostrarEnHome=true), ordenadas por
  // ordenHome ascendente (las que no lo tienen quedan al final,
  // ordenadas entre sí por fechaPublicacion descendente — fechaCreacion
  // como respaldo). Devuelve únicamente los campos públicos que
  // consume la tarjeta del Home — nunca datos internos/administrativos.
  // Es async (Milestone 7) porque genera la portada optimizada antes
  // de escribir el feed.
  eleventyConfig.addFilter("propiedadesDestacadas", async (lista) => {
    const fechaOrden = (p) =>
      (p.metadatos && (p.metadatos.fechaPublicacion || p.metadatos.fechaCreacion)) || "";
    const destacadas = (lista || []).filter(
      (p) => (p.estado === "disponible" || p.estado === "reservada") && p.mostrarEnHome === true
    );
    destacadas.sort((a, b) => {
      const aOrden = typeof a.ordenHome === "number" ? a.ordenHome : null;
      const bOrden = typeof b.ordenHome === "number" ? b.ordenHome : null;
      if (aOrden !== null && bOrden !== null && aOrden !== bOrden) return aOrden - bOrden;
      if (aOrden !== null && bOrden === null) return -1;
      if (aOrden === null && bOrden !== null) return 1;
      return fechaOrden(b).localeCompare(fechaOrden(a));
    });
    return Promise.all(
      destacadas.slice(0, 3).map(async (p) => {
        const galeria = (p.fotografias && p.fotografias.galeria) || [];
        const portadaOriginal = galeria.find((f) => f.portada) || galeria[0] || null;
        const d = p.detallesCuantitativos || {};
        const alt = portadaOriginal
          ? portadaOriginal.alt || [p.titulo, p.ubicacionPublica].filter(Boolean).join(", ")
          : null;
        const altEn = portadaOriginal
          ? portadaOriginal.alt || [p.tituloEn || p.titulo, p.ubicacionPublicaEn || p.ubicacionPublica].filter(Boolean).join(", ")
          : null;
        const portadaOptimizada = await generarVarianteOptimizada(portadaOriginal && portadaOriginal.archivo, {
          formatos: ["webp"],
          anchos: [800],
        });
        return {
          referenciaMakom: p.referenciaMakom,
          slug: p.slug,
          titulo: p.titulo,
          // Milestone 13: campos EN con fallback ya resuelto en el build
          // — el Home en inglés (script.js) nunca necesita adivinar ni
          // mostrar un mensaje de "traducción pendiente".
          tituloEn: p.tituloEn || p.titulo,
          estado: p.estado,
          operacion: p.operacion,
          categoriaGeneral: p.categoriaGeneral,
          ubicacionPublica: p.ubicacionPublica,
          ubicacionPublicaEn: p.ubicacionPublicaEn || p.ubicacionPublica,
          precio: p.precio,
          detalles: {
            habitaciones: d.habitaciones != null ? d.habitaciones : null,
            banos: d.banos != null ? d.banos : null,
            estacionamientos: d.estacionamientos != null ? d.estacionamientos : null,
            metrajeInterno: d.metrajeInterno != null ? d.metrajeInterno : null,
          },
          portada: portadaOptimizada ? { archivo: portadaOptimizada.archivo, alt, altEn } : null,
        };
      })
    );
  });

  // Milestone 14 — Etapa 3: hasta 3 proyectos destacados para el Home
  // (mostrarEnHome=true), ordenados por ordenHome ascendente (sin
  // ordenHome, al final, en el orden en que ya vienen — sin fecha que
  // usar de respaldo, a diferencia de propiedades/perspectivas). Mismo
  // criterio de campos públicos únicamente que "propiedadesDestacadas".
  eleventyConfig.addFilter("proyectosDestacados", async (lista) => {
    const destacados = (lista || []).filter((p) => p.mostrarEnHome === true);
    destacados.sort((a, b) => {
      const aOrden = typeof a.ordenHome === "number" ? a.ordenHome : null;
      const bOrden = typeof b.ordenHome === "number" ? b.ordenHome : null;
      if (aOrden !== null && bOrden !== null && aOrden !== bOrden) return aOrden - bOrden;
      if (aOrden !== null && bOrden === null) return -1;
      if (aOrden === null && bOrden !== null) return 1;
      return 0;
    });
    return Promise.all(
      destacados.slice(0, 3).map(async (p) => {
        const imagenOptimizada = await generarVarianteOptimizada(p.imagenPrincipal, { formatos: ["webp"], anchos: [800] });
        return {
          slug: p.slug,
          titulo: p.titulo,
          tituloEn: p.tituloEn || p.titulo,
          estado: p.estado,
          ubicacion: p.ubicacion,
          ubicacionEn: p.ubicacionEn || p.ubicacion,
          extracto: p.extracto,
          extractoEn: p.extractoEn || p.extracto,
          ctaTexto: p.ctaTexto,
          ctaTextoEn: p.ctaTextoEn || p.ctaTexto,
          ctaUrl: p.ctaUrl,
          imagen: imagenOptimizada ? imagenOptimizada.archivo : null,
        };
      })
    );
  });

  // Milestone 14 — Etapa 3: hasta 2 perspectivas destacadas para el
  // Home. Orden: ordenHome ascendente si existe; si no, fecha
  // descendente (la más reciente primero) — igual criterio pedido
  // para el listado completo.
  eleventyConfig.addFilter("perspectivasDestacadas", (lista) => {
    const destacadas = (lista || []).filter((p) => p.mostrarEnHome === true);
    destacadas.sort((a, b) => {
      const aOrden = typeof a.ordenHome === "number" ? a.ordenHome : null;
      const bOrden = typeof b.ordenHome === "number" ? b.ordenHome : null;
      if (aOrden !== null && bOrden !== null && aOrden !== bOrden) return aOrden - bOrden;
      if (aOrden !== null && bOrden === null) return -1;
      if (aOrden === null && bOrden !== null) return 1;
      return (b.fecha || "").localeCompare(a.fecha || "");
    });
    return destacadas.slice(0, 2).map((p) => ({
      slug: p.slug,
      titulo: p.titulo,
      tituloEn: p.tituloEn || p.titulo,
      categoria: p.categoria,
      extracto: p.extracto,
      extractoEn: p.extractoEn || p.extracto,
    }));
  });

  // Milestone 14 — Etapa 4: mismo criterio de indexabilidad ya usado
  // para propiedades — indexable salvo que seo.noIndex esté forzado.
  // Proyectos y Perspectivas no tienen un estado tipo "borrador" que
  // los oculte del todo (ver admin/config.yml): toda entrada creada es
  // pública, "seo.noIndex" es la única forma de excluir una de
  // buscadores sin dejar de publicarla.
  eleventyConfig.addFilter("esIndexable", (item) => {
    return !(item.seo && item.seo.noIndex);
  });

  // Milestone 14 — Etapa 5: para el sitemap. Mismo criterio que
  // "catalogoEsIndexable"/"propiedadesIndexables": las listas completas
  // filtradas por indexabilidad, y un booleano para decidir si la
  // página de listado en sí entra al sitemap (al menos una entrada
  // indexable).
  eleventyConfig.addFilter("proyectosIndexables", (lista) => {
    return (lista || []).filter((p) => !(p.seo && p.seo.noIndex));
  });
  eleventyConfig.addFilter("proyectosEsIndexable", (lista) => {
    return (lista || []).some((p) => !(p.seo && p.seo.noIndex));
  });
  eleventyConfig.addFilter("perspectivasIndexables", (lista) => {
    return (lista || []).filter((p) => !(p.seo && p.seo.noIndex));
  });
  eleventyConfig.addFilter("perspectivasEsIndexable", (lista) => {
    return (lista || []).some((p) => !(p.seo && p.seo.noIndex));
  });

  // Milestone 14: listado completo de perspectivas, ordenado igual que
  // el criterio de destacadas (ordenHome asc si existe, si no fecha
  // desc) — pero SIN el tope de 2 (eso es solo para el teaser del Home).
  eleventyConfig.addFilter("perspectivasOrdenadas", (lista) => {
    const l = (lista || []).slice();
    l.sort((a, b) => {
      const aOrden = typeof a.ordenHome === "number" ? a.ordenHome : null;
      const bOrden = typeof b.ordenHome === "number" ? b.ordenHome : null;
      if (aOrden !== null && bOrden !== null && aOrden !== bOrden) return aOrden - bOrden;
      if (aOrden !== null && bOrden === null) return -1;
      if (aOrden === null && bOrden !== null) return 1;
      return (b.fecha || "").localeCompare(a.fecha || "");
    });
    return l;
  });

  // Milestone 14: JSON-LD schema.org "Article" para la ficha de
  // Perspectiva — tipo estándar reconocido para contenido editorial
  // (a diferencia de Proyectos, que no tiene un tipo schema.org
  // específico razonable, así que no se fuerza uno ahí).
  eleventyConfig.addFilter("jsonLdArticulo", (perspectiva, urlCanonica, imagenAbsoluta, lang, tituloMostrado, extractoMostrado) => {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: tituloMostrado || perspectiva.titulo,
      description: textoPlanoDesdeMarkdown(extractoMostrado || perspectiva.extracto) || undefined,
      url: urlCanonica,
      image: imagenAbsoluta || undefined,
      datePublished: perspectiva.fecha || undefined,
      author: { "@type": "Organization", name: perspectiva.autor || "MAKOM CAPITAL GROUP" },
      publisher: {
        "@type": "Organization",
        name: "MAKOM CAPITAL GROUP",
        logo: { "@type": "ImageObject", url: "https://makomgrp.com/assets/logos/makom-capital-group-logo-positivo.svg" },
      },
      inLanguage: lang === "en" ? "en" : "es",
    };
  });

  // Milestone 14: formatea "YYYY-MM-DD" (tal cual lo guarda el widget
  // "datetime" del CMS) a fecha legible, ES o EN — sin depender de
  // Intl/locale del sistema del runner (evita inconsistencias entre
  // entornos), con una tabla de meses fija.
  const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  eleventyConfig.addFilter("fechaFormato", (fecha, lang) => {
    if (!fecha) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha));
    if (!m) return fecha;
    const [, anio, mes, dia] = m;
    const diaNum = parseInt(dia, 10);
    const mesIdx = parseInt(mes, 10) - 1;
    if (lang === "en") return `${MESES_EN[mesIdx]} ${diaNum}, ${anio}`;
    return `${diaNum} de ${MESES_ES[mesIdx]} de ${anio}`;
  });

  return {
    // Sin formatos de plantilla activos todavía: no hay .njk/.md en el
    // proyecto en este milestone, por lo que ningún .html existente es
    // interpretado como plantilla (Nunjucks, Liquid, etc.) — todo pasa
    // por passthrough copy, verbatim.
    templateFormats: ["njk"],
    dir: {
      input: ".",
      output: "_site",
      includes: "_includes",
    },
  };
};
