export const navigatorBeamColors = `
[data-beam="{id}"][data-active]::after,
[data-beam="{id}"][data-fading]::after {
  background: linear-gradient(135deg, var(--color-1), var(--color-4), var(--color-2));
}
[data-beam="{id}"][data-active]::before,
[data-beam="{id}"][data-fading]::before {
  background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 18%, transparent), color-mix(in oklab, var(--color-2) 10%, transparent));
  box-shadow: inset 0 0 9px 1px color-mix(in oklab, var(--primary) 20%, transparent);
}
`;
