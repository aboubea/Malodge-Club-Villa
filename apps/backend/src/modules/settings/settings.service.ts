import { Injectable, OnModuleInit } from '@nestjs/common';
import { canonicalCountry } from '../../common/geo';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Company, cleanCompany, readCompany } from './company';

export interface Country { code: string; name: string; flag: string; }

const DEFAULT_COUNTRIES: Country[] = [
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'MA', name: 'Maroc', flag: '🇲🇦' },
  { code: 'ES', name: 'Espagne', flag: '🇪🇸' },
  { code: 'IT', name: 'Italie', flag: '🇮🇹' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'AE', name: 'Émirats Arabes Unis', flag: '🇦🇪' },
  { code: 'TN', name: 'Tunisie', flag: '🇹🇳' },
];

/** "Morocco" and "Maroc" are one country: keep the app's spelling, once. */
function dedupeCountries(list: Country[]): Country[] {
  const out: Country[] = [];
  for (const c of list ?? []) {
    const name = canonicalCountry(c.name);
    if (!name || out.some((o) => o.name === name)) continue;
    out.push({ ...c, name });
  }
  return out;
}

const COMPANY_KEY = 'company';
/** Read again at most once a minute (each server instance keeps its own copy). */
const COMPANY_TTL = 60_000;

@Injectable()
export class SettingsService implements OnModuleInit {
  private company: { value: Company; saved: boolean; at: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  onModuleInit() {
    // The e-mails are signed with the company's name once it has been set.
    this.mail.brand = () => this.companyName();
  }

  /* ───────────── Company (Paramètres › Général) ───────────── */

  async getCompany(): Promise<Company & { saved: boolean }> {
    if (!this.company || Date.now() - this.company.at > COMPANY_TTL) {
      const row = await this.prisma.appSetting.findUnique({ where: { key: COMPANY_KEY } });
      this.company = { value: readCompany(row?.value), saved: !!row, at: Date.now() };
    }
    return { ...this.company.value, saved: this.company.saved };
  }

  async setCompany(input: unknown): Promise<Company & { saved: boolean }> {
    const value = cleanCompany(input);
    await this.prisma.appSetting.upsert({ where: { key: COMPANY_KEY }, create: { key: COMPANY_KEY, value: value as any }, update: { value: value as any } });
    this.company = { value, saved: true, at: Date.now() };
    return { ...value, saved: true };
  }

  /** The name to sign with, once set (null: the built-in one stays). */
  async companyName(): Promise<string | null> {
    const c = await this.getCompany();
    return c.saved ? c.name : null;
  }

  async getCountries(): Promise<Country[]> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'countries' } });
    if (!setting) return DEFAULT_COUNTRIES;
    return dedupeCountries(setting.value as unknown as Country[]);
  }

  async setCountries(input: Country[]): Promise<Country[]> {
    const countries = dedupeCountries(input);
    await this.prisma.appSetting.upsert({
      where: { key: 'countries' },
      update: { value: countries as any },
      create: { key: 'countries', value: countries as any },
    });
    return countries;
  }
}
