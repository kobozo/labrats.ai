import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Bold, Italic, Code, List, Quote, Link } from 'lucide-react';

interface MarkdownInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export const MarkdownInput: React.FC<MarkdownInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message... (Shift+Enter for new line)",
  className = "",
  onKeyDown,
  inputRef: externalRef
}) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalRef || internalRef;
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value, textareaRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
      return;
    }
    
    // Handle formatting shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'b':
          e.preventDefault();
          formatBold();
          return;
        case 'i':
          e.preventDefault();
          formatItalic();
          return;
        case 'k':
          e.preventDefault();
          formatLink();
          return;
      }
    }
    
    // Call parent's onKeyDown if provided (for mention autocomplete)
    onKeyDown?.(e);
    
    // Handle tab for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      
      // Set cursor position after the tab
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
          textareaRef.current.focus();
        }
      }, 0);
    }
  };

  const updateSelection = () => {
    if (textareaRef.current) {
      setSelectionStart(textareaRef.current.selectionStart);
      setSelectionEnd(textareaRef.current.selectionEnd);
    }
  };

  const insertMarkdown = useCallback((before: string, after: string = '', defaultText: string = 'text') => {
    if (!textareaRef.current) return;
    
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selectedText = value.substring(start, end) || defaultText;
    
    const newValue = 
      value.substring(0, start) + 
      before + selectedText + after + 
      value.substring(end);
    
    onChange(newValue);
    
    // Set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = start + before.length + selectedText.length + after.length;
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    }, 0);
  }, [value, onChange, textareaRef]);

  const formatBold = () => insertMarkdown('**', '**', 'bold text');
  const formatItalic = () => insertMarkdown('*', '*', 'italic text');
  const formatCode = () => insertMarkdown('`', '`', 'code');
  const formatCodeBlock = () => insertMarkdown('```\\n', '\\n```', 'code block');
  const formatList = () => insertMarkdown('- ', '', 'list item');
  const formatQuote = () => insertMarkdown('> ', '', 'quote');
  const formatLink = () => insertMarkdown('[', '](url)', 'link text');

  return (
    <div className={`markdown-input-container ${className}`}>
      <div className="formatting-toolbar flex items-center gap-1 p-2 bg-gray-800 rounded-t-lg border border-gray-600 border-b-0">
        <button
          type="button"
          onClick={formatBold}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-300 hover:text-white"
          title="Bold (Ctrl+B)"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onClick={formatItalic}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-300 hover:text-white"
          title="Italic (Ctrl+I)"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={formatCode}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-300 hover:text-white"
          title="Inline Code"
        >
          <Code size={16} />
        </button>
        <button
          type="button"
          onClick={formatCodeBlock}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-300 hover:text-white"
          title="Code Block"
        >
          <Code size={16} className="border border-gray-600 rounded p-0.5" />
        </button>
        <div className="w-px h-5 bg-gray-600 mx-1" />
        <button
          type="button"
          onClick={formatList}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-300 hover:text-white"
          title="List"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={formatQuote}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-300 hover:text-white"
          title="Quote"
        >
          <Quote size={16} />
        </button>
        <button
          type="button"
          onClick={formatLink}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-300 hover:text-white"
          title="Link (Ctrl+K)"
        >
          <Link size={16} />
        </button>
        <div className="ml-auto text-xs text-gray-400">
          Markdown supported • Shift+Enter for new line
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={updateSelection}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 border-t-0 rounded-b-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[48px] max-h-[200px]"
        style={{ 
          overflowY: 'auto',
          lineHeight: '1.5',
          fontFamily: 'inherit'
        }}
      />
    </div>
  );
};