import type { Page } from "./Navigation";

const options = [
  ["entries", "Vales"],
  ["financial-report", "Relatório de vales"],
  ["vale-invoices", "Fechamento de vales"],
] as const;

export default function ValeNavigation({
  page,
  navigate,
}: {
  page: Page;
  navigate: (page: Page) => void;
}) {
  return (
    <nav className="vale-section-navigation" aria-label="Opções de vales">
      {options
        .filter(([target]) => target !== page)
        .map(([target, label]) => (
          <button
            key={target}
            type="button"
            className="secondary"
            onClick={() => navigate(target)}
          >
            {label}
          </button>
        ))}
    </nav>
  );
}
