// 📦 필요한 모듈 불러오기
const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const streamifier = require("streamifier");
const { v2: cloudinary } = require("cloudinary");
const mysql = require("mysql2"); 
const bcrypt = require('bcrypt'); 
const path = require('path'); 
const session = require('express-session'); 
const MySQLStore = require('express-mysql-session')(session); 

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

// 💧 MySQL 데이터베이스 연결 설정
const db = mysql.createPool({
  host: '127.0.0.1', 
  user: 'root',
  password: '0000',
  database: 'mypic',
  port: 3307 
});

// 💧 MySQL 세션 스토어 설정 (세션 정보를 DB에 저장)
const sessionStore = new MySQLStore({}, db.promise());

// ⚙️ 미들웨어 설정
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(express.static("np_mypic")); 

// ⚙️ 세션 미들웨어 설정 (모든 요청 전에 실행)
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_key_for_mypic', 
    store: sessionStore, 
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 
    }
}));


// 📦 multer 설정: 메모리 저장소에 파일 저장
const upload = multer({ storage: multer.memoryStorage() });

// 📤 버퍼 데이터를 Cloudinary로 업로드하는 함수
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

// 📩 회원가입 API 라우트 (변경 없음)
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
            req.session.userId = user.id; 
            console.log(`로그인 성공: ${username}, ID: ${user.id}`);
            res.status(200).send("로그인에 성공했습니다.");
        } else {
            res.status(401).send("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

    } catch (error) {
        console.error("로그인 오류:", error);
        res.status(500).send("로그인 중 오류가 발생했습니다.");
    }
});


// 🚪 로그아웃 API 라우트
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("로그아웃 오류:", err);
            return res.status(500).send("로그아웃 중 오류가 발생했습니다.");
        }
        res.clearCookie('connect.sid'); 
        res.status(200).send("로그아웃 되었습니다.");
    });
});


// 💰 사용자 포인트 조회 API
app.get("/api/user/points", async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ points: 0, error: "로그인이 필요합니다." });
    }

    try {
        const [rows] = await db.promise().query(
            "SELECT points FROM users WHERE id = ?",
            [userId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
        }

        res.status(200).json({ points: rows[0].points });

    } catch (error) {
        console.error("포인트 조회 오류:", error);
        res.status(500).json({ error: "포인트를 불러오는 중 오류가 발생했습니다." });
    }
});


// 🖼️ 로그인된 사용자의 사진 목록을 불러오는 API 라우트 
app.get("/api/photos/me", async (req, res) => {
    const userId = req.session.userId; 

    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    try {
        const [photos] = await db.promise().query(
            "SELECT id, imageUrl, memo, created_at FROM photos WHERE user_id = ? ORDER BY created_at DESC",
            [userId]
        );
        
        res.status(200).json(photos); 

    } catch (error) {
        console.error("사진 목록 조회 오류:", error);
        res.status(500).json({ error: "사진 목록을 불러오는 중 오류가 발생했습니다." });
    }
});


// 📩 파일 업로드 API 라우트
app.post("/upload", upload.single("file"), async (req, res) => {
    const userId = req.session.userId; 
    const memo = req.body.memo || null; 

    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다. 사진을 저장할 수 없습니다." });
    }

    try {
        if (!req.file) {
            return res.status(400).json({ error: "파일이 없습니다." });
        }
        
        // 1. Cloudinary 업로드
        const result = await uploadToCloudinary(req.file.buffer);
        const imageUrl = result.secure_url;

        // 2. photos 테이블에 저장
        const [insertResult] = await db.promise().query(
            "INSERT INTO photos (user_id, imageUrl, memo) VALUES (?, ?, ?)",
            [userId, imageUrl, memo]
        );
        
        // 3. users 테이블 포인트 20점 증가
        await db.promise().query(
            "UPDATE users SET points = points + 20 WHERE id = ?",
            [userId]
        );

        res.status(201).json({ 
            message: "사진 업로드 및 포인트 적립 성공", 
            url: imageUrl,
            photo_id: insertResult.insertId 
        });

    } catch (err) {
        console.error("업로드/DB 저장 실패:", err);
        res.status(500).json({ error: "업로드 및 DB 저장 실패: " + err.message });
    }
});

// 🖼️ 특정 사진 정보 조회 API (decorate.html에서 사용: /api/photo?photoId=ID 형식)
app.get("/api/photo", async (req, res) => {
    // 💡 쿼리 파라미터(photoId)에서 ID를 가져옴
    const photoId = req.query.photoId; 
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    
    if (!photoId) {
        return res.status(400).json({ error: "photoId가 필요합니다." });
    }

    try {
        const [rows] = await db.promise().query(
            "SELECT id, imageUrl FROM photos WHERE id = ? AND user_id = ?",
            [photoId, userId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "사진을 찾을 수 없습니다." });
        }
        
        // decorate.html의 loadPhoto 함수가 기대하는 형식: { imageUrl: "..." }
        res.status(200).json({ imageUrl: rows[0].imageUrl }); 

    } catch (error) {
        console.error("특정 사진 조회 오류:", error);
        res.status(500).json({ error: "사진 정보를 불러오는 중 오류가 발생했습니다." });
    }
});


// 🟢 서버 실행
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});