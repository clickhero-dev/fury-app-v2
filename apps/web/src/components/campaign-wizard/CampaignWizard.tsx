import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCampaignWizard } from './hooks/useCampaignWizard';
import { useMetaAssetSelection } from './hooks/useMetaAssetSelection';
import { Step1Objective } from './steps/Step1Objective';
import { Step2Creative } from './steps/Step2Creative';
import { Step3Audience } from './steps/Step3Audience';
import { Step4Budget } from './steps/Step4Budget';
import { Step5Review } from './steps/Step5Review';
import type { WizardState } from './types';

interface CampaignWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preSelectedAssetId?: string;
  preSelectedAssetUrl?: string;
}

const STEP_TITLES: Record<WizardState['currentStep'], string> = {
  1: 'Objetivo',
  2: 'Criativo',
  3: 'Público',
  4: 'Orçamento',
  5: 'Revisão e Publicação',
};

// Dynamic step configuration based on whether audience step is skipped
function getVisibleSteps(hasAudienceData: boolean): WizardState['currentStep'][] {
  if (hasAudienceData) {
    return [1, 2, 4, 5] as WizardState['currentStep'][];
  }
  return [1, 2, 3, 4, 5] as WizardState['currentStep'][];
}

export function CampaignWizard({ open, onOpenChange, preSelectedAssetId, preSelectedAssetUrl }: CampaignWizardProps) {
  const navigate = useNavigate();
  const wizard = useCampaignWizard(preSelectedAssetId);
  const { state, hasAudienceData, audienceLoaded } = wizard;
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const assetSelection = useMetaAssetSelection();
  
  // Calculate visible steps based on audience data
  // Include step 3 if user manually navigated to it (via edit button)
  const visibleSteps = state.currentStep === 3 
    ? [1, 2, 3, 4, 5] as WizardState['currentStep'][]
    : getVisibleSteps(hasAudienceData);

  if (state.creative.assetId === preSelectedAssetId && preSelectedAssetUrl && !state.creative.assetUrl) {
    wizard.setCreative({ assetUrl: preSelectedAssetUrl });
  }

  // Resolve automaticamente a Pagina do tenant a partir da selecao salva do
  // onboarding, para que o step de Criativo (posts do Instagram) e o step de
  // Publico ja tenham pageId/instagramUserId disponiveis sem pedir ao usuario.
  useEffect(() => {
    if (state.whatsapp.pageId) return;
    const page = assetSelection.data?.pages[0];
    if (!page) return;

    wizard.setWhatsapp({
      pageId: page.pageId,
      pageName: page.name,
      hasWhatsApp: page.hasWhatsApp,
      hasInstagram: page.hasInstagram,
      instagramUserId: page.instagramUserId ?? undefined,
      instagramUsername: page.instagramUsername ?? undefined,
      destinations: page.hasWhatsApp || page.hasInstagram ? [] : ['messenger'],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSelection.data, state.whatsapp.pageId]);

  function handleClose() {
    const hasProgress = state.currentStep > 1 || state.objective !== null;
    if (!hasProgress) {
      wizard.reset();
      onOpenChange(false);
      return;
    }
    setShowCancelConfirm(true);
  }

  function handleConfirmCancel() {
    setShowCancelConfirm(false);
    wizard.reset();
    onOpenChange(false);
  }

  function handleViewCampaigns() {
    wizard.reset();
    onOpenChange(false);
    navigate('/campanhas');
  }

  function handleCreateAnother() {
    wizard.reset();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-lg w-full max-h-[90vh] md:max-w-3xl md:max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden [&>button]:hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">{STEP_TITLES[state.currentStep]}</h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
              <span className="sr-only">Fechar</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {visibleSteps.map((step, index) => {
              const isVisited = step < state.currentStep;
              const isCurrent = step === state.currentStep;
              const displayNumber = index + 1; // Show sequential numbers (1, 2, 3, 4) regardless of actual step
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <button
                    type="button"
                    onClick={() => isVisited && wizard.goToStep(step)}
                    disabled={!isVisited}
                    title={isVisited ? `Voltar ao passo ${step}` : undefined}
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors',
                      isVisited && 'bg-[#E8631A] text-white cursor-pointer hover:bg-[#D4520B]',
                      isCurrent && 'bg-[#E8631A] text-white ring-4 ring-[#E8631A]/20 cursor-default',
                      !isVisited && !isCurrent && 'bg-gray-100 text-gray-400 cursor-default'
                    )}
                  >
                    {isVisited ? <Check className="w-4 h-4" /> : displayNumber}
                  </button>
                  {index < visibleSteps.length - 1 && (
                    <div
                      className={cn(
                        'h-0.5 flex-1 mx-1 transition-colors',
                        isVisited ? 'bg-[#E8631A]' : 'bg-gray-100'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {state.currentStep === 1 && (
            <Step1Objective
              value={state.objective}
              onChange={wizard.setObjective}
              whatsapp={state.whatsapp}
              onWhatsappChange={wizard.setWhatsapp}
            />
          )}
          {state.currentStep === 2 && (
            <Step2Creative
              value={state.creative}
              onChange={wizard.setCreative}
              objective={state.objective}
              instagramUserId={state.whatsapp.instagramUserId}
            />
          )}
          {state.currentStep === 3 && (
            <Step3Audience
              value={state.audience}
              onChange={wizard.setAudience}
              objective={state.objective}
              whatsapp={state.whatsapp}
              onWhatsappChange={wizard.setWhatsapp}
            />
          )}
          {state.currentStep === 4 && <Step4Budget value={state.budget} onChange={wizard.setBudget} />}
          {state.currentStep === 5 && (
            <Step5Review
              state={state}
              onViewCampaigns={handleViewCampaigns}
              onCreateAnother={handleCreateAnother}
              onBack={wizard.goBack}
              onEditField={wizard.goToStep}
            />
          )}
        </div>

        {state.currentStep < visibleSteps[visibleSteps.length - 1] && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            {state.currentStep > 1 && (
              <Button variant="outline" className="flex-1" onClick={wizard.goBack}>
                Voltar
              </Button>
            )}
            <Button variant="primary" className="flex-1" onClick={wizard.goNext} disabled={!wizard.canGoNext}>
              Continuar
            </Button>
          </div>
        )}
      </DialogContent>

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar criação?</DialogTitle>
            <DialogDescription>As configurações da campanha serão perdidas.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
              Continuar editando
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel}>
              Cancelar campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
