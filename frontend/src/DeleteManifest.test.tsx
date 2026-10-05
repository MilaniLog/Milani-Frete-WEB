// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DeleteManifest from "./DeleteManifest";
const done = vi.fn();
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_, options?: RequestInit) =>
      options?.method === "DELETE"
        ? response({ deletedEntries: 2 })
        : response([
            { pago: false, fechamento_id: null },
            { pago: false, fechamento_id: null },
          ]),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  render(
    <DeleteManifest
      id={1}
      number="M001"
      token="token"
      disabled={false}
      onBusy={vi.fn()}
      expired={vi.fn()}
      done={done}
    />,
  );
}
it("confirma a remoção do manifesto e dos lançamentos antes de enviar DELETE", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Excluir manifesto" }));
  await screen.findByText("2 lançamentos abertos");
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar exclusão do manifesto" }),
  );
  await vi.waitFor(() => expect(done).toHaveBeenCalledWith(2));
  expect(fetch).toHaveBeenCalledWith(
    "/api/manifests/1",
    expect.objectContaining({ method: "DELETE" }),
  );
});
it("bloqueia confirmação quando há lançamento pago", async () => {
  vi.mocked(fetch).mockResolvedValue(
    response([{ pago: true, fechamento_id: null }]),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Excluir manifesto" }));
  await screen.findByText(
    "Este manifesto possui lançamentos pagos ou fechados e não pode ser excluído.",
  );
  expect(
    screen.queryByRole("button", { name: "Confirmar exclusão do manifesto" }),
  ).toBeNull();
});
it("mantém registro ao cancelar e exige nova confirmação após conflito", async () => {
  vi.mocked(fetch).mockImplementation(async (_, options) =>
    options?.method === "DELETE"
      ? response({ message: "Período fechado." }, 409)
      : response([]),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Excluir manifesto" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Manter manifesto" }),
  );
  expect(
    vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Excluir manifesto" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Confirmar exclusão do manifesto",
    }),
  );
  await screen.findByText("Período fechado.");
  expect(done).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Confirmar exclusão do manifesto" }),
  ).toBeNull();
});
