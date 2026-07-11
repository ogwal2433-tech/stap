import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';

interface LetterEditorProps {
  content:     string; // initial/current HTML content
  onChange?:   (html: string) => void; // undefined = read-only mode
  readOnly?:   boolean;
  minHeight?:  string;
  placeholder?: string;
}

const TOOLBAR_BTN = (active: boolean): React.CSSProperties => ({
  height:       '28px',
  border:       `1px solid ${active ? '#1B3A6B' : '#ced4da'}`,
  borderRadius: '4px',
  background:   active ? '#D6E0F0' : '#fff',
  cursor:       'pointer',
  color:        '#1A1A1A',
});

export function LetterEditor({ content, onChange, readOnly, minHeight, placeholder }: LetterEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Placeholder.configure({ placeholder: placeholder ?? 'Start typing the letter…' }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  if (!editor) return null;

  return (
    <div style={{
      border:       readOnly ? 'none' : '1px solid #ced4da',
      borderRadius: '0.5rem',
      overflow:     'hidden',
      background:   readOnly ? '#f8f9fa' : '#fff',
      boxShadow:    readOnly ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
    }}>
      {!readOnly && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '6px 8px',
          borderBottom: '1px solid #e9ecef', background: '#F2F4F7',
        }}>
          {[
            { label: 'B', style: { fontWeight: 'bold' as const },       action: () => editor.chain().focus().toggleBold().run(),      active: editor.isActive('bold') },
            { label: 'I', style: { fontStyle: 'italic' as const },      action: () => editor.chain().focus().toggleItalic().run(),    active: editor.isActive('italic') },
            { label: 'U', style: { textDecoration: 'underline' as const }, action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline') },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
              style={{ width: '30px', fontSize: '0.85rem', ...TOOLBAR_BTN(btn.active), ...btn.style }}
            >
              {btn.label}
            </button>
          ))}

          <div style={{ width: '1px', background: '#ced4da', margin: '0 4px' }} />

          {([1, 2, 3] as const).map((level) => (
            <button
              key={level}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level }).run(); }}
              style={{ padding: '0 6px', fontSize: '0.75rem', fontWeight: 600, ...TOOLBAR_BTN(editor.isActive('heading', { level })) }}
            >
              H{level}
            </button>
          ))}

          <div style={{ width: '1px', background: '#ced4da', margin: '0 4px' }} />

          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign(align).run(); }}
              title={`Align ${align}`}
              style={{ width: '30px', fontSize: '0.85rem', ...TOOLBAR_BTN(editor.isActive({ textAlign: align })) }}
            >
              {align === 'left' ? '⇤' : align === 'center' ? '≡' : '⇥'}
            </button>
          ))}

          <div style={{ width: '1px', background: '#ced4da', margin: '0 4px' }} />

          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
            style={{ padding: '0 8px', fontSize: '0.78rem', ...TOOLBAR_BTN(editor.isActive('bulletList')) }}
          >
            • List
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
            style={{ padding: '0 8px', fontSize: '0.78rem', ...TOOLBAR_BTN(editor.isActive('orderedList')) }}
          >
            1. List
          </button>
        </div>
      )}

      <div style={{
        padding:     readOnly ? '32px 40px' : '20px 24px',
        minHeight:   minHeight ?? '320px',
        maxHeight:   readOnly ? '480px' : '520px',
        overflowY:   'auto',
        background:  '#fff',
        borderLeft:  readOnly ? '1px solid #e9ecef' : 'none',
        borderRight: readOnly ? '1px solid #e9ecef' : 'none',
      }}>
        <style>{`
          .ProseMirror { outline: none; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1A1A1A; line-height: 1.8; }
          .ProseMirror p { margin-bottom: 10px; }
          .ProseMirror h1 { font-size: 1.3rem; font-weight: 700; color: #1B3A6B; margin-bottom: 12px; }
          .ProseMirror h2 { font-size: 1.1rem; font-weight: 700; color: #1B3A6B; margin-bottom: 10px; }
          .ProseMirror h3 { font-size: 1rem; font-weight: 600; margin-bottom: 8px; }
          .ProseMirror ul { padding-left: 20px; margin-bottom: 10px; }
          .ProseMirror ol { padding-left: 20px; margin-bottom: 10px; }
          .ProseMirror li { margin-bottom: 4px; }
          .ProseMirror p.is-editor-empty:first-child::before {
            content: attr(data-placeholder); color: #adb5bd; pointer-events: none; float: left; height: 0;
          }
        `}</style>
        <EditorContent editor={editor} />
      </div>

      {!readOnly && (
        <div style={{
          padding: '4px 12px', borderTop: '1px solid #e9ecef', background: '#F2F4F7',
          fontSize: '0.72rem', color: '#6c757d', textAlign: 'right',
        }}>
          {editor.getText().length} characters
        </div>
      )}
    </div>
  );
}
