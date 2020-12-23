import * as RT from 'runtypes';

import { MuxCliConfigV1 } from './v1';
import { MuxCliConfigV2, MuxCliConfigV2Profile, DEFAULT_V2_CONFIG } from './v2';

// If we need to version the config further, add to this union, update
// `MuxCliConfigLatest`, and extend `doUpconvertConfig` below. It should explode
// if you don't do all of those steps! If it doesn't, that's a bug!
export const MuxCliConfigAnyVersion = RT.Union(
  MuxCliConfigV1,
  MuxCliConfigV2,
);
export type MuxCliConfigAnyVersion = RT.Static<typeof MuxCliConfigAnyVersion>;

export const MuxCliConfigLatest = MuxCliConfigV2;
export type MuxCliConfigLatest = MuxCliConfigV2;

export const MuxCliConfigProfileLatest = MuxCliConfigV2Profile;
export type MuxCliConfigProfileLatest = MuxCliConfigV2Profile;

export const DEFAULT_CONFIG = DEFAULT_V2_CONFIG;
