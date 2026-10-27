// The bodies of onboarding steps O1–O11 (screens.md, PRD §5). One question per screen, chips first. Each body reads
// and writes the draft answers through useApp(); the route (app/(onboarding)/step/[n].tsx) owns navigation.
import { useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import type { Weekday } from '@fitg/engine';
import { KG_PER_LB, LIMITS, type OnboardingAnswers, type StepId } from '@/src/domain/onboarding';
import { STAPLES, STEP_COPY } from '@/src/copy/ui';
import { useApp } from '@/src/state/AppState';
import { AppText } from '@/src/ui/AppText';
import { Card } from '@/src/ui/Card';
import { Chip } from '@/src/ui/Chip';
import { NumberSheet } from '@/src/ui/NumberSheet';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { Tap } from '@/src/ui/Pressable';
import { ChipRow, Question } from '@/src/ui/StepScaffold';
import { TimeStepper } from '@/src/ui/Stepper';
import { useTheme } from '@/src/ui/theme';
import { track } from '@/src/analytics/analytics';

type Set_ = (patch: Partial<OnboardingAnswers>) => void;

function Choices<T extends string | number>({
  options,
  value,
  onPick,
  wide,
}: {
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  value: T | undefined;
  onPick: (v: T) => void;
  wide?: boolean;
}) {
  const t = useTheme();
  const items = options.map((o) => (
    <Chip
      key={String(o.value)}
      label={o.label}
      {...(o.hint ? { hint: o.hint } : {})}
      selected={value === o.value}
      onPress={() => onPick(o.value)}
      wide={!!wide}
      testID={`choice-${String(o.value)}`}
    />
  ));
  return wide ? <View style={{ gap: t.space[2] }}>{items}</View> : <ChipRow>{items}</ChipRow>;
}

function Multi<T extends string | number>({
  options,
  values,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  values: readonly T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <ChipRow>
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <Chip
            key={String(o.value)}
            role="checkbox"
            label={o.label}
            selected={on}
            onPress={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
            testID={`multi-${String(o.value)}`}
          />
        );
      })}
    </ChipRow>
  );
}

function Goal({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  return <Choices wide options={STEP_COPY.goal.options} value={a.goal} onPick={(goal) => set({ goal })} />;
}

function FieldRow({
  label,
  value,
  placeholder,
  onPress,
  testID,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Tap
      testID={testID}
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
      onPress={onPress}
      scale={false}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: t.tap.comfortable,
        borderBottomWidth: 1,
        borderBottomColor: t.c.hairline,
      }}
    >
      <AppText variant="body" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="numberM" tone={value ? 'primary' : 'accent'}>
        {value ?? placeholder}
      </AppText>
    </Tap>
  );
}

type SheetKind = 'age' | 'height' | 'weight' | 'goalWeight';

function About({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  const t = useTheme();
  const c = STEP_COPY.about;
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const lb = a.weightUnit === 'lb';
  const toShown = (kg?: number) =>
    kg === undefined ? undefined : lb ? Math.round(kg / KG_PER_LB) : Math.round(kg * 10) / 10;
  const shownWeight = (kg?: number) => (kg === undefined ? undefined : `${toShown(kg)} ${a.weightUnit}`);
  const weightSheet = (key: 'weightKg' | 'goalWeightKg', title: string) => ({
    title,
    unit: a.weightUnit,
    initial: toShown(a[key]),
    min: lb ? Math.ceil(LIMITS.weightKg.min / KG_PER_LB) : LIMITS.weightKg.min,
    max: lb ? Math.floor(LIMITS.weightKg.max / KG_PER_LB) : LIMITS.weightKg.max,
    rangeHint: lb
      ? `Between ${Math.ceil(LIMITS.weightKg.min / KG_PER_LB)} and ${Math.floor(LIMITS.weightKg.max / KG_PER_LB)} lb`
      : c.weightRange,
    onDone: (v: number) => {
      set({ [key]: lb ? Math.round(v * KG_PER_LB * 10) / 10 : v } as Partial<OnboardingAnswers>);
      setSheet(null);
    },
    unitSwitch: {
      options: ['kg', 'lb'],
      value: a.weightUnit,
      onChange: (u: string) => set({ weightUnit: u as 'kg' | 'lb' }),
    },
  });
  const sheets = {
    age: {
      title: c.age,
      unit: 'years',
      initial: a.age,
      min: LIMITS.age.min,
      max: LIMITS.age.max,
      decimal: false,
      rangeHint: c.ageRange,
      onDone: (v: number) => (set({ age: v }), setSheet(null)),
    },
    height: {
      title: c.height,
      unit: 'cm',
      initial: a.heightCm,
      min: LIMITS.heightCm.min,
      max: LIMITS.heightCm.max,
      decimal: false,
      rangeHint: c.heightRange,
      onDone: (v: number) => (set({ heightCm: v }), setSheet(null)),
    },
    weight: weightSheet('weightKg', c.weight),
    goalWeight: weightSheet('goalWeightKg', c.goalWeight),
  };
  const open = sheet ? sheets[sheet] : null;
  return (
    <>
      <Question label={c.name}>
        <TextInput
          // Uncontrolled on purpose: a controlled input drops characters on Android when the JS thread lags.
          defaultValue={a.firstName ?? ''}
          onChangeText={(firstName) => set({ firstName })}
          placeholder={c.namePlaceholder}
          placeholderTextColor={t.c.text.tertiary}
          autoCapitalize="words"
          autoComplete="given-name"
          maxLength={30}
          accessibilityLabel={c.name}
          style={[
            t.type.bodyL,
            {
              color: t.c.text.primary,
              minHeight: t.tap.comfortable,
              paddingHorizontal: t.space[4],
              borderRadius: t.radius.button,
              backgroundColor: t.c.bg.surface,
              borderWidth: 1,
              borderColor: t.c.hairline,
            },
          ]}
        />
      </Question>
      <Question label={c.sex} hint={c.sexHint}>
        <Choices options={c.sexOptions} value={a.sex} onPick={(sex) => set({ sex })} />
      </Question>
      <View>
        <FieldRow
          testID="field-age"
          label={c.age}
          value={a.age !== undefined ? String(a.age) : undefined}
          placeholder={c.add}
          onPress={() => setSheet('age')}
        />
        <FieldRow
          testID="field-height"
          label={c.height}
          value={a.heightCm !== undefined ? `${a.heightCm} cm` : undefined}
          placeholder={c.add}
          onPress={() => setSheet('height')}
        />
        <FieldRow
          testID="field-weight"
          label={c.weight}
          value={shownWeight(a.weightKg)}
          placeholder={c.add}
          onPress={() => setSheet('weight')}
        />
        <FieldRow
          testID="field-goal-weight"
          label={`${c.goalWeight} · ${c.optional}`}
          value={shownWeight(a.goalWeightKg)}
          placeholder={c.add}
          onPress={() => setSheet('goalWeight')}
        />
      </View>
      {open ? <NumberSheet visible {...open} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

function Activity({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  return (
    <Choices wide options={STEP_COPY.activity.options} value={a.activity} onPick={(activity) => set({ activity })} />
  );
}

const DAYS: ReadonlyArray<{ value: Weekday; label: string }> = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

function Schedule({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  const c = STEP_COPY.schedule;
  return (
    <>
      <Question label={c.days}>
        <Multi options={DAYS} values={a.gymDays} onChange={(gymDays) => set({ gymDays })} />
      </Question>
      <Question label={c.time}>
        <TimeStepper label={c.timeRow} value={a.gymStart} step={15} onChange={(gymStart) => set({ gymStart })} />
      </Question>
      <Question label={c.length}>
        <Choices options={c.lengths} value={a.durationMin} onPick={(durationMin) => set({ durationMin })} />
      </Question>
    </>
  );
}

function Experience({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  const c = STEP_COPY.experience;
  return (
    <>
      <Choices wide options={c.options} value={a.experience} onPick={(experience) => set({ experience })} />
      <Question label={c.injuries} hint={c.injuriesHint}>
        <ChipRow>
          {c.injuryOptions.map((o) => {
            const on = a.injuries.includes(o.value);
            return (
              <Chip
                key={o.value}
                role="checkbox"
                label={o.label}
                selected={on}
                onPress={() =>
                  set({ injuries: on ? a.injuries.filter((x) => x !== o.value) : [...a.injuries, o.value] })
                }
              />
            );
          })}
          <Chip
            role="checkbox"
            label={c.none}
            selected={a.injuries.length === 0}
            onPress={() => set({ injuries: [] })}
          />
        </ChipRow>
      </Question>
    </>
  );
}

const DUMBBELLS = [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25] as const;

function Equipment({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  const t = useTheme();
  const c = STEP_COPY.equipment;
  const [pinState, setPinState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [skipped, setSkipped] = useState(false);
  const pin = async () => {
    setPinState('busy');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      track('location_permission', { status: perm.status });
      if (perm.status !== 'granted') {
        setPinState('failed');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      set({ gymPin: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      setPinState('idle');
    } catch {
      setPinState('failed');
    }
  };
  return (
    <>
      <Choices wide options={c.options} value={a.equipment} onPick={(equipment) => set({ equipment })} />
      {a.equipment === 'home_db' ? (
        <Question label={c.dumbbells} hint={c.dumbbellsHint}>
          <Multi
            options={DUMBBELLS.map((kg) => ({ value: kg, label: `${kg} kg` }))}
            values={a.homeDumbbellsKg}
            onChange={(homeDumbbellsKg) => set({ homeDumbbellsKg })}
          />
        </Question>
      ) : (
        <Card hairline style={{ gap: t.space[3] }}>
          <AppText variant="displayS">{c.pinTitle}</AppText>
          <AppText variant="body" tone="secondary">
            {a.gymPin ? c.pinned : skipped ? c.pinSkipped : pinState === 'failed' ? c.pinFailed : c.pinBody}
          </AppText>
          {a.gymPin || skipped ? null : (
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <PrimaryButton
                label={c.pinSkip}
                variant="secondary"
                onPress={() => setSkipped(true)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                label={c.pinAllow}
                variant="secondary"
                loading={pinState === 'busy'}
                onPress={pin}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </Card>
      )}
    </>
  );
}

function Food({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  const c = STEP_COPY.food;
  const { lib } = useApp();
  const dislikeOptions = STAPLES.filter((s) => lib.foods.has(s.key)).map((s) => ({ value: s.key, label: s.label }));
  return (
    <>
      <Question label={c.diet}>
        <Choices options={c.dietOptions} value={a.diet} onPick={(diet) => set({ diet })} />
      </Question>
      <Question label={c.cuisine}>
        <Choices options={c.cuisineOptions} value={a.cuisine} onPick={(cuisine) => set({ cuisine })} />
      </Question>
      <Question label={c.allergies}>
        <Multi options={c.allergyOptions} values={a.allergies} onChange={(allergies) => set({ allergies })} />
      </Question>
      <Question label={c.dislikes} hint={c.dislikesHint}>
        <Multi options={dislikeOptions} values={a.dislikes} onChange={(dislikes) => set({ dislikes })} />
      </Question>
    </>
  );
}

function Eating({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  return (
    <Choices
      wide
      options={STEP_COPY.eating.options}
      value={a.eatingMode}
      onPick={(eatingMode) => set({ eatingMode })}
    />
  );
}

function Day({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  const t = useTheme();
  const c = STEP_COPY.day;
  return (
    <>
      <View>
        <TimeStepper label={c.wake} value={a.wake} onChange={(wake) => set({ wake })} />
        <TimeStepper label={c.breakfast} value={a.breakfast} onChange={(breakfast) => set({ breakfast })} />
        <TimeStepper label={c.lunch} value={a.lunch} onChange={(lunch) => set({ lunch })} />
        {a.snack ? <TimeStepper label={c.snack} value={a.snack} onChange={(snack) => set({ snack })} /> : null}
        <TimeStepper label={c.dinner} value={a.dinner} onChange={(dinner) => set({ dinner })} />
        <TimeStepper label={c.sleep} value={a.sleep} step={30} onChange={(sleep) => set({ sleep })} />
        <View style={{ alignItems: 'flex-start', marginTop: t.space[2] }}>
          <PrimaryButton
            label={a.snack ? c.noSnack : c.addSnack}
            variant="quiet"
            onPress={() => set({ snack: a.snack ? null : '17:00' })}
          />
        </View>
      </View>
      <Question label={c.cookTime}>
        <Choices options={c.cookOptions} value={a.cookTimePref} onPick={(cookTimePref) => set({ cookTimePref })} />
      </Question>
      <Question label={c.budget}>
        <Choices options={c.budgetOptions} value={a.budgetTier} onPick={(budgetTier) => set({ budgetTier })} />
      </Question>
    </>
  );
}

function Staples({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  const t = useTheme();
  const { lib } = useApp();
  const items = STAPLES.filter((s) => lib.foods.has(s.key));
  const rows: Array<typeof items> = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: t.space[2] }}>
      {rows.map((row) => (
        <View key={row[0]!.key} style={{ flexDirection: 'row', gap: t.space[2] }}>
          {row.map((s) => {
            const on = a.staples.includes(s.key);
            return (
              <View key={s.key} style={{ flex: 1 }}>
                <Chip
                  wide
                  role="checkbox"
                  label={s.label}
                  selected={on}
                  onPress={() => set({ staples: on ? a.staples.filter((k) => k !== s.key) : [...a.staples, s.key] })}
                />
              </View>
            );
          })}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

function Health({ a, set }: { a: OnboardingAnswers; set: Set_ }) {
  const t = useTheme();
  const c = STEP_COPY.health;
  const [answered, setAnswered] = useState<Record<string, boolean>>(() =>
    a.healthChecked ? Object.fromEntries(c.questions.map((q) => [q.key, true])) : {},
  );
  const [why, setWhy] = useState(false);
  const pick = (key: keyof OnboardingAnswers['safety'], yes: boolean) => {
    const next = { ...answered, [key]: true };
    setAnswered(next);
    set({ safety: { ...a.safety, [key]: yes }, healthChecked: c.questions.every((q) => next[q.key]) });
  };
  return (
    <>
      {c.questions.map((q) => (
        <Question key={q.key} label={q.label}>
          <ChipRow>
            <Chip
              label={c.no}
              selected={!!answered[q.key] && !a.safety[q.key]}
              onPress={() => pick(q.key, false)}
              testID={`health-${q.key}-no`}
            />
            <Chip
              label={c.yes}
              selected={!!answered[q.key] && a.safety[q.key]}
              onPress={() => pick(q.key, true)}
              testID={`health-${q.key}-yes`}
            />
          </ChipRow>
        </Question>
      ))}
      <View style={{ gap: t.space[2] }}>
        <PrimaryButton
          label={c.whyTitle}
          variant="quiet"
          onPress={() => setWhy((w) => !w)}
          style={{ alignSelf: 'flex-start' }}
        />
        {why ? (
          <AppText variant="body" tone="secondary">
            {c.why}
          </AppText>
        ) : null}
      </View>
    </>
  );
}

export const STEP_BODIES: Record<StepId, (p: { a: OnboardingAnswers; set: Set_ }) => ReactNode> = {
  goal: Goal,
  about: About,
  activity: Activity,
  schedule: Schedule,
  experience: Experience,
  equipment: Equipment,
  food: Food,
  eating: Eating,
  day: Day,
  staples: Staples,
  health: Health,
};

export const STEP_TITLES: Record<StepId, { title: string; subtitle?: string }> = {
  goal: STEP_COPY.goal,
  about: STEP_COPY.about,
  activity: STEP_COPY.activity,
  schedule: STEP_COPY.schedule,
  experience: STEP_COPY.experience,
  equipment: STEP_COPY.equipment,
  food: STEP_COPY.food,
  eating: STEP_COPY.eating,
  day: STEP_COPY.day,
  staples: STEP_COPY.staples,
  health: STEP_COPY.health,
};
