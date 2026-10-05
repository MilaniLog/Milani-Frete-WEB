// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DriverSelect from "./DriverSelect";

const drivers = [
  { cpf: "00123456789", name: "José da Silva" },
  { cpf: "00234567890", name: "Ana Souza" },
  { cpf: "00345678901", name: "Ana Souza" },
];
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(drivers))),
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(initialName = "", expired = vi.fn()) {
  return render(
    <form aria-label="Cadastro">
      <DriverSelect token="test" initialName={initialName} expired={expired} />
    </form>,
  );
}
it("pesquisa no próprio campo e envia o CPF escolhido", async () => {
  mount();
  await screen.findByRole("option", {name:"José da Silva", hidden:true});
  fireEvent.focus(screen.getByLabelText("Motorista"));
  fireEvent.change(screen.getByLabelText("Motorista"), {target:{value:"jose"}});
  fireEvent.click(await screen.findByRole("option", {name:"José da Silva"}));
  expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("cpf_motorista")).toBe("00123456789");
});
it("restaura motorista na edição e exige nova seleção após digitar", async () => {
  mount("José da Silva");
  await screen.findByDisplayValue("José da Silva");
  fireEvent.change(screen.getByLabelText("Motorista"), {target:{value:"Inexistente"}});
  expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("cpf_motorista")).toBe("");
  expect(screen.getByText("Nenhuma opção encontrada.")).toBeTruthy();
  expect((screen.getByLabelText("Motorista") as HTMLInputElement).checkValidity()).toBe(false);
});
it("distingue homônimos sem escolher automaticamente", async () => {
  mount("Ana Souza");
  await screen.findByRole("option", {name:"Ana Souza — CPF final 7890",hidden:true});
  fireEvent.focus(screen.getByLabelText("Motorista"));
  fireEvent.change(screen.getByLabelText("Motorista"),{target:{value:"ana"}});
  expect(await screen.findByRole("option", {name:"Ana Souza — CPF final 8901"})).toBeTruthy();
  expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("cpf_motorista")).toBe("");
});
it("avisa sobre sessão expirada", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("{}",{status:401}));
  const expired=vi.fn();mount("",expired);
  await screen.findByText("Nenhum motorista encontrado com esse nome.");
  expect(expired).toHaveBeenCalledTimes(1);
});
