import type { AssetShots } from '@mux/ts/resources/video/assets';

export function printShots(assetId: string, shots: AssetShots): void {
  console.log(`Shots for asset ${assetId}:`);
  console.log(`  Status: ${shots.status}`);
  if (shots.shots_manifest_url) {
    console.log(`  Manifest URL: ${shots.shots_manifest_url}`);
  }
  if (shots.errors) {
    const type = shots.errors.type ? ` (${shots.errors.type})` : '';
    console.log(`  Errors${type}:`);
    for (const message of shots.errors.messages ?? []) {
      console.log(`    ${message}`);
    }
  }
}
