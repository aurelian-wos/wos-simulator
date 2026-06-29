const MIDPOINT = 248;
const SATURATION_POWER = 0.7;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function channelForDistance(distanceFromMidpoint: number): number {
  const strength = Math.pow(distanceFromMidpoint / 0.5, SATURATION_POWER);
  return Math.round(MIDPOINT * (1 - strength));
}

export function winrateColor(value: number): string {
  const v = clamp01(value);
  if (v === 0.5) return `rgb(${MIDPOINT},${MIDPOINT},${MIDPOINT})`;
  if (v < 0.5) {
    const channel = channelForDistance(0.5 - v);
    return `rgb(${channel},${channel},255)`;
  }
  const channel = channelForDistance(v - 0.5);
  return `rgb(255,${channel},${channel})`;
}
