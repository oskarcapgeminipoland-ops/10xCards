import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlashcardForm } from "@/components/flashcards/FlashcardForm";
import { DeleteFlashcardDialog } from "@/components/flashcards/DeleteFlashcardDialog";
import { t } from "@/lib/i18n";
import type { ApiErrorResponse, Flashcard, FlashcardInput, FlashcardListResponse } from "@/types";

const PAGE_SIZES = [10, 20, 50] as const;
type PageSize = (typeof PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: PageSize = 10;
const SEARCH_DEBOUNCE_MS = 300;

const dialogContentClass = "max-h-[85vh] overflow-y-auto border-white/10 bg-surface text-white";
const paginationLinkClass = "cursor-pointer border-white/10 text-white hover:bg-white/10 hover:text-white";
const paginationActiveClass = "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white";
const paginationDisabledClass = "pointer-events-none border-white/10 text-white/30";

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

/** Reads `?page` / `?size` from the current URL, falling back to the defaults. */
function readListParams(): { page: number; size: PageSize } {
  if (typeof window === "undefined") {
    return { page: 1, size: DEFAULT_PAGE_SIZE };
  }
  const params = new URLSearchParams(window.location.search);
  const rawPage = Number(params.get("page"));
  const rawSize = Number(params.get("size"));
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? (rawSize as PageSize) : DEFAULT_PAGE_SIZE;
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  return { page, size };
}

/** Mirrors `page` / `size` into the URL without adding a history entry — list
 *  pagination is a view filter, not navigation, so Back stays useful. */
function writeListParams(page: number, size: PageSize) {
  if (typeof window === "undefined") {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  params.set("page", String(page));
  params.set("size", String(size));
  params.delete("search"); // list search is React-only state; don't advertise it in the URL
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

/** The shareable URL for a given page — page/size only (search is not URL
 *  state), so the pagination links carry a real `href` (middle-click /
 *  open-in-new-tab work) and the click handler intercepts it for a fetch. */
function pageHref(targetPage: number, currentSize: PageSize): string {
  const params = new URLSearchParams();
  params.set("page", String(targetPage));
  params.set("size", String(currentSize));
  return `?${params.toString()}`;
}

/** First page, last page, current page and its neighbours, with `"ellipsis"`
 *  markers filling the gaps. */
function pageWindow(current: number, totalPages: number): (number | "ellipsis")[] {
  const wanted = [1, totalPages, current, current - 1, current + 1];
  const shown = [...new Set(wanted)].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | "ellipsis")[] = [];
  let previous = 0;
  for (const p of shown) {
    if (p - previous > 1) {
      result.push("ellipsis");
    }
    result.push(p);
    previous = p;
  }
  return result;
}

/**
 * The main flashcard-deck island: owns list state, debounced search, and
 * numbered pagination (`page` / `size` mirrored in the URL), and orchestrates
 * the create/edit dialog, delete confirmation, and toasts.
 */
export default function FlashcardDeck() {
  const initial = readListParams();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initial.page);
  const [size, setSize] = useState<PageSize>(initial.size);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingFlashcard, setEditingFlashcard] = useState<Flashcard | null>(null);
  const [deletingFlashcard, setDeletingFlashcard] = useState<Flashcard | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const prevSearchRef = useRef(debouncedSearch);

  const totalPages = Math.max(1, Math.ceil(total / size));

  // Debounce the search box before it drives any fetch.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [searchInput]);

  // A new search term jumps back to page 1 — but not on the initial mount,
  // where the page comes from the URL.
  useEffect(() => {
    if (prevSearchRef.current !== debouncedSearch) {
      prevSearchRef.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  // Keep the URL in sync with the current view.
  useEffect(() => {
    writeListParams(page, size);
  }, [page, size]);

  // Single source of truth for the visible page: refetch whenever page, size
  // or the (debounced) search term changes, cancelling any in-flight request
  // so a slow earlier response can't overwrite a faster later one.
  useEffect(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function load() {
      setLoading(true);
      setError(null);
      let clamping = false;
      try {
        const params = new URLSearchParams({ limit: String(size), offset: String((page - 1) * size) });
        if (debouncedSearch) {
          params.set("search", debouncedSearch);
        }
        const data = await apiRequest<FlashcardListResponse>(`/api/flashcards?${params.toString()}`, {
          signal: controller.signal,
        });
        setFlashcards(data.items);
        setTotal(data.total);
        // Clamp a `?page=` that overshoots the deck (deletions, hand-edited
        // URL): drop to the last real page, which refetches through this
        // same effect.
        const lastPage = Math.max(1, Math.ceil(data.total / size));
        if (page > lastPage) {
          clamping = true; // a refetch on the clamped page is coming — keep the skeleton, don't flash empty
          setPage(lastPage);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : t.deck.loadError);
      } finally {
        if (!clamping) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [page, size, debouncedSearch]);

  function goToPage(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
  }

  async function handleCreate(input: FlashcardInput) {
    try {
      const created = await apiRequest<Flashcard>("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      setFlashcards((prev) => [created, ...prev]);
      setTotal((prev) => prev + 1);
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
      const remaining = flashcards.filter((flashcard) => flashcard.id !== id);
      setFlashcards(remaining);
      setTotal((prev) => Math.max(0, prev - 1));
      setDeletingFlashcard(null);
      toast.success(t.deck.deletedToast);
      // Deleted the last card on a non-first page → step back a page (the
      // fetch effect pulls the now-current page).
      if (remaining.length === 0 && page > 1) {
        setPage((prev) => prev - 1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.deck.deleteErrorToast);
      throw err;
    }
  }

  const pages = pageWindow(page, totalPages);

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/55" />
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="hidden text-sm whitespace-nowrap text-blue-100/70 sm:inline">{t.deck.pageSizeLabel}</span>
            <Select
              value={String(size)}
              onValueChange={(value) => {
                setSize(Number(value) as PageSize);
                setPage(1);
              }}
            >
              <SelectTrigger
                aria-label={t.deck.pageSizeLabel}
                className="w-[4.5rem] border-white/20 bg-white/10 text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-surface border-white/10 text-white">
                {PAGE_SIZES.map((option) => (
                  <SelectItem
                    key={option}
                    value={String(option)}
                    className="text-white focus:bg-white/10 focus:text-white"
                  >
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <div className="rounded-2xl border border-white/10 bg-white/8 p-12 text-center">
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
            <Card key={flashcard.id} className="min-w-0 border-white/10 bg-white/8 text-white backdrop-blur-xl">
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

      {!loading && totalPages > 1 && (
        <Pagination className="mt-6" aria-label={t.deck.paginationLabel}>
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                href={pageHref(page - 1, size)}
                aria-label={t.deck.prevPage}
                aria-disabled={page === 1}
                className={page === 1 ? paginationDisabledClass : paginationLinkClass}
                onClick={(event) => {
                  event.preventDefault();
                  goToPage(page - 1);
                }}
              >
                {t.deck.prevPage}
              </PaginationLink>
            </PaginationItem>

            {pages.map((entry, index) =>
              entry === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis className="text-white/60" />
                </PaginationItem>
              ) : (
                <PaginationItem key={entry}>
                  <PaginationLink
                    href={pageHref(entry, size)}
                    aria-label={t.deck.pageAria(entry)}
                    isActive={entry === page}
                    className={entry === page ? paginationActiveClass : paginationLinkClass}
                    onClick={(event) => {
                      event.preventDefault();
                      goToPage(entry);
                    }}
                  >
                    {entry}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <PaginationLink
                href={pageHref(page + 1, size)}
                aria-label={t.deck.nextPage}
                aria-disabled={page === totalPages}
                className={page === totalPages ? paginationDisabledClass : paginationLinkClass}
                onClick={(event) => {
                  event.preventDefault();
                  goToPage(page + 1);
                }}
              >
                {t.deck.nextPage}
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
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
