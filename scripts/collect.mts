// Collects every listed posting into data/job-index.json. The server also refreshes it
// automatically when it is older than JOB_INDEX_TTL_HOURS (default 6).
import { indexInfo, refreshIndex } from "../src/lib/job-index";

const started = Date.now();
const timer = setInterval(() => { const info = indexInfo(); if (info.progress) console.log(`… ${info.progress}`); }, 15000);
await refreshIndex(message => console.log(message));
clearInterval(timer);
const info = indexInfo();
console.log(`\n색인 완료: ${info.total.toLocaleString("ko-KR")}건 · ${Math.round((Date.now() - started) / 1000)}초`);
for (const source of info.sources) console.log(`${source.status === "ok" ? "✓" : "✗"} ${source.name} ${source.count}${source.message ? ` (${source.message})` : ""}`);
