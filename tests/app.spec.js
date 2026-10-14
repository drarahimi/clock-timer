// @ts-check
const path = require('path');
const { test, expect } = require('@playwright/test');

const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

// Replace the Web Audio beep with a recorder so tests can assert on alerts.
async function recordBeeps(page) {
    await page.evaluate(() => {
        window.__beeps = [];
        window.playBeep = (times = 1) => window.__beeps.push(times);
    });
}

async function startSimpleTimer(page, { h = 0, m = 0, s = 0 }) {
    await page.click('#tab-timer');
    await page.click('#mode-simple');
    await page.fill('#input-hr', String(h));
    await page.fill('#input-min', String(m));
    await page.fill('#input-sec', String(s));
    await page.getByRole('button', { name: 'Start Timer' }).click();
}

const remaining = (page) => page.evaluate('timeLeft');

test('loads fully offline with no external requests', async ({ page }) => {
    const external = [];
    await page.route(/^https?:/, (route) => {
        external.push(route.request().url());
        return route.abort();
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(APP_URL);
    await page.evaluate(() => document.fonts.ready);

    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    // Local Tailwind build is applied (a utility class from the markup takes effect).
    await expect(page.locator('#view-timer')).toHaveCSS('display', 'none');
    // Self-hosted Inter is loaded.
    expect(await page.evaluate(() => document.fonts.check('700 16px Inter'))).toBe(true);
});

test('clock shows the current time', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 0, 5, 9, 7, 30));
    await page.goto(APP_URL);
    await expect(page.locator('#clock-digits')).toHaveAttribute('aria-label', 'Current time 09:07');
});

test('countdown runs to zero and fires the end alarm', async ({ page }) => {
    await page.clock.install();
    await page.goto(APP_URL);
    await recordBeeps(page);
    await startSimpleTimer(page, { s: 10 });

    await page.clock.runFor(4000);
    expect(await remaining(page)).toBe(6);
    await expect(page.locator('#timer-digits')).toHaveAttribute('aria-label', 'Time remaining 00:06');

    await page.clock.runFor(7000);
    expect(await remaining(page)).toBe(0);
    await expect(page.locator('#timer-running')).toBeHidden();
    expect(await page.evaluate(() => window.__beeps)).toContain(3);
});

test('countdown stays accurate when the interval is throttled', async ({ page }) => {
    await page.clock.install();
    await page.goto(APP_URL);
    await startSimpleTimer(page, { m: 5 });

    // Simulate a backgrounded tab: wall-clock time jumps but no ticks run.
    await page.clock.pauseAt(Date.now() + 1000);
    await page.clock.fastForward(120000);
    await page.clock.runFor(300);
    expect(await remaining(page)).toBeGreaterThanOrEqual(178);
    expect(await remaining(page)).toBeLessThanOrEqual(180);
});

test('pause freezes the remaining time', async ({ page }) => {
    await page.clock.install();
    await page.goto(APP_URL);
    await startSimpleTimer(page, { m: 1 });

    await page.clock.runFor(5000);
    await page.click('#pause-btn');
    const pausedAt = await remaining(page);
    await page.clock.runFor(20000);
    expect(await remaining(page)).toBe(pausedAt);

    await page.click('#pause-btn');
    await page.clock.runFor(5000);
    expect(await remaining(page)).toBe(pausedAt - 5);
});

test('warning beeps fire once at each configured checkpoint', async ({ page }) => {
    await page.clock.install();
    await page.goto(APP_URL);
    await recordBeeps(page);
    // Defaults are 5-minute and 1-minute warnings.
    await startSimpleTimer(page, { m: 6 });

    await page.clock.runFor(59000);
    expect(await page.evaluate(() => window.__beeps)).toEqual([]);
    await page.clock.runFor(2000);
    expect(await page.evaluate(() => window.__beeps)).toEqual([1]);
    await page.clock.runFor(4 * 60000);
    expect(await page.evaluate(() => window.__beeps)).toEqual([1, 2]);
});

test('a running timer can be resumed after a reload', async ({ page }) => {
    await page.goto(APP_URL);
    await startSimpleTimer(page, { m: 10 });
    await page.reload();

    await expect(page.locator('#confirm-modal-title')).toHaveText('Resume timer?');
    await page.click('#confirm-modal-confirm');
    await expect(page.locator('#timer-running')).toBeVisible();
    expect(await remaining(page)).toBeGreaterThan(590);
});

test('exam rules keep special characters verbatim across reloads', async ({ page }) => {
    const tricky = `Use "pencil" & eraser; write &amp; literally, not <b>bold</b>`;
    await page.goto(APP_URL);
    await page.click('#tab-timer');
    await page.click('#mode-exam');
    const first = page.locator('#rules-input-container .rule-item-input').first();
    await first.fill(tricky);

    await page.reload();
    await expect(first).toHaveValue(tricky);
});

test('every button and input has an accessible name', async ({ page }) => {
    await page.goto(APP_URL);
    await page.click('#tab-timer');
    await page.click('#mode-exam');
    const unnamed = await page.evaluate(() => {
        const els = [...document.querySelectorAll('button, input')];
        return els
            .filter((el) => {
                const name = el.getAttribute('aria-label')
                    || el.textContent.trim()
                    || (el.id && document.querySelector(`label[for="${el.id}"]`));
                return !name;
            })
            .map((el) => el.outerHTML.slice(0, 120));
    });
    expect(unnamed).toEqual([]);
});
