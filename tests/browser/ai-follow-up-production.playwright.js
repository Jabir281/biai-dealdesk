// Run against `npm.cmd run preview -- --host 127.0.0.1 --port 5174 --strictPort` after build.
async (page) => {
  let requests = 0
  await page.route('**/api/ai/draft', route => { requests++; return route.abort() })
  const passed = []
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    await page.setViewportSize({ width, height })
    await page.goto('http://127.0.0.1:5174/')
    await page.getByRole('button', { name: 'AI Follow-up', exact: true }).click()
    await page.getByLabel('Select a lead').selectOption('L04')
    if (!(await page.getByRole('button', { name: 'Generate Draft', exact: true }).isDisabled())) throw new Error('Production generation must be disabled')
    if (!(await page.locator('.followup-notice').innerText()).includes('Secure browser access is not configured')) throw new Error('Missing production access explanation')
    if (!(await page.locator('.followup-context').innerText()).includes('Karnaphuli Foods')) throw new Error('Read-only lead context should remain available')
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))) throw new Error('Production overflow')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `D:/BIAI/app/reports/ai-follow-up-screenshots/production-blocked-${width}.png`, fullPage: true })
    passed.push(`${width}x${height}: production access blocker visible, generation disabled, lead context available, no overflow`)
  }
  if (requests !== 0) throw new Error('Production UI attempted a draft request')
  return { passed, draftRequests: requests }
}
