import { Global, Module } from '@nestjs/common';
import { FastApiService } from './fastapi.service';

@Global()
@Module({
  providers: [FastApiService],
  exports: [FastApiService],
})
export class FastApiModule {}
