import { normalizePlate, normalizeWeek } from "./field-formats";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
export type ClosureFilters = {
  inicio: string;
  fim: string;
  despesa: string;
  usuario: string;
  numero: string;
  tipo: string;
  categoria: string;
  ordenar_data: boolean;
  ordenar_tipo: boolean;
  finalizados: boolean;
  mista: boolean;
  separar_pagamentos: boolean;
};
export const emptyClosureFilters: ClosureFilters = {
  inicio: "",
  fim: "",
  despesa: "",
  usuario: "",
  numero: "",
  tipo: "",
  categoria: "Todos",
  ordenar_data: false,
  ordenar_tipo: false,
  finalizados: false,
  mista: false,
  separar_pagamentos: false,
};
export default function ClosureForm({
  token,
  busy,
  isAdmin,
  week,
  plate,
  filters,
  setWeek,
  setPlate,
  setFilters,
  conference,
  finalize,
  selectClosure,
  cancel,
  expired,
}: {
  token: string;
  busy: boolean;
  isAdmin: boolean;
  week: string;
  plate: string;
  filters: ClosureFilters;
  setWeek: (v: string) => void;
  setPlate: (v: string) => void;
  setFilters: (v: ClosureFilters) => void;
  conference: (e: FormEvent) => void;
  finalize: () => void;
  selectClosure: () => void;
  cancel: () => void;
  expired: () => void;
}) {
  const [weeks, setWeeks] = useState<
      { codigo: string; data_inicio: string; data_fim: string }[]
    >([]),
    [vehicles, setVehicles] = useState<
      { plate: string; codVehicleType: number }[]
    >([]),
    [types, setTypes] = useState<
      { codVehicleType: number; typeName: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      api<typeof weeks>("/weeks", token),
      api<typeof vehicles>("/registrations/vehicles", token),
      api<typeof types>("/registrations/vehicle-types", token),
    ])
      .then(([w, v, t]) => {
        if (active) {
          setWeeks(w);
          setVehicles(v);
          setTypes(t);
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof ApiError && e.status === 401) expired();
          else setError((e as Error).message);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);
  const change = (key: keyof ClosureFilters, value: string | boolean) =>
    setFilters({ ...filters, [key]: value });
  const selectedWeek = weeks.find((w) => w.codigo === week),
    vehicle = vehicles.find((v) => v.plate === plate.toUpperCase());
  const typeName = types.find(
    (t) => t.codVehicleType === vehicle?.codVehicleType,
  )?.typeName;
  return (
    <form className="closure-vba-form" onSubmit={conference}>
      <fieldset disabled={busy}>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <div className="closure-vba-grid">
          <label>
            Semana
            <input
              aria-label="Código da semana"
              list="closure-weeks"
              value={week}
              maxLength={4}
              pattern="[0-9]{4}"
              onChange={(e) => {
                setWeek(normalizeWeek(e.target.value));
                setFilters({ ...filters, inicio: "", fim: "" });
              }}
            />
            <datalist id="closure-weeks">
              {weeks
                .filter((w) => w.codigo)
                .map((w) => (
                  <option key={w.codigo} value={w.codigo} />
                ))}
            </datalist>
          </label>
          <p className="muted">
            {selectedWeek
              ? `${selectedWeek.data_inicio?.slice(0, 10).split("-").reverse().join("/")} a ${selectedWeek.data_fim?.slice(0, 10).split("-").reverse().join("/")}`
              : "Selecione a semana ou informe um período abaixo."}
          </p>
          <label>
            Placa
            <input
              aria-label="Placa para fechamento"
              list="closure-plates"
              value={plate}
              maxLength={8}
              pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}"
              onChange={(e) => setPlate(normalizePlate(e.target.value))}
            />
            <datalist id="closure-plates">
              {vehicles
                .filter((v) => v.plate)
                .map((v) => (
                  <option key={v.plate} value={v.plate} />
                ))}
            </datalist>
          </label>
          <p className="muted">
            {typeName ?? "Placa vazia: todos os veículos da unidade."}
          </p>
          <label>
            Início
            <input
              type="date"
              value={filters.inicio}
              onChange={(e) => {
                setWeek("");
                change("inicio", e.target.value);
              }}
            />
          </label>
          <label>
            Fim
            <input
              type="date"
              value={filters.fim}
              onChange={(e) => {
                setWeek("");
                change("fim", e.target.value);
              }}
            />
          </label>
          <label>
            Usuário
            <input
              value={filters.usuario}
              inputMode="numeric"
              pattern="[0-9]+"
              onChange={(e) => change("usuario", e.target.value)}
            />
          </label>
          <label>
            Categoria de veículo
            <select
              value={filters.categoria}
              onChange={(e) =>
                setFilters({ ...filters, categoria: e.target.value, tipo: "" })
              }
            >
              <option>Todos</option>
              <option>Agregado</option>
              <option value="Esporadico">Esporádico</option>
            </select>
          </label>
          <label>
            Núm. fechamento
            <input
              inputMode="numeric"
              pattern="[0-9]+"
              value={filters.numero}
              onChange={(e) => change("numero", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  selectClosure();
                }
              }}
            />
            <button
              type="button"
              className="text-button"
              onClick={selectClosure}
            >
              Consultar número
            </button>
          </label>
          <label>
            Tipos de veículos
            <select
              value={filters.tipo}
              onChange={(e) => change("tipo", e.target.value)}
            >
              <option value="">Todos</option>
              {types
                .filter(
                  (t) =>
                    t.codVehicleType != null &&
                    (filters.categoria === "Todos" ||
                      (filters.categoria === "Agregado"
                        ? t.codVehicleType < 100
                        : t.codVehicleType >= 100)),
                )
                .map((t) => (
                  <option key={t.codVehicleType} value={t.codVehicleType}>
                    {t.codVehicleType} · {t.typeName}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <fieldset className="legacy-group">
          <legend>Configurações de relatório</legend>
          <div className="closure-report-options">
            {(
              [
                ["ordenar_data", "Ordenar manifestos por data e número"],
                ["ordenar_tipo", "Ordenar por tipo de veículo"],
                ["finalizados", "Incluir finalizados"],
                ["mista", "Carga mista"],
                ["separar_pagamentos", "Separar pagamentos"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={filters[key]}
                  onChange={(e) => change(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="muted">
          Separar pagamentos agrupa a conferência por empresa, sem aplicar
          percentual. Fechar semana usa todos os registros abertos da semana: da
          placa informada ou de todos os veículos se a placa estiver vazia. Os
          demais filtros são usados apenas no relatório.
        </p>
        <div className="actions">
          <button className="secondary">Relatório de conferência</button>
          <button type="button" className="primary" onClick={finalize}>
            Fechar semana
          </button>
          {isAdmin && (
            <button type="button" className="secondary" onClick={cancel}>
              Excluir pagamento
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
