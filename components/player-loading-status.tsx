import { ActivityTextShimmer } from "@/components/motion-primitives/activity-text-shimmer";

export function PlayerLoadingStatus({ label }: { label: string }) {
    return <ActivityTextShimmer role="status">{label}</ActivityTextShimmer>;
}
