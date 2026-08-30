#!/usr/bin/env node
/**
 * R2 consumer smoke: pack the package and prove ESM/CJS/TS/SSR against React majors.
 *
 * Usage:
 *   node scripts/smoke-consumers.mjs
 *   node scripts/smoke-consumers.mjs --react=18.3.1
 *   node scripts/smoke-consumers.mjs --react=19
 *   node scripts/smoke-consumers.mjs --react=18.3.1 --react=19
 *
 * Default: both 18.3.1 and latest 19.x.
 */
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG_NAME = "@lownoise-studio/render-shield-react";

const args = process.argv.slice(2);
const reactArgs = args
  .filter((a) => a.startsWith("--react="))
  .map((a) => a.slice("--react=".length));
const REACT_VERSIONS = reactArgs.length > 0 ? reactArgs : ["18.3.1", "19"];
const FROM_BUILT = args.includes("--from-built");
const SKIP_SOURCE = args.includes("--skip-source-tests") || FROM_BUILT;
function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  const result = spawnSync(cmd, {
    shell: true,
    encoding: "utf8",
    ...opts,
  });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    fail(`${cmd} (cwd=${opts.cwd || process.cwd()}) exited ${result.status}`);
  }
  return result;
}

function resolveReactDom(version) {
  if (version === "19" || version.startsWith("19.")) return version === "19" ? "^19.0.0" : version;
  if (version === "18.3.1" || version.startsWith("18.")) return version === "18.3.1" ? "18.3.1" : version;
  return version;
}

function resolveTypesReact(version) {
  if (String(version).startsWith("18")) return "^18.3.0";
  return "^19.0.0";
}

function assertNoNestedReact(pkgNodeModules) {
  const nested = join(pkgNodeModules, PKG_NAME, "node_modules", "react");
  if (existsSync(nested)) {
    fail(`nested React found under installed package: ${nested}`);
  }
}

function listTarballFiles(tgzPath) {
  const out = execSync(`tar -tzf "${tgzPath}"`, { encoding: "utf8" });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^package\//, ""));
}

function verifyTarballContents(files) {
  const allowedPrefixes = ["dist/", "README.md", "LICENSE", "package.json"];
  for (const f of files) {
    const ok = allowedPrefixes.some(
      (p) => f === p || (p.endsWith("/") && f.startsWith(p))
    );
    if (!ok) fail(`unexpected packed file: ${f}`);
  }
  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.js",
    "dist/index.mjs",
    "dist/index.d.ts",
  ]) {
    if (!files.includes(required)) fail(`missing packed file: ${required}`);
  }
  // No source trees
  if (files.some((f) => f.startsWith("src/"))) {
    fail("src/ leaked into package tarball");
  }
  log(`tarball OK (${files.length} paths)`);
}

function writeConsumerFiles(dir, { reactVersion, mode }) {
  mkdirSync(dir, { recursive: true });

  const reactSpec = resolveReactDom(reactVersion);
  const typesSpec = resolveTypesReact(reactVersion);

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `rs-consumer-${mode}`,
        private: true,
        type: mode === "esm" || mode === "ssr" || mode === "ts" ? "module" : "commonjs",
        dependencies: {},
      },
      null,
      2
    )
  );

  return { reactSpec, typesSpec };
}

function installConsumer(dir, tgzPath, reactSpec, extraDeps = []) {
  const deps = [
    tgzPath,
    `react@${reactSpec}`,
    `react-dom@${reactSpec}`,
    ...extraDeps,
  ];
  run(`npm install --no-fund --no-audit ${deps.map((d) => JSON.stringify(d)).join(" ")}`, {
    cwd: dir,
    env: { ...process.env, npm_config_package_lock: "false" },
  });
}

function runEsmSmoke(dir) {
  writeFileSync(
    join(dir, "smoke.mjs"),
    `
import * as RS from "${PKG_NAME}";
import React from "react";

const expected = [
  "withRenderShield",
  "useRenderShield",
  "useRenderShieldReport",
  "getShallowDiff",
  "compareWatchedPaths",
  "getAtPath",
  "deepEqual",
  "canonicalizePath",
];
for (const k of expected) {
  if (!(k in RS)) throw new Error("missing export: " + k);
}

const forbidden = ["report", "trackShieldEvaluation", "resetReportStateForTests", "shouldSurfaceRecommendations", "getReportBatchKey"];
for (const k of forbidden) {
  if (k in RS) throw new Error("internal export leaked: " + k);
}

function Base(props) {
  return React.createElement("div", null, props.id);
}
const Shielded = RS.withRenderShield(Base, { watch: ["id"] });
if (typeof Shielded !== "function" && typeof Shielded !== "object") {
  throw new Error("withRenderShield did not return a component");
}

const shallow = RS.getShallowDiff({ a: 1 }, { a: 1 });
if (!shallow.equal) throw new Error("getShallowDiff failed");

console.log("ESM_OK", Object.keys(RS).sort().join(","));
`
  );
  const r = run(`node smoke.mjs`, { cwd: dir });
  if (!String(r.stdout).includes("ESM_OK")) fail("ESM smoke missing ESM_OK");
  log("ESM consumer OK");
}

function runCjsSmoke(dir) {
  writeFileSync(
    join(dir, "smoke.cjs"),
    `
const RS = require("${PKG_NAME}");
const React = require("react");

const expected = [
  "withRenderShield",
  "useRenderShield",
  "useRenderShieldReport",
  "getShallowDiff",
  "compareWatchedPaths",
  "getAtPath",
  "deepEqual",
  "canonicalizePath",
];
for (const k of expected) {
  if (!(k in RS)) throw new Error("missing export: " + k);
}

const forbidden = ["report", "trackShieldEvaluation", "resetReportStateForTests", "shouldSurfaceRecommendations", "getReportBatchKey"];
for (const k of forbidden) {
  if (k in RS) throw new Error("internal export leaked: " + k);
}

function Base(props) {
  return React.createElement("div", null, props.id);
}
const Shielded = RS.withRenderShield(Base, { watch: ["id"] });
if (!Shielded) throw new Error("withRenderShield failed");

console.log("CJS_OK", Object.keys(RS).sort().join(","));
`
  );
  const r = run(`node smoke.cjs`, { cwd: dir });
  if (!String(r.stdout).includes("CJS_OK")) fail("CJS smoke missing CJS_OK");
  log("CJS consumer OK");
}

function runSsrSmoke(dir) {
  writeFileSync(
    join(dir, "ssr.mjs"),
    `
import React from "react";
import { renderToString } from "react-dom/server";
import {
  withRenderShield,
  useRenderShield,
  useRenderShieldReport,
} from "${PKG_NAME}";

function HookChild({ value }) {
  const shielded = useRenderShield(value, { watch: ["id"], visual: true, debug: true });
  return React.createElement("span", { "data-hook": "1" }, shielded.id);
}

function ReportChild({ value }) {
  const v = useRenderShieldReport(value, { watch: ["id"], visual: true, debug: true });
  return React.createElement("span", { "data-report": "1" }, v.id);
}

function Base(props) {
  return React.createElement("span", { "data-hoc": "1" }, props.id);
}
const Shielded = withRenderShield(Base, { watch: ["id"], visual: true, debug: true });

const value = { id: 42, meta: "ssr" };

const htmlHook = renderToString(React.createElement(HookChild, { value }));
const htmlReport = renderToString(React.createElement(ReportChild, { value }));
const htmlHoc = renderToString(React.createElement(Shielded, value));

if (!htmlHook.includes("42") || !htmlHook.includes("data-hook")) throw new Error("hook SSR failed: " + htmlHook);
if (!htmlReport.includes("42") || !htmlReport.includes("data-report")) throw new Error("report SSR failed: " + htmlReport);
if (!htmlHoc.includes("42") || !htmlHoc.includes("data-hoc")) throw new Error("hoc SSR failed: " + htmlHoc);

if (typeof document !== "undefined") {
  // In Node SSR this should stay undefined; if somehow present, toast must not run.
}

console.log("SSR_OK", htmlHook.length, htmlReport.length, htmlHoc.length);
`
  );
  const r = run(`node ssr.mjs`, { cwd: dir });
  if (!String(r.stdout).includes("SSR_OK")) fail("SSR smoke missing SSR_OK");
  log("SSR consumer OK (hydration not claimed)");
}

function runTsSmoke(dir, typesSpec) {
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          esModuleInterop: true,
          isolatedModules: true,
          types: ["react"],
        },
        include: ["src/**/*"],
      },
      null,
      2
    )
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "consumer.tsx"),
    `
import React from "react";
import {
  withRenderShield,
  useRenderShield,
  useRenderShieldReport,
  type RenderShieldOptions,
} from "${PKG_NAME}";

type Props = { id: number; label: string };

const options: RenderShieldOptions<Props> = {
  watch: ["id"],
  debug: false,
  customCompare: (prev, next) => prev.id === next.id,
};

function Base(props: Props) {
  return <div>{props.id}:{props.label}</div>;
}

const Shielded = withRenderShield(Base, options);

function HookUser(props: Props) {
  const shielded = useRenderShield(props, options);
  const reported = useRenderShieldReport(props, { watch: ["id"], customCompare: () => true });
  return (
    <>
      <Shielded {...shielded} />
      <span>{reported.label}</span>
    </>
  );
}

const _ok: React.FC = () => <HookUser id={1} label="x" />;
export { Shielded, HookUser, _ok };
`
  );

  run(
    `npm install --no-fund --no-audit typescript@^5.8.0 @types/react@${typesSpec} @types/react-dom@${typesSpec}`,
    { cwd: dir }
  );
  run(`npx tsc -p tsconfig.json`, { cwd: dir });
  log("TypeScript skipLibCheck:false OK");
}

function smokeReactVersion(tgzPath, reactVersion) {
  log(`--- React ${reactVersion} ---`);
  const base = mkdtempSync(join(tmpdir(), `rs-r2-${reactVersion}-`));
  try {
    const reactSpec = resolveReactDom(reactVersion);
    const typesSpec = resolveTypesReact(reactVersion);

    // Combined runtime consumer (ESM + CJS + SSR share one install)
    const runtimeDir = join(base, "runtime");
    writeConsumerFiles(runtimeDir, { reactVersion, mode: "esm" });
    installConsumer(runtimeDir, tgzPath, reactSpec);
    assertNoNestedReact(join(runtimeDir, "node_modules"));

    // Peer resolution: react should be hoisted at consumer root
    const require = createRequire(join(runtimeDir, "package.json"));
    const reactPkg = require("react/package.json");
    log(`resolved react@${reactPkg.version}`);
    if (String(reactVersion).startsWith("18") && !String(reactPkg.version).startsWith("18.")) {
      fail(`expected React 18.x, got ${reactPkg.version}`);
    }
    if (String(reactVersion).startsWith("19") && !String(reactPkg.version).startsWith("19.")) {
      fail(`expected React 19.x, got ${reactPkg.version}`);
    }

    runEsmSmoke(runtimeDir);
    runCjsSmoke(runtimeDir);
    runSsrSmoke(runtimeDir);

    // TS consumer (separate install for @types alignment)
    const tsDir = join(base, "ts");
    writeConsumerFiles(tsDir, { reactVersion, mode: "ts" });
    installConsumer(tsDir, tgzPath, reactSpec);
    assertNoNestedReact(join(tsDir, "node_modules"));
    runTsSmoke(tsDir, typesSpec);

    log(`React ${reactVersion} matrix PASS`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function main() {
  log(`root=${ROOT}`);
  log(`react versions: ${REACT_VERSIONS.join(", ")}`);

  const distPath = join(ROOT, "dist");

  if (!FROM_BUILT) {
    if (existsSync(distPath)) {
      rmSync(distPath, { recursive: true, force: true });
      log("removed existing dist/");
    }
  }

  if (!SKIP_SOURCE) {
    // Source unit tests must not require dist
    run(`npm run typecheck`, { cwd: ROOT });
    run(`npm run test:run`, { cwd: ROOT });
  }

  if (!existsSync(join(distPath, "index.js")) || !FROM_BUILT) {
    run(`npm run build`, { cwd: ROOT });
  } else {
    log("reusing existing dist/ (--from-built)");
  }

  // Pack
  for (const f of readdirSync(ROOT)) {
    if (f.endsWith(".tgz")) rmSync(join(ROOT, f), { force: true });
  }
  run(`npm pack`, { cwd: ROOT });
  const tgz = readdirSync(ROOT).find((f) => f.endsWith(".tgz"));
  if (!tgz) fail("npm pack produced no tarball");
  const tgzPath = join(ROOT, tgz);
  const files = listTarballFiles(tgzPath);
  verifyTarballContents(files);

  const size = readFileSync(tgzPath).byteLength;
  log(`packed ${tgz} (${size} bytes, ${files.length} entries)`);

  for (const v of REACT_VERSIONS) {
    smokeReactVersion(tgzPath, v);
  }

  // Cleanup tarball from workspace (keep dist for local inspection)
  rmSync(tgzPath, { force: true });
  log("ALL CONSUMER SMOKES PASSED");
}

main();
