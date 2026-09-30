import type { BenchmarkRow, Job, Level, Profile } from "./matching";

// Reference specs per company tier × job family. These are 공찾's stated assumptions about what
// such postings commonly expect, not statistics of hired candidates, and the UI says so.
export type Tier = "주요 기업" | "공공기관" | "대학병원" | "일반 기업";
export type Family = "개발" | "디자인" | "데이터" | "마케팅·기획" | "영업·경영지원" | "의료" | "설계·기술" | "기타";

const MAJOR = /삼성|엘지|\bLG\b|\bSK\b|SK[가-힣]|현대|기아|롯데|\bCJ\b|CJ[가-힣]|한화|포스코|\bGS\b|GS[가-힣]|두산|신세계|이마트|\bKT\b|네이버|NAVER|카카오|kakao|라인|\bLINE\b|쿠팡|coupang|토스|비바리퍼블리카|우아한형제들|배달의민족|당근|크래프톤|krafton|넥슨|엔씨소프트|\bNC\b|넷마블|하이브|아모레|올리브영|무신사|컬리|야놀자|11번가|몰로코|센드버드|리벨리온|직방|마이리얼트립|와디즈|뤼튼|현대오토에버/i;
const PUBLIC = /공사|공단|진흥원|재단법인|공공기관|시청|구청|도청|교육청|국립|연구원$/;
const HOSPITAL = /대학교병원|대학병원|서울아산|삼성서울|세브란스|서울성모|상급종합/;

export function companyTier(job: Pick<Job, "company" | "source">): Tier {
  const name = `${job.company} ${job.source}`;
  if (HOSPITAL.test(name)) return "대학병원";
  if (PUBLIC.test(job.company)) return "공공기관";
  if (MAJOR.test(name)) return "주요 기업";
  return "일반 기업";
}

export function roleFamily(role: string): Family {
  if (/개발|엔지니어|engineer|developer/i.test(role)) return "개발";
  if (/디자인|디자이너|영상/.test(role)) return "디자인";
  if (/데이터|분석/.test(role)) return "데이터";
  if (/마케|기획|PM|product manager/i.test(role)) return "마케팅·기획";
  if (/영업|인사|회계|세무|총무|상담|경영/.test(role)) return "영업·경영지원";
  if (/간호|의료|약사|치위생|물리치료/.test(role)) return "의료";
  if (/설계|건축|기계|전기|토목/.test(role)) return "설계·기술";
  return "기타";
}

export type ResumeSignals = { projects: number; internship: boolean; toeic?: number; opic?: string; certificates: string[]; degree?: "석사" | "학사" | "전문학사"; portfolio: boolean; activities: boolean };
const CERTIFICATES: [string, RegExp][] = [
  ["정보처리기사", /정보처리\s*기사/], ["정보처리산업기사", /정보처리\s*산업기사/], ["SQLD", /\bSQLD\b/i], ["ADsP", /\bADsP\b/i], ["빅데이터분석기사", /빅데이터\s*분석\s*기사/],
  ["컴퓨터활용능력", /컴퓨터\s*활용\s*능력|컴활/], ["전산회계", /전산\s*회계/], ["재경관리사", /재경\s*관리사/], ["세무사", /세무사/], ["회계사", /회계사|\bK?I?CPA\b/i],
  ["간호사 면허", /간호사\s*면허|면허\s*번호|registered\s*nurse/i], ["건축기사", /건축\s*(?:산업)?기사/], ["일반기계기사", /일반\s*기계\s*기사|기계\s*설계\s*(?:산업)?기사/],
  ["GTQ", /\bGTQ\b/i], ["컬러리스트", /컬러리스트/], ["구글애널리틱스", /GAIQ|google analytics\s*(?:certif|자격)/i], ["운전면허", /운전\s*면허/],
];
const OPIC_RANK = ["NL", "NM", "NH", "IL", "IM1", "IM2", "IM3", "IH", "AL"];

export function resumeSignals(text: string): ResumeSignals {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  // Short lines that name a project are treated as project headings.
  const projectLines = new Set(lines.filter(line => line.length <= 80 && /프로젝트|project|해커톤|hackathon/i.test(line)).map(line => line.toLowerCase().replace(/\s+/g, "")));
  const toeic = text.match(/(?:토익|toeic)(?!\s*speaking)\D{0,8}(\d{3})/i);
  const opic = text.match(/(?:opic|오픽)\D{0,8}(AL|IH|IM\s*[1-3]|IM|IL|NH|NM|NL)\b/i)?.[1].replace(/\s/g, "").toUpperCase();
  const degree = /석사|master'?s|대학원\s*(?:졸업|수료)/i.test(text) ? "석사" : /학사|대학교|university|bachelor|4년제/i.test(text) ? "학사" : /전문\s*학사|전문대|전문대학/.test(text) ? "전문학사" : undefined;
  return {
    projects: Math.min(projectLines.size, 10),
    internship: /인턴|intern(?:ship)?\b|현장\s*실습/i.test(text),
    ...(toeic && Number(toeic[1]) >= 10 && Number(toeic[1]) <= 990 ? { toeic: Number(toeic[1]) } : {}),
    ...(opic ? { opic: opic === "IM" ? "IM1" : opic } : {}),
    certificates: CERTIFICATES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name),
    ...(degree ? { degree } : {}),
    portfolio: /포트폴리오|portfolio|github\.com|behance|dribbble|notion\.site|velog|tistory/i.test(text),
    activities: /수상|공모전|대외\s*활동|서포터즈|동아리|해커톤|대상|최우수|우수상/.test(text),
  };
}

type Criterion = { label: string; expected: string; mine: (s: ResumeSignals) => string; met: (s: ResumeSignals) => boolean };
const count = (n: number) => (s: ResumeSignals) => s.projects >= n;
const languageMet = (toeic: number, opic: string) => (s: ResumeSignals) => (s.toeic ?? 0) >= toeic || OPIC_RANK.indexOf(s.opic ?? "") >= OPIC_RANK.indexOf(opic);
const languageMine = (s: ResumeSignals) => [s.toeic && `TOEIC ${s.toeic}`, s.opic && `OPIc ${s.opic}`].filter(Boolean).join(" · ") || "확인 안 됨";
const certMine = (names: string[]) => (s: ResumeSignals) => s.certificates.filter(c => names.includes(c)).join(" · ") || "확인 안 됨";
const certMet = (names: string[]) => (s: ResumeSignals) => s.certificates.some(c => names.includes(c));
const degreeRank = { 전문학사: 1, 학사: 2, 석사: 3 } as const;

export function benchmarkCriteria(tier: Tier, family: Family, level: Level, minYears?: number): Criterion[] {
  const entry = level === "신입" || level === "인턴" || (level === "전체" && !minYears);
  const major = tier === "주요 기업";
  const rows: Criterion[] = [];
  const projects = family === "개발" || family === "데이터" ? (major ? 3 : 2) : family === "디자인" ? 3 : family === "마케팅·기획" ? (major ? 2 : 1) : 0;
  if (projects && entry) rows.push({ label: "프로젝트 경험", expected: `${projects}개 이상`, mine: s => s.projects ? `약 ${s.projects}개` : "확인 안 됨", met: count(projects) });
  if (family === "개발" || family === "디자인" || family === "데이터" || (family === "마케팅·기획" && major)) rows.push({ label: family === "개발" ? "포트폴리오·GitHub" : "포트폴리오", expected: family === "디자인" ? "필수" : "있음", mine: s => s.portfolio ? "있음" : "확인 안 됨", met: s => s.portfolio });
  if (entry && (major || tier === "대학병원")) rows.push({ label: tier === "대학병원" ? "실습·인턴 경험" : "인턴·실무 경험", expected: "1회 이상", mine: s => s.internship ? "있음" : "확인 안 됨", met: s => s.internship });
  if ((major && (family === "마케팅·기획" || family === "영업·경영지원" || family === "데이터")) || tier === "공공기관") rows.push({ label: "어학 점수", expected: tier === "공공기관" ? "TOEIC 700+ 또는 OPIc IM1+" : "TOEIC 800+ 또는 OPIc IM2+", mine: languageMine, met: tier === "공공기관" ? languageMet(700, "IM1") : languageMet(800, "IM2") });
  if (major || tier === "공공기관" || tier === "대학병원") rows.push({ label: "학력", expected: tier === "대학병원" ? "간호학 학사 이상" : "학사 이상", mine: s => s.degree ?? "확인 안 됨", met: s => !!s.degree && degreeRank[s.degree] >= 2 });
  const certs: Partial<Record<Family, string[]>> = { 의료: ["간호사 면허"], "설계·기술": ["건축기사", "일반기계기사"], 데이터: ["SQLD", "ADsP", "빅데이터분석기사"] };
  if (certs[family]) rows.push({ label: family === "의료" ? "면허" : "관련 자격증", expected: family === "의료" ? "간호사 면허 필수" : `${certs[family]!.join("·")} 중 1개`, mine: certMine(certs[family]!), met: certMet(certs[family]!) });
  else if (family === "영업·경영지원") rows.push({ label: "관련 자격증", expected: "직무 자격증 1개 (전산회계·컴활 등)", mine: certMine(["전산회계", "재경관리사", "컴퓨터활용능력", "세무사", "회계사"]), met: certMet(["전산회계", "재경관리사", "컴퓨터활용능력", "세무사", "회계사"]) });
  else if (family === "개발" && tier !== "주요 기업") rows.push({ label: "관련 자격증", expected: "정보처리기사 (우대)", mine: certMine(["정보처리기사", "정보처리산업기사"]), met: certMet(["정보처리기사", "정보처리산업기사"]) });
  if (entry && (family === "마케팅·기획" || family === "디자인") && major) rows.push({ label: "공모전·대외활동", expected: "1회 이상", mine: s => s.activities ? "있음" : "확인 안 됨", met: s => s.activities });
  return rows;
}

export function evaluateBenchmark(job: Job, profile: Profile, signals: ResumeSignals): { tier: Tier; family: Family; rows: BenchmarkRow[] } {
  const tier = companyTier(job), family = roleFamily(profile.role);
  const rows = benchmarkCriteria(tier, family, job.level === "전체" ? profile.level : job.level, job.minYears).map(c => ({ label: c.label, expected: c.expected, mine: c.mine(signals), met: c.met(signals) }));
  return { tier, family, rows };
}
