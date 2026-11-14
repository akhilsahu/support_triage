import { IconTooltip } from './IconTooltip';
import React, { useId, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import { parseDate, parseTime } from '@internationalized/date';
import { Button, Calendar, CalendarCell, CalendarGrid, CalendarGridBody, CalendarGridHeader, CalendarHeaderCell, DateInput, DateSegment, FieldError, Group, Heading, Label, TimeField } from 'react-aria-components';

const trigger = 'flex min-h-11 sm:min-h-10 w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--text-primary)] disabled:opacity-50 hover:border-[var(--accent-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
const iconButton = 'flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
const popup = 'yullo-app z-[160] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text-primary)] shadow-xl';

export function DateTimeField({ date, time, onDateChange, onTimeChange, disabled = false }: {
  date: string; time: string; onDateChange: (value: string) => void; onTimeChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const clock = time ? parseTime(time) : null;
  const updateTime = (hour: number, minute: number) => onTimeChange(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  const selected = date ? parseDate(date) : null;
  return <div>
    <div className="grid grid-cols-2 gap-4">
      <div className="min-w-0">
        <p id={`${id}-date-label`} className="mb-2 text-[13px] font-medium text-[var(--text-primary)]">Date</p>
        <Popover.Root open={dateOpen && !disabled} onOpenChange={setDateOpen}>
          <Popover.Trigger asChild><button type="button" disabled={disabled} aria-labelledby={`${id}-date-label ${id}-date-value`} className={trigger}><CalendarDays size={16} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" /><span id={`${id}-date-value`} className={`flex-1 ${date ? '' : 'text-[var(--text-secondary)]'}`}>{selected ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(selected.toDate('UTC')) : 'Select date'}</span><ChevronDown size={14} aria-hidden="true" /></button></Popover.Trigger>
          <Popover.Portal><Popover.Content align="start" sideOffset={8} collisionPadding={16} className={`${popup} w-[min(288px,calc(100vw-32px))]`}>
            <Calendar aria-label="Event date" value={selected} onChange={day => { onDateChange(day.toString()); setDateOpen(false); }}>
              <header className="mb-2 flex items-center justify-between gap-2"><IconTooltip label="Previous month"><Button slot="previous" className={iconButton} aria-label="Previous month"><ChevronLeft size={16} aria-hidden="true" /></Button></IconTooltip><Heading className="text-sm font-medium" /><IconTooltip label="Next month"><Button slot="next" className={iconButton} aria-label="Next month"><ChevronRight size={16} aria-hidden="true" /></Button></IconTooltip></header>
              <CalendarGrid className="w-full table-fixed border-separate border-spacing-0.5">
                <CalendarGridHeader>{day => <CalendarHeaderCell className="pb-2 text-xs font-normal text-[var(--text-secondary)]">{day}</CalendarHeaderCell>}</CalendarGridHeader>
                <CalendarGridBody>{day => <CalendarCell date={day} className="flex min-h-9 cursor-pointer items-center justify-center rounded-md text-sm tabular-nums outline-none hover:bg-[var(--surface-soft)] data-[outside-month]:text-[var(--text-secondary)] data-[outside-month]:opacity-50 data-[selected]:bg-[var(--accent-solid)] data-[selected]:text-[var(--accent-on-solid)] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--accent)]" />}</CalendarGridBody>
              </CalendarGrid>
            </Calendar>
            {date && <button type="button" className="mt-2 flex min-h-9 items-center gap-1 text-xs text-[var(--text-secondary)]" onClick={() => { onDateChange(''); setDateOpen(false); }}><X size={12} aria-hidden="true" />Clear date</button>}
          </Popover.Content></Popover.Portal>
        </Popover.Root>
      </div>
      <TimeField value={time ? parseTime(time) : null} onChange={value => onTimeChange(value?.toString() || '')}
        granularity="minute" hourCycle={12} isDisabled={disabled} className="min-w-0">
        <Label className="mb-2 block text-[13px] font-medium text-[var(--text-primary)]">Start time</Label>
        <Group className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 sm:min-h-10 data-[focus-within]:border-[var(--accent)] data-[focus-within]:ring-1 data-[focus-within]:ring-[var(--accent)] data-[disabled]:opacity-50">
          <Popover.Root open={timeOpen && !disabled} onOpenChange={setTimeOpen}>
            <IconTooltip label="Choose the start time"><Popover.Trigger asChild><button type="button" disabled={disabled} aria-label="Open time picker" className={iconButton}><Clock3 size={16} aria-hidden="true" /></button></Popover.Trigger></IconTooltip>
            <Popover.Portal><Popover.Content align="end" sideOffset={8} collisionPadding={16} onOpenAutoFocus={event => event.preventDefault()} className={`${popup} w-64`}>
              <p className="mb-3 text-sm font-medium">Choose time</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Hour', options: Array.from({ length: 12 }, (_, i) => i + 1), value: String((clock?.hour ?? 0) % 12 || 12), change: (value: string) => updateTime(Number(value) % 12 + ((clock?.hour ?? 0) >= 12 ? 12 : 0), clock?.minute ?? 0) },
                  { label: 'Minute', options: Array.from({ length: 60 }, (_, i) => i), value: String(clock?.minute ?? 0), change: (value: string) => updateTime(clock?.hour ?? 0, Number(value)) },
                  { label: 'Period', options: ['AM', 'PM'], value: (clock?.hour ?? 0) >= 12 ? 'PM' : 'AM', change: (value: string) => updateTime((clock?.hour ?? 0) % 12 + (value === 'PM' ? 12 : 0), clock?.minute ?? 0) },
                ].map(unit => <label key={unit.label} className="text-xs text-[var(--text-secondary)]">{unit.label}<select value={unit.value} onChange={event => unit.change(event.target.value)} className="mt-2 min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]">{unit.options.map(option => <option key={option} value={String(option)}>{typeof option === 'number' ? String(option).padStart(2, '0') : option}</option>)}</select></label>)}
              </div>
              <Popover.Close className="mt-3 min-h-9 w-full rounded-md bg-[var(--accent-solid)] text-sm text-[var(--accent-on-solid)]">Done</Popover.Close>
            </Popover.Content></Popover.Portal>
          </Popover.Root>
          <DateInput onClick={() => { if (!disabled) setTimeOpen(true); }} className="flex min-w-0 flex-1 items-center py-2 text-sm tabular-nums">
            {segment => <DateSegment segment={segment} className="rounded px-0.5 py-0.5 outline-none data-[placeholder]:text-[var(--text-secondary)] data-[focused]:bg-[var(--accent-solid)] data-[focused]:text-[var(--accent-on-solid)]" />}
          </DateInput>
          {time && <IconTooltip label="Clear the selected time"><button type="button" disabled={disabled} onClick={() => onTimeChange('')} aria-label="Clear time" className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><X size={14} aria-hidden="true" /></button></IconTooltip>}
        </Group>
        <FieldError className="mt-1 block text-xs text-[var(--attention)]" />
      </TimeField>
    </div>
    <p role={Boolean(date) !== Boolean(time) ? 'status' : undefined} className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{date && !time ? 'Select a start time to complete the schedule.' : time && !date ? 'Select a date to complete the schedule.' : 'Optional · AM/PM · Your local time zone.'}</p>
  </div>;
}
