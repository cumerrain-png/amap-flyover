import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import {
  MAP_STYLES,
  hideBasemapLabels,
  restyleBasemapForShow,
  resolveCountryLabels,
  resolveMapScope,
  type MapStylePreset,
} from './geoScope';

export type RouteGeoJSON = FeatureCollection & {
  features: Array<
    | Feature<LineString, { role?: string }>
    | Feature<Point, { role?: string }>
  >;
  properties?: {
    originLabel?: string;
    destinationLabel?: string;
    originCountry?: string;
    destinationCountry?: string;
    originContinent?: string;
    destinationContinent?: string;
    [key: string]: unknown;
  };
};

export type MapFlyoverProps = {
  geojson: RouteGeoJSON;
  originLabel?: string;
  destinationLabel?: string;
  markerEmoji?: string;
  planeImageSrc?: string;
  originImageSrc?: string;
  destinationImageSrc?: string;
  planeSize?: number;
  labelFontSize?: number;
  endpointIconSize?: number;
  mapStyle?: MapStylePreset | (string & {});
};

/** 分镜比例：揭幕 → 飞行 → 抵达定格 */
const REVEAL_END = 0.18;
const FLY_START = 0.2;
const FLY_END = 0.88;
const TRAIL_COUNT = 3;

function getPointByRole(
  geojson: RouteGeoJSON,
  role: 'origin' | 'destination',
): [number, number] {
  const feat = geojson.features.find(
    (f) => f.geometry.type === 'Point' && f.properties?.role === role,
  ) as Feature<Point> | undefined;
  if (feat) {
    return feat.geometry.coordinates as [number, number];
  }
  const line = geojson.features.find(
    (f) => f.geometry.type === 'LineString',
  ) as Feature<LineString> | undefined;
  if (!line) throw new Error('GeoJSON 缺少起终点坐标');
  const coords = line.geometry.coordinates;
  return (
    role === 'origin' ? coords[0] : coords[coords.length - 1]
  ) as [number, number];
}

function buildSmoothArc(
  origin: [number, number],
  dest: [number, number],
  samples = 96,
  bulgeRatio = 0.22,
): Feature<LineString> {
  const mid: [number, number] = [
    (origin[0] + dest[0]) / 2,
    (origin[1] + dest[1]) / 2,
  ];
  const dx = dest[0] - origin[0];
  const dy = dest[1] - origin[1];
  const len = Math.hypot(dx, dy) || 1;
  const bulge = len * bulgeRatio;
  const control: [number, number] = [
    mid[0] - (dy / len) * bulge,
    mid[1] + (dx / len) * bulge,
  ];

  const coordinates: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    coordinates.push([
      u * u * origin[0] + 2 * u * t * control[0] + t * t * dest[0],
      u * u * origin[1] + 2 * u * t * control[1] + t * t * dest[1],
    ]);
  }
  return turf.lineString(coordinates);
}

function emptyLineAt(coord: [number, number]): Feature<LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [coord, coord] },
  };
}

function makeEndpointMarker(opts: {
  text: string;
  color: string;
  imageSrc?: string;
  labelFontSize: number;
  iconSize: number;
  badge?: string;
}): HTMLDivElement {
  const { text, color, imageSrc, labelFontSize, iconSize, badge } = opts;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'pointer-events:none',
    'user-select:none',
    'transition:none',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:8px',
  ].join(';');

  if (badge) {
    const b = document.createElement('div');
    b.className = 'endpoint-badge';
    b.textContent = badge;
    b.style.cssText = [
      'padding:5px 14px',
      'border-radius:999px',
      'background:#FFF7FB',
      'border:3px solid #FF6B9D',
      'color:#FF4D8D',
      'font:800 16px/1.1 "Microsoft YaHei",system-ui,sans-serif',
      'letter-spacing:0.12em',
      'box-shadow:0 4px 0 #FF9ECD',
      'opacity:0',
      'transition:none',
      'transform:rotate(-7deg)',
    ].join(';');
    el.appendChild(b);
  }

  const pill = document.createElement('div');
  pill.className = 'endpoint-label';
  pill.textContent = text;
  pill.style.cssText = [
    `padding:${Math.round(labelFontSize * 0.42)}px ${Math.round(labelFontSize * 0.9)}px`,
    'border-radius:999px',
    'background:' + color,
    'color:#fff',
    `font:900 ${labelFontSize}px/1.1 "Microsoft YaHei",system-ui,sans-serif`,
    'letter-spacing:0.08em',
    'white-space:nowrap',
    'border:5px solid #fff',
    'box-shadow:0 8px 0 rgba(0,0,0,.14), 0 12px 0 rgba(255,107,157,.2)',
    'opacity:0',
    'transition:none',
  ].join(';');

  const iconSlot = document.createElement('div');
  iconSlot.className = 'endpoint-icon-slot';
  iconSlot.style.cssText = [
    `width:${iconSize}px`,
    `height:${iconSize}px`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'opacity:0',
    'transition:none',
    'position:relative',
  ].join(';');

  const ring = document.createElement('div');
  ring.className = 'endpoint-pulse';
  ring.style.cssText = [
    'position:absolute',
    'inset:-14px',
    'border-radius:50%',
    `border:4px solid ${color}`,
    'opacity:0',
    'transform:scale(0.6)',
    'transition:none',
  ].join(';');
  iconSlot.appendChild(ring);

  if (imageSrc) {
    const img = document.createElement('img');
    img.className = 'endpoint-icon';
    img.src = imageSrc;
    img.alt = text;
    img.style.cssText = [
      `width:${iconSize}px`,
      `height:${iconSize}px`,
      'object-fit:contain',
      'display:block',
      'position:relative',
      'z-index:1',
      'transition:none',
      'filter:drop-shadow(0 4px 0 rgba(0,0,0,.12))',
    ].join(';');
    iconSlot.appendChild(img);
  } else {
    const dot = document.createElement('div');
    dot.className = 'endpoint-dot endpoint-icon';
    dot.style.cssText = [
      `width:${Math.round(iconSize * 0.64)}px`,
      `height:${Math.round(iconSize * 0.64)}px`,
      'border-radius:50%',
      'background:' + color,
      'border:5px solid #fff',
      `box-shadow:0 5px 0 rgba(0,0,0,.14), 0 0 0 4px ${color}`,
      'position:relative',
      'z-index:1',
      'transition:none',
    ].join(';');
    iconSlot.appendChild(dot);
  }

  el.appendChild(pill);
  el.appendChild(iconSlot);
  return el;
}

function makePlaneMarker(opts: {
  emoji: string;
  imageSrc?: string;
  size: number;
}): HTMLDivElement {
  const { emoji, imageSrc, size } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'plane-marker';
  wrap.style.cssText =
    'pointer-events:none;user-select:none;transition:none;opacity:0;line-height:0';

  if (imageSrc) {
    const img = document.createElement('img');
    img.className = 'flyover-marker-icon';
    img.src = imageSrc;
    img.alt = 'plane';
    img.style.cssText = [
      `width:${size}px`,
      `height:${size}px`,
      'object-fit:contain',
      'display:block',
      'transform-origin:center center',
      'transition:none',
      'filter:drop-shadow(0 0 10px rgba(255,107,157,.7))',
    ].join(';');
    wrap.appendChild(img);
  } else {
    const icon = document.createElement('span');
    icon.className = 'flyover-marker-icon';
    icon.textContent = emoji;
    icon.style.cssText = [
      'display:block',
      `font-size:${size}px`,
      'line-height:1',
      'transform-origin:center center',
      'transition:none',
      'filter:drop-shadow(0 0 10px rgba(255,107,157,.65)) drop-shadow(0 2px 6px rgba(0,0,0,.2))',
    ].join(';');
    wrap.appendChild(icon);
  }
  return wrap;
}

function makeTrailMarker(size: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'plane-trail';
  el.style.cssText = [
    'width:' + size + 'px',
    'height:' + size + 'px',
    'border-radius:50%',
    'background:radial-gradient(circle,rgba(255,107,157,.9) 0%,rgba(255,200,87,.4) 45%,transparent 70%)',
    'opacity:0',
    'pointer-events:none',
    'transition:none',
  ].join(';');
  return el;
}

function makeCountryLabel(text: string, fontSize = 56): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'country-label';
  el.setAttribute('aria-hidden', 'true');
  el.textContent = text;
  el.style.cssText = [
    'pointer-events:none',
    'user-select:none',
    'transition:none',
    `font:900 ${fontSize}px/1.15 "Microsoft YaHei",system-ui,sans-serif`,
    'letter-spacing:0.32em',
    'color:rgba(255,107,157,0.22)',
    'text-shadow:3px 3px 0 rgba(255,255,255,.95), 0 0 0 #FF9ECD',
    '-webkit-text-stroke:2px rgba(255,155,180,0.25)',
    'white-space:nowrap',
    'opacity:0',
  ].join(';');
  return el;
}

function formatKm(km: number): string {
  return Math.round(km).toLocaleString('zh-CN');
}

/**
 * 旅行节目信息层 + 霓虹航线：揭幕 → 飞行 → 抵达。
 * 全部由 useCurrentFrame 驱动；无相机跟随。
 */
export const MapFlyover: React.FC<MapFlyoverProps> = ({
  geojson,
  originLabel: originLabelProp,
  destinationLabel: destinationLabelProp,
  markerEmoji = '✈️',
  planeImageSrc,
  originImageSrc,
  destinationImageSrc,
  planeSize = 96,
  labelFontSize = 44,
  endpointIconSize = 60,
  mapStyle = 'cute',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height, fps } = useVideoConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const planeRef = useRef<Marker | null>(null);
  const trailRefs = useRef<Marker[]>([]);
  const originMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const countryMarkersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const handleRef = useRef<number | null>(null);

  const originCoord = useMemo(
    () => getPointByRole(geojson, 'origin'),
    [geojson],
  );
  const destCoord = useMemo(
    () => getPointByRole(geojson, 'destination'),
    [geojson],
  );

  const originLabel =
    originLabelProp ||
    geojson.properties?.originLabel?.replace(/[（(].*$/, '') ||
    '起点';
  const destinationLabel =
    destinationLabelProp ||
    geojson.properties?.destinationLabel?.replace(/[（(].*$/, '') ||
    '终点';

  const mapScope = useMemo(
    () =>
      resolveMapScope(originCoord, destCoord, {
        originCountry: geojson.properties?.originCountry,
        destinationCountry: geojson.properties?.destinationCountry,
        originContinent: geojson.properties?.originContinent,
        destinationContinent: geojson.properties?.destinationContinent,
      }),
    [originCoord, destCoord, geojson.properties],
  );

  const countryInfo = useMemo(
    () =>
      resolveCountryLabels(originCoord, destCoord, {
        originCountry: geojson.properties?.originCountry,
        destinationCountry: geojson.properties?.destinationCountry,
      }),
    [originCoord, destCoord, geojson.properties],
  );

  const styleUrl = useMemo(() => {
    if (mapStyle in MAP_STYLES) {
      return MAP_STYLES[mapStyle as MapStylePreset];
    }
    return mapStyle;
  }, [mapStyle]);

  const routeLine = useMemo(
    () => buildSmoothArc(originCoord, destCoord, 96, 0.22),
    [originCoord, destCoord],
  );
  const totalLength = useMemo(
    () => turf.length(routeLine, { units: 'kilometers' }),
    [routeLine],
  );

  const lineWidth =
    mapScope.level === 'world' ? 7 : mapScope.level === 'continent' ? 7.5 : 8.5;
  const glowWidth = lineWidth * 2.8;

  const last = durationInFrames - 1;
  const revealEndFrame = last * REVEAL_END;
  const flyStartFrame = last * FLY_START;
  const flyEndFrame = last * FLY_END;

  const titleEnter = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 120 },
    durationInFrames: Math.round(fps * 0.7),
  });
  const titleOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const titleY = interpolate(titleEnter, [0, 1], [-36, 0]);

  const countryOpacity = interpolate(
    frame,
    [0, revealEndFrame * 0.5, revealEndFrame],
    [0, 0.85, 0.85],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const originOpacity = interpolate(
    frame,
    [8, 22, revealEndFrame],
    [0, 1, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const destOpacity = interpolate(
    frame,
    [20, 36, revealEndFrame],
    [0, 1, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const previewOpacity = interpolate(
    frame,
    [revealEndFrame * 0.7, flyStartFrame],
    [0, 0.55],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const routeProgress = interpolate(
    frame,
    [flyStartFrame, flyEndFrame],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const distanceKm = totalLength * routeProgress;
  const showPlane = routeProgress > 0.002 && routeProgress < 0.995;

  const hudOpacity = interpolate(
    frame,
    [flyStartFrame - 6, flyStartFrame + 8, flyEndFrame, last],
    [0, 1, 1, 0.85],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const arriveOpacity = interpolate(
    frame,
    [flyEndFrame, flyEndFrame + 10, last],
    [0, 1, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const arriveScale = interpolate(
    frame,
    [flyEndFrame, flyEndFrame + 12],
    [0.85, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const destPulse = interpolate(
    frame,
    [flyEndFrame, flyEndFrame + 8, flyEndFrame + 20],
    [0, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const travelerPoint = useMemo(() => {
    if (distanceKm <= 0) return turf.point(originCoord);
    return turf.along(routeLine, distanceKm, { units: 'kilometers' });
  }, [routeLine, distanceKm, originCoord]);

  const slicedRoute = useMemo(() => {
    if (distanceKm <= 0.0001) return emptyLineAt(originCoord);
    try {
      return turf.lineSliceAlong(routeLine, 0, distanceKm, {
        units: 'kilometers',
      });
    } catch {
      return emptyLineAt(originCoord);
    }
  }, [routeLine, distanceKm, originCoord]);

  const bearing = useMemo(() => {
    if (distanceKm <= 0) return 0;
    const lookAhead = Math.min(
      totalLength,
      distanceKm + Math.max(totalLength * 0.01, 8),
    );
    const from = turf.along(routeLine, Math.max(0, distanceKm - 2), {
      units: 'kilometers',
    });
    const to = turf.along(routeLine, lookAhead, { units: 'kilometers' });
    return turf.bearing(from, to);
  }, [routeLine, distanceKm, totalLength]);

  const trailPoints = useMemo(() => {
    const points: Array<{ coord: [number, number]; opacity: number }> = [];
    for (let i = 1; i <= TRAIL_COUNT; i++) {
      const back = routeProgress - i * 0.018;
      if (back <= 0.002) continue;
      const d = totalLength * back;
      const p = turf.along(routeLine, d, { units: 'kilometers' });
      points.push({
        coord: p.geometry.coordinates as [number, number],
        opacity: Math.max(0.15, 0.55 - i * 0.14),
      });
    }
    return points;
  }, [routeLine, routeProgress, totalLength]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const handle = delayRender('maplibre-load');
    handleRef.current = handle;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [
        (mapScope.bounds[0][0] + mapScope.bounds[1][0]) / 2,
        (mapScope.bounds[0][1] + mapScope.bounds[1][1]) / 2,
      ],
      zoom: 2,
      interactive: false,
      fadeDuration: 0,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      hideBasemapLabels(map);
      // 播报向重绘：去道路杂讯、统一深蓝配色
      restyleBasemapForShow(map);

      map.fitBounds(mapScope.bounds, {
        padding: mapScope.padding,
        animate: false,
        duration: 0,
      });
      if (mapScope.zoomIn) {
        map.jumpTo({
          center: map.getCenter(),
          zoom: map.getZoom() + mapScope.zoomIn,
          bearing: 0,
          pitch: 0,
        });
      }

      // 全程预告虚线
      map.addSource('route-preview', {
        type: 'geojson',
        data: routeLine,
      });
      map.addLayer({
        id: 'route-preview',
        type: 'line',
        source: 'route-preview',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#FF9ECD',
          'line-width': 4.5,
          'line-opacity': 0,
          'line-dasharray': [1.4, 2.4],
        },
      });

      // 霓虹生长实线
      map.addSource('route', {
        type: 'geojson',
        data: emptyLineAt(originCoord),
      });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#FFD56A',
          'line-width': glowWidth,
          'line-opacity': 0.65,
          'line-blur': 1.6,
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#FF6B9D',
          'line-width': lineWidth,
          'line-opacity': 1,
        },
      });

      // 线头光点
      map.addSource('route-tip', {
        type: 'geojson',
        data: turf.point(originCoord),
      });
      map.addLayer({
        id: 'route-tip-glow',
        type: 'circle',
        source: 'route-tip',
        paint: {
          'circle-radius': 20,
          'circle-color': '#FFD56A',
          'circle-opacity': 0,
          'circle-blur': 0.5,
        },
      });
      map.addLayer({
        id: 'route-tip-core',
        type: 'circle',
        source: 'route-tip',
        paint: {
          'circle-radius': 7,
          'circle-color': '#FFF7E0',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FF6B9D',
          'circle-opacity': 0,
        },
      });

      originMarkerRef.current = new maplibregl.Marker({
        element: makeEndpointMarker({
          text: originLabel,
          color: '#3DDC97',
          imageSrc: originImageSrc,
          labelFontSize,
          iconSize: endpointIconSize,
          badge: '出发',
        }),
        anchor: 'bottom',
      })
        .setLngLat(originCoord)
        .addTo(map);

      destMarkerRef.current = new maplibregl.Marker({
        element: makeEndpointMarker({
          text: destinationLabel,
          color: '#FF6B9D',
          imageSrc: destinationImageSrc,
          labelFontSize,
          iconSize: endpointIconSize,
        }),
        anchor: 'bottom',
      })
        .setLngLat(destCoord)
        .addTo(map);

      const countryMarkers: Marker[] = [];
      if (countryInfo.sameCountry) {
        const center: [number, number] = [
          (mapScope.bounds[0][0] + mapScope.bounds[1][0]) / 2,
          (mapScope.bounds[0][1] + mapScope.bounds[1][1]) / 2,
        ];
        countryMarkers.push(
          new maplibregl.Marker({
            element: makeCountryLabel(countryInfo.originCountryLabel, 72),
            anchor: 'center',
          })
            .setLngLat(center)
            .addTo(map),
        );
      } else {
        const oLng =
          originCoord[0] + (destCoord[0] - originCoord[0]) * 0.12;
        const oLat =
          originCoord[1] + (destCoord[1] - originCoord[1]) * 0.12;
        const dLng =
          destCoord[0] - (destCoord[0] - originCoord[0]) * 0.12;
        const dLat =
          destCoord[1] - (destCoord[1] - originCoord[1]) * 0.12;
        countryMarkers.push(
          new maplibregl.Marker({
            element: makeCountryLabel(countryInfo.originCountryLabel, 48),
            anchor: 'center',
          })
            .setLngLat([oLng, oLat])
            .addTo(map),
          new maplibregl.Marker({
            element: makeCountryLabel(
              countryInfo.destinationCountryLabel,
              48,
            ),
            anchor: 'center',
          })
            .setLngLat([dLng, dLat])
            .addTo(map),
        );
      }
      countryMarkersRef.current = countryMarkers;

      const trails: Marker[] = [];
      for (let i = 0; i < TRAIL_COUNT; i++) {
        trails.push(
          new maplibregl.Marker({
            element: makeTrailMarker(28 - i * 5),
            anchor: 'center',
          })
            .setLngLat(originCoord)
            .addTo(map),
        );
      }
      trailRefs.current = trails;

      planeRef.current = new maplibregl.Marker({
        element: makePlaneMarker({
          emoji: markerEmoji,
          imageSrc: planeImageSrc,
          size: planeSize,
        }),
      })
        .setLngLat(originCoord)
        .addTo(map);

      setMapReady(true);
      continueRender(handle);
    });

    map.on('error', () => {
      continueRender(handle);
    });

    return () => {
      if (handleRef.current != null) {
        try {
          continueRender(handleRef.current);
        } catch {
          /* already continued */
        }
      }
      planeRef.current?.remove();
      trailRefs.current.forEach((m) => m.remove());
      trailRefs.current = [];
      originMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
      countryMarkersRef.current.forEach((m) => m.remove());
      countryMarkersRef.current = [];
      planeRef.current = null;
      originMarkerRef.current = null;
      destMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const setEndpointOpacity = (
      marker: Marker | null,
      opacity: number,
      pulse = 0,
    ) => {
      if (!marker) return;
      const root = marker.getElement();
      const label = root.querySelector('.endpoint-label') as HTMLElement | null;
      const slot = root.querySelector(
        '.endpoint-icon-slot',
      ) as HTMLElement | null;
      const badge = root.querySelector('.endpoint-badge') as HTMLElement | null;
      const ring = root.querySelector('.endpoint-pulse') as HTMLElement | null;
      if (label) {
        label.style.opacity = String(opacity);
        label.style.transition = 'none';
      }
      if (slot) {
        slot.style.opacity = String(opacity);
        slot.style.transition = 'none';
      }
      if (badge) {
        badge.style.opacity = String(opacity);
        badge.style.transition = 'none';
      }
      if (ring) {
        ring.style.opacity = String(pulse * 0.7);
        ring.style.transform = `scale(${0.7 + pulse * 0.9})`;
        ring.style.transition = 'none';
      }
    };

    setEndpointOpacity(originMarkerRef.current, originOpacity, 0);
    setEndpointOpacity(destMarkerRef.current, destOpacity, destPulse);

    for (const marker of countryMarkersRef.current) {
      const el = marker.getElement();
      el.style.opacity = String(countryOpacity);
      el.style.transition = 'none';
    }

    if (map.getLayer('route-preview')) {
      map.setPaintProperty('route-preview', 'line-opacity', previewOpacity);
    }

    const routeSource = map.getSource('route') as
      | maplibregl.GeoJSONSource
      | undefined;
    routeSource?.setData(slicedRoute);

    const tipSource = map.getSource('route-tip') as
      | maplibregl.GeoJSONSource
      | undefined;
    tipSource?.setData(travelerPoint);
    const tipOpacity = showPlane ? 1 : routeProgress >= 0.995 ? 0.4 : 0;
    if (map.getLayer('route-tip-glow')) {
      map.setPaintProperty('route-tip-glow', 'circle-opacity', tipOpacity * 0.7);
    }
    if (map.getLayer('route-tip-core')) {
      map.setPaintProperty('route-tip-core', 'circle-opacity', tipOpacity);
    }

    trailRefs.current.forEach((marker, i) => {
      const trail = trailPoints[i];
      const el = marker.getElement();
      if (!trail || !showPlane) {
        el.style.opacity = '0';
        return;
      }
      marker.setLngLat(trail.coord);
      el.style.opacity = String(trail.opacity);
      el.style.transition = 'none';
    });

    const plane = planeRef.current;
    if (plane) {
      const [lng, lat] = travelerPoint.geometry.coordinates as [number, number];
      plane.setLngLat([lng, lat]);
      const wrap = plane.getElement();
      wrap.style.opacity = showPlane || routeProgress >= 0.995 ? '1' : '0';
      wrap.style.transition = 'none';
      const icon = wrap.querySelector(
        '.flyover-marker-icon',
      ) as HTMLElement | null;
      if (icon) {
        icon.style.transform = `rotate(${bearing - 45}deg)`;
        icon.style.transition = 'none';
      }
    }
  }, [
    frame,
    mapReady,
    slicedRoute,
    travelerPoint,
    bearing,
    originOpacity,
    destOpacity,
    countryOpacity,
    previewOpacity,
    showPlane,
    routeProgress,
    trailPoints,
    destPulse,
  ]);

  const fontFamily = '"Microsoft YaHei","PingFang SC",system-ui,sans-serif';

  return (
    <AbsoluteFill style={{ backgroundColor: '#FFF4E8' }}>
      <div
        ref={containerRef}
        style={{ width, height, transition: 'none' }}
      />

      {/* 浅色欢乐罩层：柔光而非暗角 */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(255,180,160,0.18) 100%)',
          transition: 'none',
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(255,244,232,0.55) 0%, transparent 16%, transparent 78%, rgba(255,230,210,0.5) 100%)',
          transition: 'none',
        }}
      />

      {/* 顶栏：旅行节目信息 */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingTop: 36,
        }}
      >
        <div
          style={{
            opacity: titleOpacity,
            textAlign: 'center',
            transition: 'none',
            padding: '18px 42px 20px',
            borderRadius: 36,
            background: '#FFFFFF',
            boxShadow: '0 10px 0 #FF9ECD, 0 14px 0 rgba(0,0,0,.06)',
            border: '5px solid #FF6B9D',
            transform: `translateY(${titleY}px) rotate(-1.2deg)`,
          }}
        >
          <div
            style={{
              fontFamily,
              fontWeight: 900,
              fontSize: 56,
              letterSpacing: '0.08em',
              color: '#3D2C2E',
            }}
          >
            {originLabel}
            <span style={{ margin: '0 16px', color: '#FF6B9D' }}>➜</span>
            {destinationLabel}
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#FF6B9D',
            }}
          >
            ✈ 航线示意 · 约 {formatKm(totalLength)} km
          </div>
        </div>
      </AbsoluteFill>

      {/* 底栏：进度 + 公里数 */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 42,
          opacity: hudOpacity,
          transition: 'none',
        }}
      >
        <div
          style={{
            width: '64%',
            maxWidth: 960,
            padding: '18px 26px 20px',
            borderRadius: 28,
            background: '#FFFFFF',
            boxShadow: '0 9px 0 #FFD56A, 0 12px 0 rgba(0,0,0,.06)',
            border: '5px solid #FFB84D',
            transform: 'rotate(0.8deg)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 12,
              fontFamily,
              color: '#5C4A4E',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '0.06em',
            }}
          >
            <span>🚀 飞行进度</span>
            <span style={{ color: '#FF6B9D', fontWeight: 900 }}>
              已飞行 {formatKm(distanceKm)} km
            </span>
          </div>
          <div
            style={{
              height: 16,
              borderRadius: 999,
              background: '#FFE8F0',
              overflow: 'hidden',
              border: '3px solid #fff',
              boxShadow: 'inset 0 0 0 2px rgba(255,107,157,0.2)',
            }}
          >
            <div
              style={{
                width: `${routeProgress * 100}%`,
                height: '100%',
                borderRadius: 999,
                background:
                  'linear-gradient(90deg, #3DDC97 0%, #FFD56A 45%, #FF6B9D 100%)',
                boxShadow: '0 0 12px rgba(255,107,157,.4)',
                transition: 'none',
              }}
            />
          </div>
        </div>
      </AbsoluteFill>

      {/* 抵达提示 */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          justifyContent: 'flex-end',
          alignItems: 'flex-end',
          padding: '0 56px 128px 0',
          opacity: arriveOpacity,
          transition: 'none',
        }}
      >
        <div
          style={{
            transform: `scale(${arriveScale}) rotate(3deg)`,
            transition: 'none',
            padding: '16px 32px',
            borderRadius: 999,
            background: '#FF6B9D',
            color: '#fff',
            fontFamily,
            fontWeight: 900,
            fontSize: 34,
            letterSpacing: '0.14em',
            boxShadow: '0 10px 0 #E84E82, 0 14px 0 rgba(0,0,0,.08)',
            border: '5px solid #fff',
          }}
        >
          抵达！{destinationLabel} ✨
        </div>
      </AbsoluteFill>

      {!mapReady && (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            color: '#9A7B7F',
            fontFamily,
            fontSize: 24,
            backgroundColor: '#FFF4E8',
          }}
        >
          地图加载中…
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export default MapFlyover;
