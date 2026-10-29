import type { CampaignPlatform } from './CampaignPlatformSelector';

export function PlatformLogo({ platform }: { platform: CampaignPlatform }) {
  if (platform === 'meta') {
    return (
      <span aria-label="Meta" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0866ff] text-white">
        <svg aria-hidden="true" viewBox="0 0 48 32" className="h-7 w-9 fill-none stroke-current" strokeWidth="5" strokeLinecap="round">
          <path d="M4 23c4-14 9-18 14-18 6 0 9 18 14 18 5 0 7-14 12-18" />
          <path d="M4 23c5 4 8 4 12 0 4-4 6-18 12-18 5 0 8 14 16 18" />
        </svg>
      </span>
    );
  }

  return (
    <span aria-label="Google" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl font-bold shadow-sm ring-1 ring-border">
      <span aria-hidden="true" className="bg-gradient-to-br from-[#4285f4] via-[#34a853] to-[#ea4335] bg-clip-text text-transparent">G</span>
    </span>
  );
}
