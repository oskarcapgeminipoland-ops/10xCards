import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FlashcardForm } from "@/components/flashcards/FlashcardForm";
import { DeleteFlashcardDialog } from "@/components/flashcards/DeleteFlashcardDialog";
import { t } from "@/lib/i18n";
import type { ApiErrorResponse, Flashcard, FlashcardInput, FlashcardListResponse } from "@/types";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const dialogContentClass = "max-h-[85vh] overflow-y-auto border-white/10 bg-[#0f1529] text-white";

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
 * The main flashcard-deck island: owns list state, debounced search,
 * pagination fetch-on-scroll, and orchestrates the create/edit dialog,
 * delete confirmation, and toasts.
 */
export default function FlashcardDeck() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingFlashcard, setEditingFlashcard] = useState<Flashcard | null>(null);
  const [deletingFlashcard, setDeletingFlashcard] = useState<Flashcard | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nextOffsetRef = useRef<number | null>(null);
  const loadingRef = useRef(true);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    nextOffsetRef.current = nextOffset;
  }, [nextOffset]);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  // Debounce the search box before it drives any fetch.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [searchInput]);

  async function fetchPage(offset: number, search: string, mode: "reset" | "append", signal: AbortSignal) {
    if (mode === "reset") {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (search) {
        params.set("search", search);
      }
      const data = await apiRequest<FlashcardListResponse>(`/api/flashcards?${params.toString()}`, { signal });
      setFlashcards((prev) => (mode === "reset" ? data.items : [...prev, ...data.items]));
      setNextOffset(data.nextOffset);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : t.deck.loadError);
    } finally {
      if (mode === "reset") {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }

  // Search changes (including the initial mount) reset to page 0 and cancel
  // any in-flight request so a slow earlier response can't overwrite a
  // faster later one.
  useEffect(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect: loading/error state must flip synchronously so the UI reflects the fetch that's starting (see plan's "Search + pagination must reset and cancel together").
    void fetchPage(0, debouncedSearch, "reset", controller.signal);
    return () => {
      controller.abort();
    };
  }, [debouncedSearch]);

  // Infinite scroll: load the next page once the sentinel enters the viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && nextOffsetRef.current !== null && !loadingRef.current && !loadingMoreRef.current) {
          abortControllerRef.current?.abort();
          const controller = new AbortController();
          abortControllerRef.current = controller;
          void fetchPage(nextOffsetRef.current, debouncedSearch, "append", controller.signal);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [debouncedSearch]);

  async function handleCreate(input: FlashcardInput) {
    try {
      const created = await apiRequest<Flashcard>("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      setFlashcards((prev) => [created, ...prev]);
      toast.success(t.deck.createdToast);
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.deck.createErrorToast);
      throw err;
    }
  }

  async function handleUpdate(id: string, input: FlashcardInput) {
    try {
      const updated = await apiRequest<Flashcard>(`/api/flashcards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      setFlashcards((prev) => prev.map((flashcard) => (flashcard.id === id ? updated : flashcard)));
      toast.success(t.deck.updatedToast);
      setEditingFlashcard(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.deck.updateErrorToast);
      throw err;
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiRequest(`/api/flashcards/${id}`, { method: "DELETE" });
      setFlashcards((prev) => prev.filter((flashcard) => flashcard.id !== id));
      toast.success(t.deck.deletedToast);
      setDeletingFlashcard(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.deck.deleteErrorToast);
      throw err;
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
            }}
            placeholder={t.deck.searchPlaceholder}
            aria-label={t.deck.searchAriaLabel}
            className="border-white/20 bg-white/10 pl-10 text-white placeholder:text-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/40"
          />
        </div>
        <Button
          onClick={() => {
            setCreateOpen(true);
          }}
          className="gap-2 bg-purple-600 text-white hover:bg-purple-500"
        >
          <Plus className="size-4" />
          {t.deck.newButton}
        </Button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl bg-white/10" />
          ))}
        </div>
      ) : flashcards.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
          {debouncedSearch ? (
            <p className="text-blue-100/70">{t.deck.emptyNoMatch(debouncedSearch)}</p>
          ) : (
            <>
              <p className="mb-4 text-blue-100/70">{t.deck.emptyNoCards}</p>
              <Button
                onClick={() => {
                  setCreateOpen(true);
                }}
                className="gap-2 bg-purple-600 text-white hover:bg-purple-500"
              >
                <Plus className="size-4" />
                {t.deck.createFirst}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {flashcards.map((flashcard) => (
            <Card key={flashcard.id} className="min-w-0 border-white/10 bg-white/5 text-white backdrop-blur-xl">
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words text-white">{flashcard.question}</p>
                  <p className="mt-1 text-sm break-words text-blue-100/70">{flashcard.answer}</p>
                </div>
                <div className="flex shrink-0 gap-2 self-end sm:self-start">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingFlashcard(flashcard);
                    }}
                    className="text-white/70 hover:bg-white/10 hover:text-white"
                    aria-label={t.deck.editAriaLabel}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeletingFlashcard(flashcard);
                    }}
                    className="text-white/70 hover:bg-red-500/20 hover:text-red-300"
                    aria-label={t.deck.deleteAriaLabel}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />

      {loadingMore && (
        <div className="mt-3">
          <Skeleton className="h-24 w-full rounded-xl bg-white/10" />
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={dialogContentClass}>
          <DialogHeader>
            <DialogTitle className="text-white">{t.deck.createDialogTitle}</DialogTitle>
            <DialogDescription className="text-blue-100/70">{t.deck.createDialogDescription}</DialogDescription>
          </DialogHeader>
          <FlashcardForm
            mode="create"
            onSubmit={handleCreate}
            onCancel={() => {
              setCreateOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingFlashcard !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingFlashcard(null);
          }
        }}
      >
        <DialogContent className={dialogContentClass}>
          <DialogHeader>
            <DialogTitle className="text-white">{t.deck.editDialogTitle}</DialogTitle>
            <DialogDescription className="text-blue-100/70">{t.deck.editDialogDescription}</DialogDescription>
          </DialogHeader>
          {editingFlashcard && (
            <FlashcardForm
              mode="edit"
              initialValue={{ question: editingFlashcard.question, answer: editingFlashcard.answer }}
              onSubmit={(input) => handleUpdate(editingFlashcard.id, input)}
              onCancel={() => {
                setEditingFlashcard(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {deletingFlashcard && (
        <DeleteFlashcardDialog
          flashcard={deletingFlashcard}
          onConfirm={() => handleDelete(deletingFlashcard.id)}
          onCancel={() => {
            setDeletingFlashcard(null);
          }}
        />
      )}
    </>
  );
}
