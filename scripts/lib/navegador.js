"use strict";

/**
 * Núcleo compartido de las baterías en navegador real (sin dependencias nuevas):
 * servidor estático de _site/ (con retardo configurable para simular carga lenta) y Chrome
 * controlado por el protocolo DevTools. Lo usa scripts/verificar-formulario.js.
 * (verificar-flotante.js conserva su propia copia para no tocar una suite ya aprobada.)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

// MAKOM_SITIO permite probar otra carpeta (p. ej. una copia con el script anterior, como control negativo de la batería).
const SITIO = process.env.MAKOM_SITIO ? path.resolve(process.env.MAKOM_SITIO) : path.join(__dirname, "..", "..", "_site");

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};


// opciones.retardo(ruta) → milisegundos de espera antes de responder (carga lenta simulada).
function iniciarServidor(opciones) {
  const retardo = (opciones && opciones.retardo) || (() => 0);
  return new Promise((resolve) => {
    const servidor = http.createServer((req, res) => {
      let ruta;
      try {
        ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
      } catch (e) {
        res.writeHead(400).end();
        return;
      }
      let archivo = path.normalize(path.join(SITIO, ruta));
      if (!archivo.startsWith(SITIO)) {
        res.writeHead(403).end();
        return;
      }
      if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) archivo = path.join(archivo, "index.html");
      if (!fs.existsSync(archivo)) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("404");
        return;
      }
      const enviar = () => {
        res.writeHead(200, {
          "Content-Type": TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        fs.createReadStream(archivo).pipe(res);
      };
      const ms = retardo(ruta) || 0;
      if (ms > 0) setTimeout(enviar, ms);
      else enviar();
    });
    servidor.listen(0, "127.0.0.1", () => resolve({ servidor, base: "http://127.0.0.1:" + servidor.address().port }));
  });
}

function localizarChrome(preferido) {
  const candidatos = [
    preferido,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const c of candidatos) if (fs.existsSync(c)) return c;
  for (const n of ["google-chrome", "chromium", "chromium-browser"]) {
    const r = spawnSync("which", [n], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error("No se encontró Chrome. Usa --chrome <ruta> o la variable CHROME_PATH.");
}

async function lanzarChrome(ejecutable) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "makom-navegador-"));
  const proc = spawn(
    ejecutable,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      "--user-data-dir=" + perfil,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const archivoPuerto = path.join(perfil, "DevToolsActivePort");
  let puerto = null;
  for (let i = 0; i < 200 && !puerto; i++) {
    if (fs.existsSync(archivoPuerto)) puerto = fs.readFileSync(archivoPuerto, "utf8").split("\n")[0].trim();
    else await new Promise((r) => setTimeout(r, 50));
  }
  if (!puerto) throw new Error("Chrome no abrió el puerto de depuración.");
  let pestana = null;
  for (let i = 0; i < 100 && !pestana; i++) {
    try {
      const lista = await (await fetch("http://127.0.0.1:" + puerto + "/json/list")).json();
      pestana = lista.find((t) => t.type === "page");
    } catch (e) {
      /* reintento */
    }
    if (!pestana) await new Promise((r) => setTimeout(r, 50));
  }
  if (!pestana) throw new Error("Chrome no ofreció ninguna pestaña.");
  const ws = new WebSocket(pestana.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let id = 0;
  const pendientes = new Map();
  const oyentes = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      const { ok, ko } = pendientes.get(m.id);
      pendientes.delete(m.id);
      if (m.error) ko(new Error(JSON.stringify(m.error)));
      else ok(m.result);
    } else if (m.method) {
      oyentes.slice().forEach((o) => o(m));
    }
  });
  const cdp = {
    send(method, params = {}) {
      return new Promise((ok, ko) => {
        const i = ++id;
        pendientes.set(i, { ok, ko });
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    },
    on(fn) {
      oyentes.push(fn);
    },
    una(method) {
      return new Promise((resolve) => {
        const fn = (m) => {
          if (m.method === method) {
            oyentes.splice(oyentes.indexOf(fn), 1);
            resolve(m.params);
          }
        };
        oyentes.push(fn);
      });
    },
    async cerrar() {
      try {
        await cdp.send("Browser.close");
      } catch (e) {
        /* ya cerrado */
      }
      try {
        ws.close();
      } catch (e) {
        /* ya cerrado */
      }
      proc.kill();
      try {
        fs.rmSync(perfil, { recursive: true, force: true });
      } catch (e) {
        /* mejor esfuerzo */
      }
    },
  };
  return cdp;
}


module.exports = { SITIO, iniciarServidor, localizarChrome, lanzarChrome };
