const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config();

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.STORAGE_ENDPOINT,
    credentials: {
        accessKeyId: process.env.ACCES_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
    },
});

module.exports = s3;