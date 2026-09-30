"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronDown, FileText, Info, LockKeyhole, Plus, RefreshCw, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { FitBadge, FitExplain, FitSummary, JobCard } from "@/components/job-card";
import { Modal } from "@/components/modal";
import { LoadingScene, Mascot } from "@/components/mascot";
import { analyzeText, LEVELS, type Job, type Level, type Profile, type SearchResult } from "@/lib/matching";
import { extractText, MAX_FILES, MAX_FILE_SIZE } from "@/lib/extract";
import { displayDate } from "@/lib/job-dates";
import { assessFit, isFit } from "@/lib/fit";

const STORAGE_KEY = "gongchat:saved:v2";
const PAGE_SIZE = 30;
const LOCATIONS = ["전국", "서울", "경기", "인천", "부산", "대전", "대구", "광주", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
type View = "find" | "saved";
type Filters = { level: Level; recentDays: number; sort: NonNullable<Profile["sort"]>; location: string };
const filtersOf = (p: Profile): Filters => ({ level: p.level, recentDays: p.recentDays || 0, sort: p.sort || "relevance", location: p.location || "전국" });

export default function Home() {
  const [view, setView] = useState<View>("find");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [detail, setDetail] = useState<Job | null>(null);
  const [explain, setExplain] = useState<Job | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [unknownRole, setUnknownRole] = useState(false);
  const [manualRole, setManualRole] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<Level>("전체");
  const [source, setSource] = useState("전체 채널");
  const [saved, setSaved] = useState<Job[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [draft, setDraft] = useState<Filters | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  // Full resume text stays in this tab's memory only; it is used to score fit locally.
  const resumeText = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) setSaved(stored.filter((job): job is Job => !!job && !job.sample && typeof job.id === "string" && typeof job.title === "string" && typeof job.company === "string" && typeof job.source === "string" && typeof job.description === "string" && typeof job.location === "string" && typeof job.url === "string" && /^https:\/\//.test(job.url) && Array.isArray(job.skills) && job.skills.every((s: unknown) => typeof s === "string") && LEVELS.includes(job.level)).map(job => isFit(job.fit) ? job : { ...job, fit: undefined }).slice(0, 100));
    } catch { /* Storage can be disabled by the browser. */ }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  function changeView(next: View) {
    setView(next); setSource("전체 채널"); setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function addFiles(incoming: FileList | File[]) {
    if (busy) return;
    setError("");
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (!/\.(pdf|docx|txt)$/i.test(file.name)) { setError("PDF, DOCX, TXT 파일을 넣어주세요."); continue; }
      if (file.size > MAX_FILE_SIZE) { setError("파일 하나당 5MB까지 넣을 수 있어요."); continue; }
      if (next.some(f => f.name === file.name && f.size === file.size)) continue;
      if (next.length >= MAX_FILES) { setError("파일은 최대 2개까지 넣을 수 있어요."); break; }
      next.push(file);
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }
  async function fetchJobs(next: Profile) {
    setPhase("채용 사이트에서 공고를 찾고 있어요");
    const response = await fetch("/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next), signal: AbortSignal.timeout(55000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.message || "공고를 가져오지 못했어요. 다시 시도해주세요.");
    setProfile(next); setResult(data); setDraft(filtersOf(next)); setSource("전체 채널"); setVisible(PAGE_SIZE);
    setTimeout(() => { window.scrollTo({ top: 0, behavior: "smooth" }); headingRef.current?.focus({ preventScroll: true }); }, 50);
  }
  async function findJobs() {
    if (inFlight.current) return;
    if (!files.length) { inputRef.current?.click(); return; }
    inFlight.current = true; setBusy(true); setError(""); setPhase("이력서와 포트폴리오를 읽고 있어요");
    try {
      const texts: string[] = [];
      for (const file of files) texts.push(await extractText(file));
      resumeText.current = [...texts, ...files.map(f => f.name)].join("\n");
      const extracted = analyzeText(texts.join("\n"));
      if (manualRole.trim()) extracted.role = manualRole.trim();
      if (selectedLevel !== "전체") { extracted.level = selectedLevel; extracted.years = undefined; }
      if (!extracted.role) { setUnknownRole(true); setError("파일에서 직무를 찾지 못했어요. 관심 직무만 알려주세요."); return; }
      await fetchJobs(extracted);
    } catch (cause) {
      setError(cause instanceof Error && !["TimeoutError", "AbortError"].includes(cause.name) ? cause.message : "검색이 늦어지고 있어요. 잠시 후 다시 눌러주세요.");
    } finally { inFlight.current = false; setBusy(false); setPhase(""); }
  }
  async function research(level?: Level, changes: Partial<Profile> = {}) {
    if (!profile || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await fetchJobs({ ...profile, ...changes, ...(level ? { level, years: undefined } : {}) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "검색을 완료하지 못했어요. 다시 시도해주세요."); }
    finally { inFlight.current = false; setBusy(false); setPhase(""); }
  }
  function applyFilters() {
    if (!draft || !profile) return;
    const { level, ...rest } = draft;
    research(level !== profile.level ? level : undefined, rest);
  }
  function resetUpload() { resumeText.current = ""; setDraft(null); setResult(null); setProfile(null); setError(""); setSource("전체 채널"); setUnknownRole(false); setManualRole(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function toggleSave(job: Job) {
    if (!storageReady) return;
    const exists = saved.some(s => s.id === job.id);
    const next = exists ? saved.filter(s => s.id !== job.id) : [...saved, job].slice(-100);
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setToast(exists ? "저장을 취소했어요." : "공고를 저장했어요."); }
    catch { setToast("이번 방문 동안만 저장할 수 있어요."); }
  }
  const scoredJobs = useMemo(() => {
    const jobs = result?.jobs || [];
    if (!profile || !resumeText.current) return jobs;
    const scored = jobs.map(job => ({ ...job, fit: assessFit(job, profile, resumeText.current) }));
    return profile.sort === "latest" ? scored : scored.sort((a, b) => b.fit.score - a.fit.score);
  }, [result, profile]);
  const savedJobs = useMemo(() => profile && resumeText.current ? saved.map(job => ({ ...job, fit: assessFit(job, profile, resumeText.current) })) : saved, [saved, profile]);
  const filtersChanged = !!draft && !!profile && JSON.stringify(draft) !== JSON.stringify(filtersOf(profile));
  const allJobs = view === "saved" ? savedJobs : scoredJobs;
  const jobs = allJobs.filter(job => source === "전체 채널" || job.source === source);
  const channels = [...new Set(allJobs.map(job => job.source))];
  const showResults = view === "saved" || !!result;

  return <>
    <a className="skip-link" href="#main">본문으로 건너뛰기</a>
    <header className="site-header"><div className="header-inner">
      <button className="brand-button" aria-label="공찾 홈" onClick={() => changeView("find")}><Brand /></button>
      <nav aria-label="주요 메뉴"><button className={`nav-item ${view === "find" ? "active" : ""}`} aria-current={view === "find" ? "page" : undefined} onClick={() => changeView("find")}>공고 찾기</button><button className={`nav-item ${view === "saved" ? "active" : ""}`} aria-current={view === "saved" ? "page" : undefined} onClick={() => changeView("saved")}>저장한 공고{saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button></nav>
      <span className="header-note"><span />작은 시작, 딱 맞는 기회.</span>
    </div></header>

    <main id="main" className={showResults ? "results-main" : "upload-main"}>
      {!showResults ? <section className="upload-screen" aria-labelledby="upload-title">
        <div className="hero">
          <div className="hero-copy"><span className="intro-tag"><Sparkles size={14} />취업 준비에, 작은 지원군</span><h1 id="upload-title">이력서는 툭.<br />공고는 <span className="title-emphasis">척척.</span></h1><p className="intro-description">어디서부터 찾아야 할지 막막할 때,<br />이력서만 올려주세요. 딱 맞는 기회를 함께 찾을게요.</p></div>
          <div className="hero-art"><span className="mascot-bubble">내가 찾아줄게!</span><Mascot /><span className="mascot-caption">당신의 다음 시작을 찾는 공찾이</span></div>
        </div>
        <div className={`upload-card ${busy ? "is-busy" : ""}`}>
          <div className="upload-card-heading"><span><span className="step-number">01</span>나를 소개하는 파일 한 장</span><span className="upload-optional">포트폴리오도 좋아요!</span></div>
          <input ref={inputRef} id="resume-files" type="file" accept=".pdf,.docx,.txt" multiple hidden disabled={busy} onChange={event => event.target.files && addFiles(event.target.files)} />
          <div className={`dropzone ${dragging ? "is-dragging" : ""} ${files.length ? "has-files" : ""}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
            {busy ? <LoadingScene phase={phase} compact /> : files.length ? <div className="file-list">{files.map(file => <div className="file-row" key={`${file.name}-${file.size}`}><span className="file-icon"><FileText size={22} /></span><div><strong>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024))} KB</span></div><button className="icon-button" aria-label={`${file.name} 삭제`} onClick={() => setFiles(previous => previous.filter(f => f !== file))} disabled={busy}><X size={17} /></button></div>)}{files.length < MAX_FILES && <button className="add-file" onClick={() => inputRef.current?.click()} disabled={busy}><Plus size={15} />파일 추가하기</button>}</div> : <button className="dropzone-target" onClick={() => inputRef.current?.click()} disabled={busy}><span className="upload-icon"><FileText size={30} strokeWidth={1.5} /><span><Plus size={12} /></span></span><strong>이력서 또는 포트폴리오 넣기</strong><span>클릭하거나 파일을 여기로 끌어오세요</span><small>PDF, DOCX, TXT · 파일당 5MB · 최대 2개</small></button>}
          </div>
          {unknownRole && <label className="role-input">관심 직무<input value={manualRole} onChange={event => setManualRole(event.target.value)} maxLength={60} placeholder="예: 프론트엔드 개발자, 마케터" disabled={busy} autoFocus /></label>}
          <div className="search-options"><label>찾는 경력 조건<select value={selectedLevel} onChange={event => setSelectedLevel(event.target.value as Level)} disabled={busy}>{LEVELS.map(level => <option key={level} value={level}>{level === "전체" ? "이력서에서 판단" : level}</option>)}</select></label></div>
          <div className="upload-actions"><span className="action-eyebrow">YOUR NEXT CHAPTER</span><h2>다음 기회,<br />찾으러 가볼까요?</h2><p>여러 채용 사이트의 공고를<br />한곳에서 만나보세요.</p><button className="primary-button find-button" onClick={findJobs} disabled={busy}><Search size={18} /><span>{busy ? "열심히 찾고 있어요" : "나에게 맞는 공고 찾기"}</span>{!busy && <ArrowRight size={18} />}</button></div>
          {error && <p className="error-message" role="alert"><Info size={16} />{error}</p>}
        </div>
        <p className="privacy-note"><LockKeyhole size={12} />파일 원본은 전송·저장하지 않아요. 직무와 기술 키워드로 검색해요.</p>
        <div className="source-note"><span>기회는 여러 곳에,<br />찾는 건 한 번에.</span><div><strong>원티드<span>wanted</span></strong><strong>잡코리아<span>JOBKOREA</span></strong><strong>점핏<span>jumpit</span></strong><strong>기업 채용사이트<span>CAREERS</span></strong></div><Sparkles size={23} aria-hidden="true" /></div>
      </section> : <section aria-labelledby="results-title">
        {view === "find" && <div className="results-topline"><button className="text-button" onClick={resetUpload} disabled={busy}><ArrowLeft size={15} />파일 바꾸기</button><span><FileText size={13} />{files.map(f => f.name).join(" + ")}</span><button className="text-button" onClick={() => research()} disabled={busy}><RefreshCw size={14} className={busy ? "spin" : ""} />다시 찾기</button></div>}
        <div className="results-heading"><div><span className="eyebrow">{view === "saved" ? "MY SAVED JOBS" : "YOUR NEXT OPPORTUNITY"}</span><h1 id="results-title" ref={headingRef} tabIndex={-1}>{view === "saved" ? "저장한 공고" : "이런 공고, 어때요?"}<span className="count">{allJobs.length}</span></h1><p>{view === "saved" ? "마음에 드는 기회를 모아두었어요." : `${profile?.role} · ${profile?.skills.slice(0, 3).join(" · ") || "직무와 경험을 기준으로 추천했어요"}`}</p></div>{view === "find" && result && <span className="checked-label"><span />{new Date(result.checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 조회</span>}</div>
        {view === "find" && result?.index && <p className="coverage-note">{result.index.total ? <><strong>전체 {result.index.total.toLocaleString("ko-KR")}건</strong> 중 조건에 맞는 공고 <strong>{(result.matched ?? allJobs.length).toLocaleString("ko-KR")}건</strong>{(result.matched ?? 0) > allJobs.length && ` (적합도 상위 ${allJobs.length}건 표시)`} · {result.index.sources.filter(source => source.status === "ok").length}개 채널 수집{result.index.updatedAt && ` · ${new Date(result.index.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 기준`}{result.index.collecting && " · 새로 수집 중"}</> : result.index.collecting ? <>전체 공고를 수집하는 중이에요{result.index.progress && ` (${result.index.progress})`}. 지금은 실시간 검색 결과만 보여요.</> : null}</p>}
        {error && <p className="error-message" role="alert"><Info size={16} />{error}</p>}
        {view === "find" && <div className="filter-bar"><div className="filter-chips" aria-label="찾는 경력 조건">{LEVELS.map(level => <button key={level} className={draft?.level === level ? "selected" : ""} aria-pressed={draft?.level === level} disabled={busy} onClick={() => draft && setDraft({ ...draft, level })}>{level}</button>)}</div><label className="select-wrap"><span className="sr-only">채용 채널</span><select value={source} onChange={event => { setSource(event.target.value); setVisible(PAGE_SIZE); }} disabled={busy}><option>전체 채널</option>{channels.map(channel => <option key={channel}>{channel}</option>)}</select><ChevronDown size={14} /></label></div>}
        {view === "find" && draft && <div className="search-options"><label>등록 기간<select aria-label="등록 기간" value={draft.recentDays} disabled={busy} onChange={event => setDraft({ ...draft, recentDays: Number(event.target.value) })}><option value={0}>전체 기간</option><option value={7}>최근 7일</option><option value={14}>최근 14일</option><option value={30}>최근 30일</option></select></label><label>정렬<select aria-label="정렬" value={draft.sort} disabled={busy} onChange={event => setDraft({ ...draft, sort: event.target.value as Filters["sort"] })}><option value="relevance">적합도순</option><option value="latest">최신 등록순</option></select></label><label>지역<select aria-label="지역" value={draft.location} disabled={busy} onChange={event => setDraft({ ...draft, location: event.target.value })}>{LOCATIONS.map(location => <option key={location}>{location}</option>)}</select></label><div className="filter-apply">{filtersChanged && <button className="text-button" disabled={busy} onClick={() => profile && setDraft(filtersOf(profile))}>되돌리기</button>}<button className="primary-button" disabled={busy || !filtersChanged} onClick={applyFilters}><Search size={15} />{filtersChanged ? "이 조건으로 재검색" : "재검색"}</button></div><small>조건을 모두 고른 뒤 재검색을 눌러주세요. 최근 공고는 등록일이 확인된 공고만 표시해요. 인턴은 인턴 명시 공고만 찾아요. 적합도는 이 브라우저에서 이력서와 공고 내용을 비교해 계산해요.</small></div>}
        {busy && <div className="search-progress"><LoadingScene phase={phase} compact /></div>}
        <div aria-busy={busy} className={busy ? "results-loading" : ""}>
          {jobs.length ? <div className="job-list">{jobs.slice(0, visible).map((job, index) => <JobCard key={job.id} job={job} index={index} saved={saved.some(s => s.id === job.id)} onSave={() => toggleSave(job)} onDetail={() => setDetail(job)} onExplain={() => setExplain(job)} />)}{jobs.length > visible && <button className="secondary-button more-button" onClick={() => setVisible(count => count + PAGE_SIZE)}>더 보기<span>{(jobs.length - visible).toLocaleString("ko-KR")}건 남음</span><ChevronDown size={15} /></button>}</div> : <div className="empty-state"><Mascot pose={view === "saved" ? "rest" : "search"} /><h2>{view === "saved" ? "아직 저장한 공고가 없어요" : "이 조건에 맞는 공고를 찾지 못했어요"}</h2><p>{view === "saved" ? "공고의 북마크를 누르면 여기에 모아드려요." : "경력 조건을 넓히거나 잠시 후 다시 찾아보세요."}</p><button className="secondary-button" disabled={busy} onClick={() => view === "saved" ? changeView("find") : source !== "전체 채널" ? setSource("전체 채널") : research("전체", { recentDays: 0, location: "전국" })}>{view === "saved" ? "공고 찾으러 가기" : "전체 조건으로 찾기"}<ArrowRight size={15} /></button></div>}
        </div>
        {view === "find" && result && <div className="result-notes"><p>{result.message}</p><details><summary>검색한 채널 확인<ChevronDown size={13} /></summary><div className="source-statuses">{result.sources.map(item => <span key={item.name} className={item.status !== "ok" ? "source-failed" : ""}>{item.status === "ok" ? <Check size={12} /> : <Info size={12} />}{item.name}<small>{item.status === "ok" ? `${item.count}건 수집 (조건 적용 전)` : item.status === "skipped" ? "검색 대기" : "연결 실패"}{item.message && ` · ${item.message}`}</small></span>)}</div></details>{result.searchSuggestions && <iframe className="search-suggestions" title="Google 검색 제안" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={result.searchSuggestions} />}</div>}
      </section>}
    </main>
    <footer className="site-footer"><span>공찾 · 나에게 맞는 다음 기회</span><button onClick={() => setPrivacy(true)}>개인정보 안내</button></footer>
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    {privacy && <Modal title="파일은 내 브라우저에서 읽어요" onClose={() => setPrivacy(false)}><div className="privacy-content"><ShieldCheck size={32} /><p>이력서·포트폴리오 원본과 전체 텍스트는 서버에 전송하거나 저장하지 않아요. 문서에서 찾은 직무, 기술, 경력 조건만 서버로 보내 공고를 검색합니다.</p><p>공개 채용 목록의 직무와 요구 기술을 비교해 추천해요. Gemini 키가 설정되면 직무·기술·경력·지역을 Google Gemini와 Google 검색에도 보내요. 무료 Gemini 서비스에 전송한 데이터는 Google의 제품 개선에 사용될 수 있어요. 이름과 연락처는 검색에 사용하지 않습니다. 스캔 이미지와 HWP는 아직 지원하지 않아요.</p><p>저장한 공고는 이 브라우저에만 남아요. 북마크를 다시 누르거나 사이트 데이터를 지우면 삭제할 수 있어요.</p></div></Modal>}
    {explain?.fit && <Modal title="적합도 점수 근거" onClose={() => setExplain(null)}><div className="detail-meta"><span>{explain.company}</span><span>{explain.title}</span></div><FitExplain fit={explain.fit} /><div className="detail-actions"><button className="secondary-button" onClick={() => { setDetail(explain); setExplain(null); }}>공고 상세 보기</button><a className="primary-button" href={explain.url} target="_blank" rel="noopener noreferrer">공고 원문 보기<ArrowUpRight size={17} /></a></div></Modal>}
    {detail && <Modal title={detail.title} onClose={() => setDetail(null)}><div className="detail-meta"><span>{detail.company}</span><span>{detail.source}</span></div>{detail.fit ? <div className="detail-fit"><FitBadge fit={detail.fit} onExplain={() => { setExplain(detail); setDetail(null); }} /><div><FitSummary fit={detail.fit} />{detail.fit.matched.length > 0 && <p className="fit-matched"><Check size={13} />이력서에서 확인: {detail.fit.matched.join(" · ")}</p>}{detail.fit.gaps.length > 4 && <p className="fit-matched">부족한 부분 전체: {detail.fit.gaps.map(g => g.preferred ? `${g.label}(우대)` : g.label).join(" · ")}</p>}</div></div> : <div className="match-reason"><Sparkles size={17} /><span>{detail.reason || "이력서의 직무·기술과 관련된 공고예요."}</span></div>}<div className="detail-facts"><span>{detail.location}</span><span>{detail.experience || detail.level}</span></div><div className="detail-facts"><span>등록일 {displayDate(detail.postedAt)}</span><span>접수 시작 {displayDate(detail.startsAt)}</span><span>접수 마감 {detail.dueAt ? displayDate(detail.dueAt) : detail.deadlineLabel || "미확인 · 원문 확인"}</span></div><p className="detail-note">{detail.checkedAt ? `${displayDate(detail.checkedAt)} 조회 · ` : ""}{detail.verification === "detail" ? "상세 원문 확인" : "채용 목록 확인"}</p><p className="detail-description">{detail.description}</p><p className="detail-note">모집 상태와 세부 지원 조건은 공고 원문에서 확인해주세요.</p><div className="detail-actions"><button className="secondary-button" onClick={() => toggleSave(detail)}><Bookmark size={17} fill={saved.some(s => s.id === detail.id) ? "currentColor" : "none"} />{saved.some(s => s.id === detail.id) ? "저장됨" : "저장"}</button><a className="primary-button" href={detail.url} target="_blank" rel="noopener noreferrer">공고 원문 보기<ArrowUpRight size={17} /></a></div></Modal>}
  </>;
}
