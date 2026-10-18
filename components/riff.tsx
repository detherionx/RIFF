"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  Route,
  Dumbbell,
  AudioLines,
  BookOpen,
  ChartNoAxesCombined,
  Settings2,
  SlidersHorizontal,
  Check,
  Clock3,
  LockKeyhole,
  ChevronRight,
  Headphones,
  Guitar,
  X,
  Menu,
  Download,
  Cloud,
  Trash2,
  RotateCcw,
  Flame,
  CircleHelp,
} from "lucide-react";
import { exercises, getExercise, stages, skills } from "@/lib/curriculum";
import { initialProgress, recordAttempt, recommend } from "@/lib/learning";
import type { Attempt, Profile, Progress } from "@/lib/types";
import {
  download,
  readProgress,
  saveProgress,
  validProgress,
} from "@/lib/storage";
import Practice from "./practice";
import Theory from "./theory";
import Tuner from "./tuner";
type Page =
  "journey" | "daily" | "theory" | "gym" | "progress" | "tuner" | "settings";
const navigation = [
  { id: "journey", label: "Song Journey", icon: Route },
  { id: "daily", label: "Daily Gym", icon: Flame },
  { id: "theory", label: "Theory Lab", icon: BookOpen },
  { id: "gym", label: "Technique Gym", icon: Dumbbell },
  { id: "progress", label: "Your Progress", icon: ChartNoAxesCombined },
] as const;
export default function Riff() {
  const [page, setPage] = useState<Page>("journey"),
    [progress, setProgress] = useState<Progress>(initialProgress),
    [loaded, setLoaded] = useState(false),
    [saveError, setSaveError] = useState(""),
    [unreadableSave, setUnreadableSave] = useState<string | null>(null),
    [onboarding, setOnboarding] = useState(false),
    [selected, setSelected] = useState<{
      id: string;
      bpm?: number;
      key: number;
    } | null>(null),
    [mobile, setMobile] = useState(false),
    [cloudMessage, setCloudMessage] = useState(""),
    [cloudBusy, setCloudBusy] = useState(false),
    [reset, setReset] = useState(false);
  useEffect(() => {
    try {
      setProgress(readProgress() || initialProgress());
    } catch (e) {
      try {
        setUnreadableSave(localStorage.getItem("riff.progress.v1"));
      } catch {}
      setSaveError(
        e instanceof Error
          ? e.message
          : "This browser could not load saved progress.",
      );
    }
    setLoaded(true);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  function update(next: Progress, replaceUnreadable = false) {
    setProgress(next);
    if (unreadableSave !== null && !replaceUnreadable) return;
    try {
      saveProgress(next);
      if (replaceUnreadable) setUnreadableSave(null);
      setSaveError("");
    } catch {
      setSaveError(
        "This browser could not save progress. Export a copy before closing this tab.",
      );
    }
  }
  function attempt(a: Attempt) {
    setProgress((p) => {
      const next = recordAttempt(p, a);
      try {
        if (unreadableSave === null) saveProgress(next);
      } catch {
        setSaveError("Progress could not be saved. Export a copy in Settings.");
      }
      return next;
    });
  }
  function navigate(next: Page) {
    setPage(next);
    setSelected(null);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function select(id: string, bpm?: number) {
    setSelected({ id, bpm, key: Date.now() });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const next = recommend(progress, progress.profile?.minutes || 10),
    nextExercise = getExercise(next.exerciseId) || exercises[0],
    readiness = Math.round(
      skills.reduce((sum, s) => sum + (progress.mastery[s.id]?.value || 0), 0) /
        skills.length,
    ),
    minutes = Math.round(
      progress.attempts.reduce((sum, a) => sum + a.seconds, 0) / 60,
    ),
    practiceDays = new Set(
      progress.attempts.map((a) => new Date(a.at).toLocaleDateString()),
    ).size;
  function begin() {
    if (!progress.profile) setOnboarding(true);
    else select(next.exerciseId, next.bpm);
  }
  async function cloud(action: "save" | "restore" | "delete") {
    setCloudBusy(true);
    setCloudMessage("");
    try {
      let token = localStorage.getItem("riff.backup.token");
      if (!token && action === "save") {
        const r = await fetch("/api/cloud/sessions", { method: "POST" });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || "Backup unavailable.");
        token = data.token;
        localStorage.setItem("riff.backup.token", token!);
      }
      if (!token) throw new Error("No backup is linked to this browser.");
      const r = await fetch(
        "/api/cloud/" + (action === "delete" ? "account" : "progress"),
        {
          method:
            action === "save" ? "PUT" : action === "delete" ? "DELETE" : "GET",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          ...(action === "save" ? { body: JSON.stringify({ progress }) } : {}),
        },
      );
      if (!r.ok) {
        const body = await r.json();
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : "Backup request failed. Your local progress is safe.",
        );
      }
      if (action === "restore") {
        const data = await r.json();
        if (!validProgress(data.progress))
          throw new Error("There is no valid progress in this backup.");
        update(data.progress, true);
      }
      if (action === "delete") localStorage.removeItem("riff.backup.token");
      setCloudMessage(
        action === "save"
          ? "Progress backed up. No recordings were sent."
          : action === "restore"
            ? "Backup restored on this device."
            : "Cloud backup deleted. Local progress remains.",
      );
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : "Backup unavailable.");
    } finally {
      setCloudBusy(false);
    }
  }
  const current = getExercise(selected?.id || "");
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a
          href="/"
          className="wordmark"
          aria-label="RIFF home"
          onClick={(e) => {
            e.preventDefault();
            navigate("journey");
          }}
        >
          RIFF<span>®</span>
        </a>
        <div className="studio-label">YOUR PERSONAL GUITAR STUDIO</div>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={!selected && page === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              {n.label}
              {n.id === "journey" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Headphones size={21} />
            <p>
              A little practice.
              <br />
              <strong>A little closer.</strong>
            </p>
            <span>
              {progress.profile?.minutes || 10} minutes is a good start.
            </span>
          </div>
          <button className="utility" onClick={() => navigate("tuner")}>
            <SlidersHorizontal size={19} /> Tuner{" "}
            <span className="shortcut">E A D G B E</span>
          </button>
          <button className="utility" onClick={() => navigate("settings")}>
            <Settings2 size={19} /> Settings
          </button>
          <div className="local-badge">
            <span className="status-dot live" /> Your sound stays yours
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Toggle navigation"
            aria-expanded={mobile}
            onClick={() => setMobile((m) => !m)}
          >
            {mobile ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="breadcrumb">
            MY STUDIO <ChevronRight size={12} />{" "}
            <span>
              {selected
                ? "PRACTICE ROOM"
                : page === "tuner"
                  ? "TUNER"
                  : page === "settings"
                    ? "SETTINGS"
                    : navigation
                        .find((n) => n.id === page)
                        ?.label.toUpperCase()}
            </span>
          </div>
          <div className="topbar-right">
            <span className="small muted">
              <span className="status-dot live" /> LOCAL FIRST
            </span>
            <button
              className="avatar"
              aria-label="Open your profile"
              onClick={() => setOnboarding(true)}
            >
              <Guitar size={18} />
            </button>
          </div>
        </header>
        <main>
          {saveError && (
            <div className="error" role="alert">
              {saveError}
              {unreadableSave !== null && (
                <>
                  <p>
                    New practice stays temporary until you import a valid save
                    or explicitly reset in Settings. Your original save is
                    preserved.
                  </p>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        "riff-recovery.txt",
                        new Blob([unreadableSave], { type: "text/plain" }),
                      )
                    }
                  >
                    Export unreadable save <Download size={16} />
                  </button>
                </>
              )}
            </div>
          )}
          {!loaded ? (
            <div className="loading-state">
              <div className="wordmark">RIFF</div>
              <p>Opening your studio…</p>
            </div>
          ) : selected && current ? (
            <Practice
              key={selected.key}
              exercise={current}
              initialBpm={selected.bpm}
              progress={progress}
              onAttempt={attempt}
              onBack={() => setSelected(null)}
              onSelect={select}
            />
          ) : (
            <>
              {page === "journey" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">YOUR MUSIC. YOUR PACE.</div>
                      <h1>Find your rhythm.</h1>
                      <p className="lede">
                        Big songs start with small moments. Make one today.
                      </p>
                    </div>
                    <button
                      className="button secondary compact"
                      onClick={() => navigate("tuner")}
                    >
                      <SlidersHorizontal size={17} /> Tune up
                    </button>
                  </div>
                  <section className="journey-hero">
                    <div className="hero-copy">
                      <span className="hero-kicker">
                        <i /> YOUR SONG JOURNEY <span>01</span>
                      </span>
                      <h2>
                        First Light<span>An E minor study.</span>
                      </h2>
                      <p>
                        Quiet strings. A little tension. Then everything falls
                        into place. Your first complete fingerstyle piece starts
                        here.
                      </p>
                      <div className="hero-tags">
                        <span>ORIGINAL STUDY</span>
                        <span>FINGERSTYLE</span>
                        <span>6/8 TIME</span>
                      </div>
                      <button className="button cream" onClick={begin}>
                        {progress.attempts.length
                          ? "Continue your journey"
                          : "Start your journey"}{" "}
                        <ArrowRight size={19} />
                      </button>
                      <span className="hero-footnote">
                        {progress.profile
                          ? "Working toward " + progress.profile.goal
                          : "Inspired by the music that made you pick up a guitar."}
                      </span>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="vinyl">
                        <div className="vinyl-center">
                          <span>RIFF ORIGINALS</span>
                          <strong>
                            First
                            <br />
                            Light
                          </strong>
                          <small>E MINOR / VOL. 01</small>
                          <i />
                        </div>
                      </div>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <div key={n} className={"art-string s" + n} />
                      ))}
                      <div className="record-label">
                        SIDE A <span>01 — BEGIN AGAIN</span>
                      </div>
                    </div>
                  </section>
                  <div className="dashboard-grid">
                    <section className="next-session">
                      <div className="section-heading">
                        <span className="eyebrow">PICK UP WHERE YOU ARE</span>
                        <span className="session-duration">
                          <Clock3 size={14} />
                          {progress.profile?.minutes || 10} MIN SESSION
                        </span>
                      </div>
                      <div className="session-content">
                        <div className="session-art">
                          <AudioLines size={35} />
                          <span>
                            {nextExercise.stage.toString().padStart(2, "0")}
                          </span>
                        </div>
                        <div>
                          <h3>{nextExercise.title}</h3>
                          <p>{nextExercise.subtitle}</p>
                          <span className="small muted">
                            {next.mode.toUpperCase()} · {next.bpm} PULSES/MIN
                          </span>
                        </div>
                        <button
                          className="round-play"
                          aria-label={"Practice " + nextExercise.title}
                          onClick={begin}
                        >
                          <Play size={20} fill="currentColor" />
                        </button>
                      </div>
                      <div className="session-reason">
                        <span className="tiny-mark">r</span>
                        {next.reason}
                      </div>
                    </section>
                    <section className="readiness-card">
                      <div className="section-heading">
                        <span className="eyebrow">YOUR READINESS</span>
                        <ArrowUpRight size={17} />
                      </div>
                      <div className="readiness-main">
                        <strong>
                          {readiness}
                          <small>%</small>
                        </strong>
                        <p>
                          {readiness === 0
                            ? "Every great player started right here."
                            : "Built from your actual practice."}
                        </p>
                      </div>
                      <div className="segmented-progress">
                        {Array.from({ length: 25 }, (_, i) => (
                          <i
                            key={i}
                            className={
                              i < Math.round(readiness / 4) ? "filled" : ""
                            }
                          />
                        ))}
                      </div>
                      <span className="small muted">
                        {
                          skills.filter(
                            (s) => (progress.mastery[s.id]?.value || 0) >= 80,
                          ).length
                        }{" "}
                        of {skills.length} skills feeling solid
                      </span>
                    </section>
                  </div>
                  <section className="roadmap">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">
                          FROM FIRST NOTE TO FULL SONG
                        </span>
                        <h2>Your path to First Light</h2>
                      </div>
                      <span className="small muted">
                        6 stages · Your own pace
                      </span>
                    </div>
                    <div className="stage-grid">
                      {stages.map((stage, i) => {
                        const items = exercises.filter(
                            (e) => e.stage === stage.id,
                          ),
                          done =
                            items.length > 0 &&
                            items.every(
                              (e) =>
                                (progress.mastery[e.skill]?.value || 0) >= 80,
                            ),
                          isCurrent = stage.id === nextExercise.stage;
                        return (
                          <button
                            className={
                              "stage-card " +
                              (isCurrent ? "current " : "") +
                              (done ? "done" : "")
                            }
                            key={stage.id}
                            onClick={() =>
                              select(
                                (isCurrent ? nextExercise : items[0]).id,
                                isCurrent ? next.bpm : undefined,
                              )
                            }
                          >
                            <div className="stage-top">
                              <span>
                                {done ? (
                                  <Check size={18} />
                                ) : (
                                  String(i + 1).padStart(2, "0")
                                )}
                              </span>
                              <span>
                                {done
                                  ? "SOLID"
                                  : isCurrent
                                    ? "UP NEXT"
                                    : items.length + " LESSONS"}
                              </span>
                            </div>
                            <div
                              className={"stage-symbol symbol-" + i}
                              aria-hidden="true"
                            >
                              {
                                [
                                  <AudioLines key="a" />,
                                  <Dumbbell key="b" />,
                                  <BookOpen key="c" />,
                                  <Guitar key="d" />,
                                  <Route key="e" />,
                                  <Headphones key="f" />,
                                ][i]
                              }
                            </div>
                            <h3>{stage.title}</h3>
                            <p>{stage.description}</p>
                            <span className="stage-link">
                              {isCurrent ? "Let’s begin" : "Explore stage"}{" "}
                              <ArrowUpRight size={15} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="bottom-strip">
                    <div>
                      <span className="eyebrow">
                        TEN MINUTES, JUST FOR YOU.
                      </span>
                      <h3>No big plan. Just pick up your guitar.</h3>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("daily")}
                    >
                      Open Daily Gym <ArrowRight size={17} />
                    </button>
                  </section>
                </>
              )}
              {page === "daily" && (
                <>
                  <div className="eyebrow">SMALL SESSIONS. LASTING CHANGE.</div>
                  <h1>Make today count.</h1>
                  <p className="lede">
                    A focused session, chosen from what your playing tells us.
                  </p>
                  <div className="daily-lead">
                    <div>
                      <span className="eyebrow">
                        YOUR {progress.profile?.minutes || 10}-MINUTE SESSION
                      </span>
                      <h2>{nextExercise.title}</h2>
                      <p>{next.reason}</p>
                      <button className="button primary" onClick={begin}>
                        Start focused practice <ArrowRight size={18} />
                      </button>
                    </div>
                    <div className="daily-number">
                      {progress.profile?.minutes || 10}
                      <span>MINUTES / JUST YOU & THE STRINGS</span>
                    </div>
                  </div>
                  <div className="section-heading">
                    <h2>Today’s set list</h2>
                    <span className="muted small">Adapts after every take</span>
                  </div>
                  <div className="set-list">
                    {[
                      nextExercise,
                      ...exercises.filter(
                        (e) =>
                          e.id !== nextExercise.id &&
                          (e.skill === "rhythm" || e.skill === "arpeggios"),
                      ),
                    ]
                      .slice(0, (progress.profile?.minutes || 10) <= 5 ? 2 : 3)
                      .map((e, i) => (
                        <button
                          key={e.id}
                          onClick={() =>
                            select(e.id, i === 0 ? next.bpm : undefined)
                          }
                        >
                          <span className="set-number">0{i + 1}</span>
                          <div>
                            <h3>{e.title}</h3>
                            <p>{i === 0 ? next.reason : e.why}</p>
                          </div>
                          <span className="pill">
                            {i === 0 ? "FOCUS" : "CONSOLIDATE"}
                          </span>
                          <Play size={20} />
                        </button>
                      ))}
                  </div>
                  <p className="privacy-note">
                    The time is a practice budget. Repeat the focused phrase
                    until it feels more consistent; stop whenever you need to.
                  </p>
                </>
              )}
              {page === "theory" && (
                <Theory progress={progress} onAttempt={attempt} />
              )}
              {page === "gym" && (
                <>
                  <div className="eyebrow">BETTER HANDS. BETTER MUSIC.</div>
                  <h1>Put in the good work.</h1>
                  <p className="lede">
                    Technique with a purpose. Every repetition leads somewhere.
                  </p>
                  <div className="exercise-grid">
                    {exercises
                      .filter((e) => e.skill !== "performance")
                      .map((e, i) => (
                        <button
                          className="exercise-card"
                          key={e.id}
                          onClick={() => select(e.id)}
                        >
                          <div className="section-heading">
                            <span className="eyebrow">
                              {e.skill.toUpperCase()}
                            </span>
                            <span className="mono muted">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="exercise-strings" aria-hidden="true">
                            {e.notes.slice(0, 8).map((n, j) => (
                              <span
                                key={j}
                                style={{
                                  height: 25 + (n.midi - 40) * 2 + "px",
                                }}
                              />
                            ))}
                          </div>
                          <h3>{e.title}</h3>
                          <p>{e.subtitle}</p>
                          <div className="exercise-footer">
                            <span>{e.bpm} pulses/min</span>
                            <ArrowUpRight size={20} />
                          </div>
                        </button>
                      ))}
                  </div>
                </>
              )}
              {page === "progress" && (
                <>
                  <div className="eyebrow">
                    THE EVIDENCE IS IN YOUR PLAYING.
                  </div>
                  <h1>A little closer.</h1>
                  <p className="lede">
                    No invented streaks. Just the work you’ve put in.
                  </p>
                  <div className="stat-grid">
                    <div>
                      <strong>{progress.attempts.length}</strong>
                      <span>Practice attempts</span>
                    </div>
                    <div>
                      <strong>
                        {minutes}
                        <small> min</small>
                      </strong>
                      <span>Time practicing</span>
                    </div>
                    <div>
                      <strong>{practiceDays}</strong>
                      <span>Days with music</span>
                    </div>
                    <div>
                      <strong>
                        {readiness}
                        <small>%</small>
                      </strong>
                      <span>Study readiness</span>
                    </div>
                  </div>
                  <div className="progress-columns">
                    <section className="panel">
                      <h2>Your skills</h2>
                      {skills.map((s) => {
                        const m = progress.mastery[s.id];
                        return (
                          <div className="skill-row" key={s.id}>
                            <div>
                              <span>{s.title}</span>
                              <strong>{Math.round(m?.value || 0)}%</strong>
                            </div>
                            <div className="progress-track">
                              <i style={{ width: (m?.value || 0) + "%" }} />
                            </div>
                            <small className="muted">
                              {m?.attempts
                                ? m.attempts +
                                  " attempts · best " +
                                  m.bestBpm +
                                  " pulses/min" +
                                  (m.reviewAt
                                    ? " · review " +
                                      new Date(m.reviewAt).toLocaleDateString()
                                    : "")
                                : "Ready for your first take"}
                            </small>
                          </div>
                        );
                      })}
                    </section>
                    <section className="panel">
                      <h2>Recent moments</h2>
                      {!progress.attempts.length ? (
                        <div className="empty-state">
                          <AudioLines size={36} />
                          <h3>Your first note belongs here.</h3>
                          <p>
                            Play a phrase or explore the Theory Lab to start
                            building your history.
                          </p>
                          <button className="button primary" onClick={begin}>
                            Start playing <ArrowRight size={17} />
                          </button>
                        </div>
                      ) : (
                        progress.attempts
                          .slice(-8)
                          .reverse()
                          .map((a) => (
                            <div className="history-row" key={a.id}>
                              <div>
                                <strong>
                                  {getExercise(a.exerciseId)?.title ||
                                    a.exerciseId.replace(
                                      "theory-",
                                      "Theory · ",
                                    )}
                                </strong>
                                <span>
                                  {new Date(a.at).toLocaleDateString()} ·{" "}
                                  {a.evidence.confidence} confidence
                                </span>
                              </div>
                              <b>
                                {a.evidence.score === null
                                  ? "—"
                                  : a.evidence.score}
                              </b>
                            </div>
                          ))
                      )}
                    </section>
                  </div>
                </>
              )}
              {page === "tuner" && <Tuner />}
              {page === "settings" && (
                <>
                  <div className="eyebrow">YOUR STUDIO. YOUR RULES.</div>
                  <h1>Keep it yours.</h1>
                  <p className="lede">
                    Private by default. Portable when you need it.
                  </p>
                  <div className="settings-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Your starting point</h2>
                        <Guitar size={22} />
                      </div>
                      <p className="muted">
                        {progress.profile
                          ? (progress.profile.experience === "returning"
                              ? "Returning player"
                              : "New player") +
                            " · " +
                            progress.profile.instrument +
                            " guitar · " +
                            progress.profile.minutes +
                            " minutes a day"
                          : "Set your instrument, musical goal and practice time."}
                      </p>
                      <p>
                        {progress.profile?.goal ||
                          "First Light — an original E-minor study"}
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => setOnboarding(true)}
                      >
                        Edit your profile <ArrowRight size={17} />
                      </button>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>On this device</h2>
                        <LockKeyhole size={22} />
                      </div>
                      <p className="muted">
                        Progress is saved in this browser. Recordings are
                        temporary and never uploaded. Export progress before
                        clearing browser data or moving devices.
                      </p>
                      <div className="button-row">
                        <button
                          className="button secondary"
                          onClick={() =>
                            download(
                              "riff-progress.json",
                              new Blob([JSON.stringify(progress, null, 2)], {
                                type: "application/json",
                              }),
                            )
                          }
                        >
                          <Download size={17} /> Export progress
                        </button>
                        <label className="button secondary">
                          <RotateCcw size={17} /> Import progress
                          <input
                            type="file"
                            accept="application/json"
                            className="sr-only"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                if (file.size > 1048576)
                                  throw new Error(
                                    "Choose a progress file smaller than 1 MiB.",
                                  );
                                const data = JSON.parse(await file.text());
                                if (!validProgress(data))
                                  throw new Error(
                                    "This is not a valid RIFF progress file.",
                                  );
                                update(data, true);
                                setCloudMessage("Progress imported.");
                              } catch (err) {
                                setCloudMessage(
                                  err instanceof Error
                                    ? err.message
                                    : "Import failed.",
                                );
                              }
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Optional cloud backup</h2>
                        <Cloud size={22} />
                      </div>
                      <p className="muted">
                        Only your profile, scores and mastery are sent to RIFF’s
                        private database when you press Back up. No audio or
                        video. This browser holds the private key to your
                        backup.
                      </p>
                      <div className="button-row">
                        <button
                          disabled={cloudBusy}
                          className="button primary"
                          onClick={() => void cloud("save")}
                        >
                          {cloudBusy ? "Working…" : "Back up progress"}
                        </button>
                        <button
                          disabled={cloudBusy}
                          className="button secondary"
                          onClick={() => void cloud("restore")}
                        >
                          Restore backup
                        </button>
                      </div>
                      <button
                        disabled={cloudBusy}
                        className="text-button danger"
                        onClick={() => void cloud("delete")}
                      >
                        <Trash2 size={15} /> Delete cloud backup
                      </button>
                      <p className="small muted">
                        Restore replaces local progress with the last backup.
                        Export first if you want to keep both.
                      </p>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>A clean slate</h2>
                        <Settings2 size={22} />
                      </div>
                      <p className="muted">
                        Reset removes progress from this browser. Download an
                        export first if you might want it back. It does not
                        delete your cloud backup.
                      </p>
                      <button
                        className="button secondary danger"
                        onClick={() =>
                          reset
                            ? (update(initialProgress(), true), setReset(false))
                            : setReset(true)
                        }
                      >
                        {reset
                          ? "Confirm: reset local progress"
                          : "Reset local progress"}
                      </button>
                      {reset && (
                        <button
                          className="text-button"
                          onClick={() => setReset(false)}
                        >
                          Cancel
                        </button>
                      )}
                    </section>
                  </div>
                  {cloudMessage && (
                    <p role="status" className="feedback">
                      {cloudMessage}
                    </p>
                  )}
                  <div className="about-note">
                    <CircleHelp size={20} />
                    <p>
                      RIFF v0.1 · Built around measurable progress. Pitch and
                      rhythm analysis work best on clean, single-note playing.
                      Camera review is manual. No AI API is required, and no
                      commercial recordings or transcriptions are included.
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </main>
        <footer className="footer">
          <span className="mini-wordmark">RIFF</span>
          <span>LESS SCROLLING. MORE STRINGS.</span>
          <span>
            <LockKeyhole size={12} /> Designed to listen. Built to respect your
            privacy.
          </span>
        </footer>
      </div>
      <AnimatePresence>
        {onboarding && (
          <Onboarding
            profile={progress.profile}
            onClose={() => setOnboarding(false)}
            onComplete={(profile, assess) => {
              update({ ...progress, profile });
              setOnboarding(false);
              select(
                assess ? "first-light-bass" : next.exerciseId,
                assess ? 70 : next.bpm,
              );
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
function Onboarding({
  profile,
  onComplete,
  onClose,
}: {
  profile: Profile | null;
  onComplete: (p: Profile, assessment: boolean) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0),
    [p, setP] = useState<Profile>(
      profile || {
        instrument: "electric",
        experience: "returning",
        styles: ["Rock", "Metal"],
        goal: "Nothing Else Matters — Metallica",
        minutes: 10,
      },
    );
  useEffect(() => {
    const target =
      step === 1
        ? document.getElementById("goal")
        : document.querySelector<HTMLElement>(".onboarding .modal-close");
    target?.focus();
  }, [step]);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      document
        .querySelector<HTMLElement>('[aria-label="Open your profile"]')
        ?.focus();
    };
  }, []);
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        className="onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const elements = e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
            );
            const first = elements[0],
              last = elements[elements.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <button
          autoFocus
          className="modal-close icon-button"
          aria-label="Close setup"
          onClick={onClose}
        >
          <X size={22} />
        </button>
        <span className="wordmark">
          RIFF<span>®</span>
        </span>
        <div className="eyebrow">LET’S MAKE THIS YOURS · {step + 1} / 2</div>
        <h2 id="welcome-title">
          {step === 0
            ? "Welcome back to the strings."
            : "What are you playing toward?"}
        </h2>
        <p className="muted">
          {step === 0
            ? "No starting over. Just starting from where you are."
            : "Your goal gives every small exercise a reason."}
        </p>
        {step === 0 ? (
          <>
            <fieldset>
              <legend>What’s in your hands?</legend>
              <div className="choice-grid">
                {(["electric", "acoustic"] as const).map((v) => (
                  <button
                    className={p.instrument === v ? "chosen" : ""}
                    aria-pressed={p.instrument === v}
                    key={v}
                    onClick={() => setP({ ...p, instrument: v })}
                  >
                    <Guitar size={24} />
                    {v === "electric" ? "Electric guitar" : "Acoustic guitar"}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Your experience</legend>
              <div className="choice-grid">
                {(["new", "returning"] as const).map((v) => (
                  <button
                    className={p.experience === v ? "chosen" : ""}
                    aria-pressed={p.experience === v}
                    key={v}
                    onClick={() => setP({ ...p, experience: v })}
                  >
                    {v === "new" ? "My first guitar" : "Finding my way back"}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>The music you love</legend>
              <div className="style-options">
                {["Rock", "Metal", "Blues", "Acoustic", "Indie"].map(
                  (style) => (
                    <button
                      key={style}
                      className={p.styles.includes(style) ? "chosen" : ""}
                      aria-pressed={p.styles.includes(style)}
                      onClick={() =>
                        setP({
                          ...p,
                          styles: p.styles.includes(style)
                            ? p.styles.filter((s) => s !== style)
                            : [...p.styles, style],
                        })
                      }
                    >
                      {style}
                    </button>
                  ),
                )}
              </div>
            </fieldset>
            <button
              className="button primary full-width"
              onClick={() => setStep(1)}
            >
              Find my direction <ArrowRight size={18} />
            </button>
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="goal">
              One day, I want to play…
            </label>
            <input
              id="goal"
              value={p.goal}
              maxLength={200}
              onChange={(e) => setP({ ...p, goal: e.target.value })}
            />
            <div className="goal-options">
              {[
                "Nothing Else Matters — Metallica",
                "Ohne dich — Rammstein",
                "My first complete fingerstyle piece",
              ].map((g) => (
                <button key={g} onClick={() => setP({ ...p, goal: g })}>
                  {g}
                </button>
              ))}
            </div>
            <p className="small muted">
              Commercial songs are aspirations. Your working lessons use First
              Light, our original study. No licensed song content is bundled.
            </p>
            <fieldset>
              <legend>Time for yourself each day</legend>
              <div className="style-options">
                {[5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    className={p.minutes === n ? "chosen" : ""}
                    onClick={() => setP({ ...p, minutes: n })}
                  >
                    {n} min
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              disabled={!p.goal.trim()}
              className="button primary full-width"
              onClick={() => onComplete(p, true)}
            >
              Find my starting point <ArrowRight size={18} />
            </button>
            <p className="small muted">
              A short recorded bass phrase checks note accuracy and timing. Your
              results set the next exercise.
            </p>
            <button
              disabled={!p.goal.trim()}
              className="text-button"
              onClick={() => onComplete(p, false)}
            >
              Skip assessment and start playing <ChevronRight size={16} />
            </button>
            <button className="text-button" onClick={() => setStep(0)}>
              Back
            </button>
          </>
        )}
      </motion.section>
    </motion.div>
  );
}
