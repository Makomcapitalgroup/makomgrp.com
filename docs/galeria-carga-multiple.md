# Galería de propiedades: carga múltiple (widget `galeria-fotos`)

Documento interno (no se publica en el sitio: Eleventy solo procesa plantillas `.njk`).

## Qué es

Un widget propio de Decap CMS (`admin/galeria-fotos.js`, un solo archivo, sin dependencias ni compilación) que reemplaza la lista de
«Fotografías» del formulario de propiedades. Loyra puede **elegir o arrastrar varias fotos de su computadora a la vez**, sin pasar por
Medios, y ver miniaturas, orden, portada y cuántas caben todavía.

- **Datos:** el formato guardado es el mismo de la lista anterior: `[{ "archivo": "/assets/propiedades/uploads/…", "alt": "…", "portada": true|false }]`.
  No hay que migrar nada; las propiedades existentes se abren tal cual.
- **Límites:** de 3 a 10 fotos. Salen de `admin/config.yml` (`min`, `max`), que debe coincidir con `_data/propiedadesConfig.json → limitesMedia`
  (el build falla si no coinciden).
- **Guardado:** cada imagen nueva se registra como archivo *borrador* de la entrada con `onPersistMedia` de Decap y se publica **junto con la
  propiedad en una sola operación** (un solo commit en el backend de GitHub). Si no se publica, no se escribe nada. El widget no hace llamadas de red propias.

## Optimización antes de subir

Se hace en el navegador de quien edita; **los originales del computador no se tocan**.

| Parámetro | Valor | Por qué |
|---|---|---|
| Lado mayor | 2400 px (nunca se amplía) | La ficha muestra hasta 1200 px de ancho (`eleventy:widths` 800/1200): 2400 px da margen para pantallas 2×. Más píxeles solo aumentan el peso. |
| Formato | JPEG | Es el que ya usa el sitio y lo que esperan WhatsApp/Facebook/Google para `og:image`; el sitio genera WebP/AVIF desde él. WebP ahorraría ~25 % más, pero varias integraciones (previsualizaciones, OG, `data/*.json`) leen el archivo original. |
| Calidad | 0,85 (baja a 0,75 y 0,65 solo si pasa de 2,5 MB) | Estudio con fotos reales del sitio (lado mayor 2400): 0,75 → 0,85 sube ~20 % el peso y ~0,8 dB de calidad; 0,85 → 0,90 sube ~30 % por ~0,9 dB más. 0,85 es el punto donde el costo/beneficio se aplana. |
| Orientación | EXIF aplicado a los píxeles | Evita fotos de iPhone giradas. |
| Metadatos | Se eliminan (incluida la ubicación GPS) | Privacidad. |
| Fotos ya pequeñas | JPEG ≤ 1,5 MB, ≤ 2400 px y sin giro: se suben **sin recomprimir** | Evita perder calidad en una foto que ya está bien. |
| Transparencia | PNG/WebP con transparencia → fondo blanco | JPEG no admite transparencia. |

Resultados con fotos reales del sitio (solo lectura): 34 MB → 537 KB, 20 MB → 783 KB, 12 MB → 320 KB, 6,2 MB → 623 KB, 1,9 MB → 185 KB.
Motivo principal: el sitio publicado ya pesa ~850 MB (límite documentado de GitHub Pages: 1 GB) y 741 MB son originales sin optimizar.

## Nombres y protección de archivos

Cada foto nueva se llama `<referencia>-<aaaammdd>-<8 hex aleatorios>.jpg` (p. ej. `mkw-re-034-20261118-3fa9c1d2.jpg`; si la propiedad aún no tiene
referencia, se usa el título). Nunca depende del nombre original, así que no se pisa la foto de otra propiedad. No se borra nada de Medios:
«Quitar» y «Reemplazar» solo cambian la lista.

## Limitaciones conocidas

- **Fotos quitadas en la misma sesión:** si Loyra agrega una foto y la quita antes de publicar, Decap igualmente publica ese archivo (guarda todos los
  borradores de la entrada). Queda un archivo sin usar en Medios (≈ 0,5 MB); no afecta al sitio.
- **Duplicadas:** se detectan dentro de la sesión (mismo archivo o misma imagen), no contra fotos ya publicadas en sesiones anteriores.
- **Imágenes idénticas:** Decap identifica los borradores por el hash del contenido; por eso el widget rechaza una imagen idéntica a otra de la lista
  (evita una referencia rota).
- **HEIC (iPhone):** Chrome no lo decodifica; el widget lo avisa y pide exportar a JPG (Safari sí lo procesa).
- **APIs de Decap:** además de `CMS.registerWidget`, usa `window.h`/`window.createClass`, `isValid()` y las propiedades `onPersistMedia`,
  `getAsset`, `entry`, `value`, `onChange` y `field` que Decap entrega a todo control (las usa también su widget de imagen). Para no depender de
  cambios en Decap, la versión de Decap está **fija** en `admin/index.html`. Para actualizarla: cambiar el número y ejecutar
  `node scripts/verificar-galeria-widget.js`.

## Pruebas

`node scripts/verificar-galeria-widget.js [--construir] [--optimizacion] [--detalle]` usa el Decap real con su backend de prueba `test-repo` (todo en
memoria; no escribe en GitHub ni en el repositorio) y cubre: selección múltiple, arrastrar y soltar, 1/3/6/10/11 fotos, orden, portada, reemplazo,
edición de propiedades existentes, duplicadas, nombres repetidos, imágenes grandes, giro EXIF, formatos, errores, publicación fallida, cancelación y
(con `--construir`) la construcción del sitio ES/EN con lo guardado. **No prueba carga ni guardado reales contra GitHub** (requiere una sesión
autenticada): esa prueba la debe hacer una persona con sesión, ver «Primera prueba real».

### Primera prueba real (con sesión de GitHub)

1. Abrir `/admin/`, entrar con GitHub y crear una propiedad de borrador o abrir una de prueba.
2. Arrastrar 4–5 fotos a la zona punteada, ordenar, elegir portada y pulsar «Publicar» → «Publicar ahora».
3. Verificar en GitHub que hay **un commit** con la propiedad y las imágenes nuevas, y que la ficha pública (ES y EN) las muestra.

## Reversión

Las fotos y los datos son compatibles con la lista anterior, así que volver atrás no requiere migrar nada.

- **Normal:** `git revert <commit del widget>` (restaura la lista nativa en `admin/config.yml`, quita el script de `admin/index.html` y
  vuelve `decap-cms@^3.0.0`). Si se quiere conservar la versión fija de Decap, volver a poner el número en `admin/index.html` tras el revert.
- **Urgente (el panel no carga el widget):** en `admin/config.yml`, cambiar el campo `galeria` por la lista anterior:

```yaml
          - label: "Fotografías (máx. 10)"
            name: "galeria"
            widget: "list"
            required: false
            min: 3
            max: 10
            summary: "{{fields.portada | ternary('★ PORTADA — ','')}}{{fields.archivo}}"
            label_singular: "Fotografía"
            fields:
              - { label: "Archivo", name: "archivo", widget: "image" }
              - { label: "Texto alternativo", name: "alt", widget: "string", required: false }
              - { label: "Usar como portada", name: "portada", widget: "boolean", default: false }
```

(El build fallará con «galería… max» solo si `min`/`max` no coinciden con `limitesMedia`.)
