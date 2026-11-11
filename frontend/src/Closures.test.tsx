// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Closures from "./Closures";
const closure = {
  id: 4,
  numero: 40,
  semana: "0001",
  placa: "ABC1234",
  status: "FECHADO",
  total_bruto: "100",
  total_liquido: "80",
};
const data = {
  semana: "0001",
  periodo_inicio: "2026-09-20T00:00:00.000Z",
  periodo_fim: "2026-09-26T00:00:00.000Z",
  origem: "SP",
  placa: "ABC1234",
  motorista: "ALLAN FRANCA",
  tipoVeiculo: "TRUCK",
  closureNumber: 10001,
  manifests: [{
    id: 1,
    unit: 100,
    semana: "2026-09-21",
    manifestos: "100M1",
    frete_veiculo: "100",
    tipo_veiculo: "TRUCK",
    motorista: "ALLAN FRANCA",
    cod_777_15: "100",
    cod_888_25: "20",
    cod_999_100: "30",
    nao_777_calc: "5",
    nao_888_calc: "6",
    nao_999_calc: "7",
    diaria: "1",
    tde: "2",
    escada: "3",
    paletização: "4",
    estadia: "5",
    descarga: "6",
    outros: "7",
    carreg_perc: "0.125",
    perc_final: "0.1",
  }],
  entries: [
    { id: 10, numero: 10, manifesto_id: 1, data_lancamento: "2026-09-21", codigo_despesa: "0060", nome_despesa: "COMPLEMENTO", tipo_despesa: "Credito", valor: "20", responsavel_cod: 7 },
    { id: 11, numero: 11, manifesto_id: 1, data_lancamento: "2026-09-22", codigo_despesa: "0004", nome_despesa: "VALE", tipo_despesa: "Debito", valor: "10", responsavel_cod: 8 },
  ],
  coupons: [{
    id: 21,
    controle_id: 121,
    nota_id: 5,
    data_cobranca: "2026-09-23",
    valor: "15",
    descricao: "Cupom",
    responsavel_cod: 9,
    nota: { codigo_tipo: "0001", nome_tipo: "ABASTECIMENTO" },
  }],
  totals: { total_bruto: "100", total_liquido: "80", total_ctrb: "0" },
  payment: null,
};
const report = { ...data, cabecalho: closure, origem: "FINALIZACAO" };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  vi.spyOn(window, "open").mockReturnValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path.includes("/freight-closures/drafts"))
        return response(
          options?.method === "PUT"
            ? {
                selections: [{ placa: "ABC1234", debit_entry_ids: [11], coupon_ids: [] }],
                lastUpdate: {
                  responsavel_cod: 7,
                  responsavel_nome: "Usuário teste",
                  updated_at: "2026-11-09T12:30:00.000Z",
                },
              }
            : { selections: [], lastUpdate: null },
        );
      if (path.endsWith("/freight-closures/week"))
        return response({ results: [{ closure }] }, 201);
      if (options?.method) return response({ closure }, 201);
      if (path.includes("/conference?"))
        return response({
          groups: [
            path.includes("finalizados=true")
              ? { ...data, isClosed: true }
              : data,
          ],
        });
      if (path.includes("/preview")) return response(data);
      if (path.endsWith("/report")) return response(report);
      return response([closure]);
    }),
  );
});
it("salva as seleções do fechamento no servidor para outros computadores", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "3926" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Relatório de conferência" }));
  const vale = await screen.findByRole("checkbox", { name: "Descontar vale 11" });
  fireEvent.click(vale);
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await screen.findByText(
    "Alterações da semana 3926 salvas para todos os computadores.",
  );
  const save = vi.mocked(fetch).mock.calls.find(
    ([path, options]) =>
      path === "/api/freight-closures/drafts" && options?.method === "PUT",
  );
  expect(save).toBeTruthy();
  expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({
    semana: "3926",
    selections: [
      { placa: "ABC1234", debit_entry_ids: [11], coupon_ids: [] },
    ],
  });
  expect(screen.getByText(/Rascunho salvo por 7 - Usuário teste/)).toBeTruthy();
});
it("mostra os valores agrupados e percentuais de cada manifesto", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "3926" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Relatório de conferência" }));

  const title = await screen.findByText("Informações dos manifestos");
  const section = title.closest(".closure-record-list");
  expect(section?.textContent).toContain("21/09/2026");
  expect(section?.textContent).toContain("100 - M1");
  expect(section?.textContent).toContain("R$ 150,00");
  expect(section?.textContent).toContain("R$ 18,00");
  expect(section?.textContent).toContain("R$ 28,00");
  expect(section?.textContent).toContain("R$ 160,00");
  expect(section?.textContent).toContain("12,50%");
  expect(section?.textContent).toContain("10,00%");
  expect(
    screen
      .getByText("Créditos e manifestos")
      .compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it("conferência filtrada não oferece finalização parcial e envia os filtros", async () => {
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:fechamento"),
    revokeObjectURL: vi.fn(),
  }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  mount();
  fireEvent.change(screen.getByLabelText("Início"), {
    target: { value: "2026-09-20" },
  });
  fireEvent.change(screen.getByLabelText("Fim"), {
    target: { value: "2026-09-26" },
  });
  fireEvent.click(screen.getByLabelText("Mostrar fechamento"));
  fireEvent.click(
    screen.getByRole("button", { name: "Relatório de conferência" }),
  );
  await screen.findByRole("heading", { name: /Confer.ncia por placa/ });
  expect(screen.getByText("0060 - COMPLEMENTO").tagName).toBe("SMALL");
  expect(screen.getByText("0004 - VALE").tagName).toBe("TD");
  expect(screen.getAllByRole("columnheader", { name: "Usuário" })).toHaveLength(2);
  expect(screen.getByRole("cell", { name: "7" })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "8" })).toBeTruthy();
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([p]) => String(p).includes("/conference?"));
  const params = new URL(String(call?.[0]), "http://test").searchParams;
  expect(params.get("inicio")).toBe("2026-09-20");
  expect(params.get("finalizados")).toBe("true");
  expect(
    screen.queryByRole("button", { name: "Finalizar fechamento" }),
  ).toBeNull();
  expect(
    screen.getByRole("heading", {
      name: "1 de 1 · ABC1234 · TRUCK · ALLAN FRANCA · Fechamento 10001 · FECHADO",
    }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Fechar placa" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Fechar semana" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Salvar alterações" })).toBeNull();
  expect(screen.queryByText("Seleções salvas nesta conferência")).toBeNull();
  expect(screen.queryByRole("button", { name: "Baixar conferência" })).toBeNull();
  const reprint = screen.getByRole("button", { name: "Reimprimir fechamento" });
  fireEvent.click(reprint);
  expect(fetch).toHaveBeenCalledWith(
    "/api/freight-reports/closures/reprint?numero=10001",
    expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
  );
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "POST"),
  ).toBe(false);
});
it("fecha todas as placas abertas da semana mesmo estando na primeira", async () => {
  const originalFetch = vi.mocked(fetch);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path.includes("/conference?"))
        return response({
          groups: [
            data,
            { ...data, placa: "XYZ1234", closureNumber: 10002 },
          ],
        });
      if (path.endsWith("/freight-closures/week"))
        return response({ results: [{ closure }, { closure: { ...closure, placa: "XYZ1234" } }] }, 201);
      return originalFetch(path, options);
    }),
  );
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "3926" },
  });
  fireEvent.click(screen.getByLabelText("Carga mista"));
  fireEvent.click(screen.getByRole("button", { name: "Relatório de conferência" }));
  const close = await screen.findByRole("button", { name: "Fechar semana" });
  expect(screen.getByText(/Fechamento 10001/)).toBeTruthy();
  expect(
    screen.getByText("Semana 0001 · 20/09/2026 a 26/09/2026 · Origem SP"),
  ).toBeTruthy();
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "POST"),
  ).toBe(false);
  fireEvent.click(close);
  await screen.findByText("2 fechamentos finalizados.");
  const weekCall = vi
    .mocked(fetch)
    .mock.calls.find(([path, options]) => path === "/api/freight-closures/week" && options?.method === "POST");
  expect(weekCall).toBeTruthy();
  expect(JSON.parse(String(weekCall?.[1]?.body))).toMatchObject({
    semana: "3926",
    placas: ["ABC1234", "XYZ1234"],
  });
  const pdfCalls = vi
    .mocked(fetch)
    .mock.calls.filter(([path]) => String(path).endsWith(".pdf"));
  expect(pdfCalls).toHaveLength(0);
});
it("seleciona e limpa todos os vales e cupons da placa atual", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "3926" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Relatório de conferência" }));
  const selectAll = await screen.findByRole("button", { name: "Selecionar todos" });
  const vale = screen.getByRole("checkbox", { name: "Descontar vale 11" }) as HTMLInputElement;
  const coupon = screen.getByRole("checkbox", { name: "Descontar cupom 121" }) as HTMLInputElement;
  expect(vale.checked).toBe(false);
  expect(coupon.checked).toBe(false);
  const pending = () => screen.getByText("Vales pendentes").closest("tr")?.textContent ?? "";
  expect(pending()).toContain("25,00");

  fireEvent.click(selectAll);
  expect(vale.checked).toBe(true);
  expect(coupon.checked).toBe(true);
  expect(pending()).toContain("0,00");

  fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
  expect(vale.checked).toBe(false);
  expect(coupon.checked).toBe(false);
  expect(pending()).toContain("25,00");
});
it("ordena por data e manifesto e deixa cada crédito abaixo do manifesto vinculado", async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  const ordered = {
    ...data,
    manifests: [
      { id: 2, unit: 100, semana: "2026-10-13", manifestos: "100048749-2", frete_veiculo: "100" },
      { id: 1, unit: 100, semana: "2026-10-13", manifestos: "100048739-2", frete_veiculo: "100" },
    ],
    entries: [
      { id: 31, controle_id: 131, numero: 31, manifesto_id: 2, data_lancamento: "2026-10-13", codigo_despesa: "0060", nome_despesa: "CRÉDITO B", tipo_despesa: "Credito", valor: "20" },
      { id: 30, controle_id: 130, numero: 30, manifesto_id: 1, data_lancamento: "2026-10-13", codigo_despesa: "0060", nome_despesa: "CRÉDITO A", tipo_despesa: "Credito", valor: "20" },
    ],
    coupons: [],
  };
  vi.mocked(fetch).mockImplementation(async (path, options) =>
    String(path).includes("/conference?")
      ? response({ groups: [ordered] })
      : originalFetch(path, options),
  );
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "4226" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Relatório de conferência" }));
  await screen.findByText("CRÉDITO A", { exact: false });
  const section = screen.getByText("Créditos e manifestos").closest(".closure-record-list")!;
  const rows = Array.from(section.querySelectorAll("tbody tr")).map(
    (row) => row.textContent ?? "",
  );
  expect(rows[0]).toContain("048739-2");
  expect(rows[1]).toContain("CRÉDITO A");
  expect(rows[2]).toContain("048749-2");
  expect(rows[3]).toContain("CRÉDITO B");
});
it("atualizar dados recarrega créditos incluídos depois da conferência", async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let conferenceCalls = 0;
  const newCredit = {
    id: 32,
    controle_id: 132,
    numero: 32,
    manifesto_id: 1,
    data_lancamento: "2026-09-21",
    codigo_despesa: "0060",
    nome_despesa: "CRÉDITO ATUALIZADO",
    tipo_despesa: "Credito",
    valor: "30",
  };
  const updatedCtrb = {
    id: 33,
    controle_id: 133,
    numero: 33,
    manifesto_id: 1,
    data_lancamento: "2026-09-21",
    codigo_despesa: "3333",
    nome_despesa: "CTRB",
    tipo_despesa: "Debito",
    descricao: "CTRB ATUALIZADO",
    valor: "45",
  };
  vi.mocked(fetch).mockImplementation(async (path, options) => {
    if (String(path).includes("/conference?")) {
      conferenceCalls += 1;
      return response({
        groups: [{
          ...data,
          entries:
            conferenceCalls > 1
              ? [...data.entries, newCredit, updatedCtrb]
              : data.entries,
        }],
      });
    }
    return originalFetch(path, options);
  });
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "3926" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Relatório de conferência" }));
  await screen.findByRole("button", { name: "Atualizar dados" });
  expect(screen.queryByText("0060 - CRÉDITO ATUALIZADO")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Atualizar dados" }));
  expect(await screen.findByText("0060 - CRÉDITO ATUALIZADO")).toBeTruthy();
  expect(await screen.findByText(/CTRB ATUALIZADO.*subtrai do CTRB/)).toBeTruthy();
});
it("fecha somente a placa exibida na seleção atual", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "3926" },
  });
  fireEvent.click(screen.getByLabelText("Carga mista"));
  fireEvent.click(screen.getByRole("button", { name: "Relatório de conferência" }));
  fireEvent.click(await screen.findByRole("button", { name: "Fechar placa" }));
  await screen.findByText("Placa ABC1234 fechada no fechamento 40.");
  expect(window.open).toHaveBeenCalledWith("", "_blank");
  const call = vi
    .mocked(fetch)
    .mock.calls.find(
      ([path, options]) =>
        path === "/api/freight-closures" && options?.method === "POST",
    );
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    semana: "3926",
    placa: "ABC1234",
    debit_entry_ids: [],
    coupon_ids: [],
  });
  expect(screen.queryByRole("button", { name: "Fechar placa" })).toBeNull();
  expect(
    vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/drivers")),
  ).toEqual([
    expect.arrayContaining(["/api/freight-closures/week/drivers"]),
  ]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(isAdmin = false) {
  render(<Closures token="token" isAdmin={isAdmin} userUnit={100} expired={vi.fn()} />);
}
async function preview() {
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "0001" },
  });
  fireEvent.change(screen.getByLabelText("Placa para fechamento"), {
    target: { value: "abc1234" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Relatório de conferência" }),
  );
  await screen.findByRole("button", { name: "Finalizar fechamento" });
}
it("exige confirmação e envia apenas semana e placa ao finalizar", async () => {
  mount();
  await screen.findByRole("button", { name: "Consultar fechamentos" });
  await preview();
  fireEvent.click(screen.getByRole("button", { name: "Finalizar fechamento" }));
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "POST"),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar finalização" }),
  );
  await screen.findByText(/Fechamento 40 finalizado/);
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, o]) => o?.method === "POST");
  expect(call?.[0]).toBe("/api/freight-closures");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    semana: "0001",
    placa: "ABC1234",
    debit_entry_ids: [],
    coupon_ids: [],
  });
});
it("destaca líquido negativo e impede a finalização", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, options) => {
    if (!options?.method && String(path).includes("/preview"))
      return response({
        ...data,
        totals: { ...data.totals, total_liquido: "-10" },
      });
    return original(path, options);
  });
  mount();
  await preview();
  expect(document.querySelector(".negative-value")?.textContent).toContain(
    "10,00",
  );
  fireEvent.click(screen.getByRole("button", { name: "Finalizar fechamento" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar finalização" }),
  );
  await screen.findByText(/o valor líquido está negativo/i);
  expect(
    vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST"),
  ).toBe(false);
});
it("mudança de placa invalida a conferência e sua confirmação", async () => {
  mount();
  await preview();
  fireEvent.click(screen.getByRole("button", { name: "Finalizar fechamento" }));
  fireEvent.change(screen.getByLabelText("Placa para fechamento"), {
    target: { value: "XYZ1234" },
  });
  expect(
    screen.queryByRole("button", { name: "Confirmar finalização" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Finalizar fechamento" }),
  ).toBeNull();
});
it("oferece cancelamento para usuário comum mediante autorização administrativa", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Consultar fechamentos" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Consultar fechamento 40" }),
  );
  await screen.findByRole("button", {
    name: "Imprimir fechamento de frete",
  });
  expect(
    screen.queryByRole("button", { name: /relatório por motorista/i }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Cancelar fechamento" })).toBeTruthy();
});
it("admin confirma motivo e reabre por ID", async () => {
  mount(true);
  fireEvent.click(await screen.findByRole("button", { name: "Consultar fechamentos" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Consultar fechamento 40" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Cancelar fechamento" }),
  );
  fireEvent.change(screen.getByLabelText("Motivo do cancelamento"), {
    target: { value: "  Correção  " },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar cancelamento" }),
  );
  await screen.findByText(
    "Fechamento cancelado. Registros reabertos e histórico preservado.",
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/freight-closures/4/cancel",
    expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ motivo: "Correção" }),
    }),
  );
});
it("mantém os vales 3333 no final mesmo quando possuem data anterior", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  const withCtrb = {
    ...data,
    entries: [
      {
        id: 12,
        numero: 12,
        manifesto_id: 1,
        data_lancamento: "2026-09-01",
        codigo_despesa: "3333",
        nome_despesa: "CTRB",
        tipo_despesa: "Debito",
        valor: "5",
      },
      ...data.entries,
    ],
  };
  vi.mocked(fetch).mockImplementation(async (path, options) =>
    String(path).includes("/conference?")
      ? response({ groups: [withCtrb] })
      : original(path, options),
  );
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "3926" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Relatório de conferência" }));
  const normalRow = (await screen.findByText("0004 - VALE")).closest("tr")!;
  const ctrbRow = screen.getByText(/subtrai do CTRB/).closest("tr")!;
  const couponRow = Array.from(ctrbRow.closest("table")!.querySelectorAll("tr"))
    .find((row) => row.textContent?.includes("121") && row.textContent?.includes("Cupom"))!;
  expect(normalRow.compareDocumentPosition(ctrbRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(couponRow.compareDocumentPosition(ctrbRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("conflito na finalização exige nova conferência", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, options) =>
    options?.method
      ? response({ message: "Registros alterados." }, 409)
      : original(path, options),
  );
  mount();
  await preview();
  fireEvent.click(screen.getByRole("button", { name: "Finalizar fechamento" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar finalização" }),
  );
  await screen.findByText("Registros alterados.");
  expect(
    screen.queryByRole("button", { name: "Finalizar fechamento" }),
  ).toBeNull();
});
