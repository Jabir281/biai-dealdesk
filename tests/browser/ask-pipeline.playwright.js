// Run query-fixtures.mjs first, then execute this function with Playwright MCP.
async (page) => {
  const fixtures = /* TEST_FIXTURES */ null
  const passed = []
  const plans = []
  const requests = []
  const errors = []
  let unexpected = 0
  const check = (condition, name) => { if (!condition) throw new Error(name); passed.push(name) }
  const onError = error => errors.push(error.message)
  page.on('pageerror', onError)
  await page.route('**/api/ai/**', async route => {
    if (!route.request().url().endsWith('/api/ai/query')) { unexpected++; await route.abort(); return }
    requests.push({ payload: route.request().postDataJSON(), method: route.request().method(), hasAuth: Boolean(route.request().headers().authorization) })
    const plan = plans.shift()
    if (!plan) { unexpected++; await route.abort(); return }
    if (plan.hold) await plan.hold
    await route.fulfill({ status: plan.status ?? 200, contentType: 'application/json', body: JSON.stringify(plan.body) })
  })
  await page.route('https://generativelanguage.googleapis.com/**', route => { unexpected++; return route.abort() })
  const shot = async name => { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `D:/BIAI/app/reports/query-screenshots/${name}.png`, fullPage: true }) }
  const overflow = async name => check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${name}: no horizontal overflow`)
  try {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto('http://localhost:5173/')
    await page.getByRole('button', { name: 'Ask Your Pipeline', exact: true }).click()
    const input = page.getByLabel('Your question', { exact: true })
    const ask = page.getByRole('button', { name: 'Ask', exact: true })
    check(await page.title() === 'Ask Your Pipeline | BIAI DealDesk', 'Navigation and title identify Ask Your Pipeline')
    check(await ask.isDisabled(), 'Empty question cannot submit')
    check(requests.length === 0, 'Opening the view makes no AI request')
    await shot('desktop-empty')
    await page.getByRole('button', { name: 'Compare the agreed BDT totals across stages.', exact: true }).click()
    check((await input.inputValue()).includes('BDT totals') && requests.length === 0, 'Suggestions only fill the free-form input')
    await input.fill(fixtures.overdue.question)
    await input.focus()
    await page.keyboard.press('Tab')
    check(await ask.evaluate(el => el === document.activeElement && getComputedStyle(el).outlineStyle !== 'none'), 'Ask is keyboard reachable with visible focus')
    let release
    plans.push({ body: fixtures.overdue, hold: new Promise(resolve => { release = resolve }) })
    await ask.evaluate(el => { el.click(); el.click() })
    await page.getByRole('button', { name: 'Interpreting…', exact: true }).waitFor()
    check(await input.isDisabled(), 'Question input disabled while pending')
    check(await page.getByRole('button', { name: 'Interpreting…', exact: true }).isDisabled(), 'Ask disabled while pending')
    await shot('desktop-loading')
    release()
    await page.getByRole('heading', { name: fixtures.overdue.answer, exact: true }).waitFor()
    check(requests.length === 1, 'Duplicate clicks create one HTTP request')
    check(requests[0].method === 'POST' && !requests[0].hasAuth && JSON.stringify(requests[0].payload) === JSON.stringify({ question: fixtures.overdue.question }), 'Browser sends only the free-form question, without secrets or context')
    check((await page.locator('.query-support').innerText()).includes('L04, L06, L10, L13, L15, L19, L20, L22, L25'), 'Overdue result includes exact supporting IDs')
    check((await page.locator('.query-criteria').innerText()).includes('2026-11-01'), 'Applied criteria and fixed reference date shown')
    await page.locator('.query-sources > summary').click()
    await page.locator('.query-source > summary').first().click()
    check((await page.locator('.query-source').first().innerText()).includes('sales team AI training'), 'Associated original source record can be inspected')
    await overflow('Desktop answer')
    await shot('desktop-count-mocked')
    const askFixture = async name => {
      await input.fill(fixtures[name].question)
      plans.push({ body: fixtures[name] })
      await ask.click()
      await page.waitForFunction(question => document.querySelector('.query-answered-question')?.textContent.includes(question), fixtures[name].question)
    }
    await askFixture('grouped')
    check(await page.locator('.query-table tbody tr').count() === 7, 'Grouped response shows all seven stages')
    check((await page.locator('.query-warning').innerText()).includes('L01/L23') && (await page.locator('.query-warning').innerText()).includes('L02/L03'), 'Value summary visibly warns about both duplicate groups')
    check((await page.locator('.query-table').innerText()).includes('BDT'), 'Grouped value units are BDT')
    await shot('desktop-grouped-mocked')
    await askFixture('list')
    check(await page.locator('.query-matches > li').count() === 3, 'Limited sorted list shows exactly three leads')
    check((await page.locator('.query-answer-heading').innerText()).includes('3 of'), 'Limited display is distinct from matching-source count')
    await askFixture('empty')
    check((await page.locator('.query-support').innerText()).includes('None') && await page.locator('.query-source').count() === 0, 'Zero-match query clears old source records')
    await askFixture('clarify')
    check(await page.getByRole('heading', { name: 'Clarify your question', exact: true }).isVisible() && await page.locator('.query-answer-heading').count() === 0, 'Ambiguous interpretation produces clarification without a fabricated answer')
    await page.getByRole('button', { name: 'Revise question', exact: true }).click()
    check(await input.evaluate(el => el === document.activeElement), 'Revise question returns focus to input')
    await askFixture('unsupported')
    check(await page.getByRole('heading', { name: 'Outside the available data or operations', exact: true }).isVisible(), 'Unavailable facts produce an honest limitation')
    await shot('desktop-unsupported')
    for (const [code, status, expected] of [['INVALID_QUERY_PLAN', 502, 'safely validated'], ['MODEL_UNAVAILABLE', 503, 'unavailable'], ['PROVIDER_FAILURE', 502, 'could not interpret'], ['RATE_LIMITED', 429, 'Too many'], ['PROVIDER_TIMEOUT', 504, 'timed out'], ['UNAUTHORIZED', 401, 'does not authorize']]) {
      plans.push({ status, body: { error: { code, message: 'RAW_INTERNAL_TEXT' } } })
      await input.fill('A new independent question')
      await ask.click()
      await page.waitForFunction(text => document.querySelector('.query-error')?.textContent.includes(text), expected)
      check(!(await page.getByRole('alert').innerText()).includes('RAW_INTERNAL') && await page.locator('.query-result').count() === 0, `${code}: safe error, no stale or fallback answer`)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await askFixture('grouped')
    await overflow('Mobile grouped answer')
    await shot('mobile-grouped-mocked')
    await askFixture('list')
    await overflow('Mobile list')
    await shot('mobile-list-mocked')
    await askFixture('clarify')
    await shot('mobile-clarification')
    check(await page.getByRole('button', { name: 'AI Follow-up', exact: true }).isVisible(), 'All four navigation views remain accessible on mobile')
    await page.getByRole('button', { name: 'Lead register', exact: true }).click()
    check(await page.locator('.lead-table tbody tr').count() === 25, 'Register retains all 25 rows')
    await page.getByRole('button', { name: 'Data health', exact: true }).click()
    check((await page.locator('.health-totals').innerText()).includes('10 of 25'), 'Data Health counts retained')
    await page.getByRole('button', { name: 'AI Follow-up', exact: true }).click()
    await page.getByLabel('Select a lead').selectOption('L04')
    check((await page.locator('.followup-context').innerText()).includes('Karnaphuli Foods'), 'Email assistant source selection retained without a request')
    check(errors.length === 0, 'No uncaught application errors')
    check(unexpected === 0 && plans.length === 0, 'Every query used an explicit test fixture; no provider or unexpected requests')
    return { passed, mockedQueries: requests.length, liveProviderRequests: 0 }
  } finally { page.off('pageerror', onError) }
}
