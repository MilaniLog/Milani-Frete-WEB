import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

type Props = {
  id: number;
  number: string;
  token: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  expired: () => void;
  done: (count: number) => void;
  autoCheck?: boolean;
};
export default function DeleteManifest({
  id,
  number,
  token,
  disabled,
  onBusy,
  expired,
  done,
  autoCheck = false,
}: Props) {
  const [count, setCount] = useState<number | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  async function check() {
    if (disabled || busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setCount(null);
    try {
      const entries = await api<
        { pago: boolean; fechamento_id: number | null }[]
      >(`/manifests/${id}/entries`, token);
      if (entries.some((e) => e.pago || e.fechamento_id != null))
        throw new Error(
          "Este manifesto possui vales pagos ou fechados e não pode ser excluído.",
        );
      setCount(entries.length);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function remove() {
    if (disabled || busy || count === null) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const result = await api<{ deletedEntries: number }>(
        `/manifests/${id}`,
        token,
        { method: "DELETE" },
      );
      done(result.deletedEntries);
    } catch (e) {
      setCount(null);
      fail(e);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  useEffect(() => {
    if (autoCheck) void check();
  }, [autoCheck, id]);
  return (
    <section aria-label="Exclusão do manifesto">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {count === null ? (
        autoCheck ? (
          busy ? <p role="status">Verificando vínculos do manifesto…</p> : null
        ) : <button
          type="button"
          className="secondary"
          disabled={disabled || busy}
          onClick={() => void check()}
        >
          Cancelar manifesto
        </button>
      ) : (
        <div className="alert">
          <p>
            Cancelar o manifesto <strong>{number}</strong> e remover seus{" "}
            <strong>{count} vales abertos</strong>? O manifesto permanecerá no
            histórico como cancelado. O cancelamento não pode ser desfeito.
          </p>
          <button
            type="button"
            className="primary"
            disabled={disabled || busy}
            onClick={() => void remove()}
          >
            Confirmar cancelamento
          </button>{" "}
          <button
            type="button"
            className="secondary"
            disabled={disabled || busy}
            onClick={() => setCount(null)}
          >
            Manter manifesto
          </button>
        </div>
      )}
    </section>
  );
}
