import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("artifacts/reports", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    }),
    errors = [],
    writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const destinations = [{ id: 1, nome: "São Paulo" }];
  const report = {
    title: "Conferência de lançamentos e cupons",
    notes: ["Unidade 100 · Semana 3926"],
    columns: [
      "Origem",
      "Lanç",
      "Data",
      "Placa",
      "Motorista",
      "Manif/NF",
      "Código",
      "Tipo",
      "Descrição",
      "D/C",
      "Valor",
      "Departamento",
      "Situação",
    ],
    rows: [
      [
        "Lançamento",
        12,
        "21/09/2026",
        "ABC1234",
        "Motorista teste",
        "M001",
        "0002",
        "Pedágio",
        "Teste",
        "Credito",
        "25.10",
        "Operação",
        "Em aberto",
      ],
    ],
    numeric: [10],
    totals: [{ label: "Créditos menos débitos e cupons", value: "25.10" }],
  };
  const payments = {
    title: "Planilha de pagamentos",
    notes: [
      "Unidade 100 · Semana 3926",
      "LIQ PAGAR = líquido do fechamento − CTRB bruto.",
    ],
    columns: [
      "EMPR",
      "CPF/CNPJ PROP",
      "NOME PROP",
      "SEM",
      "FECH",
      "PLACA",
      "TTL FRETE",
      "CTRB BRT",
      "LIQ S/ CTRB",
      "VALES",
      "LIQ PAGAR",
      "UN",
      "CTRB LIQ",
    ],
    rows: [
      [
        "MMA",
        "00123456789",
        "Proprietário teste",
        "3926",
        "40",
        "ABC1234",
        "1000",
        "200",
        "800",
        "100",
        "700",
        "100",
        "150",
      ],
    ],
    numeric: [6, 7, 8, 9, 10, 12],
    totals: [{ label: "Total LIQ PAGAR", value: "700" }],
  };
  const html =
      '<!doctype html><html><meta charset="utf-8"><body>Reimpressão de teste</body></html>',
    xml =
      '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"/>';
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      p = u.pathname.replace("/api", "");
    let body = [],
      status = 200;
    if (p === "/auth/login")
      body = {
        accessToken: "test",
        user: { id: 1, cod: 2, name: "Operador", unit: 100, isAdmin: false },
        permissions: [],
      };
    else if (p === "/destinations") {
      if (req.method() === "POST") {
        writes.push({ p, body: req.postDataJSON() });
        body = { id: 2, nome: req.postDataJSON().nome };
        destinations.push(body);
        status = 201;
      } else body = destinations;
    } else if (p === "/weeks")
      body = [
        { codigo: "3926", data_inicio: "2026-09-20", data_fim: "2026-09-26" },
      ];
    else if (p === "/registrations/vehicles")
      body = [{ plate: "ABC1234", codVehicleType: 1 }];
    else if (p === "/registrations/vehicle-types")
      body = [{ codVehicleType: 1, typeName: "VAN" }];
    else if (p === "/registrations/companies")
      body = [{ sigla: "MMA", nome: "Empresa MMA" }];
    else if (p === "/freight-reports/financial") {
      assert.equal(u.searchParams.get("semana"), "3926");
      body = report;
    } else if (p === "/freight-reports/payments") {
      assert.equal(u.searchParams.get("empresa"), "MMA");
      body = payments;
    } else if (
      p.endsWith("/print") ||
      p.endsWith("/reprint") ||
      p.endsWith("/spreadsheet")
    ) {
      assert.equal(req.headers().authorization, "Bearer test");
      await route.fulfill({
        status: 200,
        contentType: p.endsWith("/spreadsheet")
          ? "application/vnd.ms-excel"
          : "text/html",
        body: p.endsWith("/spreadsheet") ? xml : html,
      });
      return;
    } else if (!["/freight-closures", "/freight-expenses"].includes(p))
      errors.push(`Rota inesperada: ${p}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Código do usuário").fill("2");
  await page.getByLabel("Senha", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Entrar →" }).click();
  async function navigate(name) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }
  async function download(button, filename, contents) {
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    const file = await wait;
    assert.equal(file.suggestedFilename(), filename);
    assert.equal(await readFile(await file.path(), "utf8"), contents);
  }
  await navigate("Destinos");
  await page.getByLabel("Destino", { exact: true }).fill("Campinas");
  await page.getByRole("button", { name: "Cadastrar destino" }).click();
  await page.getByRole("cell", { name: "Campinas", exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/reports/destinos.png",
    fullPage: true,
  });
  await navigate("Relatório de lançamentos e cupons");
  await page.getByLabel("Semana", { exact: true }).fill("3926");
  await page.getByLabel("Placa", { exact: true }).fill("ABC1234");
  await page.getByText("VAN", { exact: true }).waitFor();
  await page.getByLabel("Departamento", { exact: true }).selectOption("FIN");
  await page.getByLabel("Dt. de lanç.", { exact: true }).check();
  await download("Imprimir", "lancamentos-cupons.html", html);
  await page.getByRole("cell", { name: "25,10", exact: false }).waitFor();
  await page.screenshot({
    path: "artifacts/reports/lancamentos-cupons.png",
    fullPage: true,
  });
  await download("Baixar para impressão", "lancamentos-cupons.html", html);
  await navigate("Planilha de pagamentos");
  await page.getByLabel("Semana", { exact: true }).fill("3926");
  await page.getByLabel("Empresa", { exact: true }).selectOption("MMA");
  await page.getByText("Empresa MMA", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Relatório", exact: true }).click();
  await page.getByRole("cell", { name: "00123456789" }).waitFor();
  await page.screenshot({
    path: "artifacts/reports/pagamentos.png",
    fullPage: true,
  });
  await download("Baixar planilha Excel", "planilha-pagamentos.xml", xml);
  await navigate("Fechamentos");
  await page.getByText("Reimprimir fechamento", { exact: true }).click();
  await page.getByLabel("Número do fechamento para reimpressão").fill("40");
  await download("Reimprimir", "fechamento-40.html", html);
  await page.getByLabel("Número do fechamento para reimpressão").fill("");
  await page.getByLabel("Semana para reimpressão").fill("3926");
  await download("Reimprimir", "fechamentos-3926.html", html);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].p, "/destinations");
  assert.deepEqual(errors, []);
  console.log(
    "Destinos, relatórios, download Excel e reimpressão por número/semana aprovados no Edge com usuário comum e API simulada.",
  );
} finally {
  await browser.close();
}
