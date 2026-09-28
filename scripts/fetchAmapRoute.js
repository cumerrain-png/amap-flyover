/**
 * 调用高德驾车路径规划 v5，返回 GCJ-02 坐标数组 [[lng, lat], ...]
 * @param {{ lng: number, lat: number }} origin
 * @param {{ lng: number, lat: number }} destination
 * @returns {Promise<number[][]>}
 */
async function fetchAmapRoute(origin, destination) {
  const key = process.env.AMAP_KEY;
  if (!key) {
    throw new Error('缺少环境变量 AMAP_KEY，请先设置高德 Web 服务 Key');
  }

  const originStr = `${origin.lng},${origin.lat}`;
  const destStr = `${destination.lng},${destination.lat}`;
  const url =
    `https://restapi.amap.com/v5/direction/driving` +
    `?origin=${encodeURIComponent(originStr)}` +
    `&destination=${encodeURIComponent(destStr)}` +
    `&show_fields=polyline` +
    `&key=${encodeURIComponent(key)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`高德 API HTTP 错误: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (String(data.status) !== '1') {
    throw new Error(`高德路径规划失败: ${data.info || JSON.stringify(data)}`);
  }

  const path = data.route?.paths?.[0];
  if (!path?.steps?.length) {
    throw new Error('高德路径规划返回空路线（paths[0].steps 为空）');
  }

  const polyline = path.steps
    .flatMap((step) => {
      if (!step.polyline) return [];
      return step.polyline.split(';');
    })
    .map((p) => p.split(',').map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

  if (polyline.length < 2) {
    throw new Error(
      '解析后的路线坐标点不足 2 个（请确认请求带有 show_fields=polyline）',
    );
  }

  // 去除连续重复点
  const deduped = [polyline[0]];
  for (let i = 1; i < polyline.length; i++) {
    const [lng, lat] = polyline[i];
    const [plng, plat] = deduped[deduped.length - 1];
    if (lng !== plng || lat !== plat) {
      deduped.push([lng, lat]);
    }
  }

  return deduped;
}

module.exports = { fetchAmapRoute };
