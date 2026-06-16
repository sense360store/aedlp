/* ============================================================
   AEDLP Policy Creator — helpers, icons, UI primitives
   Exposed on window for the other Babel script scopes.
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

/* ---------- icons (inline, single-stroke) ---------- */
const Icon = ({ name, size = 16, className = "", style }) => {
  const s = { width: size, height: size, ...style };
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", className, style: s };
  const paths = {
    shield: <><path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 8.5C7.9 19.4 5 16.2 5 12V6l7-3z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></>,
    moon: <><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    chevron: <><path d="m9 6 6 6-6 6"/></>,
    chevronDown: <><path d="m6 9 6 6 6-6"/></>,
    sparkle: <><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z"/></>,
    x: <><path d="M18 6 6 18M6 6l12 12"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <><path d="M5 12h14"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    alert: <><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></>,
    danger: <><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></>,
    flask: <><path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.4 2h11.2A1.5 1.5 0 0 0 19 19l-5-10V3"/><path d="M7.5 14h9"/></>,
    code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></>,
    download: <><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    tag: <><path d="M3 7v5l8 8 7-7-8-8H5a2 2 0 0 0-2 2z"/><path d="M7.5 7.5h.01"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2M16 7l2 2"/></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></>,
    doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
    trash: <><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></>,
    bolt: <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></>,
    funnel: <><path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/></>,
    regex: <><path d="M4 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM14 4v8M10.5 6l7 4M17.5 6l-7 4"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    at: <><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></>,
    building: <><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h0M15 7h0M9 11h0M15 11h0M9 15h0M15 15h0"/><path d="M10 21v-3h4v3"/></>,
    paperclip: <><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/></>
  };
  return <svg {...p}>{paths[name] || null}</svg>;
};

/* ---------- clipboard ---------- */
function copyText(text) {
  return new Promise((resolve) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => resolve(true)).catch(() => resolve(fallbackCopy(text)));
    } else { resolve(fallbackCopy(text)); }
  });
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta); return ok;
  } catch (e) { return false; }
}

/* ---------- regex helpers ---------- */
function stripWrapper(rx) {
  let r = rx;
  if (r.startsWith("\\b") && r.endsWith("\\b")) r = r.slice(2, r.length - 2);
  return r;
}
function buildEffectiveRegex(baseRegex, strategy) {
  if (strategy === "as_is" || !strategy) return baseRegex;
  const strat = AEDLP_DATA.boundaryStrategies.find(s => s.id === strategy);
  if (!strat) return baseRegex;
  return strat.prefix + stripWrapper(baseRegex) + strat.suffix;
}
function runRegexTest(pattern, sample, caseInsensitive) {
  if (!pattern) return { ok: false, error: "Empty pattern.", matches: [], count: 0 };
  let re;
  try { re = new RegExp(pattern, caseInsensitive ? "gi" : "g"); }
  catch (e) { return { ok: false, error: e.message, matches: [], count: 0 }; }
  const matches = []; let m, guard = 0;
  while ((m = re.exec(sample)) !== null) {
    matches.push({ value: m[0], index: m.index });
    if (m.index === re.lastIndex) re.lastIndex++;
    if (++guard > 5000) break;
  }
  return { ok: true, error: null, matches, count: matches.length };
}
function buildHighlightSegments(sample, matches) {
  if (!matches.length) return [{ text: sample, mark: false }];
  const sorted = [...matches].sort((a, b) => a.index - b.index);
  const segs = []; let cursor = 0;
  for (const mt of sorted) {
    if (mt.index < cursor) continue;
    if (mt.index > cursor) segs.push({ text: sample.slice(cursor, mt.index), mark: false });
    segs.push({ text: sample.slice(mt.index, mt.index + mt.value.length), mark: true });
    cursor = mt.index + mt.value.length;
  }
  if (cursor < sample.length) segs.push({ text: sample.slice(cursor), mark: false });
  return segs;
}
function tokenizeRegex(rx) {
  const out = []; let i = 0;
  const push = (cls, text) => out.push({ cls, text });
  while (i < rx.length) {
    const c = rx[i];
    if (c === "\\") { push("tok-escape", rx.slice(i, i + 2)); i += 2; continue; }
    if (c === "[") {
      let j = i + 1; while (j < rx.length && rx[j] !== "]") { if (rx[j] === "\\") j++; j++; }
      push("tok-class", rx.slice(i, j + 1)); i = j + 1; continue;
    }
    if (c === "(" || c === ")" || c === "|") { push("tok-group", c); i++; continue; }
    if (c === "^" || c === "$") { push("tok-anchor", c); i++; continue; }
    if ("*+?".includes(c)) { push("tok-quant", c); i++; continue; }
    if (c === "{") { let j = i + 1; while (j < rx.length && rx[j] !== "}") j++; push("tok-quant", rx.slice(i, j + 1)); i = j + 1; continue; }
    if (c === ".") { push("tok-meta", c); i++; continue; }
    push("tok-literal", c); i++;
  }
  return out;
}
const RegexHighlight = ({ pattern }) => {
  const toks = tokenizeRegex(pattern);
  return <>{toks.map((t, idx) => <span key={idx} className={"tok " + t.cls}>{t.text}</span>)}</>;
};

/* ---------- keyword matching ---------- */
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function buildKeywordRegex(keywords, wholeWord) {
  const parts = keywords.filter(Boolean).map(escapeRegex);
  if (!parts.length) return "";
  const alt = parts.sort((a, b) => b.length - a.length).join("|");
  return wholeWord ? "(?<![\\w])(?:" + alt + ")(?![\\w])" : "(?:" + alt + ")";
}
function runKeywordTest(keywords, sample, opts) {
  // use a boundary that also works for phrases / hyphenated terms
  const parts = keywords.filter(Boolean).map(escapeRegex).sort((a, b) => b.length - a.length);
  if (!parts.length) return { ok: false, error: "No keywords defined.", matches: [], count: 0, matchedKeywords: [] };
  const src = (opts.wholeWord ? "\\b(?:" : "(?:") + parts.join("|") + (opts.wholeWord ? ")\\b" : ")");
  const res = runRegexTest(src, sample, opts.caseInsensitive);
  if (!res.ok) {
    // fallback without boundaries if a phrase broke the boundary regex
    const r2 = runRegexTest("(?:" + parts.join("|") + ")", sample, opts.caseInsensitive);
    if (!r2.ok) return { ...res, matchedKeywords: [] };
    const seen2 = new Set(); for (const m of r2.matches) seen2.add(opts.caseInsensitive ? m.value.toLowerCase() : m.value);
    return { ...r2, matchedKeywords: [...seen2] };
  }
  const seen = new Set();
  for (const m of res.matches) seen.add(opts.caseInsensitive ? m.value.toLowerCase() : m.value);
  return { ...res, matchedKeywords: [...seen] };
}

/* ---------- keyword pattern: serialize + evaluate ---------- */
function serializeKeywordPattern(p) {
  const groupStr = g => g.length === 1 ? `"${g[0]}"` : "(" + g.map(t => `"${t}"`).join(" OR ") + ")";
  const joiner = p.operator === "AND"
    ? (p.proximity ? ` AND~${p.proximity} ` : " AND ")
    : " OR ";
  return p.groups.map(groupStr).join(joiner);
}
function wordIndexAt(sample, charIndex) {
  const before = sample.slice(0, charIndex);
  const m = before.match(/\S+/g);
  return m ? m.length : 0;
}
// smallest window (in words) covering at least one hit from every group
function coveringWindow(hitsByGroup) {
  const events = [];
  hitsByGroup.forEach((arr, g) => arr.forEach(w => events.push([w, g])));
  if (events.some((_, i) => false)) {}
  if (hitsByGroup.some(a => a.length === 0)) return Infinity;
  events.sort((a, b) => a[0] - b[0]);
  const need = hitsByGroup.length, count = {};
  let have = 0, left = 0, best = Infinity;
  for (let right = 0; right < events.length; right++) {
    const g = events[right][1];
    count[g] = (count[g] || 0) + 1; if (count[g] === 1) have++;
    while (have === need) {
      best = Math.min(best, events[right][0] - events[left][0]);
      const lg = events[left][1]; count[lg]--; if (count[lg] === 0) have--; left++;
    }
  }
  return best;
}
function evaluateKeywordPattern(p, sample, caseInsensitive) {
  const groupResults = p.groups.map(g => runKeywordTest(g, sample, { caseInsensitive, wholeWord: p.matchMode ? p.matchMode.wholeWord : true }));
  const groupHasHit = groupResults.map(r => r.ok && r.count > 0);
  const allHits = [];
  groupResults.forEach(r => { if (r.ok) allHits.push(...r.matches); });

  if (p.operator === "OR") {
    const matched = groupHasHit.some(Boolean);
    return { ok: true, matched, matches: matched ? allHits : [], count: allHits.length,
      reason: matched ? "At least one group matched." : "No group matched." };
  }
  // AND
  if (!groupHasHit.every(Boolean)) {
    const missing = p.groups.filter((_, i) => !groupHasHit[i]).map((g, i) => g[0]);
    return { ok: true, matched: false, matches: [], count: 0,
      reason: `Not all groups present (missing: ${missing.map(m => `"${m}"…`).join(", ")}).` };
  }
  if (!p.proximity) {
    return { ok: true, matched: true, matches: allHits, count: allHits.length, reason: "All groups present." };
  }
  // proximity check
  const hitsByGroup = groupResults.map(r => r.ok ? r.matches.map(m => wordIndexAt(sample, m.index)) : []);
  const win = coveringWindow(hitsByGroup);
  const matched = win <= p.proximity;
  return { ok: true, matched, matches: matched ? allHits : [], count: matched ? allHits.length : 0,
    reason: matched
      ? `All groups co-occur within ${win} word${win === 1 ? "" : "s"} (≤ ${p.proximity}).`
      : `Groups present but ${win === Infinity ? "do not co-occur" : `nearest co-occurrence is ${win} words apart`} (> ${p.proximity}).` };
}

/* ---------- recipient-domain matching ---------- */
function buildRecipientRegex(domains) {
  const parts = (domains || []).map(d => String(d).replace(/^@/, "")).filter(Boolean)
    .map(escapeRegex).sort((a, b) => b.length - a.length);
  if (!parts.length) return "";
  return "[A-Za-z0-9._%+\\-]+@(?:" + parts.join("|") + ")\\b";
}
function runRecipientTest(domains, sample) {
  const pattern = buildRecipientRegex(domains);
  if (!pattern) return { ok: false, error: "No domains defined.", matches: [], count: 0, matchedKeywords: [] };
  const res = runRegexTest(pattern, sample, true);
  if (!res.ok) return { ...res, matchedKeywords: [] };
  const seen = new Set();
  for (const m of res.matches) { const at = m.value.split("@")[1]; if (at) seen.add("@" + at.toLowerCase()); }
  return { ...res, matchedKeywords: [...seen] };
}

/* ---------- file type / extension matching ---------- */
function buildFileExtensionRegex(extensions) {
  const parts = (extensions || []).map(e => String(e).replace(/^\./, "")).filter(Boolean)
    .map(escapeRegex).sort((a, b) => b.length - a.length);
  if (!parts.length) return "";
  // a filename token (allowing dots, hyphens, underscores) ending in one of the extensions
  return "[\\w\\-.]+\\.(?:" + parts.join("|") + ")(?![\\w.])";
}
function runFileExtensionTest(extensions, sample) {
  const pattern = buildFileExtensionRegex(extensions);
  if (!pattern) return { ok: false, error: "No extensions defined.", matches: [], count: 0, matchedKeywords: [] };
  const res = runRegexTest(pattern, sample, true);
  if (!res.ok) return { ...res, matchedKeywords: [] };
  const seen = new Set();
  for (const m of res.matches) { const dot = m.value.lastIndexOf("."); if (dot >= 0) seen.add(m.value.slice(dot).toLowerCase()); }
  return { ...res, matchedKeywords: [...seen] };
}

/* ---------- unified condition test ---------- */
function runConditionTest(cond, sample, caseInsensitive) {
  if (cond.conditionType === "regular_expression") {
    const r = runRegexTest(cond.regex, sample, caseInsensitive);
    return { ...r, matched: r.ok && r.count > 0, reason: r.ok ? (r.count ? `${r.count} match${r.count > 1 ? "es" : ""}.` : "No matches.") : r.error };
  }
  if (cond.conditionType === "keyword") {
    const r = runKeywordTest(cond.keywords, sample, cond.matchMode || { caseInsensitive: true, wholeWord: true });
    return { ...r, matched: r.ok && r.count > 0, reason: r.ok ? (r.count ? `${r.matchedKeywords.length} term${r.matchedKeywords.length > 1 ? "s" : ""} matched.` : "No terms matched.") : r.error };
  }
  if (cond.conditionType === "recipient_domain") {
    const r = runRecipientTest(cond.domains, sample);
    return { ...r, matched: r.ok && r.count > 0,
      reason: r.ok ? (r.count ? `${r.count} listed recipient${r.count > 1 ? "s" : ""}.` : "No listed recipients.") : r.error };
  }
  if (cond.conditionType === "file_extension") {
    const r = runFileExtensionTest(cond.extensions, sample);
    return { ...r, matched: r.ok && r.count > 0,
      reason: r.ok ? (r.count ? `${r.count} attachment${r.count > 1 ? "s" : ""} of a flagged type (${r.matchedKeywords.join(", ")}).` : "No flagged file types.") : r.error };
  }
  // keyword_pattern
  return evaluateKeywordPattern(cond, sample, caseInsensitive);
}

/* ---------- copy value for a content item ---------- */
function conditionCopyValue(cond) {
  if (cond.conditionType === "regular_expression") return cond._effectiveRegex || cond.regex;
  if (cond.conditionType === "keyword") return (cond.keywords || []).join("\n");
  if (cond.conditionType === "recipient_domain") return (cond.domains || []).join("\n");
  if (cond.conditionType === "file_extension") return (cond.extensions || []).join(", ");
  return serializeKeywordPattern(cond);
}

/* ---------- search / filter ---------- */
function scoreDetector(d, q) {
  const query = q.trim().toLowerCase();
  if (!query) return 1;
  const terms = query.split(/\s+/);
  let score = 0;
  const hay = [d.displayName, d.category, d.regionLabel, d.country, d.industry, d.family, ...(d.aliases || []),
    ...(d.keywords || []), ...(d.domains || []), ...(d.extensions || []), ...(d.groups ? d.groups.flat() : [])].join(" ").toLowerCase();
  if (d.displayName.toLowerCase() === query) score += 100;
  if ((d.aliases || []).some(a => a.toLowerCase() === query)) score += 80;
  if (d.displayName.toLowerCase().includes(query)) score += 40;
  for (const t of terms) { if (hay.includes(t)) score += 8; }
  return score;
}
function filterDetectors(detectors, { query, type, category, region, industry }) {
  let pool = detectors;
  if (type && type !== "all") pool = pool.filter(d => d.conditionType === type);
  if (category && category !== "all") pool = pool.filter(d => d.category === category);
  if (region && region !== "all") pool = pool.filter(d => d.regionLabel === region);
  if (industry && industry !== "all") pool = pool.filter(d =>
    (d.industries || []).includes(industry) || (d.industries || []).includes("Cross-industry"));
  const q = (query || "").trim();
  if (!q) return [...pool].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return pool.map(d => ({ d, s: scoreDetector(d, q) })).filter(x => x.s > 1)
    .sort((a, b) => b.s - a.s).map(x => x.d);
}

/* ---------- suggestion engine (name / description / tags / action) ---------- */
function slugify(s) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[()/]/g, " ")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function uniq(arr) { return [...new Set(arr)]; }

function suggestName(items) {
  if (!items.length) return "";
  if (items.length === 1) return "Detect " + items[0].displayName;
  const cats = uniq(items.map(i => i.category));
  if (cats.length === 1) return "Detect " + cats[0];
  if (cats.length === 2) return "Detect " + cats[0] + " & " + cats[1];
  return "Detect " + cats.slice(0, 2).join(", ") + " +" + (cats.length - 2);
}
function suggestDescription(items, action) {
  if (!items.length) return "";
  const names = items.map(i => i.displayName);
  const list = names.length <= 3 ? names.join(", ")
    : names.slice(0, 3).join(", ") + ` and ${names.length - 3} more`;
  const regions = uniq(items.map(i => i.regionLabel).filter(r => r && r !== "Global"));
  const regionTxt = regions.length ? ` Focused on ${regions.join(", ")}.` : "";
  const typeCount = {};
  items.forEach(i => { typeCount[i.conditionType] = (typeCount[i.conditionType] || 0) + 1; });
  const typeTxt = AEDLP_DATA.conditionTypes
    .filter(t => typeCount[t.id]).map(t => `${typeCount[t.id]} ${t.short.toLowerCase()}`).join(", ");
  const act = AEDLP_DATA.actions[action] ? AEDLP_DATA.actions[action].label.toLowerCase() : "warn";
  return `Flags outbound email containing ${list}.${regionTxt} Combines ${typeTxt} condition${items.length > 1 ? "s" : ""}. Suggested action: ${act}.`;
}
function suggestTags(items) {
  if (!items.length) return [];
  const tags = [];
  items.forEach(i => {
    tags.push(slugify(i.category));
    if (i.regionLabel && i.regionLabel !== "Global") tags.push(slugify(i.regionLabel));
    if (i.industry) tags.push(slugify(i.industry));
    const t = AEDLP_DATA.conditionTypes.find(c => c.id === i.conditionType);
    if (t) tags.push(t.short.toLowerCase());
  });
  if (items.some(i => i.falsePositiveRisk === "high")) tags.push("tune-fp");
  return uniq(tags).slice(0, 9);
}
function suggestAction(items) {
  if (!items.length) return "warn";
  let best = "warn", rank = 0;
  items.forEach(i => {
    const a = AEDLP_DATA.actions[i.recommendedAction];
    if (a && a.rank > rank) { rank = a.rank; best = i.recommendedAction; }
  });
  return best;
}

/* ---------- UI primitives ---------- */
const Badge = ({ tone = "neutral", mono, children, dot }) =>
  <span className={`badge ${tone} ${mono ? "mono" : ""}`}>{dot && <span className="dot"></span>}{children}</span>;

const riskTone = r => ({ low: "ok", medium: "warn", high: "danger" }[r] || "neutral");
const typeTone = t => ({ regular_expression: "info", keyword: "violet", keyword_pattern: "teal", recipient_domain: "amber", file_extension: "green" }[t] || "neutral");
const typeShort = t => (AEDLP_DATA.conditionTypes.find(c => c.id === t) || {}).short || t;

const Card = ({ title, desc, right, children, className = "", icon }) =>
  <section className={`card ${className}`}>
    {(title || right) &&
      <div className="card-head">
        {icon && <div className="card-icon"><Icon name={icon} size={16} /></div>}
        <div className="card-titles">
          {title && <div className="card-title">{title}</div>}
          {desc && <div className="card-desc">{desc}</div>}
        </div>
        {right}
      </div>}
    <div className="card-body">{children}</div>
  </section>;

const Callout = ({ tone = "info", title, icon, children }) => {
  const ic = icon || (tone === "warn" ? "alert" : tone === "danger" ? "danger" : "info");
  return <div className={`callout ${tone}`}>
    <Icon name={ic} size={16} className="c-icon" />
    <div className="c-body">{title && <div className="c-title">{title}</div>}<div>{children}</div></div>
  </div>;
};

const CopyButton = ({ value, label = "Copy", big, className = "", icon = "copy" }) => {
  const [copied, setCopied] = useState(false);
  const onClick = async (e) => {
    e.stopPropagation();
    const ok = await copyText(typeof value === "function" ? value() : value);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1400); }
  };
  return <button className={`copybtn ${big ? "big" : ""} ${copied ? "copied" : ""} ${className}`} onClick={onClick}>
    <Icon name={copied ? "check" : icon} size={big ? 15 : 13} />
    {copied ? "Copied" : label}
  </button>;
};

Object.assign(window, {
  Icon, copyText, stripWrapper, buildEffectiveRegex, runRegexTest, buildHighlightSegments,
  tokenizeRegex, RegexHighlight, escapeRegex, buildKeywordRegex, runKeywordTest,
  serializeKeywordPattern, evaluateKeywordPattern, runConditionTest, conditionCopyValue,
  buildRecipientRegex, runRecipientTest,
  buildFileExtensionRegex, runFileExtensionTest,
  scoreDetector, filterDetectors, slugify, uniq,
  suggestName, suggestDescription, suggestTags, suggestAction,
  Badge, Card, Callout, CopyButton, riskTone, typeTone, typeShort
});
