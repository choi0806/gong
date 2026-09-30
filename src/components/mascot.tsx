type MascotProps = { pose?: "paper" | "search" | "rest"; className?: string };

/** An original paper-loving companion, drawn as vectors for crisp motion. */
export function Mascot({ pose = "paper", className = "" }: MascotProps) {
  return <svg className={`mascot mascot-${pose} ${className}`} viewBox="0 0 280 280" fill="none" aria-hidden="true">
    <ellipse className="mascot-shadow" cx="143" cy="257" rx="75" ry="7" fill="#ededed" />
    <g className="mascot-body">
      <path className="mascot-tail" d="M194 181C230 210 249 179 244 162C238 148 226 167 218 166L196 156" fill="currentColor" />
      <path d="M80 100C74 79 72 41 88 38C100 36 112 54 119 59C135 54 151 54 164 59C176 45 185 34 194 40C202 47 201 77 198 96C215 120 215 157 204 191C199 208 192 221 183 228L179 245C176 263 151 263 148 246L144 225L123 225L117 246C112 264 87 258 89 240L94 216C65 193 61 135 80 100Z" fill="currentColor" />
      {pose === "rest" ? <>
        <path d="M98 105Q108 114 118 105M144 105Q154 114 164 105" stroke="white" strokeWidth="5" strokeLinecap="round" /><path d="M126 121Q132 126 138 121" stroke="white" strokeWidth="3" strokeLinecap="round" /><path d="M85 173C82 144 105 134 137 140C170 132 190 152 185 177C182 206 91 211 85 173Z" fill="white" /><path d="M102 168Q119 183 140 169M153 176L169 171" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /><path d="M218 79H235L219 97H237M237 53H247L237 66H249" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </> : <>
        <g className="mascot-eyes"><ellipse cx="113" cy="100" rx="17" ry="21" fill="white" /><ellipse cx="156" cy="98" rx="17" ry="21" fill="white" /><ellipse className="mascot-pupil" cx="117" cy="102" rx="6" ry="9" fill="currentColor" /><ellipse className="mascot-pupil" cx="160" cy="100" rx="6" ry="9" fill="currentColor" /></g>
        <path d="M131 120Q136 125 141 119" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
        <g className="mascot-paper"><path d="M80 142L164 134L189 154L195 216L89 226Z" fill="white" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" /><path d="M164 136L167 158L187 155" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M107 170L148 166M109 185L170 179M111 199L148 195" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="M78 151C55 145 58 172 84 178C97 181 104 168 94 161Z" fill="currentColor" /><path d="M194 165C180 149 161 161 171 174C182 188 204 184 204 173" fill="currentColor" /></g>
        {pose === "search" && <g className="mascot-glass" stroke="currentColor" strokeWidth="6" strokeLinecap="round"><circle cx="196" cy="111" r="25" fill="white" fillOpacity=".88" /><path d="M212 131L229 153" strokeWidth="12" /><path d="M182 110C182 103 187 99 193 98" strokeWidth="3" /></g>}
      </>}
    </g>
    {pose === "paper" && <g className="mascot-sparkles" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M40 84V100M32 92H48M230 58V72M223 65H237M232 225V235M227 230H237" /><path d="M48 188L43 195M53 199L46 202" /></g>}
  </svg>;
}

export function LoadingScene({ phase = "나에게 맞는 공고를 찾고 있어요", compact = false }: { phase?: string; compact?: boolean }) {
  return <div className={`loading-scene ${compact ? "loading-compact" : ""}`} role="status" aria-live="polite"><Mascot pose="search" /><div className="loading-copy"><span className="loading-kicker">공찾이가 찾는 중<span className="loading-dots" aria-hidden="true"><i /><i /><i /></span></span><p>{phase}</p><span className="loading-track" aria-hidden="true"><span /></span><small>꼭 맞는 기회를 데려올게요. 조금만 기다려주세요!</small></div></div>;
}
