/* ============================================================
   Trusted Domain Extractor — page shell (topbar over an empty main).
   Dropzone, parsing and curation arrive in Phase 5.
   Topbar mirrors the prototype extractor.jsx Topbar.
   ============================================================ */
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { useTheme } from "../theme";

export default function Extractor() {
  const [theme, setTheme] = useTheme();

  return (
    <div className="app">
      <header className="topbar">
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
        <button
          className="iconbtn"
          title="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </button>
      </header>

      <main className="ext-main"></main>
    </div>
  );
}
