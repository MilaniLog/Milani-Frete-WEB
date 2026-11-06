import type { Page } from "./Navigation";

export default function ClosureNavigation({
  page,
  navigate,
  openConsultation,
}: {
  page: Page;
  navigate: (page: Page) => void;
  openConsultation?: () => void;
}) {
  const target = page === "closures" ? "reprint-closures" : "closures";
  return (
    <nav className="vale-section-navigation" aria-label="Opções de fechamentos">
      <button type="button" className="secondary" onClick={() => navigate(target)}>
        {target === "closures" ? "Fechamentos" : "Reimprimir fechamentos"}
      </button>
      {page === "reprint-closures" && openConsultation && (
        <button type="button" className="secondary" onClick={openConsultation}>
          Consultar fechamentos
        </button>
      )}
    </nav>
  );
}
