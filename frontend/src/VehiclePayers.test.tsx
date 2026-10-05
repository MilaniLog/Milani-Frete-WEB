// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import VehiclePayers from "./VehiclePayers";
const vehicle = {
  plate: "ABC1234",
  first_payer: "A",
  second_payer: "B",
  second_payer_percent: "0.3",
  vehicleType: { typeName: "Truck" },
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(vehicle), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function open(admin = true) {
  render(<VehiclePayers token="token" isAdmin={admin} expired={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Placa para consulta"), {
    target: { value: "abc1234" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Consultar veículo" }));
  await screen.findByText("ABC1234 · Truck");
}
it("mostra percentual humano e envia fração esperada pelo backend", async () => {
  await open();
  expect(
    (
      screen.getByLabelText(
        "Percentual da segunda empresa (%)",
      ) as HTMLInputElement
    ).value,
  ).toBe("30");
  fireEvent.change(screen.getByLabelText("Percentual da segunda empresa (%)"), {
    target: { value: "12.3456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar pagadoras" }));
  await screen.findByText(
    "Pagadoras atualizadas. Fechamentos históricos foram preservados.",
  );
  const call = vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(call?.[0]).toBe("/api/vehicles/ABC1234/payers");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    first_payer: "A",
    second_payer: "B",
    second_payer_percent: 0.123456,
  });
});
it("usuário comum consulta sem poder gravar", async () => {
  await open(false);
  expect(screen.queryByRole("button", { name: "Salvar pagadoras" })).toBeNull();
  expect(
    (screen.getByLabelText("Primeira empresa") as HTMLInputElement).closest(
      "fieldset",
    )?.disabled,
  ).toBe(true);
});
it("troca de placa remove o formulário antigo", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Placa para consulta"), {
    target: { value: "XYZ1234" },
  });
  expect(screen.queryByRole("button", { name: "Salvar pagadoras" })).toBeNull();
});
it("bloqueia percentual sem segunda empresa e permite remover com zero", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Segunda empresa"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar pagadoras" }));
  await screen.findByRole("alert");
  expect(vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "PUT")).toBe(
    false,
  );
  fireEvent.change(screen.getByLabelText("Primeira empresa"), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("Percentual da segunda empresa (%)"), {
    target: { value: "0" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar pagadoras" }));
  await screen.findByText(
    "Pagadoras atualizadas. Fechamentos históricos foram preservados.",
  );
});
