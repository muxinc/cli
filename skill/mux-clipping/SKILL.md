---
name: mux-clipping
description: Use when creating clips, trims, highlights, or excerpts from Mux videos or live streams — cutting a segment out of an asset, generating shareable moments from a broadcast, or building a clipping UI. Covers both asset-based clipping (new permanent asset via mux://assets input with start_time/end_time) and instant clips (manifest-level playback URL parameters, no re-encoding).
---

# Clipping with Mux

Mux has two clipping methods with different trade-offs. Choose first, then implement.

| | Instant clips | Asset-based clips |
| --- | --- | --- |
| Availability | Immediate | After encoding ("preparing" → "ready") |
| Accuracy | Segment-level (may run several seconds long) | Frame-accurate |
| Cost | No encoding cost | Re-encodes as a new asset |
| Output | Playback only (no MP4/master files) | Permanent asset; MP4/master downloads possible |
| Good for | Live-moment sharing, previews, ephemeral highlights | Permanent highlights, downloads, publishing workflows |

## Instant clips (playback URL parameters)

Append clip boundaries to the HLS playback URL — no API call, no new asset:

- **VOD assets** (seconds relative to asset start): `https://stream.mux.com/{PLAYBACK_ID}.m3u8?asset_start_time=30&asset_end_time=60`
- **Live streams** (epoch timestamps via Program Date Time): `?program_start_time=...&program_end_time=...`

Pitfalls:

- **Not frame-accurate.** Manifests are trimmed at segment boundaries, so clips can run several seconds longer than requested. If exact boundaries matter, use asset-based clipping.
- **Use signed playback.** With a public playback ID, viewers can edit the URL parameters and watch parts of the video you meant to hide. With signed playback, put the clip boundaries in the JWT claims — not the query string — so they cannot be tampered with (mint tokens with `mux sign --agent` or a signing key).
- Live timestamps have latency: a moment isn't clippable until its segments exist.

## Asset-based clips (new asset from an existing one)

Create a new asset whose input is the source asset, not a file URL:

```json
POST /video/v1/assets
{
  "inputs": [{
    "url": "mux://assets/{SOURCE_ASSET_ID}",
    "start_time": 30,
    "end_time": 60
  }],
  "playback_policies": ["public"]
}
```

`start_time`/`end_time` are seconds from the beginning of the source (defaults: 0 and full duration). The response includes `source_asset_id` linking the clip back to its source.

Pitfalls:

- **Clipping parameters only work with `mux://assets/...` inputs.** You cannot pass `start_time`/`end_time` when ingesting a new file from a regular URL — ingest first, then clip.
- **Clipping an active live stream:** always set `end_time` explicitly; the recording asset is still growing.
- **Minimum clip length is 500 ms.**
- The clip is a new asset in `preparing` status — wait for the `video.asset.ready` webhook (don't poll) before playback.
- Captions/text tracks are automatically copied and trimmed to the clip boundaries.
- For AI-assisted clipping (find the interesting moments first), see the `mux-cli` skill (`mux robots find-key-moments`).

## Docs

Fetch before writing code — parameters and defaults are current there:

| Topic | URL |
| --- | --- |
| Intro to clips (choosing a method) | https://www.mux.com/docs/guides/intro-to-clips.md |
| Instant clips | https://www.mux.com/docs/guides/create-instant-clips.md |
| Asset-based clips | https://www.mux.com/docs/guides/create-clips-from-your-videos.md |
| Signed URLs (for protecting clip boundaries) | https://www.mux.com/docs/guides/secure-video-playback.md |

If a URL 404s, search https://www.mux.com/llms.txt for the current location.
