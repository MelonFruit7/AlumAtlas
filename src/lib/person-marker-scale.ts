const PERSON_SCALE_MIN = 0.2;
const PERSON_SCALE_MAX = 0.9;
const PERSON_SCALE_ZOOM_MIN = 7;
const PERSON_SCALE_ZOOM_MAX = 11.8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function personScaleForZoom(zoom: number): number {
  if (zoom <= PERSON_SCALE_ZOOM_MIN) {
    return PERSON_SCALE_MIN;
  }
  if (zoom >= PERSON_SCALE_ZOOM_MAX) {
    return PERSON_SCALE_MAX;
  }
  const progress =
    (zoom - PERSON_SCALE_ZOOM_MIN) / (PERSON_SCALE_ZOOM_MAX - PERSON_SCALE_ZOOM_MIN);
  return clamp(
    PERSON_SCALE_MIN + progress * (PERSON_SCALE_MAX - PERSON_SCALE_MIN),
    PERSON_SCALE_MIN,
    PERSON_SCALE_MAX,
  );
}
