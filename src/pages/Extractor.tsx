/* ============================================================
   Trusted Domain Extractor — page. Drop an enforcer export, pull
   external contact domains, curate a trusted-domain whitelist for
   the "unauthorised email" condition. Everything runs in the
   browser; the whitelist is handed to the Policy Creator through
   localStorage. Ported from handoff project/app/extractor.jsx.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { Card } from "../components/ui/Card";
import { Callout } from "../components/ui/Callout";
import { CopyButton } from "../components/ui/CopyButton";
import { useTheme } from "../theme";
import {
  isCSV,
  parseCSV,
  readSheetNames,
  parseWorkbook,
  pickSheet,
  emailDomain,
  TARGET_SHEET,
  type ParsedResult,
} from "../lib/extract";

const LS_KEY = "aedlp_trusted_domains";

function fmtBytes(n: number): string {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v < 10 && i > 0 ? 1 : 0) + " " + u[i];
}

function download(name: string, text: string, mime?: string) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------------- dropzone ---------------- */
function Dropzone({ onFile, error }: { onFile: (f: File) => void; error: string }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div
        className={"dropzone" + (drag ? " drag" : "")}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
      >
        <div className="dz-icon">
          <Icon name="upload" size={24} />
        </div>
        <div className="dz-title">Drop an enforcer export here</div>
        <div className="dz-sub">
          .xlsx, .xls or .csv — or click to browse. Large files (200&nbsp;MB+) stream locally; nothing is uploaded.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <Callout tone="warn" title="Couldn't read that file">
          {error}
        </Callout>
      )}
    </>
  );
}

type Stage = "idle" | "parsing" | "sheet" | "ready";

/* ---------------- main app ---------------- */
export default function Extractor() {
  const [theme, setTheme] = useTheme();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [sheetChoice, setSheetChoice] = useState<{ names: string[]; buf: Uint8Array | null }>({ names: [], buf: null });

  // curation state
  const [typeFilter, setTypeFilter] = useState("external");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("count"); // count | az
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [manual, setManual] = useState<{ domain: string }[]>([]);
  const [manualInput, setManualInput] = useState("");

  const runParse = useCallback(
    async (f: File, opts: { names?: string[]; buf?: Uint8Array | null; sheetName?: string } = {}) => {
      setError("");
      setProgress(0);
      setStage("parsing");
      setFile(f);
      try {
        let res: ParsedResult;
        if (isCSV(f)) {
          res = await parseCSV(f, setProgress);
        } else {
          let names = opts.names;
          let buf = opts.buf;
          if (!names) {
            const r = await readSheetNames(f);
            names = r.names;
            buf = r.buf;
          }
          const target = opts.sheetName || pickSheet(names);
          // if no obvious target and several sheets, let the user choose
          if (!opts.sheetName && names.length > 1 && !TARGET_SHEET.test(target)) {
            setSheetChoice({ names, buf: buf ?? null });
            setStage("sheet");
            return;
          }
          res = await parseWorkbook(f, target, buf ?? undefined);
        }
        // reset curation
        setDeselected(new Set());
        setRemoved(new Set());
        setManual([]);
        setSearch("");
        setParsed(res);
        // default the type filter to whichever of external/freemail exists
        const types = [...res.typeTotals.keys()];
        setTypeFilter(types.includes("external") ? "external" : types[0] || "external");
        setStage("ready");
      } catch (e) {
        setError((e as Error).message || String(e));
        setStage("idle");
      }
    },
    [],
  );

  /* derive the working domain list */
  const baseDomains = useMemo(() => {
    if (!parsed) return [];
    const out: { domain: string; count: number; manual: boolean }[] = [];
    for (const [dom, rec] of parsed.map.entries()) {
      if (removed.has(dom)) continue;
      const count = typeFilter === "all" ? rec.total : rec.types.get(typeFilter) || 0;
      if (typeFilter !== "all" && count === 0) continue;
      out.push({ domain: dom, count, manual: false });
    }
    for (const m of manual) {
      if (removed.has(m.domain)) continue;
      if (out.some((d) => d.domain === m.domain)) continue;
      out.push({ domain: m.domain, count: 0, manual: true });
    }
    return out;
  }, [parsed, typeFilter, removed, manual]);

  const whitelist = useMemo(
    () =>
      baseDomains
        .filter((d) => !deselected.has(d.domain))
        .map((d) => d.domain)
        .sort(),
    [baseDomains, deselected],
  );

  // persist whitelist for the Policy Creator to pick up
  useEffect(() => {
    if (stage === "ready") localStorage.setItem(LS_KEY, JSON.stringify(whitelist));
  }, [whitelist, stage]);

  const visible = useMemo(() => {
    let list = baseDomains;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) => d.domain.includes(q));
    list = [...list].sort(
      sort === "az"
        ? (a, b) => a.domain.localeCompare(b.domain)
        : (a, b) => b.count - a.count || a.domain.localeCompare(b.domain),
    );
    return list;
  }, [baseDomains, search, sort]);

  const CAP = 1500;
  const shown = visible.slice(0, CAP);

  const toggle = (dom: string) =>
    setDeselected((s) => {
      const n = new Set(s);
      if (n.has(dom)) n.delete(dom);
      else n.add(dom);
      return n;
    });
  const removeDom = (dom: string) => setRemoved((s) => new Set(s).add(dom));
  const selectAllVisible = () =>
    setDeselected((s) => {
      const n = new Set(s);
      visible.forEach((d) => n.delete(d.domain));
      return n;
    });
  const selectNoneVisible = () =>
    setDeselected((s) => {
      const n = new Set(s);
      visible.forEach((d) => n.add(d.domain));
      return n;
    });

  const addManual = () => {
    const dom = emailDomain(manualInput.includes("@") ? manualInput : "x@" + manualInput);
    if (!dom) return;
    setRemoved((s) => {
      const n = new Set(s);
      n.delete(dom);
      return n;
    });
    setDeselected((s) => {
      const n = new Set(s);
      n.delete(dom);
      return n;
    });
    setManual((m) => (m.some((x) => x.domain === dom) ? m : [{ domain: dom }, ...m]));
    setManualInput("");
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="database" size={17} />
          </div>
          <div>
            <div className="brand-title">Trusted Domain Extractor</div>
            <div className="brand-sub">AEDLP · unauthorised-email whitelist</div>
          </div>
        </div>
        <div className="topbar-spacer"></div>
        <Link className="btn sm ghost" to="/">
          <Icon name="shield" size={14} />
          Policy Creator
        </Link>
        <button className="iconbtn" title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </button>
      </div>

      <div className="ext-main">
        <div className="ext-wrap">
          <div className="ext-intro">
            <h1>Extract trusted third-party domains</h1>
            <p>
              Pull every <strong>external</strong> contact from an enforcer export, reduce it to a clean,
              de-duplicated list of email domains, then curate the ones you trust. The result is a whitelist you can
              paste into the <strong>unauthorised email</strong> condition.
            </p>
          </div>

          {stage === "idle" && <Dropzone onFile={runParse} error={error} />}

          {stage === "parsing" && (
            <Card>
              <div className="parsing">
                <div className="spinner"></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Reading {file && file.name}…</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {isCSV(file as File) ? "Streaming rows locally" : "Parsing workbook"} · {fmtBytes(file?.size ?? 0)}
                  </div>
                  {file && isCSV(file) && (
                    <div className="prog-track">
                      <div className="prog-bar" style={{ width: (progress * 100).toFixed(0) + "%" }}></div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {stage === "sheet" && (
            <Card title="Choose the sheet to scan">
              <p style={{ marginTop: 0, color: "var(--text-2)", fontSize: 12.5 }}>
                No sheet named “unauthorised_contacts” was found. Pick the one that holds the contact rows:
              </p>
              <div className="export-grid">
                {sheetChoice.names.map((n) => (
                  <button
                    key={n}
                    className="btn sm"
                    onClick={() => file && runParse(file, { sheetName: n, names: sheetChoice.names, buf: sheetChoice.buf })}
                  >
                    <Icon name="layers" size={13} />
                    {n}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {stage === "ready" && parsed && file && (
            <>
              <div className="file-bar">
                <div className="file-ic">
                  <Icon name="check" size={18} />
                </div>
                <div className="file-meta">
                  <div className="file-name">{file.name}</div>
                  <div className="file-sub">
                    Sheet “{parsed.sheetName}” · {parsed.scanned.toLocaleString()} rows scanned · {fmtBytes(file.size)}
                  </div>
                </div>
                <button
                  className="btn sm"
                  onClick={() => {
                    setStage("idle");
                    setParsed(null);
                  }}
                >
                  <Icon name="reset" size={13} />
                  Replace file
                </button>
              </div>

              <div className="ext-stats">
                <div className="stat">
                  <div className="stat-num">{parsed.scanned.toLocaleString()}</div>
                  <div className="stat-label">Rows scanned</div>
                </div>
                <div className="stat">
                  <div className="stat-num">
                    {(parsed.typeTotals.get(typeFilter) || (typeFilter === "all" ? parsed.scanned : 0)).toLocaleString()}
                  </div>
                  <div className="stat-label">{typeFilter} contacts</div>
                </div>
                <div className="stat">
                  <div className="stat-num">{baseDomains.length.toLocaleString()}</div>
                  <div className="stat-label">Unique domains</div>
                </div>
                <div className="stat">
                  <div className="stat-num accent">{whitelist.length.toLocaleString()}</div>
                  <div className="stat-label">In whitelist</div>
                </div>
              </div>

              <div className="toolbar-row">
                <div className="seg">
                  {["external", "freemail", "all"].map((t) => {
                    const present = t === "all" || parsed.typeTotals.has(t);
                    if (!present && t !== "all") return null;
                    const ct = t === "all" ? parsed.scanned : parsed.typeTotals.get(t) || 0;
                    return (
                      <button key={t} className={typeFilter === t ? "active" : ""} onClick={() => setTypeFilter(t)}>
                        {t}
                        <span className="ct">{ct.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="search-wrap grow">
                  <Icon name="search" size={15} className="search-icon" />
                  <input
                    className="input search"
                    placeholder="Search domains…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button className="search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
                <div className="filter-field">
                  <Icon name="funnel" size={13} className="muted" />
                  <select
                    className="filter-select"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="Sort domains"
                  >
                    <option value="count">Most frequent</option>
                    <option value="az">A → Z</option>
                  </select>
                </div>
              </div>

              <div className="dom-list">
                <div className="dom-list-head">
                  <span style={{ flex: 1 }}>
                    {visible.length.toLocaleString()} domain{visible.length === 1 ? "" : "s"}
                    {search ? " matching" : ""}
                  </span>
                  <button className="btn xs ghost" onClick={selectAllVisible}>
                    <Icon name="check" size={12} />
                    Select all
                  </button>
                  <button className="btn xs ghost" onClick={selectNoneVisible}>
                    <Icon name="minus" size={12} />
                    Select none
                  </button>
                </div>
                <div className="dom-scroll">
                  {shown.length === 0 && (
                    <div className="dom-empty">No domains to show. Try a different contact type or clear the search.</div>
                  )}
                  {shown.map((d) => {
                    const on = !deselected.has(d.domain);
                    return (
                      <div key={d.domain} className={"dom-row" + (on ? "" : " off") + (d.manual ? " manual" : "")}>
                        <button
                          className={"chk" + (on ? " on" : "")}
                          onClick={() => toggle(d.domain)}
                          aria-label={(on ? "Deselect " : "Select ") + d.domain}
                        >
                          {on && <Icon name="check" size={12} />}
                        </button>
                        <span className="dom-name" title={d.domain}>
                          {d.domain}
                        </span>
                        {d.manual ? (
                          <span className="dom-tag">added</span>
                        ) : (
                          <span className="dom-count">{d.count.toLocaleString()}×</span>
                        )}
                        <button
                          className="dom-x"
                          title="Remove from list"
                          aria-label={"Remove " + d.domain + " from list"}
                          onClick={() => removeDom(d.domain)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {visible.length > CAP && (
                    <div className="dom-empty">
                      Showing first {CAP.toLocaleString()} of {visible.length.toLocaleString()} — refine the search to
                      see more.
                    </div>
                  )}
                </div>
                <div className="add-row">
                  <Icon name="plus" size={14} className="muted" />
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="Add a trusted domain manually (e.g. partner.com)"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addManual();
                    }}
                  />
                  <button className="btn sm primary" onClick={addManual} disabled={!manualInput.trim()}>
                    <Icon name="plus" size={13} />
                    Add
                  </button>
                </div>
              </div>

              <Card title={`Trusted-domain whitelist (${whitelist.length})`}>
                <Callout tone="info" title="How to use this">
                  These are the domains mail can be sent to <em>without</em> tripping the unauthorised-email condition.
                  Copy or download the list and paste it into that condition’s allowed-domains field. The list is also
                  saved in this browser for the Policy Creator to pick up.
                </Callout>
                <div className="export-grid" style={{ marginTop: 12 }}>
                  <CopyButton value={() => whitelist.join("\n")} label="Copy list" big />
                  <CopyButton value={() => whitelist.join(", ")} label="Comma-separated" big icon="list" />
                  <button className="btn" onClick={() => download("trusted-domains.txt", whitelist.join("\n"))}>
                    <Icon name="download" size={14} />
                    .txt
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      download(
                        "trusted-domains.json",
                        JSON.stringify({ trustedDomains: whitelist }, null, 2),
                        "application/json",
                      )
                    }
                  >
                    <Icon name="download" size={14} />
                    .json
                  </button>
                  <button
                    className="btn"
                    onClick={() => download("trusted-domains.csv", "domain\n" + whitelist.join("\n"), "text/csv")}
                  >
                    <Icon name="download" size={14} />
                    .csv
                  </button>
                </div>
                <textarea
                  className="textarea mono"
                  style={{ marginTop: 12 }}
                  rows={Math.min(10, Math.max(3, whitelist.length))}
                  readOnly
                  value={whitelist.join("\n")}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
