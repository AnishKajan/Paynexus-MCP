import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
    PAYNEXUS_API_KEY: z.string().min(1),
    PAYNEXUS_BASE_URL: z.string().url(),
    PAYNEXUS_ENV: z.enum(['sandbox', 'production']),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
});

export const config = envSchema.parse(process.env);
