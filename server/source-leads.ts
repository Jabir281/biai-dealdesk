import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLeads } from '../src/data/leads.ts'
import type { Lead } from '../src/data/leads.ts'

let cached: readonly Readonly<Lead>[] | undefined

export function loadSourceLeads(): readonly Readonly<Lead>[] {
  if (!cached) {
    // Included in the Vercel Function via vercel.json; never accept a caller path.
    const leads = parseLeads(readFileSync(join(process.cwd(), 'src/data/corporate-leads.csv'), 'utf8'))
    if (leads.length !== 25) throw new Error('Unexpected source record count')
    cached = Object.freeze(leads.map((lead) => Object.freeze(lead)))
  }
  return cached
}
