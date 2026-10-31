'use strict';

document.addEventListener('DOMContentLoaded', function () {

  /* ============================================================
     1. HEADER SCROLL — requestAnimationFrame optimized
  ============================================================ */
  var header = document.getElementById('header');
  var scrollTicking = false;

  function onScroll() {
    if (!scrollTicking) {
      requestAnimationFrame(updateHeader);
      scrollTicking = true;
    }
  }

  function updateHeader() {
    if (window.scrollY > 40) {
      header.classList.add('header--scrolled');
    } else {
      header.classList.remove('header--scrolled');
    }
    scrollTicking = false;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  updateHeader(); // run once on load

  /* ============================================================
     2. MOBILE MENU — toggle, open, close, focus trap, Escape
  ============================================================ */
  var hamburger = document.getElementById('hamburger');
  var mobileMenu = document.getElementById('mobile-menu');
  var mobileOverlay = document.getElementById('mobile-overlay');
  var mobileMenuOpen = false;

  var focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  function openMobileMenu() {
    mobileMenuOpen = true;
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    mobileOverlay.classList.add('is-visible');
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-label', 'Cerrar menú de navegación');
    document.body.style.overflow = 'hidden';

    // Focus first focusable element
    var firstFocusable = mobileMenu.querySelectorAll(focusableSelectors)[0];
    if (firstFocusable) {
      setTimeout(function () { firstFocusable.focus(); }, 50);
    }
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    mobileOverlay.classList.remove('is-visible');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Abrir menú de navegación');
    document.body.style.overflow = '';
    // Devuelve el foco al botón solo si es visible (en escritorio el botón está oculto: no hay a dónde devolverlo).
    if (hamburger.offsetParent !== null) hamburger.focus();
  }

  function toggleMobileMenu() {
    if (mobileMenuOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  // Focus trap inside mobile menu
  function trapFocus(e) {
    if (!mobileMenuOpen) return;
    var focusable = Array.from(mobileMenu.querySelectorAll(focusableSelectors));
    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  hamburger.addEventListener('click', toggleMobileMenu);
  mobileOverlay.addEventListener('click', closeMobileMenu);
  document.addEventListener('keydown', trapFocus);

  // Close mobile menu on link click
  var mobileLinks = mobileMenu.querySelectorAll('.mobile-menu__link');
  mobileLinks.forEach(function (link) {
    link.addEventListener('click', closeMobileMenu);
  });

  /* ============================================================
     3. MEGA MENU — hover intent with 100ms delay, keyboard accessible
  ============================================================ */
  var megaParent = document.querySelector('.header__nav-item--has-mega');
  var megaTrigger = document.querySelector('.header__nav-trigger');
  var megaMenu = document.getElementById('mega-menu');
  var megaOpen = false;
  var megaHoverTimer = null;

  function openMegaMenu() {
    megaOpen = true;
    megaMenu.classList.add('is-open');
    megaTrigger.setAttribute('aria-expanded', 'true');
  }

  function closeMegaMenu() {
    megaOpen = false;
    megaMenu.classList.remove('is-open');
    megaTrigger.setAttribute('aria-expanded', 'false');
  }

  function toggleMegaMenu() {
    if (megaOpen) {
      closeMegaMenu();
    } else {
      openMegaMenu();
    }
  }

  if (megaParent) {
    megaParent.addEventListener('mouseenter', function () {
      clearTimeout(megaHoverTimer);
      megaHoverTimer = setTimeout(openMegaMenu, 100);
    });

    megaParent.addEventListener('mouseleave', function () {
      clearTimeout(megaHoverTimer);
      megaHoverTimer = setTimeout(closeMegaMenu, 100);
    });
  }

  if (megaTrigger) {
    megaTrigger.addEventListener('click', toggleMegaMenu);
  }

  /* ============================================================
     4. SCROLL REVEAL — IntersectionObserver, stagger via CSS var
  ============================================================ */
  var revealElements = document.querySelectorAll('[data-reveal]');

  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var delay = entry.target.getAttribute('data-reveal-delay');
            if (delay) {
              entry.target.style.setProperty('--reveal-delay', delay + 'ms');
            }
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px'
      }
    );

    revealElements.forEach(function (el) {
      var delay = el.getAttribute('data-reveal-delay');
      if (delay) {
        el.style.setProperty('--reveal-delay', delay + 'ms');
      }
      revealObserver.observe(el);
    });
  } else {
    // Fallback: show all immediately
    revealElements.forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  /* ============================================================
     5. HERO ENTRANCE — add .hero--loaded after 300ms
  ============================================================ */
  setTimeout(function () {
    document.body.classList.add('hero--loaded');
  }, 300);

  /* ============================================================
     5b. FILTROS ACUMULATIVOS — componente compartido y helpers
     Lo usan el catálogo (sección 6) y el buscador del Hero (sección
     19), así que se comportan igual en ambos y en ES/EN.
     - crearMulti: desplegable de casillas (disclosure + checkboxes
       nativos). Seleccionar NO lo cierra; Escape, un clic fuera o el
       foco en otro control sí. Es solo vista: el controlador decide el
       estado y llama a actualizar().
     - Precio: RANGOS (a, b]: incluyen su límite superior y excluyen el
       inferior, así que no se solapan ni dejan huecos. Un rango es la
       ficha "a-b" (o "a-max" para el último); enlaces antiguos ?max=N
       se traducen a los rangos equivalentes.
     - Parámetros de URL: un valor repetido por selección (?tipo=a&tipo=b
       &zona=x&precio=100000-150000), también se aceptan listas con comas.
  ============================================================ */
  var mkFiltros = (function () {
    var abiertos = [];
    var seq = 0;

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    function cerrarTodos(salvo) {
      abiertos.slice().forEach(function (w) { if (w !== salvo) w.cerrar(); });
    }

    // Clic fuera o foco en otro control: cierra los desplegables abiertos.
    // (El foco por teclado se vigila con focusin; un clic con el ratón, con
    // pointerdown — Safari no enfoca casillas al pulsar, por eso no se usa
    // focusout.)
    document.addEventListener('pointerdown', function (e) {
      abiertos.slice().forEach(function (w) { if (!w.el.contains(e.target)) w.cerrar(); });
    });
    document.addEventListener('focusin', function (e) {
      abiertos.slice().forEach(function (w) { if (!w.el.contains(e.target)) w.cerrar(); });
    });

    // cfg: { id, ariaLabel, placeholder, triggerClass, claseWrap, textoLimpiar,
    //        nota, alAlternar(valor), alLimpiar() }
    function crearMulti(cfg) {
      var n = ++seq;
      var wrap = el('div', 'mk-multi' + (cfg.claseWrap ? ' ' + cfg.claseWrap : ''));
      var trigger = el('button', (cfg.triggerClass || '') + ' mk-multi__trigger');
      trigger.type = 'button';
      trigger.id = cfg.id;
      var panelId = cfg.id + '-panel';
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panelId);
      var valueEl = el('span', 'mk-multi__value', cfg.placeholder);
      trigger.appendChild(valueEl);

      var panel = el('div', 'mk-multi__panel');
      panel.id = panelId;
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', cfg.ariaLabel);
      panel.hidden = true;
      var list = el('div', 'mk-multi__list');
      var foot = el('div', 'mk-multi__foot');
      var nota = null;
      if (cfg.nota) { nota = el('p', 'mk-multi__nota', cfg.nota); foot.appendChild(nota); }
      var clearBtn = el('button', 'mk-multi__clear', cfg.textoLimpiar);
      clearBtn.type = 'button';
      clearBtn.disabled = true;
      foot.appendChild(clearBtn);
      panel.appendChild(list);
      panel.appendChild(foot);
      wrap.appendChild(trigger);
      wrap.appendChild(panel);

      var items = {};     // valor -> { input, row }
      var orden = [];     // valores en orden de aparición
      var clave = null;

      var api = { el: wrap, trigger: trigger, panel: panel };

      // items: [{ value, label, grupo, hijo, fuerte }]. Solo reconstruye
      // si cambió la lista (el estado marcado se actualiza en sitio).
      api.setOpciones = function (lista) {
        var k = lista.map(function (o) { return o.value + '|' + o.label + '|' + (o.grupo || ''); }).join('§');
        if (k === clave) return;
        clave = k;
        var teniaFoco = panel.contains(document.activeElement);
        list.innerHTML = '';
        items = {};
        orden = [];
        var grupoActual = null;
        var contenedor = list;
        lista.forEach(function (o, i) {
          if ((o.grupo || '') !== grupoActual) {
            grupoActual = o.grupo || '';
            if (grupoActual) {
              contenedor = el('div', 'mk-multi__grupo');
              contenedor.setAttribute('role', 'group');
              contenedor.setAttribute('aria-label', grupoActual);
              list.appendChild(contenedor);
            } else {
              contenedor = list;
            }
          }
          var row = el('label', 'mk-multi__item' + (o.hijo ? ' mk-multi__item--hijo' : '') + (o.fuerte ? ' mk-multi__item--fuerte' : ''));
          var input = el('input', 'mk-multi__input');
          input.type = 'checkbox';
          input.value = o.value;
          input.id = cfg.id + '-o' + i;
          var box = el('span', 'mk-multi__box');
          box.setAttribute('aria-hidden', 'true');
          var text = el('span', 'mk-multi__text', o.label);
          row.appendChild(input);
          row.appendChild(box);
          row.appendChild(text);
          contenedor.appendChild(row);
          input.addEventListener('change', function () { cfg.alAlternar(o.value); });
          items[o.value] = { input: input, row: row };
          orden.push(o.value);
        });
        if (teniaFoco && !panel.contains(document.activeElement)) trigger.focus();
      };

      // estado: { [valor]: { c: marcada, m: mixta, d: deshabilitada } }
      api.actualizar = function (estado, texto, total) {
        orden.forEach(function (v) {
          var s = estado[v] || {};
          var it = items[v];
          it.input.checked = !!s.c;
          it.input.indeterminate = !!s.m && !s.c;
          it.input.disabled = !!s.d;
          it.row.classList.toggle('is-disabled', !!s.d);
          it.row.classList.toggle('is-checked', !!s.c);
        });
        valueEl.textContent = texto;
        trigger.classList.toggle('is-active', total > 0);
        wrap.classList.toggle('is-active', total > 0);
        clearBtn.disabled = total === 0;
      };

      api.setDisabled = function (d) {
        trigger.disabled = !!d;
        if (d) api.cerrar();
      };

      api.abierto = false;
      api.abrir = function () {
        if (api.abierto || trigger.disabled) return;
        cerrarTodos(api);
        api.abierto = true;
        panel.hidden = false;
        wrap.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        abiertos.push(api);
      };
      api.cerrar = function () {
        if (!api.abierto) return;
        api.abierto = false;
        panel.hidden = true;
        wrap.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        var i = abiertos.indexOf(api);
        if (i !== -1) abiertos.splice(i, 1);
      };

      function habilitados() {
        return orden.map(function (v) { return items[v].input; }).filter(function (i) { return !i.disabled; });
      }

      trigger.addEventListener('click', function () {
        if (api.abierto) api.cerrar(); else api.abrir();
      });
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          api.abrir();
          var h = habilitados();
          if (h.length) h[0].focus();
        } else if (e.key === 'Escape' && api.abierto) {
          e.preventDefault();
          e.stopPropagation();
          api.cerrar();
        }
      });
      panel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          api.cerrar();
          trigger.focus();
          return;
        }
        var campos = habilitados();
        var idx = campos.indexOf(document.activeElement);
        var destino = null;
        if (e.key === 'ArrowDown') destino = campos[(idx + 1) % campos.length];
        else if (e.key === 'ArrowUp') destino = idx <= 0 ? campos[campos.length - 1] : campos[idx - 1];
        else if (e.key === 'Home') destino = campos[0];
        else if (e.key === 'End') destino = campos[campos.length - 1];
        if (destino) { e.preventDefault(); destino.focus(); }
      });
      clearBtn.addEventListener('click', function () { cfg.alLimpiar(); });
      api.limpiarBtn = clearBtn;
      return api;
    }

    // ----- Parámetros de URL (valores repetidos o separados por comas) -----
    function lista(params, clave) {
      var out = [];
      params.getAll(clave).forEach(function (v) {
        v.split(',').forEach(function (x) {
          x = x.trim();
          if (x && out.indexOf(x) === -1) out.push(x);
        });
      });
      return out;
    }

    // Respeta el orden del catálogo para que la misma selección dé
    // siempre la misma URL.
    function ordenar(valores, ordenRef) {
      return valores.slice().sort(function (a, b) {
        var ia = ordenRef.indexOf(a), ib = ordenRef.indexOf(b);
        return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
      });
    }

    // ----- Rangos de precio: ficha "a-b" = a < precio <= b; "a-max" sin tope -----
    function parseFicha(t) {
      var m = /^(\d{1,9})-(\d{1,9}|max)$/.exec(t);
      if (!m) return null;
      var a = parseInt(m[1], 10);
      var b = m[2] === 'max' ? Infinity : parseInt(m[2], 10);
      return b > a ? { a: a, b: b } : null;
    }

    function dentroDeFicha(t, precio) {
      var r = parseFicha(t);
      return !!r && precio > r.a && precio <= r.b;
    }

    function dinero(n) {
      return '$' + n.toLocaleString('en-US');
    }

    function etiquetaFicha(t, T) {
      var r = parseFicha(t);
      if (!r) return t;
      if (r.b === Infinity) return T.over + ' ' + dinero(r.a);
      if (r.a === 0) return T.upTo + ' ' + dinero(r.b);
      return dinero(r.a) + ' – ' + dinero(r.b);
    }

    // Límites ordenados -> fichas consecutivas sin huecos ni solapes.
    function fichasDeLimites(limites) {
      var out = [];
      var prev = 0;
      limites.forEach(function (b) { out.push(prev + '-' + b); prev = b; });
      out.push(prev + '-max');
      return out;
    }

    function ordenarFichas(fichas) {
      var vistos = {};
      return fichas.filter(function (f) {
        if (vistos[f]) return false;
        vistos[f] = true;
        return true;
      }).sort(function (x, y) {
        var a = parseFicha(x), b = parseFicha(y);
        return a.a - b.a || (a.b === Infinity ? 1e12 : a.b) - (b.b === Infinity ? 1e12 : b.b);
      });
    }

    // Fichas válidas de ?precio=… más las de un ?max=N antiguo: si N es uno
    // de los límites se expande a los rangos hasta N (equivalente exacto de
    // "precio <= N"); si no, queda como rango propio "0-N".
    function parsePrecio(params, limites) {
      var out = [];
      lista(params, 'precio').forEach(function (t) { if (parseFicha(t)) out.push(t); });
      var max = params.get('max');
      if (max && /^\d{1,9}$/.test(max)) {
        var n = parseInt(max, 10);
        if (n > 0) {
          var i = limites.indexOf(n);
          if (i !== -1) out = out.concat(fichasDeLimites(limites).slice(0, i + 1));
          else out.push('0-' + n);
        }
      }
      return ordenarFichas(out);
    }

    function cumplePrecio(precio, fichas) {
      return fichas.some(function (t) { return dentroDeFicha(t, precio); });
    }

    // ----- Ubicación: regiones ("todas las zonas") y zonas sueltas -----
    // sel = { region: [], zona: [] }; ctx = { regionDe(zona), zonasDe(region) }
    function alternarUbicacion(sel, valor, ctx) {
      var region = sel.region.slice();
      var zona = sel.zona.slice();
      var v = valor.split(':');
      var i;
      if (v[0] === 'region') {
        i = region.indexOf(v[1]);
        if (i !== -1) {
          region.splice(i, 1);
        } else {
          region.push(v[1]);
          zona = zona.filter(function (z) { return ctx.regionDe(z) !== v[1]; });
        }
      } else if (v[0] === 'zona') {
        var r = ctx.regionDe(v[1]);
        if (region.indexOf(r) !== -1) {
          // La zona estaba incluida por su región: se pasa a zonas sueltas
          // (todas las de esa región menos la desmarcada).
          region.splice(region.indexOf(r), 1);
          ctx.zonasDe(r).forEach(function (z) { if (z !== v[1] && zona.indexOf(z) === -1) zona.push(z); });
        } else {
          i = zona.indexOf(v[1]);
          if (i !== -1) zona.splice(i, 1); else zona.push(v[1]);
        }
      }
      return { region: region, zona: zona };
    }

    return {
      crearMulti: crearMulti,
      lista: lista,
      ordenar: ordenar,
      parseFicha: parseFicha,
      dentroDeFicha: dentroDeFicha,
      etiquetaFicha: etiquetaFicha,
      fichasDeLimites: fichasDeLimites,
      ordenarFichas: ordenarFichas,
      parsePrecio: parsePrecio,
      cumplePrecio: cumplePrecio,
      alternarUbicacion: alternarUbicacion
    };
  })();

  /* ============================================================
     6. PROPERTY FILTERS — motor único de filtrado del catálogo
     Cuatro filtros independientes y ACUMULATIVOS (Operación, Tipo,
     Ubicación y Precio) más Categoría (selección única). Todos escriben
     sobre UN solo estado, y ese estado es lo único que decide qué
     tarjetas se ven. Lógica: dentro de un mismo filtro, OR (cualquiera de
     las opciones marcadas); entre filtros distintos, AND. Un filtro sin
     selección no restringe. El estado vive en la URL con un valor
     repetido por selección (?op=venta&op=alquiler&tipo=casa&tipo=ph
     &region=…&zona=…&precio=100000-150000&cat=…) para poder recargar,
     compartir y usar atrás/adelante; los enlaces antiguos de un solo
     valor (incluido ?max=150000) siguen funcionando.
     Solo se leen datos públicos que el build dejó en el DOM
     (data-op, data-cat, data-tipo, data-zona, data-precio): nunca hay
     ubicación interna ni direcciones. Excepción de Categoría: si un tipo
     marcado no pertenece a la categoría elegida, manda el tipo.
     Precio: rangos (a, b] entre los límites de data-presupuestos; siempre
     disponible, no depende de la operación.
  ============================================================ */
  (function () {
    var form = document.getElementById('prop-buscador');
    // Operación: casillas acumulativas (conserva .filter-tab + data-filter,
    // contrato que también lee el buscador del Home). Categoría: grupo de
    // selección única (role="radiogroup") con data-categoria.
    var opTabs = Array.prototype.slice.call(document.querySelectorAll('.filter-tab[data-filter]'));
    var catTabs = Array.prototype.slice.call(document.querySelectorAll('.filter-tab[data-categoria]'));
    var cards = Array.prototype.slice.call(document.querySelectorAll('.propiedades__grid .property-card'));
    // Estado de espera inicial: el script en línea de catalogo.njk marca
    // <html> con estas clases cuando la URL trae filtros, para que no se
    // vean las 23 tarjetas ni se mueva el contenido mientras este motor
    // carga. Aquí se liberan en cuanto el motor pinta (o si no puede
    // arrancar); si este archivo no llega a ejecutarse, el propio script
    // en línea las libera en el evento load.
    function liberarEspera() {
      document.documentElement.classList.remove('catalogo-filtrando', 'catalogo-con-chips');
    }
    var srcTipo = document.getElementById('f-tipo');
    var srcUbic = document.getElementById('f-ubicacion');
    var datosPrecio = document.getElementById('f-precio');
    var hostTipo = document.getElementById('f-tipo-host');
    var hostUbic = document.getElementById('f-ubicacion-host');
    var hostPrecio = document.getElementById('f-precio-host');
    if (!form || cards.length === 0 || !srcTipo || !srcUbic || !datosPrecio || !hostTipo || !hostUbic || !hostPrecio) {
      liberarEspera();
      return;
    }

    var isEn = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
    var TXT = isEn ? {
      upTo: 'Up to', over: 'Over',
      type: 'Type', location: 'Location', price: 'Price', remove: 'Remove filter',
      one: 'property', many: 'properties', of: 'of', noStock: '(no listings)',
      allTypes: 'All types', allLocations: 'All locations', anyPrice: 'Any price',
      types: 'types', locations: 'locations', ranges: 'ranges',
      clear: 'Clear', typeLabel: 'Property type', priceNote: 'Each range includes its upper limit.'
    } : {
      upTo: 'Hasta', over: 'Más de',
      type: 'Tipo', location: 'Ubicación', price: 'Precio', remove: 'Quitar filtro',
      one: 'propiedad', many: 'propiedades', of: 'de', noStock: '(sin propiedades publicadas)',
      allTypes: 'Todos los tipos', allLocations: 'Todas las ubicaciones', anyPrice: 'Cualquier precio',
      types: 'tipos', locations: 'ubicaciones', ranges: 'rangos',
      clear: 'Limpiar', typeLabel: 'Tipo de propiedad', priceNote: 'Cada rango incluye su límite superior.'
    };

    var KNOWN = ['op', 'cat', 'tipo', 'region', 'zona', 'precio', 'max'];
    var has = function (obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); };
    var F = mkFiltros;

    // ----- Catálogo derivado de lo que renderizó el build -----
    var OPS = [];
    var CATS = [];
    opTabs.forEach(function (t) {
      var f = t.getAttribute('data-filter');
      if (f === 'venta' || f === 'alquiler') OPS.push(f);
    });
    catTabs.forEach(function (t) {
      var f = t.getAttribute('data-categoria');
      if (f === 'comercial' || f === 'residencial') CATS.push(f);
    });

    // Tipos VÁLIDOS = catálogo completo del build (no solo los que hoy
    // tienen propiedades). TIPOS[v] es la lista de categorías de sus
    // propiedades, o null si el tipo existe en el catálogo pero no tiene
    // inventario: su categoría es desconocida y NO se inventa, así que
    // no puede contradecir a ninguna categoría (el resultado será cero).
    var TIPOS = {};
    var TIPO_LABEL = {};
    var TIPO_LISTADOS = []; // con inventario, en orden de catálogo
    Array.prototype.slice.call(srcTipo.options).forEach(function (o) {
      if (o.value) {
        TIPOS[o.value] = (o.getAttribute('data-cats') || '').split(' ');
        TIPO_LABEL[o.value] = o.text;
        TIPO_LISTADOS.push(o.value);
      }
    });
    var TIPO_ORDEN = TIPO_LISTADOS.slice();
    var catalogoTipos = null;
    try { catalogoTipos = JSON.parse(form.getAttribute('data-tipos') || 'null'); } catch (err) { catalogoTipos = null; }
    if (catalogoTipos && catalogoTipos.length) {
      catalogoTipos.forEach(function (t) {
        TIPO_LABEL[t.v] = t.l;
        if (TIPO_ORDEN.indexOf(t.v) === -1) TIPO_ORDEN.push(t.v);
        if (!has(TIPOS, t.v)) TIPOS[t.v] = null;
      });
    }

    function tipoCompatible(tipo, cat) {
      return !cat || TIPOS[tipo] === null || TIPOS[tipo].indexOf(cat) !== -1;
    }

    // Ubicaciones VÁLIDAS = el catálogo completo que dejó el build (con
    // etiquetas del idioma de la página), no solo las que hoy tienen
    // propiedades. Una zona válida sin inventario es un filtro legítimo
    // (cero resultados); un identificador que no está en el catálogo se
    // ignora. Si el atributo faltara, se cae a lo que lista el selector.
    var REGIONES = {};
    var ZONAS = {};
    var UBIC_LABEL = {};
    var UBIC_ORDEN = [];
    var catalogo = null;
    try { catalogo = JSON.parse(form.getAttribute('data-ubicaciones') || 'null'); } catch (err) { catalogo = null; }
    if (catalogo && catalogo.length) {
      catalogo.forEach(function (u) {
        UBIC_LABEL[u.t + ':' + u.v] = u.l;
        UBIC_ORDEN.push(u.t + ':' + u.v);
        if (u.t === 'region') REGIONES[u.v] = true;
        if (u.t === 'zona') ZONAS[u.v] = u.r;
      });
    } else {
      Array.prototype.slice.call(srcUbic.options).forEach(function (o) {
        var v = o.value.split(':');
        if (v[0] === 'region') REGIONES[v[1]] = true;
        if (v[0] === 'zona') ZONAS[v[1]] = o.getAttribute('data-region');
        if (o.value) { UBIC_LABEL[o.value] = o.text.replace(/\s+—.*$/, ''); UBIC_ORDEN.push(o.value); }
      });
    }
    function regionDe(zona) {
      return zona && has(ZONAS, zona) ? ZONAS[zona] : '';
    }

    // Estructura del selector de ubicación: tal como la dejó el build
    // (grupo por región: "todas las zonas" + zonas con inventario).
    var UBIC_GRUPOS = [];  // [{ etiqueta, region, zonas: [{ value, label }] }]
    var ZONAS_LISTADAS = {}; // region -> [zona]
    Array.prototype.slice.call(srcUbic.children).forEach(function (nodo) {
      if (nodo.tagName !== 'OPTGROUP') return;
      var g = { etiqueta: nodo.label, region: '', zonas: [] };
      Array.prototype.slice.call(nodo.children).forEach(function (o) {
        var v = o.value.split(':');
        if (v[0] === 'region') g.region = v[1];
        if (v[0] === 'zona') g.zonas.push({ value: o.value, label: o.text });
      });
      if (g.region) {
        ZONAS_LISTADAS[g.region] = g.zonas.map(function (z) { return z.value.split(':')[1]; });
        UBIC_GRUPOS.push(g);
      }
    });
    var ctxUbic = {
      regionDe: regionDe,
      zonasDe: function (r) { return ZONAS_LISTADAS[r] || []; }
    };

    // Precio: límites (data-presupuestos) -> rangos consecutivos; solo se
    // ofrecen los que tienen propiedades (los demás siguen siendo válidos
    // en una URL, con cero resultados).
    var LIMITES = [];
    (datosPrecio.getAttribute('data-presupuestos') || '').split(',').forEach(function (v) {
      var n = parseInt(v, 10);
      if (n > 0 && LIMITES.indexOf(n) === -1) LIMITES.push(n);
    });
    LIMITES.sort(function (a, b) { return a - b; });
    var PRECIOS = [];
    cards.forEach(function (c) {
      var n = Number(c.getAttribute('data-precio'));
      if (n > 0) PRECIOS.push(n);
    });
    var FICHAS_LISTADAS = F.fichasDeLimites(LIMITES).filter(function (t) {
      return PRECIOS.some(function (p) { return F.dentroDeFicha(t, p); });
    });

    // ----- Estado y URL -----
    function emptyState() {
      return { op: [], cat: '', tipo: [], region: [], zona: [], precio: [] };
    }

    // Lee y NORMALIZA el estado desde una query string: ignora
    // parámetros desconocidos o inválidos y resuelve contradicciones.
    function parseState(search) {
      var p = new URLSearchParams(search);
      var s = emptyState();
      s.op = F.ordenar(F.lista(p, 'op').filter(function (v) { return OPS.indexOf(v) !== -1; }), OPS);
      var cat = p.get('cat');
      if (cat && CATS.indexOf(cat) !== -1) s.cat = cat;
      s.tipo = F.ordenar(F.lista(p, 'tipo').filter(function (v) { return has(TIPOS, v); }), TIPO_ORDEN);
      if (s.cat && s.tipo.some(function (t) { return !tipoCompatible(t, s.cat); })) s.cat = '';
      s.region = F.ordenar(F.lista(p, 'region').filter(function (v) { return has(REGIONES, v); }), UBIC_ORDEN.map(function (u) { return u.split(':')[1]; }));
      // Una zona cuya región ya está marcada es redundante.
      s.zona = F.ordenar(F.lista(p, 'zona').filter(function (v) {
        return has(ZONAS, v) && s.region.indexOf(regionDe(v)) === -1;
      }), UBIC_ORDEN.map(function (u) { return u.split(':')[1]; }));
      s.precio = F.parsePrecio(p, LIMITES);
      return s;
    }

    // Construye la query string conservando cualquier parámetro ajeno
    // (por ejemplo utm_*, que el formulario de contacto envía al CRM).
    function buildSearch(state, baseSearch) {
      var p = new URLSearchParams(baseSearch);
      KNOWN.forEach(function (k) { p.delete(k); });
      state.op.forEach(function (v) { p.append('op', v); });
      if (state.cat) p.set('cat', state.cat);
      state.tipo.forEach(function (v) { p.append('tipo', v); });
      state.region.forEach(function (v) { p.append('region', v); });
      state.zona.forEach(function (v) { p.append('zona', v); });
      state.precio.forEach(function (v) { p.append('precio', v); });
      var q = p.toString();
      return q ? '?' + q : '';
    }

    function hasFilters(s) {
      return !!(s.op.length || s.cat || s.tipo.length || s.region.length || s.zona.length || s.precio.length);
    }

    // Cadena para el evento Search: solo parámetros públicos del filtro.
    function trackString(s) {
      return buildSearch(s, '').replace(/^\?/, '') || 'all';
    }

    function matches(card, s) {
      if (s.op.length && s.op.indexOf(card.getAttribute('data-op')) === -1) return false;
      if (s.cat && card.getAttribute('data-cat') !== s.cat) return false;
      if (s.tipo.length && s.tipo.indexOf(card.getAttribute('data-tipo')) === -1) return false;
      if (s.region.length || s.zona.length) {
        var zona = card.getAttribute('data-zona') || '';
        if (!zona || (s.zona.indexOf(zona) === -1 && s.region.indexOf(regionDe(zona)) === -1)) return false;
      }
      if (s.precio.length) {
        var precio = Number(card.getAttribute('data-precio'));
        if (!(precio > 0) || !F.cumplePrecio(precio, s.precio)) return false;
      }
      return true;
    }

    // ----- Selectores múltiples (Tipo, Ubicación, Precio) -----
    var state = parseState(window.location.search);

    function copy(s) {
      return { op: s.op.slice(), cat: s.cat, tipo: s.tipo.slice(), region: s.region.slice(), zona: s.zona.slice(), precio: s.precio.slice() };
    }

    var multiTipo = F.crearMulti({
      id: 'f-tipo-btn', ariaLabel: TXT.typeLabel, placeholder: TXT.allTypes,
      triggerClass: 'prop-buscador__select', textoLimpiar: TXT.clear,
      alAlternar: function (v) {
        var next = copy(state);
        var i = next.tipo.indexOf(v);
        if (i !== -1) next.tipo.splice(i, 1);
        else {
          next.tipo.push(v);
          next.tipo = F.ordenar(next.tipo, TIPO_ORDEN);
          if (next.cat && !tipoCompatible(v, next.cat)) next.cat = '';
        }
        commit(next, trackString(next));
      },
      alLimpiar: function () {
        var next = copy(state);
        next.tipo = [];
        commit(next, trackString(next));
      }
    });
    var multiUbic = F.crearMulti({
      id: 'f-ubicacion-btn', ariaLabel: TXT.location, placeholder: TXT.allLocations,
      triggerClass: 'prop-buscador__select', textoLimpiar: TXT.clear,
      alAlternar: function (v) {
        var next = copy(state);
        var r = F.alternarUbicacion({ region: next.region, zona: next.zona }, v, ctxUbic);
        var orden = UBIC_ORDEN.map(function (u) { return u.split(':')[1]; });
        next.region = F.ordenar(r.region, orden);
        next.zona = F.ordenar(r.zona, orden);
        commit(next, trackString(next));
      },
      alLimpiar: function () {
        var next = copy(state);
        next.region = [];
        next.zona = [];
        commit(next, trackString(next));
      }
    });
    var multiPrecio = F.crearMulti({
      id: 'f-precio-btn', ariaLabel: TXT.price, placeholder: TXT.anyPrice,
      triggerClass: 'prop-buscador__select', claseWrap: 'mk-multi--end', textoLimpiar: TXT.clear, nota: TXT.priceNote,
      alAlternar: function (t) {
        var next = copy(state);
        var i = next.precio.indexOf(t);
        if (i !== -1) next.precio.splice(i, 1);
        else next.precio = F.ordenarFichas(next.precio.concat([t]));
        commit(next, trackString(next));
      },
      alLimpiar: function () {
        var next = copy(state);
        next.precio = [];
        commit(next, trackString(next));
      }
    });
    hostTipo.appendChild(multiTipo.el);
    hostUbic.appendChild(multiUbic.el);
    hostPrecio.appendChild(multiPrecio.el);

    function etiquetaPrecio(t) { return F.etiquetaFicha(t, TXT); }
    function etiquetaUbic(clave) { return UBIC_LABEL[clave] || clave; }

    // ----- Render -----
    function resumen(n, uno, plural) {
      return n === 0 ? null : n === 1 ? uno : n + ' ' + plural;
    }

    function renderTipo(s) {
      var lista = TIPO_LISTADOS.slice();
      s.tipo.forEach(function (t) { if (lista.indexOf(t) === -1) lista.push(t); });
      multiTipo.setOpciones(lista.map(function (t) {
        return { value: t, label: TIPO_LABEL[t] + (TIPO_LISTADOS.indexOf(t) === -1 ? ' ' + TXT.noStock : '') };
      }));
      var est = {};
      lista.forEach(function (t) {
        var marcada = s.tipo.indexOf(t) !== -1;
        // Con una categoría activa solo se ofrecen los tipos compatibles.
        est[t] = { c: marcada, d: !marcada && !tipoCompatible(t, s.cat) };
      });
      multiTipo.actualizar(est, resumen(s.tipo.length, TIPO_LABEL[s.tipo[0]], TXT.types) || TXT.allTypes, s.tipo.length);
    }

    function renderUbic(s) {
      var opciones = [];
      var est = {};
      var listados = {};
      UBIC_GRUPOS.forEach(function (g) {
        opciones.push({ value: 'region:' + g.region, label: g.etiqueta + ' — ' + (isEn ? 'all areas' : 'todas las zonas'), grupo: g.etiqueta, fuerte: true });
        listados['region:' + g.region] = true;
        g.zonas.forEach(function (z) {
          opciones.push({ value: z.value, label: z.label, grupo: g.etiqueta, hijo: true });
          listados[z.value] = true;
        });
      });
      // Valores válidos sin inventario: se muestran para reflejar el filtro activo.
      var extras = s.region.map(function (r) { return 'region:' + r; }).concat(s.zona.map(function (z) { return 'zona:' + z; }));
      extras.forEach(function (c) {
        if (!listados[c]) opciones.push({ value: c, label: etiquetaUbic(c) + ' ' + TXT.noStock, grupo: isEn ? 'Other' : 'Otras', fuerte: c.indexOf('region:') === 0 });
      });
      multiUbic.setOpciones(opciones);
      opciones.forEach(function (o) {
        var v = o.value.split(':');
        if (v[0] === 'region') {
          var zl = ZONAS_LISTADAS[v[1]] || [];
          var algunaZona = zl.some(function (z) { return s.zona.indexOf(z) !== -1; });
          est[o.value] = { c: s.region.indexOf(v[1]) !== -1, m: algunaZona };
        } else {
          est[o.value] = { c: s.zona.indexOf(v[1]) !== -1 || s.region.indexOf(regionDe(v[1])) !== -1 };
        }
      });
      var total = s.region.length + s.zona.length;
      var primera = s.region.length ? 'region:' + s.region[0] : s.zona.length ? 'zona:' + s.zona[0] : '';
      var textoUno = primera ? etiquetaUbic(primera) : '';
      multiUbic.actualizar(est, resumen(total, textoUno, TXT.locations) || TXT.allLocations, total);
    }

    function renderPrecio(s) {
      var lista = FICHAS_LISTADAS.slice();
      var extras = s.precio.filter(function (t) { return lista.indexOf(t) === -1; });
      lista = F.ordenarFichas(lista.concat(extras));
      multiPrecio.setOpciones(lista.map(function (t) {
        return { value: t, label: etiquetaPrecio(t) + (extras.indexOf(t) !== -1 && !PRECIOS.some(function (p) { return F.dentroDeFicha(t, p); }) ? ' ' + TXT.noStock : '') };
      }));
      var est = {};
      lista.forEach(function (t) { est[t] = { c: s.precio.indexOf(t) !== -1 }; });
      multiPrecio.actualizar(est, resumen(s.precio.length, etiquetaPrecio(s.precio[0] || ''), TXT.ranges) || TXT.anyPrice, s.precio.length);
    }

    function renderChips(s) {
      var items = [];
      s.tipo.forEach(function (t) {
        items.push({ key: 'tipo:' + t, label: TXT.type + ': ' + TIPO_LABEL[t] });
      });
      s.region.forEach(function (r) {
        items.push({ key: 'region:' + r, label: TXT.location + ': ' + etiquetaUbic('region:' + r) });
      });
      s.zona.forEach(function (z) {
        items.push({ key: 'zona:' + z, label: TXT.location + ': ' + etiquetaUbic('zona:' + z) });
      });
      s.precio.forEach(function (t) {
        items.push({ key: 'precio:' + t, label: TXT.price + ': ' + etiquetaPrecio(t) });
      });
      chipsEl.innerHTML = '';
      items.forEach(function (it) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'prop-chip';
        b.setAttribute('data-quitar', it.key);
        b.setAttribute('aria-label', TXT.remove + ': ' + it.label);
        b.appendChild(document.createTextNode(it.label + ' '));
        var x = document.createElement('span');
        x.setAttribute('aria-hidden', 'true');
        x.textContent = '×';
        b.appendChild(x);
        li.appendChild(b);
        chipsEl.appendChild(li);
      });
      chipsEl.hidden = items.length === 0;
    }

    var chipsEl = document.getElementById('f-chips');
    var counterEl = document.getElementById('f-contador');
    var clearBtn = document.getElementById('f-limpiar');
    var emptyEl = document.getElementById('f-sin-resultados');
    var emptyClearBtn = document.getElementById('f-sin-resultados-limpiar');

    function render(s) {
      // Operación: casillas acumulativas ("Todos" activo = sin restricción).
      // Categoría: una opción activa ("all" = sin filtro), patrón radiogroup
      // con tabindex itinerante.
      opTabs.forEach(function (t) {
        var v = t.getAttribute('data-filter');
        var on = v === 'all' ? s.op.length === 0 : s.op.indexOf(v) !== -1;
        t.classList.toggle('filter-tab--active', on);
        t.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      catTabs.forEach(function (t) {
        var on = t.getAttribute('data-categoria') === (s.cat || 'all');
        t.classList.toggle('filter-tab--active', on);
        t.setAttribute('aria-checked', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });

      renderTipo(s);
      renderUbic(s);
      renderPrecio(s);

      var visibles = 0;
      cards.forEach(function (card) {
        var show = matches(card, s);
        card.classList.toggle('is-hidden', !show);
        if (show) visibles++;
      });

      renderChips(s);
      var active = hasFilters(s);
      var noun = (active ? cards.length : visibles) === 1 ? TXT.one : TXT.many;
      counterEl.textContent = active
        ? visibles + ' ' + TXT.of + ' ' + cards.length + ' ' + (cards.length === 1 ? TXT.one : TXT.many)
        : visibles + ' ' + noun;
      clearBtn.hidden = !active;
      emptyEl.hidden = visibles > 0;
      form.hidden = false;
      liberarEspera();
    }

    // ----- Cambios del usuario -----
    function track(cadena) {
      if (typeof window.makomTrack === 'function') {
        window.makomTrack('Search', null, {
          search_string: cadena,
          content_category: 'property_filter'
        });
      }
    }

    // Aplica un nuevo estado por acción del usuario: actualiza la URL
    // (una entrada de historial si cambió), repinta y mide UNA vez.
    function commit(next, cadena) {
      var nuevaBusqueda = buildSearch(next, window.location.search);
      if (nuevaBusqueda !== window.location.search) {
        window.history.pushState(null, '', window.location.pathname + nuevaBusqueda + window.location.hash);
      }
      state = next;
      render(state);
      track(cadena);
    }

    // Operación: cada casilla suma o quita su operación; "Todos" las limpia.
    // La cadena de analítica es la de siempre: el nombre de la opción
    // pulsada ('all' = "Todos").
    opTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var v = this.getAttribute('data-filter');
        var next = copy(state);
        if (v === 'all') {
          next.op = [];
        } else {
          var i = next.op.indexOf(v);
          if (i !== -1) next.op.splice(i, 1);
          else next.op = F.ordenar(next.op.concat([v]), OPS);
        }
        commit(next, v);
      });
    });

    // Categoría: selección única; descarta los tipos que no pertenecen a la elegida.
    function irACategoria(valor) {
      var next = copy(state);
      next.cat = valor === 'comercial' || valor === 'residencial' ? valor : '';
      if (next.cat) next.tipo = next.tipo.filter(function (t) { return tipoCompatible(t, next.cat); });
      commit(next, valor);
    }

    function enlazarGrupo(grupo, atributo, ir) {
      grupo.forEach(function (tab) {
        tab.addEventListener('click', function () {
          ir(this.getAttribute(atributo));
        });

        // Teclado (patrón radiogroup): las flechas, Inicio y Fin mueven el
        // foco Y la selección dentro de ESTE grupo, nunca al otro.
        tab.addEventListener('keydown', function (e) {
          var idx = grupo.indexOf(this);
          var next = null;

          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            next = grupo[(idx + 1) % grupo.length];
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            next = grupo[(idx - 1 + grupo.length) % grupo.length];
          } else if (e.key === 'Home') {
            next = grupo[0];
          } else if (e.key === 'End') {
            next = grupo[grupo.length - 1];
          }

          if (next) {
            e.preventDefault();
            next.focus();
            next.click();
          }
        });
      });
    }
    enlazarGrupo(catTabs, 'data-categoria', irACategoria);

    function limpiar() {
      commit(emptyState(), 'all');
    }
    clearBtn.addEventListener('click', limpiar);
    emptyClearBtn.addEventListener('click', function () {
      limpiar();
      var activa = opTabs.filter(function (t) { return t.classList.contains('filter-tab--active'); })[0];
      if (activa) activa.focus();
    });

    // Quitar una selección desde su chip: solo esa opción; el foco pasa al
    // selector de ese filtro.
    chipsEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-quitar]') : null;
      if (!btn) return;
      var par = btn.getAttribute('data-quitar').split(':');
      var clave = par[0];
      var valor = par.slice(1).join(':');
      var next = copy(state);
      var destino = multiTipo;
      var quitar = function (arr) { var i = arr.indexOf(valor); if (i !== -1) arr.splice(i, 1); };
      if (clave === 'tipo') { quitar(next.tipo); destino = multiTipo; }
      if (clave === 'region') { quitar(next.region); destino = multiUbic; }
      if (clave === 'zona') { quitar(next.zona); destino = multiUbic; }
      if (clave === 'precio') { quitar(next.precio); destino = multiPrecio; }
      commit(next, trackString(next));
      destino.trigger.focus();
    });

    form.addEventListener('submit', function (e) { e.preventDefault(); });

    // Atrás / adelante: se relee la URL; no se mide (no es una búsqueda nueva).
    window.addEventListener('popstate', function () {
      state = parseState(window.location.search);
      render(state);
    });

    // Carga inicial (incluye URLs compartidas y enlaces antiguos): se aplica
    // el estado de la URL sin medir y, si traía algo inválido, contradictorio
    // o en formato antiguo (?max=), se corrige la URL sin crear una entrada
    // de historial.
    render(state);
    var normalizada = buildSearch(state, window.location.search);
    if (normalizada !== window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + normalizada + window.location.hash);
    }
  })();

  /* ============================================================
     7. FORM VALIDATION
  ============================================================ */
  var contactForm = document.getElementById('contact-form');
  var formFields = document.getElementById('form-fields');
  var formSuccess = document.getElementById('form-success');
  var formSubmit = document.getElementById('form-submit');

  function getFieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function showError(inputId, errorId, message) {
    var input = document.getElementById(inputId);
    var errorEl = document.getElementById(errorId);
    if (input) input.classList.add('is-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    }
  }

  function clearError(inputId, errorId) {
    var input = document.getElementById(inputId);
    var errorEl = document.getElementById(errorId);
    if (input) input.classList.remove('is-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('is-visible');
    }
  }

  function validateField(inputId, errorId, rules) {
    var value = getFieldValue(inputId);
    clearError(inputId, errorId);
    // Milestone 13: solo el TEXTO de estos mensajes es bilingüe (misma
    // lógica de document.documentElement.lang que las tarjetas del
    // Home) — reglas de validación, IDs y destino del formulario no
    // cambian.
    var enIngles = document.documentElement.lang === 'en';

    if (rules.required && value === '') {
      showError(inputId, errorId, enIngles ? 'This field is required.' : 'Este campo es obligatorio.');
      return false;
    }

    if (rules.type === 'email' && value !== '') {
      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(value)) {
        showError(inputId, errorId, enIngles ? 'Please enter a valid email address.' : 'Por favor ingrese un correo electrónico válido.');
        return false;
      }
    }

    if (rules.type === 'select' && value === '') {
      showError(inputId, errorId, enIngles ? 'Please select an option.' : 'Por favor seleccione una opción.');
      return false;
    }

    return true;
  }

  function validateForm() {
    var valid = true;

    if (!validateField('field-nombre', 'field-nombre-error', { required: true })) {
      valid = false;
    }
    if (!validateField('field-email', 'field-email-error', { required: true, type: 'email' })) {
      valid = false;
    }
    if (!validateField('field-servicio', 'field-servicio-error', { required: true, type: 'select' })) {
      valid = false;
    }

    return valid;
  }

  // Live validation on blur
  var fieldNombre = document.getElementById('field-nombre');
  var fieldEmail = document.getElementById('field-email');
  var fieldServicio = document.getElementById('field-servicio');

  if (fieldNombre) {
    fieldNombre.addEventListener('blur', function () {
      validateField('field-nombre', 'field-nombre-error', { required: true });
    });
    fieldNombre.addEventListener('input', function () {
      if (this.value.trim() !== '') clearError('field-nombre', 'field-nombre-error');
    });
  }

  if (fieldEmail) {
    fieldEmail.addEventListener('blur', function () {
      validateField('field-email', 'field-email-error', { required: true, type: 'email' });
    });
    fieldEmail.addEventListener('input', function () {
      clearError('field-email', 'field-email-error');
    });
  }

  if (fieldServicio) {
    fieldServicio.addEventListener('change', function () {
      if (this.value !== '') clearError('field-servicio', 'field-servicio-error');
    });
  }

  /* ============================================================
     7b. ENVÍO SEGURO DEL FORMULARIO (RR-01b) — funciones auxiliares de la sección 8.
     - request_id ESTABLE por envío lógico: se mantiene en los reintentos y se renueva si cambian los datos, tras un éxito o tras un rechazo por validación.
       Solo se conserva en memoria (nunca en almacenamiento persistente) junto con una huella hash de los campos, no los datos.
     - Éxito solo con respuesta 2xx y {ok:true}. 400 ⇒ error de validación, sin reintento. 503/502/504/408/429, retryable, fallo de red, tiempo agotado o
       respuesta ilegible ⇒ UN reintento automático tras Retry-After (1–6 s) con el mismo request_id: el servidor es idempotente, no duplica.
  ============================================================ */
  function makomRequestUuid() {
    var c = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Array(16), i;
    if (c && typeof c.getRandomValues === 'function') {
      var a = new Uint8Array(16); c.getRandomValues(a);
      for (i = 0; i < 16; i++) b[i] = a[i];
    } else {
      for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    }
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = [];
    for (i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join('');
  }

  function makomFingerprint(values) {
    var s = values.join('␟'), h1 = 0x811c9dc5, h2 = 0x01000193, i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charCodeAt(i);
      h1 ^= ch; h1 = (h1 * 16777619) >>> 0;
      h2 = ((h2 << 5) - h2 + ch) >>> 0;
    }
    return h1.toString(16) + '.' + h2.toString(16) + '.' + s.length;
  }

  function makomRequestIdTracker(uuidFn) {
    var id = null, fp = null;
    return {
      forFingerprint: function (nextFp) {
        if (!id || fp !== nextFp) { id = uuidFn(); fp = nextFp; }
        return id;
      },
      current: function () { return id; },
      reset: function () { id = null; fp = null; }
    };
  }

  function makomPostLead(fetchFn, endpoint, payload, sleepFn, opts) {
    var timeoutMs = (opts && opts.timeoutMs) || 30000;
    var setT = (opts && opts.setTimeout) || (typeof setTimeout === 'function' ? setTimeout : null);
    var clearT = (opts && opts.clearTimeout) || (typeof clearTimeout === 'function' ? clearTimeout : null);

    function attempt() {
      var controller = (typeof AbortController === 'function') ? new AbortController() : null;
      var timer = null, timedOut = false;
      var init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
      if (controller) {
        init.signal = controller.signal;
        if (setT) timer = setT(function () { timedOut = true; controller.abort(); }, timeoutMs);
      }
      function done() { if (timer && clearT) clearT(timer); }
      return fetchFn(endpoint, init).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          done();
          var status = response.status;
          if (response.ok && data && data.ok === true) return { ok: true };
          if (status === 400) return { ok: false, kind: 'validation' };
          // Reintentable: 503/502/504 (servidor o pasarela no disponibles), 408/429, retryable=true, y respuesta ILEGIBLE (cuerpo truncado o no JSON) con 2xx o 5xx:
          // el servidor pudo haber guardado el lead sin que lo sepamos; reintentar con el mismo request_id es seguro (idempotente) y confirma el resultado.
          var unreadable = !data || typeof data !== 'object';
          if (status === 503 || status === 502 || status === 504 || status === 408 || status === 429 || (data && data.retryable === true) || (unreadable && (response.ok || status >= 500))) {
            var header = response.headers && response.headers.get && response.headers.get('Retry-After');
            var wait = Number(header) || (data && Number(data.retry_after_seconds)) || 3;
            return { ok: false, kind: 'retryable', waitMs: Math.min(Math.max(wait, 1), 6) * 1000 };
          }
          return { ok: false, kind: 'error' };
        });
      }, function () {
        done();
        // Fallo de red, tiempo agotado o respuesta perdida: la solicitud pudo o no llegar; el request_id estable evita duplicar.
        return { ok: false, kind: 'retryable', waitMs: timedOut ? 1000 : 3000 };
      });
    }

    return attempt().then(function (first) {
      if (first.ok || first.kind !== 'retryable') return first.ok ? first : { ok: false, kind: first.kind };
      return sleepFn(first.waitMs).then(attempt).then(function (second) {
        return second.ok ? second : { ok: false, kind: second.kind === 'validation' ? 'validation' : second.kind === 'error' ? 'error' : 'retryable' };
      });
    });
  }


  /* ============================================================
     8. FORM SUBMIT — POSTs to MAKOM CRM's public lead intake
     (Fase 18B). mailto: is no longer the submission mechanism —
     it stays visible only as one of the direct contact options
     above the form (teléfono/WhatsApp/correo), untouched.
  ============================================================ */
  var PUBLIC_LEAD_INTAKE_ENDPOINT = 'https://yqiyzqlnqrudvldpmbbi.supabase.co/functions/v1/public-lead-intake';
  var formErrorBanner = document.getElementById('form-error-banner');

  function hideFormErrorBanner() {
    if (formErrorBanner) formErrorBanner.setAttribute('aria-hidden', 'true');
  }

  var formErrorBannerText = formErrorBanner ? formErrorBanner.querySelector('.contact-form__banner-text') : null;
  var formErrorBannerGeneric = formErrorBannerText ? formErrorBannerText.textContent : '';

  function setFormErrorBannerKind(transient) {
    if (!formErrorBannerText) return;
    var english = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
    formErrorBannerText.textContent = transient
      ? (english
          ? "We couldn't register your request right now. Your details are still in the form \u2014 please try again in a few seconds."
          : 'No pudimos registrar su solicitud en este momento. Sus datos siguen en el formulario: intente nuevamente en unos segundos.')
      : formErrorBannerGeneric;
  }

  function showFormErrorBanner() {
    if (formErrorBanner) formErrorBanner.setAttribute('aria-hidden', 'false');
  }

  if (contactForm) {
    var formSubmitInFlight = false;
    var requestIdTracker = makomRequestIdTracker(makomRequestUuid);

    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();

      // Idempotencia mínima (Fase 18B, sección 11): una sola solicitud
      // activa a la vez. El botón deshabilitado ya evita casi todo doble
      // clic; este flag es una segunda barrera por si un evento llegara
      // a dispararse antes de que el atributo disabled surta efecto.
      if (formSubmitInFlight) return;

      var isValid = validateForm();

      if (!isValid) {
        var firstError = contactForm.querySelector('.form-field__input.is-error');
        if (firstError) firstError.focus();
        return;
      }

      hideFormErrorBanner();

      formSubmitInFlight = true;
      if (formSubmit) {
        formSubmit.classList.add('is-loading');
        formSubmit.disabled = true;
      }

      function mostrarExito() {
        if (formFields) {
          formFields.classList.add('is-hidden');
          formFields.setAttribute('aria-hidden', 'true');
        }
        if (formSuccess) {
          formSuccess.style.display = 'flex';
          formSuccess.setAttribute('aria-hidden', 'false');
          formSuccess.focus();
        }
      }

      function restaurarBoton() {
        formSubmitInFlight = false;
        if (formSubmit) {
          formSubmit.classList.remove('is-loading');
          formSubmit.disabled = false;
        }
      }

      var nombre = getFieldValue('field-nombre');
      var emailRemitente = getFieldValue('field-email');
      var telefono = getFieldValue('field-telefono');
      var servicioSelect = document.getElementById('field-servicio');
      var servicioValor = servicioSelect ? servicioSelect.value : '';
      var servicioTexto = servicioSelect ? servicioSelect.options[servicioSelect.selectedIndex].text : '';
      var websiteField = document.getElementById('field-website');
      // request_id ESTABLE por envío lógico (RR-01b): se reutiliza en los reintentos mientras no cambie lo que el visitante escribió, de modo que el
      // servidor (idempotente) devuelva el mismo lead en vez de duplicarlo si un intento previo sí se guardó y su respuesta se perdió. Cambian los
      // datos, o termina el envío con éxito / rechazo de validación ⇒ se genera uno nuevo. En memoria únicamente: solo una huella hash, sin datos.
      var requestId = requestIdTracker.forFingerprint(makomFingerprint([nombre, emailRemitente, telefono, servicioValor]));

      // Captura de UTM/atribución (Fase 18B, sección 12): leídos de la URL
      // actual y de document.referrer en el momento del envío — esta página
      // no tiene navegación interna tipo SPA, así que son exactamente los
      // mismos valores que existían al cargar. "campaign" no se envía: no
      // existe todavía una convención real en el CRM que lo derive de
      // utm_campaign, y mapear uno a otro sin esa convención sería inventar
      // semántica no pedida — queda NULL hasta que exista ese criterio.
      var urlParams = new URLSearchParams(window.location.search);

      var payload = {
        nombre: nombre,
        email: emailRemitente,
        telefono: telefono,
        servicio: servicioValor,
        website: websiteField ? websiteField.value : '',
        utm_source: urlParams.get('utm_source') || undefined,
        utm_medium: urlParams.get('utm_medium') || undefined,
        utm_campaign: urlParams.get('utm_campaign') || undefined,
        utm_content: urlParams.get('utm_content') || undefined,
        utm_term: urlParams.get('utm_term') || undefined,
        referrer: document.referrer || undefined,
        landing_page: window.location.href,
        form_page: window.location.pathname,
        request_id: requestId
      };

      makomPostLead(
        function (url, init) { return fetch(url, init); },
        PUBLIC_LEAD_INTAKE_ENDPOINT,
        payload,
        function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
      )
        .then(function (result) {
          if (!result.ok) {
            // Rechazo por validación: ese request_id nunca se registró; si el visitante corrige y reenvía, será un envío nuevo.
            if (result.kind === 'validation') requestIdTracker.reset();
            var failure = new Error('public-lead-intake: ' + result.kind);
            failure.kind = result.kind;
            throw failure;
          }
          requestIdTracker.reset(); // éxito confirmado: el siguiente envío es otro envío lógico.

          // Fase 18B, sección 15: el tracking de conversión SOLO se dispara
          // tras confirmar el éxito real del backend — nunca antes, y nunca
          // duplicado. window.makomTrack, el Worker de Meta CAPI y el Pixel
          // no se modifican, solo el momento de esta llamada.
          if (typeof window.makomTrack === 'function') {
            var partesNombre = nombre.split(/\s+/);
            var userLead = {
              em: emailRemitente,
              ph: telefono,
              fn: partesNombre[0] || '',
              ln: partesNombre.slice(1).join(' '),
              country: 'pa',
              ct: 'panama',
              st: 'panama',
              external_id: emailRemitente
            };
            window.makomTrack('Lead', userLead, {
              content_name: servicioTexto,
              content_category: 'contact_form'
            });
            window.makomTrack('SubmitApplication', userLead, {
              content_name: servicioTexto,
              content_category: 'contact_form',
              status: 'submitted'
            });
            if (servicioSelect && servicioSelect.value === 'mantenimiento') {
              window.makomTrack('Schedule', userLead, {
                content_name: 'Inspección / mantenimiento',
                content_category: 'schedule'
              });
            }
          }

          contactForm.reset();
          mostrarExito();
          restaurarBoton();
        })
        .catch(function (err) {
          // Conservar los datos introducidos para reintento — nunca limpiar
          // el formulario en un error real. Un fallo TRANSITORIO del servidor (persistió tras el reintento automático) se explica distinto del
          // genérico, en el idioma de la página, y NUNCA se muestra como éxito.
          setFormErrorBannerKind(err && err.kind === 'retryable');
          showFormErrorBanner();
          restaurarBoton();
        });
    });
  }

  /* ============================================================
     9. SMOOTH SCROLL — all internal anchor links
  ============================================================ */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;

      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();

        // Close mobile menu if open
        if (mobileMenuOpen) {
          closeMobileMenu();
        }

        var headerOffset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 72;
        var elementPosition = target.getBoundingClientRect().top + window.pageYOffset;
        var offsetPosition = elementPosition - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        // Update focus for accessibility
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.addEventListener('blur', function () {
          target.removeAttribute('tabindex');
        }, { once: true });
      }
    });
  });

  /* ============================================================
     10. GLOBAL ESCAPE KEY HANDLER
  ============================================================ */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (mobileMenuOpen) {
        closeMobileMenu();
      }
      if (megaOpen) {
        closeMegaMenu();
        if (megaTrigger) megaTrigger.focus();
      }
      if (floatingOpen) {
        closeFloatingPanel();
        if (floatingToggle) floatingToggle.focus();
      }
      if (heroContactOpen) {
        closeHeroContact();
        if (heroContactToggle) heroContactToggle.focus();
      }
    }
  });

  /* ============================================================
     11. CLOSE MEGA MENU ON OUTSIDE CLICK
  ============================================================ */
  document.addEventListener('click', function (e) {
    if (megaOpen && megaParent && !megaParent.contains(e.target)) {
      closeMegaMenu();
    }
  });

  /* ============================================================
     12. CLOSE MOBILE MENU ON RESIZE TO DESKTOP
  ============================================================ */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth >= 1024 && mobileMenuOpen) {
        closeMobileMenu();
      }
    }, 150);
  });

  /* ============================================================
     13. FLOATING CONTACT BUTTON — toggle, outside click, Escape
     (Escape se maneja en la sección 10, arriba, junto con el resto
     de los cierres por tecla Escape del sitio)
  ============================================================ */
  var floatingContact = document.getElementById('floating-contact');
  var floatingToggle = document.getElementById('floating-contact-toggle');
  var floatingPanel = document.getElementById('floating-contact-panel');
  var floatingOpen = false;

  function openFloatingPanel() {
    floatingOpen = true;
    floatingPanel.classList.add('is-open');
    floatingPanel.setAttribute('aria-hidden', 'false');
    floatingToggle.setAttribute('aria-expanded', 'true');
  }

  function closeFloatingPanel() {
    floatingOpen = false;
    floatingPanel.classList.remove('is-open');
    floatingPanel.setAttribute('aria-hidden', 'true');
    floatingToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleFloatingPanel() {
    if (floatingOpen) {
      closeFloatingPanel();
    } else {
      openFloatingPanel();
    }
  }

  if (floatingToggle && floatingPanel && floatingContact) {
    floatingToggle.addEventListener('click', toggleFloatingPanel);

    // Cerrar el panel al elegir "Formulario"; el scroll suave hasta
    // #contacto ya lo maneja el listener global de la sección 9
    // (se aplica a todos los enlaces internos a[href^="#"]).
    var floatingFormLink = document.getElementById('floating-contact-form-link');
    if (floatingFormLink) {
      floatingFormLink.addEventListener('click', function () {
        closeFloatingPanel();
      });
    }

    // Cerrar al hacer clic fuera del componente
    document.addEventListener('click', function (e) {
      if (floatingOpen && !floatingContact.contains(e.target)) {
        closeFloatingPanel();
      }
    });
  }

  /* ============================================================
     13b. "INICIAR CONVERSACIÓN" EN EL HERO ↔ BOTÓN FLOTANTE
     Solo en la Home. Hay dos representaciones del MISMO control, con las
     mismas opciones (WhatsApp, correo y formulario): el botón del Hero,
     junto a "Ver propiedades", y el flotante (esquina inferior derecha).
     Nunca están activas a la vez: mientras el del Hero se ve, el flotante
     está oculto; cuando el del Hero sale del área visible, aparece el
     flotante, y al volver a verse el del Hero, el flotante se retira. La
     visibilidad real se mide con IntersectionObserver (no con un umbral
     de scroll). El representante inactivo queda inert + aria-hidden: ni
     se ve, ni se enfoca, ni lo anuncian los lectores de pantalla.
  ============================================================ */
  var heroContact = document.getElementById('hero-contact');
  var heroContactToggle = document.getElementById('hero-contact-toggle');
  var heroContactPanel = document.getElementById('hero-contact-panel');
  var heroContactOpen = false;

  // El panel del Hero se abre hacia arriba. Si el botón está tan arriba en la
  // pantalla que el panel quedaría bajo el header, se baja un poco el contenido
  // (sin sacar el botón de la vista) para que el panel se vea completo.
  function ensureHeroPanelVisible() {
    var minTop = (typeof headerH === 'number' ? headerH : 72) + 8;
    var pr = heroContactPanel.getBoundingClientRect();
    if (pr.top >= minTop) return;
    var br = heroContactToggle.getBoundingClientRect();
    var delta = Math.min(minTop - pr.top, Math.max(0, window.innerHeight - 8 - br.bottom));
    if (delta > 0) window.scrollBy(0, -delta);
  }

  function openHeroContact() {
    heroContactOpen = true;
    heroContactPanel.classList.add('is-open');
    heroContactPanel.setAttribute('aria-hidden', 'false');
    heroContactToggle.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(ensureHeroPanelVisible);
  }

  function closeHeroContact() {
    heroContactOpen = false;
    heroContactPanel.classList.remove('is-open');
    heroContactPanel.setAttribute('aria-hidden', 'true');
    heroContactToggle.setAttribute('aria-expanded', 'false');
  }

  if (heroContact && heroContactToggle && heroContactPanel && floatingContact && floatingToggle && floatingPanel) {
    heroContactToggle.addEventListener('click', function () {
      if (heroContactOpen) closeHeroContact(); else openHeroContact();
    });

    var heroContactForm = document.getElementById('hero-contact-form-link');
    if (heroContactForm) heroContactForm.addEventListener('click', closeHeroContact);

    document.addEventListener('click', function (e) {
      if (heroContactOpen && !heroContact.contains(e.target)) closeHeroContact();
    });

    var heroContactFloating = null; // null = aún sin decidir

    function setContactState(floating) {
      if (floating === heroContactFloating) return;
      var focusInHero = heroContact.contains(document.activeElement);
      var focusInFloating = floatingContact.contains(document.activeElement);
      heroContactFloating = floating;

      if (floating) {
        closeHeroContact();
        heroContact.setAttribute('aria-hidden', 'true');
        heroContact.setAttribute('inert', '');
        heroContactToggle.setAttribute('tabindex', '-1');
        floatingContact.removeAttribute('inert');
        floatingContact.setAttribute('aria-hidden', 'false');
        floatingContact.classList.add('is-active');
        if (focusInHero) floatingToggle.focus({ preventScroll: true });
      } else {
        closeFloatingPanel();
        floatingContact.classList.remove('is-active');
        floatingContact.setAttribute('aria-hidden', 'true');
        floatingContact.setAttribute('inert', '');
        heroContact.removeAttribute('aria-hidden');
        heroContact.removeAttribute('inert');
        heroContactToggle.removeAttribute('tabindex');
        if (focusInFloating) heroContactToggle.focus({ preventScroll: true });
      }
    }

    // El header fijo tapa la franja superior: lo que queda debajo de él no cuenta como visible.
    var headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10) || 72;

    function heroContactVisibleNow() {
      var r = heroContactToggle.getBoundingClientRect();
      return r.bottom > headerH && r.top < window.innerHeight && r.width > 0;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var last = entries[entries.length - 1];
        setContactState(!(last.isIntersecting && last.intersectionRatio > 0));
      }, { rootMargin: '-' + headerH + 'px 0px 0px 0px', threshold: [0, 0.01, 1] }).observe(heroContactToggle);

      // Volver con "atrás" (bfcache) o cambiar de pestaña: se resincroniza.
      window.addEventListener('pageshow', function () { setContactState(!heroContactVisibleNow()); });
    } else {
      // Sin IntersectionObserver: se conserva el flotante de siempre y no se duplica el control.
      heroContact.classList.add('is-off');
      setContactState(true);
    }
  }

  /* ============================================================
     13c. FICHAS ↔ BOTÓN FLOTANTE: no tapar controles propios de la ficha
     Un botón fijo no puede esquivar contenido que se desplaza, así que, mientras
     un control principal de la ficha solapa la huella del flotante (esquina
     inferior derecha), éste se aparta (mismo mecanismo y estados que en la Home:
     oculto = visibility:hidden + inert + aria-hidden) y reaparece en cuanto el
     scroll deja libre esa esquina. Donde no hay solapamiento no cambia nada.
     Controles protegidos (contratos explícitos, no clases de estilo):
       - La galería interactiva: la pista del carrusel [data-galeria-pista]
         dentro de [data-galeria] (ocupa lo mismo que la foto principal
         [data-galeria-abrir="0"], el contrato del lightbox, sección 16, pero
         no se desplaza al cambiar de fotografía). Con ancho de escritorio (≈1024–1440 px) ocupa todo el ancho
         del contenido y llega bajo la esquina de la primera pantalla. Una imagen
         de portada sin interacción (p. ej. en Perspectivas) no se protege.
       - Cualquier elemento marcado con [data-flotante-evitar] (hoy, el CTA
         "Solicitar información" de las fichas de Proyectos).
  ============================================================ */
  var evitadosPorFlotante = Array.prototype.slice.call(
    document.querySelectorAll('[data-galeria] [data-galeria-pista], [data-flotante-evitar]')
  );

  if (evitadosPorFlotante.length && !heroContact && floatingContact && floatingToggle && floatingPanel) {
    var evitaFloatingHidden = false;
    var evitaSyncPending = false;

    // Posición ya asentada del control: las secciones con [data-reveal] entran
    // deslizándose (translateY de 24 px → 0); se descuenta ese desplazamiento para
    // decidir con la posición final y no con la de la animación.
    function rectAsentado(el) {
      var r = el.getBoundingClientRect();
      var rv = el.closest('[data-reveal]');
      var ty = 0;
      if (rv) {
        try { ty = new DOMMatrixReadOnly(getComputedStyle(rv).transform).m42 || 0; } catch (e) { ty = 0; }
      }
      return { left: r.left, right: r.right, top: r.top - ty, bottom: r.bottom - ty, width: r.width };
    }

    // La huella se calcula desde right/bottom (no desde getBoundingClientRect)
    // para que no influya el desplazamiento de 8 px del estado oculto.
    function floatingOverlapsProtected() {
      var cs = getComputedStyle(floatingContact);
      var right = document.documentElement.clientWidth - parseFloat(cs.right);
      var bottom = document.documentElement.clientHeight - parseFloat(cs.bottom);
      var left = right - floatingToggle.offsetWidth;
      var top = bottom - floatingToggle.offsetHeight;
      return evitadosPorFlotante.some(function (el) {
        var g = rectAsentado(el);
        return g.width > 0 && g.left < right && g.right > left && g.top < bottom && g.bottom > top;
      });
    }

    function setFloatingForProtected(hide) {
      if (hide === evitaFloatingHidden) return;
      evitaFloatingHidden = hide;
      if (hide) {
        closeFloatingPanel();
        floatingContact.setAttribute('data-defer', 'evitar');
        floatingContact.classList.remove('is-active');
        floatingContact.setAttribute('aria-hidden', 'true');
        floatingContact.setAttribute('inert', '');
      } else {
        floatingContact.removeAttribute('inert');
        floatingContact.setAttribute('aria-hidden', 'false');
        floatingContact.classList.add('is-active');
      }
    }

    function syncFloatingWithProtected() {
      evitaSyncPending = false;
      setFloatingForProtected(floatingOverlapsProtected());
    }

    function requestFloatingSync() {
      if (evitaSyncPending) return;
      evitaSyncPending = true;
      window.requestAnimationFrame(syncFloatingWithProtected);
    }

    window.addEventListener('scroll', requestFloatingSync, { passive: true });
    window.addEventListener('resize', requestFloatingSync);
    window.addEventListener('load', requestFloatingSync);
    window.addEventListener('pageshow', requestFloatingSync);
    // Cambios de maquetación sin scroll ni resize (imágenes diferidas, fuentes).
    if ('ResizeObserver' in window) new ResizeObserver(requestFloatingSync).observe(document.body);
    syncFloatingWithProtected();
  }

  /* ============================================================
     14. HERO PARALLAX — movimiento muy sutil del skyline al hacer
     scroll, rAF-throttled (igual que la sección 1). Se desactiva
     por completo si el usuario prefiere menos movimiento.
  ============================================================ */
  var heroPhoto = document.getElementById('hero-visual-photo');
  var prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (heroPhoto && !prefersReducedMotion) {
    var heroSection = document.getElementById('hero');
    var parallaxTicking = false;
    var maxParallax = 20; // px — desplazamiento máximo, muy discreto

    function updateHeroParallax() {
      var heroHeight = heroSection ? heroSection.offsetHeight : window.innerHeight;
      var progress = Math.min(Math.max(window.scrollY / heroHeight, 0), 1);
      var offset = progress * maxParallax;
      heroPhoto.style.transform = 'translateY(' + offset.toFixed(1) + 'px)';
      parallaxTicking = false;
    }

    function onHeroScroll() {
      if (!parallaxTicking) {
        requestAnimationFrame(updateHeroParallax);
        parallaxTicking = true;
      }
    }

    window.addEventListener('scroll', onHeroScroll, { passive: true });
    updateHeroParallax(); // estado inicial
  }

  /* ============================================================
     15. PROPIEDADES DESTACADAS — HOME
     Sustituye el estado sobrio de #propiedades-grid (ya presente en
     el HTML, visible sin JS o mientras el feed carga) por hasta 3
     tarjetas reales cuando /data/propiedades-destacadas.json está
     disponible. Si la petición falla o no hay ninguna destacada, el
     estado sobrio permanece — no se muestra ningún error técnico.
     El Home es una vitrina editorial (máximo 3 propiedades), no un
     catálogo — no lleva filtros; esos viven exclusivamente en
     /propiedades/ (ver content/propiedades-catalogo.njk).
  ============================================================ */
  var propiedadesGrid = document.getElementById('propiedades-grid');

  if (propiedadesGrid) {
    fetch('/data/propiedades-destacadas.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Feed de propiedades destacadas no disponible');
        return res.json();
      })
      .then(function (destacadas) {
        if (!Array.isArray(destacadas) || destacadas.length === 0) return;
        renderPropiedadesDestacadas(destacadas);
      })
      .catch(function () {
        // Silencioso a propósito: el estado sobrio ya presente en el
        // HTML (sección 30 de styles.css) sigue siendo válido.
      });
  }

  /* Milestone 13 — bilingüe: el feed /data/propiedades-destacadas.json
     es UN SOLO dato compartido entre ES/EN (con los campos "...En" ya
     resueltos con su fallback desde el build). Esta tarjeta lee
     document.documentElement.lang (que cada Home, ES o EN, ya declara
     en su <html lang="...">) para decidir qué campos/etiquetas usar —
     nunca hace una segunda petición de red por idioma. */
  function esHomeEnIngles() {
    return document.documentElement.lang === 'en';
  }

  function etiquetaOperacionHome(operacion) {
    if (esHomeEnIngles()) return operacion === 'alquiler' ? 'For Rent' : 'For Sale';
    return operacion === 'alquiler' ? 'Alquiler' : 'Venta';
  }

  function etiquetaCategoriaHome(texto) {
    if (!texto) return '';
    if (esHomeEnIngles()) {
      var enUs = { residencial: 'Residential', comercial: 'Commercial', terreno: 'Land', otro: 'Other' };
      return enUs[texto] || (texto.charAt(0).toUpperCase() + texto.slice(1));
    }
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function precioFormatoHome(precio, operacion) {
    if (!precio || typeof precio.monto !== 'number') return '';
    var monto = precio.monto.toLocaleString('en-US');
    if (operacion === 'alquiler') {
      var sufijos = esHomeEnIngles()
        ? { mensual: 'month', quincenal: 'two weeks', otra: 'period' }
        : { mensual: 'mes', quincenal: 'quincena', otra: 'período' };
      return '$' + monto + ' / ' + (sufijos[precio.periodicidad] || sufijos.otra);
    }
    return '$' + monto;
  }

  function specsTextoHome(d) {
    if (!d) return '';
    var partes = [];
    if (esHomeEnIngles()) {
      if (d.habitaciones != null) partes.push(d.habitaciones + ' bed');
      if (d.banos != null) partes.push(d.banos + ' bath');
      if (d.estacionamientos != null) partes.push(d.estacionamientos + ' parking');
      if (d.metrajeInterno != null) partes.push(d.metrajeInterno + ' m²');
      return partes.join(' · ');
    }
    if (d.habitaciones != null) partes.push(d.habitaciones + ' hab');
    if (d.banos != null) partes.push(d.banos + ' baños');
    if (d.estacionamientos != null) partes.push(d.estacionamientos + ' est.');
    if (d.metrajeInterno != null) partes.push(d.metrajeInterno + ' m²');
    return partes.join(' · ');
  }

  function escaparHtmlHome(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  function tarjetaDestacadaHtml(p) {
    var enIngles = esHomeEnIngles();
    var titulo = enIngles ? (p.tituloEn || p.titulo) : p.titulo;
    var ubicacion = enIngles ? (p.ubicacionPublicaEn || p.ubicacionPublica) : p.ubicacionPublica;
    var alt = p.portada ? (enIngles ? (p.portada.altEn || p.portada.alt) : (p.portada.alt || p.titulo)) : '';
    var specs = specsTextoHome(p.detalles);
    var imagenHtml = p.portada
      ? '<img src="' + escaparHtmlHome(p.portada.archivo) + '" alt="' + escaparHtmlHome(alt || titulo) + '" loading="lazy" />'
      : '<div class="property-card__image-vacia"><span class="property-card__image-vacia-texto">' + (enIngles ? 'Photo coming soon' : 'Foto próximamente') + '</span></div>';
    var reservadaHtml = p.estado === 'reservada'
      ? '<span class="ficha-propiedad__estado-tag">' + (enIngles ? 'Reserved' : 'Reservada') + '</span>'
      : '';
    var href = (enIngles ? '/en/properties/' : '/propiedades/') + encodeURIComponent(p.slug) + '/';

    return (
      '<article class="property-card" role="listitem">' +
        '<div class="property-card__image">' +
          imagenHtml +
          '<div class="property-card__badges">' +
            '<span class="property-card__type">' + etiquetaOperacionHome(p.operacion) + '</span>' +
            '<span class="property-card__category">' + etiquetaCategoriaHome(p.categoriaGeneral) + '</span>' +
            reservadaHtml +
          '</div>' +
        '</div>' +
        '<div class="property-card__body">' +
          '<h3 class="property-card__name">' + escaparHtmlHome(titulo) + '</h3>' +
          '<p class="property-card__location">' + escaparHtmlHome(ubicacion) + '</p>' +
          '<p class="property-card__price">' + precioFormatoHome(p.precio, p.operacion) + '</p>' +
          (specs ? '<p class="property-card__specs">' + escaparHtmlHome(specs) + '</p>' : '') +
          '<a href="' + href + '" class="link--arrow property-card__cta">' + (enIngles ? 'View property' : 'Ver propiedad') + '</a>' +
        '</div>' +
      '</article>'
    );
  }

  function renderPropiedadesDestacadas(destacadas) {
    propiedadesGrid.innerHTML = destacadas.map(tarjetaDestacadaHtml).join('');
  }

  /* ============================================================
     15b. PROYECTOS DESTACADOS — HOME
     Mismo criterio que Propiedades: sustituye el estado sobrio de
     #proyectos-grid (placeholders ya presentes en el HTML) por hasta 3
     proyectos reales (1 grande + hasta 2 pequeños, igual disposición
     visual ya existente) cuando /data/proyectos-destacados.json está
     disponible. Si falla o no hay ninguno destacado, el estado sobrio
     permanece.
  ============================================================ */
  var proyectosGrid = document.getElementById('proyectos-grid');

  if (proyectosGrid) {
    fetch('/data/proyectos-destacados.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Feed de proyectos destacados no disponible');
        return res.json();
      })
      .then(function (destacados) {
        if (!Array.isArray(destacados) || destacados.length === 0) return;
        renderProyectosDestacados(destacados);
      })
      .catch(function () {
        // Silencioso a propósito, igual que propiedades destacadas.
      });
  }

  function etiquetaEstadoProyectoHome(estado) {
    var enIngles = esHomeEnIngles();
    var mapa = enIngles
      ? { proximo: 'Coming soon', en_desarrollo: 'In progress', completado: 'Completed' }
      : { proximo: 'Próximamente', en_desarrollo: 'En desarrollo', completado: 'Completado' };
    return mapa[estado] || '';
  }

  function tarjetaProyectoHtml(p, variante) {
    var enIngles = esHomeEnIngles();
    var titulo = enIngles ? (p.tituloEn || p.titulo) : p.titulo;
    var extracto = enIngles ? (p.extractoEn || p.extracto) : p.extracto;
    var ctaTexto = (enIngles ? (p.ctaTextoEn || p.ctaTexto) : p.ctaTexto) || (enIngles ? 'View project' : 'Ver proyecto');
    var href = p.ctaUrl || ((enIngles ? '/en/projects/' : '/proyectos/') + encodeURIComponent(p.slug) + '/');
    var imagenHtml = p.imagen
      ? '<img class="proyecto-card__image-inner" src="' + escaparHtmlHome(p.imagen) + '" alt="' + escaparHtmlHome(titulo) + '" loading="lazy" />'
      : '<div class="proyecto-card__image-inner"></div>';
    var etiquetaEstado = etiquetaEstadoProyectoHome(p.estado);

    return (
      '<article class="proyecto-card proyecto-card--' + variante + '" aria-labelledby="proy-' + escaparHtmlHome(p.slug) + '-name">' +
        '<div class="proyecto-card__image"' + (p.imagen ? '' : ' style="background-color:#1a1a1a"') + '>' +
          imagenHtml +
        '</div>' +
        '<div class="proyecto-card__body">' +
          '<h3 class="proyecto-card__name" id="proy-' + escaparHtmlHome(p.slug) + '-name">' + escaparHtmlHome(titulo) + '</h3>' +
          (etiquetaEstado ? '<span class="division-card__soon-tag">' + etiquetaEstado + '</span>' : '') +
          (extracto ? '<p class="proyecto-card__desc">' + escaparHtmlHome(extracto) + '</p>' : '') +
          '<a href="' + href + '" class="link--arrow proyecto-card__cta">' + escaparHtmlHome(ctaTexto) + '</a>' +
        '</div>' +
      '</article>'
    );
  }

  function renderProyectosDestacados(destacados) {
    var grande = destacados[0];
    var pequenos = destacados.slice(1, 3);
    var html = tarjetaProyectoHtml(grande, 'large');
    if (pequenos.length > 0) {
      html += '<div class="proyectos__small-grid">' +
        pequenos.map(function (p) { return tarjetaProyectoHtml(p, 'small'); }).join('') +
        '</div>';
    }
    proyectosGrid.innerHTML = html;
  }

  /* ============================================================
     15c. PERSPECTIVAS DESTACADAS — HOME
     Mismo criterio: sustituye los dos artículos placeholder de
     #perspectivas-col-right por hasta 4 perspectivas reales cuando
     /data/perspectivas-destacadas.json está disponible.
  ============================================================ */
  var perspectivasColRight = document.getElementById('perspectivas-col-right');

  if (perspectivasColRight) {
    fetch('/data/perspectivas-destacadas.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Feed de perspectivas destacadas no disponible');
        return res.json();
      })
      .then(function (destacadas) {
        if (!Array.isArray(destacadas) || destacadas.length === 0) return;
        renderPerspectivasDestacadas(destacadas);
      })
      .catch(function () {
        // Silencioso a propósito, igual que propiedades destacadas.
      });
  }

  function tarjetaPerspectivaHtml(a) {
    var enIngles = esHomeEnIngles();
    var titulo = enIngles ? (a.tituloEn || a.titulo) : a.titulo;
    var extracto = enIngles ? (a.extractoEn || a.extracto) : a.extracto;
    var href = (enIngles ? '/en/insights/' : '/perspectivas/') + encodeURIComponent(a.slug) + '/';

    return (
      '<article class="article-card" aria-labelledby="persp-' + escaparHtmlHome(a.slug) + '-title">' +
        '<div class="article-card__meta">' +
          (a.categoria ? '<span class="article-card__category">' + escaparHtmlHome(enIngles ? (a.categoriaEn || a.categoria) : a.categoria) + '</span>' : '') +
        '</div>' +
        '<h3 class="article-card__title" id="persp-' + escaparHtmlHome(a.slug) + '-title">' + escaparHtmlHome(titulo) + '</h3>' +
        (extracto ? '<p class="article-card__extract">' + escaparHtmlHome(extracto) + '</p>' : '') +
        '<a href="' + href + '" class="link--arrow article-card__cta">' + (enIngles ? 'Read article' : 'Ver artículo') + '</a>' +
      '</article>'
    );
  }

  function renderPerspectivasDestacadas(destacadas) {
    perspectivasColRight.innerHTML = destacadas.map(function (a, i) {
      var divider = i > 0 ? '<hr class="perspectivas__divider" aria-hidden="true" />' : '';
      return divider + tarjetaPerspectivaHtml(a);
    }).join('');
    // La composición de la Home (styles.css § 34.5) se adapta a 1–4 tarjetas según este atributo.
    perspectivasColRight.setAttribute('data-count', String(destacadas.length));
  }

  /* ============================================================
     16. GALERÍA DE FOTOGRAFÍAS — CARRUSEL DIRECTO + LIGHTBOX (FICHA DE PROPIEDAD)
     Vanilla JS, sin librerías. Lee las imágenes ya presentes en el
     DOM (una diapositiva por fotografía, ya optimizadas por
     eleventy-img) — no depende de un bloque de datos aparte. Se
     activa solo si existe [data-galeria] en la página.
     Carrusel: la pista [data-galeria-pista] es un contenedor con
     scroll-snap horizontal (deslizar con el dedo o el trackpad es
     nativo y no bloquea el scroll vertical; un deslizamiento no genera
     clic, así que nunca abre el visor por accidente). Las flechas
     (solo puntero fino), las miniaturas y las teclas ← → mueven la
     misma pista. Solo la diapositiva actual es interactiva (inert las
     demás: sin foco ni lectura duplicada). Carga eficiente: las fotos
     2+ van ocultas y no se descargan; se revelan la actual y sus
     vecinas. Clic o Enter en la foto abre el visor en esa fotografía y,
     al cerrarlo, el carrusel queda en la última que se vio.
  ============================================================ */
  var galeriaFicha = document.querySelector('[data-galeria]');

  if (galeriaFicha) {
    var pistaGaleria = galeriaFicha.querySelector('[data-galeria-pista]');
    var slidesGaleria = Array.from(galeriaFicha.querySelectorAll('[data-galeria-slide]'));
    var botonesGaleria = slidesGaleria.map(function (slide) { return slide.querySelector('[data-galeria-abrir]'); });
    var miniaturasGaleria = Array.from(galeriaFicha.querySelectorAll('[data-galeria-ir]'));
    var flechasGaleria = Array.from(galeriaFicha.querySelectorAll('[data-galeria-flecha]'));
    var vivoGaleria = galeriaFicha.querySelector('[data-galeria-vivo]');
    var esEnGaleria = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
    var reducirMovimiento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

    function mejorSrcDe(img) {
      var srcset = img.getAttribute('srcset');
      if (!srcset) {
        // Las diapositivas ocultas pueden estar dentro de <picture>: se toma el
        // srcset del <source> de mayor resolución disponible (webp) o el src.
        var picture = img.parentNode && img.parentNode.tagName === 'PICTURE' ? img.parentNode : null;
        var source = picture ? picture.querySelector('source[srcset]') : null;
        srcset = source ? source.getAttribute('srcset') : '';
        if (!srcset) return img.currentSrc || img.getAttribute('src');
      }
      var candidatos = srcset.split(',').map(function (c) {
        var partes = c.trim().split(/\s+/);
        return { url: partes[0], ancho: parseInt(partes[1], 10) || 0 };
      });
      candidatos.sort(function (a, b) { return b.ancho - a.ancho; });
      return candidatos[0].url;
    }

    var fotosLightbox = botonesGaleria.map(function (boton) {
      var img = boton.querySelector('img');
      return { src: mejorSrcDe(img), alt: img.getAttribute('alt') || '' };
    });

    // ----- Carrusel -----
    var indiceCarrusel = 0;
    var desplazando = null;

    // Revela (deja que el navegador descargue) la foto indicada y sus vecinas.
    function revelarFotos(i) {
      [i - 1, i, i + 1].forEach(function (k) {
        if (k < 0 || k >= slidesGaleria.length) return;
        var img = slidesGaleria[k].querySelector('img');
        if (img && img.hasAttribute('hidden')) img.removeAttribute('hidden');
      });
    }

    function marcarActual(i) {
      indiceCarrusel = i;
      slidesGaleria.forEach(function (slide, k) {
        if (k === i) slide.removeAttribute('inert'); else slide.setAttribute('inert', '');
      });
      miniaturasGaleria.forEach(function (mini) {
        var esActual = parseInt(mini.getAttribute('data-galeria-ir'), 10) === i;
        if (esActual) mini.setAttribute('aria-current', 'true'); else mini.removeAttribute('aria-current');
      });
      flechasGaleria.forEach(function (flecha) {
        var paso = parseInt(flecha.getAttribute('data-galeria-flecha'), 10);
        var fuera = i + paso < 0 || i + paso >= slidesGaleria.length;
        flecha.disabled = fuera;
      });
      if (vivoGaleria) {
        vivoGaleria.textContent = (esEnGaleria ? 'Photo ' : 'Fotografía ') + (i + 1) + (esEnGaleria ? ' of ' : ' de ') + slidesGaleria.length;
      }
      revelarFotos(i);
    }

    function irAFoto(i, opciones) {
      opciones = opciones || {};
      if (i < 0 || i >= slidesGaleria.length) return;
      marcarActual(i);
      var instantaneo = opciones.instantaneo || (reducirMovimiento && reducirMovimiento.matches);
      pistaGaleria.scrollTo({ left: slidesGaleria[i].offsetLeft, behavior: instantaneo ? 'auto' : 'smooth' });
      if (opciones.enfocar) botonesGaleria[i].focus({ preventScroll: true });
    }

    // Tras un deslizamiento (o cualquier desplazamiento) se determina cuál
    // quedó a la vista una vez que se detiene el scroll.
    if (pistaGaleria && slidesGaleria.length > 1) {
      pistaGaleria.addEventListener('scroll', function () {
        window.clearTimeout(desplazando);
        desplazando = window.setTimeout(function () {
          var ancho = pistaGaleria.clientWidth || 1;
          var i = Math.max(0, Math.min(slidesGaleria.length - 1, Math.round(pistaGaleria.scrollLeft / ancho)));
          if (i !== indiceCarrusel) marcarActual(i);
        }, 90);
      }, { passive: true });

      // Un cambio de tamaño (girar el teléfono) conserva la foto actual.
      window.addEventListener('resize', function () {
        pistaGaleria.scrollTo({ left: slidesGaleria[indiceCarrusel].offsetLeft, behavior: 'auto' });
      });

      flechasGaleria.forEach(function (flecha) {
        flecha.addEventListener('click', function () {
          irAFoto(indiceCarrusel + parseInt(flecha.getAttribute('data-galeria-flecha'), 10));
        });
      });

      miniaturasGaleria.forEach(function (mini) {
        mini.addEventListener('click', function () {
          irAFoto(parseInt(mini.getAttribute('data-galeria-ir'), 10));
        });
      });

      // Teclado: con el foco en la foto actual, ← → cambian de fotografía.
      pistaGaleria.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        irAFoto(indiceCarrusel + (e.key === 'ArrowRight' ? 1 : -1), { enfocar: true });
      });
      marcarActual(0);
    }

    // ----- Visor ampliado (lightbox) -----
    var indiceActual = 0;
    var disparadorActual = null;
    var lightbox = null;

    function crearLightbox() {
      var el = document.createElement('div');
      el.className = 'lightbox';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Galería de fotografías');
      el.hidden = true;
      el.innerHTML =
        '<div class="lightbox__figura">' +
          '<button type="button" class="lightbox__cerrar" aria-label="Cerrar galería">&times;</button>' +
          '<button type="button" class="lightbox__anterior" aria-label="Fotografía anterior">&larr;</button>' +
          '<img class="lightbox__imagen" src="" alt="" />' +
          '<button type="button" class="lightbox__siguiente" aria-label="Fotografía siguiente">&rarr;</button>' +
          '<span class="lightbox__contador"></span>' +
        '</div>';
      document.body.appendChild(el);
      return el;
    }

    function actualizarLightbox() {
      var foto = fotosLightbox[indiceActual];
      var imgEl = lightbox.querySelector('.lightbox__imagen');
      imgEl.src = foto.src;
      imgEl.alt = foto.alt;
      lightbox.querySelector('.lightbox__contador').textContent =
        (indiceActual + 1) + ' / ' + fotosLightbox.length;
      var mostrarNav = fotosLightbox.length > 1;
      lightbox.querySelector('.lightbox__anterior').style.display = mostrarNav ? '' : 'none';
      lightbox.querySelector('.lightbox__siguiente').style.display = mostrarNav ? '' : 'none';
    }

    function abrirLightbox(indice, disparador) {
      if (!lightbox) lightbox = crearLightbox();
      indiceActual = indice;
      disparadorActual = disparador;
      actualizarLightbox();
      lightbox.hidden = false;
      lightbox.querySelector('.lightbox__cerrar').focus();
      document.addEventListener('keydown', onTeclaLightbox);
    }

    function cerrarLightbox() {
      if (!lightbox) return;
      lightbox.hidden = true;
      document.removeEventListener('keydown', onTeclaLightbox);
      // El carrusel queda en la última fotografía vista en el visor, y el
      // foco vuelve a esa foto (que ahora es la actual).
      if (pistaGaleria && slidesGaleria.length > 1 && indiceActual !== indiceCarrusel) {
        irAFoto(indiceActual, { instantaneo: true });
        disparadorActual = botonesGaleria[indiceActual];
      }
      if (disparadorActual) disparadorActual.focus();
    }

    function siguienteFoto() {
      indiceActual = (indiceActual + 1) % fotosLightbox.length;
      actualizarLightbox();
    }

    function anteriorFoto() {
      indiceActual = (indiceActual - 1 + fotosLightbox.length) % fotosLightbox.length;
      actualizarLightbox();
    }

    function onTeclaLightbox(e) {
      if (e.key === 'Escape') cerrarLightbox();
      else if (e.key === 'ArrowRight') siguienteFoto();
      else if (e.key === 'ArrowLeft') anteriorFoto();
      else if (e.key === 'Tab') {
        // Foco simple contenido dentro del lightbox (4 controles).
        var focosables = lightbox.querySelectorAll('button');
        var primero = focosables[0];
        var ultimo = focosables[focosables.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    }

    botonesGaleria.forEach(function (boton, indice) {
      boton.addEventListener('click', function () {
        abrirLightbox(indice, boton);
      });
    });

    document.addEventListener('click', function (e) {
      if (!lightbox || lightbox.hidden) return;
      if (e.target.closest('.lightbox__cerrar')) cerrarLightbox();
      else if (e.target.closest('.lightbox__siguiente')) siguienteFoto();
      else if (e.target.closest('.lightbox__anterior')) anteriorFoto();
      else if (e.target === lightbox) cerrarLightbox();
    });
  }

  /* ============================================================
     17. MAPA DE UBICACIÓN (FICHA DE PROPIEDAD)
     Solo existe #mapa-propiedad en el HTML cuando mapa.activo=true en
     el JSON de esa propiedad (ver _includes/propiedad.njk) — si está
     desactivado, este bloque no encuentra nada y no hace nada. Leaflet
     (leaflet.js) solo se carga en esa misma condición. Cualquier fallo
     (Leaflet no definido, tiles bloqueados, red caída) se captura para
     que el resto de la ficha siga siendo completamente funcional — el
     texto de ubicacionPublica ya está en el HTML de forma
     independiente del mapa.
  ============================================================ */
  var contenedorMapa = document.getElementById('mapa-propiedad');

  if (contenedorMapa && typeof L !== 'undefined') {
    try {
      var lat = parseFloat(contenedorMapa.getAttribute('data-lat'));
      var lng = parseFloat(contenedorMapa.getAttribute('data-lng'));
      var zoom = parseInt(contenedorMapa.getAttribute('data-zoom'), 10) || 15;

      if (!isNaN(lat) && !isNaN(lng)) {
        L.Icon.Default.imagePath = '/assets/vendor/leaflet/images/';

        var mapaLeaflet = L.map(contenedorMapa, {
          scrollWheelZoom: false,
        }).setView([lat, lng], zoom);

        // Permite hacer zoom con la rueda solo tras un clic explícito,
        // para no atrapar el scroll de la página en móvil/desktop.
        mapaLeaflet.on('click', function () {
          mapaLeaflet.scrollWheelZoom.enable();
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        }).addTo(mapaLeaflet);

        L.marker([lat, lng]).addTo(mapaLeaflet);
      }
    } catch (err) {
      // Silencioso a propósito: un fallo del mapa (tiles bloqueados,
      // Leaflet no disponible, etc.) nunca debe afectar el resto de
      // la página — la ubicación pública en texto ya cumple ese rol.
    }
  }

  /* ============================================================
     19. BUSCADOR DEL HERO (Home ES/EN)
     La barra solo ARMA UNA URL hacia el catálogo (?op=&tipo=&region=
     &zona=&precio=, con un valor repetido por selección); el motor de
     filtrado vive únicamente en el catálogo (sección 6). Los cuatro
     filtros (Operación, Tipo, Ubicación y Precio) son independientes y
     acumulativos, igual que en el catálogo (componente de la sección
     5b). Las opciones de tipo, ubicación y rangos de precio se leen de
     la propia página del catálogo (en el idioma de la Home), así que no
     se duplican datos aquí. Móvil: un enlace "Buscar propiedades"
     se convierte en botón que abre un panel accesible; si JavaScript
     falla, sigue siendo un enlace válido al catálogo.
  ============================================================ */
  (function () {
    var root = document.getElementById('hero-search');
    var form = document.getElementById('hero-search-form');
    if (!root || !form) return;

    var isEn = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
    var catalogPath = root.getAttribute('data-catalogo') || (isEn ? '/en/properties/' : '/propiedades/');
    var TXT = isEn ? {
      upTo: 'Up to', over: 'Over', loading: 'Loading…',
      buyRent: 'Buy and rent', allTypes: 'All types', allLocations: 'All locations', anyPrice: 'Any price',
      types: 'types', locations: 'locations', ranges: 'ranges', clear: 'Clear', allAreas: 'all areas',
      priceNote: 'Each range includes its upper limit.'
    } : {
      upTo: 'Hasta', over: 'Más de', loading: 'Cargando…',
      buyRent: 'Comprar y alquilar', allTypes: 'Todos los tipos', allLocations: 'Todas las ubicaciones', anyPrice: 'Cualquier precio',
      types: 'tipos', locations: 'ubicaciones', ranges: 'rangos', clear: 'Limpiar', allAreas: 'todas las zonas',
      priceNote: 'Cada rango incluye su límite superior.'
    };
    var F = mkFiltros;

    var selOp = document.getElementById('hero-search-op');
    var selTipo = document.getElementById('hero-search-tipo');
    var selUbic = document.getElementById('hero-search-ubicacion');
    var selMax = document.getElementById('hero-search-max');
    var trigger = document.getElementById('hero-search-trigger');
    var panel = document.getElementById('hero-search-panel');
    var closeBtn = document.getElementById('hero-search-close');
    var advanced = document.getElementById('hero-search-advanced');
    // Mismo corte que el CSS: por debajo de 1024px el buscador es el botón
    // compacto + panel (móvil y tablet); desde 1024px es la barra.
    var mobileQuery = window.matchMedia('(max-width: 1023px)');

    // idle | loading | ready | failed. Es el único guardián de la carga:
    // el catálogo se pide UNA vez por vida de la página, aunque varias
    // señales de intención lleguen a la vez (y no se reintenta si falla).
    var catalogState = 'idle';

    // ----- Parámetros de atribución: se conservan al pasar al catálogo -----
    function attributionParams() {
      var out = new URLSearchParams();
      new URLSearchParams(window.location.search).forEach(function (value, key) {
        if (/^utm_/i.test(key) || /^(fbclid|gclid|gbraid|wbraid|ttclid|msclkid|dclid)$/i.test(key)) {
          out.set(key, value);
        }
      });
      return out;
    }

    function withAttribution(params) {
      var attr = attributionParams();
      attr.forEach(function (value, key) { params.set(key, value); });
      var q = params.toString();
      return catalogPath + (q ? '?' + q : '');
    }

    // Los enlaces "Búsqueda avanzada" y "Buscar propiedades" (móvil) llevan
    // al catálogo completo, con la atribución de la visita si existe.
    var plainHref = withAttribution(new URLSearchParams());
    if (advanced) advanced.setAttribute('href', plainHref);
    if (trigger) trigger.setAttribute('href', plainHref);

    // ----- Estado: cuatro filtros independientes y acumulativos -----
    var hs = { op: [], tipo: [], region: [], zona: [], precio: [] };
    var OPS_HERO = [];
    var opLabels = {};
    var opPlaceholder = '';
    Array.prototype.slice.call(selOp.options).forEach(function (o) {
      if (o.value) { OPS_HERO.push(o.value); opLabels[o.value] = o.text; } else { opPlaceholder = o.text; }
    });
    var datos = { tipos: [], grupos: [], zonasListadas: {}, regionDe: {}, limites: [], fichas: [], ordenUbic: [] };
    var ctxUbic = {
      regionDe: function (z) { return datos.regionDe[z] || ''; },
      zonasDe: function (r) { return datos.zonasListadas[r] || []; }
    };

    function etiquetaDe(selectEl) {
      var l = document.querySelector('label[for="' + selectEl.id + '"]');
      return l ? l.textContent : '';
    }

    function crear(selectEl, cfg) {
      cfg.id = selectEl.id;
      cfg.ariaLabel = etiquetaDe(selectEl);
      cfg.triggerClass = 'hero-search__select';
      cfg.claseWrap = 'mk-multi--hero' + (cfg.fin ? ' mk-multi--end' : '');
      cfg.textoLimpiar = TXT.clear;
      var w = F.crearMulti(cfg);
      selectEl.parentNode.replaceChild(w.el, selectEl);
      return w;
    }

    var mOp = crear(selOp, {
      placeholder: opPlaceholder,
      alAlternar: function (v) {
        var i = hs.op.indexOf(v);
        if (i !== -1) hs.op.splice(i, 1); else hs.op = F.ordenar(hs.op.concat([v]), OPS_HERO);
        renderHero();
      },
      alLimpiar: function () { hs.op = []; renderHero(); }
    });
    var mTipo = crear(selTipo, {
      placeholder: TXT.allTypes,
      alAlternar: function (v) {
        var i = hs.tipo.indexOf(v);
        if (i !== -1) hs.tipo.splice(i, 1); else hs.tipo.push(v);
        hs.tipo = F.ordenar(hs.tipo, datos.tipos.map(function (t) { return t.value; }));
        renderHero();
      },
      alLimpiar: function () { hs.tipo = []; renderHero(); }
    });
    var mUbic = crear(selUbic, {
      placeholder: TXT.allLocations, fin: true,
      alAlternar: function (v) {
        var r = F.alternarUbicacion({ region: hs.region, zona: hs.zona }, v, ctxUbic);
        hs.region = F.ordenar(r.region, datos.ordenUbic);
        hs.zona = F.ordenar(r.zona, datos.ordenUbic);
        renderHero();
      },
      alLimpiar: function () { hs.region = []; hs.zona = []; renderHero(); }
    });
    var mPrecio = crear(selMax, {
      placeholder: TXT.anyPrice, fin: true, nota: TXT.priceNote,
      alAlternar: function (t) {
        var i = hs.precio.indexOf(t);
        if (i !== -1) hs.precio.splice(i, 1); else hs.precio = F.ordenarFichas(hs.precio.concat([t]));
        renderHero();
      },
      alLimpiar: function () { hs.precio = []; renderHero(); }
    });
    mTipo.setDisabled(true);
    mUbic.setDisabled(true);
    mPrecio.setDisabled(true);

    function resumen(n, uno, plural) {
      return n === 0 ? null : n === 1 ? uno : n + ' ' + plural;
    }

    function renderHero() {
      var est = {};
      mOp.setOpciones(OPS_HERO.map(function (v) { return { value: v, label: opLabels[v] }; }));
      OPS_HERO.forEach(function (v) { est[v] = { c: hs.op.indexOf(v) !== -1 }; });
      mOp.actualizar(est, hs.op.length === 0 ? opPlaceholder : hs.op.length === 1 ? opLabels[hs.op[0]] : TXT.buyRent, hs.op.length);

      if (catalogState === 'failed') {
        // El formulario sigue sirviendo para ir al catálogo con la operación.
        [mTipo, mUbic, mPrecio].forEach(function (m) { m.setDisabled(true); });
        return;
      }
      if (catalogState !== 'ready') return;

      var tipoEst = {};
      mTipo.setOpciones(datos.tipos);
      datos.tipos.forEach(function (t) { tipoEst[t.value] = { c: hs.tipo.indexOf(t.value) !== -1 }; });
      var tUno = datos.tipos.filter(function (t) { return t.value === hs.tipo[0]; })[0];
      mTipo.actualizar(tipoEst, resumen(hs.tipo.length, tUno ? tUno.label : '', TXT.types) || TXT.allTypes, hs.tipo.length);

      var ubicOpc = [];
      var ubicEst = {};
      var etiquetasUbic = {};
      datos.grupos.forEach(function (g) {
        ubicOpc.push({ value: 'region:' + g.region, label: g.etiqueta + ' — ' + TXT.allAreas, grupo: g.etiqueta, fuerte: true });
        etiquetasUbic['region:' + g.region] = g.etiqueta;
        g.zonas.forEach(function (z) {
          ubicOpc.push({ value: z.value, label: z.label, grupo: g.etiqueta, hijo: true });
          etiquetasUbic[z.value] = z.label;
          var zn = z.value.split(':')[1];
          ubicEst[z.value] = { c: hs.zona.indexOf(zn) !== -1 || hs.region.indexOf(g.region) !== -1 };
        });
        var zl = datos.zonasListadas[g.region] || [];
        ubicEst['region:' + g.region] = { c: hs.region.indexOf(g.region) !== -1, m: zl.some(function (z) { return hs.zona.indexOf(z) !== -1; }) };
      });
      mUbic.setOpciones(ubicOpc);
      var totalU = hs.region.length + hs.zona.length;
      var primera = hs.region.length ? 'region:' + hs.region[0] : hs.zona.length ? 'zona:' + hs.zona[0] : '';
      mUbic.actualizar(ubicEst, resumen(totalU, etiquetasUbic[primera] || '', TXT.locations) || TXT.allLocations, totalU);

      var precioEst = {};
      mPrecio.setOpciones(datos.fichas.map(function (t) { return { value: t, label: F.etiquetaFicha(t, TXT) }; }));
      datos.fichas.forEach(function (t) { precioEst[t] = { c: hs.precio.indexOf(t) !== -1 }; });
      mPrecio.actualizar(precioEst, resumen(hs.precio.length, F.etiquetaFicha(hs.precio[0] || '', TXT), TXT.ranges) || TXT.anyPrice, hs.precio.length);
    }

    function fillOptions(doc) {
      var cTipo = doc.getElementById('f-tipo');
      var cUbic = doc.getElementById('f-ubicacion');
      var cPrecio = doc.getElementById('f-precio');
      if (!cTipo || !cUbic || !cPrecio) throw new Error('catalog markup');

      datos.tipos = Array.prototype.slice.call(cTipo.options).filter(function (o) { return o.value; }).map(function (o) {
        return { value: o.value, label: o.text };
      });

      Array.prototype.slice.call(cUbic.children).forEach(function (node) {
        if (node.tagName !== 'OPTGROUP') return;
        var g = { etiqueta: node.label, region: '', zonas: [] };
        Array.prototype.slice.call(node.children).forEach(function (o) {
          var v = o.value.split(':');
          if (v[0] === 'region') g.region = v[1];
          if (v[0] === 'zona') g.zonas.push({ value: o.value, label: o.text });
        });
        if (!g.region) return;
        datos.grupos.push(g);
        datos.ordenUbic.push(g.region);
        datos.zonasListadas[g.region] = g.zonas.map(function (z) { return z.value.split(':')[1]; });
        g.zonas.forEach(function (z) {
          var zn = z.value.split(':')[1];
          datos.regionDe[zn] = g.region;
          datos.ordenUbic.push(zn);
        });
      });

      // Precio: mismos límites y mismas fichas que el catálogo (solo los
      // rangos con propiedades publicadas).
      (cPrecio.getAttribute('data-presupuestos') || '').split(',').forEach(function (v) {
        var n = parseInt(v, 10);
        if (n > 0 && datos.limites.indexOf(n) === -1) datos.limites.push(n);
      });
      datos.limites.sort(function (a, b) { return a - b; });
      var precios = Array.prototype.slice.call(doc.querySelectorAll('.property-card[data-precio]')).map(function (c) {
        return Number(c.getAttribute('data-precio'));
      }).filter(function (n) { return n > 0; });
      datos.fichas = F.fichasDeLimites(datos.limites).filter(function (t) {
        return precios.some(function (p) { return F.dentroDeFicha(t, p); });
      });

      // Solo se ofrecen las operaciones que el catálogo tiene disponibles.
      var available = {};
      Array.prototype.slice.call(doc.querySelectorAll('.filter-tab')).forEach(function (t) {
        available[t.getAttribute('data-filter')] = true;
      });
      OPS_HERO = OPS_HERO.filter(function (op) { return available[op]; });
      hs.op = hs.op.filter(function (op) { return OPS_HERO.indexOf(op) !== -1; });
    }

    function loadCatalogOptions() {
      if (catalogState !== 'idle') return;
      catalogState = 'loading';
      fetch(catalogPath, { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('catalog ' + r.status);
          return r.text();
        })
        .then(function (html) {
          fillOptions(new DOMParser().parseFromString(html, 'text/html'));
          catalogState = 'ready';
          [mTipo, mUbic, mPrecio].forEach(function (m) { m.setDisabled(false); });
          renderHero();
        })
        .catch(function () {
          // El formulario sigue sirviendo para ir al catálogo con la operación.
          catalogState = 'failed';
          renderHero();
        });
    }

    // Carga perezosa: no se descarga nada al abrir la Home. El catálogo se
    // pide cuando hay intención real de usar el buscador: hover (escritorio),
    // foco de teclado, toque o clic sobre la barra, o apertura del panel
    // móvil (más abajo). Cualquiera de esas señales llama a
    // loadCatalogOptions, que solo actúa la primera vez.
    ['pointerenter', 'pointerdown', 'touchstart', 'focusin'].forEach(function (type) {
      root.addEventListener(type, loadCatalogOptions, { passive: true });
    });
    renderHero();

    // ----- Envío: URL solo con los parámetros elegidos (un valor repetido por selección) -----
    function buildHref() {
      var params = new URLSearchParams();
      hs.op.forEach(function (v) { params.append('op', v); });
      hs.tipo.forEach(function (v) { params.append('tipo', v); });
      hs.region.forEach(function (v) { params.append('region', v); });
      hs.zona.forEach(function (v) { params.append('zona', v); });
      hs.precio.forEach(function (v) { params.append('precio', v); });
      var filterQuery = params.toString();
      return { href: withAttribution(params), filterQuery: filterQuery };
    }

    // Evita que un doble clic o un Enter repetido envíe dos veces (dos
    // mediciones y dos navegaciones). Se rearma al volver con Atrás
    // (la página puede restaurarse desde la caché de ida y vuelta).
    var sending = false;
    window.addEventListener('pageshow', function () { sending = false; });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      sending = true;
      var target = buildHref();
      // Una sola medición por envío (no por cambiar selectores). Usa fetch
      // con keepalive, así que sobrevive a la navegación.
      if (typeof window.makomTrack === 'function') {
        window.makomTrack('Search', null, {
          search_string: target.filterQuery || 'all',
          content_category: 'property_search_hero'
        });
      }
      window.location.assign(target.href);
    });

    // ----- Panel móvil accesible -----
    if (!trigger || !panel || !closeBtn) return;
    var isOpen = false;

    function focusables() {
      return Array.prototype.slice.call(panel.querySelectorAll('a[href], button, select, input')).filter(function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
    }

    function openPanel() {
      if (isOpen) return;
      isOpen = true;
      root.classList.add('is-open');
      document.documentElement.classList.add('hero-search-lock');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'hero-search-title');
      trigger.setAttribute('aria-expanded', 'true');
      loadCatalogOptions();
      mOp.trigger.focus();
    }

    function closePanel(restoreFocus) {
      if (!isOpen) return;
      isOpen = false;
      root.classList.remove('is-open');
      document.documentElement.classList.remove('hero-search-lock');
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      panel.removeAttribute('aria-labelledby');
      trigger.setAttribute('aria-expanded', 'false');
      // El foco vuelve siempre al botón que abrió el panel (algunos
      // navegadores no enfocan un enlace al hacer clic, así que no se
      // puede confiar en document.activeElement al abrir).
      if (restoreFocus !== false) trigger.focus();
    }

    trigger.addEventListener('click', function (e) {
      if (!mobileQuery.matches) return; // en tablet/desktop el enlace no se muestra
      e.preventDefault();
      openPanel();
    });

    closeBtn.addEventListener('click', function () { closePanel(true); });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel(true);
        return;
      }
      if (e.key === 'Tab') {
        var items = focusables();
        if (items.length === 0) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!panel.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Si la ventana pasa a tablet/desktop con el panel abierto, se cierra
    // sin mover el foco (el botón deja de mostrarse).
    function onViewportChange() {
      if (!mobileQuery.matches) closePanel(false);
    }
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onViewportChange);
    else if (mobileQuery.addListener) mobileQuery.addListener(onViewportChange);
    window.addEventListener('resize', onViewportChange);
  })();

  /* ============================================================
     18. META PIXEL + CONVERSIONS API
     Pixel (navegador) y CAPI (Worker) comparten event_id para
     que Meta deduplique. El token nunca vive en el cliente.
     https://developers.facebook.com/documentation/ads-commerce/conversions-api
  ============================================================ */
  var META_CAPI_ENDPOINT = 'https://makom-capi.gerencia-a34.workers.dev/';

  function metaEventId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'makom-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function metaCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function makomTrack(eventName, userData, customData) {
    var pixelAlreadyTracked = eventName === 'PageView' && window.__makomPageViewId;
    var id = pixelAlreadyTracked ? window.__makomPageViewId : metaEventId();
    var payloadUser = userData ? Object.assign({}, userData) : {};
    var fbp = metaCookie('_fbp');
    var fbc = metaCookie('_fbc');
    if (fbp) payloadUser.fbp = fbp;
    if (fbc) payloadUser.fbc = fbc;

    if (typeof window.fbq === 'function' && !pixelAlreadyTracked) {
      window.fbq('track', eventName, customData || {}, { eventID: id });
    }

    try {
      fetch(META_CAPI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: eventName,
          event_id: id,
          event_source_url: window.location.href,
          user_data: payloadUser,
          custom_data: customData || undefined
        }),
        keepalive: true,
        mode: 'cors'
      }).catch(function () {});
    } catch (err) {}

    return id;
  }

  window.makomTrack = makomTrack;

  makomTrack('PageView');

  var metaView = document.body && document.body.getAttribute('data-meta-event');
  if (metaView === 'ViewContent') {
    makomTrack('ViewContent', null, {
      content_ids: document.body.getAttribute('data-meta-content-id') || '',
      content_name: document.body.getAttribute('data-meta-content-name') || '',
      content_type: document.body.getAttribute('data-meta-content-type') || 'product'
    });
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href') || '';
    var label = (link.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

    if (href.indexOf('wa.me') !== -1) {
      makomTrack('Contact', null, {
        content_name: 'WhatsApp',
        content_category: 'whatsapp'
      });
      return;
    }

    if (href.indexOf('mailto:') === 0) {
      makomTrack('Contact', null, {
        content_name: 'Email',
        content_category: 'email'
      });
      return;
    }

    if (label.indexOf('solicitar inspecci') !== -1) {
      makomTrack('Schedule', null, {
        content_name: 'Solicitar inspección',
        content_category: 'schedule'
      });
      return;
    }

    if (label.indexOf('registrar inter') !== -1) {
      makomTrack('CompleteRegistration', null, {
        content_name: 'Registrar interés',
        status: 'started'
      });
    }
  });

  /* ============================================================
     20. NAVEGACIÓN LIQUID GLASS — tono y velo adaptativos + refracción
     Mide qué hay REALMENTE detrás de la barra (fotografías, fondos de
     sección, tarjetas) en 27 puntos y decide cristal claro u oscuro con
     histéresis; calcula además el velo MÍNIMO que mantiene el texto de la
     barra por encima de 4,5:1 (custom property --e-a en <header>). Sobre
     fondos homogéneos el velo baja a ~0,03 (cristal casi incoloro). Solo lee
     geometría/píxeles (muestras 8×8 por imagen, cacheadas) con rAF y
     listeners pasivos; no modifica contenido ni eventos del sitio. Sin JS la
     barra conserva el velo de seguridad definido en styles.css § 34.
     La refracción de canto (filtro SVG de desplazamiento como
     backdrop-filter) solo se activa en Chromium: Safari y Firefox no admiten
     SVG en backdrop-filter y usan el respaldo CSS (desenfoque fino + borde
     de luz). Respeta prefers-reduced-transparency.
  ============================================================ */
  (function () {
    var h = document.getElementById('header'); if (!h) return;
    var ham = document.getElementById('hamburger');
    var cap = h.querySelector('.header__inner');
    var cache = new WeakMap(), raf = 0, last = 0, tone = null;

    function grid(img) {                       // luminancia sRGB (0–1): mínimo y máximo por celda de una malla 8×8 (imagen same-origin)
      if (cache.has(img)) return cache.get(img);
      var g = null;
      if (img.complete && img.naturalWidth) {
        try {
          var c = document.createElement('canvas'); c.width = 32; c.height = 32;
          var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32);
          var d = x.getImageData(0, 0, 32, 32).data; g = [];
          for (var cy = 0; cy < 8; cy++) for (var cx = 0; cx < 8; cx++) {
            var mn = 1, mx = 0;
            for (var yy = 0; yy < 4; yy++) for (var xx = 0; xx < 4; xx++) {
              var i = (((cy * 4 + yy) * 32) + cx * 4 + xx) * 4, l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
              if (l < mn) mn = l; if (l > mx) mx = l;
            }
            g.push([mn, mx]);
          }
        } catch (e) { g = null; }
        cache.set(img, g);
      }
      return g;
    }
    function imgLum(img, px, py) {
      var g = grid(img); if (!g) return null;
      var r = img.getBoundingClientRect(); if (!r.width || !r.height) return null;
      var u = Math.min(7, Math.max(0, Math.floor((px - r.left) / r.width * 8)));
      var v = Math.min(7, Math.max(0, Math.floor((py - r.top) / r.height * 8)));
      return g[v * 8 + u];                      // [mín, máx]
    }
    function lumAt(x, y) {
      var els = document.elementsFromPoint(x, y);
      for (var i = 0; i < els.length; i++) {
        var e = els[i];
        if (e.closest('#header, .mobile-menu, .mobile-menu__overlay, .floating-contact, .mega-menu, .lightbox')) continue;
        if (e.closest('.hero__visual')) return [0.06, 0.2];     // foto nocturna + overlay oscuro
        if (e.tagName === 'IMG') { var v = imgLum(e, x, y); if (v != null) return v; continue; }
        var cs = getComputedStyle(e), m = cs.backgroundColor.match(/[\d.]+/g);
        if (m && (m[3] === undefined || +m[3] > 0.85)) { var L = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; return [L, L]; }
      }
      return [0.95, 0.95];
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function measure() {
      raf = 0; last = performance.now();
      var next = tone || 'light';
      if (ham && ham.getAttribute('aria-expanded') === 'true') { next = 'light'; h.style.setProperty('--e-a', '0.98'); }
      else if (cap) {
        var r = cap.getBoundingClientRect(), n = 9, lo = 1, hi = 0;
        for (var j = 0; j < 3; j++) for (var i = 0; i < n; i++) {   // 3 alturas (arriba, centro, abajo) × 9 posiciones: también detecta bordes de bloques oscuros que entran por abajo
          var f = 0.04 + 0.92 * i / (n - 1), v = lumAt(r.left + r.width * f, r.top + r.height * (0.18 + 0.32 * j));
          if (v[0] < lo) lo = v[0]; if (v[1] > hi) hi = v[1];
        }
        // Velo MÍNIMO que garantiza contraste en cada tono (texto negro necesita fondo ≥ .50 sRGB; texto marfil, fondo ≤ .38):
        var aLight = clamp((0.50 - lo) / (0.96 - lo) + 0.08, 0.025, 0.64);   // mínimo que garantiza ≥ 4,5:1; sobre fondos homogéneos baja a 0,025
        var aDark = clamp(1 - 0.38 / Math.max(hi, 0.38) + 0.08, 0.16, 0.66);
        // elige el tono que pide MENOS velo (más transparencia); histéresis de 0.12 para no parpadear
        if (!tone) next = aDark < aLight ? 'dark' : 'light';
        else if (tone === 'light' && aDark + 0.12 < aLight) next = 'dark';
        else if (tone === 'dark' && aLight + 0.12 < aDark) next = 'light';
        h.style.setProperty('--e-a', (next === 'dark' ? aDark : aLight).toFixed(2));
      }
      if (next !== tone) { tone = next; h.setAttribute('data-tone', tone); }
    }
    function q() { if (raf) return; var wait = Math.max(0, 70 - (performance.now() - last)); raf = requestAnimationFrame(function () { wait ? setTimeout(measure, wait) : measure(); }); }
    document.addEventListener('load', q, true);          // las imágenes diferidas (lazy) terminan de cargar después del scroll
    addEventListener('scroll', q, { passive: true }); addEventListener('resize', q); addEventListener('load', q);
    if (ham && window.MutationObserver) new MutationObserver(q).observe(ham, { attributes: true });
    measure();

    /* ---- Refracción de borde (aproximación del Liquid Glass de iOS) ----
       Filtro SVG de desplazamiento aplicado como backdrop-filter SOLO en Chromium (Chrome/Edge): en el canto de la cápsula el
       contenido de detrás se curva hacia adentro con un fleco cromático. Safari/Firefox no admiten SVG en backdrop-filter:
       usan el respaldo CSS (desenfoque fino + borde de luz). Se genera un mapa de desplazamiento del tamaño exacto de la barra. */
    var ud = navigator.userAgentData;
    var chromium = !!(ud && ud.brands && ud.brands.some(function (b) { return /Chromium/.test(b.brand); }));
    if (chromium && !matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), BEZEL = 17, SCALE = 36;
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;pointer-events:none';
      function chan(id, k, matrix) {
        return '<feDisplacementMap in="soft" in2="map" scale="' + (SCALE * k) + '" xChannelSelector="R" yChannelSelector="G" result="d' + id + '"/>' +
               '<feColorMatrix in="d' + id + '" type="matrix" values="' + matrix + '" result="c' + id + '"/>';
      }
      function build() {
        var W = Math.round(Math.min(innerWidth - 20, 1256)), H = 56, R = H / 2;
        var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'), im = x.createImageData(W, H), d = im.data;
        for (var py = 0; py < H; py++) for (var px = 0; px < W; px++) {
          var dx = px + 0.5 - W / 2, dy = py + 0.5 - H / 2, qx = Math.abs(dx) - (W / 2 - R), qy = Math.abs(dy) - (H / 2 - R);
          var ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy), sd = len + Math.min(Math.max(qx, qy), 0) - R, depth = -sd, nx = 0, ny = 0;
          if (len > 0) { nx = (dx < 0 ? -1 : 1) * ox / len; ny = (dy < 0 ? -1 : 1) * oy / len; } else if (qx > qy) nx = dx < 0 ? -1 : 1; else ny = dy < 0 ? -1 : 1;
          var m = depth >= 0 && depth < BEZEL ? Math.pow(1 - depth / BEZEL, 2) : 0, i = (py * W + px) * 4;
          d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;   // hacia el centro = lente convexa
        }
        x.putImageData(im, 0, 0);
        svg.innerHTML = '<defs><filter id="e-lens" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '" color-interpolation-filters="sRGB">' +
          '<feImage href="' + c.toDataURL() + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none" result="map"/>' +
          '<feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="soft"/>' +
          chan('R', 1.0, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0') + chan('G', 0.93, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0') + chan('B', 0.86, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0') +
          '<feBlend in="cR" in2="cG" mode="screen" result="rg"/><feBlend in="rg" in2="cB" mode="screen"/></filter></defs>';
        document.documentElement.classList.add('e-refract');
      }
      document.body.appendChild(svg); build();
      var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 150); });
    }
  })();

});
