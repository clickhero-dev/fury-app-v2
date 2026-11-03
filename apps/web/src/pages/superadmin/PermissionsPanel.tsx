import { useEffect, useState } from "react";
import api from "@/lib/api";
import { apiMessage } from "./PartnersPage";

export interface Permission {
  key: string;
  description: string;
  blocked: boolean;
  locked: boolean;
}

// avisos de telas que dividem serviço com outras
const NOTES: Record<string, string> = {
  campaigns: "Também bloqueia a tela de Leads (usa o mesmo serviço).",
};

// Interruptores de telas; partnerId null = padrão (todos)
export function PermissionsPanel({ partnerId }: { partnerId: string | null }) {
  const url = partnerId ? `/admin/partners/${partnerId}/permissions` : "/admin/permissions/default";
  const [items, setItems] = useState<Permission[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(url)
      .then((res) => setItems(res.data.data))
      .catch((err) => setError(apiMessage(err, "Não foi possível carregar as permissões.")));
  }, [url]);

  async function toggle(item: Permission) {
    setBusy(item.key);
    setError("");
    try {
      const res = await api.put(url, { viewKey: item.key, blocked: !item.blocked });
      setItems(res.data.data);
    } catch (err) {
      setError(apiMessage(err, "Não foi possível salvar."));
    } finally {
      setBusy(null);
    }
  }

  if (!items) return error ? <p role="alert" className="text-sm text-[#E05A4B]">{error}</p> : <div className="text-[#5A605C] text-sm">Carregando...</div>;

  return (
    <div className="bg-[#161714] border border-[#2A2D27] rounded-lg max-w-xl">
      <p className="px-5 pt-4 pb-2 text-xs text-[#7E8480]">
        Desligado = tela bloqueada{partnerId ? " para os clientes deste parceiro" : " para todos os clientes"}. Vale na hora.
      </p>
      {error && <p role="alert" className="px-5 pb-2 text-sm text-[#E05A4B]">{error}</p>}
      <ul>
        {items.map((item) => {
          const on = !item.blocked && !item.locked;
          const child = item.key.includes(".");
          const parent = items.find((p) => item.key.startsWith(p.key + ".") && (p.blocked || p.locked));
          return (
            <li key={item.key} className="flex items-center justify-between gap-4 px-5 py-3 border-t border-[#1F211C]">
              <div className={child ? "pl-4" : ""}>
                <div className="text-sm text-[#ECEDEF]">{item.description}</div>
                {item.locked && (
                  <div className="text-xs text-[#5A605C]">{parent ? `Bloqueado junto com ${parent.description}` : "Bloqueado para todos"}</div>
                )}
                {NOTES[item.key] && <div className="text-xs text-[#7E8480]">{NOTES[item.key]}</div>}
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={item.description}
                disabled={item.locked || busy !== null}
                onClick={() => toggle(item)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#1E88A8]" : "bg-[#2A2D27]"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
