const coordtransform = require('coordtransform');

/**
 * 将 GCJ-02 坐标数组批量转换为 WGS-84
 * @param {number[][]} coords - [[lng, lat], ...] GCJ-02
 * @returns {number[][]} [[lng, lat], ...] WGS-84
 */
function convertCoords(coords) {
  if (!Array.isArray(coords) || coords.length === 0) {
    throw new Error('convertCoords: coords 必须是非空数组');
  }

  return coords.map(([lng, lat], i) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new Error(`convertCoords: 第 ${i} 个坐标无效: ${lng},${lat}`);
    }
    const [wgsLng, wgsLat] = coordtransform.gcj02towgs84(lng, lat);
    return [wgsLng, wgsLat];
  });
}

module.exports = { convertCoords };
