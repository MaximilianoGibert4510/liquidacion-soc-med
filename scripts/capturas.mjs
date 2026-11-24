import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { zipSync, strToU8 } from "fflate";

const base = "http://127.0.0.1:8765";
const media = "/cursor/stores/bc-713d6edf-334c-427e-84b5-8c0f6dc49929/media";
mkdirSync(media, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
const errores = [];
page.on("pageerror", (error) => errores.push(String(error)));
page.on("console", (msg) => {
  const texto = msg.text();
  if (msg.type() === "error" && !/404|favicon/i.test(texto)) errores.push(texto);
});

async function ir(ruta) {
  await page.goto(base + ruta, { waitUntil: "networkidle0" });
  await page.waitForSelector("#conteo-cierran, #resultados, .panel");
}

async function shot(nombre) {
  const path = join(media, nombre);
  await page.screenshot({ path, fullPage: true });
  return path;
}

await page.setViewport({ width: 1440, height: 1000 });
await ir("/");
await page.waitForSelector("#conteo-cierran");
const cierran = await page.$eval("#conteo-cierran", (n) => n.textContent.trim());
const pendientes = await page.$eval("#conteo-pendientes", (n) => n.textContent.trim());
if (cierran !== "133" || pendientes !== "176") throw new Error(`conteos ${cierran}/${pendientes}`);
const resumen = await shot("resumen.png");

await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector("#conteo-cierran");
const trasRecarga = await page.$eval("#conteo-cierran", (n) => n.textContent.trim());
if (trasRecarga !== "133") throw new Error("el historial no sobrevivió la recarga");

await ir("/?vista=cobrado&facturado=10325&obra=109");
await page.waitForSelector('tbody[data-hoja="10325"][data-mut="109"]');
const cobrado = await page.$eval('tbody[data-hoja="10325"][data-mut="109"]', (tr) => ({
  estado: tr.dataset.estado,
  esperado: tr.dataset.esperado,
  liquidado: tr.dataset.liquidado,
  texto: tr.innerText,
}));
if (cobrado.estado !== "cobrado" || cobrado.esperado !== "2152800" || cobrado.liquidado !== "2152800") {
  throw new Error("el grupo que cierra no muestra $ 21.528,00");
}
if (!cobrado.texto.includes("21.528,00") || !cobrado.texto.includes("23.400,00")) {
  throw new Error("faltan los importes del grupo cobrado");
}
await page.click('tbody[data-hoja="10325"] summary');
const cobradoShot = await shot("cobrado-10325-mutual-109.png");
await page.select("#filtro-obra", "");
await page.select("#filtro-facturado", "10525");
await page.waitForSelector('tbody[data-hoja="10525"]');

await ir("/?vista=pendiente&facturado=10126&obra=109");
await page.waitForSelector('tbody[data-hoja="10126"][data-mut="109"]');
const abierto = await page.$eval('tbody[data-hoja="10126"][data-mut="109"]', (tr) => ({
  estado: tr.dataset.estado,
  esperado: tr.dataset.esperado,
  liquidado: tr.dataset.liquidado,
  texto: tr.innerText,
}));
if (abierto.estado !== "pendiente" || abierto.esperado !== "8873768" || abierto.liquidado !== "8777314") {
  throw new Error("el grupo que no cierra no muestra los dos importes");
}
if (!abierto.texto.includes("88.737,68") || !abierto.texto.includes("87.773,14") || !abierto.texto.includes("40726")) {
  throw new Error("faltan importes o la hoja 40726 en el pendiente");
}
const pendienteShot = await shot("pendiente-10126-mutual-109.png");

await ir("/?vista=debitos&obra=38&facturado=20825");
await page.waitForSelector('tr[data-practica="420101x1"][data-mut="38"]');
const debitoTxt = await page.$eval('tr[data-practica="420101x1"][data-mut="38"]', (tr) => tr.innerText);
if (!debitoTxt.includes("420101x1") || !debitoTxt.includes("8.280,00") || !debitoTxt.includes("FALTA DOCUM")) {
  throw new Error("el débito 420101x1 no aparece");
}
if (!debitoTxt.includes("Cae sobre lo cobrado")) throw new Error("el débito no marca que cae sobre lo cobrado");
const debitoShot = await shot("debito-420101x1.png");

await ir("/?vista=pendiente&facturado=31026");
await page.waitForSelector('tbody[data-hoja="31026"][data-mut="130"]');
const iapos = await page.$eval('tbody[data-hoja="31026"][data-mut="130"]', (tr) => tr.innerText);
if (!iapos.includes("IAPOS") || !iapos.includes("1.120.000,00") || !iapos.includes("1.019.200,00")) {
  throw new Error("el período 3 IAPOS no muestra sus importes");
}
const iaposShot = await shot("periodo-3-iapos-31026.png");

await ir("/?vista=arca&liquidacion=40726");
await page.waitForSelector('[data-arca="40726"]');
const arca = await page.$eval('[data-arca="40726"]', (n) => n.textContent.trim());
const hoja407 = await page.$eval('tr[data-hoja="40726"]', (tr) => tr.innerText);
if (arca !== "$ 87.773,14") throw new Error(`ARCA de 40726 es ${arca}`);
if (!hoja407.includes("refacturación") || !hoja407.includes("2.194,33")) {
  throw new Error("40726 no muestra la refacturación o la retención");
}
await page.click('tr[data-hoja="40726"] summary');
const arcaShot = await shot("liquidacion-40726.png");

const xls = `<html><head>
<link id="shLink" href="FACTURACION_archivos/sheet001.htm">
<script>var c_rgszSh=new Array(1);c_rgszSh[0]="10126";</script>
</head><body></body></html>`;
const htm = `<html><body><table>
<tr><td>Fecha</td><td>Mut</td><td>Practica</td><td>Honor</td><td>Gasto</td></tr>
<tr><td>1/1/2026</td><td>130</td><td>999001</td><td>100.00</td><td>50.00</td></tr>
</table></body></html>`;
const zip = zipSync({
  "FACTURACION.xls": strToU8(xls),
  "FACTURACION_archivos/sheet001.htm": strToU8(htm),
});
const zipPath = "/tmp/facturacion-10126.zip";
writeFileSync(zipPath, zip);

await ir("/?vista=importar");
const input = await page.$('#zona-importar input[type="file"]');
await input.uploadFile(zipPath);
await page.waitForFunction(() => document.body.innerText.includes("Se reemplazaron"));
const importado = await page.$eval("#resultado-importar", (n) => n.innerText);
if (!importado.includes("1 período de facturación")) throw new Error(importado);

const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("socmed-liquidacion-v1")));
const practicas = guardado.facturacion["10126"];
if (practicas.length !== 1 || practicas[0].practica !== "999001" || practicas[0].honor !== 10000 || practicas[0].gasto !== 5000) {
  throw new Error("la reimportación no reemplazó 10126");
}
if (!guardado.facturacion["10325"]?.length) throw new Error("importar facturación borró los otros períodos");
if (!guardado.liquidacion["40726"]) throw new Error("importar facturación borró la liquidación");
await ir("/?vista=cobrado&facturado=10325&obra=109");
await page.waitForSelector('tbody[data-hoja="10325"][data-mut="109"]');

page.once("dialog", (dialog) => dialog.accept());
await ir("/");
await page.click("button.peligro");
await page.waitForFunction(() => document.body.innerText.includes("Está cargado el historial original."));
await ir("/?vista=pendiente&facturado=10126&obra=109");
await page.waitForSelector('tbody[data-hoja="10126"][data-mut="109"]');
const restaurado = await page.$eval('tbody[data-hoja="10126"][data-mut="109"]', (tr) => tr.dataset.liquidado);
if (restaurado !== "8777314") throw new Error("no volvió el historial original");

await page.setViewport({ width: 390, height: 844 });
await ir("/");
await page.waitForSelector("#conteo-cierran");
const movil = await shot("resumen-movil.png");

await browser.close();
if (errores.length) {
  console.error(errores.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ resumen, cobradoShot, pendienteShot, debitoShot, iaposShot, arcaShot, movil }, null, 2));
