import test from "node:test";
import assert from "node:assert/strict";
import { companyTier, evaluateBenchmark, resumeSignals, roleFamily } from "../src/lib/benchmark";
import { assessFit } from "../src/lib/fit";
import type { Job, Profile } from "../src/lib/matching";

const job: Job = { id: "b1", title: "콘텐츠 마케터 (신입)", company: "(주)카카오", source: "카카오 채용", url: "https://careers.kakao.com/jobs/P-1", location: "경기 판교", level: "신입", minYears: 0, skills: [], description: "콘텐츠 기획 경험" };
const marketer: Profile = { role: "마케터", skills: ["콘텐츠"], level: "신입", location: "전국" };

test("company tier and job family come from the company name and role", () => {
  assert.equal(companyTier(job), "주요 기업");
  assert.equal(companyTier({ company: "한국전력공사", source: "사람인" }), "공공기관");
  assert.equal(companyTier({ company: "서울대학교병원", source: "사람인" }), "대학병원");
  assert.equal(companyTier({ company: "작은상점", source: "사람인" }), "일반 기업");
  assert.equal(roleFamily("프론트엔드 개발자"), "개발");
  assert.equal(roleFamily("마케터"), "마케팅·기획");
  assert.equal(roleFamily("간호사"), "의료");
});

test("resume signals read projects, language scores, certificates and degree", () => {
  const signals = resumeSignals("OO대학교 경영학과 졸업\nTOEIC 855\nOPIc IM2\n프로젝트: 브랜드 SNS 캠페인\n팀 프로젝트 - 앱 런칭 마케팅\n컴퓨터활용능력 1급\n마케팅 인턴 6개월\n공모전 수상");
  assert.equal(signals.projects, 2);
  assert.equal(signals.toeic, 855);
  assert.equal(signals.opic, "IM2");
  assert.equal(signals.degree, "학사");
  assert.ok(signals.internship && signals.activities);
  assert.deepEqual(signals.certificates, ["컴퓨터활용능력"]);
});

test("major-company marketing benchmark flags missing language score and internship", () => {
  const result = evaluateBenchmark(job, marketer, resumeSignals("대학교 졸업\n프로젝트 A\n프로젝트 B"));
  const missing = result.rows.filter(r => !r.met).map(r => r.label);
  assert.equal(result.tier, "주요 기업");
  assert.ok(missing.includes("어학 점수") && missing.includes("인턴·실무 경험"));
  assert.ok(result.rows.find(r => r.label === "학력")!.met);
  const strong = evaluateBenchmark(job, marketer, resumeSignals("대학교 졸업\nTOEIC 900\n인턴\n프로젝트 A\n프로젝트 B\n포트폴리오 링크\n공모전 수상"));
  assert.ok(strong.rows.every(r => r.met));
});

test("score breakdown adds up to the score and explains every lost point", () => {
  const fit = assessFit(job, marketer, "콘텐츠 마케팅 대학교 졸업");
  const sum = fit.breakdown!.reduce((total, part) => total + part.points, 0);
  assert.equal(fit.score, Math.round(sum));
  assert.equal(fit.breakdown!.reduce((total, part) => total + part.max, 0), 100);
  for (const part of fit.breakdown!) assert.ok(part.detail.length > 5, part.label);
  const benchmarkPart = fit.breakdown!.find(p => p.label === "평균 스펙 대비")!;
  assert.ok(benchmarkPart.points < benchmarkPart.max);
  assert.ok(fit.gaps.some(g => g.kind === "benchmark" && /어학/.test(g.label)));
});
