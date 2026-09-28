---
name: amap-flyover
description: >-
  根据用户给出的起点和终点，生成浅色卡通欢乐风的高德路线飞行动画网页（Remotion Player + MapLibre）。
  当用户说「飞过去」「旅行动画」「路线动画」「飞机从A到B」「高德路线飞越」「amap-flyover」或只报出起点终点要做飞行动画时使用此 Skill。
---

# 高德路线飞行动画（amap-flyover）

用户**只需说出起点和终点**。Agent 负责询问高德 Key、提供地图样式选项（可不选）、生成并启动预览页。

## 用户体验目标

1. 用户：报起点、终点（地址或经纬度均可）
2. Agent：若缺 Key → **直接向用户询问**高德 Web 服务 API Key（禁止猜测、禁止硬编码进仓库）
3. Agent：给出地图样式选项；**用户不选则用默认 `cute`（当前浅色卡通欢乐风）**
4. Agent：生成 `data/route.geojson`，更新 `templates/PlayerApp.tsx`，`npm run dev` 打开预览

## 交互脚本（必须遵守）

### 1. 收集起终点

- 已给出 → 直接用
- 缺一或缺二 → 追问：「请告诉我起点和终点（城市名/地址，或 `经度,纬度`）」

### 2. 询问高德 Key（每次生成前检查）

检查工作区是否已有可用 Key（按优先级）：

1. 环境变量 `AMAP_KEY`
2. 项目根目录 `.env` 中的 `AMAP_KEY`（由 `scripts/loadEnv.js` 读取）

若都没有，**立刻向用户询问**，话术示例：

> 需要高德开放平台的「Web 服务」Key 才能规划路线。请把 Key 发我，或自行设置：
> - PowerShell：`$env:AMAP_KEY="你的Key"`
> - 或写入本项目 `.env`：`AMAP_KEY=你的Key`（已 gitignore）
> 申请地址：https://console.amap.com/

拿到后写入项目 `.env`（勿提交 Git，勿写进 SKILL/源码）。

### 3. 地图样式选项（一次问清，可不选）

向用户展示下列选项（可用编号回复）；**不选 / 说默认 → `cute`**：

| 编号 | `mapStyle` | 说明 |
|------|------------|------|
| 1（默认） | `cute` | 浅色卡通欢乐风（奶油陆 + 糖果蓝水 + 粉国境 + 贴纸 UI） |
| 2 | `show` | 与 cute 相同底图预设（别名） |
| 3 | `positron` / `cartoPositron` | 浅色简洁 |
| 4 | `liberty` | OpenFreeMap 彩色 |
| 5 | `dark` | OpenFreeMap 深色 |
| 6 | `cartoDark` | Carto 深色 |

话术示例：

> 地图样式可选：1 cute（默认卡通欢乐）/ 3 浅色简洁 / 4 彩色 / 5 深色 / 6 Carto 深色。直接回编号，或回车用默认。

可选追问（非必须，用户未提则跳过）：

- 自定义飞机图：放到 `public/plane.png`，`planeImageSrc: '/plane.png'`
- 显示名：默认用起终点短名（如「北京」「上海」）

### 4. 生成与启动

在 Skill 项目根目录（本仓库 `amap-flyover/`，或复制到工作区后的同名目录）执行：

```bash
npm install   # 若尚未安装

# Windows PowerShell 若未写 .env：
$env:AMAP_KEY="用户提供的Key"

node scripts/generateGeoJSON.js --origin "<起点>" --destination "<终点>"
```

然后编辑 `templates/PlayerApp.tsx` 的 `inputProps`：

- `originLabel` / `destinationLabel`：短中文名
- `mapStyle`：用户所选，默认 `'cute'`
- `geojson`：继续从 `../data/route.geojson` 读取（生成脚本已覆盖该文件）

启动：

```bash
npm run dev
```

把本地预览地址（通常 `http://localhost:5173/`）发给用户。

## 成品形态

- 浅色卡通贴纸风 UI：顶栏标题、底栏进度与公里数、抵达贴纸
- 平滑示意弧线（非真实道路折线）+ 霓虹生长 + 飞机（可自定义图）
- 视野：同国家→国家放大；同大洲→大洲；否则世界
- 底图隐藏杂地名，只保留起终点名 + 国家名水印
- Remotion `@remotion/player` 嵌入网页（不导出视频）

## 关键硬约束（违反会出严重 Bug）

1. **坐标系**：高德 GCJ-02 → MapLibre 前必须 `gcj02towgs84`（`scripts/convertCoords.js`）
2. **动画**：只用 `useCurrentFrame()` / `interpolate` / `spring`；禁止 CSS transition、`setTimeout`、`requestAnimationFrame`
3. **地图**：`interactive: false`，`fadeDuration: 0`；`delayRender` / `continueRender` 等 load
4. **Key**：只走环境变量 / `.env`；禁止写进 Git 跟踪文件
5. **路径规划 v5** 必须带 `show_fields=polyline`（已在 `fetchAmapRoute.js`）

## 目录（本 Skill 包）

```
amap-flyover/
├── SKILL.md                 # 本文件
├── README.md
├── package.json
├── scripts/
│   ├── loadEnv.js
│   ├── geocode.js
│   ├── fetchAmapRoute.js
│   ├── convertCoords.js
│   └── generateGeoJSON.js
├── templates/
│   ├── MapFlyover.tsx
│   ├── PlayerApp.tsx
│   ├── geoScope.ts
│   ├── index.html
│   └── vite.config.ts
├── data/route.geojson
└── references/amap-api.md
```

若用户工作区没有本项目：优先 `git clone` 本仓库到工作区，或把本 Skill 目录复制到工作区再执行；不要改 `~/.cursor/skills-cursor/`。

从 GitHub 安装示例：

```bash
git clone https://github.com/cumerrain-png/amap-flyover.git
npx skills add ./amap-flyover
# 或复制到 ~/.cursor/skills/amap-flyover/
```


## Agent 清单

```
- [ ] 起终点已确认
- [ ] AMAP_KEY：已有或已向用户索取并写入 .env / 环境变量
- [ ] 地图样式：用户已选，或默认 cute
- [ ] npm install（如需）
- [ ] node scripts/generateGeoJSON.js --origin … --destination …
- [ ] 更新 PlayerApp.tsx 的 originLabel / destinationLabel / mapStyle
- [ ] npm run dev，回复预览 URL
- [ ] 自查：未把 Key 提交进 Git；坐标已转 WGS-84
```

## 示例对话

**用户：** 北京到成都做个飞行动画  

**Agent：**  
1. 询问 AMAP_KEY（若本地没有）  
2. 给出样式 1–6，说明默认 cute  
3. 生成并启动 → `http://localhost:5173/`

## 附加资料

- API 参数：[references/amap-api.md](references/amap-api.md)
- 用户安装说明：[README.md](README.md)
