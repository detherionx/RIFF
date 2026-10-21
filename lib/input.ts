export type InputSettings = { deviceId: string; channel: number };
const key = "riff.input.v1";
export function loadInput(): InputSettings | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value.deviceId === "string" && value.deviceId &&
      Number.isInteger(value.channel) && value.channel >= 0 && value.channel < 2 ? value : null;
  } catch { return null; }
}
export function saveInput(value: InputSettings) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
export function inputConstraints(input: InputSettings): MediaStreamConstraints {
  if (!input.deviceId || !Number.isInteger(input.channel) || input.channel < 0 || input.channel > 1)
    throw new Error("Choose an audio input and channel in Audio setup first.");
  return { audio: { deviceId: { exact: input.deviceId }, channelCount: { ideal: 2 },
    echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false };
}
export function inputError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") return "Audio permission was denied. Allow microphone access for RIFF in your browser and Windows Privacy > Microphone, then reconnect.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "The selected input is unavailable. Reconnect the Katana, refresh devices and select SECONDARY (KATANA). RIFF has not switched microphones.";
  if (name === "NotReadableError" || name === "AbortError") return "Windows could not open this input. Close other audio apps using exclusive mode, check the USB cable and Roland driver, then reconnect.";
  return error instanceof Error ? error.message : "Could not open audio input.";
}
