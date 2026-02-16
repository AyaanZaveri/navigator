import { redirect } from "next/navigation";

// In Stremio, seasons are not separate entities.
// Redirect to the series page which shows all episodes.
export default async function SeasonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // In Stremio the series page handles all episodes.
  redirect(`/series/${id}`);
}
