import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Role } from '@malodge/shared';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ProviderSpaceService } from './provider-space.service';

class RespondDto {
  @IsIn(['accept', 'reject'])
  action: 'accept' | 'reject';
}

/**
 * Provider space. The provider routes are reachable without a session: they are
 * authorised by the signed personal link (header X-Provider-Key) or by a provider's
 * own session (Authorization), checked in the service.
 */
@ApiTags('Provider space')
@Controller('provider-space')
export class ProviderSpaceController {
  constructor(private space: ProviderSpaceService) {}

  @Get('me')
  @Public()
  async me(@Headers('x-provider-key') key?: string, @Headers('authorization') auth?: string) {
    return this.space.overview(await this.space.resolve(key, auth));
  }

  @Post('missions/:id/respond')
  @Public()
  async respond(@Param('id') id: string, @Body() dto: RespondDto, @Headers('x-provider-key') key?: string, @Headers('authorization') auth?: string) {
    return this.space.respond(await this.space.resolve(key, auth), id, dto.action);
  }

  @Post('missions/:id/done')
  @Public()
  async done(@Param('id') id: string, @Headers('x-provider-key') key?: string, @Headers('authorization') auth?: string) {
    return this.space.complete(await this.space.resolve(key, auth), id);
  }

  /* Team: the personal link to send, and switching off the links sent. */

  @Post('links/:providerId')
  @Roles(Role.MANAGER)
  link(@Param('providerId') providerId: string) {
    return this.space.linkFor(providerId);
  }

  @Post('links/:providerId/revoke')
  @Roles(Role.MANAGER)
  revoke(@Param('providerId') providerId: string) {
    return this.space.revoke(providerId);
  }
}
