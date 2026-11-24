import { parseAmountToCents } from "./money.js";
import { describirHoja } from "./periodos.js";

/** 42.01.01 es 420101. El resto de los códigos con el mismo punto se lee igual. */
export function codigoPractica(raw) {
  const t = String(raw || "").trim();
  if (/^\d{2}\.\d{2}\.\d{2}$/.test(t)) return t.replaceAll(".", "");
  return t;
}

function esMayo2026(hoja) {
  const d = describirHoja(hoja);
  return d.anio === 2026 && d.mes === 5;
}

/**
 * Dos correcciones de importe ya confirmadas.
 * OSECAC mayo 2026, práctica 420101: el archivo dice 9,00 y el honorario es 9000.
 * Jerárquicos, hoja 030525: cada consulta se pagó a 14732.
 */
export function ajustarPractica(hoja, practica) {
  const codigo = codigoPractica(practica.practica);
  let honor = practica.honor || 0;
  let gasto = practica.gasto || 0;
  if (String(practica.mut) === "38" && esMayo2026(hoja) && codigo === "420101" && honor + gasto === 900) {
    honor = parseAmountToCents("9000");
    gasto = 0;
  }
  if (String(practica.mut) === "119" && hoja === "30525" && codigo === "420101") {
    honor = parseAmountToCents("14732");
    gasto = 0;
  }
  return { ...practica, practica: codigo, honor, gasto };
}
