import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';

const PrivacyPolicyPage = () => {
  const { t, i18n } = useTranslation();
  const anonStatsList = t('privacyPage.anonStatsList', { returnObjects: true }) as unknown as string[];
  const howWeUseList = t('privacyPage.howWeUseList', { returnObjects: true }) as unknown as string[];

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
            <Shield className="h-12 w-12 text-blue-400 ml-4" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              {t('privacyPage.title')}
            </h1>
          </div>
          <p className="text-lg text-gray-400">
            {t('privacyPage.lastUpdated', { date: new Date().toLocaleDateString(i18n.resolvedLanguage) })}
          </p>
        </motion.div>

        <motion.div
          className="prose prose-invert prose-lg max-w-none glass rounded-lg p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h2>{t('privacyPage.sections.0.heading')}</h2>
          <p>{t('privacyPage.sections.0.body')}</p>

          <h2>{t('privacyPage.whatWeCollectHeading')}</h2>
          <ul>
            <li>
              <strong>{t('privacyPage.videoFilesTitle')}</strong>: {t('privacyPage.videoFilesBody')}
            </li>
            <li>
              <strong>{t('privacyPage.apiKeyTitle')}</strong>: {t('privacyPage.apiKeyBody')}
            </li>
            <li>
              <strong>{t('privacyPage.anonStatsTitle')}</strong>: {t('privacyPage.anonStatsBody')}
              <ul>
                {anonStatsList.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </li>
          </ul>

          <h2>{t('privacyPage.howWeUseHeading')}</h2>
          <p>{t('privacyPage.howWeUseIntro')}</p>
          <ul>
            {howWeUseList.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>

          <h2>{t('privacyPage.securityHeading')}</h2>
          <p>{t('privacyPage.securityBody')}</p>

          <h2>{t('privacyPage.thirdPartyHeading')}</h2>
          <p>{t('privacyPage.thirdPartyBody')}</p>

          <h2>{t('privacyPage.changesHeading')}</h2>
          <p>{t('privacyPage.changesBody')}</p>
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
