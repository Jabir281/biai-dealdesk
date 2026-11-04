import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checkServerImports, collectRuntimeGraph, runtimeImports } from '../scripts/check-server-imports.mjs'
import ts from 'typescript'

test('root compiler option rewrites the actual session entrypoint import from .ts to .js', () => {
  const source = readFileSync('api/auth/session.ts', 'utf8')
  const options = ts.convertCompilerOptionsFromJson(JSON.parse(readFileSync('tsconfig.json', 'utf8')).compilerOptions, process.cwd()).options
  const before = ts.transpileModule(source, { fileName: 'api/auth/session.ts', compilerOptions: { ...options, rewriteRelativeImportExtensions: false } }).outputText
  const after = ts.transpileModule(source, { fileName: 'api/auth/session.ts', compilerOptions: options }).outputText
  assert.ok(runtimeImports(before, 'session.js').includes('../../server/reviewer-auth.ts'))
  assert.ok(runtimeImports(after, 'session.js').includes('../../server/reviewer-auth.js'))
})

test('all five production functions emit resolvable JavaScript and execute in isolated artifacts', () => {
  assert.equal(checkServerImports().length, 5)
})

test('packaging regression rejects the original .ts import error, missing .js and computed imports', () => {
  const parent = tmpdir()
  const directory = mkdtempSync(join(parent, 'biai-import-test-'))
  try {
    mkdirSync(join(directory, 'api/auth'), { recursive: true })
    const path = join(directory, 'api/auth/session.js')
    writeFileSync(path, "import { createReviewerHandlers } from '../../server/reviewer-auth.ts'\n")
    assert.throws(() => collectRuntimeGraph(directory, 'api/auth/session.js'), /Unrewritten runtime import/)
    writeFileSync(path, "import { createReviewerHandlers } from '../../server/reviewer-auth.js'\n")
    assert.throws(() => collectRuntimeGraph(directory, 'api/auth/session.js'), /Unresolved emitted module/)
    assert.throws(() => runtimeImports('import(variablePath)', path), /Computed runtime imports/)
    assert.throws(() => runtimeImports('require(variablePath)', path), /Computed runtime imports/)
  } finally {
    assert.equal(dirname(directory), parent)
    assert.ok(directory.startsWith(join(parent, 'biai-import-test-')))
    rmSync(directory, { recursive: true, force: true })
  }
})
