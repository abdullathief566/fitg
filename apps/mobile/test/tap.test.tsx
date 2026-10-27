// Design acceptance check #3: every tappable is at least 48 × 48 pt, whatever size a caller asks for.
import { StyleSheet, Text } from 'react-native';
import { Tap } from '../src/ui/Pressable';
import { PrimaryButton } from '../src/ui/PrimaryButton';
import { renderThemed } from './render';

const flat = (style: unknown) => StyleSheet.flatten(style as never) as { minHeight?: number; minWidth?: number };

describe('touch targets', () => {
  it('Tap never goes below 48 pt', async () => {
    const s = await renderThemed(
      <Tap testID="tiny" minSize={20} onPress={() => undefined}>
        <Text>x</Text>
      </Tap>,
    );
    const style = flat(s.getByTestId('tiny').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });

  it('PrimaryButton sizes: normal 56, kitchen 64, gym 72', async () => {
    for (const [size, min] of [
      ['normal', 56],
      ['kitchen', 64],
      ['gym', 72],
    ] as const) {
      const s = await renderThemed(<PrimaryButton testID="b" label="Go" size={size} onPress={() => undefined} />);
      expect(flat(s.getByTestId('b').props.style).minHeight).toBeGreaterThanOrEqual(min);
      await s.unmount();
    }
  });
});
