import { db, type Db } from "./db";
import { decrypt } from "./security";
import { MetaError, privateReply } from "./instagram";
import { withinReplyWindow } from "./domain";
type Job = {
  id: string;
  account_id: string;
  comment_id: string;
  automation_id: string;
  message: string;
  attempts: number;
  occurred_at: Date;
};
export type Send = (
  account: string,
  comment: string,
  message: string,
  token: string,
) => Promise<string>;
export async function processQueue(
  database: Db = db(),
  send: Send = privateReply,
  decode = decrypt,
  budgetMs = 40_000,
) {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  // A worker killed after sending must not blindly resend a message that may have reached Instagram.
  await database.query(`UPDATE deliveries SET status='uncertain',error='Processamento interrompido. Confira o direct antes de qualquer ação.',updated_at=now()
    WHERE status='sending' AND updated_at<now()-interval '5 minutes'`);
  for (let index = 0; index < 20 && Date.now() < deadline - 8500; index++) {
    const result =
      await database.query<Job>(`UPDATE deliveries SET status='sending',updated_at=now()
      WHERE id=(SELECT id FROM deliveries WHERE status='queued' AND next_attempt_at<=now()
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`);
    const job = result.rows[0];
    if (!job) break;
    const active = await database.query(
      "SELECT id FROM automations WHERE id=$1 AND active=true",
      [job.automation_id],
    );
    if (!active.rows.length || !withinReplyWindow(new Date(job.occurred_at))) {
      await database.query(
        "UPDATE deliveries SET status='skipped',error=$2,updated_at=now() WHERE id=$1",
        [
          job.id,
          active.rows.length
            ? "Janela de resposta encerrada."
            : "Automação pausada ou removida.",
        ],
      );
      continue;
    }
    const account = await database.query<{
      encrypted_token: string;
      expires_at: Date;
      subscribed: boolean;
    }>(
      "SELECT encrypted_token,expires_at,subscribed FROM instagram_accounts WHERE id=$1",
      [job.account_id],
    );
    const connected = account.rows[0];
    if (
      !connected ||
      !connected.subscribed ||
      new Date(connected.expires_at).getTime() <= Date.now()
    ) {
      await database.query(
        "UPDATE deliveries SET status='failed',error='Reconecte o Instagram.',updated_at=now() WHERE id=$1",
        [job.id],
      );
      continue;
    }
    // An intentionally conservative application quota, not a claim about Meta's current limit.
    const quota = await database.query<{ used: number }>(
      `INSERT INTO rate_buckets(account_id,bucket,used) VALUES($1,date_trunc('hour',now()),1)
      ON CONFLICT(account_id,bucket) DO UPDATE SET used=rate_buckets.used+1 RETURNING used`,
      [job.account_id],
    );
    if (quota.rows[0].used > 200) {
      await database.query(
        "UPDATE deliveries SET status='queued',next_attempt_at=date_trunc('hour',now())+interval '1 hour',updated_at=now() WHERE id=$1",
        [job.id],
      );
      continue;
    }
    await database.query(
      "UPDATE deliveries SET attempts=attempts+1 WHERE id=$1",
      [job.id],
    );
    let messageId: string;
    try {
      messageId = await send(
        job.account_id,
        job.comment_id,
        job.message,
        decode(connected.encrypted_token),
      );
    } catch (error) {
      const meta = error instanceof MetaError ? error : null;
      const retry =
        meta &&
        !meta.ambiguous &&
        (meta.status === 429 || [4, 17, 32, 613].includes(meta.code)) &&
        job.attempts < 4;
      const status = retry
        ? "queued"
        : meta?.ambiguous
          ? "uncertain"
          : "failed";
      const detail = meta?.ambiguous
        ? "A Meta não confirmou o resultado. Confira o direct; não reenviamos automaticamente."
        : meta
          ? meta.message
          : "Falha na configuração da autorização. Reconecte o Instagram.";
      await database.query(
        "UPDATE deliveries SET status=$2,error=$3,next_attempt_at=now()+interval '5 minutes',updated_at=now() WHERE id=$1",
        [job.id, status, detail],
      );
      processed++;
      continue;
    }
    // If this commit fails, keep 'sending'; recovery later marks it uncertain rather than resending.
    await database.query(
      "UPDATE deliveries SET status='sent',meta_message_id=$2,error=NULL,updated_at=now() WHERE id=$1",
      [job.id, messageId],
    );
    processed++;
  }
  return { processed };
}
