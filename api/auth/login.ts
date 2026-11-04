import { createReviewerHandlers } from '../../server/reviewer-auth.ts'
const handlers = createReviewerHandlers({
  reviewerPassword: process.env.BIAI_REVIEWER_PASSWORD,
  sessionSecret: process.env.BIAI_SESSION_SECRET,
  apiKey: process.env.GEMINI_API_KEY,
  accessToken: process.env.AI_DRAFT_ACCESS_TOKEN,
})
export default { fetch: handlers.login }
