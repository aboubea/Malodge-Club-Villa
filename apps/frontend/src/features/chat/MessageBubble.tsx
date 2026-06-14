import { cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { FileText } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  type: string;
  fileUrl?: string;
  createdAt: string;
  sender: { id: string; firstName: string; lastName: string; avatar?: string };
}

interface Props {
  message: Message;
  isMe: boolean;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, isMe }: Props) {
  return (
    <div className={cn('flex items-end gap-2 mb-3', isMe ? 'flex-row-reverse' : 'flex-row')}>
      {!isMe && (
        <Avatar
          src={message.sender.avatar}
          firstName={message.sender.firstName}
          lastName={message.sender.lastName}
          size="xs"
        />
      )}
      <div
        className={cn(
          'max-w-xs lg:max-w-md',
          isMe ? 'items-end' : 'items-start',
          'flex flex-col gap-1',
        )}
      >
        {!isMe && (
          <span className="text-[10px] text-[#6B6B6F] px-1">{message.sender.firstName}</span>
        )}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isMe
              ? 'bg-[#C9A96E] text-[#0A0A0B] rounded-br-sm'
              : 'bg-[#1A1A1D] text-[#F5F0EB] border border-[#242428] rounded-bl-sm',
          )}
        >
          {message.type === 'text' && <p>{message.content}</p>}
          {message.type === 'image' && message.fileUrl && (
            <div>
              <img
                src={message.fileUrl}
                alt="Image"
                className="rounded-lg max-w-full max-h-48 object-cover"
              />
              {message.content && <p className="mt-1">{message.content}</p>}
            </div>
          )}
          {message.type === 'file' && message.fileUrl && (
            <a
              href={message.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 hover:opacity-80',
                isMe ? 'text-[#0A0A0B]' : 'text-[#C9A96E]',
              )}
            >
              <FileText size={14} />
              <span className="text-xs underline">{message.content || 'Fichier'}</span>
            </a>
          )}
        </div>
        <span className="text-[10px] text-[#6B6B6F] px-1">{formatTime(message.createdAt)}</span>
      </div>
    </div>
  );
}
