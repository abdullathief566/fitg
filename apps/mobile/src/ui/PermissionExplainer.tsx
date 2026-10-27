// PermissionExplainer: what / when / why in three lines, then one decision (copy.md §6). Skip has equal weight
// for optional permissions; product law: nothing requires a permission.
import { View } from 'react-native';
import { Bell, CircleCheck, MapPin } from './icons';
import { AppText } from './AppText';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { useTheme } from './theme';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionExplainerProps {
  kind: 'notifications' | 'location';
  required: boolean;
  title: string;
  body: string;
  allowLabel: string;
  skipLabel: string;
  deniedLine: string;
  status: PermissionStatus;
  onAllow: () => void;
  onSkip: () => void;
}

export function PermissionExplainer({
  kind,
  required,
  title,
  body,
  allowLabel,
  skipLabel,
  deniedLine,
  status,
  onAllow,
  onSkip,
}: PermissionExplainerProps) {
  const t = useTheme();
  const Icon = kind === 'notifications' ? Bell : MapPin;
  return (
    <Card hairline style={{ gap: t.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: t.c.accent.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={t.icon.sm} color={t.c.accent.deep} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="displayS">{title}</AppText>
          <AppText variant="micro" tone="tertiary">
            {required ? 'Needed' : 'Optional'}
          </AppText>
        </View>
      </View>
      <AppText variant="body" tone="secondary">
        {body}
      </AppText>
      {status === 'granted' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minHeight: t.tap.min }}>
          <CircleCheck size={t.icon.sm} color={t.c.state.done} />
          <AppText variant="button">All set</AppText>
        </View>
      ) : status === 'denied' ? (
        <AppText variant="body" tone="secondary">
          {deniedLine}
        </AppText>
      ) : (
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <PrimaryButton label={skipLabel} variant="secondary" onPress={onSkip} style={{ flex: 1 }} />
          <PrimaryButton label={allowLabel} onPress={onAllow} style={{ flex: 1 }} />
        </View>
      )}
    </Card>
  );
}
