import { MASTERY_LABELS, MASTERY_LEVELS } from "../lib/mastery";
import type { MasteryLevel } from "../types";

interface Props {
  current: MasteryLevel;
  onPick: (level: MasteryLevel) => void;
}

/** 熟练度自评：已掌握 / 模糊 / 未掌握。选择是显式的，优先级高于自动推断。 */
export default function MasteryPicker({ current, onPick }: Props) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ marginBottom: 6 }}>这道题你觉得自己掌握了吗？</div>
      <div className="report-opts">
        {MASTERY_LEVELS.slice().reverse().map((level) => (
          <button
            key={level}
            className={current === level ? "chip on" : "chip"}
            onClick={() => onPick(level)}
          >
            {MASTERY_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
}
