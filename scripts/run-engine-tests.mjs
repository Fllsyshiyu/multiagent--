import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const tempDir = path.join(root, 'node_modules', '.tmp', 'engine-tests')
await mkdir(tempDir, { recursive: true })
const entry = path.join(tempDir, 'entry.ts')
const outfile = path.join(tempDir, 'bundle.mjs')
const { build } = await import('esbuild')

await writeFile(entry, `
import { run } from '../../../scripts/engine-selftest.ts'
await run()
`)

await build({ entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'node', target: 'node20' })
const module = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
assert.equal(module.default, undefined)
