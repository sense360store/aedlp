/* ============================================================
   Persistent primary navigation, present in the topbar of both
   pages. Two destinations: the Policy Creator (default route) and
   the Trusted Domain Extractor. Built from the existing design
   tokens — no new colours.
   ============================================================ */
import { NavLink } from "react-router-dom";
import { Icon } from "./Icon";

const linkClass = ({ isActive }: { isActive: boolean }) => "topnav-link" + (isActive ? " active" : "");

export function TopNav() {
  return (
    <nav className="topnav" aria-label="Primary">
      {/* Policy Creator is the primary, default surface. `end` keeps it active
          only on the exact "/" route. */}
      <NavLink to="/" end className={linkClass} aria-label="Policy Creator" title="Policy Creator">
        <Icon name="shield" size={14} />
        <span>Policy Creator</span>
      </NavLink>
      {/* The extractor is labelled by its outcome, not its mechanism.
          NOTE: "Trusted domains" is a placeholder pending confirmation against
          the exact AEDLP condition wording for the unauthorised-email
          allow-list; update here if the product term differs. */}
      <NavLink
        to="/trusted-domain-extractor"
        className={linkClass}
        aria-label="Trusted domains"
        title="Trusted domains — build an allow-list from an enforcer export"
      >
        <Icon name="database" size={14} />
        <span>Trusted domains</span>
      </NavLink>
    </nav>
  );
}
