# Mux docs index for agents

All Mux documentation is published as LLM-ready markdown. Append `.md` to any docs page URL to get the markdown version.

## Master indexes

| Index | What it covers |
| --- | --- |
| https://www.mux.com/llms.txt | Index of every per-page markdown doc (200+ pages). Start here when a routed URL 404s or a topic is not in the routing table. |
| https://www.mux.com/llms-full.txt | Entire documentation in one file. Large — prefer per-page fetches. |

## Collection indexes

Fetch the collection index for a topic area, then fetch the specific page it points to.

| Collection | URL |
| --- | --- |
| Core concepts | https://www.mux.com/docs/core.txt |
| Video: upload, encode, manage assets | https://www.mux.com/docs/guides/video.txt |
| Uploader: handle user uploads | https://www.mux.com/docs/guides/uploader.txt |
| Player: embed video playback | https://www.mux.com/docs/guides/player.txt |
| Data: playback quality and analytics | https://www.mux.com/docs/guides/data.txt |
| Data integrations: third-party player monitoring | https://www.mux.com/docs/guides/data-integrations.txt |
| Framework integrations and SDKs | https://www.mux.com/docs/integrations.txt |
| Example implementations | https://www.mux.com/docs/examples.txt |
| Pricing and billing | https://www.mux.com/docs/pricing.txt |

## Additional high-traffic pages

| Task | URL |
| --- | --- |
| Upload from iOS/iPadOS | https://www.mux.com/docs/guides/upload-video-directly-from-ios-or-ipados.md |
| Upload from Android | https://www.mux.com/docs/guides/upload-video-directly-from-android.md |
| Manage live stream keys | https://www.mux.com/docs/guides/manage-stream-keys.md |
| Reduce live stream latency | https://www.mux.com/docs/guides/reduce-live-stream-latency.md |
| Recordings of live streams | https://www.mux.com/docs/guides/stream-recordings-of-live-streams.md |
| Timeline hover previews | https://www.mux.com/docs/guides/create-timeline-hover-previews.md |

## Self-healing

If any URL here returns a 404, the docs have likely been reorganized: fetch https://www.mux.com/llms.txt, search it for the topic, and use the current URL. Consider opening a PR against `muxinc/skills` to fix the stale route.
