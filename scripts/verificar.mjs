import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseAmountToCents, mul92, formatPesos } from "../js/money.js";
import { etiquetaHoja, hojaDesdeFactur, periodoDesdeFechaExcel, porcentajeDeHoja } from "../js/periodos.js";
import { cruzar } from "../js/cruce.js";

assert.equal(parseAmountToCents("20000.00"), 2000000);
assert.equal(parseAmountToCents("776.656,00"), 77665600);
assert.equal(parseAmountToCents("65.136,00"), 6513600);
assert.equal(parseAmountToCents("-955,5"), -95550);
assert.equal(parseAmountToCents("-50"), -5000);
assert.equal(parseAmountToCents("12.050,22"), 1205022);
assert.equal(mul92(2340000), 2152800);
assert.equal(formatPesos(2152800), "$ 21.528,00");
assert.equal(formatPesos(-828000), "-$ 8.280,00");
assert.equal(hojaDesdeFactur("2026011"), "10126");
assert.equal(hojaDesdeFactur("2026074"), "40726");
assert.equal(hojaDesdeFactur("2025033"), "30325");
assert.equal(periodoDesdeFechaExcel("26/1/2001"), "2026011");
assert.equal(periodoDesdeFechaExcel("25/3/2003"), "2025033");
assert.equal(periodoDesdeFechaExcel("26/7/2004"), "2026074");
assert.equal(periodoDesdeFechaExcel("26/7/2008"), "2026078");
assert.equal(porcentajeDeHoja("10326"), 92);
assert.equal(porcentajeDeHoja("10426"), 91);
assert.equal(porcentajeDeHoja("0003"), 92);
assert.equal(etiquetaHoja("30325", "119").etiqueta, "30325 · marzo 2025 · período 1");
assert.equal(etiquetaHoja("90425", "119").etiqueta, "90425 · abril 2025 · período 2");
assert.match(etiquetaHoja("31026", "130").etiqueta, /IAPOS/);

const seed = JSON.parse(readFileSync(new URL("../data/historico.json", import.meta.url), "utf8"));
const cruce = cruzar(seed);
assert.equal(cruce.totales.gruposCierran, 133);
assert.equal(cruce.totales.gruposPendientes, 176);
assert.equal(cruce.totales.gruposSinFacturacion, 60);
assert.equal(cruce.totales.debitos, -45233122);
assert.equal(cruce.totales.gastos, -102698971);
assert.equal(cruce.totales.arca, 1618600599);

const cierra = cruce.grupos.find((g) => g.hoja === "10325" && g.mut === "109");
assert.equal(cierra.cierra, true);
assert.equal(cierra.facturado, 2340000);
assert.equal(cierra.esperado, 2152800);
assert.equal(cierra.liquidado, 2152800);
assert.deepEqual(cierra.hojasLiquidacion, ["20525"]);

const noCierra = cruce.grupos.find((g) => g.hoja === "10126" && g.mut === "109");
assert.equal(noCierra.cierra, false);
assert.equal(noCierra.facturado, 9645400);
assert.equal(noCierra.esperado, 8873768);
assert.equal(noCierra.liquidado, 8777314);
assert.deepEqual(noCierra.hojasLiquidacion, ["40726"]);

const iapos = cruce.grupos.find((g) => g.hoja === "31026" && g.mut === "130");
assert.equal(iapos.cierra, false);
assert.equal(iapos.facturado, 112000000);
assert.equal(iapos.porcentaje, 91);
assert.equal(iapos.esperado, 101920000);
assert.equal(iapos.liquidado, 0);

const jerarquicos = cruce.grupos.find((g) => g.hoja === "30525" && g.mut === "119");
assert.equal(jerarquicos.cierra, true);
assert.equal(jerarquicos.facturado, 8839200);
assert.equal(jerarquicos.esperado, 8132064);
assert.equal(jerarquicos.liquidado, 8132064);
assert.equal(jerarquicos.practicas.length, 6);
assert.equal(jerarquicos.practicas.every((p) => p.practica === "420101" && p.honor === 1473200), true);

const osecac = cruce.grupos.find((g) => g.hoja === "10526" && g.mut === "38");
assert.equal(osecac.cierra, true);
assert.equal(osecac.porcentaje, 91);
assert.equal(osecac.facturado, 2700000);
assert.equal(osecac.esperado, 2457000);
assert.equal(osecac.liquidado, 2457000);

const sinFactura = cruce.grupos.find((g) => g.hoja === "20325" && g.mut === "119");
assert.equal(sinFactura.sinFacturacion, true);
assert.equal(sinFactura.practicas.length, 0);
assert.equal(sinFactura.liquidado, 5055492);
assert.equal(cruce.grupos.filter((g) => g.sinFacturacion && g.practicas.length > 0).length, 0);

const debito = cruce.debitos.find((d) => d.practica === "420101x1" && d.mut === "38" && d.hojaFact === "20825");
assert.equal(debito.importe, -828000);
assert.equal(debito.motivo, "FALTA DOCUM");
assert.equal(debito.hojaLiquidacion, "20925");
const grupoDebito = cruce.grupos.find((g) => g.hoja === "20825" && g.mut === "38");
assert.equal(grupoDebito.cierra, true);
assert.equal(grupoDebito.liquidado, 828000);

const hoja407 = cruce.liquidaciones.find((l) => l.hoja === "40726");
assert.equal(hoja407.arca, 8777314);
assert.equal(hoja407.antes, 8777314);
assert.equal(hoja407.gastosMedico, -219433);
assert.equal(hoja407.facturas[0].mut, "109");
assert.equal(hoja407.facturas[0].factur, "2026011");

console.log("verificación numérica ok");
console.log(JSON.stringify({
  cierran: cruce.totales.gruposCierran,
  pendientes: cruce.totales.gruposPendientes,
  cobrado: formatPesos(cruce.totales.cobrado),
  pendiente: formatPesos(cruce.totales.pendiente),
  debitos: formatPesos(cruce.totales.debitos),
  creditos: formatPesos(cruce.totales.creditos),
  gastos: formatPesos(cruce.totales.gastos),
  arca: formatPesos(cruce.totales.arca),
}, null, 2));
