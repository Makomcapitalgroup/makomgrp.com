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
