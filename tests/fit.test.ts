import test from "node:test";
import assert from "node:assert/strict";
import { assessFit, jobRequirements } from "../src/lib/fit";
import type { Job, Profile } from "../src/lib/matching";

const profile: Profile = { role: "프론트엔드 개발자", skills: ["React", "TypeScript"], level: "신입", location: "전국" };
const job: Job = {
  id: "fit-1", title: "프론트엔드 개발자", company: "테스트", source: "원티드", url: "https://www.wanted.co.kr/wd/1", location: "서울", level: "신입", minYears: 0, skills: [],
  stack: ["React.js", "Redux"],
  description: "자격요건 React, TypeScript, AWS 경험. 정보처리기사 소지자. 제출서류: 이력서, 포트폴리오 우대사항 Docker 경험 영어 회화 가능",
};
const resume = "신입 프론트엔드 개발자 React TypeScript Next.js 프로젝트 github.com/me";

test("splits required and preferred requirements and lists stated documents", () => {
  const req = jobRequirements(job);
  const byName = Object.fromEntries(req.skills.map(s => [s.name, s.preferred]));
  assert.equal(byName.React, false);
  assert.equal(byName.Redux, false);
  assert.equal(byName.AWS, false);
  assert.equal(byName.Docker, true);
  assert.deepEqual(req.documents, ["이력서", "포트폴리오"]);
  assert.deepEqual(req.qualifications.map(q => [q.label, q.preferred]), [["정보처리기사", false], ["영어 능력", true]]);
});

test("reports missing skills, qualifications and required-first ordering", () => {
  const fit = assessFit(job, profile, resume);
  assert.deepEqual(fit.matched.sort(), ["React", "TypeScript"]);
  const labels = fit.gaps.map(g => g.label);
  for (const label of ["Redux", "AWS", "Docker", "정보처리기사", "영어 능력"]) assert.ok(labels.includes(label), label);
  assert.ok(!labels.includes("포트폴리오"), "github link counts as portfolio evidence");
  assert.ok(fit.gaps.findIndex(g => g.preferred) > fit.gaps.findLastIndex(g => !g.preferred));
  assert.ok(fit.score > 0 && fit.score < 80);
});

test("a resume covering every requirement scores high, and missing documents are flagged", () => {
  const full = assessFit(job, profile, `${resume} Redux AWS Docker 정보처리기사 TOEIC 900`);
  assert.deepEqual(full.gaps.filter(g => g.kind !== "benchmark"), []);
  assert.ok(full.score >= 90);
  const noPortfolio = assessFit(job, profile, "React TypeScript");
  assert.ok(noPortfolio.gaps.some(g => g.kind === "document" && g.label === "포트폴리오"));
});

test("unstated documents are not invented and senior requirements become an experience gap", () => {
  const fit = assessFit({ ...job, description: "React 개발", stack: [], minYears: 3 }, profile, resume);
  assert.equal(fit.documentsStated, false);
  assert.deepEqual(fit.documents, []);
  assert.ok(fit.gaps.some(g => g.kind === "experience" && g.label === "경력 3년 이상"));
});

test("short unknown stack tags match on word boundaries only", () => {
  const fit = assessFit({ ...job, description: "개발", stack: ["Go"] }, profile, "Google 검색 good");
  assert.deepEqual(fit.gaps.filter(g => g.kind === "skill").map(g => g.label), ["Go"]);
});

test("everyday words are only requirements for roles built around them", () => {
  const posting = { ...job, description: "사용자 콘텐츠를 다루는 React 서비스", stack: [] };
  assert.ok(!assessFit(posting, profile, "React").gaps.some(g => g.label === "콘텐츠"));
  assert.ok(assessFit(posting, { ...profile, role: "마케터" }, "React").gaps.some(g => g.label === "콘텐츠"));
});
