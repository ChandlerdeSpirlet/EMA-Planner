const pgp = require('pg-promise')();

const dbConfig = process.env.DATABASE_URL;
const db = pgp(dbConfig);

module.exports = db;