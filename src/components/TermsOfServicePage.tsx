import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';

const TermsOfServicePage = () => {
  const { t, i18n } = useTranslation();
  const responsibilityList = t('termsPage.responsibilityList', { returnObjects: true }) as unknown as string[];

  return (
    <div className="min-h-screen text-white py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-center mb-6">
            <FileText className="h-12 w-12 text-blue-400 ml-4" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              {t('termsPage.title')}
            </h1>
          </div>
          <p className="text-lg text-gray-400">
            {t('termsPage.lastUpdated', { date: new Date().toLocaleDateString(i18n.resolvedLanguage) })}
          </p>
        </motion.div>

        <motion.div
          className="prose prose-invert prose-lg max-w-none glass rounded-lg p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h2>{t('termsPage.agreementHeading')}</h2>
          <p>{t('termsPage.agreementBody')}</p>

          <h2>{t('termsPage.descriptionHeading')}</h2>
          <p>{t('termsPage.descriptionBody')}</p>

          <h2>{t('termsPage.responsibilityHeading')}</h2>
          <ul>
            {responsibilityList.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>

          <h2>{t('termsPage.ipHeading')}</h2>
          <p>{t('termsPage.ipBody')}</p>

          <h2>{t('termsPage.liabilityHeading')}</h2>
          <p>{t('termsPage.liabilityBody')}</p>

          <h2>{t('termsPage.privacyHeading')}</h2>
          <p>
            {t('termsPage.privacyBodyPrefix')}
            <Link to="/privacy" className="text-blue-400 hover:underline cursor-pointer">{t('termsPage.privacyLinkText')}</Link>
            {t('termsPage.privacyBodySuffix')}
          </p>

          <h2>{t('termsPage.changesHeading')}</h2>
          <p>{t('termsPage.changesBody')}</p>
        </motion.div>
      </div>
    </div>
  );
};

export default TermsOfServicePage;
