import { useCallback, useMemo, useState } from "react";
import { QUESTIONS } from "./data/questions";
import { buildDailyTask, DAILY_SIZE } from "./lib/recommend";
import { applyAnswer } from "./lib/review";
import * as store from "./lib/storage";
import type { AnswerMode, AnswerRecord, DailyTask, Profile, ReviewState } from "./types";
import Today from "./pages/Today";
import Quiz from "./pages/Quiz";
import Result from "./pages/Result";
import WrongBook from "./pages/WrongBook";
import Stats from "./pages/Stats";

type Route = "today" | "quiz" | "result" | "wrong" | "stats";

interface Session {
  ids: string[];
  mode: AnswerMode;
  results: AnswerRecord[];
}

export default function App() {
  const [route, setRoute] = useState<Route>("today");
  const [profile, setProfile] = useState<Profile>(() => store.loadProfile());
  const [records, setRecords] = useState<AnswerRecord[]>(() => store.loadRecords());
  const [reviews, setReviews] = useState<Record<string, ReviewState>>(() => store.loadReviews());
  const [session, setSession] = useState<Session | null>(null);

  const today = store.todayStr();

  const task: DailyTask = useMemo(() => {
    const existing = store.loadTask(today);
    if (existing && existing.questionIds.length > 0) return existing;
    const ids = buildDailyTask({ questions: QUESTIONS, records, reviews, profile });
    const built: DailyTask = { date: today, questionIds: ids, completed: [] };
    store.saveTask(built);
    return built;
    // 只在当天首次进入时计算；records/reviews 变化不会重算（当天任务固定）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const wrongIds = useMemo(() => {
    const last = new Map<string, AnswerRecord>();
    records.forEach((r) => {
      const prev = last.get(r.questionId);
      if (!prev || r.answeredAt >= prev.answeredAt) last.set(r.questionId, r);
    });
    return [...last.values()].filter((r) => !r.isCorrect).map((r) => r.questionId);
  }, [records]);

  const startSession = useCallback((ids: string[], mode: AnswerMode) => {
    setSession({ ids, mode, results: [] });
    setRoute("quiz");
  }, []);

  const handleAnswer = useCallback(
    (record: AnswerRecord) => {
      store.appendRecord(record);
      setRecords((prev) => [...prev, record]);

      const nextReviews = { ...reviews };
      nextReviews[record.questionId] = applyAnswer(reviews[record.questionId], record.questionId, record.isCorrect);
      store.saveReviews(nextReviews);
      setReviews(nextReviews);

      setProfile((prevProfile) => {
        const streak = nextStreak(prevProfile, today);
        const next: Profile = {
          streak,
          lastActiveDate: today,
          totalAnswered: prevProfile.totalAnswered + 1,
          totalCorrect: prevProfile.totalCorrect + (record.isCorrect ? 1 : 0),
          onboarded: true
        };
        store.saveProfile(next);
        return next;
      });

      setSession((prev) => (prev ? { ...prev, results: [...prev.results, record] } : prev));
    },
    [reviews, today]
  );

  const finishSession = useCallback(() => {
    if (session) {
      const done = new Set(task.completed);
      session.results.forEach((r) => done.add(r.questionId));
      const nextTask: DailyTask = { ...task, completed: [...done] };
      store.saveTask(nextTask);
    }
    setRoute("result");
  }, [session, task]);

  const completedToday = task.completed.filter((id) => task.questionIds.includes(id)).length;

  return (
    <div className="app">
      {route === "today" && (
        <Today
          profile={profile}
          task={task}
          completed={completedToday}
          records={records}
          wrongCount={wrongIds.length}
          onStart={() => startSession(task.questionIds, "daily")}
        />
      )}

      {route === "quiz" && session && (
        <Quiz
          ids={session.ids}
          mode={session.mode}
          onAnswer={handleAnswer}
          onFinish={finishSession}
          onExit={() => setRoute("today")}
        />
      )}

      {route === "result" && session && <Result session={session} onBack={() => setRoute("today")} />}

      {route === "wrong" && (
        <WrongBook wrongIds={wrongIds} onPractice={(ids) => startSession(ids, "review")} />
      )}

      {route === "stats" && <Stats profile={profile} records={records} onProfileChange={setProfile} />}

      <nav className="nav">
        <button className={route === "today" || route === "quiz" || route === "result" ? "on" : ""} onClick={() => setRoute("today")}>
          <span className="ico">📅</span>
          今日
        </button>
        <button className={route === "wrong" ? "on" : ""} onClick={() => setRoute("wrong")}>
          <span className="ico">📕</span>
          错题本
        </button>
        <button className={route === "stats" ? "on" : ""} onClick={() => setRoute("stats")}>
          <span className="ico">📊</span>
          我的数据
        </button>
      </nav>
    </div>
  );
}

function nextStreak(profile: Profile, today: string): number {
  if (profile.lastActiveDate === today) return Math.max(profile.streak, 1);
  const yesterday = store.todayStr(new Date(Date.now() - 86400000));
  if (profile.lastActiveDate === yesterday) return profile.streak + 1;
  return 1;
}

export { DAILY_SIZE };
