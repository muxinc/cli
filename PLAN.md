# Interactive TUI for Asset Management

## Goal
Create a new `mux assets manage` command that provides an interactive TUI where users can browse, select, and manage assets directly from the terminal using OpenTUI.

The existing `mux assets list` command remains unchanged for scripting/piping use cases.

## Technology Choice
**OpenTUI** (`@opentui/react`) - A TypeScript library for building TUIs with React support, built with Bun in mind.

### Key Components Available
- `<text>` - Display text with styling
- `<box>` - Container with borders and layout
- `<select>` - Selection dropdown (key for our asset list!)
- `<scrollbox>` - Scrollable container
- `<input>` - Text input field

### Key Hooks
- `useKeyboard(handler)` - Handle keyboard events
- `useTerminalDimensions()` - Get terminal width/height
- `useRenderer()` - Access the OpenTUI renderer instance

## Proposed UX Flow

```
$ mux assets manage
```

### Asset List View
```
┌─ Mux Assets ──────────────────────────────────────────┐
│                                                        │
│  ↑↓ navigate  Enter select  q quit  / search          │
│                                                        │
│  > asset-abc123  ready     2:34  "My video title"     │
│    asset-def456  ready     5:12  "Another video"      │
│    asset-ghi789  errored    -    "Failed upload"      │
│    asset-jkl012  preparing  -                         │
│                                                        │
│  Page 1/4  [n]ext [p]rev                              │
└────────────────────────────────────────────────────────┘
```

### Asset Action Menu (on selection)
```
┌─ Asset: asset-abc123 ─────────────────────────────────┐
│                                                        │
│  > View details                                        │
│    Copy stream URL (HLS)                               │
│    Copy player URL                                     │
│    Create playback ID                                  │
│    Delete playback ID                                  │
│    Delete asset                                        │
│    Back to list                                        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

## Decisions Made

1. **Command**: `mux assets manage` - new dedicated command for interactive TUI
   - `mux assets list` remains unchanged for scripting
   - Clear separation of interactive vs. scripting use cases

2. **Actions available**:
   - View details
   - Copy stream URL (`stream.mux.com/{playback_id}.m3u8`) - auto-signed if asset is signed
   - Copy player URL (`player.mux.com/{playback_id}`) - auto-signed if asset is signed
   - Create playback ID
   - Delete playback ID
   - Delete asset (with confirmation)
   - Back to list

3. **Scope**: Assets only for now, but build reusable components for future use with live streams, signing keys, etc.

## Implementation Plan

### Phase 1: Shared Utilities
Core business logic that both CLI commands and TUI will use.

- [ ] `src/lib/signing.ts` - Extract signing logic from `sign.ts`
  - `signPlaybackId(playbackId, options)`
  - `hasSigningKeys()` - Check if env has signing configured
- [ ] `src/lib/urls.ts` - URL generation utilities
  - `getStreamUrl(playbackId, token?)`
  - `getPlayerUrl(playbackId, token?)`
- [ ] `src/lib/playback-ids.ts` - Playback ID operations
  - `createPlaybackId(mux, assetId, policy)`
  - `deletePlaybackId(mux, assetId, playbackId)`
- [ ] Tests for all utilities

### Phase 2: Playback ID CLI Commands
New commands: `mux assets playback-ids <create|delete|list>`

- [ ] `src/commands/assets/playback-ids/create.ts`
- [ ] `src/commands/assets/playback-ids/delete.ts`
- [ ] `src/commands/assets/playback-ids/list.ts`
- [ ] `src/commands/assets/playback-ids/index.ts`
- [ ] Wire up to assets command
- [ ] Tests for commands

### Phase 3: TUI Foundation (reusable components)
- [ ] Create TUI component architecture in `src/lib/tui/`
- [ ] Set up OpenTUI React rendering utilities
- [ ] Create reusable `<SelectList>` component with keyboard navigation
- [ ] Create reusable `<ActionMenu>` component
- [ ] Create `<ConfirmDialog>` component for destructive actions
- [ ] Utility for clipboard operations

### Phase 4: Asset Manage TUI
- [ ] Build `<AssetListView>` component using reusable pieces
- [ ] Format asset rows (ID, status, duration, title/passthrough)
- [ ] Implement pagination (fetch more on keypress)
- [ ] Create new `mux assets manage` command

### Phase 5: TUI Actions
- [ ] View details action (show full asset info)
- [ ] Copy stream URL (uses signing utility)
- [ ] Copy player URL (uses signing utility)
- [ ] Create playback ID (uses playback-ids utility)
- [ ] Delete playback ID (uses playback-ids utility)
- [ ] Delete asset (with confirmation)

### Phase 6: Polish
- [ ] Loading states and spinners
- [ ] Error handling UI
- [ ] Empty state handling
- [ ] Tests for TUI components

## Technical Notes

- `mux assets list` remains unchanged - dedicated for scripting
- Extract signing logic from `sign.ts` into reusable utility (`src/lib/signing.ts`)
- Use `mux.jwt.signPlaybackId()` from SDK for auto-signing URLs
- Check `playback_id.policy === 'signed'` to determine if signing is needed
- OpenTUI uses Yoga for Flexbox layout
- Need to configure tsconfig for JSX: `"jsxImportSource": "@opentui/react"`

## Dependencies Added
- `@opentui/core` - Core TUI primitives
- `@opentui/react` - React reconciler
- `react` - React 19
