import { parseAmountToCents } from "./money.js";
import { periodoDesdeFechaExcel } from "./periodos.js";

function normalizar(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function textoPlano(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function filas(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1]))) {
      const attrs = td[1];
      const body = td[2];
      const colspan = Number((attrs.match(/colspan\s*=\s*"?(\d+)/i) || [])[1] || 1);
      const factur = (body.match(/data-factur\s*=\s*"?(\d+)/i) || [])[1] || null;
      cells.push({ colspan, factur, text: textoPlano(body) });
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function expandir(cells) {
  const out = [];
  for (const c of cells) {
    out.push(c);
    for (let i = 1; i < (c.colspan || 1); i++) out.push({ text: "", factur: null, colspan: 1 });
  }
  return out;
}

function codigo(text) {
  const t = String(text || "").replace(/\s/g, "");
  if (!/^\d+$/.test(t)) return "";
  return String(Number(t));
}

function montoEn(cells, idx) {
  if (idx == null || idx < 0 || !cells[idx]) return null;
  return parseAmountToCents(cells[idx].text);
}

function ultimoMonto(cells) {
  for (let i = cells.length - 1; i >= 0; i--) {
    const n = parseAmountToCents(cells[i].text);
    if (n != null && cells[i].text !== "") return n;
  }
  return null;
}

function periodoDeCelda(cell, avisos) {
  if (!cell) return null;
  if (cell.factur && /^\d{7}$/.test(cell.factur)) {
    const decoded = periodoDesdeFechaExcel(cell.text);
    if (decoded && decoded !== cell.factur) {
      avisos.push(`La fecha visible ${cell.text} no coincide con data-factur ${cell.factur}.`);
    }
    return cell.factur;
  }
  return periodoDesdeFechaExcel(cell.text);
}

function partirPractica(detalle) {
  const t = String(detalle || "").trim();
  const m = t.match(/^(\d{3,8}(?:x\d+)?)(?:\s+(.*))?$/i);
  if (!m) return { practica: "", motivo: t };
  const practica = m[1].replace(/X/g, "x");
  return { practica, motivo: (m[2] || "").trim() };
}

function encabezadoFacturacion(cells) {
  const names = cells.map((c) => normalizar(c.text).replace(/\./g, ""));
  const find = (n) => names.indexOf(n);
  const mut = find("mut");
  const practica = find("practica");
  const honor = find("honor");
  const gasto = find("gasto");
  const fecha = find("fecha");
  if (mut < 0 || practica < 0 || honor < 0 || gasto < 0) return null;
  return { mut, practica, honor, gasto, fecha };
}

function encabezadoLiquidacion(cells) {
  const names = cells.map((c) => normalizar(c.text).replace(/\./g, ""));
  const find = (n) => names.indexOf(n);
  const cod = find("cod");
  const honorarios = find("honorarios");
  const gastos = find("gastos");
  const fact = find("fact");
  const detalle = find("detalle");
  const total = find("total");
  const porcentaje = names.findIndex((n) => n === "%" || n === "porcentaje");
  if (cod < 0 || honorarios < 0 || gastos < 0 || fact < 0) return null;
  return { cod, honorarios, gastos, fact, detalle, total, porcentaje };
}

export function parseFacturacion(html) {
  const avisos = [];
  const practicas = [];
  let header = null;
  let totales = null;
  for (const row of filas(html)) {
    const cells = expandir(row);
    if (!header) {
      header = encabezadoFacturacion(cells);
      continue;
    }
    const primero = normalizar(cells[0]?.text || "");
    if (primero.startsWith("total")) {
      totales = {
        honor: montoEn(cells, header.honor),
        gasto: montoEn(cells, header.gasto),
      };
      continue;
    }
    const mut = codigo(cells[header.mut]?.text);
    const practica = (cells[header.practica]?.text || "").trim();
    if (!mut || !/^\d/.test(practica)) continue;
    const honor = montoEn(cells, header.honor) ?? 0;
    const gasto = montoEn(cells, header.gasto) ?? 0;
    practicas.push({
      mut,
      practica,
      honor,
      gasto,
      fecha: header.fecha >= 0 ? cells[header.fecha]?.text || "" : "",
    });
  }
  if (!header) avisos.push("No encontré las columnas Mut, Practica, Honor y Gasto.");
  const sumaHonor = practicas.reduce((s, p) => s + p.honor, 0);
  const sumaGasto = practicas.reduce((s, p) => s + p.gasto, 0);
  if (totales?.honor != null && totales.honor !== sumaHonor) {
    avisos.push(`Honorarios ${sumaHonor} no cierran con el total de la hoja ${totales.honor}.`);
  }
  if (totales?.gasto != null && totales.gasto !== sumaGasto) {
    avisos.push(`Gastos ${sumaGasto} no cierran con el total de la hoja ${totales.gasto}.`);
  }
  return { practicas, avisos };
}

export function parseLiquidacion(html) {
  const avisos = [];
  const facturas = [];
  const auditoria = [];
  const institucionales = [];
  let header = null;
  let seccion = null;
  let totalesFacturas = null;
  let totalesAuditoria = null;
  let totalInstitucional = null;
  let totalDeclarado = null;
  let netoDeclarado = null;

  for (const row of filas(html)) {
    const cells = expandir(row);
    const texto = cells.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
    const n = normalizar(texto);
    if (!header) {
      header = encabezadoLiquidacion(cells);
      continue;
    }
    if (!texto) continue;
    if (n.includes("detalle de facturas liquidadas")) {
      seccion = "facturas";
      continue;
    }
    if (n.includes("debitos y creditos de auditoria")) {
      seccion = "auditoria";
      continue;
    }
    if (n.includes("ajustes institucionales")) {
      seccion = "institucional";
      continue;
    }
    if (n.startsWith("totales")) {
      const snap = {
        honorarios: montoEn(cells, header.honorarios),
        gastos: montoEn(cells, header.gastos),
        total: header.total >= 0 ? montoEn(cells, header.total) : ultimoMonto(cells),
      };
      if (seccion === "auditoria") totalesAuditoria = snap;
      else totalesFacturas = snap;
      continue;
    }
    if (n.startsWith("total/es") || n.startsWith("total es")) {
      totalInstitucional = ultimoMonto(cells);
      continue;
    }
    if (n.includes("neto liquidado")) {
      netoDeclarado = ultimoMonto(cells);
      continue;
    }
    if (n.includes("= total:")) {
      const m = texto.match(/=\s*Total:\s*(-?[\d.,]+)/i);
      if (m) totalDeclarado = parseAmountToCents(m[1]);
      continue;
    }
    if (n.includes("neto acumulado") || n.includes("ambulatoria")) continue;

    if (seccion === "facturas") {
      const mut = codigo(cells[header.cod]?.text);
      if (!mut) continue;
      facturas.push({
        mut,
        factur: periodoDeCelda(cells[header.fact], avisos),
        detalle: (cells[header.detalle]?.text || "").trim(),
        porcentaje: header.porcentaje >= 0 ? cells[header.porcentaje]?.text || "" : "",
        honorarios: montoEn(cells, header.honorarios) ?? 0,
        gastos: montoEn(cells, header.gastos) ?? 0,
      });
    } else if (seccion === "auditoria") {
      const detalle = (cells[header.detalle]?.text || "").trim();
      const honorarios = montoEn(cells, header.honorarios) ?? 0;
      const gastos = montoEn(cells, header.gastos) ?? 0;
      if (!detalle && honorarios === 0 && gastos === 0) continue;
      const partes = partirPractica(detalle);
      auditoria.push({
        mut: codigo(cells[header.cod]?.text),
        factur: periodoDeCelda(cells[header.fact], avisos),
        detalle,
        practica: partes.practica,
        motivo: partes.motivo,
        honorarios,
        gastos,
      });
    } else if (seccion === "institucional") {
      const importe = ultimoMonto(cells);
      const concepto = cells
        .filter((c) => c.text && parseAmountToCents(c.text) == null)
        .map((c) => c.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!concepto || importe == null) continue;
      institucionales.push({ concepto, importe });
    }
  }

  if (!header) avisos.push("No encontré las columnas de la liquidación.");

  const sumH = (rows) => rows.reduce((s, r) => s + r.honorarios, 0);
  const sumG = (rows) => rows.reduce((s, r) => s + r.gastos, 0);
  if (totalesFacturas?.honorarios != null && totalesFacturas.honorarios !== sumH(facturas)) {
    avisos.push(`Honorarios liquidados ${sumH(facturas)} ≠ total ${totalesFacturas.honorarios}.`);
  }
  if (totalesFacturas?.gastos != null && totalesFacturas.gastos !== sumG(facturas)) {
    avisos.push(`Gastos liquidados ${sumG(facturas)} ≠ total ${totalesFacturas.gastos}.`);
  }
  if (totalesAuditoria && (auditoria.length || totalesAuditoria.honorarios)) {
    if (totalesAuditoria.honorarios != null && totalesAuditoria.honorarios !== sumH(auditoria)) {
      avisos.push(`Honorarios de auditoría ${sumH(auditoria)} ≠ total ${totalesAuditoria.honorarios}.`);
    }
    if (totalesAuditoria.gastos != null && totalesAuditoria.gastos !== sumG(auditoria)) {
      avisos.push(`Gastos de auditoría ${sumG(auditoria)} ≠ total ${totalesAuditoria.gastos}.`);
    }
  }
  const antes = sumH(facturas) + sumG(facturas);
  const ajuste = sumH(auditoria) + sumG(auditoria);
  const arca = antes + ajuste;
  if (totalDeclarado != null && totalDeclarado !== arca) {
    avisos.push(`Total ARCA calculado ${arca} ≠ total declarado ${totalDeclarado}.`);
  }
  const gastosInst = institucionales.reduce((s, g) => s + g.importe, 0);
  if (totalInstitucional != null && totalInstitucional !== gastosInst) {
    avisos.push(`Gastos institucionales ${gastosInst} ≠ total ${totalInstitucional}.`);
  }
  if (netoDeclarado != null && netoDeclarado !== arca + gastosInst) {
    avisos.push(`Neto ${netoDeclarado} ≠ ARCA más gastos ${arca + gastosInst}.`);
  }

  return { facturas, auditoria, institucionales, avisos };
}

export function nombresDeHojas(xlsText) {
  const names = [];
  const re = /c_rgszSh\[\s*(\d+)\s*\]\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(xlsText))) names[Number(m[1])] = m[2];
  return names;
}

export function enlacesHojas(xlsText) {
  const hrefs = [];
  const re = /<link\b[^>]*\bid\s*=\s*"shLink"[^>]*>/gi;
  let m;
  while ((m = re.exec(xlsText))) {
    const href = (m[0].match(/href\s*=\s*"([^"]+)"/i) || [])[1];
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function detectarTipo(html) {
  const head = html.slice(0, 8000);
  if (/>\s*Mut\s*</.test(head) && />\s*Practica\s*</.test(head) && />\s*Honor\s*</.test(head)) return "facturacion";
  if (/>\s*Honorarios\s*</.test(head) && />\s*Fact\./.test(head)) return "liquidacion";
  if (encabezadoFacturacion(expandir(filas(html)[0] || []))) return "facturacion";
  for (const row of filas(html).slice(0, 5)) {
    if (encabezadoLiquidacion(expandir(row))) return "liquidacion";
    if (encabezadoFacturacion(expandir(row))) return "facturacion";
  }
  return null;
}

function base(path) {
  const parts = String(path).split("/");
  return parts[parts.length - 1] || path;
}

function dirDe(path) {
  const parts = String(path).split("/");
  parts.pop();
  return parts.join("/");
}

function resolver(dir, href) {
  const partes = [];
  const baseDir = dir ? dir.split("/") : [];
  for (const p of [...baseDir, ...href.split("/")]) {
    if (!p || p === ".") continue;
    if (p === "..") partes.pop();
    else partes.push(p);
  }
  return partes.join("/");
}

function buscarArchivo(archivos, esperado, href) {
  const exacto = archivos.find((a) => a.path === esperado);
  if (exacto) return exacto;
  const porSufijo = archivos.filter((a) => a.path === href || a.path.endsWith("/" + href) || a.path.endsWith(href));
  if (porSufijo.length === 1) return porSufijo[0];
  const nombre = base(href).toLowerCase();
  const porNombre = archivos.filter((a) => base(a.path).toLowerCase() === nombre);
  if (porNombre.length === 1) return porNombre[0];
  return null;
}

export function parseLibrosDesdeArchivos(archivos) {
  const errores = [];
  const avisos = [];
  const normalizados = archivos.map((a) => ({
    path: String(a.path || a.name || "").replace(/\\/g, "/").replace(/^\.\//, ""),
    text: a.text,
  }));
  const libros = normalizados.filter((a) => /\.xls$/i.test(a.path) && /c_rgszSh/.test(a.text));
  if (!libros.length) {
    errores.push("No encontré el .xls del libro. Hace falta el frameset de Excel, junto con la carpeta _archivos.");
    return { facturacion: {}, liquidacion: {}, errores, avisos };
  }

  const facturacion = {};
  const liquidacion = {};

  for (const xls of libros) {
    const dir = dirDe(xls.path);
    const nombres = nombresDeHojas(xls.text);
    const enlaces = enlacesHojas(xls.text);
    if (!enlaces.length) {
      errores.push(`${base(xls.path)} no lista las hojas.`);
      continue;
    }
    const hojas = [];
    enlaces.forEach((href, i) => {
      const archivo = buscarArchivo(normalizados, resolver(dir, href), href);
      if (!archivo) {
        avisos.push(`Falta ${href} (hoja ${nombres[i] || i + 1}) de ${base(xls.path)}.`);
        return;
      }
      hojas.push({ nombre: nombres[i] || null, html: archivo.text });
    });
    if (!hojas.length) {
      errores.push(`${base(xls.path)} no tiene hojas para leer.`);
      continue;
    }
    const tipo = detectarTipo(hojas[0].html);
    if (!tipo) {
      errores.push(`No reconocí si ${base(xls.path)} es facturación o liquidación.`);
      continue;
    }
    for (const hoja of hojas) {
      if (!hoja.nombre) {
        avisos.push(`Una hoja de ${base(xls.path)} no tiene nombre.`);
        continue;
      }
      if (tipo === "facturacion") {
        const parsed = parseFacturacion(hoja.html);
        facturacion[hoja.nombre] = parsed.practicas;
        for (const aviso of parsed.avisos) avisos.push(`${hoja.nombre} (facturación): ${aviso}`);
      } else {
        const parsed = parseLiquidacion(hoja.html);
        liquidacion[hoja.nombre] = {
          facturas: parsed.facturas,
          auditoria: parsed.auditoria,
          institucionales: parsed.institucionales,
        };
        for (const aviso of parsed.avisos) avisos.push(`${hoja.nombre} (liquidación): ${aviso}`);
      }
    }
  }

  return { facturacion, liquidacion, errores, avisos };
}
