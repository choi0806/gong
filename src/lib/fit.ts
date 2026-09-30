import { detectSkills, hasSkill, ROLE_RULES, skillRegex, roleMatches, type Fit, type Gap, type Job, type Profile, type ScorePart } from "./matching";
import { evaluateBenchmark, resumeSignals, type ResumeSignals } from "./benchmark";

// Runs in the browser: the resume text is compared here and never sent to the server.
const DOCUMENTS: [string, RegExp][] = [
  ["이력서", /이력서|resume|\bcv\b/i], ["자기소개서", /자기\s*소개서|자소서|cover\s*letter/i],
  ["포트폴리오", /포트폴리오|portfolio/i], ["경력기술서", /경력\s*기술서/],
  ["경력증명서", /경력\s*증명서/], ["졸업증명서", /졸업(?:\s*예정)?\s*증명서/],
  ["성적증명서", /성적\s*증명서/], ["자격증 사본", /자격증\s*사본/],
  ["면허증 사본", /면허증\s*사본/], ["어학성적표", /어학\s*성적/],
  ["주민등록등본", /주민등록\s*등본/], ["사전 과제", /사전\s*과제|과제\s*전형|코딩\s*테스트|coding\s*test/i],
];
const QUALIFICATIONS: { label: string; job: RegExp; have: RegExp }[] = [
  { label: "정보처리기사", job: /정보처리\s*(?:산업)?기사/, have: /정보처리\s*(?:산업)?기사/ },
  { label: "간호사 면허", job: /간호사\s*면허/, have: /간호사\s*면허|면허\s*(?:번호|취득)|registered\s*nurse/i },
  { label: "운전면허", job: /운전\s*면허|운전\s*가능/, have: /운전\s*면허/ },
  { label: "학사 학위", job: /학사\s*(?:학위\s*)?(?:이상|소지)|대졸\s*이상|4년제\s*(?:대학|졸업)|bachelor/i, have: /학사|대학교|대학\s*졸업|university|bachelor/i },
  { label: "석사 학위", job: /석사\s*(?:학위\s*)?(?:이상|소지)|master'?s\s*degree/i, have: /석사|대학원|master/i },
  { label: "영어 능력", job: /영어\s*(?:능통|가능|회화|커뮤니케이션|소통|능력)|비즈니스\s*영어|business\s*english|fluent\s*(?:in\s*)?english|토익|toeic|opic|토플|toefl/i, have: /토익|toeic|opic|오픽|toefl|토플|ielts|영어\s*(?:능통|회화|가능)|business\s*english|fluent/i },
  { label: "일본어 능력", job: /일본어|jlpt/i, have: /일본어|jlpt|jpt/i },
  { label: "중국어 능력", job: /중국어|hsk/i, have: /중국어|hsk/i },
  { label: "회계 자격증", job: /전산\s*회계|재경\s*관리사|세무사|\bk?i?cpa\b|회계사/i, have: /전산\s*회계|재경\s*관리사|세무사|\bk?i?cpa\b|회계사/i },
  { label: "컴퓨터활용능력", job: /컴퓨터\s*활용\s*능력|컴활/, have: /컴퓨터\s*활용\s*능력|컴활/ },
  { label: "건축기사", job: /건축\s*(?:산업)?기사/, have: /건축\s*(?:산업)?기사/ },
];
const PREFERRED_SECTION = /우대\s*(?:사항|조건|요건)|이런\s*분이면\s*더|preferred\s*qualifications|nice[\s-]to[\s-]have|bonus\s*points/i;
// Everyday words ("콘텐츠", "UI") that only count as a requirement for roles built around them.
const SOFT_SKILLS = new Set(["콘텐츠", "고객 관리", "데이터 분석", "서비스 기획", "UI/UX", "브랜딩", "Excel"]);
const PORTFOLIO_EVIDENCE = /포트폴리오|portfolio|github\.com|behance|dribbble|notion\.site/i;

// A requirement is "preferred" when it only appears in the 우대 section or next to "우대".
function isPreferred(pattern: RegExp, text: string): boolean {
  const cut = text.search(PREFERRED_SECTION);
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  for (const match of text.matchAll(global)) {
    const index = match.index ?? 0;
    if (cut >= 0 && index >= cut) continue;
    const after = text.slice(index, index + 50).split(/[.\n•]/)[0];
    if (!/우대|preferred|plus/i.test(after)) return false;
  }
  return true;
}

export function jobRequirements(job: Job, role = "") {
  const related = ROLE_RULES.find(rule => rule.name === role)?.related ?? [];
  const text = `${job.title}\n${job.description}`;
  const skills = new Map<string, boolean>(); // name -> preferred
  for (const tag of job.stack ?? []) {
    const known = detectSkills(tag);
    const name = known.length === 1 ? known[0] : tag.trim();
    if (name) skills.set(name, false);
  }
  for (const skill of detectSkills(text)) if (!skills.has(skill) && (!SOFT_SKILLS.has(skill) || related.includes(skill))) skills.set(skill, isPreferred(skillRegex(skill)!, text));
  const documents = DOCUMENTS.filter(([, pattern]) => pattern.test(job.description)).map(([name]) => name);
  const qualifications = QUALIFICATIONS.filter(q => q.job.test(text)).map(q => ({ ...q, preferred: isPreferred(q.job, text) }));
  return { skills: [...skills].map(([name, preferred]) => ({ name, preferred })), documents, qualifications };
}

let signalCache: { text: string; signals: ResumeSignals } | undefined;
const signalsOf = (text: string) => signalCache?.text === text ? signalCache.signals : (signalCache = { text, signals: resumeSignals(text) }).signals;

// Score = posting requirements (80) + reference spec for this company tier and job family (15)
// + stated documents (5). Every part records why it scored what it did.
export function assessFit(job: Job, profile: Profile, resumeText: string): Fit {
  const req = jobRequirements(job, profile.role);
  const has = (skill: string) => hasSkill(skill, resumeText) || profile.skills.some(s => s.toLowerCase() === skill.toLowerCase());
  const matched = req.skills.filter(s => has(s.name)).map(s => s.name);
  const gaps: Gap[] = req.skills.filter(s => !has(s.name)).map(s => ({ label: s.name, kind: "skill", preferred: s.preferred }));
  const required = req.skills.filter(s => !s.preferred), preferred = req.skills.filter(s => s.preferred);
  const hits = (list: typeof req.skills) => list.filter(s => has(s.name)).length;
  const names = (list: typeof req.skills, want: boolean) => list.filter(s => has(s.name) === want).map(s => s.name).join(", ");
  const breakdown: ScorePart[] = [];
  if (required.length) breakdown.push({ label: "필수 기술", max: 45, points: 45 * hits(required) / required.length, detail: `공고 필수 기술 ${required.length}개 중 ${hits(required)}개 보유${hits(required) < required.length ? ` · 없음: ${names(required, false)}` : ""}` });
  else if (preferred.length) breakdown.push({ label: "필수 기술", max: 45, points: 45 * (0.6 + 0.4 * hits(preferred) / preferred.length), detail: `필수 기술이 명시되지 않아 기본 60%에 우대 기술 ${preferred.length}개 중 ${hits(preferred)}개 보유를 더했어요` });
  else {
    const own = profile.skills.filter(s => hasSkill(s, `${job.title} ${job.description}`));
    const points = Math.max(27, profile.skills.length ? 45 * own.length / profile.skills.length : 27);
    breakdown.push({ label: "필수 기술", max: 45, points, detail: `공고에 기술이 명시되지 않았어요. 내 기술 ${profile.skills.length}개 중 공고에 언급된 ${own.length}개 기준(최소 60%)으로 계산했어요` });
  }
  const roleMatch = roleMatches(profile.role, `${job.title} ${job.category || ""}`);
  breakdown.push({ label: "직무 일치", max: 15, points: roleMatch ? 15 : 0, detail: roleMatch ? `공고 제목·직군이 '${profile.role}'와 일치해요` : `공고 제목이 '${profile.role}'와 달라요. 기술이 겹쳐서 추천된 공고예요` });
  const minYears = job.minYears ?? 0, years = profile.years ?? 0;
  if (minYears > years) gaps.push({ label: `경력 ${Math.ceil(minYears)}년 이상`, kind: "experience" });
  breakdown.push({ label: "경력 연차", max: 10, points: minYears > years ? 0 : 10, detail: minYears > years ? `공고는 ${Math.ceil(minYears)}년 이상, 이력서는 ${years ? `${years}년` : "경력 미확인"}이에요` : job.minYears ? `공고 최소 ${Math.ceil(minYears)}년, 내 경력 ${years}년으로 충족해요` : "공고에 최소 경력 제한이 없어요" });
  const quals = req.qualifications.map(q => ({ ...q, met: q.have.test(resumeText) }));
  for (const q of quals) if (!q.met) gaps.push({ label: q.label, kind: "qualification", preferred: q.preferred });
  const requiredQuals = quals.filter(q => !q.preferred);
  breakdown.push({ label: "자격·어학·학력 요건", max: 10, points: requiredQuals.length ? 10 * requiredQuals.filter(q => q.met).length / requiredQuals.length : 10, detail: requiredQuals.length ? requiredQuals.map(q => `${q.label} ${q.met ? "충족" : "없음"}`).join(" · ") : quals.length ? `필수 요건은 없고 우대: ${quals.map(q => `${q.label} ${q.met ? "충족" : "없음"}`).join(" · ")}` : "공고에 필수 자격·어학·학력 요건이 없어요" });
  const benchmark = evaluateBenchmark(job, profile, signalsOf(resumeText));
  const metRows = benchmark.rows.filter(row => row.met).length;
  for (const row of benchmark.rows) if (!row.met) gaps.push({ label: `${row.label} (${row.expected})`, kind: "benchmark", preferred: true });
  breakdown.push({ label: "평균 스펙 대비", max: 15, points: benchmark.rows.length ? 15 * metRows / benchmark.rows.length : 15, detail: benchmark.rows.length ? `${benchmark.tier} ${benchmark.family} 직군 참고 기준 ${benchmark.rows.length}개 중 ${metRows}개 충족` : "이 기업·직군에는 추가 참고 기준이 없어요" });
  const needsPortfolio = req.documents.includes("포트폴리오") && !PORTFOLIO_EVIDENCE.test(resumeText);
  if (needsPortfolio) gaps.push({ label: "포트폴리오", kind: "document" });
  breakdown.push({ label: "제출 서류 준비", max: 5, points: needsPortfolio ? 0 : 5, detail: needsPortfolio ? "공고가 포트폴리오를 요구하는데 이력서에서 포트폴리오·GitHub 링크를 찾지 못했어요" : req.documents.length ? `요구 서류: ${req.documents.join(", ")}. 포트폴리오 외 서류는 준비 여부를 확인할 수 없으니 지원 전에 챙겨주세요` : "공고에 특별한 제출 서류가 명시되지 않았어요" });
  for (const part of breakdown) part.points = Math.round(part.points * 10) / 10;
  const score = Math.round(Math.min(100, breakdown.reduce((sum, part) => sum + part.points, 0)));
  // Posting requirements first, then preferred items, then reference-spec gaps.
  const rank = (gap: Gap) => gap.kind === "benchmark" ? 2 : gap.preferred ? 1 : 0;
  gaps.sort((a, b) => rank(a) - rank(b));
  return { score, matched, gaps, documents: req.documents, documentsStated: req.documents.length > 0, breakdown, benchmark };
}

export function fitLabel(score: number): string {
  return score >= 80 ? "잘 맞아요" : score >= 60 ? "도전해볼 만해요" : "보완이 필요해요";
}

export function isFit(value: unknown): value is Fit {
  const fit = value as Fit;
  return !!fit && typeof fit.score === "number" && Array.isArray(fit.matched) && Array.isArray(fit.gaps) && Array.isArray(fit.documents)
    && fit.gaps.every(g => g && typeof g.label === "string") && fit.documents.every(d => typeof d === "string");
}
