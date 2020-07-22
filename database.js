var pgp = require('pg-promise')();

var dbConfig = process.env.DATABASE_URL;
var db = pgp(dbConfig);

module.exports = db;
