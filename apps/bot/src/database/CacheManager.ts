import Redis from 'ioredis';

export class CacheManager {
  private redis: Redis;
  private static instance: CacheManager;

  private constructor() {
    // الاتصال بـ Redis باستخدام الرابط الممرر من المتغيرات البيئية
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    this.redis.on('connect', () => console.log('[REDIS] Cache Client Connected Successfully.'));
    this.redis.on('error', (err) => console.error('[REDIS ERROR]', err));
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // جلب إعدادات السيرفر المكيّشة
  async getGuildConfig(guildId: string): Promise<any | null> {
    const data = await this.redis.get(`config:${guildId}`);
    return data ? JSON.parse(data) : null;
  }

  // تخزين إعدادات السيرفر في الكاش لمدة ساعة لتقليل الضغط على MongoDB
  async setGuildConfig(guildId: string, config: any): Promise<void> {
    await this.redis.set(`config:${guildId}`, JSON.stringify(config), 'EX', 3600);
  }

  // مسح الكاش عند التعديل من الـ Dashboard ليتحدث البوت فوراً
  async invalidateGuildConfig(guildId: string): Promise<void> {
    await this.redis.del(`config:${guildId}`);
  }

  // محرك فحص الـ Rate Limiting بنظام Sliding Window الآمن جداً ضد السبام
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
    const now = Date.now();
    const clearBefore = now - windowSeconds * 1000;

    const multi = this.redis.multi();
    multi.zremrangebyscore(key, 0, clearBefore); // مسح العمليات القديمة خارج النطاق الزمني
    multi.zadd(key, now, now.toString());        // إضافة العملية الحالية
    multi.zcard(key);                            // حساب عدد العمليات الحالية
    multi.expire(key, windowSeconds + 2);        // تجديد وقت انتهاء المفتاح

    const results = await multi.exec();
    if (!results) return { allowed: true, count: 0 };
    
    const count = results[2][1] as number;
    return {
      allowed: count <= limit,
      count
    };
  }
}
