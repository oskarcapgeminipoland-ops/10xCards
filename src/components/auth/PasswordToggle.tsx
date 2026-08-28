import { Eye, EyeOff } from "lucide-react";
import { t } from "@/lib/i18n";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute top-1/2 right-3 -translate-y-1/2 text-white/55 transition-colors hover:text-white/80"
      aria-label={visible ? t.auth.hidePassword : t.auth.showPassword}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
