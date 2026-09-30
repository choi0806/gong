import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { deadlinePassed, ROLE_RULES, type IndexInfo, type IndexSource, type Job } from "./matching";
import { GREENHOUSE_BOARDS, greenhouse, parseSaramin, wantedJob } from "./providers";
import { companyProviders, parseGreetingDetail } from "./careers";
import { fetchJobPage, parseJobPage, record as obj } from "./job-page";

// A local index of every open posting we can list, so matching runs over the whole
// market instead of the first page of a live search. Listings are collected in the
// background; full descriptions are fetched only for the best matches (enrichJobs).
const indexFile = () => process.env.JOB_INDEX_FILE || path.join(process.cwd(), "data", "job-index.json");
const TTL = (Number(process.env.JOB_INDEX_TTL_HOURS) || 6) * 3600_000;
const SARAMIN_PAGES = Number(process.env.JOB_INDEX_SARAMIN_PAGES) || 30;
const VERSION = 1;

type Group = { source: IndexSource; jobs: Job[] };
type State = { groups: Map<string, Group>; flat: Job[]; updatedAt?: string; loaded?: Promise<void>; running?: Promise<void>; progress?: string };
const holder = globalThis as typeof globalThis & { gongchatIndex?: State };
const state: State = holder.gongchatIndex ??= { groups: new Map(), flat: [] };

const arr = (value: unknown) => Array.isArray(value) ? value.map(obj) : [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function request(url: string, signal: AbortSignal, accept = "application/json") {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), cache: "no-store", headers: { Accept: accept, "User-Agent": "Mozilla/5.0 (compatible; gongchat-indexer)" } });
  if (!response.ok) throw new Error(`source_http_${response.status}`);
  return response;
}

function rebuild() {
  const seen = new Set<string>();
  state.flat = [...state.groups.values()].flatMap(group => group.jobs).filter(job => !seen.has(job.id) && !!seen.add(job.id) && !deadlinePassed(job.dueAt));
}
async function load() {
  try {
    const data = JSON.parse(await readFile(indexFile(), "utf8"));
    if (data?.version !== VERSION || !Array.isArray(data.groups)) return;
    for (const group of data.groups) if (group?.source?.name && Array.isArray(group.jobs)) state.groups.set(group.source.name, group);
    state.updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : undefined;
    rebuild();
  } catch { /* No index yet: the first collection creates it. */ }
}
async function save() {
  const file = indexFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ version: VERSION, updatedAt: state.updatedAt, groups: [...state.groups.values()] }));
  await rename(temp, file);
}
// A failed source keeps its previous listings instead of dropping out of the index.
function store(name: string, jobs: Job[] | Error) {
  const previous = state.groups.get(name);
  const collectedAt = new Date().toISOString();
  if (jobs instanceof Error) state.groups.set(name, { source: { name, status: "failed", count: previous?.jobs.length ?? 0, collectedAt: previous?.source.collectedAt ?? collectedAt, message: "수집 실패 · 이전 수집 결과 유지" }, jobs: previous?.jobs ?? [] });
  else state.groups.set(name, { source: { name, status: "ok", count: jobs.length, collectedAt }, jobs });
  rebuild();
}

export async function collectWanted(signal: AbortSignal, onPage?: (count: number) => void): Promise<Job[]> {
  const checkedAt = new Date().toISOString(), jobs: Job[] = [];
  const tagQuery = new Map(ROLE_RULES.filter(rule => rule.wantedTag && rule.wantedTag !== 518 && rule.wantedTag !== 521).map(rule => [rule.wantedTag!, rule.query]));
  for (let offset = 0; offset < 50000; offset += 100) {
    const data = obj(await (await request(`https://www.wanted.co.kr/api/v4/jobs?${new URLSearchParams({ country: "kr", job_sort: "job.latest_order", years: "-1", locations: "all", limit: "100", offset: String(offset) })}`, signal)).json());
    if (!Array.isArray(data.data)) throw new Error("wanted_schema_changed");
    for (const item of arr(data.data)) {
      const job = wantedJob(item, checkedAt);
      if (!job) continue;
      const categories = arr(item.category_tags).flatMap(tag => tagQuery.get(tag.id as number) ?? []);
      jobs.push({ ...job, category: [job.category, ...categories].filter(Boolean).join(" ") });
    }
    onPage?.(jobs.length);
    if (data.data.length < 100 || !obj(data.links).next) break;
    await delay(250);
  }
  return jobs;
}

export async function collectSaramin(queries: string[], pages: number, signal: AbortSignal, onPage?: (count: number) => void): Promise<Job[]> {
  const checkedAt = new Date().toISOString(), jobs = new Map<string, Job>();
  for (const query of queries) {
    for (let page = 1; page <= pages; page++) {
      const html = await (await request(`https://www.saramin.co.kr/zf_user/search/recruit?${new URLSearchParams({ searchword: query, recruitSort: "reg_dt", recruitPageCount: "100", recruitPage: String(page) })}`, signal, "text/html")).text();
      for (const job of parseSaramin(html, checkedAt)) if (!jobs.has(job.id)) jobs.set(job.id, job);
      onPage?.(jobs.size);
      if ((html.match(/class="item_recruit"/g) || []).length < 100) break;
      await delay(600);
    }
  }
  return [...jobs.values()];
}

export async function refreshIndex(log: (message: string) => void = () => {}): Promise<void> {
  if (state.running) return state.running;
  state.running = (async () => {
    const signal = AbortSignal.timeout(60 * 60_000);
    const counts: Record<string, number> = {};
    const report = (name: string, count: number) => { counts[name] = count; state.progress = Object.entries(counts).map(([n, c]) => `${n} ${c.toLocaleString("ko-KR")}건`).join(" · "); };
    const run = async (name: string, task: () => Promise<Job[]>) => {
      try { const jobs = await task(); store(name, jobs); report(name, jobs.length); log(`${name}: ${jobs.length}`); }
      catch (cause) { store(name, cause instanceof Error ? cause : new Error(String(cause))); log(`${name}: failed (${cause instanceof Error ? cause.message : cause})`); }
    };
    const queries = [...new Set(ROLE_RULES.map(rule => rule.query))];
    await Promise.all([
      run("원티드", () => collectWanted(signal, count => report("원티드", count))),
      run("사람인", () => collectSaramin(queries, SARAMIN_PAGES, signal, count => report("사람인", count))),
      (async () => {
        for (const [board, company] of GREENHOUSE_BOARDS) await run(`${company} 채용`, () => greenhouse(board, company, signal));
        for (const provider of companyProviders(null, signal)) await run(provider.name, provider.run);
      })(),
    ]);
    state.updatedAt = new Date().toISOString();
    await save();
  })().finally(() => { state.running = undefined; state.progress = undefined; });
  return state.running;
}

// Loads the saved index and starts a background refresh when it is stale. Never waits for collection.
export async function indexedJobs(): Promise<Job[]> {
  await (state.loaded ??= load());
  const age = state.updatedAt ? Date.now() - Date.parse(state.updatedAt) : Infinity;
  if (age > TTL && !state.running && process.env.JOB_INDEX_AUTO !== "0") refreshIndex().catch(() => { /* Status shows failed sources. */ });
  return state.flat;
}
export function indexInfo(): IndexInfo {
  return { total: state.flat.length, updatedAt: state.updatedAt, collecting: !!state.running, progress: state.progress, sources: [...state.groups.values()].map(group => group.source) };
}

// Custom roles outside the collected categories get their own deeper Saramin crawl, kept in the index.
export async function collectKeyword(query: string, signal: AbortSignal): Promise<Job[]> {
  const name = `사람인 · ${query}`;
  const existing = state.groups.get(name);
  if (existing && Date.now() - Date.parse(existing.source.collectedAt) < TTL) return existing.jobs;
  const jobs = await collectSaramin([query], 5, signal);
  store(name, jobs);
  const custom = [...state.groups.keys()].filter(key => key.startsWith("사람인 · "));
  if (custom.length > 30) { state.groups.delete(custom[0]); rebuild(); }
  save().catch(() => { /* The in-memory index still has the result. */ });
  return jobs;
}

// Listing rows are short; open the original posting for the top matches and remember the result.
export async function enrichJobs(jobs: Job[], signal: AbortSignal, max = 20): Promise<Job[]> {
  const targets = jobs.filter(job => job.verification !== "detail" && (job.id.startsWith("wanted-") || job.id.startsWith("saramin-") || job.id.startsWith("greeting-"))).slice(0, max);
  const replaced = new Map<string, Job | null>();
  for (let i = 0; i < targets.length; i += 10) {
    const results = await Promise.allSettled(targets.slice(i, i + 10).map(async job => {
      const checkedAt = new Date().toISOString();
      if (job.id.startsWith("wanted-")) {
        const detail = wantedJob(obj(obj(await (await request(`https://www.wanted.co.kr/api/v4/jobs/${job.id.slice(7)}`, signal)).json()).job), checkedAt);
        return detail ? { ...job, ...detail, category: job.category, postedAt: job.postedAt ?? detail.postedAt, verification: "detail" as const } : null;
      }
      if (job.id.startsWith("greeting-")) return parseGreetingDetail(await (await request(job.url, signal, "text/html")).text(), job, checkedAt);
      const page = await fetchJobPage(job.url, signal);
      return parseJobPage(page.html, page.url, checkedAt, job);
    }));
    results.forEach((result, index) => { if (result.status === "fulfilled") replaced.set(targets[i + index].id, result.value); });
  }
  for (const group of state.groups.values()) if (group.jobs.some(job => replaced.has(job.id))) group.jobs = group.jobs.flatMap(job => !replaced.has(job.id) ? [job] : replaced.get(job.id) ? [replaced.get(job.id)!] : []);
  if (replaced.size) rebuild();
  return jobs.flatMap(job => !replaced.has(job.id) ? [job] : replaced.get(job.id) ? [replaced.get(job.id)!] : []);
}
