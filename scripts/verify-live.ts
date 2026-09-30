import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { searchLiveJobs } from "../src/lib/providers";
import { rankJobs, type Profile } from "../src/lib/matching";
import { dateTime } from "../src/lib/job-dates";
import { fetchJobPage } from "../src/lib/job-page";

async function main() {
  loadEnvConfig(process.cwd());
  const useGemini = process.argv.includes("--gemini");
  if (useGemini && !process.env.GEMINI_API_KEY?.trim()) throw new Error(".env의 GEMINI_API_KEY를 먼저 입력해주세요. 키는 출력하지 않습니다.");
  const originalKey = process.env.GEMINI_API_KEY;
  if (!useGemini) delete process.env.GEMINI_API_KEY;
  const profiles: Profile[] = useGemini ? [{ role: "프론트엔드 개발자", skills: ["React", "TypeScript"], level: "신입", location: "전국", sort: "latest" }] : [
    { role: "프론트엔드 개발자", skills: ["React", "TypeScript"], level: "신입", location: "전국", sort: "latest" },
    { role: "프론트엔드 개발자", skills: ["React", "TypeScript"], level: "인턴", location: "전국", sort: "latest" },
    { role: "백엔드 개발자", skills: ["Java", "Spring"], level: "경력", years: 3, location: "전국", sort: "latest" },
    { role: "마케터", skills: ["GA4", "콘텐츠"], level: "인턴", location: "전국", sort: "latest" },
    { role: "간호사", skills: [], level: "신입", location: "전국", sort: "latest" },
  ];
  const report: unknown[] = [];
  try {
    for (const profile of profiles) {
      const result = await searchLiveJobs(profile);
      assert.ok(result.sources.some(s => s.status === "ok"), "모든 출처 연결 실패");
      const now = Date.now();
      for (const job of result.jobs) {
        assert.ok(!job.dueAt || dateTime(job.dueAt, true) > now, `만료된 공고: ${job.url}`);
        assert.ok(!job.startsAt || dateTime(job.startsAt) <= now, `접수 전 공고: ${job.url}`);
        if (profile.level === "인턴") assert.equal(job.level, "인턴", job.url);
        if (profile.level === "신입") assert.ok(job.level === "신입" || (job.level === "전체" && job.minYears === 0), job.url);
      }
      const recent = rankJobs({ ...profile, recentDays: 7, sort: "latest" }, result.jobs, now);
      for (let i = 0; i < recent.length; i++) {
        assert.ok(dateTime(recent[i].postedAt) >= now - 7 * 86400000);
        if (i) assert.ok(dateTime(recent[i - 1].postedAt) >= dateTime(recent[i].postedAt));
      }
      const checkedDates: unknown[] = [];
      // Re-read an actual result from each major source and compare the displayed dates.
      for (const source of ["원티드", "잡코리아", "사람인"]) {
        const job = result.jobs.find(j => j.source === source && j.verification === "detail");
        if (!job) continue;
        const page = await fetchJobPage(job.url, AbortSignal.timeout(12000));
        const $ = load(page.html);
        if (source === "사람인") {
          const rawDeadline = $(".info_period dt").filter((_, el) => $(el).text().trim() === "마감일").next("dd").text().trim();
          if (job.dueAt) assert.equal(dateTime(rawDeadline), dateTime(job.dueAt));
          checkedDates.push({ source, url: job.url, rawDeadline, dueAt: job.dueAt });
        } else {
          const raw = $('script[type="application/ld+json"]').toArray().map(el => { try { return JSON.parse($(el).text()); } catch { return {}; } }).find(item => item["@type"] === "JobPosting");
          if (raw?.datePosted && job.postedAt) assert.equal(dateTime(raw.datePosted), dateTime(job.postedAt));
          if (raw?.validThrough && job.dueAt) {
            if (job.dueAt.length === 10) assert.equal(raw.validThrough.slice(0, 10), job.dueAt, job.url);
            else assert.equal(dateTime(raw.validThrough, true), dateTime(job.dueAt, true), job.url);
          }
          checkedDates.push({ source, url: job.url, rawPosted: raw?.datePosted, rawDeadline: raw?.validThrough, postedAt: job.postedAt, dueAt: job.dueAt });
        }
      }
      const entry = { profile, count: result.jobs.length, recent7Days: recent.length, datesVerified: checkedDates, sources: result.sources, checkedAt: result.checkedAt, jobs: result.jobs.map(({ title, source, url, level, minYears, postedAt, startsAt, dueAt, verification }) => ({ title, source, url, level, minYears, postedAt, startsAt, dueAt, verification })) };
      report.push(entry);
      console.log(JSON.stringify({ role: profile.role, level: profile.level, count: entry.count, recent7Days: recent.length, datesCompared: checkedDates.length, sources: result.sources }, null, 2));
      if (useGemini) assert.equal(result.sources.find(s => s.name.startsWith("Gemini"))?.status, "ok", "Gemini 인증/검색 확인 실패: 보고서의 출처 상태를 확인하세요.");
    }
  } finally {
    if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
    await mkdir("artifacts", { recursive: true });
    await writeFile(`artifacts/verification-${useGemini ? "gemini" : "live"}.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), gemini: useGemini, report }, null, 2));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "검증 실패"); process.exitCode = 1; });
