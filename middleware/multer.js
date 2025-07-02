import multer from "multer";
import path from "path";
import fs from "fs"; 

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderPath = `${req.directory || "uploads"}`; //Dynamic folder path and default is upload directory
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        cb(null, folderPath);
        
    },filename: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        cb(null, `${Date.now()}${fileExtension}`);
    },
});

const fileFilter = (req, file, cb) => {
    if(req.allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Only JPG, JPEG, or PNG files are allowed"), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB file size limit
    fileFilter,
});

export default upload;
