"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { EphemeralCamera } from "@/lib/video";

export default function VideoReview({ captureActive = false }: { captureActive?: boolean }) {
  const preview = useRef<HTMLVideoElement>(null);
  const camera = useRef<EphemeralCamera | null>(null);
  const alive = useRef(false);
  const [revision, render] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    alive.current = true;
    const session = new EphemeralCamera(() => { if (alive.current) render((n) => n + 1); },
      (message) => { if (alive.current) setError(message); });
    camera.current = session;
    const discard = () => { session.close(); if (alive.current) setPending(false); };
    const visibility = () => { if (document.hidden) discard(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", discard);
    return () => {
      alive.current = false;
      session.close();
      camera.current = null;
      if (preview.current) preview.current.srcObject = null;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", discard);
    };
  }, []);
  useEffect(() => {
    const session = camera.current;
    if (preview.current && preview.current.srcObject !== session?.stream) {
      preview.current.srcObject = session?.stream ?? null;
      if (session?.stream) void preview.current.play().catch(() => setError("Press play to show the camera preview."));
    }
  }, [revision]);
  useEffect(() => {
    if (captureActive) camera.current?.record();
    else camera.current?.stop();
  }, [captureActive, !!camera.current?.stream]);
  async function enable() {
    const session = camera.current;
    if (!session || pending) return;
    setPending(true);
    setError("");
    try { await session.open(); }
    catch { if (alive.current) setError("Camera access failed. Check browser permissions; audio practice still works."); }
    finally { if (alive.current) setPending(false); }
  }
  const session = camera.current;
  return <div className="video-review">
    <span className="eyebrow">PRIVATE CAMERA REVIEW</span>
    <h2>See the same take.</h2>
    <p>Enable the camera before playing. Keep both hands and the bridge visible. The camera records silently alongside your take, up to 60 seconds. Replay the audio above separately; this is manual review, not frame-accurate analysis.</p>
    <video ref={preview} className={session?.stream ? "video-preview" : "hidden"} muted playsInline controls aria-label="Live camera preview" />
    {session?.url && <video className="video-preview" src={session.url} controls playsInline controlsList="nodownload" aria-label="Temporary take video" />}
    <div className="button-row">
      <button className="button secondary" disabled={pending || captureActive} onClick={() => session?.stream ? session.close() : void enable()}>
        <Camera size={18} />{pending ? "Opening camera…" : session?.stream ? "Turn camera off and discard" : "Enable camera for next take"}
      </button>
      {session?.url && <button className="button secondary" onClick={() => session.clear()}><Trash2 size={18} />Discard video</button>}
    </div>
    {session?.recording && <p role="status">Recording video in memory.</p>}
    {session?.url && <p>Count the visible picks and compare with detected events. If you see four picks but RIFF reports more, check detection and ringing before changing technique. Video cannot establish pressure, tension or the cause of a missed note.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <p className="privacy-note">RIFF does not upload or persist video. It holds one temporary clip in this tab, discarded on the next take, camera off, hidden tab or leaving this view. No video enters progress backups.</p>
  </div>;
}
