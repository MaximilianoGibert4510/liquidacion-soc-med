import { unzipSync, strFromU8 } from "fflate";
import { createExtractorFromData } from "node-unrar-js";
import { parseLibrosDesdeArchivos } from "./parse.js";

let wasmPromesa;

function binarioWasm() {
  if (!wasmPromesa) {
    wasmPromesa = fetch("vendor/unrar.wasm").then((r) => {
      if (!r.ok) throw new Error("No se pudo leer el descompresor RAR.");
      return r.arrayBuffer();
    });
  }
  return wasmPromesa;
}

function esLibro(path) {
  return /\.(xls|htm|html)$/i.test(path) && !/(filelist\.xml|stylesheet\.css|tabstrip\.htm)$/i.test(path);
}

function textoDeBytes(bytes) {
  return strFromU8(bytes);
}

async function expandirComprimido(path, bytes) {
  const lower = path.toLowerCase();
  const salida = [];
  if (lower.endsWith(".zip")) {
    let entries;
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new Error("No pude abrir el zip.");
    }
    for (const [nombre, data] of Object.entries(entries)) {
      const limpio = nombre.replace(/\\/g, "/");
      if (!esLibro(limpio)) continue;
      salida.push({ path: limpio, text: textoDeBytes(data) });
    }
    return salida;
  }
  if (lower.endsWith(".rar")) {
    let extractor;
    try {
      extractor = await createExtractorFromData({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), wasmBinary: await binarioWasm() });
    } catch {
      throw new Error("No pude abrir el rar.");
    }
    const extraido = extractor.extract();
    for (const archivo of extraido.files) {
      if (archivo.fileHeader?.flags?.directory) continue;
      const limpio = String(archivo.fileHeader.name || "").replace(/\\/g, "/");
      if (!esLibro(limpio) || !archivo.extraction) continue;
      salida.push({ path: limpio, text: textoDeBytes(archivo.extraction) });
    }
    return salida;
  }
  return [];
}

async function archivoATextos(file, path) {
  const nombre = path || file.webkitRelativePath || file.name;
  const lower = nombre.toLowerCase();
  if (lower.endsWith(".zip") || lower.endsWith(".rar")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return expandirComprimido(nombre, bytes);
  }
  if (!esLibro(nombre)) return [];
  return [{ path: nombre.replace(/\\/g, "/"), text: await file.text() }];
}

export async function textosDesdeArchivos(files) {
  const textos = [];
  for (const file of files) {
    textos.push(...(await archivoATextos(file, file.webkitRelativePath || file.name)));
  }
  return textos;
}

function leerEntrada(entry, prefijo) {
  return new Promise((resolve, reject) => {
    if (entry.isFile) {
      entry.file(async (file) => {
        try {
          resolve(await archivoATextos(file, prefijo + file.name));
        } catch (error) {
          reject(error);
        }
      }, reject);
      return;
    }
    if (!entry.isDirectory) {
      resolve([]);
      return;
    }
    const reader = entry.createReader();
    const lotes = [];
    const leer = () => {
      reader.readEntries(async (entries) => {
        try {
          if (!entries.length) {
            const anidados = [];
            for (const lote of lotes) anidados.push(...lote);
            resolve(anidados);
            return;
          }
          const parte = [];
          for (const hijo of entries) parte.push(...(await leerEntrada(hijo, `${prefijo}${entry.name}/`)));
          lotes.push(parte);
          leer();
        } catch (error) {
          reject(error);
        }
      }, reject);
    };
    leer();
  });
}

export async function textosDesdeDataTransfer(dataTransfer) {
  const items = [...dataTransfer.items];
  const entradas = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (entradas.length) {
    const textos = [];
    for (const entrada of entradas) textos.push(...(await leerEntrada(entrada, "")));
    return textos;
  }
  return textosDesdeArchivos([...dataTransfer.files]);
}

export function interpretarTextos(textos) {
  return parseLibrosDesdeArchivos(textos);
}
