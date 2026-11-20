import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pub = join(root, "public");

await rm(pub, { recursive: true, force: true });
await mkdir(pub, { recursive: true });

await cp(join(root, "index.html"), join(pub, "index.html"));
await cp(join(root, "css"), join(pub, "css"), { recursive: true });
await cp(join(root, "dist"), join(pub, "dist"), { recursive: true });
await mkdir(join(pub, "data"), { recursive: true });
await cp(join(root, "data", "historico.json"), join(pub, "data", "historico.json"));
await cp(join(root, "vendor"), join(pub, "vendor"), { recursive: true });
