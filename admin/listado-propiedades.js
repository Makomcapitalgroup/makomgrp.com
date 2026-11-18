/**
 * Enriquecimiento VISUAL del listado de Propiedades de Decap CMS (versión fijada en admin/index.html).
 *
 * Qué hace: a cada tarjeta del listado le pone la portada real, el estado y un acceso a la edición, SOLO con atributos (data-mk-*) y una variable CSS
 * (--mk-portada) en el <li> de la tarjeta; todo lo demás es CSS (admin/tema-makom.css). No crea, mueve ni borra nodos de Decap, no cambia sus textos y no toca
 * ninguna función del listado (búsqueda, orden, filtros, vistas, paginación y navegación siguen siendo las nativas).
 *
 * De dónde salen los datos (en este orden):
 *   1. /admin/listado-propiedades.json — lo genera el build del sitio (content/admin-listado-propiedades.njk + filtro «listadoAdminPropiedades» de .eleventy.js) con
 *      los campos mínimos de TODAS las propiedades y la URL de una miniatura webp de 480 px de la portada (/assets/propiedades/_optimizadas/…). Mismo origen y
 *      mismo despliegue que el panel: sin servicios externos ni CORS. Se valida con `cache: 'no-cache'` (el navegador pregunta si cambió; si no, 304).
 *   2. Una copia en localStorage de la última lectura correcta (para que el listado se vea enriquecido al instante y también si el archivo no responde).
 *   3. Si ninguna existe, las tarjetas se quedan EXACTAMENTE como las dibuja Decap (nunca se rompe nada).
 *   Tras guardar una propiedad desde el panel (eventos oficiales postSave/postPublish de CMS.registerEventListener) se actualiza esa fila en memoria con los datos
 *   guardados (estado, referencia, operación, tipo, título); si la portada cambió, la miniatura se oculta hasta el siguiente despliegue (se muestra el marcador
 *   de MAKOM, nunca una foto equivocada).
 *
 * Cómo se mantiene el enriquecimiento (sin esperas arbitrarias):
 *   - Un MutationObserver (solo childList) detecta cuando Decap crea o recrea tarjetas (cambio de vista, de colección, orden, filtros, búsqueda, «cargar más»,
 *     volver desde la edición) y, en el siguiente cuadro de animación, reaplica los atributos desde los datos que YA están en memoria (instantáneo). Los
 *     atributos que ponemos no son observados (no hay bucles). Fuera del listado (p. ej. en el editor) el observador no hace nada.
 *   - La carga de miniaturas es perezosa (IntersectionObserver, 400 px de margen) y única por URL; un error de carga deja el marcador de MAKOM.
 *
 * Dependencias de Decap (riesgo documentado en docs/admin-formulario-compacto.md): (a) la ruta de edición #/collections/propiedades/entries/<slug> (la que usa
 * Decap para navegar; es el contrato público de su enrutador) y (b) que la tarjeta sea un <li> con ese enlace. Si una actualización de Decap cambia alguna de las dos,
 * el enriquecimiento deja de aplicarse (las tarjetas siguen siendo las nativas). Al actualizar Decap: repetir scripts/verificar-galeria-widget.js (grupo 17).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.CMS) return;

  var COLECCION = 'propiedades';
  var ESTADOS = { disponible: 1, reservada: 1, alquilada: 1, vendida: 1, archivada: 1, borrador: 1 };
  var RE_MINIATURA = /^\/assets\/propiedades\/_optimizadas\/[A-Za-z0-9_.-]+\.webp$/;
  var CLAVE_CACHE = 'mk-listado-propiedades-v1';
  var REFRESCO_MS = 120000; // el archivo se vuelve a validar (304 si no cambió) como máximo cada 2 minutos al entrar al listado
  var RUTA_DATOS = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) return new URL('listado-propiedades.json', s).pathname;
    } catch (e) { /* se usa la ruta fija */ }
    return '/admin/listado-propiedades.json';
  })();

  var filas = new Map(); // slug (NFC) -> fila del archivo de datos
  var version = 0; // sube cada vez que cambian los datos: obliga a reaplicar
  var imagenes = new Map(); // url -> 'ok' | 'error'
  var cargas = new Map(); // url -> Promise (carga en curso)
  var estadoDatos = 'inicial'; // inicial | cache | ok | error
  var ultimaLectura = 0;
  var leyendo = false;
  var observadas = new Set(); // <li> con una miniatura pendiente de cargar
  var errorCache = null; // último error al guardar la copia local (solo diagnóstico)

  function marcarEstado(e) {
    estadoDatos = e;
    try { document.documentElement.setAttribute('data-mk-listado', e); } catch (x) { /* nada */ }
  }
  function normalizar(s) {
    var t = String(s == null ? '' : s);
    try { t = decodeURIComponent(t); } catch (e) { /* ya estaba decodificado */ }
    return t.normalize('NFC');
  }
  function fila(o) {
    // Solo se conservan los campos que usa la tarjeta; todo se trata como dato NO confiable (se valida antes de usarlo).
    if (!o || typeof o.slug !== 'string') return null;
    var p = o.portada && typeof o.portada === 'object' ? o.portada : null;
    return {
      slug: normalizar(o.slug),
      estado: typeof o.estado === 'string' ? o.estado : null,
      portadaOriginal: p && typeof p.original === 'string' ? p.original : null,
      miniatura: p && typeof p.miniatura === 'string' && RE_MINIATURA.test(p.miniatura) ? p.miniatura : null
    };
  }
  function aplicarDatos(lista, origen) {
    var nuevo = new Map();
    lista.forEach(function (o) { var f = fila(o); if (f) nuevo.set(f.slug, f); });
    filas = nuevo;
    version++;
    // Un error de carga anterior puede haber sido pasajero: con datos nuevos se vuelve a intentar.
    imagenes.forEach(function (v, k) { if (v === 'error') imagenes.delete(k); });
    marcarEstado(origen);
    programar();
  }

  /* ---------- Lectura de los datos ---------- */
  function leerCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CLAVE_CACHE) || 'null');
      if (c && c.version === 1 && Array.isArray(c.propiedades)) return c;
    } catch (e) { /* sin copia */ }
    return null;
  }
  function guardarCache(d) {
    try { localStorage.setItem(CLAVE_CACHE, JSON.stringify({ version: 1, propiedades: d.propiedades })); errorCache = null; } catch (e) { errorCache = String(e && e.message); /* cuota o modo privado: la copia no es imprescindible */ }
  }
  function leer() {
    if (leyendo) return;
    leyendo = true;
    fetch(RUTA_DATOS, { cache: 'no-cache', credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (!d || d.version !== 1 || !Array.isArray(d.propiedades)) throw new Error('formato desconocido');
        ultimaLectura = Date.now();
        aplicarDatos(d.propiedades, 'ok');
        guardarCache(d);
      })
      .catch(function (e) {
        ultimaLectura = Date.now(); // no se reintenta en cada cambio de pantalla: se vuelve a intentar pasado el intervalo de refresco
        if (estadoDatos === 'inicial') marcarEstado('error'); // con copia (estado «cache») se conserva lo que ya se ve
        if (window.console && console.warn) console.warn('[listado] No se pudo leer ' + RUTA_DATOS + ': ' + (e && e.message ? e.message : e) + '. Las tarjetas quedan como las dibuja Decap.');
      })
      .then(function () { leyendo = false; });
  }

  /* ---------- Miniaturas (carga perezosa y única por URL) ---------- */
  function cargarImagen(url) {
    if (imagenes.has(url)) return Promise.resolve(imagenes.get(url));
    if (cargas.has(url)) return cargas.get(url);
    var p = new Promise(function (resolver) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { imagenes.set(url, 'ok'); cargas.delete(url); resolver('ok'); };
      img.onerror = function () { imagenes.set(url, 'error'); cargas.delete(url); resolver('error'); };
      img.src = url;
    });
    cargas.set(url, p);
    return p;
  }
  var io = null;
  function observador() {
    if (io || typeof IntersectionObserver === 'undefined') return io;
    io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        var li = e.target;
        io.unobserve(li);
        observadas.delete(li);
        var url = li.getAttribute('data-mk-miniatura');
        if (!url) return;
        cargarImagen(url).then(function () { if (li.isConnected) pintar(li); });
      });
    }, { rootMargin: '400px 0px' });
    return io;
  }
  function pintar(li) {
    var url = li.getAttribute('data-mk-miniatura');
    var e = url && imagenes.get(url);
    if (e === 'ok') { li.style.setProperty('--mk-portada', 'url("' + url + '")'); li.setAttribute('data-mk-foto', 'ok'); }
    else if (e === 'error') { li.style.removeProperty('--mk-portada'); li.setAttribute('data-mk-foto', 'error'); }
  }

  /* ---------- Aplicación a las tarjetas ---------- */
  var RE_RUTA = /\/collections\/propiedades\/entries\/(.+)$/;
  function enListado() {
    var h = location.hash || '';
    if (/^#\/collections\/propiedades(\/(search|filter)\/.*)?$/.test(h)) return true; // listado (con búsqueda o filtro de la colección)
    return /^#\/search(\/|$)/.test(h); // búsqueda en todas las colecciones
  }
  function limpiar(li) {
    ['data-mk-card', 'data-mk-estado', 'data-mk-foto', 'data-mk-miniatura', 'data-mk-slug', 'data-mk-ver'].forEach(function (a) { li.removeAttribute(a); });
    li.style.removeProperty('--mk-portada');
    observadas.delete(li);
    if (io) io.unobserve(li);
  }
  function aplicar(li, slug) {
    var f = filas.get(slug);
    if (!f) { if (li.hasAttribute('data-mk-card')) limpiar(li); return; }
    if (li.getAttribute('data-mk-slug') === slug && li.getAttribute('data-mk-ver') === String(version)) {
      if (li.getAttribute('data-mk-foto') !== 'cargando') return; // ya está al día
    }
    li.setAttribute('data-mk-card', '');
    li.setAttribute('data-mk-slug', slug);
    li.setAttribute('data-mk-ver', String(version));
    if (f.estado && ESTADOS[f.estado]) li.setAttribute('data-mk-estado', f.estado); else li.removeAttribute('data-mk-estado');
    if (!f.miniatura) {
      li.removeAttribute('data-mk-miniatura');
      li.style.removeProperty('--mk-portada');
      li.setAttribute('data-mk-foto', 'sin');
      return;
    }
    li.setAttribute('data-mk-miniatura', f.miniatura);
    var e = imagenes.get(f.miniatura);
    if (e) { pintar(li); return; }
    li.style.removeProperty('--mk-portada');
    li.setAttribute('data-mk-foto', 'cargando');
    var o = observador();
    if (o) { observadas.add(li); o.observe(li); }
    else cargarImagen(f.miniatura).then(function () { if (li.isConnected) pintar(li); }); // navegador sin IntersectionObserver: carga directa
  }
  function reconciliar() {
    try {
      if (!enListado()) return;
      if (estadoDatos === 'inicial' && !leyendo) { var c = leerCache(); if (c) aplicarDatos(c.propiedades, 'cache'); leer(); }
      else if (!leyendo && Date.now() - ultimaLectura > REFRESCO_MS) leer();
      observadas.forEach(function (li) { if (!li.isConnected) { observadas.delete(li); if (io) io.unobserve(li); } }); // sin fugas
      if (!filas.size) return;
      var enlaces = document.querySelectorAll('a[href*="/collections/propiedades/entries/"]');
      for (var i = 0; i < enlaces.length; i++) {
        var m = RE_RUTA.exec(enlaces[i].getAttribute('href') || '');
        var li = enlaces[i].closest('li');
        if (m && li) aplicar(li, normalizar(m[1]));
      }
    } catch (e) {
      if (window.console && console.warn) console.warn('[listado] Enriquecimiento omitido: ' + (e && e.message ? e.message : e));
    }
  }
  var pendiente = false;
  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () { pendiente = false; reconciliar(); });
  }

  /* ---------- Cambios hechos desde este panel (eventos oficiales de Decap) ---------- */
  function alGuardar(carga) {
    try {
      var entrada = carga && carga.entry;
      var d = entrada && entrada.get ? entrada.get('data') : null;
      d = d && d.toJS ? d.toJS() : d;
      var slug = entrada && entrada.get ? entrada.get('slug') : null;
      var col = entrada && entrada.get ? entrada.get('collection') : COLECCION;
      if (!d || !slug || (col && col !== COLECCION)) return;
      slug = normalizar(slug);
      var previa = filas.get(slug) || { slug: slug, miniatura: null, portadaOriginal: null };
      var galeria = (d.fotografias && Array.isArray(d.fotografias.galeria)) ? d.fotografias.galeria : [];
      var portada = null;
      for (var i = 0; i < galeria.length; i++) if (galeria[i] && galeria[i].portada) { portada = galeria[i]; break; }
      if (!portada && galeria.length) portada = galeria[0];
      var original = portada && typeof portada.archivo === 'string' ? portada.archivo : null;
      var actual = {
        slug: slug,
        estado: typeof d.estado === 'string' ? d.estado : previa.estado,
        portadaOriginal: original,
        // Misma portada que en el último despliegue: se conserva su miniatura. Portada nueva: marcador de MAKOM hasta el próximo despliegue.
        miniatura: original && original === previa.portadaOriginal ? previa.miniatura : null
      };
      filas.set(slug, actual);
      version++;
      programar();
    } catch (e) { /* un fallo aquí nunca debe afectar al guardado de Decap */ }
  }
  try {
    window.CMS.registerEventListener({ name: 'postSave', handler: alGuardar });
    window.CMS.registerEventListener({ name: 'postPublish', handler: alGuardar });
  } catch (e) { /* sin eventos: el listado se actualiza con el siguiente despliegue */ }

  /* ---------- Arranque ---------- */
  function iniciar() {
    try {
      new MutationObserver(function (cambios) {
        if (!enListado()) return;
        for (var i = 0; i < cambios.length; i++) if (cambios[i].addedNodes && cambios[i].addedNodes.length) { programar(); return; }
      }).observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener('hashchange', programar);
      programar();
    } catch (e) { /* sin enriquecimiento */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  // Solo para las pruebas automáticas (scripts/verificar-galeria-widget.js).
  window.MakomListadoPropiedades = {
    reconciliar: reconciliar,
    estado: function () { return { datos: estadoDatos, filas: filas.size, version: version, imagenes: imagenes.size, observadas: observadas.size, ultimaLectura: ultimaLectura, errorCache: errorCache }; },
    recargar: function () { ultimaLectura = 0; leer(); },
    claveCache: CLAVE_CACHE,
    rutaDatos: RUTA_DATOS
  };
})();
