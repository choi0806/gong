import test from "node:test";
import assert from "node:assert/strict";
import { deadlinePassed, rankJobs, validateProfile, type Job, type Profile } from "../src/lib/matching";
import { dateTime, displayDate, normalizeJobDate } from "../src/lib/job-dates";
import { discoverJobLinks, parseJobPage, safeJobUrl, fetchJobPage, experienceLevel } from "../src/lib/job-page";
import { parseSaramin } from "../src/lib/providers";
import { parseGrounding, resolveGroundingUrl, searchGemini } from "../src/lib/gemini";
const profile: Profile = { role: "프론트엔드 개발자", skills: ["React"], level: "전체", location: "전국" };
const base: Job = { id: "1", company: "기업", title: "Frontend Engineer", source: "잡코리아", url: "https://www.jobkorea.co.kr/Recruit/GI_Read/123", location: "서울", level: "신입", minYears: 0, skills: ["React"], description: "React", postedAt: "2026-09-28" };
const now = Date.parse("2026-09-29T10:00:00+09:00");
const page = (fields = {}, body = "시작일 2026.09.20") => `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Frontend Engineer", hiringOrganization: { name: "기업" }, description: "React", datePosted: "2026-09-28", validThrough: "2099-10-01T18:00", experienceRequirements: "신입", jobLocation: { address: { addressRegion: "서울" } }, ...fields })}</script><main>${body}</main>`;

test("KST date boundaries, leap days, malformed dates and explicit time zones", () => {
  assert.equal(normalizeJobDate("2026.09.29"), "2026-09-29");
  for (const date of ["2026-02-29", "2026-13-01", "09/29", "채용시 마감", "2026-09-29T99:99"]) assert.equal(normalizeJobDate(date), undefined);
  assert.equal(normalizeJobDate("2028-02-29"), "2028-02-29");
  assert.equal(deadlinePassed("2026-09-29", Date.parse("2026-09-29T23:59:59+09:00")), false);
  assert.equal(deadlinePassed("2026-09-29", Date.parse("2026-09-30T00:00:00+09:00")), true);
  assert.equal(deadlinePassed("2026-09-29 18:00", Date.parse("2026-09-29T18:00:00+09:00")), true);
  assert.equal(dateTime("2026-09-29T09:00Z"), dateTime("2026-09-29T18:00+09:00"));
  assert.match(displayDate("2026-12-31T16:00Z"), /2027/);
});

test("intern, new graduate, unknown, experienced and freelance are distinct", () => {
  const jobs = [base, { ...base, id: "intern", title: "Frontend Intern", level: "인턴" as const }, { ...base, id: "senior", title: "Senior Frontend", level: "경력" as const, minYears: 3 }, { ...base, id: "unknown", title: "Frontend unknown", level: "전체" as const, minYears: undefined }, { ...base, id: "any", title: "Frontend any", level: "전체" as const }, { ...base, id: "free", title: "Frontend freelance", level: "프리랜서" as const }];
  assert.deepEqual(rankJobs({ ...profile, level: "인턴" }, jobs, now).map(j => j.id), ["intern"]);
  assert.deepEqual(rankJobs({ ...profile, level: "신입" }, jobs, now).map(j => j.id), ["1", "any"]);
  assert.deepEqual(rankJobs({ ...profile, level: "경력", years: 2 }, jobs, now).map(j => j.id), ["any"]);
  assert.deepEqual(rankJobs({ ...profile, level: "프리랜서" }, jobs, now).map(j => j.id), ["free"]);
  assert.equal(experienceLevel("신입 및 경력"), "전체");
  assert.equal(experienceLevel("경력 조건 원문 확인"), "전체");
});

test("recent filters use posted dates only, sort chronologically and exclude future opening", () => {
  const jobs = [base, { ...base, id: "older", company: "B", postedAt: "2026-09-01" }, { ...base, id: "unknown", company: "C", postedAt: undefined, checkedAt: new Date(now).toISOString() }, { ...base, id: "today", company: "D", postedAt: "2026-09-29" }, { ...base, id: "future", company: "E", startsAt: "2026-10-01" }];
  assert.deepEqual(rankJobs({ ...profile, recentDays: 7, sort: "latest" }, jobs, now).map(j => j.id), ["today", "1"]);
  assert.equal(rankJobs({ ...profile, location: "부산" }, jobs, now).length, 0);
  assert.equal(validateProfile({ ...profile, recentDays: -1 }), null);
  assert.equal(validateProfile({ ...profile, sort: "bad" }), null);
});

test("Flutter and mobile titles are not web frontend roles just because a category includes frontend", () => {
  for (const title of ["Flutter개발 채용전환형 인턴", "모바일 엔지니어 (React Native, NextJS)", "React Native Engineer"]) {
    assert.equal(rankJobs(profile, [{ ...base, title, category: "프론트엔드" }], now).length, 0);
  }
});

test("detail parsing reads source dates and preserves exact deadline hour", () => {
  const job = parseJobPage(page(), base.url, new Date(now).toISOString(), base)!;
  assert.equal(job.dueAt, "2099-10-01T18:00+09:00");
  assert.equal(job.postedAt, "2026-09-28");
  assert.equal(job.startsAt, "2026-09-20");
  assert.equal(job.verification, "detail");
  assert.equal(parseJobPage(page({ validThrough: "2020-01-01" }), base.url, ""), null);
  assert.equal(parseJobPage(page({}, "마감된 공고입니다"), base.url, ""), null);
  assert.equal(parseJobPage(page() + page(), base.url, ""), null);
  assert.equal(parseJobPage("<h1>로그인이 필요합니다</h1>", base.url, ""), null);
});

test("Saramin preserves unknown deadline year instead of inventing an exact date", () => {
  const html = `<div class="item_recruit"><h2 class="job_tit"><a href="/zf_user/jobs/relay/view?rec_idx=123">프론트엔드 인턴</a></h2><b class="corp_name">기업</b><div class="job_condition"><span>서울</span><span>신입</span><span>인턴</span></div><div class="job_date"><span class="date">~ 01/03</span></div><span class="job_day">등록일 26/12/29</span></div>`;
  const job = parseSaramin(html, "2026-12-30")[0];
  assert.equal(job.level, "인턴"); assert.equal(job.postedAt, "2026-12-29");
  assert.equal(job.dueAt, undefined); assert.equal(job.deadlineLabel, "~ 01/03");
});

test("Saramin detail extracts hours from reception section, not dates in other content", () => {
  const html = `<div class="jv_header" data-rec_idx="123"><h1 class="tit_job">프론트엔드 인턴</h1><a class="company">기업</a></div><div class="jv_summary"><dt>경력</dt><dd>신입</dd></div><div class="jv_detail"><div class="user_content">회사 설립일 2001.01.01</div></div><div class="jv_howto"><div class="status"><dl class="info_period"><dt>시작일</dt><dd>2026.09.20 09:00</dd><dt>마감일</dt><dd>2099.10.05 18:30</dd></dl></div></div>`;
  const job = parseJobPage(html, "https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=123", "2026-09-29", { ...base, postedAt: "2026-09-19" })!;
  assert.equal(job.startsAt, "2026-09-20T09:00+09:00");
  assert.equal(job.dueAt, "2099-10-05T18:30+09:00");
  assert.equal(job.postedAt, "2026-09-19");
  assert.equal(job.level, "인턴");
  assert.equal(parseJobPage(html, "https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=999", ""), null);
});

test("Wanted date precision from API overrides midnight JSON-LD and arrays include newcomer", () => {
  const job = parseJobPage(page({ validThrough: "2099-10-01T00:00", experienceRequirements: ["신입", "경력"] }), "https://www.wanted.co.kr/wd/123", "", { ...base, dueAt: "2099-10-01" })!;
  assert.equal(job.dueAt, "2099-10-01"); assert.equal(job.minYears, 0); assert.equal(job.level, "전체");
});

test("search ignores generated URLs without grounding and blocks internal or unknown hosts", async () => {
  assert.throws(() => parseGrounding({ candidates: [{ content: { parts: [{ text: base.url }] } }] }));
  assert.deepEqual(parseGrounding({ candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: base.url } }, { web: { uri: base.url } }] } }] }).urls, [base.url]);
  for (const url of ["http://www.jobkorea.co.kr/a", "https://127.0.0.1/a", "https://www.jobkorea.co.kr.evil.test/a", "https://x@www.jobkorea.co.kr/a", "https://www.jobkorea.co.kr:123/a"]) assert.equal(safeJobUrl(url), null);
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }); };
  try {
    await assert.rejects(fetchJobPage(base.url, AbortSignal.timeout(1000)));
    assert.equal(await resolveGroundingUrl("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", AbortSignal.timeout(1000)), null);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("Gemini uses free model, deduplicates concurrent calls, caches, and verifies source pages", async () => {
  const original = globalThis.fetch, old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key-success"; let apiCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("generativelanguage")) {
      apiCalls++;
      assert.match(String(input), /gemini-2.5-flash:generateContent/);
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.tools, [{ google_search: {} }]);
      assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
      assert.equal(String(input).includes("test-key"), false);
      return Response.json({ candidates: [{ finishReason: "STOP", groundingMetadata: { groundingChunks: [{ web: { uri: base.url } }] } }] });
    }
    return new Response(page());
  };
  try {
    const [a, b] = await Promise.all([searchGemini(profile, AbortSignal.timeout(1000)), searchGemini(profile, AbortSignal.timeout(1000))]);
    assert.equal(a.jobs.length, 1); assert.equal(b.jobs.length, 1);
    await searchGemini({ ...profile, sort: "latest", recentDays: 7 }, AbortSignal.timeout(1000));
    assert.equal(apiCalls, 1);
  } finally { globalThis.fetch = original; if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
});

test("Gemini 429 does not retry or leak upstream messages and enters cooldown", async () => {
  const original = globalThis.fetch, old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key-quota"; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ secret: "upstream-private-text" }, { status: 429, headers: { "retry-after": "120" } }); };
  try {
    const a = await searchGemini(profile, AbortSignal.timeout(1000));
    const b = await searchGemini(profile, AbortSignal.timeout(1000));
    assert.equal(a.source.status, "failed"); assert.match(a.source.message!, /한도/);
    assert.equal(b.source.status, "skipped"); assert.equal(calls, 1);
    assert.equal(JSON.stringify(a).includes("upstream-private-text"), false);
  } finally { globalThis.fetch = original; if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
});

test("grounded listings discover only bounded same-host detail links and normalize tracking", () => {
  const html = `<a href="/Recruit/GI_Read/123?tracking=one">공고</a><a href="/Recruit/GI_Read/123?tracking=two">중복</a><a href="/Search/?q=react">목록</a><a href="https://evil.test/Recruit/GI_Read/456">외부</a><a href="https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=456">다른 사이트</a>`;
  assert.deepEqual(discoverJobLinks(html, "https://www.jobkorea.co.kr/Search"), ["https://www.jobkorea.co.kr/Recruit/GI_Read/123"]);
  assert.equal(discoverJobLinks(Array.from({ length: 10 }, (_, i) => `<a href="/wd/${i}">공고</a>`).join(""), "https://www.wanted.co.kr/wdlist/518").length, 4);
  assert.equal(safeJobUrl("https://m.jobkorea.co.kr/Recruit/GI_Read/123")?.href, "https://www.jobkorea.co.kr/Recruit/GI_Read/123");
  assert.equal(safeJobUrl("https://m.jobkorea.co.kr/unrelated"), null);
  assert.equal(safeJobUrl("https://m.jobkorea.co.kr:123/Recruit/GI_Read/123"), null);
});

test("Gemini follows links from a grounded listing and still requires genuine JobPosting data", async () => {
  const original = globalThis.fetch, old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key-listing";
  globalThis.fetch = async input => {
    if (String(input).includes("generativelanguage")) return Response.json({ candidates: [{ finishReason: "STOP", groundingMetadata: { groundingChunks: [{ web: { uri: "https://www.jobkorea.co.kr/Search" } }] } }] });
    if (String(input).includes("/Search")) return new Response(`<a href="/Recruit/GI_Read/123">공고</a><a href="/Recruit/GI_Read/456">로그인 페이지</a>`);
    return new Response(String(input).endsWith("/123") ? page() : "<h1>로그인</h1>");
  };
  try {
    const result = await searchGemini(profile, AbortSignal.timeout(1000));
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].url, base.url);
    assert.match(result.source.message!, /상세 링크 2개/);
  } finally { globalThis.fetch = original; if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
});
