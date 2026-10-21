/** Memory-only camera. No uploads, file exports, or browser storage. */
export class EphemeralCamera {
  stream: MediaStream | null = null;
  url = "";
  recording = false;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private bytes = 0;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private changed: () => void, private failed: (message: string) => void) {}

  async open() {
    const token = ++this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 } } });
    if (token !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    stream.getVideoTracks().forEach((track) => { track.onended = () => this.close(); });
    this.changed();
  }

  clear() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = "";
    this.changed();
  }

  record() {
    if (!this.stream || this.recorder) return;
    this.clear();
    const token = this.generation;
    try {
      const mimeType = ["video/webm;codecs=vp8", "video/mp4", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(this.stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 800_000 });
      this.recorder = recorder;
      this.chunks = [];
      this.bytes = 0;
      recorder.ondataavailable = (event) => {
        if (token !== this.generation || !event.data.size) return;
        this.bytes += event.data.size;
        if (this.bytes > 32 * 1024 * 1024) {
          this.close();
          this.failed("Video exceeded the memory limit and was discarded.");
          return;
        }
        this.chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (token !== this.generation) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        if (this.chunks.length) this.url = URL.createObjectURL(new Blob(this.chunks, { type: recorder.mimeType }));
        this.chunks = [];
        this.recorder = null;
        this.recording = false;
        this.changed();
      };
      recorder.onerror = () => { this.close(); this.failed("Camera recording failed; video was discarded."); };
      recorder.start(250);
      this.recording = true;
      this.timer = setTimeout(() => this.stop(), 60_000);
      this.changed();
    } catch {
      this.close();
      this.failed("This browser cannot record video. Audio practice is still available.");
    }
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  close() {
    this.generation++;
    this.stop();
    this.recorder = null;
    this.chunks = [];
    this.bytes = 0;
    this.recording = false;
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.stream = null;
    this.clear();
  }
}
