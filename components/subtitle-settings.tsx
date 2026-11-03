"use client";

import { useSettings } from "@/contexts/settings-context";
import Image from "next/image";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { SubtitleText } from "@/components/subtitle-text";
import { SUBTITLE_OUTLINES, SUBTITLE_SIZES, type SubtitleOutline, type SubtitleSize } from "@/lib/subtitle-appearance";
import styles from "@/app/(main)/settings/settings.module.css";

export function SubtitleSettings() {
  const { subtitleSize, setSubtitleSize, subtitleOutline, setSubtitleOutline } = useSettings();
  return <section aria-labelledby="subtitle-settings-title" className={styles.section}>
    <div className="flex flex-col gap-2">
      <h2 id="subtitle-settings-title" className="text-lg font-medium">Subtitles</h2>
      <p className={styles.description}>Choose how subtitles look during playback. Changes are saved on this device.</p>
    </div>
    <FieldGroup className="min-w-0 gap-6">
      <figure className={styles.subtitlePreviewFigure} aria-labelledby="subtitle-preview-title">
        <div className={styles.subtitlePreview}>
          <Image src="/images/subtitle-preview.jpg" alt="" fill unoptimized
            sizes="(max-width: 640px) 90vw, 640px" className={styles.subtitlePreviewImage} />
          <SubtitleText size={subtitleSize} outline={subtitleOutline} className={styles.subtitlePreviewText}>
            Every story starts somewhere.
          </SubtitleText>
        </div>
        <figcaption id="subtitle-preview-title" className={styles.description}>Preview</figcaption>
      </figure>
      <Field>
        <FieldLabel asChild><span>Text size</span></FieldLabel>
        <div className="flex"><SegmentedControl label="Subtitle text size" value={subtitleSize}
          onValueChange={value => setSubtitleSize(value as SubtitleSize)} options={[...SUBTITLE_SIZES]} /></div>
      </Field>
      <Field>
        <FieldLabel asChild><span>Outline</span></FieldLabel>
        <div className="flex"><SegmentedControl label="Subtitle outline" value={subtitleOutline}
          onValueChange={value => setSubtitleOutline(value as SubtitleOutline)} options={[...SUBTITLE_OUTLINES]} /></div>
        <FieldDescription>A dark outline keeps text readable over light and dark scenes.</FieldDescription>
      </Field>
    </FieldGroup>
  </section>;
}
