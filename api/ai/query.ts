import { createQueryHandler } from '../../server/query.ts'

const handler = createQueryHandler({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL,
  accessToken: process.env.AI_DRAFT_ACCESS_TOKEN,
  reviewerPassword: process.env.BIAI_REVIEWER_PASSWORD,
  sessionSecret: process.env.BIAI_SESSION_SECRET,
})

export default { fetch: handler }
