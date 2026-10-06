import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
type Vehicle = {
  plate: string;
  first_payer: string | null;
  second_payer: string | null;
  second_payer_percent: string;
  vehicleType?: { typeName: string };
};
export default function VehiclePayers({
  token,
  isAdmin,
  expired,
}: {
  token: string;
  isAdmin: boolean;
  expired: () => void;
}) {
  const vehicleRef = useRef<HTMLElement | null>(null);
  const [plate, setPlate] = useState(""),
    [vehicle, setVehicle] = useState<Vehicle | null>(null),
    [first, setFirst] = useState(""),
    [second, setSecond] = useState(""),
    [percent, setPercent] = useState("0"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  useEffect(() => {
    if (!vehicle) return;
    window.setTimeout(
      () => vehicleRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }),
      0,
    );
  }, [vehicle]);
  function show(v: Vehicle) {
    setVehicle(v);
    setFirst(v.first_payer ?? "");
    setSecond(v.second_payer ?? "");
    setPercent(
      String(Number((Number(v.second_payer_percent) * 100).toFixed(4))),
    );
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setVehicle(null);
    setError("");
    setSuccess("");
    try {
      show(
        await api<Vehicle>(
          `/vehicles/${encodeURIComponent(plate.trim().toUpperCase())}`,
          token,
        ),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!vehicle || !isAdmin || busy) return;
    setError("");
    setSuccess("");
    const a = first.trim(),
      b = second.trim(),
      rate = Number(percent);
    if (
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100 ||
      (b && !a) ||
      (!b && rate !== 0) ||
      (a && a === b)
    ) {
      setError(
        "Confira as pagadoras: a segunda exige a primeira; nomes devem ser distintos e o percentual deve ser zero quando não há segunda empresa.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await api<Vehicle>(
        `/vehicles/${vehicle.plate}/payers`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            first_payer: a,
            second_payer: b,
            second_payer_percent: Number((rate / 100).toFixed(6)),
          }),
        },
      );
      show({ ...vehicle, ...result });
      setSuccess(
        "Pagadoras atualizadas. Fechamentos históricos foram preservados.",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="success">
          {success}
        </p>
      )}
      <section className="panel reference-form">
        <form onSubmit={search}>
          <fieldset disabled={busy}>
            <label>
              Placa para consulta
              <input
                required
                pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}"
                maxLength={7}
                value={plate}
                onChange={(e) => {
                  setPlate(e.target.value);
                  setVehicle(null);
                  setSuccess("");
                }}
                placeholder="ABC1D23"
              />
            </label>
            <button className="primary">
              {busy ? "Aguarde…" : "Consultar veículo"}
            </button>
          </fieldset>
        </form>
      </section>
      {vehicle && (
        <section ref={vehicleRef} className="panel reference-form">
          <h2>
            {vehicle.plate} · {vehicle.vehicleType?.typeName}
          </h2>
          <p>
            Este cadastro é compartilhado entre unidades. Apenas administradores
            podem alterar as pagadoras.
          </p>
          <form onSubmit={save}>
            <fieldset disabled={busy || !isAdmin}>
              <div className="form-grid">
                <label>
                  Primeira empresa
                  <input
                    maxLength={30}
                    value={first}
                    onChange={(e) => setFirst(e.target.value)}
                  />
                </label>
                <label>
                  Segunda empresa
                  <input
                    maxLength={30}
                    value={second}
                    onChange={(e) => setSecond(e.target.value)}
                  />
                </label>
                <label>
                  Percentual da segunda empresa (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    required
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                  />
                </label>
              </div>
              <p>
                Informe 30 para 30%. A primeira empresa recebe o restante quando
                o rateio se aplica.
              </p>
              <p className="muted">
                O rateio depende das regras do fechamento, incluindo saldo acima
                de R$ 1.000 e ausência de identificador CTRB. Para remover a
                configuração, deixe as empresas vazias e informe 0%. As
                alterações valem para novas conferências; não modificam o
                histórico.
              </p>
              {isAdmin && <button className="primary">Salvar pagadoras</button>}
            </fieldset>
          </form>
          {!isAdmin && (
            <p>Consulta somente. Solicite alterações ao administrador.</p>
          )}
        </section>
      )}
    </div>
  );
}
