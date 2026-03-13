import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Users, Zap, Star, Loader2 } from 'lucide-react'
import { localStorageService } from '../lib/localStorage'

interface AppStats {
  recaps_created: number;
  total_rating_sum: number;
  rating_count: number;
  active_users: number;
}

const StatsSection = () => {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRating, setUserRating] = useState<number>(0);
  const [isRating, setIsRating] = useState(false);
  const [hasRated, setHasRated] = useState<boolean>(() => {
    return localStorage.getItem('hasRated') === 'true';
  });

  const fetchStats = useCallback(async () => {
    try {
      const data = await localStorageService.getPublicStats();
      if (data && data.length > 0) {
        setStats(data[0]);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }

    if (loading) setLoading(false);
  }, [loading]);

  useEffect(() => {
    fetchStats();
    // No real-time updates needed for local storage
  }, [fetchStats]);

  const handleRating = async (rating: number) => {
    if (hasRated || isRating) return;
    setIsRating(true);
    setUserRating(rating);

    try {
      await localStorageService.addRating(rating);
      setHasRated(true);
      localStorage.setItem('hasRated', 'true');
      // Refresh stats to show updated rating
      fetchStats();
    } catch (error) {
      console.error('Failed to submit rating:', error);
      alert('שגיאה בשליחת הדירוג. אנא נסה שוב.');
    }
    setIsRating(false);
  };

  const calculatedRating = stats && stats.rating_count > 0
    ? (stats.total_rating_sum / stats.rating_count).toFixed(1)
    : '0.0';

  const statItems = [
    {
      icon: BarChart3,
      value: stats ? stats.recaps_created.toLocaleString() : '0',
      label: 'סיכומים נוצרו',
      color: 'text-blue-400'
    },
    {
      icon: Users,
      value: stats ? stats.active_users.toLocaleString() : '0',
      label: 'משתמשים פעילים',
      color: 'text-green-400'
    },
    {
      icon: Zap,
      value: `99.9%`,
      label: 'זמינות השירות',
      color: 'text-yellow-400'
    },
    {
      icon: Star,
      value: `${calculatedRating}/5`,
      label: 'דירוג משתמשים',
      color: 'text-purple-400'
    }
  ];

  if (loading) {
    return (
      <section className="bg-gray-800 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Loader2 className="h-12 w-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-white mt-4">טוען נתונים...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gray-800 py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            המספרים מדברים בעד עצמם
          </h2>
          <p className="text-gray-400 text-lg">
            ההישגים שלנו עד היום
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {statItems.map((item, index) => (
            <motion.div
              key={index}
              className="bg-gray-900 rounded-lg p-6 text-center border border-gray-700"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ scale: 1.05, borderColor: item.color.replace('text-', 'border-') }}
            >
              <item.icon className={`h-12 w-12 ${item.color} mx-auto mb-4`} />
              <motion.div
                className={`text-3xl font-bold ${item.color} mb-2`}
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
              >
                {item.value}
              </motion.div>
              <p className="text-gray-400 font-medium">{item.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Rating Section */}
        {!hasRated && (
          <motion.div
            className="mt-12 bg-gray-700 rounded-lg p-8 text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <h3 className="text-2xl font-bold text-white mb-4">
              מה דעתכם על השירות שלנו?
            </h3>
            <p className="text-gray-300 mb-6">
              הדירוג שלכם יעזור לנו להשתפר
            </p>
            
            <div className="flex justify-center space-x-2 space-x-reverse mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <motion.button
                  key={star}
                  onClick={() => handleRating(star)}
                  disabled={isRating}
                  className={`p-2 rounded-lg transition-colors ${
                    star <= userRating 
                      ? 'text-yellow-400' 
                      : 'text-gray-500 hover:text-yellow-400'
                  }`}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Star className={`h-8 w-8 ${star <= userRating ? 'fill-current' : ''}`} />
                </motion.button>
              ))}
            </div>
            {isRating && <Loader2 className="h-6 w-6 text-white animate-spin mx-auto" />}
          </motion.div>
        )}

        {hasRated && (
          <motion.div
            className="mt-12 bg-green-600/10 border border-green-600/20 rounded-lg p-6 text-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex justify-center mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star 
                  key={star}
                  className={`h-6 w-6 ${
                    stats && stats.rating_count > 0 && (stats.total_rating_sum / stats.rating_count) >= star
                      ? 'text-yellow-400 fill-current'
                      : 'text-gray-500'
                  }`}
                />
              ))}
            </div>
            <p className="text-green-400 font-semibold">
              תודה רבה על הדירוג!
            </p>
            <p className="text-gray-300 text-sm mt-1">
              הדירוג שלכם עוזר לנו לשפר את השירות
            </p>
          </motion.div>
        )}
      </div>
    </section>
  )
}

export default StatsSection
