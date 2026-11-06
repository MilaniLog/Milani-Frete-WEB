// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { downloadReport } from "./report-download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserva os bytes binários do arquivo XLSX", async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  })));
  let downloaded: Blob | undefined;
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      downloaded = blob;
      return "blob:xlsx";
    }),
    revokeObjectURL: vi.fn(),
  }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  await downloadReport(
    "/freight-reports/payments/spreadsheet?semana=4526",
    "token",
    "planilha-pagamentos.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  expect(fetch).toHaveBeenCalledWith(
    "/api/freight-reports/payments/spreadsheet?semana=4526",
    expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
  );
  expect(Array.from(new Uint8Array(await downloaded!.arrayBuffer()))).toEqual(Array.from(bytes));
});
