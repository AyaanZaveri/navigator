"use client";

import { useSettings } from "@/contexts/settings-context";
import { Switch } from "@/components/arc/switch/switch";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldContent } from "@/components/ui/field";
import styles from "@/app/(main)/settings/settings.module.css";

export function PlaybackSettings() {
  const { playbackPreferences, updatePlaybackPreferences } = useSettings();
  return <section aria-labelledby="playback-settings-title" className={styles.section}>
    <h2 id="playback-settings-title" className="text-lg font-medium">Playback</h2>
    <FieldGroup className="min-w-0 gap-6">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="episode-autoplay">Enable episode autoplay</FieldLabel>
          <FieldDescription>Play the next episode automatically when the current one ends.</FieldDescription>
        </FieldContent>
        <Switch id="episode-autoplay" checked={playbackPreferences.episodeAutoplay}
          onCheckedChange={episodeAutoplay => updatePlaybackPreferences({ episodeAutoplay })} />
      </Field>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="episode-prefetch">Enable episode prefetch</FieldLabel>
          <FieldDescription>Prepare the next episode near the end for a faster start. Uses extra data.</FieldDescription>
        </FieldContent>
        <Switch id="episode-prefetch" checked={playbackPreferences.episodePrefetch}
          onCheckedChange={episodePrefetch => updatePlaybackPreferences({ episodePrefetch })} />
      </Field>
    </FieldGroup>
  </section>;
}
