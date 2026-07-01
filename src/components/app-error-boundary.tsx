import { authStyles } from "@/components/auth/styles";
import { useEffect } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function AppErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[AppErrorBoundary]", error.message, error.stack);
  }, [error]);

  return (
    <SafeAreaView style={authStyles.safe}>
      <ScrollView contentContainerStyle={authStyles.scroll}>
        <Text style={authStyles.title}>Something went wrong</Text>
        <Text style={authStyles.subtitle}>
          {error.message || "An unexpected error occurred. Check the Metro terminal for details."}
        </Text>
        {__DEV__ && error.stack ? (
          <Text
            selectable
            style={[authStyles.subtitle, { fontFamily: "monospace", fontSize: 11, marginTop: 12 }]}
          >
            {error.stack}
          </Text>
        ) : null}
        <Pressable style={authStyles.button} onPress={retry}>
          <Text style={authStyles.buttonText}>Try again</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
