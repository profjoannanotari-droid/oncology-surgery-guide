import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { catalogSchema } from "./sigtap";

export const getSigtapCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  const url = process.env['SUPABASE_URL'];
  if (!key || !url) return { current: null, lastCheck: null, unavailable: true };
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
  const [base, runs] = await Promise.all([
    client.from("sigtap_catalogs").select("competence,source_url,imported_at,sha256,catalog,procedure_count,compatibility_count").order("competence", { ascending: false }).limit(1).maybeSingle(),
    client.from("sigtap_update_runs").select("checked_at,status,competence,message").order("checked_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    current: base.data ? { ...base.data, catalog: catalogSchema.parse(base.data.catalog) } : null,
    lastCheck: runs.data, unavailable: Boolean(base.error || runs.error),
  };
});