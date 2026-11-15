#!/usr/bin/env node
'use strict';

/**
 * CI guard: every NEW raw color or design-size literal in src/ fails.
 * An immutable Git commit represents the already-existing legacy debt.
 * No new baseline is created or rewritten by this command.
 *
 * Design values belong in src/shared/theme/tokens/; source TS/TSX should use
 * named tokens instead of inline numeric dimensions or color strings.
 * Semantic numbers (flex: 1, opacity: 0..1, numberOfLines, etc.) are exempt.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_COMMIT = 'b8e0250f5b7973b5798399d40fb67b1aa241dcbf';
const TOKEN_DIR = 'src/shared/theme/tokens/';
const SIZE_PROPS = new Set([
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'fontSize', 'lineHeight', 'letterSpacing',
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingHorizontal', 'paddingVertical', 'paddingStart', 'paddingEnd',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'gap', 'rowGap', 'columnGap',
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
  'borderWidth', 'borderTopWidth', 'borderBottomWidth',
  'borderLeftWidth', 'borderRightWidth',
  'top', 'bottom', 'left', 'right',
  'shadowRadius', 'shadowOffset', 'elevation',
]);
const COLOR_SYNTAX = /^(?:#[\da-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\s*\([^)]*\)|transparent|white|black|red|blue|green|gray|grey|yellow|pink|purple|orange)$/i;
const LENGTH_SYNTAX = /^-?\d+(?:\.\d+)?(?:px|dp|pt|rem|em|vh|vw)$/i;

function listSourceFiles(dir, result = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    const absolute = path.join(dir, name);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) listSourceFiles(absolute, result);
    else if (/\.tsx?$/.test(name) && !absolute.replaceAll(path.sep, '/').includes('/src/shared/theme/tokens/'))
      result.push(absolute);
  }
  return result;
}

function propertiesOf(node) {
  if (ts.isPropertyAssignment(node)) {
    if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
      return { name: node.name.text, expression: node.initializer };
  }
  if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer))
    return { name: node.name.text, expression: node.initializer.expression };
  return null;
}

function sourceHits(relativePath, content) {
  if (relativePath.startsWith(TOKEN_DIR)) return [];
  const source = ts.createSourceFile(relativePath, content, ts.ScriptTarget.Latest, true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const add = (kind, property, value, node) => {
    hits.push({
      key: [kind, property, value].join(':'),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  };
  // Color literals count anywhere in app code, including fallbacks in expressions.
  // Comments, import strings and words in plain copy do not match COLOR_SYNTAX.
  function scanColor(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        && COLOR_SYNTAX.test(node.text.trim()))
      add('color', 'literal', node.text, node);
    ts.forEachChild(node, scanColor);
  }
  scanColor(source);

  function scanSizes(node) {
    const assignment = propertiesOf(node);
    if (assignment && SIZE_PROPS.has(assignment.name) && assignment.expression) {
      const findDimension = (expr) => {
        if (ts.isNumericLiteral(expr)) {
          add('size', assignment.name, expr.text, expr);
        } else if ((ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
          && LENGTH_SYNTAX.test(expr.text.trim())) {
          add('size', assignment.name, expr.text, expr);
        } else {
          ts.forEachChild(expr, findDimension);
        }
      };
      findDimension(assignment.expression);
    }
    ts.forEachChild(node, scanSizes);
  }
  scanSizes(source);
  return hits;
}

function summarize(hits) {
  const counts = new Map();
  for (const hit of hits) counts.set(hit.key, (counts.get(hit.key) || 0) + 1);
  return counts;
}

function verify(actualByPath, baselineByPath) {
  const errors = [];
  for (const [file, hits] of actualByPath) {
    const existing = summarize(baselineByPath.get(file) || []);
    const encountered = new Map();
    for (const hit of hits) {
      const count = (encountered.get(hit.key) || 0) + 1;
      encountered.set(hit.key, count);
      if (count > (existing.get(hit.key) || 0))
        errors.push(file + ':' + hit.line + ' ' + hit.key);
    }
  }
  return errors;
}

function selfTest() {
  const name = 'src/features/demo/NewForm.tsx';
  const before = sourceHits(name,
    "const v = <View style={{ flex: 1, opacity: 0.7, paddingTop: spacing.lg, backgroundColor: colors.card }} />;");
  assert.equal(before.length, 0);
  const after = sourceHits(name,
    "const v = <View style={{ minHeight: 46, fontSize: narrow ? 14 : 16, backgroundColor: '#abc' }} />;");
  assert.equal(after.length, 4);
  assert.equal(verify(new Map([[name, after]]), new Map([[name, before]])).length, 4);
  assert.equal(verify(new Map([[name, after]]), new Map([[name, after]])).length, 0);
  const extra = sourceHits(name, "const x = <Text style={{ color: 'rgba(2, 3, 4, 0.5)' }} />;");
  assert.equal(extra.length, 1);
  const next = sourceHits(name, "const x = <Text style={{ minWidth: 48, borderWidth: 1 }} />;");
  assert.equal(next.length, 2);
  console.log('Token guard self-test passed (color, numeric sizes, conditional sizes, semantic exemptions).');
}

function git(args) {
  return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  try { git(['cat-file', '-e', BASELINE_COMMIT + '^{commit}']); }
  catch {
    throw new Error('Missing token guard baseline commit ' + BASELINE_COMMIT
      + '. Fetch the immutable baseline commit before running verification.');
  }
  const actual = new Map();
  const baseline = new Map();
  for (const absolute of listSourceFiles(path.join(ROOT, 'src'))) {
    const relative = path.relative(ROOT, absolute).split(path.sep).join('/');
    const current = fs.readFileSync(absolute, 'utf8');
    actual.set(relative, sourceHits(relative, current));
    let old = '';
    try { old = git(['show', BASELINE_COMMIT + ':' + relative]); }
    catch { /* This file is new since the baseline: no exceptions. */ }
    baseline.set(relative, sourceHits(relative, old));
  }
  const errors = verify(actual, baseline);
  if (errors.length) {
    console.error('DESIGN TOKEN GUARD FAILED: put new sizes/colors in src/shared/theme/tokens/:');
    for (const e of errors) console.error('  ' + e);
    console.error('Existing legacy values are grandfathered only at their recorded baseline counts.');
    process.exitCode = 1;
  } else {
    console.log('Design token guard passed: no new hardcoded color/size values in src/.');
  }
}

main();
