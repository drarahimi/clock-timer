// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Tests load index.html straight from disk (file://), the same way the
// README tells people to run the app, so no web server is needed.
module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    reporter: 'list',
    use: { ...devices['Desktop Chrome'] },
});
