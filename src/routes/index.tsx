import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import { getSigtapCatalog } from "@/lib/sigtap.functions";
import { formatCompetence, classifyCompat } from "@/lib/sigtap";
import type { Procedure, Subgroup, CompatEntry, CompatItem } from "@/lib/sigtap";
import subgrupos from "@/data/subgrupos.json";
import cidNames from "@/data/cidNames.json";
import cboNames from "@/data/cboNames.json";
import compatibilidades from "@/data/compatibilidades.json";

export const Route = createFileRoute("/")({
  loader: () => getSigtapCatalog(),
  head: () => ({ meta: [
    { title: "NotariSIGTAP — Consulta de procedimentos e compatibilidades" },
    { name: "description", content: "Consulte procedimentos, CIDs, CBOs, materiais e compatibilidades SIGTAP com a competência da avaliação." },
    { property: "og:title", content: "NotariSIGTAP — Consulta SIGTAP" },
    { property: "og:description", content: "Procedimentos e compatibilidades por competência, com auditoria da base consultada." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CatalogPage,
});

type ResultGroup = { subgroup: Subgroup; procedures: Procedure[] };

const CID_NAMES = cidNames as Record<string, string>;

const FALLBACK = { data: subgrupos as Subgroup[], COMPAT: compatibilidades as Record<string, CompatEntry>, competence: "202605", importedAt: null as string | null, sourceUrl: null as string | null, lastCheck: null as { checked_at: string; status: string; message: string } | null, unavailable: false, CBO_NAMES: cboNames as Record<string, string> };
const CatalogContext = createContext(FALLBACK);
const useCatalog = () => useContext(CatalogContext);
function CatalogPage() {
  const state = Route.useLoaderData();
  const current = state.current;
  const value = current ? { data: current.catalog.subgroups, COMPAT: current.catalog.compatibilities, competence: current.competence, importedAt: current.imported_at, sourceUrl: current.source_url, CBO_NAMES: current.catalog.cboNames, lastCheck: state.lastCheck, unavailable: state.unavailable } : { ...FALLBACK, lastCheck: state.lastCheck, unavailable: state.unavailable };
  return <CatalogContext.Provider value={value}><Index key={current?.sha256 ?? "local"} /></CatalogContext.Provider>;
}

function normalizeCid(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function procedureCids(procedure: Procedure): string[] {
  if (procedure.cidList?.length) return procedure.cidList.map(normalizeCid);
  return procedure.cid
    .split(/[^A-Z0-9]+/i)
    .map(normalizeCid)
    .filter((code) => /^[A-Z]\d{2}[A-Z0-9]?$/.test(code));
}

function cidMatches(procedureCid: string, queryCid: string): boolean {
  return (
    procedureCid === queryCid ||
    procedureCid.startsWith(queryCid) ||
    queryCid.startsWith(procedureCid)
  );
}

function cidLabel(code: string): string {
  if (CID_NAMES[code]) return CID_NAMES[code];
  if (code.length === 4 && CID_NAMES[code.slice(0, 3)])
    return CID_NAMES[code.slice(0, 3)];
  return "—";
}

function findProcedure(code: string, data: Subgroup[]): { proc: Procedure; subgroup: Subgroup } | null {
  for (const sg of data) {
    const p = sg.procedures.find((x) => x.code === code);
    if (p) return { proc: p, subgroup: sg };
  }
  return null;
}

const COMPAT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  compativel: {
    label: "Compatível",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    icon: "✓",
  },
  concomitante: {
    label: "Concomitante",
    color: "text-sky-700 bg-sky-50 border-sky-200",
    icon: "≡",
  },
  excludente: {
    label: "Excludente",
    color: "text-rose-700 bg-rose-50 border-rose-200",
    icon: "⛔",
  },
  outros: {
    label: "Outros",
    color: "text-muted-foreground bg-muted border-border",
    icon: "•",
  },
};

function procedureCbos(p: Procedure): string[] {
  return (p.cbo ?? "")
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ProcedureResults({
  groups,
  onOpen,
  defaultOpen = false,
}: {
  groups: ResultGroup[];
  onOpen: (code: string) => void;
  defaultOpen?: boolean;
}) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setOpenIds((prev) => ({ ...prev, [id]: !(prev[id] ?? defaultOpen) }));

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhum procedimento encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(({ subgroup, procedures }) => {
        const isOpen = openIds[subgroup.id] ?? defaultOpen;
        return (
          <section
            key={subgroup.id}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <button
              onClick={() => toggle(subgroup.id)}
              className="flex w-full items-center gap-3 bg-muted/35 px-4 py-3 text-left hover:bg-muted/60"
            >
              <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                {subgroup.id}
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-semibold leading-snug">{subgroup.name}</h3>
                <div className="text-[11px] text-muted-foreground">
                  {procedures.length} procedimento{procedures.length > 1 ? "s" : ""}
                </div>
              </div>
              <span className="text-lg text-muted-foreground">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-border border-t border-border">
                {procedures.map((p) => (
                  <li key={`${subgroup.id}:${p.code}`}>
                    <button
                      onClick={() => onOpen(p.code)}
                      className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-accent/50"
                    >
                      <span className="mt-0.5 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        {p.code}
                      </span>
                      <span className="flex-1 text-sm font-medium leading-snug">{p.name}</span>
                      <span className="text-muted-foreground">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ProcedureDetail({
  code,
  onBack,
  onOpenProcedure,
}: {
  code: string;
  onBack: () => void;
  onOpenProcedure: (code: string) => void;
}) {
  const { data, COMPAT, CBO_NAMES, competence, importedAt } = useCatalog();
  const SUBGROUP_NAMES = Object.fromEntries(data.map(s => [s.id, s.name]));
  const [openSubgroup, setOpenSubgroup] = useState<string | null>(null);
  const [compatQuery, setCompatQuery] = useState("");

  const found = findProcedure(code, data);
  if (!found) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Procedimento não encontrado.
      </div>
    );
  }
  const { proc: p, subgroup } = found;
  const compat = COMPAT[p.code];
  const items = compat?.items ?? [];

  // Group items by subgroup id (first 4 digits of code)
  const filteredItems = useMemo(() => {
    const q = compatQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q),
    );
  }, [items, compatQuery]);

  const bySubgroup = useMemo(() => {
    const m: Record<string, CompatItem[]> = {};
    for (const it of filteredItems) {
      const sgId = it.code.slice(0, 4);
      (m[sgId] ||= []).push(it);
    }
    return m;
  }, [filteredItems]);

  // Counts by compat category
  const counts = useMemo(() => {
    const c = { compativel: 0, concomitante: 0, excludente: 0, outros: 0 };
    for (const it of items) c[classifyCompat(it.compatType)]++;
    return c;
  }, [items]);

  const cbos = (p.cbo ?? "")
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const fmtMoney = (v?: number) =>
    typeof v === "number" ? `R$ ${v.toFixed(2)}` : "—";
  const fmtNum = (v?: number | null) => (typeof v === "number" ? String(v) : "—");
  const fmtStr = (v?: string, fb = "—") => (v && v.trim() ? v : fb);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-accent"
          aria-label="Voltar"
        >
          ←
        </button>
        <div className="flex items-center gap-2 text-base font-semibold">
          <span>📄</span>
          <span>Detalhes do Procedimento</span>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        {/* Title */}
        <div>
          <div className="font-mono text-xs text-muted-foreground">
            {p.code} · SubGrupo {subgroup.id}
            <div className="mt-2 font-sans text-xs text-primary">Competência da avaliação: {formatCompetence(competence)} · {importedAt ? "Base oficial SIGTAP" : "Base local de referência"}</div>
          </div>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{p.name}</h2>
          <p className="text-xs text-muted-foreground">{subgroup.name}</p>
        </div>

        {/* Description (moved up) */}
        {p.description && (
          <section className="rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="mb-1 text-sm font-semibold">Descrição</h3>
            <p className="text-sm leading-relaxed text-foreground/90">{p.description}</p>
          </section>
        )}

        {/* Age / Sex */}
        <div className="grid grid-cols-3 gap-4 border-y border-border py-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Idade Mínima
            </div>
            <div className="mt-0.5 text-sm font-medium">
              {fmtStr(p.idadeMinima, "0 Mes(es)")}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Idade Máxima
            </div>
            <div className="mt-0.5 text-sm font-medium">
              {fmtStr(p.idadeMaxima, "130 Ano(s)")}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Sexo
            </div>
            <div className="mt-0.5 text-sm font-medium">{fmtStr(p.sexo, "Ambos")}</div>
          </div>
        </div>

        {/* Compatibilidade */}
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="text-primary">🔗</span>
            Compatibilidade ({items.length} procedimentos)
          </h3>

          {/* Search */}
          {items.length > 0 && (
            <div className="mb-3">
              <input
                type="text"
                value={compatQuery}
                onChange={(e) => setCompatQuery(e.target.value)}
                placeholder="🔎 Pesquisar por código ou nome do procedimento..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
              {compatQuery && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {filteredItems.length} resultado{filteredItems.length === 1 ? "" : "s"} encontrado{filteredItems.length === 1 ? "" : "s"}
                  {filteredItems.length === 0 && " — tente outro termo"}
                </div>
              )}
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {(["compativel", "concomitante", "excludente"] as const).map((k) => {
              if (counts[k] === 0) return null;
              const info = COMPAT_LABELS[k];
              return (
                <span
                  key={k}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${info.color}`}
                >
                  <span>{info.icon}</span>
                  <span className="font-medium">{info.label}</span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold">
                    {counts[k]}
                  </span>
                </span>
              );
            })}
          </div>

          {/* Subgroup cards */}
          {Object.keys(bySubgroup).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum procedimento compatível cadastrado.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(bySubgroup)
                .map(([sgId, sgItems]) => {
                  const catOrder = { compativel: 0, concomitante: 1, excludente: 2, outros: 3 } as const;
                  const sorted = [...sgItems].sort(
                    (a, b) => catOrder[classifyCompat(a.compatType)] - catOrder[classifyCompat(b.compatType)],
                  );
                  const minPriority = Math.min(...sorted.map((it) => catOrder[classifyCompat(it.compatType)]));
                  return [sgId, sorted, minPriority] as [string, CompatItem[], number];
                })
                .sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0]))
                .map(([sgId, sgItems]) => {
                  const isOpen = compatQuery.trim() ? true : openSubgroup === sgId;
                  return (
                    <div
                      key={sgId}
                      className={`col-span-1 overflow-hidden rounded-lg border bg-background transition-colors ${
                        isOpen ? "border-primary sm:col-span-2" : "border-border"
                      }`}
                    >
                      <button
                        onClick={() => setOpenSubgroup(isOpen ? null : sgId)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
                      >
                        <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                          {sgId}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm font-medium leading-snug">
                            {SUBGROUP_NAMES[sgId] ?? "Subgrupo"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {sgItems.length} procedimento{sgItems.length > 1 ? "s" : ""} compatíve{sgItems.length > 1 ? "is" : "l"}
                          </div>
                        </div>
                        <span className="text-muted-foreground">{isOpen ? "−" : "+"}</span>
                      </button>
                      {isOpen && (
                        <ul className="divide-y divide-border border-t border-border bg-background">
                          {sgItems.map((it) => {
                            const cat = classifyCompat(it.compatType);
                            const info = COMPAT_LABELS[cat];
                            const exists = !!findProcedure(it.code, data);
                            return (
                              <li key={`${sgId}-${it.code}`}>
                                <button
                                  onClick={() => exists && onOpenProcedure(it.code)}
                                  disabled={!exists}
                                  className={`flex w-full items-start gap-3 px-4 py-2.5 text-left text-xs ${
                                    exists ? "hover:bg-accent/40" : "cursor-default opacity-80"
                                  }`}
                                >
                                  <span className="mt-0.5 font-mono font-semibold text-primary">
                                    {it.code}
                                  </span>
                                  <span className="flex-1">{it.name}</span>
                                  {it.qty > 0 && (
                                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                      Qtd: {it.qty}
                                    </span>
                                  )}
                                  <span
                                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${info.color}`}
                                  >
                                    {info.icon} {cat}
                                  </span>
                                  {exists && <span className="text-muted-foreground">→</span>}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        {/* CBOs */}
        {cbos.length > 0 && (
          <section className="border-t border-border pt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <span className="text-primary">👥</span>
              CBOs Compatíveis ({cbos.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {cbos.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs"
                >
                  {CBO_NAMES[c] ? `${c} - ${CBO_NAMES[c]}` : c}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* CIDs */}
        {(() => {
          const cids = procedureCids(p);
          if (cids.length === 0) return null;
          return (
            <section className="border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-semibold">
                CIDs compatíveis ({cids.length})
              </h3>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {cids.map((c) => (
                  <li
                    key={c}
                    className="flex gap-2 rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <span className="font-mono font-semibold text-primary">{c}</span>
                    <span className="text-muted-foreground">{cidLabel(c)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        {/* SIGTAP Attributes */}
        <section className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-semibold">Atributos SIGTAP</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
            {(
              [
                ["Valor Hospitalar SP", fmtMoney(p.valorHospSP)],
                ["Valor Hospitalar SH", fmtMoney(p.valorHospSH)],
                ["Valor Hospitalar Total", fmtMoney(p.valorHospTotal ?? p.valorHosp)],
                ["Atributo Complementar", fmtStr(p.atributoComplementar)],
                ["Complexidade", fmtStr(p.complexity)],
                ["Quantidade Máxima", fmtNum(p.quantidadeMaxima)],
                ["Média Permanência", fmtNum(p.mediaPermanencia)],
                ["Pontos", fmtNum(p.pontos)],
                ["Especialidade do Leito", fmtStr(p.especialidadeLeito)],
                ["Categoria CBO", fmtStr(p.categoriaCbo)],
              ] as Array<[string, string]>
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

      </div>
    </div>
  );
}

function MultipleSurgeryScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (code: string) => void;
}) {
  const { data, COMPAT } = useCatalog();
  const sg = data.find((s) => s.id === "0415");
  const procs = (sg?.procedures ?? []).filter((p) => COMPAT[p.code]?.items?.length);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-accent"
        >
          ←
        </button>
        <div>
          <h2 className="text-base font-semibold">Cirurgia Múltipla ou Sequencial</h2>
          <p className="text-xs text-muted-foreground">
            Selecione o procedimento principal (SIGTAP 0415) para ver as combinações compatíveis.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {procs.map((p) => {
          const items = COMPAT[p.code]?.items ?? [];
          const counts = items.reduce(
            (acc, it) => {
              acc[classifyCompat(it.compatType)]++;
              return acc;
            },
            { compativel: 0, concomitante: 0, excludente: 0, outros: 0 },
          );
          return (
            <button
              key={p.code}
              onClick={() => onOpen(p.code)}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                  {p.code}
                </span>
                <span className="text-muted-foreground group-hover:text-primary">→</span>
              </div>
              <h3 className="text-sm font-semibold leading-snug">{p.name}</h3>
              <div className="mt-auto flex flex-wrap gap-1.5 text-[11px]">
                {counts.compativel > 0 && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    ✓ {counts.compativel} compatíveis
                  </span>
                )}
                {counts.concomitante > 0 && (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700">
                    ≡ {counts.concomitante} concomitantes
                  </span>
                )}
                {counts.excludente > 0 && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
                    ⛔ {counts.excludente} excludentes
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AuditModal({ onClose }: { onClose: () => void }) {
  const { data, COMPAT, competence, importedAt, sourceUrl, lastCheck } = useCatalog();
  const stats = useMemo(() => {
    const totalSubgroups = data.length;
    const totalProcedures = data.reduce((t, s) => t + s.procedures.length, 0);
    const principals = Object.keys(COMPAT);
    const totalPrincipals = principals.length;
    let totalItems = 0;
    const byType: Record<string, number> = {};
    const bySubgroup: Record<string, { principals: number; items: number }> = {};
    for (const sg of data) bySubgroup[sg.id] = { principals: 0, items: 0 };
    for (const [code, entry] of Object.entries(COMPAT)) {
      const sgId = code.slice(0, 4);
      if (bySubgroup[sgId]) bySubgroup[sgId].principals += 1;
      for (const it of entry.items) {
        totalItems += 1;
        byType[it.compatType] = (byType[it.compatType] ?? 0) + 1;
        if (bySubgroup[sgId]) bySubgroup[sgId].items += 1;
      }
    }
    const proceduresWithCompat = principals.length;
    const coverage = totalProcedures
      ? ((proceduresWithCompat / totalProcedures) * 100).toFixed(1)
      : "0.0";
    return {
      totalSubgroups,
      totalProcedures,
      totalPrincipals,
      totalItems,
      byType,
      bySubgroup,
      coverage,
    };
  }, []);

  const competencia = formatCompetence(competence);

  const downloadCsv = () => {
    const lines = [
      `Relatório de Auditoria - NotariSIGTAP`,
      `Competência;${competencia}`,
      `Fonte;${sourceUrl ?? "Base local de referência"}`,
      `Importação;${importedAt ?? "Sem registro de importação automática"}`,
      `Última verificação;${lastCheck?.checked_at ?? "Ainda não realizada"}`,
      ``,
      `Indicador;Valor`,
      `Total de subgrupos;${stats.totalSubgroups}`,
      `Total de procedimentos;${stats.totalProcedures}`,
      `Procedimentos principais com compatibilidade;${stats.totalPrincipals}`,
      `Total de itens de compatibilidade;${stats.totalItems}`,
      `Procedimentos com vínculos (%);${stats.coverage}`,
      ``,
      `Tipo de compatibilidade;Qtd itens`,
      ...Object.entries(stats.byType).map(([t, n]) => `${t};${n}`),
      ``,
      `Subgrupo;Nome;Principais;Itens`,
      ...data.map(
        (sg) =>
          `${sg.id};${sg.name.replace(/;/g, ",")};${stats.bySubgroup[sg.id]?.principals ?? 0};${stats.bySubgroup[sg.id]?.items ?? 0}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-notarisigtap-${competencia.replace("/", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">
              🔎 Auditoria de Compatibilidades
            </h2>
            <p className="text-xs text-muted-foreground">
              Competência {competencia} · {importedAt ? "Base oficial importada" : "Base local de referência"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadCsv}
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              ⬇ Baixar CSV mensal
            </button>
            <button
              onClick={onClose}
              className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-4 text-sm">
          <section className="border-b border-border pb-4">
            <h3 className="mb-2 font-semibold">Atualização da base</h3>
            <p>Competência utilizada: {competencia}</p>
            <p className="text-xs text-muted-foreground">Importação: {importedAt ? new Date(importedAt).toLocaleString("pt-BR", { timeZone: "UTC" }) : "Base local, sem importação automática validada"}</p>
            <p className="mt-2 text-xs">{lastCheck?.message ?? "Aguardando primeira verificação automática do DATASUS."}</p>
            {lastCheck && <p className="text-xs text-muted-foreground">Última tentativa: {new Date(lastCheck.checked_at).toLocaleString("pt-BR", { timeZone: "UTC" })}</p>}
            {sourceUrl && <a className="mt-2 inline-block text-xs text-primary underline" href={sourceUrl} target="_blank" rel="noreferrer">Arquivo oficial da competência</a>}
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Resumo</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Subgrupos" value={stats.totalSubgroups} />
              <Stat label="Procedimentos" value={stats.totalProcedures} />
              <Stat label="Principais c/ compat." value={stats.totalPrincipals} />
              <Stat label="Itens de compat." value={stats.totalItems} />
              <Stat label="Procedimentos com vínculos" value={`${stats.coverage}%`} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Por tipo de compatibilidade</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-2">Tipo</th>
                  <th className="py-1">Itens</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.byType).map(([t, n]) => (
                  <tr key={t} className="border-b border-border/50">
                    <td className="py-1 pr-2">{t}</td>
                    <td className="py-1 font-mono">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Por subgrupo</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-2">ID</th>
                  <th className="py-1 pr-2">Nome</th>
                  <th className="py-1 pr-2">Principais</th>
                  <th className="py-1">Itens</th>
                </tr>
              </thead>
              <tbody>
                {data.map((sg) => (
                  <tr key={sg.id} className="border-b border-border/50">
                    <td className="py-1 pr-2 font-mono">{sg.id}</td>
                    <td className="py-1 pr-2">{sg.name}</td>
                    <td className="py-1 pr-2 font-mono">
                      {stats.bySubgroup[sg.id]?.principals ?? 0}
                    </td>
                    <td className="py-1 font-mono">
                      {stats.bySubgroup[sg.id]?.items ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}


type SearchType = "cid" | "code" | "cbo" | "material";

type CidSuggestion = { code: string; name: string };
type ProcSuggestion = { code: string; name: string; subgroupId: string };
type CboSuggestion = { code: string; name: string };
type MaterialSuggestion = { code: string; name: string };

// Materials catalog: prefer subgroup 0702 procedures; fallback to any 0702 codes referenced in compatibilities
function getMaterials(data: Subgroup[], COMPAT: Record<string, CompatEntry>): MaterialSuggestion[] {
  const map = new Map<string, string>();
  const sg0702 = data.find((s) => s.id === "0702");
  if (sg0702) for (const p of sg0702.procedures) map.set(p.code, p.name);
  for (const entry of Object.values(COMPAT)) {
    for (const it of entry.items) {
      if (it.code.startsWith("0702") && !map.has(it.code)) map.set(it.code, it.name);
    }
  }
  return Array.from(map, ([code, name]) => ({ code, name })).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
}

function Index() {
  const { data, COMPAT, CBO_NAMES, competence, importedAt, lastCheck, unavailable } = useCatalog();
  const MATERIALS_0702 = useMemo(() => getMaterials(data, COMPAT), [data, COMPAT]);
  const [searchType, setSearchType] = useState<SearchType>("cid");

  // CID flow
  const [cidInput, setCidInput] = useState("");
  const [selectedCid, setSelectedCid] = useState<string | null>(null);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string>(""); // "" = todos
  const [cidFocus, setCidFocus] = useState(false);

  // Code/name flow
  const [codeInput, setCodeInput] = useState("");
  const [selectedProcCode, setSelectedProcCode] = useState<string | null>(null);
  const [codeFocus, setCodeFocus] = useState(false);

  // CBO flow
  const [cboInput, setCboInput] = useState("");
  const [selectedCbo, setSelectedCbo] = useState<string | null>(null);
  const [cboFocus, setCboFocus] = useState(false);

  // Material (OPM 0702) flow
  const [materialInput, setMaterialInput] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);
  const [materialFocus, setMaterialFocus] = useState(false);

  // Submission gate
  const [submitted, setSubmitted] = useState(false);

  // Navigation
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [multiMode, setMultiMode] = useState(false);
  const [showMulti, setShowMulti] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    if (detailCode || showMulti) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [detailCode, showMulti]);

  const resetSubmit = () => setSubmitted(false);

  // ===== Suggestions =====
  const cidSuggestions = useMemo<CidSuggestion[]>(() => {
    const q = cidInput.trim().toLowerCase();
    if (q.length < 1) return [];
    const norm = normalizeCid(cidInput);
    const cidCodes = new Set<string>();
    for (const sg of data)
      for (const p of sg.procedures)
        for (const c of procedureCids(p)) cidCodes.add(c);
    const results: CidSuggestion[] = [];
    for (const code of cidCodes) {
      const name = cidLabel(code);
      if (
        code.toLowerCase().includes(q) ||
        code.startsWith(norm) ||
        name.toLowerCase().includes(q)
      ) {
        results.push({ code, name });
      }
    }
    return results.sort((a, b) => a.code.localeCompare(b.code)).slice(0, 50);
  }, [cidInput]);

  const procSuggestions = useMemo<ProcSuggestion[]>(() => {
    const q = codeInput.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: ProcSuggestion[] = [];
    for (const sg of data) {
      for (const p of sg.procedures) {
        if (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) {
          out.push({ code: p.code, name: p.name, subgroupId: sg.id });
          if (out.length >= 80) return out;
        }
      }
    }
    return out;
  }, [codeInput]);

  const cboSuggestions = useMemo<CboSuggestion[]>(() => {
    const q = cboInput.trim().toLowerCase();
    if (q.length < 1) return [];
    const codes = new Set<string>();
    for (const sg of data)
      for (const p of sg.procedures)
        for (const c of procedureCbos(p)) codes.add(c);
    const out: CboSuggestion[] = [];
    for (const c of codes) {
      const name = CBO_NAMES[c] ?? "";
      if (c.toLowerCase().includes(q) || name.toLowerCase().includes(q))
        out.push({ code: c, name: name || "—" });
    }
    return out.sort((a, b) => a.code.localeCompare(b.code)).slice(0, 50);
  }, [cboInput]);

  const materialSuggestions = useMemo<MaterialSuggestion[]>(() => {
    const q = materialInput.trim().toLowerCase();
    if (q.length < 1) return [];
    return MATERIALS_0702.filter(
      (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    ).slice(0, 80);
  }, [materialInput]);

  // Compatible subgroups for selected CID
  const compatibleSubgroupsForCid = useMemo(() => {
    if (!selectedCid) return [] as Array<{ subgroup: Subgroup; count: number }>;
    return data
      .map((sg) => ({
        subgroup: sg,
        count: sg.procedures.filter((p) =>
          procedureCids(p).some((c) => cidMatches(c, selectedCid)),
        ).length,
      }))
      .filter((s) => s.count > 0)
      .sort(
        (a, b) => b.count - a.count || a.subgroup.id.localeCompare(b.subgroup.id),
      );
  }, [selectedCid]);

  // Result groups (only when submitted)
  const resultGroups = useMemo<ResultGroup[]>(() => {
    if (!submitted) return [];

    if (searchType === "cid" && selectedCid) {
      const pool = selectedSubgroupId
        ? data.filter((s) => s.id === selectedSubgroupId)
        : data;
      return pool
        .map((sg) => ({
          subgroup: sg,
          procedures: sg.procedures.filter((p) =>
            procedureCids(p).some((c) => cidMatches(c, selectedCid)),
          ),
        }))
        .filter((g) => g.procedures.length > 0);
    }

    if (searchType === "cbo" && selectedCbo) {
      return data
        .map((sg) => ({
          subgroup: sg,
          procedures: sg.procedures.filter((p) =>
            procedureCbos(p).includes(selectedCbo),
          ),
        }))
        .filter((g) => g.procedures.length > 0);
    }

    if (searchType === "material" && selectedMaterial) {
      // Find all principal procedures whose compatibility items include this material code
      const principalCodes = new Set<string>();
      for (const [principalCode, entry] of Object.entries(COMPAT)) {
        if (entry.items.some((it) => it.code === selectedMaterial)) {
          principalCodes.add(principalCode);
        }
      }
      return data
        .map((sg) => ({
          subgroup: sg,
          procedures: sg.procedures.filter((p) => principalCodes.has(p.code)),
        }))
        .filter((g) => g.procedures.length > 0);
    }

    return [];
  }, [submitted, searchType, selectedCid, selectedSubgroupId, selectedCbo, selectedMaterial]);

  const totalFiltered = resultGroups.reduce(
    (t, g) => t + g.procedures.length,
    0,
  );

  const canSubmit =
    searchType === "cid"
      ? !!selectedCid
      : searchType === "code"
        ? !!selectedProcCode
        : searchType === "cbo"
          ? !!selectedCbo
          : !!selectedMaterial;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (searchType === "code" && selectedProcCode) {
      setDetailCode(selectedProcCode);
      return;
    }
    setSubmitted(true);
  };

  const resetAll = () => {
    setCidInput("");
    setSelectedCid(null);
    setSelectedSubgroupId("");
    setCodeInput("");
    setSelectedProcCode(null);
    setCboInput("");
    setSelectedCbo(null);
    setMaterialInput("");
    setSelectedMaterial(null);
    setSubmitted(false);
    setDetailCode(null);
  };

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.005_180)] text-foreground">
      <header className="bg-gradient-to-r from-primary to-[oklch(0.5_0.1_200)] text-primary-foreground shadow-sm">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 backdrop-blur ring-1 ring-white/20">
              <svg viewBox="0 0 40 40" fill="none" className="h-7 w-7">
                <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="2" opacity="0.9" />
                <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
                <path d="M20 10v20M10 20h20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <rect x="15" y="15" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">NotariSIGTAP</h1>
              <p className="text-xs text-white/80">
                Procedimentos Cirúrgicos e Especiais · SIGTAP
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2 text-xs text-muted-foreground">
          <span>📚 Base SIGTAP · competência {formatCompetence(competence)}</span>
          <span>· {importedAt ? "Base oficial importada" : "Base local de referência"}</span>
          <span title={lastCheck?.message ?? "Aguardando primeira verificação"}>· {unavailable ? "Verificação indisponível" : lastCheck?.status === "falha" ? "Atualização oficial pendente" : lastCheck ? `Verificada em ${new Date(lastCheck.checked_at).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "Aguardando atualização oficial"}</span>
          <span>· {data.length} subgrupos</span>
          <Button asChild variant="outline" size="sm"><button
            onClick={() => setShowAudit(true)}
            className="rounded border border-border px-2 py-0.5 text-xs hover:bg-accent"
            title="Relatório mensal de auditoria das tabelas de compatibilidade"
          >
            🔎 Auditoria
          </button></Button>
          {(detailCode || submitted || showMulti) && (
            <button
              onClick={resetAll}
              className="ml-auto rounded border border-border px-2 py-0.5 text-xs hover:bg-accent"
            >
              ← Início
            </button>
          )}
        </div>
      </div>

      {showAudit && <AuditModal onClose={() => setShowAudit(false)} />}

      <main className="mx-auto max-w-6xl px-6 py-8">
        {detailCode ? (
          <ProcedureDetail
            code={detailCode}
            onBack={() =>
              multiMode
                ? (setDetailCode(null), setShowMulti(true))
                : setDetailCode(null)
            }
            onOpenProcedure={(c) => setDetailCode(c)}
          />
        ) : showMulti ? (
          <MultipleSurgeryScreen
            onBack={() => setShowMulti(false)}
            onOpen={(c) => {
              setDetailCode(c);
              setShowMulti(false);
            }}
          />
        ) : (
          <>
            <div className="mx-auto mb-8 max-w-3xl rounded-xl border border-border bg-card p-8 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <svg viewBox="0 0 40 40" fill="none" className="h-7 w-7">
                    <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="2" opacity="0.9" />
                    <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
                    <path d="M20 10v20M10 20h20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    <rect x="15" y="15" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Consulta de Procedimentos
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha um item na lista de sugestões e clique em <b>Buscar procedimentos</b>.
                </p>
              </div>

              {/* Tabs */}
              <div className="mt-6 grid grid-cols-2 gap-1 rounded-md bg-muted p-1 sm:grid-cols-4">
                {(["cid", "code", "cbo", "material"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setSearchType(t);
                      resetSubmit();
                    }}
                    className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                      searchType === t
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "cid"
                      ? "🔎 Por CID-10"
                      : t === "code"
                        ? "# Por Código/Nome"
                        : t === "cbo"
                          ? "👥 Por CBO"
                          : "🧪 Por Material (OPM 0702)"}
                  </button>
                ))}
              </div>

              {/* CID flow */}
              {searchType === "cid" && (
                <>
                  <div className="relative mt-5">
                    <label className="mb-1 block text-sm font-medium">
                      CID-10 do paciente
                    </label>
                    <input
                      type="search"
                      value={cidInput}
                      onChange={(e) => {
                        setCidInput(e.target.value);
                        setSelectedCid(null);
                        setSelectedSubgroupId("");
                        resetSubmit();
                      }}
                      onFocus={() => setCidFocus(true)}
                      onBlur={() => setTimeout(() => setCidFocus(false), 150)}
                      placeholder="Digite o CID-10 (ex: C50, mama, pulmão...)"
                      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                    />
                    {cidFocus && cidSuggestions.length > 0 && (
                      <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                        {cidSuggestions.map((s) => (
                          <li key={s.code}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedCid(s.code);
                                setCidInput(`${s.code} — ${s.name}`);
                                setSelectedSubgroupId("");
                                setCidFocus(false);
                                resetSubmit();
                              }}
                              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60"
                            >
                              <span className="font-mono text-xs font-semibold text-primary">
                                {s.code}
                              </span>
                              <span className="flex-1 text-muted-foreground">{s.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium">
                      Subgrupo compatível
                    </label>
                    <select
                      value={selectedSubgroupId}
                      onChange={(e) => {
                        setSelectedSubgroupId(e.target.value);
                        resetSubmit();
                      }}
                      disabled={!selectedCid}
                      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {!selectedCid ? (
                        <option value="">Selecione um CID-10 primeiro</option>
                      ) : compatibleSubgroupsForCid.length === 0 ? (
                        <option value="">Nenhum subgrupo compatível</option>
                      ) : (
                        <>
                          <option value="">
                            Todos os subgrupos compatíveis ({compatibleSubgroupsForCid.length})
                          </option>
                          {compatibleSubgroupsForCid.map(({ subgroup, count }) => (
                            <option key={subgroup.id} value={subgroup.id}>
                              {subgroup.id} — {subgroup.name} ({count} proc.)
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                </>
              )}

              {/* Code/name flow */}
              {searchType === "code" && (
                <div className="relative mt-5">
                  <label className="mb-1 block text-sm font-medium">
                    Código ou nome do procedimento
                  </label>
                  <input
                    type="search"
                    value={codeInput}
                    onChange={(e) => {
                      setCodeInput(e.target.value);
                      setSelectedProcCode(null);
                      resetSubmit();
                    }}
                    onFocus={() => setCodeFocus(true)}
                    onBlur={() => setTimeout(() => setCodeFocus(false), 150)}
                    placeholder="Digite o código ou nome (ex: 0411010026, mastectomia...)"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                  />
                  {codeFocus && procSuggestions.length > 0 && (
                    <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                      {procSuggestions.map((s) => (
                        <li key={s.code}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedProcCode(s.code);
                              setCodeInput(`${s.code} — ${s.name}`);
                              setCodeFocus(false);
                            }}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60"
                          >
                            <span className="font-mono text-xs font-semibold text-primary">
                              {s.code}
                            </span>
                            <span className="flex-1">{s.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              SG {s.subgroupId}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* CBO flow */}
              {searchType === "cbo" && (
                <div className="relative mt-5">
                  <label className="mb-1 block text-sm font-medium">
                    CBO (código ou nome)
                  </label>
                  <input
                    type="search"
                    value={cboInput}
                    onChange={(e) => {
                      setCboInput(e.target.value);
                      setSelectedCbo(null);
                      resetSubmit();
                    }}
                    onFocus={() => setCboFocus(true)}
                    onBlur={() => setTimeout(() => setCboFocus(false), 150)}
                    placeholder="Digite o CBO (ex: 225225 ou 'cirurgião geral')"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                  />
                  {cboFocus && cboSuggestions.length > 0 && (
                    <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                      {cboSuggestions.map((s) => (
                        <li key={s.code}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedCbo(s.code);
                              setCboInput(`${s.code} — ${s.name}`);
                              setCboFocus(false);
                            }}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60"
                          >
                            <span className="font-mono text-xs font-semibold text-primary">
                              {s.code}
                            </span>
                            <span className="flex-1 text-muted-foreground">{s.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Material (OPM 0702) flow */}
              {searchType === "material" && (
                <div className="relative mt-5">
                  <label className="mb-1 block text-sm font-medium">
                    Material / OPM do subgrupo 0702 (código ou nome)
                  </label>
                  <input
                    type="search"
                    value={materialInput}
                    onChange={(e) => {
                      setMaterialInput(e.target.value);
                      setSelectedMaterial(null);
                      resetSubmit();
                    }}
                    onFocus={() => setMaterialFocus(true)}
                    onBlur={() => setTimeout(() => setMaterialFocus(false), 150)}
                    placeholder="Digite o material (ex: 0702080012 ou 'prótese mamária')"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mostra os procedimentos principais compatíveis com o material, agrupados por subgrupo.
                  </p>
                  {materialFocus && materialSuggestions.length > 0 && (
                    <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                      {materialSuggestions.map((s) => (
                        <li key={s.code}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedMaterial(s.code);
                              setMaterialInput(`${s.code} — ${s.name}`);
                              setMaterialFocus(false);
                              resetSubmit();
                            }}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60"
                          >
                            <span className="font-mono text-xs font-semibold text-primary">
                              {s.code}
                            </span>
                            <span className="flex-1">{s.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {materialFocus &&
                    materialInput.trim().length > 0 &&
                    materialSuggestions.length === 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Nenhum material encontrado para "{materialInput}".
                      </p>
                    )}
                </div>
              )}


              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="mt-6 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                🔎 Buscar procedimentos
              </button>

              <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={multiMode}
                    onChange={(e) => setMultiMode(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      Desejo realizar procedimento de cirurgia múltipla ou sequencial
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Exibe as combinações compatíveis do subgrupo 0415 em tela dedicada.
                    </div>
                  </div>
                </label>
                {multiMode && (
                  <button
                    onClick={() => setShowMulti(true)}
                    className="mt-3 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    Ver combinações compatíveis →
                  </button>
                )}
              </div>
            </div>

            {submitted && (
              <section>
                <p className="mb-3 text-xs text-muted-foreground">
                  Competência da avaliação: {formatCompetence(competence)} · {totalFiltered} procedimento{totalFiltered === 1 ? "" : "s"} encontrado
                  {totalFiltered === 1 ? "" : "s"}
                  {searchType === "cid" && selectedCid && (
                    <>
                      {" "}para CID <span className="font-mono">{selectedCid}</span> ·{" "}
                      {cidLabel(selectedCid)}
                    </>
                  )}
                  {searchType === "material" && selectedMaterial && (
                    <>
                      {" "}compatíveis com o material{" "}
                      <span className="font-mono">{selectedMaterial}</span>
                    </>
                  )}
                </p>
                <ProcedureResults
                  groups={resultGroups}
                  onOpen={setDetailCode}
                  defaultOpen
                />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
