import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Film } from 'lucide-react';

const Footer = () => {
  const { t } = useTranslation();

  const navLinks = [
    { path: '/', label: t('header.nav.home') },
    { path: '/contact', label: t('header.nav.contact') },
    { path: '/faq', label: t('header.nav.faq') },
  ];

  const legalLinks = [
    { path: '/terms', label: t('header.nav.terms') },
    { path: '/privacy', label: t('header.nav.privacy') },
  ];

  return (
    <footer className="glass-footer text-white">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Logo and About */}
          <div className="space-y-4">
            <Link to="/">
              <div
                className="flex items-center cursor-pointer"
              >
                <Film className="h-8 w-8 text-blue-400 ml-3" />
                <div className="text-right">
                  <h1 className="text-xl font-bold">{t('common.appName')}</h1>
                  <p className="text-sm text-gray-400">{t('common.appTagline')}</p>
                </div>
              </div>
            </Link>
            <p className="text-gray-400 text-sm max-w-xs">
              {t('footer.description')}
            </p>
          </div>

          {/* Links */}
          <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">{t('footer.navHeading')}</h3>
              <ul className="mt-4 space-y-2">
                {navLinks.map(link => (
                  <li key={link.path}>
                    <Link
                      to={link.path}
                      className="text-base text-gray-300 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">{t('footer.legalHeading')}</h3>
              <ul className="mt-4 space-y-2">
                {legalLinks.map(link => (
                  <li key={link.path}>
                    <Link
                      to={link.path}
                      className="text-base text-gray-300 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
             <div>
              <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">{t('footer.contactHeading')}</h3>
              <ul className="mt-4 space-y-2 text-base text-gray-300">
                <li>yaskovbs2502@gmail.com</li>
                <li>050-818-1948</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-white/10 pt-8 text-center">
          <p className="text-base text-gray-400">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
