// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import FreightEntries from "./FreightEntries";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const manifest = {
  id: 88,
  manifestos: "100018302-4",
  semana: "2026-09-21",
  hora: "10:30",
  placa: "ABC1234",
  motorista: "João Silva",
  tipo_veiculo: "Truck",
  fechamento_id: null,
  num_fechamento: null,
};
async function mount(locked = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string, options?: RequestInit) =>
        new Response(
          JSON.stringify(
            options?.method
              ? { entry: { id: 90, numero: 42 } }
              : url.includes("/weeks")
                ? [
                    {
                      codigo: "3926",
                      data_inicio: "2026-09-20",
                      data_fim: "2026-09-26",
                    },
                  ]
                : url.includes("/freight-expenses")
                  ? [
                      {
                        id: 3,
                        codigo: "01",
                        nome: "Pedágio",
                        tipo: "Credito",
                        ativo: true,
                      },
                    ]
                  : url.includes("/drivers")
                    ? [{ cpf: "12345678901", name: "João Silva" }]
                    : url.includes("/registrations/vehicles")
                      ? [{ plate: "ABC1234" }]
                    : [{ ...manifest, fechamento_id: locked ? 5 : null }],
          ),
          { status: 200 },
        ),
    ),
  );
  render(
    <FreightEntries
      token="test"
      unit={100}
      initialManifestId={null}
      expired={vi.fn()}
      close={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      (
        screen
          .getByLabelText("Manifesto")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    ).toBe(false),
  );
}
async function values() {
  const week = screen.getByLabelText("Semana").closest("label")!
    .querySelector("select") as HTMLSelectElement;
  fireEvent.change(week, {
    target: { value: "3926" },
  });
  fireEvent.change(screen.getByLabelText("Data do vale"), {
    target: { value: "2026-09-21" },
  });
  fireEvent.change(screen.getByLabelText("Despesa"), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("Valor do vale"), {
    target: { value: "25.50" },
  });
  await waitFor(() => expect((screen.getByLabelText("Semana") as HTMLInputElement).value).toContain("3926"));
}
function fillManifest(value = manifest.manifestos) {
  fireEvent.change(screen.getByLabelText("Primeiros três dígitos do manifesto"), {
    target: { value: value.slice(0, 3) },
  });
  const suffix = screen.getByLabelText("Número do manifesto");
  fireEvent.change(suffix, { target: { value: value.slice(3) } });
  fireEvent.blur(suffix);
}

it("mantém a digitação parcial da unidade no campo do manifesto", async () => {
  await mount();
  const prefix = screen.getByLabelText("Primeiros três dígitos do manifesto");

  fireEvent.change(prefix, { target: { value: "1" } });
  expect((prefix as HTMLInputElement).value).toBe("1");
  expect((screen.getByLabelText("Número do manifesto") as HTMLInputElement).value).toBe("");

  fireEvent.change(prefix, { target: { value: "10" } });
  expect((prefix as HTMLInputElement).value).toBe("10");
  expect((screen.getByLabelText("Número do manifesto") as HTMLInputElement).value).toBe("");
});
async function choosePlate(value = "ABC1234") {
  const field = document.querySelector('select[name="placa"]') as HTMLSelectElement;
  fireEvent.change(field, { target: { value } });
  await waitFor(() => expect((screen.getByLabelText("Placa") as HTMLInputElement).value).toBe(value));
}
it("começa por semana, deixa a data vazia e mostra data e hora do manifesto", async () => {
  await mount();
  const week = screen.getByLabelText("Semana");
  const manifestField = screen.getByLabelText("Manifesto");
  expect(
    week.compareDocumentPosition(manifestField) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect((screen.getByLabelText("Data do vale") as HTMLInputElement).value).toBe("");

  fillManifest();
  expect(
    await screen.findByText("Hora: 10:30 · Data: 21/09/2026"),
  ).toBeTruthy();
  expect((screen.getByLabelText("Data do vale") as HTMLInputElement).value).toBe("");
});
it("abre formulário e salva por placa/semana sem pesquisar manifesto", async () => {
  await mount();
  expect(
    (screen.getByLabelText("Número do manifesto") as HTMLInputElement).required,
  ).toBe(false);
  expect(document.querySelector('form input[name="manifesto"]')).toBeTruthy();
  await choosePlate();
  await values();
  fireEvent.click(screen.getByRole("button", { name: "Salvar vale" }));
  await screen.findByText(/Vale 90 salvo/);
  const writes = vi
    .mocked(fetch)
    .mock.calls.filter(([, o]) => o?.method === "POST");
  expect(writes[0][0]).toBe("/api/freight-entries");
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({
    placa: "ABC1234",
    semana: "3926",
    valor: 25.5,
  });
  expect(JSON.parse(String(writes[0][1]?.body))).not.toHaveProperty(
    "manifesto_id",
  );
  expect(
    vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes("/manifests")),
  ).toBe(false);
});
it("preenche dados ao sair do manifesto e envia vínculo", async () => {
  await mount();
  fillManifest();
  await waitFor(() =>
    expect((screen.getByLabelText("Placa") as HTMLInputElement).value).toBe(
      "ABC1234",
    ),
  );
  expect((screen.getByLabelText("Placa") as HTMLInputElement).value).toBe(
    "ABC1234",
  );
  await waitFor(() =>
    expect((screen.getByLabelText("Motorista") as HTMLInputElement).value).toBe(
      "João Silva",
    ),
  );
  await values();
  fireEvent.click(screen.getByRole("button", { name: "Salvar vale" }));
  await screen.findByText(/Vale 90 salvo/);
  expect(
    JSON.parse(
      String(
        vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "POST")?.[1]
          ?.body,
      ),
    ),
  ).toHaveProperty("manifesto_id", 88);

  fireEvent.click(screen.getByRole("button", { name: "Salvar vale" }));
  expect((screen.getByPlaceholderText("000000-0") as HTMLInputElement).value).toBe("018302-4");
  fireEvent.click(screen.getByRole("button", { name: "Salvar vale" }));
  await waitFor(() => {
    expect((screen.getByPlaceholderText("000") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("000000-0") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Semana") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Placa") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Data do vale") as HTMLInputElement).value).toBe("");
  });
  expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
it("salva o vale pelo número antes de o manifesto existir", async () => {
  await mount();
  const normal = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((url, options) =>
    String(url).includes("/manifests?")
      ? Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      : normal(url, options),
  );
  fillManifest();
  await screen.findByText(/Manifesto ainda não cadastrado/);
  await choosePlate();
  await values();
  fireEvent.click(screen.getByRole("button", { name: "Salvar vale" }));
  await screen.findByText(/Vale 90 salvo/);
  const request = vi.mocked(fetch).mock.calls.find(
    ([url, options]) =>
      String(url).endsWith("/freight-entries") && options?.method === "POST",
  );
  expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
    manifesto_numero: manifest.manifestos,
    placa: "ABC1234",
  });
});

it("exibe o ID pelo botão Editar, carrega e salva o vale sem criar outro", async () => {
  await mount();
  const entry = {
    id: 90,
    numero: 12,
    manifesto_id: null,
    placa: "ABC1234",
    semana: "3926",
    motorista: "João Silva",
    tipo_veiculo: "Truck",
    codigo_despesa: "01",
    nome_despesa: "Pedágio",
    tipo_despesa: "Credito",
    data_lancamento: "2026-09-21",
    valor: "25",
    descricao: "Original",
    departamento: "Operação",
    pago: false,
    fechamento_id: null,
  };
  const normal = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((u, o) =>
    !o?.method && String(u).endsWith("/freight-entries/90")
      ? Promise.resolve(
          new Response(JSON.stringify({ entry, manifesto: null }), {
            status: 200,
          }),
        )
      : normal(u, o),
  );
  expect(screen.queryByLabelText("ID do vale")).toBeNull();
  expect(screen.queryByLabelText("Unidade")).toBeNull();
  expect(screen.queryByLabelText("Buscar motorista pelo nome")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  expect(screen.getByLabelText("ID do vale")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("ID do vale"), {
    target: { value: "90" },
  });
  fireEvent.blur(screen.getByLabelText("ID do vale"));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Valor do vale") as HTMLInputElement).value,
    ).toBe("25"),
  );
  fireEvent.change(screen.getByLabelText("Valor do vale"), {
    target: { value: "40" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar vale" }));
  await screen.findByText(/Vale 90 salvo/);
  const write = vi
    .mocked(fetch)
    .mock.calls.find(([, o]) => o?.method === "PUT");
  expect(write?.[0]).toBe("/api/freight-entries/90");
  expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
    valor: 40,
    departamento: "Operação",
  });
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "POST"),
  ).toBe(false);
});
it.each([
  { pago: false, fatura: null },
  { pago: true, fatura: null },
  { pago: false, fatura: 7 },
])(
  "exclusão aparece somente ao editar e respeita bloqueio pago=$pago fatura=$fatura",
  async ({ pago, fatura }) => {
    await mount();
    expect(
      screen.queryByRole("button", { name: "Excluir vale" }),
    ).toBeNull();
    const entry = {
      id: 90,
      numero: 12,
      manifesto_id: null,
      placa: "ABC1234",
      semana: "3926",
      motorista: "João Silva",
      tipo_veiculo: "Truck",
      codigo_despesa: "01",
      nome_despesa: "Pedágio",
      tipo_despesa: "Credito",
      data_lancamento: "2026-09-21",
      valor: "25",
      descricao: "Original",
      departamento: null,
      pago,
      fechamento_id: null,
      fatura_id: fatura,
      numero_fatura: fatura == null ? null : 15,
    };
    const normal = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((u, o) =>
      !o?.method && String(u).endsWith("/freight-entries/90")
        ? Promise.resolve(
            new Response(JSON.stringify({ entry, manifesto: null }), {
              status: 200,
            }),
          )
        : normal(u, o),
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Excluir vale",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("ID do vale"), {
      target: { value: "90" },
    });
    fireEvent.blur(screen.getByLabelText("ID do vale"));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Valor do vale") as HTMLInputElement)
          .value,
      ).toBe("25"),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Excluir vale",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(pago);
    if (pago) return;
    fireEvent.click(screen.getByRole("button", { name: "Excluir vale" }));
    expect(
      vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "DELETE"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Manter vale" }));
    expect(
      screen.queryByRole("button", { name: "Confirmar cancelamento" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Excluir vale" }));
    fireEvent.change(screen.getByLabelText("ID do vale"), {
      target: { value: "91" },
    });
    expect(
      screen.queryByRole("button", { name: "Confirmar cancelamento" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("ID do vale"), {
      target: { value: "90" },
    });
    fireEvent.blur(screen.getByLabelText("ID do vale"));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Excluir vale",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Excluir vale" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    await screen.findByText("Vale 90 cancelado com sucesso. Histórico preservado.");
    expect(fetch).toHaveBeenCalledWith(
      "/api/freight-entries/90",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(
      screen.queryByRole("button", { name: "Excluir vale" }),
    ).toBeNull();
  },
);

it("permite credito e debito em manifesto fechado", async () => {
  await mount(true);
  fillManifest();
  await screen.findByText(/Manifesto fechado: o credito sera pago/);
  expect(
    (
      screen.getByRole("button", {
        name: "Salvar vale",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it("descarta resposta atrasada quando o manifesto é apagado", async () => {
  await mount();
  let resolve!: (r: Response) => void;
  const normal = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((u, o) =>
    String(u).includes("/manifests")
      ? new Promise((r) => {
          resolve = r;
        })
      : normal(u, o),
  );
  fillManifest();
  fireEvent.change(screen.getByLabelText("Número do manifesto"), {
    target: { value: "" },
  });
  resolve(new Response(JSON.stringify([manifest]), { status: 200 }));
  await waitFor(() =>
    expect((screen.getByLabelText("Placa") as HTMLInputElement).disabled).toBe(
      false,
    ),
  );
  expect((screen.getByLabelText("Motorista") as HTMLSelectElement).value).toBe(
    "",
  );
});
