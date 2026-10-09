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
  placa: "ABC1234",
  manifests: [{ id: 1, manifestos: "M1", frete_veiculo: "100" }],
  entries: [],
  coupons: [],
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path.endsWith("/freight-closures/week"))
        return response({ results: [{ closure }] }, 201);
      if (options?.method) return response({ closure }, 201);
      if (path.includes("/conference?")) return response({ groups: [data] });
      if (path.includes("/preview")) return response(data);
      if (path.endsWith("/report")) return response(report);
      return response([closure]);
    }),
  );
});
it("conferência filtrada não oferece finalização parcial e envia os filtros", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Início"), {
    target: { value: "2026-09-20" },
  });
  fireEvent.change(screen.getByLabelText("Fim"), {
    target: { value: "2026-09-26" },
  });
  fireEvent.click(screen.getByLabelText("Incluir finalizados"));
  fireEvent.click(
    screen.getByRole("button", { name: "Relatório de conferência" }),
  );
  await screen.findByRole("heading", { name: /Confer.ncia por placa/ });
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
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "POST"),
  ).toBe(false);
});
it("placa vazia confere toda a semana antes de finalizar, sem filtros de relatório", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Código da semana"), {
    target: { value: "3926" },
  });
  fireEvent.click(screen.getByLabelText("Carga mista"));
  fireEvent.click(screen.getByRole("button", { name: "Fechar semana" }));
  const confirm = await screen.findByRole("button", {
    name: "Confirmar finalização da semana",
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/freight-closures/conference?semana=3926",
    expect.anything(),
  );
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "POST"),
  ).toBe(false);
  fireEvent.click(confirm);
  await screen.findByText("1 fechamentos finalizados.");
  const weekCall = vi
    .mocked(fetch)
    .mock.calls.find(([path, options]) => path === "/api/freight-closures/week" && options?.method === "POST");
  expect(weekCall).toBeTruthy();
  expect(JSON.parse(String(weekCall?.[1]?.body))).toMatchObject({ semana: "3926" });
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
  await screen.findByRole("button", { name: "Consultar fechamento 40" });
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
  });
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
it("não oferece cancelamento para usuário comum", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Consultar fechamento 40" }),
  );
  await screen.findByRole("button", {
    name: "Baixar relatório para impressão",
  });
  expect(
    screen.queryByRole("button", { name: "Cancelar fechamento" }),
  ).toBeNull();
});
it("admin confirma motivo e reabre por ID", async () => {
  mount(true);
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
      method: "POST",
      body: JSON.stringify({ motivo: "Correção" }),
    }),
  );
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
