import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import {
  createAuthenticatedMuxClient,
  resolveActiveEnvironment,
} from '../lib/mux.ts';
import { getSignedUrl } from '../lib/urls.ts';

interface SignOptions {
  expiration?: string;
  type?: string;
  json?: boolean;
  tokenOnly?: boolean;
  param?: string[];
  paramsJson?: string;
}

// Valid token types for signing
const VALID_TYPES = ['video', 'thumbnail', 'gif', 'storyboard'] as const;
type TokenType = (typeof VALID_TYPES)[number];

// Type guard for validating token types
function isValidTokenType(type: string): type is TokenType {
  return VALID_TYPES.includes(type as TokenType);
}

/**
 * Parse "key=value" strings into a flat record.
 */
function parseKeyValuePairs(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      throw new Error(
        `Invalid parameter format: "${pair}". Expected key=value.`,
      );
    }
    result[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
  }
  return result;
}

/**
 * Build the combined params object from --param and --params-json.
 */
function buildParams(
  options: SignOptions,
): Record<string, unknown> | undefined {
  const params: Record<string, unknown> = {};
  let hasParams = false;

  // --params-json takes lowest precedence (base layer)
  if (options.paramsJson) {
    try {
      const parsed = JSON.parse(options.paramsJson);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error('--params-json must be a JSON object.');
      }
      Object.assign(params, parsed);
      hasParams = true;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in --params-json: ${error.message}`);
      }
      throw error;
    }
  }

  // --param key=value pairs override --params-json
  if (options.param?.length) {
    const flatParams = parseKeyValuePairs(options.param);
    Object.assign(params, flatParams);
    hasParams = true;
  }

  return hasParams ? params : undefined;
}

export const signCommand = new Command()
  .description(
    'Sign a playback ID, returning a JWT token and signed playback URL',
  )
  .arguments('<playback-id:string>')
  .option(
    '-e, --expiration <duration:string>',
    'Token expiration (e.g., 1h, 7d, 30d). Supports s/m/h/d suffixes.',
    {
      default: '7d',
    },
  )
  .option(
    '-t, --type <type:string>',
    'Token type: video, thumbnail, gif, or storyboard',
    {
      default: 'video',
      value: (value: string): string => {
        if (!isValidTokenType(value)) {
          throw new Error(
            `Invalid type: ${value}. Must be one of: ${VALID_TYPES.join(', ')}`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '-p, --param <param:string>',
    'JWT claim as key=value (repeatable). Common: aud, sub, kid.',
    {
      collect: true,
    },
  )
  .option('--params-json <json:string>', 'JWT claims as a JSON object')
  .option('--json', 'Output JSON instead of pretty format')
  .option(
    '--token-only',
    'Output only the JWT token (for custom URL construction)',
  )
  .action(async (options: SignOptions, playbackId: string) => {
    try {
      // Resolve signing key material.
      // Priority: MUX_SIGNING_KEY/MUX_PRIVATE_KEY env vars > stored config
      // (consistent with how MUX_TOKEN_ID/MUX_TOKEN_SECRET take precedence).
      // Env vars are only used when both are set and non-empty. Stored keys
      // are only used when the stored environment matches the active
      // credentials, so tokens for one environment cannot mint JWTs with
      // another environment's key.
      let keyId: string | undefined;
      let keySecret: string | undefined;
      const envSigningKey = process.env.MUX_SIGNING_KEY;
      const envPrivateKey = process.env.MUX_PRIVATE_KEY;
      if (envSigningKey && envPrivateKey) {
        keyId = envSigningKey;
        keySecret = envPrivateKey;
      } else {
        const active = await resolveActiveEnvironment();
        keyId = active.stored?.environment.signingKeyId;
        keySecret = active.stored?.environment.signingPrivateKey;
      }

      if (!keyId || !keySecret) {
        throw new Error(
          'Signing keys not configured.\n\n' +
            'To create and configure a signing key, run:\n' +
            '  mux signing-keys create\n\n' +
            'This creates a new signing key and saves it to your current environment.\n' +
            'Alternatively, set the MUX_SIGNING_KEY and MUX_PRIVATE_KEY environment variables (API credentials are still required).',
        );
      }

      // Create Mux client (signing is local; credentials resolve from env
      // vars or stored config like every other command)
      const mux = await createAuthenticatedMuxClient();

      const tokenType =
        options.type && isValidTokenType(options.type) ? options.type : 'video';

      const params = buildParams(options);

      // Build sign options, casting to work around SDK's strict Record<string, string> typing
      const signOptions = {
        keyId,
        keySecret,
        type: tokenType,
        expiration: options.expiration || '7d',
        ...(params ? { params } : {}),
      };

      const token = await mux.jwt.signPlaybackId(
        playbackId,
        signOptions as unknown as Parameters<typeof mux.jwt.signPlaybackId>[1],
      );

      const url = getSignedUrl(playbackId, token as string, tokenType);

      // Output based on format options
      if (options.tokenOnly) {
        console.log(token);
      } else if (wantsJson(options)) {
        console.log(
          JSON.stringify(
            {
              playback_id: playbackId,
              token,
              url,
              type: tokenType,
              expiration: options.expiration || '7d',
              ...(params ? { params } : {}),
            },
            null,
            2,
          ),
        );
      } else {
        console.log(url);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (wantsJson(options)) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
