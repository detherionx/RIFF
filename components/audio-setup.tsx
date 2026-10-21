"use client";
import { useEffect, useRef, useState } from "react";
import { AudioEngine, checkInput, detectPitch, extractNotes, recordingQuality } from "@/lib/audio";
import { inputError, loadInput, saveInput, type InputSettings } from "@/lib/input";
import { noteName } from "./fretboard";

const checks = [
  { name: "Quiet baseline", seconds: 3, midi: null, instruction: "Mute all six strings. Do not play for three seconds." },
  ...[40, 45, 50, 55, 59, 64].map((midi, i) => ({ name: `String ${6 - i}: ${noteName(midi)}`, seconds: 8, midi,
    instruction: `Pick open string ${6 - i} four times, about two seconds apart. Stop each note before the next pick. Start as soon as the countdown appears.` })),
  { name: "Fretted C3", seconds: 8, midi: 48, instruction: "String 5, fret 3. Pick four times, about two seconds apart. Stop each note before the next pick." },
  { name: "Sustain", seconds: 5, midi: 40, instruction: "Pick the open low E once and let it ring for five seconds. This checks whether one pick becomes several detections." },
  { name: "Overlap", seconds: 5, midi: null, instruction: "Pick low E, then A while E still rings. This demonstrates the single-note detector's limit; no performance score is awarded." },
];
export default function AudioSetup({ onReady }: { onReady?: (ready: boolean) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [selection, setSelection] = useState<InputSettings | null>(null);
  const [connected, setConnected] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [level, setLevel] = useState(-100), [pitch, setPitch] = useState("—"), [quality, setQuality] = useState("Input off");
  const [info, setInfo] = useState(""), [step, setStep] = useState(0), [remaining, setRemaining] = useState<number | null>(null);
  const [results, setResults] = useState<string[]>([]), [baselineReady, setBaselineReady] = useState(false);
  const qualified = useRef(false);
  const engine = useRef<AudioEngine | null>(null), quiet = useRef<Float32Array | null>(null), quietRate = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null), generation = useRef(0), selected = useRef(selection);
  selected.current = selection;
  function stop() {
    generation.current++;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    void engine.current?.close().catch(() => {});
    engine.current = null;
    quiet.current = null;
    setConnected(false); setPending(false); setRemaining(null); setBaselineReady(false);
  }
  useEffect(() => {
    setSelection(loadInput());
    const hidden = () => { if (document.hidden) { stop(); onReady?.(false); } };
    const changed = async () => {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      setDevices(inputs);
      if (selected.current && !inputs.some((d) => d.deviceId === selected.current!.deviceId)) {
        stop(); onReady?.(false); setError("Selected input disconnected. Reconnect and repeat the quiet and low E checks.");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    navigator.mediaDevices?.addEventListener("devicechange", changed);
    return () => { stop(); document.removeEventListener("visibilitychange", hidden); navigator.mediaDevices?.removeEventListener("devicechange", changed); };
  }, []);
  async function refresh() {
    setError(""); setPending(true);
    const run = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Audio needs HTTPS and a supported browser. Open RIFF in Chrome or Edge.");
      // Permission only: immediately stop this stream, never analyze the default microphone.
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      permission.getTracks().forEach((track) => track.stop());
      if (run !== generation.current) return;
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && !["default", "communications"].includes(d.deviceId));
      setDevices(inputs);
      if (!selected.current) {
        const dry = inputs.find((d) => /secondary/i.test(d.label) && /katana/i.test(d.label));
        if (dry) setSelection({ deviceId: dry.deviceId, channel: 0 });
      }
    } catch (e) { if (run === generation.current) setError(inputError(e)); }
    finally { if (run === generation.current) setPending(false); }
  }
  async function connect() {
    if (!selection) return;
    stop(); qualified.current = false; onReady?.(false); setError(""); setResults([]); setPending(true);
    const run = generation.current, session = new AudioEngine(); engine.current = session;
    try {
      await session.prepareMicrophone((samples, rate) => {
        if (run !== generation.current) return;
        const q = recordingQuality(samples), p = detectPitch(samples, rate);
        setLevel(Math.max(-100, 20 * Math.log10(Math.max(0.00001, q.level))));
        setQuality(q.clipped > 0.005 ? "Clipping — lower USB input level" : q.level < 0.003 ? "Quiet / below detection level" : "Signal present");
        setPitch(p && p.confidence > 0.82 ? `${noteName(Math.round(69 + 12 * Math.log2(p.frequency / 440)))} · ${p.frequency.toFixed(1)} Hz` : "No stable single pitch");
      }, selection);
      if (run !== generation.current) { await session.close(); return; }
      const settings = session.inputInfo;
      setInfo(`${devices.find((d) => d.deviceId === selection.deviceId)?.label || "Selected input"} · ${settings?.channelCount ?? 1} channel(s) exposed · ${settings?.sampleRate ?? "unknown"} Hz · analyzing channel ${selection.channel + 1}. Physical recording delay is not measured.`);
      setConnected(true);
      if (!saveInput(selection)) setError("Connected. Browser storage is unavailable; choose this input again next visit.");
    } catch (e) { await session.close(); if (run === generation.current) setError(inputError(e)); }
    finally { if (run === generation.current) setPending(false); }
  }
  async function measure() {
    const session = engine.current;
    if (!session || remaining !== null) return;
    const run = generation.current, check = checks[step];
    setError("");
    try {
      const start = session.startCapture(); setRemaining(check.seconds);
      timer.current = setInterval(async () => {
        if (run !== generation.current) return;
        const left = check.seconds - (session.currentTime - start); setRemaining(Math.max(0, Math.ceil(left)));
        if (left > 0) return;
        clearInterval(timer.current!); timer.current = null;
        try {
          const capture = await session.stopCapture();
          if (run !== generation.current) return;
          const q = recordingQuality(capture.samples), notes = extractNotes(capture.samples, capture.sampleRate);
          const matches = notes.filter((n) => n.midi === check.midi).length;
          let report = `${check.name}: ${notes.length} detected events; ${matches} expected-pitch matches. `;
          if (step === 0) {
            qualified.current = false; onReady?.(false);
            quiet.current = capture.samples; quietRate.current = capture.sampleRate;
            const passed = !q.invalid && q.clipped === 0 && q.level < 0.003 && notes.length === 0;
            setBaselineReady(passed);
            report = `Quiet baseline: ${Math.round(20 * Math.log10(Math.max(q.level, 0.00001)))} dBFS; ${notes.length} false events. ${passed ? "Ready for low E." : "Noise detected. Mute strings, check cable and dry input, then repeat."}`;
          } else if (step === 1 && quiet.current && quietRate.current === capture.sampleRate) {
            const checked = checkInput(capture.samples, quiet.current, capture.sampleRate);
            report += checked.message;
            qualified.current = checked.passed;
          } else if (step === 9) report += "Overlapping pitches are unsupported. These events are observations, not a reliable note count.";
          else report += q.invalid || q.clipped > 0.005 || q.level < 0.003 ? "Unreliable signal; fix input before judging playing." : `${notes.length === (step === 8 ? 1 : 4) && matches === notes.length ? "Expected count and pitches detected." : "Count or pitch differs: confirm the instructions and your actual picks before changing technique."}`;
          report += ` Events: ${notes.map((n) => `${noteName(n.midi)} @ ${n.time.toFixed(2)}s (${n.duration.toFixed(2)}s)`).join(", ") || "none"}.`;
          setResults((r) => [...r.slice(-19), report]);
        } catch (e) { if (run === generation.current) setError(inputError(e)); }
        finally { if (run === generation.current) setRemaining(null); }
      }, 100);
    } catch (e) { setRemaining(null); setError(inputError(e)); }
  }
  return <section className="panel" aria-label="Audio setup">
    <h2>Audio setup &amp; guitar check</h2>
    <p>Choose <strong>SECONDARY (KATANA)</strong> for dry guitar analysis. Hear your normal tone through the amp. RIFF does not monitor input back to the speakers. Use laptop speakers or headphones for the practice pulse.</p>
    <div className="button-row"><button className="button secondary" disabled={pending || connected} onClick={refresh}>Allow audio &amp; refresh devices</button></div>
    <label>Audio input <select disabled={connected || pending} value={selection?.deviceId ?? ""} onChange={(e) => { setSelection({ deviceId: e.target.value, channel: 0 }); onReady?.(false); }}>
      <option value="">Choose an input</option>
      {selection && !devices.some((d) => d.deviceId === selection.deviceId) && <option value={selection.deviceId}>Saved input — refresh to verify</option>}
      {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Unnamed input"}</option>)}
    </select></label>{" "}
    <label>Channel <select disabled={connected || pending} value={selection?.channel ?? 0} onChange={(e) => { if (selection) setSelection({ ...selection, channel: Number(e.target.value) }); onReady?.(false); }}><option value={0}>1 / left</option><option value={1}>2 / right (if exposed)</option></select></label>
    <div className="button-row"><button className="button secondary" disabled={!selection || pending || connected} onClick={connect}>{pending ? "Connecting…" : "Connect selected input"}</button><button className="button secondary" disabled={!connected && !pending} onClick={() => { stop(); onReady?.(false); }}>Disconnect</button></div>
    {error && <p role="alert">{error}</p>}
    {connected && <><p>{info}</p><label>Input level <meter min={-100} max={0} low={-50} high={-3} optimum={-18} value={level} /> {level.toFixed(0)} dBFS</label><p role="status">{quality} · {pitch}</p>
      <p>First run the quiet baseline, then four low E picks. These check measurement quality, not skill. The other tests help us investigate your actual instrument.</p>
      <label>Hardware test <select disabled={remaining !== null} value={step} onChange={(e) => setStep(Number(e.target.value))}>{checks.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}</select></label>
      <p>{checks[step].instruction}</p><button className="button primary" disabled={remaining !== null || (step > 0 && !baselineReady)} onClick={measure}>{remaining === null ? `Run ${checks[step].name}` : `Playing window: ${remaining}s`}</button>
      <p>After a passing low E check, use “Finish setup” to release the input for practice. Results stay here for this visit; no test audio is saved or uploaded.</p>
      <button className="button secondary" disabled={remaining !== null} onClick={() => { stop(); onReady?.(qualified.current); }}>Finish setup</button>
    </>}
    <div aria-live="polite">{results.map((r, i) => <p key={i}>{r}</p>)}</div>
    <details><summary>Missing Katana, noise, timing or channel trouble?</summary><p>On Windows 11 the official signed Roland KATANA 1.0.1 driver normally installs automatically. Check Windows Sound input devices first. If SECONDARY is absent here, refresh permissions and restart Chrome or Edge. A browser exposes Windows audio endpoints, not arbitrary ASIO channels. Channel 2 selects the right side of the chosen endpoint; it cannot turn PRIMARY into the dry path.</p><p>If only PRIMARY is accessible, explicitly choose it and use a clean amp patch with delay, reverb and modulation off; this changes the tone you hear. A DAW routing the dry ASIO input into a virtual Windows input is another option, but adds software and delay. RIFF never selects that workaround automatically. For a quiet dry signal, check BOSS Tone Studio → SYSTEM → USB SETTING → DRY OUT LEVEL.</p><p>Picking to a click cannot distinguish player lateness from recording delay. Timing stays provisional until an independent loopback measurement is available. Start with event counts, pitch and pulse consistency; do not treat the timing number as a technique diagnosis.</p><p><a href="https://www.boss.info/us/support/by_product/katana-50_mk2/updates_drivers/" target="_blank" rel="noreferrer">Official BOSS drivers</a> · <a href="https://support.roland.com/hc/en-us/articles/53315056447259-KATANA-HEAD-MkII-How-do-I-record-via-USB-into-my-DAW" target="_blank" rel="noreferrer">Official USB routing</a></p></details>
  </section>;
}
