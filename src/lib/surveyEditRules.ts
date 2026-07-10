import type { Doc } from "@/convex/_generated/dataModel";

/** Status axes after a successful save — never implicitly resubmit or approve. */
export function resolvePostSaveStatuses(existing: Doc<"surveys">): Pick<Doc<"surveys">, "status" | "qcStatus"> {
  if (existing.qcStatus === "approved") {
    return { status: "submitted", qcStatus: "pending" };
  }

  if (existing.status === "submitted" && existing.qcStatus === "pending") {
    return { status: "submitted", qcStatus: "pending" };
  }

  if (existing.status === "draft" && existing.qcStatus === "rejected") {
    return { status: "draft", qcStatus: "rejected" };
  }

  if (existing.status === "submitted") {
    return { status: "submitted", qcStatus: existing.qcStatus };
  }

  if (existing.status === "approved") {
    return { status: "approved", qcStatus: existing.qcStatus };
  }

  return { status: "draft", qcStatus: existing.qcStatus };
}
