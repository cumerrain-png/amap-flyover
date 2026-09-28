import React from 'react';
import { createRoot } from 'react-dom/client';
import { Player } from '@remotion/player';
import { MapFlyover } from './MapFlyover';
import type { RouteGeoJSON } from './MapFlyover';
import geojsonRaw from '../data/route.geojson?raw';

const route = JSON.parse(geojsonRaw) as RouteGeoJSON;

/**
 * 综艺向包装：旅行节目信息层 + 霓虹航线
 * 时长约 8.5s（255 帧 @ 30fps）
 *
 * mapStyle: 'cute' | 'show' | 'positron' | 'cartoPositron' | 'dark' | 'liberty'
 */
const App: React.FC = () => {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        background: '#FFF4E8',
      }}
    >
      <Player
        component={MapFlyover}
        durationInFrames={255}
        fps={30}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{ width: '100%', height: '100%' }}
        inputProps={{
          geojson: route,
          originLabel: '北京',
          destinationLabel: '上海',
          markerEmoji: '✈️',
          planeSize: 96,
          labelFontSize: 44,
          endpointIconSize: 60,
          // 浅色卡通贴纸风（加粗描边）
          mapStyle: 'cute',
          // planeImageSrc: '/plane.png',
          // originImageSrc: '/origin.png',
          // destinationImageSrc: '/destination.png',
        }}
        controls
        autoPlay
        loop
      />
    </div>
  );
};

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('缺少 #root 节点');
}

createRoot(rootEl).render(<App />);

export default App;
