/** Importes en centavos (enteros) para que el 92% cierre al centavo. */

export function parseAmountToCents(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/&nbsp;/gi, "").replace(/\u00a0/g, "").replace(/\s/g, "").trim();
  if (!s) return null;
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let norm;
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) norm = s.replace(/\./g, "").replace(",", ".");
    else norm = s.replace(/,/g, "");
  } else if (hasComma) {
    const parts = s.split(",");
    norm = parts.length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) norm = s.replace(/\./g, "");
    else if (parts[1].length === 3) norm = parts[0] + parts[1];
    else norm = s;
  } else {
    norm = s;
  }
  if (!/^\d+(\.\d+)?$/.test(norm)) return null;
  const [entero, frac = ""] = norm.split(".");
  const dec = (frac + "00").slice(0, 2);
  let cents = Number(entero) * 100 + Number(dec);
  if (frac.length > 2 && frac[2] >= "5") cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

/** Redondeo half-up de un porcentaje entero al centavo. */
export function mulPorcentaje(cents, porcentaje) {
  const neg = cents < 0;
  const v = Math.abs(cents) * porcentaje;
  const q = Math.floor((v + 50) / 100);
  return neg ? -q : q;
}

/** Redondeo half-up del 92% al centavo. */
export function mul92(cents) {
  return mulPorcentaje(cents, 92);
}

export function formatPesos(cents) {
  const n = Number(cents) || 0;
  const neg = n < 0;
  const abs = Math.abs(n);
  const entero = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  const ent = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}$ ${ent},${dec}`;
}
