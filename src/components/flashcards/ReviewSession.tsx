import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type {
  ApiErrorResponse,
  ReviewCard,
  ReviewRating,
  ReviewSessionResponse,
  SubmitReviewRequest,
  SubmitReviewResponse,
} from "@/types";

type Phase = "loading" | "empty-no-cards" | "empty-none-due" | "active" | "submitting" | "complete" | "error";

const RATING_LABELS: Record<ReviewRating, string> = {
  1: t.review.ratingAgain,
  2: t.review.ratingHard,
  3: t.review.ratingGood,
  4: t.review.ratingEasy,
};

const RATING_BUTTON_CLASS: Record<ReviewRating, string> = {
  1: "border-red-500/30 bg-red-900/20 text-red-200 hover:bg-red-900/40",
  2: "border-amber-500/30 bg-amber-900/20 text-amber-200 hover:bg-amber-900/40",
  3: "border-green-500/30 bg-green-900/20 text-green-200 hover:bg-green-900/40",
  4: "border-blue-500/30 bg-blue-900/20 text-blue-200 hover:bg-blue-900/40",
};

const RATINGS: ReviewRating[] = [1, 2, 3, 4];

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}

async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw new Error(isApiErrorResponse(body) ? body.error : t.common.somethingWentWrong);
  }

  return body as T;
}

/**
 * Drives the full review session: fetch the day's due queue, show one card
 * at a time (question -> reveal -> rate), submit each rating immediately,
 * and land on a completion tally. Mirrors `FlashcardGenerator.tsx`'s `Phase`
 * state-machine and local `apiRequest<T>()` fetch-helper conventions (no
 * shared data-fetching library exists in this codebase).
 *
 * No optimistic advance: a failed submit shows a retry-able toast and
 * leaves the current card in place with its rating buttons re-enabled,
 * rather than silently moving on (per the plan's confirmed block-and-retry
 * decision).
 */
export default function ReviewSession() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<ReviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pendingRating, setPendingRating] = useState<ReviewRating | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tally, setTally] = useState<Record<ReviewRating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });

  async function loadSession() {
    setPhase("loading");
    setLoadError(null);
    try {
      const data = await apiRequest<ReviewSessionResponse>("/api/flashcards/review/session");
      setItems(data.items);
      setCurrentIndex(0);
      setRevealed(false);
      if (data.items.length === 0) {
        setPhase(data.hasAnyFlashcards ? "empty-none-due" : "empty-no-cards");
      } else {
        setPhase("active");
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t.review.loadError);
      setPhase("error");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect: loading state must flip synchronously so the UI reflects the fetch that's starting on mount (mirrors FlashcardDeck.tsx's own justification for the same pattern).
    void loadSession();
  }, []);

  const currentItem = items[currentIndex];

  async function handleRate(rating: ReviewRating) {
    if (phase === "submitting") {
      return;
    }
    setPhase("submitting");
    setPendingRating(rating);
    try {
      await apiRequest<SubmitReviewResponse>("/api/flashcards/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flashcardId: currentItem.flashcard.id,
          rating,
        } satisfies SubmitReviewRequest),
      });
      setTally((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
      const nextIndex = currentIndex + 1;
      setRevealed(false);
      if (nextIndex >= items.length) {
        setPhase("complete");
      } else {
        setCurrentIndex(nextIndex);
        setPhase("active");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.review.submitError);
      setPhase("active");
    } finally {
      setPendingRating(null);
    }
  }

  if (phase === "loading") {
    return (
      <div className="grid grid-cols-1 gap-3">
        <Skeleton className="h-56 w-full rounded-xl bg-white/10" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-900/20 p-8 text-center">
        <p className="mb-4 text-red-200">{loadError}</p>
        <Button
          onClick={() => {
            void loadSession();
          }}
          className="gap-2 bg-purple-600 text-white hover:bg-purple-500"
        >
          {t.common.tryAgain}
        </Button>
      </div>
    );
  }

  if (phase === "empty-no-cards") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/8 p-12 text-center">
        <p className="mb-4 text-blue-100/70">{t.review.emptyNoCards}</p>
        <Button asChild className="gap-2 bg-purple-600 text-white hover:bg-purple-500">
          <a href="/flashcards/generate">{t.review.generateWithAi}</a>
        </Button>
      </div>
    );
  }

  if (phase === "empty-none-due") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/8 p-12 text-center">
        <p className="mb-4 text-blue-100/70">{t.review.emptyNoneDue}</p>
        <Button asChild variant="ghost" className="text-purple-300 hover:bg-white/10 hover:text-purple-100">
          <a href="/flashcards">{t.review.backToFlashcards}</a>
        </Button>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/8 p-8 text-center">
        <h2 className="mb-4 text-xl font-semibold text-white">{t.review.sessionComplete}</h2>
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATINGS.map((rating) => (
            <div key={rating} className="rounded-xl border border-white/10 bg-white/8 px-3 py-4">
              <p className="text-2xl font-bold text-white">{tally[rating]}</p>
              <p className="text-xs text-blue-100/70">{RATING_LABELS[rating]}</p>
            </div>
          ))}
        </div>
        <Button asChild className="gap-2 bg-purple-600 text-white hover:bg-purple-500">
          <a href="/flashcards">{t.review.backToFlashcards}</a>
        </Button>
      </div>
    );
  }

  // "active" or "submitting" only reach here once loadSession has populated
  // a non-empty `items` with `currentIndex` in range, so `currentItem` is
  // always resolved (TS agrees: noUncheckedIndexedAccess is off project-wide,
  // so `items[currentIndex]` types as `ReviewCard`, never `| undefined`).
  const disabled = phase === "submitting";

  return (
    <div className="space-y-4">
      <p className="text-sm text-blue-100/75">{t.review.cardCounter(currentIndex + 1, items.length)}</p>
      <Card className="min-w-0 border-white/10 bg-white/8 text-white backdrop-blur-xl">
        <CardContent className="space-y-4">
          <p className="text-lg font-medium break-words text-white">{currentItem.flashcard.question}</p>
          {revealed ? (
            <p className="border-t border-white/10 pt-4 break-words text-blue-100/80">{currentItem.flashcard.answer}</p>
          ) : (
            <Button
              onClick={() => {
                setRevealed(true);
              }}
              variant="ghost"
              className="border border-white/20 text-white hover:bg-white/10"
            >
              {t.review.showAnswer}
            </Button>
          )}
        </CardContent>
      </Card>

      {revealed && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {currentItem.previews.map((preview) => (
            <Button
              key={preview.rating}
              onClick={() => {
                void handleRate(preview.rating);
              }}
              disabled={disabled}
              className={cn(
                "flex h-auto flex-col gap-1 border py-3 disabled:opacity-50",
                RATING_BUTTON_CLASS[preview.rating],
              )}
            >
              {pendingRating === preview.rating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <span className="font-medium">{RATING_LABELS[preview.rating]}</span>
                  <span className="text-xs opacity-70">{t.review.formatInterval(preview.intervalDays)}</span>
                </>
              )}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
