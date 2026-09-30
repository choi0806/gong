import { ArrowUpRight, Bookmark, BriefcaseBusiness, Check, CircleAlert, FileCheck, Info, MapPin, Sparkles, X } from "lucide-react";
import type { Fit, Job } from "@/lib/matching";
import { displayDate } from "@/lib/job-dates";
import { fitLabel } from "@/lib/fit";

export function FitBadge({ fit, onExplain }: { fit: Fit; onExplain?: () => void }) {
  const tone = fit.score >= 80 ? "high" : fit.score >= 60 ? "mid" : "low";
  const body = <><strong>{fit.score}</strong><span>{fitLabel(fit.score)}</span>{onExplain && fit.breakdown && <small>근거 보기</small>}</>;
  return onExplain && fit.breakdown
    ? <button className={`fit-badge fit-${tone}`} onClick={onExplain} aria-label={`이력서 적합도 ${fit.score}점, ${fitLabel(fit.score)}. 점수 근거 보기`}>{body}</button>
    : <div className={`fit-badge fit-${tone}`} aria-label={`이력서 적합도 ${fit.score}점, ${fitLabel(fit.score)}`}>{body}</div>;
}

// Why the score is what it is: each part with its reason, then the reference spec comparison.
export function FitExplain({ fit }: { fit: Fit }) {
  if (!fit.breakdown) return <p className="detail-note">이 공고는 이전 버전에서 저장돼 점수 근거가 없어요. 이력서를 올리고 다시 찾으면 근거를 볼 수 있어요.</p>;
  const lost = fit.breakdown.filter(part => part.max - part.points >= 0.5).sort((a, b) => (b.max - b.points) - (a.max - a.points));
  return <div className="fit-explain">
    <p className="fit-explain-lead"><strong>{fit.score}점</strong>{lost.length ? <> · 가장 많이 깎인 항목은 <strong>{lost[0].label}</strong>(-{Math.round(lost[0].max - lost[0].points)}점)이에요.</> : " · 확인한 모든 항목을 충족했어요."}</p>
    <ol className="score-parts">{fit.breakdown.map(part => <li key={part.label}>
      <div className="score-part-head"><span>{part.label}</span><strong>{part.points % 1 ? part.points.toFixed(1) : part.points}<small>/{part.max}</small></strong></div>
      <div className="score-bar" aria-hidden="true"><span style={{ width: `${Math.round(100 * part.points / part.max)}%` }} /></div>
      <p>{part.detail}</p>
    </li>)}</ol>
    {fit.benchmark && fit.benchmark.rows.length > 0 && <section className="benchmark">
      <h3>{fit.benchmark.tier} · {fit.benchmark.family} 직군 평균 스펙과 비교</h3>
      <table><thead><tr><th scope="col">항목</th><th scope="col">참고 기준</th><th scope="col">내 이력서</th></tr></thead>
        <tbody>{fit.benchmark.rows.map(row => <tr key={row.label} className={row.met ? "is-met" : "is-missing"}><th scope="row">{row.label}</th><td>{row.expected}</td><td>{row.met ? <Check size={13} aria-label="충족" /> : <X size={13} aria-label="부족" />}{row.mine}</td></tr>)}</tbody>
      </table>
    </section>}
    <p className="detail-note fit-disclaimer"><Info size={12} />평균 스펙은 기업 규모(회사명 기준 추정)와 직군에서 흔히 요구되는 수준을 공찾이 정한 참고 기준이에요. 실제 합격자 통계가 아니며, &quot;확인 안 됨&quot;은 이력서 텍스트에서 찾지 못했다는 뜻이에요.</p>
  </div>;
}

export function FitSummary({ fit }: { fit: Fit }) {
  const gaps = fit.gaps.slice(0, 4);
  return <dl className="fit-summary">
    <div><dt><FileCheck size={13} />제출 서류</dt><dd>{fit.documentsStated ? fit.documents.join(" · ") : <span className="fit-unknown">공고에 명시 안 됨 · 원문 확인</span>}</dd></div>
    <div><dt><CircleAlert size={13} />부족한 부분</dt><dd>{gaps.length ? <span className="gap-tags">{gaps.map(gap => <span key={`${gap.kind}-${gap.label}`} className={gap.kind === "benchmark" ? "is-benchmark" : gap.preferred ? "is-preferred" : ""}>{gap.label}{gap.kind === "benchmark" ? <small>평균</small> : gap.preferred && <small>우대</small>}</span>)}{fit.gaps.length > gaps.length && <span className="gap-more">+{fit.gaps.length - gaps.length}</span>}</span> : <span className="fit-ok">공고에 적힌 요건 중 빠진 게 없어요</span>}</dd></div>
  </dl>;
}

export function JobCard({ job, saved, onSave, onDetail, onExplain, index }: { job: Job; saved: boolean; onSave: () => void; onDetail: () => void; onExplain: () => void; index: number }) {
  return <article className="job-card" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
    {job.fit ? <FitBadge fit={job.fit} onExplain={onExplain} /> : <div className="company-logo" aria-hidden="true">{job.company.slice(0, 1)}</div>}
    <div className="job-body"><div className="job-company"><strong>{job.company}</strong><span className="source-label">{job.source}</span></div>
      <button className="job-title" onClick={onDetail}>{job.title}</button>
      <div className="job-meta"><span><MapPin size={13} />{job.location}</span><span><BriefcaseBusiness size={13} />{job.experience || (job.level === "전체" ? "원문 확인" : job.level)}</span></div>
      <div className="job-meta job-dates"><span>등록 {displayDate(job.postedAt)}</span><span>{job.dueAt ? `마감 ${displayDate(job.dueAt)}` : job.deadlineLabel ? `${job.deadlineLabel} · 원문 확인` : "마감일 미확인 · 원문 확인"}</span><span>{job.verification === "detail" ? "상세 원문 확인" : "채용 목록 확인"}</span></div>
      {job.fit ? <FitSummary fit={job.fit} /> : <p className="job-reason"><Sparkles size={13} />{job.reason}</p>}
      {job.skills.length > 0 && <div className="skill-tags">{job.skills.slice(0, 4).map(skill => <span key={skill}>{skill}</span>)}</div>}
    </div>
    <div className="job-actions"><button className={`icon-button bookmark-button ${saved ? "is-saved" : ""}`} aria-label={`${job.title} ${saved ? "저장 취소" : "저장"}`} aria-pressed={saved} onClick={onSave}><Bookmark size={19} fill={saved ? "currentColor" : "none"} /></button><a href={job.url} target="_blank" rel="noopener noreferrer" className="job-open" aria-label={`${job.title} 공고 보기`}>공고 보기<ArrowUpRight size={15} /></a></div>
  </article>;
}
