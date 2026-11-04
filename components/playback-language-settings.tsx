"use client";

import { ChevronDown, Globe2 } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import { PLAYBACK_LANGUAGES } from "@/lib/media/playback-preferences";
import { trackLanguage } from "@/lib/media/track-label";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuOptions } from "@/components/arc/dropdown-menu/dropdown-menu";
import { Select } from "@/components/arc/select/select";
import { Switch } from "@/components/arc/switch/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldContent } from "@/components/ui/field";
import styles from "@/app/(main)/settings/settings.module.css";

const languages = PLAYBACK_LANGUAGES.map(value => ({ value, ...trackLanguage(value), isLanguage: true }))
  .sort((a, b) => Number(b.value === "en") - Number(a.value === "en") || a.label.localeCompare(b.label));

function LanguageSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange(value: string): void }) {
  const language = trackLanguage(value);
  // Retain a stored regional language (e.g. pt-BR) alongside the base languages.
  const options = languages.some(option => option.value === value) ? languages : [{ value, ...language, isLanguage: true }, ...languages];
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button id={id} variant="outline" className="w-full justify-start" aria-label={`${label}: ${language.label}`}>
          {language.flag ? <img src={language.flag} width={14} height={14} alt="" className="rounded-full" /> : <Globe2 aria-hidden="true" />}
          <span className="min-w-0 truncate">{language.label}</span>
          {language.badge && <Badge variant="outline">{language.badge}</Badge>}
          <ChevronDown className="ms-auto" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" style={{ width: "var(--radix-dropdown-menu-trigger-width)", minWidth: "min(18rem, calc(100vw - 24px))" }}>
        <DropdownMenuGroup><DropdownMenuOptions value={value} onValueChange={onChange} options={options} /></DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </Field>;
}

export function PlaybackLanguageSettings() {
  const { playbackPreferences: preferences, updatePlaybackPreferences: update } = useSettings();
  return <section aria-labelledby="playback-language-title" className={styles.section}>
    <div className="flex flex-col gap-2">
      <h2 id="playback-language-title" className="text-lg font-medium">Playback languages</h2>
      <p className={styles.description}>Choose your preferred tracks when a video starts. Saved on this device.</p>
    </div>
    <FieldGroup className="min-w-0 gap-6">
      <FieldGroup className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <LanguageSelect id="preferred-audio-language" label="Preferred audio language" value={preferences.audioLanguage}
          onChange={audioLanguage => update({ audioLanguage })} />
        <LanguageSelect id="preferred-subtitle-language" label="Preferred subtitle language" value={preferences.subtitleLanguage}
          onChange={subtitleLanguage => update({ subtitleLanguage })} />
      </FieldGroup>
      <Field><Select id="preferred-subtitle-type" label="Subtitle type" value={preferences.subtitleMode}
        options={[{ value: "normal", label: "Normal subtitles" }, { value: "forced", label: "Forced subtitles only" }]}
        onValueChange={value => update({ subtitleMode: value === "forced" ? "forced" : "normal" })} />
        <FieldDescription>Forced subtitles usually translate foreign dialogue or on-screen text.</FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="subtitles-on-by-default">Always enable subtitles</FieldLabel>
          <FieldDescription>Automatically select a matching track. Turn off to enable subtitles yourself.</FieldDescription>
        </FieldContent>
        <Switch id="subtitles-on-by-default" checked={preferences.subtitlesEnabledByDefault}
          onCheckedChange={subtitlesEnabledByDefault => update({ subtitlesEnabledByDefault })} />
      </Field>
    </FieldGroup>
  </section>;
}
