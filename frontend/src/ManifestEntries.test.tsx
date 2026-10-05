// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import ManifestEntries from "./ManifestEntries";

const entry = {
  id: 9,
  numero: 12,
  codigo_despesa: "01",
  nome_despesa: "Pedágio",
  tipo_despesa: "Credito",
  data_lancamento: "2026-09-21",
  valor: "25.00",
  descricao: "Original",
  departamento: "Operação",
  pago: false,
  fechamento_id: null,
};
const expense = {
  id: 3,
  codigo: "01",
  nome: "Pedágio",
  tipo: "Credito",
  ativo: true,
};
const onUpdated = vi.fn();
const onBusy = vi.fn();
const onExpired = vi.fn();
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (options?.method)
        return response({
          manifesto: { id: 1, frete_veiculo: "100", frt_tl_vlc: "125" },
        });
      return response(path.endsWith("/freight-expenses") ? [expense] : [entry]);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(locked = false) {
  render(
    <ManifestEntries
      manifestId={1}
      date="2026-09-21"
      locked={locked}
      token="token"
      onUpdated={onUpdated}
      onBusy={onBusy}
      onExpired={onExpired}
    />,
  );
}
it("inclui valor numérico, sem enviar semana manual, e atualiza manifesto", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "+ Novo lançamento" }),
  );
  fireEvent.change(screen.getByLabelText("Despesa"), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("Valor do lançamento"), {
    target: { value: "30.50" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar lançamento" }));
  await screen.findByText("Lançamento salvo. Valores recalculados.");
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, o]) => o?.method === "POST");
  expect(call?.[0]).toBe("/api/manifests/1/entries");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    despesa_id: 3,
    data_lancamento: "2026-09-21",
    valor: 30.5,
    descricao: "",
    departamento: "",
  });
  expect(onUpdated).toHaveBeenCalledWith(
    expect.objectContaining({ frt_tl_vlc: "125" }),
  );
});
it("preserva descrição e departamento na edição e mantém formulário em conflito", async () => {
  vi.mocked(fetch).mockImplementation(async (path, options) =>
    options?.method
      ? response({ message: "Lançamento pago." }, 409)
      : response(
          String(path).endsWith("/freight-expenses") ? [expense] : [entry],
        ),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Editar lançamento 12" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar lançamento" }));
  await screen.findByText("Lançamento pago.");
  const call = vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(call?.[0]).toBe("/api/manifests/1/entries/9");
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    descricao: "Original",
    departamento: "Operação",
  });
  expect(
    (screen.getByLabelText("Descrição do lançamento") as HTMLTextAreaElement)
      .value,
  ).toBe("Original");
  expect(onUpdated).not.toHaveBeenCalled();
});
it("exige confirmação para excluir", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Excluir lançamento 12" }),
  );
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await screen.findByText("Lançamento excluído. Valores recalculados.");
  expect(fetch).toHaveBeenCalledWith(
    "/api/manifests/1/entries/9",
    expect.objectContaining({ method: "DELETE" }),
  );
});
it.each([true, false])(
  "bloqueia alterações de registro fechado/pago (manifesto fechado: %s)",
  async (locked) => {
    vi.mocked(fetch).mockImplementation(async (path) =>
      response(
        String(path).endsWith("/freight-expenses")
          ? [expense]
          : [{ ...entry, pago: true }],
      ),
    );
    mount(locked);
    await screen.findByText("Pago / fechado");
    expect(
      screen.queryByRole("button", { name: "Editar lançamento 12" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Excluir lançamento 12" }),
    ).toBeNull();
    if (locked)
      expect(
        screen.queryByRole("button", { name: "+ Novo lançamento" }),
      ).toBeNull();
  },
);
it("não informa falha de gravação quando somente a atualização da lista falha", async () => {
  let saved = false;
  vi.mocked(fetch).mockImplementation(async (path, options) => {
    if (options?.method) {
      saved = true;
      return response({ manifesto: { id: 1 } });
    }
    if (saved) return response({ message: "Falha na consulta." }, 500);
    return response(
      String(path).endsWith("/freight-expenses") ? [expense] : [entry],
    );
  });
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Excluir lançamento 12" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await screen.findByText("Lançamento excluído. Valores recalculados.");
  await screen.findByText("Falha na consulta.");
  await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
});
