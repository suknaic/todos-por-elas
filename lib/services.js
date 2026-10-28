import { slug } from './normalize.js';

export const SERVICE_ENTITY_CONFIG = [
  { name: 'SEMULHER', short: 'SEMULHER', area: 'Assistência social' },
  { name: 'SA_DE', short: 'SAÚDE', area: 'Saúde', health: true },
  { name: 'SENAC_IEPTEC', short: 'SENAC', area: 'Qualificação e renda' },
  { name: 'ESPA_O_KIDS', short: 'KIDS', area: 'Bem-estar e convivência' },
  { name: 'SEASDH', short: 'SEASDH', area: 'Assistência social' },
  { name: 'Pol_cia_Militar', short: 'PM', area: 'Segurança e cidadania' },
  { name: 'OCA_M_vel', short: 'OCA', area: 'Documentação e direitos' },
  { name: 'PROCON', short: 'PROCON', area: 'Documentação e direitos' },
  { name: 'SEHURB', short: 'SEHURB', area: 'Assistência social' },
  { name: 'Defensoria_P_blica', short: 'DPE', area: 'Documentação e direitos' },
  { name: 'SEMA', short: 'SEMA', area: 'Meio ambiente' },
  { name: 'SEMSA', short: 'SEMSA', area: 'Saúde', health: true }
];

const CONFIG_BY_SLUG = new Map();
for (const config of SERVICE_ENTITY_CONFIG) {
  CONFIG_BY_SLUG.set(slug(config.name), config);
}

function keysOf(item) {
  return [item && item.name, item && item.xpath, item && item.label]
    .filter(Boolean)
    .map((value) => slug(value));
}

function findField(fields, item) {
  const wanted = new Set(keysOf(item));
  return (fields || []).find((field) => {
    const candidates = [field.name, field.xpath, field.label].filter(Boolean).map((value) => slug(value));
    return candidates.some((value) => wanted.has(value));
  }) || null;
}

export function buildServiceEntities(schema = {}) {
  const fields = schema.fields || [];
  const detected = Array.isArray(schema.serviceEntities) ? schema.serviceEntities : [];
  const candidates = [];
  const seen = new Set();

  for (const item of detected) {
    const key = slug(item.xpath || item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(item);
  }

  for (const config of SERVICE_ENTITY_CONFIG) {
    const key = slug(config.name);
    if (seen.has(key)) continue;
    const field = findField(fields, config);
    if (!field) continue;
    seen.add(key);
    candidates.push({
      name: field.name,
      xpath: field.xpath,
      label: field.label,
      list: field.list
    });
  }

  return candidates.map((item) => {
    const field = findField(fields, item) || {
      name: item.name,
      xpath: item.xpath,
      type: 'select_multiple',
      label: item.label,
      list: item.list || null
    };
    const config = CONFIG_BY_SLUG.get(slug(item.name))
      || CONFIG_BY_SLUG.get(slug(item.xpath))
      || CONFIG_BY_SLUG.get(slug(field.label));
    const label = (field.label || item.label || field.name || '').trim();
    return {
      key: field.xpath || field.name,
      name: field.name || item.name,
      xpath: field.xpath || item.xpath,
      label,
      short: config ? config.short : label,
      list: field.list || item.list || null,
      area: config ? config.area : 'Outros',
      health: !!(config && config.health),
      field
    };
  });
}
