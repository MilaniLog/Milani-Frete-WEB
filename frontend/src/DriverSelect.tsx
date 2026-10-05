import SearchableSelect from "./SearchableSelect";
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

type Driver = { cpf: string; name: string };
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

export default function DriverSelect({
  token,
  initialName = "",
  initialCpf = "",
  resetKey,
  label = "Motorista",
  expired,
}: {
  token: string;
  initialName?: string;
  initialCpf?: string;
  resetKey?: string;
  label?: string;
  searchable?: boolean;
  expired: () => void;
}) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelected("");
    setDrivers([]);
    api<Driver[]>("/drivers", token)
      .then((rows) => {
        if (!active) return;
        setDrivers(rows);
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) expired();
        else setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);
  useEffect(() => {
    const matches = drivers.filter(driver => normalize(driver.name) === normalize(initialName));
    setSelected(initialCpf && drivers.some(driver => driver.cpf === initialCpf)
      ? initialCpf : !initialCpf && initialName && matches.length === 1 ? matches[0].cpf : '');
  }, [drivers, initialName, initialCpf, resetKey]);
  const matches = drivers;
  const counts = new Map<string, number>();
  for (const driver of drivers)
    counts.set(
      normalize(driver.name),
      (counts.get(normalize(driver.name)) ?? 0) + 1,
    );
  return (
    <div className="driver-select">
      <label>
        {label}
        <SearchableSelect
          name="cpf_motorista"
          aria-label={label}
          required
          disabled={loading || !!error}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="" disabled>
            {loading ? "Carregando motoristas…" : "Selecione o motorista"}
          </option>
          {matches.map((driver) => (
            <option key={driver.cpf} value={driver.cpf}>
              {driver.name}
              {counts.get(normalize(driver.name))! > 1
                ? ` — CPF final ${driver.cpf.slice(-4)}`
                : ""}
            </option>
          ))}
        </SearchableSelect>
      </label>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setAttempt(attempt + 1)}
          >
            Tentar carregar motoristas novamente
          </button>
        </p>
      )}
      {!loading && !error && !matches.length && (
        <p role="status">Nenhum motorista encontrado com esse nome.</p>
      )}
      {!loading && !error && initialName && !selected && (
        <p className="muted">
          Selecione o cadastro correspondente ao motorista do registro.
        </p>
      )}
    </div>
  );
}
