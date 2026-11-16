import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SafePayloadPipe } from './infrastructure/validation/safe-payload.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new SafePayloadPipe());
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'http://localhost:5173',
        'https://inventariofront.vercel.app'
      ];
      
      // Also allow Vercel deployment preview URLs (e.g., https://inventariofront-six.vercel.app)
      const isVercelPreview = origin.startsWith('https://inventariofront-') && origin.endsWith('.vercel.app');
      
      if (allowedOrigins.includes(origin) || isVercelPreview) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });
  const config = new DocumentBuilder()
    .setTitle('Inventory API')
    .setDescription('The Inventory Backend API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
