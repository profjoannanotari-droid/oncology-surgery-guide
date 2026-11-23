import { z } from "zod";

export const procedureSchema = z.object({
  code: z.string().regex(/^\d{10}$/), name: z.string(), description: z.string(),
  complexity: z.string(), valorHosp: z.number(), valorAmb: z.number(), cid: z.string(),
  cidList: z.array(z.string()).optional(), valorHospSP: z.number().optional(),
  valorHospSH: z.number().optional(), valorHospTotal: z.number().optional(),
  atributoComplementar: z.string().optional(), sexo: z.string().optional(),
  idadeMinima: z.string().optional(), idadeMaxima: z.string().optional(),
  quantidadeMaxima: z.number().optional(), mediaPermanencia: z.number().nullable().optional(),
  pontos: z.number().optional(), especialidadeLeito: z.string().optional(),
  cbo: z.string().optional(), categoriaCbo: z.string().optional(),
});
export const compatibilitySchema = z.object({
  principalName: z.string(), items: z.array(z.object({
    code: z.string().regex(/^\d{10}$/), name: z.string(), qty: z.number(),
    since: z.string(), compatType: z.string(),
  })),
});
export const catalogSchema = z.object({
  subgroups: z.array(z.object({ id: z.string(), name: z.string(), procedures: z.array(procedureSchema) })),
  compatibilities: z.record(compatibilitySchema), cboNames: z.record(z.string()),
});
export type SigtapCatalog = z.infer<typeof catalogSchema>;
export type Procedure = z.infer<typeof procedureSchema>;
export type Subgroup = SigtapCatalog["subgroups"][number];
export type CompatEntry = z.infer<typeof compatibilitySchema>;
export type CompatItem = CompatEntry["items"][number];
export function formatCompetence(value: string) { return `${value.slice(4, 6)}/${value.slice(0, 4)}`; }
export function classifyCompat(compatType: string): "compativel" | "concomitante" | "excludente" | "outros" {
  const s = compatType.toLowerCase();
  if (s.includes("exclud")) return "excludente";
  if (s.includes("concomit")) return "concomitante";
  if (s.includes("compat")) return "compativel";
  return "outros";
}

export function validateCatalog(catalog: SigtapCatalog) {
  const codes = new Set(catalog.subgroups.flatMap(s => s.procedures.map(p => p.code)));
  if (codes.size < 1600 || !catalog.subgroups.some(s => s.id === "0415") || !catalog.subgroups.some(s => s.id.startsWith("02"))) {
    throw new Error("Base incompleta: cirurgias ou procedimentos especiais ausentes.");
  }
  for (const [code, entry] of Object.entries(catalog.compatibilities)) {
    if (!codes.has(code) || entry.items.some(item => !codes.has(item.code))) {
      throw new Error("Base incompleta: compatibilidade sem procedimento correspondente.");
    }
  }
  return { procedureCount: codes.size, compatibilityCount: Object.values(catalog.compatibilities).reduce((n, entry) => n + entry.items.length, 0) };
}