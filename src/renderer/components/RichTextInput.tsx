import React, { useEffect, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TiptapLink from '@tiptap/extension-link';
import { common, createLowlight } from 'lowlight';
import {
  Bold,
  Italic,
  Code,
  List,
  Quote,
  Link,
  Heading1,
  Heading2,
  ListOrdered
} from 'lucide-react';

const lowlight = createLowlight(common);

interface RichTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export interface RichTextInputRef {
  focus: () => void;
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
}

const RichTextInput = forwardRef<RichTextInputRef, RichTextInputProps>(({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message... (Shift+Enter for new line)",
  className = "",
  onKeyDown
}, ref) => {
  // Detect platform for keyboard shortcuts
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl+';
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We'll use CodeBlockLowlight instead
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'code-block',
        },
      }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-link',
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[48px] max-h-[200px] overflow-y-auto px-4 py-3',
      },
      handleKeyDown: (view, event) => {
        // Check if we're in a code block
        const { $from } = view.state.selection;
        const isInCodeBlock = $from.parent.type.name === 'codeBlock';
        
        // Handle submit on Enter (without Shift) - but not in code blocks
        if (event.key === 'Enter' && !event.shiftKey && !isInCodeBlock) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        
        // In code blocks, Enter should always create a new line
        if (event.key === 'Enter' && isInCodeBlock) {
          // Let Tiptap handle it naturally - this will create a new line
          return false;
        }
        
        // Handle @mention trigger
        if (event.key === '@') {
          onKeyDown?.(event as any);
        }
        
        // Ensure Cmd+A / Ctrl+A works properly
        if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
          // Let Tiptap handle it naturally
          return false;
        }
        
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown();
      onChange(markdown);
    },
  });

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    getMarkdown: () => {
      if (!editor) return '';
      const json = editor.getJSON();
      return jsonToMarkdown(json);
    },
    setMarkdown: (markdown: string) => {
      if (!editor) return;
      editor.commands.setContent(markdownToHtml(markdown));
    }
  }));

  // Update editor content when value prop changes
  useEffect(() => {
    if (editor && value !== editor.storage.markdown?.getMarkdown?.()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const setLink = () => {
    const url = window.prompt('URL');
    if (url) {
      editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  // Convert editor JSON to markdown
  const jsonToMarkdown = (doc: any): string => {
    let markdown = '';
    
    const processNode = (node: any): string => {
      let result = '';
      
      switch (node.type) {
        case 'text':
          result = node.text || '';
          if (node.marks) {
            node.marks.forEach((mark: any) => {
              switch (mark.type) {
                case 'bold':
                  result = `**${result}**`;
                  break;
                case 'italic':
                  result = `*${result}*`;
                  break;
                case 'code':
                  result = `\`${result}\``;
                  break;
                case 'link':
                  result = `[${result}](${mark.attrs.href})`;
                  break;
              }
            });
          }
          break;
          
        case 'paragraph':
          result = node.content?.map(processNode).join('') || '';
          result += '\n\n';
          break;
          
        case 'heading':
          const level = node.attrs.level;
          const hashes = '#'.repeat(level);
          result = `${hashes} ${node.content?.map(processNode).join('') || ''}\n\n`;
          break;
          
        case 'bulletList':
          result = node.content?.map((item: any) => 
            `- ${item.content[0]?.content?.map(processNode).join('') || ''}`
          ).join('\n') + '\n\n';
          break;
          
        case 'orderedList':
          result = node.content?.map((item: any, index: number) => 
            `${index + 1}. ${item.content[0]?.content?.map(processNode).join('') || ''}`
          ).join('\n') + '\n\n';
          break;
          
        case 'codeBlock':
          const lang = node.attrs.language || '';
          result = `\`\`\`${lang}\n${node.content?.map(processNode).join('') || ''}\n\`\`\`\n\n`;
          break;
          
        case 'blockquote':
          result = node.content?.map((p: any) => 
            `> ${p.content?.map(processNode).join('') || ''}`
          ).join('\n') + '\n\n';
          break;
          
        case 'hardBreak':
          result = '\n';
          break;
          
        default:
          if (node.content) {
            result = node.content.map(processNode).join('');
          }
      }
      
      return result;
    };
    
    if (doc.content) {
      markdown = doc.content.map(processNode).join('').trim();
    }
    
    return markdown;
  };

  // Basic markdown to HTML conversion (for setting content)
  const markdownToHtml = (markdown: string): string => {
    // This is a simplified conversion - Tiptap will parse it
    return markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
      .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
      .replace(/^- (.*?)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  };

  // Store markdown conversion function in editor storage
  if (editor) {
    editor.storage.markdown = {
      getMarkdown: () => jsonToMarkdown(editor.getJSON())
    };
  }

  return (
    <div className={`rich-text-input ${className}`}>
      <div className="toolbar flex items-center gap-1 p-2 bg-gray-800 rounded-t-lg border border-gray-600 border-b-0">
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('bold') 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title={`Bold (${modKey}B)`}
        >
          <Bold size={16} />
        </button>
        
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('italic') 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title={`Italic (${modKey}I)`}
        >
          <Italic size={16} />
        </button>
        
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleCode().run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('code') 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title="Inline Code"
        >
          <Code size={16} />
        </button>
        
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('codeBlock') 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title="Code Block"
        >
          <Code size={16} className="border border-gray-600 rounded p-0.5" />
        </button>
        
        <div className="w-px h-5 bg-gray-600 mx-1" />
        
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('heading', { level: 1 }) 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </button>
        
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('heading', { level: 2 }) 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </button>
        
        <div className="w-px h-5 bg-gray-600 mx-1" />
        
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('bulletList') 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('orderedList') 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </button>
        
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('blockquote') 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title="Quote"
        >
          <Quote size={16} />
        </button>
        
        <button
          type="button"
          onClick={setLink}
          className={`p-1.5 rounded transition-colors ${
            editor?.isActive('link') 
              ? 'bg-gray-700 text-white' 
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title={`Link (${modKey}K)`}
        >
          <Link size={16} />
        </button>
        
        <div className="ml-auto text-xs text-gray-400">
          Rich text • Shift+Enter for new line • Enter in code blocks adds line
        </div>
      </div>
      
      <div className="editor-wrapper bg-gray-700 border border-gray-600 border-t-0 rounded-b-lg">
        <EditorContent 
          editor={editor}
          className="rich-text-editor"
        />
      </div>
      
      <style>{`
        .ProseMirror {
          min-height: 48px;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        
        .ProseMirror:focus {
          outline: none;
        }
        
        /* Prose styling for dark mode */
        .prose {
          color: #e5e7eb;
        }
        
        .prose strong {
          color: #f3f4f6;
          font-weight: 600;
        }
        
        .prose em {
          color: #e5e7eb;
          font-style: italic;
        }
        
        .prose code {
          color: #a78bfa;
          background-color: #374151;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        
        .prose pre {
          background-color: #1f2937;
          color: #e5e7eb;
          padding: 0.75rem 1rem;
          border-radius: 0.375rem;
          overflow-x: auto;
          margin: 0.5rem 0;
        }
        
        .prose pre code {
          background-color: transparent;
          padding: 0;
          color: inherit;
          font-size: 0.875rem;
        }
        
        .prose h1 {
          color: #f3f4f6;
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0.5rem 0;
        }
        
        .prose h2 {
          color: #f3f4f6;
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.5rem 0;
        }
        
        .prose ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        
        .prose ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        
        .prose li {
          margin: 0.25rem 0;
        }
        
        .prose blockquote {
          border-left: 4px solid #4b5563;
          padding-left: 1rem;
          margin: 0.5rem 0;
          color: #d1d5db;
          font-style: italic;
        }
        
        .prose a {
          color: #60a5fa;
          text-decoration: underline;
        }
        
        .prose a:hover {
          color: #93bbfc;
        }
        
        /* Code highlighting */
        .hljs-comment,
        .hljs-quote {
          color: #6b7280;
        }
        
        .hljs-variable,
        .hljs-template-variable,
        .hljs-attribute,
        .hljs-tag,
        .hljs-name,
        .hljs-regexp,
        .hljs-link,
        .hljs-name,
        .hljs-selector-id,
        .hljs-selector-class {
          color: #f87171;
        }
        
        .hljs-number,
        .hljs-meta,
        .hljs-built_in,
        .hljs-builtin-name,
        .hljs-literal,
        .hljs-type,
        .hljs-params {
          color: #fb923c;
        }
        
        .hljs-string,
        .hljs-symbol,
        .hljs-bullet {
          color: #a3e635;
        }
        
        .hljs-title,
        .hljs-section {
          color: #60a5fa;
        }
        
        .hljs-keyword,
        .hljs-selector-tag {
          color: #c084fc;
        }
      `}</style>
    </div>
  );
});

RichTextInput.displayName = 'RichTextInput';

export { RichTextInput };