import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db, creativeAssets, tenants, users } from '@fury/db';
import { eq } from 'drizzle-orm';
import { complianceQueue } from '../lib/queue.js';

describe('Compliance Check Worker', () => {
  let accessToken: string;
  let tenantId: string;
  let userId: string;
  const uniqueId = () => Date.now().toString().slice(-8);

  const clearData = async () => {
    await db.delete(creativeAssets);
    await db.delete(users);
    await db.delete(tenants);
  };

  beforeEach(async () => {
    await clearData();

    // Create user via auth endpoint
    const id = uniqueId();
    const registerResponse = await request(app).post('/api/auth/register').send({
      name: 'Test Compliance User',
      email: `compliance-${id}@test.com`,
      password: 'SecurePass123!',
      companyName: `Compliance Test ${id}`,
    });

    expect(registerResponse.status).toBe(201);
    accessToken = registerResponse.body.data.tokens.accessToken;
    tenantId = registerResponse.body.data.user.tenantId;
    userId = registerResponse.body.data.user.id;
  });

  describe('Job Queue Integration', () => {
    it('should create a job in compliance queue', async () => {
      // Create a creative asset
      const [asset] = await db
        .insert(creativeAssets)
        .values({
          tenantId,
          type: 'image' as any,
          url: 'https://picsum.photos/1024/1024',
          complianceStatus: 'pending_compliance' as any,
        })
        .returning();

      expect(asset.id).toBeDefined();

      // Add job to compliance queue
      const job = await complianceQueue.add('compliance-check', {
        creativeAssetId: asset.id,
        tenantId,
      });

      expect(job.id).toBeDefined();
      expect(job.data.creativeAssetId).toBe(asset.id);
      expect(job.data.tenantId).toBe(tenantId);

      // Cleanup
      await complianceQueue.obliterate({ force: true });
    });

    it('should handle job with missing API key gracefully', async () => {
      // Save original API key
      const originalApiKey = process.env.ANTHROPIC_API_KEY;

      try {
        // Remove API key
        delete process.env.ANTHROPIC_API_KEY;

        // Create a creative asset
        const [asset] = await db
          .insert(creativeAssets)
          .values({
            tenantId,
            type: 'image' as any,
            url: 'https://picsum.photos/1024/1024',
            complianceStatus: 'pending_compliance' as any,
          })
          .returning();

        // Add job to compliance queue
        const job = await complianceQueue.add('compliance-check', {
          creativeAssetId: asset.id,
          tenantId,
        });

        // Wait a bit for job to process
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check asset status - should be approved with fallback note
        const [updatedAsset] = await db
          .select()
          .from(creativeAssets)
          .where(eq(creativeAssets.id, asset.id));

        expect(updatedAsset.complianceStatus).toBe('approved');
        expect(updatedAsset.complianceNotes).toContain('FALLBACK');

        // Cleanup
        await complianceQueue.obliterate({ force: true });
      } finally {
        // Restore API key
        if (originalApiKey) {
          process.env.ANTHROPIC_API_KEY = originalApiKey;
        }
      }
    });
  });

  describe('Asset Validation', () => {
    it('should reject asset with missing URL', async () => {
      // Create an asset without URL
      const [asset] = await db
        .insert(creativeAssets)
        .values({
          tenantId,
          type: 'image' as any,
          url: '', // Empty URL
          complianceStatus: 'pending_compliance' as any,
        })
        .returning();

      // Add job to compliance queue
      const job = await complianceQueue.add('compliance-check', {
        creativeAssetId: asset.id,
        tenantId,
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check asset status
      const [updatedAsset] = await db
        .select()
        .from(creativeAssets)
        .where(eq(creativeAssets.id, asset.id));

      expect(updatedAsset.complianceStatus).toBe('rejected');
      expect(updatedAsset.complianceNotes).toContain('Asset não encontrado');

      // Cleanup
      await complianceQueue.obliterate({ force: true });
    });

    it('should create asset with pending_compliance status', async () => {
      const [asset] = await db
        .insert(creativeAssets)
        .values({
          tenantId,
          type: 'image' as any,
          url: 'https://picsum.photos/1024/1024',
          complianceStatus: 'pending_compliance' as any,
        })
        .returning();

      expect(asset.complianceStatus).toBe('pending_compliance');
      expect(asset.complianceNotes).toBeNull();
    });

    it('should support compliance_notes field', async () => {
      const testNote = 'Test compliance note with emoji 📋';

      const [asset] = await db
        .insert(creativeAssets)
        .values({
          tenantId,
          type: 'image' as any,
          url: 'https://picsum.photos/1024/1024',
          complianceStatus: 'rejected' as any,
          complianceNotes: testNote,
        })
        .returning();

      expect(asset.complianceNotes).toBe(testNote);

      // Verify it can be updated
      await db
        .update(creativeAssets)
        .set({
          complianceNotes: 'Updated note',
        })
        .where(eq(creativeAssets.id, asset.id));

      const [updatedAsset] = await db
        .select()
        .from(creativeAssets)
        .where(eq(creativeAssets.id, asset.id));

      expect(updatedAsset.complianceNotes).toBe('Updated note');
    });
  });

  describe('Queue Operations', () => {
    it('should handle multiple jobs in sequence', async () => {
      const assets = await db
        .insert(creativeAssets)
        .values([
          {
            tenantId,
            type: 'image' as any,
            url: 'https://picsum.photos/1024/1024?1',
            complianceStatus: 'pending_compliance' as any,
          },
          {
            tenantId,
            type: 'image' as any,
            url: 'https://picsum.photos/1024/1024?2',
            complianceStatus: 'pending_compliance' as any,
          },
          {
            tenantId,
            type: 'image' as any,
            url: 'https://picsum.photos/1024/1024?3',
            complianceStatus: 'pending_compliance' as any,
          },
        ])
        .returning();

      // Add multiple jobs
      const jobs = await Promise.all(
        assets.map((asset) =>
          complianceQueue.add('compliance-check', {
            creativeAssetId: asset.id,
            tenantId,
          })
        )
      );

      expect(jobs).toHaveLength(3);
      jobs.forEach((job) => {
        expect(job.id).toBeDefined();
      });

      // Cleanup
      await complianceQueue.obliterate({ force: true });
    });

    it('should provide job count', async () => {
      const [asset] = await db
        .insert(creativeAssets)
        .values({
          tenantId,
          type: 'image' as any,
          url: 'https://picsum.photos/1024/1024',
          complianceStatus: 'pending_compliance' as any,
        })
        .returning();

      await complianceQueue.add('compliance-check', {
        creativeAssetId: asset.id,
        tenantId,
      });

      const count = await complianceQueue.getJobCounts();
      expect(count.waiting).toBeGreaterThan(0);

      // Cleanup
      await complianceQueue.obliterate({ force: true });
    });
  });
});
