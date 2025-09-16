// 📦 필요한 모듈 불러오기
const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const streamifier = require("streamifier");
const { v2: cloudinary } = require("cloudinary");
const mysql = require("mysql2"); // 🟢 MySQL 모듈 추가
const bcrypt = require('bcrypt'); // 🟢 비밀번호 암호화 모듈 추가
const path = require('path'); // 🟢 경로 관리 모듈 추가

// 🌱 .env 파일에 있는 환경변수 로드
dotenv.config();

// ☁️ Cloudinary 계정 정보 설정
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 🚀 Express 앱 생성
const app = express();

// ⚙️ 미들웨어 설정
app.use(express.json()); // JSON 형식의 요청 본문을 파싱 (회원가입/로그인)
app.use(express.urlencoded({ extended: true })); // URL-encoded 형식의 요청 본문을 파싱
app.use(express.static("np_mypic")); // 정적 파일(HTML, CSS, JS) 제공

// 📦 multer 설정: 메모리 저장소에 파일 저장
const upload = multer({ storage: multer.memoryStorage() });

// 💧 MySQL 데이터베이스 연결 설정
// 🚨 여기에 본인의 MySQL 계정 정보로 바꿔주세요!
const db = mysql.createPool({
  host: '127.0.0.1', // 호스트 주소
  user: 'root',
  password: '0000',
  database: 'mypic',
  port: 3307 // 🚨 포트 번호는 별도의 속성으로 분리
});

// 📤 버퍼 데이터를 Cloudinary로 업로드하는 함수 (기존 코드)
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "mypic_uploads" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// ---
// 🚀 API 라우트

// 📩 회원가입 API 라우트
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send("아이디와 비밀번호를 모두 입력해주세요.");
  }

  try {
    const [rows] = await db.promise().query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length > 0) {
      return res.status(409).send("이미 존재하는 아이디입니다.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.promise().query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);

    console.log(`회원가입 성공: ${username}`);
    res.status(201).send("회원가입이 성공적으로 완료되었습니다.");

  } catch (error) {
    console.error("회원가입 오류:", error);
    res.status(500).send("회원가입 중 오류가 발생했습니다.");
  }
});


// 📩 로그인 API 라우트
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send("아이디와 비밀번호를 모두 입력해주세요.");
  }

  try {
    const [rows] = await db.promise().query("SELECT * FROM users WHERE username = ?", [username]);
    const user = rows[0];

    if (!user) {
      return res.status(401).send("아이디 또는 비밀번호가 올바르지 않습니다.");
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (isPasswordMatch) {
      console.log(`로그인 성공: ${username}`);
      res.status(200).send("로그인에 성공했습니다.");
    } else {
      res.status(401).send("아이디 또는 비밀번호가 올바르지 않습니다.");
    }

  } catch (error) {
    console.error("로그인 오류:", error);
    res.status(500).send("로그인 중 오류가 발생했습니다.");
  }
});


// 📩 파일 업로드 API 라우트
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "파일이 없습니다." });
    }
    const result = await uploadToCloudinary(req.file.buffer);
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error("업로드 실패:", err);
    res.status(500).json({ error: "업로드 실패: " + err.message });
  }
});


// 🟢 서버 실행
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});