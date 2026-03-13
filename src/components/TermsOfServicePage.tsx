import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';

const TermsOfServicePage = () => {
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
            <FileText className="h-12 w-12 text-blue-400 ml-4" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              תנאי שימוש
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
          <h2>1. הסכמה לתנאים</h2>
          <p>
            ברוכים הבאים ל-Movies & TV Recaps Maker Hub ("השירות"). על ידי שימוש בשירות, אתם מסכימים לתנאי שימוש אלה במלואם. אם אינכם מסכימים לתנאים, אנא אל תשתמשו בשירות.
          </p>

          <h2>2. תיאור השירות</h2>
          <p>
            השירות מספק כלים ליצירת סיכומי וידאו מקבצי מדיה שאתם מעלים. העיבוד מתבצע באמצעות טכנולוגיות צד-לקוח (FFmpeg.wasm) ובינה מלאכותית (Google Gemini AI).
          </p>

          <h2>3. אחריות המשתמש</h2>
          <ul>
            <li>אתם מצהירים כי יש לכם את כל הזכויות החוקיות על קבצי הווידאו שאתם מעלים ומעבדים.</li>
            <li>חל איסור להשתמש בשירות למטרות בלתי חוקיות או להפרת זכויות יוצרים.</li>
            <li>אתם אחראים באופן בלעדי על השימוש במפתח ה-API שלכם ל-Google Gemini ועל כל העלויות הכרוכות בכך. השירות אינו אחראי לחיובים אלו.</li>
            <li>התוכן שנוצר (הסיכום) הוא באחריותכם הבלעדית.</li>
          </ul>

          <h2>4. קניין רוחני</h2>
          <p>
            כל הקוד, העיצוב והטקסטים באתר הם קניינו הבלעדי של Movies & TV Recaps Maker Hub. התוכן שאתם יוצרים באמצעות השירות שייך לכם, בכפוף לזכויות היוצרים המקוריות של הווידאו.
          </p>

          <h2>5. הגבלת אחריות</h2>
          <p>
            השירות ניתן "כפי שהוא" (AS IS), ללא כל אחריות, מפורשת או משתמעת. איננו מתחייבים שהשירות יהיה זמין תמיד, נטול שגיאות או וירוסים. לא נהיה אחראים לכל נזק, ישיר או עקיף, שייגרם כתוצאה מהשימוש בשירות.
          </p>

          <h2>6. פרטיות</h2>
          <p>
            אנו מכבדים את פרטיותכם. אנא עיינו ב<Link to="/privacy" className="text-blue-400 hover:underline cursor-pointer">מדיניות הפרטיות</Link> שלנו כדי להבין כיצד אנו אוספים ומשתמשים במידע.
          </p>

          <h2>7. שינויים בתנאים</h2>
          <p>
            אנו שומרים לעצמנו את הזכות לעדכן תנאי שימוש אלה מעת לעת. המשך השימוש בשירות לאחר עדכון מהווה הסכמה לתנאים החדשים.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default TermsOfServicePage;
