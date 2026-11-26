import toast from 'react-hot-toast';
import { Clock, Copy, KeyRound, ListChecks, Lock, MapPin, MessageCircle, Navigation, Phone, ShieldAlert, Sparkles, Wifi } from 'lucide-react';

export interface Booklet {
  guide: {
    welcome?: string;
    checkInTime?: string;
    checkOutTime?: string;
    address?: string;
    directions?: string;
    access?: string;
    wifiName?: string;
    wifiPassword?: string;
    rules?: string;
    practical?: string;
    contactName?: string;
    contactPhone?: string;
    emergency?: string;
  };
  hidden: string[];
  sensitiveFrom: string | null;
}

function Block({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-[13px] font-bold text-ink mb-1.5">
        <Icon size={16} className="text-accent" /> {title}
      </p>
      <div className="text-[14px] text-ink-soft leading-relaxed">{children}</div>
    </section>
  );
}

const Text = ({ children }: { children?: string }) => (children ? <p className="whitespace-pre-line">{children}</p> : null);
const digits = (p: string) => p.replace(/[^0-9]/g, '');

/** The villa's welcome booklet as the guest sees it. */
export function GuideView({ booklet, mapsUrl }: { booklet: Booklet; mapsUrl?: string | null }) {
  const g = booklet.guide;
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast.success('Copié'));
  const empty = !Object.values(g).some(Boolean) && !booklet.hidden.length;
  if (empty) return <p className="text-[14px] text-muted">Le livret d’accueil de la villa arrive bientôt.</p>;

  return (
    <div className="space-y-3">
      {g.welcome && (
        <Block icon={Sparkles} title="Le mot de votre hôte">
          <Text>{g.welcome}</Text>
        </Block>
      )}
      {(g.checkInTime || g.checkOutTime) && (
        <Block icon={Clock} title="Arrivée et départ">
          {g.checkInTime && <p>Arrivée à partir de <b className="text-ink">{g.checkInTime}</b></p>}
          {g.checkOutTime && <p>Départ avant <b className="text-ink">{g.checkOutTime}</b></p>}
        </Block>
      )}
      {(g.address || g.directions || mapsUrl) && (
        <Block icon={MapPin} title="Adresse et accès">
          <Text>{g.address}</Text>
          <Text>{g.directions}</Text>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-semibold text-accent">
              <Navigation size={14} /> Itinéraire
            </a>
          )}
        </Block>
      )}
      {(g.access || booklet.hidden.includes('access')) && (
        <Block icon={KeyRound} title="Entrer dans la villa">
          {g.access ? (
            <Text>{g.access}</Text>
          ) : (
            <p className="flex items-center gap-1.5 text-muted">
              <Lock size={13} /> Visible à partir du {booklet.sensitiveFrom ? new Date(`${booklet.sensitiveFrom}T12:00:00Z`).toLocaleDateString('fr-FR') : '—'}, pour votre sécurité.
            </p>
          )}
        </Block>
      )}
      {(g.wifiName || g.wifiPassword || booklet.hidden.includes('wifiPassword')) && (
        <Block icon={Wifi} title="Wi-Fi">
          {g.wifiName && <p>Réseau : <b className="text-ink">{g.wifiName}</b></p>}
          {g.wifiPassword ? (
            <p className="flex items-center gap-2">
              Mot de passe : <b className="text-ink font-mono">{g.wifiPassword}</b>
              <button type="button" onClick={() => copy(g.wifiPassword!)} className="text-accent" aria-label="Copier le mot de passe">
                <Copy size={14} />
              </button>
            </p>
          ) : (
            booklet.hidden.includes('wifiPassword') && (
              <p className="flex items-center gap-1.5 text-muted">
                <Lock size={13} /> Mot de passe visible quelques jours avant votre arrivée.
              </p>
            )
          )}
        </Block>
      )}
      {g.rules && (
        <Block icon={ListChecks} title="Règles de la maison">
          <Text>{g.rules}</Text>
        </Block>
      )}
      {g.practical && (
        <Block icon={Sparkles} title="Infos pratiques">
          <Text>{g.practical}</Text>
        </Block>
      )}
      {g.contactPhone && (
        <Block icon={Phone} title="Contact sur place">
          <p>
            {g.contactName ? <b className="text-ink">{g.contactName}</b> : null} {g.contactPhone}
          </p>
          <div className="mt-2 flex gap-2">
            <a href={`https://wa.me/${digits(g.contactPhone)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-success text-white text-[13px] font-semibold">
              <MessageCircle size={14} /> WhatsApp
            </a>
            <a href={`tel:${g.contactPhone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-line-strong text-[13px] font-semibold text-ink">
              <Phone size={14} /> Appeler
            </a>
          </div>
        </Block>
      )}
      {g.emergency && (
        <Block icon={ShieldAlert} title="Urgences">
          <Text>{g.emergency}</Text>
        </Block>
      )}
    </div>
  );
}
