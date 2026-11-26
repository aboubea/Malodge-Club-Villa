import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [FxController],
  providers: [FxService],
  exports: [FxService],
})
export class FxModule {}
