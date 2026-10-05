import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Isolated browser fixtures: all API requests are intercepted, including writes.
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("artifacts/operations", { recursive: true });
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
    const writes = [];
    let admin = true;
    let reject = "";
    let note = {
      id: 1,
      numero: "000123",
      data_nota: "2026-09-21",
      emitido_em: "2026-09-22",
      valor: "100",
      saldo: "70",
      tipo_id: 2,
      nome_tipo: "Abastecimento",
      departamento: "Operação",
    };
    let notes = [note];
    let coupons = [
      {
        id: 3,
        placa: "ABC1234",
        motorista: "Motorista de teste",
        semana: "0001",
        valor: "30",
        descricao: "Original",
        departamento: "Operação",
        pago: false,
        fechamento_id: null,
      },
    ];
    let types = [
      {
        id: 2,
        codigo: "01",
        nome: "Abastecimento",
        tipo: "Debito",
        ativo: true,
      },
    ];
    let weeks = [
      { codigo: "0001", data_inicio: "2026-09-20", data_fim: "2026-09-26" },
    ];
    let expenses = [
      { id: 3, codigo: "01", nome: "Pedágio", tipo: "Credito", ativo: true },
    ];
    let manifest = {
      id: 1,
      manifestos: "M123",
      semana: "2026-09-21",
      hora: "10:30:45",
      placa: "ABC1234",
      motorista: "Motorista de teste",
      destino: "Destino",
      m3: "12.345",
      kg: "500",
      qtd_nf: 3,
      frete_veiculo: "250",
      descarga: "45.6789",
      cod_777_00: "1000.1234",
      observacao: "Preservar",
      fechamento_id: null,
      num_fechamento: null,
    };
    let manifests = [manifest];
    let entries = [
      {
        id: 9,
        numero: 12,
        codigo_despesa: "01",
        nome_despesa: "Pedágio",
        tipo_despesa: "Credito",
        data_lancamento: "2026-09-21",
        valor: "25",
        descricao: "Original",
        departamento: "Operação",
        pago: false,
        fechamento_id: null,
      },
    ];
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace("/api", "");
      const method = request.method();
      let body;
      let status = 200;
      const payload = request.postData() ? request.postDataJSON() : null;
      if (path === "/auth/login")
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
      else if (path === "/manifests/preview") {
        const freight = payload.frete_veiculo ?? 250;
        const total = (payload.cod_777_00 || 0) * .93 + (payload.cod_888_00 || 0) * .88 + (payload.cod_999_00 || 0) * .88;
        body = { frete_veiculo: freight, despesas_empresa: 0, totalFretes: total, totalReceive: total, discounts: 0,
          freightVehicle: freight, initPercent: total ? freight / total : 0, finalPercent: total ? freight / total : 0,
          freightsCalculated: { freight777: (payload.cod_777_00 || 0) * .93, freight888: (payload.cod_888_00 || 0) * .88,
            freight999: (payload.cod_999_00 || 0) * .88, notDelivery777: 0, notDelivery888: 0, notDelivery999: 0 },
          vehicle: { type: 'VAN', max_m3: 10, max_weight: 1000 } };
      }
      else if (method !== "GET") {
        writes.push({ path, method, payload });
        if (reject) {
          status = 409;
          body = { message: reject };
        } else if (path.startsWith("/freight-invoice-types")) {
          types = [{ ...types[0], ...payload }];
          body = types[0];
        } else if (path.includes("/coupons")) {
          coupons =
            method === "DELETE"
              ? []
              : [
                  {
                    ...coupons[0],
                    ...payload,
                    id: 3,
                    pago: false,
                    fechamento_id: null,
                  },
                ];
          note = {
            ...note,
            saldo: String(
              Number(note.valor) -
                coupons.reduce((sum, item) => sum + Number(item.valor), 0),
            ),
          };
          notes = [note];
          body = { nota: note };
        } else if (path.startsWith("/freight-invoices")) {
          if (method === "DELETE") {
            notes = [];
            body = { deleted: true };
          } else {
            note = { ...note, ...payload };
            notes = [note];
            body = note;
          }
        } else if (path.startsWith("/weeks")) {
          weeks = [{ ...weeks[0], ...payload }];
          body = weeks[0];
        } else if (path.startsWith("/freight-expenses")) {
          expenses = [{ ...expenses[0], ...payload }];
          body = expenses[0];
        } else if (path.includes("/entries")) {
          entries =
            method === "DELETE"
              ? []
              : [{ ...entries[0], ...payload, id: 9, numero: 12 }];
          body = { manifesto: manifest };
        } else if (path.startsWith("/manifests")) {
          if (method === "DELETE") {
            body = { deletedEntries: entries.length };
            manifests = [];
            entries = [];
          } else {
            manifest = { ...manifest, ...payload };
            manifests = [manifest];
            body = manifest;
          }
        } else {
          errors.push(`Unexpected write: ${method} ${path}`);
          status = 404;
          body = {};
        }
      } else if (path === "/freight-invoice-types") body = types;
      else if (path.endsWith("/coupons")) body = coupons;
      else if (path === "/freight-invoices/1") body = note;
      else if (path === "/freight-invoices") body = notes;
      else if (path === "/drivers")
        body = [{ cpf: "00123456789", name: "Motorista de teste" }];
      else if (path === "/weeks") body = weeks;
      else if (path === "/registrations/vehicles") body = [{ plate: "ABC1234" }];
      else if (path === "/registrations/vehicle-types")
        body = [];
      else if (path === "/freight-expenses") body = expenses;
      else if (path === "/destinations") body = [{ id: 1, nome: "Destino" }];
      else if (path.endsWith("/entries")) body = entries;
      else if (path === "/manifests/1") body = manifest;
      else if (path === "/manifests") body = manifests;
      else {
        errors.push(`Unexpected read: ${path}`);
        status = 404;
        body = {};
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    const button = (name) => page.getByRole("button", { name, exact: true });
    async function navigate(name) {
      await button("Menu").click();
      await button(name).click();
    }
    async function fill(values) {
      const scope = (await page.locator(".invoice-consultation").isVisible())
        ? page.locator(".invoice-consultation")
        : page;
      for (const [label, value] of Object.entries(values)) {
        if (label === "Motorista" || label === "Motorista do cupom") {
          if(label === "Motorista do cupom") await scope
            .getByLabel(`Buscar ${label.toLowerCase()} pelo nome`)
            .fill("Motorista");
          await scope.getByLabel(label, { exact: true }).selectOption(value);
        } else if (label === "Placa") {
          await scope.getByLabel(label, { exact: true }).selectOption(value);
        } else await scope.getByLabel(label, { exact: true }).fill(value);
      }
    }
    async function login() {
      await page.goto(process.env.FRONTEND_URL || "http://127.0.0.1:5173");
      await fill({ "Código do usuário": "1", Senha: "test-only" });
      await button("Entrar →").click();
      await navigate("Manifestos");
      await button("Ver manifesto M123").waitFor();
    }
    async function success(
      text = "Operação concluída. Valores atualizados pelo servidor.",
    ) {
      await page.getByRole("status").filter({ hasText: text }).waitFor();
    }
    async function shot(name) {
      await page.screenshot({
        path: `artifacts/operations/${name}-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > innerWidth)
          .slice(0, 15)
          .map((el) => ({
            tag: el.tagName,
            name: el.getAttribute("class"),
            width: el.getBoundingClientRect().width,
          })),
      }));
      assert.ok(overflow.scroll <= overflow.width, JSON.stringify(overflow));
      checks++;
    }
    await login();
    await navigate("Notas e cupons");
    await page
      .getByText("Consultar notas, cupons e tipos de nota", { exact: true })
      .click();
    await button("Abrir nota 000123").click();
    await button("Editar cupom 3").click();
    await page
      .getByRole("option", { name: "Motorista de teste" })
      .waitFor({ state: "attached" });
    assert.equal(
      await page
        .locator(".invoice-consultation")
        .getByLabel("Motorista do cupom", { exact: true })
        .inputValue(),
      "00123456789",
    );
    reject = "Saldo insuficiente.";
    await fill({
      "Motorista do cupom": "00123456789",
      "Valor do cupom": "101",
    });
    await button("Salvar cupom").click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Saldo insuficiente." })
      .waitFor();
    assert.equal(
      await page
        .locator(".invoice-consultation")
        .getByLabel("Valor do cupom")
        .inputValue(),
      "101",
    );
    assert.equal(writes.at(-1).payload.departamento, "Operação");
    checks++;
    reject = "";
    await page
      .locator(".invoice-consultation")
      .getByLabel("Valor do cupom")
      .fill("40");
    await button("Salvar cupom").click();
    await success();
    await page.getByText("R$ 60,00", { exact: true }).first().waitFor();
    checks++;
    await shot("notas");
    await button("Excluir cupom 3").click();
    const beforeDelete = writes.length;
    await button("Confirmar exclusão").waitFor();
    assert.equal(writes.length, beforeDelete);
    await button("Confirmar exclusão").click();
    await page.getByText("Nenhum cupom vinculado.").waitFor();
    assert.equal(writes.at(-1).method, "DELETE");
    checks++;
    await button("Editar nota").click();
    assert.equal(
      await page
        .locator(".invoice-consultation")
        .getByLabel("Número da nota")
        .inputValue(),
      "000123",
    );
    await page
      .locator(".invoice-consultation")
      .getByLabel("Valor da nota")
      .fill("120");
    await button("Salvar nota").click();
    await success();
    assert.equal(writes.at(-1).payload.numero, "000123");
    checks++;
    await page.getByText("Tipos de nota: cadastrar e editar").click();
    await button("Editar tipo 01").click();
    await page
      .locator(".invoice-consultation")
      .getByLabel("Tipo ativo")
      .uncheck();
    await button("Salvar tipo").click();
    await success();
    assert.equal(writes.at(-1).payload.ativo, false);
    assert.equal(await button("+ Nova nota").count(), 0);
    await button("Editar nota").click();
    assert.equal(await button("Salvar nota").isDisabled(), true);
    checks++;
    await button("Cancelar edição da nota").click();
    await button("Editar tipo 01").click();
    await page
      .locator(".invoice-consultation")
      .getByLabel("Tipo ativo")
      .check();
    await button("Salvar tipo").click();
    await success();
    await button("Editar nota").click();
    await fill({
      "Número da nota": "000123",
      "Data da nota": "2026-09-21",
      "Data de emissão": "2026-09-22",
      "Valor da nota": "100",
    });
    await page
      .locator(".invoice-consultation")
      .getByLabel("Tipo da nota")
      .selectOption("2");
    await button("Salvar nota").click();
    await success();
    assert.equal(writes.at(-1).method, "PUT");
    assert.equal(writes.at(-1).payload.tipo_id, 2);
    checks++;
    await button("+ Novo cupom").click();
    await fill({
      "Placa do cupom": "abc1234",
      "Motorista do cupom": "00123456789",
      "Semana do cupom": "0001",
      "Valor do cupom": "30",
    });
    await button("Salvar cupom").click();
    await success();
    assert.equal(writes.at(-1).payload.placa, "ABC1234");
    checks++;
    coupons = coupons.map((c) => ({ ...c, pago: true }));
    await button("Abrir nota 000123").click();
    await page
      .getByText("Há cupons pagos ou fechados:", { exact: false })
      .waitFor();
    assert.equal(await button("Editar nota").count(), 0);
    assert.equal(await button("Excluir nota").count(), 0);
    assert.equal(await button("Editar cupom 3").count(), 0);
    checks++;
    coupons = [];
    await button("Abrir nota 000123").click();
    await button("Excluir nota").click();
    await button("Confirmar exclusão").click();
    await page.getByText("Nenhuma nota disponível na consulta.").waitFor();
    checks++;

    await navigate("Semanas");
    await button("+ Nova semana").click();
    await fill({
      Código: "0001",
      "Data inicial": "2026-09-20",
      "Data final": "2026-09-25",
    });
    const beforeWeek = writes.length;
    await button("Salvar cadastro").click();
    await page
      .getByText("A semana deve conter sete dias, incluindo início e fim.")
      .waitFor();
    assert.equal(writes.length, beforeWeek);
    checks++;
    await page.getByLabel("Data final").fill("2026-09-26");
    await button("Salvar cadastro").click();
    await success("Semana salva com sucesso.");
    assert.equal(writes.at(-1).payload.codigo, "0001");
    checks++;
    await button("Editar 0001").click();
    assert.equal(
      await page
        .getByLabel("Código", { exact: true })
        .evaluate((input) => input.readOnly),
      true,
    );
    reject = "Semana já utilizada.";
    await button("Salvar cadastro").click();
    await page.getByRole("alert").filter({ hasText: reject }).waitFor();
    assert.equal(
      await page.getByLabel("Data inicial").inputValue(),
      "2026-09-20",
    );
    checks++;
    await shot("semanas");
    reject = "";
    await navigate("Despesas");
    await button("Editar 01").click();
    await page.getByLabel("Ativa para novos lançamentos").uncheck();
    await button("Salvar cadastro").click();
    await success("Despesa salva com sucesso.");
    assert.deepEqual(writes.at(-1).payload, {
      codigo: "01",
      nome: "Pedágio",
      tipo: "Credito",
      ativo: false,
    });
    checks++;
    await shot("despesas");
    expenses[0].ativo = true;

    await navigate("Manifestos");
    await button("Ver manifesto M123").click();
    await button("Editar manifesto").click();
    await page
      .getByRole("option", { name: "Motorista de teste" })
      .waitFor({ state: "attached" });
    assert.equal(
      await page.getByLabel("Motorista", { exact: true }).inputValue(),
      "00123456789",
    );
    await page
      .getByLabel("Motorista", { exact: true })
      .selectOption("00123456789");
    reject = "Registro fechado durante a edição.";
    await button("Salvar alterações").click();
    await page.getByRole("alert").filter({ hasText: reject }).waitFor();
    assert.equal(writes.at(-1).payload.descarga, 45.6789);
    assert.equal(writes.at(-1).payload.cod_777_00, 1000.1234);
    assert.equal(writes.at(-1).payload.hora, "10:30");
    checks++;
    await shot("manifesto-edicao");
    reject = "";
    await button("Salvar alterações").click();
    await success("atualizado");
    await button("Ver manifesto M123").click();
    await button("Abrir lançamentos").click();
    await button("Consultar lançamentos do manifesto").click();
    await button("Editar lançamento 12").click();
    reject = "Lançamento pago.";
    await button("Salvar lançamento").click();
    await page.getByRole("alert").filter({ hasText: reject }).waitFor();
    assert.equal(writes.at(-1).payload.descricao, "Original");
    checks++;
    reject = "";
    await button("Salvar lançamento").click();
    await success("Lançamento salvo. Valores recalculados.");
    await button("Excluir lançamento 12").click();
    await button("Confirmar exclusão").click();
    await success("Lançamento excluído. Valores recalculados.");
    checks++;
    await button("+ Novo lançamento").click();
    await shot("formulario-lancamento");
    await page.getByRole("combobox", { name: /^Despesa/ }).selectOption("3");
    await page.getByLabel("Valor do lançamento").fill("30.50");
    await button("Salvar lançamento").click();
    await success("Lançamento salvo. Valores recalculados.");
    assert.equal(writes.at(-1).payload.valor, 30.5);
    assert.equal("semana" in writes.at(-1).payload, false);
    checks++;
    await shot("lancamentos");
    await navigate("Manifestos");
    await button("Ver manifesto M123").click();
    await button("Excluir manifesto").click();
    const beforeManifestDelete = writes.length;
    await button("Confirmar exclusão do manifesto").waitFor();
    assert.equal(writes.length, beforeManifestDelete);
    await button("Confirmar exclusão do manifesto").click();
    await success("excluído");
    checks++;
    await button("+ Novo manifesto").click();
    await fill({
      "Número do manifesto": "M123",
      "Data do carregamento": "2026-09-21",
      Hora: "10:00",
      Placa: "ABC1234",
      Motorista: "00123456789",
      "Frete 777": "1000",
    });
    await page.getByRole("combobox", { name: /^Destino/ }).selectOption("1");
    await button("Cadastrar manifesto").click();
    await success("cadastrado com sucesso");
    assert.equal(writes.at(-1).payload.cpf_motorista, "00123456789");
    checks++;
    manifest.fechamento_id = 4;
    await button("Ver manifesto M123").click();
    await page.getByRole("dialog").waitFor();
    assert.equal(await button("Editar manifesto").count(), 0);
    assert.equal(await button("Excluir manifesto").count(), 0);
    assert.equal(await button("+ Novo lançamento").count(), 0);
    checks++;
    admin = false;
    await login();
    await button("Menu").click();
    assert.equal(await button("Semanas").count(), 0);
    assert.equal(await button("+ Nova semana").count(), 0);
    assert.equal(await button("Editar 0001").count(), 0);
    checks++;
    assert.deepEqual(errors, []);
    checks++;
    await context.close();
  }
  console.log(
    `${checks} operations browser checks passed (desktop and mobile; simulated API).`,
  );
} finally {
  await browser.close();
}
