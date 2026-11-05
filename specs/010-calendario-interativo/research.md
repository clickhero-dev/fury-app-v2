# Research: Instagram Graph API Publishing (FR8)

## 1. Instagram Content Publishing Flow

### Decision: Two-step container API (image) / three-step (video)

**Rationale**: Meta Graph API v25.0 requires:
1. `POST /{ig-user-id}/media` — create media container
   - Image: `{image_url, caption?, ...}` → immediate container (status `FINISHED`)
   - Video: `{video_url, caption?, media_type: 'REELS'}` → async container (needs polling)
2. `GET /{container-id}?fields=status_code` — poll status (video only)
3. `POST /{ig-user-id}/media_publish?creation_id={id}` — publish

**Alternatives considered**:
- Single-step (Graph API v2.x, deprecated) — not available in v25
- Instagram Basic Display API — read-only, can't publish

### Decision: Use existing codebase patterns

**Rationale**: `meta-api.ts` already has:
- `metaApiCall<T>(path, accessToken)` — typed fetch wrapper with error handling
- `getInstagramBusinessAccountId(accessToken)` — resolves IG user ID
- `getUserFacebookPages(accessToken)` — pages with `instagramUserId`
- `decryptMetaToken()` — token decryption (in `utils/crypto.ts`)
- `getResolvedTenantAssetSelection()` — tenant → selected page resolution

New functions will follow the same pattern (single-responsibility, typed generics).

**Alternatives considered**:
- New `instagram-publish.service.ts` file — overkill, 3 functions fit in `meta-api.ts`
- Direct fetch without `metaApiCall` — loses error handling consistency

### Decision: Image via URL, not binary upload

**Rationale**: Instagram API accepts `image_url` (public URL). The app already uploads media to storage (`storage.service.ts`) returning a URL. No need for binary upload endpoint.

For video: `video_url` must be publicly accessible and meet Instagram specs (MP4, H.264, AAC, max 15min for feed, max 90s for reels).

**Alternatives considered**:
- Binary upload via multipart — adds complexity, storage already handles this

### Decision: Video container polling (exponential backoff)

**Rationale**: Instagram video containers return `status_code: 'IN_PROGRESS'` initially. Poll with: 3s → 6s → 12s (max 3 polls, ~21s total). If still IN_PROGRESS after 3 polls, treat as failure and retry next cron tick.

**Alternatives considered**:
- Blocking wait — would hold cron request open, bad for Lambda/serverless
- Single poll — unreliable for larger videos

## 2. Retry Strategy Implementation

### Decision: Backoff in DB, not in-memory

**Rationale**: `publishDuePosts` runs every 5 min via cron (stateless). Compute `nextRetryAt` from `publishAttempts`:
- Attempt 0 → immediate
- Attempt 1 → now + 1min
- Attempt 2 → now + 5min
- Attempt 3 → now + 15min
- Attempt ≥3 → status = `failed`

The cron query: `WHERE scheduledAt <= now() AND status = 'approved' AND (nextRetryAt IS NULL OR nextRetryAt <= now())`.

After 3 failures: `status = 'failed', lastPublishError = <error message>`.

**Alternatives considered**:
- In-memory queue (BullMQ/Redis) — overkill, cron-based retry via DB is simpler and survives restarts
- Fixed interval retry — doesn't give Meta API breathing room on transient errors

## 3. Account Resolution

### Decision: First page with IG from selectedPageIds

From `metaConnections.selectedPageIds` → find first page with `instagram_business_account.id` using `getUserFacebookPages(accessToken)` → use that `instagramUserId`.

**Fallback**: If no selected page has IG → skip tenant (return `{published: 0}`).

## 4. DB Schema Changes

### Decision: Add 3 columns to socialPosts (no new table)

**Rationale**: ponytail — columns on existing table, not a new `publish_logs` table. YAGNI on audit trail for v1.

```sql
ALTER TABLE social_posts ADD COLUMN publish_attempts INTEGER DEFAULT 0;
ALTER TABLE social_posts ADD COLUMN last_publish_error TEXT;
ALTER TABLE social_posts ADD COLUMN next_retry_at TIMESTAMPTZ;
```

## 5. Testability

### Decision: Extract `publishSinglePost()` as pure function

**Rationale**: `publishDuePosts` currently does query → update in one function. For testability:
1. `publishSinglePost(post, igUserId, accessToken)` → pure logic: upload, create container, poll, publish. Returns `{success, error?}`.
2. `publishDuePosts(tenantId)` → orchestrator: query, call `publishSinglePost` per post, update DB.

`publishSinglePost` can be unit-tested with a mocked `metaApiCall`.

**Alternatives considered**:
- Mock entire Meta API at HTTP level (nock) — integration test, slower. Unit test the pure function first, integration test the whole flow separately.
