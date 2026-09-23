import { useEffect, useRef, useState } from 'react';

const LEAFLET_URL = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min';
const BRAZIL_CENTER = { lat: -15.78, lng: -47.93 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Leaflet = any;
let leafletPromise: Promise<Leaflet> | null = null;

// Carrega o Leaflet do CDN uma única vez
function loadLeaflet(): Promise<Leaflet> {
  const w = window as unknown as { L?: Leaflet };
  if (w.L) return Promise.resolve(w.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${LEAFLET_URL}.css`;
      document.head.appendChild(css);
      const script = document.createElement('script');
      script.src = `${LEAFLET_URL}.js`;
      script.onload = () => resolve(w.L);
      script.onerror = () => {
        leafletPromise = null;
        reject(new Error('Não foi possível carregar o mapa.'));
      };
      document.head.appendChild(script);
    });
  }
  return leafletPromise;
}

interface GeoPointsMapProps {
  center?: { lat: number; lng: number };
  points: { lat: number; lng: number; radiusKm: number }[];
  onAdd: (lat: number, lng: number) => void;
  onMove: (index: number, lat: number, lng: number) => void;
}

export function GeoPointsMap({ center, points, onAdd, onMove }: GeoPointsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet>(null);
  const layerRef = useRef<Leaflet>(null);
  const callbacksRef = useRef({ onAdd, onMove });
  useEffect(() => {
    callbacksRef.current = { onAdd, onMove };
  }, [onAdd, onMove]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        // Sem base, abre no 1º ponto ou no Brasil
        const start = center ?? points[0] ?? BRAZIL_CENTER;
        const map = L.map(containerRef.current).setView([start.lat, start.lng], center || points[0] ? 12 : 4);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
        map.on('click', (e: { latlng: { lat: number; lng: number } }) =>
          callbacksRef.current.onAdd(e.latlng.lat, e.latlng.lng));
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 0);
        setReady(true);
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentraliza quando a base muda
  useEffect(() => {
    if (ready && center) mapRef.current.setView([center.lat, center.lng], 12);
  }, [ready, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redesenha pinos e círculos
  useEffect(() => {
    if (!ready) return;
    const L = (window as unknown as { L: Leaflet }).L;
    const layer = layerRef.current;
    layer.clearLayers();
    points.forEach((p, i) => {
      L.circle([p.lat, p.lng], { radius: p.radiusKm * 1000, color: '#E8631A', weight: 2 }).addTo(layer);
      const marker = L.marker([p.lat, p.lng], {
        draggable: true,
        icon: L.divIcon({
          className: '',
          html: `<div style="width:22px;height:22px;border-radius:9999px;background:#E8631A;color:#fff;font:bold 12px/22px sans-serif;text-align:center;border:2px solid #fff">${i + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(layer);
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        callbacksRef.current.onMove(i, ll.lat, ll.lng);
      });
    });
  }, [ready, points]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return <div ref={containerRef} className="w-full h-80 rounded-lg border border-border isolate" />;
}
