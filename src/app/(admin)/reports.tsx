/**
 * Admin → Survey analytics by district, ULB, and surveyor.
 */
import { AdminHeader } from '@/components/admin/admin-header';
import { SurveyStatsBreakdown } from '@/components/admin/survey-stats-breakdown';
import { ScrollView, View } from 'react-native';

export default function AdminReportsScreen() {
  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader title="Survey reports" subtitle="District, ULB, and surveyor breakdowns" eyebrow="Analytics" />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <SurveyStatsBreakdown />
      </ScrollView>
    </View>
  );
}
