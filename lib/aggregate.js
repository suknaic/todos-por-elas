import { resolveField, slug, toNumber, MUNICIPIOS, UFS, localDateInAcre } from './normalize.js';

function choiceLabel(listName, value, choices) {
  if (value == null || value === '') return '';
  if (!listName || !choices || !choices[listName]) return String(value).trim();
  const items = choices[listName];
  const wanted = slug(value);
  const hit = items.find((c) => slug(c.name) === wanted || slug(c.value) === wanted || slug(c.label) === wanted);
  return hit ? hit.label : String(value).trim();
}

export function getValue(rec, field, choices) {
  if (!field) return '';
  const v = rec[field.xpath] ?? rec[field.name] ?? rec[slug(field.xpath)] ?? rec[slug(field.name)];
  if (v == null) return '';
  if (field.type === 'select_multiple') {
    const arr = Array.isArray(v) ? v : String(v).split(/[;, ]+/).filter(Boolean);
    return arr.map((x) => choiceLabel(field.list, x, choices)).filter(Boolean);
  }
  if (field.list) return choiceLabel(field.list, v, choices);
  return String(v).trim();
}

function countsOf(records, field, choices, { multi = false } = {}) {
  const map = new Map();
  if (!field) return map;
  for (const rec of records) {
    const v = getValue(rec, field, choices);
    const items = multi ? (Array.isArray(v) ? v : [v]) : [v];
    for (const raw of items) {
      const key = String(raw).trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return map;
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function plain(map) {
  return map instanceof Map ? Object.fromEntries(map) : (map || {});
}

export function cityName(value) {
  if (value == null || value === '') return 'Não informado';
  const s = slug(value);
  for (const m of MUNICIPIOS) if (slug(m) === s) return m;
  return 'Fora do Acre / Outro';
}

function ageBucket(n) {
  if (n < 18) return '0–17';
  if (n < 25) return '18–24';
  if (n < 35) return '25–34';
  if (n < 45) return '35–44';
  if (n < 55) return '45–54';
  return '55+';
}

const ORDERED_AGES = ['0–17', '18–24', '25–34', '35–44', '45–54', '55+'];

export function computeAggregates(records, schema, geoJSON, filters = {}) {
  const total = records.length;
  const choices = schema && schema.choices ? schema.choices : {};
  const fields = schema && schema.fields ? schema.fields : [];
  const cityFilter = filters.city || null;
  const days = filters.days ? Number(filters.days) : null;
  const now = new Date();

  const filtered = records.filter((rec) => {
    if (cityFilter) {
      const f = resolveField(fields, 'Cidade da residência atual', 'wb2gy08');
      const c = cityName(getValue(rec, f, choices));
      if (c !== cityFilter) return false;
    }
    if (days) {
      const st = rec.submitted_at || rec._submission_time || rec.start;
      const d = new Date(st);
      if (Number.isNaN(d.getTime())) return true;
      return d >= new Date(now - days * 86400000);
    }
    return true;
  });

  const n = filtered.length;

  // ---------- Blocos ----------
  const result = { total, n, filters };

  // A. Volumetria
  result.volumetria = {
    total,
    n,
    cidadesAlcancadas: new Set(filtered.map((r) => {
      const f = resolveField(fields, 'Cidade da residência atual', 'wb2gy08');
      return cityName(getValue(r, f, choices));
    })).size
  };

  // B. Cobertura municipal (drill-down)
  const fCidade = resolveField(fields, 'Cidade da residência atual', 'wb2gy08');
  const fZona = resolveField(fields, 'Zona:', 'ml1hg11');
  const fIdade = resolveField(fields, 'Idade:', null);
  const fRenda = resolveField(fields, 'Renda Familiar per capita', 'bi8dg53');
  const fBeneficio = resolveField(fields, 'você ou alguém da sua família recebe algum auxílio', 'xi7ww03');
  const fServicos = resolveField(fields, 'quais serviços acessou', 'zx7ud82');
  const fAcompanhado = resolveField(fields, 'É acompanhado pelo', 'zi7jh00');
  const fFilhosQtd = resolveField(fields, 'Se sim, quantos?', null);
  const fGenero = resolveField(fields, 'Identidade de gênero', 'xv1wh54');
  const fTrabalha = resolveField(fields, 'Trabalha?', 'li3gq59');
  const fRaca = resolveField(fields, 'Raça/Cor/Etnia', 'ch7hy55');

  const cityCounts = new Map();
  for (const rec of filtered) {
    const key = cityName(getValue(rec, fCidade, choices));
    cityCounts.set(key, (cityCounts.get(key) || 0) + 1);
  }
  const geoByName = new Map();
  for (const feat of (geoJSON && geoJSON.features || [])) {
    geoByName.set(feat.properties.nome, feat);
  }
  const cobertura = [];
  for (const [cidade, cnt] of sortedEntries(cityCounts)) {
    const feat = geoByName.get(cidade);
    const subset = filtered.filter((r) => cityName(getValue(r, fCidade, choices)) === cidade);
    const zonaMap = countsOf(subset, fZona, choices);
    const urbana = zonaMap.get('Urbana') || 0;
    const idadeVals = subset.map((r) => toNumber(getValue(r, fIdade, choices))).filter((x) => Number.isFinite(x) && x > 0 && x <= 120);
    const mediaIdade = idadeVals.length ? idadeVals.reduce((a, b) => a + b, 0) / idadeVals.length : 0;
    const rendaMap = countsOf(subset, fRenda, choices);
    const baixa = (rendaMap.get('Inferior meio salário mínimo') || 0) + (rendaMap.get('De meio a 1 salário mínimo') || 0);
    const servMap = countsOf(subset, fServicos, choices, { multi: true });
    const comServico = subset.filter((r) => {
      const v = getValue(r, fServicos, choices);
      return Array.isArray(v) ? v.length > 0 : !!v;
    }).length;
    const acompanhadoMap = countsOf(subset, fAcompanhado, choices);
    const acompanhado = [...acompanhadoMap.values()].reduce((a, b) => a + b, 0);
    cobertura.push({
      nome: cidade,
      n: cnt,
      pct: n ? Math.round((cnt / n) * 100) : 0,
      urbana,
      urbanaPct: n ? Math.round((urbana / n) * 100) : 0,
      mediaIdade: Math.round(mediaIdade * 10) / 10,
      baixa,
      baixaPct: n ? Math.round((baixa / n) * 100) : 0,
      comServico,
      comServicoPct: n ? Math.round((comServico / n) * 100) : 0,
      acompanhado,
      lat: feat ? feat.properties.latitude : null,
      lon: feat ? feat.properties.longitude : null,
      codigoIbge: feat ? feat.properties.codigo_ibge : null,
      regional: feat ? feat.properties.regional : null
    });
  }
  cobertura.sort((a, b) => b.n - a.n);
  result.cobertura = cobertura;

  // C. Demografia
  result.demografia = {
    cidade: plain(countsOf(filtered, fCidade, choices)),
    zona: plain(countsOf(filtered, fZona, choices)),
    genero: plain(countsOf(filtered, fGenero, choices)),
    raca: plain(countsOf(filtered, resolveField(fields, 'Raça/Cor/Etnia', 'ch7hy55'), choices)),
    orientacao: plain(countsOf(filtered, resolveField(fields, 'Orientação Sexual', 'ma9np89'), choices)),
    nacionalidade: plain(countsOf(filtered, resolveField(fields, 'Nacionalidade', 'mu0an97'), choices)),
    naturalidade: plain(countsOf(filtered, resolveField(fields, 'Naturalidade', null), choices))
  };

  const idadeVals = filtered.map((r) => toNumber(getValue(r, fIdade, choices))).filter((x) => Number.isFinite(x) && x > 0 && x <= 120);
  result.demografia.idade = {
    media: idadeVals.length ? Number((idadeVals.reduce((a, b) => a + b, 0) / idadeVals.length).toFixed(1)) : 0,
    mediana: idadeVals.length ? idadeVals.slice().sort((a, b) => a - b)[Math.floor(idadeVals.length / 2)] : 0,
    min: idadeVals.length ? Math.min(...idadeVals) : 0,
    max: idadeVals.length ? Math.max(...idadeVals) : 0,
    buckets: ORDERED_AGES.map((k) => [k, 0])
  };
  for (const v of idadeVals) result.demografia.idade.buckets.find(([k]) => k === ageBucket(v))[1]++;

  // D. Socioeconômico
  result.socioeconomico = {
    renda: plain(countsOf(filtered, fRenda, choices)),
    rendaXzona: crossTab(filtered, fRenda, fZona, choices),
    vinculo: plain(countsOf(filtered, resolveField(fields, 'qual o vínculo', 'ge5pp48'), choices)),
    filhosSimNao: plain(countsOf(filtered, resolveField(fields, 'Possui Filhos?', 'yg4vl02'), choices)),
    filhosDist: histogramaQuantos(filtered, fFilhosQtd),
    totalDependentes: totalDependentes(filtered, fFilhosQtd)
  };

  // E. Benefícios / vulnerabilidade
  result.beneficios = {
    recebe: plain(countsOf(filtered, fBeneficio, choices)),
    tipo: plain(countsOf(filtered, resolveField(fields, 'Se sim, qual?', 'pn64m63'), choices)),
    deficiencia: plain(countsOf(filtered, resolveField(fields, 'possui alguma deficiência', 'mp6yy25'), choices)),
    tipoDeficiencia: plain(countsOf(filtered, resolveField(fields, 'Se sim, qual?', 'er71y45'), choices))
  };

  result.socioeconomico.trabalha = plain(countsOf(filtered, fTrabalha, choices));

  result.vulnerabilidade = {
    acompanhamento: plain(countsOf(filtered, fAcompanhado, choices)),
    trabalhaXrenda: crossTab(filtered, fTrabalha, fRenda, choices),
    rendaXservicos: crossTab(filtered, fRenda, fServicos, choices),
    zonaXservicos: crossTab(filtered, fZona, fServicos, choices),
    racaXrenda: crossTab(filtered, fRaca, fRenda, choices),
    racaXservicos: crossTab(filtered, fRaca, fServicos, choices),
    acompanhamentoXrenda: crossTab(filtered, fAcompanhado, fRenda, choices),
    acompanhamentoXservicos: crossTab(filtered, fAcompanhado, fServicos, choices)
  };

  // G. Serviços
  const servMap = countsOf(filtered, fServicos, choices, { multi: true });
  const servicoCountPerPerson = filtered.map((r) => {
    const v = getValue(r, fServicos, choices);
    return Array.isArray(v) ? v.length : (!!v ? 1 : 0);
  });
  const mediaServicos = servicoCountPerPerson.length
    ? Number((servicoCountPerPerson.reduce((a, b) => a + b, 0) / servicoCountPerPerson.length).toFixed(2))
    : 0;
  const histServicos = {};
  for (const c of servicoCountPerPerson) histServicos[c] = (histServicos[c] || 0) + 1;
  result.servicos = {
    ranking: sortedEntries(servMap),
    media: mediaServicos,
    histograma: Object.entries(histServicos).sort((a, b) => Number(a[0]) - Number(b[0])),
    distinct: sortedEntries(servMap).filter(([, v]) => v > 0).length
  };

  // G2. Indicadores-síntese
  const zonaCounts = countsOf(filtered, fZona, choices);
  const rendaCounts = countsOf(filtered, fRenda, choices);
  const filhosCounts = countsOf(filtered, resolveField(fields, 'Possui Filhos?', 'yg4vl02'), choices);
  const defCounts = countsOf(filtered, resolveField(fields, 'possui alguma deficiência', 'mp6yy25'), choices);
  const trabCounts = countsOf(filtered, fTrabalha, choices);
  const crasCounts = countsOf(filtered, fAcompanhado, choices);
  const auxCounts = countsOf(filtered, fBeneficio, choices);
  const pct = (v) => (n ? Math.round((v / n) * 1000) / 10 : 0);
  result.indicadores = {
    pctUrbana: pct(zonaCounts.get('Urbana') || 0),
    pctRural: pct(zonaCounts.get('Rural') || 0),
    pctComFilhos: pct(filhosCounts.get('Sim') || 0),
    pctComDeficiencia: pct(defCounts.get('Sim') || 0),
    pctTrabalha: pct(trabCounts.get('Sim') || 0),
    pctAcompanhado: pct([...crasCounts.values()].reduce((a, b) => a + b, 0)),
    pctAuxilio: pct(auxCounts.get('Sim') || 0),
    pctRendaBaixa: pct((rendaCounts.get('Inferior meio salário mínimo') || 0) + (rendaCounts.get('De meio a 1 salário mínimo') || 0)),
    mediaServicos
  };

  // G3. Demanda por serviços
  const AREAS = {
    'Saúde': ['Pediatria', 'Oftalmologia', 'Odontologia', 'Ginecologia', 'Cardiologia', 'Clinico Geral', 'Outros Atendimentos De Saude', 'Vacina'],
    'Assistência social': ['Bolsa Família', 'OCA Intinerante'],
    'Documentação e direitos': ['Registro Civil', 'PROCON'],
    'Renda e qualificação': ['Programa Mulheres Mil', 'Cursos Instituto Êxito'],
    'Bem-estar e convivência': ['Vestuário Social', 'Sala Metaverso', 'Interbairros Game']
  };
  const byArea = {};
  const cityService = new Map();
  const porMes = {};
  const idadeSaude = {};
  const health = new Set(AREAS['Saúde']);

  for (const rec of filtered) {
    const raw = getValue(rec, fServicos, choices);
    const servs = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const cidade = cityName(getValue(rec, fCidade, choices));
    cityService.set(cidade, (cityService.get(cidade) || 0) + servs.length);

    for (const [area, labels] of Object.entries(AREAS)) {
      if (servs.some((s) => labels.includes(s))) byArea[area] = (byArea[area] || 0) + 1;
    }

    const dia = localDateInAcre(rec.submitted_at || rec._submission_time || rec.started_at || rec.start);
    const mes = dia ? dia.slice(0, 7) : null;
    if (mes) {
      if (!porMes[mes]) porMes[mes] = {};
      for (const s of servs) porMes[mes][s] = (porMes[mes][s] || 0) + 1;
    }

    const idade = toNumber(getValue(rec, fIdade, choices));
    if (Number.isFinite(idade) && idade > 0 && idade <= 120) {
      const faixa = ageBucket(idade);
      for (const s of servs) {
        if (!health.has(s)) continue;
        if (!idadeSaude[faixa]) idadeSaude[faixa] = {};
        idadeSaude[faixa][s] = (idadeSaude[faixa][s] || 0) + 1;
      }
    }
  }

  result.demanda = {
    areas: Object.entries(byArea).sort((a, b) => b[1] - a[1]),
    porCidade: sortedEntries(cityService).slice(0, 10),
    porMes,
    idadeXsaude: idadeSaude
  };

  // H. Qualidade da coleta
  const todosCampos = fields.filter((f) => f.name && !['start', 'end'].includes(f.name));
  const respostaPorCampo = [];
  for (const f of todosCampos) {
    let preenchidos = 0;
    for (const rec of records) {
      const v = getValue(rec, f, choices);
      const ok = Array.isArray(v) ? v.length > 0 : v !== '' && v != null;
      if (ok) preenchidos++;
    }
    respostaPorCampo.push({ campo: f.label || f.name, n: preenchidos, pct: total ? Math.round((preenchidos / total) * 100) : 0 });
  }
  respostaPorCampo.sort((a, b) => a.pct - b.pct);
  const completudePorRegistro = records.map((r) => {
    let preenchidos = 0;
    for (const f of todosCampos) {
      const v = getValue(r, f, choices);
      if (Array.isArray(v) ? v.length > 0 : v !== '' && v != null) preenchidos++;
    }
    return total ? Math.round((preenchidos / todosCampos.length) * 100) : 0;
  });
  const mediaCompletude = completudePorRegistro.length
    ? Number((completudePorRegistro.reduce((a, b) => a + b, 0) / completudePorRegistro.length).toFixed(1))
    : 0;
  const completudeDist = {};
  for (const c of completudePorRegistro) {
    const faixa = c < 25 ? '0–25%' : c < 50 ? '26–50%' : c < 75 ? '51–75%' : '76–100%';
    completudeDist[faixa] = (completudeDist[faixa] || 0) + 1;
  }
  const tempoPreenchimento = records.map((r) => {
    const s = new Date(r.started_at || r.start || r._submission_time);
    const e = new Date(r.ended_at || r.end || r._submission_time);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    return (e - s) / 1000;
  }).filter((x) => x != null && x > 0 && x < 86400);
  const tempoStats = tempoPreenchimento.length
    ? {
        media: Number((tempoPreenchimento.reduce((a, b) => a + b, 0) / tempoPreenchimento.length).toFixed(0)),
        mediana: tempoPreenchimento.slice().sort((a, b) => a - b)[Math.floor(tempoPreenchimento.length / 2)],
        min: Math.min(...tempoPreenchimento),
        max: Math.max(...tempoPreenchimento),
        n: tempoPreenchimento.length
      }
    : null;
  const cpfCounts = {};
  for (const r of records) {
    const cpf = String(getValue(r, resolveField(fields, 'CPF:', null), choices) || '');
    if (cpf) cpfCounts[cpf] = (cpfCounts[cpf] || 0) + 1;
  }
  const duplicidadesCPF = Object.entries(cpfCounts).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
  const geoloc = records.filter((r) => r._geolocation && Array.isArray(r._geolocation) && r._geolocation.length === 2 && r._geolocation[0] && r._geolocation[1]);
  result.qualidade = {
    respostaPorCampo,
    mediaCompletude,
    completudeDist,
    tempoStats,
    duplicidadesCPF,
    registrosComGPS: geoloc.length,
    pctComGPS: total ? Math.round((geoloc.length / total) * 100) : 0
  };

  // I. Série temporal (dia, fuso Acre)
  const porDia = {};
  for (const rec of records) {
    const dia = localDateInAcre(rec.submitted_at || rec._submission_time || rec.started_at || rec.start);
    if (dia) porDia[dia] = (porDia[dia] || 0) + 1;
  }
  const diasOrdenados = Object.keys(porDia).sort();
  let acumulado = 0;
  const serie = diasOrdenados.map((dia) => {
    acumulado += porDia[dia];
    return { dia, novos: porDia[dia], acumulado };
  });
  result.serieTemporal = serie;

  return result;
}

function crossTab(records, fA, fB, choices) {
  if (!fA || !fB) return {};
  const map = new Map();
  for (const rec of records) {
    const a = getValue(rec, fA, choices);
    const b = getValue(rec, fB, choices);
    const itemsA = Array.isArray(a) ? a : [a];
    const itemsB = Array.isArray(b) ? b : [b];
    for (const ia of itemsA) {
      if (!ia) continue;
      for (const ib of itemsB) {
        if (!ib) continue;
        const key = `${ia}|||${ib}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
  }
  const out = {};
  for (const [key, v] of map) {
    const [a, b] = key.split('|||');
    if (!out[a]) out[a] = {};
    out[a][b] = v;
  }
  return out;
}

function histogramaQuantos(records, field) {
  const map = {};
  if (!field) return map;
  for (const rec of records) {
    const n = toNumber(getValue(rec, field, {}));
    if (!Number.isFinite(n)) continue;
    map[Math.round(n)] = (map[Math.round(n)] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0]));
}

function totalDependentes(records, field) {
  let total = 0;
  if (!field) return total;
  for (const rec of records) {
    total += toNumber(getValue(rec, field, {})) || 0;
  }
  return total;
}

function topTextos(records, field, limit) {
  const map = {};
  if (!field) return [];
  for (const rec of records) {
    const v = getValue(rec, field, {});
    if (!v) continue;
    map[v] = (map[v] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, v]) => ({ texto: k, n: v }));
}

function histogramaAnos(records, field) {
  const map = {};
  if (!field) return map;
  for (const rec of records) {
    const y = toNumber(getValue(rec, field, {}));
    if (!Number.isFinite(y)) continue;
    map[Math.round(y)] = (map[Math.round(y)] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0]));
}
