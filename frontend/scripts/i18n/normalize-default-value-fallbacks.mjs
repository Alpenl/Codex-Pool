#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const localePath = path.join(root, "src/locales/en.ts");
const files = [
  "src/tenant/pages/BillingPage.tsx",
  "src/pages/Tenants.tsx",
  "src/pages/Accounts.tsx",
  "src/tenant/pages/ApiKeysPage.tsx",
  "src/tenant/pages/UsagePage.tsx",
  "src/features/accounts/account-detail-dialog.tsx",
  "src/features/accounts/use-accounts-columns.tsx",
  "src/features/import-jobs/panels.tsx",
  "src/pages/ImportJobs.tsx",
  "src/features/accounts/rate-limit-cell.tsx",
  "src/features/accounts/utils.ts",
  "src/components/layout/AppLayout.tsx",
];

function getPropertyName(node) {
  if (!node) {
    return null;
  }
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.text;
  }
  if (ts.isComputedPropertyName(node)) {
    const expr = node.expression;
    if (
      ts.isStringLiteral(expr) ||
      ts.isNumericLiteral(expr) ||
      ts.isNoSubstitutionTemplateLiteral(expr)
    ) {
      return expr.text;
    }
  }
  return null;
}

function getDefaultExportObject(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && ts.isObjectLiteralExpression(statement.expression)) {
      return statement.expression;
    }
  }
  return null;
}

function collectStringLeaves(objectLiteral, prefix = "", map = new Map()) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const key = getPropertyName(property.name);
    if (!key) {
      continue;
    }
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const init = property.initializer;

    if (ts.isObjectLiteralExpression(init)) {
      collectStringLeaves(init, fullKey, map);
      continue;
    }

    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      map.set(fullKey, init.text);
    }
  }
  return map;
}

function loadEnglishMap() {
  const content = readFileSync(localePath, "utf8");
  const sourceFile = ts.createSourceFile(
    localePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const objectLiteral = getDefaultExportObject(sourceFile);
  if (!objectLiteral) {
    throw new Error("Failed to parse default export object from en.ts");
  }
  return collectStringLeaves(objectLiteral);
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function humanizeKey(key) {
  const last = key.split(".").at(-1) ?? key;
  const spaced = last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) {
    return "Value";
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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

function toStringLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function escapeForQuote(text, quote) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(new RegExp(quote, "g"), `\\${quote}`)
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function replaceInFile(file, englishMap) {
  const filePath = path.join(root, file);
  const content = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const replacements = [];

  function walk(node) {
    if (ts.isCallExpression(node) && isTranslateCall(node) && node.arguments.length >= 2) {
      const key = toStringLiteral(node.arguments[0]);
      const options = node.arguments[1];
      if (key && ts.isObjectLiteralExpression(options)) {
        for (const prop of options.properties) {
          if (!ts.isPropertyAssignment(prop)) {
            continue;
          }
          const propName = getPropertyName(prop.name);
          if (propName !== "defaultValue") {
            continue;
          }

          const init = prop.initializer;
          if (!ts.isStringLiteral(init) && !ts.isNoSubstitutionTemplateLiteral(init)) {
            continue;
          }
          if (!hasCjk(init.text)) {
            continue;
          }

          const english = englishMap.get(key) ?? humanizeKey(key);
          const original = init.getText(sourceFile);
          const quote = original.startsWith("\"")
            ? "\""
            : original.startsWith("`")
              ? "`"
              : "'";
          const replaced = `${quote}${escapeForQuote(english, quote)}${quote}`;
          if (replaced !== original) {
            replacements.push({
              start: init.getStart(sourceFile),
              end: init.getEnd(),
              text: replaced,
            });
          }
        }
      }
    }

    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  if (replacements.length === 0) {
    return 0;
  }

  replacements.sort((a, b) => b.start - a.start);
  let next = content;
  for (const replacement of replacements) {
    next =
      next.slice(0, replacement.start) +
      replacement.text +
      next.slice(replacement.end);
  }
  writeFileSync(filePath, next, "utf8");
  return replacements.length;
}

function main() {
  const englishMap = loadEnglishMap();
  let total = 0;

  for (const file of files) {
    const count = replaceInFile(file, englishMap);
    total += count;
    console.log(`${file}: ${count}`);
  }

  console.log(`TOTAL_REPLACEMENTS=${total}`);
}

main();
