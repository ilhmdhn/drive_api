const { PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const folderId = process.env.DRIVE_FOLDER_ID;
const crypto = require('crypto');
const s3 = require("../tools/storage");
const masterFileTable = require('../model/master_file');

const uploadFile = async (req, res) => {
    const cleanup = () => {
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
                console.log(`File ${req.file.path} deleted successfully.`);
            } catch (err) {
                console.error(`Failed to delete file ${req.file.path}:`, err.message);
            }
        }
    };

    try {
        if (req.body.vod != '1' && req.body.vod != '2') {
            cleanup();
            return res.status(400).json({ error: 'VOD not defined.' });
        }

        if (!req.file) {
            cleanup();
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        if (!folderId) {
            cleanup();
            return res.status(500).json({ error: 'DRIVE_FOLDER_ID not set in .env file.' });
        }

        const originalFileName = req.file.originalname;
        const songId = path.parse(originalFileName).name;
        const songExt = path.extname(originalFileName).substring(1);;
        const finalFileNameInDrive = `${songId}.${songExt}`;
        const vod = req.body.vod;
        const localMd5Hash = await calculateMD5Hash(req.file.path);
        const fileStream = fs.createReadStream(req.file.path);
        const dirStorage = `vod${vod}/${finalFileNameInDrive}`;
        await s3.send(
            new PutObjectCommand({
                Bucket: `song`,
                Key: dirStorage,
                Body: fileStream,
                ContentType: "application/octet-stream"
            })
        );

        cleanup()
        await masterFileTable.create({
            id_song: songId,
            ext: songExt,
            vod: vod,
            md5_checksum: localMd5Hash,
            dir: dirStorage,
        });
        res.status(200).json({
            message: `Upload Successfully ${localMd5Hash}`,
        });

    } catch (error) {
        console.error(`
            Error: ${error}
            message: ${error.message}
            stack: ${error.stack}
        `);
        return res.status(501).json({ error: error.message });
    }
}

const listFile = async (req, res) => {
    try {
        const result = await s3.send(
            new ListObjectsV2Command({
                Bucket: "song",
            })
        );
        console.log(result);
        res.status(200).json({
            message: 'Success',
            data: result,
            state: true
        });
    } catch (error) {
        console.error(`
            Error: ${error}
            message: ${error.message}
            stack: ${error.stack}
        `);
        res.status(500).json({
            state: false,
            message: `listFile Error ${error}`
        });
    }
}

const deleteFile = async (req, res) => {
    try {
        const filePath = req.body.filepath;
        if (!filePath) {
            return res.status(400).json({ state: false, message: 'No id.' });
        }

        await s3.send(
            new DeleteObjectCommand({
                Bucket: "song",
                Key: filePath,
            })
        );

        masterFileTable.destroy({
            where: {
                dir: filePath
            }
        });

        res.status(200).json({
            state: true,
            message: 'Delete Successfully',
        });
    } catch (error) {
        console.error(`
            Error: ${error}
            message: ${error.message}
            stack: ${error.stack}
        `);
        return res.status(501).json({ state: false, message: error.message });
    }
}

const generateDownloadLink = async (req, res) => {
    try {
        const filePath = req.body.filepath;
        const baseUrl = process.env.PUBLIC_CDN;
        if (!filePath) {
            return res.status(400).json({ state: false, message: 'File path is required' });
        }

        return res.status(200).json({ state: true, message: `${baseUrl}/${filePath}` });
    } catch (error) {
        return res.status(501).json({ state: false, message: error.message });
    }
}

function calculateMD5Hash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', err => reject(err));
    });
}

module.exports = {
    uploadFile,
    deleteFile,
    listFile,
    generateDownloadLink
};