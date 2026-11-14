import React, { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

/** The wrapper lets disabled native controls retain an explanation on hover/focus. */
export function IconTooltip({ label, disabledReason, description, hintOpen = false, onHintDismiss, className = '', children }: {
  label: string; disabledReason?: string; description?: string; hintOpen?: boolean; onHintDismiss?: () => void; className?: string; children: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return <Tooltip.Provider delayDuration={200}>
    <Tooltip.Root open={open || hintOpen} onOpenChange={value => { setOpen(value); if (!value) onHintDismiss?.(); }}>
      <Tooltip.Trigger asChild><span tabIndex={disabledReason ? 0 : undefined}
        className={`inline-flex [&>button:disabled]:pointer-events-none ${className}`}>
        {children}
      </span></Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content side="top" sideOffset={14} collisionPadding={12}
        className="yullo-app yullo-icon-tooltip select-none font-[Instrument_Sans] z-[200] max-w-56 rounded-md border px-2.5 py-1.5 text-[11px] leading-4 text-[var(--text-primary)] shadow-md">
        {label}{description && <span className="block text-[var(--text-secondary)]">{description}</span>}{disabledReason && <span className="block text-[var(--text-secondary)]">{disabledReason}</span>}
      </Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>;
}
