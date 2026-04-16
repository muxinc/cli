import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { getAuthHeaders, getMuxBaseUrl } from '../lib/mux.ts';

interface WhoAmIOptions {
  json?: boolean;
}

export const whoamiCommand = new Command()
  .description('Display the current authenticated environment and user info')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: WhoAmIOptions) => {
    try {
      const headers = await getAuthHeaders();
      const baseUrl = await getMuxBaseUrl();
      const response = await fetch(`${baseUrl}/system/v1/whoami`, { headers });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const body = (await response.json()) as { data: Record<string, unknown> };
      const data = body.data;

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log(
        `Organization:  ${data.organization_name} (${data.organization_id})`,
      );
      console.log(
        `Environment:   ${data.environment_name} (${data.environment_id})`,
      );
      console.log(`Type:          ${data.environment_type}`);
      console.log(`Token:         ${data.access_token_name}`);
      console.log(
        `Permissions:   ${(data.permissions as string[]).join(', ')}`,
      );
    } catch (error) {
      await handleCommandError(error, 'whoami', 'get', options);
    }
  });
