import Command from '@oclif/command';

import { fetchFromConfigDir } from '../../config/fetcher';

export default class ListProfiles extends Command {
  static description =
    "List all Mux CLI profiles";

  async run(): Promise<any> {
    const config = await fetchFromConfigDir(this.config);

    Object.keys(config?.profiles).forEach(n => console.log(n));
  }
}
