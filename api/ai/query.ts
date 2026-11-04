import { createQueryHandler } from '../../server/query.ts'

const handler = createQueryHandler({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL,
  accessToken: process.env.AI_DRAFT_ACCESS_TOKEN,
})

export default { fetch: handler }
