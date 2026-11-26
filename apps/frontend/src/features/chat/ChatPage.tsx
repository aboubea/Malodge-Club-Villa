import { useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { NewConversationModal } from './NewConversationModal';

export function ChatPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Messages"
        description="Échangez avec l'équipe et les clients"
      >
        <Button size="sm" onClick={() => setShowNewConv(true)}>
          <Plus size={14} className="mr-1.5" />
          Nouvelle conversation
        </Button>
      </PageHeader>
      <div className="flex flex-1 overflow-hidden gap-0 border border-line rounded-xl mx-5 mb-5">
        <ConversationList
          selectedId={selectedConvId}
          onSelect={setSelectedConvId}
          onNew={() => setShowNewConv(true)}
        />
        <div className="flex-1 border-l border-line">
          {selectedConvId ? (
            <MessageThread conversationId={selectedConvId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center">
                <MessageSquare size={24} className="text-muted" />
              </div>
              <div>
                <p className="text-sm text-ink">Sélectionnez une conversation</p>
                <p className="text-xs text-muted mt-1">ou créez-en une nouvelle</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {showNewConv && (
        <NewConversationModal
          onClose={() => setShowNewConv(false)}
          onCreated={(convId) => {
            setSelectedConvId(convId);
            setShowNewConv(false);
          }}
        />
      )}
    </div>
  );
}
