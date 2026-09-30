import { validateProfile } from "@/lib/matching";
import { searchJobs } from "@/lib/search-cache";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 8000) return Response.json({ error: "요청이 너무 커요." }, { status: 413 });
  let profile;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 8000) return Response.json({ error: "요청이 너무 커요." }, { status: 413 });
    profile = validateProfile(JSON.parse(body));
  }
  catch { return Response.json({ error: "이력서를 다시 확인해주세요." }, { status: 400 }); }
  if (!profile) return Response.json({ error: "직무를 확인할 수 없어요. 관심 직무를 입력해주세요." }, { status: 400 });
  const result = await searchJobs(profile);
  const unavailable = result.sources.every(source => source.status !== "ok");
  return Response.json(result, { status: unavailable ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
