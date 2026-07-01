import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AdminHeaderVariant = "brand" | "surface";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  variant?: AdminHeaderVariant;
  onBack?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
}

export function AdminHeader({
  title,
  subtitle,
  eyebrow = "Admin",
  variant = "brand",
  onBack,
  right,
  footer,
}: AdminHeaderProps) {
  const isBrand = variant === "brand";

  return (
    <SafeAreaView
      edges={["top"]}
      className={
        isBrand
          ? "bg-brand"
          : "bg-surface-light dark:bg-surface-dark border-b border-line-subtle"
      }
    >
      <View className="px-4 pt-2 pb-4">
        <View className="flex-row items-center min-h-9">
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              className="w-9 h-9 -ml-1 items-center justify-center rounded-full active:bg-white/10"
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={isBrand ? "#FFFFFF" : "#003B8E"}
              />
            </Pressable>
          ) : null}
          <View className={`flex-1 ${onBack ? "ml-1" : ""}`}>
            {eyebrow ? (
              <Text
                className={
                  isBrand
                    ? "text-helper text-white/65"
                    : "text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark"
                }
              >
                {eyebrow}
              </Text>
            ) : null}
            <Text
              className={
                isBrand
                  ? "text-h1 font-medium text-white mt-0.5"
                  : "text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark"
              }
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                className={
                  isBrand
                    ? "text-caption text-white/75 mt-1"
                    : "text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5"
                }
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
        {footer}
      </View>
    </SafeAreaView>
  );
}
