// Run with Playwright MCP browser_run_code_unsafe(filename=...).
// Every /api/ai/draft request is intercepted. No request reaches the real backend.
async (page) => {
  const base = 'http://localhost:5173'
  const shots = 'D:/BIAI/app/reports/ai-follow-up-screenshots'
  const passed = []
  const requests = []
  const plans = []
  const errors = []
  const failedAssets = []
  let unexpected = 0
  const check = (condition, description) => { if (!condition) throw new Error(description); passed.push(description) }
  const fixture = {
    subject: 'AI training for your sales team',
    body: 'Dear Tanvir Hasan,\n\nI am following up on your interest in AI training for the sales team at Karnaphuli Foods. Would you still like to explore training for your team? Please let us know if you would like to discuss your needs.\n\nBest regards,\nBIAI Team',
    leadId: 'L04', sourceFields: ['company', 'contactName', 'contactRole', 'stage', 'notes'],
    model: 'gemini-3.5-flash-lite', draftOnly: true,
  }
  const onError = error => errors.push(error.message)
  const onFailed = request => { if (!request.url().endsWith('/api/ai/draft')) failedAssets.push(request.url()) }
  page.on('pageerror', onError)
  page.on('requestfailed', onFailed)
  await page.route('**/api/ai/draft', async route => {
    const request = route.request()
    requests.push({ method: request.method(), body: request.postDataJSON(), authorization: Boolean(request.headers().authorization), providerKey: Boolean(request.headers()['x-goog-api-key']) })
    const plan = plans.shift()
    if (!plan) { unexpected++; await route.abort(); return }
    if (plan.hold) await plan.hold
    if (plan.abort) { await route.abort('failed'); return }
    await route.fulfill({ status: plan.status ?? 200, contentType: 'application/json', body: JSON.stringify(plan.body ?? fixture) })
  })
  await page.route('https://generativelanguage.googleapis.com/**', route => { unexpected++; return route.abort() })
  const overflow = async label => check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${label}: no horizontal overflow`)
  const screenshot = async filename => {
    // Capture from the top so offscreen fixed elements stay offscreen in full-page images.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${shots}/${filename}`, fullPage: true })
  }
  try {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(base)
    check(await page.locator('.lead-table tbody tr').count() === 25, 'Register retains 25 records')
    check(/9\s+overdue/.test(await page.locator('.register-summary').innerText()), 'Register retains 9 overdue follow-ups')
    await page.getByLabel('Search company or contact').fill('Tanvir')
    check(await page.locator('.lead-table tbody tr').count() === 1, 'Register contact search works')
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await page.getByLabel('Pipeline stage', { exact: true }).selectOption('Contacted')
    await page.getByLabel('Overdue only').check()
    check(await page.locator('.lead-table tbody tr').count() > 0 && await page.locator('.lead-table tbody tr:not(.is-overdue)').count() === 0, 'Register stage and overdue filters intersect')
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await page.getByRole('button', { name: 'Data health', exact: true }).click()
    check((await page.locator('.health-totals').innerText()).includes('10 of 25'), 'Data health flagged-lead count retained')
    await page.getByLabel('Issue category').selectOption('Missing contact')
    check(await page.locator('.health-issue').count() === 3, 'Data health category filter works')
    const summary = page.locator('.health-source summary').filter({ hasText: 'Inspect L24:' }).first()
    await summary.click()
    check(await summary.locator('..').locator('dl').isVisible(), 'Data health source inspection works for L24')
    await page.getByRole('button', { name: 'AI Follow-up', exact: true }).click()
    check(await page.title() === 'AI Follow-up | BIAI DealDesk', 'New navigation and document title work')
    check(await page.getByRole('button', { name: 'Generate Draft', exact: true }).isDisabled(), 'Empty selection prevents generation')
    check(requests.length === 0, 'Navigation and review make no draft requests')
    await screenshot('desktop-empty.png')
    const select = page.getByLabel('Select a lead')
    const ids = await select.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean))
    check(ids.length === 25 && new Set(ids).size === 25 && ['L01', 'L23', 'L02', 'L03'].every(id => ids.includes(id)), 'All 25 lead IDs and both duplicate groups selectable')
    for (const [id, count] of [['L01', 1], ['L06', 2], ['L24', 2], ['L25', 1]]) {
      await select.selectOption(id)
      check(await page.locator('.followup-warning li').count() === count, `${id}: existing Data Health warnings displayed`)
    }
    await select.selectOption('L04')
    check((await page.locator('.followup-context').innerText()).includes('Karnaphuli Foods') && (await page.locator('.followup-notes').innerText()).includes('Did not reply to last two messages.'), 'Selected L04 company and original notes displayed')
    check(await page.locator('.followup-warning').count() === 0, 'Unflagged L04 has no invented data warning')
    await select.focus()
    await page.keyboard.press('Tab')
    check(await page.getByRole('button', { name: 'Generate Draft', exact: true }).evaluate(el => el === document.activeElement && getComputedStyle(el).outlineStyle !== 'none'), 'Keyboard reaches Generate Draft with visible focus')
    let release
    plans.push({ hold: new Promise(resolve => { release = resolve }) })
    await page.getByRole('button', { name: 'Generate Draft', exact: true }).evaluate(el => { el.click(); el.click() })
    await page.getByRole('button', { name: 'Generating draft…', exact: true }).waitFor()
    check(await select.isDisabled(), 'Lead selection is locked during generation')
    check(await page.getByRole('button', { name: 'Generating draft…', exact: true }).isDisabled(), 'Pending submission is disabled')
    await page.waitForFunction(() => document.querySelector('.followup-editor').getAttribute('aria-busy') === 'true')
    await screenshot('desktop-loading.png')
    release()
    await page.getByLabel('Subject', { exact: true }).waitFor()
    check(requests.length === 1, 'Rapid duplicate clicks produce one request')
    check(JSON.stringify(requests[0].body) === '{"leadId":"L04"}' && requests[0].method === 'POST' && !requests[0].authorization && !requests[0].providerKey, 'HTTP payload contains only leadId and no authorization/key headers')
    check(await page.getByLabel('Subject', { exact: true }).inputValue() === fixture.subject && await page.getByLabel('Body', { exact: true }).inputValue() === fixture.body, 'Mocked subject and body rendered exactly')
    check((await page.locator('.followup-provenance').innerText()).includes('L04') && await page.locator('.followup-provenance li').count() === 5, 'Returned lead ID and five source fields shown')
    await overflow('Desktop draft')
    await screenshot('desktop-success-mocked.png')
    await page.getByLabel('Subject', { exact: true }).fill('Edited follow-up subject')
    await page.getByLabel('Body', { exact: true }).fill('Dear Tanvir,\n\nWould you like to discuss sales team AI training?\n\nBIAI Team')
    check((await page.locator('.followup-status').innerText()).includes('Edited AI draft for L04'), 'Edits are visibly distinguished from returned AI draft')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
    for (const part of ['Subject', 'Body', 'Email']) {
      await page.getByRole('button', { name: `Copy ${part}`, exact: true }).click()
      await page.getByText(`${part} copied to clipboard.`, { exact: true }).waitFor()
      // Windows clipboard normalizes line endings to CRLF.
      const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
      const subject = await page.getByLabel('Subject', { exact: true }).inputValue()
      const body = await page.getByLabel('Body', { exact: true }).inputValue()
      check(copied === (part === 'Subject' ? subject : part === 'Body' ? body : `Subject: ${subject}\n\n${body}`), `${part}: actual clipboard contains current edits and accessible feedback appears`)
    }
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Denied for test')) } }))
    await page.getByRole('button', { name: 'Copy Body', exact: true }).click()
    await page.getByText('Copy was blocked by the browser. Select the text and copy it manually.', { exact: true }).waitFor()
    check(true, 'Clipboard denial provides manual-copy guidance')
    await page.evaluate(() => { delete navigator.clipboard })
    await select.selectOption('L24')
    check(await page.getByLabel('Subject', { exact: true }).count() === 0, 'Switching leads never displays a different lead’s draft')
    await select.selectOption('L04')
    check(await page.getByLabel('Subject', { exact: true }).inputValue() === 'Edited follow-up subject', 'Returning to a lead preserves its edits')
    await page.getByRole('button', { name: 'Lead register', exact: true }).click()
    await page.getByRole('button', { name: 'AI Follow-up', exact: true }).click()
    check(await page.getByLabel('Subject', { exact: true }).inputValue() === 'Edited follow-up subject', 'Navigation preserves the selected draft')
    await page.getByRole('button', { name: 'Generate Draft', exact: true }).click()
    check(requests.length === 1, 'Replacement requires explicit confirmation before any request')
    await page.getByRole('button', { name: 'Keep current draft', exact: true }).click()
    check(requests.length === 1, 'Keeping draft makes no request')
    plans.push({ status: 502, body: { error: { code: 'PROVIDER_FAILURE' } } })
    await page.getByRole('button', { name: 'Generate Draft', exact: true }).click()
    await page.getByRole('button', { name: 'Generate replacement', exact: true }).click()
    await page.getByRole('alert').waitFor()
    check(await page.getByLabel('Subject', { exact: true }).inputValue() === 'Edited follow-up subject' && (await page.getByRole('alert').innerText()).includes('previous draft'), 'Failed replacement preserves edits and clearly identifies previous draft')
    await screenshot('desktop-error-preserved.png')
    await select.selectOption('L05')
    const cases = [
      ['MODEL_UNAVAILABLE', 503, 'model is unavailable'], ['PROVIDER_FAILURE', 502, 'could not complete'],
      ['PROVIDER_REQUEST_REJECTED', 502, 'request configuration'], ['PROVIDER_TIMEOUT', 504, 'timed out'],
      ['RATE_LIMITED', 429, 'Too many'], ['PROVIDER_QUOTA_EXCEEDED', 503, 'quota'],
      ['AI_NOT_CONFIGURED', 503, 'not configured'], ['MODEL_NOT_CONFIGURED', 503, 'not configured'],
      ['ACCESS_NOT_CONFIGURED', 503, 'Secure browser access'], ['UNAUTHORIZED', 401, 'does not authorize'],
      ['LOCAL_ACCESS_ONLY', 403, 'local development'], ['PROVIDER_ACCESS_DENIED', 503, 'denied access'],
    ]
    for (const [code, status, message] of cases) {
      plans.push({ status, body: { error: { code, message: 'DO_NOT_DISPLAY_RAW_PROVIDER_TEXT' } } })
      await page.getByRole('button', { name: 'Generate Draft', exact: true }).click()
      await page.waitForFunction(text => document.querySelector('[role="alert"]')?.textContent.includes(text), message)
      check(!(await page.getByRole('alert').innerText()).includes('DO_NOT_DISPLAY') && await page.getByLabel('Body', { exact: true }).count() === 0, `${code}: actionable error with no fabricated draft or raw provider text`)
    }
    plans.push({ abort: true })
    await page.getByRole('button', { name: 'Generate Draft', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('could not reach'))
    check(true, 'Network failure is actionable')
    await page.setViewportSize({ width: 390, height: 844 })
    await select.selectOption('L24')
    await overflow('Mobile warning')
    await screenshot('mobile-health-warning.png')
    await select.selectOption('L04')
    await overflow('Mobile edited draft')
    check(await page.getByLabel('Body', { exact: true }).inputValue() !== '', 'Mobile editor retains draft and edits')
    await screenshot('mobile-success-mocked.png')
    await page.getByLabel('Body', { exact: true }).fill('Mobile edit preserved.')
    await page.getByRole('button', { name: 'Copy Email', exact: true }).click()
    await page.getByText('Email copied to clipboard.', { exact: true }).waitFor()
    check((await page.evaluate(() => navigator.clipboard.readText())).endsWith('Mobile edit preserved.'), 'Mobile editing and copy email work')
    await select.selectOption('L05')
    plans.push({ status: 503, body: { error: { code: 'MODEL_UNAVAILABLE' } } })
    await page.getByRole('button', { name: 'Generate Draft', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('model is unavailable'))
    await overflow('Mobile error')
    await screenshot('mobile-unavailable.png')
    await page.getByRole('button', { name: 'Lead register', exact: true }).click()
    check(await page.locator('.lead-table tbody tr').count() === 25, 'Mobile register retains 25 records')
    await overflow('Mobile register')
    await page.getByRole('button', { name: 'Data health', exact: true }).click()
    check(await page.locator('.health-issue').count() === 10, 'Mobile Data Health remains functional')
    await overflow('Mobile Data Health')
    check(errors.length === 0, 'No uncaught browser errors')
    check(failedAssets.length === 0, 'No failed asset requests')
    check(plans.length === 0 && unexpected === 0, 'All draft requests fulfilled or aborted by test mocks; no unexpected/provider requests')
    return { passed, mockedDraftRequests: requests.length, uncaughtErrors: errors, failedAssets, screenshotDirectory: shots, liveProviderRequests: 0 }
  } finally {
    page.off('pageerror', onError)
    page.off('requestfailed', onFailed)
    // Routes stay installed as a safety guard until the automated test page is closed.
  }
}
