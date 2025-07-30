const drive = require('../../config/auth');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const masterFileTable = require('../model/master_file');
const masterPartFileTable = require('../model/song_part');
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

        const localMd5Hash = await calculateMD5Hash(req.file.path);

        const listSplitFile = await splitFile(originalFileName, req.file.path);
        console.log('returnyaa');
        console.log(listSplitFile);
        await uploadAndDuplicates(listSplitFile, songId, songExt, localMd5Hash, req.body.vod);
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

const uploadAndDuplicates = async (files, songId, ext, hash, vod) => {
    try {
        for (const file of files) {

            console.log('split' + file)
            const filePath = path.join('split', file.fileName)

            const media = {
                mimeType: 'application/octet-stream',
                body: fs.createReadStream(filePath),
            };
            const originalFileMetadata = {
                name: file.fileName,
                parents: [folderId],
            };
            const originalUploadResponse = await drive.files.create({
                resource: originalFileMetadata,
                media: media,
                fields: 'id, name, webContentLink'
            });

            const originalFileId = originalUploadResponse.data.id;
            await drive.permissions.create({
                fileId: originalFileId,
                requestBody: { role: 'reader', type: 'anyone' },
            });

            await masterPartFileTable.create({
                reference_files: `${songId}-0`,
                file_id: originalFileId,
                filename: file.fileName,
                number: file.number
            });
        }

        await masterFileTable.create({
            id_song: songId,
            ext: ext,
            reference_files: `${songId}-0`,
            vod: vod,
            md5_checksum: hash
        });
        duplicateFile(`${songId}-0`);
    } catch (error) {
        throw `Gagal upload master file ${error} ${error.stack}`;
    }
}


const duplicateFile = async (idReferences) => {
    try {
        const master = await masterFileTable.findOne({
            where: {
                reference_files: idReferences
            },
            raw: true
        });

        console.log(master);

    } catch (error) {
        console.error('asdmaow' + error.message);
    }
}

async function splitFile(fileName, filePath, chunkSizeMB = 90, outputDir = 'split') {
    const chunkSize = chunkSizeMB * 1024 * 1024;

    await fs.promises.mkdir(outputDir, { recursive: true });

    const readStream = fs.createReadStream(filePath);
    let partIndex = 1;
    let currentPartSize = 0;
    let writeStream = null;

    const result = [];

    return new Promise((resolve, reject) => {
        readStream.on('data', (chunk) => {
            if (!writeStream || currentPartSize + chunk.length > chunkSize) {
                if (writeStream) {
                    writeStream.end();
                }

                const partFileName = `${fileName}.part${partIndex}`;
                const partFilePath = path.join(outputDir, partFileName);

                writeStream = fs.createWriteStream(partFilePath);
                result.push({ fileName: partFileName, number: partIndex });
                partIndex++;
                currentPartSize = 0;
            }

            writeStream.write(chunk);
            currentPartSize += chunk.length;
        });

        readStream.on('end', () => {
            if (writeStream) {
                writeStream.end();
            }
            resolve(result);
        });

        readStream.on('error', (err) => {
            console.error('Error saat membaca file:', err);
            reject(err);
        });
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