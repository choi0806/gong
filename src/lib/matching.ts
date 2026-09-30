export const LEVELS = ["전체", "신입", "경력", "인턴", "프리랜서"] as const;
export type Level = typeof LEVELS[number];
import { dateTime } from "./job-dates";
export type Profile = { role: string; skills: string[]; level: Level; location: string; years?: number; recentDays?: number; sort?: "relevance" | "latest" };
export type Job = {
  id: string; company: string; title: string; source: string; url: string;
  location: string; level: Level; skills: string[]; description: string;
  score?: number; sample?: boolean; experience?: string; minYears?: number;
  dueAt?: string; checkedAt?: string; reason?: string; category?: string;
  postedAt?: string; startsAt?: string; deadlineLabel?: string; verification?: "detail" | "listing";
  stack?: string[]; fit?: Fit;
};
export type Gap = { label: string; kind: "skill" | "qualification" | "document" | "experience" | "benchmark"; preferred?: boolean };
export type ScorePart = { label: string; points: number; max: number; detail: string };
export type BenchmarkRow = { label: string; expected: string; mine: string; met: boolean };
export type Fit = { score: number; matched: string[]; gaps: Gap[]; documents: string[]; documentsStated: boolean; breakdown?: ScorePart[]; benchmark?: { tier: string; family: string; rows: BenchmarkRow[] } };
export type SourceStatus = { name: string; status: "ok" | "failed" | "skipped"; count: number; message?: string };
export type IndexSource = { name: string; status: "ok" | "failed"; count: number; collectedAt: string; message?: string };
export type IndexInfo = { total: number; updatedAt?: string; collecting: boolean; progress?: string; sources: IndexSource[] };
export type SearchResult = { jobs: Job[]; sources: SourceStatus[]; checkedAt: string; message: string; searchSuggestions?: string; cached?: boolean; index?: IndexInfo; matched?: number };
const skillPatterns: [string, RegExp][] = [
  ["React", /\breact(?:\.js)?\b/i], ["TypeScript", /\btypescript\b/i],
  ["JavaScript", /\bjavascript\b/i], ["Next.js", /\bnext\.?js\b/i],
  ["Vue", /\bvue(?:\.js)?\b/i], ["HTML", /\bhtml\b/i], ["CSS", /\bcss\b/i],
  ["Node.js", /\bnode\.?js\b/i], ["Python", /\bpython\b|파이썬/i],
  ["Java", /\bjava\b/i], ["Spring", /\bspring\b/i], ["SQL", /\bsql\b|mysql|postgresql/i],
  ["AWS", /\baws\b/i], ["Docker", /\bdocker\b/i], ["Kotlin", /\bkotlin\b/i],
  ["Swift", /\bswift\b/i], ["Flutter", /\bflutter\b/i],
  ["Figma", /\bfigma\b|피그마/i], ["UI/UX", /\bux\b|\bui\b|사용자 경험/i],
  ["Photoshop", /photoshop|포토샵/i], ["Illustrator", /illustrator|일러스트레이터/i],
  ["브랜딩", /branding|브랜딩/i], ["콘텐츠", /content|콘텐츠|컨텐츠/i],
  ["GA4", /\bga4\b|google analytics|구글 애널리틱스/i], ["SEO", /\bseo\b|검색 최적화/i],
  ["Excel", /\bexcel\b|엑셀/i], ["데이터 분석", /데이터 분석|data analys/i],
  ["서비스 기획", /서비스 기획|product manag|프로덕트 매니저/i],
  ["영상 편집", /영상 편집|premiere|after effects/i], ["고객 관리", /고객 관리|\bcrm\b/i],
  ["AutoCAD", /\bautocad\b|오토캐드/i], ["SolidWorks", /solidworks/i],
];
export const ROLE_RULES: { name: string; pattern: RegExp; related: string[]; wantedTag?: number; query: string }[] = [
  { name: "프론트엔드 개발자", pattern: /프론트.?엔드|front.?end|웹\s*개발/i, related: ["React", "TypeScript", "JavaScript", "Next.js", "Vue", "HTML", "CSS"], wantedTag: 669, query: "프론트엔드" },
  { name: "백엔드 개발자", pattern: /백.?엔드|back.?end|서버\s*개발/i, related: ["Java", "Spring", "Node.js", "AWS", "Docker"], wantedTag: 872, query: "백엔드" },
  { name: "프로덕트 디자이너", pattern: /프로덕트\s*디자이너|product\s*design|ux.?ui|ui.?ux|웹\s*디자이너/i, related: ["Figma", "UI/UX"], wantedTag: 521, query: "UX 디자이너" },
  { name: "데이터 분석가", pattern: /데이터\s*분석|data\s*analyst|data\s*scientist/i, related: ["Python", "SQL", "데이터 분석"], wantedTag: 518, query: "데이터 분석" },
  { name: "마케터", pattern: /마케터|마케팅|marketer|marketing/i, related: ["GA4", "SEO", "콘텐츠", "고객 관리"], wantedTag: 523, query: "마케팅" },
  { name: "서비스 기획자", pattern: /서비스\s*기획|product\s*manager|프로덕트\s*매니저/i, related: ["서비스 기획"], wantedTag: 507, query: "서비스 기획" },
  { name: "모바일 개발자", pattern: /모바일\s*(?:개발|엔지니어)|\bandroid\b|\bios\b|\bflutter\b|react\s*native/i, related: ["Swift", "Kotlin", "Flutter"], wantedTag: 518, query: "모바일 개발" },
  { name: "그래픽 디자이너", pattern: /그래픽\s*디자인|그래픽\s*디자이너|시각\s*디자인|graphic\s*design/i, related: ["Photoshop", "Illustrator", "브랜딩"], wantedTag: 521, query: "그래픽 디자이너" },
  { name: "영상 편집자", pattern: /영상\s*편집|영상\s*제작|video\s*edit/i, related: ["영상 편집"], wantedTag: 521, query: "영상 편집" },
  { name: "영업", pattern: /영업|세일즈|sales/i, related: ["고객 관리"], wantedTag: 511, query: "영업" },
  { name: "인사 담당자", pattern: /인사\s*담당|인사\s*관리|human\s*resources|recruiter/i, related: [], wantedTag: 530, query: "인사" },
  { name: "회계 담당자", pattern: /회계|세무|accountant/i, related: ["Excel"], wantedTag: 508, query: "회계" },
  { name: "기계 설계", pattern: /기계\s*설계|mechanical\s*engineer/i, related: ["AutoCAD", "SolidWorks"], query: "기계 설계" },
  { name: "간호사", pattern: /간호사|간호학|registered\s*nurse/i, related: [], query: "간호사" },
  { name: "건축 설계", pattern: /건축\s*설계|건축사|architectural/i, related: ["AutoCAD"], query: "건축 설계" },
  { name: "고객 상담", pattern: /고객\s*상담|고객\s*지원|customer\s*support/i, related: ["고객 관리"], query: "고객 상담" },
];
export function analyzeText(text: string): Profile {
  const skills = skillPatterns.filter(([, pattern]) => pattern.test(text)).map(([skill]) => skill);
  const ranked = ROLE_RULES.map(rule => ({ name: rule.name, score: (rule.pattern.test(text) ? 6 : 0) + rule.related.filter(s => skills.includes(s)).length })).sort((a, b) => b.score - a.score);
  const yearsMatch = text.match(/(?:총\s*)?(?:경력|experience)\s*[:：]?\s*(\d+)\s*(?:년|years?)/i) || text.match(/(\d+)\s*년\s*차/);
  const years = yearsMatch ? Number(yearsMatch[1]) : undefined;
  const level: Level = /프리랜서\s*(?:지원|희망)|freelance\s*(?:developer|designer)/i.test(text) ? "프리랜서" : /인턴\s*(?:지원|희망)/.test(text) ? "인턴" : years && years > 0 ? "경력" : /신입|취업 준비|졸업 예정|entry.level/i.test(text) ? "신입" : "전체";
  return { role: ranked[0].score > 0 ? ranked[0].name : "", skills: skills.slice(0, 10), level, location: "전국", ...(years !== undefined ? { years } : {}) };
}
export function detectSkills(text: string): string[] {
  return skillPatterns.filter(([, pattern]) => pattern.test(text)).map(([skill]) => skill);
}
export function skillRegex(skill: string): RegExp | undefined {
  return skillPatterns.find(([name]) => name.toLowerCase() === skill.toLowerCase())?.[1];
}
export function hasSkill(skill: string, text: string): boolean {
  const known = skillPatterns.find(([name]) => name.toLowerCase() === skill.toLowerCase());
  if (known) return known[1].test(text);
  const escaped = skill.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !!escaped && new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?:$|[^a-z0-9+#])`, "i").test(text);
}
export function roleMatches(role: string, text: string): boolean {
  const rule = ROLE_RULES.find(r => r.name === role);
  return rule ? rule.pattern.test(text) : text.replace(/\s/g, "").toLowerCase().includes(role.replace(/\s/g, "").toLowerCase());
}
export function matchScore(profile: Profile, text: string): { score: number; skills: string[] } {
  const skills = profile.skills.filter(s => hasSkill(s, text));
  return { score: Math.round((skills.length + Number(roleMatches(profile.role, text))) / (profile.skills.length + 1) * 100), skills };
}
export function deadlinePassed(value?: string, now = Date.now()): boolean {
  const time = dateTime(value, true);
  return Number.isFinite(time) && time <= now;
}
export function rankJobs(profile: Profile, candidates: Job[], now = Date.now(), limit = 60): Job[] {
  const seen = new Set<string>();
  return candidates.flatMap(job => {
    if (job.sample || deadlinePassed(job.dueAt, now) || dateTime(job.startsAt) > now) return [];
    if (profile.recentDays && (!Number.isFinite(dateTime(job.postedAt)) || dateTime(job.postedAt) < now - profile.recentDays * 86400000 || dateTime(job.postedAt) > now)) return [];
    if (profile.level === "인턴" && job.level !== "인턴") return [];
    if (profile.level === "신입" && (job.level === "인턴" || job.level === "프리랜서" || (job.level === "전체" && job.minYears !== 0))) return [];
    if (profile.level === "경력" && job.level !== "경력" && !(job.level === "전체" && job.minYears !== undefined)) return [];
    if (profile.location && profile.location !== "전국" && !job.location.includes(profile.location)) return [];
    if ((profile.level === "신입" || profile.level === "인턴") && (job.level === "경력" || (job.minYears ?? 0) > 0)) return [];
    if (profile.years !== undefined && (job.minYears ?? 0) > profile.years) return [];
    if (profile.level === "프리랜서" && job.level !== "프리랜서") return [];
    const matched = matchScore(profile, `${job.title} ${job.description} ${job.skills.join(" ")}`);
    const explicitOtherRole = ROLE_RULES.some(rule => rule.name !== profile.role && rule.pattern.test(job.title));
    if (explicitOtherRole && !roleMatches(profile.role, job.title)) return [];
    const titleMatches = roleMatches(profile.role, `${job.title} ${job.category || ""}`);
    if (!titleMatches && matched.skills.length < Math.min(2, Math.max(1, profile.skills.length))) return [];
    const identity = `${job.company}|${job.title}|${job.location}|${job.level}|${job.dueAt || ""}`.toLowerCase().replace(/[\s㈜()[\]]/g, "");
    if (seen.has(identity)) return [];
    seen.add(identity);
    const reason = matched.skills.length ? `${matched.skills.slice(0, 3).join(" · ")} 경험과 맞는 공고예요.` : `${profile.role} 직무와 관련된 공고예요.`;
    const score = (titleMatches ? 40 : 0) + (profile.skills.length ? 50 * matched.skills.length / profile.skills.length : 30) + (job.level === profile.level ? 10 : 0);
    return [{ ...job, skills: matched.skills, stack: job.stack ?? job.skills, score: Math.round(score), reason }];
  }).sort((a, b) => profile.sort === "latest" ? (dateTime(b.postedAt) || 0) - (dateTime(a.postedAt) || 0) || (b.score ?? 0) - (a.score ?? 0) : (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
}
export function validateProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (p.recentDays !== undefined && ![0, 7, 14, 30].includes(p.recentDays as number)) return null;
  if (p.sort !== undefined && p.sort !== "relevance" && p.sort !== "latest") return null;
  if (typeof p.role !== "string" || !p.role.trim() || p.role.length > 60 || !Array.isArray(p.skills) || p.skills.length > 10 || p.skills.some(s => typeof s !== "string" || s.length > 30) || !LEVELS.includes(p.level as Level) || typeof p.location !== "string" || p.location.length > 30 || (p.years !== undefined && (typeof p.years !== "number" || !Number.isInteger(p.years) || p.years < 0 || p.years > 60))) return null;
  const role = p.role.trim().replace(/[<>\r\n]/g, "").trim();
  if (!role) return null;
  return { role, skills: p.skills.map(s => String(s).trim()).filter(Boolean), level: p.level as Level, location: p.location.trim(), ...(p.years !== undefined ? { years: p.years as number } : {}), ...(p.recentDays !== undefined ? { recentDays: p.recentDays as number } : {}), ...(p.sort !== undefined ? { sort: p.sort as Profile["sort"] } : {}) };
}
