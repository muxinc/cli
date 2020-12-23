import { IConfig } from '@oclif/config';
import chalk = require('chalk');
import * as fsx from 'fs-extra';
import * as path from 'path';

import {
  MuxCliConfigProfileLatest,
  MuxCliConfigLatest,
  MuxCliConfigAnyVersion,
  DEFAULT_CONFIG,
} from './types';
import { convertV1toV2 } from './v2';

function determineConfigFile(oclifConfig: IConfig) {
  return path.join(oclifConfig.configDir, 'config.json');
}

function fetchFromEnvironment(): MuxCliConfigProfileLatest | null {
  if (! (
    process.env.MUX_TOKEN_ID &&
    process.env.MUX_TOKEN_SECRET
  )) {
    return null;
  }

  return {
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
    signingKey:
      (process.env.MUX_SIGNING_KEY && process.env.MUX_PRIVATE_KEY)
        ? { keyId: process.env.MUX_SIGNING_KEY, keySecret: process.env.MUX_PRIVATE_KEY }
        : undefined,

    baseUrl: process.env.MUX_CLI_BASE_URL,
  };
}

export async function fetchFromConfigDir(oclifConfig: IConfig): Promise<MuxCliConfigLatest> {
  try {
    const configFile = determineConfigFile(oclifConfig);

    let configRaw: any;

    if (!fsx.existsSync(configFile)) {
      console.log(
        chalk.cyanBright('NOTICE: ') +
        chalk.cyan('No config file found at \'') +
        chalk.cyanBright(configFile) +
        chalk.cyan('\'; creating empty file.'),
      );

      configRaw = DEFAULT_CONFIG;
    } else {
      configRaw = await fsx.readJSON(configFile);
    }

    configRaw.configVersion = configRaw.configVersion || 1; // backwards compatibility

    const anyConfig = MuxCliConfigAnyVersion.check(configRaw);

    const latestConfig = upconvertConfig(anyConfig);

    if (latestConfig !== anyConfig) {
      console.log(
        chalk.cyanBright('NOTICE: ') +
        chalk.cyan('Upgrading your configuration to version ') +
        chalk.cyanBright(latestConfig.configVersion.toString()) +
        chalk.cyan('.'),
      );

      await saveConfig(oclifConfig, latestConfig);
    }

    return latestConfig;
  } catch (err) {
    console.log(
      chalk.redBright('Error parsing config:') +
      "\n\n" +
      err
    );

    throw err;
  }
}

export async function saveConfig(oclifConfig: IConfig, cfg: MuxCliConfigLatest) {
  const configFile = determineConfigFile(oclifConfig);

  await fsx.writeJSON(configFile, MuxCliConfigLatest.check(cfg), { spaces: 2 });
}

export type FetchProfileArgs = { oclifConfig: IConfig, currentProfile?: string };
export async function fetchProfile({ oclifConfig, currentProfile }: FetchProfileArgs): Promise<MuxCliConfigProfileLatest> {
  const cfg: MuxCliConfigProfileLatest | null =
    fetchFromEnvironment() ??
    ((await fetchFromConfigDir(oclifConfig)).profiles ?? {})[currentProfile ?? 'default'];

  if (!cfg) {
    throw new Error("Could not construct configuration (environment, files, etc.). Try running `mux init`.");
  }

  return cfg;
}

/**
 * Updates an old Mux CLI config to the current latest version. Recursive, so
 * will update version 1 to version 2 and so on.
 * @param cfg
 */
export function upconvertConfig(cfg: MuxCliConfigAnyVersion): MuxCliConfigLatest {
  if (MuxCliConfigLatest.guard(cfg)) {
    return cfg;
  }

  return upconvertConfig(doUpconvertConfig(cfg));
}

function doUpconvertConfig(cfg: MuxCliConfigAnyVersion): MuxCliConfigLatest {
  switch (cfg.configVersion) {
    case 2:
      return cfg;
    case 1:
      return convertV1toV2(cfg);
  }
}
