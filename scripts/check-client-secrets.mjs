// Read credentials only to compare them; never print their values or bundle contents.
import { loadEnvFile } from 'node:process'
import { readFileSync, readdirSync } from 'node:fs'
try { loadEnvFile('.env.local') } catch { /* Environment-only setup is valid. */ }
const names = ['GEMINI_API_KEY', 'AI_DRAFT_ACCESS_TOKEN', 'BIAI_REVIEWER_PASSWORD', 'BIAI_SESSION_SECRET']
const values = names.map(name => process.env[name]).filter(Boolean)
const files = readdirSync('dist', { recursive: true }).filter(path => /\.(js|css|html)$/.test(path))
if (!files.length) throw new Error('Build the client before checking it.')
const safe = files.every(path => {
  const text = readFileSync(`dist/${path}`, 'utf8')
  return ![...names, ...values].some(value => text.includes(value))
})
console.log(JSON.stringify({ clientFilesChecked: files.length, noServerSecretNamesOrConfiguredValues: safe }))
if (!safe) process.exitCode = 1
