"use client";

import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { NumberField } from "@/components/arc/number-field/number-field";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { SUBTITLE_TIMING_LIMIT } from "@/lib/media/subtitle-timing";

export function SubtitleTimingDialog({ open, onOpenChange, seconds, onChange, available, container }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  seconds: number;
  onChange(seconds: number): void;
  available: boolean;
  container?: HTMLElement | null;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="Subtitle timing" container={container}
      description="Adjust a downloaded subtitle track for this video. Timing is kept for this app session."
      onCloseAutoFocus={event => {
        // The menu item that opened this dialog has unmounted. Return to its
        // persistent settings button, including inside browser fullscreen.
        const trigger = container?.querySelector<HTMLElement>('[data-slot="media-player-settings"]');
        if (trigger) { event.preventDefault(); trigger.focus(); }
      }}>
      <FieldGroup>
        <Field><NumberField label="Delay" value={seconds} onValueChange={onChange}
          min={-SUBTITLE_TIMING_LIMIT} max={SUBTITLE_TIMING_LIMIT} step={0.1} largeStep={1}
          prefix={value => value > 0 ? "+" : ""} suffix=" s" disabled={!available} limitHint={false}
          description={available ? "Positive values show subtitles later. Negative values show them earlier." : "Select a downloaded subtitle track to adjust timing. Embedded subtitle timing is not supported yet."} /></Field>
        <div className="flex"><Button type="button" variant="ghost" size="sm" disabled={!available || seconds === 0}
          onClick={() => onChange(0)}>Reset timing</Button></div>
      </FieldGroup>
    </DialogContent>
  </Dialog>;
}
