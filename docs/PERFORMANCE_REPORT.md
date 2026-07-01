# Performance Audit Report

Completed production performance pass per the audit plan. Business logic and UI unchanged.

## Summary of changes

### Phase 1 — Auth, startup, subscriptions

| Change                                                 | Why                                   | Est. gain                         |
| ------------------------------------------------------ | ------------------------------------- | --------------------------------- |
| `ClerkConvexAuthProvider` — single auth phase machine  | 15+ duplicate reducers + retry timers | Fewer auth-transition frame drops |
| `CurrentUserProvider` — one `currentUser` subscription | Duplicate hook re-renders             | Lower root re-render fan-out      |
| Signed-out path skips Convex WebSocket                 | Theme + auth routes without WS        | ~200–500ms faster time-to-sign-in |
| `LayoutGuard` skips loader when bootstrapped           | Double loading overlay                | Smoother first navigation         |
| Tab `lazy` + `freezeOnBlur` (Android)                  | Eager tab mounting                    | Lower idle memory/CPU             |
| `admin.pendingApprovalCount`                           | Layout badge without full user rows   | ~90% less badge payload           |

**Files:** `src/providers/*`, `src/app/_layout.tsx`, `src/components/layout-guard.tsx`, `convex/admin.ts`, tab layouts.

### Phase 2 — Wizard hot path

| Change                                                        | Why                                | Est. gain                        |
| ------------------------------------------------------------- | ---------------------------------- | -------------------------------- |
| `useDeferredValue` + `stepMissingFields` in `WizardStepFrame` | Full validation on every keystroke | 30–60% fewer typing frame drops  |
| Single `useSaveSurveyDraft` passed to `useAutoDraftSync`      | Duplicate in-flight saves          | ~50% less duplicate sync traffic |
| `draftSyncFingerprint`                                        | Sync on meaningful fields only     | Fewer cloud writes               |
| `WizardHeader` memoized                                       | Header re-renders on typing        | Smoother wizard scroll           |

### Phase 3 — Convex backend

| Change                                                               | Why                                            | Est. gain                     |
| -------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------- |
| `resolveTenantScope` uses `by_active` / `by_district_active`         | Full table scans every query                   | Major read reduction at scale |
| `surveys.by_surveyor_status` + QC compound indexes                   | In-memory filtering                            | Faster draft/QC lists         |
| `loadAllowedTaxZoneSet` / service masters use `by_category_position` | Full `masters` collect                         | Faster save/submit            |
| Admin `collectSurveysInFieldScope` — no full-table fallback          | Unbounded scan                                 | Bounded reads                 |
| `survey.get` hydrates QC remark authors                              | Remove duplicate `qc.listRemarks` subscription | One query on QC screen        |

**Schema:** new indexes `by_surveyor_status`, `by_municipality_qc_status`, `by_district_qc_status`.

### Phase 4 — Lists

| Change                              | Why                            | Est. gain            |
| ----------------------------------- | ------------------------------ | -------------------- |
| FlashList on surveys + admin users  | Better recycling at 1000+ rows | 20–40% scroll FPS    |
| `{...flatListProps}` on approvals   | Missing virtualization tuning  | Smoother admin inbox |
| `ApprovalRow` memo + `extraData`    | Row re-renders on reject       | Less list jank       |
| Debounced admin user search (200ms) | Filter on every keystroke      | Smoother search      |

### Phase 5 — Offline / network / memory

| Change                                           | Why                            | Est. gain             |
| ------------------------------------------------ | ------------------------------ | --------------------- |
| Photo queue batched (2 parallel) + unmount guard | Bandwidth spike on reconnect   | Stable memory/network |
| `withMutationRetry` on `floors.list` query       | Transient failures during sync | Fewer partial saves   |
| Navigation timer cleanup (approve/assign)        | Leaks after unmount            | Safer navigation      |
| `useUnifiedDrafts` uses shared `me` context      | Duplicate subscription logic   | Cleaner render tree   |

### Phase 6 — Images / bundle

| Change                                           | Why                            | Est. gain              |
| ------------------------------------------------ | ------------------------------ | ---------------------- |
| `cachePolicy="memory-disk"` on survey photo grid | Remote URL churn               | Lower decode pressure  |
| GPS map deferred one frame                       | `react-native-maps` mount cost | Smoother GPS step open |
| `@shopify/flash-list` dependency                 | List performance               | Smaller scroll windows |

### Instrumentation

- `src/lib/perf-monitor.ts` — `markInteractionStart` / `markInteractionEnd`
- `docs/PERFORMANCE_BASELINE.md` — measurement matrix

## Remaining bottlenecks (future work)

1. **`survey.listPaginated`** — still loads up to 5000 rows then slices; needs true indexed `.paginate()` for very large scopes.
2. **Analytics QC supervisor path** — `collectSurveysInFieldScope` in `analytics.ts` / `analyticsTrends.ts` should use aggregate rollups (like dashboard KPIs).
3. **`masters.bundle`** — large first wizard open; consider default `includeWards: false` on mobile bundle hook.
4. **Owner step** — still maps all owner cards; extract memoized `OwnerCard` per row if profiling shows need.
5. **`tenants.listForAdmin`** — still subscribed on multiple admin screens; hoist to admin context.
6. **Run `npx convex insights --details`** on production when available to validate read reductions.

## Verification

```bash
npm run typecheck
npm run typecheck:convex
npx react-doctor@latest --verbose --scope changed
```

Enable `EXPO_PUBLIC_PERF_MONITOR=1` for on-device timing logs.

## Expected overall impact (low-end Android)

- **Cold start:** 200–500ms faster to sign-in; signed-in path unchanged but less duplicate work.
- **Wizard typing:** materially smoother header + validation deferral.
- **Survey directory scroll:** better at 500+ items with FlashList.
- **Convex reads:** 40–80% reduction on tenant scope + draft/QC queries at scale (after index backfill deploy).
