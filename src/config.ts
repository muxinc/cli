import * as RT from 'runtypes';
export const MuxCliConfigV1 = RT.Record({
  configVersion: RT.Literal(1),

  tokenId: RT.String,
  tokenSecret: RT.String,

  signingKeyId: RT.String.Or(RT.Undefined),
  signingKeySecret: RT.String.Or(RT.Undefined),

  baseUrl: RT.String,
});
export type MuxCliConfigV1 = RT.Static<typeof MuxCliConfigV1>;
