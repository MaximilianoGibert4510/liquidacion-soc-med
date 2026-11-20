const CLAVE = "socmed-liquidacion-v1";

export function leerLocal() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.facturacion || !data?.liquidacion || !data?.obras) return null;
    return data;
  } catch {
    return null;
  }
}

export function guardarLocal(estado) {
  localStorage.setItem(CLAVE, JSON.stringify(estado));
}

export function borrarLocal() {
  localStorage.removeItem(CLAVE);
}

export function desdeSemilla(semilla) {
  return {
    version: semilla.version || 1,
    obras: semilla.obras,
    facturacion: semilla.facturacion,
    liquidacion: semilla.liquidacion,
    origen: "historial",
  };
}

export function aplicarImportacion(estado, libros) {
  return {
    ...estado,
    facturacion: { ...estado.facturacion, ...libros.facturacion },
    liquidacion: { ...estado.liquidacion, ...libros.liquidacion },
    origen: "importado",
  };
}
