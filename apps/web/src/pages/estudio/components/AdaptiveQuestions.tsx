import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components';
import type { AdaptiveQuestion } from '@/types/studio';

interface Props {
  questions: AdaptiveQuestion[];
  onComplete: (answers: Record<string, string>) => void;
}

export function AdaptiveQuestions({ questions, onComplete }: Props) {
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(true);

  const currentQ = questions[qIdx];
  const currentAnswer = answers[currentQ.id] ?? '';
  const isLast = qIdx === questions.length - 1;

  const transition = (fn: () => void) => {
    setVisible(false);
    setTimeout(() => {
      fn();
      setVisible(true);
    }, 180);
  };

  const handleContinue = () => {
    if (!isLast) {
      transition(() => setQIdx((i) => i + 1));
      return;
    }
    // Build field-keyed answers so the wizard can merge by field name
    const fieldAnswers: Record<string, string> = {};
    questions.forEach((q) => {
      const ans = (answers[q.id] ?? '').trim();
      if (ans) fieldAnswers[q.field] = ans;
    });
    onComplete(fieldAnswers);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#EA580C]/20 bg-[#FFF7F2] p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#EA580C]" />
        <div>
          <p className="text-sm font-semibold text-[#101828]">Só mais algumas informações</p>
          <p className="text-sm text-[#7A4A27] mt-0.5">
            A IA identificou que precisa de mais detalhes para criar um anúncio incrível para você
          </p>
        </div>
      </div>

      {/* Progress */}
      <p className="text-xs font-semibold text-[#667085] uppercase tracking-wide">
        Pergunta {qIdx + 1} de {questions.length}
      </p>

      {/* Question */}
      <div
        className="space-y-4 transition-all duration-[180ms]"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(20px)' }}
      >
        <div>
          <label className="block text-base font-semibold text-[#101828]">{currentQ.question}</label>
        </div>
        <textarea
          key={currentQ.id}
          autoFocus
          value={currentAnswer}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))}
          placeholder={currentQ.placeholder}
          rows={3}
          className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/10 resize-none"
        />
      </div>

      {/* Navigation */}
      <Button
        onClick={handleContinue}
        disabled={!currentAnswer.trim()}
        className="w-full inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLast ? 'Gerar Criativo' : 'Continuar'}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
