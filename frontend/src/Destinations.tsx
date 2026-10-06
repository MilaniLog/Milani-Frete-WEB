import SortableTable from "./SortableTable";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
type Destination = { id: number; nome: string };
export default function Destinations({
  token,
  expired,
}: {
  token: string;
  expired: () => void;
}) {
  const [rows, setRows] = useState<Destination[]>([]),
    [name, setName] = useState(""),
    [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) expired();
    else setError((e as Error).message);
  }
  async function load() {
    setLoading(true);
    try {
      setRows(await api<Destination[]>("/destinations", token));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const row = await api<Destination>("/destinations", token, {
        method: "POST",
        body: JSON.stringify({ nome: name.trim() }),
      });
      setName("");
      setFilter("");
      setSuccess(`Destino ${row.nome} cadastrado.`);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter((r) =>
    r.nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(
        filter
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase(),
      ),
  );
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
        <h2>Novo destino</h2>
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            <label>
              Destino
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={150}
              />
            </label>
            <button className="primary">Cadastrar destino</button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <div className="filters">
          <label>
            Pesquisar destino
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Atualizar destinos
          </button>
        </div>
        {loading ? (
          <p role="status">Carregando destinos…</p>
        ) : (
          <>
            <div className="table-scroll">
              <SortableTable>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.nome}</td>
                    </tr>
                  ))}
                </tbody>
              </SortableTable>
            </div>
            {!visible.length && <p>Nenhum destino encontrado.</p>}
            <p className="table-footer">{visible.length} destinos exibidos.</p>
          </>
        )}
      </section>
    </div>
  );
}
