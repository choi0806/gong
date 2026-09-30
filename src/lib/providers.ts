import { load } from "cheerio";
import { deadlinePassed, rankJobs, ROLE_RULES, type Job, type Level, type Profile, type SearchResult } from "./matching";
import { normalizeJobDate } from "./job-dates";
import { experienceLevel, fetchJobPage, parseJobPage, plainText } from "./job-page";
import { companyProviders, withRegion } from "./careers";
import { searchGemini } from "./gemini";

type ObjectData = Record<string, unknown>;
const obj = (value: unknown): ObjectData => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectData : {};
const arr = (value: unknown): ObjectData[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";
const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;

function selectDetails(profile: Profile, candidates: Job[]) {
  const ranked = rankJobs({ ...profile, recentDays: 0 }, candidates);
  // Lists arrive newest first where supported; do not prioritize stack score over recency.
  return (profile.sort === "latest" ? candidates.filter(job => ranked.some(item => item.id === job.id)) : ranked).slice(0, 16);
}

export { plainText };

async function request(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), cache: "no-store", headers: { Accept: "application/json,text/html;q=0.9" } });
  if (!response.ok) throw new Error(`source_http_${response.status}`);
  return response;
}

export function inferLevel(text: string, minYears?: number): Level {
  return experienceLevel(text, minYears);
}

function yearsLabel(min: number | undefined, max: number | undefined) {
  if (min === 0) return max && max < 100 ? `신입~${max}년` : "신입 지원 가능";
  if (min !== undefined) return max && max < 100 ? `경력 ${min}~${max}년` : `경력 ${min}년 이상`;
  return "경력 조건 원문 확인";
}

export function wantedJob(item: ObjectData, checkedAt: string): Job | null {
  if (item.status !== "active" || item.hidden === true || typeof item.id !== "number" || !str(item.position) || deadlinePassed(str(item.due_time))) return null;
  const min = num(item.annual_from), max = num(item.annual_to), address = obj(item.address), detail = obj(item.detail);
  const description = [detail.main_tasks, detail.requirements, detail.preferred_points, detail.intro].map(plainText).filter(Boolean).join("\n\n");
  const category = arr(item.category_tags).map(t => t.id === 669 ? "프론트엔드" : t.id === 872 ? "백엔드" : "").join(" ");
  return { id: `wanted-${item.id}`, company: str(obj(item.company).name), title: str(item.position), source: "원티드", url: `https://www.wanted.co.kr/wd/${item.id}`, location: [address.location, address.district].filter(Boolean).join(" ") || "원문 확인", level: inferLevel(str(item.position), min), minYears: min, experience: yearsLabel(min, max), skills: arr(item.skill_tags).map(t => str(t.title)).filter(Boolean), description: description || "자세한 업무와 자격 요건은 공고 원문에서 확인해주세요.", dueAt: normalizeJobDate(item.due_time), checkedAt, category, verification: "listing", postedAt: normalizeJobDate(item.datePosted) };
}

async function wanted(profile: Profile, signal: AbortSignal): Promise<Job[]> {
  const rule = ROLE_RULES.find(r => r.name === profile.role);
  if (!rule?.wantedTag) return [];
  const params = new URLSearchParams({ country: "kr", tag_type_ids: String(rule.wantedTag), years: profile.level === "신입" || profile.level === "인턴" ? "0" : "-1", limit: "40", offset: "0", job_sort: "job.latest_order" });
  const checkedAt = new Date().toISOString();
  const candidates: Job[] = [];
  for (let page = 0; page < 3; page++) {
    params.set("offset", String(page * 40));
    const data = obj(await (await request(`https://www.wanted.co.kr/api/v4/jobs?${params}`, signal)).json());
    if (!Array.isArray(data.data)) throw new Error("wanted_schema_changed");
    candidates.push(...arr(data.data).map(item => wantedJob(item, checkedAt)).filter((job): job is Job => !!job));
    if (!obj(data.links).next || data.data.length < 40) break;
  }
  const selected = selectDetails(profile, candidates);
  const jobs: Job[] = [];
  for (let start = 0; start < selected.length; start += 4) {
    const batch = await Promise.allSettled(selected.slice(start, start + 4).map(async candidate => {
      const detail = obj(await (await request(`https://www.wanted.co.kr/api/v4/jobs/${candidate.id.replace("wanted-", "")}`, signal)).json());
      const job = wantedJob(obj(detail.job), checkedAt);
      if (!job) return null;
      try {
        const page = await fetchJobPage(job.url, signal);
        const metadata = parseJobPage(page.html, page.url, checkedAt, job);
        if (!metadata) return null;
        return { ...job, postedAt: metadata.postedAt, startsAt: metadata.startsAt, verification: "detail" as const, deadlineLabel: !job.dueAt && /마감일상시채용/.test(plainText(page.html).replace(/\s/g, "")) ? "상시채용" : undefined };
      } catch { return { ...job, verification: "detail" as const }; }
    }));
    batch.forEach((result, index) => { if (result.status === "fulfilled") { if (result.value) jobs.push(result.value); } else jobs.push(selected[start + index]); });
  }
  return jobs;
}

export function parseJumpit(data: unknown, checkedAt: string): Job[] {
  const result = obj(obj(data).result);
  if (!Array.isArray(result.positions)) throw new Error("jumpit_schema_changed");
  return arr(result.positions).flatMap(item => {
    if (typeof item.id !== "number" || !str(item.title) || deadlinePassed(str(item.closedAt))) return [];
    const min = num(item.minCareer), max = num(item.maxCareer);
    const skills = Array.isArray(item.techStacks) ? item.techStacks.map(plainText).filter(Boolean) : [];
    const location = Array.isArray(item.locations) ? item.locations.filter(x => typeof x === "string").join(" · ") : "원문 확인";
    return [{ id: `jumpit-${item.id}`, company: str(item.companyName), title: str(item.title), source: "점핏", url: `https://jumpit.saramin.co.kr/position/${item.id}`, location, level: item.newcomer === true ? inferLevel(str(item.title), 0) : inferLevel(str(item.title), min), minYears: item.newcomer === true ? 0 : min, experience: item.newcomer === true ? "신입 지원 가능" : yearsLabel(min, max), skills, description: `${plainText(item.jobCategory)}\n사용 기술: ${skills.join(", ")}`, category: str(item.jobCategory), dueAt: normalizeJobDate(item.closedAt), postedAt: normalizeJobDate(item.createdAt), checkedAt, verification: "listing" }];
  });
}

async function jumpit(profile: Profile, signal: AbortSignal) {
  if (!/개발|데이터|기획/.test(profile.role)) return [];
  const keyword = profile.skills[0] || ROLE_RULES.find(r => r.name === profile.role)?.query || profile.role;
  const response = await request(`https://api.jumpit.co.kr/api/positions?${new URLSearchParams({ sort: "reg_dt", keyword, page: "1" })}`, signal);
  return parseJumpit(await response.json(), new Date().toISOString());
}

export function parseJobkorea(html: string, checkedAt: string): Job[] {
  const $ = load(html);
  const cards = $('[data-sentry-component="CardJob"]');
  if (!cards.length && !/검색\s*결과가\s*없|검색된\s*공고가\s*없/.test($.text())) throw new Error("jobkorea_schema_changed");
  return cards.toArray().flatMap(element => {
    const card = $(element), titleLink = card.find('[data-sentry-component="Title"]').first();
    const title = titleLink.text().trim(), href = titleLink.attr("href");
    if (!title || !href) return [];
    let url: URL;
    try { url = new URL(href, "https://www.jobkorea.co.kr"); } catch { return []; }
    if (url.protocol !== "https:" || url.hostname !== "www.jobkorea.co.kr" || !/^\/Recruit\/GI_Read\/\d+$/i.test(url.pathname)) return [];
    const text = card.text().replace(/스크랩/g, "");
    if (/접수\s*마감|모집\s*마감|채용\s*마감|마감된\s*공고/.test(text)) return [];
    const company = card.find('[data-sentry-component="CompanyLogo"] img').attr("alt")?.replace(/\s*로고$/, "") || card.find(".text-typo-b2-16").first().text().trim();
    const chips = card.find('[data-sentry-component="GrayChip"]').toArray().map(chip => $(chip).text().trim());
    const experience = card.find("span.flex-shrink-0.text-gray700").first().text().trim() || "경력 조건 원문 확인";
    const min = experience.match(/(?:경력\s*)?(\d+)\s*년/);
    const minYears = /경력\s*무관|신입/.test(experience) ? 0 : min ? Number(min[1]) : undefined;
    return [{ id: `jobkorea-${url.pathname.split("/").pop()}`, company, title, source: "잡코리아", url: `${url.origin}${url.pathname}`, location: chips[0] || "원문 확인", level: inferLevel(`${title} ${experience}`, minYears), minYears, experience, skills: [], description: `${title}\n${chips.slice(1).join(" · ")}\n${experience}`, category: chips.slice(1).join(" "), checkedAt }];
  });
}

async function jobkorea(profile: Profile, signal: AbortSignal) {
  const query = `${ROLE_RULES.find(r => r.name === profile.role)?.query || profile.role} ${profile.level === "전체" ? "" : profile.level}`.trim();
  const candidates = parseJobkorea(await (await request(`https://www.jobkorea.co.kr/Search/?${new URLSearchParams({ stext: query, ord: "2" })}`, signal)).text(), new Date().toISOString());
  const selected = selectDetails(profile, candidates);
  const jobs: Job[] = [];
  for (let i = 0; i < selected.length; i += 4) {
    const results = await Promise.allSettled(selected.slice(i, i + 4).map(async job => {
      const page = await fetchJobPage(job.url, signal);
      return parseJobPage(page.html, page.url, new Date().toISOString(), job);
    }));
    results.forEach((r, index) => { if (r.status === "fulfilled") { if (r.value) jobs.push(r.value); } else jobs.push({ ...selected[i + index], verification: "listing" }); });
  }
  return jobs;
}

export function parseSaramin(html: string, checkedAt: string): Job[] {
  const $ = load(html), cards = $(".item_recruit");
  if (!cards.length && !/검색\s*결과가\s*없|검색된\s*채용정보가\s*없/.test($.text())) throw new Error("saramin_schema_changed");
  return cards.toArray().flatMap(element => {
    const card = $(element), link = card.find(".job_tit a").first();
    let url: URL;
    try { url = new URL(link.attr("href") || "", "https://www.saramin.co.kr"); } catch { return []; }
    const id = url.searchParams.get("rec_idx");
    if (url.hostname !== "www.saramin.co.kr" || !id || !/^\d+$/.test(id)) return [];
    const title = link.text().trim(), company = card.find(".corp_name").text().trim();
    if (!title || !company) return [];
    const conditions = card.find(".job_condition > span").toArray().map(el => $(el).text().trim());
    const experience = conditions[1] || "경력 조건 원문 확인";
    const minYears = /신입|경력\s*무관/.test(experience) ? 0 : Number(experience.match(/(\d+)\s*년/)?.[1]) || undefined;
    const dateText = card.find(".job_date .date").text().trim();
    if (/^마감$|접수\s*마감/.test(dateText)) return [];
    const day = card.find(".job_day").text();
    const date = day.match(/등록일\s*(\d{2})\/(\d{2})\/(\d{2})/);
    // A month/day deadline has no reliable year: keep the source label, not an invented date.
    return [{ id: `saramin-${id}`, title, company, source: "사람인", url: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${id}`, location: conditions[0] || "원문 확인", level: inferLevel(`${title} ${experience} ${conditions.slice(2).join(" ")}`, minYears), minYears, experience, skills: [], description: `${title}\n${conditions.join(" · ")}\n${card.find(".job_sector").text().trim()}`, postedAt: date ? normalizeJobDate(`20${date[1]}-${date[2]}-${date[3]}`) : undefined, deadlineLabel: dateText || undefined, checkedAt, verification: "listing" as const }];
  });
}
async function saramin(profile: Profile, signal: AbortSignal) {
  const query = `${ROLE_RULES.find(r => r.name === profile.role)?.query || profile.role} ${profile.level === "전체" ? "" : profile.level}`.trim();
  const params = new URLSearchParams({ searchword: query, recruitSort: "reg_dt", recruitPageCount: "40" });
  const candidates = parseSaramin(await (await request(`https://www.saramin.co.kr/zf_user/search/recruit?${params}`, signal)).text(), new Date().toISOString());
  const selected = selectDetails(profile, candidates);
  const jobs: Job[] = [];
  for (let i = 0; i < selected.length; i += 4) {
    const responses = await Promise.allSettled(selected.slice(i, i + 4).map(async job => {
      const page = await fetchJobPage(job.url, signal);
      return parseJobPage(page.html, page.url, new Date().toISOString(), job);
    }));
    responses.forEach((r, index) => { if (r.status === "fulfilled") { if (r.value) jobs.push(r.value); } else jobs.push(selected[i + index]); });
  }
  return jobs;
}

export function parseGreenhouse(data: unknown, board: string, company: string, checkedAt: string): Job[] {
  if (!Array.isArray(obj(data).jobs)) throw new Error("greenhouse_schema_changed");
  return arr(obj(data).jobs).flatMap(item => {
    const location = str(obj(item.location).name);
    if (!/seoul|korea|서울|한국|성남|판교|대한민국/i.test(location) || !num(item.id) || !str(item.title)) return [];
    const metadata = arr(item.metadata);
    const meta = (name: string) => str(metadata.find(m => m.name === name)?.value);
    const dueAt = normalizeJobDate(item.application_deadline) || normalizeJobDate(meta("Valid Through"));
    if (deadlinePassed(dueAt)) return [];
    const description = plainText(item.content);
    const years = description.match(/(\d+)\s*(?:년|\+?\s*years?)\s*(?:이상|or more|of experience)/i);
    const minYears = years ? Number(years[1]) : undefined;
    const explicit = `${str(item.title)} ${meta("Prior Experience")} ${meta("Employment Type")}`;
    return [{ id: `${board}-${item.id}`, company: meta("Corporate") || company, title: str(item.title).trim(), source: `${company} 채용`, url: board === "daangn" ? `https://careers.daangn.com/jobs/role/${item.id}/` : `https://job-boards.greenhouse.io/${board}/jobs/${item.id}`, location: withRegion(location.replace(/Seoul, South Korea|SEOUL|Seoul/gi, "서울")), level: inferLevel(explicit, minYears), minYears, experience: meta("Prior Experience") || (minYears ? `경력 ${minYears}년 이상` : inferLevel(explicit) === "인턴" ? "인턴" : "경력 조건 원문 확인"), skills: [], description, dueAt, checkedAt, verification: "detail", postedAt: normalizeJobDate(item.first_published) }];
  });
}

export const GREENHOUSE_BOARDS: [board: string, company: string][] = [["daangn", "당근"], ["sendbird", "센드버드"], ["moloco", "몰로코"], ["coupang", "쿠팡"], ["krafton", "크래프톤"]];
export async function greenhouse(board: string, company: string, signal: AbortSignal) {
  const data = await (await request(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, signal)).json();
  return parseGreenhouse(data, board, company, new Date().toISOString());
}

// `skip` names sources already covered by a fresh index, so they are not fetched again.
export async function searchLiveJobs(profile: Profile, skip: ReadonlySet<string> = new Set()): Promise<SearchResult> {
  const signal = AbortSignal.timeout(45000);
  const providers = [
    { name: "원티드", run: () => wanted(profile, signal) },
    { name: "잡코리아", run: () => jobkorea(profile, signal) },
    { name: "사람인", run: () => saramin(profile, signal) },
    { name: "점핏", run: () => jumpit(profile, signal) },
    ...GREENHOUSE_BOARDS.map(([board, company]) => ({ name: `${company} 채용`, run: () => greenhouse(board, company, signal) })),
    ...companyProviders(profile, signal),
  ].filter(provider => !skip.has(provider.name)).filter(provider => provider.name === "원티드" ? !!ROLE_RULES.find(rule => rule.name === profile.role)?.wantedTag : provider.name === "점핏" ? /개발|데이터|기획/.test(profile.role) : true);
  const [responses, gemini] = await Promise.all([Promise.allSettled(providers.map(provider => provider.run())), searchGemini(profile, signal)]);
  const sources = responses.map((response, index) => ({ name: providers[index].name, status: response.status === "fulfilled" ? "ok" as const : "failed" as const, count: response.status === "fulfilled" ? response.value.length : 0 }));
  const jobs = rankJobs(profile, [...responses.flatMap(response => response.status === "fulfilled" ? response.value : []), ...gemini.jobs]);
  const failures = sources.filter(source => source.status === "failed");
  return { jobs, sources: [...sources, gemini.source], searchSuggestions: gemini.searchSuggestions, checkedAt: new Date().toISOString(), message: (failures.length === sources.length && gemini.source.status !== "ok" ? "채용 사이트에 연결하지 못했어요. 잠시 후 다시 찾아주세요." : failures.length ? `${failures.slice(0, 3).map(source => source.name).join(", ")}${failures.length > 3 ? ` 등 ${failures.length}개 채널` : ""}에 연결하지 못해 나머지 채널에서 찾았어요.` : jobs.length ? "공개 채용 목록과 확인 가능한 원문에서 찾았어요." : "현재 검색 범위에서 조건에 맞는 공고를 찾지 못했어요.") + " 전체 사이트·전체 공고를 보장하지 않으며, 미확인 접수 기간은 원문 확인이 필요해요." };
}
