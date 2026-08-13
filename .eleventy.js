const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

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

module.exports = function (eleventyConfig) {
  // Milestone 1: andamiaje delimitado. Eleventy solo copia el sitio actual
  // tal cual (passthrough), sin procesarlo como plantilla. Nada se
  // transforma, reestructura ni recibe front matter todavía.
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("aviso-legal.html");
  eleventyConfig.addPassthroughCopy("privacidad.html");
  eleventyConfig.addPassthroughCopy("styles.css");
  eleventyConfig.addPassthroughCopy("script.js");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("sitemap.xml");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("MAKOM_Logo_Files_v4.0");

  // Milestone 6: /admin/ se sirve tal cual (Decap CMS se carga por CDN
  // dentro de admin/index.html) — nunca se procesa como plantilla ni se
  // referencia desde ninguna página pública.
  eleventyConfig.addPassthroughCopy("admin");

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
  eleventyConfig.addCollection("propiedades", () => {
    const dir = path.join(__dirname, "content", "propiedades");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((archivo) => archivo.endsWith(".json"))
      .map((archivo) => {
        const datos = JSON.parse(fs.readFileSync(path.join(dir, archivo), "utf8"));
        datos.slug = path.basename(archivo, ".json");
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
  });

  // Resuelve una clave técnica (ej. "vista-mar") a su etiqueta pública
  // (ej. "Vista al mar") contra un catálogo de _data/propiedadesConfig.json.
  eleventyConfig.addFilter("etiqueta", (valor, catalogo) => {
    const item = (catalogo || []).find((i) => i.valor === valor);
    return item ? item.etiqueta : valor;
  });

  // Formatea el precio numérico almacenado según la operación.
  // Venta: "$485,000". Alquiler: "$2,500 / mes".
  eleventyConfig.addFilter("precioFormato", (precio, operacion) => {
    if (!precio || typeof precio.monto !== "number") return "";
    const monto = precio.monto.toLocaleString("en-US");
    if (operacion === "alquiler") {
      const sufijos = { mensual: "mes", quincenal: "quincena", otra: "período" };
      return `$${monto} / ${sufijos[precio.periodicidad] || "período"}`;
    }
    return `$${monto}`;
  });

  // Resumen automático para meta description SEO cuando no hay una
  // personalizada: primeros ~155 caracteres de la descripción, sin
  // marcado, cortado en el último espacio para no partir una palabra.
  eleventyConfig.addFilter("resumenSeo", (texto, maxLen = 155) => {
    if (!texto) return "";
    const plano = texto.replace(/\n+/g, " ").replace(/[-*]\s+/g, "").trim();
    if (plano.length <= maxLen) return plano;
    return plano.slice(0, plano.lastIndexOf(" ", maxLen)) + "…";
  });

  // Convierte el campo "descripcion" (texto simple con párrafos
  // separados por línea en blanco y listas con "- ") en HTML básico:
  // <p> y <ul><li>, sin introducir una dependencia de Markdown todavía.
  // Soporte de negrita/cursiva se añadirá cuando el editor enriquecido
  // de Decap CMS quede conectado (Milestone 6).
  eleventyConfig.addFilter("descripcionHtml", (texto) => {
    if (!texto) return "";
    const escapar = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const bloques = texto.split(/\n\s*\n/);
    return bloques
      .map((bloque) => {
        const lineas = bloque.split("\n").filter((l) => l.trim() !== "");
        const esLista = lineas.length > 0 && lineas.every((l) => /^-\s+/.test(l.trim()));
        if (esLista) {
          const items = lineas.map((l) => `<li>${escapar(l.trim().replace(/^-\s+/, ""))}</li>`).join("");
          return `<ul class="ficha-propiedad__lista">${items}</ul>`;
        }
        return `<p>${escapar(lineas.join(" ")).trim()}</p>`;
      })
      .join("\n");
  });

  // Determina la foto de portada de una galería: la marcada
  // explícitamente con portada:true, o la primera si ninguna lo está.
  eleventyConfig.addFilter("portadaDe", (galeria) => {
    if (!galeria || galeria.length === 0) return null;
    return galeria.find((foto) => foto.portada) || galeria[0];
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
  // 2 baños · 125 m²"), omitiendo cualquier valor no aplicable (null).
  eleventyConfig.addFilter("specsTexto", (d) => {
    if (!d) return "";
    const partes = [];
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

  // Milestone 5: selecciona hasta 3 propiedades destacadas para el
  // Home (disponible/reservada + mostrarEnHome=true), ordenadas por
  // ordenHome ascendente (las que no lo tienen quedan al final,
  // ordenadas entre sí por fechaPublicacion descendente — fechaCreacion
  // como respaldo). Devuelve únicamente los campos públicos que
  // consume la tarjeta del Home — nunca datos internos/administrativos.
  eleventyConfig.addFilter("propiedadesDestacadas", (lista) => {
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
    return destacadas.slice(0, 3).map((p) => {
      const galeria = (p.fotografias && p.fotografias.galeria) || [];
      const portada = galeria.find((f) => f.portada) || galeria[0] || null;
      const d = p.detallesCuantitativos || {};
      return {
        referenciaMakom: p.referenciaMakom,
        slug: p.slug,
        titulo: p.titulo,
        estado: p.estado,
        operacion: p.operacion,
        categoriaGeneral: p.categoriaGeneral,
        ubicacionPublica: p.ubicacionPublica,
        precio: p.precio,
        detalles: {
          habitaciones: d.habitaciones != null ? d.habitaciones : null,
          banos: d.banos != null ? d.banos : null,
          estacionamientos: d.estacionamientos != null ? d.estacionamientos : null,
          metrajeInterno: d.metrajeInterno != null ? d.metrajeInterno : null,
        },
        portada: portada ? { archivo: portada.archivo, alt: portada.alt || p.titulo } : null,
      };
    });
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
