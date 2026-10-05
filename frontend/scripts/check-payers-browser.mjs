import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// All API requests are intercepted. This test never writes operational data.
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.FRONTEND_URL || "http://127.0.0.1:5173";
await mkdir("artifacts/payers", { recursive: true });
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
    let admin = true;
    let saveStatus = 200;
    let readStatus = 200;
    let saves = [];
    let vehicle = {
      plate: "ABC1234",
      first_payer: "Empresa A",
      second_payer: "Empresa B",
      second_payer_percent: "0.3",
      vehicleType: { typeName: "Truck" },
    };
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let status = 200;
      let body;
      if (path === "/api/auth/login") {
        status = 201;
        body = {
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
        };
      } else if (
        path === "/api/vehicles/ABC1234/payers" &&
        request.method() === "PUT"
      ) {
        saves.push(request.postDataJSON());
        status = saveStatus;
        if (status === 200) vehicle = { ...vehicle, ...request.postDataJSON() };
        body =
          status === 200
            ? vehicle
            : { message: "Conflito de teste. Tente novamente." };
      } else if (path === "/api/vehicles/ABC1234") {
        status = readStatus;
        body = status === 200 ? vehicle : { message: "Sessão expirada." };
      } else if (
        [
          "/api/manifests",
          "/api/weeks",
          "/api/destinations",
          "/api/freight-expenses",
        ].includes(path)
      ) {
        body = [];
      } else {
        errors.push(`Unexpected API request: ${request.method()} ${path}`);
        status = 404;
        body = { message: "Unexpected test request" };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    async function login() {
      await page.getByLabel("Código do usuário").fill("1");
      await page.getByLabel("Senha", { exact: true }).fill("test-only");
      await page.getByRole("button", { name: "Entrar →" }).click();
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page
        .getByRole("button", { name: "Pagadoras", exact: true })
        .click();
      await page.getByLabel("Placa para consulta").fill("abc1234");
      await page.getByRole("button", { name: "Consultar veículo" }).click();
      await page.getByRole("heading", { name: "ABC1234 · Truck" }).waitFor();
    }
    await page.goto(base);
    await login();
    const percent = page.getByLabel("Percentual da segunda empresa (%)");
    assert.equal(await percent.inputValue(), "30");
    checks++;
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    checks++;
    await page.screenshot({
      path: `artifacts/payers/${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await percent.fill("101");
    await page.getByRole("button", { name: "Salvar pagadoras" }).click();
    assert.equal(
      await percent.evaluate((input) => input.validity.rangeOverflow),
      true,
    );
    assert.equal(saves.length, 0);
    checks++;
    await percent.fill("12.3456");
    saveStatus = 409;
    await page.getByRole("button", { name: "Salvar pagadoras" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Conflito de teste" })
      .waitFor();
    assert.equal(await percent.inputValue(), "12.3456");
    assert.equal(saves.at(-1).second_payer_percent, 0.123456);
    checks++;
    saveStatus = 200;
    await page.getByRole("button", { name: "Salvar pagadoras" }).click();
    await page.getByRole("status").waitFor();
    assert.equal(await percent.inputValue(), "12.3456");
    checks++;
    await page.getByLabel("Placa para consulta").fill("XYZ1234");
    assert.equal(
      await page.getByRole("button", { name: "Salvar pagadoras" }).count(),
      0,
    );
    checks++;
    await page.getByLabel("Placa para consulta").fill("ABC1234");
    readStatus = 401;
    await page.getByRole("button", { name: "Consultar veículo" }).click();
    await page.getByRole("button", { name: "Entrar →" }).waitFor();
    checks++;
    admin = false;
    readStatus = 200;
    await login();
    assert.equal(await page.getByLabel("Primeira empresa").isDisabled(), true);
    assert.equal(
      await page.getByRole("button", { name: "Salvar pagadoras" }).count(),
      0,
    );
    checks++;
    assert.deepEqual(errors, []);
    checks++;
    await context.close();
  }
  console.log(
    `${checks} browser checks passed (desktop and mobile; simulated API).`,
  );
} finally {
  await browser.close();
}
