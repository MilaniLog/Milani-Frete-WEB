// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BackToTop from "./BackToTop";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

it("aparece após a rolagem e volta suavemente ao início", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(<BackToTop />);
  expect(screen.queryByRole("button", { name: "Voltar ao início da página" })).toBeNull();

  Object.defineProperty(window, "scrollY", { configurable: true, value: 700 });
  fireEvent.scroll(window);
  const button = await screen.findByRole("button", { name: "Voltar ao início da página" });
  fireEvent.click(button);

  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });

  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  fireEvent.scroll(window);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Voltar ao início da página" })).toBeNull());
});
