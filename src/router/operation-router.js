const { uploadFile, deleteFile, listFile, generateDownloadLink } = require('../controller/operation-controller');

const express = require('express');
const operationRoute = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

operationRoute.post('/upload', upload.single('file'), uploadFile);
operationRoute.post('/delete', deleteFile);
operationRoute.get('/list', listFile);
operationRoute.post('/generate-download', generateDownloadLink);

module.exports = operationRoute;