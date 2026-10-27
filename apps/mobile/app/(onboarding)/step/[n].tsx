// O1–O11: one route renders every question step; the body comes from STEP_BODIES.
import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { PROGRESS_TOTAL, STEPS, stepProblem } from '@/src/domain/onboarding';
import { STEP_BODIES, STEP_TITLES } from '@/src/onboarding/steps';
import { useApp } from '@/src/state/AppState';
import { track } from '@/src/analytics/analytics';
import { StepScaffold } from '@/src/ui/StepScaffold';

export default function Step() {
  const { n } = useLocalSearchParams<{ n: string }>();
  const index = Math.min(Math.max(Number(n) - 1 || 0, 0), STEPS.length - 1);
  const id = STEPS[index]!;
  const { answers, updateAnswers } = useApp();
  const opened = useRef(Date.now());
  useEffect(() => {
    opened.current = Date.now();
  }, [id]);
  const Body = STEP_BODIES[id];
  const copy = STEP_TITLES[id];
  return (
    <StepScaffold
      step={index + 1}
      total={PROGRESS_TOTAL}
      title={copy.title}
      {...(copy.subtitle ? { subtitle: copy.subtitle } : {})}
      problem={stepProblem(id, answers)}
      onBack={() => router.back()}
      onNext={() => {
        track('onboarding_step', { step: id, duration_s: Math.round((Date.now() - opened.current) / 1000) });
        router.push(index + 1 < STEPS.length ? `/step/${index + 2}` : '/permissions');
      }}
    >
      <Body a={answers} set={updateAnswers} />
    </StepScaffold>
  );
}
