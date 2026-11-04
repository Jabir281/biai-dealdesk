// Offline packaging regression. Uses the root config Vercel reads, not project references.
// This is an isolated Vercel-style artifact check, not a claim that Vercel CLI was run.
import assert from 'node:assert/strict'
import { builtinModules } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { dirname, resolve, relative, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const cache = resolve(root, 'node_modules/.cache')
const entries = ['api/auth/login.ts', 'api/auth/session.ts', 'api/auth/logout.ts', 'api/ai/draft.ts', 'api/ai/query.ts']
const inside = (parent, child) => { const rel = relative(parent, child); return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !resolve(child).startsWith(`${sep}${sep}`) && !rel.includes(':') }

export function runtimeImports(code, filename) {
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const imports = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      assert.ok(ts.isStringLiteral(node.moduleSpecifier), 'Nonliteral module import')
      imports.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      assert.equal(node.arguments.length, 1, 'Unsupported dynamic import shape')
      assert.ok(ts.isStringLiteral(node.arguments[0]), 'Computed runtime imports require a reviewed packaging strategy')
      imports.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return imports
}

export function collectRuntimeGraph(directory, entry) {
  const visited = new Set()
  function walk(path) {
    assert.ok(inside(directory, path), 'Runtime dependency escapes the artifact')
    assert.ok(existsSync(path), `Unresolved emitted module: ${relative(directory, path)}`)
    assert.ok(path.endsWith('.js'), 'Runtime must contain emitted JavaScript, not TypeScript source')
    if (visited.has(path)) return
    visited.add(path)
    for (const specifier of runtimeImports(readFileSync(path, 'utf8'), path)) {
      if (specifier.startsWith('node:')) { assert.ok(builtinModules.includes(specifier.slice(5)) || builtinModules.includes(specifier), `Unknown Node builtin: ${specifier}`); continue }
      assert.ok(specifier.startsWith('.'), `External dependency needs explicit packaging: ${specifier}`)
      assert.ok(specifier.endsWith('.js'), `Unrewritten runtime import: ${specifier}`)
      walk(resolve(dirname(path), specifier))
    }
  }
  walk(resolve(directory, entry))
  return [...visited]
}

export function checkServerImports() {
  const configFile = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile)
  assert.equal(configFile.error, undefined, 'Invalid root TypeScript configuration')
  const converted = ts.convertCompilerOptionsFromJson(configFile.config.compilerOptions ?? {}, root)
  assert.equal(converted.errors.length, 0, 'Invalid root compiler options')
  assert.equal(converted.options.rewriteRelativeImportExtensions, true, 'Vercel needs extension rewriting in the root config; project references are not followed')
  assert.equal(converted.options.module, ts.ModuleKind.NodeNext)
  assert.equal(converted.options.moduleResolution, ts.ModuleResolutionKind.NodeNext)
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
  assert.deepEqual(vercel.functions, { 'api/**/*.ts': { maxDuration: 30, includeFiles: 'src/data/corporate-leads.csv' } })
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).type, 'module')
  const actualEntries = readdirSync(join(root, 'api'), { recursive: true }).filter(path => path.endsWith('.ts')).map(path => `api/${path.replaceAll('\\', '/')}`).sort()
  assert.deepEqual(actualEntries, [...entries].sort(), 'Update runtime checks when adding a production function')
  mkdirSync(cache, { recursive: true })
  const temporary = mkdtempSync(join(cache, 'server-runtime-'))
  const emitted = join(temporary, 'emitted')
  try {
    const program = ts.createProgram(entries.map(entry => join(root, entry)), {
      ...converted.options, noEmit: false, noEmitOnError: true, outDir: emitted, rootDir: root,
      types: ['node'], declaration: false, sourceMap: false,
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: path => path, getNewLine: () => '\n' }))
    assert.equal(program.emit().emitSkipped, false, 'TypeScript did not emit production functions')
    const csv = readFileSync(join(root, 'src/data/corporate-leads.csv'))
    const outputs = []
    for (const entry of entries) {
      const emittedEntry = entry.replace(/\.ts$/, '.js')
      const graph = collectRuntimeGraph(emitted, emittedEntry)
      const directory = join(temporary, `${entry.slice(0, -3)}.func`)
      mkdirSync(directory, { recursive: true })
      for (const path of graph) {
        const destination = join(directory, relative(emitted, path))
        mkdirSync(dirname(destination), { recursive: true }); copyFileSync(path, destination)
      }
      mkdirSync(join(directory, 'src/data'), { recursive: true })
      writeFileSync(join(directory, 'src/data/corporate-leads.csv'), csv)
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ type: 'module' }))
      writeFileSync(join(directory, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: emittedEntry, launcherType: 'Nodejs', maxDuration: 30 }))
      assert.deepEqual(readFileSync(join(directory, 'src/data/corporate-leads.csv')), csv)
      collectRuntimeGraph(directory, emittedEntry)
      // A fresh process with only emitted JS + CSV, no secret env, loader hooks or TS stripping.
      const environment = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'HOME'].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
      const result = spawnSync(process.execPath, ['--no-experimental-strip-types', join(root, 'scripts/check-server-runtime.mjs'), emittedEntry], {
        cwd: directory, env: environment, encoding: 'utf8', timeout: 30_000, windowsHide: true,
      })
      assert.equal(result.status, 0, `Runtime failed for ${entry}: ${result.stderr || result.error?.message || 'unknown failure'}`)
      assert.equal(JSON.parse(result.stdout).verified, true)
      outputs.push({ endpoint: `/${entry.slice(0, -3)}`, javascriptModules: graph.length, csvBytes: csv.length })
    }
    console.log(JSON.stringify({ verified: true, functions: outputs, liveProviderRequests: 0 }))
    return outputs
  } finally {
    // Remove only the uniquely allocated scratch directory created above, never project output.
    assert.equal(dirname(temporary), cache)
    assert.ok(inside(cache, temporary) && temporary.startsWith(join(cache, 'server-runtime-')))
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkServerImports()
