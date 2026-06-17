/* ============================================================
   AEDLP Policy Creator — page shell (topbar over an empty main).
   Library + policy assembler + test panel arrive in later phases.
   Topbar mirrors the prototype App.jsx header.
   ============================================================ */
import { Link } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { useTheme } from "../theme";

export default function PolicyCreator() {
  const [theme, setTheme] = useTheme();
  const added = 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="shield" size={17} />
          </div>
          <div>
            <div className="brand-title">AEDLP Policy Creator</div>
            <div className="brand-sub">Detector library &amp; custom-policy assembler</div>
          </div>
        </div>
        <div className="topbar-spacer"></div>
        <Link
          className="btn sm ghost"
          to="/trusted-domain-extractor"
          title="Extract trusted domains from an enforcer export"
        >
          <Icon name="database" size={14} />
          Domain Extractor
        </Link>
        <span className="added-pill">
          <Icon name="layers" size={13} />
          {added} in policy
        </span>
        <span className="topbar-tag">copy &amp; paste · no API</span>
        <button
          className="iconbtn"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
        </button>
      </header>

      <main className="main"></main>
    </div>
  );
}
