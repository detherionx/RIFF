# First Light reference audio

[`public/first-light.wav`](../public/first-light.wav) is an original synthesized performance of RIFF's eight-bar study, generated directly from `first-light-study` in [`lib/curriculum.ts`](../lib/curriculum.ts). It contains all 48 notes at 100 eighth-note pulses per minute in 6/8: Em · C · G · D · Em · C · D · Em. Phrase duration is 28.8 seconds; the 0.8-second release makes the file 29.6 seconds.

The renderer uses deterministic Karplus–Strong-style string synthesis, a fractional delay, a short pluck attack, natural decays, pulse accents and a gradual rise toward bar six before softening. It is a synthetic pitch/rhythm/dynamics reference, not a recording of a guitarist or evidence of physical technique. Notes overlap naturally; use listening-review mode when playing along with the ringing arrangement. For scored takes, release each note before the next.

No recordings, commercial song transcriptions, external sample libraries, generative media services or downloaded models were used. The notes and renderer are original project material. The generator's fixed random seed makes regeneration reproducible from the same curriculum and runtime.

Run from the repository root:

```sh
npx tsx scripts/render-study.mjs
```

Output is 44.1 kHz, mono, signed 16-bit PCM WAV; the peak is normalized to 0.86 of full scale. The command checks note count, finite samples and non-silence and prints duration, byte count and SHA-256. The public URL is `/first-light.wav`.

This is a musical reference and synthetic test material. It is not a real-guitar benchmark: it lacks microphone coloration, room acoustics, amplifier distortion, fret noise, inconsistent attacks and human timing. Current detector tests cannot substantiate accuracy on live performances. A consented and annotated guitar recording set is still required before reporting real-world performance figures.
