const { uploadFile, downloadFile, deleteFile } = require('../controller/operation-controller');

const express = require('express');
const operationRoute = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

operationRoute.post('/upload', upload.single('file'), uploadFile);
operationRoute.get('/download', downloadFile);
operationRoute.delete('/delete', deleteFile);

module.exports = operationRoute;