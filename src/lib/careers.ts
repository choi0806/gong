import { deadlinePassed, rankJobs, type Job, type Profile } from "./matching";
import { normalizeJobDate } from "./job-dates";
import { experienceLevel, plainText, record as obj, string as str } from "./job-page";

// Company career sites with public JSON (or Next.js page data). Each is one source in the result.
type ObjectData = Record<string, unknown>;
const arr = (value: unknown): ObjectData[] => Array.isArray(value) ? value.map(obj) : [];
const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;

async function request(url: string, signal: AbortSignal, accept = "application/json") {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]), cache: "no-store", headers: { Accept: accept, "User-Agent": "Mozilla/5.0 (compatible; gongchat)" } });
  if (!response.ok) throw new Error(`source_http_${response.status}`);
  return response;
}

const CITY_REGION: [RegExp, string][] = [
  [/서울|seoul|강남|역삼|성수|신도림|여의도|잠실|을지로|광화문/i, "서울"],
  [/경기|판교|성남|분당|수원|용인|광명|화성|평택|고양|일산|안양|부천|pangyo/i, "경기"],
  [/부산|busan/i, "부산"], [/인천|incheon/i, "인천"], [/대전/, "대전"], [/대구/, "대구"], [/광주/, "광주"], [/울산/, "울산"], [/세종/, "세종"], [/제주|jeju/i, "제주"],
];
// Region filters match on "서울"/"경기"; prefix it when a site only names the city or district.
export function withRegion(location: string): string {
  const clean = location.replace(/\s+/g, " ").trim();
  if (!clean) return "원문 확인";
  const region = CITY_REGION.find(([pattern]) => pattern.test(clean))?.[1];
  return region && !clean.includes(region) ? `${region} ${clean}` : clean;
}
function experienceLabel(minYears: number | undefined, maxYears?: number, anyExperience = false) {
  if (anyExperience) return "경력 무관";
  if (minYears === 0) return maxYears ? `신입~${maxYears}년` : "신입";
  if (minYears !== undefined) return maxYears && maxYears < 100 ? `경력 ${minYears}~${maxYears}년` : `경력 ${minYears}년 이상`;
  return "경력 조건 원문 확인";
}
function yearsIn(text: string): number | undefined {
  if (/신입|경력\s*무관/.test(text)) return 0;
  const match = text.match(/(\d{1,2})\s*(?:년|\+?\s*years?)\s*(?:이상|차\s*이상|or more|of experience|\+)/i);
  return match ? Number(match[1]) : undefined;
}

export function parseToss(data: unknown, checkedAt: string): Job[] {
  const list = obj(data).success;
  if (!Array.isArray(list)) throw new Error("toss_schema_changed");
  return arr(list).flatMap(item => {
    const meta = (prefix: string) => arr(item.metadata).find(m => str(m.name).startsWith(prefix))?.value;
    const location = str(obj(item.location).name);
    if (!num(item.id) || !str(item.title) || meta("커리어페이지 메뉴에") === true || !/seoul|korea|서울|부산|busan|판교/i.test(location)) return [];
    const dueAt = normalizeJobDate(meta("커리어페이지 채용공고 클로징 일자"));
    if (deadlinePassed(dueAt)) return [];
    const description = plainText(str(meta("Job Description")).replace(/^#+\s*/gm, ""));
    const employment = str(meta("Employment_Type"));
    const minYears = yearsIn(`${item.title} ${description}`);
    const company = str(meta("포지션의 소속")) || "토스";
    return [{ id: `toss-${item.id}`, company, title: str(item.title).trim(), source: "토스 채용", url: `https://toss.im/career/job-detail?gh_jid=${item.id}`, location: withRegion(location.replace(/seoul/i, "서울").replace(/busan/i, "부산")), level: experienceLevel(`${item.title} ${employment === "인턴" ? "인턴" : ""} ${minYears ? "경력" : ""}`, minYears), minYears, experience: experienceLabel(minYears), skills: [], description: description || str(item.title), category: str(meta("커리어페이지 노출 Job Category")), dueAt, postedAt: normalizeJobDate(item.first_published), checkedAt, verification: "detail" }];
  });
}

export function parseKakao(data: unknown, checkedAt: string): Job[] {
  const list = obj(data).jobList;
  if (!Array.isArray(list)) throw new Error("kakao_schema_changed");
  return arr(list).flatMap(item => {
    const id = str(item.realId);
    if (!/^[A-Z]-\d+$/.test(id) || !str(item.jobOfferTitle) || item.closeFlag === true || item.privateFlag === true) return [];
    const dueAt = normalizeJobDate(item.endDate) || normalizeJobDate(item.resumeSubmissionEndDatetime);
    if (deadlinePassed(dueAt)) return [];
    const title = str(item.jobOfferTitle).trim();
    const description = [item.introduction, item.workContentDesc, item.qualification, item.jobOfferProcessDesc].map(plainText).filter(Boolean).join("\n\n");
    const minYears = yearsIn(`${title} ${plainText(item.qualification)}`);
    const skills = arr(item.skillSetList).map(s => str(s.skillSetName)).filter(Boolean);
    return [{ id: `kakao-${id}`, company: str(item.companyName) || "카카오", title, source: "카카오 채용", url: `https://careers.kakao.com/jobs/${id}`, location: withRegion(str(item.locationName)), level: experienceLevel(`${title} ${str(item.employeeTypeName)}`, minYears), minYears, experience: experienceLabel(minYears), skills, description, category: str(item.jobTypeName), dueAt, postedAt: normalizeJobDate(item.regDate), checkedAt, verification: "detail" }];
  });
}

export function parseNaver(data: unknown, checkedAt: string): Job[] {
  const list = obj(data).list;
  if (!Array.isArray(list)) throw new Error("naver_schema_changed");
  return arr(list).flatMap(item => {
    const id = num(item.annoId), title = str(item.annoSubject).trim();
    if (!id || !title || !/진행/.test(str(item.stateCdNm))) return [];
    const dueAt = normalizeJobDate(item.endYmdTime), startsAt = normalizeJobDate(item.staYmdTime);
    if (deadlinePassed(dueAt)) return [];
    const entry = str(item.entTypeCdNm), employment = str(item.empTypeCdNm);
    const minYears = entry === "신입" || entry === "무관" ? 0 : yearsIn(title);
    const level = experienceLevel(`${title} ${entry === "무관" ? "경력 무관" : entry} ${employment}`, minYears);
    return [{ id: `naver-${id}`, company: str(item.sysCompanyCdNm) || "NAVER", title, source: "네이버 채용", url: `https://recruit.navercorp.com/rcrt/view.do?annoId=${id}`, location: "원문 확인", level, minYears, experience: entry === "무관" ? "경력 무관" : entry || "경력 조건 원문 확인", skills: [], description: [title, item.classCdNm, item.subJobCdNm, employment].map(str).filter(Boolean).join("\n"), category: `${str(item.classCdNm)} ${str(item.subJobCdNm)}`.trim(), dueAt, startsAt, checkedAt, verification: "listing" }];
  });
}

export function parseWoowahan(data: unknown, checkedAt: string): Job[] {
  const list = obj(obj(data).data).list;
  if (!Array.isArray(list)) throw new Error("woowahan_schema_changed");
  return arr(list).flatMap(item => {
    const number = str(item.recruitNumber), title = str(item.recruitName).trim();
    if (!/^R\d+$/.test(number) || !title || item.isHidden === true || item.recruitDeleteYn === true || item.isAfterOrEqualEndDay === true) return [];
    const dueAt = item.isUnlimitedEndDate === true ? undefined : normalizeJobDate(item.recruitEndDate);
    if (deadlinePassed(dueAt)) return [];
    const min = num(item.careerRestrictionMinYears), max = num(item.careerRestrictionMaxYears);
    const anyExperience = min === -1 || min === undefined && /무관/.test(title);
    const minYears = anyExperience ? 0 : min !== undefined && min >= 0 ? min : yearsIn(title);
    const experience = experienceLabel(minYears, max !== undefined && max > 0 ? max : undefined, anyExperience);
    return [{ id: `woowahan-${number}`, company: "우아한형제들", title, source: "우아한형제들 채용", url: `https://career.woowahan.com/recruitment/${number}/detail`, location: withRegion(title.match(/\/(서울|부산|대구|광주|대전|인천|울산|경기)/)?.[1] || "") , level: experienceLevel(`${title} ${experience}`, minYears), minYears, experience, skills: [], description: title, dueAt, postedAt: normalizeJobDate(item.recruitOpenDate), checkedAt, verification: "listing" }];
  });
}

function nextData(html: string): ObjectData {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("greeting_schema_changed");
  return obj(JSON.parse(match[1]));
}
const queries = (html: string) => arr(obj(obj(obj(nextData(html).props).pageProps).dehydratedState).queries);

// GreetingHR hosts the career sites of many Korean companies with the same page data.
export function parseGreeting(html: string, host: string, company: string, checkedAt: string): Job[] {
  const openings = queries(html).find(q => Array.isArray(q.queryKey) && q.queryKey[0] === "openings");
  const list = obj(openings?.state).data;
  if (!Array.isArray(list)) throw new Error("greeting_schema_changed");
  return arr(list).flatMap(item => {
    const id = num(item.openingId), title = str(item.title).trim();
    if (!id || !title || item.deploy === false) return [];
    const dueAt = normalizeJobDate(item.dueDate);
    if (deadlinePassed(dueAt)) return [];
    const positions = arr(obj(item.openingJobPosition).openingJobPositions);
    const careers = positions.map(p => obj(p.jobPositionCareer));
    const anyExperience = careers.some(c => c.careerType === "NOT_MATTER");
    const newcomer = careers.some(c => c.careerType === "NEW_COMER");
    const from = careers.map(c => num(c.careerFrom)).filter((n): n is number => n !== undefined);
    const minYears = anyExperience || newcomer ? 0 : from.length ? Math.min(...from) : undefined;
    const intern = positions.some(p => obj(p.jobPositionEmployment).employmentType === "INTERN_WORKER");
    const experience = intern ? "인턴" : newcomer && !anyExperience ? "신입" : experienceLabel(minYears, undefined, anyExperience);
    const places = [...new Set(positions.map(p => str(obj(p.workspacePlace).place) || str(obj(p.workspacePlace).location)).filter(Boolean))];
    const occupations = [...new Set(positions.map(p => str(obj(p.workspaceOccupation).occupation)).filter(Boolean))];
    return [{ id: `greeting-${host}-${id}`, company, title, source: `${company} 채용`, url: `https://${host}/ko/o/${id}`, location: withRegion(places.join(" · ")), level: experienceLevel(`${title} ${experience}`, minYears), minYears, experience, skills: [], description: [title, ...occupations].join("\n"), category: occupations.join(" "), dueAt, postedAt: normalizeJobDate(item.openDate), checkedAt, verification: "listing" }];
  });
}
export function parseGreetingDetail(html: string, job: Job, checkedAt: string): Job | null {
  const query = queries(html).find(q => Array.isArray(q.queryKey) && q.queryKey[1] === "getOpeningById");
  const data = obj(obj(query?.state).data), info = obj(obj(data.data ?? data).openingsInfo);
  if (!info.openingId) return { ...job, verification: "listing" };
  if (str(info.status) !== "OPEN") return null;
  const description = plainText(info.detail);
  const minYears = job.minYears ?? yearsIn(description);
  return { ...job, description: description ? `${job.description}\n\n${description}`.slice(0, 16000) : job.description, minYears, checkedAt, verification: "detail" };
}

export async function greeting(profile: Profile | null, host: string, company: string, signal: AbortSignal): Promise<Job[]> {
  const checkedAt = new Date().toISOString();
  const candidates = parseGreeting(await (await request(`https://${host}/`, signal, "text/html")).text(), host, company, checkedAt);
  if (!profile) return candidates;
  // Only relevant openings are opened for their full description (at most 6 per site).
  const relevant = rankJobs({ ...profile, recentDays: 0 }, candidates).slice(0, 6);
  const details = await Promise.allSettled(relevant.map(async job => parseGreetingDetail(await (await request(job.url, signal, "text/html")).text(), candidates.find(c => c.id === job.id)!, checkedAt)));
  const detailed = new Map(details.flatMap((result, i) => result.status === "fulfilled" ? [[relevant[i].id, result.value] as const] : []));
  return candidates.flatMap(job => detailed.has(job.id) ? (detailed.get(job.id) ? [detailed.get(job.id)!] : []) : [job]);
}

export async function kakao(signal: AbortSignal) {
  const checkedAt = new Date().toISOString(), jobs: Job[] = [];
  await Promise.all(["TECHNOLOGY", "BUSINESS_SERVICES", "DESIGN", "STAFF"].map(async part => {
    for (let page = 1; page <= 4; page++) {
      const data = obj(await (await request(`https://careers.kakao.com/public/api/job-list?${new URLSearchParams({ part, company: "ALL", page: String(page) })}`, signal)).json());
      jobs.push(...parseKakao(data, checkedAt));
      if (page >= (num(data.totalPage) ?? 1)) break;
    }
  }));
  return [...new Map(jobs.map(job => [job.id, job])).values()];
}
export async function naver(signal: AbortSignal) {
  const checkedAt = new Date().toISOString(), jobs: Job[] = [];
  for (let index = 0; index < 100; index += 10) {
    const data = obj(await (await request(`https://recruit.navercorp.com/rcrt/loadJobList.do?${new URLSearchParams({ annoId: "", sw: "", subJobCdArr: "", sysCompanyCdArr: "", empTypeCdArr: "", entTypeCdArr: "", workAreaCdArr: "", firstIndex: String(index) })}`, signal)).json());
    jobs.push(...parseNaver(data, checkedAt));
    if (index + 10 >= (num(data.totalSize) ?? 0)) break;
  }
  return jobs;
}

export const GREETING_SITES: [host: string, company: string][] = [
  ["www.musinsacareers.com", "무신사"], ["kurly.career.greetinghr.com", "컬리"], ["career.oliveyoung.com", "올리브영"],
  ["kakaopay.career.greetinghr.com", "카카오페이"], ["kakaomobility.career.greetinghr.com", "카카오모빌리티"],
  ["career.hyundai-autoever.com", "현대오토에버"], ["11st.career.greetinghr.com", "11번가"], ["zigbang.career.greetinghr.com", "직방"],
  ["myrealtrip.career.greetinghr.com", "마이리얼트립"], ["job.wadiz.io", "와디즈"], ["career.wrtn.io", "뤼튼"],
  ["rebellions.career.greetinghr.com", "리벨리온"], ["career.spartaclub.kr", "팀스파르타"], ["career.spoonlabs.com", "스푼랩스"],
];

export function companyProviders(profile: Profile | null, signal: AbortSignal): { name: string; run: () => Promise<Job[]> }[] {
  return [
    { name: "토스 채용", run: async () => parseToss(await (await request("https://api-public.toss.im/api/v3/ipd-eggnog/career/jobs", signal)).json(), new Date().toISOString()) },
    { name: "카카오 채용", run: () => kakao(signal) },
    { name: "네이버 채용", run: () => naver(signal) },
    { name: "우아한형제들 채용", run: async () => parseWoowahan(await (await request("https://career.woowahan.com/w1/recruits?recruitCampaignSeq=0&page=0&size=100&sort=updateDate%2Cdesc", signal)).json(), new Date().toISOString()) },
    ...GREETING_SITES.map(([host, company]) => ({ name: `${company} 채용`, run: () => greeting(profile, host, company, signal) })),
  ];
}
