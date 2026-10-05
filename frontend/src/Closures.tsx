import SortableTable from "./SortableTable";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import ReprintClosures from "./ReprintClosures";
import ClosureForm, {
  emptyClosureFilters,
  type ClosureFilters,
} from "./ClosureForm";

type Totals = {
  total_bruto: string;
  total_liquido: string;
  total_ctrb: string;
  fretes?: string;
  creditos?: string;
  debitos?: string;
  cupons?: string;
};
type Payment = {
  criterio: string;
  ctrbs: string[];
  primeira: { empresa: string | null; valor: string };
  segunda: { empresa: string | null; valor: string };
};
type ManifestRow = { id: number; manifestos: string; frete_veiculo: string };
type EntryRow = {
  id: number;
  numero: number;
  nome_despesa: string;
  tipo_despesa: string;
  valor: string;
};
type CouponRow = { id: number; nota_id: number; valor: string };
type Preview = {
  semana: string;
  placa: string;
  manifests: ManifestRow[];
  entries: EntryRow[];
  coupons: CouponRow[];
  totals: Totals;
  payment: Payment | null;
};
type Closure = {
  id: number;
  numero: number;
  semana: string | null;
  placa: string;
  status: string;
  total_bruto: string;
  total_liquido: string;
};
type Report = Pick<
  Preview,
  "manifests" | "entries" | "coupons" | "totals" | "payment"
> & {
  origem: string;
  cabecalho: Closure & { cancelamento?: { motivo: string; em: string } | null };
};
const money = (value: string | undefined) =>
  value == null
    ? "Não registrado"
    : Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

export default function Closures({
  token,
  isAdmin,
  expired,
}: {
  token: string;
  isAdmin: boolean;
  expired: () => void;
}) {
  const [rows, setRows] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [week, setWeek] = useState("");
  const [plate, setPlate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [cancel, setCancel] = useState(false);
  const [filters, setFilters] = useState<ClosureFilters>(emptyClosureFilters);
  const [conferenceGroups, setConferenceGroups] = useState<Preview[] | null>(
    null,
  );
  const [conferenceQuery, setConferenceQuery] = useState("");
  const [batchWeek, setBatchWeek] = useState("");
  function invalidate() {
    setPreview(null);
    setConfirm(false);
    setConferenceGroups(null);
    setConferenceQuery("");
    setBatchWeek("");
  }
  function query() {
    const p = new URLSearchParams();
    if (week) p.set("semana", week);
    if (plate.trim()) p.set("placa", plate.trim().toUpperCase());
    for (const [k, v] of Object.entries(filters)) {
      if (v !== "" && v !== false) p.set(k, String(v));
    }
    return p.toString();
  }
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  async function load() {
    setLoading(true);
    try {
      setRows(await api<Closure[]>("/freight-closures", token));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  async function conference(event: FormEvent) {
    event.preventDefault();
    const advanced =
      !week ||
      !plate ||
      Object.entries(filters).some(([k, v]) =>
        k === "categoria" ? v !== "Todos" : v !== "" && v !== false,
      );
    if (advanced) {
      setBusy(true);
      setError("");
      invalidate();
      try {
        const q = query();
        const data = await api<{ groups: Preview[] }>(
          `/freight-closures/conference?${q}`,
          token,
        );
        setConferenceGroups(data.groups);
        setConferenceQuery(q);
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setPreview(null);
    setConfirm(false);
    setError("");
    setSuccess("");
    try {
      setPreview(
        await api<Preview>(
          `/freight-closures/preview?semana=${encodeURIComponent(week)}&placa=${encodeURIComponent(plate.trim().toUpperCase())}`,
          token,
        ),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function prepareFinalization() {
    if (!week || filters.inicio || filters.fim) {
      setError(
        "Para fechar semana, informe a semana, sem período de pesquisa.",
      );
      return;
    }
    invalidate();
    setBusy(true);
    setError("");
    setSuccess("");
    if (!plate.trim()) {
      try {
        const q = new URLSearchParams({ semana: week }).toString();
        const data = await api<{ groups: Preview[] }>(
          `/freight-closures/conference?${q}`,
          token,
        );
        setConferenceGroups(data.groups);
        setConferenceQuery(q);
        setBatchWeek(week);
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      setPreview(
        await api<Preview>(
          `/freight-closures/preview?semana=${encodeURIComponent(week)}&placa=${encodeURIComponent(plate.trim().toUpperCase())}`,
          token,
        ),
      );
      setConfirm(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function selectClosure() {
    if (!filters.numero) return;
    setBusy(true);
    setError("");
    setReport(null);
    setCancel(false);
    try {
      setReport(
        await api<Report>(
          `/freight-closures/number/${filters.numero}/report`,
          token,
        ),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function excludePayment() {
    if (!isAdmin) return;
    if (!filters.numero) {
      setError("Informe o número do fechamento para excluir o pagamento.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const found = await api<Report>(
        `/freight-closures/number/${filters.numero}/report`,
        token,
      );
      setReport(found);
      if (found.cabecalho.status !== "FECHADO")
        throw new Error("Somente pagamento fechado pode ser excluído.");
      setCancel(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function finalize() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<{ closure: Closure }>(
        "/freight-closures",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            semana: preview.semana,
            placa: preview.placa,
          }),
        },
      );
      setPreview(null);
      setConfirm(false);
      setReport(null);
      setSuccess(
        `Fechamento ${result.closure.numero} finalizado. Líquido: ${money(result.closure.total_liquido)}.`,
      );
      await load();
    } catch (e) {
      fail(e);
      setPreview(null);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  async function finalizeWeek() {
    if (!batchWeek || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<{ results: unknown[] }>(
        "/freight-closures/week",
        token,
        { method: "POST", body: JSON.stringify({ semana: batchWeek }) },
      );
      invalidate();
      setReport(null);
      setSuccess(`${result.results.length} fechamentos finalizados.`);
      await load();
    } catch (e) {
      fail(e);
      invalidate();
    } finally {
      setBusy(false);
    }
  }
  async function detail(id: number) {
    setBusy(true);
    setError("");
    setReport(null);
    setCancel(false);
    try {
      setReport(await api<Report>(`/freight-closures/${id}/report`, token));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function cancelClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report || busy) return;
    const motivo = String(
      new FormData(event.currentTarget).get("motivo") || "",
    ).trim();
    if (!motivo) {
      setError("Informe o motivo do cancelamento.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const id = report.cabecalho.id;
      await api(`/freight-closures/${id}/cancel`, token, {
        method: "POST",
        body: JSON.stringify({ motivo }),
      });
      setReport(null);
      setCancel(false);
      setPreview(null);
      setConfirm(false);
      setSuccess(
        "Fechamento cancelado. Registros reabertos e histórico preservado.",
      );
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function download(path: string, name: string) {
    setBusy(true);
    setError("");
    try {
      const html = await api<string>(path, token, {}, "text");
      const url = URL.createObjectURL(
        new Blob([html], { type: "text/html;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFERÊNCIA FINANCEIRA</p>
          <h1>Fechamentos</h1>
          <p className="muted">
            Confira os valores da semana antes de finalizar o pagamento.
          </p>
        </div>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      <section className="panel reference-form">
        <h2>Conferir semana e veículo</h2>
        <ClosureForm
          token={token}
          busy={busy}
          isAdmin={isAdmin}
          week={week}
          plate={plate}
          filters={filters}
          setWeek={(v) => {
            setWeek(v);
            invalidate();
          }}
          setPlate={(v) => {
            setPlate(v);
            invalidate();
          }}
          setFilters={(v) => {
            setFilters(v);
            invalidate();
            setReport(null);
            setCancel(false);
          }}
          conference={conference}
          finalize={() => void prepareFinalization()}
          selectClosure={() => void selectClosure()}
          cancel={() => void excludePayment()}
          expired={expired}
        />
        {conferenceGroups && (
          <section className="conference-results">
            <h3>Conferência</h3>
            {!conferenceGroups.length && <p>Nenhum registro encontrado.</p>}
            {conferenceGroups.map((group) => (
              <section key={group.placa} className="panel">
                <h3>{group.placa}</h3>
                <Values data={group} />
              </section>
            ))}
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void download(
                  `/freight-closures/conference/print?${conferenceQuery}`,
                  "conferencia.html",
                )
              }
            >
              Baixar conferência
            </button>
            {batchWeek && conferenceGroups.length > 0 && (
              <div className="alert">
                <p>
                  Confirmar o fechamento da semana {batchWeek} para todos os
                  veículos da unidade? A conferência encontrou{" "}
                  {conferenceGroups.length} veículos. Os valores e registros
                  serão recalculados ao confirmar. Os filtros de relatório não
                  restringem o fechamento. Não há transferência bancária.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void finalizeWeek()}
                >
                  Confirmar finalização da semana
                </button>{" "}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setBatchWeek("")}
                >
                  Voltar à conferência
                </button>
              </div>
            )}
          </section>
        )}
        {preview && (
          <>
            <h3>
              Prévia · Semana {preview.semana} · {preview.placa}
            </h3>
            <Values data={preview} />
            <p className="muted">
              O backend recalcula na finalização. Alterações posteriores à
              conferência podem mudar os valores. Finalizar marca os registros
              como pagos; não realiza transferência bancária.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void download(
                  `/freight-closures/preview/print?semana=${preview.semana}&placa=${preview.placa}`,
                  "conferencia.html",
                )
              }
            >
              Baixar conferência
            </button>
            {!preview.manifests.length &&
            !preview.entries.length &&
            !preview.coupons.length ? (
              <p>Nenhum registro aberto para finalizar.</p>
            ) : confirm ? (
              <div className="alert">
                <p>
                  Confirmar o fechamento da semana {preview.semana}, placa{" "}
                  {preview.placa}?
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void finalize()}
                >
                  Confirmar finalização
                </button>{" "}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  Voltar à conferência
                </button>
              </div>
            ) : (
              <button
                className="primary"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Finalizar fechamento
              </button>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <div className="filters">
          <h2>Últimos fechamentos</h2>
          <button
            className="secondary"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Atualizar fechamentos
          </button>
        </div>
        {loading ? (
          <p className="empty" role="status">
            Carregando fechamentos…
          </p>
        ) : !rows.length ? (
          <p className="empty">Nenhum fechamento disponível na consulta.</p>
        ) : (
          <div className="table-scroll">
            <SortableTable>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Semana / Placa</th>
                  <th>Líquido</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.numero}</td>
                    <td>
                      {row.semana ?? "Não registrada"}
                      <small>{row.placa}</small>
                    </td>
                    <td>{money(row.total_liquido)}</td>
                    <td>{row.status}</td>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void detail(row.id)}
                      >
                        Consultar fechamento {row.numero}
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void download(
                            `/freight-closures/${row.id}/print`,
                            `fechamento-${row.numero}.html`,
                          )
                        }
                      >
                        Reimprimir fechamento {row.numero}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        )}
        <p className="table-footer">Até 50 fechamentos da unidade.</p>
      </section>
      <ReprintClosures token={token} expired={expired} />
      {report && (
        <section className="panel reference-form">
          <h2>
            Fechamento {report.cabecalho.numero} · {report.cabecalho.status}
          </h2>
          <p>
            Semana {report.cabecalho.semana} · {report.cabecalho.placa}
          </p>
          {report.origem !== "FINALIZACAO" && (
            <p className="alert">
              Registro legado: dados disponíveis nos vínculos ou no histórico de
              cancelamento. Não há cópia original da finalização.
            </p>
          )}
          {report.cabecalho.cancelamento && (
            <p>
              Motivo do cancelamento: {report.cabecalho.cancelamento.motivo}
            </p>
          )}
          <Values data={report} />
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void download(
                `/freight-closures/${report.cabecalho.id}/print`,
                `fechamento-${report.cabecalho.numero}.html`,
              )
            }
          >
            Baixar relatório para impressão
          </button>
          <p className="muted">
            Abra o arquivo HTML baixado e use Imprimir no navegador para
            imprimir ou salvar em PDF.
          </p>
          {isAdmin &&
            report.cabecalho.status === "FECHADO" &&
            (cancel ? (
              <form onSubmit={cancelClosure}>
                <fieldset disabled={busy}>
                  <label>
                    Motivo do cancelamento
                    <textarea name="motivo" required maxLength={500} />
                  </label>
                  <p>
                    Os registros serão reabertos. O fechamento e seu histórico
                    serão preservados.
                  </p>
                  <button className="primary">Confirmar cancelamento</button>{" "}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCancel(false)}
                  >
                    Manter fechamento
                  </button>
                </fieldset>
              </form>
            ) : (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setCancel(true)}
              >
                Cancelar fechamento
              </button>
            ))}
        </section>
      )}
    </div>
  );
}

function Values({
  data,
}: {
  data: Pick<
    Preview,
    "totals" | "payment" | "manifests" | "entries" | "coupons"
  >;
}) {
  return (
    <>
      <dl className="detail-grid">
        {(
          [
            ["Bruto", "total_bruto"],
            ["Débitos", "debitos"],
            ["Cupons", "cupons"],
            ["Créditos", "creditos"],
            ["Líquido", "total_liquido"],
            ["CTRB informativo", "total_ctrb"],
          ] as const
        ).map(([label, key]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{money(data.totals[key])}</dd>
          </div>
        ))}
      </dl>
      {data.payment ? (
        <p>
          Empresa de pagamento:{" "}
          {data.payment.primeira.empresa ?? "Não cadastrada"} —{" "}
          {money(data.payment.primeira.valor)}
          <br />
          {Number(data.payment.segunda.valor) !== 0 && (
            <>
              Segunda pagadora:{" "}
              {data.payment.segunda.empresa ?? "Não cadastrada"} —{" "}
              {money(data.payment.segunda.valor)}
              <br />
            </>
          )}
          Critério: {data.payment.criterio} · CTRBs:{" "}
          {data.payment.ctrbs.join(", ") || "Nenhum"}
        </p>
      ) : (
        <p>Empresa de pagamento não registrada.</p>
      )}
      <details>
        <summary>
          Conferir registros: {data.manifests.length} manifestos,{" "}
          {data.entries.length} lançamentos, {data.coupons.length} cupons
        </summary>
        <ul>
          {data.manifests.map((m) => (
            <li key={`m${m.id}`}>
              Manifesto {m.manifestos} · {money(m.frete_veiculo)}
            </li>
          ))}
          {data.entries.map((e) => (
            <li key={`e${e.id}`}>
              Lançamento {e.numero} · {e.nome_despesa} · {e.tipo_despesa} ·{" "}
              {money(e.valor)}
            </li>
          ))}
          {data.coupons.map((c) => (
            <li key={`c${c.id}`}>
              Cupom {c.id} · Nota (ID) {c.nota_id} · {money(c.valor)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
