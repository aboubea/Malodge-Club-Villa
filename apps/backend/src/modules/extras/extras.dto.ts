import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Matches } from 'class-validator';

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const SETTLEMENT_KINDS = [
  'CLIENT_PAYMENT', 'CLIENT_REFUND', 'PROVIDER_PAYMENT', 'PROVIDER_REFUND',
  'OWNER_PAYOUT', 'OWNER_REFUND', 'EMPLOYEE_PAYOUT', 'EMPLOYEE_REFUND',
] as const;
const METHODS = ['CASH', 'TRANSFER', 'CARD', 'MANUAL'] as const;
const CURRENCY = /^[A-Z]{3}$/;

/* ─────────────────────────── Extras (lines) ─────────────────────────── */

export class ExtraFiltersDto {
  @IsOptional() @IsString() stayId?: string;
  @IsOptional() @IsString() villaId?: string;
  @IsOptional() @IsString() providerId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() sellerId?: string;
  @IsOptional() @IsIn(ORDER_STATUSES) status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['active', 'archived', 'all']) stays?: 'active' | 'archived' | 'all';
  @IsOptional() @IsIn(['true', 'false']) incomplete?: 'true' | 'false';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class UpsertExtraDto {
  @IsString() stayId!: string;
  @IsOptional() @IsString() villaId?: string | null;
  @ValidateIf((o) => !o.label) @IsString() serviceId?: string | null;
  @ValidateIf((o) => !o.serviceId) @IsString() @MinLength(1) @MaxLength(200) label?: string | null;
  @IsOptional() @IsString() providerId?: string | null;
  @IsOptional() @IsString() sellerId?: string | null;
  @IsOptional() @IsDateString() date?: string | null;
  @Type(() => Number) @IsNumber() @Min(0) quantity!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number | null;
  @IsOptional() @IsIn(ORDER_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

/* ───────────────────────────── Settlements ──────────────────────────── */

export class SettlementFiltersDto {
  @IsOptional() @IsIn(['CLIENT', 'PROVIDER', 'OWNER', 'EMPLOYEE']) role?: string;
  @IsOptional() @IsString() personId?: string;
  @IsOptional() @IsIn(['PENDING', 'VALIDATED', 'CANCELLED']) status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class CreateSettlementDto {
  @IsIn(SETTLEMENT_KINDS) kind!: string;
  /** User id of the person (client, provider's user, owner, employee). */
  @IsString() personId!: string;
  /** Required for client settlements: the stay being paid. */
  @IsOptional() @IsString() reservationId?: string | null;
  @IsOptional() @IsDateString() date?: string | null;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsIn(METHODS) method?: string | null;
  @IsOptional() @IsString() @MaxLength(120) reference?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
  /** Admins may record an already validated settlement in one step. */
  @IsOptional() @IsBoolean() validate?: boolean;
}

export class UpdateSettlementDto {
  @IsOptional() @IsDateString() date?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @IsIn(METHODS) method?: string | null;
  @IsOptional() @IsString() @MaxLength(120) reference?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

/* ─────────────────────────────── Settings ───────────────────────────── */

export class ExtrasSettingsDto {
  @Type(() => Number) @IsNumber() @Min(0) @Max(5) markup!: number;
}

export class CreatePersonDto {
  @IsIn(['CLIENT', 'PROVIDER', 'OWNER', 'EMPLOYEE']) role!: 'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE';
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) commissionRate?: number | null;
  @IsOptional() @IsIn(['MALODGE_MARGIN', 'TOTAL_MARGIN']) commissionBase?: 'MALODGE_MARGIN' | 'TOTAL_MARGIN' | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class UpdatePersonDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) commissionRate?: number | null;
  @IsOptional() @IsIn(['MALODGE_MARGIN', 'TOTAL_MARGIN']) commissionBase?: 'MALODGE_MARGIN' | 'TOTAL_MARGIN' | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class UpdateVillaExtrasDto {
  @IsOptional() @IsString() ownerId?: string | null;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
}

export class MergeVillaDto {
  /** Villa that is kept (typically the Lodgify listing). */
  @IsString() targetId!: string;
}

export class UpsertStayDto {
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @IsString() villaId!: string;
  /** Existing client user; when omitted a client record without app access is created from the label. */
  @IsOptional() @IsString() clientId?: string | null;
  @IsOptional() @IsDateString() checkIn?: string | null;
  @IsOptional() @IsDateString() checkOut?: string | null;
  @IsOptional() @IsBoolean() archived?: boolean;
  /** false = dates confirmed by hand; true = still to confirm. */
  @IsOptional() @IsBoolean() datesEstimated?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class UpsertCatalogueItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(80) unit?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) publicPrice?: number | null;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsString() defaultProviderId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export { CURRENCY };

export class ConvertCurrencyDto {
  @IsString() @Matches(/^[A-Za-z]{3}$/) to!: string;
}
