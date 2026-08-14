const CLOUDINARY_CLOUD_NAME = 'dpgf1rkjl';
const CLOUDINARY_UPLOAD_PRESET = 'unsigned_preset';

export const uploadImage = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error('Image upload failed');
  }

  const data = await response.json();
  return data.secure_url;
};

export const uploadPDF = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error('PDF upload failed');
  }

  const data = await response.json();
  return data.secure_url;
};

export const uploadFile = async (file: File): Promise<string> => {
  if (file.type.startsWith('image/')) {
    return uploadImage(file);
  } else {
    return uploadPDF(file);
  }
};

// Encrypted Vault documents upload as opaque ciphertext, not a valid
// image/PDF, so they go through Cloudinary's raw resource type instead.
export const uploadRaw = async (blob: Blob, filename: string): Promise<string> => {
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error('Encrypted file upload failed');
  }

  const data = await response.json();
  return data.secure_url;
};