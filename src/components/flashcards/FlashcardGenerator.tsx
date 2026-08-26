import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { generateRequestSchema } from "@/lib/schemas/flashcard";
import { FlashcardForm } from "@/components/flashcards/FlashcardForm";
import type { ApiErrorResponse, Flashcard, FlashcardInput, GenerateFlashcardsResponse } from "@/types";

const SOURCE_TEXT_LIMIT = 5000;

const STATUS_MESSAGES = [
  "Reading your text...",
  "Identifying key facts and concepts...",
  "Drafting question-and-answer pairs...",
  "Almost there...",
];

const dialogContentClass = "max-h-[85vh] overflow-y-auto border-white/10 bg-[#0f1529] text-white";

type ProposalWithId = FlashcardInput & { clientId: string };
type Phase = "idle" | "generating" | "reviewing" | "error";

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
    throw new Error(isApiErrorResponse(body) ? body.error : "Something went wrong");
  }

  return body as T;
}

/**
 * The paste -> generate -> review island for AI flashcard generation
 * (US-01). Owns the full state machine: a source-text textarea with live
 * validation, a generate/regenerate action with in-flight progress
 * feedback, and a per-proposal accept/edit/reject review list. Accept
 * persists immediately via `POST /api/flashcards/accept`; edit only
 * updates local state until the (possibly edited) proposal is accepted.
 */
export default function FlashcardGenerator() {
  const [sourceText, setSourceText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [proposals, setProposals] = useState<ProposalWithId[]>([]);
  const [editingProposal, setEditingProposal] = useState<ProposalWithId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const parsedSource = useMemo(() => generateRequestSchema.safeParse({ sourceText }), [sourceText]);
  const sourceError = parsedSource.success ? undefined : parsedSource.error.issues[0]?.message;

  // Elapsed-time counter + rotating status text while a generation is in
  // flight. `elapsedSeconds` is reset to 0 by `runGenerate` itself (not
  // here) so this effect only subscribes to the ticking interval.
  useEffect(() => {
    if (phase !== "generating") {
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [phase]);

  const statusText = STATUS_MESSAGES[Math.floor(elapsedSeconds / 3) % STATUS_MESSAGES.length];

  async function runGenerate() {
    setPhase("generating");
    setError(null);
    setElapsedSeconds(0);

    try {
      const data = await apiRequest<GenerateFlashcardsResponse>("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText }),
      });
      const withIds = data.proposals.map((proposal) => ({ ...proposal, clientId: crypto.randomUUID() }));
      setProposals(withIds);
      setPhase("reviewing");
      if (data.droppedCount > 0) {
        toast.info(`${withIds.length} flashcards generated — ${data.droppedCount} skipped due to formatting issues`);
      } else {
        toast.success(`${withIds.length} flashcards generated`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate flashcards");
      setPhase("error");
    }
  }

  function handleGenerateClick() {
    if (!parsedSource.success || phase === "generating") {
      return;
    }
    if (proposals.length > 0) {
      setConfirmRegenerateOpen(true);
      return;
    }
    void runGenerate();
  }

  function handleConfirmRegenerate() {
    setConfirmRegenerateOpen(false);
    setProposals([]);
    void runGenerate();
  }

  async function handleAccept(proposal: ProposalWithId) {
    setAcceptingIds((prev) => new Set(prev).add(proposal.clientId));
    try {
      await apiRequest<Flashcard>("/api/flashcards/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: proposal.question, answer: proposal.answer }),
      });
      setProposals((prev) => prev.filter((item) => item.clientId !== proposal.clientId));
      toast.success("Flashcard added to your deck");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to accept flashcard");
    } finally {
      setAcceptingIds((prev) => {
        const next = new Set(prev);
        next.delete(proposal.clientId);
        return next;
      });
    }
  }

  function handleReject(clientId: string) {
    setProposals((prev) => prev.filter((item) => item.clientId !== clientId));
  }

  function handleEditSubmit(clientId: string, input: FlashcardInput): Promise<void> {
    setProposals((prev) => prev.map((item) => (item.clientId === clientId ? { ...item, ...input } : item)));
    setEditingProposal(null);
    return Promise.resolve();
  }

  return (
    <>
      <Card className="min-w-0 border-white/10 bg-white/5 text-white backdrop-blur-xl">
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="source-text" className="text-blue-100/80">
                Source text
              </Label>
              <span className={cn("text-xs", sourceText.length > SOURCE_TEXT_LIMIT ? "text-red-300" : "text-white/40")}>
                {sourceText.length}/{SOURCE_TEXT_LIMIT}
              </span>
            </div>
            <Textarea
              id="source-text"
              value={sourceText}
              onChange={(event) => {
                setSourceText(event.target.value);
              }}
              placeholder="Paste the text you want to turn into flashcards..."
              rows={8}
              disabled={phase === "generating"}
              className={cn(
                "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/40",
                sourceError && "border-red-400/60 focus-visible:border-red-400 focus-visible:ring-red-400/40",
              )}
            />
            {sourceError && <p className="text-xs text-red-300">{sourceError}</p>}
          </div>

          <Button
            onClick={handleGenerateClick}
            disabled={!parsedSource.success || phase === "generating"}
            className="gap-2 bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {phase === "generating" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {proposals.length > 0 || phase === "error" ? "Generate again" : "Generate"}
              </>
            )}
          </Button>

          {phase === "generating" && (
            <p className="flex items-center gap-2 text-sm text-blue-100/70">
              <Loader2 className="size-4 animate-spin" />
              {statusText} ({elapsedSeconds}s)
            </p>
          )}

          {phase === "error" && error && (
            <div className="rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
              <p>{error}</p>
              <Button
                onClick={() => {
                  void runGenerate();
                }}
                variant="ghost"
                size="sm"
                className="mt-2 text-red-200 hover:bg-red-500/20 hover:text-red-100"
              >
                Try again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {phase === "reviewing" && (
        <div className="mt-6 space-y-3">
          {proposals.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-blue-100/70">
                No flashcards survived validation from this text. Try generating again, or paste different text.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {proposals.map((proposal) => {
                const accepting = acceptingIds.has(proposal.clientId);
                return (
                  <Card
                    key={proposal.clientId}
                    className="min-w-0 border-white/10 bg-white/5 text-white backdrop-blur-xl"
                  >
                    <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words text-white">{proposal.question}</p>
                        <p className="mt-1 text-sm break-words text-blue-100/70">{proposal.answer}</p>
                      </div>
                      <div className="flex shrink-0 gap-2 self-end sm:self-start">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={accepting}
                          onClick={() => {
                            setEditingProposal(proposal);
                          }}
                          className="text-white/70 hover:bg-white/10 hover:text-white"
                          aria-label="Edit proposal"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={accepting}
                          onClick={() => {
                            handleReject(proposal.clientId);
                          }}
                          className="text-white/70 hover:bg-red-500/20 hover:text-red-300"
                          aria-label="Reject proposal"
                        >
                          <X className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={accepting}
                          onClick={() => {
                            void handleAccept(proposal);
                          }}
                          className="text-white/70 hover:bg-green-500/20 hover:text-green-300"
                          aria-label="Accept proposal"
                        >
                          {accepting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={editingProposal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProposal(null);
          }
        }}
      >
        <DialogContent className={dialogContentClass}>
          <DialogHeader>
            <DialogTitle className="text-white">Edit proposal</DialogTitle>
            <DialogDescription className="text-blue-100/70">
              Update the question or answer before accepting.
            </DialogDescription>
          </DialogHeader>
          {editingProposal && (
            <FlashcardForm
              mode="edit"
              initialValue={{ question: editingProposal.question, answer: editingProposal.answer }}
              onSubmit={(input) => handleEditSubmit(editingProposal.clientId, input)}
              onCancel={() => {
                setEditingProposal(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRegenerateOpen} onOpenChange={setConfirmRegenerateOpen}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#0f1529] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Replace pending proposals?</AlertDialogTitle>
            <AlertDialogDescription className="text-blue-100/70">
              You still have {proposals.length} unreviewed {proposals.length === 1 ? "proposal" : "proposals"}.
              Generating again will discard {proposals.length === 1 ? "it" : "them"} and replace the list with new
              proposals.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmRegenerate();
              }}
              className="bg-purple-600 text-white hover:bg-purple-500"
            >
              Generate again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
