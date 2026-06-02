import type { LoginResponse, RegisterResponse, User } from '../types/auth';

const mockUser: User = {
  id: '1',
  name: 'Test User',
  email: 'dev.fashion@fury.test',
  company: 'Test Company',
};

export const authMock = {
  login: async (email: string, _password: string): Promise<LoginResponse> => {
    if (email === 'dev.fashion@fury.test') {
      return {
        token: `mock-token-${Date.now()}`,
        user: mockUser,
      };
    }
    throw new Error('Invalid credentials');
  },

  register: async (
    name: string,
    email: string,
    _password: string,
    company: string
  ): Promise<RegisterResponse> => {
    return {
      user: {
        id: String(Date.now()),
        name,
        email,
        company,
      },
    };
  },
};
