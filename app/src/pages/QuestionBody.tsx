import { isTextAnswer } from "../lib/question-kind";
import type { Question } from "../types";
import ShortAnswerBox from "./ShortAnswerBox";

interface Props {
  question: Question;
  isMulti: boolean;
  selected: string[];
  submitted: boolean;
  onToggle: (key: string) => void;
  /** 简答题专用：作答文本、批阅中、是否已看答案 */
  answer: string;
  onAnswerChange: (text: string) => void;
  onSubmitShort: () => void;
  onReveal: () => void;
  grading: boolean;
}

/** 题干 + 标签 + 作答区。按题型切换：选择/判断题给选项，简答题给输入框。 */
export default function QuestionBody({
  question,
  isMulti,
  selected,
  submitted,
  onToggle,
  answer,
  onAnswerChange,
  onSubmitShort,
  onReveal,
  grading
}: Props) {
  const isText = isTextAnswer(question);
  return (
    <div className="card">
      <div style={{ marginBottom: 10 }}>
        <span className="tag">{question.categories.join(" · ")}</span>
        {question.isPractice && <span className="tag warn">工程判断</span>}
        {question.type === "judge" && <span className="tag">判断</span>}
        {isText && <span className="tag">简答</span>}
        {isMulti && <span className="tag">多选</span>}
      </div>
      <p className="stem">{question.stem}</p>

      {isText ? (
        <ShortAnswerBox
          answer={answer}
          onAnswerChange={onAnswerChange}
          onSubmit={onSubmitShort}
          onReveal={onReveal}
          grading={grading}
        />
      ) : (
        question.options.map((opt) => {
          let cls = "opt";
          if (submitted) {
            if (opt.isCorrect) cls += " ok";
            else if (selected.includes(opt.key)) cls += " bad";
          } else if (selected.includes(opt.key)) {
            cls += " sel";
          }
          return (
            <button key={opt.key} className={cls} onClick={() => onToggle(opt.key)}>
              <span className="key">{opt.key}.</span>
              {opt.content}
              {submitted && opt.wrongReason && !opt.isCorrect && <span className="why">✗ {opt.wrongReason}</span>}
            </button>
          );
        })
      )}
    </div>
  );
}
