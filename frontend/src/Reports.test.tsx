// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import FinancialReports from "./FinancialReports";
import Destinations from "./Destinations";
import ReprintClosures from "./ReprintClosures";
vi.mock("./report-download", () => ({ downloadReport: vi.fn() }));
import { downloadReport } from "./report-download";
const result = {
  title: "Relatório de teste",
  notes: ["Unidade 100"],
  columns: ["Documento", "Valor"],
  numeric: [1],
  rows: [["0001", "25.10"]],
  totals: [{ label: "Total", value: "25.10" }],
};
const financialResult = {
  title: "Relatório de teste",
  notes: ["Unidade 100"],
  columns: ["Origem", "ID Vale", "Data", "Placa", "Motorista", "Manifesto", "Código", "Tipo", "Descrição", "D/C", "Valor", "Departamento", "Usuário", "Nº Fech. Vale", "Situação"],
  numeric: [10],
  rows: [
    ["Vale", 1001, "20/09/2026", "ABC1234", "Motorista", "100000001-1", "0001", "MOEDA", "Descrição", "Debito", "25.10", "FIN", 7, null, "Em aberto"],
    ["Vale", 1002, "21/09/2026", "XYZ9Z99", "Outro", "100000002-1", "0002", "PEDÁGIO", "Descrição 2", "Debito", "30.00", "FIN", 8, null, "Em aberto"],
  ],
  totals: [{ label: "Total", value: "25.10" }],
};
const response = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status });
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (p: string, o?: RequestInit) => {
      if (p.endsWith("/destinations"))
        return o?.method
          ? response({ id: 2, nome: "Campinas" }, 201)
          : response([
              { id: 1, nome: "São Paulo" },
              { id: 2, nome: "Campinas" },
            ]);
      if (p.endsWith("/weeks"))
        return response([
          { codigo: "3926", data_inicio: "2026-09-20", data_fim: "2026-09-26" },
        ]);
      if (p.endsWith("/registrations/vehicles"))
        return response([{ plate: "ABC1234", codVehicleType: 1 }]);
      if (p.endsWith("/registrations/vehicle-types"))
        return response([{ codVehicleType: 1, typeName: "VAN" }]);
      if (p.endsWith("/registrations/companies"))
        return response([{ sigla: "MMA", nome: "Empresa MMA" }]);
      if (p.endsWith("/registrations/units"))
        return response([
          { codigo: 100, local: "SP", dominio: "LOOG" },
          { codigo: 301, local: "SSA", dominio: "MLN" },
        ]);
      if (p.endsWith("/freight-expenses"))
        return response([
          { codigo: "0001", nome: "MOEDA", tipo: "Debito", ativo: true },
          { codigo: "0060", nome: "COMPLEMENTO", tipo: "Credito", ativo: true },
        ]);
      if (
        p.includes("/reprint?") ||
        p.includes("/spreadsheet?") ||
        p.includes("/print?")
      )
        return new Response("<html>Teste</html>");
      if (p.includes("/freight-reports/financial?"))
        return response(financialResult);
      return response(result);
    }),
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("permite cadastrar destino e pesquisar pelo nome sem acentos", async () => {
  render(<Destinations token="t" expired={vi.fn()} />);
  await screen.findByText("São Paulo");
  fireEvent.change(screen.getByLabelText("Destino"), {
    target: { value: " Campinas " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar destino" }));
  await screen.findByText("Destino Campinas cadastrado.");
  expect(fetch).toHaveBeenCalledWith(
    "/api/destinations",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ nome: "Campinas" }),
    }),
  );
  fireEvent.change(screen.getByLabelText("Pesquisar destino"), {
    target: { value: "sao" },
  });
  expect(screen.getByText("São Paulo")).toBeTruthy();
  expect(screen.queryByRole("cell", { name: "Campinas" })).toBeNull();
});
it("envia filtros de vales e invalida o resultado ao trocar o período", async () => {
  render(<FinancialReports kind="financial" token="t" isAdmin userUnit={100} expired={vi.fn()} />);
  await waitFor(() =>
    expect(document.querySelectorAll('.searchable-select select option').length).toBe(3),
  );
  fireEvent.click(screen.getByLabelText("Unidade"));
  fireEvent.click(await screen.findByRole("option", { name: "SSA" }));
  fireEvent.change(screen.getByLabelText("Semana"), {
    target: { value: "3926" },
  });
  fireEvent.change(screen.getByLabelText("Departamento"), {
    target: { value: "FIN" },
  });
  fireEvent.click(screen.getByLabelText("Dt. de lanç."));
  fireEvent.change(screen.getByLabelText("Crédito / débito"), {
    target: { value: "debito" },
  });
  fireEvent.change(screen.getByLabelText("Tipo"), {
    target: { value: "0001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
  await screen.findByRole("heading", { name: "Relatório de teste" });
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([p]) => String(p).includes("/financial?"));
  const q = new URL(String(call?.[0]), "http://test").searchParams;
  expect(q.get("semana")).toBe("3926");
  expect(q.get("departamento")).toBe("FIN");
  expect(q.get("local")).toBe("SSA");
  expect(q.get("data_por")).toBe("inclusao");
  expect(q.get("movimento")).toBe("debito");
  expect(q.get("tipo")).toBe("0001");
  expect((screen.getByLabelText("Dt. da desp.") as HTMLInputElement).checked).toBe(false);
  await waitFor(() => expect(downloadReport).toHaveBeenCalledWith(
    expect.stringContaining("/financial/print?"), "t", "vales.html",
  ));
  expect(q.get("lancamentos")).toBe("true");
  expect(q.get("cupons")).toBe("false");
  expect(screen.getByText("1 de 2 · ABC1234 · VAN · Motorista")).toBeTruthy();
  expect(screen.getByRole("cell", { name: "1001" })).toBeTruthy();
  expect(screen.queryByRole("cell", { name: "1002" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
  expect(screen.getByText("2 de 2 · XYZ9Z99 · Outro")).toBeTruthy();
  expect(screen.getByRole("cell", { name: "1002" })).toBeTruthy();
  expect(screen.queryByRole("cell", { name: "1001" })).toBeNull();
  expect(screen.getAllByText(/R\$.*30,00/).length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByText(/R\$.*25,10/)).toBeNull();
  expect(screen.getByText("0002 - PEDÁGIO")).toBeTruthy();
  expect(screen.getByText("Débitos")).toBeTruthy();
  expect(screen.queryByText("Créditos")).toBeNull();
  expect(screen.queryByText("CTRB")).toBeNull();
  expect(screen.queryByText("Totais da placa XYZ9Z99")).toBeNull();
  fireEvent.change(screen.getByLabelText("Início"), {
    target: { value: "2026-09-20" },
  });
  expect((screen.getByLabelText("Semana") as HTMLInputElement).value).toBe("");
  expect(
    screen.queryByRole("button", { name: "Baixar para impressão" }),
  ).toBeNull();
});
it("planilha filtra por domínio e placa, sem campo de empresa, e oferece arquivo Excel", async () => {
  render(<FinancialReports kind="payments" token="t" isAdmin expired={vi.fn()} />);
  await screen.findByRole("option", { name: "MLN" });
  fireEvent.change(screen.getByLabelText("Semana"), {
    target: { value: "3926" },
  });
  fireEvent.change(screen.getByLabelText("Placa"), {
    target: { value: "ABC1234" },
  });
  fireEvent.change(screen.getByLabelText("Domínio"), {
    target: { value: "MLN" },
  });
  fireEvent.change(screen.getByLabelText("Categoria de veículo"), {
    target: { value: "Esporadico" },
  });
  expect(screen.queryByLabelText("Empresa")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Relatório" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Baixar planilha Excel" }),
  );
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([p]) =>
        String(p).includes("/payments?semana=3926&placa=ABC1234&dominio=MLN&categoria=Esporadico"),
      ),
  ).toBe(true);
  await waitFor(() =>
    expect(downloadReport).toHaveBeenCalledWith(
      expect.stringContaining("/payments/spreadsheet?"),
      "t",
      "planilha-pagamentos.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  );
});
it("reimprime por número sem enviar gravações nem filtros de outro fechamento", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<ReprintClosures token="t" expired={vi.fn()} />);
  fireEvent.click(screen.getByText("Reimprimir fechamento"));
  fireEvent.change(
    screen.getByLabelText("Número do fechamento para reimpressão"),
    { target: { value: "40" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Imprimir fechamento de frete" }));
  await screen.findByText("Fechamento de frete baixado com sucesso.");
  expect(window.open).toHaveBeenCalledWith("", "_blank");
  expect(
    screen.getByRole("button", { name: "Imprimir relatório do motorista" }),
  ).toBeTruthy();
  expect(
    vi.mocked(fetch).mock.calls.some(
      ([path]) =>
        path === "/api/freight-reports/closures/reprint?numero=40",
    ),
  ).toBe(true);
  expect(vi.mocked(fetch).mock.calls.some(([, o]) => o?.method)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Imprimir relatório do motorista" }));
  await screen.findByText("Relatório do motorista baixado com sucesso.");
  expect(
    vi.mocked(fetch).mock.calls.some(
      ([path]) => path === "/api/freight-reports/closures/drivers?numero=40",
    ),
  ).toBe(true);
});

it("filtra a reimpressão por domínio e unidade", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn(),
  }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<ReprintClosures token="t" isAdmin userUnit={100} expired={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText("Unidade")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Domínio"), { target: { value: "MLN" } });
  fireEvent.click(screen.getByLabelText("Unidade"));
  fireEvent.click(await screen.findByRole("option", { name: "SSA" }));
  fireEvent.change(screen.getByLabelText("Categoria de veículo"), { target: { value: "Agregado" } });
  fireEvent.change(screen.getByLabelText("Número do fechamento para reimpressão"), { target: { value: "40" } });
  fireEvent.click(screen.getByRole("button", { name: "Imprimir fechamento de frete" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    "/api/freight-reports/closures/reprint?numero=40&categoria=Agregado&dominio=MLN&local=SSA",
    expect.anything(),
  ));
});

it("gera cupons separadamente, inclusive na impressao", async () => {
  render(<FinancialReports kind="coupons" token="t" expired={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Semana"), {target:{value:"3926"}});
  fireEvent.click(screen.getByRole("button", {name:"Imprimir"}));
  await screen.findByRole("heading", {name:"Relatório de teste"});
  const call = vi.mocked(fetch).mock.calls.find(([p])=>String(p).includes("/financial?"));
  const q = new URL(String(call?.[0]), "http://test").searchParams;
  expect(q.get("lancamentos")).toBe("false");
  expect(q.get("cupons")).toBe("true");
  await waitFor(()=>expect(downloadReport).toHaveBeenCalledWith(expect.stringContaining("lancamentos=false&cupons=true"), "t", "cupons.html"));
});
