# Performance Baseline

Enable monitoring: `EXPO_PUBLIC_PERF_MONITOR=1`

## Test matrix (2–4GB Android)

| Scenario            | Metric                       | How to measure                        |
| ------------------- | ---------------------------- | ------------------------------------- |
| Cold start          | Time to sign-in or dashboard | `[perf] screen:ready` logs            |
| Dashboard scroll    | FPS / jank                   | Android GPU rendering profile         |
| Surveys list (500+) | Scroll FPS                   | FlashList vs FlatList comparison      |
| Wizard owner typing | Input latency                | `[perf] interaction:end` on keystroke |
| 4-photo capture     | Memory peak                  | Android Studio profiler               |
| Offline → reconnect | Sync completion time         | Network log + draft `lastSyncedAt`    |

## Tooling

- `npm run doctor` — React health score
- `npm run check` — lint + typecheck + doctor
- `npx convex insights --details` — server read/write signals (when deployment available)
- `npx react-doctor@latest --verbose --scope changed` — per-PR regression

## Post-optimization targets

- Cold start: −200–500ms to interactive
- Wizard typing: −30–60% frame drops during input
- Scoped Convex queries: −40–80% documents read at scale
- List scroll: −20–40% jank on large directories
