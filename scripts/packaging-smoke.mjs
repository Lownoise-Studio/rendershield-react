#!/usr/bin/env node
/**
 * Packaging smoke test for @lownoise-studio/render-shield-react.
 * Builds, packs, installs the tarball in a temp consumer, verifies exports/types/React peer.
 * Never publishes.
 */
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const EXPECTED_NAME = "@lownoise-studio/render-shield-react";
const ALLOWED_PREFIXES = ["package.json", "LICENSE", "README.md", "dist/"];
const EXPECTED_EXPORTS = [
  "useRenderShield",
  "useRenderShieldReport",
  "withRenderShield",
  "getShallowDiff",
  "compareWatchedPaths",
  "getAtPath",
  "deepEqual",
];
const FORBIDDEN_EXPORTS = [
  "report",
  "trackShieldEvaluation",
  "resetReportStateForTests",
  "getReportBatchKey",
  "shouldSurfaceRecommendations",
];

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}\n${detail}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanup(paths) {
  for (const p of paths) {
    try {
      if (p && existsSync(p)) rmSync(p, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

const tempDirs = [];
let tarballPath = null;

try {
  console.log("[packaging-smoke] build");
  run("npm", ["run", "build"], { cwd: root });

  console.log("[packaging-smoke] npm pack --json");
  const pack = run("npm", ["pack", "--json"], { cwd: root });
  const packJson = JSON.parse(pack.stdout.trim());
  const packInfo = Array.isArray(packJson) ? packJson[0] : packJson;
  assert(packInfo?.filename, "npm pack did not return a filename");
  tarballPath = join(root, packInfo.filename);

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert(packInfo.name === EXPECTED_NAME, `Unexpected pack name: ${packInfo.name}`);
  assert(packInfo.version === pkg.version, `Pack version ${packInfo.version} != ${pkg.version}`);
  assert(pkg.name === EXPECTED_NAME, `package.json name drift: ${pkg.name}`);
  assert(!pkg.bin, "Package must not expose a bin (not a CLI)");
  assert(pkg.peerDependencies?.react === ">=18", "React peer must remain >=18");
  assert(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, "Unexpected runtime dependencies");

  const files = packInfo.files?.map((f) => f.path || f) ?? [];
  assert(files.length > 0, "Pack file list empty");
  for (const file of files) {
    const ok = ALLOWED_PREFIXES.some(
      (prefix) => file === prefix || file.startsWith(prefix)
    );
    assert(ok, `Unexpected tarball file: ${file}`);
  }
  assert(
    !files.some((f) => String(f).includes("node_modules")),
    "Tarball must not include node_modules"
  );

  const consumerDir = mkdtempSync(join(tmpdir(), "rsr-consumer-"));
  tempDirs.push(consumerDir);
  console.log("[packaging-smoke] consumer dir", consumerDir);

  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "rsr-packaging-consumer",
        private: true,
        type: "module",
        dependencies: {
          [EXPECTED_NAME]: `file:${tarballPath.replace(/\\/g, "/")}`,
          react: "^19.0.0",
          "react-dom": "^19.0.0",
        },
        devDependencies: {
          typescript: "^5.8.0",
          "@types/react": "^19.0.0",
          "@types/react-dom": "^19.0.0",
        },
      },
      null,
      2
    )
  );

  run("npm", ["install", "--no-fund", "--no-audit"], { cwd: consumerDir });

  const installedPkgPath = join(
    consumerDir,
    "node_modules",
    "@lownoise-studio",
    "render-shield-react",
    "package.json"
  );
  const installedPkg = JSON.parse(readFileSync(installedPkgPath, "utf8"));
  assert(installedPkg.name === EXPECTED_NAME, "Installed package name mismatch");
  assert(installedPkg.version === pkg.version, "Installed package version mismatch");
  assert(
    installedPkg.peerDependencies?.react === ">=18",
    "Installed peerDependencies.react drifted"
  );

  // ESM import
  const esmUrl = pathToFileURL(
    join(
      consumerDir,
      "node_modules",
      "@lownoise-studio",
      "render-shield-react",
      "dist",
      "index.mjs"
    )
  ).href;
  const esm = await import(esmUrl);
  for (const key of EXPECTED_EXPORTS) {
    assert(typeof esm[key] === "function", `ESM missing export: ${key}`);
  }
  for (const key of FORBIDDEN_EXPORTS) {
    assert(!(key in esm), `Internal symbol accidentally exported (ESM): ${key}`);
  }

  // CJS require from a CJS helper
  const cjsHelper = join(consumerDir, "require-cjs.cjs");
  writeFileSync(
    cjsHelper,
    `
const mod = require("@lownoise-studio/render-shield-react");
const expected = ${JSON.stringify(EXPECTED_EXPORTS)};
const forbidden = ${JSON.stringify(FORBIDDEN_EXPORTS)};
for (const key of expected) {
  if (typeof mod[key] !== "function") {
    console.error("CJS missing", key);
    process.exit(1);
  }
}
for (const key of forbidden) {
  if (key in mod) {
    console.error("CJS leaked", key);
    process.exit(1);
  }
}
console.log("CJS_OK");
`
  );
  const cjsResult = run("node", [cjsHelper], { cwd: consumerDir });
  assert(cjsResult.stdout.includes("CJS_OK"), "CJS require verification failed");

  // Confirm React is peer-resolved from consumer, not duplicated inside package
  const pkgNodeModules = join(
    consumerDir,
    "node_modules",
    "@lownoise-studio",
    "render-shield-react",
    "node_modules"
  );
  if (existsSync(pkgNodeModules)) {
    const nested = readdirSync(pkgNodeModules);
    assert(
      !nested.includes("react") && !nested.includes("react-dom"),
      `Nested React copy found under package: ${nested.join(",")}`
    );
  }

  const consumerRequire = createRequire(join(consumerDir, "package.json"));
  const reactFromConsumer = consumerRequire.resolve("react");
  assert(
    reactFromConsumer.includes(`${join("node_modules", "react")}`),
    "React should resolve from consumer node_modules"
  );

  // TypeScript consumer with skipLibCheck: false
  const tsDir = join(consumerDir, "ts-consumer");
  mkdirSync(tsDir, { recursive: true });
  writeFileSync(
    join(tsDir, "tsconfig.json"),
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
          types: ["react"],
        },
        include: ["./**/*.tsx"],
      },
      null,
      2
    )
  );
  writeFileSync(
    join(tsDir, "App.tsx"),
    `
import React from "react";
import {
  useRenderShield,
  withRenderShield,
  getShallowDiff,
  compareWatchedPaths,
  getAtPath,
  deepEqual,
  type RenderShieldOptions,
  type RenderShieldDiff,
} from "@lownoise-studio/render-shield-react";

type Props = { id: number; label: string };

function Base(props: Props) {
  const shielded = useRenderShield(props, {
    watch: ["id"],
    debug: false,
    shield: true,
  } satisfies RenderShieldOptions<Props>);
  return <div>{shielded.id}:{props.label}</div>;
}

const Shielded = withRenderShield(Base, { watch: ["id"] });

const diff = getShallowDiff({ a: 1 }, { a: 1 });
const watched = compareWatchedPaths({ user: { id: 1 } }, { user: { id: 1 } }, ["user.id"]);
const at = getAtPath({ user: { id: 1 } }, "user.id");
const eq = deepEqual({ x: 1 }, { x: 1 });

export function App() {
  const _unused: RenderShieldDiff | undefined = undefined;
  void _unused;
  void diff;
  void watched;
  void at;
  void eq;
  return <Shielded id={1} label="ok" />;
}
`
  );

  const tscBin = join(consumerDir, "node_modules", "typescript", "bin", "tsc");
  run("node", [tscBin, "-p", tsDir], { cwd: consumerDir });

  // Representative React consumer (mounted component — no bare hook calls)
  writeFileSync(
    join(consumerDir, "react-smoke.mjs"),
    `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useRenderShield, withRenderShield, getShallowDiff } from "@lownoise-studio/render-shield-react";

function Inner(props) {
  const value = useRenderShield(props, { watch: ["id"] });
  return React.createElement("span", null, String(value.id));
}

const Wrapped = withRenderShield(function Card(props) {
  return React.createElement("div", null, props.id);
}, { watch: ["id"] });

const html = renderToStaticMarkup(
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Inner, { id: 7, noise: Date.now() }),
    React.createElement(Wrapped, { id: 7, meta: { t: 1 } })
  )
);

if (!html.includes("7")) {
  console.error("Unexpected markup", html);
  process.exit(1);
}

const shallow = getShallowDiff({ a: 1 }, { a: 1 });
if (!shallow.equal) {
  console.error("shallow compare failed");
  process.exit(1);
}

console.log("REACT_OK");
`
  );
  const reactSmoke = run("node", [join(consumerDir, "react-smoke.mjs")], {
    cwd: consumerDir,
  });
  assert(reactSmoke.stdout.includes("REACT_OK"), "React consumer smoke failed");

  console.log("[packaging-smoke] PASS");
  console.log(
    JSON.stringify(
      {
        name: packInfo.name,
        version: packInfo.version,
        filename: packInfo.filename,
        fileCount: files.length,
        sizeBytes: packInfo.size ?? packInfo.packedSize,
        exports: EXPECTED_EXPORTS,
      },
      null,
      2
    )
  );
} catch (err) {
  console.error("[packaging-smoke] FAIL");
  console.error(err);
  process.exitCode = 1;
} finally {
  cleanup([...tempDirs, tarballPath].filter(Boolean));
}
