// 📦 필요한 모듈 불러오기
const express = require("express");          // 웹 서버를 만들기 위한 프레임워크
const multer = require("multer");            // 파일 업로드를 쉽게 도와주는 미들웨어
const dotenv = require("dotenv");            // .env 파일에서 환경변수 읽기
const streamifier = require("streamifier");  // 버퍼를 스트림으로 바꿔주는 유틸
const { v2: cloudinary } = require("cloudinary"); // Cloudinary API (v2 버전 사용)

// 🌱 .env 파일에 있는 환경변수 로드
dotenv.config();

// ☁️ Cloudinary 계정 정보 설정 (.env 파일에서 불러옴)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,  // 예: my-cloud
  api_key: process.env.CLOUDINARY_API_KEY,        // 발급받은 API 키
  api_secret: process.env.CLOUDINARY_API_SECRET,  // 보안용 API 시크릿
});

// 🚀 Express 앱 생성
const app = express();

// 📦 multer 설정: 메모리 저장소에 파일 저장 (임시로 서버 메모리에 보관)
const upload = multer({ storage: multer.memoryStorage() });

// 🌐 정적 파일 제공 설정: np_mypic 폴더 안의 index.html 등 클라이언트 파일 제공
// 이 설정 덕분에 http://localhost:5000/index.html 이렇게 열 수 있음
app.use(express.static("np_mypic"));


// 📤 버퍼 데이터를 Cloudinary로 업로드하는 함수
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    // Cloudinary 업로드 스트림 생성
    const stream = cloudinary.uploader.upload_stream(
      { folder: "mypic_uploads" }, // 업로드할 Cloudinary 폴더 지정
      (error, result) => {
        if (error) return reject(error); // 에러 시 거부
        resolve(result);                 // 성공 시 결과 반환
      }
    );

    // 파일 버퍼를 스트림으로 만들어서 Cloudinary로 전송
    streamifier.createReadStream(buffer).pipe(stream);
  });
};


// 📩 파일 업로드 API 라우트
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // 요청에 파일이 없으면 에러 응답
    if (!req.file) {
      return res.status(400).json({ error: "파일이 없습니다." });
    }

    // 업로드 실행 (버퍼를 Cloudinary로 전송)
    const result = await uploadToCloudinary(req.file.buffer);

    // 업로드된 이미지의 URL을 JSON으로 응답
    res.json({ url: result.secure_url });

  } catch (err) {
    // 에러 발생 시 서버 로그와 함께 에러 응답
    console.error("업로드 실패:", err);
    res.status(500).json({ error: "업로드 실패: " + err.message });
  }
});


// 🟢 서버 실행
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
