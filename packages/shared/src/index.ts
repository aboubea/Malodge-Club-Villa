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
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
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
  createdAt: string;
  updatedAt: string;
  managers?: UserDto[];
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
  logifyId?: string;
}

export interface UpdateVillaDto extends Partial<CreateVillaDto> {
  isActive?: boolean;
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

export interface UpdateServiceDto extends Partial<CreateServiceDto> {
  isActive?: boolean;
}

// ============================================================
// PROVIDER DTOs
// ============================================================

export interface ProviderDto {
  id: string;
  userId: string;
  companyName?: string | null;
  siret?: string | null;
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

export interface UpdateProviderDto extends Partial<CreateProviderDto> {
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
  createdAt: string;
  updatedAt: string;
  villa?: VillaDto;
  client?: UserDto;
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

export interface UpdateReservationDto extends Partial<CreateReservationDto> {
  status?: ReservationStatus;
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

export interface CreateOrderDto {
  reservationId?: string;
  clientId: string;
  providerId?: string;
  villaId?: string;
  notes?: string;
  scheduledAt?: string;
  items: {
    serviceId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }[];
}

// ============================================================
// PAYMENT DTOs
// ============================================================

export interface PaymentDto {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  stripePaymentId?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// DOCUMENT DTOs
// ============================================================

export interface DocumentDto {
  id: string;
  villaId?: string | null;
  name: string;
  type: string;
  fileUrl: string;
  fileSize?: number | null;
  version: number;
  category: string;
  uploadedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// MESSAGE & CONVERSATION DTOs
// ============================================================

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  fileUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
  sender?: UserDto;
}

export interface ConversationDto {
  id: string;
  reservationId?: string | null;
  topic?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  messages?: MessageDto[];
}

// ============================================================
// AUDIT LOG DTOs
// ============================================================

export interface AuditLogDto {
  id: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: UserDto;
}

// ============================================================
// DASHBOARD DTOs
// ============================================================

export interface DashboardKpiDto {
  totalRevenue: number;
  serviceRevenue: number;
  occupancyRate: number;
  activeStays: number;
  pendingOrders: number;
  satisfactionScore: number;
  revenueGrowth: number;
  occupancyGrowth: number;
}

export interface TopVillaDto {
  id: string;
  name: string;
  city: string;
  coverImage?: string | null;
  revenue: number;
  occupancyRate: number;
  reservationCount: number;
}
