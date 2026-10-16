import { normalizePlate, normalizeWeek } from "./field-formats";
import { useEffect, useState, type FormEvent } from "react";
import { api, apiUrl, ApiError } from "./api";
import SearchableSelect from "./SearchableSelect";
export default function ReprintClosures({
  token,
  isAdmin = false,
  userUnit = 0,
  expired,
}: {
  token: string;
  isAdmin?: boolean;
  userUnit?: number;
  expired: () => void;
}) {
  const [weeks, setWeeks] = useState<{ codigo: string }[]>([]),
    [units, setUnits] = useState<
      { codigo: number; local: string; dominio: "MLN" | "LOOG" | null }[]
    >([]),
    [domain, setDomain] = useState(""),
    [unit, setUnit] = useState(""),
    [number, setNumber] = useState(""),
    [week, setWeek] = useState(""),
    [plate, setPlate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ codigo: string }[]>("/weeks", token),
      ...(isAdmin
        ? [api<typeof units>("/registrations/units", token)]
        : []),
    ])
      .then(([w, u]) => {
        if (active) {
          setWeeks(w);
          setUnits(u ?? []);
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [token, isAdmin]);
  const unitLocations = [...new Set(units.map((row) => row.local).filter(Boolean))]
    .filter((local) => local.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() !== "ARACARIGUAMA")
    .sort();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const reportWindow = window.open("", "_blank");
    if (reportWindow) reportWindow.opener = null;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const q = number
        ? new URLSearchParams({
            numero: number,
            ...(isAdmin && domain ? { dominio: domain } : {}),
            ...(isAdmin && unit ? { local: unit } : {}),
          })
        : new URLSearchParams({
            semana: week,
            ...(plate ? { placa: plate } : {}),
            ...(isAdmin && domain ? { dominio: domain } : {}),
            ...(isAdmin && unit ? { local: unit } : {}),
          });
      const response = await fetch(
        apiUrl(`/freight-reports/closures/reprint.pdf?${q}`),
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          Array.isArray(data?.message)
            ? data.message.join(" • ")
            : data?.message || `Não foi possível gerar o relatório (${response.status}).`,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (reportWindow) reportWindow.location.href = url;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = number
        ? `fechamento-${number}.pdf`
        : `fechamentos-${week}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setSuccess("Relatório em PDF baixado com sucesso.");
    } catch (e) {
      reportWindow?.close();
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
        <h2>Reimprimir fechamento</h2>
        <p>
          Informe o número do fechamento ou selecione a semana e a placa. Placa
          vazia reimprime todos os fechamentos da semana. O histórico será
          preservado.
        </p>
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
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label>
                Domínio
                <select
                  aria-label="Domínio"
                  value={domain}
                  disabled={!isAdmin}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="LOOG">LOOG</option>
                  <option value="MLN">MLN</option>
                </select>
              </label>
              <label>
                Unidade
                <SearchableSelect
                  aria-label="Unidade"
                  value={isAdmin ? unit : String(userUnit)}
                  disabled={!isAdmin}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="">Todas</option>
                  {isAdmin ? unitLocations.map((local) => (
                    <option key={local} value={local}>{local}</option>
                  )) : <option value={String(userUnit)}>{userUnit}</option>}
                </SearchableSelect>
              </label>
              <label>
                Número do fechamento para reimpressão
                <input
                  inputMode="numeric"
                  pattern="[0-9]{1,9}"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </label>
              <label>
                Semana para reimpressão
                <input
                  list="reprint-weeks"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  disabled={!!number}
                  required={!number}
                  value={week}
                  onChange={(e) => setWeek(normalizeWeek(e.target.value))}
                />
              </label>
              <label>
                Placa para reimpressão
                <input
                  pattern="[A-Z]{3}[0-9][A-Z0-9][0-9]{2}"
                  maxLength={8}
                  disabled={!!number}
                  value={plate}
                  onChange={(e) => setPlate(normalizePlate(e.target.value))}
                />
              </label>
            </div>
            <datalist id="reprint-weeks">
              {weeks.map((w) => (
                <option key={w.codigo} value={w.codigo} />
              ))}
            </datalist>
            <button className="primary">
              Imprimir fechamento de frete
            </button>
          </fieldset>
        </form>
    </section>
  );
}
