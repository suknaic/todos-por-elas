import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDashboard } from '@/context/DashboardContext.jsx';
import { SCALE, SCALE_DARK, cssVar, isDark } from '../../lib/constants.js';

export default function MunicipalityMap() {
  const { aggregate, filters, actions: { setCityFilter } } = useDashboard();
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const layersRef = useRef(new Map());
  const initializedRef = useRef(false);

  const cobertura = aggregate?.cobertura || [];
  const counts = useMemo(() => new Map(cobertura.map(c => [c.nome, c.n])), [cobertura]);
  const maxCount = useMemo(() => Math.max(...counts.values(), 1), [counts]);
  const breaks = useMemo(() => [maxCount * 0.25, maxCount * 0.5, maxCount * 0.75], [maxCount]);
  const dark = isDark();
  const escala = dark ? SCALE_DARK : SCALE;

  const fillFor = (n) => {
    if (!n) return dark ? '#2a263c' : '#f2f2f4';
    if (n <= breaks[0]) return escala[0];
    if (n <= breaks[1]) return escala[1];
    if (n <= breaks[2]) return escala[2];
    return escala[3];
  };

  useEffect(() => {
    if (initializedRef.current) return;
    if (!containerRef.current) return;
    if (!L) return;

    let cancelled = false;

    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: true,
      minZoom: 6,
      maxZoom: 13,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120
    });
    mapRef.current = map;

    fetch('/geo/acre-municipios.geojson')
      .then(r => r.json())
      .then(geo => {
        if (cancelled || !mapRef.current) return;
        const layer = L.geoJSON(geo, {
          style: (feat) => {
            const nome = feat.properties.nome;
            const n = counts.get(nome) || 0;
            const selecionado = filters.city === nome;
            return {
              fillColor: fillFor(n),
              color: selecionado ? (dark ? '#f4a06a' : '#f0873f') : cssVar('--border'),
              weight: selecionado ? 3 : 1,
              fillOpacity: 0.85,
              dashArray: n ? '' : '2 2'
            };
          },
          onEachFeature: (feat, layer) => {
            const nome = feat.properties.nome;
            const n = counts.get(nome) || 0;
            const pct = aggregate?.n ? Math.round((n / aggregate.n) * 100) : 0;
            layer.options.bubblingMouseEvents = false;
            layer.bindTooltip(`<b>${nome}</b><br>${n} cadastro${n === 1 ? '' : 's'} (${pct}%)`, { sticky: true, className: 'mapa-tooltip' });
            layer.on('click', () => setCityFilter(nome === filters.city ? null : nome));
            layersRef.current.set(nome, layer);
          }
        }).addTo(map);

        map.fitBounds(layer.getBounds(), { padding: [40, 40] });
        map.on('click', () => setCityFilter(null));
        initializedRef.current = true;
      })
      .catch(() => {});
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; initializedRef.current = false; } };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const dark = isDark();
    const escala = dark ? SCALE_DARK : SCALE;
    const counts = new Map(cobertura.map(c => [c.nome, c.n]));
    const maxCount = Math.max(...counts.values(), 1);
    const breaks = [maxCount * 0.25, maxCount * 0.5, maxCount * 0.75];

    const fillFor = (n) => {
      if (!n) return dark ? '#2a263c' : '#f2f2f4';
      if (n <= breaks[0]) return escala[0];
      if (n <= breaks[1]) return escala[1];
      if (n <= breaks[2]) return escala[2];
      return escala[3];
    };

    layersRef.current.forEach((layer, nome) => {
      const n = counts.get(nome) || 0;
      const selecionado = nome === filters.city;
      layer.setStyle({
        fillColor: fillFor(n),
        color: selecionado ? (dark ? '#f4a06a' : '#f0873f') : cssVar('--border'),
        weight: selecionado ? 3 : 1,
        dashArray: n ? '' : '2 2'
      });
      if (selecionado && mapRef.current) {
        mapRef.current.flyToBounds(layer.getBounds(), { padding: [40, 40] });
      }
    });
  }, [cobertura, filters.city]);

  return <div className="mapa-box" id="mapa" ref={containerRef} style={{ height: '420px' }} />;
}