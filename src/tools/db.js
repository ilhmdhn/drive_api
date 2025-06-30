const { Sequelize } = require('sequelize');
require('dotenv').config();

module.exports = new Sequelize(process.env.DATABASE_NAME, process.env.DATABASE_USER, process.env.DATABASE_PASSWORD, {
    host: process.env.DATABASE_SERVER,
    port: process.env.DATABASE_PORT,
    logging: false,
    dialect: 'mysql',
    dialectOptions: {
        connectTimeout: 3000,
    },
    timezone: '+00:00',
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
});