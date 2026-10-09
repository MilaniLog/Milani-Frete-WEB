// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Registrations from "./Registrations";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(kind: "drivers" | "vehicles", admin = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string, options?: RequestInit) =>
        new Response(
          JSON.stringify(
            options?.method
              ? {}
              : url.endsWith("companies")
                ? [{ sigla: "AZN", nome: "AZN", matriz: "500", cor: "" }]
                : url.endsWith("vehicle-types")
                  ? [{ codVehicleType: 1, typeName: "Truck" }]
                  : (kind === "drivers" || url.endsWith("/drivers"))
                    ? [
                        {
                          cpf: "52998224725",
                          name: "João Silva",
                          empresa_sigla: "AZN",
                        },
                      ]
                    : [],
          ),
          { status: 200 },
        ),
    ),
  );
  render(
    <Registrations
      kind={kind}
      token="token"
      isAdmin={admin}
      userUnit={100}
      expired={vi.fn()}
    />,
  );
}
it('preenche o motorista com o proprietário ao marcar a opção e envia o vínculo', async () => {
  mount('vehicles', false);
  await screen.findByText('Nenhum cadastro encontrado.');
  fireEvent.click(screen.getByRole('button', { name: '+ Novo veículo' }));
  for (const [label, value] of Object.entries({ 'Placa': 'ABC1234', 'Tipo de veículo': '1', 'Proprietário': 'joao silva', 'CPF/CNPJ do proprietário': '11222333000181', 'Empresa': 'AZN' }))
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'O proprietário é o motorista?' }));
  await waitFor(() => expect((screen.getByLabelText('Motorista do veículo') as HTMLInputElement).value).toBe('João Silva'));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }));
  await screen.findByText('Cadastro salvo com sucesso.');
  const write = vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === 'POST');
  expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({ driver_cpf: '52998224725', owner: '11222333000181', owner_is_driver: true });
});
it("permite inclusão e edição ao usuário comum e busca pelo nome", async () => {
  mount("drivers", false);
  await screen.findByText("João Silva");
  expect(screen.getByRole("button", { name: "+ Novo motorista" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Editar João Silva" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Buscar motorista pelo nome"), {
    target: { value: "joao" },
  });
  expect(screen.getByText("João Silva")).toBeTruthy();
});
it("salva motorista sem empresa e com CPF preservado, mesmo em cadastro legado", async () => {
  mount("drivers", false);
  fireEvent.click(
    await screen.findByRole("button", { name: "Editar João Silva" }),
  );
  expect((screen.getByLabelText("CPF") as HTMLInputElement).readOnly).toBe(
    true,
  );
  expect(screen.queryByLabelText("Empresa")).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "Empresa" })).toBeNull();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/companies"))).toBe(false);
  fireEvent.change(screen.getByLabelText("Nome"), {
    target: { value: "João da Silva" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
  await screen.findByText("Cadastro salvo com sucesso.");
  const write = vi
    .mocked(fetch)
    .mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(String(write?.[1]?.body))).toEqual({
    cpf: "52998224725",
    name: "João da Silva",
  });
});
it("abre veículo com proprietário, tipo e empresa, sem rateio", async () => {
  mount("vehicles");
  await screen.findByText("Nenhum cadastro encontrado.");
  fireEvent.click(screen.getByRole("button", { name: "+ Novo veículo" }));
  expect(screen.getByLabelText("Empresa")).toBeTruthy();
  expect(screen.getByLabelText("CPF/CNPJ do proprietário")).toBeTruthy();
  expect(screen.queryByText(/10%/)).toBeNull();
});
it('exige confirmação para excluir veículo e atualiza a lista para usuário comum', async () => {
  let deleted = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') deleted = true;
    return new Response(JSON.stringify(url.endsWith('/vehicles') && !deleted
      ? [{ plate: 'ABC1D23', owner: '52998224725', owner_name: 'Exemplo', codVehicleType: 1, empresa_sigla: 'AZN' }]
      : []), { status: 200 });
  }));
  render(<Registrations kind="vehicles" token="token" isAdmin={false} userUnit={100} expired={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar ABC1D23' }));
  fireEvent.click(screen.getByRole('button', { name: 'Excluir veículo' }));
  expect(deleted).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
  expect(deleted).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Excluir veículo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  await screen.findByText('Veículo ABC1D23 excluído do cadastro ativo. Histórico preservado.');
  await screen.findByText('Nenhum cadastro encontrado.');
  expect(vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === 'DELETE')?.[0]).toContain('/registrations/vehicles/ABC1D23');
});
it('envia o motorista escolhido junto ao cadastro do veículo', async()=>{
  mount('vehicles',false);
  await screen.findByText('Nenhum cadastro encontrado.');
  fireEvent.click(screen.getByRole('button',{name:'+ Novo veículo'}));
  for(const [label,value] of Object.entries({'Placa':'ABC1D23','Tipo de veículo':'1','Proprietário':'Exemplo','CPF/CNPJ do proprietário':'52998224725','Empresa':'AZN'}))
    fireEvent.change(screen.getByLabelText(label),{target:{value}});
  fireEvent.focus(screen.getByLabelText('Motorista do veículo'));
  fireEvent.change(screen.getByLabelText('Motorista do veículo'),{target:{value:'joao'}});
  fireEvent.click(await screen.findByRole('option',{name:'João Silva'}));
  fireEvent.click(screen.getByRole('button',{name:'Salvar cadastro'}));
  await screen.findByText('Cadastro salvo com sucesso.');
  const write=vi.mocked(fetch).mock.calls.find(([,o])=>o?.method==='POST');
  expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({plate:'ABC1D23',driver_cpf:'52998224725'});
});
