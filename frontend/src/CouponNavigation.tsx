import type { Page } from "./Navigation";

const options = [
  ["invoices", "Notas e cupons"],
  ["coupons-report", "Relatório de cupons"],
] as const;

export default function CouponNavigation({ page, navigate }: {
  page: Page;
  navigate: (page: Page) => void;
}) {
  return (
    <nav className="vale-section-navigation" aria-label="Opções de cupons">
      {options.filter(([target]) => target !== page).map(([target, label]) => (
        <button key={target} type="button" className="secondary" onClick={() => navigate(target)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
