import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { TrendingUp, Image } from "lucide-react";
import api from "@/lib/api";

interface Campaign {
  id: string;
  name: string;
  status: string;
  metrics: Record<string, unknown> | null;
  budget: Record<string, unknown> | null;
  metaCampaignId: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

interface CreativeAsset {
  id: string;
  type: string;
  url: string;
  complianceStatus: string;
  createdAt: string;
}

export function TenantCampaignsPage() {
  const { id: tenantId } = useParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creatives, setCreatives] = useState<CreativeAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    api
      .get(`/admin/tenants/${tenantId}/campaigns`)
      .then((res) => {
        setCampaigns(res.data.data.campaigns ?? []);
        setCreatives(res.data.data.creativeAssets ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading)
    return <div className="text-admin-text-faint text-sm py-12 text-center">Carregando...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-admin-text">Campanhas</h1>
        <p className="text-sm text-admin-text-faint mt-1">
          {campaigns.length} campanhas · {creatives.length} criativos
        </p>
      </div>

      {/* Campaigns */}
      <div className="bg-admin-surface border border-admin-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-admin-text mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-admin-petrol" /> Campanhas
        </h2>
        {campaigns.length === 0 ? (
          <div className="text-center py-12 text-admin-text-faint text-sm">
            Nenhuma campanha encontrada
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-border text-left text-admin-text-faint text-xs uppercase tracking-wider">
                  <th className="pb-3 pr-4 font-medium">Meta ID</th>
                  <th className="pb-3 pr-4 font-medium">Nome</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Métricas</th>
                  <th className="pb-3 font-medium">Criada em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border">
                {campaigns.map((c) => {
                  const m = (c.metrics ?? {}) as Record<string, unknown>;
                  const metricsStr = Object.keys(m).length
                    ? Object.entries(m)
                        .slice(0, 4)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")
                    : "—";
                  return (
                    <tr key={c.id} className="text-admin-text-muted hover:bg-admin-surface-2">
                      <td className="py-3 pr-4 font-mono text-xs text-admin-text-faint">
                        {c.metaCampaignId.slice(0, 12)}…
                      </td>
                      <td className="py-3 pr-4 font-medium text-admin-text">
                        {c.name}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            c.status === "active"
                              ? "bg-admin-success/20 text-admin-success"
                              : c.status === "draft"
                                ? "bg-admin-surface-2 text-admin-text-muted"
                                : "bg-admin-surface-2 text-admin-text-faint"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-admin-text-muted max-w-[240px] truncate">
                        {metricsStr}
                      </td>
                      <td className="py-3 whitespace-nowrap text-xs text-admin-text-faint">
                        {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Creative Assets */}
      <div className="bg-admin-surface border border-admin-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-admin-text mb-4 flex items-center gap-2">
          <Image className="w-4 h-4 text-admin-petrol" /> Criativos
        </h2>
        {creatives.length === 0 ? (
          <div className="text-center py-12 text-admin-text-faint text-sm">
            Nenhum criativo encontrado
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {creatives.map((a) => (
              <div key={a.id} className="flex flex-col">
                <div className="bg-admin-surface-2 rounded-xl overflow-hidden aspect-square">
                  {a.type === "image" ? (
                    <img
                      src={a.url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-admin-text-faint text-xs">
                      {a.type}
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-block ${
                      a.complianceStatus === "approved"
                        ? "bg-admin-success/20 text-admin-success"
                        : a.complianceStatus === "pending_compliance"
                          ? "bg-admin-spark/20 text-admin-spark"
                          : "bg-admin-danger/20 text-admin-danger"
                    }`}
                  >
                    {a.complianceStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}