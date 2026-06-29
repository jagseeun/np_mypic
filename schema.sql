CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  imageUrl TEXT NOT NULL,
  memo TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_photos_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  emoji VARCHAR(16) NOT NULL,
  price INT NOT NULL DEFAULT 0
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS decorations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  photo_id INT NOT NULL,
  item_id INT NOT NULL,
  x DOUBLE NOT NULL DEFAULT 0,
  y DOUBLE NOT NULL DEFAULT 0,
  scale DOUBLE NOT NULL DEFAULT 1,
  rotation DOUBLE NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_decorations_photo
    FOREIGN KEY (photo_id) REFERENCES photos(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_decorations_item
    FOREIGN KEY (item_id) REFERENCES items(id)
);

INSERT IGNORE INTO items (name, emoji, price)
VALUES
  ('하트', '💖', 10),
  ('별', '⭐', 15),
  ('리본', '🎀', 20),
  ('꽃', '🌸', 25),
  ('좋아요', '👍', 10),
  ('백점', '💯', 30),
  ('똥', '💩', 5),
  ('블랙하트', '🖤', 10);
