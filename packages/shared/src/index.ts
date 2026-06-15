// ============================================================
// ENUMS
// ============================================================

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  PROVIDER = 'PROVIDER',
  CLIENT = 'CLIENT',
}

export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CARD = 'CARD',
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  MANUAL = 'MANUAL',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

// ============================================================
// API RESPONSE WRAPPERS
// ============================================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

// ============================================================
// USER DTOs
// ============================================================

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatar?: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  countries?: string[];
}

export interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: Role;
}

export interface UpdateUserDto {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  role?: Role;
  isActive?: boolean;
  countries?: string[];
}

// ============================================================
// AUTH DTOs
// ============================================================

export interface LoginDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

// ============================================================
// VILLA DTOs
// ============================================================

export interface VillaDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  address: string;
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  coverImage?: string | null;
  images: string[];
  amenities: string[];
  rules: string[];
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  isActive: boolean;
  logifyId?: string | null;
  customFields?: Array<{ label: string; value: string }> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVillaDto {
  name: string;
  description?: string;
  address: string;
  city: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  coverImage?: string;
  images?: string[];
  amenities?: string[];
  rules?: string[];
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
}

export interface UpdateVillaDto {
  name?: string;
  description?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  coverImage?: string;
  images?: string[];
  amenities?: string[];
  rules?: string[];
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  isActive?: boolean;
  customFields?: Array<{ label: string; value: string }>;
}

// ============================================================
// SERVICE CATEGORY DTOs
// ============================================================

export interface ServiceCategoryDto {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateServiceCategoryDto {
  name: string;
  icon?: string;
  color?: string;
}

// ============================================================
// SERVICE DTOs
// ============================================================

export interface ServiceDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  images: string[];
  basePrice: number;
  duration?: number | null;
  isActive: boolean;
  requiresDate: boolean;
  requiresTime: boolean;
  categoryId: string;
  category?: ServiceCategoryDto;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceDto {
  name: string;
  description?: string;
  images?: string[];
  basePrice: number;
  duration?: number;
  requiresDate?: boolean;
  requiresTime?: boolean;
  categoryId: string;
}

export interface UpdateServiceDto {
  name?: string;
  description?: string;
  images?: string[];
  basePrice?: number;
  duration?: number;
  requiresDate?: boolean;
  requiresTime?: boolean;
  categoryId?: string;
  isActive?: boolean;
}

// ============================================================
// RESERVATION DTOs
// ============================================================

export interface ReservationDto {
  id: string;
  logifyId?: string | null;
  villaId: string;
  clientId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalAmount: number;
  status: ReservationStatus;
  notes?: string | null;
  source?: string | null;
  villa?: VillaDto;
  client?: UserDto;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReservationDto {
  villaId: string;
  clientId: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  totalAmount: number;
  notes?: string;
  source?: string;
}

export interface UpdateReservationDto {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  totalAmount?: number;
  status?: ReservationStatus;
  notes?: string;
}

// ============================================================
// PROVIDER DTOs
// ============================================================

export interface ProviderDto {
  id: string;
  userId: string;
  companyName?: string | null;
  siret?: string | null;
  iban?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user?: UserDto;
}

export interface CreateProviderDto {
  userId: string;
  companyName?: string;
  siret?: string;
  iban?: string;
}

export interface UpdateProviderDto {
  companyName?: string;
  siret?: string;
  iban?: string;
  isActive?: boolean;
}

// ============================================================
// ORDER DTOs
// ============================================================

export interface OrderItemDto {
  id: string;
  orderId: string;
  serviceId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes?: string | null;
  service?: ServiceDto;
}

export interface OrderDto {
  id: string;
  reservationId?: string | null;
  clientId: string;
  providerId?: string | null;
  villaId?: string | null;
  status: OrderStatus;
  totalAmount: number;
  commission: number;
  notes?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItemDto[];
  client?: UserDto;
  provider?: ProviderDto;
}

// ============================================================
// PAGINATION / QUERY DTOs
// ============================================================

export interface PaginationQueryDto {
  page?: number;
  limit?: number;
  search?: string;
}

export interface UserQueryDto extends PaginationQueryDto {
  role?: Role;
  isActive?: boolean;
}

export interface VillaQueryDto extends PaginationQueryDto {
  city?: string;
  isActive?: boolean;
}

export interface ReservationQueryDto extends PaginationQueryDto {
  villaId?: string;
  clientId?: string;
  status?: ReservationStatus;
}

// ============================================================
// DASHBOARD KPI DTOs
// ============================================================

export interface DashboardKpiDto {
  totalRevenue: number;
  serviceRevenue: number;
  occupancyRate: number;
  activeStays: number;
  pendingOrders: number;
  satisfactionScore: number;
  revenueChange: number;
  occupancyChange: number;
}
