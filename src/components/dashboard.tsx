"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  FlaskConical,
  Instagram,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import type { Automation, DashboardData, Delivery, Product } from "@/lib/types";
import { matches, renderMessage } from "@/lib/domain";
import { demoData } from "@/lib/demo";

type Tab = "overview" | "automations" | "products" | "activity" | "settings";
type Media = {
  id: string;
  caption: string;
  permalink: string;
  mediaType: string;
  thumbnailUrl?: string;
};
type Modal =
  | { kind: "product"; product?: Product }
  | { kind: "automation"; automation?: Automation }
  | { kind: "delivery"; delivery: Delivery }
  | {
      kind: "confirm";
      title: string;
      text: string;
      action: () => Promise<void>;
    };
const navigation = [
  { id: "overview" as const, label: "Visão geral", icon: LayoutDashboard },
  { id: "automations" as const, label: "Automações", icon: Zap },
  { id: "products" as const, label: "Produtos", icon: Package },
  { id: "activity" as const, label: "Histórico", icon: Activity },
  { id: "settings" as const, label: "Configurações", icon: Settings2 },
];
const labels: Record<Delivery["status"], string> = {
  sent: "Enviada",
  queued: "Na fila",
  sending: "Enviando",
  failed: "Falhou",
  uncertain: "Conferir direct",
  skipped: "Ignorada",
};
const STORAGE = "respondichat-demo-v1";
async function api<T>(
  resource: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/manage/${resource}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Sua sessão expirou.");
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Não foi possível concluir a operação.");
  return data;
}
function dateTime(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date));
}
function totalCounts(deliveries: Delivery[]) {
  return {
    sent: deliveries.filter((d) => d.status === "sent").length,
    queued: deliveries.filter((d) => ["queued", "sending"].includes(d.status))
      .length,
    failed: deliveries.filter((d) => d.status === "failed").length,
    uncertain: deliveries.filter((d) => d.status === "uncertain").length,
  };
}

export default function Dashboard({
  initial,
  demo,
}: {
  initial?: DashboardData;
  demo: boolean;
}) {
  const [data, setData] = useState<DashboardData | null>(initial ?? null);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedRule, setSelectedRule] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const closeModal = useCallback(() => setModal(null), []);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const refresh = useCallback(async () => {
    if (demo) return;
    try {
      setData(await api<DashboardData>("dashboard"));
      setLoadError("");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o painel.",
      );
    }
  }, [demo]);
  useEffect(() => {
    if (demo) {
      try {
        const saved = localStorage.getItem(STORAGE);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (
            parsed?.config?.demo &&
            Array.isArray(parsed.products) &&
            Array.isArray(parsed.automations) &&
            Array.isArray(parsed.deliveries)
          )
            setData(parsed);
        }
      } catch {
        /* Browser storage is optional. */
      }
      setDemoLoaded(true);
    } else {
      void refresh();
      const timer = setInterval(() => void refresh(), 15_000);
      return () => clearInterval(timer);
    }
  }, [demo, refresh]);
  useEffect(() => {
    if (demo && demoLoaded && data) {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(data));
      } catch {
        /* Quota does not prevent using the preview. */
      }
    }
  }, [data, demo, demoLoaded]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connection = params.get("connection");
    if (!connection) return;
    const authorizationReasons: Record<string, string> = {
      client_credentials: "O Instagram rejeitou as credenciais do aplicativo. Confira o ID e a chave secreta do Instagram na Vercel.",
      invalid_token: "O Instagram rejeitou a autorização recebida. Inicie uma nova conexão; o responsável deve conferir o diagnóstico na Meta.",
      expired_token: "A autorização do Instagram expirou. Inicie a conexão novamente.",
      app_mismatch: "A autorização pertence a outro aplicativo. O responsável deve conferir se o ID e a chave do Instagram são do mesmo app.",
      permissions: "O Instagram não liberou as permissões necessárias. Confira o aceite de testadora e autorize os acessos solicitados.",
      request_parameters: "O Instagram rejeitou a solicitação de conexão. O responsável pelo painel precisa revisar a integração.",
      unsupported_request: "O Instagram não aceitou a troca da autorização. O responsável pelo painel precisa revisar a integração.",
    };
    const failureMessages: Record<string, string> = {
      session: "Sua sessão do painel expirou. Entre novamente e inicie a conexão.",
      short_token: "O Instagram não confirmou a autorização. Confira o aceite de testadora e as credenciais do aplicativo Meta.",
      long_token: "Não foi possível concluir a autorização do Instagram. O responsável pelo painel deve revisar as credenciais do aplicativo Meta.",
      profile: "Não foi possível consultar seu perfil. Confira a permissão de acesso aos dados básicos do Instagram.",
      save_account: "Não foi possível salvar a conexão no painel. O responsável deve conferir o banco e a configuração de criptografia.",
      subscribe: "Seu perfil foi autorizado, mas os eventos de comentários não foram ativados. Confira a permissão de comentários e o webhook na Meta.",
      save_subscription: "Os eventos foram ativados, mas o painel não conseguiu salvar essa confirmação. Tente conectar novamente.",
    };
    const messages: Record<string, string> = {
      success: "Instagram conectado. Sincronize seus posts para começar.",
      wrong_profile: "Autorize o perfil @michellefmkt na tela do Instagram.",
      denied: "A autorização foi cancelada.",
      invalid_state: "A autorização expirou. Inicie a conexão novamente.",
      disconnect_first: "Desconecte a conta anterior antes de trocar o perfil.",
      failed:
        authorizationReasons[params.get("reason") ?? ""] ?? failureMessages[params.get("stage") ?? ""] ?? "A conexão não foi concluída. O responsável pelo painel deve conferir o diagnóstico da autorização.",
      missing_code: "O Instagram não retornou o código de autorização.",
    };
    notify(
      messages[connection] ?? "Confira a conexão com o Instagram.",
      connection !== "success",
    );
    setTab("settings");
    window.history.replaceState({}, "", "/");
  }, [notify]);
  useEffect(() => {
    if (data && !selectedRule && data.automations.length)
      setSelectedRule(data.automations[0].id);
  }, [data, selectedRule]);
  function navigate(next: Tab) {
    setTab(next);
    setQuery("");
    setFilter("all");
    setMobileMenu(false);
  }
  async function perform(action: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await action();
      if (!demo) await refresh();
      notify(message);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Não foi possível concluir.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  async function syncMedia(loadMore = false) {
    if (demo) {
      setMedia(
        (data?.automations ?? []).map((rule) => ({
          id: rule.mediaId,
          caption: rule.postLabel,
          permalink: rule.postUrl,
          mediaType: "VIDEO",
        })),
      );
      notify(
        "Posts de exemplo carregados. Nenhum acesso ao Instagram foi feito.",
      );
      return;
    }
    setSyncing(true);
    try {
      const result = await api<{ media: Media[]; cursor: string | null }>(
        "media",
        "POST",
        loadMore && cursor ? { cursor } : {},
      );
      setMedia(result.media);
      setCursor(result.cursor);
      notify("Posts sincronizados com o Instagram.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Não foi possível sincronizar.",
        true,
      );
    } finally {
      setSyncing(false);
    }
  }
  async function saveProduct(product: Omit<Product, "id"> & { id?: string }) {
    if (demo) {
      const next = {
        ...product,
        id: product.id ?? crypto.randomUUID(),
      } as Product;
      setData((prev) =>
        prev
          ? {
              ...prev,
              products: [
                next,
                ...prev.products.filter((p) => p.id !== next.id),
              ],
            }
          : prev,
      );
    } else {
      await api("products", "POST", product);
      await refresh();
    }
    setModal(null);
    notify("Produto salvo.");
  }
  async function saveRule(
    rule: Omit<Automation, "id" | "createdAt"> & { id?: string },
  ) {
    if (demo) {
      if (
        rule.active &&
        data?.automations.some(
          (a) => a.active && a.mediaId === rule.mediaId && a.id !== rule.id,
        )
      )
        throw new Error(
          "Já existe uma automação ativa para esse post. Pause a anterior primeiro.",
        );
      const next = {
        ...rule,
        id: rule.id ?? crypto.randomUUID(),
        createdAt:
          data?.automations.find((a) => a.id === rule.id)?.createdAt ??
          new Date().toISOString(),
      } as Automation;
      setData((prev) =>
        prev
          ? {
              ...prev,
              automations: [
                next,
                ...prev.automations.filter((a) => a.id !== next.id),
              ],
            }
          : prev,
      );
    } else {
      await api("automations", "POST", rule);
      await refresh();
    }
    setModal(null);
    notify("Automação salva.");
  }
  async function toggle(rule: Automation) {
    await perform(
      async () => {
        await saveRule({ ...rule, active: !rule.active });
      },
      rule.active ? "Automação pausada." : "Automação ativada.",
    );
  }
  function askDelete(
    kind: "products" | "automations",
    id: string,
    name: string,
  ) {
    setModal({
      kind: "confirm",
      title: `Excluir ${kind === "products" ? "produto" : "automação"}?`,
      text: `“${name}” será removido do painel.`,
      action: async () => {
        if (demo) {
          if (
            kind === "products" &&
            data?.automations.some((a) => a.productIds.includes(id))
          )
            throw new Error(
              "Remova o produto das automações antes de excluí-lo.",
            );
          setData((prev) =>
            prev
              ? { ...prev, [kind]: prev[kind].filter((item) => item.id !== id) }
              : prev,
          );
        } else {
          await api(kind, "DELETE", { id });
          await refresh();
        }
        setModal(null);
        notify("Item excluído.");
      },
    });
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Endereço copiado.");
    } catch {
      notify(
        "Não foi possível copiar. Selecione o endereço manualmente.",
        true,
      );
    }
  }
  const products = useMemo(
    () =>
      (data?.products ?? []).filter((p) =>
        `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [data, query],
  );
  const automations = useMemo(
    () =>
      (data?.automations ?? []).filter(
        (a) =>
          `${a.name} ${a.postLabel} ${a.keywords.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === "all" || (filter === "active" ? a.active : !a.active)),
      ),
    [data, query, filter],
  );
  const deliveries = useMemo(
    () =>
      (data?.deliveries ?? []).filter(
        (d) =>
          `${d.username} ${d.automationName}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === "all" || d.status === filter),
      ),
    [data, query, filter],
  );
  const selected =
    data?.automations.find((rule) => rule.id === selectedRule) ??
    data?.automations[0];
  const configured =
    !!data?.account.connected &&
    data.account.subscribed &&
    !!data.account.expiresAt &&
    new Date(data.account.expiresAt).getTime() > Date.now();

  if (!data)
    return (
      <main className="loading-screen">
        <span className="brand-icon">
          <MessageCircle />
        </span>
        <h1>RespondiChat</h1>
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <button className="button primary" onClick={refresh}>
              Tentar novamente
            </button>
            <a href="/login">Voltar ao acesso</a>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>Preparando seu painel…</p>
          </>
        )}
      </main>
    );
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-icon">
            <MessageCircle size={22} />
          </span>
          Respondi<span>Chat</span>
        </a>
        <div className="workspace-label">SEU ESPAÇO</div>
        <button className="workspace-card" onClick={() => navigate("settings")}>
          <span className="avatar">M</span>
          <span>
            <strong>Michelle</strong>
            <small>@{data.account.username}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label="Menu principal">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? "active" : ""}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "automations" && (
                <span className="nav-count">{data.automations.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="tip-card">
            <span className="tip-icon">
              <Sparkles size={17} />
            </span>
            <strong>Conteúdo que conversa.</strong>
            <p>
              Convide seu público a comentar uma palavra para receber os links.
            </p>
          </div>
          <button
            className="nav-item"
            onClick={() => {
              navigate("settings");
              document
                .getElementById("setup-help")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <CircleHelp size={18} />
            Como começar
          </button>
          {!demo && (
            <button
              className="nav-item"
              onClick={() =>
                perform(async () => {
                  const response = await fetch("/api/auth/logout", {
                    method: "POST",
                  });
                  if (!response.ok) throw new Error("Não foi possível sair.");
                  window.location.assign("/login");
                }, "Sessão encerrada.")
              }
            >
              <LogOut size={18} />
              Sair
            </button>
          )}
          <div className="sidebar-signature">
            <span className="tiny-dot" /> RespondiChat <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>Seu espaço</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-pill ${configured ? "connected" : ""}`}
            >
              <span className="tiny-dot" />
              {demo
                ? "Prévia local"
                : configured
                  ? "Instagram conectado"
                  : "Conexão pendente"}
            </span>
            <button
              className="profile-button"
              onClick={() => navigate("settings")}
              aria-label="Configurações de Michelle"
            >
              M
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-bar">
            <FlaskConical size={15} />
            <span>
              <strong>Modo demonstração.</strong> Dados e links de exemplo.
              Nenhuma mensagem real é enviada.
            </span>
            <button
              onClick={() =>
                setModal({
                  kind: "confirm",
                  title: "Restaurar demonstração?",
                  text: "Os cadastros e testes locais serão substituídos pelos exemplos iniciais.",
                  action: async () => {
                    setData(demoData());
                    setSelectedRule("");
                    setMedia([]);
                    setModal(null);
                    notify("Demonstração restaurada.");
                  },
                })
              }
            >
              Restaurar exemplos
            </button>
          </div>
        )}
        <main className="content">
          {loadError && (
            <div className="notice warning" role="alert">
              {loadError}
              <button className="text-button" onClick={refresh}>
                Atualizar
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tab === "overview"
                  ? "MENOS REPETIÇÃO, MAIS CONVERSAS"
                  : "SEU CONTEÚDO EM AÇÃO"}
              </span>
              <h1>
                {tab === "overview" ? (
                  <>
                    Olá, Michelle <span className="wave">✦</span>
                  </>
                ) : (
                  navigation.find((n) => n.id === tab)?.label
                )}
              </h1>
              <p>
                {
                  {
                    overview:
                      "Seus posts despertam interesse. Seus directs continuam a conversa.",
                    automations:
                      "Uma palavra no comentário. Os produtos certos no direct.",
                    products:
                      "Seus achadinhos, organizados e prontos para compartilhar.",
                    activity:
                      "Acompanhe cada resposta e o que precisa da sua atenção.",
                    settings:
                      "Conecte sua conta e deixe tudo pronto para começar.",
                  }[tab]
                }
              </p>
            </div>
            {!["settings", "activity"].includes(tab) && (
              <button
                className="button primary"
                onClick={() =>
                  setModal(
                    tab === "products"
                      ? { kind: "product" }
                      : { kind: "automation" },
                  )
                }
              >
                <Plus size={18} />
                {tab === "products" ? "Novo produto" : "Nova automação"}
              </button>
            )}
            {tab === "activity" && (
              <button
                className="button secondary"
                disabled={busy || demo}
                onClick={() =>
                  perform(async () => {
                    await api("queue", "POST");
                  }, "Processamento solicitado. O histórico será atualizado automaticamente.")
                }
              >
                <Send size={16} />
                Processar fila
              </button>
            )}
          </div>
          {tab === "overview" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <span className="tiny-dot" /> DO POST AO DIRECT
                  </span>
                  <h2>
                    Você cria.
                    <br />A conversa <em>continua.</em>
                  </h2>
                  <p>
                    Transforme “manda o link?” em uma resposta
                    <br className="desktop-br" /> que chega com os seus produtos
                    favoritos.
                  </p>
                  <button
                    className="button dark"
                    onClick={() => setModal({ kind: "automation" })}
                  >
                    Criar uma automação <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <span className="floating-star">✳</span>
                  <div className="hero-comment">
                    <span className="mini-avatar">a</span>
                    <div>
                      <strong>ana.exemplo</strong>
                      <span>Quero os links! 😍</span>
                    </div>
                    <span className="comment-heart">♡</span>
                  </div>
                  <div className="hero-connector">
                    <span />
                    <ArrowDownLeft size={26} />
                  </div>
                  <div className="hero-message">
                    <span className="bot-icon">
                      <MessageCircle size={25} />
                    </span>
                    <div>
                      <strong>@michellefmkt</strong>
                      <p>
                        Oi! Separei os achadinhos
                        <br />
                        do vídeo para você ✨
                      </p>
                      <div className="hero-link">
                        <Link2 size={15} /> Ver os produtos{" "}
                        <ArrowUpRight size={14} />
                      </div>
                    </div>
                    <span className="art-check">
                      <Check size={13} />
                    </span>
                  </div>
                  <span className="art-caption">
                    Uma boa conexão começa aqui.
                  </span>
                </div>
              </section>
              <section className="stats-grid" aria-label="Resumo do painel">
                <Stat
                  icon={Send}
                  label="Mensagens enviadas"
                  value={data.totals.sent}
                  foot={demo ? "Resultados simulados" : "Últimos 30 dias"}
                />
                <Stat
                  icon={Zap}
                  label="Automações ativas"
                  value={data.automations.filter((a) => a.active).length}
                  foot={`${data.automations.length} cadastradas no total`}
                />
                <Stat
                  icon={Package}
                  label="Produtos cadastrados"
                  value={data.products.length}
                  foot="Prontos para compartilhar"
                />
                <Stat
                  icon={Clock3}
                  label="Na fila"
                  value={data.totals.queued}
                  foot={
                    data.totals.failed + data.totals.uncertain
                      ? `${data.totals.failed + data.totals.uncertain} resultado(s) para revisar`
                      : "Tudo acompanhado por aqui"
                  }
                />
              </section>
              <div className="overview-grid">
                <div className="overview-primary">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Suas automações</h2>
                        <p>Conteúdo com a resposta certa.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("automations")}
                      >
                        Ver todas <ArrowRight size={15} />
                      </button>
                    </div>
                    {data.automations.length ? (
                      <div className="rule-list">
                        {data.automations.slice(0, 3).map((rule, i) => (
                          <RuleRow
                            key={rule.id}
                            rule={rule}
                            data={data}
                            index={i}
                            onEdit={() => {
                              setSelectedRule(rule.id);
                              setModal({
                                kind: "automation",
                                automation: rule,
                              });
                            }}
                            onToggle={() => toggle(rule)}
                            disabled={busy}
                          />
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon={Zap}
                        title="Sua primeira automação começa aqui"
                        text="Cadastre os produtos, conecte o Instagram e escolha um post."
                        action={() => setModal({ kind: "automation" })}
                        actionLabel="Criar automação"
                      />
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Conversas em movimento</h2>
                        <p>Respostas enviadas nos últimos 7 dias.</p>
                      </div>
                      <span className="subtle-badge">
                        {demo ? "Simulação" : "Envios"}
                      </span>
                    </div>
                    <ActivityChart data={data} />
                  </section>
                </div>
                <aside className="overview-secondary">
                  <section className="panel preview-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="small-eyebrow">ANTES DE ATIVAR</span>
                        <h2>Veja a conversa acontecer</h2>
                      </div>
                      <FlaskConical size={19} />
                    </div>
                    {selected ? (
                      <Simulator
                        rule={selected}
                        products={data.products}
                        options={data.automations}
                        onSelect={setSelectedRule}
                        demo={demo}
                        onResult={(delivery) => {
                          if (demo)
                            setData((prev) => {
                              if (!prev) return prev;
                              const next = [delivery, ...prev.deliveries];
                              return {
                                ...prev,
                                deliveries: next,
                                totals: totalCounts(next),
                              };
                            });
                        }}
                        notify={notify}
                      />
                    ) : (
                      <div className="empty compact">
                        <p>Crie uma automação para visualizar sua mensagem.</p>
                      </div>
                    )}
                  </section>
                  <button
                    className="connection-card"
                    onClick={() => navigate("settings")}
                  >
                    <span className="instagram-icon">
                      <Instagram size={22} />
                    </span>
                    <div>
                      <strong>
                        {configured
                          ? "Tudo conectado"
                          : "Conecte seu Instagram"}
                      </strong>
                      <p>
                        {configured
                          ? `@${data.account.username} está autorizado.`
                          : "Um último passo para enviar de verdade."}
                      </p>
                    </div>
                    <ArrowUpRight size={20} />
                  </button>
                </aside>
              </div>
              <section className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Últimas respostas</h2>
                    <p>
                      {demo
                        ? "Exemplos para explorar o histórico."
                        : "Resultados registrados pela integração."}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("activity")}
                  >
                    Ver histórico <ArrowRight size={15} />
                  </button>
                </div>
                <DeliveryTable
                  deliveries={data.deliveries.slice(0, 4)}
                  onOpen={(delivery) =>
                    setModal({ kind: "delivery", delivery })
                  }
                />
              </section>
            </>
          )}
          {tab === "automations" && (
            <>
              <Toolbar
                query={query}
                setQuery={setQuery}
                placeholder="Buscar automação ou palavra-chave…"
              >
                <Filter
                  value={filter}
                  onChange={setFilter}
                  options={[
                    ["all", "Todas"],
                    ["active", "Ativas"],
                    ["paused", "Pausadas"],
                  ]}
                />
              </Toolbar>
              <div className="automation-grid">
                {automations.map((rule, i) => (
                  <article className="panel automation-card" key={rule.id}>
                    <div className={`post-art art-${i % 3}`}>
                      <div className="post-art-label">
                        <Instagram size={15} />
                        {rule.postUrl.includes("/reel/") ? "REEL" : "POST"}
                      </div>
                      <div className="product-stage">
                        {rule.productIds.slice(0, 3).map((id) => (
                          <span key={id}>
                            {data.products.find((p) => p.id === id)?.emoji ??
                              "🛍️"}
                          </span>
                        ))}
                      </div>
                      <span
                        className={`status ${rule.active ? "sent" : "paused"}`}
                      >
                        <span className="tiny-dot" />
                        {rule.active ? "Ativa" : "Pausada"}
                      </span>
                    </div>
                    <div className="automation-card-body">
                      <h2>{rule.name}</h2>
                      <p className="post-label">{rule.postLabel}</p>
                      <div className="keyword-row">
                        <span>Quando comentarem</span>
                        <div>
                          {rule.keywords.map((keyword) => (
                            <span className="keyword" key={keyword}>
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rule-products">
                        <Package size={15} />
                        {rule.productIds.length} produto(s) vinculado(s)
                      </div>
                      <div className="card-actions">
                        <button
                          className="button secondary small"
                          onClick={() =>
                            setModal({ kind: "automation", automation: rule })
                          }
                        >
                          <Pencil size={15} />
                          Editar
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Excluir ${rule.name}`}
                          onClick={() =>
                            askDelete("automations", rule.id, rule.name)
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                        <Switch
                          active={rule.active}
                          disabled={busy}
                          label={`${rule.active ? "Pausar" : "Ativar"} ${rule.name}`}
                          onClick={() => toggle(rule)}
                        />
                      </div>
                    </div>
                  </article>
                ))}
                <button
                  className="new-card"
                  onClick={() => setModal({ kind: "automation" })}
                >
                  <span>
                    <Plus size={25} />
                  </span>
                  <strong>Uma nova conversa</strong>
                  <p>Vincule um post aos seus produtos.</p>
                </button>
              </div>
              {!automations.length && query && (
                <Empty
                  icon={Search}
                  title="Nenhuma automação encontrada"
                  text="Tente outra palavra ou mude o filtro."
                />
              )}
            </>
          )}
          {tab === "products" && (
            <>
              <Toolbar
                query={query}
                setQuery={setQuery}
                placeholder="Buscar produto ou categoria…"
              >
                <span className="muted">{products.length} produto(s)</span>
              </Toolbar>
              <div className="product-grid">
                {products.map((product, i) => (
                  <article className="panel product-card" key={product.id}>
                    <div className={`product-art art-${i % 3}`}>
                      <span>{product.emoji}</span>
                      <small>{product.category || "Produto"}</small>
                    </div>
                    <div className="product-card-body">
                      <h2>{product.name}</h2>
                      <strong className="product-price">
                        {product.price || "Preço não informado"}
                      </strong>
                      <a
                        className="product-url"
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Link2 size={14} />
                        {new URL(product.url).hostname}
                        <ExternalLink size={13} />
                      </a>
                      <div className="card-actions">
                        <button
                          className="button secondary small"
                          onClick={() => setModal({ kind: "product", product })}
                        >
                          <Pencil size={15} />
                          Editar produto
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Excluir ${product.name}`}
                          onClick={() =>
                            askDelete("products", product.id, product.name)
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                <button
                  className="new-card"
                  onClick={() => setModal({ kind: "product" })}
                >
                  <span>
                    <Plus size={25} />
                  </span>
                  <strong>Mais um achadinho</strong>
                  <p>Cadastre um produto e seu link.</p>
                </button>
              </div>
              {!products.length && query && (
                <Empty
                  icon={Search}
                  title="Nenhum produto encontrado"
                  text="Tente buscar pelo nome ou pela categoria."
                />
              )}
            </>
          )}
          {tab === "activity" && (
            <>
              <div className="notice">
                <ShieldCheck size={19} />
                <span>
                  “Enviada” significa que a Meta aceitou a mensagem. O painel
                  não mede leitura ou compra.
                  {data.totals.uncertain > 0 &&
                    " Confira manualmente os resultados sem confirmação antes de qualquer reenvio."}
                </span>
              </div>
              <Toolbar
                query={query}
                setQuery={setQuery}
                placeholder="Buscar perfil ou automação…"
              >
                <Filter
                  value={filter}
                  onChange={setFilter}
                  options={[
                    ["all", "Todas"],
                    ["sent", "Enviadas"],
                    ["queued", "Na fila"],
                    ["failed", "Falhas"],
                    ["uncertain", "Conferir direct"],
                  ]}
                />
              </Toolbar>
              <section className="panel">
                <DeliveryTable
                  deliveries={deliveries}
                  onOpen={(delivery) =>
                    setModal({ kind: "delivery", delivery })
                  }
                />
              </section>
              <p className="table-foot">
                Até 100 respostas recentes · Horário de Brasília · Retenção de
                30 dias em produção
              </p>
            </>
          )}
          {tab === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Sua conta do Instagram</h2>
                    <p>A autorização acontece na tela oficial.</p>
                  </div>
                  <Instagram size={23} />
                </div>
                <div className="account-summary">
                  <span className="avatar large">M</span>
                  <div>
                    <h3>@{data.account.username}</h3>
                    <span
                      className={`status ${configured ? "sent" : "queued"}`}
                    >
                      <span className="tiny-dot" />
                      {configured ? "Conectado" : "Aguardando conexão"}
                    </span>
                  </div>
                </div>
                <p className="body-copy">
                  Quem administra o aplicativo Meta pode ser diferente de quem
                  autoriza o Instagram. Sua irmã entra no perfil dela e concede
                  as permissões para comentários e mensagens.
                </p>
                {data.account.expiresAt && (
                  <div className="notice">
                    Autorização válida até {dateTime(data.account.expiresAt)}. A
                    rotina diária tenta renová-la antes do vencimento.
                  </div>
                )}
                <div className="settings-actions">
                  <button
                    className="button primary"
                    disabled={demo || !data.config.instagram}
                    onClick={() =>
                      window.location.assign("/api/instagram/connect")
                    }
                  >
                    <Instagram size={17} />
                    {data.account.connected
                      ? "Reconectar Instagram"
                      : "Conectar Instagram"}
                    <ArrowUpRight size={15} />
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => syncMedia()}
                    disabled={syncing || (!demo && !configured)}
                  >
                    {syncing ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Link2 size={17} />
                    )}
                    Sincronizar posts
                  </button>
                </div>
                {demo && (
                  <p className="field-help">
                    A conexão real fica disponível na versão publicada, depois
                    de configurar as credenciais da Meta.
                  </p>
                )}
                {media.length > 0 && (
                  <div className="synced-posts">
                    <h3>{media.length} post(s) disponível(is)</h3>
                    {media.slice(0, 5).map((post) => (
                      <div key={post.id}>
                        <Instagram size={15} />
                        <span>{post.caption.slice(0, 65) || post.id}</span>
                      </div>
                    ))}
                    {cursor && (
                      <button
                        className="text-button"
                        onClick={() => syncMedia(true)}
                        disabled={syncing}
                      >
                        Carregar mais posts
                      </button>
                    )}
                  </div>
                )}
                {data.account.connected && (
                  <button
                    className="danger-link"
                    onClick={() =>
                      setModal({
                        kind: "confirm",
                        title: "Desconectar Instagram?",
                        text: "A autorização, os posts importados e o histórico serão removidos. Suas automações serão pausadas. Mensagens já enviadas continuam no Instagram.",
                        action: async () => {
                          await api("disconnect", "POST");
                          await refresh();
                          setMedia([]);
                          setModal(null);
                          notify("Instagram desconectado.");
                        },
                      })
                    }
                  >
                    Desconectar Instagram
                  </button>
                )}
              </section>
              <section className="panel settings-panel" id="setup-help">
                <div className="panel-heading">
                  <div>
                    <h2>Checklist de conexão</h2>
                    <p>O que precisa estar pronto para enviar.</p>
                  </div>
                  <ShieldCheck size={22} />
                </div>
                <SetupItem
                  ready={data.config.database}
                  title="Banco PostgreSQL"
                  text="Cadastros e histórico persistentes."
                />
                <SetupItem
                  ready={data.config.instagram}
                  title="Aplicativo Meta configurado"
                  text="ID, segredo e chave de criptografia."
                />
                <SetupItem
                  ready={data.config.webhook}
                  title="Webhook configurado no servidor"
                  text="Cadastre o endereço abaixo no painel Meta e assine o campo comments."
                />
                <SetupItem
                  ready={configured}
                  title="Perfil autorizado"
                  text="@michellefmkt conectado e eventos assinados."
                />
                <div className="notice">
                  A validação das permissões e um teste com uma conta externa
                  ainda são necessários para confirmar o envio em produção.
                </div>
              </section>
              <section className="panel settings-panel endpoints">
                <div className="panel-heading">
                  <div>
                    <h2>Endereços para o aplicativo Meta</h2>
                    <p>
                      Use o domínio de produção, mantendo os caminhos abaixo.
                    </p>
                  </div>
                </div>
                {[
                  ["Redirecionamento OAuth", "/api/instagram/callback"],
                  ["Callback do webhook", "/api/instagram/webhook"],
                  ["Política de privacidade", "/privacy"],
                  ["Instruções de exclusão", "/data-deletion"],
                  ["Callback de exclusão", "/api/instagram/data-deletion"],
                  ["Callback de desautorização", "/api/instagram/deauthorize"],
                ].map(([label, path]) => (
                  <div className="endpoint" key={path}>
                    <label>{label}</label>
                    <div>
                      <code>
                        {data.config.appUrl}
                        {path}
                      </code>
                      <button
                        className="icon-button"
                        aria-label={`Copiar ${label}`}
                        onClick={() => copy(`${data.config.appUrl}${path}`)}
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>Feito para suas conversas renderem.</span>
            <div>
              <a href="/privacy" target="_blank">
                Privacidade
              </a>
              <span>·</span>
              <a href="/data-deletion" target="_blank">
                Exclusão de dados
              </a>
            </div>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <ModalFrame
          title={
            modal.kind === "product"
              ? modal.product
                ? "Editar produto"
                : "Novo produto"
              : modal.kind === "automation"
                ? modal.automation
                  ? "Editar automação"
                  : "Nova automação"
                : modal.kind === "delivery"
                  ? "Detalhes da resposta"
                  : modal.title
          }
          close={closeModal}
          wide={modal.kind === "automation"}
        >
          {modal.kind === "product" && (
            <ProductForm product={modal.product} onSave={saveProduct} />
          )}
          {modal.kind === "automation" && (
            <AutomationForm
              rule={modal.automation}
              data={data}
              media={media}
              syncing={syncing}
              onSync={() => syncMedia()}
              onSave={saveRule}
            />
          )}
          {modal.kind === "delivery" && (
            <div className="delivery-detail">
              <div className="detail-meta">
                <strong>@{modal.delivery.username || "visitante"}</strong>
                <span className={`status ${modal.delivery.status}`}>
                  {labels[modal.delivery.status]}
                </span>
              </div>
              <p>
                {modal.delivery.automationName} ·{" "}
                {dateTime(modal.delivery.createdAt)}
              </p>
              {demo && (
                <div className="notice">
                  Resposta simulada. Nenhuma mensagem foi enviada.
                </div>
              )}
              <pre>{modal.delivery.message}</pre>
              {modal.delivery.error && (
                <div className="notice warning">{modal.delivery.error}</div>
              )}
            </div>
          )}
          {modal.kind === "confirm" && <Confirm modal={modal} />}
        </ModalFrame>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  foot,
}: {
  icon: typeof Send;
  label: string;
  value: number;
  foot: string;
}) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        <span className="stat-icon">
          <Icon size={18} />
        </span>
      </div>
      <strong>{new Intl.NumberFormat("pt-BR").format(value)}</strong>
      <p>{foot}</p>
    </article>
  );
}
function Switch({
  active,
  label,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      className={`switch ${active ? "on" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span />
    </button>
  );
}
function RuleRow({
  rule,
  data,
  index,
  onEdit,
  onToggle,
  disabled,
}: {
  rule: Automation;
  data: DashboardData;
  index: number;
  onEdit: () => void;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rule-row">
      <button
        className={`rule-thumbnail art-${index % 3}`}
        onClick={onEdit}
        aria-label={`Editar ${rule.name}`}
      >
        {data.products.find((p) => p.id === rule.productIds[0])?.emoji ?? "🛍️"}
      </button>
      <button className="rule-row-copy" onClick={onEdit}>
        <strong>{rule.name}</strong>
        <span>
          {rule.productIds.length} produto(s) <span className="middot">·</span>{" "}
          {rule.keywords.map((keyword) => (
            <span className="keyword" key={keyword}>
              {keyword}
            </span>
          ))}
        </span>
      </button>
      <span className="rule-state">{rule.active ? "Ativa" : "Pausada"}</span>
      <Switch
        active={rule.active}
        label={`${rule.active ? "Pausar" : "Ativar"} ${rule.name}`}
        onClick={onToggle}
        disabled={disabled}
      />
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
  action,
  actionLabel,
}: {
  icon: typeof Zap;
  title: string;
  text: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty">
      <span className="icon-tile">
        <Icon size={24} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button secondary small" onClick={action}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
function Toolbar({
  query,
  setQuery,
  placeholder,
  children,
}: {
  query: string;
  setQuery: (v: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="toolbar">
      <label className="search-box">
        <Search size={17} />
        <input
          aria-label={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
        />
        {query && (
          <button
            className="icon-button"
            aria-label="Limpar busca"
            onClick={() => setQuery("")}
          >
            <X size={14} />
          </button>
        )}
      </label>
      {children}
    </div>
  );
}
function Filter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <div className="filter-group" role="group" aria-label="Filtrar resultados">
      {options.map(([id, label]) => (
        <button
          key={id}
          aria-pressed={value === id}
          className={value === id ? "selected" : ""}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function DeliveryTable({
  deliveries,
  onOpen,
}: {
  deliveries: Delivery[];
  onOpen: (delivery: Delivery) => void;
}) {
  return deliveries.length ? (
    <div className="table-scroll">
      <table className="delivery-table">
        <thead>
          <tr>
            <th>Perfil</th>
            <th>Automação</th>
            <th>Status</th>
            <th>Data</th>
            <th>
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery.id}>
              <td>
                <span className="table-avatar">
                  {(delivery.username || "v")[0].toUpperCase()}
                </span>
                <span>@{delivery.username || "visitante"}</span>
              </td>
              <td>{delivery.automationName}</td>
              <td>
                <span className={`status ${delivery.status}`}>
                  <span className="tiny-dot" />
                  {labels[delivery.status]}
                </span>
              </td>
              <td className="date-cell">{dateTime(delivery.createdAt)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Ver resposta para ${delivery.username}`}
                  onClick={() => onOpen(delivery)}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      icon={MessageCircle}
      title="Nenhuma resposta por aqui ainda"
      text="As respostas das suas automações aparecerão aqui."
    />
  );
}
function ActivityChart({ data }: { data: DashboardData }) {
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - 6 + i);
        const day = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
        }).format(date);
        return {
          day,
          label: new Intl.DateTimeFormat("pt-BR", {
            weekday: "short",
            timeZone: "America/Sao_Paulo",
          })
            .format(date)
            .replace(".", ""),
          sent: data.config.demo
            ? data.deliveries.filter(
                (d) =>
                  d.status === "sent" &&
                  new Intl.DateTimeFormat("en-CA", {
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(d.createdAt)) === day,
              ).length
            : (data.daily.find((d) => d.day === day)?.sent ?? 0),
        };
      }),
    [data],
  );
  const max = Math.max(1, ...days.map((d) => d.sent));
  const points = days.map(
    (d, i) => `${16 + i * 72},${100 - (d.sent / max) * 70}`,
  );
  return (
    <div className="activity-chart">
      <div className="chart-summary">
        <strong>
          {days.reduce((sum, d) => sum + d.sent, 0)}
          <span> respostas{data.config.demo ? " simuladas" : ""}</span>
        </strong>
        <span>Últimos 7 dias</span>
      </div>
      <svg
        viewBox="0 0 464 120"
        role="img"
        aria-label={days
          .map((d) => `${d.label}: ${d.sent} mensagens`)
          .join("; ")}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ea713c" stopOpacity=".18" />
            <stop offset="100%" stopColor="#ea713c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 65, 100].map((y) => (
          <line
            key={y}
            x1="16"
            x2="448"
            y1={y}
            y2={y}
            stroke="#eeeae5"
            strokeDasharray="4 5"
          />
        ))}
        <polygon
          points={`16,110 ${points.join(" ")} 448,110`}
          fill="url(#chart-fill)"
        />
        <polyline
          points={points.join(" ")}
          stroke="#d85d31"
          strokeWidth="2.5"
          fill="none"
          strokeLinejoin="round"
        />
        {days.map((d, i) => (
          <circle
            key={d.day}
            cx={16 + i * 72}
            cy={100 - (d.sent / max) * 70}
            r="3.5"
            fill="#fff"
            stroke="#d85d31"
            strokeWidth="2"
          >
            <title>{d.label + " : " + d.sent}</title>
          </circle>
        ))}
      </svg>
      <div className="chart-labels">
        {days.map((d) => (
          <span key={d.day}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}
function Simulator({
  rule,
  products,
  options,
  onSelect,
  demo,
  onResult,
  notify,
}: {
  rule: Automation;
  products: Product[];
  options: Automation[];
  onSelect: (id: string) => void;
  demo: boolean;
  onResult: (d: Delivery) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [comment, setComment] = useState("QUERO");
  const [username, setUsername] = useState("ana.exemplo");
  const [tested, setTested] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setComment(rule.keywords[0] ?? "QUERO");
    setTested(null);
  }, [rule.id, rule.keywords]);
  const selected = rule.productIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => !!p);
  const message = renderMessage(rule.message, username, selected);
  async function test() {
    setBusy(true);
    try {
      const result = demo
        ? { matches: matches(comment, rule.keywords, rule.matchMode), message }
        : await api<{ matches: boolean; message: string }>("simulate", "POST", {
            id: rule.id,
            comment,
            username,
          });
      setTested(result.matches);
      if (demo && result.matches)
        onResult({
          id: crypto.randomUUID(),
          automationId: rule.id,
          automationName: rule.name,
          username,
          status: "sent",
          message: result.message,
          error: null,
          createdAt: new Date().toISOString(),
        });
      notify(
        result.matches
          ? "Palavra reconhecida. Teste concluído sem envio real."
          : "Esse comentário não corresponde às palavras configuradas.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Falha no teste.", true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="simulator">
      <label className="sr-only" htmlFor="sim-rule">
        Automação para testar
      </label>
      <select
        id="sim-rule"
        value={rule.id}
        onChange={(e) => {
          onSelect(e.target.value);
          setTested(null);
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <div className="phone-preview">
        <div className="phone-header">
          <ChevronRight size={14} className="rotate" />
          <span className="mini-avatar">M</span>
          <div>
            <strong>michellefmkt</strong>
            <span>Prévia do direct</span>
          </div>
          <Instagram size={17} />
        </div>
        <span className="phone-today">HOJE</span>
        <div className="comment-bubble">
          <span>Comentou no seu post</span>
          <strong>{comment || "Seu comentário"}</strong>
        </div>
        <div className="dm-bubble">{message}</div>
        <span className="phone-note">Prévia · nenhum envio real</span>
      </div>
      <div className="test-fields">
        <label>
          Comentário de teste
          <input
            value={comment}
            maxLength={1000}
            onChange={(e) => {
              setComment(e.target.value);
              setTested(null);
            }}
            placeholder="Ex.: quero o link"
          />
        </label>
        <label>
          Nome do perfil
          <input
            value={username}
            maxLength={30}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ana.exemplo"
          />
        </label>
      </div>
      {tested !== null && (
        <div className={`test-result ${tested ? "success" : ""}`}>
          {tested ? <CheckCircle2 size={15} /> : <CircleHelp size={15} />}
          {tested ? "Palavra reconhecida" : "Palavra não reconhecida"}
        </div>
      )}
      <button className="button secondary full" onClick={test} disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <FlaskConical size={16} />
        )}
        Testar sem enviar
      </button>
      <p className="field-help">
        O teste verifica a palavra e a mensagem, mesmo se a automação estiver
        pausada.
      </p>
    </div>
  );
}
function SetupItem({
  ready,
  title,
  text,
}: {
  ready: boolean;
  title: string;
  text: string;
}) {
  return (
    <div className={`setup-item ${ready ? "ready" : ""}`}>
      <span>{ready ? <Check size={15} /> : <Clock3 size={15} />}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
function ModalFrame({
  title,
  close,
  children,
  wide,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const container = ref.current;
    container
      ?.querySelector<HTMLElement>("input,select,textarea,button")
      ?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "Tab" && container) {
        const items = Array.from(
          container.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
          ),
        );
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-heading">
          <div>
            <span className="small-eyebrow">SEU ESPAÇO DE CRIAÇÃO</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Fechar janela"
            onClick={close}
          >
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function ProductForm({
  product,
  onSave,
}: {
  product?: Product;
  onSave: (p: Omit<Product, "id"> & { id?: string }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [emoji, setEmoji] = useState(product?.emoji ?? "🛍️");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const url = new URL(String(form.get("url")));
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("Use um link http ou https sem credenciais.");
      await onSave({
        id: product?.id,
        name: String(form.get("name")),
        url: url.toString(),
        price: String(form.get("price")),
        category: String(form.get("category")),
        emoji,
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      <div className="emoji-picker" role="group" aria-label="Ícone do produto">
        {["🛍️", "👜", "🧴", "🎧", "👟", "⌚", "💄", "☕"].map((item) => (
          <button
            type="button"
            aria-label={`Ícone ${item}`}
            aria-pressed={item === emoji}
            className={item === emoji ? "selected" : ""}
            key={item}
            onClick={() => setEmoji(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <label>
        Nome do produto
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={product?.name}
          placeholder="Ex.: Bolsa tiracolo"
        />
      </label>
      <label>
        Link do produto
        <input
          name="url"
          type="url"
          required
          maxLength={2000}
          defaultValue={product?.url}
          placeholder="https://…"
        />
        <span className="field-help">
          Pode ser o link da loja ou seu link de afiliado.
        </span>
      </label>
      <div className="form-row">
        <label>
          Preço <span className="optional">opcional</span>
          <input
            name="price"
            maxLength={40}
            defaultValue={product?.price}
            placeholder="R$ 129,90"
          />
        </label>
        <label>
          Categoria <span className="optional">opcional</span>
          <input
            name="category"
            maxLength={60}
            defaultValue={product?.category}
            placeholder="Moda"
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <span>Seus links, em um só lugar.</span>
        <button className="button primary" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Check size={17} />
          )}
          Salvar produto
        </button>
      </div>
    </form>
  );
}
function AutomationForm({
  rule,
  data,
  media,
  syncing,
  onSync,
  onSave,
}: {
  rule?: Automation;
  data: DashboardData;
  media: Media[];
  syncing: boolean;
  onSync: () => void;
  onSave: (
    rule: Omit<Automation, "id" | "createdAt"> & { id?: string },
  ) => Promise<void>;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [mediaId, setMediaId] = useState(rule?.mediaId ?? "");
  const [keyword, setKeyword] = useState(
    rule?.keywords.join(", ") ?? "QUERO, LINK",
  );
  const [mode, setMode] = useState<Automation["matchMode"]>(
    rule?.matchMode ?? "word",
  );
  const [message, setMessage] = useState(
    rule?.message ??
      "Oi, {{nome}}! Aqui estão os produtos que mostrei no post ✨\n\n{{produtos}}",
  );
  const [ids, setIds] = useState(rule?.productIds ?? []);
  const [active, setActive] = useState(rule?.active ?? false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const knownMedia = [...media];
  if (rule && !knownMedia.some((m) => m.id === rule.mediaId))
    knownMedia.unshift({
      id: rule.mediaId,
      caption: rule.postLabel,
      permalink: rule.postUrl,
      mediaType: "VIDEO",
    });
  if (data.config.demo)
    for (const sample of data.automations)
      if (!knownMedia.some((m) => m.id === sample.mediaId))
        knownMedia.push({
          id: sample.mediaId,
          caption: sample.postLabel,
          permalink: sample.postUrl,
          mediaType: "VIDEO",
        });
  const selected = ids
    .map((id) => data.products.find((p) => p.id === id))
    .filter((p): p is Product => !!p);
  const preview = renderMessage(message, "ana.exemplo", selected);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const post = knownMedia.find((m) => m.id === mediaId);
      const keywords = keyword
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (!post)
        throw new Error("Sincronize e selecione um post do Instagram.");
      if (
        !keywords.length ||
        keywords.length > 15 ||
        keywords.some((k) => k.length > 60)
      )
        throw new Error(
          "Informe de 1 a 15 palavras-chave, com até 60 caracteres cada.",
        );
      if (!message.trim()) throw new Error("Escreva a mensagem.");
      if (renderMessage(message, "x".repeat(30), selected).length > 1000)
        throw new Error(
          "A mensagem com os links deve ter até 1.000 caracteres.",
        );
      await onSave({
        id: rule?.id,
        name,
        mediaId,
        postUrl: post.permalink,
        postLabel: post.caption.slice(0, 180) || "Post do Instagram",
        keywords,
        matchMode: mode,
        message,
        productIds: ids,
        active,
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="automation-editor">
      <div className="editor-fields">
        <label>
          Nome da automação
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            placeholder="Ex.: Achadinhos da semana"
          />
        </label>
        <div className="form-section-label">
          <span className="step-number">1</span>
          <h3>Escolha o post</h3>
          <button
            type="button"
            className="text-button"
            onClick={onSync}
            disabled={syncing || (!data.config.demo && !data.account.connected)}
          >
            {syncing ? "Sincronizando…" : "Sincronizar"}
            <Link2 size={14} />
          </button>
        </div>
        <label>
          Post ou Reel
          <select
            value={mediaId}
            onChange={(e) => setMediaId(e.target.value)}
            required
          >
            <option value="">Selecione uma publicação</option>
            {knownMedia.map((m) => (
              <option value={m.id} key={m.id}>
                {m.caption.slice(0, 80) || m.id}
              </option>
            ))}
          </select>
        </label>
        {!data.account.connected && !data.config.demo && (
          <p className="field-help">
            Conecte o Instagram em Configurações para importar os posts.
          </p>
        )}
        <div className="form-section-label">
          <span className="step-number">2</span>
          <h3>Defina o comentário</h3>
        </div>
        <label>
          Palavras-chave
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            required
            placeholder="QUERO, LINK"
          />
          <span className="field-help">
            Separe por vírgulas. Maiúsculas e acentos não fazem diferença.
          </span>
        </label>
        <label>
          Quando a palavra aparecer
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Automation["matchMode"])}
          >
            <option value="word">Em qualquer parte do comentário</option>
            <option value="exact">
              Somente se o comentário for a palavra ou frase
            </option>
          </select>
        </label>
        <div className="form-section-label">
          <span className="step-number">3</span>
          <h3>Monte a resposta</h3>
        </div>
        <label>
          Mensagem no direct
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={5}
            maxLength={850}
          />
          <span className="field-help">
            <code>{"{{nome}}"}</code> usa o @ da pessoa.{" "}
            <code>{"{{produtos}}"}</code> insere os links.
          </span>
        </label>
        <fieldset className="product-select">
          <legend>Produtos desse post</legend>
          {data.products.length ? (
            data.products.map((product) => (
              <label key={product.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(product.id)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, product.id]
                        : ids.filter((id) => id !== product.id),
                    )
                  }
                  disabled={!ids.includes(product.id) && ids.length >= 10}
                />
                <span className="product-select-emoji">{product.emoji}</span>
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.price || product.category}</small>
                </span>
              </label>
            ))
          ) : (
            <p className="field-help">
              Cadastre seus produtos antes de vincular os links.
            </p>
          )}
        </fieldset>
        <div className="active-field">
          <div>
            <strong>Ativar automação</strong>
            <p>Responder aos novos comentários desse post.</p>
          </div>
          <Switch
            active={active}
            label="Ativar automação"
            onClick={() => setActive(!active)}
          />
        </div>
      </div>
      <aside className="editor-preview">
        <span className="small-eyebrow">UMA PRÉVIA DA CONVERSA</span>
        <h3>Assim chega no direct</h3>
        <div className="preview-account">
          <span className="mini-avatar">M</span>
          <strong>@{data.account.username}</strong>
        </div>
        <div className="dm-bubble">{preview}</div>
        <span
          className={`message-count ${preview.length > 1000 ? "over" : ""}`}
        >
          {preview.length} / 1.000 caracteres
        </span>
        <div className="editor-explainer">
          <MessageCircle size={20} />
          <p>
            Uma mensagem com os links. O Instagram determina as permissões e a
            janela para responder ao comentário.
          </p>
        </div>
        {data.config.demo && (
          <div className="notice">Este cadastro é local e simulado.</div>
        )}
      </aside>
      {error && (
        <p className="form-error editor-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer editor-footer">
        <span>Uma automação ativa por post.</span>
        <button className="button primary" disabled={busy}>
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Check size={17} />
          )}
          Salvar automação
        </button>
      </div>
    </form>
  );
}
function Confirm({ modal }: { modal: Extract<Modal, { kind: "confirm" }> }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="confirm-body">
      <p>{modal.text}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <span>Revise antes de continuar.</span>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await modal.action();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Não foi possível concluir.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Check size={17} />
          )}
          Confirmar
        </button>
      </div>
    </div>
  );
}
