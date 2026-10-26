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
    hamburger.focus();
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
     6. PROPERTY FILTERS — motor único de filtrado del catálogo
     Dos grupos de selección única (Operación: Todos / Venta / Alquiler;
     Categoría: Todas / Residencial / Comercial) y los selectores (tipo,
     ubicación, presupuesto máximo) escriben sobre UN solo estado, y ese estado es lo único que decide qué
     tarjetas se ven. El estado vive en la URL (?op=&cat=&tipo=&region=
     &zona=&max=) para poder recargar, compartir y usar atrás/adelante.
     Solo se leen datos públicos que el build dejó en el DOM
     (data-op, data-cat, data-tipo, data-zona, data-precio): nunca hay
     ubicación interna ni direcciones. Regla de los grupos: "Venta" /
     "Alquiler" fijan la operación y "Residencial" / "Comercial" la
     categoría; son dimensiones independientes (cada grupo permite una
     sola opción, "Todos"/"Todas" = sin filtro) y se combinan entre sí,
     y con tipo, ubicación y presupuesto, mediante AND. Excepción: si
     el tipo no pertenece a la categoría elegida, manda el tipo.
     El presupuesto máximo es independiente: siempre está disponible,
     no depende de la pestaña ni de la operación, y se conserva al
     cambiar de pestaña (solo se compara con data-precio).
  ============================================================ */
  (function () {
    var form = document.getElementById('prop-buscador');
    // Dos grupos de selección única (role="radiogroup"). Operación conserva
    // .filter-tab + data-filter (contrato que también lee el buscador del
    // Home); Categoría usa data-categoria.
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
    if (!form || cards.length === 0) {
      liberarEspera();
      return;
    }

    var isEn = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
    var TXT = isEn ? {
      noLimit: 'No limit', upTo: 'Up to', perMonth: '/ month',
      type: 'Type', location: 'Location', budget: 'Budget', remove: 'Remove filter',
      one: 'property', many: 'properties', of: 'of', noStock: '(no listings)'
    } : {
      noLimit: 'Sin límite', upTo: 'Hasta', perMonth: '/ mes',
      type: 'Tipo', location: 'Ubicación', budget: 'Presupuesto', remove: 'Quitar filtro',
      one: 'propiedad', many: 'propiedades', of: 'de', noStock: '(sin propiedades publicadas)'
    };

    var selTipo = document.getElementById('f-tipo');
    var selUbic = document.getElementById('f-ubicacion');
    var selMax = document.getElementById('f-max');
    var chipsEl = document.getElementById('f-chips');
    var counterEl = document.getElementById('f-contador');
    var clearBtn = document.getElementById('f-limpiar');
    var emptyEl = document.getElementById('f-sin-resultados');
    var emptyClearBtn = document.getElementById('f-sin-resultados-limpiar');
    var KNOWN = ['op', 'cat', 'tipo', 'region', 'zona', 'max'];
    var has = function (obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); };

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
    Array.prototype.slice.call(selTipo.options).forEach(function (o) {
      if (o.value) {
        TIPOS[o.value] = (o.getAttribute('data-cats') || '').split(' ');
        TIPO_LABEL[o.value] = o.text;
      }
    });
    var catalogoTipos = null;
    try { catalogoTipos = JSON.parse(form.getAttribute('data-tipos') || 'null'); } catch (err) { catalogoTipos = null; }
    if (catalogoTipos && catalogoTipos.length) {
      catalogoTipos.forEach(function (t) {
        TIPO_LABEL[t.v] = t.l;
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
    var catalogo = null;
    try { catalogo = JSON.parse(form.getAttribute('data-ubicaciones') || 'null'); } catch (err) { catalogo = null; }
    if (catalogo && catalogo.length) {
      catalogo.forEach(function (u) {
        UBIC_LABEL[u.t + ':' + u.v] = u.l;
        if (u.t === 'region') REGIONES[u.v] = true;
        if (u.t === 'zona') ZONAS[u.v] = u.r;
      });
    } else {
      Array.prototype.slice.call(selUbic.options).forEach(function (o) {
        var v = o.value.split(':');
        if (v[0] === 'region') REGIONES[v[1]] = true;
        if (v[0] === 'zona') ZONAS[v[1]] = o.getAttribute('data-region');
        if (o.value) UBIC_LABEL[o.value] = o.text.replace(/\s+—.*$/, '');
      });
    }

    // Presupuestos ofrecidos: UNA lista para todas las pestañas
    // (data-presupuestos). Si el atributo faltara, se cae a la unión de
    // las listas por operación que el Home también lee.
    var BUDGETS = [];
    (function () {
      var raw = selMax.getAttribute('data-presupuestos');
      if (!raw) {
        raw = (selMax.getAttribute('data-presupuestos-venta') || '') + ',' + (selMax.getAttribute('data-presupuestos-alquiler') || '');
      }
      raw.split(',').forEach(function (v) {
        var n = parseInt(v, 10);
        if (n > 0 && BUDGETS.indexOf(n) === -1) BUDGETS.push(n);
      });
      BUDGETS.sort(function (a, b) { return a - b; });
    })();

    function regionDe(zona) {
      return zona && has(ZONAS, zona) ? ZONAS[zona] : '';
    }

    // ----- Estado y URL -----
    function emptyState() {
      return { op: '', cat: '', tipo: '', region: '', zona: '', max: 0 };
    }

    // Lee y NORMALIZA el estado desde una query string: ignora
    // parámetros desconocidos o inválidos y resuelve contradicciones.
    function parseState(search) {
      var p = new URLSearchParams(search);
      var s = emptyState();
      var op = p.get('op');
      if (op && OPS.indexOf(op) !== -1) s.op = op;
      var cat = p.get('cat');
      if (cat && CATS.indexOf(cat) !== -1) s.cat = cat;
      var tipo = p.get('tipo');
      if (tipo && has(TIPOS, tipo)) s.tipo = tipo;
      if (s.cat && s.tipo && !tipoCompatible(s.tipo, s.cat)) s.cat = '';
      var zona = p.get('zona');
      var region = p.get('region');
      if (zona && has(ZONAS, zona)) {
        s.zona = zona;
      } else if (region && has(REGIONES, region)) {
        s.region = region;
      }
      // El presupuesto no depende de la operación. Vale cualquier entero
      // positivo razonable (también los de enlaces antiguos que ya no
      // están en la lista, p. ej. 7500): se muestra como opción
      // temporal. Se rechaza lo no numérico, decimal, negativo o cero.
      var max = p.get('max');
      if (max && /^\d{1,9}$/.test(max)) {
        var n = parseInt(max, 10);
        if (n > 0) s.max = n;
      }
      return s;
    }

    // Construye la query string conservando cualquier parámetro ajeno
    // (por ejemplo utm_*, que el formulario de contacto envía al CRM).
    function buildSearch(state, baseSearch) {
      var p = new URLSearchParams(baseSearch);
      KNOWN.forEach(function (k) { p.delete(k); });
      if (state.op) p.set('op', state.op);
      if (state.cat) p.set('cat', state.cat);
      if (state.tipo) p.set('tipo', state.tipo);
      if (state.region) p.set('region', state.region);
      if (state.zona) p.set('zona', state.zona);
      if (state.max) p.set('max', String(state.max));
      var q = p.toString();
      return q ? '?' + q : '';
    }

    function hasFilters(s) {
      return !!(s.op || s.cat || s.tipo || s.region || s.zona || s.max);
    }

    // Cadena para el evento Search: solo parámetros públicos del filtro.
    function trackString(s) {
      return buildSearch(s, '').replace(/^\?/, '') || 'all';
    }

    function matches(card, s) {
      if (s.op && card.getAttribute('data-op') !== s.op) return false;
      if (s.cat && card.getAttribute('data-cat') !== s.cat) return false;
      if (s.tipo && card.getAttribute('data-tipo') !== s.tipo) return false;
      var zona = card.getAttribute('data-zona') || '';
      if (s.zona && zona !== s.zona) return false;
      if (s.region && regionDe(zona) !== s.region) return false;
      if (s.max) {
        var precio = card.getAttribute('data-precio');
        if (!precio || Number(precio) > s.max) return false;
      }
      return true;
    }

    function formatMoney(n) {
      return '$' + n.toLocaleString('en-US');
    }

    function budgetLabel(op, n) {
      return TXT.upTo + ' ' + formatMoney(n) + (op === 'alquiler' ? ' ' + TXT.perMonth : '');
    }

    // ----- Render -----
    var renderedBudgetKey = null;

    // El selector de presupuesto está siempre habilitado. Las opciones
    // solo se reconstruyen cuando cambia lo que muestran: el sufijo
    // "/ mes" (únicamente con la pestaña Alquiler) o la opción temporal
    // de un valor válido que no está en la lista (p. ej. ?max=7500).
    function renderBudget(s) {
      var extra = s.max && BUDGETS.indexOf(s.max) === -1 ? s.max : 0;
      var key = (s.op === 'alquiler' ? 'r' : 'v') + ':' + extra;
      if (renderedBudgetKey !== key) {
        var list = BUDGETS.slice();
        if (extra) {
          list.push(extra);
          list.sort(function (a, b) { return a - b; });
        }
        selMax.innerHTML = '';
        selMax.appendChild(new Option(TXT.noLimit, ''));
        list.forEach(function (n) {
          var o = new Option(budgetLabel(s.op, n), String(n));
          if (n === extra) o.setAttribute('data-temporal', '1');
          selMax.appendChild(o);
        });
        renderedBudgetKey = key;
      }
      selMax.disabled = false;
      selMax.value = s.max ? String(s.max) : '';
    }

    // Los selectores solo listan opciones con propiedades. Si el filtro
    // activo es un valor válido SIN inventario (una zona, una región o
    // un tipo del catálogo), se añade una opción temporal para que el
    // control refleje el filtro activo; se retira al cambiar de valor.
    function renderTemporal(select, wanted, label) {
      var tmp = select.querySelector('option[data-temporal]');
      if (tmp && tmp.value !== wanted) {
        tmp.parentNode.removeChild(tmp);
        tmp = null;
      }
      if (wanted && !tmp) {
        var listed = Array.prototype.slice.call(select.options).some(function (o) { return o.value === wanted; });
        if (!listed) {
          var op = new Option(label + ' ' + TXT.noStock, wanted);
          op.setAttribute('data-temporal', '1');
          select.appendChild(op);
        }
      }
      select.value = wanted;
    }

    function renderLocation(s) {
      var wanted = s.zona ? 'zona:' + s.zona : s.region ? 'region:' + s.region : '';
      renderTemporal(selUbic, wanted, wanted ? UBIC_LABEL[wanted] : '');
    }

    function renderChips(s) {
      var items = [];
      if (s.tipo) {
        items.push({ key: 'tipo', label: TXT.type + ': ' + TIPO_LABEL[s.tipo] });
      }
      if (s.region || s.zona) {
        items.push({ key: 'ubicacion', label: TXT.location + ': ' + UBIC_LABEL[s.zona ? 'zona:' + s.zona : 'region:' + s.region] });
      }
      if (s.max) {
        items.push({ key: 'max', label: TXT.budget + ': ' + budgetLabel(s.op, s.max) });
      }
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

    function render(s) {
      // Grupos Operación y Categoría: una opción activa en cada uno
      // ("all" = sin filtro). Patrón radiogroup: aria-checked y tabindex
      // itinerante (solo la opción activa entra en el orden de tabulación).
      function marcarGrupo(grupo, atributo, activa) {
        grupo.forEach(function (t) {
          var on = t.getAttribute(atributo) === activa;
          t.classList.toggle('filter-tab--active', on);
          t.setAttribute('aria-checked', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
        });
      }
      marcarGrupo(opTabs, 'data-filter', s.op || 'all');
      marcarGrupo(catTabs, 'data-categoria', s.cat || 'all');

      // Tipos: con una categoría activa solo se ofrecen los compatibles.
      Array.prototype.slice.call(selTipo.options).forEach(function (o) {
        if (!o.value) return;
        var ok = tipoCompatible(o.value, s.cat);
        o.disabled = !ok;
        o.hidden = !ok;
      });
      renderTemporal(selTipo, s.tipo, s.tipo ? TIPO_LABEL[s.tipo] : '');
      renderLocation(s);
      renderBudget(s);

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
    var state = parseState(window.location.search);

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

    function copy(s) {
      return { op: s.op, cat: s.cat, tipo: s.tipo, region: s.region, zona: s.zona, max: s.max };
    }

    // Operación y categoría son independientes: cambiar una no toca la otra.
    // Tipo, ubicación y presupuesto se conservan; solo se descarta el tipo
    // que no pertenece a la categoría elegida. La cadena de analítica es
    // la de siempre: el nombre de la opción pulsada ('all' = "Todos"/"Todas").
    function irAOperacion(valor) {
      var next = copy(state);
      next.op = valor === 'venta' || valor === 'alquiler' ? valor : '';
      commit(next, valor);
    }

    function irACategoria(valor) {
      var next = copy(state);
      next.cat = valor === 'comercial' || valor === 'residencial' ? valor : '';
      if (next.tipo && next.cat && !tipoCompatible(next.tipo, next.cat)) next.tipo = '';
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
    enlazarGrupo(opTabs, 'data-filter', irAOperacion);
    enlazarGrupo(catTabs, 'data-categoria', irACategoria);

    selTipo.addEventListener('change', function () {
      var next = copy(state);
      next.tipo = selTipo.value;
      if (next.tipo && next.cat && !tipoCompatible(next.tipo, next.cat)) next.cat = '';
      commit(next, trackString(next));
    });

    selUbic.addEventListener('change', function () {
      var next = copy(state);
      var v = selUbic.value.split(':');
      next.region = v[0] === 'region' ? v[1] : '';
      next.zona = v[0] === 'zona' ? v[1] : '';
      commit(next, trackString(next));
    });

    selMax.addEventListener('change', function () {
      var next = copy(state);
      next.max = selMax.value ? parseInt(selMax.value, 10) : 0;
      commit(next, trackString(next));
    });

    function limpiar() {
      commit(emptyState(), 'all');
    }
    clearBtn.addEventListener('click', limpiar);
    emptyClearBtn.addEventListener('click', function () {
      limpiar();
      var activa = opTabs.filter(function (t) { return t.classList.contains('filter-tab--active'); })[0];
      if (activa) activa.focus();
    });

    chipsEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-quitar]') : null;
      if (!btn) return;
      var key = btn.getAttribute('data-quitar');
      var next = copy(state);
      var destino = selTipo;
      if (key === 'tipo') { next.tipo = ''; destino = selTipo; }
      if (key === 'ubicacion') { next.region = ''; next.zona = ''; destino = selUbic; }
      if (key === 'max') { next.max = 0; destino = selMax; }
      commit(next, trackString(next));
      destino.focus();
    });

    form.addEventListener('submit', function (e) { e.preventDefault(); });

    // Atrás / adelante: se relee la URL; no se mide (no es una búsqueda nueva).
    window.addEventListener('popstate', function () {
      state = parseState(window.location.search);
      render(state);
    });

    // Carga inicial (incluye URLs compartidas): se aplica el estado de
    // la URL sin medir y, si traía algo inválido o contradictorio, se
    // corrige la URL sin crear una entrada de historial.
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
     13c. FICHAS CON GALERÍA ↔ BOTÓN FLOTANTE
     En escritorio (≈1024–1440 px) la foto principal de la ficha, que ocupa
     todo el ancho del contenido, llega hasta bajo la esquina inferior
     derecha de la primera pantalla; ahí el flotante recibiría los clics
     destinados a la foto. Mientras la foto principal solapa la huella del
     flotante, éste se aparta (mismo mecanismo y estados que en la Home:
     oculto = visibility:hidden + inert + aria-hidden) y reaparece en cuanto
     el scroll deja libre esa esquina. Donde no hay solapamiento (móvil,
     tablet y pantallas anchas) no cambia nada.
  ============================================================ */
  var galeriaPrincipal = document.querySelector('.galeria-ficha__principal');

  if (galeriaPrincipal && !heroContact && floatingContact && floatingToggle && floatingPanel) {
    var galeriaFloatingHidden = false;
    var galeriaSyncPending = false;

    // La huella se calcula desde right/bottom (no desde getBoundingClientRect)
    // para que no influya el desplazamiento de 8 px del estado oculto.
    function floatingOverlapsGallery() {
      var cs = getComputedStyle(floatingContact);
      var right = document.documentElement.clientWidth - parseFloat(cs.right);
      var bottom = document.documentElement.clientHeight - parseFloat(cs.bottom);
      var left = right - floatingToggle.offsetWidth;
      var top = bottom - floatingToggle.offsetHeight;
      var g = galeriaPrincipal.getBoundingClientRect();
      return g.width > 0 && g.left < right && g.right > left && g.top < bottom && g.bottom > top;
    }

    function setFloatingForGallery(hide) {
      if (hide === galeriaFloatingHidden) return;
      galeriaFloatingHidden = hide;
      if (hide) {
        closeFloatingPanel();
        floatingContact.setAttribute('data-defer', 'galeria');
        floatingContact.classList.remove('is-active');
        floatingContact.setAttribute('aria-hidden', 'true');
        floatingContact.setAttribute('inert', '');
      } else {
        floatingContact.removeAttribute('inert');
        floatingContact.setAttribute('aria-hidden', 'false');
        floatingContact.classList.add('is-active');
      }
    }

    function syncFloatingWithGallery() {
      galeriaSyncPending = false;
      setFloatingForGallery(floatingOverlapsGallery());
    }

    function requestFloatingSync() {
      if (galeriaSyncPending) return;
      galeriaSyncPending = true;
      window.requestAnimationFrame(syncFloatingWithGallery);
    }

    window.addEventListener('scroll', requestFloatingSync, { passive: true });
    window.addEventListener('resize', requestFloatingSync);
    window.addEventListener('load', requestFloatingSync);
    window.addEventListener('pageshow', requestFloatingSync);
    syncFloatingWithGallery();
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
     #perspectivas-col-right por hasta 2 perspectivas reales cuando
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
          (a.categoria ? '<span class="article-card__category">' + escaparHtmlHome(a.categoria) + '</span>' : '') +
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
  }

  /* ============================================================
     16. GALERÍA DE FOTOGRAFÍAS — LIGHTBOX (FICHA DE PROPIEDAD)
     Vanilla JS, sin librerías. Lee las imágenes ya presentes en el
     DOM (portada + miniaturas, ya optimizadas por eleventy-img) — no
     depende de un bloque de datos aparte. Se activa solo si existe
     [data-galeria] en la página.
  ============================================================ */
  var galeriaFicha = document.querySelector('[data-galeria]');

  if (galeriaFicha) {
    var botonesGaleria = Array.from(galeriaFicha.querySelectorAll('[data-galeria-abrir]'));

    function mejorSrcDe(img) {
      var srcset = img.getAttribute('srcset');
      if (!srcset) return img.currentSrc || img.getAttribute('src');
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
     &zona=&max=); el motor de filtrado vive únicamente en el catálogo
     (sección 6). Las opciones de tipo, ubicación y presupuesto se leen
     de la propia página del catálogo (en el idioma de la Home), así que
     no se duplican datos aquí. Móvil: un enlace "Buscar propiedades"
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
      noLimit: 'No limit', upTo: 'Up to', perMonth: '/ month', chooseOp: 'Choose transaction', unavailable: 'No limit', loading: 'Loading…'
    } : {
      noLimit: 'Sin límite', upTo: 'Hasta', perMonth: '/ mes', chooseOp: 'Elija operación', unavailable: 'Sin límite', loading: 'Cargando…'
    };

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

    var presets = { venta: [], alquiler: [] };
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

    // ----- Opciones tomadas del catálogo -----
    function renderMax() {
      var op = selOp.value;
      var previous = selMax.value;
      selMax.innerHTML = '';
      if (catalogState === 'failed') {
        selMax.appendChild(new Option(TXT.unavailable, ''));
        selMax.disabled = true;
        return;
      }
      if (!op) {
        selMax.appendChild(new Option(TXT.chooseOp, ''));
        selMax.disabled = true;
        return;
      }
      if (catalogState !== 'ready' || !presets[op] || presets[op].length === 0) {
        // Operación ya elegida pero las opciones aún no llegaron: se
        // conserva la operación y, al terminar la carga, se repinta.
        selMax.appendChild(new Option(catalogState === 'ready' ? TXT.chooseOp : TXT.loading, ''));
        selMax.disabled = true;
        return;
      }
      selMax.appendChild(new Option(TXT.noLimit, ''));
      presets[op].forEach(function (n) {
        var label = TXT.upTo + ' $' + n.toLocaleString('en-US') + (op === 'alquiler' ? ' ' + TXT.perMonth : '');
        selMax.appendChild(new Option(label, String(n)));
      });
      selMax.disabled = false;
      // Solo se conserva el presupuesto si sigue siendo válido para la operación.
      if (previous && presets[op].indexOf(Number(previous)) !== -1) selMax.value = previous;
    }

    function fillOptions(doc) {
      var cTipo = doc.getElementById('f-tipo');
      var cUbic = doc.getElementById('f-ubicacion');
      var cMax = doc.getElementById('f-max');
      if (!cTipo || !cUbic || !cMax) throw new Error('catalog markup');

      Array.prototype.slice.call(cTipo.options).forEach(function (o) {
        if (o.value) selTipo.appendChild(new Option(o.text, o.value));
      });

      Array.prototype.slice.call(cUbic.children).forEach(function (node) {
        if (node.tagName === 'OPTGROUP') {
          var group = document.createElement('optgroup');
          group.label = node.label;
          Array.prototype.slice.call(node.children).forEach(function (o) {
            group.appendChild(new Option(o.text, o.value));
          });
          selUbic.appendChild(group);
        }
      });

      ['venta', 'alquiler'].forEach(function (op) {
        var raw = cMax.getAttribute('data-presupuestos-' + op) || '';
        presets[op] = raw ? raw.split(',').map(Number).filter(function (n) { return n > 0; }) : [];
      });

      // Solo se ofrecen las operaciones que el catálogo tiene disponibles.
      var available = {};
      Array.prototype.slice.call(doc.querySelectorAll('.filter-tab')).forEach(function (t) {
        available[t.getAttribute('data-filter')] = true;
      });
      ['venta', 'alquiler'].forEach(function (op) {
        if (!available[op]) {
          var opt = selOp.querySelector('option[value="' + op + '"]');
          if (opt) opt.parentNode.removeChild(opt);
        }
      });
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
          selTipo.disabled = false;
          selUbic.disabled = false;
          catalogState = 'ready';
          renderMax();
        })
        .catch(function () {
          // El formulario sigue sirviendo para ir al catálogo con la operación.
          catalogState = 'failed';
          renderMax();
        });
    }

    // Carga perezosa: no se descarga nada al abrir la Home. El catálogo se
    // pide cuando hay intención real de usar el buscador: hover (escritorio),
    // foco de teclado, toque o clic sobre la barra, interacción con la
    // operación o apertura del panel móvil (más abajo). Cualquiera de esas
    // señales llama a loadCatalogOptions, que solo actúa la primera vez.
    ['pointerenter', 'pointerdown', 'touchstart', 'focusin'].forEach(function (type) {
      root.addEventListener(type, loadCatalogOptions, { passive: true });
    });

    selOp.addEventListener('change', function () {
      loadCatalogOptions();
      renderMax();
    });

    // ----- Envío: URL solo con los parámetros elegidos -----
    function buildHref() {
      var params = new URLSearchParams();
      if (selOp.value) params.set('op', selOp.value);
      if (selTipo.value) params.set('tipo', selTipo.value);
      var loc = selUbic.value.split(':');
      if (loc[0] === 'zona' && loc[1]) params.set('zona', loc[1]);
      else if (loc[0] === 'region' && loc[1]) params.set('region', loc[1]);
      if (selOp.value && selMax.value) params.set('max', selMax.value);
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
      selOp.focus();
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

});
