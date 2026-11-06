// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CouponNavigation from "./CouponNavigation";

afterEach(cleanup);

it.each([
  ["invoices", "Relatório de cupons", "coupons-report"],
  ["coupons-report", "Notas e cupons", "invoices"],
] as const)("mostra a outra opção de cupons em %s", (page, label, target) => {
  const navigate = vi.fn();
  render(<CouponNavigation page={page} navigate={navigate} />);
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(navigate).toHaveBeenCalledWith(target);
});
