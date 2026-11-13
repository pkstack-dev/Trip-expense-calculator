# 🏕️ หารค่าใช้จ่ายทริป (Trip Expense Calculator — Web Edition)

เว็บแอปพลิเคชันสำหรับคำนวณและหารค่าใช้จ่ายในทริปท่องเที่ยว ออกแบบในรูปแบบเดียวกับแอป Android (**Trip Expense Calculator**) รองรับการใช้งานผ่านเบราว์เซอร์ทั้งบนมือถือและคอมพิวเตอร์ และพร้อมสำหรับนำไปฝากไว้บน **GitHub Pages** ทันที

## ✨ ฟีเจอร์หลัก

- **Hero Header & Dark/Light Mode**: แสดงยอดรวมค่าใช้จ่ายทั้งหมดแบบเรียลไทม์ พร้อมจำนวนคน จำนวนบิล และค่าเฉลี่ยต่อคน รองรับโหมดกลางวัน/กลางคืน
- **จัดการสมาชิกและตัวคูณจำนวนคน (Headcount)**: รองรับการตั้งตัวคูณสำหรับคู่รักหรือครอบครัวที่จ่ายรวมกัน (`×2`, `×3`, ฯลฯ) และผูกเบอร์/เลขบัตรพร้อมเพย์
- **สมุดเพื่อน (Friend Book)**: จำรายชื่อและพร้อมเพย์ของเพื่อนอัตโนมัติ ดึงเข้าทริปได้ในคลิกเดียว และซิงค์ข้อมูลข้ามอุปกรณ์ผ่าน Firebase Cloud
- **บันทึกรายการค่าใช้จ่าย & แนบสลิป**: มีหมวดหมู่ลัด (`🍲 ค่าอาหาร`, `🍻 เครื่องดื่ม`, `🚗 ค่าน้ำมัน`, `🏨 ที่พัก`, ฯลฯ) เลือกคนจ่าย เลือกผู้ร่วมหารเฉพาะกลุ่ม และแนบรูปสลิป/ใบเสร็จ (ย่อขนาดอัตโนมัติ)
- **คำนวณยอดรายคน & สรุปการโอนเงิน (Greedy Debt Minimization)**: ลดจำนวนครั้งในการโอนให้น้อยที่สุด พร้อมปุ่มกดคัดลอกหมายเลขพร้อมเพย์ได้ทันที
- **แชร์สรุปเข้า LINE & สร้างรูปภาพสรุป (1080px PNG)**:
  - คัดลอกข้อความสรุปฟอร์แมต LINE
  - สร้างการ์ดรูปภาพสรุปความละเอียดสูง (`SummaryImageExporter`) สำหรับดาวน์โหลดหรือแชร์เข้าแชท
- **ซิงค์ข้อมูลกับแอป Android ผ่าน Firebase Cloud**: ใช้โครงสร้างข้อมูล Firestore (`users/{uid}/trips` และ `users/{uid}.savedFriends`) เดียวกันกับแอป Android ทุกประการ

---

## 📁 โครงสร้างไฟล์

```text
Trip-Web/
├── index.html            # หน้าเว็บหลักและ Bottom Sheets / Dialogs ทั้งหมด
├── styles.css            # สไตล์ตามระบบสีและดีไซน์ของแอป Android (Light & Dark Theme)
├── app.js                # ระบบคำนวณ, จัดการสถานะ, LocalStorage และเชื่อมต่อ Firebase Auth / Firestore
├── summary-exporter.js   # ระบบวาดรูปการ์ดสรุปค่าใช้จ่ายด้วย HTML5 Canvas (พอร์ตจาก SummaryImageExporter.kt)
├── manifest.json         # Web App Manifest สำหรับติดตั้งเป็น PWA บนหน้าจอมือถือ
├── assets/
│   └── icon.svg          # ไอคอนของเว็บแอป
├── .nojekyll             # ป้องกัน Jekyll ประมวลผลไฟล์บน GitHub Pages
└── .gitignore
```

---

## 🚀 วิธีนำขึ้น GitHub Pages

1. เปิด Terminal หรือ PowerShell ที่โฟลเดอร์ `D:\08Developer\AndroidApp\Trip-Web`
2. รันคำสั่ง Git เพื่ออัปโหลดขึ้น Repository บน GitHub:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit: Trip Expense Calculator Web App"
   git branch -M main
   git remote add origin https://github.com/<USERNAME>/<REPO_NAME>.git
   git push -u origin main
   ```
3. ไปที่หน้า Repository บน GitHub -> **Settings** -> **Pages**
4. ในหัวข้อ **Build and deployment** -> **Branch** เลือก `main` และโฟลเดอร์ `/ (root)` จากนั้นกด **Save**
5.*(สำหรับ Google Sign-In)* ไปที่ **Firebase Console** (`trip-expense-calculator-9261b`) -> **Authentication** -> **Settings** -> **Authorized domains** แล้วเพิ่มโดเมน `<USERNAME>.github.io` เพื่อให้ล็อกอินด้วย Google บน GitHub Pages ได้ทันที
