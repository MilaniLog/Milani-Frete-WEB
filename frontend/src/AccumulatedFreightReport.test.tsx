// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AccumulatedFreightReport from "./AccumulatedFreightReport";

const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("consulta a semana escolhida e mostra o acumulado das quatro semanas", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path.endsWith("/weeks"))
        return response([
          { codigo: "4526", data_inicio: "2026-11-01", data_fim: "2026-11-07" },
        ]);
      if (path.endsWith("/freight-reports/units"))
        return response([{ unit: 100, branch: "SP", dominio: "MLN" }]);
      if (path.endsWith("/registrations/vehicle-types"))
        return response([{ codVehicleType: 1, typeName: "VAN" }]);
      return response({
        title: "Frete acumulado por proprietário",
        notes: [],
        columns: ["UNIDADE", "CPF/CNPJ", "Nome do proprietário", "Placa", "Valor acumulado", "4526", "4426", "4326", "4226"],
        rows: [["100", "00123456789", "Proprietário", "ABC1234", "1000", "100", "200", "300", "400"]],
        numeric: [4, 5, 6, 7, 8],
        totals: [{ label: "Total acumulado", value: "1000" }],
      });
    }),
  );

  render(<AccumulatedFreightReport token="token" expired={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Semana de referência"), {
    target: { value: "4526" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

  expect(await screen.findByText("Frete acumulado por proprietário")).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "4526" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "4226" })).toBeTruthy();
  expect(
    screen.getAllByText((content) => content.includes("1.000,00")).length,
  ).toBeGreaterThan(0);
  expect(fetch).toHaveBeenCalledWith(
    "/api/freight-reports/freight-accumulated?semana=4526",
    expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
  );
});
