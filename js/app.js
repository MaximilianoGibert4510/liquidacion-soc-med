import { cruzar, nombreCorto, nombreObra } from "./cruce.js";
import { formatPesos } from "./money.js";
import { compararHojas, describirHoja, hojaDesdeFactur } from "./periodos.js";
import { aplicarImportacion, borrarLocal, desdeSemilla, guardarLocal, leerLocal } from "./store.js";
import { interpretarTextos, textosDesdeArchivos, textosDesdeDataTransfer } from "./importar.js";

const app = document.querySelector("#app");
const filtros = leerFiltros();
let estado = null;
let semilla = null;
let vista = null;

function leerFiltros() {
  const q = new URLSearchParams(location.search);
  return {
    vista: q.get("vista") || "resumen",
    facturado: q.get("facturado") || "",
    liquidacion: q.get("liquidacion") || "",
    obra: q.get("obra") || "",
    q: q.get("q") || "",
  };
}

function escribirFiltros() {
  const q = new URLSearchParams();
  if (filtros.vista !== "resumen") q.set("vista", filtros.vista);
  if (filtros.facturado) q.set("facturado", filtros.facturado);
  if (filtros.liquidacion) q.set("liquidacion", filtros.liquidacion);
  if (filtros.obra) q.set("obra", filtros.obra);
  if (filtros.q) q.set("q", filtros.q);
  const texto = q.toString();
  history.replaceState(null, "", texto ? `?${texto}` : location.pathname);
}

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [clave, valor] of Object.entries(attrs)) {
    if (valor == null || valor === false) continue;
    if (clave === "class") node.className = valor;
    else if (clave.startsWith("on") && typeof valor === "function") node.addEventListener(clave.slice(2).toLowerCase(), valor);
    else node.setAttribute(clave, String(valor));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function obraDe(codigo) {
  return {
    nombre: nombreObra(estado.obras, codigo),
    corto: nombreCorto(estado.obras, codigo),
  };
}

function celdaObra(codigo) {
  const obra = codigo ? obraDe(codigo) : { nombre: "Sin obra social", corto: "" };
  const corto = obra.corto && obra.corto.toLowerCase() !== obra.nombre.toLowerCase() && !obra.nombre.toLowerCase().includes(obra.corto.toLowerCase())
    ? h("span", { class: "obra-corta" }, obra.corto)
    : null;
  return h("td", {}, [obra.nombre, corto]);
}

function pasaTexto(grupo) {
  const q = filtros.q.trim().toLowerCase();
  if (!q) return true;
  const obra = grupo.mut ? obraDe(grupo.mut) : { nombre: "", corto: "" };
  const bolsa = [
    grupo.hoja,
    describirHoja(grupo.hoja).etiqueta,
    grupo.mut,
    obra.nombre,
    obra.corto,
    ...(grupo.hojasLiquidacion || []),
    ...(grupo.practicas || []).map((p) => `${p.practica} ${p.fecha}`),
    ...(grupo.auditoria || []).map((a) => `${a.practica} ${a.motivo} ${a.detalle}`),
  ].join(" ").toLowerCase();
  return bolsa.includes(q);
}

function gruposFiltrados() {
  return vista.grupos.filter((g) => {
    if (filtros.facturado && g.hoja !== filtros.facturado) return false;
    if (filtros.obra && g.mut !== filtros.obra) return false;
    if (filtros.liquidacion && !(g.hojasLiquidacion || []).includes(filtros.liquidacion) && !(g.auditoria || []).some((a) => a.hojaLiquidacion === filtros.liquidacion)) return false;
    return pasaTexto(g);
  });
}

function opcionesPeriodo(hojas) {
  return [...hojas].sort(compararHojas);
}

function armarVista() {
  vista = cruzar(estado);
}

function pintar() {
  armarVista();
  const hojasFact = new Set(vista.grupos.map((g) => g.hoja));
  const hojasLiq = vista.liquidaciones.map((l) => l.hoja);
  const obras = new Map();
  for (const g of vista.grupos) if (g.mut) obras.set(g.mut, obraDe(g.mut).nombre);
  for (const d of vista.debitos) if (d.mut) obras.set(d.mut, obraDe(d.mut).nombre);

  const select = (clave, etiqueta, pares) => h("label", { class: "campo" }, [
    h("span", {}, etiqueta),
    h("select", {
      id: `filtro-${clave}`,
      onchange: (evento) => {
        filtros[clave] = evento.target.value;
        escribirFiltros();
        pintarResultados();
      },
    }, [
      h("option", { value: "" }, "Todos"),
      ...pares.map(([valor, texto]) => h("option", { value: valor, selected: filtros[clave] === valor }, texto)),
    ]),
  ]);

  app.replaceChildren(h("main", { class: "marco", id: "marco" }, [
    h("header", { class: "cabecera" }, [
      h("div", { class: "marca" }, [
        h("div", { class: "sello", "aria-hidden": "true" }, "SM"),
        h("div", {}, [
          h("div", { class: "eyebrow" }, "Sociedad Médica"),
          h("h1", {}, "Honorarios"),
          h("p", { class: "bajada" }, "Qué se cobró, qué sigue pendiente y qué se debitó. Un grupo se cobra cuando el liquidado, antes de la auditoría, coincide con el 92% de lo facturado."),
        ]),
      ]),
      h("div", { class: "acciones" }, [
        h("button", { class: "btn", type: "button", onclick: () => ir("importar") }, "Importar"),
        h("button", { class: "btn peligro", type: "button", onclick: restaurar }, "Volver al historial original"),
      ]),
    ]),
    h("section", { class: "tarjetas", id: "tarjetas" }, tarjetas()),
    h("section", { class: "barra" }, [
      select("facturado", "Período facturado", opcionesPeriodo(hojasFact).map((hoja) => [hoja, describirHoja(hoja).etiqueta])),
      select("liquidacion", "Liquidación", opcionesPeriodo(hojasLiq).map((hoja) => [hoja, describirHoja(hoja).etiqueta])),
      select("obra", "Obra social", [...obras.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"))),
      h("label", { class: "campo" }, [
        h("span", {}, "Práctica o texto"),
        h("input", {
          id: "filtro-q",
          type: "search",
          value: filtros.q,
          placeholder: "420101, obra, hoja",
          oninput: (evento) => {
            filtros.q = evento.target.value;
            escribirFiltros();
            pintarResultados();
          },
        }),
      ]),
    ]),
    h("nav", { class: "vistas", id: "vistas" }, [
      ["resumen", "Resumen"],
      ["pendiente", "Pendiente de cobro"],
      ["cobrado", "Cobrado"],
      ["debitos", "Débitos y créditos"],
      ["gastos", "Gastos del médico"],
      ["arca", "Total ARCA"],
    ].map(([id, texto]) => h("button", {
      type: "button",
      class: filtros.vista === id ? "activa" : "",
      "data-vista": id,
      onclick: () => ir(id),
    }, texto))),
    h("section", { class: "panel", id: "resultados" }),
  ]));
  pintarResultados();
}

function tarjetas() {
  const t = vista.totales;
  const items = [
    ["pendiente", "Pendiente de cobro", formatPesos(t.pendiente), `${t.gruposPendientes} grupos no cierran`],
    ["cobrado", "Cobrado", formatPesos(t.cobrado), `${t.gruposCierran} grupos al 92%`],
    ["debito", "Débitos de auditoría", formatPesos(t.debitos), t.creditos ? `Créditos ${formatPesos(t.creditos)}` : "Sobre lo liquidado"],
    ["gasto", "Gastos del médico", formatPesos(t.gastos), "Federación, subsidio, SM Salud, retención"],
    ["arca", "Total ARCA", formatPesos(t.arca), "Sin los gastos del médico"],
  ];
  return items.map(([id, etiqueta, cifra, ayuda]) => h("button", {
    type: "button",
    class: `tarjeta ${id}${filtros.vista === id || (id === "gasto" && filtros.vista === "gastos") || (id === "debito" && filtros.vista === "debitos") ? " activa" : ""}`,
    onclick: () => ir(id === "gasto" ? "gastos" : id === "debito" ? "debitos" : id),
  }, [
    h("span", { class: "etiqueta" }, etiqueta),
    h("strong", { class: "cifra", id: `total-${id}` }, cifra),
    h("span", { class: "obra-corta" }, ayuda),
  ]));
}

function ir(id) {
  filtros.vista = id;
  escribirFiltros();
  pintar();
}

function pintarResultados() {
  const panel = document.querySelector("#resultados");
  const vistas = document.querySelectorAll("#vistas button");
  vistas.forEach((boton) => boton.classList.toggle("activa", boton.dataset.vista === filtros.vista));
  if (filtros.vista === "pendiente") panel.replaceChildren(vistaPendiente());
  else if (filtros.vista === "cobrado") panel.replaceChildren(vistaCobrado());
  else if (filtros.vista === "debitos") panel.replaceChildren(vistaDebitos());
  else if (filtros.vista === "gastos") panel.replaceChildren(vistaGastos());
  else if (filtros.vista === "arca") panel.replaceChildren(vistaArca());
  else if (filtros.vista === "importar") panel.replaceChildren(vistaImportar());
  else panel.replaceChildren(vistaResumen());
}

function vistaResumen() {
  const t = vista.totales;
  const abiertos = vista.grupos.filter((g) => !g.cierra);
  const sinPago = abiertos.filter((g) => g.liquidado === 0);
  const sinFactura = abiertos.filter((g) => g.facturado === 0);
  const ambos = abiertos.filter((g) => g.facturado > 0 && g.liquidado > 0);
  return h("div", {}, [
    h("h2", {}, "Resumen"),
    h("p", { class: "nota", id: "conteo-grupos" }, [
      h("span", { id: "conteo-cierran" }, String(t.gruposCierran)),
      " grupos cierran al 92%. ",
      h("span", { id: "conteo-pendientes" }, String(t.gruposPendientes)),
      " siguen pendientes.",
    ]),
    h("div", { class: "corte" }, [
      h("div", {}, [h("span", {}, "Cobrados"), h("strong", {}, formatPesos(t.cobrado))]),
      h("div", {}, [h("span", {}, "Pendiente al 92%"), h("strong", {}, formatPesos(t.pendiente))]),
      h("div", {}, [h("span", {}, "Débitos"), h("strong", {}, formatPesos(t.debitos))]),
      h("div", {}, [h("span", {}, "Créditos de auditoría"), h("strong", {}, formatPesos(t.creditos))]),
      h("div", {}, [h("span", {}, "Gastos del médico"), h("strong", {}, formatPesos(t.gastos))]),
      h("div", {}, [h("span", {}, "Total ARCA"), h("strong", {}, formatPesos(t.arca))]),
    ]),
    h("div", { class: "corte" }, [
      h("div", {}, [`${sinPago.length} grupos todavía sin liquidar`, h("strong", {}, formatPesos(sinPago.reduce((s, g) => s + g.esperado, 0)))]),
      h("div", {}, [`${ambos.length} grupos con un pago que no coincide`, h("strong", {}, `${formatPesos(ambos.reduce((s, g) => s + g.esperado, 0))} contra ${formatPesos(ambos.reduce((s, g) => s + g.liquidado, 0))}`)]),
      h("div", {}, [`${sinFactura.length} grupos liquidados sin prácticas en facturación`, h("strong", {}, formatPesos(sinFactura.reduce((s, g) => s + g.liquidado, 0)))]),
    ]),
    h("p", { class: "nota" }, `${Object.keys(estado.facturacion).length} períodos de facturación y ${Object.keys(estado.liquidacion).length} liquidaciones. ${estado.origen === "importado" ? "Hay períodos importados después del historial." : "Está cargado el historial original."} Al recargar, esto queda guardado en este navegador.`),
  ]);
}

function pagosTexto(grupo) {
  if (!grupo.hojasLiquidacion.length) return "Sin liquidar";
  return grupo.hojasLiquidacion.map((hoja) => describirHoja(hoja).etiqueta).join(" · ");
}

function detallePracticas(grupo) {
  return h("details", {}, [
    h("summary", {}, `${grupo.practicas.length} práctica${grupo.practicas.length === 1 ? "" : "s"}`),
    grupo.practicas.length ? h("div", { class: "tabla-scroll" }, [
      h("table", { class: "subtabla" }, [
        h("thead", {}, h("tr", {}, ["Fecha", "Práctica", "Honorarios", "Gastos", "Importe", grupo.cierra ? "Cobrado" : ""].filter(Boolean).map((t) => h("th", { class: t === "Fecha" || t === "Práctica" ? "" : "num" }, t)))),
        h("tbody", {}, grupo.practicas.map((p) => h("tr", {}, [
          h("td", {}, p.fecha || "—"),
          h("td", {}, p.practica),
          h("td", { class: "num" }, formatPesos(p.honor)),
          h("td", { class: "num" }, formatPesos(p.gasto)),
          h("td", { class: "num" }, formatPesos(p.importe)),
          grupo.cierra ? h("td", { class: "num" }, formatPesos(p.cobrado)) : null,
        ]))),
      ]),
    ]) : h("p", { class: "nota" }, "Esta liquidación no tiene prácticas cargadas en facturación."),
    grupo.pagos.length ? h("div", { class: "tabla-scroll" }, [
      h("table", { class: "subtabla" }, [
        h("thead", {}, h("tr", {}, ["Liquidación", "Detalle", "Honorarios", "Gastos", "%"].map((t, i) => h("th", { class: i > 1 ? "num" : "" }, t)))),
        h("tbody", {}, grupo.pagos.map((p) => h("tr", {}, [
          h("td", {}, describirHoja(p.hoja).etiqueta),
          h("td", {}, p.detalle || "—"),
          h("td", { class: "num" }, formatPesos(p.honorarios)),
          h("td", { class: "num" }, formatPesos(p.gastos)),
          h("td", { class: "num" }, p.porcentaje || "—"),
        ]))),
      ]),
    ]) : null,
    grupo.auditoria.length ? h("p", { class: "nota" }, grupo.auditoria.map((a) => `${a.importe < 0 ? "Débito" : "Crédito"} ${a.practica || a.detalle}: ${formatPesos(a.importe)} en ${describirHoja(a.hojaLiquidacion).etiqueta}${a.motivo ? ` (${a.motivo})` : ""}`).join(" · ")) : null,
    grupo.cierra ? h("p", { class: "nota" }, `ARCA de la factura: ${formatPesos(grupo.arca)}.`) : h("p", { class: "nota" }, `ARCA de lo liquidado en esta factura, con su auditoría: ${formatPesos(grupo.arca)}.`),
    grupo.ajusteCentavos ? h("p", { class: "aviso-centavos" }, `La suma del 92% de cada práctica difiere ${formatPesos(grupo.ajusteCentavos)} del total liquidado por el redondeo al centavo.`) : null,
  ]);
}

function filasGrupo(grupo, modo) {
  return h("tbody", {
    "data-hoja": grupo.hoja,
    "data-mut": grupo.mut,
    "data-estado": grupo.cierra ? "cobrado" : "pendiente",
    "data-esperado": grupo.esperado,
    "data-liquidado": grupo.liquidado,
  }, [
    h("tr", {}, [
      celdaObra(grupo.mut),
      h("td", {}, describirHoja(grupo.hoja).etiqueta),
      h("td", { class: "num" }, formatPesos(grupo.facturado)),
      h("td", { class: "num monto-esperado" }, formatPesos(grupo.esperado)),
      h("td", { class: "num monto-liquidado" }, formatPesos(grupo.liquidado)),
      modo === "pendiente"
        ? h("td", { class: "num" }, formatPesos(grupo.esperado - grupo.liquidado))
        : h("td", {}, pagosTexto(grupo)),
      h("td", {}, modo === "pendiente"
        ? [pagosTexto(grupo), grupo.auditoria.length ? h("span", { class: "estado deb" }, " Con auditoría") : null]
        : grupo.auditoria.length ? h("span", { class: "estado deb" }, "Con auditoría") : "—"),
    ]),
    h("tr", { class: "detalle" }, h("td", { colspan: "7" }, detallePracticas(grupo))),
  ]);
}

function vistaPendiente() {
  const grupos = gruposFiltrados().filter((g) => !g.cierra);
  return h("div", {}, [
    h("h2", {}, "Pendiente de cobro"),
    h("p", { class: "nota" }, "Siguen pendientes cuando el liquidado, antes de los débitos de auditoría, no coincide con el 92% de lo facturado. Se ven los dos importes."),
    tablaGrupos(grupos, "pendiente"),
  ]);
}

function vistaCobrado() {
  const grupos = gruposFiltrados().filter((g) => g.cierra);
  return h("div", {}, [
    h("h2", {}, "Cobrado"),
    h("p", { class: "nota" }, "Cada práctica figura cobrada por el 92% de sus honorarios más gastos. El período facturado y la liquidación en que se pagó están en la fila."),
    tablaGrupos(grupos, "cobrado"),
  ]);
}

function tablaGrupos(grupos, modo) {
  if (!grupos.length) return h("p", { class: "vacio" }, "Nada con estos filtros.");
  const columnas = modo === "pendiente"
    ? ["Obra social", "Período facturado", "Facturado", "92%", "Liquidado", "Diferencia", "Dónde"]
    : ["Obra social", "Período facturado", "Facturado", "92% cobrado", "Liquidado", "Liquidación", "Auditoría"];
  return h("div", { class: "tabla-scroll" }, h("table", {}, [
    h("thead", {}, h("tr", {}, columnas.map((c, i) => h("th", { class: i >= 2 && i <= 5 && modo === "pendiente" || (modo === "cobrado" && i >= 2 && i <= 4) ? "num" : "" }, c)))),
    ...grupos.map((g) => filasGrupo(g, modo)),
  ]));
}

function vistaDebitos() {
  const q = filtros.q.trim().toLowerCase();
  const filas = vista.debitos.filter((d) => {
    if (filtros.obra && d.mut !== filtros.obra) return false;
    if (filtros.liquidacion && d.hojaLiquidacion !== filtros.liquidacion) return false;
    if (filtros.facturado && d.hojaFact !== filtros.facturado) return false;
    if (!q) return true;
    const obra = d.mut ? obraDe(d.mut).nombre : "";
    return `${d.practica} ${d.motivo} ${d.detalle} ${obra} ${d.hojaFact} ${d.hojaLiquidacion}`.toLowerCase().includes(q);
  });
  return h("div", {}, [
    h("h2", {}, "Débitos y créditos de auditoría"),
    h("p", { class: "nota" }, "Un importe negativo es débito. Uno positivo es crédito. Puede caer sobre algo que ya estaba cobrado."),
    filas.length ? h("div", { class: "tabla-scroll" }, h("table", {}, [
      h("thead", {}, h("tr", {}, ["Obra social", "Práctica", "Detalle", "Período facturado", "Importe", "Liquidación", "Sobre el grupo"].map((c, i) => h("th", { class: i === 4 ? "num" : "" }, c)))),
      h("tbody", {}, filas.map((d) => {
        const grupo = vista.grupos.find((g) => g.mut === d.mut && g.hoja === d.hojaFact);
        return h("tr", { "data-practica": d.practica || "", "data-mut": d.mut || "" }, [
          celdaObra(d.mut),
          h("td", {}, d.practica || "—"),
          h("td", {}, d.motivo || d.detalle || "—"),
          h("td", {}, d.hojaFact ? describirHoja(d.hojaFact).etiqueta : "Sin período"),
          h("td", { class: "num" }, formatPesos(d.importe)),
          h("td", {}, describirHoja(d.hojaLiquidacion).etiqueta),
          h("td", {}, grupo ? h("span", { class: grupo.cierra ? "estado ok" : "estado no" }, grupo.cierra ? "Cae sobre lo cobrado" : "El grupo sigue pendiente") : h("span", { class: "estado deb" }, d.importe < 0 ? "Débito" : "Crédito")),
        ]);
      })),
    ])) : h("p", { class: "vacio" }, "No hay débitos ni créditos con estos filtros."),
  ]);
}

function vistaGastos() {
  const filas = vista.gastos.filter((g) => !filtros.liquidacion || g.hoja === filtros.liquidacion);
  const total = filas.reduce((s, g) => s + g.importe, 0);
  return h("div", {}, [
    h("h2", {}, "Gastos del médico"),
    h("p", { class: "nota" }, "Federación, subsidio, SM Salud y retención. No son débitos de la obra social y no entran en el total ARCA."),
    h("p", { class: "nota" }, `Total de lo filtrado: ${formatPesos(total)}.`),
    filas.length ? h("div", { class: "tabla-scroll" }, h("table", {}, [
      h("thead", {}, h("tr", {}, [h("th", {}, "Liquidación"), h("th", {}, "Concepto"), h("th", { class: "num" }, "Importe")])),
      h("tbody", {}, filas.map((g) => h("tr", { "data-hoja": g.hoja }, [
        h("td", {}, describirHoja(g.hoja).etiqueta),
        h("td", {}, g.concepto),
        h("td", { class: "num" }, formatPesos(g.importe)),
      ]))),
    ])) : h("p", { class: "vacio" }, "No hay gastos institucionales con este filtro."),
  ]);
}

function vistaArca() {
  const hojas = vista.liquidaciones.filter((l) => !filtros.liquidacion || l.hoja === filtros.liquidacion);
  return h("div", {}, [
    h("h2", {}, "Total ARCA"),
    h("p", { class: "nota" }, "De cada liquidación: total antes de la auditoría, menos los débitos, más los créditos. Los gastos del médico quedan aparte. El total de arriba suma todas las liquidaciones, no solo el filtro."),
    hojas.length ? h("div", { class: "tabla-scroll" }, h("table", {}, [
      h("thead", {}, h("tr", {}, ["Liquidación", "Antes de auditoría", "Débitos", "Créditos", "Total ARCA", "Gastos del médico"].map((c, i) => h("th", { class: i ? "num" : "" }, c)))),
      h("tbody", {}, hojas.map((l) => h("tr", { "data-hoja": l.hoja }, [
        h("td", {}, [
          describirHoja(l.hoja).etiqueta,
          h("details", {}, [
            h("summary", {}, `${l.facturas.length} factura${l.facturas.length === 1 ? "" : "s"}`),
            h("table", { class: "subtabla" }, [
              h("thead", {}, h("tr", {}, ["Obra social", "Período facturado", "Honorarios", "Gastos", "Importe"].map((c, i) => h("th", { class: i > 1 ? "num" : "" }, c)))),
              h("tbody", {}, l.facturas.map((f) => {
                const hojaFact = hojaDesdeFactur(f.factur);
                return h("tr", {}, [
                  celdaObra(f.mut),
                  h("td", {}, hojaFact ? describirHoja(hojaFact).etiqueta : "Sin período"),
                  h("td", { class: "num" }, formatPesos(f.honorarios)),
                  h("td", { class: "num" }, formatPesos(f.gastos)),
                  h("td", { class: "num" }, formatPesos(f.honorarios + f.gastos)),
                ]);
              })),
            ]),
          ]),
        ]),
        h("td", { class: "num" }, formatPesos(l.antes)),
        h("td", { class: "num" }, formatPesos(l.debitos)),
        h("td", { class: "num" }, formatPesos(l.creditos)),
        h("td", { class: "num", "data-arca": l.hoja }, formatPesos(l.arca)),
        h("td", { class: "num" }, formatPesos(l.gastosMedico)),
      ]))),
    ])) : h("p", { class: "vacio" }, "No hay liquidaciones con este filtro."),
  ]);
}

function vistaImportar() {
  const zona = h("div", {
    class: "zona",
    id: "zona-importar",
    ondragover: (evento) => {
      evento.preventDefault();
      zona.classList.add("encima");
    },
    ondragleave: () => zona.classList.remove("encima"),
    ondrop: async (evento) => {
      evento.preventDefault();
      zona.classList.remove("encima");
      await importarLista(await textosDesdeDataTransfer(evento.dataTransfer));
    },
  }, [
    h("h2", {}, "Importar un período"),
    h("p", {}, "Se puede traer solo facturación, solo liquidación, o las dos. Sirve un período o el libro completo, en el mismo formato: el .xls y la carpeta _archivos, o un zip o rar con ambos."),
    h("p", { class: "nota" }, "Reimportar un período lo reemplaza. Lo demás queda como está."),
    h("div", { class: "archivos" }, [
      h("label", { class: "btn primario" }, [
        "Elegir archivos",
        h("input", { type: "file", multiple: "true", accept: ".xls,.htm,.html,.zip,.rar", hidden: "true", onchange: (evento) => tomarInput(evento.target.files) }),
      ]),
      h("label", { class: "btn" }, [
        "Elegir carpeta",
        h("input", { type: "file", webkitdirectory: "", hidden: "true", onchange: (evento) => tomarInput(evento.target.files) }),
      ]),
    ]),
    h("div", { id: "resultado-importar" }),
  ]);
  return zona;
}

async function tomarInput(files) {
  if (!files?.length) return;
  await importarLista(await textosDesdeArchivos(files));
}

async function importarLista(textos) {
  const caja = document.querySelector("#resultado-importar");
  if (!textos.length) {
    caja.replaceChildren(h("div", { class: "mensaje error" }, "No encontré un libro de Excel en lo que subiste."));
    return;
  }
  let libros;
  try {
    libros = interpretarTextos(textos);
  } catch (error) {
    caja.replaceChildren(h("div", { class: "mensaje error" }, error.message || "No se pudo leer el archivo."));
    return;
  }
  const hojasF = Object.keys(libros.facturacion);
  const hojasL = Object.keys(libros.liquidacion);
  if (!hojasF.length && !hojasL.length) {
    caja.replaceChildren(h("div", { class: "mensaje error" }, [
      libros.errores[0] || "No reconocí facturación ni liquidación.",
      libros.avisos.length ? h("ul", {}, libros.avisos.slice(0, 8).map((a) => h("li", {}, a))) : null,
    ]));
    return;
  }
  estado = aplicarImportacion(estado, libros);
  guardarLocal(estado);
  const faltantes = libros.avisos.filter((a) => a.startsWith("Falta "));
  const otros = libros.avisos.filter((a) => !a.startsWith("Falta "));
  pintar();
  const nuevo = document.querySelector("#resultado-importar");
  if (!nuevo) return;
  nuevo.replaceChildren(h("div", { class: "mensaje" }, [
    `Se reemplazaron ${hojasF.length} período${hojasF.length === 1 ? "" : "s"} de facturación y ${hojasL.length} de liquidación.`,
    hojasF.length ? h("p", {}, `Facturación: ${hojasF.sort(compararHojas).join(", ")}.`) : null,
    hojasL.length ? h("p", {}, `Liquidación: ${hojasL.sort(compararHojas).join(", ")}.`) : null,
    faltantes.length ? h("p", {}, `Quedaron ${faltantes.length} hojas del libro sin archivo. Esas no se tocaron.`) : null,
    otros.length ? h("ul", {}, otros.slice(0, 12).map((a) => h("li", {}, a))) : null,
    libros.errores.length ? h("ul", {}, libros.errores.map((a) => h("li", {}, a))) : null,
  ]));
}

async function restaurar() {
  if (!confirm("Se vuelve al historial original y se descartan los períodos importados en este navegador.")) return;
  borrarLocal();
  estado = desdeSemilla(semilla);
  guardarLocal(estado);
  pintar();
}

async function iniciar() {
  const local = leerLocal();
  semilla = await fetch("data/historico.json").then((r) => {
    if (!r.ok) throw new Error("No está el historial.");
    return r.json();
  });
  if (local) estado = local;
  else {
    estado = desdeSemilla(semilla);
    guardarLocal(estado);
  }
  pintar();
}

iniciar().catch((error) => {
  app.replaceChildren(h("p", { class: "cargando" }, error.message || "No se pudo abrir el historial."));
});
