
import { loadEnvFile } from 'node:process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { parseLeads } from '../src/data/leads.ts'
import { createQueryHandler } from '../server/query.ts'
import { resolveModel } from '../server/draft.ts'
import { createLocalMiddleware } from '../server/local-adapter.ts'

// Explicit, one-shot opt-in. Never imported by tests/build/dev or retried automatically.
const question =
  'Before we start chasing companies, how many records have a follow-up scheduled earlier than November 1, 2026? Please include their IDs, even if their stage is Paid or Lost.'

if (process.argv[2] !== '--live-once') {
  console.error(
    'Use --live-once only when explicitly authorizing one real Gemini interpretation.'
  )
  process.exitCode = 1
} else {
  try {
    loadEnvFile('.env.local')
  } catch {
    // Server environment is also supported.
  }

  const model = resolveModel(process.env.GEMINI_MODEL)

  if (!model || !process.env.GEMINI_API_KEY?.trim()) {
    console.error(
      'Live question not attempted: missing server key or unsupported model setting.'
    )
    process.exitCode = 1
  } else {
    // Independent expected result: original CSV, direct date comparison,
    // no query engine or isOverdue.
    const source = parseLeads(
      readFileSync(
        '../sample-data/intern/task2-corporate-leads/corporate-leads.csv',
        'utf8'
      )
    )

    const expectedIds = source
      .filter(
        (lead) =>
          lead.nextFollowUp !== '' &&
          lead.nextFollowUp < '2026-11-01'
      )
      .map((lead) => lead.id)
      .sort()

    const handler = createQueryHandler({
      apiKey: process.env.GEMINI_API_KEY,
      model,
      local: true,
    })

    const middleware = createLocalMiddleware(
      handler,
      '/api/ai/query'
    )

    const server = createServer((req, res) => {
      void middleware(req, res, () => {
        res.writeHead(404)
        res.end()
      })
    })

    try {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')

      console.log(
        `Explicit live query: one interpretation using ${model}. No retries.`
      )

      const response = await fetch(
        `http://127.0.0.1:${server.address().port}/api/ai/query`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ question }),
          signal: AbortSignal.timeout(25000),
        }
      )

      const result = await response.json()

      // Verify the returned lead IDs against the original CSV.
      const sameIds =
        Array.isArray(result.matchedLeadIds) &&
        result.matchedLeadIds.length === expectedIds.length &&
        JSON.stringify([...result.matchedLeadIds].sort()) ===
          JSON.stringify(expectedIds)

      // Accept either a correct count or a complete list of matching leads.
      const verified =
        response.ok &&
        result.status === 'answer' &&
        result.plan?.measure === 'leads' &&
        sameIds &&
        (
          (
            result.plan.operation === 'count' &&
            result.value === expectedIds.length
          ) ||
          (
            result.plan.operation === 'list' &&
            Array.isArray(result.displayedLeadIds) &&
            JSON.stringify([...result.displayedLeadIds].sort()) ===
              JSON.stringify(expectedIds)
          )
        )

      // Only safe contract fields, no credentials/headers,
      // raw provider response or contact records.
      console.log(
        JSON.stringify(
          {
            status: response.status,
            question,
            model,
            result:
              result.status === 'answer'
                ? {
                    answer: result.answer,
                    criteria: result.criteria,
                    matchedLeadIds: result.matchedLeadIds,
                    value: result.value,
                    plan: result.plan,
                  }
                : result,
            independentExpectedCount: expectedIds.length,
            independentExpectedIds: expectedIds,
            verified,
          },
          null,
          2
        )
      )

      if (!verified) {
        process.exitCode = 1
      }
    } catch {
      console.error(
        'Live question transport failed. No retry made; provider completion is unknown.'
      )
      process.exitCode = 1
    } finally {
      server.closeAllConnections()
      server.close()
    }
  }
}
