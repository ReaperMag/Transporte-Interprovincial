import type { CSSProperties } from 'react';

/** Expose only validated six-digit hex colors to CSS custom properties. */
export function validColor(value: string | null | undefined): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

export function readableTextColor(hex: string): string {
  const channels = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#14212b' : '#ffffff';
}

/** Shared visual contract; works for the cooperative and its office staff. */
export function cooperativeThemeStyle(
  primaryValue: string | null | undefined,
  secondaryValue: string | null | undefined,
): CSSProperties {
  const primary = validColor(primaryValue);
  const secondary = validColor(secondaryValue);
  return {
    ...(primary ? {
      '--coop-primary': primary,
      '--coop-on-primary': readableTextColor(primary),
      '--coop-brand-icon': primary,
      '--coop-brand-icon-text': readableTextColor(primary),
    } : {}),
    ...(secondary ? {
      '--coop-secondary': secondary,
      '--coop-on-secondary': readableTextColor(secondary),
    } : {}),
  } as CSSProperties;
}
