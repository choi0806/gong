import { rankJobs, ROLE_RULES, type Job, type Profile, type SearchResult } from "./matching";
import { searchLiveJobs } from "./providers";
import { collectKeyword, enrichJobs, indexedJobs, indexInfo } from "./job-index";
const state = globalThis as typeof globalThis & { gongchatSearch?: { cache: Map<string, { expires: number; result: SearchResult }>; pending: Map<string, Promise<SearchResult>> } };
const { cache, pending } = state.gongchatSearch ??= { cache: new Map(), pending: new Map() };
const RESULT_LIMIT = 200;

async function liveSearch(profile: Profile, skip: ReadonlySet<string>): Promise<SearchResult & { cached: boolean }> {
  const key = JSON.stringify([profile.role, [...profile.skills].sort(), profile.level, profile.location, profile.years, profile.sort, [...skip].sort()]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { ...hit.result, cached: true };
  const active = pending.get(key);
  if (active) return { ...await active, cached: true };
  const task = searchLiveJobs({ ...profile, recentDays: 0 }, skip);
  pending.set(key, task);
  try {
    const result = await task;
    if (result.sources.some(source => source.status === "ok")) {
      if (cache.size >= 50) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + 60000, result });
    }
    return { ...result, cached: false };
  } finally { pending.delete(key); }
}

// Live search gives the freshest first pages; the index covers every collected posting.
export async function searchJobs(profile: Profile): Promise<SearchResult> {
  const signal = AbortSignal.timeout(50000);
  const custom = !ROLE_RULES.some(rule => rule.name === profile.role);
  const index = await indexedJobs();
  // Company career sites change slowly and are fully indexed; job boards still get a live
  // first page so postings from the last few hours are not missed.
  const skip = new Set(indexInfo().sources.filter(source => source.status === "ok" && source.count > 0 && source.name !== "원티드" && source.name !== "사람인").map(source => source.name));
  const [live, extra] = await Promise.all([
    liveSearch(profile, skip),
    custom ? collectKeyword(profile.role, signal).catch(() => [] as Job[]) : Promise.resolve([] as Job[]),
  ]);
  const all = rankJobs(profile, [...live.jobs, ...extra, ...index], Date.now(), Infinity);
  let jobs = all.slice(0, RESULT_LIMIT);
  if (jobs.length) jobs = rankJobs(profile, await enrichJobs(jobs, signal).catch(() => jobs), Date.now(), RESULT_LIMIT);
  // Postings found closed or duplicated while opening their originals no longer count as matches.
  const matched = all.length - (Math.min(all.length, RESULT_LIMIT) - jobs.length);
  const info = indexInfo();
  const coverage = info.total ? `전체 수집 공고 ${info.total.toLocaleString("ko-KR")}건과 실시간 검색에서 조건에 맞는 공고 ${matched.toLocaleString("ko-KR")}건을 찾았어요${matched > RESULT_LIMIT ? ` (관련도 상위 ${RESULT_LIMIT}건 표시)` : ""}.` : info.collecting ? `전체 공고를 처음 수집하는 중이에요${info.progress ? ` (${info.progress})` : ""}. 지금은 실시간 검색 결과만 보여드려요. 몇 분 뒤 다시 찾으면 전체에서 찾아드려요.` : "";
  // A live source that failed just now is still covered when the index holds its listings.
  const indexed = new Set(info.sources.filter(source => source.status === "ok" && source.count > 0).map(source => source.name));
  const failed = live.sources.filter(source => source.status === "failed" && !indexed.has(source.name)).map(source => source.name);
  const message = !jobs.length && (live.jobs.length || index.length) ? "선택한 경력·등록 기간·지역에 맞는 공고가 없어요. 등록일 미확인 공고는 최근 기간 검색에서 제외해요."
    : !info.total ? live.message
    : `${failed.length ? `${failed.slice(0, 3).join(", ")}${failed.length > 3 ? ` 등 ${failed.length}개 채널` : ""}은 지금 연결하지 못했어요. ` : ""}공개 채용 목록 기준이며, 비공개·헤드헌팅 공고와 수집 이후 올라온 공고 일부는 빠질 수 있어요.`;
  return { ...live, jobs: jobs.map(job => job.description.length > 6000 ? { ...job, description: job.description.slice(0, 6000) } : job), matched, index: info, message: [coverage, message].filter(Boolean).join(" ") };
}
