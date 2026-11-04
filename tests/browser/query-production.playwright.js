async (page) => {
  let requests = 0
  await page.route('**/api/ai/**', route => { requests++; return route.abort() })
  const passed = []
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    await page.setViewportSize({ width, height })
    await page.goto('http://127.0.0.1:5174/')
    await page.getByRole('button', { name: 'Ask Your Pipeline', exact: true }).click()
    await page.getByLabel('Your question', { exact: true }).fill('Count the overdue leads')
    if (!(await page.getByRole('button', { name: 'Ask', exact: true }).isDisabled())) throw new Error('Production Ask must be disabled')
    if (!(await page.locator('.query-warning').innerText()).includes('Secure browser access')) throw new Error('Access explanation missing')
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))) throw new Error('Production overflow')
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `D:/BIAI/app/reports/query-screenshots/production-blocked-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'AI Follow-up', exact: true }).click()
    await page.getByLabel('Select a lead').selectOption('L04')
    if (!(await page.getByRole('button', { name: 'Generate Draft', exact: true }).isDisabled())) throw new Error('Email protection changed')
    passed.push(`${width}x${height}: query access blocker, disabled Ask and email generation, no overflow`)
  }
  if (requests) throw new Error('Production browser attempted an AI request')
  return { passed, requests }
}
