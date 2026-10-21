export function slug(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function toNumber(v) {
  if (v == null) return NaN;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function isoDateOnly(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Converte o _submission_time do Kobo (UTC, sem sufixo Z) para a data local do Acre (-03:00).
export function localDateInAcre(v) {
  if (!v) return null;
  const s = String(v).trim();
  // O Kobo envia _submission_time já com sufixo Z (UTC). Não duplica o Z.
  const d = new Date(s.endsWith('Z') ? s : s + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  const offsetMs = -3 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const MUNICIPIOS = [
  'Acrelândia', 'Brasiléia', 'Bujari', 'Capixaba', 'Cruzeiro do Sul',
  'Epitaciolândia', 'Feijó', 'Jordão', 'Mâncio Lima', 'Manoel Urbano',
  'Marechal Thaumaturgo', 'Plácido de Castro', 'Porto Acre', 'Porto Walter',
  'Rio Branco', 'Rodrigues Alves', 'Santa Rosa do Purus', 'Sena Madureira',
  'Senador Guiomard', 'Tarauacá', 'Xapuri', 'Assis Brasil'
];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// Busca estabilidade: resolve um campo do schema por nome/xpath/label ou list_name.
export function resolveField(fields, wanted, listName) {
  if (listName) {
    const byList = fields.find((f) => f.list === listName);
    if (byList) return byList;
  }
  const normW = slug(wanted);
  const exact = fields.find((f) => slug(f.name) === normW || slug(f.xpath) === normW || slug(f.label) === normW);
  if (exact) return exact;
  return fields.find((f) => slug(f.label).includes(normW) || slug(f.xpath).includes(normW));
}
