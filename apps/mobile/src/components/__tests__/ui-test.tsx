import { render } from '@testing-library/react-native';
import { Pill } from '../ui';

// F-14 — the harness renders React Native components, not just pure
// functions. `Pill` is the smallest shared primitive; it carries the
// availability copy the supporter sees ("SOLD OUT", "12 LEFT").
//
// React Native Testing Library 14 renders asynchronously under React 19, so
// every `render` is awaited (the SDK 58 guide documents this).
describe('<Pill />', () => {
  it('renders its label', async () => {
    const { getByText } = await render(<Pill label="SOLD OUT" tone="red" />);

    expect(getByText('SOLD OUT')).toBeTruthy();
  });

  it.each(['green', 'gold', 'dark', 'muted', 'red'] as const)(
    'renders the %s tone',
    async (tone) => {
      const { getByText } = await render(<Pill label={tone} tone={tone} />);

      expect(getByText(tone)).toBeTruthy();
    },
  );
});
