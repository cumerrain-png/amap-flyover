/**
 * 根据起终点推断地图视野：同国家 → 国家；同大洲 → 大洲；否则 → 世界。
 * （用户说的「州」按大洲理解；国家优先于大洲。）
 */

export type LngLat = [number, number];
/** [[西, 南], [东, 北]] */
export type MapBounds = [[number, number], [number, number]];

export type MapScopeLevel = 'country' | 'continent' | 'world';

export type MapScope = {
  level: MapScopeLevel;
  id: string;
  label: string;
  bounds: MapBounds;
  /** fitBounds 边距：国家级更小，让国土尽量铺满 */
  padding: { top: number; bottom: number; left: number; right: number };
  /** fitBounds 后再放大一点（仅国家级） */
  zoomIn?: number;
};

type RegionDef = {
  id: string;
  label: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  continent: string;
};

/** 常用国家外包框（示意用，足够决定默认视野） */
const COUNTRIES: RegionDef[] = [
  { id: 'CN', label: '中国', bbox: [75, 18.5, 134, 52.5], continent: 'asia' },
  { id: 'JP', label: '日本', bbox: [129, 30, 146, 46], continent: 'asia' },
  { id: 'KR', label: '韩国', bbox: [125, 33, 130, 39], continent: 'asia' },
  { id: 'IN', label: '印度', bbox: [68, 6, 97, 36], continent: 'asia' },
  { id: 'SG', label: '新加坡', bbox: [103.6, 1.2, 104.1, 1.5], continent: 'asia' },
  { id: 'TH', label: '泰国', bbox: [97, 5, 106, 21], continent: 'asia' },
  { id: 'VN', label: '越南', bbox: [102, 8, 110, 23.5], continent: 'asia' },
  { id: 'US', label: '美国', bbox: [-125, 24, -66, 50], continent: 'north_america' },
  { id: 'CA', label: '加拿大', bbox: [-141, 41, -52, 70], continent: 'north_america' },
  { id: 'MX', label: '墨西哥', bbox: [-118, 14, -86, 33], continent: 'north_america' },
  { id: 'GB', label: '英国', bbox: [-8.5, 49.5, 2, 61], continent: 'europe' },
  { id: 'FR', label: '法国', bbox: [-5.5, 41, 10, 51.5], continent: 'europe' },
  { id: 'DE', label: '德国', bbox: [5.5, 47, 15.5, 55.5], continent: 'europe' },
  { id: 'IT', label: '意大利', bbox: [6.5, 36.5, 19, 47.5], continent: 'europe' },
  { id: 'ES', label: '西班牙', bbox: [-10, 35.5, 4.5, 44], continent: 'europe' },
  { id: 'RU', label: '俄罗斯', bbox: [27, 41, 180, 82], continent: 'europe' },
  { id: 'AU', label: '澳大利亚', bbox: [112, -44, 154, -10], continent: 'oceania' },
  { id: 'NZ', label: '新西兰', bbox: [166, -48, 179, -34], continent: 'oceania' },
  { id: 'BR', label: '巴西', bbox: [-74, -34, -34, 5.5], continent: 'south_america' },
  { id: 'AR', label: '阿根廷', bbox: [-74, -56, -53, -21], continent: 'south_america' },
  { id: 'ZA', label: '南非', bbox: [16, -35, 33, -22], continent: 'africa' },
  { id: 'EG', label: '埃及', bbox: [24.5, 22, 37, 32], continent: 'africa' },
  { id: 'AE', label: '阿联酋', bbox: [51, 22.5, 56.5, 26.5], continent: 'asia' },
  { id: 'SA', label: '沙特', bbox: [34.5, 16, 55.5, 32.5], continent: 'asia' },
];

const CONTINENTS: Record<
  string,
  { label: string; bbox: [number, number, number, number] }
> = {
  asia: { label: '亚洲', bbox: [25, -10, 150, 56] },
  europe: { label: '欧洲', bbox: [-25, 34, 45, 72] },
  north_america: { label: '北美洲', bbox: [-170, 7, -50, 75] },
  south_america: { label: '南美洲', bbox: [-82, -56, -34, 13] },
  africa: { label: '非洲', bbox: [-20, -36, 52, 38] },
  oceania: { label: '大洋洲', bbox: [110, -48, 180, 0] },
};

const WORLD_BOUNDS: MapBounds = [
  [-170, -55],
  [170, 75],
];

function inBBox(
  lng: number,
  lat: number,
  bbox: [number, number, number, number],
): boolean {
  const [w, s, e, n] = bbox;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

function bboxToBounds(
  bbox: [number, number, number, number],
  pad = 0.02,
): MapBounds {
  const [w, s, e, n] = bbox;
  const dx = (e - w) * pad;
  const dy = (n - s) * pad;
  return [
    [w - dx, s - dy],
    [e + dx, n + dy],
  ];
}

/** 面积更小的国家优先（避免被大国 bbox 误吸） */
function detectCountry(lng: number, lat: number): RegionDef | null {
  const hits = COUNTRIES.filter((c) => inBBox(lng, lat, c.bbox));
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    const area = (r: RegionDef) =>
      (r.bbox[2] - r.bbox[0]) * (r.bbox[3] - r.bbox[1]);
    return area(a) - area(b);
  });
  return hits[0];
}

function detectContinentId(lng: number, lat: number): string | null {
  const country = detectCountry(lng, lat);
  if (country) return country.continent;

  // 粗略大洲划分（国家表未命中时）
  if (lng >= 25 && lng <= 150 && lat >= -10 && lat <= 56) return 'asia';
  if (lng >= -25 && lng <= 45 && lat >= 34 && lat <= 72) return 'europe';
  if (lng >= -170 && lng <= -50 && lat >= 7 && lat <= 75) return 'north_america';
  if (lng >= -82 && lng <= -34 && lat >= -56 && lat <= 13) return 'south_america';
  if (lng >= -20 && lng <= 52 && lat >= -36 && lat <= 38) return 'africa';
  if (lng >= 110 && lng <= 180 && lat >= -48 && lat <= 0) return 'oceania';
  return null;
}

/**
 * 决策视野：
 * 1. 同一国家 → 该国
 * 2. 同一大洲 → 该洲
 * 3. 否则 → 世界
 */
export function resolveMapScope(
  origin: LngLat,
  destination: LngLat,
  meta?: {
    originCountry?: string;
    destinationCountry?: string;
    originContinent?: string;
    destinationContinent?: string;
  },
): MapScope {
  const oCountry =
    (meta?.originCountry &&
      COUNTRIES.find(
        (c) =>
          c.id === meta.originCountry || c.label === meta.originCountry,
      )) ||
    detectCountry(origin[0], origin[1]);
  const dCountry =
    (meta?.destinationCountry &&
      COUNTRIES.find(
        (c) =>
          c.id === meta.destinationCountry ||
          c.label === meta.destinationCountry,
      )) ||
    detectCountry(destination[0], destination[1]);

  if (oCountry && dCountry && oCountry.id === dCountry.id) {
    return {
      level: 'country',
      id: oCountry.id,
      label: oCountry.label,
      // 不向外扩边，尽量贴合国境，视觉上更大
      bounds: bboxToBounds(oCountry.bbox, 0),
      padding: { top: 28, bottom: 28, left: 36, right: 36 },
      zoomIn: 0.35,
    };
  }

  const oCont =
    meta?.originContinent ||
    oCountry?.continent ||
    detectContinentId(origin[0], origin[1]);
  const dCont =
    meta?.destinationContinent ||
    dCountry?.continent ||
    detectContinentId(destination[0], destination[1]);

  if (oCont && dCont && oCont === dCont && CONTINENTS[oCont]) {
    const c = CONTINENTS[oCont];
    return {
      level: 'continent',
      id: oCont,
      label: c.label,
      bounds: bboxToBounds(c.bbox, 0.02),
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
    };
  }

  return {
    level: 'world',
    id: 'world',
    label: '世界',
    bounds: WORLD_BOUNDS,
    padding: { top: 32, bottom: 32, left: 32, right: 32 },
  };
}

/** 可选底图样式（均可替换；含 OpenMapTiles 多语言字段的可切中文标注） */
export const MAP_STYLES = {
  /** 深色播报风（默认，加载后会做综艺向重绘） */
  dark: 'https://tiles.openfreemap.org/styles/dark',
  /** 浅色简洁 */
  positron: 'https://tiles.openfreemap.org/styles/positron',
  /** 彩色底图（重绘后仍偏干净） */
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  /** Carto 深色：地貌更干净，适合节目包装 */
  cartoDark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  /** Carto 浅色 */
  cartoPositron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  /** 推荐：浅色卡通欢乐风 */
  show: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  cute: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
} as const;

export type MapStylePreset = keyof typeof MAP_STYLES;

/**
 * 隐藏底图全部文字标注（城市/道路/POI 等），只保留我们自己的起终点与国家名。
 */
export function hideBasemapLabels(map: {
  getStyle: () => { layers?: Array<{ id: string; type: string }> };
  setLayoutProperty: (layerId: string, name: string, value: unknown) => void;
}): void {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    try {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    } catch {
      /* ignore */
    }
  }
}

const HIDE_LAYER_RE =
  /road|street|highway|transport|transit|railway|subway|rail|bridge|tunnel|building|house|path|pedestrian|aeroway|runway|pier|ferry|motorway|trunk|primary|secondary|tertiary|residential|service|track|cycle|footway|steps|poi|label|place_|housenumber|mountain|peak|contour|hillshade|landcover_grass|landcover_wood|park|pitch|sport|cemetery|industrial|commercial|hospital|school|university|zoo|attraction/i;

const WATER_RE = /water|ocean|sea|lake|river|bay/i;
const LAND_RE = /land|earth|background|landcover|landuse|grass|wood|sand|glacier/i;
const BOUNDARY_RE = /boundary|border|admin|country|disputed|coastline/i;

type StyleMap = {
  getStyle: () => {
    layers?: Array<{ id: string; type: string; paint?: Record<string, unknown> }>;
  };
  setLayoutProperty: (layerId: string, name: string, value: unknown) => void;
  setPaintProperty: (layerId: string, name: string, value: unknown) => void;
};

/**
 * 年轻人向浅色卡通底图：奶油陆地 + 糖果蓝水域 + 粉色国境，去掉道路杂讯。
 */
export function restyleBasemapForShow(map: StyleMap): void {
  const style = map.getStyle();
  if (!style?.layers) return;

  const tryPaint = (id: string, prop: string, value: unknown) => {
    try {
      map.setPaintProperty(id, prop, value);
    } catch {
      /* layer may not support this paint prop */
    }
  };
  const tryLayout = (id: string, prop: string, value: unknown) => {
    try {
      map.setLayoutProperty(id, prop, value);
    } catch {
      /* ignore */
    }
  };

  for (const layer of style.layers) {
    const id = layer.id;
    const type = layer.type;

    if (type === 'symbol') {
      tryLayout(id, 'visibility', 'none');
      continue;
    }

    if (HIDE_LAYER_RE.test(id) && !BOUNDARY_RE.test(id) && !WATER_RE.test(id)) {
      tryLayout(id, 'visibility', 'none');
      continue;
    }

    if (type === 'background') {
      tryPaint(id, 'background-color', '#FFF4E8');
      continue;
    }

    if (WATER_RE.test(id)) {
      if (type === 'fill') {
        tryPaint(id, 'fill-color', '#8ED6F0');
        tryPaint(id, 'fill-opacity', 1);
      } else if (type === 'line') {
        tryPaint(id, 'line-color', '#6BC4E8');
        tryPaint(id, 'line-opacity', 0.55);
        tryPaint(id, 'line-width', 0.8);
      }
      continue;
    }

    if (BOUNDARY_RE.test(id)) {
      if (type === 'line') {
        tryPaint(id, 'line-color', 'rgba(255, 107, 157, 0.7)');
        tryPaint(id, 'line-opacity', 1);
        tryPaint(id, 'line-width', 2.2);
      } else if (type === 'fill') {
        tryPaint(id, 'fill-color', '#FFE0C2');
        tryPaint(id, 'fill-opacity', 0.25);
      }
      continue;
    }

    if (LAND_RE.test(id) || type === 'fill') {
      if (type === 'fill') {
        tryPaint(id, 'fill-color', '#FFE0C2');
        tryPaint(id, 'fill-opacity', 1);
        tryPaint(id, 'fill-outline-color', 'rgba(255,140,120,0.15)');
      }
      continue;
    }

    if (type === 'line') {
      tryPaint(id, 'line-opacity', 0.1);
      tryPaint(id, 'line-color', 'rgba(255,150,130,0.35)');
    }
  }
}


/** 根据坐标或 meta 解析中文国名 */
export function resolveCountryLabels(
  origin: LngLat,
  destination: LngLat,
  meta?: {
    originCountry?: string;
    destinationCountry?: string;
  },
): { originCountryLabel: string; destinationCountryLabel: string; sameCountry: boolean } {
  const o =
    (meta?.originCountry &&
      COUNTRIES.find(
        (c) => c.id === meta.originCountry || c.label === meta.originCountry,
      )) ||
    detectCountry(origin[0], origin[1]);
  const d =
    (meta?.destinationCountry &&
      COUNTRIES.find(
        (c) =>
          c.id === meta.destinationCountry || c.label === meta.destinationCountry,
      )) ||
    detectCountry(destination[0], destination[1]);

  const originCountryLabel = o?.label || '未知';
  const destinationCountryLabel = d?.label || '未知';
  return {
    originCountryLabel,
    destinationCountryLabel,
    sameCountry: Boolean(o && d && o.id === d.id),
  };
}

/** @deprecated 保留兼容；现已改为隐藏底图文字 */
export function preferChineseLabels(map: {
  getStyle: () => { layers?: Array<{ id: string; type: string; layout?: Record<string, unknown> }> };
  setLayoutProperty: (layerId: string, name: string, value: unknown) => void;
}): void {
  hideBasemapLabels(map);
}

