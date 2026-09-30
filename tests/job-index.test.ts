import test from "node:test";
import assert from "node:assert/strict";
import { collectSaramin, collectWanted } from "../src/lib/job-index";

const saraminPage = (ids: number[], total = ids.length) => `<div>${ids.map(id => `<div class="item_recruit"><h2 class="job_tit"><a href="/zf_user/jobs/relay/view?rec_idx=${id}">프론트엔드 개발자 ${id}</a></h2><strong class="corp_name">기업${id}</strong><div class="job_condition"><span>서울</span><span>신입</span></div></div>`).join("")}${"<div class=\"item_recruit\"></div>".repeat(Math.max(0, total - ids.length))}</div>`;

test("Wanted collection pages to the end and tags role categories", async () => {
  const original = globalThis.fetch, offsets: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); offsets.push(url.searchParams.get("offset")!);
    const start = Number(url.searchParams.get("offset")), count = start === 0 ? 100 : 7;
    return Response.json({ data: Array.from({ length: count }, (_, i) => ({ id: start + i + 1, status: "active", position: `포지션 ${start + i}`, company: { name: "회사" }, address: { location: "서울" }, category_tags: [{ parent_id: 518, id: 669 }] })), links: { next: start === 0 ? "next" : null } });
  };
  try {
    const jobs = await collectWanted(AbortSignal.timeout(5000));
    assert.deepEqual(offsets, ["0", "100"]);
    assert.equal(jobs.length, 107);
    assert.match(jobs[0].category || "", /프론트엔드/);
  } finally { globalThis.fetch = original; }
});

test("Saramin collection stops at the last page and deduplicates across keywords", async () => {
  const original = globalThis.fetch, pages: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); pages.push(`${url.searchParams.get("searchword")}:${url.searchParams.get("recruitPage")}`);
    const page = Number(url.searchParams.get("recruitPage"));
    return new Response(page === 1 ? saraminPage([1, 2, 3], 100) : saraminPage([3, 4]));
  };
  try {
    const jobs = await collectSaramin(["프론트엔드", "웹"], 30, AbortSignal.timeout(10000));
    assert.deepEqual(pages, ["프론트엔드:1", "프론트엔드:2", "웹:1", "웹:2"]);
    assert.deepEqual(jobs.map(job => job.id).sort(), ["saramin-1", "saramin-2", "saramin-3", "saramin-4"]);
  } finally { globalThis.fetch = original; }
});
