#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const localeFiles = {
  en: "src/locales/en.ts",
  "zh-CN": "src/locales/zh-CN.ts",
  "zh-TW": "src/locales/zh-TW.ts",
  ja: "src/locales/ja.ts",
  ru: "src/locales/ru.ts",
};

const targets = ["zh-CN", "zh-TW", "ja", "ru"];

function parseLocale(filePath) {
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

  const obj = moduleRef.exports.default ?? moduleRef.exports;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error(`Failed to parse locale file: ${filePath}`);
  }
  return obj;
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
    const body = value
      .map((item) => `${childIndent}${serializeValue(item, indentLevel + 1)}`)
      .join(",\n");
    return `[\n${body}\n${indent}]`;
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

function setNested(obj, dottedKey, value) {
  const parts = dottedKey.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function shouldSkipTranslation(text) {
  if (!text.trim()) {
    return true;
  }
  if (/^[A-Z0-9_]{1,5}$/.test(text)) {
    return true;
  }
  if (/^\{\{[^}]+\}\}$/.test(text.trim())) {
    return true;
  }
  return false;
}

function protectText(text) {
  const tokens = [];
  let next = text;

  const replacers = [
    /\{\{\s*[\w.]+\s*\}\}/g,
    /<code>.*?<\/code>/g,
    /`[^`]*`/g,
  ];

  for (const regex of replacers) {
    next = next.replace(regex, (match) => {
      const token = `__PH_${tokens.length}__`;
      tokens.push({ token, value: match });
      return token;
    });
  }

  return { text: next, tokens };
}

function unprotectText(text, tokens) {
  let next = text;
  for (const { token, value } of tokens) {
    next = next.replaceAll(token, value);
  }
  return next;
}

async function translateText(text, target) {
  const { text: protectedText, tokens } = protectText(text);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(protectedText)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`translate failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const translated = (data?.[0] ?? []).map((segment) => segment?.[0] ?? "").join("");
  return unprotectText(translated || text, tokens);
}

async function translateBatch(uniqueTexts, target, concurrency = 5) {
  const translations = new Map();
  const queue = [...uniqueTexts];

  async function worker() {
    while (queue.length > 0) {
      const text = queue.shift();
      if (!text) {
        break;
      }
      try {
        const translated = await translateText(text, target);
        translations.set(text, translated);
      } catch {
        translations.set(text, text);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return translations;
}

async function main() {
  const localeObjects = Object.fromEntries(
    Object.entries(localeFiles).map(([lang, filePath]) => [lang, parseLocale(filePath)])
  );

  const enLeaves = collectLeaves(localeObjects.en);
  let totalUpdates = 0;

  for (const target of targets) {
    const targetObj = localeObjects[target];
    const targetLeaves = collectLeaves(targetObj);
    const sameKeys = [];
    const uniqueTexts = new Set();

    for (const [key, value] of targetLeaves.entries()) {
      const enValue = enLeaves.get(key);
      if (enValue !== value) {
        continue;
      }
      if (shouldSkipTranslation(value)) {
        continue;
      }
      sameKeys.push(key);
      uniqueTexts.add(value);
    }

    if (sameKeys.length === 0) {
      console.log(`[${target}] no updates`);
      continue;
    }

    console.log(`[${target}] translating ${sameKeys.length} keys (${uniqueTexts.size} unique strings)...`);
    const dictionary = await translateBatch(uniqueTexts, target);

    let updates = 0;
    for (const key of sameKeys) {
      const current = targetLeaves.get(key);
      const translated = dictionary.get(current) ?? current;
      if (translated && translated !== current) {
        setNested(targetObj, key, translated);
        updates += 1;
      }
    }

    writeFileSync(localeFiles[target], `export default ${serializeValue(targetObj, 0)}\n`, "utf8");
    console.log(`[${target}] updated ${updates}`);
    totalUpdates += updates;
  }

  console.log(`TOTAL_UPDATES=${totalUpdates}`);
}

await main();
