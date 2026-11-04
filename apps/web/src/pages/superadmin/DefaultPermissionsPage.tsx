import { Link } from "react-router-dom";
import { PermissionsPanel } from "./PermissionsPanel";

// Bloqueios que valem para todos os clientes (ady e parceiros)
export function DefaultPermissionsPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link to="/admin/parceiros" className="text-xs text-[#1E88A8] hover:underline">← Parceiros</Link>
        <h1 className="text-2xl font-bold !text-[#ECEDEF] mt-1">Permissões padrão (todos)</h1>
        <p className="text-sm text-[#7E8480]">Vale para os clientes diretos e para os clientes de todos os parceiros.</p>
      </div>
      <PermissionsPanel partnerId={null} />
    </div>
  );
}
