import { AuthenticationError, NotFoundError } from '@mux/mux-node';
import { wantsJson } from '@/lib/context.ts';
import { getAuthContext } from './mux.ts';

/**
 * Format a permission error message for display.
 */
export function formatPermissionError(
  tokenPermissions: string[],
  tokenName?: string,
  apiResponseBody?: unknown,
): string {
  const lines = ['Permission denied or this route does not exist.'];
  if (apiResponseBody) {
    lines.push(JSON.stringify(apiResponseBody));
  }
  lines.push('');

  if (tokenName) {
    lines.push(
      `Your token "${tokenName}" has permissions: ${tokenPermissions.join(', ')}`,
    );
  } else {
    lines.push(`Your token has permissions: ${tokenPermissions.join(', ')}`);
  }

  lines.push('');
  lines.push('You can create a new token at:');
  lines.push('https://dashboard.mux.com/settings/access-tokens');
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
    const { headers, baseUrl } = await getAuthContext();
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
 * On NotFoundError (404), fetches token permissions via /whoami and displays
 * them alongside the error, since the Mux API returns 404 for scope issues.
 */
export async function handleCommandError(
  error: unknown,
  _commandGroup: string,
  _action: string,
  options: { json?: boolean },
): Promise<never> {
  const json = wantsJson(options);

  // 401: invalid/expired credentials
  if (error instanceof AuthenticationError) {
    const message =
      "Authentication failed. Please run 'mux login' to re-authenticate.";
    if (json) {
      console.error(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(1);
  }

  // 404: could be a permission issue (Mux API returns 404 for missing scopes)
  if (error instanceof NotFoundError) {
    const tokenInfo = await fetchTokenInfo();

    if (tokenInfo) {
      const message = formatPermissionError(
        tokenInfo.permissions,
        tokenInfo.tokenName,
        error.error,
      );
      if (json) {
        console.error(
          JSON.stringify(
            {
              error: 'not_found_or_permission_denied',
              api_response: error.error,
              token_permissions: tokenInfo.permissions,
              docs: 'https://dashboard.mux.com/settings/access-tokens',
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

  // Default: generic error formatting
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (json) {
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
): Promise<string | null> {
  if (response.status === 401) {
    return "Authentication failed. Please run 'mux login' to re-authenticate.";
  }

  if (response.status === 404 || response.status === 403) {
    const tokenInfo = await fetchTokenInfo();
    if (tokenInfo) {
      return formatPermissionError(tokenInfo.permissions, tokenInfo.tokenName);
    }
    // Even if /whoami fails, 403 is never transient — don't return null
    // and let it enter a retry loop.
    if (response.status === 403) {
      return "Permission denied. Please check your token's permissions at:\nhttps://dashboard.mux.com/settings/access-tokens";
    }
  }

  return null;
}
