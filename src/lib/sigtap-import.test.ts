import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { latestPublication, readTable } from "./sigtap-import";
import { formatCompetence, validateCatalog, classifyCompat } from "./sigtap";

describe("Competência e compatibilidades SIGTAP", () => {
  test("APAC não muda um vínculo compatível para concomitante", () => {
    assert.equal(classifyCompat("APAC × APAC - Compatível"), "compativel");
    assert.equal(classifyCompat("AIH × AIH - Excludente"), "excludente");
    assert.equal(classifyCompat("APAC × APAC - Concomitante"), "concomitante");
  });
  test("a avaliação identifica a competência dos dados, não o mês do computador", () => {
    assert.equal(formatCompetence("202605"), "05/2026");
    assert.equal(formatCompetence("202611"), "11/2026");
  });
  test("seleciona a revisão mais recente da competência publicada, sem avançar ao futuro", () => {
    const listing = "TabelaUnificada_202610_v2610271043.zip TabelaUnificada_202611_v2611051737.zip TabelaUnificada_202611_v2611061737.zip TabelaUnificada_202612.zip";
    assert.equal(latestPublication(listing, "202611").file, "TabelaUnificada_202611_v2611061737.zip");
    assert.equal(latestPublication(listing, "202611").competence, "202611");
  });
  test("preserva todos os vínculos e a quantidade do mesmo par em tipos distintos", () => {
    const layout = "Campo;Tamanho;Inicio;Fim\nCO_PROCEDIMENTO_PRINCIPAL;10;1;10\nCO_PROCEDIMENTO_COMPATIVEL;10;11;20\nTP_COMPATIBILIDADE;1;21;21\nQT_PERMITIDA;2;22;23";
    const rows = readTable("04030300990702050431102\n04030300990702050431201", layout);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.['QT_PERMITIDA'], "02");
    assert.equal(rows[1]?.['TP_COMPATIBILIDADE'], "2");
  });
  test("rejeita base incompleta em vez de anunciá-la como atualizada", () => {
    assert.throws(() => validateCatalog({ subgroups: [], compatibilities: {}, cboNames: {} }), /Base incompleta/);
  });
});