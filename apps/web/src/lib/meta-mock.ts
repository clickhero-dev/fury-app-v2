import type { MetaAuthResponse } from '../types/meta';

export const metaMock = {
  getAuthUrl: async (): Promise<MetaAuthResponse> => {
    return {
      url: 'https://facebook.com/mock-oauth',
    };
  },
};
