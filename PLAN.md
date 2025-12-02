# Update live/list to match assets/list format

## Goal
Update `mux live list` to use the same card-style format as `mux assets list` for consistency.

## Final Output Format

**Pretty (default):**
```
Found 2 live stream(s):

waWxn5KIZCYmILAOWgXW9dFBPnOXq00JM  idle  08/18 16:43
  Details:
    ├─ Stream Key: c3eb...1724
    ├─ Latency Mode: standard
    ├─ Reconnect Window: 60s
    └─ Max Duration: 12h
  Recent Assets:
    └─ 00QNOSkxzBdlASP3iIvTfvqxDN3u74hUX
  Playback IDs:
    └─ 🔒 EIyqm8p4VwGj5sO9rNBtykFbbKFFSNWA
```

**Compact (`--compact`):**
```
waWxn5KIZCYmILAOWgXW9dFBPnOXq00JM  idle  08/18 16:43  standard  60s  signed  1 assets
```

## Implementation

### Phase 1: Extract shared formatters
- [x] Create shared functions in `src/lib/formatters.ts`
- [x] Update assets/list.ts to use shared formatters

### Phase 2: Update live/list.ts
- [x] Import shared formatters
- [x] Add `--compact` flag
- [x] Implement `printStreamCard()` for pretty output
- [x] Implement `printStreamCompact()` for compact output
- [x] Add live-specific status colors (idle=dim, active=green, disabled=red)

### Phase 3: Tests & Polish
- [x] Add test for `--compact` flag
- [x] Run checks and test manually

## Shared Formatters Added
- `formatCreatedAt(timestamp)` - MM/DD HH:MM format
- `formatDuration(duration)` - m:ss format
- `formatAssetStatus(status)` - colored asset status
- `formatLiveStreamStatus(status)` - colored live stream status
- `formatSeconds(seconds)` - human readable (e.g., "12h", "60s")
- `truncateMiddle(str)` - truncate showing first/last chars (e.g., "c3eb...1724")
