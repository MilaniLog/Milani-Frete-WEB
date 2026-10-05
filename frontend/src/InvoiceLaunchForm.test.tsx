// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import Invoices from "./Invoices";
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
  motorista: "Motorista",
  semana: "3926",
  valor: "30",
  descricao: "Original",
  departamento: "Operação",
  pago: false,
  fechamento_id: null,
};
const response = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, o?: RequestInit) => {
      if (o?.method)
        return response({ nota: { ...note, saldo: "40" }, coupon });
      if (path.includes("/by-number?"))
        return path.endsWith("000123") ? response(note) : response({}, 404);
      if (path.includes("/launches/")) return response({ nota: note, coupon });
      if (path.endsWith("/weeks"))
        return response([
          { codigo: "3926", data_inicio: "2026-09-20", data_fim: "2026-09-26" },
        ]);
      if (path.endsWith("/drivers"))
        return response([{ cpf: "00123456789", name: "Motorista" }]);
      if (path.endsWith("/vehicles"))
        return response([{ plate: "ABC1234", codVehicleType: 1 }]);
      if (path.endsWith("/vehicle-types"))
        return response([{ codVehicleType: 1, typeName: "VAN" }]);
      if (path.endsWith("/freight-invoice-types"))
        return response([
          { id: 2, codigo: "01", nome: "Abastecimento", ativo: true },
        ]);
      return response([]);
    }),
  ),
);
it("volta da consulta ao lançamento preservando o preenchimento e atualizando os tipos", async () => {
  render(<Invoices token="token" isAdmin={false} expired={vi.fn()} />);
  await screen.findByRole("option", { name: /Abastecimento/ });
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Rascunho preservado" } });
  fireEvent.click(screen.getByText("Consultar notas, cupons e tipos de nota"));
  fireEvent.click(await screen.findByRole("button", { name: "Voltar aos lançamentos" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Voltar aos lançamentos" })).toBeNull());
  await screen.findByRole("button", { name: "Salvar" });
  expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("Rascunho preservado");
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([p]) => String(p).endsWith("/freight-invoice-types")).length).toBeGreaterThanOrEqual(3));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function mount(admin = false) {
  render(<Invoices token="t" isAdmin={admin} expired={vi.fn()} />);
  await screen.findByRole("option", { name: "Motorista" });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
}
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
function fillCoupon() {
  change("Semana do cupom", "3926");
  change("Placa do cupom", "ABC1234");
  change("Motorista do cupom", "00123456789");
  change("Valor do cupom", "30");
}
it("abre para preencher e salva nota e cupom numa única solicitação", async () => {
  await mount();
  expect(
    (screen.getByLabelText("Número do lançamento") as HTMLInputElement)
      .disabled,
  ).toBe(true);
  change("Número da nota", "000999");
  change("Data da nota", "2026-09-21");
  change("Valor da nota", "100");
  change("Tipo da nota", "2");
  fillCoupon();
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByText(/Lançamento 3 salvo/);
  const writes = vi
    .mocked(fetch)
    .mock.calls.filter(([, o]) => o?.method === "POST");
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe("/api/freight-invoices/launches");
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({
    nota: { numero: "000999", valor: 100, tipo_id: 2 },
    cupom: { valor: 30, cpf_motorista: "00123456789", semana: "3926" },
  });
  expect(
    (screen.getByLabelText("Valor do cupom") as HTMLInputElement).value,
  ).toBe("");
});
it("nota existente preenche e protege dados, preservando zeros do número", async () => {
  await mount();
  change("Número da nota", "000123");
  fireEvent.blur(screen.getByLabelText("Número da nota"));
  await screen.findByText(/Saldo disponível:.*70,00/);
  expect(
    (screen.getByLabelText("Data da nota") as HTMLInputElement).value,
  ).toBe("2026-09-21");
  expect(
    (screen.getByLabelText("Valor da nota") as HTMLInputElement).readOnly,
  ).toBe(true);
  fillCoupon();
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByText(/Lançamento 3 salvo/);
  expect(
    JSON.parse(
      String(
        vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "POST")?.[1]
          ?.body,
      ),
    ).nota.numero,
  ).toBe("000123");
});
it("Editar habilita a busca e mantém dados após recusa do saldo", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((p, o) =>
    o?.method === "PUT"
      ? Promise.resolve(response({ message: "Saldo insuficiente." }, 400))
      : original(p, o),
  );
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  change("Número do lançamento", "3");
  fireEvent.click(screen.getByRole("button", { name: "Buscar lançamento" }));
  await screen.findByText(/Saldo disponível:.*70,00/);
  change("Valor do cupom", "101");
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByText("Saldo insuficiente.");
  const call = vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(call?.[0]).toBe("/api/freight-invoices/1/coupons/3");
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    valor: 101,
    departamento: "Operação",
  });
  expect(
    (screen.getByLabelText("Valor do cupom") as HTMLInputElement).value,
  ).toBe("101");
});
it("bloqueia edição de cupom pago e esconde exclusão de nota para usuário comum", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((p, o) =>
    String(p).includes("/launches/")
      ? Promise.resolve(
          response({ nota: note, coupon: { ...coupon, pago: true } }),
        )
      : original(p, o),
  );
  await mount();
  expect(screen.getByRole("button", { name: "Deletar nota" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  change("Número do lançamento", "3");
  fireEvent.click(screen.getByRole("button", { name: "Buscar lançamento" }));
  await screen.findByText(/Cupom pago ou fechado:/);
  expect(
    (screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Excluir cupom" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("exige confirmação para excluir cupom e usa saldo retornado", async () => {
  await mount(true);
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  change("Número do lançamento", "3");
  fireEvent.click(screen.getByRole("button", { name: "Buscar lançamento" }));
  await screen.findByText(/Saldo disponível:.*70,00/);
  fireEvent.click(screen.getByRole("button", { name: "Excluir cupom" }));
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await screen.findByText(/Cupom excluído.*40,00/);
});
