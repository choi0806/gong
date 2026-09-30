import test from "node:test";
import assert from "node:assert/strict";
import { analyzeText, matchScore, validateProfile, rankJobs, deadlinePassed, type Job, type Profile } from "../src/lib/matching";
import { parseGreenhouse, parseJobkorea, parseJumpit, searchLiveJobs, plainText } from "../src/lib/providers";
import { POST } from "../src/app/api/matches/route";
const profile: Profile = { role: "프론트엔드 개발자", skills: ["React", "TypeScript", "Next.js"], level: "신입", location: "전국" };
const job: Job = { id: "real-1", title: "Frontend Engineer", company: "테스트", source: "원티드", url: "https://www.wanted.co.kr/wd/123", location: "서울", level: "신입", minYears: 0, description: "React TypeScript Next.js", skills: ["React"] };
const checkedAt = "2026-09-28T00:00:00Z";
// API tests must not read or start collecting into the real job index.
process.env.JOB_INDEX_AUTO = "0";
process.env.JOB_INDEX_FILE = "artifacts/test-job-index.json";

test("extracts Korean resume profile and distinguishes Java from JavaScript", () => {
  const result = analyzeText("신입 프론트엔드 개발자. React, TypeScript, JavaScript, Next.js 프로젝트를 개발했습니다.");
  assert.equal(result.role, profile.role);
  assert.equal(result.level, "신입");
  assert.ok(result.skills.includes("JavaScript"));
  assert.ok(!result.skills.includes("Java"));
  assert.equal(matchScore({ ...profile, skills: ["Java"] }, "JavaScript").score, 0);
});

test("extracts years of experience, explicit internship intent and unknown roles", () => {
  const designer = analyzeText("프로덕트 디자이너 총 경력 3년 Figma UI/UX 디자인");
  assert.equal(designer.role, "프로덕트 디자이너");
  assert.equal(designer.years, 3);
  assert.equal(designer.level, "경력");
  assert.equal(analyzeText("React 프론트엔드 인턴 지원").level, "인턴");
  assert.equal(analyzeText("아직 직무를 정하지 않았습니다").role, "");
});

test("rejects malformed profiles", () => {
  for (const input of [null, {}, { ...profile, role: " " }, { ...profile, skills: [33] }, { ...profile, years: -2 }, { ...profile, level: "fake" }]) assert.equal(validateProfile(input), null);
  assert.deepEqual(validateProfile(profile), profile);
});

test("normalizes Korean deadlines and never removes unknown dates as expired", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  assert.equal(deadlinePassed("2026-09-28", now), false);
  assert.equal(deadlinePassed("2026-09-28 18:00:00", now), true);
  assert.equal(deadlinePassed("2026-09-28T14:00:00Z", now), false);
  assert.equal(deadlinePassed("상시채용", now), false);
});

test("ranking excludes samples, expired jobs, irrelevant jobs and senior jobs for graduates", () => {
  const candidates = [job, { ...job, id: "senior", title: "시니어 프론트엔드", level: "경력" as const, minYears: 7 }, { ...job, id: "expired", dueAt: "2020-01-01" }, { ...job, id: "sample", sample: true }, { ...job, id: "unrelated", title: "간호사", description: "진료 보조", skills: [] }];
  assert.deepEqual(rankJobs(profile, candidates).map(j => j.id), [job.id]);
  assert.match(rankJobs(profile, candidates)[0].reason || "", /React/);
});

test("same company and role across channels are deduplicated and experience requirements enforced", () => {
  assert.equal(rankJobs(profile, [job, { ...job, id: "duplicate", source: "잡코리아" }]).length, 1);
  assert.equal(rankJobs({ ...profile, level: "경력", years: 3 }, [{ ...job, minYears: 5, level: "경력" }]).length, 0);
});

test("a backend title is not recommended to frontend candidates merely for shared stack mentions", () => {
  assert.equal(rankJobs(profile, [{ ...job, title: "Backend Engineer", category: "프론트엔드 백엔드" }]).length, 0);
});

test("Jumpit parses genuine detail links, skills and deadline", () => {
  const result = parseJumpit({ result: { positions: [{ id: 123, title: "프론트엔드 개발자", companyName: "기업", techStacks: ["<span>React</span>"], locations: ["서울"], newcomer: true, minCareer: 0, closedAt: "2099-01-01" }, { id: 456, title: "마감", closedAt: "2020-01-01" }] } }, checkedAt);
  assert.equal(result.length, 1);
  assert.equal(result[0].url, "https://jumpit.saramin.co.kr/position/123");
  assert.deepEqual(result[0].skills, ["React"]);
  assert.equal(result[0].minYears, 0);
});

test("Jobkorea parsing excludes off-domain links and closed posts", () => {
  const card = (url: string, tail = "") => `<div data-sentry-component="CardJob"><a data-sentry-component="Title" href="${url}">프론트엔드 신입</a><a data-sentry-component="CompanyLogo"><img alt="기업 로고" /></a><div data-sentry-component="GrayChip">서울</div><span class="flex-shrink-0 text-gray700">신입·경력</span>${tail}</div>`;
  const jobs = parseJobkorea(card("https://www.jobkorea.co.kr/Recruit/GI_Read/123?tracking=1") + card("https://evil.test/Recruit/GI_Read/124") + card("https://www.jobkorea.co.kr/Recruit/GI_Read/125", "모집 마감"), checkedAt);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, "https://www.jobkorea.co.kr/Recruit/GI_Read/123");
  assert.equal(jobs[0].company, "기업");
  assert.equal(jobs[0].minYears, 0);
});

test("Greenhouse keeps Korean roles, real per-job URLs and removes expired roles", () => {
  const base = { id: 123, title: "Frontend Intern", location: { name: "Seoul, South Korea" }, content: "&lt;p&gt;React&lt;/p&gt;", metadata: [] };
  const jobs = parseGreenhouse({ jobs: [base, { ...base, id: 456, location: { name: "New York" } }, { ...base, id: 789, application_deadline: "2020-01-01" }] }, "daangn", "당근", checkedAt);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, "https://careers.daangn.com/jobs/role/123/");
  assert.equal(jobs[0].level, "인턴");
  assert.equal(plainText(base.content), "React");
});

test("schema changes throw instead of masquerading as an empty successful search", () => {
  assert.throws(() => parseJumpit({}, checkedAt));
  assert.throws(() => parseGreenhouse({}, "daangn", "당근", checkedAt));
  assert.throws(() => parseJobkorea("<html>access denied</html>", checkedAt));
});

test("API rejects invalid requests and returns an explicit error when all sources fail", async () => {
  const invalid = await POST(new Request("http://localhost/api/matches", { method: "POST", body: "{}" }));
  assert.equal(invalid.status, 400);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const response = await POST(new Request("http://localhost/api/matches", { method: "POST", body: JSON.stringify(profile) }));
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.equal(data.jobs.length, 0);
    assert.ok(data.sources.every((s: { status: string }) => s.status !== "ok"));
    assert.equal("channels" in data, false);
  } finally { globalThis.fetch = original; }
});

test("one failing source does not discard genuine results from other sources", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    if (String(input).includes("api.jumpit.co.kr")) return Response.json({ result: { positions: [{ id: 987, title: "프론트엔드 개발자", companyName: "실제응답 테스트", newcomer: true, techStacks: ["React", "TypeScript"], locations: ["서울"] }] } });
    throw new Error("offline");
  };
  try {
    const result = await searchLiveJobs(profile);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].source, "점핏");
    assert.deepEqual(result.sources.filter(s => s.status === "ok").map(s => s.name), ["점핏"]);
    assert.ok(result.sources.filter(s => s.status === "failed").length > 20);
    assert.match(result.message, /나머지 채널/);
  } finally { globalThis.fetch = original; }
});
