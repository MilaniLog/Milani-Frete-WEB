// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import Invoices from "./InvoiceConsultation";
const note = {
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
const coupon = {
  id: 3,
  placa: "ABC1234",
  motorista: "Motorista",
  semana: "0001",
  valor: "30",
  descricao: "Original",
  departamento: "Operação",
  pago: false,
  fechamento_id: null,
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path.endsWith("/drivers"))
        return response([{ cpf: "00123456789", name: "Motorista" }]);
      if (options?.method)
        return response(
          path.includes("/coupons") ? { nota: { ...note, saldo: "40" } } : note,
          200,
        );
      if (path.endsWith("/freight-invoice-types"))
        return response([
          { id: 2, codigo: "01", nome: "Abastecimento", ativo: true },
        ]);
      if (path.endsWith("/coupons")) return response([coupon]);
      if (path.endsWith("/freight-invoices/1")) return response(note);
      return response([note]);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(isAdmin = false) {
  render(<Invoices token="token" isAdmin={isAdmin} expired={vi.fn()} />);
}
it("edita e desativa tipo de nota preservando débito e código textual", async () => {
  mount();
  await screen.findByRole("button", { name: "Abrir nota 000123" });
  fireEvent.click(screen.getByText("Tipos de nota: cadastrar e editar"));
  fireEvent.click(screen.getByRole("button", { name: "Editar tipo 01" }));
  fireEvent.click(screen.getByLabelText("Tipo ativo"));
  fireEvent.click(screen.getByRole("button", { name: "Salvar tipo" }));
  await screen.findByText(
    "Operação concluída. Valores atualizados pelo servidor.",
  );
  const call = vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(call?.[0]).toBe("/api/freight-invoice-types/2");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    codigo: "01",
    nome: "Abastecimento",
    tipo: "Debito",
    ativo: false,
  });
});
async function open() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Abrir nota 000123" }),
  );
  await screen.findByRole("button", { name: "+ Novo cupom" });
}
it("consulta não oferece nova nota e preserva os dados na edição", async () => {
  mount();
  await open();
  expect(screen.queryByRole("button", { name: /Nova nota/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Editar nota" }));
  for (const [label, value] of Object.entries({
    "Número da nota": "000123",
    "Data da nota": "2026-09-21",
    "Data de emissão": "2026-09-22",
    "Valor da nota": "100",
    "Tipo da nota": "2",
  }))
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar nota" }));
  await screen.findByText(
    "Operação concluída. Valores atualizados pelo servidor.",
  );
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    numero: "000123",
    tipo_id: 2,
    valor: 100,
  });
});
it("mantém edição de cupom após rejeição por saldo e preserva departamento", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, options) =>
    options?.method
      ? response({ message: "Saldo insuficiente." }, 400)
      : original(path, options),
  );
  mount();
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Editar cupom 3" }));
  await waitFor(() => expect(
    (screen.getByLabelText("Motorista do cupom") as HTMLInputElement).value,
  ).toBe("Motorista"));
  fireEvent.change(screen.getByLabelText("Valor do cupom"), {
    target: { value: "101" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar cupom" }));
  await screen.findByText("Saldo insuficiente.");
  const call = vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(call?.[0]).toBe("/api/freight-invoices/1/coupons/3");
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    cpf_motorista: "00123456789",
    semana: "0001",
    departamento: "Operação",
    descricao: "Original",
    valor: 101,
  });
  expect(
    (screen.getByLabelText("Valor do cupom") as HTMLInputElement).value,
  ).toBe("101");
});
it("exige confirmação para excluir cupom e usa saldo retornado", async () => {
  mount();
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Excluir cupom 3" }));
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await screen.findByText(
    "Operação concluída. Valores atualizados pelo servidor.",
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/freight-invoices/1/coupons/3",
    expect.objectContaining({ method: "DELETE" }),
  );
  expect(screen.getByText(/40,00/)).toBeTruthy();
});
it("não permite excluir nota para usuário comum nem editar cupom pago", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, options) =>
    String(path).endsWith("/coupons")
      ? response([{ ...coupon, pago: true }])
      : original(path, options),
  );
  mount();
  await open();
  expect(screen.queryByRole("button", { name: "Excluir nota" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Editar nota" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Editar cupom 3" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "+ Novo cupom" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
