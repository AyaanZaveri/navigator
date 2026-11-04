import type { Episode } from "@/app/actions/tv-shows";
import type { MediaToPlay } from "@/lib/atoms";

export const NEXT_EPISODE_PREFETCH_WINDOW = 90;
export const NEXT_EPISODE_PREFETCH_TTL = 2 * 60_000;
export function shouldPrefetchEpisode(position: number, duration: number): boolean {
  return Number.isFinite(position) && Number.isFinite(duration) && duration > 0 && position > 0
    && duration - position > 0 && duration - position <= Math.min(NEXT_EPISODE_PREFETCH_WINDOW, duration * .2);
}
export function nextEpisodeRequest(media: MediaToPlay, next: Episode): MediaToPlay {
  const id = media.seriesId || media.id;
  return {
    id, seriesId: id, type: "series", name: next.title, episodeTitle: next.title,
    showName: media.showName || media.details?.name, backdropUrl: media.backdropUrl,
    details: media.details, detailsLoaded: false,
    mediaSourceId: next.id, seasonNumber: next.season, episodeNumber: next.episode,
  };
}

/** One playback session owns at most one following episode and one preparation. */
export class EpisodeContinuation {
  private controller = new AbortController();
  private preparationController = new AbortController();
  private lookup?: Promise<Episode | null>;
  private prepared?: Promise<MediaToPlay>;
  private preparedAt = 0;
  private advancing?: Promise<boolean>;
  private moved = false;
  private prefetched = false;
  constructor(private dependencies: {
    current(): MediaToPlay;
    isCurrent?(): boolean;
    season: number; episode: number;
    lookup(signal: AbortSignal): Promise<Episode | null>;
    prepare(media: MediaToPlay, signal: AbortSignal): Promise<MediaToPlay>;
    warm?(media: MediaToPlay, signal: AbortSignal): Promise<unknown>;
    beforeAdvance(ended: boolean): void;
    play(media: MediaToPlay): void;
    now?: () => number;
  }) {}
  get advanced() { return this.moved; }
  get active() { return !this.controller.signal.aborted && (this.dependencies.isCurrent?.() ?? true); }
  next(): Promise<Episode | null> {
    return this.lookup ??= this.dependencies.lookup(this.controller.signal).then(next => {
      const { season, episode } = this.dependencies;
      return this.active && next && next.season > 0 && (next.season > season || next.season === season && next.episode > episode)
        && (!next.released || Date.parse(next.released) <= Date.now()) ? next : null;
    }).catch(() => { this.lookup = undefined; return null; });
  }
  private async prepare(): Promise<MediaToPlay | null> {
    const signal = AbortSignal.any([this.controller.signal, this.preparationController.signal]);
    const next = await this.next();
    if (!next || !this.active || signal.aborted) return null;
    const now = this.dependencies.now || Date.now;
    if (this.prepared && this.preparedAt && now() - this.preparedAt > NEXT_EPISODE_PREFETCH_TTL) this.prepared = undefined;
    if (!this.prepared) {
      const operation = this.dependencies.prepare(nextEpisodeRequest(this.dependencies.current(), next), signal)
        .then(media => { if (this.prepared === operation) this.preparedAt = now(); return media; })
        .catch(error => { if (this.prepared === operation) this.prepared = undefined; throw error; });
      this.prepared = operation;
    }
    return this.prepared;
  }
  async prefetch() {
    if (!this.active || this.prefetched || this.moved) return;
    this.prefetched = true;
    const signal = AbortSignal.any([this.controller.signal, this.preparationController.signal]);
    try {
      const media = await this.prepare();
      if (this.active && !signal.aborted && media) await this.dependencies.warm?.(media, signal);
    } catch { /* Optional preparation cannot interrupt the current episode. */ }
  }
  advance(ended = false): Promise<boolean> {
    if (!this.active || this.moved) return Promise.resolve(false);
    if (this.advancing) return this.advancing;
    return this.advancing = (async () => {
      const next = await this.next();
      if (!next || !this.active) return false;
      // An unprepared manual/automatic advance opens the normal player loader
      // immediately. An in-flight prefetch is shared instead of duplicated.
      let media: MediaToPlay;
      if (this.prepared) {
        try { media = await this.prepare() || nextEpisodeRequest(this.dependencies.current(), next); }
        catch { media = nextEpisodeRequest(this.dependencies.current(), next); }
      } else media = nextEpisodeRequest(this.dependencies.current(), next);
      if (!this.active || this.moved) return false;
      this.moved = true;
      this.dependencies.beforeAdvance(ended);
      this.dependencies.play(media);
      return true;
    })().finally(() => { this.advancing = undefined; });
  }
  cancelPrefetch() {
    this.preparationController.abort();
    this.preparationController = new AbortController();
    this.prepared = undefined; this.preparedAt = 0; this.prefetched = false;
  }
  dispose() { this.controller.abort(); this.preparationController.abort(); }
}
