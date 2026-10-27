// Product law #1 at the UI level (design acceptance check #4): Today renders exactly ONE NextUpCard — at every hour
// of a gym day and a rest day — and habit-only mode shows no food or body numbers.
import { within } from '@testing-library/react-native';
import { addDays } from '@fitg/engine';
import { getLib } from '../src/domain/bundle';
import { todayView, type LocalContext } from '../src/domain/today';
import { TodayContent } from '../src/screens/TodayScreen';
import { MON, T1_ANSWERS, TZ, at, snapshotFor } from '../test-fixtures/t1';
import { renderThemed } from './render';

const lib = getLib();
const local: LocalContext = {
  permissions: { notifications: 'granted', location: 'denied' },
  seenComebackIds: [],
  doneTaskKeys: [],
};
const noop = () => undefined;

async function renderToday(answers = T1_ANSWERS, date = MON, time = '12:00') {
  const snapshot = snapshotFor(answers, lib, at(MON, '00:05'));
  const view = todayView(snapshot, lib, at(date, time), local);
  return {
    view,
    screen: await renderThemed(
      <TodayContent
        view={view}
        tz={TZ}
        initial="A"
        sampleData={false}
        onAction={noop}
        onOpenSettings={noop}
        onOpenWorkout={noop}
      />,
    ),
  };
}

describe('Today', () => {
  it.each([MON, addDays(MON, 1)])('shows exactly one NextUpCard at every hour of %s', async (date) => {
    for (let h = 0; h < 24; h++) {
      const { screen } = await renderToday(T1_ANSWERS, date, `${String(h).padStart(2, '0')}:30`);
      expect(screen.getAllByTestId('next-up-card')).toHaveLength(1);
      await screen.unmount();
    }
  });

  it('at 18:00 on a gym day the card is the workout with Start / Later / Skip', async () => {
    const { screen } = await renderToday(T1_ANSWERS, MON, '18:00');
    expect(within(screen.getByTestId('next-up-card')).getByText('Full body A')).toBeTruthy();
    expect(screen.getByTestId('next-up-action-start')).toBeTruthy();
    expect(screen.getByTestId('next-up-action-later_30')).toBeTruthy();
    expect(screen.getByTestId('next-up-action-skip')).toBeTruthy();
    expect(screen.getByTestId('protein-bar')).toBeTruthy();
  });

  it('hides actions this build cannot do yet (no dead buttons)', async () => {
    const { view, screen } = await renderToday(T1_ANSWERS, MON, '08:10');
    expect(view.next.kind).toBe('meal');
    expect(screen.getByTestId('next-up-action-ate')).toBeTruthy();
    expect(screen.queryByTestId('next-up-action-swap')).toBeNull();
    expect(screen.queryByTestId('next-up-action-something_else')).toBeNull();
  });

  it('habit-only mode: protein dots, and no kcal or grams anywhere on screen', async () => {
    const answers = { ...T1_ANSWERS, safety: { ...T1_ANSWERS.safety, edHistory: true } };
    for (const time of ['08:10', '13:00', '19:45', '21:30']) {
      const { screen } = await renderToday(answers, MON, time);
      expect(screen.getByTestId('protein-dots')).toBeTruthy();
      expect(screen.queryByTestId('protein-bar')).toBeNull();
      const text = screen.toJSON();
      const all = JSON.stringify(text);
      expect(all).not.toMatch(/\d\s?kcal/);
      expect(all).not.toMatch(/\d+(\.\d+)?\s?(g|ml)\b/); // no grams of anything: household words only
      await screen.unmount();
    }
  });
});
