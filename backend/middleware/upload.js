const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

const createDirIfNotExist = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

createDirIfNotExist(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = file.mimetype.split('/')[0] || 'other';
    const typeDir = path.join(uploadsDir, type);
    createDirIfNotExist(typeDir);
    cb(null, typeDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  }
});

const ALLOWED_MIMES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac', 'audio/aac'],
  document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  text: ['text/plain', 'text/csv', 'text/html', 'text/javascript'],
  archive: ['application/zip', 'application/x-rar-compressed', 'application/gzip']
};

const allowedMimes = Object.values(ALLOWED_MIMES).flat();

const fileFilter = (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}. Allowed: images, videos, audio, documents, archives.`), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
    files: 10
  },
  fileFilter
});

const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 200MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 10.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

const cleanupOldFiles = (maxAgeHours = 24) => {
  const walkDir = (dir) => {
    const files = fs.readdirSync(dir);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath);
      } else {
        const age = (now - stat.mtimeMs) / (1000 * 60 * 60);
        if (age > maxAgeHours && !file.startsWith('.keep')) {
          fs.unlinkSync(filePath);
          console.log('Cleaned up old file:', filePath);
        }
      }
    }
  };

  try {
    walkDir(uploadsDir);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
};

module.exports = { upload, handleUploadErrors, cleanupOldFiles, uploadsDir };
