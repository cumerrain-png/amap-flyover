#!/usr/bin/env node
/**
 * 串联路径规划 + 坐标转换，输出 data/route.geojson（WGS-84）
 *
 * 用法:
 *   node scripts/generateGeoJSON.js --origin 北京 --destination 上海
 *   node scripts/generateGeoJSON.js --origin 116.397428,39.90923 --destination 121.473701,31.230416
 *   node scripts/generateGeoJSON.js  # 默认北京 → 上海
 */

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./loadEnv');
loadEnv();
const { fetchAmapRoute } = require('./fetchAmapRoute');
const { convertCoords } = require('./convertCoords');
const { resolvePoint } = require('./geocode');

const MAX_POINTS = 5000;

/** 粗略国家/大洲标记，供地图视野决策（与 templates/geoScope.ts 对齐） */
function guessCountry(lng, lat) {
  if (lng >= 73 && lng <= 135 && lat >= 18 && lat <= 53.5) return 'CN';
  if (lng >= 129 && lng <= 146 && lat >= 30 && lat <= 46) return 'JP';
  if (lng >= -125 && lng <= -66 && lat >= 24 && lat <= 50) return 'US';
  if (lng >= -8.5 && lng <= 2 && lat >= 49.5 && lat <= 61) return 'GB';
  return undefined;
}

function guessContinent(lng, lat) {
  const c = guessCountry(lng, lat);
  if (c === 'CN' || c === 'JP') return 'asia';
  if (c === 'US') return 'north_america';
  if (c === 'GB') return 'europe';
  if (lng >= 25 && lng <= 150 && lat >= -10 && lat <= 56) return 'asia';
  if (lng >= -25 && lng <= 45 && lat >= 34 && lat <= 72) return 'europe';
  if (lng >= -170 && lng <= -50 && lat >= 7 && lat <= 75) return 'north_america';
  return undefined;
}

function parseArgs(argv) {
  const args = { origin: '北京', destination: '上海' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--origin' || a === '-o') {
      args.origin = argv[++i];
    } else if (a === '--destination' || a === '-d') {
      args.destination = argv[++i];
    } else if (a === '--out') {
      args.out = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

/**
 * 坐标点过多时等距抽稀，始终保留首尾
 */
function thinCoords(coords, maxPoints) {
  if (coords.length <= maxPoints) return coords;
  const result = [coords[0]];
  const step = (coords.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}

function buildGeoJSON(wgsCoords, meta = {}) {
  const origin = wgsCoords[0];
  const destination = wgsCoords[wgsCoords.length - 1];

  return {
    type: 'FeatureCollection',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    properties: {
      coordinateSystem: 'WGS-84',
      ...meta,
    },
    features: [
      {
        type: 'Feature',
        properties: { role: 'route' },
        geometry: {
          type: 'LineString',
          coordinates: wgsCoords,
        },
      },
      {
        type: 'Feature',
        properties: { role: 'origin' },
        geometry: {
          type: 'Point',
          coordinates: origin,
        },
      },
      {
        type: 'Feature',
        properties: { role: 'destination' },
        geometry: {
          type: 'Point',
          coordinates: destination,
        },
      },
    ],
  };
}

async function generateGeoJSON(originInput, destinationInput, outPath) {
  const origin = await resolvePoint(originInput);
  const destination = await resolvePoint(destinationInput);

  console.log(`起点: ${origin.formatted} (${origin.lng},${origin.lat})`);
  console.log(`终点: ${destination.formatted} (${destination.lng},${destination.lat})`);

  const gcjCoords = await fetchAmapRoute(origin, destination);
  console.log(`GCJ-02 路线点数: ${gcjCoords.length}`);

  let wgsCoords = convertCoords(gcjCoords);
  if (wgsCoords.length > MAX_POINTS) {
    console.log(`点数超过 ${MAX_POINTS}，进行抽稀...`);
    wgsCoords = thinCoords(wgsCoords, MAX_POINTS);
  }

  const geojson = buildGeoJSON(wgsCoords, {
    originLabel: origin.formatted,
    destinationLabel: destination.formatted,
    pointCount: wgsCoords.length,
    // 视野元数据：前端 resolveMapScope 会读取（也可仅凭坐标推断）
    originCountry: guessCountry(origin.lng, origin.lat),
    destinationCountry: guessCountry(destination.lng, destination.lat),
    originContinent: guessContinent(origin.lng, origin.lat),
    destinationContinent: guessContinent(destination.lng, destination.lat),
  });

  const resolvedOut = path.resolve(
    outPath || path.join(__dirname, '..', 'data', 'route.geojson'),
  );
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  fs.writeFileSync(resolvedOut, JSON.stringify(geojson, null, 2), 'utf8');
  console.log(`已写入: ${resolvedOut}`);

  return geojson;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`用法:
  node scripts/generateGeoJSON.js --origin <地址或lng,lat> --destination <地址或lng,lat>
  环境变量: AMAP_KEY`);
    process.exit(0);
  }

  try {
    await generateGeoJSON(args.origin, args.destination, args.out);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateGeoJSON, buildGeoJSON, thinCoords };
