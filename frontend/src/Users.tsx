import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";

type UserRow = {
  id: number;
  cod: number;
  Name: string;
  unit: number;
  isAdmin: boolean;
  freight_profile: "OPERACAO" | "FINANCEIRO" | "RH";
};
type Unit = { codigo: number; local: string; dominio: string | null };
type UserForm = {
  cod: string;
  name: string;
  password: string;
  unit: string;
  isAdmin: boolean;
  freightProfile: UserRow["freight_profile"];
};

const empty: UserForm = {
  cod: "",
  name: "",
  password: "",
  unit: "",
  isAdmin: false,
  freightProfile: "OPERACAO",
};

export default function Users({ token, expired }: { token: string; expired: () => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  const normalize = (value: unknown) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const query = normalize(search.trim());
  const visibleUsers = users.filter((user) => {
    const unit = units.find((item) => item.codigo === user.unit);
    const profile = user.freight_profile === "OPERACAO" ? "Operação" : user.freight_profile;
    return !query || [
      user.cod,
      user.Name,
      user.unit,
      unit?.local,
      unit?.dominio,
      profile,
      user.isAdmin ? "Administrador Sim" : "Administrador Não",
    ].some((value) => normalize(value).includes(query));
  });

  function fail(value: unknown) {
    if (value instanceof ApiError && value.status === 401) expired();
    else setError((value as Error).message);
  }
  async function load() {
    const [userRows, unitRows] = await Promise.all([
      api<UserRow[]>("/users", token),
      api<Unit[]>("/registrations/units", token),
    ]);
    setUsers(userRows);
    setUnits(unitRows);
  }
  useEffect(() => {
    void load().catch(fail);
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const saved = await api<UserRow>(editing == null ? "/users" : `/users/${editing}`, token, {
        method: editing == null ? "POST" : "PUT",
        body: JSON.stringify({
          ...(editing == null ? { cod: Number(form.cod) } : {}),
          name: form.name.trim(),
          ...(form.password ? { password: form.password } : {}),
          unit: Number(form.unit),
          isAdmin: form.isAdmin,
          freightProfile: form.freightProfile,
        }),
      });
      setSuccess(`Usuário ${saved.cod} ${editing == null ? "criado" : "atualizado"} com sucesso.`);
      setForm(empty);
      setEditing(null);
      await load();
    } catch (value) {
      fail(value);
    } finally {
      setBusy(false);
    }
  }

  return <div className="content">
    {error && <p className="alert" role="alert">{error}</p>}
    {success && <p className="success" role="status">{success}</p>}
    <section className="panel reference-form">
      <h1>Usuários</h1>
      <p className="muted">Cadastro disponível somente para administradores.</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label>Código
              <input required disabled={editing != null} inputMode="numeric" pattern="[0-9]+" value={form.cod} onChange={(event) => setForm({ ...form, cod: event.target.value.replace(/\D/g, "") })} />
            </label>
            <label>Nome
              <input required maxLength={50} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>{editing == null ? "Senha inicial" : "Nova senha (opcional)"}
              <input required={editing == null} type="password" minLength={6} maxLength={128} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
            <label>Unidade
              <select required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>
                <option value="">Selecione</option>
                {units.map((unit) => <option key={unit.codigo} value={unit.codigo}>{unit.codigo} - {unit.local}</option>)}
              </select>
            </label>
            <label>Perfil
              <select value={form.freightProfile} onChange={(event) => setForm({ ...form, freightProfile: event.target.value as UserForm["freightProfile"] })}>
                <option value="OPERACAO">Operação</option>
                <option value="FINANCEIRO">Financeiro</option>
                <option value="RH">RH</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.isAdmin} onChange={(event) => setForm({ ...form, isAdmin: event.target.checked })} />
              <span>Administrador</span>
            </label>
          </div>
          <button className="primary">{busy ? "Salvando…" : editing == null ? "Criar usuário" : "Salvar alterações"}</button>{" "}
          {editing != null && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(empty); }}>Cancelar edição</button>}
        </fieldset>
      </form>
    </section>
    <section className="panel">
      <h2>Usuários cadastrados</h2>
      <div className="filters">
        <label>Pesquisar usuário
          <input
            type="search"
            placeholder="Código, nome, unidade ou perfil"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="table-scroll"><table>
        <thead><tr><th>Código</th><th>Nome</th><th>Unidade</th><th>Perfil</th><th>Administrador</th><th>Ações</th></tr></thead>
        <tbody>{visibleUsers.map((user) => <tr key={user.id}>
          <td>{user.cod}</td><td>{user.Name}</td><td>{user.unit}</td><td>{user.freight_profile === "OPERACAO" ? "Operação" : user.freight_profile}</td><td>{user.isAdmin ? "Sim" : "Não"}</td><td><button type="button" className="secondary" onClick={() => {
            setEditing(user.cod);
            setForm({ cod: String(user.cod), name: user.Name, password: "", unit: String(user.unit), isAdmin: user.isAdmin, freightProfile: user.freight_profile });
            setError("");
            setSuccess("");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}>Editar</button></td>
        </tr>)}</tbody>
      </table></div>
      {!users.length && <p>Nenhum usuário cadastrado.</p>}
      {!!users.length && !visibleUsers.length && <p>Nenhum usuário encontrado para essa pesquisa.</p>}
    </section>
  </div>;
}
