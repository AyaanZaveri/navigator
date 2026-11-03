"use client";

import { useSettings } from "@/contexts/settings-context";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/arc/select/select";
import Image from "next/image";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { SubtitleText } from "@/components/subtitle-text";
import { SUBTITLE_OUTLINES, SUBTITLE_SIZES, SUBTITLE_WEIGHTS, SUBTITLE_COLORS, type SubtitleOutline, type SubtitleSize, type SubtitleWeight, type SubtitleColor } from "@/lib/subtitle-appearance";
import styles from "@/app/(main)/settings/settings.module.css";

export function SubtitleSettings() {
  const { subtitleSize, setSubtitleSize, subtitleOutline, setSubtitleOutline, subtitleWeight, setSubtitleWeight, subtitleColor, setSubtitleColor, resetSubtitleAppearance } = useSettings();
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
          <SubtitleText size={subtitleSize} outline={subtitleOutline} weight={subtitleWeight} color={subtitleColor} className={styles.subtitlePreviewText}>
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
      <FieldGroup className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field><Select id="subtitle-weight" label="Font weight" value={subtitleWeight}
          options={[...SUBTITLE_WEIGHTS]} onValueChange={value => setSubtitleWeight(value as SubtitleWeight)} /></Field>
        <Field><Select id="subtitle-color" label="Text color" value={subtitleColor}
          options={SUBTITLE_COLORS.map(({ value, label, color }) => ({ value, label,
            icon: <span aria-hidden="true" className={styles.subtitleSwatch} style={{ backgroundColor: color }} /> }))}
          onValueChange={value => setSubtitleColor(value as SubtitleColor)} /></Field>
      </FieldGroup>
      <Field>
        <FieldLabel asChild><span>Outline</span></FieldLabel>
        <div className="flex"><SegmentedControl label="Subtitle outline" value={subtitleOutline}
          onValueChange={value => setSubtitleOutline(value as SubtitleOutline)} options={[...SUBTITLE_OUTLINES]} /></div>
        <FieldDescription>A dark outline keeps text readable over light and dark scenes.</FieldDescription>
      </Field>
      <div className="flex"><Button type="button" variant="ghost" size="sm" onClick={resetSubtitleAppearance}
        disabled={subtitleSize === "standard" && subtitleOutline === "thin" && subtitleWeight === "medium" && subtitleColor === "white"}>
        Reset to defaults
      </Button></div>
    </FieldGroup>
  </section>;
}
