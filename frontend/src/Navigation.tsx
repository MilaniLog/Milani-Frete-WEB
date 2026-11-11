import { useEffect, useRef, useState } from "react";
import type { Session } from "./api";

export type Page =
  | "home"
  | "manifests"
  | "entries"
  | "weeks"
  | "units"
  | "expenses"
  | "closures"
  | "invoices"
  | "payers"
  | "drivers"
  | "vehicles"
  | "destinations"
  | "reprint-closures"
  | "financial-report"
  | "vale-invoices"
  | "coupons-report"
  | "payments-report"
  | "accumulated-freight-report"
  | "manifest-closure-report"
  | "users"
  | "tickets"
  | "ticket-pendings";

export function canAccessPage(session: Session, page: Page): boolean {
  if (page === "tickets" || page === "ticket-pendings") return true;
  return !["weeks", "units", "users", "accumulated-freight-report"].includes(page) || session.user.isAdmin;
}

const valePages: Page[] = ["entries", "financial-report", "vale-invoices"];
const closurePages: Page[] = ["closures", "reprint-closures"];
const couponPages: Page[] = ["invoices", "coupons-report"];
const ticketPages: Page[] = ["tickets", "ticket-pendings"];
const registrationPages = [
  ["weeks", "Semanas"],
  ["units", "Unidades"],
  ["users", "Usuários"],
  ["expenses", "Despesas"],
  ["payers", "Empresas"],
  ["drivers", "Motoristas"],
  ["vehicles", "Veículos"],
  ["destinations", "Destinos"],
] as const;

export default function Navigation({
  session,
  page,
  navigate,
  logout,
  title,
}: {
  session: Session;
  page: Page;
  navigate: (page: Page) => void;
  logout: () => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [registrationsOpen, setRegistrationsOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
        setRegistrationsOpen(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setRegistrationsOpen(false);
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
    setRegistrationsOpen(false);
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
          setRegistrationsOpen(false);
          navigate("home");
        }}
      >
        <img
          src={`${import.meta.env.BASE_URL}brand/milani-logo.png`}
          alt="Milani — Logística & Transporte"
          width="200"
          height="70"
        />
      </a>
      <strong className="app-page-title">{title ?? ""}</strong>
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
          onClick={() => {
            setOpen(!open);
            if (open) setRegistrationsOpen(false);
          }}
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
                ["entries", "Vales"],
                ["closures", "Fechamentos"],
                ["invoices", "Notas e cupons"],
                ["tickets", "Tickets"],
                ["payments-report", "Planilha de pagamentos"],
                ["accumulated-freight-report", "Frete acumulado"],
                ["manifest-closure-report", "Números de fechamento"],
              ] as const
            )
              .filter(([id]) => canAccessPage(session, id))
              .map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`nav-button ${page === id || (id === "entries" && valePages.includes(page)) || (id === "closures" && closurePages.includes(page)) || (id === "invoices" && couponPages.includes(page)) || (id === "tickets" && ticketPages.includes(page)) ? "is-active" : ""}`}
                  aria-current={page === id || (id === "entries" && valePages.includes(page)) || (id === "closures" && closurePages.includes(page)) || (id === "invoices" && couponPages.includes(page)) || (id === "tickets" && ticketPages.includes(page)) ? "page" : undefined}
                  onClick={() => select(id)}
                >
                  {label}
                </button>
              ))}
            <div className="menu-submenu-container">
              <button
                type="button"
                className={`nav-button submenu-trigger ${registrationPages.some(([id]) => id === page) ? "is-active" : ""}`}
                aria-expanded={registrationsOpen}
                aria-controls="registration-navigation"
                onClick={() => setRegistrationsOpen(!registrationsOpen)}
              >
                Cadastros <span aria-hidden="true">◂</span>
              </button>
              {registrationsOpen && (
                <div id="registration-navigation" className="menu-submenu">
                  {registrationPages
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
                </div>
              )}
            </div>
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

