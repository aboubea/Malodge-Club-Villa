import { FolderOpen } from 'lucide-react';

interface Props {
  documentName: string;
  excerpt: string;
}

export function AiSourceCard({ documentName, excerpt }: Props) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#1A1A1D] border border-[#242428]">
      <FolderOpen size={13} className="text-[#C9A96E] shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#C9A96E] truncate">{documentName}</p>
        <p className="text-[10px] text-[#6B6B6F] mt-0.5 line-clamp-2">{excerpt}</p>
      </div>
    </div>
  );
}
