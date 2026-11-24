export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Nombre de hoja → período.
 * 0003 es el período inicial.
 * 10126 = período 1, enero 2026.
 * El 3 es IAPOS. El 4 es refacturación. El resto se muestra con su número.
 */
export function describirHoja(hoja) {
  const nombre = String(hoja ?? "");
  if (nombre === "0003") {
    return {
      hoja: nombre,
      etiqueta: "0003 · período inicial",
      orden: [0, 0, 0, 0],
      periodo: null,
      mes: null,
      anio: null,
      clase: "inicial",
    };
  }
  const m = nombre.match(/^(\d)(\d{2})(\d{2})$/);
  if (!m) {
    return {
      hoja: nombre,
      etiqueta: nombre || "sin período",
      orden: [9, 0, 0, 0],
      periodo: null,
      mes: null,
      anio: null,
      clase: null,
    };
  }
  const periodo = Number(m[1]);
  const mes = Number(m[2]);
  const anio = 2000 + Number(m[3]);
  const mesNom = MESES[mes - 1] || `mes ${mes}`;
  let clase = null;
  let rol = `período ${periodo}`;
  if (periodo === 3) {
    clase = "IAPOS";
    rol = "IAPOS";
  } else if (periodo === 4) {
    clase = "refacturacion";
    rol = "refacturación";
  }
  return {
    hoja: nombre,
    periodo,
    mes,
    anio,
    clase,
    etiqueta: `${nombre} · ${mesNom} ${anio} · ${rol}`,
    orden: [1, anio, mes, periodo],
  };
}

/** data-factur YYYY + MM + un dígito de período → nombre de hoja. */
export function hojaDesdeFactur(factur) {
  const s = String(factur || "");
  if (!/^\d{7}$/.test(s)) return null;
  const anio = s.slice(0, 4);
  const mes = s.slice(4, 6);
  const periodo = s.slice(6, 7);
  return `${periodo}${mes}${anio.slice(2)}`;
}

/**
 * Excel muestra el código YY-MM-P como fecha (26/1/2001 = año 26, mes 1, período 1).
 * Solo se usa cuando la celda no trae data-factur.
 */
export function periodoDesdeFechaExcel(text) {
  const m = String(text || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const yy = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (yy > 99 || month < 1 || month > 12) return null;
  if (year < 2000 || year > 2009) return null;
  const periodo = year - 2000;
  return `${2000 + yy}${String(month).padStart(2, "0")}${periodo}`;
}

/**
 * 92% si el período facturado es anterior a abril 2026.
 * 91% desde abril 2026 (AAAAMM >= 202604).
 */
export function porcentajeDeHoja(hoja) {
  const d = describirHoja(hoja);
  if (!d.anio || !d.mes) return 92;
  return d.anio * 100 + d.mes >= 202604 ? 91 : 92;
}

/**
 * En Jerárquicos (obra 119) el 3 del data-factur es el período 1
 * y el 9 es el período 2. En el resto, el 3 sigue siendo IAPOS.
 */
export function etiquetaHoja(hoja, mut) {
  const base = describirHoja(hoja);
  if (String(mut || "") !== "119" || (base.periodo !== 3 && base.periodo !== 9)) return base;
  const rol = base.periodo === 3 ? "período 1" : "período 2";
  const mesNom = MESES[(base.mes || 0) - 1] || `mes ${base.mes}`;
  return {
    ...base,
    clase: "jerarquicos",
    etiqueta: `${base.hoja} · ${mesNom} ${base.anio} · ${rol}`,
  };
}

export function compararHojas(a, b) {
  const da = describirHoja(a).orden;
  const db = describirHoja(b).orden;
  for (let i = 0; i < da.length; i++) {
    if (da[i] !== db[i]) return da[i] - db[i];
  }
  return String(a).localeCompare(String(b));
}
