# Administrador: tema MAKOM y formulario compacto

Documento interno (no se publica: Eleventy solo procesa plantillas `.njk`).

Todo vive en un solo archivo, `admin/tema-makom.css`, enlazado desde `admin/index.html`. Es **solo CSS**: no hay JavaScript, no se toca
el DOM de Decap, no se cambian campos, validaciones, datos ni la publicación. Quitar la línea `<link href="tema-makom.css" …>` devuelve el
panel a su aspecto nativo.

## Qué hace la distribución compacta

- El panel del formulario pasa de 800 px a 1080 px de ancho máximo.
- El panel y el cuerpo de cada sección abierta (Precio, Ubicación, Detalles cuantitativos, Mapa, SEO…) se vuelven una **cuadrícula de 12 columnas**.
  Cada campo ocupa las columnas que necesita; por defecto, las 12 (ancho completo, igual que Decap).
- Escritorio (≥ 1100 px): hasta 4 campos por fila. Tableta (640–1099 px): hasta 2. Móvil (< 640 px): 1 columna y controles de 44 px o más.
- Los campos se identifican por el `id` que Decap pone en cada control (`<name>-field-N`, con el `name` de `admin/config.yml`). El orden visual es el
  del código, así que **el orden de tabulación y los lectores de pantalla no cambian**. Un campo nuevo o renombrado se ve a ancho completo
  hasta que se le añada una regla (nunca desaparece ni se rompe).
- Cada regla fija dos variables en el campo: `--mk-d` (columnas en escritorio) y `--mk-t` (en tableta). `--mk-sd` fuerza la columna de inicio
  (solo se usa para que la Descripción en español empiece una fila nueva y la inglesa quede a su derecha).

| Zona | Distribución en escritorio |
|---|---|
| Datos generales | Operación · Fecha de entrega · Tipo · Categoría (4 por fila); Estado; Descripción ES \| EN lado a lado; título y título en inglés a ancho completo |
| Precio | Monto · Moneda; Periodicidad; Fecha de referencia (media fila: su selector trae «Ahora» y «Limpiar»); Precios específicos a ancho completo |
| Ubicación | Provincia · Distrito · Corregimiento; Sector · Edificio; Dirección interna completa; Ubicación pública ES \| EN; Zona |
| Detalles cuantitativos | Habitaciones · Baños · Estacionamientos; Metrajes · Año · Piso; rangos y «Desde» de dos en dos (etiquetas largas) |
| Fotografías | Sin cambios (el widget conserva el ancho completo) |
| Video y planos | Enlace a ancho completo; Archivo de video \| Portada lado a lado; título accesible completo |
| Final | Asesor \| Enlace limpio; Mapa en filas de 4; SEO: descripciones ES \| EN, imagen social \| noindex |

## Cómo se engancha a Decap (para mantenerlo)

1. Decap no tiene API de temas: se usan las **etiquetas de componente** de sus clases (`[class*="-ControlContainer"]`, `-TopBarContainer`…), nunca el hash.
2. El cuerpo de una sección **abierta** no tiene clase `css-…`; el cerrado sí (`display: none`). Por eso la cuadrícula se aplica con
   `div:not([class*="css-"]):has(> [class*="-ControlContainer"])` y las secciones cerradas siguen cerradas.
3. `:has()` está en Chrome/Edge 105+, Safari 15.4+ y Firefox 121+. En un navegador sin `:has()` las reglas de agrupación no aplican y el
   formulario se ve en una columna (como Decap), solo con el estilo de color y forma.
4. Decap pone `margin-top: 16px` (36 px en el primero) a cada campo con `:first-of-type`; el tema lo anula con un doble atributo
   (`[class*="-ControlContainer"][class*="-ControlContainer"]`) para ganar en especificidad sin `!important`.
5. Al actualizar Decap (versión fija en `admin/index.html`): ejecutar `node scripts/verificar-galeria-widget.js`; el grupo «13 · formulario
   compacto» abre el panel real y comprueba filas, anchos, orden de tabulación, secciones cerradas, ausencia de desborde y que editar y publicar
   solo cambia lo editado.

## Medición (mismos datos, mismos acordeones abiertos, 1440 px de ancho)

Propiedad de Costa del Este con todas las secciones abiertas: **9 934 px → 6 147 px (−38 %)** respecto al tema anterior (9 444 px sin ningún tema).

---

# Pulido visual final (PR siguiente al #19)

Sigue siendo solo CSS en `admin/tema-makom.css` (sin JavaScript, sin cambios de DOM, de datos ni de lógica).

## Decisiones

- **«Medios»**: no estaba deshabilitado; es un botón de Decap que abre la biblioteca de medios («Archivos multimedia»). Se veía gris porque Decap le da un color neutro y el tema solo
  estilaba el enlace «Contenido». Ahora ambos comparten forma de pestaña: texto negro al 78 % (contraste ≥ 4,5:1), cursor de acción, hover, pulsado y foco 2 px terracota.
  La pestaña activa sigue siendo la cápsula de cristal con texto terracota.
- **«Añadir rápido»**: ofrece Propiedad, Proyecto, Perspectiva y Asesor (cada una abre el formulario de nueva entrada) y funciona desde cualquier pantalla, así que **se conserva**. Pasó a
  contorno fino de 1 px, sin relleno ni sombra, para no competir con «+ Propiedad» (terracota). No se oculta ni se elimina nada.
- **«+ Propiedad»**: el texto estaba 4 px por encima del centro (interlineado de 36 px dentro de un botón de 44 px). Ahora es `inline-flex` centrado; se mide en las pruebas
  (desvío ≤ 1 px). Igual criterio para «Publicar» y «Seleccionar fotografías».
- **Estados de guardado**: «Cambios no guardados» deja de ser rojo puro (#FF003B) y pasa a un aviso en terracota oscuro (#8F3720) sobre un tinte tenue, con punto indicador;
  «Cambios guardados» en verde bosque. **Los errores reales no se atenúan**: los mensajes de campo pasan de #FF003B (≈ 4:1) a #C0392B (≥ 4,5:1) y los avisos de Decap (rojo, verde, azul)
  tienen texto blanco con contraste ≥ 4,5:1. Los mensajes y su comportamiento no cambian.
- **Secciones desplegables**: tarjeta marfil con borde de 1 px y radio de 16 px; franja superior de ~37 px en arena, flecha en un botón redondo de 30 px; abierta = franja más intensa y flecha
  terracota, cerrada = más suave (el giro de la flecha lo hace Decap). El rótulo de la sección va en terracota oscuro, distinto de las etiquetas de campo.
- **Legibilidad**: etiquetas 12 px / peso 500; ayudas 13 px / peso 400 (antes 12 px / 300); interruptor activado en terracota (antes igual de gris que el desactivado).
  La altura del formulario sube de 6 147 a 6 478 px (+5 %) a 1440 px por esto y por los botones de 36 px de la galería; sigue siendo −35 % respecto a los 9 934 px de partida.
- **Galería**: tarjetas con la misma altura por fila, acciones en cuadrícula (◀ ▶ + «Hacer portada» / «Reemplazar» + «Quitar»), botones de ≥ 36 px, insignia «Portada» más legible
  y tarjeta de portada con borde terracota. Sin cambios en el widget.
- **Biblioteca de medios** (la ventana de «Medios»): radio de 20 px, título ligero, «Subir nuevo» en terracota.
- **Móvil y tableta vertical**: Decap fija el editor en `min-width: 800px`, por lo que en un teléfono el editor quedaba recortado por la derecha (el botón «Publicar» quedaba fuera de la pantalla) y a 768 px
  se recortaban 32 px. Con `min-width: 0` y la barra de acciones en filas, el editor cabe de 375 a 900 px.

## Limitaciones reales de Decap

- **Listado**: lo único que Decap ofrece por entrada es el texto del `summary` de `admin/config.yml` («título — estado»). El CSS no puede resaltar «disponible» o «alquilada» dentro de ese texto
  (no hay atributo ni clase por estado), y no se interpretan palabras del título. El refinamiento se limitó a ritmo, tipografía, hover y foco.
- **Textos en inglés** («Add precio específico», «Insert from URL», «Copy», «Test Backend»): vienen del código de Decap, no del CSS.
- **Pestaña «Test Backend»**: solo existe con el respaldo de prueba; con GitHub aparece el enlace al sitio.

## Propuestas separadas (requieren configuración o JavaScript; NO implementadas)

1. Estado legible en el listado: cambiar el `summary` de propiedades a `{{estado}} · {{titulo}}` (solo texto; cambia lo que se ve, no los datos) o, mejor, activar `view_groups` / `view_filters` nativos
   de Decap por `estado` para agrupar o filtrar el listado. Es un cambio de funcionalidad visible: decidir con Loyra.
2. Insignias de color por estado dentro de las tarjetas: requiere un componente propio o JavaScript sobre el listado. Descartado por duplicar la interfaz nativa.
3. Traducir al español los textos que Decap deja en inglés: requiere un paquete de locale propio (JavaScript).

---

# Estándar compartido para las cuatro colecciones (rama `feat/admin-todas-colecciones`, sin fusionar)

## Qué es compartido y qué es específico

| | Propiedades | Proyectos | Perspectivas | Asesores |
|---|---|---|---|---|
| Cuadrícula de 12 columnas, 1080 px, 1 columna en móvil | ya (PR #19) | ✔ | ✔ | ✔ |
| Rótulos de grupo (visuales) | — | Información general · Descripción · Imágenes · Llamado a la acción · Página principal | Información editorial · Extractos · Contenido · Portada · Página principal | Identidad · Cargo · Contacto · Fotografía de perfil |
| Editores de texto 190 px mínimos | no (sin cambios) | ✔ | ✔ | — |
| Imagen | `galeria-fotos` (3–10, portada) | `imagen-makom` (principal) + `galeria-fotos` (0–12, sin portada) | `imagen-makom` (portada) | `imagen-makom` (perfil, circular, 1000 px) |
| Listado | acento terracota | acento petróleo | acento arena oscuro | acento verde bosque |

- **Propiedades no cambia** (misma altura de formulario: 6 507 px a 1440 px, mismas reglas). Solo hereda el acento terracota de las tarjetas del listado.
- **Datos**: ningún campo cambia de nombre, tipo ni obligatoriedad. `imagen-makom` guarda lo mismo que el widget `image` nativo (la ruta pública en una cadena; quitar la imagen la deja vacía, como el nativo). La galería de Proyectos guarda `[{ archivo, alt }]` (sin `portada`), igual que la lista anterior.
- **Opciones nuevas, todas opcionales, de `galeria-fotos`**: `portada: false`, `min: 0`, `lado_max`, `nombre_campo` + `nombre_prefijo`. Sin ellas, el comportamiento de Propiedades es idéntico (las pruebas existentes de Propiedades pasan sin cambios).
- **Nombres de archivo**: `proyecto-<título>-<aaaammdd>-<8 hex>.jpg`, `perspectiva-…`, `asesor-…` (la foto de un asesor se reduce a 1000 px; el resto a 2400 px). Misma carpeta global `assets/propiedades/uploads` (no se tocan rutas).

## Hallazgos de la auditoría

- **La galería de Proyectos no se muestra en el sitio público**: `_includes/proyecto.njk` solo usa `imagenPrincipal`. Se mejoró la carga en el panel y se avisa en la ayuda del campo; mostrarla en la ficha requiere un cambio de plantilla (propuesta, no implementada).
- Ningún proyecto actual tiene imagen principal ni galería (la ficha muestra «Fotografías disponibles próximamente»).
- **Listados con fotografías**: Decap 3.17.3 NO lo permite con los datos actuales. La tarjeta de la vista de cuadrícula toma la imagen del campo cuyo NOMBRE sea exactamente `image`, `thumbnail`, `thumb`, `picture`, `avatar`, `photo`, `cover`, `hero` o `logo` (código del bundle); los campos de MAKOM se llaman `imagenPrincipal`, `imagenPortada` y `foto`. La opción `thumbnail:` de la colección no existe en esta versión (se probó). Las vías posibles —renombrar campos (cambia los datos y las plantillas), JavaScript que lea el estado de Decap o sustituir componentes internos— quedan como propuestas con riesgos.
- Decap re-serializa el Markdown del texto enriquecido al guardar cualquier entrada (3 saltos de línea → 2). Ocurre con la configuración anterior también; no es del widget.
- **Móvil / tableta vertical**: `min-width: 800px` del editor de Decap (corregido ≤ 900 px; ya incluido en el PR #20).

## Pruebas

`node scripts/verificar-galeria-widget.js`: grupo 15 (≈ 45 comprobaciones) con el Decap real: asesor, perspectiva y proyecto (vista previa, subir, optimizar, reemplazar, quitar, publicar, datos idénticos salvo el campo editado, 12 máximo, sin portada, arrastrar y soltar, errores), estándar visual en las tres colecciones a 1440 y 390 px y acentos de los cuatro listados. Las dos entradas que las pruebas modifican (propiedad de Costa del Este y asesor Loyra) están **congeladas** en `scripts/fixtures/` para que lo que el equipo publique desde el CMS real no rompa las pruebas.

## Pendientes independientes (no forman parte de este bloque)

1. **Fotografías y tarjetas enriquecidas en los listados de las cuatro colecciones.** Decap 3.17.3 solo toma la imagen de una tarjeta de un campo llamado `image`, `thumbnail`, `thumb`, `picture`, `avatar`, `photo`, `cover`, `hero` o `logo`; los campos de MAKOM tienen otros nombres. Opciones con riesgo (a decidir): renombrar campos (cambia datos y plantillas), JavaScript que lea el estado de Decap, o sustituir componentes internos. También: `summary` con más datos por colección y `view_filters` / `view_groups` nativos por estado.
2. **Visualización pública de la galería de Proyectos.** `_includes/proyecto.njk` solo usa `imagenPrincipal`; la galería ya se puede cargar desde el panel pero no se muestra en la ficha (requiere cambio de plantilla).
3. **Pruebas autenticadas con Loyra y pruebas en Safari / iPhone reales.** Todo lo anterior se verificó con el Decap real y un respaldo de prueba en memoria, solo en Chrome (CDP); falta confirmar con sesión real de GitHub la carga de imágenes de las tres colecciones nuevas (un solo commit por publicación) y el comportamiento en Safari, iPhone y Firefox.

---

# Listado de Propiedades (rama `feat/admin-listado-propiedades`, sin fusionar)

## Auditoría de Decap 3.17.3: qué recibe realmente cada tarjeta del listado

- Cada tarjeta recibe **solo** el resultado de `summary` (un texto) y, en la vista de **cuadrícula**, una imagen **únicamente si** la colección tiene un campo de nivel superior de tipo `image` cuyo nombre sea exactamente `image`, `thumbnail`, `thumb`, `picture`, `avatar`, `photo`, `cover`, `hero` o `logo` (función de inferencia del bundle). La vista de lista nunca muestra imágenes. La opción `thumbnail:` de la colección no existe en esta versión.
- En Propiedades la portada está **anidada** (`fotografias.galeria[].archivo` con `portada: true`) y la gestiona el widget propio: Decap no la ve en el listado. No hay API pública para tarjetas: `window.CMS` expone `registerWidget`, `registerPreviewTemplate`, `registerEventListener` (preSave/postSave…), `registerEditorComponent`, etc., pero ningún gancho del listado y no expone el store.
- Soportado y oficial para el listado: `summary` (texto con filtros `default`, `truncate`, `upper`, `lower`, `date`, `ternary`), `sortable_fields`, **`view_filters`** y **`view_groups`**.

## Qué se implementó (soportado y de bajo riesgo)

1. `summary` de dos líneas: `{{titulo | truncate(110)}}` / `{{referenciaMakom | default('sin referencia')}} · {{operacion}} · {{tipo}} · {{estado}}` (valores tal como están guardados; los datos no cambian).
2. CSS: respeta el salto de línea (`white-space: pre-line`); en ≥ 1100 px jerarquía por `::first-line` (título 16 px / 500, datos 13 px gris); en pantallas menores texto uniforme (si el título se parte, `::first-line` solo estilaría la primera línea visual).
3. `view_filters` nativos por cada estado definido (Disponibles, Reservadas, Alquiladas, Vendidas, Archivadas, Borradores) y por operación (En venta, En alquiler). El menú de Decap no se cierra al elegir y cada opción alterna.
4. Botones del listado («Ordenar por», «Filter by») con la forma de «Añadir rápido».

## Qué NO es posible sin cambios de mayor riesgo (portada real, chips de color, «Editar»)

| Alternativa | Qué logra | Riesgos |
|---|---|---|
| **A. Solo lo implementado** | Datos (ref., operación, tipo, estado) y filtros, sin tocar datos ni JavaScript | No hay foto ni color por estado |
| **B. Script de «enriquecimiento» (prototipo evaluado)** | Portada real, chips de estado de color e indicador «Editar ›», por atributos/variables CSS en cada tarjeta | JavaScript nuevo en el panel que lee el enlace de cada tarjeta (ruta `#/collections/propiedades/entries/<slug>`) y trae el JSON de cada propiedad de `raw.githubusercontent.com` (repositorio público): depende de un servicio externo y de que el repositorio siga siendo público; la CDN de GitHub cachea 5 min (una portada recién publicada tardaría hasta 5 min en verse); los atributos se pierden al cambiar de vista/colección (hay que reaplicarlos con un `MutationObserver`); el listado pagina por desplazamiento (20 en 20) y hay que cubrir las tarjetas que llegan después. En la prueba: 20 propiedades traídas en ~0,6 s; los atributos sobreviven al reordenar pero no al cambiar de vista. Requiere pruebas propias y mantenimiento en cada actualización de Decap. |
| **C. Campo derivado `image`** | La cuadrícula nativa mostraría la portada | Cambia el modelo de datos (clave nueva en cada JSON), requiere `preSave` para mantenerla y una migración de las propiedades existentes; solo en la vista de cuadrícula |
| **D. Sustituir componentes internos / fork de Decap** | Control total | Alto riesgo y mantenimiento permanente; no recomendado |

No se implementó B, C ni D: requieren aprobación.

---

# Listado de Propiedades enriquecido (prototipo B aprobado → implementación)

Solo Propiedades (Proyectos, Perspectivas y Asesores quedan con el listado nativo + acento).

## Arquitectura

1. **Datos: `/admin/listado-propiedades.json`**, generado por el build del sitio (`content/admin-listado-propiedades.njk` + filtro `listadoAdminPropiedades` de `.eleventy.js`, mismo patrón que el feed `propiedades-destacadas.json`). Trae, campo por campo, `slug` (nombre de archivo = ruta de edición de Decap), referencia, título, operación, tipo, estado y la portada (la marcada o la primera) con una **miniatura webp de 480 px** (~20 KB) generada con el mismo helper que el Home. Son todas las propiedades, también borrador/archivada/vendida. No incluye dirección interna, precios, descripciones, contacto ni coordenadas (lo comprueba `verificar-ficha.js`). Mismo origen y mismo despliegue que el panel: **no depende de `raw.githubusercontent.com`** ni de ningún servicio externo, no hay CORS y la caché es la de GitHub Pages (el panel valida con `cache: 'no-cache'`: si no cambió, 304).
2. **Enriquecimiento: `admin/listado-propiedades.js`**. Solo pone atributos `data-mk-*` y la variable `--mk-portada` en el `<li>` de cada tarjeta de Decap; no crea, mueve ni borra nodos y no toca textos ni funciones nativas. Todo el diseño es CSS (`tema-makom.css`).
3. **Diseño**: lista = tarjeta horizontal (portada 148 px con esquinas de 12 px y recorte `cover`, sobretítulo «REFERENCIA · OPERACIÓN · TIPO», título de hasta 2 líneas, insignia de estado sobre la portada y «Editar ›»); cuadrícula = tarjeta vertical (portada arriba, 268 px de alto); móvil = portada de 84 px y chevrón «›». Sin portada (o con archivo roto): marcador con el logo oficial `assets/logos/makom-capital-group-logo-positivo.svg`. Estados: Disponible (verde bosque), Reservada (terracota oscuro), Alquilada y Vendida (petróleo), Archivada (gris), Borrador (arena oscuro); todos ≥ 4,5:1 sobre su fondo blanco.
4. **Procedencia de las fotografías**: las portadas reales de cada propiedad (`fotografias.galeria` → la marcada como portada o, si no, la primera), no ilustrativas ni de otras propiedades.

## Cómo se mantiene tras los cambios de pantalla (sin esperas arbitrarias)

- Un `MutationObserver` (solo `childList`) detecta que Decap creó o recreó tarjetas —cambio de lista/cuadrícula, de colección, orden, filtros, búsqueda, «cargar más», volver desde la edición— y en el siguiente cuadro reaplica los atributos desde los datos **que ya están en memoria** (≈ 0,1 ms para 36 tarjetas; sin red). Los atributos que se ponen no son observados (sin bucles) y fuera del listado no se hace nada.
- Carga perezosa con `IntersectionObserver` (400 px de margen) y única por URL: al abrir el listado solo se piden las miniaturas visibles; cambiar de vista no vuelve a pedirlas.
- Copia local (`localStorage`) de la última lectura correcta (stale-while-revalidate): el listado se ve enriquecido al instante y también si el archivo no responde. Tras un fallo no se reintenta en cada pantalla (intervalo de 2 min).
- Al guardar desde el panel (eventos oficiales `postSave` / `postPublish`) se actualiza esa fila con los datos guardados: la insignia cambia al instante; si la portada cambió, se muestra el marcador de MAKOM hasta el siguiente despliegue (nunca una foto equivocada).

## Errores y degradación

Sin archivo de datos, con formato desconocido, con datos hostiles, con miniaturas lentas o rotas, o sin el script: las tarjetas quedan como las dibuja Decap y los filtros, el orden, la búsqueda y la edición siguen funcionando (cubierto en el grupo 17 de `verificar-galeria-widget.js`). Los valores del archivo se tratan como no confiables: la miniatura solo se acepta con la forma `/assets/propiedades/_optimizadas/<nombre>.webp` y el estado solo entre los 6 definidos.

## Riesgos y limitaciones

- **Dependencia de Decap** (versión fijada en 3.17.3): la ruta `#/collections/propiedades/entries/<slug>` y que la tarjeta sea un `<li>` con ese enlace. Si una actualización cambia alguna, el enriquecimiento deja de aplicarse (queda el listado nativo). Se vigila con el grupo 17.
- **Frescura**: los datos son los del último despliegue del sitio. Una propiedad nueva, o un cambio hecho desde otro equipo, se refleja en la insignia/portada cuando termina el despliegue (≈ 3 min); los cambios hechos en el mismo panel se reflejan al instante (el texto de la tarjeta —referencia, operación, tipo y título— lo entrega Decap en vivo).
- **Estado en el texto**: el estado ya no está en el texto de la tarjeta (lo muestra la insignia). Si el archivo no ha cargado nunca, la tarjeta no muestra el estado (siguen disponibles los filtros por estado y el formulario).
- **Peso**: 31 miniaturas nuevas en `_site/assets/propiedades/_optimizadas/` (≈ 660 KB; también de propiedades no públicas, igual que las imágenes sociales que ya generaba el build) y un JSON de ≈ 13 KB.
- La portada es **decorativa** (el título está al lado): no lleva texto alternativo.
- Solo Chrome verificado; no Safari/iPhone/Firefox reales.
