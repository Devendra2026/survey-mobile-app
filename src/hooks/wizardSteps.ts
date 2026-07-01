/**
 * Wizard step navigation and progress helpers.
 */
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { draftCompletionPct, stepCompletion } from '@/hooks/useWizardDraft';
import { REVIEW_ROUTE, WIZARD_STEPS, type StepConfig } from '@/hooks/wizardStepConfig';
import { stepHasProgress, type StepStatus } from '@/utils/wizardValidation';

export { REVIEW_ROUTE, WIZARD_STEPS, type StepConfig } from '@/hooks/wizardStepConfig';

export function stepIndex(targetKey: StepConfig['key']): number {
  return WIZARD_STEPS.findIndex((s) => s.key === targetKey);
}

/** Highest step index the user has opened in this draft session. */
export function resolvedFurthestStepIndex(draft: WizardDraft): number {
  const stored = draft.furthestStepIndex ?? 0;
  const fromActive =
    draft.lastActiveStepKey && draft.lastActiveStepKey !== 'review'
      ? stepIndex(draft.lastActiveStepKey)
      : draft.lastActiveStepKey === 'review'
        ? WIZARD_STEPS.length
        : 0;
  return Math.max(stored, fromActive >= 0 ? fromActive : 0);
}

/** True when the user may open a step from the header chips. */
export function canPickStep(_draft: WizardDraft, targetKey: StepConfig['key']): boolean {
  return stepIndex(targetKey) >= 0;
}

export function wizardStepProgress(draft: WizardDraft, activeKey: string) {
  const total = WIZARD_STEPS.length;
  const stepIdx = WIZARD_STEPS.findIndex((s) => s.key === activeKey);
  const current = stepIdx >= 0 ? stepIdx + 1 : total;
  const label = stepIdx >= 0 ? WIZARD_STEPS[stepIdx]!.label : 'Review';
  return {
    current,
    total,
    percent: draftCompletionPct(draft),
    label,
  };
}

/** Patch to record a visited wizard step (call before navigating). */
export function visitedStepPatch(
  draft: WizardDraft,
  key: StepConfig['key'] | 'review',
): Pick<WizardDraft, 'lastActiveStepKey' | 'furthestStepIndex'> {
  const idx = key === 'review' ? WIZARD_STEPS.length : stepIndex(key);
  return {
    lastActiveStepKey: key,
    furthestStepIndex: Math.max(draft.furthestStepIndex ?? 0, idx >= 0 ? idx : 0),
  };
}

export function incompleteStepLabels(draft: WizardDraft): string[] {
  const c = stepCompletion(draft);
  const labels: string[] = [];
  for (const s of WIZARD_STEPS) {
    if (!c[s.key]) labels.push(s.label);
  }
  return labels;
}

export function allStepsComplete(draft: WizardDraft): boolean {
  return Object.values(stepCompletion(draft)).every(Boolean);
}

/** Resolve the wizard route to open when resuming a local draft. */
export function routeForDraftResume(draft: WizardDraft): string {
  const key = draft.lastActiveStepKey ?? 'start';
  if (key !== 'start' && !stepCompletion(draft).start) {
    return FIRST_WIZARD_ROUTE;
  }
  if (key === 'review') return REVIEW_ROUTE;
  return WIZARD_STEPS.find((s) => s.key === key)?.route ?? FIRST_WIZARD_ROUTE;
}

/** Last wizard step before review (photos). */
export const STEP_BEFORE_REVIEW_ROUTE = WIZARD_STEPS[WIZARD_STEPS.length - 1]!.route;

/** Map a wizard route to its step key (or review). */
export function stepKeyFromRoute(route: string): StepConfig['key'] | 'review' | null {
  if (route === REVIEW_ROUTE) return 'review';
  return WIZARD_STEPS.find((s) => s.route === route)?.key ?? null;
}

export function indicatorSteps(draft: WizardDraft, activeKey: string) {
  const c = stepCompletion(draft);
  return WIZARD_STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    short: s.short,
    completed: c[s.key],
    progress: (c[s.key] ? 'complete' : stepHasProgress(draft, s.key) ? 'in_progress' : 'incomplete') as StepStatus,
    /** Field surveyors may jump to any step and fill sections in any order. */
    reachable: true,
  }));
}

export function nextStep(activeKey: string): string {
  const i = WIZARD_STEPS.findIndex((s) => s.key === activeKey);
  if (i < 0 || i >= WIZARD_STEPS.length - 1) return REVIEW_ROUTE;
  return WIZARD_STEPS[i + 1]!.route;
}

export function prevStep(activeKey: string): string | null {
  const i = WIZARD_STEPS.findIndex((s) => s.key === activeKey);
  if (i <= 0) return null;
  return WIZARD_STEPS[i - 1]!.route;
}

/** First wizard screen after entry (survey start). */
export const FIRST_WIZARD_ROUTE = WIZARD_STEPS[0]!.route;
