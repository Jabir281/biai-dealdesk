import { createReviewerHandlers } from '../../server/reviewer-auth.ts'
const handlers = createReviewerHandlers()
export default { fetch: handlers.logout }
