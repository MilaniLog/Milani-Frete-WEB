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
      if (
        p.includes("/reprint?") ||
        p.includes("/spreadsheet?") ||
        p.includes("/print?")
      )
        return new Response("<html>Teste</html>");
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
it("envia filtros de lançamentos e invalida o resultado ao trocar o período", async () => {
  render(<FinancialReports kind="financial" token="t" expired={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Semana"), {
    target: { value: "3926" },
  });
  fireEvent.change(screen.getByLabelText("Departamento"), {
    target: { value: "FIN" },
  });
  fireEvent.click(screen.getByLabelText("Dt. de lanç."));
  fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
  await screen.findByRole("heading", { name: "Relatório de teste" });
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([p]) => String(p).includes("/financial?"));
  const q = new URL(String(call?.[0]), "http://test").searchParams;
  expect(q.get("semana")).toBe("3926");
  expect(q.get("departamento")).toBe("FIN");
  expect(q.get("data_por")).toBe("inclusao");
  expect((screen.getByLabelText("Dt. da desp.") as HTMLInputElement).checked).toBe(false);
  await waitFor(() => expect(downloadReport).toHaveBeenCalledWith(
    expect.stringContaining("/financial/print?"), "t", "lancamentos.html",
  ));
  expect(q.get("lancamentos")).toBe("true");
  expect(q.get("cupons")).toBe("false");
  expect(screen.getByRole("cell", { name: "0001" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Início"), {
    target: { value: "2026-09-20" },
  });
  expect((screen.getByLabelText("Semana") as HTMLInputElement).value).toBe("");
  expect(
    screen.queryByRole("button", { name: "Baixar para impressão" }),
  ).toBeNull();
});
it("planilha filtra por empresa e oferece arquivo Excel", async () => {
  render(<FinancialReports kind="payments" token="t" expired={vi.fn()} />);
  await screen.findByRole("option", { name: "MMA" });
  fireEvent.change(screen.getByLabelText("Semana"), {
    target: { value: "3926" },
  });
  fireEvent.change(screen.getByLabelText("Empresa"), {
    target: { value: "MMA" },
  });
  expect(screen.getByText("Empresa MMA")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Relatório" }));
  await screen.findByRole("button", { name: "Baixar planilha Excel" });
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([p]) =>
        String(p).includes("/payments?semana=3926&empresa=MMA"),
      ),
  ).toBe(true);
});
it("reimprime por número sem enviar gravações nem filtros de outro fechamento", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "Reimprimir" }));
  await screen.findByText(/Relatório baixado/);
  expect(downloadReport).toHaveBeenCalledWith(
    "/freight-reports/closures/reprint?numero=40",
    "t", "fechamento-40.html",
  );
  expect(vi.mocked(fetch).mock.calls.some(([, o]) => o?.method)).toBe(false);
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
