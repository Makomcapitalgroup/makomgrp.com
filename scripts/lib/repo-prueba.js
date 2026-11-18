// «Repositorio» en memoria para las pruebas del panel (backend test-repo de Decap): el contenido real de content/ más, opcionalmente,
//   · datos CONGELADOS de las dos entradas que las pruebas modifican (propiedad de Costa del Este con 6 fotos y asesor de Loyra), para que no dependan de lo
//     que el equipo publique después desde el CMS real, y
//   · propiedades SINTÉTICAS para el listado (scripts/fixtures/listado-zz-*.json): solo existen aquí, nunca en content/.
const fs = require("fs");
const path = require("path");

exports.construirRepo = function (raiz, { congelar = true, sinteticas = true } = {}) {
  const out = { content: {} };
  for (const col of ["propiedades", "asesores", "proyectos", "perspectivas"]) {
    const d = path.join(raiz, "content", col);
    out.content[col] = {};
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) out.content[col][f] = { content: fs.readFileSync(path.join(d, f), "utf8") };
    if (col === "propiedades" && sinteticas) {
      const dir = path.join(raiz, "scripts", "fixtures");
      for (const f of fs.readdirSync(dir).filter((x) => /^listado-zz-.*\.json$/.test(x))) out.content[col][f.replace(/^listado-/, "")] = { content: fs.readFileSync(path.join(dir, f), "utf8") };
    }
    const congelada = congelar ? { propiedades: ["panam", "propiedad-costa-del-este-base.json"], asesores: ["loyra", "asesor-loyra-base.json"] }[col] : null;
    if (congelada) {
      const clave = Object.keys(out.content[col]).find((k) => k.includes(congelada[0]) && (col !== "propiedades" || k.includes("costa-del-este-panam")));
      if (clave) out.content[col][clave] = { content: fs.readFileSync(path.join(raiz, "scripts", "fixtures", congelada[1]), "utf8") };
    }
    out["content/" + col] = out.content[col]; // el listado del backend de prueba busca la carpeta con la ruta completa
  }
  return out;
};
