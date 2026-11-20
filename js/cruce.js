import { mul92 } from "./money.js";
import { compararHojas, hojaDesdeFactur } from "./periodos.js";

function clave(hoja, mut) {
  return `${hoja}||${mut}`;
}

/**
 * Cruce por obra social y período de facturación.
 * Cierra si el 92% (redondeado al centavo) del total facturado
 * coincide con honorarios + gastos liquidados, antes de la auditoría.
 */
export function cruzar(estado) {
  const map = new Map();
  const asegurar = (hoja, mut) => {
    const k = clave(hoja, mut);
    if (!map.has(k)) map.set(k, { hoja, mut, practicas: [], pagos: [], auditoria: [] });
    return map.get(k);
  };

  for (const [hoja, practicas] of Object.entries(estado.facturacion || {})) {
    for (const p of practicas) asegurar(hoja, p.mut).practicas.push(p);
  }

  for (const [hojaLiq, liq] of Object.entries(estado.liquidacion || {})) {
    for (const f of liq.facturas || []) {
      const hoja = hojaDesdeFactur(f.factur);
      if (!hoja || !f.mut) continue;
      asegurar(hoja, f.mut).pagos.push({
        hoja: hojaLiq,
        factur: f.factur,
        honorarios: f.honorarios,
        gastos: f.gastos,
        detalle: f.detalle,
        porcentaje: f.porcentaje,
      });
    }
    for (const a of liq.auditoria || []) {
      const hoja = hojaDesdeFactur(a.factur);
      if (!hoja || !a.mut) continue;
      asegurar(hoja, a.mut).auditoria.push({ ...a, hojaLiquidacion: hojaLiq, importe: a.honorarios + a.gastos });
    }
  }

  const grupos = [];
  for (const g of map.values()) {
    if (!g.practicas.length && !g.pagos.length) continue;
    const facturado = g.practicas.reduce((s, p) => s + p.honor + p.gasto, 0);
    const liquidado = g.pagos.reduce((s, p) => s + p.honorarios + p.gastos, 0);
    if (facturado === 0 && liquidado === 0) continue;
    const esperado = mul92(facturado);
    const cierra = g.practicas.length > 0 && esperado === liquidado;
    const practicas = g.practicas.map((p) => {
      const importe = p.honor + p.gasto;
      return { ...p, importe, cobrado: cierra ? mul92(importe) : null };
    });
    const sumaCobrada = practicas.reduce((s, p) => s + (p.cobrado || 0), 0);
    const ajusteAuditoria = g.auditoria.reduce((s, a) => s + a.importe, 0);
    grupos.push({
      hoja: g.hoja,
      mut: g.mut,
      practicas,
      pagos: g.pagos,
      auditoria: g.auditoria,
      facturado,
      esperado,
      liquidado,
      cierra,
      ajusteCentavos: cierra ? liquidado - sumaCobrada : 0,
      arca: liquidado + ajusteAuditoria,
      hojasLiquidacion: [...new Set(g.pagos.map((p) => p.hoja))],
    });
  }

  grupos.sort((a, b) => compararHojas(a.hoja, b.hoja) || String(a.mut).localeCompare(String(b.mut), "es"));

  const debitos = [];
  for (const [hojaLiq, liq] of Object.entries(estado.liquidacion || {})) {
    for (const a of liq.auditoria || []) {
      debitos.push({
        ...a,
        importe: a.honorarios + a.gastos,
        hojaLiquidacion: hojaLiq,
        hojaFact: hojaDesdeFactur(a.factur),
      });
    }
  }
  debitos.sort((a, b) => compararHojas(a.hojaLiquidacion, b.hojaLiquidacion) || String(a.mut).localeCompare(String(b.mut), "es"));

  const gastos = [];
  const liquidaciones = [];
  for (const [hoja, liq] of Object.entries(estado.liquidacion || {})) {
    const antes = (liq.facturas || []).reduce((s, f) => s + f.honorarios + f.gastos, 0);
    let debitosHoja = 0;
    let creditosHoja = 0;
    for (const a of liq.auditoria || []) {
      const imp = a.honorarios + a.gastos;
      if (imp < 0) debitosHoja += imp;
      else if (imp > 0) creditosHoja += imp;
    }
    const arca = antes + debitosHoja + creditosHoja;
    const gastosMedico = (liq.institucionales || []).reduce((s, g) => s + g.importe, 0);
    liquidaciones.push({
      hoja,
      antes,
      debitos: debitosHoja,
      creditos: creditosHoja,
      arca,
      gastosMedico,
      facturas: liq.facturas || [],
      auditoria: liq.auditoria || [],
      institucionales: liq.institucionales || [],
    });
    for (const g of liq.institucionales || []) gastos.push({ hoja, concepto: g.concepto, importe: g.importe });
  }
  liquidaciones.sort((a, b) => compararHojas(a.hoja, b.hoja));
  gastos.sort((a, b) => compararHojas(a.hoja, b.hoja) || a.concepto.localeCompare(b.concepto, "es"));

  const abiertos = grupos.filter((g) => !g.cierra);
  const cerrados = grupos.filter((g) => g.cierra);
  const totales = {
    pendiente: abiertos.reduce((s, g) => s + g.esperado, 0),
    pendienteLiquidado: abiertos.reduce((s, g) => s + g.liquidado, 0),
    cobrado: cerrados.reduce((s, g) => s + g.liquidado, 0),
    debitos: debitos.filter((d) => d.importe < 0).reduce((s, d) => s + d.importe, 0),
    creditos: debitos.filter((d) => d.importe > 0).reduce((s, d) => s + d.importe, 0),
    gastos: gastos.reduce((s, g) => s + g.importe, 0),
    arca: liquidaciones.reduce((s, l) => s + l.arca, 0),
    gruposCierran: cerrados.length,
    gruposPendientes: abiertos.length,
  };

  return { grupos, debitos, gastos, liquidaciones, totales };
}

export function nombreObra(obras, codigo) {
  const o = obras?.[codigo];
  if (!o) return codigo ? `Código ${codigo}` : "Sin obra social";
  const desc = limpiar(o.descripcion);
  const nom = limpiar(o.nombre);
  return desc || nom || `Código ${codigo}`;
}

export function nombreCorto(obras, codigo) {
  const o = obras?.[codigo];
  if (!o) return "";
  return limpiar(o.nombre);
}

function limpiar(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
