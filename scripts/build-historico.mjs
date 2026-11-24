import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { parseLibrosDesdeArchivos } from "../js/parse.js";
import { ajustarPractica, codigoPractica } from "../js/ajustes.js";
import { cruzar } from "../js/cruce.js";
import { formatPesos, parseAmountToCents } from "../js/money.js";
import { describirHoja } from "../js/periodos.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const historico = "/cursor/stores/bc-713d6edf-334c-427e-84b5-8c0f6dc49929/internal/historico";

function leerLibro(nombreXls) {
  const xlsPath = join(historico, nombreXls);
  const carpeta = join(historico, nombreXls.replace(/\.xls$/i, "_archivos"));
  const archivos = [{ path: nombreXls, text: readFileSync(xlsPath, "utf8") }];
  for (const file of readdirSync(carpeta)) {
    if (!/^sheet\d+\.htm$/i.test(file)) continue;
    archivos.push({ path: `${nombreXls.replace(/\.xls$/i, "_archivos")}/${file}`, text: readFileSync(join(carpeta, file), "utf8") });
  }
  return archivos;
}

function obrasDesdeXlsx(path) {
  const files = unzipSync(readFileSync(path));
  const ssXml = strFromU8(files["xl/sharedStrings.xml"]);
  const sheetXml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(ssXml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    strings.push(texts.join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  }
  const obras = {};
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  while ((m = rowRe.exec(sheetXml))) {
    const cells = {};
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let c;
    while ((c = cellRe.exec(m[1]))) {
      const ref = (c[1].match(/r="([A-Z]+)\d+"/) || [])[1];
      const tipo = (c[1].match(/t="([^"]+)"/) || [])[1];
      const v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (!ref || v == null) continue;
      cells[ref] = tipo === "s" ? strings[Number(v)] : v;
    }
    const codigo = String(cells.A || "").trim();
    if (!/^\d+$/.test(codigo)) continue;
    obras[String(Number(codigo))] = {
      nombre: String(cells.B || "").replace(/\s+/g, " ").trim(),
      descripcion: String(cells.C || "").replace(/\s+/g, " ").trim(),
    };
  }
  return obras;
}

function decodificarXml(texto) {
  return String(texto || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function columnaDe(ref) {
  const letras = String(ref || "").replace(/\d+/g, "");
  let n = 0;
  for (const ch of letras) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function leerXlsx(path) {
  const files = unzipSync(readFileSync(path));
  const ssXml = strFromU8(files["xl/sharedStrings.xml"] || new Uint8Array());
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(ssXml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodificarXml(t[1]));
    strings.push(texts.join(""));
  }
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const destino = {};
  const relRe = /Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
  while ((m = relRe.exec(rels))) destino[m[1]] = m[2];
  const wb = strFromU8(files["xl/workbook.xml"]);
  const hojas = [];
  const shRe = /<sheet\b[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g;
  while ((m = shRe.exec(wb))) {
    const target = destino[m[2]];
    const xml = strFromU8(files[`xl/${target}`]);
    const filas = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let row;
    while ((row = rowRe.exec(xml))) {
      const celdas = [];
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let c;
      while ((c = cellRe.exec(row[1]))) {
        const ref = (c[1].match(/r="([A-Z]+)\d+"/) || [])[1];
        const tipo = (c[1].match(/t="([^"]+)"/) || [])[1];
        const v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (!ref) continue;
        let valor = "";
        if (tipo === "s" && v != null) valor = strings[Number(v)] || "";
        else if (tipo === "inlineStr") valor = decodificarXml(((c[2].match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || "");
        else if (v != null) valor = v;
        celdas[columnaDe(ref)] = String(valor).trim();
      }
      if (celdas.some((valor) => valor)) filas.push(celdas);
    }
    hojas.push({ nombre: m[1], filas });
  }
  return hojas;
}

function fechaNominal(raw) {
  const t = String(raw || "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return t;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let anio = Number(m[3]);
  if (anio < 100) anio += 2000;
  return `${dia}/${mes}/${anio}`;
}

function hojaJerarquicos(nombre) {
  const m = String(nombre).match(/^(03|09)(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1] === "03" ? "3" : "9"}${m[2]}${m[3]}`;
}

function practicasJerarquicos(path) {
  const porHoja = {};
  for (const hoja of leerXlsx(path)) {
    const clave = hojaJerarquicos(hoja.nombre);
    if (!clave) {
      console.error(`La hoja ${hoja.nombre} de Jerárquicos no tiene forma PPMMYY.`);
      process.exit(1);
    }
    const practicas = [];
    for (const celdas of hoja.filas) {
      const practica = codigoPractica(celdas[6]);
      if (!practica) continue;
      const exento = parseAmountToCents(celdas[11]) ?? 0;
      const neto = parseAmountToCents(celdas[9]) ?? 0;
      let honor = exento + neto;
      if (hoja.nombre === "030525" && practica === "420101") honor = parseAmountToCents("14732");
      practicas.push({
        mut: "119",
        practica,
        honor,
        gasto: 0,
        fecha: fechaNominal(celdas[5]),
      });
    }
    porHoja[clave] = (porHoja[clave] || []).concat(practicas);
  }
  return porHoja;
}

const archivos = [...leerLibro("FACTURACION.xls"), ...leerLibro("LIQUIDACION.xls")];
const libros = parseLibrosDesdeArchivos(archivos);
if (libros.errores.length) {
  console.error(libros.errores.join("\n"));
  process.exit(1);
}
if (libros.avisos.length) {
  console.error("Avisos de control:\n" + libros.avisos.join("\n"));
  process.exit(1);
}

const obras = obrasDesdeXlsx(join(historico, "Listado_Obras_Sociales.xlsx"));
const jerarquicos = practicasJerarquicos(join(historico, "Facturacion_Jerarquicos.xlsx"));
for (const [hoja, practicas] of Object.entries(jerarquicos)) {
  const previas = libros.facturacion[hoja] || [];
  if (previas.some((p) => String(p.mut) === "119")) {
    console.error(`La hoja ${hoja} ya trae la obra 119 en FACTURACION.`);
    process.exit(1);
  }
  libros.facturacion[hoja] = previas.concat(practicas);
}
for (const hoja of Object.keys(libros.facturacion)) {
  libros.facturacion[hoja] = libros.facturacion[hoja].map((p) => ajustarPractica(hoja, p));
}
const seed = {
  version: 2,
  obras,
  facturacion: libros.facturacion,
  liquidacion: libros.liquidacion,
};
mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(join(root, "data", "historico.json"), JSON.stringify(seed));

const cruce = cruzar(seed);
const resumen = {
  hojasFacturacion: Object.keys(seed.facturacion).length,
  hojasLiquidacion: Object.keys(seed.liquidacion).length,
  practicas: Object.values(seed.facturacion).reduce((s, p) => s + p.length, 0),
  obras: Object.keys(obras).length,
  ...cruce.totales,
  pendienteTexto: formatPesos(cruce.totales.pendiente),
  cobradoTexto: formatPesos(cruce.totales.cobrado),
  debitosTexto: formatPesos(cruce.totales.debitos),
  creditosTexto: formatPesos(cruce.totales.creditos),
  gastosTexto: formatPesos(cruce.totales.gastos),
  arcaTexto: formatPesos(cruce.totales.arca),
};
writeFileSync(join(root, "data", "resumen.json"), JSON.stringify({ resumen, grupos: cruce.grupos.map(g => ({
  hoja: g.hoja,
  etiqueta: describirHoja(g.hoja).etiqueta,
  mut: g.mut,
  facturado: g.facturado,
  esperado: g.esperado,
  liquidado: g.liquidado,
  cierra: g.cierra,
  hojasLiquidacion: g.hojasLiquidacion,
  practicas: g.practicas.length,
  auditoria: g.auditoria.map(a => ({ practica: a.practica, importe: a.importe, hoja: a.hojaLiquidacion })),
})), liquidaciones: cruce.liquidaciones.map(l => ({
  hoja: l.hoja,
  etiqueta: describirHoja(l.hoja).etiqueta,
  antes: l.antes,
  debitos: l.debitos,
  creditos: l.creditos,
  arca: l.arca,
  gastosMedico: l.gastosMedico,
  facturas: l.facturas.length,
})) }, null, 2));

console.log(JSON.stringify(resumen, null, 2));
