/* # language: pt-BR
Funcionalidade: validar Home e navegação sem ações reais com custo
  Cenário: conta QA autentica, vê os quatro caminhos, abre orientação e consulta o Painel
*/
import { test } from '@playwright/test';
import { readOnlyJourney } from './read-only-journey';

test('jornada de leitura: login, Home, orientação e Painel', async ({ page }) => {
  const email = process.env.QA_EMAIL ?? '';
  const password = process.env.QA_PASSWORD ?? '';
  if (!email || !password) throw new Error('Defina QA_EMAIL e QA_PASSWORD para autenticar a conta de teste.');
  await readOnlyJourney(page, { apiURL: process.env.QA_API_URL ?? 'http://localhost:3000/api', email, password });
});
