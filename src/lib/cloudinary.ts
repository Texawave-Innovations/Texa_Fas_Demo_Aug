// src/lib/cloudinary.ts
export const CLOUDINARY_CLOUD_NAME = "dpgf1rkjl";
export const CLOUDINARY_UPLOAD_PRESET = "unsigned_preset";

// For images
export const CLOUDINARY_IMAGE_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// For PDFs/resumes (raw files)
export const CLOUDINARY_RAW_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
