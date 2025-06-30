const { DataTypes, Sequelize } = require('sequelize');
const db = require('../tools/db');

module.exports = db.define('master_file_song', {
    id_song: {
        type: DataTypes.STRING,
        allowNull: false
    },
    id_cloud: {
        type: DataTypes.STRING(50),
        primaryKey: true
    },
    last_accessed: {
        type: DataTypes.DATE
    },
    last_blocked: {
        type: DataTypes.DATE
    },
    vod: {
        type: DataTypes.ENUM(['1', '2']),
    },
    ext: {
        type: DataTypes.STRING(10),
    },
    web_content_link: {
        type: DataTypes.TEXT
    },
    md5_checksum: {
        type: DataTypes.TEXT
    },
},
    {
        freezeTableName: true,
        timestamps: false
    }
);