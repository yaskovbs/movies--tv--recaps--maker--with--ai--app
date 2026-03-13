import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-white py-20">
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
              מדיניות פרטיות
            </h1>
          </div>
          <p className="text-lg text-gray-400">
            עדכון אחרון: {new Date().toLocaleDateString('he-IL')}
          </p>
        </motion.div>

        <motion.div
          className="prose prose-invert prose-lg max-w-none bg-gray-800 rounded-lg p-8 border border-gray-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h2>1. מבוא</h2>
          <p>
            אנו ב-Movies & TV Recaps Maker Hub ("השירות") מחויבים להגן על פרטיותכם. מדיניות זו מסבירה איזה מידע אנו אוספים וכיצד אנו משתמשים בו.
          </p>

          <h2>2. איזה מידע אנו אוספים?</h2>
          <ul>
            <li>
              <strong>קבצי וידאו</strong>: קבצי הווידאו שאתם מעלים מעובדים ישירות בדפדפן שלכם באמצעות FFmpeg.wasm. הם אינם נשמרים על השרתים שלנו ונמחקים מהזיכרון של הדפדפן עם סיום העיבוד או רענון הדף.
            </li>
            <li>
              <strong>מפתח API של Gemini</strong>: מפתח ה-API שלכם נשלח ישירות מן הדפדפן שלכם לשירותי Google Gemini. הוא אינו נשמר על השרתים שלנו בשום שלב.
            </li>
            <li>
              <strong>נתונים סטטיסטיים אנונימיים</strong>: אנו אוספים נתונים אנונימיים לחלוטין לצורך שיפור השירות, באמצעות Supabase. נתונים אלה כוללים:
              <ul>
                <li>ספירת סיכומים שנוצרו.</li>
                <li>ספירת דירוגים וסכום הדירוגים.</li>
                <li>ספירת מבקרים ייחודיים (באמצעות מזהה אקראי ואנונימי השמור בדפדפן שלכם בלבד).</li>
              </ul>
            </li>
          </ul>

          <h2>3. כיצד אנו משתמשים במידע?</h2>
          <p>
            המידע שנאסף משמש אך ורק למטרות הבאות:
          </p>
          <ul>
            <li>כדי לספק לכם את פונקציונליות השירות (עיבוד וידאו ויצירת תסריט).</li>
            <li>כדי לשפר את השירות ולנתח את השימוש בו באופן אנונימי.</li>
          </ul>

          <h2>4. אבטחת מידע</h2>
          <p>
            אנו נוקטים באמצעי אבטחה סבירים כדי להגן על המידע שלכם. עם זאת, חשוב לזכור כי שום מערכת אינה מאובטחת ב-100%. האחריות על שמירת מפתח ה-API שלכם חלה עליכם.
          </p>

          <h2>5. שירותי צד שלישי</h2>
          <p>
            השירות משתמש בשירותים של צדדים שלישיים, כולל Google Gemini ו-Supabase. אנו ממליצים לעיין במדיניות הפרטיות שלהם כדי להבין כיצד הם מטפלים במידע.
          </p>

          <h2>6. שינויים במדיניות</h2>
          <p>
            אנו עשויים לעדכן מדיניות פרטיות זו מעת לעת. אנו נפרסם כל שינוי בעמוד זה.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
