# Prettier Asset List

## Goal
Improve the `mux assets list` output to display assets in a readable card-style format.

## Final Output Format

**Pretty (default):**
```
sRkgb02SMJOjf72PFIkegcrZR3knHPEPG  ready  0:09  07/25 14:16
  Details:
    ├─ Aspect Ratio: 240:427
    ├─ Resolution: 720p
    └─ Quality: plus
  Meta:
    └─ Title: golf-swing
  Playback IDs:
    ├─ 🔓 rFHdcXSf95EHT32qYnf6ZnBz01D7VyKR4
    └─ 🔒 qo5Y6CpYtdZBgQlI6VskadqdNcQQVdPh
```

**Compact (`--compact`):**
```
sRkgb02SMJOjf72PFIkegcrZR3knHPEPG  ready  0:09  07/25 14:16  720p  "golf-swing"  public,signed  -
```

## Features
- Asset ID on its own line (easy to copy)
- Colored status: green=ready, yellow=preparing, red=errored
- Duration in m:ss format
- Short date format (MM/DD HH:MM)
- Details section: aspect ratio, resolution, max stored, quality, passthrough
- Meta section: title, creator_id, external_id
- Static renditions shown only if present
- Playback IDs with tree connectors (├─ / └─)
- Policy icons in pretty mode: 🔓 = public, 🔒 = signed
- `--compact` flag for grep-friendly one-line output (text policies, no emojis)

## Implementation
- [x] Add `@cliffy/ansi` dependency for colors
- [x] Refactor to card-style output
- [x] Add colored status
- [x] Add tree connectors for playback IDs
- [x] Add Details section (resolution, quality, etc.)
- [x] Add Meta section (title, creator_id, external_id)
- [x] Add `--compact` flag for grep-friendly output
- [x] Run checks and tests

## Notes
- `--json` output unchanged (raw JSON for scripting)
- Playback IDs are full length (not truncated) for easy copying

---

# Follow-up: Update live/list to match

## Goal
Update `mux live list` to use the same card-style format as `mux assets list` for consistency.

## Tasks
- [ ] Update `src/commands/live/list.ts` to use card-style output
- [ ] Add `--compact` flag to live/list
- [ ] Extract shared formatters to `src/lib/formatters.ts`:
  - `formatStatus(status)` - colored status
  - `formatDuration(duration)` - m:ss format
  - `formatCreatedAt(timestamp)` - MM/DD HH:MM format
- [ ] Update live/list to use shared formatters
- [ ] Consider updating assets/list to use shared formatters too

## Live stream specific fields to show
- Stream ID
- Status (colored)
- Created date
- Playback IDs with policy icons
- Stream key (maybe truncated or hidden by default?)
- Latency mode
- Reconnect window
