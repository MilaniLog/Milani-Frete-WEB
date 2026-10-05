import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("artifacts/navigation", { recursive: true });
let checks = 0;
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let admin = false;
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data =
        path === "/api/auth/login"
          ? {
              accessToken: "browser-test-token",
              user: {
                id: 1,
                cod: 1,
                name: "Teste de interface",
                unit: 2,
                isAdmin: admin,
              },
              permissions: [
                { unit: 2, freight_service: true, freight_closure: true },
              ],
            }
          : [];
      if (
        ![
          "/api/auth/login",
          "/api/manifests",
          "/api/weeks",
          "/api/destinations",
        ].includes(path)
      )
        errors.push(`Unexpected request: ${path}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    async function login() {
      await page.getByLabel("Código do usuário").fill("1");
      await page.getByLabel("Senha", { exact: true }).fill("test-only");
      await page.getByRole("button", { name: "Entrar →" }).click();
      await page
        .getByRole("heading", { name: "Sua carga, nosso compromisso." })
        .waitFor();
    }
    await page.goto(process.env.FRONTEND_URL || "http://127.0.0.1:5173");
    await login();
    assert.equal(await page.getByRole("button").count(), 1);
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    checks++;
    await page.screenshot({
      path: `artifacts/navigation/home-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await menu.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("navigation").waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Semanas", exact: true }).count(),
      0,
    );
    await page.screenshot({
      path: `artifacts/navigation/menu-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    checks++;
    await page.keyboard.press("Escape");
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    assert.equal(
      await menu.evaluate((el) => el === document.activeElement),
      true,
    );
    checks++;
    await menu.click();
    await page.getByRole("button", { name: "Manifestos", exact: true }).click();
    await page
      .getByRole("heading", { name: "Manifestos", exact: true })
      .waitFor();
    assert.equal(await page.getByRole("navigation").count(), 0);
    await page.getByRole("link", { name: "Milani — Página inicial" }).click();
    await page
      .getByRole("heading", { name: "Sua carga, nosso compromisso." })
      .waitFor();
    checks++;
    await menu.click();
    await page
      .getByRole("heading", { name: "Sua carga, nosso compromisso." })
      .click({ position: { x: 1, y: 1 } });
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    checks++;
    await menu.click();
    await page.getByRole("button", { name: "Sair da conta →" }).click();
    admin = true;
    await login();
    await menu.click();
    await page.getByRole("button", { name: "Semanas", exact: true }).waitFor();
    checks++;
    assert.deepEqual(errors, []);
    checks++;
    await context.close();
  }
  console.log(
    `${checks} navigation browser checks passed (desktop and mobile; simulated API).`,
  );
} finally {
  await browser.close();
}
