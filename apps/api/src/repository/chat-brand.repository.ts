import { sql, type SQL } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

export interface ChatBrandValues {
  primaryColor?: string;
  secondaryColor?: string;
  voiceTone?: 'professional' | 'casual' | 'urgent' | 'premium';
  whatsappNumber?: string | null;
}
export interface ChatBrandSnapshot {
  id: string; version: string; primaryColor: string | null; secondaryColor: string | null;
  voiceTone: string | null; whatsappNumber: string | null;
}
export class ChatBrandRepository extends TenantScopedRepository {
  async snapshot(): Promise<ChatBrandSnapshot | null> {
    const rows = await this.db.execute(sql`SELECT id,xmin::text AS version,primary_color AS "primaryColor",
      secondary_color AS "secondaryColor",voice_tone AS "voiceTone",whatsapp_number AS "whatsappNumber"
      FROM brand_kits WHERE tenant_id=${this.tenantId}::uuid LIMIT 1`);
    return (rows[0] as unknown as ChatBrandSnapshot | undefined) ?? null;
  }
  async updateIfVersion(version: string, values: ChatBrandValues): Promise<{ id: string } | null> {
    const updates: SQL[] = [];
    if (values.primaryColor !== undefined) updates.push(sql`primary_color=${values.primaryColor}`);
    if (values.secondaryColor !== undefined) updates.push(sql`secondary_color=${values.secondaryColor}`);
    if (values.voiceTone !== undefined) updates.push(sql`voice_tone=${values.voiceTone}::voice_tone`);
    if (values.whatsappNumber !== undefined) updates.push(sql`whatsapp_number=${values.whatsappNumber}`);
    if (!updates.length) return null;
    if (version === 'absent') {
      const rows = await this.db.execute(sql`INSERT INTO brand_kits (tenant_id,primary_color,secondary_color,voice_tone,whatsapp_number)
        VALUES (${this.tenantId}::uuid,${values.primaryColor ?? null},${values.secondaryColor ?? null},${values.voiceTone ?? null}::voice_tone,${values.whatsappNumber ?? null})
        ON CONFLICT (tenant_id) DO NOTHING RETURNING id`);
      return (rows[0] as { id: string } | undefined) ?? null;
    }
    updates.push(sql`updated_at=now()`);
    const rows = await this.db.execute(sql`UPDATE brand_kits SET ${sql.join(updates,sql`, `)}
      WHERE tenant_id=${this.tenantId}::uuid AND xmin::text=${version} RETURNING id`);
    return (rows[0] as { id: string } | undefined) ?? null;
  }
}
