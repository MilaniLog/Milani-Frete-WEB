import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("artifacts/invoices", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [],
    writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const note = {
    id: 1,
    numero: "000123",
    data_nota: "2026-09-21",
    emitido_em: "2026-09-22",
    valor: "100",
    saldo: "70",
    tipo_id: 2,
    nome_tipo: "Abastecimento",
  };
  const coupon = {
    id: 3,
    nota_id: 1,
    placa: "ABC1234",
    motorista: "Motorista de teste",
    semana: "3926",
    valor: "30",
    descricao: "Abastecimento",
    departamento: null,
    pago: false,
    fechamento_id: null,
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api", "");
    let body = [],
      status = 200;
    if (path === "/auth/login")
      body = {
        accessToken: "test",
        user: { id: 1, cod: 1, name: "Teste", unit: 2, isAdmin: true },
        permissions: [],
      };
    else if (req.method() !== "GET") {
      writes.push({ path, method: req.method(), body: req.postDataJSON() });
      body = { nota: { ...note, saldo: "40" }, coupon };
    } else if (path === "/weeks")
      body = [
        { codigo: "3926", data_inicio: "2026-09-20", data_fim: "2026-09-26" },
      ];
    else if (path === "/registrations/vehicles")
      body = [{ plate: "ABC1234", codVehicleType: 1 }];
    else if (path === "/registrations/vehicle-types")
      body = [{ codVehicleType: 1, typeName: "VAN" }];
    else if (path === "/drivers")
      body = [{ cpf: "00123456789", name: "Motorista de teste" }];
    else if (path === "/freight-invoice-types")
      body = [{ id: 2, codigo: "01", nome: "Abastecimento", ativo: true }];
    else if (path === "/freight-invoices/by-number") {
      if (url.searchParams.get("numero") === "000123") body = note;
      else {
        body = {};
        status = 404;
      }
    } else if (path === "/freight-invoices/launches/3")
      body = { nota: note, coupon };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Código do usuário").fill("1");
  await page.getByLabel("Senha", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Entrar →" }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Notas e cupons", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Motorista de teste", exact: true })
    .waitFor({ state: "attached" });
  assert(await page.getByLabel("Número do lançamento").isDisabled());
  await page.getByLabel("Número da nota").fill("000123");
  await page.getByLabel("Semana do cupom").fill("3926");
  await page.getByText(/Saldo disponível:.*70,00/).waitFor();
  assert.equal(
    await page.getByLabel("Data da nota").inputValue(),
    "2026-09-21",
  );
  await page.getByLabel("Placa do cupom").fill("ABC1234");
  await page.getByLabel("Motorista do cupom").selectOption("00123456789");
  await page.getByLabel("Valor do cupom").fill("30");
  await page.getByLabel("Descrição do cupom").fill("Abastecimento");
  await page.screenshot({
    path: "artifacts/invoices/formulario-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByText(/Lançamento 3 salvo/).waitFor();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/freight-invoices/launches");
  assert.equal(writes[0].body.nota.numero, "000123");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Número do lançamento").fill("3");
  await page.getByRole("button", { name: "Buscar lançamento" }).click();
  await page.getByText(/Saldo disponível:.*70,00/).waitFor();
  assert.equal(
    await page.getByLabel("Motorista do cupom").inputValue(),
    "00123456789",
  );
  await page.getByLabel("Valor do cupom").fill("40");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByText(/Lançamento 3 salvo/).waitFor();
  assert.equal(writes[1].method, "PUT");
  assert.equal(writes[1].path, "/freight-invoices/1/coupons/3");
  assert.deepEqual(errors, []);
  console.log(
    "Formulário Excel validado no Edge: abertura, consulta, preenchimento automático, gravação conjunta e edição. API simulada, sem alterações operacionais.",
  );
} finally {
  await browser.close();
}
