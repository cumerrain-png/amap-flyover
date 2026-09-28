/**
 * 高德地理编码：地址字符串 → { lng, lat }（GCJ-02）
 * @param {string} address
 * @returns {Promise<{ lng: number, lat: number, formatted: string }>}
 */
async function geocode(address) {
  const key = process.env.AMAP_KEY;
  if (!key) {
    throw new Error('缺少环境变量 AMAP_KEY，请先设置高德 Web 服务 Key');
  }

  const url =
    `https://restapi.amap.com/v3/geocode/geo` +
    `?address=${encodeURIComponent(address)}` +
    `&key=${encodeURIComponent(key)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`高德地理编码 HTTP 错误: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (String(data.status) !== '1') {
    throw new Error(`高德地理编码失败: ${data.info || JSON.stringify(data)}`);
  }

  const first = data.geocodes?.[0];
  if (!first?.location) {
    throw new Error(`无法解析地址: ${address}`);
  }

  const [lng, lat] = first.location.split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(`地理编码返回无效坐标: ${first.location}`);
  }

  return {
    lng: Number(lng.toFixed(6)),
    lat: Number(lat.toFixed(6)),
    formatted: first.formatted_address || address,
  };
}

/**
 * 解析输入：地址字符串或 "lng,lat" / {lng,lat}
 * @param {string | { lng: number, lat: number }} input
 */
async function resolvePoint(input) {
  if (input && typeof input === 'object' && 'lng' in input && 'lat' in input) {
    return {
      lng: Number(Number(input.lng).toFixed(6)),
      lat: Number(Number(input.lat).toFixed(6)),
      formatted: `${input.lng},${input.lat}`,
    };
  }

  const str = String(input).trim();
  const coordMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    return {
      lng: Number(Number(coordMatch[1]).toFixed(6)),
      lat: Number(Number(coordMatch[2]).toFixed(6)),
      formatted: str,
    };
  }

  return geocode(str);
}

module.exports = { geocode, resolvePoint };
