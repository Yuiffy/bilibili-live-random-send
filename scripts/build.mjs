import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const header = `// ==UserScript==
// @name         B站直播间定时发随机弹幕（悬浮维护版）
// @namespace    https://live.bilibili.com/暂无主页
// @version      ${version}
// @description  右侧可拖动悬浮入口；随机/顺序定时弹幕、零点打卡、弹幕分组、随机/定时点赞及运行诊断；各直播间设置独立保存，附带原版直播间简化功能。
// @author       Gamyou (original), Yuiffy (maintenance)
// @license      Apache-2.0
// @match        *://live.bilibili.com/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @homepageURL  https://github.com/Yuiffy/bilibili-live-random-send
// @supportURL   https://github.com/Yuiffy/bilibili-live-random-send/issues
// ==/UserScript==

/*
 * Original author: Gamyou. Upstream module 1.7.5.3, Apache-2.0.
 * Modified by Yuiffy on 2026-11-18. All functional code is included below.
 * Source and modification notices: https://github.com/Yuiffy/bilibili-live-random-send
 * Distributed under the Apache License, Version 2.0.
 * License text: https://www.apache.org/licenses/LICENSE-2.0
 */
`;
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.js"],
  outfile: "dist/bilibili-live-random-send.user.js",
  bundle: true,
  minify: false,
  treeShaking: true,
  target: "es2020",
  format: "iife",
  charset: "utf8",
  loader: { ".css": "text" },
  banner: { js: header },
  legalComments: "inline",
});
await writeFile("dist/bilibili-live-random-send.meta.js", header);
