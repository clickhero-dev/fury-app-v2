import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components';

type Props = { onSubmit: (rating: number) => void; onClose: () => void; isSubmitting?: boolean; error?: string };

export function CreativeRatingPrompt({ onSubmit, onClose, isSubmitting = false, error }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  return (
    <section aria-label="Avaliação do criativo" className="fixed bottom-5 right-5 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#F5C9AF] bg-white p-5 shadow-xl">
      <h2 className="text-base font-semibold text-[#101828]">Como você avalia este criativo?</h2>
      <div role="radiogroup" aria-label="Nota do criativo" className="mt-4 flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value} className="cursor-pointer rounded-md p-1 focus-within:ring-2 focus-within:ring-[#E8631A]">
            <input type="radio" name="creative-rating" value={value} checked={rating === value} onChange={() => setRating(value)} className="sr-only" aria-label={`${value} ${value === 1 ? 'estrela' : 'estrelas'}`} />
            <Star aria-hidden="true" className={rating !== null && value <= rating ? 'h-7 w-7 fill-[#E8631A] text-[#E8631A]' : 'h-7 w-7 text-[#98A2B3]'} />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button className="flex-1 bg-[#E8631A] text-white" onClick={() => rating && onSubmit(rating)} disabled={!rating || isSubmitting}>Enviar avaliação</Button>
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Agora não</Button>
      </div>
    </section>
  );
}
