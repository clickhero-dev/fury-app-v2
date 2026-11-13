import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const ROLES = [
  { name: "Usuário Titular", text: "Dono da conta do cliente." },
  { name: "Administrador", text: "Gerencia a conta do cliente, mesmo com o plano vencido." },
  { name: "Usuário", text: "Membro da equipe do cliente." },
];

// "?" que explica cada cargo
export function RoleHelp() {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="O que cada cargo faz"
            className="ady-btn w-4 h-4 flex items-center justify-center rounded-full text-admin-text-faint hover:text-admin-petrol"
          >
            <CircleHelp className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="z-[60] max-w-64 space-y-1.5 py-2">
          {ROLES.map((r) => (
            <div key={r.name}>
              <strong>{r.name}:</strong> {r.text}
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
