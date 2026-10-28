import dotenv from 'dotenv';
dotenv.config({ override: true });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { getCorsOptions } from './common/config/cors.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.enableCors(getCorsOptions());

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
