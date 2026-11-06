// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ValeNavigation from "./ValeNavigation";

afterEach(cleanup);

it.each([
  ["entries", ["Relatório de vales", "Fechamento de vales"]],
  ["financial-report", ["Vales", "Fechamento de vales"]],
  ["vale-invoices", ["Vales", "Relatório de vales"]],
] as const)("mostra os outros destinos quando a página atual é %s", (page, labels) => {
  const navigate = vi.fn();
  render(<ValeNavigation page={page} navigate={navigate} />);
  const buttons = screen.getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual(labels);
  fireEvent.click(screen.getByRole("button", { name: labels[0] }));
  expect(navigate).toHaveBeenCalledTimes(1);
});
