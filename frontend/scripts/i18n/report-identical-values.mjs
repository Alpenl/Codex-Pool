#!/usr/bin/env node

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const locales = ["en", "zh-CN", "zh-TW", "ja", "ru"];

function parseLocale(name) {
  const filePath = `src/locales/${name}.ts`;
  const content = readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(content, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
    fileName: filePath,
  }).outputText;

  const moduleRef = { exports: {} };
  const sandbox = {
    module: moduleRef,
    exports: moduleRef.exports,
    require,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox, { filename: filePath });
  return moduleRef.exports.default ?? moduleRef.exports;
}

function collectLeaves(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      collectLeaves(value, full, out);
      continue;
    }
    out.set(full, String(value));
  }
  return out;
}

const enLeaves = collectLeaves(parseLocale("en"));

for (const locale of locales.slice(1)) {
  const leaves = collectLeaves(parseLocale(locale));
  const same = [];
  for (const [key, value] of leaves.entries()) {
    if (enLeaves.get(key) === value) {
      same.push(key);
    }
  }
  same.sort();
  console.log(`[${locale}] same as en: ${same.length}`);
  for (const key of same.slice(0, 200)) {
    console.log(`- ${key}`);
  }
  if (same.length > 200) {
    console.log(`... +${same.length - 200} more`);
  }
  console.log("");
}
