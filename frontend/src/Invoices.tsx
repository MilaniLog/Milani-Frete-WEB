import { useState } from "react";
import InvoiceConsultation from "./InvoiceConsultation";
import InvoiceLaunchForm from "./InvoiceLaunchForm";
export default function Invoices(props: {
  token: string;
  isAdmin: boolean;
  expired: () => void;
  close?: () => void;
}) {
  const [revision, setRevision] = useState(0),
    [consulting, setConsulting] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  function showConsultation(open: boolean) {
    if (open === consulting) return;
    setConsulting(open);
    if (!open) setCatalogRevision((value) => value + 1);
  }
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTROLE FINANCEIRO</p>
          <h1>Notas e cupons</h1>
          <p className="muted">
            Preencha a nota e o cupom no mesmo formulário.
          </p>
        </div>
        {consulting && (
          <button type="button" className="primary" onClick={() => showConsultation(false)}>
            Voltar aos lançamentos
          </button>
        )}
      </div>
      <div hidden={consulting}>
        <InvoiceLaunchForm {...props} catalogRevision={catalogRevision} saved={() => setRevision((v) => v + 1)} />
      </div>
      <details open={consulting} onToggle={(e) => showConsultation(e.currentTarget.open)}>
        <summary>Consultar notas, cupons e tipos de nota</summary>
        {consulting && (
          <InvoiceConsultation
            key={revision}
            token={props.token}
            isAdmin={props.isAdmin}
            expired={props.expired}
          />
        )}
      </details>
    </div>
  );
}
