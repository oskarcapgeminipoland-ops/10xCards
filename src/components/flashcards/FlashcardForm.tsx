import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { flashcardInputSchema } from "@/lib/schemas/flashcard";
import { t } from "@/lib/i18n";
import type { FlashcardInput } from "@/types";

const QUESTION_LIMIT = 500;
const ANSWER_LIMIT = 1000;

interface FlashcardFormProps {
  mode: "create" | "edit";
  initialValue?: FlashcardInput;
  onSubmit: (input: FlashcardInput) => Promise<void>;
  onCancel: () => void;
}

const fieldClass =
  "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/40";
const fieldErrorClass = "border-red-400/60 focus-visible:border-red-400 focus-visible:ring-red-400/40";

/**
 * One form used for both create and edit, mode-driven. Re-validates on every
 * keystroke against `flashcardInputSchema` (the same schema the API enforces
 * server-side) so limits can never drift between client and server.
 */
export function FlashcardForm({ mode, initialValue, onSubmit, onCancel }: FlashcardFormProps) {
  const [question, setQuestion] = useState(initialValue?.question ?? "");
  const [answer, setAnswer] = useState(initialValue?.answer ?? "");
  const [submitting, setSubmitting] = useState(false);
  // Validation errors stay hidden until the user blurs a field. The live
  // `parsed` result below still drives the submit button, so a blocked
  // submit needs no separate "reveal all errors" path.
  const [touched, setTouched] = useState({ question: false, answer: false });

  const parsed = useMemo(() => flashcardInputSchema.safeParse({ question, answer }), [question, answer]);
  const questionError = parsed.success
    ? undefined
    : parsed.error.issues.find((issue) => issue.path[0] === "question")?.message;
  const answerError = parsed.success
    ? undefined
    : parsed.error.issues.find((issue) => issue.path[0] === "answer")?.message;

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.success || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ question, answer });
    } catch {
      // The parent already surfaces the failure via a toast; keep the
      // dialog open (with the user's input intact) so they can retry.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="flashcard-question" className="text-blue-100/80">
            {t.form.questionLabel}
          </Label>
          <span className={cn("text-xs", question.length > QUESTION_LIMIT ? "text-red-300" : "text-white/40")}>
            {question.length}/{QUESTION_LIMIT}
          </span>
        </div>
        <Textarea
          id="flashcard-question"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          onBlur={() => {
            setTouched((prev) => ({ ...prev, question: true }));
          }}
          placeholder={t.form.questionPlaceholder}
          rows={3}
          className={cn(fieldClass, touched.question && questionError && fieldErrorClass)}
        />
        {touched.question && questionError && <p className="text-xs text-red-300">{questionError}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="flashcard-answer" className="text-blue-100/80">
            {t.form.answerLabel}
          </Label>
          <span className={cn("text-xs", answer.length > ANSWER_LIMIT ? "text-red-300" : "text-white/40")}>
            {answer.length}/{ANSWER_LIMIT}
          </span>
        </div>
        <Textarea
          id="flashcard-answer"
          value={answer}
          onChange={(event) => {
            setAnswer(event.target.value);
          }}
          onBlur={() => {
            setTouched((prev) => ({ ...prev, answer: true }));
          }}
          placeholder={t.form.answerPlaceholder}
          rows={4}
          className={cn(fieldClass, touched.answer && answerError && fieldErrorClass)}
        />
        {touched.answer && answerError && <p className="text-xs text-red-300">{answerError}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
          className="text-white/70 hover:bg-white/10 hover:text-white"
        >
          {t.common.cancel}
        </Button>
        <Button
          type="submit"
          disabled={!parsed.success || submitting}
          className="bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {mode === "create" ? t.form.creating : t.form.saving}
            </span>
          ) : mode === "create" ? (
            t.form.createSubmit
          ) : (
            t.form.saveSubmit
          )}
        </Button>
      </div>
    </form>
  );
}
