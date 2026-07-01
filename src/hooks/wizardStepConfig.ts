/**
 * Static wizard step list — leaf module (no wizardSteps / wizardValidation imports).
 * Order drives StepIndicator layout, navigation routing, and review checklist.
 *
 * Add a step → add a row here and a screen file.
 */
export type WizardStepKey =
  | 'start'
  | 'property'
  | 'owner'
  | 'address'
  | 'taxation'
  | 'floors'
  | 'services'
  | 'gps'
  | 'photos';

export interface StepConfig {
  key: WizardStepKey;
  label: string;
  short: string;
  route: string;
}

export const WIZARD_STEPS: StepConfig[] = [
  { key: 'start', label: 'Start', short: '0', route: '/(app)/wizard/start' },
  { key: 'property', label: 'Property', short: 'P', route: '/(app)/wizard/property' },
  { key: 'owner', label: 'Owner', short: 'O', route: '/(app)/wizard/owner' },
  { key: 'address', label: 'Address', short: 'A', route: '/(app)/wizard/address' },
  { key: 'taxation', label: 'Taxation', short: 'T', route: '/(app)/wizard/taxation' },
  { key: 'floors', label: 'Area', short: '5', route: '/(app)/wizard/floors' },
  { key: 'services', label: 'Services', short: 'S', route: '/(app)/wizard/services' },
  { key: 'gps', label: 'GPS', short: 'G', route: '/(app)/wizard/gps' },
  { key: 'photos', label: 'Photos', short: 'C', route: '/(app)/wizard/photos' },
];

export const REVIEW_ROUTE = '/(app)/wizard/review';
