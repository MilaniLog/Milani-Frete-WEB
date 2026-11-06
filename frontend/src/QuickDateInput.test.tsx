// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import QuickDateInput from "./QuickDateInput";

afterEach(cleanup);

it("aceita digitação curta, exibe DD/MM/AAAA e retorna ISO", () => {
  const change = vi.fn();
  render(<QuickDateInput aria-label="Data" onChange={change} />);
  const input = screen.getByLabelText("Data") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "121226" } });
  fireEvent.blur(input);
  expect(input.value).toBe("12/12/2026");
  expect(change).toHaveBeenLastCalledWith("2026-12-12");
});

it("mantém o valor ISO em campo oculto para FormData", () => {
  const { container } = render(
    <form><QuickDateInput aria-label="Data" name="data" defaultValue="2026-09-20" /></form>,
  );
  expect((screen.getByLabelText("Data") as HTMLInputElement).value).toBe("20/09/2026");
  expect((container.querySelector('input[name="data"]') as HTMLInputElement).value).toBe("2026-09-20");
});
