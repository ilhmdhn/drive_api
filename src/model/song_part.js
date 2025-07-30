const { DataTypes, Sequelize } = require('sequelize');
const db = require('../tools/db');

module.exports = db.define('song_part', {
    reference_files: {
        type: DataTypes.STRING(100),
        primaryKey: true,
        allowNull: false
    },
    file_id: {
        type: DataTypes.STRING(255),
    },
    filename: {
        type: DataTypes.STRING(255),
    },
    number: {
        type: DataTypes.INTEGER(3),
        primaryKey: true
    },
},
    {
        freezeTableName: true,
        timestamps: false
    }
);