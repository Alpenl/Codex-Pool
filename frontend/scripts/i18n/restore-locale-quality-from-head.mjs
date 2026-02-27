#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const localeFiles = [
  "src/locales/en.ts",
  "src/locales/zh-CN.ts",
  "src/locales/zh-TW.ts",
  "src/locales/ja.ts",
  "src/locales/ru.ts",
];

function parseLocaleText(text, filePath) {
  const transpiled = ts.transpileModule(text, {
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
  const obj = moduleRef.exports.default ?? moduleRef.exports;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error(`Failed to parse locale object: ${filePath}`);
  }
  return obj;
}

function parseLocaleFile(filePath) {
  return parseLocaleText(readFileSync(filePath, "utf8"), filePath);
}

function parseHeadLocale(relativePath) {
  const candidates = [relativePath, `frontend/${relativePath}`];
  for (const candidate of candidates) {
    try {
      const content = execSync(`git show HEAD:${candidate}`, { encoding: "utf8" });
      return parseLocaleText(content, candidate);
    } catch {
      // try next candidate
    }
  }
  throw new Error(`无法从 HEAD 读取词典文件: ${relativePath}`);
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeKeepCurrentShapeWithHeadValues(currentObj, headObj) {
  const out = Array.isArray(currentObj) ? [...currentObj] : { ...currentObj };

  for (const [key, currentValue] of Object.entries(currentObj)) {
    const headValue = headObj ? headObj[key] : undefined;
    if (headValue === undefined) {
      continue;
    }

    if (isPlainObject(currentValue) && isPlainObject(headValue)) {
      out[key] = mergeKeepCurrentShapeWithHeadValues(currentValue, headValue);
      continue;
    }

    if (!isPlainObject(currentValue) && !Array.isArray(currentValue)) {
      out[key] = headValue;
    }
  }

  // Keep keys that exist in HEAD but not in current as additive restore.
  for (const [key, headValue] of Object.entries(headObj ?? {})) {
    if (out[key] !== undefined) {
      continue;
    }
    out[key] = headValue;
  }

  return out;
}

function isIdentifierKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function formatKey(key) {
  return isIdentifierKey(key) ? key : JSON.stringify(key);
}

function serializeValue(value, indentLevel = 0) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const indent = "    ".repeat(indentLevel);
    const childIndent = "    ".repeat(indentLevel + 1);
    const items = value.map((item) => `${childIndent}${serializeValue(item, indentLevel + 1)}`).join(",\n");
    return `[\n${items}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }
  const indent = "    ".repeat(indentLevel);
  const childIndent = "    ".repeat(indentLevel + 1);
  const body = entries
    .map(([key, entryValue]) => `${childIndent}${formatKey(key)}: ${serializeValue(entryValue, indentLevel + 1)}`)
    .join(",\n");
  return `{\n${body}\n${indent}}`;
}

function main() {
  for (const relative of localeFiles) {
    const absolute = path.join(root, relative);
    const currentObj = parseLocaleFile(absolute);
    const headObj = parseHeadLocale(relative);
    const merged = mergeKeepCurrentShapeWithHeadValues(currentObj, headObj);
    writeFileSync(absolute, `export default ${serializeValue(merged, 0)}\n`, "utf8");
    console.log(`restored: ${relative}`);
  }
}

main();
