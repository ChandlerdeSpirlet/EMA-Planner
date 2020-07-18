var express = require('express');
var app = express();
var path = require('path');
var exp_val = require('express-validator');
var session = require("express-session");
const fastcsv = require("fast-csv");
var fs = require('fs');
var nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
//var db = require('../database');
const cors = require('cors');
app.use(cors())

module.exports = app;
app.use(session({
    secret: 'EMA_Planner',
    resave: false,
    saveUninitialized: true,
    cookie: {maxAge: 8 * 60 * 1000}
}));
app.use(
    bodyParser.urlencoded({
        extended: true,
    })
)
app.use(bodyParser.json())
//app.use(exp_val());
app.use(express.static(path.join(__dirname, 'store')));
app.get('/', function(req, res){
    res.render('home/home', {
    })
});