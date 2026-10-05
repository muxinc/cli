import { createHash } from 'node:crypto';

/** Mux's limit for `meta.external_id`, in code points. */
const MAX_EXTERNAL_ID_LENGTH = 128;

function hash(sourceId: string): string {
  return createHash('sha256').update(sourceId).digest('hex');
}

/**
 * Maps source IDs to the `meta.external_id` each asset carries, and back.
 * IDs that would exceed Mux's limit, such as long bucket keys, are replaced
 * by a hash, so the reverse lookup needs the migration's source IDs.
 */
export class ExternalIds {
  private readonly prefix: string;
  private readonly hashed = new Map<string, string>();

  constructor(provider: string, sourceIds: Iterable<string>) {
    this.prefix = `${provider}:`;
    for (const sourceId of sourceIds) this.for(sourceId);
  }

  for(sourceId: string): string {
    const plain = `${this.prefix}${sourceId}`;
    if ([...plain].length <= MAX_EXTERNAL_ID_LENGTH) return plain;
    const hashed = `${this.prefix}sha256:${hash(sourceId)}`;
    this.hashed.set(hashed, sourceId);
    return hashed;
  }

  sourceIdFor(externalId: unknown): string | undefined {
    if (typeof externalId !== 'string' || !externalId.startsWith(this.prefix)) {
      return undefined;
    }
    const hashedSource = this.hashed.get(externalId);
    if (hashedSource !== undefined) return hashedSource;
    const sourceId = externalId.slice(this.prefix.length);
    return sourceId.startsWith('sha256:') ? undefined : sourceId;
  }
}
