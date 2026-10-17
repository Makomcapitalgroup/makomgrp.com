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
     6. PROPERTY FILTERS
  ============================================================ */
  var filterTabs = document.querySelectorAll('.filter-tab');
  var propertyCards = document.querySelectorAll('.property-card');

  filterTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var filter = this.getAttribute('data-filter');

      // Update tab active states
      filterTabs.forEach(function (t) {
        t.classList.remove('filter-tab--active');
        t.setAttribute('aria-selected', 'false');
      });
      this.classList.add('filter-tab--active');
      this.setAttribute('aria-selected', 'true');

      if (typeof window.makomTrack === 'function') {
        window.makomTrack('Search', null, {
          search_string: filter,
          content_category: 'property_filter'
        });
      }

      // Filter cards
      propertyCards.forEach(function (card) {
        var types = card.getAttribute('data-type') || '';
        if (filter === 'all' || types.indexOf(filter) !== -1) {
          card.classList.remove('is-hidden');
          card.style.display = '';
        } else {
          card.classList.add('is-hidden');
          card.style.display = 'none';
        }
      });
    });

    // Keyboard support for filter tabs (arrow keys)
    tab.addEventListener('keydown', function (e) {
      var tabs = Array.from(filterTabs);
      var idx = tabs.indexOf(this);
      var next = null;

      if (e.key === 'ArrowRight') {
        next = tabs[(idx + 1) % tabs.length];
      } else if (e.key === 'ArrowLeft') {
        next = tabs[(idx - 1 + tabs.length) % tabs.length];
      } else if (e.key === 'Home') {
        next = tabs[0];
      } else if (e.key === 'End') {
        next = tabs[tabs.length - 1];
      }

      if (next) {
        e.preventDefault();
        next.focus();
        next.click();
      }
    });
  });

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
