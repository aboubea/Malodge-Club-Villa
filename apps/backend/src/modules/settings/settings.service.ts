import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getCountries(): Promise<Country[]> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'countries' } });
    if (!setting) return DEFAULT_COUNTRIES;
    return setting.value as unknown as Country[];
  }

  async setCountries(countries: Country[]): Promise<Country[]> {
    await this.prisma.appSetting.upsert({
      where: { key: 'countries' },
      update: { value: countries as any },
      create: { key: 'countries', value: countries as any },
    });
    return countries;
  }
}
