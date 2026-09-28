# 高德地图 API 速查（amap-flyover）

## 1. 驾车路径规划 v5

### 请求地址

```
https://restapi.amap.com/v5/direction/driving
```

### 必需参数

| 参数 | 说明 |
|------|------|
| `key` | 高德 Web 服务 API Key（来自环境变量 `AMAP_KEY`） |
| `origin` | 起点：`经度,纬度`，小数点不超过 6 位 |
| `destination` | 终点：`经度,纬度`，小数点不超过 6 位 |

### 示例 URL

```
https://restapi.amap.com/v5/direction/driving?origin=116.397428,39.90923&destination=121.473701,31.230416&show_fields=polyline&key=YOUR_KEY
```

> **重要**：v5 默认不返回轨迹点，必须加 `show_fields=polyline`，否则 `steps[].polyline` 为空。

### 坐标系

返回坐标为 **GCJ-02（国测局坐标）**。进入 MapLibre 前必须转为 **WGS-84**：

```js
coordtransform.gcj02towgs84(lng, lat)
```

### 成功判定

- `status === '1'`（字符串）表示成功
- 失败时抛出包含 `info` 字段的错误

### 提取路线坐标

```js
const polyline = data.route.paths[0].steps
  .flatMap((step) => step.polyline.split(';'))
  .map((p) => p.split(',').map(Number));
// 结果: [[lng, lat], ...]  GCJ-02
```

`polyline` 格式：`"lng,lat;lng,lat;..."`，分号分隔点，逗号分隔经纬度。

### 常用可选参数

| 参数 | 说明 |
|------|------|
| `strategy` | 驾车策略（具体取值见高德文档） |
| `show_fields` | 扩展返回字段 |

---

## 2. 地理编码（地址 → 经纬度）

### 请求地址

```
https://restapi.amap.com/v3/geocode/geo
```

### 必需参数

| 参数 | 说明 |
|------|------|
| `key` | 高德 Web 服务 API Key |
| `address` | 结构化地址，如 `北京市朝阳区`、`上海火车站` |

### 示例

```
https://restapi.amap.com/v3/geocode/geo?address=北京&key=YOUR_KEY
```

### 解析结果

```js
// data.geocodes[0].location => "116.397428,39.90923"
const [lng, lat] = data.geocodes[0].location.split(',').map(Number);
```

返回同样是 **GCJ-02**。路径规划接口直接吃 GCJ-02；仅在写入 MapLibre / GeoJSON 前做 WGS-84 转换。

### 成功判定

- `status === '1'`
- `geocodes` 非空

---

## 3. 逆地理编码（可选）

```
https://restapi.amap.com/v3/geocode/regeo?location={lng},{lat}&key={AMAP_KEY}
```

用于把经纬度显示成可读地址，本 Skill 默认不调用。

---

## 4. Key 与配额

- 在 [高德开放平台](https://console.amap.com/) 创建「Web 服务」类型 Key
- **禁止**把 Key 写进仓库或源码；只用环境变量 `AMAP_KEY`
- 注意日配额与 QPS，批量生成路线时加间隔

---

## 5. 本仓库脚本对照

| 脚本 | API |
|------|-----|
| `scripts/geocode.js` | `/v3/geocode/geo` |
| `scripts/fetchAmapRoute.js` | `/v5/direction/driving` |
| `scripts/convertCoords.js` | 本地 `coordtransform`（无网络） |
| `scripts/generateGeoJSON.js` | 串联以上，输出 `data/route.geojson` |
