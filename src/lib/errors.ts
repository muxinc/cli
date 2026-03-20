import { AuthenticationError, NotFoundError } from '@mux/mux-node';
import { getAuthHeaders, getMuxBaseUrl } from './mux.ts';

// Read-only operations
const READ_ACTIONS = new Set([
  'get',
  'list',
  'retrieve',
  'input-info',
  'related',
  'breakdown',
  'timeseries',
  'overall',
  'insights',
  'values',
  'metrics',
  'dimensions',
  'breakdown-timeseries',
  'histogram-timeseries',
  'listen',
]);

// Command groups to their permission scope
const VIDEO_COMMANDS = new Set([
  'assets',
  'live',
  'uploads',
  'playback-ids',
  'playback-restrictions',
  'transcription-vocabularies',
  'drm-configurations',
  'delivery-usage',
]);

const DATA_COMMANDS = new Set([
  'metrics',
  'video-views',
  'monitoring',
  'incidents',
  'dimensions',
  'errors',
  'exports',
  'annotations',
]);

const SYSTEM_COMMANDS = new Set(['signing-keys', 'webhooks']);

/**
 * Get the required permission for a command.
 * Returns the permission string (e.g., "video:read") or undefined if unknown.
 */
export function getRequiredPermission(
  commandGroup: string,
  action: string,
): string | undefined {
  let scope: string | undefined;

  if (VIDEO_COMMANDS.has(commandGroup)) {
    scope = 'video';
  } else if (DATA_COMMANDS.has(commandGroup)) {
    scope = 'data';
  } else if (SYSTEM_COMMANDS.has(commandGroup)) {
    scope = 'system';
  }

  if (!scope) return undefined;

  const level = READ_ACTIONS.has(action) ? 'read' : 'write';
  return `${scope}:${level}`;
}

/**
 * Check if a required permission is missing from the token's permissions.
 * Write permission implies read permission for the same scope.
 */
export function isPermissionError(
  required: string,
  tokenPermissions: string[],
): boolean {
  const [requiredScope, requiredLevel] = required.split(':');

  for (const perm of tokenPermissions) {
    const [scope, level] = perm.split(':');
    if (scope !== requiredScope) continue;

    // write implies read
    if (requiredLevel === 'read' && (level === 'read' || level === 'write')) {
      return false;
    }
    if (requiredLevel === 'write' && level === 'write') {
      return false;
    }
  }

  return true;
}

/**
 * Format a permission error message for display.
 */
export function formatPermissionError(
  required: string,
  tokenPermissions: string[],
  tokenName?: string,
): string {
  const lines = [
    `Permission denied. Your API token does not have "${required}" permission.`,
    '',
  ];

  if (tokenName) {
    lines.push(`Your token "${tokenName}" has: ${tokenPermissions.join(', ')}`);
  } else {
    lines.push(`Your token has: ${tokenPermissions.join(', ')}`);
  }

  lines.push('');
  lines.push('Create a new access token with the required permissions at:');
  lines.push('https://dashboard.mux.com/settings/access-tokens');
  lines.push('');
  lines.push("Then run 'mux login' to authenticate with the new token.");

  return lines.join('\n');
}

interface WhoAmIResponse {
  data: {
    permissions: string[];
    access_token_name?: string;
  };
}

/**
 * Fetch the current token's permissions via /whoami.
 * Returns null if the call fails for any reason.
 */
async function fetchTokenInfo(): Promise<{
  permissions: string[];
  tokenName?: string;
} | null> {
  try {
    const headers = await getAuthHeaders();
    const baseUrl = getMuxBaseUrl();
    const response = await fetch(`${baseUrl}/system/v1/whoami`, { headers });

    if (!response.ok) return null;

    const body = (await response.json()) as WhoAmIResponse;
    return {
      permissions: body.data.permissions,
      tokenName: body.data.access_token_name,
    };
  } catch {
    return null;
  }
}

/**
 * Handle errors from Mux API commands.
 *
 * On NotFoundError (404), checks whether the token lacks the required
 * permission (since the Mux API returns 404, not 403, for scope issues).
 * Falls back to the standard error message if permissions are fine.
 */
export async function handleCommandError(
  error: unknown,
  commandGroup: string,
  action: string,
  options: { json?: boolean },
): Promise<never> {
  // 401: invalid/expired credentials
  if (error instanceof AuthenticationError) {
    const message =
      "Authentication failed. Please run 'mux login' to re-authenticate.";
    if (options.json) {
      console.error(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(1);
  }

  // 404: could be a permission issue (Mux API returns 404 for missing scopes)
  if (error instanceof NotFoundError) {
    const required = getRequiredPermission(commandGroup, action);

    if (required) {
      const tokenInfo = await fetchTokenInfo();

      if (tokenInfo && isPermissionError(required, tokenInfo.permissions)) {
        const message = formatPermissionError(
          required,
          tokenInfo.permissions,
          tokenInfo.tokenName,
        );
        if (options.json) {
          console.error(
            JSON.stringify(
              {
                error: 'permission_denied',
                message: `Your API token does not have "${required}" permission.`,
                token_permissions: tokenInfo.permissions,
                required_permission: required,
                docs: 'https://dashboard.mux.com/settings/access-tokens#create',
              },
              null,
              2,
            ),
          );
        } else {
          console.error(`Error: ${message}`);
        }
        process.exit(1);
      }
    }
  }

  // Default: generic error formatting
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (options.json) {
    console.error(JSON.stringify({ error: errorMessage }, null, 2));
  } else {
    console.error(`Error: ${errorMessage}`);
  }
  process.exit(1);
}

/**
 * Check if a non-ok fetch response is a permission error.
 * Returns a formatted error message if it is, or null if not.
 */
export async function checkFetchPermissionError(
  response: Response,
  commandGroup: string,
  action: string,
): Promise<string | null> {
  if (response.status === 401) {
    return "Authentication failed. Please run 'mux login' to re-authenticate.";
  }

  if (response.status === 404 || response.status === 403) {
    const required = getRequiredPermission(commandGroup, action);

    if (required) {
      const tokenInfo = await fetchTokenInfo();

      if (tokenInfo && isPermissionError(required, tokenInfo.permissions)) {
        return formatPermissionError(
          required,
          tokenInfo.permissions,
          tokenInfo.tokenName,
        );
      }
    }
  }

  return null;
}

/**
 * Handle a non-ok fetch Response for raw fetch commands (not using the SDK).
 * Checks for permission issues on 401, 404, and exits with a formatted error.
 */
export async function handleFetchResponseError(
  response: Response,
  commandGroup: string,
  action: string,
  options: { json?: boolean },
): Promise<never> {
  const permError = await checkFetchPermissionError(
    response,
    commandGroup,
    action,
  );

  if (permError) {
    if (options.json) {
      console.error(JSON.stringify({ error: permError }, null, 2));
    } else {
      console.error(`Error: ${permError}`);
    }
    process.exit(1);
  }

  // Generic error
  const errorMessage = `${response.status} ${response.statusText}`;
  if (options.json) {
    console.error(JSON.stringify({ error: errorMessage }, null, 2));
  } else {
    console.error(`Error: ${errorMessage}`);
  }
  process.exit(1);
}
