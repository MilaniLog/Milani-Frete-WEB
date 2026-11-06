// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ClosureNavigation from "./ClosureNavigation";

afterEach(cleanup);

it.each([
  ["closures", "Reimprimir fechamentos", "reprint-closures"],
  ["reprint-closures", "Fechamentos", "closures"],
] as const)("alterna a partir de %s", (page, label, target) => {
  const navigate = vi.fn();
  render(<ClosureNavigation page={page} navigate={navigate} />);
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(navigate).toHaveBeenCalledWith(target);
});

it("abre diretamente a consulta a partir da reimpressão", () => {
  const openConsultation = vi.fn();
  render(
    <ClosureNavigation
      page="reprint-closures"
      navigate={vi.fn()}
      openConsultation={openConsultation}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Consultar fechamentos" }));
  expect(openConsultation).toHaveBeenCalledOnce();
});
