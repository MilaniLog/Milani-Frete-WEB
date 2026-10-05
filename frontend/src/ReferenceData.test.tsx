// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReferenceData from "./ReferenceData";
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response([])),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(kind: "weeks" | "expenses", isAdmin = true) {
  render(
    <ReferenceData
      kind={kind}
      token="token"
      isAdmin={isAdmin}
      expired={vi.fn()}
    />,
  );
}
it("permite consultar despesas, mas esconde manutenção para usuário comum", async () => {
  vi.mocked(fetch).mockImplementation(async () => response([{id:1,codigo:'0003',nome:'MOEDA - ADIANTAMENTO',tipo:'Debito',ativo:true}]));
  mount('expenses', false);
  await screen.findByText('MOEDA - ADIANTAMENTO');
  expect(screen.queryByRole('button', {name:'+ Nova despesa'})).toBeNull();
  expect(screen.queryByRole('button', {name:'Editar 0003'})).toBeNull();
  expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method)).toBe(true);
});
it("bloqueia a tela de semanas para usuário comum sem consultar a API", async () => {
  mount("weeks", false);
  await screen.findByText(
    "A tela de semanas está disponível apenas para administradores.",
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "+ Nova semana" })).toBeNull();
});
it("valida sete dias e mantém zeros iniciais no código da semana", async () => {
  mount("weeks");
  await screen.findByText("Nenhum cadastro encontrado.");
  fireEvent.click(screen.getByRole("button", { name: "+ Nova semana" }));
  for (const [label, value] of Object.entries({
    Código: "0001",
    "Data inicial": "2026-09-20",
    "Data final": "2026-09-25",
  }))
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
  await screen.findByText(
    "A semana deve conter sete dias, incluindo início e fim.",
  );
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "POST"),
  ).toBe(false);
  fireEvent.change(screen.getByLabelText("Data final"), {
    target: { value: "2026-09-26" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
  await screen.findByText("Semana salva com sucesso.");
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, o]) => o?.method === "POST");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    codigo: "0001",
    data_inicio: "2026-09-20",
    data_fim: "2026-09-26",
  });
});
it("mantém formulário da semana em conflito e não permite mudar o código", async () => {
  vi.mocked(fetch).mockImplementation(async (_, options) =>
    options?.method
      ? response({ message: "Semana já utilizada." }, 409)
      : response([
          { codigo: "0010", data_inicio: "2026-09-20", data_fim: "2026-09-26" },
        ]),
  );
  mount("weeks");
  fireEvent.click(await screen.findByRole("button", { name: "Editar 0010" }));
  expect((screen.getByLabelText("Código") as HTMLInputElement).readOnly).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
  await screen.findByText("Semana já utilizada.");
  expect(
    (screen.getByLabelText("Data inicial") as HTMLInputElement).value,
  ).toBe("2026-09-20");
});
it("permite desativar despesa com booleano e mantém nome e tipo", async () => {
  vi.mocked(fetch).mockImplementation(async (_, options) =>
    response(
      options?.method
        ? {}
        : [
            {
              id: 3,
              codigo: "001",
              nome: "Pedágio",
              tipo: "Credito",
              ativo: true,
            },
          ],
    ),
  );
  mount("expenses", true);
  fireEvent.click(await screen.findByRole("button", { name: "Editar 001" }));
  fireEvent.click(screen.getByLabelText("Ativa para novos lançamentos"));
  fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
  await screen.findByText("Despesa salva com sucesso.");
  const call = vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(call?.[0]).toBe("/api/freight-expenses/3");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    codigo: "001",
    nome: "Pedágio",
    tipo: "Credito",
    ativo: false,
  });
});

it("consulta a semana pelo código como no VBA e salva no registro existente", async () => {
  vi.mocked(fetch).mockImplementation(async (_, options) =>
    response(
      options?.method
        ? {}
        : [
            {
              codigo: "0010",
              data_inicio: "2026-09-20",
              data_fim: "2026-09-26",
            },
          ],
    ),
  );
  mount("weeks");
  await screen.findByRole("button", { name: "Editar 0010" });
  fireEvent.click(screen.getByRole("button", { name: "+ Nova semana" }));
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "0010" },
  });
  fireEvent.blur(screen.getByLabelText("Código"));
  expect(
    (screen.getByLabelText("Data inicial") as HTMLInputElement).value,
  ).toBe("2026-09-20");
  expect((screen.getByLabelText("Código") as HTMLInputElement).readOnly).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
  await screen.findByText("Semana salva com sucesso.");
  expect(fetch).toHaveBeenCalledWith(
    "/api/weeks/0010",
    expect.objectContaining({ method: "PUT" }),
  );
});

it("consulta despesa pelo código e mantém o tipo no grupo de opções", async () => {
  vi.mocked(fetch).mockImplementation(async (_, options) =>
    response(
      options?.method
        ? {}
        : [
            {
              id: 3,
              codigo: "001",
              nome: "Pedágio",
              tipo: "Credito",
              ativo: true,
            },
          ],
    ),
  );
  mount("expenses");
  await screen.findByRole("button", { name: "Editar 001" });
  fireEvent.click(screen.getByRole("button", { name: "+ Nova despesa" }));
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "001" },
  });
  fireEvent.blur(screen.getByLabelText("Código"));
  expect(
    (screen.getByLabelText("Nome da despesa") as HTMLInputElement).value,
  ).toBe("Pedágio");
  expect(
    (screen.getByRole("radio", { name: "Crédito (+)" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Débito (−)" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
  await screen.findByText("Despesa salva com sucesso.");
  expect(fetch).toHaveBeenCalledWith(
    "/api/freight-expenses/3",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        codigo: "001",
        nome: "Pedágio",
        tipo: "Debito",
        ativo: true,
      }),
    }),
  );
});
