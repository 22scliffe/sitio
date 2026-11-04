// Sitio: sends recap notifications.
// - Called every day by the scheduled job (with the x-cron-secret header): on release days it tells
//   people with memories from that period that their recap is ready.
// - Called from the app with { test: true } (with the person's login): sends them a test notification.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails("mailto:sitio.contact@gmail.com", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// deno-lint-ignore no-explicit-any
type Sub = { endpoint: string; user_id: string; sub: any };
async function send(rows: Sub[], payload: object) {
  let sent = 0;
  for (const r of rows) {
    try { await webpush.sendNotification(r.sub, JSON.stringify(payload), { TTL: 86400 }); sent++; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db.from("sitio_push").delete().eq("endpoint", r.endpoint); }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));

  // A test from the app: only to the person asking
  if (body.test) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    const { data } = await db.auth.getUser(token);
    if (!data?.user) return json({ error: "not logged in" }, 401);
    const { data: rows } = await db.from("sitio_push").select("endpoint,user_id,sub").eq("user_id", data.user.id);
    // Admin only: preview a recap notification, sent after a short pause so the phone can be locked first
    if (body.preview) {
      const asUser = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + token } } });
      const { data: admin, error: aerr } = await asUser.rpc("sitio_is_admin");
      if (admin !== true) return json({ error: "admins only" + (aerr ? ": " + aerr.message : "") }, 403);
      const py = Number(body.preview.y), pk = Number(body.preview.k);
      const msg = pk === -1 ? `✨ Your ${py} in Sitio is ready` : `📸 Your ${MONTHS[pk * 2]} / ${MONTHS[pk * 2 + 1]} recap is ready`;
      await new Promise((r) => setTimeout(r, Math.min(60, Number(body.delay) || 0) * 1000));
      const sent = await send((rows || []) as Sub[], { title: "Sitio", body: msg + ". Open Sitio to watch it.", url: `./#recap=${py}-${pk === -1 ? "y" : pk}` });
      return json({ sent, phones: (rows || []).length });
    }
    const sent = await send((rows || []) as Sub[], { title: "Sitio", body: "🔔 You’re all set. We’ll let you know when your next recap is ready.", url: "./" });
    return json({ sent });
  }

  // The daily job
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "no" }, 401);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Release days: last day of Feb, Apr, Jun, Aug, Oct; 30 Dec for Nov/Dec and the whole year
  const isYear = m === 12 && d === 30;
  const k = isYear ? 5 : (m % 2 === 0 && m < 12 && d === last) ? m / 2 - 1 : -1;
  if (k < 0) return json({ skipped: today });

  const { data: subs } = await db.from("sitio_push").select("endpoint,user_id,sub");
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs || []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);
  if (!byUser.size) return json({ sent: 0 });
  const { data: rows } = await db.from("sitio_data").select("user_id,data").in("user_id", [...byUser.keys()]);

  const pStart = Date.UTC(y, k * 2, 1) - 2 * 3600e3, pEnd = Date.UTC(y, k * 2 + 2, 1);
  const yStart = Date.UTC(y, 0, 1) - 2 * 3600e3, yEnd = Date.UTC(y + 1, 0, 1);
  let sent = 0;
  for (const r of rows || []) {
    if (r.data?.settings?.nRecaps === false) continue; // switched off in Settings → Notifications
    const ats: number[] = ((r.data?.places || []) as { memories?: { at?: number }[] }[]).flatMap((p) => (p.memories || []).map((x) => x.at || 0));
    const inYear = ats.filter((t) => t >= yStart && t < yEnd).length, inPer = ats.filter((t) => t >= pStart && t < pEnd).length;
    let msg = "";
    if (isYear && inYear) msg = `✨ Your ${y} in Sitio is ready`;
    else if (inPer) msg = `📸 Your ${MONTHS[k * 2]} / ${MONTHS[k * 2 + 1]} recap is ready`;
    if (!msg) continue;
    sent += await send(byUser.get(r.user_id) || [], { title: "Sitio", body: msg + ". Open Sitio to watch it.", url: `./#recap=${y}-${isYear && msg.startsWith("✨") ? "y" : k}` });
  }
  return json({ sent, day: today });
});
