const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.SERVER_PORT;

const operationRouter = require('./src/router/operation-router');

app.use('/song', operationRouter);

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});