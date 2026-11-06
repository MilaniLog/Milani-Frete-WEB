// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Users from "./Users";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("pesquisa usuários por código, nome, unidade e perfil", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/users") return new Response(JSON.stringify([
      { id: 1, cod: 10, Name: "Ana Financeiro", unit: 100, isAdmin: false, freight_profile: "FINANCEIRO" },
      { id: 2, cod: 20, Name: "Bruno Operação", unit: 301, isAdmin: true, freight_profile: "OPERACAO" },
    ]));
    if (path === "/api/registrations/units") return new Response(JSON.stringify([
      { codigo: 100, local: "SP", dominio: "LOOG" },
      { codigo: 301, local: "SSA", dominio: "MLN" },
    ]));
    return new Response(JSON.stringify({}), { status: 404 });
  }));
  render(<Users token="token" expired={vi.fn()} />);
  await screen.findByText("Ana Financeiro");
  const search = screen.getByLabelText("Pesquisar usuário");

  fireEvent.change(search, { target: { value: "ssa" } });
  expect(screen.getByText("Bruno Operação")).toBeTruthy();
  expect(screen.queryByText("Ana Financeiro")).toBeNull();

  fireEvent.change(search, { target: { value: "financeiro" } });
  expect(screen.getByText("Ana Financeiro")).toBeTruthy();
  expect(screen.queryByText("Bruno Operação")).toBeNull();

  fireEvent.change(search, { target: { value: "999" } });
  expect(screen.getByText("Nenhum usuário encontrado para essa pesquisa.")).toBeTruthy();
});

it("edita usuário sem exigir troca de senha", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (path: string, options?: RequestInit) => {
    if (path === "/api/users/20" && options?.method === "PUT")
      return new Response(JSON.stringify({ id: 2, cod: 20, Name: "Nome Alterado", unit: 301, isAdmin: true, freight_profile: "FINANCEIRO" }));
    if (path === "/api/users")
      return new Response(JSON.stringify([{ id: 2, cod: 20, Name: "Nome Atual", unit: 100, isAdmin: false, freight_profile: "OPERACAO" }]));
    if (path === "/api/registrations/units")
      return new Response(JSON.stringify([{ codigo: 100, local: "SP" }, { codigo: 301, local: "SSA" }]));
    return new Response(JSON.stringify({}), { status: 404 });
  }));

  render(<Users token="token" expired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  expect((screen.getByLabelText("Código") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText("Nova senha (opcional)") as HTMLInputElement).required).toBe(false);
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nome Alterado" } });
  fireEvent.change(screen.getByLabelText("Unidade"), { target: { value: "301" } });
  fireEvent.change(screen.getByLabelText("Perfil"), { target: { value: "FINANCEIRO" } });
  fireEvent.click(screen.getByLabelText("Administrador"));
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

  await screen.findByText("Usuário 20 atualizado com sucesso.");
  const call = vi.mocked(fetch).mock.calls.find(([path, options]) => path === "/api/users/20" && options?.method === "PUT");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    name: "Nome Alterado",
    unit: 301,
    isAdmin: true,
    freightProfile: "FINANCEIRO",
  });
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});
