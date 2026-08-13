const fs = require("fs");
const path = require("path");

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

  // Milestone 3: colección de propiedades leída directamente de
  // content/propiedades/*.json. Son archivos de datos puros (no
  // plantillas Eleventy), por lo que se leen a mano con fs — esto es
  // lo que permite generar una página por propiedad sin convertir esos
  // JSON en archivos con front matter.
  eleventyConfig.addCollection("propiedades", () => {
    const dir = path.join(__dirname, "content", "propiedades");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((archivo) => archivo.endsWith(".json"))
      .map((archivo) => JSON.parse(fs.readFileSync(path.join(dir, archivo), "utf8")));
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
