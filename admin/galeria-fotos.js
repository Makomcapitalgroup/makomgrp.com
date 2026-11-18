/**
 * Widget de Decap CMS «galeria-fotos» — carga múltiple de fotografías de una propiedad.
 *
 * Qué hace (todo en el navegador de quien edita; sin servicios externos ni dependencias):
 *   - Selecciona VARIAS fotografías a la vez (botón o arrastrar y soltar desde la computadora), hasta el máximo del campo.
 *   - Muestra miniaturas, contador («6 de 10»), mínimo para publicar, orden editable (arrastrar o ◀ ▶), UNA portada,
 *     texto alternativo, quitar y reemplazar.
 *   - Optimiza ANTES de subir (las originales del computador no se tocan): lado mayor ≤ 2400 px (nunca amplía), JPEG calidad 0,85,
 *     orientación EXIF aplicada, sin metadatos (también quita la ubicación GPS). Una foto ya pequeña y sin giro se sube tal cual.
 *   - Nombres ÚNICOS «<referencia o título>-<fecha>-<código aleatorio>.jpg»: nunca se sobrescribe la imagen de otra propiedad.
 *   - Guarda con el mecanismo de Decap: cada imagen se registra como archivo BORRADOR de la entrada (onPersistMedia) y se publica
 *     junto con la propiedad en una sola operación. Si no se publica, no se escribe nada. No hay escrituras externas.
 *   - Formato de datos IGUAL al de la lista anterior: [{ archivo, alt, portada }], mismas rutas /assets/propiedades/uploads/….
 *
 * Configuración (admin/config.yml → Fotografías → galeria):
 *   widget: "galeria-fotos", min, max, public_folder (misma carpeta pública que el media_folder global).
 *   El mínimo y el máximo salen SOLO de ahí (fuente única: _data/propiedadesConfig.json → limitesMedia; el build las compara).
 *
 * API de Decap utilizada: CMS.registerWidget, window.h / window.createClass, y las propiedades que Decap entrega a todo control
 * (value, onChange, field, entry, getAsset, onPersistMedia) y el método isValid(). Decap se carga con la versión fijada en
 * admin/index.html; si se actualiza, repetir scripts/verificar-galeria-widget.js.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.CMS || !window.h || !window.createClass) return;

  var h = window.h;

  /* ------------------------------------------------------------------ */
  /* Parámetros de optimización (justificación en docs/galeria-carga-multiple.md)  */
  /* ------------------------------------------------------------------ */
  var LADO_MAX = 2400;               // px, dimensión mayor (≥ 2× el ancho mayor que muestra la ficha: 1200 px)
  var CALIDAD = [0.85, 0.75, 0.65];  // JPEG; se baja solo si el resultado supera PESO_OBJETIVO
  var PESO_OBJETIVO = 2.5 * 1048576; // bytes
  var PESO_SIN_TOCAR = 1.5 * 1048576;// un JPEG pequeño, sin giro y dentro de LADO_MAX se sube sin recomprimir
  var PESO_MAX_ENTRADA = 120 * 1048576;
  var TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  function plano(v) {
    if (!v) return [];
    var a = v.toJS ? v.toJS() : v;
    return Array.isArray(a) ? a : [];
  }
  function normalizar(lista) {
    return lista.map(function (f) {
      f = f && f.toJS ? f.toJS() : f || {};
      var o = { archivo: f.archivo || '', portada: f.portada === true };
      if (f.alt) o.alt = f.alt;
      return o;
    });
  }
  function salida(lista) {
    return lista.map(function (f) {
      var o = { archivo: f.archivo };
      if (f.alt) o.alt = f.alt;
      o.portada = f.portada === true;
      return o;
    });
  }
  function tamano(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function nombreArchivo(ruta) {
    return String(ruta || '').split('/').pop();
  }
  function aSlug(t) {
    return String(t || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28);
  }
  function baseNombre(entry) {
    var ref = entry && entry.getIn ? entry.getIn(['data', 'referenciaMakom']) : '';
    if (/^MKW-RE-\d+$/i.test(ref || '')) return aSlug(ref);
    var titulo = entry && entry.getIn ? entry.getIn(['data', 'titulo']) : '';
    return aSlug(titulo) || 'propiedad';
  }
  function aleatorio() {
    var b = new Uint8Array(4);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function nombreUnico(base) {
    var d = new Date();
    var f = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return base + '-' + f + '-' + aleatorio() + '.jpg';
  }
  async function huella(file) {
    if (!(window.crypto && window.crypto.subtle)) return null;
    var buf = await file.arrayBuffer();
    var d = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.prototype.map.call(new Uint8Array(d), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  // Orientación EXIF (1–8) de un JPEG; 1 si no hay.
  function orientacionJPEG(buf) {
    var v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
    var p = 2;
    while (p + 4 < v.byteLength) {
      var marca = v.getUint16(p);
      var largo = v.getUint16(p + 2);
      if (marca === 0xffe1 && v.getUint32(p + 4) === 0x45786966) {
        var t = p + 10;
        var le = v.getUint16(t) === 0x4949;
        var ifd = t + v.getUint32(t + 4, le);
        var n = v.getUint16(ifd, le);
        for (var i = 0; i < n; i++) {
          var e = ifd + 2 + i * 12;
          if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le) || 1;
        }
        return 1;
      }
      if ((marca & 0xff00) !== 0xff00) break;
      p += 2 + largo;
    }
    return 1;
  }

  /* ------------------------------------------------------------------ */
  /* Procesamiento de la imagen                                          */
  /* ------------------------------------------------------------------ */
  var EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  // Algunos navegadores no informan el tipo: se deduce de la extensión.
  function tipoDe(file) {
    if (file.type) return file.type;
    var m = /\.([a-z0-9]+)$/i.exec(file.name || '');
    return (m && EXT[m[1].toLowerCase()]) || '';
  }
  function esHeic(file) {
    return /\.(heic|heif)$/i.test(file.name || '') || /hei[cf]/i.test(file.type || '');
  }
  function errorProceso(file, causa) {
    if (esHeic(file)) {
      return new Error('Las fotos HEIC/HEIF (iPhone) no se pueden procesar en este navegador. Expórtela como JPG o use Safari.');
    }
    return new Error('No se pudo procesar la imagen: ' + (causa || 'el archivo está dañado o no es una fotografía válida') + '.');
  }

  async function decodificar(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e1) {
      // Navegadores sin esa opción: <img> (aplica la orientación EXIF por defecto)
      return await new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(e1); };
        img.src = url;
      });
    }
  }
  function ancho(o) { return o.naturalWidth || o.width; }
  function alto(o) { return o.naturalHeight || o.height; }

  function aBlob(canvas, calidad) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', calidad); });
  }

  /**
   * Devuelve { blob, ancho, alto, antes, despues, sinCambios } o lanza Error con un mensaje claro.
   * Nunca modifica el archivo original (solo lo lee).
   */
  async function procesarImagen(file) {
    var tipo = tipoDe(file);
    if (esHeic(file)) throw errorProceso(file);
    if (TIPOS.indexOf(tipo) === -1) {
      throw new Error('Formato no admitido (' + (tipo || 'desconocido') + '): use JPG, PNG o WebP.');
    }
    if (file.size > PESO_MAX_ENTRADA) {
      throw new Error('El archivo pesa ' + tamano(file.size) + ' y supera el límite de ' + tamano(PESO_MAX_ENTRADA) + '.');
    }
    if (tipo === 'image/jpeg') {
      // Un JPEG completo termina con la marca EOI (FF D9). Chrome decodifica a medias los truncados: se rechaza en vez de subir media foto.
      var cola = new Uint8Array(await file.slice(Math.max(0, file.size - 64)).arrayBuffer());
      var k = cola.length - 1;
      while (k >= 0 && cola[k] === 0) k--; // tras EOI solo puede haber ceros de relleno
      var termina = k >= 1 && cola[k] === 0xd9 && cola[k - 1] === 0xff;
      if (!termina) throw errorProceso(file, 'el archivo está incompleto (se cortó al copiarlo o descargarlo)');
    }
    var origen;
    try {
      origen = await decodificar(file);
    } catch (e) {
      throw errorProceso(file);
    }
    var w = ancho(origen);
    var hh = alto(origen);
    if (!w || !hh) {
      if (origen.close) origen.close();
      throw errorProceso(file);
    }
    var k = Math.min(1, LADO_MAX / Math.max(w, hh)); // nunca amplía
    var W = Math.max(1, Math.round(w * k));
    var H = Math.max(1, Math.round(hh * k));
    var sinGiro = true;
    if (tipo === 'image/jpeg') {
      try { sinGiro = orientacionJPEG(await file.arrayBuffer()) === 1; } catch (e) { sinGiro = false; }
    }
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // PNG/WebP con transparencia → fondo blanco en JPEG
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(origen, 0, 0, W, H);
    if (origen.close) origen.close();

    var blob = null;
    for (var i = 0; i < CALIDAD.length; i++) {
      blob = await aBlob(canvas, CALIDAD[i]);
      if (!blob || blob.type !== 'image/jpeg') throw new Error('Este navegador no pudo comprimir la imagen. Pruebe con Chrome, Safari o Firefox actualizados.');
      if (blob.size <= PESO_OBJETIVO) break;
    }
    canvas.width = canvas.height = 1; // libera memoria
    var redimensionada = k < 1;
    // Un JPEG pequeño, sin giro y sin cambio de tamaño se sube tal cual (no se recomprime: evita perder calidad).
    if (tipo === 'image/jpeg' && !redimensionada && sinGiro && file.size <= PESO_SIN_TOCAR) {
      return { blob: file, ancho: W, alto: H, antes: file.size, despues: file.size, sinCambios: true };
    }
    return { blob: blob, ancho: W, alto: H, antes: file.size, despues: blob.size, sinCambios: false };
  }

  /* ------------------------------------------------------------------ */
  /* Control                                                             */
  /* ------------------------------------------------------------------ */
  var COL = { borde: '#dfdfe3', texto: '#313d3e', suave: '#798291', azul: '#3a69c7', fondo: '#f6f7f9', error: '#cd3a58', ok: '#1e7a46', aviso: '#8a5a00' };
  var S = {
    raiz: { fontFamily: 'inherit', color: COL.texto },
    barra: { display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', margin: '0 0 10px', fontSize: '14px' },
    contador: { fontWeight: 700 },
    zona: { display: 'block', border: '2px dashed ' + COL.borde, borderRadius: '6px', padding: '22px 16px', textAlign: 'center', background: COL.fondo, cursor: 'pointer', margin: '0 0 12px' },
    zonaActiva: { borderColor: COL.azul, background: '#eef3fd' },
    zonaLlena: { cursor: 'default', opacity: 0.7 },
    boton: { display: 'inline-block', border: 0, borderRadius: '5px', padding: '8px 14px', background: COL.azul, color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer' },
    chico: { border: '1px solid ' + COL.borde, borderRadius: '4px', background: '#fff', color: COL.texto, fontSize: '12px', padding: '4px 7px', cursor: 'pointer', lineHeight: 1.2 },
    cuadricula: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px', margin: '0 0 8px', padding: 0, listStyle: 'none' },
    tarjeta: { border: '1px solid ' + COL.borde, borderRadius: '6px', background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    imagen: { width: '100%', height: '130px', objectFit: 'cover', display: 'block', background: '#e9ebef' },
    cuerpo: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' },
    fila: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' },
    insignia: { position: 'absolute', top: '6px', left: '6px', background: 'rgba(0,0,0,.65)', color: '#fff', borderRadius: '10px', padding: '1px 8px', fontSize: '12px', fontWeight: 700 },
    portada: { position: 'absolute', top: '6px', right: '6px', background: '#b5472a', color: '#fff', borderRadius: '10px', padding: '1px 8px', fontSize: '12px', fontWeight: 700 },
    alt: { width: '100%', boxSizing: 'border-box', border: '1px solid ' + COL.borde, borderRadius: '4px', padding: '5px 6px', fontSize: '12px' },
    nota: { fontSize: '11px', color: COL.suave, margin: 0, lineHeight: 1.3 },
    error: { color: COL.error, fontSize: '13px', margin: '4px 0' },
    aviso: { color: COL.aviso, fontSize: '13px', margin: '4px 0' }
  };

  var Control = window.createClass({
    getInitialState: function () {
      return { arrastrandoArchivos: false, arrastrada: null, destino: null, procesando: false, total: 0, hecho: 0, errores: [], avisos: [], info: {}, locales: {} };
    },
    componentWillUnmount: function () {
      this._desmontado = true;
      var l = this.state.locales;
      Object.keys(l).forEach(function (k) { try { URL.revokeObjectURL(l[k]); } catch (e) { /* ya liberada */ } });
    },

    // ---- límites (fuente única: el campo de config.yml) ----
    min: function () { return Number(this.props.field.get('min')) || 3; },
    max: function () { return Number(this.props.field.get('max')) || 10; },
    carpetaPublica: function () { return String(this.props.field.get('public_folder') || '/assets/propiedades/uploads').replace(/\/+$/, ''); },
    items: function () { return normalizar(plano(this.props.value)); },
    emitir: function (lista) { this.props.onChange(salida(lista)); },

    // ---- validación de Decap ----
    isValid: function () {
      var n = this.items();
      var msg = null;
      if (this.state.procesando) msg = 'Espere a que terminen de procesarse las fotografías.';
      else if (n.length < this.min()) msg = 'Suba al menos ' + this.min() + ' fotografías (ahora hay ' + n.length + ').';
      else if (n.length > this.max()) msg = 'Hay ' + n.length + ' fotografías y el máximo es ' + this.max() + '. Quite ' + (n.length - this.max()) + '.';
      else if (n.filter(function (f) { return f.portada; }).length > 1) msg = 'Hay más de una fotografía marcada como portada. Deje solo una.';
      else if (n.some(function (f) { return !f.archivo; })) msg = 'Hay una fila de la galería sin archivo. Quítela.';
      return msg ? { error: { message: msg } } : true;
    },

    // ---- carga ----
    anotar: function (clave, texto) {
      var e = this.state[clave].slice();
      e.push(texto);
      var o = {}; o[clave] = e;
      this.setState(o);
    },
    guardarArchivo: async function (file, procesada) {
      var nombre = nombreUnico(baseNombre(this.props.entry));
      var archivo = new File([procesada.blob], nombre, { type: 'image/jpeg' });
      var res = await this.props.onPersistMedia(archivo, { field: this.props.field });
      // El nombre ya es seguro (minúsculas, a-z, 0-9, guion y punto): Decap lo conserva tal cual, así que la ruta pública se
      // arma con la carpeta pública del campo + ese nombre. Si Decap informa un fallo o una ruta distinta, NO se agrega la foto.
      if (res && typeof res.type === 'string' && /FAILURE/.test(res.type)) throw new Error('Decap no pudo registrar la imagen. Intente de nuevo.');
      var pl = res && res.payload;
      var devuelta = pl && (pl.path || (pl.file && pl.file.path));
      var nombreFinal = nombre;
      if (devuelta) {
        nombreFinal = nombreArchivo(devuelta);
        var carpeta = this.carpetaPublica().replace(/^\//, '');
        var rel = String(devuelta).replace(/^\//, '');
        if (nombreFinal !== nombre || rel.slice(-(carpeta.length + 1 + nombre.length)) !== carpeta + '/' + nombre) {
          throw new Error('La imagen quedó en una ruta inesperada (' + devuelta + '). No se agregó a la galería.');
        }
      }
      return { ruta: this.carpetaPublica() + '/' + nombreFinal, local: URL.createObjectURL(archivo) };
    },
    registrar: function (ruta, local, procesada) {
      var locales = Object.assign({}, this.state.locales); locales[ruta] = local;
      var info = Object.assign({}, this.state.info);
      info[ruta] = { antes: procesada.antes, despues: procesada.despues, ancho: procesada.ancho, alto: procesada.alto, sinCambios: procesada.sinCambios };
      this.setState({ locales: locales, info: info });
    },
    agregar: async function (archivos) {
      archivos = Array.prototype.slice.call(archivos || []);
      if (!archivos.length || this.state.procesando) return;
      var libres = this.max() - this.items().length;
      if (libres <= 0) {
        this.setState({ errores: ['Ya tiene el máximo de ' + this.max() + ' fotografías. Quite una para agregar otra.'], avisos: [] });
        return;
      }
      var avisos = [];
      if (archivos.length > libres) {
        avisos.push('Solo caben ' + libres + ' fotografía' + (libres === 1 ? '' : 's') + ' más (máximo ' + this.max() + '): se agregan las primeras ' + libres + ' y se omiten ' + (archivos.length - libres) + '.');
        archivos = archivos.slice(0, libres);
      }
      this.setState({ procesando: true, total: archivos.length, hecho: 0, errores: [], avisos: avisos });
      this._huellas = this._huellas || {};
      this._salidas = this._salidas || {};
      for (var i = 0; i < archivos.length; i++) {
        var file = archivos[i];
        try {
          if (this.items().length >= this.max()) throw new Error('Se alcanzó el máximo de ' + this.max() + ' fotografías.');
          var hu = await huella(file);
          if (hu && this._huellas[hu]) throw new Error('Ya agregó esta misma fotografía en esta sesión.');
          var procesada = await procesarImagen(file);
          // Decap identifica cada archivo en borrador por el hash de su CONTENIDO: dos imágenes idénticas (aunque vengan de archivos
          // distintos, p. ej. la misma foto en PNG y en JPG) colapsarían en una y dejarían una referencia rota. Se rechaza la repetida.
          var hs = await huella(procesada.blob);
          if (hs && this._salidas[hs]) throw new Error('Esta fotografía ya está en la lista (es la misma imagen aunque tenga otro nombre o formato).');
          var guardada = await this.guardarArchivo(file, procesada);
          if (this._desmontado) return;
          var actual = this.items();
          this.registrar(guardada.ruta, guardada.local, procesada);
          actual.push({ archivo: guardada.ruta, portada: actual.length === 0 || !actual.some(function (f) { return f.portada; }) });
          this.emitir(actual);
          if (hu) this._huellas[hu] = true;
          if (hs) this._salidas[hs] = true;
        } catch (e) {
          this.anotar('errores', (file.name || 'Archivo') + ': ' + (e && e.message ? e.message : 'no se pudo procesar.'));
        }
        if (this._desmontado) return;
        this.setState({ hecho: i + 1 });
      }
      this.setState({ procesando: false });
    },
    reemplazar: async function (indice, file) {
      if (!file || this.state.procesando) return;
      this.setState({ procesando: true, total: 1, hecho: 0, errores: [], avisos: [] });
      try {
        this._salidas = this._salidas || {};
        var procesada = await procesarImagen(file);
        var hs = await huella(procesada.blob);
        if (hs && this._salidas[hs]) throw new Error('Esa fotografía ya está en la lista (es la misma imagen aunque tenga otro nombre o formato).');
        var guardada = await this.guardarArchivo(file, procesada);
        var actual = this.items();
        if (!actual[indice]) throw new Error('La fotografía ya no está en la lista.');
        this.registrar(guardada.ruta, guardada.local, procesada);
        actual[indice] = Object.assign({}, actual[indice], { archivo: guardada.ruta });
        this.emitir(actual);
        if (hs) this._salidas[hs] = true;
      } catch (e) {
        this.anotar('errores', (file.name || 'Archivo') + ': ' + (e && e.message ? e.message : 'no se pudo procesar.'));
      }
      if (!this._desmontado) this.setState({ procesando: false, hecho: 1 });
    },

    // ---- edición de la lista ----
    mover: function (de, a) {
      var l = this.items();
      if (de === a || a < 0 || a >= l.length || de < 0 || de >= l.length) return;
      l.splice(a, 0, l.splice(de, 1)[0]);
      this.emitir(l);
    },
    quitar: function (i) {
      var l = this.items();
      var estabaPortada = l[i] && l[i].portada;
      l.splice(i, 1);
      if (estabaPortada && l.length) l[0].portada = true;
      this.emitir(l);
    },
    hacerPortada: function (i) {
      this.emitir(this.items().map(function (f, k) { return Object.assign({}, f, { portada: k === i }); }));
    },
    cambiarAlt: function (i, texto) {
      var l = this.items();
      if (!l[i]) return;
      if (texto) l[i].alt = texto; else delete l[i].alt;
      this.emitir(l);
    },
    miniatura: function (f) {
      if (this.state.locales[f.archivo]) return this.state.locales[f.archivo];
      try {
        var a = this.props.getAsset(f.archivo, this.props.field);
        var u = a && (a.url || (a.toString && a.toString()));
        if (u && u !== '[object Object]') return u;
      } catch (e) { /* se usa la ruta pública */ }
      return f.archivo;
    },

    // ---- eventos de arrastre ----
    hayArchivos: function (e) {
      var t = e.dataTransfer && e.dataTransfer.types;
      return !!t && Array.prototype.indexOf.call(t, 'Files') !== -1;
    },
    alArrastrarSobre: function (e) {
      if (!this.hayArchivos(e)) return;
      e.preventDefault();
      if (!this.state.arrastrandoArchivos) this.setState({ arrastrandoArchivos: true });
    },
    alSalirArrastre: function (e) {
      if (!this.hayArchivos(e)) return;
      this.setState({ arrastrandoArchivos: false });
    },
    alSoltarArchivos: function (e) {
      if (!this.hayArchivos(e)) return;
      e.preventDefault();
      this.setState({ arrastrandoArchivos: false });
      this.agregar(e.dataTransfer.files);
    },

    // ---- vista ----
    render: function () {
      var self = this;
      var items = this.items();
      var n = items.length;
      var max = this.max();
      var min = this.min();
      var libres = Math.max(0, max - n);
      var enMax = libres === 0;
      var portadas = items.filter(function (f) { return f.portada; }).length;
      var primeraPortada = portadas === 0 ? 0 : items.findIndex(function (f) { return f.portada; });
      var estado = n < min ? { t: 'Faltan ' + (min - n) + ' para el mínimo de ' + min + ' (obligatorio para publicar)', c: COL.error } : { t: enMax ? 'Máximo alcanzado' : 'Puede agregar ' + libres + ' más', c: enMax ? COL.aviso : COL.ok };

      var zona = h('label', {
        style: Object.assign({}, S.zona, this.state.arrastrandoArchivos ? S.zonaActiva : {}, enMax ? S.zonaLlena : {}),
        onDragOver: this.alArrastrarSobre,
        onDragEnter: this.alArrastrarSobre,
        onDragLeave: this.alSalirArrastre,
        onDrop: this.alSoltarArchivos,
        'data-galeria-zona': 'true'
      },
        h('input', {
          type: 'file', multiple: true, accept: TIPOS.join(','), disabled: enMax || this.state.procesando, 'data-galeria-entrada': 'true',
          style: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
          onChange: function (e) { var fs = Array.prototype.slice.call(e.target.files); e.target.value = ''; self.agregar(fs); }
        }),
        h('div', { style: { fontSize: '15px', fontWeight: 700, marginBottom: 8 } }, enMax ? 'Ya tiene las ' + max + ' fotografías permitidas' : 'Arrastre aquí hasta ' + libres + ' fotografía' + (libres === 1 ? '' : 's') + ' desde su computadora'),
        h('span', { style: Object.assign({}, S.boton, enMax || this.state.procesando ? { background: '#a9b0bf', cursor: 'default' } : {}) }, 'Seleccionar fotografías'),
        h('p', { style: Object.assign({}, S.nota, { marginTop: 8 }) }, 'JPG, PNG o WebP. Puede elegir varias a la vez. Se reducen y comprimen automáticamente antes de subirlas; sus originales no se modifican.')
      );

      var progreso = this.state.procesando
        ? h('p', { role: 'status', style: { fontSize: '13px', color: COL.azul, fontWeight: 700, margin: '0 0 8px' }, 'data-galeria-progreso': 'true' }, 'Optimizando y subiendo… ' + Math.min(this.state.hecho + 1, this.state.total) + ' de ' + this.state.total)
        : null;

      var mensajes = [].concat(
        this.state.errores.map(function (t, i) { return h('p', { key: 'e' + i, role: 'alert', style: S.error, 'data-galeria-error': 'true' }, '✕ ' + t); }),
        this.state.avisos.map(function (t, i) { return h('p', { key: 'a' + i, style: S.aviso }, '⚠ ' + t); })
      );
      if (portadas > 1) mensajes.push(h('p', { key: 'p2', role: 'alert', style: S.error }, '✕ Hay ' + portadas + ' fotografías marcadas como portada. Deje solo una (use «Hacer portada»).'));
      var vistos = {};
      var repetidas = items.filter(function (f) { if (vistos[f.archivo]) return true; vistos[f.archivo] = true; return false; }).length;
      if (repetidas) mensajes.push(h('p', { key: 'rep', style: S.aviso }, '⚠ Hay ' + repetidas + ' fotografía(s) repetida(s) en la lista (la misma imagen más de una vez).'));

      var tarjetas = items.map(function (f, i) {
        var esPortada = i === primeraPortada;
        var info = self.state.info[f.archivo];
        var soltado = self.state.destino === i && self.state.arrastrada !== null && self.state.arrastrada !== i;
        return h('li', {
          key: f.archivo + '#' + i,
          draggable: true,
          'data-galeria-tarjeta': String(i),
          style: Object.assign({}, S.tarjeta, soltado ? { outline: '2px solid ' + COL.azul } : {}, self.state.arrastrada === i ? { opacity: 0.45 } : {}),
          onDragStart: function (e) { self._arrastrada = i; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'mk-foto-' + i); } self.setState({ arrastrada: i }); },
          onDragOver: function (e) { if (self._arrastrada != null) { e.preventDefault(); if (self.state.destino !== i) self.setState({ destino: i }); } },
          onDrop: function (e) { if (self._arrastrada != null) { e.preventDefault(); e.stopPropagation(); var de = self._arrastrada; self._arrastrada = null; self.setState({ arrastrada: null, destino: null }); self.mover(de, i); } },
          onDragEnd: function () { self._arrastrada = null; self.setState({ arrastrada: null, destino: null }); }
        },
          h('div', { style: { position: 'relative' } },
            h('img', { src: self.miniatura(f), alt: f.alt || 'Fotografía ' + (i + 1), style: S.imagen, draggable: false, loading: 'lazy' }),
            h('span', { style: S.insignia }, String(i + 1)),
            esPortada ? h('span', { style: S.portada }, '★ Portada') : null
          ),
          h('div', { style: S.cuerpo },
            h('div', { style: S.fila },
              h('button', { type: 'button', style: S.chico, disabled: i === 0, 'aria-label': 'Mover la fotografía ' + (i + 1) + ' a la izquierda', title: 'Mover antes', onClick: function () { self.mover(i, i - 1); } }, '◀'),
              h('button', { type: 'button', style: S.chico, disabled: i === n - 1, 'aria-label': 'Mover la fotografía ' + (i + 1) + ' a la derecha', title: 'Mover después', onClick: function () { self.mover(i, i + 1); } }, '▶'),
              h('button', { type: 'button', style: Object.assign({}, S.chico, esPortada ? { background: '#fbeee9', borderColor: '#b5472a' } : {}), disabled: esPortada && portadas === 1, onClick: function () { self.hacerPortada(i); } }, esPortada ? '★ Es la portada' : 'Hacer portada')
            ),
            h('div', { style: S.fila },
              h('label', { style: Object.assign({}, S.chico, { display: 'inline-block' }) }, 'Reemplazar',
                h('input', { type: 'file', accept: TIPOS.join(','), disabled: self.state.procesando, style: { display: 'none' }, 'data-galeria-reemplazo': String(i), onChange: function (e) { var fi = e.target.files[0]; e.target.value = ''; self.reemplazar(i, fi); } })
              ),
              h('button', { type: 'button', style: Object.assign({}, S.chico, { color: COL.error, borderColor: COL.error }), 'aria-label': 'Quitar la fotografía ' + (i + 1), onClick: function () { self.quitar(i); } }, '✕ Quitar')
            ),
            h('input', { type: 'text', style: S.alt, placeholder: 'Texto alternativo (opcional)', defaultValue: f.alt || '', key: 'alt-' + f.archivo + i, onBlur: function (e) { if ((e.target.value || '') !== (f.alt || '')) self.cambiarAlt(i, e.target.value.trim()); }, onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }),
            info
              ? h('p', { style: S.nota, 'data-galeria-info': 'true' }, info.sinCambios ? 'Subida sin cambios (' + tamano(info.despues) + ', ' + info.ancho + '×' + info.alto + ')' : 'Optimizada: ' + tamano(info.antes) + ' → ' + tamano(info.despues) + ' · ' + info.ancho + '×' + info.alto)
              : h('p', { style: S.nota }, nombreArchivo(f.archivo))
          )
        );
      });

      return h('div', { style: S.raiz, 'data-galeria-fotos': 'true' },
        h('div', { style: S.barra, 'aria-live': 'polite' },
          h('span', { style: S.contador, 'data-galeria-contador': 'true' }, n + ' de ' + max + ' fotografías'),
          h('span', { style: { color: estado.c, fontWeight: 600 }, 'data-galeria-estado': 'true' }, estado.t),
          n > 1 ? h('span', { style: S.nota }, 'Arrastre las tarjetas (o use ◀ ▶) para ordenar; la ★ es la principal.') : null
        ),
        zona,
        progreso,
        mensajes,
        n ? h('ul', { style: S.cuadricula, 'data-galeria-lista': 'true' }, tarjetas) : h('p', { style: S.nota }, 'Todavía no hay fotografías.')
      );
    }
  });

  var Vista = window.createClass({
    render: function () {
      var self = this;
      var lista = normalizar(plano(this.props.value));
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, lista.map(function (f, i) {
        var a = self.props.getAsset ? self.props.getAsset(f.archivo, self.props.field) : null;
        return h('img', { key: i, src: (a && (a.url || String(a))) || f.archivo, alt: f.alt || '', style: { width: 120, height: 80, objectFit: 'cover' } });
      }));
    }
  });

  window.CMS.registerWidget('galeria-fotos', Control, Vista);

  // Funciones puras expuestas solo para las pruebas automáticas (scripts/verificar-galeria-widget.js).
  window.MakomGaleriaFotos = { procesarImagen: procesarImagen, nombreUnico: nombreUnico, baseNombre: baseNombre, orientacionJPEG: orientacionJPEG, constantes: { LADO_MAX: LADO_MAX, CALIDAD: CALIDAD, PESO_OBJETIVO: PESO_OBJETIVO, PESO_SIN_TOCAR: PESO_SIN_TOCAR } };
})();
