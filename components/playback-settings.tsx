"use client";

import { useSettings } from "@/contexts/settings-context";
import { Switch } from "@/components/arc/switch/switch";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldContent } from "@/components/ui/field";
import styles from "@/app/(main)/settings/settings.module.css";

export function PlaybackSettings() {
  const { playbackPreferences, updatePlaybackPreferences } = useSettings();
  return <section aria-label="Episode playback" className={styles.section}>
    <FieldGroup className="min-w-0 gap-6">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="episode-autoplay">Autoplay next episode</FieldLabel>
        </FieldContent>
        <Switch id="episode-autoplay" checked={playbackPreferences.episodeAutoplay}
          onCheckedChange={episodeAutoplay => updatePlaybackPreferences({ episodeAutoplay })} />
      </Field>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="episode-prefetch">Preload next episode</FieldLabel>
          <FieldDescription>Uses extra data.</FieldDescription>
        </FieldContent>
        <Switch id="episode-prefetch" checked={playbackPreferences.episodePrefetch}
          onCheckedChange={episodePrefetch => updatePlaybackPreferences({ episodePrefetch })} />
      </Field>
    </FieldGroup>
  </section>;
}
