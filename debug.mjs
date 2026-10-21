import { computeAggregates } from './lib/aggregate.js';
import { fetchSchema as koboFetchSchema } from './lib/kobo.js';

const schema = await koboFetchSchema();
const fields = schema.fields;
const choices = schema.choices;

const fZona = fields.find((f) => f.list === 'ml1hg11' || f.name === 'Zona');
console.log('fZona:', JSON.stringify({name: fZona.name, xpath: fZona.xpath, label: fZona.label, list: fZona.list}));

const rec = {
  Nome_do_usu_rio: 'Ana Silva',
  Zona: 'urbana',
  RG: '123',
  CPF: '123',
  Idade: '35'
};

import { getValue } from './lib/aggregate.js';
console.log('getValue zona:', getValue(rec, fZona, choices));
console.log('choices ml1hg11:', JSON.stringify(choices.ml1hg11?.slice(0,3)));
