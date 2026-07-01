import { bootScreenStyle } from '@/constants/brand';
import { View } from 'react-native';

/** AuthGate in root layout handles routing after startup. */
export default function Index() {
  return <View style={bootScreenStyle} />;
}
