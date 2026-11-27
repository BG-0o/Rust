// Same banner as Sunbird's web/tools/bundle-plugins.ts, from each plugin's manifest.ts.
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
const ESB = process.env.ESBUILD ?? "esbuild";
const root = fileURLToPath(new URL("./plugins/", import.meta.url));
const out = process.argv[2];
const names = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const banner = (m) => {
  const g = m.permissions ?? {};
  return [
    `// @description ${m.description}`, `// @version ${m.version}`, `// @author ${m.author}`,
    m.enabled === false && "// @enabled false", m.warning && `// @warning ${m.warning}`,
    m.unlisted && "// @unlisted", m.minSunbird && `// @min-sunbird ${m.minSunbird}`,
    g.gateway?.length && `// @gateway ${g.gateway.join(" ")}`,
    g.gatewaySend?.length && `// @gateway-send ${g.gatewaySend.join(" ")}`,
    ...(g.discord ?? []).map((r) => `// @discord ${r}`),
    g.fetch?.length && `// @fetch ${g.fetch.join(" ")}`,
    g.stores && "// @stores", g.messages && "// @messages", g.bridge && "// @bridge", g.uiTree && "// @ui-tree",
  ].filter((l) => typeof l === "string").join("\n");
};
for (const name of names) {
  const tmp = `${out}/.manifest-${name}.mjs`;
  execFileSync(ESB, [`${root}${name}/manifest.ts`, "--format=esm", `--outfile=${tmp}`, "--log-level=error"]);
  const m = (await import(`${pathToFileURL(tmp).href}?${Date.now()}`)).default;
  rmSync(tmp);
  execFileSync(ESB, [`${root}${name}/src/index.ts`, "--bundle", "--format=iife", "--target=es2023", "--log-level=warning", `--banner:js=${banner(m)}`, `--outfile=${out}/${name}.js`], { stdio: "inherit" });
}
console.log("built", names.length);
