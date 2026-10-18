# RIFF learning model

First Light is an original beginner fingerstyle study in E minor, written for RIFF. Its eight bars follow Em–C–G–D–Em–C–D–Em. The bass, individual voices, arpeggios and changes appear earlier in the six-stage path, so the final performance combines familiar material. Standard guitar tuning is E2 A2 D3 G3 B3 E4; string 1 is the thin E.

## Time convention

Every `beat` and `duration` is an **eighth-note pulse**. `bpm` means eighth-note pulses per minute, not quarter notes or dotted quarters. A 6/8 bar contains six pulses and two groups of three; a 100 pulse/minute exercise has 600 ms between consecutive eighth notes. A quarter-note metronome would show 50 BPM; a dotted-quarter metronome about 33⅓ BPM. Display this distinction anywhere tempo is shown. Absolute seconds are `beat * 60 / bpm`; the final study is 48 pulses. Some gym exercises are free-standing patterns rather than complete bars.

## Progress decisions

`initialProgress()` returns fresh state. `recordAttempt` is immutable, rejects duplicate IDs and malformed dates/tempos, and keeps the latest 500 attempts. Full-exercise takes scoring at least 85 with medium or high confidence add 30 mastery points; lower trusted scores subtract 10. Three successful takes reach the 80-point prerequisite threshold. Low confidence and null scores never increase or decrease demonstrated mastery. This is a transparent practice heuristic, not a validated educational assessment.

Prerequisites form a directed graph: string navigation unlocks independence, rhythm and theory; theory unlocks intervals; independence plus rhythm unlock arpeggios; intervals plus arpeggios unlock changes; changes unlock muting, then performance. Learners may explore any exercise, but cannot gain mastery in a dependent skill before its foundations are demonstrated.

Two consecutive clean takes of the same exercise at the same pulse earn a five-pulse increase. A poor take reduces the suggested pulse. `weakestTransition` is the **zero-based destination note index**, from 1 through notes.length−1. `getExercise` resolves `<exercise-id>-transition-<index>` into four slow repetitions of the failing pair. Two clean bridge takes return to the full source phrase. Bridge scores never inflate mastery for the whole skill. Interval errors use the same targeted mechanism.

Successful full takes schedule review after 1, 3, 7, then 14 days; an unsuccessful trusted take schedules a next-day review. Recommendation priority is immediate recording correction or remediation, then due review, then the first accessible unmastered skill, then the full study. Sessions of five minutes or less receive an explicit single-exercise focus. This version does not predict fatigue or infer a detailed psychological learner model.

## Assessment boundaries

Exercises ask for one note at a time. For scored arpeggios and the final study, damp the preceding note; ringing playback is available as unscored review. Power-pair practice teaches roots and fifths sequentially; simultaneous power chords are not graded. Palm-muting practice invites the learner to listen to muted/unmuted contrast, while automatic evidence covers only detectable pitch and timing. The app cannot establish hand posture, fretting pressure, artistic expression or muting quality from this pitch detector. A noisy or unsupported recording must remain inconclusive.

## Theory games

Five modes save separate quiz events: note navigation, interval hearing, scale construction, rhythm tapping and chord construction. Four accurate answers increase each mode's difficulty, up to level 3. Higher levels hide fretboard labels and expand the neck, add interval choices, transpose natural minor scales, introduce major chords, or increase the rhythm pulse while narrowing timing tolerance. Incorrect answers retain the same question for retry. Quiz answers never substitute for observed guitar-playing mastery. A theory mistake can recommend its related playing exercise once prerequisites are ready.

Rhythm tapping compares browser audio-context timestamps against the actual scheduled metronome start, including its initial scheduling delay and six-pulse count-in. The game scores twelve taps; double-speed tapping and delayed tapping are errors rather than silently realigned performances. Device output latency can still affect timing; no physiological interpretation is made.

Run the executable learning checks with `npm test`.
