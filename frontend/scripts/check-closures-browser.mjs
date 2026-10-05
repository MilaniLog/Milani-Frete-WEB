import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

// Every API request is intercepted; no operational closure is changed.
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("artifacts/closures", { recursive: true });
let checks = 0;
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let admin = true;
    let permitted = true;
    let conflict = true;
    let posts = [];
    let closure = {
      id: 4,
      numero: 40,
      semana: "0001",
      placa: "ABC1234",
      status: "FECHADO",
      total_bruto: "1500",
      total_liquido: "1200",
    };
    const data = {
      semana: "0001",
      placa: "ABC1234",
      manifests: [{ id: 1, manifestos: "M1", frete_veiculo: "1500" }],
      entries: [
        {
          id: 1,
          numero: 1,
          nome_despesa: "Despesa de teste",
          tipo_despesa: "Debito",
          valor: "200",
        },
      ],
      coupons: [{ id: 1, nota_id: 1, valor: "100" }],
      totals: {
        total_bruto: "1500",
        total_liquido: "1200",
        total_ctrb: "0",
        debitos: "200",
        creditos: "0",
        cupons: "100",
      },
      payment: {
        criterio: "RATEIO",
        ctrbs: [],
        primeira: { empresa: "Empresa A", valor: "840" },
        segunda: { empresa: "Empresa B", valor: "360" },
      },
    };
    const html =
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Fechamento de teste</title><p>Relatório simulado 40</p></html>';
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
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
            { unit: 2, freight_service: true, freight_closure: permitted },
          ],
        };
      } else if (
        path === "/api/freight-closures" &&
        request.method() === "POST"
      ) {
        posts.push({ path, body: request.postDataJSON() });
        status = conflict ? 409 : 201;
        body = conflict
          ? { message: "Registros alterados. Confira novamente." }
          : { closure };
      } else if (path === "/api/freight-closures/4/cancel") {
        posts.push({ path, body: request.postDataJSON() });
        closure = {
          ...closure,
          status: "CANCELADO",
          cancelamento: {
            motivo: request.postDataJSON().motivo,
            em: "2026-09-23T12:00:00Z",
          },
        };
        body = { closure };
      } else if (path.endsWith("/print")) {
        assert.equal(
          request.headers().authorization,
          "Bearer browser-test-token",
        );
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: html,
        });
        return;
      } else if (path === "/api/freight-closures/preview") {
        assert.equal(url.searchParams.get("semana"), "0001");
        assert.equal(url.searchParams.get("placa"), "ABC1234");
        body = data;
      } else if (path === "/api/freight-closures/4/report") {
        body = { ...data, cabecalho: closure, origem: "FINALIZACAO" };
      } else if (path === "/api/freight-closures") body = [closure];
      else if (
        [
          "/api/manifests",
          "/api/weeks",
          "/api/destinations",
          "/api/registrations/vehicles",
          "/api/registrations/vehicle-types",
          "/api/freight-expenses",
        ].includes(path)
      )
        body = [];
      else {
        errors.push(`Unexpected request: ${request.method()} ${path}`);
        status = 404;
        body = {};
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    async function login() {
      await page.goto(process.env.FRONTEND_URL || "http://127.0.0.1:5173");
      await page.getByLabel("Código do usuário").fill("1");
      await page.getByLabel("Senha", { exact: true }).fill("test-only");
      await page.getByRole("button", { name: "Entrar →" }).click();
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page
        .getByRole("button", { name: "Fechamentos", exact: true })
        .click();
    }
    async function preview() {
      await page.getByLabel("Código da semana").fill("0001");
      await page.getByLabel("Placa para fechamento").fill("abc1234");
      await page
        .getByRole("button", { name: "Relatório de conferência" })
        .click();
      await page
        .getByRole("button", { name: "Finalizar fechamento", exact: true })
        .waitFor({ timeout: 10000 })
        .catch(async (error) => {
          await page.screenshot({
            path: "artifacts/closures/failure.png",
            fullPage: true,
          });
          console.error(
            await page
              .locator(".closure-vba-form input")
              .evaluateAll((inputs) =>
                inputs.map((el) => ({
                  label: el.getAttribute("aria-label"),
                  value: el.value,
                  valid: el.validity.valid,
                  message: el.validationMessage,
                })),
              ),
          );
          console.error(await page.locator("[role=alert]").allTextContents());
          throw error;
        });
    }
    await login();
    await preview();
    await page.getByText("Conferir registros:", { exact: false }).click();
    await page.getByText("Manifesto M1", { exact: false }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    checks++;
    await page.screenshot({
      path: `artifacts/closures/${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Finalizar fechamento", exact: true })
      .click();
    assert.equal(posts.length, 0);
    checks++;
    await page.getByLabel("Placa para fechamento").fill("XYZ1234");
    assert.equal(
      await page.getByRole("button", { name: "Confirmar finalização" }).count(),
      0,
    );
    checks++;
    await preview();
    await page
      .getByRole("button", { name: "Finalizar fechamento", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirmar finalização" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Registros alterados" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Finalizar fechamento", exact: true })
        .count(),
      0,
    );
    assert.deepEqual(posts.at(-1).body, { semana: "0001", placa: "ABC1234" });
    checks++;
    conflict = false;
    await preview();
    await page
      .getByRole("button", { name: "Finalizar fechamento", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirmar finalização" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Fechamento 40 finalizado" })
      .waitFor();
    checks++;
    await page.getByRole("button", { name: "Consultar fechamento 40" }).click();
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Baixar relatório para impressão" })
      .click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), "fechamento-40.html");
    assert.equal(await readFile(await download.path(), "utf8"), html);
    checks++;
    await page
      .getByRole("button", { name: "Cancelar fechamento", exact: true })
      .click();
    const before = posts.length;
    await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
    assert.equal(posts.length, before);
    assert.equal(
      await page
        .getByLabel("Motivo do cancelamento")
        .evaluate((el) => el.validity.valueMissing),
      true,
    );
    checks++;
    await page
      .getByLabel("Motivo do cancelamento")
      .fill("  Correção de teste  ");
    await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Fechamento cancelado" })
      .waitFor();
    assert.deepEqual(posts.at(-1), {
      path: "/api/freight-closures/4/cancel",
      body: { motivo: "Correção de teste" },
    });
    checks++;
    await page.getByRole("button", { name: "Consultar fechamento 40" }).click();
    await page
      .getByRole("heading", { name: "Fechamento 40 · CANCELADO" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Cancelar fechamento", exact: true })
        .count(),
      0,
    );
    await page.getByText("Motivo do cancelamento: Correção de teste").waitFor();
    checks++;
    admin = false;
    closure = { ...closure, status: "FECHADO", cancelamento: null };
    await login();
    await page.getByRole("button", { name: "Consultar fechamento 40" }).click();
    await page
      .getByRole("heading", { name: "Fechamento 40 · FECHADO" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Cancelar fechamento", exact: true })
        .count(),
      0,
    );
    checks++;
    permitted = false;
    await login();
    await page
      .getByRole("button", { name: "Relatório de conferência" })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Excluir pagamento" }).count(),
      0,
    );
    checks++;
    assert.deepEqual(errors, []);
    checks++;
    await context.close();
  }
  console.log(
    `${checks} closure browser checks passed (desktop and mobile; simulated API).`,
  );
} finally {
  await browser.close();
}
