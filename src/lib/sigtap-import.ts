import { unzipSync } from "fflate";
import { catalogSchema, validateCatalog } from "./sigtap";
import type { Procedure, SigtapCatalog } from "./sigtap";

export const OFFICIAL_DIRECTORY = "https://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/";
export function latestPublication(html: string, maximum: string) {
  const names = [...new Set(html.match(/TabelaUnificada_\d{6}(?:_v\d{10})?\.zip/g) ?? [])];
  const eligible = names.filter(name => name.slice(16, 22) <= maximum);
  eligible.sort((a, b) => b.localeCompare(a));
  const file = eligible[0];
  if (!file) throw new Error("A listagem oficial não contém uma competência válida.");
  return { file, competence: file.slice(16, 22), url: new URL(file, OFFICIAL_DIRECTORY).href };
}

type Field = { name: string; start: number; end: number };
const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
export function parseLayout(layout: string): Field[] {
  const lines = layout.split(/\r?\n/).filter(line => line.trim());
  const separator = lines[0]?.includes(";") ? ";" : lines[0]?.includes("\t") ? "\t" : ",";
  const headers = (lines[0] ?? "").split(separator).map(normalized);
  const nameIndex = headers.findIndex(s => /^(CAMPO|COLUNA|NOME|NOME DO CAMPO)$/.test(s));
  const sizeIndex = headers.findIndex(s => /^(TAMANHO|TAM|LENGTH)$/.test(s));
  const startIndex = headers.findIndex(s => /^(INICIO|INICIAL|POSICAO INICIAL)$/.test(s));
  const endIndex = headers.findIndex(s => /^(FIM|FINAL|POSICAO FINAL)$/.test(s));
  if (nameIndex < 0 || sizeIndex < 0) throw new Error("Layout oficial não reconhecido; atualização não aplicada.");
  let offset = 0;
  return lines.slice(1).map(line => {
    const parts = line.split(separator);
    const name = normalized(parts[nameIndex] ?? "");
    const size = Number(parts[sizeIndex]);
    const start = startIndex >= 0 ? Number(parts[startIndex]) - 1 : offset;
    const end = endIndex >= 0 ? Number(parts[endIndex]) : start + size;
    if (!/^[A-Z][A-Z0-9_]+$/.test(name) || !Number.isInteger(size) || size < 1 || start < 0 || end - start !== size) throw new Error("Layout inconsistente.");
    offset = end;
    return { name, start, end };
  });
}

export function readTable(text: string, layout: string): Record<string, string>[] {
  const fields = parseLayout(layout);
  const width = fields.at(-1)?.end ?? 0;
  return text.split(/\r?\n/).filter(line => line.trim()).map(line => {
    if (line.length < width) throw new Error("Registro incompleto na tabela oficial.");
    return Object.fromEntries(fields.map(field => [field.name, line.slice(field.start, field.end).trim()]));
  });
}

export function importOfficialZip(bytes: Uint8Array, competence: string): SigtapCatalog {
  const files = unzipSync(bytes);
  const decoder = new TextDecoder("iso-8859-1");
  const read = (name: string) => {
    const key = Object.keys(files).find(key => key.split("/").at(-1)?.toLowerCase() === name.toLowerCase());
    if (!key || !files[key]) throw new Error(`Tabela obrigatória ausente: ${name}`);
    return decoder.decode(files[key]);
  };
  const table = (name: string) => {
    const rows = readTable(read(`${name}.txt`), read(`${name}_layout.txt`));
    if (rows.some(row => row['DT_COMPETENCIA'] && row['DT_COMPETENCIA'] !== competence)) throw new Error("Tabelas de competências diferentes.");
    return rows;
  };
  const lookup = (name: string, code: string, label: string) => Object.fromEntries(table(name).map(row => [row[code], row[label]]));
  const cboNames = lookup("tb_ocupacao", "CO_OCUPACAO", "NO_OCUPACAO");
  const subgroupNames = Object.fromEntries(table("tb_sub_grupo").map(row => [`${row['CO_GRUPO']}${row['CO_SUB_GRUPO']}`, row['NO_SUB_GRUPO']]));
  const registerNames = lookup("tb_registro", "CO_REGISTRO", "NO_REGISTRO");
  const attributes = lookup("tb_atributo", "CO_ATRIBUTO", "NO_ATRIBUTO");
  const beds = lookup("tb_tipo_leito", "CO_TIPO_LEITO", "NO_TIPO_LEITO");
  const grouped = (name: string, field: string) => {
    const result: Record<string, string[]> = {};
    for (const row of table(name)) {
      const code = row['CO_PROCEDIMENTO']; const value = row[field];
      if (!code || value == null) throw new Error(`Coluna obrigatória ausente: ${name}`);
      (result[code] ??= []).push(value);
    }
    return result;
  };
  const cids = grouped("rl_procedimento_cid", "CO_CID");
  const cbos = grouped("rl_procedimento_ocupacao", "CO_OCUPACAO");
  const attrs = grouped("rl_procedimento_atributo", "CO_ATRIBUTO");
  const leitos = grouped("rl_procedimento_leito", "CO_TIPO_LEITO");
  const descriptions = Object.fromEntries(table("tb_descricao").map(row => [row['CO_PROCEDIMENTO'], row['DS_PROCEDIMENTO']]));
  const numeric = (row: Record<string, string>, field: string) => {
    const value = row[field];
    if (!value || !/^\d+$/.test(value)) throw new Error(`Valor inválido: ${field}`);
    return Number(value);
  };
  const age = (value: number) => value < 12 ? `${value} Mes(es)` : `${value / 12} Ano(s)`;
  const procedures = new Map<string, Procedure>();
  for (const row of table("tb_procedimento")) {
    const code = row['CO_PROCEDIMENTO'];
    const sh = numeric(row, "VL_SH") / 100, sp = numeric(row, "VL_SP") / 100;
    const sex = ({ A: "Ambos", M: "Masculino", F: "Feminino", N: "Não se aplica" } as Record<string, string>)[row['TP_SEXO']];
    if (!sex) throw new Error("Sexo não reconhecido na tabela.");
    procedures.set(code, {
      code, name: row['NO_PROCEDIMENTO'], description: descriptions[code] ?? "",
      complexity: ({ '0': "Não se aplica", '1': "Atenção Básica", '2': "Média Complexidade", '3': "Alta Complexidade" } as Record<string, string>)[row['TP_COMPLEXIDADE']] ?? row['TP_COMPLEXIDADE'],
      valorHosp: sh + sp, valorAmb: numeric(row, "VL_SA") / 100,
      valorHospSP: sp, valorHospSH: sh, valorHospTotal: sh + sp,
      cid: (cids[code] ?? []).join(", "), cidList: cids[code] ?? [],
      cbo: (cbos[code] ?? []).join(", "), categoriaCbo: (cbos[code] ?? []).map(c => `${c} - ${cboNames[c] ?? "Nome não informado"}`).join(", "),
      atributoComplementar: (attrs[code] ?? []).map(c => `${c} - ${attributes[c] ?? ""}`).join("; "),
      especialidadeLeito: (leitos[code] ?? []).map(c => `${c} - ${beds[c] ?? ""}`).join("; "),
      sexo: sex, idadeMinima: age(numeric(row, "VL_IDADE_MINIMA")), idadeMaxima: age(numeric(row, "VL_IDADE_MAXIMA")),
      quantidadeMaxima: numeric(row, "QT_MAXIMA_EXECUCAO"), mediaPermanencia: numeric(row, "QT_DIAS_PERMANENCIA"), pontos: numeric(row, "QT_PONTOS"),
    });
  }
  const compatibilities: SigtapCatalog['compatibilities'] = {};
  const compatibilityRows = table("rl_procedimento_compativel");
  for (const row of compatibilityRows) {
    const principal = row['CO_PROCEDIMENTO_PRINCIPAL']; const target = row['CO_PROCEDIMENTO_COMPATIVEL'];
    const p = procedures.get(principal); const t = procedures.get(target);
    if (!p || !t) throw new Error("Procedimento de compatibilidade ausente na tabela.");
    const type = ({ '1': "Compatível", '2': "Excludente", '3': "Concomitante" } as Record<string, string>)[row['TP_COMPATIBILIDADE']] ?? `Tipo ${row['TP_COMPATIBILIDADE']} (sem classificação)`;
    const entry = compatibilities[principal] ??= { principalName: p.name, items: [] };
    entry.items.push({ code: target, name: t.name, qty: numeric(row, "QT_PERMITIDA"), since: "", compatType: `${registerNames[row['CO_REGISTRO_PRINCIPAL']] ?? row['CO_REGISTRO_PRINCIPAL']} × ${registerNames[row['CO_REGISTRO_COMPATIVEL']] ?? row['CO_REGISTRO_COMPATIVEL']} - ${type}` });
  }
  const subgroups: SigtapCatalog['subgroups'] = [];
  for (const p of procedures.values()) {
    const id = p.code.slice(0, 4);
    let sg = subgroups.find(s => s.id === id);
    if (!sg) { sg = { id, name: subgroupNames[id] ?? id, procedures: [] }; subgroups.push(sg); }
    sg.procedures.push(p);
  }
  const catalog = catalogSchema.parse({ subgroups: subgroups.sort((a, b) => a.id.localeCompare(b.id)), compatibilities, cboNames });
  const counts = validateCatalog(catalog);
  if (counts.compatibilityCount !== compatibilityRows.length || counts.compatibilityCount < 7000) throw new Error("Conferência de compatibilidades incompleta.");
  return catalog;
}