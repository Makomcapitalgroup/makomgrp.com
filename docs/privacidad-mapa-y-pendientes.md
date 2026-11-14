# Mapa de las fichas: privacidad y pendientes técnicos

Documento interno (no se publica en el sitio: Eleventy solo procesa plantillas `.njk`).

## Qué se publica y qué se guarda

- **Sitio público:** cada ficha con mapa muestra un círculo de 450 m **sin marcador**. El centro del círculo es el punto guardado desplazado a propósito (90–170 m, de forma determinista por propiedad) y redondeado a 3 decimales. Ninguna página, metadato (JSON-LD, Open Graph), enlace ni archivo de datos del sitio contiene el punto guardado.
- **Repositorio (público):** las coordenadas de `mapa.latitud` / `mapa.longitud` se guardan como texto con **máximo 3 decimales** (≈110 m, zona aproximada).
  - El formulario del CMS (`admin/config.yml`) valida ese patrón y no admite más precisión.
  - `/admin/buscar-ubicacion.html` ya entrega los valores redondeados a 3 decimales.
  - El build (`validarFichas` en `.eleventy.js`) **falla** si algún archivo de `content/propiedades/` guarda una coordenada con más de 3 decimales (incluso con el mapa desactivado).
  - `scripts/verificar-ficha.js` comprueba el patrón, la guardia del build, los datos y que nada publicado repita el punto guardado.

## Limitación: el historial anterior conserva las coordenadas originales

Las propiedades **MKW-RE-001, RE-005, RE-014, RE-020 y RE-032** se guardaron antes con coordenadas de hasta 6 decimales (precisión de décimas de metro). Este cambio **solo corrige el árbol actual**: los commits anteriores de Git (y cualquier clon, fork o caché de GitHub) **siguen conteniendo esos valores**. Esta corrección **no elimina esa exposición histórica**.

Eliminarla exigiría reescribir el historial (`git filter-repo` + force push), con riesgos (rompe clones, PR y enlaces a commits, y no purga forks ni cachés). No se hizo. Si MAKOM decide que alguna de esas ubicaciones es reservada, hay que decidirlo de forma explícita y planificarlo.

## Pendientes técnicos futuros

1. **Redirección HTTP 301 real de RE-020.** La dirección antigua (`/propiedades/apartamentos-de-1-y-2-recámaras-a-dos-minutos-del-metro-—-desde-150-000/`) usa una **redirección suave** (meta refresh + JavaScript + canonical + `noindex`), porque GitHub Pages no puede devolver 301. Un 301 real requiere poner un proxy delante del dominio (p. ej. Cloudflare) o cambiar de hosting. Hoy el DNS está en Namecheap y apunta a GitHub Pages; Cloudflare solo aloja el Worker OAuth del CMS. No se tocó ninguna configuración de DNS ni de hosting.
2. Probar en Safari / iPhone / Firefox reales (solo se verificó en Chrome).
3. Probar la edición de los campos nuevos en Decap con una sesión de GitHub real.
4. Portadas de 1600 px o más (el build avisa de las que no llegan; nunca se reescalan).

## Pendientes comerciales (Loyra)

- Confirmar los baños reales de RE-020 (el dato guardado es 2; el título habla de 1 y 2 recámaras).
- Confirmar el «Lounge social» y el «Área de scooter» de RE-020 (están **desactivados**; la descripción comercial existente aún los menciona y Loyra la revisará).
- Perfiles de asesores (nombre, cargo, idoneidad, foto, WhatsApp), video, planos, fecha de referencia del precio y precios por recámara: no se publica ningún dato de ejemplo.
