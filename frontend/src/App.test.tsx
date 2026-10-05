// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";

const session = {
  accessToken: "test-token",
  user: { id: 1, cod: 1, name: "Operador", unit: 2, isAdmin: false },
  permissions: [{ unit: 2, freight_service: true }],
};
const manifest = {
  id: 1,
  manifestos: "M123",
  semana: "2026-09-21",
  placa: "ABC1234",
  motorista: "Motorista de teste",
  destino: "Destino",
  frete_veiculo: "250",
  fechamento_id: null,
  num_fechamento: null,
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
it("edita preservando campos financeiros e mantém formulário após conflito", async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  const saved = {
    ...manifest,
    hora: "10:30:45",
    m3: "12.345",
    kg: "500",
    qtd_nf: 3,
    origem: "SP",
    cod_777_00: "1000.1234",
    descarga: "45.6789",
    ctrb_total: "500",
    ctrb_adiantamento: "100",
    sest_senat: "2",
    irrf: "3",
    prev_social: "4",
    inss: "5",
    vale_pedagio: "60",
    romaneio: "ROM",
    ciot: "CIOT",
    ctrb_numero: "000123",
    observacao: "Preservar",
    carga_mista: true,
  };
  vi.mocked(fetch).mockImplementation(async (path, options) => {
    if (path === "/api/manifests/1")
      return options?.method === "PUT"
        ? response({ message: "Registro fechado durante a edição." }, 409)
        : response(saved);
    return originalFetch(path, options);
  });
  await login();
  await screen.findByText("M123");
  fireEvent.click(screen.getByRole("button", { name: "Ver manifesto M123" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Editar manifesto" }),
  );
  await screen.findByRole("option", { name: "Motorista de teste", hidden: true });
  expect(screen.queryByLabelText("Buscar motorista pelo nome")).toBeNull();
  expect((screen.getByLabelText("Hora") as HTMLInputElement).value).toBe(
    "10:30",
  );
  expect(screen.getByLabelText("Hora").getAttribute("type")).toBe("text");
  await screen.findByDisplayValue("Motorista de teste");
  await waitFor(() => expect((screen.getByRole("combobox", {name:"Destino"}) as HTMLInputElement).value).toBe("Destino"));
  fireEvent.focus(screen.getByLabelText("Motorista"));
  fireEvent.click(await screen.findByRole("option", {name:"Motorista de teste"}));
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await screen.findByText("Registro fechado durante a edição.");
  const call = vi
    .mocked(fetch)
    .mock.calls.find(
      ([path, options]) =>
        path === "/api/manifests/1" && options?.method === "PUT",
    );
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    descarga: 45.6789,
    hora: "10:30",
    cod_777_00: 1000.1234,
    ctrb_total: 500,
    ctrb_adiantamento: 100,
    sest_senat: 2,
    irrf: 3,
    prev_social: 4,
    inss: 5,
    vale_pedagio: 60,
    romaneio: "ROM",
    ciot: "CIOT",
    ctrb_numero: "000123",
    observacao: "Preservar",
  });
  expect(JSON.parse(String(call?.[1]?.body))).not.toHaveProperty('carga_mista');
  expect(screen.queryByRole('checkbox', { name: 'Carga mista' })).toBeNull();
  expect(
    (screen.getByLabelText("Observações") as HTMLTextAreaElement).value,
  ).toBe("Preservar");
});

it("não oferece edição para manifesto fechado", async () => {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, options) =>
    path === "/api/manifests/1"
      ? response({ ...manifest, fechamento_id: 9, num_fechamento: 9 })
      : originalFetch(path, options),
  );
  await login();
  await screen.findByText("M123");
  fireEvent.click(screen.getByRole("button", { name: "Ver manifesto M123" }));
  await screen.findByText("Fechado · 9");
  expect(screen.queryByRole("button", { name: "Editar manifesto" })).toBeNull();
});
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/auth/login")) return response(session);
      if (path.endsWith("/drivers"))
        return response([{ cpf: "00123456789", name: "Motorista de teste" }]);
      if (path.endsWith("/registrations/vehicles"))
        return response([{ plate: "ABC1234" }]);
      if (path.endsWith("/manifests/preview"))
        return response({ frete_veiculo: 250, despesas_empresa: 0, totalFretes: 880,
          totalReceive: 880, discounts: 0, freightVehicle: 250, initPercent: 250/880, finalPercent: 250/880,
          freightsCalculated: { freight777: 880, freight888: 0, freight999: 0,
            notDelivery777: 0, notDelivery888: 0, notDelivery999: 0 },
          vehicle: { type: "VAN", max_m3: 10, max_weight: 1000 } });
      if (path.endsWith("/weeks"))
        return response([
          { codigo: "0001", data_inicio: "2026-09-21", data_fim: "2026-09-27" },
        ]);
      if (path.endsWith("/destinations"))
        return response([{ id: 1, nome: "Destino" }]);
      if (path.endsWith("/entries") || path.endsWith("/freight-expenses"))
        return response([]);
      if (init?.method === "POST") return response(manifest, 201);
      return response([manifest]);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function login(openManifests = true) {
  render(<App />);
  fireEvent.change(screen.getByLabelText("Código do usuário"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar →" }));
  if (openManifests) {
    fireEvent.click(await screen.findByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Manifestos" }));
    fireEvent.click(screen.getByRole("button", { name: "Consultar manifestos" }));
  }
}
it("permite acessar fechamentos com permissão financeira sem serviço de manifestos", async () => {
  vi.mocked(fetch).mockImplementation(async (path) =>
    String(path).endsWith("/auth/login")
      ? response({
          ...session,
          permissions: [
            { unit: 2, freight_service: false, freight_closure: true },
          ],
        })
      : response([]),
  );
  await login(false);
  await screen.findByRole("button", { name: "Menu" });
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  expect(screen.getByRole("button", { name: "Manifestos" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechamentos" }));
  await screen.findByText("Conferir semana e veículo");
  expect(
    vi.mocked(fetch).mock.calls.some(([path]) => path === "/api/manifests"),
  ).toBe(false);
});
it("autentica, consulta usando token e filtra por semana", async () => {
  await login();
  await screen.findByText("M123");
  expect(fetch).toHaveBeenCalledWith("/api/manifests?recent=true", expect.anything());
  expect(screen.queryByText("Frete dos veículos")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  expect(screen.queryByRole("button", { name: "Semanas" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.change(screen.getByLabelText("Período da consulta"), {
    target: { value: "0001" },
  });
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/manifests?week=0001",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      }),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("button", { name: "Sair da conta →" }));
  expect(screen.getByRole("button", { name: "Entrar →" })).toBeTruthy();
});
it("mostra manifestos sem exigir permissão individual e só consulta ao abrir a tela", async () => {
  vi.mocked(fetch).mockResolvedValue(
    response({ ...session, permissions: [{ unit: 3, freight_service: true }] }),
  );
  await login(false);
  fireEvent.click(await screen.findByRole("button", { name: "Menu" }));
  expect(screen.getByRole("button", { name: "Manifestos" })).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("retorna ao login quando a API rejeita token expirado", async () => {
  vi.mocked(fetch).mockImplementation(async (path) =>
    String(path).endsWith("/auth/login")
      ? response(session)
      : response({ message: "Unauthorized" }, 401),
  );
  await login();
  await screen.findByText("Sua sessão expirou. Entre novamente.");
});
it("mostra erro de login sem abrir a área interna", async () => {
  vi.mocked(fetch).mockResolvedValue(
    response({ message: "Código ou senha inválidos." }, 401),
  );
  await login(false);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Código ou senha inválidos.",
  );
});
it("envia cadastro com números e mantém CPF como texto", async () => {
  await login();
  await screen.findByText("M123");
  fireEvent.click(screen.getByRole("button", { name: "+ Novo manifesto" }));
  await screen.findByRole("option", { name: "ABC1234", hidden: true });
  for (const [label, value] of Object.entries({
    "Primeiros três dígitos do manifesto": "850",
    "Número do manifesto": "3182",
    "Data do carregamento": "210926",
    Hora: "1000",
    "Frete 777": "1000",
  }))
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  for (const [label, name] of [["Placa","ABC1234"],["Destino","Destino"]]) {
    fireEvent.focus(screen.getByLabelText(label));
    fireEvent.click(await screen.findByRole("option",{name}));
  }
  await screen.findByRole("option", { name: "Motorista de teste", hidden: true });
  fireEvent.focus(screen.getByLabelText("Motorista"));
  fireEvent.click(await screen.findByRole("option", {name:"Motorista de teste"}));
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar manifesto" }));
  await screen.findByText("Manifesto M123 cadastrado com sucesso.");
  const call = vi
    .mocked(fetch)
    .mock.calls.find(
      ([path, init]) => path === "/api/manifests" && init?.method === "POST",
    );
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    manifestos: "850000318-2",
    placa: "ABC1234",
    cpf_motorista: "00123456789",
    cod_777_00: 1000,
    destino_id: 1,
  });
});

it("calcula retenções e líquido automaticamente sem descontar vale-pedágio", async () => {
  await login();
  await screen.findByText("M123");
  fireEvent.click(screen.getByRole("button", { name: "+ Novo manifesto" }));
  for (const [label, value] of Object.entries({
    "CTRB total": "1000", "Adiantamento CTRB": "200", "SEST/SENAT": "10",
    "IRRF": "20", "Previdência social": "30", "INSS": "40", "Vale-pedágio": "500",
  })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect((screen.getByLabelText("Total de retenções") as HTMLInputElement).value).toMatch(/100,00/);
  expect((screen.getByLabelText("Valor líquido") as HTMLInputElement).value).toMatch(/700,00/);
  expect((screen.getByLabelText("Valor líquido") as HTMLInputElement).readOnly).toBe(true);
  expect(vi.mocked(fetch).mock.calls.some(([p, o]) => p === "/api/manifests" && o?.method === "POST")).toBe(false);
});

it("preenche frete padrão, mostra cálculos e mantém frete manual", async () => {
  await login();
  await screen.findByText("M123");
  fireEvent.click(screen.getByRole("button", { name: "+ Novo manifesto" }));
  await screen.findByRole("option", { name: "ABC1234", hidden: true });
  fireEvent.focus(screen.getByLabelText("Placa"));
  fireEvent.click(await screen.findByRole("option", {name:"ABC1234"}));
  await screen.findByLabelText("Frete 777 calculado");
  expect((screen.getByLabelText("Frete do veículo") as HTMLInputElement).value).toBe("250");
  fireEvent.change(screen.getByLabelText("Frete do veículo"), { target: { value: "333" } });
  fireEvent.change(screen.getByLabelText("Volume (m³)"), { target: { value: "11" } });
  await screen.findByText(/A cubagem permitida/);
  expect((screen.getByLabelText("Frete do veículo") as HTMLInputElement).value).toBe("333");
  const calls = vi.mocked(fetch).mock.calls.filter(([p]) => p === "/api/manifests/preview");
  expect(JSON.parse(String(calls.at(-1)?.[1]?.body)).frete_veiculo).toBe(333);
});

it("abre na home, recolhe o menu e volta para a home pelo logo sem perder a sessão", async () => {
  await login(false);
  await screen.findByRole("heading", { name: "Sua carga, nosso compromisso." });
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("button", { name: "Manifestos" }));
  expect(screen.getByRole("heading", {name:"Novo manifesto"})).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(([path]) => path === "/api/manifests?recent=true")).toBe(false);
  fireEvent.click(screen.getByRole("button", {name:"Consultar manifestos"}));
  await screen.findByText("M123");
  expect(screen.queryByRole("navigation")).toBeNull();
  fireEvent.click(
    screen.getByRole("link", { name: "Milani — Página inicial" }),
  );
  await screen.findByRole("heading", { name: "Sua carga, nosso compromisso." });
  expect(screen.queryByRole("button", { name: "Entrar →" })).toBeNull();
});

it("fecha o menu por Escape e por clique fora", async () => {
  await login(false);
  const menu = await screen.findByRole("button", { name: "Menu" });
  fireEvent.click(menu);
  expect(menu.getAttribute("aria-expanded")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(menu);
  fireEvent.click(menu);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("navigation")).toBeNull();
});
