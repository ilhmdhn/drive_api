const drive = require('../../config/auth');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const masterFileTable = require('../model/master_file');
const folderId = process.env.DRIVE_FOLDER_ID;
const crypto = require('crypto');
const multer = require('multer');
const splitDir = multer({ dest: 'split/' });

const uploadFile = async (req, res) => {
    const cleanup = () => {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
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
        const numCopies = 5;
        const localMd5Hash = await calculateMD5Hash(req.file.path);

        const originalFileMetadata = {
            name: finalFileNameInDrive,
            parents: [folderId],
        };

        const media = {
            mimeType: req.file.mimetype,
            body: fs.createReadStream(req.file.path),
        };
        splitFile(req.file.path);
        // const originalUploadResponse = await drive.files.create({
        //     resource: originalFileMetadata,
        //     media: media,
        //     fields: 'id, name, webContentLink, webViewLink, md5Checksum',
        // });

        // const originalFileId = originalUploadResponse.data.id;
        // console.log(`Original file uploaded with ID: ${originalFileId}`);

        // const driveMd5Hash = originalUploadResponse.data.md5Checksum;
        // if (localMd5Hash !== driveMd5Hash) {
        //     console.error(`MD5 mismatch for original file ${originalFileId}! Deleting from Drive.`);
        //     await drive.files.delete({ fileId: originalFileId });
        //     cleanup();
        //     return res.status(500).json({ error: 'Upload failed: File integrity check mismatch.' });
        // }

        // await drive.permissions.create({
        //     fileId: originalFileId,
        //     requestBody: { role: 'reader', type: 'anyone' },
        // });

        // await masterFileTable.create({
        //     id_song: songId,
        //     ext: songExt,
        //     id_cloud: originalFileId,
        //     vod: req.body.vod,
        //     web_content_link: originalUploadResponse.data.webContentLink,
        //     md5_checksum: localMd5Hash,
        // });

        // for (let i = 1; i <= numCopies; i++) {
        //     const copyMetadata = {
        //         name: finalFileNameInDrive,
        //         parents: [folderId],
        //     };

        //     const copyResponse = await drive.files.copy({
        //         fileId: originalFileId,
        //         resource: copyMetadata,
        //         fields: 'id, name, webContentLink, md5Checksum',
        //     });

        //     const copyId = copyResponse.data.id;

        //     await masterFileTable.create({
        //         id_song: songId,
        //         ext: songExt,
        //         id_cloud: copyId,
        //         vod: req.body.vod,
        //         web_content_link: copyResponse.data.webContentLink,
        //         md5_checksum: localMd5Hash,
        //     });

        //     await drive.permissions.create({
        //         fileId: copyId,
        //         requestBody: { role: 'reader', type: 'anyone' },
        //     });
        // }

        console.log('All copies created and made public. Total files available for download:');
        cleanup()
        res.status(200).json({
            message: 'Upload Successfully',
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

async function splitFile(filePath, chunkSizeMB = 90, outputDir = splitDir) {
    const fileName = path.basename(filePath);
    const chunkSize = chunkSizeMB * 1024 * 1024;
    const readStream = fs.createReadStream(filePath);
    let partIndex = 1;
    let currentPartSize = 0;
    let writeStream = null;

    const manifest = {
        originalFileName: fileName,
        totalParts: 0,
        partPrefix: `${fileName}.part`,
        parts: [],
        originalFileSize: (await fs.promises.stat(filePath)).size
    };

    readStream.on('data', async (chunk) => {
        if (!writeStream || currentPartSize + chunk.length > chunkSize) {
            if (writeStream) {
                writeStream.end(); // Selesaikan writeStream sebelumnya
                manifest.parts[manifest.parts.length - 1].size = currentPartSize;
            }
            // Buat writeStream baru untuk part berikutnya
            const partFileName = `${outputDir}/${fileName}.part${partIndex}`;
            writeStream = fs.createWriteStream(partFileName);
            manifest.parts.push({ number: partIndex, fileName: path.basename(partFileName), size: 0 /* akan diupdate */ });
            partIndex++;
            currentPartSize = 0;
        }
        writeStream.write(chunk);
        currentPartSize += chunk.length;
    });

    readStream.on('end', async () => {
        if (writeStream) {
            writeStream.end();
            manifest.parts[manifest.parts.length - 1].size = currentPartSize;
        }
        manifest.totalParts = partIndex - 1;
        // Tulis file manifest
        await fs.promises.writeFile(path.join(outputDir, `${fileName}.manifest.json`), JSON.stringify(manifest, null, 2));
        console.log(`File pecah selesai. ${manifest.totalParts} bagian dibuat.`);
    });

    readStream.on('error', (err) => {
        console.error('Error saat membaca file:', err);
    });
}

const downloadFile = async (req, res) => {
    try {
        const id = req.query.id;
        const vod = req.query.vod;

        if (vod != '1' && vod != '2') {
            return res.status(400).json({ error: 'VOD not defined.' });
        }

        if (!id) {
            return res.status(400).json({ error: 'No id.' });
        }

        const files = await masterFileTable.findAll({
            where: {
                id_song: id,
                vod: vod
            },
            raw: true
        });

        const RETRY_INTERVAL_MS = 60 * 60 * 1000;
        const now = Date.now();

        files.sort((a, b) => {
            if (a.last_accessed === null && b.last_accessed !== null) {
                return -1;
            }

            if (a.last_accessed !== null && b.last_accessed === null) {
                return 1;
            }

            // --- PRIORITAS 2: Status Diblokir (setelah prioritas 1) ---
            const aIsBlocked = a.last_blocked && (now - a.last_blocked.getTime()) < RETRY_INTERVAL_MS;
            const bIsBlocked = b.last_blocked && (now - b.last_blocked.getTime()) < RETRY_INTERVAL_MS;

            // Jika A diblokir dan B tidak, B lebih diutamakan
            if (aIsBlocked && !bIsBlocked) return 1;
            // Jika B diblokir dan A tidak, A lebih diutamakan
            if (!aIsBlocked && bIsBlocked) return -1;

            // --- PRIORITAS 3: Urutkan berdasarkan last_accessed timestamp (oldest first) ---
            const aAccessTime = a.last_accessed ? a.last_accessed.getTime() : 0;
            const bAccessTime = b.last_accessed ? b.last_accessed.getTime() : 0;

            return aAccessTime - bAccessTime;
        });

        const choosedFile = files[0];
        masterFileTable.update({
            last_accessed: now
        },
            {
                where: {
                    id_cloud: choosedFile.id_cloud
                }
            });
        return res.status(200).send(choosedFile.web_content_link);
    } catch (error) {
        return res.status(501).json({ error: error.message });
    }
}

const deleteFile = async (req, res) => {
    try {
        const id = req.query.id;
        const vod = req.query.vod;

        if (vod != '1' && vod != '2') {
            return res.status(400).json({ error: 'VOD not defined.' });
        }

        if (!id) {
            return res.status(400).json({ error: 'No id.' });
        }

        const files = await masterFileTable.findAll({
            where: {
                id_song: id,
                vod: vod
            },
            raw: true
        });

        for (let file of files) {
            await drive.files.delete({ fileId: file.id_cloud });
        }

        await masterFileTable.destroy({
            where: {
                id_song: id,
                vod: vod
            }
        })

        res.status(200).json({
            message: 'Delete Successfully',
        });
    } catch (error) {
        return res.status(501).json({ error: error.message });
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
    downloadFile,
    deleteFile
};