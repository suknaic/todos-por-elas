export function normKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function choiceLabel(listName, value, choices) {
  if (value == null || value === '') return '';
  if (!listName || !choices || !choices[listName]) return String(value).trim();
  const items = choices[listName];
  const wanted = normKey(value);
  const hit = items.find((c) => normKey(c.name) === wanted || normKey(c.value) === wanted || normKey(c.label) === wanted);
  return hit ? hit.label : String(value).trim();
}

export function getValue(rec, field, choices) {
  if (!field) return '';
  const v = rec[field.xpath] ?? rec[field.name] ?? rec[normKey(field.xpath)] ?? rec[normKey(field.name)];
  if (v == null) return '';
  if (field.type === 'select_multiple') {
    const arr = Array.isArray(v) ? v : String(v).split(/[;, ]+/).filter(Boolean);
    return arr.map((x) => choiceLabel(field.list, x, choices)).filter(Boolean);
  }
  if (field.list) return choiceLabel(field.list, v, choices);
  return String(v).trim();
}

export function field(fields, labelPart) {
  const wanted = normKey(labelPart);
  const exact = fields.find((f) =>
    normKey(f.xpath) === wanted || normKey(f.name) === wanted || normKey(f.label) === wanted
  );
  if (exact) return exact;
  return fields.find((f) => normKey(f.label).includes(wanted) || normKey(f.xpath).includes(wanted));
}

export function fieldByList(fields, list) {
  return fields.find((f) => f.list === list) || null;
}

export function sortedEntries(map) {
  const entries = map instanceof Map ? [...map.entries()] : Object.entries(map || {});
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function ageBucket(n) {
  if (n < 18) return '0–17';
  if (n < 25) return '18–24';
  if (n < 35) return '25–34';
  if (n < 45) return '35–44';
  if (n < 55) return '45–54';
  return '55+';
}