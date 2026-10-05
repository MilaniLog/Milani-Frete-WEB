import { normalizePlate, normalizeWeek } from "./field-formats";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { downloadReport } from "./report-download";
export default function ReprintClosures({
  token,
  expired,
}: {
  token: string;
  expired: () => void;
}) {
  const [weeks, setWeeks] = useState<{ codigo: string }[]>([]),
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
    api<{ codigo: string }[]>("/weeks", token)
      .then((w) => {
        if (active) setWeeks(w);
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [token]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const q = number
        ? new URLSearchParams({ numero: number })
        : new URLSearchParams({
            semana: week,
            ...(plate ? { placa: plate } : {}),
          });
      await downloadReport(
        `/freight-reports/closures/reprint?${q}`,
        token,
        number ? `fechamento-${number}.html` : `fechamentos-${week}.html`,
      );
      setSuccess(
        "Relatório baixado. Abra o arquivo e use Imprimir para reimprimir ou salvar em PDF.",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <details>
        <summary>Reimprimir fechamento</summary>
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
            <button className="primary">Reimprimir</button>
          </fieldset>
        </form>
      </details>
    </section>
  );
}
