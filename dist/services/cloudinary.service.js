import { Readable } from "node:stream";
import { cloudinary } from "../config/cloudinary.js";
export function uploadImage(buffer, folder) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
            folder: `skillcircle/${folder}`,
            resource_type: "image",
        }, (error, result) => {
            if (error || !result) {
                reject(error ?? new Error("Cloudinary upload failed"));
                return;
            }
            resolve({
                secure_url: result.secure_url,
                public_id: result.public_id,
                resource_type: result.resource_type,
            });
        });
        Readable.from(buffer).pipe(uploadStream);
    });
}
//# sourceMappingURL=cloudinary.service.js.map