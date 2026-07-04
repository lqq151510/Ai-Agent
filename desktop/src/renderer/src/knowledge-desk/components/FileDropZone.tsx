import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FolderOpen, Upload } from 'lucide-react';

export interface FileDropZoneProps {
  accept?: string;
  description?: string;
  disabled?: boolean;
  file?: File | null;
  onFileSelect: (file: File) => void;
  title?: string;
}

export const FileDropZone = ({
  accept = '.md,.markdown,.pdf,.txt,.html,text/markdown,application/pdf,text/plain,text/html',
  description = '支持 .md、.markdown、.pdf，也兼容 txt/html 文本资料。',
  disabled = false,
  file,
  onFileSelect,
  title = '拖拽文件到此处，或点击选择文件',
}: FileDropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      onFileSelect(droppedFile);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.currentTarget.files?.[0];
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
    event.currentTarget.value = '';
  };

  return (
    <div
      className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 transition-colors ${
        isDragging
          ? 'border-[var(--accent)] bg-[var(--accent-alpha-10)]'
          : 'border-[var(--border-default)] bg-[linear-gradient(135deg,var(--accent-alpha-8),var(--accent-alpha-5))]'
      } ${disabled ? 'cursor-default opacity-60' : ''}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        accept={accept}
        className="kd-hidden-file-input absolute inset-0 hidden"
        onChange={handleInputChange}
        ref={inputRef}
        type="file"
      />
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-alpha-10)] text-[var(--accent)]">
          {file ? <FolderOpen size={24} /> : <Upload size={24} />}
        </div>
        <div>
          <strong className="block font-[family-name:var(--font-sans)] text-lg text-[var(--text-primary)]">
            {file ? file.name : title}
          </strong>
          <span className="mt-1 block text-sm leading-relaxed text-[var(--text-secondary)]">
            {file ? `大小 ${(file.size / 1024).toFixed(1)} KB` : description}
          </span>
        </div>
      </div>
    </div>
  );
};
