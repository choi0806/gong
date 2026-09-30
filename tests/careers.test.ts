import test from "node:test";
import assert from "node:assert/strict";
import { parseGreeting, parseGreetingDetail, parseKakao, parseNaver, parseToss, parseWoowahan, withRegion } from "../src/lib/careers";
const checkedAt = "2026-09-29T00:00:00Z";
const nextPage = (queries: unknown[]) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { dehydratedState: { queries } } } })}</script></html>`;

test("region prefix lets city-only locations pass the region filter", () => {
  assert.equal(withRegion("판교"), "경기 판교");
  assert.equal(withRegion("서울특별시 강남구"), "서울특별시 강남구");
  assert.equal(withRegion(""), "원문 확인");
});

test("Toss keeps visible Korean roles, reads years and hides closed or hidden jobs", () => {
  const meta = (extra: object[] = []) => [{ name: "Employment_Type", value: "정규직" }, { name: "포지션의 소속 자회사를 선택해 주세요.", value: "토스뱅크" }, { name: "Job Description을 작성해 주세요.", value: "# 자격\n- React 3년 이상 경험" }, ...extra];
  const jobs = parseToss({ success: [
    { id: 1, title: "Frontend Developer", location: { name: "Seoul" }, first_published: "2026-09-01T00:00:00-04:00", metadata: meta() },
    { id: 2, title: "Hidden", location: { name: "Seoul" }, metadata: meta([{ name: "커리어페이지 메뉴에 \"미노출\" 되어야 하는 Job인가요?", value: true }]) },
    { id: 3, title: "Closed", location: { name: "Seoul" }, metadata: meta([{ name: "커리어페이지 채용공고 클로징 일자 (서류접수 마감일이 정해진 경우)", value: "2020-01-01" }]) },
    { id: 4, title: "Brazil role", location: { name: "Brazil" }, metadata: meta() },
  ] }, checkedAt);
  assert.deepEqual(jobs.map(j => j.id), ["toss-1"]);
  assert.equal(jobs[0].company, "토스뱅크");
  assert.equal(jobs[0].minYears, 3);
  assert.equal(jobs[0].location, "서울");
  assert.match(jobs[0].description, /React/);
  assert.throws(() => parseToss({ success: null }, checkedAt), /schema/);
});

test("Kakao uses the real job id, full description and skips closed or private offers", () => {
  const jobs = parseKakao({ jobList: [
    { realId: "P-1", jobOfferTitle: "프론트엔드 개발자 (경력)", qualification: "React 경력 3년 이상", workContentDesc: "웹 개발<br/>", locationName: "판교", companyName: "카카오", regDate: "2026-09-01T10:00:00", skillSetList: [{ skillSetName: "React" }] },
    { realId: "P-2", jobOfferTitle: "closed", closeFlag: true },
    { realId: "P-3", jobOfferTitle: "private", privateFlag: true },
  ] }, checkedAt);
  assert.deepEqual(jobs.map(j => j.url), ["https://careers.kakao.com/jobs/P-1"]);
  assert.equal(jobs[0].location, "경기 판교");
  assert.equal(jobs[0].minYears, 3);
  assert.equal(jobs[0].level, "경력");
  assert.deepEqual(jobs[0].skills, ["React"]);
});

test("Naver maps entry type and keeps exact reception times", () => {
  const jobs = parseNaver({ list: [
    { annoId: 10, annoSubject: "[NAVER] 서비스 기획 (신입)", entTypeCdNm: "신입", empTypeCdNm: "정규", stateCdNm: "채용진행중", staYmdTime: "2026.09.01 10:00:00", endYmdTime: "2099.10.06 10:00:00" },
    { annoId: 11, annoSubject: "인턴", entTypeCdNm: "신입", empTypeCdNm: "인턴", stateCdNm: "채용진행중", endYmdTime: "2099.10.06 10:00:00" },
    { annoId: 12, annoSubject: "마감", entTypeCdNm: "경력", stateCdNm: "채용마감" },
  ] }, checkedAt);
  assert.deepEqual(jobs.map(j => [j.id, j.level]), [["naver-10", "신입"], ["naver-11", "인턴"]]);
  assert.equal(jobs[0].dueAt, "2099-10-06T10:00:00+09:00");
});

test("Woowahan treats unlimited end dates as open and -1 years as any experience", () => {
  const jobs = parseWoowahan({ data: { list: [
    { recruitNumber: "R1", recruitName: "백엔드 개발", careerRestrictionMinYears: 5, careerRestrictionMaxYears: 10, isUnlimitedEndDate: true, recruitEndDate: "9999-12-31 00:00:00", recruitOpenDate: "2026-09-01 10:00:00" },
    { recruitNumber: "R2", recruitName: "배민 영업(신규업주/전국)", careerRestrictionMinYears: -1, isUnlimitedEndDate: true },
    { recruitNumber: "R3", recruitName: "종료", isAfterOrEqualEndDay: true },
  ] } }, checkedAt);
  assert.deepEqual(jobs.map(j => [j.id, j.experience, j.dueAt]), [["woowahan-R1", "경력 5~10년", undefined], ["woowahan-R2", "경력 무관", undefined]]);
  assert.equal(jobs[0].url, "https://career.woowahan.com/recruitment/R1/detail");
});

test("GreetingHR reads openings from page data and detail pages add the description", () => {
  const opening = (id: number, careerType: string, employmentType = "FULL_TIME_WORKER", extra = {}) => ({ openingId: id, title: `포지션 ${id}`, deploy: true, openDate: "2026-09-01T00:00:00Z", openingJobPosition: { openingJobPositions: [{ workspaceOccupation: { occupation: "Frontend" }, workspacePlace: { place: "서울특별시 강남구" }, jobPositionCareer: { careerType, careerFrom: careerType === "EXPERIENCED" ? 3 : null }, jobPositionEmployment: { employmentType } }] }, ...extra });
  const html = nextPage([{ queryKey: ["openings"], state: { data: [opening(1, "NEW_COMER"), opening(2, "EXPERIENCED"), opening(3, "NOT_MATTER", "INTERN_WORKER"), opening(4, "NEW_COMER", "FULL_TIME_WORKER", { dueDate: "2020-01-01T00:00:00Z" })] } }]);
  const jobs = parseGreeting(html, "kurly.career.greetinghr.com", "컬리", checkedAt);
  assert.deepEqual(jobs.map(j => [j.id.split("-").pop(), j.level, j.minYears]), [["1", "신입", 0], ["2", "경력", 3], ["3", "인턴", 0]]);
  assert.equal(jobs[0].url, "https://kurly.career.greetinghr.com/ko/o/1");
  assert.throws(() => parseGreeting("<html></html>", "x", "x", checkedAt), /schema/);
  const detail = (status: string) => nextPage([{ queryKey: ["career", "getOpeningById", {}], state: { data: { data: { openingsInfo: { openingId: 1, status, detail: "<p>React 필수</p><p>제출서류: 이력서, 포트폴리오</p>" } } } } }]);
  const full = parseGreetingDetail(detail("OPEN"), jobs[0], checkedAt)!;
  assert.equal(full.verification, "detail");
  assert.match(full.description, /포트폴리오/);
  assert.equal(parseGreetingDetail(detail("CLOSED"), jobs[0], checkedAt), null);
});
