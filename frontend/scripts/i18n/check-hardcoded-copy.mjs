#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "../..");
const srcRoot = path.join(frontendRoot, "src");
const baselineFilePath = path.join(__dirname, "hardcoded-baseline.json");
const baselineVersion = 1;

const defaultScanRoots = [
  path.join(srcRoot, "pages"),
  path.join(srcRoot, "features"),
  path.join(srcRoot, "tenant"),
  path.join(srcRoot, "components"),
];

const supportedExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const englishUiPhrases = new Set(["close", "cancel", "confirm", "dismiss notification"]);

function parseArgs(argv) {
  const args = {
    focus: [],
    noBaseline: false,
    writeBaseline: false,
  };

  for (const arg of argv) {
    if (arg === "--no-baseline") {
      args.noBaseline = true;
      continue;
    }
    if (arg === "--write-baseline") {
      args.writeBaseline = true;
      continue;
    }
    if (!arg.startsWith("--focus=")) {
      continue;
    }

    const raw = arg.slice("--focus=".length).trim();
    if (!raw) {
      continue;
    }

    args.focus = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return args;
}

function isPathExists(targetPath) {
  try {
    statSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveFocusTarget(focusEntry) {
  const candidates = [];

  if (path.isAbsolute(focusEntry)) {
    candidates.push(focusEntry);
  } else {
    candidates.push(path.resolve(srcRoot, focusEntry));
    candidates.push(path.resolve(frontendRoot, focusEntry));
  }

  for (const candidate of candidates) {
    if (isPathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function collectFiles(entryPath, output = []) {
  const stat = statSync(entryPath);
  if (stat.isFile()) {
    if (supportedExtensions.has(path.extname(entryPath))) {
      output.push(entryPath);
    }
    return output;
  }

  for (const dirent of readdirSync(entryPath, { withFileTypes: true })) {
    const childPath = path.join(entryPath, dirent.name);
    if (dirent.isDirectory()) {
      collectFiles(childPath, output);
      continue;
    }
    if (dirent.isFile() && supportedExtensions.has(path.extname(childPath))) {
      output.push(childPath);
    }
  }

  return output;
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isTrackedEnglishUiCopy(text) {
  return englishUiPhrases.has(normalizeText(text).toLowerCase());
}

function isUiCopy(text) {
  return cjkRegex.test(text) || isTrackedEnglishUiCopy(text);
}

function isTranslationCallee(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text === "t";
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === "t";
  }
  return false;
}

function hasAncestor(node, predicate) {
  let current = node.parent;
  while (current) {
    if (predicate(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isInsideJsx(node) {
  return hasAncestor(node, (ancestor) =>
    ts.isJsxElement(ancestor) ||
    ts.isJsxFragment(ancestor) ||
    ts.isJsxSelfClosingElement(ancestor) ||
    ts.isJsxExpression(ancestor) ||
    ts.isJsxAttribute(ancestor)
  );
}

function isInsideTranslationCall(node) {
  let current = node;
  while (current.parent) {
    if (ts.isCallExpression(current.parent) && current.parent.arguments.includes(current)) {
      return isTranslationCallee(current.parent.expression);
    }
    current = current.parent;
  }
  return false;
}

function getCalleeName(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return `${getCalleeName(expression.expression)}.${expression.name.text}`;
  }
  return "";
}

function isMessageSinkCall(expression) {
  const calleeName = getCalleeName(expression);
  if (!calleeName) {
    return false;
  }

  const firstSegment = calleeName.split(".")[0];
  if (["toast", "notification", "message"].includes(firstSegment)) {
    return true;
  }

  if (["alert", "confirm", "prompt", "setNotice", "setError", "setMessage"].includes(calleeName)) {
    return true;
  }

  return /^set(?:Notice|Error|Message|Toast|Alert)$/.test(calleeName);
}

function isInMessageSinkContext(node) {
  let current = node;
  while (current.parent) {
    if (ts.isCallExpression(current.parent) && current.parent.arguments.includes(current)) {
      return isMessageSinkCall(current.parent.expression);
    }
    current = current.parent;
  }
  return false;
}

function toLocation(sourceFile, position) {
  const point = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: point.line + 1, column: point.character + 1 };
}

function summarizeText(rawText) {
  const text = normalizeText(rawText);
  if (text.length <= 80) {
    return text;
  }
  return `${text.slice(0, 77)}...`;
}

function pushViolation(violations, filePath, sourceFile, node, kind, rawText) {
  const text = normalizeText(rawText);
  if (!text || !isUiCopy(text)) {
    return;
  }

  const { line, column } = toLocation(sourceFile, node.getStart(sourceFile));
  violations.push({
    filePath: path.relative(frontendRoot, filePath),
    line,
    column,
    kind,
    text,
    displayText: summarizeText(text),
  });
}

function scanFile(filePath, violations) {
  const content = readFileSync(filePath, "utf8");
  const ext = path.extname(filePath);
  const scriptKind = ext === ".tsx" ? ts.ScriptKind.TSX : ext === ".jsx" ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);

  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = normalizeText(node.getFullText(sourceFile));
      if (text) {
        pushViolation(violations, filePath, sourceFile, node, "jsx-text", text);
      }
      return;
    }

    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(sourceFile);
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        pushViolation(violations, filePath, sourceFile, node.initializer, `jsx-attr:${attrName}`, node.initializer.text);
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (ts.isJsxAttribute(node.parent)) {
        return;
      }
      if (isInsideTranslationCall(node)) {
        return;
      }
      if (isInsideJsx(node)) {
        pushViolation(violations, filePath, sourceFile, node, "jsx-expression", node.text);
        return;
      }
      if (isInMessageSinkContext(node)) {
        pushViolation(violations, filePath, sourceFile, node, "message-sink", node.text);
      }
    }

    if (ts.isTemplateExpression(node)) {
      if (isInsideTranslationCall(node)) {
        return;
      }
      const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("");
      if (isInsideJsx(node)) {
        pushViolation(violations, filePath, sourceFile, node, "jsx-template", text);
        return;
      }
      if (isInMessageSinkContext(node)) {
        pushViolation(violations, filePath, sourceFile, node, "message-template", text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function getScanEntries(focus) {
  if (focus.length === 0) {
    return defaultScanRoots;
  }

  const resolved = focus.map((entry) => ({ entry, resolvedPath: resolveFocusTarget(entry) }));
  const missing = resolved.filter((item) => !item.resolvedPath);

  if (missing.length > 0) {
    for (const item of missing) {
      console.error(`Focus target not found: ${item.entry}`);
    }
    process.exit(1);
  }

  return resolved.map((item) => item.resolvedPath);
}

function toViolationFingerprint(entry) {
  return `${entry.filePath}\u0000${entry.kind}\u0000${normalizeText(entry.text ?? "")}`;
}

function parseBaselineEntries(rawBaseline) {
  if (Array.isArray(rawBaseline)) {
    return rawBaseline;
  }
  if (rawBaseline && Array.isArray(rawBaseline.violations)) {
    return rawBaseline.violations;
  }
  throw new Error("Baseline file format invalid. Expected an array or { violations: [] }.");
}

function loadBaselineEntries() {
  if (!isPathExists(baselineFilePath)) {
    return [];
  }

  const baselineRaw = readFileSync(baselineFilePath, "utf8");
  const parsed = JSON.parse(baselineRaw);
  const entries = parseBaselineEntries(parsed);

  return entries
    .map((entry) => ({
      filePath: entry.filePath,
      kind: entry.kind,
      text: normalizeText(entry.text ?? ""),
    }))
    .filter((entry) => entry.filePath && entry.kind && entry.text);
}

function writeBaselineEntries(violations) {
  const payload = {
    version: baselineVersion,
    violations: violations.map((violation) => ({
      filePath: violation.filePath,
      line: violation.line,
      column: violation.column,
      kind: violation.kind,
      text: violation.text,
    })),
  };
  writeFileSync(baselineFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function splitNewViolations(violations, baselineEntries) {
  const baselineCounts = new Map();
  for (const entry of baselineEntries) {
    const key = toViolationFingerprint(entry);
    baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
  }

  const newViolations = [];
  let matchedBaselineCount = 0;

  for (const violation of violations) {
    const key = toViolationFingerprint(violation);
    const remaining = baselineCounts.get(key) ?? 0;
    if (remaining > 0) {
      matchedBaselineCount += 1;
      baselineCounts.set(key, remaining - 1);
      continue;
    }
    newViolations.push(violation);
  }

  return {
    newViolations,
    matchedBaselineCount,
  };
}

function reportViolations(header, violations) {
  console.error(header);
  for (const violation of violations) {
    console.error(
      `  - ${violation.filePath}:${violation.line}:${violation.column} [${violation.kind}] ${violation.displayText}`
    );
  }
}

function run() {
  const { focus, noBaseline, writeBaseline } = parseArgs(process.argv.slice(2));
  if (writeBaseline && focus.length > 0) {
    console.error("--write-baseline does not support --focus. Regenerate baseline from full scan only.");
    process.exit(1);
  }

  const strictMode = noBaseline || focus.length > 0;
  const scanEntries = getScanEntries(focus);

  const files = scanEntries
    .flatMap((entry) => collectFiles(entry))
    .filter((filePath, index, array) => array.indexOf(filePath) === index)
    .sort();

  const violations = [];
  for (const filePath of files) {
    scanFile(filePath, violations);
  }

  if (writeBaseline) {
    writeBaselineEntries(violations);
    console.log(`Baseline updated: ${path.relative(frontendRoot, baselineFilePath)} (${violations.length} issue(s)).`);
    return;
  }

  if (strictMode) {
    if (violations.length === 0) {
      console.log(`No hardcoded UI copy found in ${files.length} file(s).`);
      return;
    }

    reportViolations(`Found ${violations.length} hardcoded UI copy issue(s):`, violations);
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(`No hardcoded UI copy found in ${files.length} file(s).`);
    return;
  }

  let baselineEntries = [];
  try {
    baselineEntries = loadBaselineEntries();
  } catch (error) {
    console.error(`Failed to load baseline file: ${path.relative(frontendRoot, baselineFilePath)}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const { newViolations, matchedBaselineCount } = splitNewViolations(violations, baselineEntries);
  if (newViolations.length === 0) {
    console.log(
      `No new hardcoded UI copy found in ${files.length} file(s). ` +
        `${matchedBaselineCount} issue(s) matched baseline (${path.relative(frontendRoot, baselineFilePath)}).`
    );
    return;
  }

  reportViolations(
    `Found ${newViolations.length} new hardcoded UI copy issue(s) ` +
      `(total: ${violations.length}, baseline-matched: ${matchedBaselineCount}):`,
    newViolations
  );
  process.exit(1);
}

run();
