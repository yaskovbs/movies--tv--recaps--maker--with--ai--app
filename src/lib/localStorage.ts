// Local storage service to replace Supabase for offline usage

interface AppStats {
  id: number;
  recaps_created: number;
  total_rating_sum: number;
  rating_count: number;
  active_users: number;
  created_at: string;
}

interface UniqueVisitor {
  visitor_id: string;
  created_at: string;
}

interface ImportData {
  stats?: AppStats;
  visitors?: UniqueVisitor[];
  hasRated?: boolean;
  visitorId?: string;
}

class LocalStorageService {
  private readonly STATS_KEY = 'app_stats';
  private readonly VISITORS_KEY = 'unique_visitors';
  private readonly RATINGS_KEY = 'user_ratings';

  constructor() {
    this.initializeData();
  }

  private initializeData() {
    // Initialize app stats if not exists
    if (!localStorage.getItem(this.STATS_KEY)) {
      const initialStats: AppStats = {
        id: 1,
        recaps_created: 0,
        total_rating_sum: 0,
        rating_count: 0,
        active_users: 1,
        created_at: new Date().toISOString()
      };
      localStorage.setItem(this.STATS_KEY, JSON.stringify(initialStats));
    }

    // Initialize visitors if not exists
    if (!localStorage.getItem(this.VISITORS_KEY)) {
      const visitors: UniqueVisitor[] = [];
      localStorage.setItem(this.VISITORS_KEY, JSON.stringify(visitors));
    }

    // Initialize ratings if not exists
    if (!localStorage.getItem(this.RATINGS_KEY)) {
      localStorage.setItem(this.RATINGS_KEY, 'false');
    }

    // Register visitor
    this.registerVisitor();
  }

  private registerVisitor() {
    const visitorId = localStorage.getItem('visitor_id') || crypto.randomUUID();
    localStorage.setItem('visitor_id', visitorId);

    const visitors: UniqueVisitor[] = this.getVisitors();
    const existingVisitor = visitors.find(v => v.visitor_id === visitorId);

    if (!existingVisitor) {
      visitors.push({
        visitor_id: visitorId,
        created_at: new Date().toISOString()
      });
      localStorage.setItem(this.VISITORS_KEY, JSON.stringify(visitors));
    }
  }

  private getStats(): AppStats {
    const stats = localStorage.getItem(this.STATS_KEY);
    return stats ? JSON.parse(stats) : {
      id: 1,
      recaps_created: 0,
      total_rating_sum: 0,
      rating_count: 0,
      active_users: 1,
      created_at: new Date().toISOString()
    };
  }

  private saveStats(stats: AppStats) {
    localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
  }

  private getVisitors(): UniqueVisitor[] {
    const visitors = localStorage.getItem(this.VISITORS_KEY);
    return visitors ? JSON.parse(visitors) : [];
  }

  // Public methods to replace Supabase functions
  async getPublicStats() {
    const stats = this.getStats();
    const visitors = this.getVisitors();

    return [{
      recaps_created: stats.recaps_created,
      total_rating_sum: stats.total_rating_sum,
      rating_count: stats.rating_count,
      active_users: visitors.length
    }];
  }

  async incrementRecapsCreated() {
    const stats = this.getStats();
    stats.recaps_created += 1;
    this.saveStats(stats);
  }

  async addRating(rating: number) {
    if (rating < 1 || rating > 5) return;

    const hasRated = localStorage.getItem(this.RATINGS_KEY) === 'true';
    if (hasRated) return;

    const stats = this.getStats();
    stats.total_rating_sum += rating;
    stats.rating_count += 1;
    this.saveStats(stats);

    localStorage.setItem(this.RATINGS_KEY, 'true');
  }

  // Utility methods
  exportData() {
    return {
      stats: this.getStats(),
      visitors: this.getVisitors(),
      hasRated: localStorage.getItem(this.RATINGS_KEY) === 'true',
      visitorId: localStorage.getItem('visitor_id')
    };
  }

  importData(data: ImportData) {
    if (data.stats) {
      this.saveStats(data.stats);
    }
    if (data.visitors) {
      localStorage.setItem(this.VISITORS_KEY, JSON.stringify(data.visitors));
    }
    if (data.hasRated !== undefined) {
      localStorage.setItem(this.RATINGS_KEY, data.hasRated.toString());
    }
    if (data.visitorId) {
      localStorage.setItem('visitor_id', data.visitorId);
    }
  }

  clearAllData() {
    localStorage.removeItem(this.STATS_KEY);
    localStorage.removeItem(this.VISITORS_KEY);
    localStorage.removeItem(this.RATINGS_KEY);
    localStorage.removeItem('visitor_id');
    this.initializeData();
  }
}

export const localStorageService = new LocalStorageService();
