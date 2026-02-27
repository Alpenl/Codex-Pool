#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const srcRoot = path.join(root, "src");
const localeFiles = [
  "src/locales/en.ts",
  "src/locales/zh-CN.ts",
  "src/locales/zh-TW.ts",
  "src/locales/ja.ts",
  "src/locales/ru.ts",
];
const includeDirs = [
  path.join(srcRoot, "pages"),
  path.join(srcRoot, "tenant"),
  path.join(srcRoot, "components"),
  path.join(srcRoot, "features"),
];
const ignoredDirs = new Set(["locales", "node_modules", "dist", "build", "__tests__", "__mocks__"]);

function isIdentifierKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function formatKey(key) {
  return isIdentifierKey(key) ? key : JSON.stringify(key);
}

function serializeValue(value, indentLevel = 1) {
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
    const nextIndent = "    ".repeat(indentLevel + 1);
    const items = value.map((item) => `${nextIndent}${serializeValue(item, indentLevel + 1)}`).join(",\n");
    return `[\n${items}\n${indent}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return "{}";
    }
    const indent = "    ".repeat(indentLevel);
    const nextIndent = "    ".repeat(indentLevel + 1);
    const body = entries
      .map(([key, entryValue]) => `${nextIndent}${formatKey(key)}: ${serializeValue(entryValue, indentLevel + 1)}`)
      .join(",\n");
    return `{\n${body}\n${indent}}`;
  }

  return JSON.stringify(String(value));
}

function parseLocaleObject(filePath) {
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

  const exported = moduleRef.exports.default ?? moduleRef.exports;
  if (!exported || typeof exported !== "object" || Array.isArray(exported)) {
    throw new Error(`无法解析 locale 文件对象: ${filePath}`);
  }
  return exported;
}

function writeLocaleObject(filePath, localeObject) {
  const text = `export default ${serializeValue(localeObject, 0)}\n`;
  writeFileSync(filePath, text, "utf8");
}

function collectLeafKeys(obj, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      collectLeafKeys(value, full, out);
      continue;
    }
    out.add(full);
  }
  return out;
}

function collectFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) {
      continue;
    }
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      collectFiles(abs, out);
      continue;
    }
    if (abs.endsWith(".ts") || abs.endsWith(".tsx")) {
      out.push(abs);
    }
  }
  return out;
}

function isTranslateCall(callExpr) {
  const expr = callExpr.expression;
  if (ts.isIdentifier(expr)) {
    return expr.text === "t";
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text === "t";
  }
  return false;
}

function extractStringLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function getPropertyName(node) {
  if (!node) {
    return null;
  }
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node)
  ) {
    return node.text;
  }
  if (ts.isComputedPropertyName(node)) {
    return extractStringLiteral(node.expression);
  }
  return null;
}

function extractDefaultValue(optionsNode) {
  if (!optionsNode || !ts.isObjectLiteralExpression(optionsNode)) {
    return null;
  }
  for (const prop of optionsNode.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue;
    }
    const name = getPropertyName(prop.name);
    if (name !== "defaultValue") {
      continue;
    }
    return extractStringLiteral(prop.initializer);
  }
  return null;
}

function collectRuntimeKeyDefaults(files) {
  const map = new Map();

  for (const filePath of files) {
    const content = readFileSync(filePath, "utf8");
    const source = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    function walk(node) {
      if (ts.isCallExpression(node) && isTranslateCall(node) && node.arguments.length > 0) {
        const key = extractStringLiteral(node.arguments[0]);
        if (key) {
          const defaultValue = extractDefaultValue(node.arguments[1]);
          const entry = map.get(key);
          if (!entry) {
            map.set(key, {
              defaultValue,
              refs: [filePath],
            });
          } else {
            entry.refs.push(filePath);
            if (!entry.defaultValue && defaultValue) {
              entry.defaultValue = defaultValue;
            }
          }
        }
      }
      ts.forEachChild(node, walk);
    }

    walk(source);
  }

  return map;
}

function toSentenceCase(text) {
  if (!text) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function humanizeKey(key) {
  const tail = key.split(".").at(-1) ?? key;
  const text = tail
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return toSentenceCase(text || "value");
}

function setNested(obj, dottedKey, value) {
  const parts = dottedKey.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  const leaf = parts[parts.length - 1];
  if (cursor[leaf] === undefined) {
    cursor[leaf] = value;
    return true;
  }
  return false;
}

function main() {
  const localeObjects = localeFiles.map((relative) => {
    const absolute = path.join(root, relative);
    return { relative, absolute, data: parseLocaleObject(absolute) };
  });

  const enLocale = localeObjects.find((item) => item.relative.endsWith("/en.ts"));
  if (!enLocale) {
    throw new Error("缺少 en.ts 词典");
  }

  const runtimeFiles = includeDirs.flatMap((dir) => collectFiles(dir));
  const runtimeKeyDefaults = collectRuntimeKeyDefaults(runtimeFiles);
  const enKeys = collectLeafKeys(enLocale.data);

  const missing = [...runtimeKeyDefaults.keys()].filter((key) => !enKeys.has(key)).sort();
  if (missing.length === 0) {
    console.log("No missing runtime keys to fill.");
    return;
  }

  let applied = 0;
  for (const key of missing) {
    const fallback = runtimeKeyDefaults.get(key)?.defaultValue ?? humanizeKey(key);
    for (const locale of localeObjects) {
      if (setNested(locale.data, key, fallback)) {
        applied += 1;
      }
    }
  }

  for (const locale of localeObjects) {
    writeLocaleObject(locale.absolute, locale.data);
  }

  console.log(`MISSING_KEYS=${missing.length}`);
  console.log(`WRITES=${applied}`);
  for (const key of missing) {
    console.log(`- ${key}`);
  }
}

main();
