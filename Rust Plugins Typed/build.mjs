// Bundles plugins like Sunbird's web/tools/bundle-plugins.ts. The banner carries both permission
// formats: `@permissions` (Sunbird after 27 Nov 2026, from manifest.ts) and the per-route lines
// the builds from earlier that day read (from _lib/legacy-permissions.json). Each runtime ignores
// the other's lines.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ESB = process.env.ESBUILD ?? "esbuild";
const root = fileURLToPath(new URL("./plugins/", import.meta.url));
const legacy = JSON.parse(readFileSync(`${root}_lib/legacy-permissions.json`, "utf8"));
const [out, ...names] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const banner = (m, l = {}) =>
  [
    `// @description ${m.description}`,
    `// @version ${m.version}`,
    `// @author ${m.author}`,
    m.enabled === false && "// @enabled false",
    m.warning && `// @warning ${m.warning}`,
    m.unlisted && "// @unlisted",
    m.minSunbird && `// @min-sunbird ${m.minSunbird}`,
    (m.permissions ?? []).length > 0 && `// @permissions ${m.permissions.join(" ")}`,
    l.gateway?.length && `// @gateway ${l.gateway.join(" ")}`,
    l.gatewaySend?.length && `// @gateway-send ${l.gatewaySend.join(" ")}`,
    ...(l.discord ?? []).map((r) => `// @discord ${r}`),
    l.stores && "// @stores",
    l.messages && "// @messages",
    l.uiTree && "// @ui-tree",
  ]
    .filter((line) => typeof line === "string")
    .join("\n");

for (const name of names) {
  const tmp = `${out}/.manifest-${name}.mjs`;
  execFileSync(ESB, [`${root}${name}/manifest.ts`, "--format=esm", `--outfile=${tmp}`, "--log-level=error"]);
  const manifest = (await import(`${pathToFileURL(tmp).href}?${Date.now()}`)).default;
  rmSync(tmp);
  execFileSync(
    ESB,
    [`${root}${name}/src/index.ts`, "--bundle", "--format=iife", "--target=es2023", "--log-level=warning",
      `--banner:js=${banner(manifest, legacy[name])}`, `--outfile=${out}/${name}.js`],
    { stdio: "inherit" },
  );
}
console.log("built", names.length);
