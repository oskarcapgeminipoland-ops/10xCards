import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
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
import { t } from "@/lib/i18n";
import type { Flashcard } from "@/types";

interface DeleteFlashcardDialogProps {
  flashcard: Flashcard;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * Destructive-action confirmation before calling `DELETE` (FR-008). Hard
 * delete, no undo — the copy below says so explicitly.
 */
export function DeleteFlashcardDialog({ flashcard, onConfirm, onCancel }: DeleteFlashcardDialogProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !deleting) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#0f1529] text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-white">
            <Trash2 className="size-5 text-red-300" aria-hidden="true" />
            {t.delete.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-blue-100/70">
            {t.delete.description(flashcard.question)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onCancel}
            disabled={deleting}
            className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            {t.common.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={deleting}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {deleting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {t.delete.deleting}
              </span>
            ) : (
              t.common.delete
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
