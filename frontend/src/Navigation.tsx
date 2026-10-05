import { useEffect, useRef, useState } from "react";
import type { Session } from "./api";

export type Page =
  | "home"
  | "manifests"
  | "entries"
  | "weeks"
  | "expenses"
  | "closures"
  | "invoices"
  | "payers"
  | "drivers"
  | "vehicles"
  | "destinations"
  | "financial-report"
  | "coupons-report"
  | "payments-report";

export function canAccessPage(session: Session, page: Page): boolean {
  return page !== "weeks" || session.user.isAdmin;
}

export default function Navigation({
  session,
  page,
  navigate,
  logout,
}: {
  session: Session;
  page: Page;
  navigate: (page: Page) => void;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  function select(next: Page) {
    setOpen(false);
    navigate(next);
    trigger.current?.focus();
  }
  return (
    <header className="app-navigation">
      <a
        className="brand home-link"
        href="#home"
        aria-label="Milani — Página inicial"
        onClick={(event) => {
          event.preventDefault();
          setOpen(false);
          navigate("home");
        }}
      >
        <img
          src="/brand/milani-logo.png"
          alt="Milani — Logística & Transporte"
          width="200"
          height="70"
        />
      </a>
      <div
        className="menu-disclosure"
        ref={container}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setOpen(false);
        }}
      >
        <button
          type="button"
          className="primary menu-trigger"
          ref={trigger}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          Menu <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
        {open && (
          <nav
            id="main-navigation"
            className="menu-dropdown"
            aria-label="Navegação principal"
          >
            <div className="menu-account">
              <strong>{session.user.name}</strong>
              <span>Unidade {session.user.unit}</span>
            </div>
            {(
              [
                ["manifests", "Manifestos"],
                ["entries", "Lançamentos"],
                ["weeks", "Semanas"],
                ["expenses", "Despesas"],
                ["closures", "Fechamentos"],
                ["invoices", "Notas e cupons"],
                ["payers", "Empresas"],
                ["drivers", "Motoristas"],
                ["vehicles", "Veículos"],
                ["destinations", "Destinos"],
                ["financial-report", "Relatório de lançamentos"],
                ["coupons-report", "Relatório de cupons"],
                ["payments-report", "Planilha de pagamentos"],
              ] as const
            )
              .filter(([id]) => canAccessPage(session, id))
              .map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`nav-button ${page === id ? "is-active" : ""}`}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => select(id)}
                >
                  {label}
                </button>
              ))}
            <button
              type="button"
              className="nav-button menu-logout"
              onClick={logout}
            >
              Sair da conta →
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
