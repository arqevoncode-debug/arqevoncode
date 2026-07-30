"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DEVICE_OPTIONS = [1, 2, 3, 4, 5];
const PLAN_LABELS = {
  individual: "Individual",
  multidispositivo: "Multidispositivo",
  familia: "Família",
};
const STATUS_LABELS = {
  active: "Ativa",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};
const STATUS_GROUPS = [
  { id: "active", title: "Licenças ativas", description: "Acessos liberados para uso." },
  { id: "suspended", title: "Licenças suspensas", description: "Acesso bloqueado até a reativação." },
  { id: "cancelled", title: "Licenças canceladas", description: "Registros mantidos apenas para consulta." },
];
const INITIAL_FORM = { customerName: "", email: "", plan: "individual", maxDevices: 1, notes: "" };
const FEEDBACK_LABELS = {
  sugestao: "Sugestão",
  problema: "Problema",
  duvida: "Dúvida",
  elogio: "Elogio",
};
const FEEDBACK_FILTERS = [
  { id: "novo", label: "Novos" },
  { id: "lido", label: "Lidos" },
  { id: "arquivado", label: "Arquivados" },
  { id: "all", label: "Todos" },
];

const fmtData = value => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value))
  : "Sem vencimento";
const fmtDataHora = value => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "—";

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? "compact" : ""}`}>
    <img src="/arqevon-finance-icon.png" alt="" />
    <div><b>Arqevon Finance</b><small>Gerenciador de licenças</small></div>
  </div>;
}

function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        // O servidor distingue credencial inválida de bloqueio por tentativas; preserve a razão real.
        const corpo = await response.json().catch(() => ({}));
        throw new Error(corpo.error || "E-mail ou senha incorretos.");
      }
      onSuccess();
    } catch (err) {
      setError(err.message || "Não foi possível entrar.");
    } finally { setLoading(false); }
  }

  return <main className="login-shell">
    <section className="login-card">
      <Brand />
      <p className="eyebrow">ÁREA INTERNA</p>
      <h1>Controle suas licenças</h1>
      <p className="muted">Crie acessos, acompanhe ativações e gerencie os dispositivos dos clientes.</p>
      <form onSubmit={submit}>
        <label>E-mail administrativo<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="username" /></label>
        <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={loading}>{loading ? "Entrando…" : "Entrar no painel"}</button>
      </form>
    </section>
  </main>;
}

function NewLicense({ onCreated }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível criar a licença.");
      setForm(INITIAL_FORM);
      onCreated(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));

  return <section className="panel new-license">
    <div className="panel-intro">
      <span className="section-icon">＋</span>
      <p className="eyebrow">NOVA LICENÇA</p>
      <h2>Gerar acesso</h2>
      <p>Defina o cliente e quantos computadores poderão usar a chave.</p>
    </div>
    <form onSubmit={submit} className="license-form">
      <label>Cliente<input value={form.customerName} onChange={e => change("customerName", e.target.value)} required placeholder="Nome do cliente" /></label>
      <label>E-mail <span className="optional">opcional</span><input type="email" value={form.email} onChange={e => change("email", e.target.value)} placeholder="cliente@exemplo.com" /></label>
      <label>Plano<select value={form.plan} onChange={e => change("plan", e.target.value)}>
        <option value="individual">Individual</option>
        <option value="multidispositivo">Multidispositivo</option>
        <option value="familia">Família</option>
      </select></label>
      <label>Dispositivos<select value={form.maxDevices} onChange={e => change("maxDevices", Number(e.target.value))}>
        {DEVICE_OPTIONS.map(value => <option key={value} value={value}>{value} {value === 1 ? "dispositivo" : "dispositivos"}</option>)}
      </select></label>
      <label className="wide">Observações <span className="optional">opcional</span><input value={form.notes} onChange={e => change("notes", e.target.value)} placeholder="Pagamento, pedido ou informação de suporte" /></label>
      {error && <p className="error wide">{error}</p>}
      <button className="primary create-button" disabled={loading}>{loading ? "Gerando…" : "Gerar licença"}</button>
    </form>
  </section>;
}

function CreatedKeyModal({ result, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(result.licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return <div className="key-modal" role="dialog" aria-modal="true" aria-labelledby="created-title">
    <div>
      <span className="success-icon">✓</span>
      <p className="eyebrow">LICENÇA CRIADA</p>
      <h2 id="created-title">Chave pronta para uso</h2>
      <p>Copie e envie ao cliente. Por segurança, ela não será exibida novamente.</p>
      <code>{result.licenseKey}</code>
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={copy}>{copied ? "Copiada ✓" : "Copiar chave"}</button>
        <button type="button" className="primary" onClick={onClose}>Concluído</button>
      </div>
    </div>
  </div>;
}

function LicenseCard({ item, onChanged }) {
  const activeDevices = item.activations?.filter(activation => !activation.revoked_at) || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(url, options) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, options);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const update = patch => request(`/api/admin/licenses/${item.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
  });

  async function revoke(id) {
    if (!confirm("Liberar este dispositivo? O aplicativo precisará ser ativado novamente.")) return;
    await request(`/api/admin/activations/${id}`, { method: "DELETE" });
  }

  async function remove() {
    if (!confirm(`Excluir permanentemente a licença de ${item.customer_name}? Esta ação também apagará o histórico de dispositivos e não poderá ser desfeita.`)) return;
    await request(`/api/admin/licenses/${item.id}`, { method: "DELETE" });
  }

  return <article className={`license-card ${item.status}`}>
    <div className="license-head">
      <div className="customer">
        <span className="customer-avatar">{item.customer_name.slice(0, 1).toUpperCase()}</span>
        <div><h3>{item.customer_name}</h3><p>{item.email || "Sem e-mail cadastrado"}</p></div>
      </div>
      <span className={`status ${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
    </div>
    <div className="license-summary">
      <div><small>PLANO</small><b>{PLAN_LABELS[item.plan] || item.plan}</b></div>
      <div><small>DISPOSITIVOS</small><b>{activeDevices.length} de {item.max_devices}</b></div>
      <div><small>CRIADA EM</small><b>{fmtData(item.created_at)}</b></div>
    </div>
    {item.notes && <p className="notes">{item.notes}</p>}
    <div className="devices">
      <div className="devices-title"><b>Dispositivos ativos</b><span>{activeDevices.length}/{item.max_devices}</span></div>
      {activeDevices.length === 0
        ? <p className="empty">Nenhum dispositivo ativado.</p>
        : activeDevices.map(device => <div className="device" key={device.id}>
          <span className="device-icon">{device.os === "macos" ? "⌘" : "▣"}</span>
          <div><b>{device.device_name || "Dispositivo"}</b><small>{device.os || "Sistema desconhecido"} · versão {device.app_version || "—"} · visto em {fmtData(device.last_seen_at)}</small></div>
          <button type="button" className="text danger" disabled={busy} onClick={() => revoke(device.id)}>Liberar</button>
        </div>)}
    </div>
    {error && <p className="error card-error">{error}</p>}
    <div className="card-actions">
      <div className="main-actions">
        {item.status === "active"
          ? <button type="button" className="secondary" disabled={busy} onClick={() => update({ status: "suspended" })}>Suspender</button>
          : <button type="button" className="secondary" disabled={busy} onClick={() => update({ status: "active" })}>Reativar</button>}
        <button type="button" className="delete-button" disabled={busy} onClick={remove}>Excluir</button>
      </div>
      <label>Limite<select value={item.max_devices} disabled={busy} onChange={e => update({ maxDevices: Number(e.target.value) })}>
        {DEVICE_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>
  </article>;
}

function FeedbackCard({ item, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cliente = item.licenses;

  async function setStatus(status) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/feedbacks/${item.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o feedback.");
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <article className={`feedback-card ${item.status}`}>
    <div className="feedback-head">
      <div className="customer">
        <span className="customer-avatar">{(cliente?.customer_name || "?").slice(0, 1).toUpperCase()}</span>
        <div>
          <h3>{cliente?.customer_name || "Cliente removido"}</h3>
          <p>{cliente?.email || "Sem e-mail cadastrado"}</p>
        </div>
      </div>
      <span className={`feedback-tag ${item.category}`}>{FEEDBACK_LABELS[item.category] || item.category}</span>
    </div>
    <p className="feedback-message">{item.message}</p>
    <div className="feedback-meta">
      <span>{fmtDataHora(item.created_at)}</span>
      <span>versão {item.app_version || "—"}</span>
      {cliente?.plan && <span>plano {PLAN_LABELS[cliente.plan] || cliente.plan}</span>}
      {cliente?.status && cliente.status !== "active" && <span className="alerta">licença {STATUS_LABELS[cliente.status] || cliente.status}</span>}
    </div>
    {error && <p className="error card-error">{error}</p>}
    <div className="feedback-actions">
      {item.status !== "lido" && <button type="button" className="secondary" disabled={busy} onClick={() => setStatus("lido")}>Marcar como lido</button>}
      {item.status !== "arquivado" && <button type="button" className="text" disabled={busy} onClick={() => setStatus("arquivado")}>Arquivar</button>}
      {item.status !== "novo" && <button type="button" className="text" disabled={busy} onClick={() => setStatus("novo")}>Reabrir</button>}
    </div>
  </article>;
}

function Feedbacks({ items, loading, loadError, onChanged }) {
  const [filter, setFilter] = useState("novo");

  const counts = useMemo(() => ({
    all: items.length,
    novo: items.filter(item => item.status === "novo").length,
    lido: items.filter(item => item.status === "lido").length,
    arquivado: items.filter(item => item.status === "arquivado").length,
  }), [items]);

  const filtered = useMemo(() => filter === "all" ? items : items.filter(item => item.status === filter), [items, filter]);

  return <section className="licenses-area">
    <div className="list-head">
      <div><p className="eyebrow">VOZ DO CLIENTE</p><h2>Feedbacks recebidos</h2></div>
    </div>
    <div className="status-tabs" role="tablist" aria-label="Agrupar feedbacks por situação">
      {FEEDBACK_FILTERS.map(tab =>
        <button type="button" role="tab" aria-selected={filter === tab.id} className={filter === tab.id ? "selected" : ""}
          key={tab.id} onClick={() => setFilter(tab.id)}>{tab.label}<span>{counts[tab.id]}</span></button>)}
    </div>
    {loadError && <p className="error load-error">{loadError}</p>}
    {loading ? <p className="loading">Carregando feedbacks…</p> : filtered.length
      ? <div className="feedback-grid">{filtered.map(item => <FeedbackCard key={item.id} item={item} onChanged={onChanged} />)}</div>
      : <p className="empty panel">Nenhum feedback neste grupo.</p>}
  </section>;
}

function Dashboard({ onLogout }) {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newKey, setNewKey] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("licencas");
  const [feedbacks, setFeedbacks] = useState([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(true);
  const [feedbacksError, setFeedbacksError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/licenses", { cache: "no-store" });
      if (response.status === 401) return onLogout();
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as licenças.");
      setLicenses(result.licenses || []); setLoadError("");
    } catch (err) { setLoadError(err.message); }
    finally { setLoading(false); }
  }, [onLogout]);

  const loadFeedbacks = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/feedbacks", { cache: "no-store" });
      if (response.status === 401) return onLogout();
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os feedbacks.");
      setFeedbacks(result.feedbacks || []); setFeedbacksError("");
    } catch (err) { setFeedbacksError(err.message); }
    finally { setFeedbacksLoading(false); }
  }, [onLogout]);

  useEffect(() => { load(); loadFeedbacks(); }, [load, loadFeedbacks]);

  const novosFeedbacks = feedbacks.filter(item => item.status === "novo").length;

  const counts = useMemo(() => ({
    all: licenses.length,
    active: licenses.filter(item => item.status === "active").length,
    suspended: licenses.filter(item => item.status === "suspended").length,
    cancelled: licenses.filter(item => item.status === "cancelled").length,
  }), [licenses]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return licenses.filter(item => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const haystack = `${item.customer_name} ${item.email || ""} ${PLAN_LABELS[item.plan] || item.plan}`.toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [licenses, search, statusFilter]);

  const visibleGroups = useMemo(() => STATUS_GROUPS
    .filter(group => statusFilter === "all" || statusFilter === group.id)
    .map(group => ({ ...group, licenses: filtered.filter(item => item.status === group.id) }))
    .filter(group => group.licenses.length > 0), [filtered, statusFilter]);

  const activeDevices = licenses.flatMap(item => item.activations || []).filter(activation => !activation.revoked_at).length;

  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); onLogout(); }

  return <main className="dashboard-shell">
    <header className="topbar">
      <Brand compact />
      <button type="button" className="logout" onClick={logout}>Sair</button>
    </header>
    <section className="hero">
      <div><p className="eyebrow">CENTRAL DE LICENÇAS</p><h1>Controle simples.<br /><span>Acesso organizado.</span></h1><p>Crie licenças, acompanhe dispositivos e mantenha cada cliente sob controle.</p></div>
      <div className="stats" aria-label="Resumo das licenças">
        <div><small>TOTAL</small><b>{licenses.length}</b><span>licenças emitidas</span></div>
        <div className="good"><small>ATIVAS</small><b>{counts.active}</b><span>acessos liberados</span></div>
        <div><small>DISPOSITIVOS</small><b>{activeDevices}</b><span>em uso agora</span></div>
        <div><small>FEEDBACKS</small><b>{novosFeedbacks}</b><span>aguardando leitura</span></div>
      </div>
    </section>
    <nav className="view-tabs" role="tablist" aria-label="Seções do painel">
      <button type="button" role="tab" aria-selected={view === "licencas"} className={view === "licencas" ? "selected" : ""}
        onClick={() => setView("licencas")}>Licenças</button>
      <button type="button" role="tab" aria-selected={view === "feedbacks"} className={view === "feedbacks" ? "selected" : ""}
        onClick={() => setView("feedbacks")}>Feedbacks{novosFeedbacks > 0 && <span className="badge">{novosFeedbacks}</span>}</button>
    </nav>
    {view === "feedbacks"
      ? <Feedbacks items={feedbacks} loading={feedbacksLoading} loadError={feedbacksError} onChanged={loadFeedbacks} />
      : <>
    <NewLicense onCreated={result => { setNewKey(result); load(); }} />
    {newKey && <CreatedKeyModal result={newKey} onClose={() => setNewKey(null)} />}
    <section className="licenses-area">
      <div className="list-head">
        <div><p className="eyebrow">CARTEIRA DE CLIENTES</p><h2>Licenças emitidas</h2></div>
        <label className="search"><span>⌕</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, e-mail ou plano" aria-label="Buscar licenças" /></label>
      </div>
      <div className="status-tabs" role="tablist" aria-label="Agrupar licenças por situação">
        {[{ id: "all", label: "Todas" }, { id: "active", label: "Ativas" }, { id: "suspended", label: "Suspensas" }, { id: "cancelled", label: "Canceladas" }].map(tab =>
          <button type="button" role="tab" aria-selected={statusFilter === tab.id} className={statusFilter === tab.id ? "selected" : ""} key={tab.id} onClick={() => setStatusFilter(tab.id)}>{tab.label}<span>{counts[tab.id]}</span></button>)}
      </div>
      {loadError && <p className="error load-error">{loadError}</p>}
      {loading ? <p className="loading">Carregando licenças…</p> : visibleGroups.length
        ? visibleGroups.map(group => <section className="license-group" key={group.id}>
          <header><div><span className={`group-dot ${group.id}`} /><div><h3>{group.title}</h3><p>{group.description}</p></div></div><b>{group.licenses.length}</b></header>
          <div className="license-grid">{group.licenses.map(item => <LicenseCard key={item.id} item={item} onChanged={load} />)}</div>
        </section>)
        : <p className="empty panel">Nenhuma licença encontrada neste grupo.</p>}
    </section>
      </>}
  </main>;
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(null);
  useEffect(() => { fetch("/api/admin/session").then(response => setAuthenticated(response.ok)).catch(() => setAuthenticated(false)); }, []);
  if (authenticated === null) return <main className="login-shell"><p>Carregando…</p></main>;
  return authenticated ? <Dashboard onLogout={() => setAuthenticated(false)} /> : <Login onSuccess={() => setAuthenticated(true)} />;
}
