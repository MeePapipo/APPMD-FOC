import { SkeletonPage } from "@/components/Skeleton";

export default function Loading() {
  // The calculator blocks on the full account + master-assay load before it can
  // render anything, which is the slowest first paint in the app.
  return <SkeletonPage label="Loading calculator" rows={4} />;
}
