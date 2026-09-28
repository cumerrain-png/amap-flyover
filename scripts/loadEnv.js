/**
 * 从项目根目录 .env 加载 KEY=VALUE（不覆盖已有 process.env）
 * 无第三方依赖，避免把 Key 写进源码。
 */
const fs = require('fs');
const path = require('path');

function loadEnv(envPath) {
  const file = envPath || path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;

  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

module.exports = { loadEnv };
