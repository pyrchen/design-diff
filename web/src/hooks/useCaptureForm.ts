import { useState } from 'react';
import { createCaptureFormState, type CaptureFormState } from '../lib/captureForm';

/** Thin React wrapper around the framework-agnostic CaptureFormState (ported verbatim from the Vue composable). */
export function useCaptureForm(): [CaptureFormState, React.Dispatch<React.SetStateAction<CaptureFormState>>] {
  const [state, setState] = useState<CaptureFormState>(() => createCaptureFormState());
  return [state, setState];
}
