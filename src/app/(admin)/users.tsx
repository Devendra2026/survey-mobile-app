import { EmptyState, Spinner } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { RoleSegmentedControl, UserDirectoryCard, UserSearchBar, type UserItem } from '@/components/admin/user-list';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useHasCapability } from '@/hooks/use-has-capability';
import { flatListProps } from '@/utils/scroll-props';
import { FlashList } from '@shopify/flash-list';
import { usePaginatedQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

const PAGE_SIZE = 30;

const ListSeparator = () => <View className="h-3" />;

export default function AdminUsersScreen() {
  const router = useRouter();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const canViewUsers = useHasCapability('users.view');

  const paginated = usePaginatedQuery(
    api.admin.queries.listUsers as Parameters<typeof usePaginatedQuery>[0],
    canViewUsers ? { role: role ?? undefined } : 'skip',
    { initialNumItems: PAGE_SIZE },
  );

  const users = paginated.results;
  const status = paginated.status;
  const loadMore = paginated.loadMore;

  const isLoading = status === 'LoadingFirstPage';
  const isLoadingMore = status === 'LoadingMore';

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.municipalityName?.toLowerCase().includes(q) ?? false),
    );
  }, [users, debouncedSearch]);

  const onOpenUser = useCallback(
    (userId: Id<'users'>) => {
      router.push({
        pathname: '/(admin)/assign-user',
        params: { userId },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: UserItem }) => <UserDirectoryCard item={item} onOpen={onOpenUser} />,
    [onOpenUser],
  );

  const listFooter = useCallback(
    () =>
      isLoadingMore ? (
        <View className="py-4 items-center">
          <ActivityIndicator color="#003B8E" />
        </View>
      ) : null,
    [isLoadingMore],
  );

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        variant="surface"
        eyebrow="Directory"
        title="Users"
        subtitle={isLoading ? 'Loading directory…' : `${filtered.length} shown · ${users.length} loaded`}
        footer={
          <View className="mt-3">
            <UserSearchBar value={search} onChange={setSearch} />
          </View>
        }
      />

      <RoleSegmentedControl value={role} onChange={setRole} />

      {isLoading ? (
        <Spinner label="Loading users…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={search ? 'No matches' : 'No users'}
          message={
            search
              ? 'Try a different name or email.'
              : role
                ? 'No users in this category yet.'
                : 'Approved users will appear here.'
          }
        />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(u) => u._id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
          {...flatListProps}
          onEndReached={() => {
            if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={listFooter}
          ItemSeparatorComponent={ListSeparator}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
