import 'reflect-metadata';
import { BadRequestException, Body, Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { estimate, validateScenario } from '@houseworthit/calculations';
import { AccountsController } from './accounts';

@Controller('v1')
class AppController {
  @Get('health') health() { return { status: 'ok', service: 'houseworthit' }; }
  @Post('estimate') calculate(@Body() input: unknown) {
    try { return estimate(validateScenario(input)); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid scenario'); }
  }
}
@Module({ controllers: [AppController, AccountsController] })
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4400), process.env.HOST || '127.0.0.1');
}
void bootstrap();
