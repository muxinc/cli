import { Command } from '@cliffy/command';
import Mux from '@mux/mux-node';
import { getDefaultEnvironment } from '../lib/config.ts';

interface SignOptions {
  expiration?: string;
  type?: string;
  json?: boolean;
  tokenOnly?: boolean;
}

// Valid token types for signing
const VALID_TYPES = ['video', 'thumbnail', 'gif', 'storyboard'] as const;
type TokenType = (typeof VALID_TYPES)[number];

// Type guard for validating token types
function isValidTokenType(type: string): type is TokenType {
  return VALID_TYPES.includes(type as TokenType);
}

export const signCommand = new Command()
  .description('Sign a playback ID for secure video playback')
  .arguments('<playback-id:string>')
  .option('-e, --expiration <duration:string>', 'Token expiration duration', {
    default: '7d',
  })
  .option('-t, --type <type:string>', 'Token type', {
    default: 'video',
    value: (value: string): string => {
      if (!isValidTokenType(value)) {
        throw new Error(
          `Invalid type: ${value}. Must be one of: ${VALID_TYPES.join(', ')}`,
        );
      }
      return value;
    },
  })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--token-only', 'Output only the JWT token')
  .action(async (options: SignOptions, playbackId: string) => {
    try {
      // Get current environment to retrieve signing keys
      const currentEnv = await getDefaultEnvironment();
      if (!currentEnv) {
        throw new Error(
          'No environment configured.\n\n' +
            'Signing requires an authenticated environment.\n' +
            "Please run 'mux login' first.",
        );
      }

      // Check if signing keys are configured
      if (
        !currentEnv.environment.signingKeyId ||
        !currentEnv.environment.signingPrivateKey
      ) {
        throw new Error(
          'Signing keys not configured for this environment.\n\n' +
            'To create and configure a signing key, run:\n' +
            '  mux signing-keys create\n\n' +
            'This will create a new signing key and automatically configure it for your current environment.',
        );
      }

      // Create Mux client (only need API credentials, not signing keys in constructor)
      const mux = new Mux({
        tokenId: currentEnv.environment.tokenId,
        tokenSecret: currentEnv.environment.tokenSecret,
      });

      // Sign the playback ID with explicit signing credentials
      // The SDK handles base64-encoded keys automatically
      const tokenType =
        options.type && isValidTokenType(options.type) ? options.type : 'video';

      const token = await mux.jwt.signPlaybackId(playbackId, {
        keyId: currentEnv.environment.signingKeyId,
        keySecret: currentEnv.environment.signingPrivateKey,
        type: tokenType,
        expiration: options.expiration || '7d',
      });

      // Output based on format options
      if (options.tokenOnly) {
        console.log(token);
      } else if (options.json) {
        const url = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
        console.log(
          JSON.stringify(
            {
              playback_id: playbackId,
              token,
              url,
              type: options.type || 'video',
              expiration: options.expiration || '7d',
            },
            null,
            2,
          ),
        );
      } else {
        const url = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
        console.log(url);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (options.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
