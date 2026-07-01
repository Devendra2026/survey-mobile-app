import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

interface WorkflowStep {
  label: string;
  done?: boolean;
  active?: boolean;
}

interface WorkflowStepsProps {
  steps: WorkflowStep[];
}

export function WorkflowSteps({ steps }: WorkflowStepsProps) {
  return (
    <View className="flex-row items-center px-1 py-1">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const tone = step.done ? "done" : step.active ? "active" : "idle";
        return (
          <View key={step.label} className="flex-1 flex-row items-center">
            <View className="items-center flex-1">
              <View
                className={[
                  "w-7 h-7 rounded-full items-center justify-center border",
                  tone === "done"
                    ? "bg-success border-success"
                    : tone === "active"
                      ? "bg-brand border-brand"
                      : "bg-surface-light dark:bg-surface-dark border-line-default",
                ].join(" ")}
              >
                {tone === "done" ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : (
                  <Text
                    className={[
                      "text-[11px] font-semibold",
                      tone === "active" ? "text-white" : "text-ink-tertiary-light",
                    ].join(" ")}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                className={[
                  "text-[10px] font-medium mt-1 text-center",
                  tone === "active"
                    ? "text-brand"
                    : tone === "done"
                      ? "text-success"
                      : "text-ink-tertiary-light",
                ].join(" ")}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>
            {!isLast ? (
              <View
                className={[
                  "h-0.5 flex-1 -mt-4 mx-0.5",
                  step.done ? "bg-success" : "bg-line-subtle",
                ].join(" ")}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
