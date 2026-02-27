#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const srcRoot = path.join(root, "src");
const localePath = path.join(srcRoot, "locales/en.ts");

const ignoredDirs = new Set([
  "locales",
  "__tests__",
  "__mocks__",
  "dist",
  "build",
  "node_modules",
]);

function isAllowedUnresolvedExpression(fileRef, expression) {
  return fileRef.startsWith("src/lib/seo.ts:") && expression === "key";
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

function collectLeafKeys(objectLiteral, prefix = "", out = new Set()) {
  for (const property of objectLiteral.properties) {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isMethodDeclaration(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }

    const key = getPropertyName(property.name);
    if (!key) {
      continue;
    }

    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) {
      collectLeafKeys(property.initializer, fullKey, out);
      continue;
    }

    out.add(fullKey);
  }

  return out;
}

function loadLocaleKeys() {
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
    throw new Error("Failed to parse en locale default export object.");
  }
  return collectLeafKeys(objectLiteral);
}

function collectFiles(dir, out = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (ignoredDirs.has(entry)) {
      continue;
    }
    const abs = path.join(dir, entry);
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

function extractLiteralKey(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
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

function collectTemplateCandidates(prefix, suffix, localeKeys) {
  const out = [];
  for (const key of localeKeys) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) {
      continue;
    }
    if (key.length <= prefix.length + suffix.length) {
      continue;
    }
    out.push(key);
  }
  return out.sort();
}

function collectRuntimeKeys(filePath, localeKeys) {
  const content = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const out = [];
  const unresolved = [];

  function walk(node) {
    if (ts.isCallExpression(node) && isTranslateCall(node) && node.arguments.length > 0) {
      const firstArg = node.arguments[0];
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const key = extractLiteralKey(firstArg);
      if (key) {
        out.push({ key, line });
      } else if (ts.isTemplateExpression(firstArg)) {
        if (firstArg.templateSpans.length === 1) {
          const prefix = firstArg.head.text;
          const suffix = firstArg.templateSpans[0].literal.text;
          const candidates = collectTemplateCandidates(prefix, suffix, localeKeys);
          if (candidates.length === 0) {
            unresolved.push({
              line,
              expression: firstArg.getText(sourceFile),
              reason: "no locale key candidates matched",
            });
          } else {
            for (const candidate of candidates) {
              out.push({ key: candidate, line });
            }
          }
        } else {
          unresolved.push({
            line,
            expression: firstArg.getText(sourceFile),
            reason: "template expression has multiple dynamic segments",
          });
        }
      } else {
        unresolved.push({
          line,
          expression: firstArg.getText(sourceFile),
          reason: "non-literal key expression",
        });
      }
    }
    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  return { keys: out, unresolved };
}

function main() {
  const localeKeys = loadLocaleKeys();
  const files = collectFiles(srcRoot);

  const missing = new Map();
  const unresolved = [];

  for (const file of files) {
    const rel = path.relative(root, file);
    const result = collectRuntimeKeys(file, localeKeys);
    for (const item of result.keys) {
      if (!localeKeys.has(item.key)) {
        if (!missing.has(item.key)) {
          missing.set(item.key, []);
        }
        missing.get(item.key).push(`${rel}:${item.line}`);
      }
    }
    for (const item of result.unresolved) {
      const fileRef = `${rel}:${item.line}`;
      if (isAllowedUnresolvedExpression(fileRef, item.expression)) {
        continue;
      }
      unresolved.push({
        ref: fileRef,
        expression: item.expression,
        reason: item.reason,
      });
    }
  }

  const sorted = [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (sorted.length > 0) {
    console.log(`Missing runtime keys: ${sorted.length}`);
    for (const [key, refs] of sorted) {
      console.log(`- ${key}`);
      for (const ref of refs.slice(0, 8)) {
        console.log(`  * ${ref}`);
      }
      if (refs.length > 8) {
        console.log(`  * ... +${refs.length - 8} more`);
      }
    }
  }

  if (unresolved.length > 0) {
    console.log(`Unresolved dynamic runtime key expressions: ${unresolved.length}`);
    for (const item of unresolved.slice(0, 20)) {
      console.log(`- ${item.ref}`);
      console.log(`  * ${item.reason}`);
      console.log(`  * ${item.expression}`);
    }
    if (unresolved.length > 20) {
      console.log(`- ... +${unresolved.length - 20} more`);
    }
  }

  if (sorted.length === 0 && unresolved.length === 0) {
    console.log("No missing runtime i18n keys found.");
    return;
  }

  process.exitCode = 1;
}

main();
