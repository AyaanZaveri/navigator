"use client";

import { useSettings } from "@/contexts/settings-context";
import { Switch } from "@/components/arc/switch/switch";
import { Field, FieldGroup, FieldLabel, FieldContent, FieldDescription } from "@/components/ui/field";
import styles from "@/app/(main)/settings/settings.module.css";

export function PlaybackSettings() {
  const { playbackPreferences, updatePlaybackPreferences } = useSettings();
  return <section aria-label="Playback" className={styles.section}>
    <FieldGroup className="min-w-0 gap-6">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="automatic-web-stream">Automatically find a playable stream</FieldLabel>
          <FieldDescription id="automatic-web-stream-description">On web, try other streams if playback fails or audio is unsupported.</FieldDescription>
        </FieldContent>
        <Switch id="automatic-web-stream" aria-describedby="automatic-web-stream-description" checked={playbackPreferences.autoSelectWebStream}
          onCheckedChange={autoSelectWebStream => updatePlaybackPreferences({ autoSelectWebStream })} />
      </Field>
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
        </FieldContent>
        <Switch id="episode-prefetch" checked={playbackPreferences.episodePrefetch}
          onCheckedChange={episodePrefetch => updatePlaybackPreferences({ episodePrefetch })} />
      </Field>
    </FieldGroup>
  </section>;
}
