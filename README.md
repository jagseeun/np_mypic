# NP MyPic

사진을 업로드하고, 메모를 남기고, 포인트로 사진을 꾸밀 수 있는 개인 갤러리 웹앱입니다.  
Node.js/Express 서버와 MySQL 세션·데이터 저장, Cloudinary 이미지 업로드를 연결해 로그인부터 사진 관리까지 한 흐름으로 구성했습니다.

## 주요 기능

- 회원가입, 로그인, 로그아웃
- 사용자별 사진 업로드 및 Cloudinary 저장
- 사진별 메모 작성, 수정, 메모 기반 검색
- 내 사진 목록과 상세 보기
- 업로드/클릭 활동 기반 포인트 적립
- 포인트를 사용한 사진 꾸미기 아이템 추가
- Express session과 MySQLStore 기반 로그인 상태 관리

## 기술 스택

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js, Express
- **Database**: MySQL, mysql2, express-mysql-session
- **Auth/Session**: express-session, bcrypt
- **File Upload**: multer, Cloudinary, streamifier
- **Config**: dotenv

## 실행 방법

```bash
npm install
npm start
```

서버는 기본적으로 `http://localhost:5000`에서 실행됩니다. `PORT` 환경 변수를 설정하면 다른 포트로 실행할 수 있습니다.

## 환경 변수

프로젝트 루트에 `.env` 파일을 만들고 아래 값을 설정합니다.

```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=mypic
DB_PORT=3307
PORT=5000

SESSION_SECRET=your_session_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
NODE_ENV=development
```

개발 환경에서는 일부 기본값이 코드에 지정되어 있지만, 실제 배포나 공개 환경에서는 반드시 별도의 환경 변수를 사용해야 합니다.

## 폴더 구조

```text
.
├── server.js              # Express 서버와 API 라우트
├── package.json           # 실행 스크립트와 의존성
├── np_mypic/
│   ├── index.html         # 로그인/회원가입
│   ├── main.html          # 갤러리 메인
│   ├── test.html          # 사진 업로드
│   ├── check.html         # 사진 상세 보기
│   ├── decorate.html      # 사진 꾸미기
│   ├── memo.html          # 메모 수정
│   ├── point.html         # 포인트 적립
│   └── app.css            # 공통 스타일
├── screenshots/           # 화면 캡처 이미지
└── uploads/               # 로컬 업로드 보관용 폴더
```

## 데이터베이스

서버 코드는 사용자, 사진, 꾸미기 아이템, 세션 정보를 MySQL에 저장합니다. 실행 전 `schema.sql`을 참고해 `users`, `photos`, `decorations`, `items` 등 API에서 사용하는 테이블을 준비해야 합니다.

## 포트폴리오 포인트

- 파일 업로드, 외부 이미지 스토리지, DB 저장을 연결한 풀스택 흐름
- 세션 기반 인증과 사용자별 데이터 분리
- 포인트 차감 로직을 원자적 `UPDATE`로 처리해 중복 사용을 방지
- 단순 갤러리를 넘어서 검색, 메모, 꾸미기까지 확장한 사용자 경험

## 주의사항

- `.env`와 API 키, DB 비밀번호는 커밋하지 않습니다.
- `npm test`는 `server.js` 문법 검증을 실행합니다.
- 운영 환경에서는 반드시 `SESSION_SECRET`을 직접 설정해야 합니다.
