# Static Renditions Management

## Goal
Add the ability to manage static renditions (downloadable MP4s) on assets, both through the asset management TUI and via CLI commands.

## API Endpoints (Mux SDK)
The Mux Node SDK provides these methods on `mux.video.assets`:

- `createStaticRendition(assetId, { resolution, passthrough? })` - Create a new rendition
- `deleteStaticRendition(assetId, staticRenditionId)` - Delete a specific rendition
- Asset's `static_renditions` field contains the current state:
  - `status`: 'ready' | 'preparing' | 'disabled' | 'errored'
  - `files`: Array of rendition files with id, resolution, status, bitrate, dimensions, etc.

### Resolution Options
- `highest` - Highest quality based on source
- `audio-only` - Audio only (m4a)
- `2160p`, `1440p`, `1080p`, `720p`, `540p`, `480p`, `360p`, `270p`

### Rendition File Statuses
- `ready` - MP4 is generated and available
- `preparing` - Still being generated
- `skipped` - Resolution conflicts with asset attributes
- `errored` - Generation failed

## Implementation Plan

### Phase 1: CLI Commands
New subcommand group: `mux assets static-renditions <command>`

**File Structure:**
```
src/commands/assets/static-renditions/
├── index.ts          (command group)
├── list.ts           (list renditions for an asset)
├── create.ts         (create a new rendition)
├── delete.ts         (delete a specific rendition)
├── list.test.ts
├── create.test.ts
└── delete.test.ts
```

**Commands:**

1. **`mux assets static-renditions list <asset-id>`**
   - Retrieves asset and displays static_renditions info
   - Shows each file: resolution, status, dimensions, bitrate, filesize
   - Supports `--json` for machine output

2. **`mux assets static-renditions create <asset-id>`**
   - `--resolution <res>` (required) - One of the valid resolution options
   - `--passthrough <string>` (optional) - Custom metadata (max 255 chars)
   - `--wait` (optional) - Poll until rendition is ready instead of returning immediately
   - Supports `--json` for machine output
   - Default: Returns immediately with message explaining async generation
   - With `--wait`: Polls and returns when rendition is ready/errored/skipped

3. **`mux assets static-renditions delete <asset-id> <rendition-id>`**
   - Deletes a specific static rendition by ID
   - Shows confirmation of deletion

### Phase 2: TUI Integration
Add static renditions management to the existing `mux assets manage` TUI.

**New TUI Views:**
- `view-static-renditions` - Display list of current static renditions
- `select-static-rendition` - Select a rendition for deletion
- `select-resolution` - Select resolution when creating a rendition
- `confirm-delete-rendition` - Confirm deletion of a rendition

**New Actions in Asset Action Menu:**
- "View static renditions" - Shows current renditions with status info
- "Create static rendition" - Create a new MP4 rendition
- "Delete static rendition" - Remove an existing rendition
- "Copy rendition URL" - Copy download URL for a ready rendition

**Display Format for Renditions:**
```
Static Renditions:
  1080p.mp4  [ready]     1920x1080  5.2 Mbps  42.3 MB
  720p.mp4   [preparing] 1280x720   -         -
  audio.m4a  [ready]     -          128 kbps  1.2 MB
```
Status labels use background colors in TUI:
- `ready` - green background
- `preparing` - yellow background
- `skipped` - gray background
- `errored` - red background

### Phase 3: Enhance Asset Display
- Show static renditions summary in asset list view (e.g., "3 renditions")
- Show static renditions in asset details panel
- Consider adding rendition count to asset label in TUI

## Technical Notes

### Types from SDK
All types are imported directly from the Mux SDK - no mirroring in CLI code:

```typescript
import type { Asset } from "@mux/mux-node/resources/video/assets";
import type Mux from "@mux/mux-node";

// Resolution type extracted from SDK
type Resolution = NonNullable<Mux.Video.AssetCreateStaticRenditionParams["resolution"]>;

// Rendition file type from asset
type StaticRenditionFile = NonNullable<Asset["static_renditions"]>["files"][number];

// Create response type
type CreateStaticRenditionResponse = Mux.Video.AssetCreateStaticRenditionResponse;
```

### Display Helpers Needed
- `formatBitrate(bps)` - Convert bits/sec to human readable (e.g., "5.2 Mbps")
- `formatFilesize(bytes)` - Convert bytes to human readable (e.g., "42.3 MB")
- `formatRenditionStatus(status)` - Text label with background color for TUI

## Decisions Made

1. **Download URLs for ready renditions** - Yes, include "Copy download URL" action for renditions with `ready` status. Static rendition URLs are accessible via the playback ID.

2. **Create command behavior** - Return immediately by default with a helpful message explaining that rendition generation is async. Add `--wait` flag to optionally poll until the rendition is ready.

## Testing Strategy

- Unit tests for CLI commands with mocked Mux client
- Test validation of resolution options
- Test error handling for invalid asset IDs, rendition IDs
- Test JSON vs pretty output formats
- TUI components are tested via manual verification

## TODO

- [x] Write tests for static-renditions list command
- [x] Implement static-renditions list command
- [x] Write tests for static-renditions create command
- [x] Implement static-renditions create command
- [x] Write tests for static-renditions delete command
- [x] Implement static-renditions delete command
- [x] Wire up static-renditions command group to assets
- [x] Add static renditions views to TUI
- [x] Add static renditions actions to TUI action menu
- [ ] Test end-to-end with real Mux account

## Code Review Findings

### Must Fix Before Merging

1. ~~**Missing README documentation** - The new `mux assets static-renditions` commands need to be documented in README.md, similar to the playback-ids documentation.~~ **FIXED**

2. ~~**Missing confirmation prompt on delete** - The `static-renditions delete` command has no `--force` flag or confirmation prompt, unlike `playback-ids delete`. Need to add for consistency and safety.~~ **FIXED**

### Should Fix Soon

3. **Code duplication** - `formatBitrate()` and `formatFilesize()` are duplicated in 3 places:
   - `src/commands/assets/static-renditions/create.ts`
   - `src/commands/assets/static-renditions/list.ts`
   - `src/commands/assets/manage/AssetManageApp.tsx`

   Should extract to a shared utility module like `src/lib/format-utils.ts`.

### Nice to Have

4. **Enhance `mux assets get`** - Show static renditions summary in asset details output.

5. **TUI download URLs** - Show download URLs directly in the static renditions view for ready renditions.

6. **Additional test coverage** - Add edge case tests for passthrough validation (>255 chars).

## Observations

- The `static_renditions.status` field on the asset is related to the deprecated `mp4_support` feature. With the new static renditions API, status is per-rendition, not overall. Removed "overall status" display from both CLI and TUI.
