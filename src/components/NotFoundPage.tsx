import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, Home, Film, HelpCircle, Mail } from 'lucide-react';

// Rendered for any URL that doesn't match a real route (App.tsx's catch-all
// "*" Route) - a typo, a dead/old link, or a bot probing random paths.
// public/_redirects reports these as an actual HTTP 404 to crawlers, but the
// SPA still needs a real, helpful page to render client-side rather than an
// empty <main> - a blank screen with no content is exactly the kind of page
// Google's AdSense policy prohibits serving ads on.
const NotFoundPage = () => {
  const { t } = useTranslation();

  const links = [
    { to: '/', icon: Home, label: t('notFoundPage.linkHome') },
    { to: '/history', icon: Film, label: t('notFoundPage.linkHistory') },
    { to: '/faq', icon: HelpCircle, label: t('notFoundPage.linkFaq') },
    { to: '/contact', icon: Mail, label: t('notFoundPage.linkContact') },
  ];

  return (
    <div className="min-h-screen text-white py-24 flex items-center">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-center mb-6">
            <Compass className="h-14 w-14 text-blue-400" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            {t('notFoundPage.title')}
          </h1>
          <p className="text-lg text-gray-300 mb-2">{t('notFoundPage.heading')}</p>
          <p className="text-gray-400 mb-10">{t('notFoundPage.description')}</p>
        </motion.div>

        <motion.div
          className="glass rounded-lg p-6 grid grid-cols-2 gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {links.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 justify-center px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-200 transition-colors"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default NotFoundPage;
