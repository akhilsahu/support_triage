import React, { useState, useEffect, useRef } from 'react'
import { useSectionEditor } from '../preview/SectionEditorContext'

export interface InlineEditableTextProps {
  value?: string | null
  onSave: (newValue: string) => void
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div'
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  multiline?: boolean
  ariaLabel?: string
}

/**
 * In-place editable text component.
 * In appearance preview mode (when SectionEditorContext is available), clicking
 * the text transforms it into an inline input/textarea allowing direct typing.
 * Changes are committed on Enter (or blur) and save with the appearance screen.
 */
export function InlineEditableText({
  value = '',
  onSave,
  as: Component = 'span',
  className = '',
  style,
  placeholder = 'Click to edit…',
  multiline = false,
  ariaLabel,
}: InlineEditableTextProps) {
  const sectionEditor = useSectionEditor()
  const [isEditing, setIsEditing] = useState(false)
  const [currentVal, setCurrentVal] = useState(value || '')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    setCurrentVal(value || '')
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Public/read-only view: render static semantic element without placeholder text
  if (!sectionEditor) {
    if (!value?.trim()) return null
    return (
      <Component className={className} style={style}>
        {value}
      </Component>
    )
  }

  const handleCommit = () => {
    setIsEditing(false)
    const trimmed = currentVal.trim()
    if (trimmed !== (value || '').trim()) {
      onSave(trimmed)
    }
  }

  const handleCancel = () => {
    setCurrentVal(value || '')
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      handleCancel()
    } else if (e.key === 'Enter') {
      if (!multiline || (!e.shiftKey && multiline)) {
        e.preventDefault()
        e.stopPropagation()
        handleCommit()
      }
    }
  }

  if (isEditing) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={currentVal}
          onChange={(e) => setCurrentVal(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel || placeholder}
          className={`appearance-inline-input ${className}`}
          style={style}
          rows={3}
        />
      )
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={currentVal}
        onChange={(e) => setCurrentVal(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel || placeholder}
        className={`appearance-inline-input ${className}`}
        style={style}
      />
    )
  }

  const displayText = value?.trim() ? value : placeholder
  const isPlaceholder = !value?.trim()

  return (
    <Component
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setIsEditing(true)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel ? `Edit ${ariaLabel}` : `Edit ${displayText}`}
      title="Click to edit text"
      className={`appearance-editable-text ${isPlaceholder ? 'opacity-60 italic' : ''} ${className}`}
      style={style}
    >
      {displayText}
    </Component>
  )
}
