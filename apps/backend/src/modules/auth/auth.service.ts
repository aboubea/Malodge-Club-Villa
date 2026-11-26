import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AttemptsService, Client } from './attempts.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { isPublicPassword } from '../../common/security/public-passwords';
import { appSecret } from '../../common/security/secrets';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private mail: MailService,
    private attempts: AttemptsService,
  ) {}

  async login(dto: LoginDto, client: Client = { ip: null, userAgent: null }) {
    const key = dto.email.trim().toLowerCase();
    // Locked after too many failures: the password is not even checked.
    await this.attempts.assertLoginAllowed(key, client);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const passwordMatch = !!user && user.isActive && user.canLogin && (await bcrypt.compare(dto.password, user.password));
    if (!passwordMatch) {
      await this.attempts.loginFailed(key, client);
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.attempts.loginSucceeded(key, client, user.id);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { sub: user.id, email: user.email, role: user.role, countries: user.countries || [] };

    const accessToken = this.jwtService.sign(payload, {
      secret: appSecret('access'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: appSecret('refresh'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    const { password: _, ...userWithoutPassword } = user;

    return {
      accessToken,
      refreshToken,
      user: {
        ...userWithoutPassword,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: appSecret('refresh'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload = { sub: user.id, email: user.email, role: user.role, countries: user.countries || [] };
      const accessToken = this.jwtService.sign(newPayload, {
        secret: appSecret('access'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
      });

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        countries: true,
      },
    });

    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async register(dto: RegisterDto, client: Client = { ip: null, userAgent: null }) {
    await this.attempts.assertSignupAllowed(dto.email.trim().toLowerCase(), client);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Un compte existe déjà avec cet email.');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: 'CLIENT',
        isActive: true,
      },
    });

    const payload = { sub: user.id, email: user.email, role: user.role, countries: user.countries || [] };
    const accessToken = this.jwtService.sign(payload, {
      secret: appSecret('access'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: appSecret('refresh'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    const { password: _, ...userWithoutPassword } = user;
    return {
      accessToken,
      refreshToken,
      user: {
        ...userWithoutPassword,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        lastLoginAt: null,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, client: Client = { ip: null, userAgent: null }): Promise<{ message: string }> {
    // Always return the same message to prevent email enumeration
    const safeResponse = { message: 'Si cet email existe, vous recevrez un lien de réinitialisation.' };
    // Too many requests: same answer, no e-mail (no mailbox flooding, no hint).
    if (!(await this.attempts.resetAllowed(dto.email.trim().toLowerCase(), client))) return safeResponse;

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isActive) return safeResponse;

    // Invalidate any existing tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() }, // expire them immediately
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    await this.mail.sendPasswordReset(user.email, user.firstName, token);

    return safeResponse;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!record) {
      throw new BadRequestException('Lien de réinitialisation invalide ou expiré.');
    }

    if (record.usedAt) {
      throw new BadRequestException('Ce lien a déjà été utilisé.');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Ce lien a expiré. Veuillez en demander un nouveau.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.mail.sendPasswordChanged(record.user.email, record.user.firstName);

    return { message: 'Mot de passe réinitialisé avec succès.' };
  }

  /** The signed-in user changes their own password (the current one is required). */
  async changePassword(userId: string, dto: ChangePasswordDto, client: Client = { ip: null, userAgent: null }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    const key = user.email.trim().toLowerCase();
    await this.attempts.assertLoginAllowed(key, client);
    if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
      await this.attempts.loginFailed(key, client);
      throw new BadRequestException('Mot de passe actuel incorrect.');
    }
    if (dto.newPassword === dto.currentPassword) throw new BadRequestException('Le nouveau mot de passe doit être différent de l’actuel.');
    if (isPublicPassword(dto.newPassword)) throw new BadRequestException('Ce mot de passe est public : choisissez-en un autre.');
    await this.prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(dto.newPassword, 12) } });
    await this.prisma.auditLog.create({ data: { action: 'PASSWORD_CHANGED', entity: 'auth', entityId: key, userId, ipAddress: client.ip, userAgent: client.userAgent } });
    return { message: 'Mot de passe modifié.' };
  }

  /**
   * First administrator of an empty database. In production it is created only from
   * SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD (never with a password written in the code).
   */
  async ensureSuperAdmin() {
    const existing = await this.prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    if (!existing) {
      const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
      const email = (process.env.SUPER_ADMIN_EMAIL ?? '').trim() || 'superadmin@malodge.com';
      const password = (process.env.SUPER_ADMIN_PASSWORD ?? '').trim() || (production ? '' : 'SuperAdmin2024!');
      if (!password || (production && isPublicPassword(password))) {
        console.warn('Aucun super administrateur : définissez SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD pour en créer un.');
        return;
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName: 'Super',
          lastName: 'Admin',
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });
      console.log('Super admin account created (check environment variables for credentials)');
    }
  }
}
