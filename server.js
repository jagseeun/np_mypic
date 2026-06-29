const express = require("express");
const multer = require("multer");
const streamifier = require("streamifier");
const mysql = require("mysql2"); 
const bcrypt = require('bcrypt'); 
const session = require('express-session'); 
const MySQLStore = require('express-mysql-session')(session);
const dotenv = require("dotenv");
const { v2: cloudinary } = require("cloudinary");

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'dev_secret_key_for_mypic';

if (isProduction) {
    app.set('trust proxy', 1);
}

if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error("운영 환경에서는 SESSION_SECRET을 반드시 설정해야 합니다.");
}

if (!isProduction && !process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET이 설정되지 않아 개발용 기본값을 사용합니다.");
}

// MySQL DB 연결 풀 생성
const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '0000',
  database: process.env.DB_NAME || 'mypic',
  port: Number(process.env.DB_PORT || 3307)
});

// 세션 데이터를 MySQL에 저장하기 위한 스토어
const sessionStore = new MySQLStore({}, db.promise());

// JSON, URL-encoded 데이터 파싱 (요청 본문 읽기용)
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// 정적 파일 제공 (HTML, CSS, JS 등)

// 세션 미들웨어 설정 (로그인 상태 유지)
app.use(session({
    secret: sessionSecret, // 세션 암호화 키
    store: sessionStore, // DB에 세션 저장
    resave: false, // 변경사항 없으면 저장 안함
    saveUninitialized: false, // 빈 세션 저장 안함
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 24 // 쿠키 유효기간 24시간
    }
}));

const protectedPages = new Set([
    "/gallery.html",
    "/upload.html",
    "/detail.html",
    "/decorate.html",
    "/edit-memo.html",
    "/points.html",
    "/main.html",
    "/test.html",
    "/check.html",
    "/memo.html",
    "/point.html"
]);

const legacyPageRedirects = {
    "/main.html": "/gallery.html",
    "/test.html": "/upload.html",
    "/check.html": "/detail.html",
    "/memo.html": "/edit-memo.html",
    "/point.html": "/points.html"
};

const preventHtmlCache = (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
};

app.use((req, res, next) => {
    if (req.method === "GET" && req.path.endsWith(".html")) {
        preventHtmlCache(res);
    }

    if (req.method === "GET" && legacyPageRedirects[req.path]) {
        const queryIndex = req.originalUrl.indexOf("?");
        const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
        return res.redirect(302, legacyPageRedirects[req.path] + query);
    }

    if (req.method === "GET" && protectedPages.has(req.path) && !req.session.userId) {
        return res.redirect(302, "/index.html");
    }

    next();
});

app.use(express.static("np_mypic", {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
            preventHtmlCache(res);
        }
    }
}));

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// 파일 업로드 설정 (메모리에 임시 저장)
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_UPLOAD_SIZE,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return cb(new Error("이미지 파일만 업로드할 수 있습니다."));
        }
        cb(null, true);
    }
});

const uploadSinglePhoto = (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (!err) return next();

        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "5MB 이하 이미지만 업로드할 수 있습니다." });
        }

        return res.status(400).json({ error: err.message || "업로드할 수 없는 파일입니다." });
    });
};

// 메모리 버퍼를 Cloudinary로 업로드하는 함수
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    // 스트림 방식으로 업로드
    const stream = cloudinary.uploader.upload_stream(
      { folder: "mypic_uploads" }, // Cloudinary 내 폴더명
      (error, result) => {
        if (error) return reject(error);
        resolve(result); // 업로드 결과 반환 (URL 포함)
      }
    );
    // 버퍼를 읽어서 스트림으로 전송
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// 회원가입
app.post("/signup", async (req, res) => {
    const username = (req.body.username || "").trim();
    const password = req.body.password || "";
    
    // 빈 값 체크
    if (!username || !password) {
        return res.status(400).send("아이디와 비밀번호를 모두 입력해주세요.");
    }
    
    try {
        // 이미 있는 아이디인지 확인
        const [rows] = await db.promise().query("SELECT * FROM users WHERE username = ?", [username]);
        if (rows.length > 0) {
            return res.status(409).send("이미 존재하는 아이디입니다.");
        }
        
        // 비밀번호 암호화 (bcrypt로 해시화, 10은 salt rounds)
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // DB에 새 사용자 등록 (points는 기본값 0으로 자동 설정됨)
        await db.promise().query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);
        console.log(`회원가입 성공: ${username}`);
        res.status(201).send("회원가입이 성공적으로 완료되었습니다.");
    } catch (error) {
        console.error("회원가입 오류:", error);
        res.status(500).send("회원가입 중 오류가 발생했습니다.");
    }
});

// 로그인
app.post("/login", async (req, res) => {
    const username = (req.body.username || "").trim();
    const password = req.body.password || "";
    
    if (!username || !password) {
        return res.status(400).send("아이디와 비밀번호를 모두 입력해주세요.");
    }
    
    try {
        // 사용자 찾기
        const [rows] = await db.promise().query("SELECT * FROM users WHERE username = ?", [username]);
        const user = rows[0];
        
        if (!user) {
            return res.status(401).send("아이디 또는 비밀번호가 올바르지 않습니다.");
        }
        
        // 비밀번호 일치 여부 확인 (해시값 비교)
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            res.status(401).send("아이디 또는 비밀번호가 올바르지 않습니다.");
            return;
        }

        req.session.regenerate((err) => {
            if (err) {
                console.error("세션 재생성 오류:", err);
                return res.status(500).send("로그인 중 오류가 발생했습니다.");
            }

            req.session.userId = user.id;
            console.log(`로그인 성공: ${username}, ID: ${user.id}`);
            res.status(200).send("로그인에 성공했습니다.");
        });
    } catch (error) {
        console.error("로그인 오류:", error);
        res.status(500).send("로그인 중 오류가 발생했습니다.");
    }
});

// 로그아웃
app.post("/logout", (req, res) => {
    // 세션 완전히 삭제
    req.session.destroy(err => {
        if (err) {
            console.error("로그아웃 오류:", err);
            return res.status(500).send("로그아웃 중 오류가 발생했습니다.");
        }
        res.clearCookie('connect.sid', {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProduction
        }); // 세션 쿠키도 삭제
        res.status(200).send("로그아웃 되었습니다.");
    });
});

// 현재 사용자 포인트 조회
app.get("/api/user/points", async (req, res) => {
    const userId = req.session.userId;
    
    // 로그인 체크
    if (!userId) {
        return res.status(401).json({ points: 0, error: "로그인이 필요합니다." });
    }
    
    try {
        // 사용자 포인트 가져오기
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

// 내가 업로드한 사진 목록
app.get("/api/photos/me", async (req, res) => {
    const userId = req.session.userId; 
    
    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    
    try {
        // 최신순으로 내 사진들 가져오기 (created_at DESC)
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

// 💡 메모 검색 API
app.get("/api/photos/search", async (req, res) => {
    const userId = req.session.userId;
    const keyword = req.query.keyword;
    
    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    
    if (!keyword) {
        return res.status(400).json({ error: "검색어를 입력해주세요." });
    }
    
    try {
        // memo 필드에서 키워드를 포함하는 사진 검색 (LIKE 사용)
        const [photos] = await db.promise().query(
            "SELECT id, imageUrl, memo, created_at FROM photos WHERE user_id = ? AND memo LIKE ? ORDER BY created_at DESC",
            [userId, `%${keyword}%`]
        );
        
        res.status(200).json(photos);
    } catch (error) {
        console.error("사진 검색 오류:", error);
        res.status(500).json({ error: "사진 검색 중 오류가 발생했습니다." });
    }
});

// 사진 업로드
app.post("/upload", uploadSinglePhoto, async (req, res) => {
    const userId = req.session.userId; 
    const memo = req.body.memo || null; // 메모는 선택사항
    
    // 로그인 안되어있으면 업로드 불가
    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다. 사진을 저장할 수 없습니다." });
    }
    
    try {
        // 파일 첨부 여부 확인
        if (!req.file) {
            return res.status(400).json({ error: "파일이 없습니다." });
        }

        if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: "이미지 파일만 업로드할 수 있습니다." });
        }
        
        // Cloudinary에 이미지 업로드 (buffer → URL)
        const result = await uploadToCloudinary(req.file.buffer);
        const imageUrl = result.secure_url; // HTTPS URL
        
        // photos 테이블에 사진 정보 저장
        const [insertResult] = await db.promise().query(
            "INSERT INTO photos (user_id, imageUrl, memo) VALUES (?, ?, ?)",
            [userId, imageUrl, memo]
        );
        
        // 업로드 보상으로 포인트 20점 지급
        await db.promise().query(
            "UPDATE users SET points = points + 20 WHERE id = ?",
            [userId]
        );
        
        res.status(201).json({ 
            message: "사진 업로드 및 포인트 적립 성공", 
            url: imageUrl,
            photo_id: insertResult.insertId // 방금 저장된 사진 ID
        });
    } catch (err) {
        console.error("업로드/DB 저장 실패:", err);
        res.status(500).json({ error: "업로드 및 DB 저장 실패: " + err.message });
    }
});

// 특정 사진 정보 조회 (쿼리 파라미터 사용)
// 예: /api/photo?photoId=123
app.get("/api/photo", async (req, res) => {
    const photoId = req.query.photoId; 
    const userId = req.session.userId;
    
    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    
    if (!photoId) {
        return res.status(400).json({ error: "photoId가 필요합니다." });
    }
    
    try {
        // 내 사진인지 확인하면서 정보 가져오기 (AND user_id = ?)
        const [rows] = await db.promise().query(
            "SELECT id, imageUrl FROM photos WHERE id = ? AND user_id = ?",
            [photoId, userId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "사진을 찾을 수 없습니다." });
        }
        
        res.status(200).json({ imageUrl: rows[0].imageUrl }); 
    } catch (error) {
        console.error("특정 사진 조회 오류:", error);
        res.status(500).json({ error: "사진 정보를 불러오는 중 오류가 발생했습니다." });
    }
});

// 구매 가능한 아이템(스티커) 목록
app.get("/api/items", async (req, res) => {
    try {
        // items 테이블에서 모든 스티커 정보 가져오기
        const [rows] = await db.promise().query(
            "SELECT id, name, emoji, price FROM items"
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error("아이템 조회 오류:", error);
        res.status(500).json({ error: "아이템을 불러오는 중 오류가 발생했습니다." });
    }
});

// 특정 사진 상세 정보 (경로 파라미터 사용)
// 예: /api/photos/123
app.get("/api/photos/:photoId", async (req, res) => {
    const userId = req.session.userId;
    const photoId = req.params.photoId; // URL 경로에서 추출
    
    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    
    try {
        // 메모와 업로드 날짜까지 포함해서 조회
        const [rows] = await db.promise().query(
            "SELECT id, imageUrl, memo, created_at FROM photos WHERE id = ? AND user_id = ?",
            [photoId, userId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "사진을 찾을 수 없습니다." });
        }
        
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error("사진 조회 오류:", error);
        res.status(500).json({ error: "사진을 불러오는 중 오류가 발생했습니다." });
    }
});

// 특정 사진에 붙인 스티커들 조회
app.get("/api/decorations/:photoId", async (req, res) => {
    const userId = req.session.userId;
    const photoId = req.params.photoId;
    
    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    
    try {
        // 내 사진인지 먼저 확인 (보안)
        const [photoCheck] = await db.promise().query(
            "SELECT id FROM photos WHERE id = ? AND user_id = ?",
            [photoId, userId]
        );
        
        if (photoCheck.length === 0) {
            return res.status(404).json({ error: "사진을 찾을 수 없습니다." });
        }
        
        // 해당 사진에 붙어있는 스티커 정보들 (위치, 크기, 회전값 포함)
        const [decorations] = await db.promise().query(
            "SELECT item_id, x, y, scale, rotation FROM decorations WHERE photo_id = ?",
            [photoId]
        );
        
        res.status(200).json(decorations);
    } catch (error) {
        console.error("꾸미기 데이터 조회 오류:", error);
        res.status(500).json({ error: "꾸미기 데이터를 불러오는 중 오류가 발생했습니다." });
    }
});

// 사진 꾸미기 (새 스티커 추가)
app.post("/api/decorate/add", async (req, res) => {
    const userId = req.session.userId;
    const { photoId, decorations } = req.body; // totalPrice는 서버에서 직접 계산
    const newDecorations = Array.isArray(decorations) ? decorations : [];

    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    if (!photoId || newDecorations.length === 0) {
        return res.status(400).json({ error: "저장할 스티커가 없습니다." });
    }

    const itemIds = newDecorations.map(d => Number(d.item_id));
    if (itemIds.some(id => !Number.isInteger(id) || id <= 0)) {
        return res.status(400).json({ error: "올바르지 않은 스티커 정보가 포함되어 있습니다." });
    }

    console.log('꾸미기 추가 요청:', { photoId, decorationsCount: newDecorations.length });

    try {
        // Fix 2: 사진이 로그인한 사용자 소유인지 확인
        const [photoCheck] = await db.promise().query(
            "SELECT id FROM photos WHERE id = ? AND user_id = ?",
            [photoId, userId]
        );
        if (photoCheck.length === 0) {
            return res.status(404).json({ error: "사진을 찾을 수 없습니다." });
        }

        // Fix 1: 클라이언트 totalPrice 대신 서버에서 직접 가격 계산
        const [itemRows] = await db.promise().query(
            "SELECT id, price FROM items WHERE id IN (?)",
            [itemIds]
        );
        const priceMap = {};
        itemRows.forEach(item => { priceMap[item.id] = item.price; });

        const hasMissingItem = itemIds.some(id => priceMap[id] === undefined);
        if (hasMissingItem) {
            return res.status(400).json({ error: "존재하지 않는 스티커가 포함되어 있습니다." });
        }

        const totalPrice = newDecorations.reduce((sum, d) => sum + priceMap[Number(d.item_id)], 0);
        const connection = await db.promise().getConnection();

        try {
            await connection.beginTransaction();

            // Fix 5: SELECT + UPDATE 분리 대신 WHERE points >= ? 로 원자적 차감
            const [updateResult] = await connection.query(
                "UPDATE users SET points = points - ? WHERE id = ? AND points >= ?",
                [totalPrice, userId, totalPrice]
            );

            if (updateResult.affectedRows === 0) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: "포인트가 부족합니다." });
            }

            // 새로운 스티커들 DB에 저장 (기존 것은 그대로 유지)
            for (const deco of newDecorations) {
                await connection.query(
                    "INSERT INTO decorations (photo_id, item_id, x, y, scale, rotation) VALUES (?, ?, ?, ?, ?, ?)",
                    [photoId, Number(deco.item_id), deco.x, deco.y, deco.scale, deco.rotation]
                );
            }

            // 변경된 포인트 다시 조회해서 반환
            const [updatedUser] = await connection.query(
                "SELECT points FROM users WHERE id = ?",
                [userId]
            );

            await connection.commit();
            connection.release();

            console.log('꾸미기 추가 성공:', { remainingPoints: updatedUser[0].points });

            res.status(200).json({
                success: true,
                remainingPoints: updatedUser[0].points
            });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error("꾸미기 추가 오류:", error);
        res.status(500).json({ error: "저장 중 오류가 발생했습니다: " + error.message });
    }
});

app.post("/api/decorate/complete", (req, res) => {
    res.status(410).json({ error: "이전 꾸미기 저장 API는 더 이상 사용하지 않습니다. /api/decorate/add를 사용해주세요." });
});

// 사진 메모 수정
app.put("/api/photos/:photoId/memo", async (req, res) => {
    const userId = req.session.userId;
    const photoId = req.params.photoId;
    const { memo } = req.body;
    
    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    
    try {
        // 내 사진인지 확인
        const [photoCheck] = await db.promise().query(
            "SELECT id FROM photos WHERE id = ? AND user_id = ?",
            [photoId, userId]
        );
        
        if (photoCheck.length === 0) {
            return res.status(404).json({ error: "사진을 찾을 수 없습니다." });
        }
        
        // 메모 업데이트
        await db.promise().query(
            "UPDATE photos SET memo = ? WHERE id = ? AND user_id = ?",
            [memo, photoId, userId]
        );
        
        res.status(200).json({ success: true, message: "메모가 수정되었습니다." });
    } catch (error) {
        console.error("메모 수정 오류:", error);
        res.status(500).json({ error: "메모 수정 중 오류가 발생했습니다." });
    }
});

// 포인트 적립 (10번 클릭 = 1포인트)
app.post("/api/points/earn", async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    const now = Date.now();
    if (req.session.lastPointEarnedAt && now - req.session.lastPointEarnedAt < 1000) {
        return res.status(429).json({ error: "잠시 후 다시 포인트를 받을 수 있습니다." });
    }

    try {
        req.session.lastPointEarnedAt = now;

        // 포인트 1점 추가
        await db.promise().query(
            "UPDATE users SET points = points + 1 WHERE id = ?",
            [userId]
        );

        // 업데이트된 포인트 조회
        const [rows] = await db.promise().query(
            "SELECT points FROM users WHERE id = ?",
            [userId]
        );

        console.log(`포인트 적립 성공: User ${userId}, 새 포인트: ${rows[0].points}`);

        res.status(200).json({
            success: true,
            newPoints: rows[0].points
        });
    } catch (error) {
        console.error("포인트 적립 오류:", error);
        res.status(500).json({ error: "포인트 적립 중 오류가 발생했습니다." });
    }
});
// 서버 시작
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
