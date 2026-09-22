export type Route = "today" | "quiz" | "result" | "wrong" | "categories" | "stats";

const ITEMS: { route: Route; icon: string; label: string }[] = [
  { route: "today", icon: "📅", label: "今日" },
  { route: "wrong", icon: "📕", label: "复习" },
  { route: "categories", icon: "📚", label: "分类" },
  { route: "stats", icon: "📊", label: "我的数据" }
];

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
}

/** 底部四个 Tab。答题/结果页归属「今日」，所以高亮跟着 today。 */
export default function NavBar({ route, onNavigate }: Props) {
  const active = (target: Route) =>
    target === "today" ? route === "today" || route === "quiz" || route === "result" : route === target;
  return (
    <nav className="nav">
      {ITEMS.map((item) => (
        <button key={item.route} className={active(item.route) ? "on" : ""} onClick={() => onNavigate(item.route)}>
          <span className="ico">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
