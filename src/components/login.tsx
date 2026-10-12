"use client";
import { useState } from "react";
import {
  ArrowRight,
  MessageCircle,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";
export default function Login({ configured, person }: { configured: boolean; person?: { name: string; username: string } }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign("/");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <section className="login-story">
        <a className="brand" href="/">
          <span className="brand-icon">
            <MessageCircle size={22} />
          </span>
          Respondi<span>Chat</span>
        </a>
        <div>
          <span className="eyebrow">SEU INSTAGRAM, MAIS PRÓXIMO</span>
          <h1>
            Um comentário.
            <br />
            Uma boa
            <br />
            <em>conversa.</em>
          </h1>
          <p>
            Os links certos para quem se interessou.
            <br />
            Seu conteúdo continua a conversa no direct.
          </p>
        </div>
        <span className="login-foot">Feito para @michellefmkt</span>
      </section>
      <section className="login-form">
        <span className="icon-tile">
          <LockKeyhole size={24} />
        </span>
        <h2>{person ? `Olá, ${person.name}.` : "Bom ter você por aqui."}</h2>
        <p>{person ? "Entre para conectar o Instagram e cuidar das automações." : "Entre para cuidar das suas automações."}</p>
        {!configured && (
          <div className="notice warning">
            {person ? "Seu acesso ainda não foi ativado. Peça ao responsável pelo painel para concluir a configuração." : "A configuração inicial está pendente. Peça ao responsável pelo painel para concluir a configuração."}
          </div>
        )}
        <form onSubmit={submit}>
          <label>
            Usuário
            <input
              name="username"
              autoComplete="username"
              required
              defaultValue={person?.username || ""}
              readOnly={!!person}
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy || !configured}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <>
                Entrar no painel <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        <a className="demo-entry" href="/demo">
          Explorar o painel com dados de exemplo <ArrowRight size={14} />
        </a>
        <div className="login-legal">
          <a href="/privacy">Privacidade</a>
          <span>·</span>
          <a href="/data-deletion">Exclusão de dados</a>
        </div>
      </section>
    </main>
  );
}
