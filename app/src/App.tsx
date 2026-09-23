import { useCallback, useMemo, useState } from "react";
import { useSyncBridge } from "./hooks/use-sync";
import { QUESTIONS } from "./data/questions";
import { buildDailyTask, DAILY_SIZE } from "./lib/recommend";
import { applyAnswer } from "./lib/ebbinghaus";
import { inferMastery, resolveMastery } from "./lib/mastery";
import { firstPendingIndex, markCompleted, pendingCount } from "./lib/task";
import * as store from "./lib/storage";
import * as sync from "./lib/sync";
import type { AnswerMode, AnswerRecord, DailyTask, MasteryLevel, MasteryState, Profile, ReviewState } from "./types";
import Today from "./pages/Today";
import Quiz from "./pages/Quiz";
import Result from "./pages/Result";
import WrongBook from "./pages/WrongBook";
import Stats from "./pages/Stats";
import Categories from "./pages/Categories";
import Account from "./pages/Account";
import NavBar from "./pages/NavBar";
import type { Route } from "./pages/NavBar";

interface Session {
  ids: string[];
  mode: AnswerMode;
  results: AnswerRecord[];
  /** 断点续答的起始下标 */
  startIndex: number;
}

export default function App() {
  const [route, setRoute] = useState<Route>("today");
  const [profile, setProfile] = useState<Profile>(() => store.loadProfile());
  const [records, setRecords] = useState<AnswerRecord[]>(() => store.loadRecords());
  const [reviews, setReviews] = useState<Record<string, ReviewState>>(() => store.loadReviews());
  const [bookmarks, setBookmarks] = useState<string[]>(() => store.loadBookmarks());
  const [mastery, setMastery] = useState<Record<string, MasteryState>>(() => store.loadMastery());
  const [session, setSession] = useState<Session | null>(null);

  const today = store.todayStr();

  const [task, setTask] = useState<DailyTask>(() => {
    const existing = store.loadTask(today);
    if (existing && existing.questionIds.length > 0) return existing;
    const ids = buildDailyTask({
      questions: QUESTIONS,
      records: store.loadRecords(),
      reviews: store.loadReviews(),
      profile: store.loadProfile(),
      mastery: store.loadMastery()
    });
    const built: DailyTask = { date: today, questionIds: ids, completed: [] };
    store.saveTask(built);
    return built;
  });

  const wrongIds = useMemo(() => {
    const last = new Map<string, AnswerRecord>();
    records.forEach((r) => {
      const prev = last.get(r.questionId);
      if (!prev || r.answeredAt >= prev.answeredAt) last.set(r.questionId, r);
    });
    return [...last.values()].filter((r) => !r.isCorrect).map((r) => r.questionId);
  }, [records]);

  /** 远端进度合并进本地后，统一重读一遍本机数据（同步层只管存储，不碰 React 状态）。 */
  const reloadFromStore = useCallback(() => {
    setProfile(store.loadProfile());
    setRecords(store.loadRecords());
    setReviews(store.loadReviews());
    setBookmarks(store.loadBookmarks());
    setMastery(store.loadMastery());
    setTask((prev) => store.loadTask(today) ?? prev);
  }, [today]);

  useSyncBridge(reloadFromStore);

  const startSession = useCallback((ids: string[], mode: AnswerMode, startIndex = 0) => {
    setSession({ ids, mode, results: [], startIndex });
    setRoute("quiz");
  }, []);

  const toggleBookmark = useCallback((questionId: string) => {
    setBookmarks(store.toggleBookmark(questionId));
  }, []);

  /** 熟练度：显式自评（用户点选）或自动推断（答题 / 查看答案）。 */
  const writeMastery = useCallback(
    (questionId: string, level: MasteryLevel, explicit: boolean) => {
      setMastery((prev) => {
        const next = { ...prev };
        next[questionId] = resolveMastery(prev[questionId], questionId, {
          level,
          explicit,
          updatedAt: Date.now()
        });
        store.saveMastery(next);
        return next;
      });
    },
    []
  );

  const handleAnswer = useCallback(
    (record: AnswerRecord) => {
      store.appendRecord(record);
      setRecords((prev) => [...prev, record]);

      const nextReviews = { ...reviews };
      const level = inferMastery({
        isCorrect: record.isCorrect,
        viewedAnswer: record.viewedAnswer,
        verdict: record.grade?.verdict
      });
      nextReviews[record.questionId] = applyAnswer(
        reviews[record.questionId],
        record.questionId,
        record.isCorrect,
        record.answeredAt,
        level
      );
      store.saveReviews(nextReviews);
      setReviews(nextReviews);
      // 熟练度同步落库：查看答案/答错会自动记为未掌握，用户的显式自评优先级更高
      writeMastery(record.questionId, level, false);

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

      // 答完立刻记进当天任务，这样中途退出后能接着最后一题继续
      setTask((prev) => {
        const next = markCompleted(prev, record.questionId);
        if (next !== prev) store.saveTask(next);
        return next;
      });

      // 进度变了就安排一次后台上传（防抖合并；未登录时是空操作）
      sync.scheduleUpload();
    },
    [reviews, today, writeMastery]
  );

  const finishSession = useCallback(() => {
    if (session) {
      setTask((prev) => {
        const next = session.results.reduce((acc, r) => markCompleted(acc, r.questionId), prev);
        if (next !== prev) store.saveTask(next);
        return next;
      });
    }
    setRoute("result");
  }, [session]);

  const completedToday = task.completed.filter((id) => task.questionIds.includes(id)).length;
  const remaining = pendingCount(task);

  return (
    <div className="app">
      {route === "today" && (
        <Today
          profile={profile}
          task={task}
          completed={completedToday}
          remaining={remaining}
          resumeAt={firstPendingIndex(task) + 1}
          records={records}
          wrongCount={wrongIds.length}
          onStart={() => startSession(task.questionIds, "daily", firstPendingIndex(task))}
        />
      )}

      {route === "quiz" && session && (
        <Quiz
          ids={session.ids}
          mode={session.mode}
          initialIndex={session.startIndex}
          bookmarkIds={bookmarks}
          mastery={mastery}
          onAnswer={handleAnswer}
          onFinish={finishSession}
          onExit={() => setRoute("today")}
          onToggleBookmark={toggleBookmark}
          onMastery={(id, level) => writeMastery(id, level, true)}
        />
      )}

      {route === "result" && session && <Result session={session} onBack={() => setRoute("today")} />}

      {route === "wrong" && (
        <WrongBook
          wrongIds={wrongIds}
          bookmarkIds={bookmarks}
          onPractice={(ids) => startSession(ids, "review")}
          onToggleBookmark={toggleBookmark}
        />
      )}

      {route === "categories" && (
        <Categories records={records} onPractice={(ids) => startSession(ids, "practice")} />
      )}

      {route === "stats" && <Stats profile={profile} records={records} onProfileChange={setProfile} />}

      {route === "account" && <Account />}

      <NavBar route={route} onNavigate={setRoute} />
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
