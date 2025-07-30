const { DataTypes, Sequelize } = require('sequelize');
const db = require('../tools/db');

module.exports = db.define('master_file_song', {
    id_song: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    ext: {
        type: DataTypes.STRING(10),
    },
    vod: {
        type: DataTypes.ENUM(['1', '2']),
    },
    md5_checksum: {
        type: DataTypes.TEXT
    },
    dir: {
        type: DataTypes.STRING(255),
    }
},
    {
        freezeTableName: true,
        timestamps: false
    }
);