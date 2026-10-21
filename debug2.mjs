import { computeAggregates } from './lib/aggregate.js';
import { fetchSchema as koboFetchSchema } from './lib/kobo.js';
import { loadGeoJSON } from './lib/kobo.js';

const schema = await koboFetchSchema();
const geoJSON = await loadGeoJSON();

// simular dados de demonstração (como no servidor)
const firstNames = ['Ana', 'Maria', 'Juliana'];
const lastNames = ['Silva', 'Santos'];
function pickList(listName) {
  const items = schema.choices[listName] || [];
  if (!items.length) return '';
  return items[Math.floor(Math.random()*items.length)].value;
}
const simNao = (p=0.5) => Math.random() < p ? 'sim' : 'n_o';
const rows = [];
for (let i = 0; i < 48; i++) {
  rows.push({
    _id: `demo-${i}`, _uuid: `u-${i}`, _submission_time: new Date().toISOString(),
    Nome_do_usu_rio: `${pick(firstNames)} ${pick(lastNames)}`,
    Zona: pickList('ml1hg11'),
    Cidade_da_resid_ncia_atual: pickList('wb2gy08'),
    Idade: String(16 + Math.floor(Math.random()*45)),
    Nacionalidade: 'brasileiro',
    Renda_Familiar_per_capita: pickList('bi8dg53'),
    Trabalha: simNao(),
    Identidade_de_G_nero: pickList('xv1wh54'),
    Ra_a_Cor_Etnia: pickList('ch7hy55'),
    Orienta_o_Sexual: pickList('ma9np89'),
    Possui_Filhos: simNao(),
    Se_sim_quantos: simNao() === 'sim' ? String(1 + Math.floor(Math.random()*4)) : '',
    Migrante: simNao(),
    Voc_ou_algu_m_da_sua_fam_lia_: simNao(),
    Se_sim_qual: pickList('pn64m63'),
    Voc_ou_algu_m_da_fam_lia_poss: simNao(),
    Se_sim_qual_001: pickList('er71y45'),
    N_vel: pickList('ex68a42'),
    Turno: pickList('si8wk37'),
    Semestre: pickList('rz1op81'),
    Ano_de_Ingresso: String(2021 + Math.floor(Math.random()*5)),
    _acompanhado_pelo: pickList('zi7jh00'),
    Quais_servi_os_acess_ama_Juntos_Pelo_Acre: pickList('zx7ud82') + ' ' + pickList('zx7ud82'),
  });
}

const agg = computeAggregates(rows, { fields: schema.fields, choices: schema.choices }, geoJSON, {});
console.log('total', agg.total);
console.log('zona:', JSON.stringify(agg.demografia.zona));
console.log('cidade:', JSON.stringify(agg.demografia.cidade));
console.log('renda:', JSON.stringify(agg.socioeconomico.renda));
console.log('genero:', JSON.stringify(agg.demografia.genero));
