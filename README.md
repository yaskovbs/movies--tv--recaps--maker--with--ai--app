# יוצר סיכומי וידאו - Movie & TV Show Recap Maker (גרסה מקומית)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

פלטפורמה מקומית ליצירת סיכומי וידאו מקצועיים לסרטים וסדרות באמצעות בינה מלאכותית של Google Gemini וטכנולוגיית FFmpeg. **פועלת לחלוטין בדפדפן ללא צורך בשרת חיצוני.**

## ✨ תכונות עיקריות

- 🎬 **עיבוד וידאו מתקדם** - שימוש ב-FFmpeg ישירות בדפדפן
- 🤖 **בינה מלאכותית** - יצירת תסריטים בעברית באמצעות Google Gemini AI
- 🔒 **בטוח ומאובטח** - הקבצים שלכם מוגנים והמפתחות לא נשמרים
- 📱 **ממשק ידידותי** - קל לשימוש לכל הגילאים
- ⚡ **עיבוד מהיר** - טכנולוגיית AI מתקדמת לעיבוד מהיר ויעיל
- 📊 **סטטיסטיקות בזמן אמת** - מעקב אחרי השימוש והביצועים

## 🚀 התחלה מהירה

### דרישות מקדימות

- Node.js (גרסה 18 ומעלה)
- npm או yarn
- מפתח API של Google Gemini (קבל חינם מ-[Google AI Studio](https://makersuite.google.com/app/apikey))

### התקנה

1. **שכפל את הפרויקט:**
   ```bash
   git clone <repository-url>
   cd moviesandtvshowsrecapsmakerwithai-master
   ```

2. **התקן תלויות:**
   ```bash
   npm install
   ```

3. **הגדר משתני סביבה:**
   צור קובץ `.env` בתיקיית השורש והוסף מפתח Google Gemini API:
   ```env
   VITE_GEMINI_API_KEY=your-gemini-api-key
   ```

4. **הפעל את שרת הפיתוח:**
   ```bash
   npm run dev
   ```

5. **פתח את הדפדפן:**
   נווט אל `http://localhost:5173`

## 📖 איך להשתמש

1. **העלאת וידאו** - גרור קובץ וידאו או בחר מהמחשב
2. **הגדרות סיכום** - קבע את אורך הסיכום ותאר את הווידאו ל-AI
3. **יצירת סיכום** - לחץ על הכפתור ותן לקסם לקרות!

## 🛠️ טכנולוגיות

- **Frontend:** React 19, TypeScript, Vite
- **UI:** Tailwind CSS, Framer Motion
- **Video Processing:** FFmpeg (WebAssembly)
- **AI:** Google Gemini 2.5 Pro
- **Storage:** Local Storage (Browser)
- **Icons:** Lucide React

## 📁 מבנה הפרויקט

```
src/
├── components/          # רכיבי React
│   ├── HomePage.tsx    # דף הבית הראשי
│   ├── VideoUploader.tsx
│   ├── RecapSettings.tsx
│   ├── ProcessingStatus.tsx
│   ├── ResultsSection.tsx
│   └── StatsSection.tsx
├── lib/
│   ├── localStorage.ts # אחסון מקומי
│   └── supabase.ts     # חיבור למסד נתונים (לא בשימוש)
├── types/
│   └── index.ts        # הגדרות TypeScript
└── App.tsx            # אפליקציית React ראשית
```

## 🔧 סקריפטים זמינים

- `npm run dev` - הפעלת שרת פיתוח
- `npm run build` - בניית הפרויקט לייצור
- `npm run preview` - תצוגה מקדימה של הבנייה
- `npm run lint` - בדיקת קוד עם ESLint

## 🤝 תרומה

תרומות מתקבלות בברכה! אנא:

1. Fork את הפרויקט
2. צור branch חדש (`git checkout -b feature/AmazingFeature`)
3. Commit את השינויים (`git commit -m 'Add some AmazingFeature'`)
4. Push ל-branch (`git push origin feature/AmazingFeature`)
5. פתח Pull Request

## 📄 רישיון

פרויקט זה מוגן ברישיון MIT - ראה את קובץ [LICENSE](LICENSE) לפרטים.

## 📞 צור קשר

- **דוא"ל:** [your-email@example.com]
- **GitHub Issues:** [פתח issue](https://github.com/your-username/moviesandtvshowsrecapsmakerwithai/issues)

## 🙏 תודות

- [Google Gemini AI](https://ai.google.dev/) - עבור יכולות הבינה המלאכותית
- [FFmpeg](https://ffmpeg.org/) - עבור עיבוד וידאו מתקדם
- [Supabase](https://supabase.com/) - עבור שירותי Backend
- [React](https://reactjs.org/) ו-[Vite](https://vitejs.dev/) - עבור חוויית פיתוח מעולה

---

**הערה:** אפליקציה זו פועלת לחלוטין מקומית בדפדפן. כל הנתונים נשמרים באחסון המקומי של הדפדפן, והקבצים שלכם לעולם לא עולים לשרת חיצוני. הפרטיות והאבטחה שלכם מובטחות.
