const TYPO_MAP: Record<string, string> = {
  "internacionales": "internacionais",
  "Inscriçcões": "Inscrições",
};

export function sanitizeTypos(text: string): string {
  let result = text;
  for (const [typo, correct] of Object.entries(TYPO_MAP)) {
    result = result.replace(new RegExp(typo, "g"), correct);
  }
  return result;
}
