import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function DeletionStatus({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  let completed = false;
  if (code && /^[a-f0-9-]{36}$/i.test(code)) {
    try {
      const result = await db().query(
        "SELECT id FROM deletion_receipts WHERE id=$1",
        [code],
      );
      completed = !!result.rows.length;
    } catch {
      /* Show no personal data or diagnostics. */
    }
  }
  return (
    <main className="legal">
      <a href="/">← RespondiChat</a>
      <h1>
        {completed
          ? "Dados de conexão excluídos"
          : "Solicitação não localizada"}
      </h1>
      <p>
        {completed
          ? "A solicitação foi processada. Nenhum dado pessoal é exibido nesta página."
          : "Confira o código. Comprovantes ficam disponíveis por 30 dias."}
      </p>
    </main>
  );
}
