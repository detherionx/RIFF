# Katana MkII hardware validation

## Setup observed on 2026-10-21

Windows 11 Home x64 (10.0.26300). USB VID_0582/PID_01D8 reports KATANA; the exact physical variant cannot be inferred from this device name. User confirms front-panel text “Katana MK II”. Signed Roland driver 1.0.1.0, oem2.inf, already installed. Windows exposes PRIMARY and SECONDARY capture and playback endpoints. No driver installation or firmware change performed.

Chromium in the local preview enumerates PRIMARY (KATANA) and SECONDARY (KATANA), independently of RODE NT-USB, NVIDIA Broadcast and the Realtek microphone. Device opening and instrument measurements are separate acceptance steps.

[Official driver 1.0.1 for Windows 10/11](https://www.boss.info/us/support/by_product/katana-100/updates_drivers/b203b755-260c-4902-acd0-df3b76d7d412/) normally installs automatically. [Official MkII routing](https://support.roland.com/hc/en-us/articles/53315056447259-KATANA-HEAD-MkII-How-do-I-record-via-USB-into-my-DAW) identifies PRIMARY as processed and SECONDARY as dry before preamp/effects. Select SECONDARY for analysis while monitoring the guitar directly through the amp. RIFF never monitors its input. Select laptop speakers/wired headphones for the metronome; USB PRIMARY playback does not feed the amp speaker. Avoid Bluetooth for timing work.

## Browser setup

Settings and the practice room expose Audio setup. Permission acquisition immediately stops its temporary default stream without analyzing it. Selection requires an exact device ID; mismatch, disappearance or unavailable channel fails closed. Channel selection splits the chosen endpoint's left/right channels; it is not arbitrary ASIO routing. Browser-reported channel count is checked. Preferences use a separate local key, `riff.input.v1`; calibration passes and test audio are not persisted. Existing progress stays under its original key and schema version.

Quiet baseline (3 seconds) then four isolated low E picks (8 seconds) are required before practice in that room. Silence, clipping, noise, pitch/count mismatch prevent passing. Closing or hiding setup releases capture and drops the quiet buffer. Finish setup releases capture before practice. Reconnect or device change requires rechecking. A simple passing check is not proof of detector accuracy for every note.

## Interactive protocol and acceptance

1. Mute strings for baseline: record noise RMS and false event count; require zero events and RMS below 0.003.
2. Open strings E2/A2/D3/G3/B3/E4, individually: four picks about two seconds apart, stopping each before the next. Compare four actual picks with event timestamps, durations and pitch matches. Repeat a discrepancy before attributing it to playing.
3. Fretted C3, string 5 fret 3: same four-pick test. Wrong measured pitch may be tuning, wrong string/fret or detector error. Check instruction comprehension and trusted tuner before a technique claim.
4. Sustain low E for five seconds after one pick. More than one event indicates either a new excitation or segmentation; manual observation distinguishes them.
5. Overlap E and A intentionally. Record observations only; monophonic output is not ground truth.
6. Pulse drill at 60 pulses/min, four picks on 1/3/5/7 after six count-in clicks. Compare event count and relative evenness twice. Return to the original bridge at its retained tempo; compare two attempts without generic speed reductions.
7. Absolute delay remains **unmeasured**. Human picking to clicks cannot calibrate it. Use an independently validated electrical/acoustic loopback route to measure end-to-end output/input delay before enabling absolute timing/mastery scores. Browser latency estimates are not this measurement. Never subtract a fitted playing offset and call it hardware latency.

Record actual measurements and user-confirmed pick counts here only with their consent; never commit raw audio/video. Until steps are performed, real-instrument detection, onset accuracy, false-positive rates, latency and technique remain unvalidated. Hardware checks retain at most 20 text results in component memory and no playable audio. Practice audio remains ephemeral with explicit optional audio export; camera is opt-in, silent, memory-only, bounded and discarded on hide/exit/replacement.

If SECONDARY is absent: check Windows input visibility/permissions, close exclusive audio clients, refresh or restart Chrome/Edge. PRIMARY with effects disabled is an explicit fallback, changing the monitored tone. A DAW/virtual endpoint can route ASIO dry audio but adds software, latency and another gain stage; not installed automatically. Low dry level: [BOSS USB level guidance](https://support.roland.com/hc/en-us/articles/22194255491227-KATANA-MKII-amp-series-USB-output-recording-level-is-low), SYSTEM → USB SETTING → DRY OUT LEVEL.

## Model decision

Keep the existing deterministic YIN pipeline pending these real tests. The retained browser benchmark compares YIN and Basic Pitch CPU on four synthetic fixtures, not this instrument. Basic Pitch had 16–22 false extra events and roughly eight seconds processing per four-second pitched fixture; YIN was faster with fewer false extras in that limited test. No cloud AI or runtime model dependency is added. Revisit model choice with a consented, annotated local guitar corpus; see `benchmarks/README.md` for reproducible measurements and limitations.
