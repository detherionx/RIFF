"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Square, Upload, Download, Trash2 } from "lucide-react";
import { download } from "@/lib/storage";
export default function VideoReview() {
  const preview = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    blob = useRef<Blob | null>(null),
    urlRef = useRef(""),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    alive = useRef(true),
    busy = useRef(false),
    generation = useRef(0);
  const [url, setUrl] = useState(""),
    [recording, setRecording] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [review, setReview] = useState<string[]>([]);
  function stop() {
    const finishing = recorder.current?.state === "recording";
    if (finishing) recorder.current!.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (preview.current) preview.current.srcObject = null;
    if (!finishing) busy.current = false;
    setPending(finishing);
    setRecording(false);
  }
  function show(b: Blob) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    blob.current = b;
    urlRef.current = URL.createObjectURL(b);
    setUrl(urlRef.current);
    setReview([]);
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      busy.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);
  async function record() {
    if (busy.current) return;
    busy.current = true;
    const token = ++generation.current;
    setPending(true);
    setError("");
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === "undefined")
        throw new Error(
          "Camera recording is unavailable in this browser. Choose a video file instead.",
        );
      const s = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });
      if (!alive.current || token !== generation.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      setRecording(true);
      if (preview.current) {
        preview.current.srcObject = s;
        await preview.current.play();
      }
      if (!alive.current || token !== generation.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      const preferred = [
        "video/webm;codecs=vp8,opus",
        "video/mp4",
        "video/webm",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(
        s,
        preferred ? { mimeType: preferred } : undefined,
      );
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        if (!alive.current || token !== generation.current) return;
        stop();
        recorder.current = null;
        show(new Blob(chunks, { type: r.mimeType }));
      };
      recorder.current = r;
      r.start(1000);
      setUrl("");
      setPending(false);
      timer.current = setTimeout(stop, 120000);
    } catch (e) {
      if (!alive.current || token !== generation.current) return;
      stop();
      setError(e instanceof Error ? e.message : "Camera access failed.");
    }
  }
  return (
    <div className="video-review">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SEE HOW YOU PLAY</span>
          <h2>Another angle.</h2>
        </div>
        <span className="pill">Private manual review</span>
      </div>
      <p className="muted">
        Place your camera diagonally in front of the guitar, with the bridge and
        both hands in frame. Use good light. Record up to two minutes.
      </p>
      <video
        ref={preview}
        className={recording ? "video-preview" : "hidden"}
        muted
        playsInline
        aria-label="Live camera preview"
      />
      {url && (
        <video
          className="video-preview"
          src={url}
          controls
          playsInline
          preload="metadata"
        />
      )}
      <div className="button-row">
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => (recording ? stop() : void record())}
        >
          {recording ? <Square size={18} /> : <Camera size={18} />}{" "}
          {pending
            ? "Preparing video…"
            : recording
              ? "Stop recording"
              : "Record video"}
        </button>
        <label className="button secondary">
          <Upload size={18} /> Choose video
          <input
            className="sr-only"
            type="file"
            accept="video/*"
            disabled={recording || pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 150 * 1024 * 1024) {
                setError("Choose a video smaller than 150 MB.");
                return;
              }
              if (!file.type.startsWith("video/")) {
                setError("Choose a supported video file.");
                return;
              }
              show(file);
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <>
            <button
              className="icon-button"
              aria-label="Download video"
              onClick={() =>
                blob.current &&
                download(
                  `riff-review.${blob.current.type.includes("mp4") ? "mp4" : "webm"}`,
                  blob.current,
                )
              }
            >
              <Download size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Delete local video"
              onClick={() => {
                URL.revokeObjectURL(urlRef.current);
                urlRef.current = "";
                blob.current = null;
                setUrl("");
              }}
            >
              <Trash2 size={19} />
            </button>
          </>
        )}
      </div>
      {url && (
        <div className="review-checklist">
          <strong>Watch once. Look for one useful change.</strong>
          {[
            "Both hands and the bridge are visible",
            "Picking movement looks small and repeatable",
            "My wrist feels relaxed — no pain",
            "Muted notes sound shorter than my open notes",
          ].map((item) => (
            <label key={item}>
              <input
                type="checkbox"
                checked={review.includes(item)}
                onChange={() =>
                  setReview((r) =>
                    r.includes(item)
                      ? r.filter((x) => x !== item)
                      : [...r, item],
                  )
                }
              />
              {item}
            </label>
          ))}
          <p className="muted">
            These are your observations. RIFF does not infer hand position,
            tension or injury from this video. If the angle hides a hand,
            reposition and record again.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="privacy-note">
        Video and audio stay in this browser tab. Download to keep a copy;
        leaving this view discards it.
      </p>
    </div>
  );
}
