import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileLookupResult } from './ProfileLookupResult';
import type {
  GoogleLookupResult,
  GoogleCreateProfileResult,
  GoogleVerificationResult,
} from '@/types/google';

const BASE_PROPS = {
  isLoading: false,
  isError: false,
  hasConnection: true,
  settingsComplete: false,
  createdProfile: null as GoogleCreateProfileResult | null,
  isCreating: false,
  onCreate: () => {},
  verification: null as GoogleVerificationResult | null,
  isVerificationLoading: false,
  onComplete: () => {},
  isCompleting: false,
};

const EXCELLENT_MATCH = {
  gbpLocationId: 'accounts/1/locations/abc',
  name: 'Padaria do Bairro',
  address: { street: 'Rua das Flores, 100', city: 'São Paulo', state: 'SP', postalCode: '01000-000', country: 'BR' },
  phone: '+55 11 99999-9999',
  verificationState: 'VERIFIED',
  claimed: true,
  confidence: 'HIGH' as const,
  quality: {
    score: 95,
    grade: 'EXCELLENT' as const,
    complete: true,
    verified: true,
    outdated: false,
    lastUpdated: '2026-07-01T12:00:00Z',
    missingFields: [],
    recommendations: [],
    warnings: [],
  },
};

const POOR_MATCH = {
  gbpLocationId: 'accounts/1/locations/def',
  name: 'Padaria do Bairro',
  address: { street: '', city: '', state: '', postalCode: '', country: 'BR' },
  phone: '',
  verificationState: 'UNVERIFIED',
  claimed: true,
  confidence: 'HIGH' as const,
  quality: {
    score: 30,
    grade: 'POOR' as const,
    complete: false,
    verified: false,
    outdated: true,
    lastUpdated: '2024-01-01T12:00:00Z',
    missingFields: ['address', 'phone'],
    recommendations: ['website', 'category', 'hours'],
    warnings: [
      'Informe o telefone do seu negócio.',
      'Seu perfil está desatualizado. Atualize os dados para melhorar a visibilidade no Google.',
    ],
  },
};

describe('ProfileLookupResult — qualidade do perfil (pré-envio)', () => {
  it('exibe classificação EXCELLENT e score quando o perfil do Google está completo e recente', () => {
    const result: GoogleLookupResult = { found: true, duplicateAlert: false, matches: [EXCELLENT_MATCH] };

    render(<ProfileLookupResult {...BASE_PROPS} result={result} />);

    expect(screen.getByText('Perfil encontrado no Google')).toBeInTheDocument();
    expect(screen.getByText(/Excelente/i)).toBeInTheDocument();
    expect(screen.getByText(/95/)).toBeInTheDocument();
  });

  it('exibe warnings PT-BR e classificação POOR quando o perfil existente está incompleto/desatualizado', () => {
    const result: GoogleLookupResult = { found: true, duplicateAlert: false, matches: [POOR_MATCH] };

    render(<ProfileLookupResult {...BASE_PROPS} result={result} />);

    expect(screen.getByText(/Precisa de atenção/i)).toBeInTheDocument();
    expect(screen.getByText('Informe o telefone do seu negócio.')).toBeInTheDocument();
    expect(screen.getAllByText(/desatualizado/i).length).toBeGreaterThan(0);
  });

  it('não exibe bloco de qualidade quando o match não traz o relatório', () => {
    const match = { ...EXCELLENT_MATCH, quality: null };
    const result: GoogleLookupResult = { found: true, duplicateAlert: false, matches: [match] };

    render(<ProfileLookupResult {...BASE_PROPS} result={result} />);

    expect(screen.queryByText(/Excelente/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Precisa de atenção/i)).not.toBeInTheDocument();
  });

  it('explicita os dados obrigatórios para criação quando não há perfil (sem botão até completar)', () => {
    const result: GoogleLookupResult = { found: false, duplicateAlert: false, matches: [] };

    render(<ProfileLookupResult {...BASE_PROPS} result={result} settingsComplete={false} />);

    expect(
      screen.getByText(/Preencha os dados do negócio \(nome, endereço e telefone\)/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar perfil/i })).not.toBeInTheDocument();
  });

  it('habilita criar perfil quando os dados obrigatórios estão completos', () => {
    const result: GoogleLookupResult = { found: false, duplicateAlert: false, matches: [] };

    render(<ProfileLookupResult {...BASE_PROPS} result={result} settingsComplete={true} />);

    expect(screen.getByRole('button', { name: /Criar perfil/i })).toBeEnabled();
  });
});