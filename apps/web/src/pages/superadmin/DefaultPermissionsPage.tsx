import { Link } from "react-router-dom";
import { PermissionsPanel } from "./PermissionsPanel";

// Bloqueios que valem para os clientes da ady (parceiros seguem o plano deles)
export function DefaultPermissionsPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link to="/admin/parceiros" className="text-xs text-[#17708A] dark:text-[#1E88A8] hover:underline">← Parceiros</Link>
        <h1 className="text-2xl font-bold text-text-primary mt-1">Permissões padrão (clientes ady)</h1>
        <p className="text-sm text-text-secondary">Vale para os clientes diretos e para os clientes de todos os parceiros.</p>
      </div>
      <PermissionsPanel partnerId={null} />
    </div>
  );
}
