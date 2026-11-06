// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ValeInvoices from "./ValeInvoices";
vi.mock("./report-download", () => ({ downloadReport: vi.fn() }));
import { downloadReport } from "./report-download";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("fecha os vales pelo período e mostra o número gerado", async () => {
  const reportWindow = { opener: {}, location: { href: "" }, close: vi.fn() };
  vi.stubGlobal("open", vi.fn(() => reportWindow));
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/vale-invoices") && options?.method === "POST")
      return new Response(JSON.stringify({
        id: 1,
        numero: 1,
        unit: 100,
        periodo_inicio: "2026-10-20",
        periodo_fim: "2026-10-21",
        quantidade: 2,
        valor_total: "30.00",
        responsavel_cod: 7,
        status: "FECHADA",
        created_at: "2026-10-23T12:00:00Z",
        entries: [],
      }));
    return new Response(JSON.stringify([]));
  }));

  render(<ValeInvoices token="t" globalAccess userUnit={100} expired={vi.fn()} />);
  await screen.findByRole("heading", { name: "Fechamentos de vales" });
  fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-10-20" } });
  fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-10-21" } });
  fireEvent.click(screen.getByRole("button", { name: "Fechar vales" }));

  await screen.findByText("Fechamento de vale 000001 gerado com 2 vales.");
  expect(window.open).toHaveBeenCalledWith("", "_blank");
  expect(downloadReport).toHaveBeenCalledWith(
    "/vale-invoices/1/print",
    "t",
    "fechamento-vales-000001.html",
    "text/html;charset=utf-8",
    reportWindow,
  );
  const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    inicio: "2026-10-20",
    fim: "2026-10-21",
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
});

it("consulta os vales do período sem fechar", async () => {
  const reportWindow = { opener: {}, location: { href: "" }, close: vi.fn() };
  vi.stubGlobal("open", vi.fn(() => reportWindow));
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/registrations/units"))
      return new Response(JSON.stringify([
        { codigo: 100, local: "SP", dominio: "LOOG" },
        { codigo: 301, local: "SSA", dominio: "MLN" },
      ]));
    if (url.includes("/vale-invoices/preview?"))
      return new Response(JSON.stringify({
        unit: 100,
        periodo_inicio: "2026-10-20",
        periodo_fim: "2026-10-21",
        quantidade: 1,
        valor_total: "25.50",
        lancamentos: [{
          id: 10,
          data_lancamento: "2026-10-20",
          placa: "ABC1234",
          manifesto_numero: "000001-1",
          codigo_despesa: "0001",
          nome_despesa: "MOEDA",
          descricao: "Teste",
          tipo_despesa: "Debito",
          valor: "25.50",
        }],
      }));
    return new Response(JSON.stringify([]));
  }));

  render(<ValeInvoices token="t" globalAccess userUnit={100} expired={vi.fn()} />);
  await screen.findByRole("heading", { name: "Fechamentos de vales" });
  fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-10-20" } });
  fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-10-21" } });
  await screen.findByRole("option", { name: "MLN" });
  fireEvent.change(screen.getByLabelText("Tipo da consulta"), { target: { value: "debito" } });
  fireEvent.change(screen.getByLabelText("Domínio da consulta"), { target: { value: "MLN" } });
  fireEvent.change(screen.getByLabelText("Unidade da consulta"), { target: { value: "SSA" } });
  fireEvent.click(screen.getByRole("button", { name: "Consultar vales" }));

  await screen.findByRole("heading", { name: "Consulta de vales para fechamento" });
  expect(screen.getByText("ABC1234")).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(([url]) =>
    String(url).includes("movimento=debito") &&
    String(url).includes("dominio=MLN") &&
    String(url).includes("local=SSA")
  )).toBe(true);
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  fireEvent.click(screen.getByLabelText("Separar impressão da consulta por tipo"));
  fireEvent.click(screen.getByRole("button", { name: "Imprimir consulta" }));
  await waitFor(() => expect(downloadReport).toHaveBeenCalledWith(
    expect.stringContaining("/vale-invoices/preview/print-separated?"),
    "t",
    "consulta-vales-separada.html",
    "text/html;charset=utf-8",
    reportWindow,
  ));
});
