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
  manifestos: "M123",
  semana: "2026-09-21",
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
              ? { entry: { numero: 42 } }
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
function values() {
  fireEvent.change(screen.getByLabelText("Semana"), {
    target: { value: "3926" },
  });
  fireEvent.change(screen.getByLabelText("Data do lançamento"), {
    target: { value: "2026-09-21" },
  });
  fireEvent.change(screen.getByLabelText("Despesa"), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("Valor do lançamento"), {
    target: { value: "25.50" },
  });
}
it("abre formulário e salva por placa/semana sem pesquisar manifesto", async () => {
  await mount();
  expect(
    (screen.getByLabelText("Manifesto") as HTMLInputElement).required,
  ).toBe(false);
  expect(document.querySelector("form input")?.getAttribute("name")).toBe(
    "manifesto",
  );
  fireEvent.change(screen.getByLabelText("Placa"), {
    target: { value: "ABC1234" },
  });
  values();
  fireEvent.click(screen.getByRole("button", { name: "Salvar lançamento" }));
  await screen.findByText(/Lançamento 42 salvo/);
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
  fireEvent.change(screen.getByLabelText("Manifesto"), {
    target: { value: "M123" },
  });
  fireEvent.blur(screen.getByLabelText("Manifesto"));
  await waitFor(() =>
    expect((screen.getByLabelText("Placa") as HTMLInputElement).value).toBe(
      "ABC1234",
    ),
  );
  expect((screen.getByLabelText("Placa") as HTMLInputElement).value).toBe(
    "ABC1234",
  );
  await screen.findByDisplayValue("João Silva");
  values();
  fireEvent.click(screen.getByRole("button", { name: "Salvar lançamento" }));
  await screen.findByText(/Lançamento 42 salvo/);
  expect(
    JSON.parse(
      String(
        vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "POST")?.[1]
          ?.body,
      ),
    ),
  ).toHaveProperty("manifesto_id", 88);
});

it("libera número pelo botão Editar, carrega e salva o lançamento sem criar outro", async () => {
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
    String(u).includes("/freight-entries/number/")
      ? Promise.resolve(
          new Response(JSON.stringify({ entry, manifesto: null }), {
            status: 200,
          }),
        )
      : normal(u, o),
  );
  expect(
    (screen.getByLabelText("Núm. lançamento") as HTMLInputElement).readOnly,
  ).toBe(true);
  expect(screen.queryByLabelText("Buscar motorista pelo nome")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  expect(
    (screen.getByLabelText("Núm. lançamento") as HTMLInputElement).readOnly,
  ).toBe(false);
  fireEvent.change(screen.getByLabelText("Núm. lançamento"), {
    target: { value: "12" },
  });
  fireEvent.blur(screen.getByLabelText("Núm. lançamento"));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Valor do lançamento") as HTMLInputElement).value,
    ).toBe("25"),
  );
  fireEvent.change(screen.getByLabelText("Valor do lançamento"), {
    target: { value: "40" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar lançamento" }));
  await screen.findByText(/Lançamento 42 salvo/);
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
it.each([false, true])(
  "exclusão aparece somente ao editar e respeita bloqueio pago=%s",
  async (pago) => {
    await mount();
    expect(
      screen.queryByRole("button", { name: "Excluir lançamento" }),
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
    };
    const normal = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((u, o) =>
      String(u).includes("/freight-entries/number/")
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
          name: "Excluir lançamento",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Núm. lançamento"), {
      target: { value: "12" },
    });
    fireEvent.blur(screen.getByLabelText("Núm. lançamento"));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Valor do lançamento") as HTMLInputElement)
          .value,
      ).toBe("25"),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Excluir lançamento",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(pago);
    if (pago) return;
    fireEvent.click(screen.getByRole("button", { name: "Excluir lançamento" }));
    expect(
      vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "DELETE"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Manter lançamento" }));
    expect(
      screen.queryByRole("button", { name: "Confirmar exclusão" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Excluir lançamento" }));
    fireEvent.change(screen.getByLabelText("Núm. lançamento"), {
      target: { value: "13" },
    });
    expect(
      screen.queryByRole("button", { name: "Confirmar exclusão" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Núm. lançamento"), {
      target: { value: "12" },
    });
    fireEvent.blur(screen.getByLabelText("Núm. lançamento"));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Excluir lançamento",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Excluir lançamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await screen.findByText("Lançamento 12 excluído com sucesso.");
    expect(fetch).toHaveBeenCalledWith(
      "/api/freight-entries/90",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(
      screen.queryByRole("button", { name: "Excluir lançamento" }),
    ).toBeNull();
  },
);

it("não permite salvar em manifesto fechado", async () => {
  await mount(true);
  fireEvent.change(screen.getByLabelText("Manifesto"), {
    target: { value: "M123" },
  });
  fireEvent.blur(screen.getByLabelText("Manifesto"));
  await screen.findByText(/Registro pago ou fechado:/);
  expect(
    (
      screen.getByRole("button", {
        name: "Salvar lançamento",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
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
  fireEvent.change(screen.getByLabelText("Manifesto"), {
    target: { value: "M123" },
  });
  fireEvent.blur(screen.getByLabelText("Manifesto"));
  fireEvent.change(screen.getByLabelText("Manifesto"), {
    target: { value: "" },
  });
  resolve(new Response(JSON.stringify([manifest]), { status: 200 }));
  await waitFor(() =>
    expect((screen.getByLabelText("Placa") as HTMLInputElement).readOnly).toBe(
      false,
    ),
  );
  expect((screen.getByLabelText("Motorista") as HTMLSelectElement).value).toBe(
    "",
  );
});
