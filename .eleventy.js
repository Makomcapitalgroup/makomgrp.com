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
  eleventyConfig.addFilter("jsonLdPropiedad", (propiedad, mapaPublico, urlCanonica, imagenAbsoluta) => {
    const esAlquiler = propiedad.operacion === "alquiler";
    const ld = {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: propiedad.titulo,
      url: urlCanonica,
      description: (propiedad.seo && propiedad.seo.descripcion) || propiedad.descripcion || undefined,
      address: {
        "@type": "PostalAddress",
        addressLocality: propiedad.ubicacionPublica,
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
  // "Propiedades / [Título]" de la ficha.
  eleventyConfig.addFilter("jsonLdBreadcrumb", (propiedad, urlCanonica) => {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Propiedades", item: "https://makomgrp.com/propiedades/" },
        { "@type": "ListItem", position: 2, name: propiedad.titulo, item: urlCanonica },
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
        const portadaOptimizada = await generarVarianteOptimizada(portadaOriginal && portadaOriginal.archivo, {
          formatos: ["webp"],
          anchos: [800],
        });
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
          portada: portadaOptimizada ? { archivo: portadaOptimizada.archivo, alt } : null,
        };
      })
    );
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
