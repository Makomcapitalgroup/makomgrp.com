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

    if (rules.required && value === '') {
      showError(inputId, errorId, 'Este campo es obligatorio.');
      return false;
    }

    if (rules.type === 'email' && value !== '') {
      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(value)) {
        showError(inputId, errorId, 'Por favor ingrese un correo electrónico válido.');
        return false;
      }
    }

    if (rules.type === 'select' && value === '') {
      showError(inputId, errorId, 'Por favor seleccione una opción.');
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
     8. FORM SUBMIT
  ============================================================ */
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var isValid = validateForm();

      if (!isValid) {
        // Focus first error field
        var firstError = contactForm.querySelector('.form-field__input.is-error');
        if (firstError) firstError.focus();
        return;
      }

      // Show loading state
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
        if (formSubmit) {
          formSubmit.classList.remove('is-loading');
          formSubmit.disabled = false;
        }
      }

      var nombre = getFieldValue('field-nombre');
      var emailRemitente = getFieldValue('field-email');
      var telefono = getFieldValue('field-telefono');
      var servicioSelect = document.getElementById('field-servicio');
      var servicio = servicioSelect ? servicioSelect.options[servicioSelect.selectedIndex].text : '';

      var asunto = 'Contacto desde makomgrp.com — ' + nombre;
      var cuerpo =
        'Nombre: ' + nombre +
        '\nCorreo: ' + emailRemitente +
        '\nTeléfono/WhatsApp: ' + (telefono || '—') +
        '\nServicio: ' + servicio;
      var mailtoUrl = 'mailto:gerencia@makomgrp.com' +
        '?subject=' + encodeURIComponent(asunto) +
        '&body=' + encodeURIComponent(cuerpo);

      setTimeout(function () {
        window.location.href = mailtoUrl;
        mostrarExito();
      }, 600);
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

  function etiquetaOperacionHome(operacion) {
    return operacion === 'alquiler' ? 'Alquiler' : 'Venta';
  }

  function capitalizarHome(texto) {
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
  }

  function precioFormatoHome(precio, operacion) {
    if (!precio || typeof precio.monto !== 'number') return '';
    var monto = precio.monto.toLocaleString('en-US');
    if (operacion === 'alquiler') {
      var sufijos = { mensual: 'mes', quincenal: 'quincena', otra: 'período' };
      return '$' + monto + ' / ' + (sufijos[precio.periodicidad] || 'período');
    }
    return '$' + monto;
  }

  function specsTextoHome(d) {
    if (!d) return '';
    var partes = [];
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
    var specs = specsTextoHome(p.detalles);
    var imagenHtml = p.portada
      ? '<img src="' + escaparHtmlHome(p.portada.archivo) + '" alt="' + escaparHtmlHome(p.portada.alt || p.titulo) + '" loading="lazy" />'
      : '<div class="property-card__image-vacia"><span class="property-card__image-vacia-texto">Foto próximamente</span></div>';
    var reservadaHtml = p.estado === 'reservada'
      ? '<span class="ficha-propiedad__estado-tag">Reservada</span>'
      : '';

    return (
      '<article class="property-card" role="listitem">' +
        '<div class="property-card__image">' +
          imagenHtml +
          '<div class="property-card__badges">' +
            '<span class="property-card__type">' + etiquetaOperacionHome(p.operacion) + '</span>' +
            '<span class="property-card__category">' + capitalizarHome(p.categoriaGeneral) + '</span>' +
            reservadaHtml +
          '</div>' +
        '</div>' +
        '<div class="property-card__body">' +
          '<h3 class="property-card__name">' + escaparHtmlHome(p.titulo) + '</h3>' +
          '<p class="property-card__location">' + escaparHtmlHome(p.ubicacionPublica) + '</p>' +
          '<p class="property-card__price">' + precioFormatoHome(p.precio, p.operacion) + '</p>' +
          (specs ? '<p class="property-card__specs">' + escaparHtmlHome(specs) + '</p>' : '') +
          '<a href="/propiedades/' + encodeURIComponent(p.slug) + '/" class="link--arrow property-card__cta">Ver propiedad</a>' +
        '</div>' +
      '</article>'
    );
  }

  function renderPropiedadesDestacadas(destacadas) {
    propiedadesGrid.innerHTML = destacadas.map(tarjetaDestacadaHtml).join('');
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

});
