import { OFFICIAL_DIRECTORY, latestPublication, importOfficialZip } from "./sigtap-import";
import { validateCatalog } from "./sigtap";

// Only called after the schedule's managed authentication has succeeded.
export async function updateOfficialSigtap() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const response = await fetch(OFFICIAL_DIRECTORY, { signal: AbortSignal.timeout(12000), redirect: "manual" });
    if (!response.ok) throw new Error("A listagem do DATASUS está indisponível.");
    const now = new Date();
    const maximum = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const publication = latestPublication(await response.text(), maximum);
    const existing = await supabaseAdmin.from("sigtap_catalogs").select("source_url,competence").order("competence", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.competence && existing.data.competence > publication.competence) throw new Error("A fonte retornou uma competência anterior; base preservada.");
    if (existing.data?.source_url === publication.url) {
      await supabaseAdmin.from("sigtap_update_runs").insert({ status: "sem_novidade", competence: publication.competence, message: "A publicação oficial mais recente já está carregada." });
      return { status: "sem_novidade" };
    }
    const archive = await fetch(publication.url, { signal: AbortSignal.timeout(30000), redirect: "manual" });
    if (!archive.ok) throw new Error("Não foi possível baixar o arquivo oficial.");
    const bytes = new Uint8Array(await archive.arrayBuffer());
    if (bytes.byteLength > 50 * 1024 * 1024) throw new Error("Arquivo oficial excede o limite de leitura.");
    const catalog = importOfficialZip(bytes, publication.competence);
    const { procedureCount, compatibilityCount } = validateCatalog(catalog);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
    const save = await supabaseAdmin.from("sigtap_catalogs").upsert({ competence: publication.competence, source_url: publication.url, sha256, catalog, imported_at: new Date().toISOString(), procedure_count: procedureCount, compatibility_count: compatibilityCount });
    if (save.error) throw save.error;
    await supabaseAdmin.from("sigtap_update_runs").insert({ status: "sucesso", competence: publication.competence, message: `Base oficial validada: ${procedureCount} procedimentos e ${compatibilityCount} vínculos.` });
    return { status: "sucesso", competence: publication.competence };
  } catch {
    const message = "Atualização oficial não concluída. A última base disponível foi preservada; nova tentativa automática na próxima verificação.";
    const log = await supabaseAdmin.from("sigtap_update_runs").insert({ status: "falha", message });
    if (log.error) throw log.error;
    return { status: "falha", message };
  }
}