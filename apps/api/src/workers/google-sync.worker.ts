import { Worker } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import {
  db as dbInstance,
  googleConnections,
  googleBusinessProfiles,
  googleSyncLogs,
} from '../lib/db.js';
import { createGoogleApiClient } from '../lib/google-api.js';
import { decryptToken } from '../utils/crypto.js';
import { sendEmail } from '../services/email/email.service.js';

const GOOGLE_SYNC_QUEUE_NAME = 'google-sync';

let googleSyncWorkerInstance: Worker<{ timestamp: string }> | null = null;

function isPendingSyncStatus(status: string | null | undefined): boolean {
  return status === 'awaiting_verification' || status === 'syncing';
}

/**
 * Sincroniza perfis com syncStatus awaiting_verification/syncing:
 * busca o estado atual no GBP, atualiza o espelho local, escreve o
 * sync log e notifica por email quando a verificação é concluída (US5).
 */
export async function processSyncJob(): Promise<void> {
  const pendingProfiles = await dbInstance.query.googleBusinessProfiles.findMany({
    where: inArray(googleBusinessProfiles.syncStatus, ['awaiting_verification', 'syncing']),
  });

  for (const profile of pendingProfiles) {
    if (profile.syncStatus === 'verified' || profile.verificationState === 'VERIFIED') continue;

    try {
      const connection = await dbInstance.query.googleConnections.findFirst({
        where: eq(googleConnections.id, profile.connectionId),
      });
      if (!connection) continue;

      const client = createGoogleApiClient({
        accessToken: decryptToken(connection.accessToken),
        refreshToken: decryptToken(connection.refreshToken),
        tokenExpiresAt: connection.tokenExpiresAt,
      });

      const gbpLocation = await client.getLocation(profile.gbpLocationId);
      const verificationState = gbpLocation.verification?.state ?? 'UNVERIFIED';

      if (verificationState === 'VERIFIED') {
        await dbInstance
          .update(googleBusinessProfiles)
          .set({
            verificationState: 'VERIFIED',
            syncStatus: 'verified',
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(googleBusinessProfiles.id, profile.id));

        await dbInstance.insert(googleSyncLogs).values({
          tenantId: profile.tenantId,
          connectionId: connection.id,
          profileId: profile.id,
          operation: 'sync',
          status: 'success',
          message: 'Perfil verificado pelo Google.',
        });

        if (profile.email) {
          await sendEmail({
            to: profile.email,
            subject: 'Seu perfil foi verificado no Google Meu Negócio',
            html: `<p>Olá!</p><p>Seu perfil <strong>${profile.name}</strong> foi verificado no Google Meu Negócio. Ele já está visível para clientes.</p>`,
          });
        }
      } else {
        await dbInstance
          .update(googleBusinessProfiles)
          .set({
            verificationState: 'UNVERIFIED',
            syncStatus: profile.syncStatus,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(googleBusinessProfiles.id, profile.id));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido na sincronização.';
      await dbInstance.insert(googleSyncLogs).values({
        tenantId: profile.tenantId,
        connectionId: profile.connectionId,
        profileId: profile.id,
        operation: 'sync',
        status: 'failed',
        message,
      });
    }
  }
}

export async function startGoogleSyncWorker(): Promise<Worker<{ timestamp: string }>> {
  const worker = new Worker<{ timestamp: string }>(
    GOOGLE_SYNC_QUEUE_NAME,
    async () => {
      await processSyncJob();
    },
    {
      connection: (await import('../lib/redis.js')).getRedis().duplicate(),
      concurrency: 1,
    }
  );

  worker.on('error', (err) => {
    console.error('[google-sync] Worker error:', err.message);
  });

  googleSyncWorkerInstance = worker;
  return worker;
}

export async function stopGoogleSyncWorker(): Promise<void> {
  if (googleSyncWorkerInstance) {
    await googleSyncWorkerInstance.close();
    googleSyncWorkerInstance = null;
    console.log('🛑 Google-sync worker stopped');
  }
}