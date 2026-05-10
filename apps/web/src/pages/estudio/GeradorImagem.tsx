import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AppLayout, PageHeader, Button, Card } from '@/components';
import type { GenerateImagePayload } from '@/types/studio';

const FORMAT_OPTIONS = [
  { value: 'feed', label: 'Feed 1:1' },
  { value: 'stories', label: 'Stories 9:16' },
  { value: 'banner', label: 'Banner 1.91:1' },
];

const STYLE_OPTIONS = [
  { value: 'photographic', label: 'Fotográfico' },
  { value: 'illustration', label: 'Ilustração' },
  { value: 'minimalist', label: 'Minimalista' },
];

export function GeradorImagem() {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [promptError, setPromptError] = useState('');

  const {
    register,
    watch,
  } = useForm<GenerateImagePayload>({
    defaultValues: {
      prompt: '',
      format: 'feed',
      style: 'photographic',
    },
  });

  const prompt = watch('prompt');
  const format = watch('format');
  const style = watch('style');

  useEffect(() => {
    if (prompt.length > 0) {
      setPromptError('');
    }
  }, [prompt]);

  const handleValidateAndGenerate = async () => {
    setPromptError('');

    if (!prompt || prompt.trim().length < 10) {
      setPromptError('A descrição deve ter no mínimo 10 caracteres');
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setGeneratedImageUrl(null);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const increment = Math.random() * 15;
        const newProgress = Math.min(prev + increment, 88);
        return newProgress;
      });
    }, 400);

    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const randomId = Math.floor(Math.random() * 1000);
      const generatedUrl = `https://picsum.photos/800/600?${randomId}`;

      setGeneratedImageUrl(generatedUrl);
      setProgress(100);
    } catch (error) {
      console.error('Erro ao gerar imagem:', error);
      setProgress(0);
    } finally {
      clearInterval(progressInterval);
      setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    setGeneratedImageUrl(null);
    setProgress(0);
    handleValidateAndGenerate();
  };

  const handleDiscard = () => {
    setGeneratedImageUrl(null);
    setProgress(0);
    setPromptError('');
  };

  const handleUseImage = () => {
    navigate('/estudio');
  };

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/estudio')}
              className="p-1 hover:bg-surface-secondary rounded-lg transition-colors"
              title="Voltar"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-bold text-text-primary">Gerar Novo Criativo</h2>
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        <PageHeader
          title="Gerador de Imagens com IA"
          description="Descreva a imagem que você deseja gerar e escolha o formato e estilo"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-1">
            <Card>
              <div className="p-6 space-y-6">
                {/* Textarea */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">
                    Descreva sua criação <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    {...register('prompt')}
                    placeholder="Ex: Uma mulher jovem usando roupa verão em praia com pôr do sol, fotografia profissional"
                    className={`w-full px-3 py-2 rounded-lg border text-sm font-normal resize-none h-24 focus:outline-none transition-colors ${
                      promptError
                        ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                        : 'border-border focus:ring-2 focus:ring-[#E8631A]/20'
                    }`}
                  />
                  {promptError && <p className="text-xs text-red-500">{promptError}</p>}
                  <p className="text-xs text-text-tertiary">{prompt.length}/150 caracteres</p>
                </div>

                {/* Format Select */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">
                    Formato <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('format')}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#E8631A]/20 transition-colors bg-white"
                  >
                    {FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Style Select */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">
                    Estilo <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('style')}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#E8631A]/20 transition-colors bg-white"
                  >
                    {STYLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Generate Button */}
                <Button
                  onClick={handleValidateAndGenerate}
                  disabled={isGenerating}
                  className="w-full bg-[#E8631A] hover:bg-[#D45714] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? 'Gerando...' : 'Gerar'}
                </Button>
              </div>
            </Card>
          </div>

          {/* Preview */}
          <div className="lg:col-span-2">
            {isGenerating ? (
              <Card>
                <div className="p-8 space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-text-primary">Gerando sua criação...</p>
                      <p className="text-xs text-text-secondary">{Math.round(progress)}%</p>
                    </div>
                    <div className="w-full bg-surface-secondary rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#E8631A] h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-text-secondary">
                    <div className="flex items-center gap-2">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>Analisando seu prompt</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>Processando estilos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {progress < 88 ? (
                        <>
                          <div className="w-3 h-3 rounded-full border-2 border-transparent border-t-[#E8631A] animate-spin" />
                          <span>Finalizando geração</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>Pronto!</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ) : generatedImageUrl ? (
              <Card>
                <div className="space-y-4">
                  <div className="w-full bg-surface-secondary rounded-t-lg overflow-hidden aspect-video">
                    <img src={generatedImageUrl} alt="Criativo gerado" className="w-full h-full object-cover" />
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs text-text-secondary">Detalhes da Geração</p>
                      <div className="space-y-1 text-xs text-text-primary">
                        <p>
                          <span className="font-medium">Formato:</span> {FORMAT_OPTIONS.find((o) => o.value === format)?.label}
                        </p>
                        <p>
                          <span className="font-medium">Estilo:</span> {STYLE_OPTIONS.find((o) => o.value === style)?.label}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleUseImage}
                        className="flex-1 bg-[#E8631A] hover:bg-[#D45714] text-white"
                      >
                        Usar em campanha
                      </Button>
                      <Button
                        onClick={handleRegenerate}
                        variant="outline"
                        className="flex-1"
                      >
                        Gerar novamente
                      </Button>
                      <Button
                        onClick={handleDiscard}
                        variant="outline"
                        className="px-3"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="p-12 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-[#FEF0E7] rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#E8631A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-1">Pronto para criar?</h3>
                    <p className="text-sm text-text-secondary">
                      Preencha os detalhes ao lado e clique em "Gerar" para criar sua primeira imagem
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
