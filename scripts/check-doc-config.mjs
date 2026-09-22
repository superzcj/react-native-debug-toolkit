import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

// Read literal parser metadata without importing the SDK or executing native code.
export function configurationContract(source) {
  const ast = ts.createSourceFile('config.ts', source, ts.ScriptTarget.Latest, true);
  const definitions = new Map();
  function literal(node) {
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
      if (!ts.isPropertyAssignment(p)) throw new Error('Expected literal configuration metadata');
      return [p.name.text, literal(p.initializer)];
    }));
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    throw new Error('Unsupported configuration metadata: update checker explicitly');
  }
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (['FEATURE_FIELDS', 'FEATURE_DEFAULTS'].includes(declaration.name.text)) {
        definitions.set(declaration.name.text, literal(declaration.initializer));
      }
    }
  }
  const fields = definitions.get('FEATURE_FIELDS');
  const defaults = definitions.get('FEATURE_DEFAULTS');
  if (!fields || !defaults) throw new Error('Missing parser configuration definitions');
  const contract = new Map();
  for (const [feature, names] of Object.entries(fields)) {
    if (!Object.hasOwn(defaults, feature)) throw new Error(`Missing parser defaults for ${feature}`);
    contract.set(`${feature}.enabled`, 'true');
    for (const name of names) contract.set(`${feature}.${name}`, Object.hasOwn(defaults[feature], name) ? JSON.stringify(defaults[feature][name]) : 'undefined');
    for (const name of Object.keys(defaults[feature])) if (!names.includes(name)) throw new Error(`Undeclared parser default ${feature}.${name}`);
  }
  return contract;
}

export function checkConfigurationDocument(document, contract) {
  const seen = new Set();
  const errors = [];
  for (const match of document.matchAll(/^\| `([a-zA-Z]+\.[a-zA-Z]+)` \| `([^`]+)` \|/gm)) {
    const [, field, value] = match;
    if (seen.has(field)) errors.push(`Duplicate ${field}`);
    seen.add(field);
    if (!contract.has(field)) errors.push(`Unknown ${field}`);
    else if (contract.get(field) !== value) errors.push(`${field} default: expected ${contract.get(field)}, got ${value}`);
  }
  for (const field of contract.keys()) if (!seen.has(field)) errors.push(`Missing ${field}`);
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = new URL('../', import.meta.url);
  const contract = configurationContract(await readFile(new URL('src/core/config.ts', root), 'utf8'));
  const errors = [];
  for (const file of ['docs/configuration.md', 'docs/configuration.zh-CN.md']) {
    const text = await readFile(new URL(file, root), 'utf8');
    errors.push(...checkConfigurationDocument(text, contract).map(error => `${file}: ${error}`));
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Both configuration references match ${contract.size} parser fields/defaults.`);
}
