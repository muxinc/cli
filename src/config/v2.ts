import * as RT from 'runtypes';
import { MuxCliConfigV1 } from './v1';

export const MuxCliConfigV2Profile = RT.Record({
  tokenId: RT.String,
  tokenSecret: RT.String,

  signingKey: RT.Record({
    keyId: RT.String,
    keySecret: RT.String,
  }).Or(RT.Undefined),

  baseUrl: RT.String.Or(RT.Undefined),
});
export type MuxCliConfigV2Profile = RT.Static<typeof MuxCliConfigV2Profile>;

export const MuxCliConfigV2 = RT.Record({
  configVersion: RT.Literal(2),

  profiles: RT.Dictionary(MuxCliConfigV2Profile),
});
export type MuxCliConfigV2 = RT.Static<typeof MuxCliConfigV2>;

export const DEFAULT_V2_CONFIG: MuxCliConfigV2 = {
  configVersion: 2,
  profiles: {},
}

export function convertV1toV2(cfg: MuxCliConfigV1): MuxCliConfigV2 {
  return {
    configVersion: 2,
    profiles: {
      default: {
        tokenId: cfg.tokenId,
        tokenSecret: cfg.tokenSecret,

        signingKey:
          (cfg.signingKeyId && cfg.signingKeySecret)
            ? { keyId: cfg.signingKeyId, keySecret: cfg.signingKeySecret }
            : undefined,

        baseUrl: cfg.baseUrl,
      }
    },
  };
}
