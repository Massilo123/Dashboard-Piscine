import { useState } from 'react';
import { StickyNote, ChevronDown } from 'lucide-react';

interface ImportantNotesCollapsibleProps {
  items: string[];
  /** Ouvert au chargement (défaut : replié) */
  defaultOpen?: boolean;
  className?: string;
}

export function ImportantNotesCollapsible({
  items,
  defaultOpen = false,
  className = '',
}: ImportantNotesCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;

  return (
    <div
      className={`rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-100/95 overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-amber-500/5 active:bg-amber-500/10 transition-colors"
        aria-expanded={open}
      >
        <StickyNote className="w-4 h-4 text-amber-400 flex-shrink-0" aria-hidden />
        <span className="font-medium text-amber-200/95 flex-1 min-w-0">
          Notes importantes
          <span className="text-amber-400/70 font-normal ml-1">({items.length})</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-amber-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0">
          <ul className="space-y-2 pl-1 list-disc marker:text-amber-400 [list-style-position:outside] ml-5 border-t border-amber-500/20 pt-3">
            {items.map((line, i) => (
              <li key={i} className="leading-snug break-words pl-0.5">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
